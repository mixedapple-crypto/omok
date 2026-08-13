/**
 * "보통과 어려움은 상대가 세지면 갈리는가?" — 열어둔 질문을 직접 시험한다.
 *
 * 앞선 측정에서 두 난이도가 똑같이 4%였는데, 그때의 초보는 5목 위협을 절반만 막는
 * 아주 약한 상대였다. 그런 상대에게는 어떤 유능한 공격수든 이긴다 — 즉 측정이 포화한
 * 것이지 두 난이도가 같다는 증거가 아니다. 그래서 상대 실력을 단계별로 올리며 다시 잰다.
 *
 * 상대 실력 축:
 *   blockFive  5목 위협을 알아채는 비율
 *   blockThree 상대의 열린3을 막는 비율 (0이면 4가 될 때까지 방치)
 */
import { Board, BLACK, WHITE, EMPTY, CELLS, idx } from '../www/js/board.js';
import { AI, LEVEL, makeRng, candidates } from '../www/js/ai.js';
import { analyzeMove, T, threatAt } from '../www/js/patterns.js';

const GAMES = 20;
const other = (c) => (c === BLACK ? WHITE : BLACK);

/** p에 color를 놓으면 열린3 이상이 되는가. */
function makesOpenThree(cells, p, color) {
  cells[p] = color;
  let found = false;
  for (let d = 0; d < 4 && !found; d++) {
    if (threatAt(cells, p, color, d) >= T.OPEN_THREE) found = true;
  }
  cells[p] = EMPTY;
  return found;
}

function humanPlay(cells, me, rng, skill) {
  const cand = candidates(cells);
  if (!cand.length) return -1;
  const opp = other(me);

  for (const p of cand) if (analyzeMove(cells, p, me).five) return p;
  if (rng() < skill.blockFive) {
    for (const p of cand) if (analyzeMove(cells, p, opp).five) return p;
  }
  // 상대의 열린3을 미리 막는다 — 이걸 하느냐가 초보와 중급을 가른다.
  if (rng() < skill.blockThree) {
    for (const p of cand) if (makesOpenThree(cells, p, opp)) return p;
  }

  let best = -Infinity;
  let ties = [];
  for (const p of cand) {
    const s = analyzeMove(cells, p, me).score * (1 - skill.noise + rng() * skill.noise * 2);
    if (s > best) { best = s; ties = [p]; }
    else if (s === best) ties.push(p);
  }
  return ties[(rng() * ties.length) | 0];
}

function play(makeAi, humanIsBlack, seed, skill) {
  const b = new Board();
  const rng = makeRng(seed);
  const ai = makeAi(seed + 7777);
  const hc = humanIsBlack ? BLACK : WHITE;
  for (let ply = 0; ply < CELLS && !b.isOver; ply++) {
    const m = b.turn === hc ? humanPlay(b.cells, b.turn, rng, skill) : ai.chooseMove(b.cells, b.turn);
    if (m < 0 || !b.place(m)) break;
  }
  return b.winner === EMPTY ? 'draw' : b.winner === hc ? 'human' : 'ai';
}

function rate(makeAi, skill) {
  let win = 0;
  for (let g = 0; g < GAMES; g++) {
    if (play(makeAi, g % 2 === 0, 100 + g, skill) === 'human') win++;
  }
  return Math.round((win / GAMES) * 100);
}

const LEVELS = [
  ['쉬움  ', (s) => new AI(LEVEL.EASY, { random: makeRng(s) })],
  ['보통  ', (s) => new AI(LEVEL.NORMAL, { random: makeRng(s) })],
  ['어려움', (s) => new AI(LEVEL.HARD, { random: makeRng(s), timeMs: 300 })],
];

const SKILLS = [
  ['입문   (5목 50%, 3 방어 없음)', { blockFive: 0.5, blockThree: 0.0, noise: 0.3 }],
  ['초보   (5목 90%, 3 방어 없음)', { blockFive: 0.9, blockThree: 0.0, noise: 0.25 }],
  ['중급   (5목 100%, 3 방어 50%)', { blockFive: 1.0, blockThree: 0.5, noise: 0.15 }],
  ['상급   (5목 100%, 3 방어 100%)', { blockFive: 1.0, blockThree: 1.0, noise: 0.05 }],
];

console.log(`# 상대 실력별 난이도 곡선 — 각 칸마다 ${GAMES}판 (색 교대)`);
console.log('# 숫자는 **사람 쪽 승률**. 낮을수록 AI가 강하다.\n');
console.log('상대 실력                        쉬움   보통   어려움');
console.log('------------------------------   ----   ----   ------');

const table = [];
for (const [name, skill] of SKILLS) {
  const row = LEVELS.map(([, mk]) => rate(mk, skill));
  table.push(row);
  console.log(`${name.padEnd(32)} ${String(row[0]).padStart(3)}%   ${String(row[1]).padStart(3)}%   ${String(row[2]).padStart(4)}%`);
}

console.log('\n=== 판정 ===');
let separated = false;
for (let i = 0; i < SKILLS.length; i++) {
  const [, normal, hard] = [table[i][0], table[i][1], table[i][2]];
  if (normal - hard >= 10) {
    separated = true;
    console.log(`  보통 ≠ 어려움 — '${SKILLS[i][0].split('(')[0].trim()}' 상대에서 갈린다 (보통 ${normal}% vs 어려움 ${hard}%)`);
  }
}
if (!separated) {
  console.log('  보통과 어려움은 **어느 실력대에서도 갈리지 않았다.**');
  console.log('  → 상대가 약해서 포화한 게 아니라, 두 난이도의 실질 차이가 승률로 드러나지 않는다는 뜻이다.');
}


