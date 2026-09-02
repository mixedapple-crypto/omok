/**
 * 구구단 로켓 — 저장. localStorage 키 하나(`gugudan.v1`). 사생활 모드 등에서 예외를 던지므로 전부 감싼다.
 *
 * 연습 모드(부모가 눌러 보는 동안 기록이 오염되지 않게): setPractice(true)면 save()가 아무것도 쓰지 않는다.
 * 그동안의 변경은 메모리에만 있다가 다시 load()하면 사라진다.
 */

import { newState, exportState, importState } from './engine.js';

const KEY = 'gugudan.v1';

let state = newState();
let practice = false;

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? importState(raw) : newState();
  } catch {
    state = newState();
  }
  return state;
}

export function get() { return state; }

export function isPractice() { return practice; }

export function setPractice(on) {
  practice = !!on;
  // 연습 모드로 들어갈 때는 저장된 상태를 다시 읽어 그 위에서 논다. 나올 때도 다시 읽어 연습 흔적을 버린다.
  load();
  return practice;
}

export function save(s = state) {
  state = s;
  if (practice) return state;
  try {
    localStorage.setItem(KEY, exportState(state));
  } catch {
    // 저장이 안 돼도 이번 판은 계속 할 수 있어야 한다.
  }
  return state;
}

export function exportText() { return exportState(state); }

/** 가져오기. 검증에 실패하면 throw — 화면이 "파일이 이상해요"를 보여준다. */
export function importText(text) {
  state = importState(text);
  save(state);
  return state;
}
