/**
 * 곱셈 바다 — 문제 생성과 세로셈 입력 순서 테스트.
 *
 * 이 검사의 핵심은 **묻는 순서**다. 순서가 뒤집혀도 화면은 멀쩡해 보이고 아이는
 * "왠지 어색한데" 정도로만 느껴서 눈으로는 못 잡는다. 반면 순수 계산이라 정확히 잴 수 있다.
 *
 * math 게임과 같은 방식으로 <script> 본문을 꺼내 돌린다 — document가 없는 Node에서는
 * DOM 블록이 통째로 건너뛰어지도록 원본이 `typeof document!=='undefined'`로 감싸여 있다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ok, eq, report } from './_assert.js';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'www', 'mul', 'index.html'), 'utf8');
const source = html.slice(html.indexOf('<script>') + '<script>'.length, html.indexOf('</script>'));
const mod = { exports: {} };
new Function('module', source)(mod);
const { P, DP, genByType, genDiv, pickType, makeProblem, gridSteps, divSteps, stepsFor,
        foeMaxHP, MIX, ZONES, ANIMALS, STAGES, BOSS_TOTAL, withJosa, numJosa, PET_FORMS,
        isDiv, isWhole, isSplit, isQuotOnly, isProdOnly, isLateRem, isCarryShown, isDivStage,
        TIME, timeFor, remCols, TYPES, HINTS } = mod.exports;

ok('스크립트에서 로직을 꺼냈다', typeof P === 'function' && typeof DP === 'function' && typeof stepsFor === 'function');

/* ================= 곱셈 ================= */

let mathOk = true;
let mathBad = null;
for (let a = 11; a <= 99; a++) {
  if (a % 10 === 0) continue;
  for (let b = 2; b <= 9; b++) {
    const p = P('M1', a, b);
    // 세로셈이 성립하려면 십의자리곱을 열 배 한 값에 일의 자리를 더한 것이 답이어야 한다
    if (p.ans !== a * b || p.p2 * 10 + p.ones !== a * b) { mathOk = false; if (!mathBad) mathBad = `${a} × ${b}`; }
  }
}
ok('모든 두 자리 × 한 자리에서 올림·일의자리·십의자리곱이 답과 맞아떨어진다', mathOk, mathBad ?? '');

// 칸 번호는 위→아래, 좌→우다. 올림칸이 1, 답 줄이 왼쪽부터 2·3·4.
const SLOT_NO = { carry: 1, huns: 2, tens: 3, ones: 4 };
let orderOk = true;
let orderBad = null;
let sawCarry = false;
let sawNoCarry = false;
for (let a = 11; a <= 99; a++) {
  if (a % 10 === 0) continue;
  for (let b = 2; b <= 9; b++) {
    const p = P('M1', a, b);
    const seq = gridSteps(p).map((s) => SLOT_NO[s.key]).join('');
    const three = String(p.ans).length === 3;
    let want;
    if (p.carry > 0) { sawCarry = true; want = three ? '1423' : '143'; }
    else { sawNoCarry = true; want = three ? '423' : '43'; }
    if (seq !== want) { orderOk = false; if (!orderBad) orderBad = `${a} × ${b}: ${seq} (기대 ${want})`; }
  }
}
ok('곱셈 빈칸 순서가 올림 → 일의 자리 → 백의 자리 → 십의 자리다', orderOk, orderBad ?? '');
ok('올림이 있는 문제도 없는 문제도 검사에 포함됐다', sawCarry && sawNoCarry);

let valuesOk = true;
for (let a = 11; a <= 99; a++) {
  if (a % 10 === 0) continue;
  for (let b = 2; b <= 9; b++) {
    const p = P('M1', a, b);
    const byKey = {};
    gridSteps(p).forEach((s) => { byKey[s.key] = s.val; });
    const rs = String(p.ans);
    if (byKey.ones !== Number(rs[rs.length - 1])) valuesOk = false;
    if (byKey.tens !== Number(rs[rs.length - 2])) valuesOk = false;
    if (rs.length === 3 && byKey.huns !== Number(rs[0])) valuesOk = false;
    if (p.carry > 0 && byKey.carry !== p.carry) valuesOk = false;
    if (p.carry === 0 && 'carry' in byKey) valuesOk = false;
  }
}
ok('각 빈칸의 정답이 답의 해당 자리 숫자와 같다', valuesOk);

