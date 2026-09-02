/**
 * 구구단 로켓 — 출제 엔진·지표·단계·인증·임무. 순수 로직이다. DOM도 Date.now()도 없다(now는 호출자가 넘긴다).
 *
 * 사람용 정본은 documents/구구단-로켓-지침서.md 이고, tests/gugudan-doc-sync.test.js 가 아래 상수와 대조한다.
 * 계약(시그니처)은 _workspace/design/gugudan-spec.md 에 있다 — 화면(app.js)은 그것만 보고 짜여 있으므로 바꾸면 같이 고친다.
 *
 * 설계의 축(기획서 참조):
 *   - 정답은 답 전체를 넣는 시간(ms)으로 재고, 사실 72개 각각의 최근 3회를 본다. 합계·평균으로 판단하지 않는다.
 *   - 세션 24문제는 집중 12 · 간격 복습 7 · 무작위 감사 5. 한 사실은 세션에 4번까지, 같은 사실 사이 최소 3문제,
 *     어떤 사실도 5일 넘게 안 나오지 않는다 — 약한 것만 반복되거나 잘 아는 것이 굶는 두 실패 모드를 막는다.
 *   - 혼동쌍은 아이의 오답에서 만든다(6×7에 48이라 답하면 6×8과 묶는다). 처음엔 같은 세션에 함께 내지 않고,
 *     이틀 정확하면 대비 세트로 연달아 낸다.
 *   - 단계는 뒤로 가지 않는다(도달한 단계를 기억한다). 피곤한 날 하나가 "행성이 다시 불안정"으로 보이면 안 된다.
 */

// ── 상수 (지침서와 대조된다) ─────────────────────────────────────────────────

export const DANS = Object.freeze([2, 3, 4, 5, 6, 7, 8, 9]);

/** 세션 구성 */
export const SESSION_SIZE = 24;
export const FOCUS_N = 12;
export const REVIEW_N = 7;
export const AUDIT_N = 5;
export const MAX_PER_SESSION = 4;
export const MIN_GAP = 3;
export const MAX_UNSEEN_DAYS = 5;
export const REQUEUE_MIN = 3;
export const REQUEUE_MAX = 5;
export const HIST_N = 10;
export const INTERVAL_MAX = 14;

/** 숙달 기준(ms) */
export const MASTER_MS = 1500;
export const MASTER_MAX_MS = 2500;
export const DAN_MS = 2000;
export const STAGE2_DAYS = 2;
export const PAIR_OK_DAYS = 2;

/** 레이스·구두·암송·인증 */
export const RACE_STABLE = 0.95;
export const GHOST_N = 5;
export const ORAL_N = 10;
export const ORAL_WEAK_N = 6;
export const CHANT_PACES = Object.freeze([72, 60, 48, 40, 36]);
export const CHANT_PASS_MS = 36000;
export const CERT_CORRECTIONS = 2;
export const CERT_DAYS = 2;

/** 임무·용돈·배지 */
export const ALLOWANCE = 30;
export const STREAK_DAYS = 3;

export const STAGE_NAMES = Object.freeze(['진단', '단별 안정', '혼합', '구두 인증', '거꾸로 도전']);

export const BADGE_NAMES = Object.freeze({
  planet: '행성 안정',
  pair: '혼동쌍 극복',
  perfect: '완벽 항로',
  streak: '사흘 안정',
  cert: '구두 인증',
  chant36: '거꾸로 36초',
});

// ── 사실과 순서 ───────────────────────────────────────────────────────────────

export const FACT_IDS = Object.freeze(DANS.flatMap((a) => Array.from({ length: 9 }, (_, i) => `${a}x${i + 1}`)));

/** 거꾸로 순서: 9단부터 2단까지, 각 단 ×9에서 ×1로(사용자 확정). */
export const BACKWARD_ORDER = Object.freeze(
  [...DANS].reverse().flatMap((a) => Array.from({ length: 9 }, (_, i) => `${a}x${9 - i}`)),
);

