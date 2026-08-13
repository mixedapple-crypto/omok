/** 무승부의 정체 확인 — 진짜 반상이 찬 것인지, AI가 착수에 실패한 것인지. */
import { Board, BLACK, WHITE, EMPTY, CELLS } from '../www/js/board.js';
import { AI, LEVEL, makeRng } from '../www/js/ai.js';

function play(blackAI, whiteAI) {
  const b = new Board();
  let reason = '정상 종료';
  for (let ply = 0; ply < CELLS; ply++) {
    if (b.isOver) break;
    const engine = b.turn === BLACK ? blackAI : whiteAI;
    const m = engine.chooseMove(b.cells, b.turn);
    if (m === undefined || m === null || Number.isNaN(m)) {
      reason = `AI가 잘못된 값 반환: ${m} (${b.turn === BLACK ? '흑' : '백'})`;
      break;
    }
    if (m < 0) { reason = '둘 곳 없음(-1)'; break; }
    if (!b.place(m)) { reason = `place 거부: index=${m}, 값=${b.cells[m]}`; break; }
  }
  if (b.winner === EMPTY && reason === '정상 종료') {
    reason = b.isFull ? '반상 전부 참 = 진짜 무승부' : '루프 상한 도달';
  }
  return { winner: b.winner, plies: b.moveCount, reason };
}

console.log('어려움(흑) vs 보통(백) — 무승부 5판의 정체\n');
for (let g = 0; g < 5; g++) {
  const r = play(
    new AI(LEVEL.HARD, { random: makeRng(1000 + g), timeMs: 300 }),
    new AI(LEVEL.NORMAL, { random: makeRng(2000 + g) }),
  );
  const w = r.winner === BLACK ? '흑승' : r.winner === WHITE ? '백승' : '무승부';
  console.log(`  판 ${g}: ${w}  ${r.plies}수  — ${r.reason}`);
}

console.log('\n비교: 보통(흑) vs 보통(백)');
for (let g = 0; g < 3; g++) {
  const r = play(
    new AI(LEVEL.NORMAL, { random: makeRng(1000 + g) }),
    new AI(LEVEL.NORMAL, { random: makeRng(2000 + g) }),
  );
  const w = r.winner === BLACK ? '흑승' : r.winner === WHITE ? '백승' : '무승부';
  console.log(`  판 ${g}: ${w}  ${r.plies}수  — ${r.reason}`);
}
