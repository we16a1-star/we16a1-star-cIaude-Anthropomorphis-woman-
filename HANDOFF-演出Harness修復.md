# 交接：Galgame 演出 Harness 修復

> 建立時間：2026-11-21
> 交接對象：新視窗（OpenCode / 任何可操作本機的代理）
> 任務性質：**只修驗收工具，不改遊戲原始碼**
> 上一階段：9.7 遮擋清單、9.9 頭部裁切已完成第一輪實作與量測；本階段要把「量測本身」修到可信。

---

## 0. 一句話目標

現有 `artverify` 驗收 harness 量到的數字**不能代表玩家真正看到的畫面**（它把 `story-art.js` 整支移除、直接塞 `src`、沒套色調、也沒算 `object-fit: contain` 的實際繪製區）。先修 harness，再談 9.7／9.9 是否達標。

---

## 1. 鐵則（不要踩）

1. **原始碼唯讀**：只改 `v2.0-modifications` 內同相對路徑；`C:\Users\shiny\OneDrive\桌面\Claude 娘1113\` 底下的原始專案不碰。
2. **harness 檔案在暫存區**：`C:\Users\shiny\AppData\Local\Temp\opencode\artverify\`，改這裡不會污染專案。要長期保留就複製回 `v2.0-modifications\tools\artverify\`。
3. **測試素材不得有個資**，不得出現簡體字；掃描判定＝「Big5 不可編碼且 GB2312 可編碼」。
4. JS 若動到 `app.js` 才需要 esbuild 重建 `www/app.bundle.js`；`story-art.js`、`portrait-anim.js` 是 `type="module"` 直載，**不需要**打包。
5. 角色一律在畫面右側、不靠鏡射；UI 安全區固定；G43 的 D13、提示詞界線、等待畫面日夜、表情四階與 36624、睡前／稀有晚安 CG、相簿素材、AI 網頁可用、AI JSON 穩定、開始畫面單一視窗，全部保留。
6. 專案**不是 git repo**，改動前自己備份（`assets/backup-old/` 已有前例）。

---

## 2. 現有 harness 組成

| 檔案 | 作用 |
| --- | --- |
| `artverify\serve.mjs` | 靜態伺服器（4789）。`/__shot.html` ＝ 讀 `www/index.html`，**用 regex 移除 `story-art.js`**，再把 `shot-inject.html` 注入 `</body>` 前；每次請求重讀注入檔。 |
| `artverify\shot-inject.html` | 注入腳本：強制 `#tab-story` 進入 `g16-x`、指定四場景之一、塞 7 個選項＋自由行動、寫長回覆；`?measure=1` 把量測 JSON 寫進 `document.title`。 |
| `artverify\harness.html` | iframe 外框（目前幾乎沒在用）。 |
| `artverify\measure-art.ps1` | 用 `System.Drawing` 掃像素找頭頂與臉中心（慢、易受壓縮雜點影響）。 |
| `artverify\scan3.ps1` | 簡體／PII 掃描（吃 UTF-8 清單檔）。 |
| `artverify\shots\` | `n2-<scene>-<size>.png` 16 張、`top24-*`、`contact-grid.png`。 |

啟動：

```powershell
& "$env:TEMP\opencode\node.exe" "$env:TEMP\opencode\artverify\serve.mjs" "C:\Users\shiny\OneDrive\桌面\Claude 娘1113\v2.0-modifications\app\www" 4789
```

截圖：

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --hide-scrollbars `
  --force-device-scale-factor=1 --window-size=1264,781 --virtual-time-budget=4000 `
  --user-data-dir="$env:TEMP\opencode\chrome-artverify" `
  --screenshot="$env:TEMP\opencode\artverify\shots\chk-day-1264.png" `
  "http://127.0.0.1:4789/__shot.html?scene=day"
```

量測（title 要用 `--dump-dom` 取，`--screenshot` 拿不到）：

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu `
  --window-size=1264,781 --virtual-time-budget=4000 `
  --user-data-dir="$env:TEMP\opencode\chrome-artverify" --dump-dom `
  "http://127.0.0.1:4789/__shot.html?scene=day&measure=1" | Select-String "<title>"
```

---

## 3. 已確認的 harness 缺陷（依嚴重度）

### H1（P0）驗收頁把 `story-art.js` 整支移除 → 色調與場景切換全部沒測到

`serve.mjs` 第 40 行：

```js
.replace(/<script type="module" src="story-art\.js"><\/script>\s*/, '')
```

後果：

