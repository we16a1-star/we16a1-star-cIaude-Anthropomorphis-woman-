// v5.0｜生活模擬器（S7）：六時段、加權活動、精力、專注度、離線補算、最近 5 筆日誌、
// 動作白名單驗證與提示詞狀態區塊。所有數值來自 config/schedule.json 與 config/actions.json；
// LLM 只能描寫，位置與活動由程式決定。
import { GAME_CONFIG, actionDefinition, imagePathFor } from './config-loader.js';

export const LIFE_SLOTS = GAME_CONFIG.schedule.slots;
export const LIFE_SLOT_KEYS = LIFE_SLOTS.map(slot => slot.key);
export const LIFE_LOG_LIMIT = GAME_CONFIG.schedule.logLimit;
const ENERGY = GAME_CONFIG.schedule.energy;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = value => Math.round(Number(value) * 100) / 100;
const localDayKey = date => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const clockText = date => {
  const d = date instanceof Date ? date : new Date(date);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function lifeSlotForHour(hour) {
  const h = ((Math.floor(Number(hour) || 0) % 24) + 24) % 24;
  return LIFE_SLOTS.find(slot => slot.startHour < slot.endHour
    ? h >= slot.startHour && h < slot.endHour
    : h >= slot.startHour || h < slot.endHour) || LIFE_SLOTS[0];
}

export function lifeSlotForDate(date = new Date()) {
  return lifeSlotForHour((date instanceof Date ? date : new Date(date)).getHours());
}

export function lifeSlotByKey(key) {
  return LIFE_SLOTS.find(slot => slot.key === String(key || '')) || LIFE_SLOTS[0];
}

function slotActivity(slot, key) {
  return slot.activities.find(activity => activity.key === String(key || '')) || slot.activities[0];
}

export function defaultLifeActivity(slotKey) {
  const slot = lifeSlotByKey(slotKey);
  return slot.activities[0];
}

export function normalizeLifeState(value, now = new Date()) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const date = now instanceof Date ? now : new Date(now);
  const slot = lifeSlotForDate(date);
  const activity = slotActivity(slot, raw.activity);
  const location = String(raw.location || activity.location || slot.defaultLocation || 'window');
  const usedSpecials = {};
  if (raw.usedSpecials && typeof raw.usedSpecials === 'object' && !Array.isArray(raw.usedSpecials)) {
    for (const [key, list] of Object.entries(raw.usedSpecials)) {
      if (Array.isArray(list)) usedSpecials[String(key)] = [...new Set(list.map(String))].slice(0, 12);
    }
  }
  const log = (Array.isArray(raw.log) ? raw.log : []).map(entry => {
    if (!entry || typeof entry !== 'object') return null;
    const text = String(entry.text || '').trim().slice(0, 240);
    if (!text) return null;
    return {
      at: Math.max(0, Number(entry.at) || 0),
      dayKey: String(entry.dayKey || ''),
      slotKey: String(entry.slotKey || ''),
      activityKey: String(entry.activityKey || ''),
      text
    };
  }).filter(Boolean).slice(-LIFE_LOG_LIMIT);
  return {
    version: 2,
    dayKey: String(raw.dayKey || localDayKey(date)),
    slotKey: slot.key,
    location,
    activity: activity.key,
    energy: clamp(Number.isFinite(Number(raw.energy)) ? Number(raw.energy) : ENERGY.initial, ENERGY.min, ENERGY.max),
    focus: activity.focus || slot.focus,
    manualProgress: clamp(Number.isFinite(Number(raw.manualProgress)) ? Number(raw.manualProgress) : 0, 0, 100),
    usedSpecials,
    log,
    lastTick: Math.max(0, Number(raw.lastTick) || date.getTime()),
    lastSeenAt: Math.max(0, Number(raw.lastSeenAt) || 0),
    startedAt: Math.max(0, Number(raw.startedAt) || date.getTime())
  };
}

function clampRandom(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(0.999999999, number)) : 0;
}

