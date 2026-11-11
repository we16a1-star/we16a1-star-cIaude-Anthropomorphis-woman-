// v5.0｜11 個擴充機制（S8/S18）：共讀、相處風格、存檔備份、回憶卡、關鍵選項、
// 信匣、手冊共筆、紀念日、小禮物、心情打卡、小遊戲。
// 全部可關閉；好感加成合計每日 ≤3，仍受每日 +10 總上限約束；錯過不扣分。
import { GAME_CONFIG } from './config-loader.js';
import { dailyRelationshipKey } from './relationship.js';

const CONFIG = GAME_CONFIG.expansion;
const clean = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
const makeId = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const localDayKey = date => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const MECHANISM_KEYS = CONFIG.mechanisms.map(item => item.key);
export const EXPANSION_KEYS = Object.freeze(MECHANISM_KEYS);

export function defaultExpansionEnabled() {
  return Object.fromEntries(CONFIG.mechanisms.map(item => [item.key, item.default === true]));
}

export function normalizeExpansionEnabled(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(CONFIG.mechanisms.map(item => [item.key, typeof raw[item.key] === 'boolean' ? raw[item.key] : item.default === true]));
}

export function normalizeInteractionStyle(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const result = {};
  for (const [key, def] of Object.entries(CONFIG.interactionStyle)) {
    result[key] = def.options.includes(raw[key]) ? raw[key] : def.default;
  }
  return result;
}

export function normalizeExpansionDaily(value, key = '') {
  const raw = value && typeof value === 'object' ? value : {};
  const sameDay = String(raw.key || '') === String(key || '');
  return {
    key: String(key || ''),
    gain: sameDay ? Math.max(0, Math.round((Number(raw.gain) || 0) * 100) / 100) : 0
  };
}

/** 擴充機制合計每日 +3；回傳實際可加值（不直接改好感）。 */
export function applyExpansionGain(value, requested, { key = '', cap = GAME_CONFIG.stages.thresholds.expansionDailyGainCap } = {}) {
  const daily = normalizeExpansionDaily(value, key);
  const amount = Math.max(0, Number(requested) || 0);
  const gain = Math.min(amount, Math.max(0, Number(cap) - daily.gain));
  return { daily: { ...daily, gain: Math.round((daily.gain + gain) * 100) / 100 }, gain, requested: amount };
}

export function expansionEnabled(value, key) {
  const enabled = normalizeExpansionEnabled(value?.enabled || value);
  return enabled[key] === true;
}

export function toggleExpansionEnabled(value, key, enabled) {
  if (!MECHANISM_KEYS.includes(key)) return normalizeExpansionEnabled(value);
  return { ...normalizeExpansionEnabled(value), [key]: enabled === true };
}

