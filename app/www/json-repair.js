/**
 * json-repair.js — 網頁 AI 回覆的容錯 JSON 解析。
 *
 * 為什麼需要這個模組：
 *   官網 AI 有時會把 JSON 的引號寫成彎引號（“ ”）、全形標點（：，｛｝），
 *   或混用 ASCII 雙引號與彎引號；也可能在字串裡直接換行、放入沒有轉義的
 *   雙引號。這些內容肉眼看起來像 JSON，但 JSON.parse 會直接失敗，導致
 *   「自動接回」與「貼上回覆」都卡住。
 *
 * 這個模組只做「盡力解析」，不做故事欄位驗證；欄位是否完整仍由 app.js 的
 * parseWebReply 把關，避免把一般長文誤判成故事。
 *
 * 支援：
 *   1. 彎引號與全形引號（“ ” 〝 〞 ＂）以及 ASCII 雙引號混用
 *   2. 全形標點（｛ ｝ ［ ］ ： ，）
 *   3. 字串內未轉義的換行與雙引號
 *   4. 尾逗號
 *   5. Markdown code fence 與 JSON 前後的說明文字
 */

import { splitThinkingText } from './thinking-splitter.js';

const QUOTE_CHARS = new Set(['"', '＂', '“', '”', '〝', '‟']);

function isWhitespace(ch) {
  return ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t' || ch === '\u3000' || ch === '\uFEFF';
}

function isQuote(ch) {
  return QUOTE_CHARS.has(ch);
}

function nextNonSpace(source, index) {
  let i = index;
  while (i < source.length && isWhitespace(source[i])) i++;
  return i;
}

/**
 * 判斷某個引號是否真的結束字串。
 *
 * 規則：引號後面（略過空白）若接的是 JSON 結構字元，才視為字串結尾；
 * 否則視為台詞裡的一般引號。全形逗號／冒號必須再往後看到下一個鍵、值或
 * 括號，才算是結構位置，避免「她說“你好”，然後……」被誤切。
 */
function structuralAt(source, quoteIndex) {
  const j = nextNonSpace(source, quoteIndex + 1);
  const ch = source[j];
  if (ch === undefined) return true;
  if (ch === ',' || ch === '}' || ch === ']' || ch === ':') return true;
  if (ch === '｝' || ch === '］') return true;
  if (ch === '，' || ch === '：') {
    const k = nextNonSpace(source, j + 1);
    const next = source[k];
    return isQuote(next) || next === '{' || next === '｛' ||
      next === '[' || next === '［' || next === '}' || next === '｝' ||
      next === ']' || next === '］' || next === '-' ||
      /[0-9０-９tfn]/.test(next || '');
  }
  return false;
}

export function stripJsonFences(value) {
  const withoutBom = String(value || '').replace(/^\uFEFF/, '');
  const withoutThink = splitThinkingText(withoutBom).body;
  return withoutThink
    .replace(/```(?:json|JSON)?\s*/g, '')
    .replace(/```/g, '')
    .trim();
}

/**
 * 從 start（引號所在位置）掃到字串結尾，回傳結尾後的位置。
 * 沒有結尾時回傳 source.length。
 */
function scanString(source, start) {
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') {
      // 少數貼上流程會把結構引號寫成 \"；後面接結構字元時視為字串結尾。
      const next = source[i + 1];
      if (isQuote(next) && structuralAt(source, i + 1)) return i + 2;
      i += 2;
      continue;
    }
    if (isQuote(ch) && structuralAt(source, i)) return i + 1;
    i++;
  }
  return source.length;
}

/**
 * 找出所有「看起來像 JSON 物件」的候選字串，由外而內。
 * 字串內的大括號會被跳過，避免正文裡的 { } 干擾配對。
 */
export function extractJsonCandidates(value) {
  const source = stripJsonFences(value);
  const candidates = [];
  let start = -1;
  let depth = 0;
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    if (start < 0) {
      if (ch === '{' || ch === '｛') {
        start = i;
        depth = 1;
      }
      i++;
      continue;
    }

    if (isQuote(ch)) {
      const end = scanString(source, i);
      if (end > i + 1) {
        i = end;
        continue;
      }
    }

    if (ch === '{' || ch === '｛') {
      depth++;
    } else if (ch === '}' || ch === '｝') {
      depth--;
      if (depth === 0) {
        candidates.push(source.slice(start, i + 1));
        start = -1;
      }
    }
    i++;
  }

  return candidates;
}

class LooseJsonParser {
  constructor(text) {
    this.text = text;
    this.i = 0;
  }

  fail(message) {
    const error = new Error(message);
    error.position = this.i;
    throw error;
  }

  skipSpace() {
    while (this.i < this.text.length && isWhitespace(this.text[this.i])) this.i++;
  }

