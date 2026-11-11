import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_CONFIGS, loadConfigs } from '../../www/config-loader.js';
import { PromptAssembler } from '../../www/prompt-assembler.js';
import { LifeSimulator } from '../../www/life-simulator.js';

// P0-04 提示詞 v1 定稿檢核（離線，不呼叫 LLM；真 LLM 抽樣待 P1-02/P1-03 接線後進行）
// 來源：指示書附錄 C（C.2 階段／C.5 好感帶／C.6 生活層）＋ D3（口頭禪移除）＋ D13（貶低／羞辱／冷暴力以外全解禁）。
// D13 依指示書「本文件與用戶最新指示衝突時，以用戶最新指示為準」覆蓋 §2 第 14 行與附錄 C.3/C.4/C.5/C.6 的相關禁令子句。

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WWW = path.join(HERE, '..', '..', 'www');
const read = f => readFileSync(path.join(WWW, f), 'utf8');

// 提示詞來源檔（8 個）：D3／D13 檢查以此為單位
const SOURCES = [
  'config/character.json', 'config/stages.json', 'config/affection_bands.json', 'config/schedule.json',
  'character-profile.js', 'life-simulator.js', 'prompt-rules.js', '../tests/story/life-simulator.test.js',
];

// 本 codebase 中「眼鏡／義大利麵」只准以否定語境出現；掃描先剝離已知否定寫法再查歸零。
const stripNegations = t => String(t)
  .replace(/不(?:採用|戴)眼鏡/g, '')
  .replace(/不要任意增加眼鏡/g, '')
  .replace(/不採用義大利麵/g, '');

const BAND_NAMES = { sweet: '甜', stable: '平穩', awkward: '小彆扭', reconciliation: '待和好' };

test('P0-04: S1 設定檔全數載入且驗證通過（修改後不破壞架構）', () => {
  const c = loadConfigs();
  assert.ok(c.character && c.stages && c.affectionBands && c.emotions && c.schedule && c.actions, '關鍵 config 載入');
});

test('P0-04/D3: 口頭禪「再看一頁，就吃。」已自提示詞來源移除（保留「名門不出半成品。」）', () => {
  assert.equal(ALL_CONFIGS.character.designAdjustments.catchphrase, '', 'character.json catchphrase 清空留位');
  for (const f of SOURCES.slice(0, 7)) {
    assert.ok(!read(f).includes('再看一頁，就吃'), `${f} 不含口頭禪`);
  }
  assert.ok(read('character-profile.js').includes('名門不出半成品'), '保留「名門不出半成品。」');
});

test('P0-04/D13: 占有／排他／愧疚（含等待句）禁令已全數移除', () => {
  for (const f of SOURCES) {
    const s = read(f);
    assert.ok(!s.includes('不說占有'), `${f} 不再含「不說占有」`);
    assert.ok(!s.includes('占有、排他'), `${f} 不再含「占有、排他」`);
    assert.ok(!s.includes('勒索愧疚'), `${f} 不再含「勒索愧疚」`);
    assert.ok(!s.includes('罪惡感'), `${f} 不再含「罪惡感」`);
    assert.ok(!s.includes('我一直在等你'), `${f} 不再含等待愧疚句禁令`);
    assert.ok(!s.includes('guiltWords'), `${f} 不再含程式層愧疚過濾器`);
  }
});

test('P0-04/D13: 保留禁令仍在——貶底／羞辱／冷暴力三項', () => {
  assert.ok(read('config/character.json').includes('任何時候都不冷暴力、不貶低'), 'character.json basePrompt 保留');
  assert.ok(read('character-profile.js').includes('貶低、羞辱、冷落或情感操控'), 'DEFAULT 人設【界線】保留');
  assert.ok(read('character-profile.js').includes('不能變成貶低、羞辱、冷暴力、情感操控或強迫'), '高傲嬌版【界線】保留');
  assert.ok(read('prompt-rules.js').includes('不貶低、不羞辱、不冷暴力'), 'prompt-rules tone 保留');
  assert.ok(ALL_CONFIGS.affectionBands.promptSupplementTemplate.includes('任何好感帶都不貶低'), '好感帶補充保留不貶低');
});

test('P0-04: 三階段區塊含【階段：…】標頭＋不代寫條款＋危機條款（附錄 C.2–C.4）', () => {
  const st = ALL_CONFIGS.stages.stages;
  for (const k of ['A', 'B', 'C']) {
    const b = st[k].promptBlock;
    assert.ok(b.startsWith('【階段：'), `階段 ${k} 有【階段：…】標頭`);
    assert.ok(b.includes('不替玩家寫台詞或動作'), `階段 ${k} 含不代寫條款`);
    assert.ok(b.includes('出現真實痛苦或危機'), `階段 ${k} 含危機條款`);
    assert.ok(b.includes('每次只回 JSON'), `階段 ${k} 含 JSON 協議`);
  }
});

