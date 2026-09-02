/**
 * lessons.js 테스트 — 커리큘럼 데이터의 무결성을 고정한다.
 *
 * 이 파일이 존재하는 이유: 시범 수순은 사람이 손으로 적는다. "쌍삼!"이라는 말풍선이 뜨는 자리에서
 * 실제로 쌍삼이 성립하지 않으면 아이는 틀린 것을 배운다. 화면으로는 돌이 놓이고 말풍선이 뜨니
 * 멀쩡해 보여서 절대 눈에 안 띈다. 그래서 모든 시범을 재생하며 expect를 엔진으로 검사한다.
 * 퍼즐 템플릿도 대칭 8가지 전부에서 건전한지 본다 — 한 방향만 눌러 본 것으로는 모른다.
 */
import { LESSONS, lessonById, PUZZLES_PER_LESSON, PUZZLE_STAR_MIN, VCF_LESSON_DEPTH } from '../www/omok/js/lessons.js';
import { SKILL, skillsOfMove } from '../www/omok/js/tactics.js';
import { parseTemplate, transformTemplate, validate, solve, EDGE_MARGIN } from '../www/omok/js/puzzle.js';
import { LEVEL } from '../www/omok/js/ai.js';
import { BLACK, WHITE, EMPTY, CELLS, SIZE, idx, inBounds } from '../www/omok/js/board.js';
import { ok, eq, report } from './_assert.js';

// --- 목록 -----------------------------------------------------------------------------------
eq('레슨은 열 개', LESSONS.length, 10);
eq('레슨 id는 전부 다르다', new Set(LESSONS.map((l) => l.id)).size, LESSONS.length);
ok('레슨당 퍼즐 수와 별 기준이 말이 된다', PUZZLE_STAR_MIN <= PUZZLES_PER_LESSON && PUZZLE_STAR_MIN > 0);
ok('연속 사 레슨 깊이는 사삼(깊이 2)보다 깊다', VCF_LESSON_DEPTH >= 3);
eq('lessonById', lessonById('double-three')?.title, '쌍삼');
eq('없는 id는 null', lessonById('nope'), null);

for (const l of LESSONS) {
  ok(`[${l.id}] 제목·부제·소개가 있다`, !!l.title && !!l.subtitle && !!l.intro);
  ok(`[${l.id}] 기술이 목록에 있다`, Object.values(SKILL).includes(l.skill));
  ok(`[${l.id}] 써보기 난이도가 실제 난이도다`, Object.values(LEVEL).includes(l.practice?.level));
  ok(`[${l.id}] 퍼즐 안내 문구가 있다`, !!l.puzzle?.prompt);
}
for (const id of ['double-three', 'four-three', 'double-four']) {
  ok(`[${id}] 숫자 표기(3-3 등)가 있다 — 한글 이름과 병기한다`, /^\d-\d$/.test(lessonById(id).code));
}

// --- 시범 재생: 말풍선이 말하는 기술이 그 자리에서 실제로 성립하는가 -------------------------------
function place(cells, coords, color, label, errors) {
  for (const [r, c] of coords) {
    if (!inBounds(r, c)) { errors.push(`${label} 판 밖 (${r},${c})`); continue; }
    if (cells[idx(r, c)] !== EMPTY) { errors.push(`${label} 이미 돌이 있는 자리 (${r},${c})`); continue; }
    cells[idx(r, c)] = color;
  }
}

for (const l of LESSONS) {
  const errors = [];
  const initial = new Int8Array(CELLS);
  place(initial, l.demo.stones.X ?? [], BLACK, '시작 X', errors);
  place(initial, l.demo.stones.O ?? [], WHITE, '시작 O', errors);
  let cells = Int8Array.from(initial);
  let expects = 0;

  l.demo.steps.forEach((step, i) => {
    const tag = `${i + 1}단계`;
    if (!step.say) errors.push(`${tag} 말풍선 없음`);
    if (step.reset) cells = Int8Array.from(initial);
    if (step.add) {
      place(cells, step.add.X ?? [], BLACK, `${tag} add X`, errors);
      place(cells, step.add.O ?? [], WHITE, `${tag} add O`, errors);
    }
    for (const key of ['focus', 'ask', 'marks']) {
      for (const [r, c] of step[key] ?? []) {
        if (!inBounds(r, c)) errors.push(`${tag} ${key} 판 밖 (${r},${c})`);
        else if (key !== 'focus' && cells[idx(r, c)] !== EMPTY) errors.push(`${tag} ${key}가 돌 위 (${r},${c})`);
        else if (key === 'focus' && cells[idx(r, c)] === EMPTY) errors.push(`${tag} focus가 빈칸 (${r},${c})`);
      }
    }
    if (step.move) {
      const [r, c] = step.move;
      const color = step.who === 'O' ? WHITE : BLACK;
      if (!inBounds(r, c)) { errors.push(`${tag} 착수 판 밖`); return; }
      const p = idx(r, c);
      if (cells[p] !== EMPTY) { errors.push(`${tag} 착수 자리에 돌이 있음 (${r},${c})`); return; }
      if (step.expect) {
        expects++;
        const label = skillsOfMove(cells, p, color).label;
        if (label !== step.expect) errors.push(`${tag} 기대 ${step.expect} / 실제 ${label} (${r},${c})`);
      }
      cells[p] = color;
    }
  });

  ok(`[${l.id}] 시범 수순이 전부 맞다`, errors.length === 0, errors.join(' | '));
  ok(`[${l.id}] 시범에 엔진으로 검사된 기술 장면이 하나 이상 있다`, expects >= 1 || l.id === 'prevent' || l.id === 'block-four');
}

// --- 퍼즐 템플릿: 대칭 8가지 × 고정 위치 전부 건전 -------------------------------------------------
for (const l of LESSONS) {
  const spec = l.puzzle;
  const errors = [];
  spec.templates.forEach((rows, ti) => {
    const tpl = parseTemplate(rows);
    if (!tpl.some((t) => t.v === 'X' || t.v === 'O')) errors.push(`템플릿 ${ti}: 돌이 없다`);
    for (let k = 0; k < 8; k++) {
      const t = transformTemplate(tpl, k);
      const h = Math.max(...t.map((x) => x.r)) + 1;
      const w = Math.max(...t.map((x) => x.c)) + 1;
      if (h > SIZE - 2 * EDGE_MARGIN || w > SIZE - 2 * EDGE_MARGIN) { errors.push(`템플릿 ${ti}: 너무 크다`); continue; }
      // 가장자리 여백 최소 위치와 중앙, 두 곳에서 본다.
      for (const [r0, c0] of [[EDGE_MARGIN, EDGE_MARGIN], [((SIZE - h) / 2) | 0, ((SIZE - w) / 2) | 0]]) {
        const cells = new Int8Array(CELLS);
        for (const { r, c, v } of t) {
          if (v === 'X') cells[idx(r0 + r, c0 + c)] = BLACK;
          else if (v === 'O') cells[idx(r0 + r, c0 + c)] = WHITE;
        }
        const why = validate(cells, spec, solve(cells, spec));
        if (why) errors.push(`템플릿 ${ti} 대칭 ${k} @(${r0},${c0}): ${why}`);
      }
    }
  });
  ok(`[${l.id}] 템플릿 ${spec.templates.length}개 × 대칭 8 × 위치 2 전부 건전`, errors.length === 0, errors.slice(0, 4).join(' | '));
}

report('lessons.test');
