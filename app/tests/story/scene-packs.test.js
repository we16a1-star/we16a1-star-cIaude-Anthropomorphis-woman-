import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadScenePacks, validateScenePacks } from '../../www/config-loader.js';
import {
  DEFAULT_SCENE_PACKS,
  createScenePackRegistry,
  resolveScenePack,
  resolveBoundScenePlan
} from '../../www/scene-packs.js';

const here = dirname(fileURLToPath(import.meta.url));
const wwwDir = join(here, '..', '..', 'www');

test('scene-packs: scenePacks.json 通過 schema 驗證且完整登錄五大書庫場景', () => {
  const cfg = loadScenePacks();
  assert.equal(validateScenePacks(cfg), true);
  assert.equal(cfg.bgmEnabled, false, 'D18 維持 BGM 預設關閉');
  assert.equal(cfg.defaultBgm, null);
  assert.equal(cfg.scenePacks.length, 5);
  for (const pack of cfg.scenePacks) {
    assert.equal(pack.mirrored, false, '所有新場景一律人物在右、嚴禁鏡射');
    assert.ok(pack.background.endsWith('.jpg'));
  }
});

test('scene-packs: 依 id／sceneKey／別名查詢且嚴守「不跨日夜組」原則', () => {
  const cfg = loadScenePacks();
  const reg = createScenePackRegistry(cfg);

  const day = resolveScenePack(reg, '白天', 'day');
  assert.equal(day?.background, 'g43-story-default.jpg');
  assert.equal(day?.tone, 'warm');

  const rainy = resolveScenePack(reg, '雨夜', 'night');
  assert.equal(rainy?.background, 'g43-story-rainy-night.jpg');
  assert.equal(rainy?.tone, 'night');

  // 不允許在日間強切夜間場景，反之亦然
  assert.equal(resolveScenePack(reg, '雨夜', 'day'), null);
  assert.equal(resolveScenePack(reg, '晨光', 'night'), null);
});

test('scene-packs: 分層綁定 resolveBoundScenePlan 維持背景順序與 BGM 開關控制', () => {
  const reg = createScenePackRegistry(DEFAULT_SCENE_PACKS);
  const plan = resolveBoundScenePlan({ bg: ['morning-soft', 'day-default'], bgm: ['night-magic'] }, reg);
  assert.equal(plan.backgrounds.length, 2);
  assert.equal(plan.primary.id, 'morning-soft');
  assert.equal(plan.bgmEnabled, false);
  assert.equal(plan.bgmTrack, null);
});

test('scene-packs: story-art.js 暴露 applyScenePack 與 listScenePacks 且保留 G43 入口契約', () => {
  const src = readFileSync(join(wwwDir, 'story-art.js'), 'utf8');
  assert.ok(src.includes('window.__storyArt = { showRareGoodnight, showBedroomScene, showRainyNightScene, applyScenePack, listScenePacks'));
  assert.ok(src.includes("fetch('config/scenePacks.json')"));
});
