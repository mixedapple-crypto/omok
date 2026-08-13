/**
 * 돌 패턴 평가 — AI 전용이다. board.js는 이 파일에 의존하지 않는다 (결정 D12).
 *
 * 설계: 패턴을 문자열로 나열하지 않고 **기능적으로 정의**한다.
 *   5목       = 5개 이상 연속
 *   열린4     = 한 수로 5목이 되는 지점이 2곳 (한 수로 다 막을 수 없다)
 *   막힌4     = 그런 지점이 1곳
 *   열린3     = 한 수로 열린4가 되는 모양
 *   막힌3     = 한 수로 막힌4가 되는 모양
 *   열린2/막힌2 = 한 수로 열린3/막힌3이 되는 모양
 *
 * 문자열 패턴표를 쓰지 않는 이유: `.●●.●.` 류의 끊어진 모양과 반상 가장자리에서
 * 열림/막힘이 뒤바뀌는 오분류가 문자열 열거의 고질적 실패다. 기능적 정의는
 * 그 경우들을 자동으로 옳게 처리한다 — 가장자리 바깥은 '막힌 것'으로 취급하면 끝난다.
 *
 * 성능: 매번 이 정의를 계산하면 느리므로, 9칸 창(중심 ±4)의 모든 경우를
 * 기동 시 한 번 표로 계산해둔다. 런타임은 표 조회 1회다.
 */

import { CELLS, DIRS, EMPTY, idx, inBounds, rowOf, colOf } from './board.js';

/** 창 반경. 5목은 중심에서 최대 4칸까지 뻗으므로 ±4면 5목·4를 정확히 판정한다. */
export const HALF = 4;
export const SPAN = HALF * 2 + 1; // 9
/** 중심(항상 내 돌)을 제외한 8칸 × 3상태 */
const KEY_COUNT = 3 ** (SPAN - 1); // 6561

// 창 내부 표현 — 상대 돌과 반상 바깥은 똑같이 '막힘'이다.
const W_EMPTY = 0;
const W_ME = 1;
const W_BLOCK = 2;

/** 위협 등급. 값이 클수록 위협적이며 순서 비교에 쓰인다. */
export const T = Object.freeze({
  NONE: 0,
  CLOSED_TWO: 1,
  OPEN_TWO: 2,
  CLOSED_THREE: 3,
  OPEN_THREE: 4,
  FOUR: 5,
  OPEN_FOUR: 6,
  FIVE: 7,
});

/**
 * 등급별 점수. 막힌4가 열린3의 2배인 것이 핵심이다 —
 * 막힌4는 '다음 수에 5목'이라 즉시 응수를 강제하고, 열린3은 한 템포 여유가 있다.
 * 초안에서 둘을 같은 점수로 뒀던 것이 결함이었다 (결정 D6).
 */
export const THREAT_SCORE = Object.freeze([
  0,        // NONE
  50,       // 막힌2
  300,      // 열린2
  500,      // 막힌3
  5000,     // 열린3
  10000,    // 막힌4  ← 열린3의 2배
  100000,   // 열린4
  1000000,  // 5목
]);

// ---------------------------------------------------------------------------
// 창 분류표 기동 시 1회 계산
// ---------------------------------------------------------------------------

function encode(w) {
  let k = 0;
  for (let i = 0; i < SPAN; i++) {
    if (i === HALF) continue; // 중심은 항상 W_ME라 키에 넣지 않는다
    k = k * 3 + w[i];
  }
  return k;
}

function decode(key) {
  const w = new Int8Array(SPAN);
  w[HALF] = W_ME;
  for (let i = SPAN - 1; i >= 0; i--) {
    if (i === HALF) continue;
    w[i] = key % 3;
    key = (key / 3) | 0;
  }
  return w;
}

function hasFive(w) {
  let run = 0;
  for (let i = 0; i < SPAN; i++) {
    run = w[i] === W_ME ? run + 1 : 0;
    if (run >= 5) return true;
  }
  return false;
}

/** 빈칸 한 곳에 더 두면 5목이 되는 지점의 개수. 2 이상이면 막을 수 없다 = 열린4. */
function fiveMakers(w) {
  let n = 0;
  for (let i = 0; i < SPAN; i++) {
    if (w[i] !== W_EMPTY) continue;
    w[i] = W_ME;
    if (hasFive(w)) n++;
    w[i] = W_EMPTY;
  }
  return n;
}

