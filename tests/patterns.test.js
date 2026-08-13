/**
 * patterns.js 테스트.
 *
 * 이 파일이 존재하는 이유: AI 품질을 결정하는 것은 패턴 분류인데, selfplay는
 * "뭔가 이상하다"까지만 알려주고 원인을 못 짚는다. 특히 반상 가장자리에 붙은 3을
 * 열린3으로 오분류하는 버그는 승률에 미미하게만 드러나 끝까지 안 잡힌다.
 */
import {
  T, THREAT_SCORE, classifyWindowString, threatAt, analyzeMove,
  doubleThreatBonus, lineScore, evalPosition,
} from '../www/js/patterns.js';
import { BLACK, WHITE, CELLS, SIZE, idx } from '../www/js/board.js';
import { ok, eq, report } from './_assert.js';

const NAME = ['없음', '막힌2', '열린2', '막힌3', '열린3', '막힌4', '열린4', '5목'];
const w = (name, str, expected) =>
  ok(`${name}  "${str}"`, classifyWindowString(str) === expected,
    `기대: ${NAME[expected]} / 실제: ${NAME[classifyWindowString(str)]}`);

// --- 창 분류: 기본형 ('.'=빈칸, 'X'=나, '#'=막힘, 중심은 index 4) ---------------
w('5목', 'XXXXX....', T.FIVE);
w('5목 (중앙)', '..XXXXX..', T.FIVE);
w('장목도 5목 등급', '.XXXXXX..', T.FIVE);
w('열린4', '.XXXX....', T.OPEN_FOUR);
w('막힌4 (한쪽 벽)', '#XXXX....', T.FOUR);
w('막힌4 (한쪽 상대돌)', '.XXXX#...', T.FOUR);
// 양쪽이 다 막힌 4는 영원히 5목이 될 수 없다 — 겉모습이 4라고 위협으로 세면 안 된다.
w('양쪽 막힌 4는 위협이 아니다', '#XXXX#...', T.NONE);
w('끊어진4', 'XX.XX....', T.FOUR);
w('열린3', '...XXX...', T.OPEN_THREE);
w('열린3 (치우침)', '..XXX....', T.OPEN_THREE);
w('끊어진3도 열린3 — 열린4를 만들 수 있으므로', '.XX.X....', T.OPEN_THREE);
w('막힌3', '.#XXX....', T.CLOSED_THREE);
w('양쪽 막힌 3은 위협이 아니다', '##XXX##..', T.NONE);
w('열린2', '...XX....', T.OPEN_TWO);
w('외톨이는 위협 없음', '....X....', T.NONE);
w('사방이 막힌 돌은 위협이 아니다', '####X####', T.NONE);
// 같은 2연속인데 남은 공간이 5칸에 못 미치면 영원히 5목이 될 수 없다 — 위협 0이어야 한다.
w('공간이 3칸뿐인 2연속은 위협이 아니다', '###XX.###', T.NONE);
w('공간이 충분한 2연속은 열린2', '#..XX..##', T.OPEN_TWO);

// --- 반상 가장자리: 여기가 핵심이다 -------------------------------------------
{
  // 세로 3을 0행에 붙여 만든다. 위쪽이 반상 밖이므로 열린3이 될 수 없다.
  const cells = new Int8Array(CELLS);
  for (let r = 0; r < 3; r++) cells[idx(r, 7)] = BLACK;
  const t = threatAt(cells, idx(1, 7), BLACK, 1); // dir 1 = 세로
  ok('0행에 붙은 세로 3은 열린3이 아니다', t === T.CLOSED_THREE,
    `실제: ${NAME[t]}`);
}
{
  // 같은 모양을 중앙에 두면 열린3이어야 한다 — 위 판정이 그냥 3을 못 알아보는 게 아님을 보인다.
  const cells = new Int8Array(CELLS);
  for (let r = 6; r < 9; r++) cells[idx(r, 7)] = BLACK;
  const t = threatAt(cells, idx(7, 7), BLACK, 1);
  ok('같은 3이 중앙에 있으면 열린3이다', t === T.OPEN_THREE, `실제: ${NAME[t]}`);
}
{
  const cells = new Int8Array(CELLS);
  for (let r = SIZE - 3; r < SIZE; r++) cells[idx(r, 7)] = BLACK;
  const t = threatAt(cells, idx(SIZE - 2, 7), BLACK, 1);
  ok('14행에 붙은 세로 3도 열린3이 아니다', t === T.CLOSED_THREE, `실제: ${NAME[t]}`);
}
{
  const cells = new Int8Array(CELLS);
  for (let c = 0; c < 3; c++) cells[idx(7, c)] = WHITE;
  const t = threatAt(cells, idx(7, 1), WHITE, 0);
  ok('0열에 붙은 가로 3도 열린3이 아니다 (백)', t === T.CLOSED_THREE, `실제: ${NAME[t]}`);
}
{
  // 가장자리라도 4는 여전히 4다 — 경계 처리가 위협을 통째로 지워버리면 안 된다.
  const cells = new Int8Array(CELLS);
  for (let c = 0; c < 4; c++) cells[idx(0, c)] = BLACK;
  const t = threatAt(cells, idx(0, 1), BLACK, 0);
  ok('0행 0열에 붙은 가로 4는 막힌4', t === T.FOUR, `실제: ${NAME[t]}`);
}
{
  const cells = new Int8Array(CELLS);
  for (let c = 0; c < 5; c++) cells[idx(0, c)] = BLACK;
  const t = threatAt(cells, idx(0, 2), BLACK, 0);
  ok('구석의 5목은 5목', t === T.FIVE, `실제: ${NAME[t]}`);
}

