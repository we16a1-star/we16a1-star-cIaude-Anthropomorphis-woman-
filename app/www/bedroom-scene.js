// G43（WP7）：臥室場景 CG 的純判定。
// 只負責「這一回合該不該出現 36628／36629」，不碰 DOM、不存檔；app.js 讀狀態後呼叫，
// story-art.js 負責實際顯示。與 night-cg.js 的稀有晚安 CG 互斥：同一回合兩者同時成立時只出現晚安 CG。
//
// 指示書 WP7：
//   夜間、好感度 45 以上、場景標籤含「臥室／寢室／睡前／床」之一。
//   45–89 用 36628、90–100 用 36629。
//   第一次必出現；之後 25%；每次間隔至少 24 小時；每個夜間場景最多一次。
export const BEDROOM_SCENE_CHANCE = 0.25;
export const BEDROOM_SCENE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const BEDROOM_SCENE_MIN_AFFECTION = 45;

const BEDROOM_LABEL_RE = /臥室|寢室|睡前|床/;

export function isBedroomScene(label) {
  return BEDROOM_LABEL_RE.test(String(label ?? ''));
}

// 依好感度選圖：45–89 → 36628，90–100 → 36629；其餘 null。
export function bedroomArtFor(affection) {
  const aff = Number(affection);
  if (!Number.isFinite(aff) || aff < BEDROOM_SCENE_MIN_AFFECTION) return null;
  if (aff >= 90) return '36629';
  return '36628';
}

// 回傳 { show, artId, reason }；reason 只給測試與回報用。
// seenLabels：已觸發過的場景標籤集合（每個最多一次）。
// random 可注入，測試才能固定機率。
export function evaluateBedroomScene({
  label = '',
  affection = 0,
  isNight = false,
  now = Date.now(),
  lastShownAt = 0,
  seenLabels = [],
  busy = false,
  gameOver = false,
  ending = false,
  textOnly = false,
  warmupTurns = 0,
  random = Math.random,
} = {}) {
  if (busy) return { show: false, artId: null, reason: 'busy' };
  if (gameOver) return { show: false, artId: null, reason: 'game-over' };
  if (ending) return { show: false, artId: null, reason: 'ending' };
  if (textOnly) return { show: false, artId: null, reason: 'text-only' };
  if (warmupTurns > 0) return { show: false, artId: null, reason: 'warmup' };
  if (!isNight) return { show: false, artId: null, reason: 'day' };

  const aff = Number(affection);
  if (!Number.isFinite(aff) || aff < BEDROOM_SCENE_MIN_AFFECTION) {
    return { show: false, artId: null, reason: 'affection' };
  }
  if (!isBedroomScene(label)) return { show: false, artId: null, reason: 'not-bedroom' };

  const artId = bedroomArtFor(aff);
  if (!artId) return { show: false, artId: null, reason: 'affection' };

  const seen = Array.isArray(seenLabels) ? seenLabels : [];
  if (seen.includes(String(label))) {
    return { show: false, artId: null, reason: 'already-seen' };
  }

  const current = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const last = Math.max(0, Number(lastShownAt) || 0);
  const since = Math.max(0, current - Math.min(last, current));
  if (last > 0 && since < BEDROOM_SCENE_COOLDOWN_MS) {
    return { show: false, artId: null, reason: 'cooldown' };
  }

  // 第一次（尚無任何場景觸發過）必出現；之後 25%。
  const isFirstEver = seen.length === 0;
  if (!isFirstEver) {
    const roll = Number(random());
    if (!Number.isFinite(roll) || roll >= BEDROOM_SCENE_CHANCE) {
      return { show: false, artId: null, reason: 'chance' };
    }
  }
  return { show: true, artId, reason: 'ok' };
}