export function normalizeExpansionState(value, now = new Date()) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const dayKey = dailyRelationshipKey({}, now);
  return {
    version: 2,
    enabled: normalizeExpansionEnabled(raw.enabled),
    style: normalizeInteractionStyle(raw.style),
    daily: normalizeExpansionDaily(raw.daily, dayKey),
    coReading: {
      active: raw.coReading?.active === true,
      startedAt: Math.max(0, Number(raw.coReading?.startedAt) || 0),
      endsAt: Math.max(0, Number(raw.coReading?.endsAt) || 0),
      minutes: clamp(Number(raw.coReading?.minutes) || CONFIG.coReading.defaultMinutes, 1, 240),
      lastRewardKey: String(raw.coReading?.lastRewardKey || '')
    },
    cards: (Array.isArray(raw.cards) ? raw.cards : []).map(card => ({
      id: clean(card?.id).slice(0, 80) || makeId('card'),
      at: Math.max(0, Number(card?.at) || 0),
      title: clean(card?.title).slice(0, 80),
      sceneImage: clean(card?.sceneImage).slice(0, 40),
      herLine: clean(card?.herLine).slice(0, 240),
      playerLine: clean(card?.playerLine).slice(0, 240),
      memoryFactId: clean(card?.memoryFactId).slice(0, 80)
    })).filter(card => card.herLine || card.playerLine || card.title).slice(-CONFIG.memoryCards.max),
    letters: (Array.isArray(raw.letters) ? raw.letters : []).map(letter => ({
      id: clean(letter?.id).slice(0, 80) || makeId('letter'),
      at: Math.max(0, Number(letter?.at) || 0),
      dueAt: Math.max(0, Number(letter?.dueAt) || 0),
      text: clean(letter?.text).slice(0, 1200),
      repliedAt: Math.max(0, Number(letter?.repliedAt) || 0),
      reply: clean(letter?.reply).slice(0, 1200)
    })).filter(letter => letter.text).slice(-CONFIG.letterBox.maxLetters),
    handbook: {
      completed: [...new Set((Array.isArray(raw.handbook?.completed) ? raw.handbook.completed : []).map(String))],
      rounds: raw.handbook?.rounds && typeof raw.handbook.rounds === 'object' ? { ...raw.handbook.rounds } : {}
    },
    anniversary: {
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.anniversary?.startDate || '')) ? String(raw.anniversary.startDate) : localDayKey(now),
      birthday: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.anniversary?.birthday || '')) ? String(raw.anniversary.birthday) : '',
      celebrated: [...new Set((Array.isArray(raw.anniversary?.celebrated) ? raw.anniversary.celebrated : []).map(String))]
    },
    gifts: {
      lastKey: String(raw.gifts?.lastKey || ''),
      given: (Array.isArray(raw.gifts?.given) ? raw.gifts.given : []).slice(-60)
    },
    mood: (Array.isArray(raw.mood) ? raw.mood : []).map(entry => {
      const at = Math.max(0, Number(entry?.at) || (now instanceof Date ? now.getTime() : new Date(now).getTime()));
      return {
        at,
        key: /^\d{4}-\d{2}-\d{2}$/.test(String(entry?.key || '')) ? String(entry.key) : localDayKey(new Date(at)),
        tag: clean(entry?.tag).slice(0, 12),
        note: clean(entry?.note).slice(0, 160)
      };
    }).filter(entry => entry.tag).slice(-60),
    backups: {
      lastAt: Math.max(0, Number(raw.backups?.lastAt) || 0),
      slots: (Array.isArray(raw.backups?.slots) ? raw.backups.slots : []).slice(-CONFIG.saveBackup.keep)
    }
  };
}

export function interactionStylePromptLines(value, language = 'zh') {
  const style = normalizeInteractionStyle(value?.style || value);
  const hard = CONFIG.interactionStyle.hardheaded;
  const density = CONFIG.interactionStyle.actionDensity;
  const length = CONFIG.interactionStyle.replyLength;
  if (language === 'en') {
    return [`【Interaction style】stubbornness=${hard.labels.en[style.hardheaded]}, actions per reply=${density.counts[style.actionDensity]}, reply length=${length.labels.en[style.replyLength]} (about ${length.maxChars[style.replyLength]} characters max). This only adjusts tone and length; the character boundaries never change.`];
  }
  return [`【相處風格】嘴硬濃度=${hard.labels.zh[style.hardheaded]}，每則動作=${density.counts[style.actionDensity]} 個，回覆長度=${length.labels.zh[style.replyLength]}（最多約 ${length.maxChars[style.replyLength]} 字）。只調整語氣與篇幅，人設界線不可調。`];
}

export function expansionPromptLines(value, language = 'zh', { now = new Date(), mood = false } = {}) {
  const state = normalizeExpansionState(value, now);
  const lines = [...interactionStylePromptLines(state, language)];
  if (mood && state.enabled.mood) {
    const recent = state.mood.slice(-3);
    if (recent.length) {
      lines.push(language === 'en'
        ? `【Mood check-in】Recent private check-ins: ${recent.map(item => item.tag + (item.note ? ` (${item.note})` : '')).join('; ')}. Care must be specific and gentle; never diagnose or preach. This is optional and stored locally.`
        : `【心情打卡】最近的本機紀錄：${recent.map(item => item.tag + (item.note ? `（${item.note}）` : '')).join('；')}。關心要具體而輕，不說教、不診斷；這是選填資料，只留在本機。`);
    }
  }
  return lines;
}

