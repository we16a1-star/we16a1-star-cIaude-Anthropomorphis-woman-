// 4.6.43 G30 徽章圖標產生器
// 來源：
//   assets/icon-g30-badge.png  G30 source zip 的 app/assets/icon.png（1024 徽章框）
//   assets/icon-g43-preview.png 4.6.42 目前圖標（1024 立繪來源）
// 幾何：
//   G30 徽章圓心 (512,483)、內圓半徑 325
//   G43 立繪內圓半徑 448、角色底部 y=940
//   縮放 325/(940-512)=0.759345…，讓立繪底部切齊 G30 圓環內緣
// 執行：在含 assets/ 與 node_modules/sharp 的目錄執行
//   node scripts/build-g30-badge-icon.cjs
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const A = (name) => path.join(ROOT, 'assets', name);

const G30_BADGE = A('icon-g30-badge.png');
const G43_PORTRAIT = A('icon-g43-preview.png');
const MASTER = A('icon.png');
const ICON_ONLY = A('icon-only.png');
const AVATAR = A('desktop-avatar.png');
const ICO = A('icon.ico');

const CX = 512;
const CY = 483;
const R = 325;
const SRC_R = 448;
const CHAR_BOTTOM = 940;
const SCALE = R / (CHAR_BOTTOM - 512);
const DST = Math.round(SRC_R * 2 * SCALE);

function ico(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(entries.length * 16);
  let offset = 6 + entries.length * 16;
  entries.forEach((e, i) => {
    const o = i * 16;
    dir.writeUInt8(e.size === 256 ? 0 : e.size, o);
    dir.writeUInt8(e.size === 256 ? 0 : e.size, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(e.data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += e.data.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.data)]);
}

(async () => {
  for (const f of [G30_BADGE, G43_PORTRAIT]) {
    if (!fs.existsSync(f)) throw new Error('missing source: ' + f);
  }

  // 1. 取 G43 立繪內圓，縮放到 G30 徽章開口大小
  const disc = await sharp(G43_PORTRAIT)
    .extract({ left: 512 - SRC_R, top: 512 - SRC_R, width: SRC_R * 2, height: SRC_R * 2 })
    .resize(DST, DST, { kernel: 'lanczos3' })
    .png()
    .toBuffer();

  // 2. 以 G30 內圓遮罩，避免蓋到棕色圓環
  const mask = Buffer.from(
    `<svg width="${DST}" height="${DST}" xmlns="http://www.w3.org/2000/svg"><circle cx="${DST / 2}" cy="${DST / 2}" r="${R - 1}" fill="#fff"/></svg>`
  );
  const masked = await sharp(disc)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  // 3. 合成到 G30 徽章
  const master = await sharp(G30_BADGE)
    .composite([{ input: masked, left: Math.round(CX - DST / 2), top: Math.round(CY - DST / 2) }])
    .png()
    .toBuffer();

  fs.writeFileSync(MASTER, master);
  fs.writeFileSync(ICON_ONLY, master);
  fs.writeFileSync(AVATAR, await sharp(master).resize(512, 512, { kernel: 'lanczos3' }).png().toBuffer());

  // 4. 七尺寸 ICO（PNG 內嵌，與 G30 原圖標相同尺寸集）
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const entries = [];
  for (const size of sizes) {
    let img = sharp(master).resize(size, size, { kernel: 'lanczos3' });
    if (size <= 48) img = img.sharpen({ sigma: 0.5 });
    entries.push({ size, data: await img.png().toBuffer() });
  }
  fs.writeFileSync(ICO, ico(entries));

  console.log(`master ${master.length} bytes`);
  console.log(`avatar ${fs.statSync(AVATAR).size} bytes`);
  console.log(`ico ${fs.statSync(ICO).size} bytes; sizes ${sizes.join(',')}`);
  console.log(`scale ${SCALE.toFixed(6)}; disc ${DST}px; origin (${Math.round(CX - DST / 2)},${Math.round(CY - DST / 2)})`);
})();
