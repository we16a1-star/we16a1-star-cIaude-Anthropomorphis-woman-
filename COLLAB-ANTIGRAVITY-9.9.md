# 9.9 故事畫面頭部裁切｜OpenCode ⇄ Antigravity 協作板

> 最後更新：2026-11-20 19:55（OpenCode 量測）
> 基準：4.6.45（G43 v2.5j）之後的 9.9 修正

---

## 0. 一句話結論

**CSS 這邊已經收斂，剩下的是三張場景圖的構圖**：晨光、傍晚兩張的頭頂在原始檔第 0 列就被切掉，
日間、夜間只有 8–10 px 留白。四張都需要把「頭頂留白」做到 ≥12%、臉中心移到 x≈72%。

---

## 1. 檔案擁有權（避免互相覆蓋）

| 檔案 | 擁有者 | 說明 |
| --- | --- | --- |
| `app/www/art-plan.css` | **OpenCode** | 9.9 的分段暗底、裁切、左欄預算都在這裡 |
| `app/www/portrait-anim.js`、`story-art.js` | **OpenCode** | 表情窗定位、`data-fit="wide"` |
| `app/www/assets/g43-story-*.jpg`、`g43-cg-magic-light.jpg` | **Antigravity** | 場景圖重出 |
| `app/www/config/art_distribution.json` | **Antigravity** | 素材對照表 |
| `CHANGES.md`、`美術與UI設計-落地執行計畫書.md` | 各自追加，不要整檔覆寫 | |

> 19:41 發生過一次：Antigravity 存檔把 `art-plan.css` 的 `object-position` 還原成舊版，
> 造成 1024×768 人物被推到畫面右緣。已由 OpenCode 改回，請 Antigravity **不要再改這個檔**。

---

## 2. OpenCode 已完成並實測通過（2026-11-20 19:50）

以 `http://127.0.0.1:4789/__shot.html` 量測（括號為實際 viewport，body 會自動縮放）：

| 尺寸 | HUD | 左段暗底 | 工具列左緣 | 對話框右緣 | 選項右緣 | 狀態列底 |
| --- | --- | --- | --- | --- | --- | --- |
| 1264×781（1248×686） | 61 px | **46%** | 84.7% | 39.5% | 37.3% | 98.5% |
| 1024×768（1008×673） | 51 px | 46% | 85.6% | 39.0% | 36.8% | 98.6% |
| 1920×1080（1904×985） | 86 px | 46% | 83.1% | 39.3% | 37.1% | 98.5% |
| 800×600（784×505） | 36 px | 46% | 91.6% | 42.1% | 39.9% | 98.6% |

- 規格：工具列左緣 ≥82% ✓、對話框右緣 ≤46% ✓、選項右緣 ≤46% ✓、中央 46–82% 完全透明 ✓
- 場景圖 `inset:0; height:100%`，不再有舊版 `-2%／104%／translateY(-1.5%)` 的 3.5% 切頂。
- 四張場景一律 `object-position:100% 0%`（貼右裁左）：
  - 16:9（1920×1080）不裁水平，臉維持 70%。
  - 4:3（1024×768）裁掉左側 15.7%，臉落在 66–68%。
  - 若用 `0%`（貼左裁右），1024×768 的臉會跑到 **83%**，被工具列壓住。

---

## 3. 需要 Antigravity 處理：場景圖重出

### 3.1 實測（以髮絲／髮飾最上緣計）

| 場景 | 檔案 | 尺寸 | 頭頂 | 目標 ≥12% | 臉中心 x | 目標 72% | 判定 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 白天 | `g43-story-default.jpg` | 1024×576 | 10 px（1.7%） | ≥70 px | 70% | 72% | 偏緊，建議重出 |
| 晨光 | `g43-story-soft-morning.jpg` | 1024×576 | **0 px（0.0%）** | ≥70 px | 60% | 72% | **原圖就切到，必修** |
| 夜間 | `g43-cg-magic-light.jpg` | 1024×576 | 8 px（1.4%） | ≥70 px | 63% | 72% | 偏緊，建議重出 |
| 傍晚 | `g43-story-reading.jpg` | 1672×941 | **0 px（0.0%）** | ≥113 px | 58% | 72% | **原圖就切到，必修** |

