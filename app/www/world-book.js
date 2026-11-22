// 追加九：世界書（關鍵詞觸發的設定資料庫；World Info／Lorebook 精神）。
// 進階匹配引擎（正則關鍵詞、選擇性副關鍵詞邏輯、遞迴掃描）移植自 AnimaVN
// （MIT License, Copyright (c) 2026 JayziLi；來源 frontend/src/debug/lib/worldInfo.ts）。
// 這裡只放與畫面無關的純邏輯，供 www/app.js（畫面與網頁提示詞）與 server/server.js（API 提示詞）
// 共用，也讓 node --test 直接測邊界。存檔欄位：
// state.worldBook＝{enabled, recursive?, maxRecursionSteps?, entries:[{id, keywords:[], secondaryKeys?, selectiveLogic?, text, enabled, constant, priority, scope}]}。
// 相容不變量：未啟用、沒有任何命中時，提示詞完全不追加任何行（逐字元與現行相同）。
export const WORLD_BOOK_LIMITS = {
  entries: 50,          // 條目數上限
  entryText: 800,       // 單條文字上限
  keywordsPerEntry: 8,  // 每條關鍵詞數上限
  keywordLength: 30,    // 單一關鍵詞長度上限
  injectEntries: 8,     // 一次最多注入條數
  injectChars: 1500,    // 一次注入總字數上限
  maxRecursionSteps: 4  // 遞迴掃描步數安全上限
};
export const WORLD_BOOK_PRIORITIES = ['high', 'normal', 'low'];
export const WORLD_BOOK_SCOPES = ['all', 'chat', 'opening'];
export const WORLD_BOOK_PRIORITY_RANK = { high: 0, normal: 1, low: 2 };
export const WORLD_BOOK_SELECTIVE_LOGIC = Object.freeze({
  AND_ANY: 'AND_ANY',
  AND_ALL: 'AND_ALL',
  NOT_ANY: 'NOT_ANY',
  NOT_ALL: 'NOT_ALL'
});
const VALID_SELECTIVE_LOGICS = new Set(Object.values(WORLD_BOOK_SELECTIVE_LOGIC));

export const WORLD_BOOK_HEADER = {
  zh: '世界書（命中關鍵詞，僅供參考）：',
  en: 'World Book (matched keywords; reference only):'
};

/**
 * 移植自 AnimaVN worldInfo.ts：解析 `/pattern/flags` 格式為 RegExp；非此格式或語法無效回傳 null。
 * @param {string} input
 * @returns {RegExp|null}
 */
export function parseRegexFromString(input) {
  if (typeof input !== 'string') return null;
  const match = input.match(/^\/([\s\S]+?)\/([gimsuy]*)$/);
  if (!match) return null;
  const [, pattern, rawFlags] = match;
  if (!pattern || pattern.length > 64) return null;
  const safeFlags = rawFlags.replace(/g/g, '');
  try {
    return new RegExp(pattern, safeFlags || 'i');
  } catch (_) {
    return null;
  }
}

function normalizeKeywordList(list) {
  const keywords = [];
  if (Array.isArray(list)) {
    for (const item of list) {
      if (typeof item !== 'string') continue;
      const word = item.trim().slice(0, WORLD_BOOK_LIMITS.keywordLength);
      if (!word) continue;
      const lower = word.toLowerCase();
      if (keywords.some(existing => existing.toLowerCase() === lower)) continue;
      keywords.push(word);
      if (keywords.length >= WORLD_BOOK_LIMITS.keywordsPerEntry) break;
    }
  }
  return keywords;
}

