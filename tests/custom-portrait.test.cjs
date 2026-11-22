// tests/custom-portrait.test.cjs
// WP4 驗證：自訂立繪安全區與邊界投影進階控制

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WWW = path.join(ROOT, 'app', 'www');
const norm = s => s.replace(/\s+/g, '');

test('art-plan.css 包含自訂立繪安全區約束（寬≤52%, 高≤84%）', () => {
  const css = norm(fs.readFileSync(path.join(WWW, 'art-plan.css'), 'utf8'));
  assert.ok(css.includes(norm('max-width:min(52%, 480px)')), '自訂立繪寬度上限需嚴格限制在 52% / 480px 以內');
  assert.ok(css.includes(norm('max-height:84%')), '自訂立繪高度上限需為 84%');
  assert.ok(css.includes(norm('mix-blend-mode:normal !important')), '需覆寫 multiply 混合模式以正確呈現自訂立繪原色');
  assert.ok(css.includes(norm('right:4%')), '需將立繪位置釘在右側安全區');
});

test('art-plan.css 包含古典書頁金邊相框（無透明通道矩形立繪）', () => {
  const css = norm(fs.readFileSync(path.join(WWW, 'art-plan.css'), 'utf8'));
  assert.ok(css.includes(norm(':not(.is-transparent-portrait) .story-portrait')), '需針對非透明自訂立繪套用相框');
  assert.ok(css.includes(norm('border:1px solid rgba(217,164,65,.75)')), '相框需具備日芒金邊');
  assert.ok(css.includes(norm('border-radius:14px')), '相框需為圓角 14px');
  assert.ok(css.includes(norm('padding:8px')), '相框需有內襯紙邊');
});

test('art-plan.css 包含透明去背立繪的柔邊下緣與落地陰影', () => {
  const css = norm(fs.readFileSync(path.join(WWW, 'art-plan.css'), 'utf8'));
  assert.ok(css.includes(norm('.is-transparent-portrait .story-portrait')), '需定義透明去背立繪樣式');
  assert.ok(css.includes(norm('mask-image:linear-gradient(to bottom, #000 80%, transparent 98%)')), '需有下緣漸變柔邊遮罩');
  assert.ok(css.includes(norm('filter:drop-shadow(0 14px 28px rgba(0,0,0,.58))')), '需有落地自然陰影');
});

test('art-plan.css 包含自訂立繪膠囊標籤樣式與情境隱藏規則', () => {
  const css = norm(fs.readFileSync(path.join(WWW, 'art-plan.css'), 'utf8'));
  assert.ok(css.includes(norm('.custom-portrait-badge')), '需定義 custom-portrait-badge');
  assert.ok(css.includes(norm('border:1px solid rgba(217,164,65,.6)')), '標籤需有日芒金邊');
  assert.ok(css.includes(norm('backdrop-filter:blur(8px)')), '標籤需有毛玻璃效果');

  // 隱藏保護
  assert.ok(css.includes(norm('.story-empty .custom-portrait-badge')), '開場空白時隱藏');
  assert.ok(css.includes(norm('.g43-story-opening .custom-portrait-badge')), '開場動畫中隱藏');
  assert.ok(css.includes(norm('.text-only .custom-portrait-badge')), '純文字模式隱藏');
  assert.ok(css.includes(norm('.has-bundled-cg .custom-portrait-badge')), '全幅 CG 顯示中隱藏');
});

test('app.js 與 app.bundle.js 支援透明立繪自動判定與 class 切換', () => {
  const appJs = fs.readFileSync(path.join(WWW, 'app.js'), 'utf8');
  assert.ok(appJs.includes('is-transparent-portrait'), 'app.js 需支援 is-transparent-portrait');
  assert.ok(appJs.includes('/^data:image\\/(?:png|webp)/i'), 'app.js 需檢測 PNG/WebP 透明格式');

  const bundle = fs.readFileSync(path.join(WWW, 'app.bundle.js'), 'utf8');
  assert.ok(bundle.includes('is-transparent-portrait'), 'app.bundle.js 需同步 is-transparent-portrait');
});
