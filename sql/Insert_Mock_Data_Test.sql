-- ==============================================================================
-- SCRIPT TẠO DỮ LIỆU MẪU (ĐƠN NHÁP) CHO 6 TÀI KHOẢN ĐỂ TEST CHATBOT
-- LƯU Ý BẢO MẬT: 
-- Script này CHỈ INSERT vào bảng AR_OrderTbl (Đơn nháp) với StatusID = 1 (Chờ duyệt).
-- Tuyệt đối KHÔNG INSERT vào bảng Hóa Đơn (AR_InvoiceTbl).
-- Đảm bảo 100% dữ liệu này không nhảy vào Báo cáo Tài chính Kế toán hay Công nợ thực tế!
-- ==============================================================================

DECLARE @TestEmployees TABLE (EmpID VARCHAR(50));

-- ==============================================================================
-- DỌN DẸP DỮ LIỆU LỖI (Các đơn MOCK bị crash nửa chừng do lỗi code trước đó)
-- ==============================================================================
DELETE FROM AR_InvoiceTbl WHERE DocumentID LIKE 'MOCK_%' AND DocumentID NOT IN (SELECT DocumentID FROM AR_InvoiceDetailTbl);
DELETE FROM AR_OrderDetailTbl WHERE DocumentID LIKE 'MOCK_%' AND DocumentID NOT IN (SELECT DocumentID FROM AR_InvoiceDetailTbl);
DELETE FROM AR_OrderTbl WHERE DocumentID LIKE 'MOCK_%' AND DocumentID NOT IN (SELECT DocumentID FROM AR_InvoiceDetailTbl);

-- Bỏ ông Thế Anh (Admin) ra, chỉ tạo cho 6 ông Sale:
INSERT INTO @TestEmployees (EmpID) VALUES 
('MED0330'), -- Mai Anh Tuấn
('MED0229'), -- Trần Văn Hướng
('MED0637'), -- Nguyễn Văn Thái
('MED0096'), -- Nguyễn Văn Việt Anh
('QLBH024'), -- Ngô Đức Hùng
('MED0134'); -- Trần Văn Luân

DECLARE @CustomerID VARCHAR(50);
DECLARE @ItemID VARCHAR(50);
DECLARE @StoreHouseID VARCHAR(50);
DECLARE @IncomeAccID VARCHAR(50);
DECLARE @BranchID VARCHAR(50) = 'HN'; -- Gán mặc định 1 chi nhánh

-- 1. Lấy ngẫu nhiên 1 Khách hàng và 1 Sản phẩm CÓ THẬT trong Database để không bị lỗi khóa ngoại (Foreign Key)
-- Lấy ngẫu nhiên 1 Khách hàng
SELECT TOP 1 @CustomerID = ObjectID FROM CF_ObjectTbl WHERE isCustomer = 1 AND ISNULL(isDisable, 0) = 0;

-- TÌM SẢN PHẨM CÓ TỒN KHO THẬT (>10) ĐỂ KHÔNG BỊ HỦY KHI DUYỆT ĐƠN TRÊN WEB
SELECT TOP 1 @ItemID = ItemID, @StoreHouseID = StoreHouseID
FROM IV_StockTransactionTbl 
GROUP BY ItemID, StoreHouseID
HAVING SUM(ISNULL(Quantity, 0)) > 10;

-- Tìm 1 mã Tài Khoản Doanh Thu hợp lệ từ csdl cũ (hoặc mặc định 5111)
SELECT TOP 1 @IncomeAccID = IncomeAccID FROM AR_InvoiceDetailTbl WHERE IncomeAccID IS NOT NULL;
IF @IncomeAccID IS NULL SET @IncomeAccID = '5111';

-- Nếu kho hoàn toàn trống không (trường hợp xui nhất), thì lấy tạm sản phẩm bất kỳ
IF @ItemID IS NULL 
    SELECT TOP 1 @ItemID = ItemID FROM CF_ItemTbl WHERE ISNULL(isDisable, 0) = 0;
IF @StoreHouseID IS NULL
    SET @StoreHouseID = 'KHO01'; -- Fallback an toàn

IF @CustomerID IS NULL SET @CustomerID = 'MOCK_CUST';
IF @ItemID IS NULL SET @ItemID = 'MOCK_ITEM';

DECLARE @CurrentEmp VARCHAR(50);
DECLARE @DocID VARCHAR(50);
DECLARE @DocDate DATETIME;
DECLARE @RandomAmount FLOAT;
DECLARE @OrderCount INT;
DECLARE @J INT;

DECLARE emp_cursor CURSOR FOR SELECT EmpID FROM @TestEmployees;
OPEN emp_cursor;
FETCH NEXT FROM emp_cursor INTO @CurrentEmp;