// --- 점수표 순서 (Fable 지적 #2: 막힌4 > 열린3 이어야 한다) ---------------------
ok('막힌4가 열린3보다 높다', THREAT_SCORE[T.FOUR] > THREAT_SCORE[T.OPEN_THREE]);
ok('열린4가 막힌4보다 높다', THREAT_SCORE[T.OPEN_FOUR] > THREAT_SCORE[T.FOUR]);
ok('5목이 최고', THREAT_SCORE[T.FIVE] > THREAT_SCORE[T.OPEN_FOUR]);
ok('열린3이 막힌3보다 높다', THREAT_SCORE[T.OPEN_THREE] > THREAT_SCORE[T.CLOSED_THREE]);
ok('등급 순서와 점수 순서가 일치한다',
  THREAT_SCORE.every((v, i) => i === 0 || v > THREAT_SCORE[i - 1]));

// --- 이중 위협 보너스 ---------------------------------------------------------
eq('4-4 보너스', doubleThreatBonus(2, 0), 100000);
eq('4-3 보너스', doubleThreatBonus(1, 1), 80000);
eq('쌍삼 보너스', doubleThreatBonus(0, 2), 50000);
eq('단독 위협엔 보너스 없음', doubleThreatBonus(1, 0), 0);
eq('단독 열린3엔 보너스 없음', doubleThreatBonus(0, 1), 0);
ok('쌍삼 보너스가 단독 열린3 점수보다 크다',
  doubleThreatBonus(0, 2) > THREAT_SCORE[T.OPEN_THREE] * 2);

{
  // (7,7)에 두면 가로 3과 세로 3이 동시에 생기는 쌍삼 국면.
  const cells = new Int8Array(CELLS);
  cells[idx(7, 5)] = BLACK;
  cells[idx(7, 6)] = BLACK;
  cells[idx(5, 7)] = BLACK;
  cells[idx(6, 7)] = BLACK;
  const a = analyzeMove(cells, idx(7, 7), BLACK);
  eq('쌍삼 수는 열린3을 2개 만든다', a.openThrees, 2);
  // 쌍삼은 막힌4보다 훨씬 급하지만(안 막으면 진다), 열린4보다는 낮다(열린4는 진짜로 못 막는다).
  ok('쌍삼이 막힌4보다 급하다', a.score > THREAT_SCORE[T.FOUR] * 4, `실제 점수: ${a.score}`);
  ok('쌍삼이 열린4보다는 낮다', a.score < THREAT_SCORE[T.OPEN_FOUR], `실제 점수: ${a.score}`);
  ok('쌍삼이 단순 합산보다 크다 — 보너스가 실제로 붙는다',
    a.score > THREAT_SCORE[T.OPEN_THREE] * 2 * 4, `실제 점수: ${a.score}`);
  eq('analyzeMove는 보드를 원상복구한다', cells[idx(7, 7)], 0);
}
{
  // 열린4를 만드는 수는 five=false, openFour=true 여야 한다.
  const cells = new Int8Array(CELLS);
  for (const c of [5, 6, 8]) cells[idx(7, c)] = BLACK;
  const a = analyzeMove(cells, idx(7, 7), BLACK);
  ok('열린4를 만드는 수를 인식한다', a.openFour === true && a.five === false);
}
{
  // 5목을 완성하는 수.
  const cells = new Int8Array(CELLS);
  for (const c of [3, 4, 6, 7]) cells[idx(7, c)] = BLACK;
  const a = analyzeMove(cells, idx(7, 5), BLACK);
  ok('5목 완성 수를 인식한다', a.five === true);
}

// --- 중복 계산 방지 -----------------------------------------------------------
{
  // 4연속을 lineScore가 4번 세면 점수가 4배가 된다 — 전형적 왜곡.
  const cells = new Int8Array(CELLS);
  for (let c = 3; c < 7; c++) cells[idx(7, c)] = BLACK;
  const s = lineScore(cells, BLACK, idx(7, 3), 0);
  eq('4연속은 한 번만 계산된다', s, THREAT_SCORE[T.OPEN_FOUR]);
}
{
  const cells = new Int8Array(CELLS);
  for (let c = 3; c < 7; c++) cells[idx(7, c)] = BLACK;
  eq('라인 어느 지점에서 조회해도 같은 값', lineScore(cells, BLACK, idx(7, 12), 0),
    lineScore(cells, BLACK, idx(7, 3), 0));
}

// --- 국면 평가 ---------------------------------------------------------------
{
  const cells = new Int8Array(CELLS);
  eq('빈 반상의 점수는 0', evalPosition(cells, BLACK), 0);
}
{
  const black = new Int8Array(CELLS);
  const white = new Int8Array(CELLS);
  for (let c = 5; c < 8; c++) {
    black[idx(7, c)] = BLACK;
    white[idx(7, c)] = WHITE;
  }
  eq('같은 모양이면 색이 달라도 같은 점수',
    evalPosition(black, BLACK), evalPosition(white, WHITE));
  ok('상대 모양은 내 점수에 들어가지 않는다', evalPosition(black, WHITE) === 0);
}
{
  const three = new Int8Array(CELLS);
  for (let c = 5; c < 8; c++) three[idx(7, c)] = BLACK;
  const four = new Int8Array(CELLS);
  for (let c = 5; c < 9; c++) four[idx(7, c)] = BLACK;
  ok('4가 3보다 높게 평가된다', evalPosition(four, BLACK) > evalPosition(three, BLACK));
}

report('patterns.test');
