import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_BGM_PREF,
  STORAGE_KEY_BGM_PREF,
  BGM_CROSSFADE_SEC,
  BgmPlayer,
  loadBgmPreference,
  saveBgmPreference
} from '../../www/bgm-player.js';
import {
  resolveAmbienceKind,
  loadAmbiencePreference,
  saveAmbiencePreference
} from '../../www/ambience.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wwwDir = join(__dirname, '../../www');

function makeMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k)
  };
}

function makeFakeAudioBus() {
  let startCount = 0;
  let stopCount = 0;
  let levels = {};
  const ctx = {
    state: 'running',
    currentTime: 0,
    decodeAudioData: async (ab) => ({ duration: 60, raw: ab }),
    createGain: () => ({
      gain: {
        value: 1,
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        cancelScheduledValues() {}
      },
      connect() {},
      disconnect() {}
    }),
    createBufferSource: () => ({
      buffer: null,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      connect() {},
      disconnect() {},
      start() { startCount += 1; },
      stop() { stopCount += 1; }
    })
  };
  return {
    context: ctx,
    unlock() {},
    setActive() {},
    setLevel(ch, v) { levels[ch] = v; },
    input() { return {}; },
    stats: () => ({ startCount, stopCount, levels })
  };
}

test('BGM-2 / BGM-3: scenePacks.json 維持 bgmEnabled:false 且九首 M4A 配樂全數就位', () => {
  const packs = JSON.parse(readFileSync(join(wwwDir, 'config/scenePacks.json'), 'utf8'));
  assert.equal(packs.version, 'v2.0-placeholder', '保留 version 相容 v5-art-step2.test.js');
  assert.equal(packs.bgmEnabled, false, '保留出廠 bgmEnabled:false 相容既有測試');

  const allTracks = [
    'bgm-title.m4a',
    'bgm-day-default.m4a',
    'bgm-morning-soft.m4a',
    'bgm-evening-reading.m4a',
    'bgm-night-magic.m4a',
    'bgm-rainy-night.m4a',
    'bgm-event-tender.m4a',
    'bgm-event-playful.m4a',
    'bgm-wait.m4a'
  ];
  for (const file of allTracks) {
    assert.ok(existsSync(join(wwwDir, 'assets/bgm', file)), `配樂檔存在：${file}`);
  }
});

test('BGM-2: 偏好持久化、預設關閉、同曲不重播與缺檔靜默降級', async () => {
  const store = makeMemoryStorage();
  assert.deepEqual(loadBgmPreference(store), DEFAULT_BGM_PREF);
  assert.equal(DEFAULT_BGM_PREF.enabled, false, 'BGM 預設關閉避免突襲出聲');
  assert.equal(BGM_CROSSFADE_SEC, 1.2, '預設 1.2 秒交叉淡入淡出');

  const saved = saveBgmPreference({ enabled: true, volume: 0.8 }, store);
  assert.equal(saved.enabled, true);
  assert.equal(saved.volume, 0.8);
  assert.ok(store.getItem(STORAGE_KEY_BGM_PREF));

  let fetchCalls = 0;
  const fakeBus = makeFakeAudioBus();
  const player = new BgmPlayer({
    storage: store,
    audioBus: fakeBus,
    crossfadeSec: 0.05,
    fetch: async (url) => {
      fetchCalls += 1;
      if (url.includes('missing')) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
      return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array(128).buffer };
    }
  });

  // 第一次播放 day-default
  const ok1 = await player.syncPlayback();
  assert.equal(ok1, true);
  assert.equal(fakeBus.stats().startCount, 1);
  assert.equal(fetchCalls, 1);

  // 同曲不重播
  const ok2 = await player.syncPlayback();
  assert.equal(ok2, true);
  assert.equal(fakeBus.stats().startCount, 1, '同曲不重播');

  // 缺檔靜默降級且記憶失敗避免 404 洪水
  player.catalog['broken-scene'] = { id: 'broken', title: 'broken', file: 'assets/bgm/missing.m4a' };
  player.currentSceneKey = 'broken-scene';
  const okMiss1 = await player.syncPlayback();
  const okMiss2 = await player.syncPlayback();
  assert.equal(okMiss1, false);
  assert.equal(okMiss2, false);
  assert.equal(fetchCalls, 2, '缺檔只請求一次即快取失敗，不再重複 404');

  player.stop(0.02);
});

test('BGM-2 環境音: 自動跟隨場景映射與偏好存取', () => {
  assert.equal(resolveAmbienceKind('off', 'rainy-night'), 'off');
  assert.equal(resolveAmbienceKind('auto', 'rainy-night'), 'rain');
  assert.equal(resolveAmbienceKind('auto', 'night'), 'fireplace');
  assert.equal(resolveAmbienceKind('auto', 'default'), 'off');
  assert.equal(resolveAmbienceKind('rain', 'default'), 'rain');

  const store = makeMemoryStorage();
  const saved = saveAmbiencePreference({ mode: 'auto', volume: 0.6 }, store);
  assert.equal(saved.mode, 'auto');
  assert.equal(saved.volume, 0.6);
  assert.deepEqual(loadAmbiencePreference(store), { mode: 'auto', volume: 0.6 });
});
