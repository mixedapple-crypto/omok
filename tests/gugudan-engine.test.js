/**
 * 구구단 로켓 엔진 테스트 — 사실·순서·세션 구성·기록·혼동쌍·레이스·인증·임무 규칙을 고정한다.
 *
 * 이 파일이 존재하는 이유: 출제 규칙은 화면으로는 보이지 않는다. "6×8이 5일째 안 나온다"나
 * "틀린 문제가 여섯 번 연달아 나온다"는 아이가 겪어도 부모가 알아채기 어렵다. 그래서 규칙 하나하나를
 * 국면으로 만들어 단언한다. 시드를 고정해 재현된다.
 */
import * as E from '../www/gugudan/js/engine.js';
import { ok, eq, eqArr, report } from './_assert.js';

const DAY = 86400000;
const T0 = new Date(2026, 8, 3, 9, 0, 0).getTime(); // 2026-09-03 09:00 로컬
const at = (d) => T0 + d * DAY;
const answerAll = (state, session, now, msFn = () => 1000) => {
  while (!session.done) {
    const id = E.sessionCurrent(session);
    E.sessionAnswer(state, session, { value: E.fact(id).ans, ms: msFn(id), fixed: false }, now);
  }
};
/** 진단 사흘을 끝내 1단계로 올린다. */
function afterDiag(rng) {
  const s = E.newState();
  for (let d = 0; d < 3; d++) answerAll(s, E.buildSession(s, at(d), rng), at(d));
  return s;
}

// ── 사실과 순서 ────────────────────────────────────────────────────────────────
eq('사실은 72개', E.FACT_IDS.length, 72);
eq('7x8 = 56', E.fact('7x8').ans, 56);
eq('거꾸로 순서도 72개', E.BACKWARD_ORDER.length, 72);
eq('거꾸로는 9×9부터', E.BACKWARD_ORDER[0], '9x9');
eq('9단 끝은 9×1', E.BACKWARD_ORDER[8], '9x1');
eq('그다음 8×9', E.BACKWARD_ORDER[9], '8x9');
eq('마지막은 2×1', E.BACKWARD_ORDER[71], '2x1');
eq('거꾸로 순서에 빠진 사실이 없다', new Set(E.BACKWARD_ORDER).size, 72);
eq('날짜 키', E.dayKey(T0), '2026-09-03');
eq('날짜 차', E.daysBetween('2026-09-03', '2026-09-08'), 5);
ok('시드 난수는 재현된다', E.makeRng(7)() === E.makeRng(7)());

// ── 진단 ─────────────────────────────────────────────────────────────────────
{
  const s = E.newState();
  eq('처음은 0단계 진단', E.stage(s, T0).no, 0);
  const rng = E.makeRng(11);
  const ses = E.buildSession(s, T0, rng);
  eq('진단 세션', ses.kind, 'diag');
  eq('한 세션 24문제', ses.items.length, 24);
  eq('전부 다른 사실', new Set(ses.items).size, 24);
  let sameDanAdjacent = 0;
  for (let i = 1; i < ses.items.length; i++) if (E.fact(ses.items[i]).a === E.fact(ses.items[i - 1]).a) sameDanAdjacent++;
  eq('같은 단이 붙어 나오지 않는다', sameDanAdjacent, 0);
  answerAll(s, ses, T0);
  eq('세션이 끝나면 임무의 연료 칸이 켜진다', E.mission(s, T0).fuel, true);
  eq('진단 첫날 기록', s.diagDays.length, 1);
  const s2 = afterDiag(E.makeRng(11));
  ok('사흘이면 72개를 전부 봤다', E.FACT_IDS.every((id) => s2.facts[id].seen > 0));
  eq('그러면 1단계', E.stage(s2, at(3)).no, 1);
  eq('다음 세션은 연료 채우기', E.buildSession(s2, at(3), E.makeRng(1)).kind, 'fuel');
}

