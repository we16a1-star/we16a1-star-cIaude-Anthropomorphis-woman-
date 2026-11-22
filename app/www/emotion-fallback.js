/**
 * emotion-fallback.js
 * D19: 純 JS 情緒語意 Fallback 模組（借鏡 AnimaVN emotionMatch / matcher 設計，零外部依賴）
 * 當 LLM 未輸出合法情緒或輸出未知情緒時，透過台詞文本特徵匹配最接近的白名單情緒。
 * 同時提供句級強特徵推斷（inferLineEmotion），供逐句演出動態連動微表情。
 */

import { normalizeEmotion, EMOTION_WHITELIST } from './story-emotion.js';

// 10 大核心合法情緒之特徵詞庫（中英文雙向特徵與加權）
const EMOTION_KEYWORD_PROFILES = {
  shy: [
    '害羞', '臉紅', '耳尖', '紅了', '不好意思', '別看我', '羞', '泛紅', '發燙', '別盯著', '移開視線', '臉頰微紅',
    'blush', 'shy', 'embarrassed', 'flush'
  ],
  proud: [
    '名門', '半成品', '得意', '驕傲', '不出半成品', '哼', '威嚴', '本小姐', '理所當然', '交給我', '小菜一碟',
    'proud', 'smug', 'confident', 'pleased'
  ],
  tender: [
    '溫存', '深情', '依戀', '珍惜', '陪著我', '靠在', '輕輕', '心疼', '柔聲', '手心', '溫柔', '做個好夢', '晚安', '放心吧',
    'tender', 'gentle', 'affectionate', 'loving', 'cherish', 'warmth'
  ],
  worried: [
    '擔心', '焦慮', '還好嗎', '怎麼了', '不要緊', '逞強', '休息', '小心', '不安', '皺起眉', '蹙眉', '沒事吧',
    'worried', 'anxious', 'concerned', 'careful'
  ],
  focused: [
    '思考', '推導', '查證', '校勘', '文獻', '琢磨', '筆記', '研究', '專注', '推論', '未竟錄', '翻閱', '仔細看',
    'thinking', 'focus', 'ponder', 'consider', 'analyze'
  ],
  curious: [
    '好奇', '為什麼', '那是什麼', '那是甚麼', '打量', '研究看看', '探尋', '傾身', '歪了歪頭', '怎麼會這樣',
    'curious', 'wonder', 'inquire'
  ],
  surprised: [
    '驚訝', '怎麼會', '真的嗎', '突然', '愣', '嚇一跳', '意外', '咦', '睜大眼', '眨了眨眼',
    'surprised', 'surprise', 'shock', 'astonished', 'gasp'
  ],
  dizzy: [
    '頭暈', '暈', '疲倦', '晃', '體力不支', '站不穩', '犯睏', '眼皮打架',
    'dizzy', 'faint', 'exhausted'
  ],
  happy: [
    '高興', '開心', '太好了', '慶祝', '歡喜', '雀躍', '精彩', '好棒', '輕笑', '笑起來', '眉眼彎彎', '微笑',
    'happy', 'glad', 'joy', 'delight', 'wonderful'
  ],
  neutral: [
    '圖書館', '書庫', '整理', '目錄', '記錄', '日常', '時間',
    'neutral', 'calm', 'normal'
  ]
};

// 常見未知情緒標籤的語意近義詞表（借鏡 AnimaVN emotion alias / semantic fallback）
const SEMANTIC_LABEL_MAP = {
  // 正向／溫柔
  loving: 'tender', soft: 'tender', caring: 'tender', bittersweet: 'tender', calm: 'tender', peaceful: 'tender',
  kind: 'tender', comforting: 'tender', nostalgic: 'tender',
  // 開心／俏皮
  cheerful: 'happy', excited: 'happy', joyful: 'happy', amused: 'happy', playful: 'happy', smiling: 'happy',
  tease: 'proud', teasing: 'proud', mischievous: 'proud', cheeky: 'proud', triumphant: 'proud',
  // 害羞
  flustered: 'shy', bashful: 'shy', timid: 'shy', nervous: 'shy',
  // 專注／思考
  serious: 'focused', thoughtful: 'focused', analytical: 'focused', scholarly: 'focused', pensive: 'focused',
  // 好奇
  intrigued: 'curious', inquisitive: 'curious', puzzled: 'curious', confused: 'curious',
  // 驚訝
  shocked: 'surprised', startled: 'surprised', amazed: 'surprised',
  // 擔憂／疲倦
  sad: 'worried', melancholy: 'worried', uneasy: 'worried', sympathetic: 'worried', protective: 'worried',
  tired: 'dizzy', sleepy: 'dizzy', drowsy: 'dizzy', overwhelmed: 'dizzy'
};

/**
 * 計算文本對各白名單情緒的分數分布
 * @param {string} text
 * @returns {{ emotion: string, score: number }}
 */
export function scoreEmotionByText(text) {
  if (!text || typeof text !== 'string') return { emotion: 'neutral', score: 0 };

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

  return { emotion: bestEmotion, score: highestScore };
}

/**
 * 依文本內容計算各情緒匹配得分
 * @param {string} text - 對白文本
 * @returns {string} 最匹配的白名單情緒
 */
export function matchEmotionByText(text) {
  return scoreEmotionByText(text).emotion;
}

/**
 * 嘗試把非白名單標籤透過語意別名對應到白名單情緒
 * @param {string} rawEmotion
 * @returns {string|null}
 */
export function mapSemanticEmotionLabel(rawEmotion) {
  const key = String(rawEmotion || '').trim().toLowerCase();
  if (!key) return null;
  const direct = normalizeEmotion(key);
  if (direct && direct !== 'neutral') return direct;
  if (key === 'neutral' || key === '日常') return 'neutral';
  if (SEMANTIC_LABEL_MAP[key]) return normalizeEmotion(SEMANTIC_LABEL_MAP[key]);
  // 子字串模糊比對（例如 "slightly_blushing" → "blush" / "shy"）
  for (const [alias, target] of Object.entries(SEMANTIC_LABEL_MAP)) {
    if (alias.length >= 4 && key.includes(alias)) {
      return normalizeEmotion(target);
    }
  }
  return null;
}

/**
 * 句級強情緒推斷：僅在單句命中足夠高信心分數（預設 >= 2）且非 neutral 時才回傳情緒，
 * 避免普通旁白把整回合的主情緒覆蓋掉。
 * @param {string} lineText
 * @param {number} [minScore=2]
 * @returns {string|null}
 */
export function inferLineEmotion(lineText, minScore = 2) {
  const { emotion, score } = scoreEmotionByText(lineText);
  if (emotion && emotion !== 'neutral' && score >= minScore) {
    return emotion;
  }
  return null;
}

/**
 * 整合 Fallback：若現有情緒合法且非 neutral 則直接信任模型；
 * 若模型回傳未知標籤，先查語意近義詞表，再由文本特徵 Fallback 決策；
 * 若模型回傳 neutral 但文本有明確特徵，亦由文本特徵補強。
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
  if (fallback && fallback !== 'neutral') {
    return fallback;
  }

  const semantic = mapSemanticEmotionLabel(rawEmotion);
  if (semantic && semantic !== 'neutral') {
    return semantic;
  }

  return norm || fallback || 'neutral';
}
