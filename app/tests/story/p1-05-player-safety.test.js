import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import {
  SafetyModule,
  withSafetyPromptSupport,
  SAFETY_PROMPT_HEADING,
  SAFETY_PROMPT_HEADING_EN,
  LOW_MOOD_PROMPT_HEADING,
  LOW_MOOD_PROMPT_HEADING_EN
} from '../../www/safety-module.js';
import { ALL_CONFIGS, validateConfigs } from '../../www/config-loader.js';
import { withCharacterBoundary } from '../../www/character-profile.js';

const here = dirname(fileURLToPath(import.meta.url));
const readWww = f => readFileSync(join(here, '..', '..', 'www', f), 'utf8');
const count = (text, needle) => String(text).split(needle).length - 1;
const safety = new SafetyModule();

test('P1-05 案1：crisis.json 新欄位齊全，config schema 通過且要求低落詞與三支熱線', () => {
  const crisis = ALL_CONFIGS.crisis;
  assert.ok(Array.isArray(crisis.lowMoodKeywords), 'lowMoodKeywords 是陣列');
  assert.ok(crisis.lowMoodKeywords.length >= 20, '低落詞至少 20 條');
  assert.ok(typeof crisis.safetyResponseTemplateEn === 'string' && crisis.safetyResponseTemplateEn.length > 50, '英文安全模板存在');
  assert.ok(['1925', '1995', '1980'].every(n => crisis.safetyResponseTemplateEn.includes(n)), '英文模板含三支熱線');
  assert.doesNotThrow(() => validateConfigs(), '15 檔 config 驗證通過');

  const schema = readWww('config-loader.js');
  assert.ok(schema.includes("'lowMoodKeywords'"), 'schema required 含 lowMoodKeywords');
  assert.ok(schema.includes("'safetyResponseTemplateEn'"), 'schema required 含英文模板');
  assert.ok(schema.includes("'supportHotlines.has1995'") && schema.includes("'supportHotlines.has1980'"), 'schema 檢查 1995／1980');
});

test('P1-05 案2：現有 14 個危機詞全部命中（含空白與標點正規化）', () => {
  const words = ALL_CONFIGS.crisis.crisisKeywords;
  assert.equal(words.length, 14, '危機詞維持 14 條');
  for (const word of words) {
    assert.equal(safety.detectCrisis(`我現在${word}`), true, `命中：${word}`);
  }
  assert.equal(safety.detectCrisis('我 想 死。'), true, '空白與句號不影響危機判定');
  assert.equal(safety.detectCrisis('不、不想活了！'), true, '頓號與驚嘆號不影響危機判定');
  assert.equal(safety.detectCrisis('這本書的結局很感人'), false, '一般劇情句不誤判');
});

test('P1-05 案3：低落詞逐條命中；中性與正面句不命中', () => {
  const words = ALL_CONFIGS.crisis.lowMoodKeywords;
  for (const word of words) {
    assert.equal(safety.detectLowMood(`我今天${word}`), true, `命中：${word}`);
  }
  for (const text of ['今天天氣很好', '我喜歡這本書', '謝謝你陪我', '我想喝茶', '故事很好看']) {
    assert.equal(safety.detectLowMood(text), false, `不誤判：${text}`);
  }
  assert.equal(safety.detectLowMood('我今天好累'), true, '常見低落句命中');
});

test('P1-05 案4：危機優先於低落；分類回傳三種結果', () => {
  assert.deepEqual(
    safety.classifyPlayerInput('我很難過，想死'),
    { kind: 'crisis', isCrisis: true, isLowMood: false },
    '同時命中時以危機為準'
  );
  assert.deepEqual(
    safety.classifyPlayerInput('我今天很難過'),
    { kind: 'lowMood', isCrisis: false, isLowMood: true },
    '只命中低落'
  );
  assert.deepEqual(
    safety.classifyPlayerInput('今天天氣很好'),
    { kind: 'none', isCrisis: false, isLowMood: false },
    '未命中'
  );
});

test('P1-05 案5：本機安全回應含三支熱線、好感 0，中英文都有', () => {
  const zh = safety.generateSafetyResponse('zh');
  assert.equal(zh.isCrisis, true);
  assert.equal(zh.affection_delta, 0, '危機時好感不增不減');
  assert.equal(zh.hotlines.length, 3);
  for (const number of ['1925', '1995', '1980']) assert.ok(zh.text.includes(number), `中文模板含 ${number}`);

  const en = safety.generateSafetyResponse('en');
  assert.equal(en.affection_delta, 0);
  for (const number of ['1925', '1995', '1980']) assert.ok(en.text.includes(number), `英文模板含 ${number}`);
  assert.notEqual(en.text, zh.text, '英文使用獨立模板');
  assert.match(en.text, /AI/, '英文模板誠實說明 AI 身分');
});

