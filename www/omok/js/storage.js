/** 설정과 전적 저장. localStorage는 사생활 보호 모드 등에서 예외를 던지므로 전부 감싼다. */

const KEY = 'omok.v1';

const DEFAULTS = Object.freeze({
  sound: true,
  vibrate: true,
  /** true면 한 번 눌러 바로 착수. 기본은 두 번 눌러 확정 — 초3 손가락 기준이다. */
  instant: false,
  level: 'normal',
  first: 'me',
  win: 0,
  loss: 0,
  draw: 0,
});

let state = { ...DEFAULTS };

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    state = { ...DEFAULTS };
  }
  return state;
}

export function get() { return state; }

export function save(patch) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 저장이 안 돼도 이번 판은 계속 둘 수 있어야 한다.
  }
  return state;
}

export function addResult(kind) {
  return save({ [kind]: (state[kind] || 0) + 1 });
}

export function resetRecord() {
  return save({ win: 0, loss: 0, draw: 0 });
}
