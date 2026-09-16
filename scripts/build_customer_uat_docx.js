const fs = require('fs');
const path = require('path');
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} = require('docx');

const root = path.resolve(__dirname, '..');
const source = JSON.parse(
  fs.readFileSync(path.join(root, 'scripts', 'customer_uat_pack_content.json'), 'utf8'),
);
const outputDir = path.join(root, 'docs', 'GOI_UAT_KHACH_HANG');

const colors = {
  navy: '000000',
  blue: '000000',
  lightBlue: 'F2F2F2',
  green: '000000',
  gray: '4D4D4D',
  lightGray: 'F7F7F7',
  border: 'BFBFBF',
  white: 'FFFFFF',
};
const border = { style: BorderStyle.SINGLE, size: 1, color: colors.border };

function run(value, options = {}) {
  return new TextRun({
    text: String(value ?? ''),
    font: 'Arial',
    color: options.color || colors.navy,
    bold: Boolean(options.bold),
    size: options.size || 21,
  });
}

function para(value, options = {}) {
  return new Paragraph({
    children: Array.isArray(value) ? value : [run(value, options)],
    alignment: options.alignment || AlignmentType.LEFT,
    spacing: {
      before: options.before || 0,
      after: options.after === undefined ? 120 : options.after,
      line: options.line || 276,
    },
    heading: options.heading,
    bullet: options.bullet ? { level: 0 } : undefined,
    numbering: options.numbering
      ? { reference: 'customer-numbering', level: 0 }
      : undefined,
  });
}

function cover(definition) {
  return [
    para('MEDSTAND AI', {
      size: 22,
      bold: true,
      color: colors.green,
      alignment: AlignmentType.CENTER,
      before: 220,
      after: 360,
    }),
    para(definition.title, {
      size: 42,
      bold: true,
      alignment: AlignmentType.CENTER,
      after: 180,
    }),
    para(definition.subtitle, {
      size: 26,
      color: colors.blue,
      alignment: AlignmentType.CENTER,
      after: 160,
    }),
    para(definition.meta, {
      size: 19,
      color: colors.gray,
      alignment: AlignmentType.CENTER,
      after: 340,
    }),
  ];
}

function note(block) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: colors.lightBlue },
            margins: { top: 150, bottom: 150, left: 180, right: 180 },
            borders: { top: border, bottom: border, left: border, right: border },
            children: [
              para(block.title, { size: 21, bold: true, color: colors.blue, after: 40 }),
              para(block.text, { size: 20, after: 0 }),
            ],
          }),
        ],
      }),
    ],
  });
}

function dataTable(block) {
  const widths = block.widths || block.headers.map(() => 100 / block.headers.length);
  const header = new TableRow({
    tableHeader: true,
    children: block.headers.map((value, index) =>
      new TableCell({
        width: { size: widths[index], type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, fill: colors.blue },
        margins: { top: 100, bottom: 100, left: 100, right: 100 },
        borders: { top: border, bottom: border, left: border, right: border },
        children: [para(value, { size: 18, bold: true, color: colors.white, after: 0 })],
      }),
    ),
  });
  const rows = block.rows.map(
    (row, rowIndex) =>
      new TableRow({
        cantSplit: true,
        children: block.headers.map((_, index) =>
          new TableCell({
            width: { size: widths[index], type: WidthType.PERCENTAGE },
            shading:
              rowIndex % 2 === 1
                ? { type: ShadingType.CLEAR, fill: colors.lightGray }
                : undefined,
            margins: { top: 90, bottom: 90, left: 100, right: 100 },
            borders: { top: border, bottom: border, left: border, right: border },
            children: [para(row[index] || '', { size: 17, after: 0, line: 240 })],
          }),
        ),
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...rows],
  });
}

function blocks(items) {
  const output = [];
  for (const block of items) {
    if (block.type === 'h1') {
      output.push(
        para(block.text, {
          heading: HeadingLevel.HEADING_1,
          size: 29,
          bold: true,
          before: 180,
          after: 100,
        }),
      );
    } else if (block.type === 'h2') {
      output.push(
        para(block.text, {
          heading: HeadingLevel.HEADING_2,
          size: 23,
          bold: true,
          color: colors.blue,
          before: 120,
          after: 80,
        }),
      );
    } else if (block.type === 'p') {
      output.push(para(block.text));
    } else if (block.type === 'bullets') {
      block.items.forEach((item) => output.push(para(item, { bullet: true, after: 70 })));
    } else if (block.type === 'numbered') {
      block.items.forEach((item) => output.push(para(item, { numbering: true, after: 70 })));
    } else if (block.type === 'table') {
      output.push(dataTable(block), para('', { size: 4, after: 100 }));
    } else if (block.type === 'note') {
      output.push(note(block), para('', { size: 4, after: 100 }));
    } else if (block.type === 'pagebreak') {
      output.push(new Paragraph({ children: [new PageBreak()] }));
    } else if (block.type === 'blank') {
      for (let i = 0; i < (block.lines || 4); i += 1) {
        output.push(
          para('________________________________________________________________________________', {
            size: 16,
            color: colors.border,
            after: 140,
          }),
        );
      }
    }
  }
  return output;
}

function build(definition) {
  return new Document({
    creator: 'Medstand AI',
    title: definition.title,
    description: 'Bộ tài liệu kiểm tra dành cho khách hàng',
    numbering: {
      config: [
        {
          reference: 'customer-numbering',
          levels: [
            {
              level: 0,
              format: 'decimal',
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 420, hanging: 240 } } },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: 21, color: colors.navy },
          paragraph: { spacing: { after: 120, line: 276 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1020, right: 1020, bottom: 1020, left: 1020 } },
        },
        headers: {
          default: new Header({
            children: [
              para('MEDSTAND AI  |  TÀI LIỆU KIỂM TRA DÀNH CHO KHÁCH HÀNG', {
                size: 17,
                bold: true,
                color: colors.gray,
                alignment: AlignmentType.RIGHT,
                after: 0,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  run('Tài liệu kiểm tra Medstand AI - Không ghi mật khẩu  |  Trang ', {
                    size: 16,
                    color: colors.gray,
                  }),
                  new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 16, color: colors.gray }),
                ],
              }),
            ],
          }),
        },
        children: [...cover(definition), ...blocks(definition.blocks)],
      },
    ],
  });
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const requested = new Set(process.argv.slice(2));
  const definitions = requested.size
    ? source.documents.filter((definition) => requested.has(definition.fileName))
    : source.documents;
  const results = [];
  for (const definition of definitions) {
    const buffer = await Packer.toBuffer(build(definition));
    const file = path.join(outputDir, `${definition.fileName}.docx`);
    fs.writeFileSync(file, buffer);
    results.push({ file, bytes: buffer.length });
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