WHILE @@FETCH_STATUS = 0
BEGIN
    -- Số lượng đơn ngẫu nhiên từ 2 đến 5 đơn cho mỗi người
    SET @OrderCount = CAST((RAND() * 4) + 2 AS INT);
    SET @J = 1;

    WHILE @J <= @OrderCount
    BEGIN
        -- Lấy đúng sơ đồ tổ chức (Branch, Manager, Ceo) của nhân viên này để không bị RLS (bảo mật) chặn hiển thị
        DECLARE @EmpBranchID VARCHAR(50) = 'HN';
        DECLARE @EmpManagerID VARCHAR(50) = '';
        DECLARE @EmpCeoID VARCHAR(50) = '';
        
        SELECT TOP 1 
            @EmpBranchID = ISNULL(NULLIF(BranchID, ''), 'HN'),
            @EmpManagerID = ISNULL(ManagerID, ''),
            @EmpCeoID = ISNULL(CeoID, '')
        FROM SY_User 
        WHERE EmployeeID = @CurrentEmp AND ISNULL(Disable, 0) = 0;

        -- Mã chứng từ gắn thêm giờ-phút-giây để mỗi lần chạy sinh ra dữ liệu mới, không đè cái cũ
        SET @DocID = 'MOCK_' + @CurrentEmp + '_' + REPLACE(CONVERT(VARCHAR, GETDATE(), 108), ':', '') + '_' + CAST(@J AS VARCHAR(10));
        
        -- Số tiền ngẫu nhiên từ 1.500.000đ đến 15.000.000đ
        SET @RandomAmount = CAST((RAND() * 13500000) + 1500000 AS INT);

        -- Ngày ngẫu nhiên TRONG 90 NGÀY QUA (để AI có dữ liệu test "tháng trước", "tháng 4", "quý này")
        SET @DocDate = DATEADD(DAY, -CAST(RAND() * 90 AS INT), GETDATE());

        -- 2. TẠO ĐƠN HÀNG (Header & Detail) với StatusID = 3 (Đã hoàn thành/Giao hàng)
        INSERT INTO AR_OrderTbl (DocumentID, DocumentDate, EmployeeID, ManagerID, CeoID, ObjectID, BranchID, StatusID, UserCreate, DateCreate, BaseTotal)
        VALUES (@DocID, @DocDate, @CurrentEmp, @EmpManagerID, @EmpCeoID, @CustomerID, @EmpBranchID, 3, 'AI_MOCK', GETDATE(), @RandomAmount);

        -- Tắt tạm Trigger để ép số liệu ảo (vượt qua lỗi "Không tìm thấy kho")
        DISABLE TRIGGER ALL ON AR_OrderDetailTbl;
        DISABLE TRIGGER ALL ON AR_InvoiceDetailTbl;

        INSERT INTO AR_OrderDetailTbl (UserAutoID, DocumentID, ItemID, Quantity, UnitPrice, Amount, TotalAmount, StoreHouseID)
        VALUES (NEWID(), @DocID, @ItemID, 1, @RandomAmount, @RandomAmount, @RandomAmount, @StoreHouseID);

        -- 3. TẠO HÓA ĐƠN THÀNH CÔNG (StatusID = 1 thường là hóa đơn hợp lệ/đã ghi nhận)
        INSERT INTO AR_InvoiceTbl (DocumentID, DocumentDate, EmployeeID, ManagerID, CeoID, ObjectID, BranchID, StatusID, UserCreate, DateCreate, BaseTotal)
        VALUES (@DocID, @DocDate, @CurrentEmp, @EmpManagerID, @EmpCeoID, @CustomerID, @EmpBranchID, 1, 'AI_MOCK', GETDATE(), @RandomAmount);

        -- PHỤC HỒI CHI TIẾT HÓA ĐƠN KÈM TÀI KHOẢN KẾ TOÁN ĐỂ DASHBOARD ĐỌC ĐƯỢC
        INSERT INTO AR_InvoiceDetailTbl (UserAutoID, DocumentID, ItemID, Quantity, UnitPrice, Amount, TotalAmount, StoreHouseID, IncomeAccID)
        VALUES (NEWID(), @DocID, @ItemID, 1, @RandomAmount, @RandomAmount, @RandomAmount, @StoreHouseID, @IncomeAccID);

        -- Bật lại Trigger ngay lập tức
        ENABLE TRIGGER ALL ON AR_OrderDetailTbl;
        ENABLE TRIGGER ALL ON AR_InvoiceDetailTbl;

        -- GỌI STORED PROCEDURE CỦA HỆ THỐNG ĐỂ TÍNH TOÁN LẠI TỔNG TIỀN VÀ CẬP NHẬT ĐÚNG CÁC CỘT ẨN DOANH SỐ
        EXEC AR_Order_AfterSaveStp @DocID;

        SET @J = @J + 1;
    END

    FETCH NEXT FROM emp_cursor INTO @CurrentEmp;
END;

CLOSE emp_cursor;
DEALLOCATE emp_cursor;

PRINT N'✅ ĐÃ TẠO XONG DỮ LIỆU ĐƠN NHÁP NGẪU NHIÊN CHO 6 NHÂN VIÊN. SẾP CÓ THỂ TEST NGAY!';
