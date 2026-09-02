/**
 * puzzle.js 테스트 — 생성기가 내는 퍼즐이 전부 풀 수 있고, 정답이 엔진 정의와 일치하는지 고정한다.
 *
 * 이 파일이 존재하는 이유: 퍼즐은 무작위로 생성된다. 화면에서 몇 판 눌러 본 것으로는
 * "어떤 대칭·위치·방해돌 조합에서 정답이 사라지거나 엉뚱한 정답이 생기는" 경우를 못 잡는다.
 * 그래서 시드를 고정하고 레슨마다 수십 판을 만들어 전부 검사한다.
 * 마무리 단계(기술을 둔 뒤 끝까지 이기기)는 아이가 정답만 두면 반드시 이기는 데까지 가야 한다 —
 * 중간에 정답이 없어지면 "맞게 뒀는데 끝났다"가 되므로 그것도 여기서 고정한다.
 */
import {
  parseTemplate, transformTemplate, makePuzzle, answerPuzzle, validate, solve, explainWrong,
  answerLines, opponentReply, EDGE_MARGIN, DISTRACTOR_GAP,
} from '../www/omok/js/puzzle.js';
import { LESSONS } from '../www/omok/js/lessons.js';
import { SKILL, skillsOfMove, hasSkill, findSkillSpots, vcfWins } from '../www/omok/js/tactics.js';
import { makeRng } from '../www/omok/js/ai.js';
import { BLACK, WHITE, EMPTY, CELLS, SIZE, idx, rowOf, colOf, opponent } from '../www/omok/js/board.js';
import { ok, eq, report } from './_assert.js';

const rc = (i) => `(${rowOf(i)},${colOf(i)})`;

// --- 템플릿 파서와 대칭 ----------------------------------------------------------------
{
  const tpl = parseTemplate(['XX.', 'O..', '...']);
  eq('돌·빈칸을 전부 읽는다', tpl.length, 9);
  const seen = new Set();
  for (let k = 0; k < 8; k++) {
    const t = transformTemplate(tpl, k);
    ok(`대칭 ${k}: 좌상단이 (0,0)`, Math.min(...t.map((c) => c.r)) === 0 && Math.min(...t.map((c) => c.c)) === 0);
    eq(`대칭 ${k}: 칸 수 보존`, t.length, 9);
    seen.add(t.filter((c) => c.v !== '.').map((c) => `${c.r},${c.c},${c.v}`).sort().join('|'));
  }
  ok('비대칭 모양은 대칭 8가지가 전부 다르다', seen.size === 8, `${seen.size}가지`);
}

// --- 레슨별 퍼즐 생성: 시드를 고정하고 수십 판 --------------------------------------------------
const PER_LESSON = 40;

function checkAnswer(puzzle, p) {
  const { cells, me } = puzzle;
  if (puzzle.kind === 'attack') return hasSkill(skillsOfMove(cells, p, me), puzzle.skill);
  if (puzzle.kind === 'vcf') return vcfWins(cells, me, p, puzzle.depth);
  // defense: 두고 나면 상대의 그 기술 자리가 없어야 한다
  cells[p] = me;
  const left = findSkillSpots(cells, opponent(me), puzzle.skill).length;
  cells[p] = EMPTY;
  return left === 0;
}

/** 아이가 정답만 두는 시뮬레이션. 마무리 단계까지 끝까지 간다. */
function playThrough(puzzle) {
  let moves = 0;
  for (;;) {
    const p = puzzle.answers[0];
    const res = answerPuzzle(puzzle, p);
    if (!res.correct) return { ok: false, reason: `정답이 오답으로 채점됨 ${rc(p)}` };
    moves++;
    if (res.done) return { ok: true, won: res.won, moves };
    if (moves > 12) return { ok: false, reason: '12수 안에 끝나지 않음' };
    if (puzzle.answers.length === 0) return { ok: false, reason: '마무리 중 정답이 사라짐' };
  }
}

