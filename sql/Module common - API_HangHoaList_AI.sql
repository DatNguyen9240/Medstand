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

    DECLARE @ToDate DATE = CAST(COALESCE(@DocumentDate, GETDATE()) AS DATE);
    DECLARE @BranchID VARCHAR(50) = '';
    DECLARE @StockAsOfUtc DATETIME2(0) = SYSUTCDATETIME();
    DECLARE @AllowedStores TABLE (StoreHouseID VARCHAR(50) PRIMARY KEY);

    SELECT @BranchID = COALESCE(BranchID, '')
    FROM dbo.SY_User
    WHERE UserName = @Username;

    INSERT @AllowedStores (StoreHouseID)
    SELECT StoreHouseID
    FROM dbo.AI_WarehouseByUserFnc(@Username, @StockAsOfUtc);

    IF NOT EXISTS (SELECT 1 FROM @AllowedStores)
    BEGIN
        SELECT N'Tài khoản chưa được phân quyền kho' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    IF @SeachText <> '' SET @SearchText = @SeachText;

    SELECT I.ItemID,
           I.ItemName + COALESCE(' (' + P.GhiChu + ')', '') AS ItemName,
           I.Unit,
           I.ItemGroupID,
           I.CategoryID,
           I.HangSX,
           P.UnitPrice,
           P.DiemSanPham,
           P.GhiChu,
           CAST(COALESCE(S.AvailableStock, 0) AS DECIMAL(18,2)) AS QuantityinStock,
           CAST(COALESCE(S.AvailableStock, 0) AS DECIMAL(18,2)) AS TonKho,
           S.StoreHouseID,
           S.StoreHouseName,
           COALESCE(S.PhysicalStock, 0) AS PhysicalStock,
           COALESCE(S.ReservedStock, 0) AS ReservedStock,
           COALESCE(S.AvailableStock, 0) AS AvailableStock,
           COALESCE(S.WarehouseScope, N'AUTHORIZED_WAREHOUSE_NO_STOCK') AS WarehouseScope,
           COALESCE(S.StockDataStatus, N'NO_SELLABLE_STOCK') AS StockDataStatus,
           COALESCE(S.StockUpdatedAt, @StockAsOfUtc) AS StockUpdatedAt,
           COALESCE(S.StockAsOfAt, @StockAsOfUtc) AS StockAsOfAt,
           S.LatestStockMovementDate,
           COALESCE(S.StockDataSource, N'IV_StockTransactionTbl-AR_OrderOpenReservation') AS StockDataSource,
           S.RuleVersion AS StockRuleVersion
    FROM dbo.CF_ItemTbl I
    OUTER APPLY (
        SELECT TOP (1) UnitPrice, DiemSanPham, GhiChu
        FROM dbo.AR_LayGiaSanPhamFnc(@ToDate, @ObjectID, I.ItemID)
    ) P
    OUTER APPLY (
        SELECT TOP (1) Stock.*
        FROM dbo.AI_StockAvailableByUserFnc(@Username, I.ItemID, @StockAsOfUtc) Stock
        ORDER BY Stock.AvailableStock DESC, Stock.StoreHouseID
    ) S
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
      AND P.UnitPrice IS NOT NULL
    ORDER BY I.ItemName;
END;
GO
