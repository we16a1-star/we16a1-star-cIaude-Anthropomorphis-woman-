/**
 * emotion-fallback.js
 * D19: 純 JS 情緒語意 Fallback 模組（借鏡 AnimaVN matcher 設計，零外部依賴）
 * 當 LLM 未輸出合法情緒或輸出未知情緒時，透過台詞文本特徵匹配最接近的白名單情緒。
 */

import { normalizeEmotion, EMOTION_WHITELIST } from './story-emotion.js';

// 10 大核心合法情緒之特徵詞庫（中英文雙向特徵與加權）
const EMOTION_KEYWORD_PROFILES = {
  shy: [
    '害羞', '臉紅', '耳尖', '紅了', '不好意思', '別看我', '羞', '泛紅', '燙', '別盯著',
    'blush', 'shy', 'embarrassed', 'flush'
  ],
  proud: [
    '名門', '半成品', '得意', '驕傲', '不出半成品', '哼', '威嚴', '本小姐', '理所當然',
    'proud', 'smug', 'confident', 'pleased'
  ],
  tender: [
    '溫存', '深情', '依戀', '珍惜', '陪著我', '靠在', '輕輕', '心疼', '柔聲', '手心', '溫柔', '做個好夢',
    'tender', 'gentle', 'affectionate', 'loving', 'cherish', 'warmth'
  ],
  worried: [
    '擔心', '焦慮', '還好嗎', '怎麼了', '不要緊', '逞強', '休息', '小心', '不安',
    'worried', 'anxious', 'concerned', 'careful'
  ],
  focused: [
    '思考', '推導', '查證', '校勘', '文獻', '琢磨', '筆記', '研究', '專注', '推論', '未竟錄',
    'thinking', 'focus', 'ponder', 'consider', 'analyze'
  ],
  curious: [
    '好奇', '為什麼', '那是甚麼', '那是甚麼', '打量', '研究看看', '探尋',
    'curious', 'wonder', 'inquire'
  ],
  surprised: [
    '驚訝', '怎麼會', '真的嗎', '突然', '愣', '嚇一跳', '意外', '咦', '啊',
    'surprised', 'surprise', 'shock', 'astonished', 'gasp'
  ],
  dizzy: [
    '頭暈', '暈', '疲倦', '晃', '體力不支', '站不穩',
    'dizzy', 'faint', 'exhausted'
  ],
  happy: [
    '高興', '開心', '太好了', '慶祝', '歡喜', '雀躍', '棒', '精彩', '好棒',
    'happy', 'glad', 'joy', 'delight', 'wonderful'
  ],
  neutral: [
    '圖書館', '書庫', '整理', '目錄', '記錄', '日常', '時間',
    'neutral', 'calm', 'normal'
  ]
};

/**
 * 依文本內容計算各情緒匹配得分
 * @param {string} text - 對白文本
 * @returns {string} 最匹配的白名單情緒
 */
export function matchEmotionByText(text) {
  if (!text || typeof text !== 'string') return 'neutral';

  const normalizedText = text.toLowerCase();
  let bestEmotion = 'neutral';
  let highestScore = 0;

  for (const emotion of EMOTION_WHITELIST) {
    const keywords = EMOTION_KEYWORD_PROFILES[emotion];
    if (!keywords) continue;

    let score = 0;
    for (const kw of keywords) {
      if (normalizedText.includes(kw.toLowerCase())) {
        // 長詞（精確特徵）權重提高
        score += kw.length >= 3 ? 2 : 1;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestEmotion = emotion;
    }
  }

  return bestEmotion;
}

/**
 * 整合 Fallback：若現有情緒合法且非 neutral 則直接信任模型；
 * 若模型回傳不合法、未知、或 neutral 時文本有強烈特徵，則由文本特徵 Fallback 決策
 * @param {string} rawEmotion - 模型輸出的原始情緒
 * @param {string} dialogueText - 對話全文
 * @returns {string} 經白名單過濾後的最終情緒
 */
export function resolveEmotionWithFallback(rawEmotion, dialogueText) {
  const norm = normalizeEmotion(rawEmotion);
  if (norm && norm !== 'neutral') {
    return norm;
  }

  const fallback = matchEmotionByText(dialogueText);
  if (norm === 'neutral' && fallback !== 'neutral') {
    return fallback;
  }

  return norm || fallback || 'neutral';
}