- `setTone()` 不會執行 → `#tab-story` 沒有 `data-art-tone`、`.story-art-grade` 沒有 `data-tone`。
- `style.css:2698–2705` 的夜間／暖色對話框配色與 grade 疊層全部不生效。
- 也就是說：**目前 16 張截圖的夜間、晨光、傍晚，對話框對比與整體明度都不是玩家看到的樣子**。9.7「文字對比」與 9.9「未被暗底壓暗」的驗收結論無效。
- 場景切換（`setStoryArt` 的 opacity 過場、`currentScene`、`mirroredDefaultFiles`）完全沒被覆蓋。

修法：不要刪 `story-art.js`。改成注入腳本「等它載入後呼叫真實入口」；若拿不到 module 內部函式，就模擬真實 DOM 狀態：

```js
tab.dataset.artTone = tone;              // 'none' | 'warm' | 'night'
document.querySelector('.story-art-grade')?.setAttribute('data-tone', tone);
```

並保留 `story-art.js` 在頁面上（它會自己抓 `#storyDefaultArt`，注入腳本要在它之後覆寫，或加 `?scene=` 讓它先跑再校正）。

### H2（P0）`object-fit: contain` 之後，用 `getBoundingClientRect()` 量頭頂是錯的

`art-plan.css` 04:10 已把 `.story-default-art` 改成 `object-fit: contain; object-position: center center`。此時 `<img>` 元素盒仍等於整個舞臺，`getBoundingClientRect()` 回傳的是盒子，不是畫出來的圖。

必須用「自然比例 → 實際繪製矩形」換算：

```js
const b = art.getBoundingClientRect();
const ar = art.naturalWidth / art.naturalHeight;
const paintedW = Math.min(b.width, b.height * ar);
const paintedH = paintedW / ar;
const ox = b.left + (b.width - paintedW) / 2;
const oy = b.top + (b.height - paintedH) / 2;
// 圖內座標 (u,v)（0–1）→ 視窗座標
const px = ox + u * paintedW;
const py = oy + v * paintedH;
```

同時要回報：`paintedW/H`、上下留白 `(b.height - paintedH)/2`、左右留白 `(b.width - paintedW)/2`。
`measure()` 目前只回 `art` 盒子與 `natural`，等於沒有回答「頭頂離畫面頂端幾 px」。

### H3（P0）`measure()` 沒有 null guard，一丟例外就整個 tick 迴圈死掉

`shot-inject.html:73–79` 直接 `ab.getBoundingClientRect()`、`st.getBoundingClientRect()`。只要 DOM 結構一變（例如等待畫面把狀態列藏起來），就會 `TypeError`，而 `apply()` 內的例外會讓第 88 行的 `setTimeout(tick, 250)` 永遠不再排程 → 標題停在舊值，量測看起來「成功」其實是殘留資料。

修法：`measure()` 全程 `try/catch`，每個節點用 `el ? ... : null`，並在輸出加 `errors: [...]`；`tick` 用 `try { apply() } catch (e) { record(e) } finally { ... }`。

### H4（P1）`empty=1` 直接 `return`，跳過 `measure()`

`shot-inject.html:32`。空狀態（無選項）正是 9.7 要驗的「對話框貼底、狀態列在底」情境之一，卻永遠量不到。把 `if (empty) return;` 改成 `if (!empty) { ...塞選項與長文... }`，讓 `measure()` 一律執行。

### H5（P1）注入的選項 markup 與 `app.js` 真實輸出不一樣

真實輸出（`app.js:4653`）：

```html
<button class="choice-btn" data-i="0"><span class="choice-num">1</span><span class="choice-text">…</span></button>
<button class="choice-btn free-choice-toggle" id="freeChoiceToggle">8. 自訂行動／台詞</button>
```

harness 目前第 8 項文字是 `✒ 自由行動（自己輸入）`、第 1–7 項文字是「選項 N：…」。高度與換行行為可能不同，`position:sticky` 的第 8 項高度也不同。**照抄真實 markup 與真實文案長度**（用兩行以上的長句，才壓得出 424 px 上限）。

### H6（P1）只覆蓋「故事進行中＋8 選項」一種狀態

9.7 驗收清單還包含：

- 等待畫面（隱藏對話框與選項、左下獨立暗底字幕）
- toast（左欄 HUD 之下、2.5 秒淡出）
- 選單全螢幕覆蓋（Esc／✕）
- 開始畫面（單一視窗）
- 相簿 3×3 與燈箱（Esc／←／→）
- 自訂立繪相框（透明／非透明兩軌）
- 表情窗四階（36624）

目前一張 `?scene=` 只給一個狀態。建議改成 `?state=story|wait|start|album|menu|custom`，每個 state 一組注入邏輯，量測輸出統一格式。

### H7（P1）量測只寫 `document.title`，且被覆寫 20 次

`--dump-dom` 拿得到，但：

