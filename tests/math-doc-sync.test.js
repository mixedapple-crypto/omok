/**
 * 숫자숲 친구들 — 코드와 지침서의 수치 동기화 검사.
 *
 * 규약: 게임의 보상·진행 수치를 바꾸면 `documents/숫자숲-친구들-지침서.md`도 같이 고친다.
 * 이 검사는 그 규약이 지켜졌는지를 기계로 확인한다.
 *
 * 왜 문서에 "고쳐라"라고 적는 것으로 부족한가. 지침서는 부모가 코드를 안 열고 보려고 만든
 * 문서라서, 틀린 채로 방치되면 **틀렸다는 사실 자체를 아무도 모른다.** 코드를 읽는 사람은
 * 문서를 안 보고, 문서를 보는 사람은 코드를 안 읽기 때문이다. 그래서 어긋나는 순간
 * npm test가 깨지게 만들어 둔다. GitHub Pages 배포도 npm test를 게이트로 쓰므로
 * 문서가 낡으면 배포가 막힌다.
 *
 * 검사가 깨졌을 때 할 일: 코드와 문서 중 어느 쪽이 맞는지 정하고 **양쪽을 함께** 고친다.
 * 문서 쪽 숫자만 고쳐서 통과시키는 것도 정상적인 해결이다 — 규약의 목적은 코드를 지키는
 * 것이 아니라 둘이 어긋난 채로 남지 않게 하는 것이다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ok, eq, report } from './_assert.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const html = readFileSync(join(root, 'www', 'math', 'index.html'), 'utf8');
const doc = readFileSync(join(root, 'documents', '숫자숲-친구들-지침서.md'), 'utf8');

const source = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'));
const mod = { exports: {} };
new Function('module', source)(mod);
const { xpForLevel, foeMaxHP, PET_FORMS } = mod.exports;

/** 코드에서 상수를 정규식으로 캐낸다. 못 찾으면 이름이 바뀐 것이므로 검사를 실패시킨다. */
function constOf(name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*(\\d+)`).exec(source);
  return m ? Number(m[1]) : null;
}

/**
 * 지침서가 "label과 value를 같은 줄에서" 말하고 있는지 본다.
 *
 * label이 여러 줄에 나오면 전부 살펴 하나라도 맞으면 통과다. 같은 낱말이 요약표와
 * 본문 표에 동시에 등장하는 일이 흔해서(예: "전투에서 이긴다"), 첫 줄만 보면
 * 엉뚱한 줄을 잡고 실패한다.
 */
function claims(what, label, value) {
  const lines = doc.split('\n').filter((l) => l.includes(label));
  if (lines.length === 0) {
    ok(what, false, `지침서에서 "${label}" 항목을 찾지 못했다. 문서에서 이 항목이 지워졌거나 이름이 바뀌었다.`);
    return;
  }
  const hit = lines.some((l) => l.includes(String(value)));
  ok(what, hit, `코드는 ${value}인데 지침서의 어느 줄에도 없다. 살펴본 줄:\n      ${lines.map((l) => l.trim()).join('\n      ')}`);
}

/** 지침서에서 헤더 줄로 표를 찾아 본문 줄만 돌려준다. */
function tableRows(headerFragment) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.includes(headerFragment) && l.startsWith('|'));
  if (start < 0) return null;
  const rows = [];
  // 헤더 바로 아래 구분선(|---|---|)을 건너뛴 뒤, 표가 끝날 때까지 모은다.
  for (let i = start + 2; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i]);
  return rows;
}

/* --- 전투 상수 --- */

const ME_MAX = constOf('ME_MAX');
const ATK = constOf('ATK');
const CRIT = constOf('CRIT');
const FOE_ATK = constOf('FOE_ATK');

ok('전투 상수 네 개를 코드에서 찾았다', [ME_MAX, ATK, CRIT, FOE_ATK].every((v) => typeof v === 'number'),
  `ME_MAX=${ME_MAX} ATK=${ATK} CRIT=${CRIT} FOE_ATK=${FOE_ATK}`);

claims('지침서의 콩이 체력이 코드와 같다', '콩이의 체력', ME_MAX);
claims('지침서의 공격력이 코드와 같다', '정답 시 공격력', ATK);
claims('지침서의 크리티컬 공격력이 코드와 같다', '크리티컬 공격력', CRIT);
claims('지침서의 오답 피해가 코드와 같다', '오답 시 받는 피해', FOE_ATK);

// 적 체력은 스테이지에 따라 변하므로 1번 스테이지 값에서 기준 상수를 역산한다.
claims('지침서의 일반 적 체력 공식이 코드와 같다', '일반 스테이지 적 체력', foeMaxHP(1, false) - 1);
claims('지침서의 보스 적 체력 공식이 코드와 같다', '보스 스테이지 적 체력', foeMaxHP(1, true) - 1);

// "한 판에서 일곱 번 틀리면 패배" 같은 파생 서술도 상수가 바뀌면 거짓이 된다.
const lethalMisses = Math.ceil(ME_MAX / FOE_ATK);
claims('지침서의 "몇 번 틀리면 패배"가 체력과 오답 피해에서 실제로 나온다', '틀리면 패배', lethalMisses);

/* --- 용돈 --- */

const Q1 = constOf('Q1_COIN');
const Q2 = constOf('Q2_COIN');
const QW = constOf('QW_COIN');
const QW_WINS = constOf('QW_WINS');

ok('퀘스트 상수 네 개를 코드에서 찾았다', [Q1, Q2, QW, QW_WINS].every((v) => typeof v === 'number'),
  `Q1=${Q1} Q2=${Q2} QW=${QW} QW_WINS=${QW_WINS}`);

claims('지침서의 일일 퀘스트 1 보상이 코드와 같다', '오늘 3판 이기기', `${Q1}원`);
claims('지침서의 일일 퀘스트 2 보상이 코드와 같다', '별 세 개로 이기기', `${Q2}원`);
claims('지침서의 주간 퀘스트 보상이 코드와 같다', `이번 주 ${QW_WINS}판 이기기`, `${QW}원`);

// 승리 보상은 상수가 아니라 win() 안에 박혀 있다: a.boss?5:1
const winCoins = /got\s*=\s*B\.isReplay\s*\?\s*0\s*:\s*\(\s*a\.boss\s*\?\s*(\d+)\s*:\s*(\d+)\s*\)/.exec(source);
ok('승리 용돈 계산식을 코드에서 찾았다', !!winCoins, 'win() 안의 got 계산식이 바뀌었다면 이 정규식을 고쳐야 한다');
if (winCoins) {
  claims('지침서의 일반 승리 용돈이 코드와 같다', '일반 스테이지 승리', `${winCoins[2]}원`);
  claims('지침서의 보스 승리 용돈이 코드와 같다', '보스 스테이지 승리', `${winCoins[1]}원`);
}

/* --- 경험치 획득량 --- */

const xpPerCorrect = /S\.xp\s*\+=\s*(\d+);/.exec(source);
ok('정답당 경험치를 코드에서 찾았다', !!xpPerCorrect);
if (xpPerCorrect) claims('지침서의 정답당 경험치가 코드와 같다', '문제 하나를 맞힌다', `+${xpPerCorrect[1]}`);

const xpPerWin = /S\.coins\s*\+=\s*got;\s*S\.xp\s*\+=\s*(\d+);/.exec(source);
ok('승리 경험치를 코드에서 찾았다', !!xpPerWin);
if (xpPerWin) claims('지침서의 승리 경험치가 코드와 같다', '전투에서 이긴다', `+${xpPerWin[1]}`);

/* --- 콩이의 모습 --- */

const formRows = tableRows('필요 누적 경험치');
ok('지침서에서 콩이 모습 표를 찾았다', !!formRows, '표 헤더가 바뀌면 이 검사의 기준 문구를 고쳐야 한다');

// 개수를 맞춰 두면 **코드에서 지운 모습이 문서에 남는** 경우도 잡힌다.
// 아래 개별 검사는 코드에 있는 것이 문서에 있는지만 보므로 반대 방향은 못 본다.
if (formRows) eq('지침서가 코드와 같은 개수의 모습을 싣고 있다', formRows.length, PET_FORMS.length);

PET_FORMS.forEach((f) => {
  const line = (formRows || []).find((l) => l.includes(f.f) && l.includes(f.n));
  if (!line) {
    ok(`지침서에 ${f.n}(${f.f})가 실려 있다`, false, '코드에 있는 모습이 문서의 표에 없다');
    return;
  }
  const wantXp = xpForLevel(f.minLv);
  ok(`지침서의 ${f.n} 문턱이 코드와 같다`,
    line.includes(`| ${f.minLv} |`) && line.includes(String(wantXp)),
    `코드: Lv.${f.minLv} / 누적 ${wantXp}\n      문서: ${line.trim()}`);
});

/* --- 레벨 표 --- */

// 지침서의 레벨 표는 "| 레벨 | 누적 | 다음까지 |" 세 칸이 전부 숫자인 유일한 표다.
const lvRows = [...doc.matchAll(/^\| (\d+) \| (\d+) \| (\d+) \|$/gm)]
  .map((m) => ({ lv: Number(m[1]), cum: Number(m[2]), next: Number(m[3]) }));

ok('지침서에서 레벨 표를 찾았다', lvRows.length > 0, '표 형식이 바뀌면 이 정규식을 고쳐야 한다');

const badRows = lvRows.filter(
  (r) => xpForLevel(r.lv) !== r.cum || xpForLevel(r.lv + 1) - xpForLevel(r.lv) !== r.next
);
ok('레벨 표의 모든 줄이 코드의 곡선과 일치한다', badRows.length === 0,
  badRows.map((r) => `Lv.${r.lv}: 문서 ${r.cum}/${r.next} vs 코드 ${xpForLevel(r.lv)}/${xpForLevel(r.lv + 1) - xpForLevel(r.lv)}`).join('\n      '));

/* --- 그 밖의 규칙 --- */

const reviewRate = /Math\.random\(\)\s*<\s*\.(\d+)/.exec(source);
ok('복습 문제 확률을 코드에서 찾았다', !!reviewRate);
if (reviewRate) claims('지침서의 복습 문제 확률이 코드와 같다', '오답 풀에서 하나를 꺼내며', `${reviewRate[1]}%`);

const poolCap = /S\.wrongPool\.length\s*>\s*(\d+)/.exec(source);
if (poolCap) claims('지침서의 오답 풀 상한이 코드와 같다', '오답 풀에는 최대', poolCap[1]);

const storageKey = /var KEY\s*=\s*'([^']+)'/.exec(source);
ok('저장 키를 코드에서 찾았다', !!storageKey);
if (storageKey) claims('지침서의 저장 키가 코드와 같다', 'localStorage', storageKey[1]);

/* --- 문서가 코드의 이름을 가리키는 곳 --- */

// 마지막 절의 "찾을 이름" 표는 실제로 존재하는 식별자여야 한다.
const referenced = [...doc.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`/g)].map((m) => m[1]);
const identifiers = [...new Set(referenced)].filter((n) => n.length > 2 && n !== 'localStorage');
const missing = identifiers.filter((n) => !new RegExp(`\\b${n}\\b`).test(source));
ok('지침서가 가리키는 코드 이름이 전부 실제로 존재한다', missing.length === 0,
  `코드에 없는 이름: ${missing.join(', ')}`);

report('math 문서 동기화');
