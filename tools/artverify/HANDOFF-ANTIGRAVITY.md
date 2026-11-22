# 交接給 Antigravity：四場景素材 + H14 髮頂量測

> 寫於 2026-11-22（下午）。這份是**唯一入口**：先看完第 1、2 節再動手。
> 相關文件：`COLLAB-STATUS.md`（harness 修復史）、`art-final\README.md`（素材加工細節）、
> `..\..\CHANGES.md`（逐次變更紀錄）。

---

## 1. 一句話狀態

> **【2026-11-22 上午更新｜T1–T4 全部完結】**
> - **T1（H14）已完成**：落地推薦方案 1，`app\www\assets\art-heads.json` 已建立並接入 `shot-inject.html`（16/16 `headSource=meta`、`headPctOfImage=13.5%`）。
> - **T2（四場景接縫與去鬼影）已完成**：以 `add-headroom-v2.ps1` 修正頂部延伸演算法，消除已安裝版硬切暗塊與舊 `art-final` 夜間拉絲鬼影，已用 `install-art.ps1` 備份並安裝（`shots\verify-v2-*-1264.png` 肉眼覆核通過）。
> - **T3（第 8 項 sticky 遮擋）已完成**：經使用者授權，改用 `.choices-list` 雙層 Flex 分區＋`position: relative` 固定底列，四種解析度實測 **`choicesCovered=0`、`choicesMaxOverlap=0`、`freeVisible=True`**。
> - **T4（文件與同步）已完成**：`CHANGES.md`、`matrix.csv`、`states.csv` 與單元測試全數同步通過。

四張場景素材**已經安裝進遊戲並驗證通過**（16/16、`errors: 0`、髮頂 12.1%–14.6%）。
**H14 不是單純的調參 bug**，真因是「原圖右上角本來就有暖色背景」，換了三種演算法都無法同時
正確判定四張圖；建議改成「每張素材附人工確認的髮頂比例」。剩下三件小事列在第 5 節。

---

## 2. 現在的事實（2026-11-22 下午實測，可直接採信）

### 2.1 遊戲內已安裝的檔案

`v2.0-modifications\app\www\assets\`（2026-11-22 04:50 由 Antigravity 安裝）：

| 檔名 | 大小 | SHA256 前 16 | 原檔備份 |
| --- | --- | --- | --- |
| `g43-story-default.jpg` | 157014 | `C929FC512A52D7DD` | `assets\backup-old\20261122-045318-g43-story-default.jpg` |
| `g43-story-soft-morning.jpg` | 138897 | `D9DF9836F41CA99F` | `…-g43-story-soft-morning.jpg` |
| `g43-cg-magic-light.jpg` | 131269 | `F37E7D01112D4661` | `…-g43-cg-magic-light.jpg` |
| `g43-story-reading.jpg` | 138528 | `AE3766BEDE33BE12` | `…-g43-story-reading.jpg` |

`backup-old\` 另有 `20261121-*`（前一版）與 `g43-*-old-*.jpg`（11-04 初版），不要刪。

### 2.2 harness 對「已安裝版本」的量測（本次重跑，非舊紀錄）

`run-matrix.ps1`（4 場景 × 4 尺寸，服務 `app\www`）：

- 16/16 有量到，`errors` 合計 **0**
- 色調：night → `night/night`，其餘 → `warm/warm`
- `headPctOfImage`：day **12.7**、night **12.1**、morning **12.4**、evening **14.6**（四種尺寸一致）
- `painted` 在 16:9 為 `1219.6x686`、`padTop 0`；1024×768 與 800×600 為 `contain`，`padTop 53 / 32`

`run-states.ps1`（7 種狀態，服務 `app\www`）：7 列、`errors` 合計 **0**；
`wait` 的 `visible=True`、`album` 的 `lightbox=True`、`menu` 的 `open=True`、
`custom` 立繪 333×576.2 右緣 1198.1、`custom-t` 326.2×576.2 右緣 1198.1，全部與先前一致。

### 2.3 兩個量測器對同一組檔案的差異（重要）

| 場景 | harness `headPctOfImage` | `measure-file.ps1`（嚴格橘紅、x 48–78%、≥25 px/列） | 肉眼（格線圖） |
| --- | --- | --- | --- |
| day | 12.7% | 76 px（13.2%） | ≈13% |
| night | 12.1% | 82 px（14.2%） | ≈14% |
| morning | 12.4% | 109 px（18.9%） | ≈15%（88 px 左右） |
| evening | 14.6% | 76 px（13.2%） | ≈13% |

三者都不完全一致，但**都在 12% 以上**。也就是說：門檻判定可用，但「髮頂」這個數字本身
只有 ±3 個百分點的精度。**不要把它當成絕對值去追。**

---

## 3. 檔案地圖

```
v2.0-modifications\
  app\www\assets\                     ← 已安裝的四張（勿動，除第 5 節 T2）
    backup-old\                       ← 原檔備份
  tools\artverify\                    ← 長期保存的 harness 與工具
    serve.mjs  shot-inject.html  cdp.mjs
    run-matrix.ps1  run-states.ps1  matrix.csv  states.csv
    measure-file.ps1  scan-hair.ps1  seam-detect.ps1  detect-head.ps1
    add-headroom.ps1  contact.ps1  split-grid.ps1  rowlum*.ps1
    install-art.ps1                   ← 新增：安全安裝（自動備份、可 -DryRun）
    HANDOFF-ANTIGRAVITY.md            ← 本檔
    COLLAB-STATUS.md
    art-final\                        ← 另一版四張 + 截圖 + README（未安裝，見 T2）
    shots\                            ← 實機截圖（verify-*-1264.png 對應已安裝版）
    _backup-20261122\                 ← 舊版 harness
  CHANGES.md
