// WP7 臥室場景／稀有晚安 CG 條件整合：純判定與 app.js 接線。
// 用法（本資料夾上層）：node tests/bedroom-wp7.test.cjs
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const www = path.join(root, 'app', 'www');
const bedroomPath = path.join(www, 'bedroom-scene.js');
const appPath = path.join(www, 'app.js');
const storyArtPath = path.join(www, 'story-art.js');

let pass = 0, fail = 0;
const ok = (cond, name) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); cond ? pass++ : fail++; };

const src = fs.readFileSync(bedroomPath, 'utf8');
ok(!/\b(document|window|localStorage)\b/.test(src), 'bedroom-scene.js 是純判定模組');
const mod = new Function(src.replace(/export /g, '') + `
  return { BEDROOM_SCENE_CHANCE, BEDROOM_SCENE_COOLDOWN_MS, BEDROOM_SCENE_MIN_AFFECTION,
    isBedroomScene, bedroomArtFor, evaluateBedroomScene };
`)();

ok(mod.BEDROOM_SCENE_CHANCE === 0.25, '臥室場景機率為 25%');
ok(mod.BEDROOM_SCENE_COOLDOWN_MS === 24 * 60 * 60 * 1000, '臥室場景冷卻為 24 小時');
ok(mod.BEDROOM_SCENE_MIN_AFFECTION === 45, '臥室場景好感門檻為 45');

// isBedroomScene
for (const [label, exp] of [['臥室 · 夜', true], ['寢室', true], ['睡前', true], ['床邊', true], ['古籍閱覽室 · 雨夜', false], ['', false], [null, false]]) {
  ok(mod.isBedroomScene(label) === exp, `isBedroomScene(${JSON.stringify(label)}) === ${exp}`);
}

// bedroomArtFor
ok(mod.bedroomArtFor(44) === null, '好感 44 不給圖');
ok(mod.bedroomArtFor(45) === '36628', '好感 45 → 36628');
ok(mod.bedroomArtFor(89) === '36628', '好感 89 → 36628');
ok(mod.bedroomArtFor(90) === '36629', '好感 90 → 36629');
ok(mod.bedroomArtFor(100) === '36629', '好感 100 → 36629');

const NOW = 1900000000000;
const base = {
  label: '臥室 · 夜',
  affection: 50,
  isNight: true,
  now: NOW,
  lastShownAt: 0,
  seenLabels: [],
  busy: false,
  gameOver: false,
  ending: false,
  textOnly: false,
  warmupTurns: 0,
  random: () => 0.5,
};
const decide = extra => mod.evaluateBedroomScene({ ...base, ...extra });

ok(decide({}).show === true, '夜間＋好感 50＋臥室標籤＋第一次 → 顯示');
ok(decide({}).artId === '36628', '第一次顯示 36628');
ok(decide({ affection: 95 }).artId === '36629', '好感 95 → 36629');

// guards
ok(decide({ busy: true }).reason === 'busy', '回覆產生中不觸發');
ok(decide({ gameOver: true }).reason === 'game-over', 'Game Over 不觸發');
ok(decide({ ending: true }).reason === 'ending', '終章不觸發');
ok(decide({ textOnly: true }).reason === 'text-only', '純文字模式不觸發');
ok(decide({ warmupTurns: 3 }).reason === 'warmup', '暖機期不觸發');
ok(decide({ isNight: false }).reason === 'day', '日間不觸發');
ok(decide({ affection: 44 }).reason === 'affection', '好感 44 不觸發');
ok(decide({ label: '古籍閱覽室 · 雨夜' }).reason === 'not-bedroom', '非臥室標籤不觸發');

// already-seen (per scene)
ok(decide({ seenLabels: ['臥室 · 夜'] }).reason === 'already-seen', '同一場景只觸發一次');
ok(decide({ seenLabels: ['其他臥室'], label: '臥室 · 夜', random: () => 0.1 }).show === true, '不同場景可各自觸發');

