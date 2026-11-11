# CHANGES.md — v2.1 修改總錄（G43 新素材整合完成）

規則（依指示書 §2）：原始碼唯讀；一切修改與新增只寫在本資料夾（同相對路徑）；每筆記「改了什麼／為什麼／如何測試」。金鑰與對話內容不入本資料夾（此處在 OneDrive 同步範圍）。一次只動一個任務的檔案。

## 2026-11-07（P0 開工）

| 檔案 | 動作 | 改了什麼／為什麼 | 如何測試 |
|---|---|---|---|
| `P0-01-現況清單.md` | 新增 | 依工作執行表 P0-01：三處原始碼樹盤點＋安裝檔 SHA256 核對＋補丁包核對。發現：4.6.37 exe 實測 `5EAD33D8…` ≠ 附錄 E `902EA60F…`（兩顆不同構建）；G43 installer/zip 兩值皆與附錄一致 ✓ | Get-FileHash 逐一核對；紀錄可複現命令 |
| `P0-02-程式現況回報.md` | 新增 | 六項現況回報＋指示書 4.4 預判逐項核實（gift-system/world-book 既有所需模組、story-clock 4 帶≠A/B/C 等） | 純閱讀彙整，未改碼 |
| `P0-03-AnimaVN對照表.md` | 新增 | 13 做法對照（檔案/工作量/風險）＋MIT 致謝＋19.4 自建清單；承接前段 AnimaVN 安裝驗證（`/api/health` ok） | 對 D:\AnimaVN-main 逐檔核對 |
| `CHANGES.md` | 新增 | 本檔：修改總錄開立 | — |
| `app/www/wait-interlude.js` | 新增（補丁包原檔） | 等待中介畫面主模組：MutationObserver 監看 `#choices .loading-dot`，0.35s 後淡入插畫、最短停留 0.7s、25s 顯示小三提示；G44 相容——busy 分支 `figcaption.loading-dot` 仍是 `#choices` 孫元素，`marker()` 照樣命中、標題自動複製「克勞德正在書寫……」 | 22/22 項 jsdom 行為測試＋G44 形狀 3 項附加檢查全 PASS（`41F0D0B9…25170D` 與補丁原始清單一致） |
| `app/www/wait-interlude.css` | 新增＋末尾追加 | 補丁原檔＋G44 共存規則一條：`#tab-story:has(.wait-interlude.is-visible) #choices .story-busy-art{display:none}`——中介畫面出現時收起內嵌忙碌圖（兩者同源素材，交接不看破綻）；只動本檔，不動 style.css / app.js / app.bundle.js | 靜態規則；實機渲染併入 6 項手動驗收（`4FBD3AEB…7983AE`＝原檔＋追加段落） |
| `app/www/index.html` | 修改（由 4.6.38 源檔生成） | 源檔 832 行、僅插入 2 行：css link 於 style.css 之後（第 12 行）、module script 於 story-art.js 之後（第 831 行）；與補丁包版逐位元組一致（證明補丁包即以 4.6.38 index.html 為本） | 生成器結果與補丁包原檔 byte-equal=true（`48E57518…E80DB`） |
| `app/www/assets/g43-wait-writing.jpg`、`g43-wait-night.jpg` | 新增 | 36552（日・書庫寫字）與 36455_1（夜・床邊羽毛筆）兩張等待圖；名稱與用途定格，不挪作其他 CG | SHA256 與補丁包原始清單一致（`E33EC5DF…64CBBB`／`F7C4B853…D5806`） |
| `tests/wait-interlude.test.cjs`＋測試紀錄×2 | 新增 | 補丁自帶 22 項 jsdom 行為測試；另附 G44 figcaption 觸發／夜圖判定／標題複製 3 項檢查（`g44` 逐字 DOM 形狀）；jsdom 裝在暫存測試資料夾（OneDrive 不放 node_modules），被測 js 與部署檔位元組相同 | 22/22 PASS＋3/3 PASS（證據：`wait-interlude-測試紀錄-20261107.txt`、`wait-interlude-g44相容檢查-20261107.txt`） |
| `app/www/wait-interlude.js`＋`tests/wait-interlude.test.cjs` | 修改（**D6 執行**） | D6 拍板「夜間等待改用日間圖」：`ART.night` 物件改 `null`（含裁決註記）→ 夜間等待沿用日間書寫圖、36455_1 讓位 T3 晚安 CG（素材仍留 assets 供還原）；測試第 4 案預期同步改「沿用日圖＋日間版式」，其餘 21 案不變 | 以 D6 版預期重跑：**22/22＋G44 相容 3/3 全 PASS**（js `D3186479…BAE662`、test `0AFEDF71…8FF2C`；兩份紀錄 txt 已更新為最新結果） |
| `P0-決策點-D1-D12-紀錄.md` | 新增 | 指示書 §8 決策全數拍板入檔（D1 兩基準都要・預設故事時段／D2＝10／D3 口頭禪改掉／D4 不作預設／D5 不簽章＝SHA256＋說明／D6 改日圖→已執行／D7 預設關閉可開／D8 隱藏可開／D9＝+3／D10 後議／D11 T12 定／D12 等素材），並列每項的 config 落點 | 以本檔作為 T4／T5／T9／T11／T12／P0-06 的唯一決策依據 |

### T1 已知限制與風險（記錄待處理）
1. 中介畫面顯示期間，G44 內嵌忙碌圖以 `display:none` 收起——其 aria-live 文字（「正在書寫」）同時離開無障礙樹，而中介畫面本身 aria-hidden=true；單人桌面使用影響低，後續可改成 `visibility` 或在畫面內保留一個非 aria-hidden 的 live 文字（心事項，待你裁決要不要做）。
2. （已解決→D6 拍板並執行）夜間等待現沿用日間書寫圖（36455_1 讓位給 T3 晚安 CG）。要還原夜圖：把 `wait-interlude.js` 的 `ART.night` 改回物件 `{ file:'g43-wait-night.jpg', ratio:'landscape', … }`，並把測試第 4 案預期改回夜圖（素材仍在 assets）。

## 既存檔案（先前產物，非本次任務）
本資料夾已有 8 個 v5.0 模組（app/expansion/life-sim/memory-store/relationship/safety/server/touch .js）——引用尚不存在的 `./config-loader.js` 與 `config/*.json`，尚未接入任何測試，屬未接線草稿。處置（**接手補齊** vs **依 S1–S12 重產**）已列入 P0-04 提案請示。

## 待辦（下一步）
- **實機測試包完成（2026-11-08）**——T1 手動驗收可開工：雙擊 `start-v20-test.bat`（獨立 app 名＝存檔與正式版隔離，零 ConfigLoaderError）；**P1-02 依 xlsx 正名＝「S2 提示詞組裝與開發者檢視」**（不是早先口頭列的接線清單），計畫待批。

## 2026-11-07（P0-04 提示詞 v1 定稿＋D13 無限制）

| 檔案 | 動作 | 改了什麼／為什麼 | 如何測試 |
|---|---|---|---|
| `app/www/config/stages.json` | 修改 | ①附錄 C.2–C.4：A/B/C promptBlock 各插入「- 不替玩家寫台詞或動作。」②D13：B 刪「；不說占有、排他或愧疚式台詞」、C 刪「不說占有式台詞；」（吃醋／鼓勵句保留） | `node --test` 18/18 PASS；文字檢查 3 處條款、占有 0 處 |
| `app/www/config/affection_bands.json` | 修改 | ①附錄 C.5：promptSupplementTemplate 由單行 `{bandName} - {guideline}` 升級為四帶全列版；②D13：刪「不勒索愧疚」，保留「任何好感帶都不貶低」 | 同上（四帶行＋`{bandName}` 無 `{guideline}`） |
| `app/www/config/schedule.json` | 修改 | ①附錄 C.6：「並從動作庫挑選」→「並從動作庫挑選；action 欄位選填」②D13：「久未上線只用語氣表達，絕不說…愧疚句」→「久未上線只用語氣表達。」 | 同上 |
| `app/www/config/character.json` | 修改 | ①D3：catchphrase→「」（留空位）②D13：boundaries 刪占有愧疚條目；basePrompt【界線】→「任何時候都不冷暴力、不貶低；…」 | config-loader 載入＋schema PASS（18/18 含） |
| `app/www/character-profile.js` | 修改 | D3：高傲嬌詳版刪「日常口頭禪：…」句；精簡版口頭禪列只餘「名門不出半成品。」（DEFAULT 系無口頭禪文字，未動） | 五來源掃描 0 處；「名門不出半成品。」仍在 |
| `app/www/life-simulator.js` | 修改 | D13：移除離線問候 guiltWords 過濾器（原把「我一直在等你」等改寫成「剛好讀完一章」）；註解改 D13 版 | life-simulator.test.js（D13 修訂版）PASS |
| `app/tests/story/life-simulator.test.js` | 修改 | D13：驗收標題＋「無愧疚句」斷言移除 | 同上 |
| `app/www/prompt-rules.js` | 修改 | D13：tone 尾句→「尊重雙方界線，不貶低、不羞辱、不冷暴力。」（app.js／server.js 實際 import 中） | 文字檢查＋抽樣渲染 |
| `app/tests/story/p0-04-appendix-c.test.js` | 新增 | P0-04 檢核：S1 載入／D3 五來源歸零／D13 禁令歸零＋保留禁令俱在／三階段標頭＋不代寫＋危機＋JSON 協議／C.5、C.6 模板比對／離線問候生成／抽樣 10 則離線渲染 | 10 案全 PASS（真 LLM 抽樣待 P1-02/P1-03 接線） |
| `app/tests/story/config-loader.test.js`、`prompt-assembler.test.js` 及 11 份未改 config＋config-loader.js／prompt-assembler.js | 新增（基準原樣複製） | P0-04 修改面的依賴完整集複製進 mods 樹，內容未改 | 兩驗證測試檔 PASS |
| `P0-04-提示詞v1-審閱版.md` | 新增 | 六區塊定稿對照＋與指示書差異清單（D3／D13）＋SHA256＋驗收矩陣 | 文檔審閱 |
| `P0-決策點-D1-D12-紀錄.md` | 修改 | 增補 D13（裁決＋8 處落地清單）與 D14（玩家名 User／開始介面改名；**待批准**）；再增補 **D15**（網頁模式＝Claude 官網全自動＋**用官網暫時／無痕對話**跑回合——補齊「臨時對話僅 ChatGPT 與 Gemini」的缺口；進 P1-03 硬性驗收，P0 不改碼） | 本檔為唯一依據 |

## 2026-11-08（D14 執行：玩家名 User＋開始介面改名）

| 檔案 | 動作 | 改了什麼／為什麼 | 如何測試 |
|---|---|---|---|
| `app/www/player-name.js` | 新增 | D14 玩家名單一來源：`DEFAULT_PLAYER_NAME='User'`、上限 16 字、sanitize（去控制字元與引號、trim、以 code point 截斷防 emoji 切半）、空值回退預設、本機偏好存取（KEY=`claude_novel_player_name_v1`、讀寫失敗靜默、storage 可注入便於測試） | `node --test` player-name 5 案 PASS |
| `app/www/app.js` | 新增（基準 4.6.38 原樣複製）＋6 處修改 | ①import player-name 三個具名匯出 ②i18n 字典加「你的名字」「會隨這個存檔記錄；留空則使用 User。」英文兩條 ③開始面板模板前設 `playerNamePref=loadPlayerNamePreference()` ④模板在「目前 AI」列前插「你的名字」欄（`#openingPlayerName`，maxlength 16，value 經既有 `esc()` 跳脫預填）⑤難度 select 接線後補 `change` 即存偏好 ⑥`startStoryBtn` 統一設定點（`state.difficulty=difficulty` 之後）寫 `state.playerName`＋`savePlayerNamePreference`——無痕格／手動格兩分支皆覆蓋；`switchSlot` 為整包 spread 讀回，無需改白名單 | esbuild transformSync 語法 OK＋接線 6 處檢查 PASS＋六檔 25/25 |
| `app/www/style.css` | 新增（基準原樣複製）＋檔尾追加 | 為 `#openingPlayerName` 補 start-panel 暖色調輸入框樣式（含 `:focus`），沿用既有 `--story-font-scale` 縮放 | CSS 追加（不影響 JS 測試，基準原樣複製未破壞 P0-04 面） |
| `app/www/memory-system.js` | 新增（基準原樣複製）＋2 處修改 | import `normalizePlayerName`；`this.playerName = initialData.playerName \|\| '旅行者'` → `normalizePlayerName(initialData.playerName)`（舊存檔已有名保留；undefined→'User'） | memory-system.test.js（基準原樣複製）2 案 PASS |
| `app/www/prompt-assembler.js` | 修改 | import `DEFAULT_PLAYER_NAME`；`{玩家名}`／`{暱稱}` fallback『旅行者』→DEFAULT_PLAYER_NAME | prompt-assembler.test.js PASS；mods 樹『旅行者』grep＝0 處 |
| `app/tests/story/player-name.test.js` | 新增 | D14 五案：預設值與 key 契約、sanitize、normalize、偏好 roundtrip、storage 失敗回退 | node --test PASS |
| `app/tests/story/memory-system.test.js` | 新增（基準原樣複製） | 為 mods 樹 memory-system.js 補測試覆蓋，內容未改 | 2 案 PASS |
| `P0-決策點-D1-D12-紀錄.md` | 修改 | D14 狀態→**已執行完成**；「遊戲選單設定可再改名」說明延後至 P1-02（現階段無消費端，非有效 UI） | — |