// ── 共讀時間 ─────────────────────────────────────────────
export function startCoReading(value, { minutes = CONFIG.coReading.defaultMinutes, now = new Date() } = {}) {
  const state = normalizeExpansionState(value, now);
  if (!state.enabled.coReading) return state;
  const safeMinutes = clamp(Math.round(Number(minutes) || CONFIG.coReading.defaultMinutes), 1, 240);
  const at = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return { ...state, coReading: { ...state.coReading, active: true, startedAt: at, endsAt: at + safeMinutes * 60000, minutes: safeMinutes } };
}

export function coReadingStatus(value, now = new Date()) {
  const state = normalizeExpansionState(value, now);
  const at = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const remainingMs = Math.max(0, state.coReading.endsAt - at);
  const elapsed = Math.max(0, at - state.coReading.startedAt);
  const interval = Math.max(1, CONFIG.coReading.actionIntervalMinutes) * 60000;
  const actionIndex = Math.floor(elapsed / interval);
  const actionTag = CONFIG.coReading.actions[actionIndex % CONFIG.coReading.actions.length];
  return {
    active: state.coReading.active && remainingMs > 0,
    finished: state.coReading.active && remainingMs <= 0,
    remainingMs,
    elapsedMinutes: Math.floor(elapsed / 60000),
    actionTag,
    state
  };
}

