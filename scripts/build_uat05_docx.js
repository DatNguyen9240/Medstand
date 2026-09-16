'use strict';

/**
 * Dựng tài liệu số 05: kịch bản UAT 13 tài khoản dạng copy-paste.
 * Nội dung nghiệp vụ lấy từ uat13_content.js để đồng bộ với tài liệu số 02.
 * Chạy: node scripts/build_uat05_docx.js
 */

const fs = require('fs');
const path = require('path');
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
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

const {
  document: uatDocument,
  FUNCTIONS,
  EDGE_CASES,
  CUSTOMER_FLOW,
  ORDER_FLOW,
  PROMO_CASES,
  RECONCILE_CASES,
  CORE_QUESTIONS,
} = require('./uat13_content.js');

const root = path.resolve(__dirname, '..');
const output = path.join(
  root,
  'docs',
  'GOI_UAT_KHACH_HANG',
  '05_KICH_BAN_KIEM_THU_13_TAI_KHOAN.docx',
);

const A4_W = 11906;
const A4_H = 16838;
const MARGIN = 1134;
const CONTENT_W = A4_W - MARGIN * 2;
const FONT = 'Arial';
const C = {
  ink: '17221D',
  body: '28332E',
  muted: '66736D',
  brand: '0B7A3B',
  accent: '2457A6',
  border: 'CBD5CF',
  head: 'E8EEF5',
  soft: 'F4F7F5',
  note: 'FFF7DB',
  white: 'FFFFFF',
};

const accounts = [
  ['01', 'QLBH013.MED', 'Quản lý', 'Miền Bắc', 'NDB001'],
  ['02', 'NAMDINHB.MED', 'Nhân viên kinh doanh', 'Miền Bắc', 'NDB001'],
  ['03', 'QLBH016.MED', 'Quản lý', 'Miền Bắc', 'BNA051'],
  ['04', 'BACNINHA.MED', 'Nhân viên kinh doanh', 'Miền Bắc', 'BNA051'],
  ['05', 'QLBH005.MED', 'Quản lý', 'Miền Trung', 'HUEA043'],
  ['06', 'HUEB.MED', 'Nhân viên kinh doanh', 'Miền Trung', 'HUEA043'],
  ['07', 'QLBH010.MED', 'Quản lý', 'Miền Trung', 'QANA002'],
  ['08', 'DANANGA.MED', 'Nhân viên kinh doanh', 'Miền Trung', 'QANA002'],
  ['09', 'QLMN2', 'Quản lý', 'Miền Nam', 'DL012'],
  ['10', 'CanThoA', 'Nhân viên kinh doanh', 'Miền Nam', 'DL012'],
  ['11', 'QLMD1', 'Quản lý', 'Miền Nam', 'SGNB0001'],
  ['12', 'BinhPhuocA', 'Nhân viên kinh doanh', 'Miền Nam', 'SGNB0001'],
  ['13', 'QLBH024.MED', 'Quản lý', 'Miền Nam', 'AG0020'],
];

const SMOKE_PASS = '☑ PASS kỹ thuật (smoke)';

const thin = { style: BorderStyle.SINGLE, size: 2, color: C.border };
const borders = { top: thin, bottom: thin, left: thin, right: thin };

function textRuns(value, options = {}) {
  const text = String(value ?? '');
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return tokens.map((token) => {
    const bold = token.startsWith('**') && token.endsWith('**');
    const mono = token.startsWith('`') && token.endsWith('`');
    const clean = bold || mono ? token.slice(bold ? 2 : 1, bold ? -2 : -1) : token;
    return new TextRun({
      text: clean,
      font: mono ? 'Consolas' : FONT,
      size: options.size ?? 20,
      bold: bold || options.bold,
      italics: options.italics,
      color: options.color ?? C.body,
    });
  });
}

function paragraph(value, options = {}) {
  return new Paragraph({
    children: Array.isArray(value) ? value : textRuns(value, options),
    alignment: options.alignment,
    spacing: {
      before: options.before ?? 0,
      after: options.after ?? 120,
      line: options.line ?? 280,
    },
    indent: options.indent,
    keepNext: options.keepNext,
    pageBreakBefore: options.pageBreakBefore,
    numbering: options.numbering,
  });
}