修改面 SHA256（前 16 碼）：`app.js 6FF5214A8A5E7CD9`、`memory-system.js 1B14C33F8AE77611`、`prompt-assembler.js 7D3F993D2A43027D`、`player-name.js CB0DC9F711AF4608`、`style.css 9694614DB9C3C8E0`、`player-name.test.js 79429D1EB79EDA23`、`memory-system.test.js 4179B97696254A2E`。

## 2026-11-08（P0-05 執行：回覆協議定稿＋驗證規則 config 化）

| 檔案 | 動作 | 改了什麼／為什麼 | 如何測試 |
|---|---|---|---|
| `app/www/config/reply_protocol.json` | 新增（第 15 份 config） | 五欄規則合同（text 必填整則級；emotion/action 白名單外丟棄或回退；delta −3..3 clamp；flag 僅提議由程式裁定）、`outputFormat`＋`exampleJson`（逐字字串）、`promptSectionTemplate`（協議塊模板，`[[...]]` 佔位符）、`retryRule`／`fallbackRule`——xlsx P0-05「欄位與驗證寫進 config」的載體 | p0-05 測試第 1 案規則合同＋config-loader schema |
| `app/www/config-loader.js` | 修改（基準複製後） | 新增 import＋`ALL_CONFIGS.replyProtocol`＋schema 條目（required 五鍵＋nested 三規則） | S1 測試 15 檔全載＋schema PASS |
| `app/www/prompt-assembler.js` | 修改 | ①【回覆限制與格式協議】塊從硬編碼改讀 `promptSectionTemplate`（白名單仍注入自 actions/emotions config，輸出逐字等價）②`parseAndValidate` delta clamp 範圍改讀 config ③action 註解補 T6 語義（白名單外丟棄、不重試整則） | p0-05 測試第 2／3 案＋S2 既有案回歸 |
| `app/tests/story/config-loader.test.js` | 修改 | 標題 14→15、加 `configs.replyProtocol` 斷言 | PASS |
| `app/tests/story/p0-05-reply-protocol.test.js` | 新增 | 3 案：規則合同／協議塊組裝（14 動作全展開、佔位符清零、delta 文字、示例逐字、styleTweaks 變體）／T6 三測例（缺欄位、錯誤標籤丟棄、clamp）＋text 缺失整則級失敗 | PASS |
| `P0-05-回覆協議v1-審閱版.md` | 新增 | 協議定稿（五欄表＋輸出契約＋重試兜底）、T6 兩層相容性說明（七選項不動；S 模組五欄；共用白名單）、與指示書差異、測試與 SHA256 | 文檔審閱 |

修改面 SHA256（前 16 碼）：`reply_protocol.json 5304FD496FF1D717`、`prompt-assembler.js 37DF0FE1AD340661`、`config-loader.js 609A1AA2E260DAA1`、`p0-05-reply-protocol.test.js EC3B2D58BBB1418A`、`config-loader.test.js 734C317ED058F9F8`。

## 2026-11-08（P0-06 config 稽核補丁＋AI 選中白字修復）

| 檔案 | 動作 | 改了什麼／為什麼 | 如何測試 |
|---|---|---|---|
| `app/www/config/schedule.json` | 修改 | D1：新增 `life:{timeBase:'story', realModeEnabled:true, note}`——預設故事時段、可切本機時間、兩模式都進 S7 離線補算 | p0-06 測試案 1 |
| `app/www/config/extensions.json` | 修改 | D7：新增 `usage.dailyCap:{enabled:false, limit:null}`（預設關、開啟時才填 limit）；D9：`rules.dailyAffectionGainTotalCap`（無程式引用，基準與 mods 兩側查證 0 處）改名為決策命名 `expansion.dailyBonusCap:3`（top-level，含 note），其餘規則四條與 11 機制不動 | p0-06 測試案 2 |
| `app/www/config-loader.js` | 修改 | schema 條目同步：schedule nested 加 `life.timeBase==='story'`／` life.realModeEnabled`；extensions nested 加 `expansion.dailyBonusCap===3`／`usage.dailyCap.enabled===false` | S1 全檔 schema 驗證 PASS |
| `app/www/style.css` | 修改 | **UI 白字修復（用戶指示）**：363 行 `.web-provider-quick[aria-pressed="true"]` 的 `color:#fff`→`color:var(--ink)`——選中 AI 網站按鈕字不再變白（accent 亮金底＋墨色字可讀；dark 主題由 509/523 行更高優先權規則覆蓋為 `--bubble-user-text`，不受影響） | CSS 檢查＋實機驗收列入 T1 清單 |
| `app/tests/story/p0-06-config-policy.test.js` | 新增 | 3 案：D1 合同、D7＋D9 合同（含舊 key 移除驗證）、D2 既有值複核 | PASS |
| `P0-06-config稽核審閱版.md` | 新增 | D 系決策落點總表（D1–D15 每項驗證位置）、補丁明細、與試算表對照方法與聲明 | 文檔審閱 |

修改面 SHA256（前 16 碼）：`extensions.json 0BF2DA5D06CB5178`、`schedule.json D8BC50879DB731F6`、`config-loader.js 74AC9D13AD34CA48`、`style.css E197758ADE636D8B`、`p0-06-config-policy.test.js EED25E84F14242E8`。

## 2026-11-08（P0-13 M0 評審開立）

| 檔案 | 動作 | 改了什麼／為什麼 | 如何測試 |
|---|---|---|---|
| `P0-13-M0評審清單.md` | 新增 | 評審包：六件評審物（設計計畫書＝指示書＋xlsx＋決策紀錄 D1–D15、提示詞 v1、回覆協議、config 15 檔、AnimaVN 對照表、現況基礎）、P0 重大發現五條、掛帳表六項（不阻擋 M0）、三個拍板問題（通過與否／掛帳歸屬／8 檔草稿去留） | 用戶拍板（里程碑，共同任務） |
| `P0-13-M0評審清單.md`（同檔 §5） | 修改 | **M0 通過**結論入檔：進入 P1；掛帳照列；8 檔草稿原地保留（不引用不修改）；D 值變更走三件套規則 | 里程碑結案紀錄 |

程式碼本輪無改動；31/31 全 PASS 狀態不變。

## 2026-11-08（P1-01 執行：S1 設定檔載入器接線＋mods 樹鏡像補完）

| 檔案 | 動作 | 改了什麼／為什麼 | 如何測試 |
|---|---|---|---|
| `app/www/app.js` | 修改（三小 patch） | ①import 區（63 行旁）新增 `import { loadConfigs } from './config-loader.js'` ②模組級 `__gameConfigs`＋`bootstrapGameConfigs()`：成功→15 檔 config 存模組級變數（P1-02 起的消費端使用）；失敗→`console.error` 留痕＋`alert()` 可見警示（沿用既有慣例），遊戲以 app.js 內建提示詞照常運作——不白屏、不擋存檔 ③頂層 init 行（`applyTheme…` 那行）前呼叫 `bootstrapGameConfigs();` | 案1 接線契約＋案2 語法解析＋bundle 煙測（接線字串在產物內） |
| `app/tests/story/p1-01-config-bootstrap.test.js` | 新增 | 3 案：接線契約（import／bootstrap 成功失敗兩路／啟動呼叫恰 1 處且先於 UI 初始化）／esbuild `transformSync` 全檔語法（esbuild 取自基準樹 0.25.12，缺時自身降級不通過語法子項）／`loadConfigs` 15 檔抽樣（含 replyProtocol.text.required、D1 timeBase、D7 dailyCap、D9 dailyBonusCap） | **全測 34/34 PASS**（31 既有回歸＋3 新案） |
| `app/www/`（補鏡像 59 檔） | 新增（基準原樣複製，零修改） | 煙測暴露：mods 樹先前只複製修改面，缺 59 檔（sibling 模組 25 支＋立繪/CG/表情等素材與 manifest），模組圖不完整＝**無法啟動**。補齊原樣副本；既有修改面**一律不覆蓋**（腳本只補缺、exist 即跳過）；舊 `app.bundle.js`（過期 build 產物）刻意排除——實機驗證時重建，避免載到舊版行為 | 鏡像後 bundle 煙測 BUILD OK（703,902 bytes、0 warnings） |

**bundle 煙測**（temp 工具 `p1-01-bundle-smoke.cjs`＋`p1-01-mirror-baseline.cjs`，以基準樹 esbuild 0.25.12 跑與 `build:web` 同參數的真實 bundle，產物只進 temp）：BUILD OK；`promptSectionTemplate`／`dailyBonusCap`／`timeBase`（config 內聯）與 `[S1/P1-01]`（接線）皆在產物內；`@capacitor/*` 因 mods 樹無 node_modules 標 external（真機建置由基準/安裝環境 node_modules 內聯——與基準 build 行為一致）；esbuild 預設 `charset=ascii` 使非 ASCII 在產物呈 `\uXXXX` 轉義（基準自家 build 同參數同行為，執行期等價、純表示差異）。

修改面 SHA256（前 16 碼）：`app.js CAA4FF4F48A6300C`、`p1-01-config-bootstrap.test.js D617168A84F72DE1`。未動證明：`config-loader.js 74AC9D13AD34CA48`、`prompt-assembler.js 37DF0FE1AD340661`、`style.css E197758ADE636D8B`、`extensions.json 0BF2DA5D06CB5178`、`schedule.json D8BC50879DB731F6`（與 P0-06 紀錄逐一相符）。

## 2026-11-08（實機測試包：T1 手動驗收前置）

| 檔案 | 動作 | 改了什麼／為什麼 | 如何測試 |
|---|---|---|---|
| `app/www/app.bundle.js` | 新增（建置產物，**非手改**） | 以基準 esbuild 0.25.12 依 `build:web` 同參數（bundle＋minify＋esm＋es2022）建置；mods 樹無 node_modules，以 `nodePaths` 指基準樹解析、`@capacitor/*` 全部內聯（714,301 bytes）；index.html 載入此檔＝實機可跑 | 產物內聯驗證（無殘留 bare import）＋Electron 實機啟動煙測 |
| `start-v20-test.bat` | 新增 | ASCII 啟動器：跑 `%TEMP%\opencode\claude-v20-run\electron-dist\electron.exe`（temp 執行包）；內容全 ASCII 避免 cp950 亂碼 | 雙擊即開遊戲 |
| （temp 執行包，非專案檔） | 建置 | `%TEMP%\opencode\claude-v20-run`：基準主進程檔（electron-main.cjs 等）與 server／assets 複製＋`package.json` 改 `name=claude-novel-v20-mods`、`version=4.6.38-v20-mods`（**存檔與正式版 localStorage 完全隔離**）＋`www`→mods www、`node_modules`→基準樹（junction，OneDrive 零 node_modules）＋electron runtime＝官方快取 `electron-v44.9.0-win32-x64.zip` 解壓（基準 pnpm store 缺 electron binary，僅有此路徑可得；runtime 與基準依賴 44.9.0 完全一致）；另含 env 觸發（`CLAUDE_V20_SMOKE=1`）自動煙測掛鉤（僅在 temp 主進程副本內） | **自動煙測 ok:true**：startPanel 在場、`#openingPlayerName` 值＝User（D14 實機生效）、零 ConfigLoaderError；僅有 dev 模式無害 CSP 警示 |

