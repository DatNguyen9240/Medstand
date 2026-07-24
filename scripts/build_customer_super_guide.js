const fs = require('fs');
const path = require('path');
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
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
const output = path.join(
  root,
  'docs',
  'GOI_UAT_KHACH_HANG',
  '01_HUONG_DAN_TEST_MEDSTAND_AI.docx',
);

// compact_reference_guide preset, with no unnamed layout overrides.
const PAGE_WIDTH = 12240;
const PAGE_HEIGHT = 15840;
const CONTENT_WIDTH = 9360;
const TABLE_INDENT = 120;
const FONT = 'Calibri';
const colors = {
  navy: '000000',
  blue: '000000',
  blueDark: '000000',
  lightBlue: 'F2F2F2',
  lightBlue2: 'E7E7E7',
  green: '000000',
  greenLight: 'F2F2F2',
  amber: '000000',
  amberLight: 'F2F2F2',
  red: '000000',
  redLight: 'F2F2F2',
  gray: '000000',
  lightGray: 'F2F2F2',
  border: '808080',
  white: 'FFFFFF',
  black: '000000',
};
const border = { style: BorderStyle.SINGLE, size: 1, color: colors.border };

function text(value, options = {}) {
  return new TextRun({
    text: String(value ?? ''),
    font: options.font || FONT,
    size: options.size || 22,
    color: options.color || colors.black,
    bold: Boolean(options.bold),
    italics: Boolean(options.italics),
    underline: options.underline,
  });
}

function paragraph(value, options = {}) {
  const children = Array.isArray(value) ? value : [text(value, options)];
  return new Paragraph({
    children,
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
    border: options.border,
  });
}

function heading(value, level = 1) {
  if (level === 1) {
    return paragraph(value, {
      heading: HeadingLevel.HEADING_1,
      size: 32,
      bold: true,
      color: colors.blue,
      before: 360,
      after: 200,
      keepNext: true,
    });
  }
  if (level === 2) {
    return paragraph(value, {
      heading: HeadingLevel.HEADING_2,
      size: 26,
      bold: true,
      color: colors.blue,
      before: 280,
      after: 140,
      keepNext: true,
    });
  }
  return paragraph(value, {
    heading: HeadingLevel.HEADING_3,
    size: 24,
    bold: true,
    color: colors.blueDark,
    before: 200,
    after: 100,
    keepNext: true,
  });
}

function bullet(value, level = 0) {
  return paragraph(value, {
    numbering: { reference: 'guide-bullets', level },
    after: 80,
    line: 300,
  });
}

function numbered(value, level = 0) {
  return paragraph(value, {
    numbering: { reference: 'guide-numbers', level },
    after: 80,
    line: 300,
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function tableCell(value, width, options = {}) {
  const content = Array.isArray(value)
    ? value
    : [paragraph(value, { size: options.size || 18, bold: options.bold, color: options.color, after: 0, line: 260 })];
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: options.fill ? { type: ShadingType.CLEAR, fill: options.fill } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    borders: { top: border, bottom: border, left: border, right: border },
    verticalAlign: options.verticalAlign || 'center',
    children: content,
  });
}

function dataTable(headers, rows, widths, options = {}) {
  if (widths.reduce((a, b) => a + b, 0) !== CONTENT_WIDTH) {
    throw new Error(`Tổng độ rộng bảng phải bằng ${CONTENT_WIDTH} DXA`);
  }
  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headers.map((header, index) =>
      tableCell(header, widths[index], {
        fill: options.headerFill || colors.blue,
        color: colors.white,
        bold: true,
        size: options.headerSize || 17,
      }),
    ),
  });
  const bodyRows = rows.map(
    (row, rowIndex) =>
      new TableRow({
        cantSplit: true,
        children: headers.map((_, index) =>
          tableCell(row[index] ?? '', widths[index], {
            fill: rowIndex % 2 === 1 ? colors.lightGray : colors.white,
            size: options.bodySize || 17,
          }),
        ),
      }),
  );
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    indent: { size: TABLE_INDENT, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: widths,
    rows: [headerRow, ...bodyRows],
  });
}

function callout(title, body, kind = 'info') {
  const palette = {
    info: { fill: colors.lightBlue, accent: colors.blue },
    success: { fill: colors.greenLight, accent: colors.green },
    warning: { fill: colors.amberLight, accent: colors.amber },
    danger: { fill: colors.redLight, accent: colors.red },
  }[kind];
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    indent: { size: TABLE_INDENT, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [CONTENT_WIDTH],
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: CONTENT_WIDTH, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: palette.fill },
            margins: { top: 140, bottom: 140, left: 180, right: 180 },
            borders: {
              top: { ...border, color: palette.accent },
              bottom: { ...border, color: palette.accent },
              left: { style: BorderStyle.SINGLE, size: 16, color: palette.accent },
              right: { ...border, color: palette.accent },
            },
            children: [
              paragraph(title, { bold: true, color: palette.accent, size: 21, after: 50, keepNext: true }),
              paragraph(body, { size: 20, after: 0, line: 290 }),
            ],
          }),
        ],
      }),
    ],
  });
}

function copyBox(label, content) {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    indent: { size: TABLE_INDENT, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [CONTENT_WIDTH],
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: CONTENT_WIDTH, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: colors.lightGray },
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            borders: { top: border, bottom: border, left: border, right: border },
            children: [
              paragraph(label, { size: 17, bold: true, color: colors.gray, after: 50, keepNext: true }),
              paragraph([text(content, { font: 'Consolas', size: 19, color: colors.navy })], { after: 0, line: 280 }),
            ],
          }),
        ],
      }),
    ],
  });
}

function spacer(after = 100) {
  return paragraph('', { size: 4, after, line: 240 });
}

function cover() {
  const meta = dataTable(
    ['Thông tin', 'Nội dung'],
    [
      ['Đối tượng', 'Nhân viên kinh doanh, Quản lý và người điều phối đánh giá'],
      ['Môi trường thử nghiệm', 'https://medtest.bms7.net/#/chatbot'],
      ['Phạm vi', 'Tra cứu chỉ đọc và thao tác xem trước có kiểm soát'],
      ['Phiên bản tài liệu', '1.2 - ngày 24/07/2026'],
    ],
    [2700, 6660],
    { headerFill: colors.navy, bodySize: 19 },
  );
  return [
    spacer(300),
    paragraph('MEDSTAND AI', {
      size: 24,
      bold: true,
      color: colors.green,
      after: 100,
    }),
    paragraph('HƯỚNG DẪN SỬ DỤNG VÀ ĐÁNH GIÁ THỬ NGHIỆM', {
      size: 54,
      bold: true,
      color: colors.navy,
      after: 180,
      line: 580,
    }),
    paragraph('Hướng dẫn chi tiết từ đăng nhập đến ghi nhận kết quả đánh giá', {
      size: 28,
      color: colors.blue,
      after: 360,
      line: 360,
    }),
    meta,
    spacer(260),
    callout(
      'Mục tiêu của tài liệu',
      'Tài liệu hướng dẫn người dùng thực hiện từng bước, sử dụng câu hỏi mẫu, đối chiếu kết quả mong đợi và ghi nhận theo ba mức: Đạt, Không đạt hoặc Chưa thể kiểm tra.',
      'success',
    ),
    spacer(700),
    paragraph('Tài liệu dành cho khách hàng tham gia thử nghiệm. Không ghi mật khẩu hoặc thông tin xác thực vào tài liệu.', {
      size: 18,
      color: colors.gray,
      alignment: AlignmentType.CENTER,
      after: 0,
    }),
    pageBreak(),
  ];
}