for (const lesson of LESSONS) {
  const spec = { ...lesson.puzzle };
  const rng = makeRng(2026);
  let bad = null;
  let minAnswers = Infinity;
  let maxAnswers = 0;
  let noisy = 0;

  for (let i = 0; i < PER_LESSON && !bad; i++) {
    let puzzle;
    try { puzzle = makePuzzle(spec, rng); } catch (e) { bad = `생성 실패: ${e.message}`; break; }

    const stones = [...puzzle.cells].filter((v) => v !== EMPTY).length;
    const tplStones = Math.max(...spec.templates.map((t) => t.join('').replace(/[^XO]/g, '').length));
    if (stones > tplStones) noisy++;

    const why = validate(puzzle.cells, spec, puzzle.answers);
    if (why) { bad = `건전성: ${why}`; break; }
    minAnswers = Math.min(minAnswers, puzzle.answers.length);
    maxAnswers = Math.max(maxAnswers, puzzle.answers.length);

    // 정답은 전부 빈칸이고 실제로 그 기술이 성립한다.
    for (const p of puzzle.answers) {
      if (puzzle.cells[p] !== EMPTY) { bad = `정답이 빈칸이 아님 ${rc(p)}`; break; }
      if (!checkAnswer(puzzle, p)) { bad = `정답인데 기술이 성립하지 않음 ${rc(p)}`; break; }
    }
    if (bad) break;

    // 정답이 아닌 빈칸은 실제로 기술이 성립하지 않는다 (열거의 완전성).
    for (let p = 0; p < CELLS && !bad; p++) {
      if (puzzle.cells[p] !== EMPTY || puzzle.answers.includes(p)) continue;
      if (checkAnswer(puzzle, p)) bad = `정답 목록에 빠진 정답 ${rc(p)}`;
    }
    if (bad) break;

    // 돌은 전부 가장자리에서 떨어져 있다 (템플릿 상자 기준이라 방해돌은 예외).
    for (const p of puzzle.focus) {
      const r = rowOf(p);
      const c = colOf(p);
      if (r < EDGE_MARGIN || c < EDGE_MARGIN || r >= SIZE - EDGE_MARGIN || c >= SIZE - EDGE_MARGIN) {
        bad = `템플릿 돌이 가장자리에 붙음 ${rc(p)}`;
      }
    }
    if (bad) break;

    // 오답 하나를 채점해 본다 — 설명 재료가 나와야 하고 판은 바뀌지 않아야 한다.
    const wrongSpot = [...Array(CELLS).keys()].find((p) => puzzle.cells[p] === EMPTY && !puzzle.answers.includes(p));
    const before = Int8Array.from(puzzle.cells);
    const w = answerPuzzle(puzzle, wrongSpot);
    if (w.correct || !w.why) { bad = '오답이 정답으로 채점됨'; break; }
    if (before.some((v, k) => v !== puzzle.cells[k])) { bad = '오답을 채점했는데 판이 바뀜'; break; }
    if (puzzle.wrong !== 1) { bad = '오답 횟수가 안 셈'; break; }

    // 정답만 두면 끝까지 간다. 마무리가 있는 퍼즐은 반드시 이긴다.
    const run = playThrough(puzzle);
    if (!run.ok) { bad = run.reason; break; }
    const mustWin = puzzle.kind === 'vcf' || (puzzle.kind === 'attack' && puzzle.finish);
    if (mustWin && !run.won) { bad = `마무리 퍼즐인데 이기지 못함 (${run.moves}수)`; break; }
    if (!mustWin && run.moves !== 1) { bad = '한 수 퍼즐이 한 수로 안 끝남'; break; }
  }

  ok(`[${lesson.id}] ${PER_LESSON}판 전부 풀 수 있고 정답 열거가 완전하다`, bad === null, bad ?? '');
  ok(`[${lesson.id}] 정답 수가 터무니없이 많지 않다 (최대 ${maxAnswers})`, maxAnswers <= 6, `최소 ${minAnswers} 최대 ${maxAnswers}`);
  ok(`[${lesson.id}] 방해돌이 실제로 들어간다`, noisy > 0, '방해돌이 한 번도 안 들어감 — 재검증에서 전부 탈락하는 템플릿');
}

// --- 오답 설명 재료 -----------------------------------------------------------------------
{
  // 쌍삼 퍼즐에서 삼 하나만 생기는 자리를 누르면 label이 '삼'이어야 한다.
  const lesson = LESSONS.find((l) => l.id === 'double-three');
  const puzzle = makePuzzle({ ...lesson.puzzle, distractors: [0, 0] }, makeRng(7));
  const threeOnly = [...Array(CELLS).keys()].find((p) => puzzle.cells[p] === EMPTY
    && skillsOfMove(puzzle.cells, p, puzzle.me).label === SKILL.THREE);
  const why = explainWrong(puzzle, threeOnly);
  eq('오답 설명: 삼 하나만 생기는 자리', why.label, SKILL.THREE);
  ok('오답 설명에 비출 줄이 있다', why.lines.length === 1 && why.lines[0].includes(threeOnly));
  ok('정답 공개용 줄도 나온다', answerLines(puzzle).length >= 2);
}
{
  const lesson = LESSONS.find((l) => l.id === 'block-three');
  const puzzle = makePuzzle({ ...lesson.puzzle, distractors: [0, 0] }, makeRng(3));
  const far = [...Array(CELLS).keys()].find((p) => puzzle.cells[p] === EMPTY && !puzzle.answers.includes(p));
  const why = explainWrong(puzzle, far);
  eq('수비 오답 설명: 상대가 여전히 둘 수 있는 자리를 준다', why.kind, 'defense');
  ok('그 자리가 하나 이상 있다', why.remaining.length >= 1);
}

// --- 상대 응수는 결정론적이고 합리적이다 ----------------------------------------------------
{
  const cells = new Int8Array(CELLS);
  for (const [r, c] of [[7, 4], [7, 5], [7, 6], [7, 7]]) cells[idx(r, c)] = BLACK;
  cells[idx(7, 3)] = WHITE;
  eq('내 다섯 자리가 있으면 그곳을 막는다', opponentReply(cells, BLACK), idx(7, 8));
  const open = new Int8Array(CELLS);
  for (const [r, c] of [[7, 5], [7, 6], [7, 7]]) open[idx(r, c)] = BLACK;
  ok('내 삼이 있으면 뚫린 사가 될 자리를 막는다', [idx(7, 4), idx(7, 8)].includes(opponentReply(open, BLACK)));
}

// --- 방해돌 간격 상수가 창 반경보다 크다 -----------------------------------------------------------
ok('방해돌 간격이 9칸 창(±4) 밖이다', DISTRACTOR_GAP >= 5, `${DISTRACTOR_GAP}`);

report('puzzle.test');
