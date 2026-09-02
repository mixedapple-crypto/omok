/**
 * 구구단 로켓 시뮬레이션 — 가상의 아이가 45일을 쓰게 하고 출제 엔진의 약속이 지켜지는지 본다.
 *
 * 이 파일이 존재하는 이유: 단위 테스트는 한 세션의 규칙을 보지만, "잘 아는 사실이 몇 주째 안 나온다"나
 * "약점만 세션의 대부분을 차지한다"는 여러 날에 걸쳐서만 드러난다. 그래서 아이 모델(사실마다 잠재 속도와
 * 오답 확률, 연습하면 나아짐)을 두고 날마다 연료 채우기·레이스·구두 카드를 돌린다. 시드 고정이라 재현된다.
 */
import * as E from '../www/gugudan/js/engine.js';
import { ok, eq, report } from './_assert.js';

const DAY = 86400000;
const T0 = new Date(2026, 8, 3, 9, 0, 0).getTime();
const at = (d) => T0 + d * DAY;
const rng = E.makeRng(20260903);

// 아이 모델: 어려운 사실은 느리고 잘 틀린다. 맞힐 때마다 조금 빨라지고, 틀릴 확률도 준다.
const HARD = new Set(['6x8', '4x8', '7x7', '6x7', '7x8', '8x7', '8x6', '4x6', '6x4', '3x8', '8x3', '7x6', '9x7', '7x9']);
const child = {};
for (const id of E.FACT_IDS) {
  const f = E.fact(id);
  const hard = HARD.has(id);
  child[id] = { ms: hard ? 2600 : f.a <= 5 ? 1300 : 1700, err: hard ? 0.35 : 0.06 };
}
function answer(id) {
  const c = child[id];
  const wrong = rng() < c.err;
  const ms = Math.max(600, c.ms * (0.8 + rng() * 0.4));
  c.ms = Math.max(650, c.ms * (wrong ? 1.0 : 0.94));
  c.err = Math.max(0.01, c.err * (wrong ? 0.97 : 0.8));
  if (!wrong) return { value: E.fact(id).ans, ms };
  // 오답은 이웃 사실의 답을 낸다(간섭).
  const f = E.fact(id);
  const nb = E.FACT_IDS.filter((o) => o !== id && (E.fact(o).a === f.a || E.fact(o).b === f.b) && Math.abs(E.fact(o).ans - f.ans) <= f.a + f.b);
  return { value: nb.length ? E.fact(nb[Math.floor(rng() * nb.length)]).ans : f.ans + 1, ms: ms * 1.2 };
}

const s = E.newState();
const DAYS = 45;
let violations = [];
let maxUnseen = 0;
let firstStage = { 1: null, 2: null };

for (let d = 0; d < DAYS; d++) {
  const now = at(d);
  // 세션 시작 전: 어떤 사실도 5일 넘게 안 나오지 않았어야 한다(진단 뒤).
  if (d > 3) {
    for (const id of E.FACT_IDS) {
      const ds = E.factStats(s, id, now).daysSince ?? 99;
      maxUnseen = Math.max(maxUnseen, ds);
    }
  }
  const ses = E.buildSession(s, now, rng);
  if (ses.items.length !== E.SESSION_SIZE) violations.push(`${d}일: 세션 크기 ${ses.items.length}`);
  // 분리 중 혼동쌍이 처음 배치에서 붙어 있지 않다.
  for (const p of Object.values(s.pairs)) {
    if (p.phase !== 'apart') continue;
    const i = ses.items.indexOf(p.a);
    const j = ses.items.indexOf(p.b);
    if (i >= 0 && j >= 0 && Math.abs(i - j) <= E.MIN_GAP) violations.push(`${d}일: 분리 쌍 ${p.a}·${p.b}가 ${Math.abs(i - j)}칸`);
  }
  while (!ses.done) {
    const id = E.sessionCurrent(ses);
    const a = answer(id);
    E.sessionAnswer(s, ses, { value: a.value, ms: a.ms, fixed: false }, now);
    if (ses.retype) E.sessionRetyped(ses);
  }
  // 세션이 끝난 뒤 같은 사실의 간격과 횟수 상한.
  const seenAt = {};
  ses.items.forEach((id, i) => { (seenAt[id] ||= []).push(i); });
  for (const [id, idxs] of Object.entries(seenAt)) {
    if (idxs.length > E.MAX_PER_SESSION) violations.push(`${d}일: ${id} ${idxs.length}번`);
    for (let k = 1; k < idxs.length; k++) if (idxs[k] - idxs[k - 1] < E.MIN_GAP) violations.push(`${d}일: ${id} 간격 ${idxs[k] - idxs[k - 1]}`);
  }
  // 레이스: 지금 가야 할 단, 열려 있으면 전체 무작위.
  const sets = E.raceSets(s);
  const nowDan = E.planets(s).find((p) => p.status === 'now')?.dan ?? 9;
  const key = sets.find((x) => x.key === 'all-random')?.available && d % 2 ? 'all-random' : `dan-${nowDan}`;
  const race = E.buildRace(s, key, rng);
  let total = 0;
  while (race.pos < race.items.length) {
    const a = answer(race.items[race.pos]);
    total += a.ms + 400;
    E.raceAnswer(s, race, { value: a.value, ms: a.ms, fixed: false }, now);
  }
  E.raceFinish(s, race, total, now);
  E.recordOral(s, E.buildOral(s, rng).map((id) => ({ id, ok: true })), now);

  const st = E.stage(s, now).no;
  if (st >= 1 && firstStage[1] == null) firstStage[1] = d;
  if (st >= 2 && firstStage[2] == null) firstStage[2] = d;
}

eq('규칙 위반이 없다', violations.length, 0);
if (violations.length) console.log('      ' + violations.slice(0, 8).join('\n      '));
ok(`어떤 사실도 ${E.MAX_UNSEEN_DAYS}일 넘게 굶지 않는다 (최대 ${maxUnseen}일)`, maxUnseen <= E.MAX_UNSEEN_DAYS);
ok('사흘 안에 72개를 전부 진단한다', firstStage[1] != null && firstStage[1] <= 3, `1단계 도달 ${firstStage[1]}일`);
ok('45일 안에 혼합 단계에 닿는다', firstStage[2] != null, `2단계 도달 ${firstStage[2]}일`);
eq('매일 임무를 마쳐 45일이면 1,350원', s.allowance.coins, E.ALLOWANCE * DAYS);
ok('연속 배지가 쌓인다', s.streakCount >= DAYS - 3, `${s.streakCount}`);
ok('혼동쌍이 아이의 오답에서 생긴다', Object.keys(s.pairs).length >= 3, `${Object.keys(s.pairs).length}쌍`);
ok('극복한 혼동쌍이 있다', s.pairsDone >= 1, `${s.pairsDone}`);
{
  const hardMastered = [...HARD].filter((id) => E.isMastered(s, id)).length;
  ok('어려운 사실도 대부분 숙달에 닿는다', hardMastered >= HARD.size - 3, `${hardMastered}/${HARD.size}`);
}
{
  // 세션 구성 비율: 마지막 날 세션에서 집중·복습·감사가 섞여 있는지(숙달된 사실이 들어 있는지).
  const ses = E.buildSession(s, at(DAYS), rng);
  const mastered = ses.items.filter((id) => E.isMastered(s, id)).length;
  ok('숙달된 사실도 세션에 섞여 나온다(굶지 않음)', mastered >= E.REVIEW_N, `${mastered}개`);
}

report('gugudan-sim.test');
