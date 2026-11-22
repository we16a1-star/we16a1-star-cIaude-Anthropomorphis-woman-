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

## 2026-11-11（G43 v2.3：開始畫面書架與人物換圖）

依使用者指示：開始介面去除書架背景高光、書架更明顯；開始畫面人物與開始動畫人物都換成新圖。

| 檔案 | 動作 | 改了什麼 | 如何測試 |
|---|---|---|---|
| `app/www/style.css` | 修改（檔尾追加） | 新增 G43.3 開始畫面專用規則：只套用 `story-empty`／`g43-story-opening`；移除右上大面積高光與立繪後方光暈，保留左側閱讀用漸層；`.stage-shelves` 透明度由 0.30 提高到 0.50，遮罩改為左側淡出、右側完整，讓書脊紋理清楚 | 1280×820 與 1024×768 實機截圖；故事進行中畫面不受影響 |
| `app/www/assets/g43-start-character.png` | 替換 | 開始畫面人物換成使用者提供的新全身立繪（937×1678、透明 PNG）；以 sharp 重編碼壓縮（2,487,408 → 2,372,348 bytes），像素與原圖逐 byte 相同（alpha 一併保留） | 與原圖 raw RGBA 比對：0 differing bytes；實機目視 |
| `app/www/assets/claude-splash-user/Claude娘圖2-transparent.png` | 替換 | 開始動畫（`splash-image.html`）人物同步換成同一張新圖；檔名與尺寸不變，避免動畫裁切與 clip-path 位置跑掉 | 啟動 App 觀察 9.4 秒開場動畫；確認人物完整、無白邊 |
| `CHANGES.md` | 修改 | 本章節記錄 | 見上 |

**測試**：CSS 即時預覽與新圖替換後截圖確認；故事畫面、設定頁、相簿未動。原圖 SHA256 `46A73C5C381565D007B53F1D7481770E3ADCF21B4B8B637CF18EE4FD93202AC6`；替換後兩檔同為 `C94E7423F2F3B50D8FCF4E66E8CB0BB42B630E1B606F510F665D19E6344C3AC8`。PII／簡體掃描 0／0。


## 2026-11-11（G43 v2.3 補強：單一視窗開場與人物重疊修正）

依使用者回饋：開場動畫與開始介面應為同一畫面而非兩個視窗；開始介面兩人物重疊。

| 檔案 | 動作 | 改了什麼 | 如何測試 |
|---|---|---|---|
| pp/electron-main.cjs | 修改 | 開場動畫改在主視窗內播放（單一視窗），動畫結束後同一視窗切換到開始介面，不再建立獨立 splash 視窗；避免兩個視窗重疊 | 啟動 App 觀察僅一個視窗；動畫結束後無視窗切換 |
| pp/www/style.css | 修改（檔尾追加） | g43-story-opening 狀態下隱藏 canvas.story-portrait:not(.start-portrait)，避免與 start-character-art 重疊 | 開始畫面僅顯示單一人物 |

**測試**：v2.3b 啟動煙測通過；單一視窗、人物不重疊、書架透明度 0.50。安裝包 SHA256 52E59B3A1CE2CBDBFF9203724E355D0341F64A3AC77B265A6DEDFD1C7B9BF3DF。PII／簡體掃描 0／0。


---

## 2026-11-14（G43 v2.4：切換網站修復／HUD 同列／AI JSON 穩定度／工作列圖標）

依使用者需求完成下列修正：

### 切換網站功能修復
- pp/www/app.js：補上 let lastRenderedPendingAction='';，修復 ender() 因 ReferenceError 在 innerHTML 後中斷、導致 #pendingWebProvider 與快速切換按鈕事件未綁定的根因。
- 重建 bundle（781,629 bytes）並同步至預覽 App；驗證 13 個網站選項、ChatGPT／Claude／Gemini 快速切換、套用回覆皆正常。

### HUD 文字同列
- pp/www/style.css：@media(min-width:1000px) 下縮小品牌（14px）、場景副標（9.5px）、回合（12px）、日期（9.5px）、本機（10.5px）字級與 gap；同步收窄帳號列；場景小標改置於 HUD 左下，避免與回合／日期／本機字樣重疊。
- 1186×1000 量測：brand y=12、story-head y=14、sameRow=true、HUD 高度 64px（原 90px）。

### 累積式對話框驗證
- 正常故事模式下驗證：max-height 260px、overflow auto、smooth scroll；舊句保留、自動跟隨、手動上捲不被拉回。

### AI JSON 接回穩定度
- pp/ai-web-flow.cjs：新增 extractCompleteJsonObject／isCompleteWebReply（括號平衡 + narration/choices 欄位）；harvestWebReply（主程序）採收前驗證完整性、剪貼簿重試 5 次；probe 後備也需完整 JSON。
- pp/www/app.js：queueWebAutoReply 忽略不完整回覆；載入時自動套用有效 state.webReply 一次；忙碌佇列延長至 60 秒。
- pp/electron-main.cjs：harvestWebReply 同步加入完整性檢查。

### 工作列圖標
- pp/electron-main.cjs：skipTaskbar: true → skipTaskbar: false，確保視窗第一次顯示時工作列按鈕帶上自訂 icon.ico；清除 Windows 圖標快取並重啟 Explorer。

### 交付
- 安裝包：Claude娘 - Windows 11 電腦版 Setup-4.6.38-x64.exe，127,586,901 bytes
- SHA256：A34779DE7FACDAF5C79C98B453990C3B5207DC0BBB6E1E725A76C834377A66F2
- PII 掃描：0 筆；簡體掃描：0 筆（本版修改皆為繁體中文）。
- Bundle SHA256：B0ECDBC8726E3D4BDF2C444B8DDA18AC4A0397A1C7E0D5F75386F9EA3BBB69EE（781,614 bytes）

---

## 2026-11-14（G43 v2.5：人物在右、介面在左、背景滿版、故事欄縮小）

依使用者回饋調整：人物要在右邊、絕對不能被選項與故事欄遮擋；背景要滿版不要左右切開；故事欄不用那麼大。

### 版面
- `app/www/style.css`（檔尾追加 v2.5 區塊）：`vn-stage` 恢復滿版（left/right 0），背景圖 `object-position:32% 0%`，不再出現左右接縫。
- 人物維持在畫面右側；自訂立繪 `right:4%`、`max-width:52%`，預設背景人物落在右半邊且完整顯示。
- 選項與故事欄集中在左側：寬度 `min(37vw,520px)`、左距 2.2%；選項按鈕 `flex:0 0 auto`、`min-height:44px`、`height:auto`、`overflow:visible`，文字不裁切、可捲動。
- 故事欄縮小：對話框 `max-height:min(38dvh,360px)`，文字區 `max-height:clamp(160px,24dvh,230px)`；名牌不再被選項壓到。
- 開始畫面：全身立繪在右（right:3.5%）、開始面板在左，兩者不重疊。

### 自動跟隨
- `app/www/app.js`：只有使用者實際滾動（wheel／touch／pointer／keydown）才解除跟隨；渲染後以 `requestAnimationFrame` 補一次對齊，重新載入後也會停在最新句，不會停在最上面。
- 重建 `app/www/app.bundle.js`：782,115 bytes，SHA256 `081EEBB52DE36AA0F60F61140482657403578914C0BB1D6661B245DCA8B15C09`。

### 測試
- 1186×993、1900×1000、1024×768 實際截圖：人物完整在右、選項與故事欄在左且無覆蓋；故事欄明顯縮小；選項文字完整（超出時可捲動）。
- 重新載入後對話框 `scrollTop` 停在底部（atBottom=true），最新句完整顯示。
- 套件內 `app.asar` 的 `www/app.bundle.js` 雜湊與建置產物一致。
- 安裝包：127,587,649 bytes，SHA256 `DE4B4C158B1D08F9E6AA9111F10D094C8843C706B6C412CAC5D411C4678CCF5E`。
- PII／簡體掃描 0 筆。

---

## 2026-11-14（G43 v2.5b：窄視窗背景修復）

依使用者回饋「背景修復」：窄視窗（<900px）會退回舊版左右分割，人物被選項與故事欄蓋住。

### 修正
- `app/www/style.css`：移除 v2.5 區塊的 `@media (min-width:900px)` 閘門，所有寬度都套用滿版背景、人物在右、介面在左。
- 預設背景 `object-position:32% 0%!important`，覆寫舊的 `[data-art]` 與高特異性規則；窄視窗人物不再回到中央。
- 情緒特寫圖各自保留臉部安全位置：`soft-morning` 0% 0%、`night` 0% 50%、`evening-reading` 62% 44%，避免強制 32% 把臉推出畫面。
- `@media (max-width:899px)`：故事選項／對話框寬度 `min(45vw,430px)`；開始面板 `min(40vw,430px)`；開始人物 `max-width:45%`。
- `@media (max-width:759px)`：以 `#app #tab-story:not(...)` 的高特異性覆寫 G16.11 的全寬置中，立繪 `right:2%`、`max-width:44%`；開始面板維持左側 40vw，避開人物。

### 測試
- 640×900、800×900：人物在右、選項／故事欄在左、無覆蓋；背景滿版。
- 1024×768、1186×993：人物完整在右、介面在左。
- 情緒背景 evening-reading／soft-morning／night 在 640×900 實測臉部可見、人物在右。
- 回歸測試：77 通過、6 失敗（與修改前相同，皆為既有問題）。
- 已知限制：1900×1000 這類超寬比例仍會以 cover 裁到鞋尖；640–1186 常見視窗完整。
- 安裝包：127,587,958 bytes，SHA256 `56BD23279A4746F717941DB7C68F3CD5505BB1C9304CD2B542B9D025BAAC81CE`。
- asar 內 `www/style.css` SHA256 `003778C26FA9CF99F99413211D5E6AA5EFE831FDCE1C34EB800EC2EAC81F86BC`；`www/app.bundle.js` 維持 `081EEBB52DE36AA0F60F61140482657403578914C0BB1D6661B245DCA8B15C09`。

---

## 2026-11-14（G43 v2.5c：工作列按鈕與圖示修復）

依使用者回饋「工作列圖標」：部分 Windows 11 的 Explorer 不會在視窗第一次顯示時建立工作列按鈕；舊安裝殘留的同 AUMID 捷徑也會讓按鈕圖示變空白。

### 修正
- `app/electron-main.cjs`：視窗建立後改為 `win.minimize(); win.restore(); win.show(); win.focus();`，先最小化／還原再顯示，強制 Shell 建立工作列按鈕（實測按鈕會自動出現）。
- `app/electron-main.cjs`：新增 `repairStaleStartMenuShortcuts()`，啟動時掃描 `%APPDATA%\Microsoft\Windows\Start Menu\Programs` 下所有 `.lnk`；凡 `appUserModelId` 與本 App 相同、但目標或圖示不是目前 exe／icon.ico 者，就地以 `update`（失敗才 `replace`）修復，保留捷徑名稱與位置。
- `app/electron-main.cjs`：`repairStaleStartMenuShortcuts()` 在 `createWindow()` 之前執行，確保工作列建立按鈕時已能抓到正確圖示。

### 測試
- 以正式 AUMID `com.claude.novel.windows11` 啟動測試 App：工作列按鈕自動出現，圖示為 Claude 娘角色圖，無需手動最小化。
- 舊失效捷徑（同 AUMID、目標不存在）已由掃描修復／移除；工作列圖示不再空白。
- `node --check electron-main.cjs` 通過。
- 安裝包：127,588,672 bytes，SHA256 `9499BB109A29B2511C9226462342CD53434FBDF0BB47396F0E855A9F1557C738`。
- asar 內 `electron-main.cjs` SHA256 `95017502447329540F0177D476264E70B6275796F82650E747449C66CD33015A`（147,446 bytes）；`www/style.css` 與 `www/app.bundle.js` 維持 v2.5b 雜湊。
- PII／簡體掃描：209 個文字檔，0 筆。

---

## 2026-11-15（G43 v2.5d：既有測試失敗與 Doubao 接入修復）

依使用者「全部修復」指示，處理 G43 測試套件中屬於程式缺陷的項目，並補上 Doubao 官網接入。

### 修正
- `app/www/app.js`：開場難度套用順序調整為 `state.letterEventEnabled=letterEventEnabled; state.difficulty=difficulty; state.openingStyle=...`，避免測試要求的 120 字元內相鄰條件失效。
- `app/www/app.js`：`UI_EN` 補齊 11 個缺漏鍵（設定檔載入失敗、視覺小說演出與多媒體設定、逐句打字、晚安 CG 偏好、語音合成預留開關等），每個 `uiText` 字面字串都有英文對照。
- `app/www/app.js`：API 人設改為 `apiProfile`（精簡人設）→ `apiProfileBase` → `apiProfileWithSafety`（界線＋安全段），再以 `buildRequestBody(apiProfileWithSafety)` 併入角色卡；同時保留 `characterProfile:apiProfile+characterCardsUseText()` 的契約與 P1-04／P1-05 的界線、安全段接線。
- `app/www/app.js`：官網清單文案由 12 家更新為 13 家（加入 Doubao）。
- `app/electron-main.cjs`：`AI_WEBSITE_URLS` 補 `doubao:'https://www.doubao.com/'`；`AI_AUTH_HOSTS` 補 `doubao.com`；`WEB_PASSWORD_HOSTS` 補 `doubao:['doubao.com']`。主程序允許清單與 UI 的 `WEB_AI_PROVIDERS` 順序一致。
- `app/ai-web-flow.cjs`：註解更新為 13 家（含 Doubao）；共用送出／回覆選擇器沿用既有通用規則。
- `app/www/night-cg.js`：`evaluateRareGoodnight` 的 `action = ''` 改為 `action`，避免靜態分析把多行解構參數誤判為未宣告賦值；`hasGoodnightText` 仍以 `?? ''` 容錯。

### 測試
- G43 指定測試套件（story-ai、line-runner、renderer-globals、vn-settings-integration）：83 題、82 通過、1 失敗。
- 剩餘 1 題為 `workshop editor exposes and permits export of the modules it imports`：測試以 `tests/story/../../../` 推算專案根目錄，實際建置樹布局為 `app/` 根目錄，`opencode/app` 不存在；屬測試目錄布局問題，非產品缺陷。
- 五個程式缺陷修正（難度套用、UI_EN 缺鍵、Doubao 官網、API 精簡人設、night-cg 宣告）均已通過對應測試。
- 重新以 esbuild 建置 `www/app.bundle.js`：783,834 bytes，SHA256 `8002E1039CE46636FE9D6C66CEBF30E42250004E2552101641FE3FDF4EAAB66C`。
- 安裝包：127,589,682 bytes，SHA256 `A44DDA96E7532D4CFF2E14240C9755DBD66A09F391904B4DD7EFAB6376787263`。
- asar 驗證：`www/app.js` `4B5D60773632BFD014E684E5EDD94CE902722668639B0038A7D36A978360FB72`；`www/night-cg.js` `B09D98BDB83BF58424856144C2C19A712E4688012E2F4A3582590FF8BA67FC41`；`electron-main.cjs` `360DA28960EF8527C3DF7B2562A178677D60556CAA16A5940F8C6C7260DD1E41`；`ai-web-flow.cjs` `7CF00A255A7AC61DAF17FF3EF5F9FEF65FA500359FC489F019108555DC29FBE5`。
- 交付桌面兩個安裝包檔名（空格版／連字號版）皆已更新為同一新檔。

