// v4.6.34｜可選的「來自 Anthropic 的一封信」事件（純函式）。
// 規則：每完成 ANTHROPIC_LETTER_INTERVAL 個回合（不含序章）抽一次，
// 機率 ANTHROPIC_LETTER_CHANCE。抽中後以「好感度 0 的結局」收束，
// 但不改寫 affection 數值；存檔保留觸發當下的好感度，只能重新開始故事。
export const ANTHROPIC_LETTER_CHANCE = 0.01;
export const ANTHROPIC_LETTER_INTERVAL = 2;

function clampRoll(value) {
  return Math.max(0, Math.min(0.999999999, Number(value) || 0));
}

/** 只有第 2、4、6……個成功回合才檢查，且必須由玩家開啟。 */
export function isAnthropicLetterTurn(turnCount, enabled = true) {
  if (enabled !== true) return false;
  const turns = Math.max(0, Math.floor(Number(turnCount) || 0));
  return turns > 0 && turns % ANTHROPIC_LETTER_INTERVAL === 0;
}

/** 1% 機率；回傳 true＝收到信。 */
export function rollAnthropicLetter(random = Math.random) {
  return clampRoll(random()) < ANTHROPIC_LETTER_CHANCE;
}

export function shouldTriggerAnthropicLetter(turnCount, enabled = true, random = Math.random) {
  return isAnthropicLetterTurn(turnCount, enabled) && rollAnthropicLetter(random);
}

/** 只回傳結局狀態，刻意不碰 affection：數值要留在觸發當下。 */
export function letterEndingPatch() {
  return {
    gameOver: true,
    letterEvent: true,
    choices: [],
    ending: true,
    pendingSpecialEvent: '',
    pendingMilestone: ''
  };
}

export function letterEndingText(language = 'zh', affection = 0) {
  const value = Number.isFinite(Number(affection)) ? String(affection) : '0';
  if (language === 'en') {
    return `A letter from Anthropic ended this story. Affection stays at its trigger value (${value}) and was not reset.`;
  }
  return `一封來自 Anthropic 的信中止了這段故事；好感度停留在觸發時的數值（${value}），不會歸零。`;
}