修改面 SHA256（前 16 碼）：`app.bundle.js 96FC396045676114`、`start-v20-test.bat 4B4D4C0F4B43E1A9`。重建方式：temp 腳本 `p1-02-package-run.cjs`（bundle 建置＋執行包組裝，可重複執行）。

## 2026-11-08（P1-02 執行：S2 提示詞組裝與開發者檢視）

| 檔案 | 動作 | 改了什麼／為什麼 | 如何測試 |
|---|---|---|---|
| `app/www/prompt-assembler.js` | 修改（重構，輸出等價） | 新增 `assemblePromptBlocks()`：六區塊（character／stage／band／living／memory／status）回傳 key／label／source／text（text 含組裝用前導換行；空字串＝該區塊未啟用）。`assemblePrompt()` 改為六區塊 `filter(Boolean).join('\n')`，輸出與重構前逐字等價（由 P1-02 案1 與既有 prompt-assembler 回歸釘死）。「狀態」區塊＝相處風格參數＋`reply_protocol.json` 輸出協議（白名單／delta 範圍／exampleJson），來源標註 `reply_protocol.json → promptSectionTemplate` | p1-02 案1–2＋既有 S2 回歸 |
| `app/www/prompt-inspector.js` | 新增 | 純資料＋字串渲染（不碰 DOM）：`estimateTokens`（CJK 1 字≈1.15 token、ASCII 0.3）、`bandKeyForAffection`（80/50/30 帶界）、`defaultStageForAffection`（≥50→B，C 僅手動）、`loadBlockPrefs`／`saveBlockPrefs`（`claude_v20_inspector_blocks_v1`，僅六鍵布林）、`buildInspectorData`（區塊啟用過濾＋總字數／總 token／預覽）、`renderInspectorBlocks`（自帶 HTML 轉義）／`renderInspectorSummary` | p1-02 案3–5 |
| `app/www/app.js` | 修改（獨立面板，不碰主流程） | import inspector；新增 `ensurePromptInspectorPanel()`（工坊 `.workshop` 尾端建立 `details#pmInspector`：階段 A／B／C、好感帶四選、重新組裝鈕、摘要、六區塊容器；stage 預設依好感度、C 才開放好感帶）與 `refreshPromptInspector()`（以當前 `state.storyMemory`／玩家名＋面板階段／帶位組裝；開關變更寫 localStorage 後重繪）；`fillWorkshopSettings()` 頂端呼叫建立＋刷新（早退不影響） | p1-02 案6 接線契約＋實機煙測 |
| `app/www/style.css` | 修改（檔尾追加） | pm-* 樣式：面板收合標題、控制列、摘要、區塊卡（來源／字數／token 列）、可折疊全文（pre-wrap、max-height 240px）、關閉區塊淡化；沿用既有 design tokens（--panel／--line／--ink-soft／--bg／--accent） | 實機視覺＋煙測 |
| `app/tests/story/p1-02-prompt-inspector.test.js` | 新增 | 6 案：①六區塊齊全＋`assemblePrompt` 與區塊串接逐字等價（A/B/C、帶、注入與缺省 6 組）②切換階段替換且不殘留、好感帶僅 C、玩家名代入、來源標註 ③token 估算與帶界／預設階段邊界 ④開關只影響預覽、不影響實際組裝、偏好持久化與非法值清洗 ⑤渲染含來源／字數／token／轉義 ⑥app.js 接線契約 | p1-02 全 6 案 PASS |
| `app/www/app.bundle.js` | 重建（建置產物，非手改） | 以同一 esbuild 參數重建（723,872 bytes；取代前版 714,301／`96FC396045676114`）；`@capacitor/*` 全內聯 | 產物內聯驗證＋Electron 煙測 |

**測試**：全測 **40/40 PASS**（10 檔：31 既有回歸＋3 P1-01＋6 P1-02）。

**實機煙測（P1-02 擴充）ok:true**：開工坊分頁→`#pmInspector` 建立、六區塊鍵序 `character,stage,band,living,memory,status`、摘要含 tokens（3 啟用／6、1,532 字／約 1,171 tokens）、階段切 C 後區塊文字為「【階段：告白後】」且好感帶補充出現（平穩）；零 ConfigLoaderError。生活層目前無產生器（空區塊＋來源註記）、app.js 尚無相處風格自訂（styleTweaks 以標準值檢視）、面板開關僅作用預覽（實際注入屬 P1-03）。

修改面 SHA256（前 16 碼）：`app.js 5ECF0281FA1D9EAD`、`prompt-assembler.js 5BB10AA4D57F1F17`、`prompt-inspector.js 430A83B4EC287432`、`style.css 7E3FE2BB1EE03B72`、`p1-02-prompt-inspector.test.js 32B487AF25DA3689`、`app.bundle.js 81C9B08B22826A12`。未動證明：`config-loader.js 74AC9D13AD34CA48`、`extensions.json 0BF2DA5D06CB5178`、`schedule.json D8BC50879DB731F6`（與前段紀錄相符）。

## 2026-11-08（P1-03 執行：S2 LLM 呼叫、解析、驗證、重試、兜底＋D15 Claude 無痕對話（使用者登入／確認））

| 檔案 | 動作 | 改了什麼／為什麼 | 如何測試 |
|---|---|---|---|
| `app/www/llm-client.js` | 新增 | S2 呼叫層：`DEFAULT_MAX_RETRIES=2`（總嘗試 3）、`SYSTEM_BLOCK_KEYS=[character,stage,band,status]`／`USER_BLOCK_KEYS=[living,memory]`、`buildPromptPayload()`（`system`＝固定區塊前段利供應商前綴快取、`user`＝動態區塊、`prompt`＝與 `assemblePrompt` 逐字等價全文）、`buildRepairInstruction()`（原因截 120 字、單行化）、`callStructuredTurn()`（注入式 `send`；格式不合／連線錯誤共用重試次數；重試附加格式修正指示；重試用盡或無傳輸→`PromptAssembler.getFallbackReply` 兜底、`affection_delta=0`；`{玩家名}`／`{暱稱}` 代入；回傳 `meta.attempts/usedFallback/errors`）。**永不因 LLM 格式問題向外丟例外**；不碰金鑰與供應商 | `p1-03-llm-client.test.js` 8 案 |
| `app/ai-web-flow.cjs` | 新增（基準原樣複製）＋D15 修改 | ①`TEMPORARY_CHAT_PROVIDERS` 加 `anthropic` ②`temporaryWords` 加 incognito／無痕對話／無痕聊天／無痕模式 ③`temporaryCloseControl`／`isActive`／`confirmed` 支援 incognito ④anthropic `activeIndicator`：頁面須同時出現「incognito／無痕」與「won't appear／not saved／不會顯示…」才算無痕已啟用 ⑤Claude 帳號選單只有 `data-testid="user-menu-button"`、沒有 aria-label，`menuControl()` 補認 testid／`aria-haspopup=menu` ⑥`startNew` 改 `if(startNew&&!confirmed())`：已在無痕對話就不再重開，避免每回合多開新對話或誤觸關閉 ⑦`buildLoginGateScript('anthropic')` 認得 `claude.ai/login`、`accounts.google.com`、`appleid.apple.com`，並以輸入框判定已登入 ⑧找不到無痕入口回 `temporary-control-not-found`、未確認回 `temporary-chat-not-confirmed`（安全失敗，不靜默送入一般對話） | `p1-03-claude-temp-chat.test.js` 案 1–2、4–7 |
| `app/www/app.js` | 修改（D15） | ①`TEMPORARY_CHAT_WEB_PROVIDERS` 加 `anthropic` ②三處限制／錯誤文案改「Claude、ChatGPT 與 Gemini」③`renderOpeningSetup` 兩處提示同步 ④UI_EN 四組鍵同步改中文鍵＋英文翻譯 ⑤新增 `claudeAccountConfirmedThisRun`：每次 App 執行階段第一次使用 Claude 時，若使用者未在設定中明確勾選自動登入，先以 `confirm` 請本人確認目前登入的帳號或自行登入／切換；取消則本回合不送出 ⑥`login-required` 走 Claude 登入等待，不誤判一般對話 ⑦無痕失敗改用 `confirm` 詢問「只這一回合」降級；同意才設 `requiresTemporaryChat=false` 並提醒會進官網歷史，`applyTurn` 結尾清除一次性降級，下一回合重新要求無痕 ⑧`ensureTemporaryChat`／`setWebAutoFlow` 的 `startNew` 對 Claude 為 true（腳本內建已確認守門） ⑨狀態文案依 provider 顯示 Claude／Google 版本；設定頁新增 Claude 登入政策說明（3 處 note 同步） ⑩手動模式（自動送出關閉）遇 Claude 未登入時顯示登入提示、登入後再送一次，不誤問「降級一般對話」 | `p1-03-claude-temp-chat.test.js` 案 3、8＋全測回歸 |
| `app/electron-main.cjs` | 新增（唯讀基準複製）＋D15 修改 | ①`automationProviderPortBase()`：Claude 使用獨立除錯埠 4472（`CLAUDE_AUTOMATION_PORT_CLAUDE` 可覆寫），不接手其他 provider 的瀏覽器 ②`automationBrowserProfileDir('anthropic')`：Claude 使用獨立設定檔 `web-automation-browser-claude-v20`（`CLAUDE_AUTOMATION_PROFILE_CLAUDE` 可覆寫），不繼承舊 r24/r25 或其他 AI 的登入 ③`ensureAutomationBrowserFor(provider,url)`／`openAutomationTab(provider,url)`／`findAutomationProviderTab(...,provider)`／`isProviderLoginTabFor()` 全數泛化 ④`readGeminiLoginGate` → `readLoginGate(runner,provider)`；`activateWebAutoFlow` 與 watcher 對 anthropic 做登入等待 ⑤`ensureTemporaryChat` 在 Claude 登入頁回報 `login-required` ⑥watcher 的 `needs-login`／`needs-temporary-chat` 狀態帶 `provider` ⑦保留 `WEB_PASSWORD_HOSTS` 的 anthropic 與使用者 opt-in 自動登入：只有明確勾選 `autoLogin` 才預填／送出，預設不預填、不自動登入 | `p1-03-claude-temp-chat.test.js` 案 9＋Electron 煙測 |
| `app/tests/story/p1-03-llm-client.test.js` | 新增 | 8 案：①快取切分與逐字等價（含 C 帶／空區塊）②連續 30 輪格式穩定（含 markdown 圍欄）③格式重試 1–2 次＋修正指示＋固定前綴不變 ④重試用盡兜底（`affection_delta=0`、`isFallback`）⑤傳輸錯誤重試與 `maxRetries` 0–2 ⑥欄位級降級不重試（emotion／action／delta／flag）⑦無傳輸／空回覆兜底＋暱稱代入＋`state:null` 容錯 ⑧修正指示截斷 | `node --test` **8/8 PASS** |
| `app/tests/story/p1-03-claude-temp-chat.test.js` | 新增＋D15 擴充 | 10 案：①provider 清單、腳本語法、不支援網站安全失敗 ②VM：中／英文無痕提示才成功；只有入口字樣不得誤判；incognito 路徑可確認 ③app.js 清單／旗標／文案／英文翻譯、舊限制清零 ④找不到無痕入口維持安全失敗 ⑤Claude 帳號選單（只有 `user-menu-button`）可開啟並確認無痕 ⑥已在無痕時 `startNew` 不再重開 ⑦`claude.ai/login`、Google、Apple 驗證頁與一般對話頁辨識 ⑧使用者確認／opt-in 自動登入／無痕失敗只降級一回合 ⑨主進程專用設定檔＋獨立埠＋登入等待＋保留 opt-in 登入資料 ⑩修改面不含常見個人信箱痕跡 | **10/10 PASS** |
| `app/www/app.bundle.js` | 重建（建置產物，非手改） | 同一 esbuild 參數重建，**734,291 bytes**（上一輪 733,685／`286A916EEB1A8A06`；再前一版 724,013／`81C9B08B22826A12`；本次 `3121576F5E1810EB`） | 產物內聯驗證＋Electron 煙測 |

