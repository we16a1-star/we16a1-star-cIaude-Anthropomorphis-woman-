'use strict';
// 只允許「聚焦本 App 啟動的 Chrome／Edge 視窗」。
// 不開放任意程式、點擊、鍵盤、剪貼簿或截圖；所有命令都由主程序以固定參數呼叫。
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const ALLOWED_APPS = new Set(['chrome.exe', 'msedge.exe']);
const MAX_PIDS = 12;
const MAX_BUFFER = 4 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15000;

function resolveBinary() {
  const candidates = [];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'agent-desktop', 'agent-desktop.exe'));
  }
  candidates.push(path.join(__dirname, 'vendor', 'agent-desktop', 'agent-desktop.exe'));
  candidates.push(path.join(__dirname, 'assets', 'agent-desktop', 'agent-desktop.exe'));
  return candidates.find(candidate => candidate && fs.existsSync(candidate)) || '';
}

function parseEnvelope(stdout) {
  const text = String(stdout || '').replace(/^\uFEFF/, '').trim();
  if (!text) throw new Error('agent-desktop 沒有回應。');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('agent-desktop 回應格式不正確。');
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!parsed || typeof parsed !== 'object') throw new Error('agent-desktop 回應格式不正確。');
  return parsed;
}

function runCli(args, options = {}) {
  return new Promise((resolve, reject) => {
    const binary = resolveBinary();
    if (!binary) {
      const error = new Error('找不到 agent-desktop；請重新安裝完整版本。');
      error.code = 'AGENT_DESKTOP_MISSING';
      reject(error);
      return;
    }
    execFile(binary, args, {
      timeout: Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: MAX_BUFFER,
      encoding: 'utf8'
    }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || error.message || '').trim();
        const wrapped = new Error(detail || 'agent-desktop 執行失敗。');
        wrapped.code = error.code || 'AGENT_DESKTOP_FAILED';
        wrapped.stdout = stdout;
        reject(wrapped);
        return;
      }
      try {
        resolve(parseEnvelope(stdout));
      } catch (parseError) {
        parseError.stdout = stdout;
        reject(parseError);
      }
    });
  });
}

function normalizePids(values) {
  const pids = [];
  for (const value of Array.isArray(values) ? values : []) {
    const pid = Number(value);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    if (!pids.includes(pid)) pids.push(pid);
    if (pids.length >= MAX_PIDS) break;
  }
  return pids;
}

function isAllowedApp(value) {
  return ALLOWED_APPS.has(String(value || '').trim().toLowerCase());
}

function filterWindows(windows, pids) {
  const allowed = new Set(normalizePids(pids));
  if (!allowed.size) return [];
  return (Array.isArray(windows) ? windows : [])
    .filter(item => item && isAllowedApp(item.app_name) && allowed.has(Number(item.pid)))
    .filter(item => item.visible !== false)
    .sort((a, b) => {
      const focused = Number(Boolean(b.is_focused)) - Number(Boolean(a.is_focused));
      if (focused) return focused;
      return Number(Boolean(a.minimized)) - Number(Boolean(b.minimized));
    });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function listWindows(runner = runCli) {
  const windows = [];
  let firstError = null;
  let success = false;
  for (const appName of ALLOWED_APPS) {
    try {
      const envelope = await runner(['list-windows', '--app', appName]);
      if (envelope && envelope.ok === true) {
        success = true;
        if (Array.isArray(envelope.data)) windows.push(...envelope.data);
      } else if (!firstError) {
        firstError = new Error(envelope?.error?.message || '無法讀取視窗清單。');
      }
    } catch (error) {
      if (!firstError) firstError = error;
    }
  }
  if (!success && firstError) throw firstError;
  return windows;
}

async function focusWindowOnce(runner, windowId) {
  if (windowId === null || windowId === undefined || windowId === '') return null;
  try {
    if (windowId) {
      const restoreEnvelope = await runner(['restore', '--window-id', windowId, '--headed']);
      // Restore may report success even when already normal; ignore failure here.
      void restoreEnvelope;
    }
  } catch {}
  const focused = await runner(['focus-window', '--window-id', windowId, '--headed']);
  if (!focused || focused.ok !== true) {
    throw new Error(focused?.error?.message || '無法聚焦瀏覽器視窗。');
  }
  return focused.data && focused.data.focused ? focused.data.focused : null;
}

async function focusFirstWindow(pids, options = {}) {
  const runner = typeof options.runner === 'function' ? options.runner : runCli;
  const allowedPids = normalizePids(pids);
  if (!allowedPids.length) return {ok: false, error: '找不到可聚焦的自動化瀏覽器。'};
  let windows;
  try {
    windows = await listWindows(runner);
  } catch (error) {
    return {ok: false, error: String(error?.message || error || '無法讀取視窗清單。')};
  }
  const candidates = filterWindows(windows, allowedPids);
  if (!candidates.length) {
    return {ok: false, error: '找不到本 App 啟動的 Chrome／Edge 視窗；請先按「開啟官網並登入」。'};
  }
  const target = candidates.find(item => !item.minimized) || candidates[0];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await sleep(300);
      if (target.minimized && attempt === 0) {
        try { await runner(['restore', '--window-id', target.id, '--headed']); } catch {}
      }
      const focused = await runner(['focus-window', '--window-id', target.id, '--headed']);
      if (!focused || focused.ok !== true) {
        throw new Error(focused?.error?.message || '無法聚焦瀏覽器視窗。');
      }
      const result = focused.data && focused.data.focused ? focused.data.focused : null;
      return {
        ok: true,
        app: target.app_name,
        pid: Number(target.pid),
        title: String(target.title || ''),
        focused: result ? result.is_focused !== false : true
      };
    } catch (error) {
      if (attempt === 0) continue;
      return {ok: false, error: String(error?.message || error || '無法聚焦瀏覽器視窗。')};
    }
  }
  return {ok: false, error: '無法聚焦瀏覽器視窗。'};
}

module.exports = {
  ALLOWED_APPS,
  resolveBinary,
  parseEnvelope,
  normalizePids,
  isAllowedApp,
  filterWindows,
  listWindows,
  focusFirstWindow
};
