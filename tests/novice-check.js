/**
 * "쉬움을 아이가 이길 수 있는가" — 제품 요구사항을 직접 잰다.
 *
 * selfplay는 AI끼리의 서열만 알려주고 이 질문에 답하지 못한다. 그래서 초보를 흉내 낸
 * 상대를 만들어 붙인다. 초보 모델:
 *   - 5목을 만들 수 있으면 둔다 (아이도 이건 본다)
 *   - 상대의 4목은 절반쯤만 알아챈다
 *   - 열린3 방어는 하지 않는다 (아이가 가장 못 보는 부분)
 *   - 나머지는 자기 돌만 이어 붙인다
 *
 * 사용: node tests/novice-check.js [--games N]
 */
import { Board, BLACK, WHITE, EMPTY, CELLS, idx } from '../www/js/board.js';
import { AI, LEVEL, makeRng, candidates } from '../www/js/ai.js';
import { analyzeMove } from '../www/js/patterns.js';

const argv = process.argv.slice(2);
const gi = argv.indexOf('--games');
const GAMES = gi >= 0 && argv[gi + 1] ? Number(argv[gi + 1]) : 20;

/** 상대 색. */
const other = (c) => (c === BLACK ? WHITE : BLACK);

/**
 * 초보 플레이어. 앞을 읽지 않고, 방어를 자주 빠뜨린다.
 * @param {number} blockRate 상대의 5목 위협을 알아챌 확률
 */
function novicePlay(cells, me, rng, blockRate = 0.5) {
  const cand = candidates(cells);
  if (!cand.length) return -1;

  // 이길 수 있으면 둔다.
  for (const p of cand) if (analyzeMove(cells, p, me).five) return p;

  // 상대가 이길 수 있는 자리는 '가끔' 알아챈다.
  if (rng() < blockRate) {
    for (const p of cand) if (analyzeMove(cells, p, other(me)).five) return p;
  }

  // 나머지는 자기 돌만 이어 붙인다 — 상대 모양은 보지 않는다.
  let best = -Infinity;
  let ties = [];
  for (const p of cand) {
    // 약간의 잡음을 준다. 아이는 늘 최선의 이음수를 찾아내지 못한다.
    const s = analyzeMove(cells, p, me).score * (0.7 + rng() * 0.6);
    if (s > best) { best = s; ties = [p]; }
    else if (s === best) ties.push(p);
  }
  return ties[(rng() * ties.length) | 0];
}

function play(level, noviceIsBlack, seed, blockRate) {
  const b = new Board();
  const rng = makeRng(seed);
  const ai = new AI(level, { random: makeRng(seed + 7777), timeMs: 300 });
  const noviceColor = noviceIsBlack ? BLACK : WHITE;

  for (let ply = 0; ply < CELLS && !b.isOver; ply++) {
    const m = b.turn === noviceColor
      ? novicePlay(b.cells, b.turn, rng, blockRate)
      : ai.chooseMove(b.cells, b.turn);
    if (m < 0 || !b.place(m)) break;
  }
  return b.winner === EMPTY ? 'draw' : b.winner === noviceColor ? 'novice' : 'ai';
}

console.log(`# 초보 vs AI — 난이도별 ${GAMES}판 (색 교대)\n`);
console.log('난이도    초보 성적          판정');
console.log('-------   ----------------   ----');

const results = {};
for (const level of [LEVEL.EASY, LEVEL.NORMAL, LEVEL.HARD]) {
  let win = 0, loss = 0, draw = 0;
  for (let g = 0; g < GAMES; g++) {
    const r = play(level, g % 2 === 0, 100 + g, 0.5);
    if (r === 'novice') win++;
    else if (r === 'ai') loss++;
    else draw++;
  }
  results[level] = win;
  const rate = Math.round((win / GAMES) * 100);
  const label = { easy: '쉬움  ', normal: '보통  ', hard: '어려움' }[level];
  console.log(`${label}    ${win}승 ${loss}패 ${draw}무 (${rate}%)   ${
    level === LEVEL.EASY
      ? (rate >= 25 ? 'OK — 아이가 이길 수 있다' : '너무 어렵다')
      : (rate <= 25 ? 'OK — 만만치 않다' : '너무 쉽다')}`);
}

console.log('\n=== 판정 ===');
let failed = 0;
const judge = (name, pass, detail) => {
  console.log(`  ${pass ? 'PASS' : 'FAIL'} - ${name}${detail ? `  (${detail})` : ''}`);
  if (!pass) failed++;
};

const pct = (n) => Math.round((n / GAMES) * 100);
judge('쉬움은 아이가 이길 수 있다', pct(results.easy) >= 25, `초보 승률 ${pct(results.easy)}%`);
judge('쉬움이 그냥 져주는 수준은 아니다', pct(results.easy) <= 85, `초보 승률 ${pct(results.easy)}%`);
judge('보통은 쉬움보다 어렵다', results.normal <= results.easy,
  `초보 승률 보통 ${pct(results.normal)}% vs 쉬움 ${pct(results.easy)}%`);
judge('어려움은 보통보다 어렵거나 같다', results.hard <= results.normal,
  `초보 승률 어려움 ${pct(results.hard)}% vs 보통 ${pct(results.normal)}%`);

console.log(`\n# novice-check: ${failed === 0 ? '전부 통과' : `${failed}건 실패`}`);
if (failed) process.exitCode = 1;
