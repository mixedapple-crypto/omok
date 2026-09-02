/**
 * tactics.js 테스트 — 오목 교실·코치·배지가 공유하는 기술 판정을 고정한다.
 *
 * 이 파일이 존재하는 이유: 퍼즐 정답은 사람이 적지 않고 엔진이 열거한다. 그 열거가
 * 틀리면 아이는 "맞게 뒀는데 틀렸대"를 겪고, 그 결함은 화면만 봐서는 절대 안 보인다.
 * 특히 띈삼의 막는 자리(가운데+양끝)와 붙은 삼의 막는 자리(바로 옆 둘)가 다르다는
 * 사실을 표로 적지 않고 기능적 정의에서 얻는데, 그 정의가 실제로 그렇게 내는지 여기서 본다.
 */
import {
  SKILL, SKILL_NAME, BADGE_SKILLS, skillsOfMove, hasSkill, findSkillSpots, defenseSpots,
  shapeCells, vcfSpots, vcfWins,
} from '../www/omok/js/tactics.js';
import { BLACK, WHITE, CELLS, idx } from '../www/omok/js/board.js';
import { ok, eq, eqArr, report } from './_assert.js';

const P = (r, c) => idx(r, c);
const rc = (i) => `(${(i / 15) | 0},${i % 15})`;
const show = (arr) => `{${arr.map(rc).join(', ')}}`;

function boardWith(...groups) {
  const cells = new Int8Array(CELLS);
  for (const [color, coords] of groups) {
    for (const [r, c] of coords) cells[idx(r, c)] = color;
  }
  return cells;
}
const sameSet = (name, actual, expected) => {
  const a = [...actual].sort((x, y) => x - y);
  const e = [...expected].sort((x, y) => x - y);
  ok(name, a.length === e.length && a.every((v, i) => v === e[i]), `기대 ${show(e)} / 실제 ${show(a)}`);
};

// --- 이름표 -------------------------------------------------------------------
for (const k of Object.values(SKILL)) {
  ok(`기술 '${k}' 에 아이용 이름이 있다`, !!SKILL_NAME[k]?.ko && !!SKILL_NAME[k]?.code);
}
ok('배지 대상은 전부 기술 목록에 있다', BADGE_SKILLS.every((k) => Object.values(SKILL).includes(k)));
ok('뚫린 사는 배지 대상이 아니다 — 상대의 실수로 생긴다', !BADGE_SKILLS.includes(SKILL.OPEN_FOUR));

// --- 한 수의 기술 판정 -------------------------------------------------------------
{
  // 가로 열린2 + 세로 열린2 가 (7,7)에서 만난다.
  const cells = boardWith([BLACK, [[7, 5], [7, 6], [5, 7], [6, 7]]]);
  const s = skillsOfMove(cells, P(7, 7), BLACK);
  eq('쌍삼: 열린3 두 개', s.openThrees, 2);
  eq('쌍삼 이름표', s.label, SKILL.DOUBLE_THREE);
  ok('hasSkill 배열 형태도 통한다', hasSkill(s, [SKILL.FOUR_THREE, SKILL.DOUBLE_THREE]));

  // 한쪽 2가 막히면 삼 하나뿐이다.
  cells[P(7, 4)] = WHITE;
  const s2 = skillsOfMove(cells, P(7, 7), BLACK);
  eq('한쪽이 막히면 쌍삼이 아니라 삼', s2.label, SKILL.THREE);
}
{
  const cells = boardWith(
    [BLACK, [[7, 4], [7, 5], [7, 6], [5, 7], [6, 7]]],
    [WHITE, [[7, 3]]],
  );
  const s = skillsOfMove(cells, P(7, 7), BLACK);
  eq('사삼: 막힌4 하나 + 열린3 하나', `${s.fours}/${s.openThrees}`, '1/1');
  eq('사삼 이름표', s.label, SKILL.FOUR_THREE);
}
{
  const cells = boardWith(
    [BLACK, [[7, 4], [7, 5], [7, 6], [4, 7], [5, 7], [6, 7]]],
    [WHITE, [[7, 3], [3, 7]]],
  );
  const s = skillsOfMove(cells, P(7, 7), BLACK);
  eq('사사 이름표', s.label, SKILL.DOUBLE_FOUR);
}
{
  const cells = boardWith([BLACK, [[7, 3], [7, 4], [7, 5], [7, 6]]]);
  eq('다섯 이름표', skillsOfMove(cells, P(7, 7), BLACK).label, SKILL.FIVE);
}
{
  const cells = boardWith([BLACK, [[7, 4], [7, 5], [7, 6]]]);
  eq('뚫린 사 이름표', skillsOfMove(cells, P(7, 7), BLACK).label, SKILL.OPEN_FOUR);
  cells[P(7, 3)] = WHITE;
  eq('한쪽 막힌 사 이름표', skillsOfMove(cells, P(7, 7), BLACK).label, SKILL.FOUR);
}
{
  const cells = boardWith([BLACK, [[7, 5], [7, 6]]]);
  eq('붙은 삼', skillsOfMove(cells, P(7, 7), BLACK).label, SKILL.THREE);
  eq('띈삼(둘·빈칸·하나)도 삼이다', skillsOfMove(cells, P(7, 8), BLACK).label, SKILL.THREE);
  eq('두 칸 띄면 삼이 아니다', skillsOfMove(cells, P(7, 9), BLACK).label, null);
}
{
  // 반상 가장자리: 0행에 붙은 세로 3은 뚫린 사가 될 수 없으므로 삼이 아니다.
  const cells = boardWith([BLACK, [[0, 7], [1, 7]]]);
  eq('0행에 붙은 세로 삼은 삼이 아니다', skillsOfMove(cells, P(2, 7), BLACK).label, null);
  const mid = boardWith([BLACK, [[6, 7], [7, 7]]]);
  eq('같은 모양이 중앙이면 삼이다', skillsOfMove(mid, P(8, 7), BLACK).label, SKILL.THREE);
}

