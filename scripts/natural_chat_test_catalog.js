'use strict';

const classifierCases = [];

function addClassifierCases(group, inputs, expected) {
  for (const input of inputs) classifierCases.push({ group, input, ...expected });
}

addClassifierCases('casual-greeting', [
  'xin chào', 'chào', 'chào bot', 'hello', 'hi', 'alo', 'ê', 'ê bạn', 'chào trợ lý',
], { messageType: 'CASUAL', intent: null, action: 'NO_API' });

addClassifierCases('casual-thanks', [
  'cảm ơn', 'cảm ơn nha', 'cảm ơn bạn', 'thanks', 'thank you',
], { messageType: 'CASUAL', intent: null, action: 'NO_API' });

addClassifierCases('identity-and-scope', [
  'bạn là ai', 'bot là ai', 'Medstand AI là gì', 'tui là ai', 'tôi là ai',
  'tên tôi là gì', 'tôi đang đăng nhập tài khoản nào', 'vai trò của tôi là gì',
  'tôi là sale hay quản lý', 'tôi được xem dữ liệu nào', 'phạm vi của tôi',
  'khu vực của tôi', 'ý là tôi hỏi tôi là ai', 'tôi chứ tôi không hỏi bạn',
  'bạn làm được gì', 'chức năng của bạn', 'bạn có hiểu tôi không',
], { messageType: 'CASUAL_META', intent: null, action: 'NO_API' });

addClassifierCases('debt-detail', [
  'xem công nợ AG0031', 'công nợ AG0031', 'coi công nợ AG0031',
  'coi cn kh AG0031', 'cn kh AG0031', 'xem cn kh AG0031',
  'xem công nợ khách AG0031', 'chi tiết công nợ AG0031',
  'cho tôi xem công nợ AG0031', 'kiểm tra công nợ AG0031',
], {
  messageType: 'BUSINESS', intent: 'CUSTOMER_DEBT_DETAIL', apiCode: '@cong_no_chi_tiet',
  action: 'EXECUTE', entity: ['customerId', 'AG0031'],
});

addClassifierCases('debt-missing-customer', [
  'xem công nợ', 'coi công nợ', 'kiểm tra công nợ', 'cn kh',
], {
  messageType: 'BUSINESS', intent: 'CUSTOMER_DEBT_DETAIL', apiCode: '@cong_no_chi_tiet',
  action: 'ASK_FIELD', missingField: 'customerId',
});

addClassifierCases('inventory', [
  'tồn kho A003', 'kiểm tra tồn kho A003', 'xem tồn kho A003',
  'sp A003 tồn kho', 'tồn kho sản phẩm A003', 'coi tồn kho A003',
  'A003 còn bao nhiêu', 'A003 còn hàng không', 'trong kho còn A003 không',
], {
  messageType: 'BUSINESS', intent: 'INVENTORY_LIST', apiCode: '@danh_sach_tonkho',
  action: 'EXECUTE', entity: ['searchTerm', 'A003'],
});

addClassifierCases('inventory-missing-product', [
  'xem tồn kho', 'kiểm tra tồn kho', 'tồn kho còn bao nhiêu', 'coi tồn kho giúp',
], {
  messageType: 'BUSINESS', intent: 'INVENTORY_LIST', apiCode: '@danh_sach_tonkho',
  action: 'ASK_FIELD', missingField: 'searchTerm',
});

addClassifierCases('order-recommendation', [
  'gợi ý đơn hàng cho NDB001', 'xem gợi ý đơn hàng NDB001',
  'gợi ý đơn hàng khách NDB001', 'coi gợi ý đơn hàng cho NDB001',
  'NDB001 nên nhập gì', 'NDB001 nên lấy gì', 'đề xuất hàng cho NDB001',
], {
  messageType: 'BUSINESS', intent: 'ORDER_RECOMMENDATION', apiCode: '@goi_ydon_hang',
  action: 'EXECUTE', entity: ['customerId', 'NDB001'],
});

addClassifierCases('order-recommendation-missing-customer', [
  'gợi ý đơn hàng', 'xem gợi ý đơn hàng', 'gợi ý đơn hàng cho khách',
], {
  messageType: 'BUSINESS', intent: 'ORDER_RECOMMENDATION', apiCode: '@goi_ydon_hang',
  action: 'ASK_FIELD', missingField: 'customerId',
});

