'use strict';

const fs = require('fs');
const path = require('path');
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
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
  WidthType,
} = require('docx');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'docs', 'GOI_UAT_KHACH_HANG');
const docxOutput = path.join(outDir, '01_HUONG_DAN_SU_DUNG_MEDSTAND_AI.docx');
const htmlOutput = path.join(outDir, '01_HUONG_DAN_SU_DUNG_MEDSTAND_AI.html');

const images = {
  assistant: path.join(outDir, '01_MAN_HINH_TRO_LY_AI_SAU_DANG_NHAP.png'),
  revenue: path.join(outDir, '02_KET_QUA_DOANH_SO_DUNG.png'),
  workflow: path.join(outDir, 'assets', 'so_do_quy_trinh_5_buoc.png'),
  scope: path.join(outDir, 'assets', 'so_do_pham_vi_vai_tro.png'),
  errors: path.join(outDir, 'assets', 'so_do_cay_quyet_dinh_loi.png'),
};

// compact_reference_guide + customer_pack opening pattern.
const PAGE_WIDTH = 12240;
const PAGE_HEIGHT = 15840;
const CONTENT_WIDTH = 9360;
const TABLE_INDENT = 120;
const FONT = 'Calibri';
const colors = {
  navy: '17324D',
  blue: '2E74B5',
  blueDark: '1F4D78',
  green: '168A4A',
  greenLight: 'EAF6EF',
  blueLight: 'E8EEF5',
  amber: '8A6300',
  amberLight: 'FFF4D6',
  red: '9B1C1C',
  redLight: 'FDECEC',
  gray: '5B6573',
  lightGray: 'F4F6F9',
  border: 'CBD3DD',
  white: 'FFFFFF',
  black: '1B1F23',
};
const border = { style: BorderStyle.SINGLE, size: 1, color: colors.border };

function run(value, options = {}) {
  return new TextRun({
    text: String(value ?? ''),
    font: FONT,
    size: options.size || 22,
    color: options.color || colors.black,
    bold: Boolean(options.bold),
    italics: Boolean(options.italics),
  });
}

function para(value, options = {}) {
  return new Paragraph({
    children: Array.isArray(value) ? value : [run(value, options)],
    alignment: options.alignment || AlignmentType.LEFT,
    heading: options.heading,
    keepNext: Boolean(options.keepNext),
    pageBreakBefore: Boolean(options.pageBreakBefore),
    spacing: {
      before: options.before === undefined ? 0 : options.before,
      after: options.after === undefined ? 120 : options.after,
      line: options.line || 300,
    },
    indent: options.indent,
    numbering: options.numbering,
  });
}

function heading(value, level = 1) {
  const styles = {
    1: { heading: HeadingLevel.HEADING_1, size: 32, color: colors.blue, before: 360, after: 200 },
    2: { heading: HeadingLevel.HEADING_2, size: 26, color: colors.blue, before: 280, after: 140 },
    3: { heading: HeadingLevel.HEADING_3, size: 24, color: colors.blueDark, before: 200, after: 100 },
  };
  return para(value, { ...styles[level], bold: true, keepNext: true });
}

function bullet(value) {
  return para(value, { numbering: { reference: 'guide-bullets', level: 0 }, after: 80 });
}

function numbered(value) {
  return para(value, { numbering: { reference: 'guide-numbers', level: 0 }, after: 80 });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function cell(value, width, options = {}) {
  const children = Array.isArray(value)
    ? value
    : [para(value, { size: options.size || 18, bold: options.bold, color: options.color, after: 0, line: 260 })];
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: options.fill ? { type: ShadingType.CLEAR, fill: options.fill } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    borders: { top: border, bottom: border, left: border, right: border },
    verticalAlign: 'center',
    children,
  });
}

function table(headers, rows, widths, options = {}) {
  if (widths.reduce((sum, width) => sum + width, 0) !== CONTENT_WIDTH) {
    throw new Error(`Table widths must total ${CONTENT_WIDTH} DXA.`);
  }
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    indent: { size: TABLE_INDENT, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: widths,
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: headers.map((value, index) => cell(value, widths[index], {
          fill: options.headerFill || colors.blueLight,
          color: colors.navy,
          bold: true,
          size: options.headerSize || 17,
        })),
      }),
      ...rows.map((row, rowIndex) => new TableRow({
        cantSplit: true,
        children: row.map((value, index) => cell(value, widths[index], {
          fill: rowIndex % 2 ? colors.lightGray : colors.white,
          size: options.bodySize || 17,
        })),
      })),
    ],
  });
}

function callout(title, body, kind = 'info') {
  const palette = {
    info: { fill: colors.blueLight, accent: colors.blue },
    success: { fill: colors.greenLight, accent: colors.green },
    warning: { fill: colors.amberLight, accent: colors.amber },
    danger: { fill: colors.redLight, accent: colors.red },
  }[kind];
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    indent: { size: TABLE_INDENT, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [CONTENT_WIDTH],
    rows: [new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: [new TableCell({
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: palette.fill },
        margins: { top: 140, bottom: 140, left: 180, right: 180 },
        borders: {
          top: { ...border, color: palette.accent },
          bottom: { ...border, color: palette.accent },
          left: { style: BorderStyle.SINGLE, size: 14, color: palette.accent },
          right: { ...border, color: palette.accent },
        },
        children: [
          para(title, { bold: true, color: palette.accent, after: 50, line: 260 }),
          para(body, { after: 0, line: 280 }),
        ],
      })],
    })],
  });
}

