SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  CUSTOMER-CONTRACT-001/002

  Nguồn sự thật: AR_ObjectContractTbl + AR_ObjectContractDetailTbl.
  - Chương trình năm N được nhận diện bằng năm ở cuối MaHopDong hoặc trong TenHopDong.
  - Khách đổi mã được gom bằng CF_ObjectTbl.CodeChinh; khi trống thì dùng ObjectID.
  - Mỗi khách chỉ thuộc một Sale: mapping ObjectGroup hoạt động mới nhất tại @AsOfDate.
  - "Ba tháng gần nhất" = ba tháng lịch hoàn chỉnh ngay trước tháng @AsOfDate.
  - Doanh số là Amount ròng từ AR_OrderAndReturnView; Amount <= 0 được xem là chưa phát sinh.
*/

CREATE OR ALTER FUNCTION dbo.AI_ContractCustomerAssignmentFnc
(
    @ContractYear INT,
    @AsOfDate DATE
)
RETURNS TABLE
AS
RETURN
(
    WITH ContractBase AS
    (
        SELECT
            D.ObjectID,
            COALESCE(NULLIF(LTRIM(RTRIM(O.CodeChinh)), ''), D.ObjectID) AS CanonicalObjectID,
            O.ObjectName,
            O.BranchID,
            O.ObjectGroupID,
            D.MaHopDong,
            D.NgayThamGia,
            D.NgayHetHan,
            CASE WHEN D.NgayThamGia < DATEADD(DAY, 1, @AsOfDate)
                       AND (D.NgayHetHan IS NULL OR D.NgayHetHan >= @AsOfDate)
                 THEN 1 ELSE 0 END AS IsActiveAsOf
        FROM dbo.AR_ObjectContractDetailTbl D WITH (NOLOCK)
        INNER JOIN dbo.AR_ObjectContractTbl H WITH (NOLOCK) ON H.MaHopDong = D.MaHopDong
        INNER JOIN dbo.CF_ObjectTbl O WITH (NOLOCK) ON O.ObjectID = D.ObjectID
        WHERE COALESCE(H.isDisable, 0) = 0
          AND COALESCE(O.isDisable, 0) = 0
          AND O.isCustomer = 1
          AND
          (
              TRY_CONVERT(INT, RIGHT(RTRIM(H.MaHopDong), 4)) = @ContractYear
              OR H.TenHopDong LIKE N'%' + CONVERT(NVARCHAR(4), @ContractYear) + N'%'
          )
          AND D.NgayThamGia < DATEFROMPARTS(@ContractYear + 1, 1, 1)
          AND (D.NgayHetHan IS NULL OR D.NgayHetHan >= DATEFROMPARTS(@ContractYear, 1, 1))
    ),
    Representative AS
    (
        SELECT B.*,
               ROW_NUMBER() OVER
               (
                   PARTITION BY B.CanonicalObjectID
                   ORDER BY B.IsActiveAsOf DESC, B.NgayThamGia DESC, B.ObjectID
               ) AS CustomerRank
        FROM ContractBase B
    ),
    Rollup AS
    (
        SELECT CanonicalObjectID,
               MIN(NgayThamGia) AS FirstJoinDate,
               MAX(NgayHetHan) AS LastExpiryDate,
               COUNT(DISTINCT MaHopDong) AS ContractCount,
               MAX(IsActiveAsOf) AS IsActiveAsOf
        FROM ContractBase
        GROUP BY CanonicalObjectID
    ),
    OwnerCandidates AS
    (
        SELECT
            R.CanonicalObjectID,
            R.ObjectID,
            R.ObjectName,
            R.BranchID,
            R.ObjectGroupID,
            G.EmployeeID,
            G.ManagerID,
            ROW_NUMBER() OVER
            (
                PARTITION BY R.CanonicalObjectID
                ORDER BY COALESCE(G.StartDate, CONVERT(DATETIME, '19000101')) DESC,
                         COALESCE(G.EndDate, CONVERT(DATETIME, '99991231')) DESC,
                         G.EmployeeID
            ) AS OwnerRank
        FROM Representative R
        LEFT JOIN dbo.AR_ObjectGroupEmployeeTbl G WITH (NOLOCK)
          ON G.ObjectGroupID = R.ObjectGroupID
         AND COALESCE(G.isDisable, 0) = 0
         AND (G.StartDate IS NULL OR G.StartDate < DATEADD(DAY, 1, @AsOfDate))
         AND (G.EndDate IS NULL OR G.EndDate >= @AsOfDate)
        WHERE R.CustomerRank = 1
    )
    SELECT
        O.CanonicalObjectID,
        O.ObjectID,
        O.ObjectName,
        O.BranchID,
        O.ObjectGroupID,
        COALESCE(O.EmployeeID, '') AS EmployeeID,
        COALESCE(E.ObjectName, N'Chưa phân Sale') AS EmployeeName,
        COALESCE(O.ManagerID, '') AS ManagerID,
        COALESCE(M.ObjectName, N'Chưa phân QLBH') AS ManagerName,
        COALESCE(NULLIF(M.CeoID, ''), NULLIF(E.CeoID, ''), '') AS CeoID,
        COALESCE(C.ObjectName, N'') AS CeoName,
        R.FirstJoinDate,
        R.LastExpiryDate,
        R.ContractCount,
        CONVERT(BIT, R.IsActiveAsOf) AS IsActiveAsOf
    FROM OwnerCandidates O
    INNER JOIN Rollup R ON R.CanonicalObjectID = O.CanonicalObjectID
    LEFT JOIN dbo.CF_ObjectTbl E WITH (NOLOCK) ON E.ObjectID = O.EmployeeID
    LEFT JOIN dbo.CF_ObjectTbl M WITH (NOLOCK) ON M.ObjectID = O.ManagerID
    LEFT JOIN dbo.CF_ObjectTbl C WITH (NOLOCK)
      ON C.ObjectID = COALESCE(NULLIF(M.CeoID, ''), NULLIF(E.CeoID, ''))
    WHERE O.OwnerRank = 1
);
GO

