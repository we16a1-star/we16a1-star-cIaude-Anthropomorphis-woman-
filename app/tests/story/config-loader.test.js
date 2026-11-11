import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CONFIGS, loadConfigs, validateConfigs } from '../../www/config-loader.js';

test('S1: 所有 15 個設定檔啟動時成功載入並符合架構（P0-05 新增 reply_protocol.json）', () => {
  const configs = loadConfigs();
  assert.ok(configs.character, 'character.json 載入');
  assert.ok(configs.stages, 'stages.json 載入');
  assert.ok(configs.affectionBands, 'affection_bands.json 載入');
  assert.ok(configs.emotions, 'emotions.json 載入');
  assert.ok(configs.artDistribution, 'art_distribution.json 載入');
  assert.ok(configs.anchorsCropping, 'anchors_cropping.json 載入');
  assert.ok(configs.transitions, 'transitions.json 載入');
  assert.ok(configs.uiContrast, 'ui_contrast.json 載入');
  assert.ok(configs.schedule, 'schedule.json 載入');
  assert.ok(configs.actions, 'actions.json 載入');
  assert.ok(configs.events, 'events.json 載入');
  assert.ok(configs.extensions, 'extensions.json 載入');
  assert.ok(configs.crisis, 'crisis.json 載入');
  assert.ok(configs.dialogueFallback, 'dialogue_fallback.json 載入');
  assert.ok(configs.replyProtocol, 'reply_protocol.json 載入（P0-05）');

  // 人設微調檢查（落實！）
  assert.equal(configs.character.designAdjustments.noGlasses, true, '確認不採用眼鏡');
  assert.equal(configs.character.designAdjustments.noPasta, true, '確認不採用義大利麵');
  assert.ok(configs.character.designAdjustments.focusExpression.includes('蹙眉'), '專注表情包含蹙眉');
  assert.ok(configs.character.secretGoal.includes('初學者'), '心願手冊正確');
});

test('S1 驗收：欄位缺漏會精確報錯並指出檔名', () => {
  const brokenSchema = {
    'character.json': {
      target: { name: '克勞德' }, // 缺少 required 欄位
      required: ['name', 'specialties', 'secretGoal', 'designAdjustments', 'basePrompt']
    }
  };
  assert.throws(
    () => validateConfigs(brokenSchema),
    /\[ConfigLoaderError\] 設定檔 character\.json 缺少必要頂層欄位: 'specialties'/
  );

  const brokenNestedSchema = {
    'stages.json': {
      target: { parameters: { maxAffection: 50 }, stages: {} },
      required: ['parameters', 'stages'],
      nested: {
        'parameters.maxAffection': () => false
      }
    }
  };
  assert.throws(
    () => validateConfigs(brokenNestedSchema),
    /\[ConfigLoaderError\] 設定檔 stages\.json 的欄位校驗失敗: 'parameters\.maxAffection'/
  );
});

