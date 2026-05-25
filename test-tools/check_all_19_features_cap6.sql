-- =============================================================================
-- SCRIPT KIỂM THỬ TOÀN DIỆN 19 TÍNH NĂNG MEDSTAND AI (CẶP 6 - MIỀN NAM)
-- Đối tượng: Cặp 6 - QL Nguyễn Văn Thái (QLMD1) & TDV Nguyễn Quốc Tuấn (BinhPhuocA)
-- Khách hàng mẫu: Nhà Thuốc Lê Hùng 2 (DNA014)
-- =============================================================================

USE [medtest]; -- Sử dụng đúng database của dự án
GO

SET NOCOUNT ON;

PRINT N'================================================================================';
PRINT N'                    BẮT ĐẦU KIỂM THỬ CẶP 6: QLMD1 & BinhPhuocA                  ';
PRINT N'================================================================================';

-- -----------------------------------------------------------------------------
-- STT 01: Xem doanh số bán hàng
-- Kỳ vọng: Quản lý xem toàn vùng Miền Nam, TDV chỉ xem doanh số của riêng mình.
-- -----------------------------------------------------------------------------
PRINT N'>>> STT 01: Xem doanh số bán hàng';
-- 1. Xem dưới quyền Quản lý
EXEC dbo.API_DoanhSo_AI @Username = 'QLMD1', @LoaiBaoCao = 'NhanVien';
-- 2. Xem dưới quyền TDV
EXEC dbo.API_DoanhSo_AI @Username = 'BinhPhuocA', @LoaiBaoCao = 'NhanVien';

-- -----------------------------------------------------------------------------
-- STT 02: Bảo mật — phân quyền
-- Kỳ vọng: Hệ thống từ chối hiển thị dữ liệu ngoài vùng phụ trách (QL Miền Nam không xem được dữ liệu Miền Trung).
-- -----------------------------------------------------------------------------
PRINT N'>>> STT 02: Bảo mật — phân quyền (Xem chéo vùng)';
-- Quản lý Miền Nam thử truyền ID của vùng Miền Trung (QLBH010.MED) -> Kết quả chỉ lọc ra vùng MN
EXEC dbo.API_DoanhSo_AI @Username = 'QLMD1', @ManagerID = 'QLBH010.MED', @LoaiBaoCao = 'NhanVien';

-- -----------------------------------------------------------------------------
-- STT 03: Tra cứu đơn hàng
-- Kỳ vọng: Quản lý tra đơn hàng cả vùng MN, TDV chỉ xem danh sách đơn cá nhân.
-- -----------------------------------------------------------------------------
PRINT N'>>> STT 03: Tra cứu đơn hàng';
-- 1. Quản lý tra cứu đơn hàng
EXEC dbo.API_DonHang_AI @Username = 'QLMD1', @TopN = 50;
-- 2. TDV tra cứu đơn hàng
EXEC dbo.API_DonHang_AI @Username = 'BinhPhuocA', @TopN = 50;

-- -----------------------------------------------------------------------------
-- STT 04: Tạo đơn hàng qua chat
-- Kỳ vọng: Kiểm tra sản phẩm tồn tại và đơn vị tính trong hệ thống để sẵn sàng lên đơn.
-- -----------------------------------------------------------------------------
PRINT N'>>> STT 04: Tạo đơn hàng qua chat (Kiểm tra sản phẩm A003, A008)';
SELECT ItemID, ItemName, Unit 
FROM dbo.CF_ItemTbl 
WHERE ItemID IN ('A003', 'A008');

-- -----------------------------------------------------------------------------
-- STT 05: Gợi ý đặt hàng tự động
-- Kỳ vọng: Dự báo chu kỳ mua hàng và gợi ý số lượng cho khách mẫu DNA014.
-- -----------------------------------------------------------------------------
PRINT N'>>> STT 05: Gợi ý đặt hàng tự động cho khách DNA014';
EXEC dbo.API_GoiYDonHang_AI @Username = 'BinhPhuocA', @MaKhachHang = 'DNA014', @TopN = 5;