// cooldown
const DAY = mod.BEDROOM_SCENE_COOLDOWN_MS;
ok(decide({ seenLabels: ['x'], lastShownAt: NOW - DAY + 1, label: '臥室 · 夜' }).reason === 'cooldown', '未滿 24 小時受冷卻');
ok(decide({ seenLabels: ['x'], lastShownAt: NOW - DAY, label: '臥室 · 夜', random: () => 0.1 }).show === true, '滿 24 小時解除冷卻');

// first-ever guaranteed vs 25% afterwards
ok(decide({ seenLabels: [], random: () => 0.99 }).show === true, '第一次必出現（不受機率）');
ok(decide({ seenLabels: ['x'], label: '臥室 · 夜', random: () => 0.99 }).reason === 'chance', '之後 25%：0.99 不顯示');
ok(decide({ seenLabels: ['x'], label: '臥室 · 夜', random: () => 0.1 }).show === true, '之後 25%：0.1 顯示');
ok(decide({ seenLabels: ['x'], label: '臥室 · 夜', random: () => 0.25 }).reason === 'chance', '隨機值正好 0.25 不顯示（< 0.25 才顯示）');

// app.js wiring
const appSource = fs.readFileSync(appPath, 'utf8');
ok(appSource.includes("import { evaluateBedroomScene, BEDROOM_SCENE_COOLDOWN_MS } from './bedroom-scene.js';"), 'app.js 匯入臥室判定');
ok(appSource.includes('bedroomSceneAt: 0,'), 'fresh() 預設 bedroomSceneAt');
ok(appSource.includes('bedroomSceneLabels: [],'), 'fresh() 預設 bedroomSceneLabels');
ok(appSource.includes('bedroomSceneAt:Math.max(0,Math.floor(Number(value.bedroomSceneAt)||0)),'), 'undo 快照正規化 bedroomSceneAt');
ok(appSource.includes('bedroomSceneLabels:Array.isArray(value.bedroomSceneLabels)'), 'undo 快照正規化 bedroomSceneLabels');
ok(appSource.includes('bedroomSceneAt: Math.max(0,Math.floor(Number(rawState.bedroomSceneAt)||0)),'), 'normalizeSlot 保留 bedroomSceneAt');
ok(appSource.includes('bedroomSceneAt: Math.max(0,Math.floor(Number(source.bedroomSceneAt)||0)),'), 'serializeState 保留 bedroomSceneAt');
ok(appSource.includes('bedroomSceneAt:undoBefore.bedroomSceneAt,'), 'applyTurn 記錄 bedroomSceneAt 前的值');
ok(appSource.includes('bedroomSceneLabels:undoBefore.bedroomSceneLabels,'), 'applyTurn 記錄 bedroomSceneLabels 前的值');
ok(appSource.includes('state.bedroomSceneAt=safe.bedroomSceneAt;'), 'restoreTurnUndo 還原 bedroomSceneAt');
ok(appSource.includes('state.bedroomSceneLabels=safe.bedroomSceneLabels;'), 'restoreTurnUndo 還原 bedroomSceneLabels');
ok(appSource.includes('lastTurnWasBedroom'), '追蹤本回合是否臥室場景');
ok(appSource.includes('function currentBedroomLabel()'), 'currentBedroomLabel 讀取場景標籤');
ok(appSource.includes('maybeShowBedroomOrGoodnight'), '合併判定函式');
ok(appSource.includes("const shown=window.__storyArt?.showRareGoodnight?.()===true;"), '稀有晚安 CG 優先顯示');
ok(appSource.includes("const shown=window.__storyArt?.showBedroomScene?.(bedroomDecision.artId)===true;"), '臥室場景 CG 顯示');
ok(appSource.includes('if(!state.bedroomSceneLabels.includes(label)) state.bedroomSceneLabels=[...state.bedroomSceneLabels,label];'), '每場景只觸發一次（記錄標籤）');
ok(appSource.includes('scheduleRareGoodnightCheck(playerAction);'), 'API／網頁回覆仍走同一延遲判定');

// story-art exposure
const artSource = fs.readFileSync(storyArtPath, 'utf8');
ok(artSource.includes('window.__storyArt = { showRareGoodnight, showBedroomScene'), 'story-art 暴露 showBedroomScene');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
