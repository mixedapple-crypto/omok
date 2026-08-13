/**
 * ai.js 정책 테스트 — 난이도별 규칙이 의도대로 동작하는지 고정한다.
 *
 * selfplay는 승률만 알려주고 원인을 못 짚는다. 특히 "이긴 판을 안 두고 막는" 버그는
 * 승률에 조금씩만 드러나 끝까지 안 잡힌다. 그래서 국면을 직접 만들어 단언한다.
 */
import { AI, LEVEL, makeRng, candidates, findVcf } from '../www/js/ai.js';
import { BLACK, WHITE, CELLS, idx } from '../www/js/board.js';
import { analyzeMove } from '../www/js/patterns.js';
import { ok, eq, report } from './_assert.js';

const P = (r, c) => idx(r, c);
const rc = (i) => `(${(i / 15) | 0},${i % 15})`;

function boardWith(...groups) {
  const cells = new Int8Array(CELLS);
  for (const [color, coords] of groups) {
    for (const [r, c] of coords) cells[idx(r, c)] = color;
  }
  return cells;
}

const ai = (level) => new AI(level, { random: makeRng(12345), timeMs: 300 });
const inSet = (name, move, set) =>
  ok(name, set.includes(move), `기대: {${set.map(rc).join(', ')}} / 실제: ${rc(move)}`);
const notInSet = (name, move, set) =>
  ok(name, !set.includes(move), `금지: {${set.map(rc).join(', ')}} / 실제: ${rc(move)}`);

// 흑 4목과 백 4목이 동시에 있는 국면. 흑 차례.
// 여기서 막으러 가면 진다 — 초안 설계의 가장 큰 결함이 이 자리에서 드러난다 (결정 D5).
const BOTH_FOURS = () => boardWith(
  [BLACK, [[7, 3], [7, 4], [7, 5], [7, 6]]],
  [WHITE, [[9, 3], [9, 4], [9, 5], [9, 6]]],
);
const MY_WINS = [P(7, 2), P(7, 7)];
const OPP_WINS = [P(9, 2), P(9, 7)];

for (const level of [LEVEL.EASY, LEVEL.NORMAL, LEVEL.HARD]) {
  const move = ai(level).chooseMove(BOTH_FOURS(), BLACK);
  inSet(`[${level}] 이길 수 있으면 막지 않고 이긴다`, move, MY_WINS);
  notInSet(`[${level}] 이길 수 있는데 차단으로 새지 않는다`, move, OPP_WINS);
}

// 내가 이길 수 없고 상대가 다음 수에 이기는 국면 → 전 난이도가 막아야 한다.
const MUST_BLOCK = () => boardWith(
  [BLACK, [[0, 0], [0, 1]]],
  [WHITE, [[7, 3], [7, 4], [7, 5], [7, 6]]],
);
const BLOCK_FIVE = [P(7, 2), P(7, 7)];
for (const level of [LEVEL.EASY, LEVEL.NORMAL, LEVEL.HARD]) {
  const move = ai(level).chooseMove(MUST_BLOCK(), BLACK);
  inSet(`[${level}] 상대 5목은 반드시 막는다`, move, BLOCK_FIVE);
}

// 내가 열린4를 만들 수 있는 국면 → 보통·어려움은 만든다.
const CAN_MAKE_OPEN_FOUR = () => boardWith(
  [BLACK, [[7, 4], [7, 5], [7, 6]]],
  [WHITE, [[0, 0], [0, 2], [2, 0]]],
);
for (const level of [LEVEL.NORMAL, LEVEL.HARD]) {
  const move = ai(level).chooseMove(CAN_MAKE_OPEN_FOUR(), BLACK);
  inSet(`[${level}] 막을 수 없는 4를 만들 수 있으면 만든다`, move, [P(7, 3), P(7, 7)]);
}

