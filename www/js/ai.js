/**
 * 오목 AI — 난이도 3단계.
 *
 * 설계의 핵심은 "승리수와 필수 방어수를 점수로 다루지 않는다"는 것이다 (결정 D5).
 * 가중치로 처리하면 내 승리수(1,000,000)와 상대 차단수(1,000,000 × w)가 동점이 되어
 * AI가 이긴 판을 안 두고 막는 일이 실제로 벌어진다. 그래서 순서로 해결한다.
 */

import {
  CELLS, EMPTY, BLACK, WHITE,
  idx, rowOf, colOf, inBounds, opponent, findWinLine,
} from './board.js';
import { analyzeMove, evalBoth } from './patterns.js';

export const LEVEL = Object.freeze({ EASY: 'easy', NORMAL: 'normal', HARD: 'hard' });

/** 탐색에서 쓰는 승리 점수. 패턴 점수(최대 100만)보다 확실히 커야 한다. */
const WIN = 10_000_000;

/**
 * "이 값을 넘으면 강제 승리"의 기준선. 승리 점수는 깊이만큼(최대 8) 깎이므로
 * 여유를 크게 잡아도 일반 국면 점수(최대 100만 남짓)와 섞일 일이 없다.
 */
const WIN_MARGIN = WIN - 1000;

/** 기존 돌에서 이 거리 안의 빈칸만 후보로 본다. 225칸을 20~60칸으로 줄인다. */
const CANDIDATE_RADIUS = 2;

/** 어려움 난이도의 노드당 후보 수. 넓히면 정확해지고 좁히면 깊어진다. */
const HARD_WIDTH = 12;

/** 어려움 난이도 사고 시간. 사람이 기다려줄 수 있는 상한이다. */
const HARD_TIME_MS = 1500;

/** 반복 심화 상한. 깊이 4는 예산의 10~20%만 쓰므로 시간이 남으면 더 내려간다 (결정 D9). */
const HARD_MIN_DEPTH = 4;
const HARD_MAX_DEPTH = 8;

/**
 * VCF 탐색 깊이(내가 두는 4의 개수). 실전에서 4~6수면 대부분 결판나고,
 * 8이면 사람이 알아채기 어려운 수순까지 닿는다.
 */
const VCF_DEPTH = 8;

/** VCF 노드 상한. 분기가 작아 보통 수백 노드로 끝나지만, 병적인 국면에서의 폭주를 막는다. */
const VCF_NODE_LIMIT = 20000;

/**
 * 보통 난이도의 수비 가중치. 1보다 조금 크다.
 * 같은 등급이면 방어가 이겨야 한다 — 상대 열린3을 놔두고 내 열린3을 만들면
 * 다음 수에 상대가 열린4를 만들어 진다. 반면 내 막힌4(10,000)는 상대 열린3
 * 차단(5,000 × 1.1)보다 여전히 크므로, 반격이 가능할 때는 반격한다.
 */
const DEFENSE_WEIGHT = 1.1;

/**
 * 리프 평가의 수비 계수.
 *
 * 초안(결정 D7)은 0.9로 잡았다 — "동점이면 공격이 이긴다"는 취지였다. 그런데 selfplay
 * 대조군이 그 선택을 반증했다: 보통끼리는 서로 못 뚫어 9/10이 무승부인데, 보통(흑)이
 * 어려움(백)은 4/5로 이겼다. 즉 탐색이 탐욕보다 **수비를 못 했다**. 원인은 탐색이
 * 상대 위협을 0.9로 할인해 보는 반면 보통은 1.1로 크게 보기 때문이다.
 * 실측으로 정한 값은 아래 DEFAULT_LEAF_DEFENSE이며, 근거는 _workspace/runs/tune-leaf-result.txt 참조.
 */
const DEFAULT_LEAF_DEFENSE = 1.2;

/**
 * 초반에는 모든 후보의 패턴 점수가 0이라 전부 동점이 된다(외톨이 돌은 위협이 아니므로).
 * 중앙 선호로 가른다. 막힌2(50)보다 작게 잡아 실제 위협 판단을 흔들지 않는다.
 */
function centerBonus(p) {
  return 14 - (Math.abs(rowOf(p) - 7) + Math.abs(colOf(p) - 7));
}

