/**
 * 흐름 테스트 — 가짜 DOM 위에서 **실제 game.js·lesson-flow.js·ui.js를 통째로 구동**한다.
 *
 * 이 파일이 존재하는 이유: wiring.test는 "핸들러가 있는가"까지만 본다. 핸들러가 엉뚱한 화면을
 * 열거나, 퍼즐 정답을 두었는데 말풍선이 오답을 말하거나, 코치가 AI가 둔 **뒤에** 끼어드는 종류의
 * 결함은 실행해야만 드러난다. Chrome 확장이 없는 환경에서 L3(브라우저 실측)의 일부를 대신한다.
 *
 * 무작위는 시드로 고정한다(AI 쉬움의 수, 퍼즐 생성, 색종이). 시드를 바꾸면 AI 쉬움의 초반 수가
 * 달라져 코치 장면의 전제(내 가로줄에 AI가 끼어들지 않음)가 깨질 수 있다 — 그때는 아래 코치 절의
 * 주석대로 줄을 옮기거나 시드를 고른다. AI 코드가 바뀌어 전제가 깨지면 그것도 같은 방법으로 푼다.
 */
import { installDom } from './_dom-stub.js';
import { ok, eq, report } from './_assert.js';

const dom = installDom({ boardPx: 600 });
const { makeRng } = await import('../www/omok/js/ai.js');
Math.random = makeRng(4242);

const { idx, rowOf, colOf, BLACK, EMPTY } = await import('../www/omok/js/board.js');
const { SKILL, findSkillSpots } = await import('../www/omok/js/tactics.js');
const store = await import('../www/omok/js/storage.js');
const { PUZZLES_PER_LESSON, PUZZLE_STAR_MIN } = await import('../www/omok/js/lessons.js');
const app = dom.byId('app');
app.dataset.screen = 'menu'; // index.html의 초기 속성. 가짜 DOM은 HTML을 읽지 않으므로 여기서 흉내 낸다.
const game = await import('../www/omok/js/game.js'); // 로드 시 init()이 돈다
const flow = await import('../www/omok/js/lesson-flow.js');
const bubble = dom.byId('lesson-bubble');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rc = (i) => `(${rowOf(i)},${colOf(i)})`;

/** 렌더러와 같은 셈: 부모 600px → 판 600px, 여백 4.5%, 14칸. */
function xy(css, r, c) {
  const margin = css * 0.045;
  const cell = (css - margin * 2) / 14;
  return [margin + c * cell, margin + r * cell];
}

// ── 1. 메뉴 → 교실 목록 ────────────────────────────────────────────────────
eq('시작 화면은 메뉴', app.dataset.screen, 'menu');
dom.click('lessons');
eq('배우기 → 교실 목록', app.dataset.screen, 'lessons');
eq('레슨 카드가 열 장', dom.byId('lesson-list').children.length, 10);
eq('배지가 세 개', dom.byId('badge-list').children.length, 3);
ok('첫 레슨이 "다음에 할 것"으로 표시된다', dom.byId('lesson-list').children[0].classList.contains('next'));

// ── 2. 레슨 1 보기 ──────────────────────────────────────────────────────────
dom.clickLesson('five');
eq('레슨 화면', app.dataset.screen, 'lesson');
const { S, renderer } = flow._peek();
eq('보기 단계', S.part, 'demo');
eq('레슨 이름', dom.byId('lesson-name').textContent, '다섯 만들기');
ok('소개 말풍선이 있다', bubble.textContent.length > 5, bubble.textContent);
const stepCount = S.lesson.demo.steps.length;
for (let i = 0; i < stepCount; i++) dom.click('lesson-next');
eq('시범 마지막 단계에 닿는다', S.demoIndex, stepCount - 1);
eq('마지막 단계의 다음 버튼은 "찾기 시작!"', dom.byId('btn-lesson-next').textContent, '찾기 시작!');
ok('시범에서 돌 번호가 찍힌다', Object.keys(S.numbers).length >= 1);
ok('시범에서 다섯 줄이 반짝인다', Array.isArray(S.winLine) && S.winLine.length >= 5);
dom.click('lesson-prev');
eq('"이전"으로 되돌아간다', S.demoIndex, stepCount - 2);
dom.click('lesson-next');
dom.click('lesson-next');
eq('찾기 단계로 넘어간다', S.part, 'puzzle');
eq('보기 별을 받았다', store.get().lessons.five.demo, true);

// ── 3. 레슨 1 찾기 — 오답 한 번, 나머지 정답 ────────────────────────────────────
const lessonCanvas = dom.byId('lesson-board');
const css = renderer.css;
ok('교실 캔버스가 판 크기를 잡았다', css > 100, `${css}px`);
const tapCell = (i) => { const [x, y] = xy(css, rowOf(i), colOf(i)); dom.tap(lessonCanvas, x, y); };