**測試**：全測 **58/58 PASS**（12 檔：P1-02 40 案＋P1-03 8 案＋D15 10 案）。等待圖 jsdom **22/22 PASS**（換圖後重跑；G44 相容 3/3 沿用 2026-11-07 紀錄，本次僅換素材未動 JS）。

**實機煙測 ok:true**（exit 0）：`#pmInspector` 六區塊鍵序、摘要 tokens、切 C 階段替換與好感帶皆與 P1-02 相同；零 `ConfigLoaderError`。**D15 真站端到端仍待使用者本人以 claude.ai 登入／確認一次**（本環境僅能靜態與 VM 模擬；無痕入口或官方文案改版時走安全失敗＋UI 提醒）。

**D15 登入政策（使用者拍板）**：Claude 使用獨立自動化設定檔，預設**不預填、不自動登入**；只有使用者在設定中明確儲存帳密並勾選「自動送出登入」才會自動登入。未啟用自動登入時，每個 App 執行階段第一次使用 Claude 先以 `confirm` 確認目前帳號或請使用者自行登入／切換；取消則本回合不送出。無痕失敗時以 `confirm` 詢問是否只這一回合改用一般對話；同意才降級並提醒會進官網歷史，下一回合重新要求無痕。全程不預設任何帳號，測試與紀錄不含帳號名稱／信箱。

**打包（temp 工具，非專案檔）**：`p1-02-package-run.cjs` 的 COPY 迴圈改為「`v2.0-modifications/app/<檔>` 存在則優先複製」，本次已確認 `mods override: ai-web-flow.cjs`、`mods override: electron-main.cjs`，D15 的 Claude 登入／無痕改動會進執行包。

修改面 SHA256（前 16 碼）：`app.js 191F5DB10FD4D1A3`、`ai-web-flow.cjs 8E002DB8C12F596A`、`electron-main.cjs 2F9180E56041B141`、`llm-client.js 3371C773752614AA`、`p1-03-llm-client.test.js 73E8E437A9BDEA59`、`p1-03-claude-temp-chat.test.js 4BCF34909F03DCE7`、`app.bundle.js 3121576F5E1810EB`。未動證明：`config-loader.js 74AC9D13AD34CA48`、`prompt-assembler.js 5BB10AA4D57F1F17`、`prompt-inspector.js 430A83B4EC287432`、`style.css 7E3FE2BB1EE03B72`、`extensions.json 0BF2DA5D06CB5178`、`schedule.json D8BC50879DB731F6`（與前段紀錄逐一相符）。

**範圍說明**：xlsx P1-03 是 S2 模組層（呼叫／解析／驗證／重試／兜底）；app 對 LLM 的實際協議仍是七選項（`narration／memory／choices[7]／...`），S2 五欄位協議只在模組層，未直接接進 app 以免破壞遊戲。D15 的 Claude 無痕自動化已接上既有官網流程（`ensureTemporaryChat`＋`ai-web-flow`），主回合仍走原本的七選項協議。

## 2026-11-08（36552 等待圖換圖＋背景書架加深）

| 檔案 | 動作 | 改了什麼／為什麼 | 如何測試 |
|---|---|---|---|
| `app/www/assets/g43-wait-writing.jpg`、`g44-writing.jpg` | 替換 | 36552 由「窗邊書庫寫字」換成「紅椅書庫寫字」新圖；兩檔是同檔副本（`g43-wait-writing`＝等待中介、`g44-writing`＝story busy 圖），同步替換避免兩條等待路徑顯示不同圖。依使用者指示把背景書架加深：強度 0.42、羽化 18px，只壓右上主書架、紅椅右側窄書架、桌邊書堆與右下邊緣；不動人物、白裙、紅椅與窗光。尺寸維持 1024×1536，檔名／用途不變，不挪作其他 CG | 等待圖 jsdom **22/22 PASS**；Electron 煙測 ok:true（六區塊、階段 C、零 ConfigLoaderError）；原圖／v1／v2／v3 目視比對後採 v2 |
| `app/www/assets/g43-wait-night.jpg` | 未動 | 36455 夜圖保留；`36455_1` 未單獨存在（＝36455 同檔，P0-01 已載明）。夜間等待依 D6 仍走日圖（`wait-interlude.js` 的 `ART.night=null`），所以夜間會顯示新版 36552；要換成另一張夜圖只改 `ART.night` 一行（素材仍在 assets） | 靜態檢查 |

**換圖來源與處理**：使用者附圖為 1024×1536 PNG（2,514,700 bytes，SHA256 `F8DE3CB9…F7C4D035`）；本機以 Electron `nativeImage` 轉 JPEG（quality 92），再以 Canvas 做書架局部加深；最終 JPEG 434,141 bytes、SHA256 `F53ECBCCDF2F4AD2…A1BFF627F97`。全程未上傳、未留帳號或信箱。

## 2026-11-08（P1-04 執行：提示詞界線【界線｜優先於人設】強制啟用）

| 檔案 | 動作 | 改了什麼／為什麼 | 如何測試 |
|---|---|---|---|
| `app/www/character-profile.js` | 修改 | 新增 `CHARACTER_BOUNDARY_SECTION`：逐字等於 `HIGH_TSUNDERE_CHARACTER_PROFILE` 內【界線｜優先於人設】段落（168 字，含「不能變成貶低、羞辱、冷暴力、情感操控或強迫」「使用者有最後決定權」）。新增 `withCharacterBoundary(profile)`：trim、空值回傳界線、已含標題不重複、否則空行附加。`HIGH_TSUNDERE_CHARACTER_PROFILE` 與 B5–B9、LEGACY 快照全部未動 | p1-04 案1–2 |
| `app/www/app.js` | 修改 | 匯入 `withCharacterBoundary`；`buildWebPrompt` 先組 `profileBase`（標準／自訂＋傲嬌註記），再強制附加界線後才接角色卡；`callAI` 的 `apiProfileBase` 同法處理，標準預設由「送空字串讓 server 補精簡人設」改為「送 `COMPACT_DEFAULT_CHARACTER_PROMPT`＋界線」（內容等價）。節省模式、網頁、API 全部涵蓋；`promptTweaks` 只能關寫作風格，關不掉界線 | p1-04 案4＋全測回歸 |
| `app/www/prompt-assembler.js` | 修改 | 匯入 `withCharacterBoundary`；`assemblePromptBlocks()` 的 `character` 區塊改為 `withCharacterBoundary(characterConfig.basePrompt)`，來源標註「＋界線｜優先於人設」。六區塊鍵序與 `assemblePrompt()` 串接方式不變 | p1-04 案3＋P1-02 案1–6 |
| `app/www/prompt-rules.js` | 修改 | 英文 `tone` 的舊 D13 禁令（`never use possessiveness, guilt, or emotional pressure`）退場，改為：禁貶低／羞辱／冷暴力（含冷落）／情感操控／強迫；占有、排他、愧疚可作為情感色彩，玩家有最後決定權。中文 `tone` 未動 | p1-04 案5＋P0-04 D13 回歸 |
| `app/tests/story/p1-04-character-boundary.test.js` | 新增 | 5 案：①界線常數與高傲嬌版該段逐字相同、只一份 ②helper 空值／冪等／已含標題／自訂人設保留 ③PromptAssembler 六區塊鍵序不變、人設區塊含界線一次、完整提示詞含原文 ④app.js 網頁＋API 接線契約、`PROMPT_TWEAK_KEYS` 不含界線 ⑤英文 tone 舊禁令歸零＋新規則存在 | **5/5 PASS** |
| `app/www/app.bundle.js` | 重建（建置產物，非手改） | 同一 esbuild 參數重建，**735,636 bytes**（上一輪 734,291／`3121576F5E1810EB`；本次 `F98BC3ABF09710FF`） | 產物內聯驗證＋Electron 煙測 |

**測試**：全測 **63/63 PASS**（13 檔：既有 58 案＋P1-04 5 案）。新測試單跑 5/5 PASS。

**實機煙測 ok:true**：`#pmInspector` 六區塊鍵序不變、摘要 tokens、切 C 階段替換與好感帶正常；新增檢查 `characterHasBoundary:true`、`characterBoundaryCount:1`（人設區塊只一份界線）；零 `ConfigLoaderError`。

**界線落點**：網頁提示詞（含節省模式與自訂人設）、API `characterProfile`、S2 `PromptAssembler` 人設區塊三條路徑都以同一段文字強制附加；`promptTweaks` 與區塊開關只影響寫作風格／檢視預覽，不影響界線。`HIGH_TSUNDERE` 本體與 LEGACY 快照未動，舊存檔遷移比對不受影響。

修改面 SHA256（前 16 碼）：`character-profile.js 955BD4C6092F4698`、`app.js BAE46C2E7D886A02`、`prompt-assembler.js 8EBE1FAA90953003`、`prompt-rules.js CB35FE766803CC0F`、`p1-04-character-boundary.test.js 28B6359F4C278630`、`app.bundle.js F98BC3ABF09710FF`。未動證明：`config-loader.js 74AC9D13AD34CA48`、`prompt-inspector.js 430A83B4EC287432`、`style.css 7E3FE2BB1EE03B72`、`extensions.json 0BF2DA5D06CB5178`、`schedule.json D8BC50879DB731F6`（與前段紀錄相符）。PII 掃描（信箱／使用者路徑）0 處。

## 2026-11-09（套用附件新計畫：等待中介畫面 夜圖恢復＋日圖替換）

使用者指示：`v2.0-modifications-wait-interlude.zip` 即新計畫，照附件執行。實際套用範圍與現行專案的相容處理如下。

| 檔案 | 動作 | 改了什麼／為什麼 | 如何測試 |
|---|---|---|---|
| `app/www/wait-interlude.js` | 替換（附件原檔） | 以附件版取代現行 D6 版：`ART.night` 由 `null` 恢復為 `g43-wait-night.jpg`（landscape），夜間等待重新顯示 36455 夜圖；日間 alt 文字同步為附件版。其餘邏輯與現行相同 | 附件自帶 22 項 jsdom **22/22 PASS**；G44／夜圖檢查 **6/6 PASS** |
| `app/www/assets/g43-wait-writing.jpg`、`g44-writing.jpg` | 替換（附件日圖＋同檔副本） | 以附件日圖（388,972 bytes）取代現行 v2 書架加深版（434,141 bytes）；`g43-wait-writing`＝等待中介、`g44-writing`＝story busy，兩檔同步替換避免兩條等待路徑顯示不同圖。檔名／用途不變，仍為 1024×1536、不挪作其他 CG。原 v2 兩檔已備份於 temp | 附件測試案 4；Electron 煙測 |
| `tests/wait-interlude.test.cjs` | 替換（附件原檔） | 測試第 4 案恢復「夜間使用 `g43-wait-night.jpg`＋landscape」，與附件 JS 配對；其餘 21 案不變 | `node tests/wait-interlude.test.cjs` **22/22 PASS** |
| `app/www/wait-interlude.css` | 保留現行合併版（附件 CSS＋G44 規則） | 附件 CSS 沒有 G44 共存規則；目前 app.js 仍會產生 `#choices .story-busy-art`，直接覆蓋會讓忙碌圖與中介畫面同時出現。故保留現行檔：內容＝附件 CSS＋`#tab-story:has(.wait-interlude.is-visible) #choices .story-busy-art{display:none}` | G44 檢查案 6；CSS 靜態檢查 |
| `app/www/index.html`、`app/www/assets/g43-wait-night.jpg` | 未動 | 附件 index.html 與現行 byte-equal（`48E57518…2FA16E80DB`）；附件夜圖與現行 byte-equal（`F7C4B853…79D5806`） | SHA256 比對 |
| `tests/wait-interlude-測試紀錄-20261109.txt`、`tests/wait-interlude-g44相容檢查-20261109.txt` | 新增 | 本次實際輸出證據；舊的 2026-11-07 紀錄保留不動，供歷史對照 | 見檔 |
| `CHANGES.md` | 修改 | 本節：附件套用範圍、與現行差異、G44 保留原因、測試與 SHA | — |

**測試**：附件自帶 jsdom **22/22 PASS**；G44／夜圖檢查 **6/6 PASS**；現有 13 檔完整測試 **63/63 PASS**；Electron 煙測 **ok:true**（exit 0，六區塊、階段 C、零 `ConfigLoaderError`）。