// --- 자리 열거: 정답은 엔진이 전부 센다 -----------------------------------------------
{
  const cells = boardWith([BLACK, [[7, 5], [7, 6]]]);
  sameSet('열린2에서 삼이 되는 자리는 넷(붙은 둘 + 띈 둘)',
    findSkillSpots(cells, BLACK, SKILL.THREE), [P(7, 4), P(7, 7), P(7, 3), P(7, 8)]);
}
{
  const cells = boardWith([BLACK, [[7, 4], [7, 5], [7, 6]]]);
  sameSet('열린3에서 뚫린 사가 되는 자리는 양옆 둘',
    findSkillSpots(cells, BLACK, SKILL.OPEN_FOUR), [P(7, 3), P(7, 7)]);
  sameSet('열린3에서 사(막힌 것 포함)가 되는 자리는 넷',
    findSkillSpots(cells, BLACK, SKILL.FOUR), [P(7, 2), P(7, 3), P(7, 7), P(7, 8)]);
}
{
  const cells = boardWith([BLACK, [[7, 5], [7, 6], [5, 7], [6, 7]]]);
  sameSet('쌍삼 자리는 교차점 하나뿐', findSkillSpots(cells, BLACK, SKILL.DOUBLE_THREE), [P(7, 7)]);
}

