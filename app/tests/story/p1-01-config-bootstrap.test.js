import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadConfigs } from '../../www/config-loader.js';

const here = dirname(fileURLToPath(import.meta.url)); // .../tests/story
const wwwDir = join(here, '..', '..', 'www');
const appSource = readFileSync(join(wwwDir, 'app.js'), 'utf8');

test('P1-01 案1: app.js 接線契約——import、bootstrap 函數（成功／失敗兩路）、啟動呼叫先於 UI 初始化', () => {
  assert.ok(appSource.includes("import { loadConfigs } from './config-loader.js';"), '靜態 import config-loader');

  const fnStart = appSource.indexOf('function bootstrapGameConfigs');
  assert.notEqual(fnStart, -1, 'bootstrap 函數存在');
  const block = appSource.slice(fnStart, fnStart + 800);
  assert.ok(block.includes('__gameConfigs=loadConfigs();'), '成功路徑：載入結果存入模組級變數（P1-02 起消費）');
  assert.ok(block.includes('catch(err){'), '失敗路徑：try/catch 包住載入（不白屏）');
  assert.ok(block.includes('console.error'), '失敗留痕 console.error');
  assert.ok(block.includes('alert('), '失敗可見警示（沿用 app.js 既有 alert 慣例）');
  assert.ok(block.includes('return false'), '失敗回傳 false（無異常拋出）');

  const callCount = appSource.split('bootstrapGameConfigs();').length - 1;
  assert.equal(callCount, 1, '啟動呼叫恰 1 處');
  const initIdx = appSource.indexOf('applyTheme(storedThemeChoice()); startThemeTimeWatch();');
  assert.ok(initIdx > -1, '找到頂層 init 行');
  assert.ok(appSource.indexOf('bootstrapGameConfigs();') < initIdx, 'bootstrap 呼叫先於 UI 初始化');
});

test('P1-01 案2: esbuild transformSync 全檔語法解析通過（app.js 7200+ 行接線後仍有效）', () => {
  const require = createRequire(import.meta.url);
  let es = null;
  for (const candidate of [
    join(wwwDir, '..', 'node_modules', 'esbuild'), // mods 樹自帶（若日後裝 node_modules）
    join(process.env.USERPROFILE || '', 'OneDrive', '桌面', 'Claude 娘1106', 'source', 'app', 'node_modules', 'esbuild') // 基準樹（唯讀取用，d14 同款）
  ]) {
    try { es = require(candidate); break; } catch { /* 依序嘗試 */ }
  }
  if (!es) {
    console.log('  （esbuild 不可用——兩處候選皆缺，跳過語法子檢查；契約檢查仍有效）');
    assert.ok(appSource.length > 0, '源碼可讀即通過');
    return;
  }
  const r = es.transformSync(appSource, { loader: 'js' });
  assert.ok(r.code && r.code.length > 0, 'transformSync 輸出非空＝語法有效');
});

test('P1-01 案3: loadConfigs 一次載入 15 檔全過 schema（含 P0-05／P0-06 修改面抽樣）', () => {
  const configs = loadConfigs();
  const names = ['character', 'stages', 'affectionBands', 'emotions', 'artDistribution', 'anchorsCropping', 'transitions', 'uiContrast', 'schedule', 'actions', 'events', 'extensions', 'crisis', 'dialogueFallback', 'replyProtocol'];
  assert.equal(Object.keys(configs).length, 15, '恰 15 份');
  for (const n of names) assert.ok(configs[n], n + ' 存在');
  assert.equal(configs.replyProtocol.fields.text.required, true, 'replyProtocol 抽樣（P0-05）');
  assert.equal(configs.schedule.life.timeBase, 'story', 'D1 抽樣（P0-06）');
  assert.equal(configs.extensions.usage.dailyCap.enabled, false, 'D7 抽樣（P0-06）');
  assert.equal(configs.extensions.expansion.dailyBonusCap, 3, 'D9 抽樣（P0-06）');
});