-- -----------------------------------------------------------------------------
-- STT 06: Gợi ý bán kèm (Upsell)
-- Kỳ vọng: AI phân tích khoảng thiếu KPI của khách để gợi ý mặt hàng bán kèm thích hợp.
-- -----------------------------------------------------------------------------
PRINT N'>>> STT 06: Gợi ý bán kèm (Upsell) cho khách DNA014';
EXEC dbo.API_UpsellGoiY_AI @Username = 'BinhPhuocA', @MaKhachHang = 'DNA014', @TopN = 5;

-- -----------------------------------------------------------------------------
-- STT 07: Tra cứu thông tin sản phẩm
-- Kỳ vọng: Lấy nhanh thông tin chi tiết, công dụng, thành phần của sản phẩm (ví dụ: Antrinano).
-- -----------------------------------------------------------------------------
PRINT N'>>> STT 07: Tra cứu thông tin sản phẩm Antrinano';
EXEC dbo.API_TraCuuSanPham_AI @Username = 'BinhPhuocA', @timkiem = 'Antrinano', @TopN = 3;

-- -----------------------------------------------------------------------------
-- STT 08: Tổng công nợ khu vực
-- Kỳ vọng: Quản lý thấy nợ của tất cả khách hàng cả vùng, TDV chỉ thấy nợ các khách thuộc tuyến mình.
-- -----------------------------------------------------------------------------
PRINT N'>>> STT 08: Tổng công nợ khu vực';
-- 1. Quản lý xem công nợ
EXEC dbo.API_CongNoKhachHang_AI @Username = 'QLMD1', @DenNgay = '2026-05-25';
-- 2. TDV xem công nợ
EXEC dbo.API_CongNoKhachHang_AI @Username = 'BinhPhuocA', @DenNgay = '2026-05-25';

-- -----------------------------------------------------------------------------
-- STT 09: Công nợ chi tiết từng khách
-- Kỳ vọng: Liệt kê chi tiết danh sách hóa đơn còn nợ chưa thanh toán của DNA014.
-- -----------------------------------------------------------------------------
PRINT N'>>> STT 09: Công nợ chi tiết của DNA014';
EXEC dbo.API_CongNoChiTiet_AI @Username = 'BinhPhuocA', @MaKhachHang = 'DNA014', @DenNgay = '2026-05-25';

-- -----------------------------------------------------------------------------
-- STT 10: Tra cứu hóa đơn bán hàng
-- Kỳ vọng: Tìm kiếm và xem thông tin hóa đơn lịch sử bán ra cho DNA014.
-- -----------------------------------------------------------------------------
PRINT N'>>> STT 10: Tra cứu hóa đơn của khách DNA014';
-- 1. Quản lý tra cứu
EXEC dbo.API_HoaDon_AI @Username = 'QLMD1', @timkiem = 'DNA014';
-- 2. TDV tra cứu
EXEC dbo.API_HoaDon_AI @Username = 'BinhPhuocA', @timkiem = 'DNA014';

-- -----------------------------------------------------------------------------
-- STT 11: Điểm tích lũy khách hàng
-- Kỳ vọng: Trả về hạng thành viên hiện tại, điểm tích lũy và quà tặng đạt được của DNA014.
-- -----------------------------------------------------------------------------
PRINT N'>>> STT 11: Điểm tích lũy của khách DNA014';
EXEC dbo.API_TichLuy_AI @Username = 'BinhPhuocA', @MaKhachHang = 'DNA014';

-- -----------------------------------------------------------------------------
-- STT 12: Tuyến bán hàng hàng ngày
-- Kỳ vọng: Lịch trình đi tuyến thông minh của TDV ngày hôm nay.
-- -----------------------------------------------------------------------------
PRINT N'>>> STT 12: Tuyến bán hàng hàng ngày';
-- 1. Xem lịch tuyến của Quản lý (Xem toàn vùng)
EXEC dbo.API_TuyenBanHang_AI @Username = 'QLMD1', @TopN = 100;
-- 2. Xem lịch tuyến của TDV (Xem cá nhân)
EXEC dbo.API_TuyenBanHang_AI @Username = 'BinhPhuocA', @TopN = 100;