// 보스전 곱셈과 올림을 보여주는 판은 세로셈으로 보여주되 답을 한 번에 받는다 — 빈칸을 자리별로 나누지 않는다
let wholeOk = true;
for (let i = 0; i < 800; i++) {
  const p = genByType(['M2', 'M2c', 'M4', 'M4c'][i % 4]);
  const st = gridSteps(p);
  if (st.length !== 1 || st[0].key !== 'whole') wholeOk = false;
  if (st[0].val !== p.ans || st[0].digits !== String(p.ans).length) wholeOk = false;
}
ok('보스전 곱셈과 올림 보여주는 판은 답 칸 하나뿐이고 올림 입력 칸이 없다', wholeOk);

/*
 * 올림을 보여주고 답을 한 번에 (13·14스테이지). 사용자가 정한 계단이다 — 66 × 6 이면
 * 올림 3을 화면이 적어 두고 아이는 396을 한 번에 쓴다. 보스는 그 올림마저 걷어낸다.
 * 무엇이 적혀 있는지 말로도 짚어 준다 — 1·2판 분해는 왼쪽부터 푸는 방법이라, 위에 뜬
 * 올림이 분해로 푸는 아이에게는 낯선 수이기 때문이다.
 */
eq('올림 보여주는 판은 올림을 말로 짚어 준다', gridSteps(P('M4c', 66, 6))[0].say, '올림 3은 적어 뒀어. 답을 한 번에!');
eq('올림이 없는 복습 문제는 없다고 말해 준다', gridSteps(P('M4', 42, 3))[0].say, '올림이 없네. 답을 한 번에!');
ok('보스는 아무 말도 붙이지 않는다 (힌트 없이 암산)', gridSteps(P('M2c', 66, 6))[0].say === undefined);
ok('올림 보여주는 판의 제한 시간은 보스와 같다 (힌트가 있으니 더 길 이유가 없다)', timeFor('M4c') === TIME.M && timeFor('M4') === TIME.M);

let m1Clean = true;
let m1cAlways = true;
let zeroOnes = false;
for (let i = 0; i < 4000; i++) {
  const p1 = genByType(['M1', 'M2', 'M3', 'M4'][i % 4]);
  const p2 = genByType(['M1c', 'M2c', 'M3c', 'M4c'][i % 4]);
  if (p1.carry !== 0) m1Clean = false;
  if (p2.carry === 0) m1cAlways = false;
  if (p1.u === 0 || p2.u === 0) zeroOnes = true;
}
ok('올림 없음 유형(M1·M2·M3·M4)은 한 번도 올림이 생기지 않는다', m1Clean);
ok('올림 유형(M1c·M2c·M3c·M4c)은 반드시 올림이 생긴다', m1cAlways);
ok('일의 자리가 0인 곱셈은 나오지 않는다 (첫 칸이 "0 × 4"면 배울 것이 없다)', !zeroOnes);

/* ----- 십의 자리부터 분해해서 더하기 (3·4 · 11·12스테이지) ----- */

/*
 * 세로셈과 암산 사이를 잇는 다리다. 세로셈은 오른쪽부터지만 암산은 왼쪽부터가 쉽고,
 * 보스가 바로 그 암산이다. 세로셈만 연습시키면 보스에서 배운 적 없는 방법을 요구하게 된다.
 */
const sp = P('M3', 42, 3);
eq('42 × 3 의 분해', `${sp.tensProd} + ${sp.p1} = ${sp.ans}`, '120 + 6 = 126');

/*
 * 십의 자리 곱은 **끝의 0을 빼고** 받는다. 120이 아니라 12다(사용자 지시).
 * 0에는 구할 것이 없는데 제한 시간 안에 한 번 더 눌러야 했다.
 * 화면으로는 티가 안 나는 종류의 규칙이라 여기서 고정한다.
 */
eq('십의 자리 곱은 끝의 0을 빼고 적는다', sp.tensWrite, 12);
eq('분해는 십의 자리 곱부터 묻는다',
  gridSteps(sp).map((s) => `${s.key}=${s.val}`).join(' '), 'tp=12 op=6 sum=126');
eq('각 단계에 무엇을 구하는지 말로 붙어 있다',
  gridSteps(sp).map((s) => s.say).join(' | '),
  '십의 자리 4 × 3은? | 일의 자리 2 × 3은? | 둘을 더하면?');

/*
 * 0을 안 적는 대신 **한 칸 왼쪽에서 끝내** 자리가 0을 대신한다. 이 열 번호가 틀리면
 * 12가 126 바로 위가 아니라 오른쪽으로 밀려 붙어, 세로셈이 세로셈이 아니게 된다.
 * 화면 쪽 drawMul이 이 값을 그대로 쓰므로 여기만 보면 된다.
 */
eq('십의 자리 곱만 한 칸 왼쪽에서 끝난다',
  gridSteps(sp).map((s) => `${s.key}@${s.end}`).join(' '), 'tp@3 op@4 sum@4');

