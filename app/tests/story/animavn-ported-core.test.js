import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ThinkTagSplitter,
  holdPartial,
  splitThinkingText,
  openaiThinkingParams,
  anthropicThinkingParams
} from '../../www/thinking-splitter.js';
import { parseLooseJson } from '../../www/json-repair.js';
import {
  AudioBus,
  CHANNELS,
  DEFAULT_DUCK_LEVEL,
  nextDuck,
  duckRamp
} from '../../www/audio-bus.js';
import {
  TYPE_SOUNDS,
  loadTypeSoundPreference,
  saveTypeSoundPreference,
  playTypeSound
} from '../../www/type-sound.js';
import {
  WORLD_BOOK_SELECTIVE_LOGIC,
  parseRegexFromString,
  matchWorldBookDetailed,
  worldBookPromptLines
} from '../../www/world-book.js';

test('AnimaVN ThinkTagSplitter: 串流碎片邊界、未閉合思考與字面標籤保護', () => {
  assert.deepEqual(holdPartial('hello <thi', ['<think>']), ['hello ', '<thi']);
  assert.deepEqual(holdPartial('normal text', ['<think>']), ['normal text', '']);

  // 串流把 <think> 與 </think> 切碎跨段送入
  const sp = new ThinkTagSplitter();
  const chunks = ['  <th', 'ink>分析劇情中 {假的JSON}</th', 'ink>\n{"narration":"正式回覆"}'];
  let body = '';
  let reasoning = '';
  for (const c of chunks) {
    const out = sp.feed(c);
    body += out.body;
    reasoning += out.reasoning;
  }
  const end = sp.flush();
  body += end.body;
  reasoning += end.reasoning;
  assert.equal(sp.used, true);
  assert.equal(reasoning, '分析劇情中 {假的JSON}');
  assert.equal(body, '{"narration":"正式回覆"}');

  // 正文先出現後的字面 <think> 不會被吞掉
  const literal = splitThinkingText('她笑著提到 <think> 標籤。');
  assert.equal(literal.hasThinking, false);
  assert.equal(literal.body, '她笑著提到 <think> 標籤。');

  // 未閉合 <thinking> 安全歸入 reasoning
  const unclosed = splitThinkingText('<thinking>思考到一半中斷');
  assert.equal(unclosed.hasThinking, true);
  assert.equal(unclosed.body, '');
  assert.equal(unclosed.reasoning, '思考到一半中斷');

  // 思考深度參數轉譯
  assert.deepEqual(openaiThinkingParams('off'), { extra_body: { thinking: { type: 'disabled' } } });
  assert.deepEqual(openaiThinkingParams('high'), { reasoning_effort: 'high' });
  assert.deepEqual(anthropicThinkingParams('low'), { extra_body: { output_config: { effort: 'low' } } });
});

test('AnimaVN ThinkTagSplitter × json-repair: 自動剝離思考塊內干擾大括號後成功解析 JSON', () => {
  const raw = `<think>
我要輸出一個物件，例如 {bad: json}，提醒自己 choices 要給 7 個。
</think>
\`\`\`json
{"narration":"夜晚的書庫安靜下來。","affectionDelta":1,"choices":["一","二","三","四","五","六","七"],"memory":"夜讀"}
\`\`\``;
  const parsed = parseLooseJson(raw);
  assert.equal(parsed.narration, '夜晚的書庫安靜下來。');
  assert.equal(parsed.choices.length, 7);
});

