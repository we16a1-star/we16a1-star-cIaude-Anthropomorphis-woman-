/**
 * tools/i18n-check.mjs — UI-4 檢查 app.js 所有 uiText('...') 字面鍵在 UI_EN（ui-en.js）是否均有對應翻譯
 *
 * 用法：node tools/i18n-check.mjs
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appPath = join(__dirname, '..', 'app', 'www', 'app.js');
const uiEnPath = join(__dirname, '..', 'app', 'www', 'ui-en.js');

const appSrc = readFileSync(appPath, 'utf8');
const dictSrc = existsSync(uiEnPath) ? readFileSync(uiEnPath, 'utf8') : appSrc;

const startIdx = dictSrc.indexOf('UI_EN = {');
if (startIdx < 0) {
  console.error('Cannot find UI_EN block in ui-en.js or app.js');
  process.exit(2);
}
const endIdx = dictSrc.indexOf('\n};', startIdx);
const uiEnBlock = dictSrc.slice(startIdx, endIdx + 3);

const enKeys = new Set();
const keyRe = /^\s*'((?:\\'|[^'])*)'\s*:/gm;
let km;
while ((km = keyRe.exec(uiEnBlock)) !== null) {
  const unescaped = km[1].replace(/\\'/g, "'").replace(/\\n/g, '\n');
  enKeys.add(unescaped);
}

const callRe = /\buiText\(\s*'((?:\\'|[^'])*)'\s*\)/g;
const missing = [];
const seen = new Set();
let cm;
while ((cm = callRe.exec(appSrc)) !== null) {
  const raw = cm[1].replace(/\\'/g, "'").replace(/\\n/g, '\n');
  if (seen.has(raw)) continue;
  seen.add(raw);
  if (!enKeys.has(raw)) {
    missing.push(raw);
  }
}

console.log(JSON.stringify({
  dictSource: existsSync(uiEnPath) ? 'app/www/ui-en.js' : 'app/www/app.js',
  totalUiTextLiterals: seen.size,
  totalUiEnKeys: enKeys.size,
  missingCount: missing.length,
  missing
}, null, 2));

if (missing.length > 0) {
  process.exit(1);
}