const FACT_CACHE = new Map();
export function fact(id) {
  let f = FACT_CACHE.get(id);
  if (!f) {
    const [a, b] = id.split('x').map(Number);
    if (!DANS.includes(a) || !(b >= 1 && b <= 9)) throw new Error(`모르는 사실: ${id}`);
    f = Object.freeze({ id, a, b, ans: a * b });
    FACT_CACHE.set(id, f);
  }
  return f;
}

export function dayKey(now) {
  const d = new Date(now);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** 'YYYY-MM-DD' 두 개의 날짜 차(b - a, 일). */
export function daysBetween(a, b) {
  const p = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(b) - p(a)) / 86400000);
}

/** mulberry32 — selfplay·테스트 재현용. */
export function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = xs.slice().sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ── 상태 ─────────────────────────────────────────────────────────────────────

export function newState() {
  const facts = {};
  for (const id of FACT_IDS) facts[id] = { hist: [], lastDay: null, interval: 1, seen: 0 };
  return {
    v: 1,
    facts,
    pairs: {},
    diagDays: [],
    sessions: [],
    races: {},
    stage2Days: [],
    stageReached: 0,
    certDays: [],
    certLog: [],
    chantBest: null,
    chantLog: [],
    chant36Days: [],
    oralLog: [],
    mission: { day: null, fuel: false, race: false, oral: false, paid: false },
    missionDays: [],
    streakCount: 0,
    allowance: { coins: 0, total: 0 },
    perfectRaces: 0,
    pairsDone: 0,
    last: null,
    settings: { ghost: true, chantPace: CHANT_PACES[0] },
  };
}

// ── 지표 ─────────────────────────────────────────────────────────────────────

export function factStats(state, id, now) {
  const f = state.facts[id];
  const last3 = f.hist.slice(-3);
  const acc3 = last3.length === 3 ? last3.filter((h) => h.ok).length : null;
  const ms = last3.map((h) => h.ms);
  const median3 = last3.length === 3 ? median(ms) : null;
  const max3 = last3.length === 3 ? Math.max(...ms) : null;
  const daysSince = f.lastDay && now != null ? daysBetween(f.lastDay, dayKey(now)) : null;
  return { acc3, median3, max3, seen: f.seen, lastDay: f.lastDay, daysSince };
}

export function isMastered(state, id) {
  const s = factStats(state, id);
  return s.acc3 === 3 && s.median3 <= MASTER_MS && s.max3 <= MASTER_MAX_MS;
}

export function danStable(state, dan) {
  return FACT_IDS.filter((id) => fact(id).a === dan).every((id) => {
    const s = factStats(state, id);
    return s.acc3 === 3 && s.median3 <= DAN_MS;
  });
}

const allSeen = (state) => FACT_IDS.every((id) => state.facts[id].seen > 0);

function computedStage(state) {
  if (!allSeen(state)) return 0;
  if (!DANS.every((d) => danStable(state, d))) return 1;
  if (state.stage2Days.length < STAGE2_DAYS) return 2;
  if (state.certDays.length < CERT_DAYS) return 3;
  return 4;
}

/** 기록이 바뀔 때마다 부른다. 도달한 단계는 잊지 않는다. */
function refreshStage(state, now) {
  const day = dayKey(now);
  if (FACT_IDS.every((id) => isMastered(state, id)) && !state.stage2Days.includes(day)) state.stage2Days.push(day);
  const no = computedStage(state);
  if (no > state.stageReached) state.stageReached = no;
}

export function stage(state, now) {
  const no = Math.max(computedStage(state), state.stageReached);
  let detail = '';
  if (no === 0) detail = `${FACT_IDS.filter((id) => state.facts[id].seen > 0).length} / 72 진단`;
  else if (no === 1) detail = `${DANS.filter((d) => danStable(state, d)).length} / 8 단 안정`;
  else if (no === 2) detail = `${FACT_IDS.filter((id) => isMastered(state, id)).length} / 72 숙달 · ${state.stage2Days.length} / ${STAGE2_DAYS}일`;
  else if (no === 3) detail = `구두 인증 ${state.certDays.length} / ${CERT_DAYS}일`;
  else detail = state.chant36Days.length ? `거꾸로 36초 달성` : '거꾸로 36초에 도전';
  return { no, name: STAGE_NAMES[no], detail };
}

