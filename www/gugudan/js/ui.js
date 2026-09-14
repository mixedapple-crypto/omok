/**
 * DOM 조작만 담당한다. 구구단 규칙도 엔진 상태도 알지 못한다 — app.js가 그린 값을 넣어줄 뿐이다.
 *
 * 화면 전환은 오목과 같은 방식이다: `#app[data-screen]` 하나를 바꾸면 CSS가 나머지를 한다.
 */

const $ = (sel) => document.querySelector(sel);

const app = $('#app');

// 홈
const todayPill = $('#today-pill');
const missionTitle = $('#mission-title');
const missionSteps = $('#mission-steps');
const rewardText = $('#reward-text');
const homeFuelPercent = $('#home-fuel-percent');
const homeFuelBar = $('#home-fuel-bar');
const homeFuelCount = $('#home-fuel-count');
const stageName = $('#stage-name');
const planetsBox = $('#planets');
const worldGoal = $('#world-goal');
const worldProgress = $('#world-progress');
const badgeCount = $('#badge-count');
const badgesBox = $('#badges');
const parentGate = $('#parent-gate');
const parentContent = $('#parent-content');
const gateIn = $('#gate-in');
const gateOk = $('#gate-ok');
const gateMsg = $('#gate-msg');

// 연료 채우기
const fuelCounter = $('#fuel-counter');
const fuelPct = $('#fuel-pct');
const fuelBar = $('#fuel-bar');
const fuelProblem = $('#fuel-problem');
const fuelAnswer = $('#fuel-answer');
const fuelHint = $('#fuel-hint');

// 레이스
const raceSetList = $('#race-sets');
const raceName = $('#race-name');
const raceCounter = $('#race-counter');
const raceProblem = $('#race-problem');
const raceAnswer = $('#race-answer');
const rocketMine = $('#rocket-mine');
const rocketGhost = $('#rocket-ghost');
const ghostLabel = $('#ghost-label');
const raceResultKicker = $('#race-result-kicker');
const raceResultTitle = $('#race-result-title');
const raceResultAcc = $('#race-result-acc');
const raceTimeToday = $('#race-time-today');
const raceTimeGhost = $('#race-time-ghost');

// 구두 카드
const oralCounter = $('#oral-counter');
const oralBar = $('#oral-bar');
const oralProblem = $('#oral-problem');
const oralReveal = $('#oral-reveal');
const oralShown = $('#oral-shown');
const oralAnswer = $('#oral-answer');

// 암송
const chantCounter = $('#chant-counter');
const chantSetup = $('#chant-setup');
const chantRun = $('#chant-run');
const chantPaces = $('#chant-paces');
const chantBest = $('#chant-best');
const chantBar = $('#chant-bar');
const chantProblem = $('#chant-problem');
const chantAnswer = $('#chant-answer');
const chantToggle = $('#chant-toggle');
const chantErrors = $('#chant-errors');
const chantMisses = $('#chant-misses');

// 부모
const parentTabs = $('#parent-tabs');
const matrixBody = $('#matrix-body');
const matrixNote = $('#matrix-note');
const confusions = $('#confusions');
const certSub = $('#cert-sub');
const coinsSub = $('#coins-sub');
const btnPayout = $('#btn-payout');
const resetLabel = $('#reset-label');
const practiceState = $('#practice-state');
const ghostState = $('#ghost-state');
const ioText = $('#io-text');
const ioNote = $('#io-note');

// 인증
const certCounter = $('#cert-counter');
const certBar = $('#cert-bar');
const certProblem = $('#cert-problem');
const certTally = $('#cert-tally');

// 결과 카드·토스트
const doneOverlay = $('#done-overlay');
const doneKicker = $('#done-kicker');
const doneTitle = $('#done-title');
const doneBody = $('#done-body');
const doneAgain = $('#done-again');
const toastEl = $('#toast');

