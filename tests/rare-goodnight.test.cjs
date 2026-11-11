// WP5 稀有晚安 CG（36685）：純判定模組、素材、story-art 顯示與 app.js 接線。
// 用法（本資料夾上層）：node tests/rare-goodnight.test.cjs
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const www = path.join(root, 'app', 'www');
const nightCgPath = path.join(www, 'night-cg.js');
const storyArtPath = path.join(www, 'story-art.js');
const appPath = path.join(www, 'app.js');
const waitPath = path.join(www, 'wait-interlude.js');
const assetPath = path.join(www, 'assets', 'g43-cg-goodnight.jpg');

let pass = 0, fail = 0;
const ok = (cond, name) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); cond ? pass++ : fail++; };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// 1) 純判定模組：去掉 export 後在函式沙盒執行，確保測到實際邏輯。
const nightSource = fs.readFileSync(nightCgPath, 'utf8');
ok(!/\b(document|window|localStorage)\b/.test(nightSource), 'night-cg.js 是純判定模組（不碰 DOM／存檔）');
const night = new Function(nightSource.replace(/export /g, '') + `
  return {
    RARE_GOODNIGHT_CHANCE, RARE_GOODNIGHT_COOLDOWN_MS,
    RARE_GOODNIGHT_MIN_AFFECTION, RARE_GOODNIGHT_WARMUP_TURNS,
    hasGoodnightText, evaluateRareGoodnight
  };
`)();

ok(night.RARE_GOODNIGHT_CHANCE === 0.1, '機率為 10%');
ok(night.RARE_GOODNIGHT_COOLDOWN_MS === 24 * 60 * 60 * 1000, '冷卻為 24 小時');
ok(night.RARE_GOODNIGHT_MIN_AFFECTION === 45, '好感門檻為 45');
ok(night.RARE_GOODNIGHT_WARMUP_TURNS === 3, '暖機為 3 個成功回合');

// 玩家文字判定：中文「晚安」與英文 good night（含連字號／無空格）。
ok(night.hasGoodnightText('晚安，早點睡。') === true, '含「晚安」視為晚安文字');
ok(night.hasGoodnightText('good night') === true, 'good night 視為晚安文字');
ok(night.hasGoodnightText('Good Night!') === true, '英文不分大小寫');
ok(night.hasGoodnightText('goodnight') === true, 'goodnight 連寫也接受');
ok(night.hasGoodnightText('good-night') === true, 'good-night 連字號也接受');
ok(night.hasGoodnightText('早安，今天也要加油。') === false, '「早安」不算晚安');
ok(night.hasGoodnightText('') === false, '空字串不算');
ok(night.hasGoodnightText(null) === false && night.hasGoodnightText(undefined) === false, 'null／undefined 不算');

const NOW = 1800000000000;
const base = {
  action: '晚安，明天見。',
  affection: 50,
  isNight: true,
  now: NOW,
  lastShownAt: 0,
  busy: false,
  gameOver: false,
  ending: false,
  textOnly: false,
  warmupTurns: 0,
  random: () => 0.05,
};
const decide = extra => night.evaluateRareGoodnight({ ...base, ...extra });

ok(decide({}).show === true, '夜間＋好感 50＋晚安文字＋10% 內 -> 顯示');
ok(decide({ busy: true }).reason === 'busy', '回覆產生中不觸發');
ok(decide({ gameOver: true }).reason === 'game-over', 'Game Over 不觸發');
ok(decide({ ending: true }).reason === 'ending', '終章不觸發');
ok(decide({ textOnly: true }).reason === 'text-only', '純文字模式不觸發');
ok(decide({ warmupTurns: 3 }).reason === 'warmup', '暖機 3 回合內不觸發');
ok(decide({ warmupTurns: 1 }).reason === 'warmup', '暖機剩 1 回合仍不觸發');
ok(decide({ warmupTurns: 0 }).show === true, '暖機結束才可能觸發');
ok(decide({ isNight: false }).reason === 'day', '日間不觸發');
ok(decide({ affection: 44 }).reason === 'affection', '好感 44 不觸發');
ok(decide({ affection: 45 }).show === true, '好感 45 邊界觸發');
ok(decide({ affection: NaN }).reason === 'affection', '好感值無效不觸發');
ok(decide({ action: '今天讀了一整天的書。' }).reason === 'no-goodnight-text', '沒有晚安文字不觸發');
ok(decide({ action: 'good night' }).show === true, '英文晚安文字可觸發');

const DAY = night.RARE_GOODNIGHT_COOLDOWN_MS;
ok(decide({ lastShownAt: NOW - DAY + 1 }).reason === 'cooldown', '未滿 24 小時受冷卻');
ok(decide({ lastShownAt: NOW - DAY }).show === true, '滿 24 小時邊界解除冷卻');
ok(decide({ lastShownAt: NOW - DAY - 1 }).show === true, '超過 24 小時可再觸發');
ok(decide({ lastShownAt: NOW + 60 * 60 * 1000 }).reason === 'cooldown', '未來時間戳視為現在，最多再等 24 小時');
ok(decide({ lastShownAt: 0 }).show === true, '從未出現過不受冷卻');

