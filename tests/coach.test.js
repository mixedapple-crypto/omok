/**
 * coach.js 테스트 — 코치가 끼어드는 경우와 끼어들지 않는 경우를 고정한다.
 *
 * 이 파일이 존재하는 이유: 코치는 "결정적 순간에만" 끼어들어야 한다. 잔소리가 잦으면 아이가
 * 코치를 꺼 버리고, 반대로 필승수를 놓쳤는데 조용하면 존재 이유가 없다. 둘 다 화면에서
 * 몇 판 둬 본 것으로는 확인이 안 되므로 국면을 직접 만들어 단언한다.
 */
import { analyzeTurn, judge, josa, COACH_VCF_DEPTH } from '../www/omok/js/coach.js';
import { BLACK, WHITE, CELLS, idx } from '../www/omok/js/board.js';
import { ok, eq, report } from './_assert.js';

const P = (r, c) => idx(r, c);
function boardWith(...groups) {
  const cells = new Int8Array(CELLS);
  for (const [color, coords] of groups) {
    for (const [r, c] of coords) cells[idx(r, c)] = color;
  }
  return cells;
}
const verdict = (cells, p, me = BLACK) => judge(analyzeTurn(cells, me), cells, me, p);

// --- 조사 ---------------------------------------------------------------------------
eq('받침 있음', josa('쌍삼', '이', '가'), '쌍삼이');
eq('받침 없음', josa('사사', '이', '가'), '사사가');
eq('띄어쓰기 낀 이름도 마지막 글자로', josa('뚫린 사', '이', '가'), '뚫린 사가');
eq('한글이 아니면 뒤 조사', josa('4-3', '이', '가'), '4-3가');

// --- 1. 다섯을 놓쳤다 ------------------------------------------------------------------
{
  const cells = boardWith([BLACK, [[7, 3], [7, 4], [7, 5], [7, 6]]], [WHITE, [[9, 9], [9, 10]]]);
  const f = verdict(cells, P(0, 0));
  eq('다섯을 두지 않으면 끼어든다', f?.kind, 'five');
  ok('그 자리를 알려준다', f.spots.includes(P(7, 7)) && f.spots.includes(P(7, 2)));
  ok('비출 줄이 있다', f.lines.length >= 1);
  eq('다섯을 두면 조용하다', verdict(cells, P(7, 7)), null);
}

// --- 2. 상대의 사를 안 막았다 ---------------------------------------------------------------
{
  const cells = boardWith([WHITE, [[7, 4], [7, 5], [7, 6], [7, 7]]], [BLACK, [[7, 3], [9, 9], [10, 10]]]);
  const f = verdict(cells, P(0, 0));
  eq('상대 사를 안 막으면 끼어든다', f?.kind, 'block-five');
  ok('막을 자리를 알려준다', f.spots.length === 1 && f.spots[0] === P(7, 8));
  eq('막으면 조용하다', verdict(cells, P(7, 8)), null);
}
{
  // 상대가 뚫린 사 — 어차피 못 막는다. 잔소리하지 않는다.
  const cells = boardWith([WHITE, [[7, 4], [7, 5], [7, 6], [7, 7]]], [BLACK, [[9, 9], [10, 10]]]);
  eq('못 막는 상황이면 조용하다', verdict(cells, P(0, 0)), null);
}
{
  // 내 다섯이 있으면 상대 사보다 우선이다 — 이기는 수를 두면 조용, 막으러 가면 "다섯" 지적.
  const cells = boardWith(
    [BLACK, [[7, 3], [7, 4], [7, 5], [7, 6]]],
    [WHITE, [[9, 3], [9, 4], [9, 5], [9, 6]]],
  );
  eq('이길 수 있는데 막으러 가면 다섯을 지적한다', verdict(cells, P(9, 7))?.kind, 'five');
  eq('이기는 수는 조용하다', verdict(cells, P(7, 7)), null);
}

// --- 3. 사삼·사사·뚫린 사를 놓쳤다 ----------------------------------------------------------
{
  const cells = boardWith(
    [BLACK, [[7, 4], [7, 5], [7, 6], [5, 7], [6, 7]]],
    [WHITE, [[7, 3], [11, 11], [12, 12], [1, 1]]],
  );
  const f = verdict(cells, P(0, 0));
  eq('사삼을 놓치면 끼어든다', f?.kind, 'win');
  ok('문구에 기술 이름과 맞는 조사가 들어간다', f.text.includes('사삼이'), f.text);
  eq('사삼을 두면 조용하다', verdict(cells, P(7, 7)), null);
}
{
  const cells = boardWith([BLACK, [[7, 4], [7, 5], [7, 6]]], [WHITE, [[11, 11], [12, 12], [1, 1]]]);
  const f = verdict(cells, P(0, 0));
  eq('뚫린 사를 놓치면 끼어든다', f?.kind, 'win');
  ok('뚫린 사는 받침이 없어 "가"', f.text.includes('뚫린 사가'), f.text);
}

// --- 4. 연속 사를 놓쳤다 -----------------------------------------------------------------------
{
  const cells = boardWith(
    [BLACK, [[7, 4], [7, 5], [7, 6], [10, 7], [8, 8], [8, 9], [8, 10]]],
    [WHITE, [[7, 3], [8, 11], [1, 1], [2, 2]]],
  );
  ok('코치의 연속 사 깊이는 3 이상', COACH_VCF_DEPTH >= 3);
  const f = verdict(cells, P(0, 0));
  eq('세 수 연속 사를 놓치면 끼어든다', f?.kind, 'vcf');
  eq('연속 사의 첫 수를 두면 조용하다', verdict(cells, P(7, 7)), null);
  eq('다른 시작점도 조용하다', verdict(cells, P(8, 7)), null);
}

// --- 5. 상대의 삼을 안 막았다 -----------------------------------------------------------------
{
  const cells = boardWith([WHITE, [[7, 4], [7, 5], [7, 6]]], [BLACK, [[11, 11], [12, 12], [1, 1]]]);
  const f = verdict(cells, P(0, 0));
  eq('상대 삼을 안 막으면 끼어든다', f?.kind, 'block-three');
  ok('막는 자리 둘을 알려준다', f.spots.includes(P(7, 3)) && f.spots.includes(P(7, 7)));
  eq('막으면 조용하다', verdict(cells, P(7, 7)), null);
}
{
  // 내가 사를 만들어 되받아치는 수는 막지 않아도 지적하지 않는다 — 상대가 먼저 막아야 하므로.
  const cells = boardWith(
    [WHITE, [[7, 4], [7, 5], [7, 6]]],
    [BLACK, [[11, 8], [11, 9], [11, 10], [3, 3]]],
  );
  cells[P(11, 7)] = WHITE; // 내 삼의 한쪽을 막아 사가 막힌 사가 되게
  eq('되받아치는 사는 조용하다', verdict(cells, P(11, 11)), null);
}

// --- 아무 일도 없는 국면 ------------------------------------------------------------------------
{
  const cells = boardWith([BLACK, [[7, 7]]], [WHITE, [[7, 8]]]);
  eq('평범한 국면에서는 조용하다', verdict(cells, P(8, 8)), null);
}

report('coach.test');
