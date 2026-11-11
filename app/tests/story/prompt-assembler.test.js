import test from 'node:test';
import assert from 'node:assert/strict';
import { PromptAssembler } from '../../www/prompt-assembler.js';

test('S2: 提示詞組裝器由上到下依序組裝且人設無眼鏡、無義大利麵', () => {
  const promptA = PromptAssembler.assemblePrompt({
    state: { stage: 'A', playerName: '艾倫' },
    livingSection: '【生活層】目前時段：清晨（窗前，正在整理髮尾泡紅茶）。',
    memorySection: '- 喜好：喜歡大吉嶺紅茶',
    styleTweaks: { tsundereLevel: 'high', actionLevel: 'normal', lengthLevel: 'normal' }
  });

  assert.ok(promptA.includes('克勞德'), '包含角色名');
  assert.ok(promptA.includes('【階段：嘴硬期】'), '包含嘴硬期區塊');
  assert.ok(promptA.includes('【生活層】'), '包含生活層區塊');
  assert.ok(promptA.includes('【長期記憶】'), '包含記憶區塊');
  assert.ok(promptA.includes('不採用眼鏡'), '人設落實不戴眼鏡');
  assert.ok(promptA.includes('不採用義大利麵'), '人設落實不採用義大利麵');

  // C 階段好感帶注入檢查
  const promptC = PromptAssembler.assemblePrompt({
    state: { stage: 'C', band: 'sweet', playerName: '艾倫', playerNickname: '倫' }
  });
  assert.ok(promptC.includes('【階段：告白後】'), '包含告白後區塊');
  assert.ok(promptC.includes('【好感帶補充】'), '包含好感帶補充');
  assert.ok(promptC.includes('先行動、後嘴硬'), '包含甜帶語氣指南');
});

test('S2 驗收：連續 30 輪回覆解析無格式錯誤，數值 clamp 正確', () => {
  for (let i = 0; i < 30; i++) {
    // 模擬各種邊界輸入（含代碼塊、帶引號、delta 超出範圍、動作大小寫）
    const deltaProposal = i % 2 === 0 ? 5 : -4;
    const fakeRaw = `\`\`\`json
    {
      "text": "這是第 ${i} 回合的對白測試「名門不出半成品。」",
      "emotion": "${i % 3 === 0 ? 'SHY' : 'NEUTRAL'}",
      "action": "${i % 4 === 0 ? 'SIP_TEA' : 'turn_page'}",
      "affection_delta": ${deltaProposal},
      "flag": ${i === 10 ? '"moon_bird"' : 'null'}
    }
    \`\`\``;

    const res = PromptAssembler.parseAndValidate(fakeRaw);
    assert.equal(res.success, true, `第 ${i} 輪解析必須成功`);
    assert.ok(res.data.text.includes(`第 ${i} 回合`));
    assert.ok(res.data.affection_delta >= -3 && res.data.affection_delta <= 3, 'delta 必須被 clamp 在 [-3, 3]');
    assert.ok(['neutral', 'shy'].includes(res.data.emotion), 'emotion 必須在白名單小寫');
    assert.ok(['sip_tea', 'turn_page'].includes(res.data.action), 'action 必須在白名單小寫');
  }
});

test('S2 驗收：故意破壞輸出仍可優雅兜底，不引發程式崩潰', () => {
  const brokenInputs = [
    '',
    'not a json at all',
    '{ "text": "", "emotion": "unknown" }', // 空 text
    '{ "unclosed": json ',
    null,
    undefined
  ];

  for (const broken of brokenInputs) {
    const res = PromptAssembler.parseAndValidate(broken);
    assert.equal(res.success, false, '壞資料應報告失敗');

    // 觸發兜底產生器
    const fallback = PromptAssembler.getFallbackReply('A', 'general');
    assert.equal(fallback.isFallback, true);
    assert.ok(fallback.text.length > 5, '兜底台詞必須非空且具備角色感');
    assert.equal(fallback.affection_delta, 0);
  }
});