// --- 막는 자리: 모양별 표 없이 기능적 정의만으로 -------------------------------------------
{
  const cells = boardWith([WHITE, [[7, 5], [7, 6], [7, 7]]]);
  sameSet('붙은 삼을 막는 자리는 바로 옆 둘',
    defenseSpots(cells, BLACK, SKILL.OPEN_FOUR), [P(7, 4), P(7, 8)]);
}
{
  const cells = boardWith([WHITE, [[7, 5], [7, 6], [7, 8]]]);
  sameSet('띈삼을 막는 자리는 가운데와 양끝 셋',
    defenseSpots(cells, BLACK, SKILL.OPEN_FOUR), [P(7, 7), P(7, 4), P(7, 9)]);
}
{
  const cells = boardWith([WHITE, [[7, 4], [7, 5], [7, 6], [7, 7]]], [BLACK, [[7, 3]]]);
  sameSet('막힌 사를 막는 자리는 하나', defenseSpots(cells, BLACK, SKILL.FIVE), [P(7, 8)]);
}
{
  const cells = boardWith([WHITE, [[7, 5], [7, 6], [7, 8], [7, 9]]]);
  sameSet('띈 사(둘·빈칸·둘)를 막는 자리는 가운데', defenseSpots(cells, BLACK, SKILL.FIVE), [P(7, 7)]);
}
{
  const cells = boardWith([WHITE, [[7, 4], [7, 5], [7, 6], [7, 7]]]);
  eqArr('뚫린 사는 한 수로 못 막는다 — 빈 배열', defenseSpots(cells, BLACK, SKILL.FIVE), []);
}
{
  const cells = boardWith([WHITE, [[7, 5], [7, 6]]]);
  eqArr('위협이 없으면 막을 자리도 없다', defenseSpots(cells, BLACK, SKILL.OPEN_FOUR), []);
}
{
  // 상대가 다음 수에 쌍삼을 만들 수 있는 국면 — 미리 막기.
  const cells = boardWith([WHITE, [[7, 5], [7, 6], [5, 7], [6, 7]]]);
  const spots = defenseSpots(cells, BLACK, [SKILL.DOUBLE_THREE, SKILL.FOUR_THREE, SKILL.DOUBLE_FOUR]);
  ok('교차점을 먼저 차지하면 막힌다', spots.includes(P(7, 7)), show(spots));
  ok('한쪽 2의 바로 옆을 막아도 막힌다', spots.includes(P(7, 4)), show(spots));
  ok('한 칸 떨어진 곳은 막는 게 아니다', !spots.includes(P(7, 2)), show(spots));
  ok('엉뚱한 곳은 당연히 아니다', !spots.includes(P(0, 0)));
}

// --- 모양 강조 --------------------------------------------------------------------
{
  const cells = boardWith([BLACK, [[7, 5], [7, 6], [7, 8]]]);
  eqArr('띈 모양도 한 줄로 잡는다', shapeCells(cells, P(7, 7), BLACK, 0), [P(7, 5), P(7, 6), P(7, 7), P(7, 8)]);
  cells[P(7, 9)] = WHITE;
  eqArr('상대 돌에서 멈춘다', shapeCells(cells, P(7, 7), BLACK, 0), [P(7, 5), P(7, 6), P(7, 7), P(7, 8)]);
}

// --- 연속 사(VCF) ------------------------------------------------------------------
{
  // 레슨 9의 뼈대: 사를 두 번 만들어 사삼에 닿는다.
  //   7행: O X X X .           8행: . X X X O (오른쪽)      (10,7)에 X 하나
  // (7,7)에 사 → 막힘 → (8,7)에 사 + 세로 띈삼((7,7)(8,7)(10,7)) → 사삼. 순서를 바꿔도 된다.
  // ⚠️ 두 줄을 나란히 붙이면 의도하지 않은 대각선 삼이 생겨 곧장 사삼이 나온다 — 그래서 어긋나게 놓았다.
  const cells = boardWith(
    [BLACK, [[7, 4], [7, 5], [7, 6], [10, 7], [8, 8], [8, 9], [8, 10]]],
    [WHITE, [[7, 3], [8, 11]]],
  );
  eqArr('두 수 안에는 못 이긴다', vcfSpots(cells, BLACK, 2), []);
  sameSet('세 수 안에 이기는 첫 수는 둘 다 정답', vcfSpots(cells, BLACK, 3), [P(7, 7), P(8, 7)]);
  ok('vcfWins도 같은 답', vcfWins(cells, BLACK, P(7, 7), 3) && !vcfWins(cells, BLACK, P(7, 7), 2));
}
{
  const cells = boardWith(
    [BLACK, [[7, 4], [7, 5], [7, 6], [5, 7], [6, 7]]],
    [WHITE, [[7, 3]]],
  );
  ok('사삼 자리는 깊이 2의 연속 사다', vcfSpots(cells, BLACK, 2).includes(P(7, 7)));
}
{
  const cells = boardWith([BLACK, [[7, 4], [7, 5], [7, 6]]]);
  sameSet('뚫린 사 자리는 깊이 1의 연속 사다', vcfSpots(cells, BLACK, 1), [P(7, 3), P(7, 7)]);
}
{
  const cells = boardWith([BLACK, [[7, 5], [7, 6]]]);
  eqArr('둘뿐이면 연속 사가 없다', vcfSpots(cells, BLACK, 3), []);
}

report('tactics.test');