export function planets(state) {
  let nowFound = false;
  return DANS.map((dan) => {
    if (danStable(state, dan)) return { dan, status: 'stable' };
    if (!nowFound) { nowFound = true; return { dan, status: 'now' }; }
    return { dan, status: 'far' };
  });
}

export function badges(state) {
  const stableN = DANS.filter((d) => danStable(state, d)).length;
  return [
    { key: 'planet', name: BADGE_NAMES.planet, earned: stableN > 0, count: stableN },
    { key: 'pair', name: BADGE_NAMES.pair, earned: state.pairsDone > 0, count: state.pairsDone },
    { key: 'perfect', name: BADGE_NAMES.perfect, earned: state.perfectRaces > 0, count: state.perfectRaces },
    { key: 'streak', name: BADGE_NAMES.streak, earned: state.streakCount > 0, count: state.streakCount },
    { key: 'cert', name: BADGE_NAMES.cert, earned: state.certDays.length >= CERT_DAYS, count: state.certDays.length },
    { key: 'chant36', name: BADGE_NAMES.chant36, earned: state.chant36Days.length > 0, count: state.chant36Days.length },
  ];
}

/** 부모 화면 격자. level 0(좋음)~3(나쁨). */
export function parentGrid(state, view, now) {
  return DANS.map((dan) => ({
    dan,
    cells: Array.from({ length: 9 }, (_, i) => {
      const id = `${dan}x${i + 1}`;
      const s = factStats(state, id, now);
      if (view === 'acc') {
        if (s.acc3 == null) return { id, value: null, level: 0, label: '—' };
        return { id, value: s.acc3, level: 3 - s.acc3, label: `${s.acc3}/3` };
      }
      if (view === 'time') {
        if (s.median3 == null) return { id, value: null, level: 0, label: '—' };
        const level = s.median3 <= MASTER_MS ? 0 : s.median3 <= DAN_MS ? 1 : s.median3 <= MASTER_MAX_MS ? 2 : 3;
        return { id, value: s.median3, level, label: (s.median3 / 1000).toFixed(1) };
      }
      if (s.daysSince == null) return { id, value: null, level: 3, label: '—' };
      const level = s.daysSince <= 1 ? 0 : s.daysSince <= 3 ? 1 : s.daysSince <= MAX_UNSEEN_DAYS ? 2 : 3;
      return { id, value: s.daysSince, level, label: s.daysSince === 0 ? '오늘' : `${s.daysSince}일` };
    }),
  }));
}

export function confusionList(state) {
  return Object.values(state.pairs)
    .map((p) => ({ a: p.a, b: p.b, count: p.count, phase: p.phase }))
    .sort((x, y) => y.count - x.count);
}

// ── 기록 ─────────────────────────────────────────────────────────────────────

function record(state, id, { ms, ok, fixed }, now) {
  const day = dayKey(now);
  const f = state.facts[id];
  f.hist.push({ day, ms: Math.max(0, Math.round(ms)), ok: !!ok, fixed: !!fixed });
  if (f.hist.length > HIST_N) f.hist.splice(0, f.hist.length - HIST_N);
  // 간격은 하루에 한 번만 늘린다 — 한 세션에서 여러 번 맞혔다고 두 배씩 뛰면 안 된다.
  if (ok) { if (f.lastDay !== day) f.interval = Math.min(INTERVAL_MAX, f.interval * 2); } else f.interval = 1;
  f.lastDay = day;
  f.seen++;
  state.last = { id, day };
  updatePairs(state, id, day);
  refreshStage(state, now);
}

const pairKey = (x, y) => (x < y ? `${x}|${y}` : `${y}|${x}`);

