/**
 * 효과음 — WebAudio로 합성한다. 음원 파일이 없으니 APK가 그만큼 가볍고,
 * 네트워크 요청도 0으로 유지된다.
 */

let ctx = null;
let enabled = true;

export function setEnabled(v) { enabled = !!v; }

/**
 * 첫 사용자 제스처에서 반드시 호출한다.
 *
 * AudioContext는 사용자 제스처 전까지 suspended 상태로 만들어지고, 그대로 두면
 * 소리가 **에러 없이 조용히** 안 난다. 로그에도 안 남아 원인 찾기가 번거로운 종류의 실패다.
 */
export function unlock() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    // 소리는 없어도 게임은 돌아가야 한다.
  }
}

function tone({ freq, dur, type = 'sine', gain = 0.14, slideTo = null, delay = 0 }) {
  if (!enabled || !ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  // 시작을 0에서 올리지 않으면 '툭' 하는 클릭이 섞인다.
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** 돌 놓는 "톡". 짧고 낮게 — 한 판에 수십 번 나므로 거슬리면 안 된다. */
export function stone() {
  tone({ freq: 320, slideTo: 140, dur: 0.09, type: 'triangle', gain: 0.18 });
}

/** 이겼을 때 — 올라가는 3음. */
export function win() {
  [523, 659, 784, 1047].forEach((f, i) =>
    tone({ freq: f, dur: 0.22, type: 'square', gain: 0.1, delay: i * 0.11 }));
}

/** 졌을 때 — 내려가는 2음. 기죽지 않게 짧고 부드럽게. */
export function lose() {
  tone({ freq: 392, dur: 0.2, type: 'sine', gain: 0.12 });
  tone({ freq: 294, dur: 0.3, type: 'sine', gain: 0.12, delay: 0.18 });
}

/** 못 놓는 자리를 눌렀을 때. */
export function nope() {
  tone({ freq: 160, dur: 0.08, type: 'sawtooth', gain: 0.07 });
}
