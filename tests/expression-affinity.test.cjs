// WP2 表情窗四階：好感度 0-24／25-44／45-89／90-100 對應四張去字版表情。
// 用法（本資料夾上層）：node tests/expression-affinity.test.cjs
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sourcePath = path.join(root, 'app', 'www', 'portrait-anim.js');
const assetsDir = path.join(root, 'app', 'www', 'assets', 'expressions');
const source = fs.readFileSync(sourcePath, 'utf8');

let pass = 0, fail = 0;
const ok = (cond, name) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); cond ? pass++ : fail++; };

// 把 ES module 的 import 拿掉，改用最小 stub；其餘原始碼照原樣在 jsdom 執行。
const code = source.replace(/^import[^\n]*\n/m, '');
const dom = new JSDOM(`<!doctype html><html><body>
  <progress id="affProgress" max="100" value="50"></progress>
</body></html>`, { runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
w.normalizeStoryEmotion = value => (value ? String(value) : 'neutral');
w.normalizeStoryEmotionIntensity = value => (Number(value) >= 1 ? Number(value) : 1);
w.eval(code);
w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
const api = w.__portraitAnim;

ok(!!api && typeof api.affinityTier === 'function', 'affinityTier is exposed for tests');
ok(typeof api.affinityFaceFor === 'function', 'affinityFaceFor is exposed for tests');

if (api) {
  const tiers = [
    [-1, 0], [0, 0], [10, 0], [24, 0],
    [25, 1], [30, 1], [44, 1],
    [45, 2], [50, 2], [60, 2], [89, 2],
    [90, 3], [95, 3], [100, 3], [101, 3],
  ];
  let tierOk = true;
  for (const [value, expected] of tiers) {
    if (api.affinityTier(value) !== expected) { tierOk = false; console.log(`  tier mismatch: ${value} -> ${api.affinityTier(value)} (want ${expected})`); }
  }
  ok(tierOk, 'tier boundaries: 0-24 / 25-44 / 45-89 / 90-100 (clamped to 0-100)');

  ok(api.affinityTier(null) === null, 'missing value -> null');
  ok(api.affinityTier(undefined) === null, 'undefined -> null');
  ok(api.affinityTier('') === null, 'empty string -> null');
  ok(api.affinityTier('abc') === null, 'non-numeric -> null');
  ok(api.affinityTier('50') === 2, 'numeric string (progress value) is accepted');

  const loadedAll = () => true;
  ok(api.affinityFaceFor(10, loadedAll).file === 'g43-face-aff-1.webp', '0-24 -> aff-1 (36625)');
  ok(api.affinityFaceFor(30, loadedAll).file === 'g43-face-aff-2.webp', '25-44 -> aff-2 (36627)');
  ok(api.affinityFaceFor(50, loadedAll).file === 'g43-face-aff-3.webp', '45-89 -> aff-3 (36624; opening 50)');
  ok(api.affinityFaceFor(95, loadedAll).file === 'g43-face-aff-4.webp', '90-100 -> aff-4 (36623)');
  ok(api.affinityFaceFor(50, () => false) === null, 'image not loaded -> fallback (null)');
  ok(api.affinityFaceFor(null, loadedAll) === null, 'no affinity value -> fallback (null)');
}

// 素材格式與尺寸（WebP；1088×1445 三張、941×1672 一張；單檔 ≤400 KB）
function webpSize(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const type = buf.toString('ascii', 12, 16);
  if (type === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  if (type === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (type === 'VP8L') { const b = buf.readUInt32LE(21); return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) }; }
  return null;
}
const expected = [
  ['g43-face-aff-1.webp', 1088, 1445],
  ['g43-face-aff-2.webp', 941, 1672],
  ['g43-face-aff-3.webp', 1088, 1445],
  ['g43-face-aff-4.webp', 1088, 1445],
];
let assetsOk = true;
for (const [file, width, height] of expected) {
  const p = path.join(assetsDir, file);
  if (!fs.existsSync(p)) { assetsOk = false; console.log(`  missing: ${file}`); continue; }
  const buf = fs.readFileSync(p);
  const size = webpSize(buf);
  if (!size) { assetsOk = false; console.log(`  not webp: ${file}`); continue; }
  if (size.width !== width || size.height !== height) { assetsOk = false; console.log(`  size mismatch: ${file} ${size.width}x${size.height}`); }
  if (buf.length > 400 * 1024) { assetsOk = false; console.log(`  too large: ${file} ${buf.length}`); }
}
ok(assetsOk, 'four WebP faces exist with correct size and <=400 KB');

// 接線：只改點擊表情窗；故事情緒差分與觸碰特效不動。
ok(source.includes("getElementById('affProgress')"), 'reads affinity from #affProgress');
ok(source.includes('const affinity = affinityFace();'), 'click path resolves affinity face');
ok(source.includes('showFace(target.stage, target.animator, affinity ? affinity.file'), 'click path passes affinity face to showFace');
ok(source.includes("const name = emotion === 'neutral' ? 'story-daily'"), 'story emotion still uses story-* faces');
ok(source.includes('const expression = expressionFor(touch, burst);'), 'touch motion still uses expressionFor');
ok(source.includes('spawnHearts(') && source.includes('spawnOrbit(') && source.includes('spawnSparkles('), 'touch effects (hearts/orbit/sparkles) remain');
ok(source.includes("el.style.backgroundSize = crop.size;") && source.includes("el.style.removeProperty('background-position');"), 'face crop uses inline background size/position (no style.css change)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
