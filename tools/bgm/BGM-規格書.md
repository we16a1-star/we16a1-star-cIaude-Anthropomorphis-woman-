# 《Claude娘的圖書館》BGM 配樂規格書與授權清單（BGM-1）

> **版本**：2026-11-22 v1　**樂譜設計**：Antigravity（`tools/bgm/bgm-score.json`）　**離線合成渲染**：Neon（`tools/bgm/render-bgm.mjs`）
> **授權性質**：100% 本專案原創譜曲與程式離線合成（自製原創，允許自由隨安裝檔散布，零第三方版權風險）

---

## 1. 核心音樂動機（Leitmotif）

- **動機編號**：`M-unfinished`（《未竟錄》動機）
- **D 大調音型**：`A4:0.5 D5:0.5 E5:1 F#5:1.5 E5:0.5 | D5:2`（上行完全四度 → 大二度 → 大二度 → 回落大二度 → 大二度）
- **戲劇語意**：
  - 上行四音代表克勞德的好奇心；三音長音回落表現故作從容；
  - 平常曲目（主題曲、日間、夜間）樂句尾音刻意停在導音／屬音不完全解決，呼應「嘴硬」；
  - 唯有 **`bgm-event-tender`**（晚安／告白）在最後一小節完整解決至主音 `D5`，象徵放下嘴硬、坦率面對心意。

---

## 2. 九首曲目總覽

| 曲目 ID | 曲名 | 綁定場景／事件 | 調性 / BPM / 拍號 | 混響 (s) | 曲式 | 備註 |
| --- | --- | --- | --- | :---: | --- | --- |
| `bgm-title` | 書頁之間（主題曲） | 開始畫面 | D major / 76 / 4/4 | 2.4 | A–A2–B–A2 | 鋼琴、小提琴、鋼片琴、豎琴、低音提琴 |
| `bgm-day-default` | 午後的閱覽室 | `scenePack: day-default` | G major / 84 / 4/4 | 1.8 | A–A2–B–B2 | 柔音鋼琴、撥弦、單簧管；B 段旋律留白耐聽 |
| `bgm-morning-soft` | 晨光與紅茶 | `scenePack: morning-soft` | F major / 96 / 3/4 | 1.6 | A–A2–B | 長笛圓舞曲、豎琴、鐘琴、單簧管 |
| `bgm-evening-reading` | 暮色與白鴿 | `scenePack: evening-reading` | C major / 68 / 4/4 | 2.2 | A–A2–B–B2 | 獨奏大提琴、柔音鋼琴、弦樂墊底 |
| `bgm-night-magic` | 掌心的微光 | `scenePack: night-magic` | D dorian / 64 / 4/4 | 3.0 | A–A2–B–B2 | 鋼片琴、音樂盒、豎琴慢琶音、深弦樂墊底 |
| `bgm-rainy-night` | 雨聲裡的燭火 | `scenePack: rainy-night` | A minor / 60 / 4/4 | 2.8 | A–A2–B–B2 | 柔音鋼琴＋大提琴；**雨聲由 `ambience.js` 即時疊加，絕不烘焙進曲檔** |
| `bgm-event-tender` | 沒說出口的那一頁 | `goodnight`、`vow`、`night_chat_reading` | D major / 66 / 4/4 | 2.6 | A–A2 | 主題曲變奏，第 8 小節主音完全解決 |
| `bgm-event-playful` | 才不是故意的 | `cheek_pinch`、`outing_memory`、`lakeside_sunset` | G major / 112 / 4/4 | 1.4 | A–A2–A3–A4 | 撥弦、低音管斷奏、單簧管、鐘琴、木魚反拍 |
| `bgm-wait` | 羽毛筆書寫中 | `wait-interlude`（選配） | D major / 72 / 4/4 | 2.0 | A–A | 零旋律馬林巴琶音＋極輕弦樂，任意點可淡入淡出 |

---

## 3. 合成與母帶技術規格

1. **十五種程式合成樂器**：依 `tools/bgm/bgm-score.json` `instruments` 欄位實作（`felt-piano`、`string-pad`、`pizzicato`、`harp`、`celesta`、`music-box`、`flute`、`clarinet`、`cello`、`violin`、`bassoon`、`glockenspiel`、`marimba`、`upright-bass`、`woodblock`），含自然力度隨機微動與和弦最小距離聲部連接（Voice Leading）。
2. **無縫雙遍渲染（Seamless Double-Pass Loop）**：
   - 每首完整曲式連續渲染兩遍，擷取第二遍精確取樣區間，使循環起點自然承接上一輪混響餘音；
   - 檔頭與檔尾不做額外淡入淡出，確保 `AudioBufferSourceNode.loop = true` 無接縫斷點。
3. **混響與母帶目標**：
   - 演算法立體聲卷積／多延遲阻尼混響（預延遲 18 ms、高頻 6 kHz 阻尼、衰減時間依各曲 `reverbSec`）。
   - 總線：高通 30 Hz → 2:1 溫和壓縮 → 真實峰值限制 ≤ `-1.0 dBTP` → 整合響度正規化至 **`-18 LUFS ±1`**（與 D20 語音配音並存時，`audio-bus.js` 自動壓低至 35%）。
4. **檔案格式與體積預算**：
   - `scenePacks.json` 支援 `["mp3", "ogg", "wav", "m4a"]`。
   - 優先輸出 **OGG Vorbis q5**（若系統有 `ffmpeg` / `oggenc`）；若本機無外部編碼器，則由純 Node.js 輸出精簡採樣率或標準 PCM WAV（並嚴格監控 9 首總體積；若採 WAV 超過 25 MB 預算，則採 22.05 kHz 單／立體聲或於 `bgm-player.js` 支援輕量即時／離線解碼，確保安裝包體積健康）。

---

## 4. 授權紀錄表（預填，入庫後寫入 `licenses/BGM-CREDITS.txt`）

| 曲目 ID | 來源 | 作者 | 授權條款 | 允許隨安裝檔散布 | 取得日期 |
| --- | --- | --- | --- | :---: | --- |
| `bgm-title` ～ `bgm-wait`（全部 9 首） | 本專案原創樂譜 `tools/bgm/bgm-score.json` ＋ 自製離線合成器 `tools/bgm/render-bgm.mjs` | 《Claude娘的圖書館》專案團隊（Antigravity 設計／Neon 合成） | MIT / CC0 專案自有原創 | 是 | 2026-11-22 |

---

## 5. 外部音樂生成參考提示詞（備選）

若日後使用者希望以授權明確的外部音樂工具替換任一曲目，可直接取用 `tools/bgm/bgm-score.json` 各曲之 `promptEn` 欄位（請自行確認外部平台條款允許再散布於安裝檔）。
