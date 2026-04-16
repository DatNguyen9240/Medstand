-- ═══════════════════════════════════════════════════════════════════════════
-- MEDSTAND AI — TỔNG HỢP TẤT CẢ LỆNH EXEC
-- Thay '{username}' bằng tên đăng nhập thực tế (VD: 'demo', 'sale01'...)
-- Thay '{khachhang}' bằng mã khách hàng thực tế (VD: 'HB106', 'NT001'...)
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- MODULE 1 — AI GỢI Ý ĐƠN HÀNG
-- SP: API_GoiYDonHang_AI
-- ═══════════════════════════════════════════════════════════════════════════

-- [1A] Hôm nay nên bán gì cho 1 khách cụ thể?
EXEC API_GoiYDonHang_AI
    @Username   = '{username}',
    @MaKhachHang  = '{khachhang}',    -- Mã khách hàng
    @TopN       = 10;

-- [1B] Hàng bán chạy nhất chi nhánh hôm nay (không có khách cụ thể)
EXEC API_GoiYDonHang_AI
    @Username   = '{username}',
    @MaKhachHang  = '',               -- Để trống = xem toàn chi nhánh
    @TopN       = 10;


-- ═══════════════════════════════════════════════════════════════════════════
-- MODULE 2 — AI QUẢN LÝ TUYẾN BÁN HÀNG
-- SP: API_TuyenBanHang_AI
-- ═══════════════════════════════════════════════════════════════════════════

-- [2A] Top 8 khách nên ghé hôm nay (toàn tuyến)
EXEC API_TuyenBanHang_AI
    @Username      = '{username}',
    @MaKhachHang     = '',            -- Để trống = xem toàn tuyến
    @SoNgayVangMat = 45,            -- Ngưỡng cảnh báo mất khách (ngày)
    @TopN          = 8;

-- [2B] Kiểm tra tình trạng 1 khách cụ thể
EXEC API_TuyenBanHang_AI
    @Username      = '{username}',
    @MaKhachHang     = '{khachhang}', -- Mã khách cần kiểm tra
    @SoNgayVangMat = 45;

-- [2C] Danh sách khách lâu chưa mua (cảnh báo rời bỏ)
EXEC API_TuyenBanHang_AI
    @Username      = '{username}',
    @MaKhachHang     = '',
    @SoNgayVangMat = 45,            -- Thay 60 hoặc 90 nếu muốn ngưỡng khác
    @TopN          = 8;


-- ═══════════════════════════════════════════════════════════════════════════
-- MODULE 3 — AI CHẤM ĐIỂM KHÁCH HÀNG
-- SP: API_ChamDiemKH_AI
-- ═══════════════════════════════════════════════════════════════════════════

-- [3A] Xem toàn bộ phân loại khách hàng (A/B/C)
EXEC API_ChamDiemKH_AI
    @Username   = '{username}',
    @MaKhachHang  = '',
    @NhomFilter = '';               -- '' = tất cả nhóm

-- [3B] Chỉ xem khách VIP (Nhóm A — DS TB >= 50 triệu/tháng)
EXEC API_ChamDiemKH_AI
    @Username   = '{username}',
    @NhomFilter = 'A';

-- [3C] Chỉ xem khách ổn định (Nhóm B — DS TB >= 30 triệu/tháng)
EXEC API_ChamDiemKH_AI
    @Username   = '{username}',
    @NhomFilter = 'B';

-- [3D] Chỉ xem khách nguy cơ rời bỏ (Nhóm C — 90 ngày không đặt)
EXEC API_ChamDiemKH_AI
    @Username   = '{username}',
    @NhomFilter = 'C';

-- [3E] Chi tiết điểm 1 khách cụ thể
EXEC API_ChamDiemKH_AI
    @Username   = '{username}',
    @MaKhachHang  = '{khachhang}';


-- ═══════════════════════════════════════════════════════════════════════════
-- MODULE 4 — AI THEO DÕI CHƯƠNG TRÌNH TÍCH LŨY
-- SP: API_TichLuy_AI
-- Trả về: Bảng 1 = Tích lũy | Bảng 2 = Gợi ý bán thêm
-- ═══════════════════════════════════════════════════════════════════════════

-- [4A] Xem tích lũy của 1 khách cụ thể (cho Sale)
EXEC API_TichLuy_AI
    @Username  = '{username}',
    @MaKhachHang = '{khachhang}';     -- Mã khách cần xem

-- [4B] Danh sách khách sắp đạt thưởng tháng này (cho Quản lý/CEO)
EXEC API_TichLuy_AI
    @Username  = '{username}',
    @MaKhachHang = '';                -- Để trống = xem tổng danh sách

-- [4C] Xem theo chương trình cụ thể + lọc sản phẩm tùy chọn
EXEC API_TichLuy_AI
    @Username  = '{username}',
    @MaKhachHang = '{khachhang}',
    @ProgramID = '{programID}',     -- Mã chương trình (AR_SanPhamTrongTamTbl.DocumentID)
    @ItemIDs   = 'G001,G002,G003';  -- Danh sách SP muốn tính (cách nhau bằng dấu phẩy)


-- ═══════════════════════════════════════════════════════════════════════════
-- MODULE 5 — AI GOOGLE CHO SALE (UPSELL + TÌM TRIỆU CHỨNG)
-- SP: API_UpsellGoiY_AI
-- Trả về: Bảng 1 = Doanh số hiện tại | Bảng 2 = Gợi ý sản phẩm
-- ═══════════════════════════════════════════════════════════════════════════