// ── 기록·오답·재출제·혼동쌍 ──────────────────────────────────────────────────────
{
  const s = afterDiag(E.makeRng(3));
  const ses = E.buildSession(s, at(3), E.makeRng(5));
  // 6×7이 나올 때까지 맞히고, 6×7에 48(6×8의 답)이라 틀린다.
  let id = E.sessionCurrent(ses);
  ses.items[ses.pos] = '6x7';
  id = '6x7';
  const before = ses.items.length;
  const r = E.sessionAnswer(s, ses, { value: 48, ms: 2100, fixed: false }, at(3));
  eq('오답 판정', r.ok, false);
  eq('정답을 돌려준다', r.ans, 42);
  eq('재출제됐다', r.requeued, true);
  eq('재출제로 문제가 하나 늘었다', ses.items.length, before + 1);
  const again = ses.items.indexOf('6x7', ses.pos);
  ok('재출제 위치는 3~5문제 뒤', again - (ses.pos - 1) >= E.REQUEUE_MIN + 1 && again - (ses.pos - 1) <= E.REQUEUE_MAX + 1, `${again - (ses.pos - 1)}`);
  eq('재입력 대기 표시', ses.retype, '6x7');
  E.sessionRetyped(ses);
  eq('재입력 뒤 표시가 지워진다', ses.retype, null);
  const h = s.facts['6x7'].hist;
  ok('기록이 남았다', h[h.length - 1].ok === false && h[h.length - 1].ms === 2100);
  const pair = s.pairs['6x7|6x8'];
  ok('48은 6×8의 답이므로 6×7과 6×8이 혼동쌍', !!pair && pair.count === 1 && pair.phase === 'apart', JSON.stringify(pair));
  ok('혼동쌍 목록에 나온다', E.confusionList(s).some((p) => p.a === '6x7' && p.b === '6x8'));
  ok('간격은 1로 돌아간다', s.facts['6x7'].interval === 1);
}
{
  // 한 사실은 세션에 4번까지. 계속 틀려도 그 이상 재출제하지 않는다.
  const s = afterDiag(E.makeRng(4));
  const ses = E.buildSession(s, at(3), E.makeRng(6));
  ses.items[ses.pos] = '7x8';
  for (let guard = 0; guard < 60 && !ses.done; guard++) {
    const id = E.sessionCurrent(ses);
    E.sessionAnswer(s, ses, { value: id === '7x8' ? 54 : E.fact(id).ans, ms: 1500, fixed: false }, at(3));
  }
  ok('세션에 4번 넘게 나오지 않는다', ses.counts['7x8'] <= E.MAX_PER_SESSION, `${ses.counts['7x8']}번`);
  eq('7×8을 54로 틀리면 6×9와 묶인다(같은 단 없음 → 같은 승수 우선)', !!s.pairs['6x9|7x8'] || !!s.pairs['7x8|9x6'], true);
}
{
  // 값이 어느 사실의 답도 아니면 혼동쌍을 만들지 않는다.
  const s = afterDiag(E.makeRng(4));
  const ses = E.buildSession(s, at(3), E.makeRng(6));
  ses.items[ses.pos] = '7x8';
  E.sessionAnswer(s, ses, { value: 57, ms: 1500, fixed: false }, at(3));
  eq('57은 어떤 답도 아니라 혼동쌍 없음', Object.keys(s.pairs).length, 0);
}
{
  // 숨겨졌을 때 건너뛰기: 기록 없이 같은 사실이 뒤로 간다.
  const s = afterDiag(E.makeRng(4));
  const ses = E.buildSession(s, at(3), E.makeRng(6));
  const id = E.sessionCurrent(ses);
  const seen = s.facts[id].seen;
  E.sessionSkip(s, ses);
  ok('건너뛴 사실이 뒤에 다시 있다', ses.items.indexOf(id, ses.pos) >= ses.pos + E.MIN_GAP - 1);
  eq('기록은 남지 않는다', s.facts[id].seen, seen);
}

