/**
 * plugin-debug-cards-vn.test.js — 驗證四大系統整合：
 * 1. Harness 風格插件註冊表（內建外掛、自訂 JSON 外掛、Hook 錯誤隔離、持久化）
 * 2. 後端檢查與除錯診斷器（/api/health 模擬、事件追蹤、報告淨化不含金鑰）
 * 3. 角色卡匯入器（PNG ccv3/chara tEXt 二進位解碼、JSON V2/V3 與世界書萃取、快速建卡）
 * 4. 多角色卡 VN 劇本解析與逐句演出引擎（extraCharNames、說話人角色判定、LineRunner 整合）
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { PluginRegistry, compileDeclarativePlugin } from '../../www/plugin-registry.js';
import { BackendDebugger } from '../../www/backend-debug.js';
import { EventBus } from '../../www/event-bus.js';
import {
  isPngBytes,
  parsePngCharacterCard,
  parseJsonCharacterCard,
  toGameCharacterCard,
  createQuickCharacterCard
} from '../../www/character-card-importer.js';
import { parseVnScript } from '../../www/vn-script.js';
import { LineRunner } from '../../www/line-runner.js';
import { SceneImageGenerator, buildEnhancedImagePrompt, dataUrlToImageFile } from '../../www/image-gen.js';

function createMemoryStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key(i) { return [...map.keys()][i] ?? null; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(k); }
  };
}

/**
 * 建構合法的最小 PNG 位元組（含自訂 tEXt chunk）供二進位測試
 */
function buildSyntheticPngWithTextChunk(keyword, value) {
  const sig = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const makeChunk = (type, dataBytes) => {
    const out = new Uint8Array(12 + dataBytes.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, dataBytes.length, false);
    for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
    out.set(dataBytes, 8);
    // 測試用 CRC 填 0（本解析器只讀 chunk length/type/data）
    dv.setUint32(8 + dataBytes.length, 0, false);
    return out;
  };
  const ihdr = makeChunk('IHDR', new Uint8Array(13));
  const keyBytes = Uint8Array.from([...keyword].map((c) => c.charCodeAt(0)));
  const valBytes = Uint8Array.from([...value].map((c) => c.charCodeAt(0)));
  const textData = new Uint8Array(keyBytes.length + 1 + valBytes.length);
  textData.set(keyBytes, 0);
  textData[keyBytes.length] = 0;
  textData.set(valBytes, keyBytes.length + 1);
  const textChunk = makeChunk('tEXt', textData);
  const iend = makeChunk('IEND', new Uint8Array(0));

  const total = new Uint8Array(sig.length + ihdr.length + textChunk.length + iend.length);
  let off = 0;
  for (const part of [sig, ihdr, textChunk, iend]) {
    total.set(part, off);
    off += part.length;
  }
  return total;
}

