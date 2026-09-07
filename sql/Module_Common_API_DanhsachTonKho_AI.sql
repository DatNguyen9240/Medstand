CREATE OR ALTER PROCEDURE dbo.API_DanhsachTonKho_AI
    @Username VARCHAR(50),
    @ItemID VARCHAR(50) = '',
    @TenSanPham VARCHAR(200) = '',
    @timkiem NVARCHAR(200) = '',
    @Compact BIT = 1   -- STOCK-COMPACT-001: chatbot chỉ cần 4 cột (mã SP, tên SP, tên kho, tồn khả dụng).
                       -- Caller nào cần đủ trường (lô, hạn, tồn ERP, trạng thái...) thì truyền @Compact = 0.
AS
BEGIN
    SET NOCOUNT ON
    IF NOT EXISTS (SELECT 1 FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType
        RETURN
    END
    DECLARE @SYSBranchID VARCHAR(50) = ''
    DECLARE @IsGlobal BIT = 0
    DECLARE @IsManager BIT = 0
    DECLARE @EmployeeID VARCHAR(50) = ''
    DECLARE @StockAsOfUtc DATETIME2(0) = SYSUTCDATETIME()
    DECLARE @AllowedStores TABLE (StoreHouseID VARCHAR(50) PRIMARY KEY)
    SELECT @SYSBranchID = COALESCE(BranchID, ''),
           @IsGlobal = CASE WHEN UserGroupID IN ('Admin', 'SADM', 'BGD', 'GD') THEN 1 ELSE 0 END,
           @IsManager = COALESCE(Manager, 0),
           @EmployeeID = COALESCE(EmployeeID, '')
    FROM SY_User WHERE UserName = @Username

    INSERT INTO @AllowedStores (StoreHouseID)
    SELECT StoreHouseID
    FROM dbo.AI_WarehouseByUserFnc(@Username, @StockAsOfUtc)

    IF NOT EXISTS (SELECT 1 FROM @AllowedStores)
    BEGIN
        SELECT N'Tài khoản chưa được phân quyền kho.' AS Msg, 1 AS MsgType
        RETURN
    END

    IF OBJECT_ID('tempdb..#Detail') IS NOT NULL DROP TABLE #Detail;

    -- Nguồn chi tiết dùng chung cho cả hai chế độ: 1 dòng / lô (ItemID × Kho × BranchID × Lot × HSD).
    ;WITH LotBalance AS
    (
        SELECT A.ItemID, A.StoreHouseID, A.BranchID, A.Lot, A.ExpireDate,
               SUM(CASE WHEN A.Quantity >= 0 THEN A.Quantity ELSE 0 END) AS Nhap,
               SUM(CASE WHEN A.Quantity < 0 THEN -A.Quantity ELSE 0 END) AS Xuat,
               SUM(COALESCE(A.Quantity, 0)) AS TonCuoi
        FROM dbo.IV_StockTransactionTbl A
        WHERE A.StoreHouseID IN (SELECT StoreHouseID FROM @AllowedStores)
        GROUP BY A.ItemID, A.StoreHouseID, A.BranchID, A.Lot, A.ExpireDate
        HAVING SUM(COALESCE(A.Quantity, 0)) <> 0
    )
    SELECT
        A.ItemID, I.ItemName, I.Unit AS DonViTinh,
        A.StoreHouseID, S.StoreHouseName, A.BranchID,
        A.Lot, A.ExpireDate,
        A.Nhap, A.Xuat, A.TonCuoi,
        CAST(A.TonCuoi AS DECIMAL(18, 2)) AS LotPhysicalStock,
        S.PhysicalStock,
        S.NonExpiredPhysicalStock,
        S.ReservedStock,
        S.AvailableStock,
        S.WarehouseScope,
        S.StockDataStatus,
        S.StockUpdatedAt,
        S.StockAsOfAt,
        S.LatestStockMovementDate,
        S.StockDataSource AS RuleSource,
        S.RuleVersion,
        CAST(CASE
            WHEN S.StockDataStatus = N'STOCK_RECONCILIATION_REQUIRED' THEN N'Cần đối soát'
            WHEN A.ExpireDate IS NOT NULL AND A.ExpireDate < GETDATE() THEN N'Hết hạn'
            WHEN S.AvailableStock > 0 THEN N'Còn hàng có thể bán'
            ELSE N'Không còn tồn khả dụng'
        END AS NVARCHAR(50)) AS TrangThai
    INTO #Detail
    FROM LotBalance A
    JOIN dbo.CF_ItemTbl I ON A.ItemID = I.ItemID
    LEFT JOIN dbo.AI_StockAvailableByUserFnc(@Username, '', @StockAsOfUtc) S
      ON S.ItemID = A.ItemID
     AND S.StoreHouseID = A.StoreHouseID
    WHERE (@ItemID = '' OR A.ItemID = @ItemID)
      AND (@TenSanPham = '' OR I.ItemName LIKE '%' + @TenSanPham + '%')
      AND (@timkiem = '' OR I.ItemName LIKE '%' + @timkiem + '%' OR A.ItemID LIKE '%' + @timkiem + '%')
      AND EXISTS
      (
          SELECT 1
          FROM dbo.AI_BusinessRuleConfigTbl C
          CROSS APPLY STRING_SPLIT(C.ConfigValue, ',') V
          WHERE C.RuleCode = 'BR-STOCK-001'
            AND C.RuleVersion = S.RuleVersion
            AND C.ConfigKey = 'SellableItemGroupIDs'
            AND LTRIM(RTRIM(V.value)) = I.ItemGroupID
      );

    -- ═══ STOCK-COMPACT-001 ═══ Chatbot chỉ cần 4 cột: mã SP, tên SP, tên kho, tồn
    -- khả dụng. Một dòng / mỗi sản phẩm × kho (gộp lô). Giữ dòng tồn khả dụng = 0
    -- để hiển thị "Hết hàng". Đây là hình chiếu thuần của #Detail nên tập sản phẩm ×
    -- kho luôn trùng với chế độ đầy đủ.
    IF @Compact = 1
    BEGIN
        SELECT DISTINCT
            ItemID,
            ItemName,
            StoreHouseName,
            CAST(COALESCE(AvailableStock, 0) AS DECIMAL(18, 2)) AS AvailableStock
        FROM #Detail
        ORDER BY ItemName, StoreHouseName;
    END
    ELSE
    BEGIN
        SELECT
            ItemID, ItemName, DonViTinh,
            StoreHouseID, StoreHouseName, BranchID,
            Lot, ExpireDate,
            Nhap, Xuat, TonCuoi,
            LotPhysicalStock,
            PhysicalStock,
            NonExpiredPhysicalStock,
            ReservedStock,
            AvailableStock,
            WarehouseScope,
            StockDataStatus,
            StockUpdatedAt,
            StockAsOfAt,
            LatestStockMovementDate,
            RuleSource,
            RuleVersion,
            TrangThai
        FROM #Detail;
    END

    DROP TABLE #Detail;
END
GO