// ── 지표와 숙달 ─────────────────────────────────────────────────────────────────
{
  const s = E.newState();
  const put = (id, list) => { for (const [ms, ok] of list) s.facts[id].hist.push({ day: '2026-09-03', ms, ok, fixed: false }); s.facts[id].seen = list.length; s.facts[id].lastDay = '2026-09-03'; };
  put('2x1', [[900, true], [1000, true], [1100, true]]);
  put('2x2', [[900, true], [2600, true], [1100, true]]);
  put('2x3', [[900, true], [1000, false], [1100, true]]);
  const st = E.factStats(s, '2x1', at(2));
  eq('acc3', st.acc3, 3);
  eq('median3', st.median3, 1000);
  eq('daysSince', st.daysSince, 2);
  ok('2×1은 숙달', E.isMastered(s, '2x1'));
  ok('최댓값이 2.5초를 넘으면 숙달이 아니다', !E.isMastered(s, '2x2'));
  ok('한 번 틀리면 숙달이 아니다', !E.isMastered(s, '2x3'));
  ok('세 번이 안 된 사실은 숙달이 아니다', !E.isMastered(s, '2x4'));
  const grid = E.parentGrid(s, 'time', at(2));
  eq('격자는 8행', grid.length, 8);
  eq('행마다 9칸', grid[0].cells.length, 9);
  eq('2×1 답 시간 표시', grid[0].cells[0].label, '1.0');
  eq('기록 없는 칸', grid[0].cells[3].label, '—');
  eq('마지막 출제 보기', E.parentGrid(s, 'last', at(2))[0].cells[0].label, '2일');
  eq('정확도 보기', E.parentGrid(s, 'acc', at(2))[0].cells[2].label, '2/3');
}
{
  // 단 안정: 9개 전부 3/3 이고 중간값 2초 아래
  const s = E.newState();
  for (let b = 1; b <= 9; b++) {
    for (let k = 0; k < 3; k++) s.facts[`5x${b}`].hist.push({ day: '2026-09-03', ms: 1800, ok: true, fixed: false });
    s.facts[`5x${b}`].seen = 3;
  }
  ok('5단 안정', E.danStable(s, 5));
  ok('4단은 아직', !E.danStable(s, 4));
  const p = E.planets(s);
  eq('5단 행성은 안정', p.find((x) => x.dan === 5).status, 'stable');
  eq('2단이 지금 갈 행성', p[0].status, 'now');
  eq('3단은 대기', p[1].status, 'far');
  eq('행성 배지 1개', E.badges(s).find((b) => b.key === 'planet').count, 1);
}

