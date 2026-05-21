-- ============================================================
--  MEDSTAND AI — SCRIPT KIỂM TRA SP (PARAM CHUẨN XÁC 100%)
--  Nguồn param: sys.parameters từ DB thực tế
--  Phiên bản: V38-Final · 05/2026
-- ============================================================

-- !! THAY ĐỔI CÁC BIẾN NÀY NẾU CẦN !!
DECLARE @USERNAME_MB   VARCHAR(50)  = 'QLBH013.MED'   -- Mai Anh Tuấn   (Miền Bắc)
DECLARE @USERNAME_MT   VARCHAR(50)  = 'QLBH010.MED'   -- Việt Anh       (Miền Trung)
DECLARE @USERNAME_MN   VARCHAR(50)  = 'QLMN2'          -- Trần Văn Luân  (Miền Nam)
DECLARE @KH_MB         VARCHAR(50)  = 'HYA107'         -- Quầy Thuốc Thu Thuỷ
DECLARE @KH_MT         VARCHAR(50)  = 'DNA014'         -- Nhà Thuốc Lê Hùng 2
DECLARE @THANG_NAY     DATETIME     = DATEADD(DAY, 1 - DAY(GETDATE()), CAST(GETDATE() AS DATE))
DECLARE @HOM_NAY       DATETIME     = GETDATE()

PRINT '=================================================='
PRINT ' MEDSTAND AI — KIỂM TRA SP (PARAM THỰC TẾ 100%)'
PRINT ' Thời gian: ' + CONVERT(VARCHAR, GETDATE(), 120)
PRINT '=================================================='


-- ============================================================
-- [TEST 01] DOANH SỐ — API_DoanhSo_AI
-- Param: @Username, @LoaiBaoCao
-- ============================================================
PRINT ''
PRINT '--- TEST 01: Doanh Số Nhân Viên (API_DoanhSo_AI) ---'

EXEC API_DoanhSo_AI
    @Username   = @USERNAME_MB,
    @LoaiBaoCao = 'NhanVien'

-- PASS: Ra danh sách NV + doanh số tháng này
-- FAIL: "User không tồn tại" → username sai trong bảng SY_User


-- ============================================================
-- [TEST 02] BẢO MẬT — QLMN2 cố xem vùng Bắc
-- ============================================================
PRINT ''
PRINT '--- TEST 02: Bảo Mật Cross-Zone (QLMN2 hỏi vùng MB) ---'

EXEC API_DoanhSo_AI
    @Username   = @USERNAME_MN,
    @ManagerID  = @USERNAME_MB,
    @LoaiBaoCao = 'NhanVien'

-- PASS: Kết quả rỗng HOẶC chỉ có dữ liệu MN
-- FAIL (LỖI BẢO MẬT): Ra dữ liệu nhân viên vùng MB


-- ============================================================
-- [TEST 03] ĐƠN HÀNG — API_DonHang_AI
-- Param: @Username, @StatusID, @timkiem, @SearchText
-- ============================================================
PRINT ''
PRINT '--- TEST 03a: Đơn Chờ Duyệt (StatusID=0) ---'

EXEC API_DonHang_AI
    @Username = @USERNAME_MB,
    @StatusID = 0

PRINT ''
PRINT '--- TEST 03b: Tìm Đơn Theo Mã ---'

EXEC API_DonHang_AI
    @Username = @USERNAME_MB,
    @timkiem  = 'DMB0526/7186'

-- PASS: 03a ra danh sách đơn chờ duyệt; 03b ra chi tiết đơn cụ thể


-- ============================================================
-- [TEST 04] GỢI Ý ĐẶT HÀNG — API_GoiYDonHang_AI
-- Param: @Username, @MaKhachHang (hoặc @ObjectID), @TopN
-- ============================================================
PRINT ''
PRINT '--- TEST 04a: Gợi Ý Cho Khách Cụ Thể ---'