const accountRows = [
  ['1', 'QLBH013.MED', 'Quản lý', 'Miền Bắc', 'NDB001', 'Quản lý cặp NAMDINHB.MED'],
  ['2', 'NAMDINHB.MED', 'Nhân viên kinh doanh', 'Miền Bắc', 'NDB001', 'Chỉ xem phạm vi được giao'],
  ['3', 'QLBH016.MED', 'Quản lý', 'Miền Bắc', 'BNA051', 'Quản lý cặp BACNINHA.MED'],
  ['4', 'BACNINHA.MED', 'Nhân viên kinh doanh', 'Miền Bắc', 'BNA051', 'Chỉ xem phạm vi được giao'],
  ['5', 'QLBH005.MED', 'Quản lý', 'Miền Trung', 'HUEA043', 'Quản lý cặp HUEB.MED'],
  ['6', 'HUEB.MED', 'Nhân viên kinh doanh', 'Miền Trung', 'HUEA043', 'Chỉ xem phạm vi được giao'],
  ['7', 'QLBH010.MED', 'Quản lý', 'Miền Trung', 'QANA002', 'Quản lý cặp DANANGA.MED'],
  ['8', 'DANANGA.MED', 'Nhân viên kinh doanh', 'Miền Trung', 'QANA002', 'Chỉ xem phạm vi được giao'],
  ['9', 'QLMN2', 'Quản lý', 'Miền Nam', 'DL012', 'Quản lý cặp CanThoA'],
  ['10', 'CanThoA', 'Nhân viên kinh doanh', 'Miền Nam', 'DL012', 'Chỉ xem phạm vi được giao'],
  ['11', 'QLMD1', 'Quản lý', 'Miền Nam', 'SGNB0001', 'Quản lý cặp BinhPhuocA'],
  ['12', 'BinhPhuocA', 'Nhân viên kinh doanh', 'Miền Nam', 'SGNB0001', 'Chỉ xem phạm vi được giao'],
  ['13', 'QLBH024.MED', 'Quản lý', 'Miền Nam', 'AG0020', 'Tài khoản quản lý độc lập'],
];

const capabilityRows = [
  ['Doanh số', 'Tra cứu doanh số', 'Từ ngày, đến ngày; có thể chọn nhân viên', 'Biểu đồ và tổng doanh số đúng phạm vi'],
  ['Bán hàng', 'Danh sách hóa đơn', 'Khoảng ngày, trạng thái nếu cần', 'Danh sách hóa đơn và nút xem chi tiết'],
  ['Bán hàng', 'Chi tiết hóa đơn', 'Mã hóa đơn lấy từ danh sách', 'Sản phẩm, số lượng, đơn giá, thành tiền'],
  ['Bán hàng', 'Danh sách đơn hàng', 'Khoảng ngày/khách/trạng thái nếu cần', 'Đơn hàng theo đúng phạm vi tài khoản'],
  ['Khách hàng', 'Chấm điểm khách hàng', 'Có thể để trống hoặc chọn nhóm A/B/C', 'Giá trị khách, mức rủi ro và lý do dễ hiểu'],
  ['Công nợ', 'Công nợ khách hàng', 'Đến ngày; có thể chọn khách', 'Danh sách/tổng công nợ theo quyền'],
  ['Công nợ', 'Chi tiết công nợ', 'Mã hoặc tên khách hàng', 'Các khoản nợ, thanh toán, hạn và còn lại'],
  ['Chương trình', 'Tích lũy khách hàng', 'Mã khách và khoảng ngày', 'Đã tích lũy, mốc tới, còn thiếu và quà dự kiến'],
  ['Tuyến', 'Tuyến bán hàng', 'Ngày cần xem', 'Khách cần ghé trong phạm vi phụ trách'],
  ['Gợi ý', 'Gợi ý đơn hàng', 'Bắt buộc có khách hàng', 'Sản phẩm gợi ý hoặc lý do chưa đủ dữ liệu'],
  ['Gợi ý', 'Gợi ý bán kèm', 'Bắt buộc có khách hàng', 'Sản phẩm bán kèm gắn với khách đã chọn'],
  ['Gợi ý', 'Gợi ý đơn thuốc/sản phẩm liên quan', 'Sản phẩm gốc hoặc từ khóa chính xác', 'Danh sách tham khảo, không thay tư vấn chuyên môn'],
  ['Kho', 'Danh sách tồn kho', 'Mã hoặc tên sản phẩm; có thể chọn kho', 'Số lượng hệ thống ghi nhận tại các kho tài khoản được phép xem'],
  ['Sản phẩm', 'Tra cứu sản phẩm', 'Mã hoặc tên sản phẩm', 'Thông tin sản phẩm, đơn vị tính và mô tả có sẵn'],
  ['Chương trình', 'Sản phẩm trọng tâm', 'Không bắt buộc; có thể chọn khách', 'Sản phẩm, chương trình và tiến độ tích lũy khách'],
  ['Khuyến mãi', 'Đề xuất khuyến mãi', 'Quản lý/Quản trị viên; có thể lọc sản phẩm', 'Danh sách cần xem xét, chưa phải mức đã duyệt'],
  ['Danh mục', 'Tra cứu danh mục', 'Loại danh mục, ví dụ kho hàng', 'Danh sách mã và tên danh mục được cấp'],
  ['Khảo sát', 'Khảo sát 360', 'Mã khách hàng', 'Thông tin khảo sát theo khách'],
  ['Khảo sát', 'Danh sách câu hỏi khảo sát', 'Loại khảo sát nếu có', 'Bộ câu hỏi dùng trong khảo sát'],
  ['Khảo sát', 'Kiểm tra khảo sát', 'Mã khách hàng', 'Trạng thái khảo sát của khách'],
  ['Khảo sát', 'Kiểm tra khảo sát theo ngày', 'Ngày cần kiểm tra', 'Danh sách cần khảo sát trong ngày'],
  ['Khảo sát', 'Lịch sử khảo sát', 'Mã khách hàng', 'Các lần khảo sát đã ghi nhận'],
  ['Thông báo', 'Thông báo', 'Không bắt buộc', 'Thông báo mới trong phạm vi tài khoản'],
  ['Sản phẩm', 'Tìm sản phẩm theo triệu chứng', 'Từ khóa triệu chứng cụ thể', 'Kết quả tham khảo; phải kiểm tra chuyên môn'],
];