export function normalizeWorldBookEntry(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const keywords = normalizeKeywordList(raw.keywords);
  const secondaryKeys = normalizeKeywordList(raw.secondaryKeys);
  const text = raw.text === undefined || raw.text === null ? '' : String(raw.text).trim().slice(0, WORLD_BOOK_LIMITS.entryText);
  const id = raw.id === undefined || raw.id === null ? '' : String(raw.id).trim().slice(0, 40);
  const entry = {
    id,
    keywords,
    text,
    enabled: raw.enabled === true,
    constant: raw.constant === true,
    priority: WORLD_BOOK_PRIORITIES.includes(raw.priority) ? raw.priority : 'normal',
    scope: WORLD_BOOK_SCOPES.includes(raw.scope) ? raw.scope : 'all'
  };
  if (secondaryKeys.length > 0) {
    entry.secondaryKeys = secondaryKeys;
    entry.selectiveLogic = VALID_SELECTIVE_LOGICS.has(raw.selectiveLogic)
      ? raw.selectiveLogic
      : WORLD_BOOK_SELECTIVE_LOGIC.AND_ANY;
  }
  if (raw.preventRecursion === true) entry.preventRecursion = true;
  if (raw.excludeRecursion === true) entry.excludeRecursion = true;
  return entry;
}

export function normalizeWorldBook(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const list = Array.isArray(raw.entries) ? raw.entries : [];
  const entries = [];
  for (const item of list) {
    const entry = normalizeWorldBookEntry(item);
    if (!entry.id && !entry.keywords.length && !entry.text) continue;
    entries.push(entry);
    if (entries.length >= WORLD_BOOK_LIMITS.entries) break;
  }
  const book = { enabled: raw.enabled === true, entries };
  if (raw.recursive === true) {
    book.recursive = true;
    const steps = Number(raw.maxRecursionSteps);
    book.maxRecursionSteps = Number.isFinite(steps) && steps > 0
      ? Math.min(WORLD_BOOK_LIMITS.maxRecursionSteps, Math.floor(steps))
      : WORLD_BOOK_LIMITS.maxRecursionSteps;
  }
  return book;
}

// ctx.phase＝'opening'｜'chat'；舊呼叫未帶 phase＝不啟用作用域過濾，維持原輸出。
function phaseOf(ctx) {
  if (typeof ctx === 'string') return ctx === 'opening' || ctx === 'chat' ? ctx : '';
  return ctx && (ctx.phase === 'opening' || ctx.phase === 'chat') ? ctx.phase : '';
}
function scopeAllows(entry, phase) {
  if (!phase) return true;
  return entry.scope === 'all' || entry.scope === phase;
}

/**
 * 檢查單一關鍵詞（支援 `/regex/flags` 或一般不分大小寫子字串）是否命中目標文字。
 */
function matchesSingleKey(word, rawHaystack, lowerHaystack) {
  const rx = parseRegexFromString(word);
  if (rx) return rx.test(rawHaystack);
  return lowerHaystack.includes(word.toLowerCase());
}

/**
 * 移植自 AnimaVN worldInfo.ts：評估選擇性副關鍵詞（AND_ANY / AND_ALL / NOT_ANY / NOT_ALL）。
 */
function satisfiesSecondaryKeys(entry, rawHaystack, lowerHaystack) {
  if (!Array.isArray(entry.secondaryKeys) || entry.secondaryKeys.length === 0) return true;
  const logic = entry.selectiveLogic || WORLD_BOOK_SELECTIVE_LOGIC.AND_ANY;
  const hits = entry.secondaryKeys.map(k => matchesSingleKey(k, rawHaystack, lowerHaystack));
  if (logic === WORLD_BOOK_SELECTIVE_LOGIC.AND_ALL) return hits.every(Boolean);
  if (logic === WORLD_BOOK_SELECTIVE_LOGIC.NOT_ANY) return hits.every(h => !h);
  if (logic === WORLD_BOOK_SELECTIVE_LOGIC.NOT_ALL) return !hits.every(Boolean);
  return hits.some(Boolean); // AND_ANY
}