- 20 次 tick 每次覆寫，最後一筆才是最終值；若中途例外就停在舊值（見 H3）。
- 標題長度有上限，欄位一多會被截斷。

改成 `window.__artMeasure = {...}` ＋ `<pre id="__measure">` 兩種都寫，`--dump-dom` 直接抓 `#__measure` 的文字；同時保留 title 給舊腳本。

### H8（P2）像素掃描 `measure-art.ps1` 不該是主要手段

它假設「頭頂＝第一個非背景像素列」，遇到漸層天空、光暈、書架會誤判；壓縮雜點也會讓結果跳動（先前 2／37／9／9 px 的離散值就是徵兆）。修好 H2 後，**以幾何換算為主、像素掃描為輔**（只用在「素材本身是否貼邊」這種無法從 DOM 得知的事）。

### H9（P2）`serve.mjs` 的 regex 太脆

只認 `<script type="module" src="story-art.js"></script>` 這一種寫法。若 `index.html` 之後加 `defer`、換引號、或改路徑，就會靜默失效（不報錯，只是 `story-art.js` 又跑起來）。改成用 `indexOf('story-art.js')` 找整段 `<script …>` 再移除，並在移除失敗時於回應加 HTML 註解 `<!-- harness: story-art.js NOT stripped -->` 方便肉眼確認。

### H10（P2）`serve.mjs` 啟動時讀了一次 `inject` 卻沒用

第 11 行 `const inject = readFileSync(...)` 是死碼（第 37 行又讀一次）。刪掉，避免誤會。

---

## 4. 建議修復順序

1. **H1**：恢復 `story-art.js`，讓色調與真實場景切換回到驗收頁。→ 重拍 4 場景 × 4 尺寸，先看夜間對話框是否變成深底金邊。
2. **H2**：`measure()` 加「繪製矩形」換算，輸出 `painted`、`padTop/padBottom/padLeft/padRight`、`headTopPx`（用圖內 `u,v` 或像素掃描回推）。
3. **H3 + H4 + H7**：例外保護、`empty` 也量、輸出改 `#__measure`。
4. **H5**：選項 markup 對齊 `app.js`。
5. **H6**：加 `?state=` 五種狀態。
6. **H8/H9/H10**：收尾。

每完成一項就跑一次四尺寸（1264×781、1024×768、1920×1080、800×600）× 四場景，把數字貼進 `CHANGES.md`。

---

## 5. 驗收門檻（修好後要能直接回答）

- 1264×781／800×600 各連續三回合（含 AI 長回覆、八選項滿載），**人物臉部全程不被遮住**。
- 四場景在 1264×781、1024×768、1920×1080 下：**頭頂與髮飾完整可見**、**未被 HUD 暗底壓暗**。
- HUD 暗底：左段只蓋 x 0%–46%，右段只在工具列後方 x ≥82%，**x 46%–82% 完全沒有暗底與 HUD 元素**。
- 對話框右緣 ≤ x 46%、高度 ≤ 220 px；選項高度 ≤ 424 px；狀態列貼底；立繪頭頂留白 ≥ 10%。
- 等待畫面：隱藏對話框與選項、字幕在左下獨立暗底。
- 掃描：0 簡體、0 PII。

---

## 6. 目前程式碼狀態（交接時）

| 檔案 | 時間 | 狀態 |
| --- | --- | --- |
| `www\art-plan.css` | 11-21 04:10 | 已改 `.story-default-art { object-fit: contain; object-position: center center }`；`scene-generated-image`／`start-scene-art` 仍滿版。**尚未用新 harness 驗證。** |
| `www\story-art.js` | 11-21 04:11 | 已移除 `applySceneFit()` 與其呼叫（不再標 `data-fit="wide"`、不再給 stage 補底圖）。**舊註解若還提到 `data-fit` 要一併清。** |
| `www\style.css` | 11-21 04:00 | 4 處字級改 `calc(... * var(--story-font-scale,1))`；2 處簡體註解已修。 |
| `www\app.js` / `app.bundle.js` | 11-21 00:34 | 同步，無需重建。 |
| `www\index.html` | 11-20 13:36 | 含 `art-plan.css`、badge、燈箱、`story-art.js`（module）。 |
| `config\art_distribution.json` | 11-21 01:55 | 頭頂留白註記與實測不符，**待重出圖後更新**。 |

四張場景素材（`g43-story-default.jpg`、`g43-story-soft-morning.jpg`、`g43-cg-magic-light.jpg`、`g43-story-reading.jpg`）仍是 01:45 版，頭頂 2–9 px，**未達 ≥70 px**。這是內容問題，不是 harness 問題；harness 修好後會更清楚地暴露它。

