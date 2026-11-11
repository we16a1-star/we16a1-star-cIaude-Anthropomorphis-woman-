import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_CONFIGS, loadScenePacks, validateScenePacks } from '../../www/config-loader.js';
import { StoryEngine } from '../../www/story-engine.js';
import { approveStoryEvent, STORY_EVENT_FLAGS, STORY_EVENT_ONE_SHOTS, GOODNIGHT_COOLDOWN_DAYS } from '../../www/story-events.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cssPath = path.join(__dirname, '../../www/style.css');
const artPath = path.join(__dirname, '../../www/story-art.js');
const appPath = path.join(__dirname, '../../www/app.js');

test('v5 Step 2 (D16): art_distribution.json 正確標記橫直比與晚安/夜間聊天角色', () => {
  const entries = ALL_CONFIGS.artDistribution.entries;

  // 36455 晚安主 CG
  const a36455 = entries['36455'];
  assert.ok(a36455, '36455 存在');
  assert.equal(a36455.ratio, '16:9');
  assert.equal(a36455.blurBg, false);
  assert.equal(a36455.textBoxPos, 'bottom-short');
  assert.equal(a36455.textMaxHeight, 0.22);
  assert.ok(a36455.role.includes('晚安主 CG') || a36455.role.includes('晚安'));

  // 36628 夜間聊天 CG（直式，蓋被讀書）
  const a36628 = entries['36628'];
  assert.ok(a36628, '36628 存在');
  assert.equal(a36628.ratio, 'portrait');
  assert.equal(a36628.blurBg, true);
  assert.equal(a36628.textBoxPos, 'bottom-dark');
  assert.ok(a36628.trigger.includes('36455'));

  // 36627 捏臉 CG（直式）
  const a36627 = entries['36627'];
  assert.equal(a36627.ratio, 'portrait');
  assert.equal(a36627.blurBg, true);

  // 36622 湖畔 CG（直式）
  const a36622 = entries['36622'];
  assert.equal(a36622.ratio, 'portrait');
  assert.equal(a36622.blurBg, true);
});

test('v5 Step 2 (D16): StoryEngine 晚安時刻支援 36455 主 CG 與 36628 夜間 CG 雙路徑', () => {
  const fakeSM = {
    stage: 'C',
    affection: 85,
    band: 'sweet',
    confessed: true
  };
  const fakeMem = {};
  const engine = new StoryEngine(fakeSM, fakeMem);

  // 預設 36455 晚安主 CG
  const gn1 = engine.triggerGoodnightEvent('2026-11-01', '36455');
  assert.ok(gn1, '觸發晚安事件');
  assert.equal(gn1.art, '36455');
  assert.equal(gn1.ratio, '16:9');
  assert.equal(gn1.blurBg, false);
  assert.ok(gn1.dialogue.includes('晚安'));

  // 冷卻未到（未滿 7 夜）回傳 null
  const gnBlocked = engine.triggerGoodnightEvent('2026-11-03', '36455');
  assert.equal(gnBlocked, null, '未滿 7 夜冷卻阻擋');

  // 7 夜後指定 36628 蓋被聊天 CG
  const gn2 = engine.triggerGoodnightEvent('2026-11-10', '36628');
  assert.ok(gn2, '滿 7 夜後觸發');
  assert.equal(gn2.art, '36628');
  assert.equal(gn2.ratio, 'portrait');
  assert.equal(gn2.blurBg, true);
  assert.ok(gn2.dialogue.includes('做個好夢，晚安'));
});

test('v5 Step 2: StoryEngine 支援觸碰反應（捏臉 36627）與湖畔夕陽（36622）事件', () => {
  const fakeSM = { stage: 'B', affection: 60, band: 'sweet' };
  const engine = new StoryEngine(fakeSM, {});

  const pinch = engine.triggerCheekPinchEvent();
  assert.ok(pinch, '觸發捏臉事件');
  assert.equal(pinch.art, '36627');
  assert.equal(pinch.ratio, 'portrait');
  assert.ok(pinch.dialogue.includes('捏我的臉'));

  const lakeside = engine.triggerLakesideEvent();
  assert.ok(lakeside, '觸發湖畔夕陽事件');
  assert.equal(lakeside.art, '36622');
  assert.equal(lakeside.ratio, 'portrait');
  assert.ok(lakeside.dialogue.includes('湖面'));
});

test('v5 Step 2: style.css 包含直式圖版型、模糊背景與矮橫條樣式規則', () => {
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.ok(css.includes('.bundled-story-cg[data-ratio="portrait"]'), '含 portrait 樣式');
  assert.ok(css.includes('#tab-story.has-portrait-cg::before'), '含直式背景模糊層樣式');
  assert.ok(css.includes('36455'), '含 36455 專用矮橫條');
  assert.ok(css.includes('36628'), '含 36628 專用矮橫條');
});

test('D18: scenePacks.json 佔位檔結構與 loadScenePacks 驗證通過', () => {
  const packs = loadScenePacks();
  assert.ok(packs, '載入 scenePacks');
  assert.equal(packs.version, 'v2.0-placeholder');
  assert.equal(packs.bgmEnabled, false, '預設不啟用 BGM 播放');
  assert.ok(Array.isArray(packs.scenePacks), 'scenePacks 欄位為陣列');
  assert.equal(validateScenePacks(packs), true, 'schema 驗證通過');
});