/** 오답 값이 어느 사실의 답인지 찾아 혼동쌍으로 묶는다. 같은 단, 같은 승수, 그 외 순으로 고른다. */
function registerConfusion(state, id, value) {
  const me = fact(id);
  const cands = FACT_IDS.filter((o) => o !== id && fact(o).ans === value);
  if (!cands.length) return null;
  const other = cands.find((o) => fact(o).a === me.a) ?? cands.find((o) => fact(o).b === me.b) ?? cands[0];
  const key = pairKey(id, other);
  const p = state.pairs[key] ?? (state.pairs[key] = { a: key.split('|')[0], b: key.split('|')[1], count: 0, phase: 'apart', reverted: false, okDays: [] });
  p.count++;
  // 대비 세트에서 다시 틀리면 한 번만 분리로 되돌린다.
  if (p.phase === 'contrast' && !p.reverted) { p.phase = 'apart'; p.reverted = true; p.okDays = []; }
  return key;
}

/** id를 포함한 쌍들의 진행: 오늘 두 사실이 모두 정확하고 빠르면 okDays에 오늘을 더하고, 이틀이면 다음 단계로. */
function updatePairs(state, id, day) {
  for (const p of Object.values(state.pairs)) {
    if (p.phase === 'done' || (p.a !== id && p.b !== id)) continue;
    const good = [p.a, p.b].every((x) => {
      const f = state.facts[x];
      const last = f.hist[f.hist.length - 1];
      const s = factStats(state, x);
      return last && last.ok && last.day === day && s.median3 != null && s.median3 <= MASTER_MS;
    });
    if (!good || p.okDays.includes(day)) continue;
    p.okDays.push(day);
    if (p.okDays.length >= PAIR_OK_DAYS) {
      if (p.phase === 'apart') { p.phase = 'contrast'; p.okDays = []; }
      else if (p.phase === 'contrast') { p.phase = 'done'; state.pairsDone++; }
    }
  }
}

// ── 세션 (진단 / 연료 채우기) ───────────────────────────────────────────────────

function priorityOf(state, id, now) {
  const s = factStats(state, id, now);
  if (s.seen === 0) return 50000;
  let p = 0;
  if (s.acc3 == null) p += 20000; // 아직 3회가 안 됨
  else if (s.acc3 < 3) p += (3 - s.acc3) * 10000;
  if (s.median3 != null && s.median3 > MASTER_MS) p += s.median3 - MASTER_MS;
  if (s.daysSince != null && s.daysSince >= MAX_UNSEEN_DAYS) p += 5000;
  return p;
}

/** 아이 순서를 그대로 두되 같은 단이 붙지 않게 섞는다(진단용). */
function balancedByDan(ids, rng) {
  const byDan = new Map();
  for (const id of shuffle(ids, rng)) {
    const a = fact(id).a;
    if (!byDan.has(a)) byDan.set(a, []);
    byDan.get(a).push(id);
  }
  const out = [];
  const queues = [...byDan.values()];
  while (out.length < ids.length) {
    for (const q of queues) if (q.length) out.push(q.shift());
  }
  return out;
}

/** 분리 중인 혼동쌍의 상대들. */
function apartPartners(state, id) {
  return Object.values(state.pairs)
    .filter((p) => p.phase === 'apart' && (p.a === id || p.b === id))
    .map((p) => (p.a === id ? p.b : p.a));
}

/** 대비 세트의 상대들. */
function contrastPartners(state, id) {
  return Object.values(state.pairs)
    .filter((p) => p.phase === 'contrast' && (p.a === id || p.b === id))
    .map((p) => (p.a === id ? p.b : p.a));
}