function title(value) {
  return paragraph(value, { size: 42, bold: true, color: C.ink, after: 100, line: 480 });
}

function h1(value, pageBreakBefore = false) {
  return paragraph(value, {
    size: 30,
    bold: true,
    color: C.ink,
    before: 260,
    after: 120,
    keepNext: true,
    pageBreakBefore,
  });
}

function h2(value) {
  return paragraph(value, {
    size: 24,
    bold: true,
    color: C.accent,
    before: 200,
    after: 90,
    keepNext: true,
  });
}

function numbered(value) {
  return paragraph(value, {
    size: 20,
    after: 80,
    numbering: { reference: 'uat05-numbering', level: 0 },
  });
}

function checkbox(value) {
  return paragraph([
    new TextRun({ text: '☐  ', font: 'Segoe UI Symbol', size: 22, color: C.brand }),
    ...textRuns(value, { size: 20 }),
  ], { after: 85, indent: { left: 360, hanging: 360 } });
}

function note(label, value) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    layout: TableLayoutType.FIXED,
    rows: [new TableRow({ children: [new TableCell({
      width: { size: CONTENT_W, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: C.note },
      margins: { top: 140, bottom: 140, left: 180, right: 180 },
      borders,
      children: [
        paragraph(label, { size: 20, bold: true, color: C.ink, after: 40 }),
        paragraph(value, { size: 19, after: 0 }),
      ],
    })] })],
  });
}

function table(headers, rows, percentages, options = {}) {
  const widths = percentages.map((percent) => Math.round(CONTENT_W * percent / 100));
  widths[widths.length - 1] += CONTENT_W - widths.reduce((sum, width) => sum + width, 0);
  const fontSize = options.fontSize ?? 17;
  const header = new TableRow({
    tableHeader: true,
    children: headers.map((headerText, index) => new TableCell({
      width: { size: widths[index], type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: C.head },
      margins: { top: 90, bottom: 90, left: 110, right: 110 },
      borders,
      verticalAlign: VerticalAlign.CENTER,
      children: [paragraph(headerText, { size: 16, bold: true, color: C.ink, after: 0, line: 240 })],
    })),
  });
  const body = rows.map((row, rowIndex) => new TableRow({
    cantSplit: true,
    children: headers.map((_, index) => new TableCell({
      width: { size: widths[index], type: WidthType.DXA },
      shading: rowIndex % 2 ? { type: ShadingType.CLEAR, fill: C.soft } : undefined,
      margins: { top: 85, bottom: 85, left: 110, right: 110 },
      borders,
      verticalAlign: VerticalAlign.CENTER,
      children: [paragraph(row[index] ?? '', {
        size: fontSize,
        after: 0,
        line: options.line ?? 245,
        alignment: index === 0 && options.centerFirst ? AlignmentType.CENTER : AlignmentType.LEFT,
      })],
    })),
  }));
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: [header, ...body],
  });
}

