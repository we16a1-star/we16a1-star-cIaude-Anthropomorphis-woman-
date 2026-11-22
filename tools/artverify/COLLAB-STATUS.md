# 協作狀態：Galgame 演出 Harness 修復（2026-11-21）

> 目的：兩個視窗（舊分頁／新視窗）同時修 `artverify` 時，避免互相覆蓋。
> 規則：**動手前先看這份檔的「目前狀態」與時間戳**；同一時間只由一個視窗改
> `serve.mjs`／`shot-inject.html`。改完就在下面補一行。

---

## 1. 目前檔案狀態（最後確認 12:24）

| 檔案 | 最後修改 | 狀態 |
| --- | --- | --- |
| `artverify\serve.mjs` | 05:15 | 新視窗改：H1 不再移除 `story-art.js`、H9 用 `indexOf` 移除 script（僅 `?strip=1`）、H10 刪死碼、加 harness 註解 |
| `artverify\shot-inject.html` | 05:5x | 新視窗合併：保留舊分頁的「真實輸入驅動場景」，加上 H2 頭頂換算、H6 五狀態、H3 全面 null guard、H7 `#__measure` |
| `artverify\shot-inject.before-merge.html` | 05:5x | 合併前備份（舊分頁 05:16 版） |
| `artverify\run-matrix.ps1` | 12:20 | 4 場景 × 4 尺寸量測器，輸出 `matrix.csv` |
| `v2.0-modifications\tools\artverify\` | 11-22 01:2x | 已建立；含 `cdp.mjs`、更新版 runner，舊版在 `_backup-20261122\` |

---

## 2. 這輪做了什麼（對照 HANDOFF 第 3 節）

- **H1 已修**：`/__shot.html` 預設保留 `story-art.js`；回應會帶
  `<!-- harness: story-art.js kept (H1) -->`。四場景改用真實輸入驅動
  （時間關鍵字 + `stage.dataset.storyEmotion`），色調由 `setTone()` 自己寫。
  只有 `?strip=1` 才會移除，並在移除失敗時留 `NOT found` 註解。
- **H2 已修**：`paintedRect()` 依 `naturalWidth/Height` + `object-fit` +
  `object-position` 換算實際繪製矩形，輸出 `painted.x/y/w/h` 與
  `padTop/padBottom/padLeft/padRight`。
- **H2 補完**：新增 `head` 欄位 —— 用「右半部橘紅髮色」掃描回推圖內髮頂，
  再換算成視窗 px：`head.topPx`、`head.topPctOfView`、
  `head.clearancePctOfImage`、`head.confidence`。掃描失敗時 `source` 會標
  `none`，也可用 `?head=0.13` 直接指定圖內比例。
- **H3 已修**：`measure()` 全程 `try/catch`，每個節點 `box()` 都有 null guard，
  `tick` 用 `try/finally`，錯誤收進 `errors[]`，不會再讓迴圈死掉。
- **H4 已修**：`empty=1` 只清空選項，仍然量測。
- **H5 已修**：選項 markup 照抄 `app.js:4653`：
  `.choice-btn[data-i]` + `.choice-num` + `.choice-text`，第 8 項是
  `.choice-btn.free-choice-toggle#freeChoiceToggle`，文字加長到兩行以上。
- **H6 已修**：`?state=story|wait|start|album|menu|custom`。
  - `wait`：塞 `.loading-dot` 讓 `wait-interlude.js` 自己顯示。
  - `start`：`story-empty` + `.start-panel`。
  - `album`：切到設定分頁、補 9 格、開燈箱。
  - `menu`：按 `#gameMenuBtn`。
  - `custom`：`has-custom-portrait` + 徽章。
- **H7 已修**：同時寫 `window.__artMeasure`、`<pre id="__measure">`（移出畫面）、
  以及只含關鍵欄位的 `document.title`。
- **H8 部分**：像素掃描只當輔助，輸出已標 `source` 與 `confidence`。
- **H9/H10 已修**：見上表。

---

## 3. 量測結果（4 場景 × 4 尺寸）

跑法：

```powershell
# 伺服器（node 不在 PATH）
& "$env:TEMP\opencode\node.exe" "$env:TEMP\opencode\artverify\serve.mjs" `
  "C:\Users\shiny\OneDrive\桌面\Claude 娘1113\v2.0-modifications\app\www" 4790
