/**
 * 오목 교실 흐름 — 보기(시범) → 찾기(퍼즐) → 써보기(실전).
 *
 * 화면은 자기 캔버스(#lesson-board)와 자기 Renderer를 쓴다. 게임 화면의 캔버스를 옮겨 쓰지 않는
 * 이유: 두 화면이 한 캔버스를 나눠 쓰면 resize·ResizeObserver·pulse가 서로 얽혀 어느 쪽이
 * 그렸는지 알 수 없게 된다. 캔버스 하나 더 두는 비용이 훨씬 싸다.
 *
 * 써보기(실전)는 game.js의 몫이다. 이 모듈은 onPractice로 넘기고, 결과를 onPracticeResult로 돌려받는다.
 *
 * 별 규칙(지침서와 대조된다):
 *   보기   — 시범을 끝까지 본다
 *   찾기   — 퍼즐 PUZZLES_PER_LESSON개 중 PUZZLE_STAR_MIN개 이상을 힌트·오답 없이 첫 시도에 맞힌다
 *   써보기 — 그 레슨의 실전 한 판을 이긴다
 */

import { BLACK, WHITE, EMPTY, CELLS, idx, findWinLine } from './board.js';
import { Renderer } from './render.js';
import { LESSONS, lessonById, PUZZLES_PER_LESSON, PUZZLE_STAR_MIN } from './lessons.js';
import { makePuzzle, answerPuzzle } from './puzzle.js';
import { SKILL, SKILL_NAME, BADGE_SKILLS, skillsOfMove, shapeCells } from './tactics.js';
import { josa } from './coach.js';
import * as ui from './ui.js';
import * as store from './storage.js';
import * as audio from './audio.js';

const MY_LINE = 'rgba(255,183,3,.75)';
const OPP_LINE = 'rgba(229,87,63,.75)';
const FIVE_LINE = 'rgba(255,255,255,.85)';
const WRONG_LINE = 'rgba(229,87,63,.45)';

/** 배지 아이콘. 배지 대상 기술은 tactics.js의 BADGE_SKILLS가 정한다. */
const BADGE_ICON = Object.freeze({ '33': '🌟', '43': '⚡', '44': '👑' });

/** 오답 몇 번째에 힌트를 자동으로 주고, 몇 번째에 정답을 보여주는가. 지침서와 대조된다. */
export const AUTO_HINT_AT = 2;
export const REVEAL_AT = 3;

let renderer = null;
let onPractice = () => {};

const S = {
  lesson: null,
  part: 'demo', // 'demo' | 'puzzle' | 'summary'
  board: { cells: new Int8Array(CELLS), turn: BLACK },
  demoIndex: -1, // -1이면 소개 문구
  numbers: {},
  moveNo: 0,
  lines: [],
  marks: [],
  lastMove: -1,
  winLine: null,
  preview: -1,
  puzzle: null,
  puzzleNo: 0,
  firstTry: 0,
  hintUsed: false,
  awaiting: false, // 퍼즐이 아이의 탭을 기다리는 중인가
};

// ── 그리기 ───────────────────────────────────────────────────────────────

function draw() {
  if (!renderer) return;
  renderer.draw(S.board, {
    preview: S.preview,
    previewColor: BLACK,
    lastMove: S.lastMove,
    winLine: S.winLine,
    lines: S.lines,
    marks: S.marks,
    numbers: S.numbers,
  });
}

function clearOverlays() {
  S.lines = [];
  S.marks = [];
  S.preview = -1;
}

const P = ([r, c]) => idx(r, c);

/** 한 수가 만드는 모양의 줄들. 다섯은 흰색, 내 것은 노랑, 상대 것은 빨강. */
function shapeLines(cells, p, color) {
  const s = skillsOfMove(cells, p, color);
  const out = [];
  for (const d of s.dirs.five) out.push({ cells: shapeCells(cells, p, color, d), color: FIVE_LINE });
  for (const d of [...s.dirs.four, ...s.dirs.three]) {
    out.push({ cells: shapeCells(cells, p, color, d), color: color === BLACK ? MY_LINE : OPP_LINE });
  }
  return out;
}

// ── 공개 API ──────────────────────────────────────────────────────────────

