#!/usr/bin/env node
/**
 * tools/electron-gemini-web-test.mjs — 4.6.46 桌面版「Google Gemini 網頁版（免費配額）」真實端到端實測腳本
 *
 * 安全與合規原則：
 * 1. 直接以 `electron.exe` 載入打包好的 `4.6.46 app.asar`，不啟動包裝 .exe，絕不改動桌面或開始功能表捷徑。
 * 2. Electron 使用獨立暫存 `--user-data-dir`，不覆寫使用者正式存檔；僅透過 `CLAUDE_AUTOMATION_PROFILE`
 *    沿用既有的 Gemini 專用瀏覽器設定檔（`%APPDATA%\claude-novel-windows11\web-automation-browser-r24`）。
 * 3. 若偵測到未登入 Google、需要選帳號、CAPTCHA 或免費配額限制，立即停止並清楚回報實況與截圖，
 *    絕不繞過登入或驗證機制。
 */

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ELECTRON_EXE = process.env.CLAUDE_ELECTRON_EXE
  || path.join(os.tmpdir(), 'opencode', 'claude-g43-npm', 'node_modules', 'electron', 'dist', 'electron.exe');
const ASAR_PATH = process.env.CLAUDE_ASAR_PATH
  || path.join(os.tmpdir(), 'opencode', 'claude-dist-4.6.46', 'win-unpacked', 'resources', 'app.asar');
const SCREENSHOT_DIR = process.env.CLAUDE_LIVE_SHOT_DIR
  || 'C:\\Users\\shiny\\.gemini\\antigravity\\brain\\9cc567f7-3a99-4a8c-a318-9161d2a3f26e\\scratch';
const DESKTOP_SHORTCUT = path.join(os.homedir(), 'OneDrive', '桌面', 'Claude娘 - Windows 11 電腦版.lnk');
const GEMINI_PROFILE_DIR = process.env.CLAUDE_AUTOMATION_PROFILE
  || path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'claude-novel-windows11', 'web-automation-browser-r24');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', (ev) => reject(new Error(`CDP WebSocket 錯誤：${ev?.message || 'unknown'}`)));
      ws.addEventListener('message', (ev) => {
        let msg;
        try {
          msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
        } catch {
          return;
        }
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve: res, reject: rej } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) rej(new Error(`CDP ${msg.method || msg.id}: ${msg.error.message || JSON.stringify(msg.error)}`));
          else res(msg.result);
        } else if (msg.method) {
          const list = this.handlers.get(msg.method);
          if (list) {
            for (const fn of list) {
              try { fn(msg.params || {}); } catch {}
            }
          }
        }
      });
    });
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, new Set());
    this.handlers.get(method).add(fn);
    return () => this.handlers.get(method)?.delete(fn);
  }

  send(method, params = {}, timeoutMs = 25000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP 呼叫逾時：${method}`));
        }
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); }
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression, awaitPromise = true) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true
    });
    if (res?.exceptionDetails) {
      const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'evaluate 例外';
      throw new Error(`頁面腳本錯誤：${desc}`);
    }
    return res?.result?.value;
  }

  async waitFor(fnExpr, timeoutMs = 20000, pollMs = 200, label = 'condition') {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const ok = await this.eval(`Boolean((${fnExpr})())`);
      if (ok) return;
      await sleep(pollMs);
    }
    throw new Error(`等待逾時 (${timeoutMs}ms)：${label}`);
  }

  async clickCenter(selector, label = selector) {
    const rect = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, disabled: Boolean(el.disabled) };
    })()`);
    assert.ok(rect && rect.w > 0 && rect.h > 0, `找不到可見元件可點擊：${label} (${selector})`);
    assert.ok(!rect.disabled, `元件目前處於 disabled 無法點擊：${label} (${selector})`);
    await this.mouseClick(rect.x, rect.y);
    return rect;
  }

  async mouseClick(x, y) {
    const px = Math.round(x);
    const py = Math.round(y);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py, button: 'none' });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: px, y: py, button: 'left', clickCount: 1 });
  }

  async screenshot(filename) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const outPath = path.join(SCREENSHOT_DIR, filename);
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(outPath, Buffer.from(res.data, 'base64'));
    return outPath;
  }

  close() {
    try { this.ws?.close(); } catch {}
  }
}

function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    } catch {}
  }
  try { process.kill(pid, 'SIGKILL'); } catch {}
}

function readShortcutMtime(filePath) {
  try { return fs.statSync(filePath).mtimeMs; } catch { return null; }
}

