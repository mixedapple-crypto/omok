/**
 * 구구단 로켓용 가짜 DOM — **진짜 `www/gugudan/index.html`을 파싱해** 트리로 세운다.
 *
 * 오목의 `_dom-stub.js`는 id를 부를 때마다 빈 요소를 만들어 준다(HTML을 읽지 않는다).
 * 그 방식이면 "HTML에 없는 id를 ui.js가 찾는" 결함과 "부모를 타고 올라가는 closest()"가 검사되지
 * 않는다. 구구단 화면은 `closest('.op')`·`closest('.reward')`와 위임 클릭에 기대는 곳이 많아
 * 실제 마크업 위에서 굴리는 편이 낫다. 파서는 이 프로젝트의 잘 닫힌 마크업만 감당하면 된다.
 *
 * 시계도 가짜다. app.js의 대기 시간(정답 0.3초·오답 1.2초·부모 잠금 3초)을 진짜로 기다리면
 * 24문제 세션 하나에 10초가 넘게 든다. `setTimeout`과 `performance.now()`를 같은 가상 시각에
 * 묶어 두면 **기다림 없이** 돌면서 "ms는 마지막 숫자 키까지만 센다" 같은 것을 정확히 잴 수 있다.
 */

import { readFileSync } from 'node:fs';

const VOID = new Set(['meta', 'link', 'br', 'hr', 'img', 'input', 'source']);

class El {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.className = '';
    this.id = '';
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this._text = '';
    this._attrs = {};
    this._listeners = {};
    const self = this;
    this.style = { setProperty: (k, v) => { self.style[k] = String(v); } };
    this.classList = {
      contains: (c) => self.className.split(/\s+/).includes(c),
      add: (c) => { if (!self.classList.contains(c)) self.className = `${self.className} ${c}`.trim(); },
      remove: (c) => { self.className = self.className.split(/\s+/).filter((x) => x && x !== c).join(' '); },
      toggle: (c, force) => {
        const on = force === undefined ? !self.classList.contains(c) : !!force;
        if (on) self.classList.add(c); else self.classList.remove(c);
        return on;
      },
    };
  }

  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  /** ui.toast가 애니메이션을 다시 태우려고 읽는다. 값은 쓰이지 않는다. */
  get offsetWidth() { return 0; }

  appendChild(c) {
    if (c.tagName === '#fragment') {
      for (const k of [...c.children]) this.appendChild(k);
      c.children = [];
      return c;
    }
    c.parentElement = this;
    this.children.push(c);
    return c;
  }

  setAttribute(n, v) {
    this._attrs[n] = String(v);
    if (n === 'id') this.id = String(v);
    else if (n === 'class') this.className = String(v);
    else if (n === 'hidden') this.hidden = true;
    else if (n.startsWith('data-')) {
      this.dataset[n.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v);
    }
  }
  getAttribute(n) { return this._attrs[n] ?? null; }

  addEventListener(t, fn) { (this._listeners[t] ||= []).push(fn); }
  focus() {}
  select() {}

  closest(sel) {
    let el = this;
    while (el) { if (match(el, sel)) return el; el = el.parentElement; }
    return null;
  }

  _descendants() {
    const out = [];
    const walk = (e) => { for (const c of e.children) { out.push(c); walk(c); } };
    walk(this);
    return out;
  }

  querySelectorAll(sel) {
    let scope = [this];
    for (const token of sel.trim().split(/\s+/)) {
      const next = [];
      for (const s of scope) for (const d of s._descendants()) if (match(d, token) && !next.includes(d)) next.push(d);
      scope = next;
    }
    return scope;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
}

