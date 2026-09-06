/**
 * 구구단 로켓 — 화면 흐름 총괄.
 *
 * 규칙은 전부 engine.js에 있고 여기서는 **부르고 그린다**. 이 파일이 판정을 흉내 내기 시작하면
 * "화면에선 맞았는데 기록은 틀렸다"가 생긴다(오목에서 겪은 것과 같은 종류의 결함이다).
 *
 * 자동화(생각 없이 답이 나오는 상태)는 문제 하나 2초 안팎의 밀도에서만 생긴다.
 * 그래서 **문제 사이에 연출을 넣지 않는다** — 정답 0.3초 밝힘, 오답 1.2초 정답 표시. 그게 전부다.
 */

import * as engine from './engine.js';
import * as store from './store.js';
import * as ui from './ui.js';
import * as audio from './audio.js';

/** 정답을 알리는 시간. 이보다 길면 24문제 세션에 몇십 초가 그냥 붙는다. */
const GOOD_MS = 300;
/** 오답일 때 정답을 보여주는 시간. 아이가 읽고 그대로 따라 칠 만큼만. */
const SHOW_MS = 1200;
/**
 * 부모 화면 관문의 답(17 × 23). 숫자숲·곱셈 바다와 **같은 문제**를 쓴다 —
 * 부모가 답 하나만 외우면 네 게임 어디서나 통한다.
 * 아홉 살에게는 두 자리 × 두 자리라 구구단 훈련만으로는 풀리지 않는다.
 */
const GATE_ANSWER = 391;
/** 두 번 눌러 확인하는 버튼이 다시 잠기기까지. */
const ARM_MS = 3000;
/** 암송 연습에서 답을 비추기 시작하는 지점(박자 대비). 먼저 스스로 말할 틈을 준다. */
const CHANT_REVEAL = 0.55;

const now = () => Date.now();
const seed = () => (Math.random() * 0x7fffffff) | 0;
const rng = () => engine.makeRng(seed());
const persist = () => store.save(store.get());

// ── 진행 중인 것들 ───────────────────────────────────────────────────────────

/** 연료 채우기·진단 세션 */
let session = null;
/** 레이스 */
let race = null;
let raceClock = null;   // { t0, hiddenAt, hidden }  숨어 있던 시간은 빼고 잰다
let raceRaf = 0;
let lastRaceKey = null;
/** 구두 카드 */
let oral = null;
/** 암송 */
let chant = null;
let chantRaf = 0;
/** 구두 인증 */
let cert = null;

/** 숫자판이 받고 있는 문제. phase: ask(처음) → show(정답 보여주는 중) → retype(다시 입력) */
let quiz = null;

/** 부모 화면 상태 */
let parentView = 'time';
let practiceOn = false;
/** 결과 카드의 '한 번 더'가 무엇을 다시 하는가 */
let againFn = null;

// ── 표시용 잔손질 ────────────────────────────────────────────────────────────

const problemText = (id) => {
  const f = engine.fact(id);
  return `${f.a} × ${f.b}`;
};