let splitOk = true;
let splitBad = null;
for (let a = 11; a <= 99; a++) {
  if (a % 10 === 0) continue;
  for (let b = 2; b <= 9; b++) {
    const p = P('M3', a, b);
    // 분해가 성립하려면 두 부분곱의 합이 답이어야 한다
    if (p.tensProd + p.p1 !== p.ans) { splitOk = false; if (!splitBad) splitBad = `${a} × ${b}`; }
    // 적는 수에 0을 붙이면 실제 값이 된다 — 자리로 0을 대신한다는 말이 이 뜻이다
    if (p.tensWrite * 10 !== p.tensProd) { splitOk = false; if (!splitBad) splitBad = `${a} × ${b}`; }
    const st = gridSteps(p);
    if (st.length !== 3 || st[0].key !== 'tp' || st[1].key !== 'op' || st[2].key !== 'sum') splitOk = false;
    // 값은 자리별로 쪼개지 않고 통째로 받는다 — 12는 하나의 크기로 다뤄야 암산과 같아진다
    if (st.some((s, i) => s.digits !== String([p.tensWrite, p.p1, p.ans][i]).length)) splitOk = false;
    // 십의 자리 곱은 언제나 한 칸 왼쪽, 나머지 둘은 일의 자리 칸에서 끝난다
    if (st[0].end !== 3 || st[1].end !== 4 || st[2].end !== 4) splitOk = false;
    /* 칸이 격자 밖으로 나가면 안 된다. 곱셈 격자는 4열이고 수는 2열부터 쓴다.
       십의 자리 곱이 가장 큰 81(9 × 9)이라도 두 자리라 2~3열에 들어간다. */
    if (st.some((s) => s.end - s.digits + 1 < 2)) { splitOk = false; if (!splitBad) splitBad = `${a} × ${b} 칸 넘침`; }
  }
}
ok('모든 분해 문제에서 십의자리곱 + 일의자리곱 = 답이고 단계가 셋이다', splitOk, splitBad ?? '');

let m3Clean = true;
let m3cCarry = true;
for (let i = 0; i < 2000; i++) {
  if (genByType('M3').carry !== 0) m3Clean = false;
  if (genByType('M3c').carry === 0) m3cCarry = false;
}
ok('M3(1구역 분해)은 올림이 없다', m3Clean);
ok('M3c(3구역 분해)는 올림이 있다', m3cCarry);

eq('1구역은 세로셈 두 판 뒤 분해 두 판, 그리고 보스',
  [1, 2, 3, 4, 5].map((s) => MIX[s][0][0]).join(' '), 'M1 M1 M3 M3 M2');
/*
 * 3구역은 1구역과 사다리가 다르다(사용자가 정한 값). 세로셈은 1구역에서 익혔으니 바로
 * 분해로 들어가고, 보스 직전에 "올림을 보여주고 답을 한 번에" 계단을 하나 둔다.
 * 그래서 올림 칸을 아이가 직접 채우는 세로셈(M1c)은 복습 문제로만 나온다.
 */
eq('3구역은 분해 두 판 → 올림 보여주고 답 한 번에 두 판 → 보스',
  [11, 12, 13, 14, 15].map((s) => MIX[s][0][0]).join(' '), 'M3c M3c M4c M4c M2c');
ok('3구역 첫 판은 올림 없는 분해를 조금 섞어 들어간다',
  MIX[11].some(([t]) => t === 'M3') && MIX[11].every(([t]) => isSplit(t)));

ok('분해 방식에는 올림 칸이 없다 (마지막 덧셈에서 한꺼번에 풀린다)',
  gridSteps(P('M3c', 47, 8)).every((s) => s.key !== 'carry'));
ok('분해 제한 시간이 자리별 세로셈보다 길다 (한 문제에 세 번 입력한다)',
  timeFor('M3')[0] > timeFor('M1')[0] && timeFor('M3')[2] > timeFor('M1')[2]);
ok('분해는 나눗셈보다는 짧다', timeFor('M3')[0] < timeFor('D1')[0]);

/* ================= 나눗셈 ================= */

// 사용자가 예로 든 582 ÷ 3 을 그대로 고정한다.
const ex = DP('D1', 582, 3);
eq('582 ÷ 3 의 몫', ex.ans, 194);
eq('582 ÷ 3 의 단계 수', ex.work.length, 3);
eq('582 ÷ 3 단계별 (몫/곱한 값/내려 쓴 수)',
  ex.work.map((w) => `${w.qd}/${w.prod}/${w.next}`).join(' '), '1/3/28 9/27/12 4/12/0');

eq('2구역(D1)은 몫과 뺀 값을 번갈아 묻는다',
  divSteps(DP('D1', 582, 3)).map((s) => `${s.key}=${s.val}`).join(' '), 'q0=1 r0=28 q1=9 r1=12 q2=4');
