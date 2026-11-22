#!/usr/bin/env node
// 開發版 E2E／截圖流程：使用外部 agent-desktop，不進玩家安裝包。
// 用法：
//   node scripts/agent-desktop-smoke.mjs --game "C:\\path\\to\\app.exe" --out "C:\\tmp\\shot.png" --width 1264 --height 781
//   node scripts/agent-desktop-smoke.mjs --game "C:\\path\\electron.exe" --arg "C:\\path\\appdir" --app electron.exe --out shot.png
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const out = { args: [], width: 1264, height: 781, keep: false, headed: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--game') out.game = argv[++i];
    else if (a === '--app') out.app = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--width') out.width = Number(argv[++i]);
    else if (a === '--height') out.height = Number(argv[++i]);
    else if (a === '--arg') out.args.push(argv[++i]);
    else if (a === '--exe') out.exe = argv[++i];
    else if (a === '--keep') out.keep = true;
    else if (a === '--no-headed') out.headed = false;
  }
  return out;
}

function run(exe, args) {
  try {
    const stdout = execFileSync(exe, args, { encoding: 'utf8', timeout: 60000, windowsHide: true });
    return JSON.parse(String(stdout).trim().replace(/^\uFEFF/, ''));
  } catch (error) {
    let parsed = null;
    try { parsed = JSON.parse(String(error.stdout || '').trim().replace(/^\uFEFF/, '')); } catch {}
    const err = new Error(parsed?.error?.message || error.message || 'agent-desktop 執行失敗。');
    err.code = parsed?.error?.code || error.code;
    err.raw = parsed || error.stdout;
    throw err;
  }
}

const opts = parseArgs(process.argv.slice(2));
const exe = opts.exe || process.env.AGENT_DESKTOP_EXE || 'C:\\Users\\shiny\\AppData\\Local\\Programs\\agent-desktop\\agent-desktop.exe';
if (!opts.game) { console.error('缺少 --game'); process.exit(2); }
if (!existsSync(opts.game)) { console.error('找不到遊戲執行檔：' + opts.game); process.exit(2); }
const appName = opts.app || path.basename(opts.game);
const headedFlag = opts.headed ? ['--headed'] : [];

const summary = { game: opts.game, app: appName, width: opts.width, height: opts.height };
try {
  const launchArgs = ['launch', opts.game, '--activate', '--timeout', '30000', ...opts.args.flatMap(a => ['--arg', a])];
  summary.launch = run(exe, launchArgs);
  // resize
  try {
    summary.resize = run(exe, ['resize-window', '--app', appName, '--width', String(opts.width), '--height', String(opts.height), ...headedFlag]);
  } catch (e) { summary.resize = { ok: false, error: String(e.message) }; }
  // wait a bit for render
  execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},1500)'], { timeout: 5000 });
  // screenshot
  if (opts.out) {
    const shotArgs = ['screenshot', opts.out, '--app', appName, ...headedFlag];
    summary.screenshot = run(exe, shotArgs);
    summary.screenshotPath = opts.out;
  }
  if (!opts.keep) {
    try { summary.close = run(exe, ['close-app', appName]); } catch (e) { summary.close = { ok: false, error: String(e.message) }; }
  }
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: String(error.message), summary }, null, 2));
  process.exit(1);
}