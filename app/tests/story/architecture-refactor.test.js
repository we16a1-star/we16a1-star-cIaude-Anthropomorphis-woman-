import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EventBus } from '../../www/event-bus.js';
import { AudioCoordinator } from '../../www/audio-coordinator.js';
import { parseStoryTurnReply, sanitizeChoices, clampAffectionDelta, isValidStoryTurnReply } from '../../www/turn-reply-parser.js';
import { UI_EN } from '../../www/ui-en.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wwwDir = join(__dirname, '../../www');

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k)
  };
}

test('架構優化 1: EventBus 支援 on/once/off/emit 且單一監聽器拋錯不中斷其餘訂閱者', () => {
  const bus = new EventBus();
  const seen = [];
  const offA = bus.on('scene:changed', (p) => seen.push(`A:${p.sceneKey}`));
  bus.on('scene:changed', () => { throw new Error('boom'); });
  bus.once('scene:changed', (p) => seen.push(`ONCE:${p.sceneKey}`));

  const invoked = bus.emit('scene:changed', { sceneKey: 'rainy-night' });
  assert.equal(invoked, 2, '兩個正常監聽器皆成功執行');
  assert.deepEqual(seen, ['A:rainy-night', 'ONCE:rainy-night']);

  offA();
  bus.emit('scene:changed', { sceneKey: 'night' });
  assert.deepEqual(seen, ['A:rainy-night', 'ONCE:rainy-night'], '退訂與 once 均不重複觸發');
});

test('架構優化 2: AudioCoordinator 單一協調層（預設主音量 100%、靜音切換與事件匯流排路由）', () => {
  const store = makeStorage();
  const bus = new EventBus();
  const log = [];
  const fakeAudioBus = {
    unlock() { log.push('unlock'); },
    setActive() {},
    setMasterVolume(v) { log.push(`master:${v}`); }
  };
  const fakeBgm = {
    getSnapshot: () => ({ enabled: false, activeTrackTitle: '' }),
    setScene: (k) => log.push(`bgm:scene:${k}`),
    setEvent: (id) => log.push(`bgm:event:${id}`),
    clearEvent: () => log.push('bgm:clear'),
    registerScenePacks: () => log.push('bgm:packs'),
    subscribe: () => () => {}
  };
  const fakeAmb = {
    getPreference: () => ({ mode: 'off', volume: 0.45 }),
    setScene: (k) => log.push(`amb:scene:${k}`),
    sync() {}
  };
  const fakeVoice = {
    getSnapshot: () => ({ speaking: false }),
    stop: () => log.push('voice:stop'),
    subscribe: () => () => {}
  };

  const coord = new AudioCoordinator({
    storage: store,
    audioBus: fakeAudioBus,
    bgmPlayer: fakeBgm,
    ambienceEngine: fakeAmb,
    voicePlayer: fakeVoice,
    eventBus: bus
  });

  assert.equal(coord.masterVolume, 1, '空 storage 時預設主音量必須為 100%（不可為 0）');
  assert.equal(coord.masterMuted, false);

  bus.emit('scene:changed', { sceneKey: 'rainy-night' });
  bus.emit('cg:started', { id: 'goodnight' });
  bus.emit('cg:ended', {});
  bus.emit('scenepacks:loaded', { config: { scenePacks: [] } });

  assert.ok(log.includes('bgm:scene:rainy-night'));
  assert.ok(log.includes('amb:scene:rainy-night'));
  assert.ok(log.includes('bgm:event:goodnight'));
  assert.ok(log.includes('bgm:clear'));
  assert.ok(log.includes('bgm:packs'));

  coord.toggleMasterMute();
  assert.equal(coord.masterMuted, true);
  assert.ok(log.includes('master:0'));
  assert.ok(log.includes('voice:stop'));

  coord.setMasterVolume(0.75);
  assert.equal(coord.masterVolume, 0.75);
  assert.equal(coord.masterMuted, false);
  coord.dispose();
});

test('架構優化 3: turn-reply-parser 純函式解析（剝離思考塊、7 選項去重、10 情緒與 spokenEn 正規化）', () => {
  const raw = `<think>先構思一下這回合 {假的JSON}</think>
\`\`\`json
{
  "narration": "（她把紅茶推過來）「趁熱喝吧，別著涼了。」",
  "memory": "一起喝紅茶",
  "choices": ["道謝接過", "稱讚茶香", "問書頁進度", "遞上餅乾", "聊起雨聲", "翻開未竟錄", "安靜陪伴"],
  "emotion": "warm",
  "intensity": 5,
  "affectionDelta": 99,
  "timeAdvance": 8,
  "eventFlag": "goodnight",
  "spokenEn": ["Drink it while it is warm, do not catch a chill."]
}
\`\`\``;

  const parsed = parseStoryTurnReply(raw);
  assert.equal(parsed.choices.length, 7);
  assert.equal(parsed.emotion, 'tender', 'warm 收斂為正式情緒 tender');
  assert.equal(parsed.intensity, 3, 'intensity 上限 clamp 至 3');
  assert.equal(parsed.affectionDelta, 5, 'affectionDelta 上限 clamp 至 5');
  assert.equal(parsed.timeAdvance, 6, 'timeAdvance 上限 clamp 至 6');
  assert.deepEqual(parsed.spokenEn, ['Drink it while it is warm, do not catch a chill.']);
  assert.equal(isValidStoryTurnReply(raw), true);
  assert.equal(isValidStoryTurnReply('{"narration":"缺選項","memory":"m","choices":["1"]}'), false);
  assert.equal(sanitizeChoices(['A', 'a', 'B']).length, 2);
  assert.equal(clampAffectionDelta(-99), -5);
});

test('架構優化 4: UI_EN 獨立抽離、app.js 精簡且匯出路徑均經 sanitizeExportPayload 淨化', () => {
  assert.ok(Object.keys(UI_EN).length >= 1300, 'ui-en.js 包含完整雙語字典');
  const appSrc = readFileSync(join(wwwDir, 'app.js'), 'utf8');
  const appLines = appSrc.split('\n').length;
  assert.ok(appLines < 8000, `app.js 抽離後應顯著精簡（目前 ${appLines} 行）`);
  assert.ok(appSrc.includes("import { UI_EN } from './ui-en.js'"));
  assert.ok(appSrc.includes('window.__claudeRuntime'));
  assert.ok(appSrc.includes('sanitizeExportPayload({format:'), 'exportData 經敏感金鑰淨化');
  assert.ok(appSrc.includes('sanitizeExportPayload({app:'), 'exportKit 經敏感金鑰淨化');
});
