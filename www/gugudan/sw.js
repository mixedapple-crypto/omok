/**
 * 서비스 워커 — 설치 후 오프라인으로도 돌게 한다. 스코프는 /gugudan/ 이다.
 *
 * 버전은 배포 시 CI가 커밋 SHA로 치환한다(.github/workflows/pages.yml).
 * 손으로 올리는 상수로 두면 언젠가 반드시 깜빡하고, 그러면 아이 아이패드에 옛 버전이
 * 영영 박힌다 — 서비스 워커에서 가장 흔한 사고다. 사람 손을 뺀다.
 */
const VERSION = '__BUILD__';
const CACHE = `gugudan-${VERSION}`;

/**
 * 프리캐시 목록.
 *
 * ⚠️ engine.js와 store.js를 반드시 넣어야 한다. app.js가 정적으로 import하므로
 * 하나라도 빠지면 오프라인에서 **첫 화면부터** 안 뜬다(모듈 그래프가 통째로 죽는다).
 * 글꼴은 넣지 않는다 — 외부 출처라 캐시에 못 넣고, 없으면 대체 글꼴로 뜬다.
 */
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/ui.js',
  './js/engine.js',
  './js/store.js',
  './js/audio.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      // 새 버전을 다음 실행까지 기다리지 않고 바로 올린다.
      .then(() => self.skipWaiting()),
  );
});

/**
 * 옛 버전 정리.
 *
 * ⚠️ 반드시 `gugudan-` 접두사로 걸러야 한다. 캐시 저장소는 **출처 단위로 공유**되므로
 * "내 것이 아닌 건 지운다"로 짜면 포털 워커(portal-*)와 오목 워커(omok-*)의 캐시까지 지운다.
 * 그러면 배포할 때마다 워커들이 서로의 캐시를 없애 오프라인이 조용히 깨진다.
 */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('gugudan-') && k !== CACHE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // 같은 출처의 GET만 다룬다. 글꼴(fonts.googleapis.com)은 브라우저에 맡긴다.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    // 조회도 자기 캐시에서 한다. caches.match()는 다른 워커의 캐시까지 뒤진다.
    caches.open(CACHE).then((cache) => cache.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          // 정상 응답만 캐시에 넣는다. 오류 페이지를 캐시하면 그게 굳어버린다.
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        // 오프라인이고 캐시에도 없으면 최소한 첫 화면이라도 보여준다.
        .catch(() => cache.match('./index.html'));
    })),
  );
});
