/** 프레임워크 없는 최소 단언 도구. 의존성 0을 유지하기 위해 직접 만든다. */

let count = 0;
let failed = 0;
const failures = [];

export function ok(name, cond, detail = '') {
  count++;
  if (cond) {
    console.log(`ok ${count} - ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`FAIL ${count} - ${name}${detail ? `\n      ${detail}` : ''}`);
  }
}

export function eq(name, actual, expected) {
  ok(name, Object.is(actual, expected), `기대: ${expected} / 실제: ${actual}`);
}

export function eqArr(name, actual, expected) {
  const a = Array.from(actual ?? []);
  const e = Array.from(expected ?? []);
  const same = a.length === e.length && a.every((v, i) => v === e[i]);
  ok(name, same, `기대: [${e}] / 실제: [${a}]`);
}

export function report(suite) {
  console.log(`\n# ${suite}: ${count - failed}/${count} 통과`);
  if (failed) {
    console.log(`# 실패 항목: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
}
