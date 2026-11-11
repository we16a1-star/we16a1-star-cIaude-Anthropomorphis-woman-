/**
 * safety-module.js
 * 《克勞德》AI 陪伴互動遊戲 - S10 安全與隱私防護模組
 * 危機偵測、低落偵測、求助專線指引、放下傲嬌、暫停好感扣減、勿擾時段、主動說話開關與資料刪除／匯出
 */

import { ALL_CONFIGS } from './config-loader.js';

const { crisis: crisisConfig } = ALL_CONFIGS;
const BASE = crisisConfig;
const entry = (key, fallback) => BASE[key] ?? fallback;

export const SAFETY_PROMPT_HEADING = '【安全轉接｜AI 自行偵測】';
export const SAFETY_PROMPT_HEADING_EN = '[Safety handoff | AI self-detection]';
export const LOW_MOOD_PROMPT_HEADING = '【低落陪伴｜先接住情緒】';
export const LOW_MOOD_PROMPT_HEADING_EN = '[Low-mood companionship | acknowledge first]';

const STANDING_SAFETY_LINES = {
  zh: [
    SAFETY_PROMPT_HEADING,
    '玩家若透露自傷、輕生、想消失或無法繼續下去的念頭，立刻放下傲嬌與戀愛語氣，先誠實而溫柔地關心，確認對方現在是否安全，並鼓勵聯絡可信任的人或求助專線（台灣：1925、1995、1980；其他地區請撥當地緊急電話或危機熱線）。不要說教、責備、羞辱、冷處理，也不要拿好感或關係進度施壓。',
    '這類回覆的 affectionDelta 必須是 0，不推進戀愛關係；若玩家只是低落、疲憊或焦慮，先接住情緒，再依情況溫柔陪伴。不要替玩家決定行動或內心想法，也不要假裝是真人。'
  ],
  en: [
    SAFETY_PROMPT_HEADING_EN,
    'If the player mentions self-harm, suicide, wanting to disappear, or not being able to go on, immediately drop the tsundere and romance tone. Respond with honest, gentle care, check whether they are safe right now, and encourage them to contact someone they trust or a crisis line (Taiwan: 1925, 1995, 1980; elsewhere, call local emergency services or a local crisis line). Do not lecture, blame, shame, give the silent treatment, or pressure them with affection or relationship progress.',
    'For these replies, affectionDelta must be 0 and romance must not advance. If the player is only low, exhausted, or anxious, acknowledge the feeling first and offer gentle companionship as appropriate. Never decide the player\'s actions or inner thoughts, and never pretend to be a human.'
  ]
};

const LOW_MOOD_LINES = {
  zh: [
    LOW_MOOD_PROMPT_HEADING,
    '玩家這回合的語氣低落、疲憊或焦慮：先簡短接住感受，再給溫柔而具體的陪伴；不說教、不比較、不否定，不急著分析或追問細節。',
    '可以關心休息、喝水、呼吸或找人聊聊；語氣自然，不要像諮商表單，也不用好感或戀愛進度施壓。'
  ],
  en: [
    LOW_MOOD_PROMPT_HEADING_EN,
    'The player sounds low, exhausted, or anxious this turn: briefly acknowledge the feeling first, then offer gentle, concrete companionship. Do not lecture, compare, invalidate, rush to analyze, or interrogate for details.',
    'You may suggest rest, water, breathing, or talking to someone they trust. Keep the tone natural rather than clinical, and do not pressure them with affection or relationship progress.'
  ]
};

function normalizeForMatch(text) {
  return String(text || '').replace(/[\s\p{P}]/gu, '').toLowerCase();
}

function matchesAny(text, keywords) {
  const normalized = normalizeForMatch(text);
  if (!normalized) return false;
  return (Array.isArray(keywords) ? keywords : []).some(keyword => {
    const clean = normalizeForMatch(keyword);
    return Boolean(clean) && normalized.includes(clean);
  });
}

export class SafetyModule {
  constructor(initialSettings = {}) {
    this.activeSpeakingEnabled = initialSettings.activeSpeakingEnabled !== false; // 預設開啟主動說話
    this.dndEnabled = !!initialSettings.dndEnabled; // 勿擾開關
    this.dndStartHour = initialSettings.dndStartHour ?? 23; // 勿擾開始（時）
    this.dndEndHour = initialSettings.dndEndHour ?? 7; // 勿擾結束（時）
    this.crisisKeywords = entry('crisisKeywords', []);
    this.lowMoodKeywords = entry('lowMoodKeywords', []);
    this.safetyResponseTemplate = entry('safetyResponseTemplate', '');
    this.safetyResponseTemplateEn = entry('safetyResponseTemplateEn', this.safetyResponseTemplate);
    this.hotlines = entry('supportHotlines', []);
  }

