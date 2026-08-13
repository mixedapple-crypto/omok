/**
 * 보통 난이도의 수비 가중치를 실측으로 정한다.
 *
 * 목표는 "초보가 가끔은 이기지만 자주는 못 이기는" 중간 난이도다.
 * 쉬움은 초보 승률 50%, 어려움은 6%로 이미 재 뒀으니 보통은 그 사이여야 한다.
 * 대략 15~35%를 목표 구간으로 본다.
 */
import { Board, BLACK, WHITE, EMPTY, CELLS } from '../www/js/board.js';
import { AI, LEVEL, makeRng, candidates } from '../www/js/ai.js';
import { analyzeMove } from '../www/js/patterns.js';

const GAMES = 24;
const other = (c) => (c === BLACK ? WHITE : BLACK);

function novicePlay(cells, me, rng, blockRate = 0.5) {
  const cand = candidates(cells);
  if (!cand.length) return -1;
  for (const p of cand) if (analyzeMove(cells, p, me).five) return p;
  if (rng() < blockRate) {
    for (const p of cand) if (analyzeMove(cells, p, other(me)).five) return p;
  }
  let best = -Infinity;
  let ties = [];
  for (const p of cand) {
    const s = analyzeMove(cells, p, me).score * (0.7 + rng() * 0.6);
    if (s > best) { best = s; ties = [p]; }
    else if (s === best) ties.push(p);
  }
  return ties[(rng() * ties.length) | 0];
}

function play(makeAi, noviceIsBlack, seed) {
  const b = new Board();
  const rng = makeRng(seed);
  const ai = makeAi(seed + 7777);
  const noviceColor = noviceIsBlack ? BLACK : WHITE;
  for (let ply = 0; ply < CELLS && !b.isOver; ply++) {
    const m = b.turn === noviceColor ? novicePlay(b.cells, b.turn, rng) : ai.chooseMove(b.cells, b.turn);
    if (m < 0 || !b.place(m)) break;
  }
  return b.winner === EMPTY ? 'draw' : b.winner === noviceColor ? 'novice' : 'ai';
}

function measure(makeAi) {
  let win = 0;
  for (let g = 0; g < GAMES; g++) {
    if (play(makeAi, g % 2 === 0, 100 + g) === 'novice') win++;
  }
  return Math.round((win / GAMES) * 100);
}

console.log(`# 보통의 수비 가중치 튜닝 — 각 값마다 초보와 ${GAMES}판\n`);
for (const seesBroken of [false, true]) {
  const rate = measure((s) => new AI(LEVEL.NORMAL, { random: makeRng(s), seesBroken }));
  const label = seesBroken ? '끊어진 위협도 막음' : '끊어진 위협은 놓침';
  const verdict = rate >= 15 && rate <= 35 ? '← 목표 구간' : rate > 35 ? '너무 약함' : '너무 셈';
  console.log(`${label}   ${String(rate).padStart(3)}%   ${verdict}`);
}

console.log('\n참고 기준선:');
console.log(`  쉬움    ${measure((s) => new AI(LEVEL.EASY, { random: makeRng(s) }))}%`);
console.log(`  어려움  ${measure((s) => new AI(LEVEL.HARD, { random: makeRng(s), timeMs: 300 }))}%`);


