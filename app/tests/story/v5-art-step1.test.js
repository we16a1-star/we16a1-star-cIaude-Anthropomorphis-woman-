import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ALL_CONFIGS, validateConfigs } from '../../www/config-loader.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(testDir, '../../www/assets');

const NEW_IDS = ['36621', '36622', '36623', '36624', '36625', '36626', '36627', '36628', '36629', '36632'];
const UNUSED_IDS = [];
const USABLE = {
  '36621': { file: 'g43-cg-rose.jpg', width: 1086, height: 1448, bytes: 252849, sha: '0C35456D06C08EBCA3C75D2B09B39C283D4384766B49A1547D2C40353B5CBCBE' },
  '36622': { file: 'g43-cg-lakeside.jpg', width: 941, height: 1672, bytes: 349727, sha: '00DED999083BD7BF0AACFDA15A8DCECD1BB27C61DECC4B77025D34557DE6B8C8' },
  '36626': { file: 'g43-extra-casual.jpg', width: 940, height: 1672, bytes: 136749, sha: '63C6FCDF36ECBB108CFCEACC775DEB7B50EA320BEDDE2F4F886396F6D1C93FAA' },
  '36627': { file: 'g43-cg-cheek-pinch.jpg', width: 941, height: 1672, bytes: 224115, sha: 'A63463DED4307DEDB9E91FB31FFB5FD64D5FB6A26F08834AD0E0E0B637F4E290' },
  '36628': { file: 'g43-cg-goodnight-reading.jpg', width: 1024, height: 1536, bytes: 167836, sha: '556D39F515AC377D4A39AB654646506360071A74BF5A780B32D72D7F1882B75B' },
  '36629': { file: 'g43-cg-goodnight-nightgown.jpg', width: 1024, height: 1536, bytes: 192251, sha: 'F36D54DB73D417A9DDD47F1EC15DC97893511ABA42EA41F34FFA588CD59DFBE0' },
  '36632': { file: 'g43-cg-ending-halo.jpg', width: 1199, height: 1312, bytes: 206882, sha: 'DE3AC059C8D92EEBD9DB96F9991C7140A9D56AB6793FE550751681DCCDEF7769' }
};

function jpegSize(file) {
  const buf = fs.readFileSync(file);
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] !== 0xFF) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xD8 || marker === 0xD9 || (marker >= 0xD0 && marker <= 0xD7)) {
      i += 2;
      continue;
    }
    if (marker >= 0xC0 && marker <= 0xC3) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('JPEG SOF not found: ' + file);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
}

test('v5 Step 1：art_distribution.json 已補十筆，欄位依 xlsx', () => {
  const entries = ALL_CONFIGS.artDistribution.entries;
  assert.equal(Object.keys(entries).length, 23, '原有 13 筆＋v5 10 筆');
  for (const id of NEW_IDS) {
    assert.ok(entries[id], `entry ${id} 存在`);
    assert.equal(entries[id].id, id, `${id} id 一致`);
    assert.equal(typeof entries[id].origFile, 'string', `${id} 有原始檔名`);
    assert.equal(typeof entries[id].visual, 'string', `${id} 有畫面描述`);
    assert.equal(typeof entries[id].role, 'string', `${id} 有用途`);
    assert.equal(typeof entries[id].trigger, 'string', `${id} 有觸發說明`);
    assert.equal(entries[id].autoSwitch, false, `${id} 不自動切換`);
  }

  assert.equal(entries['36621'].level, '劇情CG');
  assert.ok(entries['36621'].trigger.includes('去背'), '36621 標記黑底待去背');
  assert.equal(entries['36622'].timeGroup, 'evening');
  assert.equal(entries['36622'].width, 941);
  assert.equal(entries['36622'].height, 1672);
  assert.equal(entries['36626'].level, '其他');
  assert.equal(entries['36627'].level, '觸碰反應');
  assert.equal(entries['36627'].timeGroup, 'day');
  assert.equal(entries['36628'].timeGroup, 'night');
  assert.ok(entries['36628'].trigger.includes('與 36455 擇一'), '36628 與 36455 擇一');
  assert.ok(entries['36629'].trigger.includes('預設不用'), '36629 預設不用');
  assert.ok(entries['36632'].trigger.includes('ending'), '36632 接 ending');

  for (const id of UNUSED_IDS) {
    assert.equal(entries[id].level, '不使用', `${id} 標記不使用`);
    assert.equal(entries[id].file, null, `${id} 不指向任何資產`);
    assert.equal(entries[id].autoSwitch, false, `${id} 不可自動使用`);
  }
});

test('v5 Step 1：36455 缺檔已補，尺寸與 entry 相符', () => {
  const entry = ALL_CONFIGS.artDistribution.entries['36455'];
  assert.equal(entry.file, 'g43-cg-bed-goodnight.jpg');
  const file = path.join(assetsDir, entry.file);
  assert.ok(fs.existsSync(file), 'g43-cg-bed-goodnight.jpg 已入庫');
  const size = jpegSize(file);
  assert.deepEqual(size, { width: 1672, height: 941 });
  assert.equal(fs.statSync(file).size, 189076);
  assert.equal(sha256(file), 'F7C4B8534E3F19369B80C4325A8B3B308554B80949693A9F321E90BBB79D5806');
});

test('v5 Step 1：可用圖片已入庫，尺寸、大小與 SHA256 相符', () => {
  for (const [id, expected] of Object.entries(USABLE)) {
    const entry = ALL_CONFIGS.artDistribution.entries[id];
    assert.equal(entry.file, expected.file, `${id} 檔名`);
    const file = path.join(assetsDir, expected.file);
    assert.ok(fs.existsSync(file), `${expected.file} 已入庫`);
    assert.deepEqual(jpegSize(file), { width: expected.width, height: expected.height }, `${id} 尺寸`);
    assert.equal(fs.statSync(file).size, expected.bytes, `${id} 大小`);
    assert.equal(sha256(file), expected.sha, `${id} SHA256`);
  }
});

test('v5 Step 1：不使用圖不進 assets', () => {
  const names = fs.readdirSync(assetsDir);
  for (const id of UNUSED_IDS) {
    assert.ok(!names.some(name => name.includes(id)), `${id} 不得入庫`);
  }
});

test('v5 Step 1：schema 會擋下缺漏、尺寸錯誤與誤用', () => {
  const entries = ALL_CONFIGS.artDistribution.entries;
  const original = {
    '36622': { ...entries['36622'] },
    '36623': { ...entries['36623'] },
    '36629': { ...entries['36629'] },
    '36632': { ...entries['36632'] }
  };
  try {
    delete entries['36632'];
    assert.throws(() => validateConfigs(), /entries\.v5\.newTen/);
    entries['36632'] = original['36632'];

    entries['36622'].width = 1024;
    assert.throws(() => validateConfigs(), /entries\.v5\.portraitSizes/);
    entries['36622'] = original['36622'];

    entries['36623'].level = '劇情CG';
    assert.throws(() => validateConfigs(), /entries\.v5\.unusedNoFile/);
    entries['36623'] = original['36623'];

    entries['36629'].trigger = '可自動使用';
    assert.throws(() => validateConfigs(), /entries\.v5\.pending/);
    entries['36629'] = original['36629'];
  } finally {
    entries['36622'] = original['36622'];
    entries['36623'] = original['36623'];
    entries['36629'] = original['36629'];
    entries['36632'] = original['36632'];
  }
  assert.equal(validateConfigs(), true, '還原後驗證通過');
});