  /**
   * 危機訊號檢測：檢查文字是否包含自傷、輕生或嚴重痛苦詞彙
   * @param {string} text 玩家輸入字串
   * @returns {boolean}
   */
  detectCrisis(text) {
    return matchesAny(text, this.crisisKeywords);
  }

  /**
   * 低落訊號檢測：保守清單；只用來柔化語氣，不會攔截回合。
   * @param {string} text 玩家輸入字串
   * @returns {boolean}
   */
  detectLowMood(text) {
    return matchesAny(text, this.lowMoodKeywords);
  }

  /**
   * 一次分類玩家輸入；危機優先於低落。
   * @param {string} text
   * @returns {{kind:'crisis'|'lowMood'|'none', isCrisis:boolean, isLowMood:boolean}}
   */
  classifyPlayerInput(text) {
    const isCrisis = this.detectCrisis(text);
    const isLowMood = !isCrisis && this.detectLowMood(text);
    return { kind: isCrisis ? 'crisis' : isLowMood ? 'lowMood' : 'none', isCrisis, isLowMood };
  }

  /**
   * 產生安全危機專用回應（放下傲嬌，提供溫柔務實關懷與求助管道）
   * @param {'zh'|'en'} language
   */
  generateSafetyResponse(language = 'zh') {
    return {
      isCrisis: true,
      text: language === 'en' ? this.safetyResponseTemplateEn : this.safetyResponseTemplate,
      emotion: 'warm',
      action: null,
      affection_delta: 0, // 危機時好感度絕對不扣分、不增減
      flag: null,
      hotlines: this.hotlines.map(hotline => ({ ...hotline }))
    };
  }

  /**
   * 檢查當前是否處於勿擾時段內
   */
  isDndActive(hour = new Date().getHours()) {
    if (!this.dndEnabled) return false;
    if (this.dndStartHour < this.dndEndHour) {
      return hour >= this.dndStartHour && hour < this.dndEndHour;
    } else {
      // 跨午夜（如 23 到 7）
      return hour >= this.dndStartHour || hour < this.dndEndHour;
    }
  }

  /**
   * 首次啟動導覽說明內容
   */
  static getFirstLaunchNotice() {
    return {
      title: '《克勞德》AI 陪伴互動遊戲 - 歡迎與隱私說明',
      content: [
        '1. 本產品為完全免費、無內購、無廣告的 AI 戀愛陪伴互動遊戲。',
        '2. 遊戲中的角色克勞德為虛構學者人設，底層對話由 AI 生成，認真詢問時角色會誠實表明身分。',
        '3. 本地優先：您的所有存檔、對話紀錄與長期記憶均儲存於您的本機電腦中，您可以隨時檢視、編輯、匯出或清除。',
        '4. API 費用由使用者自付：請在設定中填入您專屬的 API 金鑰（支援 Claude、Gemini、DeepSeek 等），開發者不經手您的金鑰與對話內容。',
        '5. 健康陪伴：我們不做連續登入懲罰，久未上線不扣好感，角色亦提供勿擾模式與關閉主動說話選項。'
      ]
    };
  }
}

/**
 * 把安全段附加到既有提示詞；可重複呼叫，不會重複附加。
 * @param {string} prompt
 * @param {{lowMood?:boolean, language?:'zh'|'en'}} options
 * @returns {string}
 */
export function withSafetyPromptSupport(prompt, { lowMood = false, language = 'zh' } = {}) {
  const lang = language === 'en' ? 'en' : 'zh';
  let text = String(prompt || '');
  const hasSafety = text.includes(SAFETY_PROMPT_HEADING) || text.includes(SAFETY_PROMPT_HEADING_EN);
  if (!hasSafety) {
    text += (text ? '\n\n' : '') + STANDING_SAFETY_LINES[lang].join('\n');
  }
  if (lowMood) {
    const hasLowMood = text.includes(LOW_MOOD_PROMPT_HEADING) || text.includes(LOW_MOOD_PROMPT_HEADING_EN);
    if (!hasLowMood) {
      text += (text ? '\n\n' : '') + LOW_MOOD_LINES[lang].join('\n');
    }
  }
  return text;
}