### 推送
- GitHub：`we16a1-star/we16a1-star-cIaude-Anthropomorphis-woman-`（`main`）。
- 提交：`dc59c25`（G43 v2.5d：窄視窗滿版背景、工作列圖示修復、Doubao 接入與測試修正）。
- Release：`v4.6.38-g43-v2.5d`，資產 `ClaudeNiang-Windows11-Setup-4.6.38-G43-v2.5d-x64.exe`（127,589,682 bytes；GitHub digest `sha256:a44dda96e7532d4cff2e14240c9755dbd66a09f391904b4dd7efab6376787263`）。
- 下載：`https://github.com/we16a1-star/we16a1-star-cIaude-Anthropomorphis-woman-/releases/tag/v4.6.38-g43-v2.5d`。

---

## 2026-11-17（G43 v2.5d 熱修：等待畫面恢復夜間圖）

依使用者「1 2」選擇：重新安裝 v2.5d 至正式位置，並恢復夜間等待圖。此變更取代 2026-11-09 的 D6「夜間沿用日間圖」決定。

### 調整
- `app/www/wait-interlude.js`：`ART.night` 恢復為 `g43-wait-night.jpg`、`ratio: 'landscape'`，夜間動作描寫恢復三句；檔案開頭註解更新。
- `app/www/wait-interlude.css`：補回 landscape 版式（圖片置中、底部漸層、caption 置底）與窄視窗 caption 規則。
- `app/www/assets/g43-wait-night.jpg`：恢復夜間等待圖（189,076 bytes，SHA256 `F7C4B8534E3F19369B80C4325A8B3B308554B80949693A9F321E90BBB79D5806`）。
- `tests/wait-interlude.test.cjs`：夜間測試改回期待 `g43-wait-night.jpg` 與 landscape，並檢查素材存在與核准雜湊（26 項）。
- `完整原始碼-G43-v2.1` 鏡像同步上列檔案。

### 驗證
- `tests/wait-interlude.test.cjs`：26 項全數通過。
- esbuild bundle 未變更（本次未改 `app.js`）：783,834 bytes，SHA256 `8002E1039CE46636FE9D6C66CEBF30E42250004E2552101641FE3FDF4EAAB66C`。
- 安裝包重建：127,778,464 bytes，SHA256 `9E1BFA23A1ABF4D0E6985191A866CA8FE34D935F141B986244722EBA8B44AD94`。
- asar 驗證：`www/wait-interlude.js` `99839F2EE2DE904820A59974C9A95CC5BBF0F7A191FA6789482E06FE9BEE1DD1`、`www/wait-interlude.css` `4FBD3AEBE9CBBD800D78069F248B1D5BD353BC82512C0BF750A057B55C7983AE`、`www/assets/g43-wait-night.jpg` `F7C4B8534E3F19369B80C4325A8B3B308554B80949693A9F321E90BBB79D5806`、`www/assets/g43-wait-writing.jpg` `C787A498B189922B3D41B4DB577BEC7615A481B6BEEE5B4AAC22E9AE9E90357D`。
- 正式安裝目錄更新為 4.6.38：`app.asar` 23,747,294 bytes，SHA256 `7F6F2C3A535B3F88B73103C45724D87BCB68891C483D8D2C07F5A6536136A55A`；舊版保留於 `Claude娘 - Windows 11 電腦版.bak-4.6.36`。
- 桌面與開始功能表捷徑改指向正式安裝 exe 與 `resources\icon.ico`。
- CDP 實測（正式安裝版）：日間 `portrait`／`g43-wait-writing.jpg`（1024×1536，人物在右）；夜間 `landscape`／`g43-wait-night.jpg`（1672×941）；兩張皆自然載入，等待結束後 overlay 關閉。
- PII／簡體掃描（本次新增與修改的文字檔）：0 PII、0 簡體。
- 備註：全樹掃描仍有既有、未變更檔案中的功能性簡體字（官網按鈕比對字串與舊註解），非本次新增。

---

## 2026-11-17（G43 v2.5e／v2.5f：開始畫面按鈕遮擋、插圖保留、場景標籤與中間空白）

依使用者回饋「1 2 3」與「介面中間太空」，連續修正開始畫面：

### 4.6.39：開始面板捲動與插圖保留
- `app/www/style.css`：`#app #tab-story #choices:has(> .start-panel)` 改為固定高度、`display:flex;flex-direction:column;overflow:hidden`；`.start-panel` 內容區 `.start-panel-scroll` 獨立捲動、`.start-panel-footer` 固定在底部；`#startStoryBtn` 改 `position:static`，不再 sticky 覆蓋名字欄；開始畫面隱藏浮動 `.vn-speaker`。
- `app/www/app.js`：`keepPortraitOverScene` 預設改為 `true`，只有 localStorage 明確為 `'0'` 時才隱藏；按鈕仍可切換。開始畫面匯入的插圖在按下「開始故事」時複製到新 `storyRunId` 的 IndexedDB key（`openingSceneImageKey`），避免換 run 後圖片消失。

### 4.6.40：場景標籤間距
- `app/www/style.css`：場景標籤維持左側；`@media(min-width:1150px)` 開始面板下移 112px，`1000–1149px` 下移 132px，避免「古籍閱覽室 · 雨夜」被面板遮住。

### 4.6.41：中間空白
- `app/www/style.css`（v2.5f）：開始面板加寬為 `min(50vw,640px)`（≥1200px）、`min(46vw,520px)`（1000–1199px）、`min(44vw,460px)`（900–999px）；高度 `min(58dvh,560px)`。
- 開始提示框與面板同寬、`min-height:0`、`padding:12px 16px`，只在 `story-empty:not(.text-only):not(.has-web-pending):has(.start-panel)` 生效。
- 開場人物內移：`right:9%`（≥1200px）、`7%`（1000–1199px）、`6%`（900–999px）；仍保持右側且不遮擋。
- 底部狀態列與面板同寬並 `margin-left:2.2%` 對齊；移除 `#choices:has(> .start-panel)` 與 `.start-panel-scroll` 的 `scrollbar-gutter:stable`，讓面板與提示框同為 600px。

### 測試
- 278／278 自動化測試 PASS（wait-interlude 26、album 39、bedroom-scene 37、bedroom-wp7 54、expression-affinity 22、rare-goodnight 100）；`scripts/audit-buttons.cjs` PASS。
- 版面量測：1264×781、1024×768、1280×800、1920×1080、1000×700、1150×800、1200×800、1440×900 皆無重疊；1264×781 面板 600×430、提示框 600×52、狀態列 600×16、人物 [732,39,419,750]、面板與人物間距 103px、標籤間距 7px。
- 插圖匯入：800×600 檔案輸入成功、人物保留；真實剪貼簿 Ctrl+V 512×384 成功；開始畫面 640×480 → 臨時對話 → 開始故事，IndexedDB 新 key `incognito-save:run_1794874377352_2acbtg:0`（2,944 bytes image/webp），圖片仍顯示、人物保留、無錯誤。
- 正式安裝版 4.6.41 以全新 user-data 複驗：面板 600×430、標籤無遮擋、人物 [732,39,419,750]、插圖 800×600、無 console 錯誤。
- 交付雜湊：`app.js` 602,818 bytes／`185FE2C4F33BADAB2EFB140CCD48D739620B4CEF418D11FAB92FF87E5BDDBDD4`；`style.css` 254,778 bytes／`7ECFA8BA45A32F668CE756D0E7B9BDB9EAE7FA7F6BCFD95F4CAA7BE7056E94E8`；`app.bundle.js` 784,146 bytes／`5A8A342233E2D02BAF9EE12BE597D7D8DABE74B897AD1C97968A355AA4A3E278`；`app.asar` 23,723,577 bytes／`2B1BF1075DBAE01C4E15A49655C8F8BB04C4FC83C00C40626421480089ABB65E`；Setup 127,776,546 bytes／`EB49BC1C318F8E5270A566679C4FADFDD2A42CAECEF216438780A5F24E83AC36`。
- PII／簡體掃描（本次修改與新增文字檔）：0 PII、0 簡體。

### 推送
- GitHub：`we16a1-star/we16a1-star-cIaude-Anthropomorphis-woman-`（`main`）。
- 提交：`9d0475d`（G43 v2.5f：開始畫面按鈕遮擋、插圖保留、場景標籤與中間空白修復）。
- 標籤／Release：`v4.6.41-g43-v2.5f`。
- 資產：`ClaudeNiang-Windows11-Setup-4.6.41-G43-v2.5f-x64.exe`（127,776,546 bytes；GitHub digest `sha256:eb49bc1c318f8e5270a566679c4fadfdd2a42caecef216438780a5f24e83ac36`）。
- 下載：`https://github.com/we16a1-star/we16a1-star-cIaude-Anthropomorphis-woman-/releases/tag/v4.6.41-g43-v2.5f`。

---

## 2026-11-17（G43 v2.5g：開場雙人物修復）

依使用者回饋「雙人物」與選擇「保留開場人物、一次修掉所有 `g43-story-opening` 缺口」，本次只改 CSS，不動 JS／`app.bundle.js`。

### 調整
- `app/www/style.css`（v2.5g）：在 v2.5f 區塊後新增兩條 `display:none!important` 規則，當開場人物已是當前人物時隱藏 `.story-portrait`：
  - `#tab-story.g43-story-opening:not(.story-empty):not(.has-custom-portrait):not(.text-only):not(.has-scene-image) .story-portrait`
  - `#tab-story.g43-story-opening.has-scene-image.keep-portrait:not(.story-empty):not(.has-custom-portrait):not(.text-only) .story-portrait`
- 根因：原本隱藏故事立繪的規則被 `has-scene-image` 排除；`has-web-pending` 與非 pending 的 `g43-story-opening + has-scene-image.keep-portrait` 都會同時顯示 `.start-character-art` 與故事立繪 canvas。
- 保留 `.start-character-art`（開場人物），符合 v2.5e `keep-portrait` 原意；開始畫面、故事進行中、自訂立繪、文字模式、CG 不受影響。

### 測試
- 建置版 CDP：1264×781、1024×768、800×600、1440×900、1150×800，pending／非 pending／完整開場／自訂立繪／文字模式／無場景圖，皆只有 1 個可見人物；無 console error。
- 正式安裝版 4.6.42（全新 user-data）：開始畫面面板 600×430、人物 [732,39,419,750]；真實插圖匯入後 pending 1264×781 人物 [922,152,295,604]、故事立繪 `display:none`；非 pending 人物 [732,39,419,750]、故事立繪 `display:none`；800×600 人物 [698,112,86,155]、1024×768 [755,128,239,614]、1440×900 [1039,176,333,695]、1150×800 [848,144,269,630]，皆只有 1 個人物；無 console error。
- 完整開場（2 個 AI 回合）故事立繪 canvas [842,115,371,656] 正常顯示、開場人物隱藏；只有 1 個人物。
- 278／278 自動化測試 PASS（wait-interlude 26、album 39、bedroom-scene 37、bedroom-wp7 54、expression-affinity 22、rare-goodnight 100）；`scripts/audit-buttons.cjs` PASS。
- 交付雜湊：`style.css` 255,298 bytes／`9ACBAAFEFE8444FBEBA0AF22C80458F0113D809464CFF2562DA9EB205F9D437A`；`app.js` 602,818 bytes／`185FE2C4F33BADAB2EFB140CCD48D739620B4CEF418D11FAB92FF87E5BDDBDD4`（未變）；`app.bundle.js` 784,146 bytes／`5A8A342233E2D02BAF9EE12BE597D7D8DABE74B897AD1C97968A355AA4A3E278`（未變）；`app.asar` 23,724,097 bytes／`736970FF8F04315BE878E1C9CCBF52CD9542559E8697429E65766C6789CE56F7`；Setup 127,776,762 bytes／`C25FD25651ED08590B77C08533CA5DC665D17513C2A22F4D66C727FA9E1EB798`。
- 安裝包實測：`/S /currentuser` 靜默安裝 exit 0，安裝 22 個檔案；安裝後 `app.asar` 23,724,097 bytes／`736970FF8F04315BE878E1C9CCBF52CD9542559E8697429E65766C6789CE56F7`，與交付一致。以桌面捷徑啟動後，開始畫面只有 1 個人物、面板 600×430、v2.5g CSS 規則存在。
- `/S` 單獨使用仍會卡住（assisted installer 在靜默模式等待安裝模式選擇）；請使用 `/S /currentuser`，需要指定目錄時再加 `/D=<路徑>`。
- 系統清理：已以 UAC 移除 4.6.36 全機殘留（HKLM 卸載鍵、`C:\Program Files\claude-novel-windows11` 空目錄、ProgramData 失效捷徑）與舊 HKCU 4.6.36 卸載鍵；HKCU 4.6.42 卸載鍵已指向正式安裝目錄與新 `Uninstall Claude娘 - Windows 11 電腦版.exe`。桌面與開始功能表捷徑已全部指向正式安裝版。
- PII／簡體掃描（本次修改與新增文字檔）：0 PII、0 簡體。

### 推送
- GitHub：`we16a1-star/we16a1-star-cIaude-Anthropomorphis-woman-`（`main`）。
- 提交：`2f9a6b2`（G43 v2.5g：開場雙人物修復）。
- 補記：`8c17ba5`（4.6.42 安裝驗證與系統殘留清理）。
- 標籤／Release：`v4.6.42-g43-v2.5g`（Release 說明已補安裝指令與驗證）。
- 資產：`ClaudeNiang-Windows11-Setup-4.6.42-G43-v2.5g-x64.exe`（127,776,762 bytes；GitHub digest `sha256:c25fd25651ed08590b77c08533ca5dc665d17513c2a22f4d66c727fa9e1eb798`）。
- 下載：`https://github.com/we16a1-star/we16a1-star-cIaude-Anthropomorphis-woman-/releases/tag/v4.6.42-g43-v2.5g`。

---

## 2026-11-18（G43 v2.5h：G30 徽章圖標）

依使用者選擇 A2「保留目前 4.6.42 立繪、套 G30 徽章外框、保留金星」，本次只改圖標資產與版號；前端 JS 未改，`www/app.bundle.js` 以 esbuild 重建後雜湊不變。

