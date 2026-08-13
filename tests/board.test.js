/**
 * board.js 승패 판정 테스트.
 * 판정 버그는 나중에 잡기 가장 괴로운 종류라 게임의 다른 부분보다 먼저 고정한다.
 */
import {
  Board, BLACK, WHITE, EMPTY, CELLS, SIZE,
  findWinLine, idx, parseCells, undoToLastOwn, canUndoOwn,
} from '../www/js/board.js';
import { ok, eq, eqArr, report } from './_assert.js';

/** 지정 좌표들에 색을 채운 cells를 만든다. */
function cellsWith(color, coords) {
  const cells = new Int8Array(CELLS);
  for (const [r, c] of coords) cells[idx(r, c)] = color;
  return cells;
}

const line = (r, c, dr, dc, n) =>
  Array.from({ length: n }, (_, k) => [r + dr * k, c + dc * k]);

// --- 4방향 5목 ---------------------------------------------------------------
{
  const cells = cellsWith(BLACK, line(7, 3, 0, 1, 5));
  ok('가로 5목', findWinLine(cells, idx(7, 5), BLACK) !== null);
}
{
  const cells = cellsWith(BLACK, line(3, 7, 1, 0, 5));
  ok('세로 5목', findWinLine(cells, idx(5, 7), BLACK) !== null);
}
{
  const cells = cellsWith(WHITE, line(3, 3, 1, 1, 5));
  ok('대각 ╲ 5목', findWinLine(cells, idx(5, 5), WHITE) !== null);
}
{
  const cells = cellsWith(WHITE, line(3, 11, 1, -1, 5));
  ok('대각 ╱ 5목', findWinLine(cells, idx(5, 9), WHITE) !== null);
}

// --- 자유룰: 장목도 승리 ------------------------------------------------------
{
  const cells = cellsWith(BLACK, line(7, 3, 0, 1, 6));
  const win = findWinLine(cells, idx(7, 5), BLACK);
  ok('장목(6목)도 승리 — 자유룰', win !== null);
  eq('장목 승리 라인은 6칸 전체', win?.length, 6);
}
{
  const cells = cellsWith(BLACK, line(7, 2, 0, 1, 7));
  ok('7목도 승리', findWinLine(cells, idx(7, 5), BLACK) !== null);
}

// --- 승리가 아닌 경우 ---------------------------------------------------------
{
  const cells = cellsWith(BLACK, line(7, 3, 0, 1, 4));
  ok('4목은 승리가 아니다', findWinLine(cells, idx(7, 5), BLACK) === null);
}
{
  // XXXX 뒤에 상대 돌, 그 뒤에 내 돌 하나 — 끊겼으므로 5목이 아니다.
  const cells = cellsWith(BLACK, line(7, 3, 0, 1, 4));
  cells[idx(7, 7)] = WHITE;
  cells[idx(7, 8)] = BLACK;
  ok('상대 돌로 끊긴 4+1은 승리가 아니다', findWinLine(cells, idx(7, 5), BLACK) === null);
}
{
  const cells = cellsWith(BLACK, line(7, 3, 0, 1, 5));
  ok('상대 색으로 조회하면 승리가 아니다', findWinLine(cells, idx(7, 5), WHITE) === null);
}

// --- 경계 (Fable 지적: 가장자리가 가장 잘 틀린다) ------------------------------
{
  const cells = cellsWith(BLACK, line(0, 0, 0, 1, 5));
  ok('경계 0행 · 0열에서 시작하는 가로 5목', findWinLine(cells, idx(0, 0), BLACK) !== null);
}
{
  const cells = cellsWith(BLACK, line(SIZE - 1, SIZE - 5, 0, 1, 5));
  ok('경계 14행 · 14열에서 끝나는 가로 5목', findWinLine(cells, idx(SIZE - 1, SIZE - 1), BLACK) !== null);
}
{
  const cells = cellsWith(WHITE, line(0, 0, 1, 0, 5));
  ok('경계 0열 세로 5목', findWinLine(cells, idx(0, 0), WHITE) !== null);
}
{
  const cells = cellsWith(WHITE, line(SIZE - 5, SIZE - 1, 1, 0, 5));
  ok('경계 14열 세로 5목', findWinLine(cells, idx(SIZE - 1, SIZE - 1), WHITE) !== null);
}
{
  const cells = cellsWith(BLACK, line(0, 0, 1, 1, 5));
  ok('경계 좌상단 대각 ╲ 5목', findWinLine(cells, idx(0, 0), BLACK) !== null);
}
{
  const cells = cellsWith(BLACK, line(0, SIZE - 1, 1, -1, 5));
  ok('경계 우상단 대각 ╱ 5목', findWinLine(cells, idx(0, SIZE - 1), BLACK) !== null);
}
{
  // 줄바꿈을 타고 넘어가면 안 된다 — 1차원 배열 구현의 전형적 버그.
  const cells = cellsWith(BLACK, [[3, 13], [3, 14], [4, 0], [4, 1], [4, 2]]);
  ok('행 경계를 넘어 이어지지 않는다', findWinLine(cells, idx(4, 0), BLACK) === null);
}

// --- 승리 라인 내용 -----------------------------------------------------------
{
  const cells = cellsWith(BLACK, line(7, 3, 0, 1, 5));
  eqArr('승리 라인은 정확히 그 5칸', findWinLine(cells, idx(7, 5), BLACK),
    [idx(7, 3), idx(7, 4), idx(7, 5), idx(7, 6), idx(7, 7)]);
}

