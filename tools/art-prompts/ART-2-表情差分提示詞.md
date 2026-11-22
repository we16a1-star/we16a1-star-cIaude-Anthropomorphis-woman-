# ART-2 表情差分補齊提示詞與缺格清單

> **前置決策**：D21（全面擴充至 10 大正式情緒：`neutral, happy, proud, shy, surprised, dizzy, curious, focused, worried, tender`）＋ D26（補回原版 `happy.webp`，並由 Neon 產出缺格草稿置於 `tools/art-drafts/ART-2/` 供使用者挑選）。

---

## 1. 表情資源現況盤點（`app/www/assets/expressions/`）

| 類別 | 檔名 | 狀態 | 備註 |
| --- | --- | --- | --- |
| 四階好感表情窗 | `g43-face-aff-1.webp` ～ `g43-face-aff-4.webp` | 已齊全 | 0–24 / 25–44 / 45–89（36624 去字）/ 90–100 |
| 故事表情窗（既有） | `story-daily.webp`, `story-proud.webp`, `story-shy.webp`, `story-focused.webp`, `pat.webp`, `surprised.webp`, `dizzy.webp` | 已齊全 | 均為既有正式素材 |
| 遺漏補回 | `happy.webp` | **已由原版補回** | 56,298 bytes，SHA256 `94BD0F9252644695DC4795B4EA1898A9BC27AE43C396C8BE00CCC874B796958A` |
| 缺專用表情窗 | `curious`, `worried`, `tender` | **草稿待挑選** | 程式端已於 `portrait-anim.js` 安全映射（`curious→surprised`、`worried→story-focused`、`tender→story-shy`），零 404；正式圖待使用者確認草稿後入庫 |

---

## 2. 角色統一視覺錨點（所有提示詞必帶）

- **人物**：18 歲成年名門大小姐與學者「克勞德（Claude娘）」，身高 173 cm。
- **髮型與配件**：及腰橘色波浪長髮、琥珀橘色眼瞳、側邊橘色日芒雛菊花飾與綴白流蘇黑緞帶、白色維多利亞蕾絲領口洋裝。
- **嚴格禁忌**：**絕不戴眼鏡**、不出現義大利麵、不鏡像翻轉（朝向微偏畫面左側，與右側站姿立繪視線一致）。
- **構圖與畫風**：1:1 正方形胸像特寫（適配圓形表情窗裁切）、古籍圖書館暖燭光厚塗日系視覺小說畫風、暖深琥珀羊皮紙背景。

---

## 3. 三格缺口繪圖提示詞

### 3.1 `curious`（好奇｜對應草稿 `tools/art-drafts/ART-2/draft-curious.png`）
> **中文說明**：微微歪頭傾身、琥珀色眼眸明亮閃爍、唇角帶點求知欲的輕微笑意。
> **English Prompt**:
> `Anime visual novel close-up bust portrait (1:1 square, centered for circular crop) of an 18-year-old aristocratic scholar girl with waist-length wavy vibrant orange hair, warm amber-orange eyes, an orange sun-daisy flower ornament with black ribbon and white tassels on the side of her hair, wearing a white Victorian lace dress collar. NO GLASSES. Facing slightly left, head gently tilted forward in genuine scholarly curiosity, bright sparkling wide amber eyes, soft intrigued small smile. Warm candlelit vintage library lighting, clean painterly anime linework, soft dark-amber parchment backdrop.`

### 3.2 `worried`（擔憂｜對應草稿 `tools/art-drafts/ART-2/draft-worried.png`）
> **中文說明**：眉頭輕蹙、眼神柔軟充滿關懷、語氣放輕、指尖輕抬近領口；絕非生氣或冷漠。
> **English Prompt**:
> `Anime visual novel close-up bust portrait (1:1 square, centered for circular crop) of an 18-year-old aristocratic scholar girl with waist-length wavy vibrant orange hair, warm amber-orange eyes, an orange sun-daisy flower ornament with black ribbon and white tassels on the side of her hair, wearing a white Victorian lace dress collar. NO GLASSES. Facing slightly left, brows gently furrowed in sincere warm concern, empathetic soft amber eyes looking gently at the viewer, one hand lightly raised near her collar, caring and reassuring mood, never harsh or angry. Warm candlelit vintage library lighting, clean painterly anime linework, soft dark-amber parchment backdrop.`

### 3.3 `tender`（溫柔深情｜對應草稿 `tools/art-drafts/ART-2/draft-tender.png`）
> **中文說明**：神色放軟、眼瞼微垂、雙頰透出淡淡紅暈、燭光映出溫柔笑意。
> **English Prompt**:
> `Anime visual novel close-up bust portrait (1:1 square, centered for circular crop) of an 18-year-old aristocratic scholar girl with waist-length wavy vibrant orange hair, warm amber-orange eyes, an orange sun-daisy flower ornament with black ribbon and white tassels on the side of her hair, wearing a white Victorian lace dress collar. NO GLASSES. Facing slightly left, serene tender affectionate smile, gently softened eyelids, subtle warm blush on her cheeks, golden candlelight glow reflecting warmly in her amber eyes. Intimate vintage library atmosphere, clean painterly anime linework, soft dark-amber parchment backdrop.`

---

## 4. 確認後入庫步驟

使用者自 `tools\art-drafts\ART-2\` 確認滿意草稿後：
1. 轉存為 512×512 WebP（`curious.webp`、`worried.webp`、`tender.webp`）。
2. 經 `tools\artverify\install-art.ps1` 備份舊檔並複製至 `app\www\assets\expressions\`。
3. 於 `portrait-anim.js` `FACES` 陣列加入三者並更新 `resolveExpressionFaceAsset()` 對應檔名。
4. 跑 `emotion-whitelist-alignment.test.js` 與 `expression-affinity.test.cjs` 驗收。


---

## v5 官方原版 7 圖五官與畫風 DNA 鎖定（2026-11-22 依使用者提供原版立繪／CG 補註）

- **眼型（最高優先）**：嚴禁大圓甜妹眼！必須維持原版**修長微挑的冷靜知性琥珀金眸**（上眼線平直俐落、下眼瞼輕盈留白、瞳孔清澈克制，帶淡淡書卷氣與小傲嬌氣質）。
- **臉型與唇形**：極清秀纖細的小尖臉＋白皙脖頸；嘴巴小巧含蓄（以眼神與微弧傳達情緒，不張大嘴露齒笑）。
- **腮紅與線稿**：極細暖棕線稿＋通透象牙白柔霧粉暈，**嚴禁漫畫斜線腮紅**。
- **耳環**：纖細金鍊＋小菱形金白寶石＋細長金流蘇耳環。
- **服裝與頭飾**：奶油白維多利亞荷葉邊高領披肩襯衫（肩部橘金太陽花刺繡）＋領口橘色太陽菊胸針＋金邊黑緞帶領結；右側橘色太陽菊頭飾＋黑金蝴蝶結＋金珠白流蘇；**無眼鏡**。
- **三張基準對照**：
  - `curious` v5：近景歪頭＋食指輕點下巴，修長知性琥珀眼微亮探究、含蓄小微笑、無斜線腮紅。
  - `worried` v5：參考月夜古籍書庫沉靜微垂神情，內眉梢極細微柔緩上揚、眼神溫潤關切、輕按領口胸針旁。
  - `tender` v5：直接對齊原版伸手微笑／邀約立繪的溫潤含笑修長眼型與精緻小微笑，無困倦垂眼皮、無斜線腮紅。