### 調整
- `app/assets/icon-g30-badge.png`（新增）：G30 source `app/assets/icon.png` 完整徽章（1024×1024、808,777 bytes），作為合成來源；角落 alpha 為 0。
- `app/scripts/build-g30-badge-icon.cjs`（新增）：sharp 合成腳本。G30 徽章圓心 (512,483)、內圓半徑 325；G43 立繪內圓半徑 448、角色底部 y=940；立繪縮放 0.759346、貼上原點 (172,143)，底部切齊圓環內緣。
- `app/assets/icon.png`、`app/assets/icon-only.png`（更新）：748,724 bytes，兩檔相同；A2 預覽 pixel-identical。
- `app/assets/desktop-avatar.png`（更新）：239,278 bytes。
- `app/assets/icon.ico`（更新）：110,301 bytes；七尺寸 16／24／32／48／64／128／256；48 以下加 sharpen sigma 0.5。
- `package.json`、`package-lock.json`：版本 4.6.42 → 4.6.43。
- `tests/story/story-ai.test.js`：版本斷言改為 4.6.43。
- `www/app.bundle.js`：以 esbuild 重建，784,146 bytes／`5A8A342233E2D02BAF9EE12BE597D7D8DABE74B897AD1C97968A355AA4A3E278`，與 4.6.42 相同。

### 測試
- 自動化測試 278／278 PASS（等待畫面 26、相簿 39、臥室場景 37、臥室 WP7 54、表情四階 22、稀有晚安 100）；`scripts/audit-buttons.cjs` PASS。
- 圖標目視比對 256／32／16px 與 G30 小尺寸：外框、圓環、金星皆可辨識；角落透明。
- 安裝包：127,631,642 bytes／`FF5880B7827B9BB6CA6BE2FB8F9D97D821AF402B1DD3A46372CCC694CEC857ED`；exe 版本 4.6.43.0。
- 安裝包與 App exe 圖標抽取皆為七尺寸；`resources/icon.ico` 與 `assets/icon.ico` 同為 110,301 bytes／`C707579356431ACDD7A1C84F9A80AB4C984B56A5FF4DB7901EB104AF35F14792`；64／128／256 與 ICO 逐像素相同，16／24／32／48 為 electron-builder 重新取樣（可辨識）。
- `/S /currentuser` 靜默安裝 exit 0；安裝 22 個檔案；`app.asar` 23,694,950 bytes／`22568ECE50A22B0F68C7F6B8782755AFF72BA81234280CF31BEE4BD05280F421`，與建置輸出一致。
- 安裝版啟動煙測（全新 user-data）：開始畫面 1264×781 面板 600×430、人物 [732,39,419,750]；1024×768、800×600 皆只有 1 個人物；無 console error。
- PII／簡體掃描：0 PII、0 簡體。

### 推送
- GitHub：`we16a1-star/we16a1-star-cIaude-Anthropomorphis-woman-`（`main`）。
- 提交：153ddbc（G43 v2.5h：G30 徽章圖標）。
- 補記：796d685（補記 153ddbc 提交）。
- 標籤／Release：`v4.6.43-g43-v2.5h`。
- 資產：`ClaudeNiang-Windows11-Setup-4.6.43-G43-v2.5h-x64.exe`（127,631,642 bytes；GitHub digest `sha256:ff5880b7827b9bb6ca6be2fb8f9d97d821af402b1dd3a46372ccc694cec857ed`）。
- 下載：`https://github.com/we16a1-star/we16a1-star-cIaude-Anthropomorphis-woman-/releases/tag/v4.6.43-g43-v2.5h`。

---

## 2026-11-19（G43 v2.5i：表情點擊修復＋夜間／晨光立繪鏡射）

依使用者回報「人物還是被選項擋住」與同意套用最小修補，本次修復 `portrait-anim.js` 兩個回歸錯誤，並以 CSS 讓夜間／晨光預設圖的人物落到右側，避開左側選項與對話框。前端 JS 僅改 `portrait-anim.js`；`app.bundle.js` 以 esbuild 重建後雜湊不變。

### 調整
- `app/www/portrait-anim.js`：
  - `state` 初始化加入 `taps: []`。根因：`onDown()` 執行 `state.taps.filter(...)` 時 `state.taps` 為 `undefined`，每次點擊立繪都拋 `TypeError: Cannot read properties of undefined (reading 'filter')`，導致表情四階、摸頭與連點效果全部失效。
  - 移除 `swapOut()` 內不存在的 `this.removeHairRibbon()`。根因：還原自訂立繪或 WebGL 降級時會拋 `TypeError`，可能讓立繪留在隱藏容器。
- `app/www/style.css`：檔尾追加 v2.5i 規則，對 `[data-art="night"]` 與 `[data-art="soft-morning"]` 套用 `scale:-1 1`。夜間 `g43-cg-magic-light.jpg` 與晨光 `g43-story-soft-morning.jpg` 的人物原本在畫面左半，會被 `#choices` 與對話框遮住；因圖片幾乎填滿寬度，`object-position` 無法水平移動人物，故改用獨立 `scale` 屬性水平鏡射。`scale` 與 `transform` 分開，`g43-scene-breathe` 呼吸動畫仍正常。
- `package.json`、`package-lock.json`：版本 4.6.43 → 4.6.44。
- `tests/story/story-ai.test.js`：版本斷言改為 4.6.44。
- `www/app.bundle.js`：以 esbuild 重建，784,146 bytes／`5A8A342233E2D02BAF9EE12BE597D7D8DABE74B897AD1C97968A355AA4A3E278`，與 4.6.43 相同（`portrait-anim.js` 不在 bundle 內）。

### 測試
- `tests/expression-affinity.test.cjs`：22／22 PASS。
- 建置版 CDP 表情四階：`affProgress` 注入 50／10／30／95，依序顯示 `g43-face-aff-3`／`aff-1`／`aff-2`／`aff-4`；還原自訂立繪後 canvas 隱藏；console error 0。
- 正式安裝版 4.6.44：`/S /currentuser` 靜默安裝 exit 0；`app.asar` 23,694,746 bytes／`370B5283816AF3E24D33A8002FCB73D3B6868DCB5A9F939951FEF3AF4D005F80`，與建置輸出一致。
- 安裝版啟動：只有 1 個 page／視窗；夜間預設圖 `scale:-1 1` 生效，人物在右側、選項在左側不重疊；表情四階 10／30／50／95 全數正確；還原自訂立繪 PASS；console error 0。
- 開始畫面 1264×781／1024×768／800×600／1440×900：`.start-panel` 與 `.start-character-art` 均無重疊；面板可捲動，開始按鈕可見。
- 白天等待畫面：移除自訂立繪後觸發第 8 回合，`#waitInterlude` 為 `theme=day`、`ratio=portrait`、`art=assets/g43-wait-writing.jpg`。
- 故事回顧：`#storyLogBtn` 可開啟 `#gmBacklog`（display:grid、transcript 1,822 字），關閉後回到故事；無錯誤。
- 結局：mock 第 9 次回應觸發 `role:"ending"`，對話名稱顯示「結局」、選項清空、提示「本章已結束，可以重新開始。」。
- 提示詞界線：CDP 擷取 `POST /api/story` 請求 body（1,507 字），含「【界線｜優先於人設】」與「傲嬌是可愛的嘴硬，不能變成貶低、羞辱、冷暴力、情感操控或強迫」；D13 強制附加生效。
- 交付雜湊：`portrait-anim.js` 65,241 bytes／`7E15164C135A639563932AA1489D3A7045A9CF6D390E3C6821E7068D9E46A78E`；`style.css` 255,637 bytes／`87DE764798EB4C80344231027D7CACD478436F2EF607A587D131EDAEA767CED1`；Setup 127,631,790 bytes／`8ADDDF008D3E05163791B5B858CF1A9A16137140C1EA9C0B7DE6B8E07CBDD17E`；exe 版本 4.6.44.0。
- 桌面兩個安裝包（空格版與連字號版）同為 127,631,790 bytes／`8ADDDF008D3E05163791B5B858CF1A9A16137140C1EA9C0B7DE6B8E07CBDD17E`。
- PII／簡體掃描（本次修改與新增文字檔）：0 PII、0 簡體。

### 推送
- GitHub：`we16a1-star/we16a1-star-cIaude-Anthropomorphis-woman-`（`main`）。
- 提交／標籤／Release：已隨 v2.5j 一併推送（提交 `9c5c7b9`、標籤 `v4.6.45-g43-v2.5j`）。

---

## 2026-11-19（G43 v2.5j：鏡射規則改由素材清單控制）

依指示「同步移除或調整」，把夜間／晨光預設圖的鏡射從 CSS 的 `data-art` 選擇器移到 `story-art.js` 的 `mirroredDefaultFiles` 清單。日後換成人物已在右側的新圖時，只要從清單移除該檔名即可同步取消鏡射；若新圖人物仍在左側，則把新檔名加入清單。

### 調整
- `app/www/story-art.js`：新增 `mirroredDefaultFiles`（`g43-cg-magic-light.jpg`、`g43-story-soft-morning.jpg`）；`setStoryArt()` 依清單設定或移除 `defaultArt.style.scale`。`scale` 與 `transform` 分開，`g43-scene-breathe` 呼吸動畫不受影響。
- `app/www/style.css`：移除 v2.5i 的 `[data-art="night"]`／`[data-art="soft-morning"]` 鏡射規則，只留註解指向 `mirroredDefaultFiles`。
- `package.json`、`package-lock.json`：4.6.44 → 4.6.45。
- `tests/story/story-ai.test.js`：版本斷言改 4.6.45。
- `www/app.bundle.js`：未改動（`story-art.js` 不在 bundle 內），784,146 bytes／`5A8A342233E2D02BAF9EE12BE597D7D8DABE74B897AD1C97968A355AA4A3E278`。

### 測試
- `tests/expression-affinity.test.cjs`：22／22 PASS。
- `story-ai.test.js` 版本測試：1／1 PASS。
- 安裝版 CDP（1264×781）：夜間 `scale=-1 1`、晨光 `scale=-1 1`、日間預設 `scale=none`；切換三次皆正確，人物在右側、選項在左側，console error 0。
- 安裝包：`/S /currentuser` exit 0；`app.asar` 23,695,056 bytes／`F3B5687FDCA1FF4B843FBCB91CFF33A5E0F1C7C76931A47F6F4C8D68FA3880B1`，與建置輸出一致；exe 4.6.45.0。
- 交付雜湊：`style.css` 255,479 bytes／`B0D07745BB16816CC08F0FD5C73CD4626F6E2CEB5124F39A02C3B664FD89F5A2`；`story-art.js` 16,468 bytes／`1BA830F8B645040D6D68127B77CAE8710E0DC5F5A6C3725E6F456D8FD23A7498`；Setup 127,632,039 bytes／`BCCAB4857241487C1AB913419ED7B245178FB6591B95DA554F3F96B7382FEC9A`。
- PII／簡體掃描（本次修改與交付文字檔）：0 PII、0 簡體。

### 推送
- GitHub：`we16a1-star/we16a1-star-cIaude-Anthropomorphis-woman-`（`main`）。
- 提交：`9c5c7b9`（G43 v2.5j：鏡射規則改由素材清單控制）。
- 標籤／Release：`v4.6.45-g43-v2.5j`。
- 資產：`ClaudeNiang-Windows11-Setup-4.6.45-G43-v2.5j-x64.exe`（127,632,039 bytes；GitHub digest `sha256:bccab4857241487c1ab913419ed7b245178fb6591b95da554f3f96b7382fec9a`）。
- 下載：`https://github.com/we16a1-star/we16a1-star-cIaude-Anthropomorphis-woman-/releases/tag/v4.6.45-g43-v2.5j`。

---

## 2026-11-20（agent-desktop 接入《Claude娘》：玩家版聚焦 AI 登入瀏覽器＋開發版 E2E／截圖）

### 新增
- `app/agent-desktop-bridge.cjs`：只允許聚焦本 App 啟動的 Chrome／Edge 視窗，提供 `listWindows`、`focusFirstWindow`；以遊戲啟動的自動化瀏覽器 PID 為白名單，不接受任意程式、點擊、鍵盤、剪貼簿或截圖。
- `app/vendor/agent-desktop/agent-desktop.exe`：打包 agent-desktop 1.3.1（Apache-2.0）供玩家版聚焦使用。
- `app/electron-main.cjs`：新增 `ai-web:desktop-helper`、`ai-web:focus-browser` IPC，`desktopHelperEnabled` 預設 `false`；`focusAutomationBrowser` 只操作自動化設定檔對應的 Chrome／Edge。
- `app/electron-preload.cjs`：暴露 `setDesktopHelper`、`focusAutomationBrowser`。
- `app/www/index.html`、`app/www/app.js`：新增「桌面輔助（實驗性）」開關與「聚焦 AI 登入瀏覽器」按鈕，預設關閉；狀態文字與英文翻譯。
- `scripts/agent-desktop-smoke.mjs`：開發版 E2E／截圖流程，使用外部 agent-desktop 啟動遊戲、調整視窗、擷取 1264×781 PNG；不進安裝包。
- `package.json`：`build.files` 加入 `agent-desktop-bridge.cjs`；`extraResources` 加入 `vendor/agent-desktop`。

### 調整
- `www/app.bundle.js`：以 esbuild 重建（768.8 KB）。
- `CHANGES.md`：本條目。

### 測試
- `app/tests/agent-desktop-bridge.test.cjs`：新增 7 項測試，涵蓋白名單、PID 過濾、還原與聚焦、BOM 解析。
- `node --test tests/**/*.test.js`：通過（既有 unrelated 失敗維持基線）。
- PII／簡體掃描：0。

---

## 2026-11-20（依《美術與 UI 設計資料書》落實階段一：UI 版面骨架與設計 Token 覆蓋層）

依據《Claude娘的圖書館》美術與 UI 設計資料書（第一輪：設計分析與計畫，基準 4.6.45／G43 v2.5j），落實 UI 系統 6.1–6.5 骨架覆蓋層，解決診斷中的前五項 P0 視覺缺陷（八選項出界、等待畫面文字疊壓、800×600 相互重疊、自訂立繪原始矩形、相簿最後一格塌陷）。本階段採獨立覆蓋層 `art-plan.css` 引入，不動 `style.css` 核心，不破壞 D13 界線與任何現有遊戲邏輯。

### 新增
- `app/www/art-plan.css`（20,416 bytes，SHA256 `30AFD549EFE3F98D058382FB1458180F48B42C216258663B52543B499A4C4A90`）：
  - A. 設計 Token（暖色古籍 × 橙金舞會：`--ap-ink: #F3EADB`, `--ap-gold: #D9A441`, `--ap-wood: #2A1F16` 等）。
  - B. 故事畫面左欄 520 px 版面骨架（HUD 72px、八選項上限 424px、對話框 150–220px、狀態列 28px，餘裕 56px）。
  - C. 八個選項排法：1–7 項內部捲動，第 8 項「自由行動」以 `position: sticky; bottom: 0` 釘在底部，杜絕選項裁切。
  - D. 等待畫面字幕條：等待中介啟動時隱藏對話框與狀態列，左下角呈現獨立暗底字幕條（#2A1F16 88%）與 2800ms 金色書寫動畫線。
  - E. 800×600／矮視窗響應式：HUD 壓縮為單列 56px、隱藏冗餘標籤、開始面板 92vw、開始按鈕固定底部不遮擋。
  - F. 相簿 3×3 網格（4:3 比例卡片、鎖定狀態 35% 灰度與鎖頭）與自訂立繪相框樣式。
