/**
 * 구구단 로켓 흐름 테스트 — 가짜 DOM 위에서 **진짜 index.html·app.js·ui.js를 통째로 구동**한다.
 *
 * 이 파일이 존재하는 이유: 문자열 대조(오목의 wiring.test 같은 것)는 "핸들러가 있는가"까지만 본다.
 * 핸들러가 엉뚱한 화면을 열거나, 자릿수가 차기 전에 답이 넘어가거나, 오답 뒤 재입력을 건너뛰거나,
 * 용돈이 두 번 들어가는 종류의 결함은 **눌러 봐야** 드러난다. Chrome 확장이 없는 환경에서
 * L3(브라우저 실측)의 상당 부분을 대신한다. 다만 **눈에 보이는 것**(겹침·글꼴·실제 배치)은
 * 여전히 검사하지 않는다 — 그건 기기에서 봐야 한다.
 *
 * 검사 범위:
 *   1. 홈 — 행성·배지·오늘 날짜·임무 표시
 *   2. 연료 채우기 — 자릿수가 차면 바로 제출(확정 키 없음, 사용자 지시), 숫자 아닌 키 무시, ms는 마지막 숫자 키까지,
 *      fixed는 지우기 또는 첫 키가 정답 첫 자리와 다를 때(양쪽 다 확인),
 *      오답이면 정답 1.2초 노출 뒤 재입력 강제, 화면이 숨겨지면 sessionSkip
 *   3. 레이스 — 항로 목록·잠긴 세트, 오답도 재입력 없이 다음, 로켓 위치, 유령 로켓과 끄기
 *   4. 구두 카드 10장, 임무 셋을 다 하면 용돈 30원(하루 한 번)
 *   5. 거꾸로 암송 — 연습 박자 완주, 측정 실패/통과(36초)
 *   6. 부모 관제실 — 3초 길게 누르기, 격자·탭, 두 번 눌러 지급/초기화, 내보내기·가져오기
 *   7. 구두 인증 72장 — 실패 경로와 통과 경로
 *
 * 무작위는 시드로 고정한다. app.js는 `Math.random()`으로 rng 시드를 뽑고 엔진도 재출제 간격에
 * `Math.random()`을 쓰므로, Math.random 자체를 makeRng로 갈아 끼워 판을 재현 가능하게 만든다.
 *
 * 시계도 가짜다(gugudan-dom.js의 installClock). 진짜로 기다리면 세션 하나에 10초가 넘는다.
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDom, installClock } from './gugudan-dom.js';
import { ok, eq, report } from './_assert.js';
import { BADGE_NAMES } from '../www/gugudan/js/engine.js'; // 배지 수를 손으로 적으면 배지가 늘 때마다 낡는다

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GG = join(ROOT, 'www', 'gugudan');

const dom = installDom(join(GG, 'index.html'));

const engine = await import('../www/gugudan/js/engine.js');
const store = await import('../www/gugudan/js/store.js');
Math.random = engine.makeRng(20260902);
await import('../www/gugudan/js/app.js'); // 로드 시 init()이 돈다

// 시계는 import를 마친 뒤에 건다 — ESM 로더가 진짜 타이머를 쓰는 경우를 피한다.
const clock = installClock();

const GOOD = 300;   // app.js의 정답 밝힘
const SHOW = 1200;  // app.js의 오답 노출
const $ = dom.$;

const digits = (n) => { for (const ch of String(n)) dom.key(ch); };
const histOf = (id) => store.get().facts[id].hist;
const last = (id) => histOf(id).at(-1);

/** 지금 연료 화면에 떠 있는 문제. */
function cur() {
  const [a, b] = $('#fuel-problem').textContent.split('×').map((x) => Number(x.trim()));
  return { a, b, ans: a * b, id: `${a}x${b}` };
}
function raceCur() {
  const [a, b] = $('#race-problem').textContent.split('×').map((x) => Number(x.trim()));
  return { a, b, ans: a * b, id: `${a}x${b}` };
}
/** 정답을 치면 마지막 숫자에서 바로 제출된다. 그 뒤 다음 문제까지 넘어간다. */
function solveFuel() {
  digits(cur().ans);
  clock.advance(GOOD);
}