test('P0-04: 好感帶補充模板對齊附錄 C.5（四帶全列＋{bandName} 代入現值；D13 尾段修訂）', () => {
  const tpl = ALL_CONFIGS.affectionBands.promptSupplementTemplate;
  for (const line of [
    '甜：先行動、後嘴硬，句尾放軟。',
    '平穩：日常語氣，嘴硬約四成。',
    '小彆扭：短句、少話，不說氣話、不冷戰；用在意代替責備，給對方解釋的機會。',
    '待和好：主動說出在意什麼；對方真誠道歉就接受，嘴硬一秒再軟下來。',
    '任何好感帶都不貶低；對方出現真實痛苦或危機時，放下傲嬌。',
  ]) {
    assert.ok(tpl.includes(line), `模板含「${line.slice(0, 7)}…」`);
  }
  assert.ok(tpl.includes('{bandName}'), '保留 {bandName} 佔位');
  assert.ok(!tpl.includes('{guideline}'), '不再使用單行 {guideline}');
});

test('P0-04: 生活層模板對齊附錄 C.6（action 選填；D13退場愧疚禁令）', () => {
  const tpl = ALL_CONFIGS.schedule.promptLivingSectionTemplate;
  assert.ok(tpl.includes('並從動作庫挑選；action 欄位選填'), '補上 action 欄位選填');
  assert.ok(tpl.includes('久未上線只用語氣表達。'), '久未上線條款保留語氣表達');
  assert.ok(!tpl.includes('愧疚'), '生活層模板不再含愧疚禁令');
  assert.ok(!tpl.includes('絕不說'), '去掉「絕不」禁令');
  assert.ok(tpl.includes('不演出更衣、沐浴'), '更衣沐浴禁令保留（硬性規則）');
  assert.ok(tpl.includes('誠實回答'), '認真問 AI 誠實回答（硬性規則）');
});

test('P0-04/D13: life-simulator 離線問候不再過濾愧疚字眼', () => {
  for (const stage of ['A', 'B', 'C']) {
    const g = new LifeSimulator().generateOfflineGreeting(8, stage);
    assert.ok(typeof g === 'string' && g.length > 5, `${stage} 問候生成正常`);
  }
});

test('P0-04: 抽樣 10 則離線渲染檢核（階段標頭／帶值／協議／禁詞）', () => {
  const LIFE = String(ALL_CONFIGS.schedule.promptLivingSectionTemplate)
    .replace('{periodName}', '夜晚')
    .replace('{location}', '書桌、床')
    .replace('{activity}', '寫手記')
    .replace('{energy}', '55')
    .replace('{focus}', '低')
    .replace('{recentLogs}', '（本時段暫無）');
  const MEM = '- 玩家喜歡伯爵紅茶；約定下週末一起讀書。';

  const cases = [
    { n: 1, state: { stage: 'A', playerName: '艾倫' } },
    { n: 2, state: { stage: 'A', playerName: '艾倫' }, life: LIFE },
    { n: 3, state: { stage: 'A', playerName: '艾倫' }, life: LIFE, memory: MEM },
    { n: 4, state: { stage: 'A', playerName: '艾倫' }, memory: MEM },
    { n: 5, state: { stage: 'B', playerName: '艾倫' } },
    { n: 6, state: { stage: 'B', playerName: '艾倫' }, memory: MEM },
    { n: 7, state: { stage: 'B', playerName: '艾倫' }, life: LIFE },
    { n: 8, state: { stage: 'C', band: 'sweet', playerName: '艾倫', playerNickname: '倫' }, life: LIFE, memory: MEM },
    { n: 9, state: { stage: 'C', band: 'awkward', playerName: '艾倫', playerNickname: '倫' } },
    { n: 10, state: { stage: 'C', band: 'reconciliation', playerName: '艾倫', playerNickname: '倫' }, life: LIFE },
  ];
  const HEADERS = { A: '【階段：嘴硬期】', B: '【階段：曖昧期】', C: '【階段：告白後】' };

  for (const c of cases) {
    const prompt = PromptAssembler.assemblePrompt({
      state: c.state,
      livingSection: c.life || '',
      memorySection: c.memory || '',
      recentHistory: []
    });
    assert.ok(prompt.includes(HEADERS[c.state.stage]), `案例${c.n} 顯示 ${HEADERS[c.state.stage]}`);
    assert.ok(prompt.includes('【回覆限制與格式協議】'), `案例${c.n} 含格式協議`);
    assert.ok(prompt.includes('不替玩家寫台詞或動作'), `案例${c.n} 含不代寫條款`);
    assert.ok(!prompt.includes('不說占有') && !prompt.includes('勒索愧疚'), `案例${c.n} D13 禁令已退場`);
    if (c.state.stage === 'C') {
      assert.ok(prompt.includes(`【好感帶補充】好感帶=${BAND_NAMES[c.state.band]}`), `案例${c.n} 帶值＝${c.state.band}`);
      assert.ok(prompt.includes('任何好感帶都不貶低'), `案例${c.n} 保留不貶低`);
    } else {
      assert.ok(!prompt.includes('【好感帶補充】'), `案例${c.n} 非C不注入帶補充`);
    }
    if (c.memory) assert.ok(prompt.includes('【長期記憶】'), `案例${c.n} 含記憶區塊`);
    const s = stripNegations(prompt);
    for (const w of ['眼鏡', '義大利麵', '再看一頁']) {
      assert.ok(!s.includes(w), `案例${c.n} 禁詞「${w}」歸零`);
    }
  }
});
