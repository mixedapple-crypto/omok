/**
 * 반상 그리기와 터치 좌표 변환.
 *
 * 좌표계 규칙: **그리기도 터치도 전부 CSS 픽셀**로 한다.
 * 캔버스 내부 해상도는 setTransform(dpr,...) 한 줄로만 다루고 그 밖으로 새어나가지 않게 한다.
 * 이 둘을 섞으면 스냅이 반 칸씩 밀리는데, 화면상으로는 멀쩡해 보여서 찾기 어렵다.
 */

import { SIZE, BLACK, WHITE, idx, rowOf, colOf } from './board.js';

/** 화점 5개 — 표준 오목판 위치. */
const STAR_POINTS = [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]];

/** DPR 상한. 3을 넘으면 눈에 보이는 화질 이득 없이 메모리·그리기 비용만 는다. */
const MAX_DPR = 3;

/** 판의 최대 크기. 태블릿·PC에서 판만 커지면 오히려 짚기 불편하다. */
const MAX_BOARD_PX = 560;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.css = 0;
    this.margin = 0;
    this.cell = 0;
    this.resize();
  }

  /** 부모의 안쪽 여백을 뺀 실제 쓸 수 있는 크기. */
  _availableBox() {
    const parent = this.canvas.parentElement;
    if (!parent) {
      const r = this.canvas.getBoundingClientRect();
      return [r.width, r.height];
    }
    const cs = typeof getComputedStyle === 'function' ? getComputedStyle(parent) : null;
    const pad = (side) => (cs ? parseFloat(cs[side]) || 0 : 0);
    return [
      parent.clientWidth - pad('paddingLeft') - pad('paddingRight'),
      parent.clientHeight - pad('paddingTop') - pad('paddingBottom'),
    ];
  }

  resize() {
    // 정사각형을 CSS의 aspect-ratio에 맡기지 않는다 — Chrome 88(2021년) 이후에만 있어서
    // 구형 안드로이드 WebView에서는 판이 납작해지거나 사라진다. 부모 크기를 재서
    // 짧은 쪽에 맞춘 정사각형을 직접 px로 지정하면 어느 환경에서도 같은 결과가 나온다.
    const [availW, availH] = this._availableBox();
    const css = Math.max(1, Math.floor(Math.min(availW, availH, MAX_BOARD_PX)));

    if (this.canvas.style) {
      this.canvas.style.width = `${css}px`;
      this.canvas.style.height = `${css}px`;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.canvas.width = Math.round(css * dpr);
    this.canvas.height = Math.round(css * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.css = css;
    // 가장자리 교차점의 돌이 잘리지 않을 만큼의 여백.
    this.margin = css * 0.045;
    this.cell = (css - this.margin * 2) / (SIZE - 1);
  }

  x(c) { return this.margin + c * this.cell; }
  y(r) { return this.margin + r * this.cell; }

  /**
   * 화면 좌표 → 반상 인덱스. 교차점에서 멀면 -1.
   * 손을 뗀 정확한 위치가 아니라 **가장 가까운 교차점**으로 스냅한다.
   */
  hitTest(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const c = Math.round((px - this.margin) / this.cell);
    const r = Math.round((py - this.margin) / this.cell);
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return -1;
    // 판 바깥 여백을 눌렀을 때 엉뚱한 교차점에 붙지 않게 거리 제한을 둔다.
    const dx = px - this.x(c);
    const dy = py - this.y(r);
    if (Math.hypot(dx, dy) > this.cell * 0.95) return -1;
    return idx(r, c);
  }

  /**
   * @param {import('./board.js').Board} board
   * @param {{preview:number, lastMove:number, winLine:number[]|null, t:number}} view
   *   t는 애니메이션용 경과 시간(ms).
   */
  draw(board, view) {
    const { ctx, css, cell } = this;
    const { preview = -1, lastMove = -1, winLine = null, t = 0 } = view || {};

    // 반상
    const g = ctx.createLinearGradient(0, 0, css, css);
    g.addColorStop(0, '#e0ad4c');
    g.addColorStop(1, '#c9932f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, css, css);

    // 격자
    ctx.strokeStyle = 'rgba(84,54,20,.85)';
    ctx.lineWidth = Math.max(1, cell * 0.035);
    ctx.beginPath();
    for (let k = 0; k < SIZE; k++) {
      ctx.moveTo(this.x(0), this.y(k));
      ctx.lineTo(this.x(SIZE - 1), this.y(k));
      ctx.moveTo(this.x(k), this.y(0));
      ctx.lineTo(this.x(k), this.y(SIZE - 1));
    }
    ctx.stroke();

    // 화점
    ctx.fillStyle = 'rgba(84,54,20,.9)';
    for (const [r, c] of STAR_POINTS) {
      ctx.beginPath();
      ctx.arc(this.x(c), this.y(r), cell * 0.11, 0, Math.PI * 2);
      ctx.fill();
    }

    // 미리보기 십자선 — 어느 교차점인지 손가락에 가려지지 않고 보이게 한다.
    // 돋보기 대신 십자선을 쓰는 이유: 손가락이 가리는 영역을 피하면서도 위치가 분명하다.
    if (preview >= 0) {
      const pr = rowOf(preview);
      const pc = colOf(preview);
      ctx.strokeStyle = 'rgba(229,87,63,.75)';
      ctx.lineWidth = Math.max(1.5, cell * 0.06);
      ctx.beginPath();
      ctx.moveTo(this.x(0), this.y(pr));
      ctx.lineTo(this.x(SIZE - 1), this.y(pr));
      ctx.moveTo(this.x(pc), this.y(0));
      ctx.lineTo(this.x(pc), this.y(SIZE - 1));
      ctx.stroke();
    }

    // 돌
    for (let i = 0; i < SIZE * SIZE; i++) {
      const v = board.cells[i];
      if (v !== 0) this._stone(this.x(colOf(i)), this.y(rowOf(i)), v, 1);
    }

    // 마지막 착수 표시
    if (lastMove >= 0 && board.cells[lastMove] !== 0) {
      ctx.strokeStyle = '#e5573f';
      ctx.lineWidth = Math.max(2, cell * 0.09);
      ctx.beginPath();
      ctx.arc(this.x(colOf(lastMove)), this.y(rowOf(lastMove)), cell * 0.22, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 이긴 줄 — 깜빡이며 강조
    if (winLine && winLine.length) {
      const pulse = 0.45 + 0.4 * Math.abs(Math.sin(t / 260));
      const a = winLine[0];
      const b = winLine[winLine.length - 1];
      ctx.strokeStyle = `rgba(255,255,255,${pulse})`;
      ctx.lineCap = 'round';
      ctx.lineWidth = cell * 0.24;
      ctx.beginPath();
      ctx.moveTo(this.x(colOf(a)), this.y(rowOf(a)));
      ctx.lineTo(this.x(colOf(b)), this.y(rowOf(b)));
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    // 미리보기 돌 — 반투명이라 확정 전임이 한눈에 보인다
    if (preview >= 0 && board.cells[preview] === 0) {
      this._stone(this.x(colOf(preview)), this.y(rowOf(preview)), board.turn, 0.55);
    }
  }

  _stone(cx, cy, color, alpha) {
    const { ctx, cell } = this;
    const r = cell * 0.44;
    ctx.save();
    ctx.globalAlpha = alpha;

    // 그림자 — 돌이 판 위에 얹혀 보이게
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath();
    ctx.arc(cx + r * 0.09, cy + r * 0.12, r, 0, Math.PI * 2);
    ctx.fill();

    const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    if (color === BLACK) {
      grad.addColorStop(0, '#7a7a7a');
      grad.addColorStop(0.5, '#2a2a2a');
      grad.addColorStop(1, '#050505');
    } else {
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.6, '#f2efe8');
      grad.addColorStop(1, '#bdb8ac');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