%TEMP%\opencode\artverify\            ← 工作副本（內容與 tools\artverify 同步）
%TEMP%\opencode\artverify\www-preview\  ← 遊戲複本，目前載入的是 art-final 那組
```

`%TEMP%` 副本與 `tools\artverify` 的 `.ps1` 只差 BOM，內容相同；`add-headroom.ps1`
以 `tools\artverify` 的版本為準（`%TEMP%` 那份被我改過，**已還原**）。

---

## 4. H14 的真因與已排除的做法（別重做）

### 4.1 症狀

同一組 `art-final` 素材，harness 回報：day 12.7%、night **6.3%**、morning **3.2%**、
evening 12.1%。已安裝那組則是 12.7 / 12.1 / 12.4 / 14.6。兩組都是同一批原圖加工的。

### 4.2 真因

`shot-inject.html` 的 `isHair()` 只看「右半部、橘紅、飽和、亮度 0.22–0.80」。四張原圖的
**右上角本來就有暖色**：白天是書架暖木色、夜間是窗外暖光、晨光是窗邊逆光。這些像素跟
橘紅頭髮在 HSV 上重疊，於是掃描在真正的髮頂之前就命中背景。

也就是說：**留白條不是主因**。把 `art-final` 的留白條整個遮掉再掃，morning 仍然只到
9.9%、night 只到 7.7%，因為原圖自己的第 2–9 列就有暖色。

### 4.3 已試過、**不要重做**的四種做法

| 做法 | 結果 | 為什麼不行 |
| --- | --- | --- |
| A. 提高 `isHair()` 門檻（`VariantB/C`：R≥170、R−B≥85、sat>0.5） | magic-light 直接找不到（-1），morning 反而跑到 84 | 頭髮在暗部本來就不飽和，收緊就抓不到 |
| B. 臉中心 ±8% 縱帶 + 每列 ≥15% 命中（`detect-head.ps1`） | 77 / 55 / 38 / 70 px（13.4 / 9.5 / 6.6 / 12.2%） | 帶內仍有背景暖色，magic-light 卡在 38 |
| C. 最長連續寬度 ≥8% 圖寬（run-length） | 84 / 65 / -1 / 80 | magic-light 完全沒有夠長的連續段 |
| D. 以臉為種子對「髮色∪膚色」做 flood fill（`blob-head2.ps1`） | blobPx = 0/1/2，或整張圖 46% | 暗部頭髮與背景不連通，種子常落在背景 |
| E. 偵測留白條接縫後跳過（`seam-detect.ps1`，用逐列垂直差異） | 接縫本身抓得到（live 57/72/72/67，jump 8.8–26.0，base≈1） | 但跳過接縫後仍會命中原圖暖色；且 art-final default 在 1024 抓到 88、在 1220 抓到 0 → 不穩定 |

`seam-detect.ps1` 留著當「這張圖有沒有合成留白條」的檢查工具，但**不要**拿它當髮頂解法。

### 4.4 建議的解法（未實作，請選一個）

**方案 1（推薦，決定性）**：每張場景素材附一份 `assets\art-heads.json`
（草稿已放在 `tools\artverify\art-heads.draft.json`，數值可直接沿用）

```json
{
  "g43-story-default.jpg":      { "headPct": 0.132, "checked": "2026-11-22", "by": "measure-file + 肉眼" },
  "g43-story-soft-morning.jpg": { "headPct": 0.153, "checked": "2026-11-22", "by": "measure-file + 肉眼" },
  "g43-cg-magic-light.jpg":     { "headPct": 0.142, "checked": "2026-11-22", "by": "measure-file + 肉眼" },
  "g43-story-reading.jpg":      { "headPct": 0.132, "checked": "2026-11-22", "by": "measure-file + 肉眼" }
}
```

`shot-inject.html` 先讀這份（`fetch('/assets/art-heads.json')`），有值就用、`head.source = 'meta'`；
沒有才跑現行掃描、`head.source = 'scan'`。`?head=0.13` 的手動覆寫保留在最優先。
好處：數字穩定、可稽核、換圖時只要更新 JSON；不必再跟背景顏色搏鬥。

**方案 2（純啟發式）**：臉中心 + 縱帶 + 「連續 8 列都 ≥5% 命中」+ 取最上緣。
比方案 1 差，但不用新增檔案。實作前請先確認 day/evening 不掉。

**方案 3（不改）**：承認 `headPctOfImage` 是「保守下界」，門檻仍用 ≥12%，
但每次換圖都要人工看 `preview-*.png`。這是最省事的做法，風險是數字會誤導下一個人。

> 不論選哪個，改完請重跑 `run-matrix.ps1` 與 `run-states.ps1`，並把新數字寫回
> `matrix.csv` / `states.csv` 與 `CHANGES.md`。

---

## 5. 待辦（依優先序）

### T1　H14：選方案並實作（見 4.4）

### T2　決定要不要換成 `art-final\` 那四張

兩組的差別（`art-final\compare-installed-vs-artfinal.png`，上＝已安裝、下＝art-final）：

- `art-final`：接縫處理較細（亮度對齊＋原圖第 0 列 20 px 漸層），**沒有明顯橫向亮帶**。
- 已安裝版：留白條底部有一條可辨識的水平界線（day / morning / reading 較明顯）；
  但 1264×781 實機有 HUD 暗底壓著，**遊戲中看不出來**（見 `shots\verify-night-1264.png`）。

風險：換成 `art-final` 後 harness 會回報 night 6.3% / morning 3.2%，看起來像退步。
**要換就必須先做 T1**，否則請維持現狀。

換檔指令（會自動備份、可先試跑）：

```powershell
powershell -ExecutionPolicy Bypass -File "$env:TEMP\opencode\artverify\install-art.ps1" `
  -Source "$env:TEMP\opencode\artverify\art-final" -DryRun     # 先看 hash
# 確認後拿掉 -DryRun 再跑一次
```