**與現行版本的差異（重要）**：
- 夜間等待由 D6 的「沿用日圖」改回附件新計畫的「使用 36455 夜圖」；若之後要把 36455 留給晚安 CG，改回 `ART.night=null` 即可。
- 日圖由 v2 書架加深版換回附件版；v2 的 `g43-wait-writing.jpg`／`g44-writing.jpg` 已備份在 `%TEMP%\opencode\backup-wait-interlude-20261109\app\www\assets\`，可還原。
- CSS 未直接用附件原檔，而是保留「附件＋G44 規則」的合併版，避免目前 app.js 的 `story-busy-art` 與中介畫面重疊。
- `app/www/app.js`、`app/www/app.bundle.js`、`app/www/style.css` 未動；等待中介是獨立 module，index.html 直接載入，無需重建 bundle。
- 附件的 `CHANGES.md`／`SHA256.txt` 是獨立包文件，本專案 `CHANGES.md` 為累積總錄，故不覆蓋；實際套用後的 SHA 記在本節與 `SHA256-wait-interlude-套用附件-20261109.txt`。

**套用後 SHA256**：
- `app/www/wait-interlude.js`：`31EBF8F580214E076AB94FBF8D8ABB6C5E5FC0787CEF83D31AC9D1F2514298FD`（＝附件）
- `app/www/wait-interlude.css`：`4FBD3AEBE9CBBD800D78069F248B1D5BD353BC82512C0BF750A057B55C7983AE`（附件＋G44 規則）
- `app/www/assets/g43-wait-writing.jpg`、`g44-writing.jpg`：`C787A498B189922B3D41B4DB577BEC7615A481B6BEEE5B4AAC22E9AE9E90357D`（＝附件）
- `app/www/assets/g43-wait-night.jpg`：`F7C4B8534E3F19369B80C4325A8B3B308554B80949693A9F321E90BBB79D5806`（未動）
- `app/www/index.html`：`48E57518EC7521A423B4D352655DE27B6F42C8341499D97C77819D2FA16E80DB`（未動）
- `tests/wait-interlude.test.cjs`：`3913F508C8EEA8C452D52C807AD6DF8E778BEF6A2A201F380924475E7D1879AF`（＝附件）
PII 掃描 0 處。

## 2026-11-09（P1-05 執行：玩家低落／危險時觸發界線）

依使用者確認的方向：危險（自傷／輕生）由本機硬攔截並顯示安全回應；低落則不攔截，於 AI 提示詞加入陪伴段；AI 生成管線同時常駐「安全轉接」段，讓 AI 自行判斷並轉接。危機範圍維持現有 14 詞，不擴大到家暴、進食障礙等其他主題。

| 檔案 | 動作 | 改了什麼／為什麼 | 如何測試 |
|---|---|---|---|
| `app/www/config/crisis.json` | 修改 | 新增 `lowMoodKeywords` 40 條（以第一人稱與強烈措辭為主，避免一般劇情句）與 `safetyResponseTemplateEn`（英文危機回應，含 1925／1995／1980）；原有 14 個危機詞、3 支熱線與中文模板不動 | P1-05 案1–3、5；`validateConfigs()` |
| `app/www/config-loader.js` | 修改（M0 三件套） | `crisis.json` schema 的 `required` 加入 `lowMoodKeywords`、`safetyResponseTemplateEn`；nested 檢查危機詞至少 14、低落詞至少 20、三支熱線齊全、中英文模板都含三支熱線 | P1-05 案1；config-loader 既有測試 |
| `app/www/safety-module.js` | 修改 | 新增 `detectLowMood()`、`classifyPlayerInput()`（危機優先）、`withSafetyPromptSupport()`（冪等附加）、常駐安全段與低落陪伴段；`generateSafetyResponse(language)` 支援中英文；原有勿擾時段、主動說話與首次啟動說明不動 | P1-05 案2–9；模組直接載入 |
| `app/www/app.js` | 修改 | 匯入並建立 `safetyModule` 單例；`continueStory`（第一層）、`beginWebTurn`（第二層）、`prepareWebPrompt`（第三層）危機攔截；新增 `showCrisisSafetyResponse()`——只寫入一則 `{role:'ai',kind:'safety'}`、不呼叫 `applyTurn`、不保存玩家原句、不設待辦回合；`buildWebPrompt` 與 `callAI` 的 `apiProfile` 都接 `withSafetyPromptSupport()` | P1-05 案10–12；P1-01 esbuild 語法；Electron 煙測 |
| `app/www/app.bundle.js` | 重建（建置產物，非手改） | 同一 esbuild 參數重建，**745,487 bytes**（前版 735,636／`F98BC3ABF09710FF`；本次 `B144024C90009C53`）；產物含 `lowMoodKeywords`、`safetyResponseTemplateEn`、`1925` | 產物關鍵字檢查＋Electron 煙測 |
| `app/tests/story/p1-05-player-safety.test.js` | 新增 | 12 案：config/schema、14 危機詞、40 低落詞、危機優先、中英文安全回應、提示詞冪等與內容、界線後附加、低落詞不重複、三個攔截點、`showCrisisSafetyResponse` 靜態與沙盒實際執行 | `node --test` **12/12 PASS** |
| `tests/p1-05-安全界線測試紀錄-20261109.txt` | 新增 | 本次實際輸出證據 | 見檔 |
| `SHA256-P1-05-20261109.txt` | 新增 | 本節修改面 SHA manifest | 逐檔核對 0 mismatches |
| `CHANGES.md` | 修改 | 本節 | — |

**測試**：P1-05 新測 **12/12 PASS**；14 檔完整測試 **75/75 PASS**；等待圖 jsdom **22/22 PASS**；Electron 煙測 **ok:true**（exit 0，六區塊、階段 C、零 `ConfigLoaderError`）；bundle 內含安全設定與 `1925`。

**行為**：
- 危險（現有 14 個危機詞）：不送 API／不開官網／不複製提示詞；本機顯示安全回應與熱線，不扣好感、不推進時鐘、不消耗回合；玩家可按原選項或自由輸入繼續。
- 低落（40 個詞）：不攔截、不暫停；正常送 AI，提示詞附加「先接住情緒」段落，劇情與好感照常。
- 常駐安全段：要求 AI 自行偵測自傷／輕生／想消失等委婉說法，放下傲嬌、危機時 `affectionDelta` 為 0、不拿關係進度施壓；不受 `promptTweaks` 關閉，節省模式也保留。
- 隱私：危機時不把玩家原句寫入歷史，只留安全回覆；因此下一回合 AI 不會重複引用危機原句。
- 第三層攔截在 `busy` 期間以 `setTimeout` 延後顯示，避免切換網站時的全量重繪蓋掉進行中的畫面。

**修改面 SHA256**：
- `app/www/config/crisis.json`：`6914466F33331688E7C43699FF875DFCF6AADAAD4C12442A8402CDB933678BF5`
- `app/www/config-loader.js`：`4C8D711E9E8364AC79B2970FC7BE031AE60FC6640C61E47A526CF491AD2F3473`
- `app/www/safety-module.js`：`F84368770C05B7B82699C99FFFFDA45B86A22867446744F442A97E804E111585`
- `app/www/app.js`：`DD2BDC065DC828137923576C65BC4AC65A446AC2558C17E9653597A2A8BE9A0B`
- `app/www/app.bundle.js`：`B144024C90009C53CFE82D1EADAD0ACA8382853AC0DBC312C48295702CF2048F`
- `app/tests/story/p1-05-player-safety.test.js`：`F075918FAA9CAB73724CFB5E4AD1016A8F1E13FEF88691B724AE70C1C945DC66`
- `tests/p1-05-安全界線測試紀錄-20261109.txt`：`5C496CFF54426A55CA67D57D236F0078172113B5294FB503E78953159E523575`
- `CHANGES.md`：於本節寫入後另行列入 `SHA256-P1-05-20261109.txt`。

PII 掃描 0 處。

## 2026-11-09（等待圖統一；36455 為夜間事件 CG，非廢案）

依使用者指示：等待中介一律使用附件圖（與 `g43-wait-writing.jpg` byte-equal，1024×1536）。舊「36552 日圖／36455_1 夜圖」配對不再使用，夜間等待圖 `g43-wait-night.jpg`（36455_1 變體）自專案移除。**36455 本體不是廢案**：它是 P2-11 的夜間事件 CG（夜間臥室、羽毛筆指向畫面），保留給 v5 Step 1 入庫與夜間事件使用；本次未刪除、未改用途，也沒有把它當成等待圖。

| 檔案 | 動作 | 改了什麼／為什麼 | 如何測試 |
|---|---|---|---|
| `app/www/wait-interlude.js` | 修改 | `ART.night` 設為 `null`，日夜共用 `g43-wait-writing.jpg` 與同一組動作描寫；註解明確區分 36455（夜間事件 CG）與 36455_1（舊夜間等待圖） | 等待圖測試 25/25 |
| `app/www/wait-interlude.css` | 修改 | 移除 landscape 專用規則（夜間等待圖已不使用）；保留 portrait 版型與 G44 共存規則 | 25/25＋G44 6/6 |
| `app/www/assets/g43-wait-night.jpg` | 刪除（36455_1 等待圖變體） | 不再被任何程式引用；備份於 `%TEMP%\opencode\backup-wait-uniform-20261109`。36455 本體不在 assets，未受影響 | 測試確認檔案不存在 |
| `app/www/assets/g43-wait-writing.jpg` | 不動 | 附件圖 byte-equal（SHA `C787A498…`）；G44 `g44-writing.jpg` 亦為同檔，維持一致 | 測試比對 SHA |
| `tests/wait-interlude.test.cjs` | 修改 | 夜間改驗同一張圖、portrait/day 版型；新增「不再使用夜間等待圖變體」「`g43-wait-night.jpg` 已移除」「附件 SHA 相符」3 案 | `node tests/wait-interlude.test.cjs` **25/25 PASS** |
| `tests/wait-interlude-統一圖測試紀錄-20261109.txt` | 新增 | 本次實際輸出證據 | 見檔 |
| `SHA256-WAIT-UNIFORM-20261109.txt` | 新增 | 本節修改面 SHA manifest | 逐檔核對 |
| `CHANGES.md` | 修改 | 本節 | — |

**測試**：等待圖 **25/25 PASS**；G44 共存 **6/6 PASS**；完整故事回歸 **75/75 PASS**；Electron 煙測 **ok:true**（exit 0）。`app.bundle.js` 未重建，因為 `wait-interlude.js` 是 `index.html` 獨立載入的模組，不在 bundle 內。

**行為**：
- 日間與夜間等待都顯示同一張 `g43-wait-writing.jpg`，版型固定 portrait；不再有 landscape 夜圖。
- 動作描寫統一使用日間組（寫字、翻頁、別髮、紅茶），避免夜間文字與新圖不符。
- G44 忙碌圖 `g44-writing.jpg` 與等待圖同檔，交接不破綻；CSS 的 `#tab-story:has(.wait-interlude.is-visible) #choices .story-busy-art{display:none}` 保留。
- 36455 仍是 P2-11 的夜間事件 CG，v5 Step 1 會依 xlsx 計畫處理；本次只移除等待圖用的 36455_1 變體。

**修改面 SHA256**：
- `app/www/wait-interlude.js`：`71F9D61B4173559875906E91A891DFC2933340CB90357A6393ECAD64D81CA222`
- `app/www/wait-interlude.css`：`F81813F9A7087E49575E608A7CB95E92C722D055F67F5968B05C9EAC9E3C83F1`
- `tests/wait-interlude.test.cjs`：`38A2618CBAB710B629EF75840DF4AE003409EB7CD77331AE5CBE66C4CE94106F`
- `app/www/assets/g43-wait-writing.jpg`（未變更，引用資產）：`C787A498B189922B3D41B4DB577BEC7615A481B6BEEE5B4AAC22E9AE9E90357D`
- `CHANGES.md`：於本節寫入後列入 `SHA256-WAIT-UNIFORM-20261109.txt`。

## 2026-11-09（v5 美術 Step 1：資產入庫＋config）

依據《v5 美術 Step 1＋Step 2 接續計畫書》與《立繪畫面用途規劃_v5.xlsx》，完成 Step 1 資產入庫與設定檔補齊。補齊 36455 缺檔，複製 7 張可用立繪／CG 進 assets，更新 art_distribution.json（23 筆 entries），擴充 config-loader schema，新增自動化測試並以 esbuild 重建 app.bundle.js。36623–36625（含簡體字／水印／對話框）不入庫（file:null，usable:false）。

