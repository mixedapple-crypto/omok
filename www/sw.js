/**
 * 서비스 워커 — 설치 후 오프라인으로도 돌게 한다.
 *
 * 버전은 배포 시 CI가 커밋 SHA로 치환한다(.github/workflows/pages.yml).
 * 손으로 올리는 상수로 두면 언젠가 반드시 깜빡하고, 그러면 아이 아이패드에 옛 버전이
 * 영영 박힌다 — 서비스 워커에서 가장 흔한 사고다. 사람 손을 뺀다.
 */
const VERSION = '__BUILD__';
const CACHE = `omok-${VERSION}`;

/**
 * 프리캐시 목록.
 *
 * ⚠️ ai-worker.js와 ai.js를 반드시 넣어야 한다. 둘은 HTML이 참조하는 게 아니라
 * 실행 중에 따로 요청된다 — game.js가 `new Worker(new URL('./ai-worker.js', …))`로
 * 워커를 띄우고, 워커가 실패하면 폴백이 `await import('./ai.js')`를 한다.
 * 빠뜨리면 오프라인에서 **워커와 폴백이 동시에** 죽어 "생각하는 중…"에서 멈춘다.
 */
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/game.js',
  './js/board.js',
  './js/patterns.js',
  './js/ai.js',
  './js/ai-worker.js',
  './js/render.js',
  './js/audio.js',
  './js/storage.js',
  './js/ui.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      // 새 버전을 다음 실행까지 기다리지 않고 바로 올린다.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // 같은 출처의 GET만 다룬다. 이 게임은 외부 요청이 아예 없다.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          // 정상 응답만 캐시에 넣는다. 오류 페이지를 캐시하면 그게 굳어버린다.
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        // 오프라인이고 캐시에도 없으면 최소한 첫 화면이라도 보여준다.
        .catch(() => caches.match('./index.html'));
    }),
  );
});