/**
 * "한 수 더 두면 X가 된다"를 "지금은 X보다 한 단계 아래"로 환산한다.
 * 이 한 장의 표가 3급·2급 정의의 전부다.
 */
const DEMOTE = new Int8Array(8);
DEMOTE[T.FIVE] = T.FOUR; // fiveMakers가 먼저 잡으므로 도달 불가 — 방어적 매핑
DEMOTE[T.OPEN_FOUR] = T.OPEN_THREE;
DEMOTE[T.FOUR] = T.CLOSED_THREE;
DEMOTE[T.OPEN_THREE] = T.OPEN_TWO;
DEMOTE[T.CLOSED_THREE] = T.CLOSED_TWO;
DEMOTE[T.OPEN_TWO] = T.NONE;
DEMOTE[T.CLOSED_TWO] = T.NONE;
DEMOTE[T.NONE] = T.NONE;

const TABLE = new Int8Array(KEY_COUNT).fill(-1);

function classifyKey(key) {
  const cached = TABLE[key];
  if (cached !== -1) return cached;

  const w = decode(key);
  let res;

  if (hasFive(w)) {
    res = T.FIVE;
  } else {
    const fm = fiveMakers(w);
    if (fm >= 2) res = T.OPEN_FOUR;
    else if (fm === 1) res = T.FOUR;
    else {
      // 재귀는 항상 내 돌이 하나 늘어난 창으로 내려가므로 반드시 종료한다.
      let best = T.NONE;
      for (let i = 0; i < SPAN; i++) {
        if (w[i] !== W_EMPTY) continue;
        w[i] = W_ME;
        const level = DEMOTE[classifyKey(encode(w))];
        w[i] = W_EMPTY;
        if (level > best) best = level;
      }
      res = best;
    }
  }

  TABLE[key] = res;
  return res;
}

for (let k = 0; k < KEY_COUNT; k++) classifyKey(k);

// ---------------------------------------------------------------------------
// 런타임 조회
// ---------------------------------------------------------------------------

/**
 * cells[p]에 color 돌이 **이미 놓인 상태**에서, 방향 d의 위협 등급을 돌려준다.
 * 반상 바깥은 상대 돌과 동일하게 '막힘'으로 취급한다 — 가장자리 오분류를 막는 핵심이다.
 */
export function threatAt(cells, p, color, d) {
  const dr = DIRS[d][0];
  const dc = DIRS[d][1];
  const r0 = rowOf(p);
  const c0 = colOf(p);
  let key = 0;
  for (let t = -HALF; t <= HALF; t++) {
    if (t === 0) continue;
    const r = r0 + dr * t;
    const c = c0 + dc * t;
    let v;
    if (!inBounds(r, c)) {
      v = W_BLOCK;
    } else {
      const s = cells[idx(r, c)];
      v = s === EMPTY ? W_EMPTY : s === color ? W_ME : W_BLOCK;
    }
    key = key * 3 + v;
  }
  return TABLE[key];
}

/**
 * 한 수가 만드는 위협 분석.
 *
 * ⚠️ 반환 객체는 **모듈 전역에서 재사용**된다 — 탐색 중 수만 번 호출되므로
 * 매번 할당하지 않기 위해서다. 호출 직후 값을 읽고, 보관하지 말 것.
 */
const _analysis = {
  score: 0,
  five: false,
  openFour: false,
  fours: 0,
  openThrees: 0,
};

export function analyzeMove(cells, p, color) {
  cells[p] = color;
  let score = 0;
  let five = false;
  let openFour = false;
  let fours = 0;
  let openThrees = 0;

  for (let d = 0; d < 4; d++) {
    const t = threatAt(cells, p, color, d);
    score += THREAT_SCORE[t];
    if (t === T.FIVE) five = true;
    else if (t === T.OPEN_FOUR) {
      openFour = true;
      fours++;
    } else if (t === T.FOUR) fours++;
    else if (t === T.OPEN_THREE) openThrees++;
  }
  cells[p] = EMPTY;

  score += doubleThreatBonus(fours, openThrees);

  _analysis.score = score;
  _analysis.five = five;
  _analysis.openFour = openFour;
  _analysis.fours = fours;
  _analysis.openThrees = openThrees;
  return _analysis;
}

