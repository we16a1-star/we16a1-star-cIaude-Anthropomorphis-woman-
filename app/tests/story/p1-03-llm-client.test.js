import test from 'node:test';
import assert from 'node:assert/strict';
import { PromptAssembler } from '../../www/prompt-assembler.js';
import {
  DEFAULT_MAX_RETRIES,
  SYSTEM_BLOCK_KEYS,
  USER_BLOCK_KEYS,
  buildPromptPayload,
  buildRepairInstruction,
  callStructuredTurn
} from '../../www/llm-client.js';

function validReply(round = 1, extra = {}) {
  return JSON.stringify({
    text: `第 ${round} 回合的台詞。`,
    emotion: 'warm',
    action: 'sip_tea',
    affection_delta: 1,
    flag: null,
    ...extra
  });
}

test('P1-03 案1：快取友善切分——system＝固定區塊、user＝動態區塊、prompt 與原組裝逐字等價', () => {
  const cases = [
    { state: { stage: 'A', playerName: '艾倫' }, livingSection: '', memorySection: '' },
    { state: { stage: 'B', playerName: '艾倫', playerNickname: '倫' }, livingSection: '【生活層】現在是早上。', memorySection: '- 喜歡大吉嶺紅茶' },
    { state: { stage: 'C', band: 'sweet', playerName: '艾倫' }, livingSection: '【生活層】晚上。', memorySection: '- 約定看流星' }
  ];
  for (const input of cases) {
    const payload = buildPromptPayload(input);
    assert.deepEqual(payload.blocks.map(block => block.key), ['character', 'stage', 'band', 'living', 'memory', 'status']);
    assert.equal(payload.prompt, PromptAssembler.assemblePrompt(input), 'prompt＝完整組裝（逐字等價）');
    assert.ok(payload.system.startsWith(payload.blocks[0].text), 'system 以人設開頭（固定區塊前段）');
    assert.ok(payload.system.includes('【階段：'), 'system 含階段');
    assert.ok(payload.system.includes('【回覆限制與格式協議】'), 'system 含狀態／輸出協議');
    assert.ok(!payload.system.includes('【長期記憶】'), '記憶不進固定前綴');
    assert.equal(USER_BLOCK_KEYS.join(','), 'living,memory');
    assert.equal(SYSTEM_BLOCK_KEYS.join(','), 'character,stage,band,status');
    if (input.memorySection) assert.ok(payload.user.includes('【長期記憶】'));
    if (input.livingSection) assert.ok(payload.user.includes('【生活層】'));
  }
  const c = buildPromptPayload({ state: { stage: 'C', band: 'sweet' } });
  assert.ok(c.system.includes('【好感帶補充】'), 'C 階段好感帶進固定前綴');
  const a = buildPromptPayload({ state: { stage: 'A' } });
  assert.ok(!a.system.includes('【好感帶補充】'));
});

test('P1-03 案2：連續 30 輪格式穩定（含 markdown 圍欄），每輪第 1 次即成功', async () => {
  let calls = 0;
  const send = ({ attempt }) => {
    calls++;
    const body = validReply(calls, { affection_delta: calls % 3 === 0 ? -1 : 1 });
    // 每 3 輪模擬官網把 JSON 包成 markdown 代碼塊
    return calls % 3 === 0 ? '```json\n' + body + '\n```' : body;
  };
  for (let round = 1; round <= 30; round++) {
    const result = await callStructuredTurn({
      state: { stage: round <= 10 ? 'A' : (round <= 20 ? 'B' : 'C'), band: 'sweet', playerName: '艾倫' },
      memorySection: `- 第 ${round} 輪記憶`,
      send
    });
    assert.equal(result.meta.usedFallback, false, `第 ${round} 輪不應兜底`);
    assert.equal(result.meta.attempts, 1, `第 ${round} 輪一次成功`);
    assert.equal(result.data.text, `第 ${round} 回合的台詞。`);
    assert.equal(result.data.emotion, 'warm');
    assert.equal(result.data.action, 'sip_tea');
  }
  assert.equal(calls, 30);
});

