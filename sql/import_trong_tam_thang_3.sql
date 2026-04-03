-- ==================================================================
-- SCRIPT IMPORT CHƯƠNG TRÌNH SẢN PHẨM TRỌNG TÂM THÁNG 3 - 2026
-- ==================================================================

-- 1. Định nghĩa tham số chương trình
DECLARE @DocID VARCHAR(50) = 'CTTT202603';
DECLARE @Memo  NVARCHAR(200) = N'CHƯƠNG TRÌNH TRỌNG TÂM THÁNG 3 NĂM 2026';
DECLARE @From  DATETIME = '2026-03-31';
DECLARE @To    DATETIME = '2026-04-28';

-- 2. Xóa dữ liệu cũ nếu đã tồn tại để tránh trùng lặp khi chạy lại
DELETE FROM AR_SanPhamTrongTamDetailTbl WHERE DocumentID = @DocID;
DELETE FROM AR_SanPhamTrongTamTbl WHERE DocumentID = @DocID;

-- 3. Chèn Header
INSERT INTO AR_SanPhamTrongTamTbl (DocumentID, FromDate, ToDate, Memo, isLock, UserCreate, DateCreate)
VALUES (@DocID, @From, @To, @Memo, 0, 'AI_AGENT', GETDATE());

-- 4. Chèn chi tiết 103 sản phẩm
INSERT INTO AR_SanPhamTrongTamDetailTbl (UserAutoID, DocumentID, ItemID, Notes)
VALUES 
(NEWID(), @DocID, 'A008', N'Đơn giá: 75.000'),
(NEWID(), @DocID, 'A012', N'Đơn giá: 150.000'),
(NEWID(), @DocID, 'A014', N'Đơn giá: 95.000'),
(NEWID(), @DocID, 'A015', N'Đơn giá: 185.000'),
(NEWID(), @DocID, 'A016', N'Đơn giá: 135.000'),
(NEWID(), @DocID, 'A017', N'Đơn giá: 135.000'),
(NEWID(), @DocID, 'B004', N'Đơn giá: 145.000'),
(NEWID(), @DocID, 'B005', N'Đơn giá: 12.000'),
(NEWID(), @DocID, 'B006', N'Đơn giá: 12.000'),
(NEWID(), @DocID, 'B007', N'Đơn giá: 12.000'),
(NEWID(), @DocID, 'B009', N'Đơn giá: 125.000'),
(NEWID(), @DocID, 'B040', N'Đơn giá: 35.000'),
(NEWID(), @DocID, 'B044', N'Đơn giá: 35.000'),
(NEWID(), @DocID, 'B012', N'Đơn giá: 35.000'),
(NEWID(), @DocID, 'B015', N'Đơn giá: 125.000'),
(NEWID(), @DocID, 'B019', N'Đơn giá: 115.000'),
(NEWID(), @DocID, 'B020', N'Đơn giá: 18.000'),
(NEWID(), @DocID, 'B021', N'Đơn giá: 50.000'),
(NEWID(), @DocID, 'B022', N'Đơn giá: 105.000'),
(NEWID(), @DocID, 'B026', N'Đơn giá: 65.000'),
(NEWID(), @DocID, 'B028', N'Đơn giá: 210.000'),
(NEWID(), @DocID, 'B029', N'Đơn giá: 95.000'),
(NEWID(), @DocID, 'B036', N'Đơn giá: 158.000'),
(NEWID(), @DocID, 'B037', N'Đơn giá: 105.000'),
(NEWID(), @DocID, 'B039', N'Đơn giá: 55.000'),
(NEWID(), @DocID, 'B041', N'Đơn giá: 460.000'),
(NEWID(), @DocID, 'B042', N'Đơn giá: 60.000'),
(NEWID(), @DocID, 'C016', N'Đơn giá: 30.000'),
(NEWID(), @DocID, 'C017', N'Đơn giá: 198.000'),
(NEWID(), @DocID, 'C018', N'Đơn giá: 270.000'),
(NEWID(), @DocID, 'D012', N'Đơn giá: 145.000'),
(NEWID(), @DocID, 'D017', N'Đơn giá: 145.000'),
(NEWID(), @DocID, 'D018', N'Đơn giá: 75.000'),
(NEWID(), @DocID, 'D020', N'Đơn giá: 150.000'),
(NEWID(), @DocID, 'D021', N'Đơn giá: 60.000'),
(NEWID(), @DocID, 'D022', N'Đơn giá: 450.000'),
(NEWID(), @DocID, 'D023', N'Đơn giá: 39.000'),
(NEWID(), @DocID, 'E004', N'Đơn giá: 195.000'),
(NEWID(), @DocID, 'F003', N'Đơn giá: 55.000'),
(NEWID(), @DocID, 'F005', N'Đơn giá: 45.000'),
(NEWID(), @DocID, 'F009', N'Đơn giá: 50.000'),
(NEWID(), @DocID, 'F010', N'Đơn giá: 125.000'),
(NEWID(), @DocID, 'F011', N'Đơn giá: 45.000'),
(NEWID(), @DocID, 'F012', N'Đơn giá: 130.000'),
(NEWID(), @DocID, 'G004', N'Đơn giá: 68.000'),
(NEWID(), @DocID, 'G005', N'Đơn giá: 150.000'),
(NEWID(), @DocID, 'G010', N'Đơn giá: 210.000'),
(NEWID(), @DocID, 'G011', N'Đơn giá: 50.000'),
(NEWID(), @DocID, 'H006', N'Đơn giá: 45.000'),
(NEWID(), @DocID, 'H008', N'Đơn giá: 65.000'),
(NEWID(), @DocID, 'S036', N'Đơn giá: 65.000'),
(NEWID(), @DocID, 'H011', N'Đơn giá: 50.000'),
(NEWID(), @DocID, 'H012', N'Đơn giá: 50.000'),
(NEWID(), @DocID, 'H016', N'Đơn giá: 50.000'),
(NEWID(), @DocID, 'H014', N'Đơn giá: 175.000'),
(NEWID(), @DocID, 'J003', N'Đơn giá: 85.000'),
(NEWID(), @DocID, 'J008', N'Đơn giá: 79.000'),
(NEWID(), @DocID, 'K030', N'Đơn giá: 85.000'),
(NEWID(), @DocID, 'K031', N'Đơn giá: 95.000'),
(NEWID(), @DocID, 'K032', N'Đơn giá: 185.000'),
(NEWID(), @DocID, 'K033', N'Đơn giá: 98.000'),
(NEWID(), @DocID, 'L002', N'Đơn giá: 65.000'),
(NEWID(), @DocID, 'L003', N'Đơn giá: 75.000'),
(NEWID(), @DocID, 'L009', N'Đơn giá: 270.000'),
(NEWID(), @DocID, 'L010', N'Đơn giá: 420.000'),
(NEWID(), @DocID, 'L011', N'Đơn giá: 135.000'),
(NEWID(), @DocID, 'L012', N'Đơn giá: 750.000'),
(NEWID(), @DocID, 'M014', N'Đơn giá: 150.000'),
(NEWID(), @DocID, 'M015', N'Đơn giá: 150.000'),
(NEWID(), @DocID, 'M018', N'Đơn giá: 95.000'),
(NEWID(), @DocID, 'M027', N'Đơn giá: 75.000'),
(NEWID(), @DocID, 'M028', N'Đơn giá: 150.000'),
(NEWID(), @DocID, 'M029', N'Đơn giá: 55.000'),
(NEWID(), @DocID, 'M030', N'Đơn giá: 290.000'),
(NEWID(), @DocID, 'N004', N'Đơn giá: 85.000'),
(NEWID(), @DocID, 'N014', N'Đơn giá: 68.000'),
(NEWID(), @DocID, 'N017', N'Đơn giá: 95.000'),
(NEWID(), @DocID, 'N018', N'Đơn giá: 55.000'),
(NEWID(), @DocID, 'O006', N'Đơn giá: 50.000'),
(NEWID(), @DocID, 'O007', N'Đơn giá: 50.000'),
(NEWID(), @DocID, 'O005', N'Đơn giá: 230.000'),
(NEWID(), @DocID, 'S030', N'Đơn giá: 270.000'),
(NEWID(), @DocID, 'S031', N'Đơn giá: 35.000'),
(NEWID(), @DocID, 'S032', N'Đơn giá: 28.000'),
(NEWID(), @DocID, 'S033', N'Đơn giá: 39.000'),
(NEWID(), @DocID, 'T022', N'Đơn giá: 198.000'),
(NEWID(), @DocID, 'T023', N'Đơn giá: 45.000'),
(NEWID(), @DocID, 'V002', N'Đơn giá: 135.000'),
(NEWID(), @DocID, 'V016', N'Đơn giá: 135.000'),
(NEWID(), @DocID, 'V017', N'Đơn giá: 198.000'),
(NEWID(), @DocID, 'V018', N'Đơn giá: 180.000'),
(NEWID(), @DocID, 'V019', N'Đơn giá: 45.000'),
(NEWID(), @DocID, 'X011', N'Đơn giá: 85.000'),
(NEWID(), @DocID, 'X012', N'Đơn giá: 85.000'),
(NEWID(), @DocID, 'Y011', N'Đơn giá: 45.000'),
(NEWID(), @DocID, 'Y012', N'Đơn giá: 270.000'),
(NEWID(), @DocID, 'Y014', N'Đơn giá: 45.000'),
(NEWID(), @DocID, 'Y015', N'Đơn giá: 45.000'),
(NEWID(), @DocID, 'Y016', N'Đơn giá: 270.000'),
(NEWID(), @DocID, 'YT001', N'Đơn giá: 135.000'),
(NEWID(), @DocID, 'YT002', N'Đơn giá: 135.000'),
(NEWID(), @DocID, 'YT003', N'Đơn giá: 135.000'),
(NEWID(), @DocID, 'Z002', N'Đơn giá: 125.000');

SELECT @DocID AS ResultID, N'Import thành công 103 sản phẩm' AS Msg;
GO