EXEC API_GoiYDonHang_AI
    @Username    = @USERNAME_MB,
    @MaKhachHang = @KH_MB,
    @TopN        = 10

PRINT ''
PRINT '--- TEST 04b: Hàng Bán Chạy Nhất (không có KH cụ thể) ---'

EXEC API_GoiYDonHang_AI
    @Username    = @USERNAME_MB,
    @MaKhachHang = '',
    @TopN        = 10

-- PASS: 04a ra SP kèm LyDoGoiY + SoNgayDuKienConLai; 04b ra top bán chạy


-- ============================================================
-- [TEST 05] UPSELL + TÌM THEO TRIỆU CHỨNG — API_UpsellGoiY_AI
-- Param: @Username, @MaKhachHang, @timkiem, @TopN
-- ============================================================
PRINT ''
PRINT '--- TEST 05a: Gợi Ý Thuốc Theo Triệu Chứng (mất ngủ) ---'

EXEC API_UpsellGoiY_AI
    @Username    = @USERNAME_MB,
    @MaKhachHang = '',
    @timkiem     = N'mất ngủ',
    @TopN        = 10

PRINT ''
PRINT '--- TEST 05b: Upsell - Bán Thêm Cho Khách Cụ Thể ---'

EXEC API_UpsellGoiY_AI
    @Username    = @USERNAME_MB,
    @MaKhachHang = @KH_MB,
    @timkiem     = '',
    @TopN        = 10

-- PASS 05a: Ra An Ngủ Ngon Medstand (A006) + các SP phù hợp
-- PASS 05b: Ra SoTienConThieu + SP gợi ý để KH đạt mức thưởng


-- ============================================================
-- [TEST 06] TRA CỨU SẢN PHẨM — API_TraCuuSanPham_AI
-- Param: @Username, @timkiem, @TopN
-- ============================================================
PRINT ''
PRINT '--- TEST 06: Tra Cứu Sản Phẩm (API_TraCuuSanPham_AI) ---'

EXEC API_TraCuuSanPham_AI
    @Username = @USERNAME_MB,
    @timkiem  = N'Antrinano',
    @TopN     = 5

-- PASS: Ra thông tin A003 — tên, đơn vị, giá, tồn kho


-- ============================================================
-- [TEST 07] CÔNG NỢ KHU VỰC — API_CongNoKhachHang_AI
-- Param: @DenNgay (BẮT BUỘC), @MaKhachHang, @Username
-- ============================================================
PRINT ''
PRINT '--- TEST 07: Tổng Công Nợ Khu Vực (API_CongNoKhachHang_AI) ---'

EXEC API_CongNoKhachHang_AI
    @Username    = @USERNAME_MT,
    @DenNgay     = @HOM_NAY,       -- Ngày cắt công nợ
    @MaKhachHang = ''               -- Rỗng = lấy tất cả KH trong vùng

-- PASS: Ra tổng công nợ ~4,04 tỷ vùng Miền Trung
-- Warning "Null value..." là bình thường, không ảnh hưởng kết quả


-- ============================================================
-- [TEST 08] CÔNG NỢ CHI TIẾT — API_CongNoChiTiet_AI
-- Param: @MaKhachHang, @Username, @DenNgay (tất cả BẮT BUỘC)
-- ============================================================
PRINT ''
PRINT '--- TEST 08: Công Nợ Chi Tiết Từng Khách ---'

EXEC API_CongNoChiTiet_AI
    @Username    = @USERNAME_MT,
    @MaKhachHang = @KH_MT,
    @DenNgay     = @HOM_NAY

-- PASS: Ra danh sách hoá đơn chưa TT của Nhà Thuốc Lê Hùng 2
--       Có số hoá đơn, ngày, số tiền còn lại


-- ============================================================
-- [TEST 09] HOÁ ĐƠN — API_HoaDon_AI
-- Param: @Username, @TuNgay, @DenNgay, @timkiem
-- ============================================================
PRINT ''
PRINT '--- TEST 09a: Tìm Hoá Đơn Theo Mã ---'

