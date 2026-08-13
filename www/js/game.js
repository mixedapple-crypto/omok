/**
 * 게임 흐름 총괄 — 화면 전환, 착수 처리, AI 호출.
 * 상태: MENU → SOLO(설정) → PLAYING → (AI_THINKING) → GAME_OVER
 */

import { Board, BLACK, WHITE, EMPTY, undoToLastOwn, canUndoOwn } from './board.js';
import { Renderer } from './render.js';
import * as ui from './ui.js';
import * as store from './storage.js';
import * as audio from './audio.js';

/** 실제 대국에서 어려움 난이도가 쓰는 사고 시간. 사람이 기다려줄 수 있는 상한이다. */
const AI_TIME_MS = 1500;
/** 즉답은 성의 없어 보인다 — 최소한 이만큼은 '생각하는 척'한다. */
const AI_MIN_DELAY_MS = 400;
/** 워커 응답 대기 상한. 넘으면 워커를 포기하고 메인 스레드로 계산한다. */
const WORKER_TIMEOUT_MS = 20000;

const board = new Board();
let renderer = null;

let mode = 'solo';        // 'solo' | 'duo'
let humanColor = BLACK;
let level = 'normal';
let preview = -1;
let thinking = false;
/** 판이 바뀌면 증가. 사고 중이던 AI의 응답이 새 판에 끼어드는 것을 막는다. */
let generation = 0;
let pulseId = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── AI 호출 (워커 우선, 실패하면 메인 스레드) ──────────────────────────────

let worker = null;
let inlineAI = null;
let reqId = 0;
const pending = new Map();

function initWorker() {
  try {
    worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, move } = e.data || {};
      const resolve = pending.get(id);
      if (resolve) { pending.delete(id); resolve(move); }
    };
    worker.onerror = () => {
      // 구형 WebView 등에서 모듈 워커가 안 뜰 수 있다. 조용히 폴백한다.
      worker = null;
      for (const [, resolve] of pending) resolve(null);
      pending.clear();
    };
  } catch {
    worker = null;
  }
}

function workerMove(cells, color) {
  return new Promise((resolve) => {
    const id = ++reqId;
    // 응답이 영영 안 오는 경우(워커가 조용히 죽는 환경)에도 게임이 멈추면 안 된다.
    const bail = setTimeout(() => {
      if (pending.delete(id)) resolve(null);
    }, WORKER_TIMEOUT_MS);
    pending.set(id, (m) => { clearTimeout(bail); resolve(m); });
    worker.postMessage({ type: 'move', id, cells, color, level, timeMs: AI_TIME_MS });
  });
}

async function inlineMove(cells, color) {
  const { AI } = await import('./ai.js');
  if (!inlineAI || inlineAI.level !== level) inlineAI = new AI(level, { timeMs: AI_TIME_MS });
  return inlineAI.chooseMove(Int8Array.from(cells), color);
}

async function requestMove(cells, color) {
  if (worker) {
    const m = await workerMove(cells, color);
    if (m !== null && m !== undefined) return m;
    worker = null; // 응답이 없거나 오류 → 이후로는 메인 스레드로
  }
  return inlineMove(cells, color);
}

// ── 그리기 ────────────────────────────────────────────────────────────────

function render(t = 0) {
  renderer.draw(board, { preview, lastMove: board.lastMove, winLine: board.winLine, t });
}

/** 이긴 줄을 깜빡이게 한다. 승리 표시가 없을 때는 rAF를 돌리지 않는다(배터리). */
function startPulse() {
  stopPulse();
  const t0 = performance.now();
  const step = (now) => {
    render(now - t0);
    pulseId = requestAnimationFrame(step);
  };
  pulseId = requestAnimationFrame(step);
}
function stopPulse() {
  if (pulseId) cancelAnimationFrame(pulseId);
  pulseId = 0;
}

// ── 상태 표시 ─────────────────────────────────────────────────────────────

function turnLabel() {
  const black = board.turn === BLACK;
  if (thinking) return { black, text: '생각하는 중…', thinking: true };
  if (mode === 'duo') return { black, text: black ? '검은 돌 차례' : '흰 돌 차례' };
  return { black, text: board.turn === humanColor ? '내 차례' : '컴퓨터 차례' };
}

function canUndo() {
  if (thinking || board.isOver) return false;
  if (mode === 'duo') return board.moveCount > 0;
  return canUndoOwn(board, humanColor);
}

function updateHud() {
  ui.setTurn(turnLabel());
  ui.setUndoEnabled(canUndo());
  ui.setPlaceEnabled(preview >= 0 && !thinking && !board.isOver);
}

// ── 게임 흐름 ─────────────────────────────────────────────────────────────

function newGame() {
  generation++;
  board.reset();
  preview = -1;
  thinking = false;
  stopPulse();
  ui.hideResult();
  ui.setScreen('game');
  // 화면 전환 직후에는 레이아웃이 아직 안 잡혀 있을 수 있다.
  requestAnimationFrame(() => { renderer.resize(); render(); });
  updateHud();
  if (mode === 'solo' && board.turn !== humanColor) aiTurn();
}

function vibrate(ms) {
  if (store.get().vibrate && navigator.vibrate) {
    try { navigator.vibrate(ms); } catch { /* 지원 안 하면 그만 */ }
  }
}

function commit(i) {
  if (!board.place(i)) { audio.nope(); return; }
  preview = -1;
  audio.stone();
  vibrate(12);
  afterMove();
}

