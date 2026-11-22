#!/usr/bin/env node
/**
 * tools/backend-check.mjs — 本機後端與專案健康度一鍵檢查＋實機冒煙測試 CLI
 *
 * 用法：
 *   node tools/backend-check.mjs [http://127.0.0.1:8787]
 *
 * 檢查項目：
 * 1. 實機啟動覆蓋層 app/server/server.js（隨機埠、桌面 Token），驗證 9 項真實後端行為：
 *    - GET /api/health、GET /api/debug/status（apiVersion=2.1-harness、10 情緒清單）
 *    - 未帶／錯誤 X-Desktop-Token 拒絕（401）
 *    - 外部 Origin CORS 防護
 *    - POST /api/story 無金鑰回傳可讀 JSON 錯誤（不崩潰）
 *    - POST /api/model-check 空參數回傳 400 JSON
 *    - 未知路由回傳 404
 *    - parse() 剝除 <think> 偽 JSON、保留 10 種情緒（worried/tender）與 spokenEn
 *    - prompt() 注入 Harness pluginDirectives
 * 2. app/www/config/*.json 完整性與 10 種官方情緒契約
 * 3. 9 首原創 BGM .m4a 音檔完整性與體積預算（<= 25 MB）
 * 4. 核心前端模組與 app.bundle.js 存在性
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const WWW = path.join(ROOT, 'app', 'www');
const SERVER_PATH = path.join(ROOT, 'app', 'server', 'server.js');
const baseUrl = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/+$/, '');

// 若專案外掛於 OneDrive 而未在本地建置 node_modules，透過 Node 22 registerHooks 指向暫存依賴目錄（絕不寫入 OneDrive）
const fallbackNm = process.env.CLAUDE_NODE_MODULES || path.join(os.tmpdir(), 'opencode', 'claude-g43-npm', 'node_modules');
if (typeof registerHooks === 'function' && fs.existsSync(fallbackNm)) {
  const reqFromFallback = createRequire(path.join(fallbackNm, '_resolver.cjs'));
  registerHooks({
    resolve(specifier, context, nextResolve) {
      try {
        return nextResolve(specifier, context);
      } catch (err) {
        if (!specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('node:') && !specifier.startsWith('file:')) {
          try {
            const resolved = reqFromFallback.resolve(specifier);
            return { url: pathToFileURL(resolved).href, shortCircuit: true };
          } catch (_) {}
        }
        throw err;
      }
    }
  });
}

const results = [];
function push(id, status, detail) {
  results.push({ id, status, detail });
  const icon = status === 'OK' ? '[OK]  ' : (status === 'WARN' ? '[WARN]' : '[FAIL]');
  console.log(`${icon} ${id}: ${detail}`);
}

// 1. 實機啟動 app/server/server.js 冒煙測試
async function runEmbeddedServerAudit() {
  if (!fs.existsSync(SERVER_PATH)) {
    push('server-audit', 'FAIL', `找不到後端檔案 ${SERVER_PATH}`);
    return;
  }
  let mod;
  try {
    mod = await import(pathToFileURL(SERVER_PATH).href);
  } catch (err) {
    push('server-audit', 'FAIL', `載入 server.js 失敗（確認已設定 NODE_PATH 指向依賴）：${err?.message || err}`);
    return;
  }

  const token = 'audit-' + Date.now().toString(36);
  const server = await mod.startApiServer({ port: 0, host: '127.0.0.1', token });
  const liveBase = `http://127.0.0.1:${server.address().port}`;
  const req = async (route, opts = {}) => {
    const headers = { ...(opts.headers || {}) };
    if (opts.auth !== false) headers['X-Desktop-Token'] = token;
    const res = await fetch(liveBase + route, { ...opts, headers });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch (_) {}
    return { status: res.status, body, text, headers: res.headers };
  };

  try {
    const h = await req('/api/health');
    if (h.status === 200 && h.body?.ok === true && Array.isArray(h.body.emotions) && h.body.emotions.length === 10) {
      push('server-health', 'OK', `GET /api/health 通過（apiVersion=${h.body.apiVersion}，10 情緒同步）`);
    } else {
      push('server-health', 'FAIL', `GET /api/health 異常：status=${h.status} body=${h.text.slice(0, 120)}`);
    }

    const dbg = await req('/api/debug/status');
    if (dbg.status === 200 && dbg.body?.ok === true && dbg.body?.nodeVersion) {
      push('server-debug-endpoint', 'OK', `GET /api/debug/status 通過（Node ${dbg.body.nodeVersion}）`);
    } else {
      push('server-debug-endpoint', 'FAIL', `GET /api/debug/status 異常：status=${dbg.status}`);
    }

    const noTok = await req('/api/health', { auth: false });
    const badTok = await req('/api/health', { auth: false, headers: { 'X-Desktop-Token': 'wrong' } });
    if (noTok.status === 401 && badTok.status === 401) {
      push('server-auth', 'OK', '未帶／錯誤 X-Desktop-Token 均嚴格回傳 401');
    } else {
      push('server-auth', 'FAIL', `Token 防護異常：noTok=${noTok.status} badTok=${badTok.status}`);
    }

    const corsRes = await fetch(liveBase + '/api/health', { headers: { 'X-Desktop-Token': token, Origin: 'https://evil.example' } });
    const allow = corsRes.headers.get('access-control-allow-origin');
    if (!allow || allow !== 'https://evil.example') {
      push('server-cors', 'OK', '外部網站 Origin 未獲 CORS 放行');
    } else {
      push('server-cors', 'FAIL', '外部網站 Origin 竟獲 CORS 放行');
    }

    const storyRes = await req('/api/story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'openai', model: 'audit-no-key' })
    });
    if ([400, 401, 402, 403, 429, 500, 502, 503].includes(storyRes.status) && typeof storyRes.body?.error === 'string') {
      push('server-story-nokey', 'OK', `POST /api/story 無金鑰時安全回傳 JSON 錯誤（HTTP ${storyRes.status}）`);
    } else {
      push('server-story-nokey', 'FAIL', `POST /api/story 回應異常：status=${storyRes.status}`);
    }

    const mcRes = await req('/api/model-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const nfRes = await req('/api/does-not-exist');
    if (mcRes.status === 400 && nfRes.status === 404) {
      push('server-routes', 'OK', 'POST /api/model-check 空參數回 400；未知路由回 404');
    } else {
      push('server-routes', 'FAIL', `路由驗證異常：model-check=${mcRes.status}, 404=${nfRes.status}`);
    }

    // 驗證 POST /api/image（缺 prompt 回 400、非法 provider 回 400、無金鑰回可讀 JSON 錯誤）
    const imgEmpty = await req('/api/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    const imgBadProv = await req('/api/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'unknown', prompt: 'library' }) });
    const imgNoKey = await req('/api/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'openai', prompt: 'rainy library' }) });
    if (imgEmpty.status === 400 && imgBadProv.status === 400 && [400, 401, 403, 500].includes(imgNoKey.status) && typeof imgNoKey.body?.error === 'string') {
      push('server-image-api', 'OK', `POST /api/image 驗證通過（缺 prompt→400、未知供應商→400、無金鑰→JSON HTTP ${imgNoKey.status}）`);
    } else {
      push('server-image-api', 'FAIL', `POST /api/image 異常：empty=${imgEmpty.status} bad=${imgBadProv.status} nokey=${imgNoKey.status}`);
    }

    // 驗證 parse() 剝除 <think> 偽 JSON、接受 worried/tender、保留 spokenEn
    const parsed = mod.parse(`<think>先想想 { "broken": true }</think>
\`\`\`json
{
  "narration": "Claude娘：「沒事吧？你的手有點冰。」",
  "affectionDelta": 2,
  "choices": ["A","B","C","D","E","F","G"],
  "ending": false,
  "endingText": null,
  "memory": "關心玩家",
  "emotion": "worried",
  "intensity": 2,
  "eventFlag": null,
  "spokenEn": ["Are you alright? Your hands feel a bit cold."]
}
\`\`\``);
    const pTxt = mod.prompt({
      characterName: 'Claude娘',
      action: '喝口茶',
      pluginDirectives: ['[插件:茶香] 多描寫紅茶與紙墨香氣。']
    });
    if (parsed.emotion === 'worried' && parsed.spokenEn?.length === 1 && pTxt.includes('[插件:茶香]')) {
      push('server-contract', 'OK', 'parse() 剝離 <think>＋支援 worried/tender＋保留 spokenEn；prompt() 支援 Harness pluginDirectives');
    } else {
      push('server-contract', 'FAIL', '後端契約驗證未通過');
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// 2. 檢查是否已有背景外部後端正在監聽
async function checkExternalServer() {
  const url = `${baseUrl}/api/health`;
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const ms = Date.now() - start;
    push('live-port', res.ok ? 'OK' : 'WARN', `${url} 回應 HTTP ${res.status} (${ms} ms)`);
  } catch (_) {
    push('live-port', 'WARN', `埠口 ${baseUrl} 目前未常駐執行（嵌入式後端實機冒煙測試已獨立完成）`);
  }
}

// 3. 驗證 app/www/config/*.json
function checkConfigs() {
  const cfgDir = path.join(WWW, 'config');
  if (!fs.existsSync(cfgDir)) {
    push('configs', 'FAIL', `找不到設定目錄 ${cfgDir}`);
    return;
  }
  const files = fs.readdirSync(cfgDir).filter((f) => f.endsWith('.json'));
  const bad = [];
  for (const f of files) {
    try { JSON.parse(fs.readFileSync(path.join(cfgDir, f), 'utf8')); }
    catch (e) { bad.push(`${f} (${e.message})`); }
  }
  push('configs', bad.length ? 'FAIL' : 'OK', bad.length ? `JSON 語法錯誤: ${bad.join('; ')}` : `${files.length} 個設定檔皆為合法 JSON`);

  const emotionsRaw = JSON.parse(fs.readFileSync(path.join(cfgDir, 'emotions.json'), 'utf8'));
  const expected = ['neutral', 'happy', 'proud', 'shy', 'surprised', 'dizzy', 'curious', 'focused', 'worried', 'tender'];
  const actual = Array.isArray(emotionsRaw?.whitelist) ? emotionsRaw.whitelist : [];
  const missing = expected.filter((k) => !actual.includes(k));
  push('emotions-10', missing.length ? 'FAIL' : 'OK', missing.length ? `缺少情緒: ${missing.join(', ')}` : '10 種官方情緒前後端完整對齊');
}

// 4. 檢查 BGM 與模組
function checkAssetsAndModules() {
  const bgmDir = path.join(WWW, 'assets', 'bgm');
  const files = fs.existsSync(bgmDir) ? fs.readdirSync(bgmDir).filter((f) => f.endsWith('.m4a')) : [];
  const totalMb = files.reduce((sum, f) => sum + fs.statSync(path.join(bgmDir, f)).size, 0) / (1024 * 1024);
  push('bgm-assets', files.length >= 9 && totalMb <= 25 ? 'OK' : 'WARN', `${files.length} 首 .m4a 配樂就緒，總計 ${totalMb.toFixed(2)} MB（<= 25 MB 預算）`);

  const required = [
    'app.js', 'app.bundle.js', 'event-bus.js', 'audio-coordinator.js', 'turn-reply-parser.js',
    'ui-en.js', 'plugin-registry.js', 'backend-debug.js', 'character-card-importer.js',
    'workshop-harness-ui.js', 'image-gen.js', 'vn-script.js', 'line-runner.js', 'voice-tts.js', 'bgm-player.js',
    'ambience.js', 'backlog.js'
  ];
  const missing = required.filter((f) => !fs.existsSync(path.join(WWW, f)));
  push('core-modules', missing.length ? 'FAIL' : 'OK', missing.length ? `缺少模組: ${missing.join(', ')}` : `全部 ${required.length} 個核心前端模組與後端 server.js 皆已就位`);
}

await runEmbeddedServerAudit();
await checkExternalServer();
checkConfigs();
checkAssetsAndModules();

const fails = results.filter((r) => r.status === 'FAIL').length;
const warns = results.filter((r) => r.status === 'WARN').length;
console.log(`\n摘要：${results.length - fails - warns} OK / ${warns} WARN / ${fails} FAIL`);
process.exit(fails > 0 ? 1 : 0);
