'use strict';

/**
 * Dựng bản HTML của hướng dẫn UAT 13 tài khoản từ scripts/uat13_content.js.
 * Chạy: node scripts/build_uat13_html.js
 */

const fs = require('fs');
const path = require('path');
const { document: doc } = require('./uat13_content.js');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs', 'GOI_UAT_KHACH_HANG', '02_HUONG_DAN_TEST_13_TAI_KHOAN.html');

/* ── Đánh dấu inline: **đậm**, *nghiêng*, `mã` ─────────────────────────── */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function md(value) {
  return esc(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>');
}

const out = [];
const push = (line) => out.push(line);

/* ══ CSS ══════════════════════════════════════════════════════════════ */
const CSS = `
  /* ── Tokens: kế thừa Design System v2 của Medstand ───────────────── */
  :root {
    --brand:        #0b8a43;
    --brand-strong: #066533;
    --brand-tint:   #ecfdf5;
    --accent:       #4f46e5;
    --accent-tint:  #eef2ff;

    --pass:    #10b981;
    --pass-bg: #d1fae5;
    --hold:    #f59e0b;
    --hold-bg: #fef3c7;
    --fail:    #ef4444;
    --fail-bg: #fee2e2;

    --ground:  #f4f6fa;
    --surface: #ffffff;
    --raised:  #ffffff;

    --ink:      #1b2a24;
    --ink-soft: #4a5a54;
    --ink-mute: #6b7280;

    --rule:        #e7f2eb;
    --rule-strong: #cbd5e1;

    --shadow: 0 1px 2px rgba(27, 42, 36, .05), 0 8px 24px -12px rgba(27, 42, 36, .12);

    --sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
    --mono: ui-monospace, 'SF Mono', 'Cascadia Code', 'Cascadia Mono', Consolas, 'Liberation Mono', monospace;

    --measure: 68ch;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --brand: #34d399; --brand-strong: #6ee7b7; --brand-tint: #0d2c1f;
      --accent: #a5b4fc; --accent-tint: #1e1b4b;
      --pass: #34d399; --pass-bg: #0d2c1f;
      --hold: #fbbf24; --hold-bg: #35270a;
      --fail: #f87171; --fail-bg: #3a1516;
      --ground: #0e1512; --surface: #16201c; --raised: #1c2723;
      --ink: #e8f0ec; --ink-soft: #a9bcb3; --ink-mute: #7d918a;
      --rule: #26332d; --rule-strong: #3a4b43;
      --shadow: 0 1px 2px rgba(0,0,0,.4), 0 8px 24px -12px rgba(0,0,0,.6);
    }
  }
  :root[data-theme="dark"] {
    --brand: #34d399; --brand-strong: #6ee7b7; --brand-tint: #0d2c1f;
    --accent: #a5b4fc; --accent-tint: #1e1b4b;
    --pass: #34d399; --pass-bg: #0d2c1f;
    --hold: #fbbf24; --hold-bg: #35270a;
    --fail: #f87171; --fail-bg: #3a1516;
    --ground: #0e1512; --surface: #16201c; --raised: #1c2723;
    --ink: #e8f0ec; --ink-soft: #a9bcb3; --ink-mute: #7d918a;
    --rule: #26332d; --rule-strong: #3a4b43;
    --shadow: 0 1px 2px rgba(0,0,0,.4), 0 8px 24px -12px rgba(0,0,0,.6);
  }
  :root[data-theme="light"] {
    --brand: #0b8a43; --brand-strong: #066533; --brand-tint: #ecfdf5;
    --accent: #4f46e5; --accent-tint: #eef2ff;
    --pass: #10b981; --pass-bg: #d1fae5;
    --hold: #f59e0b; --hold-bg: #fef3c7;
    --fail: #ef4444; --fail-bg: #fee2e2;
    --ground: #f4f6fa; --surface: #ffffff; --raised: #ffffff;
    --ink: #1b2a24; --ink-soft: #4a5a54; --ink-mute: #6b7280;
    --rule: #e7f2eb; --rule-strong: #cbd5e1;
    --shadow: 0 1px 2px rgba(27,42,36,.05), 0 8px 24px -12px rgba(27,42,36,.12);
  }

  /* ── Nền ─────────────────────────────────────────────────────────── */
  body {
    background: var(--ground);
    color: var(--ink);
    font-family: var(--sans);
    font-size: 16px;
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
  }

  .wrap {
    max-width: 60rem;
    margin: 0 auto;
    padding: clamp(1.5rem, 4vw, 3.5rem) clamp(1rem, 4vw, 2rem) 5rem;
    display: flex;
    flex-direction: column;
    gap: clamp(2.5rem, 5vw, 4rem);
  }

  /* ── Chữ ─────────────────────────────────────────────────────────── */
  h1, h2, h3 { text-wrap: balance; margin: 0; line-height: 1.2; letter-spacing: -.015em; }
  h1 { font-size: clamp(1.75rem, 1.1rem + 2.6vw, 2.7rem); font-weight: 700; }
  h2 { font-size: clamp(1.25rem, 1rem + 1vw, 1.6rem); font-weight: 650; }
  h3 { font-size: 1.05rem; font-weight: 650; }
  p  { margin: 0; max-width: var(--measure); }
  a  { color: var(--accent); text-underline-offset: .2em; }
  code, kbd, .mono { font-family: var(--mono); font-size: .92em; }

  .eyebrow {
    font-size: .72rem; font-weight: 650; letter-spacing: .12em;
    text-transform: uppercase; color: var(--brand);
  }
  .lede { font-size: 1.08rem; color: var(--ink-soft); max-width: var(--measure); }
  .muted { color: var(--ink-mute); }

  /* ── Đầu trang ───────────────────────────────────────────────────── */
  .masthead { display: flex; flex-direction: column; gap: 1rem; }
  .masthead .rule-line {
    height: 3px; width: 4.5rem; border-radius: 2px;
    background: linear-gradient(90deg, var(--brand), var(--accent));
  }
  .meta-strip {
    display: flex; flex-wrap: wrap; gap: .5rem 1.5rem;
    padding-top: 1rem; border-top: 1px solid var(--rule);
    font-size: .85rem; color: var(--ink-mute);
  }
  .meta-strip b { color: var(--ink-soft); font-weight: 600; }

  /* ── Khối chung ──────────────────────────────────────────────────── */
  section { display: flex; flex-direction: column; gap: 1.25rem; scroll-margin-top: 1.5rem; }
  .sec-head { display: flex; flex-direction: column; gap: .4rem; }

  .card {
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: 12px;
    padding: 1.25rem 1.4rem;
    box-shadow: var(--shadow);
  }

  .note {
    border-left: 3px solid var(--hold);
    background: var(--hold-bg);
    color: var(--ink);
    padding: .9rem 1.1rem;
    border-radius: 0 8px 8px 0;
    font-size: .95rem;
  }
  .note.stop { border-left-color: var(--fail); background: var(--fail-bg); }
  .note.go   { border-left-color: var(--pass); background: var(--pass-bg); }
  .note b { font-weight: 650; }

  /* ── Mục lục ─────────────────────────────────────────────────────── */
  .toc { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: .5rem; }
  .toc a {
    display: flex; align-items: baseline; gap: .6rem;
    padding: .6rem .8rem; border-radius: 8px;
    background: var(--surface); border: 1px solid var(--rule);
    text-decoration: none; color: var(--ink); font-size: .9rem;
  }
  .toc a:hover, .toc a:focus-visible { border-color: var(--brand); background: var(--brand-tint); }
  .toc .n { font-family: var(--mono); font-size: .78rem; color: var(--brand); font-weight: 600; }

  /* ── Checklist lưu tiến độ ───────────────────────────────────────── */
  .checks { display: flex; flex-direction: column; gap: .1rem; }
  .check {
    display: flex; align-items: flex-start; gap: .75rem;
    padding: .7rem .9rem; border-radius: 8px; cursor: pointer;
    border: 1px solid transparent;
  }
  .check:hover { background: var(--brand-tint); }
  .check input { margin-top: .35rem; width: 1.05rem; height: 1.05rem; accent-color: var(--brand); flex: none; }
  .check span { font-size: .95rem; }
  .check input:checked + span { color: var(--ink-mute); text-decoration: line-through; }

  /* ── Thẻ câu hỏi có nút chép ─────────────────────────────────────── */
  .qlist { display: flex; flex-direction: column; gap: .85rem; }
  .q {
    background: var(--surface); border: 1px solid var(--rule);
    border-radius: 12px; overflow: hidden;
  }
  .q-top { display: flex; align-items: flex-start; gap: .9rem; padding: .95rem 1.1rem; }
  .q-num {
    font-family: var(--mono); font-size: .78rem; font-weight: 650;
    color: var(--surface); background: var(--brand);
    min-width: 1.6rem; height: 1.6rem; border-radius: 6px;
    display: grid; place-items: center; flex: none; margin-top: .1rem;
  }
  .q-text { flex: 1; font-size: 1rem; font-weight: 550; }
  .q-copy {
    flex: none; font: inherit; font-size: .82rem; font-weight: 600;
    padding: .38rem .75rem; border-radius: 7px; cursor: pointer;
    border: 1px solid var(--rule-strong); background: transparent; color: var(--ink-soft);
    transition: background .15s, color .15s, border-color .15s;
  }
  .q-copy:hover, .q-copy:focus-visible { border-color: var(--accent); color: var(--accent); background: var(--accent-tint); }
  .q-copy[data-done="1"] { border-color: var(--pass); color: var(--pass); background: var(--pass-bg); }
  .q-expect {
    padding: .7rem 1.1rem .9rem 3.6rem;
    border-top: 1px dashed var(--rule);
    font-size: .88rem; color: var(--ink-soft);
    background: color-mix(in srgb, var(--brand-tint) 45%, transparent);
  }
  .q-expect b { color: var(--brand); font-weight: 650; }

  /* ── Bảng ────────────────────────────────────────────────────────── */
  .tbl-scroll { overflow-x: auto; border: 1px solid var(--rule); border-radius: 12px; background: var(--surface); }
  table { border-collapse: collapse; width: 100%; font-size: .9rem; min-width: 30rem; }
  th, td { padding: .7rem .9rem; text-align: left; border-bottom: 1px solid var(--rule); vertical-align: top; }
  th { font-size: .75rem; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-mute); font-weight: 650; background: color-mix(in srgb, var(--ground) 60%, transparent); }
  tr:last-child td { border-bottom: none; }
  td.num { font-variant-numeric: tabular-nums; text-align: right; font-family: var(--mono); }

  /* Bảng ca kiểm thử ở phụ lục — nhiều cột, chữ nhỏ hơn, tràn rộng hơn phần chính */
  .tbl-cases { width: min(94vw, 84rem); margin-left: calc(50% - min(47vw, 42rem)); }
  .tbl-cases table { font-size: .82rem; min-width: 62rem; }
  .tbl-cases th, .tbl-cases td { padding: .55rem .65rem; }
  .tbl-cases .case-id { font-family: var(--mono); font-size: .78rem; font-weight: 650; color: var(--brand); }
  .tbl-cases .case-name { display: block; margin-top: .15rem; font-size: .78rem; font-weight: 550; color: var(--ink-soft); }
  .tbl-cases td:nth-child(4) { white-space: pre-line; }
  .tbl-cases tbody tr:nth-child(3n+1) td { border-top: 2px solid var(--rule-strong); }
  .tbl-cases.flat tbody tr:nth-child(3n+1) td { border-top: 1px solid var(--rule); }
  .tbl-cases .blank { background: color-mix(in srgb, var(--ground) 45%, transparent); }

  .pill {
    display: inline-block; font-size: .72rem; font-weight: 650;
    padding: .18rem .5rem; border-radius: 999px; letter-spacing: .02em;
  }
  .pill.pass { background: var(--pass-bg); color: var(--pass); }
  .pill.hold { background: var(--hold-bg); color: var(--hold); }
  .pill.fail { background: var(--fail-bg); color: var(--fail); }
  .pill.na   { background: color-mix(in srgb, var(--ink-mute) 16%, transparent); color: var(--ink-mute); }

  /* ── Sơ đồ ───────────────────────────────────────────────────────── */
  figure { margin: 0; display: flex; flex-direction: column; gap: .6rem; }
  .fig-frame {
    background: var(--surface); border: 1px solid var(--rule);
    border-radius: 12px; padding: 1.2rem; overflow-x: auto;
  }
  .fig-frame svg { display: block; width: 100%; height: auto; min-width: 30rem; }
  .fig-frame img { display: block; width: 100%; height: auto; border-radius: 8px; }
  figcaption { font-size: .82rem; color: var(--ink-mute); }

  .svg-card { fill: var(--surface); stroke: var(--rule-strong); }
  .svg-card-go { fill: var(--brand-tint); stroke: var(--brand); }
  .svg-t  { fill: var(--ink); font-family: var(--sans); font-weight: 650; }
  .svg-s  { fill: var(--ink-soft); font-family: var(--sans); }
  .svg-n  { fill: var(--brand); font-family: var(--mono); font-weight: 700; }
  .svg-ar { stroke: var(--rule-strong); fill: none; }

  /* ── Danh sách ───────────────────────────────────────────────────── */
  ul, ol { margin: 0; padding-left: 1.3rem; display: flex; flex-direction: column; gap: .45rem; max-width: var(--measure); }
  li::marker { color: var(--brand); }

  .kv { display: grid; grid-template-columns: auto 1fr; gap: .5rem 1.2rem; font-size: .92rem; align-items: baseline; }
  .kv dt { color: var(--ink-mute); }
  .kv dd { margin: 0; font-weight: 550; }

  .fill { border-bottom: 1.5px dotted var(--rule-strong); min-width: 8rem; display: inline-block; }

  .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr)); gap: 1rem; }

  .role-card { display: flex; flex-direction: column; gap: .7rem; }
  .role-card .role-name { display: flex; align-items: center; gap: .55rem; font-weight: 650; }
  .role-card .dot { width: .6rem; height: .6rem; border-radius: 50%; flex: none; }

  .codeblock {
    font-family: var(--mono); font-size: .9rem;
    background: var(--surface); border: 1px solid var(--rule-strong);
    border-radius: 8px; padding: .8rem 1rem; overflow-x: auto;
  }

  /* ── Phụ lục ─────────────────────────────────────────────────────── */
  .appx-head {
    display: flex; flex-direction: column; gap: .5rem;
    padding: 1.4rem 0 0; border-top: 3px solid var(--brand);
  }
  .appx-part { display: flex; flex-direction: column; gap: 1rem; scroll-margin-top: 1.5rem; }
  .appx-part h3 { display: flex; align-items: baseline; gap: .6rem; }
  .appx-part h3 .lbl {
    font-family: var(--mono); font-size: .8rem; font-weight: 700; color: var(--surface);
    background: var(--brand); border-radius: 6px; padding: .1rem .45rem;
  }

  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }

  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }

  @media print {
    body { background: #fff; }
    .q-copy, .toc { display: none; }
    .card, .q, .fig-frame, .tbl-scroll { box-shadow: none; break-inside: avoid; }
    section { break-inside: avoid-page; }
    .tbl-cases table { font-size: .68rem; min-width: 0; }
  }
`;

/* ══ Bộ dựng khối ═════════════════════════════════════════════════════ */

function renderTable(head, rows, widths, opts = {}) {
  const cls = opts.cases ? 'tbl-scroll tbl-cases' + (opts.flat ? ' flat' : '') : 'tbl-scroll';
  push(`    <div class="${cls}">`);
  push('      <table>');
  push('        <thead><tr>');
  head.forEach((h, i) => {
    const w = widths && widths[i] ? ` style="width:${widths[i]}%"` : '';
    push(`          <th${w}>${md(h)}</th>`);
  });
  push('        </tr></thead>');
  push('        <tbody>');
  for (const row of rows) {
    push('          <tr>');
    row.forEach((cell, i) => {
      const blank = opts.cases && cell === '' && i >= head.length - 3;
      if (opts.cases && i === 0) {
        const [id, name] = String(cell).split('\n');
        const label = name ? `<span class="case-id">${esc(id)}</span><span class="case-name">${esc(name)}</span>`
          : `<span class="case-id">${esc(id)}</span>`;
        push(`            <td>${label}</td>`);
        return;
      }
      push(`            <td${blank ? ' class="blank"' : ''}>${md(cell)}</td>`);
    });
    push('          </tr>');
  }
  push('        </tbody>');
  push('      </table>');
  push('    </div>');
}

function renderBlock(b, ctx) {
  switch (b.t) {
    case 'p':
      push(`    <p${b.muted ? ' class="muted" style="font-size:.85rem"' : ''}>${md(b.text)}</p>`);
      break;

    case 'note':
      push(`    <div class="note${b.kind === 'stop' ? ' stop' : b.kind === 'go' ? ' go' : ''}">${md(b.text)}</div>`);
      break;

    case 'sub':
      push('    <div class="sec-head" style="gap:.2rem">');
      push(`      <h3>${md(b.title)}</h3>`);
      if (b.text) push(`      <p class="muted" style="font-size:.9rem">${md(b.text)}</p>`);
      push('    </div>');
      break;

    case 'checks':
      push('    <div class="card">');
      push('      <div class="checks">');
      b.items.forEach((item, i) => {
        push(`        <label class="check"><input type="checkbox" data-k="${b.key}${i + 1}"><span>${md(item)}</span></label>`);
      });
      push('      </div>');
      push('    </div>');
      break;

    case 'ol':
    case 'ul': {
      const tag = b.t === 'ol' ? 'ol' : 'ul';
      push('    <div class="card">');
      push(`      <${tag}>`);
      for (const item of b.items) push(`        <li>${md(item)}</li>`);
      push(`      </${tag}>`);
      push('    </div>');
      break;
    }

    case 'kv':
      push('    <div class="card">');
      if (b.title) push(`      <div class="eyebrow" style="margin-bottom:.7rem">${md(b.title)}</div>`);
      push('      <dl class="kv">');
      for (const [k, v] of b.items) {
        const tail = v ? ` <span class="muted">${md(v)}</span>` : '';
        push(`        <dt>${md(k)}</dt><dd><span class="fill"></span>${tail}</dd>`);
      }
      push('      </dl>');
      push('    </div>');
      break;

    case 'figure':
      break;

    case 'questions':
      push('    <div class="qlist">');
      b.items.forEach(([q, expect], i) => {
        push('      <div class="q">');
        push('        <div class="q-top">');
        push(`          <span class="q-num">${String(i + 1).padStart(2, '0')}</span>`);
        push(`          <span class="q-text">${esc(q)}</span>`);
        push('          <button class="q-copy" type="button">Chép</button>');
        push('        </div>');
        push(`        <div class="q-expect"><b>Mong đợi</b> — ${md(expect)}</div>`);
        push('      </div>');
      });
      push('    </div>');
      break;

    case 'grid2':
      push('    <div class="grid-2">');
      for (const card of b.cards) {
        push('      <div class="card role-card">');
        push(`        <div class="role-name"><span class="dot" style="background:var(--${card.color})"></span>${md(card.title)}</div>`);
        push('        <div class="qlist">');
        for (const q of card.questions) {
          push(`          <div class="q"><div class="q-top"><span class="q-text">${esc(q)}</span><button class="q-copy" type="button">Chép</button></div></div>`);
        }
        push('        </div>');
        push(`        <p class="muted" style="font-size:.88rem">${md(card.note)}</p>`);
        push('      </div>');
      }
      push('    </div>');
      break;

    case 'legend':
      push('    <div class="card">');
      push('      <div style="display:flex; flex-wrap:wrap; gap:1rem 1.5rem; font-size:.9rem">');
      for (const [kind, label, desc] of b.items) {
        push(`        <span><span class="pill ${kind}">${md(label)}</span> &nbsp;${md(desc)}</span>`);
      }
      push('      </div>');
      push('    </div>');
      break;

    case 'table':
      renderTable(b.head, b.rows, b.widths);
      break;

    case 'codeblock':
      push(`    <div class="codeblock">${esc(b.text)}</div>`);
      break;

    default:
      throw new Error(`Khối chưa hỗ trợ: ${b.t} (mục ${ctx})`);
  }
}

/* ══ Dựng trang ═══════════════════════════════════════════════════════ */

push(`<title>${esc(doc.meta.title)}</title>`);
push('');
push(`<style>${CSS}</style>`);
push('');
push('<div class="wrap">');
push('');

// Đầu trang
push('  <!-- ══ ĐẦU TRANG ══ -->');
push('  <header class="masthead">');
push('    <div class="eyebrow">Medstand AI · Kiểm thử Pilot</div>');
push(`    <h1>${esc(doc.meta.h1a)}<br>${esc(doc.meta.h1b)}</h1>`);
push(`    <p class="lede">${md(doc.meta.lede)}</p>`);
push('    <div class="rule-line"></div>');
push('    <div class="meta-strip">');
for (const [k, v] of doc.meta.strip) push(`      <span><b>${md(k)}</b> ${md(v)}</span>`);
push('    </div>');
push('  </header>');
push('');

// Mục lục
push('  <!-- ══ MỤC LỤC ══ -->');
push('  <nav class="toc" aria-label="Mục lục">');
for (const [n, label, id] of doc.toc) {
  push(`    <a href="#${id}"><span class="n">${esc(n)}</span> ${md(label)}</a>`);
}
push('  </nav>');
push('');

// Các mục chính
for (const sec of doc.sections) {
  push(`  <!-- ══ ${sec.num} ${sec.title.toUpperCase()} ══ -->`);
  push(`  <section id="${sec.id}">`);
  push('    <div class="sec-head">');
  push(`      <div class="eyebrow">${esc(sec.num)}</div>`);
  push(`      <h2>${md(sec.title)}</h2>`);
  if (sec.intro) push(`      <p class="muted">${md(sec.intro)}</p>`);
  push('    </div>');
  push('');
  for (const b of sec.blocks) renderBlock(b, sec.num);
  push('  </section>');
  push('');
}

// Phụ lục
const ap = doc.appendix;
push('  <!-- ══ PHỤ LỤC ══ -->');
push(`  <section id="${ap.id}">`);
push('    <div class="appx-head">');
push('      <div class="eyebrow">Phụ lục</div>');
push(`      <h2>${md(ap.title)}</h2>`);
push(`      <p class="muted">${md(ap.intro)}</p>`);
push('    </div>');
push('  </section>');
push('');

for (const part of ap.parts) {
  push(`  <section class="appx-part" id="${part.id}">`);
  push(`    <h3><span class="lbl">${esc(part.label)}</span> ${md(part.title)}</h3>`);
  push(`    <p class="muted" style="font-size:.9rem">${md(part.intro)}</p>`);
  renderTable(part.head, part.rows, part.widths, { cases: true, flat: part.label !== 'A' });
  if (part.pass) push(`    <div class="note go"><b>Kết quả đạt</b> — ${md(part.pass)}</div>`);
  push('  </section>');
  push('');
}

const done = ap.completion;
push(`  <section class="appx-part" id="${done.id}">`);
push(`    <h3><span class="lbl">${esc(done.label)}</span> ${md(done.title)}</h3>`);
push(`    <p class="muted" style="font-size:.9rem">${md(done.intro)}</p>`);
push('    <div class="card">');
push('      <div class="checks">');
done.items.forEach((item, i) => {
  push(`        <label class="check"><input type="checkbox" data-k="g${i + 1}"><span>${md(item)}</span></label>`);
});
push('      </div>');
push('    </div>');
push('  </section>');
push('');
push('</div>');
push('');

/* ══ Script ═══════════════════════════════════════════════════════════ */
push(`<script>
  // Nút chép câu hỏi
  document.querySelectorAll('.q-copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var card = btn.closest('.q-top');
      var text = card.querySelector('.q-text').textContent.trim();
      var reset = function () {
        setTimeout(function () { btn.textContent = 'Chép'; btn.removeAttribute('data-done'); }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          btn.textContent = 'Đã chép'; btn.setAttribute('data-done', '1'); reset();
        }).catch(function () {
          btn.textContent = 'Chép tay'; reset();
        });
      } else {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); btn.textContent = 'Đã chép'; btn.setAttribute('data-done', '1'); }
        catch (e) { btn.textContent = 'Chép tay'; }
        document.body.removeChild(ta); reset();
      }
    });
  });

  // Ghi nhớ tiến độ các checklist
  var KEY = 'medstand_uat_checklist';
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { saved = {}; }

  document.querySelectorAll('.check input[data-k]').forEach(function (box) {
    var k = box.getAttribute('data-k');
    if (saved[k]) box.checked = true;
    box.addEventListener('change', function () {
      saved[k] = box.checked;
      try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {}
    });
  });
</script>`);

fs.writeFileSync(output, out.join('\n') + '\n', 'utf8');
console.log(`✓ HTML: ${path.relative(root, output)} (${out.join('\n').length.toLocaleString('vi-VN')} ký tự)`);
