/**
 * 가짜 DOM — 브라우저 없이 game.js·lesson-flow.js·ui.js를 **통째로 import해 구동**하기 위한 최소 흉내.
 *
 * 왜 있는가: Chrome 확장이 없는 환경에서도 "버튼을 누르면 화면이 바뀌고, 판을 두드리면 돌이 놓이고,
 * 코치가 끼어든다"는 배선을 실행으로 확인하기 위해서다. 문자열 대조(wiring.test)는 핸들러의 존재만
 * 보고, 이 흉내는 핸들러가 실제로 **무슨 일을 하는지**까지 본다.
 *
 * 흉내의 범위는 이 프로젝트의 ui.js·game.js·render.js가 쓰는 API에 한정한다. 일반 DOM이 아니다.
 * 그리기 결과는 검사하지 않는다(render.test와 같은 stubCtx).
 */

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

function matchToken(el, token) {
  if (token.startsWith('#')) return el.id === token.slice(1);
  if (token.startsWith('.')) return el.classList.contains(token.slice(1));
  const attr = /^\[data-([a-z-]+)\]$/.exec(token);
  if (attr) {
    const key = attr[1].replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    return el.dataset[key] !== undefined;
  }
  return el.tagName === token;
}

class FakeEl {
  constructor(tagName, id = '') {
    this.tagName = tagName;
    this.id = id;
    this.dataset = {};
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.className = '';
    this.width = 0;
    this.height = 0;
    this.offsetWidth = 0;
    this._text = '';
    this._attrs = {};
    this._listeners = {};
    const self = this;
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

  get textContent() {
    return this._text + this.children.map((c) => c.textContent).join('');
  }

  set textContent(v) {
    this._text = String(v);
    this.children = [];
  }

  appendChild(child) {
    if (child.tagName === '#fragment') {
      for (const c of child.children) this.appendChild(c);
      child.children = [];
      return child;
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, v) { this._attrs[name] = String(v); }
  getAttribute(name) { return this._attrs[name] ?? null; }

  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }

  closest(sel) {
    let el = this;
    while (el) {
      if (matchToken(el, sel)) return el;
      el = el.parentElement;
    }
    return null;
  }

  _descendants() {
    const out = [];
    const walk = (el) => { for (const c of el.children) { out.push(c); walk(c); } };
    walk(this);
    return out;
  }

  querySelectorAll(sel) {
    const tokens = sel.trim().split(/\s+/);
    let scope = [this];
    for (const t of tokens) {
      const next = [];
      for (const s of scope) for (const d of s._descendants()) if (matchToken(d, t) && !next.includes(d)) next.push(d);
      scope = next;
    }
    return scope;
  }

  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }

  getBoundingClientRect() {
    const s = parseFloat(this.style.width) || 0;
    return { left: 0, top: 0, width: s, height: s, right: s, bottom: s };
  }

  getContext() { return stubCtx(); }
}

/**
 * 전역에 가짜 DOM을 깐다. 반드시 game.js를 import하기 **전에** 부른다 — game.js는 로드 시 init()을 돈다.
 * @param {{boardPx?: number}} [opts] 판을 담는 상자의 한 변(px). 렌더러가 이 값으로 판 크기를 정한다.
 */
export function installDom({ boardPx = 600 } = {}) {
  const registry = new Map();
  const docListeners = {};

  const byId = (id) => {
    if (!registry.has(id)) {
      const isCanvas = id === 'board' || id === 'lesson-board';
      const el = new FakeEl(isCanvas ? 'canvas' : 'div', id);
      if (isCanvas) {
        const wrap = new FakeEl('div');
        wrap.clientWidth = boardPx;
        wrap.clientHeight = boardPx;
        wrap.appendChild(el);
      }
      registry.set(id, el);
    }
    return registry.get(id);
  };

  const document = {
    hidden: false,
    querySelector: (sel) => {
      if (sel.startsWith('#') && !sel.includes(' ')) return byId(sel.slice(1));
      const [head, ...rest] = sel.trim().split(/\s+/);
      const base = head.startsWith('#') ? byId(head.slice(1)) : null;
      return base ? base.querySelector(rest.join(' ')) : null;
    },
    querySelectorAll: (sel) => {
      const [head, ...rest] = sel.trim().split(/\s+/);
      const base = head.startsWith('#') ? byId(head.slice(1)) : null;
      return base ? base.querySelectorAll(rest.join(' ')) : [];
    },
    getElementById: byId,
    createElement: (tag) => new FakeEl(tag),
    createTextNode: (text) => { const t = new FakeEl('#text'); t._text = String(text); return t; },
    createDocumentFragment: () => new FakeEl('#fragment'),
    addEventListener: (type, fn) => { (docListeners[type] ||= []).push(fn); },
  };

  const mem = new Map();
  // Node 22+는 navigator·localStorage 같은 전역을 getter로만 둔다. 대입이 아니라 재정의로 덮는다.
  const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  define('document', document);
  define('window', {
    devicePixelRatio: 2,
    addEventListener() {},
    matchMedia: () => ({ matches: false }),
    ResizeObserver: undefined,
  });
  define('navigator', {});
  define('localStorage', {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
  });
  define('getComputedStyle', () => ({ paddingLeft: '0px', paddingRight: '0px', paddingTop: '0px', paddingBottom: '0px' }));
  define('requestAnimationFrame', (fn) => setTimeout(() => fn(performance.now()), 16));
  define('cancelAnimationFrame', (id) => clearTimeout(id));
  // 워커가 없으면 game.js는 조용히 메인 스레드 AI로 폴백한다 — 그 경로를 그대로 쓴다.
  define('Worker', class { constructor() { throw new Error('테스트 환경에는 워커가 없다'); } });

  /** 이벤트를 target에서 시작해 부모로, 마지막에 document로 올린다. */
  function fire(target, type, ev = {}) {
    const e = { type, target, ...ev, preventDefault() {} };
    let el = target;
    while (el) {
      for (const fn of el._listeners?.[type] ?? []) fn(e);
      el = el.parentElement;
    }
    for (const fn of docListeners[type] ?? []) fn(e);
  }

  return {
    document,
    byId,
    /** data-action 버튼을 누른 것처럼. */
    click(action) {
      const el = new FakeEl('button');
      el.dataset.action = action;
      fire(el, 'click');
    },
    /** 교실 목록의 레슨 카드를 누른 것처럼. 카드는 ui.renderLessons가 실제로 만든 것이어야 한다. */
    clickLesson(id) {
      const card = byId('lesson-list').children.find((c) => c.dataset.lesson === id);
      if (!card) throw new Error(`레슨 카드가 없다: ${id}`);
      fire(card, 'click');
    },
    /** 칩(난이도·선공·코치)을 누른 것처럼. */
    chip(containerSel, attr, value) {
      const box = byId(containerSel.slice(1));
      const el = new FakeEl('button');
      el.className = 'chip';
      el.dataset[attr] = value;
      el.parentElement = box;
      fire(el, 'click');
    },
    /** 설정 체크박스를 바꾼 것처럼. */
    change(id, checked) {
      const el = byId(id);
      el.checked = checked;
      fire(el, 'change');
    },
    /** 캔버스를 두드린 것처럼. pointerdown(착수) 뒤 pointerup(오디오 잠금 해제). */
    tap(canvas, clientX, clientY) {
      fire(canvas, 'pointerdown', { clientX, clientY });
      fire(canvas, 'pointerup', { clientX, clientY });
    },
  };
}
