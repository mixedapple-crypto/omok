/**
 * 오목 교실 — 코드와 지침서의 동기화 검사.
 *
 * 규약: 레슨 목록·별 규칙·힌트 횟수·코치 규칙·배지 대상을 바꾸면 `documents/오목-교실-지침서.md`도
 * 같이 고친다. 이 검사는 그 규약이 지켜졌는지 기계로 확인한다. 숫자숲의 math-doc-sync와 같은 취지다 —
 * 지침서는 부모가 코드를 안 열고 보려고 만든 문서라서 낡아도 **낡았다는 사실 자체를 아무도 모른다.**
 *
 * 검사가 깨졌을 때 할 일: 코드와 문서 중 어느 쪽이 맞는지 정하고 **양쪽을 함께** 고친다.
 * 검사를 느슨하게 만들어 통과시키지 말 것.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LESSONS, PUZZLES_PER_LESSON, PUZZLE_STAR_MIN, VCF_LESSON_DEPTH } from '../www/omok/js/lessons.js';
import { COACH_RULES, COACH_VCF_DEPTH } from '../www/omok/js/coach.js';
import { SKILL, SKILL_NAME, BADGE_SKILLS } from '../www/omok/js/tactics.js';
import { LEVEL } from '../www/omok/js/ai.js';
import { ok, eq, report } from './_assert.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const doc = read('documents/오목-교실-지침서.md');
const lines = doc.split('\n');

/** 지침서가 "label과 value를 같은 줄에서" 말하고 있는가. label이 여러 줄이면 하나라도 맞으면 된다. */
function claims(what, label, value) {
  const hits = lines.filter((l) => l.includes(label));
  if (hits.length === 0) { ok(what, false, `지침서에서 "${label}" 항목을 찾지 못했다.`); return; }
  ok(what, hits.some((l) => l.includes(String(value))),
    `코드는 ${value}인데 지침서의 어느 줄에도 없다. 살펴본 줄:\n      ${hits.map((l) => l.trim()).join('\n      ')}`);
}

/** 헤더 조각으로 표를 찾아 본문 줄만 돌려준다. */
function tableRows(headerFragment) {
  const start = lines.findIndex((l) => l.startsWith('|') && l.includes(headerFragment));
  if (start < 0) return null;
  const rows = [];
  for (let i = start + 2; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i]);
  return rows;
}

