/**
 * AI를 별도 스레드에서 돌린다.
 *
 * 어려움 난이도는 최대 1.5초를 탐색에 쓴다. 그동안 메인 스레드가 멈추면
 * 화면이 얼어붙고 아이는 앱이 죽은 줄 안다. 워커를 쓰는 유일한 이유가 이것이다.
 */

import { AI } from './ai.js';

let engine = null;

self.onmessage = (e) => {
  const msg = e.data;
  if (!msg || msg.type !== 'move') return;

  if (!engine || engine.level !== msg.level) {
    engine = new AI(msg.level, { timeMs: msg.timeMs });
  }

  try {
    // 넘어온 배열은 구조적 복제본이라 메인 스레드의 반상과 공유되지 않는다.
    const move = engine.chooseMove(Int8Array.from(msg.cells), msg.color);
    self.postMessage({ type: 'move', id: msg.id, move, stats: { ...engine.stats } });
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: String(err && err.message || err) });
  }
};