export function init({ canvas, onPractice: practiceHandler }) {
  renderer = new Renderer(canvas);
  onPractice = practiceHandler;
  canvas.addEventListener('pointerdown', onPointer);
  canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  const onResize = () => { renderer.resize(); draw(); };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 120));
  if (window.ResizeObserver && canvas.parentElement) new ResizeObserver(onResize).observe(canvas.parentElement);
  ui.onLesson(openLesson);
}

/** 다음에 추천할 레슨 — 별 셋을 못 채운 첫 레슨. 전부 채웠으면 null. */
export function nextLessonId() {
  return LESSONS.find((l) => store.lessonStars(l.id) < 3)?.id ?? null;
}

export function openList() {
  const skills = store.get().skills ?? {};
  ui.renderLessons(LESSONS, store.lessonStars, nextLessonId());
  ui.renderBadges(BADGE_SKILLS.map((k) => ({
    key: k, ko: SKILL_NAME[k].ko, code: SKILL_NAME[k].code, count: skills[k] || 0, icon: BADGE_ICON[k] ?? '🏅',
  })));
  ui.setScreen('lessons');
}

export function openLesson(id) {
  const lesson = lessonById(id);
  if (!lesson) return;
  S.lesson = lesson;
  ui.setLessonHead(lesson.title, lesson.code);
  ui.setScreen('lesson');
  startDemo();
  requestAnimationFrame(() => { renderer.resize(); draw(); });
}

/** game.js가 실전 한 판이 끝났을 때 부른다. */
export function onPracticeResult(id, won) {
  if (won) store.markLesson(id, 'practice');
}

export function next() {
  if (S.part === 'demo') {
    if (S.demoIndex < S.lesson.demo.steps.length - 1) { S.demoIndex++; showDemoStep(); return; }
    store.markLesson(S.lesson.id, 'demo');
    startPuzzles();
  } else if (S.part === 'puzzle') {
    if (!S.awaiting) { S.puzzleNo++; nextPuzzle(); }
  } else if (S.part === 'summary') {
    onPractice(S.lesson);
  }
}

export function prev() {
  if (S.part === 'demo') {
    if (S.demoIndex > -1) { S.demoIndex--; showDemoStep(); }
  } else if (S.part === 'summary') {
    startPuzzles();
  }
}

export function place() {
  if (S.part === 'puzzle' && S.awaiting && S.preview >= 0) answer(S.preview);
}

export function hint() {
  if (S.part !== 'puzzle' || !S.awaiting || !S.puzzle) return;
  S.hintUsed = true;
  showHint();
  draw();
}

/** 테스트 전용 — 가짜 DOM 위에서 흐름을 구동하는 tests/flow.test.js 가 상태와 렌더러를 들여다본다. */
export function _peek() {
  return { S, renderer };
}

// ── 보기(시범) ─────────────────────────────────────────────────────────────

function loadStones(stones) {
  S.board.cells.fill(EMPTY);
  for (const rc of stones.X ?? []) S.board.cells[P(rc)] = BLACK;
  for (const rc of stones.O ?? []) S.board.cells[P(rc)] = WHITE;
  S.numbers = {};
  S.moveNo = 0;
  S.lastMove = -1;
  S.winLine = null;
}

function startDemo() {
  S.part = 'demo';
  S.demoIndex = -1;
  S.awaiting = false;
  S.puzzle = null;
  ui.setLessonPart('demo', store.get().lessons?.[S.lesson.id]);
  showDemoStep();
}

/** 단계 하나를 판에 적용한다. 겹층은 이 단계 것만 남긴다. */
function applyStep(step) {
  clearOverlays();
  if (step.reset) loadStones(S.lesson.demo.stones);
  if (step.add) {
    for (const rc of step.add.X ?? []) S.board.cells[P(rc)] = BLACK;
    for (const rc of step.add.O ?? []) S.board.cells[P(rc)] = WHITE;
  }
  if (step.focus?.length) {
    const cells = step.focus.map(P);
    const color = S.board.cells[cells[0]] === WHITE ? OPP_LINE : MY_LINE;
    S.lines.push({ cells: [cells[0], cells[cells.length - 1]], color });
  }
  if (step.ask) S.marks.push(...step.ask.map((rc) => ({ i: P(rc), kind: 'ask' })));
  if (step.marks) S.marks.push(...step.marks.map((rc) => ({ i: P(rc), kind: 'good' })));
  if (step.move) {
    const p = P(step.move);
    const color = step.who === 'O' ? WHITE : BLACK;
    S.board.cells[p] = color;
    S.numbers[p] = ++S.moveNo;
    S.lastMove = p;
    if (step.expect) {
      S.lines.push(...shapeLines(S.board.cells, p, color));
      if (step.expect === SKILL.FIVE) S.winLine = findWinLine(S.board.cells, p, color);
    }
  }
}