EXEC API_HoaDon_AI
    @Username = @USERNAME_MT,
    @timkiem  = 'DMT0526/8647'

PRINT ''
PRINT '--- TEST 09b: Danh Sách Hoá Đơn Theo Tháng ---'

EXEC API_HoaDon_AI
    @Username = @USERNAME_MT,
    @TuNgay   = @THANG_NAY,
    @DenNgay  = @HOM_NAY,
    @timkiem  = ''

-- PASS 09a: Ra chi tiết hoá đơn DMT0526/8647
-- PASS 09b: Ra danh sách hoá đơn tháng 5


-- ============================================================
-- [TEST 10] TÍCH LUỸ — API_TichLuy_AI
-- Param: @Username, @MaKhachHang, @ProgramID, @TuNgay, @DenNgay, @ItemIDs
-- ============================================================
PRINT ''
PRINT '--- TEST 10: Điểm Tích Luỹ Khách Hàng (API_TichLuy_AI) ---'

EXEC API_TichLuy_AI
    @Username    = @USERNAME_MB,
    @MaKhachHang = @KH_MB,
    @ProgramID   = '',              -- Rỗng = lấy chương trình mới nhất
    @TuNgay      = NULL,
    @DenNgay     = NULL,
    @ItemIDs     = ''

-- PASS: Ra TichLuyDatDuoc + ConThieuChoQuaTiep + gợi ý SP bán thêm


-- ============================================================
-- [TEST 11] TUYẾN BÁN HÀNG — API_TuyenBanHang_AI
-- Param: @Username, @MaKhachHang, @SoNgayVangMat, @NgayBaoDong, @TopN, @NgayTarget
-- ============================================================
PRINT ''
PRINT '--- TEST 11a: Tuyến Hôm Nay (toàn bộ nhóm) ---'

EXEC API_TuyenBanHang_AI
    @Username      = @USERNAME_MB,
    @MaKhachHang   = '',
    @SoNgayVangMat = 45,
    @NgayBaoDong   = 7,             -- Cảnh báo trước 7 ngày
    @TopN          = 8,
    @NgayTarget    = ''

PRINT ''
PRINT '--- TEST 11b: Kiểm Tra Tình Trạng 1 Khách Cụ Thể ---'

EXEC API_TuyenBanHang_AI
    @Username      = @USERNAME_MB,
    @MaKhachHang   = @KH_MB,
    @SoNgayVangMat = 45,
    @NgayBaoDong   = 7,
    @TopN          = 8,
    @NgayTarget    = ''

-- PASS 11a: Ra danh sách nhà thuốc cần ghé hôm nay theo điểm ưu tiên
-- PASS 11b: Ra tình trạng cụ thể của HYA107 — còn hàng không, bao lâu nữa hết


-- ============================================================
-- [TEST 12] GỢI Ý ĐƠN THUỐC — API_GoiYDonThuoc_AI
-- Param: @Username, @timkiem
-- ============================================================
PRINT ''
PRINT '--- TEST 12: Gợi Ý Thuốc Thay Thế (API_GoiYDonThuoc_AI) ---'

EXEC API_GoiYDonThuoc_AI
    @Username = @USERNAME_MB,
    @timkiem  = N'Amoxicillin, Vitamin C'

-- PASS: Ra SP Medstand thay thế + cảnh báo bán chéo men vi sinh
-- (Kháng sinh phát hiện → cảnh báo tự động)


-- ============================================================
-- [TEST 13] KHUYẾN MÃI — API_DeXuatKhuyenMai_AI
-- Param: @Username (duy nhất)
-- ============================================================
PRINT ''
PRINT '--- TEST 13: Đề Xuất Khuyến Mãi (API_DeXuatKhuyenMai_AI) ---'

EXEC API_DeXuatKhuyenMai_AI
    @Username = @USERNAME_MN