eq('보스(D2)는 몫만 묻는다',
  divSteps(DP('D2', 582, 3)).map((s) => `${s.key}=${s.val}`).join(' '), 'q0=1 q1=9 q2=4');

/*
 * 2구역 처음 두 판은 **곱한 값만** 넣는다(사용자가 정한 값). 맞히면 몫이 저절로 적히고
 * 뺀 값도 바로 내려온다. "나누는 수의 구구단에서 넘지 않는 가장 큰 것 찾기"만 남기고
 * 뺄셈을 걷어낸 판이라, 몫과 뺀 값을 다 넣는 3·4판보다 가볍다.
 */
const pp = DP('Dp', 582, 3);
eq('2구역 처음 두 판(Dp)은 곱한 값만 묻는다',
  divSteps(pp).map((s) => `${s.key}=${s.val}`).join(' '), 'p0=3 p1=27 p2=12');
eq('곱한 값 칸은 그 값의 자릿수만큼이다', divSteps(pp).map((s) => s.digits).join(''), '122');
eq('곱한 값 단계마다 무엇을 찾는지 말로 붙어 있다',
  divSteps(pp).map((s) => s.say).join(' | '),
  '3단에서 5를 넘지 않는 가장 큰 수는? | 3단에서 28을 넘지 않는 가장 큰 수는? | 3단에서 12를 넘지 않는 가장 큰 수는?');
ok('Dp의 제한 시간은 한 자리 나눗셈 것이다', timeFor('Dp') === TIME.D);

let prodOnlyOk = true;
for (let i = 0; i < 600; i++) {
  const p = genDiv('Dp');
  const st = divSteps(p);
  if (st.length !== p.work.length) prodOnlyOk = false;
  if (st.some((s, k) => s.key !== 'p' + k || s.val !== p.work[k].prod || s.val !== p.work[k].qd * p.b)) prodOnlyOk = false;
}
ok('Dp는 단계마다 곱한 값 하나만 묻고 그 값은 몫 × 나누는 수다', prodOnlyOk);

// 마지막 뺀 값은 언제나 0이라 묻지 않는다 — 물으면 아이가 "왜 0을 쓰지?" 하고 멈춘다
let lastNotAsked = true;
for (let i = 0; i < 400; i++) {
  const p = genDiv('D1');
  if (divSteps(p).some((s) => s.key === 'r' + (p.work.length - 1))) lastNotAsked = false;
}
ok('마지막 뺀 값(언제나 0)은 묻지 않는다', lastNotAsked);

/*
 * 뺀 값 칸의 자리.
 *
 * 실제로 겪은 결함이라 고정한다. 650 ÷ 2 처럼 첫 나머지가 0이면 내려 쓴 한 자리만 남아
 * 칸이 가로줄 오른쪽 바깥에 떠 버렸고, 그러면 그 칸이 비어 있는 다음 몫 칸 바로 아래에
 * 붙어서 "몫을 넣기도 전에 값을 넣으라"는 것처럼 읽혔다.
 */
const C0 = 3;
let remPosOk = true;
let remPosBad = null;
let sawZeroRem = false;
[[650, 2], [488, 4], [582, 3], [708, 6], [936, 3], [555, 5]].forEach(([n, d]) => {
  const p = DP('D1', n, d);
  p.work.forEach((w, i) => {
    const c = remCols(p, i, C0);
    if (w.rem === 0 && i < p.work.length - 1) sawZeroRem = true;
    // 칸은 언제나 가로줄 오른쪽 끝(C0+i)까지는 닿아야 한다
    if (c.start > C0 + i) { remPosOk = false; if (!remPosBad) remPosBad = `${n}÷${d} r${i}: ${c.start}열에서 시작 (가로줄 끝 ${C0 + i})`; }
    if (c.end < c.start) remPosOk = false;
  });
});
ok('뺀 값 칸이 가로줄에서 떨어져 뜨지 않는다', remPosOk, remPosBad ?? '');
ok('나머지가 0인 경우가 검사에 포함됐다 (그때만 생기는 결함이었다)', sawZeroRem);

let remPosAll = true;
for (let i = 0; i < 1500; i++) {
  const p = genDiv('D1');
  p.work.forEach((w, k) => {
    const c = remCols(p, k, C0);
    if (c.start > C0 + k || c.end < c.start) remPosAll = false;
  });
}
ok('무작위 1500문제에서도 뺀 값 칸 자리가 어긋나지 않는다', remPosAll);

eq('나눗셈 제한 시간', TIME.D.join('/'), '15000/12000/10000');

/* ----- 구역 안의 사다리: 일반은 도움을 주고 보스는 걷어낸다 ----- */