test('P1-03 案3：格式不合重試 1–2 次；重試帶格式修正指示，成功後不兜底', async () => {
  const seen = [];
  const send = ({ attempt, repair, user, prompt, system }) => {
    seen.push({ attempt, repair, user, prompt, system });
    if (attempt === 1) return '不是 JSON';
    if (attempt === 2) return JSON.stringify({ text: '' });
    return validReply(3);
  };
  const result = await callStructuredTurn({ state: { stage: 'B' }, memorySection: '- 記得紅茶', send });
  assert.equal(result.meta.usedFallback, false);
  assert.equal(result.meta.attempts, 3);
  assert.equal(result.meta.errors.length, 2);
  assert.equal(seen[0].repair, '', '第一次不帶修正指示');
  assert.match(seen[1].repair, /格式修正/);
  assert.match(seen[1].repair, /text 必須是非空字串/);
  assert.match(seen[1].user, /【格式修正】/);
  assert.match(seen[2].user, /【格式修正】/);
  assert.equal(seen[1].system, seen[0].system, '重試不變動固定前綴（利快取）');
});

test('P1-03 案4：重試用盡→預設台詞兜底；affection_delta=0、isFallback、不丟例外', async () => {
  let calls = 0;
  const send = () => { calls++; return '{"text": ""}'; };
  const result = await callStructuredTurn({ state: { stage: 'B', playerName: '艾倫' }, send, situation: 'praised' });
  assert.equal(calls, 1 + DEFAULT_MAX_RETRIES);
  assert.equal(result.meta.usedFallback, true);
  assert.equal(result.meta.attempts, 3);
  assert.equal(result.meta.errors.length, 3);
  assert.equal(result.data.isFallback, true);
  assert.equal(result.data.affection_delta, 0);
  assert.equal(result.data.emotion, 'neutral');
  assert.equal(result.data.text, PromptAssembler.getFallbackReply('B', 'praised').text);
});

test('P1-03 案5：傳輸丟錯也重試，用盡後兜底；maxRetries 可調 0–2', async () => {
  let calls = 0;
  const thrower = () => { calls++; throw new Error('network down'); };
  const r2 = await callStructuredTurn({ state: { stage: 'A' }, send: thrower });
  assert.equal(calls, 3);
  assert.equal(r2.meta.usedFallback, true);
  assert.equal(r2.meta.errors.length, 3);
  assert.match(r2.meta.errors[0], /network down/);

  calls = 0;
  const r0 = await callStructuredTurn({ state: { stage: 'A' }, send: thrower, maxRetries: 0 });
  assert.equal(calls, 1);
  assert.equal(r0.meta.attempts, 1);
  assert.equal(r0.meta.usedFallback, true);

  calls = 0;
  const r1 = await callStructuredTurn({ state: { stage: 'A' }, send: thrower, maxRetries: 1 });
  assert.equal(calls, 2);
  assert.equal(r1.meta.attempts, 2);
});

test('P1-03 案6：欄位級降級不重試（emotion／action／delta／flag），支援物件回傳', async () => {
  let calls = 0;
  const send = () => {
    calls++;
    return {
      text: JSON.stringify({ text: '  你好  ', emotion: 'HAPPY', action: 'dance', affection_delta: 99, flag: ' event ' })
    };
  };
  const result = await callStructuredTurn({ state: { stage: 'A' }, send });
  assert.equal(calls, 1, '欄位級問題不觸發整則重試');
  assert.equal(result.meta.usedFallback, false);
  assert.equal(result.data.text, '你好');
  assert.equal(result.data.emotion, 'neutral', '白名單外情緒回退 neutral');
  assert.equal(result.data.action, null, '白名單外動作丟棄');
  assert.equal(result.data.affection_delta, 3, 'delta clamp 至 config 上限');
  assert.equal(result.data.flag, 'event');
});

test('P1-03 案7：無傳輸／空回覆→兜底；情境台詞占位符代入暱稱', async () => {
  const noSend = await callStructuredTurn({ state: { stage: 'C', playerName: '艾倫', playerNickname: '倫' } });
  assert.equal(noSend.meta.usedFallback, true);
  assert.equal(noSend.meta.attempts, 3);
  assert.match(noSend.meta.errors[0], /傳輸函式/);

  const goodnight = await callStructuredTurn({
    state: { stage: 'C', playerName: '艾倫', playerNickname: '倫' },
    send: () => '',
    situation: 'goodnight'
  });
  assert.equal(goodnight.data.isFallback, true);
  assert.ok(goodnight.data.text.includes('倫'));
  assert.ok(!goodnight.data.text.includes('{暱稱}'));

  const noPayload = await callStructuredTurn({ state: null, send: () => validReply() });
  assert.equal(noPayload.meta.usedFallback, false, 'state 缺省仍可組裝');
  assert.equal(noPayload.meta.stage, 'A');
});

test('P1-03 案8：修正指示長度截斷且單行化', () => {
  const long = buildRepairInstruction('壞'.repeat(500) + '\n第二行');
  assert.ok(long.length < 300);
  assert.ok(!long.includes('\n'));
  assert.match(long, /格式修正/);
});
