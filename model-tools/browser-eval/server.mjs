import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.KIT_MODEL_WORK_DIR || path.resolve(repo, '../model-conversion');
const types = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.wasm':'application/wasm', '.bin':'application/octet-stream' };
const server = http.createServer((req,res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname)
    .replace(/^\/mlc-q4f16_1\/resolve\/main\//, '/mlc-q4f16_1/');
  const file = path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Content-Length':stat.size,
      'Access-Control-Allow-Origin':'*', 'Cache-Control':'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
});
server.listen(4190, '127.0.0.1', () => {
  process.send?.({ type: 'ready', port: 4190 });
  console.log('Conversion evaluation server: http://127.0.0.1:4190/browser-eval/');
});