-- PASS: Ra SP cần xả hàng (🔴), chạy combo (🟠), theo dõi (🟢)
-- FAIL: 0 rows → Bảng dữ liệu khuyến mãi chưa có data


-- ============================================================
-- [TEST 14] SẢN PHẨM TRỌNG TÂM — API_SanPhamTrongTam_AI
-- Param: @Username, @MaKhachHang, @TopN
-- ============================================================
PRINT ''
PRINT '--- TEST 14: Sản Phẩm Trọng Tâm Tháng (API_SanPhamTrongTam_AI) ---'

EXEC API_SanPhamTrongTam_AI
    @Username    = @USERNAME_MB,
    @MaKhachHang = '',
    @TopN        = 10

-- PASS: Ra danh sách SKU BGĐ chỉ định push trong tháng
-- FAIL: 0 rows → Bảng dữ liệu SP trọng tâm chưa có data


-- ============================================================
-- [TEST 15] DANH MỤC — API_DanhMuc_AI
-- Param: @Type, @timkiem (+ nhiều param tuỳ chọn)
-- ============================================================
PRINT ''
PRINT '--- TEST 15a: Danh Mục Sản Phẩm ---'

EXEC API_DanhMuc_AI
    @Username = @USERNAME_MB,
    @Type     = 'sanpham',
    @timkiem  = ''

PRINT ''
PRINT '--- TEST 15b: Tìm Khách Hàng Theo Tên ---'

EXEC API_DanhMuc_AI
    @Username = @USERNAME_MB,
    @Type     = 'khachhang',
    @timkiem  = N'Thu Thuỷ'

-- PASS 15a: Ra danh mục nhóm sản phẩm
-- PASS 15b: Ra danh sách KH tên có "Thu Thuỷ"


-- ============================================================
-- [TEST 16] CHẤM ĐIỂM KHÁCH HÀNG — API_ChamDiemKH_AI
-- Param: @Username, @MaKhachHang, @NhomFilter
--        + @W_Recency, @W_Frequency, @W_Monetary, @W_Consumption
--          (Trọng số % — Tổng phải = 100)
-- ============================================================
PRINT ''
PRINT '--- TEST 16a: Chấm Điểm Toàn Bộ Khách Hàng ---'

EXEC API_ChamDiemKH_AI
    @Username       = @USERNAME_MB,
    @MaKhachHang    = '',       -- Rỗng = xem tất cả
    @NhomFilter     = '',       -- Rỗng = không lọc nhóm
    @W_Recency      = 30.0,     -- 30% trọng số gần mua gần đây
    @W_Frequency    = 25.0,     -- 25% tần suất mua
    @W_Monetary     = 35.0,     -- 35% giá trị mua
    @W_Consumption  = 10.0      -- 10% tiêu thụ SP

PRINT ''
PRINT '--- TEST 16b: Chỉ Khách VIP (Nhóm A) ---'

EXEC API_ChamDiemKH_AI
    @Username       = @USERNAME_MB,
    @MaKhachHang    = '',
    @NhomFilter     = 'A',
    @W_Recency      = 30.0,
    @W_Frequency    = 25.0,
    @W_Monetary     = 35.0,
    @W_Consumption  = 10.0

PRINT ''
PRINT '--- TEST 16c: Chi Tiết 1 Khách Cụ Thể ---'

EXEC API_ChamDiemKH_AI
    @Username       = @USERNAME_MB,
    @MaKhachHang    = @KH_MB,
    @NhomFilter     = '',
    @W_Recency      = 30.0,
    @W_Frequency    = 25.0,
    @W_Monetary     = 35.0,
    @W_Consumption  = 10.0

-- PASS 16a: Ra danh sách KH phân nhóm A/B/C + XuHuong
-- PASS 16b: Chỉ ra nhóm VIP
-- PASS 16c: Điểm chi tiết + CanhBaoAI của HYA107


-- ============================================================
-- [TEST 17] TỒN KHO — API_DanhSachTonKho_AI
-- Param: @Username, @ItemID, @TenSanPham, @timkiem
-- ============================================================
PRINT ''
PRINT '--- TEST 17a: Tồn Kho Theo Tên Sản Phẩm ---'