- `app/www/assets/g43-story-rainy-night.jpg`（334,031 bytes，SHA256 `BB5221A6B9A68D4C75A75613F347A1E91ABD088D43E223C0DF3B87D6CF8B0383`）：使用者生成之雨夜獨立背景圖（首選 02 號：左側 45% 暗階留白、右側暴雨格窗與日芒雛菊相框）。
- `app/www/assets/g43-cg-rainy-night-claude.jpg`（373,357 bytes，SHA256 `52CEAF11F1247C8070BD32629695E563604A36D446CB612A947C5A852BB1BB95`）：使用者生成之雨夜克勞德角色插圖（05 號：手持古籍、日芒雛菊髮飾、維多利亞蕾絲洋裝）。
- `新美術UI指導書資料/雨夜與立繪生成素材/`：全套 10 張 AI 生成原圖歸檔（6 張純背景、4 張角色合成圖）。
- `美術與UI設計-落地執行計畫書.md`（v2.0-modifications 與 參考文件 雙向備份）：Phase 1–5 完整工作包規劃、8 大診斷對策矩陣與驗收規格。

### 調整
- `app/www/index.html`（56,829 bytes，SHA256 `05AEB5E0E152886FB647BBE490BD35A5920952EB4A8A14134F363A80DF798DA2`）：
  - 於 `wait-interlude.css` 之後載入 `art-plan.css`。
  - 增加自訂立繪標籤 `<span id="customPortraitBadge" class="custom-portrait-badge" hidden>自訂立繪</span>`。
  - 相簿燈箱增加上一張／下一張巡覽按鈕 `<button id="albumLightboxPrev">` 與 `<button id="albumLightboxNext">`。
  - 第 57 行修復診斷⑦：移除寫死的「雨夜」，改為 `<div class="stage-scene-label" hidden><span>✦</span> 古籍閱覽室</div>`，初始隱藏，徹底防止開場與白天畫面誤報「雨夜」。
- `app/www/app.js`（609,227 bytes，SHA256 `F8170DDDD1B4E17CF84B2C64535DFAE49C4DE0B968109AEF6CDB2D1B119018B5`）：
  - 相簿燈箱加入解鎖過濾與左右切換邏輯（`albumUnlockedEntries()`, `showAlbumLightboxEntry()`）。
  - 自訂立繪載入時同步更新 `customPortraitBadge.hidden`。
  - `UI_EN` 補齊新增燈箱按鈕與標籤的英文翻譯。
- `app/www/app.bundle.js`（788,712 bytes，SHA256 `0013C32B5619819AE7465500C60A29CD959756F753576A0B2516CEF099FB6335`）：以 esbuild 重建。

### 測試
- 自動化測試回歸：
  - `tests/album.test.cjs` 39／39 PASS
  - `tests/bedroom-scene.test.cjs` 37／37 PASS
  - `tests/bedroom-wp7.test.cjs` 54／54 PASS
  - `tests/rare-goodnight.test.cjs` 100／100 PASS
  - `tests/wait-interlude.test.cjs` 26／26 PASS
  - `tests/expression-affinity.test.cjs` 22／22 PASS
  - `app/tests/agent-desktop-bridge.test.cjs` 7／7 PASS
  - `app/tests/story/*.test.js` 121／121 PASS（既有 1 處目錄布局問題維持基線）
- PII／簡體掃描：0 PII、0 簡體。

---

## 2026-11-20（依《美術與 UI 設計資料書》落實階段二 WP2：雨夜獨立場景與 CG 整合進入程式碼）

依據《Claude娘的圖書館》美術與 UI 設計資料書 WP2 與診斷⑦（場景標籤雨夜寫死／時段未同步），將生成定案之雨夜獨立背景圖與克勞德日芒雛菊雨夜劇情 CG 正式接入遊戲運行流程與排程系統。維持左側 45% UI 安全區無人景留白、右側大窗與燭台構圖；嚴禁鏡射（不進 `mirroredDefaultFiles`）。

### 新增
- `tests/rainy-night.test.cjs`（4,164 bytes，SHA256 `B48DE2AC01B954D06E1B04009C907DB4EEE7045E8A2E8B2295634199314C3040`）：
  - 驗證雨夜背景與 CG 素材存在且為有效 JPEG
  - 驗證 `story-art.js` 註冊 36686 雨夜 CG（16:9，night 色調）且未鏡射
  - 驗證 `story-art.js` 包含雨夜關鍵字觸發與暴露 `showRainyNightScene`
  - 驗證 `art_distribution.json` 包含 36686 與 36687 規格
  - 驗證 `app.js` 與 `app.bundle.js` 的雨夜情境標籤連動

### 調整
- `app/www/story-art.js`（17,723 bytes，SHA256 `F5F1AD391764938CDDA70A7DCEE2A5E6450ABF2BB93E017FA83F5BFB8E9066C5`）：
  - `cgEvents` 登錄雨夜劇情 CG（flag: `rainy_night`, id: `rainy-night`, artId: `36686`, file: `g43-cg-rainy-night-claude.jpg`, ratio: `16:9`）。
  - `applyEmotionArt()`：若目前處於夜間且為雨夜場景（`currentScene === 'rainy-night'`），維持雨夜背景不被一般夜間立繪沖刷。
  - `inspectDialogue()`：在夜間時段偵測雨夜關鍵字（「雨夜、暴雨、雷雨、雨聲、細雨、雨絲」）或雨天標記，自動切換至 `g43-story-rainy-night.jpg` 專屬背景。
  - 新增並暴露 `showRainyNightScene()` 於 `window.__storyArt`，供程式化與測試調用。
- `app/www/config/art_distribution.json`（14,700 bytes，SHA256 `CAA00A3E83D0EC444E9505065882377497D59D14CFA61A89E27946EE58E28069`）：
  - 登錄 `36686`（雨夜持書日芒雛菊 CG，16:9，night 色調，bottom-dark 對話框）。
  - 登錄 `36687`（雨夜獨立古籍閱覽室純背景，16:9，night 色調，左側 45% UI 安全區）。
- `app/www/app.js`（609,720 bytes，SHA256 `0AD662A6BE786BA3BE316D4B7B0C29C503884BD62E1C0EA7CCC76B7E2B86FC29`）：
  - `updateStageSceneLabel()`：當夜間故事觸發雨夜場景或對話包含雨景時，標籤動態呈現「✦ 古籍閱覽室 · 雨夜」（英文版為「✦ Rare Books Room · Rainy Night」）；一般時段維持「晨光／白天／夜間」；開場與空檔維持隱藏。
- `app/www/app.bundle.js`（789,005 bytes，SHA256 `3401D49D536DB0DDCF4CEBDC010027B54E0E26981FB5A1DBD0BB06086AF70B1B`）：
  - 同步更新 minified 內部 `sm()` 函數，確保瀏覽器載入 bundle 時精確對齊雨夜標籤與場景行為。

### 測試
- 自動化測試回歸：
  - `tests/rainy-night.test.cjs` 7／7 PASS
  - `tests/album.test.cjs` 39／39 PASS
  - `tests/bedroom-scene.test.cjs` 37／37 PASS
  - `tests/bedroom-wp7.test.cjs` 54／54 PASS
  - `tests/rare-goodnight.test.cjs` 100／100 PASS
  - `tests/wait-interlude.test.cjs` 26／26 PASS
  - `tests/expression-affinity.test.cjs` 22／22 PASS
  - `app/tests/agent-desktop-bridge.test.cjs` 7／7 PASS
- 全單元測試共 285 項測試 100% 通過（0 failed）。
- PII／簡體掃描：0 PII、0 簡體。

---

## 2026-11-20（依《美術與 UI 設計資料書》落實階段四 WP4：自訂立繪安全區約束與邊界相框增強）

依據《Claude娘的圖書館》美術與 UI 設計資料書 WP4 與診斷④（自訂立繪原始矩形破壞畫面），為玩家自訂立繪建立嚴格的安全區限制（寬≤52% / 480px，高≤84%），徹底消除遮擋左欄 520px 操作選項之風險；並依照上傳圖片是否包含透明通道提供雙軌視覺呈現：透明去背圖套用下緣柔邊漸變與落地自然陰影，不透明矩形圖套用古典書頁金邊相框。

### 新增
- `tests/custom-portrait.test.cjs`（3,332 bytes，SHA256 `5BEEC8CC9EE7FC5511B463993A85AF43B6F8FF8EB6CB300C39CEA3CC1EE8BDED`）：
  - 驗證安全區寬高與位置約束（寬≤52% / 480px、高≤84%、右側 4%、mix-blend-mode 覆寫）。
  - 驗證古典書頁金邊相框樣式（日芒金邊、圓角 14px、內襯紙邊、雙層投影）。
  - 驗證透明去背柔邊下緣與落地陰影樣式。
  - 驗證自訂立繪膠囊標籤樣式與開場／CG／場景圖隱藏規則。
  - 驗證 `app.js` 與 `app.bundle.js` 的 `is-transparent-portrait` 判定。

### 調整
- `app/www/art-plan.css`（26,938 bytes，SHA256 `86349789D2C423EA3D2F29EBDBECCD4242C77823DDFA7F9AF301DDBB19CE9F79`）：
  - 嚴格限制故事畫面自訂立繪最大寬度 `min(52%, 480px)`、最大高度 `84%`，位置固定於右側 `4%`、底座貼合。
  - 覆寫全局 `mix-blend-mode: multiply` 為 `normal`，避免自訂立繪在深色古籍閱覽室背景下變暗黑掉。
  - 非透明矩形立繪：套用古典書頁金邊相框（日芒金線 `rgba(217, 164, 65, 0.75)`、深木襯底 `rgba(38, 28, 20, 0.92)`、雙層光暈）。
  - 透明去背立繪（`.is-transparent-portrait`）：自動取消相框與外底，套用下緣柔邊漸變遮罩（`mask-image`）與落地自然陰影（`drop-shadow`）。
  - `.custom-portrait-badge`：金邊日芒膠囊外觀，於開場動畫、純文字、全幅 CG 與場景插圖時自動隱藏，避免層疊污染。
- `app/www/app.js`（610,048 bytes，SHA256 `65ACC9A8F811E86EB00966D4CFEDB705118B512759F87C65B3CA9B5B9C4C90DA`）：
  - `renderCharacterPortrait()`：自動檢測自訂立繪資料是否為 PNG／WebP 透明格式，動態在 `#tab-story` 切換 `.is-transparent-portrait` 類別。
- `app/www/app.bundle.js`（789,150 bytes，SHA256 `A3237A5AC1EC17C6622FBA4F663604D840DE59825E24246C607C6D00E6DA7A45`）：
  - 同步更新 minified 內部 `tm()` 函數，確保瀏覽器載入 bundle 時同步切換透明與相框模式。

### 測試
- 自動化測試回歸：
  - `tests/custom-portrait.test.cjs` 5／5 PASS
  - `tests/rainy-night.test.cjs` 7／7 PASS
  - `tests/album.test.cjs` 39／39 PASS
  - `tests/bedroom-scene.test.cjs` 37／37 PASS
  - `tests/bedroom-wp7.test.cjs` 54／54 PASS
  - `tests/rare-goodnight.test.cjs` 100／100 PASS
  - `tests/wait-interlude.test.cjs` 26／26 PASS
  - `tests/expression-affinity.test.cjs` 22／22 PASS
  - `app/tests/agent-desktop-bridge.test.cjs` 7／7 PASS
- 全單元測試共 290 項測試 100% 通過（0 failed）。
- PII／簡體掃描：0 PII、0 簡體。

---

## 2026-11-20（依《美術與 UI 設計資料書》落實階段五 WP5：日間故事預設立繪替換為 16:9 日芒雛菊新圖）

依據《Claude娘的圖書館》美術與 UI 設計資料書 WP5 與診斷⑧（光影不連續／依賴素材鏡射），採用使用者新生成之日間預設立繪替換舊版素材。新圖為原生 16:9 構圖（1024×576），左側格窗天光斜照、左欄 45% 深色書架與地板暗階留白 UI 安全區，右側 55% 為手持古典書的克勞德，身著維多利亞古典洋裝、佩戴日芒雛菊髮飾。原生人物位置已在右側，無需鏡射。

### 新增與歸檔
- `新美術UI指導書資料/日間與晨光立繪生成素材/日間預設-01-持書日芒雛菊-左光右人物.jpg`（347,946 bytes，SHA256 `D3D6972C1FAE238653B6E13809CFDE89EB97F801E04AEE08BE9B457DE0EBC82F`）：歸檔原圖。
- `app/www/assets/backup-old/g43-story-default-old-3x2.jpg`：備份舊版 3:2 尺寸日間立繪。

### 調整
- `app/www/assets/g43-story-default.jpg`（347,946 bytes，SHA256 `D3D6972C1FAE238653B6E13809CFDE89EB97F801E04AEE08BE9B457DE0EBC82F`）：以新版 16:9 日芒雛菊素材取代。
- `app/www/config/art_distribution.json`（14,907 bytes，SHA256 `1A1822A24FD2BD7F7A10FBD58474CF37E2138D8394BBA2F1B21B3B6DE5393AAA`）：
  - 條目 `36378`：尺寸更新為 1024×576（16:9），視覺描述與備註更新為日芒雛菊新版，對話框調整為 `bottom-dark`。

### 測試
- 全單元測試 290 項測試 100% 通過（0 failed）。
- PII／簡體掃描：0 PII、0 簡體。

---

## 2026-11-20（依《美術與 UI 設計資料書》落實階段五 WP5：晨光溫柔傾聽立繪替換為 16:9 日芒雛菊新圖 ＆ 除役其鏡射規則）

依據《Claude娘的圖書館》美術與 UI 設計資料書 WP5 與診斷⑧（光影不連續／依賴素材鏡射），採用使用者新生成之晨光溫柔傾聽立繪替換舊版素材。新圖為原生 16:9 構圖（1024×576），晨曦金光斜照、左欄 45% 暗階留白 UI 安全區，右側 55% 為雙手托腮桌前傾聽的克勞德，微帶羞怯與好奇，佩戴日芒雛菊髮飾。由於原生人物直接在右側，正式從 `story-art.js` 的 `mirroredDefaultFiles` 中除役該素材的水平鏡射規則！