eq('2구역은 곱한 값만 두 판 → 몫+뺀 값 두 판 → 몫만 보스',
  [6, 7, 8, 9, 10].map((s) => MIX[s][0][0]).join(' '), 'Dp Dp D1 D1 D2');
/*
 * 4구역 처음 두 판은 2구역과 다르게 **몫만 넣고 곱한 값과 뺀 값을 바로 보여준다.**
 * 두 자리로 나눌 땐 구구단이 없어, 곱한 값을 넣게 하면 23 × 7 같은 암산이 끼어들어
 * 처음 두 판이 다음 두 판보다 어려워진다. 그래서 어림만 연습시킨다(사용자가 고른 안).
 */
eq('4구역은 몫만(바로 보여줌) 두 판 → 몫+뺀 값 두 판 → 몫만(늦게 보여줌) 보스',
  [16, 17, 18, 19, 20].map((s) => MIX[s][0][0]).join(' '), 'Dqw Dqw D1w D1w D2w');
eq('Dqw는 몫 두 자리만 묻는다',
  divSteps(DP('Dqw', 552, 24)).map((s) => `${s.key}=${s.val}`).join(' '), 'q0=2 q1=3');
ok('Dqw는 몫만 넣되 보스처럼 뺀 값을 늦게 보여주지는 않는다',
  isQuotOnly('Dqw') && !isLateRem('Dqw') && isLateRem('D2w') && isLateRem('D2'));
ok('두 자리로 나누기의 첫 두 판은 곱한 값을 넣게 하지 않는다', !isProdOnly(MIX[16][0][0]));
ok('Dqw의 제한 시간은 두 자리 나눗셈 것이다', timeFor('Dqw') === TIME.Dw);

let ladderOk = true;
let ladderBad = null;
[[2, 6, 8, 10], [4, 16, 18, 20]].forEach(([zone, first, mid, boss]) => {
  const f = MIX[first][0][0];
  const m = MIX[mid][0][0];
  const b = MIX[boss][0][0];
  const fail = (why) => { ladderOk = false; if (!ladderBad) ladderBad = `${zone}구역: ${why}`; };
  // 보스는 도움만 걷어내고 산수는 그대로여야 한다 — 뺀 값을 늦게 보여주는 것은 보스뿐이다
  if (isLateRem(f) || isLateRem(m)) fail('보스 규칙이 일반 판에 있다');
  if (!isLateRem(b)) fail('보스가 뺀 값을 늦게 보여주지 않는다');
  // 가운데 두 판은 몫과 뺀 값을 모두 넣는 판이다
  if (isQuotOnly(m) || isProdOnly(m)) fail('가운데 두 판이 몫+뺀 값이 아니다');
  // 나누는 수 자릿수는 구역 안에서 같다
  if (new Set([f, m, b].map((t) => t.slice(-1) === 'w')).size !== 1) fail('나누는 수 자릿수가 섞였다');
});
ok('나눗셈 보스는 도움만 걷어내고 나누는 수 자릿수는 그대로다', ladderOk, ladderBad ?? '');

/* ----- 두 자리로 나누기 ----- */

const w = DP('D1w', 552, 24);
eq('552 ÷ 24 의 몫', w.ans, 23);
eq('552 ÷ 24 는 두 단계다 (첫 자리로는 안 나눠져 두 자리를 한꺼번에 본다)', w.work.length, 2);
eq('첫 몫이 놓이는 열', w.qStart, 1);
eq('552 ÷ 24 단계', divSteps(w).map((s) => `${s.key}=${s.val}`).join(' '), 'q0=2 r0=72 q1=3');
eq('보스(몫만)는 몫 두 자리만 묻는다',
  divSteps(DP('D2w', 552, 24)).map((s) => `${s.key}=${s.val}`).join(' '), 'q0=2 q1=3');

let wideOk = true;
let wideBad = null;
for (let i = 0; i < 2000; i++) {
  const p = genDiv(['D1w', 'D2w', 'Dqw'][i % 3]);
  const fail = (why) => { wideOk = false; if (!wideBad) wideBad = `${p.a} ÷ ${p.b}: ${why}`; };
  if (p.a % p.b !== 0) fail('나머지가 0이 아니다');
  if (p.a < 100 || p.a > 999) fail('나누어지는 수가 세 자리가 아니다');
  if (String(p.b).length !== 2) fail('나누는 수가 두 자리가 아니다');
  if (String(p.ans).length !== 2) fail('몫이 두 자리가 아니다');
  if (String(p.ans).indexOf('0') >= 0) fail('몫에 0이 들어 있다');
  if (p.work.length !== 2) fail('단계가 둘이 아니다');
  // 몫 열이 나누어지는 수의 오른쪽 끝에서 역순으로 맞아떨어져야 한다
  if (p.work[p.work.length - 1].col !== p.digits.length - 1) fail('마지막 몫 열이 어긋났다');
}
ok('두 자리로 나누기 문제가 조건을 모두 지킨다', wideOk, wideBad ?? '');

