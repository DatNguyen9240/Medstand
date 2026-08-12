-- ==============================================================================
-- DỰ ÁN: Medstand ERP AI Integration
-- MỤC ĐÍCH: Phân bổ dữ liệu mẫu (Orders & Invoices) cho 7 tài khoản TDV (Sales) mới
--           bằng cách chia đôi (50%) các đơn hàng hiện tại của Quản lý sang cho TDV.
--           Cách này giúp:
--           1. Giữ nguyên tổng số liệu doanh số toàn hệ thống.
--           2. Khi Quản lý đăng nhập: Xem được 100% doanh số vùng (bao gồm của mình + TDV).
--           3. Khi TDV đăng nhập: Chỉ xem được 50% dữ liệu đã phân bổ của riêng mình.
-- PHIÊN BẢN: V38 · 05/2026
-- ==============================================================================

BEGIN TRANSACTION;
BEGIN TRY

    PRINT '----------------------------------------------------------------------';
    PRINT '⚙️ BƯỚC 1: KHỞI TẠO BẢNG MAPPING GIỮA QUẢN LÝ VÀ TDV';
    PRINT '----------------------------------------------------------------------';

    -- Khai báo bảng ánh xạ Manager -> TDV
    DECLARE @Mapping TABLE (
        ManagerEmpID VARCHAR(50),
        TDVEmpID VARCHAR(50),
        BranchID VARCHAR(50)
    );

    INSERT INTO @Mapping (ManagerEmpID, TDVEmpID, BranchID) VALUES
    ('MED0330', 'MED0085', 'MB'),        -- QL Mai Anh Tuấn -> Đoàn Văn Thế
    ('MED0229', 'TDV_BACNINHA', 'MB'),   -- QL Trần Văn Hướng -> TDV Bắc Ninh A
    ('MED0185', 'TDV_HUEB', 'MT'),       -- QL Nguyễn Thế Anh -> TDV Huế B
    ('MED0096', 'TDV_DANANGA', 'MT'),    -- QL Nguyễn Văn Việt Anh -> TDV Đà Nẵng A
    ('MED0134', 'TDV_CANTHOA', 'MN'),    -- QL Trần Văn Luân -> TDV Cần Thơ A
    ('QLMD1',   'TDV_BINHPHUOCA', 'MN'), -- QL Nguyễn Văn Thái -> TDV Bình Phước A
    ('QLBH024', 'TDV_BINHPHUOCA', 'MN'); -- QL Ngô Đức Hùng -> TDV Bình Phước A


    PRINT '----------------------------------------------------------------------';
    PRINT '⚙️ BƯỚC 2: CẬP NHẬT CỘT MANAGERID TRÊN TOÀN BỘ ĐƠN HÀNG/HÓA ĐƠN';
    PRINT '----------------------------------------------------------------------';
    
    -- Đảm bảo tất cả các đơn hàng của Quản lý và TDV đều có ManagerID và BranchID chuẩn xác
    UPDATE O
    SET O.ManagerID = M.ManagerEmpID,
        O.BranchID = M.BranchID
    FROM AR_OrderTbl O
    INNER JOIN @Mapping M ON O.EmployeeID = M.ManagerEmpID
    WHERE O.ManagerID IS NULL OR O.ManagerID = '' OR O.BranchID IS NULL OR O.BranchID = '';

    UPDATE I
    SET I.ManagerID = M.ManagerEmpID,
        I.BranchID = M.BranchID
    FROM AR_InvoiceTbl I
    INNER JOIN @Mapping M ON I.EmployeeID = M.ManagerEmpID
    WHERE I.ManagerID IS NULL OR I.ManagerID = '' OR I.BranchID IS NULL OR I.BranchID = '';

    PRINT '✅ Đã chuẩn hóa ManagerID và BranchID trên các giao dịch gốc của Quản lý';


    PRINT '----------------------------------------------------------------------';
    PRINT '⚙️ BƯỚC 3: PHÂN BỔ 50% ĐƠN HÀNG (AR_OrderTbl) SANG CHO TDV';
    PRINT '----------------------------------------------------------------------';

    -- Dùng bảng tạm chứa ID các đơn hàng sẽ chuyển giao cho TDV (chọn 50% số đơn hàng ngẫu nhiên/theo thứ tự của từng quản lý)
    CREATE TABLE #TempOrdersToTransfer (DocumentID VARCHAR(50), NewEmployeeID VARCHAR(50), NewManagerID VARCHAR(50));

    INSERT INTO #TempOrdersToTransfer (DocumentID, NewEmployeeID, NewManagerID)
    SELECT DocumentID, TDVEmpID, ManagerEmpID
    FROM (
        SELECT 
            O.DocumentID,
            M.TDVEmpID,
            M.ManagerEmpID,
            ROW_NUMBER() OVER (PARTITION BY O.EmployeeID ORDER BY O.DocumentDate DESC) AS RowNum,
            COUNT(*) OVER (PARTITION BY O.EmployeeID) AS TotalCount
        FROM AR_OrderTbl O
        INNER JOIN @Mapping M ON O.EmployeeID = M.ManagerEmpID
    ) Temp
    WHERE RowNum <= (TotalCount / 2); -- Lấy đúng 50% số lượng đơn của từng quản lý

    -- Thực hiện chuyển đổi
    UPDATE O
    SET O.EmployeeID = T.NewEmployeeID,
        O.ManagerID = T.NewManagerID
    FROM AR_OrderTbl O
    INNER JOIN #TempOrdersToTransfer T ON O.DocumentID = T.DocumentID;

    DECLARE @OrdersTransferred INT = @@ROWCOUNT;
    PRINT '✅ Đã phân bổ ' + CAST(@OrdersTransferred AS VARCHAR(10)) + ' đơn hàng mẫu (Orders) từ Quản lý sang TDV';


    PRINT '----------------------------------------------------------------------';
    PRINT '⚙️ BƯỚC 4: PHÂN BỔ 50% HÓA ĐƠN DOANH SỐ (AR_InvoiceTbl) SANG CHO TDV';
    PRINT '----------------------------------------------------------------------';

    -- Tương tự với hóa đơn kế toán doanh số để khớp với đơn hàng
    CREATE TABLE #TempInvoicesToTransfer (DocumentID VARCHAR(50), NewEmployeeID VARCHAR(50), NewManagerID VARCHAR(50));

    INSERT INTO #TempInvoicesToTransfer (DocumentID, NewEmployeeID, NewManagerID)
    SELECT DocumentID, TDVEmpID, ManagerEmpID
    FROM (
        SELECT 
            I.DocumentID,
            M.TDVEmpID,
            M.ManagerEmpID,
            ROW_NUMBER() OVER (PARTITION BY I.EmployeeID ORDER BY I.DocumentDate DESC) AS RowNum,
            COUNT(*) OVER (PARTITION BY I.EmployeeID) AS TotalCount
        FROM AR_InvoiceTbl I
        INNER JOIN @Mapping M ON I.EmployeeID = M.ManagerEmpID
    ) Temp
    WHERE RowNum <= (TotalCount / 2);

    -- Thực hiện chuyển đổi
    UPDATE I
    SET I.EmployeeID = T.NewEmployeeID,
        I.ManagerID = T.NewManagerID
    FROM AR_InvoiceTbl I
    INNER JOIN #TempInvoicesToTransfer T ON I.DocumentID = T.DocumentID;

    DECLARE @InvoicesTransferred INT = @@ROWCOUNT;
    PRINT '✅ Đã phân bổ ' + CAST(@InvoicesTransferred AS VARCHAR(10)) + ' hóa đơn mẫu (Invoices) từ Quản lý sang TDV';

    -- Giải phóng tài nguyên
    DROP TABLE #TempOrdersToTransfer;
    DROP TABLE #TempInvoicesToTransfer;

    COMMIT TRANSACTION;
    PRINT '----------------------------------------------------------------------';
    PRINT '✅ ĐỒNG BỘ DỮ LIỆU MẪU TDV HOÀN TẤT THÀNH CÔNG!';
    PRINT '----------------------------------------------------------------------';

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    IF OBJECT_ID('tempdb..#TempOrdersToTransfer') IS NOT NULL DROP TABLE #TempOrdersToTransfer;
    IF OBJECT_ID('tempdb..#TempInvoicesToTransfer') IS NOT NULL DROP TABLE #TempInvoicesToTransfer;
    
    DECLARE @ErrMsg NVARCHAR(500) = ERROR_MESSAGE();
    PRINT N'❌ LỖI KHI ĐỒNG BỘ DỮ LIỆU MẪU: ' + @ErrMsg;
END CATCH;
