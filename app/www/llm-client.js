/**
 * llm-client.js
 * 《克勞德》v2.0 - P1-03 S2 LLM 呼叫、解析、驗證、重試、兜底
 *
 * 職責邊界：
 * - 提示詞組裝沿用 PromptAssembler（P1-02 六區塊；固定區塊本來就在前段）。
 * - 實際傳輸（API／官網自動化／測試替身）由呼叫層以 send 注入；本模組不碰金鑰與供應商。
 * - 回覆一律經 PromptAssembler.parseAndValidate；格式不合重試 1–2 次（預設 2 次＝最多 3 次嘗試），
 *   重試時把「格式修正」指示附加到 user／prompt；連線錯誤亦計入同一次數。
 * - 重試用盡或無傳輸可用 → PromptAssembler.getFallbackReply（預設台詞；affection_delta=0），
 *   永不因 LLM 格式問題向外丟例外。
 *
 * 快取友善切分（給 API／支援 system 前綴快取的傳輸用）：
 *   system＝固定區塊（人設／階段／好感帶／狀態），同一階段內不變 → 供應商可快取前綴
 *   user  ＝動態區塊（生活層／記憶）
 *   prompt＝原組裝順序全文（給網頁模式或單字串傳輸用；與 PromptAssembler.assemblePrompt 逐字相同）
 */

import { PromptAssembler } from './prompt-assembler.js';

/** 預設格式重試次數（不含第一次；config/reply_protocol.json retryRule：重試 1–2 次） */
export const DEFAULT_MAX_RETRIES = 2;
/** 固定／動態區塊鍵（順序即 system 內的固定前綴順序） */
export const SYSTEM_BLOCK_KEYS = Object.freeze(['character', 'stage', 'band', 'status']);
export const USER_BLOCK_KEYS = Object.freeze(['living', 'memory']);

function normalizeRetries(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_MAX_RETRIES;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_MAX_RETRIES;
  return Math.max(0, Math.min(5, n));
}

/**
 * 依六區塊切出「快取友善」的 system／user，同時保留完整 prompt。
 * @param {object} params 同 PromptAssembler.assemblePrompt
 * @returns {{system:string,user:string,prompt:string,blocks:Array}}
 */
export function buildPromptPayload({ state, livingSection = '', memorySection = '', styleTweaks = {} } = {}) {
  const safeState = state || {};
  const blocks = PromptAssembler.assemblePromptBlocks({ state: safeState, livingSection, memorySection, styleTweaks });
  const byKey = new Map(blocks.map(block => [block.key, block.text || '']));
  const joinKeys = keys => keys.map(key => byKey.get(key) || '').filter(Boolean).join('\n');
  return {
    system: joinKeys(SYSTEM_BLOCK_KEYS),
    user: joinKeys(USER_BLOCK_KEYS),
    // 與 PromptAssembler.assemblePrompt() 相同的順序與換行（測試釘死逐字等價）
    prompt: blocks.map(block => block.text).filter(Boolean).join('\n'),
    blocks
  };
}

/**
 * 重試時附加的格式修正指示（把上一次錯誤帶回給模型；長度截斷避免提示詞膨脹）。
 * @param {string} errorMessage
 */
export function buildRepairInstruction(errorMessage) {
  const reason = String(errorMessage || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return [
    '【格式修正】上一次回覆沒有通過驗證' + (reason ? `（原因：${reason}）` : '') + '。',
    '請只輸出一個合法 JSON 本體，不要 markdown 代碼塊、不要任何說明文字；',
    'text 必須是非空字串，emotion／action 必須在【回覆限制與格式協議】的白名單內，',
    'affection_delta 必須是協議範圍內的整數，flag 可為字串或 null。'
  ].join('');
}

function textFromSendResult(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value.text === 'string') return value.text;
  if (value && typeof value.raw === 'string') return value.raw;
  return '';
}

function applyFallbackPlaceholders(reply, state = {}) {
  const safeState = state || {};
  const playerName = safeState.playerName || '';
  const nickname = safeState.playerNickname || playerName;
  return {
    ...reply,
    text: String(reply.text || '')
      .replace(/{玩家名}/g, playerName || 'User')
      .replace(/{暱稱}/g, nickname || 'User')
  };
}

/**
 * 執行一次結構化回合：組裝 → 呼叫 → 解析／驗證 → 重試 → 兜底。
 *
 * @param {object} options
 * @param {object} options.state 遊戲狀態（stage／band／playerName／playerNickname）
 * @param {string} [options.livingSection] 生活層文字
 * @param {string} [options.memorySection] 長期記憶摘要
 * @param {object} [options.styleTweaks] 相處風格
 * @param {Function} options.send async ({attempt,system,user,prompt,repair,payload}) => string|{text}
 * @param {number} [options.maxRetries=2] 格式重試次數（0–5；總嘗試＝maxRetries+1）
 * @param {string} [options.situation='general'] 兜底情境（praised／user_tired／goodnight／...）
 * @param {Function} [options.onAttempt] 每次失敗後回呼（{attempt,error,willRetry}）
 * @returns {Promise<{data:object,meta:{attempts:number,usedFallback:boolean,errors:string[],stage:string,situation:string}>}>}
 */
export async function callStructuredTurn({
  state = {},
  livingSection = '',
  memorySection = '',
  styleTweaks = {},
  send,
  maxRetries = DEFAULT_MAX_RETRIES,
  situation = 'general',
  onAttempt = null
} = {}) {
  const safeState = state || {};
  const stage = safeState.stage || 'A';
  const retries = normalizeRetries(maxRetries);
  const totalAttempts = retries + 1;
  const errors = [];
  let payload = null;
  try {
    payload = buildPromptPayload({ state: safeState, livingSection, memorySection, styleTweaks });
  } catch (error) {
    errors.push('提示詞組裝失敗: ' + String(error?.message || error));
  }

  let lastError = null;
  for (let index = 0; index < totalAttempts; index++) {
    const attempt = index + 1;
    const repair = index === 0 ? '' : buildRepairInstruction(lastError?.message || '');
    try {
      if (typeof send !== 'function') throw new Error('未提供 LLM 傳輸函式');
      if (!payload) throw new Error(lastError?.message || '提示詞組裝失敗');
      const response = await send({
        attempt,
        system: payload.system,
        user: repair ? `${payload.user}\n\n${repair}` : payload.user,
        prompt: repair ? `${payload.prompt}\n\n${repair}` : payload.prompt,
        repair,
        payload
      });
      const parsed = PromptAssembler.parseAndValidate(textFromSendResult(response));
      if (!parsed.success) throw new Error(parsed.error || '回覆格式驗證失敗');
      return {
        data: parsed.data,
        meta: { attempts: attempt, usedFallback: false, errors, stage, situation }
      };
    } catch (error) {
      lastError = error;
      errors.push(`第 ${attempt} 次：` + String(error?.message || error));
      if (typeof onAttempt === 'function') {
        try {
          onAttempt({ attempt, error: lastError, willRetry: attempt < totalAttempts });
        } catch (_) { /* 回呼錯誤不影響回合 */ }
      }
    }
  }

  // 重試用盡／沒有傳輸：使用 config 的預設台詞，保證回傳結構完整。
  const fallback = applyFallbackPlaceholders(PromptAssembler.getFallbackReply(stage, situation), safeState);
  return {
    data: fallback,
    meta: { attempts: totalAttempts, usedFallback: true, errors, stage, situation }
  };
}
