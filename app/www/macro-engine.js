/**
 * macro-engine.js — 酒館相容宏展開引擎（純函式、零 DOM 依賴）
 *
 * Ported from AnimaVN (MIT License, Copyright (c) 2026 JayziLi)
 * Source:
 *   - frontend/src/debug/lib/macroEngine.ts
 *   - frontend/src/debug/lib/macroDefs.ts
 *
 * 支援核心宏（大小寫不分，支援雙冒號 `::` 或單冒號 `:` 參數）：
 *   - 角色／玩家：`{{char}}`, `{{user}}`, `{玩家名}`, `{暱稱}`
 *   - 時間與日期：`{{time}}`, `{{date}}`, `{{weekday}}`, `{{datetimeformat::YYYY/MM/DD HH:mm}}`, `{{idle_duration}}`
 *   - 隨機與骰子：`{{roll::1d6+2}}`（上限 1000 顆防卡頓）, `{{random::a::b::c}}`, `{{pick::a::b::c}}`（文本定種子）
 *   - 變數與條件：`{{getvar::k}}`, `{{setvar::k::v}}`, `{{addvar::k::n}}`, `{{if cond}}A{{else}}B{{/if}}`
 *   - 工具：`{{trim}}`, `{{// 註解}}`
 */

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const WEEKDAYS_SHORT = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
const MAX_DICE = 1000;
const MAX_NESTED_PASSES = 6;

const pad = (n, width = 2) => String(n).padStart(width, '0');

