// WP3 簡易相簿：資料登錄、解鎖、UI 接線。
// 用法（本資料夾上層）：node tests/album.test.cjs
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const www = path.join(root, 'app', 'www');
const albumPath = path.join(www, 'album.js');
const appPath = path.join(www, 'app.js');
const htmlPath = path.join(www, 'index.html');
const cssPath = path.join(www, 'style.css');

let pass = 0, fail = 0;
const ok = (cond, name) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); cond ? pass++ : fail++; };

function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    i += 2 + len;
  }
  return null;
}
function webpSize(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const type = buf.toString('ascii', 12, 16);
  if (type === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  if (type === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (type === 'VP8L') { const b = buf.readUInt32LE(21); return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) }; }
  return null;
}

const albumMod = new Function(fs.readFileSync(albumPath, 'utf8').replace(/export /g, '') + `
  return { ALBUM_ENTRIES, ALBUM_FREE_IDS, albumEntry, isAlbumUnlocked, albumImageSrc };
`)();

ok(Array.isArray(albumMod.ALBUM_ENTRIES) && albumMod.ALBUM_ENTRIES.length === 9, 'ALBUM_ENTRIES 共 9 張');
ok(Array.isArray(albumMod.ALBUM_FREE_IDS) && albumMod.ALBUM_FREE_IDS.length === 6, '免費解鎖 6 張');
ok(typeof albumMod.albumEntry === 'function' && albumMod.albumEntry('36626').file === 'g43-album-36626.jpg', 'albumEntry 可查');
ok(albumMod.isAlbumUnlocked({ albumUnlocked: ['36626'] }, '36626') === true, 'isAlbumUnlocked 正確');
ok(albumMod.isAlbumUnlocked({ albumUnlocked: [] }, '36626') === false, '未解鎖回 false');
ok(albumMod.albumImageSrc('36628') === 'assets/g43-cg-goodnight-reading.jpg', 'albumImageSrc 指向既有 CG');

const assetsDir = path.join(www, 'assets');
for (const f of ['g43-album-36626.jpg', 'g43-album-36676.jpg', 'g43-album-36684.jpg']) {
  const p = path.join(assetsDir, f);
  ok(fs.existsSync(p), `${f} 存在`);
  if (fs.existsSync(p)) ok(!!jpegSize(fs.readFileSync(p)), `${f} 是有效 JPEG`);
}
for (const f of ['g43-album-36623.webp', 'g43-album-36624.webp', 'g43-album-36625.webp']) {
  const p = path.join(assetsDir, f);
  ok(fs.existsSync(p), `${f} 存在`);
  if (fs.existsSync(p)) ok(!!webpSize(fs.readFileSync(p)), `${f} 是有效 WebP`);
}
for (const f of ['g43-cg-goodnight-reading.jpg', 'g43-cg-goodnight-nightgown.jpg', 'g43-cg-goodnight.jpg']) {
  ok(fs.existsSync(path.join(assetsDir, f)), `${f} 存在（既有 CG）`);
}

const appSource = fs.readFileSync(appPath, 'utf8');
ok(appSource.includes("import { ALBUM_ENTRIES, ALBUM_FREE_IDS, albumEntry, isAlbumUnlocked, albumImageSrc } from './album.js';"), 'app.js 匯入 album');
ok(appSource.includes("albumUnlocked: ['36626', '36676', '36684', '36623', '36624', '36625']"), 'fresh() 預設解鎖免費圖');
ok(appSource.includes('albumUnlocked:Array.isArray(value.albumUnlocked)'), 'undo 快照正規化 albumUnlocked');
ok(appSource.includes('albumUnlocked: Array.isArray(rawState.albumUnlocked)'), 'normalizeSlot 保留 albumUnlocked');
ok(appSource.includes('albumUnlocked: Array.isArray(source.albumUnlocked)'), 'serializeState 保留 albumUnlocked');
ok(appSource.includes('albumUnlocked:state.albumUnlocked,'), 'applyTurn 記錄 albumUnlocked');
ok(appSource.includes('albumUnlocked:undoBefore.albumUnlocked,'), 'applyTurn 還原 albumUnlocked');
ok(appSource.includes('state.albumUnlocked=safe.albumUnlocked;'), 'restoreTurnUndo 還原 albumUnlocked');
ok(appSource.includes('function unlockAlbum(id)'), 'unlockAlbum helper');
ok(appSource.includes('function renderAlbum()'), 'renderAlbum');
ok(appSource.includes('function openAlbumLightbox(id)'), 'openAlbumLightbox');
ok(appSource.includes('unlockAlbum(\'36685\')'), '稀有 CG 解鎖 36685');
ok(appSource.includes('unlockAlbum(bedroomDecision.artId)'), '臥室場景解鎖對應圖');
ok(appSource.includes('renderAlbum();'), 'render() 呼叫 renderAlbum');

const html = fs.readFileSync(htmlPath, 'utf8');
ok(html.includes('id="albumGrid"'), 'index.html 含 albumGrid');
ok(html.includes('id="albumLightbox"'), 'index.html 含 albumLightbox');

const css = fs.readFileSync(cssPath, 'utf8');
ok(css.includes('.album-grid'), 'style.css 含 .album-grid');
ok(css.includes('.album-lightbox'), 'style.css 含 .album-lightbox');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
