/*
  UAT daily revenue fixtures for the 13 approved medtest accounts.

  Safety:
  - medtest only;
  - owns only ObjectID/DocumentID values beginning with UATREV_;
  - re-runnable and does not touch the UATV2_ tier fixtures;
  - revenue amounts are derived from the active APPROVED BR-TIER-005 config.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF LOWER(DB_NAME()) <> 'medtest'
    THROW 51300, N'UATREV_SEED_MEDTEST_ONLY', 1;

DECLARE @AsOfDate DATE = CONVERT(DATE, DATEADD(MINUTE, 420, SYSUTCDATETIME()));
DECLARE @Now DATETIME = GETDATE();
DECLARE @Owner VARCHAR(30) = 'UATREV_MOCK';
DECLARE @Prefix VARCHAR(10) = 'UATREV_';
DECLARE @RuleCode VARCHAR(80) = 'BR-TIER-005';
DECLARE @RuleVersion VARCHAR(30);
DECLARE @TierBMinNetRevenue DECIMAL(19,2);
DECLARE @DailyBase DECIMAL(19,2);
DECLARE @TodayRoute NVARCHAR(10);

SET DATEFIRST 7;
SET @TodayRoute = CASE DATEPART(WEEKDAY, @AsOfDate)
    WHEN 1 THEN N'Thứ 2'
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
GROUP BY RuleVersion, EffectiveFrom
ORDER BY EffectiveFrom DESC;

SELECT @TierBMinNetRevenue = TRY_CONVERT(DECIMAL(19,2), ConfigValue)
FROM dbo.AI_BusinessRuleConfigTbl
WHERE RuleCode = @RuleCode
  AND RuleVersion = @RuleVersion
  AND ConfigKey = 'TierBMinNetRevenue'
  AND Status = 'APPROVED';

IF @RuleVersion IS NULL OR @TierBMinNetRevenue IS NULL OR @TierBMinNetRevenue <= 0
    THROW 51301, N'UATREV_APPROVED_CONFIG_MISSING_OR_INVALID', 1;

/* One visually useful day is half the configured B threshold. */
SET @DailyBase = @TierBMinNetRevenue / 2.0;

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
          (SELECT 1 FROM dbo.AR_InvoiceDetailTbl P
           WHERE P.ItemID = C.ItemID AND NULLIF(P.IncomeAccID, '') IS NOT NULL))
    ORDER BY CASE WHEN D.ItemID = C.ItemID THEN 0 ELSE 1 END, D.DocumentID DESC
) X;

IF (SELECT COUNT(*) FROM @Accounts) <> 13
    THROW 51302, N'UATREV_ACCOUNT_FIXTURE_COUNT_MUST_BE_13', 1;

IF EXISTS
(
    SELECT 1 FROM @Cohorts
    WHERE ManagerEmployeeID IS NULL OR EmployeeID IS NULL OR ManagerID IS NULL
       OR BranchID IS NULL OR ObjectGroupID IS NULL
       OR LocationID IS NULL OR QuanHuyen IS NULL OR XaPhuong IS NULL
       OR StoreHouseID IS NULL OR IncomeAccID IS NULL
)
    THROW 51303, N'UATREV_COHORT_CONTEXT_INCOMPLETE', 1;

IF EXISTS
(
    SELECT 1 FROM @Accounts A
    LEFT JOIN dbo.SY_User U ON U.UserName = A.UserName AND COALESCE(U.Disable, 0) = 0
    WHERE U.UserName IS NULL
)
    THROW 51304, N'UATREV_ACCOUNT_NOT_FOUND_OR_DISABLED', 1;

IF EXISTS
(
    SELECT 1 FROM dbo.CF_ObjectTbl
    WHERE ObjectID LIKE 'UATREV[_]%'
      AND COALESCE(UserCreate, '') <> @Owner
)
    THROW 51305, N'UATREV_NAMESPACE_COLLISION_ON_CUSTOMER', 1;

