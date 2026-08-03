USE medtest;
GO

/*
    CORE-006 / CORE-007 — phân nhóm khách hàng theo rule APPROVED.

    Business threshold, kỳ dữ liệu, status, risk/trend ratio và UTC offset đều
    được đọc từ dbo.AI_BusinessRuleConfigTbl. Procedure fail-closed khi thiếu,
    sai kiểu hoặc trộn version cấu hình; không có fallback business hard-code.
*/
CREATE OR ALTER PROCEDURE dbo.API_ChamDiemKH_AI
    @Username      VARCHAR(50) = '',
    @MaKhachHang   NVARCHAR(100) = '',
    @NhomFilter    VARCHAR(50) = '',
    @EmployeeID    VARCHAR(50) = '',
    @BranchID      VARCHAR(50) = '',
    @RiskLevel     VARCHAR(20) = '',
    @Page          INT = 1,
    @PageSize      INT = 10,
    -- Giữ để tương thích client cũ; BR-TIER-V2 không dùng trọng số client.
    @W_Recency     DECIMAL(18,2) = NULL,
    @W_Frequency   DECIMAL(18,2) = NULL,
    @W_Monetary    DECIMAL(18,2) = NULL,
    @W_Consumption DECIMAL(18,2) = NULL,
    @AsOfDate      DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF OBJECT_ID('tempdb..#AllowedObjects') IS NOT NULL DROP TABLE #AllowedObjects;
    IF OBJECT_ID('tempdb..#VisibleObjects') IS NOT NULL DROP TABLE #VisibleObjects;
    IF OBJECT_ID('tempdb..#SalesStatus') IS NOT NULL DROP TABLE #SalesStatus;
    IF OBJECT_ID('tempdb..#RecognizedStatus') IS NOT NULL DROP TABLE #RecognizedStatus;
    IF OBJECT_ID('tempdb..#Raw') IS NOT NULL DROP TABLE #Raw;
    IF OBJECT_ID('tempdb..#Scored') IS NOT NULL DROP TABLE #Scored;
    IF OBJECT_ID('tempdb..#Segmented') IS NOT NULL DROP TABLE #Segmented;

    SET @Page = CASE WHEN ISNULL(@Page, 0) < 1 THEN 1 ELSE @Page END;
    SET @PageSize = CASE WHEN ISNULL(@PageSize, 0) < 1 THEN 10 WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    SET @MaKhachHang = COALESCE(@MaKhachHang, '');
    SET @EmployeeID = COALESCE(@EmployeeID, '');
    SET @BranchID = COALESCE(@BranchID, '');
    SET @NhomFilter = UPPER(COALESCE(@NhomFilter, ''));
    SET @RiskLevel = UPPER(COALESCE(@RiskLevel, ''));

    IF NOT EXISTS
    (
        SELECT 1
        FROM dbo.SY_User
        WHERE UserName = @Username
          AND COALESCE(Disable, 0) = 0
    )
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    IF OBJECT_ID(N'dbo.AI_BusinessRuleConfigTbl', N'U') IS NULL
        THROW 51100, N'TIER_CONFIG_TABLE_MISSING', 1;

    DECLARE @RuleCode VARCHAR(80) = 'BR-TIER-005';
    DECLARE @RuleVersion VARCHAR(30);
    DECLARE @RuleEffectiveFrom DATETIME2(0);
    DECLARE @NowUtc DATETIME2(0) = SYSUTCDATETIME();

    DECLARE @RequiredKeys TABLE (ConfigKey VARCHAR(80) NOT NULL PRIMARY KEY);
    INSERT INTO @RequiredKeys (ConfigKey)
    VALUES
        ('Method'), ('RevenueWindowMonths'), ('FrequencyWindowMonths'),
        ('TrendWindowMonths'), ('SalesStatusIDs'), ('ReturnStatusIDs'),
        ('TierAMinNetRevenue'), ('TierAMinFrequency'),
        ('TierBMinNetRevenue'), ('TierBMinFrequency'),
        ('NoHistorySegment'), ('NoHistoryRiskLevel'),
        ('HighRiskDays'), ('MediumRiskDays'), ('RiskDeclineRatio'),
        ('GrowthTrendRatio'), ('DeclineTrendRatio'), ('NewCustomerDays'),
        ('UtcOffsetMinutes'), ('RevenueBasis'), ('ReturnApplicationRule');

    SELECT TOP (1)
        @RuleVersion = M.RuleVersion,
        @RuleEffectiveFrom = M.EffectiveFrom
    FROM dbo.AI_BusinessRuleConfigTbl M
    WHERE M.RuleCode = @RuleCode
      AND M.ConfigKey = 'Method'
      AND M.Status = 'APPROVED'
      AND M.EffectiveFrom IS NOT NULL
      AND M.EffectiveFrom <= @NowUtc
      AND (M.EffectiveTo IS NULL OR M.EffectiveTo > @NowUtc)
      AND NOT EXISTS
      (
          SELECT 1
          FROM @RequiredKeys R
          WHERE NOT EXISTS
          (
              SELECT 1
              FROM dbo.AI_BusinessRuleConfigTbl C
              WHERE C.RuleCode = M.RuleCode
                AND C.RuleVersion = M.RuleVersion
                AND C.ConfigKey = R.ConfigKey
                AND C.Status = 'APPROVED'
                AND C.EffectiveFrom IS NOT NULL
                AND C.EffectiveFrom <= @NowUtc
                AND (C.EffectiveTo IS NULL OR C.EffectiveTo > @NowUtc)
          )
      )
    ORDER BY M.EffectiveFrom DESC, M.RuleConfigID DESC;

    IF @RuleVersion IS NULL
        THROW 51101, N'TIER_CONFIG_APPROVED_VERSION_NOT_FOUND_OR_INCOMPLETE', 1;

    DECLARE @Config TABLE
    (
        ConfigKey VARCHAR(80) NOT NULL PRIMARY KEY,
        ConfigValue NVARCHAR(200) NOT NULL
    );

    INSERT INTO @Config (ConfigKey, ConfigValue)
    SELECT C.ConfigKey, C.ConfigValue
    FROM dbo.AI_BusinessRuleConfigTbl C
    JOIN @RequiredKeys R ON R.ConfigKey = C.ConfigKey
    WHERE C.RuleCode = @RuleCode
      AND C.RuleVersion = @RuleVersion
      AND C.Status = 'APPROVED'
      AND C.EffectiveFrom IS NOT NULL
      AND C.EffectiveFrom <= @NowUtc
      AND (C.EffectiveTo IS NULL OR C.EffectiveTo > @NowUtc);

    DECLARE @Method VARCHAR(80);
    DECLARE @RevenueWindowMonths INT;
    DECLARE @FrequencyWindowMonths INT;
    DECLARE @TrendWindowMonths INT;
    DECLARE @SalesStatusIDs VARCHAR(200);
    DECLARE @ReturnStatusIDs VARCHAR(200);
    DECLARE @TierAMinNetRevenue DECIMAL(19,2);
    DECLARE @TierAMinFrequency INT;
    DECLARE @TierBMinNetRevenue DECIMAL(19,2);
    DECLARE @TierBMinFrequency INT;
    DECLARE @NoHistorySegment VARCHAR(20);
    DECLARE @NoHistoryRiskLevel VARCHAR(20);
    DECLARE @HighRiskDays INT;
    DECLARE @MediumRiskDays INT;
    DECLARE @RiskDeclineRatio DECIMAL(9,4);
    DECLARE @GrowthTrendRatio DECIMAL(9,4);
    DECLARE @DeclineTrendRatio DECIMAL(9,4);
    DECLARE @NewCustomerDays INT;
    DECLARE @UtcOffsetMinutes INT;
    DECLARE @RevenueBasis NVARCHAR(200);
    DECLARE @ReturnApplicationRule NVARCHAR(200);

    SELECT
        @Method = MAX(CASE WHEN ConfigKey = 'Method' THEN ConfigValue END),
        @RevenueWindowMonths = TRY_CONVERT(INT, MAX(CASE WHEN ConfigKey = 'RevenueWindowMonths' THEN ConfigValue END)),
        @FrequencyWindowMonths = TRY_CONVERT(INT, MAX(CASE WHEN ConfigKey = 'FrequencyWindowMonths' THEN ConfigValue END)),
        @TrendWindowMonths = TRY_CONVERT(INT, MAX(CASE WHEN ConfigKey = 'TrendWindowMonths' THEN ConfigValue END)),
        @SalesStatusIDs = MAX(CASE WHEN ConfigKey = 'SalesStatusIDs' THEN ConfigValue END),
        @ReturnStatusIDs = MAX(CASE WHEN ConfigKey = 'ReturnStatusIDs' THEN ConfigValue END),
        @TierAMinNetRevenue = TRY_CONVERT(DECIMAL(19,2), MAX(CASE WHEN ConfigKey = 'TierAMinNetRevenue' THEN ConfigValue END)),
        @TierAMinFrequency = TRY_CONVERT(INT, MAX(CASE WHEN ConfigKey = 'TierAMinFrequency' THEN ConfigValue END)),
        @TierBMinNetRevenue = TRY_CONVERT(DECIMAL(19,2), MAX(CASE WHEN ConfigKey = 'TierBMinNetRevenue' THEN ConfigValue END)),
        @TierBMinFrequency = TRY_CONVERT(INT, MAX(CASE WHEN ConfigKey = 'TierBMinFrequency' THEN ConfigValue END)),
        @NoHistorySegment = UPPER(MAX(CASE WHEN ConfigKey = 'NoHistorySegment' THEN ConfigValue END)),
        @NoHistoryRiskLevel = UPPER(MAX(CASE WHEN ConfigKey = 'NoHistoryRiskLevel' THEN ConfigValue END)),
        @HighRiskDays = TRY_CONVERT(INT, MAX(CASE WHEN ConfigKey = 'HighRiskDays' THEN ConfigValue END)),
        @MediumRiskDays = TRY_CONVERT(INT, MAX(CASE WHEN ConfigKey = 'MediumRiskDays' THEN ConfigValue END)),
        @RiskDeclineRatio = TRY_CONVERT(DECIMAL(9,4), MAX(CASE WHEN ConfigKey = 'RiskDeclineRatio' THEN ConfigValue END)),
        @GrowthTrendRatio = TRY_CONVERT(DECIMAL(9,4), MAX(CASE WHEN ConfigKey = 'GrowthTrendRatio' THEN ConfigValue END)),
        @DeclineTrendRatio = TRY_CONVERT(DECIMAL(9,4), MAX(CASE WHEN ConfigKey = 'DeclineTrendRatio' THEN ConfigValue END)),
        @NewCustomerDays = TRY_CONVERT(INT, MAX(CASE WHEN ConfigKey = 'NewCustomerDays' THEN ConfigValue END)),
        @UtcOffsetMinutes = TRY_CONVERT(INT, MAX(CASE WHEN ConfigKey = 'UtcOffsetMinutes' THEN ConfigValue END)),
        @RevenueBasis = MAX(CASE WHEN ConfigKey = 'RevenueBasis' THEN ConfigValue END),
        @ReturnApplicationRule = MAX(CASE WHEN ConfigKey = 'ReturnApplicationRule' THEN ConfigValue END)
    FROM @Config;

    IF @Method <> 'FIXED_NET_REVENUE_FREQUENCY'
       OR @RevenueWindowMonths IS NULL OR @RevenueWindowMonths <= 0
       OR @FrequencyWindowMonths IS NULL OR @FrequencyWindowMonths <= 0
       OR @FrequencyWindowMonths > @RevenueWindowMonths
       OR @TrendWindowMonths IS NULL OR @TrendWindowMonths <= 0
       OR @TrendWindowMonths * 2 > @RevenueWindowMonths
       OR @TierAMinNetRevenue IS NULL OR @TierBMinNetRevenue IS NULL
       OR @TierAMinNetRevenue <= @TierBMinNetRevenue OR @TierBMinNetRevenue < 0
       OR @TierAMinFrequency IS NULL OR @TierBMinFrequency IS NULL
       OR @TierAMinFrequency <= @TierBMinFrequency OR @TierBMinFrequency < 0
       OR @NoHistorySegment IS NULL OR @NoHistorySegment IN ('A', 'B', 'C')
       OR @NoHistoryRiskLevel IS NULL
       OR @HighRiskDays IS NULL OR @MediumRiskDays IS NULL
       OR @HighRiskDays <= @MediumRiskDays OR @MediumRiskDays < 0
       OR @RiskDeclineRatio IS NULL OR @RiskDeclineRatio <= 0
       OR @GrowthTrendRatio IS NULL OR @GrowthTrendRatio <= 1
       OR @DeclineTrendRatio IS NULL OR @DeclineTrendRatio <= 0 OR @DeclineTrendRatio >= 1
       OR @NewCustomerDays IS NULL OR @NewCustomerDays < 0
       OR @UtcOffsetMinutes IS NULL OR @UtcOffsetMinutes NOT BETWEEN -840 AND 840
       OR NULLIF(@RevenueBasis, '') IS NULL
       OR NULLIF(@ReturnApplicationRule, '') IS NULL
        THROW 51102, N'TIER_CONFIG_INVALID_VALUE', 1;

    CREATE TABLE #SalesStatus (StatusID INT NOT NULL PRIMARY KEY);
    CREATE TABLE #RecognizedStatus (StatusID INT NOT NULL PRIMARY KEY);

    IF EXISTS
    (
        SELECT 1 FROM STRING_SPLIT(@SalesStatusIDs, ',')
        WHERE TRY_CONVERT(INT, LTRIM(RTRIM(value))) IS NULL
    ) OR EXISTS
    (
        SELECT 1 FROM STRING_SPLIT(@ReturnStatusIDs, ',')
        WHERE TRY_CONVERT(INT, LTRIM(RTRIM(value))) IS NULL
    )
        THROW 51103, N'TIER_CONFIG_INVALID_STATUS_LIST', 1;

    INSERT INTO #SalesStatus (StatusID)
    SELECT DISTINCT TRY_CONVERT(INT, LTRIM(RTRIM(value)))
    FROM STRING_SPLIT(@SalesStatusIDs, ',');

    INSERT INTO #RecognizedStatus (StatusID)
    SELECT StatusID FROM #SalesStatus;

    INSERT INTO #RecognizedStatus (StatusID)
    SELECT DISTINCT TRY_CONVERT(INT, LTRIM(RTRIM(value)))
    FROM STRING_SPLIT(@ReturnStatusIDs, ',') R
    WHERE NOT EXISTS
    (
        SELECT 1
        FROM #RecognizedStatus X
        WHERE X.StatusID = TRY_CONVERT(INT, LTRIM(RTRIM(R.value)))
    );

    IF NOT EXISTS (SELECT 1 FROM #SalesStatus)
       OR NOT EXISTS (SELECT 1 FROM #RecognizedStatus)
        THROW 51104, N'TIER_CONFIG_EMPTY_STATUS_LIST', 1;

    IF @AsOfDate IS NULL
        SET @AsOfDate = CONVERT(DATE, DATEADD(MINUTE, @UtcOffsetMinutes, SYSUTCDATETIME()));

    DECLARE @EndExclusive DATETIME2(0) = DATEADD(DAY, 1, CONVERT(DATETIME2(0), @AsOfDate));
    DECLARE @RevenueStart DATETIME2(0) = DATEADD(MONTH, -@RevenueWindowMonths, @EndExclusive);
    DECLARE @FrequencyStart DATETIME2(0) = DATEADD(MONTH, -@FrequencyWindowMonths, @EndExclusive);
    DECLARE @RecentTrendStart DATETIME2(0) = DATEADD(MONTH, -@TrendWindowMonths, @EndExclusive);
    DECLARE @PriorTrendStart DATETIME2(0) = DATEADD(MONTH, -(@TrendWindowMonths * 2), @EndExclusive);

    IF @RiskLevel NOT IN ('', 'LOW', 'MEDIUM', 'HIGH', @NoHistoryRiskLevel)
        SET @RiskLevel = '';

    IF @NhomFilter LIKE '%VIP%' SET @NhomFilter = 'A';
    ELSE IF @NhomFilter LIKE N'%ỔN ĐỊNH%' SET @NhomFilter = 'B';
    ELSE IF @NhomFilter LIKE N'%NGUY CƠ%'
    BEGIN
        SET @NhomFilter = '';
        IF @RiskLevel = '' SET @RiskLevel = 'HIGH';
    END;
    ELSE IF @NhomFilter LIKE N'%CHƯA ĐỦ%' SET @NhomFilter = @NoHistorySegment;
    ELSE IF @NhomFilter NOT IN ('', 'A', 'B', 'C', @NoHistorySegment) SET @NhomFilter = '';

    IF @MaKhachHang LIKE '%NhomFilter%'
       OR UPPER(@MaKhachHang) LIKE '%VIP%'
       OR UPPER(@MaKhachHang) LIKE N'%ỔN ĐỊNH%'
       OR UPPER(@MaKhachHang) LIKE N'%NGUY CƠ%'
        SET @MaKhachHang = '';

    DECLARE @SYSBranchID VARCHAR(50) = '';
    SELECT @SYSBranchID = COALESCE(BranchID, '')
    FROM dbo.SY_User
    WHERE UserName = @Username;

    CREATE TABLE #AllowedObjects (ObjectID VARCHAR(50) NOT NULL PRIMARY KEY);
    INSERT INTO #AllowedObjects (ObjectID)
    SELECT DISTINCT ObjectID
    FROM dbo.AR_GetObjectByUserFnc(@Username);

    IF @SYSBranchID <> '' AND @BranchID <> '' AND @BranchID <> @SYSBranchID
    BEGIN
        SELECT N'Bạn không có quyền xem dữ liệu của chi nhánh đã chọn.' AS Msg, 1 AS MsgType;
        DROP TABLE #RecognizedStatus;
        DROP TABLE #SalesStatus;
        DROP TABLE #AllowedObjects;
        RETURN;
    END;

    IF @MaKhachHang <> ''
       AND NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectTbl WHERE ObjectID = @MaKhachHang)
    BEGIN
        DECLARE @ResolvedID VARCHAR(50) = '';
        DECLARE @CleanSearch NVARCHAR(100) = dbo.ufn_clean_customer_name(@MaKhachHang);

        SELECT TOP (1) @ResolvedID = O.ObjectID
        FROM dbo.CF_ObjectTbl O
        JOIN #AllowedObjects AO ON AO.ObjectID = O.ObjectID
        WHERE O.ObjectID LIKE '%' + @CleanSearch + '%'
           OR O.ObjectName LIKE '%' + @CleanSearch + '%'
        ORDER BY
            CASE WHEN O.ObjectID = @CleanSearch THEN 1
                 WHEN O.ObjectName = @CleanSearch THEN 2
                 WHEN O.ObjectName LIKE @CleanSearch + '%' THEN 3
                 ELSE 4 END,
            LEN(O.ObjectName), O.ObjectID;

        IF @ResolvedID = ''
        BEGIN
            SELECT TOP (1) @ResolvedID = O.ObjectID
            FROM dbo.CF_ObjectTbl O
            JOIN #AllowedObjects AO ON AO.ObjectID = O.ObjectID
            WHERE dbo.ufn_clean_customer_name(O.ObjectName) LIKE '%' + @CleanSearch + '%'
               OR O.ObjectID LIKE '%' + @CleanSearch + '%'
            ORDER BY
                CASE WHEN O.ObjectID = @CleanSearch THEN 1
                     WHEN dbo.ufn_clean_customer_name(O.ObjectName) = @CleanSearch THEN 2
                     ELSE 3 END,
                LEN(O.ObjectName), O.ObjectID;
        END;

        IF @ResolvedID <> '' SET @MaKhachHang = @ResolvedID;
    END;

    CREATE TABLE #VisibleObjects (ObjectID VARCHAR(50) NOT NULL PRIMARY KEY);
    INSERT INTO #VisibleObjects (ObjectID)
    SELECT AO.ObjectID
    FROM #AllowedObjects AO
    WHERE (@EmployeeID = '' AND @BranchID = '')
       OR EXISTS
       (
           SELECT 1
           FROM dbo.AR_OrderAndReturnView V
           JOIN #SalesStatus SS ON SS.StatusID = V.StatusID
           WHERE V.ObjectID = AO.ObjectID
             AND V.DocumentDate >= @RevenueStart
             AND V.DocumentDate < @EndExclusive
             AND (@EmployeeID = '' OR V.EmployeeID = @EmployeeID)
             AND (@BranchID = '' OR V.BranchID = @BranchID)
       );

    ;WITH RecognizedTransactions AS
    (
        SELECT
            V.DocumentID, V.ObjectID, V.DocumentDate, V.StatusID,
            CONVERT(DECIMAL(19,2), COALESCE(V.TotalAmount, 0)) AS TotalAmount
        FROM dbo.AR_OrderAndReturnView V
        JOIN #RecognizedStatus RS ON RS.StatusID = V.StatusID
        WHERE V.DocumentDate >= @RevenueStart
          AND V.DocumentDate < @EndExclusive
    )
    SELECT
        KH.ObjectID,
        COUNT(DISTINCT CASE WHEN SS.StatusID IS NOT NULL THEN T.DocumentID END) AS InvoiceCount_12M,
        COUNT(DISTINCT CASE WHEN SS.StatusID IS NOT NULL AND T.DocumentDate >= @FrequencyStart THEN T.DocumentID END) AS Frequency_6M,
        CONVERT(DECIMAL(19,2), COALESCE(SUM(T.TotalAmount), 0)) AS Monetary_12M,
        CONVERT(DECIMAL(19,2), COALESCE(SUM(CASE WHEN SS.StatusID IS NOT NULL AND T.DocumentDate >= @RecentTrendStart THEN T.TotalAmount ELSE 0 END), 0)) AS DoanhSo3ThangGan,
        CONVERT(DECIMAL(19,2), COALESCE(SUM(CASE WHEN SS.StatusID IS NOT NULL AND T.DocumentDate >= @PriorTrendStart AND T.DocumentDate < @RecentTrendStart THEN T.TotalAmount ELSE 0 END), 0)) AS DoanhSo3ThangTruoc,
        MAX(CASE WHEN SS.StatusID IS NOT NULL THEN T.DocumentDate END) AS LanMuaCuoi
    INTO #Raw
    FROM dbo.CF_ObjectTbl KH
    JOIN #VisibleObjects VO ON VO.ObjectID = KH.ObjectID
    LEFT JOIN RecognizedTransactions T ON T.ObjectID = KH.ObjectID
    LEFT JOIN #SalesStatus SS ON SS.StatusID = T.StatusID
    WHERE COALESCE(KH.isDisable, 0) = 0
      AND COALESCE(KH.isCustomer, 0) = 1
    GROUP BY KH.ObjectID;

    SELECT
        R.*,
        CASE WHEN R.LanMuaCuoi IS NULL THEN NULL
             ELSE DATEDIFF(DAY, R.LanMuaCuoi, @AsOfDate) END AS Recency_Days,
        CAST(CASE
            WHEN R.LanMuaCuoi IS NULL THEN 0
            WHEN DATEDIFF(DAY, R.LanMuaCuoi, @AsOfDate) <= 0 THEN 100
            WHEN DATEDIFF(DAY, R.LanMuaCuoi, @AsOfDate) >= @HighRiskDays THEN 0
            ELSE 100 - (DATEDIFF(DAY, R.LanMuaCuoi, @AsOfDate) * 100.0 / @HighRiskDays)
        END AS INT) AS R_Score,
        CAST(CASE
            WHEN R.Frequency_6M <= 0 THEN 0
            WHEN R.Frequency_6M >= @TierAMinFrequency THEN 100
            ELSE R.Frequency_6M * 100.0 / NULLIF(@TierAMinFrequency, 0)
        END AS INT) AS F_Score,
        CAST(CASE
            WHEN R.Monetary_12M <= 0 THEN 0
            WHEN R.Monetary_12M >= @TierAMinNetRevenue THEN 100
            ELSE R.Monetary_12M * 100.0 / NULLIF(@TierAMinNetRevenue, 0)
        END AS INT) AS M_Score,
        CAST(CASE
            WHEN R.DoanhSo3ThangTruoc <= 0 OR R.DoanhSo3ThangGan <= 0 THEN 0
            WHEN R.DoanhSo3ThangGan >= R.DoanhSo3ThangTruoc THEN 100
            ELSE R.DoanhSo3ThangGan * 100.0 / NULLIF(R.DoanhSo3ThangTruoc, 0)
        END AS INT) AS C_Score
    INTO #Scored
    FROM #Raw R;

    SELECT
        S.*,
        CASE WHEN S.F_Score < S.M_Score THEN S.F_Score ELSE S.M_Score END AS TotalScore,
        CASE
            WHEN S.InvoiceCount_12M = 0 THEN @NoHistorySegment
            WHEN S.Monetary_12M >= @TierAMinNetRevenue AND S.Frequency_6M >= @TierAMinFrequency THEN 'A'
            WHEN S.Monetary_12M >= @TierBMinNetRevenue AND S.Frequency_6M >= @TierBMinFrequency THEN 'B'
            ELSE 'C'
        END AS ValueSegment,
        CASE
            WHEN S.InvoiceCount_12M = 0 THEN @NoHistorySegment
            WHEN S.Monetary_12M >= @TierAMinNetRevenue AND S.Frequency_6M >= @TierAMinFrequency THEN 'A'
            WHEN S.Monetary_12M >= @TierBMinNetRevenue AND S.Frequency_6M >= @TierBMinFrequency THEN 'B'
            ELSE 'C'
        END AS Nhom,
        CASE
            WHEN S.InvoiceCount_12M = 0 THEN @NoHistoryRiskLevel
            WHEN S.Recency_Days >= @HighRiskDays THEN 'HIGH'
            WHEN S.Recency_Days >= @MediumRiskDays
              OR S.DoanhSo3ThangGan < S.DoanhSo3ThangTruoc * @RiskDeclineRatio THEN 'MEDIUM'
            ELSE 'LOW'
        END AS RiskLevel
    INTO #Segmented
    FROM #Scored S;

    ;WITH Result AS
    (
        SELECT
            KH.ObjectID,
            KH.ObjectName AS TenCuaHang,
            KH.Phone,
            S.Nhom,
            S.ValueSegment,
            S.RiskLevel,
            CASE S.Nhom
                WHEN 'A' THEN N'Khách giá trị cao'
                WHEN 'B' THEN N'Khách giá trị trung bình'
                WHEN 'C' THEN N'Khách giá trị thấp'
                ELSE N'Chưa đủ dữ liệu trong kỳ'
            END AS PhanLoai,
            S.TotalScore AS DiemTongHop,
            S.R_Score, S.F_Score, S.M_Score, S.C_Score,
            CONVERT(BIGINT, S.Monetary_12M) AS DoanhSo12Thang,
            CONVERT(BIGINT, S.DoanhSo3ThangGan) AS DoanhSo3ThangGan,
            S.InvoiceCount_12M AS SoHoaDon12Thang,
            S.Frequency_6M AS SoLanMua6Thang,
            CONVERT(DECIMAL(19,2), S.Monetary_12M / NULLIF(CONVERT(DECIMAL(19,2), @RevenueWindowMonths), 0)) AS DoanhSoThuanTrungBinhThang,
            CONVERT(DECIMAL(19,2), S.Monetary_12M / NULLIF(CONVERT(DECIMAL(19,2), S.InvoiceCount_12M), 0)) AS GiaTriDonThuanTrungBinh,
            S.LanMuaCuoi,
            S.Recency_Days AS SoNgayKhongMua,
            CASE
                WHEN S.InvoiceCount_12M = 0 THEN N'NEW_CUSTOMER: chưa đủ dữ liệu trong kỳ'
                WHEN S.DoanhSo3ThangTruoc = 0 THEN N'Khách mới hoặc chưa đủ chu kỳ'
                WHEN S.DoanhSo3ThangGan > S.DoanhSo3ThangTruoc * @GrowthTrendRatio THEN N'Tăng trưởng'
                WHEN S.DoanhSo3ThangGan < S.DoanhSo3ThangTruoc * @DeclineTrendRatio THEN N'Sụt giảm'
                ELSE N'Ổn định'
            END AS XuHuong,
            CASE
                WHEN S.InvoiceCount_12M = 0 THEN N'Không có hóa đơn hợp lệ trong kỳ đánh giá; chưa xếp A/B/C.'
                WHEN S.Recency_Days >= @HighRiskDays
                    THEN N'Không phát sinh đơn hàng trong ' + CONVERT(NVARCHAR(10), S.Recency_Days) + N' ngày.'
                WHEN S.DoanhSo3ThangTruoc > 0 AND S.DoanhSo3ThangGan < S.DoanhSo3ThangTruoc * @RiskDeclineRatio
                    THEN N'Doanh số kỳ gần nhất giảm vượt ngưỡng cấu hình so với kỳ trước.'
                WHEN KH.DateCreate >= DATEADD(DAY, -@NewCustomerDays, @AsOfDate)
                    THEN N'Khách mới, chưa đủ chu kỳ để đánh giá ổn định.'
                ELSE N'Nhóm giá trị tính từ doanh số thuần và tần suất theo rule cấu hình; risk được tính độc lập.'
            END AS LyDoChinh,
            CASE S.RiskLevel WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 1 ELSE 0 END AS RiskPriority
        FROM dbo.CF_ObjectTbl KH
        JOIN #Segmented S ON S.ObjectID = KH.ObjectID
        WHERE (@MaKhachHang = '' OR KH.ObjectID = @MaKhachHang)
          AND (@NhomFilter = '' OR S.Nhom = @NhomFilter)
          AND (@RiskLevel = '' OR S.RiskLevel = @RiskLevel)
    ), Numbered AS
    (
        SELECT *, COUNT(*) OVER () AS TotalRows
        FROM Result
    )
    SELECT
        ObjectID, TenCuaHang, Phone, Nhom, ValueSegment, RiskLevel,
        PhanLoai, DiemTongHop, R_Score, F_Score, M_Score, C_Score,
        DoanhSo12Thang, DoanhSo3ThangGan, SoHoaDon12Thang, SoLanMua6Thang,
        DoanhSoThuanTrungBinhThang, GiaTriDonThuanTrungBinh,
        CONVERT(VARCHAR(10), LanMuaCuoi, 103) AS LanMuaCuoi,
        SoNgayKhongMua, XuHuong, LyDoChinh, TotalRows,
        @Page AS [Page], @PageSize AS PageSize,
        @Method AS RuleSource,
        @RuleCode + '/' + @RuleVersion AS RuleVersion,
        @RuleEffectiveFrom AS RuleEffectiveFromUtc,
        @AsOfDate AS AsOfDate,
        @RevenueBasis AS RevenueBasis,
        @ReturnApplicationRule AS ReturnApplicationRule
    FROM Numbered
    ORDER BY RiskPriority DESC, DiemTongHop DESC, ObjectID ASC
    OFFSET ((@Page - 1) * @PageSize) ROWS
    FETCH NEXT @PageSize ROWS ONLY;

    DROP TABLE #Segmented;
    DROP TABLE #Scored;
    DROP TABLE #Raw;
    DROP TABLE #VisibleObjects;
    DROP TABLE #AllowedObjects;
    DROP TABLE #RecognizedStatus;
    DROP TABLE #SalesStatus;
END;
GO

/*
EXEC dbo.API_ChamDiemKH_AI
    @Username = 'QLBH013.MED',
    @AsOfDate = '2026-08-03';
*/
