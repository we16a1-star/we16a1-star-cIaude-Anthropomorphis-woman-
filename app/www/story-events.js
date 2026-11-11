// Fixed event proposals from the model are suggestions only. The game validates
// relationship/time gates and persists one-shot milestones per save slot.
// v5 Step 2：新增晚安、夜間蓋被讀書、捏臉、湖畔夕陽四個旗標。
export const STORY_EVENT_FLAGS = [
  'letter', 'moon_bird', 'outing_memory', 'magic_touch', 'vow',
  'goodnight', 'night_chat_reading', 'cheek_pinch', 'lakeside_sunset'
];
export const STORY_EVENT_ONE_SHOTS = ['moon_bird', 'outing_memory', 'magic_touch', 'vow', 'lakeside_sunset'];
export const GOODNIGHT_COOLDOWN_DAYS = 7;

export function normalizeStoryEventFlag(value) {
  return STORY_EVENT_FLAGS.includes(value) ? value : '';
}

export function normalizeSeenStoryEventFlags(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map(normalizeStoryEventFlag)
    .filter(flag => STORY_EVENT_ONE_SHOTS.includes(flag)))];
}

export function approveStoryEvent(value, { affection = 0, isNight = false, seen = [], day = 0, lastGoodnightDay = 0 } = {}) {
  const flag = normalizeStoryEventFlag(value);
  if (!flag) return '';
  const safeSeen = normalizeSeenStoryEventFlags(seen);
  if (STORY_EVENT_ONE_SHOTS.includes(flag) && safeSeen.includes(flag)) return '';
  if (flag === 'moon_bird' && (Number(affection) < 25 || !isNight)) return '';
  if (flag === 'outing_memory' && Number(affection) < 25) return '';
  if (flag === 'magic_touch' && (Number(affection) < 50 || !isNight)) return '';
  if (flag === 'vow' && Number(affection) < 75) return '';
  // 晚安主 CG：夜間、好感 75 以上（C 階段），且每 7 個故事日最多一次。
  if (flag === 'goodnight' && (Number(affection) < 75 || !isNight)) return '';
  if (flag === 'goodnight') {
    const today = Math.max(0, Math.floor(Number(day) || 0));
    const last = Math.max(0, Math.floor(Number(lastGoodnightDay) || 0));
    if (today > 0 && last > 0 && today - last < GOODNIGHT_COOLDOWN_DAYS) return '';
  }
  // 夜間蓋被讀書：夜間、好感 50 以上（B 階段）；可重複，不列入一次性。
  if (flag === 'night_chat_reading' && (Number(affection) < 50 || !isNight)) return '';
  // 捏臉：日間限定（36627 為日間場景），由玩家實際觸碰帶出。
  if (flag === 'cheek_pinch' && isNight) return '';
  // 湖畔夕陽：好感 50 以上的一次性外出回憶。
  if (flag === 'lakeside_sunset' && Number(affection) < 50) return '';
  return flag;
}
