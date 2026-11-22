/**
 * thinking-splitter.js — 串流與整段回覆之思考標籤拆分器＋思考深度參數轉譯器
 *
 * Ported from AnimaVN (MIT License, Copyright (c) 2026 JayziLi)
 * Source:
 *   - AnimaBackend/app/llm/reasoning.py (ThinkTagSplitter, _hold_partial)
 *   - AnimaBackend/app/llm/thinking.py (openai_params, anthropic_params)
 *
 * 用途：
 *   1. 自動剝離 DeepSeek R1 / Qwen / Claude Extended Thinking 等模型於正文前段輸出的
 *      <think>...</think> 或 <thinking>...</thinking> 思考過程，避免思考塊內的引號與
 *      大括號干擾故事 JSON 解析。
 *   2. 支援串流碎片切斷保護（如 "<thi" 與 "nk>" 分次抵達）。
 *   3. 若正文先出現才出現字面標籤（例如角色討論 "<think>"），視為正文內容不誤刪。
 */

export const THINK_OPEN_TAGS = Object.freeze(['<think>', '<thinking>']);

/**
 * 將緩衝區切成 [可安全輸出段, 暫留段]：若結尾恰好是任一標籤的前綴則暫留，避免串流切斷標籤。
 * @param {string} buf
 * @param {readonly string[]} tags
 * @returns {[string, string]}
 */
export function holdPartial(buf, tags) {
  let longest = 0;
  for (const tag of tags) {
    const maxLen = Math.min(tag.length - 1, buf.length);
    for (let n = maxLen; n > 0; n -= 1) {
      if (buf.endsWith(tag.slice(0, n))) {
        if (n > longest) longest = n;
        break;
      }
    }
  }
  if (longest === 0) return [buf, ''];
  return [buf.slice(0, buf.length - longest), buf.slice(buf.length - longest)];
}

/**
 * 串流思考標籤拆分狀態機（seek -> inside -> done）。
 */
export class ThinkTagSplitter {
  constructor() {
    this._buf = '';
    this._state = 'seek';
    this._close = '';
    this._emitted = false;
    this.used = false;
  }

  /**
   * 餵入一段新增文字，回傳本批次可確定的 { body, reasoning }。
   * @param {string} chunk
   * @returns {{ body: string, reasoning: string }}
   */
  feed(chunk) {
    this._buf += String(chunk || '');
    let textOut = '';
    let reasonOut = '';

    while (true) {
      if (this._state === 'seek') {
        let hit = null;
        for (const tag of THINK_OPEN_TAGS) {
          const i = this._buf.indexOf(tag);
          if (i !== -1 && (hit === null || i < hit.index)) {
            hit = { index: i, tag };
          }
        }

        if (hit !== null) {
          if (this._buf.slice(0, hit.index).trim()) {
            // 正文已先出現：後續標籤視為字面文本，不吞掉
            this._state = 'done';
            continue;
          }
          textOut += this._buf.slice(0, hit.index);
          this._buf = this._buf.slice(hit.index + hit.tag.length);
          this._close = '</' + hit.tag.slice(1);
          this._state = 'inside';
          this.used = true;
          continue;
        }

        const [safe, held] = holdPartial(this._buf, THINK_OPEN_TAGS);
        if (safe.trim()) {
          // 確認開頭非標籤前綴，整段皆為正文
          textOut += this._buf;
          this._buf = '';
          this._state = 'done';
          break;
        }
        textOut += safe;
        this._buf = held;
        break;
      }

      if (this._state === 'inside') {
        const i = this._buf.indexOf(this._close);
        if (i !== -1) {
          reasonOut += this._buf.slice(0, i);
          this._buf = this._buf.slice(i + this._close.length);
          this._state = 'done';
          continue;
        }
        const [safe, held] = holdPartial(this._buf, [this._close]);
        reasonOut += safe;
        this._buf = held;
        break;
      }

      textOut += this._buf;
      this._buf = '';
      break;
    }

    return { body: this._trim(textOut), reasoning: reasonOut };
  }

  _trim(text) {
    if (!this._emitted) {
      const trimmed = text.replace(/^\s+/, '');
      if (trimmed) this._emitted = true;
      return trimmed;
    }
    return text;
  }

  /**
   * 串流結束時清空暫留緩衝；若模型在思考中斷未閉合，未閉合段歸入 reasoning。
   * @returns {{ body: string, reasoning: string }}
   */
  flush() {
    const rest = this._buf;
    this._buf = '';
    if (this._state === 'inside') {
      return { body: '', reasoning: rest };
    }
    this._state = 'done';
    return { body: this._trim(rest), reasoning: '' };
  }
}

/**
 * 一次性將完整模型回覆拆分為 { body, reasoning, hasThinking }。
 * @param {string} text
 * @returns {{ body: string, reasoning: string, hasThinking: boolean }}
 */
export function splitThinkingText(text) {
  const raw = String(text ?? '');
  if (!raw) return { body: '', reasoning: '', hasThinking: false };
  const splitter = new ThinkTagSplitter();
  const part1 = splitter.feed(raw);
  const part2 = splitter.flush();
  return {
    body: part1.body + part2.body,
    reasoning: (part1.reasoning + part2.reasoning).trim(),
    hasThinking: splitter.used
  };
}

export const THINKING_LEVELS = Object.freeze(['off', 'low', 'high', 'max']);

/**
 * 轉譯 OpenAI 相容介面之思考深淺參數（對齊 AnimaVN thinking.py）。
 * @param {string|null|undefined} level
 * @returns {object}
 */
export function openaiThinkingParams(level) {
  if (!level || !THINKING_LEVELS.includes(level)) return {};
  if (level === 'off') return { extra_body: { thinking: { type: 'disabled' } } };
  return { reasoning_effort: level };
}

/**
 * 轉譯 Anthropic Messages API 之思考深淺參數（對齊 AnimaVN thinking.py）。
 * @param {string|null|undefined} level
 * @returns {object}
 */
export function anthropicThinkingParams(level) {
  if (!level || !THINKING_LEVELS.includes(level)) return {};
  if (level === 'off') return { extra_body: { thinking: { type: 'disabled' } } };
  return { extra_body: { output_config: { effort: level } } };
}
