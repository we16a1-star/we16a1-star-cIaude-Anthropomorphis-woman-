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

test('line-runner: 自動播放預設開啟，停留時間可調整並持久化', () => {
  const runner = new LineRunner({ speed: 10 });
  assert.equal(runner.autoAdvance, true, '自動播放預設開啟');

  runner.saveAutoAdvancePreference(false);
  assert.equal(runner.autoAdvance, false, '可關閉自動播放');
  runner.saveAutoAdvancePreference(true);
  assert.equal(runner.autoAdvance, true, '可重新開啟自動播放');

  runner.saveAutoDelayPreference(100);
  assert.equal(runner.autoDelay, 500, '低於下限時 clamp 至 500ms');
  runner.saveAutoDelayPreference(9000);
  assert.equal(runner.autoDelay, 6000, '高於上限時 clamp 至 6000ms');
  runner.saveAutoDelayPreference(2400);
  assert.equal(runner.autoDelay, 2400);
});

test('line-runner: 自動播放會在停留後前進下一句，最後一句停下', (t, done) => {
  const runner = new LineRunner({ speed: 1, autoAdvance: true, autoDelay: 20 });
  runner.savePreference(true);
  const guard = setTimeout(() => {
    runner.stop();
    done(new Error('自動播放逾時'));
  }, 2000);

  runner.start(['第一句。', '第二句。'], {
    onFinish: () => {
      clearTimeout(guard);
      try {
        assert.equal(runner.currentIndex, 1, '已自動前進到第二句');
        assert.equal(runner.displayedText, '第二句。');
        assert.equal(runner.isPlaying, false, '最後一句播完即停止');
        done();
      } catch (error) {
        done(error);
      }
    }
  });
});

test('line-runner: 手動停止會取消待前進的自動播放', (t, done) => {
  const runner = new LineRunner({ speed: 1, autoAdvance: true, autoDelay: 80 });
  runner.savePreference(true);
  let armed = false;

  runner.start(['第一句。', '第二句。'], {
    onLineChange: (text, index, total, typing) => {
      if (armed || index !== 0 || typing) return;
      armed = true;
      runner.stop();
      setTimeout(() => {
        try {
          assert.equal(runner.currentIndex, 0, '停止後不應自行前進');
          assert.equal(runner.isPlaying, false);
          done();
        } catch (error) {
          done(error);
        }
      }, 140);
    }
  });
});

test('line-runner: 關閉自動播放時不會自行前進', (t, done) => {
  const runner = new LineRunner({ speed: 1, autoAdvance: false, autoDelay: 20 });
  runner.savePreference(true);
  let armed = false;

  runner.start(['第一句。', '第二句。'], {
    onLineChange: (text, index, total, typing) => {
      if (armed || index !== 0 || typing) return;
      armed = true;
      setTimeout(() => {
        try {
          assert.equal(runner.currentIndex, 0, '關閉時應停在第一句');
          assert.equal(runner.isPlaying, true);
          runner.stop();
          done();
        } catch (error) {
          runner.stop();
          done(error);
        }
      }, 90);
    }
  });
});

