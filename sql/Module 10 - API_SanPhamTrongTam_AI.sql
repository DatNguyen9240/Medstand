CREATE OR ALTER PROCEDURE dbo.API_SanPhamTrongTam_AI
    @Username      VARCHAR(50) = '',
    @MaKhachHang   VARCHAR(50) = '',
    @TopN          INT = 500
AS
BEGIN
    SET NOCOUNT ON;

    -- ═══ GUARD: dọn temp table còn sót lại từ request lỗi trước trên cùng connection ═══
    IF OBJECT_ID('tempdb..#FocusItems') IS NOT NULL DROP TABLE #FocusItems;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.SY_User WITH (NOLOCK)
        WHERE UserName = @Username
          AND COALESCE(Disable, 0) = 0
    )
    BEGIN
        SELECT N'Tài khoản không tồn tại hoặc đã bị khóa.' AS Msg,
               1 AS MsgType,
               'OUT_OF_SCOPE' AS Severity;
        RETURN;
    END;

    IF @TopN IS NULL OR @TopN <= 0 SET @TopN = 500;
    IF @TopN > 500 SET @TopN = 500;
    SET @MaKhachHang = LTRIM(RTRIM(ISNULL(@MaKhachHang, '')));

    DECLARE @SYSBranchID VARCHAR(50) = '';
    DECLARE @SYSUserGroupID VARCHAR(50) = '';
    DECLARE @EmployeeID VARCHAR(50) = '';
    DECLARE @IsManager BIT = 0;
    DECLARE @IsGlobal BIT = 0;
    DECLARE @AllowedStores TABLE (StoreHouseID VARCHAR(50) PRIMARY KEY);

    SELECT
        @SYSBranchID = COALESCE(BranchID, ''),
        @SYSUserGroupID = COALESCE(UserGroupID, ''),
        @EmployeeID = COALESCE(EmployeeID, ''),
        @IsManager = COALESCE(Manager, 0),
        @IsGlobal = CASE
            WHEN UPPER(COALESCE(UserGroupID, '')) IN ('ADMIN', 'SADM', 'BGD', 'GD') THEN 1
            ELSE 0
        END
    FROM dbo.SY_User WITH (NOLOCK)
    WHERE UserName = @Username
      AND COALESCE(Disable, 0) = 0;

    IF @IsGlobal = 0 AND @SYSBranchID = ''
    BEGIN
        SELECT N'Tài khoản chưa được cấp phạm vi chi nhánh.' AS Msg,
               1 AS MsgType,
               'OUT_OF_SCOPE' AS Severity;
        RETURN;
    END;

    INSERT INTO @AllowedStores (StoreHouseID)
    SELECT DISTINCT US.StoreHouseID
    FROM dbo.SY_UserStoreHouseTbl US WITH (NOLOCK)
    WHERE US.UserName = @Username
      AND ISNULL(US.StoreHouseID, '') <> '';

    IF @IsManager = 1 AND @EmployeeID <> ''
    BEGIN
        INSERT INTO @AllowedStores (StoreHouseID)
        SELECT DISTINCT US.StoreHouseID
        FROM dbo.SY_User U WITH (NOLOCK)
        JOIN dbo.SY_UserStoreHouseTbl US WITH (NOLOCK)
          ON US.UserName = U.UserName
        WHERE U.ManagerID = @EmployeeID
          AND ISNULL(U.Disable, 0) = 0
          AND ISNULL(US.StoreHouseID, '') <> ''
          AND NOT EXISTS (
              SELECT 1
              FROM @AllowedStores A
              WHERE A.StoreHouseID = US.StoreHouseID
          );
    END;

    IF @IsGlobal = 0 AND NOT EXISTS (SELECT 1 FROM @AllowedStores)
    BEGIN
        SELECT N'Tài khoản chưa được phân quyền kho.' AS Msg,
               1 AS MsgType,
               'OUT_OF_SCOPE' AS Severity;
        RETURN;
    END;

    DECLARE @CustomerName NVARCHAR(250) = NULL;
    IF @MaKhachHang <> ''
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM dbo.CF_ObjectTbl O WITH (NOLOCK)
            WHERE O.ObjectID = @MaKhachHang
              AND ISNULL(O.isCustomer, 0) = 1
              AND ISNULL(O.isDisable, 0) = 0
        )
        BEGIN
            SELECT N'Khách hàng không tồn tại hoặc đã ngừng hoạt động.' AS Msg,
                   1 AS MsgType,
                   'VALIDATION_ERROR' AS Severity;
            RETURN;
        END;

        IF @IsGlobal = 0 AND NOT EXISTS (
            SELECT 1
            FROM dbo.CF_ObjectTbl O WITH (NOLOCK)
            WHERE O.ObjectID = @MaKhachHang
              AND O.BranchID = @SYSBranchID
              AND O.ObjectID IN (
                  SELECT ObjectID
                  FROM dbo.AR_GetObjectByUserFnc(@Username)
              )
        )
        BEGIN
            SELECT N'Bạn không có quyền xem tiến độ của khách hàng này.' AS Msg,
                   1 AS MsgType,
                   'OUT_OF_SCOPE' AS Severity;
            RETURN;
        END;

        SELECT @CustomerName = O.ObjectName
        FROM dbo.CF_ObjectTbl O WITH (NOLOCK)
        WHERE O.ObjectID = @MaKhachHang;
    END;

    EXEC dbo.AI_WriteAuditLog
        @Username = @Username,
        @ActionType = 'AI_QUERY',
        @TargetEntity = 'API_SanPhamTrongTam_AI',
        @TargetID = @MaKhachHang,
        @TargetName = @CustomerName,
        @ExtraInfo = NULL;

    DECLARE @Today DATE = CAST(GETDATE() AS DATE);
    DECLARE @ProgramID VARCHAR(50) = '';
    DECLARE @ProgramName NVARCHAR(200) = '';
    DECLARE @FromDate DATETIME = NULL;
    DECLARE @ToDate DATETIME = NULL;

    SELECT TOP 1
        @ProgramID = P.DocumentID,
        @ProgramName = P.Memo,
        @FromDate = P.FromDate,
        @ToDate = P.ToDate
    FROM dbo.AR_SanPhamTrongTamTbl P WITH (NOLOCK)
    WHERE @Today BETWEEN CAST(P.FromDate AS DATE) AND CAST(P.ToDate AS DATE)
    ORDER BY P.FromDate DESC, P.ToDate DESC, P.DocumentID DESC;

    IF @ProgramID = ''
    BEGIN
        SELECT N'Hiện chưa có chương trình sản phẩm trọng tâm đang áp dụng.' AS Msg,
               0 AS MsgType,
               'NO_DATA' AS Severity;
        RETURN;
    END;

    SELECT DISTINCT D.ItemID
    INTO #FocusItems
    FROM dbo.AR_SanPhamTrongTamDetailTbl D WITH (NOLOCK)
    WHERE D.DocumentID = @ProgramID;

    DECLARE @CurrentSales DECIMAL(18, 2) = NULL;
    DECLARE @InvoiceSales DECIMAL(18, 2) = 0;
    DECLARE @ReturnAmount DECIMAL(18, 2) = 0;

    IF @MaKhachHang <> ''
    BEGIN
        SELECT @InvoiceSales = ISNULL(SUM(D.TotalAmount), 0)
        FROM dbo.AR_InvoiceTbl I WITH (NOLOCK)
        JOIN dbo.AR_InvoiceDetailTbl D WITH (NOLOCK)
          ON D.DocumentID = I.DocumentID
        JOIN #FocusItems F
          ON F.ItemID = D.ItemID
        WHERE I.ObjectID = @MaKhachHang
          AND I.StatusID IN (3, 6, 7, 8)
          AND I.DocumentDate >= @FromDate
          AND I.DocumentDate < DATEADD(DAY, 1, CAST(@ToDate AS DATE))
          AND (@IsGlobal = 1 OR I.BranchID = @SYSBranchID);

        SELECT @ReturnAmount = ISNULL(SUM(D.TotalAmount), 0)
        FROM dbo.AR_ReturnTbl R WITH (NOLOCK)
        JOIN dbo.AR_ReturnDetailTbl D WITH (NOLOCK)
          ON D.DocumentID = R.DocumentID
        JOIN #FocusItems F
          ON F.ItemID = D.ItemID
        WHERE R.ObjectID = @MaKhachHang
          AND R.DocumentDate >= @FromDate
          AND R.DocumentDate < DATEADD(DAY, 1, CAST(@ToDate AS DATE))
          AND (@IsGlobal = 1 OR R.BranchID = @SYSBranchID);

        SET @CurrentSales = @InvoiceSales - @ReturnAmount;
        IF @CurrentSales < 0 SET @CurrentSales = 0;
    END;

    DECLARE @NextTarget DECIMAL(18, 2) = NULL;
    DECLARE @NextGift NVARCHAR(500) = NULL;
    IF @MaKhachHang <> ''
    BEGIN
        SELECT TOP 1
            @NextTarget = G.TuDiem,
            @NextGift = G.QuaTang
        FROM dbo.AR_PromotionGiftTbl G WITH (NOLOCK)
        WHERE G.DocumentID = @ProgramID
          AND G.TuDiem > ISNULL(@CurrentSales, 0)
        ORDER BY G.TuDiem ASC;
    END;

    DECLARE @GiftLadderJson NVARCHAR(MAX) = N'[]';
    SELECT @GiftLadderJson = ISNULL((
        SELECT
            CAST(G.TuDiem AS DECIMAL(18, 2)) AS TargetAmount,
            G.QuaTang AS GiftName
        FROM dbo.AR_PromotionGiftTbl G WITH (NOLOCK)
        WHERE G.DocumentID = @ProgramID
        ORDER BY G.TuDiem ASC
        FOR JSON PATH
    ), N'[]');

    DECLARE @ProductCount INT = (
        SELECT COUNT(*)
        FROM #FocusItems F
        JOIN dbo.CF_ItemTbl I WITH (NOLOCK)
          ON I.ItemID = F.ItemID
        WHERE ISNULL(I.ItemGroupID, '') NOT IN ('KM', 'DV', 'VT', 'BB', 'Vat Tu', 'Bao Bi', 'TUI')
          AND I.ItemID NOT LIKE 'BB%'
          AND I.ItemID NOT LIKE 'TUI%'
          AND I.ItemID NOT LIKE 'PB%'
          AND I.ItemID NOT LIKE 'NY%'
    );
    DECLARE @GiftTierCount INT = (
        SELECT COUNT(*)
        FROM dbo.AR_PromotionGiftTbl G WITH (NOLOCK)
        WHERE G.DocumentID = @ProgramID
    );

    -- Result type PROGRAM: thông tin chung và tiến độ riêng chỉ có khi đã chọn khách.
    SELECT
        'PROGRAM' AS RecordType,
        @ProgramID AS ProgramID,
        @ProgramName AS ProgramName,
        @FromDate AS EffectiveFrom,
        @ToDate AS EffectiveTo,
        'ACTIVE' AS ProgramStatus,
        CAST(CASE WHEN @MaKhachHang <> '' THEN 1 ELSE 0 END AS BIT) AS HasCustomer,
        NULLIF(@MaKhachHang, '') AS CustomerID,
        @CustomerName AS CustomerName,
        @CurrentSales AS CurrentSales,
        @NextTarget AS NextTarget,
        CASE
            WHEN @NextTarget IS NULL OR @CurrentSales IS NULL THEN NULL
            ELSE @NextTarget - @CurrentSales
        END AS RemainingToNextTarget,
        CASE
            WHEN @MaKhachHang = '' THEN NULL
            WHEN @NextTarget IS NULL THEN N'Đã đạt mốc cao nhất'
            ELSE @NextGift
        END AS NextGift,
        @GiftLadderJson AS GiftLadderJson,
        @ProductCount AS ProductCount,
        @GiftTierCount AS GiftTierCount,
        N'INVOICE_STATUS_3_6_7_8_MINUS_RETURNS' AS AccumulationBasis,
        N'BR-FOCUS-PRODUCT-V1-DRAFT' AS RuleVersion,
        @ProgramName AS [Chương Trình],
        @FromDate AS [Từ Ngày],
        @ToDate AS [Đến Ngày],
        NULLIF(@MaKhachHang, '') AS [Mã Khách],
        @CurrentSales AS [Doanh Số Hiện Tại],
        @NextTarget AS [Mốc Kế Tiếp],
        CASE
            WHEN @NextTarget IS NULL OR @CurrentSales IS NULL THEN NULL
            ELSE @NextTarget - @CurrentSales
        END AS [Còn Thiếu],
        CASE
            WHEN @MaKhachHang = '' THEN NULL
            WHEN @NextTarget IS NULL THEN N'Đã đạt mốc cao nhất'
            ELSE @NextGift
        END AS [Quà Kế Tiếp];

    ;WITH StockByItem AS (
        SELECT
            T.ItemID,
            SUM(ISNULL(T.Quantity, 0)) AS PhysicalStock,
            SUM(CASE
                WHEN T.ExpireDate IS NOT NULL AND CAST(T.ExpireDate AS DATE) < @Today THEN 0
                ELSE ISNULL(T.Quantity, 0)
            END) AS NonExpiredPhysicalStock
        FROM dbo.IV_StockTransactionTbl T WITH (NOLOCK)
        WHERE @IsGlobal = 1
           OR T.StoreHouseID IN (SELECT StoreHouseID FROM @AllowedStores)
        GROUP BY T.ItemID
    )
    SELECT DISTINCT TOP (@TopN)
        'PRODUCT' AS RecordType,
        @ProgramID AS ProgramID,
        @ProgramName AS ProgramName,
        D.ItemID AS ItemID,
        I.ItemName AS ItemName,
        I.Unit AS Unit,
        CAST(ISNULL(S.PhysicalStock, 0) AS DECIMAL(18, 2)) AS PhysicalStock,
        CAST(CASE
            WHEN ISNULL(S.NonExpiredPhysicalStock, 0) > 0 THEN S.NonExpiredPhysicalStock
            ELSE 0
        END AS DECIMAL(18, 2)) AS AvailableStock,
        CASE
            WHEN ISNULL(S.PhysicalStock, 0) < 0 THEN 'STOCK_RECONCILIATION_REQUIRED'
            WHEN ISNULL(S.NonExpiredPhysicalStock, 0) <= 0 THEN 'NO_STOCK_IN_ASSIGNED_WAREHOUSES'
            ELSE 'PHYSICAL_AS_SELLABLE_TEMPORARY'
        END AS StockDataStatus,
        CASE
            WHEN ISNULL(S.PhysicalStock, 0) < 0 THEN N'Cần đối soát tồn kho'
            WHEN ISNULL(S.NonExpiredPhysicalStock, 0) <= 0 THEN N'Chưa có tồn trong kho được phân quyền'
            ELSE N'Còn tồn ERP; kiểm tra lại trước khi chốt đơn'
        END AS StockStatusLabel,
        CAST(CASE WHEN PR.UnitPrice > 0 THEN PR.UnitPrice ELSE NULL END AS DECIMAL(18, 2)) AS UnitPrice,
        CASE WHEN PR.UnitPrice > 0 THEN 'PRICE_AVAILABLE' ELSE 'PRICE_NOT_CONFIGURED' END AS PriceStatus,
        CAST(NULL AS DATETIME2(0)) AS StockUpdatedAt,
        N'IV_StockTransactionTbl' AS DataSource,
        N'BR-FOCUS-PRODUCT-V1-DRAFT' AS RuleVersion,
        D.ItemID AS [Mã sp],
        I.ItemName AS [Sản Phẩm],
        I.Unit AS [ĐVT],
        CAST(ISNULL(S.PhysicalStock, 0) AS DECIMAL(18, 2)) AS [Tồn Kho],
        CAST(CASE WHEN PR.UnitPrice > 0 THEN PR.UnitPrice ELSE NULL END AS DECIMAL(18, 2)) AS [Giá Bán]
    FROM dbo.AR_SanPhamTrongTamDetailTbl D WITH (NOLOCK)
    JOIN dbo.CF_ItemTbl I WITH (NOLOCK)
      ON I.ItemID = D.ItemID
    LEFT JOIN StockByItem S
      ON S.ItemID = D.ItemID
    OUTER APPLY (
        SELECT TOP 1 PD.UnitPrice
        FROM dbo.AR_PriceDetailTbl PD WITH (NOLOCK)
        JOIN dbo.AR_PriceTbl PH WITH (NOLOCK)
          ON PH.DocumentID = PD.DocumentID
        WHERE PD.ItemID = D.ItemID
          AND ISNULL(PH.isDisable, 0) = 0
          AND PH.FromDate <= GETDATE()
        ORDER BY PH.FromDate DESC, PH.DocumentID DESC
    ) PR
    WHERE D.DocumentID = @ProgramID
      AND ISNULL(I.ItemGroupID, '') NOT IN ('KM', 'DV', 'VT', 'BB', 'Vat Tu', 'Bao Bi', 'TUI')
      AND I.ItemID NOT LIKE 'BB%'
      AND I.ItemID NOT LIKE 'TUI%'
      AND I.ItemID NOT LIKE 'PB%'
      AND I.ItemID NOT LIKE 'NY%'
    ORDER BY I.ItemName ASC;

    DROP TABLE #FocusItems;
END;
GO
