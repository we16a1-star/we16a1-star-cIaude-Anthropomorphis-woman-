/**
 * scene-packs.js — 場景包資料驅動解析器
 *
 * 借鏡 AnimaVN（https://github.com/JayziLi/AnimaVN，MIT License）
 * `frontend/src/debug/plugins/scenePacks.ts` 的「背景／BGM／CG 分層綁定與優先序查找」架構，
 * 搭配《Claude娘的圖書館》含背景整張插畫模式（日夜不跨組、人物固定在右不鏡射）。
 */

export const DEFAULT_SCENE_PACKS = Object.freeze([
  Object.freeze({
    id: 'day-default',
    sceneKey: 'default',
    name: '古籍閱覽室 · 白天',
    nameEn: 'Rare Books Room · Day',
    timeGroup: 'day',
    background: 'g43-story-default.jpg',
    alt: '克勞德站在窗前，日間故事預設立繪',
    tone: 'warm',
    bgm: null,
    effectClass: 'scene-fx-warm-sun',
    mirrored: false,
    aliases: ['default', 'day', 'library-day', '白天', '日間']
  }),
  Object.freeze({
    id: 'morning-soft',
    sceneKey: 'soft-morning',
    name: '古籍閱覽室 · 晨光',
    nameEn: 'Rare Books Room · Morning',
    timeGroup: 'day',
    background: 'g43-story-soft-morning.jpg',
    alt: '克勞德在日光中溫柔傾聽',
    tone: 'warm',
    bgm: null,
    effectClass: 'scene-fx-morning-glow',
    mirrored: false,
    aliases: ['soft-morning', 'morning', '晨光', '清晨']
  }),
  Object.freeze({
    id: 'evening-reading',
    sceneKey: 'evening-reading',
    name: '古籍閱覽室 · 傍晚',
    nameEn: 'Rare Books Room · Evening',
    timeGroup: 'day',
    background: 'g43-story-reading.jpg',
    alt: '傍晚的克勞德與窗台白鴿，為夜間信鳥故事鋪梗',
    tone: 'warm',
    bgm: null,
    effectClass: 'scene-fx-sunset-dusk',
    mirrored: false,
    aliases: ['evening', 'dusk', 'sunset', '傍晚', '暮色']
  }),
  Object.freeze({
    id: 'night-magic',
    sceneKey: 'night',
    name: '古籍閱覽室 · 夜間',
    nameEn: 'Rare Books Room · Night',
    timeGroup: 'night',
    background: 'g43-cg-magic-light.jpg',
    alt: '夜色中克勞德手托微光，夜間立繪',
    tone: 'night',
    bgm: null,
    effectClass: 'scene-fx-moonlight',
    mirrored: false,
    aliases: ['night', 'midnight', '夜間', '深夜']
  }),
  Object.freeze({
    id: 'rainy-night',
    sceneKey: 'rainy-night',
    name: '古籍閱覽室 · 雨夜',
    nameEn: 'Rare Books Room · Rainy Night',
    timeGroup: 'night',
    background: 'g43-story-rainy-night.jpg',
    alt: '雨夜中的古籍閱覽室，窗外細雨與桌前燭光',
    tone: 'night',
    bgm: null,
    effectClass: 'scene-fx-rainy-night',
    mirrored: false,
    aliases: ['rain', 'rainy', '雨夜', '雷雨']
  })
]);

const VALID_TONES = new Set(['none', 'warm', 'night']);
const VALID_TIME_GROUPS = new Set(['day', 'night']);

/**
 * 規範化單一場景包條目，確保所有必要欄位完整且類型安全。
 */