### T3　第 8 個選項會壓到上面的選項（遊戲 CSS，不是 harness）

實測：1264×781 覆蓋 1 個、最大重疊 37.4 px；1024×768 覆蓋 2 個、21.8 px；
1920×1080 覆蓋 1 個、46.4 px；800×600 覆蓋 2 個、13.1 px。
來源是 `.choice-btn.free-choice-toggle`（自由輸入）在選項超過 5 個時沒有預留高度。
harness 只負責回報（`choicesCovered` / `choicesMaxOverlap` / `choicesScroll`），
**修法在遊戲 CSS**，動手前先確認使用者要不要改（屬 G43 版面安全區）。

### T4　文件同步

`COLLAB-STATUS.md` 第 4 節寫「舊素材已備份、100% 通過」，但沒寫是**哪一組**；第 6.4 節
還寫「尚未安裝」。本次已更正，接手後若再改動，請一併更新 `CHANGES.md`。

---

## 6. 操作指令（照抄即可）

```powershell
$node = Join-Path $env:TEMP 'opencode\node.exe'
$av   = Join-Path $env:TEMP 'opencode\artverify'

# 1) 伺服器（先確認 4790 沒被佔用：Get-NetTCPConnection -LocalPort 4790）
& $node "$av\serve.mjs" "C:\Users\shiny\OneDrive\桌面\Claude 娘1113\v2.0-modifications\app\www" 4790

# 2) 矩陣（4 場景 × 4 尺寸 → matrix.csv）
powershell -ExecutionPolicy Bypass -File "$av\run-matrix.ps1"

# 3) 七種狀態（→ states.csv）
powershell -ExecutionPolicy Bypass -File "$av\run-states.ps1"

# 4) 單張實機截圖
& $node "$av\cdp.mjs" "http://127.0.0.1:4790/__shot.html?state=story&scene=night&measure=1" `
  --shot "$av\shots\story-night-1264.png" --width 1264 --height 781 --timeout 25000 --settle 900

