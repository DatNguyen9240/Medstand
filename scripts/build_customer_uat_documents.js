const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = JSON.parse(
  fs.readFileSync(path.join(root, 'scripts', 'customer_uat_pack_content.json'), 'utf8'),
);
const outputDir = path.join(root, 'docs', 'GOI_UAT_KHACH_HANG');
const buildDir = path.join(outputDir, '.build');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderTable(block) {
  const widths = block.widths || block.headers.map(() => 100 / block.headers.length);
  const colgroup = widths.map((width) => `<col style="width:${width}%">`).join('');
  const headers = block.headers.map((value) => `<th>${escapeHtml(value)}</th>`).join('');
  const rows = block.rows
    .map(
      (row) =>
        `<tr>${block.headers
          .map((_, index) => `<td>${escapeHtml(row[index] || '')}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  return `<table><colgroup>${colgroup}</colgroup><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}

function renderBlock(block) {
  switch (block.type) {
    case 'h1':
      return `<h1>${escapeHtml(block.text)}</h1>`;
    case 'h2':
      return `<h2>${escapeHtml(block.text)}</h2>`;
    case 'p':
      return `<p>${escapeHtml(block.text)}</p>`;
    case 'bullets':
      return `<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    case 'numbered':
      return `<ol>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`;
    case 'table':
      return renderTable(block);
    case 'note':
      return `<div class="note"><strong>${escapeHtml(block.title)}</strong><br>${escapeHtml(block.text)}</div>`;
    case 'pagebreak':
      return '<div class="page-break"></div>';
    case 'blank':
      return Array.from({ length: block.lines || 4 }, () => '<div class="blank-line"></div>').join('');
    default:
      return '';
  }
}

function renderDocument(definition) {
  const blocks = definition.blocks.map(renderBlock).join('\n');
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(definition.title)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: Aptos, Arial, sans-serif; color: #172554; font-size: 10.5pt; line-height: 1.35; }
    .cover { text-align: center; padding: 12mm 0 8mm; }
    .brand { color: #159447; font-size: 12pt; font-weight: 700; letter-spacing: .08em; margin-bottom: 14mm; }
    .title { color: #172554; font-size: 24pt; line-height: 1.15; font-weight: 800; margin: 0 0 5mm; }
    .subtitle { color: #3157e6; font-size: 14pt; margin-bottom: 4mm; }
    .meta { color: #64748b; font-size: 9.5pt; }
    h1 { color: #172554; font-size: 16pt; margin: 7mm 0 3mm; page-break-after: avoid; }
    h2 { color: #3157e6; font-size: 12pt; margin: 5mm 0 2mm; page-break-after: avoid; }
    p { margin: 0 0 3mm; }
    li { margin-bottom: 2mm; }
    .note { background: #eef3ff; border: 1px solid #d8e0ec; padding: 4mm; margin: 4mm 0; }
    .note strong { color: #3157e6; }
    table { border-collapse: collapse; width: 100%; margin: 3mm 0 5mm; font-size: 8.8pt; page-break-inside: auto; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    th { background: #3157e6; color: #fff; text-align: left; font-weight: 700; padding: 2.5mm; border: 1px solid #d8e0ec; }
    td { vertical-align: top; padding: 2.5mm; border: 1px solid #d8e0ec; }
    tbody tr:nth-child(even) td { background: #f6f8fc; }
    .page-break { page-break-before: always; }
    .blank-line { border-bottom: 1px solid #d8e0ec; height: 10mm; }
    .footer { color: #64748b; font-size: 8pt; text-align: center; margin-top: 8mm; }
  </style>
</head>
<body>
  <div class="cover">
    <div class="brand">MEDSTAND AI</div>
    <div class="title">${escapeHtml(definition.title)}</div>
    <div class="subtitle">${escapeHtml(definition.subtitle)}</div>
    <div class="meta">${escapeHtml(definition.meta)}</div>
  </div>
  ${blocks}
  <div class="footer">Tài liệu dành cho kiểm thử Pilot · Không chứa mật khẩu</div>
</body>
</html>`;
}

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(buildDir, { recursive: true });

const outputs = [];
for (const definition of source.documents) {
  const html = renderDocument(definition);
  const filePath = path.join(buildDir, `${definition.fileName}.html`);
  fs.writeFileSync(filePath, html, 'utf8');
  outputs.push({
    fileName: definition.fileName,
    html: filePath,
    exportPdf: Boolean(definition.exportPdf),
  });
}

fs.writeFileSync(
  path.join(buildDir, 'manifest.json'),
  JSON.stringify(outputs, null, 2),
  'utf8',
);
console.log(JSON.stringify(outputs, null, 2));