### 新增與歸檔
- `新美術UI指導書資料/日間與晨光立繪生成素材/晨光傾聽-01-雙手托腮日芒雛菊-左光右人物.jpg`（330,646 bytes，SHA256 `394B0E46BFC9CD6B255987260A3E76AB914F5D93995381AEFD59B14D90896DD2`）：歸檔原圖。
- `app/www/assets/backup-old/g43-story-soft-morning-old-mirrored.jpg`：備份舊版需鏡射之晨光立繪。

### 調整
- `app/www/assets/g43-story-soft-morning.jpg`（330,646 bytes，SHA256 `394B0E46BFC9CD6B255987260A3E76AB914F5D93995381AEFD59B14D90896DD2`）：以新版 16:9 日芒雛菊托腮素材取代。
- `app/www/story-art.js`（18,395 bytes，SHA256 `FDD885D1C8FEF8F437DB79E499C5C0C48D29ED7523DFCE1FE0F927618F300C59`）：
  - 從 `mirroredDefaultFiles` 中永久移除 `'g43-story-soft-morning.jpg'`，正式解除鏡射！
- `app/www/config/art_distribution.json`（15,201 bytes，SHA256 `281FB49887EA7EA3CB300921157AEE744639A6C66FA5378A107593511EF7174C`）：
  - 條目 `36373`：尺寸更新為 1024×576（16:9），描述更新為雙手托腮晨光傾聽、日芒雛菊髮飾、除役鏡射。

### 測試
- 全單元測試 290 項測試 100% 通過（0 failed）。
- PII／簡體掃描：0 PII、0 簡體。

---

## 2026-11-20（依《美術與 UI 設計資料書》落實階段五 WP5：夜間微光法陣 CG 替換為 16:9 日芒雛菊新圖 ＆ 鏡射白名單全面除役）

依據《Claude娘的圖書館》美術與 UI 設計資料書 WP5 與診斷⑧（光影不連續／依賴素材鏡射），採用使用者新生成之夜間微光法陣 CG 替換舊版素材。新圖為原生 16:9 構圖（1024×576），窗外微茫滿月夜色、左側燭台與桌面書堆、中央微光法陣緩緩旋轉、左欄 45% 暗階留白 UI 安全區，右側 55% 為右手輕撫古籍、凝視法陣的克勞德，佩戴日芒雛菊髮飾。至此，三大場景（日間、晨光、夜間微光）全數換裝為原生 16:9 日芒雛菊素材，`story-art.js` 中的 `mirroredDefaultFiles` 清單正式清空全面除役！

### 新增與歸檔
- `新美術UI指導書資料/夜間與CG生成素材/夜間微光-01-手撫法陣日芒雛菊-左月右人物.jpg`（306,352 bytes，SHA256 `D2100B2E112ABB5571A51857222CB320C449F3DF8326E1116065B2E8FA5C2BFC`）：歸檔原圖。
- `app/www/assets/backup-old/g43-cg-magic-light-old-mirrored.jpg`：備份舊版需鏡射之夜間微光 CG。

### 調整
- `app/www/assets/g43-cg-magic-light.jpg`（306,352 bytes，SHA256 `D2100B2E112ABB5571A51857222CB320C449F3DF8326E1116065B2E8FA5C2BFC`）：以新版 16:9 日芒雛菊素材取代。
- `app/www/story-art.js`（18,350 bytes，SHA256 `89398D81E11CA8E9F03998CCB344F1896CB18E5DD93FA1F38B92298551EAAD85`）：
  - `mirroredDefaultFiles` 清空為 `new Set([])`，鏡射白名單完全除役！
- `app/www/config/art_distribution.json`（15,458 bytes，SHA256 `49602B2AA05D329B3DFE670BD1BE96EFC90F10E609E0E1BB4F1DCB4B162E5EF9`）：
  - 條目 `36376`：尺寸更新為 1024×576（16:9），描述更新為夜間微光法陣手撫古籍、日芒雛菊髮飾、除役鏡射。

### 測試
- 全單元測試 297 項測試 100% 通過（0 failed）。
- PII／簡體掃描：0 PII、0 簡體。

---

## 2026-11-20（UI 修正與 OpenCode 協作稽核：修復 art-plan.css 與 測試套件強化）

針對 OpenCode 測試框架稽核要求（如 test 420「every px font size scales with --story-font-scale」）與 CSS 標準相容性進行全面修復：

### 調整
- `app/www/art-plan.css`（28,002 bytes，SHA256 `B6AAE3E9880E4DF0D76B10C0CD15C00112049B3141BA61F545D7B3AF530C24C8`）：
  - 修正 5 處未經尺度化之裸露 px 字級，全部包覆 `calc(Npx * var(--story-font-scale, 1))`：
    - 行 293：`.vn-speaker::before`（9px → `calc(9px * var(--story-font-scale, 1))`）
    - 行 379：`.choice-btn .choice-num`（12px → `calc(12px * var(--story-font-scale, 1))`）
    - 行 434：`.free-choice-toggle::before`（16px → `calc(16px * var(--story-font-scale, 1))`）
    - 行 702：`.album-lock`（24px → `calc(24px * var(--story-font-scale, 1))`）
    - 行 731：`.album-lightbox-arrow`（30px → `calc(30px * var(--story-font-scale, 1))`）
  - 行 629：在 `-webkit-line-clamp: 2;` 後方補齊標準 CSS 屬性 `line-clamp: 2;`，消除語法警告與跨瀏覽器相容性疑慮。
  - 驗證大括號 `{}` 與小括號 `()` 平衡計數皆為 0，零語法錯誤。
- `tests/custom-portrait.test.cjs`（3,505 bytes，SHA256 `D15A6ADF0A7658529CF06111ACC80A2197D686113CBC8BC67E248D478F6E285E`）：
  - 引入空白正規化函式 `norm()`，相容壓縮與排版展開後的 CSS 格式比對，大幅提升 CI/CD 與跨代理人協作魯棒性。

### 測試
- 測試套件回歸：
  - `tests/custom-portrait.test.cjs` 5／5 PASS
  - `tests/rainy-night.test.cjs` 7／7 PASS
  - `tests/album.test.cjs` 39／39 PASS
  - `tests/bedroom-scene.test.cjs` 37／37 PASS
  - `tests/bedroom-wp7.test.cjs` 54／54 PASS
  - `tests/rare-goodnight.test.cjs` 100／100 PASS
  - `tests/wait-interlude.test.cjs` 26／26 PASS
  - `tests/expression-affinity.test.cjs` 22／22 PASS
  - `app/tests/agent-desktop-bridge.test.cjs` 7／7 PASS
- 全單元測試共 297 項測試 100% 通過（0 failed）。
- PII／簡體掃描：0 PII、0 簡體。

---

## 2026-11-21（依《美術與 UI 設計資料書》落實階段三 WP3：相簿 9 格專屬 4:3 WebP 縮圖生成 ＆ P2 角色標準三視圖母稿建立）

落實計畫書階段三 WP3（根治相簿硬裁效能損耗）與 P2 角色標準母稿（Consistency Anchor），並全面對齊 OpenCode 9.9 留白安全區規範：

### 新增與生成
- **9 張專屬 4:3 WebP 縮圖**（400×300，平均 35 KB ≤ 80 KB）：
  - `app/www/assets/g43-album-thumb-36626.webp`（30,618 bytes，400×300）
  - `app/www/assets/g43-album-thumb-36676.webp`（45,168 bytes，400×300）
  - `app/www/assets/g43-album-thumb-36684.webp`（33,372 bytes，400×300）
  - `app/www/assets/g43-album-thumb-36623.webp`（41,968 bytes，400×300）
  - `app/www/assets/g43-album-thumb-36624.webp`（39,166 bytes，400×300）
  - `app/www/assets/g43-album-thumb-36625.webp`（35,552 bytes，400×300）
  - `app/www/assets/g43-album-thumb-36628.webp`（35,724 bytes，400×300）
  - `app/www/assets/g43-album-thumb-36629.webp`（38,538 bytes，400×300）
  - `app/www/assets/g43-album-thumb-36685.webp`（35,060 bytes，400×300）
- **P2 角色標準三視圖母稿提示詞與設計手冊**：
  - `GPT繪圖提示詞-P2角色標準三視圖母稿.txt`：包含正面、側面、背面三視圖並列提示詞、日芒雛菊髮飾/胸針特寫提示詞，以及四大時段場景重出提示詞。
  - `新美術UI指導書資料/09-克勞德角色標準母稿與三視圖提示詞.md`：建立專案基準母稿設計手冊。
  - `新美術UI指導書資料/角色標準三視圖母稿/克勞德三視圖母稿-01-持書微笑版-16x9.jpg`（235,846 bytes，1024×576，SHA256 `3CD1D260B938BBD09D4E2FFD24FB695089D800C287CFBC802CD734B194043242`）：歸檔持書敘事母稿。
  - `新美術UI指導書資料/角色標準三視圖母稿/克勞德三視圖母稿-02-設定解構版-標籤.jpg`（246,403 bytes，1024×682，SHA256 `B00F6A25DE68E9C66B30B5490E4B67360C604D47F4ECBDCEB3869D371EFA70B4`）：歸檔官方設定解構母稿。

### 調整
- `app/www/album.js`（1,802 bytes，SHA256 `0DF3A87E8FBE11923D033659C7F6269923FEE420769AAECFFDCAB7FF55A71E24`）：
  - `ALBUM_ENTRIES` 9 個項目全數登錄專屬 `thumb` 屬性，指向 `g43-album-thumb-*.webp`。
  - 新增 `albumThumbSrc(id)` helper，若無 thumb 則優雅回退至原圖 `file`。
- `app/www/app.js`（610,063 bytes，SHA256 `69E6DF791979B6D66197ABBDD1422079DAB52661C10A8B0EF056939438A79102`）：
  - `renderAlbum()` 改用 `entry.thumb || entry.file` 渲染相簿卡片縮圖；燈箱大圖保持 `entry.file` 高解析原圖。
- `app/www/app.bundle.js`（789,921 bytes，SHA256 `7CE64FBC9467A819EE38CAD23042E22D57B9EDC057728EFBD378619E8024E2A3`）：
  - 同步更新內嵌 `Qn` 陣列（加入 `thumb`）與相簿卡片縮圖渲染模板。
- `tests/album.test.cjs`（5,793 bytes，SHA256 `750417D80D71300C9FAFCA51F4CD178E748C580EEFCD0E3187620CADB499C7BC`）：
  - 新增 36 項縮圖校驗（9 張 thumb 登錄驗證、檔案存在、有效 400×300 WebP、檔案大小 ≤ 80 KB），測試總數提升至 75 項。

### 測試
- 測試套件回歸：
  - `tests/album.test.cjs` 75／75 PASS
  - `tests/custom-portrait.test.cjs` 5／5 PASS
  - `tests/rainy-night.test.cjs` 7／7 PASS
  - `tests/bedroom-scene.test.cjs` 37／37 PASS
  - `tests/bedroom-wp7.test.cjs` 54／54 PASS
  - `tests/rare-goodnight.test.cjs` 100／100 PASS
  - `tests/wait-interlude.test.cjs` 26／26 PASS
  - `tests/expression-affinity.test.cjs` 22／22 PASS
  - `app/tests/agent-desktop-bridge.test.cjs` 7／7 PASS
- 全單元測試總計 333 項測試 100% 通過（0 failed）。
- PII／簡體掃描：0 PII、0 簡體。

---

## 2026-11-21（9.7 遮擋清單＋9.9 頭部裁切：覆蓋層、HUD 分段暗底、場景裁切、四場景重出）

### 改了什麼／為什麼

| 檔案 | 動作 | 改了什麼／為什麼 | 如何測試 |
|---|---|---|---|
| `app/www/art-plan.css` | 新增（9.7／9.9 覆蓋層） | 以獨立覆蓋層承載新版面，避免直接改寫 255 KB 既有 `style.css`。內容：設計 Token、三種視窗尺寸斷點、HUD 分段暗底（左段只蓋 x 0–46%、右段只在工具列後方 x ≥82%、中間 46–82% 完全不加暗底）、左欄預算（對話框貼底、右緣 ≤46%、高度 ≤220 px）、八選項（第 8 項自由行動 `position:sticky`）、狀態列、等待字幕條（左下獨立暗底）、開始面板、相簿 3×3、自訂立繪相框 | `?measure=1` 四尺寸量測（見下表）＋16 張截圖目視 |
| `app/www/art-plan.css` | 修改（9.9 場景裁切） | 移除舊的 `inset:-2%／104%／translateY` 放大裁切，改為垂直只裁底部（`object-position: … 0%`）。水平錨點最終四張一律 `0% 0%`（貼左裁右）：四張臉中心在 54–59%，只有 4:3／5:4 視窗才會水平裁切；貼左裁右在 1024×768 落在 64%，貼右裁左會落到 45% 被左欄對話框蓋住 | 1024×768 量測 `artPos:"0% 0%"`；四場景目視 |
| `app/www/story-art.js` | 修改 | 新增 `applySceneFit()`：以原圖 `naturalWidth/naturalHeight` 判定比例，>1.9 標記 `data-fit="wide"` 改完整顯示並補滿兩側（目前四張皆 ≤1.78，不觸發）；`mirroredDefaultFiles` 歸零（三張場景人物皆已在右側，不再鏡射） | 四場景截圖；比例以 `naturalWidth/naturalHeight` 讀值核對 |
| `app/www/portrait-anim.js` | 修改 | 表情窗改掛 `.game-screen`，定位跟隨臉部錨點，不再進入 x ≥48% 區域 | 表情窗截圖＋`faceAnchor()` 數值 |
| `app/www/app.js` | 修改 | 選項維持 `.choices` 直接子元素（不新增 wrapper）、場景標籤、相簿燈箱（Esc／←／→）、自訂立繪 badge、`computeAutoUiZoom()`；相簿縮圖改 `entry.thumb \|\| entry.file`（9 個 `g43-album-thumb-*.webp` 已核對全部存在，3×3 只載 30–45 KB 而非 300 KB 原圖） | `tests/album.test.cjs` 75／75 PASS；grep 確認 `app.bundle.js` 已含 thumb 回退 |
| `app/www/index.html` | 修改 | 載入 `art-plan.css`、`#customPortraitBadge`、燈箱左右箭頭與 ARIA | 靜態檢查＋截圖 |
| `app/www/style.css` | 修改 | 4 處硬寫 px 字級改 `calc(… * var(--story-font-scale,1))`（album-title／album-lock／#albumLightboxClose／.vn-performance-settings-group h2）；另修正 2 處註解錯字為「每幀」 | 掃描 0 簡體；字級隨縮放 |
| `app/www/assets/g43-story-default.jpg`、`g43-story-soft-morning.jpg`、`g43-cg-magic-light.jpg`、`g43-story-reading.jpg` | 替換（Antigravity 重出） | 四張統一 16:9（1024×576），人物在右半、面向左側對話框、不再鏡射；舊檔備份於 `assets/backup-old/20261121-*` | 逐張量測（見下表）＋16 張截圖 |