function spacer(after = 140) {
  return paragraph('', { size: 2, after });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function simpleCaseRows(items) {
  return items.map(([id, role, prep, action, expected]) => [id, role, prep, action, expected, '']);
}

const children = [];

children.push(paragraph('MEDSTAND AI · GÓI UAT KHÁCH HÀNG · TÀI LIỆU 05', {
  size: 16,
  bold: true,
  color: C.brand,
  after: 80,
}));
children.push(title('KỊCH BẢN KIỂM THỬ 13 TÀI KHOẢN'));
children.push(paragraph('Bản copy-paste đầy đủ cho Nhân viên kinh doanh, Quản lý và Điều phối viên UAT', {
  size: 25,
  color: C.accent,
  after: 140,
}));
children.push(table(
  ['Thông tin', 'Nội dung'],
  [
    ['Môi trường', 'https://medtest.bms7.net/#/chatbot'],
    ['Phạm vi', '13 tài khoản · 24 chức năng hội thoại · luồng tạo và đối chiếu dữ liệu UAT'],
    ['Cập nhật', '28/07/2026'],
    ['Kết quả dùng', 'Đạt / Chưa đạt / Chưa chạy được / Không áp dụng'],
  ],
  [24, 76],
  { fontSize: 18 },
));
children.push(spacer());
children.push(note(
  'Cách dùng tài liệu này',
  'Mỗi người tìm đúng tài khoản ở mục 2, thay MÃ KHÁCH, MÃ SẢN PHẨM và SỐ HÓA ĐƠN bằng dữ liệu được điều phối viên cấp, rồi chép nguyên văn câu hỏi vào Trợ lý AI. Không ghi mật khẩu vào tài liệu hoặc ảnh báo lỗi.',
));

children.push(h1('1. Quy trình thực hiện'));
[
  'Mở đúng môi trường UAT và đăng nhập bằng tài khoản được phân công.',
  'Kiểm tra tên, vai trò và khu vực trước khi gửi câu hỏi đầu tiên.',
  'Chạy mục 3, sau đó chạy đủ 24 chức năng tại mục 4.',
  'Chạy ca thiếu tham số và ca biên tại mục 5; ghi lại mã tra cứu nếu màn hình có hiển thị.',
  'Chỉ người được phân công mới chạy luồng tạo dữ liệu ở mục 7.',
  'Ghi Đạt, Chưa đạt, Chưa chạy được hoặc Không áp dụng; đính kèm ảnh cho mọi trường hợp không Đạt.',
].forEach((item) => children.push(numbered(item)));

children.push(h2('Quy ước kết quả'));
children.push(table(
  ['Trạng thái', 'Dùng khi'],
  [
    ['Đạt', 'Đúng dữ liệu, đúng phạm vi quyền, dễ hiểu và thao tác hoạt động.'],
    ['Chưa đạt', 'Có phản hồi nhưng sai dữ liệu, sai quyền, sai nội dung hoặc thao tác không hoạt động đúng.'],
    ['Chưa chạy được', 'Không đăng nhập được, hệ thống trả lỗi hoặc không có phản hồi.'],
    ['Không áp dụng', 'Vai trò hoặc tài khoản không được phân công chức năng này.'],
  ],
  [24, 76],
));

children.push(h1('2. Bảng phân công 13 tài khoản', true));
children.push(table(
  ['STT', 'Tài khoản', 'Vai trò', 'Khu vực', 'Mã khách đại diện'],
  accounts,
  [7, 24, 25, 18, 26],
  { centerFirst: true },
));
children.push(spacer());
children.push(note(
  'Dữ liệu đại diện',
  'Mã khách trong bảng chỉ dùng cho kịch bản đã được phân công. Mã sản phẩm, số hóa đơn và mã ngoài phạm vi phải do điều phối viên cấp riêng; không tự thử dữ liệu khách hàng khác.',
));

children.push(h1('3. Bộ kiểm tra nhanh bắt buộc', true));
children.push(paragraph('Tất cả 13 tài khoản chạy 11 câu chung. Sau đó chạy thêm 2 câu đúng với vai trò.', {
  size: 20,
  color: C.muted,
  after: 140,
}));
children.push(table(
  ['Câu', 'Câu hỏi copy-paste', 'Kết quả mong đợi', 'Kết luận'],
  CORE_QUESTIONS.map(([question, expected], index) => [
    String(index + 1).padStart(2, '0'), question, expected,
    [6, 8, 10].includes(index) ? SMOKE_PASS : '',
  ]),
  [7, 35, 46, 12],
  { fontSize: 16, centerFirst: true },
));
children.push(spacer());
children.push(h2('Câu thêm theo vai trò'));
children.push(table(
  ['Vai trò', 'Câu hỏi copy-paste', 'Điểm cần kiểm', 'Kết luận'],
  [
    ['Nhân viên kinh doanh', 'Chấm điểm khách hàng của tôi', 'Không trả khách ngoài tuyến được giao.', ''],
    ['Nhân viên kinh doanh', 'Hôm nay bán gì cho khách MÃ KHÁCH?', 'Gợi ý đúng khách hoặc nói rõ chưa đủ dữ liệu.', ''],
    ['Quản lý', 'Chấm điểm khách hàng của tôi', 'Chỉ trả khách trong miền hoặc đội được giao.', ''],
    ['Quản lý', 'Sản phẩm nào cần xem xét khuyến mãi?', 'Chỉ là đề xuất để xem xét, không phải chương trình đã duyệt.', ''],
  ],
  [21, 32, 35, 12],
  { fontSize: 16 },
));
children.push(spacer());
children.push(h2('Kết quả smoke kỹ thuật đã có'));
children.push(paragraph(
  'Đã chạy trên hồ sơ Sale và Quản lý; mỗi hồ sơ đạt 8/8, không có lỗi HTTP, lỗi hệ thống hoặc lỗi phân tuyến. Đây là bằng chứng kỹ thuật, chưa thay cho kết quả khách hàng tự nghiệm thu.',
  { size: 18, color: C.muted, after: 120 },
));
children.push(table(
  ['Ca smoke', 'Thao tác', 'Sale', 'Quản lý'],
  [
    ['SM-01', 'Xin chào', SMOKE_PASS, SMOKE_PASS],
    ['SM-02', 'Tôi là ai?', SMOKE_PASS, SMOKE_PASS],
    ['SM-03', 'Doanh số hôm nay', SMOKE_PASS, SMOKE_PASS],
    ['SM-04', 'Công nợ chi tiết MÃ KHÁCH', SMOKE_PASS, SMOKE_PASS],
    ['SM-05', 'Gợi ý đơn hàng cho MÃ KHÁCH', SMOKE_PASS, SMOKE_PASS],
    ['SM-06', 'Tồn kho MÃ SẢN PHẨM', SMOKE_PASS, SMOKE_PASS],
    ['SM-07', 'Thiếu mã khách — hệ thống hỏi bổ sung', SMOKE_PASS, SMOKE_PASS],
    ['SM-08', 'Câu hỏi ngoài phạm vi — không gọi API', SMOKE_PASS, SMOKE_PASS],
  ],
  [12, 42, 23, 23],
  { fontSize: 16, line: 235, centerFirst: true },
));

children.push(h1('4. Kiểm thử đủ 24 chức năng hội thoại', true));
children.push(paragraph(
  'Chạy ít nhất ca chính của cả 24 chức năng. Cột Cách hỏi khác dùng để kiểm tra hệ thống hiểu cách diễn đạt tương đương.',
  { size: 20, color: C.muted, after: 140 },
));
children.push(table(
  ['Mã', 'Chức năng · Vai trò', 'Câu hỏi chính', 'Cách hỏi khác', 'Kết quả mong đợi', 'KQ'],
  FUNCTIONS.map((item) => [
    item.code,
    `${item.name}\n${item.roles}`,
    item.ask,
    item.askAlt,
    item.expect,
    ['CN-01', 'CN-07', 'CN-10', 'CN-13'].includes(item.code) ? SMOKE_PASS : '',
  ]),
  [8, 16, 19, 18, 31, 8],
  { fontSize: 14, line: 225, centerFirst: true },
));

children.push(h1('5. Ca thiếu tham số và ca biên', true));
children.push(h2('5.1. Thiếu hoặc sai tham số'));
children.push(table(
  ['Mã', 'Vai trò', 'Câu hỏi / thao tác', 'Kết quả mong đợi', 'KQ'],
  FUNCTIONS.map((item) => [
    `${item.code}-T`,
    item.roles,
    item.missAsk || 'Không có tham số bắt buộc',
    item.missExpect,
    item.code === 'CN-07' ? SMOKE_PASS : '',
  ]),
  [10, 14, 25, 43, 8],
  { fontSize: 15, line: 230, centerFirst: true },
));

children.push(h2('5.2. Dữ liệu rỗng, mã sai và ngoài phạm vi'));
children.push(table(
  ['Mã', 'Vai trò', 'Câu hỏi / thao tác', 'Kết quả mong đợi', 'KQ'],
  FUNCTIONS.map((item) => [
    `${item.code}-B`,
    item.roles,
    item.edgeAsk,
    item.edgeExpect,
    '',
  ]),
  [10, 14, 25, 43, 8],
  { fontSize: 15, line: 230, centerFirst: true },
));

children.push(h1('6. Ca biên trọng yếu bổ sung', true));
children.push(table(
  ['Mã', 'Vai trò', 'Chuẩn bị', 'Thao tác / câu hỏi', 'Kết quả mong đợi', 'KQ'],
  simpleCaseRows(EDGE_CASES),
  [9, 12, 18, 22, 31, 8],
  { fontSize: 14, line: 225, centerFirst: true },
));

children.push(h1('7. Luồng tạo và đối chiếu dữ liệu UAT', true));
children.push(note(
  'Điều kiện bắt buộc',
  'Chỉ chạy phần này sau khi điều phối viên xác nhận môi trường và cơ sở dữ liệu UAT đã tách khỏi production. Mọi dữ liệu tạo mới phải có tiền tố UAT_TEST. Không dùng thông tin khách hàng thật và không gửi đơn sang hệ thống khác.',
));

const flowGroups = [
  ['7.1. Tạo khách hàng UAT', CUSTOMER_FLOW],
  ['7.2. Tạo đơn hàng UAT', ORDER_FLOW],
  ['7.3. Giá và khuyến mãi', PROMO_CASES],
  ['7.4. Đối chiếu sau khi tạo', RECONCILE_CASES],
];
for (const [heading, cases] of flowGroups) {
  children.push(h2(heading));
  children.push(table(
    ['Mã', 'Vai trò', 'Chuẩn bị', 'Thao tác', 'Kết quả mong đợi', 'KQ'],
    simpleCaseRows(cases),
    [9, 12, 18, 22, 31, 8],
    { fontSize: 14, line: 225, centerFirst: true },
  ));
  children.push(spacer());
}

children.push(h1('8. Điều kiện hoàn tất và xác nhận', true));
const completionItems = uatDocument.appendix.completion.items
  .filter((item) => !item.includes('hình ảnh'))
  .concat('Tài liệu số 02 và số 05 dùng cùng bộ 24 chức năng và cùng kết quả mong đợi.');
completionItems.forEach((item) => children.push(checkbox(item)));
children.push(spacer());
children.push(table(
  ['Nội dung tổng hợp', 'Kết quả / Người xác nhận'],
  [
    ['Smoke kỹ thuật đã chạy', 'Sale 8/8 · Quản lý 8/8'],
    ['Số tài khoản khách hàng đã nghiệm thu', '........ / 13'],
    ['Số chức năng khách hàng đã nghiệm thu', '........ / 24'],
    ['Lỗi nghiêm trọng còn mở', ''],
    ['Danh sách mã UAT_TEST cần dọn', ''],
    ['Kết luận hiện tại', 'Đủ điều kiện bắt đầu UAT khách hàng · Chưa phải nghiệm thu hoàn tất'],
    ['Người thực hiện · Ngày', ''],
    ['Điều phối viên · Ngày', ''],
    ['Đại diện khách hàng · Ngày', ''],
  ],
  [38, 62],
  { fontSize: 18 },
));

const document = new Document({
  creator: 'Medstand AI',
  title: 'Kịch bản kiểm thử 13 tài khoản - UAT 05',
  subject: 'Kịch bản UAT khách hàng dạng copy-paste, đồng bộ 24 chức năng',
  description: 'Tài liệu số 05 trong gói UAT khách hàng Medstand AI.',
  numbering: {
    config: [{
      reference: 'uat05-numbering',
      levels: [{
        level: 0,
        format: 'decimal',
        text: '%1.',
        alignment: AlignmentType.LEFT,
        style: {
          paragraph: {
            indent: { left: 540, hanging: 280 },
            spacing: { after: 80, line: 280 },
          },
          run: { font: FONT, size: 20, bold: true, color: C.brand },
        },
      }],
    }],
  },
  styles: {
    default: {
      document: {
        run: { font: FONT, size: 20, color: C.body },
        paragraph: { spacing: { after: 120, line: 280 } },
      },
    },
  },
  sections: [{
    properties: {
      page: {
        size: { width: A4_W, height: A4_H, orientation: 'portrait' },
        margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      },
    },
    headers: {
      default: new Header({ children: [paragraph(
        'MEDSTAND AI  |  KỊCH BẢN UAT 13 TÀI KHOẢN  |  TÀI LIỆU 05',
        { size: 15, bold: true, color: C.muted, alignment: AlignmentType.RIGHT, after: 0 },
      )] }),
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: 'Không ghi mật khẩu  |  Trang ', font: FONT, size: 15, color: C.muted }),
          new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 15, color: C.muted }),
          new TextRun({ text: ' / ', font: FONT, size: 15, color: C.muted }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 15, color: C.muted }),
        ],
      })] }),
    },
    children,
  }],
});

Packer.toBuffer(document).then((buffer) => {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, buffer);
  console.log(`✓ DOCX: ${path.relative(root, output)} (${(buffer.length / 1024).toFixed(0)} KB)`);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
