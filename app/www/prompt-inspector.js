/**
 * prompt-inspector.js
 * 《克勞德》v2.0 - P1-02 開發者檢視（S2 提示詞組裝 ＋ AnimaVN 風格 Token 預算可視化）
 * 六區塊：人設／階段／好感帶／生活層／記憶／狀態。
 * 本模組為純資料＋字串渲染（不直接操作 DOM，掛載由 app.js 負責）；
 * 區塊開關僅影響「檢視預覽」，不會改變遊戲實際送出的提示詞。
 */

import { PromptAssembler } from './prompt-assembler.js';
import { ALL_CONFIGS } from './config-loader.js';

export const INSPECTOR_STORAGE_KEY = 'claude_v20_inspector_blocks_v1';
export const BLOCK_KEYS = ['character', 'stage', 'band', 'living', 'memory', 'status'];
export const CACHEABLE_BLOCK_KEYS = Object.freeze(['character', 'stage', 'band', 'status']);
/** 借鏡 AnimaVN lib/budget.ts 階梯量程（用於線性比例預算條） */
export const BUDGET_RANGE_STEPS = Object.freeze([4096, 8192, 16384, 32768, 65536, 131072]);

/**
 * token 估算（沿用 token-budget.js 註解「中文約 1 字 ≈ 1～1.5 token」→ 取 1.15；
 * ASCII 約 4 字 ≈ 1 token → 取 0.3）。僅供檢視參考，UI 明示為估算值。
 */
export function estimateTokens(text) {
  const s = String(text ?? '');
  if (!s) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if ((cp >= 0x3400 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0x3040 && cp <= 0x30ff) || (cp >= 0xac00 && cp <= 0xd7af)) cjk++;
    else other++;
  }
  return Math.ceil(cjk * 1.15 + other * 0.3);
}

/** 依使用量自動挑選最小可容納的量程檔位（借鏡 AnimaVN autoRange） */
export function autoBudgetRange(tokens) {
  const safe = Math.max(0, Number(tokens) || 0);
  return BUDGET_RANGE_STEPS.find(step => step >= safe) ?? BUDGET_RANGE_STEPS[BUDGET_RANGE_STEPS.length - 1];
}

/**
 * 計算靜態可快取前綴 vs 動態區塊的 Token 預算分布
 * @param {{blocks:Array,totalTokens:number}} data
 * @param {number} [budgetLimit]
 */
export function computeBudgetBreakdown(data, budgetLimit = null) {
  const blocks = Array.isArray(data?.blocks) ? data.blocks : [];
  let staticTokens = 0;
  let dynamicTokens = 0;
  for (const block of blocks) {
    if (!block || !block.enabled || !block.text) continue;
    const t = Number(block.tokens) || 0;
    if (CACHEABLE_BLOCK_KEYS.includes(block.key)) staticTokens += t;
    else dynamicTokens += t;
  }
  const totalTokens = staticTokens + dynamicTokens;
  const range = (Number.isFinite(Number(budgetLimit)) && Number(budgetLimit) > 0)
    ? Math.floor(Number(budgetLimit))
    : autoBudgetRange(totalTokens);
  const clampPct = value => Math.max(0, Math.min(100, Math.round(value * 10) / 10));
  return {
    staticTokens,
    dynamicTokens,
    totalTokens,
    range,
    remainingTokens: Math.max(0, range - totalTokens),
    staticPct: clampPct(range ? (staticTokens / range) * 100 : 0),
    dynamicPct: clampPct(range ? (dynamicTokens / range) * 100 : 0),
    cacheableRatioPct: clampPct(totalTokens ? (staticTokens / totalTokens) * 100 : 0)
  };
}

/** 好感度 → 好感帶 key（甜 80–100／平穩 50–79／小彆扭 30–49／待和好 0–29；非法值取平穩） */
export function bandKeyForAffection(value, bandsConfig = ALL_CONFIGS.affectionBands) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
  for (const band of Object.values(bandsConfig.bands)) {
    if (safe >= band.minAffection && safe <= band.maxAffection) return band.key;
  }
  return 'stable';
}

/** 好感度 → S 模組預設預覽階段（A/B 邊界 50；C 需告白旗標，僅能手動選） */
export function defaultStageForAffection(value) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
  return safe >= 50 ? 'B' : 'A';
}

function sanitizePrefs(raw) {
  const prefs = {};
  if (!raw || typeof raw !== 'object') return prefs;
  for (const key of BLOCK_KEYS) {
    if (typeof raw[key] === 'boolean') prefs[key] = raw[key];
  }
  return prefs;
}

/** 讀取區塊開關偏好（預設全部開啟；storage 可注入，失敗靜默） */
export function loadBlockPrefs(storage) {
  try {
    const raw = storage && storage.getItem(INSPECTOR_STORAGE_KEY);
    return raw ? sanitizePrefs(JSON.parse(raw)) : {};
  } catch (_) {
    return {};
  }
}