export function normalizeScenePack(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  const background = String(raw.background || '').trim();
  if (!id || !background) return null;
  const sceneKey = String(raw.sceneKey || id).trim();
  const timeGroup = VALID_TIME_GROUPS.has(raw.timeGroup) ? raw.timeGroup : 'day';
  const tone = VALID_TONES.has(raw.tone) ? raw.tone : (timeGroup === 'night' ? 'night' : 'warm');
  const aliases = Array.isArray(raw.aliases)
    ? raw.aliases.map(a => String(a || '').trim().toLowerCase()).filter(Boolean)
    : [];
  return {
    id,
    sceneKey,
    name: String(raw.name || sceneKey),
    nameEn: String(raw.nameEn || raw.name || sceneKey),
    timeGroup,
    background,
    alt: String(raw.alt || ''),
    tone,
    bgm: typeof raw.bgm === 'string' && raw.bgm.trim() ? raw.bgm.trim() : null,
    effectClass: typeof raw.effectClass === 'string' ? raw.effectClass.trim() : '',
    mirrored: raw.mirrored === true,
    aliases
  };
}

/**
 * 建立場景包登錄表：以傳入設定覆寫／擴充預設表，保持優先序穩定。
 */
export function createScenePackRegistry(configOrList = null) {
  const rawList = Array.isArray(configOrList)
    ? configOrList
    : (Array.isArray(configOrList?.scenePacks) ? configOrList.scenePacks : []);
  const byId = new Map();
  const bySceneKey = new Map();
  const byAlias = new Map();

  const register = item => {
    const pack = normalizeScenePack(item);
    if (!pack) return;
    byId.set(pack.id.toLowerCase(), pack);
    bySceneKey.set(pack.sceneKey.toLowerCase(), pack);
    for (const alias of pack.aliases) {
      if (!byAlias.has(alias)) byAlias.set(alias, pack);
    }
  };

  // 先裝載外部設定（具較高優先權），再補上內建預設確保缺省不崩潰
  for (const item of rawList) register(item);
  for (const item of DEFAULT_SCENE_PACKS) {
    if (!byId.has(item.id.toLowerCase())) register(item);
  }

  return {
    packs: [...byId.values()],
    bgmEnabled: Boolean(configOrList && !Array.isArray(configOrList) && configOrList.bgmEnabled),
    defaultBgm: (configOrList && !Array.isArray(configOrList) && typeof configOrList.defaultBgm === 'string')
      ? configOrList.defaultBgm
      : null,
    byId,
    bySceneKey,
    byAlias
  };
}

/**
 * 依 id、sceneKey 或別名查找場景包；若指定 expectedTimeGroup，
 * 遵守「不跨日夜組」規則，不符時回傳 null 讓呼叫端決定是否退回預設。
 */
export function resolveScenePack(registry, query, expectedTimeGroup = null) {
  const reg = registry || createScenePackRegistry();
  const key = String(query || '').trim().toLowerCase();
  if (!key) return null;
  const hit = reg.byId.get(key) || reg.bySceneKey.get(key) || reg.byAlias.get(key) || null;
  if (!hit) return null;
  if (expectedTimeGroup && VALID_TIME_GROUPS.has(expectedTimeGroup) && hit.timeGroup !== expectedTimeGroup) {
    return null;
  }
  return hit;
}

/**
 * 依綁定順序合併背景／BGM 資產列表（借鏡 AnimaVN mergeBoundScene）。
 * @param {{ bg?: string[], bgm?: string[] }} binding
 * @param {object} registry
 */
export function resolveBoundScenePlan(binding = {}, registry = null) {
  const reg = registry || createScenePackRegistry();
  const bgIds = Array.isArray(binding.bg) ? binding.bg : [];
  const bgmIds = Array.isArray(binding.bgm) ? binding.bgm : [];
  const backgrounds = bgIds.map(id => resolveScenePack(reg, id)).filter(Boolean);
  const bgmTrack = reg.bgmEnabled
    ? (bgmIds.map(id => resolveScenePack(reg, id)?.bgm).find(Boolean) || reg.defaultBgm || null)
    : null;
  return {
    backgrounds,
    primary: backgrounds[0] || resolveScenePack(reg, 'default'),
    bgmEnabled: reg.bgmEnabled,
    bgmTrack
  };
}
