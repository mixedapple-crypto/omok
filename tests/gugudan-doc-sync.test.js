/**
 * 구구단 로켓 — 코드와 지침서의 동기화 검사.
 *
 * 규약: 세션 구성·숙달 기준·단계·레이스·인증·용돈 수치를 바꾸면 `documents/구구단-로켓-지침서.md`도 같이 고친다.
 * 이 검사는 그 규약이 지켜졌는지 기계로 확인한다. 지침서는 부모가 코드를 안 열고 보려고 만든 문서라서
 * 낡아도 **낡았다는 사실 자체를 아무도 모른다.**
 *
 * 검사가 깨졌을 때 할 일: 코드와 문서 중 어느 쪽이 맞는지 정하고 **양쪽을 함께** 고친다. 검사를 느슨하게 만들지 말 것.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as E from '../www/gugudan/js/engine.js';
import { ok, eq, report } from './_assert.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const doc = read('documents/구구단-로켓-지침서.md');
const lines = doc.split('\n');

function claims(what, label, value) {
  const hits = lines.filter((l) => l.includes(label));
  if (hits.length === 0) { ok(what, false, `지침서에서 "${label}" 항목을 찾지 못했다.`); return; }
  ok(what, hits.some((l) => l.includes(String(value))),
    `코드는 ${value}인데 지침서의 어느 줄에도 없다. 살펴본 줄:\n      ${hits.map((l) => l.trim()).join('\n      ')}`);
}

function tableRows(headerFragment) {
  const start = lines.findIndex((l) => l.startsWith('|') && l.includes(headerFragment));
  if (start < 0) return null;
  const rows = [];
  for (let i = start + 2; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i]);
  return rows;
}

/* --- 세션 구성 --- */
claims('세션 문제 수', '한 세션은 24문제', `${E.SESSION_SIZE}문제`);
claims('집중 문제 수', '집중 12문제', `집중 ${E.FOCUS_N}문제`);
claims('복습 문제 수', '간격 복습 7문제', `간격 복습 ${E.REVIEW_N}문제`);
claims('감사 문제 수', '무작위 감사 5문제', `무작위 감사 ${E.AUDIT_N}문제`);
claims('세션 상한', '한 세션에 4번까지만', `${E.MAX_PER_SESSION}번까지만`);
claims('최소 간격', '같은 사실 사이에는 최소', `최소 ${E.MIN_GAP}문제`);
claims('최대 미출제', '넘게 안 나오지 않습니다', `${E.MAX_UNSEEN_DAYS}일 넘게`);
claims('재출제 거리', '문제 뒤에 한 번 더 나오고', `${E.REQUEUE_MIN}~${E.REQUEUE_MAX}문제 뒤`);
claims('복습 간격 최대', '최대 14일', `최대 ${E.INTERVAL_MAX}일`);
claims('혼동쌍 대비 조건 날 수', '서로 다른 2일에 정확하고 빠르면', `서로 다른 ${E.PAIR_OK_DAYS}일`);

/* --- 숙달 기준 --- */
claims('숙달 중간값', '답 시간 중간값이 1.5초 이하', `${E.MASTER_MS / 1000}초 이하`);
claims('숙달 최댓값', '가장 느린 것도', `${E.MASTER_MAX_MS / 1000}초 이하`);
claims('단 안정 중간값', '중간값이 2초 이하', `${E.DAN_MS / 1000}초 이하`);
claims('행성 지도 설명의 초', '아이에게 "그중 2번은', `${E.DAN_MS / 1000}초 안에`);
{
  const goal = E.stage(E.newState(), 0).goal;
  // 진단 단계의 설명은 상수로 안 만들어지므로, 1단계 설명을 직접 만들어 문서와 같은 말을 쓰는지 본다.
  const s = E.newState();
  for (const id of E.FACT_IDS) s.facts[id].seen = 1;
  const g1 = E.stage(s, 0).goal;
  ok('진단 단계 설명이 있다', goal.length > 0);
  ok('1단계 화면 설명이 문서와 같은 기준을 말한다', g1.includes(`그중 2번은 ${E.DAN_MS / 1000}초 안에`), g1);
}

/* --- 단계 표 --- */
{
  const rows = tableRows('| 번호 | 이름 |');
  ok('단계 표가 있다', rows !== null);
  if (rows) {
    eq('단계 표는 다섯 줄', rows.length, E.STAGE_NAMES.length);
    E.STAGE_NAMES.forEach((name, i) => {
      ok(`단계 ${i} 이름: ${name}`, (rows[i] ?? '').includes(`| ${i} | ${name} |`), (rows[i] ?? '').trim());
    });
    ok('혼합 단계의 날 수', rows[2].includes(`서로 다른 ${E.STAGE2_DAYS}일`), rows[2].trim());
    ok('구두 인증 단계의 날 수', rows[3].includes(`서로 다른 ${E.CERT_DAYS}일`), rows[3].trim());
    ok('거꾸로 도전의 초', rows[4].includes(`${E.CHANT_PASS_MS / 1000}초`), rows[4].trim());
  }
}

