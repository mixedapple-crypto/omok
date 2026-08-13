/**
 * 개발용 정적 서버. `npm run serve`로 띄운다.
 *
 * 왜 직접 만드나: 이 프로젝트는 의존성 0을 유지한다. 그리고 `file://`로 index.html을
 * 열면 ES 모듈도 Web Worker도 CORS로 전부 죽으므로 **서버로 띄우는 것이 필수**다.
 *
 * 사용: node serve.js [포트]
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'www');
const PORT = Number(process.argv[2]) || 4173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const rel = decodeURIComponent(url.pathname) === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const path = normalize(join(ROOT, rel));

    // 경로 탈출 차단 — 개발 서버라도 www 밖을 내주지 않는다.
    if (!path.startsWith(ROOT + sep) && path !== ROOT) {
      res.writeHead(403).end('forbidden');
      return;
    }

    const body = await readFile(path);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(path).toLowerCase()] || 'application/octet-stream',
      // 개발 중에는 항상 최신 파일을 봐야 한다 — 캐시가 남으면 고친 게 반영 안 된 줄 안다.
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
  }
});

server.listen(PORT, () => {
  console.log(`오목 개발 서버: http://localhost:${PORT}/`);
});
