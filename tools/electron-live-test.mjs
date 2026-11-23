#!/usr/bin/env node
/**
 * tools/electron-live-test.mjs — Windows 11 Electron 桌面版（4.6.46）真實實機端到端實測腳本
 *
 * 安全隔離設計：
 * - 直接以 `electron.exe` 載入打包產物 `win-unpacked/resources/app.asar`，避免觸發 `app.isPackaged`
 *   去改寫使用者真實桌面捷徑，並在獨立 `--user-data-dir` 執行，於 finally 完整結束程序樹並清除暫存。
 * - 僅對子程序注入暫時 `OPENAI_API_KEY` 與 `OPENAI_BASE_URL`（指向本機模擬上游），絕不寫入系統環境變數、
 *   不碰觸使用者正式 `%APPDATA%` 與真實 API 憑證。
 *
 * 實測關卡（A ～ G）：
 *   A. Preload 橋接與內嵌 Express 後端健檢（/api/health、/api/debug/status、/api/bgm/list）
 *   B. 標題畫面真實點擊手勢解鎖沉浸 BGM（無 --autoplay-policy 作弊旗標）
 *   C. 設定頁 Windows DPAPI 金鑰庫新增 OpenAI 帳號＋/api/model-check（8/8 含 tender）
 *   D. 角色頁快速建卡（「林曉」）＋創意工坊 Harness 插件安裝＋7 項後端/系統診斷
 *   E. 正式開始故事（真實 /api/story、多角色名牌切換、story-tender.webp、BGM 自動切換曲目）
 *   F. 無魔法陣 HD 夜景背景（1536×864）＋光影粒子＋沉浸音樂盒（9 首曲目選曲）
 *   G. 場景選單「API 生成並匯入舞台」（真實 POST /api/image → #sceneGeneratedImage）
 */

import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const ELECTRON_EXE = process.env.CLAUDE_ELECTRON_EXE
  || path.join(os.tmpdir(), 'opencode', 'claude-g43-npm', 'node_modules', 'electron', 'dist', 'electron.exe');
const ASAR_PATH = process.env.CLAUDE_ASAR_PATH
  || path.join(os.tmpdir(), 'opencode', 'claude-dist-4.6.46', 'win-unpacked', 'resources', 'app.asar');
const SAMPLE_PNG = path.join(ROOT, 'app', 'www', 'assets', 'g43-start-character.png');
const SCREENSHOT_DIR = process.env.CLAUDE_LIVE_SHOT_DIR
  || 'C:\\Users\\shiny\\.gemini\\antigravity\\brain\\9cc567f7-3a99-4a8c-a318-9161d2a3f26e\\scratch';
