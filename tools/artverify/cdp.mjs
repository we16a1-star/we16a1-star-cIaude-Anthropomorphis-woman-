// 演出驗收用 CDP 驅動：用真實時間等待頁面穩定，再取量測與截圖。
//
// 為什麼不用 --dump-dom：
//   portrait-anim.js 會用 WebGL 把 #storyPortrait 換成 canvas.pa-canvas，
//   而 image.decode()／WebGL 初始化是「真實時間」的非同步工作。
//   --virtual-time-budget 會把 setTimeout 快轉完，於是 DOM 在 canvas 換上前就被 dump，
//   量到的立繪是 0×0（或淡入到一半 opacity 0.59）。CDP 用真實時間輪詢，才能量到玩家看到的畫面。
//
// 用法：
//   node cdp.mjs <url> [--shot out.png] [--json out.json] [--width 1264] [--height 781]
//                 [--timeout 20000] [--settle 1200]
//
// 只讀取頁面、只寫出量測檔與截圖，不會修改專案。
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const args = process.argv.slice(2);
const url = args[0];
if (!url) {
  console.error('usage: node cdp.mjs <url> [--shot out.png] [--json out.json] [--width W] [--height H] [--timeout ms] [--settle ms]');
  process.exit(2);
}
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const shot = opt('shot', '');
const jsonOut = opt('json', '');
const width = Number(opt('width', '1264'));
const height = Number(opt('height', '781'));
const timeout = Number(opt('timeout', '20000'));
const settle = Number(opt('settle', '1200'));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'artverify-cdp-'));
const port = 9400 + Math.floor(Math.random() * 400);

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  `--window-size=${width},${height}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-sync',
  '--mute-audio',
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${port}`,
  'about:blank'
], { stdio: 'ignore' });

let ws = null;
let msgId = 0;
const pending = new Map();

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function waitForDevtools() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error('devtools not ready');
}

async function newTarget() {
  const r = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  if (!r.ok) throw new Error('cannot create target: ' + r.status);
  return r.json();
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const sock = new WebSocket(wsUrl);
    sock.onopen = () => resolve(sock);
    sock.onerror = e => reject(new Error('ws error'));
    sock.onmessage = event => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message || 'cdp error'));
        else p.resolve(msg.result);
      }
    };
  });
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'evaluate failed');
  return r.result ? r.result.value : undefined;
}

function cleanup() {
  try { ws && ws.close(); } catch {}
  try { chrome.kill(); } catch {}
  setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 300);
}

(async () => {
  try {
    await waitForDevtools();
    const target = await newTarget();
    ws = await connect(target.webSocketDebuggerUrl);
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url });

    const started = Date.now();
    let state = null;
    while (Date.now() - started < timeout) {
      await sleep(150);
      state = await evaluate(`(() => {
        const m = window.__artMeasure;
        if (!m) return { loaded: false };
        const c = document.querySelector('#tab-story canvas.story-portrait:not(.start-portrait)');
        const i = document.getElementById('storyPortrait');
        const p = c || i;
        return {
          loaded: true,
          ready: !!m.ready,
          done: !!window.__artDone,
          opacity: p ? (parseFloat(getComputedStyle(p).opacity) || 1) : 1,
          portrait: m.portrait ? [m.portrait.w, m.portrait.h] : null,
          el: c ? 'canvas' : 'img'
        };
      })()`).catch(() => null);
      if (state && state.ready && (state.done || state.opacity >= 0.99)) break;
    }
    // 讓最後一幀／進場動畫完全落定
    await sleep(settle);

    const measure = await evaluate('window.__artMeasure ? JSON.stringify(window.__artMeasure) : ""');
    if (jsonOut && measure) writeFileSync(jsonOut, JSON.stringify(JSON.parse(measure), null, 1), 'utf8');
    if (shot) {
      const png = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      writeFileSync(shot, Buffer.from(png.data, 'base64'));
    }
    process.stdout.write(measure || '');
    cleanup();
    process.exit(measure ? 0 : 1);
  } catch (error) {
    console.error(String((error && error.message) || error));
    cleanup();
    process.exit(1);
  }
})();