  parseValue() {
    this.skipSpace();
    const ch = this.text[this.i];
    if (ch === '{' || ch === '｛') return this.parseObject();
    if (ch === '[' || ch === '［') return this.parseArray();
    if (isQuote(ch)) return this.parseString();
    return this.parseBare();
  }

  parseObject() {
    this.i++; // { 或 ｛
    const object = {};
    while (true) {
      this.skipSpace();
      while (this.text[this.i] === ',' || this.text[this.i] === '，') {
        this.i++;
        this.skipSpace();
      }
      const ch = this.text[this.i];
      if (ch === '}' || ch === '｝') {
        this.i++;
        return object;
      }
      if (ch === undefined) this.fail('JSON 物件沒有結尾。');

      const key = this.parseKey();
      this.skipSpace();
      if (this.text[this.i] === ':' || this.text[this.i] === '：') this.i++;
      else this.fail('JSON 物件缺少冒號。');
      object[key] = this.parseValue();
      this.skipSpace();
      // 不強制要求逗號：有些 AI 會漏掉；下一輪會自動跳過逗號或讀下一個鍵。
    }
  }

  parseKey() {
    this.skipSpace();
    if (isQuote(this.text[this.i])) return this.parseString();
    const start = this.i;
    while (this.i < this.text.length && !/[：:\s，,｝}]/.test(this.text[this.i])) this.i++;
    return this.text.slice(start, this.i).trim();
  }

  parseArray() {
    this.i++; // [ 或 ［
    const array = [];
    while (true) {
      this.skipSpace();
      while (this.text[this.i] === ',' || this.text[this.i] === '，') {
        this.i++;
        this.skipSpace();
      }
      const ch = this.text[this.i];
      if (ch === ']' || ch === '］') {
        this.i++;
        return array;
      }
      if (ch === undefined) this.fail('JSON 陣列沒有結尾。');
      array.push(this.parseValue());
      this.skipSpace();
    }
  }

  parseString() {
    const open = this.text[this.i];
    this.i++;
    let out = '';

    while (this.i < this.text.length) {
      const ch = this.text[this.i];

      if (ch === '\\') {
        const esc = this.text[this.i + 1];
        if (esc === undefined) {
          out += '\\';
          this.i++;
          continue;
        }
        // 結構引號被寫成 \" 時，若後面接結構字元就當成字串結尾。
        if (isQuote(esc) && structuralAt(this.text, this.i + 1)) {
          this.i += 2;
          return out;
        }
        if (esc === 'n') out += '\n';
        else if (esc === 'r') out += '\r';
        else if (esc === 't') out += '\t';
        else if (esc === 'b') out += '\b';
        else if (esc === 'f') out += '\f';
        else if (esc === 'u') {
          const hex = this.text.slice(this.i + 2, this.i + 6);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            out += String.fromCharCode(parseInt(hex, 16));
            this.i += 6;
            continue;
          }
          out += 'u';
        } else {
          out += esc;
        }
        this.i += 2;
        continue;
      }

      // 混用彎引號與 ASCII 雙引號：任何引號只要後面接結構字元，就是結尾。
      if (isQuote(ch) && structuralAt(this.text, this.i)) {
        this.i++;
        return out;
      }

      out += ch;
      this.i++;
    }

    // 容錯：沒有結尾引號時，直接把剩下的內容當成字串。
    return out;
  }

  parseBare() {
    const start = this.i;
    while (this.i < this.text.length && !/[,，}\]］\s]/.test(this.text[this.i])) this.i++;
    const raw = this.text.slice(start, this.i).trim();
    if (!raw) this.fail('JSON 值是空的。');

    const normalized = raw
      .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xFEE0))
      .replace(/[．。]/g, '.')
      .replace(/[－−]/g, '-');

    if (/^(true|false)$/i.test(normalized)) return normalized.toLowerCase() === 'true';
    if (/^null$/i.test(normalized)) return null;
    if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(normalized)) return Number(normalized);
    return raw;
  }
}

/**
 * 盡力把一段 AI 回覆解析成物件。
 * 失敗時丟出 Error；呼叫端仍要驗證 narration／memory／choices 等欄位。
 */
export function parseLooseJson(value) {
  const source = stripJsonFences(value);
  if (!source) throw new Error('回覆是空的。');

  const candidates = extractJsonCandidates(source);
  candidates.sort((a, b) => b.length - a.length);
  if (!candidates.length) candidates.push(source);

  let lastError = null;
  for (const candidate of candidates) {
    try {
      const parsed = new LooseJsonParser(candidate).parseValue();
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (error) {
      lastError = error;
    }
  }

  const error = new Error(lastError?.message || '找不到可解析的 JSON 物件。');
  if (lastError?.position !== undefined) error.position = lastError.position;
  throw error;
}