/** 기존 돌 주변의 빈칸. 반상이 비어 있으면 천원(중앙). */
export function candidates(cells, radius = CANDIDATE_RADIUS) {
  const seen = new Uint8Array(CELLS);
  const out = [];
  let hasStone = false;

  for (let p = 0; p < CELLS; p++) {
    if (cells[p] === EMPTY) continue;
    hasStone = true;
    const r = rowOf(p);
    const c = colOf(p);
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if (!inBounds(rr, cc)) continue;
        const q = idx(rr, cc);
        if (cells[q] !== EMPTY || seen[q]) continue;
        seen[q] = 1;
        out.push(q);
      }
    }
  }
  return hasStone ? out : [idx(7, 7)];
}

/**
 * 한 수의 종합 점수 = 내 이득 + 가중치 × 상대에게서 빼앗는 이득.
 * analyzeMove의 반환 객체는 재사용되므로 값을 먼저 꺼내 쓴다.
 */
function moveScore(cells, p, me, defenseWeight) {
  const gain = analyzeMove(cells, p, me).score;
  const deny = analyzeMove(cells, p, opponent(me)).score;
  return gain + defenseWeight * deny + centerBonus(p);
}

/**
 * 하드 규칙 — 점수가 아니라 **순서**로 결정한다 (결정 D5).
 * @param {boolean} full false면 즉시 5목 관련만 본다(쉬움 난이도의 핸디캡).
 * @returns 착수할 인덱스, 해당 없으면 -1
 */
function hardRuleMove(cells, me, full) {
  const opp = opponent(me);
  const cand = candidates(cells);

  let myUnstoppable = -1;
  for (const p of cand) {
    const a = analyzeMove(cells, p, me);
    if (a.five) return p; // 1) 이길 수 있으면 무조건 이긴다
    if (myUnstoppable < 0 && (a.openFour || a.fours >= 2)) myUnstoppable = p;
  }

  let oppUnstoppable = -1;
  for (const p of cand) {
    const a = analyzeMove(cells, p, opp);
    if (a.five) return p; // 2) 상대가 이길 수 있으면 막는다
    if (oppUnstoppable < 0 && (a.openFour || a.fours >= 2)) oppUnstoppable = p;
  }

  // 쉬움은 여기까지다. 열린4에 대한 선제 대응을 하지 않는 것이 핸디캡의 일부다.
  if (!full) return -1;

  if (myUnstoppable >= 0) return myUnstoppable; // 3) 내가 막을 수 없는 4를 만들 수 있으면 만든다
  if (oppUnstoppable >= 0) return oppUnstoppable; // 4) 상대가 그러기 전에 막는다
  return -1;
}

/** 점수 상위 후보를 정렬해 돌려준다. 알파-베타의 가지치기 효율은 순서에 좌우된다. */
function orderedCandidates(cells, turn, width) {
  const cand = candidates(cells);
  const scored = new Array(cand.length);
  for (let i = 0; i < cand.length; i++) {
    const p = cand[i];
    const gain = analyzeMove(cells, p, turn).score;
    const deny = analyzeMove(cells, p, opponent(turn)).score;
    // 순서 결정용이라 공수를 같은 무게로 본다 — 어느 쪽이든 급소는 급소다.
    scored[i] = { p, s: gain + deny + centerBonus(p) };
  }
  scored.sort((a, b) => b.s - a.s);
  const n = Math.min(width, scored.length);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = scored[i].p;
  return out;
}

/** 리프 평가 — "한 수의 점수"가 아니라 "국면의 점수"다 (결정 D7). */
function evaluate(cells, me, leafDefense) {
  const s = evalBoth(cells, me);
  return s[0] - leafDefense * s[1];
}