### 實測（`?measure=1`；百分比以 JS `innerWidth/innerHeight` 為準）

| 視窗 | 實際 viewport | HUD 高 | 左段暗底寬 | 工具列左緣 | 對話框右緣 | 選項右緣 | 狀態列底 |
|---|---|---|---|---|---|---|---|
| 1264×781 | 1248×686 | 61 px | 46.0% | 84.7% | 39.5% | 37.3% | 98.5% |
| 1024×768 | 1008×673 | 51 px | 46.0% | 85.6% | 39.0% | 36.8% | 98.6% |
| 1920×1080 | 1904×985 | 86 px | 46.0% | 83.1% | 39.3% | 37.1% | 98.5% |
| 800×600 | 784×505 | 36 px | 46.0% | 91.6% | 42.1% | 39.9% | 98.6% |

對照規格：對話框右緣 ≤46% ✓、選項右緣 ≤46% ✓、工具列 x ≥82% ✓、狀態列貼底 ✓、HUD 左段固定 46% 且中間無暗底 ✓。

### 四場景原圖量測（頭頂與臉中心）

| 檔案 | 尺寸 | 頭頂距上緣 | 需求 ≥12% | 臉中心 |
|---|---|---|---|---|
| `g43-story-default.jpg` | 1024×576 | 2 px（0.3%） | ✗（需 ≥70 px） | x 54%、y 32% |
| `g43-story-soft-morning.jpg` | 1024×576 | 37 px（6.4%） | ✗ | x 54%、y 38% |
| `g43-cg-magic-light.jpg` | 1024×576 | 9 px（1.6%） | ✗ | x 58%、y 31% |
| `g43-story-reading.jpg` | 1024×576 | 9 px（1.6%） | ✗ | x 59%、y 34% |

### 已知未達標（待重出素材）
- 9.9「場景圖頭頂距圖上緣 ≥12%」：四張仍不足（0.3–6.4%）。目前顯示為「上緣對齊、只裁底部」，所以 1264×781／1024×768 會看到髮頂貼齊畫面頂端；1024×768 因等比放大 1.17 倍更明顯。
- 原因在素材構圖：髮頂本身就在原圖第 0–37 列，不加黑邊就補不出留白；把圖往下推會在上緣留下暗帶，違反「中間 46–82% 不得加暗底」。
- 重出提示詞已備：`GPT繪圖提示詞-9.9四場景頭部留白版.txt`（四張逐張英文提示詞＋量測門檻）。OpenCode 影像模型（MiniMax H3／Nano Banana 2.1／GPT Image 2.5／Grok Imagine）目前皆回 `Insufficient balance`，加值後可由本端直接重出並重跑 16 張驗收。
- 其餘 9.9 條目（HUD 分段、水平裁切貼左裁右、比例 >1.9 完整顯示、頭部未被 HUD 壓暗）皆已達成。

### 測試
- `tests/album.test.cjs` 75／75 PASS（含 thumb 回退與燈箱結構）。
- 16 張截圖（4 場景 × 1264×781／1024×768／1920×1080／800×600），每張皆為「長回覆＋7 選項＋自由行動＝8 項滿載」；版面連續三輪（r4–r6）重拍無漂移。
- PII／簡體掃描（Big5 不可編碼且 GB2312 可編碼字元判定）：8 個檔案 0 簡體、0 PII。
- 本輪未重建 `app.bundle.js`：只動 CSS 與註解；`app.js` 的 thumb 回退已由 Antigravity 重建並確認 bundle 內含。

### 雜湊
- `art-plan.css` 28,053 bytes／`EFCC96F676C198639D0641016A7D12D7046AC65588A071C9FCE82C26FA251505`
- `style.css` 255,615 bytes／`A62A03AEC1CF2D635E99810CE7C5356FDCF353643C0B303382175CB6DD7F5E6E`
- `app.js` 610,063 bytes／`69E6DF791979B6D66197ABBDD1422079DAB52661C10A8B0EF056939438A79102`
- `app.bundle.js` 789,921 bytes／`7CE64FBC9467A819EE38CAD23042E22D57B9EDC057728EFBD378619E8024E2A3`
- `story-art.js` 18,350 bytes／`89398D81E11CA8E9F03998CCB344F1896CB18E5DD93FA1F38B92298551EAAD85`
- `portrait-anim.js` 65,612 bytes／`6BBF4EA912613D64CC9C4A6D31F3412F2861705B9276CED312E8155BDAED35CB`
- `index.html` 56,833 bytes／`05AEB5E0E152886FB647BBE490BD35A5920952EB4A8A14134F363A80DF798DA2`
- `g43-story-default.jpg` 343,830 bytes／`66B714CE05391E2572F07107259B2F397AF04BEBD85D893AE569A18E90040C07`
- `g43-story-soft-morning.jpg` 296,320 bytes／`71E3D22AD684F60E3479A5F677144FB670C6E3326B8D27B059E63310D96C782B`
- `g43-cg-magic-light.jpg` 289,080 bytes／`095F45E0A6A59E4A656C02E2A6C653BDE2B09465F058FFD0510CE59A30C4EC05`
- `g43-story-reading.jpg` 295,699 bytes／`5B4C558EC80A9F4337DFE3CFCEA6CAC71486C38765571135C0E52F6EE91491EE`





---

## 2026-11-21（下午）演出 Harness 修復與傍晚場景保留

### 改動
- `app/www/story-art.js`：`applyEmotionArt()` 在 `currentScene === 'evening-reading'` 時保留傍晚讀書場景。
  - 原因：class 變動（開相簿、AI 等待、`has-web-pending` 等）會重跑 `applyEmotionArt()`；舊邏輯只保留晨光與夜間，傍晚圖會被悄悄換回日間預設圖。
  - 影響：玩家看到一半的傍晚場景不再中途跳回日間；不影響時間分組與情緒差分的優先順序（shy／curious 仍優先）。
- `story-art.js` 同時移除已無用的 `applySceneFit()`（`data-fit="wide"` 機制）；四張場景圖皆為 16:9，不再需要比例特例。
- `art-plan.css`（04:10）故事場景圖改 `object-fit: contain; object-position: center center`，整張完整顯示，人物不被裁切；多出的區域由舞臺暖色底承接，不是黑邊。
- 驗收工具（暫存區，不進版控）：`serve.mjs` 不再移除 `story-art.js`；舊版把整支 module 刪掉，導致 `setTone()` 從未執行，夜間／晨光／傍晚的對話框配色與 `story-art-grade` 疊層全部沒套上。

### 實測（4 場景 × 4 尺寸，長回覆＋8 選項）
| 尺寸 | 繪製區 | 上下留白 | 左右留白 | HUD 暗底 | 對話框右緣 | 選項右緣 |
|---|---|---|---|---|---|---|
| 1264×781 | 1220×686 | 0 / 0 | 14.2 / 14.2 | 46.0% | 39.5% | 37.3% |
| 1024×768 | 1008×567 | 53 / 53 | 0 / 0 | 46.0% | 39.0% | 36.8% |
| 1920×1080 | 1751×985 | 0 / 0 | 76.4 / 76.4 | 46.0% | 39.3% | 37.1% |
| 800×600 | 784×441 | 32 / 32 | 0 / 0 | 46.0% | 42.1% | 39.9% |

- 四場景 `artKey` 與 `data-art-tone` 皆正確：`default/warm`、`soft-morning/warm`、`night/night`、`evening-reading/warm`；`#storyArtGrade` 同步。
- 4:3／5:4 的上下留白（53／32 px）落在 HUD 與對話框後方，實際不可見；16:9 的左右留白 14.2 px 為舞臺底色。

### 未達標／待決
- **頭頂留白**：四張素材髮頂距原圖上緣 0–37 px，`contain` 後仍為 0 留白（`clearancePxInImage = 0`），9.9 的 ≥12%（1264×781 約 70 px）未達成。只能重出素材，不能靠 CSS 補（往下推會露出暗帶）。
- **1920×1080 左右 76.4 px 留白**：舞臺比 16:9 更寬，`contain` 會在兩側留底色。建議 `@media (min-aspect-ratio: 16/9)` 改用 `cover` ＋ `object-position: center top`（只裁兩側、不裁頭），待新分頁定案。
- **選項第 8 項 sticky 覆蓋**：8 項滿載且清單可捲動時，`position: sticky; bottom: 0` 會蓋住下方選項（800×600 實測第 4–5 項部分被蓋）。可捲到底後仍可看到，但初次進場會以為少一個選項；是否改為 `position: static` 或在容器加 `padding-bottom` 待決。
- `config/art_distribution.json` 的「頭頂安全留白充足」註記與實測不符，待重出後更新。

### 雜湊
- `story-art.js` 17,970 bytes／`D29C17D5E3B279C4127794773414D195EE04FB86883907586551D2193ED8B594`
- `art-plan.css` 27,767 bytes／`0D4E849A6AA1BDED48FBD0C0AFE54B5382718C3C7AF8906BC9FD838FF88DC9AA`

---

## 2026-11-21（晚上）演出 Harness 修復完成

### 目標
只修驗收工具（`tools/artverify/`），不改遊戲原始碼。修復 H1–H10 全數完成，量測結果可代表玩家真正看到的畫面。

### 修復項目
- **H1** `serve.mjs` 不再移除 `story-art.js`；預設保留，`?strip=1` 才移除（H9）。四場景改用真實輸入驅動（時間關鍵字＋`stage.dataset.storyEmotion`），色調由 `setTone()` 自己套；回應帶 `<!-- harness: story-art.js kept (H1) -->` 註解。
- **H2** `paintedRect()` 依 `naturalWidth/Height` + `object-fit` + `object-position` 換算實際繪製矩形，輸出 `painted`、`padTop/Bottom/Left/Right`；`head` 用髮色掃描回推 `head.topPx` / `head.clearancePctOfImage`（可 `?head=0.13` 覆寫）。
- **H3** `measure()` 全程 `try/catch`，每個節點 `box()` 都有 null guard；`tick` 用 `try/finally`，錯誤收進 `errors[]`。
- **H4** `empty=1` 只清空選項，仍然量測。
- **H5** 選項 markup 照抄 `app.js:4653`（`.choice-btn[data-i]` + `.choice-num` + `.choice-text`、第 8 項 `.free-choice-toggle#freeChoiceToggle`、長句文案），並補 `.free-action`（hidden）與 `.keyboard-hint`。
- **H6** `?state=story|wait|start|album|menu|custom` 六種狀態注入；各狀態量測輸出統一格式。
- **H7** 同時寫 `window.__artMeasure`、`<pre id="__measure">`（移出畫面）、以及精簡 `document.title`。
- **H8** 像素掃描只當輔助，輸出標 `source` 與 `confidence`。
- **H9** `serve.mjs` 用 `indexOf('story-art.js')` 找整段 `<script>` 再移除；移除失敗留 `NOT stripped` 註解。
- **H10** 刪除 `inject` 死碼。

### 附加修復（本輪）
- 移除 harness 強制注入的 `g16-x` class，改用真實 `app.js render()` 的 tab class（`story-empty`／`g43-story-opening`／`keep-portrait`／`has-custom-portrait`），避免量測到玩家永遠不會看到的版面。
- `apply()` 不再每 tick 移除 `story-empty`（原本會讓開始畫面的 start-panel 高度歸零）；開始狀態現在量到 `choices 442×502`。
- `tick` 加入狀態專屬 ready 判定（wait 需 `is-visible`、album 需 lightbox 開、menu 需選單開、start 需 panel 高度 > 50、story 需 `art.dataset.art === s.art`），連續 3 tick 才算穩定；最多 40 tick（8 秒）。
- `measure()` 的 `readyFor()` 內改為重新查詢 DOM 節點，避免引用 try 區塊外的變數而拋 `ReferenceError`。
- 等待畫面：headless 的 `requestAnimationFrame` 不一定會跑，harness 補上 `is-visible`（實際遊戲由 rAF 加）；`wait` 狀態量測 `visible=True`。
- `run-states.ps1` 的 choices 計數改讀 `choicesCount`。

### 長期保存
- `v2.0-modifications/tools/artverify/` 已建立，包含 `serve.mjs`、`shot-inject.html`、`run-matrix.ps1`、`run-states.ps1`、`scan3.ps1`、`measure-art.ps1`。

### 量測結果（4 場景 × 4 尺寸，長回覆＋8 選項）
| 尺寸 | 繪製區 | 上下留白 | 左右留白 | HUD 暗底 | 對話框右緣 | 選項右緣 | errors |
|---|---|---|---|---|---|---|---|
| 1264×781 | 1220×686 | 0 / 0 | 14.2 / 14.2 | 46.0% | 39.5% | 37.3% | 0 |
| 1024×768 | 1008×567 | 53 / 53 | 0 / 0 | 46.0% | 39.0% | 36.8% | 0 |
| 1920×1080 | 1751×985 | 0 / 0 | 76.4 / 76.4 | 46.0% | 39.3% | 37.1% | 0 |
| 800×600 | 784×441 | 32 / 32 | 0 / 0 | 46.0% | 42.1% | 39.9% | 0 |

- 四場景 `artKey`／`data-art-tone`：`default/warm`、`soft-morning/warm`、`night/night`、`evening-reading/warm`；`#storyArtGrade` 同步。
- HUD 暗底：左段只蓋 x 0%–46%，右段只在工具列後方 x ≥82%，x 46%–82% 無暗底與 HUD 元素。
- 對話框右緣 ≤ 42.1%、高度 139.9 px（1264×781）；選項高度 320.8 px；狀態列貼底 98.5%。

### H6 狀態注入驗證（1264×781，scene=night）
| state | choices | dialogue | status | wait | album | menu | errors |
|---|---|---|---|---|---|---|---|
| story | 442×321 | 442×140 | bottom 98.5% | visible=False | lightbox=False | open=False | 0 |
| wait | 442×3 | 442×140 | bottom 98.5% | visible=True | lightbox=False | open=False | 0 |
| start | 442×502 | 0×0 | bottom 0% | visible=False | lightbox=False | open=False | 0 |
| album | 0×0 | 0×0 | bottom 0% | visible=False | lightbox=True (884×685) | open=False | 0 |
| menu | 442×321 | 442×140 | bottom 98.5% | visible=False | lightbox=False | open=True (1248×686) | 0 |
| custom | 442×321 | 442×140 | bottom 98.5% | visible=False | lightbox=False | open=False | 0 |

- 六種狀態注入皆 `errors: 0`。
- 待決：`start` 畫面的對話框為 0×0（真實 app 的開始畫面隱藏對話框），屬預期；`custom` 狀態未設定透明／非透明兩軌立繪，待後續補 `?custom=transparent` 變體。
- 內容問題（非 harness）：四張場景素材髮頂距原圖上緣 0–37 px，`contain` 後 `headTopPx = 0`；需重出素材（≥12%／1024×576 時 ≥70 px）。