export function buildSession(state, now, rng = Math.random) {
  const base = { pos: 0, correct: 0, answered: 0, done: false, retype: null, counts: {}, ms: 0 };

  if (!allSeen(state)) {
    const unseen = FACT_IDS.filter((id) => state.facts[id].seen === 0);
    let items = balancedByDan(unseen, rng).slice(0, SESSION_SIZE);
    if (items.length < SESSION_SIZE) {
      const seen = shuffle(FACT_IDS.filter((id) => state.facts[id].seen > 0), rng);
      items = items.concat(seen.slice(0, SESSION_SIZE - items.length));
    }
    return { kind: 'diag', items, ...base, rng };
  }

  const chosen = new Set();
  // 분리 중인 혼동쌍은 어느 칸으로도 함께 넣지 않는다 — 집중뿐 아니라 복습·감사도.
  const canTake = (id) => !chosen.has(id) && !apartPartners(state, id).some((o) => chosen.has(o));
  const take = (list, id) => { list.push(id); chosen.add(id); };

  // 0. 강제: 5일 넘게 안 본 사실은 어느 칸보다 먼저 — "굶지 않는다"는 약속이 우선순위 경쟁에 밀리지 않게.
  const focus = [];
  const forced = FACT_IDS
    .map((id) => ({ id, d: factStats(state, id, now).daysSince ?? 0 }))
    .filter((x) => x.d >= MAX_UNSEEN_DAYS)
    .sort((x, y) => y.d - x.d);
  for (const { id } of forced) {
    if (focus.length >= SESSION_SIZE - REVIEW_N) break;
    if (!chosen.has(id)) take(focus, id);
  }

  // 1. 집중: 우선순위가 있는 것. 대비 세트는 상대도 같이 넣는다(연달아 낼 것이므로).
  const ranked = FACT_IDS
    .map((id) => ({ id, p: priorityOf(state, id, now) }))
    .filter((x) => x.p > 0)
    .sort((x, y) => y.p - x.p || (rng() - 0.5));
  for (const { id } of ranked) {
    if (focus.length >= FOCUS_N) break;
    if (!canTake(id)) continue;
    take(focus, id);
    for (const o of contrastPartners(state, id)) if (canTake(o) && focus.length < FOCUS_N + 1) take(focus, o);
  }

  // 2. 간격 복습: 숙달된 것 중 기한이 된 것부터.
  const review = [];
  const due = FACT_IDS
    .filter((id) => canTake(id) && isMastered(state, id))
    .map((id) => { const s = factStats(state, id, now); return { id, r: (s.daysSince ?? 99) / state.facts[id].interval }; })
    .sort((x, y) => y.r - x.r);
  for (const { id } of due) {
    if (review.length >= REVIEW_N) break;
    if (canTake(id)) take(review, id);
  }

  // 3. 무작위 감사와 채우기: 나머지에서. 대비 세트 상대가 집중 칸을 하나 넘겼으면 감사 칸을 그만큼 줄여 24를 지킨다.
  const rest = shuffle(FACT_IDS.filter((id) => canTake(id)), rng);
  const audit = [];
  const auditN = Math.min(AUDIT_N, SESSION_SIZE - focus.length - review.length);
  for (const id of rest) {
    if (audit.length >= auditN) break;
    if (canTake(id)) take(audit, id);
  }
  let items = [...focus, ...review, ...audit];
  for (const id of rest) {
    if (items.length >= SESSION_SIZE) break;
    if (canTake(id)) take(items, id);
  }

  items = shuffle(items, rng);

  // 대비 세트: 둘 다 있으면 붙여 낸다.
  for (const p of Object.values(state.pairs)) {
    if (p.phase !== 'contrast') continue;
    const i = items.indexOf(p.a);
    const j = items.indexOf(p.b);
    if (i < 0 || j < 0 || Math.abs(i - j) === 1) continue;
    items.splice(j, 1);
    items.splice(items.indexOf(p.a) + 1, 0, p.b);
  }

  // 세션이 만든 난수를 세션에 실어 둔다 — 재출제 간격·채움 문제도 같은 시드를 쓰게 해 시뮬레이션이 재현된다.
  return { kind: 'fuel', items, ...base, rng };
}

