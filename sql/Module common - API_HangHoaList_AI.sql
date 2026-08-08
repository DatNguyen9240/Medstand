/*
  Medstand AI-only product catalog for order creation.
  Does not alter dbo.API_HangHoaList used by other applications/enterprises.
*/
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.API_HangHoaList_AI
    @Username VARCHAR(50) = '',
    @ObjectID VARCHAR(50) = '',
    @ItemID VARCHAR(50) = '',
    @SearchText NVARCHAR(50) = '',
    @SeachText NVARCHAR(50) = '',
    @DocumentDate DATETIME = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'Tài khoản không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    IF COALESCE(@ObjectID, '') = ''
       OR NOT EXISTS (SELECT 1 FROM dbo.AR_GetObjectByUserFnc(@Username) WHERE ObjectID = @ObjectID)
    BEGIN
        SELECT N'Khách hàng không thuộc phạm vi được cấp' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    -- Preserve AR_LayGiaSanPhamFnc semantics: ERP prices by the current date.
    DECLARE @ToDate DATE = CAST(GETDATE() AS DATE);
    DECLARE @BranchID VARCHAR(50) = '';
    DECLARE @ObjectGroupID VARCHAR(50) = '';
    DECLARE @StockAsOfUtc DATETIME2(0) = SYSUTCDATETIME();

    SELECT @BranchID = COALESCE(BranchID, '')
    FROM dbo.SY_User
    WHERE UserName = @Username;

    SELECT @ObjectGroupID = COALESCE(ObjectGroupID, '')
    FROM dbo.CF_ObjectTbl
    WHERE ObjectID = @ObjectID;

    IF @SeachText <> '' SET @SearchText = @SeachText;

    ;WITH RankedStock AS
    (
        SELECT Stock.*,
               ROW_NUMBER() OVER
               (
                   PARTITION BY Stock.ItemID
                   ORDER BY Stock.AvailableStock DESC, Stock.StoreHouseID
               ) AS StockRank
        FROM dbo.AI_StockAvailableByUserFnc(@Username, @ItemID, @StockAsOfUtc) Stock
        WHERE Stock.AvailableStock > 0
          AND Stock.StockDataStatus = N'AVAILABLE_FOR_SALE'
    )
    SELECT TOP (30)
           I.ItemID,
           I.ItemName,
           I.Unit,
           I.ItemGroupID,
           I.CategoryID,
           I.HangSX,
           S.StoreHouseID,
           S.StoreHouseName,
           S.PhysicalStock,
           S.ReservedStock,
           S.AvailableStock,
           S.WarehouseScope,
           S.StockDataStatus,
           S.StockUpdatedAt,
           S.StockAsOfAt,
           S.LatestStockMovementDate,
           S.StockDataSource,
           S.RuleVersion
    INTO #CandidateItems
    FROM dbo.CF_ItemTbl I
    INNER JOIN RankedStock S
            ON S.ItemID = I.ItemID
           AND S.StockRank = 1
    WHERE EXISTS
          (
              SELECT 1
              FROM dbo.AI_BusinessRuleConfigTbl C
              CROSS APPLY STRING_SPLIT(C.ConfigValue, ',') V
              WHERE C.RuleCode = 'BR-STOCK-001'
                AND C.RuleVersion = S.RuleVersion
                AND C.ConfigKey = 'SellableItemGroupIDs'
                AND LTRIM(RTRIM(V.value)) = I.ItemGroupID
          )
      AND (@ItemID = '' OR I.ItemID = @ItemID)
      AND CASE WHEN @BranchID = 'MB' THEN COALESCE(I.IsDisableMB, 0)
               WHEN @BranchID = 'MN' THEN COALESCE(I.IsDisableMN, 0)
               WHEN @BranchID = 'MT' THEN COALESCE(I.IsDisableMT, 0)
               ELSE COALESCE(I.IsDisable, 0) END = 0
      AND (I.ItemID LIKE '%' + @SearchText + '%' OR I.ItemName LIKE '%' + @SearchText + '%')
    ORDER BY I.ItemName;

    IF NOT EXISTS (SELECT 1 FROM #CandidateItems)
       AND NOT EXISTS
           (
               SELECT 1
               FROM dbo.AI_WarehouseByUserFnc(@Username, @StockAsOfUtc)
           )
    BEGIN
        SELECT N'Tài khoản chưa được phân quyền kho' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    ;WITH PriceCandidates AS
    (
        SELECT Y.ItemID,
               Y.UnitPrice,
               Y.DiemSanPham,
               Y.Notes AS GhiChu,
               Y.UserAutoID,
               1 AS PricePriority
        FROM dbo.AR_PriceObjectTbl X
        INNER JOIN dbo.AR_PriceDetailTbl Y ON Y.DocumentID = X.DocumentID
        INNER JOIN dbo.AR_PriceTbl M
                ON M.DocumentID = X.DocumentID
               AND COALESCE(M.isDisable, 0) = 0
               AND COALESCE(M.FromDate, '20000101') <= @ToDate
               AND COALESCE(M.ToDate, '20990101') >= @ToDate
        INNER JOIN #CandidateItems I ON I.ItemID = Y.ItemID
        WHERE X.ObjectID = @ObjectID
          AND COALESCE(M.isObjectPrice, 0) = 1

        UNION ALL

        SELECT Y.ItemID,
               Y.UnitPrice,
               Y.DiemSanPham,
               Y.Notes AS GhiChu,
               Y.UserAutoID,
               2 AS PricePriority
        FROM dbo.AR_PriceObjectGroupTbl X
        INNER JOIN dbo.AR_PriceDetailTbl Y ON Y.DocumentID = X.DocumentID
        INNER JOIN dbo.AR_PriceTbl M
                ON M.DocumentID = X.DocumentID
               AND COALESCE(M.isDisable, 0) = 0
               AND COALESCE(M.FromDate, '20000101') <= @ToDate
               AND COALESCE(M.ToDate, '20990101') >= @ToDate
        INNER JOIN #CandidateItems I ON I.ItemID = Y.ItemID
        WHERE X.ObjectGroupID = @ObjectGroupID
          AND COALESCE(M.isObjectPrice, 0) = 1

        UNION ALL

        SELECT Y.ItemID,
               Y.UnitPrice,
               Y.DiemSanPham,
               Y.Notes AS GhiChu,
               Y.UserAutoID,
               3 AS PricePriority
        FROM dbo.AR_PriceTbl X
        INNER JOIN dbo.AR_PriceDetailTbl Y
                ON Y.DocumentID = X.DocumentID
        INNER JOIN #CandidateItems I ON I.ItemID = Y.ItemID
        WHERE COALESCE(X.isDisable, 0) = 0
          AND COALESCE(X.FromDate, '20000101') <= @ToDate
          AND COALESCE(X.ToDate, '20990101') >= @ToDate
          AND COALESCE(X.isObjectPrice, 0) = 0
    ),
    RankedPrice AS
    (
        SELECT P.*,
               ROW_NUMBER() OVER
               (
                   PARTITION BY P.ItemID
                   ORDER BY P.PricePriority, P.UserAutoID DESC
               ) AS PriceRank
        FROM PriceCandidates P
    )
    SELECT TOP (20) I.ItemID,
           I.ItemName + COALESCE(' (' + P.GhiChu + ')', '') AS ItemName,
           I.Unit,
           I.ItemGroupID,
           I.CategoryID,
           I.HangSX,
           P.UnitPrice,
           P.DiemSanPham,
           P.GhiChu,
           CAST(COALESCE(I.AvailableStock, 0) AS DECIMAL(18,2)) AS QuantityinStock,
           CAST(COALESCE(I.AvailableStock, 0) AS DECIMAL(18,2)) AS TonKho,
           I.StoreHouseID,
           I.StoreHouseName,
           COALESCE(I.PhysicalStock, 0) AS PhysicalStock,
           COALESCE(I.ReservedStock, 0) AS ReservedStock,
           COALESCE(I.AvailableStock, 0) AS AvailableStock,
           COALESCE(I.WarehouseScope, N'AUTHORIZED_WAREHOUSE_NO_STOCK') AS WarehouseScope,
           COALESCE(I.StockDataStatus, N'NO_SELLABLE_STOCK') AS StockDataStatus,
           COALESCE(I.StockUpdatedAt, @StockAsOfUtc) AS StockUpdatedAt,
           COALESCE(I.StockAsOfAt, @StockAsOfUtc) AS StockAsOfAt,
           I.LatestStockMovementDate,
           COALESCE(I.StockDataSource, N'IV_StockTransactionTbl-AR_OrderOpenReservation') AS StockDataSource,
           I.RuleVersion AS StockRuleVersion
    FROM #CandidateItems I
    INNER JOIN RankedPrice P
            ON P.ItemID = I.ItemID
           AND P.PriceRank = 1
    WHERE P.UnitPrice IS NOT NULL
    ORDER BY I.ItemName;
END;
GO
