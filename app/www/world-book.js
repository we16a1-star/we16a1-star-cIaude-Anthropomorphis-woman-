// 追加九：世界書（關鍵詞觸發的設定資料庫；World Info／Lorebook 精神）。
// 這裡只放與畫面無關的純邏輯，供 www/app.js（畫面與網頁提示詞）與 server/server.js（API 提示詞）
// 共用，也讓 node --test 直接測邊界。存檔欄位：
// state.worldBook＝{enabled, entries:[{id, keywords:[], text, enabled, constant, priority, scope}]}。
// 相容不變量：未啟用、沒有任何命中時，提示詞完全不追加任何行（逐字元與現行相同）。
export const WORLD_BOOK_LIMITS = {
  entries: 50,          // 條目數上限
  entryText: 800,       // 單條文字上限
  keywordsPerEntry: 8,  // 每條關鍵詞數上限
  keywordLength: 30,    // 單一關鍵詞長度上限
  injectEntries: 8,     // 一次最多注入條數
  injectChars: 1500     // 一次注入總字數上限
};
export const WORLD_BOOK_PRIORITIES = ['high', 'normal', 'low'];
export const WORLD_BOOK_SCOPES = ['all', 'chat', 'opening'];
export const WORLD_BOOK_PRIORITY_RANK = { high: 0, normal: 1, low: 2 };
export const WORLD_BOOK_HEADER = {
  zh: '世界書（命中關鍵詞，僅供參考）：',
  en: 'World Book (matched keywords; reference only):'
};

export function normalizeWorldBookEntry(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const keywords = [];
  if (Array.isArray(raw.keywords)) {
    for (const item of raw.keywords) {
      if (typeof item !== 'string') continue;
      const word = item.trim().slice(0, WORLD_BOOK_LIMITS.keywordLength);
      if (!word) continue;
      const lower = word.toLowerCase();
      if (keywords.some(existing => existing.toLowerCase() === lower)) continue;
      keywords.push(word);
      if (keywords.length >= WORLD_BOOK_LIMITS.keywordsPerEntry) break;
    }
  }
  const text = raw.text === undefined || raw.text === null ? '' : String(raw.text).trim().slice(0, WORLD_BOOK_LIMITS.entryText);
  const id = raw.id === undefined || raw.id === null ? '' : String(raw.id).trim().slice(0, 40);
  return {
    id,
    keywords,
    text,
    enabled: raw.enabled === true,
    constant: raw.constant === true,
    priority: WORLD_BOOK_PRIORITIES.includes(raw.priority) ? raw.priority : 'normal',
    scope: WORLD_BOOK_SCOPES.includes(raw.scope) ? raw.scope : 'all'
  };
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
  return { enabled: raw.enabled === true, entries };
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

// 先收集全部命中→排序（priority→常駐→原索引）→再取 8 條；不可先截斷再排序。
function collectWorldBookMatches(book, haystack, ctx) {
  const safe = normalizeWorldBook(book);
  if (!safe.enabled) return [];
  const hay = String(haystack === undefined || haystack === null ? '' : haystack).toLowerCase();
  const phase = phaseOf(ctx);
  const matches = [];
  safe.entries.forEach((entry, index) => {
    if (!entry.enabled || !entry.text || !scopeAllows(entry, phase)) return;
    if (entry.constant) {
      matches.push({ index, entry, matchedKeywords: [], reason: 'constant' });
      return;
    }
    if (!entry.keywords.length) return;
    const matchedKeywords = entry.keywords.filter(word => hay.includes(word.toLowerCase()));
    if (matchedKeywords.length) matches.push({ index, entry, matchedKeywords, reason: 'keyword' });
  });
  matches.sort((a, b) =>
    (WORLD_BOOK_PRIORITY_RANK[a.entry.priority] - WORLD_BOOK_PRIORITY_RANK[b.entry.priority]) ||
    (Number(b.entry.constant) - Number(a.entry.constant)) ||
    (a.index - b.index)
  );
  return matches;
}

// 命中規則：關鍵詞子字串、不分大小寫；常駐條目不需關鍵詞；總開關與條目都要啟用。
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
export function worldBookPromptLines(book, haystack, lang, ctx) {
  const hits = matchWorldBook(book, haystack, ctx);
  if (!hits.length) return [];
  const lines = [lang === 'en' ? WORLD_BOOK_HEADER.en : WORLD_BOOK_HEADER.zh];
  let budget = WORLD_BOOK_LIMITS.injectChars;
  for (const entry of hits) {
    if (entry.text.length > budget) break;
    budget -= entry.text.length;
    lines.push(entry.text);
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
