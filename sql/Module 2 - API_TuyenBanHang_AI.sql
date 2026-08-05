USE medtest;
GO

-- =========================================================================
-- 1. NÂNG CẤP STORED PROCEDURE API_TuyenBanHang_AI:
-- Bổ sung cột ObjectName, Latitude và Longitude bằng cách LEFT JOIN với CF_ObjectMapTbl.
-- =========================================================================

CREATE OR ALTER PROCEDURE [dbo].[API_TuyenBanHang_AI]
    @Username      VARCHAR(50)   = '',
    @MaKhachHang   NVARCHAR(100) = '',
    @SoNgayVangMat INT           = 45,
    @NgayBaoDong   INT           = 5,
    @TopN          INT           = 8,
    @NgayTarget    VARCHAR(20)   = ''
AS
BEGIN
    SET NOCOUNT ON

    -- ═══ GUARD: dọn temp table còn sót lại từ request lỗi trước trên cùng connection ═══
    IF OBJECT_ID('tempdb..#AllowedObjects') IS NOT NULL DROP TABLE #AllowedObjects;
    IF OBJECT_ID('tempdb..#PurchaseEvent') IS NOT NULL DROP TABLE #PurchaseEvent;
    IF OBJECT_ID('tempdb..#LanMuaCuoi') IS NOT NULL DROP TABLE #LanMuaCuoi;
    IF OBJECT_ID('tempdb..#ChuKy') IS NOT NULL DROP TABLE #ChuKy;
    IF OBJECT_ID('tempdb..#Logic') IS NOT NULL DROP TABLE #Logic;

    -- Defend against NULL or non-positive bounds passed by web server binders
    IF @TopN IS NULL OR @TopN <= 0 SET @TopN = 8;

    -- 2. KIỂM TRA USER HỢP LỆ
    IF NOT EXISTS (SELECT 1 FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType
        RETURN
    END

    -- CORE-008: rule gợi ý phải là một phiên bản APPROVED đang có hiệu lực.
    DECLARE @RecommendationRuleCode VARCHAR(80) = 'BR-RECOMMENDATION-008';
    DECLARE @RecommendationRuleVersion VARCHAR(30) = NULL;
    DECLARE @RuleAsOfUtc DATETIME2(0) = SYSUTCDATETIME();
    DECLARE @RouteHistoryMonths INT = NULL;
    DECLARE @MinimumPurchaseEventCount INT = NULL;
    DECLARE @RoutePolicyDefaultCycleDays INT = NULL;
    DECLARE @RouteRecentInactiveDays INT = NULL;
    DECLARE @RouteMediumPriorityDays INT = NULL;
    DECLARE @ScoreOverdue INT = NULL;
    DECLARE @ScoreAlertWindow INT = NULL;
    DECLARE @ScoreMediumWindow INT = NULL;
    DECLARE @ScoreInactive INT = NULL;
    DECLARE @ScoreRecentInactive INT = NULL;
    DECLARE @ScoreScheduledRoute INT = NULL;
    DECLARE @SalesStatusIDs NVARCHAR(100) = NULL;
    DECLARE @ReturnAdjustmentMode NVARCHAR(300) = NULL;
    DECLARE @ActiveRuleVersionCount INT = 0;

    ;WITH ActiveVersions AS
    (
        SELECT C.RuleVersion
        FROM dbo.AI_BusinessRuleConfigTbl C WITH (NOLOCK)
        WHERE C.RuleCode = @RecommendationRuleCode
          AND C.Status = 'APPROVED'
          AND C.EffectiveFrom <= @RuleAsOfUtc
          AND (C.EffectiveTo IS NULL OR C.EffectiveTo > @RuleAsOfUtc)
        GROUP BY C.RuleVersion
    )
    SELECT @ActiveRuleVersionCount = COUNT(*),
           @RecommendationRuleVersion = MAX(RuleVersion)
    FROM ActiveVersions;

    IF @ActiveRuleVersionCount <> 1
    BEGIN
        SELECT N'Cấu hình gợi ý bán hàng đang thiếu hoặc có nhiều phiên bản cùng hiệu lực.' AS Msg,
               1 AS MsgType,
               N'SYSTEM_ERROR' AS Severity,
               CASE WHEN @ActiveRuleVersionCount = 0 THEN N'RULE_CONFIGURATION_MISSING' ELSE N'RULE_CONFIGURATION_CONFLICT' END AS Code;
        RETURN;
    END

    SELECT
        @RouteHistoryMonths = MAX(CASE WHEN ConfigKey = 'RouteHistoryMonths' THEN TRY_CONVERT(INT, ConfigValue) END),
        @MinimumPurchaseEventCount = MAX(CASE WHEN ConfigKey = 'MinimumPurchaseEventCount' THEN TRY_CONVERT(INT, ConfigValue) END),
        @RoutePolicyDefaultCycleDays = MAX(CASE WHEN ConfigKey = 'RoutePolicyDefaultCycleDays' THEN TRY_CONVERT(INT, ConfigValue) END),
        @SoNgayVangMat = MAX(CASE WHEN ConfigKey = 'RouteInactiveDays' THEN TRY_CONVERT(INT, ConfigValue) END),
        @RouteRecentInactiveDays = MAX(CASE WHEN ConfigKey = 'RouteRecentInactiveDays' THEN TRY_CONVERT(INT, ConfigValue) END),
        @NgayBaoDong = MAX(CASE WHEN ConfigKey = 'RouteAlertDays' THEN TRY_CONVERT(INT, ConfigValue) END),
        @RouteMediumPriorityDays = MAX(CASE WHEN ConfigKey = 'RouteMediumPriorityDays' THEN TRY_CONVERT(INT, ConfigValue) END),
        @ScoreOverdue = MAX(CASE WHEN ConfigKey = 'ScoreOverdue' THEN TRY_CONVERT(INT, ConfigValue) END),
        @ScoreAlertWindow = MAX(CASE WHEN ConfigKey = 'ScoreAlertWindow' THEN TRY_CONVERT(INT, ConfigValue) END),
        @ScoreMediumWindow = MAX(CASE WHEN ConfigKey = 'ScoreMediumWindow' THEN TRY_CONVERT(INT, ConfigValue) END),
        @ScoreInactive = MAX(CASE WHEN ConfigKey = 'ScoreInactive' THEN TRY_CONVERT(INT, ConfigValue) END),
        @ScoreRecentInactive = MAX(CASE WHEN ConfigKey = 'ScoreRecentInactive' THEN TRY_CONVERT(INT, ConfigValue) END),
        @ScoreScheduledRoute = MAX(CASE WHEN ConfigKey = 'ScoreScheduledRoute' THEN TRY_CONVERT(INT, ConfigValue) END),
        @SalesStatusIDs = MAX(CASE WHEN ConfigKey = 'SalesStatusIDs' THEN ConfigValue END),
        @ReturnAdjustmentMode = MAX(CASE WHEN ConfigKey = 'ReturnAdjustmentMode' THEN ConfigValue END)
    FROM dbo.AI_BusinessRuleConfigTbl WITH (NOLOCK)
    WHERE RuleCode = @RecommendationRuleCode
      AND RuleVersion = @RecommendationRuleVersion
      AND Status = 'APPROVED'
      AND EffectiveFrom <= @RuleAsOfUtc
      AND (EffectiveTo IS NULL OR EffectiveTo > @RuleAsOfUtc);

    IF COALESCE(@RouteHistoryMonths, 0) <= 0
       OR COALESCE(@MinimumPurchaseEventCount, 0) < 2
       OR COALESCE(@RoutePolicyDefaultCycleDays, 0) <= 0
       OR COALESCE(@SoNgayVangMat, 0) <= 0
       OR COALESCE(@RouteRecentInactiveDays, 0) <= 0
       OR @RouteRecentInactiveDays >= @SoNgayVangMat
       OR COALESCE(@NgayBaoDong, -1) < 0
       OR COALESCE(@RouteMediumPriorityDays, 0) <= @NgayBaoDong
       OR COALESCE(@ScoreOverdue, -1) < 0
       OR COALESCE(@ScoreAlertWindow, -1) < 0
       OR COALESCE(@ScoreMediumWindow, -1) < 0
       OR COALESCE(@ScoreInactive, -1) < 0
       OR COALESCE(@ScoreRecentInactive, -1) < 0
       OR COALESCE(@ScoreScheduledRoute, -1) < 0
       OR NULLIF(@SalesStatusIDs, '') IS NULL
       OR NULLIF(@ReturnAdjustmentMode, '') IS NULL
    BEGIN
        SELECT N'Cấu hình gợi ý bán hàng không đầy đủ hoặc không hợp lệ.' AS Msg,
               1 AS MsgType,
               N'SYSTEM_ERROR' AS Severity,
               N'RULE_CONFIGURATION_INVALID' AS Code;
        RETURN;
    END

    -- 3. THIẾT LẬP THỜI GIAN & THỨ TRONG TUẦN
    SET DATEFIRST 7  -- Chủ nhật = 1, Thứ 2 = 2, ..., Thứ 7 = 7
    DECLARE @TuNgay DATETIME = CASE WHEN @NgayTarget = '' THEN GETDATE() ELSE TRY_CAST(@NgayTarget AS DATETIME) END
    IF @TuNgay IS NULL SET @TuNgay = GETDATE()
    DECLARE @WorkDate DATE = CAST(@TuNgay AS DATE);
    DECLARE @RouteDataFrom DATE = DATEADD(MONTH, -@RouteHistoryMonths, @WorkDate);
    
    DECLARE @ThuHomNay VARCHAR(1) = CAST(DATEPART(dw, @TuNgay) AS VARCHAR)
    DECLARE @TenThuHomNay NVARCHAR(20) = ''
    
    SELECT @TenThuHomNay = CASE @ThuHomNay
        WHEN '1' THEN N'Chủ nhật'
        WHEN '2' THEN N'Thứ 2'
        WHEN '3' THEN N'Thứ 3'
        WHEN '4' THEN N'Thứ 4'
        WHEN '5' THEN N'Thứ 5'
        WHEN '6' THEN N'Thứ 6'
        WHEN '7' THEN N'Thứ 7'
    END

    -- 4. PHÂN QUYỀN USER (TDV / QUẢN LÝ / ADMIN)
    DECLARE @SYSBranchID    VARCHAR(50) = ''
    DECLARE @SYSCeoID       VARCHAR(50) = ''
    DECLARE @SYSManagerID   VARCHAR(50) = ''
    DECLARE @SYSUserGroupID VARCHAR(50) = ''

    SELECT
        @SYSBranchID    = COALESCE(BranchID,  ''),
        @SYSCeoID       = COALESCE(CeoID,     ''),
        @SYSManagerID   = COALESCE(ManagerID, ''),
        @SYSUserGroupID = COALESCE(UserGroupID, '')
    FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0

    -- Cache allowed objects based on username to optimize query plan
    CREATE TABLE #AllowedObjects (ObjectID VARCHAR(50) PRIMARY KEY);
    INSERT INTO #AllowedObjects (ObjectID)
    SELECT ObjectID FROM dbo.AR_GetObjectByUserFnc(@Username);

    -- TỰ ĐỘNG KHẮC PHỤC TÊN KHÁCH HÀNG / ẢO GIÁC:
    IF @MaKhachHang <> '' AND NOT EXISTS (SELECT 1 FROM CF_ObjectTbl WHERE ObjectID = @MaKhachHang)
    BEGIN
        DECLARE @ResolvedID VARCHAR(50) = '';
        
        -- Lấy ']' đầu tiên NẰM SAU '[' để không sinh độ dài âm cho SUBSTRING (Msg 536)
        DECLARE @BracketOpen  INT = CHARINDEX('[', @MaKhachHang);
        DECLARE @BracketClose INT = CHARINDEX(']', @MaKhachHang, @BracketOpen + 1);
        IF @BracketOpen > 0 AND @BracketClose > @BracketOpen
        BEGIN
            SET @MaKhachHang = SUBSTRING(@MaKhachHang, @BracketOpen + 1, @BracketClose - @BracketOpen - 1);
        END

        IF EXISTS (SELECT 1 FROM CF_ObjectTbl WHERE ObjectID = @MaKhachHang)
        BEGIN
            SET @ResolvedID = @MaKhachHang;
        END
        ELSE
        BEGIN
            -- Ưu tiên tìm khách hàng cùng chi nhánh trước và có nhiều giao dịch nhất
            SELECT TOP 1 @ResolvedID = O.ObjectID 
            FROM CF_ObjectTbl O
            LEFT JOIN (
                SELECT ObjectID, COUNT(*) AS Cnt 
                FROM AR_InvoiceTbl 
                GROUP BY ObjectID
            ) I ON O.ObjectID = I.ObjectID
            WHERE (
                O.ObjectName COLLATE SQL_Latin1_General_CP1_CI_AI = @MaKhachHang COLLATE SQL_Latin1_General_CP1_CI_AI
                OR O.ObjectName COLLATE SQL_Latin1_General_CP1_CI_AI LIKE N'%' + @MaKhachHang + '%' COLLATE SQL_Latin1_General_CP1_CI_AI
                OR REPLACE(O.ObjectName, ' ', '') COLLATE SQL_Latin1_General_CP1_CI_AI LIKE N'%' + REPLACE(@MaKhachHang, ' ', '') + '%' COLLATE SQL_Latin1_General_CP1_CI_AI
            )
              AND (ISNULL(@SYSBranchID, '') = '' OR O.BranchID = @SYSBranchID)
            ORDER BY ISNULL(I.Cnt, 0) DESC;
              
            -- Fallback tìm toàn quốc
            IF @ResolvedID = ''
            BEGIN
                SELECT TOP 1 @ResolvedID = O.ObjectID 
                FROM CF_ObjectTbl O
                LEFT JOIN (
                    SELECT ObjectID, COUNT(*) AS Cnt 
                    FROM AR_InvoiceTbl 
                    GROUP BY ObjectID
                ) I ON O.ObjectID = I.ObjectID
                WHERE (
                    O.ObjectName COLLATE SQL_Latin1_General_CP1_CI_AI = @MaKhachHang COLLATE SQL_Latin1_General_CP1_CI_AI
                    OR O.ObjectName COLLATE SQL_Latin1_General_CP1_CI_AI LIKE N'%' + @MaKhachHang + '%' COLLATE SQL_Latin1_General_CP1_CI_AI
                    OR REPLACE(O.ObjectName, ' ', '') COLLATE SQL_Latin1_General_CP1_CI_AI LIKE N'%' + REPLACE(@MaKhachHang, ' ', '') + '%' COLLATE SQL_Latin1_General_CP1_CI_AI
                )
                ORDER BY ISNULL(I.Cnt, 0) DESC;
            END
        END

        IF NULLIF(@ResolvedID, '') IS NOT NULL
        BEGIN
            SET @MaKhachHang = @ResolvedID;
        END
    END

    -- 1. KIỂM TRA MÃ KHÁCH HÀNG HỢP LỆ (Nếu có truyền vào)
    IF @MaKhachHang <> '' AND NOT EXISTS (SELECT 1 FROM CF_ObjectTbl WHERE ObjectID = @MaKhachHang)
    BEGIN
        SELECT 'N/A' AS ObjectID, N'Không tìm thấy mã khách hàng.' AS TenCuaHang, NULL AS Phone, 0 AS TichLuyDatDuoc, N'Vui lòng kiểm tra lại mã khách hàng.' AS TrangThaiAI;
        RETURN;
    END

    -- CORE-008: purchase event tuyến = khách + ngày mua; nhiều hóa đơn trong
    -- cùng một ngày chỉ là một event. Phiếu trả không tạo event mới.
    SELECT
        I.ObjectID,
        CAST(I.DocumentDate AS DATE) AS PurchaseDate,
        COUNT(DISTINCT I.DocumentID) AS InvoiceCount
    INTO #PurchaseEvent
    FROM dbo.AR_InvoiceTbl I WITH (NOLOCK)
    WHERE I.DocumentDate >= @RouteDataFrom
      AND I.DocumentDate < DATEADD(DAY, 1, @WorkDate)
      AND EXISTS (SELECT 1 FROM STRING_SPLIT(@SalesStatusIDs, ',') S WHERE TRY_CONVERT(INT, LTRIM(RTRIM(S.value))) = I.StatusID)
      AND (@MaKhachHang = '' OR I.ObjectID = @MaKhachHang)
      AND (
          UPPER(@SYSUserGroupID) = 'ADMIN'
          OR (
              (ISNULL(@SYSBranchID, '') = '' OR I.BranchID = @SYSBranchID)
              AND EXISTS (SELECT 1 FROM #AllowedObjects AO WHERE AO.ObjectID = I.ObjectID)
          )
      )
    GROUP BY I.ObjectID, CAST(I.DocumentDate AS DATE);

    -- Lần mua cuối lấy trên toàn bộ lịch sử hóa đơn hoàn tất, độc lập với cửa sổ tính chu kỳ.
    SELECT
        T.ObjectID,
        MAX(T.DocumentDate)                             AS LanMuaCuoi,
        DATEDIFF(DAY, MAX(T.DocumentDate), @WorkDate)   AS SoNgayKhongMua
    INTO #LanMuaCuoi
    FROM (
        SELECT ObjectID, DocumentDate, BranchID, CeoID, ManagerID 
        FROM AR_InvoiceTbl I
        WHERE EXISTS (SELECT 1 FROM STRING_SPLIT(@SalesStatusIDs, ',') S WHERE TRY_CONVERT(INT, LTRIM(RTRIM(S.value))) = I.StatusID)
    ) T
    WHERE (@MaKhachHang = '' OR T.ObjectID = @MaKhachHang)
      AND (
          UPPER(@SYSUserGroupID) = 'ADMIN'
          OR (
              (ISNULL(@SYSBranchID, '') = '' OR T.BranchID = @SYSBranchID)
              AND EXISTS (SELECT 1 FROM #AllowedObjects AO WHERE AO.ObjectID = T.ObjectID)
          )
      )
    GROUP BY T.ObjectID

    -- 6. TÍNH CHU KÝ MUA TRUNG BÌNH (6 tháng gần nhất)
    SELECT
        P.ObjectID,
        SUM(P.InvoiceCount) AS InvoiceCount,
        COUNT(*) AS PurchaseEventCount,
        CASE WHEN COUNT(*) > 0 THEN COUNT(*) - 1 ELSE 0 END AS CycleObservationCount,
        CASE
            WHEN COUNT(*) >= @MinimumPurchaseEventCount
            THEN CONVERT(INT, ROUND(
                     DATEDIFF(DAY, MIN(P.PurchaseDate), MAX(P.PurchaseDate)) * 1.0
                     / NULLIF(COUNT(*) - 1, 0), 0))
            ELSE CAST(NULL AS INT)
        END AS ChuKyTB
    INTO #ChuKy
    FROM #PurchaseEvent P
    GROUP BY P.ObjectID

    -- 7. TÍNH ĐIỂM ƯU TIÊN VÀ GỢI Ý (LEFT JOIN để hỗ trợ cả khách hàng mới chưa mua hàng)
    SELECT
        KH.ObjectID,
        LMC.LanMuaCuoi,
        COALESCE(LMC.SoNgayKhongMua, 999) AS SoNgayKhongMua,
        COALESCE(CK.InvoiceCount, 0) AS InvoiceCount,
        COALESCE(CK.PurchaseEventCount, 0) AS PurchaseEventCount,
        COALESCE(CK.CycleObservationCount, 0) AS CycleObservationCount,
        CycleRule.EffectiveCycleDays AS ChuKyMuaTB_Ngay,
        CycleRule.CycleComputationMode,
        CycleRule.HistoryStatus,
        Expected.NgayDuDoanHetHang,
        Expected.NgayConLaiHetHang,
        CASE
            WHEN Expected.NgayDuDoanHetHang IS NULL THEN N'UNKNOWN'
            WHEN Expected.NgayConLaiHetHang > 0 THEN N'UPCOMING'
            WHEN Expected.NgayConLaiHetHang = 0 THEN N'DUE'
            ELSE N'OVERDUE'
        END AS CycleStatus,
        CAST(
            (CASE
                -- Sắp hết hàng hoặc quá hạn hết hàng
                WHEN Expected.NgayConLaiHetHang <= 0 THEN @ScoreOverdue
                WHEN Expected.NgayConLaiHetHang <= @NgayBaoDong THEN @ScoreAlertWindow
                WHEN Expected.NgayConLaiHetHang <= @RouteMediumPriorityDays THEN @ScoreMediumWindow
                ELSE 0 END)
            -- Lâu chưa mua
            + (CASE WHEN COALESCE(LMC.SoNgayKhongMua, 999) >= @SoNgayVangMat THEN @ScoreInactive WHEN COALESCE(LMC.SoNgayKhongMua, 999) >= @RouteRecentInactiveDays THEN @ScoreRecentInactive ELSE 0 END)
            -- Đúng lịch ghé hôm nay (Cộng thêm điểm ưu tiên)
            + (CASE WHEN KH.ThuTrongTuan LIKE '%' + @TenThuHomNay + '%' THEN @ScoreScheduledRoute ELSE 0 END)
        AS INT) AS DiemUuTien
    INTO #Logic
    FROM CF_ObjectTbl KH
    LEFT JOIN #LanMuaCuoi LMC ON KH.ObjectID = LMC.ObjectID
    LEFT JOIN #ChuKy CK       ON KH.ObjectID = CK.ObjectID
    OUTER APPLY
    (
        SELECT
            CASE
                WHEN LMC.LanMuaCuoi IS NULL THEN NULL
                WHEN COALESCE(CK.PurchaseEventCount, 0) >= @MinimumPurchaseEventCount AND CK.ChuKyTB IS NOT NULL THEN CK.ChuKyTB
                ELSE @RoutePolicyDefaultCycleDays
            END AS EffectiveCycleDays,
            CASE
                WHEN LMC.LanMuaCuoi IS NULL THEN N'NO_HISTORY'
                WHEN COALESCE(CK.PurchaseEventCount, 0) >= @MinimumPurchaseEventCount AND CK.ChuKyTB IS NOT NULL THEN N'PERSONAL_HISTORY'
                ELSE N'POLICY_DEFAULT'
            END AS CycleComputationMode,
            CASE
                WHEN LMC.LanMuaCuoi IS NULL THEN N'NO_HISTORY'
                WHEN COALESCE(CK.PurchaseEventCount, 0) >= @MinimumPurchaseEventCount THEN N'SUFFICIENT_HISTORY'
                ELSE N'INSUFFICIENT_HISTORY'
            END AS HistoryStatus
    ) CycleRule
    OUTER APPLY
    (
        SELECT
            CASE WHEN CycleRule.EffectiveCycleDays IS NULL THEN NULL
                 ELSE CONVERT(DATE, DATEADD(DAY, CycleRule.EffectiveCycleDays, LMC.LanMuaCuoi)) END AS NgayDuDoanHetHang,
            CASE WHEN CycleRule.EffectiveCycleDays IS NULL THEN NULL
                 ELSE DATEDIFF(DAY, @WorkDate, DATEADD(DAY, CycleRule.EffectiveCycleDays, LMC.LanMuaCuoi)) END AS NgayConLaiHetHang
    ) Expected
    WHERE ISNULL(KH.isDisable, 0) = 0 
      AND ISNULL(KH.isCustomer, 0) = 1
      AND (
          UPPER(@SYSUserGroupID) = 'ADMIN'
          OR (
              (ISNULL(@SYSBranchID, '') = '' OR KH.BranchID = @SYSBranchID)
              AND EXISTS (SELECT 1 FROM #AllowedObjects AO WHERE AO.ObjectID = KH.ObjectID)
          )
      )

    -- 8. KẾT QUẢ CUỐI CÙNG: LỌC CỨNG THEO TUYẾN NGÀY HỎI (Hoặc xem chi tiết 1 khách cụ thể)
    SELECT TOP (@TopN)
        KH.ObjectID, 
        KH.ObjectName AS TenCuaHang,
        KH.Phone AS [Phone], 
        KH.Address AS [Address],
        KH.ZoneID AS [Tuyen], 
        KH.ThuTrongTuan AS [LichGhe], 
        CONVERT(DATE, L.LanMuaCuoi) AS [LanMuaCuoiDate],
        CASE WHEN L.LanMuaCuoi IS NULL THEN 'N/A' ELSE FORMAT(L.LanMuaCuoi, 'dd/MM/yyyy') END AS [LanMuaCuoi], 
        CASE WHEN L.SoNgayKhongMua = 999 THEN NULL ELSE L.SoNgayKhongMua END AS [SoNgayKhongMua],
        L.InvoiceCount AS [InvoiceCount],
        L.PurchaseEventCount AS [PurchaseEventCount],
        L.CycleObservationCount AS [CycleObservationCount],
        L.ChuKyMuaTB_Ngay AS [ChuKyTB], 
        L.CycleComputationMode AS [CycleComputationMode],
        L.HistoryStatus AS [HistoryStatus],
        L.CycleStatus AS [CycleStatus],
        CONVERT(DATE, L.NgayDuDoanHetHang) AS [NgayDuKien],
        CASE WHEN L.LanMuaCuoi IS NULL THEN 'N/A' ELSE FORMAT(L.NgayDuDoanHetHang, 'dd/MM/yyyy') END AS [NgayDuDoan],
        L.NgayConLaiHetHang AS [ConLaiNgay],
        CASE WHEN L.NgayConLaiHetHang < 0 THEN 0 ELSE L.NgayConLaiHetHang END AS [ConLai],
        L.DiemUuTien AS [DiemUuTien],
        CONCAT(
            CASE
                WHEN L.LanMuaCuoi IS NULL THEN N'Khách hàng mới chưa có đơn'
                WHEN L.NgayConLaiHetHang < 0 THEN N'Chưa phát sinh đơn hàng ' + CAST(ABS(L.NgayConLaiHetHang) AS VARCHAR) + N' ngày'
                WHEN L.NgayConLaiHetHang <= @NgayBaoDong THEN N'Sắp hết hàng (Còn ' + CAST(L.NgayConLaiHetHang AS VARCHAR) + N' ngày)'
                ELSE N'Theo lịch ghé'
            END,
            CASE WHEN KH.ZoneID IS NULL THEN N' | Ngoài tuyến' ELSE '' END
        ) AS [LyDoGhe],
        CONCAT(
            CASE
                WHEN L.LanMuaCuoi IS NULL THEN N'Khách chưa có hóa đơn hoàn tất; ưu tiên liên hệ theo lịch tuyến để xác nhận nhu cầu.'
                WHEN L.NgayConLaiHetHang < 0 THEN N'Khách đã quá ngày mua dự kiến ' + CAST(ABS(L.NgayConLaiHetHang) AS VARCHAR) + N' ngày.'
                WHEN L.NgayConLaiHetHang = 0 THEN N'Hôm nay là ngày dự kiến khách mua lại.'
                WHEN L.NgayConLaiHetHang <= @NgayBaoDong THEN N'Khách còn ' + CAST(L.NgayConLaiHetHang AS VARCHAR) + N' ngày đến ngày mua dự kiến.'
                ELSE N'Khách nằm trong lịch tuyến hôm nay.'
            END,
            CASE WHEN L.CycleComputationMode = N'POLICY_DEFAULT' THEN N' Chu kỳ đang dùng là mốc chính sách, không phải chu kỳ cá nhân.' ELSE N'' END,
            CASE WHEN KH.ZoneID IS NULL THEN N' Khách chưa được gán tuyến.' ELSE N'' END
        ) AS [ReasonText],
        CASE
            WHEN L.LanMuaCuoi IS NULL THEN N'NEW_CUSTOMER'
            WHEN L.NgayConLaiHetHang < 0 THEN N'REORDER_OVERDUE'
            WHEN L.NgayConLaiHetHang = 0 THEN N'REORDER_DUE'
            WHEN L.NgayConLaiHetHang <= @NgayBaoDong THEN N'REORDER_WINDOW'
            ELSE N'ROUTE_SCHEDULE'
        END AS [PrimaryReasonCode],
        CONCAT(
            CASE
                WHEN L.LanMuaCuoi IS NULL THEN N'NEW_CUSTOMER'
                WHEN L.NgayConLaiHetHang < 0 THEN N'REORDER_OVERDUE'
                WHEN L.NgayConLaiHetHang = 0 THEN N'REORDER_DUE'
                WHEN L.NgayConLaiHetHang <= @NgayBaoDong THEN N'REORDER_WINDOW'
                ELSE N'ROUTE_SCHEDULE'
            END,
            CASE WHEN L.NgayConLaiHetHang > @NgayBaoDong THEN N'' ELSE N'|ROUTE_SCHEDULE' END,
            CASE WHEN KH.ZoneID IS NULL THEN N'|OUTSIDE_ROUTE' ELSE N'' END
        ) AS [RecommendationReasonCodes],
        CONCAT(
            CASE
                WHEN L.LanMuaCuoi IS NULL THEN N'NEW_CUSTOMER'
                WHEN L.NgayConLaiHetHang < 0 THEN N'REORDER_OVERDUE'
                WHEN L.NgayConLaiHetHang = 0 THEN N'REORDER_DUE'
                WHEN L.NgayConLaiHetHang <= @NgayBaoDong THEN N'REORDER_WINDOW'
                ELSE N'ROUTE_SCHEDULE'
            END,
            CASE WHEN L.NgayConLaiHetHang > @NgayBaoDong THEN N'' ELSE N'|ROUTE_SCHEDULE' END,
            CASE WHEN KH.ZoneID IS NULL THEN N'|OUTSIDE_ROUTE' ELSE N'' END
        ) AS [RecommendationReason],
        CONCAT(
            CASE L.CycleComputationMode
                WHEN N'PERSONAL_HISTORY' THEN N'CUSTOMER_PURCHASE_HISTORY'
                WHEN N'POLICY_DEFAULT' THEN N'POLICY_DEFAULT_CYCLE'
                ELSE N'NO_PURCHASE_HISTORY'
            END,
            N'|ROUTE_SCHEDULE'
        ) AS [RuleSourceCodes],
        CONCAT(
            CASE L.CycleComputationMode
                WHEN N'PERSONAL_HISTORY' THEN N'Lịch sử mua của khách trong ' + CAST(@RouteHistoryMonths AS NVARCHAR(10)) + N' tháng gần nhất'
                WHEN N'POLICY_DEFAULT' THEN N'Mốc chăm sóc mặc định ' + CAST(@RoutePolicyDefaultCycleDays AS NVARCHAR(10)) + N' ngày theo chính sách'
                ELSE N'Lịch chăm sóc khách mới'
            END,
            N' · Lịch tuyến bán hàng'
        ) AS [RuleSourceLabel],
        @WorkDate AS [WorkDate],
        @TenThuHomNay AS [AppliedWeekday],
        @SYSBranchID AS [ScopeBranchID],
        N'AR_InvoiceTbl' AS [LastPurchaseSource],
        N'CHECKIN_SOURCE_UNAVAILABLE' AS [LastVisitStatus],
        CASE L.CycleComputationMode
            WHEN N'PERSONAL_HISTORY' THEN N'CUSTOMER_PURCHASE_HISTORY'
            WHEN N'POLICY_DEFAULT' THEN N'POLICY_DEFAULT_CYCLE'
            ELSE N'NO_PURCHASE_HISTORY'
        END AS [RuleSource],
        @RecommendationRuleCode AS [RuleCode],
        @RecommendationRuleVersion AS [RuleVersion],
        N'ROLLING_CONFIGURED_MONTHS_NO_FALLBACK' AS [DataWindow],
        @RouteDataFrom AS [DataFrom],
        @WorkDate AS [DataTo],
        @RuleAsOfUtc AS [CalculatedAt],
        @ReturnAdjustmentMode AS [ReturnAdjustmentMode],
        M.Latitude AS [Latitude],
        M.Longitude AS [Longitude]
    FROM CF_ObjectTbl KH
    JOIN #Logic L ON KH.ObjectID = L.ObjectID
    OUTER APPLY (
        SELECT TOP (1) Map.Latitude, Map.Longitude
        FROM dbo.CF_ObjectMapTbl Map
        WHERE Map.ObjectID = KH.ObjectID
        ORDER BY Map.MapDate DESC, Map.UserAutoID DESC
    ) M
    WHERE (@MaKhachHang = '' OR KH.ObjectID = @MaKhachHang)
      AND (
          -- Nếu tra cứu 1 khách hàng cụ thể thì trả về luôn không lọc Thứ
          @MaKhachHang <> '' 
          -- Hoặc lọc cứng đúng tuyến ngày cần đi
          OR KH.ThuTrongTuan LIKE '%' + @TenThuHomNay + '%'
      )
    ORDER BY DiemUuTien DESC, NgayConLaiHetHang ASC, KH.ObjectID ASC;

    DROP TABLE #PurchaseEvent; DROP TABLE #LanMuaCuoi; DROP TABLE #ChuKy; DROP TABLE #Logic; DROP TABLE #AllowedObjects;
END
GO


-- =========================================================================
-- 2. THÊM TỌA ĐỘ MOCK CHO 8 KHÁCH HÀNG TRÊN UAT (QUANH TRUNG TÂM HÀ NỘI):
-- Để Sales có thể thấy hiển thị marker và chạy thử tính năng vẽ đường.
-- =========================================================================
-- Dữ liệu mock bị vô hiệu hóa trong script triển khai chính để không ghi đè
-- tọa độ thật. Chỉ bật thủ công trong một script seed UAT riêng khi cần.
IF 1 = 0
BEGIN

-- QANB347 (Quầy Thuốc Tây Mỹ Liên 2)
IF NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectMapTbl WHERE ObjectID = 'QANB347')
    INSERT INTO dbo.CF_ObjectMapTbl (UserAutoID, ObjectID, Latitude, Longitude, MapDate)
    VALUES (CAST(NEWID() AS VARCHAR(50)), 'QANB347', 21.0305, 105.8522, GETDATE());
ELSE
    UPDATE dbo.CF_ObjectMapTbl SET Latitude = 21.0305, Longitude = 105.8522 WHERE ObjectID = 'QANB347';

-- DONA0733 (Nhà thuốc tiện lợi Medophar)
IF NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectMapTbl WHERE ObjectID = 'DONA0733')
    INSERT INTO dbo.CF_ObjectMapTbl (UserAutoID, ObjectID, Latitude, Longitude, MapDate)
    VALUES (CAST(NEWID() AS VARCHAR(50)), 'DONA0733', 21.0265, 105.8562, GETDATE());
ELSE
    UPDATE dbo.CF_ObjectMapTbl SET Latitude = 21.0265, Longitude = 105.8562 WHERE ObjectID = 'DONA0733';

-- NAA123 (Shop Mẹ và Bé Changs House)
IF NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectMapTbl WHERE ObjectID = 'NAA123')
    INSERT INTO dbo.CF_ObjectMapTbl (UserAutoID, ObjectID, Latitude, Longitude, MapDate)
    VALUES (CAST(NEWID() AS VARCHAR(50)), 'NAA123', 21.0295, 105.8502, GETDATE());
ELSE
    UPDATE dbo.CF_ObjectMapTbl SET Latitude = 21.0295, Longitude = 105.8502 WHERE ObjectID = 'NAA123';

-- NAC158 (Quầy Thuốc Thành Mùi)
IF NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectMapTbl WHERE ObjectID = 'NAC158')
    INSERT INTO dbo.CF_ObjectMapTbl (UserAutoID, ObjectID, Latitude, Longitude, MapDate)
    VALUES (CAST(NEWID() AS VARCHAR(50)), 'NAC158', 21.0315, 105.8552, GETDATE());
