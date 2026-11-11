import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PLAYER_NAME, PLAYER_NAME_MAX_LENGTH, PLAYER_NAME_KEY,
  sanitizePlayerName, normalizePlayerName, savePlayerNamePreference, loadPlayerNamePreference
} from '../../www/player-name.js';

function makeStorage() {
  const map = new Map();
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
    _map: map
  };
}

test('D14: 預設玩家名為 User、key 契約值', () => {
  assert.equal(DEFAULT_PLAYER_NAME, 'User');
  assert.equal(PLAYER_NAME_KEY, 'claude_novel_player_name_v1');
  assert.equal(PLAYER_NAME_MAX_LENGTH, 16);
});

test('D14: sanitize 去控制字元與引號、trim、Unicode 上限 16', () => {
  assert.equal(sanitizePlayerName('  凱特琳  '), '凱特琳');
  assert.equal(sanitizePlayerName('Dan\u0000ny\n'), 'Danny');
  assert.equal(sanitizePlayerName('a"b\'c'), 'abc');
  assert.equal(Array.from(sanitizePlayerName('一'.repeat(20))).length, PLAYER_NAME_MAX_LENGTH, '中文名上限 16 字');
  assert.equal(Array.from(sanitizePlayerName('🍕'.repeat(20))).length, PLAYER_NAME_MAX_LENGTH, '以 code point 計數，emoji 不切半');
  assert.equal(sanitizePlayerName(undefined), '');
});

test('D14: normalize 清空回退預設 User、自訂名優先', () => {
  assert.equal(normalizePlayerName(''), DEFAULT_PLAYER_NAME);
  assert.equal(normalizePlayerName('   '), DEFAULT_PLAYER_NAME);
  assert.equal(normalizePlayerName('"  \''), DEFAULT_PLAYER_NAME, '只留引號＝清空');
  assert.equal(normalizePlayerName('凱特琳'), '凱特琳');
});

test('D14: 偏好存取 roundtrip', () => {
  const storage = makeStorage();
  savePlayerNamePreference('凱特琳', storage);
  assert.equal(loadPlayerNamePreference(storage), '凱特琳');

  savePlayerNamePreference('', storage);
  assert.equal(loadPlayerNamePreference(storage), DEFAULT_PLAYER_NAME, '存空值＝正規化為預設');
  assert.equal(storage._map.get(PLAYER_NAME_KEY), DEFAULT_PLAYER_NAME);

  savePlayerNamePreference('Dan"Danny', storage);
  assert.equal(loadPlayerNamePreference(storage), 'DanDanny', '引號已被 sanitize');
});

test('D14: storage 寫入／讀取失敗不擲錯、回退預設', () => {
  assert.doesNotThrow(() => savePlayerNamePreference('User', { setItem() { throw new Error('quota'); } }));
  assert.equal(savePlayerNamePreference('User', { setItem() { throw new Error('quota'); } }), 'User');
  assert.equal(loadPlayerNamePreference({ getItem() { throw new Error('blocked'); } }), DEFAULT_PLAYER_NAME);
  assert.equal(loadPlayerNamePreference(null), DEFAULT_PLAYER_NAME);
});