/** 寫入區塊開關偏好（僅存六鍵的布林值；storage 可注入，失敗靜默） */
export function saveBlockPrefs(storage, prefs) {
  try {
    if (storage) storage.setItem(INSPECTOR_STORAGE_KEY, JSON.stringify(sanitizePrefs(prefs)));
  } catch (_) { /* 偏好存檔失敗不影響檢視 */ }
}

/**
 * 產生開發者檢視資料。
 * @param {object} params.state 遊戲狀態（stage／band／playerName／playerNickname）
 * @param {string} params.livingSection 生活層文字（呼叫層注入）
 * @param {string} params.memorySection 記憶摘要（呼叫層注入）
 * @param {object} params.styleTweaks 相處風格參數
 * @param {object} params.storage 偏好儲存（可注入；null＝全開）
 * @returns {{blocks:Array,totalChars:number,totalTokens:number,preview:string,budget:object}}
 */
export function buildInspectorData({
  state = {},
  livingSection = '',
  memorySection = '',
  styleTweaks = {},
  storage = null
} = {}) {
  const prefs = loadBlockPrefs(storage);
  const raw = PromptAssembler.assemblePromptBlocks({ state, livingSection, memorySection, styleTweaks });
  const blocks = raw.map(block => {
    const text = block.text || '';
    return {
      key: block.key,
      label: block.label,
      source: block.source,
      text,
      chars: [...text].length,
      tokens: estimateTokens(text),
      cacheable: CACHEABLE_BLOCK_KEYS.includes(block.key),
      enabled: prefs[block.key] !== false
    };
  });
  const active = blocks.filter(block => block.enabled && block.text);
  const totalChars = active.reduce((n, block) => n + block.chars, 0);
  const totalTokens = active.reduce((n, block) => n + block.tokens, 0);
  const data = {
    blocks,
    totalChars,
    totalTokens,
    preview: active.map(block => block.text).join('\n')
  };
  data.budget = computeBudgetBreakdown(data);
  return data;
}

function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 渲染六區塊 HTML（每塊：標題＋開關／來源／快取屬性／字數／估算 token／可折疊全文） */
export function renderInspectorBlocks(blocks) {
  return blocks.map(block => {
    const isCacheable = block.cacheable !== undefined ? block.cacheable : CACHEABLE_BLOCK_KEYS.includes(block.key);
    const cacheTag = isCacheable ? '靜態可快取' : '動態區塊';
    return `<section class="pm-block${block.enabled ? '' : ' is-off'}" data-block-section="${escHtml(block.key)}" data-cacheable="${isCacheable ? '1' : '0'}">
  <header class="pm-block-head">
    <label class="pm-block-toggle"><input type="checkbox" data-block="${escHtml(block.key)}"${block.enabled ? ' checked' : ''}> <b>${escHtml(block.label)}</b></label>
    <span class="pm-block-meta">${escHtml(block.source)}｜${cacheTag}｜${block.chars} 字｜約 ${block.tokens} tokens</span>
  </header>
  ${block.text ? `<pre class="pm-block-text">${escHtml(block.text)}</pre>` : '<p class="pm-block-empty">（此區塊目前為空：由呼叫層注入後顯示，見來源）</p>'}
</section>`;
  }).join('\n');
}

/** 渲染 Token 預算比例條 HTML（借鏡 AnimaVN BudgetBar） */
export function renderInspectorBudgetBar(data, budgetLimit = null) {
  const b = computeBudgetBreakdown(data, budgetLimit);
  return `<div class="pm-budget" role="region" aria-label="提示詞 Token 預算估算">
  <div class="pm-budget-track" title="靜態可快取 ${b.staticTokens} / 動態 ${b.dynamicTokens} / 量程 ${b.range} tokens">
    <span class="pm-budget-seg is-static" style="width:${b.staticPct}%"></span>
    <span class="pm-budget-seg is-dynamic" style="width:${b.dynamicPct}%"></span>
  </div>
  <div class="pm-budget-legend">
    <span>靜態快取前綴：約 ${b.staticTokens} tokens（${b.cacheableRatioPct}%）</span>
    <span>動態區塊：約 ${b.dynamicTokens} tokens</span>
    <span>量程上限：${b.range} tokens（剩餘約 ${b.remainingTokens}）</span>
  </div>
</div>`;
}

/** 渲染摘要列（啟用區塊數／總字數／估算總 token／可快取比例） */
export function renderInspectorSummary(data) {
  const active = data.blocks.filter(block => block.enabled && block.text).length;
  const b = data.budget || computeBudgetBreakdown(data);
  return '啟用 ' + active + '／' + data.blocks.length + ' 區塊｜共 ' + data.totalChars + ' 字｜約 ' + data.totalTokens + ' tokens（靜態快取前綴 ' + b.cacheableRatioPct + '%；估算：中文 1 字≈1.15 token）';
}
