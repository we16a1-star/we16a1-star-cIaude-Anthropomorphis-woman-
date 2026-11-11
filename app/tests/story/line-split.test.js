import test from 'node:test';
import assert from 'node:assert/strict';
import { splitLines } from '../../www/line-split.js';

test('line-split: 空值與異常輸入容錯', () => {
  assert.deepEqual(splitLines(''), []);
  assert.deepEqual(splitLines(null), []);
  assert.deepEqual(splitLines(undefined), []);
  assert.deepEqual(splitLines('   \n\n  '), []);
});

test('line-split: 基礎 CJK 標點斷句（句號、問號、感嘆號、換行）', () => {
  const text = '這是第一句話。這是第二句話！難道這是第三句嗎？是的，這是最後一句';
  const lines = splitLines(text);
  assert.deepEqual(lines, [
    '這是第一句話。',
    '這是第二句話！',
    '難道這是第三句嗎？',
    '是的，這是最後一句'
  ]);
});

test('line-split: 連續標點不切碎（例如……或！？）', () => {
  const text = '她猶豫了一下……真的要這樣做嗎！？難以置信！';
  const lines = splitLines(text);
  assert.deepEqual(lines, [
    '她猶豫了一下……',
    '真的要這樣做嗎！？',
    '難以置信！'
  ]);
});

test('line-split: 引號內部保護——不破壞人物對話', () => {
  const text = '克勞德抬起頭，「你來了？我正好把這段校對完。」隨後端起紅茶。';
  const lines = splitLines(text);
  assert.deepEqual(lines, [
    '克勞德抬起頭，',
    '「你來了？我正好把這段校對完。」',
    '隨後端起紅茶。'
  ]);
});

test('line-split: 括號內部動作描寫保護', () => {
  const text = '（微微臉紅，將書本移開一點點）……不要靠這麼近啦！';
  const lines = splitLines(text);
  assert.deepEqual(lines, [
    '（微微臉紅，將書本移開一點點）……',
    '不要靠這麼近啦！'
  ]);
});

test('line-split: 換行符號斷句', () => {
  const text = '陽光透過彩色玻璃灑在書桌上\n微風輕輕吹動書頁\n午後的書庫格外安靜。';
  const lines = splitLines(text);
  assert.deepEqual(lines, [
    '陽光透過彩色玻璃灑在書桌上',
    '微風輕輕吹動書頁',
    '午後的書庫格外安靜。'
  ]);
});

test('line-split: 連續多句台詞與對白', () => {
  const text = '「第一句。」「第二句！」「第三句？」';
  const lines = splitLines(text);
  assert.deepEqual(lines, [
    '「第一句。」',
    '「第二句！」',
    '「第三句？」'
  ]);
});