CREATE OR ALTER PROCEDURE dbo.API_ContractCustomerStats_AI
    @Username VARCHAR(50) = '',
    @ContractYear INT = 2026,
    @AsOfDate DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET @AsOfDate = COALESCE(@AsOfDate, CONVERT(DATE, GETDATE()));

    IF @ContractYear < 2000 OR @ContractYear > YEAR(@AsOfDate) + 1
    BEGIN
        SELECT N'Năm hợp đồng không hợp lệ.' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    DECLARE @EmployeeID VARCHAR(50) = '', @ManagerID VARCHAR(50) = '', @CeoID VARCHAR(50) = '',
            @UserGroupID VARCHAR(50) = '', @IsManager BIT = 0, @IsGlobal BIT = 0, @Found BIT = 0;
    SELECT @Found = 1,
           @EmployeeID = COALESCE(EmployeeID, ''), @ManagerID = COALESCE(ManagerID, ''),
           @CeoID = COALESCE(CeoID, ''), @UserGroupID = UPPER(COALESCE(UserGroupID, '')),
           @IsManager = CASE WHEN COALESCE(Manager, 0) = 1 OR UPPER(COALESCE(UserGroupID, '')) IN ('QL','QLMN') THEN 1 ELSE 0 END,
           @IsGlobal = CASE WHEN UPPER(COALESCE(UserGroupID, '')) IN ('ADMIN','SADM','BGD','GD') THEN 1 ELSE 0 END
    FROM dbo.SY_User WITH (NOLOCK)
    WHERE UserName = @Username AND COALESCE(Disable, 0) = 0;
    IF @Found = 0
    BEGIN
        SELECT N'Tài khoản không hợp lệ hoặc đã bị khóa.' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    DECLARE @ActorID VARCHAR(50) = COALESCE(NULLIF(@EmployeeID, ''), NULLIF(@ManagerID, ''), @CeoID);
    DECLARE @PeriodEnd DATE = EOMONTH(DATEADD(MONTH, -1, @AsOfDate));
    DECLARE @PeriodStart DATE = DATEADD(MONTH, -2, DATEFROMPARTS(YEAR(@PeriodEnd), MONTH(@PeriodEnd), 1));

    ;WITH Scoped AS
    (
        SELECT C.*
        FROM dbo.AI_ContractCustomerAssignmentFnc(@ContractYear, @AsOfDate) C
        WHERE @IsGlobal = 1
           OR (@IsManager = 1 AND (C.ManagerID = @ActorID OR C.EmployeeID = @ActorID))
           OR (@IsManager = 0 AND C.EmployeeID = @EmployeeID)
    ),
    Revenue AS
    (
        SELECT COALESCE(NULLIF(LTRIM(RTRIM(O.CodeChinh)), ''), V.ObjectID) AS CanonicalObjectID,
               SUM(COALESCE(V.Amount, 0)) AS RevenueLast3Months,
               MAX(V.DocumentDate) AS LastRevenueDate
        FROM dbo.AR_OrderAndReturnView V WITH (NOLOCK)
        LEFT JOIN dbo.CF_ObjectTbl O WITH (NOLOCK) ON O.ObjectID = V.ObjectID
        WHERE V.DocumentDate >= @PeriodStart
          AND V.DocumentDate < DATEADD(DAY, 1, @PeriodEnd)
        GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(O.CodeChinh)), ''), V.ObjectID)
    ),
    Detail AS
    (
        SELECT S.*, COALESCE(R.RevenueLast3Months, 0) AS RevenueLast3Months, R.LastRevenueDate
        FROM Scoped S
        LEFT JOIN Revenue R ON R.CanonicalObjectID = S.CanonicalObjectID
    ),
    BySale AS
    (
        SELECT ManagerID, ManagerName, EmployeeID, EmployeeName,
               COUNT_BIG(*) AS ContractCustomerCount,
               SUM(CONVERT(BIGINT, IsActiveAsOf)) AS ActiveContractCustomerCount,
               SUM(CASE WHEN IsActiveAsOf = 1 AND RevenueLast3Months <= 0 THEN CONVERT(BIGINT, 1) ELSE 0 END) AS NoSales3MonthsCount,
               SUM(RevenueLast3Months) AS RevenueLast3Months
        FROM Detail
        GROUP BY ManagerID, ManagerName, EmployeeID, EmployeeName
    )
    SELECT 'TOTAL' AS ScopeLevel, '' AS ManagerID, N'Tổng phạm vi' AS ManagerName,
           '' AS EmployeeID, N'Tất cả Sale được phép xem' AS EmployeeName,
           COUNT_BIG(*) AS ContractCustomerCount,
           SUM(CONVERT(BIGINT, IsActiveAsOf)) AS ActiveContractCustomerCount,
           SUM(CASE WHEN IsActiveAsOf = 1 AND RevenueLast3Months <= 0 THEN CONVERT(BIGINT, 1) ELSE 0 END) AS NoSales3MonthsCount,
           SUM(RevenueLast3Months) AS RevenueLast3Months,
           @ContractYear AS ContractYear, @AsOfDate AS AsOfDate,
           @PeriodStart AS RevenuePeriodStart, @PeriodEnd AS RevenuePeriodEnd,
           N'AR_ObjectContractTbl+AR_ObjectContractDetailTbl' AS ContractDataSource,
           N'AR_OrderAndReturnView_NET' AS RevenueDataSource,
           N'CONTRACT_CUSTOMER_V1' AS ContractVersion
    FROM Detail
    UNION ALL
    SELECT 'SALE', ManagerID, ManagerName, EmployeeID, EmployeeName,
           ContractCustomerCount, ActiveContractCustomerCount, NoSales3MonthsCount, RevenueLast3Months,
           @ContractYear, @AsOfDate, @PeriodStart, @PeriodEnd,
           N'AR_ObjectContractTbl+AR_ObjectContractDetailTbl', N'AR_OrderAndReturnView_NET', N'CONTRACT_CUSTOMER_V1'
    FROM BySale
    ORDER BY ScopeLevel DESC, ManagerName, EmployeeName;
