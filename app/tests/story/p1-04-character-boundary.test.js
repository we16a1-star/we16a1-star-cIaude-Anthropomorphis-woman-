import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  CHARACTER_BOUNDARY_SECTION,
  DEFAULT_CHARACTER_PROFILE,
  COMPACT_DEFAULT_CHARACTER_PROFILE,
  HIGH_TSUNDERE_CHARACTER_PROFILE,
  COMPACT_HIGH_TSUNDERE_CHARACTER_PROFILE,
  withCharacterBoundary
} from '../../www/character-profile.js';
import { PromptAssembler } from '../../www/prompt-assembler.js';
import { ALL_CONFIGS } from '../../www/config-loader.js';
import { craftRules } from '../../www/prompt-rules.js';

const here = dirname(fileURLToPath(import.meta.url));
const readWww = f => readFileSync(join(here, '..', '..', 'www', f), 'utf8');
const HEADING = '【界線｜優先於人設】';
const count = (text, needle) => String(text).split(needle).length - 1;

test('P1-04 案1：界線常數與高傲嬌版【界線｜優先於人設】逐字相同、只一份', () => {
  const hi = HIGH_TSUNDERE_CHARACTER_PROFILE;
  const start = hi.indexOf(HEADING);
  const end = hi.indexOf('\n\n【範例語氣】', start);
  assert.ok(start >= 0 && end > start, '高傲嬌版含完整界線段落');
  assert.equal(CHARACTER_BOUNDARY_SECTION, hi.slice(start, end), '常數逐字相同');
  assert.equal(count(hi, HEADING), 1, '高傲嬌版只出現一次');
  for (const phrase of [
    '不能變成貶低、羞辱、冷暴力、情感操控或強迫',
    '「笨蛋」不可針對外貌、能力或人格',
    '立即放下傲嬌',
    '使用者有最後決定權'
  ]) {
    assert.ok(CHARACTER_BOUNDARY_SECTION.includes(phrase), `界線含「${phrase}」`);
  }
  assert.ok(!DEFAULT_CHARACTER_PROFILE.includes(HEADING), 'DEFAULT 未含完整段落（由程式附加）');
  assert.ok(!COMPACT_DEFAULT_CHARACTER_PROFILE.includes(HEADING), '精簡 DEFAULT 未含完整段落');
  assert.ok(!COMPACT_HIGH_TSUNDERE_CHARACTER_PROFILE.includes(HEADING), '精簡高傲嬌未含完整段落');
});

test('P1-04 案2：withCharacterBoundary 冪等、空值、自訂人設保留', () => {
  assert.equal(withCharacterBoundary(''), CHARACTER_BOUNDARY_SECTION);
  assert.equal(withCharacterBoundary(null), CHARACTER_BOUNDARY_SECTION);
  assert.equal(withCharacterBoundary('   '), CHARACTER_BOUNDARY_SECTION);

  const once = withCharacterBoundary(DEFAULT_CHARACTER_PROFILE);
  assert.ok(once.startsWith(DEFAULT_CHARACTER_PROFILE.trim()), '保留原人設文字');
  assert.equal(count(once, HEADING), 1, '只附加一次');
  assert.ok(once.endsWith(CHARACTER_BOUNDARY_SECTION), '界線位於人設末尾');
  assert.equal(withCharacterBoundary(once), once, '重複呼叫不重複附加');
  assert.equal(withCharacterBoundary(HIGH_TSUNDERE_CHARACTER_PROFILE), HIGH_TSUNDERE_CHARACTER_PROFILE, '已含完整段落時原樣回傳');

  const custom = '自訂人設：喜歡紅茶。';
  assert.equal(withCharacterBoundary(custom), custom + '\n\n' + CHARACTER_BOUNDARY_SECTION, '自訂人設附加界線');
  assert.ok(withCharacterBoundary('已有【界線｜優先於人設】\n自訂界線').endsWith('自訂界線'), '已有標題不再附加');
});

test('P1-04 案3：PromptAssembler 人設區塊含界線一次，六區塊鍵序不變', () => {
  const blocks = PromptAssembler.assemblePromptBlocks({ state: { stage: 'B', playerName: '艾倫' } });
  assert.deepEqual(blocks.map(b => b.key), ['character', 'stage', 'band', 'living', 'memory', 'status'], '六區塊順序固定');

  const character = blocks.find(b => b.key === 'character');
  assert.equal(character.text, withCharacterBoundary(ALL_CONFIGS.character.basePrompt), '人設＝basePrompt＋界線');
  assert.equal(count(character.text, HEADING), 1, '人設區塊只一份界線');
  assert.ok(character.source.includes('界線'), '來源標註界線');

  const prompt = PromptAssembler.assemblePrompt({
    state: { stage: 'B', playerName: '艾倫' },
    memorySection: '- 喜歡紅茶'
  });
  assert.equal(count(prompt, HEADING), 1, '完整提示詞只一份界線');
  assert.ok(prompt.includes(CHARACTER_BOUNDARY_SECTION), '完整提示詞含界線原文');
});

test('P1-04 案4：app.js 的網頁提示詞與 API apiProfile 都接上界線，且開關無法關閉', () => {
  const src = readWww('app.js');
  assert.ok(src.includes('import { withCharacterBoundary'), 'app.js 匯入 helper');

  const build = src.slice(src.indexOf('function buildWebPrompt('), src.indexOf('function makeWebRepairPrompt('));
  assert.ok(build.includes('const profileBase='), '網頁提示詞先組人設基底');
  assert.ok(build.includes('withCharacterBoundary(profileBase)'), 'buildWebPrompt 強制附加界線');

  const call = src.slice(src.indexOf('async function callAI('), src.indexOf('function sanitizeChoices('));
  assert.ok(call.includes('const apiProfileBase='), 'API 先組人設基底');
  assert.ok(call.includes('withCharacterBoundary(apiProfileBase)'), 'callAI apiProfile 強制附加界線');
  assert.ok(call.includes('COMPACT_DEFAULT_CHARACTER_PROMPT'), '預設 API 仍送精簡人設（不再依賴 server 空值補預設）');

  const rules = readWww('prompt-rules.js');
  const keys = rules.match(/export const PROMPT_TWEAK_KEYS = \[([^\]]*)\]/);
  assert.ok(keys, '找到提示詞開關清單');
  assert.ok(!keys[1].includes('boundary') && !keys[1].includes('界線'), '開關清單不含界線');
});

test('P1-04 案5：英文 tone 對齊 D13（舊占有／愧疚禁令退場，玩家有最後決定權）', () => {
  const en = craftRules('en');
  assert.ok(!en.tone.includes('never use possessiveness, guilt, or emotional pressure'), '舊英文禁令已退場');
  assert.ok(en.tone.includes('never belittle, humiliate'), '保留不貶低／不羞辱');
  assert.ok(en.tone.includes('player always has the final say'), '玩家有最後決定權');
  assert.ok(craftRules('zh').tone.includes('不貶低、不羞辱、不冷暴力'), '中文 tone 保留 D13 三項');
});
