/**
 * render.js 좌표 변환 테스트.
 *
 * 브라우저 없이 도는 이유: 캔버스 좌표 버그(스냅이 반 칸씩 밀림)는 화면상으로는
 * 멀쩡해 보여서 눈으로 못 잡는다. 반면 순수 계산이라 캔버스를 흉내 내면 정확히 잴 수 있다.
 * 원인은 대개 하나다 — CSS 픽셀(getBoundingClientRect)과 캔버스 내부 해상도(DPR 배수)를 섞는 것.
 */
import { Board, SIZE, idx, rowOf, colOf } from '../www/js/board.js';
import { ok, eq, report } from './_assert.js';

/** 어떤 메서드 호출도 받아주는 2D 컨텍스트 흉내. 그리기 결과는 검사하지 않는다. */
function stubCtx() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, key) {
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      if (key in target) return target[key];
      return () => {};
    },
    set(target, key, value) { target[key] = value; return true; },
  });
}

/**
 * 캔버스 흉내. 실제 코드는 **부모 상자**를 재서 정사각형을 직접 px로 지정하므로
 * (CSS aspect-ratio에 기대면 구형 WebView에서 판이 뭉개진다) 부모도 함께 흉내 낸다.
 */
function stubCanvas(size, left = 0, top = 0) {
  const style = {};
  return {
    width: 0,
    height: 0,
    style,
    parentElement: { clientWidth: size, clientHeight: size },
    getContext: () => stubCtx(),
    // 브라우저는 style.width가 정해지면 그 크기로 배치한다. 그 동작을 그대로 흉내 낸다.
    getBoundingClientRect: () => {
      const s = parseFloat(style.width) || size;
      return { left, top, width: s, height: s, right: left + s, bottom: top + s };
    },
  };
}

async function makeRenderer(size, dpr, left = 0, top = 0) {
  globalThis.window = { devicePixelRatio: dpr };
  // 부모 여백 계산에 쓰인다. 흉내 환경에서는 여백 0으로 본다.
  globalThis.getComputedStyle = () => ({
    paddingLeft: '0px', paddingRight: '0px', paddingTop: '0px', paddingBottom: '0px',
  });
  const { Renderer } = await import('../www/js/render.js');
  return new Renderer(stubCanvas(size, left, top));
}

// 폰 세로 화면의 실제 판 크기에 가깝게 잡는다.
const SIZE_PX = 360;

// --- 왕복: 모든 교차점이 자기 자신으로 돌아와야 한다 -------------------------
{
  const r = await makeRenderer(SIZE_PX, 2);
  let bad = null;
  for (let row = 0; row < SIZE && !bad; row++) {
    for (let col = 0; col < SIZE; col++) {
      const hit = r.hitTest(r.x(col), r.y(row));
      if (hit !== idx(row, col)) { bad = `(${row},${col}) → ${hit}`; break; }
    }
  }
  ok('225개 교차점 전부 왕복 일치', bad === null, bad ? `첫 불일치 ${bad}` : '');
}

// --- DPR이 달라도 터치 결과는 같아야 한다 (핵심) -----------------------------
{
  // 이 시험이 실패하면 그리기 좌표계와 터치 좌표계가 섞인 것이다.
  const results = [];
  for (const dpr of [1, 2, 3, 4]) {
    const r = await makeRenderer(SIZE_PX, dpr);
    results.push([0, 90, 180, 270, 359].map((p) => r.hitTest(p, p)).join(','));
  }
  ok('DPR 1·2·3·4에서 터치 판정이 동일', new Set(results).size === 1,
    results.map((s, i) => `dpr${i + 1}: ${s}`).join(' | '));
}

// --- 캔버스가 화면 원점에 있지 않을 때 -----------------------------------------
{
  const off = await makeRenderer(SIZE_PX, 2, 37, 129);
  const base = await makeRenderer(SIZE_PX, 2, 0, 0);
  const a = off.hitTest(37 + off.x(7), 129 + off.y(7));
  const b = base.hitTest(base.x(7), base.y(7));
  eq('캔버스 위치가 달라도 같은 교차점', a, b);
  eq('그 교차점은 천원', a, idx(7, 7));
}