ok(decide({ random: () => 0.099999 }).show === true, '隨機值 0.099999 在 10% 內');
ok(decide({ random: () => 0.1 }).reason === 'chance', '隨機值正好 0.1 不顯示（< 0.1 才顯示）');
ok(decide({ random: () => 0.5 }).reason === 'chance', '隨機值 0.5 不顯示');
ok(decide({ random: () => NaN }).reason === 'chance', '隨機值無效時不顯示');

// 2) 素材：JPG、756×545、不放大、單檔 ≤120 KB。
function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}
ok(fs.existsSync(assetPath), 'g43-cg-goodnight.jpg 存在');
if (fs.existsSync(assetPath)) {
  const buf = fs.readFileSync(assetPath);
  const size = jpegSize(buf);
  ok(!!size, '素材是有效 JPEG');
  ok(!!size && size.width === 756 && size.height === 545, '素材維持 756×545（不放大）');
  ok(buf.length <= 120 * 1024, `素材 ${buf.length} bytes ≤120 KB`);
}

// 3) story-art：登錄、露出入口、點擊即關、400ms、減少動態。
const artSource = fs.readFileSync(storyArtPath, 'utf8');
const rareLine = (artSource.match(/id: 'rare-goodnight'[^\n]*/) || [''])[0];
ok(rareLine.includes("artId: '36685'"), 'story-art 登錄 36685');
ok(rareLine.includes("file: 'g43-cg-goodnight.jpg'"), 'story-art 指向 g43-cg-goodnight.jpg');
ok(rareLine.includes("ratio: '16:9'"), '稀有晚安 CG 使用 16:9');
ok(rareLine.includes('fadeMs: 400'), '淡入淡出 400ms');
ok(rareLine.includes('clickToClose: true'), '設定點擊即關');
ok(!/flag:/.test(rareLine), '稀有晚安 CG 沒有 AI eventFlag（只由本機判定呼叫）');
ok(artSource.includes('window.__storyArt = { showRareGoodnight'), 'story-art 暴露 showRareGoodnight');
ok(artSource.includes('prefers-reduced-motion: reduce'), '尊重系統減少動態');
ok(artSource.includes("if (activeCg === 'rare-goodnight') finishCg();"), '只有稀有晚安 CG 點擊即關');
ok(artSource.includes('if (activeCg || tab.classList.contains(\'has-bundled-cg\')) return false;'), '已有 CG 時不插隊');
ok(!fs.readFileSync(waitPath, 'utf8').includes('36685'), '等待畫面不引用 36685');

// 4) jsdom：實際載入 story-art，確認顯示、樣式、關閉與阻擋。
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

ok(!!api && typeof api.showRareGoodnight === 'function', '__storyArt.showRareGoodnight 可用');