{
  const wrong = [...Array(225).keys()].find((p) => S.board.cells[p] === EMPTY && !S.puzzle.answers.includes(p));
  tapCell(wrong);
  eq('첫 탭은 미리보기', S.preview, wrong);
  eq('미리보기 뒤 "여기 놓기"가 켜진다', dom.byId('btn-lesson-place').disabled, false);
  dom.click('lesson-place');
  ok('오답 말풍선', bubble.className.includes('bad'), `${bubble.className}: ${bubble.textContent}`);
  eq('오답 횟수', S.puzzle.wrong, 1);
  ok('오답 자리에 X 표식', S.marks.some((m) => m.i === wrong && m.kind === 'bad'));
}
for (let n = 0; n < PUZZLES_PER_LESSON; n++) {
  eq(`퍼즐 ${n + 1} 진행 중`, S.puzzleNo, n);
  let guard = 0;
  while (S.awaiting && guard++ < 10) {
    const p = S.puzzle.answers[0];
    tapCell(p);
    tapCell(p); // 같은 자리 재탭 = 확정
  }
  ok(`퍼즐 ${n + 1} 정답 말풍선`, bubble.className.includes('good'), `${bubble.className}: ${bubble.textContent}`);
  const last = n === PUZZLES_PER_LESSON - 1;
  eq(`퍼즐 ${n + 1} 다음 버튼`, dom.byId('btn-lesson-next').textContent, last ? '결과 보기' : '다음 문제');
  dom.click('lesson-next');
}
eq('결과 화면', S.part, 'summary');
eq('첫 시도 정답 수는 오답 낸 한 문제를 뺀 값', S.firstTry, PUZZLES_PER_LESSON - 1);
ok('찾기 별 기준을 넘는다', S.firstTry >= PUZZLE_STAR_MIN);
eq('찾기 별을 받았다', store.get().lessons.five.puzzle, true);
ok('결과 말풍선에 별 획득', bubble.textContent.includes('별 획득'), bubble.textContent);

// ── 4. 써보기 → 게임 화면, 교실로 복귀 ─────────────────────────────────────────
dom.click('lesson-next');
eq('써보기는 게임 화면', app.dataset.screen, 'game');
eq('아이가 검은 돌로 먼저', dom.byId('turn-text').textContent, '내 차례');
dom.click('back-lessons');
eq('교실로 돌아온다', app.dataset.screen, 'lessons');
{
  const stars = dom.byId('lesson-list').children[0].querySelectorAll('.stars span');
  eq('레슨 1 카드에 별 둘', stars.filter((s) => !s.classList.contains('off')).length, 2);
}

// ── 5. 쌍삼 퍼즐은 기술을 둔 뒤 끝까지 이어진다 ──────────────────────────────────
dom.clickLesson('double-three');
for (let i = 0; i <= S.lesson.demo.steps.length; i++) dom.click('lesson-next');
eq('쌍삼 레슨 찾기 단계', S.part, 'puzzle');
{
  const p = S.puzzle.answers[0];
  tapCell(p);
  tapCell(p);
  ok('쌍삼을 두면 판이 이어진다', S.awaiting === true, bubble.textContent);
  ok('상대가 막은 뒤 말풍선', bubble.textContent.includes('상대가 막았어요'), bubble.textContent);
  ok('마무리 정답이 있다', S.puzzle.answers.length >= 1);
  let guard = 0;
  while (S.awaiting && guard++ < 10) { const q = S.puzzle.answers[0]; tapCell(q); tapCell(q); }
  ok('다섯으로 끝난다', bubble.textContent.includes('이겼어요'), bubble.textContent);
  ok('이긴 줄이 반짝인다', Array.isArray(S.winLine));
}
dom.click('back-lessons');
dom.click('back-menu');
eq('메뉴로', app.dataset.screen, 'menu');

// ── 6. 실전 코치 — AI가 두기 전에 끼어들고, 무르기가 내 돌만 거둔다 ───────────────
// 쉬움 AI는 다섯만 막는다. 가로로 셋을 늘어놓아도 안 막으므로 뚫린 사를 만들 수 있고,
// 그때 AI가 한쪽을 막으면 내게 다섯 자리가 남는다. 거기서 엉뚱한 곳에 두면 코치 규칙 1이 발화한다.
dom.click('solo');
eq('혼자 하기 설정 화면', app.dataset.screen, 'solo');
dom.chip('#level-choice', 'level', 'easy');
dom.chip('#coach-choice', 'coach', 'on');
dom.change('opt-instant', true); // 한 번 눌러 바로 놓기
eq('난이도 저장', store.get().level, 'easy');
eq('코치 저장', store.get().coach, true);
dom.click('start-solo');
eq('게임 화면', app.dataset.screen, 'game');

