import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVnScript, sliceScriptToLine, MAX_VN_LINE_CHARS } from '../../www/vn-script.js';
import { splitScriptLines } from '../../www/line-split.js';
import { LineRunner } from '../../www/line-runner.js';

test('vn-script: 內嵌引號不誤切（書名與專有名詞留在旁白內）', () => {
  const text = '桌上的古籍封面上印著「未竟錄」三個燙金字。「你終於來翻這一冊了嗎？」';
  const parsed = parseVnScript(text, { charName: 'Claude娘', userName: '艾倫' });
  assert.equal(parsed.lines.length, 2, '應拆為旁白一句＋台詞一句');
  assert.equal(parsed.lines[0].kind, 'narration');
  assert.equal(parsed.lines[0].speaker, null);
  assert.ok(parsed.lines[0].text.includes('「未竟錄」'), '內嵌書名引號應留在旁白句中');
  assert.equal(parsed.lines[1].kind, 'dialogue');
  assert.equal(parsed.lines[1].speaker, 'Claude娘');
  assert.equal(parsed.lines[1].text, '「你終於來翻這一冊了嗎？」');
});

test('vn-script: 行內情緒／場景／玩家標籤摘除與句序綁定', () => {
  const text = '<scene:rainy-night>窗外落起細雨。<emotion:shy>「別盯著我看啦……」\n<我>「我只是看你專心的樣子。」';
  const parsed = parseVnScript(text, { charName: 'Claude娘', userName: '艾倫' });
  assert.equal(parsed.lines.length, 3);
  assert.equal(parsed.lines[0].scene, 'rainy-night');
  assert.ok(!parsed.lines[0].text.includes('<scene:'), '標籤不得殘留於正文');
  assert.equal(parsed.lines[1].emotion, 'shy');
  assert.equal(parsed.lines[1].emotionSource, 'tag');
  assert.equal(parsed.lines[2].player, true);
  assert.equal(parsed.lines[2].speaker, '艾倫');
  assert.equal(parsed.lines[2].emotion, null, '玩家台詞不得觸發主角表情');
});

test('vn-script: 過長獨白自動依句讀安全切分且不產生純標點碎片', () => {
  const longText = '書庫裡的每一卷抄本都記錄著不同的季節與光影，' +
    '有些頁緣留著前人抄寫時不經意滴落的蠟淚，有些則夾著早已風乾的銀杏葉與書籤，' +
    '如果你願意多停下來看一會兒，就能在字裡行間聽見時間慢慢流過書架的聲音。';
  assert.ok(longText.length > MAX_VN_LINE_CHARS);
  const parsed = parseVnScript(longText);
  assert.ok(parsed.lines.length >= 2, '超長段應自動切分為多句');
  for (const line of parsed.lines) {
    assert.ok(line.text.length <= MAX_VN_LINE_CHARS + 4, '切分後每句長度受控');
    assert.ok(!/^[，。！？…\s」』]+$/.test(line.text), '不可產生純標點殘片');
  }
});

test('vn-script: 劇本式角色名識別與旁白動詞排除', () => {
  const text = 'Claude娘：這本茶譜我幫你留好了。\n她輕聲說：「趁熱喝吧。」';
  const parsed = parseVnScript(text, { charName: 'Claude娘', userName: '艾倫' });
  assert.equal(parsed.lines[0].speaker, 'Claude娘');
  assert.equal(parsed.lines[0].named, true);
  assert.equal(parsed.lines[0].text, '這本茶譜我幫你留好了。');
  assert.equal(parsed.lines[1].kind, 'narration', '「她輕聲說：」為旁白引導，不當說話人名');
});

test('vn-script: 插話截斷 sliceScriptToLine 精準截留到已讀句且去掉後續標籤', () => {
  const raw = '第一句旁白。<emotion:shy>「第二句台詞。」<emotion:happy>「第三句台詞。」';
  const parsed = parseVnScript(raw);
  const cut = sliceScriptToLine(raw, parsed, 1);
  assert.ok(cut.includes('「第二句台詞。」'));
  assert.ok(!cut.includes('第三句台詞'));
  assert.ok(!cut.includes('<emotion:happy>'), '不應帶入下一句前綴標籤');
});

test('line-runner: 支援結構化 VNLine[] 並觸發 onLineMeta 與位移查詢', () => {
  const lines = splitScriptLines('<emotion:tender>「晚安，好好休息吧。」\n<emotion:shy>「別、別盯著我看啦。」');
  const seenMeta = [];
  const runner = new LineRunner({
    speed: 10,
    autoAdvance: false,
    onLineMeta: (meta, idx) => seenMeta.push({ idx, emotion: meta.emotion, text: meta.text })
  });
  runner.enabled = true;
  runner.start(lines);
  assert.equal(seenMeta.length, 1);
  assert.equal(seenMeta[0].emotion, 'tender');
  assert.ok(runner.getTruncatedEndOffset() > 0);
  runner.nextOrSkip(); // 完成第 1 句打字
  runner.nextOrSkip(); // 進入第 2 句
  assert.equal(seenMeta.length, 2);
  assert.equal(seenMeta[1].emotion, 'shy');
  runner.stop();
});