async function readAutomationChromeStatus(profileDir) {
  let port = 4462;
  try {
    const raw = fs.readFileSync(path.join(profileDir, 'DevToolsActivePort'), 'utf8');
    const p = Number(String(raw).split(/\r?\n/)[0]);
    if (Number.isInteger(p) && p > 0) port = p;
  } catch {}
  try {
    const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) })).json();
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) })).json();
    return { port, webSocketDebuggerUrl: ver.webSocketDebuggerUrl, tabs };
  } catch {
    return null;
  }
}

async function closeAutomationBrowserGracefully(profileDir) {
  const info = await readAutomationChromeStatus(profileDir);
  if (!info?.webSocketDebuggerUrl) return false;
  let ws;
  try {
    ws = new WebSocket(info.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });
    ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    await sleep(500);
    return true;
  } catch {
    return false;
  } finally {
    try { ws?.close(); } catch {}
  }
}

async function main() {
  assert.ok(fs.existsSync(ELECTRON_EXE), `找不到 electron.exe：${ELECTRON_EXE}`);
  assert.ok(fs.existsSync(ASAR_PATH), `找不到 4.6.46 app.asar：${ASAR_PATH}`);
  assert.ok(fs.existsSync(GEMINI_PROFILE_DIR), `找不到既有 Gemini 設定檔：${GEMINI_PROFILE_DIR}`);

  const shortcutMtimeBefore = readShortcutMtime(DESKTOP_SHORTCUT);
  const tempProfileDir = path.join(os.tmpdir(), 'opencode', `live-gemini-web-profile-${Date.now()}`);
  fs.mkdirSync(tempProfileDir, { recursive: true });
  const cdpPort = await getFreePort();

  const childEnv = {
    ...process.env,
    CLAUDE_AUTOMATION_PROFILE: GEMINI_PROFILE_DIR
  };
  delete childEnv.GEMINI_API_KEY;
  delete childEnv.GOOGLE_API_KEY;
  delete childEnv.OPENAI_API_KEY;

  const runtimeErrors = [];
  const consoleErrors = [];
  const httpErrors = [];
  const electronStderr = [];
  const screenshots = [];
  let blockedKeepChromeForUser = false;

  const launchT0 = Date.now();
  const child = spawn(
    ELECTRON_EXE,
    [ASAR_PATH, `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${tempProfileDir}`],
    { env: childEnv, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  child.stderr?.on('data', (d) => electronStderr.push(String(d)));

  let cdp = null;
  try {
    let target = null;
    const bootDeadline = Date.now() + 28000;
    while (Date.now() < bootDeadline) {
      if (child.exitCode !== null) {
        throw new Error(`Electron 提早結束 (code=${child.exitCode})\n${electronStderr.join('')}`);
      }
      try {
        const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`, { signal: AbortSignal.timeout(1500) })).json();
        target = list.find((t) => t.type === 'page' && String(t.url).includes('index.html') && String(t.url).includes('apiBase='));
        if (target?.webSocketDebuggerUrl) break;
      } catch {}
      await sleep(250);
    }
    assert.ok(target?.webSocketDebuggerUrl, '在 28s 內未偵測到 Electron 主視窗');

    cdp = new CdpClient(target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');

    cdp.on('Runtime.exceptionThrown', (p) => {
      runtimeErrors.push(p?.exceptionDetails?.exception?.description || p?.exceptionDetails?.text || 'exception');
    });
    cdp.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') {
        consoleErrors.push((p.args || []).map((a) => a.value ?? a.description ?? a.type).join(' '));
      }
    });
    cdp.on('Network.responseReceived', (p) => {
      const status = Number(p?.response?.status || 0);
      if (status >= 400) httpErrors.push({ status, url: String(p?.response?.url || '') });
    });
    cdp.on('Page.javascriptDialogOpening', async (p) => {
      console.log(`[DIALOG] ${p.type}: ${p.message}`);
      try { await cdp.send('Page.handleJavaScriptDialog', { accept: true }); } catch {}
    });

    await cdp.waitFor(
      `() => document.readyState === 'complete' && Boolean(window.__bgmPlayer) && Boolean(window.claudeDesktop?.isDesktop)`,
      15000,
      150,
      'Electron 渲染器與 Preload 就緒'
    );
    console.log(`[BOOT] 4.6.46 Electron 已就緒 (${Date.now() - launchT0} ms)`);

    const ensureStoryTab = async () => {
      const onStory = await cdp.eval(`document.getElementById('tab-story')?.classList.contains('active') === true`);
      if (!onStory) {
        await cdp.clickCenter('.tab-panel.active .game-back-btn', '返回故事');
        await cdp.waitFor(`() => document.getElementById('tab-story')?.classList.contains('active') === true`, 5000, 100, '切換回故事頁');
      }
    };
    const navigateToTab = async (tabName, label) => {
      await ensureStoryTab();
      if (await cdp.eval(`document.getElementById('gameMenu')?.hidden !== false`)) {
        await cdp.clickCenter('#gameMenuBtn', '選單鈕');
        await cdp.waitFor(`() => document.getElementById('gameMenu')?.hidden === false`, 3000, 80, '開啟選單');
      }
      await cdp.clickCenter(`#gameMenu .tab-btn[data-tab="${tabName}"]`, label);
      await cdp.waitFor(`() => document.getElementById(${JSON.stringify('tab-' + tabName)})?.classList.contains('active') === true`, 5000, 100, `切換至 ${tabName}`);
    };

    // ─── 關卡 1：點擊標題畫面解鎖 BGM ───
    const safePt = await cdp.eval(`(() => {
      const stage = document.querySelector('#tab-story .vn-stage') || document.body;
      const r = stage.getBoundingClientRect();
      return { x: r.left + r.width * 0.88, y: r.top + r.height * 0.25 };
    })()`);
    await cdp.mouseClick(safePt.x, safePt.y);
    await cdp.waitFor(`() => Boolean(window.__bgmPlayer?.getSnapshot?.()?.isPlaying)`, 6000, 150, '標題點擊解鎖 BGM');
    console.log('[PASS] 關卡 1：標題點擊已解鎖 BGM ->', await cdp.eval(`window.__bgmPlayer.getSnapshot().activeTrackTitle`));

    // ─── 關卡 2：設定頁檢查／開啟 Google Gemini 網頁版（沿用 r24 設定檔） ───
    await navigateToTab('settings', '設定分頁');
    await sleep(200);
    await cdp.eval(`(() => {
      const sel = document.getElementById('webAiProvider');
      if (sel && sel.value !== 'gemini') {
        sel.value = 'gemini';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const ask = document.getElementById('askAccountToggle');
      if (ask && ask.checked) {
        ask.checked = false;
        ask.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
    await cdp.clickCenter('#webOpenLoginBtn', '開啟官網並登入 (啟動 r24 自動化 Chrome)');
    await cdp.waitFor(
      `() => !document.getElementById('webCheckConnectionBtn')?.disabled && String(document.getElementById('webConnectionStatus')?.textContent || '') !== '正在開啟官網…'`,
      38000,
      300,
      '等待自動化 Chrome 開啟 Gemini 官網'
    );
    await sleep(2500);
    await cdp.clickCenter('#webCheckConnectionBtn', '檢查登入與接入');
    await cdp.waitFor(
      `() => !document.getElementById('webCheckConnectionBtn')?.disabled && String(document.getElementById('webConnectionStatus')?.textContent || '') !== '檢查中…'`,
      15000,
      200,
      '讀取 Gemini 接入狀態'
    );
    const connText = await cdp.eval(`document.getElementById('webConnectionStatus')?.textContent?.trim() || ''`);
    const shotConn = await cdp.screenshot('live-gemini-web-conn.png');
    screenshots.push(shotConn);
    console.log(`[CONN] #webConnectionStatus = ${connText}`);

    const chromeInfo = await readAutomationChromeStatus(GEMINI_PROFILE_DIR);
    const geminiTabInfo = chromeInfo?.tabs?.find((t) => /gemini\.google\.com|accounts\.google\.com/i.test(String(t.url || '')));
    console.log('[INFO] 自動化瀏覽器分頁:', geminiTabInfo ? `${geminiTabInfo.url} (${geminiTabInfo.title})` : '無');

    const looksBlocked = /登入頁|請先登入|尚未登入|AccountChooser|ServiceLogin/i.test(connText)
      || !connText.includes('已接入：輸入框正常');
    if (looksBlocked) {
      blockedKeepChromeForUser = true;
      const blockedShot = await cdp.screenshot('live-gemini-web-blocked.png');
      screenshots.push(blockedShot);
      console.log('\n[BLOCKED_LOGIN_OR_GATE] Google Gemini 網頁版目前尚未完成登入或出現驗證閘門，依規範停止不硬闖。');
      console.log('原因摘要：', connText);
      console.log('截圖已存：', blockedShot);
      return;
    }
    console.log('[PASS] 關卡 2：Google Gemini 網頁版（r24）已成功接入且輸入框就緒！');

    // ─── 關卡 3：真實 Gemini 網頁配額第 1 回合（開局故事＋自動送出＋自動接回） ───
    await ensureStoryTab();
    await sleep(200);
    const t1Start = Date.now();
    await cdp.clickCenter('#startStoryBtn', '開始故事 (送出至真實 Gemini 網頁版)');

    let lastStageLog = '';
    const turn1Deadline = Date.now() + 120000;
    let turn1Ok = false;
    while (Date.now() < turn1Deadline) {
      const probe = await cdp.eval(`(() => {
        const st = document.getElementById('tab-story');
        const note = document.getElementById('webAutoStatusNote')?.textContent?.trim() || '';
        const err = document.querySelector('.pending-turn > p')?.textContent?.trim() || '';
        const reply = document.getElementById('webAiReplyInput')?.value?.trim() || '';
        const choices = document.querySelectorAll('#choices .choices-list .choice-btn[data-i], #choices .choice-btn[data-i]').length;
        return {
          inStory: Boolean(st && !st.classList.contains('story-empty')),
          choices,
          note,
          err,
          hasReplyDraft: reply.length > 0
        };
      })()`);
      if (probe.note && probe.note !== lastStageLog) {
        lastStageLog = probe.note;
        console.log(`[Turn1 自動化狀態 ${Math.round((Date.now() - t1Start) / 1000)}s] ${probe.note}`);
      }
      if (/登入|驗證|CAPTCHA|手動|停止|異常|已達/i.test(probe.note)) {
        blockedKeepChromeForUser = /登入|驗證|CAPTCHA/i.test(probe.note);
        const bShot = await cdp.screenshot('live-gemini-web-blocked.png');
        screenshots.push(bShot);
        throw new Error(`第 1 回合遭遇官網或自動化中斷：${probe.note} (err=${probe.err})`);
      }
      if (probe.inStory && probe.choices >= 7) {
        turn1Ok = true;
        break;
      }
      await sleep(1500);
    }
    assert.ok(turn1Ok, '120 秒內未完成第 1 回合 Gemini 自動接回');
    const turn1Ms = Date.now() - t1Start;

    // 推進逐句顯示看完整正文
    for (let i = 0; i < 6; i++) {
      const done = await cdp.eval(`!document.getElementById('dialogueText')?.classList.contains('is-line-playing')`);
      if (done) break;
      await cdp.clickCenter('#dialogueText', '快進第 1 回合對話');
      await sleep(120);
    }
    await sleep(600);

    const t1Data = await cdp.eval(`(() => {
      const pf = document.querySelector('.pa-face');
      const r = pf ? pf.getBoundingClientRect() : null;
      const op = pf ? Number(getComputedStyle(pf).opacity) : 0;
      return {
        text: document.getElementById('dialogueText')?.textContent?.trim() || '',
        speaker: document.getElementById('dialogueName')?.textContent?.trim() || '',
        emotion: window.__storyEmotion || '',
        choices: [...document.querySelectorAll('#choices .choices-list .choice-btn[data-i], #choices .choice-btn[data-i]')].map(b => b.textContent.trim()),
        paFace: pf ? { face: pf.dataset.face || '', w: Math.round(r.width), h: Math.round(r.height), op } : null,
        bgm: window.__bgmPlayer?.getSnapshot?.()
      };
    })()`);
    assert.ok(t1Data.text.length >= 60, `第 1 回合 Gemini 回覆內容過短：${t1Data.text.length}`);
    assert.equal(t1Data.choices.length, 7, `第 1 回合應有 7 個選項，實際 ${t1Data.choices.length}`);
    assert.ok(t1Data.paFace && t1Data.paFace.w > 0 && t1Data.paFace.op > 0, '第 1 回合應顯示 .pa-face 表情圓窗');
    assert.equal(t1Data.bgm?.isPlaying, true, '第 1 回合 BGM 應保持播放');
    assert.notEqual(t1Data.bgm?.activeTrackId, 'bgm-title', '進故事後 BGM 應切換出標題曲');

    const shotT1 = await cdp.screenshot('live-gemini-web-turn1.png');
    screenshots.push(shotT1);
    console.log(`[PASS] 關卡 3（第 1 回合，${turn1Ms} ms）：字數=${t1Data.text.length}、情緒=${t1Data.emotion}、表情=${t1Data.paFace.face}、BGM=${t1Data.bgm.activeTrackTitle}`);
    console.log(`       選項[0] = ${t1Data.choices[0]}`);

    // ─── 關卡 4：真實 Gemini 網頁配額第 2 回合（點選第 1 個選項延續同一對話） ───
    const t2Start = Date.now();
    await cdp.clickCenter('#choices .choice-btn[data-i="0"]', '選擇第 1 個劇情選項');
    let lastStage2 = '';
    const turn2Deadline = Date.now() + 120000;
    let turn2Ok = false;
    while (Date.now() < turn2Deadline) {
      const probe = await cdp.eval(`(() => {
        const pending = Boolean(document.querySelector('#choices .pending-turn'));
        const note = document.getElementById('webAutoStatusNote')?.textContent?.trim() || '';
        const choices = document.querySelectorAll('#choices .choices-list .choice-btn[data-i], #choices .choice-btn[data-i]').length;
        const txt = document.getElementById('dialogueText')?.textContent?.trim() || '';
        return { pending, note, choices, txt };
      })()`);
      if (probe.note && probe.note !== lastStage2) {
        lastStage2 = probe.note;
        console.log(`[Turn2 自動化狀態 ${Math.round((Date.now() - t2Start) / 1000)}s] ${probe.note}`);
      }
      if (/登入|驗證|CAPTCHA|手動|停止|異常|已達/i.test(probe.note)) {
        blockedKeepChromeForUser = /登入|驗證|CAPTCHA/i.test(probe.note);
        const bShot = await cdp.screenshot('live-gemini-web-blocked.png');
        screenshots.push(bShot);
        throw new Error(`第 2 回合遭遇官網或自動化中斷：${probe.note}`);
      }
      if (!probe.pending && probe.choices === 7 && probe.txt && probe.txt !== t1Data.text) {
        turn2Ok = true;
        break;
      }
      await sleep(1500);
    }
    assert.ok(turn2Ok, '120 秒內未完成第 2 回合 Gemini 自動接回');
    const turn2Ms = Date.now() - t2Start;

    for (let i = 0; i < 6; i++) {
      const done = await cdp.eval(`!document.getElementById('dialogueText')?.classList.contains('is-line-playing')`);
      if (done) break;
      await cdp.clickCenter('#dialogueText', '快進第 2 回合對話');
      await sleep(120);
    }
    await sleep(500);

    const t2Data = await cdp.eval(`(() => ({
      text: document.getElementById('dialogueText')?.textContent?.trim() || '',
      emotion: window.__storyEmotion || '',
      affection: document.getElementById('affVal')?.textContent?.trim() || '',
      choices: [...document.querySelectorAll('#choices .choices-list .choice-btn[data-i], #choices .choice-btn[data-i]')].map(b => b.textContent.trim()),
      bgm: window.__bgmPlayer?.getSnapshot?.()
    }))()`);
    assert.ok(t2Data.text.length >= 60 && t2Data.text !== t1Data.text, '第 2 回合應取得全新的 Gemini 故事正文');
    assert.equal(t2Data.choices.length, 7);

    const shotT2 = await cdp.screenshot('live-gemini-web-turn2.png');
    screenshots.push(shotT2);

    const shortcutMtimeAfter = readShortcutMtime(DESKTOP_SHORTCUT);
    assert.equal(shortcutMtimeAfter, shortcutMtimeBefore, '桌面捷徑不應被測試改動');

    console.log('\n================ Gemini 網頁配額（4.6.46）實機端到端實測報告 ================');
    console.log(`Runtime Exceptions：${runtimeErrors.length} | Console Errors：${consoleErrors.length} | HTTP >=400：${httpErrors.length}`);
    console.log(`[PASS] 關卡 1：標題點擊解鎖 BGM`);
    console.log(`[PASS] 關卡 2：r24 自動化 Chrome 接入 Google Gemini 網頁版成功`);
    console.log(`[PASS] 關卡 3：真實 Gemini 第 1 回合 (${turn1Ms} ms) · 正文 ${t1Data.text.length} 字 · 情緒=${t1Data.emotion} · 7 選項 · BGM=${t1Data.bgm.activeTrackTitle}`);
    console.log(`[PASS] 關卡 4：真實 Gemini 第 2 回合 (${turn2Ms} ms) · 正文 ${t2Data.text.length} 字 · 情緒=${t2Data.emotion} · 好感=${t2Data.affection} · 7 選項`);
    for (const s of screenshots) console.log(`截圖：${s}`);
  } finally {
    cdp?.close();
    killProcessTree(child.pid);
    if (!blockedKeepChromeForUser) {
      await closeAutomationBrowserGracefully(GEMINI_PROFILE_DIR);
    }
    try {
      fs.rmSync(tempProfileDir, { recursive: true, force: true });
    } catch {
      await sleep(350);
      try { fs.rmSync(tempProfileDir, { recursive: true, force: true }); } catch {}
    }
  }
}

main().catch((err) => {
  console.error('\n[FAIL] Gemini 網頁配額實測未通過：', err?.stack || err);
  process.exitCode = 1;
});