test('P1-05 案6：安全段可重複附加但不重複；低落段只在命中時加入', () => {
  const base = '角色：克勞德';
  const once = withSafetyPromptSupport(base);
  assert.ok(once.startsWith(base), '原有提示詞保留在最前面');
  assert.equal(count(once, SAFETY_PROMPT_HEADING), 1, '安全段只一份');
  assert.equal(withSafetyPromptSupport(once), once, '重複呼叫不變');
  assert.ok(!once.includes(LOW_MOOD_PROMPT_HEADING), '未命中低落時不加陪伴段');

  const low = withSafetyPromptSupport(base, { lowMood: true });
  assert.equal(count(low, SAFETY_PROMPT_HEADING), 1, '低落時安全段仍只一份');
  assert.equal(count(low, LOW_MOOD_PROMPT_HEADING), 1, '低落段只一份');
  assert.equal(withSafetyPromptSupport(low, { lowMood: true }), low, '低落段重複呼叫不變');
  assert.ok(low.includes('不說教') && low.includes('不比較') && low.includes('不否定'), '中文低落段含三項禁止');

  const en = withSafetyPromptSupport('Character: Claude', { lowMood: true, language: 'en' });
  assert.equal(count(en, SAFETY_PROMPT_HEADING_EN), 1, '英文安全段只一份');
  assert.equal(count(en, LOW_MOOD_PROMPT_HEADING_EN), 1, '英文低落段只一份');
  assert.ok(en.includes('Do not lecture') && en.includes('compare') && en.includes('invalidate'), '英文低落段含三項禁止');
});

test('P1-05 案7：常駐安全段要求 AI 自行轉接、危機好感 0、不假裝真人', () => {
  const zh = withSafetyPromptSupport('');
  assert.ok(zh.includes('自傷') && zh.includes('輕生'), '涵蓋自傷／輕生');
  assert.ok(zh.includes('1925') && zh.includes('1995') && zh.includes('1980'), '含三支熱線');
  assert.ok(zh.includes('affectionDelta 必須是 0'), '危機時好感必須 0');
  assert.ok(zh.includes('不要假裝是真人'), '危機時仍誠實說明 AI');
  assert.ok(zh.includes('不要替玩家決定行動或內心想法'), '不代寫玩家言行');

  const en = withSafetyPromptSupport('', { language: 'en' });
  assert.ok(en.includes('self-harm') && en.includes('suicide'), '英文涵蓋自傷／輕生');
  assert.ok(en.includes('affectionDelta must be 0'), '英文危機好感 0');
  assert.ok(en.includes('never pretend to be a human'), '英文仍誠實說明 AI');
});

test('P1-05 案8：安全段可接在角色界線之後，不覆蓋既有界線', () => {
  const composed = withSafetyPromptSupport(withCharacterBoundary('你是克勞德'), { lowMood: true });
  assert.ok(composed.includes('【界線｜優先於人設】'), '既有界線保留');
  assert.equal(count(composed, SAFETY_PROMPT_HEADING), 1, '安全段附加在後');
  assert.equal(count(composed, LOW_MOOD_PROMPT_HEADING), 1, '低落段附加在後');
});

test('P1-05 案9：低落詞不重複、不與危機詞完全相同', () => {
  const low = ALL_CONFIGS.crisis.lowMoodKeywords;
  assert.equal(new Set(low).size, low.length, '低落詞不得重複');
  const crisis = new Set(ALL_CONFIGS.crisis.crisisKeywords);
  assert.deepEqual(low.filter(word => crisis.has(word)), [], '低落詞不與危機詞完全相同');
  assert.ok(low.every(word => typeof word === 'string' && word.length >= 2), '每條低落詞至少兩字');
});

