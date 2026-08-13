/**
 * 앱 아이콘 PNG 생성기. 의존성 0을 지키려고 PNG를 직접 인코딩한다.
 *
 * 왜 필요한가: 아이패드에서 "홈 화면에 추가"를 했을 때 apple-touch-icon이 없으면
 * iOS가 **페이지 스크린샷을 아이콘으로** 써버린다. 아이 화면에 흐릿한 반상 조각이
 * 아이콘으로 박히는 것보다는 제대로 된 아이콘이 낫다.
 *
 * 사용: node tools/make-icon.js
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'www', 'icons');

// --- PNG 인코딩 -------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** @param {Uint8Array} rgba 길이 = size*size*4 */
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 비트 깊이
  ihdr[9] = 6; // 컬러 타입 6 = RGBA
  // 10~12: 압축·필터·인터레이스 전부 0(기본)

  // 각 행 앞에 필터 바이트 0(None)을 붙인다 — 아이콘은 작아서 필터 최적화가 무의미하다.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const src = y * size * 4;
    const dst = y * (size * 4 + 1);
    raw[dst] = 0;
    Buffer.from(rgba.buffer, src, size * 4).copy(raw, dst + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- 아이콘 그리기 ----------------------------------------------------------

class Canvas {
  constructor(size) {
    this.size = size;
    this.px = new Uint8Array(size * size * 4);
  }

  set(x, y, [r, g, b], a = 1) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size || a <= 0) return;
    const i = (y * this.size + x) * 4;
    const p = this.px;
    // 위에 덧그리므로 알파 합성을 한다.
    p[i] = p[i] * (1 - a) + r * a;
    p[i + 1] = p[i + 1] * (1 - a) + g * a;
    p[i + 2] = p[i + 2] * (1 - a) + b * a;
    p[i + 3] = 255;
  }

  fill(fn) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) this.set(x, y, fn(x, y));
    }
  }

  /** 경계에서 알파를 부드럽게 떨어뜨려 계단을 없앤다(1px 안티에일리어싱). */
  disc(cx, cy, radius, colorAt) {
    const r0 = Math.ceil(radius) + 1;
    for (let y = Math.floor(cy - r0); y <= cy + r0; y++) {
      for (let x = Math.floor(cx - r0); x <= cx + r0; x++) {
        const d = Math.hypot(x - cx, y - cy);
        const a = d <= radius - 1 ? 1 : d >= radius ? 0 : radius - d;
        if (a > 0) this.set(x, y, colorAt((x - cx) / radius, (y - cy) / radius), a);
      }
    }
  }

  hLine(y, x0, x1, w, color) {
    for (let yy = Math.round(y - w / 2); yy < Math.round(y + w / 2); yy++) {
      for (let x = x0; x <= x1; x++) this.set(x, yy, color);
    }
  }

  vLine(x, y0, y1, w, color) {
    for (let xx = Math.round(x - w / 2); xx < Math.round(x + w / 2); xx++) {
      for (let y = y0; y <= y1; y++) this.set(xx, y, color);
    }
  }
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

function drawIcon(size) {
  const c = new Canvas(size);
  const S = size;

  // 나무판 배경 — 대각선 그러데이션으로 살짝 입체감을 준다.
  const woodTop = [224, 173, 76];
  const woodBottom = [193, 140, 45];
  c.fill((x, y) => mix(woodTop, woodBottom, (x + y) / (2 * S)));

  // 격자 3×3 — 아이콘 크기에서 15줄은 뭉개져서 안 보인다. 오목판임을 알아볼 정도만 그린다.
  const line = [104, 66, 24];
  const lw = Math.max(1, Math.round(S * 0.018));
  const m = S * 0.22;
  const step = (S - m * 2) / 2;
  for (let k = 0; k < 3; k++) {
    c.hLine(m + step * k, m, S - m, lw, line);
    c.vLine(m + step * k, m, S - m, lw, line);
  }

  const stoneR = S * 0.155;
  // 돌 두 개 — 흑백이 나란히 있어야 오목이라는 게 읽힌다.
  const shadow = (cx, cy) => c.disc(cx + S * 0.012, cy + S * 0.016, stoneR, () => [80, 45, 10]);

  // 흑돌: 좌상단 교차점
  shadow(m + step, m);
  c.disc(m + step, m, stoneR, (u, v) => {
    const hl = Math.max(0, 1 - Math.hypot(u + 0.35, v + 0.4) * 1.15);
    return mix([16, 16, 18], [150, 150, 155], hl * hl);
  });

  // 백돌: 우하단 교차점
  shadow(m + step, m + step * 2);
  c.disc(m + step, m + step * 2, stoneR, (u, v) => {
    const hl = Math.max(0, 1 - Math.hypot(u + 0.35, v + 0.4) * 1.15);
    return mix([196, 190, 178], [255, 255, 255], hl * hl);
  });

  return encodePng(S, c.px);
}

// --- 실행 -------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });

// 180: iOS apple-touch-icon 표준 크기. 192/512: 웹 매니페스트 권장 크기.
for (const size of [180, 192, 512]) {
  const png = drawIcon(size);
  const path = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(path, png);
  console.log(`${path}  ${size}×${size}  ${(png.length / 1024).toFixed(1)}KB`);
}
console.log('\n완료. www/icons/ 에 생성했다.');