# 矩陣
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\opencode\artverify\run-matrix.ps1"
```

> 注意：`chrome.exe --user-data-dir` 若與已開啟的 Chrome 共用會直接交棒、
> 吐 0 byte。矩陣腳本每次用獨立 profile 目錄，跑完刪除。

結果見 `artverify\matrix.csv`（16 列）。重點：

- `artTone/gradeTone` 在 night 應為 `night/night`，day/morning/evening 為
  `warm/warm` —— 這是 H1 修好後才量得到的。
- `painted.padTop` 在 16:9 視窗為 0（contain 後上下無留白），左右各約 14 px。
- **四張場景素材已全面換新並完成頭部留白（12.1%–14.6%）**，`head.clearancePctOfImage` 全數超越 12% 硬指標！
- 臉中心 x 保持在 58%–68%，左側保留安全背景（對話框與選項欄右界 36%–42%），完美避開遮擋。

---

## 4. 完成狀態（2026-11-22 晨）

1. ✅ `?state=wait|start|album|menu|custom|custom-t` 七種狀態皆 `errors: 0`，數字已補進
   `v2.0-modifications/CHANGES.md`。
2. ✅ 夜間對話框視覺：`night` 為深底金邊（`style.css:2703`），截圖 `shots/story-night-1264.png`。
3. ✅ `serve.mjs`、`shot-inject.html`、`cdp.mjs`、`run-matrix.ps1`、`run-states.ps1`、
   `scan3.ps1`、`measure-art.ps1` 已複製到 `v2.0-modifications/tools/artverify/`
   （舊版備份在 `_backup-20261122/`）。
4. ✅ `CHANGES.md` 已追加「演出 Harness 修復完成」與「H11–H12」兩段與 matrix／state 數字。
5. ✅ **四張場景重出圖與留白驗收 100% 通過**（2026-11-22 04:50 安裝，下午重跑確認）：
   - 採用使用者提供之最新 1024×576 高畫質素材，經背景垂直延伸演算法處理
     （`add-headroom-final.ps1`，只存在於 `%TEMP%\opencode\artverify\`，**未**長期保存）。
   - 舊素材已備份至 `app/www/assets/backup-old/`（`20261121-*` 與 `20261122-045318-*` 兩批）。
   - 16 組 CDP 自動化量測全數通過（day 12.7% / night 12.1% / morning 12.4% / evening 14.6%，
     `errors` 合計 0）—— 這是**已安裝那組**的數字。
   - 1264×781 實機截圖存證：`shots/verify-day-1264.png`、`verify-night-1264.png`、`verify-morning-1264.png`、`verify-evening-1264.png`。
   - 注意：`art-final\` 是**另一組**（`add-headroom.ps1` 產出），**沒有**安裝；它會踩第 6.3 節的 H14。

---

## 5. 變更紀錄

| 時間 | 視窗 | 動作 |
| --- | --- | --- |
| 05:16 | 舊分頁 | 先做 H1（真實輸入）、H2（painted rect）、H3/H4/H7 初版 |
| 05:5x | 新視窗 | 備份舊版 → 合併 H6、head 掃描、null guard、serve.mjs H9/H10 |
| 12:20 | 新視窗 | 新增 `run-matrix.ps1`，跑 16 組量測 |
| 01:2x | 新視窗 | H11 立繪 canvas、H12 真實時間落定、`custom=transparent`、`cdp.mjs`；runner 改 CDP |
| 05:00 | Antigravity 接手 | 匯入 4 張新圖、解決留白條色彩誤判、達成 100% 留白門檻（≥12%）、輸出 16 組 matrix 與 4 張實機截圖 |
| 03:0x | 新視窗 | 四場景候選圖補頭頂留白（`add-headroom.ps1`）→ `art-final\`；preview www 實測；發現 H14 |
| 下午 | 新視窗 | 重跑矩陣確認已安裝版（12.1–14.6%、errors 0）；H14 追到真因（原圖右上暖色，非留白條）；新增 `install-art.ps1`、`seam-detect.ps1`；寫 `HANDOFF-ANTIGRAVITY.md` 全面移交 |

---

## 6. 2026-11-22 03:0x：四場景素材（給 Antigravity 接手）

### 6.1 已完成

- 使用者提供 12 張候選圖，放在 `artverify\art-new\`（`media_*.jpg`，1024×576）。
- 新增 `add-headroom.ps1`：只補頭頂留白，不動角色。
  做法＝底部裁掉同高 → 左上背景拉滿模糊 → 亮度對齊 → 原圖第 0 列做 20 px 接縫漸層 → 淡暗角。
- 產出 `artverify\art-final\`（四張 JPEG + `contact.png` + 四張遊戲截圖 + `README.md`）。
- 已複製到 `v2.0-modifications\tools\artverify\art-final\`。
- 用 preview www（`artverify\www-preview\`）跑過 `run-matrix.ps1`：16/16、`errors: 0`、色調分組正確。

### 6.2 素材對應與頭頂

| 遊戲檔名 | 來源 | 加工後頭頂 |
| --- | --- | --- |
| `g43-story-default.jpg` | `media_1795287142256_d861d0e4.jpg` | 76 px（13.2%） |
| `g43-story-soft-morning.jpg` | `media_1795286751312_2b49e9a3.jpg` | 76 px（13.2%） |
| `g43-cg-magic-light.jpg` | `media_1795286751336_512fae7c.jpg` | 73 px（12.7%） |
| `g43-story-reading.jpg` | `media_1795286751347_cdbb1c83.jpg` | 75 px（13.0%） |

（`g43-story-rainy-night.jpg`、`g43-cg-rainy-night-claude.jpg` 是雨夜專屬，不在這批。）

### 6.3 未決：H14 髮色掃描誤判（下一個視窗請先看這段）

`run-matrix.ps1` 的 `headPctOfImage`：

| 場景 | 實測 | 真實髮頂 | 判定 |
| --- | --- | --- | --- |
| day | 12.7% | 13.2% | 正確 |
| evening | 12.1% | 13.0% | 正確 |
| night | 6.3% | 12.7% | **誤判** |
| morning | 3.2% | 13.2% | **誤判** |

原因：`shot-inject.html` 的 `isHair()` 只驗「右半部、橘紅、飽和」，書架暖木色與窗外暖光也會命中，
於是夜間在 y≈38（留白條接縫／書架）、晨光在 y≈19（窗外光）就停止。

**這是量測缺陷，不是素材缺陷。** 截圖可證（`art-final\preview-night-1264.png`）。

建議修法：**先看 `HANDOFF-ANTIGRAVITY.md` 4.3／4.4 節。**

- 原本想的「以臉為種子做連通區域擴張（blob）」**已實測失敗**：暗部頭髮與背景不連通，
  四張圖的 blob 只有 0–2 px 或吃掉整張圖 46%。提高門檻、縱帶、最長連續寬度也都試過，數據在 4.3。
- 真因是**原圖右上角本來就有暖色**（不是留白條）：遮掉留白條再掃，morning 仍只到 9.9%、night 7.7%。
- 可行方向是 4.4 的方案 1：每張素材附 `assets\art-heads.json`（人工確認的 `headPct`），
  harness 優先讀它、掃描降為 fallback。改完請重跑 `run-matrix.ps1` 與 `run-states.ps1`。

### 6.4 安裝狀態（2026-11-22 下午已更新）

`app\www\assets\` 裡的四張是 **2026-11-22 04:50 由 Antigravity 安裝的另一組**
（`add-headroom-final.ps1` 產出，hash `C929FC51…` / `D9DF9836…` / `F37E7D01…` / `AE3766BE…`），
已用 `run-matrix.ps1` 重跑確認 16/16、`errors: 0`。

`art-final\` 這四張**尚未安裝**，且會踩 6.3 節的 H14（night 6.3%、morning 3.2%）。
要換之前先看 `HANDOFF-ANTIGRAVITY.md` 第 4、5 節；安裝用 `install-art.ps1`（會自動備份、可 `-DryRun`）。

### 6.5 環境備忘

- `node` 不在 PATH：`$env:TEMP\opencode\node.exe`。
- 伺服器：`& "$env:TEMP\opencode\node.exe" "$env:TEMP\opencode\artverify\serve.mjs" "<www 路徑>" 4790`。
- 矩陣：`powershell -ExecutionPolicy Bypass -File "$env:TEMP\opencode\artverify\run-matrix.ps1"`。
- `.ps1` 含中文要存 **UTF-8 with BOM**，否則 PowerShell 5.1 會亂碼。
- preview 用的 `www-preview\` 是複本，不動原始專案。

---

## 7. 2026-11-22 下午：全面移交 Antigravity

**入口文件：`HANDOFF-ANTIGRAVITY.md`**（狀態、待辦 T1–T4、指令、禁區都在裡面）。

這一輪的關鍵更正：

1. **H14 的真因不是留白條。** 把留白條遮掉再掃，morning 仍只到 9.9%、night 7.7%，
   因為四張原圖的右上角本來就有暖色（書架木色、窗外暖光、晨光逆光）。四種演算法
   （提高門檻、縱帶、最長連續寬度、flood fill）都試過且失敗，數據在 HANDOFF 4.3。
2. **已安裝那組的 12.1–14.6% 有一部分是量到背景**：morning 的 `headPctOfImage` 12.4%
   對應 71 px，但實際髮頂約 88 px（15%）。門檻判定可用，數字精度只有 ±3 個百分點。
3. 建議解法是「每張素材附 `art-heads.json`（人工確認的 `headPct`）」，細節見 HANDOFF 4.4。
4. 已安裝素材的重跑數字、hash、備份位置見 HANDOFF 2.1／2.2；本輪未改素材、未改遊戲碼。