// ── 1. 홈 ────────────────────────────────────────────────────────────────────
eq('시작 화면은 홈', dom.screen(), 'home');
eq('행성 8개', $('#planets').children.length, 8);
eq('배지를 엔진이 아는 만큼 그린다', $('#badges').children.length, Object.keys(BADGE_NAMES).length);
ok('오늘 날짜를 보여준다', /\d+월 \d+일 · .요일/.test($('#today-pill').textContent), $('#today-pill').textContent);
ok('임무 3가지를 보여준다', ['연료 채우기', '레이스', '구두 카드'].every((s) => $('#mission-steps').textContent.includes(s)),
  $('#mission-steps').textContent);
eq('임무 진행 0 / 3', $('#home-fuel-count').textContent, '0 / 3');
ok('1단계는 진단', $('#stage-name').textContent.includes('진단'), $('#stage-name').textContent);

// ── 2. 연료 채우기 ───────────────────────────────────────────────────────────
dom.click('go-fuel');
eq('연료 화면으로', dom.screen(), 'fuel');
ok('문제가 떴다', /^\d × \d$/.test($('#fuel-problem').textContent), $('#fuel-problem').textContent);
eq('진행 0 / 24', $('#fuel-counter').textContent, '0 / 24');
eq('입력칸은 비어 있다', $('#fuel-answer').textContent, '');

// 확정 키는 없다(사용자 지시 — 탭이 너무 잦았다). 빈 입력에서 지우기를 눌러도 아무 일도 없다.
ok('숫자판에 확정 키가 없다', !dom.$('[data-key="ok"]'));
dom.key('del');
eq('빈 입력에서 지우기를 눌러도 넘어가지 않는다', $('#fuel-counter').textContent, '0 / 24');
eq('입력칸도 그대로 비어 있다', $('#fuel-answer').textContent, '');

const counterNo = () => Number($('#fuel-counter').textContent.split('/')[0]);

// 두 자리 답: 첫 숫자로는 안 넘어가고, 마지막 숫자를 누르는 순간 제출된다. ms는 그 순간까지.
{
  const q = nextTwoDigit();
  ok('두 자리 답 문제를 찾았다', q !== null);
  const s = String(q.ans);
  const before = counterNo();
  clock.idle(150);                       // 문제를 보고 고민한 시간은 들어간다
  dom.key(s[0]);
  eq('자릿수가 차기 전에는 안 넘어간다', counterNo(), before);
  eq('누른 숫자가 입력칸에 보인다', $('#fuel-answer').textContent, s[0]);
  clock.idle(400);                       // 둘째 숫자를 고민한 시간도 들어간다
  dom.key(s[1]);
  eq('마지막 숫자를 누르면 바로 제출되어 입력칸이 밝아진다', $('#fuel-answer').className.includes('good'), true);
  clock.advance(GOOD);
  eq('정답 뒤 답 수가 하나 오른다', counterNo(), before + 1);
  eq('ms는 마지막 숫자 키까지 센다', last(q.id).ms, 550);
  eq('바로 맞히면 fixed=false', last(q.id).fixed, false);
  eq('정답으로 기록됐다', last(q.id).ok, true);
}

// 한 자리 답: 숫자 하나로 바로 제출된다
{
  const q = nextOneDigit();
  ok('한 자리 답 문제를 찾았다', q !== null);
  const before = counterNo();
  dom.key(String(q.ans));
  ok('한 자리 답은 첫 숫자에서 제출된다', $('#fuel-answer').className.includes('good'));
  clock.advance(GOOD);
  eq('답 수가 하나 오른다', counterNo(), before + 1);
  eq('정답으로 기록됐다', last(q.id).ok, true);
}

// 지우기를 쓰면 fixed=true (답이 맞아도) — 두 자리 답의 첫 숫자는 지울 수 있다
{
  const q = nextTwoDigit();
  const s = String(q.ans);
  dom.key(s[0]);
  dom.key('del');
  eq('지우기를 누르면 입력칸이 비워진다', $('#fuel-answer').textContent, '');
  digits(q.ans);
  clock.advance(GOOD);
  eq('지우기를 쓰면 fixed=true', last(q.id).fixed, true);
  eq('그래도 정답은 정답', last(q.id).ok, true);
}

/** 한 자리 답이 나올 때까지 정답으로 넘긴다. */
function nextOneDigit() {
  for (let i = 0; i < 30; i++) {
    const q = cur();
    if (String(q.ans).length === 1) return q;
    solveFuel();
  }
  return null;
}