// 先收集全部命中（若開啟 recursive 則進行多輪遞迴掃描）→ 排序（priority→常駐→原索引）→ 再取 8 條；不可先截斷再排序。
function collectWorldBookMatches(book, haystack, ctx) {
  const safe = normalizeWorldBook(book);
  if (!safe.enabled) return [];
  const baseRaw = String(haystack === undefined || haystack === null ? '' : haystack);
  const phase = phaseOf(ctx);
  const recursive = safe.recursive === true || Boolean(ctx && typeof ctx === 'object' && ctx.recursive === true);
  const maxSteps = recursive
    ? Math.max(1, Math.min(WORLD_BOOK_LIMITS.maxRecursionSteps, Number(ctx?.maxRecursionSteps || safe.maxRecursionSteps) || WORLD_BOOK_LIMITS.maxRecursionSteps))
    : 1;

  const matchedMap = new Map();
  let scanRaw = baseRaw;

  for (let step = 0; step < maxSteps; step += 1) {
    const scanLower = scanRaw.toLowerCase();
    const newlyTriggeredTexts = [];

    safe.entries.forEach((entry, index) => {
      if (matchedMap.has(index)) return;
      if (!entry.enabled || !entry.text || !scopeAllows(entry, phase)) return;
      if (step > 0 && entry.excludeRecursion) return;

      if (entry.constant) {
        matchedMap.set(index, { index, entry, matchedKeywords: [], reason: 'constant', recursionStep: step });
        if (!entry.preventRecursion) newlyTriggeredTexts.push(entry.text);
        return;
      }
      if (!entry.keywords.length) return;
      const matchedKeywords = entry.keywords.filter(word => matchesSingleKey(word, scanRaw, scanLower));
      if (!matchedKeywords.length) return;
      if (!satisfiesSecondaryKeys(entry, scanRaw, scanLower)) return;

      matchedMap.set(index, {
        index,
        entry,
        matchedKeywords,
        reason: step > 0 ? 'recursive' : 'keyword',
        recursionStep: step
      });
      if (!entry.preventRecursion) newlyTriggeredTexts.push(entry.text);
    });

    if (!recursive || newlyTriggeredTexts.length === 0) break;
    scanRaw = scanRaw + '\n' + newlyTriggeredTexts.join('\n');
  }

  const matches = [...matchedMap.values()];
  matches.sort((a, b) =>
    (WORLD_BOOK_PRIORITY_RANK[a.entry.priority] - WORLD_BOOK_PRIORITY_RANK[b.entry.priority]) ||
    (Number(b.entry.constant) - Number(a.entry.constant)) ||
    (a.index - b.index)
  );
  return matches;
}

// 命中規則：關鍵詞子字串（或 /正則/）、選擇性副鍵、不分大小寫；常駐條目不需關鍵詞；總開關與條目都要啟用。
export function matchWorldBook(book, haystack, ctx) {
  return collectWorldBookMatches(book, haystack, ctx)
    .slice(0, WORLD_BOOK_LIMITS.injectEntries)
    .map(hit => hit.entry);
}

// 只供 UI 預覽／測試：回傳排序後的全部命中（尚未套 8 條上限），並附命中詞與原因。
export function matchWorldBookDetailed(book, haystack, ctx) {
  return collectWorldBookMatches(book, haystack, ctx);
}

// 產生要追加進提示詞的行；沒有命中＝回空陣列（呼叫端據此完全不追加）。
// 支援可選 ctx.substitute(text) 宏替換（例如注入 evaluateMacros），未提供時逐字保持原樣。
export function worldBookPromptLines(book, haystack, lang, ctx) {
  const hits = matchWorldBook(book, haystack, ctx);
  if (!hits.length) return [];
  const sub = ctx && typeof ctx === 'object' && typeof ctx.substitute === 'function' ? ctx.substitute : null;
  const lines = [lang === 'en' ? WORLD_BOOK_HEADER.en : WORLD_BOOK_HEADER.zh];
  let budget = WORLD_BOOK_LIMITS.injectChars;
  for (const entry of hits) {
    const rendered = sub ? String(sub(entry.text) ?? '') : entry.text;
    if (!rendered || rendered.length > budget) break;
    budget -= rendered.length;
    lines.push(rendered);
  }
  return lines.length > 1 ? lines : [];
}

