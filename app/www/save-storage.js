// 存檔的「實體格式」集中在這裡（R42 經創意工坊套用管線驗證），app.js 只負責決定什麼時候寫。
//
// 為什麼要分成每格一個 key（v2）：
//   舊版把所有存檔（自動／快速／每個手動格）塞進同一個 localStorage 值裡，每次自動存檔都要
//   重新序列化並覆寫「全部」存檔，同時再寫一份完整備份——格子越多、故事越長，每回合的
//   寫入量就越大。v2 改成：
//     索引  claude_novel_slots_index_v2          只放每格的名稱／備註／更新時間（幾百位元組）
//     內容  claude_novel_slot_v2_<id>            每一格自己的內容
//     備份  claude_novel_slot_v2_backup_<id>     那一格「上一次成功寫入」的內容
//   自動存檔只動「正在玩的那一格」＋小索引，其他格子完全不重寫；單一格壞掉也只影響那一格。
//
//   舊格式（claude_novel_slots_v1）仍然讀得到：載入時自動搬到 v2，確認 v2 讀得乾淨後才刪掉舊 key。

export const SLOTS_INDEX_KEY = 'claude_novel_slots_index_v2';
export const SLOTS_INDEX_VERSION = 2;
export const SLOT_KEY_PREFIX = 'claude_novel_slot_v2_';
export const SLOT_BACKUP_PREFIX = 'claude_novel_slot_v2_backup_';
export const SLOTS_KEY_PREFIX = 'claude_novel_slots_v1'; // 舊版單一 key（僅供搬遷）
export const SLOTS_BACKUP_KEY = 'claude_novel_slots_backup_v1'; // 舊版整包備份（搬遷後保留當最後防線）

const COMPACTABLE_DEFAULT_FIELDS = ['characterProfile', 'worldSetting', 'storyTemplate'];

/** 單一存檔的實體 key（id 一律轉成字串，避免 undefined 造成 key 相撞）。 */
export function slotKey(id) {
  return SLOT_KEY_PREFIX + String(id);
}

/** 單一存檔的備份 key：內容是「上一次成功寫入」的同一格。 */
export function slotBackupKey(id) {
  return SLOT_BACKUP_PREFIX + String(id);
}

/** 從 key 反推存檔 id（不是 v2 的 key 就回 null），給「清掉已刪除格子」用。 */
export function slotIdFromKey(key) {
  const text = String(key || '');
  if (text.startsWith(SLOT_BACKUP_PREFIX)) return text.slice(SLOT_BACKUP_PREFIX.length);
  if (text.startsWith(SLOT_KEY_PREFIX)) return text.slice(SLOT_KEY_PREFIX.length);
  return null;
}

/**
 * 移除重複的內建長提示（角色／世界／規則），讀取時 normalizeSlot() 會用預設值補回來；
 * 玩家自己改過的內容原封不動。回傳新物件，不改呼叫端資料。
 */
export function compactSlotForStorage(slot, defaults) {
  if (!slot || typeof slot !== 'object' || !slot.state || typeof slot.state !== 'object') return slot;
  const state = { ...slot.state };
  for (const key of COMPACTABLE_DEFAULT_FIELDS) {
    if (state[key] === defaults[key]) delete state[key];
  }
  return { ...slot, state };
}

/** 對整個存檔陣列做同樣的精簡（給需要一次處理多格的呼叫端／測試用）。 */
export function compactSlotsForStorage(slots, defaults) {
  if (!Array.isArray(slots)) throw new TypeError('Save slots must be an array.');
  return slots.map(slot => compactSlotForStorage(slot, defaults));
}

/** 索引內容：只放清單需要的欄位，讓自動存檔的索引寫入維持在幾百位元組。 */
export function slotsIndexPayload(slots) {
  const list = (Array.isArray(slots) ? slots : []).map(slot => ({
    id: String(slot?.id || ''),
    name: String(slot?.name || ''),
    memo: String(slot?.memo || ''),
    kind: String(slot?.kind || ''),
    temporaryChat: !!slot?.temporaryChat,
    updatedAt: Number(slot?.updatedAt) || 0
  })).filter(entry => entry.id);
  return JSON.stringify({ v: SLOTS_INDEX_VERSION, slots: list });
}

