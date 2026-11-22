/**
 * vn-script.js — 結構化視覺小說劇本解析管線
 *
 * 架構概念借鏡自 AnimaVN（https://github.com/JayziLi/AnimaVN，MIT License）
 * 之 `frontend/src/debug/vn/script.ts` 切句與標籤定位設計，由本專案獨立實作：
 *   1. 行內演出標籤摘除與定位：先抽出 `<emotion:...>` / `[emotion:...]` / `<scene:...>` / `<我>`，
 *      記錄其作用句序，不殘留於玩家可見正文。
 *   2. 內嵌引號防誤切：引號緊接在漢字／字母／數字之後（如「封面上印著「未竟錄」三個字」）
 *      視為旁白中的書名或強調，不誤切為獨立對話。
 *   3. 說話人辨識：支援「名字：「台詞」」、劇本式「角色名：台詞」與括號動作描寫，
 *      排除「她說：」「低聲道：」等旁白動詞前綴。
 *   4. 長句安全切分與碎片保護：超長段落依句讀切分（預設上限 90 字），
 *      純標點殘片併回前句或略過，避免玩家點到空白頁。
 *   5. 保留每句在原文的結束位移 `ends[]`，供插話／回放截斷使用。
 */

import { normalizeStoryEmotion } from './story-emotion.js';
import { inferLineEmotion, mapSemanticEmotionLabel } from './emotion-fallback.js';

export const MAX_VN_LINE_CHARS = 90;