function showDemoStep() {
  const { demo, intro } = S.lesson;
  loadStones(demo.stones);
  clearOverlays();
  for (let i = 0; i <= S.demoIndex; i++) applyStep(demo.steps[i]);
  const last = S.demoIndex >= demo.steps.length - 1;
  ui.setBubble(S.demoIndex < 0 ? intro : demo.steps[S.demoIndex].say);
  ui.setLessonButtons({ prev: S.demoIndex > -1 ? '이전' : '', next: last ? '찾기 시작!' : '다음' });
  draw();
}

// ── 찾기(퍼즐) ─────────────────────────────────────────────────────────────

function targetName() {
  const { puzzle } = S.lesson;
  if (puzzle.kind === 'vcf') return '사';
  if (puzzle.kind === 'defense') return '막는 자리';
  return SKILL_NAME[puzzle.skill].ko;
}

function startPuzzles() {
  S.part = 'puzzle';
  S.puzzleNo = 0;
  S.firstTry = 0;
  ui.setLessonPart('puzzle', store.get().lessons?.[S.lesson.id]);
  nextPuzzle();
}

function nextPuzzle() {
  if (S.puzzleNo >= PUZZLES_PER_LESSON) { summary(); return; }
  S.puzzle = makePuzzle(S.lesson.puzzle);
  S.board.cells.set(S.puzzle.cells);
  S.numbers = {};
  S.lastMove = -1;
  S.winLine = null;
  S.hintUsed = false;
  S.awaiting = true;
  clearOverlays();
  ui.setBubble(`${S.puzzleNo + 1}/${PUZZLES_PER_LESSON}  ${S.lesson.puzzle.prompt}`);
  ui.setLessonButtons({ hint: true, place: true, placeEnabled: false });
  draw();
}

function onPointer(e) {
  if (S.part !== 'puzzle' || !S.awaiting) return;
  const i = renderer.hitTest(e.clientX, e.clientY);
  if (i < 0) return;
  if (S.board.cells[i] !== EMPTY) { audio.nope(); return; }
  if (store.get().instant || S.preview === i) { answer(i); return; }
  S.preview = i;
  ui.setLessonButtons({ hint: true, place: true, placeEnabled: true });
  draw();
}

function showHint() {
  S.marks = S.marks.filter((m) => m.kind !== 'hint');
  S.marks.push(...S.puzzle.focus.map((i) => ({ i, kind: 'hint' })));
  const who = S.puzzle.kind === 'defense' ? '흰 돌' : '검은 돌';
  ui.setBubble(`노란 고리가 있는 ${who}들을 잘 보세요. ${S.lesson.puzzle.prompt}`);
}

function revealAnswers() {
  S.marks = S.marks.filter((m) => m.kind !== 'bad');
  S.marks.push(...S.puzzle.answers.map((i) => ({ i, kind: 'good' })));
  ui.setBubble('여기예요! 초록 동그라미 자리를 눌러 보세요.', 'good');
}

function wrongText(why) {
  if (why.kind === 'occupied') return '거기엔 이미 돌이 있어요.';
  if (why.kind === 'defense') return '여기를 막아도 흰 돌이 빨간 표시 자리에 둘 수 있어요. 다시 골라 보세요.';
  const { kind } = S.lesson.puzzle;
  if (kind === 'vcf') {
    return why.label
      ? '사는 맞는데 그다음이 이어지지 않아요. 다른 사를 찾아보세요.'
      : '사가 아니에요. 상대가 꼭 막아야 하는 자리를 찾아요.';
  }
  if (!why.label) return '여기는 아무 모양도 안 생겨요. 내 돌 옆을 잘 보세요.';
  const name = SKILL_NAME[why.label].ko;
  return `여기는 ${josa(name, '이', '가')} 생겨요. ${josa(targetName(), '을', '를')} 찾아보세요.`;
}

