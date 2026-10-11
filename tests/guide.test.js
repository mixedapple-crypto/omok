/**
 * 부모님 안내(`www/guide/`) — 지침서에서 만든 생성물이 지금 지침서와 같은지 대조한다.
 *
 * 안내 페이지는 지침서의 사본이다. 사본은 손으로 고치는 순간 정본과 갈라지고, 갈라진 줄
 * 아무도 모른다(예전의 claude.ai 아티팩트 사본이 그랬다). 그래서 생성기를 그대로 다시 돌려
 * 커밋된 파일과 한 글자까지 비교한다. 깨지면 `npm run guide`를 돌리고 함께 커밋한다.
 *
 * 그 밖에 생성기 바깥에서 조용히 깨질 수 있는 연결을 본다:
 *   - 새 지침서를 만들고 생성기 목록에 안 넣으면 그 게임만 안내에서 빠진다.
 *   - 포털 워커의 캐시 목록에 페이지가 빠지면 그 페이지만 오프라인에서 안 열린다.
 *   - 포털 화면에서 입구 링크가 사라지면 기능은 있는데 아무도 못 찾는다(구구단 🔒의 교훈).
 *   - 제외 표시를 잘못 닫으면 개발용 절(코드 위치·저장 데이터)이 부모 화면에 샌다.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ok, eq, report } from './_assert.js';
import { buildGuide, GUIDES, parentLines, MARK_START } from '../scripts/build-guide.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/* --- 생성물이 지금 지침서와 같다 --- */

const built = buildGuide(root);
for (const [rel, html] of Object.entries(built)) {
  const path = join(root, rel);
  const onDisk = existsSync(path) ? readFileSync(path, 'utf8') : null;
  ok(`${rel}가 지금 지침서에서 만든 것과 같다`, onDisk === html,
    onDisk === null ? '파일이 없다 — npm run guide를 돌려라' : '지침서가 바뀌었는데 안내를 다시 만들지 않았다 — npm run guide를 돌려라');
}

const onDiskPages = readdirSync(join(root, 'www', 'guide')).filter((f) => f.endsWith('.html')).sort();
const builtPages = Object.keys(built).map((r) => r.split('/').pop()).sort();
eq('www/guide/에 생성기가 모르는 페이지가 없다', onDiskPages.join(','), builtPages.join(','));

/* --- 지침서가 전부 안내에 들어 있다 --- */

const docs = readdirSync(join(root, 'documents')).filter((f) => f.endsWith('-지침서.md'));
const listed = GUIDES.map((g) => g.doc);
const missingDocs = docs.filter((d) => !listed.includes(d));
ok('documents/의 지침서가 전부 안내 목록에 있다', missingDocs.length === 0,
  `안내에 없는 지침서: ${missingDocs.join(', ')} — scripts/build-guide.js의 GUIDES에 넣어라`);

/* --- 개발용 절이 새지 않는다 --- */

for (const g of GUIDES) {
  const md = readFileSync(join(root, 'documents', g.doc), 'utf8');
  ok(`${g.doc}에 제외 표시가 있다`, md.split('\n').some((l) => l.trim() === MARK_START),
    '코드 위치·저장 데이터 절을 감싸지 않으면 그대로 부모 화면에 나간다');
  const kept = parentLines(md, g.doc).join('\n');
  // 개발용 절의 제목과 코드 경로는 제외 구간 밖에 있으면 안 된다.
  const leaks = ['## 저장 데이터', '## 값을 바꾸고 싶을 때', '## 숫자를 바꾸고 싶을 때', '### 읽기 좋은 사본', 'www/', 'tests/', 'npm ']
    .filter((s) => kept.includes(s));
  ok(`${g.doc}의 개발용 내용이 안내에 들어가지 않는다`, leaks.length === 0, `새는 것: ${leaks.join(', ')}`);
}

/* --- 페이지 안의 링크가 살아 있다 --- */

for (const [rel, html] of Object.entries(built)) {
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  const dead = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]).filter((k) => !ids.has(k));
  ok(`${rel}의 페이지 안 링크가 모두 제목을 가리킨다`, dead.length === 0, `없는 앵커: ${dead.join(', ')}`);
  const local = [...html.matchAll(/href="\.\/([a-z]+\.html)"/g)].map((m) => m[1]);
  const broken = local.filter((f) => !builtPages.includes(f));
  ok(`${rel}의 다른 안내 페이지 링크가 살아 있다`, broken.length === 0, `없는 페이지: ${broken.join(', ')}`);
}

/* --- 포털에서 들어갈 수 있고, 오프라인에서도 열린다 --- */

const portal = readFileSync(join(root, 'www', 'index.html'), 'utf8');
ok('포털 화면에 부모님 안내 입구가 있다', /<a [^>]*href="\.\/guide\/"/.test(portal));

const sw = readFileSync(join(root, 'www', 'sw.js'), 'utf8');
const assets = /const ASSETS = \[([\s\S]*?)\];/.exec(sw);
ok('포털 워커의 캐시 목록을 찾았다', !!assets);
if (assets) {
  const want = ['./guide/', ...builtPages.map((f) => `./guide/${f}`)];
  const absent = want.filter((p) => !assets[1].includes(`'${p}'`));
  ok('안내 페이지가 전부 포털 워커의 캐시 목록에 있다', absent.length === 0, `빠진 것: ${absent.join(', ')}`);
}

report('부모님 안내');
