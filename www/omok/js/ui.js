/** DOM 조작만 담당한다. 게임 규칙은 알지 못한다. */

const $ = (sel) => document.querySelector(sel);

const app = $('#app');
const turnDot = $('#turn-dot');
const turnText = $('#turn-text');
const turnBox = $('#turn-label');
const btnPlace = $('#btn-place');
const btnUndo = $('#btn-undo');
const resultOverlay = $('#result-overlay');
const resultEmoji = $('#result-emoji');
const resultText = $('#result-text');
const settingsOverlay = $('#settings-overlay');
const recordEl = $('#record');
const confettiBox = $('#confetti');
// 오목 교실
const lessonList = $('#lesson-list');
const badgeList = $('#badge-list');
const lessonName = $('#lesson-name');
const lessonSteps = $('#lesson-steps');
const bubble = $('#lesson-bubble');
const btnLessonPrev = $('#btn-lesson-prev');
const btnLessonNext = $('#btn-lesson-next');
const btnLessonPlace = $('#btn-lesson-place');
const btnLessonHint = $('#btn-lesson-hint');
const btnResultLessons = $('#btn-result-lessons');
// 코치·토스트
const coachSheet = $('#coach-sheet');
const coachText = $('#coach-text');
const toastEl = $('#toast');

export function setScreen(name) { app.dataset.screen = name; }
export function getScreen() { return app.dataset.screen; }

export function setTurn({ black, text, thinking }) {
  turnDot.className = `dot ${black ? 'black' : 'white'}`;
  turnText.textContent = text;
  turnBox.classList.toggle('thinking', !!thinking);
}

export function setPlaceEnabled(v) { btnPlace.disabled = !v; }
export function setUndoEnabled(v) { btnUndo.disabled = !v; }

export function showResult(emoji, text) {
  resultEmoji.textContent = emoji;
  resultText.textContent = text;
  resultOverlay.hidden = false;
}
export function hideResult() { resultOverlay.hidden = true; }
export function isResultOpen() { return !resultOverlay.hidden; }

export function toggleSettings(show) { settingsOverlay.hidden = !show; }

export function setRecord({ win, loss, draw }) {
  recordEl.textContent = win + loss + draw === 0
    ? '아직 기록이 없어요'
    : `전적  ${win}승 ${loss}패${draw ? ` ${draw}무` : ''}`;
}

/** 칩 그룹에서 하나만 눌린 상태로 만든다. */
export function selectChip(containerSel, attr, value) {
  for (const el of document.querySelectorAll(`${containerSel} .chip`)) {
    el.setAttribute('aria-pressed', String(el.dataset[attr] === value));
  }
}

export function syncSettings({ sound, vibrate, instant }) {
  $('#opt-sound').checked = !!sound;
  $('#opt-vibrate').checked = !!vibrate;
  $('#opt-instant').checked = !!instant;

  // iOS는 navigator.vibrate를 지원하지 않는다. 켜도 아무 일이 없는 스위치를 보여주면
  // 아이는 "고장났다"고 느낀다. 안 되는 기기에서는 아예 감춘다.
  if (!('vibrate' in navigator)) {
    const row = $('#opt-vibrate').closest('.toggle');
    if (row) row.hidden = true;
  }
}

export function onSettingChange(handler) {
  $('#opt-sound').addEventListener('change', (e) => handler('sound', e.target.checked));
  $('#opt-vibrate').addEventListener('change', (e) => handler('vibrate', e.target.checked));
  $('#opt-instant').addEventListener('change', (e) => handler('instant', e.target.checked));
}

/** data-action 클릭 위임. 버튼이 늘어도 배선을 고칠 필요가 없다. */
export function onAction(handler) {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (el) handler(el.dataset.action, el);
  });
}

export function onChip(containerSel, attr, handler) {
  const box = $(containerSel);
  if (!box) return;
  box.addEventListener('click', (e) => {
    const el = e.target.closest('.chip');
    if (el) handler(el.dataset[attr]);
  });
}

const CONFETTI_COLORS = ['#ffb703', '#e5573f', '#4cc9f0', '#80ed99', '#f72585'];

export function confetti(count = 60) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const d = document.createElement('div');
    d.className = 'confetto';
    d.style.left = `${Math.random() * 100}%`;
    d.style.background = CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0];
    d.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
    d.style.animationDelay = `${Math.random() * 0.5}s`;
    frag.appendChild(d);
  }
  confettiBox.appendChild(frag);
  // 3.6초면 가장 늦은 조각(지연 0.5s + 지속 3.0s)까지 화면 밖으로 나간다.
  setTimeout(() => { confettiBox.textContent = ''; }, 3600);
}