function answer(i) {
  const { puzzle } = S;
  S.preview = -1;
  const before = skillsOfMove(puzzle.cells, i, BLACK);
  const res = answerPuzzle(puzzle, i);

  if (!res.correct) {
    audio.nope();
    S.marks = S.marks.filter((m) => m.kind !== 'bad');
    S.marks.push({ i, kind: 'bad' });
    S.lines = [];
    if (res.why.kind === 'defense') {
      S.marks.push(...res.why.remaining.slice(0, 3).map((q) => ({ i: q, kind: 'bad' })));
    } else if (res.why.lines) {
      S.lines = res.why.lines.map((cells) => ({ cells, color: WRONG_LINE }));
    }
    ui.setBubble(wrongText(res.why), 'bad');
    if (puzzle.wrong >= REVEAL_AT) revealAnswers();
    else if (puzzle.wrong >= AUTO_HINT_AT) { S.hintUsed = true; showHint(); ui.setBubble(`${wrongText(res.why)} 노란 고리 돌들을 보세요.`, 'bad'); }
    ui.setLessonButtons({ hint: true, place: true, placeEnabled: false });
    draw();
    return;
  }

  // 정답 — 판을 퍼즐 상태(상대 응수 포함)와 맞추고 모양을 비춘다.
  audio.stone();
  S.board.cells.set(puzzle.cells);
  S.marks = [];
  S.lines = puzzle.kind === 'defense'
    ? []
    : shapeLinesFrom(before, puzzle.cells, i);
  S.lastMove = res.reply >= 0 ? res.reply : i;

  if (!res.done) {
    S.awaiting = true;
    ui.setBubble(res.reply >= 0 ? '정답! 상대가 막았어요. 계속 이겨 보세요!' : '정답! 계속 이겨 보세요!', 'good');
    ui.setLessonButtons({ hint: false, place: true, placeEnabled: false });
    draw();
    return;
  }

  S.awaiting = false;
  if (puzzle.wrong === 0 && !S.hintUsed) S.firstTry++;
  const last = S.puzzleNo >= PUZZLES_PER_LESSON - 1;
  if (res.won) {
    S.winLine = findWinLine(puzzle.cells, i, BLACK);
    audio.win();
    ui.setBubble('다섯! 이겼어요!', 'good');
  } else if (puzzle.kind === 'defense') {
    ui.setBubble('잘 막았어요!', 'good');
  } else {
    const name = SKILL_NAME[before.label ?? puzzle.skill]?.ko ?? '';
    ui.setBubble(`정답! ${name}!`, 'good');
  }
  ui.setLessonButtons({ next: last ? '결과 보기' : '다음 문제' });
  draw();
}

/** 정답 수의 모양 줄 — 방향은 두기 전 판정(before)에서, 돌 목록은 둔 뒤 판에서. */
function shapeLinesFrom(before, cells, p) {
  const out = [];
  for (const d of before.dirs.five) out.push({ cells: shapeCells(cells, p, BLACK, d), color: FIVE_LINE });
  for (const d of [...before.dirs.four, ...before.dirs.three]) out.push({ cells: shapeCells(cells, p, BLACK, d), color: MY_LINE });
  return out;
}

function summary() {
  S.part = 'summary';
  S.awaiting = false;
  const star = S.firstTry >= PUZZLE_STAR_MIN;
  if (star) store.markLesson(S.lesson.id, 'puzzle');
  ui.setLessonPart('puzzle', store.get().lessons?.[S.lesson.id]);
  clearOverlays();
  ui.setBubble(
    `${PUZZLES_PER_LESSON}문제 중 ${S.firstTry}문제를 한 번에 맞혔어요! `
    + (star ? '별 획득! 이제 컴퓨터랑 써볼까요?' : `${PUZZLE_STAR_MIN}문제 이상 한 번에 맞히면 별을 받아요. 다시 풀어 볼까요?`),
    star ? 'good' : '',
  );
  ui.setLessonButtons({ prev: '다시 풀기', next: '써보기 시작!' });
  draw();
}