/** 레이스 총시간·암송 시간처럼 **한 판 전체**의 길이를 사람 말로. 문제 하나의 초는 아이에게 안 보인다. */
function fmtSpan(ms) {
  if (ms == null) return '–';
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}초`;
  return `${Math.floor(s / 60)}분 ${Math.round(s % 60)}초`;
}

// ── 홈 ───────────────────────────────────────────────────────────────────────

function renderHome() {
  const s = store.get();
  const t = now();
  // mission()은 날짜가 바뀌면 상태를 손보고 임무를 다 했으면 용돈을 넣는다 — 부른 뒤에는 저장한다.
  const m = engine.mission(s, t);
  persist();
  ui.setToday(new Date(t));
  ui.setMission(engine.stage(s, t), m);
  ui.setPlanets(engine.planets(s));
  ui.setBadges(engine.badges(s));
}

function goHome() {
  stopRace();
  stopChant();
  session = null;
  oral = null;
  cert = null;
  quiz = null;
  againFn = null;
  ui.hideDone();
  renderHome();
  ui.setScreen('home');
}

// ── 숫자판 (연료 채우기 · 레이스 공용) ───────────────────────────────────────

/**
 * 새 문제를 화면에 올린다. `ms`는 **여기서부터** 마지막 숫자 키까지를 잰다.
 * @param {'fuel'|'race'} kind
 */
function ask(kind, id) {
  quiz = {
    kind,
    id,
    ans: engine.fact(id).ans,
    input: '',
    shownAt: performance.now(),
    lastKeyAt: 0,
    fixed: false,
    phase: 'ask',
  };
  ui.setProblem(kind, problemText(id));
  ui.setAnswer(kind, '', '');
  ui.setHint(kind, '숫자를 누르면 바로 넘어가요');
}

/**
 * 숫자판. **자릿수가 차면 바로 제출한다** — 확정 키가 없다.
 * 처음엔 확정 키 방식이었는데(답의 자릿수가 새고 첫 숫자 오타를 못 고친다는 이유), 실제로 써 보니
 * 매 문제마다 탭이 하나 더 붙어 리듬을 깼다(사용자 지시, 2026-09-02). 한 자리 답은 72개 중 14개뿐이고
 * 전부 ×1·2×2·2×3 같은 쉬운 것이라 자릿수가 새는 것은 배움에 영향이 없다. 두 자리 답은 첫 숫자를
 * 지우기로 고칠 수 있다. 오타는 오답으로 기록되고 재출제된다 — 그 비용보다 밀도가 더 크다.
 */
function onKey(k) {
  if (!quiz) return;
  // 정답을 보여주는 1.2초와 넘어가는 0.3초 동안의 입력은 무시한다.
  if (quiz.phase === 'show' || quiz.phase === 'lock') return;

  if (k === 'del') {
    if (!quiz.input) return;
    quiz.input = quiz.input.slice(0, -1);
    // 지우기를 썼으면 '고쳐 쓴 답'이다 — 엔진이 유창성 판정에서 걸러 쓴다.
    quiz.fixed = true;
    ui.setAnswer(quiz.kind, quiz.input, '');
    return;
  }
  if (!/^\d$/.test(k)) return; // 숫자 말고는 받지 않는다(옛 확정 키·Enter 포함)

  // 첫 키가 정답의 첫 자리와 다르면 헤맨 것으로 본다(고쳐서 맞혀도 자동화된 답은 아니다).
  if (quiz.phase === 'ask' && quiz.input === '' && k !== String(quiz.ans)[0]) quiz.fixed = true;

  quiz.input += k;
  quiz.lastKeyAt = performance.now();
  ui.setAnswer(quiz.kind, quiz.input, '');
  if (quiz.input.length >= String(quiz.ans).length) submit();
}

function submit() {
  if (!quiz || !quiz.input) return; // 빈 입력은 무시한다
  const value = Number(quiz.input);

  // 오답 뒤 다시 치는 중 — 기록하지 않는다. 맞게 칠 때까지 다음으로 안 간다.
  if (quiz.phase === 'retype') {
    if (value !== quiz.ans) {
      quiz.input = '';
      ui.setAnswer(quiz.kind, '', 'bad');
      setTimeout(() => { if (quiz && quiz.phase === 'retype') ui.setAnswer(quiz.kind, '', ''); }, 200);
      return;
    }
    audio.stone();
    quiz.phase = 'lock';
    ui.setAnswer(quiz.kind, quiz.input, 'good');
    ui.setHint(quiz.kind, '');
    engine.sessionRetyped(session);
    persist();
    setTimeout(nextFuel, GOOD_MS);
    return;
  }

  const ms = Math.max(0, (quiz.lastKeyAt || performance.now()) - quiz.shownAt);
  const payload = { value, ms, fixed: quiz.fixed };
  quiz.phase = 'lock';

  if (quiz.kind === 'fuel') {
    const r = engine.sessionAnswer(store.get(), session, payload, now());
    persist();
    ui.setFuelProgress(session.pos, session.items.length);
    if (r.ok) {
      audio.stone();
      ui.setAnswer('fuel', quiz.input, 'good');
      setTimeout(nextFuel, GOOD_MS);
    } else {
      // 정답을 보여주고, 아이가 **그대로 다시 쳐야** 넘어간다. 보고 지나가는 것과 손으로 치는 것은 다르다.
      ui.setAnswer('fuel', String(r.ans), 'bad');
      ui.setHint('fuel', '정답을 그대로 눌러 볼까요?');
      quiz.phase = 'show';
      setTimeout(() => {
        if (!quiz || quiz.phase !== 'show') return;
        quiz.phase = 'retype';
        quiz.input = '';
        ui.setAnswer('fuel', '', '');
      }, SHOW_MS);
    }
    return;
  }

  // 레이스는 재입력이 없다 — 달리는 중이라 멈추면 기록의 뜻이 달라진다.
  const r = engine.raceAnswer(store.get(), race, payload, now());
  persist();
  renderRace();
  if (r.ok) {
    audio.stone();
    ui.setAnswer('race', quiz.input, 'good');
    setTimeout(nextRace, GOOD_MS);
  } else {
    ui.setAnswer('race', String(r.ans), 'bad');
    setTimeout(nextRace, SHOW_MS);
  }
}

// ── 연료 채우기 ──────────────────────────────────────────────────────────────

function startFuel() {
  session = engine.buildSession(store.get(), now(), rng());
  persist();
  quiz = null;
  ui.hideDone();
  ui.setScreen('fuel');
  ui.setFuelProgress(0, session.items.length);
  nextFuel();
}

function nextFuel() {
  if (!session) return;
  const id = engine.sessionCurrent(session);
  if (id == null) { finishFuel(); return; }
  ui.setFuelProgress(session.pos, session.items.length);
  ask('fuel', id);
}

function finishFuel() {
  const s = store.get();
  const total = session.answered;
  const correct = session.correct;
  const kind = session.kind;
  /* 한 판 전체의 시간만 보여준다. 문제 하나의 초는 아이에게 안 보인다(위 fmtSpan의 원칙).
     견주는 상대는 고정된 50초가 아니라 내 최근 기록이다 — 레이스의 유령과 같다.
     세션을 비우기 전에 꺼내 둔다. */
  const ms = session.ms;
  const ghost = session.ghostMs;
  const isBest = session.isBest;
  const goalMet = session.goalMet;
  const m = engine.mission(s, now());
  persist();
  quiz = null;
  session = null;
  againFn = startFuel;
  audio.win();
  const rows = [
    ['맞은 문제', `${correct} / ${total}`],
    ['이번 판 시간', fmtSpan(ms)],
  ];
  /* 기록이 두 판 미만이면 견줄 상대가 없다. 그때만 목표를 대신 보여준다 —
     견줄 것이 아무것도 없는 화면은 시간을 보여주는 의미가 없다. */
  if (ghost != null) rows.push(['최근 기록', fmtSpan(ghost)]);
  else rows.push(['목표', `${engine.FUEL_GOAL_MS / 1000}초`]);
  rows.push(['오늘의 임무', `${[m.fuel, m.race, m.oral].filter(Boolean).length} / 3`]);
  rows.push(['저금통', `${m.coins}원`]);
  let kicker;
  if (goalMet) kicker = '연료 50초 배지!';
  else if (isBest) kicker = '내 최고 기록!';
  else if (ghost != null && ms < ghost) kicker = '지난번보다 빨라졌어!';
  else kicker = kind === 'diag' ? '진단' : '연료 채우기 끝';
  ui.showDone({
    kicker,
    title: correct === total ? '연료 가득!' : '연료를 채웠어요',
    rows,
    again: '한 번 더',
  });
}

// ── 로켓 레이스 ──────────────────────────────────────────────────────────────

function openRacePick() {
  const s = store.get();
  ui.setRaceSets(engine.raceSets(s).map((set) => {
    const g = engine.ghostMs(s, set.key);
    return { ...set, ghost: g == null ? null : fmtSpan(g) };
  }));
  ui.setScreen('race-pick');
}

function startRace(key) {
  race = engine.buildRace(store.get(), key, rng());
  lastRaceKey = key;
  raceClock = { t0: performance.now(), hidden: 0, hiddenAt: 0 };
  quiz = null;
  ui.hideDone();
  ui.setScreen('race');

  const g = store.get().settings.ghost ? engine.ghostMs(store.get(), key) : null;
  ui.setGhostLabel(g == null ? '' : `유령 로켓 · 최근 ${fmtSpan(g)}`);
  renderRace();
  nextRace();
  startRaceLoop();
}

function raceElapsed() {
  if (!raceClock) return 0;
  const paused = raceClock.hiddenAt ? performance.now() - raceClock.hiddenAt : 0;
  return performance.now() - raceClock.t0 - raceClock.hidden - paused;
}

/** 내 로켓은 정답 수에, 유령은 흐른 시간에 따라 움직인다. */
function renderRace() {
  if (!race) return;
  const total = race.items.length;
  ui.setRaceHead(race.name, race.pos, total);
  const s = store.get();
  const g = s.settings.ghost ? engine.ghostMs(s, race.key) : null;
  ui.setRockets(total ? race.correct / total : 0, g ? raceElapsed() / g : null);
}

function startRaceLoop() {
  stopRaceLoop();
  const step = () => {
    if (!race) return;
    renderRace();
    raceRaf = requestAnimationFrame(step);
  };
  raceRaf = requestAnimationFrame(step);
}
function stopRaceLoop() { if (raceRaf) cancelAnimationFrame(raceRaf); raceRaf = 0; }

function stopRace() {
  stopRaceLoop();
  race = null;
  raceClock = null;
}

function nextRace() {
  if (!race) return;
  if (race.pos >= race.items.length) { finishRace(); return; }
  renderRace();
  ask('race', race.items[race.pos]);
}

function finishRace() {
  const totalMs = raceElapsed();
  const r = engine.raceFinish(store.get(), race, totalMs, now());
  persist();
  stopRaceLoop();
  quiz = null;
  const perfect = r.perfect;
  ui.setRaceResult({
    kicker: r.isBest ? '내 최고 기록!' : '레이스 끝',
    title: perfect ? '완벽 항로!' : r.stable ? '항로 안정' : '조금 흔들렸어요',
    accuracy: `정확도 ${Math.round(r.accuracy * 100)}% · ${race.correct} / ${race.items.length}`,
    today: fmtSpan(totalMs),
    ghost: r.ghostMs == null ? '기록 없음' : fmtSpan(r.ghostMs),
  });
  race = null;
  raceClock = null;
  if (perfect || r.stable) audio.win(); else audio.lose();
  ui.setScreen('race-result');
}

// ── 구두 카드 ────────────────────────────────────────────────────────────────

function startOral() {
  oral = { items: engine.buildOral(store.get(), rng()), pos: 0, results: [] };
  ui.hideDone();
  ui.setScreen('oral');
  renderOral();
}

function renderOral() {
  if (!oral) return;
  ui.setOral(oral.pos, oral.items.length, problemText(oral.items[oral.pos]));
  ui.setOralRevealed(null);
}

function answerOral(ok) {
  if (!oral) return;
  oral.results.push({ id: oral.items[oral.pos], ok });
  if (ok) audio.stone(); else audio.nope();
  oral.pos++;
  if (oral.pos >= oral.items.length) { finishOral(); return; }
  renderOral();
}

function finishOral() {
  const results = oral.results;
  engine.recordOral(store.get(), results, now());
  const m = engine.mission(store.get(), now());
  persist();
  ui.setOral(results.length, results.length, '완료');
  oral = null;
  againFn = startOral;
  audio.win();
  ui.showDone({
    kicker: '구두 카드 끝',
    title: '목소리로 항로를 열었어요',
    rows: [
      ['맞은 카드', `${results.filter((r) => r.ok).length} / ${results.length}`],
      ['오늘의 임무', `${[m.fuel, m.race, m.oral].filter(Boolean).length} / 3`],
      ['저금통', `${m.coins}원`],
    ],
    again: '한 번 더',
  });
}

// ── 거꾸로 암송 ──────────────────────────────────────────────────────────────

function openChant() {
  const s = store.get();
  stopChant();
  ui.setChantPaces(engine.CHANT_PACES, s.settings.chantPace);
  ui.setChantBest(s.chantBest == null
    ? '아직 측정 기록이 없어요. 목표는 36초!'
    : `내 최고 기록 ${fmtSpan(s.chantBest)} · 목표 36초`);
  ui.setChantMode(null);
  ui.setChantStep(0, engine.BACKWARD_ORDER.length, '· × ·', null);
  ui.hideDone();
  ui.setScreen('chant');
}

function pickPace(p) {
  const s = store.get();
  s.settings.chantPace = p;
  persist();
  ui.setChantPaces(engine.CHANT_PACES, p);
}

function startChantPractice() {
  const pace = store.get().settings.chantPace || engine.CHANT_PACES[0];
  const total = engine.BACKWARD_ORDER.length;
  chant = {
    mode: 'practice',
    pace,
    beat: (pace * 1000) / total,
    t0: performance.now(),
    offset: 0,
    pausedAt: 0,
    i: -1,
    revealed: false,
    errors: 0,
    misses: 0,
  };
  ui.setChantMode('practice');
  ui.setChantPaused(false);
  ui.setChantStep(0, total, '준비!', null);
  chantLoop();
}

function chantLoop() {
  stopChantLoop();
  const total = engine.BACKWARD_ORDER.length;
  const step = () => {
    if (!chant || chant.mode !== 'practice') return;
    if (chant.pausedAt) { chantRaf = requestAnimationFrame(step); return; }

    const t = performance.now() - chant.t0 - chant.offset;
    const i = Math.floor(t / chant.beat);
    if (i >= total) { finishChant(); return; }

    const within = (t % chant.beat) / chant.beat;
    const reveal = within >= CHANT_REVEAL;
    // 매 프레임 DOM을 건드리지 않는다 — 바뀔 때만 그린다.
    if (i !== chant.i || reveal !== chant.revealed) {
      chant.i = i;
      chant.revealed = reveal;
      const id = engine.BACKWARD_ORDER[i];
      ui.setChantStep(i + 1, total, problemText(id), reveal ? engine.fact(id).ans : null);
    }
    chantRaf = requestAnimationFrame(step);
  };
  chantRaf = requestAnimationFrame(step);
}
function stopChantLoop() { if (chantRaf) cancelAnimationFrame(chantRaf); chantRaf = 0; }

function toggleChant() {
  if (!chant || chant.mode !== 'practice') return;
  if (chant.pausedAt) {
    chant.offset += performance.now() - chant.pausedAt;
    chant.pausedAt = 0;
    ui.setChantPaused(false);
  } else {
    chant.pausedAt = performance.now();
    ui.setChantPaused(true);
  }
}

function startChantMeasure() {
  chant = { mode: 'measure', t0: performance.now(), errors: 0, misses: 0 };
  ui.setChantMode('measure');
  ui.setChantCounts(0, 0);
  ui.setChantStep(0, engine.BACKWARD_ORDER.length, null, null);
}

function bumpChant(field) {
  if (!chant || chant.mode !== 'measure') return;
  chant[field]++;
  ui.setChantCounts(chant.errors, chant.misses);
}

function finishChant() {
  if (!chant) return;
  stopChantLoop();
  const c = chant;
  chant = null;
  const ms = c.mode === 'practice' ? c.pace * 1000 : performance.now() - c.t0;
  const r = engine.recordChant(store.get(), { mode: c.mode, ms, errors: c.errors, misses: c.misses }, now());
  persist();
  againFn = c.mode === 'practice' ? startChantPractice : startChantMeasure;
  // 결과 카드를 띄우기 **전에** 화면을 고르기 상태로 돌린다 — openChant()가 결과 카드를 닫는다.
  openChant();

  if (c.mode === 'practice') {
    // 정지를 눌러 중간에 끝냈으면 "끝까지"라고 하지 않는다 — 실측에서 2초 만에 멈춰도 완주로 적히던 것을 고쳤다.
    const total = engine.BACKWARD_ORDER.length;
    const reached = Math.min(total, (c.i ?? -1) + 1);
    const complete = reached >= total;
    if (complete) audio.win(); else audio.stone();
    ui.showDone({
      kicker: '거꾸로 암송 · 연습',
      title: complete ? `${c.pace}초 박자로 끝까지!` : `${reached} / ${total} 까지 연습했어요`,
      rows: complete ? [['다음 목표', `${nextPace(c.pace)}초 박자`]] : [['박자', `${c.pace}초`]],
      again: '한 번 더',
    });
    return;
  }

  if (r.passed) audio.win(); else audio.lose();
  ui.showDone({
    kicker: '거꾸로 암송 · 측정',
    title: r.passed ? '36초 통과!' : '오늘 기록',
    big: fmtSpan(ms),
    rows: [['틀림', `${c.errors}`], ['놓침', `${c.misses}`]],
    again: '다시 측정',
  });
}

/** 다음 박자는 한 칸 더 빠른 것. 이미 가장 빠르면 그대로. */
function nextPace(p) {
  const i = engine.CHANT_PACES.indexOf(p);
  return engine.CHANT_PACES[Math.min(engine.CHANT_PACES.length - 1, i + 1)];
}

function stopChant() {
  stopChantLoop();
  chant = null;
  ui.setChantMode(null);
}

// ── 구두 인증 ────────────────────────────────────────────────────────────────

function startCert() {
  cert = { items: engine.buildCertification(rng()), pos: 0, errors: 0, misses: 0, corrections: 0 };
  ui.hideDone();
  ui.setScreen('cert');
  renderCert();
}

function renderCert() {
  if (!cert) return;
  ui.setCert(cert.pos, cert.items.length, problemText(cert.items[cert.pos]), cert.errors, cert.corrections, cert.misses);
}

function markCert(field) {
  if (!cert) return;
  if (field) cert[field]++;
  cert.pos++;
  if (cert.pos >= cert.items.length) { finishCert(); return; }
  renderCert();
}

function finishCert() {
  const c = cert;
  cert = null;
  const r = engine.recordCertification(store.get(),
    { errors: c.errors, misses: c.misses, corrections: c.corrections }, now());
  persist();
  againFn = null;
  if (r.passed) audio.win(); else audio.lose();
  ui.showDone({
    kicker: '구두 인증',
    title: r.certified ? '구두 인증 완료!' : r.passed ? '오늘 인증 통과' : '다음에 다시 해요',
    rows: [
      ['틀림', `${c.errors}`],
      ['못 함', `${c.misses}`],
      ['수정', `${c.corrections} / ${engine.CERT_CORRECTIONS}`],
      ['통과한 날', `${store.get().certDays.length} / ${engine.CERT_DAYS}`],
    ],
    again: null,
  });
}

// ── 부모 관제실 ──────────────────────────────────────────────────────────────

const VIEW_NOTE = {
  acc: '최근 3회 중 맞은 횟수입니다. 진한 칸이 다음 연습에 더 자주 포함됩니다.',
  time: '답 전체 입력 시간(최근 3회 중간값, 초)입니다. 진한 칸이 느린 사실입니다.',
  last: '마지막으로 나온 지 며칠 지났는지입니다. 5일이 넘지 않게 엔진이 채워 넣습니다.',
};

/** 홈에서 들어가는 입구. 언제나 관문부터다 — 통과해야 renderParent가 돈다. */
function openParent() {
  ui.hideDone();
  ui.lockParent();
  ui.setScreen('parent');
}

/** 인증 화면에서 관제실로 돌아오기. 이미 통과한 뒤이므로 관문을 다시 세우지 않는다. */
function backToParent() {
  ui.unlockParent();
  renderParent();
  ui.setScreen('parent');
}

function renderParent() {
  const s = store.get();
  const t = now();
  ui.setParentView(parentView);
  ui.setMatrix(engine.parentGrid(s, parentView, t), VIEW_NOTE[parentView]);
  ui.setConfusions(engine.confusionList(s));

  const days = s.certDays;
  ui.setCertStatus(days.length
    ? `통과한 날 ${days.length} / ${engine.CERT_DAYS} · 마지막 ${days[days.length - 1]}`
    : '아직 인증하지 않았어요');

  const m = engine.mission(s, t);
  persist();
  ui.setCoins(`${m.coins}원 · 지금까지 모두 ${s.allowance.total}원`);
  ui.setPracticeState(practiceOn);
  ui.setGhostState(!!s.settings.ghost);
}

/** 두 번 눌러 확인. 숫자숲의 '용돈 지급 완료'와 같은 방식이다. */
function makeArmed(setLabel, idle, armedLabel, run) {
  let armed = false;
  let timer = 0;
  return () => {
    if (!armed) {
      armed = true;
      setLabel(armedLabel);
      timer = setTimeout(() => { armed = false; setLabel(idle); }, ARM_MS);
      return;
    }
    clearTimeout(timer);
    armed = false;
    setLabel(idle);
    run();
  };
}

const doPayout = makeArmed(ui.setPayoutLabel, '용돈 지급 완료', '정말요? 한 번 더!', () => {
  engine.payout(store.get());
  persist();
  renderParent();
});

const doReset = makeArmed(ui.setResetLabel, '엔진 초기화', '정말 지울까요? 한 번 더', () => {
  engine.resetEngine(store.get());
  persist();
  renderParent();
  ui.toast('학습 기록을 초기화했습니다');
});

// ── 화면이 숨겨졌을 때 ───────────────────────────────────────────────────────

/**
 * 홈 화면에 갔다 오거나 전화를 받으면 그 사이 시간이 답 시간에 그대로 들어간다.
 * 그 문제는 **버리고 새 문제를 낸다** — 안 그러면 "느린 사실"로 잘못 기록된다.
 */
function onHidden() {
  if (raceClock && !raceClock.hiddenAt) raceClock.hiddenAt = performance.now();
  // 암송 연습은 박자가 어긋나므로 멈춘다. 측정은 시간이 곧 기록이라 되돌릴 수 없으니 버린다.
  if (chant && chant.mode === 'practice' && !chant.pausedAt) toggleChant();
}

function onShown() {
  audio.unlock();
  if (raceClock && raceClock.hiddenAt) {
    raceClock.hidden += performance.now() - raceClock.hiddenAt;
    raceClock.hiddenAt = 0;
  }
  if (chant && chant.mode === 'measure') {
    stopChant();
    openChant();
    ui.toast('측정이 중단됐어요. 다시 시작해 주세요');
  }
  if (!quiz || quiz.phase === 'lock') return;

  if (quiz.kind === 'fuel' && session) {
    engine.sessionSkip(store.get(), session);
    persist();
    nextFuel();
  } else if (quiz.kind === 'race' && race) {
    // 레이스에는 문제를 무르는 API가 없다(무르면 기록이 남는다). 같은 문제를 시간만 새로 잰다.
    ask('race', race.items[race.pos]);
  }
}

// ── 배선 ─────────────────────────────────────────────────────────────────────

const ACTIONS = {
  'go-fuel': startFuel,
  'go-race': openRacePick,
  'go-oral': startOral,
  'go-chant': openChant,
  'go-home': goHome,
  'go-parent': openParent,
  'back-parent': backToParent,

  'oral-reveal': () => { if (oral) ui.setOralRevealed(engine.fact(oral.items[oral.pos]).ans); },
  'oral-right': () => answerOral(true),
  'oral-wrong': () => answerOral(false),

  'chant-practice': startChantPractice,
  'chant-measure': startChantMeasure,
  'chant-toggle': toggleChant,
  'chant-error': () => bumpChant('errors'),
  'chant-miss': () => bumpChant('misses'),
  'chant-stop': finishChant,

  'cert-start': startCert,
  'cert-right': () => markCert(null),
  'cert-wrong': () => markCert('errors'),
  // 못 함 = 답을 아예 못 낸 것. 틀린 것과 따로 세지만 둘 다 그날 인증을 막는다(engine.recordCertification).
  'cert-miss': () => markCert('misses'),
  'cert-fix': () => markCert('corrections'),

  payout: () => doPayout(),
  'toggle-practice': () => {
    practiceOn = !practiceOn;
    store.setPractice(practiceOn);
    renderParent();
    ui.toast(practiceOn ? '연습 모드 — 기록을 남기지 않습니다' : '연습 모드를 껐습니다');
  },
  'toggle-ghost': () => {
    const s = store.get();
    s.settings.ghost = !s.settings.ghost;
    persist();
    ui.setGhostState(!!s.settings.ghost);
  },
  'invalidate-last': () => {
    const done = engine.invalidateLast(store.get());
    persist();
    renderParent();
    ui.toast(done ? '마지막 문제를 무효화했습니다' : '무효화할 문제가 없습니다');
  },
  'reset-engine': () => doReset(),
  export: () => {
    ui.setIoText(store.exportText());
    ui.selectIoText();
    ui.setIoNote('전체를 복사해 안전한 곳에 붙여넣어 두세요.');
  },
  import: () => {
    const text = ui.getIoText();
    if (!text) { ui.setIoNote('가져올 문자열을 먼저 붙여넣어 주세요.'); return; }
    try {
      store.importText(text);
      practiceOn = false;
      store.setPractice(false);
      renderParent();
      renderHome();
      ui.setIoNote('가져왔습니다.');
    } catch {
      ui.setIoNote('구구단 로켓 기록이 아니거나 깨진 문자열입니다.');
    }
  },

  'race-again': () => { if (lastRaceKey) startRace(lastRaceKey); else openRacePick(); },
  'done-again': () => { const f = againFn; ui.hideDone(); if (f) f(); },
};

function init() {
  store.load();

  ui.onAction((name) => ACTIONS[name]?.());
  ui.onKey(onKey);
  ui.onRaceSet(startRace);
  ui.onChantPace(pickPace);
  ui.onParentTab((v) => { parentView = v; renderParent(); });
  ui.onGate(GATE_ANSWER, renderParent);

  // 오디오 잠금은 **사용자 활성화를 주는 이벤트**에서만 풀린다(audio.js 주석 참조).
  // 손가락 pointerdown은 활성화를 주지 않으므로 여기에 걸면 iOS에서 조용히 무음이 된다.
  document.addEventListener('click', () => audio.unlock(), { capture: true });
  document.addEventListener('pointerup', () => audio.unlock(), { capture: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) onHidden(); else onShown();
  });

  goHome();
  registerServiceWorker();
}

/**
 * 오프라인 지원. 실패해도 게임은 정상 동작하므로 조용히 넘어간다.
 * 경로는 상대경로여야 한다 — GitHub Pages가 하위 경로(/gugudan/)로 서빙한다.
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // file://로 열면 등록이 안 되고 예외만 난다.
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('[gugudan] 오프라인 지원 등록 실패(게임은 정상):', err);
    });
  });
}

init();

/** 테스트 전용 — 가짜 DOM 위에서 흐름을 구동할 때 안을 들여다본다. */
export function _peek() {
  return { session, race, oral, chant, cert, quiz, parentView, practiceOn };
}