// 預覽與實際注入共用同一個挑選器；lines 逐字元等於 worldBookPromptLines。
export function worldBookPreview(book, haystack, lang, ctx) {
  const matched = matchWorldBookDetailed(book, haystack, ctx);
  const selected = matched.slice(0, WORLD_BOOK_LIMITS.injectEntries);
  let budget = WORLD_BOOK_LIMITS.injectChars;
  const included = [];
  for (const hit of selected) {
    if (hit.entry.text.length > budget) break;
    budget -= hit.entry.text.length;
    included.push(hit);
  }
  const lines = included.length
    ? [lang === 'en' ? WORLD_BOOK_HEADER.en : WORLD_BOOK_HEADER.zh, ...included.map(hit => hit.entry.text)]
    : [];
  return {
    count: matched.length,
    chars: included.reduce((sum, hit) => sum + hit.entry.text.length, 0),
    lines,
    matched,
    truncated: included.length < matched.length
  };
}

export const WORLD_BOOK_EXPORT_FORMAT = 'claude-novel-worldbook';

// 單書／裸書／kit 三型共用；kit 只取 payload.worldBook，不碰其他資料。
export function parseWorldBookImport(value) {
  const raw = value && typeof value === 'object' ? value : null;
  let source = '';
  let book = null;
  if (raw && raw.format === WORLD_BOOK_EXPORT_FORMAT && raw.book && typeof raw.book === 'object') {
    source = 'single';
    book = raw.book;
  } else if (raw && raw.app === 'cioudo10' && raw.payload && typeof raw.payload === 'object' && raw.payload.worldBook !== undefined) {
    source = 'kit';
    book = raw.payload.worldBook;
  } else if (raw && (Array.isArray(raw.entries) || raw.enabled !== undefined)) {
    source = 'bare';
    book = raw;
  }
  if (!source) return { ok: false, error: 'format', source: '' };
  const normalized = normalizeWorldBook(book);
  if (!normalized.entries.length) return { ok: false, error: 'empty', source };
  const rawCount = Array.isArray(book.entries) ? book.entries.length : 0;
  return { ok: true, source, book: normalized, truncated: rawCount > WORLD_BOOK_LIMITS.entries };
}

export function worldBookEntryKey(entry) {
  const id = String(entry && entry.id !== undefined && entry.id !== null ? entry.id : '').trim();
  if (id) return 'id:' + id;
  const first = Array.isArray(entry && entry.keywords) && entry.keywords.length ? entry.keywords[0] : '';
  return 'fallback:' + String(first).toLowerCase() + '|' + String(entry && entry.text !== undefined ? entry.text : '');
}

// 合併＝保留現有＋只加不重複；覆蓋＝同鍵換成匯入版；略過＝同鍵保留現有。
// 回傳的 enabled 固定沿用目前總開關，匯入不自動開主開關。
export function mergeWorldBookEntries(currentBook, importedBook, mode = 'merge') {
  const safeMode = ['merge', 'overwrite', 'skip'].includes(mode) ? mode : 'merge';
  const current = normalizeWorldBook(currentBook);
  const incoming = normalizeWorldBook(importedBook);
  const entries = current.entries.slice();
  const indexByKey = new Map();
  entries.forEach((entry, index) => indexByKey.set(worldBookEntryKey(entry), index));
  let added = 0;
  let overwritten = 0;
  let skipped = 0;
  let truncated = false;
  for (const entry of incoming.entries) {
    const key = worldBookEntryKey(entry);
    if (indexByKey.has(key)) {
      if (safeMode === 'overwrite') {
        entries[indexByKey.get(key)] = entry;
        overwritten++;
      } else {
        skipped++;
      }
      continue;
    }
    if (entries.length >= WORLD_BOOK_LIMITS.entries) {
      skipped++;
      truncated = true;
      continue;
    }
    indexByKey.set(key, entries.length);
    entries.push(entry);
    added++;
  }
  return { book: { enabled: current.enabled, entries }, added, overwritten, skipped, truncated };
}

export function exportWorldBook(book) {
  return {
    format: WORLD_BOOK_EXPORT_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    book: normalizeWorldBook(book)
  };
}
