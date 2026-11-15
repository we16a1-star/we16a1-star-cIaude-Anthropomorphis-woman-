import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLooseJson } from '../../www/json-repair.js';

const choices = ['一', '二', '三', '四', '五', '六', '七'];

test('json-repair: 彎引號與跳脫換行（Claude 常見格式）', () => {
  const text = '{“narration”:”第一段。\\n第二段「對話」。”,”affectionDelta”:1,”choices”:[”一”,”二”,”三”,”四”,”五”,”六”,”七”],”ending”:false,”endingText”:null,”memory”:”記憶”}';
  const parsed = parseLooseJson(text);

  assert.equal(parsed.narration, '第一段。\n第二段「對話」。');
  assert.equal(parsed.affectionDelta, 1);
  assert.deepEqual(parsed.choices, choices);
  assert.equal(parsed.ending, false);
  assert.equal(parsed.endingText, null);
  assert.equal(parsed.memory, '記憶');
});

test('json-repair: 全形括號、冒號與逗號', () => {
  const text = '｛“narration”：“全形測試。”，“choices”：[“一”，“二”，“三”，“四”，“五”，“六”，“七”]，“memory”：“記憶”｝';
  const parsed = parseLooseJson(text);

  assert.equal(parsed.narration, '全形測試。');
  assert.deepEqual(parsed.choices, choices);
  assert.equal(parsed.memory, '記憶');
});

test('json-repair: 字串內未轉義的雙引號與真實換行', () => {
  const text = '{\n"narration": "她說"你好"，然後\n繼續說下去。",\n"choices": ["一","二","三","四","五","六","七"],\n"memory": "記憶"\n}';
  const parsed = parseLooseJson(text);

  assert.equal(parsed.narration, '她說"你好"，然後\n繼續說下去。');
  assert.deepEqual(parsed.choices, choices);
});

test('json-repair: 尾逗號與 Markdown code fence', () => {
  const text = 'Gemini 回覆如下：\n```json\n{"narration":"測試","choices":["一","二","三","四","五","六","七",],"memory":"記憶",}\n```\n以上。';
  const parsed = parseLooseJson(text);

  assert.equal(parsed.narration, '測試');
  assert.deepEqual(parsed.choices, choices);
  assert.equal(parsed.memory, '記憶');
});

test('json-repair: 正文中的大括號不會干擾物件配對', () => {
  const text = '{"narration":"他用 { 與 } 表示集合，還寫了 {a:1}。","choices":["一","二","三","四","五","六","七"],"memory":"記憶"}';
  const parsed = parseLooseJson(text);

  assert.equal(parsed.narration, '他用 { 與 } 表示集合，還寫了 {a:1}。');
  assert.deepEqual(parsed.choices, choices);
});

test('json-repair: 一般轉義引號仍可解析', () => {
  const text = '{"narration":"她說\\"你好\\"。","choices":["一","二","三","四","五","六","七"],"memory":"記憶"}';
  const parsed = parseLooseJson(text);

  assert.equal(parsed.narration, '她說"你好"。');
});

test('json-repair: 混用彎引號與 ASCII 引號（Claude 實際回覆格式）', () => {
  const text = '{“narration”:”克勞德的筆尖在紙面上輕輕一點，墨跡暈開一個小小的圓。\\n\\n「借閱權限……」她低聲重複。",”affectionDelta”:1,”choices":["「第七層夜間不開放，卻有人留了這個記號。要不要現在上去看看？」",”指著壓痕問：「上一任校勘師為什麼離塔？你知道他的去向嗎？」",”「夜深了，這些線索明天再追也不遲。」",”小聲說：「剛才你靠過來的時候，很好聞。」",”請她說說：「這具機巧缺的齒輪，跟第七層有沒有關係？」",”提議：「我們先把今晚發現的整理進《未竟錄》。」",”笑著問：「你小時候有沒有迷路到那一層的經驗？」"],”ending”:false,”endingText”:””,”memory”:”第1天晚上。雨夜古籍閱覽室。",”emotion”:”focused”,”intensity”:2,”eventFlag”:null}';
  const parsed = parseLooseJson(text);

  assert.ok(parsed.narration.startsWith('克勞德的筆尖'), '正文使用彎引號開頭、ASCII 引號結尾');
  assert.ok(parsed.narration.includes('「借閱權限……」'), '正文內的引號保留');
  assert.equal(parsed.affectionDelta, 1);
  assert.equal(parsed.choices.length, 7, '七個選項完整');
  assert.ok(parsed.choices[0].startsWith('「第七層'), '第一個選項以 ASCII 引號包住');
  assert.ok(parsed.choices[3].startsWith('小聲說'), '後續選項以彎引號開頭、ASCII 引號結尾');
  assert.equal(parsed.ending, false);
  assert.equal(parsed.endingText, '', '空字串使用兩個彎引號');
  assert.equal(parsed.memory, '第1天晚上。雨夜古籍閱覽室。');
  assert.equal(parsed.emotion, 'focused');
  assert.equal(parsed.intensity, 2);
  assert.equal(parsed.eventFlag, null);
});

test('json-repair: 不是 JSON 的長文會被拒絕', () => {
  assert.throws(
    () => parseLooseJson('這不是 JSON，只是一段普通的故事文字。'),
    /JSON|物件|值/
  );
});