/** `#id` · `.class` · `tag` · `[data-x]` · `[data-x="v"]` 와 그 조합. 이 프로젝트가 쓰는 만큼만. */
function match(el, token) {
  for (const part of token.split(/(?=[.#[])/)) {
    if (!part) continue;
    if (part.startsWith('#')) { if (el.id !== part.slice(1)) return false; }
    else if (part.startsWith('.')) { if (!el.classList.contains(part.slice(1))) return false; }
    else if (part.startsWith('[')) {
      const m = /^\[data-([a-z-]+)(?:="([^"]*)")?\]$/.exec(part);
      if (!m) return false;
      const key = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (el.dataset[key] === undefined) return false;
      if (m[2] !== undefined && el.dataset[key] !== m[2]) return false;
    } else if (el.tagName !== part) return false;
  }
  return true;
}

/** 아주 작은 HTML 파서. 잘 닫힌 마크업과 위 VOID 태그만 다룬다(범용 파서가 아니다). */
function parse(html) {
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
  const root = new El('body');
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9]+)>|<([a-zA-Z0-9]+)((?:\s+[a-zA-Z-]+(?:="[^"]*")?)*)\s*\/?>|([^<]+)/g;
  let m;
  while ((m = re.exec(body))) {
    const [full, close, open, attrs, text] = m;
    if (full.startsWith('<!--')) continue;
    if (close) { if (stack.length > 1) stack.pop(); continue; }
    if (open) {
      if (open === 'script') { // 모듈 스크립트는 테스트가 직접 import한다
        const end = body.indexOf('</script>', re.lastIndex);
        re.lastIndex = end < 0 ? body.length : end + 9;
        continue;
      }
      const el = new El(open);
      for (const a of attrs.matchAll(/([a-zA-Z-]+)(?:="([^"]*)")?/g)) if (a[1]) el.setAttribute(a[1], a[2] ?? '');
      stack[stack.length - 1].appendChild(el);
      if (!VOID.has(open)) stack.push(el);
      continue;
    }
    if (text && text.trim()) {
      const t = new El('#text');
      t._text = text.replace(/\s+/g, ' ');
      stack[stack.length - 1].appendChild(t);
    }
  }
  return root;
}

// Node 22+는 navigator·localStorage 같은 전역을 getter로만 둔다. 대입이 아니라 재정의로 덮는다.
const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });

/**
 * 전역에 가짜 DOM을 깐다. **ui.js·app.js를 import하기 전에** 불러야 한다 —
 * ui.js는 로드 시점에 `$('#…')`로 요소를 붙잡고, app.js는 로드 시 init()을 돈다.
 */
export function installDom(htmlPath) {
  const root = parse(readFileSync(htmlPath, 'utf8'));
  const docListeners = {};
  const mem = new Map();
  const rafs = new Map();
  let rafId = 0;

  const document = {
    hidden: false,
    body: root,
    querySelector: (s) => root.querySelector(s),
    querySelectorAll: (s) => root.querySelectorAll(s),
    getElementById: (id) => root.querySelector(`#${id}`),
    createElement: (t) => new El(t),
    createTextNode: (t) => { const e = new El('#text'); e._text = String(t); return e; },
    createDocumentFragment: () => new El('#fragment'),
    addEventListener: (t, fn) => { (docListeners[t] ||= []).push(fn); },
  };

  define('document', document);
  define('window', { addEventListener() {}, matchMedia: () => ({ matches: false }) });
  define('navigator', {});
  // https도 localhost도 아니게 두면 app.js가 서비스 워커 등록을 건너뛴다(테스트에 워커는 없다).
  define('location', { protocol: 'http:', hostname: 'test.invalid' });
  define('localStorage', {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
  });
  define('requestAnimationFrame', (fn) => { const id = ++rafId; rafs.set(id, fn); return id; });
  define('cancelAnimationFrame', (id) => { rafs.delete(id); });

  /** 이벤트를 target에서 부모로 올리고 마지막에 document로 보낸다(위임 클릭이 이 경로를 탄다). */
  function fire(target, type, ev = {}) {
    const e = { type, target, ...ev, preventDefault() {} };
    let el = target;
    while (el) { for (const fn of el._listeners?.[type] ?? []) fn(e); el = el.parentElement; }
    for (const fn of docListeners[type] ?? []) fn(e);
  }

  return {
    root,
    document,
    fire,
    $: (sel) => root.querySelector(sel),
    screen: () => root.querySelector('#app').dataset.screen,
    /** 화면에 실제로 있는 data-action 버튼을 누른다 — 없으면 던진다(오타를 통과시키지 않는다). */
    click(action) {
      const el = root.querySelector(`[data-action="${action}"]`);
      if (!el) throw new Error(`data-action="${action}" 버튼이 index.html에 없다`);
      fire(el, 'click');
    },
    /** 숫자판 키. '0'~'9' · 'del' · 'ok'. */
    key(k) {
      const el = root.querySelector(`[data-key="${k}"]`);
      if (!el) throw new Error(`data-key="${k}" 키가 index.html에 없다`);
      fire(el, 'click');
    },
    /** 목록이 만들어 낸 버튼(항로·박자·탭)처럼 정적 마크업이 아닌 것을 누른다. */
    clickEl(el) {
      if (!el) throw new Error('누를 요소가 없다');
      fire(el, 'click');
    },
    /** rAF 큐를 한 바퀴 돌린다(레이스 로켓·암송 박자). */
    tick(n = 1) {
      for (let i = 0; i < n; i++) {
        const q = [...rafs.values()];
        rafs.clear();
        for (const fn of q) fn();
      }
    },
    visibility(hidden) {
      document.hidden = hidden;
      for (const fn of docListeners.visibilitychange ?? []) fn({});
    },
  };
}

/**
 * 가상 시계. **import를 모두 마친 뒤** 부른다 — ESM 로더가 진짜 타이머를 쓰는 경우를 피한다.
 * `advance(ms)`는 그 사이에 만기가 된 콜백을 만기 시각 순서로 실행한다.
 */
export function installClock() {
  let vnow = 0;
  let id = 0;
  const timers = new Map();

  define('performance', { now: () => vnow });
  define('setTimeout', (fn, ms = 0) => { const t = ++id; timers.set(t, { at: vnow + ms, fn }); return t; });
  define('clearTimeout', (t) => { timers.delete(t); });
  define('setInterval', () => { throw new Error('가상 시계는 setInterval을 다루지 않는다'); });

  return {
    now: () => vnow,
    pending: () => timers.size,
    /** 시각을 ms만큼 흘린다. 도중에 만기가 된 콜백은 그 시각에서 실행된다. */
    advance(ms) {
      const target = vnow + ms;
      for (;;) {
        let next = null;
        for (const [t, v] of timers) if (v.at <= target && (!next || v.at < next[1].at)) next = [t, v];
        if (!next) break;
        timers.delete(next[0]);
        vnow = next[1].at;
        next[1].fn();
      }
      vnow = target;
    },
    /** 만기 콜백을 실행하지 않고 시각만 옮긴다(문제를 보고 고민한 시간 흉내). */
    idle(ms) { vnow += ms; },
  };
}
