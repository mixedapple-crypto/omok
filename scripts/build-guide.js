/**
 * 부모님 안내 페이지 생성기 — `documents/*-지침서.md` → `www/guide/*.html`.
 *
 *   npm run guide
 *
 * 왜 손으로 쓴 HTML이 아니라 생성인가. 지침서는 사용자가 코드를 안 열고 보려고 만든
 * 문서라 낡아도 낡았다는 사실을 아무도 모른다. 예전에는 휴대폰용 사본을 claude.ai
 * 아티팩트로 따로 발행했는데, 그 사본은 기계 검사 밖이라 갱신을 빠뜨려도 아무것도
 * 죽지 않았다. 사본을 하나 더 손으로 두면 같은 구멍이 하나 더 생긴다. 그래서 정본에서
 * 뽑아 내고, `tests/guide.test.js`가 커밋된 결과가 지금 정본과 같은지 대조한다.
 *
 * 지침서는 개발자인 부모용 절(코드 위치·저장 데이터·검사 설명)과 그냥 부모님용 절이
 * 섞여 있다. 앞의 것은 아래 두 줄 사이에 넣어 두면 안내 페이지에서 빠진다.
 *   <!-- 부모 안내 제외 -->
 *   <!-- /부모 안내 제외 -->
 * 목차 절도 뺀다 — 페이지가 제목에서 자기 목차를 만든다.
 *
 * 생성물을 커밋하는 이유: `www/`가 그대로 APK에 들어간다. 배포 때만 만들면 APK에는 없다.
 * 의존성 0을 지키려고 지침서가 쓰는 마크다운만 직접 그린다(제목·문단·목록·표·굵게·코드·링크).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/** 포털의 게임 순서와 같다. 새 지침서를 만들면 여기에 한 줄 넣는다(테스트가 빠뜨림을 잡는다). */
export const GUIDES = [
  { slug: 'omok', doc: '오목-교실-지침서.md', icon: '⚫', game: '1. 오목' },
  { slug: 'math', doc: '숫자숲-친구들-지침서.md', icon: '🐶', game: '2. 더하기 빼기' },
  { slug: 'mul', doc: '곱셈-바다-지침서.md', icon: '🐟', game: '3. 곱셈 나눗셈' },
  { slug: 'gugudan', doc: '구구단-로켓-지침서.md', icon: '🚀', game: '4. 구구단' },
];

export const MARK_START = '<!-- 부모 안내 제외 -->';
export const MARK_END = '<!-- /부모 안내 제외 -->';

/**
 * 제외 구간과 목차 절을 걷어낸 줄 목록.
 * 표시는 **줄 전체가 그 문구일 때만** 인정한다 — 지침서 본문이 표시를 백틱 안에서 설명하기도 한다.
 * 짝이 안 맞으면 조용히 넘어가지 않고 죽는다. 닫는 줄을 빠뜨리면 문서 끝까지 사라진다.
 */
