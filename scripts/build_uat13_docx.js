'use strict';

/**
 * Dựng bản Word của hướng dẫn UAT 13 tài khoản từ scripts/uat13_content.js.
 * Chạy: node scripts/build_uat13_docx.js
 *
 * Bản in: phần chính khổ dọc, phụ lục khổ ngang để bảng 8 cột đọc được.
 * Sơ đồ nhúng dưới dạng PNG lấy từ docs/GOI_UAT_KHACH_HANG/assets/.
 */

const fs = require('fs');
const path = require('path');
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} = require('docx');

const { document: doc } = require('./uat13_content.js');

const root = path.resolve(__dirname, '..');
const docsDir = path.join(root, 'docs', 'GOI_UAT_KHACH_HANG');
const output = process.env.UAT13_DOCX_OUT
  ? path.resolve(process.env.UAT13_DOCX_OUT)
  : path.join(docsDir, '02_HUONG_DAN_TEST_13_TAI_KHOAN.docx');

/* ── Khổ giấy A4, lề 2cm ──────────────────────────────────────────────── */
const A4_W = 11906;
const A4_H = 16838;
const MARGIN = 1134;
const WIDTH_PORTRAIT = A4_W - MARGIN * 2;   // 9638 twip ≈ 642 px
const WIDTH_LANDSCAPE = A4_H - MARGIN * 2;  // 14570 twip ≈ 971 px
const PX_PORTRAIT = 642;

const FONT = 'Arial';
const C = {
  ink: '1B2A24',
  soft: '4A5A54',
  mute: '6B7280',
  brand: '0B8A43',
  accent: '4F46E5',
  rule: 'C9D6CF',
  head: 'EEF3F0',
  tint: 'ECFDF5',
  warn: 'FEF3C7',
  stop: 'FEE2E2',
  go: 'D1FAE5',
  blank: 'FAFAFA',
  white: 'FFFFFF',
};
const thinBorder = { style: BorderStyle.SINGLE, size: 2, color: C.rule };
const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

/* ── Đánh dấu inline: **đậm**, *nghiêng*, `mã` ─────────────────────────── */
function runs(text, base = {}) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    const token = m[0];
    if (token.startsWith('**')) parts.push({ text: token.slice(2, -2), bold: true });
    else if (token.startsWith('`')) parts.push({ text: token.slice(1, -1), mono: true });
    else parts.push({ text: token.slice(1, -1), italics: true });
    last = m.index + token.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  if (!parts.length) parts.push({ text: '' });

  const built = [];
  for (const p of parts) {
    // Giữ xuống dòng trong ô bảng.
    const lines = String(p.text).split('\n');
    lines.forEach((line, i) => {
      if (i > 0) built.push(new TextRun({ break: 1 }));
      built.push(new TextRun({
        text: line,
        font: p.mono ? 'Consolas' : (base.font || FONT),
        size: base.size || 20,
        bold: p.bold || base.bold || false,
        italics: p.italics || base.italics || false,
        color: base.color || C.ink,
      }));
    });
  }
  return built;
}

function para(text, opt = {}) {
  return new Paragraph({
    children: typeof text === 'string' ? runs(text, opt) : text,
    alignment: opt.alignment,
    spacing: { before: opt.before ?? 0, after: opt.after ?? 120, line: opt.line ?? 264 },
    indent: opt.indent,
    shading: opt.shading,
    border: opt.border,
    keepNext: opt.keepNext,
    pageBreakBefore: opt.pageBreakBefore,
  });
}

function eyebrow(text) {
  return new Paragraph({
    children: [new TextRun({ text: text.toUpperCase(), font: FONT, size: 15, bold: true, color: C.brand, characterSpacing: 24 })],
    spacing: { before: 0, after: 40 },
  });
}

function h2(text, opt = {}) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: 30, bold: true, color: C.ink })],
    spacing: { before: opt.before ?? 60, after: 120 },
    keepNext: true,
  });
}

function h3(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: 23, bold: true, color: C.ink })],
    spacing: { before: 200, after: 100 },
    keepNext: true,
  });
}

