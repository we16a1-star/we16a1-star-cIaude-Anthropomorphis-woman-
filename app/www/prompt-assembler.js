/**
 * prompt-assembler.js
 * 《克勞德》AI 陪伴互動遊戲 - S2 對話核心與提示詞組裝模組
 * 提示詞由上到下嚴格依序組裝：基底人設 → 階段區塊 → 好感帶補充 → 生活層 → 長期記憶 → 狀態參數 → 近期對話
 * 結構化回覆驗證（{"text","emotion","action","affection_delta","flag"}）與健全兜底機制
 */

import { ALL_CONFIGS } from './config-loader.js';
import { DEFAULT_PLAYER_NAME } from './player-name.js';
import { withCharacterBoundary } from './character-profile.js';

const { character: characterConfig, stages: stagesConfig, affectionBands: bandsConfig, emotions: emotionsConfig, actions: actionsConfig, dialogueFallback: fallbackConfig, replyProtocol: replyProtocolConfig } = ALL_CONFIGS;

export class PromptAssembler {
  /**
   * 組合送出給 LLM 的完整提示詞
   * @param {object} params
   * @param {object} params.state 狀態物件（來自 stateMachine.getStatus()）
   * @param {string} params.livingSection 生活層文字（來自 lifeSimulator.buildLivingSectionPrompt()）
   * @param {string} params.memorySection 記憶摘要（來自 memorySystem.buildMemoryPrompt()）
   * @param {Array}  params.recentHistory 近期對話記錄 [{ role: 'user'|'ai', text: string }]
   * @param {object} params.styleTweaks 相處風格設定 { tsundereLevel: 'normal', actionLevel: 'normal', lengthLevel: 'normal' }
   */
  static assemblePrompt({
    state,
    livingSection = '',
    memorySection = '',
    recentHistory = [],
    styleTweaks = {}
  }) {
    // P1-02：改由 assemblePromptBlocks() 六區塊組裝後串接；輸出與重構前逐字等價（測試釘死）
    return PromptAssembler.assemblePromptBlocks({ state, livingSection, memorySection, styleTweaks })
      .map(block => block.text)
      .filter(Boolean)
      .join('\n');
  }

  /**
   * P1-02 開發者檢視：六區塊組裝（人設／階段／好感帶／生活層／記憶／狀態）
   * @param {object} params 同 assemblePrompt（recentHistory 由呼叫層管理，不在此組裝）
   * @returns {Array<{key:string,label:string,source:string,text:string}>}
   *          text 含組裝用前導換行；空字串＝該區塊未啟用（如非 C 階段的好感帶、未注入的生活層）
   */
  static assemblePromptBlocks({
    state,
    livingSection = '',
    memorySection = '',
    styleTweaks = {}
  }) {
    const blocks = [];
    const stageKey = state.stage || 'A';

    // 1. 基底人設（P1-04：強制附上【界線｜優先於人設】，promptTweaks 不可關）
    blocks.push({
      key: 'character',
      label: '人設',
      source: 'config/character.json → basePrompt ＋ 界線｜優先於人設',
      text: withCharacterBoundary(characterConfig.basePrompt)
    });

    // 2. 階段區塊（A／B／C）
    let stageText = '';
    const stageData = stagesConfig.stages[stageKey];
    if (stageData && stageData.promptBlock) {
      stageText = '\n' + stageData.promptBlock
        .replace(/{玩家名}/g, state.playerName || DEFAULT_PLAYER_NAME)
        .replace(/{暱稱}/g, state.playerNickname || state.playerName || DEFAULT_PLAYER_NAME);
    }
    blocks.push({
      key: 'stage',
      label: '階段',
      source: 'config/stages.json → stages.' + stageKey + '.promptBlock',
      text: stageText
    });

    // 3. 好感帶補充（僅 C 階段使用）
    let bandText = '';
    if (stageKey === 'C' && state.band) {
      const bandData = bandsConfig.bands[state.band];
      if (bandData) {
        bandText = '\n' + bandsConfig.promptSupplementTemplate
          .replace('{bandName}', bandData.name)
          .replace('{guideline}', bandData.guideline);
      }
    }
    blocks.push({
      key: 'band',
      label: '好感帶',
      source: 'config/affection_bands.json → bands.' + (state.band || '（僅 C 階段）'),
      text: bandText
    });

    // 4. 生活層區塊
    blocks.push({
      key: 'living',
      label: '生活層',
      source: 'life-simulator.js → buildLivingSectionPrompt()（呼叫層注入）',
      text: livingSection ? '\n' + livingSection : ''
    });

    // 5. 長期記憶摘要
    blocks.push({
      key: 'memory',
      label: '記憶',
      source: 'memory-system.js → buildMemoryPrompt()（呼叫層注入）',
      text: memorySection ? '\n【長期記憶】\n' + memorySection : ''
    });

    // 6. 狀態：相處風格自訂與輸出規範
    // 協議模板與驗證參數由 reply_protocol.json 承載（P0-05 config 化）；白名單仍以 actions/emotions config 為來源
    const tsundereAdj = styleTweaks.tsundereLevel === 'high' ? '嘴硬比例提高一成' : (styleTweaks.tsundereLevel === 'low' ? '嘴硬比例降低一成' : '標準嘴硬比例');
    const actionCount = styleTweaks.actionLevel === 'high' ? '每則回覆包含 2–3 個動作' : (styleTweaks.actionLevel === 'low' ? '每則回覆包含 1 個動作' : '每則回覆 1–2 個動作');
    const lengthLimit = styleTweaks.lengthLevel === 'short' ? '簡短扼要，100 字內' : (styleTweaks.lengthLevel === 'long' ? '豐富描寫，250–350 字' : '適中長度，150–220 字');
    const PT = replyProtocolConfig.promptSectionTemplate;
    blocks.push({
      key: 'status',
      label: '狀態',
      source: 'config/reply_protocol.json → promptSectionTemplate ＋ 相處風格參數',
      text: '\n' + PT
        .replaceAll('[[tsundereAdj]]', tsundereAdj)
        .replaceAll('[[actionCount]]', actionCount)
        .replaceAll('[[lengthLimit]]', lengthLimit)
        .replaceAll('[[actionWhitelist]]', actionsConfig.whitelist.join(', '))
        .replaceAll('[[emotionWhitelist]]', emotionsConfig.whitelist.join(', '))
        .replaceAll('[[deltaMin]]', String(replyProtocolConfig.fields.affection_delta.min))
        .replaceAll('[[deltaMax]]', String(replyProtocolConfig.fields.affection_delta.max))
        .replaceAll('[[exampleJson]]', replyProtocolConfig.outputFormat.exampleJson)
    });

    return blocks;
  }