> 判定方式：CSS 已是「垂直對齊頂部、只裁底部」，所以畫面上看到的上緣就是原圖第 0 列。
> 原圖頭頂 0 px ＝ 一定看起來被切，CSS 補不回來（除非加黑邊，而規格禁止）。

### 3.2 重出規格

- 比例 **16:9**，**1024×576**（傍晚可維持 1672×941），JPEG q90，檔名路徑不變。
- 舊檔先備份到 `app/www/assets/backup-old/`。
- **頭頂（含髮飾、飛髮）距圖上緣 ≥12%**
  - 1024×576 → y ≥ 70 px；1672×941 → y ≥ 113 px
- **頭部高度（髮頂到下巴，含髮飾）≤ 畫面高度 34%**
  - 1024×576 → ≤ 196 px
- **眼睛中心落在 y 30%–33%**
  - 1024×576 → y 173–190 px
- **臉中心 x ≈ 72%**（1024×576 → x ≈ 737 px）
- 左側 x 0–46% 只放書架、窗景等低對比背景；人物頭部落在 x 46–82%；x ≥82% 只有小工具列。

---

## 4. 給 Antigravity Agent 的提示詞（可直接貼）

```
請只處理 app/www/assets 的場景圖，不要修改 app/www/art-plan.css、portrait-anim.js、story-art.js。

要重出的檔案（16:9，1024×576，JPEG q90，覆蓋原檔，舊檔先備份到 assets/backup-old/）：
1. g43-story-soft-morning.jpg —— 目前頭頂在第 0 列，髮絲與花飾被切掉，必修
2. g43-story-reading.jpg —— 目前頭頂在第 0 列，必修（可維持 1672×941）
3. g43-story-default.jpg —— 頭頂只有 10px，補到 ≥70px
4. g43-cg-magic-light.jpg —— 頭頂只有 8px，補到 ≥70px

四張都必須符合：
- 頭頂（含髮飾、飛髮）距圖上緣 ≥12%（1024×576 → ≥70px；1672×941 → ≥113px）
- 頭部高度（髮頂到下巴含髮飾）≤ 畫面高度 34%
- 眼睛中心落在 y 30%–33%
- 臉中心 x ≈ 72%（1024×576 → x≈737px）
- 人物在畫面右半、朝向左側對話框；左側 0–46% 只放低對比書架／窗景
- 不要有黑邊、不要加文字、不要改變角色設定（橘紅長髮、向日葵／日芒花飾、黑蝴蝶結、白維多利亞領巾、橘金刺繡披肩）

完成後在 CHANGES.md 追加一筆，並把 art_distribution.json 的 width/height 更新為實際值。
```

---

## 5. 驗收方式（OpenCode 會用同一套重跑）

```powershell
# 1) 唯讀靜態伺服器（不寫專案）
& "$env:LOCALAPPDATA\Temp\opencode\node.exe" `
  "$env:LOCALAPPDATA\Temp\opencode\artverify\serve.mjs" `
  "<專案>\app\www" 4789

# 2) 量測（把數字寫進 <title>，再用 --dump-dom 讀）
$chrome="C:\Program Files\Google\Chrome\Application\chrome.exe"
foreach($s in @("1264,781","1024,768","1920,1080","800,600")){
  & $chrome --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 `
    --window-size=$s --virtual-time-budget=5000 `
    --user-data-dir="$env:TEMP\opencode\chrome-artverify" `
    --dump-dom "http://127.0.0.1:4789/__shot.html?scene=day&measure=1"
}

# 3) 截圖（四場景 × 四尺寸）
& $chrome --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 `
  --window-size=1264,781 --virtual-time-budget=4000 `
  --user-data-dir="$env:TEMP\opencode\chrome-artverify" `
  --screenshot="out\day-1264x781.png" `
  "http://127.0.0.1:4789/__shot.html?scene=day"
```

`__shot.html` 會注入「故事進行中＋七選項＋自由行動＋長回覆」，並移除會自動換圖的
`story-art.js`，所以每張圖都是同一個版面，可直接比對。

## 6. 通過標準

- [ ] 四張場景在 1264×781、1024×768、1920×1080、800×600 下頭頂與髮飾完整可見
- [ ] 頭頂沒有被 HUD 暗底壓暗（中央 46–82% 無暗底）
- [ ] 臉部沒有被左欄對話框／選項／工具列遮住
- [ ] `node --test tests/**/*.test.js` 沒有新增失敗
- [ ] PII／簡體掃描 0