/**
 * 이중 위협 보너스 — 한 수로 만든 두 위협은 한 수로 다 막을 수 없다.
 * 단순 합산이면 쌍삼이 5000+5000=10000으로 단독 열린4(100000)의 1/10이라,
 * 쌍삼을 배운 아이가 같은 패턴으로 AI를 계속 이기게 된다 (결정 D6).
 */
export function doubleThreatBonus(fours, openThrees) {
  if (fours >= 2) return 100000; // 4-4: 사실상 승리
  if (fours >= 1 && openThrees >= 1) return 80000; // 4-3
  if (openThrees >= 2) return 50000; // 쌍삼
  return 0;
}

/**
 * 방향 d의 라인에서 me가 가진 모양들의 점수 합.
 * 한 모양을 한 번만 세기 위해 **연속 구간의 시작점에서만** 계산한다 —
 * 그러지 않으면 4연속이 4번 계산되어 점수가 왜곡된다.
 */
export function lineScore(cells, me, p, d) {
  const dr = DIRS[d][0];
  const dc = DIRS[d][1];
  let r = rowOf(p);
  let c = colOf(p);
  while (inBounds(r - dr, c - dc)) {
    r -= dr;
    c -= dc;
  }
  let s = 0;
  while (inBounds(r, c)) {
    const i = idx(r, c);
    if (cells[i] === me && !(inBounds(r - dr, c - dc) && cells[idx(r - dr, c - dc)] === me)) {
      s += THREAT_SCORE[threatAt(cells, i, me, d)];
    }
    r += dr;
    c += dc;
  }
  return s;
}

/** 국면 전체 점수. 탐색의 리프 평가에 쓴다 — "한 수의 점수"가 아니라 "국면의 점수"다 (결정 D7). */
export function evalPosition(cells, me) {
  let s = 0;
  for (let p = 0; p < CELLS; p++) {
    if (cells[p] !== me) continue;
    const r = rowOf(p);
    const c = colOf(p);
    for (let d = 0; d < 4; d++) {
      const dr = DIRS[d][0];
      const dc = DIRS[d][1];
      if (inBounds(r - dr, c - dc) && cells[idx(r - dr, c - dc)] === me) continue;
      s += THREAT_SCORE[threatAt(cells, p, me, d)];
    }
  }
  return s;
}

/**
 * 양쪽 점수를 **한 번의 순회로** 구한다. 리프 평가는 탐색의 최대 병목이라
 * 225칸을 두 번 도는 것과 한 번 도는 것의 차이가 그대로 탐색 깊이가 된다.
 * @returns {[number, number]} [내 점수, 상대 점수] — 재사용 배열이므로 즉시 소비할 것.
 */
const _both = [0, 0];
export function evalBoth(cells, me) {
  let mine = 0;
  let theirs = 0;
  for (let p = 0; p < CELLS; p++) {
    const v = cells[p];
    if (v === EMPTY) continue;
    const r = rowOf(p);
    const c = colOf(p);
    for (let d = 0; d < 4; d++) {
      const dr = DIRS[d][0];
      const dc = DIRS[d][1];
      // 연속 구간의 시작점에서만 센다 — 한 모양을 한 번만 계산하기 위해서.
      if (inBounds(r - dr, c - dc) && cells[idx(r - dr, c - dc)] === v) continue;
      const s = THREAT_SCORE[threatAt(cells, p, v, d)];
      if (v === me) mine += s;
      else theirs += s;
    }
  }
  _both[0] = mine;
  _both[1] = theirs;
  return _both;
}

/** 테스트 전용 — 창 문자열('.'=빈칸, 'X'=나, '#'=막힘, 중심은 반드시 'X')을 등급으로. */
export function classifyWindowString(s) {
  if (s.length !== SPAN) throw new Error(`창은 ${SPAN}칸이어야 한다: "${s}"`);
  if (s[HALF] !== 'X') throw new Error(`창의 중심은 내 돌이어야 한다: "${s}"`);
  const w = new Int8Array(SPAN);
  for (let i = 0; i < SPAN; i++) {
    w[i] = s[i] === 'X' ? W_ME : s[i] === '.' ? W_EMPTY : W_BLOCK;
  }
  return TABLE[encode(w)];
}
