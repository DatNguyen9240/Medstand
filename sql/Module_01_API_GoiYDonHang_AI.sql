USE medtest;
GO

/*
 ═══════════════════════════════════════════════════════════════
  API_GoiYDonHang_AI — Gợi ý đơn hàng thông minh
  ─────────────────────────────────────────────────────────────
  [2026-05-20] FIX: Sau khi chạy script này, cần chạy thêm:

    UPDATE dbo.API_Field
    SET IsSystemParam = 1
    WHERE ApiID = (SELECT ApiID FROM dbo.API_Definition WHERE StoredProcedure = 'API_GoiYDonHang_AI')
      AND FieldCode IN ('@SYSBranchID', '@SYSCeoID', '@SYSManagerID', '@SYSEmployeeID', '@User');

    UPDATE af
    SET af.IsVisible = 0, af.IsEditable = 0
    FROM dbo.API_Action_Field af
    JOIN dbo.API_Field f ON f.FieldID = af.FieldID
    WHERE f.ApiID = (SELECT ApiID FROM dbo.API_Definition WHERE StoredProcedure = 'API_GoiYDonHang_AI')
      AND f.FieldCode IN ('@SYSBranchID', '@SYSCeoID', '@SYSManagerID', '@SYSEmployeeID', '@User');

  Hoặc đơn giản chạy lại AutoBootstrap:
    EXEC dbo.API_Metadata_AutoBootstrap_AI @Apply = 1, @UpdateExisting = 1;
 ═══════════════════════════════════════════════════════════════
*/
CREATE OR ALTER PROCEDURE API_GoiYDonHang_AI
    @Username     VARCHAR(50)   = '',
    @User         VARCHAR(50)   = '',         -- Dashboard/Chatbot alias
    @MaKhachHang  NVARCHAR(100) = '',         -- Original parameter name
    @ObjectID     NVARCHAR(100) = '',         -- AI Scenarios Guide / Frontend alias
    @TopN         INT           = 10,
    -- Context parameters injected automatically by .NET server from claims
    @SYSBranchID  VARCHAR(50)   = '',
    @SYSCeoID     VARCHAR(50)   = '',
    @SYSManagerID VARCHAR(50)   = '',
    @SYSEmployeeID VARCHAR(50)  = ''