// ── 연료 세션 구성 ───────────────────────────────────────────────────────────────
{
  const s = afterDiag(E.makeRng(9));
  // 2×3을 8일 전에 본 것으로 바꿔 강제 출제를 확인한다.
  for (const h of s.facts['2x3'].hist) h.day = '2026-08-20';
  s.facts['2x3'].lastDay = '2026-08-20';
  // 혼동쌍 분리: 6×7과 6×8 둘 다 약하게 만든다.
  for (const id of ['6x7', '6x8']) { s.facts[id].hist.push({ day: '2026-09-05', ms: 2600, ok: false, fixed: false }); s.facts[id].seen++; }
  s.pairs['6x7|6x8'] = { a: '6x7', b: '6x8', count: 2, phase: 'apart', reverted: false, okDays: [] };
  const ses = E.buildSession(s, at(3), E.makeRng(2));
  eq('연료 세션 24문제', ses.items.length, 24);
  eq('처음엔 전부 다른 사실', new Set(ses.items).size, 24);
  ok('5일 넘게 안 본 사실은 반드시 나온다', ses.items.includes('2x3'));
  ok('분리 중인 혼동쌍은 붙어 나오지 않는다', (() => { const i = ses.items.indexOf('6x7'); const j = ses.items.indexOf('6x8'); return i < 0 || j < 0 || Math.abs(i - j) > E.MIN_GAP; })());
}
{
  // 대비 세트는 붙여 낸다.
  const s = afterDiag(E.makeRng(9));
  for (const id of ['4x8', '4x6']) { for (let k = 0; k < 3; k++) s.facts[id].hist.push({ day: '2026-09-05', ms: 2600, ok: false, fixed: false }); s.facts[id].seen += 3; }
  s.pairs['4x6|4x8'] = { a: '4x6', b: '4x8', count: 3, phase: 'contrast', reverted: false, okDays: [] };
  const ses = E.buildSession(s, at(3), E.makeRng(2));
  const i = ses.items.indexOf('4x6');
  const j = ses.items.indexOf('4x8');
  ok('대비 세트 둘 다 나오고 붙어 있다', i >= 0 && j >= 0 && Math.abs(i - j) === 1, `${i} ${j}`);
}
{
  // 혼동쌍 진행: 분리 → (이틀 정확·빠름) → 대비 → (이틀) → 극복
  const s = afterDiag(E.makeRng(9));
  s.pairs['6x7|6x8'] = { a: '6x7', b: '6x8', count: 2, phase: 'apart', reverted: false, okDays: [] };
  const good = (day) => {
    for (const id of ['6x7', '6x8']) {
      const ses = { kind: 'fuel', items: [id], pos: 0, correct: 0, answered: 0, done: false, retype: null, counts: {}, ms: 0 };
      // 최근 3회가 빠르도록 두 번 더 채운다
      for (let k = 0; k < 2; k++) s.facts[id].hist.push({ day: E.dayKey(day), ms: 900, ok: true, fixed: false });
      E.sessionAnswer(s, ses, { value: E.fact(id).ans, ms: 900, fixed: false }, day);
    }
  };
  good(at(4));
  eq('하루 정확하면 아직 분리', s.pairs['6x7|6x8'].phase, 'apart');
  good(at(5));
  eq('이틀 정확하면 대비', s.pairs['6x7|6x8'].phase, 'contrast');
  good(at(6));
  good(at(7));
  eq('대비에서 이틀 정확하면 극복', s.pairs['6x7|6x8'].phase, 'done');
  eq('극복 배지 1', E.badges(s).find((b) => b.key === 'pair').count, 1);
}
{
  // 대비에서 틀리면 한 번만 분리로 되돌린다.
  const s = afterDiag(E.makeRng(9));
  s.pairs['6x7|6x8'] = { a: '6x7', b: '6x8', count: 2, phase: 'contrast', reverted: false, okDays: [] };
  const ses = { kind: 'fuel', items: ['6x7', '6x7', '6x7'], pos: 0, correct: 0, answered: 0, done: false, retype: null, counts: {}, ms: 0 };
  E.sessionAnswer(s, ses, { value: 48, ms: 2000, fixed: false }, at(4));
  eq('되돌아간다', s.pairs['6x7|6x8'].phase, 'apart');
  s.pairs['6x7|6x8'].phase = 'contrast';
  E.sessionAnswer(s, ses, { value: 48, ms: 2000, fixed: false }, at(4));
  eq('두 번째부터는 되돌리지 않는다', s.pairs['6x7|6x8'].phase, 'contrast');
}