/* --- 레이스 --- */
claims('항로 안정 정확도', '정확도가', `${Math.round(E.RACE_STABLE * 100)}% 이상`);
claims('유령 기록 수', '유령 로켓**은 같은 세트의 최근', `최근 ${E.GHOST_N}회`);
{
  const rows = tableRows('| 세트 | 문제 수 |');
  ok('레이스 세트 표가 있다', rows !== null);
  if (rows) {
    eq('세트 표는 네 줄', rows.length, 4);
    ok('한 단 세트는 9문제', rows[0].includes('| 9 |'));
    ok('두 단 세트는 18문제', rows[1].includes('| 18 |'));
    ok('전체 세트는 72문제', rows[2].includes('| 72 |') && rows[3].includes('| 72 |'));
  }
}

/* --- 구두·암송·인증 --- */
claims('구두 카드 장수', '한 번에 10장', `한 번에 ${E.ORAL_N}장`);
claims('구두 카드 약한 사실 수', '약한 사실 6장', `약한 사실 ${E.ORAL_WEAK_N}장`);
claims('암송 박자', '연습 모드는', E.CHANT_PACES.map((p) => `${p}초`).join(', '));
claims('암송 통과 시간', '틀림과 놓침이 모두 0이면 통과', `${E.CHANT_PASS_MS / 1000}초 안에`);
claims('인증 자기 수정', '자기 수정', `자기 수정 ${E.CERT_CORRECTIONS}개까지`);
claims('인증 날 수', '통과하면 인증', `서로 다른 ${E.CERT_DAYS}일`);

/* --- 임무·용돈·배지 --- */
claims('용돈', '저금통에', `${E.ALLOWANCE}원`);
claims('연속 배지 일수', '임무 완료가', `${E.STREAK_DAYS}일 연속`);
claims('연료 50초 목표 시간', '연료 채우기 한 판을', `${E.FUEL_GOAL_MS / 1000}초 안에`);
claims('연료 50초 정확도 문턱', '연료 채우기 한 판을', `정확도 ${Math.round(E.RACE_STABLE * 100)}% 이상`);
{
  const rows = tableRows('| 배지 | 조건 |');
  ok('배지 표가 있다', rows !== null);
  if (rows) {
    const names = Object.values(E.BADGE_NAMES);
    eq('배지 표 줄 수가 코드의 배지 수와 같다', rows.length, names.length);
    names.forEach((n, i) => ok(`배지 ${i + 1}: ${n}`, (rows[i] ?? '').includes(`| ${n} |`), (rows[i] ?? '').trim()));
    ok('배지 조건 문구가 코드와 같은 순서', E.badges(E.newState()).map((b) => b.name).join() === names.join());
  }
}

/* --- 거꾸로 순서 --- */
ok('지침서의 거꾸로 순서 설명이 코드와 같다',
  doc.includes('9단부터 2단까지, 각 단을 ×9에서 ×1로') && E.BACKWARD_ORDER[0] === '9x9' && E.BACKWARD_ORDER[71] === '2x1');

/* --- 저장 --- */
{
  const storage = read('www/gugudan/js/store.js');
  ok('저장 키가 지침서와 같다', /KEY = 'gugudan\.v1'/.test(storage) && doc.includes('`gugudan.v1`'));
  claims('기록 보관 수', '최근 10회 기록', `최근 ${E.HIST_N}회`);
}

/* --- 값을 바꾸고 싶을 때: 이름이 그 파일에 실제로 있다 --- */
{
  const rows = tableRows('| 바꿀 것 | 파일 | 이름 |');
  ok('상수 위치 표가 있다', rows !== null);
  for (const row of rows ?? []) {
    const m = /\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|\s*(.+?)\s*\|\s*$/.exec(row);
    if (!m) { ok(`표 줄 형식: ${row.trim()}`, false); continue; }
    const [, what, file, namesCell] = m;
    const exists = existsSync(join(root, file));
    ok(`'${what}' 의 파일이 있다: ${file}`, exists);
    if (!exists) continue;
    const src = read(file);
    for (const name of [...namesCell.matchAll(/`([^`]+)`/g)].map((x) => x[1])) {
      ok(`'${what}' 의 이름이 그 파일에 있다: ${name}`, new RegExp(`\\b${name}\\b`).test(src));
    }
  }
}

report('gugudan-doc-sync.test');