test('P1-05 案10：app.js 三個入口都接上危機攔截，兩條提示詞管線都接上安全段', () => {
  const src = readWww('app.js');
  assert.ok(src.includes("import { SafetyModule, withSafetyPromptSupport } from './safety-module.js'"), '匯入安全模組');
  assert.ok(src.includes('const safetyModule = new SafetyModule();'), '建立單一實例');

  const build = src.slice(src.indexOf('function buildWebPrompt('), src.indexOf('function makeWebRepairPrompt('));
  assert.ok(build.includes('safetyModule.detectLowMood(chosen)'), '網頁提示詞偵測玩家低落');
  assert.ok(build.includes('withSafetyPromptSupport(finalPrompt'), '網頁提示詞強制附加安全段');

  const call = src.slice(src.indexOf('async function callAI('), src.indexOf('function sanitizeChoices('));
  assert.ok(call.includes('safetyModule.detectLowMood(action)'), 'API 提示詞偵測玩家低落');
  assert.ok(call.includes('withSafetyPromptSupport(withCharacterBoundary(apiProfileBase)'), 'API apiProfile 強制附加安全段');

  const cont = src.slice(src.indexOf('async function continueStory'), src.indexOf('async function retryPendingWithMode'));
  assert.ok(cont.includes('safetyModule.detectCrisis(playerAction)'), 'continueStory 攔截危機');
  assert.ok(cont.includes('showCrisisSafetyResponse()'), 'continueStory 顯示本機安全回應');

  const begin = src.slice(src.indexOf('async function beginWebTurn'), src.indexOf('function stripJsonFences'));
  assert.ok(begin.includes('safetyModule.detectCrisis(crisisCandidate)'), 'beginWebTurn 再攔一次');
  assert.ok(begin.includes('showCrisisSafetyResponse()'), 'beginWebTurn 顯示本機安全回應');

  const prep = src.slice(src.indexOf('async function prepareWebPrompt'), src.indexOf('async function switchPendingWebProvider'));
  assert.ok(prep.includes('safetyModule.detectCrisis(expectedAction)'), 'prepareWebPrompt 第三層攔截');
  assert.ok(prep.includes('showCrisisSafetyResponse({defer:busy})'), 'prepareWebPrompt 顯示本機安全回應');
});

test('P1-05 案11：本機安全回應不呼叫 applyTurn、不寫玩家原句、不留下待辦回合', () => {
  const src = readWww('app.js');
  const fn = src.slice(src.indexOf('function showCrisisSafetyResponse'), src.indexOf('async function continueStory'));
  assert.ok(fn.includes("state.history.push({role:'ai',kind:'safety'"), '只寫一則安全回覆');
  assert.ok(!fn.includes("role:'user'"), '不保存玩家危機原句');
  assert.ok(!fn.includes('applyTurn('), '不套用回合，因此不動好感與時鐘');
  assert.ok(fn.includes("state.pendingAction=''"), '清除待辦回合');
  assert.ok(fn.includes('storyNoticeText='), '顯示暫停陪伴提示');
  assert.ok(fn.includes('if(save())writeAutoSave()'), '成功存檔後寫入自動存檔');
});

test('P1-05 案12：實際執行本機安全回應——只加一則 safety、清待辦、好感與選項不變', () => {
  const src = readWww('app.js');
  const fn = src.slice(src.indexOf('function showCrisisSafetyResponse'), src.indexOf('async function continueStory'));
  let saved = 0, autoSaved = 0, rendered = 0, scrolled = 0;
  const state = {
    pendingAction: '我想死',
    webReply: 'stale reply',
    lastAiError: 'stale error',
    history: [{ role: 'user', text: '先前的正常行動' }, { role: 'ai', text: '先前的正常回覆' }],
    affection: 42,
    choices: ['原本的選項一', '原本的選項二']
  };
  const context = {
    safetyModule: safety,
    uiLanguage: 'zh',
    state,
    storyNoticeText: '',
    busy: false,
    save: () => { saved++; return true; },
    writeAutoSave: () => { autoSaved++; },
    render: () => { rendered++; },
    scrollDialogueIntoView: () => { scrolled++; },
    setTimeout
  };
  vm.createContext(context);
  vm.runInContext(fn, context);
  context.showCrisisSafetyResponse();

  assert.equal(state.history.length, 3, '只新增一則，不寫玩家危機原句');
  const entry = state.history[2];
  assert.equal(entry.role, 'ai');
  assert.equal(entry.kind, 'safety');
  assert.ok(entry.text.includes('1925') && entry.text.includes('1995') && entry.text.includes('1980'), '安全回覆含三支熱線');
  assert.equal(state.pendingAction, '', '待辦回合已清除');
  assert.equal(state.webReply, '', '清除待用回覆');
  assert.equal(state.lastAiError, '', '清除舊錯誤');
  assert.equal(state.affection, 42, '好感不變');
  assert.deepEqual(state.choices, ['原本的選項一', '原本的選項二'], '選項不變');
  assert.ok(context.storyNoticeText.includes('已先暫停這一回合'), '顯示暫停提示');
  assert.equal(saved, 1, '有存檔');
  assert.equal(autoSaved, 1, '有寫自動存檔');
  assert.equal(rendered, 1, '有重繪');
  assert.equal(scrolled, 1, '有捲動到最新訊息');
});
