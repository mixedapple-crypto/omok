/**
 * 퍼즐 생성·채점 — 템플릿을 무작위로 놓고 **엔진이 정답을 열거·검증**한다.
 *
 * 손으로 판을 그리고 정답 하나를 적는 방식을 쓰지 않는 이유: 작성자가 못 본 다른 쌍삼을
 * 아이가 두었을 때 "틀렸다"고 하면 배움이 거꾸로 간다. 그래서 정답은 항상 tactics.js가
 * 열거한 전부이고, 템플릿은 "이런 모양을 보여주라"는 힌트일 뿐이다.
 *
 * 생성 절차: 템플릿 선택 → 8가지 대칭 중 하나 → 판 안 무작위 위치 → 정답 열거 → 건전성 검사
 * → 멀리 방해돌 몇 개(실전처럼 보이게) → 방해돌이 정답을 바꾸지 않았는지 재검증.
 * 어느 단계든 실패하면 처음부터 다시 뽑는다. 무작위는 주입할 수 있어 테스트가 재현된다.
 */

import { SIZE, CELLS, EMPTY, BLACK, idx, rowOf, colOf, inBounds, opponent, findWinLine } from './board.js';
import { SKILL, skillsOfMove, findSkillSpots, defenseSpots, vcfSpots, shapeCells } from './tactics.js';

/** 템플릿 문자. X=내 돌, O=상대 돌, .=반드시 빈칸이어야 하는 자리. 그 외(공백)는 무관. */
const CH_ME = 'X';
const CH_OPP = 'O';
const CH_EMPTY = '.';

/** 템플릿 상자가 반상 가장자리에서 떨어져야 하는 칸 수. 붙이면 '뚫린' 모양이 경계에 막혀 뜻이 바뀐다. */
export const EDGE_MARGIN = 2;
/** 방해돌과 템플릿 칸 사이의 최소 체비쇼프 거리. 9칸 창(±4) 밖이면 모양에 끼어들 수 없다. */
export const DISTRACTOR_GAP = 5;
/** 마무리 단계(기술을 둔 뒤 끝까지 이기기)에서 정답으로 치는 연속 사 깊이. */
export const FINISH_DEPTH = 4;

const TRANSFORMS = Object.freeze([
  (r, c) => [r, c], (r, c) => [c, -r], (r, c) => [-r, -c], (r, c) => [-c, r],
  (r, c) => [r, -c], (r, c) => [c, r], (r, c) => [-r, c], (r, c) => [-c, -r],
]);

/** 문자열 배열 템플릿 → {r, c, v} 목록. */
export function parseTemplate(rows) {
  const out = [];
  rows.forEach((line, r) => {
    [...line].forEach((ch, c) => {
      if (ch === CH_ME || ch === CH_OPP || ch === CH_EMPTY) out.push({ r, c, v: ch });
    });
  });
  return out;
}

/** 템플릿에 대칭 변환을 적용하고 좌상단이 (0,0)이 되게 옮긴다. */
export function transformTemplate(tpl, k) {
  const f = TRANSFORMS[k];
  const moved = tpl.map(({ r, c, v }) => { const [rr, cc] = f(r, c); return { r: rr, c: cc, v }; });
  const minR = Math.min(...moved.map((t) => t.r));
  const minC = Math.min(...moved.map((t) => t.c));
  return moved.map(({ r, c, v }) => ({ r: r - minR, c: c - minC, v }));
}

function bbox(tpl) {
  return {
    h: Math.max(...tpl.map((t) => t.r)) + 1,
    w: Math.max(...tpl.map((t) => t.c)) + 1,
  };
}

const chebyshev = (a, b) => Math.max(Math.abs(rowOf(a) - rowOf(b)), Math.abs(colOf(a) - colOf(b)));
const sameSet = (a, b) => a.length === b.length && a.every((v) => b.includes(v));

/** 스펙에 따른 정답 열거. attack/defense/vcf 세 종류가 전부다. */
export function solve(cells, spec) {
  const me = spec.me ?? BLACK;
  if (spec.kind === 'attack') return findSkillSpots(cells, me, spec.skill);
  if (spec.kind === 'defense') return defenseSpots(cells, me, spec.skill);
  if (spec.kind === 'vcf') return vcfSpots(cells, me, spec.depth);
  throw new Error(`모르는 퍼즐 종류: ${spec.kind}`);
}

