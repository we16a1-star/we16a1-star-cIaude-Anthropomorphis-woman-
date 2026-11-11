// G43（WP5）：稀有晚安 CG 的純判定。
// 只負責「這一回合該不該出現 36685」，不碰 DOM、不存檔；app.js 讀狀態後呼叫，
// story-art.js 負責實際顯示。WP7 的睡前場景之後也會沿用這個模組。
//
// 指示書 WP7：
//   夜間、好感度 45 以上、玩家送出的文字含「晚安」或 good night。
//   機率 10%，冷卻 24 小時，第一次不保證。
export const RARE_GOODNIGHT_CHANCE = 0.1;
export const RARE_GOODNIGHT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const RARE_GOODNIGHT_MIN_AFFECTION = 45;
export const RARE_GOODNIGHT_WARMUP_TURNS = 3;

// 「晚安」與 good night／goodnight／good-night 都算；英文不分大小寫。
export function hasGoodnightText(text) {
  return /晚安|good[\s-]*night/i.test(String(text ?? ''));
}

// 回傳 { show, reason }；reason 只給測試與回報用，不顯示給玩家。
// random 可注入，測試才能固定機率；正式路徑傳 Math.random。
export function evaluateRareGoodnight({
  action = '',
  affection = 0,
  isNight = false,
  now = Date.now(),
  lastShownAt = 0,
  busy = false,
  gameOver = false,
  ending = false,
  textOnly = false,
  warmupTurns = 0,
  random = Math.random,
} = {}) {
  if (busy) return { show: false, reason: 'busy' };
  if (gameOver) return { show: false, reason: 'game-over' };
  if (ending) return { show: false, reason: 'ending' };
  if (textOnly) return { show: false, reason: 'text-only' };
  if (warmupTurns > 0) return { show: false, reason: 'warmup' };
  if (!isNight) return { show: false, reason: 'day' };

  const aff = Number(affection);
  if (!Number.isFinite(aff) || aff < RARE_GOODNIGHT_MIN_AFFECTION) {
    return { show: false, reason: 'affection' };
  }
  if (!hasGoodnightText(action)) return { show: false, reason: 'no-goodnight-text' };

  const current = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const last = Math.max(0, Number(lastShownAt) || 0);
  // 系統時鐘往回調時，把「未來」的紀錄視為現在，最多再等 24 小時，不會永久鎖死。
  const since = Math.max(0, current - Math.min(last, current));
  if (last > 0 && since < RARE_GOODNIGHT_COOLDOWN_MS) {
    return { show: false, reason: 'cooldown' };
  }

  const roll = Number(random());
  if (!Number.isFinite(roll) || roll >= RARE_GOODNIGHT_CHANCE) {
    return { show: false, reason: 'chance' };
  }
  return { show: true, reason: 'ok' };
}