const DESKTOP_SHORTCUT = path.join(os.homedir(), 'OneDrive', '桌面', 'Claude娘 - Windows 11 電腦版.lnk');

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

  send(method, params = {}, timeoutMs = 20000) {
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

  async waitFor(fnExpr, timeoutMs = 15000, pollMs = 150, label = 'condition') {
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

async function main() {
  assert.ok(fs.existsSync(ELECTRON_EXE), `找不到 electron.exe：${ELECTRON_EXE}`);
  assert.ok(fs.existsSync(ASAR_PATH), `找不到 4.6.46 app.asar：${ASAR_PATH}`);

  const shortcutMtimeBefore = readShortcutMtime(DESKTOP_SHORTCUT);
  const tempProfileDir = path.join(os.tmpdir(), 'opencode', `live-electron-profile-${Date.now()}`);
  fs.mkdirSync(tempProfileDir, { recursive: true });

  const samplePngB64 = fs.readFileSync(SAMPLE_PNG).toString('base64');
  const upstreamLogs = { probes: [], stories: [], images: [], unknown: [] };

  // 1. 啟動本機模擬上游 OpenAI 相容 API 伺服器（零外部網路或扣費）
  const mockUpstream = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch {}

      if (req.url === '/v1/responses') {
        const inputText = String(body.input || '');
        const isProbe = inputText.includes('模型相容性測試') || inputText.includes('compatibility test');
        if (isProbe) {
          upstreamLogs.probes.push({ ts: Date.now(), model: body.model, instructionsLen: String(body.instructions || '').length });
          const probeObj = {
            narration: '雨聲沿著古籍書庫的彩窗滑落，她輕輕接過你遞來的熱紅茶，垂下眼簾抿唇微笑。',
            affectionDelta: 1,
            choices: ['問她在讀哪一卷典籍', '坐到木桌對面', '替她點亮黃銅檯燈', '遞上一塊司康餅', '聊聊窗外的春雨', '翻開書頁邊的金色註記', '安靜陪著她品茶'],
            ending: false,
            endingText: null,
            memory: '雨夜在書桌旁遞上一杯溫熱紅茶。',
            emotion: 'tender',
            intensity: 2
          };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            output_text: `<think>確認 8 項 JSON 契約與 tender 情緒</think>\n\`\`\`json\n${JSON.stringify(probeObj)}\n\`\`\``,
            usage: { input_tokens: 180, output_tokens: 130 }
          }));
          return;
        }

        upstreamLogs.stories.push({ ts: Date.now(), model: body.model, input: inputText, instructions: String(body.instructions || '') });
        const storyObj = {
          narration: '<image:雨夜古籍閱覽室暖黃燭火與熱紅茶><emotion:tender>Claude娘：「你回來得剛好，這壺紅茶還溫著呢。」\n林曉：「我把修補好的《未竟錄》附頁也一起帶來了，請兩位過目。」\n（她接過微溫的書頁，琥珀色眼眸彎起溫柔的弧度，書庫角落的燭火靜靜晃動。）',
          affectionDelta: 2,
          choices: [
            '坐到 Claude娘身旁一起檢視附頁',
            '先替林曉倒一杯熱紅茶暖手',
            '細看書頁邊的金色星芒註記',
            '輕聲問她剛才是否在等我',
            '替她披上奶油白肩披別著涼',
            '聊聊今晚古籍室的雨聲與書香',
            '溫柔稱讚她的細心與專注'
          ],
          ending: false,
          endingText: null,
          memory: '雨夜古籍閱覽室裡，林曉送來修補後的《未竟錄》附頁，與 Claude娘一同細讀品茶。',
          emotion: 'tender',
          intensity: 2,
          eventFlag: null,
          spokenEn: [
            'You came back just in time; this pot of black tea is still warm.',
            'I brought the restored appendix of the Unfinished Chronicle for you both to inspect.'
          ]
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          output_text: `<think>先檢核多角色林曉與茶香插件指示</think>\n\`\`\`json\n${JSON.stringify(storyObj)}\n\`\`\``,
          usage: { input_tokens: 510, output_tokens: 240, input_tokens_details: { cached_tokens: 120 } }
        }));
        return;
      }

      if (req.url === '/v1/images/generations') {
        upstreamLogs.images.push({ ts: Date.now(), model: body.model, size: body.size, prompt: String(body.prompt || '') });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [{ b64_json: samplePngB64 }] }));
        return;
      }

      upstreamLogs.unknown.push({ method: req.method, url: req.url });
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Unknown mock upstream route: ${req.method} ${req.url}` }));
    });
  });

  await new Promise((r) => mockUpstream.listen(0, '127.0.0.1', r));
  const mockPort = mockUpstream.address().port;
  const cdpPort = await getFreePort();

  const childEnv = {
    ...process.env,
    OPENAI_API_KEY: 'sk-local-live-test-only',
    OPENAI_BASE_URL: `http://127.0.0.1:${mockPort}/v1`
  };

  const electronStdout = [];
  const electronStderr = [];
  const runtimeErrors = [];
  const consoleErrors = [];
  const httpErrors = [];
  const loadedUrls = new Map();
  const dialogsOpened = [];
  const gateResults = [];
  const screenshots = [];

  const launchT0 = Date.now();
  const child = spawn(
    ELECTRON_EXE,
    [ASAR_PATH, `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${tempProfileDir}`],
    { env: childEnv, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  child.stdout?.on('data', (d) => electronStdout.push(String(d)));
  child.stderr?.on('data', (d) => electronStderr.push(String(d)));

  let cdp = null;
  try {
    // 等待 splash-image.html 完成轉址，直到出現帶 apiBase 的 index.html 主視窗
    let target = null;
    const deadline = Date.now() + 28000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`Electron 提早結束 (code=${child.exitCode})\nSTDERR:\n${electronStderr.join('')}`);
      }
      try {
        const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`, { signal: AbortSignal.timeout(1500) });
        const list = await res.json();
        target = list.find((t) => t.type === 'page' && String(t.url).includes('index.html') && String(t.url).includes('apiBase='));
        if (target?.webSocketDebuggerUrl) break;
      } catch {}
      await sleep(250);
    }
    assert.ok(target?.webSocketDebuggerUrl, `在 28s 內未偵測到 Electron index.html 目標\nSTDERR:\n${electronStderr.join('')}`);
    const cdpFoundMs = Date.now() - launchT0;

    cdp = new CdpClient(target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');

    cdp.on('Runtime.exceptionThrown', (p) => {
      const txt = p?.exceptionDetails?.exception?.description || p?.exceptionDetails?.text || JSON.stringify(p);
      runtimeErrors.push(txt);
    });
    cdp.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') {
        const msg = (p.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
        consoleErrors.push(msg);
      }
    });
    cdp.on('Network.responseReceived', (p) => {
      const url = String(p?.response?.url || '');
      const status = Number(p?.response?.status || 0);
      loadedUrls.set(url, status);
      if (status >= 400) {
        httpErrors.push({ status, url, mimeType: p?.response?.mimeType || '' });
      }
    });
    cdp.on('Network.loadingFailed', (p) => {
      if (p?.canceled || p?.errorText === 'net::ERR_ABORTED') return;
      httpErrors.push({ status: 0, url: String(p?.requestId || ''), errorText: String(p?.errorText || 'loadingFailed') });
    });
    cdp.on('Page.javascriptDialogOpening', async (p) => {
      dialogsOpened.push({ type: p.type, message: p.message });
      try {
        await cdp.send('Page.handleJavaScriptDialog', { accept: true });
      } catch {}
    });

    await cdp.waitFor(
      `() => document.readyState === 'complete' && Boolean(window.__bgmPlayer) && Boolean(window.__claudePlugins)`,
      15000,
      150,
      'app bundle & window.__bgmPlayer ready'
    );
    const coldBootMs = Date.now() - launchT0;
    const winBounds = await cdp.eval(`({ w: window.innerWidth, h: window.innerHeight })`);
    console.log(`[BOOT] 4.6.46 Electron 已就緒 (${cdpFoundMs} ms 找到主頁 / ${coldBootMs} ms 完全載入, viewport=${winBounds.w}x${winBounds.h})`);

    // ─── 關卡 A：Preload 橋接與內嵌 Express 後端健康檢核 ───
    const gateA = await cdp.eval(`(async () => {
      const qs = new URLSearchParams(location.search);
      const apiBase = qs.get('apiBase') || '';
      const apiToken = qs.get('apiToken') || '';
      const desktopOk = Boolean(window.claudeDesktop && window.claudeDesktop.isDesktop);
      const headers = apiToken ? { 'X-Desktop-Token': apiToken } : {};
      const t0 = performance.now();
      const [hRes, dRes, bRes] = await Promise.all([
        fetch(apiBase + '/api/health', { headers }),
        fetch(apiBase + '/api/debug/status', { headers }),
        fetch(apiBase + '/api/bgm/list', { headers })
      ]);
      const tMs = Math.round(performance.now() - t0);
      const health = await hRes.json();
      const debugStatus = await dRes.json();
      const bgmList = await bRes.json();
      return {
        desktopOk,
        apiBase,
        hasToken: apiToken.length >= 16,
        latencyMs: tMs,
        healthStatus: hRes.status,
        emotionsCount: Array.isArray(health.emotions) ? health.emotions.length : 0,
        hasTenderEmotion: Array.isArray(health.emotions) && health.emotions.includes('tender'),
        imageGenCap: Boolean(health.capabilities?.imageGen),
        bgmListCap: Boolean(health.capabilities?.bgmList),
        openaiProfiles: health.profiles?.openai || [],
        debugStatusCode: dRes.status,
        apiVersion: debugStatus.apiVersion,
        debugBgmCount: debugStatus.bgmCount,
        bgmStatusCode: bRes.status,
        bgmCount: bgmList.count,
        bgmTotalMb: bgmList.totalMb
      };
    })()`);
    assert.equal(gateA.desktopOk, true, 'window.claudeDesktop.isDesktop 應為 true');
    assert.equal(gateA.hasToken, true, '應注入 desktop apiToken');
    assert.equal(gateA.healthStatus, 200);
    assert.equal(gateA.emotionsCount, 10, '應完整包含 10 種情緒');
    assert.equal(gateA.hasTenderEmotion, true);
    assert.equal(gateA.imageGenCap, true);
    assert.equal(gateA.bgmListCap, true);
    assert.equal(gateA.apiVersion, '2.1-harness');
    assert.equal(gateA.bgmCount, 9);
    assert.ok(gateA.bgmTotalMb <= 25, `BGM 總大小過大：${gateA.bgmTotalMb} MB`);
    gateResults.push({ gate: 'A. Preload & 內嵌 Express 後端', status: 'PASS', detail: `10 情緒 · ${gateA.bgmCount} 首 BGM (${gateA.bgmTotalMb} MB) · API=${gateA.apiBase} (${gateA.latencyMs} ms)` });
    console.log(`[PASS] ${gateResults.at(-1).gate} -> ${gateResults.at(-1).detail}`);

    // ─── 關卡 B：標題畫面真實點擊手勢解鎖沉浸 BGM ───
    const safePt = await cdp.eval(`(() => {
      const stage = document.querySelector('#tab-story .vn-stage') || document.body;
      const r = stage.getBoundingClientRect();
      const candidates = [
        [r.left + r.width * 0.88, r.top + r.height * 0.28],
        [r.left + r.width * 0.5, r.top + r.height * 0.14],
        [r.left + 32, r.top + r.height * 0.5]
      ];
      for (const [x, y] of candidates) {
        const el = document.elementFromPoint(x, y);
        if (!el || !el.closest('button,a,input,select,textarea,label')) return { x, y, tag: el?.tagName || 'none' };
      }
      return { x: r.left + 20, y: r.top + r.height * 0.2, tag: 'fallback' };
    })()`);
    await cdp.mouseClick(safePt.x, safePt.y);
    await cdp.waitFor(
      `() => {
        const s = window.__bgmPlayer?.getSnapshot?.();
        return Boolean(s && s.enabled && s.isPlaying && s.activeTrackId);
      }`,
      6000,
      150,
      '標題畫面首次點擊後自動解鎖播放 BGM'
    );
    await sleep(300);
    const bgmTitleSnap = await cdp.eval(`window.__bgmPlayer.getSnapshot()`);
    const pillTextTitle = await cdp.eval(`document.getElementById('vnBgmNowPlayingBtn')?.textContent?.trim() || ''`);
    const shot0 = await cdp.screenshot('live-0-title.png');
    screenshots.push(shot0);
    gateResults.push({ gate: 'B. 標題畫面真實點擊解鎖 BGM', status: 'PASS', detail: `track=${bgmTitleSnap.activeTrackId} (${bgmTitleSnap.activeTrackTitle}), pill="${pillTextTitle}"` });
    console.log(`[PASS] ${gateResults.at(-1).gate} -> ${gateResults.at(-1).detail}`);

    const ensureStoryTab = async () => {
      const onStory = await cdp.eval(`document.getElementById('tab-story')?.classList.contains('active') === true`);
      if (!onStory) {
        await cdp.clickCenter('.tab-panel.active .game-back-btn', '返回故事');
        await cdp.waitFor(`() => document.getElementById('tab-story')?.classList.contains('active') === true`, 5000, 100, '切換回故事頁');
      }
    };
    const navigateToTab = async (tabName, label) => {
      await ensureStoryTab();
      const menuOpen = await cdp.eval(`document.getElementById('gameMenu')?.hidden === false`);
      if (!menuOpen) {
        await cdp.clickCenter('#gameMenuBtn', '選單鈕');
        await cdp.waitFor(`() => document.getElementById('gameMenu')?.hidden === false`, 3000, 80, '開啟遊戲選單');
      }
      await cdp.clickCenter(`#gameMenu .tab-btn[data-tab="${tabName}"]`, label);
      await cdp.waitFor(`() => document.getElementById(${JSON.stringify('tab-' + tabName)})?.classList.contains('active') === true`, 5000, 100, `切換至 ${tabName}`);
    };

    // ─── 關卡 C：設定頁 DPAPI 金鑰庫新增 OpenAI API 帳號＋/api/model-check 8/8 PASS ───
    await navigateToTab('settings', '設定分頁');
    await cdp.clickCenter('#enableApiAiBtn', '改回 API 連線');
    await sleep(150);
    await cdp.clickCenter('#addAiAccountBtn', '新增 AI 帳號');
    await sleep(150);
    await cdp.eval(`(() => {
      const prov = document.getElementById('aiProviderSelect');
      prov.value = 'openai';
      prov.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('aiAccountName').value = '本機實測 OpenAI';
      document.getElementById('aiApiKey').value = 'sk-local-live-test-only';
    })()`);
    await cdp.clickCenter('#saveAiAccountBtn', '儲存並切換 OpenAI 帳號');
    await cdp.waitFor(
      `() => document.getElementById('aiConnectionForm')?.hidden === true && String(document.getElementById('aiAccountProvider')?.textContent || '').includes('OpenAI')`,
      8000,
      150,
      'DPAPI 保存 OpenAI 帳號並切換成功'
    );

    const mcT0 = Date.now();
    await cdp.clickCenter('#modelCheckBtn', '模型通用性檢測');
    await cdp.waitFor(
      `() => {
        const el = document.getElementById('modelCheckStatus');
        const txt = String(el?.textContent || '');
        return !el?.hidden && (txt.includes('通過') || txt.includes('失敗') || txt.includes('發現問題'));
      }`,
      12000,
      150,
      '/api/model-check 結果顯示'
    );
    const mcMs = Date.now() - mcT0;
    const mcStatusText = await cdp.eval(`document.getElementById('modelCheckStatus')?.textContent || ''`);
    const mcCheckLines = mcStatusText.split('\n').filter((l) => l.trim().startsWith('✓'));
    assert.ok(mcStatusText.includes('模型通用性檢測通過'), `模型檢測應通過，實際：\n${mcStatusText}`);
    assert.equal(mcCheckLines.length, 8, `應通過 8 項契約檢查，實際 ${mcCheckLines.length}：\n${mcStatusText}`);
    gateResults.push({ gate: 'C. Windows DPAPI 金鑰庫＋/api/model-check', status: 'PASS', detail: `8/8 checks PASS (含 tender, UI ${mcMs} ms, 上游探測 ${upstreamLogs.probes.length} 次)` });
    console.log(`[PASS] ${gateResults.at(-1).gate} -> ${gateResults.at(-1).detail}`);

    // ─── 關卡 D：角色卡快速建卡（「林曉」）＋Harness 插件安裝＋工坊 7/7 診斷 ───
    await navigateToTab('profile', '角色分頁');
    await sleep(150);
    await cdp.clickCenter('#sheetQuickCardBtn', '快速建卡按鈕');
    await sleep(120);
    await cdp.eval(`(() => {
      document.getElementById('quickCardName').value = '林曉';
      document.getElementById('quickCardTagline').value = '深夜來訪的古籍修復師';
      document.getElementById('quickCardPersonality').value = '溫和冷靜、熟知絕版書裝幀與金箔修補，與 Claude 娘是多年舊識。';
      document.getElementById('quickCardStyle').value = '語氣平靜有禮，偶爾輕聲吐槽。';
      document.getElementById('quickCardFirstMes').value = '<emotion:curious>林曉：「打擾了，請問《未竟錄》的附頁還在這層書庫嗎？」';
    })()`);
    await cdp.clickCenter('#quickCardCreateBtn', '建立並加入故事');
    await cdp.waitFor(
      `() => String(document.getElementById('sheetCardIoStatus')?.textContent || '').includes('林曉')`,
      5000,
      100,
      '快速建卡建立林曉'
    );
    const cardStatusMsg = await cdp.eval(`document.getElementById('sheetCardIoStatus')?.textContent?.trim() || ''`);

    await navigateToTab('workshop', '創意工坊分頁');
    await sleep(200);
    const beforePlugins = await cdp.eval(`window.__claudePlugins.list().length`);
    await cdp.eval(`(() => { const d = document.getElementById('vnPluginPanel'); if (d && !d.open) d.open = true; })()`);
    await sleep(120);
    await cdp.clickCenter('#vnPluginSampleBtn', '填入範例插件');
    await sleep(80);
    await cdp.clickCenter('#vnPluginAddBtn', '安裝範例插件');
    await cdp.waitFor(
      `() => window.__claudePlugins.list().length >= ${beforePlugins + 1}`,
      5000,
      100,
      'Harness 插件數量增加'
    );
    const pluginSummaryText = await cdp.eval(`document.getElementById('vnPluginSummary')?.textContent?.trim() || ''`);

    const pluginFileHiddenOk = await cdp.eval(`getComputedStyle(document.getElementById('vnPluginImportFile')).display === 'none'`);
    assert.equal(pluginFileHiddenOk, true, '#vnPluginImportFile[hidden] 必須維持 display:none');

    await cdp.eval(`(() => {
      const d = document.getElementById('vnDebugPanel');
      if (d) { d.open = true; d.scrollIntoView({ behavior: 'instant', block: 'start' }); }
    })()`);
    await sleep(250);
    await cdp.clickCenter('#vnDebugRunBtn', '執行後端與系統診斷');
    await cdp.waitFor(
      `() => document.querySelectorAll('#vnDebugChecks .vn-debug-check-row').length === 7`,
      8000,
      120,
      '7 項後端與系統診斷結果輸出'
    );
    const diagReport = await cdp.eval(`(() => {
      const statusText = document.getElementById('vnDebugStatus')?.textContent?.trim() || '';
      const rows = [...document.querySelectorAll('#vnDebugChecks .vn-debug-check-row')].map((r) => ({
        status: r.querySelector('.vn-debug-pill')?.textContent?.trim() || '',
        label: r.querySelector('strong')?.textContent?.trim() || '',
        detail: r.querySelector('.vn-debug-detail')?.textContent?.trim() || ''
      }));
      return { statusText, rows };
    })()`);
    const okRows = diagReport.rows.filter((r) => r.status === 'OK').length;
    const warnRows = diagReport.rows.filter((r) => r.status !== 'OK');

    await cdp.clickCenter('#vnDebugModelProbeBtn', '探測模型介面 (/api/model-check)');
    await cdp.waitFor(
      `() => {
        const txt = String(document.getElementById('vnDebugStatus')?.textContent || '');
        return txt.startsWith('[PASS]') || txt.startsWith('[WARN]');
      }`,
      10000,
      120,
      '工坊 /api/model-check 探測回傳'
    );
    const workshopProbeText = await cdp.eval(`document.getElementById('vnDebugStatus')?.textContent?.trim() || ''`);
    const shot4 = await cdp.screenshot('live-4-workshop-debug-7ok.png');
    screenshots.push(shot4);

    if (okRows < 7 || !workshopProbeText.startsWith('[PASS]')) {
      gateResults.push({
        gate: 'D. 多角色建卡＋Harness 插件＋工坊診斷',
        status: 'FAIL',
        detail: `林曉="${cardStatusMsg}" · ${pluginSummaryText} · 工坊診斷 ${okRows}/7 OK · probe="${workshopProbeText}"（未通過項目：${warnRows.map((w) => `${w.label}=${w.status}(${w.detail})`).join('; ')}）`
      });
      console.log(`[FAIL] ${gateResults.at(-1).gate} -> ${gateResults.at(-1).detail}`);
      throw new Error(`關卡 D 失敗：工坊診斷 ${okRows}/7 OK, probe="${workshopProbeText}"：\n` + diagReport.rows.map((r) => `  [${r.status}] ${r.label}: ${r.detail}`).join('\n'));
    }
    gateResults.push({ gate: 'D. 多角色建卡＋Harness 插件＋工坊 7/7 診斷', status: 'PASS', detail: `林曉啟用 · ${pluginSummaryText} · 診斷 7/7 OK · ${workshopProbeText}` });
    console.log(`[PASS] ${gateResults.at(-1).gate} -> ${gateResults.at(-1).detail}`);

    // ─── 關卡 E：正式開始故事（真實 /api/story、多角色名牌切換、story-tender.webp、BGM 切歌） ───
    await cdp.clickCenter('#tab-workshop .game-back-btn', '返回故事頁');
    await sleep(200);
    await cdp.clickCenter('#startStoryBtn', '開始故事');
    await cdp.waitFor(
      `() => !document.getElementById('tab-story')?.classList.contains('story-empty') && document.querySelectorAll('#choices .choice-btn').length >= 7`,
      15000,
      150,
      '故事開局完成並顯示 7 個選項'
    );
    await sleep(300);

    // 檢核模擬上游有完整收到角色卡「林曉」（位於 instructions 系統角色設定）與範例插件「紅茶」指令（位於 input）
    assert.ok(upstreamLogs.stories.length >= 1, '應實際呼叫過一次上游 /v1/responses 開局');
    const storyPayload = upstreamLogs.stories[0];
    assert.ok(
      storyPayload.instructions.includes('林曉') || storyPayload.input.includes('林曉'),
      '送往上遊的系統或對話提示詞應包含「林曉」角色卡設定'
    );
    assert.ok(storyPayload.input.includes('紅茶') || storyPayload.instructions.includes('紅茶'), '送往上遊的提示詞應包含茶香插件 directive');

    // 觀察並點擊 #dialogueText 推進 VN 逐句演出，擷取切換過程中的說話人名牌、情緒與 .pa-face 表情窗
    const seenSpeakers = new Set();
    const seenEmotions = new Set();
    const seenPaFaces = new Set();
    for (let step = 0; step < 6; step++) {
      const sp = await cdp.eval(`(() => {
        const pf = document.querySelector('.pa-face');
        return {
          name: document.getElementById('dialogueName')?.textContent?.trim() || '',
          role: document.getElementById('dialogueName')?.getAttribute('data-speaker-role') || '',
          emotion: window.__storyEmotion || '',
          paFace: pf ? (pf.dataset.face || '') : '',
          paBg: pf ? getComputedStyle(pf).backgroundImage : '',
          text: document.getElementById('dialogueText')?.textContent?.trim() || ''
        };
      })()`);
      if (sp.name) seenSpeakers.add(sp.name);
      if (sp.emotion) seenEmotions.add(sp.emotion);
      if (sp.paFace) seenPaFaces.add(sp.paFace);
      if (seenSpeakers.has('Claude娘') && seenSpeakers.has('林曉') && seenEmotions.has('tender') && seenPaFaces.size > 0) break;
      await cdp.clickCenter('#dialogueText', '點擊對話框推進逐句演出');
      await sleep(160);
    }
    await sleep(600); // 給 portrait-anim 足夠時間完成圖片載入與淡入
    const postStory = await cdp.eval(`(() => {
      const paFace = document.querySelector('.pa-face, #paFace, [data-pa-face]');
      const cs = paFace ? getComputedStyle(paFace) : null;
      const rect = paFace ? paFace.getBoundingClientRect() : null;
      const tenderPerf = performance.getEntriesByType('resource').some((r) => r.name.includes('story-tender.webp'));
      return {
        emotion: window.__storyEmotion,
        choicesCount: document.querySelectorAll('#choices .choice-btn').length,
        bgm: window.__bgmPlayer?.getSnapshot?.(),
        pillText: document.getElementById('vnBgmNowPlayingBtn')?.textContent?.trim() || '',
        tenderPerf,
        paFaceInfo: paFace ? {
          className: paFace.className,
          faceData: paFace.dataset.face || '',
          bg: cs.backgroundImage,
          opacity: cs.opacity,
          display: cs.display,
          zIndex: cs.zIndex,
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          w: Math.round(rect.width),
          h: Math.round(rect.height)
        } : null
      };
    })()`);
    console.log('[INFO] Gate E paFace telemetry:', JSON.stringify(postStory.paFaceInfo), 'seenPaFaces:', [...seenPaFaces]);
    const tenderLoaded = postStory.tenderPerf || [...loadedUrls.entries()].some(([u, st]) => u.includes('story-tender.webp') && st < 400);
    assert.ok(seenSpeakers.has('Claude娘') && seenSpeakers.has('林曉'), `應觀察到多角色名牌切換（Claude娘 & 林曉），實際觀察：${[...seenSpeakers].join(', ')}`);
    assert.ok(seenEmotions.has('tender'), `應觀察到物語情緒包含 tender，實際：${[...seenEmotions].join(', ')}`);
    assert.ok(tenderLoaded, '瀏覽器資源紀錄應成功載入 story-tender.webp');
    assert.ok(postStory.paFaceInfo && postStory.paFaceInfo.w > 0 && Number(postStory.paFaceInfo.opacity) > 0, `對話窗左上 .pa-face 表情圓窗必須實際顯示，實際：${JSON.stringify(postStory.paFaceInfo)}`);
    assert.equal(postStory.bgm?.isPlaying, true, 'BGM 在故事中應保持播放');
    assert.notEqual(postStory.bgm?.activeTrackId, 'bgm-title', '進故事後 BGM 應由標題曲切入書庫／溫柔情緒曲');

    const shot1 = await cdp.screenshot('live-1-story-api-turn.png');
    screenshots.push(shot1);
    gateResults.push({
      gate: 'E. 真實 /api/story＋多角色 VN＋tender 表情＋BGM 切歌',
      status: 'PASS',
      detail: `選項 ${postStory.choicesCount} · 名牌=[${[...seenSpeakers].join('→')}] · 情緒=[${[...seenEmotions].join('→')}] · 表情窗=[${[...seenPaFaces].join('→')}](${postStory.paFaceInfo.w}×${postStory.paFaceInfo.h}) · BGM=${postStory.bgm.activeTrackTitle}`
    });
    console.log(`[PASS] ${gateResults.at(-1).gate} -> ${gateResults.at(-1).detail}`);

    // ─── 關卡 F：無魔法陣 HD 夜景背景＋光影粒子＋沉浸音樂盒（9 首曲目切歌） ───
    await cdp.clickCenter('#gameMenuBtn', '選單鈕');
    await sleep(120);
    await cdp.clickCenter('#gmMenuSceneBtn', '場景與插圖');
    await sleep(150);
    await cdp.clickCenter('#bgScenePresetBar .bg-preset-pill[data-scene-key="night"]', '切換夜間圖書館背景');
    await sleep(300);
    await cdp.clickCenter('#gameMenuCloseBtn', '關閉遊戲選單');
    await sleep(350);

    const nightCheck = await cdp.eval(`(() => {
      const img = document.getElementById('storyDefaultArt');
      const light = document.getElementById('sceneLightLayer');
      const canvas = document.getElementById('sceneAtmosphereCanvas');
      const stage = document.querySelector('#tab-story .vn-stage');
      const cRect = canvas ? canvas.getBoundingClientRect() : { width: 0, height: 0 };
      const lStyle = light ? getComputedStyle(light) : null;
      return {
        src: String(img?.currentSrc || img?.src || ''),
        complete: Boolean(img?.complete),
        naturalWidth: img?.naturalWidth || 0,
        naturalHeight: img?.naturalHeight || 0,
        sceneKey: stage?.dataset?.sceneKey || '',
        hasLight: Boolean(light && lStyle && lStyle.display !== 'none'),
        canvasW: Math.round(cRect.width),
        canvasH: Math.round(cRect.height)
      };
    })()`);
    assert.ok(nightCheck.src.includes('g43-cg-magic-light.jpg'), `夜景圖應載入 g43-cg-magic-light.jpg，實際：${nightCheck.src}`);
    assert.equal(nightCheck.naturalWidth, 1536, `夜景圖寬度應為 1536，實際：${nightCheck.naturalWidth}`);
    assert.equal(nightCheck.naturalHeight, 864, `夜景圖高度應為 864，實際：${nightCheck.naturalHeight}`);
    assert.ok(nightCheck.hasLight && nightCheck.canvasW > 0 && nightCheck.canvasH > 0, `光影與粒子畫布應生效：${JSON.stringify(nightCheck)}`);

    // 開啟音樂盒並切換 9 首之一（雨夜曲）
    await cdp.clickCenter('#vnBgmNowPlayingBtn', '開啟圖書館沉浸音樂盒');
    await sleep(200);
    const jukeboxInfo = await cdp.eval(`(() => {
      const pop = document.getElementById('vnBgmJukeboxPopover');
      const btns = [...document.querySelectorAll('#vnBgmTrackList .vn-bgm-track-item')];
      return {
        open: pop && !pop.hidden,
        count: btns.length,
        titles: btns.map((b) => b.querySelector('.vn-bgm-track-title')?.textContent?.trim() || '')
      };
    })()`);
    assert.equal(jukeboxInfo.open, true);
    assert.equal(jukeboxInfo.count, 9, `音樂盒應列出 9 首曲目，實際：${jukeboxInfo.count}`);
    await cdp.clickCenter('#vnBgmTrackList .vn-bgm-track-item:nth-child(6)', '切換至雨夜燭火曲目');
    await sleep(350);
    const jukeAfter = await cdp.eval(`({
      snap: window.__bgmPlayer?.getSnapshot?.(),
      status: document.getElementById('vnBgmBoxStatus')?.textContent?.trim() || ''
    })`);
    assert.equal(jukeAfter.snap?.manualTrackKey, 'rainy-night', `manualTrackKey 應切換為 rainy-night，實際：${jukeAfter.snap?.manualTrackKey}`);
    const shot2 = await cdp.screenshot('live-2-night-bgm-jukebox.png');
    screenshots.push(shot2);
    await cdp.clickCenter('#vnBgmJukeboxClose', '關閉音樂盒');
    await sleep(120);
    gateResults.push({
      gate: 'F. 無魔法陣 HD 夜景＋光影粒子＋沉浸音樂盒',
      status: 'PASS',
      detail: `g43-cg-magic-light.jpg (${nightCheck.naturalWidth}×${nightCheck.naturalHeight}) · canvas=${nightCheck.canvasW}×${nightCheck.canvasH} · 9 首曲目可切 (${jukeAfter.snap.activeTrackTitle})`
    });
    console.log(`[PASS] ${gateResults.at(-1).gate} -> ${gateResults.at(-1).detail}`);

    // ─── 關卡 G：API 生圖並自動匯入舞台（真實 POST /api/image） ───
    await cdp.clickCenter('#gameMenuBtn', '選單鈕');
    await sleep(120);
    await cdp.clickCenter('#gmMenuSceneBtn', '場景與插圖');
    await sleep(150);
    await cdp.eval(`(() => {
      const p = document.getElementById('apiImageProvider');
      p.value = 'openai';
      p.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('apiImageModel').value = 'gpt-image-1';
      document.getElementById('apiImagePromptInput').value = '雨夜古籍閱覽室暖黃燭火與熱紅茶';
    })()`);
    const imgT0 = Date.now();
    await cdp.clickCenter('#apiImageGenerateBtn', 'API 生成並匯入舞台');
    await cdp.waitFor(
      `() => {
        const img = document.getElementById('sceneGeneratedImage');
        return Boolean(img && !img.hidden && img.complete && img.naturalWidth > 0);
      }`,
      12000,
      150,
      '#sceneGeneratedImage 自動匯入並顯示於舞台'
    );
    const imgMs = Date.now() - imgT0;
    const imgUiStatus = await cdp.eval(`document.getElementById('apiImageGenStatus')?.textContent?.trim() || ''`);
    const stageImgInfo = await cdp.eval(`(() => {
      const img = document.getElementById('sceneGeneratedImage');
      return { naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, hasSceneClass: document.getElementById('tab-story')?.classList.contains('has-scene-image') };
    })()`);
    await cdp.clickCenter('#gameMenuCloseBtn', '關閉遊戲選單');
    await sleep(250);
    const shot3 = await cdp.screenshot('live-3-api-image-stage.png');
    screenshots.push(shot3);
    assert.ok(upstreamLogs.images.length >= 1, '應確實送出 /v1/images/generations 請求');
    assert.ok(stageImgInfo.naturalWidth > 0 && stageImgInfo.hasSceneClass);
    gateResults.push({
      gate: 'G. API 生圖並自動匯入舞台 (/api/image)',
      status: 'PASS',
      detail: `${stageImgInfo.naturalWidth}×${stageImgInfo.naturalHeight} 已顯示於舞台 (${imgMs} ms, "${imgUiStatus}")`
    });
    console.log(`[PASS] ${gateResults.at(-1).gate} -> ${gateResults.at(-1).detail}`);

    // ─── 最終總結輸出 ───
    const shortcutMtimeAfter = readShortcutMtime(DESKTOP_SHORTCUT);
    assert.equal(shortcutMtimeAfter, shortcutMtimeBefore, '安全警訊：桌面捷徑時間戳記不應被測試改動！');

    console.log('\n================ Electron 4.6.46 實機端到端實測報告 ================');
    console.log(`冷啟動就緒：${coldBootMs} ms (CDP ${cdpFoundMs} ms)`);
    console.log(`視窗大小：${winBounds.w}×${winBounds.h}`);
    console.log(`Runtime Exceptions：${runtimeErrors.length} | Console Errors：${consoleErrors.length} | HTTP >=400 / LoadFail：${httpErrors.length} | Dialogs：${dialogsOpened.length}`);
    for (const g of gateResults) console.log(`  [${g.status}] ${g.gate}: ${g.detail}`);
    console.log('截圖輸出：');
    for (const s of screenshots) console.log(`  - ${s}`);
    if (runtimeErrors.length) console.log('Runtime Errors:', runtimeErrors);
    if (consoleErrors.length) console.log('Console Errors:', consoleErrors);
    if (httpErrors.length) console.log('HTTP/Load Errors:', httpErrors);

    assert.equal(runtimeErrors.length, 0, 'Runtime exceptions 必須為 0');
    assert.equal(consoleErrors.length, 0, 'Console errors 必須為 0');
    assert.equal(httpErrors.length, 0, 'HTTP >=400 / 資源載入失敗必須為 0');
    console.log('\n結果：7/7 實機實測關卡全部 PASS（0 錯誤 / 0 404）！');
  } finally {
    if (cdp) {
      try {
        await cdp.screenshot('live-final-on-exit.png').catch(() => {});
      } catch {}
      cdp.close();
    }
    killProcessTree(child.pid);
    await new Promise((r) => mockUpstream.close(r));
    try {
      fs.rmSync(tempProfileDir, { recursive: true, force: true });
    } catch {
      await sleep(350);
      try { fs.rmSync(tempProfileDir, { recursive: true, force: true }); } catch {}
    }
  }
}

main().catch((err) => {
  console.error('\n[FAIL] 實機實測未通過：', err?.stack || err);
  process.exitCode = 1;
});