END;
GO

CREATE OR ALTER PROCEDURE dbo.API_ContractCustomerNoSales_AI
    @Username VARCHAR(50) = '',
    @ContractYear INT = 2026,
    @AsOfDate DATE = NULL,
    @TopN INT = 200
AS
BEGIN
    SET NOCOUNT ON;
    SET @AsOfDate = COALESCE(@AsOfDate, CONVERT(DATE, GETDATE()));
    IF @TopN IS NULL OR @TopN < 1 SET @TopN = 200;
    IF @TopN > 500 SET @TopN = 500;

    DECLARE @EmployeeID VARCHAR(50) = '', @ManagerID VARCHAR(50) = '', @CeoID VARCHAR(50) = '',
            @IsManager BIT = 0, @IsGlobal BIT = 0, @Found BIT = 0;
    SELECT @Found = 1,
           @EmployeeID = COALESCE(EmployeeID, ''), @ManagerID = COALESCE(ManagerID, ''), @CeoID = COALESCE(CeoID, ''),
           @IsManager = CASE WHEN COALESCE(Manager, 0) = 1 OR UPPER(COALESCE(UserGroupID, '')) IN ('QL','QLMN') THEN 1 ELSE 0 END,
           @IsGlobal = CASE WHEN UPPER(COALESCE(UserGroupID, '')) IN ('ADMIN','SADM','BGD','GD') THEN 1 ELSE 0 END
    FROM dbo.SY_User WITH (NOLOCK)
    WHERE UserName = @Username AND COALESCE(Disable, 0) = 0;
    IF @Found = 0
    BEGIN
        SELECT N'Tài khoản không hợp lệ hoặc đã bị khóa.' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    DECLARE @ActorID VARCHAR(50) = COALESCE(NULLIF(@EmployeeID, ''), NULLIF(@ManagerID, ''), @CeoID);
    DECLARE @PeriodEnd DATE = EOMONTH(DATEADD(MONTH, -1, @AsOfDate));
    DECLARE @PeriodStart DATE = DATEADD(MONTH, -2, DATEFROMPARTS(YEAR(@PeriodEnd), MONTH(@PeriodEnd), 1));

    ;WITH Scoped AS
    (
        SELECT C.*
        FROM dbo.AI_ContractCustomerAssignmentFnc(@ContractYear, @AsOfDate) C
        WHERE C.IsActiveAsOf = 1
          AND
          (
              @IsGlobal = 1
              OR (@IsManager = 1 AND (C.ManagerID = @ActorID OR C.EmployeeID = @ActorID))
              OR (@IsManager = 0 AND C.EmployeeID = @EmployeeID)
          )
    ),
    Revenue AS
    (
        SELECT COALESCE(NULLIF(LTRIM(RTRIM(O.CodeChinh)), ''), V.ObjectID) AS CanonicalObjectID,
               SUM(COALESCE(V.Amount, 0)) AS RevenueLast3Months,
               MAX(V.DocumentDate) AS LastRevenueDate
        FROM dbo.AR_OrderAndReturnView V WITH (NOLOCK)
        LEFT JOIN dbo.CF_ObjectTbl O WITH (NOLOCK) ON O.ObjectID = V.ObjectID
        WHERE V.DocumentDate >= @PeriodStart
          AND V.DocumentDate < DATEADD(DAY, 1, @PeriodEnd)
        GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(O.CodeChinh)), ''), V.ObjectID)
    )
    SELECT TOP (@TopN)
        S.CanonicalObjectID, S.ObjectID, S.ObjectName, S.BranchID, S.ObjectGroupID,
        S.EmployeeID, S.EmployeeName, S.ManagerID, S.ManagerName,
        S.FirstJoinDate, S.LastExpiryDate, S.ContractCount,
        CAST(COALESCE(R.RevenueLast3Months, 0) AS DECIMAL(18, 0)) AS RevenueLast3Months,
        R.LastRevenueDate,
        DATEDIFF(DAY, COALESCE(CONVERT(DATE, R.LastRevenueDate), S.FirstJoinDate), @AsOfDate) AS DaysSinceRevenueOrJoin,
        @PeriodStart AS RevenuePeriodStart, @PeriodEnd AS RevenuePeriodEnd,
        N'NO_NET_REVENUE_IN_LAST_3_COMPLETE_MONTHS' AS AlertCode,
        N'Khách hợp đồng chưa phát sinh doanh số ròng trong ba tháng lịch hoàn chỉnh gần nhất.' AS AlertMessage,
        N'CONTRACT_CUSTOMER_V1' AS ContractVersion
    FROM Scoped S
    LEFT JOIN Revenue R ON R.CanonicalObjectID = S.CanonicalObjectID
    WHERE COALESCE(R.RevenueLast3Months, 0) <= 0
    ORDER BY S.ManagerName, S.EmployeeName, DaysSinceRevenueOrJoin DESC, S.CanonicalObjectID;
END;
GO