addClassifierCases('invoice-detail', [
  'chi tiết hóa đơn HD123', 'xem chi tiết hóa đơn HD123',
  'coi chi tiết hóa đơn HD123', 'chi tiết hóa đơn INV000123',
], {
  messageType: 'BUSINESS', intent: 'INVOICE_DETAIL', apiCode: '@hoa_don_chi_tiet',
  action: 'EXECUTE', entity: ['documentId', null],
});

addClassifierCases('invoice-detail-missing-document', [
  'xem chi tiết hóa đơn', 'chi tiết hóa đơn', 'coi chi tiết hóa đơn',
], {
  messageType: 'BUSINESS', intent: 'INVOICE_DETAIL', apiCode: '@hoa_don_chi_tiet',
  action: 'ASK_FIELD', missingField: 'documentId',
});

addClassifierCases('sales-revenue', [
  'doanh số hôm nay', 'doanh thu hôm nay', 'doanh số tháng này',
  'xem doanh số', 'coi doanh thu', 'doanh số tuần này', 'doanh thu quý này',
  'doanh số từ đầu năm', 'tổng doanh số hiện tại', 'doanh số tháng trước',
  'doanh thu tuần trước',
], {
  messageType: 'BUSINESS', intent: 'SALES_REVENUE', apiCode: '@doanh_so', action: 'EXECUTE',
});

addClassifierCases('sales-revenue-explicit-date-range', [
  'Doanh số từ 09/07/2026 đến 20/07/2026 của tôi là bao nhiêu?',
], {
  messageType: 'BUSINESS', intent: 'SALES_REVENUE', apiCode: '@doanh_so', action: 'EXECUTE',
  entity: ['fromDate', '2026-07-09'], releaseGate: true,
});

addClassifierCases('daily-work-route', [
  'Hôm nay tôi nên làm gì?', 'Nay tôi làm gì?',
  'Công việc hôm nay của tôi là gì?', 'Hôm nay tôi nên ghé khách nào?',
  'Hôm nay đi đâu?', 'Hôm nay ghé ai?',
  'Cho tôi danh sách khách thuộc tuyến của tôi', 'Danh sách khách thuộc tuyến',
  'Khách hàng trong tuyến của tôi',
], {
  messageType: 'BUSINESS', intent: 'SALES_ROUTE', apiCode: '@tuyen_ban_hang',
  action: 'EXECUTE', releaseGate: true,
});

