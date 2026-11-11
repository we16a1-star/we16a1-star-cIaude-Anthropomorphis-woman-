export const STORY_EMOTIONS = ['neutral','happy','proud','shy','surprised','dizzy','curious','focused','worried','tender'];
export const EMOTION_WHITELIST = STORY_EMOTIONS;
const EMOTION_ALIASES = {
  smug: 'proud', confident: 'proud', pleased: 'proud', '得意': 'proud',
  embarrassed: 'shy', blush: 'shy', '害羞': 'shy',
  thinking: 'focused', reading: 'focused', concentrating: 'focused', '專注': 'focused',
  '好奇': 'curious', '開心': 'happy', '驚訝': 'surprised', '暈': 'dizzy', '日常': 'neutral',
  worried: 'worried', anxious: 'worried', concerned: 'worried', '擔憂': 'worried', '心疼': 'worried', '擔心': 'worried', '焦慮': 'worried',
  tender: 'tender', gentle: 'tender', affectionate: 'tender', warm: 'tender', '溫柔': 'tender', '眷戀': 'tender', '柔和': 'tender'
};

export function normalizeStoryEmotion(value) {
  const key = String(value || '').trim().toLowerCase();
  const canonical = EMOTION_ALIASES[key] || key;
  return STORY_EMOTIONS.includes(canonical) ? canonical : 'neutral';
}

export function normalizeStoryEmotionIntensity(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(3, Math.round(n)));
}

export { normalizeStoryEmotion as normalizeEmotion };