function muted(text) {
  return para(text, { color: C.soft, size: 19, after: 160 });
}

function bullet(text, opt = {}) {
  return new Paragraph({
    children: runs(text, { size: 20 }),
    bullet: { level: 0 },
    spacing: { before: 0, after: 70, line: 264 },
    ...opt,
  });
}

function numbered(text, n) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${n}.`.padEnd(4, ' '), font: FONT, size: 20, bold: true, color: C.brand }),
      ...runs(text, { size: 20 }),
    ],
    indent: { left: 340, hanging: 340 },
    spacing: { before: 0, after: 70, line: 264 },
  });
}

function checkbox(text) {
  return new Paragraph({
    children: [
      new TextRun({ text: '☐   ', font: 'Segoe UI Symbol', size: 22, color: C.brand }),
      ...runs(text, { size: 20 }),
    ],
    indent: { left: 340, hanging: 340 },
    spacing: { before: 0, after: 80, line: 264 },
  });
}

/** Khối chú ý có nền màu và viền trái. */
function noteBox(text, kind) {
  const fill = kind === 'stop' ? C.stop : kind === 'go' ? C.go : C.warn;
  const edge = kind === 'stop' ? 'EF4444' : kind === 'go' ? '10B981' : 'F59E0B';
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
      left: { style: BorderStyle.SINGLE, size: 18, color: edge },
    },
    rows: [new TableRow({
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill },
        margins: { top: 140, bottom: 140, left: 200, right: 200 },
        borders: {
          top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
          right: { style: BorderStyle.NONE },
          left: { style: BorderStyle.SINGLE, size: 18, color: edge },
        },
        children: [para(text, { size: 19, after: 0 })],
      })],
    })],
  });
}

function codeBlock(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: 'Consolas', size: 20, color: C.ink })],
    shading: { type: ShadingType.CLEAR, fill: C.head },
    border: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
    spacing: { before: 40, after: 160, line: 264 },
    indent: { left: 120, right: 120 },
  });
}

/* ── Bảng ─────────────────────────────────────────────────────────────── */
function buildTable(head, rows, widths, totalWidth, opt = {}) {
  const cols = widths.map((w) => Math.round((w / 100) * totalWidth));
  const size = opt.small ? 16 : 19;

  const headRow = new TableRow({
    tableHeader: true,
    children: head.map((h, i) => new TableCell({
      width: { size: cols[i], type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: C.head },
      borders: cellBorders,
      margins: { top: 90, bottom: 90, left: 110, right: 110 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        children: [new TextRun({ text: h, font: FONT, size: opt.small ? 14 : 16, bold: true, color: C.mute })],
        spacing: { before: 0, after: 0, line: 240 },
      })],
    })),
  });

  const bodyRows = rows.map((row) => new TableRow({
    children: row.map((cell, i) => {
      const isBlank = cell === '' && i >= head.length - 3;
      let children;
      if (i === 0 && opt.cases) {
        // Ô mã ca: dòng đầu là mã, dòng sau (nếu có) là tên chức năng.
        const [id, name] = String(cell).split('\n');
        const parts = [new TextRun({ text: id, font: 'Consolas', size, bold: true, color: C.brand })];
        if (name) parts.push(new TextRun({ break: 1 }), new TextRun({ text: name, font: FONT, size: size - 1, color: C.soft }));
        children = parts;
      } else {
        children = runs(cell, { size });
      }
      return new TableCell({
        width: { size: cols[i], type: WidthType.DXA },
        borders: cellBorders,
        margins: { top: 80, bottom: 80, left: 110, right: 110 },
        shading: isBlank ? { type: ShadingType.CLEAR, fill: C.blank } : undefined,
        children: [new Paragraph({ children, spacing: { before: 0, after: 0, line: 250 } })],
      });
    }),
  }));

  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: cols,
    layout: TableLayoutType.FIXED,
    borders: {
      top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder,
      insideHorizontal: thinBorder, insideVertical: thinBorder,
    },
    rows: [headRow, ...bodyRows],
  });
}

/* ── Ảnh ──────────────────────────────────────────────────────────────── */
function pngSize(file) {
  const buf = fs.readFileSync(file);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), data: buf };
}

function figure(relPath, caption, maxPx = PX_PORTRAIT) {
  const file = path.join(docsDir, relPath);
  if (!fs.existsSync(file)) throw new Error(`Thiếu ảnh: ${relPath}`);
  const { w, h, data } = pngSize(file);
  const width = Math.min(maxPx, w);
  const height = Math.round((h / w) * width);
  return [
    new Paragraph({
      children: [new ImageRun({ type: 'png', data, transformation: { width, height } })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 60 },
    }),
    new Paragraph({
      children: runs(caption, { size: 17, color: C.mute, italics: true }),
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 200 },
    }),
  ];
}

/* ── Dựng khối theo model chung ───────────────────────────────────────── */
function renderBlock(b, width) {
  const out = [];
  switch (b.t) {
    case 'p':
      out.push(para(b.text, { size: b.muted ? 18 : 20, color: b.muted ? C.mute : C.ink, after: 160 }));
      break;
    case 'note':
      out.push(noteBox(b.text, b.kind), para('', { after: 60 }));
      break;
    case 'sub':
      out.push(h3(b.title));
      if (b.text) out.push(muted(b.text));
      break;
    case 'checks':
      for (const item of b.items) out.push(checkbox(item));
      out.push(para('', { after: 60 }));
      break;
    case 'ol':
      b.items.forEach((item, i) => out.push(numbered(item, i + 1)));
      out.push(para('', { after: 60 }));
      break;
    case 'ul':
      for (const item of b.items) out.push(bullet(item));
      out.push(para('', { after: 60 }));
      break;
    case 'kv':
      if (b.title) out.push(h3(b.title));
      out.push(buildTable(
        ['Nội dung', 'Điền vào đây'],
        b.items.map(([k, v]) => [k, v ? `${' '.repeat(30)}${v}` : ' '.repeat(40)]),
        [38, 62], width,
      ));
      out.push(para('', { after: 160 }));
      break;
    case 'figure':
      break;
    case 'questions':
      out.push(buildTable(
        ['#', 'Câu hỏi — chép nguyên văn', 'Kết quả mong đợi'],
        b.items.map(([q, e], i) => [String(i + 1).padStart(2, '0'), q, e]),
        [6, 40, 54], width,
      ));
      out.push(para('', { after: 160 }));
      break;
    case 'grid2':
      for (const card of b.cards) {
        out.push(h3(card.title));
        for (const q of card.questions) out.push(bullet(`\`${q}\``));
        out.push(para(card.note, { size: 18, color: C.mute, after: 160 }));
      }
      break;
    case 'legend':
      out.push(buildTable(
        ['Trạng thái', 'Dùng khi'],
        b.items.map(([, label, desc]) => [`**${label}**`, desc]),
        [24, 76], width,
      ));
      out.push(para('', { after: 160 }));
      break;
    case 'table':
      out.push(buildTable(b.head, b.rows, b.widths, width));
      out.push(para('', { after: 160 }));
      break;
    case 'codeblock':
      out.push(codeBlock(b.text));
      break;
    default:
      throw new Error(`Khối chưa hỗ trợ trong Word: ${b.t}`);
  }
  return out;
}

