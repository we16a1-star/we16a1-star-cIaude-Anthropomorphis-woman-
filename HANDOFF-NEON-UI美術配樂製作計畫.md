# 《Claude娘的圖書館》UI × 美術 × 配樂製作計畫（交由 Neon 執行）

> **版本**：2026-11-22 v1　**發包方**：Antigravity（前一階段開發者）　**執行方**：Neon
> **基準狀態**：GitHub `main` @ `87e0ff6`｜`app.bundle.js` 860,625 bytes｜SHA256 `63362F0953999D8D0042B7AF3785964F61C006F46E47A0EE26DF3B09C9FB6340`
> **基準測試**：ESM 149/151（2 筆既有歷史基準差異，見 §1.4）｜CJS 8/8 檔案全 PASS
> **本文件是唯一工作依據**；遇到本文件未涵蓋、或與紅線衝突的情況，**先停下來問使用者**，不要自行擴大範圍。

---

## 0. 執行摘要

本計畫分三條工作線，共 **11 個工作包（WP）**，依相依性排成 4 個階段：

| 工作線 | 目標 | 工作包 |
|---|---|---|
| **A. UI** | 設定頁重整、BGM 播放面板、對話回顧（Backlog）、無障礙與英文介面補完 | UI-1 ～ UI-4 |
| **B. 美術** | 情緒白名單對齊、表情差分補齊、缺圖 CG 補件、UI 素材統一 | ART-1 ～ ART-4 |
| **C. 配樂** | 五場景 BGM＋事件曲、零素材程序化環境音、BGM 引擎接線 | BGM-1 ～ BGM-3 |

```mermaid
flowchart LR
    P0["階段 0：環境確認與基準回歸"] --> P1
    subgraph P1["階段 1：規格對齊（不產素材）"]
        ART1["ART-1 情緒白名單對齊"]
        BGM1["BGM-1 配樂規格與授權清單"]
        UI1["UI-1 設定頁資訊架構重整"]
    end
    P1 --> P2
    subgraph P2["階段 2：引擎與介面"]
        BGM2["BGM-2 BGM 引擎接線＋程序化環境音"]
        UI2["UI-2 BGM 播放面板"]
        UI3["UI-3 對話回顧 Backlog"]
    end
    P2 --> P3
    subgraph P3["階段 3：素材製作與入庫"]
        ART2["ART-2 表情差分補齊"]
        ART3["ART-3 缺圖 CG 補件"]
        ART4["ART-4 UI 素材統一"]
        BGM3["BGM-3 配樂素材入庫"]
    end
    P3 --> P4["階段 4：UI-4 無障礙／英文補完＋全套驗收＋交付"]
```

> [!IMPORTANT]
> **素材依賴使用者的部分**（音樂檔、需要 GPT/外部繪圖工具生成的圖）以「規格＋提示詞＋入庫流程」交付即可，**不要等素材才開工**。程式端一律先以「佔位＋自動降級」完成，素材到了只需放檔＋改 config。

---

## 1. 開工前必讀

### 1.1 專案路徑與唯讀規則