export function chooseActivity(slotKey, { random = Math.random, usedSpecials = [] } = {}) {
  const slot = lifeSlotByKey(slotKey);
  const used = new Set((usedSpecials || []).map(String));
  const pool = slot.activities.filter(activity => !(activity.special && used.has(activity.key)));
  const total = source.reduce((sum, activity) => sum + Math.max(0, Number(activity.weight) || 0), 0);
  let roll = clampRandom(random()) * total;
  for (const activity of source) {
    roll -= Math.max(0, Number(activity.weight) || 0);
    if (roll <= 0) return activity;
  }
  return source[source.length - 1];
}

function markSpecial(usedSpecials, dayKey, activity) {
  if (!activity.special) return usedSpecials;
  const list = [...new Set([...(usedSpecials[dayKey] || []), activity.key])];
  return { ...usedSpecials, [dayKey]: list };
}

function applyActivity(life, activity, slot, date) {
  const natural = slot.key === 'late_night' && activity.key !== 'sleep' ? -ENERGY.lateNightDrain : 0;
  const energy = clamp(life.energy + Number(activity.energy || 0) + natural, ENERGY.min, ENERGY.max);
  return {
    ...life,
    dayKey: localDayKey(date),
    slotKey: slot.key,
    location: activity.location || slot.defaultLocation,
    activity: activity.key,
    focus: activity.focus || slot.focus,
    energy,
    manualProgress: clamp(life.manualProgress + Number(activity.progress || 0), 0, 100),
    usedSpecials: markSpecial(life.usedSpecials, localDayKey(date), activity),
    log: [...life.log, {
      at: date.getTime(),
      dayKey: localDayKey(date),
      slotKey: slot.key,
      activityKey: activity.key,
      text: `${clockText(date)} ${activity.log || activity.zh}`
    }].slice(-LIFE_LOG_LIMIT)
  };
}

/**
 * 離線補算：從上次開啟到現在，每個新時段抽一個活動並寫日誌。
 * 最多補 config.offlineCatchupMaxDays 天；只留最近 5 筆，因此長時間離線不會爆量。
 */
export function advanceLife(value, now = new Date(), { random = Math.random } = {}) {
  const date = now instanceof Date ? now : new Date(now);
  const before = normalizeLifeState(value, date);
  const previousTick = before.lastSeenAt || before.lastTick;
  const maxDays = Math.max(1, Number(GAME_CONFIG.schedule.offlineCatchupMaxDays) || 7);
  const earliest = date.getTime() - maxDays * 86400000;
  let life = { ...before, lastSeenAt: previousTick || date.getTime(), lastTick: date.getTime() };
  const start = new Date(Math.max(before.lastTick || date.getTime(), earliest));
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  let previousSlot = lifeSlotForDate(new Date(Math.max(before.lastTick || date.getTime(), earliest)));
  let cursor = new Date(start);
  let guard = 0;
  let picked = false;
  while (cursor.getTime() <= date.getTime() && guard++ < 24 * (maxDays + 2)) {
    const slot = lifeSlotForDate(cursor);
    if (slot.key !== previousSlot.key) {
      const dayKey = localDayKey(cursor);
      const activity = chooseActivity(slot.key, { random, usedSpecials: life.usedSpecials[dayKey] || [] });
      life = applyActivity(life, activity, slot, cursor);
      previousSlot = slot;
      picked = true;
    }
    cursor = new Date(cursor.getTime() + 3600000);
  }
  // 存檔時段與現在不同（例如舊存檔、時鐘跳躍）但沒有跨到整點：至少補一筆目前時段。
  if (!picked && before.slotKey !== lifeSlotForDate(date).key) {
    const slot = lifeSlotForDate(date);
    const dayKey = localDayKey(date);
    const activity = chooseActivity(slot.key, { random, usedSpecials: life.usedSpecials[dayKey] || [] });
    life = applyActivity(life, activity, slot, date);
  }
  return { ...life, lastSeenAt: previousTick || before.lastTick, lastTick: date.getTime() };
}

export function locationLabel(key, language = 'zh') {
  const labels = { window: ['窗前', 'by the window'], desk: ['書桌', 'at her desk'], tea_table: ['紅茶桌', 'at the tea table'], bed: ['床', 'by the bed'], outside: ['外出', 'out'] };
  return (labels[key] || [key, key])[language === 'en' ? 1 : 0];
}

