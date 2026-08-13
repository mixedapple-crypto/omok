/**
 * AI 난이도 서열 검증 — AI끼리 대국시켜 "어려움이 정말 어려운지"를 숫자로 확인한다.
 *
 * ⚠️ 색을 반드시 교대한다. 자유룰 오목은 흑 선공 필승이 증명돼 있어(Allis, 1994)
 * 한 색으로만 돌린 승률은 실력인지 선공 프리미엄인지 구분되지 않는다.
 * 색별로 분리 기록하지 않은 결과는 무효 데이터로 취급한다.
 *
 * 사용: node tests/ai-selfplay.js [--games N] [--time MS]
 *   --time 은 어려움 난이도의 수당 사고 시간. 실제 대국은 1500ms지만
 *   수십 판을 돌리려면 낮춰야 한다 (1500ms × 25수 × 36판 = 22분).
 */
import { Board, BLACK, WHITE, EMPTY, CELLS, idx } from '../www/js/board.js';
import { AI, LEVEL, makeRng } from '../www/js/ai.js';

const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : dflt;
};
/** 색당 판수. 총 대국 수 = 이 값 × 2. */
const GAMES_PER_COLOR = argOf('--games', 6);
const HARD_TIME_MS = argOf('--time', 200);

const LABEL = { [LEVEL.EASY]: '쉬움', [LEVEL.NORMAL]: '보통', [LEVEL.HARD]: '어려움' };

let maxThinkMs = 0;

function makeAI(level, seed) {
  return new AI(level, { random: makeRng(seed), timeMs: HARD_TIME_MS });
}

/**
 * 무작위 개시 국면을 깔아준다.
 *
 * 왜 필요한가: 같은 빈 반상에서만 두게 하면 실력이 비슷한 두 엔진이 매번 똑같은
 * 교착에 빠져 225수 무승부가 반복된다(실측: 보통 vs 보통 3/3 무승부). 서로의 위협을
 * 한 수 앞서 전부 차단하기 때문이며, 이는 엔진이 약해서가 아니라 측정이 퇴화한 것이다.
 * 개시 국면을 흩뿌리면 승부가 갈리고 실력 차가 승률로 드러난다 — 엔진 테스트의 표준 관행이다.
 */
function randomOpening(b, rng, plies) {
  const R = 3; // 천원 주변 7×7 안에서만 — 반상 구석에서 시작하면 국면이 비현실적이다
  for (let guard = 0; b.moveCount < plies && guard < 200; guard++) {
    const r = 7 + ((rng() * (2 * R + 1)) | 0) - R;
    const c = 7 + ((rng() * (2 * R + 1)) | 0) - R;
    b.place(idx(r, c)); // 이미 놓인 자리는 place가 알아서 거부한다
  }
}

const OPENING_PLIES = 4;

function playGame(blackAI, whiteAI, openingSeed) {
  const b = new Board();
  randomOpening(b, makeRng(openingSeed), OPENING_PLIES);
  for (let ply = 0; ply < CELLS && !b.isOver; ply++) {
    const engine = b.turn === BLACK ? blackAI : whiteAI;
    const m = engine.chooseMove(b.cells, b.turn);
    if (engine.stats.ms > maxThinkMs) maxThinkMs = engine.stats.ms;
    if (m < 0 || !b.place(m)) break; // 둘 곳이 없다 = 무승부
  }
  return b.winner;
}

/**
 * A와 B를 맞붙인다. 반드시 색을 교대해 같은 판수씩 둔다.
 * @returns 색별로 분리된 전적
 */
function match(levelA, levelB) {
  const r = {
    aBlack: { win: 0, loss: 0, draw: 0 },
    aWhite: { win: 0, loss: 0, draw: 0 },
    blackWins: 0,
    total: 0,
  };

  for (let g = 0; g < GAMES_PER_COLOR; g++) {
    // 같은 개시 국면을 양쪽 색으로 한 번씩 둔다 — 개시 운이 승률에 섞이지 않게.
    const openingSeed = 500 + g;

    // A가 흑
    let w = playGame(makeAI(levelA, 1000 + g), makeAI(levelB, 2000 + g), openingSeed);
    r.total++;
    if (w === BLACK) { r.aBlack.win++; r.blackWins++; }
    else if (w === WHITE) r.aBlack.loss++;
    else r.aBlack.draw++;

    // A가 백 — 같은 판수를 반대 색으로도 둔다
    w = playGame(makeAI(levelB, 3000 + g), makeAI(levelA, 4000 + g), openingSeed);
    r.total++;
    if (w === WHITE) r.aWhite.win++;
    else if (w === BLACK) { r.aWhite.loss++; r.blackWins++; }
    else r.aWhite.draw++;
  }
  return r;
}

const pct = (n, d) => (d === 0 ? 0 : Math.round((n / d) * 100));
const fmt = (s) => `${s.win}승 ${s.loss}패 ${s.draw}무`;