/** 두 자리 답이 나올 때까지 정답으로 넘긴다(첫 키 규칙은 두 자리에서만 갈린다). */
function nextTwoDigit() {
  for (let i = 0; i < 30; i++) {
    const q = cur();
    if (String(q.ans).length === 2) return q;
    solveFuel();
  }
  return null;
}

// 오답 → 정답 1.2초 노출 → 재입력해야 진행. 첫 키가 다르면 fixed=true.
{
  const q = nextTwoDigit();
  ok('두 자리 답 문제를 찾았다', q !== null);
  const s = String(q.ans);
  const wrongFirst = String((Number(s[0]) % 9) + 1); // 정답 첫 자리와 다른 숫자
  dom.key(wrongFirst);
  dom.key(s[1]);                                      // 지우기는 쓰지 않는다. 둘째 숫자에서 바로 제출된다
  eq('오답이면 정답을 보여준다', $('#fuel-answer').textContent, s);
  ok('오답 표시에 bad 색', $('#fuel-answer').className.includes('bad'));
  ok('재입력을 안내한다', $('#fuel-hint').textContent.includes('정답을'), $('#fuel-hint').textContent);
  // 오답도 '답한 것'이라 답 수는 여기서 오르고, 재출제 때문에 분모도 하나 는다.
  const posAfterWrong = $('#fuel-counter').textContent;
  ok('오답은 다시 출제된다(requeue)', posAfterWrong.endsWith('/ 25'), posAfterWrong);

  clock.advance(SHOW);
  eq('1.2초 뒤 입력칸이 비워진다', $('#fuel-answer').textContent, '');
  eq('아직 같은 문제다', $('#fuel-problem').textContent, `${q.a} × ${q.b}`);

  digits(Number(s) === 11 ? 12 : 11);                 // 재입력도 틀리면
  clock.advance(GOOD);
  eq('재입력이 틀리면 안 넘어간다', $('#fuel-problem').textContent, `${q.a} × ${q.b}`);

  digits(s);
  clock.advance(GOOD);
  ok('정답을 다시 치면 다음 문제로', $('#fuel-problem').textContent !== `${q.a} × ${q.b}`
    || $('#fuel-answer').textContent === '', $('#fuel-problem').textContent);
  eq('재입력은 답 수를 더 세지 않는다', $('#fuel-counter').textContent, posAfterWrong);
  eq('첫 키가 정답 첫 자리와 다르면 fixed=true', last(q.id).fixed, true);
  eq('오답으로 기록됐다', last(q.id).ok, false);
  eq('재입력은 기록을 남기지 않는다', histOf(q.id).filter((h) => h.day === last(q.id).day).length, 1);
}

// 첫 키가 맞으면 뒤가 틀려도 fixed=false — 지우기 규칙과 섞이지 않는지 본다
{
  const q = nextTwoDigit();
  ok('두 자리 답 문제를 또 찾았다', q !== null);
  const s = String(q.ans);
  dom.key(s[0]);
  dom.key(String((Number(s[1]) + 1) % 10));           // 첫 키는 맞고 둘째만 틀림 — 둘째에서 바로 제출
  clock.advance(SHOW);
  digits(s);
  clock.advance(GOOD);
  eq('첫 키가 맞으면 뒤가 틀려도 fixed=false', last(q.id).fixed, false);
}

// 화면이 숨겨졌다 돌아오면 그 문제는 버린다(sessionSkip)
{
  const q2 = nextTwoDigit();                          // 두 자리 답이어야 숫자 하나로 제출되지 않는다
  const before = $('#fuel-problem').textContent;
  const pos = $('#fuel-counter').textContent;
  dom.key(String(q2.ans)[0]);
  dom.visibility(true);
  dom.visibility(false);
  eq('돌아오면 입력칸이 비어 있다', $('#fuel-answer').textContent, '');
  eq('무효화는 답 수를 세지 않는다', $('#fuel-counter').textContent, pos);
  ok('버린 문제는 뒤로 밀린다', $('#fuel-problem').textContent !== before,
    `${before} → ${$('#fuel-problem').textContent}`);
}

// 남은 문제를 전부 정답으로 채워 세션을 끝낸다
{
  let guard = 0;
  while (dom.screen() === 'fuel' && $('#done-overlay').hidden && guard++ < 60) solveFuel();
  ok('세션 끝에 결과 카드가 뜬다', !$('#done-overlay').hidden, `guard=${guard}`);
  ok('결과에 맞은 문제 수가 있다', $('#done-body').textContent.includes('맞은 문제'), $('#done-body').textContent);
  eq('임무의 연료가 켜졌다', engine.mission(store.get(), Date.now()).fuel, true);
  eq('세션 기록이 남았다', store.get().sessions.length, 1);
}

