表情窗素材（assets/expressions）
================================
用途：點擊立繪時，在角色頭旁邊彈出的圓形「表情窗」（portrait-anim.js 的 G21.4）。
  pat.webp       摸頭   → 害羞（閉眼、臉紅）
  happy.webp     碰髮絲 → 開心
  surprised.webp 戳身體／碰裙擺 → 驚訝
  dizzy.webp     短時間連點 → 暈頭轉向

G43 好感度四階（WP2，2026-11-11 新增）
  點擊立繪的表情窗改依好感度（#affProgress，0～100）選圖；門檻照指示書 WP7。
  g43-face-aff-1.webp  好感度 0-24    36625 去字版（橙髮少女、冷淡不悅）
  g43-face-aff-2.webp  好感度 25-44   36627_0（雙手捏臉、嘟嘴）
  g43-face-aff-3.webp  好感度 45-89   36624 去字版（晶片設計少女；紙上的「IC Design」彩蛋保留）
  g43-face-aff-4.webp  好感度 90-100  36623 去字版（向光少女、伸手）
  尺寸：前三張 1088×1445，36627 為 941×1672；WebP 品質 90，單檔 297～378 KB。
  來源：使用者提供的去字版 PNG 與 36627_0.jpg，以 Electron canvas 在本機轉檔，沒有呼叫外部影像 API。
  這四張只影響「點擊表情窗」；故事情緒差分（story-*.webp）、摸頭愛心、連點暈眩、星光與長按泡泡都不變。
  好感度讀不到，或該階圖片載入失敗時，會退回原本的 pat／happy／surprised／dizzy 表情。

故事情緒差分（story-*.webp）
  story-daily.webp   日常：捧茶、安靜閱讀
  story-proud.webp   得意：微抬眼神與含蓄笑意
  story-shy.webp     害羞：臉紅、書本遮到嘴邊
  story-focused.webp 專注：不戴眼鏡、視線落在書上的閱讀姿態

四張 256×256 WebP 均在本機裁切、放大與轉檔，沒有呼叫外部影像 API。story-daily、story-proud、story-shy 取自使用者提供的 Claude娘圖3.jpg 表情格；story-focused 改由 portrait-start.webp 裁切，保留低頭閱讀神情並去除眼鏡。裁切排除面板文字及外框。故事 neutral／proud／shy／focused 狀態會各自使用對應差分，短暫顯示後回到日常底圖。底圖本身不變形。

來源：claude-xiaoke（https://github.com/blackshoretuner/claude-xiaoke）的 art/ 資料夾，原檔未修改（520×488 WebP）。
角色形象原作者：ZipZipPipe（依該專案 ART-NOTICE.md 的說明；表情差分是該專案作者以 AI 編輯產生）。

授權狀態（請務必讀）：
  · 該專案的 LICENSE（MIT）只涵蓋程式碼，並明寫這些圖片「不在範圍內」；ART-NOTICE.md 要求轉用於其他作品前先取得原作者授權。
  · 使用者（本專案作者）表示：原作立繪為 CC 授權，且已在本專案標註。
  · 我（產生這個版本的 AI）無法驗證該 CC 授權的實際條款。請確認它涵蓋「使用／散布修改過的版本」
    （例如是否為 BY-NC、ND 之類的限制），以及隨安裝包散布是否允許。

要移除這個功能：直接刪掉整個 assets/expressions 資料夾即可。程式偵測到圖片載入失敗時會自動停用表情窗，
其餘觸碰動畫（反應、壓扁、愛心、漣漪）不受影響。
