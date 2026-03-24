/**
 * Chatbot Quick Suggestions
 * Dựa trên các Stored Procedures:
 * - API_DoanhSo_AI         → Doanh số theo nhân viên, khách hàng, thời gian
 * - API_CongNoKhachHang_AI → Công nợ khách hàng (top nợ, nợ theo KH)
 * - API_CongNoChiTiet_AI   → Chi tiết công nợ theo mã KH
 * - API_DanhMuc_AI          → Tra cứu sản phẩm, khách hàng, đơn hàng, kho, nhân viên
 * - API_GetTonKho_List_AI  → Tồn kho theo sản phẩm
 * - API_DonHangChiTiet_Insert_AI → Tạo đơn hàng
 */
window.CHAT_SUGGESTIONS = [

    // ══════════════════════════════════════
    //  📊 DOANH SỐ (API_DoanhSo_AI)
    // ══════════════════════════════════════
    { text: 'Doanh số hôm nay', icon: '📊' },
    { text: 'Doanh số tuần này', icon: '📊' },
    { text: 'Doanh số tháng này', icon: '📊' },
    { text: 'Doanh số tháng trước', icon: '📊' },
    { text: 'Doanh số quý này', icon: '📊' },
    { text: 'Doanh số năm nay', icon: '📊' },
    { text: 'Doanh số theo nhân viên tháng này', icon: '📊' },
    { text: 'Doanh số theo khách hàng tháng này', icon: '📊' },
    { text: 'Doanh số từ ngày 01/01 đến hôm nay', icon: '📊' },
    { text: 'Tổng doanh số tất cả nhân viên', icon: '📊' },
    { text: 'So sánh doanh số tháng này và tháng trước', icon: '📊' },
    { text: 'Top nhân viên bán nhiều nhất tháng này', icon: '📊' },
    { text: 'Top khách hàng mua nhiều nhất tháng này', icon: '📊' },

    // ══════════════════════════════════════
    //  💰 CÔNG NỢ (API_CongNoKhachHang_AI)
    // ══════════════════════════════════════
    { text: 'Công nợ khách hàng', icon: '💰' },
    { text: 'Top khách hàng nợ nhiều nhất', icon: '💰' },
    { text: 'Danh sách khách hàng còn nợ', icon: '💰' },
    { text: 'Tổng công nợ hiện tại', icon: '💰' },
    { text: 'Công nợ đến ngày hôm nay', icon: '💰' },

    // ══════════════════════════════════════
    //  💳 CHI TIẾT CÔNG NỢ (API_CongNoChiTiet_AI)
    // ══════════════════════════════════════
    { text: 'Chi tiết công nợ khách hàng', icon: '💳' },
    { text: 'Hóa đơn nợ của khách hàng', icon: '💳' },
    { text: 'Xem chi tiết nợ khách', icon: '💳' },

    // ══════════════════════════════════════
    //  📦 TỒN KHO (API_GetTonKho_List_AI)
    // ══════════════════════════════════════
    { text: 'Tồn kho hiện tại', icon: '📦' },
    { text: 'Kiểm tra tồn kho sản phẩm', icon: '📦' },
    { text: 'Sản phẩm hết hàng', icon: '📦' },
    { text: 'Sản phẩm sắp hết hàng', icon: '📦' },
    { text: 'Tồn kho theo kho hàng', icon: '📦' },
    { text: 'Sản phẩm sắp hết hạn', icon: '⏰' },
    { text: 'Xuất nhập tồn hôm nay', icon: '📦' },

    // ══════════════════════════════════════
    //  🛒 ĐƠN HÀNG (API_DonHangChiTiet_Insert_AI + DanhMuc)
    // ══════════════════════════════════════
    { text: 'Tạo đơn hàng mới', icon: '🛒' },
    { text: 'Đơn hàng hôm nay', icon: '📋' },
    { text: 'Đơn hàng chờ xác nhận', icon: '📋' },
    { text: 'Đơn hàng chưa giao', icon: '📋' },
    { text: 'Đơn hàng đã giao hôm nay', icon: '📋' },

    // ══════════════════════════════════════
    //  🔍 TRA CỨU (API_DanhMuc_AI)
    // ══════════════════════════════════════
    { text: 'Tìm sản phẩm', icon: '💊' },
    { text: 'Tìm khách hàng', icon: '👤' },
    { text: 'Tra cứu đơn hàng', icon: '📋' },
    { text: 'Tra cứu kho hàng', icon: '🏭' },
    { text: 'Tìm nhân viên', icon: '👨‍💼' },
    { text: 'Giá sản phẩm', icon: '💊' },
    { text: 'Danh sách sản phẩm', icon: '💊' },
    { text: 'Danh sách khách hàng', icon: '👤' },
    { text: 'Danh sách nhân viên', icon: '👨‍💼' },

    // ══════════════════════════════════════
    //  ❓ HƯỚNG DẪN
    // ══════════════════════════════════════
    { text: 'Hướng dẫn tạo đơn hàng', icon: '❓' },
    { text: 'Hướng dẫn tra cứu bằng @mention', icon: '❓' },
    { text: 'Bạn có thể làm gì?', icon: '❓' },
];
