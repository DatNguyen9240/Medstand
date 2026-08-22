-- =========================================================================
-- KỊCH BẢN TẠO DỮ LIỆU GIẢ CHO CÁC MODULE AI NÂNG CAO (MEDSTAND ERP)
-- Mục đích: Đảm bảo các Module AI (Tuyến bán hàng, Tích lũy) không bị trống dữ liệu.
-- =========================================================================

BEGIN TRANSACTION;
BEGIN TRY

    -- ════════════════════════════════════════════════════════════════════════
    -- 1. CẬP NHẬT DỮ LIỆU TUYẾN BÁN HÀNG (Phục vụ Module 2 - API_TuyenBanHang_AI)
    -- Vấn đề: Khách hàng thiếu ZoneID (Tuyến) và ThuTrongTuan (Lịch ghé) sẽ bị AI bỏ qua.
    -- Giải quyết: Gắn ngẫu nhiên Tuyến và set Lịch ghé full tuần cho các KH đang test.
    -- ════════════════════════════════════════════════════════════════════════
    UPDATE CF_ObjectTbl
    SET ZoneID = 'TUYEN01',
        ThuTrongTuan = '1234567' -- Viết liền để không bị vượt quá giới hạn ký tự của cột
    WHERE ISNULL(isCustomer, 0) = 1 
      AND ObjectID IN (
          SELECT ObjectID FROM AR_InvoiceTbl 
          WHERE EmployeeID IN ('MED0330','MED0229','MED0637','MED0096','QLBH024','MED0134','QLMD1')
      );

    -- ════════════════════════════════════════════════════════════════════════
    -- 2. TẠO CHƯƠNG TRÌNH TÍCH LŨY / SẢN PHẨM TRỌNG TÂM (Phục vụ Module 4 - API_TichLuy_AI)
    -- Vấn đề: Không có chương trình nào đang chạy -> AI báo "Không tìm thấy dữ liệu".
    -- Giải quyết: Tạo 1 chương trình MOCK_CTKM kéo dài 3 tháng, kèm Quà Tặng.
    -- ════════════════════════════════════════════════════════════════════════
    
    -- Xóa dữ liệu cũ nếu chạy lại nhiều lần
    DELETE FROM AR_SanPhamTrongTamDetailTbl WHERE DocumentID = 'MOCK_CTKM_THANG5';
    DELETE FROM AR_PromotionGiftTbl WHERE DocumentID = 'MOCK_CTKM_THANG5';
    DELETE FROM AR_PromotionTbl WHERE DocumentID = 'MOCK_CTKM_THANG5';
    DELETE FROM AR_SanPhamTrongTamTbl WHERE DocumentID = 'MOCK_CTKM_THANG5';

    -- A. Tạo Header Chương trình
    INSERT INTO AR_SanPhamTrongTamTbl (DocumentID, Memo, FromDate, ToDate)
    VALUES ('MOCK_CTKM_THANG5', N'CHƯƠNG TRÌNH TRỌNG TÂM THÁNG 5 NĂM 2026', '2026-05-01', '2026-05-31');

    INSERT INTO AR_PromotionTbl (DocumentID, FromDate, ToDate)
    VALUES ('MOCK_CTKM_THANG5', '2026-05-01', '2026-05-31');

    -- B. Thêm các mốc quà tặng
    INSERT INTO AR_PromotionGiftTbl (DocumentID, TuDiem, DenDiem, QuaTang)
    VALUES ('MOCK_CTKM_THANG5', 1000000, 2499999, N'05 hộp que thử thai'),
           ('MOCK_CTKM_THANG5', 2500000, 3499999, N'15 hộp que thử thai'),
           ('MOCK_CTKM_THANG5', 3500000, 5999999, N'20 hộp que thử thai'),
           ('MOCK_CTKM_THANG5', 6000000, 8999999, N'40 hộp que thử thai'),
           ('MOCK_CTKM_THANG5', 9000000, 14999999, N'100 hộp que thử thai'),
           ('MOCK_CTKM_THANG5', 15000000, 999999999, N'200 hộp que thử thai');

    -- C. Gắn sản phẩm trọng tâm chính xác theo danh sách sếp cung cấp
    INSERT INTO AR_SanPhamTrongTamDetailTbl (UserAutoID, DocumentID, ItemID)
    SELECT NEWID(), 'MOCK_CTKM_THANG5', ItemID 
    FROM CF_ItemTbl 
    WHERE ItemID IN (
        'A003', 'A004', 'A005', 'A006', 'A008', 'A012', 'A014', 'A015', 'A016', 'A017', 
        'B004', 'B005', 'B006', 'B007', 'B009', 'B040', 'B044', 'B012', 'B015', 'B019', 
        'B020', 'B021', 'B022', 'B026', 'B028', 'B029', 'B036', 'B037', 'B039', 'B041', 
        'B042', 'C016', 'C017', 'C018', 'D012', 'D017', 'D018', 'D020', 'D021', 'D022', 
        'D023', 'E004', 'F003', 'F005', 'F009', 'F010', 'F011', 'F012', 'G004', 'G005', 
        'G010', 'G011', 'H006', 'H008', 'S036', 'H011', 'H012', 'H016', 'H014', 'J003', 
        'J008', 'K030', 'K031', 'K032', 'K033', 'L002', 'L003', 'L009', 'L010', 'L011', 
        'L012', 'M014', 'M015', 'M018', 'M027', 'M028', 'M029', 'M030', 'N004', 'N014', 
        'N017', 'N018', 'O006', 'O007', 'O005', 'S030', 'S031', 'S032', 'S033', 'T022', 
        'T023', 'V002', 'V016', 'V017', 'V018', 'V019', 'X011', 'X012', 'Y011', 'Y012', 
        'Y014', 'Y015', 'Y016', 'YT001', 'YT002', 'YT003', 'Z002'
    );

    COMMIT TRANSACTION;
    PRINT N'✅ ĐÃ CẬP NHẬT XONG DỮ LIỆU ĐỂ TEST CÁC MODULE TUYẾN BÁN HÀNG VÀ TÍCH LŨY!';

END TRY
BEGIN CATCH
    ROLLBACK TRANSACTION;
    PRINT N'❌ LỖI: ' + ERROR_MESSAGE();
END CATCH;
