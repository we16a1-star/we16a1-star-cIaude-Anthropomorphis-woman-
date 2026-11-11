// v5.0｜三層記憶（S6）：近期對話（存在 history）、長期事實、關係事件日誌。
// 純邏輯、可直接用 node --test 驗證；玩家可檢視／編輯／刪除／匯出，
// 提示詞只帶入玩家明說或程式確認過的內容，不推測。
export const MEMORY_VERSION = 2;
export const MEMORY_LIMITS = Object.freeze({
  facts: 80,
  factChars: 240,
  events: 120,
  eventChars: 260,
  summaries: 8,
  summaryChars: 600,
  compressedChars: 1200,
  promptChars: 1400
});

const clean = value => String(value == null ? '' : value)
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function makeId(prefix = 'mem') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeFact(value, index = 0) {
  if (!value || typeof value !== 'object') return null;
  const text = clean(value.text).slice(0, MEMORY_LIMITS.factChars);
  if (!text) return null;
  return {
    id: clean(value.id).slice(0, 80) || `fact_${index}`,
    text,
    source: clean(value.source).slice(0, 40) || 'story',
    at: Math.max(0, Number(value.at) || 0)
  };
}

function normalizeEvent(value, index = 0) {
  if (!value || typeof value !== 'object') return null;
  const text = clean(value.text).slice(0, MEMORY_LIMITS.eventChars);
  const herLine = clean(value.herLine).slice(0, 200);
  const playerLine = clean(value.playerLine).slice(0, 200);
  if (!text && !herLine && !playerLine) return null;
  return {
    id: clean(value.id).slice(0, 80) || `event_${index}`,
    at: Math.max(0, Number(value.at) || 0),
    kind: clean(value.kind).slice(0, 32) || 'story',
    flag: clean(value.flag).slice(0, 40),
    image: clean(value.image).slice(0, 40),
    text: text || herLine || playerLine,
    herLine,
    playerLine
  };
}

function normalizeSummary(value, index = 0) {
  if (!value || typeof value !== 'object') return null;
  const text = clean(value.text).slice(0, MEMORY_LIMITS.summaryChars);
  if (!text) return null;
  return {
    id: clean(value.id).slice(0, 80) || `summary_${index}`,
    at: Math.max(0, Number(value.at) || 0),
    text,
    covers: Math.max(0, Math.floor(Number(value.covers) || 0))
  };
}

export function normalizeMemoryStore(value, { legacyText = '', now = Date.now() } = {}) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const facts = (Array.isArray(raw.facts) ? raw.facts : []).map(normalizeFact).filter(Boolean).slice(-MEMORY_LIMITS.facts);
  const events = (Array.isArray(raw.events) ? raw.events : []).map(normalizeEvent).filter(Boolean).slice(-MEMORY_LIMITS.events);
  const summaries = (Array.isArray(raw.summaries) ? raw.summaries : []).map(normalizeSummary).filter(Boolean).slice(-MEMORY_LIMITS.summaries);
  const compressed = clean(raw.compressed).slice(0, MEMORY_LIMITS.compressedChars);
  const legacy = clean(legacyText).slice(0, MEMORY_LIMITS.promptChars);
  return {
    version: MEMORY_VERSION,
    facts,
    events,
    summaries,
    compressed,
    updatedAt: Math.max(0, Number(raw.updatedAt) || 0),
    legacy: compressed || summaries.length ? '' : legacy
  };
}

export function memoryStoreFromLegacy(legacyText, now = Date.now()) {
  const text = clean(legacyText);
  if (!text) return normalizeMemoryStore(null, { now });
  return {
    ...normalizeMemoryStore(null, { now }),
    legacy: text.slice(0, MEMORY_LIMITS.promptChars),
    updatedAt: now
  };
}

function touch(store, now = Date.now()) {
  return { ...store, version: MEMORY_VERSION, updatedAt: now };
}

export function addMemoryFact(value, text, { source = 'player', at = Date.now(), id = '' } = {}) {
  const store = normalizeMemoryStore(value, { now: at });
  const cleaned = clean(text).slice(0, MEMORY_LIMITS.factChars);
  if (!cleaned) return store;
  if (store.facts.some(fact => fact.text === cleaned)) return touch(store, at);
  const facts = [...store.facts, { id: id || makeId('fact'), text: cleaned, source: clean(source).slice(0, 40), at }]
    .slice(-MEMORY_LIMITS.facts);
  return touch({ ...store, facts }, at);
}

export function updateMemoryFact(value, id, text, now = Date.now()) {
  const store = normalizeMemoryStore(value, { now });
  const wanted = String(id || '');
  const cleaned = clean(text).slice(0, MEMORY_LIMITS.factChars);
  if (!wanted || !cleaned) return store;
  return touch({ ...store, facts: store.facts.map(fact => fact.id === wanted ? { ...fact, text: cleaned, at: now } : fact) }, now);
}

export function deleteMemoryFact(value, id, now = Date.now()) {
  const store = normalizeMemoryStore(value, { now });
  const wanted = String(id || '');
  return touch({ ...store, facts: store.facts.filter(fact => fact.id !== wanted) }, now);
}

