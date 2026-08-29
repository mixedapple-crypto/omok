/**
 * 오목 보드 — 순수 로직. DOM에도 patterns.js에도 의존하지 않는다.
 * 승패 판정은 연속 개수만 세면 되므로 패턴 점수가 필요 없다 (결정 D12).
 *
 * 규칙: 자유룰 — 금수 없음, 5목 이상이면 승리(장목=6목 이상도 승리).
 */

export const SIZE = 15;
export const CELLS = SIZE * SIZE;

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

/** 자유룰 승리 길이. "이상"이므로 장목도 승리다. */
export const WIN_LEN = 5;

/**
 * 4방향. 반대 방향은 부호를 뒤집어 얻으므로 8개를 둘 필요가 없다.
 * 순서: 가로 ─ · 세로 │ · 우하향 ╲ · 우상향 ╱
 */
export const DIRS = Object.freeze([
  Object.freeze([0, 1]),
  Object.freeze([1, 0]),
  Object.freeze([1, 1]),
  Object.freeze([1, -1]),
]);

export const idx = (r, c) => r * SIZE + c;
export const rowOf = (i) => (i / SIZE) | 0;
export const colOf = (i) => i % SIZE;
export const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
export const opponent = (color) => (color === BLACK ? WHITE : BLACK);

/**
 * i에 놓인 color 돌을 지나는 5목 이상 구간을 찾는다.
 * 방금 둔 자리에서만 4방향을 훑으므로 매번 보드 전체를 검사하지 않는다.
 * @returns {number[]|null} 이긴 구간의 인덱스 전체(장목이면 6개 이상), 없으면 null
 */
export function findWinLine(cells, i, color) {
  const r0 = rowOf(i);
  const c0 = colOf(i);

  for (let d = 0; d < DIRS.length; d++) {
    const dr = DIRS[d][0];
    const dc = DIRS[d][1];

    // 연속 구간의 시작점까지 되짚는다.
    let r = r0;
    let c = c0;
    while (inBounds(r - dr, c - dc) && cells[idx(r - dr, c - dc)] === color) {
      r -= dr;
      c -= dc;
    }

    // 시작점부터 같은 색이 끊길 때까지 수집한다.
    const run = [];
    while (inBounds(r, c) && cells[idx(r, c)] === color) {
      run.push(idx(r, c));
      r += dr;
      c += dc;
    }

    // 자유룰이므로 5 "이상". 하이라이트를 위해 구간 전체를 돌려준다.
    if (run.length >= WIN_LEN) return run;
  }
  return null;
}

export class Board {
  constructor() {
    this.cells = new Int8Array(CELLS);
    /** 착수 순서(인덱스). 무르기와 마지막 수 표시의 근거다. */
    this.history = [];
    this.winner = EMPTY;
    this.winLine = null;
  }

  reset() {
    this.cells.fill(EMPTY);
    this.history.length = 0;
    this.winner = EMPTY;
    this.winLine = null;
    return this;
  }

  get moveCount() {
    return this.history.length;
  }

  /** 흑 선착. 사람이 백을 골라도 착수 순서 자체는 흑부터다. */
  get turn() {
    return this.history.length % 2 === 0 ? BLACK : WHITE;
  }

  get lastMove() {
    return this.history.length ? this.history[this.history.length - 1] : -1;
  }

  get isFull() {
    return this.history.length >= CELLS;
  }

  get isOver() {
    return this.winner !== EMPTY || this.isFull;
  }

  at(i) {
    return this.cells[i];
  }

  isEmpty(i) {
    return i >= 0 && i < CELLS && this.cells[i] === EMPTY;
  }

  /** 착수. 성공하면 true. 이미 끝난 판이나 빈칸이 아닌 곳은 거부한다. */
  place(i) {
    if (!this.isEmpty(i) || this.winner !== EMPTY) return false;
    const color = this.turn;
    this.cells[i] = color;
    this.history.push(i);
    const line = findWinLine(this.cells, i, color);
    if (line) {
      this.winner = color;
      this.winLine = line;
    }
    return true;
  }

  /** 한 수 되돌린다. @returns 되돌린 인덱스, 없으면 -1 */
  undo() {
    const i = this.history.pop();
    if (i === undefined) return -1;
    this.cells[i] = EMPTY;
    // 승리는 항상 직전 착수로만 성립하므로, 되돌리면 무조건 해제된다.
    this.winner = EMPTY;
    this.winLine = null;
    return i;
  }

  clone() {
    const b = new Board();
    b.cells.set(this.cells);
    b.history = this.history.slice();
    b.winner = this.winner;
    b.winLine = this.winLine ? this.winLine.slice() : null;
    return b;
  }
}

/**
 * 무르기 정책 — "항상 **내 마지막 수까지** 되돌린다."
 *
 * '2수 되돌린다'로 정의하면 안 된다. 아이가 백을 골라 컴퓨터가 선착한 경우처럼
 * 내 수와 상대 수의 개수가 어긋난 상태에서 차례가 꼬인다. 개수가 아니라 상태로 정의한다.
 *
 * @returns {boolean} 실제로 되돌렸으면 true
 */
export function undoToLastOwn(board, color) {
  if (!canUndoOwn(board, color)) return false;
  while (board.moveCount > 0) {
    const i = board.lastMove;
    const owner = board.cells[i]; // undo 전에 읽어야 한다 — 되돌리면 빈칸이 된다
    board.undo();
    if (owner === color) return true;
  }
  return false;
}

/** 되돌릴 내 수가 없으면 무르기 버튼은 비활성이어야 한다. */
export function canUndoOwn(board, color) {
  for (const i of board.history) {
    if (board.cells[i] === color) return true;
  }
  return false;
}

/**
 * 테스트·디버깅용 보드 파서. '.'=빈칸, 'X'=흑, 'O'=백.
 * 줄 수나 열 수가 SIZE보다 적으면 나머지는 빈칸으로 둔다 — 테스트를 짧게 쓰기 위해서다.
 */
export function parseCells(text) {
  const cells = new Int8Array(CELLS);
  const lines = text.trim().split('\n');
  for (let r = 0; r < Math.min(lines.length, SIZE); r++) {
    const line = lines[r].trim();
    for (let c = 0; c < Math.min(line.length, SIZE); c++) {
      const ch = line[c];
      if (ch === 'X') cells[idx(r, c)] = BLACK;
      else if (ch === 'O') cells[idx(r, c)] = WHITE;
    }
  }
  return cells;
}

export function formatCells(cells) {
  const out = [];
  for (let r = 0; r < SIZE; r++) {
    let line = '';
    for (let c = 0; c < SIZE; c++) {
      const v = cells[idx(r, c)];
      line += v === BLACK ? 'X' : v === WHITE ? 'O' : '.';
    }
    out.push(line);
  }
  return out.join('\n');
}