export function activityLabel(key, language = 'zh') {
  for (const slot of LIFE_SLOTS) {
    const activity = slot.activities.find(item => item.key === key);
    if (activity) return language === 'en' ? activity.en : activity.zh;
  }
  return key;
}

export function focusLabel(value, language = 'zh') {
  if (language === 'en') return value === 'high' ? 'high' : value === 'low' ? 'low' : 'medium';
  return value === 'high' ? '高' : value === 'low' ? '低' : '中';
}

export function timeAwayText(value, now = new Date()) {
  const life = normalizeLifeState(value, now);
  const from = life.lastSeenAt || life.lastTick;
  if (!from) return '';
  const hours = Math.max(0, ((now instanceof Date ? now : new Date(now)).getTime() - from) / 3600000);
  if (hours < 1) return '';
  if (hours < 24) return `${Math.round(hours)} 小時`;
  return `${Math.round(hours / 24)} 天`;
}

export function lifePromptLines(value, language = 'zh', { now = new Date() } = {}) {
  const life = normalizeLifeState(value, now);
  const slot = lifeSlotByKey(life.slotKey);
  const away = timeAwayText(life, now);
  const log = life.log.slice(-LIFE_LOG_LIMIT).map(entry => entry.text).join('；') || (language === 'en' ? 'no recent activity' : '尚無日誌');
  if (language === 'en') {
    return [
      '【Life layer】You have your own life in this fictional world. Only describe the location and activity in 【Life】; never change them yourself.',
      `【Life】slot=${slot.en} location=${locationLabel(life.location, 'en')} activity=${activityLabel(life.activity, 'en')} energy=${Math.round(life.energy)} focus=${focusLabel(life.focus, 'en')} handbook=${Math.round(life.manualProgress)}%`,
      `【Diary】${log}`,
      `【Rules】Use 1–${GAME_CONFIG.actions.maxPerReply} actions per reply, chosen from the action whitelist and matching the current location and activity. At most one location change per reply. When focus is high, keep the reply shorter and about 10% more stubborn; affection does not drop. If the player says they are tired or it is late, put the activity down and respond to them first. Never say "I have been waiting for you" or use guilt; a long absence only changes tone. Do not depict changing clothes or bathing. If the player seriously asks whether you are an AI, answer honestly and then continue in character.${away ? ` Last visit: ${away} ago.` : ''}`
    ];
  }
  return [
    '【生活層】你在這個虛構世界裡有自己的生活。只描寫【生活】中的位置與活動，不自己改變它們。',
    `【生活】時段=${slot.zh} 位置=${locationLabel(life.location)} 活動=${activityLabel(life.activity)} 精力=${Math.round(life.energy)} 專注度=${focusLabel(life.focus)} 手冊進度=${Math.round(life.manualProgress)}%`,
    `【日誌】${log}`,
    `【規則】每則回覆用 1–${GAME_CONFIG.actions.maxPerReply} 個動作，必須符合位置與活動，並從動作庫挑選；一次回覆最多一次位置轉換。專注度高時回覆較短、嘴硬比例約升一成，不扣好感。玩家說累了或該睡了時，先放下手邊的事回應。久未上線只用語氣表達，不說「我一直在等你」之類的愧疚句。不演出更衣、沐浴等私密情境。玩家認真問是不是 AI 時，誠實回答，之後可繼續用角色口吻。${away ? `距上次約 ${away}。` : ''}`
  ];
}

export function allowedActionTags(value, now = new Date()) {
  const life = normalizeLifeState(value, now);
  return GAME_CONFIG.actions.actions.filter(action =>
    action.locations.includes(life.location) &&
    (action.activities.includes('any') || action.activities.includes(life.activity))
  ).map(action => action.tag);
}

/**
 * 驗證 LLM 回傳的 action：字串、字串陣列或 {tag} 物件。
 * 不在白名單，或與目前位置／活動衝突的動作直接丟棄；全部失敗時只留台詞。
 */