-- [5A] Tìm sản phẩm theo triệu chứng (AI Google)
-- Thay từ khóa: 'ho', 'sốt', 'đau đầu', 'mất ngủ', 'xương khớp', 'tiêu hóa'...
EXEC API_UpsellGoiY_AI
    @Username  = '{username}',
    @timkiem   = N'ho',             -- Từ khóa triệu chứng (có dấu tiếng Việt)
    @TopN      = 10;

-- [5B] Gợi ý bán thêm để khách đạt mức chiết khấu/thưởng
EXEC API_UpsellGoiY_AI
    @Username  = '{username}',
    @MaKhachHang = '{khachhang}',     -- Mã khách đang mua
    @TopN      = 10;

-- [5C] Kết hợp: Khách hỏi triệu chứng + đang cần đạt thưởng
EXEC API_UpsellGoiY_AI
    @Username  = '{username}',
    @MaKhachHang = '{khachhang}',
    @timkiem   = N'ho',             -- Triệu chứng + Upsell cùng lúc
    @TopN      = 10;

-- [5D] Ví dụ các từ khóa triệu chứng thường gặp:
-- N'ho'          → Các sản phẩm trị ho, họng
-- N'sốt'         → Hạ sốt, kháng viêm
-- N'mất ngủ'     → An thần, bổ não
-- N'xương khớp'  → Canxi, D3, Glucosamine
-- N'tiêu hóa'    → Men vi sinh, enzyme
-- N'gan'         → Bổ gan, giải độc
-- N'mắt'         → Lutein, Vitamin A
-- N'Vitamin'     → Vitamin tổng hợp


-- ═══════════════════════════════════════════════════════════════════════════
-- MODULE 6 — AI ĐỀ XUẤT CHƯƠNG TRÌNH KHUYẾN MẠI (CEO)
-- SP: API_DeXuatKhuyenMai_AI
-- Trả về: Danh sách SP + LoaiDeXuat + ChiTietAI
-- ═══════════════════════════════════════════════════════════════════════════

-- [6A] Phân tích tồn kho và đề xuất chiến lược khuyến mãi
EXEC API_DeXuatKhuyenMai_AI
    @Username = '{username}';       -- CEO/Giám đốc/Quản lý

-- Kết quả phân loại:
-- 🔴 XẢ HÀNG SÂU  → Hạn dùng < 6 tháng (ưu tiên xử lý ngay)
-- 🟠 CHẠY COMBO   → Tồn kho cao, bán chậm (>180 ngày mới hết)
-- 🟢 THEO DÕI     → Ổn định, không cần can thiệp


-- ═══════════════════════════════════════════════════════════════════════════
-- MODULE 7 — AI NHẬN DIỆN ĐỚN THUỐC TỪ ẢNH
-- SP: API_GoiYDonThuoc_AI
-- Trả về: Bảng 1 = SP thay thế | Bảng 2 = Cảnh báo bán chéo
-- ═══════════════════════════════════════════════════════════════════════════

-- [7A] Tìm SP thay thế + cảnh báo bán chéo từ danh sách tên thuốc
EXEC API_GoiYDonThuoc_AI
    @timkiem = N'Amoxicillin, Paracetamol';

-- [7B] Ví dụ với nhiều thuốc trong đơn
EXEC API_GoiYDonThuoc_AI
    @timkiem = N'Cefu, Bromhexin, Vitamin C';

-- [7C] Ví dụ với từ khóa nhóm
EXEC API_GoiYDonThuoc_AI
    @timkiem = N'Kháng sinh, ho, viêm họng';

-- Logic tự động trong SP:
-- Phát hiện Amox/Cefu/Kháng sinh → Gợi ý Men vi sinh
-- Không có KS → Gợi ý Vitamin tăng đề kháng


-- ═══════════════════════════════════════════════════════════════════════════
-- BẢNG TRA CỨU NHANH
-- ═══════════════════════════════════════════════════════════════════════════
/*
┌─────────────────────────────────────────┬──────────┬────────────────────────────────┐
│ CÂU HỎI NGƯỜI DÙNG                     │ MODULE   │ EXEC                           │
├─────────────────────────────────────────┼──────────┼────────────────────────────────┤
│ Hôm nay bán gì cho khách X?            │ 1        │ API_GoiYDonHang_AI @MaKhachHang  │
│ Hàng bán chạy nhất hôm nay?            │ 1        │ API_GoiYDonHang_AI khachhang=''│
│ Hôm nay ghé khách nào?                 │ 2        │ API_TuyenBanHang_AI [2A]       │
│ Khách X có nên ghé không?              │ 2        │ API_TuyenBanHang_AI [2B]       │
│ Khách nào lâu chưa mua?                │ 2        │ API_TuyenBanHang_AI [2A]       │
│ Phân loại toàn bộ khách hàng           │ 3        │ API_ChamDiemKH_AI [3A]         │
│ Khách VIP là ai?                        │ 3        │ API_ChamDiemKH_AI [3B]         │
│ Khách sắp nghỉ mua?                    │ 3        │ API_ChamDiemKH_AI [3D]         │
│ Khách X tích lũy bao nhiêu?           │ 4        │ API_TichLuy_AI [4A]            │
│ Ai sắp đạt thưởng tháng này?          │ 4        │ API_TichLuy_AI [4B]            │
│ Thuốc ho/sốt/đau bán gì?              │ 5        │ API_UpsellGoiY_AI [5A]         │
│ Bán thêm gì cho khách X?              │ 5        │ API_UpsellGoiY_AI [5B]         │
│ Hàng nào cần xả? Combo gì?            │ 6        │ API_DeXuatKhuyenMai_AI [6A]    │
│ Đơn thuốc này thay thế gì?            │ 7        │ API_GoiYDonThuoc_AI [7A]       │
└─────────────────────────────────────────┴──────────┴────────────────────────────────┘
*/