dom.click('go-home');
eq('홈으로 돌아온다', dom.screen(), 'home');
ok('결과 카드는 닫혔다', $('#done-overlay').hidden);
ok('홈 임무에 연료 체크', $('#mission-steps').textContent.includes('✓ 연료 채우기'), $('#mission-steps').textContent);
eq('임무 진행 1 / 3', $('#home-fuel-count').textContent, '1 / 3');
eq('아직 용돈은 없다', store.get().allowance.coins, 0);

// ── 3. 레이스 ────────────────────────────────────────────────────────────────
dom.click('go-race');
eq('항로 고르기 화면', dom.screen(), 'race-pick');
{
  const sets = $('#race-sets').children;
  eq('항로 수가 엔진과 같다', sets.length, engine.raceSets(store.get()).length);
  ok('아직 못 여는 항로는 잠겨 있다', sets.some((s) => s.disabled));
  ok('잠긴 항로에 표시가 있다', sets.filter((s) => s.disabled).every((s) => s.textContent.includes('아직 잠김')));

  dom.clickEl(sets.find((s) => !s.disabled));
}
eq('레이스 화면', dom.screen(), 'race');
ok('레이스 문제가 떴다', /^\d × \d$/.test($('#race-problem').textContent), $('#race-problem').textContent);
dom.tick();
eq('내 로켓은 출발선', $('#rocket-mine').style['--p'], '0');
ok('유령 기록이 없으면 트랙을 감춘다', $('.race-stage').classList.contains('no-ghost'));

// 레이스는 오답이어도 재입력 없이 다음으로 간다
{
  const q = raceCur();
  const posBefore = $('#race-counter').textContent;
  // 자릿수가 같은 오답을 친다 — 자릿수가 차야 제출되므로.
  const wrong = String(q.ans + 1).length === String(q.ans).length ? q.ans + 1 : q.ans - 1;
  digits(wrong);
  ok('레이스 오답도 정답을 보여준다', $('#race-answer').textContent === String(q.ans), $('#race-answer').textContent);
  clock.advance(SHOW);
  ok('레이스는 재입력 없이 다음 문제로', $('#race-counter').textContent !== posBefore, $('#race-counter').textContent);
  eq('오답이 기록됐다', last(q.id).ok, false);
}

{
  let guard = 0;
  while (dom.screen() === 'race' && guard++ < 100) {
    digits(raceCur().ans);
    clock.advance(GOOD);
  }
  eq('레이스 결과 화면', dom.screen(), 'race-result');
  ok('정확도를 보여준다', $('#race-result-acc').textContent.includes('정확도'), $('#race-result-acc').textContent);
  ok('오늘 시간을 보여준다', /초/.test($('#race-time-today').textContent), $('#race-time-today').textContent);
  eq('첫 판은 비교할 유령이 없다', $('#race-time-ghost').textContent, '기록 없음');
  ok('한 문제 틀렸으니 완벽 항로는 아니다', !$('#race-result-title').textContent.includes('완벽'),
    $('#race-result-title').textContent);
  eq('임무의 레이스가 켜졌다', engine.mission(store.get(), Date.now()).race, true);
}

dom.click('go-home');

// ── 4. 구두 카드 ─────────────────────────────────────────────────────────────
dom.click('go-oral');
eq('구두 카드 화면', dom.screen(), 'oral');
eq('구두 진행 0 / 10', $('#oral-counter').textContent, '0 / 10');
ok('답은 처음에 숨어 있다', $('#oral-shown').hidden);
dom.click('oral-reveal');
ok('답 보기를 누르면 답이 뜬다', !$('#oral-shown').hidden && /^\d+$/.test($('#oral-answer').textContent),
  $('#oral-answer').textContent);