addClassifierCases('reported-route-regressions', ['xem đơn hàng tháng này'], {
  messageType: 'BUSINESS', intent: 'ORDER_LIST', apiCode: '@don_hang', action: 'EXECUTE',
});
addClassifierCases('reported-route-regressions', ['công nợ khách hàng'], {
  messageType: 'BUSINESS', intent: 'CUSTOMER_DEBT_SUMMARY', apiCode: '@cong_no_khach_hang', action: 'EXECUTE',
});
addClassifierCases('reported-route-regressions', ['xem danh mục kho hàng'], {
  messageType: 'BUSINESS', intent: 'CATALOG_LOOKUP', apiCode: '@danh_muc', action: 'EXECUTE',
  entity: ['catalogType', 'khohang'],
});
addClassifierCases('reported-route-regressions', ['tìm sản phẩm A003'], {
  messageType: 'BUSINESS', intent: 'PRODUCT_SEARCH', apiCode: '@tra_cuu_san_pham', action: 'EXECUTE',
  entity: ['searchTerm', 'A003'],
});
addClassifierCases('reported-route-regressions', ['thông tin sản phẩm A003', 'sản phẩm A003'], {
  messageType: 'BUSINESS', intent: 'PRODUCT_SEARCH', apiCode: '@tra_cuu_san_pham', action: 'EXECUTE',
  entity: ['searchTerm', 'A003'],
});
addClassifierCases('reported-route-regressions', ['gợi ý bán kèm cho AG0031'], {
  messageType: 'BUSINESS', intent: 'UPSELL_RECOMMENDATION', apiCode: '@upsell_goi_y', action: 'EXECUTE',
  entity: ['customerId', 'AG0031'],
});
addClassifierCases('reported-route-regressions', ['Gợi ý bán kèm cho khách NDB001'], {
  messageType: 'BUSINESS', intent: 'UPSELL_RECOMMENDATION', apiCode: '@upsell_goi_y', action: 'EXECUTE',
  entity: ['customerId', 'NDB001'], releaseGate: true,
});
addClassifierCases('reported-route-regressions', [
  'bán thêm gì cho NDB001', 'kèm thêm gì cho NDB001',
], {
  messageType: 'BUSINESS', intent: 'UPSELL_RECOMMENDATION', apiCode: '@upsell_goi_y',
  action: 'EXECUTE', entity: ['customerId', 'NDB001'], releaseGate: true,
});
addClassifierCases('reported-route-regressions', ['Hôm nay bán gì cho khách NDB001'], {
  messageType: 'BUSINESS', intent: 'ORDER_RECOMMENDATION', apiCode: '@goi_ydon_hang', action: 'EXECUTE',
  entity: ['customerId', 'NDB001'], releaseGate: true,
});
addClassifierCases('reported-route-regressions', ['Khách nào lâu chưa mua?'], {
  messageType: 'BUSINESS', intent: 'SALES_ROUTE', apiCode: '@tuyen_ban_hang', action: 'EXECUTE',
  entity: ['absentDays', 30], releaseGate: true,
});
addClassifierCases('reported-route-regressions', [
  'Khách nào cần gọi lại?', 'Danh sách khách bỏ mua',
], {
  messageType: 'BUSINESS', intent: 'SALES_ROUTE', apiCode: '@tuyen_ban_hang',
  action: 'EXECUTE', entity: ['absentDays', 30], releaseGate: true,
});
addClassifierCases('reported-route-regressions', ['xem tích lũy của AG0031'], {
  messageType: 'BUSINESS', intent: 'LOYALTY_PROGRESS', apiCode: '@tich_luy', action: 'EXECUTE',
  entity: ['customerId', 'AG0031'],
});
addClassifierCases('reported-route-regressions', ['tìm sản phẩm theo triệu chứng ho'], {
  messageType: 'BUSINESS', intent: 'SYMPTOM_PRODUCT_SEARCH', apiCode: '@tim_san_pham_theo_trieu_chung', action: 'EXECUTE',
  entity: ['keyword', 'ho'],
});

addClassifierCases('survey-routing', ['xem khảo sát 360 của AG0031'], {
  messageType: 'BUSINESS', intent: 'SURVEY_360', apiCode: '@khao_sat360',
  action: 'EXECUTE', entity: ['customerId', 'AG0031'], releaseGate: true,
});

addClassifierCases('survey-routing', ['xem danh sách câu hỏi khảo sát của AG0031'], {
  messageType: 'BUSINESS', intent: 'SURVEY_QUESTIONS', apiCode: '@danh_sach_cau_hoi_khao_sat',
  action: 'EXECUTE', entity: ['customerId', 'AG0031'], releaseGate: true,
});

addClassifierCases('survey-routing', ['kiểm tra trạng thái khảo sát AG0031'], {
  messageType: 'BUSINESS', intent: 'SURVEY_STATUS', apiCode: '@kiem_tra_khao_sat',
  action: 'EXECUTE', entity: ['customerId', 'AG0031'], releaseGate: true,
});

addClassifierCases('survey-routing', ['hôm nay tôi đã khảo sát chưa'], {
  messageType: 'BUSINESS', intent: 'SURVEY_DAILY_STATUS', apiCode: '@kiem_tra_khao_sat_ngay',
  action: 'EXECUTE', releaseGate: true,
});

addClassifierCases('survey-routing', ['xem lịch sử khảo sát AG0031'], {
  messageType: 'BUSINESS', intent: 'SURVEY_HISTORY', apiCode: '@lich_su_khao_sat',
  action: 'EXECUTE', releaseGate: true,
});