| 檔案 | 動作 | 改了什麼／為什麼 | 如何測試 |
|---|---|---|---|
| `app/www/assets/g43-cg-bed-goodnight.jpg` | 新增 | 複製 `36455.jpg`（189,076B），補齊 P2-11 晚安事件 CG 缺檔 | SHA256 比對一致（`F7C4B853…`） |
| `app/www/assets/g43-cg-rose.jpg` | 新增 | 複製 `36621_0.jpg`；entries 註記黑底需去背、不可自動使用 | SHA256 比對一致 |
| `app/www/assets/g43-cg-lakeside.jpg` | 新增 | 複製 `36622_0.jpg`；直式 9:16，待 Step 2 前景完整＋背景模糊版型 | SHA256 比對一致 |
| `app/www/assets/g43-extra-casual.jpg` | 新增 | 複製 `36626_0.jpg`；特典便服，不進主線 | SHA256 比對一致 |
| `app/www/assets/g43-cg-cheek-pinch.jpg` | 新增 | 複製 `36627_0.jpg`；觸碰反應（捏臉） | SHA256 比對一致 |
| `app/www/assets/g43-cg-goodnight-reading.jpg` | 新增 | 複製 `36628_0.jpg`；晚安 CG 候選（含蓄版） | SHA256 比對一致 |
| `app/www/assets/g43-cg-goodnight-nightgown.jpg` | 新增 | 複製 `36629_0.jpg`；晚安 CG 候選（預設不用） | SHA256 比對一致 |
| `app/www/assets/g43-cg-ending-halo.jpg` | 新增 | 複製 `36632.jpg`；終章／結局 CG 候選 | SHA256 比對一致 |
| `app/www/config/art_distribution.json` | 修改 | 補 10 筆 entries（36621、36622、36626、36627、36628、36629、36632，及 36623–36625 標記不使用） | v5-art-step1 案 1 |
| `app/www/config-loader.js` | 修改 | schema 補 10 筆檢查、36455 檔案存在、file:null 合法、level/timeGroup 值域 | v5-art-step1 案 5 |
| `app/tests/story/v5-art-step1.test.js` | 新增 | 5 案：entries 數量＝23、36455 尺寸相符、可用圖片 SHA 相符、不使用圖不進 assets、schema 負向測試 | `node --test` **5/5 PASS** |
| `app/www/app.bundle.js` | 重建（建置產物） | esbuild 重建（751,814 bytes），內聯新 config 資料 | 產物包含新 entries、Electron 煙測 |
| `tests/v5-art-步驟1測試紀錄-20261109.txt` | 新增 | 本次測試輸出證據 | 見檔 |
| `SHA256-V5-ART-STEP1-20261109.txt` | 新增 | Step 1 修改面 SHA manifest | 逐檔核對 |
| `CHANGES.md` | 修改 | 本節 | — |

**測試**：v5-art-step1 **5/5 PASS**；完整 15 檔故事回歸 **80/80 PASS**；等待圖 **25/25 PASS**；Electron 煙測 **ok:true**（exit 0，六區塊、階段 C、零 `ConfigLoaderError`）。

**修改面 SHA256**：
- `app/www/assets/g43-cg-bed-goodnight.jpg`：`F7C4B8534E3F19369B80C4325A8B3B308554B80949693A9F321E90BBB79D5806`
- `app/www/assets/g43-cg-rose.jpg`：`0C35456D06C08EBCA3C75D2B09B39C283D4384766B49A1547D2C40353B5CBCBE`
- `app/www/assets/g43-cg-lakeside.jpg`：`00DED999083BD7BF0AACFDA15A8DCECD1BB27C61DECC4B77025D34557DE6B8C8`
- `app/www/assets/g43-extra-casual.jpg`：`63C6FCDF36ECBB108CFCEACC775DEB7B50EA320BEDDE2F4F886396F6D1C93FAA`
- `app/www/assets/g43-cg-cheek-pinch.jpg`：`A63463DED4307DEDB9E91FB31FFB5FD64D5FB6A26F08834AD0E0E0B637F4E290`
- `app/www/assets/g43-cg-goodnight-reading.jpg`：`556D39F515AC377D4A39AB654646506360071A74BF5A780B32D72D7F1882B75B`
- `app/www/assets/g43-cg-goodnight-nightgown.jpg`：`F36D54DB73D417A9DDD47F1EC15DC97893511ABA42EA41F34FFA588CD59DFBE0`
- `app/www/assets/g43-cg-ending-halo.jpg`：`DE3AC059C8D92EEBD9DB96F9991C7140A9D56AB6793FE550751681DCCDEF7769`
- `app/www/config/art_distribution.json`：`49337C0A302EA0B964798825331A3A7E67DE2C8E98E90117029A813111184B1E`
- `app/www/config-loader.js`：`7DDBF8130649A7784458793FF184281E87520A3E12BC4408DF83854C9621BE34`
- `app/tests/story/v5-art-step1.test.js`：`6DA8E67F3B76A0958D79DD84EE152B6C4908949FD178AB44CCF88A814EAE075C`
- `app/www/app.bundle.js`：`18067748551A2480E7DF2845F53E44B15E380929544E40A470941CBB127F1759`
- `tests/v5-art-步驟1測試紀錄-20261109.txt`：`71C5620888EEED4184F557E80D788E2020D954EC9258F13BD1F9DF0C91FB1951`
- `CHANGES.md`：於本節寫入後列入 `SHA256-V5-ART-STEP1-20261109.txt`。

## 2026-11-09（P1-06 執行：逐句演出引擎＋表情標籤擴充）

借鏡 AnimaVN（JayziLi/AnimaVN）`jev.js` / `player.ts` 的 Galgame 逐句推進設計，解決傳統 LLM 一次性輸出整堵文字（wall of text）的視覺疲勞問題，並擴充情緒標籤白名單（+worried/tender）。

| 檔案 | 動作 | 改了什麼／為什麼 | 如何測試 |
|---|---|---|---|
| `app/www/line-split.js` | 新增 | CJK 標點斷句、連續標點（……／！？）聚合、成對引號（「」『』""）與動作括號（（））內部保護不切斷人物台詞 | `line-split.test.js` 7 案 |
| `app/www/line-runner.js` | 新增 | 逐句演出控制器：打字機推進、點擊插話／快進當前句、播放狀態回呼解鎖、偏好開關持久化 | `line-runner.test.js` 3 案 |
| `app/www/story-emotion.js` | 修改 | 白名單擴充 `worried`（擔憂／心疼／焦慮）與 `tender`（溫柔／眷戀／柔和）；別名規範化映射 | `story-emotion.test.js` 5 案 |
| `app/www/app.js` | 修改 | ①import 拆句器與控制器 ②`applyTurn` 在新 AI 回合呼叫 `storyLineRunner.start(lines)` ③`render()` 配合播放狀態動態更新文字與指示器 ④點擊 `#dialogueText` 支援快進／下一句 ⑤鍵盤空白／Enter 推進、數字鍵快進全篇 | 整合測試＋實機煙測 |
| `app/www/style.css` | 修改 | 檔尾追加 `.dialogue-line-indicator` 箭頭呼吸動畫、`.is-line-playing` 游標反饋、`.choices-waiting` 選項防誤觸樣式 | 視覺檢驗 |
| `app/tests/story/line-split.test.js` | 新增 | 7 案：邊界容錯、基礎斷句、連續標點、引號保護、括號描寫、換行、連續對話 | `node --test` **7/7 PASS** |
| `app/tests/story/line-runner.test.js` | 新增 | 3 案：禁用直出、逐句打字與快進、skipAll 瞬間完成 | `node --test` **3/3 PASS** |
| `app/tests/story/story-emotion.test.js` | 新增 | 5 案：白名單擴充、別名映射、未知回退、強度 clamp | `node --test` **5/5 PASS** |
| `app/www/app.bundle.js` | 重建（建置產物） | esbuild 重建（757,015 bytes），內聯新模組 | 產物語法驗證＋Electron 煙測 |
| `tests/p1-06-逐句演出測試紀錄-20261109.txt` | 新增 | 本次測試輸出證據（15 案全 PASS） | 見檔 |
| `SHA256-P1-06-20261109.txt` | 新增 | P1-06 修改面 SHA manifest | 逐檔核對 |
| `CHANGES.md` | 修改 | 本節 | — |

**測試**：P1-06 新增 15 案 **15/15 PASS**；完整 18 檔故事回歸 **95/95 PASS**；等待圖 **25/25 PASS**；Electron 煙測 **ok:true**（exit 0，六區塊、階段 C、零 `ConfigLoaderError`）。

**修改面 SHA256**：
- `app/www/line-split.js`：`24040E33CCD4CFD924D52F64C36602C6BF03638BF8D633792AFCF9DC38AE9BE9`
- `app/www/line-runner.js`：`84BE6E758693092C6A2E1FC6EC55FFD33DC673714868880709165BD2A313B5CD`
- `app/www/story-emotion.js`：`921CD0FAA12E73358ABFFF2AD5C57BC15B74024FFAB73C7339EAE95D7D0B9F2D`
- `app/www/style.css`：`8B20FC252A6BF598C6A0CCEA7DCC06E1AFCABC2247463CF7D1899941CA580E5A`
- `app/www/app.js`：`C9F8A73E2B09D4B47A5111078EF3180D4E6D2800D37398F967284D60DEE2E536`
- `app/www/app.bundle.js`：`57F0E09B5E55715E2F71F96E6B229F81402524F07D5EFB29110A9C8D9C56A9AB`
- `app/tests/story/line-split.test.js`：`1D5AFE2EA823F74DB7D80A8860F0F80AC368989373B7DA1D96D01AC06CB5A403`
- `app/tests/story/line-runner.test.js`：`999D349445628DBA9091068B787833254703905871B8429CE4883269A92140EE`
- `app/tests/story/story-emotion.test.js`：`CBFD788B800999C1699609CF4E54D547BD62BD13C5DD9541EFE41AB97C52A9E3`
- `tests/p1-06-逐句演出測試紀錄-20261109.txt`：`41865539BF4F4586D00B70F53C8154A16780ED5EDCA816D47811CC2B44D5E3CD`
- `CHANGES.md`：於本節寫入後列入 `SHA256-P1-06-20261109.txt`。

---

## 2026-11-09（V5-S2 美術接線版型＋D16~D20 決策落地整合）

依據用戶決策（D16–D20）與 AnimaVN 引擎技術借鏡，完成美術第二步接線、直式模糊背景版型、純 JS 情緒語意 Fallback、BGM 佔位及介面設定整合。

