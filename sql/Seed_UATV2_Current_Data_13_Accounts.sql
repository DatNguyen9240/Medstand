/*
  UATV2 current-data seed for the 13 approved medtest accounts.

  Safety contract
  - medtest only.
  - Owns only ObjectID/DocumentID values beginning with UATV2_.
  - Never updates or deletes an ERP/customer record outside that namespace.
  - Re-runnable: owned transactional rows are refreshed and owned customers are upserted.
  - A/B/C thresholds and frequency counts come from approved BR-TIER-005 config;
    they are intentionally not duplicated as literals in this seed.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF LOWER(DB_NAME()) <> 'medtest'
    THROW 51200, N'UATV2_SEED_MEDTEST_ONLY', 1;

DECLARE @AsOfDate DATE = CONVERT(DATE, DATEADD(MINUTE, 420, SYSUTCDATETIME()));
DECLARE @Now DATETIME = GETDATE();
DECLARE @Owner VARCHAR(30) = 'UATV2_MOCK';
DECLARE @Prefix VARCHAR(10) = 'UATV2_';
DECLARE @RuleCode VARCHAR(80) = 'BR-TIER-005';
DECLARE @RuleVersion VARCHAR(30);
DECLARE @TierAMinNetRevenue DECIMAL(19,2);
DECLARE @TierAMinFrequency INT;
DECLARE @TierBMinNetRevenue DECIMAL(19,2);
DECLARE @TierBMinFrequency INT;
DECLARE @NoHistorySegment VARCHAR(20);
DECLARE @ActivePeriodID VARCHAR(10) = dbo.SY_GetBalancePeriodFnc(@AsOfDate);
DECLARE @TodayRoute NVARCHAR(10);

SET DATEFIRST 7;
SET @TodayRoute = CASE DATEPART(WEEKDAY, @AsOfDate)
    WHEN 1 THEN N'Thứ 2' -- ERP weekend guard moves Sunday work to Monday.
    WHEN 2 THEN N'Thứ 2'
    WHEN 3 THEN N'Thứ 3'
    WHEN 4 THEN N'Thứ 4'
    WHEN 5 THEN N'Thứ 5'
    WHEN 6 THEN N'Thứ 6'
    WHEN 7 THEN N'Thứ 7'
END;

SELECT TOP (1) @RuleVersion = RuleVersion
FROM dbo.AI_BusinessRuleConfigTbl
WHERE RuleCode = @RuleCode
  AND Status = 'APPROVED'
  AND EffectiveFrom <= SYSUTCDATETIME()
  AND (EffectiveTo IS NULL OR EffectiveTo > SYSUTCDATETIME())
ORDER BY EffectiveFrom DESC, RuleVersion DESC;

SELECT
    @TierAMinNetRevenue = TRY_CONVERT(DECIMAL(19,2), MAX(CASE WHEN ConfigKey = 'TierAMinNetRevenue' THEN ConfigValue END)),
    @TierAMinFrequency = TRY_CONVERT(INT, MAX(CASE WHEN ConfigKey = 'TierAMinFrequency' THEN ConfigValue END)),
    @TierBMinNetRevenue = TRY_CONVERT(DECIMAL(19,2), MAX(CASE WHEN ConfigKey = 'TierBMinNetRevenue' THEN ConfigValue END)),
    @TierBMinFrequency = TRY_CONVERT(INT, MAX(CASE WHEN ConfigKey = 'TierBMinFrequency' THEN ConfigValue END)),
    @NoHistorySegment = UPPER(MAX(CASE WHEN ConfigKey = 'NoHistorySegment' THEN ConfigValue END))
FROM dbo.AI_BusinessRuleConfigTbl
WHERE RuleCode = @RuleCode
  AND RuleVersion = @RuleVersion
  AND Status = 'APPROVED'
  AND EffectiveFrom <= SYSUTCDATETIME()
  AND (EffectiveTo IS NULL OR EffectiveTo > SYSUTCDATETIME());

IF @RuleVersion IS NULL
   OR @TierAMinNetRevenue IS NULL OR @TierAMinFrequency IS NULL
   OR @TierBMinNetRevenue IS NULL OR @TierBMinFrequency IS NULL
   OR @NoHistorySegment IS NULL
   OR @TierAMinNetRevenue <= @TierBMinNetRevenue
   OR @TierAMinFrequency <= @TierBMinFrequency
   OR @TierBMinNetRevenue <= 1 OR @TierBMinFrequency < 1
   OR @TierAMinFrequency > 50
    THROW 51201, N'UATV2_APPROVED_TIER_CONFIG_INVALID', 1;

IF @ActivePeriodID IS NULL
    THROW 51202, N'UATV2_ACTIVE_BALANCE_PERIOD_NOT_FOUND', 1;

DECLARE @Accounts TABLE
(
    SortOrder INT NOT NULL PRIMARY KEY,
    UserName VARCHAR(50) NOT NULL,
    CohortNo INT NOT NULL
);

INSERT INTO @Accounts (SortOrder, UserName, CohortNo)
VALUES
    (1,  'QLBH013.MED', 1), (2,  'NAMDINHB.MED', 1),
    (3,  'QLBH016.MED', 2), (4,  'BACNINHA.MED', 2),
    (5,  'QLBH005.MED', 3), (6,  'HUEB.MED', 3),
    (7,  'QLBH010.MED', 4), (8,  'DANANGA.MED', 4),
    (9,  'QLMN2', 5),       (10, 'CanThoA', 5),
    (11, 'QLMD1', 6),       (12, 'BinhPhuocA', 6),
    (13, 'QLBH024.MED', 7);

DECLARE @Cohorts TABLE
(
    CohortNo INT NOT NULL PRIMARY KEY,
    CohortCode VARCHAR(4) NOT NULL,
    ManagerUser VARCHAR(50) NOT NULL,
    SaleUser VARCHAR(50) NULL,
    FixtureCustomer VARCHAR(50) NOT NULL,
    ManagerEmployeeID VARCHAR(50) NULL,
    SaleEmployeeID VARCHAR(50) NULL,
    EmployeeID VARCHAR(50) NULL,
    ManagerID VARCHAR(50) NULL,
    CeoID VARCHAR(50) NULL,
    BranchID VARCHAR(50) NULL,
    ObjectGroupID VARCHAR(50) NULL,
    LocationID NVARCHAR(50) NULL,
    QuanHuyen NVARCHAR(50) NULL,
    XaPhuong NVARCHAR(50) NULL,
    ZoneID VARCHAR(50) NULL,
    StoreHouseID VARCHAR(50) NULL,
    ItemID VARCHAR(50) NOT NULL,
    IncomeAccID VARCHAR(50) NULL
);

INSERT INTO @Cohorts
    (CohortNo, CohortCode, ManagerUser, SaleUser, FixtureCustomer, ItemID)
VALUES
    (1, 'NDB', 'QLBH013.MED', 'NAMDINHB.MED', 'NDB001', 'A003'),
    (2, 'BNB', 'QLBH016.MED', 'BACNINHA.MED', 'BNA051', 'Q002'),
    (3, 'HUE', 'QLBH005.MED', 'HUEB.MED', 'HUEA043', 'G010'),
    (4, 'QAN', 'QLBH010.MED', 'DANANGA.MED', 'QANA002', 'A003'),
    (5, 'CTH', 'QLMN2', 'CanThoA', 'DL012', 'Q002'),
    (6, 'BPH', 'QLMD1', 'BinhPhuocA', 'SGNB0001', 'G010'),
    (7, 'AG',  'QLBH024.MED', NULL, 'AG0020', 'A003');

UPDATE C
SET ManagerEmployeeID = M.EmployeeID,
    SaleEmployeeID = S.EmployeeID,
    EmployeeID = COALESCE(S.EmployeeID, M.EmployeeID),
    ManagerID = COALESCE(S.ManagerID, M.EmployeeID),
    CeoID = COALESCE(S.CeoID, M.CeoID),
    BranchID = COALESCE(S.BranchID, M.BranchID),
    ObjectGroupID = F.ObjectGroupID,
    LocationID = F.LocationID,
    QuanHuyen = F.QuanHuyen,
    XaPhuong = F.XaPhuong,
    ZoneID = F.ZoneID
FROM @Cohorts C
JOIN dbo.SY_User M ON M.UserName = C.ManagerUser AND COALESCE(M.Disable, 0) = 0
LEFT JOIN dbo.SY_User S ON S.UserName = C.SaleUser AND COALESCE(S.Disable, 0) = 0
JOIN dbo.CF_ObjectTbl F ON F.ObjectID = C.FixtureCustomer
                           AND COALESCE(F.isCustomer, 0) = 1
                           AND COALESCE(F.isDisable, 0) = 0;

UPDATE C
SET StoreHouseID = X.StoreHouseID
FROM @Cohorts C
OUTER APPLY
(
    SELECT TOP (1) US.StoreHouseID
    FROM dbo.SY_UserStoreHouseTbl US
    WHERE US.StoreHouseID IN ('CTY', 'DL02', 'DL03')
      AND US.UserName IN (C.SaleUser, C.ManagerUser)
    ORDER BY CASE WHEN US.UserName = C.SaleUser THEN 0 ELSE 1 END, US.StoreHouseID
) X;

UPDATE C
SET IncomeAccID = X.IncomeAccID
FROM @Cohorts C
OUTER APPLY
(
    SELECT TOP (1) D.IncomeAccID
    FROM dbo.AR_InvoiceDetailTbl D
    WHERE NULLIF(D.IncomeAccID, '') IS NOT NULL
      AND (D.ItemID = C.ItemID OR NOT EXISTS
          (SELECT 1 FROM dbo.AR_InvoiceDetailTbl P WHERE P.ItemID = C.ItemID AND NULLIF(P.IncomeAccID, '') IS NOT NULL))
    ORDER BY CASE WHEN D.ItemID = C.ItemID THEN 0 ELSE 1 END, D.DocumentID DESC
) X;

IF (SELECT COUNT(*) FROM @Accounts) <> 13
    THROW 51203, N'UATV2_ACCOUNT_FIXTURE_COUNT_MUST_BE_13', 1;

IF EXISTS
(
    SELECT 1 FROM @Cohorts
    WHERE ManagerEmployeeID IS NULL OR EmployeeID IS NULL OR ManagerID IS NULL
       OR BranchID IS NULL OR ObjectGroupID IS NULL
       OR LocationID IS NULL OR QuanHuyen IS NULL OR XaPhuong IS NULL
       OR StoreHouseID IS NULL OR IncomeAccID IS NULL
)
    THROW 51204, N'UATV2_COHORT_CONTEXT_INCOMPLETE', 1;

IF EXISTS
(
    SELECT 1 FROM @Accounts A
    LEFT JOIN dbo.SY_User U ON U.UserName = A.UserName AND COALESCE(U.Disable, 0) = 0
    WHERE U.UserName IS NULL
)
    THROW 51205, N'UATV2_ACCOUNT_NOT_FOUND_OR_DISABLED', 1;

IF (SELECT COUNT(*) FROM dbo.CF_ItemTbl WHERE ItemID IN ('A003', 'Q002', 'G010') AND COALESCE(isDisable, 0) = 0) <> 3
    THROW 51206, N'UATV2_SAMPLE_ITEM_MISSING', 1;

IF EXISTS
(
    SELECT 1
    FROM dbo.CF_ObjectTbl
    WHERE ObjectID LIKE 'UATV2[_]%'
      AND COALESCE(UserCreate, '') <> @Owner
)
    THROW 51207, N'UATV2_NAMESPACE_COLLISION_ON_CUSTOMER', 1;

IF EXISTS
(
    SELECT 1 FROM dbo.AR_OrderTbl WHERE DocumentID LIKE 'UATV2[_]%' AND COALESCE(UserCreate, '') <> @Owner
    UNION ALL
    SELECT 1 FROM dbo.AR_InvoiceTbl WHERE DocumentID LIKE 'UATV2[_]%' AND COALESCE(UserCreate, '') <> @Owner
    UNION ALL
    SELECT 1 FROM dbo.AR_ReturnTbl WHERE DocumentID LIKE 'UATV2[_]%' AND COALESCE(UserCreate, '') <> @Owner
)
    THROW 51208, N'UATV2_NAMESPACE_COLLISION_ON_DOCUMENT', 1;

DECLARE @Customers TABLE
(
    CohortNo INT NOT NULL,
    TierCode VARCHAR(10) NOT NULL,
    TierNo INT NOT NULL,
    ObjectID VARCHAR(50) NOT NULL PRIMARY KEY,
    ObjectName NVARCHAR(150) NOT NULL
);

INSERT INTO @Customers (CohortNo, TierCode, TierNo, ObjectID, ObjectName)
SELECT C.CohortNo, T.TierCode, T.TierNo,
       @Prefix + C.CohortCode + '_' + T.TierCode,
       N'UAT V2 ' + C.CohortCode + N' - nhóm ' + T.TierCode
FROM @Cohorts C
CROSS JOIN
(
    SELECT 'A' AS TierCode, 1 AS TierNo
    UNION ALL SELECT 'B', 2
    UNION ALL SELECT 'C', 3
    UNION ALL SELECT 'UNRATED', 4
) T;

BEGIN TRY
    BEGIN TRANSACTION;

    /* Refresh only rows owned by the UATV2 namespace. */
    DELETE FROM dbo.AR_ReturnDetailTbl WHERE DocumentID LIKE 'UATV2[_]%';
    DELETE FROM dbo.AR_ReturnTbl WHERE DocumentID LIKE 'UATV2[_]%';
    DELETE FROM dbo.AR_InvoiceDetailTbl WHERE DocumentID LIKE 'UATV2[_]%';
    DELETE FROM dbo.AR_InvoiceTbl WHERE DocumentID LIKE 'UATV2[_]%';
    DELETE FROM dbo.AR_OrderDetailTbl WHERE DocumentID LIKE 'UATV2[_]%';
    DELETE FROM dbo.AR_OrderTbl WHERE DocumentID LIKE 'UATV2[_]%';
    DELETE FROM dbo.SY_BalanceObjectTbl WHERE DocumentID LIKE 'UATV2[_]%';
    DELETE FROM dbo.AR_SanPhamTrongTamDetailTbl WHERE DocumentID = 'UATV2_FOCUS_CURRENT';
    DELETE FROM dbo.AR_PromotionGiftTbl WHERE DocumentID = 'UATV2_FOCUS_CURRENT';
    DELETE FROM dbo.AR_PromotionTbl WHERE DocumentID = 'UATV2_FOCUS_CURRENT';
    DELETE FROM dbo.AR_SanPhamTrongTamTbl WHERE DocumentID = 'UATV2_FOCUS_CURRENT';

    UPDATE O
    SET ObjectName = K.ObjectName,
        Address = N'Dữ liệu kiểm thử UAT V2 - không dùng cho nghiệp vụ thật',
        TaxCode = '030000' + RIGHT('0000' + CONVERT(VARCHAR(4), K.CohortNo * 10 + K.TierNo), 4),
        Phone = '0888' + RIGHT('000000' + CONVERT(VARCHAR(6), K.CohortNo * 10 + K.TierNo), 6),
        BranchID = C.BranchID,
        ObjectGroupID = C.ObjectGroupID,
        LocationID = C.LocationID,
        QuanHuyen = C.QuanHuyen,
        XaPhuong = C.XaPhuong,
        ThuTrongTuan = @TodayRoute,
        ZoneID = C.ZoneID,
        SaleID = C.EmployeeID,
        isCustomer = 1,
        isDisable = 0,
        UserUpdate = @Owner,
        DateUpdate = @Now
    FROM dbo.CF_ObjectTbl O
    JOIN @Customers K ON K.ObjectID = O.ObjectID
    JOIN @Cohorts C ON C.CohortNo = K.CohortNo
    WHERE O.UserCreate = @Owner;

    INSERT INTO dbo.CF_ObjectTbl
    (
        ObjectID, BranchID, ObjectName, Address, TaxCode, Phone,
        ObjectGroupID, LocationID, QuanHuyen, XaPhuong, Birthday,
        LoaiHopDong, PhanLoaiKhach, ThuTrongTuan,
        AccountNoHD, AccountNameHD, ChuTaiKhoan,
        RevAccID, PayAccID,
        isCustomer, isEmployee, isManager, isVendor, isAgency, isDefault, isDisable,
        CongNoDonHang, IsForeign, SaleID, ZoneID, UserCreate, DateCreate
    )
    SELECT
        K.ObjectID, C.BranchID, K.ObjectName,
        N'Dữ liệu kiểm thử UAT V2 - không dùng cho nghiệp vụ thật',
        '030000' + RIGHT('0000' + CONVERT(VARCHAR(4), K.CohortNo * 10 + K.TierNo), 4),
        '0888' + RIGHT('000000' + CONVERT(VARCHAR(6), K.CohortNo * 10 + K.TierNo), 6),
        C.ObjectGroupID, C.LocationID, C.QuanHuyen, C.XaPhuong,
        DATEFROMPARTS(1990 + K.CohortNo, 1 + K.TierNo, 1 + K.CohortNo),
        '', '', @TodayRoute,
        '', '', '', '1311', '3311',
        1, 0, 0, 0, 0, 0, 0,
        0, 0, C.EmployeeID, C.ZoneID, @Owner, @Now
    FROM @Customers K
    JOIN @Cohorts C ON C.CohortNo = K.CohortNo
    WHERE NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectTbl O WHERE O.ObjectID = K.ObjectID);

    IF (SELECT COUNT(*) FROM dbo.CF_ObjectTbl WHERE ObjectID LIKE 'UATV2[_]%' AND UserCreate = @Owner) <> 28
        THROW 51209, N'UATV2_CUSTOMER_UPSERT_COUNT_INVALID', 1;

    DECLARE @ReturnAmount DECIMAL(19,2) = @TierBMinNetRevenue / 10.0;
    DECLARE @CAmount DECIMAL(19,2) = @TierBMinNetRevenue - 1;
    DECLARE @CFrequency INT = CASE WHEN @TierBMinFrequency > 1 THEN @TierBMinFrequency - 1 ELSE 1 END;

    DECLARE @Sales TABLE
    (
        CohortNo INT NOT NULL,
        TierCode VARCHAR(10) NOT NULL,
        SequenceNo INT NOT NULL,
        DocumentID VARCHAR(30) NOT NULL PRIMARY KEY,
        DocumentDate DATE NOT NULL,
        ObjectID VARCHAR(50) NOT NULL,
        EmployeeID VARCHAR(50) NOT NULL,
        ManagerID VARCHAR(50) NOT NULL,
        CeoID VARCHAR(50) NULL,
        BranchID VARCHAR(50) NOT NULL,
        StoreHouseID VARCHAR(50) NOT NULL,
        ItemID VARCHAR(50) NOT NULL,
        IncomeAccID VARCHAR(50) NOT NULL,
        TotalAmount DECIMAL(19,2) NOT NULL
    );

    ;WITH N AS
    (
        SELECT TOP (50) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS SequenceNo
        FROM sys.all_objects
    ), Targets AS
    (
        SELECT C.CohortNo, K.TierCode, K.ObjectID,
               CASE K.TierCode
                   WHEN 'A' THEN @TierAMinFrequency
                   WHEN 'B' THEN @TierBMinFrequency
                   WHEN 'C' THEN @CFrequency
               END AS TargetFrequency,
               CASE K.TierCode
                   WHEN 'A' THEN @TierAMinNetRevenue + @ReturnAmount
                   WHEN 'B' THEN @TierBMinNetRevenue
                   WHEN 'C' THEN @CAmount
               END AS TargetGross,
               C.EmployeeID, C.ManagerID, C.CeoID, C.BranchID,
               C.StoreHouseID, C.ItemID, C.IncomeAccID
        FROM @Customers K
        JOIN @Cohorts C ON C.CohortNo = K.CohortNo
        WHERE K.TierCode IN ('A', 'B', 'C')
    )
    INSERT INTO @Sales
        (CohortNo, TierCode, SequenceNo, DocumentID, DocumentDate, ObjectID,
         EmployeeID, ManagerID, CeoID, BranchID, StoreHouseID, ItemID, IncomeAccID, TotalAmount)
    SELECT T.CohortNo, T.TierCode, N.SequenceNo,
           @Prefix + RIGHT('00' + CONVERT(VARCHAR(2), T.CohortNo), 2)
               + '_' + T.TierCode + '_' + RIGHT('00' + CONVERT(VARCHAR(2), N.SequenceNo), 2),
           DATEADD(DAY, -7 * (N.SequenceNo - 1), @AsOfDate),
           T.ObjectID, T.EmployeeID, T.ManagerID, T.CeoID, T.BranchID,
           T.StoreHouseID, T.ItemID, T.IncomeAccID,
           CASE WHEN N.SequenceNo = T.TargetFrequency
                THEN T.TargetGross - (FLOOR(T.TargetGross / T.TargetFrequency) * (T.TargetFrequency - 1))
                ELSE FLOOR(T.TargetGross / T.TargetFrequency)
           END
    FROM Targets T
    JOIN N ON N.SequenceNo <= T.TargetFrequency;

    INSERT INTO dbo.AR_OrderTbl
    (
        DocumentID, DocumentDate, ObjectID, EmployeeID, ManagerID, CeoID,
        Memo, BaseTotal, UserCreate, DateCreate, BranchID, StatusID
    )
    SELECT DocumentID, DocumentDate, ObjectID, EmployeeID, ManagerID, CeoID,
           N'UAT V2: lịch sử doanh số dùng kiểm thử phân nhóm; có thể dọn bằng tiền tố UATV2_',
           TotalAmount, @Owner, @Now, BranchID, 8
    FROM @Sales;

    INSERT INTO dbo.AR_OrderDetailTbl
    (
        UserAutoID, DocumentID, ItemID, UnitPrice, Quantity, SoLuongTang,
        Amount, DiscountPercent, DiscountAmount, TotalAmount,
        DiemSanPham, DiemTichLuy, Notes, StoreHouseID, UserCreate, DateCreate
    )
    SELECT CONVERT(VARCHAR(40), NEWID()), DocumentID, ItemID, TotalAmount, 1, 0,
           TotalAmount, 0, 0, TotalAmount, 0, 0,
           N'UAT V2 current data', StoreHouseID, @Owner, @Now
    FROM @Sales;

    INSERT INTO dbo.AR_InvoiceTbl
    (
        DocumentID, DocumentDate, ObjectID, EmployeeID, ManagerID, CeoID,
        Memo, BaseTotal, UserCreate, DateCreate, BranchID, StatusID
    )
    SELECT DocumentID, DocumentDate, ObjectID, EmployeeID, ManagerID, CeoID,
           N'UAT V2: hóa đơn mẫu tương ứng lịch sử đơn hàng',
           TotalAmount, @Owner, @Now, BranchID, 8
    FROM @Sales;

    INSERT INTO dbo.AR_InvoiceDetailTbl
    (
        UserAutoID, DocumentID, ItemID, StoreHouseID, Quantity,
        UnitPrice, SourceAmount, Amount, TotalAmount, IncomeAccID,
        EmployeeID, ManagerID, ObjectID
    )
    SELECT CONVERT(VARCHAR(40), NEWID()), DocumentID, ItemID, StoreHouseID, 1,
           TotalAmount, TotalAmount, TotalAmount, TotalAmount, IncomeAccID,
           EmployeeID, ManagerID, ObjectID
    FROM @Sales;

    /* One signed return per A customer; net revenue remains exactly the configured A threshold. */
    INSERT INTO dbo.AR_ReturnTbl
    (
        DocumentID, DocumentDate, ObjectID, Memo, CurrencyID, RateExchange,
        EmployeeID, ManagerID, CeoID, BaseTotal, RevAccID, VATAccID,
        isLock, UserCreate, DateCreate, Status, BranchID, KhongTruDSWeb, HienThiWeb
    )
    SELECT @Prefix + RIGHT('00' + CONVERT(VARCHAR(2), C.CohortNo), 2) + '_R_01',
           @AsOfDate, K.ObjectID, N'UAT V2: hàng trả được trừ một lần khỏi doanh số',
           'VND', 1, C.EmployeeID, C.ManagerID, C.CeoID, @ReturnAmount,
           '1311', '33311', 1, @Owner, @Now, 1, C.BranchID, 0, 1
    FROM @Cohorts C
    JOIN @Customers K ON K.CohortNo = C.CohortNo AND K.TierCode = 'A';

    INSERT INTO dbo.AR_ReturnDetailTbl
    (
        UserAutoID, DocumentID, ItemID, StoreHouseID, Quantity,
        UnitPrice, SourceAmount, Amount, DiscountAmount, DiscountAmount2,
        VATAmount, TotalAmount, ReturnAccID, InvAccID, CostOfSaleAccID,
        DiemTichLuy, DiemTang, DiemSanPham, DiemSanPhamTang
    )
    SELECT CONVERT(VARCHAR(40), NEWID()),
           @Prefix + RIGHT('00' + CONVERT(VARCHAR(2), C.CohortNo), 2) + '_R_01',
           C.ItemID, C.StoreHouseID, 1,
           @ReturnAmount, @ReturnAmount, @ReturnAmount, 0, 0,
           0, @ReturnAmount, '5211', '1561', '6321', 0, 0, 0, 0
    FROM @Cohorts C;

    /* Four order lifecycle states per cohort, all dated today. */
    DECLARE @PipelineAmount DECIMAL(19,2) = @TierBMinNetRevenue / 20.0;

    INSERT INTO dbo.AR_OrderTbl
    (
        DocumentID, DocumentDate, ObjectID, EmployeeID, ManagerID, CeoID,
        Memo, BaseTotal, UserCreate, DateCreate, BranchID, StatusID
    )
    SELECT @Prefix + RIGHT('00' + CONVERT(VARCHAR(2), C.CohortNo), 2)
               + '_P_' + RIGHT('00' + CONVERT(VARCHAR(2), P.StageNo), 2),
           @AsOfDate, K.ObjectID, C.EmployeeID, C.ManagerID, C.CeoID,
           N'UAT V2: trạng thái đơn hàng ' + CONVERT(NVARCHAR(10), P.StatusID),
           @PipelineAmount, @Owner, @Now, C.BranchID, P.StatusID
    FROM @Cohorts C
    JOIN @Customers K ON K.CohortNo = C.CohortNo AND K.TierCode = 'C'
    CROSS JOIN
    (
        SELECT 1 AS StageNo, -1 AS StatusID
        UNION ALL SELECT 2, 0
        UNION ALL SELECT 3, 2
        UNION ALL SELECT 4, 10
    ) P;

    INSERT INTO dbo.AR_OrderDetailTbl
    (
        UserAutoID, DocumentID, ItemID, UnitPrice, Quantity, SoLuongTang,
        Amount, DiscountPercent, DiscountAmount, TotalAmount,
        DiemSanPham, DiemTichLuy, Notes, StoreHouseID, UserCreate, DateCreate
    )
    SELECT CONVERT(VARCHAR(40), NEWID()),
           @Prefix + RIGHT('00' + CONVERT(VARCHAR(2), C.CohortNo), 2)
               + '_P_' + RIGHT('00' + CONVERT(VARCHAR(2), P.StageNo), 2),
           C.ItemID, @PipelineAmount, 1, 0, @PipelineAmount, 0, 0, @PipelineAmount,
           0, 0, N'UAT V2 order lifecycle', C.StoreHouseID, @Owner, @Now
    FROM @Cohorts C
    CROSS JOIN
    (
        SELECT 1 AS StageNo UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
    ) P;

    /* One current-period opening debt row per cohort. */
    INSERT INTO dbo.SY_BalanceObjectTbl
    (
        UserAutoID, AccountID, ObjectID, Amount, IsDebit, IsBalance,
        DocumentID, DocumentDate, EmployeeID, ManagerID, BranchID, Memo, PeriodID
    )
    SELECT CONVERT(VARCHAR(40), NEWID()), '1311', K.ObjectID,
           @TierBMinNetRevenue / 5.0, 1, 1,
           @Prefix + RIGHT('00' + CONVERT(VARCHAR(2), C.CohortNo), 2) + '_DEBT',
           @AsOfDate, C.EmployeeID, C.ManagerID, C.BranchID,
           N'UAT V2: công nợ mẫu hiện tại', @ActivePeriodID
    FROM @Cohorts C
    JOIN @Customers K ON K.CohortNo = C.CohortNo AND K.TierCode = 'B';

    /* A currently active focus/promotion program shared by all 13 accounts. */
    INSERT INTO dbo.AR_SanPhamTrongTamTbl
        (DocumentID, FromDate, ToDate, Memo, isLock, UserCreate, DateCreate)
    VALUES
        ('UATV2_FOCUS_CURRENT', DATEADD(DAY, -1, @AsOfDate), DATEADD(DAY, 30, @AsOfDate),
         N'UAT V2 - sản phẩm trọng tâm hiện hành', 0, @Owner, @Now);

    INSERT INTO dbo.AR_PromotionTbl
        (DocumentID, FromDate, ToDate, TenChuongTrinh, isDisable, UserCreate, DateCreate)
    VALUES
        ('UATV2_FOCUS_CURRENT', DATEADD(DAY, -1, @AsOfDate), DATEADD(DAY, 30, @AsOfDate),
         N'UAT V2 - chương trình hiện hành', 0, @Owner, @Now);

    INSERT INTO dbo.AR_SanPhamTrongTamDetailTbl (UserAutoID, DocumentID, ItemID, Notes)
    SELECT CONVERT(VARCHAR(40), NEWID()), 'UATV2_FOCUS_CURRENT', ItemID,
           N'UAT V2 sample product'
    FROM dbo.CF_ItemTbl
    WHERE ItemID IN ('A003', 'Q002', 'G010') AND COALESCE(isDisable, 0) = 0;

    INSERT INTO dbo.AR_PromotionGiftTbl (DocumentID, TuDiem, DenDiem, QuaTang)
    VALUES
        ('UATV2_FOCUS_CURRENT', 0, @TierBMinNetRevenue - 1, N'Quà mẫu UAT V2 mức cơ bản'),
        ('UATV2_FOCUS_CURRENT', @TierBMinNetRevenue, @TierAMinNetRevenue - 1, N'Quà mẫu UAT V2 mức B'),
        ('UATV2_FOCUS_CURRENT', @TierAMinNetRevenue, @TierAMinNetRevenue * 100, N'Quà mẫu UAT V2 mức A');

    /* In-transaction invariants before commit. */
    IF (SELECT COUNT(*) FROM dbo.AR_OrderTbl WHERE DocumentID LIKE 'UATV2[_]%')
       <> (SELECT COUNT(*) FROM @Sales) + 28
        THROW 51210, N'UATV2_ORDER_COUNT_INVALID', 1;

    IF (SELECT COUNT(*) FROM dbo.AR_InvoiceTbl WHERE DocumentID LIKE 'UATV2[_]%')
       <> (SELECT COUNT(*) FROM @Sales)
        THROW 51211, N'UATV2_INVOICE_COUNT_INVALID', 1;

    IF (SELECT COUNT(*) FROM dbo.AR_ReturnTbl WHERE DocumentID LIKE 'UATV2[_]%') <> 7
        THROW 51212, N'UATV2_RETURN_COUNT_INVALID', 1;

    IF (SELECT COUNT(*) FROM dbo.SY_BalanceObjectTbl WHERE DocumentID LIKE 'UATV2[_]%') <> 7
        THROW 51213, N'UATV2_DEBT_COUNT_INVALID', 1;

    IF EXISTS
    (
        SELECT A.UserName
        FROM @Accounts A
        JOIN @Customers K ON K.CohortNo = A.CohortNo
        OUTER APPLY
        (
            SELECT S.ObjectID
            FROM dbo.AR_GetObjectByUserFnc(A.UserName) S
            WHERE S.ObjectID = K.ObjectID
        ) S
        GROUP BY A.UserName
        HAVING COUNT(S.ObjectID) <> 4
    )
        THROW 51214, N'UATV2_SCOPE_NOT_4_CUSTOMERS_FOR_ALL_13_ACCOUNTS', 1;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