const QUOTE_RE = /「[^」]*」?|『[^』]*』?|“[^”]*”?|"[^"\n]*"?/g;
const EMBEDDED_AFTER_RE = /[\p{L}\p{N}]/u;
const PUNCT_ONLY_RE = /^[\s，。、；：:;,.!！?？…—~～\-*」』”"]*$/;
const NAME_PREFIX_RE = /^\s*([^\s，。！？、：:「」『』“”"*]{1,10})\s*[：:]\s*$/;
const SCRIPT_LINE_RE = /^(\s*\**\s*([^\s，。！？、：:「」『』“”"*]{1,10})\s*\**\s*[：:]\s*\**\s*)(\S[\s\S]*)$/;
const ANY_QUOTE_RE = /[「『“"]/;
const NOT_A_NAME_RE = /^[她他它我你您]|(說|道|問|答|喊|叫|笑|嚷|吼|念|講|語|想|唱|嘆|低語)$/;

const INLINE_TAG_RE = /<(emotion|sprite|scene|bg)\s*[:：]\s*([^>\n]{1,40})>|\[(emotion|sprite|scene|bg)\s*[:：]\s*([^\]\n]{1,40})\]|[<＜]\s*(我)\s*[>＞]/gi;

/**
 * 摘除行內演出標籤，並回傳乾淨正文、標籤命中位置、以及乾淨索引 → 原文索引對照表。
 */
function extractInlineTags(rawText) {
  const tags = [];
  const cleanToRaw = [];
  let clean = '';
  let lastIndex = 0;

  INLINE_TAG_RE.lastIndex = 0;
  let match;
  while ((match = INLINE_TAG_RE.exec(rawText)) !== null) {
    const seg = rawText.slice(lastIndex, match.index);
    for (let i = 0; i < seg.length; i += 1) {
      cleanToRaw.push(lastIndex + i);
    }
    clean += seg;

    const rawTag = match[0];
    if (match[5]) {
      tags.push({ kind: 'player', label: '我', raw: rawTag, cleanPos: clean.length, rawStart: match.index, rawEnd: match.index + rawTag.length });
    } else {
      const rawKind = (match[1] || match[3] || '').toLowerCase();
      const label = (match[2] || match[4] || '').trim();
      const kind = (rawKind === 'scene' || rawKind === 'bg') ? 'scene' : 'emotion';
      if (label) {
        tags.push({ kind, label, raw: rawTag, cleanPos: clean.length, rawStart: match.index, rawEnd: match.index + rawTag.length });
      }
    }
    lastIndex = match.index + rawTag.length;
  }

  const tail = rawText.slice(lastIndex);
  for (let i = 0; i < tail.length; i += 1) {
    cleanToRaw.push(lastIndex + i);
  }
  clean += tail;
  cleanToRaw.push(rawText.length);

  return { clean, tags, cleanToRaw };
}

/**
 * 將過長片段按終止標點或子句逗點切分為 <= maxChars 的子區段，且不產生純標點尾段。
 */
function splitLongSegment(text, baseOffset, maxChars = MAX_VN_LINE_CHARS) {
  if (text.length <= maxChars) {
    return [{ start: baseOffset, end: baseOffset + text.length }];
  }
  const chunks = [];
  let chunkStart = 0;
  let lastStrongBreak = -1;
  let lastSoftBreak = -1;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1] ?? '';
    if ('。！？!?…'.includes(ch) && !'。！？!?…」』”"）)'.includes(next)) {
      lastStrongBreak = i + 1;
    } else if ('，、；;—'.includes(ch) && !'」』”"）)'.includes(next)) {
      lastSoftBreak = i + 1;
    }

    if (i + 1 - chunkStart >= maxChars) {
      const cut = lastStrongBreak > chunkStart
        ? lastStrongBreak
        : (lastSoftBreak > chunkStart ? lastSoftBreak : i + 1);
      chunks.push({ start: baseOffset + chunkStart, end: baseOffset + cut });
      chunkStart = cut;
      lastStrongBreak = -1;
      lastSoftBreak = -1;
    }
  }

  if (chunkStart < text.length) {
    chunks.push({ start: baseOffset + chunkStart, end: baseOffset + text.length });
  }

  // 若尾段只剩標點（例如硬切在句號前），併回前一段
  if (chunks.length > 1) {
    const last = chunks[chunks.length - 1];
    const lastSlice = text.slice(last.start - baseOffset, last.end - baseOffset);
    if (PUNCT_ONLY_RE.test(lastSlice)) {
      chunks.pop();
      chunks[chunks.length - 1].end = last.end;
    }
  }

  return chunks;
}

/**
 * 依終止標點切分一段純旁白／動作文字（保留括號動作區塊）。
 */
function splitNarrationSentences(piece, baseOffset, maxChars) {
  const out = [];
  let start = 0;
  let inParen = false;

  const flush = (from, to, kind = 'narration') => {
    const raw = piece.slice(from, to);
    if (PUNCT_ONLY_RE.test(raw)) return;
    const leadTrim = raw.length - raw.trimStart().length;
    const trailTrim = raw.length - raw.trimEnd().length;
    const trimStart = from + leadTrim;
    const trimEnd = to - trailTrim;
    if (trimEnd <= trimStart) return;
    const subText = piece.slice(trimStart, trimEnd);
    for (const c of splitLongSegment(subText, baseOffset + trimStart, maxChars)) {
      out.push({ start: c.start, end: c.end, kind, speaker: null });
    }
  };

  for (let i = 0; i < piece.length; i += 1) {
    const ch = piece[i];
    if (!inParen && (ch === '（' || ch === '(')) {
      if (i > start) flush(start, i, 'narration');
      inParen = true;
      start = i;
      continue;
    }
    if (inParen && (ch === '）' || ch === ')')) {
      inParen = false;
      let j = i + 1;
      while (j < piece.length && (piece[j] === '…' || piece[j] === '.')) j += 1;
      flush(start, j, 'action');
      start = j;
      i = j - 1;
      continue;
    }
    if (!inParen && '。！？!?\n'.includes(ch)) {
      let j = i + 1;
      while (j < piece.length && '。！？!?… 　'.includes(piece[j])) j += 1;
      flush(start, j, 'narration');
      start = j;
      i = j - 1;
      continue;
    }
    if (!inParen && (ch === '…' || (ch === '.' && piece[i + 1] === '.'))) {
      let j = i + 1;
      while (j < piece.length && (piece[j] === '…' || piece[j] === '.')) j += 1;
      if (j < piece.length && !'。！？!?'.includes(piece[j])) {
        flush(start, j, 'narration');
        start = j;
        i = j - 1;
      }
    }
  }

  if (start < piece.length) {
    flush(start, piece.length, inParen ? 'action' : 'narration');
  }
  return out;
}

/**
 * 解析單一自然段
 */
function parseParagraph(para, offset, { charName, userName, maxLineChars }) {
  const spans = [];
  if (!para || PUNCT_ONLY_RE.test(para)) return spans;

  // 劇本式「角色名：台詞」（無引號，且只認角色名或玩家名，避免誤認「時間：晚上八點」）
  if (!ANY_QUOTE_RE.test(para)) {
    const script = SCRIPT_LINE_RE.exec(para);
    if (script && (script[2] === charName || script[2] === userName)) {
      const body = script[3].replace(/\s*\**\s*$/, '').trim();
      if (!body) return spans;
      const bodyOffset = offset + script[1].length;
      for (const c of splitLongSegment(body, bodyOffset, maxLineChars)) {
        spans.push({
          start: c.start,
          end: c.end,
          kind: 'dialogue',
          speaker: script[2],
          named: true,
          player: script[2] === userName
        });
      }
      return spans;
    }
  }

  let cursor = 0;
  let pendingSpeaker = null;
  QUOTE_RE.lastIndex = 0;

  for (const m of para.matchAll(QUOTE_RE)) {
    const at = m.index ?? 0;
    const quoted = m[0];

    // 內嵌引號防誤切：引號緊接在漢字／字母／數字之後時，視為旁白內強調（如 寫著「未竟錄」的書脊）
    if (at > 0 && EMBEDDED_AFTER_RE.test(para[at - 1])) {
      continue;
    }

    const before = para.slice(cursor, at);
    const named = NAME_PREFIX_RE.exec(before.replace(/\*/g, ''));
    if (named && !NOT_A_NAME_RE.test(named[1])) {
      pendingSpeaker = named[1];
    } else if (before.trim()) {
      spans.push(...splitNarrationSentences(before, offset + cursor, maxLineChars));
    }

    const speaker = pendingSpeaker || charName;
    const isNamed = pendingSpeaker !== null;
    pendingSpeaker = null;

    if (!PUNCT_ONLY_RE.test(quoted)) {
      for (const c of splitLongSegment(quoted, offset + at, maxLineChars)) {
        spans.push({
          start: c.start,
          end: c.end,
          kind: 'dialogue',
          speaker,
          named: isNamed,
          player: speaker === userName
        });
      }
    }
    cursor = at + quoted.length;
  }

  if (cursor < para.length) {
    const rest = para.slice(cursor);
    if (!PUNCT_ONLY_RE.test(rest)) {
      spans.push(...splitNarrationSentences(rest, offset + cursor, maxLineChars));
    }
  }

  return spans;
}

/**
 * 解析一段 AI 回覆為結構化視覺小說演出劇本。
 *
 * @param {string} text - AI 回覆原文
 * @param {object} [options]
 * @param {string} [options.charName='Claude娘'] - 主角名稱
 * @param {string} [options.userName='User'] - 玩家名稱
 * @param {number} [options.maxLineChars=90] - 單句最大字數
 * @param {boolean} [options.inferEmotion=true] - 是否對無標籤句啟用強情緒關鍵詞推斷
 * @returns {{ lines: Array<object>, hits: Array<object>, ends: number[] }}
 */
export function parseVnScript(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return { lines: [], hits: [], ends: [] };
  }

  const charName = String(options.charName || 'Claude娘');
  const userName = String(options.userName || 'User');
  const maxLineChars = Number.isFinite(Number(options.maxLineChars))
    ? Math.max(20, Math.round(Number(options.maxLineChars)))
    : MAX_VN_LINE_CHARS;
  const shouldInferEmotion = options.inferEmotion !== false;

  const normalizedRaw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalizedRaw.trim()) {
    return { lines: [], hits: [], ends: [] };
  }

  const { clean, tags, cleanToRaw } = extractInlineTags(normalizedRaw);

  // 按換行逐段解析並保留 clean 內絕對位移
  const rawSpans = [];
  let paraStart = 0;
  while (paraStart <= clean.length) {
    const nl = clean.indexOf('\n', paraStart);
    const paraEnd = nl === -1 ? clean.length : nl;
    const para = clean.slice(paraStart, paraEnd);
    if (para.trim()) {
      rawSpans.push(...parseParagraph(para, paraStart, { charName, userName, maxLineChars }));
    }
    if (nl === -1) break;
    paraStart = nl + 1;
  }

  // 將摘除的標籤映射到第一個 end > tag.cleanPos 的句子（同 AnimaVN script.ts 規則）
  const hits = [];
  const lineTags = rawSpans.map(() => ({ emotion: null, scene: null, player: false }));

  for (const tag of tags) {
    let targetIdx = rawSpans.findIndex(sp => sp.end > tag.cleanPos);
    if (targetIdx === -1) {
      hits.push({ kind: tag.kind, label: tag.label, raw: tag.raw, lineIndex: -1 });
      continue;
    }
    if (tag.kind === 'player') {
      lineTags[targetIdx].player = true;
    } else if (tag.kind === 'emotion') {
      const resolved = mapSemanticEmotionLabel(tag.label) || normalizeStoryEmotion(tag.label);
      lineTags[targetIdx].emotion = resolved;
    } else if (tag.kind === 'scene') {
      lineTags[targetIdx].scene = tag.label;
    }
    hits.push({ kind: tag.kind, label: tag.label, raw: tag.raw, lineIndex: targetIdx });
  }

  const lines = [];
  const ends = [];

  for (let i = 0; i < rawSpans.length; i += 1) {
    const sp = rawSpans[i];
    const lineText = clean.slice(sp.start, sp.end).trim();
    if (!lineText || PUNCT_ONLY_RE.test(lineText)) continue;

    const tagged = lineTags[i];
    const isPlayer = Boolean(sp.player || tagged.player);
    const speaker = isPlayer ? userName : sp.speaker;
    const explicitEmotion = isPlayer ? null : tagged.emotion;
    const inferredEmotion = (!isPlayer && !explicitEmotion && shouldInferEmotion)
      ? inferLineEmotion(lineText, 2)
      : null;

    const lastCleanIdx = Math.max(0, Math.min(sp.end - 1, cleanToRaw.length - 2));
    const endRaw = (sp.end > 0 && cleanToRaw[lastCleanIdx] !== undefined)
      ? cleanToRaw[lastCleanIdx] + 1
      : normalizedRaw.length;
    ends.push(endRaw);

    lines.push({
      text: lineText,
      speaker,
      kind: sp.kind,
      named: Boolean(sp.named),
      player: isPlayer,
      emotion: explicitEmotion || inferredEmotion || null,
      emotionSource: explicitEmotion ? 'tag' : (inferredEmotion ? 'fallback' : null),
      scene: tagged.scene || null,
      endOffset: endRaw
    });
  }

  return { lines, hits, ends };
}

/**
 * 插話截斷工具：依已播放到的 lineIndex，從原文中精準截留到該句為止（不含後續句子的標籤與內容）。
 * @param {string} rawText
 * @param {{ ends: number[] }} parsed
 * @param {number} lineIndex
 * @returns {string}
 */
export function sliceScriptToLine(rawText, parsed, lineIndex) {
  if (!rawText || typeof rawText !== 'string') return '';
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!parsed || !Array.isArray(parsed.ends) || parsed.ends.length === 0) return normalized.trim();
  const safeIdx = Math.max(0, Math.min(parsed.ends.length - 1, Math.floor(Number(lineIndex) || 0)));
  return normalized.slice(0, parsed.ends[safeIdx]).trim();
}
