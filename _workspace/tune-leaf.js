/**
 * 리프 평가의 수비 계수를 실측으로 정한다.
 *
 * 수비만 보고 정하면 공격을 죽인 값을 고르게 된다. 그래서 양방향으로 잰다:
 *   - 어려움이 **백**: 보통(흑)의 공격을 막아내는가 (대조군 = 보통(백)의 패수)
 *   - 어려움이 **흑**: 보통(백)을 뚫어내는가 (수비 과잉이면 무승부만 쌓인다)
 */
import { Board, BLACK, WHITE, CELLS, idx } from '../www/js/board.js';
import { AI, LEVEL, makeRng } from '../www/js/ai.js';

const GAMES = 6;
const TIME_MS = 300;

function randomOpening(b, rng, plies) {
  const R = 3;
  for (let guard = 0; b.moveCount < plies && guard < 200; guard++) {
    b.place(idx(7 + ((rng() * (2 * R + 1)) | 0) - R, 7 + ((rng() * (2 * R + 1)) | 0) - R));
  }
}

function play(blackAI, whiteAI, seed) {
  const b = new Board();
  randomOpening(b, makeRng(seed), 4);
  for (let ply = 0; ply < CELLS && !b.isOver; ply++) {
    const e = b.turn === BLACK ? blackAI : whiteAI;
    const m = e.chooseMove(b.cells, b.turn);
    if (m < 0 || !b.place(m)) break;
  }
  return b.winner;
}

const hard = (ld, seed) => new AI(LEVEL.HARD, { random: makeRng(seed), timeMs: TIME_MS, leafDefense: ld });
const normal = (seed) => new AI(LEVEL.NORMAL, { random: makeRng(seed) });

/** 어려움이 지정한 색을 잡고 보통과 둔다. */
function series(ld, hardColor) {
  const s = { win: 0, loss: 0, draw: 0 };
  for (let g = 0; g < GAMES; g++) {
    const w = hardColor === BLACK
      ? play(hard(ld, 3000 + g), normal(2000 + g), 500 + g)
      : play(normal(2000 + g), hard(ld, 3000 + g), 500 + g);
    if (w === hardColor) s.win++;
    else if (w === 0) s.draw++;
    else s.loss++;
  }
  return s;
}

console.log(`# 수비 계수 튜닝 — 계수당 ${GAMES}판 × 양색, 사고시간 ${TIME_MS}ms\n`);

// 대조군: 같은 실력끼리의 성적 = 넘지 말아야 할 기준선.
let ctlWhiteLoss = 0;
let ctlBlackWin = 0;
for (let g = 0; g < GAMES; g++) {
  const w = play(normal(2000 + g), normal(3000 + g), 500 + g);
  if (w === BLACK) { ctlWhiteLoss++; ctlBlackWin++; }
}
console.log(`기준선(보통 vs 보통): 백이 ${ctlWhiteLoss}패, 흑이 ${ctlBlackWin}승 / ${GAMES}판\n`);

console.log('계수    어려움=백(수비)      어려움=흑(공격)      판정');
console.log('-----   ------------------   ------------------   ----');
for (const ld of [1.0, 1.2, 1.4, 1.7, 2.0]) {
  const w = series(ld, WHITE);
  const b = series(ld, BLACK);
  const fmt = (s) => `${s.win}승 ${s.loss}패 ${s.draw}무`.padEnd(18);
  const defOk = w.loss <= ctlWhiteLoss;
  const atkOk = b.win >= ctlBlackWin;
  const verdict = defOk && atkOk ? 'OK' : `${defOk ? '' : '수비 미달 '}${atkOk ? '' : '공격 미달'}`;
  console.log(`${ld.toFixed(1)}     ${fmt(w)}   ${fmt(b)}   ${verdict}`);
}