SELECT
    'UATV2_SEED' AS SeedName,
    DB_NAME() AS DatabaseName,
    @AsOfDate AS AsOfDate,
    @RuleCode + '/' + @RuleVersion AS RuleVersion,
    (SELECT COUNT(*) FROM @Accounts) AS AccountCount,
    (SELECT COUNT(*) FROM dbo.CF_ObjectTbl WHERE ObjectID LIKE 'UATV2[_]%' AND UserCreate = @Owner) AS CustomerCount,
    (SELECT COUNT(*) FROM dbo.AR_OrderTbl WHERE DocumentID LIKE 'UATV2[_]%') AS OrderCount,
    (SELECT COUNT(*) FROM dbo.AR_InvoiceTbl WHERE DocumentID LIKE 'UATV2[_]%') AS InvoiceCount,
    (SELECT COUNT(*) FROM dbo.AR_ReturnTbl WHERE DocumentID LIKE 'UATV2[_]%') AS ReturnCount,
    (SELECT COUNT(*) FROM dbo.SY_BalanceObjectTbl WHERE DocumentID LIKE 'UATV2[_]%') AS DebtCount,
    (SELECT COUNT(*) FROM dbo.AR_SanPhamTrongTamDetailTbl WHERE DocumentID = 'UATV2_FOCUS_CURRENT') AS FocusProductCount;

SELECT A.SortOrder, A.UserName, C.CohortCode,
       COUNT(S.ObjectID) AS VisibleUatv2Customers,
       C.StoreHouseID, C.ItemID
FROM @Accounts A
JOIN @Cohorts C ON C.CohortNo = A.CohortNo
JOIN @Customers K ON K.CohortNo = A.CohortNo
OUTER APPLY
(
    SELECT S.ObjectID
    FROM dbo.AR_GetObjectByUserFnc(A.UserName) S
    WHERE S.ObjectID = K.ObjectID
) S
GROUP BY A.SortOrder, A.UserName, C.CohortCode, C.StoreHouseID, C.ItemID
ORDER BY A.SortOrder;