function copyBox(label, value) {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    indent: { size: TABLE_INDENT, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [1900, 7460],
    rows: [new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: [
        cell(label, 1900, { fill: colors.greenLight, bold: true, color: colors.green, size: 18 }),
        cell([para(value, { size: 20, bold: true, after: 0, line: 260 })], 7460, { fill: colors.white }),
      ],
    })],
  });
}

function figure(filePath, width, height, caption, altText) {
  return [];
}

const functionRows = [
  ['Doanh số', 'Doanh số hôm nay / theo khoảng ngày', '“Doanh số của tôi từ 01/07/2026 đến 27/07/2026”'],
  ['Bán hàng', 'Hóa đơn, chi tiết hóa đơn, đơn hàng', '“Xem hóa đơn tháng này”'],
  ['Khách hàng', 'Chấm điểm, công nợ tổng/chi tiết, tích lũy', '“Khách NDB001 đang còn nợ bao nhiêu?”'],
  ['Tuyến', 'Khách cần ghé, khách lâu chưa mua', '“Hôm nay tôi nên ghé khách nào?”'],
  ['Gợi ý', 'Đơn hàng, bán kèm, sản phẩm liên quan', '“Gợi ý bán kèm cho khách NDB001”'],
  ['Kho & sản phẩm', 'Tồn kho, tra cứu sản phẩm, danh mục', '“Tồn kho sản phẩm A003”'],
  ['Chương trình', 'Sản phẩm trọng tâm, đề xuất khuyến mãi', '“Sản phẩm trọng tâm tháng này là gì?”'],
  ['Khảo sát', '360, câu hỏi, trạng thái, lịch sử', '“Kiểm tra trạng thái khảo sát NDB001”'],
  ['Khác', 'Thông báo, tìm sản phẩm theo triệu chứng', '“Tìm sản phẩm theo triệu chứng ho”'],
];

