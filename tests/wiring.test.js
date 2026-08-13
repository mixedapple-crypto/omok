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

// --- 크기 지정 권한이 한 곳에만 있는가 (실제로 났던 결함) ---------------------------
{
  const css = read('www/css/style.css');
  const renderJs = read('www/js/render.js');

  ok('render.js가 캔버스 크기를 직접 지정한다', /style\.width\s*=/.test(renderJs));

  // #board 규칙 안에서 크기를 정하면 인라인 스타일과 충돌한다.
  // CSS의 max-width는 인라인 width보다 우선하므로, 캔버스가 찌그러지고 터치 좌표가 어긋난다.
  // 화면상으로는 멀쩡해 보여서 실기기에서만 드러나는 종류의 결함이다.
  const boardRules = [...css.matchAll(/#board\s*\{([^}]*)\}/g)].map((m) => m[1]);
  ok('#board 규칙이 존재한다', boardRules.length > 0);
  for (const body of boardRules) {
    const offenders = ['width', 'height', 'max-width', 'max-height', 'min-width', 'min-height', 'aspect-ratio']
      .filter((prop) => new RegExp(`(^|[;\\s])${prop}\\s*:`).test(body));
    ok('CSS가 #board 크기를 건드리지 않는다 — 크기 권한은 render.js 한 곳에만',
      offenders.length === 0, `발견된 속성: ${offenders.join(', ')}`);
  }
}

// --- 화면 배치 조건 ------------------------------------------------------------------
{
  const css = read('www/css/style.css');
  // 아이패드는 눕혀도 높이가 800px 안팎이라 옆구리 배치가 오히려 손해다.
  // 조건이 "가로"만이면 넓은 화면에서 판이 쓸데없이 작아진다.
  const landscape = css.match(/@media\s*\(orientation:\s*landscape\)([^{]*)\{/);
  ok('옆구리 배치는 가로 + 낮은 화면일 때만 켜진다',
    landscape !== null && /max-height/.test(landscape[1]),
    landscape ? `조건: (orientation: landscape)${landscape[1].trim()}` : '가로 미디어쿼리를 못 찾았다');
}

// --- 홈 화면에 추가 (아이패드) -------------------------------------------------------
{
  ok('매니페스트가 존재한다', existsSync(join(ROOT, 'www/manifest.webmanifest')));
  const mf = JSON.parse(read('www/manifest.webmanifest'));

  eq('전체화면으로 뜬다', mf.display, 'standalone');
  // 하위 경로(/omok/)로 서빙되므로 절대경로를 쓰면 홈 화면에서 열 때 404가 난다.
  ok('start_url이 상대경로', !mf.start_url.startsWith('/'), `실제: ${mf.start_url}`);
  ok('scope가 상대경로', !mf.scope.startsWith('/'), `실제: ${mf.scope}`);

  for (const icon of mf.icons) {
    ok(`매니페스트 아이콘이 실제로 있다: ${icon.src}`, existsSync(join(ROOT, 'www', icon.src)));
    ok(`아이콘 경로가 상대경로: ${icon.src}`, !icon.src.startsWith('/'));
  }

  // 이게 없으면 iOS가 페이지 스크린샷을 아이콘으로 써버린다.
  const touchIcon = html.match(/<link[^>]+rel="apple-touch-icon"[^>]+href="([^"]+)"/);
  ok('apple-touch-icon이 선언돼 있다', touchIcon !== null);
  if (touchIcon) {
    ok(`apple-touch-icon 파일이 있다: ${touchIcon[1]}`, existsSync(join(ROOT, 'www', touchIcon[1])));
  }
  ok('HTML이 매니페스트를 참조한다', /rel="manifest"/.test(html));
  ok('iOS 전체화면 메타가 있다', /name="apple-mobile-web-app-capable"/.test(html));

  // 상태바 아래까지 그리므로 safe-area 여백이 없으면 HUD가 노치·상태바에 가린다.
  const css = read('www/css/style.css');
  const translucent = /content="black-translucent"/.test(html);
  ok('상태바 아래까지 쓰면 safe-area 여백이 있어야 한다',
    !translucent || /env\(safe-area-inset-top\)/.test(css));
}

// --- 워커 경로 ---------------------------------------------------------------------
{
  ok('ai-worker.js가 존재한다', existsSync(join(ROOT, 'www/js/ai-worker.js')));
  ok('워커를 모듈 타입으로 만든다', /type:\s*'module'/.test(gameJs),
    'type:module이 없으면 워커 안에서 import가 죽는다');
}

report('wiring.test');
