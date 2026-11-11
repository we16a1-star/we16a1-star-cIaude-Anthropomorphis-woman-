import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CONFIGS, loadConfigs } from '../../www/config-loader.js';
import { PromptAssembler } from '../../www/prompt-assembler.js';

const { replyProtocol: proto, actions: actionsConfig, emotions: emotionsConfig } = ALL_CONFIGS;

test('P0-05: reply_protocol.json 載入且五欄規則合同成立', () => {
  loadConfigs(); // schema 驗證通過（含 reply_protocol.json 條目）
  assert.equal(proto.fields.text.required, true, 'text 必填');
  assert.ok(proto.fields.emotion.whitelistSource.includes('emotions.json'), 'emotion 白名單來源＝emotions.json');
  assert.ok(proto.fields.action.whitelistSource.includes('actions.json'), 'action 白名單來源＝actions.json（附錄 B）');
  assert.equal(proto.fields.action.onInvalid, 'discard', '白名單外動作＝丟棄（T6）');
  assert.equal(proto.fields.action.maxPerReply, 1, 'S 簡化協議單值 action；1–3 個動作的 T6 擴充於 P1-02 落地');
  assert.equal(proto.fields.affection_delta.min, -3, 'delta 下限');
  assert.equal(proto.fields.affection_delta.max, 3, 'delta 上限');
  assert.ok(proto.fields.flag.rule.includes('最終裁定'), 'flag 僅為提議、遊戲程式最終裁定');
  assert.ok(proto.outputFormat.exampleJson.includes('"affection_delta"'), '示例 JSON 寫明五欄');
});

test('P0-05: 協議塊由 config 組裝——白名單展開、佔位符清零、delta 範圍文字正確', () => {
  const prompt = PromptAssembler.assemblePrompt({
    state: { stage: 'B', playerName: '艾倫' },
    styleTweaks: { tsundereLevel: 'high', actionLevel: 'high', lengthLevel: 'long' }
  });
  assert.ok(prompt.includes('【回覆限制與格式協議】'), '協議區塊存在');
  assert.ok(!prompt.includes('[['), '無殘留佔位符');
  for (const tag of actionsConfig.whitelist) {
    assert.ok(prompt.includes(tag), 'action 白名單 14 動作之一出現在協議塊: ' + tag);
  }
  assert.ok(prompt.includes(emotionsConfig.whitelist.join(', ')), 'emotion 白名單整串出現');
  assert.ok(prompt.includes('必須是 -3 到 3 的整數'), 'delta 範圍文字由 config 帶出');
  assert.ok(prompt.includes('嘴硬比例提高一成'), 'styleTweaks 高＝嘴硬提高一成（B 階段）');
  assert.ok(prompt.includes('每則回覆包含 2–3 個動作'), 'actionLevel 高＝2–3 個動作');
  assert.ok(prompt.includes('250–350 字'), 'lengthLevel 長＝250–350 字');
  assert.ok(prompt.includes('不含 markdown 代碼塊標記'), '輸出契約：禁止 markdown 圍欄');
  assert.ok(prompt.includes(proto.outputFormat.exampleJson), '示例 JSON 逐字來自 config');
});

test('P0-05/T6 三測例：缺欄位、錯誤標籤丟棄不重試、delta clamp', () => {
  // 測例 1：缺 action／flag（選填欄位缺失）→ 解析成功
  const okNo = PromptAssembler.parseAndValidate('{"text": "你有在看嗎？" }');
  assert.equal(okNo.success, true);
  assert.equal(okNo.data.action, null, '缺 action＝null');
  assert.equal(okNo.data.flag, null, '缺 flag＝null');

  // 測例 2：錯誤標籤 → action 丟棄為 null，整則不重試（success=true）
  const okBadTag = PromptAssembler.parseAndValidate('{"text": "不要一直戳我啦！", "action": "found_footage", "affection_delta": 0}');
  assert.equal(okBadTag.success, true, '欄位級問題不拖累整則');
  assert.equal(okBadTag.data.action, null, '白名單外動作被丟棄');

  // 測例 3：delta clamp（範圍值由 reply_protocol.json 帶出）
  const up = PromptAssembler.parseAndValidate('{"text": "哼，這次準了。", "affection_delta": 5}');
  assert.equal(up.data.affection_delta, proto.fields.affection_delta.max);
  const down = PromptAssembler.parseAndValidate('{"text": "隨便啦。", "affection_delta": -4}');
  assert.equal(down.data.affection_delta, proto.fields.affection_delta.min);

  // text 缺失＝整則無效（唯一整則級失敗條件；重試／兜底由呼叫層負責）
  const bad = PromptAssembler.parseAndValidate('{"emotion": "shy"}');
  assert.equal(bad.success, false, 'text 缺失＝整則回覆無效');
});