ok('답 보기 버튼은 숨는다', $('#oral-reveal').hidden);
{
  const q = $('#oral-problem').textContent.split('×').map((x) => Number(x.trim()));
  eq('보여준 답이 맞다', Number($('#oral-answer').textContent), q[0] * q[1]);
}
dom.click('oral-right');
eq('한 장 넘어간다', $('#oral-counter').textContent, '1 / 10');
ok('다음 장은 답이 다시 숨는다', $('#oral-shown').hidden);
for (let i = 1; i < 10; i++) { dom.click('oral-reveal'); dom.click(i % 3 === 0 ? 'oral-wrong' : 'oral-right'); }
ok('10장 뒤 결과 카드', !$('#done-overlay').hidden);
eq('임무의 구두가 켜졌다', engine.mission(store.get(), Date.now()).oral, true);
eq('구두 기록이 남았다', store.get().oralLog.length, 1);

dom.click('go-home');
eq('임무 셋을 다 하면 용돈 30원', store.get().allowance.coins, 30);
eq('임무 진행 3 / 3', $('#home-fuel-count').textContent, '3 / 3');
ok('홈 보상 문구가 지급으로 바뀐다', $('#reward-text').textContent.includes('30원 받았어요'), $('#reward-text').textContent);
// 하루 한 번 — 홈을 다시 그려도 더 들어오지 않아야 한다
dom.click('go-fuel');
dom.click('go-home');
eq('용돈은 하루 한 번만', store.get().allowance.coins, 30);

// ── 5. 거꾸로 암송 ───────────────────────────────────────────────────────────
dom.click('go-chant');
eq('암송 화면', dom.screen(), 'chant');
eq('박자 5개', $('#chant-paces').children.length, 5);
dom.clickEl($('#chant-paces').children.find((b) => b.dataset.pace === '36'));
eq('고른 박자가 저장된다', store.get().settings.chantPace, 36);

dom.click('chant-practice');
eq('연습 모드로 바뀐다', $('#chant-run').dataset.mode, 'practice');
ok('고르기 화면은 숨는다', $('#chant-setup').hidden);
dom.tick();
eq('첫 식은 9 × 9', $('#chant-problem').textContent, '9 × 9');
eq('박자 앞부분에는 답을 감춘다', $('#chant-answer').textContent, '');
clock.idle(400); dom.tick();                 // 36초 박자 → 한 칸 500ms, 55% 지점에서 답 공개
eq('박자 뒤에 답이 보인다', $('#chant-answer').textContent, '81');
clock.idle(200); dom.tick();
eq('다음 식으로 넘어간다', $('#chant-problem').textContent, '9 × 8');
dom.click('chant-toggle');
eq('일시정지 문구', $('#chant-toggle').textContent, '이어서 하기');
clock.idle(5000); dom.tick();
eq('멈춘 동안에는 안 넘어간다', $('#chant-problem').textContent, '9 × 8');
dom.click('chant-toggle');
eq('재개 문구', $('#chant-toggle').textContent, '잠깐 멈춤');
clock.idle(36000); dom.tick();               // 끝까지
ok('연습을 마치면 결과 카드', !$('#done-overlay').hidden);
ok('고르기 화면으로 돌아온다', !$('#chant-setup').hidden);
eq('연습은 측정 기록을 남기지 않는다', store.get().chantLog.length, 0);

// 측정 — 틀림·놓침이 있으면 통과가 아니다
dom.click('go-home');
dom.click('go-chant');
dom.click('chant-measure');
eq('측정 모드로 바뀐다', $('#chant-run').dataset.mode, 'measure');
dom.click('chant-error'); dom.click('chant-error'); dom.click('chant-miss');
eq('틀림 2', $('#chant-errors').textContent, '2');
eq('놓침 1', $('#chant-misses').textContent, '1');
clock.idle(30000);
dom.click('chant-stop');
ok('측정 결과 카드', !$('#done-overlay').hidden);
eq('측정 기록이 남았다', store.get().chantLog.length, 1);
eq('틀림이 있으면 최고 기록이 안 된다', store.get().chantBest, null);
eq('통과한 날은 없다', store.get().chant36Days.length, 0);

// 측정 — 36초 안에 무실수면 통과
dom.click('go-home');
dom.click('go-chant');
dom.click('chant-measure');
clock.idle(30000);
dom.click('chant-stop');
ok('36초 통과 문구', $('#done-title').textContent.includes('통과'), $('#done-title').textContent);
eq('최고 기록이 남는다', store.get().chantBest, 30000);
eq('거꾸로 36초 배지가 켜진다', engine.badges(store.get()).find((b) => b.key === 'chant36').earned, true);
dom.click('go-home');

