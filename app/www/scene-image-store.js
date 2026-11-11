// 場景插圖的儲存額度管理（純函式）。插圖存在 IndexedDB，原本只在刪除存檔時才清，長篇故事會一路長大。
// 規則：每個存檔最多保留 maxCount 張、總量不超過 maxBytes；超過時先丟「其他輪故事」的圖，再丟目前這輪最舊的回合，
// 永遠不丟 protectKey（剛匯入、正在顯示的那一張）。

export const SCENE_IMAGE_BUDGET = {maxCount: 60, maxBytes: 40 * 1024 * 1024};

// key 格式：<存檔>:<這輪故事>:<回合序號>
export function parseSceneImageKey(key) {
  const match = /^(.*):(\d+)$/.exec(String(key ?? ''));
  return match ? {prefix: match[1], index: Number(match[2])} : null;
}

export function pickSceneImageEvictions(entries, {maxCount = SCENE_IMAGE_BUDGET.maxCount, maxBytes = SCENE_IMAGE_BUDGET.maxBytes, protectKey = ''} = {}) {
  const protectedRun = parseSceneImageKey(protectKey)?.prefix ?? null;
  const list = (entries || [])
    .map(entry => ({key: String(entry.key), size: Math.max(0, Number(entry.size) || 0), parsed: parseSceneImageKey(entry.key)}))
    .filter(entry => entry.key !== protectKey);
  let count = list.length + 1;                         // +1：受保護的那一張
  let bytes = list.reduce((sum, entry) => sum + entry.size, 0);
  bytes += Math.max(0, Number((entries || []).find(entry => String(entry.key) === protectKey)?.size) || 0);
  list.sort((a, b) => {
    const aOther = a.parsed?.prefix !== protectedRun ? 0 : 1;
    const bOther = b.parsed?.prefix !== protectedRun ? 0 : 1;
    if (aOther !== bOther) return aOther - bOther;     // 其他輪故事先丟
    return (a.parsed?.index ?? 0) - (b.parsed?.index ?? 0) || a.key.localeCompare(b.key);
  });
  const evict = [];
  for (const entry of list) {
    if (count <= maxCount && bytes <= maxBytes) break;
    evict.push(entry.key); count--; bytes -= entry.size;
  }
  return evict;
}