/** 解析索引；版本不符或格式壞掉一律回 null（呼叫端就會走舊格式搬遷）。 */
export function parseSlotsIndex(raw) {
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || parsed.v !== SLOTS_INDEX_VERSION) return null;
  if (!Array.isArray(parsed.slots)) return null;
  const out = parsed.slots.map(entry => ({
    id: String(entry?.id || ''),
    name: String(entry?.name || ''),
    memo: String(entry?.memo || ''),
    kind: String(entry?.kind || ''),
    temporaryChat: !!entry?.temporaryChat,
    updatedAt: Number(entry?.updatedAt) || 0
  })).filter(entry => entry.id);
  return out.length ? out : null;
}

/** storage 裡所有 v2 存檔（含備份）用到的 key。 */
export function listStoredSlotKeys(storage) {
  const keys = [];
  const total = Number(storage?.length) || 0;
  const getKey = index => (typeof storage?.key === 'function' ? storage.key(index) : null);
  for (let index = 0; index < total; index += 1) {
    const key = getKey(index);
    if (typeof key === 'string' && (key.startsWith(SLOT_KEY_PREFIX) || key.startsWith(SLOT_BACKUP_PREFIX))) keys.push(key);
  }
  return keys;
}

/**
 * 寫入並讀回驗證；預設要求內容是「存檔陣列」（單一格請傳 check）。
 * 讀回不符或驗證失敗都丟錯，讓呼叫端可以回滾記憶體狀態。
 */
export function writeVerified(storage, key, payload, check) {
  storage.setItem(key, payload);
  const written = storage.getItem(key);
  if (written !== payload) throw new Error('Saved data did not match the written data.');
  const parsed = JSON.parse(written);
  if (typeof check === 'function') {
    if (!check(parsed)) throw new Error('Saved data is not a valid slot list.');
    return true;
  }
  if (!Array.isArray(parsed)) throw new Error('Saved data is not a valid slot list.');
  return true;
}

/** 單一格內容的驗證（物件、有 state）。 */
export function isSlotPayload(parsed) {
  return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed) && !!parsed.state && typeof parsed.state === 'object';
}

/**
 * 讀出一格的內容：主 key 讀不到或壞掉時退回該格的備份 key。
 * 回傳 {raw, parsed, fromBackup} 或 null；raw 是「磁碟上實際的字串」（給快取比對用）。
 */
export function readStoredSlot(storage, id) {
  const candidates = [
    { key: slotKey(id), fromBackup: false },
    { key: slotBackupKey(id), fromBackup: true }
  ];
  for (const { key, fromBackup } of candidates) {
    let raw = null;
    try {
      raw = storage.getItem(key);
    } catch {
      raw = null;
    }
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      // 只接受「看起來真的是存檔」的內容；壞成半截或只剩 {} 的內容一律當讀不到，
      // 讓下面退回備份，而不是把空物件當成一個沒有故事的存檔。
      if (!isSlotPayload(parsed)) continue;
      return { raw, parsed, fromBackup };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * 索引不見或壞掉時，直接掃描磁碟上的 v2 key，把還讀得到的格子全部收集回來（給自動修復索引用）。
 * 每一格都會先試主 key、再退回自己的備份；連備份都讀不到的格子會跳過（交給其他補救路徑）。
 */
export function collectStoredSlots(storage) {
  const seen = new Set();
  const out = [];
  for (const key of listStoredSlotKeys(storage)) {
    const id = slotIdFromKey(key);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const found = readStoredSlot(storage, id);
    if (!found) continue;
    out.push({ id, raw: found.raw, parsed: found.parsed, fromBackup: found.fromBackup });
  }
  out.sort((a, b) => (Number(b.parsed?.updatedAt) || 0) - (Number(a.parsed?.updatedAt) || 0));
  return out;
}
