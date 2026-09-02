/** 설정과 전적 저장. localStorage는 사생활 보호 모드 등에서 예외를 던지므로 전부 감싼다. */

const KEY = 'omok.v1';

const DEFAULTS = Object.freeze({
  sound: true,
  vibrate: true,
  /** true면 한 번 눌러 바로 착수. 기본은 두 번 눌러 확정 — 초3 손가락 기준이다. */
  instant: false,
  level: 'normal',
  first: 'me',
  /** 실전 코치. 결정적 순간에 즉시 끼어들어 무르기를 제안한다(사용자 결정). */
  coach: true,
  win: 0,
  loss: 0,
  draw: 0,
  /** 오목 교실 진행. { [lessonId]: { demo, puzzle, practice } } — 각 항목 true면 별 하나. */
  lessons: {},
  /** 실전에서 성공한 기술 횟수. { '33': n, '43': n, '44': n } — 배지의 근거. */
  skills: {},
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

/** 레슨 진행 한 칸을 켠다. part는 'demo' | 'puzzle' | 'practice'. 이미 켜져 있으면 그대로다. */
export function markLesson(id, part) {
  const cur = state.lessons?.[id] ?? {};
  if (cur[part]) return state;
  return save({ lessons: { ...state.lessons, [id]: { ...cur, [part]: true } } });
}

export function lessonStars(id) {
  const cur = state.lessons?.[id] ?? {};
  return ['demo', 'puzzle', 'practice'].filter((k) => cur[k]).length;
}

/** 실전 기술 성공 횟수를 하나 올린다. @returns 올린 뒤 횟수 */
export function addSkill(key) {
  const n = (state.skills?.[key] || 0) + 1;
  save({ skills: { ...state.skills, [key]: n } });
  return n;
}

export function resetLessons() {
  return save({ lessons: {}, skills: {} });
}
