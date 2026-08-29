/**
 * 자기 파괴 서비스 워커.
 *
 * 예전에는 사이트 루트(/)가 오목이었고, 오목의 sw.js가 루트 스코프에 등록돼
 * 루트 전체를 캐시-우선으로 서빙했다. 포털 구조로 바꾼 뒤에도 이미 방문했던
 * 기기(아이 아이패드)는 옛 워커가 옛 오목 화면을 계속 보여준다.
 *
 * 브라우저는 등록된 워커의 원래 URL(/sw.js)로 업데이트를 확인하므로, 그 자리에
 * 이 파일을 둔다: 설치되자마자 자신을 해제하고 캐시를 비운 뒤 열린 페이지를
 * 새로고침한다. 이후 루트에는 워커가 없고, 오목은 /omok/sw.js가 /omok/ 스코프만 맡는다.
 * (이 파일은 한두 배포 뒤에도 그대로 둬도 무해하다.)
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    await self.registration.unregister();
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((c) => c.navigate(c.url));
  })());
});