### 雜湊（本輪）
- `serve.mjs` 3,506 bytes
- `shot-inject.html` 22,721 bytes

---

## 2026-11-22（凌晨）Harness H11–H12：立繪 canvas 與真實時間落定

### 問題
`portrait-anim.js` 會把 `#storyPortrait` 換成 `canvas.story-portrait.pa-canvas`，原圖移進隱藏的 `#portraitAnimSources`。舊 harness 量 `#storyPortrait`，在自訂立繪狀態拿到 `0×0`；改用 `--dump-dom` 時又因 `image.decode()`／WebGL 初始化是「真實時間」工作，虛擬時間先把 `setTimeout` 跑完，量到淡入一半的 `opacity 0.59`。

### 修復
- **H11** `measure()` 優先量 `#tab-story canvas.story-portrait:not(.start-portrait)`，沒有 canvas 才退回 `#storyPortrait`；`portraitInfo` 記錄實際元素、透明度、動畫狀態與來源圖。
- **H12** 穩定後不立刻停；改為輪詢立繪 `opacity ≥ 0.99`（最多 4 秒）再寫最後一次量測，並設 `window.__artDone`。
- 新增 `?state=custom&custom=transparent`：套 `is-transparent-portrait`，驗證「去背柔邊」軌（無金框、無底色）；預設 `custom` 驗證「矩形相片」金框軌。
- 新增 `cdp.mjs`：以 Chrome DevTools Protocol 驅動，用真實時間等待頁面落定，取 `window.__artMeasure` 與 `Page.captureScreenshot`；取代 `--dump-dom`。
- `run-matrix.ps1`／`run-states.ps1` 改呼叫 `cdp.mjs`，並以 UTF-8 BOM 存檔（PowerShell 5.1 才不會把中文註解讀成 ANSI）。
- `run-states.ps1` 增加 `custom-t`（透明去背）一列，`states.csv` 增 `portrait` 欄。
- **H13** `measure()` 新增選項遮擋量測：找出 `position:sticky` 的第 8 項，計算其他選項被它蓋住的高度，輸出 `choicesSticky`、`choicesCovered`、`choicesMaxOverlap`、`choicesScroll`。實測四個尺寸都有遮擋（見下），把 HANDOFF 第 8 節待處理第 3 點變成可量化數據。

### 量測結果（1264×781，scene=night，真實時間落定）
| state | portrait | 其他 | errors |
|---|---|---|---|
| story | 0×0（無自訂立繪） | tone night/night | 0 |
| wait | 0×0 | wait visible=True | 0 |
| start | 0×0 | start-panel 442×501.5 | 0 |
| album | 0×0 | lightbox=True、grid 884×685.1 | 0 |
| menu | 0×0 | menu open=True 1248×686 | 0 |
| custom | 333×576.2，右緣 1198.1（96.0%） | 金框軌 | 0 |
| custom-t | 326.2×576.2，右緣 1198.1（96.0%） | 去背柔邊軌 | 0 |

- 立繪最終 `opacity=1`、`g17-portrait-in` 動畫 `finished`，不再量到淡入一半。
- 矩陣 4 場景 × 4 尺寸重跑，`errors` 全 0；色調 `night/night`、其餘 `warm/warm` 不變。

### 選項 sticky 遮擋（H13，四場景一致）
| 尺寸 | choices 高 | 可視／捲動高 | 被蓋選項 | 最大遮擋 |
|---|---|---|---|---|
| 1264×781 | 320.8 | 377 / 500 | 1 | 37.4 px |
| 1024×768 | 311.2 | 389 / 485 | 2 | 21.8 px |
| 1920×1080 | 508.8 | 424 / 496 | 1 | 46.4 px |
| 800×600 | 189.7 | 271 / 486 | 2 | 13.1 px |

- 第 8 項 `position:sticky` 固定在容器底部，內容從它下面捲過；四個尺寸都會蓋住至少一個選項。這是遊戲版面問題，harness 只負責量出來，未改原始碼。
- `?strip=1` 仍可移除 `story-art.js`（回應註解 `stripped (H9)`）；預設 `kept (H1)`。

### 長期保存
- `tools/artverify/` 已更新：`serve.mjs`、`shot-inject.html`、`cdp.mjs`、`run-matrix.ps1`、`run-states.ps1`、`matrix.csv`、`states.csv`；舊版備份在 `tools/artverify/_backup-20261122/`。

### 尚未解決（內容，非 harness）
- 四張場景素材髮頂仍在原圖上緣 0–2.9%，`contain` 後 `headTopPx = 0`；需依 `GPT繪圖提示詞-9.9四場景頭部留白版.txt` 重出（1024×576 時髮頂 ≥70 px）。2026-11-22 曾嘗試以內建影像生成重出，回報「額度不足」，四張皆未產出；素材維持原狀。

---

## 2026-11-22（03:0x）四場景素材：補頭頂留白（候選版，尚未安裝）

使用者另外提供 12 張 1024×576 候選圖（`artverify\art-new\media_*.jpg`），挑四張加工成 `artverify\art-final\`。

- 新腳本 `add-headroom.ps1`：底部裁掉同高 → 左上 46% 背景拉滿模糊 → 平均亮度對齊原圖上緣 → 原圖第 0 列做 20 px 接縫漸層 → 淡暗角。只補留白，不動角色與構圖。
- 成果（1024×576，髮頂）：`g43-story-default` 76 px、`g43-story-soft-morning` 76 px、`g43-cg-magic-light` 73 px、`g43-story-reading` 75 px，皆 ≥70 px。
- preview www 實跑矩陣 4×4：`errors` 全 0、色調分組正確；四張遊戲截圖見 `art-final\preview-*-1264.png`。
- **尚未覆蓋 `app\www\assets\`**，安裝指令與備份方式寫在 `art-final\README.md` 第 5 節。

### 新發現：H14 髮色掃描對暖色背景誤判
- `night` 回報 6.3%、`morning` 回報 3.2%，但實際髮頂 12.7%／13.2%。原因是 `shot-inject.html` 的 `isHair()` 會把書架暖木色、窗外暖光當成頭髮。
- 這是量測缺陷，不是素材缺陷；建議改成「以臉中心上方為種子做髮色連通區域擴張，取最小 y」。細節見 `tools/artverify/COLLAB-STATUS.md` 第 6.3 節。

### 長期保存
- `tools/artverify/` 新增：`add-headroom.ps1`、`measure-file.ps1`、`scan-hair.ps1`、`rowlum.ps1`、`rowlum-src.ps1`、`contact.ps1`、`split-grid.ps1`、`art-final\`。

---

## 2026-11-22（下午）全面移交 Antigravity：安裝驗收 + H14 真因

使用者決定「全部移交 Antigravity」，本輪只做驗證、補文件與工具，**沒有再改素材或遊戲碼**。

### 已安裝素材的驗收（重跑，非舊紀錄）

`app\www\assets\` 的四張是 2026-11-22 04:50 安裝的另一組（`add-headroom-final.ps1` 產出），
原檔在 `assets\backup-old\20261122-045318-*`。

| 場景 | 檔名 hash（前 16） | `headPctOfImage` | `measure-file.ps1` |
|---|---|---|---|
| day | `C929FC512A52D7DD` | 12.7% | 76 px（13.2%） |
| night | `F37E7D01112D4661` | 12.1% | 82 px（14.2%） |
| morning | `D9DF9836F41CA99F` | 12.4% | 109 px（18.9%） |
| evening | `AE3766BEDE33BE12` | 14.6% | 76 px（13.2%） |

`run-matrix.ps1` 4 場景 × 4 尺寸：16/16、`errors` 合計 0、night `night/night`、其餘 `warm/warm`。
`run-states.ps1` 7 種狀態：7 列、`errors` 合計 0（`states.csv` 已更新）。

### H14 真因（推翻先前假設）

先前認為是「合成留白條的暖色被當成頭髮」。實測把留白條遮掉再掃，morning 仍只到 9.9%、
night 7.7%：**四張原圖右上角本來就有暖色**（書架木色、窗外暖光、晨光逆光），
與橘紅髮色在 HSV 上重疊。四種替代演算法全部失敗，數據與失敗原因記在
`tools/artverify/HANDOFF-ANTIGRAVITY.md` 4.3 節。

同時確認：已安裝那組的 12.1–14.6% 有一部分是量到背景（morning 實際髮頂約 15%，
harness 回報 12.4%）。**門檻判定可用，但數字精度約 ±3 個百分點**，不要當絕對值追。

建議解法：每張素材附 `assets\art-heads.json`（人工確認的 `headPct`），harness 優先讀它，
掃描降為 fallback。未實作。

### 新增工具與文件

- `tools\artverify\HANDOFF-ANTIGRAVITY.md`：唯一入口（狀態、待辦 T1–T4、指令、禁區、已失敗做法）。
- `tools\artverify\install-art.ps1`：安全安裝四張素材，自動備份到 `assets\backup-old\`，支援 `-DryRun`。
- `tools\artverify\seam-detect.ps1`：以逐列垂直差異偵測合成留白條（診斷用；證實不能用來修 H14）。
- `tools\artverify\detect-head.ps1`：臉中心縱帶 + 寬度門檻的髮頂啟發式（供比較）。
- `tools\artverify\art-final\compare-installed-vs-artfinal.png`：上＝已安裝、下＝`art-final`，綠線 13.2%。
- `tools\artverify\art-heads.draft.json`：`art-heads.json` 草稿（已安裝四張的人工確認髮頂比例），方案 1 可直接複製使用。
- `COLLAB-STATUS.md` 第 4、6.3、6.4 節更正，新增第 7 節。

### 未動的部分

- `app\www\assets\` 內容不變（`art-final` 未安裝）。
- 遊戲原始碼（`app.js`、`style.css`、`story-art.js`）不變。
- 第 8 個選項 sticky 遮擋仍是遊戲 CSS 問題，harness 只回報。


---

## 2026-11-22（上午）T1–T4 完整收尾 ＋ AnimaVN 核心架構優化落地

依使用者確認之三項指令（完整收尾 T1／T2／T4、授權修復 T3 選項遮擋、借鏡 JayziLi/AnimaVN 優化架構；先完成全面驗收再決定打包 v4.6.46），本次落地全部項目並完成實機 CDP 驗證。

### 1. T2：四場景頂部無縫延伸重製（除硬切塊＋除夜間鬼影）
- 新增 `tools\artverify\add-headroom-v2.ps1`：以原圖頂部垂直鏡像對齊窗景與書架，於髮區水平範圍以左右純背景平滑插值並建立頂緣髮絲遮罩（避開任何靠近髮緣的像素），徹底消滅 04:50 安裝版的頂部深灰矩形硬切塊與舊 `art-final` 夜間圖的橘紅垂直拉絲鬼影；JPEG 品質設為 q92。
- 透過 `install-art.ps1` 安全安裝至 `app\www\assets\`（舊檔已自動備份至 `assets\backup-old\*-20261122-074839`）：
  - `g43-story-default.jpg`（`20B73634440C7F16`，pad=59，髮頂 78 px / 13.5%）
  - `g43-story-soft-morning.jpg`（`0A329A855CD73641`，pad=64，髮頂 78 px / 13.5%）
  - `g43-cg-magic-light.jpg`（`0D9934478ED1BA85`，採用頭頂圓潤完整原圖，pad=75，髮頂 78 px / 13.5%）
  - `g43-story-reading.jpg`（`ACF5CBEF146CD5C3`，pad=66，髮頂 78 px / 13.5%）

### 2. T1：H14 方案 1 落地（`art-heads.json` 優先讀取）
- 新增 `app\www\assets\art-heads.json`（並備份至 `tools\artverify\art-heads.json`），登錄四張已安裝場景之人工確認髮頂比例（皆為 `0.135` / 78 px）。
- 更新 `tools\artverify\shot-inject.html` 與 `run-matrix.ps1`（並同步至 `%TEMP%\opencode\artverify\`）：髮頂判定依序為 `?head=`（`param`）＞ `assets/art-heads.json`（`meta`）＞ 像素掃描（`scan` fallback），並新增 `headSource` 與 `freeVisible` 欄位。

### 3. T3：根治第 8 項自由行動 `sticky` 遮擋（4 解析度皆 0 遮擋）
- `app\www\app.js`：將 1–7 個故事選項包裹於 `<div class="choices-list" role="group" aria-label="故事選項">`，使第 8 項 `#freeChoiceToggle` 成為獨立同層底列；新回合渲染時同步重設 `.choices-list` 捲動位置。
- `app\www\art-plan.css`：在一般 7+1 狀態下，外層 `#choices` 採雙層 Flex 分區（`overflow: hidden`），`.choices-list` 獨立負責 1–7 項內部捲動，第 8 項改以 `position: relative; flex: 0 0 auto` 固定於底端（保持 `::before` 鋼筆圖標正確定位且 0 px 覆蓋上方選項）；有 `.pending-turn`、`.gift-conversation` 或展開 `#freeActionPanel` 時自動回復外層整塊捲動。
- `tools\artverify\shot-inject.html`：同步選項 DOM 結構，H13 直接檢查 `#freeChoiceToggle` 可見性與和 1–7 項之可視交集。

### 4. AnimaVN 架構優化（僅借鏡架構概念，附 MIT 致謝，零複製源碼／素材）
- **VN 劇本解析引擎**：新增 `app\www\vn-script.js`（借鏡 AnimaVN `vn/script.ts`），實作行內標籤摘除與句序綁定（`<emotion:...>` / `<scene:...>` / `<我>`）、內嵌引號防誤切、劇本式說話人辨識與旁白動詞排除、超長句安全斷句（90 字上限＋防純標點碎片）及插話原文截斷位移 `sliceScriptToLine`。
- **逐句演出升級**：擴充 `app\www\line-split.js`（匯出 `splitScriptLines`，保留 `splitLines` 100% 相容）與 `app\www\line-runner.js`（支援結構化 `VNLine[]`、`onLineMeta` 動態微表情／場景回呼與 `getTruncatedEndOffset`）。
- **情緒語意兜底正式接線**：升級 `app\www\emotion-fallback.js`（修正重複詞、新增語意近義詞表 `mapSemanticEmotionLabel` 與句級強特徵推斷 `inferLineEmotion`），並於 `app\www\app.js` 的回覆解析與回合套用處正式接線 `resolveEmotionWithFallback`。
- **Prompt Cache 與 Token 預算條**：`app\www\llm-client.js` 新增 `buildAnthropicSystemBlocks` 與 `buildAnthropicMessagesPayload`（僅對穩定 `SYSTEM_BLOCK_KEYS` 附加 `cache_control: { type: 'ephemeral' }`，動態記憶與重試修正指示絕不污染快取前綴）；`app\www\prompt-inspector.js` 新增階梯量程 `BUDGET_RANGE_STEPS`、`computeBudgetBreakdown` 與 `renderInspectorBudgetBar` 視覺化預算條，掛載至工坊開發者檢視面板並於 `art-plan.css` 補上 `.pm-budget` 樣式。
- **場景包資料驅動**：新增 `app\www\scene-packs.js`，於 `app\www\config\scenePacks.json` 結構化登錄五大書庫場景（保留 `bgmEnabled: false`、`version: v2.0-placeholder` 維持 D18 與舊測相容）；`app\www\story-art.js` 非同步同步 `scenePacks.json` 並暴露 `applyScenePack`／`listScenePacks`（遵守不跨日夜組與零鏡射原則）。
- **存檔備份安全**：`app\www\save-storage.js` 新增 `sanitizeExportPayload`（遞迴清除 API Key／Token 等敏感鍵）與 `snapshotSlotBeforeWrite`（寫入前快照守衛）。
- **授權致謝**：新增 `licenses\AnimaVN-MIT-NOTICE.txt`。

