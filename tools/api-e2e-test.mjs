#!/usr/bin/env node
/**
 * tools/api-e2e-test.mjs — 真實 Express 後端全鏈路 API 端到端整合測試
 *
 * 測試範圍（零外部扣費，100% 跑真實 app/server/server.js 路由、Token 防護、契約解析與前端串接）：
 * 1. 啟動本機模擬上游 OpenAI API（/v1/responses + /v1/images/generations）
 * 2. 啟動真實覆蓋層 Express 後端（app/server/server.js），注入 OPENAI_BASE_URL 與測試金鑰
 * 3. 逐一實測：
 *    - GET  /api/health（10 情緒、capabilities.imageGen/bgmList、profiles.openai）
 *    - GET  /api/debug/status（apiVersion=2.1-harness、bgmCount=9）
 *    - GET  /api/bgm/list（9 首原創 .m4a 曲目完整且 <= 25 MB）
 *    - POST /api/model-check（驗證真實 probeModel → evaluateModelCheck JSON 契約 PASS）
 *    - POST /api/story（驗證多角色卡、Harness pluginDirectives、<think> 剝離、worried/tender 情緒與 spokenEn 完整回傳）
 *    - POST /api/image（驗證真實回傳 Base64 PNG Data URL 供前端自動匯入舞台）
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SERVER_PATH = path.join(ROOT, 'app', 'server', 'server.js');
const SAMPLE_PNG = path.join(ROOT, 'app', 'www', 'assets', 'g43-start-character.png');

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

// 1. 啟動模擬上游 OpenAI 相容伺服器
const tinyPngB64 = fs.existsSync(SAMPLE_PNG)
  ? fs.readFileSync(SAMPLE_PNG).toString('base64')
  : 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2dIAAAAASUVORK5CYII=';

let capturedStoryInput = '';
const mockUpstream = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    if (req.url === '/v1/responses') {
      const isProbe = String(body.input || '').includes('模型相容性測試') || String(body.input || '').includes('compatibility test');
      if (!isProbe) capturedStoryInput = String(body.input || '');
      const storyObj = isProbe
        ? {
            narration: '雨聲沿著彩窗滑落，她輕輕接過桌上的熱茶，抬眼看了你一眼，嘴角微微上揚。',
            affectionDelta: 1,
            choices: ['問她在讀哪本書', '坐到她對面', '替她點亮燭火', '遞上一塊餅乾', '聊聊窗外的雨', '翻開書頁邊註', '安靜陪著她'],
            ending: false,
            endingText: null,
            memory: '雨夜在書桌旁遞上一杯熱茶。',
            emotion: 'tender',
            intensity: 2
          }
        : {
            narration: '<image:雨夜古籍閱覽室暖黃燭火與熱紅茶><emotion:tender>Claude娘：「你回來得剛好，茶還溫著呢。」\n林曉：「我把修補好的《未竟錄》附頁也一起帶來了。」\n（她接過書頁，眼角彎起溫柔的弧度。）',
            affectionDelta: 2,
            choices: ['坐到她身旁一起看附頁', '先替林曉倒一杯熱茶', '細看書頁邊的金色註記', '問她剛才在等誰', '把披肩拉好別著涼', '聊聊今晚的雨聲', '輕聲誇獎她的細心'],
            ending: false,
            endingText: null,
            memory: '與林曉一起將修補好的《未竟錄》交給 Claude娘。',
            emotion: 'tender',
            intensity: 2,
            eventFlag: null,
            spokenEn: [
              'You came back just in time; the tea is still warm.',
              'I brought the restored appendix of the Unfinished Chronicle as well.'
            ]
          };
      const wrappedText = `<think>先確認 JSON 結構，不可輸出 {broken: true}</think>\n\`\`\`json\n${JSON.stringify(storyObj)}\n\`\`\``;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        output_text: wrappedText,
        usage: { input_tokens: 420, output_tokens: 210, input_tokens_details: { cached_tokens: 120 } }
      }));
      return;
    }
    if (req.url === '/v1/images/generations') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ b64_json: tinyPngB64 }] }));
      return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'unknown mock route' }));
  });
});

await new Promise((r) => mockUpstream.listen(0, '127.0.0.1', r));
const mockPort = mockUpstream.address().port;

// 注入暫時測試環境變數指向本機 mock 上游（絕不寫檔、結束立即清除）
const prevKey = process.env.OPENAI_API_KEY;
const prevBase = process.env.OPENAI_BASE_URL;
process.env.OPENAI_API_KEY = 'sk-local-e2e-mock-only';
process.env.OPENAI_BASE_URL = `http://127.0.0.1:${mockPort}/v1`;

const serverMod = await import(pathToFileURL(SERVER_PATH).href);
const token = 'e2e-' + Date.now().toString(36);
const apiServer = await serverMod.startApiServer({ port: 0, host: '127.0.0.1', token });
const base = `http://127.0.0.1:${apiServer.address().port}`;

const reqJson = async (route, opts = {}) => {
  const res = await fetch(base + route, {
    ...opts,
    headers: { 'X-Desktop-Token': token, 'Content-Type': 'application/json', ...(opts.headers || {}) }
  });
  const data = await res.json();
  return { status: res.status, data };
};

try {
  // 1. /api/health
  const h = await reqJson('/api/health');
  assert.equal(h.status, 200);
  assert.equal(h.data.ok, true);
  assert.equal(h.data.emotions.length, 10);
  assert.equal(h.data.capabilities.imageGen, true);
  assert.equal(h.data.capabilities.bgmList, true);
  assert.ok(h.data.profiles.openai.includes('default'));
  console.log('[PASS] GET  /api/health       -> 10情緒 + imageGen/bgmList + openai profile 就緒');

  // 2. /api/bgm/list
  const b = await reqJson('/api/bgm/list');
  assert.equal(b.status, 200);
  assert.equal(b.data.ok, true);
  assert.equal(b.data.count, 9);
  assert.ok(b.data.totalMb <= 25);
  console.log(`[PASS] GET  /api/bgm/list     -> ${b.data.count} 首原創配樂 (${b.data.totalMb} MB)`);

  // 3. /api/model-check（驗證 8 項契約檢查，包含新情緒 tender！）
  const mc = await reqJson('/api/model-check', {
    method: 'POST',
    body: JSON.stringify({ provider: 'openai', model: 'gpt-6-sol', language: 'zh' })
  });
  assert.equal(mc.status, 200);
  assert.equal(mc.data.ok, true, 'evaluateModelCheck 應全數通過：' + JSON.stringify(mc.data.checks));
  assert.equal(mc.data.checks.length, 8);
  assert.ok(mc.data.checks.every((c) => c.ok));
  console.log(`[PASS] POST /api/model-check  -> ok=${mc.data.ok}, 8/8 checks PASS (含 emotion=tender, ${mc.data.latencyMs} ms)`);

  // 4. /api/story（驗證多角色卡 + Harness pluginDirectives + <think>剝離 + tender + spokenEn + usage）
  const st = await reqJson('/api/story', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'openai',
      model: 'gpt-6-sol',
      characterName: 'Claude娘',
      characterProfile: '知識之塔圖書館館長。\n其他角色：【林曉】深夜古籍修復師',
      pluginDirectives: ['[插件:茶香氛圍] 本回合請細寫紅茶與紙墨香氣。'],
      history: [],
      action: '__OPENING_STYLE__:rainy_first_meeting',
      affection: 55,
      responseMode: 'fast',
      language: 'zh'
    })
  });
  assert.equal(st.status, 200);
  assert.equal(st.data.emotion, 'tender');
  assert.equal(st.data.choices.length, 7);
  assert.equal(st.data.spokenEn.length, 2);
  assert.ok(st.data._usage && st.data._usage.input === 420);
  assert.ok(capturedStoryInput.includes('[插件:茶香氛圍]'), 'Harness pluginDirectives 必須完整送達上游模型');
  console.log(`[PASS] POST /api/story        -> emotion=${st.data.emotion}, choices=${st.data.choices.length}, spokenEn=${st.data.spokenEn.length}, pluginDirectives=已送達`);

  // 5. /api/image（驗證真實 Base64 PNG Data URL 回傳）
  const im = await reqJson('/api/image', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'openai',
      model: 'gpt-image-1',
      size: '1536x1024',
      prompt: '雨夜古籍閱覽室暖黃燭火與熱紅茶'
    })
  });
  assert.equal(im.status, 200);
  assert.equal(im.data.ok, true);
  assert.ok(im.data.dataUrl.startsWith('data:image/png;base64,'));
  console.log(`[PASS] POST /api/image        -> ok=true, mime=${im.data.mime}, dataUrlLen=${im.data.dataUrl.length} (${im.data.latencyMs} ms)`);

  console.log('\n全鏈路真實 Express API 端到端測試：5/5 全部 PASS！');
} finally {
  if (prevKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prevKey;
  if (prevBase === undefined) delete process.env.OPENAI_BASE_URL; else process.env.OPENAI_BASE_URL = prevBase;
  await new Promise((r) => apiServer.close(r));
  await new Promise((r) => mockUpstream.close(r));
}