# 5) 素材幾何檢查（單檔）
powershell -ExecutionPolicy Bypass -File "$av\measure-file.ps1" -Path "<jpg>"
```

判定標準：`errors` 全 0、night 的 `tone` 為 `night/night`、`headPctOfImage` ≥ 12、
實機截圖頂部沒有亮帶且頭頂不貼邊。

---

## 7. 禁區與陷阱

- **不要改原始專案** `C:\Users\shiny\OneDrive\桌面\Claude 娘1113\`（只動 `v2.0-modifications\`）。
- **不要改遊戲邏輯**（`app.js`、`style.css` 的版面）——除非是 T3 且使用者同意。
- 動 `app\www\assets\` 前一定先備份（`install-art.ps1` 會做）。
- `node` 不在 PATH，用 `$env:TEMP\opencode\node.exe`（v22，有全域 `WebSocket`）。
- 含中文的 `.ps1` 存 **UTF-8 with BOM**，否則 PowerShell 5.1 亂碼。
- PowerShell 5.1：`[System.Drawing.Rectangle]::new(...)`，別用 `New-Object ... 0,0,$W,$H`；
  變數不要叫 `$out`。
- `chrome.exe --user-data-dir` 不可與已開的 Chrome 共用（會吐 0 byte）；`cdp.mjs` 每次用獨立 profile。
- 4790 很容易被前一個 session 的伺服器佔著：先確認它服務的是哪個 `www`（抓
  `/assets/g43-story-default.jpg` 比對 hash），再跑矩陣。
- 影像生成目前**額度不足**，不要嘗試重出圖；要改構圖請使用者提供新圖。

---

## 8. 這一輪我做了什麼（避免重複）

1. 重跑矩陣驗證已安裝版：16/16、`errors: 0`、12.1%–14.6%。
2. 確認 `art-final` 未安裝（hash 不同），並重跑證明它仍會踩 H14（6.3 / 3.2）。
3. 新增 `install-art.ps1`（備份＋`-DryRun`）、`seam-detect.ps1`（接縫偵測，僅診斷用）、
   `detect-head.ps1`（縱帶啟發式，供參考）。
4. 產出 `art-final\compare-installed-vs-artfinal.png`（上＝已安裝、下＝art-final，綠線 13.2%）。
5. 把 H14 的四種失敗做法寫成 4.3 節，並更正 `COLLAB-STATUS.md`。