  /**
   * 解析並嚴格驗證 LLM 回覆
   * @param {string} rawReply LLM 原始輸出文字
   * @returns {{ success: boolean, data: object, error: string|null }}
   */
  static parseAndValidate(rawReply) {
    if (!rawReply || typeof rawReply !== 'string') {
      return { success: false, data: null, error: '回覆內容為空' };
    }

    // 去除可能的 markdown 代碼圍欄 (```json ... ```)
    let cleaned = rawReply.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }

    // 容錯擷取第一個 { 到最後一個 }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return { success: false, data: null, error: 'JSON 解析失敗: ' + e.message };
    }

    if (!parsed || typeof parsed !== 'object') {
      return { success: false, data: null, error: 'JSON 根物件非有效物件' };
    }

    // 驗證 text
    const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
    if (!text) {
      return { success: false, data: null, error: '缺少有效 text 對白欄位' };
    }

    // 驗證 emotion
    let emotion = typeof parsed.emotion === 'string' ? parsed.emotion.toLowerCase().trim() : 'neutral';
    if (!emotionsConfig.whitelist.includes(emotion)) {
      emotion = 'neutral';
    }

    // 驗證 action（T6：白名單外直接丟棄為 null，不重試整則；適配驗證屬遊戲層）
    let action = typeof parsed.action === 'string' ? parsed.action.toLowerCase().trim() : null;
    if (action && !actionsConfig.whitelist.includes(action)) {
      action = null; // 非白名單動作安全回退為 null
    }

    // 驗證 affection_delta（範圍由 reply_protocol.json 規定：現行 -3 到 3；超出 clamp、非數值=0）
    const deltaRule = replyProtocolConfig.fields.affection_delta;
    let delta = Number(parsed.affection_delta);
    if (isNaN(delta)) delta = 0;
    delta = Math.max(deltaRule.min, Math.min(deltaRule.max, Math.round(delta)));

    // 驗證 flag
    const flag = typeof parsed.flag === 'string' && parsed.flag.trim() ? parsed.flag.trim() : null;

    return {
      success: true,
      data: {
        text,
        emotion,
        action,
        affection_delta: delta,
        flag
      },
      error: null
    };
  }

  /**
   * 兜底回覆產生器：在連線失敗、格式破損且重試無效時提供安全人設台詞
   */
  static getFallbackReply(stage = 'A', situation = 'general') {
    let replyText = '（將手中的典籍翻過一頁，輕輕喝了一口伯爵紅茶）\n剛才魔力訊號似乎有些微波動呢。我們剛剛聊到哪裡了？';
    
    if (situation === 'praised') {
      replyText = fallbackConfig.situationDialogues.praised[stage] || replyText;
    } else if (situation === 'user_tired') {
      replyText = fallbackConfig.situationDialogues.user_tired[stage] || replyText;
    } else if (situation === 'goodnight') {
      replyText = fallbackConfig.situationDialogues.goodnight[stage] || replyText;
    } else if (fallbackConfig.offlineGreetings[stage]) {
      replyText = fallbackConfig.offlineGreetings[stage];
    }

    return {
      text: replyText,
      emotion: 'neutral',
      action: 'turn_page',
      affection_delta: 0,
      flag: null,
      isFallback: true
    };
  }
}

