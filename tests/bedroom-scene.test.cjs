// WP6 臥室場景 CG（36628／36629）：story-art 登錄、呈現入口、不作預設。
// 用法（本資料夾上層）：node tests/bedroom-scene.test.cjs
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const www = path.join(root, 'app', 'www');
const storyArtPath = path.join(www, 'story-art.js');
const artDistPath = path.join(www, 'config', 'art_distribution.json');
const readingPath = path.join(www, 'assets', 'g43-cg-goodnight-reading.jpg');
const nightgownPath = path.join(www, 'assets', 'g43-cg-goodnight-nightgown.jpg');

let pass = 0, fail = 0;
const ok = (cond, name) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); cond ? pass++ : fail++; };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    i += 2 + len;
  }
  return null;
}

// 1) 素材存在且為有效 JPEG。
for (const [p, label] of [[readingPath, '36628 (reading)'], [nightgownPath, '36629 (nightgown)']]) {
  ok(fs.existsSync(p), `${label} 素材存在`);
  if (fs.existsSync(p)) {
    const buf = fs.readFileSync(p);
    const size = jpegSize(buf);
    ok(!!size, `${label} 是有效 JPEG`);
    ok(!!size && size.width === 1024 && size.height === 1536, `${label} 尺寸 1024×1536`);
  }
}

// 2) story-art 登錄與呈現入口。
const artSource = fs.readFileSync(storyArtPath, 'utf8');
const nightgownLine = (artSource.match(/id: 'nightgown'[^\n]*/) || [''])[0];
ok(nightgownLine.includes("artId: '36629'"), 'story-art 登錄 nightgown（artId 36629）');
ok(nightgownLine.includes("file: 'g43-cg-goodnight-nightgown.jpg'"), 'nightgown 指向 g43-cg-goodnight-nightgown.jpg');
ok(nightgownLine.includes("ratio: 'portrait'"), 'nightgown 使用 portrait');
ok(nightgownLine.includes('blurBg: true'), 'nightgown 啟用 blurBg');
ok(!/flag:/.test(nightgownLine), 'nightgown 不掛 AI eventFlag（只由本機呼叫）');
ok(artSource.includes("id: 'goodnight-reading'"), '36628（goodnight-reading）既有登錄保留');
ok(artSource.includes('window.__storyArt = { showRareGoodnight, showBedroomScene'), 'story-art 暴露 showBedroomScene');

// 3) 不作預設／唯一素材：returnToTimeDefault 與 applyEmotionArt 不引用 36629／nightgown。
const returnFn = artSource.slice(artSource.indexOf('function returnToTimeDefault'), artSource.indexOf('function applyEmotionArt'));
const emotionFn = artSource.slice(artSource.indexOf('function applyEmotionArt'), artSource.indexOf('function finishCg'));
ok(!/nightgown|36629|goodnight-nightgown/.test(returnFn), 'returnToTimeDefault 不引用臥室 CG');
ok(!/nightgown|36629|goodnight-nightgown/.test(emotionFn), 'applyEmotionArt 不引用臥室 CG');
ok(!/nightgown|36629/.test(artSource.slice(0, artSource.indexOf('const cgEvents'))), 'cgEvents 之前不引用臥室 CG');

// 4) art_distribution.json 已列入 36628／36629，且為 portrait + blurBg。
const dist = JSON.parse(fs.readFileSync(artDistPath, 'utf8'));
for (const id of ['36628', '36629']) {
  const e = dist.entries[id];
  ok(!!e, `art_distribution 含 ${id}`);
  if (e) {
    ok(e.ratio === 'portrait' && e.blurBg === true, `${id} 為 portrait + blurBg`);
    ok(e.autoSwitch === false, `${id} autoSwitch 為 false（不自動切換）`);
  }
}

// 5) jsdom：實際載入 story-art，確認呈現入口。
const dom = new JSDOM(`<!doctype html><html><body>
  <section id="tab-story" class="tab-panel">
    <div class="vn-stage" data-story-emotion="neutral"></div>
    <img id="storyDefaultArt" alt="">
    <div id="storyArtGrade"></div>
    <div id="storySceneTransition"></div>
    <img id="bundledStoryCg" hidden alt="">
    <div id="dialogueText"></div>
  </section>
</body></html>`, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.test/' });
const w = dom.window;
w.eval(artSource);
const api = w.__storyArt;
const tab = w.document.getElementById('tab-story');
const stage = w.document.querySelector('.vn-stage');
const cg = w.document.getElementById('bundledStoryCg');

ok(!!api && typeof api.showBedroomScene === 'function', '__storyArt.showBedroomScene 可用');

(async () => {
  ok(api.showBedroomScene('36629') === true, '臥室場景 36629 可顯示');
  ok(cg.hidden === false && cg.dataset.cg === 'nightgown', 'CG 為 nightgown');
  ok(cg.dataset.ratio === 'portrait', 'CG data-ratio 為 portrait');
  ok(tab.classList.contains('has-portrait-cg'), 'portrait CG 加上 has-portrait-cg');
  ok(/g43-cg-goodnight-nightgown\.jpg$/.test(cg.getAttribute('src') || ''), '載入 nightgown 圖');
  cg.onload();
  await delay(720);
  ok(tab.classList.contains('has-bundled-cg'), '臥室 CG 照常顯示');

  cg.onerror();
  await delay(540);
  ok(api.isCgActive() === false, '臥室 CG 結束後恢復');

  ok(api.showBedroomScene('36628') === true, '臥室場景 36628 可顯示');
  ok(cg.dataset.cg === 'goodnight-reading', '36628 顯示為 goodnight-reading');
  ok(/g43-cg-goodnight-reading\.jpg$/.test(cg.getAttribute('src') || ''), '載入 reading 圖');
  cg.onload();
  await delay(720);
  cg.onerror();
  await delay(540);

  tab.classList.add('text-only');
  ok(api.showBedroomScene('36629') === false, '純文字模式不顯示');
  tab.classList.remove('text-only');

  ok(api.showBedroomScene('99999') === false, '不存在的 artId 不顯示');
  ok(api.showBedroomScene(null) === false, 'null 不顯示');

  // 6) 不作預設：storyDefaultArt 不會被設為臥室圖。
  ok(!/g43-cg-goodnight-nightgown\.jpg/.test(w.document.getElementById('storyDefaultArt').getAttribute('src') || ''), '預設立繪不是臥室圖');

  console.log(`\n${pass} passed, ${fail} failed`);
  dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch(error => {
  console.error('TEST_ERROR ' + (error && error.stack || error));
  process.exit(1);
});
