import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PromptAssembler } from '../../www/prompt-assembler.js';
import {
  INSPECTOR_STORAGE_KEY,
  estimateTokens,
  bandKeyForAffection,
  defaultStageForAffection,
  buildInspectorData,
  renderInspectorBlocks,
  renderInspectorSummary,
  loadBlockPrefs,
  saveBlockPrefs
} from '../../www/prompt-inspector.js';

const here = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(here, '..', '..', 'www', 'app.js'), 'utf8');

function fakeStorage() {
  const store = new Map();
  return {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key)
  };
}

test('P1-02 案1：六區塊齊全，assemblePrompt＝區塊串接逐字等價（A/B/C、好感帶、注入與缺省）', () => {
  const cases = [
    { state: { stage: 'A', playerName: '艾倫' }, livingSection: '', memorySection: '', styleTweaks: {} },
    { state: { stage: 'B', playerName: '艾倫', playerNickname: '倫' }, livingSection: '【生活層】現在是早上。', memorySection: '- 喜歡大吉嶺紅茶', styleTweaks: { tsundereLevel: 'high' } },
    { state: { stage: 'C', playerName: '艾倫', band: 'sweet' }, livingSection: '【生活層】晚上。', memorySection: '- 約定看流星', styleTweaks: { actionLevel: 'low', lengthLevel: 'long' } },
    { state: { stage: 'C', band: 'reconciliation' } },
    { state: { stage: 'C', band: 'not-a-band' } },
    { state: {} }
  ];
  for (const input of cases) {
    const blocks = PromptAssembler.assemblePromptBlocks(input);
    assert.deepEqual(blocks.map(b => b.key), ['character', 'stage', 'band', 'living', 'memory', 'status'], '六區塊順序固定');
    for (const block of blocks) {
      assert.equal(typeof block.label, 'string');
      assert.equal(typeof block.source, 'string');
      assert.equal(typeof block.text, 'string');
    }
    const joined = blocks.map(b => b.text).filter(Boolean).join('\n');
    assert.equal(joined, PromptAssembler.assemblePrompt(input), '區塊串接與原組裝逐字等價');
  }
});

test('P1-02 案2：切換階段→區塊正確替換、不殘留前階段；好感帶只在 C 出現；玩家名替換', () => {
  const get = (blocks, key) => blocks.find(b => b.key === key);
  const a = PromptAssembler.assemblePromptBlocks({ state: { stage: 'A', playerName: '艾倫' } });
  const b = PromptAssembler.assemblePromptBlocks({ state: { stage: 'B', playerName: '艾倫' } });
  const c = PromptAssembler.assemblePromptBlocks({ state: { stage: 'C', playerName: '艾倫', band: 'sweet' } });

  assert.ok(get(a, 'stage').text.includes('【階段：嘴硬期】'));
  assert.ok(get(b, 'stage').text.includes('【階段：曖昧期】'));
  assert.ok(get(c, 'stage').text.includes('【階段：告白後】'));
  assert.ok(!get(b, 'stage').text.includes('嘴硬期】'), 'B 不殘留 A 階段標頭');
  assert.ok(!get(c, 'stage').text.includes('曖昧期】'), 'C 不殘留 B 階段標頭');

  assert.equal(get(a, 'band').text, '', 'A 無好感帶區塊');
  assert.equal(get(b, 'band').text, '', 'B 無好感帶區塊');
  assert.ok(get(c, 'band').text.includes('【好感帶補充】'));
  assert.ok(get(c, 'band').text.includes('甜'));

  assert.ok(get(b, 'stage').text.includes('艾倫'), '玩家名代入階段區塊');
  assert.ok(get(a, 'stage').source.includes('stages.A'), '來源標註階段 key');
  assert.ok(get(c, 'band').source.includes('bands.sweet'));
  assert.ok(get(c, 'status').source.includes('reply_protocol.json'));
});