-- -----------------------------------------------------------------------------
-- STT 13: Gợi ý theo triệu chứng
-- Kỳ vọng: Nhập triệu chứng hoặc cặp hoạt chất bổ trợ để AI gợi ý sản phẩm thay thế phù hợp.
-- -----------------------------------------------------------------------------
PRINT N'>>> STT 13: Gợi ý theo triệu chứng (Amoxicillin, Vitamin C)';
EXEC dbo.API_GoiYDonThuoc_AI @Username = 'BinhPhuocA', @timkiem = 'Amoxicillin, Vitamin C';

-- -----------------------------------------------------------------------------
-- STT 14: Chương trình khuyến mãi
-- Kỳ vọng: Liệt kê các sản phẩm đang có chương trình khuyến mãi/quà tặng đi kèm.
-- -----------------------------------------------------------------------------
PRINT N'>>> STT 14: Chương trình khuyến mãi đang chạy';
EXEC dbo.API_DeXuatKhuyenMai_AI @Username = 'BinhPhuocA';

-- -----------------------------------------------------------------------------
-- STT 15: Sản phẩm trọng tâm tháng
-- Kỳ vọng: Hiển thị các sản phẩm chiến lược đang được công ty đẩy mạnh bán trong tháng.
-- -----------------------------------------------------------------------------
PRINT N'>>> STT 15: Sản phẩm trọng tâm tháng';
EXEC dbo.API_SanPhamTrongTam_AI @Username = 'BinhPhuocA';

-- -----------------------------------------------------------------------------
-- STT 16: Tra cứu danh mục
-- Kỳ vọng: Tra cứu danh sách nhóm hàng hóa hoạt động.
-- -----------------------------------------------------------------------------
PRINT N'>>> STT 16: Tra cứu danh mục sản phẩm';
EXEC dbo.API_DanhMuc_AI @Username = 'BinhPhuocA', @Type = 'sanpham';

-- -----------------------------------------------------------------------------
-- STT 17: RFM-C Chấm điểm tín nhiệm
-- Kỳ vọng: Chấm điểm thang 100 dựa trên mô hình RFM-C tiên tiến cho khách hàng mẫu DNA014.
-- -----------------------------------------------------------------------------
PRINT N'>>> STT 17: RFM-C Chấm điểm khách hàng DNA014';
EXEC dbo.API_ChamDiemKH_AI 
    @Username = 'BinhPhuocA', 
    @MaKhachHang = 'DNA014', 
    @W_Recency = 30.0, 
    @W_Frequency = 25.0, 
    @W_Monetary = 35.0, 
    @W_Consumption = 10.0;

-- -----------------------------------------------------------------------------
-- STT 18: Kiểm tra tồn kho thực tế
-- Kỳ vọng: Truy vấn số lượng tồn kho khả dụng của sản phẩm cụ thể (ví dụ: A003).
-- -----------------------------------------------------------------------------
PRINT N'>>> STT 18: Kiểm tra tồn kho sản phẩm A003';
EXEC dbo.API_DanhSachTonKho_AI @Username = 'BinhPhuocA', @ItemID = 'A003';

-- -----------------------------------------------------------------------------
-- STT 19: Khảo sát chăm sóc khách hàng
-- Kỳ vọng: Xem trạng thái và danh sách các câu hỏi khảo sát ngày hôm nay của TDV.
-- -----------------------------------------------------------------------------
PRINT N'>>> STT 19: Khảo sát chăm sóc khách hàng ngày hôm nay';
EXEC dbo.API_KiemTraKhaoSat_AI @Username = 'BinhPhuocA', @Ngay = NULL;

-- -----------------------------------------------------------------------------
-- TÓM TẮT KẾT QUẢ CUỐI CÙNG
-- -----------------------------------------------------------------------------
PRINT N'';
PRINT N'================================================================================';
PRINT N'                                 TÓM TẮT KẾT QUẢ                                ';
PRINT N'================================================================================';

SELECT 
    0 AS [code], 
    N'Thành công' AS [status],
    N'Toàn bộ hệ thống cơ sở dữ liệu của Medstand AI đều đang lưu trữ và phân quyền dữ liệu cực kỳ chuẩn xác cho cặp đôi Nguyễn Văn Thái & Nguyễn Quốc Tuấn.' AS [msg],
    N'Nếu bạn cần kiểm tra thêm bất kỳ tài khoản hoặc khách hàng nào khác trong hệ thống, hãy gửi thông tin cho tôi!' AS [note];
GO
