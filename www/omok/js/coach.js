/**
 * 실전 코치 — 아이의 수가 확정되기 **전** 국면을 분석해 두고, 결정적 순간에만 끼어든다.
 *
 * 개입 규칙(순서대로 하나만 고른다). 지침서의 "코치가 끼어드는 경우" 표와 대조된다:
 *   1. 다섯을 만들 수 있었는데 안 뒀다
 *   2. 상대가 다음 수에 다섯을 만드는데 안 막았다
 *   3. 뚫린 사·사사·사삼을 만들 수 있었는데 안 뒀다
 *   4. 세 수 안에 이기는 연속 사가 있었는데 안 뒀다
 *   5. 상대의 삼을 안 막았다(내가 사를 만들어 되받아치는 수는 예외)
 *
 * 매 수 참견하면 아이가 코치를 꺼 버린다. 그래서 "더 좋은 수"가 아니라 **놓친 필승과 놓친 필수 수비**만 본다.
 * 사용자 결정: 판이 끝난 뒤가 아니라 **즉시** 끼어들어 무르기를 제안한다 — 초3은 판이 끝나면 그 순간을 기억하지 못한다.
 */

import { opponent } from './board.js';
import { SKILL, SKILL_NAME, skillsOfMove, findSkillSpots, defenseSpots, vcfSpots, shapeCells } from './tactics.js';

/** 코치가 찾아보는 연속 사 깊이(내가 두는 사의 개수). 레슨 9와 같다. */
export const COACH_VCF_DEPTH = 3;

/**
 * 개입 규칙의 정본 — judge()가 이 순서대로 검사한다. 지침서의 표와 tests/omok-doc-sync.test.js 가 대조한다.
 * 규칙을 더하거나 빼면 judge()와 지침서를 같이 고친다.
 */
export const COACH_RULES = Object.freeze([
  Object.freeze({ kind: 'five', ko: '다섯을 만들 수 있었는데 안 뒀다' }),
  Object.freeze({ kind: 'block-five', ko: '상대가 다음 수에 다섯을 만드는데 안 막았다' }),
  Object.freeze({ kind: 'win', ko: '뚫린 사·사사·사삼을 만들 수 있었는데 안 뒀다' }),
  Object.freeze({ kind: 'vcf', ko: '연속 사로 이길 수 있었는데 안 뒀다' }),
  Object.freeze({ kind: 'block-three', ko: '상대의 삼을 안 막았다' }),
]);

/** 받침 유무로 조사를 고른다. 한글이 아니면 뒤 조사(받침 없음)를 쓴다. */
export function josa(word, withBatchim, without) {
  const ch = word.charCodeAt(word.length - 1);
  if (ch < 0xac00 || ch > 0xd7a3) return `${word}${without}`;
  return `${word}${(ch - 0xac00) % 28 === 0 ? without : withBatchim}`;
}

/** 아이가 두기 전 국면 분석. 전부 tactics.js 열거라 몇 밀리초면 끝난다. */
export function analyzeTurn(cells, me) {
  const opp = opponent(me);
  const five = findSkillSpots(cells, me, SKILL.FIVE);
  const oppFive = findSkillSpots(cells, opp, SKILL.FIVE);
  const blockFive = oppFive.length ? defenseSpots(cells, me, SKILL.FIVE) : [];
  const win = findSkillSpots(cells, me, [SKILL.OPEN_FOUR, SKILL.DOUBLE_FOUR, SKILL.FOUR_THREE]);
  // 다섯이 있거나 상대 다섯을 막아야 하면 연속 사는 볼 필요가 없다.
  const vcf = five.length || oppFive.length ? [] : vcfSpots(cells, me, COACH_VCF_DEPTH);
  const oppOpen = findSkillSpots(cells, opp, SKILL.OPEN_FOUR);
  const blockThree = oppOpen.length ? defenseSpots(cells, me, SKILL.OPEN_FOUR) : [];
  return { five, oppFive, blockFive, win, vcf, oppOpen, blockThree };
}

/**
 * 개입 결과. spots는 아이가 뒀어야 할 자리(전부 표식으로 보여준다), lines는 비출 모양 —
 * 공격이면 그 자리에서 생기는 내 모양, 수비면 상대의 위협 모양이다. 첫 자리 하나만 비춘다.
 * 여러 자리를 다 비추면 아이가 어디를 봐야 할지 모른다.
 */
function finding(cells, kind, spots, text, lineSpot, lineColor) {
  const s = skillsOfMove(cells, lineSpot, lineColor);
  const lines = [...s.dirs.five, ...s.dirs.four, ...s.dirs.three].map((d) => shapeCells(cells, lineSpot, lineColor, d));
  return { kind, spots, text, lines };
}

/**
 * 아이의 수 p를 판정한다. 끼어들 이유가 없으면 null.
 * @param {ReturnType<analyzeTurn>} a  두기 전에 analyzeTurn으로 받아 둔 분석
 */
export function judge(a, cells, me, p) {
  const s = skillsOfMove(cells, p, me);
  if (s.five) return null; // 이기는 수는 언제나 옳다
  const opp = opponent(me);

  if (a.five.length) {
    return finding(cells, 'five', a.five, '다섯을 만들 수 있었어요!', a.five[0], me);
  }
  if (a.blockFive.length && !a.blockFive.includes(p)) {
    return finding(cells, 'block-five', a.blockFive, '상대가 다음에 다섯을 만들어요! 여기를 막아야 해요.', a.oppFive[0], opp);
  }
  if (a.oppFive.length) return null; // 못 막는 상황(뚫린 사 등)이면 잔소리하지 않는다

  if (a.win.length && !a.win.includes(p) && !a.vcf.includes(p)) {
    const name = SKILL_NAME[skillsOfMove(cells, a.win[0], me).label].ko;
    return finding(cells, 'win', a.win, `여기에 ${josa(name, '이', '가')} 있었어요!`, a.win[0], me);
  }
  if (a.vcf.length && !a.vcf.includes(p)) {
    return finding(cells, 'vcf', a.vcf, '사를 이어서 만들면 이길 수 있었어요!', a.vcf[0], me);
  }
  if (a.blockThree.length && !a.blockThree.includes(p) && s.fours === 0) {
    return finding(cells, 'block-three', a.blockThree, '상대의 삼을 막아야 해요! 안 막으면 뚫린 사가 돼요.', a.oppOpen[0], opp);
  }
  return null;
}
