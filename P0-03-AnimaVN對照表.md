# P0-03 AnimaVN 對照分析（做法 → 檔案 → 工作量 → 風險）

依據：工作執行表 P0-03、指示書附錄 D（唯讀研讀、不使用 DeepSeek娘素材、引碼附 MIT 致謝）。
研讀樹：`D:\AnimaVN-main\`（v2026.10.28 源碼）；整合包在 `D:\AnimaVN\AnimaVN\` 已跑通（`/api/health` ok）；示範卡示範行為驗證另行記錄。
平台決策：**路線 A**（沿用 4.6.38 原始碼借鏡擴充，不以 AnimaVN 為底）。

## 19.1 十三做法對照表

| # | AnimaVN 做法（來源） | 我們的落地（S/任務） | 要動的檔案（4.6.38 基準） | 工作量 | 風險 |
|---|---|---|---|---|---|
| 1 | 逐句演出，每句帶情緒標籤、可插話（frontend/src/debug/plugins/jev.js、player.ts；specs/2026-09-25） | P1-09 逐句演出 | 新 `www/line-split.js`；改 `www/app.js` render/applyTurn、`www/story-emotion.js`（worried/tender）、`tests/ui/…` | 3–5 天 | **中**：七選項協議與插話的交界（該回覆截到那句）；分支存檔掛鉤 P3-13 |
| 2 | 情緒標籤名稱對不上→本機小模型挑最像（AnimaBackend/app/emotion/matcher.py，bge-small-zh int8 ≈25MB，cosine 無門檻恆回最接近） | P1-04 | 新 `server/emotion-fallback.js`＋模型檔；改 `server/server.js` parse 後段、`www/story-emotion.js` 白名單 | 2 天 | 低：純加法；模型離線常駐 +24MB |
| 3 | 上傳立繪自動找臉算錨點（AnimaBackend/app/sprite_faces.py，lbpcascade_animeface，opencv 4.x 釘住） | P1-07 | 新 `tools/face-anchor.js`（Node 生態缺純 JS animeface → 方案 a：opencv4nodejs 原生依賴；方案 b：離線人工座標＋抽查） | 2–3 天 | **中**：原生依賴跨平台；Microsoft 平台上 opencv4nodejs 編譯麻煩 → 建議先 b 後 a |
| 4 | 場景包（背景+BGM）、CG 差分、切換特效（plugins/scene.ts、cgPacks.ts、specs/2026-09-23） | S1 config 素材包化＋S4/S9 | `www/config/scenePacks.json`、`art_distribution.json` 擴充「特效」欄；`www/story-art.js` 特效層 | 3 天 | 低中 |
| 5 | 每段對話一存檔、任一句分叉、歷史回看/重播/重來（debug/lib 存檔 codec） | P3-13 | `www/save-storage.js`（v3 fork keys）、`www/app.js` 歷史頁 | 3–4 天 | **中**：v2 存檔相容遷移必須雙向讀取 |
| 6 | 提示詞檢視器：各區塊 token 與來源（docs/superpowers/specs/2026-08-19-token-budget…） | P1-02/S2 | 改 `server/server.js` 組裝輸出結構化明細、`www/app.js` 開發者面板 | 2–3 天 | 低 |
| 7 | 世界書關鍵詞觸發注入＋預算（specs/2026-09-29 world-info sillotech compat） | P2-02/S6 | 採用現成 `www/world-book.js`（0 天基座）＋資料源接卡 | 0.5–1 天 | **低（已有）** |
| 8 | 預設區塊拖動排序/開關/改內容（plugins/registry.ts 一表管理 blockId） | S2 | `prompt-rules.js` 已有 rulesOff；擴「區塊清單單一來源」模式與拖動 UI | 2 天 | 低 |
| 9 | 預設要求 AI 不代寫玩家言行 | S2 | 核對已進 `prompt-rules.js`/`17.4` 措辭 | 0.5 天 | 低 |
| 10 | 多供應商＋Anthropic prompt cache＋思考拆分＋Mock | P1-05/S2/S3 | 改 `server/server.js`（cache_control 前段固定區塊）、`www/app.js` 金鑰頁 | 3–4 天 | **中**：cache 讚但有整理成本；Mock 已有基底 |
| 11 | 設定頁右側即時預覽；BGM 說話時壓低 | S3/P3-14 | `www/app.js` 設定頁預覽；**BGM 尚無**→先補素材再 ducking | 2 天 | 低 |
| 12 | 啟動先備份再升級 DB、一鍵備份、金鑰不入備份 | P2-13 擴充 3 | `www/save-storage.js` 備份開啟、升級流程掛鉤 | 1–2 天 | 低 |
| 13 | Windows 整合包 zip＋更新腳本（packaging/、2026-10-17-windows-portable-package） | S12 | 新 `packaging/`：zip 打包＋`更新腳本`＋latest.json；安裝檔路線並存 | 2–3 天 | 低 |

## 19.2 差異聲明（素材形態）
我們的圖是**含背景整張插畫**，AnimaVN 立繪層（去背 diff）不適用：情緒標籤→**整圖切換**+日夜組規則（不跨日夜）已由 art_distribution + story-art 承接，不套用其立繪層/找臉僅用於錨點裁切（做法 3）。

## 19.4 AnimaVN 沒有、仍須自建（維持原計畫）
危機偵測/反依賴/AI 身分揭露/用量上限（S10）、關係階段 A/B/C 與好感帶（relationship.js）、生活模擬器（life-sim.js）、頭盔安全層（safety.js）、逐句插話的雙語檢核。

## MIT 致謝
引 Et 步驟/做法概念源自 AnimaVN（MIT：repo JayziLi/AnimaVN）。
- 禁用素材：`AnimaBackend/app/seed_data/deepseek-chan/**`（CC BY-NC-SA，不採用）。
- 必附 credits：打包若含其樣本素材等效物，須保持 `frontend/public/vn/CREDITS.txt` 對應致歉文字。本次不直接複製其源碼/素材，僅參考架構。