// ---------------------------------------------------------------------------
// 쉬움의 결정론적 핸디캡 (결정 D8)
// "상대의 4목은 막지만 열린3은 절대 막지 않는다" → 아이에게 배울 수 있는 승리 공식이 생긴다.
// ---------------------------------------------------------------------------
const OPP_OPEN_THREE = () => boardWith(
  [BLACK, [[10, 10], [10, 11]]],
  [WHITE, [[7, 4], [7, 5], [7, 6]]],
);
const BLOCK_POINTS = [P(7, 3), P(7, 7)];
{
  const move = ai(LEVEL.EASY).chooseMove(OPP_OPEN_THREE(), BLACK);
  notInSet('[easy] 상대 열린3을 막지 않는다 — 의도된 핸디캡', move, BLOCK_POINTS);
}
{
  const move = ai(LEVEL.NORMAL).chooseMove(OPP_OPEN_THREE(), BLACK);
  inSet('[normal] 상대 열린3은 정확히 막는다', move, BLOCK_POINTS);
}
{
  const move = ai(LEVEL.HARD).chooseMove(OPP_OPEN_THREE(), BLACK);
  inSet('[hard] 상대 열린3은 정확히 막는다', move, BLOCK_POINTS);
}
{
  // 핸디캡이 "아무것도 안 막는다"로 새면 안 된다 — 4목은 여전히 막아야 재미가 있다.
  const move = ai(LEVEL.EASY).chooseMove(MUST_BLOCK(), BLACK);
  inSet('[easy] 그래도 상대 4목은 막는다', move, BLOCK_FIVE);
}
{
  // 쉬움은 자기 공격은 정상적으로 한다 — 무기력해 보이면 안 된다.
  const cells = boardWith([BLACK, [[7, 6], [7, 7]]], [WHITE, [[0, 0], [3, 3]]]);
  const move = ai(LEVEL.EASY).chooseMove(cells, BLACK);
  const extends3 = [P(7, 5), P(7, 8)].includes(move);
  ok('[easy] 자기 모양은 정상적으로 키운다', extends3, `실제: ${rc(move)}`);
}

// ---------------------------------------------------------------------------
// 이중 위협
// ---------------------------------------------------------------------------
{
  // (7,7)에 두면 가로·세로 열린3이 동시에 생긴다.
  const cells = boardWith(
    [BLACK, [[7, 5], [7, 6], [5, 7], [6, 7]]],
    [WHITE, [[0, 0], [0, 1], [12, 12]]],
  );
  const move = ai(LEVEL.NORMAL).chooseMove(cells, BLACK);
  eq('[normal] 쌍삼 자리를 찾는다', move, P(7, 7));
}
{
  // 상대가 쌍삼을 두려는 자리를 막는다 — 단순 합산이면 놓치는 국면이다 (결정 D6).
  const cells = boardWith(
    [WHITE, [[7, 5], [7, 6], [5, 7], [6, 7]]],
    [BLACK, [[0, 0], [0, 1], [12, 12]]],
  );
  const move = ai(LEVEL.NORMAL).chooseMove(cells, BLACK);
  eq('[normal] 상대 쌍삼 자리를 막는다', move, P(7, 7));
}

// ---------------------------------------------------------------------------
// 후보 생성 · 탐색 · 부작용
// ---------------------------------------------------------------------------
{
  const empty = new Int8Array(CELLS);
  eq('빈 반상의 첫 수는 천원', ai(LEVEL.HARD).chooseMove(empty, BLACK), P(7, 7));
  eq('빈 반상의 후보는 천원 하나', candidates(empty).length, 1);
}
{
  const cells = boardWith([BLACK, [[7, 7]]]);
  const cand = candidates(cells);
  ok('후보는 기존 돌 반경 2칸 안', cand.length === 24, `실제: ${cand.length}`);
  ok('점유 칸은 후보에서 빠진다', !cand.includes(P(7, 7)));
}
{
  // 강제수가 없는 조용한 국면이어야 탐색이 실제로 돈다.
  // (어느 쪽이든 3연속이 있으면 하드 규칙이 먼저 잡아 탐색을 건너뛴다.)
  const cells = boardWith(
    [BLACK, [[7, 7], [8, 9]]],
    [WHITE, [[7, 8], [9, 6]]],
  );
  const before = Int8Array.from(cells);
  const engine = ai(LEVEL.HARD);
  const move = engine.chooseMove(cells, BLACK);
  ok('탐색이 보드를 원상복구한다', before.every((v, i) => v === cells[i]));
  ok('둘 수 있는 자리를 고른다', cells[move] === 0);
  ok('어려움은 실제로 탐색한다 (깊이 4 이상 도달)', engine.stats.depth >= 4,
    `도달 깊이: ${engine.stats.depth}, 노드: ${engine.stats.nodes}`);
  ok('탐색 시간이 예산 안이다', engine.stats.ms <= 400,
    `실제: ${engine.stats.ms}ms (예산 300ms)`);
}
{
  // 강제수가 있으면 탐색을 건너뛴다 — 확정된 답에 시간을 쓰지 않는다.
  const engine = ai(LEVEL.HARD);
  engine.chooseMove(MUST_BLOCK(), BLACK);
  eq('강제수 국면에서는 탐색하지 않는다', engine.stats.nodes, 0);
}
{
  // 같은 시드면 같은 수 — 재현성이 없으면 selfplay 결과를 추적할 수 없다.
  const cells = boardWith([BLACK, [[7, 7]]], [WHITE, [[7, 8]]]);
  const a = new AI(LEVEL.NORMAL, { random: makeRng(99) }).chooseMove(cells, BLACK);
  const b = new AI(LEVEL.NORMAL, { random: makeRng(99) }).chooseMove(cells, BLACK);
  eq('같은 시드는 같은 수를 둔다', a, b);
}

