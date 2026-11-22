/**
 * turn-reply-parser.js — 純函式故事回合回覆解析與驗證管線
 *
 * 將原本散落於 app.js 的 AI 回覆 JSON 擷取、容錯修復、七選項去重驗證、
 * 十情緒語意回退、好感變化限幅、故事時段推進與 D20 英文口白正規化收斂為獨立模組，
 * 零 DOM 相依、可獨立單元測試，供網頁模式與 API 模式共用。
 */

import { parseLooseJson } from './json-repair.js';
import { splitThinkingText } from './thinking-splitter.js';
import { resolveEmotionWithFallback } from './emotion-fallback.js';
import { normalizeStoryEmotionIntensity } from './story-emotion.js';
import { normalizeStoryEventFlag } from './story-events.js';
import { normalizeSpokenEnList } from './voice-tts.js';

export function stripJsonFences(value) {
  const split = splitThinkingText(String(value || ''));
  const visible = typeof split?.body === 'string' ? split.body : String(value || '');
  return visible
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```/g, '')
    .trim();
}

export function sanitizeJsonText(value) {
  return String(value || '').replace(/,\s*([}\]])/g, '$1');
}

export function extractStoryJsonCandidates(value) {
  const source = stripJsonFences(value);
  const candidates = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (start < 0) {
      if (ch === '{') { start = i; depth = 1; }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        candidates.push(source.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return candidates;
}

export function extractStoryJson(value) {
  const candidates = extractStoryJsonCandidates(value);
  candidates.sort((a, b) => b.length - a.length);
  for (const candidate of candidates) {
    for (const text of [candidate, sanitizeJsonText(candidate)]) {
      try { JSON.parse(text); return text; } catch (_) {}
    }
  }
  throw new Error('找不到完整 JSON。請複製 AI 回覆中的完整 JSON 物件。');
}

export function sanitizeChoices(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map((x) => String(x || '').trim())
    .filter((x) => x && x.length <= 180)
    .filter((x) => {
      const k = x.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 7);
}

export function clampAffectionDelta(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-5, Math.min(5, Math.round(n * 100) / 100));
}

export function normalizeTimeAdvance(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(6, Math.round(n)));
}

/**
 * 解析並嚴格驗證單回合 AI 回覆 JSON：
 *   - 自動剝除 `<think>` 思考塊與 Markdown 程式碼圍欄
 *   - 多候選 JSON 區塊嘗試＋寬鬆容錯解析（彎引號／尾逗號）
 *   - 強制驗證 narration、memory 與 7 個不重複選項
 *   - 欄位級安全收斂 emotion（10 情緒＋語意回退）、intensity（1–3）、eventFlag、affectionDelta、timeAdvance、spokenEn
 */
export function parseStoryTurnReply(rawText) {
  const text = stripJsonFences(rawText);
  let result;
  const candidates = extractStoryJsonCandidates(text);
  candidates.sort((a, b) => b.length - a.length);

  for (const candidate of candidates) {
    for (const attempt of [candidate, sanitizeJsonText(candidate)]) {
      try {
        result = JSON.parse(attempt);
        break;
      } catch (_) {}
    }
    if (result) break;
  }

  if (!result) {
    try {
      result = parseLooseJson(text);
    } catch (_) {
      throw new Error('AI 回覆不是有效 JSON，請重新複製完整回覆。');
    }
  }

  const choices = sanitizeChoices(result.choices);
  if (typeof result.narration !== 'string' || !result.narration.trim()) {
    throw new Error('AI 回覆缺少故事正文，請重新生成本回合。');
  }
  if (typeof result.memory !== 'string') {
    throw new Error('AI 回覆缺少故事記憶，請重新生成本回合。');
  }
  if (!Array.isArray(result.choices) || result.choices.length !== 7 || result.choices.some((c) => typeof c !== 'string')) {
    throw new Error('AI 漏掉或未提供完整七選項；請用「AI 漏掉七選項？一鍵準備修復提示詞」要求它補齊。');
  }
  if (choices.length !== 7) {
    throw new Error('AI 的 7 個選項有空白或重複；請用修復提示詞重新整理成 7 個不同選項。');
  }

  result.choices = choices;
  result.emotion = resolveEmotionWithFallback(result.emotion, result.narration);
  result.intensity = normalizeStoryEmotionIntensity(result.intensity);
  result.eventFlag = normalizeStoryEventFlag(result.eventFlag);
  result.affectionDelta = clampAffectionDelta(result.affectionDelta);

  const advance = normalizeTimeAdvance(result.timeAdvance);
  if (advance !== null) result.timeAdvance = advance;
  else delete result.timeAdvance;

  const spokenEn = normalizeSpokenEnList(result.spokenEn);
  if (spokenEn.length) result.spokenEn = spokenEn;
  else delete result.spokenEn;

  return result;
}

export function isValidStoryTurnReply(rawText) {
  try {
    parseStoryTurnReply(rawText);
    return true;
  } catch (_) {
    return false;
  }
}
