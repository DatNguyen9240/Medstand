/*
Post-deploy verification for dbo.API_DanhMuc_Core_AI.
Read-only: this script does not update business data.
It throws immediately when a scope contract is violated.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.API_DanhMuc_Core_AI', N'P') IS NULL
    THROW 51300, N'dbo.API_DanhMuc_Core_AI does not exist.', 1;
IF OBJECT_ID(N'dbo.API_DanhMuc_AI', N'P') IS NULL
    THROW 51319, N'dbo.API_DanhMuc_AI wrapper does not exist.', 1;
IF NOT EXISTS (
    SELECT 1
    FROM dbo.API_Definition WITH (NOLOCK)
    WHERE ApiCode = '@danh_muc'
      AND StoredProcedure = 'API_DanhMuc_AI'
      AND IsActive = 1
)
    THROW 51320, N'@danh_muc is not mapped to the active API_DanhMuc_AI wrapper.', 1;

DECLARE @TDVUsername VARCHAR(50);
DECLARE @TDVEmployeeID VARCHAR(50);
DECLARE @ManagerUsername VARCHAR(50);
DECLARE @ManagerEmployeeID VARCHAR(50);

SELECT TOP (1)
    @TDVUsername = UserName,
    @TDVEmployeeID = EmployeeID
FROM dbo.SY_User WITH (NOLOCK)
WHERE ISNULL(Disable, 0) = 0
  AND ISNULL(Manager, 0) = 0
  AND UserGroupID NOT IN ('Admin', 'SADM', 'BGD', 'GD')
  AND ISNULL(EmployeeID, '') <> ''
  AND EXISTS (
      SELECT 1
      FROM dbo.CF_ObjectTbl E WITH (NOLOCK)
      WHERE E.ObjectID = SY_User.EmployeeID
        AND E.isEmployee = 1
        AND ISNULL(E.isDisable, 0) = 0
  )
ORDER BY
    CASE WHEN EXISTS (
        SELECT 1
        FROM dbo.SY_UserStoreHouseTbl US WITH (NOLOCK)
        WHERE US.UserName = SY_User.UserName
    ) THEN 0 ELSE 1 END,
    UserName;

SELECT TOP (1)
    @ManagerUsername = UserName,
    @ManagerEmployeeID = EmployeeID
FROM dbo.SY_User WITH (NOLOCK)
WHERE ISNULL(Disable, 0) = 0
  AND ISNULL(Manager, 0) = 1
  AND UserGroupID NOT IN ('Admin', 'SADM', 'BGD', 'GD')
  AND ISNULL(EmployeeID, '') <> ''
ORDER BY UserName;

IF @TDVUsername IS NULL
    THROW 51301, N'No enabled TDV account is available for verification.', 1;
IF @ManagerUsername IS NULL
    THROW 51302, N'No enabled manager account is available for verification.', 1;

CREATE TABLE #Catalog (
    [type] VARCHAR(50),
    label NVARCHAR(250),
    icon NVARCHAR(100),
    DataSourceValue NVARCHAR(MAX)
);
INSERT INTO #Catalog
EXEC dbo.API_DanhMuc_Core_AI @Type = NULL, @timkiem = N'', @Username = @TDVUsername;

IF EXISTS (SELECT 1 FROM #Catalog WHERE DataSourceValue LIKE 'API[_]%')
    THROW 51303, N'Catalog exposes an internal stored-procedure name.', 1;

CREATE TABLE #Denied (Msg NVARCHAR(4000), MsgType INT);
INSERT INTO #Denied
EXEC dbo.API_DanhMuc_Core_AI @Type = N'donhang', @timkiem = N'', @Username = N'__invalid_scope_test__';
IF NOT EXISTS (SELECT 1 FROM #Denied WHERE MsgType = 1)
    THROW 51304, N'Unknown user was not denied.', 1;

CREATE TABLE #TDVOrders (
    [Type] VARCHAR(50), MaDanhMuc VARCHAR(100), [Name] NVARCHAR(500),
    PhanLoai NVARCHAR(100), DocumentDate DATETIME, BaseTotal DECIMAL(38, 6),
    StatusName NVARCHAR(250), EmployeeID VARCHAR(50), EmployeeName NVARCHAR(500),
    DateCreate DATETIME, ExtraData NVARCHAR(MAX)
);
INSERT INTO #TDVOrders
EXEC dbo.API_DanhMuc_Core_AI @Type = N'donhang', @timkiem = N'', @Username = @TDVUsername;
IF EXISTS (SELECT 1 FROM #TDVOrders WHERE ISNULL(EmployeeID, '') <> @TDVEmployeeID)
    THROW 51305, N'TDV order scope leaked another employee order.', 1;

CREATE TABLE #TDVEmployees (
    [Type] VARCHAR(50), MaDanhMuc VARCHAR(100), [Name] NVARCHAR(500),
    PhanLoai NVARCHAR(100), Phone VARCHAR(100), Email VARCHAR(250), ExtraData NVARCHAR(MAX)
);
INSERT INTO #TDVEmployees
EXEC dbo.API_DanhMuc_Core_AI @Type = N'nhanvien', @timkiem = N'', @Username = @TDVUsername;
IF EXISTS (SELECT 1 FROM #TDVEmployees WHERE ISNULL(MaDanhMuc, '') <> @TDVEmployeeID)
    THROW 51306, N'TDV employee scope leaked another employee.', 1;

CREATE TABLE #TDVCustomers (
    [Type] VARCHAR(50), MaDanhMuc VARCHAR(100), [Name] NVARCHAR(500),
    PhanLoai NVARCHAR(100), [Address] NVARCHAR(1000), TaxCode VARCHAR(100),
    Phone VARCHAR(100), ExtraData NVARCHAR(MAX)
);
INSERT INTO #TDVCustomers
EXEC dbo.API_DanhMuc_Core_AI @Type = N'khachhang', @timkiem = N'', @Username = @TDVUsername;
IF EXISTS (
    SELECT 1
    FROM #TDVCustomers C
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.AR_GetObjectByUserFnc(@TDVUsername) A
        WHERE A.ObjectID = C.MaDanhMuc
    )
)
    THROW 51307, N'TDV customer scope leaked an unassigned customer.', 1;

CREATE TABLE #TDVStores (
    [Type] VARCHAR(50), MaDanhMuc VARCHAR(100), [Name] NVARCHAR(500),
    PhanLoai NVARCHAR(100), ExtraData NVARCHAR(MAX)
);
INSERT INTO #TDVStores
EXEC dbo.API_DanhMuc_Core_AI @Type = N'khohang', @timkiem = N'', @Username = @TDVUsername;
IF EXISTS (SELECT 1 FROM #TDVStores WHERE MaDanhMuc NOT IN ('CTY', 'DL02', 'DL03'))
    THROW 51323, N'TDV warehouse catalog returned a non-sales warehouse.', 1;
IF EXISTS (
    SELECT 1
    FROM #TDVStores S
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.SY_UserStoreHouseTbl U WITH (NOLOCK)
        WHERE U.UserName = @TDVUsername
          AND U.StoreHouseID = S.MaDanhMuc
    )
)
    THROW 51308, N'TDV warehouse scope leaked an unassigned warehouse.', 1;

CREATE TABLE #TDVAll (
    [Type] VARCHAR(50), MaDanhMuc VARCHAR(100), [Name] NVARCHAR(500),
    PhanLoai NVARCHAR(100), Phone VARCHAR(100), TaxCode VARCHAR(100), ExtraData NVARCHAR(MAX)
);
INSERT INTO #TDVAll
EXEC dbo.API_DanhMuc_Core_AI @Type = N'all', @timkiem = N'', @Username = @TDVUsername;
IF EXISTS (
    SELECT 1
    FROM #TDVAll X
    INNER JOIN dbo.AR_OrderTbl O WITH (NOLOCK) ON O.DocumentID = X.MaDanhMuc
    WHERE X.[Type] = 'donhang'
      AND ISNULL(O.EmployeeID, '') <> @TDVEmployeeID
)
    THROW 51309, N'TDV all-search leaked another employee order.', 1;
IF EXISTS (SELECT 1 FROM #TDVAll WHERE [Type] = 'nhanvien' AND MaDanhMuc <> @TDVEmployeeID)
    THROW 51310, N'TDV all-search leaked another employee.', 1;
IF EXISTS (
    SELECT 1
    FROM #TDVAll X
    WHERE X.[Type] = 'khachhang'
      AND NOT EXISTS (
          SELECT 1 FROM dbo.AR_GetObjectByUserFnc(@TDVUsername) A
          WHERE A.ObjectID = X.MaDanhMuc
      )
)
    THROW 51311, N'TDV all-search leaked an unassigned customer.', 1;

DECLARE @ManagerAllowedEmployees TABLE (EmployeeID VARCHAR(50) PRIMARY KEY);
INSERT INTO @ManagerAllowedEmployees (EmployeeID) VALUES (@ManagerEmployeeID);
INSERT INTO @ManagerAllowedEmployees (EmployeeID)
SELECT DISTINCT U.EmployeeID
FROM dbo.SY_User U WITH (NOLOCK)
WHERE U.ManagerID = @ManagerEmployeeID
  AND ISNULL(U.Disable, 0) = 0
  AND ISNULL(U.EmployeeID, '') <> ''
  AND U.EmployeeID <> @ManagerEmployeeID;

CREATE TABLE #ManagerOrders (
    [Type] VARCHAR(50), MaDanhMuc VARCHAR(100), [Name] NVARCHAR(500),
    PhanLoai NVARCHAR(100), DocumentDate DATETIME, BaseTotal DECIMAL(38, 6),
    StatusName NVARCHAR(250), EmployeeID VARCHAR(50), EmployeeName NVARCHAR(500),
    DateCreate DATETIME, ExtraData NVARCHAR(MAX)
);
INSERT INTO #ManagerOrders
EXEC dbo.API_DanhMuc_Core_AI @Type = N'donhang', @timkiem = N'', @Username = @ManagerUsername;
IF EXISTS (
    SELECT 1 FROM #ManagerOrders O
    WHERE NOT EXISTS (
        SELECT 1 FROM @ManagerAllowedEmployees A WHERE A.EmployeeID = O.EmployeeID
    )
)
    THROW 51312, N'Manager order scope leaked an unrelated employee order.', 1;

CREATE TABLE #ManagerEmployees (
    [Type] VARCHAR(50), MaDanhMuc VARCHAR(100), [Name] NVARCHAR(500),
    PhanLoai NVARCHAR(100), Phone VARCHAR(100), Email VARCHAR(250), ExtraData NVARCHAR(MAX)
);
INSERT INTO #ManagerEmployees
EXEC dbo.API_DanhMuc_Core_AI @Type = N'nhanvien', @timkiem = N'', @Username = @ManagerUsername;
IF EXISTS (
    SELECT 1 FROM #ManagerEmployees E
    WHERE NOT EXISTS (
        SELECT 1 FROM @ManagerAllowedEmployees A WHERE A.EmployeeID = E.MaDanhMuc
    )
)
    THROW 51313, N'Manager employee scope leaked an unrelated employee.', 1;

CREATE TABLE #ManagerCustomers (
    [Type] VARCHAR(50), MaDanhMuc VARCHAR(100), [Name] NVARCHAR(500),
    PhanLoai NVARCHAR(100), [Address] NVARCHAR(1000), TaxCode VARCHAR(100),
    Phone VARCHAR(100), ExtraData NVARCHAR(MAX)
);
INSERT INTO #ManagerCustomers
EXEC dbo.API_DanhMuc_Core_AI @Type = N'khachhang', @timkiem = N'', @Username = @ManagerUsername;
IF EXISTS (
    SELECT 1
    FROM #ManagerCustomers C
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.AR_GetObjectByUserFnc(@ManagerUsername) A
        WHERE A.ObjectID = C.MaDanhMuc
    )
)
    THROW 51314, N'Manager customer scope leaked an unassigned customer.', 1;

CREATE TABLE #ManagerStores (
    [Type] VARCHAR(50), MaDanhMuc VARCHAR(100), [Name] NVARCHAR(500),
    PhanLoai NVARCHAR(100), ExtraData NVARCHAR(MAX)
);
INSERT INTO #ManagerStores
EXEC dbo.API_DanhMuc_Core_AI @Type = N'khohang', @timkiem = N'', @Username = @ManagerUsername;
IF EXISTS (SELECT 1 FROM #ManagerStores WHERE MaDanhMuc NOT IN ('CTY', 'DL02', 'DL03'))
    THROW 51324, N'Manager warehouse catalog returned a non-sales warehouse.', 1;
IF EXISTS (
    SELECT 1
    FROM #ManagerStores S
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.SY_UserStoreHouseTbl US WITH (NOLOCK)
        WHERE US.StoreHouseID = S.MaDanhMuc
          AND (
              US.UserName = @ManagerUsername
              OR EXISTS (
                  SELECT 1
                  FROM dbo.SY_User U WITH (NOLOCK)
                  WHERE U.UserName = US.UserName
                    AND U.ManagerID = @ManagerEmployeeID
                    AND ISNULL(U.Disable, 0) = 0
              )
          )
    )
)
    THROW 51315, N'Manager warehouse scope leaked an unassigned warehouse.', 1;

CREATE TABLE #ManagerAll (
    [Type] VARCHAR(50), MaDanhMuc VARCHAR(100), [Name] NVARCHAR(500),
    PhanLoai NVARCHAR(100), Phone VARCHAR(100), TaxCode VARCHAR(100), ExtraData NVARCHAR(MAX)
);
INSERT INTO #ManagerAll
EXEC dbo.API_DanhMuc_Core_AI @Type = N'all', @timkiem = N'', @Username = @ManagerUsername;
IF EXISTS (
    SELECT 1
    FROM #ManagerAll X
    INNER JOIN dbo.AR_OrderTbl O WITH (NOLOCK) ON O.DocumentID = X.MaDanhMuc
    WHERE X.[Type] = 'donhang'
      AND NOT EXISTS (
          SELECT 1 FROM @ManagerAllowedEmployees A WHERE A.EmployeeID = O.EmployeeID
      )
)
    THROW 51316, N'Manager all-search leaked an unrelated employee order.', 1;
IF EXISTS (
    SELECT 1 FROM #ManagerAll X
    WHERE X.[Type] = 'nhanvien'
      AND NOT EXISTS (
          SELECT 1 FROM @ManagerAllowedEmployees A WHERE A.EmployeeID = X.MaDanhMuc
      )
)
    THROW 51317, N'Manager all-search leaked an unrelated employee.', 1;
IF EXISTS (
    SELECT 1
    FROM #ManagerAll X
    WHERE X.[Type] = 'khachhang'
      AND NOT EXISTS (
          SELECT 1 FROM dbo.AR_GetObjectByUserFnc(@ManagerUsername) A
          WHERE A.ObjectID = X.MaDanhMuc
      )
)
    THROW 51318, N'Manager all-search leaked an unassigned customer.', 1;

TRUNCATE TABLE #TDVOrders;
INSERT INTO #TDVOrders
EXEC dbo.API_DanhMuc_AI @Type = N'donhang', @timkiem = N'', @Username = @TDVUsername;
IF EXISTS (SELECT 1 FROM #TDVOrders WHERE ISNULL(EmployeeID, '') <> @TDVEmployeeID)
    THROW 51321, N'Public API_DanhMuc_AI wrapper leaked another employee order.', 1;

TRUNCATE TABLE #Catalog;
INSERT INTO #Catalog
EXEC dbo.API_DanhMuc_AI @Type = NULL, @timkiem = N'', @Username = @TDVUsername;
IF EXISTS (SELECT 1 FROM #Catalog WHERE DataSourceValue LIKE 'API[_]%')
    THROW 51322, N'Public API_DanhMuc_AI wrapper exposes an internal stored-procedure name.', 1;

SELECT
    N'PASS' AS VerificationStatus,
    @TDVUsername AS TDVUsername,
    (SELECT COUNT(*) FROM #TDVOrders) AS TDVOrderCount,
    (SELECT COUNT(*) FROM #TDVEmployees) AS TDVEmployeeCount,
    (SELECT COUNT(*) FROM #TDVCustomers) AS TDVCustomerCount,
    (SELECT COUNT(*) FROM #TDVStores) AS TDVStoreCount,
    (SELECT COUNT(*) FROM #TDVAll) AS TDVAllCount,
    @ManagerUsername AS ManagerUsername,
    (SELECT COUNT(*) FROM #ManagerOrders) AS ManagerOrderCount,
    (SELECT COUNT(*) FROM #ManagerEmployees) AS ManagerEmployeeCount,
    (SELECT COUNT(*) FROM #ManagerCustomers) AS ManagerCustomerCount,
    (SELECT COUNT(*) FROM #ManagerStores) AS ManagerStoreCount,
    (SELECT COUNT(*) FROM #ManagerAll) AS ManagerAllCount,
    N'@danh_muc -> API_DanhMuc_AI -> API_DanhMuc_Core_AI' AS PublicApiRoute;