| 路徑 | 權限 |
|---|---|
| `c:\Users\shiny\OneDrive\桌面\Claude 娘1113\v2.0-modifications\` | **唯一可寫入區**（overlay） |
| `c:\Users\shiny\OneDrive\桌面\Claude 娘1113\完整原始碼-G43-v2.1\` | **唯讀參考**，絕不修改 |
| `c:\Users\shiny\OneDrive\桌面\Claude 娘1113\` 其他檔案（安裝檔、資料書） | 唯讀 |
| `D:\AnimaVN-main\` | 唯讀參考（MIT，可移植程式碼；**禁用** `AnimaBackend/app/seed_data/deepseek-chan/**`，CC BY-NC-SA） |
| GitHub 工作副本 `%TEMP%\opencode\claude-github-repo`（branch `main`） | 僅在階段 4 交付時同步 |

### 1.2 工具路徑（Windows，`node` 不在 PATH）

```powershell
$node    = "$env:TEMP\opencode\node.exe"                          # v22.23.3
$npmDir  = "$env:TEMP\opencode\claude-g43-npm\node_modules"       # esbuild、@capacitor/*
$jsdom   = "$env:TEMP\opencode\node_modules"                      # CJS 測試需要 jsdom
$git     = "$env:TEMP\opencode\MinGit\cmd\git.exe"
$chrome  = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$mod     = "c:\Users\shiny\OneDrive\桌面\Claude 娘1113\v2.0-modifications"

# 重建 bundle（絕不手改 app.bundle.js）
$env:NODE_PATH = $npmDir
& $node "$npmDir\esbuild\bin\esbuild" "$mod\app\www\app.js" --bundle --minify --format=esm --target=es2022 --outfile="$mod\app\www\app.bundle.js"

# ESM 測試
& $node --test (Get-ChildItem "$mod\app\tests\story" -Filter *.test.js).FullName

# CJS 測試（逐檔執行）
$env:NODE_PATH = $jsdom
Get-ChildItem "$mod\tests" -Filter *.test.cjs | ForEach-Object { & $node $_.FullName; "$($_.Name) exit=$LASTEXITCODE" }
```

實機截圖驗收工具在 `tools\artverify\`：`serve.mjs`（靜態伺服器，`/__shot.html` 會注入 `shot-inject.html` 強制進故事畫面）、`cdp.mjs`、`run-matrix.ps1`（4×4 矩陣）、`run-states.ps1`（7 狀態）。可參考
`C:\Users\shiny\.gemini\antigravity\brain\9cc567f7-3a99-4a8c-a318-9161d2a3f26e\scratch\verify-voice-ui.mjs` 的 CDP 寫法（同時開伺服器＋Chrome、量測 DOM、截 1264×720 與 800×600）。

### 1.3 紅線（任何 WP 都不可違反）

1. **D13 角色界線**：不貶低、不羞辱、不冷暴力；`withCharacterBoundary()` 不可被任何開關關閉。
2. **七選項＋第 8 項自由行動**的協議與版面不可破壞（`#choices` 內 `.choices-list` 雙層結構，Harness H13 要求 0 px 重疊）。
3. **四階表情好感度**（0–24／25–44／45–89／90–100）與 36624 規則保留。
4. **日／夜等待畫面**、**相簿 3×3 九格**相容、**單視窗開始畫面**、**角色在右側且不鏡像**。
5. **頭頂留白**：四張故事場景圖 `headPct = 0.135`（78px），新圖必須符合，並寫入 `assets/art-heads.json`。
6. **零簡體中文、零 PII**：交付前一律跑 `tools\artverify\scan3.ps1`（Big5／GB2312 判別），並確認無 `sk-ant-`、`sk-proj-`、`AIza…`、電子郵件、本機使用者路徑。
7. 含中文的 `.ps1` 一律存成 **UTF-8 with BOM**。
8. `story-art.js` **不可加頂層 `import`**（CJS 測試在 jsdom 直接 eval），且必須保留字串 `window.__storyArt = { showRareGoodnight, showBedroomScene` 前綴。
9. `config/scenePacks.json` 的 `"version": "v2.0-placeholder"` 與 `"bgmEnabled": false` **由 `v5-art-step2.test.js` 斷言**，見 BGM-2 的處理方式。
10. AnimaVN MIT 授權檔 `licenses/AnimaVN-MIT-LICENSE.txt`、`AnimaVN-MIT-NOTICE.txt` 必須保留；移植新模組要在 NOTICE 補列。
11. **不打包 `.exe`、不發 GitHub Release**——那是下一個里程碑，需使用者另行授權。
12. **音樂與圖像授權**：只接受（a）使用者提供且確認有權使用的檔案、（b）CC0／明確允許商用與再散布的素材（須記錄來源 URL 與授權條文）、（c）本專案程式現場合成的聲音。**不可使用來源不明或「僅限個人使用」的素材。**

### 1.4 已知既有失敗（不需修，但不可增加）

| 測試 | 原因 |
|---|---|
| `p1-03-claude-temp-chat.test.js` 案 3 | 期待舊版「12 家」網頁 provider，現為 13 家（含豆包） |
| `v5-art-step1.test.js` | 期待 `art_distribution.json` 23 筆，WP2 加入雨夜 36686／36687 後為 25 筆 |

若某個 WP 必須順便修這兩筆，**先徵求使用者同意**再改測試期望值。

---

## 2. 階段 0：環境確認與基準回歸（必做，約 0.5 小時）

1. 跑一次 §1.2 的重建與全套測試，確認結果等於「ESM 149/151、CJS 8/8」。
2. 計算 `app.bundle.js` SHA256，與本文件標頭比對；不一致就停下回報（代表有人在交接後改過檔）。
3. 開一份工作紀錄 `v2.0-modifications\NEON-WORKLOG.md`，之後每個 WP 完成時記：改了哪些檔、為什麼、測試結果、截圖路徑。

**驗收**：工作紀錄首段記下基準 SHA256 與測試數字。

---

## 3. 工作線 B：美術

### ART-1　情緒白名單對齊（階段 1，**最高優先**）

> [!WARNING]
> 交接前發現的不一致，請先查證再修：
> - `app/www/config/emotions.json` 白名單：`neutral, shy, proud, focused, warm, sad, surprised, angry, curious`（9 個）
> - `app/www/app.js` 送給 AI 的提示詞（`outputRule`，約第 2964–2965 行附近）與 `server.js` 協議：`neutral, happy, proud, shy, surprised, dizzy, curious, focused`（8 個）
> - `voice-tts.js` 的語調微調表另含 `gentle, tender, worried, sad, tease`
>
> 兩份清單**不一致**（`warm/sad/angry` vs `happy/dizzy`）。這會讓 AI 合法輸出的 `happy`／`dizzy` 可能在某些路徑被判成白名單外、或美術找不到對應差分。

**任務**
1. 逐一追蹤以下檔案實際使用哪份清單：`story-emotion.js`（`normalizeStoryEmotion`）、`emotion-fallback.js`、`prompt-assembler.js`、`config-loader.js`、`portrait-anim.js`、`expression` 相關 CSS、`voice-tts.js`。
2. 產出對照表（寫入工作紀錄）：情緒標籤 × 是否在 AI 協議 × 是否在 config 白名單 × 是否有立繪差分 × 是否有表情窗圖。
3. **提出統一方案給使用者選**（不要自行決定），建議預設方案：以 AI 協議的 8 個為「正式情緒」，`warm→happy`、`sad`／`angry` 保留為映射別名（經 `emotion-fallback.js` 的 `SEMANTIC_LABEL_MAP` 收斂），config 白名單與協議同步。
4. 使用者拍板後實作，並新增 `app/tests/story/emotion-whitelist-alignment.test.js`：斷言 config 白名單、提示詞清單、`normalizeStoryEmotion` 接受集合三者一致。

**驗收**：新測試 PASS；全套回歸不增加失敗；對照表與使用者決策記錄在 `P0-決策點-D1-D12-紀錄.md`（新增 D21）。

---

### ART-2　表情差分補齊（階段 3）

**前置**：ART-1 定案的正式情緒清單。

**任務**
1. 盤點現有立繪與表情資源：`portrait.webp`、`portrait-start.webp`、`portrait-anim-assets.js`、`assets/claude-splash/`、四階好感表情窗（參考 `新美術UI指導書資料\reference\表情窗-*.webp`）。
2. 列出「正式情緒 × 四階好感」矩陣中缺的格子（最多 8 × 4 = 32 格，實際只需補「情緒會改變表情窗」的組合）。
3. 為每個缺格撰寫**繪圖提示詞**，存成 `v2.0-modifications\tools\art-prompts\ART-2-表情差分提示詞.md`，格式比照桌面現有的 `GPT繪圖提示詞-*.txt`：
   - 角色固定描述：及腰橘色波浪長髮、橘色眼瞳、髮間橘色花飾與綴白流蘇黑緞帶、白色蕾絲洋裝、**不戴眼鏡**、成年（18 歲、173 cm）
   - 構圖固定：與現有表情窗同裁切、同光源、同線稿粗細；**角色朝向與現有素材一致，不鏡像**
   - 每格附：情緒、好感階段、表情要點（引用 `emotions.json` 的 `descriptions`）、禁止事項
4. 若 Neon 有可用的圖像生成能力，可先產生**草稿**放 `tools\art-drafts\ART-2\`（不入庫），由使用者挑選；正式稿由使用者確認後才進 `app/www/assets/`。
5. 入庫流程：用 `tools\artverify\install-art.ps1`（會先把舊檔備份到 `assets\backup-old\*-時間戳`），更新對應 config 與 SHA256 清單。

**驗收**：缺格清單＋提示詞文件完成；入庫的每張圖有 SHA256 紀錄；`expression-affinity.test.cjs` PASS；CDP 截圖確認四階表情窗切換正常。

---

### ART-3　缺圖 CG 補件（階段 3）

**任務**
1. 掃描 `app/www/config/art_distribution.json`，列出所有 `file: null` 或 `usable: false` 的條目（交接時已知 36623–36625 曾為 `file:null`，請重新核對現況）。
2. 對照 `events.json`、`story-events.js` 的事件旗標（`letter, moon_bird, outing_memory, magic_touch, vow, goodnight, night_chat_reading, cheek_pinch, lakeside_sunset`）與相簿九格，確認每個可觸發事件都有圖。
3. 缺圖者撰寫提示詞（同 ART-2 格式），存 `tools\art-prompts\ART-3-CG補件提示詞.md`。橫式 CG 依 `object-fit: cover`；直式 CG 需在 config 標 `ratio: "portrait"`、`blurBg: true`。
4. 故事場景類新圖必須符合頭頂留白 13.5%：用 `tools\artverify\add-headroom-v2.ps1` 處理、`detect-head.ps1` 量測，結果寫入 `assets/art-heads.json`。

**驗收**：缺圖清單歸零或明確標註「待使用者提供」；`v5-art-step2.test.js`、`album.test.cjs`、`rare-goodnight.test.cjs`、`bedroom-scene.test.cjs` PASS；`run-matrix.ps1` 4×4 矩陣 `errors=0`、`headSource=meta`。

---

### ART-4　UI 素材統一（階段 3）

**任務**
1. 現有 UI 點綴只有 `story-petal.svg` 與 CSS 漸層。統一一套「古籍羊皮紙 × 暖金」圖示語言，**優先用 SVG／CSS 繪製**（零外部字型、零點陣圖）：
   - 對話框快捷列圖示（自動、配音、靜音、跳過、回顧、BGM）
   - 設定頁分組標頭裝飾線
   - 日芒印章（`character.json` 的隨身物件）作為「已存檔／已解鎖」標記
2. 色票以 `art-plan.css` 現有變數為準（`--ap-gold`、`--ap-gold-bright`、`--ap-ink`、`--ap-ink-soft`、`--ap-serif`），**不新增與既有衝突的色彩**；新變數加在 `art-plan.css` 頂部並註解用途。
3. 確認夜間主題（`#tab-story[data-art-tone="night"]`）下對比度 ≥ 4.5:1（WCAG AA）。

**驗收**：新 SVG 放 `app/www/assets/ui/`；日／夜／晨光／雨夜四種 tone 截圖無破圖；對比度量測值記入工作紀錄。

---

## 4. 工作線 C：配樂

### BGM-1　配樂規格與授權清單（階段 1）

產出 `v2.0-modifications\tools\bgm\BGM-規格書.md`，內容至少包括：

**曲目清單（對應 `config/scenePacks.json` 的 5 個場景包＋事件）**

| 曲目 ID | 用途 | 綁定 | 情緒方向 | 建議長度 |
|---|---|---|---|---|
| `bgm-day-default` | 古籍閱覽室・白天 | scenePack `day-default` | 安靜、溫暖、鋼琴＋弦樂撥奏 | 90–150 秒無縫循環 |
| `bgm-morning-soft` | 晨光 | `morning-soft` | 輕快、木管、清新 | 同上 |
| `bgm-evening-reading` | 傍晚 | `evening-reading` | 慵懶、大提琴、暮色 | 同上 |
| `bgm-night-magic` | 夜間 | `night-magic` | 神祕、鋼片琴、微光感 | 同上 |
| `bgm-rainy-night` | 雨夜 | `rainy-night` | 低沉溫柔、可與雨聲環境音疊加 | 同上 |
| `bgm-title` | 開始畫面 | 開始面板 | 主題旋律、可辨識的動機 | 60–90 秒循環 |
| `bgm-event-tender` | 晚安／告白等 CG | `goodnight`、`vow`、`night_chat_reading` | 溫柔、抒情 | 60–90 秒循環 |
| `bgm-event-playful` | 捏臉、外出等輕鬆 CG | `cheek_pinch`、`outing_memory`、`lakeside_sunset` | 俏皮、輕盈 | 60–90 秒循環 |
| `bgm-wait` | AI 書寫中等待畫面（選配） | `wait-interlude` | 極簡、低存在感 | 30–60 秒循環 |

**技術規格**
- 格式：主檔 **OGG Vorbis q5**（約 160 kbps），備援 MP3 192 kbps；`scenePacks.json` 已列 `supportedFormats: ["mp3","ogg","wav","m4a"]`
- 響度：整合響度 **-18 LUFS ±1**、True Peak ≤ -1.0 dBTP（與配音同時播放時，`audio-bus.js` 會把 BGM 壓到 35%）
- 循環：檔首與檔尾可無縫接合；若有前奏，於規格書記錄 `loopStart`／`loopEnd`（秒，精確到毫秒）
- 單檔上限 3 MB（總配樂預算 ≤ 25 MB，避免安裝檔膨脹）
- 取樣率 44.1 kHz、立體聲

**授權欄位（每首必填）**：來源（使用者提供／CC0 網站 URL／自製）、作者、授權條文全文或連結、是否允許再散布於安裝檔、取得日期。缺任一欄不得入庫。

**給使用者的生成提示詞（選配）**：若使用者想用 AI 音樂工具自行生成，規格書附每首的英文風格提示詞，並**提醒使用者自行確認該工具的商用／再散布條款**；Neon 不代為使用任何需要帳號或付費的外部服務。

**驗收**：規格書完成並經使用者確認曲目清單。

---

### BGM-2　BGM 引擎接線＋程序化環境音（階段 2）

**現況**：`audio-bus.js` 已有 `bgm` 聲道與語音 Ducking；`scenePacks.json` 每個場景包 `bgm: null`；`story-art.js` 的 `applyScenePack()` 會在換場時被呼叫。

**任務**
1. 新增 `app/www/bgm-player.js`（ESM，零相依）：
   - 載入 `scenePacks.json` 的 `bgm` 欄位；`bgm` 為 `null` 或檔案不存在時**靜默降級**（不報錯、不出現 404 洪水，載入前先 `fetch(..., {method:'HEAD'})` 或以快取記錄失敗）
   - 換場時 **1.2 秒交叉淡入淡出**；同一首不重播
   - 支援 `loopStart`／`loopEnd`（`AudioBufferSourceNode.loopStart/loopEnd`）
   - 切到背景時跟隨 `audio-bus` 的 `visibilitychange` 掛起
   - 偏好存 `localStorage`：`claude_novel_bgm_v1`（`enabled`、`volume`），**預設關閉**（避免突然出聲）
2. 新增 `app/www/ambience.js`：用 Web Audio **現場合成**、零音檔的環境音（比照 `type-sound.js` 做法）：
   - `rain`（雨夜場景）：粉紅雜訊＋帶通濾波＋隨機雨滴脈衝
   - `fireplace`（夜間）：低頻雜訊＋隨機劈啪
   - `page`（翻頁點綴，選配）
   - 走 `audio-bus` 的 `fx` 聲道，可獨立開關
3. **`bgmEnabled` 測試衝突的處理**：`v5-art-step2.test.js` 斷言 `scenePacks.json` 的 `bgmEnabled === false`。**不要改這個欄位**；執行期是否播放改由 `localStorage` 偏好決定，`scenePacks.json.bgmEnabled` 保留為「出廠預設」語意。在 `bgm-player.js` 註解寫明此設計。
4. 接線點：`story-art.js` 的 `applyScenePack()` 觸發 `window.__bgmPlayer?.setScene(sceneKey)`（**用 `window.__` 全域呼叫，不可在 story-art.js 加 import**）；事件 CG 顯示時切事件曲、關閉後回場景曲。
5. 新增測試 `app/tests/story/bgm-player.test.js`：降級不拋錯、同曲不重播、淡入淡出時間、偏好讀寫、`bgmEnabled` 未被改動。

**驗收**：新測試 PASS；`scenePacks.json` 仍為 `v2.0-placeholder`／`bgmEnabled:false`；CDP 頁面 console 在全無音檔時**不新增任何 error**；配音播放時 BGM 確實壓低（可用 `audioBus` 狀態斷言）。

---

### BGM-3　配樂素材入庫（階段 3）

**前置**：BGM-1 規格書確認、使用者提供或核可素材。

**任務**
1. 素材放 `app/www/assets/bgm/`，檔名＝曲目 ID。
2. 驗證每檔：格式、長度、檔案大小、響度（若無法量測 LUFS，至少記錄峰值）、循環點試聽。
3. 更新 `scenePacks.json` 各場景包 `bgm` 欄位（**只改 `bgm`，不動 `version`／`bgmEnabled`**）。
4. 新增 `licenses/BGM-CREDITS.txt`，逐首列出授權資訊；若 `package.json` 的 `build.files` 需要納入新授權檔，**記錄在工作紀錄給下一階段打包者**，本階段不改打包設定。
5. 素材未到的曲目維持 `null`，由 BGM-2 的降級邏輯處理。

**驗收**：每首入庫素材都有 CREDITS 條目與 SHA256；總大小 ≤ 25 MB；實機切換五場景＋兩事件曲聽感無爆音、無斷點。

---

## 5. 工作線 A：UI

### UI-1　設定頁資訊架構重整（階段 1）

**現況問題**：`ensureVnPerformanceControls()`（`app.js` 約第 5850–6330 行）把逐句演出、自動播放、晚安 CG 偏好、打字音效、D20 語音面板全部疊在一個長群組裡，設定頁越來越長。

**任務**
1. 依使用者心智模型拆成可摺疊分組（`<details>`，預設只展開第一組）：
   - **文字與演出**：逐句開關、打字速度、自動播放、停留時間
   - **聲音**：主音量（新增）、BGM（UI-2）、環境音（BGM-2）、打字音效、語音配音（D20 面板整組搬入）
   - **畫面與 CG**：晚安 CG 偏好、文字大小（既有 Ctrl ± 功能的可視化入口）
2. **保留所有既有元素 ID**（`vnLineModeToggle`、`vnLineSpeedSlider`、`vnAutoPlayToggle`、`vnAutoDelaySlider`、`vnGoodnightCgPref`、`vnTypeSoundSelect`、`vnTypeSoundPreview`、`vnVoiceToggle`、`vnVoicePanel`…）與 class（`.vn-performance-settings-group`、`.vn-speed-control-box`、`.vn-line-mode-label`），**測試以字串比對這些 ID**。
3. 分組展開狀態存 `localStorage`（`claude_novel_settings_sections_v1`）。
4. 先交**線框說明**（文字或 Mermaid）給使用者確認，再動程式。

**驗收**：`vn-settings-integration.test.js`、`frontend-arch-optimization.test.js`、`voice-tts.test.js` 全 PASS；1264×720 與 800×600 截圖首屏可見三個分組標頭。

---

### UI-2　BGM 播放面板（階段 2，相依 BGM-2）

**任務**
1. 設定頁「聲音」分組內：BGM 開關、音量滑桿、目前曲目名稱、「試聽本場景」按鈕；環境音開關與音量。
2. 對話框快捷列 `#vnQuickBar` **不新增按鈕**（目前 `自動開・配音・靜音` 三顆，與角色名牌間距 1264 寬 51 px／800 寬 54 px，再加會擠壓）。改為把「靜音」鈕語意升級為「**全部聲音**」總開關（長按或右鍵展開 BGM／音效／配音三項）——**此變更需先問使用者**，未獲同意則僅在設定頁提供 BGM 控制。
3. 補 `UI_EN` 英文對照。

**驗收**：快捷列在 800×600 下與名牌間距 ≥ 40 px；BGM 開關與 `bgm-player.js` 偏好雙向同步。

---

### UI-3　對話回顧（Backlog）（階段 2）

**現況**：`storyDialogueTranscript` 只保留當前回合；`state.history` 有完整歷史。

**任務**
1. 新增 `app/www/backlog.js`＋面板：以 `state.history` 渲染最近 N 回合（預設 30），角色台詞、旁白、玩家行動用不同樣式區分。
2. 若該句有 D20 英文配音（`spokenText`），提供「重聽」小按鈕（呼叫 `window.__voiceTts.speakText`）。
3. 開啟方式：設定一個快捷鍵（建議 `L` 或滑鼠滾輪上捲到底再上捲）＋ 選單項；**不要佔用 1–8、Q、空白、Enter、Ctrl 系列等既有快捷鍵**（見 `app.js` 檔尾 keydown 監聽）。
4. 純讀取，不提供修改或回溯（分支存檔屬 P3-13，不在本計畫範圍）。
5. 新增 `app/tests/story/backlog.test.js`。

**驗收**：新測試 PASS；開關 Backlog 不影響逐句播放狀態與七選項；長歷史（200 回合）開啟時間 < 100 ms（以虛擬清單或只渲染最近 N 筆達成）。

---

### UI-4　無障礙與英文介面補完（階段 4）

**任務**
1. 掃描 `app.js` 所有 `uiText('…')` 字面字串，確認 `UI_EN` 都有對照；寫一支檢查腳本放 `tools\i18n-check.mjs` 並把結果附在工作紀錄。
2. 快捷列與設定頁所有按鈕補 `aria-label`／`aria-pressed`；配音「朗讀中」狀態加 `aria-live="polite"`。
3. 處理 CHANGES.md 早期記錄的已知問題：等待中介畫面顯示時，內嵌忙碌圖以 `display:none` 收起導致 aria-live 文字離開無障礙樹——改用 `visibility` 或保留一個非 `aria-hidden` 的 live 區（**需先問使用者**，該項當時標記為待裁決）。
4. 鍵盤可完整操作設定頁（Tab 順序合理、焦點框可見）。

**驗收**：i18n 檢查 0 缺漏；英文介面截圖無中文殘留（角色名與專有名詞除外）。

---

## 6. 階段 4：全套驗收與交付

1. **重建 bundle**，記錄 bytes 與 SHA256。
2. **全套測試**：ESM 失敗數 ≤ 2（僅允許 §1.4 兩筆）、CJS 全 PASS、本計畫新增測試全 PASS。
3. **實機 CDP**：
   - `run-matrix.ps1` 4×4 矩陣與 `run-states.ps1` 7 狀態：`errors=0`、`headSource=meta`、`headPctOfImage=13.5%`、`choicesCovered=0`、`choicesMaxOverlap=0`、`freeVisible=True`
   - 新截圖存 `tools\artverify\shots\neon-*.png`：故事畫面（日／夜／雨夜 × 1264／800）、設定頁三分組、BGM 面板、Backlog 面板、英文介面
   - **用眼睛看過每張截圖**再宣告完成，不可只看數字
4. **掃描**：`scan3.ps1` 0 簡體；PII 0。
5. **文件**：
   - `CHANGES.md` 新增一節（格式比照既有：檔案／動作／改了什麼為什麼／如何測試）
   - `P0-決策點-D1-D12-紀錄.md` 補 D21 以後的決策
   - `licenses/AnimaVN-MIT-NOTICE.txt` 補列新移植模組（若有）
   - `NEON-WORKLOG.md` 收尾摘要
6. **備份**（使用者同意後）：
   - GitHub：複製變更檔到 `%TEMP%\opencode\claude-github-repo`，commit 訊息用繁體中文，push `main`
   - Google Drive：資料夾 `雲端備份-20261122`（ID `1oUe9d9DdOymEcgRHDHklami4Vovptjhm`），以 `gdrive mutate update <fileId> <path>` **就地更新**既有檔案（保留 ID 與連結）：
     - Part 1 核心程式 `14cwkluUqX96B3IDY65Bc5ZlcmZMXIuQg`
     - Part 2 美術素材 `1FJot3TaCM_yH5N45OjGYCizhGlkXXAn3`（本計畫有新圖或 BGM 時才需更新）
     - Part 3 舊圖與截圖 `1EOB0ujtC9_Zyf_nLZOoncGSlQsN7k-OQ`
     - `CHANGES.md` `1XS3mg7n6sRQJIbncp1tE2yGO9r8sO5-w`
     - `SHA256-cloud-backup-20261122.txt` `14xxyDJi_mCNLPQnIj7XUa-aHBkUd-Xoq`
   - 單檔超過約 40 MB 時 Drive API 曾回 502，請拆卷並加重試（最多 3 次、遞增等待）。

---

## 7. 需要使用者拍板的決策點（彙整）

| 編號 | 問題 | 對應 WP | 建議預設 |
|---|---|---|---|
| D21 | 情緒白名單以哪份為準？ | ART-1 | AI 協議 8 個為正式，其餘做映射別名 |
| D22 | 設定頁分組線框是否同意？ | UI-1 | 三分組可摺疊 |
| D23 | 快捷列「靜音」是否升級為「全部聲音」總開關？ | UI-2 | 是，長按展開子項 |
| D24 | BGM 曲目清單與來源（自備／CC0／AI 生成）？ | BGM-1／BGM-3 | 先上程序化環境音，曲目待使用者提供 |
| D25 | 等待畫面 aria-live 修正是否執行？ | UI-4 | 執行，改用 `visibility` |
| D26 | 表情差分與 CG 草稿是否由 Neon 用 AI 生成草稿？ | ART-2／ART-3 | 生成草稿僅供挑選，正式稿由使用者確認 |

> [!TIP]
> 建議 Neon 在**階段 1 結束時一次把 D21～D26 整理成選擇題問使用者**，避免來回多次中斷。

---

## 8. 每個 WP 的完成定義（Definition of Done）

- [ ] 只改 `v2.0-modifications\` 內檔案
- [ ] 新增或修改的邏輯有對應測試，且全套回歸不增加失敗
- [ ] `app.bundle.js` 由 esbuild 重建，非手改
- [ ] UI 變更有 1264×720 與 800×600 實機截圖，且已目視檢查
- [ ] 0 簡體、0 PII
- [ ] `NEON-WORKLOG.md` 已記錄（檔案、原因、測試、截圖）
- [ ] 需要使用者決策的項目已詢問並記錄結果，未擅自決定
