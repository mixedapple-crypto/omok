/**
 * 곱셈 바다 — 코드와 지침서(`documents/곱셈-바다-지침서.md`)의 수치 동기화 검사.
 *
 * `math-doc-sync`와 같은 규약이다. 지침서는 부모가 코드를 안 열고 보는 문서라 틀린 채로
 * 남으면 틀렸다는 사실을 아무도 모른다. 그래서 어긋나는 순간 npm test가 죽게 해 둔다.
 * 깨지면 코드와 문서 중 어느 쪽이 맞는지 정하고 **양쪽을 함께** 고친다. 검사를 느슨하게
 * 만들어 통과시키지 말 것.
 *
 * 곱셈 바다만의 것(적 체력 네 갈래, 문제 유형별 시간표, 판 단위 덧시간, 구역·보스 이름)을
 * 중심으로 보고, 숫자숲과 같은 용돈 규칙은 금액이 갈라지지 않는지까지 본다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ok, eq, report } from './_assert.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const html = readFileSync(join(root, 'www', 'mul', 'index.html'), 'utf8');
const doc = readFileSync(join(root, 'documents', '곱셈-바다-지침서.md'), 'utf8');

const source = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'));
const mod = { exports: {} };
new Function('module', source)(mod);
const { foeMaxHP, PET_FORMS, ZONES, ANIMALS, MIX, TIME, STAGE_BONUS, QUEST_COIN, QW_WINS, isDivStage } = mod.exports;

function constOf(name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*(\\d+)`).exec(source);
  return m ? Number(m[1]) : null;
}

/** label이 나오는 줄 가운데 하나라도 value를 함께 말하면 통과. (math-doc-sync와 같은 방식) */
function claims(what, label, value) {
  const lines = doc.split('\n').filter((l) => l.includes(label));
  if (lines.length === 0) {
    ok(what, false, `지침서에서 "${label}" 항목을 찾지 못했다`);
    return;
  }
  const hit = lines.some((l) => l.includes(String(value)));
  ok(what, hit, `코드는 ${value}인데 지침서의 어느 줄에도 없다. 살펴본 줄:\n      ${lines.map((l) => l.trim()).join('\n      ')}`);
}

function tableRows(headerFragment) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.includes(headerFragment) && l.startsWith('|'));
  if (start < 0) return null;
  const rows = [];
  for (let i = start + 2; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i]);
  return rows;
}

/* --- 전투 상수 --- */

const ME_MAX = constOf('ME_MAX');
const ATK = constOf('ATK');
const CRIT = constOf('CRIT');
const FOE_ATK = constOf('FOE_ATK');
ok('전투 상수 네 개를 코드에서 찾았다', [ME_MAX, ATK, CRIT, FOE_ATK].every((v) => typeof v === 'number'));
claims('지침서의 파랑이 체력이 코드와 같다', '파랑이의 체력', `| ${ME_MAX} |`);
claims('지침서의 공격력이 코드와 같다', '정답 시 공격력', `| ${ATK} |`);
claims('지침서의 크리티컬 공격력이 코드와 같다', '크리티컬 공격력', `| ${CRIT} |`);
claims('지침서의 오답 피해가 코드와 같다', '오답 시 받는 피해', `| ${FOE_ATK} |`);
claims('지침서의 "몇 번 틀리면 패배"가 체력과 오답 피해에서 실제로 나온다', '틀리면 패배', Math.ceil(ME_MAX / FOE_ATK));

/* 적 체력은 곱셈·나눗셈 × 일반·보스 네 갈래다. 그 구역 첫 스테이지에서 기준치를 역산한다. */
const mulStage = 1;
const divStage = Object.keys(MIX).map(Number).find((s) => isDivStage(s));
claims('지침서의 곱셈 일반 적 체력이 코드와 같다', '곱셈 일반 스테이지 적 체력', `${foeMaxHP(mulStage, false) - mulStage} + 스테이지`);
claims('지침서의 곱셈 보스 적 체력이 코드와 같다', '곱셈 보스 적 체력', `${foeMaxHP(mulStage, true) - mulStage} + 스테이지`);
claims('지침서의 나눗셈 일반 적 체력이 코드와 같다', '나눗셈 일반 스테이지 적 체력', `${foeMaxHP(divStage, false) - divStage} + 스테이지`);
claims('지침서의 나눗셈 보스 적 체력이 코드와 같다', '나눗셈 보스 적 체력', `${foeMaxHP(divStage, true) - divStage} + 스테이지`);

/* --- 제한 시간 --- */

const sec = (ms) => `${ms / 1000}초`;
const timeRow = { M: '곱셈 (세로셈', M3: '곱셈 분해', D: '세 자리 ÷ 한 자리 |', Dw: '세 자리 ÷ 두 자리 |' };
eq('지침서가 코드의 시간표를 전부 싣는다', Object.keys(timeRow).sort().join(','), Object.keys(TIME).sort().join(','));
for (const [k, label] of Object.entries(timeRow)) {
  const t = TIME[k] || [];
  claims(`지침서의 ${k} 시간표가 코드와 같다`, label, `| ${t.map(sec).join(' | ')} |`);
}

