import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LineRunner, STORAGE_KEY_LINE_MODE, STORAGE_KEY_LINE_SPEED } from '../../www/line-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appJsPath = path.join(__dirname, '../../www/app.js');
const cssPath = path.join(__dirname, '../../www/style.css');

test('介面設定整合: app.js 包含視覺小說演出與多媒體群組', () => {
  const code = fs.readFileSync(appJsPath, 'utf8');
  assert.ok(code.includes('ensureVnPerformanceControls'), '含設定面板控制器');
  assert.ok(code.includes('vnPerformanceSettingGroup'), '含多媒體演出設定容器 ID');
  assert.ok(code.includes('vnLineModeToggle'), '含逐句演出開關 ID');
  assert.ok(code.includes('vnLineSpeedSlider'), '含逐句打字速度滑桿 ID');
  assert.ok(code.includes('vnGoodnightCgPref'), '含晚安 CG 偏好選單 ID (D16)');
  assert.ok(code.includes('vnVoiceToggle'), '含語音合成開關 ID (D20)');
  assert.ok(code.includes('claude_novel_goodnight_cg_pref_v1'), '含晚安 CG 存儲 Key');
  assert.ok(code.includes('claude_novel_voice_tts_v21'), '含語音存儲 Key');
});

test('介面設定整合 (D17): LineRunner 速度讀寫與持久化', () => {
  const runner = new LineRunner();
  assert.equal(runner.speed, 35, 'D17: 預設速度 35ms');

  runner.saveSpeedPreference(50);
  assert.equal(runner.speed, 50, '更新速度為 50ms');

  // clamp 測試
  runner.saveSpeedPreference(5);
  assert.equal(runner.speed, 10, '下限 clamp 10ms');

  runner.saveSpeedPreference(300);
  assert.equal(runner.speed, 200, '上限 clamp 200ms');

  assert.equal(STORAGE_KEY_LINE_MODE, 'claude_novel_line_mode_v1');
  assert.equal(STORAGE_KEY_LINE_SPEED, 'claude_novel_line_speed_v1');
});

test('介面設定整合: style.css 包含設定面板視覺美化樣式', () => {
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.ok(css.includes('.vn-performance-settings-group'), '含設定群組樣式');
  assert.ok(css.includes('.vn-speed-control-box'), '含速度控制箱排版');
  assert.ok(css.includes('.vn-line-mode-label'), '含逐句開關排版');
});