/** 재출제·건너뛰기용 채움 문제: 최근 MIN_GAP개와 겹치지 않는 사실, 숙달된 것을 우선. */
function fillerFor(state, session, avoid) {
  // 지금 자리 주변뿐 아니라 **목록 끝**의 최근 것도 피한다 — 채움 문제는 끝에 연달아 붙으므로
  // 끝을 안 보면 방금 붙인 채움 문제와 같은 사실을 또 고를 수 있다(시뮬레이션이 잡은 "간격 1").
  const recent = new Set([
    ...session.items.slice(Math.max(0, session.pos - MIN_GAP), session.pos + MIN_GAP + 1),
    ...session.items.slice(-MIN_GAP),
  ]);
  recent.add(avoid);
  const pool = FACT_IDS.filter((id) => !recent.has(id) && (session.counts[id] || 0) < MAX_PER_SESSION);
  const good = pool.filter((id) => isMastered(state, id));
  const from = good.length ? good : pool;
  const r = session.rng ?? Math.random;
  return from[Math.floor(r() * from.length)] ?? null;
}

/** id를 pos 뒤 gap칸에 넣되, 뒤가 모자라면 채움 문제로 간격을 만든다. */
function insertLater(state, session, id, gap) {
  const need = session.pos + 1 + gap;
  while (session.items.length < need) {
    const f = fillerFor(state, session, id);
    if (!f) break;
    session.items.push(f);
  }
  session.items.splice(Math.min(session.items.length, need), 0, id);
}

export function sessionCurrent(session) {
  return session.done ? null : (session.items[session.pos] ?? null);
}

export function sessionAnswer(state, session, { value, ms, fixed }, now) {
  const id = sessionCurrent(session);
  if (!id) return { ok: false, ans: null, requeued: false, done: true };
  const f = fact(id);
  const ok = Number(value) === f.ans;
  record(state, id, { ms, ok, fixed }, now);
  session.counts[id] = (session.counts[id] || 0) + 1;
  session.answered++;
  session.ms += ms;
  if (ok) session.correct++;

  let requeued = false;
  if (!ok) {
    registerConfusion(state, id, Number(value));
    session.retype = id;
    if (session.counts[id] < MAX_PER_SESSION) {
      const r = session.rng ?? Math.random;
      const gap = REQUEUE_MIN + Math.floor(r() * (REQUEUE_MAX - REQUEUE_MIN + 1));
      insertLater(state, session, id, gap);
      requeued = true;
    }
  }
  session.pos++;
  if (session.pos >= session.items.length) {
    session.done = true;
    const day = dayKey(now);
    state.sessions.push({ day, kind: session.kind, correct: session.correct, total: session.answered, ms: session.ms });
    if (state.sessions.length > 60) state.sessions.splice(0, state.sessions.length - 60);
    if (session.kind === 'diag' && !state.diagDays.includes(day)) state.diagDays.push(day);
    touchMission(state, now).fuel = true;
    settleMission(state, now);
  }
  return { ok, ans: f.ans, requeued, done: session.done };
}

export function sessionRetyped(session) {
  session.retype = null;
}

/** 화면이 숨겨졌을 때: 지금 문제를 빼고 같은 사실을 뒤에 다시 넣는다. 기록은 남기지 않는다. */
export function sessionSkip(state, session) {
  const id = sessionCurrent(session);
  if (!id) return;
  session.items.splice(session.pos, 1);
  session.pos--; // insertLater는 "지금 자리 뒤"를 기준으로 세므로 한 칸 물러 세운다
  insertLater(state, session, id, REQUEUE_MIN - 1);
  session.pos++;
}

// ── 레이스 ───────────────────────────────────────────────────────────────────

export function raceSets(state) {
  const no = stage(state).no;
  const sets = DANS.map((d) => ({ key: `dan-${d}`, name: `${d}단 거꾸로`, count: 9, available: true }));
  for (let d = 2; d <= 8; d++) {
    sets.push({ key: `two-${d}-${d + 1}`, name: `${d}단과 ${d + 1}단`, count: 18, available: no >= 2 || (danStable(state, d) && danStable(state, d + 1)) });
  }
  sets.push({ key: 'all-random', name: '전체 무작위', count: 72, available: no >= 2 });
  sets.push({ key: 'all-backward', name: '전체 거꾸로', count: 72, available: no >= 3 });
  return sets;
}