test('AnimaVN AudioBus & TypeSound: 四聲道 Ducking 狀態機、切背景掛起與跳字音合成', () => {
  assert.deepEqual(CHANNELS, ['bgm', 'voice', 'fx', 'type']);
  const d0 = new Map();
  const d1 = nextDuck(d0, 'voice', true);
  assert.equal(d1.get('bgm')?.has('voice'), true);
  assert.equal(duckRamp(d1, 'bgm', DEFAULT_DUCK_LEVEL).target, DEFAULT_DUCK_LEVEL);
  const d2 = nextDuck(d1, 'voice', false);
  assert.equal(d2.has('bgm'), false);
  assert.equal(duckRamp(d2, 'bgm', DEFAULT_DUCK_LEVEL).target, 1);

  // 模擬 AudioContext 與 Document 測試切背景自動掛起與合成音效
  let suspended = 0;
  let resumed = 0;
  let oscStarted = 0;
  let hidden = false;
  let visCb = null;
  const fakeGain = () => ({
    gain: { value: 1, setTargetAtTime() {}, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
    connect() {}
  });
  const fakeCtx = {
    state: 'running',
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    createGain: fakeGain,
    createOscillator: () => ({ type: 'sine', frequency: { setValueAtTime() {} }, connect() {}, start() { oscStarted += 1; }, stop() {} }),
    createBuffer: () => ({ getChannelData: () => new Float32Array(600) }),
    createBufferSource: () => ({ buffer: null, connect() {}, start() { oscStarted += 1; } }),
    createBiquadFilter: () => ({ type: 'highpass', frequency: { value: 0 }, connect() {} }),
    suspend: async () => { suspended += 1; fakeCtx.state = 'suspended'; },
    resume: async () => { resumed += 1; fakeCtx.state = 'running'; }
  };
  const bus = new AudioBus({
    createContext: () => fakeCtx,
    document: { get hidden() { return hidden; }, addEventListener: (_, fn) => { visCb = fn; } }
  });
  bus.unlock();
  bus.setActive(true);
  assert.equal(playTypeSound('soft', 0.4, bus), true);
  assert.equal(oscStarted, 1);
  assert.equal(playTypeSound('off', 0.4, bus), false);

  hidden = true;
  visCb();
  assert.equal(suspended, 1, '切到背景應掛起 AudioContext');
  assert.equal(bus.mayWake(fakeCtx), false, '背景不得喚醒音效');
  hidden = false;
  visCb();
  assert.equal(resumed, 1, '回到前景應恢復 AudioContext');

  // 偏好持久化
  const store = new Map();
  const fakeStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(loadTypeSoundPreference(fakeStorage).id, 'off');
  saveTypeSoundPreference({ id: 'click', volume: 0.5 }, fakeStorage);
  assert.deepEqual(loadTypeSoundPreference(fakeStorage), { id: 'click', volume: 0.5 });
  assert.ok(TYPE_SOUNDS.some(s => s.id === 'soft'));
});

test('AnimaVN WorldInfo 進階規則: 正則關鍵詞、選擇性副鍵四邏輯與遞迴掃描', () => {
  assert.ok(parseRegexFromString('/雨夜|暴雨/i') instanceof RegExp);
  assert.equal(parseRegexFromString('一般文字'), null);
  assert.equal(parseRegexFromString('/[invalid/'), null);

  const book = {
    enabled: true,
    recursive: true,
    maxRecursionSteps: 3,
    entries: [
      {
        id: 'rain',
        enabled: true,
        keywords: ['/雨夜|細雨/i'],
        text: '雨夜時閱覽室會點起黃銅燭台，並開啟禁書密室的暗鎖。',
        priority: 'high'
      },
      {
        id: 'vault',
        enabled: true,
        keywords: ['禁書密室'],
        text: '禁書密室中收藏著初代館長的手稿。',
        priority: 'normal'
      },
      {
        id: 'tea-only-day',
        enabled: true,
        keywords: ['紅茶'],
        secondaryKeys: ['夜晚'],
        selectiveLogic: WORLD_BOOK_SELECTIVE_LOGIC.NOT_ANY,
        text: '白日限定大吉嶺紅茶規則。',
        priority: 'normal'
      }
    ]
  };

  // 正則命中 rain → 遞迴命中 vault；因出現「夜晚」且 NOT_ANY，tea-only-day 不應觸發
  const hits = matchWorldBookDetailed(book, '今夜細雨綿綿，在夜晚泡一壺紅茶。');
  const ids = hits.map(h => h.entry.id);
  assert.deepEqual(ids, ['rain', 'vault']);
  assert.equal(hits.find(h => h.entry.id === 'vault')?.reason, 'recursive');

  const lines = worldBookPromptLines(book, '午後陽光照耀，來杯紅茶吧。', 'zh');
  assert.ok(lines.some(l => l.includes('白日限定大吉嶺紅茶規則')));
});
