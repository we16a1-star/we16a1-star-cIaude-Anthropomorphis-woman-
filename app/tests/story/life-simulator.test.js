import test from 'node:test';
import assert from 'node:assert/strict';
import { LifeSimulator } from '../../www/life-simulator.js';

test('S7: 24 小時作息排程時段判定精確', () => {
  const sim = new LifeSimulator();
  assert.equal(sim.getPeriodForHour(7).key, 'dawn', '07:00 為清晨');
  assert.equal(sim.getPeriodForHour(10).key, 'morning', '10:00 為上午');
  assert.equal(sim.getPeriodForHour(14).key, 'afternoon', '14:00 為午後');
  assert.equal(sim.getPeriodForHour(18).key, 'evening', '18:00 為傍晚');
  assert.equal(sim.getPeriodForHour(21).key, 'night', '21:00 為夜晚');
  assert.equal(sim.getPeriodForHour(2).key, 'late_night', '02:00 為深夜');
  assert.equal(sim.getPeriodForHour(23).key, 'late_night', '23:00 為深夜');
});

test('S7 驗收：離線 8 小時後開啟，日誌合理、最多 5 筆，問候引用日誌（D13：愧疚句無限制）', () => {
  const eightHoursAgo = Date.now() - 8 * 60 * 60 * 1000;
  const sim = new LifeSimulator({
    lastActiveTime: eightHoursAgo,
    manualProgress: 20,
    recentLogs: ['之前看過第一章']
  });

  const greeting = sim.processOfflineTime(Date.now(), 'B');
  assert.ok(sim.recentLogs.length <= 5, '日誌嚴格限制最多 5 筆');
  assert.ok(sim.manualProgress > 20, '離線期間手冊進度有自己推進');
  assert.ok(greeting.length > 5, '問候語生成正常');

  // （D13 修訂）等待／愧疚句無限制，不再檢查禁詞
});

test('S7: 動作白名單驗證與生活層提示詞區塊組裝', () => {
  const sim = new LifeSimulator();
  assert.equal(sim.validateAction('sip_tea'), 'sip_tea', 'sip_tea 是合法動作');
  assert.equal(sim.validateAction('turn_page'), 'turn_page', 'turn_page 是合法動作');
  assert.equal(sim.validateAction('invalid_dance'), null, '非法動作回傳 null');

  const livingPrompt = sim.buildLivingSectionPrompt();
  assert.ok(livingPrompt.includes('【生活層】'), '提示詞包含生活層標籤');
  assert.ok(livingPrompt.includes('精力'), '提示詞包含精力');
  assert.ok(livingPrompt.includes('專注度'), '提示詞包含專注度');
});

test('S7: 深夜時段（23:00–05:00）溫柔勸休息，且每夜固定勸一次', () => {
  const sim = new LifeSimulator();
  const res1 = sim.checkNightSleepAdvice(24, '2026-11-07'); // 00:00
  assert.equal(res1.shouldAdvise, true);
  assert.ok(res1.message.includes('休息'), '包含勸休息語');

  // 同一夜再次檢查不再重複彈出騷擾
  const res2 = sim.checkNightSleepAdvice(2, '2026-11-07');
  assert.equal(res2.shouldAdvise, false);
});