// ── 6. 부모 관제실 ───────────────────────────────────────────────────────────
// 짧게 누르면 아무 일도 없다
dom.fire($('#parent-lock'), 'pointerdown');
dom.fire($('#parent-lock'), 'pointerup');
clock.advance(3100);
eq('짧게 누르면 부모 화면이 안 열린다', dom.screen(), 'home');
// 3초 길게 누르면 열린다
dom.fire($('#parent-lock'), 'pointerdown');
clock.advance(2900);
eq('3초가 되기 전에는 안 열린다', dom.screen(), 'home');
clock.advance(200);
eq('3초 길게 누르면 부모 화면', dom.screen(), 'parent');

eq('격자가 8행', $('#matrix-body').children.length, 8);
eq('한 행은 머리 + 9칸', $('#matrix-body').children[0].children.length, 10);
{
  const tabAcc = $('#parent-tabs').children.find((t) => t.dataset.view === 'acc');
  dom.clickEl(tabAcc);
  ok('정확도 탭이 활성', tabAcc.classList.contains('active'));
  ok('탭에 따라 안내문이 바뀐다', $('#matrix-note').textContent.includes('맞은 횟수'), $('#matrix-note').textContent);
  const tabLast = $('#parent-tabs').children.find((t) => t.dataset.view === 'last');
  dom.clickEl(tabLast);
  ok('마지막 출제 탭', $('#matrix-note').textContent.includes('며칠'), $('#matrix-note').textContent);
  ok('오늘 푼 사실은 "오늘"로 나온다', $('#matrix-body').textContent.includes('오늘'));
}
ok('저금통을 보여준다', $('#coins-sub').textContent.startsWith('30원'), $('#coins-sub').textContent);

// 용돈 지급 — 두 번 눌러야 0원
dom.click('payout');
ok('한 번 누르면 확인을 묻는다', $('#btn-payout').textContent.includes('한 번 더'), $('#btn-payout').textContent);
eq('한 번만으로는 저금통이 그대로', store.get().allowance.coins, 30);
dom.click('payout');
eq('두 번 누르면 0원', store.get().allowance.coins, 0);
eq('버튼 문구가 돌아온다', $('#btn-payout').textContent, '용돈 지급 완료');
eq('지금까지 모은 총액은 남는다', store.get().allowance.total, 30);

// 유령 · 연습 모드 토글
dom.click('toggle-ghost');
eq('유령을 끈다', store.get().settings.ghost, false);
eq('유령 꺼짐 표시', $('#ghost-state').textContent, '꺼짐');
dom.click('toggle-ghost');
eq('유령을 켠다', store.get().settings.ghost, true);
dom.click('toggle-practice');
eq('연습 모드 켜짐 표시', $('#practice-state').textContent, '켜짐');
dom.click('toggle-practice');
eq('연습 모드 꺼짐 표시', $('#practice-state').textContent, '꺼짐');

// 내보내기 · 가져오기
dom.click('export');
const exported = $('#io-text').value;
ok('내보내기가 기록 문자열을 채운다', exported.length > 100 && exported.includes('"v":1'), exported.slice(0, 40));
$('#io-text').value = '{"이건":"기록이 아니다"}';
dom.click('import');
ok('이상한 문자열은 거절한다', $('#io-note').textContent.includes('아니거나'), $('#io-note').textContent);
$('#io-text').value = exported;
dom.click('import');
eq('제대로 된 문자열은 가져온다', $('#io-note').textContent, '가져왔습니다.');

// 마지막 문제 무효화
{
  const l = store.get().last;
  ok('마지막으로 기록한 답이 있다', l !== null);
  const before = store.get().facts[l.id].hist.length;
  dom.click('invalidate-last');
  eq('마지막 답 하나가 지워진다', store.get().facts[l.id].hist.length, before - 1);
}

// 엔진 초기화 — 두 번 확인
{
  const seenBefore = engine.FACT_IDS.filter((id) => store.get().facts[id].seen > 0).length;
  ok('초기화 전에는 푼 기록이 있다', seenBefore > 0, String(seenBefore));
  dom.click('reset-engine');
  ok('초기화도 두 번 눌러야 한다', $('#reset-label').textContent.includes('한 번 더'), $('#reset-label').textContent);
  eq('한 번만으로는 안 지워진다', engine.FACT_IDS.filter((id) => store.get().facts[id].seen > 0).length, seenBefore);
  dom.click('reset-engine');
  ok('두 번 누르면 학습 기록이 지워진다', engine.FACT_IDS.every((id) => store.get().facts[id].seen === 0));
  eq('용돈 총액은 남는다', store.get().allowance.total, 30);
  eq('암송 최고 기록도 남는다', store.get().chantBest, 30000);
}