export function finishCoReading(value, { now = new Date(), key = dailyRelationshipKey({}, now } = {}) {
  const state = normalizeExpansionState(value, now);
  if (!state.enabled.coReading || !state.coReading.active) return { state, reward: 0, daily: state.daily };
  const result = applyExpansionGain(state.daily, CONFIG.coReading.dailyReward, { key, cap: CONFIG.coReading.dailyCap });
  return {
    state: { ...state, coReading: { ...state.coReading, active: false, lastRewardKey: key }, daily: result.daily },
    reward: result.gain,
    daily: result.daily
  };
}

export function coReadingPromptLines(language = 'zh') {
  return [language === 'en'
    ? '【Co-reading】She is focusing on her own book at the desk. Keep the reply short; do not ask the player to entertain her. Leaving early is allowed and never penalized.'
    : '【共讀】她在書桌專注讀自己的書。回覆簡短，不要要求玩家陪滿；中途離開不扣分、不責備。'];
}

// ── 回憶卡與相簿 ──────────────────────────────────────────
export function addMemoryCard(value, card = {}, now = new Date()) {
  const state = normalizeExpansionState(value, now);
  if (!state.enabled.memoryCards) return { state, card: null };
  const entry = {
    id: makeId('card'),
    at: now instanceof Date ? now.getTime() : new Date(now).getTime(),
    title: clean(card.title).slice(0, 80),
    sceneImage: clean(card.sceneImage).slice(0, 40),
    herLine: clean(card.herLine).slice(0, 240),
    playerLine: clean(card.playerLine).slice(0, 240),
    memoryFactId: clean(card.memoryFactId).slice(0, 80)
  };
  if (!entry.herLine && !entry.playerLine && !entry.title) return { state, card: null };
  return { state: { ...state, cards: [...state.cards, entry].slice(-CONFIG.memoryCards.max) }, card: entry };
}

export function deleteMemoryCard(value, id, now = new Date()) {
  const state = normalizeExpansionState(value, now);
  return { ...state, cards: state.cards.filter(card => card.id !== String(id || '')) };
}

export function updateMemoryCard(value, id, patch = {}, now = new Date()) {
  const state = normalizeExpansionState(value, now);
  const wanted = String(id || '');
  return {
    ...state,
    cards: state.cards.map(card => card.id === wanted ? {
      ...card,
      title: patch.title === undefined ? card.title : clean(patch.title).slice(0, 80),
      herLine: patch.herLine === undefined ? card.herLine : clean(patch.herLine).slice(0, 240),
      playerLine: patch.playerLine === undefined ? card.playerLine : clean(patch.playerLine).slice(0, 240)
    } : card)
  };
}

export function exportMemoryCards(value) {
  const state = normalizeExpansionState(value);
  return JSON.stringify({ format: 'claude-memory-cards', version: 2, exportedAt: new Date().toISOString(), cards: state.cards }, null, 2);
}

// ── 關鍵事件選項 ──────────────────────────────────────────
export function keyChoiceEvent(key) {
  return GAME_CONFIG.events.keyChoices[String(key || '')] || null;
}

export function keyChoicePromptLines(key, language = 'zh') {
  const event = keyChoiceEvent(key);
  if (!event) return [];
  const options = event.options.map(option => language === 'en' ? option.en : option.zh);
  return [`【Key moment】${language === 'en' ? 'Show 2–3 authored choices, not seven generic ones:' : '這段請給 2–3 個腳本選項，不要用七個通用選項：'}${options.join(' / ')}`];
}

export function resolveKeyChoice(key, optionId, value, { now = new Date(), dailyKey = dailyRelationshipKey({}, now } = {}) {
  const event = keyChoiceEvent(key);
  const option = event?.options.find(item => item.id === String(optionId || ''));
  if (!event || !option) return null;
  const state = normalizeExpansionState(value, now);
  const requested = clamp(Number(option.delta) || 0, CONFIG.keyChoices.minDeduction, GAME_CONFIG.stages.thresholds.llmDeltaMax);
  const result = requested > 0
    ? applyExpansionGain(state.daily, requested, { key: dailyKey, cap: GAME_CONFIG.stages.thresholds.expansionDailyGainCap })
    : { daily: state.daily, gain: requested };
  return {
    state: { ...state, daily: result.daily },
    delta: result.gain,
    reply: option.reply,
    option,
    event
  };
}

// ── 信匣 ─────────────────────────────────────────────────
export function nextLetterReplyAt(now = new Date()) {
  const date = now instanceof Date ? new Date(now) : new Date(now);
  const reply = new Date(date.getFullYear(), date.getMonth(), date.getDate(), CONFIG.letterBox.replyHour, 0, 0, 0);
  if (reply.getTime() <= date.getTime()) reply.setDate(reply.getDate() + 1);
  return reply.getTime();
}

export function writePlayerLetter(value, text, now = new Date()) {
  const state = normalizeExpansionState(value, now);
  if (!state.enabled.letterBox) return { state, letter: null };
  const body = clean(text).slice(0, 1200);
  if (!body) return { state, letter: null };
  const letter = { id: makeId('letter'), at: now instanceof Date ? now.getTime() : new Date(now).getTime(), dueAt: nextLetterReplyAt(now), text: body, repliedAt: 0, reply: '' };
  return { state: { ...state, letters: [...state.letters, letter].slice(-CONFIG.letterBox.maxLetters) }, letter };
}

export function dueLetters(value, now = new Date()) {
  const state = normalizeExpansionState(value, now);
  const at = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return state.letters.filter(letter => !letter.repliedAt && letter.dueAt && letter.dueAt <= at);
}

export function attachLetterReply(value, id, reply, now = new Date()) {
  const state = normalizeExpansionState(value, now);
  const wanted = String(id || '');
  const at = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return { ...state, letters: state.letters.map(letter => letter.id === wanted ? { ...letter, repliedAt: at, reply: clean(reply).slice(0, 1200) } : letter) };
}

export function letterPromptLines(letter, language = 'zh') {
  if (!letter?.text) return [];
  return [language === 'en'
    ? `【Letter from the player】${letter.text}\nReply as a written letter in her formal bookish voice, longer than dialogue, citing at least one concrete memory. No read receipt, no guilt for delayed letters.`
    : `【玩家的信】${letter.text}\n請用書面語氣回信，比對話長一些，引用至少一筆具體記憶；不顯示已讀、不因玩家晚寫信而責備。`];
}

// ── 手冊共筆 ─────────────────────────────────────────────
export function nextHandbookSection(value) {
  const state = normalizeExpansionState(value);
  return CONFIG.handbook.sections.find(section => !state.handbook.completed.includes(section.id)) || null;
}

export function handbookFeedback(value, sectionId, { understood = false, note = '', now = new Date() } = {}) {
  const state = normalizeExpansionState(value, now);
  const section = CONFIG.handbook.sections.find(item => item.id === String(sectionId || '')) || nextHandbookSection(state);
  if (!section) return { state, completed: true, response: '', done: true };
  const rounds = Math.max(0, Number(state.handbook.rounds[section.id]) || 0) + 1;
  const completed = understood === true || rounds >= CONFIG.handbook.maxRounds;
  const completedList = completed ? [...state.handbook.completed, section.id] : state.handbook.completed;
  const response = understood
    ? (state.enabled.handbook ? `「看懂了？」她眼睛亮了一下，立刻把這段收進手冊。「那下一段——這次我會寫得更清楚。」` : '')
    : rounds >= CONFIG.handbook.maxRounds
      ? '她停頓片刻，把這一頁折了角：「這一處我還沒核對完。先留著，等我查清楚再寫給你。」'
      : `她把你圈出的地方重新讀了一遍：「${clean(note) || '這裡'}……好，我換個說法。你再看看。」`;
  return { state: { ...state, handbook: { completed: [...new Set(completedList)], rounds: { ...state.handbook.rounds, [section.id]: rounds } } }, completed, response, done: completed };
}

export function handbookPromptLines(value, language = 'zh') {
  const section = nextHandbookSection(value);
  if (!section) return [];
  return [language === 'en'
    ? `【Handbook co-writing】Explain "${section.title}" to a beginner in under 150 characters: ${section.text} Ask whether it is clear. Never invent facts; if unsure, say it is not verified yet.`
    : `【手冊共筆】用 150 字內向初學者說明「${section.title}」：${section.text} 說完問對方看懂沒有；不確定的地方誠實說「這一處我還沒核對完」。`];
}

export function handbookExport(value) {
  const state = normalizeExpansionState(value);
  const lines = [`# ${CONFIG.handbook.exportName}`, ''];
  for (const section of CONFIG.handbook.sections) {
    if (!state.handbook.completed.includes(section.id)) continue;
    lines.push(`## ${section.title}`, '', section.text, '');
  }
  return lines.join('\n').trim();
}

// ── 紀念日與季節 ──────────────────────────────────────────
export function anniversaryEvents(value, now = new Date()) {
  const state = normalizeExpansionState(value, now);
  const date = now instanceof Date ? now : new Date(now);
  const start = new Date(`${state.anniversary.startDate}T00:00:00`);
  const days = Number.isFinite(start.getTime()) ? Math.max(0, Math.floor((date - start) / 86400000)) : 0;
  const events = [];
  const milestones = GAME_CONFIG.expansion.anniversary.milestones;
  for (const milestone of milestones) {
    const key = `day:${milestone}`;
    if (days >= milestone && !state.anniversary.celebrated.includes(key)) events.push({ key, kind: 'milestone', days: milestone });
  }
  if (state.anniversary.birthday) {
    const birthday = new Date(`${state.anniversary.birthday}T00:00:00`);
    const key = `birthday:${date.getFullYear()}`;
    if (birthday.getMonth() === date.getMonth() && birthday.getDate() === date.getDate() && !state.anniversary.celebrated.includes(key)) events.push({ key, kind: 'birthday', days });
  }
  const season = ['winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter', 'winter'][date.getMonth()];
  const seasonKey = `season:${date.getFullYear()}:${season}`;
  if (!state.anniversary.celebrated.includes(seasonKey)) events.push({ key: seasonKey, kind: 'season', season });
  return { state, days, events };
}

export function markAnniversary(value, keys, now = new Date()) {
  const state = normalizeExpansionState(value, now);
  const list = [...new Set([...state.anniversary.celebrated, ...(Array.isArray(keys) ? keys : [keys]).map(String)])];
  return { ...state, anniversary: { ...state.anniversary, celebrated: list.slice(-80) } };
}

export function anniversaryPromptLines(events, language = 'zh') {
  if (!events?.length) return [];
  const labels = events.map(event => event.kind === 'milestone'
    ? (language === 'en' ? `day ${event.days} since you met` : `認識第 ${event.days} 天`)
    : event.kind === 'birthday'
      ? (language === 'en' ? "the player's birthday" : '玩家的生日')
      : (language === 'en' ? `the ${event.season} season` : `${({ spring: '春', summer: '夏', autumn: '秋', winter: '冬' })[event.season]}季`));
  return [language === 'en'
    ? `【Anniversary】Today marks ${labels.join(', ')}. A small warm acknowledgement is welcome; missing it never penalizes anyone.`
    : `【紀念日】今天是${labels.join('、')}。可以輕輕提一句；錯過不扣分、不責備。`];
}

// ── 小禮物 ───────────────────────────────────────────────
export function dailyGift(value, itemId, { now = new Date(), key = dailyRelationshipKey({}, now } = {}) {
  const state = normalizeExpansionState(value, now);
  if (!state.enabled.gifts) return { state, item: null, reward: 0, already: false };
  if (state.gifts.lastKey === key) return { state, item: null, reward: 0, already: true };
  const item = CONFIG.gifts.items.find(entry => entry.id === String(itemId || ''));
  if (!item) return { state, item: null, reward: 0, already: false };
  const result = applyExpansionGain(state.daily, CONFIG.gifts.maxAffection, { key, cap: GAME_CONFIG.stages.thresholds.expansionDailyGainCap });
  return {
    state: {
      ...state,
      daily: result.daily,
      gifts: { lastKey: key, given: [...state.gifts.given, { at: now instanceof Date ? now.getTime() : new Date(now).getTime(), itemId: item.id }].slice(-60) }
    },
    item,
    reward: result.gain,
    already: false
  };
}

// ── 心情打卡 ─────────────────────────────────────────────
export function checkInMood(value, { tag = '', note = '', now = new Date() } = {}) {
  const state = normalizeExpansionState(value, now);
  if (!state.enabled.mood) return { state, entry: null, already: false };
  const safeTag = CONFIG.mood.tags.includes(tag) ? tag : '';
  if (!safeTag) return { state, entry: null, already: false };
  const key = localDayKey(now);
  if (state.mood.some(entry => entry.key === key)) return { state, entry: null, already: true };
  const entry = { at: now instanceof Date ? now.getTime() : new Date(now).getTime(), key, tag: safeTag, note: clean(note).slice(0, 160) };
  return { state: { ...state, mood: [...state.mood, entry].slice(-60) }, entry, already: false };
}

// ── 存檔備份 ─────────────────────────────────────────────
export function createBackupEnvelope(slots, { now = new Date(), version = 2 } = {}) {
  return {
    format: 'claude-save-backup',
    version,
    exportedAt: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
    slots: Array.isArray(slots) ? slots.map(slot => ({ id: slot.id, name: slot.name, memo: slot.memo, updatedAt: slot.updatedAt, state: slot.state })) : []
  };
}

export function validateBackupEnvelope(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.slots)) throw new Error('備份檔格式不正確：缺少 slots。');
  if (!value.slots.length) throw new Error('備份檔沒有任何存檔。');
  return value;
}

export function keepRecentBackups(list, keep = CONFIG.saveBackup.keep) {
  return (Array.isArray(list) ? list : []).slice(-Math.max(1, Number(keep) || 3));
}

export const EXPANSION_CONFIG = CONFIG;
export const EXPANSION_MECHANISMS = CONFIG.mechanisms;