const BADGE_ICON = { planet: '🪐', pair: '✦', perfect: '🚀', fuel50: '⏱', streak: '③', cert: '🎙️', chant36: '↶' };
const PLANET_CLASS = { stable: 'stable', working: 'working', idle: 'dim' };

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

const pct = (p) => `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;

// ── 화면 전환 ────────────────────────────────────────────────────────────────

export function setScreen(name) { app.dataset.screen = name; }
export function getScreen() { return app.dataset.screen; }

// ── 홈 ───────────────────────────────────────────────────────────────────────

export function setToday(date) {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  todayPill.textContent = `${date.getMonth() + 1}월 ${date.getDate()}일 · ${days[date.getDay()]}요일`;
}

/**
 * @param {{no:number,name:string,detail:string}} stage
 * @param {{fuel:boolean,race:boolean,oral:boolean,done:boolean,paid:boolean,coins:number}} mission
 */
export function setMission(stage, mission) {
  stageName.textContent = `${stage.no}단계 · ${stage.name}`;
  worldGoal.textContent = stage.goal;
  worldProgress.textContent = `지금 ${stage.detail}`;

  missionSteps.textContent = '';
  const steps = [['연료 채우기', mission.fuel], ['레이스', mission.race], ['구두 카드', mission.oral]];
  steps.forEach(([label, done], i) => {
    if (i) missionSteps.appendChild(document.createTextNode(' · '));
    missionSteps.appendChild(el('span', done ? 'on' : '', `${done ? '✓ ' : ''}${label}`));
  });

  const n = steps.filter(([, d]) => d).length;
  // 큰 제목은 임무 자체를 말한다. 예전에는 단계 진행도("0 / 8 단 안정")가 여기 떠서 그게 임무처럼 읽혔다.
  missionTitle.textContent = n === steps.length ? '오늘 임무 완료!' : `${steps.length - n}가지 남았어요`;
  homeFuelBar.style.width = pct(n / 3);
  homeFuelCount.textContent = `${n} / 3`;
  homeFuelPercent.textContent = `${Math.round((n / 3) * 100)}% 충전`;

  rewardText.textContent = mission.paid
    ? `오늘 용돈 30원 받았어요 · 저금통 ${mission.coins}원`
    : '임무를 마치면 용돈 30원';
  rewardText.closest('.reward').classList.toggle('paid', !!mission.paid);
}

/** @param {Array<{dan:number,ok:number,status:'stable'|'working'|'idle'}>} list */
export function setPlanets(list) {
  planetsBox.textContent = '';
  for (const p of list) {
    const item = el('div', 'planet-item');
    item.appendChild(el('div', `planet ${PLANET_CLASS[p.status] || 'dim'}`, String(p.dan)));
    item.appendChild(document.createTextNode(p.status === 'stable' ? '안정' : `${p.ok}/9`));
    planetsBox.appendChild(item);
  }
}

/** @param {Array<{key:string,name:string,earned:boolean,count:number}>} list */
export function setBadges(list) {
  badgesBox.textContent = '';
  for (const b of list) {
    const box = el('div', `badge${b.earned ? '' : ' locked'}`);
    box.appendChild(el('div', 'badge-icon', BADGE_ICON[b.key] || '★'));
    box.appendChild(document.createTextNode(b.name));
    if (b.earned && b.count > 1) box.appendChild(el('div', '', `×${b.count}`));
    badgesBox.appendChild(box);
  }
  badgeCount.textContent = `${list.filter((b) => b.earned).length} / ${list.length}`;
}

/**
 * 부모 화면 관문. 숫자숲·곱셈 바다와 같은 방식이다.
 *
 * ⚠️ 통과하기 전에는 내용을 **그리지도 않는다.** 화면에만 안 보이게 하면 기록이 DOM에 들어가
 * 있어서, 관문이 눈가림이 된다. 그래서 app.js가 통과한 뒤에야 renderParent를 부른다.
 *
 * 열 때마다 다시 잠근다. 한 번 통과했다고 다음에 그냥 열리면 관문이 아니다.
 */
export function lockParent() {
  parentGate.hidden = false;
  parentContent.hidden = true;
  gateIn.value = '';
  gateMsg.textContent = '';
}

/** 관문을 통과한 상태로 둔다(인증 화면에서 관제실로 돌아올 때). */
export function unlockParent() {
  parentGate.hidden = true;
  parentContent.hidden = false;
}

export function onGate(answer, handler) {
  const check = () => {
    if (gateIn.value.trim() === String(answer)) {
      unlockParent();
      handler();
    } else {
      gateMsg.textContent = '앗, 다시 계산해 보세요!';
      gateIn.value = '';
    }
  };
  gateOk.addEventListener('click', check);
  // 숫자판이 아니라 기기 자판으로 넣으므로 엔터로도 확인되게 둔다.
  gateIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
}

// ── 문제 화면 (연료 채우기 · 레이스 공용) ────────────────────────────────────

const QUIZ = {
  fuel: { problem: fuelProblem, answer: fuelAnswer, hint: fuelHint },
  race: { problem: raceProblem, answer: raceAnswer, hint: null },
};

/** @param {'fuel'|'race'} kind */
export function setProblem(kind, text) { QUIZ[kind].problem.textContent = text; }

/** @param {'fuel'|'race'} kind @param {string} text @param {''|'good'|'bad'} tone */
export function setAnswer(kind, text, tone = '') {
  const box = QUIZ[kind].answer;
  box.textContent = text;
  box.className = `answer-box${kind === 'race' ? ' tight' : ''}${tone ? ` ${tone}` : ''}`;
}

export function setHint(kind, text) {
  const h = QUIZ[kind].hint;
  if (h) h.textContent = text;
}

export function setFuelProgress(pos, total) {
  fuelCounter.textContent = `${pos} / ${total}`;
  const p = total ? pos / total : 0;
  fuelBar.style.width = pct(p);
  fuelPct.textContent = pct(p);
}

// ── 항로 고르기 ──────────────────────────────────────────────────────────────

/** @param {Array<{key:string,name:string,count:number,available:boolean,ghost:string|null}>} sets */
export function setRaceSets(sets) {
  raceSetList.textContent = '';
  for (const s of sets) {
    const b = el('button', `set${s.available ? '' : ' locked'}`);
    b.dataset.set = s.key;
    if (!s.available) b.disabled = true;
    const name = el('span', 'set-name');
    name.appendChild(document.createTextNode(s.name));
    name.appendChild(el('small', 'set-sub', `${s.count}문제`));
    b.appendChild(name);
    b.appendChild(el('span', 'set-ghost', s.available ? (s.ghost ? `유령 ${s.ghost}` : '기록 없음') : '아직 잠김'));
    raceSetList.appendChild(b);
  }
}

export function onRaceSet(handler) {
  raceSetList.addEventListener('click', (e) => {
    const b = e.target.closest('[data-set]');
    if (b && !b.disabled) handler(b.dataset.set);
  });
}

// ── 레이스 ───────────────────────────────────────────────────────────────────

export function setRaceHead(name, pos, total) {
  raceName.textContent = name;
  raceCounter.textContent = `${pos} / ${total}`;
}

/** @param {number} mine 0~1 @param {number|null} ghost 0~1, null이면 유령 트랙을 감춘다 */
export function setRockets(mine, ghost) {
  rocketMine.style.setProperty('--p', String(Math.max(0, Math.min(1, mine))));
  const stage = rocketGhost.parentElement;
  const off = ghost == null;
  stage.classList.toggle('no-ghost', off);
  if (!off) rocketGhost.style.setProperty('--p', String(Math.max(0, Math.min(1, ghost))));
}

export function setGhostLabel(text) { ghostLabel.textContent = text; }

export function setRaceResult({ kicker, title, accuracy, today, ghost }) {
  raceResultKicker.textContent = kicker;
  raceResultTitle.textContent = title;
  raceResultAcc.textContent = accuracy;
  raceTimeToday.textContent = today;
  raceTimeGhost.textContent = ghost;
}

// ── 구두 카드 ────────────────────────────────────────────────────────────────

export function setOral(pos, total, problem) {
  oralCounter.textContent = `${pos} / ${total}`;
  oralBar.style.width = pct(total ? pos / total : 0);
  oralProblem.textContent = problem;
}

export function setOralRevealed(answer) {
  const shown = answer != null;
  oralAnswer.textContent = shown ? String(answer) : '–';
  oralShown.hidden = !shown;
  oralReveal.hidden = shown;
}

// ── 거꾸로 암송 ──────────────────────────────────────────────────────────────

/** @param {number[]} paces @param {number} chosen */
export function setChantPaces(paces, chosen) {
  chantPaces.textContent = '';
  for (const p of paces) {
    const b = el('button', 'pace', `${p}초`);
    b.dataset.pace = String(p);
    b.setAttribute('aria-pressed', String(p === chosen));
    chantPaces.appendChild(b);
  }
}

export function onChantPace(handler) {
  chantPaces.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pace]');
    if (b) handler(Number(b.dataset.pace));
  });
}

export function setChantBest(text) { chantBest.textContent = text; }

export function setChantMode(mode) {
  const running = mode != null;
  chantSetup.hidden = running;
  chantRun.hidden = !running;
  if (running) chantRun.dataset.mode = mode;
}

export function setChantStep(pos, total, problem, answer) {
  chantCounter.textContent = `${pos} / ${total}`;
  chantBar.style.width = pct(total ? pos / total : 0);
  if (problem != null) chantProblem.textContent = problem;
  chantAnswer.textContent = answer == null ? '' : String(answer);
}

export function setChantPaused(paused) { chantToggle.textContent = paused ? '이어서 하기' : '잠깐 멈춤'; }
export function setChantCounts(errors, misses) {
  chantErrors.textContent = String(errors);
  chantMisses.textContent = String(misses);
}

// ── 부모 관제실 ──────────────────────────────────────────────────────────────

const LEVEL_CLASS = ['', 'mid', 'hot', 'hotter'];

export function setParentView(view) {
  for (const t of parentTabs.querySelectorAll('[data-view]')) {
    t.classList.toggle('active', t.dataset.view === view);
  }
}

export function onParentTab(handler) {
  parentTabs.addEventListener('click', (e) => {
    const t = e.target.closest('[data-view]');
    if (t) handler(t.dataset.view);
  });
}

/** @param {Array<{dan:number,cells:Array<{id:string,value:*,level:number,label:string}>}>} rows */
export function setMatrix(rows, note) {
  matrixBody.textContent = '';
  for (const row of rows) {
    const tr = el('tr');
    const th = el('th', 'rowhead', `${row.dan}단`);
    tr.appendChild(th);
    for (const c of row.cells) {
      const td = el('td', LEVEL_CLASS[c.level] || '', c.label);
      td.title = c.id;
      tr.appendChild(td);
    }
    matrixBody.appendChild(tr);
  }
  matrixNote.textContent = note;
}

const PHASE_WORD = { apart: '떨어뜨려 내는 중', contrast: '붙여서 비교 중', done: '극복' };

/** @param {Array<{a:string,b:string,count:number,phase:string}>} list */
export function setConfusions(list) {
  confusions.textContent = '';
  if (!list.length) {
    confusions.appendChild(el('p', 'empty-note', '아직 혼동쌍이 없어요.'));
    return;
  }
  for (const p of list) {
    const box = el('div', `confusion${p.phase === 'done' ? ' done' : ''}`);
    box.appendChild(document.createTextNode(`${p.a.replace('x', '×')} ↔ ${p.b.replace('x', '×')} · ${p.count}번`));
    box.appendChild(el('span', 'ph', PHASE_WORD[p.phase] || p.phase));
    confusions.appendChild(box);
  }
}

export function setCertStatus(text) { certSub.textContent = text; }
export function setCoins(text) { coinsSub.textContent = text; }
export function setPayoutLabel(text) { btnPayout.textContent = text; }
export function setResetLabel(text) { resetLabel.textContent = text; }
export function setPracticeState(on) {
  practiceState.textContent = on ? '켜짐' : '꺼짐';
  practiceState.closest('.op').classList.toggle('on', on);
}
export function setGhostState(on) {
  ghostState.textContent = on ? '켜짐' : '꺼짐';
  ghostState.closest('.op').classList.toggle('on', on);
}
export function setIoText(text) { ioText.value = text; }
export function getIoText() { return ioText.value.trim(); }
export function setIoNote(text) { ioNote.textContent = text; }
export function selectIoText() {
  try { ioText.focus(); ioText.select(); } catch { /* 포커스가 안 잡혀도 복사는 손으로 할 수 있다 */ }
}

// ── 구두 인증 ────────────────────────────────────────────────────────────────

export function setCert(pos, total, problem, errors, corrections, misses = 0) {
  certCounter.textContent = `${pos} / ${total}`;
  certBar.style.width = pct(total ? pos / total : 0);
  certProblem.textContent = problem;
  certTally.textContent = `틀림 ${errors} · 못 함 ${misses} · 수정 ${corrections}`;
}

// ── 공통 결과 카드 ───────────────────────────────────────────────────────────

/**
 * @param {{kicker:string, title:string, rows?:Array<[string,string]>, big?:string, again?:string|null}} cfg
 */
export function showDone(cfg) {
  doneKicker.textContent = cfg.kicker || '';
  doneTitle.textContent = cfg.title || '';
  doneBody.textContent = '';
  if (cfg.big) doneBody.appendChild(el('div', 'done-big', cfg.big));
  for (const [k, v] of cfg.rows || []) {
    const row = el('div', 'done-row');
    row.appendChild(el('span', '', k));
    row.appendChild(el('b', '', v));
    doneBody.appendChild(row);
  }
  doneAgain.hidden = !cfg.again;
  if (cfg.again) doneAgain.textContent = cfg.again;
  doneOverlay.hidden = false;
}

export function hideDone() { doneOverlay.hidden = true; }
export function isDoneOpen() { return !doneOverlay.hidden; }

// ── 배선 ─────────────────────────────────────────────────────────────────────

/** data-action 클릭 위임. 버튼이 늘어도 배선을 고칠 필요가 없다(오목과 같은 방식). */
export function onAction(handler) {
  document.addEventListener('click', (e) => {
    const el2 = e.target.closest('[data-action]');
    if (el2) handler(el2.dataset.action, el2);
  });
}

/** 숫자판. 연료 채우기와 레이스가 같은 마크업을 쓰므로 위임 하나로 둘 다 받는다. */
export function onKey(handler) {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-key]');
    if (b) handler(b.dataset.key);
  });
  // 데스크톱에서 눌러 볼 때를 위한 물리 키보드. 아이패드에서는 쓰이지 않는다.
  document.addEventListener('keydown', (e) => {
    const scr = getScreen();
    if (scr !== 'fuel' && scr !== 'race') return;
    if (e.key >= '0' && e.key <= '9') handler(e.key);
    else if (e.key === 'Backspace') handler('del');
    else return;
    e.preventDefault();
  });
}

let toastTimer = 0;
export function toast(text) {
  clearTimeout(toastTimer);
  toastEl.hidden = true;
  toastEl.textContent = text;
  void toastEl.offsetWidth; // 같은 토스트를 연속으로 다시 띄우기 위한 강제 리플로우
  toastEl.hidden = false;
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 1800);
}
