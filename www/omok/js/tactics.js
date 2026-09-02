/**
 * 기술 판정 — 오목 교실(퍼즐 채점)·실전 코치·기술 배지가 공유하는 **단 하나의 정의**다.
 *
 * 세 곳이 각자 판정하면 "퍼즐에서는 정답인데 배지는 안 주는" 어긋남이 생긴다.
 * 등급 자체는 patterns.js의 기능적 정의(한 수 더 두면 무엇이 되는가)를 그대로 쓴다 —
 * AI가 두는 오목과 아이가 배우는 오목이 같은 정의여야 퍼즐에서 배운 쌍삼을 AI가 알아본다.
 *
 * patterns.js는 AI 핫패스라 손대지 않는다. 이 모듈은 그 위에 얹힌 읽기 전용 층이다.
 * 여기 함수들은 매 수마다 한 번 불리는 정도라 재사용 객체 없이 새 배열을 돌려준다.
 */

import { CELLS, DIRS, EMPTY, idx, rowOf, colOf, inBounds, opponent } from './board.js';
import { threatAt, analyzeMove, T } from './patterns.js';
import { findVcf, candidates, newVcfCtx } from './ai.js';

/** 기술 식별자. 저장·퍼즐 스펙·배지 키에 그대로 쓰이므로 바꾸면 저장 데이터가 깨진다. */
export const SKILL = Object.freeze({
  FIVE: 'five',
  OPEN_FOUR: 'open4',
  FOUR: 'four',
  THREE: 'three',
  DOUBLE_THREE: '33',
  FOUR_THREE: '43',
  DOUBLE_FOUR: '44',
});

/**
 * 아이 화면용 이름. ko를 크게, code를 작게 병기한다(사용자 결정).
 * "열린/막힌" 대신 "뚫린/막힌"을 쓴다 — 초3에게 '열린 사'는 무슨 뜻인지 와닿지 않는다.
 */
export const SKILL_NAME = Object.freeze({
  [SKILL.FIVE]: Object.freeze({ ko: '다섯', code: '5' }),
  [SKILL.OPEN_FOUR]: Object.freeze({ ko: '뚫린 사', code: '4' }),
  [SKILL.FOUR]: Object.freeze({ ko: '사', code: '4' }),
  [SKILL.THREE]: Object.freeze({ ko: '삼', code: '3' }),
  [SKILL.DOUBLE_THREE]: Object.freeze({ ko: '쌍삼', code: '3-3' }),
  [SKILL.FOUR_THREE]: Object.freeze({ ko: '사삼', code: '4-3' }),
  [SKILL.DOUBLE_FOUR]: Object.freeze({ ko: '사사', code: '4-4' }),
});

/** 실전 배지 대상. 뚫린 사는 상대의 실수로 생기는 것이라 아이의 기술로 세지 않는다. */
export const BADGE_SKILLS = Object.freeze([SKILL.DOUBLE_THREE, SKILL.FOUR_THREE, SKILL.DOUBLE_FOUR]);

/**
 * p에 color를 두었을 때의 방향별 등급. 새 배열이므로 보관해도 된다.
 * threatAt은 중심 칸을 읽지 않으므로 p가 이미 돌인 자리여도 그 돌의 모양을 돌려준다 —
 * 시범에서 이미 놓인 돌의 모양을 비출 때 그대로 쓴다.
 */
export function threatsAt(cells, p, color) {
  const out = new Int8Array(4);
  for (let d = 0; d < 4; d++) out[d] = threatAt(cells, p, color, d);
  return out;
}

/**
 * 한 수의 기술 판정.
 * label 우선순위: 다섯 > 뚫린 사 > 사사 > 사삼 > 쌍삼 > 사 > 삼 > null.
 * 뚫린 사가 사사보다 앞인 이유: 이미 막을 수 없는 수라 아이에게 더 단순한 이름이 낫다.
 */
export function skillsOfMove(cells, p, color) {
  const threats = threatsAt(cells, p, color);
  let five = false;
  let openFour = false;
  let fours = 0;
  let openThrees = 0;
  const dirs = { five: [], four: [], three: [] };

  for (let d = 0; d < 4; d++) {
    const t = threats[d];
    if (t === T.FIVE) { five = true; dirs.five.push(d); }
    else if (t === T.OPEN_FOUR) { openFour = true; fours++; dirs.four.push(d); }
    else if (t === T.FOUR) { fours++; dirs.four.push(d); }
    else if (t === T.OPEN_THREE) { openThrees++; dirs.three.push(d); }
  }

  let label = null;
  if (five) label = SKILL.FIVE;
  else if (openFour) label = SKILL.OPEN_FOUR;
  else if (fours >= 2) label = SKILL.DOUBLE_FOUR;
  else if (fours >= 1 && openThrees >= 1) label = SKILL.FOUR_THREE;
  else if (openThrees >= 2) label = SKILL.DOUBLE_THREE;
  else if (fours >= 1) label = SKILL.FOUR;
  else if (openThrees >= 1) label = SKILL.THREE;

  return { five, openFour, fours, openThrees, label, dirs, threats };
}

/** 판정 결과가 skill(문자열 또는 배열)에 해당하는가. */
export function hasSkill(s, skill) {
  if (Array.isArray(skill)) return skill.some((k) => hasSkill(s, k));
  switch (skill) {
    case SKILL.FIVE: return s.five;
    case SKILL.OPEN_FOUR: return s.openFour;
    case SKILL.FOUR: return s.fours >= 1;
    case SKILL.THREE: return s.openThrees >= 1;
    case SKILL.DOUBLE_THREE: return s.openThrees >= 2;
    case SKILL.FOUR_THREE: return s.fours >= 1 && s.openThrees >= 1;
    case SKILL.DOUBLE_FOUR: return s.fours >= 2;
    default: throw new Error(`모르는 기술: ${skill}`);
  }
}

