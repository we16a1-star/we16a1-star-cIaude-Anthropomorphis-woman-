# NEON-WORKLOG.md — UI × 美術 × 配樂製作執行紀錄

> 對應計畫書：`HANDOFF-NEON-UI美術配樂製作計畫.md`（2026-11-22 v1）
> 嚴守紅線：所有修改限於 `v2.0-modifications\`；原始碼唯讀；不手改 `app.bundle.js`；0 簡體、0 PII。

---

## 階段 0：環境確認與基準回歸（2026-11-22 完成）

- **Bundle 校驗**：`app\www\app.bundle.js`
  - 大小：`860,625 bytes`
  - SHA256：`63362F0953999D8D0042B7AF3785964F61C006F46E47A0EE26DF3B09C9FB6340`（與計畫書標頭完全相符 ✓）
- **基準測試**：
  - ESM `app\tests\story\*.test.js`：**149/151 PASS**（僅餘既定 2 筆歷史差異：`p1-03-claude-temp-chat.test.js` 案 3、`v5-art-step1.test.js`）
  - CJS `tests\*.test.cjs`（`NODE_PATH=$env:TEMP\opencode\node_modules`）：**8/8 檔案全 PASS**（`album`, `bedroom-scene`, `bedroom-wp7`, `custom-portrait`, `expression-affinity`, `rainy-night`, `rare-goodnight`, `wait-interlude`）
- **本機音訊編碼工具盤點**：系統未預裝 `ffmpeg` / `oggenc` / `lame` CLI（僅 Electron 內附 `ffmpeg.dll`）。因此 BGM-2／BGM-3 之離線渲染腳本 `tools\bgm\render-bgm.mjs` 將以純 Node.js 直接輸出標準無損 PCM WAV（44.1 kHz / 16-bit 立體聲，支援精確無縫循環與 -18 LUFS 正規化；並保留若環境有 `ffmpeg` 時自動轉碼 OGG Vorbis q5 之選項以縮減體積，符合 `scenePacks.json` `supportedFormats: ["mp3","ogg","wav","m4a"]`）。

---

## 階段 1：規格對齊與稽核（2026-11-22 完成，待 D21–D26 拍板後進階段 2）

### 1. ART-1 情緒白名單全檔案對照表

| 情緒標籤 | `config/emotions.json` | `app.js` / `server.js` 提示詞 | `story-emotion.js` (`STORY_EMOTIONS`) | `emotion-fallback.js` | `portrait-anim.js` 表情窗圖 | 稽核發現 |
| --- | :---: | :---: | :---: | :---: | --- | --- |
| `neutral` | ✓ | ✓ | ✓ | ✓ | `story-daily.webp` | 正常 |
| `happy` | ✗ | ✓ | ✓ | ✓ | `happy.webp` | **缺檔警告**：`v2.0-modifications\app\www\assets\expressions\` 漏複製 `happy.webp`（原版 `完整原始碼-G43-v2.1` 有 56,298 bytes） |
| `proud` | ✓ | ✓ | ✓ | ✓ | `story-proud.webp` | 正常 |
| `shy` | ✓ | ✓ | ✓ | ✓ | `story-shy.webp` | 正常 |
| `surprised` | ✓ | ✓ | ✓ | ✓ | `surprised.webp` | 正常 |
| `dizzy` | ✗ | ✓ | ✓ | ✓ | `dizzy.webp` | `emotions.json` 缺漏 |
| `curious` | ✓ | ✓ | ✓ | ✓ | `surprised.webp`＋`.pa-curious` | 正常（可於 ART-2 補專用表情） |
| `focused` | ✓ | ✓ | ✓ | ✓ | `story-focused.webp` | 正常 |
| `worried` | ✗ | ✗ | ✓ | ✓ | **無圖（會請求 404 `worried.webp`）** | `portrait-anim.js` 缺安全降級映射 |
| `tender` | ✗ | ✗ | ✓ | ✓ | **無圖（會請求 404 `tender.webp`）** | `portrait-anim.js` 缺安全降級映射 |
| `warm` | ✓ | ✗ | 別名 → `tender` | — | 同 `tender`（404 風險） | 僅在 `emotions.json` |
| `sad` | ✓ | ✗ | — | 別名 → `worried` | 同 `worried`（404 風險） | 僅在 `emotions.json` |
| `angry` | ✓ | ✗ | ✗ | ✗ | 無圖 | 僅在 `emotions.json`，完全未接線 |

- **建議方案（D21）**：以 AI 協議 8 個核心情緒（`neutral, happy, proud, shy, surprised, dizzy, curious, focused`）＋既有 `story-emotion.js` 支援之 `worried, tender` 做清晰分層；補回 `happy.webp` 並於 `portrait-anim.js` 為 `worried`（映射 `story-focused`）／`tender`（映射 `story-shy` 或新差分）加安全圖檔映射，徹底消滅 404；同步將 `emotions.json` 白名單對齊並新增 `emotion-whitelist-alignment.test.js`。

### 2. ART-2 / ART-3 素材缺口盤點
- **表情差分（ART-2）**：
  - 四階好感表情窗 `g43-face-aff-1..4.webp` 已完整存在於 `assets/expressions/`。
  - 故事表情窗現有：`story-daily`, `story-focused`, `story-proud`, `story-shy`, `pat`, `surprised`, `dizzy`；原版有 `happy.webp` 待補回 `v2.0-modifications`；缺獨立專用表情窗：`curious`（現借用 `surprised`）、`worried`、`tender`（若有啟用）。
- **劇情 CG（ART-3）**：
  - `art_distribution.json` 25 筆條目中，**全部 9 個可觸發故事事件＋雨夜**均已有對應圖檔。
  - `36623` / `36624` / `36625` 依規則標記 `不使用`（相簿縮圖與相簿圖已存在 `g43-album-36623..25.webp`）。
  - `36331`（圖鑑／角色介紹，不進主線）與 `36379`（相簿／後日談，不進主線）於 `art_distribution.json` 仍指原始檔名 `36331_0.jpg`、`36379_0.jpg`（不在 `assets/` 內），將列於 ART-3 補件提示詞與清單。

### 3. BGM-1 配樂規格書
- 已依 `tools\bgm\bgm-score.json`（9 首完整樂譜、核心動機 `M-unfinished`《未竟錄》、15 種合成樂器定義）完成 `tools\bgm\BGM-規格書.md`。
- 依使用者指示「配樂你設計 Neon生成」，將於階段 2/3 直接以純 Node.js 實作 `tools\bgm\render-bgm.mjs` 依譜渲染全部 9 首原創無縫循環配樂（零外部帳號、100% 自製原創授權）。

### 4. UI-1 設定頁資訊架構重整線框（D22）

```
[視覺小說演出與多媒體設定] (.vn-performance-settings-group)
├── <details open data-section="presentation">  文字與演出（預設展開）
│   ├── 逐句打字演出開關 (#vnLineModeToggle)
│   ├── 逐句打字速度滑桿 (#vnLineSpeedSlider / #vnLineSpeedValue)
│   ├── 自動播放開關 (#vnAutoPlayToggle)
│   └── 自動播放每句停留 (#vnAutoDelaySlider / #vnAutoDelayValue)
├── <details data-section="audio">              聲音（預設摺疊，展開狀態存 localStorage）
│   ├── 總音量滑桿 (#vnMasterVolume)
│   ├── 背景音樂 BGM（開關 #vnBgmToggle、音量 #vnBgmVolume、目前曲目、試聽本場景）
│   ├── 場景環境音（開關 #vnAmbienceToggle、模式：自動／雨聲／壁爐／關閉、音量 #vnAmbienceVolume）
│   ├── 打字跳字音效 (#vnTypeSoundSelect / #vnTypeSoundVolume / #vnTypeSoundPreview)
│   └── D20 語音配音完整面板 (#vnVoicePanel / #vnVoiceToggle / en-GB · Glassy · 正常)
└── <details data-section="visual">             畫面與 CG（預設摺疊）
    ├── 晚安時刻 CG 偏好 (#vnGoodnightCgPref)
    └── 故事字級快速調整（縮小／重設／放大，對接既有 Ctrl± 縮放）
```
- 保留全部既有 DOM ID 與 CSS class，確保 `vn-settings-integration.test.js`、`frontend-arch-optimization.test.js`、`voice-tts.test.js` 100% 通過。

---

## 階段 2～4：全工作包實作、實機視覺修正與驗收收尾（2026-11-22 完成）

### 已落地工作包清單（11/11 完成）
- **ART-1（D21）**：`emotions.json`、`story-emotion.js`、`prompt-assembler.js`、`portrait-anim.js`、`app.js` 統一對齊 10 大正式情緒；`portrait-anim.js` 新增 `resolveExpressionFaceAsset()` 消滅 `curious`／`worried`／`tender` 404；新增 `emotion-whitelist-alignment.test.js`（2/2 PASS）。
- **ART-2（D26）**：補回原版 `assets/expressions/happy.webp`；產出三格缺口草稿 `tools/art-drafts/ART-2/draft-{curious,worried,tender}.png`（1024×1024）與 `tools/art-prompts/ART-2-表情差分提示詞.md`。
- **ART-3（D26）**：核對 `art_distribution.json` 全 25 筆條目（主線 9 事件＋雨夜零缺圖），產出 `tools/art-prompts/ART-3-CG補件提示詞.md`（兩張選配圖鑑／後日談提示詞）。
- **ART-4**：新增暖金古籍 SVG 資產 `assets/ui/sunburst-seal.svg`、`ornament-divider.svg`。
- **BGM-1 / BGM-2 / BGM-3（D24）**：實作 `tools/bgm/render-bgm.mjs` 依 `bgm-score.json` 離線渲染全 9 首無縫循環配樂並轉碼為 44.1 kHz 立體聲 160 kbps AAC（`assets/bgm/bgm-*.m4a`，合計 **17.97 MB**、全數 `-18 LUFS`、True Peak ≤ `-1.0 dBTP`）；建置 `bgm-player.js`（1.2s 交叉淡入淡出、缺檔靜默降級、對接 `audioBus` Ducking）與 `ambience.js`（零音檔雨聲／壁爐程序化環境音）；建立 `licenses/BGM-CREDITS.txt` 與 `bgm-player.test.js`（3/3 PASS）。
- **UI-1 / UI-2（D22 / D23）**：設定頁重整為可摺疊三分組（`claude_novel_settings_sections_v1`），新增主音量、BGM 面板、環境音、字級快捷鈕；快捷列維持三鈕寬度（1264 寬間距 `51px`、800 寬 `54px`），「靜音」升級為全部聲音總開關（右鍵／長按展開子選單）。
- **UI-3**：新增唯讀對話回顧 `backlog.js`（最近 30 筆、200 回合 < 100ms、支援 D20 英文配音重聽、快捷鍵 `H` 與 `Esc`，不衝突既有 `L` 快速讀檔）與 `backlog.test.js`（2/2 PASS）。
- **UI-4（D25）**：`wait-interlude.css` 改以視覺隱藏保留 `aria-live`；補齊 `UI_EN`（`tools/i18n-check.mjs` **545/545，0 缺漏**）與鍵盤 `:focus-visible`、`aria-label`、`aria-live="polite"`。

### 實機截圖目視檢查與當場修復紀錄
1. 首次檢視 `neon-story-night-popover-1264.png` 發現聲音子選單被 `#choices` 壓住 → 新增 `.vn-dialogue-window:has(.vn-audio-popover:not([hidden])) { z-index: 60; }` 修正。
2. 首次檢視 `neon-settings-audio-1264.png` 發現初次啟動因 `Number(null) === 0` 導致主音量顯示 0%、BGM 核取方塊置中換行 → 修正 `rawMv !== null` 判空（預設 100%）與 `#app .vn-bgm-panel .vn-voice-subcheck` 橫向對齊。
3. 首次檢視 `neon-settings-en-1264.png` 發現帶前導空白之核取方塊文字未命中 `applyUiLanguage()` 的 `.trim()` 查表 → 補齊無前導空白之 `UI_EN` 鍵。

### 最終收尾數據
- `app\www\app.bundle.js`：**889,010 bytes**（0 warnings）｜SHA256 `B5999649D7286A3E719F70111BDF0FBABDE7530BCC35DF68AAE4FB5C4D39A4D9`
- 測試：ESM **156/158 PASS**（0 新增失敗）、CJS **8/8 檔案 PASS**、i18n **545/545（0 缺漏）**、簡體中文掃描 **0 處**
- 打包備註：下一階段製作 `.exe` 安裝檔時，請將 `licenses/BGM-CREDITS.txt` 納入 `package.json` 之 `build.files`。
