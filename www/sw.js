/**
 * 포털 서비스 워커 — 게임 선택 화면과 숫자숲을 오프라인에서도 열리게 한다.
 *
 * 이 파일은 원래 "자기 파괴 워커"였다. 포털 전환 이전에는 사이트 루트가 오목이었고
 * 오목의 sw.js가 루트 스코프에 등록돼 루트 전체를 캐시-우선으로 서빙했다. 이미 방문한
 * 기기(아이 아이패드)에 옛 오목 화면이 계속 뜨는 것을 막으려고, 브라우저가 업데이트를
 * 확인하는 바로 그 자리(./sw.js)에 자신을 해제하는 워커를 둔 것이다.
 *
 * 이제 그 자리를 이 워커가 대신한다. 옛 등록은 이 파일로 갱신되고, 아래 activate에서
 * 옛 루트 캐시를 찾아 지운다. 자기 파괴가 하던 일을 그대로 이어받으면서 오프라인까지
 * 얹는 셈이다. **별도 파일로 새 워커를 만들면 안 된다** — 스코프가 같아 옛 자기 파괴
 * 워커의 unregister()가 새 등록까지 지워버리는 경합이 생긴다.
 *
 * 버전은 배포 시 CI가 커밋 SHA로 치환한다(.github/workflows/pages.yml).
 */
const VERSION = '__BUILD__';
const CACHE = `portal-${VERSION}`;

/**
 * 오목(./omok/)은 넣지 않는다. 오목은 자기 워커가 따로 있고, 같은 파일을 두 워커가
 * 각자 캐시하면 배포 후 한쪽만 갱신돼 버전이 엇갈린다.
 * 숫자숲은 단일 HTML이라 이 두 줄이면 통째로 오프라인이 된다.
 */
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './math/',
  './math/index.html',
  './mul/',
  './mul/index.html',
];

/** 이 워커가 맡은 범위 안에서의 상대 경로. 로컬(/)과 Pages(/omok/) 양쪽에서 같게 나온다. */
function relPath(url) {
  const scope = new URL(self.registration.scope).pathname;
  return url.pathname.startsWith(scope) ? url.pathname.slice(scope.length) : null;
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();

    // 1) 내 이름공간의 옛 버전만 지운다.
    //    캐시는 출처 단위로 공유되므로 "내 것이 아닌 건 지운다"로 짜면 오목 워커와
    //    서로의 캐시를 지우는 사고가 난다. 실제로 오목 워커가 그렇게 되어 있었다.
    await Promise.all(
      keys.filter((k) => k.startsWith('portal-') && k !== CACHE).map((k) => caches.delete(k)),
    );

    // 2) 포털 전환 이전에 루트에 깔렸던 옛 오목 캐시를 지운다(자기 파괴 워커의 유산).
    //    지금 오목 캐시는 'omok/js/board.js'를, 옛 루트 캐시는 'js/board.js'를 담고 있어
    //    이 한 항목의 유무로 정확히 구분된다.
    const legacyMark = new URL('./js/board.js', self.registration.scope).href;
    await Promise.all(keys.map(async (k) => {
      if (k.startsWith('portal-')) return;
      const c = await caches.open(k);
      if (await c.match(legacyMark)) await caches.delete(k);
    }));

    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 외부 요청은 건드리지 않는다. 이 사이트가 부르는 외부 자원은 웹폰트뿐이고,
  // 폰트는 못 받아도 대체 서체로 읽힌다.
  if (url.origin !== self.location.origin) return;

  const rel = relPath(url);
  if (rel === null) return;
  // 오목은 ./omok/sw.js 관할이다. 그 워커가 아직 설치되기 전이라도 가로채지 않는다.
  if (rel.startsWith('omok/')) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // ⚠️ caches.match(req)를 쓰면 안 된다. 그것은 이 출처의 **모든** 캐시를 뒤지므로
    // 위에서 지우기 전의 옛 루트 캐시가 걸려 옛 오목 화면이 포털 자리에 다시 나온다.
    // 이 워커가 존재하게 된 원인이 바로 그 증상이다.
    const hit = await cache.match(req);
    if (hit) return hit;

    try {
      const res = await fetch(req);
      // 정상 응답만 캐시에 넣는다. 오류 페이지를 캐시하면 그게 굳어버린다.
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      // 오프라인이고 캐시에도 없으면 최소한 포털 화면이라도 보여준다.
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