AS
BEGIN
    SET NOCOUNT ON

    -- ═══ GUARD: dọn temp table còn sót lại từ request lỗi trước trên cùng connection ═══
    IF OBJECT_ID('tempdb..#AllowedObjects') IS NOT NULL DROP TABLE #AllowedObjects;
    IF OBJECT_ID('tempdb..#AllowedStores') IS NOT NULL DROP TABLE #AllowedStores;
    IF OBJECT_ID('tempdb..#StockByItem') IS NOT NULL DROP TABLE #StockByItem;
    IF OBJECT_ID('tempdb..#TopChiNhanh') IS NOT NULL DROP TABLE #TopChiNhanh;
    IF OBJECT_ID('tempdb..#PurchaseEvent') IS NOT NULL DROP TABLE #PurchaseEvent;
    IF OBJECT_ID('tempdb..#LichSu') IS NOT NULL DROP TABLE #LichSu;
    IF OBJECT_ID('tempdb..#ChuKy') IS NOT NULL DROP TABLE #ChuKy;
    IF OBJECT_ID('tempdb..#MuaVu') IS NOT NULL DROP TABLE #MuaVu;
    IF OBJECT_ID('tempdb..#KhuyenMai') IS NOT NULL DROP TABLE #KhuyenMai;
    IF OBJECT_ID('tempdb..#TrongTam') IS NOT NULL DROP TABLE #TrongTam;
    IF OBJECT_ID('tempdb..#DaMuaHomNay') IS NOT NULL DROP TABLE #DaMuaHomNay;

    -- ═══ 0. Mapping Dashboard/Frontend Alias ═══
    IF NULLIF(@User, '') IS NOT NULL AND EXISTS (SELECT 1 FROM SY_User WITH (NOLOCK) WHERE UserName = @User AND COALESCE(Disable, 0) = 0)
    BEGIN
        SET @Username = @User;
    END
    
    -- Allow @ObjectID mapping to MaKhachHang even if it is a name, to ensure name-to-ID resolution runs
    IF NULLIF(@ObjectID, '') IS NOT NULL AND (NULLIF(@MaKhachHang, '') IS NULL OR @MaKhachHang = '')
    BEGIN
        SET @MaKhachHang = @ObjectID;
    END
    
    IF @TopN IS NULL OR @TopN <= 0 SET @TopN = 10;

    -- Danh tính là bắt buộc. Không cho phép Username rỗng trở thành truy vấn
    -- toàn hệ thống khi gateway/token không truyền được người dùng.
    IF NULLIF(@Username, '') IS NULL
       OR NOT EXISTS (SELECT 1 FROM SY_User WITH (NOLOCK)
                      WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'Không xác định được tài khoản hoặc tài khoản đã bị khóa.' AS Msg,
               1 AS MsgType;
        RETURN;
    END

    -- CORE-008: chỉ dùng đúng một phiên bản rule APPROVED đang có hiệu lực.
    DECLARE @RecommendationRuleCode VARCHAR(80) = 'BR-RECOMMENDATION-008';
    DECLARE @RecommendationRuleVersion VARCHAR(30) = NULL;
    DECLARE @RuleAsOfUtc DATETIME2(0) = SYSUTCDATETIME();
    DECLARE @ProductHistoryMonths INT = NULL;
    DECLARE @MinimumPurchaseEventCount INT = NULL;
    DECLARE @ReorderWarningDays INT = NULL;
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
        @ProductHistoryMonths = MAX(CASE WHEN ConfigKey = 'ProductHistoryMonths' THEN TRY_CONVERT(INT, ConfigValue) END),
        @MinimumPurchaseEventCount = MAX(CASE WHEN ConfigKey = 'MinimumPurchaseEventCount' THEN TRY_CONVERT(INT, ConfigValue) END),
        @ReorderWarningDays = MAX(CASE WHEN ConfigKey = 'ReorderWarningDays' THEN TRY_CONVERT(INT, ConfigValue) END),
        @SalesStatusIDs = MAX(CASE WHEN ConfigKey = 'SalesStatusIDs' THEN ConfigValue END),
        @ReturnAdjustmentMode = MAX(CASE WHEN ConfigKey = 'ReturnAdjustmentMode' THEN ConfigValue END)
    FROM dbo.AI_BusinessRuleConfigTbl WITH (NOLOCK)
    WHERE RuleCode = @RecommendationRuleCode
      AND RuleVersion = @RecommendationRuleVersion
      AND Status = 'APPROVED'
      AND EffectiveFrom <= @RuleAsOfUtc
      AND (EffectiveTo IS NULL OR EffectiveTo > @RuleAsOfUtc);

    IF COALESCE(@ProductHistoryMonths, 0) <= 0
       OR COALESCE(@MinimumPurchaseEventCount, 0) < 2
       OR COALESCE(@ReorderWarningDays, -1) < 0
       OR NULLIF(@SalesStatusIDs, '') IS NULL
       OR NULLIF(@ReturnAdjustmentMode, '') IS NULL
    BEGIN
        SELECT N'Cấu hình gợi ý bán hàng không đầy đủ hoặc không hợp lệ.' AS Msg,
               1 AS MsgType,
               N'SYSTEM_ERROR' AS Severity,
               N'RULE_CONFIGURATION_INVALID' AS Code;
        RETURN;
    END

    DECLARE @RecommendationAsOfDate DATE = CAST(GETDATE() AS DATE);
    DECLARE @RecommendationDataFrom DATE = DATEADD(MONTH, -@ProductHistoryMonths, @RecommendationAsOfDate);

    -- ═══ 1. Lấy quyền user thực tế & Fallback ═══
    DECLARE @SYS_BranchID    VARCHAR(50) = ISNULL(@SYSBranchID, '')
    DECLARE @SYS_CeoID       VARCHAR(50) = ISNULL(@SYSCeoID, '')
    DECLARE @SYS_ManagerID   VARCHAR(50) = ISNULL(@SYSManagerID, '')
    DECLARE @SYS_EmployeeID  VARCHAR(50) = ISNULL(@SYSEmployeeID, '')

    IF NULLIF(@Username, '') IS NOT NULL
    BEGIN
        SELECT
            @SYS_BranchID    = ISNULL(BranchID, ''),
            @SYS_CeoID       = ISNULL(CeoID, ''),
            @SYS_ManagerID   = ISNULL(ManagerID, ''),
            @SYS_EmployeeID  = ISNULL(EmployeeID, '')
        FROM SY_User WITH (NOLOCK)
        WHERE UserName = @Username AND COALESCE(Disable, 0) = 0
    END
    ELSE IF NULLIF(@SYS_EmployeeID, '') IS NOT NULL
    BEGIN
        SELECT TOP 1
            @Username        = UserName,
            @SYS_BranchID    = ISNULL(BranchID, ''),
            @SYS_CeoID       = ISNULL(CeoID, ''),
            @SYS_ManagerID   = ISNULL(ManagerID, '')
        FROM SY_User WITH (NOLOCK)
        WHERE EmployeeID = @SYS_EmployeeID AND COALESCE(Disable, 0) = 0
    END

    -- TỰ ĐỘNG KHẮC PHỤC ẢO GIÁC/TÊN KHÁCH HÀNG:
    IF @MaKhachHang <> '' AND NOT EXISTS (SELECT 1 FROM CF_ObjectTbl WITH (NOLOCK) WHERE ObjectID = @MaKhachHang)
    BEGIN
        DECLARE @ResolvedID VARCHAR(50) = '';
        DECLARE @OriginalInput NVARCHAR(100) = @MaKhachHang;
        
        -- Lấy ']' đầu tiên NẰM SAU '[' để không sinh độ dài âm cho SUBSTRING (Msg 536)
        DECLARE @BracketOpen  INT = CHARINDEX('[', @MaKhachHang);
        DECLARE @BracketClose INT = CHARINDEX(']', @MaKhachHang, @BracketOpen + 1);
        IF @BracketOpen > 0 AND @BracketClose > @BracketOpen
        BEGIN
            SET @MaKhachHang = SUBSTRING(@MaKhachHang, @BracketOpen + 1, @BracketClose - @BracketOpen - 1);
        END

        IF EXISTS (SELECT 1 FROM CF_ObjectTbl WITH (NOLOCK) WHERE ObjectID = @MaKhachHang)
        BEGIN
            SET @ResolvedID = @MaKhachHang;
        END
        ELSE
        BEGIN
            DECLARE @CleanSearch NVARCHAR(100) = dbo.ufn_clean_customer_name(@MaKhachHang)

            -- 1. Fast Path (Branch-filtered)
            SELECT TOP 1 @ResolvedID = ObjectID 
            FROM CF_ObjectTbl WITH (NOLOCK)
            WHERE (ObjectID LIKE '%' + @CleanSearch + '%' OR ObjectName LIKE '%' + @CleanSearch + '%')
              AND (ISNULL(@SYS_BranchID, '') = '' OR BranchID = @SYS_BranchID)
            ORDER BY 
                CASE WHEN ObjectID = @CleanSearch THEN 1
                     WHEN ObjectName = @CleanSearch THEN 2
                     WHEN ObjectName LIKE @CleanSearch + '%' THEN 3
                     ELSE 4
                END,
                COALESCE((SELECT MAX(DocumentDate) FROM AR_InvoiceTbl WITH (NOLOCK) WHERE ObjectID = CF_ObjectTbl.ObjectID), '1900-01-01') DESC,
                LEN(ObjectName) ASC;
                
            -- 2. Slow Path (Branch-filtered, fallback)
            IF @ResolvedID = ''
            BEGIN
                SELECT TOP 1 @ResolvedID = ObjectID 
                FROM CF_ObjectTbl WITH (NOLOCK)
                WHERE (dbo.ufn_clean_customer_name(ObjectName) LIKE '%' + @CleanSearch + '%' OR ObjectID LIKE '%' + @CleanSearch + '%')
                  AND (ISNULL(@SYS_BranchID, '') = '' OR BranchID = @SYS_BranchID)
                ORDER BY 
                    CASE WHEN ObjectID = @CleanSearch THEN 1
                         WHEN dbo.ufn_clean_customer_name(ObjectName) = @CleanSearch THEN 2
                         WHEN dbo.ufn_clean_customer_name(ObjectName) LIKE @CleanSearch + '%' THEN 3
                         ELSE 4
                    END,
                    COALESCE((SELECT MAX(DocumentDate) FROM AR_InvoiceTbl WITH (NOLOCK) WHERE ObjectID = CF_ObjectTbl.ObjectID), '1900-01-01') DESC,
                    LEN(ObjectName) ASC;
            END

            -- 3. Fast Path (Nationwide fallback - Only for admin/cross-branch user)
            IF @ResolvedID = '' AND @SYS_BranchID = ''
            BEGIN
                SELECT TOP 1 @ResolvedID = ObjectID 
                FROM CF_ObjectTbl WITH (NOLOCK)
                WHERE (ObjectID LIKE '%' + @CleanSearch + '%' OR ObjectName LIKE '%' + @CleanSearch + '%')
                ORDER BY 
                    CASE WHEN ObjectID = @CleanSearch THEN 1
                         WHEN ObjectName = @CleanSearch THEN 2
                         WHEN ObjectName LIKE @CleanSearch + '%' THEN 3
                         ELSE 4
                    END,
                    COALESCE((SELECT MAX(DocumentDate) FROM AR_InvoiceTbl WITH (NOLOCK) WHERE ObjectID = CF_ObjectTbl.ObjectID), '1900-01-01') DESC,
                    LEN(ObjectName) ASC;
            END

            -- 4. Slow Path (Nationwide fallback, final - Only for admin/cross-branch user)
            IF @ResolvedID = '' AND @SYS_BranchID = ''
            BEGIN
                SELECT TOP 1 @ResolvedID = ObjectID 
                FROM CF_ObjectTbl WITH (NOLOCK)
                WHERE (dbo.ufn_clean_customer_name(ObjectName) LIKE '%' + @CleanSearch + '%' OR ObjectID LIKE '%' + @CleanSearch + '%')
                ORDER BY 
                    CASE WHEN ObjectID = @CleanSearch THEN 1
                         WHEN dbo.ufn_clean_customer_name(ObjectName) = @CleanSearch THEN 2
                         WHEN dbo.ufn_clean_customer_name(ObjectName) LIKE @CleanSearch + '%' THEN 3
                         ELSE 4
                    END,
                    COALESCE((SELECT MAX(DocumentDate) FROM AR_InvoiceTbl WITH (NOLOCK) WHERE ObjectID = CF_ObjectTbl.ObjectID), '1900-01-01') DESC,
                    LEN(ObjectName) ASC;
            END
        END

        IF NULLIF(@ResolvedID, '') IS NOT NULL
        BEGIN
            SET @MaKhachHang = @ResolvedID;
        END

        -- LOG FOR DEBUGGING
        EXEC AI_WriteAuditLog
            @Username     = @Username,
            @ActionType   = 'DEBUG_RESOLUTION',
            @TargetEntity = 'API_GoiYDonHang_AI',
            @TargetID     = @MaKhachHang,
            @TargetName   = @ResolvedID,
            @ExtraInfo    = @OriginalInput;
    END

    -- Cache đúng phạm vi khách hàng do ERP cấp cho user/manager hiện tại.
    -- Nếu mapping rỗng thì kết quả cũng rỗng (fail-closed).
    CREATE TABLE #AllowedObjects (ObjectID VARCHAR(50) PRIMARY KEY);
    INSERT INTO #AllowedObjects (ObjectID)
    SELECT DISTINCT ObjectID FROM dbo.AR_GetObjectByUserFnc(@Username);

    -- BR-CONTRACT-V1: gợi ý cá nhân bắt buộc có khách hàng; không trả bảng bán chạy
    -- như một kết quả thay thế vì sẽ làm client hiểu sai ý định người dùng.
    IF ISNULL(@MaKhachHang, '') = ''
    BEGIN
        SELECT N'Vui lòng cung cấp mã khách hàng để tạo gợi ý đơn hàng.' AS Msg,
               1 AS MsgType,
               N'VALIDATION_ERROR' AS Severity;
        RETURN;
    END

    IF @MaKhachHang <> '' AND NOT EXISTS (SELECT 1 FROM CF_ObjectTbl WITH (NOLOCK) WHERE ObjectID = @MaKhachHang)
    BEGIN
        SELECT N'Không tìm thấy mã khách hàng này.' AS Msg,
               1 AS MsgType,
               N'VALIDATION_ERROR' AS Severity;
        RETURN;
    END

    -- RLS GUARD: Reuse ERP permission system (AR_GetObjectByUserFnc) to handle branch/manager hierarchy securely
    IF @MaKhachHang <> '' AND @Username <> '' AND NOT EXISTS (
        SELECT 1 FROM dbo.AR_GetObjectByUserFnc(@Username) WHERE ObjectID = @MaKhachHang
    )
    BEGIN
        SELECT N'Bạn không có quyền xem thông tin của khách hàng này.' AS Msg,
               1 AS MsgType,
               N'OUT_OF_SCOPE' AS Severity;
        RETURN;
    END

    -- STOCK-001: cùng một nguồn tồn cho tra cứu, tư vấn và bước tạo đơn.
    -- Hàm trừ lượng đã giữ trong đơn mở và chỉ trả các kho người dùng được phép xem.
    DECLARE @StockAsOfUtc DATETIME2(0) = SYSUTCDATETIME();

    CREATE TABLE #AllowedStores (StoreHouseID VARCHAR(50) PRIMARY KEY);
    INSERT INTO #AllowedStores (StoreHouseID)
    SELECT StoreHouseID
    FROM dbo.AI_WarehouseByUserFnc(@Username, @StockAsOfUtc);

    IF NOT EXISTS (SELECT 1 FROM #AllowedStores)
    BEGIN
        SELECT N'Tài khoản chưa được phân quyền kho hoặc cấu hình tồn kho chưa hợp lệ.' AS Msg,
               1 AS MsgType,
               N'OUT_OF_SCOPE' AS Severity,
               N'WAREHOUSE_SCOPE_UNAVAILABLE' AS Code;
        RETURN;
    END

    SELECT ItemID, StoreHouseID, StoreHouseName,
           PhysicalStock, ReservedStock, AvailableStock,
           WarehouseScope, StockDataStatus,
           StockUpdatedAt, StockAsOfAt, LatestStockMovementDate,
           StockDataSource, RuleVersion
    INTO #StockByItem
    FROM
    (
        SELECT S.*,
               ROW_NUMBER() OVER
               (
                   PARTITION BY S.ItemID
                   ORDER BY S.AvailableStock DESC, S.StoreHouseID
               ) AS StockRank
        FROM dbo.AI_StockAvailableByUserFnc(@Username, '', @StockAsOfUtc) S
        WHERE S.AvailableStock > 0
    ) RankedStock
    WHERE StockRank = 1;

    -- CORE-008: một purchase event sản phẩm = khách + sản phẩm + ngày mua.
    -- Nhiều hóa đơn/dòng cùng ngày chỉ là một event; phiếu trả không tạo event mới.
    SELECT
        D.ItemID,
        CAST(I.DocumentDate AS DATE) AS PurchaseDate,
        COUNT(DISTINCT I.DocumentID) AS InvoiceCount,
        SUM(COALESCE(D.Quantity, 0)) AS PurchasedQuantity,
        SUM(COALESCE(D.TotalAmount, 0)) AS TotalAmount
    INTO #PurchaseEvent
    FROM dbo.AR_InvoiceTbl I WITH (NOLOCK)
    JOIN dbo.AR_InvoiceDetailTbl D WITH (NOLOCK) ON D.DocumentID = I.DocumentID
    WHERE I.ObjectID = @MaKhachHang
      AND I.DocumentDate >= @RecommendationDataFrom
      AND I.DocumentDate < DATEADD(DAY, 1, @RecommendationAsOfDate)
      AND EXISTS
      (
          SELECT 1
          FROM STRING_SPLIT(@SalesStatusIDs, ',') S
          WHERE TRY_CONVERT(INT, LTRIM(RTRIM(S.value))) = I.StatusID
      )
    GROUP BY D.ItemID, CAST(I.DocumentDate AS DATE)
    HAVING SUM(COALESCE(D.Quantity, 0)) > 0;

    SELECT
        P.ItemID,
        SUM(P.InvoiceCount) AS InvoiceCount,
        COUNT(*) AS PurchaseEventCount,
        SUM(P.TotalAmount) AS TongTien,
        MAX(P.PurchaseDate) AS LanMuaCuoi,
        MIN(P.PurchaseDate) AS LanMuaDau,
        DATEDIFF(DAY, MAX(P.PurchaseDate), @RecommendationAsOfDate) AS SoNgayTuLanCuoi
    INTO #LichSu
    FROM #PurchaseEvent P
    GROUP BY P.ItemID;

    -- TIÊU CHÍ 2: Chu kỳ mua hàng trung bình (Average Purchase Cycle)
    IF NOT EXISTS (SELECT 1 FROM #LichSu)
    BEGIN
        DECLARE @CustomerName NVARCHAR(500) = NULL;
        SELECT @CustomerName = ObjectName
        FROM dbo.CF_ObjectTbl WITH (NOLOCK)
        WHERE ObjectID = @MaKhachHang;

        SELECT CONCAT(
                   N'Khách ', COALESCE(NULLIF(@CustomerName, ''), @MaKhachHang),
                   N' là khách mới hoặc chưa đủ lịch sử mua hàng. Hệ thống chưa dự đoán đơn hàng để tránh gợi ý sai. Sale nên tìm hiểu nhu cầu thực tế của khách trước khi chọn sản phẩm.'
               ) AS Msg,
               0 AS MsgType,
               N'NO_DATA' AS Severity,
               N'NEW_CUSTOMER_NO_FULFILLED_HISTORY' AS Code;

        DROP TABLE #AllowedObjects;
        DROP TABLE #AllowedStores;
        DROP TABLE #StockByItem;
        DROP TABLE #PurchaseEvent;
        DROP TABLE #LichSu;
        RETURN;
    END

    SELECT
        L.ItemID,
        CASE
            WHEN L.PurchaseEventCount >= @MinimumPurchaseEventCount
            THEN CONVERT(INT, ROUND(
                     DATEDIFF(DAY, L.LanMuaDau, L.LanMuaCuoi) * 1.0
                     / NULLIF(L.PurchaseEventCount - 1, 0), 0))
            ELSE CAST(NULL AS INT)
        END AS ChuKyTrungBinh,
        CASE WHEN L.PurchaseEventCount > 0 THEN L.PurchaseEventCount - 1 ELSE 0 END AS CycleObservationCount
    INTO #ChuKy
    FROM #LichSu L;

    -- TIÊU CHÍ 3: Mùa vụ (Cùng tháng này năm trước)
    SELECT D.ItemID INTO #MuaVu
    FROM AR_InvoiceTbl I WITH (NOLOCK)
    JOIN AR_InvoiceDetailTbl D WITH (NOLOCK) ON I.DocumentID = D.DocumentID
    WHERE I.ObjectID = @MaKhachHang
      AND MONTH(I.DocumentDate) = MONTH(@RecommendationAsOfDate)
      AND YEAR(I.DocumentDate) = YEAR(@RecommendationAsOfDate) - 1
      AND EXISTS (SELECT 1 FROM STRING_SPLIT(@SalesStatusIDs, ',') S WHERE TRY_CONVERT(INT, LTRIM(RTRIM(S.value))) = I.StatusID)
    GROUP BY D.ItemID;

    -- TIÊU CHÍ 4: Khuyến mãi đang chạy
    SELECT DISTINCT PD.ItemID INTO #KhuyenMai
    FROM AR_PromotionTbl P WITH (NOLOCK)
    JOIN AR_PromotionDetailTbl PD WITH (NOLOCK) ON P.DocumentID = PD.DocumentID
    WHERE GETDATE() BETWEEN P.FromDate AND P.ToDate AND ISNULL(P.isDisable, 0) = 0;

    -- TIÊU CHÍ 5: Sản phẩm trọng tâm (Focus Items)
    DECLARE @CurProgramID VARCHAR(50) = ''
    SELECT TOP 1 @CurProgramID = DocumentID FROM AR_SanPhamTrongTamTbl WITH (NOLOCK)
    WHERE GETDATE() BETWEEN FromDate AND ToDate ORDER BY ToDate DESC;

    SELECT DISTINCT ItemID INTO #TrongTam 
    FROM AR_SanPhamTrongTamDetailTbl WITH (NOLOCK) WHERE DocumentID = @CurProgramID;

    -- TIÊU CHÍ 6: Đã mua hôm nay. Chỉ dùng hóa đơn hợp lệ; đơn nháp chưa giao
    -- không được loại sản phẩm khỏi gợi ý (BR-SALES-001).
    SELECT DISTINCT ItemID INTO #DaMuaHomNay FROM (
        SELECT D.ItemID
        FROM AR_InvoiceTbl I WITH (NOLOCK) JOIN AR_InvoiceDetailTbl D WITH (NOLOCK) ON I.DocumentID = D.DocumentID
        WHERE I.ObjectID = @MaKhachHang
          AND CAST(I.DocumentDate AS DATE) = @RecommendationAsOfDate
          AND EXISTS (SELECT 1 FROM STRING_SPLIT(@SalesStatusIDs, ',') S WHERE TRY_CONVERT(INT, LTRIM(RTRIM(S.value))) = I.StatusID)
    ) T;

    -- KẾT QUẢ CUỐI CÙNG: Tập trung vào "Thời điểm vàng"
    SELECT TOP (@TopN)
        @MaKhachHang                                   AS [MaKhachHang],
        KH.ObjectName                                  AS [TenKhachHang],
        L.ItemID                                        AS [MaSanPham],
        CF.ItemName                                     AS [TenSanPham],
        L.PurchaseEventCount                            AS [SoLanMua],
        L.InvoiceCount                                  AS [InvoiceCount],
        L.PurchaseEventCount                            AS [PurchaseEventCount],
        CK.CycleObservationCount                        AS [CycleObservationCount],
        CAST(L.TongTien AS BIGINT)                      AS [TongDaMua],
        CONVERT(DATE, L.LanMuaCuoi)                     AS [LanMuaCuoiDate],
        CONVERT(VARCHAR(10), L.LanMuaCuoi, 103)         AS [LanMuaCuoi],
        CK.ChuKyTrungBinh                               AS [ChuKyNgay],
        Predicted.NgayDuKien                            AS [NgayDuKien],
        Timing.ConLaiNgay                               AS [ConLaiNgay],
        CASE
            WHEN Predicted.NgayDuKien IS NULL THEN N'UNKNOWN'
            WHEN Timing.ConLaiNgay > 0 THEN N'UPCOMING'
            WHEN Timing.ConLaiNgay = 0 THEN N'DUE'
            ELSE N'OVERDUE'
        END                                             AS [CycleStatus],
        CASE WHEN L.PurchaseEventCount >= @MinimumPurchaseEventCount
             THEN N'SUFFICIENT_HISTORY' ELSE N'INSUFFICIENT_HISTORY' END AS [HistoryStatus],
        CASE WHEN L.PurchaseEventCount >= @MinimumPurchaseEventCount
             THEN N'PERSONAL_HISTORY' ELSE N'INSUFFICIENT_HISTORY' END AS [CycleComputationMode],
        ST.PhysicalStock                                AS [PhysicalStock],
        ST.ReservedStock                                AS [ReservedStock],
        ST.AvailableStock                               AS [AvailableStock],
        ST.StoreHouseID                                 AS [StoreHouseID],
        ST.StoreHouseName                               AS [StoreHouseName],
        ST.WarehouseScope                               AS [WarehouseScope],
        ST.StockDataStatus                              AS [StockDataStatus],
        ST.StockUpdatedAt                               AS [StockUpdatedAt],
        ST.StockAsOfAt                                  AS [StockAsOfAt],
        ST.LatestStockMovementDate                      AS [LatestStockMovementDate],
        ST.StockDataSource                              AS [StockDataSource],
        ST.RuleVersion                                  AS [StockRuleVersion],
        CASE 
            WHEN Predicted.NgayDuKien IS NULL THEN N'Chưa đủ lịch sử'
            WHEN Timing.ConLaiNgay < 0 THEN N'Đã quá ngày dự kiến'
            WHEN Timing.ConLaiNgay = 0 THEN N'Đến ngày dự kiến'
            WHEN Timing.ConLaiNgay <= @ReorderWarningDays THEN N'Sắp đến ngày mua lại'
            ELSE N'Chưa đến chu kỳ'
        END                                             AS [TrangThai],
        CASE WHEN L.PurchaseEventCount >= @MinimumPurchaseEventCount THEN N'PERSONAL_CYCLE_ELIGIBLE' ELSE N'INSUFFICIENT_HISTORY' END AS [DoTinCay],
        CASE WHEN L.PurchaseEventCount >= @MinimumPurchaseEventCount THEN N'CUSTOMER_PRODUCT_PURCHASE_HISTORY' ELSE N'INSUFFICIENT_HISTORY' END AS [RuleSource],
        @RecommendationRuleCode                         AS [RuleCode],
        @RecommendationRuleVersion                      AS [RuleVersion],
        CONCAT(
            CASE
                WHEN Predicted.NgayDuKien IS NULL THEN N'Mới có ' + CAST(L.PurchaseEventCount AS VARCHAR) + N' ngày mua; cần tối thiểu ' + CAST(@MinimumPurchaseEventCount AS VARCHAR) + N' ngày mua để ước tính chu kỳ'
                WHEN Timing.ConLaiNgay < 0 THEN N'Đã quá ngày mua dự kiến ' + CAST(ABS(Timing.ConLaiNgay) AS VARCHAR) + N' ngày'
                WHEN Timing.ConLaiNgay = 0 THEN N'Hôm nay là ngày dự kiến mua lại'
                WHEN Timing.ConLaiNgay <= @ReorderWarningDays THEN N'Còn ' + CAST(Timing.ConLaiNgay AS VARCHAR) + N' ngày đến ngày dự kiến mua lại'
                ELSE N'Chưa đến chu kỳ mua lại dự kiến'
            END,
            CASE WHEN TT.ItemID IS NOT NULL THEN N' | Trọng tâm' ELSE '' END,
            CASE WHEN MV.ItemID IS NOT NULL THEN N' | Mùa vụ' ELSE '' END,
            CASE WHEN KM.ItemID IS NOT NULL THEN N' | Khuyến mãi' ELSE '' END
        )                                               AS [ChiTiet],
        CONCAT(
            CASE
                WHEN Predicted.NgayDuKien IS NULL THEN N'Mới có ' + CAST(L.PurchaseEventCount AS VARCHAR) + N' ngày mua; chưa đủ dữ liệu tính chu kỳ cá nhân.'
                WHEN Timing.ConLaiNgay < 0 THEN N'Khách đã quá ngày mua dự kiến ' + CAST(ABS(Timing.ConLaiNgay) AS VARCHAR) + N' ngày.'
                WHEN Timing.ConLaiNgay = 0 THEN N'Hôm nay là ngày khách thường mua lại sản phẩm này.'
                WHEN Timing.ConLaiNgay <= @ReorderWarningDays THEN N'Khách còn ' + CAST(Timing.ConLaiNgay AS VARCHAR) + N' ngày đến ngày thường mua lại.'
                ELSE N'Sản phẩm chưa đến chu kỳ mua lại dự kiến.'
            END,
            CASE WHEN TT.ItemID IS NOT NULL THEN N' Sản phẩm thuộc chương trình trọng tâm.' ELSE N'' END,
            CASE WHEN MV.ItemID IS NOT NULL THEN N' Khách từng mua sản phẩm này cùng kỳ năm trước.' ELSE N'' END,
            CASE WHEN KM.ItemID IS NOT NULL THEN N' Có chương trình khuyến mãi đang hiệu lực.' ELSE N'' END
        )                                               AS [ReasonText],
        CONCAT(
            CASE
                WHEN Predicted.NgayDuKien IS NULL THEN N'INSUFFICIENT_HISTORY'
                WHEN Timing.ConLaiNgay < 0 THEN N'REORDER_OVERDUE'
                WHEN Timing.ConLaiNgay = 0 THEN N'REORDER_DUE'
                WHEN Timing.ConLaiNgay <= @ReorderWarningDays THEN N'REORDER_WINDOW'
                ELSE N'CYCLE_STABLE'
            END,
            CASE WHEN TT.ItemID IS NOT NULL THEN N'|FOCUS_ITEM' ELSE '' END,
            CASE WHEN MV.ItemID IS NOT NULL THEN N'|SEASONAL' ELSE '' END,
            CASE WHEN KM.ItemID IS NOT NULL THEN N'|ACTIVE_PROMOTION_REFERENCE' ELSE '' END
        )                                               AS [RecommendationReason],
        CONCAT(
            CASE
                WHEN Predicted.NgayDuKien IS NULL THEN N'INSUFFICIENT_HISTORY'
                WHEN Timing.ConLaiNgay < 0 THEN N'REORDER_OVERDUE'
                WHEN Timing.ConLaiNgay = 0 THEN N'REORDER_DUE'
                WHEN Timing.ConLaiNgay <= @ReorderWarningDays THEN N'REORDER_WINDOW'
                ELSE N'CYCLE_STABLE'
            END,
            CASE WHEN TT.ItemID IS NOT NULL THEN N'|FOCUS_ITEM' ELSE '' END,
            CASE WHEN MV.ItemID IS NOT NULL THEN N'|SEASONAL' ELSE '' END,
            CASE WHEN KM.ItemID IS NOT NULL THEN N'|ACTIVE_PROMOTION_REFERENCE' ELSE '' END
        )                                               AS [RecommendationReasonCodes],
        CASE
            WHEN Predicted.NgayDuKien IS NULL THEN N'INSUFFICIENT_HISTORY'
            WHEN Timing.ConLaiNgay < 0 THEN N'REORDER_OVERDUE'
            WHEN Timing.ConLaiNgay = 0 THEN N'REORDER_DUE'
            WHEN Timing.ConLaiNgay <= @ReorderWarningDays THEN N'REORDER_WINDOW'
            ELSE N'CYCLE_STABLE'
        END                                             AS [PrimaryReasonCode],
        CONCAT(
            N'CUSTOMER_PRODUCT_PURCHASE_HISTORY',
            CASE WHEN TT.ItemID IS NOT NULL THEN N'|FOCUS_PRODUCT_PROGRAM' ELSE '' END,
            CASE WHEN MV.ItemID IS NOT NULL THEN N'|SEASONAL_PURCHASE_HISTORY' ELSE '' END,
            CASE WHEN KM.ItemID IS NOT NULL THEN N'|ACTIVE_PROMOTION' ELSE '' END
        )                                               AS [RuleSourceCodes],
        CONCAT(
            N'Lịch sử mua sản phẩm của khách trong ', CAST(@ProductHistoryMonths AS NVARCHAR(10)), N' tháng gần nhất',
            CASE WHEN TT.ItemID IS NOT NULL THEN N' · Chương trình sản phẩm trọng tâm' ELSE N'' END,
            CASE WHEN MV.ItemID IS NOT NULL THEN N' · Lịch sử mua cùng kỳ năm trước' ELSE N'' END,
            CASE WHEN KM.ItemID IS NOT NULL THEN N' · Chương trình khuyến mãi đang hiệu lực' ELSE N'' END
        )                                               AS [RuleSourceLabel],
        N'ROLLING_CONFIGURED_MONTHS_NO_FALLBACK'        AS [DataWindow],
        @RecommendationDataFrom                         AS [DataFrom],
        @RecommendationAsOfDate                         AS [DataTo],
        @RuleAsOfUtc                                    AS [CalculatedAt],
        @ReturnAdjustmentMode                           AS [ReturnAdjustmentMode]
    FROM #LichSu L
    JOIN #ChuKy CK          ON L.ItemID = CK.ItemID
    LEFT JOIN #MuaVu MV     ON L.ItemID = MV.ItemID
    LEFT JOIN #KhuyenMai KM ON L.ItemID = KM.ItemID
    LEFT JOIN #TrongTam TT  ON L.ItemID = TT.ItemID
    LEFT JOIN #DaMuaHomNay HN ON L.ItemID = HN.ItemID
    JOIN #StockByItem ST ON L.ItemID = ST.ItemID
    LEFT JOIN CF_ItemTbl CF WITH (NOLOCK) ON L.ItemID = CF.ItemID
    LEFT JOIN CF_ObjectTbl KH WITH (NOLOCK) ON KH.ObjectID = @MaKhachHang
    OUTER APPLY
    (
        SELECT CASE
            WHEN L.PurchaseEventCount >= @MinimumPurchaseEventCount AND CK.ChuKyTrungBinh IS NOT NULL
            THEN CONVERT(DATE, DATEADD(DAY, CK.ChuKyTrungBinh, L.LanMuaCuoi))
            ELSE NULL
        END AS NgayDuKien
    ) Predicted
    OUTER APPLY
    (
        SELECT CASE WHEN Predicted.NgayDuKien IS NULL THEN NULL
                    ELSE DATEDIFF(DAY, @RecommendationAsOfDate, Predicted.NgayDuKien) END AS ConLaiNgay
    ) Timing
    WHERE ISNULL(CF.ItemGroupID, '') = 'HH1'
      AND CASE WHEN @SYS_BranchID = 'MB' THEN COALESCE(CF.IsDisableMB, 0)
               WHEN @SYS_BranchID = 'MN' THEN COALESCE(CF.IsDisableMN, 0)
               ELSE CASE WHEN COALESCE(CF.IsDisableMB, 0) = 0 OR COALESCE(CF.IsDisableMN, 0) = 0 THEN 0 ELSE 1 END
          END = 0
      AND ST.AvailableStock > 0
      AND HN.ItemID IS NULL -- Lọc Real-time: Chưa mua hôm nay
    ORDER BY (CASE WHEN TT.ItemID IS NOT NULL THEN 1 ELSE 0 END) DESC, -- Ưu tiên hàng trọng tâm lên hàng đầu
             (CASE WHEN L.PurchaseEventCount >= @MinimumPurchaseEventCount AND CK.ChuKyTrungBinh IS NOT NULL THEN 1 ELSE 0 END) DESC,
             (CASE WHEN Timing.ConLaiNgay <= 0 THEN 1 ELSE 0 END) DESC,
             (CASE WHEN Timing.ConLaiNgay <= @ReorderWarningDays THEN 1 ELSE 0 END) DESC,
             L.PurchaseEventCount DESC;

    DROP TABLE #AllowedObjects; DROP TABLE #AllowedStores; DROP TABLE #StockByItem; DROP TABLE #PurchaseEvent; DROP TABLE #LichSu; DROP TABLE #ChuKy; DROP TABLE #MuaVu; DROP TABLE #KhuyenMai; DROP TABLE #TrongTam; DROP TABLE #DaMuaHomNay;
END
GO

/* -- TEST SCRIPT --
-- Kịch bản 1: Tra cứu gợi ý cho một khách hàng cụ thể
EXEC API_GoiYDonHang_AI @Username = 'admin', @MaKhachHang = 'KH001', @TopN = 10;

-- Kịch bản 2: Tra cứu danh sách bán chạy chung cho chi nhánh (ObjectID để trống)
EXEC API_GoiYDonHang_AI @Username = 'admin', @MaKhachHang = '', @TopN = 10;
*/