/** 소스에서 `NAME = 숫자` 를 캐낸다. lesson-flow.js는 DOM을 건드려 import할 수 없으므로 텍스트로 본다. */
function constOf(rel, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*(\\d+)`).exec(read(rel));
  return m ? Number(m[1]) : null;
}

const LEVEL_KO = { [LEVEL.EASY]: '쉬움', [LEVEL.NORMAL]: '보통', [LEVEL.HARD]: '어려움' };

/* --- 기술 이름 표 --- */
{
  const rows = tableRows('| 이름 | 표기 |');
  ok('기술 이름 표가 있다', rows !== null);
  if (rows) {
    for (const k of Object.values(SKILL)) {
      const { ko, code } = SKILL_NAME[k];
      ok(`기술 이름 표에 '${ko}'(${code})가 있다`, rows.some((r) => r.includes(`| ${ko} |`) && r.includes(`| ${code} |`)));
    }
    eq('기술 이름 표의 줄 수가 기술 수와 같다', rows.length, Object.values(SKILL).length);
  }
}

/* --- 레슨 표 --- */
{
  const rows = tableRows('| 번호 | 레슨 |');
  ok('레슨 표가 있다', rows !== null);
  if (rows) {
    eq('레슨 표의 줄 수가 코드의 레슨 수와 같다', rows.length, LESSONS.length);
    LESSONS.forEach((l, i) => {
      const row = rows[i] ?? '';
      const name = l.code ? `${l.title} ${l.code}` : l.title;
      ok(`레슨 ${i + 1} 이름이 지침서와 같다: ${name}`, row.includes(`| ${i + 1} | ${name} |`), row.trim());
      ok(`레슨 ${i + 1} 써보기 상대가 지침서와 같다: ${LEVEL_KO[l.practice.level]}`,
        row.trim().endsWith(`| ${LEVEL_KO[l.practice.level]} |`), row.trim());
    });
  }
}

/* --- 별 규칙과 힌트 --- */
claims('레슨당 퍼즐 수가 지침서와 같다', '퍼즐 5문제가 나오고'.replace('5', String(PUZZLES_PER_LESSON)), `${PUZZLES_PER_LESSON}문제`);
claims('둘째 별의 첫 시도 정답 수가 지침서와 같다', '문제 이상을 첫 시도에 맞히면', `${PUZZLE_STAR_MIN}문제 이상`);
{
  const autoHint = constOf('www/omok/js/lesson-flow.js', 'AUTO_HINT_AT');
  const reveal = constOf('www/omok/js/lesson-flow.js', 'REVEAL_AT');
  ok('힌트 상수 둘을 코드에서 찾았다', typeof autoHint === 'number' && typeof reveal === 'number');
  claims('자동 힌트 오답 횟수가 지침서와 같다', '자동으로 힌트', `오답 ${autoHint}번째`);
  claims('정답 공개 오답 횟수가 지침서와 같다', '정답 자리를 초록', `오답 ${reveal}번째`);
}
claims('연속 사 퍼즐 깊이가 지침서와 같다', '연속 사 퍼즐(레슨 9)', `${VCF_LESSON_DEPTH}수`);
claims('코치의 연속 사 깊이가 지침서와 같다', '코치가 찾아보는 연속 사는', `${COACH_VCF_DEPTH}수`);
ok('연속 사 깊이는 코치와 레슨 9가 같다 — 지침서가 그렇게 말한다', COACH_VCF_DEPTH === VCF_LESSON_DEPTH);

/* --- 코치 규칙 표 --- */
{
  const rows = tableRows('| 순서 | 코치가 끼어드는 경우 |');
  ok('코치 규칙 표가 있다', rows !== null);
  if (rows) {
    eq('코치 규칙 표의 줄 수가 코드와 같다', rows.length, COACH_RULES.length);
    COACH_RULES.forEach((rule, i) => {
      ok(`코치 규칙 ${i + 1}: ${rule.ko}`, (rows[i] ?? '').includes(`| ${i + 1} | ${rule.ko} |`), (rows[i] ?? '').trim());
    });
  }
  // judge()가 실제로 그 kind들을 그 순서로 낸다.
  const src = read('www/omok/js/coach.js');
  const judgeBody = src.slice(src.indexOf('export function judge('));
  const kinds = [...judgeBody.matchAll(/finding\(cells,\s*'([a-z-]+)'/g)].map((m) => m[1]);
  eq('judge()가 내는 kind 순서가 COACH_RULES와 같다', kinds.join(','), COACH_RULES.map((r) => r.kind).join(','));
}

/* --- 배지 표 --- */
{
  const rows = tableRows('| 배지 | 표기 |');
  ok('배지 표가 있다', rows !== null);
  if (rows) {
    eq('배지 표의 줄 수가 배지 대상 수와 같다', rows.length, BADGE_SKILLS.length);
    for (const k of BADGE_SKILLS) {
      const { ko, code } = SKILL_NAME[k];
      ok(`배지 표에 '${ko}'(${code})가 있다`, rows.some((r) => r.includes(`| ${ko} | ${code} |`)));
    }
  }
}

/* --- 저장 데이터 --- */
{
  const storage = read('www/omok/js/storage.js');
  ok('저장 키가 지침서와 같다', /KEY = 'omok\.v1'/.test(storage) && doc.includes('`omok.v1`'));
  for (const key of ['lessons', 'skills', 'coach']) {
    ok(`저장 항목 '${key}' 가 코드와 지침서 양쪽에 있다`,
      new RegExp(`^\\s+${key}:`, 'm').test(storage) && doc.includes(`\`${key}\``));
  }
  const gameJs = read('www/omok/js/game.js');
  ok('"교실 진행·배지 지우기"가 lessons·skills만 지운다',
    /resetLessons\(\)\s*\{\s*return save\(\{ lessons: \{\}, skills: \{\} \}\)/.test(storage) && /'reset-lessons'/.test(gameJs));
}

/* --- 값을 바꾸고 싶을 때: 지침서가 가리키는 이름이 그 파일에 실제로 있다 --- */
{
  const rows = tableRows('| 바꿀 것 | 파일 | 이름 |');
  ok('상수 위치 표가 있다', rows !== null);
  for (const row of rows ?? []) {
    const m = /\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/.exec(row);
    if (!m) { ok(`표 줄 형식: ${row.trim()}`, false); continue; }
    const [, what, file, name] = m;
    const exists = existsSync(join(root, file));
    ok(`'${what}' 의 파일이 있다: ${file}`, exists);
    if (exists) ok(`'${what}' 의 이름이 그 파일에 있다: ${name}`, new RegExp(`\\b${name}\\b`).test(read(file)));
  }
}

report('omok-doc-sync.test');
