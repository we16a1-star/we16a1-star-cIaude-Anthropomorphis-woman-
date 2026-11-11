// 追加八：故事時間（第 N 天・早上／中午／晚上）與好感度階段（疏離／熟悉／在意／親密）。
// 批4（E10）：故事時間新增第三態「綁定現實時間」。這裡只放與畫面無關的純邏輯，供
// www/app.js（畫面與網頁提示詞）與 server/server.js（API 提示詞）共用，也讓 node --test 直接測邊界。
// 存檔欄位：state.storyClock＝{mode,enabled,day,slot,anchor}：
//   mode＝'off'（不啟用）／'story'（隨劇情推進）／'real'（綁定現實時間）；
//   enabled＝mode!=='off'（保留欄位，兼容既有呼叫端）；
//   anchor＝real 模式的現實錨點 epoch（ms；選定 real 時寫入，天數自此起算）。
//   舊存檔遷移：enabled:true→story、false→off（normalizeStoryClock 自動處理）。
// state.pendingMilestone＝一次性里程碑提示（升階時設定，下一回合提示詞使用後清除）。
export const STORY_SLOTS = [
  { zh: '早上', en: 'Morning' },
  { zh: '中午', en: 'Noon' },
  { zh: '晚上', en: 'Evening' }
];
// 批4：real 模式的現實時刻→時段映射（早上 05:00–11:59／中午 12:00–17:59／晚上 18:00–04:59）。
export const REAL_MORNING_START = 5;
export const REAL_NOON_START = 12;
export const REAL_EVENING_START = 18;
export const STORY_CLOCK_MODES = ['off', 'story', 'real'];
// 階段邊界與 prompt-rules.js 的語氣帶一致：0–30疏離、31–60熟悉、61–85在意、86–100親密。
export const AFFECTION_STAGES = [
  { key: 'distant', min: 0, max: 30, zh: '疏離', en: 'Distant' },
  { key: 'familiar', min: 31, max: 60, zh: '熟悉', en: 'Familiar' },
  { key: 'caring', min: 61, max: 85, zh: '在意', en: 'Caring' },
  { key: 'intimate', min: 86, max: 100, zh: '親密', en: 'Intimate' }
];
export function normalizeStoryClock(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const day = Number(raw.day);
  const slot = Number(raw.slot);
  const anchor = Number(raw.anchor);
  // 批4：mode 為權威；缺 mode 時由舊欄位 enabled 遷移（true→story、false→off）。
  const mode = STORY_CLOCK_MODES.includes(raw.mode) ? raw.mode : (raw.enabled === true ? 'story' : 'off');
  return {
    mode,
    enabled: mode !== 'off',
    day: Number.isFinite(day) ? Math.max(1, Math.min(9999, Math.round(day))) : 1,
    slot: Number.isFinite(slot) ? Math.max(0, Math.min(2, Math.round(slot))) : 0,
    anchor: Number.isFinite(anchor) && anchor > 0 ? Math.round(anchor) : 0
  };
}
export function advanceStoryClock(clock, slots = 1) {
  const safe = normalizeStoryClock(clock);
  // 批4：只有 story 隨劇情推進；real＝現實驅動、off＝不推進（timeAdvance 一律忽略）。
  if (safe.mode !== 'story') return safe;
  const count = Number(slots);
  const step = Number.isFinite(count) ? Math.max(0, Math.min(6, Math.round(count))) : 1;
  const total = safe.slot + step;
  safe.day = Math.max(1, Math.min(9999, safe.day + Math.floor(total / STORY_SLOTS.length)));
  safe.slot = total % STORY_SLOTS.length;
  return safe;
}
// 批4：real 模式＝依現實時刻；時段依現時、天數自錨點起跨現實日界線 +1。
export function realSlotIndexAt(value) {
  const date = value instanceof Date ? value : new Date(value);
  const hour = date.getHours();
  if (hour >= REAL_MORNING_START && hour < REAL_NOON_START) return 0;
  if (hour >= REAL_NOON_START && hour < REAL_EVENING_START) return 1;
  return 2;
}
export function realDayNumberAt(anchorMs, value) {
  const anchor = new Date(Number(anchorMs));
  const now = value instanceof Date ? value : new Date(value);
  const anchorUTC = Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const nowUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((nowUTC - anchorUTC) / 86400000);
  return Number.isFinite(days) ? Math.max(1, Math.min(9999, days + 1)) : 1;
}
export function realStoryClock(clock, value = new Date()) {
  const safe = normalizeStoryClock(clock);
  if (safe.mode !== 'real') return safe;
  const now = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(now.getTime())) return safe;
  return {
    ...safe,
    day: safe.anchor > 0 ? realDayNumberAt(safe.anchor, now) : safe.day,
    slot: realSlotIndexAt(now)
  };
}
export function stageIndexOfAffection(value) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
  return AFFECTION_STAGES.findIndex(stage => safe <= stage.max);
}
export function affectionStageOf(value) {
  return AFFECTION_STAGES[stageIndexOfAffection(value)];
}
export function affectionStageKeyOf(value) {
  return affectionStageOf(value).key;
}
export function stageByKey(key) {
  return AFFECTION_STAGES.find(stage => stage.key === String(key || '')) || null;
}
export function stageIndexByKey(key) {
  return AFFECTION_STAGES.findIndex(stage => stage.key === String(key || ''));
}
export function normalizeMilestoneKey(value) {
  const found = stageByKey(value);
  return found ? found.key : '';
}
export function storySlotName(slot, lang) {
  const index = Math.max(0, Math.min(STORY_SLOTS.length - 1, Math.round(Number(slot) || 0)));
  const entry = STORY_SLOTS[index];
  return lang === 'en' ? entry.en : entry.zh;
}
export function storyClockLabel(clock, lang) {
  const safe = normalizeStoryClock(clock);
  return lang === 'en' ? `Day ${safe.day} · ${storySlotName(safe.slot, 'en')}` : `第 ${safe.day} 天・${storySlotName(safe.slot, 'zh')}`;
}
