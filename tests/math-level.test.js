/**
 * 숫자숲 친구들 — 레벨 곡선 테스트.
 *
 * 이 검사가 존재하는 이유는 하나다. 레벨 곡선을 건드리면 **이미 저장된 아이 데이터의
 * 레벨이 내려가** 콩이가 퇴화할 수 있다. 화면에서는 그냥 "어제보다 약해진 강아지"로
 * 보일 뿐이라 눈으로는 원인을 못 잡는다. 반면 순수 계산이라 정확히 잴 수 있다.
 *
 * math 게임은 단일 HTML이라 import할 모듈이 없다. <script> 본문을 꺼내서 함수로
 * 감싸 돌린다 — document가 없는 Node에서는 DOM 블록이 통째로 건너뛰어지도록
 * 원본이 `typeof document!=='undefined'`로 감싸여 있다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ok, eq, report } from './_assert.js';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'www', 'math', 'index.html'), 'utf8');

const open = html.indexOf('<script>');
const close = html.indexOf('</script>');
if (open < 0 || close < 0) throw new Error('math/index.html에서 <script> 블록을 찾지 못했다');
const source = html.slice(open + '<script>'.length, close);

const mod = { exports: {} };
new Function('module', source)(mod);
const { xpForLevel, levelFromXp, petFormFor, PET_FORMS } = mod.exports;

ok('스크립트에서 레벨 함수를 꺼냈다', typeof xpForLevel === 'function' && typeof levelFromXp === 'function');

/* --- 곡선의 모양 --- */

eq('Lv.1은 경험치 0에서 시작', xpForLevel(1), 0);

// 문서(docs/숫자숲-친구들-지침서.md)에 적힌 숫자를 그대로 고정한다.
// 곡선을 바꾸면 여기서 깨지고, 그때 문서도 같이 고치라는 신호가 된다.
eq('Lv.4(씩씩한 콩이) 문턱', xpForLevel(4), 48);
eq('Lv.8(슈퍼 콩이) 문턱', xpForLevel(8), 168);
eq('Lv.13(요술 콩이) 문턱', xpForLevel(13), 408);
eq('Lv.20(무지개 콩이) 문턱', xpForLevel(20), 912);
eq('Lv.30(전설의 콩이) 문턱', xpForLevel(30), 1972);

let gapsGrow = true;
let prevGap = -1;
for (let n = 1; n <= 60; n++) {
  const gap = xpForLevel(n + 1) - xpForLevel(n);
  if (gap <= prevGap) gapsGrow = false;
  prevGap = gap;
}
ok('레벨 간격이 갈수록 넓어진다 (올라갈수록 어려워짐)', gapsGrow);
eq('첫 레벨업은 12', xpForLevel(2) - xpForLevel(1), 12);
eq('간격은 4씩 벌어진다', xpForLevel(3) - xpForLevel(2), 16);

/* --- levelFromXp가 곡선의 정확한 역함수인가 --- */

let inverseOk = true;
for (let n = 1; n <= 60; n++) {
  if (levelFromXp(xpForLevel(n)) !== n) inverseOk = false;
  if (n > 1 && levelFromXp(xpForLevel(n) - 1) !== n - 1) inverseOk = false;
}
ok('문턱 경험치에서 정확히 레벨이 오른다 (1 모자라면 안 오른다)', inverseOk);

let monotonic = true;
for (let xp = 0, prev = 0; xp <= 3000; xp++) {
  const lv = levelFromXp(xp);
  if (lv < prev) monotonic = false;
  prev = lv;
}
ok('경험치가 늘면 레벨은 절대 내려가지 않는다', monotonic);

eq('경험치 0이면 Lv.1', levelFromXp(0), 1);
eq('음수가 들어와도 Lv.1로 버틴다', levelFromXp(-100), 1);

/* --- 저장 데이터 마이그레이션: 콩이는 절대 퇴화하지 않는다 --- */

// 예전 곡선은 레벨당 25 고정이었고, 형태는 Lv.1/4/8 세 가지뿐이었다.
const oldLevel = (xp) => 1 + Math.floor(xp / 25);
const OLD_FORMS = [{ minLv: 8, n: '슈퍼 콩이' }, { minLv: 4, n: '씩씩한 콩이' }, { minLv: 1, n: '콩이' }];
const oldForm = (lv) => OLD_FORMS.find((f) => lv >= f.minLv) ?? OLD_FORMS[OLD_FORMS.length - 1];

let neverDowngrades = true;
let worst = null;
for (let xp = 0; xp <= 3000; xp++) {
  const before = oldForm(oldLevel(xp));
  const after = petFormFor(levelFromXp(xp));
  if (after.minLv < before.minLv) {
    neverDowngrades = false;
    if (!worst) worst = `경험치 ${xp}: ${before.n} → ${after.n}`;
  }
}
ok('옛 저장 데이터의 어떤 경험치에서도 콩이 모습이 뒤로 가지 않는다', neverDowngrades, worst ?? '');

let neverLoseLevel = true;
for (let xp = 0; xp <= 175; xp++) {
  if (levelFromXp(xp) < oldLevel(xp)) neverLoseLevel = false;
}
ok('Lv.8 구간까지는 새 곡선이 옛 곡선보다 싸다 (레벨 손실 없음)', neverLoseLevel);

/* --- 형태 테이블 --- */

eq('형태는 여섯 단계', PET_FORMS.length, 6);

let descending = true;
for (let i = 1; i < PET_FORMS.length; i++) {
  if (PET_FORMS[i].minLv >= PET_FORMS[i - 1].minLv) descending = false;
}
ok('PET_FORMS는 내림차순 — petFormFor가 첫 일치를 고르므로 순서가 곧 정확성', descending);

eq('Lv.1은 콩이', petFormFor(1).n, '콩이');
eq('Lv.7은 아직 씩씩한 콩이', petFormFor(7).n, '씩씩한 콩이');
eq('Lv.8에서 슈퍼 콩이', petFormFor(8).n, '슈퍼 콩이');
eq('Lv.13에서 요술 콩이', petFormFor(13).n, '요술 콩이');
eq('Lv.20에서 무지개 콩이', petFormFor(20).n, '무지개 콩이');
eq('Lv.30에서 전설의 콩이', petFormFor(30).n, '전설의 콩이');
eq('Lv.99도 전설의 콩이에서 멈춘다', petFormFor(99).n, '전설의 콩이');
eq('Lv.0 같은 이상값도 콩이로 버틴다', petFormFor(0).n, '콩이');

const faces = PET_FORMS.map((f) => f.f);
ok('여섯 형태의 이모지가 서로 다르다', new Set(faces).size === faces.length, faces.join(' '));

// 적으로 쓰이는 이모지를 펫이 물려받으면 아이가 헷갈린다 (늑대두목🐺 같은 것).
const ENEMY_FACES = ['🐛', '🦟', '🐜', '🕷️', '🐻', '🦀', '🐍', '🦎', '🐙', '🦦',
  '🦇', '👾', '👻', '🎃', '🦉', '☃️', '🧊', '🐺', '👹', '🐻‍❄️'];
const collision = faces.filter((f) => ENEMY_FACES.includes(f));
ok('펫 이모지가 적 이모지와 겹치지 않는다', collision.length === 0, collision.join(' '));

report('math 레벨 곡선');