function buildBody() {
  const body = [];
  body.push(...cover());

  body.push(heading('1. Bắt đầu nhanh trong 5 phút'));
  body.push(callout('Thông tin cần chuẩn bị', 'Đường dẫn môi trường thử nghiệm, tài khoản được cấp và mã khách hàng tương ứng trong bảng 13 tài khoản. Mật khẩu được gửi qua kênh riêng; không ghi mật khẩu vào tài liệu hoặc ảnh chụp.', 'info'));
  body.push(numbered('Mở https://medtest.bms7.net/ bằng Chrome hoặc Edge phiên bản mới.'));
  body.push(numbered('Đăng nhập bằng đúng tài khoản được cấp; kiểm tra tên và vai trò ở góc trái dưới màn hình.'));
  body.push(numbered('Mở mục “Trợ lý AI”.'));
  body.push(numbered('Gõ “Xin chào”, sau đó gõ “Tôi là ai?” để kiểm tra hội thoại và danh tính.'));
  body.push(numbered('Sao chép một câu hỏi mẫu có mã khách hàng tương ứng với tài khoản đang sử dụng.'));
  body.push(numbered('Đối chiếu kết quả, chụp màn hình khi phát hiện sai lệch và ghi Đạt, Không đạt hoặc Chưa thể kiểm tra.'));
  body.push(dataTable(
    ['Bước', 'Thao tác', 'Kết quả cần ghi nhận'],
    [
      ['1', 'Đăng nhập bằng tài khoản được cấp', 'Tên người dùng và vai trò hiển thị chính xác'],
      ['2', 'Gửi câu hỏi tiếng Việt hoặc chọn chức năng bằng ký hiệu @', 'Trợ lý AI nhận đúng nhu cầu cần tra cứu'],
      ['3', 'Nhập mã khách hàng, mã sản phẩm hoặc ngày khi được yêu cầu', 'Thông tin bắt buộc được nhập đầy đủ và đúng định dạng'],
      ['4', 'Đối chiếu kết quả với phạm vi tài khoản', 'Dữ liệu đúng đối tượng, đúng khu vực và dễ hiểu'],
      ['5', 'Ghi nhận kết quả', 'Chọn Đạt, Không đạt hoặc Chưa thể kiểm tra; đính kèm ảnh khi cần'],
    ],
    [700, 3900, 4760],
    { bodySize: 17 },
  ));
  body.push(callout('Điều kiện ghi nhận Đạt', 'Kết quả đúng tài khoản, đúng khách hàng hoặc sản phẩm, đúng phạm vi dữ liệu, nội dung dễ hiểu và thao tác hoàn tất. Nếu số liệu khác kỳ vọng, không tự điều chỉnh dữ liệu; hãy chụp màn hình để đơn vị phụ trách đối chiếu.', 'success'));

  body.push(heading('2. Bộ tài liệu khách hàng gồm những gì'));
  body.push(dataTable(
    ['Tài liệu', 'Dùng khi nào', 'Người sử dụng'],
    [
      ['01 — Hướng dẫn sử dụng và đánh giá', 'Đọc trước và thực hiện theo từng bước; đây là tài liệu chính', 'Tất cả người tham gia'],
      ['02 — Phiếu ghi nhận kết quả', 'Ghi Đạt, Không đạt hoặc Chưa thể kiểm tra cho từng chức năng', 'Nhân viên kinh doanh và Quản lý'],
      ['03 — Mẫu phản hồi vấn đề', 'Ghi nhận vấn đề hoặc góp ý kèm bằng chứng', 'Người phát hiện vấn đề'],
      ['04 — Bộ câu hỏi cho 13 tài khoản', 'Sao chép câu hỏi theo đúng tài khoản và mã khách hàng', 'Người điều phối và người tham gia'],
    ],
    [3000, 4200, 2160],
    { bodySize: 18 },
  ));
  body.push(callout('Thứ tự sử dụng tài liệu', 'Đọc tài liệu 01; tìm tài khoản trong tài liệu 04; thực hiện câu hỏi mẫu; ghi kết quả vào tài liệu 02; nếu có lỗi, điền thông tin vào tài liệu 03.', 'info'));

  body.push(heading('3. Trước khi đăng nhập'));
  body.push(heading('3.1. Thiết bị và trình duyệt', 2));
  body.push(bullet('Khuyến nghị máy tính hoặc laptop; độ phân giải từ 1366 × 768 trở lên.'));
  body.push(bullet('Sử dụng Chrome hoặc Microsoft Edge phiên bản mới. Trình duyệt cần cho phép trang thử nghiệm hoạt động và lưu phiên đăng nhập.'));
  body.push(bullet('Mạng ổn định. Nếu dùng điện thoại, xoay ngang khi xem bảng nhiều cột.'));
  body.push(bullet('Không sử dụng đồng thời một tài khoản trên nhiều thiết bị trong thời gian đánh giá.'));
  body.push(heading('3.2. Kiểm tra đúng môi trường', 2));
  body.push(dataTable(
    ['Mục kiểm tra', 'Giá trị đúng'],
    [
      ['Tên miền', 'medtest.bms7.net'],
      ['Trang Trợ lý AI', 'https://medtest.bms7.net/#/chatbot'],
      ['Mục đích', 'Môi trường thử nghiệm; không sử dụng làm nguồn số liệu tài chính chính thức'],
      ['Quy tắc bảo mật', 'Không chia sẻ mật khẩu, thông tin xác thực hoặc ảnh có dữ liệu nhạy cảm'],
    ],
    [2400, 6960],
    { bodySize: 19 },
  ));
  body.push(heading('3.3. Nếu giao diện còn là bản cũ', 2));
  body.push(numbered('Nhấn Ctrl + F5 một lần để tải lại toàn bộ giao diện.'));
  body.push(numbered('Nếu giao diện vẫn chưa được cập nhật, đăng xuất, đóng thẻ trình duyệt và mở lại đường dẫn thử nghiệm.'));
  body.push(numbered('Không tự xóa dữ liệu trình duyệt nếu đang giữ phiên làm việc khác; báo điều phối viên trước.'));

  body.push(heading('4. Đăng nhập và xác nhận đúng tài khoản'));
  body.push(numbered('Tại màn hình đăng nhập, nhập tên đăng nhập được cấp.'));
  body.push(numbered('Nhập mật khẩu qua kênh riêng. Không bật “ghi nhớ đăng nhập” trên máy dùng chung.'));
  body.push(numbered('Nhấn “Đăng nhập” và chờ trang chủ tải xong.'));
  body.push(numbered('Quan sát góc trái dưới: tên hiển thị và vai trò phải đúng với phân công.'));
  body.push(numbered('Mở “Trợ lý AI” và thử hai câu bên dưới.'));
  body.push(copyBox('Câu kiểm tra hội thoại', 'Xin chào'));
  body.push(spacer(80));
  body.push(copyBox('Câu kiểm tra danh tính', 'Tôi là ai?'));
  body.push(spacer(80));
  body.push(dataTable(
    ['Tình huống', 'Kết quả đúng', 'Cách xử lý nếu sai'],
    [
      ['Đăng nhập thành công', 'Đúng tên và đúng vai trò', 'Chụp ảnh góc trái dưới và báo điều phối viên'],
      ['“Tôi là ai?”', 'Trả lời đúng tên và vai trò của người đang đăng nhập', 'Không chấp nhận câu trả lời chỉ giới thiệu chức năng của Trợ lý AI'],
      ['Trang trắng/không tải', 'Không xảy ra', 'Nhấn Ctrl+F5; thử lại một lần; nếu còn lỗi, ghi Chưa thể kiểm tra'],
      ['Thông báo không nhận diện được tài khoản', 'Không xảy ra với 13 tài khoản', 'Dừng đánh giá tài khoản đó, chụp toàn bộ thông báo và gửi đơn vị hỗ trợ'],
    ],
    [2200, 3500, 3660],
    { bodySize: 18 },
  ));

  body.push(heading('5. Hiểu giao diện trong 2 phút'));
  body.push(dataTable(
    ['Khu vực', 'Dùng để làm gì'],
    [
      ['Menu trái', 'Mở Trang chủ, Tuyến, Đơn hàng, Báo cáo, Khách hàng và Trợ lý AI'],
      ['Khung hội thoại', 'Nhập câu hỏi bằng tiếng Việt hoặc mở danh sách chức năng bằng ký hiệu @'],
      ['Biểu tượng bốn ô vuông hoặc ký hiệu @', 'Mở danh sách chức năng được phép sử dụng'],
      ['Nút gửi', 'Gửi yêu cầu sau khi đã nhập đủ thông tin bắt buộc'],
      ['Nút mặt trăng/mặt trời', 'Đổi giao diện sáng/tối'],
      ['Mũi tên đầu dòng', 'Mở phần chi tiết của một kết quả'],
      ['Tìm nhanh/bộ lọc', 'Lọc ngay trong danh sách đang hiển thị'],
      ['Phân trang', 'Chuyển giữa các trang, không tải hàng trăm dòng cùng lúc'],
    ],
    [2500, 6860],
    { bodySize: 19 },
  ));
  body.push(callout('Cách hiển thị cần kiểm tra', 'Ngày phải hiển thị theo thứ tự ngày/tháng/năm, ví dụ 24/07/2026. Số tiền có dấu phân cách hàng nghìn và đơn vị rõ ràng. Số điện thoại, mã khách hàng, mã sản phẩm và số lô phải giữ nguyên, không được hiển thị như số tiền.', 'info'));

  body.push(heading('6. Hai cách sử dụng Trợ lý AI'));
  body.push(heading('6.1. Cách dễ nhất: hỏi bằng câu tiếng Việt tự nhiên', 2));
  body.push(copyBox('Ví dụ 1', 'Hôm nay tôi nên làm gì?'));
  body.push(spacer(60));
  body.push(copyBox('Ví dụ 2', 'Khách NDB001 đang còn nợ bao nhiêu?'));
  body.push(spacer(60));
  body.push(copyBox('Ví dụ 3', 'Gợi ý bán kèm cho khách NDB001'));
  body.push(spacer(60));
  body.push(callout('Khi Trợ lý AI chưa hiểu đúng yêu cầu', 'Hãy nêu rõ hành động cần thực hiện, đối tượng, mã và khoảng ngày. Ví dụ: “Xem chi tiết công nợ khách NDB001 đến ngày 24/07/2026”. Nếu kết quả vẫn chưa đúng, mở danh sách chức năng bằng ký hiệu @ và chọn chức năng tương ứng.', 'warning'));
  body.push(heading('6.2. Chọn trực tiếp chức năng bằng ký hiệu @', 2));
  body.push(numbered('Nhấn biểu tượng danh sách chức năng (bốn ô vuông) hoặc nhập ký hiệu @ trong khung hội thoại.'));
  body.push(numbered('Chọn tên chức năng tiếng Việt phù hợp.'));
  body.push(numbered('Điền các trường bắt buộc. Trường có ngày nên chọn bằng lịch.'));
  body.push(numbered('Kiểm tra lại mã khách/mã sản phẩm rồi nhấn gửi.'));
  body.push(heading('6.3. Cách nhập thông tin bắt buộc', 2));
  body.push(dataTable(
    ['Thông tin cần nhập', 'Cách nhập đúng', 'Ví dụ'],
    [
      ['Mã khách hàng', 'Nhập đúng mã trong bảng phân công hoặc chọn từ gợi ý', 'NDB001'],
      ['Mã sản phẩm', 'Giữ nguyên chữ và số, không thêm dấu cách', 'A003'],
      ['Khoảng ngày', 'Từ ngày không được sau đến ngày', '09/07/2026 → 20/07/2026'],
      ['Nhân viên', 'Quản lý chỉ chọn người thuộc phạm vi phụ trách; Nhân viên kinh doanh thường không cần chọn', 'Theo danh sách được cấp'],
      ['Từ khóa triệu chứng', 'Mô tả ngắn và cụ thể; kết quả chỉ tham khảo', 'ho khan'],
    ],
    [2200, 4500, 2660],
    { bodySize: 18 },
  ));

  body.push(heading('7. Cách đọc kết quả trả về'));
  body.push(heading('7.1. Thẻ thông tin tóm tắt', 2));
  body.push(bullet('Dùng để xem nhanh tổng tiền, số hóa đơn, số khoản công nợ, tiến độ hoặc trạng thái.'));
  body.push(bullet('Màu sắc chỉ hỗ trợ nhận biết; kết luận phải dựa trên nhãn và số liệu.'));
  body.push(heading('7.2. Bảng kết quả', 2));
  body.push(bullet('Dùng ô “Tìm nhanh” để lọc trong kết quả hiện tại.'));
  body.push(bullet('Dùng các nút nhóm/trạng thái để lọc; nút đang chọn phải nổi bật.'));
  body.push(bullet('Dùng điều khiển phân trang ở cuối bảng; mỗi trang phải có dữ liệu khác nhau.'));
  body.push(heading('7.3. Phần mở rộng', 2));
  body.push(bullet('Nhấn mũi tên ở đầu dòng để xem thông tin chi tiết.'));
  body.push(bullet('Nhân viên kinh doanh và Quản lý chỉ cần thấy tên trường bằng tiếng Việt, kết luận nghiệp vụ và hướng xử lý tiếp theo.'));
  body.push(bullet('Nếu phần mở rộng không có thêm thông tin hữu ích, ghi góp ý để đơn giản hóa giao diện.'));
  body.push(heading('7.4. Khi kết quả là “Không tìm thấy dữ liệu”', 2));
  body.push(numbered('Kiểm tra lại mã và khoảng ngày.'));
  body.push(numbered('Kiểm tra khách có thuộc phạm vi tài khoản không.'));
  body.push(numbered('Thử mã khách đại diện trong bảng 13 tài khoản.'));
  body.push(numbered('Nếu mã đại diện vẫn không có dữ liệu, chụp ảnh và ghi Không đạt.'));

  body.push(heading('8. Hướng dẫn dành cho Nhân viên kinh doanh'));
  body.push(callout('Mục tiêu sử dụng', 'Nhanh chóng xác định công việc trong ngày, khách hàng cần chăm sóc, công nợ, sản phẩm có thể tham khảo và số lượng hàng đang được hệ thống ghi nhận.', 'success'));
  body.push(heading('8.1. Bắt đầu ngày làm việc', 2));
  body.push(copyBox('Câu nên thử đầu tiên', 'Hôm nay tôi nên làm gì?'));
  body.push(paragraph('Kết quả mong đợi: Trợ lý AI gợi ý công việc phù hợp với vai trò, ví dụ khách hàng cần ghé, khách hàng lâu chưa mua hoặc công việc cần theo dõi. Hệ thống không nên chỉ yêu cầu người dùng “nói rõ hơn”.'));
  body.push(heading('8.2. Xem tuyến/khách cần ghé', 2));
  body.push(copyBox('Câu mẫu', 'Hôm nay tôi nên ghé khách hàng nào?'));
  body.push(paragraph('Kiểm tra: chỉ có khách thuộc tuyến/phạm vi được giao; nếu có lý do thì phải dễ hiểu như “lâu chưa mua” hoặc “đến chu kỳ tham khảo”.'));
  body.push(heading('8.3. Xem doanh số', 2));
  body.push(copyBox('Câu mẫu', 'Doanh số của tôi từ 09/07/2026 đến 20/07/2026 là bao nhiêu?'));
  body.push(paragraph('Kiểm tra: khoảng ngày đúng, biểu đồ và tổng số khớp; không tự mở rộng sang nhân viên khác.'));
  body.push(heading('8.4. Xem công nợ khách', 2));
  body.push(copyBox('Câu mẫu', 'Khách NDB001 đang còn nợ bao nhiêu?'));
  body.push(spacer(50));
  body.push(copyBox('Câu chi tiết', 'Chi tiết công nợ khách NDB001 đến ngày 24/07/2026'));
  body.push(paragraph('Kiểm tra: đúng tên/mã khách, tổng còn nợ, các khoản phát sinh tăng/giảm và trạng thái thanh toán. “Chưa xác định hạn” không có nghĩa là không nợ.'));
  body.push(heading('8.5. Gợi ý đơn hàng và bán kèm', 2));
  body.push(copyBox('Gợi ý đơn hàng', 'Gợi ý đơn hàng cho khách NDB001'));
  body.push(spacer(50));
  body.push(copyBox('Gợi ý bán kèm', 'Gợi ý bán kèm cho khách NDB001'));
  body.push(paragraph('Kiểm tra: kết quả phải gắn đúng khách. Khách ít lịch sử có thể nhận thông báo “chưa đủ dữ liệu”; hệ thống không được tự đoán chu kỳ 30 ngày.'));
  body.push(heading('8.6. Tra cứu sản phẩm và tồn kho', 2));
  body.push(copyBox('Thông tin sản phẩm', 'Tra cứu sản phẩm A003'));
  body.push(spacer(50));
  body.push(copyBox('Tồn kho', 'Tồn kho sản phẩm A003'));
  body.push(paragraph('Kiểm tra: số tồn theo kho được cấp. Tồn âm phải hiển thị và có cảnh báo. Nếu chưa có dữ liệu giữ chỗ/hàng khóa, số “khả dụng tham khảo” không được hiểu là cam kết bán chắc chắn.'));

  body.push(heading('9. Hướng dẫn dành cho Quản lý'));
  body.push(callout('Mục tiêu của Quản lý', 'Nhìn tổng quan đội/miền được giao, phát hiện khách giá trị cao nhưng có nguy cơ giảm mua, theo dõi công nợ và xem các đề xuất cần người có thẩm quyền quyết định.', 'success'));
  body.push(dataTable(
    ['Vai trò', 'Phạm vi được xem', 'Ngoài phạm vi'],
    [
      ['Nhân viên kinh doanh', 'Khách hàng, tuyến, kho và số liệu được giao', 'Không hiển thị dữ liệu của nhân viên hoặc khu vực khác'],
      ['Quản lý', 'Nhân viên và khu vực thuộc phạm vi phụ trách', 'Không hiển thị dữ liệu ngoài đơn vị được giao'],
      ['Quản trị viên', 'Phạm vi được doanh nghiệp cấp cho tài khoản quản trị', 'Vẫn tuân thủ cấu hình và quyền truy cập đã được phê duyệt'],
    ],
    [2200, 3700, 3460],
    { bodySize: 17 },
  ));
  body.push(heading('9.1. Tổng quan doanh số đội', 2));
  body.push(copyBox('Câu mẫu', 'Cho tôi xem tổng quan doanh số của đội từ 09/07/2026 đến 20/07/2026'));
  body.push(paragraph('Kiểm tra: chỉ thấy nhân viên thuộc quyền. Chọn một nhân viên hợp lệ phải lọc đúng; nhập nhân viên ngoài quyền không được làm lộ dữ liệu.'));
  body.push(heading('9.2. Chấm điểm và phân nhóm khách hàng', 2));
  body.push(copyBox('Câu mẫu', 'Chấm điểm khách hàng của tôi'));
  body.push(paragraph('Kiểm tra: có bộ lọc Nhóm A/B/C; “giá trị khách hàng” và “mức rủi ro” là hai nội dung tách biệt. Khách Nhóm A vẫn có thể có rủi ro cao nếu lâu chưa mua.'));
  body.push(heading('9.3. Khách có nguy cơ giảm mua', 2));
  body.push(copyBox('Câu mẫu', 'Khách hàng nào có nguy cơ giảm mua?'));
  body.push(paragraph('Kiểm tra: có lý do bằng tiếng Việt như “138 ngày chưa phát sinh đơn”, “doanh số 3 tháng gần nhất bằng 0” hoặc “xu hướng sụt giảm”; không hiển thị tên trường hoặc mã điểm kỹ thuật cho người dùng nghiệp vụ.'));
  body.push(heading('9.4. Công nợ toàn phạm vi', 2));
  body.push(copyBox('Câu mẫu', 'Cho tôi xem công nợ khách hàng đến ngày 24/07/2026'));
  body.push(paragraph('Kiểm tra: không có khách ngoài miền/đội được cấp. Mở chi tiết phải giữ đúng khách đã chọn.'));
  body.push(heading('9.5. Sản phẩm cần xem xét khuyến mãi', 2));
  body.push(copyBox('Câu mẫu', 'Sản phẩm nào cần xem xét khuyến mãi?'));
  body.push(paragraph('Kiểm tra: Quản lý và Quản trị viên thấy danh sách kèm lý do như bán chậm, tồn nhiều hoặc gần hết hạn. Đây là thông tin để xem xét, không phải chương trình đã được phê duyệt và không tự áp dụng mức giảm giá. Nhân viên kinh doanh chỉ nên thấy chương trình đã được công ty thông qua.'));

  body.push(heading('10. Sản phẩm trọng tâm và tích lũy khách hàng'));
  body.push(numbered('Hỏi “Sản phẩm trọng tâm tháng này” hoặc chọn chức năng Sản phẩm trọng tâm.'));
  body.push(numbered('Mở thẻ “Chương trình áp dụng” để xem thời gian hiệu lực và thang thưởng.'));
  body.push(numbered('Nhấn “Chọn khách hàng”, tìm theo mã hoặc tên trong phạm vi được cấp.'));
  body.push(numbered('Chọn khách để hệ thống gọi luồng tích lũy và hiển thị đã tích lũy, mốc kế tiếp, còn thiếu, quà dự kiến.'));
  body.push(numbered('Nhấn “Xem hóa đơn” hoặc “Xem chương trình” nếu cần đối chiếu sâu hơn.'));
  body.push(copyBox('Câu trực tiếp tương đương', 'Xem tích lũy của khách NDB001 từ 01/07/2026 đến 24/07/2026'));
  body.push(callout('Điều cần nhớ', 'Nếu chương trình không áp dụng cho khoảng ngày hoặc khách chưa có giao dịch hợp lệ, hệ thống phải giải thích rõ. Không tự cộng đơn nháp; chương trình hết hạn không được tự chọn làm chương trình đang áp dụng.', 'warning'));

  body.push(heading('11. Danh mục 24 chức năng được phép sử dụng'));
  body.push(paragraph('Tên dưới đây là tên nghiệp vụ dành cho người dùng. Tài khoản chỉ thấy và gọi được chức năng trong phạm vi đã cấp.'));
  body.push(dataTable(
    ['Nhóm', 'Chức năng', 'Cần nhập', 'Bạn nhận được'],
    capabilityRows,
    [1500, 2300, 2500, 3060],
    { bodySize: 15, headerSize: 16 },
  ));
  body.push(callout('Ngoài 24 chức năng nghiệp vụ', 'Trợ lý AI có thể chào hỏi, giải thích cách sử dụng hoặc đề nghị người dùng bổ sung thông tin. Hệ thống không được tự thực hiện chức năng chưa được phê duyệt và không được tự tạo mã khách hàng hoặc mã sản phẩm.', 'info'));

  body.push(heading('12. Bảng phân công 13 tài khoản thử nghiệm'));
  body.push(paragraph('Tìm đúng tài khoản được cấp và sử dụng mã khách hàng tương ứng để có dữ liệu đối chiếu ổn định. Mã trong bảng là khách hàng đại diện, không có nghĩa tài khoản chỉ được xem duy nhất khách hàng đó.'));
  body.push(dataTable(
    ['STT', 'Tài khoản', 'Vai trò', 'Khu vực', 'Mã khách hàng mẫu', 'Ghi chú'],
    accountRows,
    [500, 1900, 1100, 1400, 1500, 2960],
    { bodySize: 15, headerSize: 16 },
  ));
  body.push(callout('Ví dụ thay mã', 'Tài khoản NAMDINHB.MED dùng mã NDB001. Câu “Gợi ý đơn hàng cho khách {MÃ KHÁCH HÀNG}” phải đổi thành “Gợi ý đơn hàng cho khách NDB001”.', 'info'));
  body.push(heading('12.1. Số doanh số mẫu để đối chiếu', 2));
  body.push(dataTable(
    ['Cặp tài khoản', 'Ngày 20/07/2026', 'Tổng 09/07–20/07'],
    [
      ['QLBH013.MED / NAMDINHB.MED', '83.000.000 ₫', '1.116.000.000 ₫'],
      ['QLBH016.MED / BACNINHA.MED', '86.000.000 ₫', '1.152.000.000 ₫'],
      ['QLBH005.MED / HUEB.MED', '89.000.000 ₫', '1.188.000.000 ₫'],
      ['QLBH010.MED / DANANGA.MED', '92.000.000 ₫', '1.224.000.000 ₫'],
      ['QLMN2 / CanThoA', '95.000.000 ₫', '1.260.000.000 ₫'],
      ['QLMD1 / BinhPhuocA', '98.000.000 ₫', '1.296.000.000 ₫'],
      ['QLBH024.MED', '101.000.000 ₫', '1.332.000.000 ₫'],
    ],
    [3900, 2700, 2760],
    { bodySize: 17 },
  ));
  body.push(callout('Lưu ý về ngày chốt', 'Bộ dữ liệu mẫu được chốt đến ngày 20/07/2026. Khi doanh nghiệp bổ sung dữ liệu sau ngày này, kết quả ở khoảng thời gian khác có thể thay đổi. Để đối chiếu các số liệu trên, vui lòng sử dụng đúng khoảng từ 09/07/2026 đến 20/07/2026.', 'warning'));

  body.push(heading('13. Bộ câu hỏi mẫu bắt buộc'));
  const copyCases = [
    ['TH-01', 'Xin chào', 'Phản hồi tự nhiên, không gọi nhầm chức năng'],
    ['TH-02', 'Tôi là ai?', 'Nói đúng người dùng/vai trò đang đăng nhập'],
    ['TH-03', 'Hôm nay tôi nên làm gì?', 'Gợi ý theo vai trò và phạm vi'],
    ['TH-04', 'Doanh số của tôi từ 09/07/2026 đến 20/07/2026 là bao nhiêu?', 'Khớp bảng đối chiếu'],
    ['TH-05', 'Hôm nay tôi nên ghé khách hàng nào?', 'Chỉ khách trong tuyến/phạm vi'],
    ['TH-06', 'Gợi ý đơn hàng cho khách {MÃ KHÁCH HÀNG}', 'Đúng khách hoặc giải thích thiếu lịch sử'],
    ['TH-07', 'Gợi ý bán kèm cho khách {MÃ KHÁCH HÀNG}', 'Đúng khách; không trả danh sách chung'],
    ['TH-08', 'Khách {MÃ KHÁCH HÀNG} đang còn nợ bao nhiêu?', 'Tổng nợ đúng khách'],
    ['TH-09', 'Chi tiết công nợ khách {MÃ KHÁCH HÀNG} đến ngày 24/07/2026', 'Các khoản nợ và trạng thái dễ hiểu'],
    ['TH-10', 'Tồn kho sản phẩm A003', 'Đúng kho được cấp, tồn âm không bị che'],
    ['TH-11', 'Tra cứu sản phẩm A003', 'Mã, tên, đơn vị tính rõ ràng'],
    ['TH-12', 'Sản phẩm trọng tâm tháng này là gì?', 'Có sản phẩm/chương trình hoặc lý do không có'],
    ['TH-13', 'Xem tích lũy của khách {MÃ KHÁCH HÀNG} từ 01/07/2026 đến 24/07/2026', 'Đã đạt, mốc tiếp, còn thiếu và quà dự kiến'],
    ['TH-14', 'Tìm sản phẩm theo triệu chứng ho khan', 'Kết quả tham khảo và có cảnh báo chuyên môn'],
  ];
  body.push(dataTable(['Mã', 'Câu hỏi mẫu', 'Kết quả mong đợi'], copyCases, [900, 5000, 3460], { bodySize: 16 }));
  body.push(callout('Cách thực hiện', 'Thay {MÃ KHÁCH HÀNG} bằng mã khách hàng trong bảng phân công. Thực hiện một lần bằng câu hỏi tiếng Việt và một lần bằng chức năng chọn qua ký hiệu @. Khi đã nhập đủ thông tin, hai cách phải cho kết quả cùng loại.', 'info'));

  body.push(heading('14. Kiểm tra phạm vi dữ liệu được phép xem — bắt buộc'));
  body.push(dataTable(
    ['Tình huống', 'Kết quả bắt buộc'],
    [
      ['Nhân viên kinh doanh hỏi khách ngoài tuyến hoặc khu vực', 'Không trả dữ liệu khách đó'],
      ['Quản lý chọn nhân viên ngoài phạm vi phụ trách', 'Không trả dữ liệu nhân viên đó'],
      ['Tài khoản chỉ được xem một số kho', 'Chỉ hiển thị các kho được cấp'],
      ['Đổi tên người dùng trong dữ liệu gửi đi', 'Hệ thống vẫn dùng danh tính đã đăng nhập'],
      ['Phiên đăng nhập đã hết hạn', 'Yêu cầu đăng nhập lại; không trả dữ liệu từ phiên cũ'],
      ['Mã hóa đơn ngoài phạm vi', 'Không trả chi tiết'],
    ],
    [4300, 5060],
    { bodySize: 18 },
  ));
  body.push(callout('Dừng đánh giá ngay', 'Nếu một tài khoản xem được khách hàng, nhân viên, kho hoặc hóa đơn ngoài phạm vi được cấp, hãy ghi nhận lỗi nghiêm trọng và dừng đánh giá chức năng liên quan.', 'danger'));

  body.push(heading('15. Cách hiểu đúng các số liệu nghiệp vụ'));
  body.push(dataTable(
    ['Nội dung', 'Cách hiểu đúng', 'Không nên hiểu là'],
    [
      ['Doanh số', 'Doanh số theo trạng thái hoàn tất và khoảng ngày đang chọn', 'Doanh thu đã thu đủ nếu chưa đối chiếu sổ thu tiền'],
      ['Tồn trong kho', 'Số lượng hệ thống ghi nhận tại kho tài khoản được phép xem', 'Số lượng chắc chắn có thể bán nếu hệ thống chưa trừ hàng giữ chỗ hoặc hàng bị khóa'],
      ['Tồn âm', 'Dữ liệu bất thường cần hiển thị và kiểm tra', 'Tự động đổi thành 0'],
      ['Công nợ', 'Phát sinh tăng trừ phát sinh giảm đến ngày chốt', 'Tất cả đều quá hạn khi không có ngày đến hạn'],
      ['Nhóm A/B/C', 'Phân khúc giá trị dựa trên doanh số và tần suất', 'Mức rủi ro'],
      ['Rủi ro', 'Dấu hiệu giảm mua/lâu chưa mua', 'Xếp hạng giá trị khách'],
      ['Gợi ý đơn/bán kèm', 'Tham khảo từ lịch sử và quy tắc hiện có', 'Cam kết khách sẽ mua'],
      ['Đề xuất khuyến mãi', 'Danh sách để Quản lý hoặc Quản trị viên xem xét', 'Mức giảm giá công ty đã phê duyệt'],
      ['Tìm theo triệu chứng', 'Gợi ý sản phẩm tham khảo', 'Chẩn đoán hoặc thay thế tư vấn chuyên môn'],
    ],
    [1800, 4300, 3260],
    { bodySize: 16 },
  ));
  body.push(callout('Lưu ý khi sử dụng Trợ lý AI', 'Trợ lý AI có thể đưa ra kết quả chưa chính xác. Người dùng cần đối chiếu lại dữ liệu nghiệp vụ. Nội dung liên quan đến sức khỏe hoặc sản phẩm chuyên ngành chỉ mang tính tham khảo và không thay thế ý kiến của người có chuyên môn.', 'warning'));

  body.push(heading('16. Chế độ chỉ đọc và thao tác xem trước'));
  body.push(bullet('Trong giai đoạn thử nghiệm, các chức năng tra cứu chỉ đọc dữ liệu.'));
  body.push(bullet('Các chức năng thêm đơn hàng, thêm khách hàng hoặc nhập chương trình, nếu xuất hiện, chỉ được kiểm tra ở chế độ xem trước khi chưa có phê duyệt ghi dữ liệu thật.'));
  body.push(bullet('Không tự áp giá, tự phát hành khuyến mãi hoặc tự tạo đơn thật.'));
  body.push(bullet('Nếu màn hình báo không thể lưu do dữ liệu bị trùng, không nhấn gửi liên tục; hãy chụp ảnh và báo đơn vị hỗ trợ.'));
  body.push(callout('Quy tắc an toàn', 'Không sử dụng dữ liệu khách hàng thật ngoài danh sách được cấp để thử chức năng tạo hoặc cập nhật dữ liệu. Thông báo gửi thành công không đồng nghĩa dữ liệu đã được phê duyệt về nghiệp vụ.', 'danger'));

  body.push(heading('17. Xử lý sự cố thường gặp'));
  body.push(dataTable(
    ['Hiện tượng', 'Nguyên nhân thường gặp', 'Người dùng cần làm'],
    [
      ['Không đăng nhập được', 'Sai tài khoản/mật khẩu hoặc tài khoản bị khóa', 'Kiểm tra bàn phím; thử 1 lần; liên hệ điều phối viên, không gửi mật khẩu'],
      ['Không nhận diện được tài khoản đăng nhập', 'Tài khoản đăng nhập chưa được liên kết với hồ sơ người dùng trong hệ thống', 'Dừng đánh giá tài khoản; chụp đầy đủ thông báo và ghi thời gian xảy ra'],
      ['Yêu cầu thiếu hoặc sai thông tin', 'Thiếu mã khách hàng, mã sản phẩm hoặc ngày cần tra cứu', 'Nhập đủ thông tin; mở danh sách chức năng bằng ký hiệu @ để kiểm tra các trường bắt buộc'],
      ['Không tìm thấy dữ liệu', 'Sai mã, ngoài phạm vi hoặc khoảng ngày không có giao dịch', 'Dùng mã khách đại diện; kiểm tra ngày và vai trò'],
      ['Không thể lưu do dữ liệu bị trùng', 'Yêu cầu đã được gửi trước đó hoặc thao tác bị lặp', 'Không gửi lại; chụp ảnh; ghi tên chức năng và thời điểm'],
      ['Kết quả giống hệt ở nhiều trang', 'Lỗi phân trang hoặc bộ nhớ tạm của trình duyệt', 'Chụp trang 1 và trang 2; ghi số trang; nhấn Ctrl+F5 một lần'],
      ['Giao diện cũ sau khi cập nhật', 'Trình duyệt còn lưu phiên bản cũ', 'Nhấn Ctrl+F5; đăng xuất và mở lại thẻ trình duyệt; báo lại nếu vẫn còn'],
      ['Phản hồi quá chậm', 'Mạng, tải hệ thống hoặc truy vấn lớn', 'Ghi thời gian bắt đầu/kết thúc; không bấm gửi liên tục'],
      ['Câu tự nhiên không hiểu', 'Câu thiếu đối tượng hoặc quá mơ hồ', 'Viết rõ hành động + mã + ngày; thử cùng chức năng bằng @'],
      ['Giao diện tối khó đọc', 'Màu nền và màu chữ chưa đủ tương phản', 'Chụp toàn màn hình; ghi tên trình duyệt và kích thước màn hình'],
    ],
    [2100, 3200, 4060],
    { bodySize: 16 },
  ));

  body.push(heading('18. Cách ghi Đạt, Không đạt và Chưa thể kiểm tra'));
  body.push(dataTable(
    ['Kết luận', 'Khi nào chọn', 'Ví dụ'],
    [
      ['Đạt', 'Đúng dữ liệu, đúng phạm vi, dễ hiểu, thao tác hoàn tất', 'Nhân viên kinh doanh chỉ thấy khách hàng được giao'],
      ['Không đạt', 'Có kết quả nhưng sai dữ liệu, sai quyền, nút lỗi hoặc nội dung khó hiểu nghiêm trọng', 'Trang 2 lặp lại dữ liệu trang 1'],
      ['Chưa thể kiểm tra', 'Không thể thực hiện do lỗi đăng nhập, môi trường hoặc thiếu dữ liệu mẫu cần thiết', 'Trang trắng hoặc quy trình xử lý chưa hoạt động'],
    ],
    [1500, 4800, 3060],
    { bodySize: 18 },
  ));
  body.push(callout('Phân loại kết quả đúng trường hợp', 'Nếu chức năng hoạt động nhưng trả kết quả sai, phải ghi Không đạt. Chỉ ghi Chưa thể kiểm tra khi người dùng thực sự không thể thực hiện bước đánh giá.', 'warning'));

  body.push(heading('19. Cách chụp và gửi bằng chứng lỗi'));
  body.push(numbered('Giữ nguyên màn hình đang có lỗi; không xóa lịch sử chat ngay.'));
  body.push(numbered('Chụp đủ câu hỏi màu xanh và câu trả lời/kết quả phía dưới.'));
  body.push(numbered('Nếu tài khoản xem được dữ liệu ngoài phạm vi được cấp, chụp cả tên tài khoản và vai trò; che các thông tin không liên quan.'));
  body.push(numbered('Ghi thời gian theo thứ tự ngày/tháng/năm và giờ:phút, ví dụ 24/07/2026 09:30.'));
  body.push(numbered('Ghi kết quả mong đợi và kết quả thực tế bằng một câu ngắn.'));
  body.push(numbered('Không đưa mật khẩu, thông tin xác thực, chuỗi kết nối hoặc dữ liệu nhạy cảm vào ảnh.'));
  body.push(copyBox('Quy tắc đặt tên ảnh', 'NAMTHANGNGAY_TAIKHOAN_TRUONGHOP_KETQUA.png'));
  body.push(spacer(50));
  body.push(copyBox('Ví dụ', '20260724_NAMDINHB-MED_TRUONGHOP09_KHONG-DAT.png'));

  body.push(heading('20. Danh sách kiểm tra trước khi ký nghiệm thu'));
  [
    '13/13 tài khoản đăng nhập được và hiển thị đúng vai trò.',
    'Nhân viên kinh doanh không thấy khách hàng, nhân viên hoặc kho ngoài phạm vi.',
    'Quản lý chỉ thấy nhân viên và khu vực thuộc phạm vi phụ trách.',
    'Câu hỏi tiếng Việt và chức năng chọn bằng ký hiệu @ cho kết quả cùng loại khi đã nhập đủ thông tin.',
    'Doanh số giai đoạn 09/07/2026 đến 20/07/2026 khớp bộ dữ liệu mẫu đã chốt.',
    'Công nợ tổng và chi tiết giữ đúng khách đã chọn.',
    'Gợi ý đơn hàng/bán kèm bắt buộc gắn khách.',
    'Tồn âm được hiển thị; tồn chưa xác minh không bị đổi thành 0.',
    'Nhóm giá trị A/B/C được trình bày tách biệt với mức rủi ro.',
    'Khuyến mãi chỉ là tham khảo/chờ phê duyệt theo đúng vai trò.',
    'Ngày hiển thị theo thứ tự ngày/tháng/năm; mã và số điện thoại không được định dạng như tiền.',
    'Giao diện sáng và tối, màn hình điện thoại, tìm kiếm và phân trang hoạt động đúng.',
    'Không còn lỗi nghiêm trọng về phạm vi dữ liệu hoặc ghi dữ liệu ngoài ý muốn.',
  ].forEach((item) => body.push(paragraph([text('☐ ', { size: 22, color: colors.blue, bold: true }), text(item, { size: 21 })], { after: 100 })));

  body.push(heading('21. Thông tin người thực hiện và xác nhận'));
  body.push(dataTable(
    ['Thông tin', 'Nội dung điền'],
    [
      ['Họ và tên', ''],
      ['Tài khoản', ''],
      ['Vai trò/khu vực', ''],
      ['Ngày giờ thực hiện', ''],
      ['Số trường hợp Đạt / Không đạt / Chưa thể kiểm tra', ''],
      ['Lỗi nghiêm trọng còn mở', ''],
      ['Đánh giá chung', ''],
      ['Xác nhận', '□ Chấp nhận kết quả thử nghiệm có điều kiện   □ Yêu cầu chỉnh sửa và kiểm tra lại'],
    ],
    [3200, 6160],
    { bodySize: 19 },
  ));
  body.push(spacer(200));
  body.push(dataTable(
    ['Đại diện', 'Họ tên', 'Xác nhận/ngày'],
    [
      ['Nhân viên kinh doanh', '', ''],
      ['Người dùng Quản lý', '', ''],
      ['Đầu mối nghiệp vụ', '', ''],
      ['Đầu mối kỹ thuật', '', ''],
    ],
    [2600, 3300, 3460],
    { bodySize: 19 },
  ));
  body.push(callout('Kết luận quan trọng', 'Kết quả kiểm tra kỹ thuật không thay thế xác nhận nghiệp vụ. Việc hoàn thành thử nghiệm không tự động chứng minh công thức tài chính, số lượng có thể bán hoặc nội dung chuyên môn đã được doanh nghiệp phê duyệt.', 'warning'));
  return body;
}

