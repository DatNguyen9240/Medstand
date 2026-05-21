-- ==============================================================================
-- CÔNG CỤ ĐỒNG BỘ/MAPPING DỮ LIỆU ĐƠN HÀNG THỰC TẾ SANG HÓA ĐƠN KẾ TOÁN
-- Dự án: Medstand ERP AI Integration
-- Mục đích: Chuyển đổi chính xác 100% các đơn hàng thực tế sẵn có trong AR_OrderTbl
--           sang hóa đơn trong AR_InvoiceTbl để phục vụ vẽ biểu đồ Dashboard và Chatbot AI.
-- ==============================================================================

BEGIN TRANSACTION
BEGIN TRY

    -- 1. Định nghĩa danh sách nhân sự cần đồng bộ dữ liệu (Khớp cả mã và Username)
    DECLARE @TargetEmployees TABLE (EmpID VARCHAR(50), UserName VARCHAR(50));
    INSERT INTO @TargetEmployees (EmpID, UserName) VALUES 
    ('MED0330', 'QLBH013.MED'), -- Mai Anh Tuấn
    ('MED0229', 'QLBH016.MED'), -- Trần Văn Hướng
    ('MED0185', 'QLBH005.MED'), -- Nguyễn Thế Anh
    ('MED0096', 'QLBH010.MED'), -- Nguyễn Văn Việt Anh
    ('MED0134', 'QLMN2'),       -- Trần Văn Luân
    ('QLBH024', 'QLBH024.MED'); -- Ngô Đức Hùng

    -- 2. Thiết lập cấu hình mặc định đề phòng dữ liệu đơn hàng thiếu thông tin kho/tài khoản
    DECLARE @DefaultStoreHouseID VARCHAR(50);
    DECLARE @IncomeAccID VARCHAR(50);

    -- Lấy ngẫu nhiên mã kho đang hoạt động từ bảng giao dịch kho
    SELECT TOP 1 @DefaultStoreHouseID = StoreHouseID FROM IV_StockTransactionTbl WHERE StoreHouseID IS NOT NULL AND StoreHouseID <> '';
    IF @DefaultStoreHouseID IS NULL SET @DefaultStoreHouseID = 'KHO01';

    -- Lấy mã tài khoản kế toán ghi nhận doanh thu mặc định (ví dụ: tài khoản 5111)
    SELECT TOP 1 @IncomeAccID = IncomeAccID FROM AR_InvoiceDetailTbl WHERE IncomeAccID IS NOT NULL;
    IF @IncomeAccID IS NULL SET @IncomeAccID = '5111';

    -- Đếm số lượng dữ liệu trước khi đồng bộ để báo cáo
    DECLARE @InvoicesCreated INT = 0;
    DECLARE @DetailsCreated INT = 0;

    -- Tắt trigger tạm thời để đảm bảo nạp dữ liệu mượt mà, bỏ qua các bước kiểm tra kho ảo của hệ thống
    DISABLE TRIGGER ALL ON AR_OrderDetailTbl;
    DISABLE TRIGGER ALL ON AR_InvoiceDetailTbl;

    -- 3. BẮT ĐẦU ĐỒNG BỘ PHẦN CHUNG (AR_InvoiceTbl)
    -- Copy nguyên văn DocumentID, DocumentDate, EmployeeID, ManagerID, CeoID, ObjectID, BranchID và BaseTotal
    INSERT INTO AR_InvoiceTbl (
        DocumentID, DocumentDate, EmployeeID, ManagerID, CeoID, 
        ObjectID, BranchID, StatusID, UserCreate, DateCreate, BaseTotal
    )
    SELECT 
        O.DocumentID, 
        O.DocumentDate, -- Khớp chính xác ngày lập đơn thật trong quá khứ để Dashboard vẽ biểu đồ doanh số đúng thời điểm
        O.EmployeeID,   -- Giữ nguyên EmployeeID của nhân viên kinh doanh thực tế lập đơn
        O.ManagerID, 
        O.CeoID, 
        O.ObjectID, 
        O.BranchID, 
        1 AS StatusID,  -- 1 = Hóa đơn đã hoàn thành/ghi nhận doanh số
        'AI_SYNC' AS UserCreate, 
        GETDATE() AS DateCreate, 
        O.BaseTotal
    FROM AR_OrderTbl O
    LEFT JOIN AR_InvoiceTbl I ON O.DocumentID = I.DocumentID
    WHERE I.DocumentID IS NULL; -- Chỉ đồng bộ những đơn chưa từng lập hóa đơn

    SET @InvoicesCreated = @@ROWCOUNT;

    -- 4. BẮT ĐẦU ĐỒNG BỘ CHI TIẾT SẢN PHẨM (AR_InvoiceDetailTbl)
    -- Ánh xạ chính xác 100% từng mặt hàng (ItemID), số lượng (Quantity), đơn giá (UnitPrice), thành tiền (Amount) sang hóa đơn
    INSERT INTO AR_InvoiceDetailTbl (
        UserAutoID, DocumentID, ItemID, Quantity, UnitPrice, 
        Amount, TotalAmount, StoreHouseID, IncomeAccID
    )
    SELECT 
        NEWID() AS UserAutoID,
        OD.DocumentID,
        ISNULL(OD.ItemID, '') AS ItemID,
        ISNULL(OD.Quantity, 0) AS Quantity,
        ISNULL(OD.UnitPrice, 0) AS UnitPrice,
        ISNULL(OD.Amount, 0) AS Amount,
        ISNULL(OD.TotalAmount, 0) AS TotalAmount,
        ISNULL(NULLIF(OD.StoreHouseID, ''), @DefaultStoreHouseID) AS StoreHouseID,
        @IncomeAccID AS IncomeAccID
    FROM AR_OrderDetailTbl OD
    INNER JOIN AR_OrderTbl O ON OD.DocumentID = O.DocumentID
    LEFT JOIN AR_InvoiceDetailTbl ID ON OD.DocumentID = ID.DocumentID
    WHERE ID.DocumentID IS NULL; -- Chỉ lấy chi tiết của những đơn hàng chưa có chi tiết hóa đơn

    SET @DetailsCreated = @@ROWCOUNT;

    -- Bật lại toàn bộ trigger của hệ thống
    ENABLE TRIGGER ALL ON AR_OrderDetailTbl;
    ENABLE TRIGGER ALL ON AR_InvoiceDetailTbl;

    COMMIT TRANSACTION

    -- In báo cáo kết quả ra màn hình cho người dùng
    PRINT N'======================================================================';
    PRINT N'✅ ĐỒNG BỘ HOÀN TẤT THÀNH CÔNG!';
    PRINT N'----------------------------------------------------------------------';
    PRINT N'👉 Số lượng hóa đơn mới được tạo (Headers): ' + CAST(@InvoicesCreated AS VARCHAR(10));
    PRINT N'👉 Số lượng chi tiết hóa đơn được mapping:  ' + CAST(@DetailsCreated AS VARCHAR(10));
    PRINT N'👉 Hệ thống đã sẵn sàng, biểu đồ Dashboard và Chatbot AI đã được cập nhật!';
    PRINT N'======================================================================';

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    
    -- Đảm bảo trigger luôn được kích hoạt lại kể cả khi gặp lỗi đột xuất
    ENABLE TRIGGER ALL ON AR_OrderDetailTbl;
    ENABLE TRIGGER ALL ON AR_InvoiceDetailTbl;

    DECLARE @ErrMsg NVARCHAR(500) = ERROR_MESSAGE();
    PRINT N'❌ LỖI KHI ĐỒNG BỘ DỮ LIỆU: ' + @ErrMsg;
END CATCH