/**
 * 건전성 검사 — 템플릿 작성자의 실수와 방해돌의 부작용을 둘 다 잡는다.
 * 실패 사유를 문자열로 돌려주고, 통과면 null이다.
 */
export function validate(cells, spec, answers) {
  const me = spec.me ?? BLACK;
  const opp = opponent(me);
  if (answers.length === 0) return '정답이 없다';

  const oppFive = findSkillSpots(cells, opp, SKILL.FIVE);
  const myFive = findSkillSpots(cells, me, SKILL.FIVE);

  if (spec.kind === 'attack') {
    if (oppFive.length) return '상대가 먼저 다섯을 만들 수 있다';
    if (spec.skill !== SKILL.FIVE && myFive.length) return '그냥 다섯을 만들면 되는 판이다';
  } else if (spec.kind === 'defense') {
    if (myFive.length) return '막을 게 아니라 이기면 되는 판이다';
    if (spec.skill !== SKILL.FIVE && oppFive.length) return '삼을 막기 전에 사부터 막아야 하는 판이다';
  } else if (spec.kind === 'vcf') {
    if (oppFive.length) return '상대가 먼저 다섯을 만들 수 있다';
    if (spec.depth > 1 && vcfSpots(cells, me, spec.depth - 1).length) return '더 짧게 이기는 수가 있다 — 이 레슨의 퍼즐이 아니다';
  }
  return null;
}

/** 템플릿 하나를 대칭·위치 무작위로 판에 놓는다. 방해돌은 아직 없다. */
function stamp(rows, rng) {
  const tpl = transformTemplate(parseTemplate(rows), (rng() * TRANSFORMS.length) | 0);
  const { h, w } = bbox(tpl);
  const r0 = EDGE_MARGIN + ((rng() * (SIZE - 2 * EDGE_MARGIN - h + 1)) | 0);
  const c0 = EDGE_MARGIN + ((rng() * (SIZE - 2 * EDGE_MARGIN - w + 1)) | 0);
  const cells = new Int8Array(CELLS);
  const footprint = [];
  for (const { r, c, v } of tpl) {
    const p = idx(r0 + r, c0 + c);
    footprint.push(p);
    if (v === CH_ME) cells[p] = BLACK;
    else if (v === CH_OPP) cells[p] = opponent(BLACK);
  }
  return { cells, footprint };
}

function addDistractors(cells, footprint, pairs, rng) {
  const placed = [];
  const okSpot = (p) => cells[p] === EMPTY && footprint.every((f) => chebyshev(p, f) >= DISTRACTOR_GAP);
  for (let i = 0; i < pairs * 2; i++) {
    let p = -1;
    for (let tries = 0; tries < 40 && p < 0; tries++) {
      const q = (rng() * CELLS) | 0;
      if (okSpot(q) && !placed.includes(q)) p = q;
    }
    if (p < 0) break;
    placed.push(p);
    cells[p] = i % 2 === 0 ? BLACK : opponent(BLACK);
  }
  return placed;
}

/**
 * 퍼즐 하나를 만든다.
 * @param {object} spec  { kind, skill?, depth?, templates: string[][], distractors?: [min, max], finish?: boolean }
 * @param {() => number} [rng]
 */
export function makePuzzle(spec, rng = Math.random) {
  const me = spec.me ?? BLACK;
  const [dMin, dMax] = spec.distractors ?? [1, 2];

  for (let attempt = 0; attempt < 60; attempt++) {
    const rows = spec.templates[(rng() * spec.templates.length) | 0];
    const { cells, footprint } = stamp(rows, rng);
    const answers = solve(cells, spec);
    if (validate(cells, spec, answers)) continue;

    const focus = footprint.filter((p) => cells[p] === (spec.kind === 'defense' ? opponent(me) : me));

    // 방해돌: 정답 집합이 그대로여야만 받는다. 열 번 실패하면 방해돌 없이 낸다.
    const pairs = dMin + ((rng() * (dMax - dMin + 1)) | 0);
    let withNoise = null;
    for (let t = 0; t < 10 && pairs > 0 && !withNoise; t++) {
      const trial = Int8Array.from(cells);
      addDistractors(trial, footprint, pairs, rng);
      const a2 = solve(trial, spec);
      if (sameSet(a2, answers) && !validate(trial, spec, a2)) withNoise = trial;
    }

    return {
      kind: spec.kind,
      skill: spec.skill ?? null,
      depth: spec.depth ?? 0,
      finish: !!spec.finish,
      me,
      cells: withNoise ?? cells,
      answers,
      focus,
      phase: 'skill',
      history: [],
      wrong: 0,
    };
  }
  throw new Error(`퍼즐을 만들 수 없다: ${JSON.stringify({ kind: spec.kind, skill: spec.skill })}`);
}