IF EXISTS
(
    SELECT 1 FROM dbo.AR_OrderTbl
    WHERE DocumentID LIKE 'UATREV[_]%' AND COALESCE(UserCreate, '') <> @Owner
    UNION ALL
    SELECT 1 FROM dbo.AR_InvoiceTbl
    WHERE DocumentID LIKE 'UATREV[_]%' AND COALESCE(UserCreate, '') <> @Owner
)
    THROW 51306, N'UATREV_NAMESPACE_COLLISION_ON_DOCUMENT', 1;

DECLARE @Customers TABLE
(
    CohortNo INT NOT NULL PRIMARY KEY,
    ObjectID VARCHAR(50) NOT NULL,
    ObjectName NVARCHAR(150) NOT NULL
);

INSERT INTO @Customers (CohortNo, ObjectID, ObjectName)
SELECT CohortNo,
       @Prefix + CohortCode,
       N'UAT doanh số ngày ' + CohortCode
FROM @Cohorts;

DECLARE @Sales TABLE
(
    CohortNo INT NOT NULL,
    DayNo INT NOT NULL,
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

BEGIN TRY
    BEGIN TRANSACTION;

    DELETE FROM dbo.AR_InvoiceDetailTbl WHERE DocumentID LIKE 'UATREV[_]%';
    DELETE FROM dbo.AR_InvoiceTbl WHERE DocumentID LIKE 'UATREV[_]%';
    DELETE FROM dbo.AR_OrderDetailTbl WHERE DocumentID LIKE 'UATREV[_]%';
    DELETE FROM dbo.AR_OrderTbl WHERE DocumentID LIKE 'UATREV[_]%';

    UPDATE O
    SET ObjectName = K.ObjectName,
        Address = N'Dữ liệu UAT doanh số ngày - không dùng cho nghiệp vụ thật',
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
        N'Dữ liệu UAT doanh số ngày - không dùng cho nghiệp vụ thật',
        '039000' + RIGHT('0000' + CONVERT(VARCHAR(4), C.CohortNo), 4),
        '0877' + RIGHT('000000' + CONVERT(VARCHAR(6), C.CohortNo), 6),
        C.ObjectGroupID, C.LocationID, C.QuanHuyen, C.XaPhuong,
        DATEFROMPARTS(1990 + C.CohortNo, 1, 1),
        '', '', @TodayRoute,
        '', '', '', '1311', '3311',
        1, 0, 0, 0, 0, 0, 0,
        0, 0, C.EmployeeID, C.ZoneID, @Owner, @Now
    FROM @Customers K
    JOIN @Cohorts C ON C.CohortNo = K.CohortNo
    WHERE NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectTbl O WHERE O.ObjectID = K.ObjectID);

    IF (SELECT COUNT(*) FROM dbo.CF_ObjectTbl
        WHERE ObjectID LIKE 'UATREV[_]%' AND UserCreate = @Owner) <> 7
        THROW 51307, N'UATREV_CUSTOMER_UPSERT_COUNT_INVALID', 1;

    INSERT INTO @Sales
        (CohortNo, DayNo, DocumentID, DocumentDate, ObjectID,
         EmployeeID, ManagerID, CeoID, BranchID, StoreHouseID,
         ItemID, IncomeAccID, TotalAmount)
    SELECT C.CohortNo, D.DayNo,
           @Prefix + RIGHT('00' + CONVERT(VARCHAR(2), C.CohortNo), 2)
               + '_' + RIGHT('00' + CONVERT(VARCHAR(2), D.DayNo), 2),
           DATEADD(DAY, D.DayOffset, @AsOfDate), K.ObjectID,
           C.EmployeeID, C.ManagerID, C.CeoID, C.BranchID, C.StoreHouseID,
           C.ItemID, C.IncomeAccID,
           @DailyBase
             + (@DailyBase * (C.CohortNo - 1) / 10.0)
             + (@DailyBase * (D.DayNo - 1) / 5.0)
    FROM @Cohorts C
    JOIN @Customers K ON K.CohortNo = C.CohortNo
    CROSS JOIN
    (
        SELECT 1 AS DayNo, -2 AS DayOffset
        UNION ALL SELECT 2, -1
    ) D;

    INSERT INTO dbo.AR_OrderTbl
    (
        DocumentID, DocumentDate, ObjectID, EmployeeID, ManagerID, CeoID,
        Memo, BaseTotal, UserCreate, DateCreate, BranchID, StatusID
    )
    SELECT DocumentID, DocumentDate, ObjectID, EmployeeID, ManagerID, CeoID,
           N'UAT: doanh số ngày phục vụ biểu đồ; có thể dọn bằng tiền tố UATREV_',
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
           N'UAT daily revenue', StoreHouseID, @Owner, @Now
    FROM @Sales;

    INSERT INTO dbo.AR_InvoiceTbl
    (
        DocumentID, DocumentDate, ObjectID, EmployeeID, ManagerID, CeoID,
        Memo, BaseTotal, UserCreate, DateCreate, BranchID, StatusID
    )
    SELECT DocumentID, DocumentDate, ObjectID, EmployeeID, ManagerID, CeoID,
           N'UAT: hóa đơn mẫu doanh số ngày',
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

    IF (SELECT COUNT(*) FROM dbo.AR_OrderTbl WHERE DocumentID LIKE 'UATREV[_]%') <> 14
        THROW 51308, N'UATREV_ORDER_COUNT_INVALID', 1;

    IF (SELECT COUNT(*) FROM dbo.AR_InvoiceTbl WHERE DocumentID LIKE 'UATREV[_]%') <> 14
        THROW 51309, N'UATREV_INVOICE_COUNT_INVALID', 1;

    IF (SELECT COUNT(*) FROM dbo.AR_OrderAndReturnView
        WHERE DocumentID LIKE 'UATREV[_]%' AND StatusID IN (3, 6, 7, 8)) <> 14
        THROW 51310, N'UATREV_REVENUE_VIEW_COUNT_INVALID', 1;

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
        HAVING COUNT(S.ObjectID) <> 1
    )
        THROW 51311, N'UATREV_SCOPE_NOT_ONE_CUSTOMER_FOR_ALL_13_ACCOUNTS', 1;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

