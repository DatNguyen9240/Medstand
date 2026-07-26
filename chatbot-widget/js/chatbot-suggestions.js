/**
 * Chatbot Quick Suggestions (Tabbed Version)
 *
 * QUY TẮC: mọi `text` ở đây phải được bộ phân loại câu tự nhiên định tuyến thành công.
 * Nút gửi một câu mà classifier trả `supported=false` sẽ hiện "Tôi chưa hiểu rõ yêu cầu"
 * ngay khi người dùng bấm — lỗi này khách nhìn thấy đầu tiên.
 * Trước khi thêm nút mới, chạy thử câu đó qua `classifyNaturalMessage()`
 * trong `scripts/natural_chat_classifier.js`.
 */
window.CHAT_SUGGESTIONS = [
    { category: 'Công việc', label: 'Việc hôm nay', text: 'Hôm nay tôi nên làm gì?', icon: '✅' },
    // ══════════════════════════════════════
    //  📊 PHÂN TÍCH
    // ══════════════════════════════════════
    { category: 'Phân tích', label: 'Hôm nay', text: 'Doanh số hôm nay', icon: '📊' },
    { category: 'Phân tích', label: 'Tuần này', text: 'Doanh số tuần này', icon: '📊' },
    { category: 'Phân tích', label: 'Tháng này', text: 'Doanh số tháng này', icon: '📊' },
    { category: 'Phân tích', label: 'Tháng trước', text: 'Doanh số tháng trước', icon: '📊' },
    { category: 'Phân tích', label: 'Quý này', text: 'Doanh số quý này', icon: '📊' },
    { category: 'Phân tích', label: 'Năm nay', text: 'Doanh số năm nay', icon: '📊' },
    { category: 'Phân tích', label: 'Theo nhân viên', text: 'Doanh số theo nhân viên tháng này', icon: '👨‍💼' },
    { category: 'Phân tích', label: 'Theo khách hàng', text: 'Doanh số theo khách hàng tháng này', icon: '👤' },
    { category: 'Phân tích', label: 'Từ đầu năm', text: 'Doanh số từ ngày 01/01 đến hôm nay', icon: '📈' },
    { category: 'Phân tích', label: 'Tổng tất cả NV', text: 'Tổng doanh số tất cả nhân viên', icon: '🌐' },
    { category: 'Phân tích', label: 'So sánh tháng', text: 'So sánh doanh số tháng này và tháng trước', icon: '⚖️' },

    // ══════════════════════════════════════
    //  💰 CÔNG NỢ
    // ══════════════════════════════════════
    { category: 'Công nợ', label: 'Tổng hợp', text: 'Công nợ khách hàng', icon: '💰' },
    { category: 'Công nợ', label: 'Top nợ nhiều', text: 'Top khách hàng nợ nhiều nhất', icon: '🚨' },
    { category: 'Công nợ', label: 'Khách còn nợ', text: 'Danh sách khách hàng còn nợ', icon: '📝' },
    { category: 'Công nợ', label: 'Tổng hiện tại', text: 'Tổng công nợ hiện tại', icon: '💸' },
    { category: 'Công nợ', label: 'Tính đến hôm nay', text: 'Công nợ đến ngày hôm nay', icon: '📅' },
    { category: 'Công nợ', label: 'Chi tiết khách', text: 'Chi tiết công nợ khách hàng', icon: '💳' },
    { category: 'Công nợ', label: 'Hóa đơn nợ', text: 'Hóa đơn nợ của khách hàng', icon: '🧾' },

    // ══════════════════════════════════════
    //  📦 TỒN KHO
    // ══════════════════════════════════════
    { category: 'Kho hàng', label: 'Hiện tại', text: 'Tồn kho hiện tại', icon: '📦' },
    { category: 'Kho hàng', label: 'Kiểm tra SP', text: 'Kiểm tra tồn kho sản phẩm', icon: '🔍' },
    { category: 'Kho hàng', label: 'Theo kho', text: 'Tồn kho theo kho hàng', icon: '🏭' },

    // ══════════════════════════════════════
    //  🛒 ĐƠN HÀNG
    // ══════════════════════════════════════
    { category: 'Đơn hàng', label: 'Hôm nay', text: 'Đơn hàng hôm nay', icon: '📋' },
    { category: 'Đơn hàng', label: 'Tháng này', text: 'Đơn hàng tháng này', icon: '📅' },
    { category: 'Đơn hàng', label: 'Chờ duyệt', text: 'Đơn hàng chờ duyệt', icon: '⏳' },
    { category: 'Đơn hàng', label: 'Nhận đơn', text: 'Đơn hàng nhận đơn', icon: '📥' },
    { category: 'Đơn hàng', label: 'Xuống kho', text: 'Đơn hàng đã chuyển xuống kho', icon: '🏭' },
    { category: 'Đơn hàng', label: 'Xuất hàng', text: 'Đơn hàng đã xuất hàng', icon: '📦' },
    { category: 'Đơn hàng', label: 'Đi gửi', text: 'Đơn hàng đã đi gửi hàng', icon: '🚚' },
    { category: 'Đơn hàng', label: 'Đã nhận', text: 'Đơn hàng khách đã nhận hàng', icon: '✅' },
    { category: 'Đơn hàng', label: 'Thu tiền', text: 'Đơn hàng đã thu tiền', icon: '💵' },
    { category: 'Đơn hàng', label: 'Đã hủy', text: 'Đơn hàng đã hủy', icon: '❌' },

    // ══════════════════════════════════════
    //  🔍 TRA CỨU
    // ══════════════════════════════════════
    { category: 'Tra cứu', label: 'Sản phẩm', text: 'Tìm sản phẩm', icon: '💊' },
    { category: 'Tra cứu', label: 'Chấm điểm KH', text: 'Chấm điểm khách hàng của tôi', icon: '👤' },
    { category: 'Tra cứu', label: 'Đơn hàng', text: 'Tra cứu đơn hàng', icon: '📋' },
    { category: 'Tra cứu', label: 'Kho hàng', text: 'Danh mục kho hàng', icon: '🏭' },
    { category: 'Tra cứu', label: 'Nhân viên', text: 'Danh mục nhân viên', icon: '👨‍💼' },

    // ══════════════════════════════════════
    //  ❓ HƯỚNG DẪN
    // ══════════════════════════════════════
    { category: 'Hướng dẫn', label: 'Xem tính năng', text: 'Bạn giúp được gì?', icon: '🤖' },
];