/* ══ Phần chính ═══════════════════════════════════════════════════════ */
const main = [];

main.push(eyebrow('Medstand AI · Kiểm thử Pilot'));
main.push(new Paragraph({
  children: [new TextRun({ text: `${doc.meta.h1a} ${doc.meta.h1b}`, font: FONT, size: 44, bold: true, color: C.ink })],
  spacing: { before: 0, after: 160 },
}));
main.push(para(doc.meta.lede, { size: 21, color: C.soft, after: 200 }));
main.push(buildTable(
  ['Mục', 'Nội dung'],
  doc.meta.strip.map(([k, v]) => [`**${k}**`, v]),
  [24, 76], WIDTH_PORTRAIT,
));
main.push(para('', { after: 240 }));

main.push(h2('Mục lục', { before: 0 }));
main.push(buildTable(
  ['#', 'Nội dung'],
  doc.toc.map(([n, label]) => [n, label]),
  [10, 90], WIDTH_PORTRAIT,
));
main.push(new Paragraph({ children: [new PageBreak()] }));

doc.sections.forEach((sec, idx) => {
  if (idx > 0) main.push(para('', { after: 200 }));
  main.push(eyebrow(`Mục ${sec.num}`));
  main.push(h2(sec.title, { before: 0 }));
  if (sec.intro) main.push(muted(sec.intro));
  for (const b of sec.blocks) main.push(...renderBlock(b, WIDTH_PORTRAIT));
});

