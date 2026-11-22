/**
 * backlog.js — UI-3 對話回顧（Backlog）純讀取檢視模組
 *
 * 設計重點：
 *   - 唯讀檢視 state.history 最近 N 筆（預設 30 筆，避免 200+ 回合長存檔開啟卡頓 < 100 ms）。
 *   - 清楚區分角色對白（ai）、玩家行動（user）、禮物／系統事件（gift/ending）。
 *   - 若條目含 D20 英文配音（spokenEn），提供單句「重聽」按鈕，呼叫 window.__voiceTts.speakText。
 *   - 不修改存檔狀態，不干涉逐句打字與七選項流程。
 */

export const DEFAULT_BACKLOG_LIMIT = 30;

/**
 * 將 state.history 整理為可供畫面渲染的最近 N 筆純資料列。
 * @param {Array<object>} history
 * @param {{ limit?: number, characterName?: string, playerName?: string }} [options]
 */
export function buildBacklogEntries(history, options = {}) {
  const list = Array.isArray(history) ? history : [];
  const limit = Math.max(1, Math.min(200, Math.round(Number(options.limit) || DEFAULT_BACKLOG_LIMIT)));
  const charName = String(options.characterName || '克勞德');
  const playerName = String(options.playerName || '你');
  const start = Math.max(0, list.length - limit);
  const out = [];

  for (let i = start; i < list.length; i += 1) {
    const item = list[i];
    if (!item || typeof item !== 'object') continue;
    const text = String(item.text || '').trim();
    if (!text) continue;
    const role = String(item.role || 'ai');
    let speaker = charName;
    let kind = 'character';
    if (role === 'user' || role === 'player') {
      speaker = playerName;
      kind = 'player';
    } else if (role === 'gift' || role === 'ending' || role === 'system') {
      speaker = role === 'gift' ? '禮物紀錄' : '故事紀錄';
      kind = 'system';
    }
    const spokenLines = Array.isArray(item.spokenEn)
      ? item.spokenEn.map((s) => String(s || '').trim()).filter(Boolean)
      : (typeof item.spokenEn === 'string' && item.spokenEn.trim() ? [item.spokenEn.trim()] : []);

    out.push({
      index: i + 1,
      role,
      kind,
      speaker,
      text,
      spokenText: spokenLines.length ? spokenLines.join(' ') : ''
    });
  }

  return out;
}
