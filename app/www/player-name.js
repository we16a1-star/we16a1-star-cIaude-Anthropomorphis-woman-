// player-name.js
// D14（v2.0）：玩家名稱的單一來源——預設值、清理、正規化與本機偏好儲存。
// 純邏輯模組：不碰 DOM，storage 由呼叫端傳入（預設全域 localStorage），可單獨 node --test。
// 使用者：app.js（開始介面）、memory-system.js、prompt-assembler.js。

export const DEFAULT_PLAYER_NAME = 'User';
export const PLAYER_NAME_MAX_LENGTH = 16;
export const PLAYER_NAME_KEY = 'claude_novel_player_name_v1';

// 清理輸入：移除控制字元與引號（引號會破壞 template 屬性）、去除首尾空白、
// 以 Unicode 字元（code point）為單位截斷到 16 個字（emoji 不會切半）。清空後回空字串。
export function sanitizePlayerName(value) {
  let text = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/["']/g, '');
  text = text.trim();
  const chars = Array.from(text);
  return chars.length > PLAYER_NAME_MAX_LENGTH ? chars.slice(0, PLAYER_NAME_MAX_LENGTH).join('') : text;
}

// 正規化：清完為空一律回退預設名「User」（含 undefined／null／全空白）。
export function normalizePlayerName(value) {
  return sanitizePlayerName(value) || DEFAULT_PLAYER_NAME;
}

// 寫入本機偏好；既要寫回也要回傳正規化後的名稱。失敗靜默（本機儲存不可用時不阻擋遊戲）。
export function savePlayerNamePreference(value, storage = globalThis.localStorage) {
  const name = normalizePlayerName(value);
  try { storage?.setItem(PLAYER_NAME_KEY, name); } catch { /* 本機儲存不可用：忽略 */ }
  return name;
}

// 讀回偏好；無值、損毀或讀取失敗一律回預設「User」。
export function loadPlayerNamePreference(storage = globalThis.localStorage) {
  try {
    return normalizePlayerName(storage?.getItem(PLAYER_NAME_KEY));
  } catch {
    return DEFAULT_PLAYER_NAME;
  }
}
