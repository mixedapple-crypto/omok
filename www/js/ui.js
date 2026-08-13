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