function search(cells, me, turn, depth, alpha, beta, ctx) {
  // 시간 검사 간격. 리프 하나가 수천 연산이라 1024노드마다 보면 예산을 크게 넘긴다.
  if ((++ctx.nodes & 127) === 0 && Date.now() > ctx.deadline) ctx.timeout = true;
  if (ctx.timeout) return 0;
  if (depth === 0) return evaluate(cells, me, ctx.leafDefense);

  const cand = orderedCandidates(cells, turn, ctx.width);
  if (cand.length === 0) return evaluate(cells, me, ctx.leafDefense);

  const maximizing = turn === me;
  let best = maximizing ? -Infinity : Infinity;

  for (const p of cand) {
    cells[p] = turn;
    let val;
    if (findWinLine(cells, p, turn)) {
      // 깊이만큼 깎는다 — 2수 만에 이기는 길이 4수 만에 이기는 길보다 낫다 (결정 D7).
      const dist = ctx.maxDepth - depth;
      val = maximizing ? WIN - dist : -WIN + dist;
    } else {
      val = search(cells, me, opponent(turn), depth - 1, alpha, beta, ctx);
    }
    cells[p] = EMPTY;

    if (ctx.timeout) return best === Infinity || best === -Infinity ? 0 : best;

    if (maximizing) {
      if (val > best) best = val;
      if (best > alpha) alpha = best;
    } else {
      if (val < best) best = val;
      if (best < beta) beta = best;
    }
    if (alpha >= beta) break;
  }
  return best;
}

/** me가 다음 한 수로 5목을 완성할 수 있는 지점들. */
function fiveSpots(cells, me, cand) {
  const out = [];
  for (const p of cand) {
    if (analyzeMove(cells, p, me).five) out.push(p);
  }
  return out;
}

/**
 * VCF — 연속으로 4를 만들어 이기는 수순을 찾는다.
 *
 * 왜 별도로 두는가: 일반 알파-베타는 폭이 넓어 깊이 4~6이 한계인데, 오목의 실제 승부는
 * 7~11수짜리 강제 수순에서 난다. VCF는 **4를 만드는 수만** 두고 상대는 5목을 막는 수로
 * 강제되므로 분기가 2~4에 불과하다. 좁고 깊게 파는 이 탐색이 어려움을 보통과 갈라놓는다.
 *
 * @returns 이기는 첫 수, 없으면 -1
 */
export function findVcf(cells, me, depth = VCF_DEPTH, ctx = { nodes: 0, limit: VCF_NODE_LIMIT }) {
  if (++ctx.nodes > ctx.limit) return -1;
  const opp = opponent(me);
  const cand = candidates(cells);

  // 지금 5목을 만들 수 있으면 그게 답이다.
  const mine = fiveSpots(cells, me, cand);
  if (mine.length) return mine[0];
  if (depth <= 0) return -1;

  // 상대가 먼저 5목을 만들 수 있으면 공격을 이어갈 수 없다.
  if (fiveSpots(cells, opp, cand).length) return -1;

  for (const p of cand) {
    // 4를 만드는 수만 본다. 이것이 상대의 응수를 강제하는 유일한 수단이다.
    if (analyzeMove(cells, p, me).fours === 0) continue;

    cells[p] = me;
    const spots = fiveSpots(cells, me, candidates(cells));
    let win = false;

    if (spots.length >= 2) {
      win = true; // 5목 자리가 둘 — 한 수로 다 막을 수 없다
    } else if (spots.length === 1) {
      const block = spots[0];
      cells[block] = opp;
      // 상대가 막으면서 자기 5목을 완성해버리면 그 수순은 실패다.
      win = findWinLine(cells, block, opp) ? false : findVcf(cells, me, depth - 1, ctx) >= 0;
      cells[block] = EMPTY;
    }
    cells[p] = EMPTY;

    if (win) return p;
    if (ctx.nodes > ctx.limit) return -1;
  }
  return -1;
}

/** 루트 탐색. 알파를 좁혀가므로 빠르지만, 얻는 것은 '최선수와 그 값' 하나뿐이다. */
function rootSearch(cells, me, depth, ctx) {
  const cand = orderedCandidates(cells, me, ctx.width);
  let bestMove = cand[0] ?? -1;
  let bestScore = -Infinity;
  let alpha = -Infinity;

  for (const p of cand) {
    cells[p] = me;
    const val = findWinLine(cells, p, me)
      ? WIN
      : search(cells, me, opponent(me), depth - 1, alpha, Infinity, ctx);
    cells[p] = EMPTY;
    if (ctx.timeout) break;
    if (val > bestScore) {
      bestScore = val;
      bestMove = p;
      if (val > alpha) alpha = val;
    }
  }
  return { move: bestMove, score: bestScore };
}