let wideRem = true;
for (let i = 0; i < 800; i++) {
  const p = genDiv('D1w');
  p.work.forEach((_, k) => {
    const c = remCols(p, k, 3);
    if (c.start > 3 + p.work[k].col || c.end < c.start) wideRem = false;
  });
}
ok('두 자리로 나눌 때도 뺀 값 칸이 가로줄에서 떨어지지 않는다', wideRem);
ok('두 자리로 나누기가 한 자리보다 시간이 길다', timeFor('D1w')[0] > timeFor('D1')[0]);

let divOk = true;
let divBad = null;
for (let i = 0; i < 3000; i++) {
  const p = genDiv(['D1', 'D2', 'Dp'][i % 3]);
  const n = p.a;
  const d = p.b;
  const q = p.ans;
  const fail = (why) => { divOk = false; if (!divBad) divBad = `${n} ÷ ${d}: ${why}`; };
  if (n % d !== 0) fail('나머지가 0이 아니다');
  if (n < 100 || n > 999) fail('나누어지는 수가 세 자리가 아니다');
  if (d < 2 || d > 6) fail('나누는 수가 2~6이 아니다');
  if (Number(String(n)[0]) < d) fail('첫 자리가 나누는 수보다 작다');
  if (String(q).length !== 3) fail('몫이 세 자리가 아니다');
  if (String(q).indexOf('0') >= 0) fail('몫에 0이 들어 있다');
  let rem = 0;
  p.digits.forEach((dg, k) => {
    const cur = rem * 10 + dg;
    const w = p.work[k];
    if (w.cur !== cur || w.qd !== Math.floor(cur / d) || w.prod !== w.qd * d || w.rem !== cur - w.prod) fail('단계 계산이 틀렸다');
    rem = w.rem;
  });
  if (rem !== 0) fail('마지막에 남는 수가 0이 아니다');
}
ok('나눗셈 문제가 조건을 모두 지킨다 (나머지 0, 첫 자리 ≥ 나누는 수, 몫에 0 없음)', divOk, divBad ?? '');

/* ================= 스테이지 구성 ================= */

eq('구역 수와 스테이지 수가 맞는다', ZONES.length * 5, STAGES);
eq('스테이지는 20개', STAGES, 20);
eq('MIX가 모든 스테이지를 덮는다', Object.keys(MIX).length, STAGES);
eq('보스 수가 구역 수와 같다', BOSS_TOTAL, ZONES.length);

let bossEvery5 = true;
for (let s = 1; s <= STAGES; s++) if (!!ANIMALS[s - 1].boss !== (s % 5 === 0)) bossEvery5 = false;
ok('보스는 5의 배수 스테이지에만 있다', bossEvery5);

// 유형이 늘 때 지도 라벨이나 힌트를 빠뜨리면 화면에 "undefined"가 뜬다. 복습으로만 나오는 유형도 본다.
const usedTypes = new Set(['M1c', 'M4']);
Object.values(MIX).forEach((m) => m.forEach(([t]) => usedTypes.add(t)));
let labelOk = true;
let labelBad = null;
usedTypes.forEach((t) => { if (!TYPES[t] || !HINTS[t]) { labelOk = false; if (!labelBad) labelBad = t; } });
ok('쓰이는 모든 유형에 지도 라벨과 힌트가 있다', labelOk, labelBad ?? '');

eq('구역 순서는 곱셈 → 나눗셈 → 곱셈 → 나눗셈이다',
  [1, 6, 11, 16].map((s) => (isDivStage(s) ? '÷' : '×')).join(''), '×÷×÷');

/*
 * 보스 난이도가 그 구역에서 연습한 것과 맞는지.
 *
 * 실제로 겪은 결함이라 검사로 고정한다. 처음에는 암산 문제가 구역을 안 보고 아무거나
 * 냈고, 그래서 올림 없는 곱셈만 연습한 1구역의 보스가 79%의 확률로 올림 암산을 냈다.
 * 화면상으로는 "보스가 좀 어렵네" 정도로만 보여 눈으로는 원인을 못 찾는다.
 */
