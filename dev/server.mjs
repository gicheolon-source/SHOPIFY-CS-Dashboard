// 로컬 개발 서버: public/ 정적 파일 + api/*.js 함수 실행 (Vercel과 같은 경로)
// 실행: node --env-file-if-exists=.env.local dev/server.mjs   (DEMO_MODE=1 이면 가짜 데이터)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

if (process.argv.includes('--demo')) process.env.DEMO_MODE = '1';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const port = Number(process.env.PORT) || 3200;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

http.createServer(async (req, res) => {
  let url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === '/oauth/google/callback') url = new URL(`/api/google?action=callback&${url.searchParams}`, url);
  req.query = Object.fromEntries(url.searchParams);
  if (url.pathname.startsWith('/api/')) {
    const file = path.join(root, 'api', `${url.pathname.slice(5).replace(/[^a-z0-9-]/gi, '')}.js`);
    if (!fs.existsSync(file)) return res.writeHead(404).end('not found');
    return require(file)(req, res);
  }
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = path.join(root, 'public', path.normalize(rel));
  if (!file.startsWith(path.join(root, 'public')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return res.writeHead(404).end('not found');
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`CS dashboard dev server on http://localhost:${port}${process.env.DEMO_MODE === '1' ? ' (DEMO)' : ''}`));
