import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CONFIGS, loadConfigs } from '../../www/config-loader.js';

const { schedule: scheduleConfig, extensions: extensionsConfig, stages: stagesConfig } = ALL_CONFIGS;

test('P0-06/D1: life.timeBase 預設 story、可切本機時間', () => {
  loadConfigs();
  assert.equal(scheduleConfig.life.timeBase, 'story', 'D1 預設＝故事時段');
  assert.equal(scheduleConfig.life.realModeEnabled, true, 'D1 兩種都要能：real 模式可由設定開啟');
});

test('P0-06/D7+D9: 用量上限預設關閉、擴充每日加成上限 +3', () => {
  assert.equal(extensionsConfig.usage.dailyCap.enabled, false, 'D7 預設關閉');
  assert.equal(extensionsConfig.usage.dailyCap.limit, null, 'D7 limit 開啟時才需填');
  assert.equal(extensionsConfig.expansion.dailyBonusCap, 3, 'D9 擴充加成合計每日上限＋3');
  assert.equal(extensionsConfig.mechanisms.length, 11, 'D9 11 项擴充機制不動');
  assert.ok(!('dailyAffectionGainTotalCap' in extensionsConfig.rules), '舊 key 已依 D9 命名改寫為 expansion.dailyBonusCap');
});

test('P0-06/既有決策值複核: D2 和好每日回補上限＝10', () => {
  assert.equal(stagesConfig.parameters.dailyReconciliationCap, 10, 'D2＝10 分（P0-04 勘誤已確認之既有值）');
});