// ── 오목 교실 ─────────────────────────────────────────────────────────────

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** 이름표: 한글을 크게, 숫자 표기(3-3 등)를 작게 병기한다(사용자 결정). */
function nameWithCode(parent, ko, code) {
  parent.appendChild(document.createTextNode(ko));
  if (code) parent.appendChild(el('small', '', code));
}

function starText(parent, n) {
  for (let i = 0; i < 3; i++) parent.appendChild(el('span', i < n ? '' : 'off', '★'));
}

/**
 * 레슨 카드 목록. 순서대로 번호를 붙이고 별을 보여준다. nextId는 다음에 추천하는 레슨.
 * @param {Array} lessons  @param {(id:string)=>number} starsOf  @param {string|null} nextId
 */
export function renderLessons(lessons, starsOf, nextId) {
  lessonList.textContent = '';
  lessons.forEach((l, i) => {
    const card = el('button', `lesson-card${l.id === nextId ? ' next' : ''}`);
    card.dataset.lesson = l.id;
    card.appendChild(el('span', 'lesson-no', String(i + 1)));
    const title = el('span', 'lesson-title');
    nameWithCode(title, l.title, l.code);
    card.appendChild(title);
    const stars = el('span', 'stars');
    starText(stars, starsOf(l.id));
    card.appendChild(stars);
    card.appendChild(el('span', 'lesson-sub', l.subtitle));
    lessonList.appendChild(card);
  });
}

/** @param {Array<{key:string, ko:string, code:string, count:number, icon:string}>} items */
export function renderBadges(items) {
  badgeList.textContent = '';
  for (const b of items) {
    const box = el('div', `badge${b.count > 0 ? ' earned' : ''}`);
    box.appendChild(el('span', 'badge-icon', b.icon));
    const name = el('span', 'badge-name');
    nameWithCode(name, b.ko, b.code);
    box.appendChild(name);
    box.appendChild(el('span', 'badge-count', b.count > 0 ? `실전 ${b.count}번 성공` : '아직 없어요'));
    badgeList.appendChild(box);
  }
}

export function onLesson(handler) {
  lessonList.addEventListener('click', (e) => {
    const card = e.target.closest('[data-lesson]');
    if (card) handler(card.dataset.lesson);
  });
}

export function setLessonHead(title, code) {
  lessonName.textContent = '';
  nameWithCode(lessonName, title, code);
}

/** 보기·찾기·써보기 알약. part가 현재, done은 끝낸 부분 집합. */
export function setLessonPart(part, done) {
  for (const span of lessonSteps.querySelectorAll('[data-part]')) {
    const k = span.dataset.part;
    span.classList.toggle('on', k === part);
    span.classList.toggle('done', !!done?.[k] && k !== part);
  }
}

/** @param {string} text  @param {''|'good'|'bad'} [tone] */
export function setBubble(text, tone = '') {
  bubble.textContent = text;
  bubble.className = `bubble${tone ? ` ${tone}` : ''}`;
}

/**
 * 레슨 화면 버튼 상태. 생략한 항목은 숨긴다.
 * @param {{prev?:string, next?:string, hint?:boolean, place?:boolean, placeEnabled?:boolean}} cfg
 */
export function setLessonButtons(cfg) {
  btnLessonPrev.hidden = !cfg.prev;
  if (cfg.prev) btnLessonPrev.textContent = cfg.prev;
  btnLessonNext.hidden = !cfg.next;
  if (cfg.next) btnLessonNext.textContent = cfg.next;
  btnLessonHint.hidden = !cfg.hint;
  btnLessonPlace.hidden = !cfg.place;
  btnLessonPlace.disabled = !cfg.placeEnabled;
}

export function setResultLessons(show) { btnResultLessons.hidden = !show; }

// ── 코치·토스트 ─────────────────────────────────────────────────────────

export function showCoach(text) { coachText.textContent = text; coachSheet.hidden = false; }
export function hideCoach() { coachSheet.hidden = true; }

let toastTimer = 0;
/** 기술 이름을 잠깐 띄운다. 애니메이션을 다시 시작하려고 hidden을 껐다 켠다. */
export function toast(text) {
  clearTimeout(toastTimer);
  toastEl.hidden = true;
  toastEl.textContent = text;
  // 강제 리플로우 — 같은 애니메이션을 연속으로 다시 재생하기 위해서다.
  void toastEl.offsetWidth;
  toastEl.hidden = false;
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 1700);
}
