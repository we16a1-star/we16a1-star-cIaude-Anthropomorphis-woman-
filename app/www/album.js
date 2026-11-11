// G43（WP3）：簡易相簿的資料登錄。
// 只提供純資料與唯讀 helper；解鎖狀態由 app.js 的 state.albumUnlocked 管理。
export const ALBUM_FREE_IDS = ['36626', '36676', '36684', '36623', '36624', '36625'];

export const ALBUM_ENTRIES = [
  { id: '36626', file: 'g43-album-36626.jpg', title: '插畫 36626' },
  { id: '36676', file: 'g43-album-36676.jpg', title: '插畫 36676' },
  { id: '36684', file: 'g43-album-36684.jpg', title: '插畫 36684' },
  { id: '36623', file: 'g43-album-36623.webp', title: '插畫 36623（對話版）' },
  { id: '36624', file: 'g43-album-36624.webp', title: '插畫 36624（對話版）' },
  { id: '36625', file: 'g43-album-36625.webp', title: '插畫 36625（對話版）' },
  { id: '36628', file: 'g43-cg-goodnight-reading.jpg', title: '插畫 36628' },
  { id: '36629', file: 'g43-cg-goodnight-nightgown.jpg', title: '插畫 36629' },
  { id: '36685', file: 'g43-cg-goodnight.jpg', title: '插畫 36685' },
];

export function albumEntry(id) {
  return ALBUM_ENTRIES.find(item => item.id === String(id)) || null;
}

export function isAlbumUnlocked(state, id) {
  return Array.isArray(state?.albumUnlocked) && state.albumUnlocked.includes(String(id));
}

export function albumImageSrc(id) {
  const entry = albumEntry(id);
  return entry ? 'assets/' + entry.file : '';
}