// ── 레이스 ───────────────────────────────────────────────────────────────────
{
  const s = afterDiag(E.makeRng(13));
  const sets = E.raceSets(s);
  ok('단 세트 8개는 언제나 열려 있다', sets.filter((x) => x.key.startsWith('dan-')).every((x) => x.available));
  ok('전체 세트는 1단계에서 잠겨 있다', !sets.find((x) => x.key === 'all-random').available && !sets.find((x) => x.key === 'all-backward').available);
  const race = E.buildRace(s, 'dan-6', E.makeRng(1));
  eqArr('6단 레이스는 ×9에서 ×1로', race.items, ['6x9', '6x8', '6x7', '6x6', '6x5', '6x4', '6x3', '6x2', '6x1']);
  eq('유령은 아직 없다', E.ghostMs(s, 'dan-6'), null);
  for (const id of race.items) E.raceAnswer(s, race, { value: E.fact(id).ans, ms: 900, fixed: false }, at(3));
  const r1 = E.raceFinish(s, race, 12000, at(3));
  ok('무오류면 완벽 항로', r1.perfect && r1.stable && r1.accuracy === 1);
  eq('완벽 항로 배지 1', s.perfectRaces, 1);
  eq('임무의 레이스 칸', E.mission(s, at(3)).race, true);
  const race2 = E.buildRace(s, 'dan-6', E.makeRng(1));
  for (const id of race2.items) E.raceAnswer(s, race2, { value: id === '6x7' ? 48 : E.fact(id).ans, ms: 900, fixed: false }, at(4));
  const r2 = E.raceFinish(s, race2, 10000, at(4));
  ok('하나 틀리면 완벽이 아니고 9개 중 8개는 안정도 아니다', !r2.perfect && !r2.stable);
  eq('두 번째부터 유령이 생긴다(첫 기록)', r2.ghostMs, null);
  eq('이제 유령은 두 기록의 중간값', E.ghostMs(s, 'dan-6'), 11000);
  ok('레이스 오답도 혼동쌍을 만든다', !!s.pairs['6x7|6x8']);
}

// ── 구두 카드·암송·인증 ──────────────────────────────────────────────────────────
{
  const s = afterDiag(E.makeRng(21));
  const cards = E.buildOral(s, E.makeRng(2));
  eq('구두 카드 10장', cards.length, 10);
  eq('전부 다른 사실', new Set(cards).size, 10);
  E.recordOral(s, cards.map((id) => ({ id, ok: true })), at(3));
  eq('임무의 구두 칸', E.mission(s, at(3)).oral, true);
}
{
  const s = E.newState();
  eq('연습 모드는 통과가 없다', E.recordChant(s, { mode: 'practice', ms: 30000 }, T0).passed, false);
  eq('36초를 넘으면 실패', E.recordChant(s, { mode: 'measure', ms: 36001, errors: 0, misses: 0 }, T0).passed, false);
  eq('틀림이 있으면 실패', E.recordChant(s, { mode: 'measure', ms: 30000, errors: 1, misses: 0 }, T0).passed, false);
  eq('36초 안에 전부 정확이면 통과', E.recordChant(s, { mode: 'measure', ms: 35000, errors: 0, misses: 0 }, T0).passed, true);
  eq('최고 기록', s.chantBest, 35000);
  eq('거꾸로 36초 배지', E.badges(s).find((b) => b.key === 'chant36').earned, true);
}
{
  const s = E.newState();
  eq('인증 72개', E.buildCertification(E.makeRng(1)).length, 72);
  eq('틀림 있으면 실패', E.recordCertification(s, { errors: 1 }, T0).passed, false);
  eq('자기 수정 3개는 실패', E.recordCertification(s, { corrections: 3 }, T0).passed, false);
  const r1 = E.recordCertification(s, { corrections: 2 }, T0);
  ok('자기 수정 2개까지 통과, 아직 인증은 아님', r1.passed && !r1.certified);
  const same = E.recordCertification(s, { corrections: 0 }, T0 + 3600000);
  ok('같은 날 두 번은 인증이 아니다', same.passed && !same.certified);
  const r2 = E.recordCertification(s, { corrections: 0 }, at(1));
  ok('서로 다른 날 두 번이면 인증', r2.certified);
  eq('구두 인증 배지', E.badges(s).find((b) => b.key === 'cert').earned, true);
}