let bossMatchesZone = true;
let bossBad = null;
for (let z = 0; z < ZONES.length; z++) {
  const weight = {};
  for (let s = z * 5 + 1; s <= z * 5 + 4; s++) MIX[s].forEach(([ty, w]) => { weight[ty] = (weight[ty] ?? 0) + w; });
  const taught = Object.keys(weight).sort((a, b) => weight[b] - weight[a])[0];
  const bossType = MIX[z * 5 + 5][0][0];
  const bad = isDiv(taught) !== isDiv(bossType) || taught.endsWith('c') !== bossType.endsWith('c');
  const wholeBad = !isDiv(taught) && !isWhole(bossType);
  if (bad || wholeBad) { bossMatchesZone = false; if (!bossBad) bossBad = `${z + 1}구역: 가르친 것 ${taught}, 보스 ${bossType}`; }
}
ok('보스의 연산과 올림 유무가 그 구역에서 가르친 것과 같다', bossMatchesZone, bossBad ?? '');

let bossGenOk = true;
for (let z = 0; z < ZONES.length; z++) {
  const stage = z * 5 + 5;
  const want = MIX[stage][0][0];
  for (let i = 0; i < 500; i++) {
    const p = genByType(pickType(stage));
    if (p.t !== want) bossGenOk = false;
    if (!isDiv(want) && (p.carry > 0) !== want.endsWith('c')) bossGenOk = false;
  }
}
ok('보스 문제가 실제로 그 구역의 규칙을 지킨다 (구역마다 500문제 확인)', bossGenOk);

/*
 * 복습 문제는 수만 가져오고 푸는 방식은 지금 구역을 따라야 한다.
 * 저장된 유형을 그대로 쓰면 2구역에서 틀린 나눗셈이 4구역에 와서 갑자기 뺀 값을 묻는
 * 칸을 만든다 — 같은 구역 안에서 규칙이 문제마다 달라지는 셈이라 아이가 헷갈린다.
 */
let reviewOk = true;
let reviewBad = null;
for (let i = 0; i < 600; i++) {
  // 2구역 오답이 그 구역 보스(몫만)에 오면 방식이 D2로 바뀌어야 한다
  const p1 = makeProblem(10, [{ t: 'D1', a: 582, b: 3 }]);
  if (p1.review && p1.t !== 'D2') { reviewOk = false; reviewBad = `2구역 보스인데 ${p1.t}`; }
  // 4구역(두 자리로 나누기) 오답도 그 구역 보스에서 D2w가 되어야 한다
  const p3 = makeProblem(20, [{ t: 'D1w', a: 552, b: 24 }]);
  if (p3.review && p3.t !== 'D2w') { reviewOk = false; reviewBad = `4구역 보스인데 ${p3.t}`; }
  const p2 = makeProblem(5, [{ t: 'M1c', a: 47, b: 8 }]);
  if (p2.review && p2.t !== 'M2c') { reviewOk = false; reviewBad = `보스인데 ${p2.t}`; }
}
ok('복습 문제의 푸는 방식이 지금 구역을 따른다', reviewOk, reviewBad ?? '');

// 나누는 수 자릿수가 다르면 재사용하지 않는다 — 유형과 실제 수가 어긋나기 때문이다
let widthCross = 0;
for (let i = 0; i < 600; i++) {
  if (makeProblem(16, [{ t: 'D1', a: 582, b: 3 }]).review) widthCross++;
  if (makeProblem(6, [{ t: 'D1w', a: 552, b: 24 }]).review) widthCross++;
}
eq('한 자리 나눗셈 오답이 두 자리 구역으로 넘어가지 않는다', widthCross, 0);

// 곱셈 방식이 넷이므로 여섯 판 모두에서 확인한다 — 하나만 빠뜨려도 그 구역에서 규칙이 달라진다
let methodOk = true;
let methodBad = null;
[[1, 'M1'], [3, 'M3'], [5, 'M2'], [11, 'M3c'], [13, 'M4c'], [15, 'M2c']].forEach(([stage, want]) => {
  const carry = want.endsWith('c');
  const pool0 = carry ? { t: 'M1c', a: 47, b: 8 } : { t: 'M1', a: 42, b: 3 };
  for (let i = 0; i < 300; i++) {
    const p = makeProblem(stage, [{ ...pool0 }]);
    if (p.review && p.t !== want) { methodOk = false; if (!methodBad) methodBad = `${stage}스테이지: ${p.t} (기대 ${want})`; }
  }
});
ok('복습 문제가 네 방식(자리별 세로셈·분해·올림 보여주기·보스) 모두에서 지금 구역을 따른다', methodOk, methodBad ?? '');

// 올림 없는 오답이 올림 보여주는 판에 오면 M4 — 올림 칸에 아무것도 안 적히고 답만 한 번에 받는다
let m4Review = true;
for (let i = 0; i < 300; i++) {
  const p = makeProblem(13, [{ t: 'M1', a: 42, b: 3 }]);
  if (p.review && (p.t !== 'M4' || p.carry !== 0)) m4Review = false;
}
ok('올림 없는 복습 문제가 13스테이지에 오면 M4다', m4Review);