/* ══ Phụ lục — khổ ngang ══════════════════════════════════════════════ */
const appx = [];
const ap = doc.appendix;

appx.push(eyebrow('Phụ lục'));
appx.push(h2(ap.title, { before: 0 }));
appx.push(muted(ap.intro));

ap.parts.forEach((part, i) => {
  appx.push(new Paragraph({
    children: [new TextRun({ text: `${part.label}. ${part.title}`, font: FONT, size: 26, bold: true, color: C.brand })],
    spacing: { before: i === 0 ? 200 : 0, after: 100 },
    pageBreakBefore: i > 0,
    keepNext: true,
  }));
  appx.push(muted(part.intro));
  appx.push(buildTable(part.head, part.rows, part.widths, WIDTH_LANDSCAPE, { cases: true, small: true }));
  appx.push(para('', { after: 120 }));
  if (part.pass) appx.push(noteBox(`**Kết quả đạt** — ${part.pass}`, 'go'), para('', { after: 120 }));
});

const done = ap.completion;
appx.push(new Paragraph({
  children: [new TextRun({ text: `${done.label}. ${done.title}`, font: FONT, size: 26, bold: true, color: C.brand })],
  spacing: { before: 0, after: 100 },
  pageBreakBefore: true,
  keepNext: true,
}));
appx.push(muted(done.intro));
for (const item of done.items) appx.push(checkbox(item));

/* ══ Đóng gói ═════════════════════════════════════════════════════════ */
function chrome(label) {
  return {
    headers: {
      default: new Header({
        children: [new Paragraph({
          children: [new TextRun({ text: `Medstand AI · Hướng dẫn kiểm thử 13 tài khoản · ${label}`, font: FONT, size: 15, color: C.mute })],
          border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: C.rule, space: 6 } },
          spacing: { after: 120 },
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'Trang ', font: FONT, size: 15, color: C.mute }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 15, color: C.mute }),
            new TextRun({ text: ' / ', font: FONT, size: 15, color: C.mute }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 15, color: C.mute }),
          ],
        })],
      }),
    },
  };
}

const file = new Document({
  creator: 'Medstand AI',
  title: doc.meta.title,
  description: 'Bộ hướng dẫn kiểm thử UAT cho 13 tài khoản Pilot — phần chính và phụ lục kiểm thử đầy đủ.',
  sections: [
    {
      properties: {
        page: {
          size: { width: A4_W, height: A4_H, orientation: 'portrait' },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      ...chrome('Phần chính'),
      children: main,
    },
    {
      properties: {
        page: {
          size: { width: A4_H, height: A4_W, orientation: 'landscape' },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      ...chrome('Phụ lục kiểm thử đầy đủ'),
      children: appx,
    },
  ],
});

Packer.toBuffer(file).then((buffer) => {
  try {
    fs.writeFileSync(output, buffer);
  } catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EPERM') {
      console.error(`✗ Không ghi được ${path.relative(root, output)} — file đang mở trong Word. Đóng file rồi chạy lại.`);
      process.exit(1);
    }
    throw err;
  }
  console.log(`✓ DOCX: ${path.relative(root, output)} (${(buffer.length / 1024).toFixed(0)} KB)`);
});