export function buildRace(state, key, rng = Math.random) {
  const set = raceSets(state).find((s) => s.key === key);
  if (!set) throw new Error(`모르는 세트: ${key}`);
  let items;
  if (key.startsWith('dan-')) {
    const d = Number(key.slice(4));
    items = Array.from({ length: 9 }, (_, i) => `${d}x${9 - i}`);
  } else if (key.startsWith('two-')) {
    const [d1, d2] = key.slice(4).split('-').map(Number);
    items = shuffle(FACT_IDS.filter((id) => fact(id).a === d1 || fact(id).a === d2), rng);
  } else if (key === 'all-random') {
    items = shuffle(FACT_IDS, rng);
  } else {
    items = BACKWARD_ORDER.slice();
  }
  return { key, name: set.name, items, pos: 0, correct: 0, wrong: 0 };
}

export function raceAnswer(state, race, { value, ms, fixed }, now) {
  const id = race.items[race.pos];
  if (id == null) return { ok: false, ans: null, done: true };
  const f = fact(id);
  const ok = Number(value) === f.ans;
  record(state, id, { ms, ok, fixed }, now);
  if (ok) race.correct++; else { race.wrong++; registerConfusion(state, id, Number(value)); }
  race.pos++;
  return { ok, ans: f.ans, done: race.pos >= race.items.length };
}

export function ghostMs(state, key) {
  const runs = (state.races[key] ?? []).slice(-GHOST_N);
  if (runs.length < 2) return null;
  return median(runs.map((r) => r.ms));
}

export function raceFinish(state, race, totalMs, now) {
  const total = race.correct + race.wrong;
  const accuracy = total ? race.correct / total : 0;
  const stable = accuracy >= RACE_STABLE;
  const perfect = total > 0 && race.wrong === 0;
  const ghost = ghostMs(state, race.key);
  const prev = state.races[race.key] ?? (state.races[race.key] = []);
  const isBest = prev.length > 0 && totalMs < Math.min(...prev.map((r) => r.ms));
  prev.push({ day: dayKey(now), ms: Math.round(totalMs), correct: race.correct, total });
  if (prev.length > 10) prev.splice(0, prev.length - 10);
  if (perfect) state.perfectRaces++;
  touchMission(state, now).race = true;
  settleMission(state, now);
  return { accuracy, stable, perfect, ghostMs: ghost, isBest };
}

// ── 구두 카드 ─────────────────────────────────────────────────────────────────

export function buildOral(state, rng = Math.random) {
  const ranked = FACT_IDS
    .map((id) => ({ id, p: priorityOf(state, id) }))
    .sort((x, y) => y.p - x.p || (rng() - 0.5));
  const weak = ranked.filter((x) => x.p > 0).slice(0, ORAL_WEAK_N).map((x) => x.id);
  const rest = shuffle(FACT_IDS.filter((id) => !weak.includes(id)), rng);
  return shuffle([...weak, ...rest.slice(0, ORAL_N - weak.length)], rng);
}

export function recordOral(state, results, now) {
  const day = dayKey(now);
  state.oralLog.push({ day, total: results.length, wrong: results.filter((r) => !r.ok).map((r) => r.id) });
  if (state.oralLog.length > 30) state.oralLog.splice(0, state.oralLog.length - 30);
  if (results.length >= ORAL_N) { touchMission(state, now).oral = true; settleMission(state, now); }
}

// ── 거꾸로 암송 ───────────────────────────────────────────────────────────────

export function recordChant(state, { mode, ms, errors = 0, misses = 0 }, now) {
  const day = dayKey(now);
  const passed = mode === 'measure' && ms <= CHANT_PASS_MS && errors === 0 && misses === 0;
  if (mode === 'measure') {
    state.chantLog.push({ day, ms: Math.round(ms), errors, misses });
    if (state.chantLog.length > 30) state.chantLog.splice(0, state.chantLog.length - 30);
    if (errors === 0 && misses === 0 && (state.chantBest == null || ms < state.chantBest)) state.chantBest = Math.round(ms);
    if (passed && !state.chant36Days.includes(day)) state.chant36Days.push(day);
  }
  return { passed };
}