// 나눗셈도 방식이 셋(곱한 값만 / 몫+뺀 값 / 몫만)이라 구역의 세 층 모두에서 확인한다
let divMethodOk = true;
let divMethodBad = null;
[[6, 'Dp', { t: 'D1', a: 582, b: 3 }], [8, 'D1', { t: 'Dp', a: 582, b: 3 }],
 [16, 'Dqw', { t: 'D1w', a: 552, b: 24 }], [18, 'D1w', { t: 'Dqw', a: 552, b: 24 }]].forEach(([stage, want, pool0]) => {
  for (let i = 0; i < 300; i++) {
    const p = makeProblem(stage, [{ ...pool0 }]);
    if (p.review && p.t !== want) { divMethodOk = false; if (!divMethodBad) divMethodBad = `${stage}스테이지: ${p.t} (기대 ${want})`; }
  }
});
ok('나눗셈 복습 문제도 세 방식 모두에서 지금 구역을 따른다', divMethodOk, divMethodBad ?? '');

let crossOp = 0;
for (let i = 0; i < 600; i++) if (makeProblem(6, [{ t: 'M1', a: 23, b: 3 }]).review) crossOp++;
eq('연산이 다른 오답은 복습으로 나오지 않는다 (곱셈 오답 → 나눗셈 구역)', crossOp, 0);

// 적 체력이 지나치게 높으면 세로셈 한 판이 몇 분씩 늘어진다.
let hpOk = true;
let hpBad = null;
for (let s = 1; s <= STAGES; s++) {
  const boss = s % 5 === 0;
  const hits = Math.ceil(foeMaxHP(s, boss) / 15);
  const slow = Math.ceil(foeMaxHP(s, boss) / 10);
  if (hits < 3 || slow > 9) { hpOk = false; if (!hpBad) hpBad = `${s}: ${hits}~${slow}문제`; }
}
ok('한 전투가 3~9문제로 끝난다', hpOk, hpBad ?? '');
ok('나눗셈 구역의 적이 곱셈 구역보다 약하다 (한 문제에 입력이 더 많다)',
  foeMaxHP(6, false) < foeMaxHP(1, false) && foeMaxHP(10, true) < foeMaxHP(5, true));
ok('나눗셈 제한 시간이 곱셈보다 길다', TIME.D[0] > TIME.M[0] && TIME.D[2] > TIME.M[2]);

/* ================= 이름과 조사 ================= */

const faces = ANIMALS.map((a) => a.f).concat(PET_FORMS.map((f) => f.f));
ok('적과 펫의 이모지가 서로 겹치지 않는다', new Set(faces).size === faces.length, faces.join(' '));
eq('적은 스테이지 수만큼 있다', ANIMALS.length, STAGES);

eq('받침 있는 이름에는 을', withJosa('거북대장', '을', '를'), '거북대장을');
eq('받침 없는 이름에는 를', withJosa('톡톡이', '을', '를'), '톡톡이를');
eq('받침 있는 이름에는 이', withJosa('이빨상어', '이', '가'), '이빨상어가');
eq('받침 없는 이름에는 가', withJosa('파랑이', '이', '가'), '파랑이가');

/* 숫자는 한글이 아니라 위 함수로 갈리지 않는다. 읽는 소리로 판단해야 한다.
   이게 없으면 "4 × 3은?"은 맞고 "4 × 5은?"은 틀린 문장이 섞여 나온다. */
eq('소리에 받침이 있는 숫자에는 은', [3, 6, 7, 8].map((n) => numJosa(n, '은', '는')).join(' '),
  '3은 6은 7은 8은');
eq('소리에 받침이 없는 숫자에는 는', [2, 4, 5, 9].map((n) => numJosa(n, '은', '는')).join(' '),
  '2는 4는 5는 9는');
// 곱한 값 안내("3단에서 28을 …")에 두 자리 수가 들어가므로 마지막 자리 소리로 갈려야 한다
eq('두 자리 이상도 마지막 자리 소리로 갈린다',
  [10, 12, 28, 100].map((n) => numJosa(n, '을', '를')).join(' '), '10을 12를 28을 100을');

let josaOk = true;
ANIMALS.concat(PET_FORMS).forEach((x) => {
  const n = x.n;
  const last = n.charCodeAt(n.length - 1) - 0xAC00;
  const expect = (last >= 0 && last < 11172 && last % 28 !== 0) ? n + '을' : n + '를';
  if (withJosa(n, '을', '를') !== expect) josaOk = false;
});
ok('모든 적·펫 이름의 조사가 받침대로 붙는다', josaOk);

report('곱셈 바다 문제와 입력 순서');