function buildBody() {
  const body = [];
  body.push(para('HƯỚNG DẪN SỬ DỤNG', { size: 24, bold: true, color: colors.green, after: 100 }));
  body.push(para('MEDSTAND AI', { size: 54, bold: true, color: colors.navy, after: 120 }));
  body.push(para('Bản chi tiết dành cho Nhân viên kinh doanh và Quản lý', { size: 28, color: colors.gray, after: 260 }));
  body.push(table(
    ['Thông tin', 'Nội dung'],
    [
      ['Môi trường thử nghiệm', 'https://medtest.bms7.net/#/chatbot'],
      ['Phiên bản tài liệu', '01/08/2026 — frontend 11.121'],
      ['Mục tiêu', 'Đăng nhập, đặt câu hỏi, đọc kết quả và tự xử lý tình huống thường gặp'],
      ['Tài liệu liên quan', 'Bộ hướng dẫn kiểm thử 13 tài khoản được giữ riêng trong cùng thư mục'],
    ],
    [2600, 6760],
    { bodySize: 19 },
  ));
  body.push(para('', { after: 220 }));
  body.push(callout('Bắt đầu nhanh', 'Nếu đây là lần đầu sử dụng, chỉ cần đọc mục 1 đến mục 4. Bạn có thể bắt đầu hỏi Trợ lý AI trong khoảng 5 phút.', 'success'));
  body.push(pageBreak());

  body.push(heading('1. Bắt đầu trong 5 phút'));
  body.push(...figure(images.workflow, 620, 138, 'Hình 1 — Quy trình sử dụng nhanh gồm 5 bước.', 'Sơ đồ năm bước: đăng nhập, chọn chức năng, nhập thông tin, đọc kết quả và phản hồi.'));
  body.push(numbered('Mở https://medtest.bms7.net/ bằng Chrome hoặc Microsoft Edge.'));
  body.push(numbered('Đăng nhập bằng tài khoản được cấp và kiểm tra đúng tên, vai trò ở góc trái dưới.'));
  body.push(numbered('Chọn “Trợ lý AI” trong menu bên trái.'));
  body.push(numbered('Nhập câu hỏi rõ đối tượng, mã khách hàng/sản phẩm và khoảng ngày nếu cần.'));
  body.push(numbered('Đọc kết quả; nếu sai, giữ nguyên màn hình và chụp ảnh để báo lại.'));
  body.push(copyBox('Câu đầu tiên', 'Xin chào'));
  body.push(para('', { after: 60 }));
  body.push(copyBox('Kiểm tra tài khoản', 'Tôi là ai?'));
  body.push(para('', { after: 60 }));
  body.push(copyBox('Câu nghiệp vụ', 'Doanh số hôm nay của tôi là bao nhiêu?'));

  body.push(heading('2. Nhận biết màn hình Trợ lý AI'));
  body.push(...figure(images.assistant, 620, 325, 'Hình 2 — Màn hình Trợ lý AI sau khi đăng nhập.', 'Ảnh giao diện Medstand: menu trái, các nút chức năng nhanh và ô nhập câu hỏi ở cuối màn hình.'));
  body.push(table(
    ['Vị trí', 'Công dụng', 'Thao tác'],
    [
      ['Menu trái', 'Mở Trang chủ, Tuyến, Đơn hàng, Báo cáo, Khách hàng và Trợ lý AI', 'Nhấn một lần vào tên mục'],
      ['Bốn nút giữa màn hình', 'Mở nhanh doanh số, tồn kho, sản phẩm trọng tâm hoặc đơn hàng', 'Chọn nút phù hợp'],
      ['Biểu tượng bốn ô vuông', 'Mở danh sách chức năng nghiệp vụ', 'Nhấn rồi chọn chức năng'],
      ['Ô “Nhập tin nhắn…”', 'Nhập câu hỏi tự nhiên', 'Gõ câu hỏi và kiểm tra lại mã'],
      ['Nút gửi', 'Gửi câu hỏi', 'Chỉ nhấn một lần và chờ kết quả'],
      ['Biểu tượng thùng rác', 'Xóa nội dung hội thoại trên màn hình', 'Không xóa dữ liệu ERP'],
    ],
    [1900, 3900, 3560],
    { bodySize: 17 },
  ));
  body.push(callout('Nếu giao diện chưa giống hình', 'Nhấn Ctrl + F5, đăng xuất rồi đăng nhập lại. Nếu vẫn khác, chụp toàn màn hình và gửi cho đầu mối hỗ trợ.', 'info'));

  body.push(heading('3. Cách đặt câu hỏi để nhận kết quả đúng'));
  body.push(heading('3.1. Công thức câu hỏi dễ hiểu', 2));
  body.push(para([run('Hành động cần làm', { bold: true }), run(' + '), run('đối tượng', { bold: true }), run(' + '), run('mã hoặc tên', { bold: true }), run(' + '), run('thời gian', { bold: true }), run(' (nếu cần).')]));
  body.push(table(
    ['Nhu cầu', 'Câu nên dùng', 'Câu nên tránh'],
    [
      ['Doanh số', 'Doanh số của tôi từ 01/07/2026 đến 27/07/2026', 'Doanh số sao rồi?'],
      ['Công nợ', 'Chi tiết công nợ khách NDB001 đến ngày 27/07/2026', 'Xem nợ'],
      ['Tồn kho', 'Tồn kho sản phẩm A003', 'Còn hàng không?'],
      ['Bán kèm', 'Gợi ý bán kèm cho khách NDB001', 'Bán gì?'],
      ['Hóa đơn', 'Xem chi tiết hóa đơn U13S1_MB13_4', 'Chi tiết hóa đơn'],
    ],
    [1800, 4600, 2960],
    { bodySize: 17 },
  ));
  body.push(heading('3.2. Khi hệ thống hỏi thêm thông tin', 2));
  body.push(bullet('Nếu thiếu khách hàng: trả lời bằng mã khách, ví dụ NDB001.'));
  body.push(bullet('Nếu thiếu sản phẩm: nhập mã hoặc tên sản phẩm, ví dụ A003.'));
  body.push(bullet('Nếu thiếu thời gian: ghi đủ từ ngày và đến ngày theo dạng ngày/tháng/năm.'));
  body.push(bullet('Nếu không chắc mã: dùng Tra cứu sản phẩm hoặc danh sách khách trước.'));
  body.push(callout('Không gửi liên tục', 'Kết quả kiểm tra gần nhất cho thấy đa số câu trả lời dưới 1 giây. Nếu quá 15 giây, ghi nhận là phản hồi chậm; không nhấn nút gửi nhiều lần.', 'warning'));

  body.push(heading('4. Phạm vi dữ liệu theo vai trò'));
  body.push(...figure(images.scope, 620, 160, 'Hình 3 — Tài khoản chỉ xem dữ liệu thuộc phạm vi được cấp.', 'Sơ đồ phân quyền giữa nhân viên kinh doanh, quản lý và dữ liệu được phép xem.'));
  body.push(table(
    ['Vai trò', 'Thường được xem', 'Không được làm'],
    [
      ['Nhân viên kinh doanh', 'Khách, tuyến, kho, doanh số và công nợ được giao', 'Xem dữ liệu người/khu vực khác; tự duyệt khuyến mãi'],
      ['Quản lý', 'Nhân viên và khu vực thuộc phạm vi phụ trách', 'Xem ngoài miền/đội được giao; coi đề xuất là quyết định đã duyệt'],
      ['Quản trị viên', 'Phạm vi quản trị được doanh nghiệp phê duyệt', 'Dùng quyền rộng để thay kết luận kiểm thử của Sale/Quản lý'],
    ],
    [2100, 3900, 3360],
    { bodySize: 17 },
  ));
  body.push(callout('Lỗi nghiêm trọng', 'Nếu thấy dữ liệu khách hàng, hóa đơn, công nợ, kho hoặc nhân viên ngoài phạm vi, dừng thao tác và báo ngay. Không tiếp tục mở chi tiết.', 'danger'));

  body.push(heading('5. Các nhóm chức năng thường dùng'));
  body.push(table(['Nhóm', 'Bạn có thể làm gì', 'Câu hỏi mẫu'], functionRows, [1500, 3500, 4360], { bodySize: 16 }));
  body.push(heading('5.1. Quy trình hằng ngày cho Nhân viên kinh doanh', 2));
  body.push(numbered('Đầu ngày: hỏi “Hôm nay tôi nên làm gì?” và “Hôm nay tôi nên ghé khách nào?”.'));
  body.push(numbered('Trước khi gặp khách: kiểm tra công nợ, gợi ý đơn hàng, bán kèm và tồn kho.'));
  body.push(numbered('Cuối ngày: xem doanh số trong ngày và khách lâu chưa mua.'));
  body.push(heading('5.2. Quy trình hằng ngày cho Quản lý', 2));
  body.push(numbered('Xem doanh số đội và các nhân viên thuộc quyền.'));
  body.push(numbered('Xem khách Nhóm A/B/C, khách có nguy cơ giảm mua và công nợ cần theo dõi.'));
  body.push(numbered('Xem sản phẩm trọng tâm và danh sách cần xem xét khuyến mãi.'));

  body.push(heading('6. Cách đọc một kết quả'));
  body.push(...figure(images.revenue, 620, 440, 'Hình 4 — Ví dụ kết quả doanh số đúng: có khoảng thời gian, số tổng quan, nhóm phân tích và bảng chi tiết.', 'Ảnh kết quả doanh số đội với khoảng ngày, tổng doanh số, số đơn, đơn trung bình và bảng nhân viên.'));
  body.push(table(
    ['Thành phần', 'Cách kiểm tra'],
    [
      ['Tiêu đề và vai trò', 'Đúng loại báo cáo và đúng vai trò đang đăng nhập'],
      ['Khoảng thời gian', 'Ngày đầu/ngày cuối đúng câu hỏi; không tự tính thêm ngày kế tiếp'],
      ['Thẻ tổng quan', 'Tổng doanh số, số đơn và đơn trung bình có nhãn, đơn vị rõ'],
      ['Nhóm phân tích', 'Chọn Nhân viên/Khách hàng/Sản phẩm phải đổi đúng dữ liệu bên dưới'],
      ['Ô tìm nhanh', 'Lọc trong danh sách đang hiển thị'],
      ['Bảng chi tiết', 'Mã, tên, số tiền và tỷ trọng không bị lộn cột'],
    ],
    [2500, 6860],
    { bodySize: 18 },
  ));
  body.push(callout('Ý nghĩa “Dữ liệu thực tế”', 'Kết quả lấy từ dữ liệu hiện có trên môi trường thử nghiệm tại thời điểm truy vấn. Đây không phải chứng từ tài chính chính thức.', 'info'));

  body.push(heading('7. Hiểu đúng dữ liệu nghiệp vụ'));
  body.push(table(
    ['Nội dung', 'Cách hiểu đúng', 'Không nên hiểu là'],
    [
      ['Doanh số', 'Theo khoảng ngày và phạm vi tài khoản', 'Tiền đã thu đủ nếu chưa đối soát'],
      ['Công nợ', 'Phát sinh tăng trừ phát sinh giảm đến ngày chốt', 'Tất cả đều quá hạn khi thiếu ngày đến hạn'],
      ['Tồn kho', 'Số hệ thống ghi nhận tại kho được phép xem', 'Cam kết chắc chắn có thể bán nếu chưa trừ giữ chỗ/hàng khóa'],
      ['Nhóm A/B/C', 'Phân khúc giá trị khách hàng', 'Mức rủi ro'],
      ['Rủi ro', 'Dấu hiệu lâu chưa mua hoặc giảm mua', 'Xếp hạng giá trị'],
      ['Gợi ý đơn/bán kèm', 'Danh sách tham khảo từ dữ liệu hiện có', 'Cam kết khách sẽ mua'],
      ['Đề xuất khuyến mãi', 'Danh sách cần người có thẩm quyền xem xét', 'Chương trình đã được áp dụng'],
      ['Theo triệu chứng', 'Thông tin sản phẩm tham khảo', 'Chẩn đoán hoặc thay tư vấn chuyên môn'],
    ],
    [1750, 4350, 3260],
    { bodySize: 16 },
  ));

  body.push(heading('8. Các trạng thái thường gặp'));
  body.push(table(
    ['Thông báo/trạng thái', 'Ý nghĩa', 'Bạn nên làm'],
    [
      ['Cần thêm thông tin', 'Câu hỏi thiếu mã hoặc thời gian', 'Bổ sung đúng trường được hỏi'],
      ['Không tìm thấy dữ liệu', 'Mã/ngày không có dữ liệu hoặc ngoài phạm vi', 'Kiểm tra mã, ngày và tài khoản'],
      ['Không có quyền', 'Đối tượng không thuộc phạm vi', 'Không thử truy cập tiếp; dùng đối tượng được cấp'],
      ['Hệ thống xử lý chậm', 'Mạng hoặc dịch vụ tạm thời chậm', 'Chờ vài giây, thử lại một lần'],
      ['Phiên đăng nhập hết hạn', 'Token đăng nhập không còn hiệu lực', 'Đăng xuất và đăng nhập lại'],
      ['Lỗi hệ thống', 'Yêu cầu chưa xử lý được', 'Chụp ảnh, ghi thời gian và câu hỏi'],
    ],
    [2350, 3400, 3610],
    { bodySize: 17 },
  ));

  body.push(heading('9. Tự xử lý lỗi theo sơ đồ'));
  body.push(...figure(images.errors, 620, 227, 'Hình 5 — Sơ đồ quyết định khi kết quả không như mong đợi.', 'Cây quyết định: kiểm tra đăng nhập, tham số, phạm vi và gửi bằng chứng nếu lỗi còn lặp lại.'));
  body.push(numbered('Kiểm tra đúng tài khoản và vai trò.'));
  body.push(numbered('Kiểm tra mã khách hàng/sản phẩm/hóa đơn và khoảng ngày.'));
  body.push(numbered('Đăng xuất, đăng nhập lại và nhấn Ctrl + F5 nếu giao diện cũ.'));
  body.push(numbered('Thử lại đúng một lần. Nếu còn lỗi, chụp toàn bộ câu hỏi và kết quả.'));
  body.push(callout('Thông tin cần gửi', 'Tài khoản, vai trò, thời gian, câu hỏi nguyên văn, mã liên quan, kết quả thực tế, kết quả mong đợi và ảnh toàn màn hình. Không gửi mật khẩu hoặc token.', 'warning'));

  body.push(heading('10. Danh sách 24 chức năng hội thoại'));
  body.push(table(
    ['STT', 'Chức năng', 'Thông tin chính cần nhập'],
    [
      ['1', 'Doanh số', 'Khoảng ngày/bộ lọc'], ['2', 'Danh sách hóa đơn', 'Khoảng ngày'],
      ['3', 'Chi tiết hóa đơn', 'Mã hóa đơn thật'], ['4', 'Danh sách đơn hàng', 'Ngày/khách/trạng thái'],
      ['5', 'Chấm điểm khách hàng', 'Có thể để trống hoặc chọn nhóm'], ['6', 'Công nợ khách hàng', 'Đến ngày/khách'],
      ['7', 'Chi tiết công nợ', 'Mã khách hàng'], ['8', 'Tích lũy', 'Mã khách/khoảng ngày'],
      ['9', 'Tuyến bán hàng', 'Ngày cần xem'], ['10', 'Gợi ý đơn hàng', 'Mã khách hàng'],
      ['11', 'Gợi ý bán kèm', 'Mã khách hàng'], ['12', 'Gợi ý sản phẩm liên quan', 'Sản phẩm gốc'],
      ['13', 'Danh sách tồn kho', 'Mã/tên sản phẩm'], ['14', 'Tra cứu sản phẩm', 'Mã/tên sản phẩm'],
      ['15', 'Sản phẩm trọng tâm', 'Có thể chọn khách'], ['16', 'Đề xuất khuyến mãi', 'Quản lý/Admin'],
      ['17', 'Danh mục', 'Loại danh mục'], ['18', 'Khảo sát 360', 'Mã khách hàng'],
      ['19', 'Câu hỏi khảo sát', 'Loại khảo sát'], ['20', 'Kiểm tra khảo sát', 'Mã khách hàng'],
      ['21', 'Khảo sát theo ngày', 'Ngày'], ['22', 'Lịch sử khảo sát', 'Mã khách hàng'],
      ['23', 'Thông báo', 'Bộ lọc nếu cần'], ['24', 'Tìm theo triệu chứng', 'Từ khóa triệu chứng'],
    ],
    [700, 3900, 4760],
    { bodySize: 16 },
  ));

  body.push(heading('11. Quy tắc an toàn trong môi trường thử nghiệm'));
  body.push(bullet('Chỉ dùng dữ liệu UAT được cấp; không đưa mật khẩu vào ảnh hoặc phiếu phản hồi.'));
  body.push(bullet('Không tự áp giá, phát hành khuyến mãi hoặc dùng kết quả AI làm quyết định cuối cùng.'));
  body.push(bullet('Nếu thử chức năng tạo khách/đơn trong UAT, dùng tiền tố UAT_TEST và kiểm tra màn hình xác nhận trước khi gửi.'));
  body.push(bullet('Không thực hiện thao tác ghi dữ liệu trên môi trường khác nếu chưa được phê duyệt.'));
  body.push(bullet('Nội dung liên quan sản phẩm/thuốc chỉ mang tính tham khảo và phải được người có chuyên môn kiểm tra.'));
  body.push(callout('Trạng thái UAT 01/08/2026', 'Bộ live đạt 31/31 và scope đạt 13/13 tài khoản. Hệ thống vẫn là UAT có kiểm soát, chưa phải production; quản trị viên còn phải dọn workflow n8n active trùng và chốt endpoint/secret.', 'warning'));

  body.push(heading('12. Checklist trước khi kết thúc'));
  [
    'Tôi đăng nhập đúng tài khoản và vai trò.',
    'Tôi biết mở Trợ lý AI và gửi câu hỏi.',
    'Tôi biết nhập mã khách hàng, sản phẩm và khoảng ngày.',
    'Tôi biết đọc tiêu đề, thời gian, thẻ tổng quan và bảng chi tiết.',
    'Tôi không thấy dữ liệu ngoài phạm vi được cấp.',
    'Tôi biết cách chụp và báo lỗi mà không lộ mật khẩu.',
    'Tôi hiểu gợi ý của AI chỉ là thông tin tham khảo.',
  ].forEach((item) => body.push(para([run('☐ ', { size: 23, color: colors.green, bold: true }), run(item)], { after: 90 })));
  body.push(callout('Tài liệu kiểm thử 13 tài khoản', 'Bản Word và HTML hướng dẫn kiểm thử 13 tài khoản vẫn được giữ riêng trong thư mục GOI_UAT_KHACH_HANG. Sử dụng bản đó khi cần kiểm thử theo từng tài khoản mẫu.', 'info'));
  return body;
}