EXEC API_DanhSachTonKho_AI
    @Username   = @USERNAME_MB,
    @ItemID     = '',
    @TenSanPham = N'Antrinano',
    @timkiem    = ''

PRINT ''
PRINT '--- TEST 17b: Tồn Kho Theo Mã SP ---'

EXEC API_DanhSachTonKho_AI
    @Username   = @USERNAME_MB,
    @ItemID     = 'A003',
    @TenSanPham = '',
    @timkiem    = ''

-- PASS: Ra số lượng tồn kho A003 theo từng kho


-- ============================================================
-- [TEST 18] KHẢO SÁT — Kiểm tra SP tên thật
-- ============================================================
PRINT ''
PRINT '--- TEST 18: Tìm SP Khảo Sát ---'

SELECT name AS [SP Khảo Sát], modify_date AS [Cập nhật]
FROM sys.objects
WHERE type = 'P'
  AND (name LIKE '%Khao%' OR name LIKE '%KhaoSat%'
    OR name LIKE '%Survey%' OR name LIKE '%Khảo%')
ORDER BY name

-- Sau đó EXEC đúng tên SP tìm được ở kết quả trên


-- ============================================================
-- KIỂM TRA CUỐI — Tất cả SP AI trong DB
-- ============================================================
PRINT ''
PRINT '=== TOÀN BỘ SP AI ĐÃ DEPLOY ==='

SELECT
    o.name          AS [Tên SP],
    o.modify_date   AS [Cập nhật],
    (SELECT COUNT(*) FROM sys.parameters p WHERE p.object_id = o.object_id) AS [Số Param]
FROM sys.objects o
WHERE o.type = 'P'
  AND (o.name LIKE 'API_%AI%' OR o.name LIKE '%_AI')
ORDER BY o.name


-- ============================================================
-- CHẨN ĐOÁN — Tại sao một số TEST không có dữ liệu?
-- Chạy từng block dưới đây để tìm nguyên nhân
-- ============================================================

-- [DIAG 01] Kiểm tra đơn DMB0526/7186 có tồn tại trong DB không?
PRINT ''
PRINT '--- DIAG 01: Kiểm tra đơn DMB0526/7186 tồn tại không? ---'
SELECT DocumentID, DocumentDate, StatusID, EmployeeID, BranchID
FROM AR_OrderTbl
WHERE DocumentID = 'DMB0526/7186'
-- Nếu 0 rows: Mã đơn này không có trong DB (mã mẫu từ docx)
-- Nếu có rows nhưng test rỗng: DocumentDate nằm ngoài khoảng -1 tháng

-- [DIAG 02] Đơn nào đang ở StatusID=0 (chờ duyệt) trong nhóm QLBH013.MED?
PRINT ''
PRINT '--- DIAG 02: Đơn chờ duyệt (StatusID=0) của QLBH013.MED ---'
SELECT TOP 5 A.DocumentID, A.DocumentDate, A.StatusID, A.EmployeeID, A.ManagerID
FROM AR_OrderTbl A
INNER JOIN SY_User U ON U.UserName = @USERNAME_MB
WHERE A.StatusID = 0
  AND (A.ManagerID = U.EmployeeID OR A.EmployeeID = U.EmployeeID)
ORDER BY A.DocumentDate DESC
-- Nếu 0 rows: Hiện tại không có đơn chờ duyệt nào → BÌNH THƯỜNG
-- StatusID thực tế của đơn đã duyệt thường là 1, 2 hoặc 3