(async () => {
  ok(api.isCgActive() === false, '初始沒有 CG');
  ok(api.showRareGoodnight() === true, '夜間呼叫成功開始顯示');
  ok(api.isCgActive() === true, 'CG 進入顯示狀態');
  ok(cg.hidden === false, 'CG 圖層解除 hidden');
  ok(cg.dataset.cg === 'rare-goodnight', 'CG id 為 rare-goodnight');
  ok(cg.dataset.ratio === '16:9', 'CG data-ratio 為 16:9');
  ok(/g43-cg-goodnight\.jpg$/.test(cg.getAttribute('src') || ''), 'CG 載入 g43-cg-goodnight.jpg');
  ok(cg.style.pointerEvents === 'auto', '稀有晚安 CG 可點擊');
  ok(cg.style.cursor === 'pointer', '滑鼠游標提示可關閉');
  ok(/opacity 400ms/.test(cg.style.transition || ''), '行內淡入為 400ms');

  cg.onload();
  await delay(480);
  ok(tab.classList.contains('has-bundled-cg'), '400ms 後 CG 完整顯示');
  ok(cg.style.opacity === '1', 'CG 不透明度為 1');

  cg.dispatchEvent(new w.Event('click'));
  ok(!tab.classList.contains('has-bundled-cg'), '點擊後立即開始關閉');
  await delay(540);
  ok(cg.hidden === true, '關閉動畫後隱藏 CG');
  ok(!cg.getAttribute('src'), '關閉後清掉 src');
  ok(cg.style.pointerEvents === '' && cg.style.cursor === '', '關閉後清掉點擊樣式');
  ok(api.isCgActive() === false, '關閉後回到無 CG 狀態');

  tab.classList.add('text-only');
  ok(api.showRareGoodnight() === false, '純文字模式不顯示');
  tab.classList.remove('text-only');
  tab.classList.add('has-custom-portrait');
  ok(api.showRareGoodnight() === false, '自訂立繪時不顯示');
  tab.classList.remove('has-custom-portrait');
  tab.classList.add('has-scene-image');
  ok(api.showRareGoodnight() === false, '場景圖時不顯示');
  tab.classList.remove('has-scene-image');

  // 既有一般 CG 進行中時不可插隊；一般 CG 也不攔截點擊。
  stage.dataset.storyEvent = 'moon_bird';
  stage.dataset.storyEventToken = '1';
  await delay(20);
  ok(cg.dataset.cg === 'moon-bird', '一般 CG 仍由 eventFlag 正常顯示');
  ok(cg.style.pointerEvents === '', '一般 CG 不攔截點擊');
  ok(api.showRareGoodnight() === false, '一般 CG 顯示中不插隊');
  cg.dispatchEvent(new w.Event('click'));
  ok(api.isCgActive() === true, '一般 CG 不會被點擊關閉');
  cg.onload();
  await delay(730);
  ok(tab.classList.contains('has-bundled-cg'), '一般 CG 700ms 後照常顯示');
  cg.onerror();
  await delay(540);
  ok(api.isCgActive() === false, '一般 CG 結束後恢復');

  // 減少動態：不跑 400ms 過場。
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  ok(api.showRareGoodnight() === true, '減少動態時仍可顯示');
  ok(cg.style.transition === 'none', '減少動態時直接切換');
  cg.onload();
  await delay(20);
  ok(tab.classList.contains('has-bundled-cg'), '減少動態時立即顯示');
  cg.dispatchEvent(new w.Event('click'));
  await delay(540);
  ok(cg.hidden === true, '減少動態時仍可點擊關閉');

  // 5) app.js 接線與存檔欄位。
  const appSource = fs.readFileSync(appPath, 'utf8');
  ok(appSource.includes("import { evaluateRareGoodnight, RARE_GOODNIGHT_WARMUP_TURNS } from './night-cg.js';"), 'app.js 匯入夜間判定');
  ok(appSource.includes('rareGoodnightAt: 0,'), 'fresh() 預設 rareGoodnightAt');
  ok(appSource.includes('rareGoodnightAt:Math.max(0,Math.floor(Number(value.rareGoodnightAt)||0)),'), 'undo 快照正規化 rareGoodnightAt');
  ok(appSource.includes('rareGoodnightAt: Math.max(0,Math.floor(Number(rawState.rareGoodnightAt)||0)),'), 'normalizeSlot 保留 rareGoodnightAt');
  ok(appSource.includes('rareGoodnightAt: Math.max(0,Math.floor(Number(source.rareGoodnightAt)||0)),'), 'serializeState 保留 rareGoodnightAt');
  ok(appSource.includes('rareGoodnightAt:undoBefore.rareGoodnightAt,'), 'applyTurn 記錄 rareGoodnightAt 前的值');
  ok(appSource.includes('state.rareGoodnightAt=safe.rareGoodnightAt;'), 'restoreTurnUndo 還原 rareGoodnightAt');

  const scheduleCount = (appSource.match(/scheduleRareGoodnightCheck\(playerAction\);/g) || []).length;
  ok(scheduleCount === 2, 'API 與網頁回覆各排一次判定（共 2 處）');
  ok(appSource.includes('if(turnSaved)scheduleRareGoodnightCheck(playerAction);'), 'API 回合存檔成功才判定');
  ok(appSource.includes('if(token!==rareGoodnightCheckToken)return;'), '延遲判定有 token 防止舊回合誤觸發');
  ok(appSource.includes('if(busy||state.pendingAction||state.lastAiError)return;'), '產生中／待套用／錯誤時不判定');
  ok(appSource.includes("textOnly:tab?.classList.contains('text-only')===true"), '帶入純文字模式狀態');
  ok(appSource.includes('gameOver:!!state.gameOver'), '帶入 Game Over 狀態');
  ok(appSource.includes('ending:!!state.ending'), '帶入終章狀態');
  ok(appSource.includes('if(rareGoodnightWarmupTurns>0)rareGoodnightWarmupTurns-=1;'), '每個成功回合遞減暖機');
  ok(appSource.includes('state.rareGoodnightAt=now;') || appSource.includes('state.rareGoodnightAt=Date.now();'), '真的顯示才寫入冷卻時間');
  const resetCount = (appSource.match(/resetRareGoodnightWarmup\(\);/g) || []).length;
  ok(resetCount >= 5, `開始新故事／讀取切換／新開／刪除／匯入會重設暖機（${resetCount} 處）`);
  ok(!appSource.includes('rare_goodnight') && !appSource.includes("'rare-goodnight'"), '提示詞與 AI 事件旗標未開放稀有晚安');

  console.log(`\n${pass} passed, ${fail} failed`);
  dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch(error => {
  console.error('TEST_ERROR ' + (error && error.stack || error));
  process.exit(1);
});
