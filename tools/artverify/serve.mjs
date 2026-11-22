// 美術驗收用靜態伺服器：/  → 遊戲 www；/__harness.html → 本資料夾的 iframe 外框。
// 只讀取檔案，不修改專案。
//
// 2026-11-21 修復：不再移除 story-art.js。
// 舊版用 regex 刪掉 <script type="module" src="story-art.js">，導致 setTone() 從未執行，
// 夜間／晨光／傍晚的對話框配色與 .story-art-grade 疊層全部沒套上，截圖與量測都不是玩家畫面。
import http from 'node:http';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const wwwRoot = resolve(process.argv[2] || '');
const port = Number(process.argv[3] || 4789);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

http.createServer((req, res) => {
  let path = decodeURIComponent((req.url || '/').split('?')[0]);
  // 驗收頁：index.html 原文 + 注入「強制進入故事畫面」的腳本，不修改專案檔案。
  if (path === '/__shot.html') {
    // 每次請求都重讀注入腳本，改驗收腳本不必重啟伺服器。
    const inject = readFileSync(join(here, 'shot-inject.html'), 'utf8');
    const qs = (req.url || '').split('?')[1] || '';
    const strip = /(?:^|&)strip=1(?:&|$)/.test(qs);
    let html = readFileSync(join(wwwRoot, 'index.html'), 'utf8');
    let stripNote = 'kept (H1)';
    if (strip) {
      const lower = html.toLowerCase();
      const idx = lower.indexOf('story-art.js');
      const start = idx >= 0 ? html.lastIndexOf('<script', idx) : -1;
      const end = idx >= 0 ? html.indexOf('</script>', idx) : -1;
      if (start >= 0 && end >= 0) {
        html = html.slice(0, start) + html.slice(end + '</script>'.length);
        stripNote = 'stripped (H9)';
      } else {
        stripNote = 'NOT stripped (story-art.js not found)';
      }
    }
    html = html.replace('</body>', `${inject}\n</body>`);
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>\n<!-- harness: story-art.js ${stripNote} -->`);
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html);
    return;
  }
  let root = wwwRoot;
  if (path === '/__harness.html') {
    root = here;
    path = '/harness.html';
  }
  if (path === '/') path = '/index.html';
  const file = normalize(join(root, path));
  if (!file.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const st = statSync(file);
    if (st.isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': mime[extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
      'content-length': st.size,
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`artverify http://127.0.0.1:${port}/  (www=${wwwRoot})`);
});