// ── 임무·용돈·연속 ─────────────────────────────────────────────────────────────
{
  const s = afterDiag(E.makeRng(31));
  const doDay = (d) => {
    answerAll(s, E.buildSession(s, at(d), E.makeRng(d)), at(d));
    const race = E.buildRace(s, 'dan-2', E.makeRng(d));
    for (const id of race.items) E.raceAnswer(s, race, { value: E.fact(id).ans, ms: 900, fixed: false }, at(d));
    E.raceFinish(s, race, 9000, at(d));
    E.recordOral(s, E.buildOral(s, E.makeRng(d)).map((id) => ({ id, ok: true })), at(d));
  };
  eq('임무 전엔 0원', E.mission(s, at(3)).coins, 0);
  doDay(3);
  const m = E.mission(s, at(3));
  ok('세 가지를 다 하면 30원', m.done && m.paid && m.coins === E.ALLOWANCE);
  answerAll(s, E.buildSession(s, at(3), E.makeRng(99)), at(3));
  eq('같은 날 또 해도 한 번만', E.mission(s, at(3)).coins, E.ALLOWANCE);
  eq('다음 날엔 임무가 새로 시작', E.mission(s, at(4)).done, false);
  doDay(4);
  doDay(5);
  eq('사흘이면 90원', s.allowance.coins, 90);
  eq('사흘 연속이면 연속 배지', s.streakCount, 1);
  E.payout(s);
  eq('지급하면 0원', s.allowance.coins, 0);
  eq('누적은 남는다', s.allowance.total, 90);
}

// ── 단계는 뒤로 가지 않는다 ─────────────────────────────────────────────────────
{
  const s = E.newState();
  for (const id of E.FACT_IDS) { for (let k = 0; k < 3; k++) s.facts[id].hist.push({ day: '2026-09-03', ms: 1000, ok: true, fixed: false }); s.facts[id].seen = 3; s.facts[id].lastDay = '2026-09-03'; }
  const ses = { kind: 'fuel', items: ['3x4'], pos: 0, correct: 0, answered: 0, done: false, retype: null, counts: {}, ms: 0 };
  E.sessionAnswer(s, ses, { value: 12, ms: 900, fixed: false }, T0);
  eq('72개 숙달 첫날은 2단계', E.stage(s, T0).no, 2);
  eq('숙달한 날이 기록된다', s.stage2Days.length, 1);
  const ses2 = { kind: 'fuel', items: ['3x4', '3x4', '3x4'], pos: 0, correct: 0, answered: 0, done: false, retype: null, counts: {}, ms: 0 };
  for (let k = 0; k < 3; k++) E.sessionAnswer(s, ses2, { value: 99, ms: 900, fixed: false }, at(1));
  eq('3단이 흔들려도 단계는 그대로', E.stage(s, at(1)).no, 2);
  ok('그래도 행성은 정직하게 보여준다', E.planets(s).find((p) => p.dan === 3).status !== 'stable');
}

// ── 운영: 무효화·초기화·내보내기 ───────────────────────────────────────────────────
{
  const s = afterDiag(E.makeRng(41));
  const ses = E.buildSession(s, at(3), E.makeRng(1));
  const id = E.sessionCurrent(ses);
  const n = s.facts[id].hist.length;
  E.sessionAnswer(s, ses, { value: 0, ms: 5000, fixed: true }, at(3));
  ok('마지막 문제 무효화', E.invalidateLast(s) && s.facts[id].hist.length === n);
  eq('두 번은 안 된다', E.invalidateLast(s), false);
  s.allowance.coins = 60;
  s.perfectRaces = 2;
  E.resetEngine(s);
  ok('초기화 뒤 학습 상태는 비고', E.FACT_IDS.every((x) => s.facts[x].seen === 0) && E.stage(s, at(3)).no === 0);
  ok('용돈과 배지 카운트는 남는다', s.allowance.coins === 60 && s.perfectRaces === 2);
  const text = E.exportState(s);
  const back = E.importState(text);
  eq('내보내기·가져오기 왕복', back.allowance.coins, 60);
  let threw = false;
  try { E.importState('{"v":2}'); } catch { threw = true; }
  ok('이상한 기록은 거부', threw);
}

report('gugudan-engine.test');
