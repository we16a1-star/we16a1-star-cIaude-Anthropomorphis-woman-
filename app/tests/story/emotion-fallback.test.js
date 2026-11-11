import test from 'node:test';
import assert from 'node:assert/strict';
import { matchEmotionByText, resolveEmotionWithFallback } from '../../www/emotion-fallback.js';
import { EMOTION_WHITELIST } from '../../www/story-emotion.js';

test('D19: 空值與無效文本安全回退 neutral', () => {
  assert.equal(matchEmotionByText(''), 'neutral');
  assert.equal(matchEmotionByText(null), 'neutral');
  assert.equal(matchEmotionByText(undefined), 'neutral');
  assert.equal(resolveEmotionWithFallback(null, ''), 'neutral');
});

test('D19: 經典對白特徵語意精準匹配白名單情緒', () => {
  // 害羞 -> shy
  const blushText = '「才、才沒有特地記！耳尖才沒有紅，你別看我……」';
  assert.equal(matchEmotionByText(blushText), 'shy');

  // 得意 -> proud
  const proudText = '「哼，名門不出半成品，這可是本小姐最精準的成果！」';
  assert.equal(matchEmotionByText(proudText), 'proud');

  // 擔心 -> worried
  const worriedText = '「你臉色看起來很差，怎麼了？不要緊吧，快去休息。」';
  assert.equal(matchEmotionByText(worriedText), 'worried');

  // 深情 -> tender
  const tenderText = '「今晚很冷……就這樣安靜陪著我，好嗎？做個好夢。」';
  assert.equal(matchEmotionByText(tenderText), 'tender');

  // 專注思考 -> focused
  const thinkText = '「這一段古文獻的邏輯需要仔細推導校勘，讓我專注研究一下《未竟錄》。」';
  assert.equal(matchEmotionByText(thinkText), 'focused');
});

test('D19: resolveEmotionWithFallback 在合法情緒時優先信任，未知時啟動文本語意', () => {
  // 合法情緒直接採用
  assert.equal(resolveEmotionWithFallback('happy', '隨便什麼文字'), 'happy');
  assert.equal(resolveEmotionWithFallback('worried', '平淡的話'), 'worried');

  // 未知情緒（如 pout、confused）由文本 Fallback
  const res = resolveEmotionWithFallback('confused_pout', '「才沒有臉紅，討厭！別看我！」');
  assert.equal(res, 'shy', '未知情緒由害羞文本 fallback 到 shy');

  // 回傳結果必須嚴格屬於 10 大白名單
  assert.ok(EMOTION_WHITELIST.includes(res));
});