// --- Board 동작 ---------------------------------------------------------------
{
  const b = new Board();
  eq('시작은 흑 차례', b.turn, BLACK);
  b.place(idx(7, 7));
  eq('한 수 뒤 백 차례', b.turn, WHITE);
  eq('마지막 수 기록', b.lastMove, idx(7, 7));
  ok('점유된 칸 착수 거부', b.place(idx(7, 7)) === false);
  eq('거부된 착수는 수를 늘리지 않는다', b.moveCount, 1);
  ok('반상 밖 착수 거부', b.place(-1) === false && b.place(CELLS) === false);
}
{
  const b = new Board();
  // 흑 5목을 만든다 (백은 멀리 둔다)
  for (let k = 0; k < 5; k++) {
    b.place(idx(7, 3 + k));
    if (k < 4) b.place(idx(0, k));
  }
  eq('흑 승리 확정', b.winner, BLACK);
  eq('승리 라인 길이 5', b.winLine.length, 5);
  ok('게임 종료 판정', b.isOver);
  ok('종료 후 착수 거부', b.place(idx(10, 10)) === false);

  b.undo();
  eq('무르면 승리가 해제된다', b.winner, EMPTY);
  ok('무르면 승리 라인도 사라진다', b.winLine === null);
  ok('무른 뒤에는 다시 둘 수 있다', b.place(idx(10, 10)) === true);
}
{
  const b = new Board();
  eq('빈 히스토리 무르기는 -1', b.undo(), -1);
  b.place(idx(5, 5));
  eq('무르기는 되돌린 인덱스를 준다', b.undo(), idx(5, 5));
  eq('무른 자리는 빈칸', b.at(idx(5, 5)), 0);
  eq('수 개수 0', b.moveCount, 0);
}
{
  const b = new Board();
  b.place(idx(7, 7));
  const c = b.clone();
  c.place(idx(0, 0));
  eq('clone은 원본과 독립이다', b.moveCount, 1);
  eq('clone은 상태를 복사한다', c.at(idx(7, 7)), BLACK);
}

// --- 꽉 찬 반상에서 오탐이 없는가 ---------------------------------------------
{
  // color = (r + floor(c/2)) % 2 는 4방향 모두 최대 연속 2라 5목이 생길 수 없다.
  // 225칸이 다 찼는데도 승자가 없는 상태 = 무승부 국면의 정합성 검사.
  const cells = new Int8Array(CELLS);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      cells[idx(r, c)] = (r + ((c / 2) | 0)) % 2 === 0 ? BLACK : WHITE;
    }
  }
  let falsePositive = null;
  for (let i = 0; i < CELLS && !falsePositive; i++) {
    if (findWinLine(cells, i, cells[i])) falsePositive = i;
  }
  ok('꽉 찬 무승부 국면에서 승리 오탐 0', falsePositive === null,
    falsePositive !== null ? `오탐 위치 index=${falsePositive}` : '');
}
{
  const b = new Board();
  b.history = new Array(CELLS).fill(0);
  ok('225수가 차면 종료 판정', b.isFull && b.isOver);
}

// --- 파서 ---------------------------------------------------------------------
{
  const cells = parseCells(`
    ...............
    ..XXXXX........
  `);
  ok('parseCells: 가로 5목을 만든다', findWinLine(cells, idx(1, 4), BLACK) !== null);
  eq('parseCells: X는 흑', cells[idx(1, 2)], BLACK);
  eq('parseCells: O는 백', parseCells('.O')[idx(0, 1)], WHITE);
  eq('parseCells: 점은 빈칸', cells[idx(0, 0)], EMPTY);
}

// --- 무르기 정책 (1인 대전) ----------------------------------------------------
{
  // 아이가 흑(선착)인 보통의 경우: 내 수 + 컴퓨터 수 2개가 함께 되돌아간다.
  const b = new Board();
  b.place(idx(7, 7)); // 나(흑)
  b.place(idx(7, 8)); // 컴퓨터(백)
  ok('내 수가 있으면 무르기 가능', canUndoOwn(b, BLACK));
  ok('무르기 성공', undoToLastOwn(b, BLACK));
  eq('내 수까지 함께 되돌아간다', b.moveCount, 0);
  eq('되돌린 뒤 다시 내 차례', b.turn, BLACK);
}
{
  // 아이가 백인 경우: 컴퓨터가 선착하므로 되돌릴 내 수가 아직 없다.
  const b = new Board();
  b.place(idx(7, 7)); // 컴퓨터(흑)
  ok('내 수가 없으면 무르기 불가', !canUndoOwn(b, WHITE));
  ok('무르기를 시도해도 아무 일도 없다', !undoToLastOwn(b, WHITE));
  eq('반상이 그대로', b.moveCount, 1);
}
{
  // 아이가 백이고 한 수 둔 뒤: 내 수만 되돌아가고 컴퓨터 선착은 남아야 한다.
  const b = new Board();
  b.place(idx(7, 7)); // 컴퓨터(흑)
  b.place(idx(7, 8)); // 나(백)
  b.place(idx(8, 8)); // 컴퓨터(흑)
  ok('무르기 성공', undoToLastOwn(b, WHITE));
  eq('내 마지막 수까지만 되돌아간다', b.moveCount, 1);
  eq('컴퓨터의 첫 수는 남는다', b.at(idx(7, 7)), BLACK);
  eq('되돌린 뒤 내(백) 차례', b.turn, WHITE);
}
{
  const b = new Board();
  ok('빈 반상에서는 무르기 불가', !canUndoOwn(b, BLACK));
  ok('빈 반상 무르기는 실패', !undoToLastOwn(b, BLACK));
}

report('board.test');