const bonusRows = tableRows('더 주는 시간') || [];
eq('지침서가 코드와 같은 수의 덧시간 판을 싣는다', bonusRows.length, Object.keys(STAGE_BONUS).length);
for (const [stage, ms] of Object.entries(STAGE_BONUS)) {
  claims(`지침서의 ${stage}스테이지 덧시간이 코드와 같다`, `| ${stage}스테이지 |`, `+${sec(ms)}`);
}

/* --- 용돈 (숫자숲과 같은 금액이어야 한다) --- */

QUEST_COIN.forEach((coin, i) => claims(`지침서의 ${i + 1}구역 퀘스트 보상이 코드와 같다`, `| ${i + 1}구역 |`, `${coin}원`));
claims('지침서의 주간 퀘스트 승수가 코드와 같다', '이번 주', `${QW_WINS}판`);
{
  const week = (z) => 7 * 2 * QUEST_COIN[z] + QUEST_COIN[z];
  claims('지침서의 주당 퀘스트 상한이 코드와 맞는다', '주당', `${week(0)}원`);
  claims('지침서의 4구역 주당 퀘스트 상한이 코드와 맞는다', '주당', `${week(QUEST_COIN.length - 1)}원`);
}
const S3 = constOf('STAR3_COIN');
const S3B = constOf('STAR3_BOSS_COIN');
claims('지침서의 일반 별 3개 보너스가 코드와 같다', '일반 스테이지를 처음 별 세 개로 깨기', `${S3}원`);
claims('지침서의 보스 별 3개 보너스가 코드와 같다', '보스 스테이지를 처음 별 세 개로 깨기', `${S3B}원`);
{
  const bosses = ANIMALS.filter((a) => a.boss).length;
  const perGame = (ANIMALS.length - bosses) * S3 + bosses * S3B;
  claims('지침서의 한 게임 별 3개 보너스 합계가 코드와 맞는다', '한 게임을 전부 별 세 개로 깨면', `${perGame}원`);
}
const winCoins = /got\s*=\s*B\.isReplay\s*\?\s*0\s*:\s*\(\s*a\.boss\s*\?\s*(\d+)\s*:\s*(\d+)\s*\)/.exec(source);
ok('승리 용돈 계산식을 코드에서 찾았다', !!winCoins);
if (winCoins) {
  claims('지침서의 일반 승리 용돈이 코드와 같다', '일반 스테이지 승리', `${winCoins[2]}원`);
  claims('지침서의 보스 승리 용돈이 코드와 같다', '보스 스테이지 승리', `${winCoins[1]}원`);
}

/* --- 구역·보스·파랑이 --- */

ZONES.forEach((z, i) => {
  const s = i * 5 + 1;
  claims(`지침서의 ${i + 1}구역 이름이 코드와 같다`, `| ${i + 1} | ${z.name} |`, `${s}에서 ${s + 4}`);
});
ANIMALS.forEach((a, i) => {
  if (!a.boss) return;
  claims(`지침서의 ${i + 1}스테이지 보스가 코드와 같다`, `| ${i + 1} | ${a.f} |`, a.n);
});

const formRows = tableRows('| 레벨 | 모습 | 이름 |') || [];
eq('지침서가 코드와 같은 수의 파랑이 모습을 싣는다', formRows.length, PET_FORMS.length);
PET_FORMS.forEach((f) => {
  ok(`지침서의 ${f.n} 문턱이 코드와 같다`, formRows.some((l) => l.includes(`| ${f.minLv} | ${f.f} | ${f.n} |`)),
    `코드: Lv.${f.minLv} ${f.f} ${f.n}`);
});

/* --- 그 밖의 규칙 --- */

const reviewRate = /Math\.random\(\)\s*<\s*\.(\d+)/.exec(source.slice(source.indexOf('function makeProblem')));
ok('복습 문제 확률을 코드에서 찾았다', !!reviewRate);
if (reviewRate) claims('지침서의 복습 문제 확률이 코드와 같다', '오답 풀에서 하나를 꺼내', `${reviewRate[1]}%`);
const poolCap = /S\.wrongPool\.length\s*>\s*(\d+)/.exec(source);
if (poolCap) claims('지침서의 오답 풀 상한이 코드와 같다', '오답 풀에는 최대', poolCap[1]);
const storageKey = /var KEY\s*=\s*'([^']+)'/.exec(source);
ok('저장 키를 코드에서 찾았다', !!storageKey);
if (storageKey) claims('지침서의 저장 키가 코드와 같다', 'localStorage', storageKey[1]);

/* 지침서가 가리키는 코드 이름이 실제로 존재한다. */
const referenced = [...new Set([...doc.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`/g)].map((m) => m[1]))]
  .filter((n) => n.length > 2 && n !== 'localStorage');
const missing = referenced.filter((n) => !new RegExp(`\\b${n}\\b`).test(source));
ok('지침서가 가리키는 코드 이름이 전부 실제로 존재한다', missing.length === 0, `코드에 없는 이름: ${missing.join(', ')}`);

report('mul 문서 동기화');
