/**
 * HTML ↔ JS 배선 정합성 검사.
 *
 * 브라우저 없이 도는 이유: 오타 하나로 버튼이 아무 반응도 안 하는 종류의 결함은
 * 실행해봐야만 드러나는데, 실은 **문자열 대조만으로 전부 잡힌다.**
 * (id 오타, 핸들러 없는 data-action, 없는 파일 참조, 죽은 핸들러)
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ok, eq, report } from './_assert.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const html = read('www/index.html');
const gameJs = read('www/js/game.js');
const uiJs = read('www/js/ui.js');

const all = (text, re) => [...text.matchAll(re)].map((m) => m[1]);
const uniq = (a) => [...new Set(a)];

// --- data-action ↔ ACTIONS 핸들러 ---------------------------------------------
const htmlActions = uniq(all(html, /data-action="([^"]+)"/g));
// ACTIONS 객체 본문에서 키를 뽑는다. `undo,` 같은 축약 표기도 잡아야 한다.
const actionsBlock = gameJs.slice(gameJs.indexOf('const ACTIONS = {'), gameJs.indexOf('function init()'));
const handlerKeys = uniq([
  ...all(actionsBlock, /^\s*'([a-z-]+)':/gm),
  ...all(actionsBlock, /^\s*([a-z][A-Za-z]*)[,:]/gm),
]);

ok('HTML에 data-action이 존재한다', htmlActions.length >= 8, `${htmlActions.length}개`);
for (const a of htmlActions) {
  ok(`data-action="${a}" 에 핸들러가 있다`, handlerKeys.includes(a),
    `핸들러 목록: ${handlerKeys.join(', ')}`);
}
for (const k of handlerKeys) {
  ok(`핸들러 '${k}' 가 실제로 쓰인다`, htmlActions.includes(k), '죽은 핸들러');
}

// --- ui.js가 찾는 id가 HTML에 있는가 ------------------------------------------
const htmlIds = uniq(all(html, /\bid="([^"]+)"/g));
const wantedIds = uniq(all(uiJs, /\$\('#([^']+)'\)/g));
ok('ui.js가 참조하는 id가 있다', wantedIds.length >= 8, `${wantedIds.length}개`);
for (const id of wantedIds) {
  ok(`id="${id}" 가 HTML에 있다`, htmlIds.includes(id), `HTML의 id: ${htmlIds.join(', ')}`);
}

// game.js가 직접 잡는 요소
for (const id of uniq(all(gameJs, /getElementById\('([^']+)'\)/g))) {
  ok(`game.js가 찾는 id="${id}" 가 HTML에 있다`, htmlIds.includes(id));
}

// --- 칩 그룹 컨테이너와 선택지 값 -----------------------------------------------
for (const sel of uniq(all(gameJs, /selectChip\('#([^']+)'/g))) {
  ok(`칩 컨테이너 id="${sel}" 가 HTML에 있다`, htmlIds.includes(sel));
}
{
  const levels = uniq(all(html, /data-level="([^"]+)"/g));
  eq('난이도 선택지는 3개', levels.length, 3);
  for (const v of ['easy', 'normal', 'hard']) {
    ok(`난이도 '${v}' 칩이 있다`, levels.includes(v));
  }
  const firsts = uniq(all(html, /data-first="([^"]+)"/g));
  eq('선공 선택지는 2개', firsts.length, 2);
  for (const v of ['me', 'ai']) ok(`선공 '${v}' 칩이 있다`, firsts.includes(v));
}

// --- HTML이 참조하는 파일이 실제로 있는가 ----------------------------------------
for (const href of [...all(html, /<link[^>]+href="([^"]+)"/g), ...all(html, /<script[^>]+src="([^"]+)"/g)]) {
  ok(`참조 파일이 존재한다: ${href}`, existsSync(join(ROOT, 'www', href)));
}

// --- 화면 이름이 CSS와 맞는가 ----------------------------------------------------
{
  const css = read('www/css/style.css');
  const screens = uniq(all(gameJs, /setScreen\('([^']+)'\)/g));
  for (const s of screens) {
    ok(`화면 '${s}' 을 보여주는 CSS 규칙이 있다`,
      css.includes(`[data-screen="${s}"]`), '이 화면은 영원히 안 보인다');
  }
}

// --- 저장 키가 설정 UI와 맞는가 ---------------------------------------------------
{
  const storage = read('www/js/storage.js');
  for (const key of ['sound', 'vibrate', 'instant', 'level', 'first']) {
    ok(`설정 키 '${key}' 가 저장 기본값에 있다`, new RegExp(`^\\s+${key}:`, 'm').test(storage));
  }
  // ui.js의 체크박스 id와 onSettingChange가 넘기는 키가 어긋나면 설정이 저장 안 된다.
  for (const id of ['opt-sound', 'opt-vibrate', 'opt-instant']) {
    ok(`체크박스 id="${id}" 가 HTML에 있다`, htmlIds.includes(id));
  }
}

// --- 워커 경로 ---------------------------------------------------------------------
{
  ok('ai-worker.js가 존재한다', existsSync(join(ROOT, 'www/js/ai-worker.js')));
  ok('워커를 모듈 타입으로 만든다', /type:\s*'module'/.test(gameJs),
    'type:module이 없으면 워커 안에서 import가 죽는다');
}

report('wiring.test');
