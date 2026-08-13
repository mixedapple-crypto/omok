/** 어려움 난이도의 깊이별 실제 소요 시간 측정. 예산 설정의 근거를 숫자로 잡는다. */
import { Board, BLACK, WHITE, CELLS, idx } from '../www/js/board.js';
import { AI, LEVEL, makeRng, candidates } from '../www/js/ai.js';

// 강제수가 없는 조용한 중반 국면이어야 탐색이 실제로 돈다.
// (3연속이 하나라도 있으면 하드 규칙이 먼저 잡아 탐색을 건너뛴다.)
const cells = new Int8Array(CELLS);
for (const [r, c] of [[5, 5], [7, 8], [9, 6], [6, 11], [10, 9]]) cells[idx(r, c)] = BLACK;
for (const [r, c] of [[6, 6], [8, 7], [5, 9], [9, 10], [11, 6]]) cells[idx(r, c)] = WHITE;

console.log(`돌 10개, 후보 ${candidates(cells).length}칸\n`);

for (const budget of [100, 300, 600, 1000, 1500, 3000, 10000]) {
  const ai = new AI(LEVEL.HARD, { random: makeRng(7), timeMs: budget });
  const t0 = Date.now();
  ai.chooseMove(cells, BLACK);
  const ms = Date.now() - t0;
  const over = ms > budget * 1.2 ? '   ⚠ 예산 초과' : '';
  const forced = ai.stats.nodes === 0 ? '   ⚠ 강제수라 탐색 안 함' : '';
  console.log(
    `예산 ${String(budget).padStart(5)}ms → 실제 ${String(ms).padStart(5)}ms  ` +
    `도달 깊이 ${ai.stats.depth}  노드 ${String(ai.stats.nodes).padStart(8)}${over}${forced}`,
  );
}