SELECT
    'UATREV_SEED' AS SeedName,
    DB_NAME() AS DatabaseName,
    @AsOfDate AS AsOfDate,
    @RuleCode + '/' + @RuleVersion AS RuleVersion,
    (SELECT COUNT(*) FROM @Accounts) AS AccountCount,
    (SELECT COUNT(*) FROM dbo.CF_ObjectTbl
     WHERE ObjectID LIKE 'UATREV[_]%' AND UserCreate = @Owner) AS CustomerCount,
    (SELECT COUNT(*) FROM dbo.AR_OrderTbl
     WHERE DocumentID LIKE 'UATREV[_]%' AND UserCreate = @Owner) AS OrderCount,
    (SELECT COUNT(*) FROM dbo.AR_InvoiceTbl
     WHERE DocumentID LIKE 'UATREV[_]%' AND UserCreate = @Owner) AS InvoiceCount,
    (SELECT COUNT(*) FROM dbo.AR_OrderAndReturnView
     WHERE DocumentID LIKE 'UATREV[_]%' AND StatusID IN (3, 6, 7, 8)) AS RevenueViewLines;

SELECT A.SortOrder, A.UserName, C.CohortCode,
       COUNT(S.ObjectID) AS VisibleUatrevCustomers,
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

SELECT DocumentDate, COUNT(*) AS RevenueLineCount, SUM(TotalAmount) AS SeedRevenue
FROM dbo.AR_OrderAndReturnView
WHERE DocumentID LIKE 'UATREV[_]%'
  AND StatusID IN (3, 6, 7, 8)
GROUP BY DocumentDate
ORDER BY DocumentDate;
