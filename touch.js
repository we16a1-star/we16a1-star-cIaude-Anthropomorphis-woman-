// v5.0｜觸碰互動（S9 的程式部分）：依部位與關係階段給台詞，連點遞減、每日好感上限、
// 數次後說「夠了」。真正的 WebGL 位移與表情仍由 portrait-anim.js 負責；
// 這裡只回傳要顯示的文字與本次可加的好感，讓 UI 不必把規則寫死。
import { GAME_CONFIG } from './config-loader.js';
import { dailyRelationshipKey } from './relationship.js';

const TOUCH = GAME_CONFIG.stages.touch;

export function normalizeTouchDaily(value, key = '') {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const sameDay = String(raw.key || '') === String(key || '');
  return {
    key: String(key || ''),
    count: sameDay ? Math.max(0, Math.floor(Number(raw.count) || 0)) : 0,
    gain: sameDay ? Math.max(0, Math.round((Number(raw.gain) || 0) * 100) / 100) : 0
  };
}

export function touchDailyKey(state = {}, now = new Date()) {
  return dailyRelationshipKey(state, now);
}

function reactionFor(part, stage) {
  const key = ['A', 'B', 'C'].includes(String(stage || '')) ? String(stage) : 'A';
  const reactions = TOUCH.reactions[key] || TOUCH.reactions.A;
  return reactions[part] || reactions.head || reactions.body || '';
}

/**
 * 一次觸碰：回傳更新後的每日計數、是否已「夠了」、以及本次可加的好感。
 * 好感只在使用者真的開始故事後才由 app.js 套用；這裡不直接改存檔。
 */
export function registerPortraitTouch(value, { part = 'head', stage = 'A', key = '', now = new Date() } = {}) {
  const daily = normalizeTouchDaily(value, key);
  const count = daily.count + 1;
  const enough = count >= TOUCH.enoughAfter;
  const reaction = enough ? TOUCH.enough : reactionFor(part, stage);
  const room = Math.max(0, TOUCH.dailyGainCap - daily.gain);
  const gain = count <= TOUCH.softCapAfter ? Math.min(TOUCH.gainPerTouch, room) : 0;
  return {
    daily: { key: daily.key, count, gain: Math.round((daily.gain + gain) * 100) / 100 },
    reaction,
    affection: gain,
    enough,
    count,
    at: now instanceof Date ? now.getTime() : new Date(now).getTime()
  };
}

export function touchDailyText(value, language = 'zh') {
  const daily = normalizeTouchDaily(value);
  if (language === 'en') return `Touch affection today: ${daily.gain}/${TOUCH.dailyGainCap}`;
  return `今日觸碰好感：${daily.gain}/${TOUCH.dailyGainCap}`;
}

export function touchPromptLines(language = 'zh') {
  return [language === 'en'
    ? `Touch reactions are local: ${TOUCH.softCapAfter} affectionate touches per day up to +${TOUCH.dailyGainCap} total; after ${TOUCH.enoughAfter} she says enough. Never turn touch into a demand or guilt.`
    : `觸碰反應由程式處理：每天前 ${TOUCH.softCapAfter} 次最多合計 +${TOUCH.dailyGainCap} 好感；第 ${TOUCH.enoughAfter} 次起她會說「夠了」。不要把觸碰變成要求或愧疚。`];
}