/** 특정 한 수만 창을 열어 평가한다 — "이 수가 지는 수인가"를 알아내는 용도. */
function evaluateMove(cells, me, p, depth, ctx) {
  cells[p] = me;
  const val = findWinLine(cells, p, me)
    ? WIN
    : search(cells, me, opponent(me), depth - 1, -Infinity, Infinity, ctx);
  cells[p] = EMPTY;
  return val;
}

export class AI {
  /**
   * @param {string} level LEVEL.EASY | NORMAL | HARD
   * @param {object} [opts]
   * @param {() => number} [opts.random] 0~1 난수. selfplay 재현성을 위해 주입 가능하게 열어둔다.
   * @param {number} [opts.timeMs] 어려움 난이도의 사고 시간 상한.
   *   실제 대국은 기본 1500ms지만, selfplay는 수십 판을 돌려야 하므로 낮춰 쓴다
   *   (수당 1.5초 × 50수 × 20판 = 25분이라 검증 자체가 불가능해진다).
   * @param {number} [opts.leafDefense] 리프 평가의 수비 계수. 튜닝 실험용으로 열어둔다.
   */
  constructor(level = LEVEL.NORMAL, opts = {}) {
    this.level = level;
    this.random = opts.random ?? Math.random;
    this.timeMs = opts.timeMs ?? HARD_TIME_MS;
    this.leafDefense = opts.leafDefense ?? DEFAULT_LEAF_DEFENSE;
    /** 마지막 탐색 통계 — 성능 확인용. */
    this.stats = { nodes: 0, depth: 0, ms: 0 };
  }

  /** @returns {number} 착수할 인덱스. 둘 곳이 없으면 -1 */
  chooseMove(cells, me) {
    const t0 = Date.now();
    const move = this._choose(cells, me);
    this.stats.ms = Date.now() - t0;
    return move;
  }

  _choose(cells, me) {
    if (this.level === LEVEL.HARD) return this._chooseHard(cells, me);
    return this._chooseGreedy(cells, me);
  }

  /**
   * 쉬움 / 보통 — 앞을 읽지 않는다.
   * 쉬움의 핸디캡은 확률적 실수가 아니라 **결정론적 규칙**이다 (결정 D8):
   * 상대의 4목(다음 수 5목)만 막고 열린3은 절대 막지 않는다. 그래서 아이에게
   * "3을 먼저 만들면 이긴다"는 배울 수 있는 승리 공식이 생긴다.
   */
  _chooseGreedy(cells, me) {
    const easy = this.level === LEVEL.EASY;
    const forced = hardRuleMove(cells, me, !easy);
    if (forced >= 0) return forced;
    // 쉬움은 수비 가중치 0 — 상대 모양을 아예 보지 않는다.
    return this._greedyBest(cells, me, easy ? 0 : DEFENSE_WEIGHT);
  }

  /** 앞을 읽지 않고 한 수 점수만으로 고른다. 어려움의 시간 초과 대비책이기도 하다. */
  _greedyBest(cells, me, weight) {
    const cand = candidates(cells);
    if (cand.length === 0) return -1;

    let best = -Infinity;
    let ties = [];
    for (const p of cand) {
      const s = moveScore(cells, p, me, weight);
      if (s > best) {
        best = s;
        ties = [p];
      } else if (s === best) {
        ties.push(p);
      }
    }
    // 완전 동점일 때만 무작위로 고른다 — 매판 같은 기보가 나오지 않게 하되
    // 난이도 정책 자체는 결정론적으로 유지한다.
    return ties[(this.random() * ties.length) | 0];
  }