export function addMemoryEvent(value, event = {}, now = Date.now()) {
  const store = normalizeMemoryStore(value, { now });
  const normalized = normalizeEvent({ ...event, id: event.id || makeId('event'), at: event.at || now }, store.events.length);
  if (!normalized) return store;
  return touch({ ...store, events: [...store.events, normalized].slice(-MEMORY_LIMITS.events) }, now);
}

export function deleteMemoryEvent(value, id, now = Date.now()) {
  const store = normalizeMemoryStore(value, { now });
  const wanted = String(id || '');
  return touch({ ...store, events: store.events.filter(event => event.id !== wanted) }, now);
}

export function addMemorySummary(value, text, { covers = 0, at = Date.now() } = {}) {
  let store = normalizeMemoryStore(value, { now: at });
  const cleaned = clean(text).slice(0, MEMORY_LIMITS.summaryChars);
  if (!cleaned) return store;
  const summaries = [...store.summaries, { id: makeId('summary'), at, text: cleaned, covers: Math.max(0, Math.floor(Number(covers) || 0)) }];
  while (summaries.length > MEMORY_LIMITS.summaries) {
    const oldest = summaries.shift();
    store = { ...store, compressed: clean(`${store.compressed} ${oldest.text}`).slice(-MEMORY_LIMITS.compressedChars) };
  }
  return touch({ ...store, summaries }, at);
}

/** 把模型回傳的 memory 寫入摘要層；保留舊摘要，避免長篇故事把早期伏筆洗掉。 */
export function compressTurnMemory(value, memoryText, { at = Date.now() } = {}) {
  let store = normalizeMemoryStore(value, { now: at });
  const text = clean(memoryText);
  if (!text) return store;
  const last = store.summaries.at(-1);
  if (last?.text === text) return touch(store, at);
  // 同一則完整記憶會隨回合變長；差異不大時以新內容取代，不重複堆疊。
  if (last && (last.text.includes(text) || text.includes(last.text))) {
    const merged = text.length >= last.text.length ? text : last.text;
    return touch({ ...store, summaries: [...store.summaries.slice(0, -1), { ...last, text: merged.slice(0, MEMORY_LIMITS.summaryChars), at }] }, at);
  }
  return addMemorySummary(store, text, { covers: 1, at });
}

export function memoryPromptLines(value, language = 'zh', { limit = MEMORY_LIMITS.promptChars } = {}) {
  const store = normalizeMemoryStore(value);
  const header = language === 'en' ? '【Memory · three layers】' : '【記憶・三層】';
  const lines = [];
  if (store.legacy) lines.push(store.legacy);
  if (store.compressed) lines.push((language === 'en' ? 'Earlier: ' : '較早：') + store.compressed);
  if (store.summaries.length) lines.push((language === 'en' ? 'Recent summaries:' : '近期摘要：') + store.summaries.map(item => item.text).join(' / '));
  if (store.facts.length) lines.push((language === 'en' ? 'Long-term facts: ' : '長期事實：') + store.facts.map(item => item.text).join('；'));
  if (store.events.length) {
    const recentEvents = store.events.slice(-12);
    lines.push((language === 'en' ? 'Relationship events: ' : '關係事件：') + recentEvents.map(item => {
      const date = item.at ? new Date(item.at).toISOString().slice(0, 10) : '';
      return `${date ? `[${date}] ` : ''}${item.text}`;
    }).join('；'));
  }
  if (!lines.length) return [];
  let text = lines.join('\n');
  if (text.length > limit) {
    // 先移除最舊的事件，再縮短長期事實；近期摘要與玩家明說的事實優先保留。
    const compactFacts = store.facts.map(item => item.text).join('；');
    const compactSummaries = store.summaries.map(item => item.text).join(' / ');
    const compact = [store.compressed, compactSummaries, compactFacts].filter(Boolean).join('\n');
    text = compact.length <= limit ? compact : compact.slice(-limit);
  }
  return [header, text];
}

export function memoryStats(value) {
  const store = normalizeMemoryStore(value);
  return {
    facts: store.facts.length,
    events: store.events.length,
    summaries: store.summaries.length,
    chars: memoryPromptLines(store).join('\n').length
  };
}

export function exportMemory(value) {
  const store = normalizeMemoryStore(value);
  return JSON.stringify({
    format: 'claude-memory',
    version: MEMORY_VERSION,
    exportedAt: new Date().toISOString(),
    facts: store.facts,
    events: store.events,
    summaries: store.summaries,
    compressed: store.compressed,
    legacy: store.legacy
  }, null, 2);
}

export function importMemory(value, now = Date.now()) {
  if (typeof value === 'string') {
    let parsed;
    try { parsed = JSON.parse(value); } catch { throw new Error('記憶檔不是有效的 JSON。'); }
    return importMemory(parsed, now);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('記憶檔格式不正確。');
  return normalizeMemoryStore(value, { now });
}

export function recallMemory(value, query) {
  const store = normalizeMemoryStore(value);
  const needle = clean(query).toLowerCase();
  if (!needle) return [];
  return [
    ...store.facts.map(item => ({ type: 'fact', ...item })),
    ...store.events.map(item => ({ type: 'event', ...item })),
    ...store.summaries.map(item => ({ type: 'summary', ...item }))
  ].filter(item => `${item.text} ${item.herLine || ''} ${item.playerLine || ''}`.toLowerCase().includes(needle));
}