// 用法：在本資料夾上層執行 `npm i jsdom --no-save` 後，`node tests/wait-interlude.test.cjs`
const { JSDOM } = require('jsdom');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const code = fs.readFileSync(path.join(__dirname, '..', 'app', 'www', 'wait-interlude.js'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (cond, name) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); cond ? pass++ : fail++; };

function make(lang = 'zh-Hant') {
  const dom = new JSDOM(`<!doctype html><html lang="${lang}"><body>
    <section id="tab-story" class="tab-panel active"><div class="vn-stage"></div><div id="dialogueText"></div><div id="choices"></div></section>
  </body></html>`, { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.__WAIT_INTERLUDE_TUNING__ = { showDelay: 40, hideDelay: 40, minVisible: 120, fade: 40, lineEvery: 80, hintAfter: 300 };
  w.eval(code);
  return w;
}
const addDot = (w, text = '克勞德正在翻書……') => { const d = w.document.createElement('div'); d.className = 'loading-dot'; d.textContent = text; w.document.getElementById('choices').appendChild(d); return d; };
const clearDots = w => { w.document.getElementById('choices').innerHTML = ''; };
const ov = w => w.document.getElementById('waitInterlude');

(async () => {
  // 1 daytime wait
  let w = make();
  ok(!!ov(w) && ov(w).hidden, 'overlay is created hidden');
  addDot(w);
  ok(ov(w).hidden, 'not shown before showDelay');
  await sleep(120);
  ok(!ov(w).hidden && ov(w).classList.contains('is-visible'), 'shown after delay');
  ok(/g43-wait-writing\.jpg$/.test(ov(w).querySelector('.wait-art').getAttribute('src')), 'day uses g43-wait-writing.jpg');
  ok(ov(w).dataset.ratio === 'portrait', 'day ratio is portrait');
  ok(ov(w).querySelector('.wait-title').textContent === '克勞德正在翻書……', 'title copied from existing wait text');
  const l1 = ov(w).querySelector('.wait-line').textContent;
  await sleep(200);
  ok(ov(w).querySelector('.wait-line').textContent !== l1, 'caption line rotates');
  await sleep(220);
  ok(ov(w).querySelector('.wait-hint').textContent.length > 0, 'hint appears after hintAfter');
  clearDots(w);
  await sleep(30);
  ok(!ov(w).hidden, 'does not hide immediately (min visible / flicker guard)');
  await sleep(250);
  ok(ov(w).hidden, 'hidden after wait ends');

  // 2 short wait never shown
  w = make(); addDot(w); await sleep(10); clearDots(w); await sleep(120);
  ok(ov(w).hidden, 'short wait never shows');

  // 3 flicker: marker removed and re-added quickly keeps overlay
  w = make(); addDot(w); await sleep(100);
  clearDots(w); await sleep(5); addDot(w); await sleep(100);
  ok(!ov(w).hidden && ov(w).classList.contains('is-visible'), 'quick re-render does not close overlay');

  // 4 night theme: same single image as day
  w = make(); w.document.getElementById('tab-story').dataset.artTone = 'night'; addDot(w); await sleep(100);
  ok(/g43-wait-writing\.jpg$/.test(ov(w).querySelector('.wait-art').getAttribute('src')), 'night also uses the single wait image');
  ok(ov(w).dataset.ratio === 'portrait' && ov(w).dataset.theme === 'day', 'night uses portrait day layout');
  ok(!code.includes("file: 'g43-wait-night.jpg'"), 'code no longer uses the night wait variant');

  const assets = path.join(__dirname, '..', 'app', 'www', 'assets');
  ok(!fs.existsSync(path.join(assets, 'g43-wait-night.jpg')), 'night wait variant g43-wait-night.jpg is removed from assets');
  const approved = crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(assets, 'g43-wait-writing.jpg')))
    .digest('hex').toUpperCase();
  ok(approved === 'C787A498B189922B3D41B4DB577BEC7615A481B6BEEE5B4AAC22E9AE9E90357D', 'wait image matches the approved attachment');

  // 5 blocked states
  for (const cls of ['text-only', 'has-custom-portrait', 'has-scene-image', 'has-bundled-cg']) {
    w = make(); w.document.getElementById('tab-story').classList.add(cls); addDot(w); await sleep(100);
    ok(ov(w).hidden, `not shown when tab has ${cls}`);
  }
  // 6 CG starts during wait -> closes
  w = make(); addDot(w); await sleep(100);
  w.document.getElementById('tab-story').classList.add('has-bundled-cg'); await sleep(250);
  ok(ov(w).hidden, 'closes when a CG starts');

  // 7 English
  w = make('en'); addDot(w, 'Claude is turning pages…'); await sleep(100);
  ok(/^\(/.test(ov(w).querySelector('.wait-line').textContent), 'English caption lines when lang=en');
  ok(ov(w).querySelector('.wait-title').textContent === 'Claude is turning pages…', 'English title copied');

  // 8 second wait reuses overlay (no duplicates)
  w = make(); addDot(w); await sleep(100); clearDots(w); await sleep(250); addDot(w); await sleep(100);
  ok(w.document.querySelectorAll('#waitInterlude').length === 1 && !ov(w).hidden, 'second wait reuses a single overlay');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