function afterMove() {
  render();
  updateHud();
  if (board.isOver) { endGame(); return; }
  if (mode === 'solo' && board.turn !== humanColor) aiTurn();
}

async function aiTurn() {
  const gen = generation;
  thinking = true;
  updateHud();

  const t0 = performance.now();
  let move = -1;
  try {
    move = await requestMove(board.cells, board.turn);
  } catch (err) {
    // AI가 실패해도 화면이 '생각하는 중…'에 영원히 갇히면 안 된다.
    // 판을 못 이어가더라도 사용자가 무르기·다시하기를 할 수 있어야 한다.
    console.error('[omok] AI 착수 실패:', err);
  }
  const wait = Math.max(0, AI_MIN_DELAY_MS - (performance.now() - t0));
  if (wait) await sleep(wait);

  // 기다리는 동안 사용자가 새 판을 시작했거나 메뉴로 나갔으면 이 수는 버린다.
  if (gen !== generation) return;

  thinking = false;
  if (typeof move === 'number' && move >= 0) {
    board.place(move);
    audio.stone();
    vibrate(12);
  }
  afterMove();
}

function endGame() {
  stopPulse();
  if (board.winLine) startPulse();
  else render();

  const w = board.winner;
  let emoji;
  let text;

  if (w === EMPTY) {
    // 전적은 1인 대전의 것이다 — 둘이 하기 결과를 섞으면 아이의 기록이 아니게 된다.
    if (mode === 'solo') store.addResult('draw');
    emoji = '🤝';
    text = '비겼어요';
  } else if (mode === 'duo') {
    emoji = '🎉';
    text = w === BLACK ? '검은 돌 승리!' : '흰 돌 승리!';
    ui.confetti();
    audio.win();
  } else if (w === humanColor) {
    store.addResult('win');
    emoji = '🎉';
    text = '이겼다!';
    ui.confetti();
    audio.win();
  } else {
    store.addResult('loss');
    emoji = '💪';
    text = '아쉽다! 다시 해볼까?';
    audio.lose();
  }

  ui.setRecord(store.get());
  updateHud();
  // 이긴 줄이 보이도록 잠깐 두고 결과를 띄운다.
  setTimeout(() => { if (board.isOver) ui.showResult(emoji, text); }, 900);
}

function undo() {
  if (!canUndo()) return;
  if (mode === 'duo') board.undo();
  else undoToLastOwn(board, humanColor);
  preview = -1;
  stopPulse();
  ui.hideResult();
  render();
  updateHud();
}

// ── 입력 ──────────────────────────────────────────────────────────────────

function onBoardPointer(e) {
  // 첫 제스처에서 오디오 잠금을 푼다. 이걸 빠뜨리면 소리가 조용히 안 난다.
  audio.unlock();
  if (thinking || board.isOver) return;
  if (mode === 'solo' && board.turn !== humanColor) return;

  const i = renderer.hitTest(e.clientX, e.clientY);
  if (i < 0) return;
  if (!board.isEmpty(i)) { audio.nope(); return; }

  if (store.get().instant || preview === i) { commit(i); return; }

  // 첫 탭은 미리보기만. 잘못 짚었으면 다른 칸을 다시 짚으면 된다.
  preview = i;
  render();
  updateHud();
}

// ── 배선 ──────────────────────────────────────────────────────────────────

function startSolo() {
  mode = 'solo';
  const s = store.get();
  level = s.level;
  humanColor = s.first === 'me' ? BLACK : WHITE;
  newGame();
}

const ACTIONS = {
  solo: () => {
    const s = store.get();
    ui.selectChip('#level-choice', 'level', s.level);
    ui.selectChip('#first-choice', 'first', s.first);
    ui.setScreen('solo');
  },
  duo: () => { mode = 'duo'; newGame(); },
  'start-solo': startSolo,
  'back-menu': () => {
    generation++; // 사고 중인 AI 응답 무효화
    thinking = false;
    stopPulse();
    ui.hideResult();
    ui.setRecord(store.get());
    ui.setScreen('menu');
  },
  restart: () => { newGame(); },
  undo,
  place: () => { if (preview >= 0) commit(preview); },
  settings: () => { ui.syncSettings(store.get()); ui.toggleSettings(true); },
  'close-settings': () => ui.toggleSettings(false),
  'reset-record': () => { store.resetRecord(); ui.setRecord(store.get()); },
};

function init() {
  store.load();
  const s = store.get();
  audio.setEnabled(s.sound);

  renderer = new Renderer(document.getElementById('board'));
  initWorker();

  ui.setRecord(s);
  ui.syncSettings(s);
  ui.selectChip('#level-choice', 'level', s.level);
  ui.selectChip('#first-choice', 'first', s.first);

  ui.onAction((name) => ACTIONS[name]?.());
  ui.onChip('#level-choice', 'level', (v) => {
    store.save({ level: v });
    ui.selectChip('#level-choice', 'level', v);
  });
  ui.onChip('#first-choice', 'first', (v) => {
    store.save({ first: v });
    ui.selectChip('#first-choice', 'first', v);
  });
  ui.onSettingChange((key, value) => {
    store.save({ [key]: value });
    if (key === 'sound') { audio.setEnabled(value); if (value) audio.unlock(); }
  });

  const canvas = document.getElementById('board');
  canvas.addEventListener('pointerdown', onBoardPointer);
  // 판 위에서의 스크롤·확대 제스처를 막는다. 착수 중에 화면이 움직이면 오착이 난다.
  canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

  const onResize = () => { renderer.resize(); render(); };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 120));
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(canvas);

  render();
}

init();