function htmlEscape(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function htmlTable(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${htmlEscape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((v) => `<td>${htmlEscape(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function buildHtml() {
  const image = () => '';
  const copy = (label, text) => `<div class="copy"><span>${htmlEscape(label)}</span><code>${htmlEscape(text)}</code></div>`;
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hướng dẫn sử dụng Medstand AI</title>
<style>
:root{--navy:#17324d;--blue:#2e74b5;--green:#168a4a;--ink:#1b1f23;--muted:#5b6573;--line:#cbd3dd;--soft:#f4f6f9;--blue-soft:#e8eef5;--green-soft:#eaf6ef;--amber:#8a6300;--amber-soft:#fff4d6;--red:#9b1c1c;--red-soft:#fdecec}*{box-sizing:border-box}body{margin:0;background:#eef2f6;color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Arial,sans-serif}.page{max-width:1000px;margin:28px auto;background:white;padding:56px 64px;box-shadow:0 8px 30px #17324d1a;border-radius:14px}.kicker{color:var(--green);font-weight:800;letter-spacing:.08em}.hero h1{font-size:44px;line-height:1.1;color:var(--navy);margin:.2em 0}.subtitle{font-size:20px;color:var(--muted)}h2{color:var(--blue);font-size:28px;margin-top:2.1em;border-bottom:2px solid var(--blue-soft);padding-bottom:8px}h3{color:var(--navy);font-size:21px;margin-top:1.5em}.toc{columns:2;padding:20px 28px;background:var(--soft);border-radius:12px}.toc a{color:var(--navy);text-decoration:none}.toc li{margin:5px 0}.callout{padding:16px 20px;border:1px solid var(--line);border-left:6px solid var(--blue);background:var(--blue-soft);border-radius:8px;margin:18px 0}.callout.success{border-left-color:var(--green);background:var(--green-soft)}.callout.warn{border-left-color:var(--amber);background:var(--amber-soft)}.callout.danger{border-left-color:var(--red);background:var(--red-soft)}figure{margin:24px 0;text-align:center}figure img{max-width:100%;height:auto;border:1px solid var(--line);border-radius:10px}figcaption{font-size:14px;color:var(--muted);font-style:italic;margin-top:7px}.table-wrap{overflow-x:auto;margin:18px 0}table{width:100%;border-collapse:collapse;font-size:14px}th,td{border:1px solid var(--line);padding:10px 12px;text-align:left;vertical-align:top}th{background:var(--blue-soft);color:var(--navy)}tbody tr:nth-child(even){background:var(--soft)}.copy{display:grid;grid-template-columns:180px 1fr;border:1px solid var(--line);border-radius:8px;overflow:hidden;margin:10px 0}.copy span{background:var(--green-soft);color:var(--green);font-weight:700;padding:12px}.copy code{padding:12px;background:white;white-space:normal;font:600 15px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace}footer{margin-top:48px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:14px}@media(max-width:700px){.page{margin:0;padding:28px 20px;border-radius:0}.hero h1{font-size:34px}.toc{columns:1}.copy{grid-template-columns:1fr}.copy span{padding:8px 12px}}
</style></head><body><main class="page">
<header class="hero"><div class="kicker">HƯỚNG DẪN SỬ DỤNG</div><h1>MEDSTAND AI</h1><p class="subtitle">Bản chi tiết dành cho Nhân viên kinh doanh và Quản lý</p><p><b>Môi trường:</b> <a href="https://medtest.bms7.net/#/chatbot">medtest.bms7.net/#/chatbot</a> · <b>Cập nhật:</b> 01/08/2026 · <b>Frontend:</b> 11.121</p></header>
<div class="callout success"><b>Bắt đầu nhanh:</b> nếu đây là lần đầu sử dụng, chỉ cần đọc mục 1 đến mục 4. Bạn có thể bắt đầu hỏi Trợ lý AI trong khoảng 5 phút.</div>
<nav><h2>Mục lục</h2><ol class="toc">${['Bắt đầu trong 5 phút','Nhận biết màn hình','Cách đặt câu hỏi','Phạm vi theo vai trò','Nhóm chức năng','Cách đọc kết quả','Hiểu dữ liệu','Trạng thái thường gặp','Tự xử lý lỗi','24 chức năng','Quy tắc an toàn','Checklist'].map((x,i)=>`<li><a href="#m${i+1}">${x}</a></li>`).join('')}</ol></nav>
<section id="m1"><h2>1. Bắt đầu trong 5 phút</h2>${image('assets/so_do_quy_trinh_5_buoc.png','Hình 1 — Quy trình sử dụng nhanh gồm 5 bước.')}<ol><li>Mở medtest bằng Chrome hoặc Microsoft Edge.</li><li>Đăng nhập và kiểm tra đúng tên, vai trò.</li><li>Chọn <b>Trợ lý AI</b> trong menu trái.</li><li>Nhập câu hỏi rõ mã và thời gian.</li><li>Đọc kết quả; chụp ảnh nếu phát hiện sai.</li></ol>${copy('Câu đầu tiên','Xin chào')}${copy('Kiểm tra tài khoản','Tôi là ai?')}${copy('Câu nghiệp vụ','Doanh số hôm nay của tôi là bao nhiêu?')}</section>
<section id="m2"><h2>2. Nhận biết màn hình Trợ lý AI</h2>${image('01_MAN_HINH_TRO_LY_AI_SAU_DANG_NHAP.png','Hình 2 — Màn hình Trợ lý AI sau khi đăng nhập.')}${htmlTable(['Vị trí','Công dụng'],[['Menu trái','Mở các phân hệ và Trợ lý AI'],['Bốn nút giữa','Mở nhanh chức năng phổ biến'],['Biểu tượng bốn ô','Mở danh sách chức năng'],['Ô nhập tin nhắn','Nhập câu hỏi tự nhiên'],['Nút gửi','Gửi một lần rồi chờ kết quả'],['Thùng rác','Xóa hội thoại trên màn hình, không xóa ERP']])}</section>
<section id="m3"><h2>3. Cách đặt câu hỏi</h2><p><b>Công thức:</b> Hành động + đối tượng + mã/tên + thời gian (nếu cần).</p>${htmlTable(['Nhu cầu','Câu nên dùng'],[['Doanh số','Doanh số của tôi từ 01/07/2026 đến 27/07/2026'],['Công nợ','Chi tiết công nợ khách NDB001 đến ngày 27/07/2026'],['Tồn kho','Tồn kho sản phẩm A003'],['Bán kèm','Gợi ý bán kèm cho khách NDB001'],['Hóa đơn','Xem chi tiết hóa đơn U13S1_MB13_4']])}<div class="callout warn">Kết quả kiểm tra gần nhất cho thấy đa số câu trả lời dưới 1 giây. Nếu quá 15 giây, ghi nhận phản hồi chậm; không nhấn gửi nhiều lần.</div></section>
<section id="m4"><h2>4. Phạm vi dữ liệu theo vai trò</h2>${image('assets/so_do_pham_vi_vai_tro.png','Hình 3 — Tài khoản chỉ xem dữ liệu thuộc phạm vi được cấp.')}${htmlTable(['Vai trò','Thường được xem','Không được làm'],[['Nhân viên kinh doanh','Khách, tuyến, kho và số liệu được giao','Xem dữ liệu khu vực khác; tự duyệt khuyến mãi'],['Quản lý','Nhân viên và khu vực phụ trách','Xem ngoài miền/đội được giao'],['Quản trị viên','Phạm vi quản trị được phê duyệt','Dùng quyền rộng thay kết luận của người dùng']])}<div class="callout danger"><b>Dừng ngay:</b> nếu thấy dữ liệu ngoài phạm vi, không mở chi tiết và báo lỗi nghiêm trọng.</div></section>
<section id="m5"><h2>5. Các nhóm chức năng</h2>${htmlTable(['Nhóm','Bạn có thể làm gì','Câu hỏi mẫu'],functionRows)}</section>
<section id="m6"><h2>6. Cách đọc một kết quả</h2>${image('02_KET_QUA_DOANH_SO_DUNG.png','Hình 4 — Ví dụ kết quả doanh số đúng.')}${htmlTable(['Thành phần','Cách kiểm tra'],[['Tiêu đề/vai trò','Đúng báo cáo và tài khoản'],['Khoảng thời gian','Không tự cộng thêm ngày kế tiếp'],['Thẻ tổng quan','Đủ nhãn, số và đơn vị'],['Nhóm phân tích','Đổi nhóm phải đổi dữ liệu bên dưới'],['Bảng chi tiết','Mã, tên và số liệu không lộn cột']])}</section>
<section id="m7"><h2>7. Hiểu đúng dữ liệu nghiệp vụ</h2>${htmlTable(['Nội dung','Cách hiểu đúng','Không nên hiểu là'],[['Doanh số','Theo ngày và phạm vi tài khoản','Tiền đã thu đủ'],['Công nợ','Tăng trừ giảm đến ngày chốt','Tất cả đều quá hạn'],['Tồn kho','Số hệ thống ghi nhận','Chắc chắn có thể bán'],['Nhóm A/B/C','Phân khúc giá trị','Mức rủi ro'],['Gợi ý bán hàng','Thông tin tham khảo','Cam kết khách sẽ mua'],['Đề xuất khuyến mãi','Chờ người có quyền xem xét','Chương trình đã áp dụng']])}</section>
<section id="m8"><h2>8. Trạng thái thường gặp</h2>${htmlTable(['Trạng thái','Bạn nên làm'],[['Cần thêm thông tin','Bổ sung mã hoặc thời gian'],['Không tìm thấy dữ liệu','Kiểm tra mã, ngày và phạm vi'],['Không có quyền','Dừng truy cập đối tượng đó'],['Xử lý chậm','Chờ và thử lại một lần'],['Hết phiên','Đăng nhập lại'],['Lỗi hệ thống','Chụp ảnh và ghi thời gian']])}</section>
<section id="m9"><h2>9. Tự xử lý lỗi</h2>${image('assets/so_do_cay_quyet_dinh_loi.png','Hình 5 — Sơ đồ quyết định khi kết quả không như mong đợi.')}<ol><li>Kiểm tra tài khoản/vai trò.</li><li>Kiểm tra mã và khoảng ngày.</li><li>Đăng nhập lại, Ctrl + F5.</li><li>Thử lại một lần; còn lỗi thì chụp ảnh.</li></ol><div class="callout warn"><b>Gửi:</b> tài khoản, vai trò, thời gian, câu hỏi, mã liên quan, thực tế, mong đợi và ảnh. Không gửi mật khẩu/token.</div></section>
<section id="m10"><h2>10. Danh sách 24 chức năng</h2>${htmlTable(['Nhóm','Chức năng'],[['Bán hàng','Doanh số; hóa đơn; chi tiết hóa đơn; đơn hàng'],['Khách hàng','Chấm điểm; công nợ tổng/chi tiết; tích lũy'],['Tuyến & gợi ý','Tuyến; gợi ý đơn; bán kèm; sản phẩm liên quan'],['Kho & sản phẩm','Tồn kho; tra cứu; sản phẩm trọng tâm; danh mục'],['Khuyến mãi','Đề xuất khuyến mãi'],['Khảo sát','360; câu hỏi; trạng thái; theo ngày; lịch sử'],['Khác','Thông báo; tìm theo triệu chứng']])}</section>
<section id="m11"><h2>11. Quy tắc an toàn</h2><ul><li>Chỉ dùng dữ liệu UAT được cấp.</li><li>Không đưa mật khẩu/token vào ảnh.</li><li>Không tự áp giá hoặc phát hành khuyến mãi.</li><li>Nếu thử tạo khách/đơn trong UAT, dùng tiền tố UAT_TEST và đọc màn hình xác nhận.</li><li>Nội dung sản phẩm/thuốc phải được người có chuyên môn kiểm tra.</li></ul><div class="callout warn"><b>Trạng thái 01/08/2026:</b> live đạt 31/31 và scope đạt 13/13. Đây vẫn là UAT có kiểm soát, chưa phải production; còn phải dọn workflow n8n active trùng và chốt endpoint/secret.</div></section>
<section id="m12"><h2>12. Checklist</h2><ul><li>☐ Đúng tài khoản và vai trò.</li><li>☐ Biết mở Trợ lý AI và đặt câu hỏi.</li><li>☐ Biết nhập mã/ngày.</li><li>☐ Biết đọc bảng kết quả.</li><li>☐ Không thấy dữ liệu ngoài phạm vi.</li><li>☐ Biết báo lỗi an toàn.</li></ul><div class="callout"><b>Tài liệu 13 tài khoản:</b> bản Word và HTML vẫn được giữ riêng trong cùng thư mục.</div></section>
<footer>Medstand AI · Hướng dẫn sử dụng khách hàng · Phiên bản 01/08/2026</footer>
</main></body></html>`;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const document = new Document({
    creator: 'Medstand AI',
    title: 'Hướng dẫn sử dụng Medstand AI',
    subject: 'Hướng dẫn chi tiết cho khách hàng',
    description: 'Hướng dẫn đăng nhập, đặt câu hỏi, đọc kết quả và xử lý lỗi',
    numbering: {
      config: [
        { reference: 'guide-bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 }, spacing: { after: 80, line: 300 } } } }] },
        { reference: 'guide-numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 }, spacing: { after: 80, line: 300 } } } }] },
      ],
    },
    styles: {
      default: { document: { run: { font: FONT, size: 22, color: colors.black }, paragraph: { spacing: { before: 0, after: 120, line: 300 } } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 32, bold: true, color: colors.blue }, paragraph: { spacing: { before: 360, after: 200, line: 300 }, keepNext: true } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 26, bold: true, color: colors.blue }, paragraph: { spacing: { before: 280, after: 140, line: 300 }, keepNext: true } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 24, bold: true, color: colors.blueDark }, paragraph: { spacing: { before: 200, after: 100, line: 300 }, keepNext: true } },
      ],
    },
    sections: [{
      properties: { page: { size: { width: PAGE_WIDTH, height: PAGE_HEIGHT }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 708, footer: 708 } } },
      headers: { default: new Header({ children: [para([run('MEDSTAND AI', { size: 17, bold: true, color: colors.green }), run('  |  Hướng dẫn sử dụng', { size: 17, color: colors.gray })], { alignment: AlignmentType.RIGHT, after: 0, line: 240 })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 0, line: 240 }, children: [run('medtest.bms7.net  |  Trang ', { size: 16, color: colors.gray }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: colors.gray })] })] }) },
      children: buildBody(),
    }],
  });

  const buffer = await Packer.toBuffer(document);
  fs.writeFileSync(docxOutput, buffer);
  fs.writeFileSync(htmlOutput, buildHtml(), 'utf8');
  console.log(JSON.stringify({ docxOutput, docxBytes: buffer.length, htmlOutput, htmlBytes: fs.statSync(htmlOutput).size }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