| 檔案 | 動作 | 改了什麼／為什麼 | 如何測試 |
|---|---|---|---|
| `app/www/config/art_distribution.json` | 修改 | D16：36455 設為晚安主 CG（橫式 16:9 矮橫條）；36628 改為夜間聊天 CG（直式 portrait，blurBg: true，與 36455 皆可用）；36627（捏臉）、36622（湖畔）標記 portrait 與 blurBg | `v5-art-step2.test.js` 5 案 |
| `app/www/config/events.json` | 修改 | `dailyEvents` 擴充 `night_chat_reading`（36628）、`cheek_pinch`（36627）、`lakeside_sunset`（36622） | `v5-art-step2.test.js` 5 案 |
| `app/www/config/scenePacks.json` | 新增 | D18：BGM 與場景包佔位檔（預設關閉，待用戶提供素材後啟用） | `config-loader.test.js` / `v5-art-step2.test.js` |
| `app/www/config-loader.js` | 修改 | 匯出 `loadScenePacks` 與 `validateScenePacks`，不污染核心 15 份設定檔架構 | `config-loader.test.js` |
| `app/www/story-engine.js` | 修改 | `triggerGoodnightEvent` 支援 36455 與 36628 偏好；新增 `triggerNightChatEvent`、`triggerCheekPinchEvent`、`triggerLakesideEvent` | `v5-art-step2.test.js` |
| `app/www/style.css` | 修改 | 追加 `.bundled-story-cg[data-ratio="portrait"]`、`#tab-story.has-portrait-cg::before` 模糊背景層、36455/36628 專屬橫條、以及設定面板群組排版 | 視覺檢驗＋測試驗證 |
| `app/www/emotion-fallback.js` | 新增 | D19：純 JS 情緒語意 Fallback 模組（借鏡 AnimaVN matcher，零外部依賴，比對台詞文本特徵映射至 10 大白名單情緒） | `emotion-fallback.test.js` 3 案 |
| `app/www/story-emotion.js` | 修改 | 匯出 `EMOTION_WHITELIST` 與 `normalizeEmotion` 別名 | `emotion-fallback.test.js` |
| `app/www/line-runner.js` | 修改 | D17：新增 `loadSpeedPreference` / `saveSpeedPreference`，預設 35ms/字，clamp 10~200ms | `vn-settings-integration.test.js` 3 案 |
| `app/www/app.js` | 修改 | 設定頁面整合 `ensureVnPerformanceControls()`：逐句開關與速度滑桿、晚安 CG 偏好下拉選單（D16）、v2.1 語音合成預留開關（D20） | `vn-settings-integration.test.js` |
| `app/tests/story/v5-art-step2.test.js` | 新增 | 5 案：36455/36628 角色與比例標記、晚安冷卻與雙路徑觸發、捏臉/湖畔事件、CSS 規則、scenePacks 驗證 | `node --test` **5/5 PASS** |
| `app/tests/story/emotion-fallback.test.js` | 新增 | 3 案：空值容錯、經典對白特徵語意匹配、合法優先未知 fallback | `node --test` **3/3 PASS** |
| `app/tests/story/vn-settings-integration.test.js` | 新增 | 3 案：app.js 設定群組結構、LineRunner 速度持久化、style.css 設定美化 | `node --test` **3/3 PASS** |
| `app/www/app.bundle.js` | 重建 | esbuild 重建（761,349 bytes），打包新模組 | 語法驗證＋Electron 煙測 |
| `P0-決策點-D1-D12-紀錄.md` | 修改 | 追加 D16–D20 第三波決策紀錄 | — |

**測試成果**：全案 21 個測試檔案、**106/106 PASS**；Electron 實機煙測 **ok:true**；PII 掃描 **0 hits**。

---

## 2026-11-09（V5-S2 美術 Step 2：app 實際接線）

接續 V5-S2 模組層（D16~D20），把 v5 新圖與事件旗標接進實際 app 流程：`app.js` 提示詞 → `story-events.js` 核准 → `story-art.js` 渲染。

| 檔案 | 動作 | 重點 | 測試 |
|---|---|---|---|
| `app/www/story-events.js` | 修改 | 新增 `goodnight`／`night_chat_reading`／`cheek_pinch`／`lakeside_sunset` 四個旗標；`goodnight` 限夜間、好感 75 以上、每 7 個故事日一次（`GOODNIGHT_COOLDOWN_DAYS=7`）；`night_chat_reading` 限夜間、好感 50 以上；`cheek_pinch` 限日間；`lakeside_sunset` 好感 50 以上且一次性 | `v5-art-step2.test.js` |
| `app/www/story-art.js` | 修改 | `cgEvents` 補 36455（`g43-cg-bed-goodnight.jpg`）、36628（`g43-cg-goodnight-reading.jpg`）、36627（`g43-cg-cheek-pinch.jpg`）、36622（`g43-cg-lakeside.jpg`）；`goodnight` 依玩家設定（`claude_novel_goodnight_cg_pref_v1`）選 36455／36628／隨機；`showCg` 設定 `data-ratio`、`has-portrait-cg`、`--cg-bg-url`，`finishCg` 清除 | 同上 |
| `app/www/app.js` | 修改 | 中英文提示詞 eventFlag 枚舉補四個新旗標與條件；`approveStoryEvent` 呼叫帶入 `day`／`lastGoodnightDay`；核准 `goodnight` 後更新 `state.goodnightDay`；state 預設、存檔正規化、遷移、回退快照都補 `goodnightDay` | 同上／`p1-01` |
| `app/tests/story/v5-art-step2.test.js` | 修改 | 由 5 案擴充為 8 案：新增事件閘門、CG 對照與版型、app.js 提示詞與狀態接線、7 夜冷卻 | `node --test` **8/8 PASS** |
| `app/www/app.bundle.js` | 重建 | esbuild 重建（763,313 bytes） | Electron 煙測 **ok:true** |
| `tests/v5-art-step2-app接線測試紀錄-20261109.txt` | 新增 | Step 2 app 接線 8 案 TAP 證據 | 8/8 PASS |
| `tests/v5-s2-full-regression-20261109.txt` | 新增 | 21 檔完整回歸 TAP 證據 | 109/109 PASS |
| `SHA256-V5-ART-STEP2-20261109.txt` | 新增 | Step 2 修改面 SHA manifest | 見檔 |

**測試**：`v5-art-step2.test.js` **8/8 PASS**；完整 21 檔故事回歸 **109/109 PASS**；Electron 煙測 **ok:true**；PII／簡體掃描 **0**。

**設計說明**：
- 36455 晚安主 CG 為 16:9，使用底部矮橫條（`data-cg="bed-goodnight"`）；36628 為直式，使用 `data-ratio="portrait"`＋背景模糊＋深棕文字條。
- `goodnight` 不是一次性事件，改用 `state.storyClock.day` 做 7 夜冷卻；故事時鐘關閉（`day=0`）時不套用日數冷卻，避免永久鎖定。
- 36621 仍標記 `usable:false`（黑底需去背），36629 仍預設不用；本次未接入主線。
- 36632 終章 CG 尚未接入 ending 流程，留待後續 Step。

**修改面 SHA256**：見 `SHA256-V5-ART-STEP2-20261109.txt`。

---

## 2026-11-11（G43 WP2：表情窗四階）

依《Claude娘 G43｜新素材整合計畫指示書》WP2、WP7，點擊立繪時的表情窗改為依好感度（`#affProgress`）選圖；摸頭愛心、連點暈眩、星光、長按泡泡與故事情緒差分（story-*.webp）都不變。

| 檔案 | 動作 | 改了什麼 | 如何測試 |
|---|---|---|---|
| `app/www/assets/expressions/g43-face-aff-1.webp` | 新增 | 36625 去字版（不悅）；1088×1445、303,304 bytes | WebP 標頭、尺寸、大小檢查 |
| `app/www/assets/expressions/g43-face-aff-2.webp` | 新增 | 36627_0（捏臉嘟嘴）；941×1672、297,980 bytes | 同上 |
| `app/www/assets/expressions/g43-face-aff-3.webp` | 新增 | 36624 去字版（遮臉）；1088×1445、378,406 bytes；保留「IC Design」彩蛋 | 同上 |
| `app/www/assets/expressions/g43-face-aff-4.webp` | 新增 | 36623 去字版（伸手）；1088×1445、345,642 bytes | 同上 |
| `app/www/portrait-anim.js` | 修改 | 新增 `AFF_FACES`、`affinityTier`、`affinityFaceFor`；預載四張圖；點擊表情窗依 0-24／25-44／45-89／90-100 選圖；好感度讀不到或圖片未載入時退回原本的 pat／happy／surprised／dizzy | `expression-affinity.test.cjs` 22/22 |
| `app/www/assets/expressions/README.txt` | 修改 | 補四張新圖的來源、尺寸、分階與退回規則 | 人工檢視 |
| `tests/expression-affinity.test.cjs` | 新增 | 22 案：四階邊界、缺值退回、WebP 尺寸與大小、接線檢查 | `node tests/expression-affinity.test.cjs` **22/22 PASS** |

**測試**：WP2 新測試 **22/22 PASS**；等待畫面 **25/25 PASS**；既有 21 檔故事測試 **109/109 PASS**。
**限制**：四張表情圖保留原尺寸，沒有放大；表情窗以行內 `background-size:240%` 與逐張 `background-position` 裁切，已在 96 px 與 320 px 預覽確認臉部完整。
**未改**：`style.css`、`app.js`、`app.bundle.js`、`story-art.js`；因此不需要重建 bundle。

---

## 2026-11-11（G43 WP5：稀有晚安 CG）

依《Claude娘 G43｜新素材整合計畫指示書》WP5、WP7：夜間、好感度 45 以上、玩家送出的文字含「晚安」或 good night 時，以 10% 機率顯示 36685；24 小時冷卻；第一次不保證。只由本機判定，不開放 AI `eventFlag`，也不進等待畫面。本次經同意修改 `app.js`、`story-art.js` 並重建 bundle。

| 檔案 | 動作 | 改了什麼 | 如何測試 |
|---|---|---|---|
| `app/www/assets/g43-cg-goodnight.jpg` | 新增 | 36685 轉檔；756×545、77,894 bytes、JPEG q90；不放大 | JPEG 標頭、尺寸、大小檢查 |
| `app/www/night-cg.js` | 新增 | 純判定模組：機率 0.1、冷卻 24 小時、好感門檻 45、暖機 3 回合；`hasGoodnightText` 接受「晚安」／good night／goodnight／good-night；`evaluateRareGoodnight` 依 busy→game-over→ending→text-only→warmup→day→affection→文字→cooldown→機率判定；`random` 可注入測試 | `rare-goodnight.test.cjs` |
| `app/www/story-art.js` | 修改 | 新增 `rare-goodnight`（artId 36685、16:9、`fadeMs:400`、`clickToClose`）；`showRareGoodnight()` 在自訂立繪／場景圖／純文字／已有 CG 時回 false；暴露 `window.__storyArt`；尊重「減少動態」；`finishCg` 清除行內樣式 | 同測試＋Electron 煙測 |
| `app/www/app.js` | 修改 | `state.rareGoodnightAt` 納入 fresh／normalizeLastTurnUndo／normalizeSlot／serializeState／applyTurn undo／restoreTurnUndo；開始新故事、切換／新開／刪除／匯入存檔會重設暖機；API 與網頁成功回合後延遲 250ms 判定，token 防止舊回合誤觸發；只有真的顯示才寫入冷卻 | 109/109 回歸＋接線檢查 |
| `app/www/app.bundle.js` | 重建 | esbuild 重建；765,503 bytes、SHA256 `29ED8512…40BE9` | >500KB、無未替換 `@capacitor` import |
| `tests/rare-goodnight.test.cjs` | 新增 | 100 案：文字判定、45 邊界、夜間／日間、24 小時冷卻、0.1 機率邊界、busy／Game Over／終章／純文字／暖機、素材尺寸、story-art jsdom 顯示與點擊、app.js 接線與 undo | `node tests/rare-goodnight.test.cjs` **100/100 PASS** |
| `tests/g43-wp5-稀有晚安CG測試紀錄-20261111.txt` | 新增 | 完整測試紀錄與 Electron 煙測數據 | 見紀錄 |
| `tests/g43-wp5-稀有晚安CG預覽-20261111.png` | 新增 | Electron 載入真實 app 的 16:9 CG 預覽（隱藏開始面板以露出臉部） | 目視確認臉部完整 |

**測試**：WP5 新測試 **100/100 PASS**；WP2 表情窗 **22/22 PASS**；等待畫面 **25/25 PASS**；既有 21 檔故事測試 **109/109 PASS**；Electron 煙測顯示 756×545、data-ratio 16:9、400ms 淡入、點擊即關；PII／簡體掃描 **0／0**。

**設計說明**：
- 判定順序先擋體驗風險（回覆產生中、Game Over、終章、純文字、暖機），再判夜間、好感、晚安文字、冷卻與機率；暖機為本次啟動／讀取或切換存檔後的前 3 個玩家成功回合。
- 冷卻存在單一存檔的 `state.rareGoodnightAt`，不是全域跨存檔；系統時鐘往回調時視為現在，最多再等 24 小時。
- 36685 只做稀有晚安 CG，不進等待畫面、不開放 AI 旗標；36628／36629 的睡前場景與舞台呈現留待 WP6／WP7。
- 稀有 CG 一點即關、不鎖輸入；其他既有 CG 維持原本 5 秒自動結束。

**修改面 SHA256**：見 `SHA256-G43-WP5-20261111.txt`。

---

## 2026-11-11（G43 WP6：臥室場景 CG 呈現機制）

依《Claude娘 G43｜新素材整合計畫指示書》WP6：36628／36629 可用於所有位置，但不得設為任何位置的預設或唯一素材；舞台呈現採 `bundledStoryCg`（portrait＋blurBg，點擊即關、5 秒自動結束），不改 `style.css`、不裁切臉部。