ELSE
    UPDATE dbo.CF_ObjectMapTbl SET Latitude = 21.0315, Longitude = 105.8552 WHERE ObjectID = 'NAC158';

-- HPA191 (Hiệu thuốc Thuỷ Nguyên)
IF NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectMapTbl WHERE ObjectID = 'HPA191')
    INSERT INTO dbo.CF_ObjectMapTbl (UserAutoID, ObjectID, Latitude, Longitude, MapDate)
    VALUES (CAST(NEWID() AS VARCHAR(50)), 'HPA191', 21.0255, 105.8522, GETDATE());
ELSE
    UPDATE dbo.CF_ObjectMapTbl SET Latitude = 21.0255, Longitude = 105.8522 WHERE ObjectID = 'HPA191';

-- SGGV0211 (Nhà Thuốc Hương Nhi)
IF NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectMapTbl WHERE ObjectID = 'SGGV0211')
    INSERT INTO dbo.CF_ObjectMapTbl (UserAutoID, ObjectID, Latitude, Longitude, MapDate)
    VALUES (CAST(NEWID() AS VARCHAR(50)), 'SGGV0211', 21.0275, 105.8582, GETDATE());
ELSE
    UPDATE dbo.CF_ObjectMapTbl SET Latitude = 21.0275, Longitude = 105.8582 WHERE ObjectID = 'SGGV0211';

-- DOTA0029 (Quầy thuốc Thanh Tuấn)
IF NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectMapTbl WHERE ObjectID = 'DOTA0029')
    INSERT INTO dbo.CF_ObjectMapTbl (UserAutoID, ObjectID, Latitude, Longitude, MapDate)
    VALUES (CAST(NEWID() AS VARCHAR(50)), 'DOTA0029', 21.0325, 105.8512, GETDATE());
ELSE
    UPDATE dbo.CF_ObjectMapTbl SET Latitude = 21.0325, Longitude = 105.8512 WHERE ObjectID = 'DOTA0029';

-- YBA063 (Nhà Thuốc Huyền Yến)
IF NOT EXISTS (SELECT 1 FROM dbo.CF_ObjectMapTbl WHERE ObjectID = 'YBA063')
    INSERT INTO dbo.CF_ObjectMapTbl (UserAutoID, ObjectID, Latitude, Longitude, MapDate)
    VALUES (CAST(NEWID() AS VARCHAR(50)), 'YBA063', 21.0245, 105.8532, GETDATE());
ELSE
    UPDATE dbo.CF_ObjectMapTbl SET Latitude = 21.0245, Longitude = 105.8532 WHERE ObjectID = 'YBA063';
END