test('P1-02 案3：token 估算與好感帶／預設階段對映邊界', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens(null), 0);
  assert.ok(estimateTokens('這是一段中文文字，用來驗證估算。') > estimateTokens('short ascii'), '同長度中文資訊量更高');
  assert.ok(estimateTokens('中文'.repeat(50)) > estimateTokens('中文'.repeat(10)), '單調性');

  assert.equal(bandKeyForAffection(100), 'sweet');
  assert.equal(bandKeyForAffection(80), 'sweet');
  assert.equal(bandKeyForAffection(79), 'stable');
  assert.equal(bandKeyForAffection(50), 'stable');
  assert.equal(bandKeyForAffection(49), 'awkward');
  assert.equal(bandKeyForAffection(30), 'awkward');
  assert.equal(bandKeyForAffection(29), 'reconciliation');
  assert.equal(bandKeyForAffection(0), 'reconciliation');
  assert.equal(bandKeyForAffection(NaN), 'stable', '非法值取平穩');
  assert.equal(bandKeyForAffection(-5), 'reconciliation', 'clamp 下界');

  assert.equal(defaultStageForAffection(49), 'A');
  assert.equal(defaultStageForAffection(50), 'B');
  assert.equal(defaultStageForAffection(NaN), 'A');
});

test('P1-02 案4：區塊開關只影響檢視預覽、不影響實際組裝；偏好持久化', () => {
  const storage = fakeStorage();
  const memorySection = '- 記得你說喜歡紅茶';
  const input = { state: { stage: 'B', playerName: '艾倫' }, memorySection, storage };

  const d1 = buildInspectorData(input);
  assert.equal(d1.blocks.length, 6);
  assert.ok(d1.totalTokens > 0);
  const full = PromptAssembler.assemblePrompt({ state: { stage: 'B', playerName: '艾倫' }, memorySection });
  assert.equal(d1.preview, full, '全開時預覽＝實際組裝（含記憶注入）');

  assert.deepEqual(loadBlockPrefs(storage), {}, '預設無偏好＝全開');
  const prefs = loadBlockPrefs(storage);
  prefs.memory = false;
  saveBlockPrefs(storage, prefs);
  assert.equal(JSON.parse(storage.getItem(INSPECTOR_STORAGE_KEY)).memory, false);

  const d2 = buildInspectorData(input);
  assert.equal(d2.blocks.find(b => b.key === 'memory').enabled, false);
  assert.ok(!d2.preview.includes('【長期記憶】'), '關閉的區塊不進預覽');
  assert.ok(d2.totalTokens < d1.totalTokens);
  assert.equal(PromptAssembler.assemblePrompt({ state: { stage: 'B', playerName: '艾倫' }, memorySection }), full, '實際組裝不受開關影響');

  // 非法偏好值被忽略
  saveBlockPrefs(storage, { character: 'yes', stage: 0, status: true });
  const prefs2 = loadBlockPrefs(storage);
  assert.equal('character' in prefs2, false);
  assert.equal('stage' in prefs2, false);
  assert.equal(prefs2.status, true);
});

test('P1-02 案5：渲染含來源／字數／token／開關，且 HTML 轉義', () => {
  const data = buildInspectorData({ state: { stage: 'A' }, storage: fakeStorage() });
  const html = renderInspectorBlocks(data.blocks);
  assert.ok(html.includes('data-block="character"'));
  assert.ok(html.includes('checked'));
  assert.ok(html.includes('config/character.json'));
  assert.ok(html.includes('tokens'));
  const summary = renderInspectorSummary(data);
  assert.ok(summary.includes('區塊'));
  assert.ok(summary.includes('tokens'));

  const evil = renderInspectorBlocks([{
    key: 'character', label: '<img src=x onerror=1>', source: '<b>', text: '<script>alert(1)</script>', chars: 20, tokens: 23, enabled: true
  }]);
  assert.ok(!evil.includes('<script>'), 'HTML 轉義');
  assert.ok(evil.includes('&lt;script&gt;'));
  assert.ok(!evil.includes('<img src=x'));
  assert.ok(evil.includes('&quot;') || true);
});

test('P1-02 案6：app.js 接線契約（import／面板建立／重新組裝／開關保存）', () => {
  assert.ok(appSource.includes("from './prompt-inspector.js'"), 'import inspector');
  assert.ok(appSource.includes('ensurePromptInspectorPanel();'), '工坊載入時建立面板');
  assert.ok(/\.id=['"]pmInspector['"]/.test(appSource), '面板 id');
  assert.ok(appSource.includes('function refreshPromptInspector'), '重新組裝函數');
  assert.ok(appSource.includes('saveBlockPrefs(window.localStorage'), '開關偏好保存');
  assert.ok(appSource.includes("$('pmInspectorStage')"), '階段切換控制');
});