addClassifierCases('survey-missing-customer', ['xem khảo sát 360'], {
  messageType: 'BUSINESS', intent: 'SURVEY_360', apiCode: '@khao_sat360',
  action: 'ASK_FIELD', missingField: 'customerId',
});
addClassifierCases('survey-missing-customer', ['xem danh sách câu hỏi khảo sát'], {
  messageType: 'BUSINESS', intent: 'SURVEY_QUESTIONS', apiCode: '@danh_sach_cau_hoi_khao_sat',
  action: 'ASK_FIELD', missingField: 'customerId',
});
addClassifierCases('survey-missing-customer', ['kiểm tra trạng thái khảo sát'], {
  messageType: 'BUSINESS', intent: 'SURVEY_STATUS', apiCode: '@kiem_tra_khao_sat',
  action: 'ASK_FIELD', missingField: 'customerId',
});
addClassifierCases('survey-routing', ['xem lịch sử khảo sát'], {
  messageType: 'BUSINESS', intent: 'SURVEY_HISTORY', apiCode: '@lich_su_khao_sat',
  action: 'EXECUTE', releaseGate: true,
});

addClassifierCases('follow-up-without-context', [
  'tháng trước thì sao', 'tuần trước thì sao', 'chi tiết hơn',
  'còn cái này', 'cùng kỳ trước', 'đổi sang khách',
], { messageType: 'FOLLOW_UP', intent: null, action: 'NO_API', hasContext: false });

addClassifierCases('follow-up-with-context', [
  'tháng trước thì sao', 'tuần trước thì sao', 'chi tiết hơn',
  'còn cái này', 'cùng kỳ trước', 'đổi sang khách',
], { messageType: 'FOLLOW_UP', intent: null, action: 'USE_CONTEXT', hasContext: true });

addClassifierCases('mutation-preview-only', [
  'tạo đơn hàng cho khách này', 'thêm đơn hàng mới', 'sửa hóa đơn HD123',
  'xóa khách hàng AG0031', 'duyệt khuyến mãi này', 'hủy đơn hàng này',
  'ghi dữ liệu khách hàng',
], { messageType: 'MUTATION_REQUEST', intent: null, action: 'NO_API' });

addClassifierCases('unsupported', [
  'thời tiết hôm nay thế nào', 'kết quả bóng đá tối qua', 'kết quả xổ số hôm nay',
  'viết giúp tôi bài thơ', 'dịch sang tiếng Anh câu này', 'giá vàng hôm nay',
  'chứng khoán hôm nay tăng không',
], { messageType: 'UNSUPPORTED', intent: null, action: 'NO_API' });

addClassifierCases('unknown', [
  'abc xyz 123', 'lorem ipsum', '12345', 'ờ cái gì ấy nhỉ', '',
], { messageType: 'UNKNOWN', intent: null, action: 'NO_API' });

// These cases represent the target contract discovered during UAT. They are
// intentionally strict: a release gate must fail if ordinary debt wording no
// longer reaches the same canonical API as @cong_no_chi_tiet.
addClassifierCases('debt-natural-target', [
  'AG0031 còn nợ bao nhiêu', 'AG0031 còn nợ nhiêu',
  'cho tui coi chi tiết nợ của AG0031',
  'nhà thuốc AG0031 còn khoản nào chưa trả',
  'khách AG0031 đã trả hết nợ chưa',
  'AG0031 còn phải trả bao nhiêu', 'AG0031 đang nợ gì',
], {
  messageType: 'BUSINESS', intent: 'CUSTOMER_DEBT_DETAIL', apiCode: '@cong_no_chi_tiet',
  action: 'EXECUTE', entity: ['customerId', 'AG0031'], releaseGate: true,
});