// ── 7. 구두 인증 ─────────────────────────────────────────────────────────────
dom.click('cert-start');
eq('인증 화면', dom.screen(), 'cert');
eq('인증 0 / 72', $('#cert-counter').textContent, '0 / 72');
ok('인증 화면의 뒤로는 관제실로 간다', $('.screen-cert [data-action="go-parent"]') !== null);
dom.click('cert-wrong');
dom.click('cert-miss');
dom.click('cert-fix');
eq('틀림·못 함·수정을 따로 센다', $('#cert-tally').textContent, '틀림 1 · 못 함 1 · 수정 1');
for (let i = 3; i < 72; i++) dom.click('cert-right');
ok('72장 뒤 결과 카드', !$('#done-overlay').hidden);
eq('틀림·못 함이 있으면 통과가 아니다', store.get().certDays.length, 0);
eq('인증 기록은 남는다', store.get().certLog.length, 1);
{
  const c = store.get().certLog.at(-1);
  eq('틀림이 기록된다', c.errors, 1);
  eq('못 함이 따로 기록된다', c.misses, 1);
  eq('수정이 기록된다', c.corrections, 1);
}

/** 부모 화면으로 다시 들어간다(3초 길게 누르기). */
function reopenParent() {
  dom.click('go-home');
  dom.fire($('#parent-lock'), 'pointerdown');
  clock.advance(3000);
}

// '못 함'만 하나 있어도 통과가 아니다 — 틀림과 따로 세지만 막는 힘은 같다
reopenParent();
dom.click('cert-start');
dom.click('cert-miss');
for (let i = 1; i < 72; i++) dom.click('cert-right');
eq("'못 함'이 하나라도 있으면 통과가 아니다", store.get().certDays.length, 0);

// 통과 경로 — 전부 맞으면 통과, 자기 수정은 2개까지 봐준다
reopenParent();
eq('다시 부모 화면', dom.screen(), 'parent');
dom.click('cert-start');
dom.click('cert-fix');
dom.click('cert-fix');
for (let i = 2; i < 72; i++) dom.click('cert-right');
eq('수정 2개까지는 통과', store.get().certDays.length, 1);
ok('통과 문구가 나온다', $('#done-title').textContent.includes('통과'), $('#done-title').textContent);
eq('인증 배지가 아직 미완(서로 다른 날 두 번)', engine.badges(store.get()).find((b) => b.key === 'cert').earned, false);

// ── 8. 유령 로켓 ─────────────────────────────────────────────────────────────
// 같은 항로 기록이 2회 쌓이면 유령이 나타난다(engine.ghostMs는 2회부터).
{
  const s = store.get();
  const day = engine.dayKey(Date.now());
  s.races['dan-2'] = [
    { day, ms: 20000, correct: 9, total: 9 },
    { day, ms: 24000, correct: 9, total: 9 },
  ];
  store.save(s);

  dom.click('go-home');
  dom.click('go-race');
  const set2 = $('#race-sets').children.find((b) => b.dataset.set === 'dan-2');
  ok('기록이 있으면 유령 시간을 보여준다', set2.textContent.includes('유령'), set2.textContent);
  dom.clickEl(set2);
  dom.tick();
  ok('유령이 있으면 트랙을 보여준다', !$('.race-stage').classList.contains('no-ghost'));
  ok('유령 이름표에 시간이 있다', $('#ghost-label').textContent.includes('초'), $('#ghost-label').textContent);

  digits(raceCur().ans);
  clock.advance(GOOD);
  dom.tick();
  eq('9문제 중 1개 맞히면 로켓은 1/9 지점', Number($('#rocket-mine').style['--p']), 1 / 9);
  const gp = Number($('#rocket-ghost').style['--p']);
  ok('유령은 흐른 시간만큼 나아간다', gp > 0 && gp < 1, String(gp));

  const s2 = store.get();
  s2.settings.ghost = false;
  store.save(s2);
  dom.tick();
  ok('유령을 끄면 트랙이 사라진다', $('.race-stage').classList.contains('no-ghost'));
}

report('gugudan-flow.test');