const tests = [
  ['Harness PluginRegistry: 內建外掛、自訂宣告式外掛、錯誤隔離與持久化', async () => {
    const storage = createMemoryStorage();
    const bus = new EventBus();
    const errors = [];
    bus.on('plugin:error', (e) => errors.push(e));

    const reg = new PluginRegistry({ storage, bus });
    assert.ok(reg.list().length >= 7, '應預載 7 個內建核心插件');
    assert.equal(reg.isEnabled('cards'), true);

    // 註冊一個會擲錯的插件，驗證不中斷其他插件執行
    reg.register({
      id: 'faulty-test',
      name: '故障測試插件',
      hooks: {
        onPrompt() { throw new Error('故意失敗'); }
      }
    });

    const installed = reg.importDeclarativePlugin({
      id: 'tea-mood',
      name: '茶香插件',
      description: '偵測紅茶關鍵詞',
      promptAppend: '多描寫古籍茶香。',
      lineRules: [{ keyword: '紅茶', emotion: 'tender' }]
    });
    assert.equal(installed.id, 'tea-mood');

    const promptCtx = { extraDirectives: [] };
    reg.runHook('onPrompt', promptCtx);
    assert.equal(errors.length, 1);
    assert.equal(promptCtx.extraDirectives.length, 1);
    assert.ok(promptCtx.extraDirectives[0].includes('古籍茶香'));

    const lineMeta = { text: '她端來一杯溫熱的紅茶。', emotion: null };
    reg.runHook('onLine', { meta: lineMeta });
    assert.equal(lineMeta.emotion, 'tender');
    assert.equal(lineMeta.emotionSource, 'plugin:tea-mood');

    // 重新建立實例應自動還原自訂插件與開關狀態
    reg.setEnabled('bgm', false);
    const reg2 = new PluginRegistry({ storage, bus });
    assert.equal(reg2.isEnabled('bgm'), false);
    assert.ok(reg2.getSnapshot('tea-mood'), '宣告式自訂插件應持久化還原');

    // 移除自訂插件，且內建插件不可移除
    assert.equal(reg2.unregister('tea-mood'), true);
    assert.throws(() => reg2.unregister('emotion'));

    const compiled = compileDeclarativePlugin({ name: '簡易測試', lineRules: [{ keyword: '雨夜', scene: 'rain-night' }] });
    assert.equal(typeof compiled.hooks.onLine, 'function');
  }],

  ['BackendDebugger: 六項診斷、事件追蹤與金鑰淨化報告', async () => {
    const bus = new EventBus();
    const dbg = new BackendDebugger({ bus });
    const reg = new PluginRegistry({ storage: createMemoryStorage(), bus });

    bus.emit('scene:changed', { scene: 'night-reading', apiKey: 'sk-ant-secret-123456' });
    assert.equal(dbg.getTrace().length, 1);
    assert.equal(dbg.getTrace()[0].detail.apiKey, undefined, '敏感 key 必須於事件追蹤就被剔除');

    const fakeFetch = async (url) => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true, profiles: { anthropic: ['DEFAULT'], gemini: ['PERSONAL'] } })
    });

    const report = await dbg.runDiagnostics({
      apiBase: 'http://127.0.0.1:3000',
      fetchImpl: fakeFetch,
      configs: {
        emotions: {
          emotions: ['neutral', 'happy', 'proud', 'shy', 'surprised', 'dizzy', 'curious', 'focused', 'worried', 'tender'].map((k) => ({ key: k }))
        }
      },
      pluginRegistry: reg,
      audioCoordinator: { getSnapshot: () => ({ masterVolume: 0.9, masterMuted: false, bgm: { enabled: true }, ambience: { enabled: false } }) },
      voiceDiagnostics: { supported: true, enGbVoices: 2 },
      storage: createMemoryStorage(),
      cardCount: 2,
      activeCardCount: 1
    });

    assert.equal(report.ok, true);
    assert.equal(report.checks.length, 6);
    assert.equal(report.summary.fail, 0);

    const sanitized = dbg.buildSanitizedReport({ token: 'ghp_secret_abc', safeField: 'hello' });
    assert.equal(sanitized.token, undefined);
    assert.equal(sanitized.safeField, 'hello');
    dbg.destroy();
  }],

  ['CharacterCardImporter: PNG ccv3 二進位解碼、JSON V2 世界書萃取與快速建卡', async () => {
    const v3Card = {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: {
        name: '林曉',
        creator: 'LibraryTeam',
        tags: ['修復師', '溫和'],
        description: '常在雨夜來訪的古籍修復師。',
        personality: '沉靜、細心',
        first_mes: '<emotion:curious>林曉：「這本殘卷的頁角似乎被重新裝訂過。」',
        character_book: {
          entries: [
            { name: '裝幀術', keys: ['裝幀', '修復'], content: '知識之塔傳統手工線裝技法。', enabled: true }
          ]
        }
      }
    };
    const b64 = Buffer.from(JSON.stringify(v3Card), 'utf8').toString('base64');
    const pngBytes = buildSyntheticPngWithTextChunk('ccv3', b64);

    assert.equal(isPngBytes(pngBytes), true);
    const parsedPng = parsePngCharacterCard(pngBytes);
    assert.equal(parsedPng.spec, 'V3');
    assert.equal(parsedPng.chunkKey, 'ccv3');
    assert.ok(parsedPng.avatarDataUrl.startsWith('data:image/png;base64,'));

    const gameCard = toGameCharacterCard(parsedPng);
    assert.equal(gameCard.name, '林曉');
    assert.equal(gameCard.sourceSpec, 'V3');
    assert.equal(gameCard.worldBookEntries.length, 1);
    assert.equal(gameCard.worldBookEntries[0].title, '裝幀術');

    const parsedJson = parseJsonCharacterCard(JSON.stringify(v3Card));
    const gameCard2 = toGameCharacterCard(parsedJson);
    assert.equal(gameCard2.name, '林曉');

    const quick = createQuickCharacterCard({
      name: '蘇澄',
      tagline: '夜班圖書館員',
      personality: '俐落務實',
      speakingStyle: '簡短直率'
    });
    assert.equal(quick.name, '蘇澄');
    assert.ok(quick.firstMes.includes('蘇澄'));
  }],

  ['Multi-Character VN Script Parser & LineRunner: 辨識已加入角色卡說話人與情緒標籤', async () => {
    const script = [
      '<emotion:curious>Claude娘：「今晚的雨下得比昨天還密。」',
      '林曉：剛才我在三樓閱覽室撿到一枚銅書籤。',
      '<emotion:tender>林曉：「如果沒認錯，這應該是妳的吧？」'
    ].join('\n');

    const parsed = parseVnScript(script, {
      charName: 'Claude娘',
      extraCharNames: [{ id: 'card_linxiao', name: '林曉' }],
      userName: '旅人'
    });

    assert.equal(parsed.lines.length, 3);
    assert.equal(parsed.lines[0].speaker, 'Claude娘');
    assert.equal(parsed.lines[0].speakerRole, 'main');
    assert.equal(parsed.lines[0].emotion, 'curious');

    assert.equal(parsed.lines[1].speaker, '林曉');
    assert.equal(parsed.lines[1].speakerRole, 'card');
    assert.equal(parsed.lines[1].speakerCardId, 'card_linxiao');

    assert.equal(parsed.lines[2].speaker, '林曉');
    assert.equal(parsed.lines[2].emotion, 'tender');

    // LineRunner 逐句試播應完整保留 speaker / speakerRole / emotion
    const seenMetas = [];
    const runner = new LineRunner({ speed: 10, autoAdvance: false });
    runner.enabled = true;
    runner.start(parsed.lines, {
      onLineMeta: (meta) => seenMetas.push({ speaker: meta.speaker, role: meta.speakerRole, emotion: meta.emotion })
    });
    runner.advance(); // 補完第一句
    runner.advance(); // 進第二句
    runner.advance(); // 補完第二句
    runner.advance(); // 進第三句
    runner.stop();

    assert.deepEqual(seenMetas, [
      { speaker: 'Claude娘', role: 'main', emotion: 'curious' },
      { speaker: '林曉', role: 'card', emotion: null },
      { speaker: '林曉', role: 'card', emotion: 'tender' }
    ]);
  }],

  ['API Image Generation + VN <image:...> Tag Auto-Import: 解析標籤、三視圖鎖定提示詞並自動匯入舞台', async () => {
    const script = '<image:雨夜古籍閱覽室窗邊燭火><emotion:tender>Claude娘：「今晚的雨聲讓人很安心。」';
    const parsed = parseVnScript(script, { charName: 'Claude娘', userName: '旅人' });
    assert.equal(parsed.lines.length, 1);
    assert.equal(parsed.lines[0].text, '「今晚的雨聲讓人很安心。」');
    assert.equal(parsed.lines[0].emotion, 'tender');
    assert.equal(parsed.lines[0].imagePrompt, '雨夜古籍閱覽室窗邊燭火');

    const enhanced = buildEnhancedImagePrompt(parsed.lines[0].imagePrompt, { lockCharacterDesign: true, extraCharNames: ['林曉'] });
    assert.ok(enhanced.includes('NO GLASSES'), '應包含三視圖外觀鎖定（無眼鏡）');
    assert.ok(enhanced.includes('林曉'), '應納入同台角色名稱');

    const bus = new EventBus();
    const storage = createMemoryStorage();
    const events = [];
    bus.on('image:generated', (e) => events.push(e));

    const gen = new SceneImageGenerator({ storage, bus });
    gen.saveConfig({ provider: 'gemini', model: 'gemini-2.5-flash-image', autoOnVnTag: true });
    assert.equal(gen.getConfig().autoOnVnTag, true);

    const tinyPngB64 = Buffer.from(buildSyntheticPngWithTextChunk('note', 'ok')).toString('base64');
    const importedFiles = [];
    const res = await gen.generateAndImport({
      prompt: parsed.lines[0].imagePrompt,
      apiBase: 'http://127.0.0.1:8787',
      dedupeKey: 'turn1:0',
      fetchImpl: async (url, opts) => {
        assert.equal(url, 'http://127.0.0.1:8787/api/image');
        const body = JSON.parse(opts.body);
        assert.equal(body.provider, 'gemini');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            provider: 'gemini',
            model: 'gemini-2.5-flash-image',
            mime: 'image/png',
            dataUrl: `data:image/png;base64,${tinyPngB64}`,
            latencyMs: 120
          })
        };
      },
      importFile: async (file, source) => {
        importedFiles.push({ type: file.type, size: file.size, source });
      }
    });

    assert.equal(res.ok, true);
    assert.equal(importedFiles.length, 1);
    assert.equal(importedFiles[0].source, 'api');
    assert.equal(importedFiles[0].type, 'image/png');
    assert.equal(events.length, 1);

    // 同一 dedupeKey 不重複觸發扣費
    const dup = await gen.generateAndImport({ prompt: 'same', dedupeKey: 'turn1:0' });
    assert.equal(dup.skipped, true);

    const f = dataUrlToImageFile(`data:image/png;base64,${tinyPngB64}`, 'test.png');
    assert.equal(f.type, 'image/png');
  }]
];

for (const [name, fn] of tests) {
  test(name, fn);
}