async function main() {
  const document = new Document({
    creator: 'Medstand AI',
    title: 'Hướng dẫn sử dụng và đánh giá thử nghiệm Medstand AI',
    subject: 'Hướng dẫn chi tiết dành cho khách hàng',
    description: 'Tài liệu hướng dẫn dành cho Nhân viên kinh doanh, Quản lý và người điều phối đánh giá',
    numbering: {
      config: [
        {
          reference: 'guide-bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 540, hanging: 270 },
                  spacing: { after: 80, line: 300 },
                },
              },
            },
          ],
        },
        {
          reference: 'guide-numbers',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 540, hanging: 270 },
                  spacing: { after: 80, line: 300 },
                },
              },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 22, color: colors.black },
          paragraph: { spacing: { before: 0, after: 120, line: 300 } },
        },
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: FONT, size: 32, bold: true, color: colors.blue },
          paragraph: { spacing: { before: 360, after: 200, line: 300 }, keepNext: true },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: FONT, size: 26, bold: true, color: colors.blue },
          paragraph: { spacing: { before: 280, after: 140, line: 300 }, keepNext: true },
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: FONT, size: 24, bold: true, color: colors.blueDark },
          paragraph: { spacing: { before: 200, after: 100, line: 300 }, keepNext: true },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 708, footer: 708 },
          },
        },
        headers: {
          default: new Header({
            children: [
              paragraph(
                [
                  text('MEDSTAND AI', { size: 17, bold: true, color: colors.green }),
                  text('  |  Hướng dẫn khách hàng  |  Phiên bản 1.2', { size: 17, color: colors.gray }),
                ],
                {
                  alignment: AlignmentType.RIGHT,
                  after: 0,
                  line: 240,
                },
              ),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { before: 0, after: 0, line: 240 },
                children: [
                  text('medtest.bms7.net  |  Trang ', { size: 16, color: colors.gray }),
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: colors.gray }),
                ],
              }),
            ],
          }),
        },
        children: buildBody(),
      },
    ],
  });

  fs.mkdirSync(path.dirname(output), { recursive: true });
  const buffer = await Packer.toBuffer(document);
  fs.writeFileSync(output, buffer);
  console.log(JSON.stringify({ output, bytes: buffer.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
