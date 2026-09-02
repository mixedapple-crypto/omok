/**
 * 구구단 로켓 HTML ↔ JS 배선 정합성 검사. 오목의 wiring.test와 같은 취지다.
 *
 * 브라우저 없이 도는 이유: 오타 하나로 버튼이 아무 반응도 안 하는 종류의 결함은 문자열 대조만으로 전부 잡힌다
 * (id 오타, 핸들러 없는 data-action, 없는 파일 참조, 캐시 목록 누락). 엔진이 DOM이나 시계를 몰래 쓰는지도 본다.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ok, eq, report } from './_assert.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const G = 'www/gugudan';
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const all = (text, re) => [...text.matchAll(re)].map((m) => m[1]);
const uniq = (a) => [...new Set(a)];

for (const f of ['index.html', 'css/style.css', 'sw.js', 'js/app.js', 'js/ui.js', 'js/audio.js', 'js/engine.js', 'js/store.js']) {
  ok(`파일이 있다: ${G}/${f}`, existsSync(join(ROOT, G, f)));
}

const html = read(`${G}/index.html`);
const appJs = read(`${G}/js/app.js`);
const uiJs = read(`${G}/js/ui.js`);
const css = read(`${G}/css/style.css`);
const engine = read(`${G}/js/engine.js`);
const sw = read(`${G}/sw.js`);

// --- data-action ↔ 핸들러 --------------------------------------------------------------
{
  const htmlActions = uniq(all(html, /data-action="([^"]+)"/g));
  ok('HTML에 data-action이 있다', htmlActions.length >= 10, `${htmlActions.length}개`);
  const start = appJs.indexOf('const ACTIONS');
  ok('app.js에 ACTIONS 객체가 있다(오목 관례)', start >= 0);
  if (start >= 0) {
    const block = appJs.slice(start);
    const keys = uniq([...all(block, /^\s*'([a-z0-9-]+)':/gm), ...all(block, /^\s*([a-z][A-Za-z0-9]*)[,:]/gm)]);
    for (const a of htmlActions) ok(`data-action="${a}" 에 핸들러가 있다`, keys.includes(a) || appJs.includes(`'${a}'`));
  }
}

// --- ui.js가 찾는 id ------------------------------------------------------------------
{
  const htmlIds = uniq(all(html, /\bid="([^"]+)"/g));
  const wanted = uniq([...all(uiJs, /\$\('#([^']+)'\)/g), ...all(uiJs, /getElementById\('([^']+)'\)/g), ...all(appJs, /getElementById\('([^']+)'\)/g), ...all(appJs, /\$\('#([^']+)'\)/g)]);
  ok('JS가 id를 참조한다', wanted.length >= 5, `${wanted.length}개`);
  for (const id of wanted) ok(`id="${id}" 가 HTML에 있다`, htmlIds.includes(id));
  eq('id가 중복되지 않는다', htmlIds.length, all(html, /\bid="([^"]+)"/g).length);
}

// --- 화면 이름이 CSS와 맞는가 --------------------------------------------------------------
{
  const screens = uniq([...all(appJs, /setScreen\('([^']+)'\)/g), ...all(uiJs, /setScreen\('([^']+)'\)/g)]);
  ok('화면이 여덟 개 이상', screens.length >= 8, screens.join(', '));
  for (const s of screens) {
    ok(`화면 '${s}' 을 보여주는 CSS 규칙이 있다`, css.includes(`[data-screen="${s}"]`) || css.includes(`data-screen="${s}"`), '이 화면은 영원히 안 보인다');
  }
}

// --- HTML이 참조하는 파일 ----------------------------------------------------------------
for (const href of [...all(html, /<link[^>]+href="([^"]+)"/g), ...all(html, /<script[^>]+src="([^"]+)"/g)]) {
  if (/^https?:/.test(href)) { ok(`외부 참조는 Google Fonts뿐: ${href}`, /^https:\/\/fonts\.g(oogleapis|static)\.com/.test(href)); continue; }
  ok(`참조 파일이 존재한다: ${href}`, existsSync(join(ROOT, G, href)));
}

// --- 오프라인 캐시: app.js에서 import로 닿는 모듈 전부 ------------------------------------------
{
  const cached = all(sw, /'(\.\/[^']*)'/g);
  const seen = new Set();
  const queue = ['app.js'];
  while (queue.length) {
    const f = queue.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const dep of all(read(`${G}/js/${f}`), /from\s+'\.\/([^']+)'/g)) queue.push(dep);
  }
  for (const f of ['./index.html', './css/style.css', ...[...seen].map((f) => `./js/${f}`)]) {
    ok(`캐시 목록에 있다: ${f}`, cached.includes(f));
  }
  ok('캐시 이름은 gugudan- 접두사', /gugudan-\$\{VERSION\}|gugudan-'\s*\+\s*VERSION/.test(sw));
  ok('캐시 버전을 CI가 주입한다', /__BUILD__/.test(sw));
  ok('activate에서 자기 접두사만 지운다', /startsWith\('gugudan-'\)/.test(sw));
  ok('CI가 gugudan 워커의 버전을 치환한다', read('.github/workflows/pages.yml').includes('www/gugudan/sw.js'));
  ok('app.js가 서비스 워커를 등록한다', /serviceWorker\.register\('\.\/sw\.js'\)/.test(appJs));
}

// --- 엔진은 순수하다 (주석은 빼고 코드만 본다 — 머리 주석이 "Date.now()도 없다"고 말한다) ----------------
{
  const code = engine.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  ok('engine.js는 document를 모른다', !/\bdocument\b/.test(code));
  ok('engine.js는 Date.now()를 부르지 않는다', !/Date\.now\(/.test(code));
  ok('engine.js는 localStorage를 모른다', !/localStorage/.test(code));
}

// --- 입력 규칙의 흔적 --------------------------------------------------------------------
ok('확정 키가 있다', /확정/.test(html));
ok('지우기 키가 있다', /지우기/.test(html));
ok('앱이 performance.now로 시간을 잰다', /performance\.now\(/.test(appJs));
ok('숨겨졌을 때 문제를 무효화한다', /visibilitychange/.test(appJs) && /sessionSkip/.test(appJs));
ok('오디오 잠금 해제는 click·pointerup에서', /addEventListener\('(click|pointerup)'[^)]*unlock/.test(appJs) || /'(click|pointerup)',\s*\(\)\s*=>\s*audio\.unlock/.test(appJs));

report('gugudan-wiring.test');