// ---------------------------------------------------------------------------
// VCF — 연속 4로 이기는 수순. 어려움만 본다.
// ---------------------------------------------------------------------------
{
  // 흑이 (7,6)에 두면 (7,3)~(7,6) 4가 되고, 왼쪽은 백에게 막혀 있어 백은 (7,7)로 강제된다.
  // 그 뒤 흑은 세로로 다시 4를 만들어 이어간다.
  const cells = boardWith(
    [BLACK, [[7, 3], [7, 4], [7, 5], [4, 7], [5, 7], [6, 7]]],
    [WHITE, [[7, 2], [3, 7], [0, 0], [1, 1], [2, 2]]],
  );
  const move = ai(LEVEL.HARD).chooseMove(cells, BLACK);
  ok('[hard] 강제 승리 수순을 찾는다', cells[move] === 0, `실제: ${rc(move)}`);
  // 이 국면은 세로 (4,7)~(6,7)이 3이고 위가 백에게 막혔으니 (7,7)이 4를 만든다.
  // 어느 쪽이든 4를 만드는 수여야 한다 — 한가한 수를 두면 안 된다.
  const made = analyzeMove(cells, move, BLACK);
  ok('[hard] 고른 수가 4를 만든다 — 한가한 수를 두지 않는다',
    made.fours >= 1 || made.five, `fours=${made.fours}, five=${made.five}`);
}
{
  // 아무 강제 수순도 없는 조용한 국면에서 VCF가 헛것을 보면 안 된다.
  // (헛것을 보면 엉뚱한 수를 두고, 그게 곧 실력 저하다.)
  const cells = boardWith(
    [BLACK, [[7, 7], [9, 4]]],
    [WHITE, [[7, 8], [4, 9]]],
  );
  const engine = ai(LEVEL.HARD);
  const move = engine.chooseMove(cells, BLACK);
  ok('[hard] 강제 수순이 없으면 일반 탐색으로 간다', engine.stats.depth >= 4,
    `stats.depth=${engine.stats.depth} (-1이면 VCF 오탐)`);
}
{
  // 상대의 강제 수순도 끊어야 한다.
  // 어떤 장치(하드 규칙이든 VCF든)가 잡아내는지가 아니라 **결과**를 단언한다 —
  // 메커니즘을 단언하면 더 나은 경로로 막았을 때 테스트가 헛되이 깨진다.
  const cells = boardWith(
    [WHITE, [[7, 3], [7, 4], [7, 5], [4, 7], [5, 7], [6, 7]]],
    [BLACK, [[7, 2], [3, 7], [0, 0], [1, 1], [2, 2]]],
  );
  ok('전제 확인: 그냥 두면 백에게 강제 승리 수순이 있다', findVcf(cells, WHITE) >= 0);

  const move = ai(LEVEL.HARD).chooseMove(cells, BLACK);
  cells[move] = BLACK;
  ok('[hard] 막고 나면 백의 강제 승리 수순이 사라진다', findVcf(cells, WHITE) < 0,
    `둔 수: ${rc(move)}`);
}
{
  // 보통은 VCF를 쓰지 않는다 — 난이도 차이가 여기서 난다.
  const cells = boardWith(
    [BLACK, [[7, 3], [7, 4], [7, 5], [4, 7], [5, 7], [6, 7]]],
    [WHITE, [[7, 2], [3, 7], [0, 0], [1, 1], [2, 2]]],
  );
  const engine = ai(LEVEL.NORMAL);
  engine.chooseMove(cells, BLACK);
  ok('[normal] VCF를 쓰지 않는다', engine.stats.depth !== -1);
}

report('ai.test');