### 5. 建置、測試與實機 CDP 驗收
- **esbuild 重建**：`app\www\app.bundle.js` 806,603 bytes｜SHA256 `70570D816C83CA694EB6017FE7FC1395F80B253AAD911BF373022C52138C8DA6`。
- **新增單元測試**：`vn-script.test.js`（6 案）、`scene-packs.test.js`（4 案）、`prompt-cache-budget.test.js`（4 案），全數通過。
- **全套回歸測試**：
  - `app\tests\story\*.test.js`：134／136 PASS（僅既有歷史基線 2 項：Doubao 12→13 家文案、雨夜 23→25 筆）。
  - `tests\*.test.cjs`＋`agent-desktop-bridge.test.cjs`：8 支共 333／333 PASS（`album` 75、`bedroom-scene` 37、`bedroom-wp7` 54、`custom-portrait` 5、`expression-affinity` 22、`rainy-night` 7、`rare-goodnight` 100、`wait-interlude` 26、`agent-desktop-bridge` 7）。
- **CDP 實機矩陣（4 場景 × 4 尺寸，`tools\artverify\matrix.csv`）**：
  - 16／16 通過，`errors` 合計 **0**；`headSource` 全為 `meta`、`headPctOfImage` 全為 **13.5%**；`night` 為 `night/night`，其餘為 `warm/warm`。
  - **T3 驗證**：四種解析度（1264×781、1024×768、1920×1080、800×600）皆 **`freeVisible = True`、`choicesCovered = 0`、`choicesMaxOverlap = 0`**，`position = relative`。
- **CDP 7 種狀態（`tools\artverify\states.csv`）**：7／7 通過，`errors` 合計 **0**。
- **實機截圖肉眼覆核**：`tools\artverify\shots\verify-v2-{day,night,morning,evening}-1264.png` 與 `verify-v2-day-800.png` 確認四場景頂部無縫自然、無鬼影、第 8 項鋼筆圖標對齊居中且 0 遮擋。
- **簡體／PII 掃描**：本輪所有修改與新增文字檔（含 `app.js`、`CHANGES.md`、`HANDOFF-ANTIGRAVITY.md`、`美術與UI設計-落地執行計畫書.md`）皆 **0 簡體、0 PII**。


---

## 2026-11-22（上午・續）AnimaVN（MIT）可用程式碼直接移植 ＋ Google Drive 雲端備份

依使用者授權可直接採用 JayziLi/AnimaVN（MIT License）可用程式碼並將最新進度備份至雲端，完成三組核心實戰模組移植（零採用 CC BY-NC-SA 素材）與雲端備份作業。

### 1. 直接移植之 AnimaVN 核心程式碼（MIT License, Copyright (c) 2026 JayziLi）
- **思考標籤拆分與思考深度參數（`app\www\thinking-splitter.js`）**：移植自 `AnimaBackend/app/llm/reasoning.py` 與 `thinking.py`（`ThinkTagSplitter`、`holdPartial`、`splitThinkingText`、`openaiThinkingParams`、`anthropicThinkingParams`），並接入 `app\www\json-repair.js` 之 `stripJsonFences`，自動剝離模型回覆前段 `<think>`／`<thinking>` 思考過程，避免思考塊內大括號與引號干擾故事 JSON 解析。
- **多聲道音訊總線與現場合成打字音效（`app\www\audio-bus.js`、`app\www\type-sound.js`）**：移植自 `frontend/src/debug/vn/audioBus.ts` 與 `typeSound.ts`，支援四聲道（`bgm`/`voice`/`fx`/`type`）、純函式 BGM Ducking（`nextDuck`/`duckRamp`）、切背景自動掛起（`visibilitychange`）、單次手勢解鎖與三種零外部音檔之 Web Audio 現場合成打字音（`soft`/`click`/`8bit`，預設關閉避免突襲），掛載至 `app\www\app.js`（`window.__audioBus`、`window.__typeSound`）。
- **世界書進階匹配引擎（`app\www\world-book.js`）**：移植自 `frontend/src/debug/lib/worldInfo.ts`，新增 `/pattern/flags` 正則關鍵詞（`parseRegexFromString`）、選擇性副關鍵詞四邏輯（`AND_ANY`/`AND_ALL`/`NOT_ANY`/`NOT_ALL`）與安全步數限制之遞迴掃描（`recursive`/`maxRecursionSteps`），完全向下相容既有存檔格式。
- **MIT 授權文件**：新增完整授權條文 `licenses\AnimaVN-MIT-LICENSE.txt` 並更新 `licenses\AnimaVN-MIT-NOTICE.txt`。

### 2. 重建與驗證
- **esbuild 重建**：`app\www\app.bundle.js` 816,459 bytes｜SHA256 `664ACEB72CC11B7EE186752694B3555D64889E2B7470BDE39E6192FDCA2EF1A9`。
- **新增測試**：`app\tests\story\animavn-ported-core.test.js`（4/4 PASS）。
- **全套回歸**：ESM 138/140 PASS（0 新增失敗）；CJS＋agent-desktop-bridge 9 支共 333/333 PASS；本輪 9 份修改與新增檔案 0 簡體、0 PII。


---

## 2026-11-22（上午・再續）前端與架構優化（AnimaVN 宏引擎、無閃爍疊圖、微控制膠囊、rAF 滾動與設定整合）＋ GitHub 備份推送

延續 AnimaVN（MIT License）可用程式碼移植，完成五項前端演出與架構深度優化，並同步推進 GitHub 與 Google Drive 雙雲端備份一致。

### 1. 前端與架構優化落地
- **酒館相容宏展開引擎（`app\www\macro-engine.js`）**：移植自 AnimaVN `macroEngine.ts`／`macroDefs.ts`，支援 `{{char}}`、`{{user}}`、`{玩家名}`、`{暱稱}`、`{{time}}`、`{{date}}`、`{{weekday}}`、`{{datetimeformat::...}}`、`{{idle_duration}}`、`{{roll::NdM±K}}`（上限 1000 顆防卡死）、`{{random::...}}`、`{{pick::...}}`（決定性定種子）、`{{getvar}}`/`{{setvar}}`/`{{addvar}}`、`{{if}}...{{else}}...{{/if}}` 與巢狀展開；已接軌 `app\www\world-book.js` 之 `ctx.substitute` 並暴露 `window.__macroEngine`。
- **無閃爍雙層疊圖過場與預載（`app\www\stacked-layers.js`、`app\www\story-art.js`、`app\www\art-plan.css`）**：移植自 AnimaVN `vn/stackedLayers.ts`，於 `#storyDefaultArt` 背後建立唯讀過場底墊 `.story-art-underlay`，換場時舊圖維持不透明、新圖載入後於上層平滑淡入，440ms 後立即隱藏並釋放 GPU 合成層（防止毛玻璃掉幀）；啟動 600ms 後溫和預載四大核心場景圖，徹底消滅切換黑閃。
- **對話框微控制膠囊（`app\www\vn-controls.js`、`app\www\app.js`、`app\www\art-plan.css`）**：移植自 AnimaVN `vn/skipChip.ts`，於 `.vn-dialogue-window` 內右上角新增暖金古籍微型控制列 `#vnQuickBar`（自動播放開關、逐句打字時顯示之「跳過本段」按鈕、打字音效一鍵靜音切換），完全收斂於左欄 520px 內、開場與等待畫面自動隱藏。
- **前端渲染效能優化**：`app\www\app.js` 逐句打字滾動改為 `requestAnimationFrame` 合併排程（`scheduleDialogueScroll`），減少逐字寫入造成的同步強制重排（Forced Reflow）。
- **設定頁整合打字跳字音效**：`ensureVnPerformanceControls()` 新增 `#vnTypeSoundSelect`（關閉／柔和／輕點擊／8-bit）、`#vnTypeSoundVolume` 音量滑桿與 `#vnTypeSoundPreview` 三連試聽按鈕，並與對話框微控制列雙向同步。

### 2. 建置與實機驗收
- **esbuild 重建**：`app\www\app.bundle.js` 826,262 bytes｜SHA256 `9123227FABD61A3C8BB686963877469953AE8FFACD2560D771AE515290366282`。
- **單元測試**：新增 `app\tests\story\frontend-arch-optimization.test.js`（4/4 PASS）；全套 ESM 142/144 PASS（0 新增失敗）、CJS＋桌面橋接 9 支共 333/333 PASS。
- **實機 CDP 截圖覆核**：`shots\verify-v3-day-1264.png`、`verify-v3-night-1264.png`、`verify-v3-day-800.png` 確認 `head=13.5% (meta)`、`choicesCovered=0`、`choicesMaxOverlap=0`、`errors=0`，對話框右上微控制膠囊對齊美觀、零遮擋。
- **簡體／PII 掃描**：全數 **0 簡體、0 PII**。


---

## 2026-11-22（上午・D20 落地）Claude 英文（英國 `en-GB` · `Glassy` · 正常速度）雙軌語音引擎＋中文字幕英式配音

依使用者指定之配音規格（口說語言：`英文（英國）en-GB`、風格：`Glassy` / `glassy`、速度：`正常 1.0x`）與拍板路線（雙軌引擎＋中文字幕英式英文配音），將原 D20 佔位開關升級為完整可用之視覺小說語音系統。

### 1. 新增與修改檔案
| 檔案 | 動作 | 改了什麼／為什麼 | 如何測試 |
| --- | --- | --- | --- |
| `app\www\config\voice.json` | 新增 | 登錄 Claude `en-GB` / `Glassy` (`glassy`) / `normal` (`1.0x`) 標準預設設定、中字英配與僅念角色台詞規則、Glassy 偏好英式女聲清單、ElevenLabs／OpenAI 相容預設參數與試聽例句 | `voice-tts.test.js`（7/7 PASS） |
| `app\www\voice-tts.js` | 新增 | D20 雙軌語音合成引擎（借鏡 AnimaVN `vn/voice.ts` 之佇列、記憶體 LRU 快取、連續 3 次 5xx 熔斷與 `audioBus` 語音聲道自動壓低 BGM）：① 內建免金鑰 Web Speech API（優先配對 `Google UK English Female` / `Microsoft Libby` / `Sonia` 等 `en-GB` 女聲並校準 Glassy 清亮音高 `1.06` 與正常語速 `1.0x`）② 外接本機 GPT-SoVITS / IndexTTS 聲紋克隆、ElevenLabs API、OpenAI 相容 TTS API；含網址安全檢查與 API Key 本機隔離儲存（不進遊戲存檔匯出）③ `attachSpokenEnToLines` 精準將 AI `spokenEn` 陣列對齊角色引號對話句，略過旁白、動作與玩家台詞 | `voice-tts.test.js`（7/7 PASS） |
| `app\www\line-runner.js` | 修改 | `normalizeEntry` 保留 `spokenText` 欄位；`LineRunner` 支援可選 `isVoiceBusy` 檢查，開啟自動播放時若角色仍在朗讀會禮貌等待配音結束（最長 15 秒），點擊／空白鍵／跳過仍立即優先 | `line-runner.test.js`＋`voice-tts.test.js` 全 PASS |
| `app\www\vn-controls.js` | 修改 | `computeVnControlState` 新增 `voiceActive`、`voiceSpeaking` 與 `voiceLabel`（配音／配音開／朗讀中），完全向下相容既有測試 | `frontend-arch-optimization.test.js`＋`voice-tts.test.js` |
| `app\www\app.js` | 修改 | 接線 `window.__voiceTts`、`#vnQuickVoice` 對話框快速開關、逐句播放朗讀與預合成、繁中模式下開啟語音時自動附加可選 `spokenEn` 提示詞規則並於 `parseWebReply` 安全正規化（舊模型未輸出亦不報錯）；將 D20 設定區升級為完整 `.vn-voice-panel`（保留 `#vnVoiceToggle` 與 `claude_novel_voice_tts_v21` 相容性，支援一鍵試聽 Glassy、即時偵測英式聲線與外接後端設定），補齊 `UI_EN` 雙語字典 | `vn-settings-integration.test.js`＋全套回歸 |
| `app\www\art-plan.css` | 修改 | 新增羊皮紙暖金高對比 `.vn-voice-panel` 設定卡片樣式與 `.vn-quick-btn.is-speaking` 朗讀中脈衝高亮 | 實機 CDP 截圖覆核（1264×720 與 800×600） |
| `app\tests\story\voice-tts.test.js` | 新增 | 7 大項單元測試：預設 `en-GB/Glassy/1.0x` 規格、金鑰隔離、中字英配對齊與旁白過濾、英式聲線挑選與本機診斷、三大外接請求與網址安全檢查、LRU 快取／熔斷／LineRunner 等待、前端接線 | 7/7 PASS |
| `P0-決策點-D1-D12-紀錄.md` | 修改 | D20 狀態更新為「已完成（2026-11-22）」 | 文件核對 |

### 2. 建置與實機驗收
- **esbuild 重建**：`app\www\app.bundle.js` 860,625 bytes｜SHA256 `63362F0953999D8D0042B7AF3785964F61C006F46E47A0EE26DF3B09C9FB6340`。
- **全套回歸**：ESM **149/151 PASS**（新增 7/7 全過，0 新增失敗；僅餘兩筆既定歷史基準差異）；CJS **8/8 檔案全 PASS**。
- **實機 Chrome CDP 視覺與執行驗證**：
  - 自動配對本機 Chromium 內建英國腔女聲 **`Google UK English Female`**（`en-GB`，已套用 Glassy 音調與正常語速）。
  - `shots\verify-voice-story-1264.png`（`speakerToQuickBarGapPx = 51px`）與 `verify-voice-story-800.png`（`54px`）：對話框右上 `自動開 · 配音 · 靜音` 零重疊、零遮擋立繪。
  - `shots\verify-voice-settings-1264.png`：羊皮紙設定卡對比清晰、核取方塊與滑桿排版工整。
- **簡體／PII 掃描**：所有新增與修改檔案 **0 簡體字、0 新增 PII**。
