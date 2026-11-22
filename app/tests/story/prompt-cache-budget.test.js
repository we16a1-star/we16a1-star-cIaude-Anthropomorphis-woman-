import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPromptPayload,
  buildAnthropicSystemBlocks,
  buildAnthropicMessagesPayload
} from '../../www/llm-client.js';
import {
  BUDGET_RANGE_STEPS,
  autoBudgetRange,
  buildInspectorData,
  computeBudgetBreakdown,
  renderInspectorBudgetBar
} from '../../www/prompt-inspector.js';
import {
  sanitizeExportPayload,
  snapshotSlotBeforeWrite,
  slotKey,
  slotBackupKey
} from '../../www/save-storage.js';
import { resolveEmotionWithFallback, mapSemanticEmotionLabel } from '../../www/emotion-fallback.js';

test('AnimaVN Prompt Cache: cache_control 僅附加於固定 system 前綴，不進動態 user／repair', () => {
  const payload = buildPromptPayload({
    state: { stage: 'B', playerName: '艾倫' },
    livingSection: '【生活層】午後陽光灑落。',
    memorySection: '- 記得你喜歡大吉嶺紅茶'
  });
  assert.ok(Array.isArray(payload.systemBlocks));
  assert.equal(payload.systemBlocks.length, 1);
  assert.deepEqual(payload.systemBlocks[0].cache_control, { type: 'ephemeral' });
  assert.equal(payload.systemBlocks[0].text, payload.system);

  const apiReq = buildAnthropicMessagesPayload({
    state: { stage: 'B', playerName: '艾倫' },
    livingSection: '【生活層】午後。',
    memorySection: '- 喜歡紅茶',
    userMessage: '我遞給她一杯熱茶。',
    repair: '【格式修正】請輸出合法 JSON。'
  });
  assert.equal(apiReq.system.length, 1);
  assert.ok(!apiReq.system[0].text.includes('【格式修正】'), '重試指示不可污染快取前綴');
  assert.ok(!apiReq.system[0].text.includes('喜歡紅茶'), '動態記憶不可進 system 快取');
  assert.equal(apiReq.messages.length, 1);
  assert.equal(apiReq.messages[0].role, 'user');
  assert.equal(apiReq.messages[0].cache_control, undefined);
  assert.ok(apiReq.messages[0].content.includes('【格式修正】'));

  assert.deepEqual(buildAnthropicSystemBlocks('   '), []);
});

test('AnimaVN Token Budget: 量程自動對齊與靜態／動態分布計算與視覺條渲染', () => {
  assert.equal(autoBudgetRange(1200), BUDGET_RANGE_STEPS[0]);
  assert.equal(autoBudgetRange(5000), 8192);
  assert.equal(autoBudgetRange(999999), BUDGET_RANGE_STEPS[BUDGET_RANGE_STEPS.length - 1]);

  const data = buildInspectorData({
    state: { stage: 'C', band: 'sweet', playerName: '艾倫' },
    livingSection: '【生活層】深夜書庫。',
    memorySection: '- 一起讀完一本古籍'
  });
  const b = computeBudgetBreakdown(data);
  assert.ok(b.staticTokens > 0);
  assert.ok(b.dynamicTokens > 0);
  assert.equal(b.staticTokens + b.dynamicTokens, data.totalTokens);
  assert.ok(b.cacheableRatioPct > 0 && b.cacheableRatioPct < 100);

  const html = renderInspectorBudgetBar(data);
  assert.ok(html.includes('pm-budget-track'));
  assert.ok(html.includes('is-static'));
  assert.ok(html.includes('is-dynamic'));
  assert.ok(html.includes('靜態快取前綴'));
});

test('AnimaVN 情緒語意兜底: 未知英文近義詞與強烈文本特徵準確映射至 10 大白名單', () => {
  assert.equal(mapSemanticEmotionLabel('flustered'), 'shy');
  assert.equal(mapSemanticEmotionLabel('slightly_pensive'), 'focused');
  assert.equal(resolveEmotionWithFallback('nostalgic', '一般對話'), 'tender');
  assert.equal(resolveEmotionWithFallback('unknown_tag', '她的耳尖頓時泛紅，別過臉說別盯著我看。'), 'shy');
});

test('AnimaVN 存檔備份安全: 匯出淨化敏感金鑰與寫入前快照守衛', () => {
  const dirty = {
    name: '存檔一',
    apiKey: 'sk-secret-123',
    nested: { authorization: 'Bearer abc', safeField: 'keep', list: [{ secretToken: 'x', ok: 1 }] }
  };
  const clean = sanitizeExportPayload(dirty);
  assert.equal('apiKey' in clean, false);
  assert.equal('authorization' in clean.nested, false);
  assert.equal(clean.nested.safeField, 'keep');
  assert.equal('secretToken' in clean.nested.list[0], false);
  assert.equal(clean.nested.list[0].ok, 1);
  assert.equal(dirty.apiKey, 'sk-secret-123', '不修改原物件');

  const map = new Map();
  const storage = {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v))
  };
  const slotPayload = JSON.stringify({ id: 'slot1', updatedAt: 100, state: { affection: 55 } });
  storage.setItem(slotKey('slot1'), slotPayload);
  assert.equal(snapshotSlotBeforeWrite(storage, 'slot1'), true);
  assert.equal(storage.getItem(slotBackupKey('slot1')), slotPayload);
});