/** color가 두면 skill이 성립하는 빈칸 전부. "정답은 엔진이 열거한 전부"의 근거다. */
export function findSkillSpots(cells, color, skill) {
  const out = [];
  for (let p = 0; p < CELLS; p++) {
    if (cells[p] !== EMPTY) continue;
    if (hasSkill(skillsOfMove(cells, p, color), skill)) out.push(p);
  }
  return out;
}

/** 돌들로부터 체비쇼프 거리 radius 안의 빈칸. 수비 후보를 좁히는 데 쓴다. */
function emptiesNear(cells, color, radius) {
  const seen = new Uint8Array(CELLS);
  const out = [];
  for (let p = 0; p < CELLS; p++) {
    if (cells[p] !== color) continue;
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
  return out;
}

/**
 * 상대의 위협(skill)을 **한 수로 전부 없애는** 자리.
 * "막는 자리"를 모양별로 열거하지 않고 기능적으로 정의한다 — 띈삼은 가운데와 양끝이 다 답이고,
 * 붙은 삼은 바로 옆 두 칸만 답이라는 사실을 표로 적지 않아도 이 정의가 알아서 낸다.
 *
 * 후보를 상대 돌에서 거리 2 안으로 좁힌다. 막는 수는 반드시 그 모양에 닿아 있고,
 * 띈 모양의 막는 자리도 돌에서 두 칸을 넘지 않는다.
 * 위협이 애초에 없으면 빈 배열이고, 뚫린 사처럼 한 수로 못 막는 위협도 빈 배열이다.
 */
export function defenseSpots(cells, defender, skill) {
  const attacker = opponent(defender);
  if (findSkillSpots(cells, attacker, skill).length === 0) return [];
  const out = [];
  for (const p of emptiesNear(cells, attacker, 2)) {
    cells[p] = defender;
    const remaining = findSkillSpots(cells, attacker, skill).length;
    cells[p] = EMPTY;
    if (remaining === 0) out.push(p);
  }
  return out;
}

/**
 * 방향 d에서 p를 지나는 "모양"의 돌들 — 강조 표시용.
 * p에서 양쪽으로 뻗되 빈칸은 한 번만 건너뛴다(띈 모양 포함). 상대 돌·경계·두 번째 빈칸에서 멈춘다.
 * p 자체가 빈칸이어도 포함한다 — 두려는 자리까지 한 줄로 비추기 위해서다.
 * 인덱스는 줄을 따라 단조증가하므로 정렬하면 양 끝이 [0]과 [length-1]이다.
 */
export function shapeCells(cells, p, color, d) {
  const out = [p];
  const dr = DIRS[d][0];
  const dc = DIRS[d][1];
  for (const sign of [1, -1]) {
    let r = rowOf(p);
    let c = colOf(p);
    let gap = false;
    for (let k = 1; k <= 4; k++) {
      r += dr * sign;
      c += dc * sign;
      if (!inBounds(r, c)) break;
      const v = cells[idx(r, c)];
      if (v === color) { out.push(idx(r, c)); continue; }
      if (v === EMPTY && !gap) { gap = true; continue; }
      break;
    }
  }
  return out.sort((a, b) => a - b);
}

/** color가 다음 한 수로 5목을 만드는 자리 — VCF 헬퍼와 코치가 쓴다. */
function fiveSpots(cells, color) {
  const out = [];
  for (const p of candidates(cells)) {
    if (analyzeMove(cells, p, color).five) out.push(p);
  }
  return out;
}

/**
 * p에 두면 연속 사(VCF)로 이기는가. depth는 내가 두는 4의 개수.
 * ai.js의 findVcf와 같은 규칙이다: 내 4 → 상대는 5목 자리를 막는 수로 강제 → 반복.
 * 5목 자리가 둘이면(뚫린 사·사사) 그 자리에서 이긴 것이다.
 */
export function vcfWins(cells, me, p, depth) {
  if (cells[p] !== EMPTY) return false;
  const a = analyzeMove(cells, p, me);
  if (a.five) return true;
  if (a.fours === 0 || depth <= 0) return false;

  const opp = opponent(me);
  cells[p] = me;
  let win = false;
  const spots = fiveSpots(cells, me);
  if (spots.length >= 2) {
    win = true;
  } else if (spots.length === 1) {
    const block = spots[0];
    cells[block] = opp;
    // 상대가 막으면서 자기 5목을 완성하면 실패다 — findVcf가 안에서 같은 검사를 한다.
    win = !madeFive(cells, block, opp) && findVcf(cells, me, depth - 1, newVcfCtx()) >= 0;
    cells[block] = EMPTY;
  }
  cells[p] = EMPTY;
  return win;
}

/** 이미 놓인 돌 q가 5목을 이루는가. */
function madeFive(cells, q, color) {
  for (let d = 0; d < 4; d++) {
    if (threatAt(cells, q, color, d) === T.FIVE) return true;
  }
  return false;
}

/** depth수 안의 연속 사로 이기는 첫 수 전부. 퍼즐 정답과 코치의 "놓친 필승" 판단에 쓴다. */
export function vcfSpots(cells, me, depth) {
  const out = [];
  for (const p of candidates(cells)) {
    if (vcfWins(cells, me, p, depth)) out.push(p);
  }
  return out;
}
