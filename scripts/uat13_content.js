'use strict';

/**
 * Nguồn nội dung duy nhất cho bộ hướng dẫn UAT 13 tài khoản.
 *
 * Hai bản đầu ra đọc chung file này nên không thể lệch nội dung:
 *   - docs/GOI_UAT_KHACH_HANG/HUONG_DAN_TEST_13_TAI_KHOAN.html   (build_uat13_html.js)
 *   - docs/GOI_UAT_KHACH_HANG/01_HUONG_DAN_TEST_13_TAI_KHOAN.docx (build_uat13_docx.js)
 *
 * Mọi câu hỏi mẫu trong file này đều đã chạy qua scripts/natural_chat_classifier.js
 * và định tuyến đúng chức năng — kiểm lại bằng: node scripts/verify_uat13_questions.js
 */

const MA_KH = 'MÃ KHÁCH';
const MA_SP = 'MÃ SẢN PHẨM';
const MA_HD = 'SỐ HÓA ĐƠN';

/* ══════════════════════════════════════════════════════════════════════════
   24 chức năng hội thoại
   ────────────────────────────────────────────────────────────────────────── */

const FUNCTIONS = [
  {
    code: 'CN-01',
    name: 'Doanh số',
    roles: 'Sale · Quản lý',
    prep: 'Bảng doanh số đối chiếu của kỳ đang test do điều phối viên cấp.',
    ask: 'Doanh số hôm nay',
    askAlt: 'Doanh thu tháng này',
    expect:
      'Nêu rõ kỳ báo cáo, tổng doanh số có đơn vị tiền, thời điểm cập nhật. Số tổng khớp bảng chi tiết. '
      + 'Sale chỉ thấy doanh số của chính mình; Quản lý thấy bảng theo nhân viên trong miền được giao, không có nhân viên miền khác.',
    missAsk: 'Doanh số từ 32/13/2026 đến 09/07/2026',
    missExpect: 'Báo khoảng ngày không hợp lệ và xin nhập lại. Không tự đoán ngày, không trả về số liệu.',
    edgeAsk: 'Doanh số từ 01/09/2030 đến 30/09/2030',
    edgeExpect:
      'Kỳ tương lai / kỳ chưa phát sinh: nói rõ là chưa có dữ liệu. Ghi Chưa đạt nếu hiển thị 0 như một con số doanh số thật mà không kèm giải thích.',
  },
  {
    code: 'CN-02',
    name: 'Danh sách hóa đơn',
    roles: 'Sale · Quản lý',
    prep: 'Biết trước kỳ có ít nhất 1 hóa đơn trong phạm vi tài khoản.',
    ask: 'Danh sách hóa đơn',
    askAlt: 'Xem hóa đơn',
    expect:
      'Bảng có số hóa đơn, ngày, khách hàng, giá trị. Ngày dạng dd/MM/yyyy, tiền có đơn vị. '
      + 'Danh sách dài phải có tìm kiếm, phân trang hoặc cuộn. Chỉ hóa đơn thuộc phạm vi tài khoản.',
    missAsk: null,
    missExpect:
      'Chức năng không cần tham số — kiểm tra hệ thống nêu rõ kỳ và phạm vi đang lấy, thay vì im lặng tự chọn giúp.',
    edgeAsk: 'Danh sách hóa đơn (chọn kỳ chưa phát sinh)',
    edgeExpect: 'Nói rõ kỳ không có hóa đơn. Không trả bảng rỗng không có lời giải thích.',
  },
  {
    code: 'CN-03',
    name: 'Chi tiết hóa đơn',
    roles: 'Sale · Quản lý',
    prep: `Một ${MA_HD} hợp lệ trong phạm vi, một số không tồn tại, một số thuộc miền khác — điều phối viên cấp.`,
    ask: `Chi tiết hóa đơn ${MA_HD}`,
    askAlt: `Xem chi tiết hóa đơn ${MA_HD}`,
    expect:
      'Đúng hóa đơn đã hỏi: khách hàng, ngày, danh sách mặt hàng, số lượng, đơn giá, thành tiền, tổng tiền. Tổng khớp cộng dồn dòng chi tiết.',
    missAsk: 'Chi tiết hóa đơn',
    missExpect: 'Hỏi lại số hóa đơn bằng tiếng Việt rõ ràng. Không tự chọn một hóa đơn bất kỳ.',
    edgeAsk: 'Chi tiết hóa đơn HD-KHONG-CO-THAT',
    edgeExpect:
      'Báo không tìm thấy hóa đơn. Không hiện lỗi kỹ thuật. Với số hóa đơn của miền khác: không trả dữ liệu, dừng test và báo ngay nếu vẫn trả.',
  },
  {
    code: 'CN-04',
    name: 'Danh sách đơn hàng',
    roles: 'Sale · Quản lý',
    prep: 'Biết trước kỳ có ít nhất 1 đơn hàng trong phạm vi tài khoản.',
    ask: 'Danh sách đơn hàng',
    askAlt: 'Xem đơn hàng',
    expect:
      'Bảng có mã đơn, ngày, khách hàng, trạng thái, tổng tiền. Chỉ đơn thuộc phạm vi tài khoản. Có tìm kiếm hoặc phân trang khi danh sách dài.',
    missAsk: null,
    missExpect: 'Chức năng không cần tham số — kiểm tra hệ thống nêu rõ kỳ và phạm vi đang lấy.',
    edgeAsk: 'Danh sách đơn hàng (kỳ chưa phát sinh)',
    edgeExpect: 'Nói rõ chưa có đơn trong kỳ. Không biến chưa có dữ liệu thành 0 đơn đã hoàn tất.',
  },
  {
    code: 'CN-05',
    name: 'Chấm điểm khách hàng',
    roles: 'Sale · Quản lý',
    prep: 'Danh sách khách trong tuyến / miền của tài khoản.',
    ask: 'Chấm điểm khách hàng',
    askAlt: 'Chấm điểm khách',
    expect:
      'Phân nhóm khách kèm lý do đọc hiểu được. Sale chỉ thấy khách trong tuyến của mình; Quản lý thấy khách toàn miền được giao. Không hiện mã kỹ thuật hay công thức tính điểm.',
    missAsk: null,
    missExpect: 'Chức năng không cần tham số — kiểm tra hệ thống nêu rõ phạm vi khách đang chấm.',
    edgeAsk: 'Chấm điểm khách hàng (tài khoản có khách mới, chưa đủ lịch sử)',
    edgeExpect: 'Khách chưa đủ lịch sử phải được ghi rõ là chưa đủ dữ liệu, không xếp nhóm bừa.',
  },
  {
    code: 'CN-06',
    name: 'Công nợ khách hàng',
    roles: 'Sale · Quản lý',
    prep: 'Bảng công nợ đối chiếu do điều phối viên cấp.',
    ask: 'Công nợ khách hàng',
    askAlt: 'Xem công nợ khách hàng',
    expect:
      'Tổng quan công nợ theo phạm vi tài khoản: tổng còn nợ, số khách có nợ. Tiền có đơn vị. Không có khách ngoài phạm vi.',
    missAsk: null,
    missExpect: 'Chức năng không cần tham số — kiểm tra hệ thống nêu rõ phạm vi và thời điểm cập nhật.',
    edgeAsk: 'Công nợ khách hàng (tài khoản không có khách nào còn nợ)',
    edgeExpect: 'Nói rõ không có khách nào còn nợ. Không để trống màn hình.',
  },
  {
    code: 'CN-07',
    name: 'Công nợ chi tiết',
    roles: 'Sale · Quản lý',
    prep: `${MA_KH} đại diện được giao, thêm một mã khách của miền khác để thử phạm vi.`,
    ask: `Chi tiết công nợ ${MA_KH}`,
    askAlt: `Khách ${MA_KH} đang nợ bao nhiêu`,
    expect:
      'Tổng còn nợ và danh sách hóa đơn còn nợ kèm ngày đến hạn, tình trạng thanh toán. Tổng khớp cộng dồn dòng chi tiết.',
    missAsk: 'Xem công nợ',
    missExpect: 'Hỏi lại mã khách. Không tự chọn một khách bất kỳ trong danh sách.',
    edgeAsk: 'Chi tiết công nợ KH-KHONG-CO-THAT · rồi thử mã khách của miền khác',
    edgeExpect:
      'Mã không tồn tại: báo không tìm thấy khách. Mã ngoài phạm vi: không trả dữ liệu. Hóa đơn thiếu ngày đến hạn phải ghi chưa có ngày đến hạn, không để trống.',
  },
  {
    code: 'CN-08',
    name: 'Tích lũy',
    roles: 'Sale · Quản lý',
    prep: `${MA_KH} đại diện, biết trước mốc tích lũy hiện tại.`,
    ask: `Tích lũy của khách ${MA_KH}`,
    askAlt: `Xem tích lũy khách ${MA_KH}`,
    expect: 'Mức tích lũy hiện tại, mốc kế tiếp và khoảng còn thiếu. Đúng khách đã hỏi.',
    missAsk: 'Xem tích lũy',
    missExpect: 'Hỏi lại mã khách, không tự chọn khách.',
    edgeAsk: 'Tích lũy của khách KH-KHONG-CO-THAT',
    edgeExpect: 'Báo không tìm thấy khách. Khách chưa phát sinh tích lũy: nói rõ là chưa có, không hiện 0 như đã đạt mốc.',
  },
  {
    code: 'CN-09',
    name: 'Tuyến bán hàng',
    roles: 'Sale · Quản lý',
    prep: 'Danh sách tuyến được giao của tài khoản.',
    ask: 'Tuyến bán hàng hôm nay',
    askAlt: 'Tuyến hôm nay',
    expect:
      'Chỉ khách thuộc tuyến của tài khoản đang dùng, kèm lý do cần ghé. Xuất hiện khách miền khác là lỗi nghiêm trọng — dừng test và báo ngay.',
    missAsk: null,
    missExpect: 'Chức năng không cần tham số — kiểm tra hệ thống nêu rõ ngày và tuyến đang lấy.',
    edgeAsk: 'Tuyến bán hàng hôm nay (ngày không có lịch tuyến)',
    edgeExpect: 'Nói rõ hôm nay không có lịch tuyến, không trả danh sách khách bất kỳ để lấp chỗ trống.',
  },
  {
    code: 'CN-10',
    name: 'Gợi ý đơn hàng',
    roles: 'Sale · Quản lý',
    prep: `${MA_KH} đại diện có lịch sử mua, thêm một khách UAT_TEST mới tạo chưa có lịch sử.`,
    ask: `Gợi ý đơn hàng cho ${MA_KH}`,
    askAlt: `${MA_KH} nên nhập gì`,
    expect: 'Danh sách sản phẩm gợi ý kèm lý do dễ hiểu, gắn đúng khách vừa hỏi. Không phải danh sách bán chạy chung chung.',
    missAsk: 'Gợi ý đơn hàng',
    missExpect: 'Hỏi lại mã khách. Không tự chọn khách.',
    edgeAsk: 'Gợi ý đơn hàng cho khách UAT_TEST mới tạo',
    edgeExpect: 'Khách chưa đủ lịch sử phải được nói rõ, không đoán bừa. Mã khách ngoài phạm vi: không trả dữ liệu.',
  },
  {
    code: 'CN-11',
    name: 'Gợi ý bán kèm',
    roles: 'Sale · Quản lý',
    prep: `${MA_KH} đại diện có lịch sử mua.`,
    ask: `Gợi ý bán kèm cho khách ${MA_KH}`,
    askAlt: `Bán kèm gì cho ${MA_KH}`,
    expect: 'Sản phẩm bán kèm gắn đúng khách vừa hỏi, kèm lý do. Không lẫn sản phẩm của khách khác.',
    missAsk: 'Gợi ý bán kèm',
    missExpect: 'Hỏi lại mã khách.',
    edgeAsk: 'Gợi ý bán kèm cho khách UAT_TEST mới tạo',
    edgeExpect: 'Khách chưa đủ lịch sử: nói rõ chưa gợi ý được. Mã ngoài phạm vi: không trả dữ liệu.',
  },
  {
    code: 'CN-12',
    name: 'Gợi ý đơn thuốc / sản phẩm tương ứng',
    roles: 'Sale · Quản lý',
    prep: `${MA_SP} có thật trong danh mục.`,
    ask: `Gợi ý đơn thuốc cho ${MA_SP}`,
    askAlt: `Đơn thuốc cho ${MA_SP}`,
    expect:
      'Nhóm sản phẩm đi kèm hợp lý với sản phẩm đã hỏi. Phải có ghi chú đây là gợi ý tham khảo, không phải tư vấn chuyên môn về thuốc.',
    missAsk: 'Gợi ý đơn thuốc',
    missExpect: 'Hỏi lại mã hoặc tên sản phẩm.',
    edgeAsk: 'Gợi ý đơn thuốc cho SP-KHONG-CO-THAT',
    edgeExpect: 'Báo không tìm thấy sản phẩm. Từ khóa trả về nhiều kết quả: phải liệt kê để chọn, không tự chọn giúp.',
  },
  {
    code: 'CN-13',
    name: 'Danh sách tồn kho',
    roles: 'Sale · Quản lý',
    prep: `${MA_SP} còn tồn, thêm một sản phẩm tồn bằng 0 nếu có.`,
    ask: `Tồn kho ${MA_SP}`,
    askAlt: `${MA_SP} còn hàng không`,
    expect:
      'Số tồn kèm tên kho và số lô. Nếu ghi tồn khả dụng là tham khảo hoặc chưa xác minh thì đó là đúng thiết kế — phải kiểm kho trước khi hứa với khách.',
    missAsk: 'Xem tồn kho',
    missExpect: 'Hỏi lại mã hoặc tên sản phẩm. Không liệt kê toàn bộ kho.',
    edgeAsk: `Tồn kho ${MA_SP} tồn bằng 0 · rồi thử SP-KHONG-CO-THAT`,
    edgeExpect:
      'Tồn 0 phải ghi rõ là hết hàng, tồn âm phải được cảnh báo là bất thường chứ không hiển thị như số bình thường. Mã không có thật: báo không tìm thấy.',
  },
  {
    code: 'CN-14',
    name: 'Tra cứu sản phẩm',
    roles: 'Sale · Quản lý',
    prep: `${MA_SP} có thật, thêm một từ khóa gõ sai chính tả.`,
    ask: `Tra cứu sản phẩm ${MA_SP}`,
    askAlt: `Thông tin sản phẩm ${MA_SP}`,
    expect: 'Tên, mã, quy cách, đơn vị tính, nhóm sản phẩm. Có lại từ khóa người dùng vừa nhập trong phần tiêu đề kết quả.',
    missAsk: 'Tra cứu sản phẩm',
    missExpect: 'Hỏi lại mã hoặc tên sản phẩm.',
    edgeAsk: 'Tra cứu sản phẩm paraxetamon (cố tình gõ sai)',
    edgeExpect:
      'Từ khóa sai: báo không tìm thấy hoặc gợi ý từ khóa gần đúng. Nhiều kết quả: liệt kê để chọn, không tự chọn kết quả đầu tiên.',
  },
  {
    code: 'CN-15',
    name: 'Sản phẩm trọng tâm',
    roles: 'Sale · Quản lý',
    prep: 'Danh sách sản phẩm trọng tâm kỳ hiện tại do điều phối viên cấp.',
    ask: 'Sản phẩm trọng tâm',
    askAlt: 'Sản phẩm trọng tâm tháng này',
    expect: 'Danh sách sản phẩm trọng tâm của kỳ, có nêu kỳ áp dụng. Khớp bảng đối chiếu.',
    missAsk: null,
    missExpect: 'Chức năng không cần tham số — kiểm tra hệ thống nêu rõ kỳ đang áp dụng.',
    edgeAsk: 'Sản phẩm trọng tâm (kỳ chưa cấu hình)',
    edgeExpect: 'Nói rõ kỳ chưa có cấu hình sản phẩm trọng tâm, không lấy tạm kỳ trước.',
  },
  {
    code: 'CN-16',
    name: 'Đề xuất khuyến mãi',
    roles: 'Quản lý',
    prep: 'Kịch bản khuyến mãi UAT được giao.',
    ask: 'Đề xuất khuyến mãi',
    askAlt: 'Sản phẩm nào cần khuyến mãi',
    expect:
      'Danh sách sản phẩm nên xem xét khuyến mãi kèm lý do. Phải ghi rõ đây là đề xuất để xem xét, chưa phải chương trình đã duyệt.',
    missAsk: null,
    missExpect:
      'Chức năng không cần tham số — kiểm tra tài khoản Sale không dùng được hoặc không thấy nút duyệt chương trình.',
    edgeAsk: 'Đề xuất khuyến mãi (đăng nhập bằng tài khoản Sale)',
    edgeExpect: 'Sale không được duyệt chương trình. Nếu Sale duyệt được: lỗi phân quyền nghiêm trọng, dừng test và báo ngay.',
  },
  {
    code: 'CN-17',
    name: 'Danh mục',
    roles: 'Sale · Quản lý',
    prep: 'Không cần chuẩn bị riêng.',
    ask: 'Danh mục sản phẩm',
    askAlt: 'Danh mục kho hàng',
    expect: 'Đúng loại danh mục đã hỏi. Danh sách dài có tìm kiếm hoặc phân trang. Chỉ kho và khách thuộc phạm vi tài khoản.',
    missAsk: 'Danh mục',
    missExpect: 'Hỏi lại muốn xem danh mục nào — sản phẩm, kho hàng hay khách hàng.',
    edgeAsk: 'Danh mục khách hàng (so với tài khoản khác miền)',
    edgeExpect: 'Hai tài khoản khác miền phải ra hai danh sách khác nhau. Trùng nhau nghĩa là rò rỉ phạm vi — báo ngay.',
  },
  {
    code: 'CN-18',
    name: 'Khảo sát 360',
    roles: 'Sale · Quản lý',
    prep: `${MA_KH} đại diện đã có khảo sát.`,
    ask: `Khảo sát 360 khách ${MA_KH}`,
    askAlt: `Xem khảo sát 360 của ${MA_KH}`,
    expect: 'Kết quả khảo sát của đúng khách đã hỏi, có thời điểm khảo sát gần nhất.',
    missAsk: 'Khảo sát 360',
    missExpect: 'Hỏi lại mã khách.',
    edgeAsk: 'Khảo sát 360 khách UAT_TEST mới tạo',
    edgeExpect: 'Khách chưa khảo sát lần nào: nói rõ chưa có dữ liệu khảo sát.',
  },
  {
    code: 'CN-19',
    name: 'Danh sách câu hỏi khảo sát',
    roles: 'Sale · Quản lý',
    prep: `${MA_KH} đại diện.`,
    ask: `Danh sách câu hỏi khảo sát ${MA_KH}`,
    askAlt: `Câu hỏi khảo sát ${MA_KH}`,
    expect: 'Bộ câu hỏi khảo sát áp dụng cho khách đó, tiếng Việt đủ dấu, không lẫn mã kỹ thuật.',
    missAsk: 'Danh sách câu hỏi khảo sát',
    missExpect: 'Hỏi lại mã khách.',
    edgeAsk: 'Danh sách câu hỏi khảo sát KH-KHONG-CO-THAT',
    edgeExpect: 'Báo không tìm thấy khách, không trả bộ câu hỏi mặc định.',
  },
  {
    code: 'CN-20',
    name: 'Kiểm tra trạng thái khảo sát',
    roles: 'Sale · Quản lý',
    prep: `${MA_KH} đại diện.`,
    ask: `Trạng thái khảo sát ${MA_KH}`,
    askAlt: `Kiểm tra khảo sát ${MA_KH}`,
    expect: 'Cho biết khách đã khảo sát hay chưa, lần gần nhất là khi nào.',
    missAsk: 'Trạng thái khảo sát',
    missExpect: 'Hỏi lại mã khách.',
    edgeAsk: 'Trạng thái khảo sát của khách thuộc miền khác',
    edgeExpect: 'Không trả dữ liệu. Nếu vẫn trả: lỗi rò rỉ phạm vi, dừng test và báo ngay.',
  },
  {
    code: 'CN-21',
    name: 'Khảo sát trong ngày',
    roles: 'Sale · Quản lý',
    prep: 'Không cần chuẩn bị riêng.',
    ask: 'Kiểm tra khảo sát ngày hôm nay',
    askAlt: 'Hôm nay đã khảo sát chưa',
    expect: 'Số khảo sát đã thực hiện hôm nay trong phạm vi tài khoản, có ngày đang xét.',
    missAsk: null,
    missExpect: 'Chức năng không cần tham số — kiểm tra hệ thống ghi rõ ngày đang xét.',
    edgeAsk: 'Kiểm tra khảo sát ngày hôm nay (ngày chưa khảo sát lần nào)',
    edgeExpect: 'Nói rõ hôm nay chưa có khảo sát nào, không để trống.',
  },
  {
    code: 'CN-22',
    name: 'Lịch sử khảo sát',
    roles: 'Sale · Quản lý',
    prep: 'Không cần chuẩn bị riêng.',
    ask: 'Lịch sử khảo sát',
    askAlt: 'Lịch sử khảo sát khách hàng',
    expect: 'Danh sách khảo sát đã thực hiện, sắp xếp theo thời gian, ngày dạng dd/MM/yyyy. Chỉ trong phạm vi tài khoản.',
    missAsk: null,
    missExpect: 'Chức năng không cần tham số — kiểm tra hệ thống ghi rõ khoảng thời gian đang lấy.',
    edgeAsk: 'Lịch sử khảo sát (tài khoản chưa khảo sát lần nào)',
    edgeExpect: 'Nói rõ chưa có lịch sử khảo sát.',
  },
  {
    code: 'CN-23',
    name: 'Thông báo',
    roles: 'Sale · Quản lý',
    prep: 'Không cần chuẩn bị riêng.',
    ask: 'Xem thông báo',
    askAlt: 'Thông báo mới',
    expect: 'Danh sách thông báo kèm thời điểm. Chỉ thông báo dành cho tài khoản hoặc miền đang đăng nhập.',
    missAsk: null,
    missExpect: 'Chức năng không cần tham số — kiểm tra hệ thống ghi rõ khoảng thời gian đang lấy.',
    edgeAsk: 'Xem thông báo (tài khoản không có thông báo nào)',
    edgeExpect: 'Nói rõ không có thông báo mới, không để trống màn hình.',
  },
  {
    code: 'CN-24',
    name: 'Tìm sản phẩm theo triệu chứng',
    roles: 'Sale · Quản lý',
    prep: 'Không cần chuẩn bị riêng.',
    ask: 'Tìm sản phẩm theo triệu chứng đau đầu',
    askAlt: 'Sản phẩm cho triệu chứng ho',
    expect:
      'Danh sách sản phẩm liên quan kèm ghi chú đây là gợi ý tham khảo. Bắt buộc phải có câu nhắc không thay thế tư vấn chuyên môn về thuốc.',
    missAsk: 'Tìm sản phẩm theo triệu chứng',
    missExpect: 'Hỏi lại triệu chứng cụ thể.',
    edgeAsk: 'Tìm sản phẩm theo triệu chứng xyzabc',
    edgeExpect: 'Triệu chứng vô nghĩa: báo không tìm thấy. Ghi Chưa đạt nếu hệ thống khẳng định công dụng điều trị.',
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   Ca kiểm thử biên
   ────────────────────────────────────────────────────────────────────────── */

const EDGE_CASES = [
  ['BI-01', 'Sale · Quản lý', 'Mã khách đại diện được giao.', 'Hỏi công nợ nhưng không nhập mã khách: `Xem công nợ`',
    'Hệ thống yêu cầu bổ sung mã khách. Không tự chọn giúp một khách bất kỳ.'],
  ['BI-02', 'Sale · Quản lý', 'Một mã khách chắc chắn không tồn tại.', 'Hỏi `Chi tiết công nợ KH-KHONG-CO-THAT`',
    'Thông báo tiếng Việt rõ ràng là không tìm thấy khách. Không hiện lỗi kỹ thuật, không hiện tên cột tiếng Anh.'],
  ['BI-03', 'Sale · Quản lý', 'Một mã khách có thật nhưng thuộc miền khác — điều phối viên cấp.',
    'Hỏi `Chi tiết công nợ <MÃ KHÁCH MIỀN KHÁC>`',
    'Không trả dữ liệu. Nếu trả về bất kỳ thông tin nào: dừng toàn bộ test và báo ngay — đây là lỗi nghiêm trọng nhất.'],
  ['BI-04', 'Sale · Quản lý', 'Không cần chuẩn bị.', 'Hỏi `Doanh số từ 20/07/2026 đến 09/07/2026` (ngày đầu sau ngày cuối)',
    'Báo khoảng ngày không hợp lệ hoặc xin xác nhận lại. Ghi Chưa đạt nếu hệ thống vẫn trả kết quả cho khoảng ngày đảo ngược.'],
  ['BI-05', 'Sale · Quản lý', 'Không cần chuẩn bị.', 'Hỏi `Doanh số từ 32/13/2026 đến 09/07/2026`',
    'Báo ngày không hợp lệ và xin nhập lại.'],
  ['BI-06', 'Sale · Quản lý', 'Không cần chuẩn bị.', 'Hỏi doanh số cho một kỳ trong tương lai',
    'Nói rõ kỳ chưa phát sinh. Không hiển thị 0 như một con số doanh số thật.'],
  ['BI-07', 'Sale · Quản lý', 'Một sản phẩm tồn bằng 0; nếu dữ liệu UAT có tồn âm thì thử luôn.',
    'Hỏi tồn kho của sản phẩm đó', 'Tồn 0 ghi rõ là hết hàng. Tồn âm phải được đánh dấu bất thường, không hiển thị như số bình thường.'],
  ['BI-08', 'Sale · Quản lý', 'Một khách có công nợ nhưng thiếu hóa đơn hoặc thiếu ngày đến hạn.',
    'Hỏi chi tiết công nợ khách đó', 'Ô thiếu dữ liệu ghi rõ là chưa có, không để trống và không hiện ngày mặc định như 01/01/1900.'],
  ['BI-09', 'Sale · Quản lý', 'Khách UAT_TEST vừa tạo, chưa có lịch sử mua.', 'Hỏi gợi ý đơn hàng và gợi ý bán kèm cho khách đó',
    'Nói rõ khách chưa đủ lịch sử để gợi ý. Không đưa danh sách bán chạy chung rồi gọi đó là gợi ý riêng cho khách.'],
  ['BI-10', 'Sale · Quản lý', 'Một từ khóa sản phẩm gõ sai và một từ khóa cho ra nhiều kết quả.',
    'Tra cứu sản phẩm bằng cả hai từ khóa', 'Từ khóa sai: báo không tìm thấy hoặc gợi ý từ gần đúng. Nhiều kết quả: liệt kê để người dùng chọn.'],
  ['BI-11', 'Sale · Quản lý', 'Mã khách đại diện.',
    'Hỏi cùng một nội dung bằng 3 cách: `Chi tiết công nợ <MÃ KHÁCH>` · `Khách <MÃ KHÁCH> đang nợ bao nhiêu` · `Coi công nợ <MÃ KHÁCH>`',
    'Cả ba cách ra cùng một chức năng và cùng một khách. Cách nào không hiểu thì ghi lại nguyên văn vào cột Ghi chú.'],
  ['BI-12', 'Sale · Quản lý', 'Mã khách đại diện.', 'Hỏi `Khách <MÃ KHÁCH> đang nợ bao nhiêu`, ngay sau đó gõ `Chi tiết đi`',
    'Câu thứ hai phải hiểu là đang nói về đúng khách vừa hỏi và mở chi tiết công nợ, không hỏi lại từ đầu.'],
  ['BI-13', 'Sale · Quản lý', 'Không cần chuẩn bị.', 'Bấm gửi cùng một câu hỏi 3 lần liên tiếp thật nhanh',
    'Không tạo bản ghi trùng, không tạo đơn trùng. Loading phải xuất hiện ngay, không để màn hình trống.'],
];

/* ══════════════════════════════════════════════════════════════════════════
   Luồng tạo khách hàng / đơn hàng / khuyến mãi / đối chiếu
   ────────────────────────────────────────────────────────────────────────── */

const CUSTOMER_FLOW = [
  ['KH-01', 'Sale · Quản lý', 'Đã đăng nhập đúng tài khoản.', 'Mở chức năng thêm khách hàng',
    'Màn hình mở được, đúng vai trò được phép.'],
  ['KH-02', 'Sale · Quản lý', '—', 'Đọc hết các trường và nhãn trên form',
    'Nhãn tiếng Việt đủ dấu, không có tên cột tiếng Anh hay mã kỹ thuật.'],
  ['KH-03', 'Sale · Quản lý', '—', 'Bỏ trống trường bắt buộc rồi bấm lưu',
    'Chặn lưu và chỉ rõ trường nào còn thiếu. Không lưu nửa vời.'],
  ['KH-04', 'Sale · Quản lý', '—', 'Nhập sai định dạng: số điện thoại có chữ, email thiếu @',
    'Báo sai định dạng ngay tại trường đó, không để tới lúc lưu mới báo lỗi chung chung.'],
  ['KH-05', 'Sale · Quản lý', 'Tên và mã khách bắt đầu bằng `UAT_TEST`.', 'Tạo khách mới hợp lệ',
    'Tạo được. Không dùng tên, số điện thoại hay địa chỉ của khách hàng thật.'],
  ['KH-06', 'Sale · Quản lý', '—', 'Đọc thông báo sau khi lưu',
    'Có thông báo tạo thành công rõ ràng, kèm mã khách vừa tạo.'],
  ['KH-07', 'Sale · Quản lý', 'Mã khách vừa tạo.', 'Tìm lại khách vừa tạo trong danh sách hoặc bằng câu hỏi cho trợ lý',
    'Tìm thấy đúng khách, thông tin khớp với lúc nhập.'],
  ['KH-08', 'Sale · Quản lý', 'Một tài khoản Sale và một tài khoản Quản lý cùng miền.', 'Đăng nhập lần lượt hai tài khoản và tìm khách vừa tạo',
    'Sale chỉ thấy nếu khách thuộc tuyến của mình; Quản lý thấy theo miền được giao.'],
  ['KH-09', 'Sale · Quản lý', 'Mã khách vừa tạo.', 'Tạo lại một khách trùng mã',
    'Có cảnh báo trùng mã và chặn tạo. Không tạo ra hai bản ghi cùng mã.'],
  ['KH-10', 'Điều phối viên', 'Danh sách mã khách UAT_TEST đã tạo.', 'Ghi lại toàn bộ mã khách vừa tạo vào biên bản UAT',
    'Có đủ danh sách để dọn dữ liệu sau kiểm thử.'],
];

const CUSTOMER_FLOW_PASS =
  'Khách được tạo đúng một lần, dữ liệu đúng như đã nhập, tìm lại được và không xuất hiện với tài khoản ngoài phạm vi.';

const ORDER_FLOW = [
  ['DH-01', 'Sale · Quản lý', 'Khách `UAT_TEST` đã tạo ở luồng KH.', 'Chọn khách UAT_TEST', 'Chọn được đúng khách vừa tạo.'],
  ['DH-02', 'Sale · Quản lý', '—', 'Mở chức năng thêm đơn hàng', 'Màn hình mở được, đúng vai trò được phép.'],
  ['DH-03', 'Sale · Quản lý', '—', 'Bấm xác nhận khi chưa chọn khách hoặc chưa thêm sản phẩm',
    'Chặn lại và nói rõ còn thiếu gì. Không tạo đơn rỗng.'],
  ['DH-04', 'Sale · Quản lý', 'Một sản phẩm còn tồn.', 'Thêm một sản phẩm vào đơn', 'Sản phẩm vào đơn đúng tên và đơn giá.'],
  ['DH-05', 'Sale · Quản lý', '—', 'Nhập số lượng 0, số âm, rồi số vượt tồn kho',
    'Chặn số lượng 0 và số âm. Vượt tồn phải cảnh báo rõ, không cho qua âm thầm.'],
  ['DH-06', 'Sale · Quản lý', 'Bảng giá đối chiếu.', 'Kiểm tra đơn giá, số lượng, thành tiền từng dòng và tổng tiền',
    'Thành tiền từng dòng và tổng tiền tính đúng, tiền có đơn vị.'],
  ['DH-07', 'Sale · Quản lý', 'Kịch bản khuyến mãi UAT được giao.', 'Chỉ áp dụng đúng kịch bản khuyến mãi được giao',
    'Không tự thử chương trình ngoài kịch bản, không sửa cấu hình dùng chung.'],
  ['DH-08', 'Sale · Quản lý', '—', 'Xác nhận tạo đơn một lần', 'Có thông báo tạo thành công kèm mã đơn.'],
  ['DH-09', 'Sale · Quản lý', 'Mã đơn vừa tạo.', 'Tìm lại đơn trong danh sách đơn hàng', 'Tìm thấy đúng đơn vừa tạo.'],
  ['DH-10', 'Sale · Quản lý', '—', 'Mở chi tiết đơn vừa tạo',
    'Đúng khách, đúng sản phẩm, tổng tiền khớp với lúc tạo.'],
  ['DH-11', 'Sale · Quản lý', '—', 'Hỏi trợ lý `Danh sách đơn hàng`',
    'Đơn vừa tạo xuất hiện trong kết quả của trợ lý.'],
  ['DH-12', 'Sale · Quản lý', '—', 'Bấm gửi hoặc xác nhận nhiều lần liên tiếp', 'Không tạo đơn trùng.'],
  ['DH-13', 'Điều phối viên', 'Danh sách mã đơn UAT_TEST.', 'Ghi lại toàn bộ mã đơn vừa tạo vào biên bản UAT',
    'Có đủ danh sách để dọn dữ liệu sau kiểm thử.'],
];

const ORDER_FLOW_PASS =
  'Đơn được tạo đúng một lần, tổng tiền đúng, liên kết đúng khách hàng và chỉ tài khoản có quyền mới xem được.';

const PROMO_CASES = [
  ['KM-01', 'Sale · Quản lý', 'Đơn UAT không áp dụng khuyến mãi.', 'Tạo đơn và kiểm tra giá',
    'Giá gốc và tổng tiền đúng bảng giá đối chiếu.'],
  ['KM-02', 'Sale · Quản lý', 'Một khuyến mãi hợp lệ trong kịch bản UAT.', 'Tạo đơn đủ điều kiện khuyến mãi',
    'Điều kiện áp dụng và mức giảm đúng như kịch bản.'],
  ['KM-03', 'Sale · Quản lý', 'Một khuyến mãi đã hết hạn.', 'Thử áp dụng khuyến mãi hết hạn',
    'Không được áp dụng, có thông báo rõ lý do.'],
  ['KM-04', 'Sale · Quản lý', 'Một đơn không đủ điều kiện.', 'Thử áp dụng khuyến mãi khi chưa đủ điều kiện',
    'Không được áp dụng, nêu rõ còn thiếu điều kiện gì.'],
  ['KM-05', 'Sale', 'Tài khoản Sale.', 'Thử duyệt một chương trình khuyến mãi',
    'Sale không duyệt được. Nếu duyệt được: lỗi phân quyền nghiêm trọng, dừng test và báo ngay.'],
  ['KM-06', 'Quản lý', 'Không cần chuẩn bị.', 'Mở chức năng đề xuất khuyến mãi',
    'Kết quả ghi rõ là đề xuất để xem xét, chưa phải chương trình đã duyệt. Không có thao tác nào làm đổi cấu hình dùng chung.'],
];

const RECONCILE_CASES = [
  ['DC-01', 'Sale · Quản lý', 'Mã khách UAT_TEST.', 'Tra cứu lại khách vừa tạo', 'Thông tin khớp với lúc nhập.'],
  ['DC-02', 'Sale · Quản lý', 'Mã đơn UAT_TEST.', 'Tra cứu danh sách và chi tiết đơn hàng',
    'Đơn có trong danh sách, chi tiết khớp với lúc tạo.'],
  ['DC-03', 'Sale · Quản lý', 'Mã sản phẩm đã dùng trong đơn.', 'Tra cứu tồn kho sản phẩm đó',
    'Tồn kho thay đổi đúng theo thiết kế hệ thống. Nếu thiết kế chỉ trừ tồn khi đơn được xuất thì tồn chưa đổi vẫn là đúng.'],
  ['DC-04', 'Sale · Quản lý', 'Bảng doanh số trước khi tạo đơn.', 'Hỏi lại doanh số của kỳ chứa đơn vừa tạo',
    'Doanh số chỉ thay đổi nếu trạng thái đơn được thiết kế để ghi nhận doanh số. Không mặc định đơn mới phải làm tăng doanh số — phải căn cứ trạng thái nghiệp vụ.'],
  ['DC-05', 'Sale · Quản lý', 'Khách UAT_TEST và một khách có lịch sử.', 'Hỏi gợi ý đơn hàng và gợi ý bán kèm cho cả hai',
    'Gợi ý gắn đúng từng khách, không lẫn dữ liệu giữa hai khách.'],
  ['DC-06', 'Tài khoản khác miền', 'Một tài khoản thuộc miền khác.', 'Đăng nhập và tìm khách, đơn vừa tạo',
    'Không thấy dữ liệu vừa tạo. Nếu thấy: lỗi rò rỉ phạm vi, dừng test và báo ngay.'],
];

/* ══════════════════════════════════════════════════════════════════════════
   Sơ đồ
   ────────────────────────────────────────────────────────────────────────── */

const SVG_FLOW_5 = `<svg viewBox="0 0 900 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Năm bước: Chép câu hỏi, Gửi, Chờ kết quả, Đối chiếu, Ghi kết quả">
  <defs>
    <marker id="ah" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M0,0 L7,3.5 L0,7 Z" fill="currentColor" style="color:var(--rule-strong)"/>
    </marker>
  </defs>
  <g>
    <rect class="svg-card" x="4"   y="30" width="158" height="130" rx="12"/>
    <text class="svg-n" x="24" y="60" font-size="15">01</text>
    <text class="svg-t" x="24" y="88" font-size="15">Chép câu hỏi</text>
    <text class="svg-s" x="24" y="112" font-size="12.5">Bấm nút Chép,</text>
    <text class="svg-s" x="24" y="130" font-size="12.5">dán vào khung chat</text>
  </g>
  <line class="svg-ar" x1="168" y1="95" x2="188" y2="95" marker-end="url(#ah)"/>
  <g>
    <rect class="svg-card" x="194" y="30" width="158" height="130" rx="12"/>
    <text class="svg-n" x="214" y="60" font-size="15">02</text>
    <text class="svg-t" x="214" y="88" font-size="15">Gửi</text>
    <text class="svg-s" x="214" y="112" font-size="12.5">Thay MÃ KHÁCH</text>
    <text class="svg-s" x="214" y="130" font-size="12.5">bằng mã được giao</text>
  </g>
  <line class="svg-ar" x1="358" y1="95" x2="378" y2="95" marker-end="url(#ah)"/>
  <g>
    <rect class="svg-card" x="384" y="30" width="158" height="130" rx="12"/>
    <text class="svg-n" x="404" y="60" font-size="15">03</text>
    <text class="svg-t" x="404" y="88" font-size="15">Chờ kết quả</text>
    <text class="svg-s" x="404" y="112" font-size="12.5">Quá lâu thì bấm</text>
    <text class="svg-s" x="404" y="130" font-size="12.5">Dừng phản hồi</text>
  </g>
  <line class="svg-ar" x1="548" y1="95" x2="568" y2="95" marker-end="url(#ah)"/>
  <g>
    <rect class="svg-card" x="574" y="30" width="158" height="130" rx="12"/>
    <text class="svg-n" x="594" y="60" font-size="15">04</text>
    <text class="svg-t" x="594" y="88" font-size="15">Đối chiếu</text>
    <text class="svg-s" x="594" y="112" font-size="12.5">So với phần</text>
    <text class="svg-s" x="594" y="130" font-size="12.5">Kết quả mong đợi</text>
  </g>
  <line class="svg-ar" x1="738" y1="95" x2="758" y2="95" marker-end="url(#ah)"/>
  <g>
    <rect class="svg-card-go" x="764" y="30" width="132" height="130" rx="12"/>
    <text class="svg-n" x="784" y="60" font-size="15">05</text>
    <text class="svg-t" x="784" y="88" font-size="15">Ghi kết quả</text>
    <text class="svg-s" x="784" y="112" font-size="12.5">Đạt / Chưa đạt</text>
    <text class="svg-s" x="784" y="130" font-size="12.5">/ Chưa chạy được</text>
  </g>
</svg>`;

const SVG_ROLES = `<svg viewBox="0 0 900 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="So sánh phạm vi dữ liệu giữa Sale và Quản lý">
  <g>
    <rect class="svg-card" x="4" y="20" width="430" height="200" rx="12"/>
    <circle cx="34" cy="52" r="6" style="fill:var(--brand)"/>
    <text class="svg-t" x="50" y="57" font-size="16">Sale</text>
    <text class="svg-s" x="24" y="88"  font-size="13">Chỉ thấy khách và tuyến được giao</text>
    <line class="svg-ar" x1="24" y1="104" x2="414" y2="104"/>
    <text class="svg-s" x="24" y="130" font-size="13">· Doanh số cá nhân</text>
    <text class="svg-s" x="24" y="154" font-size="13">· Công nợ khách trong tuyến</text>
    <text class="svg-s" x="24" y="178" font-size="13">· Gợi ý đơn hàng, bán kèm</text>
    <text class="svg-s" x="24" y="202" font-size="13">· Không duyệt được khuyến mãi</text>
  </g>
  <g>
    <rect class="svg-card" x="466" y="20" width="430" height="200" rx="12"/>
    <circle cx="496" cy="52" r="6" style="fill:var(--accent)"/>
    <text class="svg-t" x="512" y="57" font-size="16">Quản lý</text>
    <text class="svg-s" x="486" y="88"  font-size="13">Thấy toàn đội và miền được giao</text>
    <line class="svg-ar" x1="486" y1="104" x2="876" y2="104"/>
    <text class="svg-s" x="486" y="130" font-size="13">· Doanh số theo nhân viên</text>
    <text class="svg-s" x="486" y="154" font-size="13">· Phân nhóm khách A / B / C</text>
    <text class="svg-s" x="486" y="178" font-size="13">· Danh sách cần xem xét khuyến mãi</text>
    <text class="svg-s" x="486" y="202" font-size="13">· Vẫn không thấy miền khác</text>
  </g>
</svg>`;

const SVG_ERROR_TREE = `<svg viewBox="0 0 900 330" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cây quyết định khi gặp lỗi">
  <defs>
    <marker id="ah2" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M0,0 L7,3.5 L0,7 Z" fill="currentColor" style="color:var(--rule-strong)"/>
    </marker>
  </defs>
  <rect class="svg-card" x="300" y="8" width="300" height="52" rx="10"/>
  <text class="svg-t" x="450" y="40" font-size="15" text-anchor="middle">Câu trả lời không như mong đợi</text>
  <line class="svg-ar" x1="450" y1="62" x2="450" y2="86" marker-end="url(#ah2)"/>
  <rect class="svg-card" x="250" y="88" width="400" height="62" rx="10"/>
  <text class="svg-t" x="450" y="115" font-size="14" text-anchor="middle">Có phải bạn gõ thiếu mã khách</text>
  <text class="svg-s" x="450" y="136" font-size="13" text-anchor="middle">hoặc thiếu khoảng ngày không?</text>
  <line class="svg-ar" x1="250" y1="119" x2="176" y2="119" marker-end="url(#ah2)"/>
  <rect class="svg-card-go" x="8" y="92" width="168" height="56" rx="10"/>
  <text class="svg-t" x="92" y="115" font-size="13.5" text-anchor="middle">Bổ sung rồi</text>
  <text class="svg-t" x="92" y="134" font-size="13.5" text-anchor="middle">hỏi lại</text>
  <line class="svg-ar" x1="450" y1="152" x2="450" y2="176" marker-end="url(#ah2)"/>
  <rect class="svg-card" x="250" y="178" width="400" height="62" rx="10"/>
  <text class="svg-t" x="450" y="205" font-size="14" text-anchor="middle">Đăng xuất, đăng nhập lại,</text>
  <text class="svg-s" x="450" y="226" font-size="13" text-anchor="middle">hỏi lại đúng câu đó một lần nữa</text>
  <line class="svg-ar" x1="450" y1="242" x2="450" y2="266" marker-end="url(#ah2)"/>
  <rect class="svg-card" x="250" y="268" width="400" height="56" rx="10"/>
  <text class="svg-t" x="450" y="292" font-size="14" text-anchor="middle">Vẫn sai — ghi phiếu và báo lỗi</text>
  <text class="svg-s" x="450" y="313" font-size="12.5" text-anchor="middle">kèm ảnh chụp toàn màn hình</text>
  <line class="svg-ar" x1="650" y1="296" x2="724" y2="296" marker-end="url(#ah2)"/>
  <rect class="svg-card" x="732" y="268" width="164" height="56" rx="10"/>
  <text class="svg-s" x="814" y="292" font-size="12.5" text-anchor="middle">Có Mã tra cứu thì</text>
  <text class="svg-s" x="814" y="310" font-size="12.5" text-anchor="middle">chép cả mã đó</text>
</svg>`;

/* ══════════════════════════════════════════════════════════════════════════
   Bộ câu hỏi bắt buộc — phần chính
   ────────────────────────────────────────────────────────────────────────── */

const CORE_QUESTIONS = [
  ['Hôm nay tôi nên làm gì?', 'Danh sách khách cần quan tâm hôm nay, kèm lý do dễ hiểu như lâu chưa mua hoặc tới lịch ghé.'],
  ['Hôm nay tôi nên ghé khách nào?', 'Chỉ khách thuộc tuyến của bạn. Thấy khách miền khác là lỗi nghiêm trọng, báo ngay.'],
  ['Cho tôi danh sách khách thuộc tuyến của tôi', 'Danh sách khách được giao. Đếm sơ xem có khách nào lạ không.'],
  ['Khách nào lâu chưa mua?', 'Tên khách, lần mua cuối và số ngày chưa mua. Không được hiện điểm số hay mã kỹ thuật.'],
  ['Hôm nay doanh số của tôi là bao nhiêu?', 'Có số tiền của ngày hôm nay. Đối chiếu với bảng số liệu điều phối viên cung cấp.'],
  ['Doanh số từ 09/07/2026 đến 20/07/2026 của tôi là bao nhiêu?',
    'Đúng khoảng ngày đã hỏi, đủ 12 ngày. Nếu trả về khoảng ngày khác là lỗi, ghi lại khoảng ngày nó hiện.'],
  [`Khách ${MA_KH} đang nợ bao nhiêu?`,
    'Tổng còn nợ và tình trạng thanh toán. Khách không nợ thì phải nói rõ là không nợ, không để trống.'],
  ['Chi tiết đi', 'Gõ ngay sau câu 07. Trợ lý phải nhớ đang nói về khách đó và mở chi tiết công nợ, không hỏi lại từ đầu.'],
  [`Gợi ý đơn hàng cho ${MA_KH}`, 'Danh sách sản phẩm gợi ý kèm lý do. Khách mới chưa đủ lịch sử thì phải nói rõ, không được đoán bừa.'],
  [`Gợi ý bán kèm cho khách ${MA_KH}`, 'Sản phẩm bán kèm gắn với đúng khách vừa hỏi, không phải danh sách chung chung.'],
  ['Tồn kho sản phẩm A003',
    'Số tồn kèm tên kho và số lô. Nếu ghi tồn khả dụng là tham khảo hoặc chưa xác minh, đó là đúng thiết kế — phải kiểm kho trước khi hứa với khách.'],
];

/* ══════════════════════════════════════════════════════════════════════════
   Cấu trúc tài liệu
   ────────────────────────────────────────────────────────────────────────── */

const TRACK_HEAD = ['Mã ca', 'Vai trò', 'Chuẩn bị', 'Thao tác / câu hỏi', 'Kết quả mong đợi', 'Thực tế', 'Trạng thái', 'Ghi chú / Mã tra cứu'];
const TRACK_WIDTHS = [8, 9, 15, 20, 26, 8, 7, 7];

function trackRows(cases) {
  return cases.map(([id, role, prep, act, expect]) => [id, role, prep, act, expect, '', '', '']);
}

function functionRows() {
  const rows = [];
  for (const f of FUNCTIONS) {
    rows.push([
      `${f.code}\n${f.name}`,
      f.roles,
      f.prep,
      `${f.ask}\n\nCách hỏi khác: ${f.askAlt}`,
      f.expect,
      '', '', '',
    ]);
    rows.push([
      `${f.code}-T`,
      f.roles,
      '—',
      f.missAsk ? f.missAsk : 'Không có tham số bắt buộc',
      f.missExpect,
      '', '', '',
    ]);
    rows.push([
      `${f.code}-B`,
      f.roles,
      'Mã sai / dữ liệu rỗng / mã ngoài phạm vi.',
      f.edgeAsk,
      f.edgeExpect,
      '', '', '',
    ]);
  }
  return rows;
}

const document = {
  meta: {
    title: 'Hướng dẫn kiểm thử Medstand AI — Bộ 13 tài khoản',
    h1a: 'Hướng dẫn kiểm thử',
    h1b: 'bộ 13 tài khoản',
    lede:
      'Tài liệu này hướng dẫn bạn chạy thử trợ lý AI bằng tài khoản được cấp, tạo dữ liệu thử trên môi trường UAT, ghi lại kết quả và báo lỗi đúng cách. '
      + 'Phần chính là checklist nhanh — khoảng **35–45 phút** cho mỗi tài khoản. Phụ lục là bộ kiểm thử đầy đủ dành cho điều phối viên.',
    strip: [
      ['Môi trường', 'medtest.bms7.net — UAT, tách khỏi production'],
      ['Dữ liệu thử', 'Bắt buộc tiền tố UAT_TEST'],
      ['Dành cho', 'Sale · Quản lý · Điều phối viên'],
    ],
  },

  toc: [
    ['01', 'Trước khi bắt đầu', 'chuan-bi'],
    ['02', 'Quy tắc dữ liệu thử', 'quy-tac-du-lieu'],
    ['03', 'Quy trình một câu hỏi', 'quy-trinh'],
    ['04', 'Kiểm tra chung cho mọi tài khoản', 'kiem-tra-chung'],
    ['05', 'Bộ câu hỏi bắt buộc', 'bo-cau-hoi'],
    ['06', 'Câu hỏi theo vai trò', 'theo-vai'],
    ['07', 'Tạo khách và đơn hàng thử', 'tao-du-lieu'],
    ['08', 'Cách đọc kết quả', 'doc-ket-qua'],
    ['09', 'Khi gặp lỗi', 'gap-loi'],
    ['10', 'Việc không được làm', 'khong-lam'],
    ['11', 'Phiếu ghi kết quả', 'phieu'],
    ['PL', 'Phụ lục kiểm thử đầy đủ', 'phu-luc'],
  ],

  sections: [
    /* ── 01 ─────────────────────────────────────────────────────────── */
    {
      id: 'chuan-bi', num: '01', title: 'Trước khi bắt đầu',
      intro: 'Làm đủ năm việc dưới đây rồi mới chạy câu hỏi đầu tiên. Bỏ qua bước nào cũng dễ dẫn tới kết quả sai mà không phải lỗi hệ thống.',
      blocks: [
        {
          t: 'checks', key: 'p', items: [
            '**Xác nhận đang ở môi trường UAT.** Điều phối viên phải xác nhận bằng văn bản rằng môi trường và cơ sở dữ liệu đã tách khỏi hệ thống thật trước khi bạn tạo bất kỳ dữ liệu nào.',
            '**Mở bằng cửa sổ ẩn danh mới.** Mỗi tài khoản một cửa sổ riêng. Không dùng lại cửa sổ của tài khoản trước — dữ liệu cũ còn trong bộ nhớ đệm có thể hiển thị nhầm.',
            '**Đăng nhập bằng đúng tài khoản được giao.** Điều phối viên sẽ cấp tài khoản, mã khách hàng đại diện và mã sản phẩm đại diện cho bạn.',
            '**Kiểm tra tên và vai trò hiển thị ở góc màn hình.** Sai tên nghĩa là đăng nhập nhầm — đăng xuất và làm lại.',
            '**Chuẩn bị chỗ ghi kết quả.** Dùng phiếu ở mục 11, hoặc bản in của tài liệu này.',
          ],
        },
        {
          t: 'kv', title: 'Thông tin buổi test', items: [
            ['Tài khoản', ''],
            ['Vai trò', ''],
            ['Miền / tuyến được giao', ''],
            ['Mã khách đại diện', '— thay vào chỗ ghi `MÃ KHÁCH` trong các câu hỏi'],
            ['Mã sản phẩm đại diện', '— thay vào chỗ ghi `MÃ SẢN PHẨM`'],
            ['Số hóa đơn đại diện', '— thay vào chỗ ghi `SỐ HÓA ĐƠN`'],
            ['Ngày giờ test', ''],
            ['Người thực hiện', ''],
          ],
        },
      ],
    },

    /* ── 02 ─────────────────────────────────────────────────────────── */
    {
      id: 'quy-tac-du-lieu', num: '02', title: 'Quy tắc dữ liệu thử',
      intro: 'Buổi test này có tạo khách hàng và đơn hàng thật trên cơ sở dữ liệu UAT. Bảy quy tắc dưới đây là bắt buộc.',
      blocks: [
        {
          t: 'note', kind: 'stop',
          text: '**Chỉ thực hiện trên môi trường UAT đã được xác nhận tách khỏi production.** Chưa có xác nhận thì không tạo bất kỳ dữ liệu nào.',
        },
        {
          t: 'ol', items: [
            'Mọi dữ liệu bạn tạo phải có tiền tố `UAT_TEST` trong mã hoặc tên.',
            'Không nhập tên, số điện thoại, địa chỉ hay bất kỳ thông tin nào của khách hàng thật.',
            'Không chốt đơn và không gửi đơn sang hệ thống khác.',
            'Giá và khuyến mãi chỉ thử theo đúng kịch bản được giao.',
            'Không sửa cấu hình dùng chung nằm ngoài phạm vi UAT.',
            'Ghi lại mã khách, mã đơn và cấu hình đã tạo để đội dự án dọn dữ liệu sau kiểm thử.',
            'Nếu thấy dữ liệu nằm ngoài phạm vi tài khoản của bạn: **dừng test và báo ngay**, không thử tiếp.',
          ],
        },
      ],
    },

    /* ── 03 ─────────────────────────────────────────────────────────── */
    {
      id: 'quy-trinh', num: '03', title: 'Quy trình một câu hỏi',
      intro: 'Chạy đúng thứ tự này cho mọi câu hỏi, để kết quả giữa 13 tài khoản đối chiếu được với nhau.',
      blocks: [
        { t: 'figure', svg: SVG_FLOW_5, png: 'assets/so_do_quy_trinh_5_buoc.png', caption: 'Năm bước áp dụng cho mọi câu hỏi trong tài liệu.' },
        {
          t: 'figure', img: '01_MAN_HINH_TRO_LY_AI_SAU_DANG_NHAP.png',
          alt: 'Màn hình Trợ lý AI của Medstand sau khi đăng nhập, gồm thanh điều hướng, các chức năng gợi ý và khung nhập câu hỏi',
          caption: 'Màn hình Trợ lý AI sau khi đăng nhập. Người test nhập câu hỏi tại khung ở cuối màn hình hoặc chọn một chức năng gợi ý.',
        },
      ],
    },

    /* ── 04 ─────────────────────────────────────────────────────────── */
    {
      id: 'kiem-tra-chung', num: '04', title: 'Kiểm tra chung cho mọi tài khoản',
      intro: 'Mười điểm này áp dụng cho cả 13 tài khoản, không phụ thuộc vai trò. Đánh dấu trước khi chuyển sang bộ câu hỏi.',
      blocks: [
        {
          t: 'checks', key: 'c', items: [
            '**Đăng nhập hiển thị đúng tên và đúng vai trò** của tài khoản được giao.',
            '**Mở được màn hình Trợ lý AI** và khung nhập câu hỏi hoạt động.',
            '**Menu và nút chức năng đúng với vai trò** — Sale không thấy chức năng chỉ dành cho Quản lý.',
            '**Không xem được khách, đơn hàng hay dữ liệu ngoài phạm vi** được phân quyền.',
            '**Cùng một câu hỏi, Sale và Quản lý trả đúng phạm vi tương ứng** — không ai thấy miền khác.',
            '**Đăng xuất rồi đăng nhập tài khoản khác không còn dữ liệu cũ** trên màn hình.',
            '**Chế độ sáng / tối và trạng thái giao diện hoạt động** đúng, chữ vẫn đọc được ở cả hai chế độ.',
            '**Loading xuất hiện ngay khi gửi câu hỏi**, không để màn hình trống không phản hồi.',
            '**Danh sách dài có tìm kiếm, phân trang hoặc cuộn** hợp lý, không đổ hết ra một trang.',
            '**Ngày, tiền, mã sản phẩm, mã lô và số điện thoại hiển thị đúng định dạng** — ngày `dd/MM/yyyy`, tiền có đơn vị.',
          ],
        },
      ],
    },

    /* ── 05 ─────────────────────────────────────────────────────────── */
    {
      id: 'bo-cau-hoi', num: '05', title: 'Bộ câu hỏi bắt buộc',
      intro: 'Chạy đủ cả 11 câu, theo thứ tự. Chép nguyên văn — chỉ thay `MÃ KHÁCH` bằng mã được giao.',
      blocks: [
        {
          t: 'note', kind: 'info',
          text: '**Gõ đúng nguyên văn.** Trợ lý hiểu theo cách diễn đạt, nên đổi chữ có thể ra kết quả khác. Nếu muốn thử cách nói khác, cứ thử — nhưng ghi vào phần Ghi chú, đừng thay câu chuẩn.',
        },
        { t: 'questions', items: CORE_QUESTIONS },
      ],
    },

    /* ── 06 ─────────────────────────────────────────────────────────── */
    {
      id: 'theo-vai', num: '06', title: 'Câu hỏi theo vai trò',
      intro: 'Chạy thêm phần ứng với vai trò của tài khoản bạn đang dùng.',
      blocks: [
        {
          t: 'figure', svg: SVG_ROLES, png: 'assets/so_do_pham_vi_vai_tro.png',
          caption: 'Cùng một câu hỏi, hai vai trò phải ra phạm vi dữ liệu khác nhau. Đây là điểm cần kiểm kỹ.',
        },
        {
          t: 'grid2', cards: [
            {
              title: 'Nếu bạn là Sale', color: 'brand',
              questions: ['Chấm điểm khách hàng của tôi', `Hôm nay bán gì cho khách ${MA_KH}?`],
              note: 'Kiểm kỹ: không câu nào được trả về khách ngoài tuyến của bạn.',
            },
            {
              title: 'Nếu bạn là Quản lý', color: 'accent',
              questions: ['Chấm điểm khách hàng của tôi', 'Sản phẩm nào cần xem xét khuyến mãi?'],
              note: 'Danh sách khuyến mãi chỉ là đề xuất để xem xét, chưa phải chương trình đã duyệt.',
            },
          ],
        },
      ],
    },

    /* ── 07 ─────────────────────────────────────────────────────────── */
    {
      id: 'tao-du-lieu', num: '07', title: 'Tạo khách và đơn hàng thử',
      intro: 'Phần này tạo dữ liệu thật trên cơ sở dữ liệu UAT. Làm theo đúng thứ tự, từng bước chi tiết nằm ở Phụ lục C và D.',
      blocks: [
        {
          t: 'note', kind: 'info',
          text: 'Đọc lại **mục 02 — Quy tắc dữ liệu thử** trước khi bắt đầu. Mọi mã khách và mã đơn tạo ra phải được ghi lại để dọn sau kiểm thử.',
        },
        {
          t: 'ol', items: [
            '**Tạo khách hàng UAT.** Mở chức năng thêm khách hàng, thử bỏ trống trường bắt buộc và nhập sai định dạng trước, rồi mới tạo khách hợp lệ có mã bắt đầu bằng `UAT_TEST`. Chi tiết: Phụ lục C.',
            '**Tìm lại khách vừa tạo** và kiểm tra Sale / Quản lý chỉ thấy đúng theo phạm vi.',
            '**Thử tạo trùng mã** để xem hệ thống có cảnh báo không.',
            '**Tạo đơn hàng UAT** cho khách vừa tạo. Thử xác nhận khi chưa có khách hoặc chưa có sản phẩm, thử số lượng 0, số âm và vượt tồn trước khi tạo đơn hợp lệ. Chi tiết: Phụ lục D.',
            '**Kiểm tra đơn giá, số lượng, thành tiền và tổng tiền** khớp bảng giá đối chiếu.',
            '**Xác nhận tạo đơn một lần**, rồi bấm gửi thêm vài lần để chắc chắn không tạo đơn trùng.',
            '**Đối chiếu lại sau khi tạo** — tra cứu khách, đơn hàng, tồn kho và doanh số theo Phụ lục F.',
            '**Ghi lại toàn bộ mã khách và mã đơn** vào biên bản UAT.',
          ],
        },
        {
          t: 'note', kind: 'go',
          text: '**Không mặc định đơn vừa tạo phải làm tăng doanh số.** Doanh số chỉ thay đổi nếu trạng thái đơn được thiết kế để ghi nhận doanh số — phải căn cứ trạng thái nghiệp vụ của hệ thống, không suy đoán.',
        },
      ],
    },

    /* ── 08 ─────────────────────────────────────────────────────────── */
    {
      id: 'doc-ket-qua', num: '08', title: 'Cách đọc kết quả',
      intro: 'Bốn điều cần kiểm ở mỗi câu trả lời, trước khi kết luận đạt hay chưa đạt.',
      blocks: [
        {
          t: 'table', head: ['Kiểm gì', 'Đạt khi', 'Báo lỗi khi'], widths: [18, 41, 41],
          rows: [
            ['**Đúng phạm vi**', 'Chỉ có khách, nhân viên, kho thuộc quyền của tài khoản đang dùng.',
              'Xuất hiện bất kỳ đối tượng nào ở miền khác — đây là lỗi nghiêm trọng nhất, dừng test và báo ngay.'],
            ['**Đúng câu hỏi**', 'Trả lời đúng thứ đã hỏi, đúng khoảng thời gian đã nêu.',
              'Hỏi tháng này ra tháng khác, hỏi khách A ra khách B, hoặc định tuyến sang chức năng khác.'],
            ['**Đọc hiểu được**', 'Tiếng Việt rõ ràng, ngày dạng `dd/MM/yyyy`, tiền có đơn vị.',
              'Hiện tên cột tiếng Anh, mã kỹ thuật, lỗi raw hoặc chữ bị lỗi font.'],
            ['**Trung thực**', 'Không có dữ liệu thì nói rõ là chưa có.',
              'Biến chưa có dữ liệu thành 0 hoặc hết hàng; khẳng định tư vấn chuyên môn về thuốc.'],
          ],
        },
        {
          t: 'note', kind: 'go',
          text: '**Không có dữ liệu không phải là lỗi.** Khách chưa phát sinh giao dịch thì trợ lý báo không có là đúng. Chỉ ghi lỗi khi bạn *chắc chắn* dữ liệu đó có thật trong phạm vi của mình.',
        },
        {
          t: 'sub', title: 'Mười điểm chất lượng kết quả',
          text: 'Với các ca ở phụ lục, kiểm thêm mười điểm sau trước khi ghi Đạt.',
        },
        {
          t: 'ol', items: [
            'Đúng chức năng, không định tuyến nhầm sang chức năng khác.',
            'Tiêu đề và tên thao tác đúng với việc vừa yêu cầu.',
            'Có lại từ khóa hoặc câu truy vấn người dùng vừa nhập.',
            'Có khoảng thời gian và thời điểm cập nhật khi câu hỏi cần đến thời gian.',
            'Có nguồn hoặc trạng thái dữ liệu rõ ràng.',
            'Số tổng khớp với bảng chi tiết bên dưới.',
            'Danh sách dễ tìm kiếm, lọc và phân trang.',
            'Không hiển thị field kỹ thuật hoặc lỗi raw.',
            'Không khẳng định tư vấn chuyên môn về thuốc.',
            'Có mã tra cứu hoặc requestId khi xảy ra lỗi.',
          ],
        },
        {
          t: 'figure', img: '02_KET_QUA_DOANH_SO_DUNG.png',
          alt: 'Ví dụ kết quả truy vấn doanh số đội ngũ gồm kỳ báo cáo, số liệu tổng quan và bảng chi tiết theo nhân viên',
          caption: 'Ví dụ kết quả doanh số đúng: có khoảng thời gian, số liệu tổng quan, nguồn dữ liệu và bảng chi tiết để đối chiếu.',
        },
      ],
    },

    /* ── 09 ─────────────────────────────────────────────────────────── */
    {
      id: 'gap-loi', num: '09', title: 'Khi gặp lỗi',
      intro: 'Thử theo thứ tự này trước khi báo. Phần lớn trường hợp tự xử lý được ở hai bước đầu.',
      blocks: [
        {
          t: 'figure', svg: SVG_ERROR_TREE, png: 'assets/so_do_cay_quyet_dinh_loi.png',
          caption: 'Nếu màn hình hiện **Mã tra cứu**, hãy chép lại — đội kỹ thuật dùng nó để tìm đúng lần chạy bị lỗi.',
        },
        {
          t: 'sub', title: 'Một báo lỗi đủ dùng cần có',
          text: 'Thiếu một trong chín mục này thì đội kỹ thuật không tái hiện được lỗi.',
        },
        {
          t: 'ol', items: [
            'Tài khoản và vai trò — **không ghi mật khẩu**.',
            'Thời điểm xảy ra, ghi cả giờ phút.',
            'Mã ca kiểm thử, ví dụ `CN-07-B`.',
            'Câu hỏi hoặc thao tác nguyên văn bạn đã thực hiện.',
            'Mã khách, mã sản phẩm hoặc mã đơn liên quan.',
            'Kết quả thực tế nhận được.',
            'Kết quả mong đợi theo bạn.',
            'Ảnh chụp toàn màn hình, thấy được cả thông báo lỗi.',
            'Mã tra cứu hoặc requestId nếu màn hình có hiện.',
          ],
        },
        {
          t: 'sub', title: 'Quy tắc đặt tên ảnh',
          text: 'Đặt tên đúng quy tắc để điều phối viên ghép ảnh với ca kiểm thử mà không cần hỏi lại.',
        },
        { t: 'codeblock', text: 'YYYYMMDD_TAIKHOAN_CASEID_PASS-FAIL.png' },
        { t: 'p', text: 'Ví dụ: `20260727_NAMDINHB.MED_CN-07-B_FAIL.png`' },
      ],
    },

    /* ── 10 ─────────────────────────────────────────────────────────── */
    {
      id: 'khong-lam', num: '10', title: 'Việc không được làm',
      intro: null,
      blocks: [
        {
          t: 'note', kind: 'stop',
          text: '**Đây là bản chạy thử.** Số liệu dùng để kiểm tra hệ thống, không phải số liệu kinh doanh chính thức. Đừng dùng kết quả ở đây để chốt đơn hay báo cáo.',
        },
        {
          t: 'ul', items: [
            'Không tạo dữ liệu khi chưa có xác nhận môi trường UAT đã tách khỏi hệ thống thật.',
            'Không dùng tên, số điện thoại, địa chỉ của khách hàng thật cho dữ liệu thử.',
            'Không chốt hoặc gửi đơn UAT sang hệ thống khác.',
            'Không thử giá và khuyến mãi ngoài kịch bản được giao; không sửa cấu hình dùng chung.',
            'Không dùng tài khoản Admin để chạy thay — làm vậy sẽ che mất lỗi phân quyền, đúng thứ buổi test này cần tìm.',
            'Không dùng chung một cửa sổ trình duyệt cho hai tài khoản.',
            'Không tự sửa dữ liệu để màn hình có kết quả đẹp.',
            'Không coi nội dung về thuốc và sản phẩm do AI trả về là tư vấn chuyên môn. Luôn kiểm lại với người có thẩm quyền.',
            'Không gửi mật khẩu hay ảnh có chứa thông tin nhạy cảm của khách vào nhóm chung.',
          ],
        },
      ],
    },

    /* ── 11 ─────────────────────────────────────────────────────────── */
    {
      id: 'phieu', num: '11', title: 'Phiếu ghi kết quả',
      intro: 'Điền cho từng câu hỏi ở mục 05 và 06. Bản in dùng được trực tiếp.',
      blocks: [
        {
          t: 'legend', items: [
            ['pass', 'Đạt', 'Đúng dữ liệu, đúng quyền và đúng giao diện'],
            ['fail', 'Chưa đạt', 'Chạy được nhưng dữ liệu, quyền hoặc hiển thị sai'],
            ['hold', 'Chưa chạy được', 'Hệ thống báo lỗi hoặc không có phản hồi'],
            ['na', 'Không áp dụng', 'Tài khoản / vai trò không có chức năng này'],
          ],
        },
        {
          t: 'table', head: ['Câu', 'Nội dung', 'Kết quả', 'Ghi chú / Mã tra cứu'], widths: [7, 51, 20, 22],
          rows: [
            ['01', 'Hôm nay tôi nên làm gì?', '', ''],
            ['02', 'Hôm nay tôi nên ghé khách nào?', '', ''],
            ['03', 'Danh sách khách thuộc tuyến', '', ''],
            ['04', 'Khách nào lâu chưa mua?', '', ''],
            ['05', 'Doanh số hôm nay', '', ''],
            ['06', 'Doanh số 09/07 – 20/07', '', ''],
            ['07', 'Công nợ khách đại diện', '', ''],
            ['08', 'Chi tiết đi (câu tiếp nối)', '', ''],
            ['09', 'Gợi ý đơn hàng', '', ''],
            ['10', 'Gợi ý bán kèm', '', ''],
            ['11', 'Tồn kho A003', '', ''],
            ['12', 'Câu riêng theo vai trò', '', ''],
            ['13', 'Câu riêng theo vai trò', '', ''],
          ],
        },
        {
          t: 'kv', title: 'Xác nhận hoàn thành', items: [
            ['Tổng số câu Đạt', '/ 13'],
            ['Kiểm tra chung mục 04 đã làm đủ', ''],
            ['Đã tạo khách UAT_TEST — mã', ''],
            ['Đã tạo đơn UAT_TEST — mã', ''],
            ['Lỗi nghiêm trọng phát hiện', ''],
            ['Người thực hiện', ''],
            ['Chữ ký · Ngày', ''],
          ],
        },
        {
          t: 'p',
          text: 'Nộp phiếu cho điều phối viên ngay sau khi chạy xong, kèm ảnh chụp các trường hợp Chưa đạt và Chưa chạy được.',
          muted: true,
        },
      ],
    },
  ],

  appendix: {
    id: 'phu-luc',
    title: 'Phụ lục kiểm thử đầy đủ',
    intro:
      'Phần này dành cho điều phối viên và người kiểm thử được phân công chạy sâu. Mỗi bảng dùng chung một bộ cột để tổng hợp về một file duy nhất.',
    parts: [
      {
        id: 'pl-a', label: 'A', title: '24 chức năng hội thoại',
        intro:
          'Mỗi chức năng có ba ca: ca chính, ca thiếu tham số và ca biên. '
          + 'Thay `MÃ KHÁCH`, `MÃ SẢN PHẨM`, `SỐ HÓA ĐƠN` bằng mã đại diện được giao. '
          + 'Mọi câu hỏi mẫu ở đây đều đã được kiểm chứng là định tuyến đúng chức năng.',
        head: TRACK_HEAD, widths: TRACK_WIDTHS, rows: functionRows(),
      },
      {
        id: 'pl-b', label: 'B', title: 'Ca kiểm thử biên',
        intro: 'Các trường hợp dễ vỡ nhất. Chạy sau khi bộ 24 chức năng đã qua.',
        head: TRACK_HEAD, widths: TRACK_WIDTHS, rows: trackRows(EDGE_CASES),
      },
      {
        id: 'pl-c', label: 'C', title: 'Luồng tạo khách hàng UAT',
        intro: 'Chạy tuần tự KH-01 đến KH-10. Không bỏ bước kiểm tra ràng buộc trước khi tạo khách hợp lệ.',
        head: TRACK_HEAD, widths: TRACK_WIDTHS, rows: trackRows(CUSTOMER_FLOW),
        pass: CUSTOMER_FLOW_PASS,
      },
      {
        id: 'pl-d', label: 'D', title: 'Luồng tạo đơn hàng UAT',
        intro: 'Chạy sau khi luồng C đã tạo được khách UAT_TEST.',
        head: TRACK_HEAD, widths: TRACK_WIDTHS, rows: trackRows(ORDER_FLOW),
        pass: ORDER_FLOW_PASS,
      },
      {
        id: 'pl-e', label: 'E', title: 'Kiểm tra giá và khuyến mãi',
        intro: 'Chỉ thử theo kịch bản khuyến mãi UAT được giao.',
        head: TRACK_HEAD, widths: TRACK_WIDTHS, rows: trackRows(PROMO_CASES),
      },
      {
        id: 'pl-f', label: 'F', title: 'Đối chiếu sau khi tạo dữ liệu',
        intro: 'Chạy ngay sau khi luồng C và D hoàn tất, khi dữ liệu vừa tạo còn mới.',
        head: TRACK_HEAD, widths: TRACK_WIDTHS, rows: trackRows(RECONCILE_CASES),
      },
    ],
    completion: {
      id: 'pl-g', label: 'G', title: 'Điều kiện hoàn tất UAT',
      intro: 'Chỉ xác nhận hoàn tất khi đủ cả bảy điều kiện dưới đây.',
      items: [
        'Cả 13 tài khoản đã kiểm tra đăng nhập và phạm vi dữ liệu.',
        'Cả 24 chức năng đã có người kiểm tra theo vai trò phù hợp.',
        'Luồng tạo khách và luồng tạo đơn UAT đã chạy thành công.',
        'Không có lỗi rò rỉ dữ liệu giữa nhân viên, miền hoặc vai trò.',
        'Không có lỗi nghiêm trọng ở doanh số, công nợ, tồn kho và phân quyền.',
        'Toàn bộ dữ liệu `UAT_TEST` đã được ghi nhận đầy đủ để dọn.',
        'Bản Word và bản HTML có nội dung, thứ tự và hình ảnh đồng nhất.',
      ],
    },
  },
};

module.exports = {
  document,
  FUNCTIONS,
  EDGE_CASES,
  CUSTOMER_FLOW,
  ORDER_FLOW,
  PROMO_CASES,
  RECONCILE_CASES,
  CORE_QUESTIONS,
  MA_KH,
  MA_SP,
  MA_HD,
};
