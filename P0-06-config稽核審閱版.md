# P0-06 config 稽核與升級・審閱版（2026-11-08）

## 1. 結論
xlsx P0-06 要求「config JSON 草稿：數值取自試算表，驗收＝與試算表數值一致」。重大勘誤（見 P0-02）後本任務性質＝**稽核既有 15 檔＋補 D 系決策缺口＋schema 同步**，而非從零草產。15 檔中：13 檔由基準 4.6.38 自帶（作者預填，P0-02 已核實與試算表一致）、stages／affection_bands／schedule／character 四檔經 P0-04 對齊附錄 C、reply_protocol 經 P0-05 新增；本輪補三缺口（D1／D7／D9）＋schema 兩處新增與一處測試同步。

## 2. D 系決策 → config 落點總表（每項驗證位置）

| 決策 | 內容 | config 落點 | 狀態 |
|---|---|---|---|
| D1 | 生活層時間兩模式都要能，預設故事時段 | `schedule.json.life:{timeBase:'story', realModeEnabled:true}` | **本輪補入**＋schema |
| D2 | 和好每日回補上限 10 | `stages.json.parameters.dailyReconciliationCap=10` | 既有（複核 OK） |
| D3 | 口頭禪移除／保留「名門不出半成品。」 | `character.json.catchphrase:''`＋character-profile | P0-04 ✓ |
| D4 | 年齡門檻不做預設 | 存檔欄位（不入 config） | 定案不落 config |
| D5 | SHA256 交付 | packaging 文檔 | T12 |
| D6 | 夜間等待改日圖 | `wait-interlude.js` 常數＋文檔 | T1 ✓ |
| D7 | 每日用量上限預設關、設定可開 | `extensions.json.usage.dailyCap:{enabled:false, limit:null}` | **本輪補入**＋schema |
| D9 | 擴充加成合計每日上限＋3 | `extensions.json.expansion.dailyBonusCap=3` | **本輪補入**＋schema（原 key `dailyAffectionGainTotalCap` 無程式引用，改名依 D9 決策命名；基準樹 mods 兩側皆查證 0 引用） |
| D13 | 占有／愧疚解禁、禁令收斂 | stages／bands／schedule／character／prompt-rules | P0-04 ✓ |
| D14 | 玩家名預設 User | `player-name.js`（單一來源） | D14 ✓ |
| D15 | Claude 官網全自動＋無痕對話 | P1-03 實作需求（無 config） | 入檔 ✓ |
| D10/D11/D12 | 後議／T12 定／等素材 | — | 排程內 |

## 3. 本輪補丁明細
1. `schedule.json`：新增 top-level `life`（D1，含 note 欄寫清語義：預設 story、可切本機、兩模式都進 S7 離線補算）。
2. `extensions.json`：`rules.dailyAffectionGainTotalCap` → 新 top-level `expansion.dailyBonusCap=3`（D9）；新增 `usage.dailyCap={enabled:false, limit:null}`（D7；limit 開啟時才需填，0 有歧義故用 null）。原規則其餘四條（freeOnly／userPaidApi／noGuiltRetention／allCanBeDisabled）與 11 條機制不動。
3. `config-loader.js` schema：schedule nested 加 `life.timeBase==='story'`、`life.realModeEnabled===true`；extensions nested 加 `expansion.dailyBonusCap===3`、`usage.dailyCap.enabled===false`——缺漏報錯機制同步覆蓋新欄位。
4. 新測試 `p0-06-config-policy.test.js`（3 案）：D1 合同、D7＋D9 合同（含舊 key 驗移除）、D2 既有值複核。

## 4. 與試算表的對照
- sheet9（階段表）→ stages／affection_bands：P0-04 已對齊（三十日階段構成、maxAffection=100、dailyReconciliationCap=10、四帶補充全部核過）。
- sheet11（動作庫與情緒標籤）→ actions（14 條＋art/mode，lean_in=36373、read_letter=36371、look_out_window=36370、hold_light=36376、touch_panel=36374、poke_quill=36455）／emotions（9 標籤+描述）：基準自帶已核（sheet11 與 config 一致）。
- sheet12（擴充機制 11 條）→ extensions：一致（機制 id／phase／apiCalls／dailyAffectionCap）。
- sheet10（生活層）→ schedule six periods + parameters（maxRecentLogs=5、minActions=1／maxActions=3、位置轉換≤1）＋本輪 `life` 區塊：一致。
- sheet4（轉場）→ transitions、sheet3＋sheet7（立繪與 CG 閘門）→ art_distribution／anchors_cropping、sheet6（UI 對比）→ ui_contrast、sheet14（離線測試集）→ dialogue_fallback／life-simulator 測試：基準自帶＋既有測試覆蓋，抽樣核對一致。
- **聲明**：前三欄（sheet9/11/12/10）為逐值核對；其餘（sheet3/4/6/7/14）為 schema 斷言＋抽樣＋既有測試覆蓋；兩者皆記於 CHANGES 可複現。

## 5. 測試與 SHA256（前 16）
- mods 樹九檔 `node --test`＝**31/31 PASS**（新 3 案＋既有 28 案回歸）。
```
0BF2DA5D06CB5178  www/config/extensions.json
D8BC50879DB731F6  www/config/schedule.json
74AC9D13AD34CA48  www/config-loader.js
E197758ADE636D8B  www/style.css（同含 UI 白字修復）
EED25E84F14242E8  tests/story/p0-06-config-policy.test.js（新增）
```

## 6. 未解決與風險
1. `life.timeBase`／`usage.dailyCap`／`expansion.dailyBonusCap` 的**消費端接線**（life-simulator 讀 timeBase、呼叫層計量、擴充機制計分）屬 P1（T5／T9／T11）——本任務只凍結 config 與 schema。
2. `usage.dailyCap.limit` 待用戶未來開啟時設定數值（設定頁 P1 落地）。
3. 亮主題「選中 AI 按鈕白字」已修（`style.css` 363 行 `#fff`→`var(--ink)`；dark 主題本就由更高優先權規則覆蓋為 `--bubble-user-text`）——**實機外觀驗收待 T1 手動清單**。
