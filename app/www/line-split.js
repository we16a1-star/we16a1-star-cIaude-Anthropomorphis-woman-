/**
 * line-split.js — 逐句演出拆句器（借鏡 AnimaVN jev.js / player.ts）
 * 
 * 核心目標：
 * 將 AI 產生的一整段 narration/dialogue 拆解成 Galgame 演出單元（Lines）。
 * 
 * 拆句原則：
 * 1. 斷句標點：句號（。）、問號（？?）、驚嘆號（！!）、省略號（……）、換行符（\n）。
 * 2. 獨立引號塊：角色說話「……」或『……』通常作為獨立的一句演出。
 * 3. 引號內的標點：引號內可能包含多個子句，但通常作為同一個人物台詞；
 *    若引號內非常長（多個句號），亦可按句號斷開；但引號開關必須完整。
 * 4. 括號動作描寫：（……）或 (……) 若前後有台詞，動作描寫或台詞可分開演出。
 */

/**
 * 檢查是否為終止型標點
 */
function isTerminator(ch) {
  return ch === '。' || ch === '！' || ch === '!' || ch === '？' || ch === '?' || ch === '\n';
}

/**
 * 切分句子
 * @param {string} text 
 * @returns {string[]}
 */
export function splitLines(text) {
  if (!text || typeof text !== 'string') return [];

  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!raw) return [];

  const lines = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';
  let inParen = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    // 引號處理
    if (!inQuote && (ch === '「' || ch === '『' || ch === '“' || ch === '"')) {
      // 如果前面已經有前置描述文字（例如「克勞德抬起頭，」），先結算出前置句
      const prevTrim = current.trim();
      if (prevTrim.length > 0) {
        lines.push(prevTrim);
        current = '';
      }
      inQuote = true;
      quoteChar = ch === '「' ? '」' : (ch === '『' ? '』' : (ch === '“' ? '”' : '"'));
      current += ch;
      continue;
    }

    if (inQuote && ch === quoteChar) {
      current += ch;
      inQuote = false;
      // 引號結束，結算此句台詞
      const quoteTrim = current.trim();
      if (quoteTrim.length > 0) {
        lines.push(quoteTrim);
        current = '';
      }
      continue;
    }

    // 括號處理（動作描寫）
    if (!inQuote && !inParen && (ch === '（' || ch === '(')) {
      const prevTrim = current.trim();
      if (prevTrim.length > 0) {
        lines.push(prevTrim);
        current = '';
      }
      inParen = true;
      current += ch;
      continue;
    }

    if (!inQuote && inParen && (ch === '）' || ch === ')')) {
      current += ch;
      inParen = false;
      // 檢查括號後面是否跟著省略號「……」
      let j = i + 1;
      while (j < raw.length && (raw[j] === '…' || raw[j] === '.')) {
        current += raw[j];
        j++;
      }
      i = j - 1;

      const parenTrim = current.trim();
      if (parenTrim.length > 0) {
        lines.push(parenTrim);
        current = '';
      }
      continue;
    }

    current += ch;

    // 省略號處理（非引號內）
    if (!inQuote && !inParen && (ch === '…' || (ch === '.' && raw[i + 1] === '.'))) {
      // 收集連續省略號
      while (i + 1 < raw.length && (raw[i + 1] === '…' || raw[i + 1] === '.')) {
        current += raw[i + 1];
        i++;
      }
      // 如果後面不是緊接著標點（例如！？），則可斷句
      if (i + 1 < raw.length && !isTerminator(raw[i + 1])) {
        const trimmed = current.trim();
        if (trimmed.length > 0) {
          lines.push(trimmed);
          current = '';
        }
      }
      continue;
    }

    // 終止型標點（。！？!?\n）
    if (!inQuote && !inParen && isTerminator(ch)) {
      // 收集連續標點
      while (i + 1 < raw.length) {
        const next = raw[i + 1];
        if (isTerminator(next) || next === '…' || next === ' ' || next === '　') {
          current += next;
          i++;
        } else {
          break;
        }
      }

      const trimmed = current.trim();
      if (trimmed.length > 0) {
        lines.push(trimmed);
        current = '';
      }
    }
  }

  const remaining = current.trim();
  if (remaining.length > 0) {
    lines.push(remaining);
  }

  return lines;
}
