USE medtest;
GO

/*
    STOCK-001 - one SQL source of truth for sellable stock.

    Stock rules are approved configuration, not literals duplicated across
    recommendation procedures. The read model is deliberately store-specific:

      AvailableStock = MAX(NonExpiredPhysicalStock - ReservedStock, 0)

    Reservation is rechecked with locks by the order mutation procedure.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'medtest'
    THROW 51000, N'STOCK-001 migration chỉ được chạy trên medtest.', 1;

IF OBJECT_ID(N'dbo.AI_BusinessRuleConfigTbl', N'U') IS NULL
    THROW 51001, N'Thiếu dbo.AI_BusinessRuleConfigTbl.', 1;

DECLARE @RuleCode VARCHAR(80) = 'BR-STOCK-001';
DECLARE @RuleVersion VARCHAR(30) = '2.0.0';
DECLARE @EffectiveFrom DATETIME2(0) = SYSUTCDATETIME();
DECLARE @ApprovedBy VARCHAR(100) = 'USER_CONFIRMED_IN_CHAT';
DECLARE @ApprovalReason NVARCHAR(500) = N'STOCK-001: dùng SQL làm nguồn duy nhất cho tồn khả dụng theo quyền; business owner chấp thuận triển khai ngày 03/08/2026.';

DECLARE @Seed TABLE
(
    ConfigKey VARCHAR(80) NOT NULL PRIMARY KEY,
    ConfigValue NVARCHAR(200) NOT NULL,
    ValueType VARCHAR(20) NOT NULL
);

INSERT INTO @Seed (ConfigKey, ConfigValue, ValueType)
VALUES
    ('SalesWarehouseIDs', N'CTY,DL02,DL03', 'CSV_STRING'),
    ('ReservedOrderStatusIDs', N'-2,-1,0,1,2,4', 'CSV_INT'),
    ('GlobalUserGroupIDs', N'ADMIN,SADM,BGD,GD', 'CSV_STRING'),
    ('ManagerUserGroupIDs', N'QL', 'CSV_STRING'),
    ('SellableItemGroupIDs', N'HH1', 'CSV_STRING'),
    ('UtcOffsetMinutes', N'420', 'INT');

BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE C
       SET C.ConfigValue = S.ConfigValue,
           C.ValueType = S.ValueType,
           C.Status = 'APPROVED',
           C.EffectiveFrom = COALESCE(C.EffectiveFrom, @EffectiveFrom),
           C.EffectiveTo = NULL,
           C.ApprovedBy = @ApprovedBy,
           C.ApprovalReason = @ApprovalReason,
           C.ModifiedAt = SYSUTCDATETIME()
    FROM dbo.AI_BusinessRuleConfigTbl C
    JOIN @Seed S ON S.ConfigKey = C.ConfigKey
    WHERE C.RuleCode = @RuleCode
      AND C.RuleVersion = @RuleVersion;

    INSERT INTO dbo.AI_BusinessRuleConfigTbl
    (
        RuleCode, RuleVersion, ConfigKey, ConfigValue, ValueType,
        Status, EffectiveFrom, EffectiveTo, ApprovedBy, ApprovalReason
    )
    SELECT
        @RuleCode, @RuleVersion, S.ConfigKey, S.ConfigValue, S.ValueType,
        'APPROVED', @EffectiveFrom, NULL, @ApprovedBy, @ApprovalReason
    FROM @Seed S
    WHERE NOT EXISTS
    (
        SELECT 1
        FROM dbo.AI_BusinessRuleConfigTbl C
        WHERE C.RuleCode = @RuleCode
          AND C.RuleVersion = @RuleVersion
          AND C.ConfigKey = S.ConfigKey
    );

    IF (SELECT COUNT(*)
        FROM dbo.AI_BusinessRuleConfigTbl
        WHERE RuleCode = @RuleCode
          AND RuleVersion = @RuleVersion
          AND Status = 'APPROVED'
          AND EffectiveFrom IS NOT NULL
          AND EffectiveTo IS NULL) <> (SELECT COUNT(*) FROM @Seed)
        THROW 51002, N'Không thể kích hoạt đầy đủ cấu hình STOCK-001.', 1;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

CREATE OR ALTER FUNCTION dbo.AI_WarehouseByUserFnc
(
    @Username VARCHAR(50),
    @AsOfUtc DATETIME2(0)
)
RETURNS TABLE
AS
RETURN
(
    WITH RuleCandidate AS
    (
        SELECT C.RuleVersion,
               MAX(COALESCE(C.EffectiveFrom, CONVERT(DATETIME2(0), '19000101'))) AS EffectiveFrom
        FROM dbo.AI_BusinessRuleConfigTbl C
        WHERE C.RuleCode = 'BR-STOCK-001'
          AND C.Status = 'APPROVED'
          AND (C.EffectiveFrom IS NULL OR C.EffectiveFrom <= @AsOfUtc)
          AND (C.EffectiveTo IS NULL OR C.EffectiveTo > @AsOfUtc)
          AND C.ConfigKey IN
              ('SalesWarehouseIDs', 'ReservedOrderStatusIDs', 'GlobalUserGroupIDs',
               'ManagerUserGroupIDs', 'SellableItemGroupIDs', 'UtcOffsetMinutes')
        GROUP BY C.RuleVersion
        HAVING COUNT(DISTINCT C.ConfigKey) = 6
    ),
    ActiveRule AS
    (
        SELECT TOP (1) RuleVersion
        FROM RuleCandidate
        ORDER BY EffectiveFrom DESC, RuleVersion DESC
    ),
    Config AS
    (
        SELECT C.ConfigKey, C.ConfigValue, C.RuleVersion
        FROM dbo.AI_BusinessRuleConfigTbl C
        JOIN ActiveRule R ON R.RuleVersion = C.RuleVersion
        WHERE C.RuleCode = 'BR-STOCK-001'
          AND C.Status = 'APPROVED'
          AND (C.EffectiveFrom IS NULL OR C.EffectiveFrom <= @AsOfUtc)
          AND (C.EffectiveTo IS NULL OR C.EffectiveTo > @AsOfUtc)
    ),
    ConfiguredWarehouse AS
    (
        SELECT DISTINCT LTRIM(RTRIM(S.value)) AS StoreHouseID
        FROM Config C
        CROSS APPLY STRING_SPLIT(C.ConfigValue, ',') S
        WHERE C.ConfigKey = 'SalesWarehouseIDs'
          AND LTRIM(RTRIM(S.value)) <> ''
    ),
    UserScope AS
    (
        SELECT U.UserName,
               COALESCE(U.EmployeeID, '') AS EmployeeID,
               COALESCE(U.BranchID, '') AS BranchID,
               CASE
                   WHEN EXISTS
                   (
                       SELECT 1
                       FROM Config C
                       CROSS APPLY STRING_SPLIT(C.ConfigValue, ',') S
                       WHERE C.ConfigKey = 'GlobalUserGroupIDs'
                         AND UPPER(LTRIM(RTRIM(S.value))) = UPPER(COALESCE(U.UserGroupID, ''))
                   ) THEN CAST(1 AS BIT)
                   ELSE CAST(0 AS BIT)
               END AS IsGlobal,
               CASE
                   WHEN COALESCE(U.Manager, 0) = 1 OR EXISTS
                   (
                       SELECT 1
                       FROM Config C
                       CROSS APPLY STRING_SPLIT(C.ConfigValue, ',') S
                       WHERE C.ConfigKey = 'ManagerUserGroupIDs'
                         AND UPPER(LTRIM(RTRIM(S.value))) = UPPER(COALESCE(U.UserGroupID, ''))
                   ) THEN CAST(1 AS BIT)
                   ELSE CAST(0 AS BIT)
               END AS IsManager
        FROM dbo.SY_User U
        WHERE U.UserName = @Username
          AND COALESCE(U.Disable, 0) = 0
    ),
    EffectiveWarehouse AS
    (
        SELECT W.StoreHouseID, U.BranchID, U.IsGlobal, C.RuleVersion
        FROM UserScope U
        CROSS JOIN ConfiguredWarehouse W
        CROSS JOIN (SELECT TOP (1) RuleVersion FROM Config) C
        WHERE U.IsGlobal = 1

        UNION

        SELECT W.StoreHouseID, U.BranchID, U.IsGlobal, C.RuleVersion
        FROM UserScope U
        JOIN dbo.SY_UserStoreHouseTbl M ON M.UserName = U.UserName
        JOIN ConfiguredWarehouse W ON W.StoreHouseID = M.StoreHouseID
        CROSS JOIN (SELECT TOP (1) RuleVersion FROM Config) C

        UNION

        SELECT W.StoreHouseID, U.BranchID, U.IsGlobal, C.RuleVersion
        FROM UserScope U
        JOIN dbo.SY_User Child
          ON Child.ManagerID = U.EmployeeID
         AND COALESCE(Child.Disable, 0) = 0
        JOIN dbo.SY_UserStoreHouseTbl M ON M.UserName = Child.UserName
        JOIN ConfiguredWarehouse W ON W.StoreHouseID = M.StoreHouseID
        CROSS JOIN (SELECT TOP (1) RuleVersion FROM Config) C
        WHERE U.IsManager = 1
          AND U.EmployeeID <> ''
    )
    SELECT DISTINCT
           E.StoreHouseID,
           E.BranchID,
           E.IsGlobal,
           CAST(N'AUTHORIZED_CONFIGURED_STORE' AS NVARCHAR(50)) AS WarehouseScope,
           E.RuleVersion
    FROM EffectiveWarehouse E
);
GO

CREATE OR ALTER FUNCTION dbo.AI_StockAvailableByUserFnc
(
    @Username VARCHAR(50),
    @ItemID VARCHAR(50),
    @AsOfUtc DATETIME2(0)
)
RETURNS TABLE
AS
RETURN
(
    WITH WarehouseScope AS
    (
        SELECT *
        FROM dbo.AI_WarehouseByUserFnc(@Username, @AsOfUtc)
    ),
    Config AS
    (
        SELECT C.ConfigKey, C.ConfigValue, C.RuleVersion
        FROM dbo.AI_BusinessRuleConfigTbl C
        JOIN (SELECT TOP (1) RuleVersion FROM WarehouseScope) R
          ON R.RuleVersion = C.RuleVersion
        WHERE C.RuleCode = 'BR-STOCK-001'
          AND C.Status = 'APPROVED'
          AND (C.EffectiveFrom IS NULL OR C.EffectiveFrom <= @AsOfUtc)
          AND (C.EffectiveTo IS NULL OR C.EffectiveTo > @AsOfUtc)
    ),
    RuntimeConfig AS
    (
        SELECT TRY_CONVERT(INT, MAX(CASE WHEN ConfigKey = 'UtcOffsetMinutes' THEN ConfigValue END)) AS UtcOffsetMinutes,
               MAX(RuleVersion) AS RuleVersion
        FROM Config
    ),
    LotBalance AS
    (
        SELECT T.ItemID,
               T.StoreHouseID,
               COALESCE(T.Lot, N'') AS Lot,
               T.ExpireDate,
               SUM(COALESCE(T.Quantity, 0)) AS RemainingPhysical,
               MAX(T.DocumentDate) AS LatestStockMovementDate
        FROM dbo.IV_StockTransactionTbl T
        JOIN WarehouseScope W ON W.StoreHouseID = T.StoreHouseID
        WHERE COALESCE(@ItemID, '') = '' OR T.ItemID = @ItemID
        GROUP BY T.ItemID, T.StoreHouseID, COALESCE(T.Lot, N''), T.ExpireDate
    ),
    PhysicalByStore AS
    (
        SELECT L.ItemID,
               L.StoreHouseID,
               SUM(L.RemainingPhysical) AS PhysicalStock,
               SUM(CASE
                       WHEN L.RemainingPhysical > 0
                        AND (L.ExpireDate IS NULL OR CAST(L.ExpireDate AS DATE) >=
                            CAST(DATEADD(MINUTE, COALESCE(R.UtcOffsetMinutes, 0), @AsOfUtc) AS DATE))
                           THEN L.RemainingPhysical
                       ELSE 0
                   END) AS NonExpiredPhysicalStock,
               MAX(L.LatestStockMovementDate) AS LatestStockMovementDate
        FROM LotBalance L
        CROSS JOIN RuntimeConfig R
        GROUP BY L.ItemID, L.StoreHouseID
    ),
    ReservedByStore AS
    (
        SELECT D.ItemID,
               D.StoreHouseID,
               SUM(COALESCE(D.Quantity, 0) + COALESCE(D.SoLuongTang, 0)) AS ReservedStock
        FROM dbo.AR_OrderDetailTbl D
        JOIN dbo.AR_OrderTbl O ON O.DocumentID = D.DocumentID
        JOIN WarehouseScope W ON W.StoreHouseID = D.StoreHouseID
        WHERE (COALESCE(@ItemID, '') = '' OR D.ItemID = @ItemID)
          AND EXISTS
          (
              SELECT 1
              FROM Config C
              CROSS APPLY STRING_SPLIT(C.ConfigValue, ',') S
              WHERE C.ConfigKey = 'ReservedOrderStatusIDs'
                AND TRY_CONVERT(INT, LTRIM(RTRIM(S.value))) = O.StatusID
          )
        GROUP BY D.ItemID, D.StoreHouseID
    )
    SELECT P.ItemID,
           P.StoreHouseID,
           SH.StoreHouseName,
           CAST(P.PhysicalStock AS DECIMAL(18, 2)) AS PhysicalStock,
           CAST(P.NonExpiredPhysicalStock AS DECIMAL(18, 2)) AS NonExpiredPhysicalStock,
           CAST(COALESCE(R.ReservedStock, 0) AS DECIMAL(18, 2)) AS ReservedStock,
           CAST(CASE
                    WHEN P.NonExpiredPhysicalStock - COALESCE(R.ReservedStock, 0) > 0
                        THEN P.NonExpiredPhysicalStock - COALESCE(R.ReservedStock, 0)
                    ELSE 0
                END AS DECIMAL(18, 2)) AS AvailableStock,
           CAST(CASE
                    WHEN P.PhysicalStock < 0 THEN N'STOCK_RECONCILIATION_REQUIRED'
                    WHEN P.NonExpiredPhysicalStock <= 0 THEN N'NO_SELLABLE_STOCK'
                    WHEN P.NonExpiredPhysicalStock - COALESCE(R.ReservedStock, 0) <= 0 THEN N'RESERVED_OUT'
                    ELSE N'AVAILABLE_FOR_SALE'
                END AS NVARCHAR(50)) AS StockDataStatus,
           W.WarehouseScope,
           @AsOfUtc AS StockUpdatedAt,
           @AsOfUtc AS StockAsOfAt,
           P.LatestStockMovementDate,
           CAST(N'IV_StockTransactionTbl-AR_OrderDetailTbl' AS NVARCHAR(100)) AS StockDataSource,
           W.RuleVersion
    FROM PhysicalByStore P
    JOIN WarehouseScope W ON W.StoreHouseID = P.StoreHouseID
    LEFT JOIN ReservedByStore R
      ON R.ItemID = P.ItemID
     AND R.StoreHouseID = P.StoreHouseID
    LEFT JOIN dbo.CF_StoreHouseTbl SH ON SH.StoreHouseID = P.StoreHouseID
);
GO

SELECT RuleCode, RuleVersion, ConfigKey, ConfigValue, Status, EffectiveFrom, ApprovedBy
FROM dbo.AI_BusinessRuleConfigTbl
WHERE RuleCode = 'BR-STOCK-001'
  AND RuleVersion = '2.0.0'
ORDER BY ConfigKey;
GO