| 檔案 | 動作 | 改了什麼 | 如何測試 |
|---|---|---|---|
| `app/www/story-art.js` | 修改 | 新增 `nightgown` CG 登錄（artId 36629、`g43-cg-goodnight-nightgown.jpg`、16:9、portrait、blurBg）；保留 36628（`goodnight-reading`）；兩者皆不掛 `flag`，只供 WP7 本機條件呼叫；暴露 `window.__storyArt.showBedroomScene(artId)`，在自訂立繪／場景圖／純文字／已有 CG 時回 false 不插隊 | `bedroom-scene.test.cjs` 37/37 |
| `tests/bedroom-scene.test.cjs` | 新增 | 37 案：素材 JPEG、story-art 登錄與 portrait+blurBg、不作預設／唯一、art_distribution 兩者列入、jsdom 呈現與阻擋 | `node tests/bedroom-scene.test.cjs` **37/37 PASS** |
| `tests/g43-wp6-臥室場景CG測試紀錄-20261111.txt` | 新增 | 完整測試紀錄 | 見紀錄 |

**測試**：WP6 新測試 **37/37 PASS**；WP5 **100/100 PASS**；WP2 **22/22 PASS**；等待畫面 **25/25 PASS**；既有 21 檔故事測試 **109/109 PASS**；PII／簡體掃描 **0／0**。

**設計說明**：
- 36628／36629 皆以 `bundledStoryCg`（portrait＋blurBg）呈現，復用既有 CSS 規則，不裁切臉部、不改 style.css。
- 兩者不作預設或唯一素材：`autoSwitch=false`、不進 `applyEmotionArt`／`returnToTimeDefault`、不設為 `storyDefaultArt`。
- 36629 首次接入（先前完全未使用）；36628 仍維持 `goodnight` 偏好可選（36455／36628 二選一）。
- 觸發條件、頻率（25%）、24 小時冷卻、第一次必出、每場景一次等留待 WP7。

**未改**：`app.js`、`app.bundle.js`（WP6 只動 `story-art.js`，bundle 不需重建）。

**修改面 SHA256**：見 `SHA256-G43-WP6-20261111.txt`。

---

## 2026-11-11（G43 WP7：臥室場景／稀有晚安 CG 條件整合）

依《Claude娘 G43｜新素材整合計畫指示書》WP7：夜間、好感度 45 以上時，臥室場景（標籤含「臥室／寢室／睡前／床」）以 25% 機率顯示 36628／36629（45–89 用 36628、90–100 用 36629）；稀有晚安 CG 10%；同一回合兩者同時成立時只出現晚安 CG。本次經同意修改 `app.js` 並重建 bundle。

| 檔案 | 動作 | 改了什麼 | 如何測試 |
|---|---|---|---|
| `app/www/bedroom-scene.js` | 新增 | 純判定模組：25%、24h、45、`isBedroomScene`、`bedroomArtFor`、`evaluateBedroomScene`（第一次必出、之後 25%、每場景一次、24h 冷卻、體驗保護） | `bedroom-wp7.test.cjs` |
| `app/www/app.js` | 修改 | `state.bedroomSceneAt`／`bedroomSceneLabels` 納入 fresh／normalize／serialize／undo／restore；`lastTurnWasBedroom` 追蹤；`currentBedroomLabel`（標籤＋旁白後備）；`maybeShowBedroomOrGoodnight` 合併判定，稀有 CG 優先；暖機共用；延遲 250ms token 防舊回合 | 109/109 回歸＋接線檢查 |
| `app/www/app.bundle.js` | 重建 | esbuild 重建；768,265 bytes、SHA256 `CF187F4E…7D4A9` | >500KB、無未替換 import |
| `tests/bedroom-wp7.test.cjs` | 新增 | 54 案：純判定、 guards、already-seen、cooldown、第一次必出、25% 邊界、app.js 接線 | `node tests/bedroom-wp7.test.cjs` **54/54 PASS** |
| `tests/g43-wp7-臥室與稀有CG測試紀錄-20261111.txt` | 新增 | 完整測試紀錄 | 見紀錄 |

**測試**：WP7 新測試 **54/54 PASS**；WP6 **37/37 PASS**；WP5 **100/100 PASS**；WP2 **22/22 PASS**；等待畫面 **25/25 PASS**；既有 21 檔故事測試 **109/109 PASS**；PII／簡體掃描 **0／0**。

**設計說明**：
- 夜間判定用 `state.storyClock.slot`／旁白 regex（`currentNightTone`），不依賴靜態標籤；臥室判定用標籤文字，標籤未更新時以旁白關鍵字後備，避免功能完全失效。
- 臥室場景以 `showBedroomScene`（CG 層、portrait＋blurBg）呈現，點擊即關、5 秒自動結束；稀有 CG 優先，同一回合兩者同時成立時只出現晚安 CG。
- 冷卻存在單一存檔 `state.bedroomSceneAt`；per-scene 去重用 `state.bedroomSceneLabels`；暖機與 WP5 共用（啟動／讀檔／切換後前 3 個成功回合）。
- 體驗保護：回覆產生中、Game Over、終章、純文字模式、暖機期都不觸發。

**修改面 SHA256**：見 `SHA256-G43-WP7-20261111.txt`。

---

## 2026-11-11（G43 WP3：簡易相簿）

依《Claude娘 G43｜新素材整合計畫指示書》WP3：新建簡易相簿，放入 36626_0、36676、36684、36628_0、36629_0 與三張有字版 36623_0／36624_0／36625_0（保留簡體對話框，轉 WebP）。

| 檔案 | 動作 | 改了什麼 | 如何測試 |
|---|---|---|---|
| `app/www/assets/g43-album-36623.webp` | 新增 | 36623_0 轉 WebP；1086×1448、321,694 bytes；保留簡體對話框 | WebP 標頭、尺寸檢查 |
| `app/www/assets/g43-album-36624.webp` | 新增 | 36624_0 轉 WebP；1086×1448、327,590 bytes | 同上 |
| `app/www/assets/g43-album-36625.webp` | 新增 | 36625_0 轉 WebP；1088×1445、292,206 bytes | 同上 |
| `app/www/assets/g43-album-36626.jpg` | 新增 | 36626_0 複製；940×1672、136,749 bytes | JPEG 標頭、尺寸檢查 |
| `app/www/assets/g43-album-36676.jpg` | 新增 | 36676 複製；1672×941、287,736 bytes | 同上 |
| `app/www/assets/g43-album-36684.jpg` | 新增 | 36684 複製；756×545、59,212 bytes | 同上 |
| `app/www/album.js` | 新增 | 純資料模組：9 張登錄、免費 6 張、`albumEntry`／`isAlbumUnlocked`／`albumImageSrc` | `album.test.cjs` |
| `app/www/app.js` | 修改 | `state.albumUnlocked` 納入 fresh／normalize／serialize／undo／restore；`unlockAlbum`；`renderAlbum`／`openAlbumLightbox`／`closeAlbumLightbox`；稀有 CG 與臥室場景顯示時解鎖對應圖；`render()` 呼叫 renderAlbum | 109/109 回歸＋接線檢查 |
| `app/www/index.html` | 修改 | 設定頁新增相簿區塊（`#albumGrid`、`#albumLightbox`） | 目視 |
| `app/www/style.css` | 修改 | 相簿格線、鎖定占位、燈箱樣式 | 目視 |
| `app/www/app.bundle.js` | 重建 | esbuild 重建；770,814 bytes、SHA256 `636EC1F7…1E34CB` | >500KB、無未替換 import |
| `app/tests/story/v5-art-step1.test.js` | 修改 | `UNUSED_IDS` 清空（36623／24／25 已列入相簿） | 故事測試 109/109 |
| `tests/album.test.cjs` | 新增 | 39 案：資料模組、素材格式、app.js 接線、UI 區塊 | `node tests/album.test.cjs` **39/39 PASS** |
| `tests/g43-wp3-相簿測試紀錄-20261111.txt` | 新增 | 完整測試紀錄 | 見紀錄 |

**測試**：WP3 新測試 **39/39 PASS**；WP7 **54/54 PASS**；WP6 **37/37 PASS**；WP5 **100/100 PASS**；WP2 **22/22 PASS**；等待畫面 **25/25 PASS**；既有 21 檔故事測試 **109/109 PASS**；PII／簡體掃描 **0／0**。

**設計說明**：
- 免費 6 張（36626、36676、36684、36623、36624、36625）開局解鎖；36685 於稀有 CG 顯示時解鎖；36628／36629 於臥室場景顯示時解鎖。
- 有字版 3 張保留簡體對話框，轉 WebP（q90）；其餘 3 張複製 JPEG。
- 相簿 UI 位於設定頁，點擊已解鎖縮圖開啟燈箱。
- 解鎖狀態寫入 `state.albumUnlocked`，隨存檔保存。

**修改面 SHA256**：見 `SHA256-G43-WP3-20261111.txt`。

---

## 2026-11-11（AI 網頁板新增 Doubao／豆包）

| 檔案 | 動作 | 改了什麼 | 如何測試 |
|---|---|---|---|
| `app/www/app.js` | 修改 | `WEB_AI_PROVIDERS` 新增 `{id:'doubao', name:'Doubao (豆包)', url:'https://www.doubao.com/'}` | 設定頁 AI 帳號選單可見 Doubao |
| `app/www/app.bundle.js` | 重建 | esbuild 重建；770,887 bytes、SHA256 `250ADA3E…0005BF0` | >500KB、無未替換 import |

**測試**：PII／簡體掃描 **0／0**；既有測試全數 PASS。

## 2026-11-11（設定按鈕整合至遊戲選單）

| 檔案 | 動作 | 改了什麼 | 如何測試 |
|---|---|---|---|
| `app/www/index.html` | 修改 | 移除 HUD 獨立齒輪按鈕 `#settingsBtn`；設定入口統一由遊戲選單的「設定」項目（`data-tab="settings"`）進入 | 靜態檢查：全檔已無 `settingsBtn`；選單仍有 `data-tab="settings"` |
| `app/www/app.js` | 修改 | 移除 `$('settingsBtn').onclick` 綁定，避免選單整合後對不存在元素賦值 | 全檔已無 `settingsBtn` 參照；既有 386 項測試全數 PASS |
| `app/www/style.css` | 修改 | 移除 `.game-hud #settingsBtn` 專用樣式 | 全檔已無 `settingsBtn` 參照 |
| `app/www/app.bundle.js` | 重建 | esbuild 重建；770,807 bytes、SHA256 `FEF24218…30A84408` | >500KB、無未替換 import、含 albumUnlocked／bedroomSceneAt／rareGoodnightAt／doubao |

**測試**：故事測試 109／109、WP2 22／22、WP3 39／39、WP5 100／100、WP6 37／37、WP7 54／54、等待畫面 25／25，合計 **386／386 PASS**；PII／簡體掃描 **0／0**。

## 2026-11-11（推送前隱私清理）

| 檔案 | 動作 | 改了什麼 | 如何測試 |
|---|---|---|---|
| `app/tests/story/p1-01-config-bootstrap.test.js` | 修改 | 移除硬編碼的使用者家目錄路徑，改用 `process.env.USERPROFILE` 組合基準樹位置，避免帳號名稱進入版控 | 單檔 3／3 PASS；全體故事測試 109／109 PASS |
| `V5-美術-完整術材清單.md` | 修改 | 來源路徑中的使用者名稱取代為 `<使用者>` | PII 掃描 0 命中 |

## 2026-11-11（安裝包建置完成）

| 檔案 | 動作 | 改了什麼 | 如何測試 |
|---|---|---|---|
| `Claude娘 - Windows 11 電腦版-Setup-4.6.38-x64.exe` | 新增（交付） | 以乾淨 npm 依賴樹（`npm ci`，541 packages）重建 NSIS 安裝包；122.99 MB；SHA256 `8D7A493B…6B087D`；未設定程式碼簽章憑證，electron-builder 跳過簽章 | `app.asar` 內 `www/app.bundle.js` 為 770,807 bytes、SHA256 `FEF24218…30A84408`，含 albumUnlocked／bedroomSceneAt／rareGoodnightAt／doubao，且無 `settingsBtn` |
| `SHA256-4.6.38-G43-v2.1.txt` | 新增（交付） | 安裝包檔名、大小、SHA256 與 bundle 校驗資訊 | 與實際安裝檔 `Get-FileHash` 一致 |

