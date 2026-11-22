# ART-3 劇情 CG 與圖鑑缺口盤點與補件提示詞

> 依 `app/www/config/art_distribution.json`（25 筆條目）逐筆核對 `app/www/assets/` 實際檔案。

---

## 1. 全事件與 CG 核對結果

| 事件旗標 / 編號 | 對應檔案 | 現況 | 版型 |
| --- | --- | :---: | --- |
| `letter`（36371） | `g43-cg-letter.jpg` | 已入庫 ✓ | 16:9 cover |
| `moon_bird`（36372） | `g43-cg-moon-bird.jpg` | 已入庫 ✓ | 16:9 cover |
| `outing_memory`（36369） | `g43-cg-outing-memory.jpg` | 已入庫 ✓ | 16:9 cover |
| `magic_touch`（36374） | `g43-cg-magic-touch.jpg` | 已入庫 ✓ | 16:9 cover |
| `vow`（36375） | `g43-cg-vow.jpg` | 已入庫 ✓ | 16:9 cover |
| `goodnight` 主 CG（36455） | `g43-cg-bed-goodnight.jpg` | 已入庫 ✓ | 16:9 cover |
| `night_chat_reading`（36628） | `g43-cg-goodnight-reading.jpg` | 已入庫 ✓ | portrait + blurBg |
| `cheek_pinch`（36627） | `g43-cg-cheek-pinch.jpg` | 已入庫 ✓ | portrait + blurBg |
| `lakeside_sunset`（36622） | `g43-cg-lakeside.jpg` | 已入庫 ✓ | portrait + blurBg |
| 雨夜 CG / 場景（36686 / 36687） | `g43-cg-rainy-night-claude.jpg`、`g43-story-rainy-night.jpg` | 已入庫 ✓ | 16:9 cover |
| 36623 / 36624 / 36625 | `file: null`（`不使用`） | 依規則不進劇情 ✓ | 相簿已收錄 `g43-album-36623..25.webp` |
| **36331（圖鑑／角色介紹，不進主線）** | `36331_0.jpg`（未入庫） | **待使用者提供（選配）** | 直式全身立繪 |
| **36379（相簿／後日談，不進主線）** | `36379_0.jpg`（未入庫） | **待使用者提供（選配）** | 16:9 cover |

**結論**：全部 9 個可觸發故事事件＋雨夜＋4 大主場景圖＋相簿 3×3 九格均已有正式圖檔，**主線劇情零缺圖**；僅剩兩張「不進主線」之選配圖鑑／後日談圖（36331、36379），以下提供標準繪圖提示詞供日後補件。

---

## 2. 選配補件繪圖提示詞

### 2.1 `36331` — 角色介紹頁全身標準圖鑑（`g43-codex-profile.jpg`）
> `Full-body character illustration (portrait 2:3 ratio) of an 18-year-old aristocratic scholar girl ("Claude-chan", 173 cm tall) with waist-length wavy orange hair, amber eyes, orange sun-daisy hair ornament with black ribbon and white tassels, white Victorian lace dress. NO GLASSES. Standing gracefully beside a brass astrolabe and stack of leather-bound antique books, holding a small brass quill case and her notebook "The Unfinished Chronicle", warm golden library background, crisp anime visual-novel illustration.`

### 2.2 `36379` — 後日談靜謐茶會紀念 CG（`g43-cg-epilogue-tea.jpg`）
> `Wide 16:9 anime visual novel CG illustration of an 18-year-old aristocratic scholar girl with waist-length wavy orange hair, amber eyes, orange sun-daisy ornament with black ribbon and white tassels, white Victorian lace dress. NO GLASSES. Sitting beside a sun-drenched tall library window at afternoon tea, pouring Earl Grey tea into two porcelain cups with an open hand-bound mechanical handbook and sunburst wax seal on the oak table, warm peaceful affectionate smile, rich painterly golden-hour lighting. Leave 13.5% clear headroom above her head.`

> 若日後補入新的故事場景類 16:9 圖，入庫前須執行 `tools\artverify\add-headroom-v2.ps1` 與 `detect-head.ps1`，將量測之 `headPct`（目標 `0.135`）登錄至 `app\www\assets\art-heads.json`。