export function parentLines(md, name = '') {
  const out = [];
  let skip = false;
  let toc = false;
  for (const line of md.split('\n')) {
    const t = line.trim();
    if (t === MARK_START) {
      if (skip) throw new Error(`${name}: "${MARK_START}"가 닫히기 전에 다시 열렸다`);
      skip = true;
      continue;
    }
    if (t === MARK_END) {
      if (!skip) throw new Error(`${name}: 열지 않은 "${MARK_END}"가 있다`);
      skip = false;
      continue;
    }
    if (skip) continue;
    if (/^## /.test(line)) toc = line.trim() === '## 목차';
    if (toc) continue;
    out.push(line);
  }
  if (skip) throw new Error(`${name}: "${MARK_START}"가 닫히지 않았다`);
  return out;
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** GitHub 방식에 가까운 제목 앵커. 지침서의 목차 링크(#경험치와-레벨)와 같은 꼴이 나온다. */
export function slugify(text) {
  return text.trim().toLowerCase()
    .replace(/[`*]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
}

function inline(src) {
  const codes = [];
  let s = src.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => {
    const ext = /^https?:/.test(href);
    return `<a href="${href}"${ext ? ' rel="noopener"' : ''}>${text}</a>`;
  });
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
}

function cells(row) {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

/** 마크다운 줄 목록 → { title, intro, toc, body }. */
export function render(lines) {
  let title = '';
  let intro = '';
  const toc = [];
  const html = [];
  const used = new Set();
  let i = 0;

  const id = (text) => {
    let base = slugify(text) || 'section';
    let k = base;
    for (let n = 1; used.has(k); n++) k = `${base}-${n}`;
    used.add(k);
    return k;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }

    const h = /^(#{1,4}) (.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();
      if (level === 1) { title = text; i++; continue; }
      const k = id(text);
      if (level === 2) toc.push({ id: k, text });
      html.push(`<h${level} id="${k}">${inline(text)}</h${level}>`);
      i++;
      continue;
    }

    if (line.startsWith('```')) {
      const buf = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) buf.push(lines[i]);
      i++;
      html.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }

    if (line.startsWith('|')) {
      const rows = [];
      for (; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i]);
      const head = cells(rows[0]);
      const bodyRows = rows.slice(2).map(cells);
      html.push('<div class="tbl"><table><thead><tr>'
        + head.map((c) => `<th>${inline(c)}</th>`).join('')
        + '</tr></thead><tbody>'
        + bodyRows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')
        + '</tbody></table></div>');
      continue;
    }

    const li = /^(\s*)([-*]|\d+\.) (.*)$/;
    if (li.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      for (; i < lines.length && li.test(lines[i]); i++) {
        let text = li.exec(lines[i])[3];
        // 목록 항목이 다음 줄로 이어 쓰인 경우(들여쓴 줄)를 붙인다.
        while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1]) && !li.test(lines[i + 1])) {
          text += ' ' + lines[++i].trim();
        }
        items.push(`<li>${inline(text)}</li>`);
      }
      const tag = ordered ? 'ol' : 'ul';
      html.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }

    // 문단. 지침서는 한 문장 한 줄로 쓰므로 줄을 공백으로 잇는다(마크다운의 부드러운 줄바꿈).
    const buf = [];
    for (; i < lines.length; i++) {
      const l = lines[i];
      if (l.trim() === '' || /^#{1,4} /.test(l) || l.startsWith('|') || l.startsWith('```') || li.test(l)) break;
      buf.push(l.trim());
    }
    const p = buf.join(' ');
    if (!intro && toc.length === 0) intro = p;
    html.push(`<p>${inline(p)}</p>`);
  }

  // 목차에서 걷어낸 앵커를 본문 링크가 가리킬 수 있으므로, 남은 링크가 실제 제목을 가리키는지는 테스트가 본다.
  return { title, intro, toc, body: html.join('\n') };
}

const CSS = `
  :root{
    --paper:#FFF6E8; --meadow:#63B95D; --meadow-deep:#3E8C4A;
    --coral:#FF8A5C; --coral-deep:#E96F41; --sky:#BFE4F5;
    --ink:#41372A; --ink-soft:#8A7B66; --card:#FFFFFF; --line:#E9DECB; --tint:#FBF3E4;
  }
  *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
  html{color-scheme:light;scroll-padding-top:12px}
  body{background:var(--paper);color:var(--ink);font-family:'Noto Sans KR',system-ui,sans-serif;font-size:16px;line-height:1.75;padding:20px 16px 48px}
  .wrap{max-width:720px;margin:0 auto}
  a{color:var(--coral-deep)}
  .top{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
  .back{font-size:14px;text-decoration:none;color:var(--ink-soft);background:var(--card);border:1.5px solid var(--line);border-radius:999px;padding:5px 14px}
  .tabs{display:flex;gap:6px;flex-wrap:wrap;margin-top:14px}
  .tabs a{font-size:13.5px;text-decoration:none;color:var(--ink);background:var(--card);border:1.5px solid var(--line);border-radius:999px;padding:4px 12px;white-space:nowrap}
  .tabs a[aria-current]{background:var(--meadow-deep);border-color:var(--meadow-deep);color:#fff}
  h1{font-family:'Jua','Noto Sans KR',sans-serif;font-weight:400;font-size:28px;line-height:1.3;color:var(--meadow-deep);margin-top:22px}
  h2{font-family:'Jua','Noto Sans KR',sans-serif;font-weight:400;font-size:22px;line-height:1.35;margin:36px 0 10px;padding-top:14px;border-top:2px dashed var(--line)}
  h3{font-size:17px;font-weight:700;margin:24px 0 6px}
  h4{font-size:16px;font-weight:700;margin:18px 0 4px}
  p{margin:10px 0;word-break:keep-all;overflow-wrap:anywhere}
  ul,ol{margin:10px 0 10px 1.3em}
  li{margin:4px 0;word-break:keep-all;overflow-wrap:anywhere}
  b{font-weight:700}
  code{font-family:ui-monospace,Menlo,monospace;font-size:.9em;background:var(--tint);border-radius:5px;padding:1px 5px}
  pre{background:var(--tint);border-radius:10px;padding:10px 12px;overflow-x:auto}
  .tbl{overflow-x:auto;margin:12px 0;background:var(--card);border-radius:12px;border:1.5px solid var(--line)}
  table{border-collapse:collapse;width:100%;font-size:14.5px;line-height:1.5}
  th,td{padding:7px 10px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line);word-break:keep-all}
  th{background:var(--tint);font-weight:700;white-space:nowrap}
  tr:last-child td{border-bottom:0}
  .toc{background:var(--card);border:1.5px solid var(--line);border-radius:14px;padding:12px 16px;margin-top:16px}
  .toc b{font-size:14px;color:var(--ink-soft)}
  .toc ol{margin:6px 0 0 1.3em;font-size:15px}
  .lead{color:var(--ink-soft)}
  .cards{display:flex;flex-direction:column;gap:12px;margin-top:20px}
  a.card{display:flex;gap:14px;align-items:flex-start;text-decoration:none;color:var(--ink);background:var(--card);border-radius:18px;padding:14px 16px;border:1.5px solid var(--line);box-shadow:0 3px 0 rgba(65,55,42,.08)}
  .card .ic{font-size:36px;line-height:1.2}
  .card .nm{font-family:'Jua','Noto Sans KR',sans-serif;font-size:19px}
  .card .ds{font-size:14px;color:var(--ink-soft);line-height:1.6;margin-top:2px}
  footer{margin-top:40px;font-size:12.5px;color:var(--ink-soft)}
`;