/** 穩定 32-bit 字串雜湊（FNV-1a，供 {{pick}} 定種子用） */
export function stringHash(text) {
  let h = 2166136261 >>> 0;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** 繁體中文日期時間格式化（移植自 AnimaVN macroDefs.ts formatDate） */
export function formatDate(d, format = 'YYYY/MM/DD HH:mm') {
  const date = d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date();
  const H = date.getHours();
  const h = H % 12 || 12;
  const meridiem = H < 6 ? '凌晨' : H < 9 ? '早上' : H < 12 ? '上午' : H < 13 ? '中午' : H < 18 ? '下午' : '晚上';
  const tokens = {
    YYYY: () => String(date.getFullYear()),
    YY: () => pad(date.getFullYear() % 100),
    MMMM: () => `${date.getMonth() + 1}月`,
    MMM: () => `${date.getMonth() + 1}月`,
    MM: () => pad(date.getMonth() + 1),
    M: () => String(date.getMonth() + 1),
    DD: () => pad(date.getDate()),
    D: () => String(date.getDate()),
    dddd: () => WEEKDAYS[date.getDay()],
    ddd: () => WEEKDAYS_SHORT[date.getDay()],
    HH: () => pad(H),
    H: () => String(H),
    hh: () => pad(h),
    h: () => String(h),
    mm: () => pad(date.getMinutes()),
    m: () => String(date.getMinutes()),
    ss: () => pad(date.getSeconds()),
    s: () => String(date.getSeconds()),
    SSS: () => pad(date.getMilliseconds(), 3),
    A: () => meridiem,
    a: () => meridiem,
    X: () => String(Math.floor(date.getTime() / 1000)),
    x: () => String(date.getTime()),
    LTS: () => `${pad(H)}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
    LT: () => `${pad(H)}:${pad(date.getMinutes())}`,
    LL: () => `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`,
    L: () => `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
  };
  return String(format).replace(
    /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|m|ss|s|SSS|A|a|X|x|LTS|LT|LL|L/g,
    (token, literal) => (literal !== undefined ? literal : tokens[token]())
  );
}

/** 毫秒時長轉自然繁體中文（移植自 AnimaVN humanizeDuration） */
export function humanizeDuration(ms) {
  const seconds = Math.round(Math.abs(Number(ms) || 0) / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  const months = Math.round(days / 30.4375);
  const years = Math.round(days / 365.25);
  if (seconds < 45) return '幾秒';
  if (seconds < 90) return '1 分鐘';
  if (minutes < 45) return `${minutes} 分鐘`;
  if (minutes < 90) return '1 小時';
  if (hours < 22) return `${hours} 小時`;
  if (hours < 36) return '1 天';
  if (days < 26) return `${days} 天`;
  if (days < 45) return '1 個月';
  if (days < 320) return `${months} 個月`;
  if (days < 548) return '1 年';
  return `${years} 年`;
}

/** 骰子公式 NdM±K（單純數字視為 1dN；上限 1000 顆防惡意卡死） */
export function rollDice(formula, randomFn = Math.random) {
  const clean = String(formula || '').trim();
  const text = /^\d+$/.test(clean) ? `1d${clean}` : clean;
  const m = /^([1-9]\d*)?d([1-9]\d*)([+-]\d+)?$/i.exec(text);
  if (!m) return null;
  const count = m[1] ? Number(m[1]) : 1;
  if (count > MAX_DICE) return null;
  const sides = Number(m[2]);
  let total = m[3] ? Number(m[3]) : 0;
  for (let i = 0; i < count; i += 1) {
    total += Math.floor(randomFn() * sides) + 1;
  }
  return total;
}

function splitMacroList(raw) {
  const s = String(raw ?? '');
  if (s.includes('::')) return s.split('::').map(x => x.trim()).filter(Boolean);
  return s
    .replace(/\\,/g, '\u0001')
    .split(',')
    .map(x => x.trim().replace(/\u0001/g, ','))
    .filter(Boolean);
}

function isFalsyCondition(val) {
  const s = String(val ?? '').trim().toLowerCase();
  return s === '' || s === '0' || s === 'false' || s === 'no' || s === 'null' || s === 'undefined';
}

function seededRandom(seedNum) {
  // Mulberry32 單步決定性亂數（0 <= r < 1）
  let t = (seedNum + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * 建立標準宏求值環境。
 */
export function createMacroEnv(options = {}) {
  const userName = String(options.user || options.playerName || 'User');
  const nickname = String(options.nickname || options.playerNickname || userName);
  const charName = String(options.char || options.characterName || 'Claude娘');
  return {
    char: charName,
    user: userName,
    nickname,
    vars: options.vars && typeof options.vars === 'object' ? { ...options.vars } : {},
    custom: options.custom && typeof options.custom === 'object' ? { ...options.custom } : {},
    lastMessage: String(options.lastMessage || ''),
    idleMs: Number.isFinite(Number(options.idleMs)) ? Number(options.idleMs) : 0,
    now: typeof options.now === 'function' ? options.now : () => new Date(),
    random: typeof options.random === 'function' ? options.random : () => Math.random()
  };
}

function evalSingleMacro(inner, env, contentHash, offset) {
  const trimmed = inner.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//')) return '';

  // 解析名稱與參數：優先 `::`，相容老寫法 `:`
  let name = trimmed;
  let rest = '';
  const dbl = trimmed.indexOf('::');
  const sgl = trimmed.indexOf(':');
  if (dbl !== -1 && (sgl === -1 || dbl <= sgl)) {
    name = trimmed.slice(0, dbl).trim();
    rest = trimmed.slice(dbl + 2);
  } else if (sgl !== -1) {
    name = trimmed.slice(0, sgl).trim();
    rest = trimmed.slice(sgl + 1);
  }

  const key = name.toLowerCase();
  const d = env.now();

  if (key === 'char') return env.char;
  if (key === 'user') return env.user;
  if (key === 'time') return formatDate(d, 'LT');
  if (key === 'date') return formatDate(d, 'LL');
  if (key === 'weekday') return formatDate(d, 'dddd');
  if (key === 'datetimeformat') return formatDate(d, rest.trim() || 'YYYY/MM/DD HH:mm');
  if (key === 'idle_duration') return humanizeDuration(env.idleMs);
  if (key === 'lastmessage') return env.lastMessage;
  if (key === 'trim') return '\u0002TRIM\u0002';

  if (key === 'roll') {
    const res = rollDice(rest, () => env.random(`${offset}:${inner}`));
    return res === null ? null : String(res);
  }
  if (key === 'random') {
    const items = splitMacroList(rest);
    if (!items.length) return '';
    const idx = Math.floor(env.random(`${offset}:${inner}`) * items.length) % items.length;
    return items[idx];
  }
  if (key === 'pick') {
    const items = splitMacroList(rest);
    if (!items.length) return '';
    const r = seededRandom(contentHash ^ stringHash(`${offset}:${rest}`));
    const idx = Math.floor(r * items.length) % items.length;
    return items[idx];
  }
  if (key === 'getvar') {
    const varName = rest.trim();
    return varName && env.vars[varName] !== undefined ? String(env.vars[varName]) : '';
  }
  if (key === 'setvar') {
    const parts = rest.split('::');
    const varName = (parts[0] || '').trim();
    const value = parts.slice(1).join('::');
    if (varName) env.vars[varName] = value;
    return '';
  }
  if (key === 'addvar') {
    const parts = rest.split('::');
    const varName = (parts[0] || '').trim();
    const delta = Number(parts[1]);
    if (varName && Number.isFinite(delta)) {
      const cur = Number(env.vars[varName]);
      env.vars[varName] = (Number.isFinite(cur) ? cur : 0) + delta;
    }
    return '';
  }
  if (env.custom && Object.prototype.hasOwnProperty.call(env.custom, key)) {
    return String(env.custom[key]);
  }
  return null;
}

/**
 * 展開文本中的所有 `{{...}}` 宏與 `{玩家名}`／`{暱稱}` 佔位符。
 * 若文本不含任何宏標記則直接原樣回傳（零開銷）。
 * @param {string} text
 * @param {object} [envOrOptions]
 * @returns {string}
 */
export function evaluateMacros(text, envOrOptions = {}) {
  if (text === null || text === undefined) return '';
  const raw = String(text);
  if (!raw.includes('{{') && !raw.includes('{玩家名}') && !raw.includes('{暱稱}')) {
    return raw;
  }

  const env = (envOrOptions && typeof envOrOptions.now === 'function' && typeof envOrOptions.random === 'function')
    ? envOrOptions
    : createMacroEnv(envOrOptions);
  const contentHash = stringHash(raw);

  let out = raw
    .replace(/\{玩家名\}/g, env.user)
    .replace(/\{暱稱\}/g, env.nickname);

  // 先展開最內層 {{...}} 單宏（支援有限層巢狀，如 {{random::{{char}}::{{user}}}}）
  for (let pass = 0; pass < MAX_NESTED_PASSES; pass += 1) {
    let changed = false;

    // 處理成對條件塊 {{if cond}}...{{else}}...{{/if}}（先從最內層展開，允許塊內含單層 {{else}}）
    out = out.replace(/\{\{\s*if(?:::|\s+)([^{}]+?)\}\}((?:[^{}]|\{\{\s*else\s*\}\})*?)\{\{\s*\/if\s*\}\}/gi, (_, condRaw, body) => {
      changed = true;
      const elseMatch = /\{\{\s*else\s*\}\}/i.exec(body);
      const trueBranch = elseMatch ? body.slice(0, elseMatch.index) : body;
      const falseBranch = elseMatch ? body.slice(elseMatch.index + elseMatch[0].length) : '';
      return isFalsyCondition(condRaw) ? falseBranch : trueBranch;
    });

    // 處理一般單宏（不含內層 {{ }}）
    out = out.replace(/\{\{([^{}]+?)\}\}/g, (full, inner, offset) => {
      if (/^\s*(?:if\b|else\b|\/if\b)/i.test(inner)) return full;
      const evaluated = evalSingleMacro(inner, env, contentHash, offset);
      if (evaluated === null) return full;
      changed = true;
      return evaluated;
    });

    if (!changed) break;
  }

  if (out.includes('\u0002TRIM\u0002')) {
    out = out.replace(/\s*\u0002TRIM\u0002\s*/g, '');
  }
  return out;
}
