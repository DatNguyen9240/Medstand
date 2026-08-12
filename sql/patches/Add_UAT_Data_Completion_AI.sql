-- ==============================================================================
-- DỰ ÁN: Medstand ERP AI Integration
-- MỤC ĐÍCH: Bổ sung dữ liệu UAT hoàn chỉnh cho 13 tài khoản (7 Quản lý, 6 TDV)
--           để đảm bảo không còn chỉ số nào bằng 0 hoặc bị trống.
-- PHIÊN BẢN: V39 · 20/07/2026
-- ==============================================================================

BEGIN TRANSACTION;
BEGIN TRY

    PRINT '----------------------------------------------------------------------';
    PRINT '⚙️ BƯỚC 1: DỌN DẸP DỮ LIỆU UAT CŨ ĐỂ ĐẢM BẢO IDEMPOTENT';
    PRINT '----------------------------------------------------------------------';

    -- Xóa dư nợ đầu kỳ cũ của UAT
    DELETE FROM SY_BalanceObjectTbl WHERE DocumentID LIKE 'DK_UAT_%';
    
    -- Xóa đơn hàng chờ duyệt cũ của UAT
    DELETE FROM AR_OrderTbl WHERE DocumentID = 'ORD_WAIT_UAT';

    -- Xóa doanh số theo ngày cũ ở đúng nguồn của biểu đồ doanh số.
    DELETE FROM AR_OrderDetailTbl WHERE DocumentID LIKE 'U13D[_]%';
    DELETE FROM AR_OrderTbl WHERE DocumentID LIKE 'U13D[_]%';

    -- Xóa riêng lịch sử gợi ý bổ sung; không đụng hóa đơn thật hoặc fixture khác.
    DELETE FROM AR_InvoiceDetailTbl
    WHERE DocumentID LIKE 'U13S1_MB13_HPA[_]%'
       OR DocumentID LIKE 'U13S1_MB13_DL[_]%'
       OR DocumentID LIKE 'U13D[_]%';

    DELETE FROM AR_InvoiceTbl
    WHERE DocumentID LIKE 'U13S1_MB13_HPA[_]%'
       OR DocumentID LIKE 'U13S1_MB13_DL[_]%'
       OR DocumentID LIKE 'U13D[_]%';

    PRINT '✅ Đã dọn dẹp dữ liệu UAT cũ thành công!';

    PRINT '----------------------------------------------------------------------';
    PRINT '⚙️ BƯỚC 2: CẬP NHẬT LỊCH TRÌNH ĐI TUYẾN PHỦ CẢ TUẦN CHO KHÁCH MỤC TIÊU';
    PRINT '----------------------------------------------------------------------';

    -- Cấu hình động theo ngày hiện tại trong tuần (nếu là Chủ nhật thì gán Thứ 2 để khớp Weekend Shift Guard)
    DECLARE @TodayThu NVARCHAR(10);
    SET DATEFIRST 7;
    SELECT @TodayThu = CASE DATEPART(dw, GETDATE())
        WHEN 1 THEN N'Thứ 2' -- Shift Chủ nhật sang Thứ 2
        WHEN 2 THEN N'Thứ 2'
        WHEN 3 THEN N'Thứ 3'
        WHEN 4 THEN N'Thứ 4'
        WHEN 5 THEN N'Thứ 5'
        WHEN 6 THEN N'Thứ 6'
        WHEN 7 THEN N'Thứ 7'
    END;

    UPDATE CF_ObjectTbl
    SET ThuTrongTuan = @TodayThu
    WHERE ObjectID IN ('HPA515', 'HPA117', 'HPA189', 'BNB161', 'BNB171', 'BNB020', 'HUEB111', 'HUEB105', 'HUEB016', 'QANA371', 'QANA321', 'QANA353', 'DL012', 'DL015', 'DL016', 'SGNB0018', 'SGQ70240', 'SGNB0070');

    PRINT '✅ Đã cập nhật ThuTrongTuan thành ' + @TodayThu + ' cho 18 khách hàng mục tiêu của 6 TDV!';

    PRINT '----------------------------------------------------------------------';
    PRINT '⚙️ BƯỚC 3: BỔ SUNG LỊCH SỬ MUA CHO KHÁCH UAT ĐANG DÙNG TRÊN CHATBOT';
    PRINT '----------------------------------------------------------------------';

    IF NOT EXISTS (
        SELECT 1 FROM dbo.CF_ObjectTbl
        WHERE ObjectID = 'HPA011' AND ISNULL(isCustomer, 0) = 1 AND ISNULL(isDisable, 0) = 0
    )
    BEGIN
        THROW 51001, N'Không tìm thấy khách UAT HPA011 đang hoạt động.', 1;
    END;

    IF NOT EXISTS (
        SELECT 1 FROM dbo.CF_ObjectTbl
        WHERE ObjectID = 'DL011' AND ISNULL(isCustomer, 0) = 1 AND ISNULL(isDisable, 0) = 0
    )
    BEGIN
        THROW 51002, N'Không tìm thấy khách UAT DL011 đang hoạt động.', 1;
    END;

    IF NOT EXISTS (
        SELECT 1 FROM dbo.CF_ItemTbl
        WHERE ItemID IN ('B012', 'B015', 'H006')
        GROUP BY isDisable
        HAVING ISNULL(isDisable, 0) = 0 AND COUNT(DISTINCT ItemID) = 3
    )
    BEGIN
        THROW 51003, N'Không đủ ba sản phẩm mẫu B012/B015/H006 để tạo lịch sử UAT.', 1;
    END;

    DECLARE @RecommendationCustomers TABLE
    (
        ObjectID VARCHAR(50) NOT NULL,
        DocumentPrefix VARCHAR(24) NOT NULL
    );

    INSERT INTO @RecommendationCustomers (ObjectID, DocumentPrefix)
    VALUES
        ('HPA011', 'U13S1_MB13_HPA'),
        ('DL011',  'U13S1_MB13_DL');

    DECLARE @RecommendationInvoices TABLE
    (
        StepNo INT NOT NULL,
        DaysAgo INT NOT NULL,
        BaseTotal DECIMAL(18, 2) NOT NULL
    );

    INSERT INTO @RecommendationInvoices (StepNo, DaysAgo, BaseTotal)
    VALUES
        (1, 91, 125000),
        (2, 61, 160000),
        (3, 31, 125000),
        (4,  1,  35000);

    INSERT INTO dbo.AR_InvoiceTbl
    (
        DocumentID, DocumentDate, ObjectID, EmployeeID, ManagerID,
        Memo, BaseTotal, UserCreate, DateCreate, BranchID, StatusID
    )
    SELECT
        C.DocumentPrefix + '_' + CAST(I.StepNo AS VARCHAR(2)),
        DATEADD(DAY, -I.DaysAgo, CAST(GETDATE() AS DATE)),
        C.ObjectID,
        'MED0330',
        'MED0330',
        N'Lịch sử mua UAT cho 13 tài khoản; có thể xóa bằng tiền tố U13S1_MB13_HPA/U13S1_MB13_DL',
        I.BaseTotal,
        'UAT13_MOCK',
        GETDATE(),
        'MB',
        8
    FROM @RecommendationCustomers C
    CROSS JOIN @RecommendationInvoices I;

    DECLARE @RecommendationDetails TABLE
    (
        StepNo INT NOT NULL,
        ItemID VARCHAR(50) NOT NULL,
        UnitPrice DECIMAL(18, 2) NOT NULL
    );

    INSERT INTO @RecommendationDetails (StepNo, ItemID, UnitPrice)
    VALUES
        (1, 'B015', 85000), (1, 'H006', 40000),
        (2, 'B012', 35000), (2, 'B015', 85000), (2, 'H006', 40000),
        (3, 'B015', 85000), (3, 'H006', 40000),
        (4, 'B012', 35000);

    INSERT INTO dbo.AR_InvoiceDetailTbl
    (
        UserAutoID, DocumentID, ItemID, StoreHouseID, Quantity,
        UnitPrice, SourceAmount, Amount, TotalAmount, IncomeAccID,
        EmployeeID, ManagerID, ObjectID
    )
    SELECT
        CONVERT(VARCHAR(40), NEWID()),
        C.DocumentPrefix + '_' + CAST(D.StepNo AS VARCHAR(2)),
        D.ItemID,
        'CTY',
        1,
        D.UnitPrice,
        D.UnitPrice,
        D.UnitPrice,
        D.UnitPrice,
        '5112',
        'MED0330',
        'MED0330',
        C.ObjectID
    FROM @RecommendationCustomers C
    CROSS JOIN @RecommendationDetails D;

    IF EXISTS (
        SELECT C.ObjectID
        FROM @RecommendationCustomers C
        LEFT JOIN dbo.AR_InvoiceTbl I
          ON I.ObjectID = C.ObjectID
         AND I.StatusID IN (3, 6, 7, 8)
        GROUP BY C.ObjectID
        HAVING COUNT(DISTINCT I.DocumentID) < 4
    )
    BEGIN
        THROW 51004, N'Lịch sử hóa đơn UAT chưa đủ bốn lần mua cho HPA011/DL011.', 1;
    END;

    PRINT '✅ Đã tạo 4 hóa đơn hoàn tất cho HPA011 và DL011; ngày gần nhất luôn là hôm qua.';

    -- Doanh số UAT theo ngày cho 7 nhóm đại diện của 13 tài khoản.
    -- Bắt đầu từ ngày 09 của tháng hiện tại vì dữ liệu demo cũ đã có đến ngày 08.
    DECLARE @DailyStartDate DATE = DATEADD(DAY, 8, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1));
    DECLARE @DailyEndDate DATE = CAST(GETDATE() AS DATE);

    DECLARE @DailyOwners TABLE
    (
        ScenarioCode VARCHAR(4) NOT NULL,
        ObjectID VARCHAR(50) NOT NULL,
        EmployeeID VARCHAR(50) NOT NULL,
        ManagerID VARCHAR(50) NOT NULL,
        BranchID VARCHAR(50) NOT NULL,
        ScenarioNo INT NOT NULL
    );

    INSERT INTO @DailyOwners
        (ScenarioCode, ObjectID, EmployeeID, ManagerID, BranchID, ScenarioNo)
    VALUES
        ('MB13', 'NDB001',   'MED0085',         'MED0330', 'MB', 1),
        ('MB16', 'BNA051',   'TDV_BACNINHA',   'MED0229', 'MB', 2),
        ('MT05', 'HUEA043',  'TDV_HUEB',       'MED0185', 'MT', 3),
        ('MT10', 'QANA002',  'TDV_DANANGA',    'MED0096', 'MT', 4),
        ('MN02', 'DL012',    'TDV_CANTHOA',    'MED0134', 'MN', 5),
        ('MNMD', 'SGNB0001', 'TDV_BINHPHUOCA', 'QLMD1',   'MN', 6),
        ('MN24', 'AG0020',   'QLBH024',         'QLBH024', 'MN', 7);

    IF EXISTS (
        SELECT 1
        FROM @DailyOwners O
        LEFT JOIN dbo.CF_ObjectTbl C ON C.ObjectID = O.ObjectID
        WHERE C.ObjectID IS NULL OR ISNULL(C.isCustomer, 0) = 0 OR ISNULL(C.isDisable, 0) = 1
    )
    BEGIN
        THROW 51005, N'Có khách đại diện UAT theo ngày không tồn tại hoặc đã bị khóa.', 1;
    END;

    IF (
        SELECT COUNT(DISTINCT ItemID)
        FROM dbo.CF_ItemTbl
        WHERE ItemID IN ('Q002', 'G010')
          AND ISNULL(isDisable, 0) = 0
    ) <> 2
    BEGIN
        THROW 51007, N'Không đủ sản phẩm mẫu Q002/G010 để tạo doanh số UAT theo ngày.', 1;
    END;

    DECLARE @DailyInvoices TABLE
    (
        DocumentID VARCHAR(30) NOT NULL,
        DocumentDate DATE NOT NULL,
        ObjectID VARCHAR(50) NOT NULL,
        EmployeeID VARCHAR(50) NOT NULL,
        ManagerID VARCHAR(50) NOT NULL,
        BranchID VARCHAR(50) NOT NULL,
        BaseTotal DECIMAL(18, 2) NOT NULL
    );

    ;WITH DaySeries AS
    (
        SELECT @DailyStartDate AS DocumentDate
        WHERE @DailyStartDate <= @DailyEndDate

        UNION ALL

        SELECT DATEADD(DAY, 1, DocumentDate)
        FROM DaySeries
        WHERE DocumentDate < @DailyEndDate
    )
    INSERT INTO @DailyInvoices
        (DocumentID, DocumentDate, ObjectID, EmployeeID, ManagerID, BranchID, BaseTotal)
    SELECT
        'U13D_' + O.ScenarioCode + '_' + CONVERT(CHAR(8), D.DocumentDate, 112),
        D.DocumentDate,
        O.ObjectID,
        O.EmployeeID,
        O.ManagerID,
        O.BranchID,
        CAST(80000000 + O.ScenarioNo * 3000000 + (DAY(D.DocumentDate) % 5) * 5000000 AS DECIMAL(18, 2))
    FROM DaySeries D
    CROSS JOIN @DailyOwners O
    OPTION (MAXRECURSION 366);

    INSERT INTO dbo.AR_OrderTbl
    (
        DocumentID, DocumentDate, ObjectID, EmployeeID, ManagerID,
        Memo, BaseTotal, UserCreate, DateCreate, BranchID, StatusID
    )
    SELECT
        D.DocumentID,
        D.DocumentDate,
        D.ObjectID,
        D.EmployeeID,
        D.ManagerID,
        N'Doanh số UAT theo ngày cho 13 tài khoản; có thể xóa bằng tiền tố U13D_',
        D.BaseTotal,
        'UAT13_DAILY',
        GETDATE(),
        D.BranchID,
        8
    FROM @DailyInvoices D;

    INSERT INTO dbo.AR_OrderDetailTbl
    (
        UserAutoID, DocumentID, ItemID, UnitPrice, Quantity, SoLuongTang,
        Amount, DiscountPercent, DiscountAmount, TotalAmount,
        DiemSanPham, DiemTichLuy, Notes
    )
    SELECT
        NEWID(),
        D.DocumentID,
        X.ItemID,
        CAST(D.BaseTotal * X.AmountRatio AS DECIMAL(18, 2)),
        1,
        0,
        CAST(D.BaseTotal * X.AmountRatio AS DECIMAL(18, 2)),
        0,
        0,
        CAST(D.BaseTotal * X.AmountRatio AS DECIMAL(18, 2)),
        0,
        0,
        N'Dữ liệu doanh số UAT theo ngày'
    FROM @DailyInvoices D
    CROSS JOIN (
        SELECT 'Q002' AS ItemID, CAST(0.60 AS DECIMAL(5, 2)) AS AmountRatio
        UNION ALL
        SELECT 'G010', CAST(0.40 AS DECIMAL(5, 2))
    ) X;

    IF EXISTS (
        SELECT O.ScenarioCode
        FROM @DailyOwners O
        LEFT JOIN @DailyInvoices D
          ON D.EmployeeID = O.EmployeeID
         AND D.ManagerID = O.ManagerID
         AND D.DocumentDate = @DailyEndDate
        GROUP BY O.ScenarioCode
        HAVING COUNT(D.DocumentID) = 0
    )
    BEGIN
        THROW 51006, N'Chưa tạo đủ doanh số UAT đến ngày hiện tại cho 7 nhóm tài khoản.', 1;
    END;

    PRINT '✅ Đã bổ sung doanh số UAT theo ngày từ '
        + CONVERT(VARCHAR(10), @DailyStartDate, 103) + ' đến '
        + CONVERT(VARCHAR(10), @DailyEndDate, 103) + ' cho đủ 13 tài khoản.';

    PRINT '----------------------------------------------------------------------';
    PRINT '⚙️ BƯỚC 4: BƠM DƯ NỢ ĐẦU KỲ CHO KHÁCH HÀNG ĐỂ TẠO CÔNG NỢ THỰC TẾ';
    PRINT '----------------------------------------------------------------------';

    -- Lấy PeriodID hiện tại đang có hiệu lực trong DB để khớp với SY_GetDebitDocFnc
    DECLARE @ActivePeriodID VARCHAR(10);
    SELECT @ActivePeriodID = dbo.SY_GetBalancePeriodFnc(GETDATE());
    PRINT '⚙️ Active PeriodID for UAT balance: ' + COALESCE(@ActivePeriodID, 'NULL');

    -- Cặp 1: MED0085 (Đoàn Văn Thế) dưới quyền QLBH013.MED (MED0330)
    INSERT INTO SY_BalanceObjectTbl (UserAutoID, AccountID, ObjectID, Amount, IsDebit, IsBalance, DocumentID, DocumentDate, EmployeeID, ManagerID, BranchID, Memo, PeriodID)
    VALUES 
    (NEWID(), '1311', 'HPA515', 45000000, 1, 1, 'DK_UAT_HPA515', '2016-01-01', 'MED0085', 'MED0330', 'MB', N'Số dư nợ đầu kỳ UAT - Đoàn Văn Thế', @ActivePeriodID);

    -- Cặp 2: TDV_BACNINHA (EmployeeID) dưới quyền QLBH016.MED (MED0229)
    -- Giúp cả TDV và Quản lý Trần Văn Hướng (đang bị 0 khách nợ) đều thấy nợ!
    INSERT INTO SY_BalanceObjectTbl (UserAutoID, AccountID, ObjectID, Amount, IsDebit, IsBalance, DocumentID, DocumentDate, EmployeeID, ManagerID, BranchID, Memo, PeriodID)
    VALUES 
    (NEWID(), '1311', 'BNB161', 55000000, 1, 1, 'DK_UAT_BNB161', '2016-01-01', 'TDV_BACNINHA', 'MED0229', 'MB', N'Số dư nợ đầu kỳ UAT - TDV Bắc Ninh A', @ActivePeriodID);

    -- Cặp 3: TDV_HUEB (EmployeeID) dưới quyền QLBH005.MED (MED0185)
    INSERT INTO SY_BalanceObjectTbl (UserAutoID, AccountID, ObjectID, Amount, IsDebit, IsBalance, DocumentID, DocumentDate, EmployeeID, ManagerID, BranchID, Memo, PeriodID)
    VALUES 
    (NEWID(), '1311', 'HUEB111', 35000000, 1, 1, 'DK_UAT_HUEB111', '2016-01-01', 'TDV_HUEB', 'MED0185', 'MT', N'Số dư nợ đầu kỳ UAT - TDV Huế B', @ActivePeriodID);

    -- Cặp 4: TDV_DANANGA (EmployeeID) dưới quyền QLBH010.MED (MED0096)
    INSERT INTO SY_BalanceObjectTbl (UserAutoID, AccountID, ObjectID, Amount, IsDebit, IsBalance, DocumentID, DocumentDate, EmployeeID, ManagerID, BranchID, Memo, PeriodID)
    VALUES 
    (NEWID(), '1311', 'QANA371', 65000000, 1, 1, 'DK_UAT_QANA371', '2016-01-01', 'TDV_DANANGA', 'MED0096', 'MT', N'Số dư nợ đầu kỳ UAT - TDV Đà Nẵng A', @ActivePeriodID);

    -- Cặp 5: TDV_CANTHOA (EmployeeID) dưới quyền QLMN2 (MED0134)
    -- Giúp cả TDV và Quản lý Trần Văn Luân (đang bị 0 khách nợ) đều thấy nợ!
    INSERT INTO SY_BalanceObjectTbl (UserAutoID, AccountID, ObjectID, Amount, IsDebit, IsBalance, DocumentID, DocumentDate, EmployeeID, ManagerID, BranchID, Memo, PeriodID)
    VALUES 
    (NEWID(), '1311', 'DL012', 25000000, 1, 1, 'DK_UAT_DL012', '2016-01-01', 'TDV_CANTHOA', 'MED0134', 'MN', N'Số dư nợ đầu kỳ UAT - TDV Cần Thơ A', @ActivePeriodID);

    -- Cặp 6: TDV_BINHPHUOCA (EmployeeID) dưới quyền QLMD1 (QLMD1) và QLBH024.MED (QLBH024)
    INSERT INTO SY_BalanceObjectTbl (UserAutoID, AccountID, ObjectID, Amount, IsDebit, IsBalance, DocumentID, DocumentDate, EmployeeID, ManagerID, BranchID, Memo, PeriodID)
    VALUES 
    (NEWID(), '1311', 'SGNB0018', 75000000, 1, 1, 'DK_UAT_SGNB0018', '2016-01-01', 'TDV_BINHPHUOCA', 'QLMD1', 'MN', N'Số dư nợ đầu kỳ UAT - TDV Bình Phước A', @ActivePeriodID);

    PRINT '✅ Đã bơm dữ liệu công nợ đầu kỳ thành công cho 6 khách hàng đại diện!';

    PRINT '----------------------------------------------------------------------';
    PRINT '⚙️ BƯỚC 5: TẠO ĐƠN HÀNG CHỜ DUYỆT MẪU CHO QLMD1 / TDV_BINHPHUOCA';
    PRINT '----------------------------------------------------------------------';

    -- Đơn hàng chờ duyệt mẫu giúp QLMD1 kích hoạt chỉ số Đơn chờ duyệt > 0
    INSERT INTO AR_OrderTbl (DocumentID, DocumentDate, ObjectID, Memo, BaseTotal, StatusID, EmployeeID, ManagerID, Phone, BranchID)
    VALUES 
    ('ORD_WAIT_UAT', '2026-05-24', 'SGNB0018', N'Đơn hàng chờ duyệt UAT cho QLMD1', 15000000, 0, 'TDV_BINHPHUOCA', 'QLMD1', '0912345678', 'MN');

    PRINT '✅ Đã tạo đơn hàng chờ duyệt mẫu thành công!';

    COMMIT TRANSACTION;
    PRINT '----------------------------------------------------------------------';
    PRINT '🎉 CẬP NHẬT DỮ LIỆU UAT THÀNH CÔNG RỰC RỠ!';
    PRINT '----------------------------------------------------------------------';

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    DECLARE @ErrMsg NVARCHAR(500) = ERROR_MESSAGE();
    PRINT N'❌ LỖI KHI CẬP NHẬT DỮ LIỆU: ' + @ErrMsg;
    THROW;
END CATCH;