test('v5 Step 2 (app): story-events 已加入四個新旗標與好感／時段閘門', () => {
  for (const flag of ['goodnight', 'night_chat_reading', 'cheek_pinch', 'lakeside_sunset']) {
    assert.ok(STORY_EVENT_FLAGS.includes(flag), `${flag} 在旗標白名單`);
  }
  assert.equal(GOODNIGHT_COOLDOWN_DAYS, 7);
  assert.ok(STORY_EVENT_ONE_SHOTS.includes('lakeside_sunset'), '湖畔夕陽為一次性');
  assert.ok(!STORY_EVENT_ONE_SHOTS.includes('goodnight'), '晚安靠冷卻而非一次性');

  // 晚安：夜間、好感 75 以上；每 7 個故事日最多一次。
  assert.equal(approveStoryEvent('goodnight', { affection: 80, isNight: true, day: 10 }), 'goodnight');
  assert.equal(approveStoryEvent('goodnight', { affection: 80, isNight: true, day: 16, lastGoodnightDay: 10 }), '');
  assert.equal(approveStoryEvent('goodnight', { affection: 80, isNight: true, day: 17, lastGoodnightDay: 10 }), 'goodnight');
  assert.equal(approveStoryEvent('goodnight', { affection: 70, isNight: true, day: 20 }), '');
  assert.equal(approveStoryEvent('goodnight', { affection: 80, isNight: false, day: 20 }), '');
  // 時鐘關閉（day=0）時不套用日數冷卻。
  assert.equal(approveStoryEvent('goodnight', { affection: 80, isNight: true, day: 0, lastGoodnightDay: 10 }), 'goodnight');

  // 夜間蓋被讀書：夜間、好感 50 以上。
  assert.equal(approveStoryEvent('night_chat_reading', { affection: 50, isNight: true }), 'night_chat_reading');
  assert.equal(approveStoryEvent('night_chat_reading', { affection: 49, isNight: true }), '');
  assert.equal(approveStoryEvent('night_chat_reading', { affection: 60, isNight: false }), '');

  // 捏臉：日間限定。
  assert.equal(approveStoryEvent('cheek_pinch', { affection: 10, isNight: false }), 'cheek_pinch');
  assert.equal(approveStoryEvent('cheek_pinch', { affection: 90, isNight: true }), '');

  // 湖畔夕陽：好感 50 以上、一次性。
  assert.equal(approveStoryEvent('lakeside_sunset', { affection: 50 }), 'lakeside_sunset');
  assert.equal(approveStoryEvent('lakeside_sunset', { affection: 49 }), '');
  assert.equal(approveStoryEvent('lakeside_sunset', { affection: 80, seen: ['lakeside_sunset'] }), '');
});

test('v5 Step 2 (app): story-art 的 CG 對照已接上新圖與直式版型', () => {
  const source = fs.readFileSync(artPath, 'utf8');
  for (const file of ['g43-cg-bed-goodnight.jpg', 'g43-cg-goodnight-reading.jpg', 'g43-cg-cheek-pinch.jpg', 'g43-cg-lakeside.jpg']) {
    assert.ok(source.includes(`file: '${file}'`), `${file} 已接入`);
  }
  for (const id of ['bed-goodnight', 'goodnight-reading', 'cheek-pinch', 'lakeside-sunset']) {
    assert.ok(source.includes(`id: '${id}'`), `CG id ${id} 存在`);
  }
  assert.ok(!/flag: 'goodnight'[^\n]*g43-cg-magic-light\.jpg/.test(source), 'goodnight 不再指向魔法微光圖');
  assert.ok(source.includes('cgArt.dataset.ratio'), 'showCg 設定 data-ratio');
  assert.ok(source.includes("tab.classList.toggle('has-portrait-cg'"), '直式 CG 加上 has-portrait-cg');
  assert.ok(source.includes('--cg-bg-url'), '直式 CG 設定背景模糊變數');
  assert.ok(source.includes('claude_novel_goodnight_cg_pref_v1'), '晚安 CG 讀取玩家偏好');
});

test('v5 Step 2 (app): app.js 提示詞、核准呼叫與狀態已接上四個新旗標', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.ok(source.includes('letter／moon_bird／outing_memory／magic_touch／vow／goodnight／night_chat_reading／cheek_pinch／lakeside_sunset'), '中文提示詞含新旗標');
  assert.ok(source.includes('letter|moon_bird|outing_memory|magic_touch|vow|goodnight|night_chat_reading|cheek_pinch|lakeside_sunset'), '英文提示詞含新旗標');
  assert.ok(source.includes('day:eventClock.enabled?eventClock.day:0'), '核准呼叫帶入故事日');
  assert.ok(source.includes('lastGoodnightDay:state.goodnightDay'), '核准呼叫帶入上次晚安日');
  assert.ok(source.includes("if(state.storyEvent==='goodnight')state.goodnightDay=eventClock.enabled?eventClock.day:0"), '核准後更新晚安日');
  assert.ok(source.includes('goodnightDay: 0'), '預設狀態含 goodnightDay');
});