const gameCanvas = dom.byId('board');
const gcss = parseFloat(gameCanvas.style.width);
ok('게임 캔버스 크기', gcss > 100, `${gcss}`);
const tapGame = (r, c) => { const [x, y] = xy(gcss, r, c); dom.tap(gameCanvas, x, y); };
const myTurn = () => dom.byId('turn-text').textContent === '내 차례';
const G = game._peek();
const cell = (r, c) => G.board.cells[idx(r, c)];

/**
 * 네 돌을 한 줄로 놓아 뚫린 사를 만든다. 쉬움 AI는 다섯만 막으므로 셋까지는 안 막고,
 * 넷째에서 한쪽 끝을 막는다 — 그러면 내게 다섯 자리가 하나 남는다.
 * AI의 무작위 수가 우연히 그 줄에 끼어들 수 있으므로(시드 고정이지만 국면마다 다르다)
 * 판을 직접 보며 실패하면 다른 줄로 다시 시도한다.
 */
const LINES = [
  [[7, 7], [7, 8], [7, 9], [7, 10]],
  [[7, 7], [8, 7], [9, 7], [10, 7]],
  [[3, 3], [3, 4], [3, 5], [3, 6]],
  [[3, 11], [4, 11], [5, 11], [6, 11]],
  [[3, 3], [4, 4], [5, 5], [6, 6]],
];
const lineEnds = (line) => {
  const [r0, c0] = line[0];
  const [r1, c1] = line[1];
  const [r3, c3] = line[3];
  return [[r0 - (r1 - r0), c0 - (c1 - c0)], [r3 + (r1 - r0), c3 + (c1 - c0)]];
};
let fiveSpot = -1;
let usedLine = null;
for (const line of LINES) {
  if (usedLine) break;
  dom.click('restart');
  let intact = true;
  for (let k = 0; k < 4 && intact; k++) {
    const [r, c] = line[k];
    if (!myTurn() || cell(r, c) !== EMPTY) { intact = false; break; }
    tapGame(r, c);
    await sleep(700); // 쉬움 AI 응답(최소 지연 400ms)
    if (k < 3) {
      // 셋째 돌까지는 줄과 양 끝이 비어 있어야 다음이 뚫린 사가 된다.
      intact = line.slice(k + 1).every(([rr, cc]) => cell(rr, cc) === EMPTY)
        && lineEnds(line).every(([rr, cc]) => cell(rr, cc) === EMPTY);
    }
  }
  if (!intact) continue;
  const fives = findSkillSpots(G.board.cells, BLACK, SKILL.FIVE);
  if (fives.length >= 1 && myTurn()) { fiveSpot = fives[0]; usedLine = line; }
}
ok('네 돌을 한 줄로 놓아 다섯 자리를 얻었다', fiveSpot >= 0, usedLine ? `줄 ${JSON.stringify(usedLine)}` : '다섯 줄 모두 AI가 끼어들었다 — 시드를 바꿔 볼 것');
eq('코치는 아직 조용하다', dom.byId('coach-sheet').hidden, true);

const far = [...Array(225).keys()].find((p) => cell(rowOf(p), colOf(p)) === EMPTY && p !== fiveSpot
  && Math.abs(rowOf(p) - rowOf(fiveSpot)) > 5);
const movesBefore = G.board.moveCount;
tapGame(rowOf(far), colOf(far)); // 다섯을 두지 않고 엉뚱한 곳에
eq('돌은 놓였다', G.board.moveCount, movesBefore + 1);
eq('코치가 즉시 끼어든다', dom.byId('coach-sheet').hidden, false);
ok('다섯을 지적한다', dom.byId('coach-text').textContent.includes('다섯'), dom.byId('coach-text').textContent);
ok('뒀어야 할 자리가 표식으로 있다', G.board.cells[fiveSpot] === EMPTY && game._peek().coachPending?.spots.includes(fiveSpot));
await sleep(700);
eq('코치가 뜬 동안 AI는 두지 않는다 — 수가 그대로', G.board.moveCount, movesBefore + 1);
dom.click('coach-undo');
eq('무르기 뒤 시트가 닫힌다', dom.byId('coach-sheet').hidden, true);
eq('무르기는 내 돌 하나만 거둔다', G.board.moveCount, movesBefore);
ok('무르기 뒤 내 차례', myTurn());
tapGame(rowOf(fiveSpot), colOf(fiveSpot));
await sleep(1100); // 승리 표시 뒤 결과 카드(900ms)
eq('결과 카드가 뜬다', dom.byId('result-overlay').hidden, false);
eq('이겼다', dom.byId('result-text').textContent, '이겼다!');
eq('일반 대국이라 "교실로" 버튼은 숨김', dom.byId('btn-result-lessons').hidden, true);
eq('전적에 1승', store.get().win, 1);
dom.click('back-menu');
eq('메뉴로 돌아간다', app.dataset.screen, 'menu');

report('flow.test');