-- [DIAG 03] Xem phân bố StatusID hiện tại của nhóm QLBH013.MED
PRINT ''
PRINT '--- DIAG 03: Phân bố trạng thái đơn hàng ---'
SELECT A.StatusID, S.StatusName, COUNT(*) AS SoDon, MAX(A.DocumentDate) AS DonMoiNhat
FROM AR_OrderTbl A
INNER JOIN SY_User U ON U.UserName = @USERNAME_MB
LEFT JOIN AR_OrderStatusTbl S ON S.StatusID = A.StatusID
WHERE A.DocumentDate >= DATEADD(MONTH, -1, GETDATE())
  AND (A.ManagerID = U.EmployeeID OR A.EmployeeID = U.EmployeeID)
GROUP BY A.StatusID, S.StatusName
ORDER BY COUNT(*) DESC
-- Kết quả này cho biết StatusID nào đang có đơn thật trong DB

-- [DIAG 04] Kiểm tra dữ liệu SP Trọng Tâm (TEST 14 ra rỗng)
PRINT ''
PRINT '--- DIAG 04: Bảng dữ liệu SP Trọng Tâm ---'
IF OBJECT_ID('AI_SanPhamTrongTam', 'U') IS NOT NULL
    SELECT TOP 5 * FROM AI_SanPhamTrongTam WITH (NOLOCK)
ELSE
    SELECT 'Bảng AI_SanPhamTrongTam CHƯA TỒN TẠI' AS [Trạng thái]

-- [DIAG 05] Kiểm tra dữ liệu bảng Tích Luỹ
PRINT ''
PRINT '--- DIAG 05: Bảng chương trình Tích Luỹ ---'
IF OBJECT_ID('AI_TichLuyChuongTrinh', 'U') IS NOT NULL
    SELECT TOP 5 * FROM AI_TichLuyChuongTrinh WITH (NOLOCK)
ELSE
    SELECT 'Bảng AI_TichLuyChuongTrinh CHƯA TỒN TẠI' AS [Trạng thái]
-- Nếu lỗi hoặc 0 rows: Chưa có chương trình tích luỹ nào được cấu hình

-- [DIAG 06] Tìm tên bảng master dữ liệu liên quan AI
PRINT ''
PRINT '--- DIAG 06: Bảng master AI trong DB ---'
SELECT name AS [Tên bảng], create_date, modify_date
FROM sys.tables
WHERE name LIKE 'AI_%' OR name LIKE '%TronTam%' OR name LIKE '%TichLuy%'
    OR name LIKE '%TuyenBanHang%' OR name LIKE '%KhuyenMai%'
ORDER BY name
-- Kết quả cho biết bảng nào đã được tạo, bảng nào còn thiếu

-- ============================================================
-- GHI KẾT QUẢ
-- ============================================================
/*
BẢNG KẾT QUẢ KIỂM TRA:

TEST 01 — Doanh số NV:         [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 02 — Bảo mật cross-zone:  [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 03a— Đơn chờ duyệt:       [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 03b— Đơn theo mã:         [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 04a— Gợi ý cho KH cụ thể: [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 04b— Hàng bán chạy:       [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 05a— Triệu chứng:         [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 05b— Upsell target:       [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 06 — Tra cứu SP:          [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 07 — Công nợ vùng:        [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 08 — Công nợ chi tiết:    [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 09a— Hoá đơn theo mã:     [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 09b— Hoá đơn tháng:       [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 10 — Tích luỹ:            [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 11a— Tuyến BH toàn nhóm:  [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 11b— Tuyến 1 khách:       [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 12 — Gợi ý thuốc:         [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 13 — Khuyến mãi:          [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 14 — SP trọng tâm:        [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 15a— Danh mục SP:         [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 15b— Tìm KH:              [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 16a— Chấm điểm tất cả:    [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 16b— Khách VIP:           [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 16c— Chi tiết 1 KH:       [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 17a— Tồn kho tên SP:      [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 17b— Tồn kho mã SP:       [ ] PASS  [ ] FAIL  Ghi chú: ___________
TEST 18 — Khảo sát:            [ ] PASS  [ ] FAIL  Ghi chú: ___________

TỔNG: ___ / 27 PASS
Người chạy: ___________________  Ngày: ___ / ___ / 2026
*/