// ── 구두 인증 ─────────────────────────────────────────────────────────────────

export function buildCertification(rng = Math.random) {
  return shuffle(FACT_IDS, rng);
}

export function recordCertification(state, { errors = 0, misses = 0, corrections = 0 }, now) {
  const day = dayKey(now);
  const passed = errors === 0 && misses === 0 && corrections <= CERT_CORRECTIONS;
  state.certLog.push({ day, errors, misses, corrections, passed });
  if (state.certLog.length > 30) state.certLog.splice(0, state.certLog.length - 30);
  if (passed && !state.certDays.includes(day)) state.certDays.push(day);
  refreshStage(state, now);
  return { passed, certified: state.certDays.length >= CERT_DAYS };
}

// ── 오늘의 임무 · 용돈 ───────────────────────────────────────────────────────

function touchMission(state, now) {
  const day = dayKey(now);
  if (state.mission.day !== day) state.mission = { day, fuel: false, race: false, oral: false, paid: false };
  return state.mission;
}

/** 세 가지가 다 되면 하루 한 번 30원. 연속 사흘이면 배지 카운트. */
function settleMission(state, now) {
  const m = touchMission(state, now);
  if (!(m.fuel && m.race && m.oral) || m.paid) return;
  m.paid = true;
  state.allowance.coins += ALLOWANCE;
  state.allowance.total += ALLOWANCE;
  if (!state.missionDays.includes(m.day)) state.missionDays.push(m.day);
  if (state.missionDays.length > 400) state.missionDays.splice(0, state.missionDays.length - 400);
  const has = (k) => state.missionDays.includes(k);
  const prev = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); return dayKey(d.getTime()); };
  if (Array.from({ length: STREAK_DAYS - 1 }, (_, i) => prev(i + 1)).every(has)) state.streakCount++;
}

export function mission(state, now) {
  const m = touchMission(state, now);
  settleMission(state, now);
  return { fuel: m.fuel, race: m.race, oral: m.oral, done: m.fuel && m.race && m.oral, paid: m.paid, coins: state.allowance.coins };
}

export function payout(state) {
  state.allowance.coins = 0;
}

// ── 운영 ─────────────────────────────────────────────────────────────────────

export function invalidateLast(state) {
  const l = state.last;
  if (!l) return false;
  const f = state.facts[l.id];
  const i = f.hist.length - 1;
  if (i < 0 || f.hist[i].day !== l.day) return false;
  f.hist.splice(i, 1);
  f.seen = Math.max(0, f.seen - 1);
  state.last = null;
  return true;
}

/** 학습 상태만 초기화. 용돈·배지 카운트·인증·암송 기록은 남긴다. */
export function resetEngine(state) {
  const fresh = newState();
  state.facts = fresh.facts;
  state.pairs = {};
  state.diagDays = [];
  state.sessions = [];
  state.races = {};
  state.stage2Days = [];
  state.stageReached = 0;
  state.last = null;
}

export function exportState(state) {
  return JSON.stringify(state);
}

export function importState(text) {
  const raw = JSON.parse(text);
  if (!raw || raw.v !== 1 || typeof raw.facts !== 'object') throw new Error('구구단 로켓 기록이 아니다');
  const s = { ...newState(), ...raw };
  s.facts = { ...newState().facts };
  for (const id of FACT_IDS) {
    const f = raw.facts[id];
    if (f && Array.isArray(f.hist)) s.facts[id] = { hist: f.hist.slice(-HIST_N), lastDay: f.lastDay ?? null, interval: f.interval || 1, seen: f.seen || 0 };
  }
  s.settings = { ...newState().settings, ...(raw.settings || {}) };
  s.allowance = { ...newState().allowance, ...(raw.allowance || {}) };
  s.mission = { ...newState().mission, ...(raw.mission || {}) };
  return s;
}
