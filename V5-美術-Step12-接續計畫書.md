# v5 美術 Step 1＋Step 2 接續計畫書

> 由接續 AI 執行。執行前請先完整閱讀本文件，並與用戶確認後再動手。  
> 繁體中文回報；每任務先計畫（檔案／做法／風險／測試）→用戶同意→動手→測試→§5 回報；一次一任務。

---

## 一、任務概述

依 `立繪畫面用途規劃_v5.xlsx`（來源：桌面 / `[使用者家目錄]\OneDrive\文件\預設專案\桌面\立繪畫面用途規劃_v5.xlsx`；dump 在 `%TEMP%\opencode\xlsx-v5-dump.txt`），完成 v5 美術：

- **Step 1（資產入庫＋config）**：將來源圖片複製進 `app/www/assets/`，補 `art_distribution.json` 10 筆 entries，補 `config-loader.js` schema 與測試，重建 `app.bundle.js`。
- **Step 2（畫面接線＋呈現）**：將 v5 圖片接入故事流程（art_distribution、actions、story-engine、晚安／待機／CG 觸發），套用直式圖版型（前景完整＋背景模糊填滿），補測試與驗收。

本步**只動 `v2.0-modifications\` 內檔案**，不手改 `app.bundle.js`（一律 esbuild 重建），原始碼唯讀。

---

## 二、現狀與基準（M0 已通過，等待圖統一已完成）

### 2.1 已完成（不可重做）
- P0 全部＋M0 通過（2026-11-08）。
- P1-01～P1-05 完成（含提示詞界線 `CHARACTER_BOUNDARY_SECTION`、`withCharacterBoundary()`、危機本機攔截、安全段）。
- 等待圖統一：日夜皆用 `g43-wait-writing.jpg`（附件圖，SHA `C787A498B189922B…0357D`）；`g43-wait-night.jpg`（36455_1）已移除並備份；`CHANGES.md` 已註記「36455 本體不是廢案，是 P2-11 夜間事件 CG」。

### 2.2 `art_distribution.json` 現狀（app/www/config/art_distribution.json）
- 現有 13 筆 entries：36331,36369,36370,36371,36372,36373,36374,36375,36376,36377,36378,36379,36455
- `defaultDayArt=36378`、`defaultNightArt=36376`、`openingArt=36377`
- **36455 entry 已存在**（視為劇情CG：晚安／睡前，timeGroup=night），但 assets 內**缺檔** `g43-cg-bed-goodnight.jpg`（來源 `36455.jpg` 189,076 bytes，SHA `F7C4B853…D5806`）。
- config-loader schema 僅檢查 entries.36377 / .36378 / .36376 存在。

### 2.3 資產夾現狀（app/www/assets/）
現有 jpg：g43-cg-letter, magic-light, magic-touch, moon-bird, outing-memory, vow, start-opening, story-default, story-reading, story-soft-morning, wait-writing；以及 g44-writing（與 wait-writing 同檔）。**無 366xx 系列，無 `g43-cg-bed-goodnight.jpg`。**

### 2.4 來源圖片（全部在 `[使用者家目錄]\OneDrive\文件\`）

| 序號 | 來源檔名 | 目標檔名 | SHA256 | 大小 | 尺寸 | 狀態 |
|---|---|---|---|---|---|---|
| 1 | `36455.jpg` | `g43-cg-bed-goodnight.jpg` | `F7C4B8534E3F19369B80C4325A8B3B308554B80949693A9F321E90BBB79D5806` | 189,076 | 1672×941 | **入庫（補 36455 缺檔）** |
| 2 | `36621_0.jpg` | `g43-cg-rose.jpg` | `0C35456D06C08EBCA3C75D2B09B39C283D4384766B49A1547D2C40353B5CBCBE` | 252,849 | 1086×1448 | 入庫，黑底需去背，**標記不可用** |
| 3 | `36622_0.jpg` | `g43-cg-lakeside.jpg` | `00DED999083BD7BF0AACFDA15A8DCECD1BB27C61DECC4B77025D34557DE6B8C8` | 349,727 | 941×1672 | 入庫，直式，待前景完整＋背景模糊 |
| 4 | `36623_0.jpg` | —（不入庫） | `5D015314BAC26A3FA8937C80864658C8B05C6FC0966D7D075013B4AF1AAF378A` | 240,266 | 1086×1448 | **不使用**（簡體字＋對話框＋水印） |
| 5 | `36624_0.jpg` | —（不入庫） | `89113552541F8B4C5D41A84781CCEA598E03627AFFB8551C0CE73F1C0FB38655` | 243,287 | 1086×1448 | **不使用**（簡體字＋對話框） |
| 6 | `36625_0.jpg` | —（不入庫） | `610BEAF7F931EF4735472485598C9496003B4176D1F33348A2B8EE11C846ACB0` | 227,948 | 1088×1445 | **不使用**（對話框） |
| 7 | `36626_0.jpg` | `g43-extra-casual.jpg` | `63C6FCDF36ECBB108CFCEACC775DEB7B50EA320BEDDE2F4F886396F6D1C93FAA` | 136,749 | 940×1672 | 入庫，特典，不進主線 |
| 8 | `36627_0.jpg` | `g43-cg-cheek-pinch.jpg` | `A63463DED4307DEDB9E91FB31FFB5FD64D5FB6A26F08834AD0E0E0B637F4E290` | 224,115 | 941×1672 | 入庫，觸碰反應（捏臉） |
| 9 | `36628_0.jpg` | `g43-cg-goodnight-reading.jpg` | `556D39F515AC377D4A39AB654646506360071A74BF5A780B32D72D7F1882B75B` | 167,836 | 1024×1536 | 入庫，晚安 CG 候選，與 36455 擇一 |
| 10 | `36629_0.jpg` | `g43-cg-goodnight-nightgown.jpg` | `F36D54DB73D417A9DDD47F1EC15DC97893511ABA42EA41F34FFA588CD59DFBE0` | 192,251 | 1024×1536 | 入庫，**預設不用** |
| 11 | `36632.jpg` | `g43-cg-ending-halo.jpg` | `DE3AC059C8D92EEBD9DB96F9991C7140A9D56AB6793FE550751681DCCDEF7769` | 206,882 | 1199×1312 | 入庫，終章／結局 CG 候選 |
| 12 | `36552.jpg` | — | `E33EC5DF9B0558FB009B93AB4986D480075F027AB2E1990A854060948F64CBBB` | 281,392 | — | 舊等待圖，不使用 |
| 13 | `36552-1.jpg` | — | `51BCA541C8A83F5C1074D6C12437197EC96032046D95F9FCD37023693710AC8F` | 281,424 | — | 舊等待圖變體，不使用 |

> Step 1 實際入庫 8 張：36455（補缺檔）、36621、36622、36626、36627、36628、36629、36632。  
> 36623–36625 不複製進 assets，只在 entries 記 `file:null` 與「不使用」。

---

## 三、Step 1：資產入庫＋config（可立即執行）

### 3.1 檔案動作清單

| # | 檔案 | 動作 | 內容／備註 |
|---|---|---|---|
| S1-1 | `app/www/assets/g43-cg-bed-goodnight.jpg` | 新增 | 複製 `36455.jpg`；SHA 必須等於 `F7C4B853…D5806` |
| S1-2 | `app/www/assets/g43-cg-rose.jpg` | 新增 | 複製 `36621_0.jpg`；entries 註記「黑底需去背，不可自動使用」 |
| S1-3 | `app/www/assets/g43-cg-lakeside.jpg` | 新增 | 複製 `36622_0.jpg`；entries 註記「直式，需前景完整＋背景模糊版型」 |
| S1-4 | `app/www/assets/g43-extra-casual.jpg` | 新增 | 複製 `36626_0.jpg`；entries 註記「特典，不進主線」 |
| S1-5 | `app/www/assets/g43-cg-cheek-pinch.jpg` | 新增 | 複製 `36627_0.jpg`；entries 註記「觸碰反應（捏臉）」 |
| S1-6 | `app/www/assets/g43-cg-goodnight-reading.jpg` | 新增 | 複製 `36628_0.jpg`；entries 註記「晚安 CG 候選，與 36455 擇一」 |
| S1-7 | `app/www/assets/g43-cg-goodnight-nightgown.jpg` | 新增 | 複製 `36629_0.jpg`；entries 註記「預設不用」 |
| S1-8 | `app/www/assets/g43-cg-ending-halo.jpg` | 新增 | 複製 `36632.jpg`；entries 註記「終章／結局 CG 候選」 |
| S1-9 | `app/www/config/art_distribution.json` | 修改 | 補 10 筆 entries（含 36455 已有 entry 確認欄位完整）；36623–36625 記 `file:null`、`usable:false` |
| S1-10 | `app/www/config-loader.js` | 修改 | schema 增加 10 筆存在檢查、36455 檔案存在、`file:null` 合法、level／timeGroup 值域、36621／36629 不可自動使用 |
| S1-11 | `app/tests/story/v5-art-step1.test.js` | 新增 | entries 數量＝23、欄位齊全、入庫資產存在＋SHA 相符、36623–25 不得入 assets、36455 尺寸 1672×941、schema 負向測試 |
| S1-12 | `app.bundle.js` | 重建 | esbuild 重建（config JSON 有進 bundle），勿手改 |
| S1-13 | `CHANGES.md` | 修改 | 新增 v5 美術 Step 1 區段 |
| S1-14 | `SHA256-V5-ART-STEP1-20261109.txt` | 新增 | Step 1 修改面 SHA manifest |
| S1-15 | `tests/v5-art-步驟1測試紀錄-20261109.txt` | 新增 | 測試輸出證據 |

### 3.2 `art_distribution.json` 新增 entries 樣板（10 筆）

欄位：`id, file, origFile, width, height, visual, role, level, timeGroup, trigger, autoSwitch, textBoxPos, textMaxHeight, tone, notes, usable`

建議內容（依 xlsx sheet3）：

- **36455**（已有 entry，確認補齊）：`file:"g43-cg-bed-goodnight.jpg"`、`origFile:"36455.jpg"`、`width:1672`、`height:941`、`visual:"夜晚臥室、趴在床上、羽毛筆指向畫面"`、`role:"劇情 CG：晚安／睡前"`、`level:"劇情CG"`、`timeGroup:"night"`、`trigger:"C 階段、好感帶甜或平穩、晚安事件；每 7 夜最多一次（建議）"`、`autoSwitch:false`、`textBoxPos:"bottom-short"`、`textMaxHeight:0.22`、`tone:"none"`、`notes:"底部矮橫條，深棕 85–90%（底部是白色寢具）；不給 B 階段；不演出更衣等私密情境"`、`usable:true`
- **36621**：`file:"g43-cg-rose.jpg"`、`role:"告白或送花事件的立繪（候選）"`、`level:"劇情CG"`、`timeGroup:null`、`trigger:"告白事件候選；是否採用待決"`、`autoSwitch:false`、`usable:false`、`notes:"黑底需先去背；與現有 36375 告白 CG 二選一或並用"`
- **36622**：`file:"g43-cg-lakeside.jpg"`、`role:"外出回憶或夏季事件 CG（候選）"`、`level:"劇情CG"`、`timeGroup:"evening"`、`trigger:"旗標；一次性（候選）"`、`autoSwitch:false`、`usable:true`、`notes:"直式 9:16，需用前景完整、背景模糊的版型"`
- **36623**：`file:null`、`usable:false`、`notes:"不使用：圖上有好感度標籤框與對話泡泡（簡體字）與水印；台詞為占有式，與規則衝突"`
- **36624**：`file:null`、`usable:false`、`notes:"不使用：圖上有好感度標籤框與對話泡泡（簡體字）"`
- **36625**：`file:null`、`usable:false`、`notes:"不使用：圖上有好感度標籤框與對話泡泡"`
- **36626**：`file:"g43-extra-casual.jpg"`、`role:"相簿或特典，不進主線"`、`level:"其他"`、`timeGroup:null`、`trigger:"不進主線"`、`autoSwitch:false`、`usable:true`、`notes:"現代服飾與奇幻世界觀不同；耳機盒是現代物品"`
- **36627**：`file:"g43-cg-cheek-pinch.jpg"`、`role:"觸碰反應（捏臉）CG（候選）"`、`level:"觸碰反應"`、`timeGroup:"day"`、`trigger:"觸碰事件；嘴硬期較合適"`、`autoSwitch:false`、`usable:true`、`notes:"接觸碰動畫系統（portrait-anim）"`
- **36628**：`file:"g43-cg-goodnight-reading.jpg"`、`role:"晚安 CG（候選，較含蓄）"`、`level:"劇情CG"`、`timeGroup:"night"`、`trigger:"C 階段晚安事件候選；與 36455 擇一"`、`autoSwitch:false`、`usable:true`、`notes:"蓋著被子；仍屬寢具場景，建議限成年玩家"`
- **36629**：`file:"g43-cg-goodnight-nightgown.jpg"`、`role:"晚安 CG（候選，尺度較高）"`、`level:"劇情CG"`、`timeGroup:"night"`、`trigger:"預設不用；由用戶決定"`、`autoSwitch:false`、`usable:false`、`notes:"露肩與大腿，較接近「不演出私密情境」的界線；建議不放主線"`
- **36632**：`file:"g43-cg-ending-halo.jpg"`、`role:"終章或結局 CG（候選）"`、`level:"劇情CG"`、`timeGroup:null`、`trigger:"ending 事件候選"`、`autoSwitch:false`、`usable:true`、`notes:"接 App 的 ending 與 endingText 流程"`

### 3.3 測試與驗收標準（Step 1）
- 新測 `v5-art-step1.test.js` 全數 PASS
- 完整 15 檔 config／故事回歸 PASS（與 P1-04 界線測試同步，確認 `promptTweaks` 未關閉）
- Electron 煙測 ok:true
- PII 掃描 0、簡體字掃描 0（連同 CHANGES.md、測試紀錄）
- assets 內**不得**出現 `36623_0.jpg`、`36624_0.jpg`、`36625_0.jpg`、`36552.jpg`、`36552-1.jpg`
- `g43-cg-bed-goodnight.jpg` SHA ＝ `F7C4B853…D5806`

---

## 四、Step 2：畫面接線＋呈現（接續 Step 1，需另徵用戶同意細節）

> 下方為預先規畫，供接續 AI 與用戶對齊後再執行。執行 Step 2 前，請先與用戶確認「直式圖是否進主線／晚安 CG 用 36455 還是 36628」。

### 4.1 接線清單（預計）

| # | 檔案 | 動作 |
|---|---|---|
| S2-1 | `app/www/story-engine.js` | 晚安事件 `goodnight_moment` 使用 art `36455`（或 36628），確認 `art:'36455'` 已在 `poke_quill`／goodnight 事件 |
| S2-2 | `app/www/actions.json` | `poke_quill` art 指向 `36455`；新增 `36627`（捏臉）／`36622`（湖畔）等觸碰／事件 art |
| S2-3 | `app/www/wait-interlude.js` / css | 維持等待圖統一；不將 36455 當等待圖 |
| S2-4 | `app/www/config/art_distribution.json` | 直式圖（36621、36622、36626、36627、36628、36629、36632）加 `ratio:"portrait"` 與 `blurBg:true` 標記 |
| S2-5 | 畫面呈現（UI/CSS） | 直式圖在 16:9 視窗採「前景完整＋背景模糊填滿」版型；頭部不做獨立動畫；臉部安全橢圓 |
| S2-6 | 測試 | 新增 v5-art-step2.test.js；完整回歸；Electron 煙測；PII／簡體 0 |

### 4.2 版型規則（xlsx sheet3 備註＋sheet4 轉場節奏）
- 16:9 視窗 cover 裁切；直式圖前景完整顯示、背景模糊填滿。
- 轉場：先淡出再淡入，不做交叉溶解（避免雙人）；CG 最短停留 5 秒；緩推中心對準手／信／光點，不對臉。
- 文字框：36455 用底部矮橫條 `textBoxPos:"bottom-short"`、`textMaxHeight:0.22`；夜間深棕 85–90%。

---

## 五、編碼與執行規則（務必遵守）

1. **語言**：繁體中文回報；程式註解與測試紀錄用繁體中文。
2. **原始碼唯讀**：只寫 `v2.0-modifications\` 同相對路徑＋`CHANGES.md`；不手改 `app.bundle.js`，一律 esbuild 重建。
3. **Node 路徑**：呼叫 PATH 前置 `%TEMP%\opencode\node\node-v22.14.0-win-x64`；`NODE_PATH='%TEMP%\opencode\node_modules'`；中文／JSON 用 Node 或 edit/write；避免 inline `node -e`，改用 `.cjs`。
4. **測試**：只可用完整版、不得有個資；測試／截圖／日誌／報告不得留帳號名稱、信箱。
5. **PII／簡體**：每次變更後執行 PII 掃描（email、使用者家目錄路徑、`apiToken`、`sk-`…）與簡體字掃描，必須為 0。
6. **D13 硬性規則**：禁貶低／羞辱／冷暴力（含冷落）；占有／排他／愧疚全可；危機放下傲嬌、AI 誠實、不代寫玩家言行。
7. **提示詞「界線」**：＝人設中的【界線｜優先於人設】；須強制附加，`promptTweaks` 不可關閉。
8. **M0 凍結**：config 15 檔＋schema＋測試為基準，D 值變更走「config＋schema＋測試」三件套。

---

## 六、風險與注意

- 直式圖若直接上線會被 16:9 cover 裁切 → Step 1 只入庫，Step 2 再套版型。
- 36621 黑底若誤用會露黑邊 → entries 標記 `usable:false`，Step 1 不自動使用。
- 36623–25 含簡體字／水印 → 不複製進 assets；entries 記 `file:null`。
- 36455 與 36455_1 混淆 → 36455 本體是夜間事件 CG，36455_1 是已移除的等待圖變體，不得混用。
- `app.bundle.js` 重建後 SHA 會變，需同步更新 manifest 與 CHANGES.md。
- Electron 煙測結果 URL 含本機暫時 API token，勿複製進專案。

---

## 七、交付物清單（Step 1 完成時）

1. `app/www/assets/g43-cg-bed-goodnight.jpg`（SHA `F7C4B853…D5806`）
2. `app/www/assets/g43-cg-rose.jpg`、`g43-cg-lakeside.jpg`、`g43-extra-casual.jpg`、`g43-cg-cheek-pinch.jpg`、`g43-cg-goodnight-reading.jpg`、`g43-cg-goodnight-nightgown.jpg`、`g43-cg-ending-halo.jpg`
3. `app/www/config/art_distribution.json`（23 筆 entries）
4. `app/www/config-loader.js`（schema 補 10 筆）
5. `app/tests/story/v5-art-step1.test.js`
6. `app.bundle.js`（重建後新 SHA）
7. `CHANGES.md`（新增 v5 美術 Step 1 區段）
8. `SHA256-V5-ART-STEP1-20261109.txt`
9. `tests/v5-art-步驟1測試紀錄-20261109.txt`

> Step 2 交付物待用戶確認接線細節後補充。

---

**接續 AI 執行順序建議**：先執行 S1-1～S1-8（複製圖片＋算 SHA 核對）→ S1-9（art_distribution）→ S1-10（config-loader schema）→ S1-11（新測試）→ 執行測試與 PII/簡體掃描 → S1-12 重建 bundle → S1-13～S1-15 文件與 manifest → 向用戶 §5 回報，並取得 Step 2 同意後再接續。

---

## 八、Step 2 執行結果（2026-11-09 完成）

Step 2 的 app 實際接線已完成：

- `app/www/story-events.js`：新增 `goodnight`、`night_chat_reading`、`cheek_pinch`、`lakeside_sunset`；`goodnight` 夜間／好感 75／每 7 個故事日一次；`night_chat_reading` 夜間／好感 50；`cheek_pinch` 日間；`lakeside_sunset` 好感 50 且一次性。
- `app/www/story-art.js`：`cgEvents` 接入 36455（晚安主 CG）、36628（夜間蓋被）、36627（捏臉）、36622（湖畔夕陽）；`goodnight` 依玩家偏好選 36455／36628／隨機；`showCg`／`finishCg` 設定與清除 `data-ratio`、`has-portrait-cg`、`--cg-bg-url`。
- `app/www/app.js`：中英文提示詞補四個新旗標；核准呼叫帶入 `day`／`lastGoodnightDay`；`state.goodnightDay` 已納入預設、存檔正規化、遷移與回退快照。
- 測試：`v5-art-step2.test.js` 8/8 PASS；完整 21 檔回歸 109/109 PASS；Electron 煙測 ok:true；PII／簡體 0。
- 交付證據：`tests/v5-art-step2-app接線測試紀錄-20261109.txt`、`tests/v5-s2-full-regression-20261109.txt`、`SHA256-V5-ART-STEP2-20261109.txt`。

尚未完成（留待後續）：

- 36632 終章／結局 CG 接入 `ending`／`endingText` 流程。
- D15 真站端到端測試（需用戶本人登入／確認）。
- T1 六項手動實機驗收（等待圖改版後需重驗等待中介）。
- 36621 去背與 36629 是否啟用，仍由用戶決定。