function runMatch(levelA, levelB) {
  const A = LABEL[levelA];
  const B = LABEL[levelB];
  process.stdout.write(`\n=== ${A} vs ${B} — 색 교대 ${GAMES_PER_COLOR}판씩, 총 ${GAMES_PER_COLOR * 2}판 ===\n`);
  const r = match(levelA, levelB);
  const win = r.aBlack.win + r.aWhite.win;
  const loss = r.aBlack.loss + r.aWhite.loss;
  const draw = r.aBlack.draw + r.aWhite.draw;
  // 무승부는 실력 차의 증거가 아니다. 승부가 난 판만으로 서열을 본다.
  const decisive = win + loss;

  console.log(`  ${A}(흑): ${fmt(r.aBlack)}`);
  console.log(`  ${A}(백): ${fmt(r.aWhite)}`);
  console.log(`  → ${A} 종합 ${fmt({ win, loss, draw })}  |  승부 난 ${decisive}판 중 ${win}승 (${pct(win, decisive)}%)`);
  console.log(`  [색 편향 참고] 흑 선공 승률 ${r.blackWins}/${r.total} (${pct(r.blackWins, r.total)}%)`);

  return {
    A, B, win, loss, draw, decisive,
    decisiveRate: pct(win, decisive),
    blackWins: r.aBlack.win,
    whiteWins: r.aWhite.win,
    blackNet: r.aBlack.win - r.aBlack.loss,
    whiteNet: r.aWhite.win - r.aWhite.loss,
    blackFirstRate: pct(r.blackWins, r.total),
  };
}

// ---------------------------------------------------------------------------

console.log(`# AI selfplay — 색당 ${GAMES_PER_COLOR}판, 어려움 사고시간 ${HARD_TIME_MS}ms`);
console.log(`# 개시 국면 ${OPENING_PLIES}수를 무작위로 깔고 시작한다 (같은 개시를 양색으로 한 번씩).`);
console.log('# 주의: 어려움은 시간 제한 탐색이라 기기 부하에 따라 도달 깊이가 달라진다 —');
console.log('#       난수 시드를 고정해도 결과가 완전히 재현되지는 않는다.');

const t0 = Date.now();
// 대조군 먼저 — 같은 실력끼리 붙여 '흑 선공 프리미엄'의 기준선을 잡는다.
// 이게 없으면 백이 진 것이 실력 탓인지 선공 탓인지 영원히 구분할 수 없다.
console.log('\n### 대조군: 같은 실력끼리 붙여 색 프리미엄의 기준선을 잡는다');
const control = runMatch(LEVEL.NORMAL, LEVEL.NORMAL);
const hardVsNormal = runMatch(LEVEL.HARD, LEVEL.NORMAL);
const normalVsEasy = runMatch(LEVEL.NORMAL, LEVEL.EASY);
const hardVsEasy = runMatch(LEVEL.HARD, LEVEL.EASY);
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

// --- 판정 -------------------------------------------------------------------
console.log('\n=== 판정 ===');
let failed = 0;
const judge = (name, pass, detail) => {
  console.log(`  ${pass ? 'PASS' : 'FAIL'} - ${name}${detail ? `  (${detail})` : ''}`);
  if (!pass) failed++;
};

// 서열: 승부가 난 판에서 과반을 넘고, 지는 판이 이기는 판보다 많지 않아야 한다.
const ranks = (m) =>
  m.decisive > 0 ? m.decisiveRate > 50 && m.win > m.loss : m.loss === 0;
judge(`${hardVsNormal.A} > ${hardVsNormal.B}`, ranks(hardVsNormal),
  `${fmt(hardVsNormal)}, 승부 난 판 ${hardVsNormal.decisiveRate}%`);
judge(`${normalVsEasy.A} > ${normalVsEasy.B}`, ranks(normalVsEasy),
  `${fmt(normalVsEasy)}, 승부 난 판 ${normalVsEasy.decisiveRate}%`);
judge(`${hardVsEasy.A} > ${hardVsEasy.B}`, ranks(hardVsEasy),
  `${fmt(hardVsEasy)}, 승부 난 판 ${hardVsEasy.decisiveRate}%`);

// 양색 우세 — 한 색에서만 이기면 실력이 아니라 선공 프리미엄이다.
console.log(`  [기준선] 같은 실력끼리도 흑이 ${control.blackFirstRate}% 이긴다 — 자유룰의 구조적 선공 이점`);
judge('어려움이 흑을 잡으면 보통에게 앞선다', hardVsNormal.blackNet > 0,
  `흑 순승 ${hardVsNormal.blackNet}`);
// 백일 때의 절대 승률로 판정하면 자유룰의 선공 이점에 가려 아무것도 못 본다.
// 같은 실력끼리 백을 잡았을 때의 승수를 기준선으로 삼아 비교한다.
judge('어려움이 백을 잡으면 동급(보통)이 백일 때보다 잘 버틴다',
  hardVsNormal.whiteWins >= control.whiteWins,
  `어려움(백) ${hardVsNormal.whiteWins}승 vs 기준선 ${control.whiteWins}승 / ${GAMES_PER_COLOR}판`);

// 난이도 간 격차가 실제로 벌어지는가 — 라벨만 다르고 실력이 같으면 의미가 없다.
judge('어려움-쉬움 격차가 어려움-보통 격차보다 크다',
  hardVsEasy.decisiveRate >= hardVsNormal.decisiveRate,
  `${hardVsEasy.decisiveRate}% vs ${hardVsNormal.decisiveRate}%`);

// 무승부가 대부분이면 측정이 퇴화한 것이다 — 개시 국면을 더 흩뿌려야 한다는 신호.
const totalDraws = control.draw + hardVsNormal.draw + normalVsEasy.draw + hardVsEasy.draw;
const totalGames = GAMES_PER_COLOR * 2 * 4;
judge('승부가 나는 판이 과반', totalDraws < totalGames / 2,
  `무승부 ${totalDraws}/${totalGames}`);

judge('어려움 사고 시간이 예산 안', maxThinkMs <= HARD_TIME_MS * 1.5,
  `최대 ${maxThinkMs}ms / 예산 ${HARD_TIME_MS}ms`);

console.log(`\n# selfplay: ${failed === 0 ? '전부 통과' : `${failed}건 실패`} (소요 ${elapsed}s)`);
if (failed) process.exitCode = 1;