---

## 7. 環境備忘

- `node` 不在 PATH：`C:\Users\shiny\AppData\Local\Temp\opencode\node.exe`；npm 不可用。
- Chrome：`C:\Program Files\Google\Chrome\Application\chrome.exe`。
- Git（若需要）：`C:\Users\shiny\AppData\Local\Temp\opencode\MinGit\cmd\git.exe`。
- headless 的 `innerWidth/innerHeight` 比 `--window-size` 小（1264×781 → 1248×686）；**百分比一律以 JS 的 `innerWidth/innerHeight` 為準**。
- `getComputedStyle(el,'::before').width` 回傳未縮放版面 px；`getBoundingClientRect()` 是縮放後視覺 px，換算要乘 `body` zoom（1264×781 時 0.85）。
- 含中文路徑的 `.ps1` 會被當 ANSI 讀取：檔案清單改用 UTF-8 清單檔傳入。
- `System.Drawing` 建 Bitmap 要用 `New-Object ... -ArgumentList`。
- 專案資料夾與上層都沒有 `.git`。
- 遊戲本體 electron「Claude娘的圖書館」可能正在執行，改檔前先確認沒有寫入衝突。

---

## 8. 接手進度（2026-11-21 下午）

### 已完成
- **H1 已修**：`serve.mjs` 不再移除 `story-art.js`；四場景改用真實輸入驅動（對話時間關鍵字＋`stage.dataset.storyEmotion`），`setTone()` 正常執行。
  - 實測：`default/warm`、`soft-morning/warm`、`night/night`、`evening-reading/warm`，`#storyArtGrade` 同步。
- **H2 已修**：`measure()` 新增 `painted`（實際繪製矩形、四邊留白）與 `head`（頭頂 px、圖內 clearance）。
- **H3／H4／H7 已修**：`try/catch`、`empty=1` 也量、同時輸出 `window.__artMeasure`／`#__measure`／`title`。
- **H5 已修**：選項 markup 照抄 `app.js` 真實輸出。
- **H6 部分完成**：新增 `?state=story|empty|start|album|menu|custom|wait`（新分頁版本已含）。
- **傍晚場景保留**：`story-art.js` 的 `applyEmotionArt()` 新增 `evening-reading` 分支，class 變動不再把傍晚圖換回日間。

### 4 場景 × 4 尺寸實測（16/16 成功）
| 尺寸 | 繪製區 | 上下留白 | 左右留白 |
|---|---|---|---|
| 1264×781 | 1220×686 | 0 / 0 | 14.2 / 14.2 |
| 1024×768 | 1008×567 | 53 / 53 | 0 / 0 |
| 1920×1080 | 1751×985 | 0 / 0 | 76.4 / 76.4 |
| 800×600 | 784×441 | 32 / 32 | 0 / 0 |

HUD 暗底 46.0%、對話框右緣 39.0–42.1%、選項右緣 36.8–39.9%、狀態列 ~98.5%，四尺寸一致。

### 仍待處理（交新分頁）
1. **頭頂留白 0 px**：`head.clearancePxInImage = 0`，四張素材髮頂貼齊原圖上緣；9.9 的 ≥12% 未達成。只能重出素材。`head.confidence` 僅 5.2，建議每張人工看一次 top crop。
2. **1920×1080 左右 76.4 px 底色帶**：舞臺比 16:9 寬。建議：
   ```css
   @media (min-aspect-ratio: 16/9) {
     #app #tab-story .story-default-art {
       object-fit: cover !important;
       object-position: center top !important;
     }
   }
   ```
   只裁兩側、不裁頭；4:3／5:4 仍維持 `contain`。
3. **第 8 項 sticky 覆蓋下方選項**：800×600 實測第 4–5 項部分被蓋。新分頁的量測目前沒有 `choicesSticky` 欄位；建議加 `scrollHeight`／`clientHeight`／`covered` 三項，再決定改 `position: static` 或容器加 `padding-bottom`。
4. `config/art_distribution.json` 頭頂註記仍寫「留白充足」，與實測不符，重出後更新。
5. `story-art.js` 若再改，記得同步 `CHANGES.md` 雜湊（目前 17,970 bytes／`D29C17D5…B594`）。

### 檔案狀態
- `app\www\story-art.js`：17,970 bytes（含傍晚保留與 `applySceneFit` 移除）。
- `app\www\art-plan.css`：27,767 bytes（`contain` 版本）。
- `CHANGES.md`：已補本輪條目（含四尺寸表、未達標、雜湊）。
- 驗收工具在 `%TEMP%\opencode\artverify\`；新分頁的 `shot-inject.html` 已擴充到 459 行並接管 `?state=`。