function page({ title, desc, body, current }) {
  const tabs = GUIDES.map((g) =>
    `<a href="./${g.slug}.html"${g.slug === current ? ' aria-current="page"' : ''}>${g.icon} ${esc(g.game.replace(/^\d+\. /, ''))}</a>`).join('');
  return `<!DOCTYPE html>
<!-- 자동 생성 파일 — 고치지 말 것. documents/*-지침서.md를 고친 뒤 npm run guide. -->
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#FFF6E8">
<link rel="apple-touch-icon" href="../icons/icon-180.png">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jua&family=Noto+Sans+KR:wght@400;500;700&display=swap">
<style>${CSS}</style>
</head>
<body>
<main class="wrap">
  <div class="top">
    <a class="back" href="../">← 게임숲으로</a>
    ${current ? '<a class="back" href="./">📖 안내 처음</a>' : ''}
  </div>
  ${current ? `<nav class="tabs" aria-label="게임별 안내">${tabs}</nav>` : ''}
${body}
  <footer>이 안내는 게임 지침서에서 자동으로 만들어집니다. 게임 규칙이 바뀌면 함께 바뀝니다.</footer>
</main>
</body>
</html>
`;
}

/** 모든 안내 페이지를 { 'www/guide/x.html': 내용 } 으로 돌려준다. 파일은 쓰지 않는다(테스트가 같은 함수를 쓴다). */
export function buildGuide(root) {
  const out = {};
  const cards = [];
  for (const g of GUIDES) {
    const md = readFileSync(join(root, 'documents', g.doc), 'utf8');
    const r = render(parentLines(md, g.doc));
    const toc = r.toc.length
      ? `  <div class="toc"><b>차례</b><ol>${r.toc.map((t) => `<li><a href="#${t.id}">${inline(t.text)}</a></li>`).join('')}</ol></div>`
      : '';
    out[`www/guide/${g.slug}.html`] = page({
      title: `${r.title.split(' — ')[0]} 안내`,
      desc: r.intro.replace(/[`*]/g, ''),
      current: g.slug,
      body: `  <h1>${inline(r.title)}</h1>\n${toc}\n<article>\n${r.body}\n</article>`,
    });
    cards.push(`<a class="card" href="./${g.slug}.html"><span class="ic">${g.icon}</span><span><span class="nm">${esc(g.game)}</span><br><span class="ds">${inline(r.title)}</span></span></a>`);
  }
  out['www/guide/index.html'] = page({
    title: '부모님 안내',
    desc: '우리집 게임숲 네 게임의 규칙·보상·부모님 화면 안내',
    current: null,
    body: `  <h1>📖 부모님 안내</h1>
  <p class="lead">게임마다 무엇을 어떤 순서로 연습시키는지, 용돈과 별은 어떻게 쌓이는지, 부모님 화면에서 무엇을 볼 수 있는지 정리했습니다. 아이가 "이거 왜 안 열려?"라고 물을 때 여기서 찾아보시면 됩니다.</p>
  <nav class="cards">${cards.join('')}</nav>`,
  });
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const files = buildGuide(root);
  mkdirSync(join(root, 'www', 'guide'), { recursive: true });
  for (const [rel, html] of Object.entries(files)) {
    writeFileSync(join(root, rel), html);
    console.log(`썼다: ${rel}`);
  }
}