const liveCases = [
  { id: 'greeting', text: 'xin chào', kind: 'CASUAL', expectedApi: null, smoke: true },
  { id: 'identity', text: 'tôi là ai', kind: 'CASUAL_META', expectedApi: null, smoke: true },
  { id: 'capabilities', text: 'bạn làm được gì', kind: 'CASUAL_META', expectedApi: null },
  { id: 'sales-today', text: 'doanh số hôm nay', kind: 'BUSINESS', expectedApi: '@doanh_so', smoke: true },
  { id: 'sales-month', text: 'doanh số tháng này', kind: 'BUSINESS', expectedApi: '@doanh_so' },
  { id: 'invoice-list', text: 'xem hóa đơn tháng này', kind: 'BUSINESS', expectedApi: '@hoa_don' },
  { id: 'invoice-detail', text: 'xem chi tiết hóa đơn {{DOCUMENT_ID}}', kind: 'BUSINESS', expectedApi: '@hoa_don_chi_tiet' },
  { id: 'order-list', text: 'xem đơn hàng tháng này', kind: 'BUSINESS', expectedApi: '@don_hang' },
  { id: 'customer-score', text: 'chấm điểm khách hàng', kind: 'BUSINESS', expectedApi: '@cham_diem_kh' },
  { id: 'debt-summary', text: 'công nợ khách hàng', kind: 'BUSINESS', expectedApi: '@cong_no_khach_hang' },
  { id: 'debt-detail', text: 'coi cn kh {{CUSTOMER_ID}}', kind: 'BUSINESS', expectedApi: '@cong_no_chi_tiet', smoke: true },
  { id: 'debt-natural', text: '{{CUSTOMER_ID}} còn nợ bao nhiêu', kind: 'BUSINESS', expectedApi: '@cong_no_chi_tiet' },
  { id: 'loyalty', text: 'xem tích lũy của {{CUSTOMER_ID}}', kind: 'BUSINESS', expectedApi: '@tich_luy' },
  { id: 'route', text: 'xem tuyến bán hàng hôm nay', kind: 'BUSINESS', expectedApi: '@tuyen_ban_hang' },
  { id: 'order-recommendation', text: 'gợi ý đơn hàng cho {{CUSTOMER_ID}}', kind: 'BUSINESS', expectedApi: '@goi_ydon_hang', smoke: true },
  { id: 'upsell', text: 'gợi ý bán kèm cho {{CUSTOMER_ID}}', kind: 'BUSINESS', expectedApi: '@upsell_goi_y' },
  { id: 'prescription-bundle', text: 'gợi ý đơn thuốc cho sản phẩm {{PRODUCT_ID}}', kind: 'BUSINESS', expectedApi: '@goi_ydon_thuoc' },
  { id: 'inventory', text: 'kiểm tra tồn kho {{PRODUCT_ID}}', kind: 'BUSINESS', expectedApi: '@danh_sach_tonkho', smoke: true },
  { id: 'product-search', text: 'tìm sản phẩm {{PRODUCT_ID}}', kind: 'BUSINESS', expectedApi: '@tra_cuu_san_pham' },
  { id: 'focus-products', text: 'xem sản phẩm trọng tâm', kind: 'BUSINESS', expectedApi: '@san_pham_trong_tam' },
  { id: 'promotion-review', text: 'xem sản phẩm cần đề xuất khuyến mãi', kind: 'BUSINESS', expectedApi: '@de_xuat_khuyen_mai' },
  { id: 'catalog', text: 'xem danh mục kho hàng', kind: 'BUSINESS', expectedApi: '@danh_muc' },
  { id: 'survey-360', text: 'xem khảo sát 360 của {{CUSTOMER_ID}}', kind: 'BUSINESS', expectedApi: '@khao_sat360' },
  { id: 'survey-questions', text: 'xem danh sách câu hỏi khảo sát của {{CUSTOMER_ID}}', kind: 'BUSINESS', expectedApi: '@danh_sach_cau_hoi_khao_sat' },
  { id: 'survey-status', text: 'kiểm tra trạng thái khảo sát {{CUSTOMER_ID}}', kind: 'BUSINESS', expectedApi: '@kiem_tra_khao_sat' },
  { id: 'survey-daily', text: 'hôm nay tôi đã khảo sát chưa', kind: 'BUSINESS', expectedApi: '@kiem_tra_khao_sat_ngay' },
  { id: 'survey-history', text: 'xem lịch sử khảo sát {{CUSTOMER_ID}}', kind: 'BUSINESS', expectedApi: '@lich_su_khao_sat' },
  { id: 'notifications', text: 'xem thông báo của tôi', kind: 'BUSINESS', expectedApi: '@thong_bao' },
  { id: 'symptom-search', text: 'tìm sản phẩm theo triệu chứng ho', kind: 'BUSINESS', expectedApi: '@tim_san_pham_theo_trieu_chung' },
  { id: 'missing-customer', text: 'xem công nợ', kind: 'ASK_FIELD', expectedApi: '@cong_no_chi_tiet', allowClarification: true, smoke: true },
  { id: 'unsupported', text: 'thời tiết hôm nay thế nào', kind: 'UNSUPPORTED', expectedApi: null, smoke: true },
];

module.exports = { classifierCases, liveCases };