/**
 * 상대의 응수 — 마무리 단계에서만 쓴다. 결정론적이라 테스트로 재현된다.
 * 내 다섯 자리가 있으면 막고, 없으면 내 뚫린 사가 될 자리를 막고, 그것도 없으면 내 돌 옆에 둔다.
 */
export function opponentReply(cells, me) {
  const opp = opponent(me);
  const five = findSkillSpots(cells, me, SKILL.FIVE);
  if (five.length) return five[0];
  const block = defenseSpots(cells, opp, SKILL.OPEN_FOUR);
  if (block.length) return block[0];
  const open4 = findSkillSpots(cells, me, SKILL.OPEN_FOUR);
  if (open4.length) return open4[0];
  for (let p = 0; p < CELLS; p++) {
    if (cells[p] !== me) continue;
    const r = rowOf(p);
    const c = colOf(p);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (inBounds(r + dr, c + dc) && cells[idx(r + dr, c + dc)] === EMPTY) return idx(r + dr, c + dc);
      }
    }
  }
  return -1;
}

/**
 * 아이의 답을 채점하고, 맞으면 판을 진행시킨다.
 * @returns {{correct:boolean, done:boolean, won:boolean, reply:number, why?:object}}
 *   why: 오답일 때 설명 재료 — 화면 문구는 lesson-flow가 만든다.
 */
export function answerPuzzle(puzzle, p) {
  const { cells, me } = puzzle;
  if (cells[p] !== EMPTY) return { correct: false, done: false, won: false, reply: -1, why: { kind: 'occupied' } };

  if (!puzzle.answers.includes(p)) {
    puzzle.wrong++;
    return { correct: false, done: false, won: false, reply: -1, why: explainWrong(puzzle, p) };
  }

  cells[p] = me;
  puzzle.history.push({ p, who: me });

  const continues = puzzle.kind === 'vcf' || (puzzle.kind === 'attack' && puzzle.finish);
  if (!continues) return { correct: true, done: true, won: false, reply: -1 };
  if (findWinLine(cells, p, me)) return { correct: true, done: true, won: true, reply: -1 };

  const reply = opponentReply(cells, me);
  if (reply < 0) return { correct: true, done: true, won: false, reply: -1 };
  cells[reply] = opponent(me);
  puzzle.history.push({ p: reply, who: opponent(me) });

  // 상대가 막으면서 자기 다섯을 만들었으면 — 잘 만든 템플릿에서는 없는 일이지만 — 여기서 끝낸다.
  if (findWinLine(cells, reply, opponent(me))) return { correct: true, done: true, won: false, reply };

  puzzle.phase = 'finish';
  puzzle.answers = vcfSpots(cells, me, FINISH_DEPTH);
  if (puzzle.answers.length === 0) return { correct: true, done: true, won: false, reply };
  return { correct: true, done: false, won: false, reply };
}

/**
 * 오답 설명 재료.
 *   attack/vcf: 그 자리에 두면 생기는 모양(label)과 줄(lines).
 *   defense: 그 자리를 막아도 상대가 여전히 둘 수 있는 자리(remaining).
 */
export function explainWrong(puzzle, p) {
  const { cells, me } = puzzle;
  if (puzzle.kind === 'defense') {
    cells[p] = me;
    const remaining = findSkillSpots(cells, opponent(me), puzzle.skill);
    cells[p] = EMPTY;
    return { kind: 'defense', remaining, attackerLabel: puzzle.skill };
  }
  const s = skillsOfMove(cells, p, me);
  const lines = [...s.dirs.five, ...s.dirs.four, ...s.dirs.three].map((d) => shapeCells(cells, p, me, d));
  return { kind: 'attack', label: s.label, lines, fours: s.fours, openThrees: s.openThrees };
}

/** 정답 자리들에서 생기는 줄 — 정답 공개 때 비춘다. */
export function answerLines(puzzle) {
  const { cells, me } = puzzle;
  const out = [];
  for (const p of puzzle.answers) {
    const s = skillsOfMove(cells, p, me);
    for (const d of [...s.dirs.five, ...s.dirs.four, ...s.dirs.three]) out.push(shapeCells(cells, p, me, d));
  }
  return out;
}