export function validateLifeAction(value, lifeState, language = 'zh') {
  const life = normalizeLifeState(lifeState);
  const max = Math.max(1, Number(GAME_CONFIG.actions.maxPerReply) || 3);
  const rawList = Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  const tags = [];
  const lines = [];
  let image = '';
  for (const raw of rawList) {
    const tag = String(raw && typeof raw === 'object' ? raw.tag || raw.action || '' : raw || '').trim();
    if (!tag || tags.includes(tag)) continue;
    const definition = actionDefinition(tag);
    if (!definition) continue;
    if (!definition.locations.includes(life.location)) continue;
    if (!definition.activities.includes('any') && !definition.activities.includes(life.activity)) continue;
    tags.push(tag);
    lines.push(language === 'en' ? definition.en : definition.zh);
    if (!image && definition.image) image = definition.image;
    if (tags.length >= max) break;
  }
  return { tags, lines, text: lines.join(''), image };
}

export function applyLifeAction(value, actionResult, now = new Date()) {
  const life = normalizeLifeState(value, now);
  const tags = Array.isArray(actionResult?.tags) ? actionResult.tags.slice(0, GAME_CONFIG.actions.maxPerReply) : [];
  if (!tags.length) return life;
  return {
    ...life,
    lastActions: tags,
    log: life.log.slice(-LIFE_LOG_LIMIT)
  };
}

export function addManualProgress(value, amount, now = new Date()) {
  const life = normalizeLifeState(value, now);
  return { ...life, manualProgress: clamp(life.manualProgress + (Number(amount) || 0), 0, 100) };
}

export function lifeImageFor(value, now = new Date()) {
  const life = normalizeLifeState(value, now);
  const slot = lifeSlotByKey(life.slotKey);
  const activity = slotActivity(slot, life.activity);
  return imagePathFor(activity.image || slot.image);
}

export function lifeGreeting(value, language = 'zh', { stage = 'A', playerName = 'User', now = new Date() } = {}) {
  const life = normalizeLifeState(value, now);
  const last = life.log.at(-1);
  const activity = activityLabel(life.activity, language);
  const name = playerName || 'User';
  if (language === 'en') {
    if (stage === 'C') return last ? `(sets down the quill) You're back. ${last.text} …Come sit; I saved you the warm side of the window.` : `(sets down the quill) You're back, ${name}. Come sit by the window.`;
    if (stage === 'B') return last ? `(turns a page, a little too quickly) You're here. I just happened to finish this part. …${last.text} The tea is still warm.` : `(turns a page, a little too quickly) You're here. …It is not like I was counting the time.`;
    return last ? `You finally show up. I was not watching the door. …${last.text}` : `You finally show up. I was not watching the door.`;
  }
  if (stage === 'C') return last ? `（放下羽毛筆）你回來了。${last.text}……過來坐，窗邊的位置我留著。` : `（放下羽毛筆）你回來了，${name}。過來坐。`;
  if (stage === 'B') return last ? `（翻頁翻得有點快）你來了。我剛好讀到這裡。……${last.text}茶還是溫的。` : '（翻頁翻得有點快）你來了。……我才沒有在數時間。';
  return last ? `你還知道要來啊。我才沒有一直看門口。……${last.text}` : '你還知道要來啊。我才沒有一直看門口。';
}

export function lifeManualProgressLabel(value, language = 'zh') {
  const life = normalizeLifeState(value);
  const rewards = GAME_CONFIG.schedule.manualProgress.chapterRewards;
  const labels = GAME_CONFIG.schedule.manualProgress.chapterLabels;
  const reached = rewards.filter(reward => life.manualProgress >= reward).length;
  const next = rewards.find(reward => life.manualProgress < reward);
  if (language === 'en') return next ? `Handbook ${Math.round(life.manualProgress)}% · next chapter at ${next}%` : `Handbook ${Math.round(life.manualProgress)}% · all chapters complete`;
  return next ? `手冊 ${Math.round(life.manualProgress)}%・下一章 ${next}%` : `手冊 ${Math.round(life.manualProgress)}%・全部章節完成`;
}