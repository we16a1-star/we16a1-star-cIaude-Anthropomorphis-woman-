import test from 'node:test';
import assert from 'node:assert/strict';
import { LineRunner } from '../../www/line-runner.js';

test('line-runner: 禁用逐句時直接完成並展示全文', () => {
  const runner = new LineRunner({ speed: 10 });
  runner.savePreference(false);
  let finished = false;
  let text = '';

  runner.start(['第一句。', '第二句。'], {
    onLineChange: (t) => { text = t; },
    onFinish: () => { finished = true; }
  });

  assert.equal(finished, true);
  assert.equal(runner.isPlaying, false);
  assert.equal(text, '第一句。\n第二句。');
});

test('line-runner: 逐句播放打字與快進當前句', (t, done) => {
  const runner = new LineRunner({ speed: 20 });
  runner.savePreference(true);
  const lines = ['測試句子第一行。', '測試句子第二行。'];
  let lastText = '';
  let finished = false;

  runner.start(lines, {
    onLineChange: (t) => { lastText = t; },
    onFinish: () => { finished = true; }
  });

  assert.equal(runner.isPlaying, true);
  assert.equal(runner.currentIndex, 0);

  // 立即點擊快進
  const hasNext = runner.nextOrSkip();
  assert.equal(hasNext, true);
  assert.equal(lastText, '測試句子第一行。');
  assert.equal(runner.isCharTyping, false);

  // 再次點擊進入第二句
  runner.nextOrSkip();
  assert.equal(runner.currentIndex, 1);

  // 再次點擊快進第二句
  runner.nextOrSkip();
  assert.equal(lastText, '測試句子第二行。');
  assert.equal(runner.isPlaying, false);
  assert.equal(finished, true);

  runner.stop();
  done();
});

test('line-runner: skipAll 瞬間跳過所有句子', () => {
  const runner = new LineRunner({ speed: 20 });
  runner.savePreference(true);
  let finished = false;

  runner.start(['第一句。', '第二句。', '第三句。'], {
    onFinish: () => { finished = true; }
  });

  assert.equal(runner.isPlaying, true);
  runner.skipAll();

  assert.equal(runner.isPlaying, false);
  assert.equal(finished, true);
  assert.equal(runner.displayedText, '第一句。\n第二句。\n第三句。');
});