  /**
   * 어려움 — '보통'의 판단을 기본으로 쓰고, 탐색은 **확정 승/패를 가려내는 데만** 쓴다.
   *
   * 왜 탐색에게 위치 판단까지 맡기지 않는가: 맡겼더니 실제로 더 약했다. selfplay 대조군에서
   * 보통끼리는 서로 못 뚫어 9/10이 무승부인데, 보통(흑)은 어려움(백)을 4/5로 이겼다.
   * 깊이 4~6짜리 리프 평가는 "누가 주도권을 쥐었는가"를 표현하지 못해, 상대가 막을 위협을
   * 만들어봐야 점수가 안 오르니 공격을 포기하고 어정쩡한 수를 둔다.
   *
   * 그래서 역할을 나눈다. 위치 판단은 탐욕 점수(= 보통과 동일)가 하고, 탐색은
   *   ① 강제 승리가 있으면 찾아내고  ② 지는 수를 후보에서 제거한다.
   * 이 구조면 어려움이 보통보다 약해질 수 **없다** — 최악이라도 보통과 같은 수를 둔다.
   */
  _chooseHard(cells, me) {
    const forced = hardRuleMove(cells, me, true);
    if (forced >= 0) {
      this.stats.depth = 0;
      this.stats.nodes = 0;
      return forced;
    }

    if (candidates(cells).length === 0) return -1;

    // ① 내가 연속 4로 이길 수 있으면 그 수순을 시작한다.
    const vcfCtx = { nodes: 0, limit: VCF_NODE_LIMIT };
    const vcf = findVcf(cells, me, VCF_DEPTH, vcfCtx);
    if (vcf >= 0) {
      this.stats.depth = -1; // -1 = VCF로 결정
      this.stats.nodes = vcfCtx.nodes;
      return vcf;
    }

    // ② 상대가 연속 4로 이길 수 있으면 그 시작점을 미리 막는다.
    //    상대의 첫 수를 지워두는 것이 가장 값싼 저지책이다.
    const oppCtx = { nodes: 0, limit: VCF_NODE_LIMIT };
    const oppVcf = findVcf(cells, opponent(me), VCF_DEPTH, oppCtx);
    if (oppVcf >= 0) {
      this.stats.depth = -1;
      this.stats.nodes = vcfCtx.nodes + oppCtx.nodes;
      return oppVcf;
    }

    // 기본값은 '보통'의 판단이다. 탐색은 이걸 뒤집을 근거가 있을 때만 개입한다.
    const greedyMove = this._greedyBest(cells, me, DEFENSE_WEIGHT);

    const t0 = Date.now();
    // 예산의 4분의 1은 마지막 '지는 수인가' 확인용으로 남겨둔다.
    // 안 남기면 그 확인이 항상 시간 초과로 무의미해진다.
    const searchDeadline = t0 + this.timeMs * 0.75;
    const hardDeadline = t0 + this.timeMs;
    const newCtx = (d, deadline) => ({
      deadline, timeout: false, nodes: 0,
      width: HARD_WIDTH, maxDepth: d, leafDefense: this.leafDefense,
    });

    let searchMove = -1;
    let searchScore = -Infinity;
    let totalNodes = 0;
    let reached = 0;

    // 깊이를 2씩 늘린다 — 리프의 수순 패리티를 유지해 평가가 진동하지 않게.
    for (let d = HARD_MIN_DEPTH; d <= HARD_MAX_DEPTH; d += 2) {
      const ctx = newCtx(d, searchDeadline);
      const res = rootSearch(cells, me, d, ctx);
      totalNodes += ctx.nodes;
      if (ctx.timeout) break;
      searchMove = res.move;
      searchScore = res.score;
      reached = d;
      // 확정 승리를 찾았으면 더 깊이 볼 이유가 없다.
      if (searchScore >= WIN_MARGIN) break;
    }

    this.stats.nodes = totalNodes;
    this.stats.depth = reached;

    // 한 깊이도 완주하지 못했으면(느린 기기, 짧은 예산) 그냥 보통과 똑같이 둔다.
    if (searchMove < 0) return greedyMove;

    // 강제 승리를 찾았으면 둔다 — 탐욕은 못 보는 수다.
    if (searchScore >= WIN_MARGIN) return searchMove;

    // 탐욕 최선수가 '지는 수'로 판명될 때만 탐색의 수로 갈아탄다.
    // 이 한 번의 확인이 어려움을 보통보다 약해지지 않게 하는 안전장치다.
    if (greedyMove !== searchMove) {
      const ctx = newCtx(reached, hardDeadline);
      const v = evaluateMove(cells, me, greedyMove, reached, ctx);
      this.stats.nodes += ctx.nodes;
      if (!ctx.timeout && v <= -WIN_MARGIN) return searchMove;
    }
    return greedyMove;
  }
}

/** 재현 가능한 난수 — selfplay가 같은 결과를 반복할 수 있어야 원인을 추적할 수 있다. */
export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return function rng() {
    // xorshift32 — 통계적 품질보다 재현성과 속도가 중요한 용도다.
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