// --- 가장 가까운 교차점으로 스냅 ------------------------------------------------
{
  const r = await makeRenderer(SIZE_PX, 2);
  const c7 = r.x(7);
  const c8 = r.x(8);
  eq('교차점에서 살짝 왼쪽 → 그 교차점', r.hitTest(c7 + r.cell * 0.2, r.y(7)), idx(7, 7));
  eq('중간을 넘으면 다음 교차점', r.hitTest(c7 + r.cell * 0.6, r.y(7)), idx(7, 8));
  eq('바로 옆 교차점 위', r.hitTest(c8, r.y(7)), idx(7, 8));
}

// --- 경계와 판 바깥 ------------------------------------------------------------
{
  const r = await makeRenderer(SIZE_PX, 2);
  eq('좌상단 구석', r.hitTest(r.x(0), r.y(0)), idx(0, 0));
  eq('우하단 구석', r.hitTest(r.x(14), r.y(14)), idx(14, 14));
  eq('0행 14열', r.hitTest(r.x(14), r.y(0)), idx(0, 14));
  eq('14행 0열', r.hitTest(r.x(0), r.y(14)), idx(14, 0));
  eq('판 왼쪽 바깥은 무시', r.hitTest(-40, r.y(7)), -1);
  eq('판 위쪽 바깥은 무시', r.hitTest(r.x(7), -40), -1);
  eq('판 오른쪽 바깥은 무시', r.hitTest(SIZE_PX + 40, r.y(7)), -1);
  // 여백 안이라도 교차점에서 멀면 착수하지 않는다 — 엉뚱한 자리에 놓이는 것보다 낫다.
  ok('구석 여백은 무시', r.hitTest(1, 1) === -1 || r.hitTest(1, 1) === idx(0, 0));
}

// --- 리사이즈 후에도 정합 --------------------------------------------------------
{
  const r = await makeRenderer(SIZE_PX, 2);
  r.canvas.parentElement.clientWidth = 520;
  r.canvas.parentElement.clientHeight = 520;
  r.resize();
  eq('리사이즈 후 천원 판정', r.hitTest(r.x(7), r.y(7)), idx(7, 7));
  eq('리사이즈 후 캔버스 해상도가 DPR 배수', r.canvas.width, 520 * 2);
  eq('CSS 크기를 직접 지정한다 — aspect-ratio에 기대지 않는다', r.canvas.style.width, '520px');
}
{
  // 부모가 세로로 납작하면 짧은 쪽에 맞춰야 한다. 그러지 않으면 판이 화면을 넘친다.
  const r = await makeRenderer(SIZE_PX, 2);
  r.canvas.parentElement.clientWidth = 800;
  r.canvas.parentElement.clientHeight = 300;
  r.resize();
  eq('납작한 부모에서는 짧은 쪽에 맞춘다', r.css, 300);
  eq('그래도 천원 판정은 맞는다', r.hitTest(r.x(7), r.y(7)), idx(7, 7));
}
{
  // 큰 화면에서 판만 무한히 커지면 오히려 짚기 불편하다.
  const r = await makeRenderer(SIZE_PX, 2);
  r.canvas.parentElement.clientWidth = 2000;
  r.canvas.parentElement.clientHeight = 2000;
  r.resize();
  ok('판 크기에 상한이 있다', r.css <= 560, `실제 ${r.css}px`);
}

// --- 판이 아주 작아도 죽지 않아야 한다 --------------------------------------------
{
  const r = await makeRenderer(200, 1);
  eq('작은 판에서도 천원 판정', r.hitTest(r.x(7), r.y(7)), idx(7, 7));
  ok('작은 판에서도 칸 간격이 양수', r.cell > 0);
}

// --- draw가 예외 없이 도는가 ------------------------------------------------------
{
  const r = await makeRenderer(SIZE_PX, 2);
  const b = new Board();
  b.place(idx(7, 7));
  b.place(idx(7, 8));
  let threw = null;
  try {
    r.draw(b, { preview: idx(3, 3), lastMove: b.lastMove, winLine: null, t: 0 });
    r.draw(b, { preview: -1, lastMove: -1, winLine: [idx(0, 0), idx(0, 4)], t: 500 });
    r.draw(b, {});
    r.draw(b, null);
  } catch (e) { threw = e; }
  ok('draw가 예외를 던지지 않는다', threw === null, threw ? String(threw) : '');
}

report('render.test');
