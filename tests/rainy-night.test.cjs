// tests/rainy-night.test.cjs
// WP2 驗證：雨夜獨立場景圖與雨夜劇情 CG 整合驗證

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WWW = path.join(ROOT, 'app', 'www');
const ASSETS = path.join(WWW, 'assets');

test('雨夜背景素材 g43-story-rainy-night.jpg 存在且為有效 JPEG', () => {
  const file = path.join(ASSETS, 'g43-story-rainy-night.jpg');
  assert.ok(fs.existsSync(file), '檔案必須存在');
  const buf = fs.readFileSync(file);
  assert.ok(buf.length > 50000, `檔案大小合理 (${buf.length} bytes)`);
  assert.equal(buf[0], 0xFF, 'JPEG SOI 標頭 byte 0');
  assert.equal(buf[1], 0xD8, 'JPEG SOI 標頭 byte 1');
});

test('雨夜 CG 素材 g43-cg-rainy-night-claude.jpg 存在且為有效 JPEG', () => {
  const file = path.join(ASSETS, 'g43-cg-rainy-night-claude.jpg');
  assert.ok(fs.existsSync(file), '檔案必須存在');
  const buf = fs.readFileSync(file);
  assert.ok(buf.length > 50000, `檔案大小合理 (${buf.length} bytes)`);
  assert.equal(buf[0], 0xFF, 'JPEG SOI 標頭 byte 0');
  assert.equal(buf[1], 0xD8, 'JPEG SOI 標頭 byte 1');
});

test('story-art.js 登錄雨夜劇情 CG（flag: rainy_night, artId: 36686）', () => {
  const content = fs.readFileSync(path.join(WWW, 'story-art.js'), 'utf8');
  assert.ok(content.includes("flag: 'rainy_night'"), '需有 rainy_night 事件旗標');
  assert.ok(content.includes("artId: '36686'"), '需指派 artId 36686');
  assert.ok(content.includes("file: 'g43-cg-rainy-night-claude.jpg'"), '需指向雨夜克勞德 CG');
  assert.ok(content.includes("ratio: '16:9'"), '需為 16:9 比例');
});

test('story-art.js 嚴禁鏡射雨夜背景與 CG 素材', () => {
  const content = fs.readFileSync(path.join(WWW, 'story-art.js'), 'utf8');
  const mirroredMatch = content.match(/mirroredDefaultFiles\s*=\s*new\s*Set\(\[([\s\S]*?)\]\)/);
  assert.ok(mirroredMatch, '需能找到 mirroredDefaultFiles');
  const list = mirroredMatch[1];
  assert.ok(!list.includes('g43-story-rainy-night.jpg'), '雨夜背景絕不可加入鏡射清單');
  assert.ok(!list.includes('g43-cg-rainy-night-claude.jpg'), '雨夜 CG 絕不可加入鏡射清單');
});

test('story-art.js 包含雨夜對話與氣象觸發邏輯', () => {
  const content = fs.readFileSync(path.join(WWW, 'story-art.js'), 'utf8');
  assert.ok(content.includes('g43-story-rainy-night.jpg'), '需載入雨夜背景');
  assert.ok(content.includes('rainy-night'), '需使用 rainy-night 場景識別');
  assert.ok(content.includes('showRainyNightScene'), '需包含 showRainyNightScene 方法');
  assert.ok(content.includes('window.__storyArt = { showRareGoodnight, showBedroomScene, showRainyNightScene'), 'window.__storyArt 需暴露 showRainyNightScene');
});

test('art_distribution.json 登錄 36686（雨夜 CG）與 36687（雨夜背景）', () => {
  const raw = fs.readFileSync(path.join(WWW, 'config', 'art_distribution.json'), 'utf8');
  const data = JSON.parse(raw);
  assert.ok(data.entries['36686'], '需有 36686 項目');
  assert.equal(data.entries['36686'].file, 'g43-cg-rainy-night-claude.jpg');
  assert.equal(data.entries['36686'].ratio, '16:9');
  assert.equal(data.entries['36686'].tone, 'night');

  assert.ok(data.entries['36687'], '需有 36687 項目');
  assert.equal(data.entries['36687'].file, 'g43-story-rainy-night.jpg');
  assert.equal(data.entries['36687'].ratio, '16:9');
  assert.equal(data.entries['36687'].timeGroup, 'night');
});

test('app.js 與 app.bundle.js 包含雨夜標籤判斷邏輯', () => {
  const appJs = fs.readFileSync(path.join(WWW, 'app.js'), 'utf8');
  assert.ok(appJs.includes('isRainyNight'), 'app.js 需有 isRainyNight 判定');
  assert.ok(appJs.includes('雨夜'), 'app.js 需支援雨夜文字');

  const bundle = fs.readFileSync(path.join(WWW, 'app.bundle.js'), 'utf8');
  assert.ok(bundle.includes('rainy-night'), 'app.bundle.js 需同步 rainy-night 判定');
  assert.ok(bundle.includes('\\u96E8\\u591C') || bundle.includes('雨夜'), 'app.bundle.js 需同步雨夜文字');
});
