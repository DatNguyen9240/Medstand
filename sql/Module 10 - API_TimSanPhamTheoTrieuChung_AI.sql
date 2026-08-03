USE medtest;
GO

CREATE OR ALTER PROCEDURE dbo.API_TimSanPhamTheoTrieuChung_AI
    @Username VARCHAR(50) = '',
    @Keyword NVARCHAR(100) = '',
    @timkiem NVARCHAR(100) = ''
AS
BEGIN
    SET NOCOUNT ON;

    -- @Keyword là contract chính; @timkiem là alias tương thích với API Execute
    -- và các client ERP cũ. Giữ logic chọn tham số tại SQL để mọi đường gọi
    -- dùng cùng một quy tắc.
    SET @Keyword = COALESCE(
        NULLIF(LTRIM(RTRIM(COALESCE(@Keyword, N''))), N''),
        NULLIF(LTRIM(RTRIM(COALESCE(@timkiem, N''))), N''),
        N''
    );

    IF NOT EXISTS
    (
        SELECT 1
        FROM dbo.SY_User
        WHERE UserName = @Username
          AND COALESCE(Disable, 0) = 0
    )
    BEGIN
        SELECT N'Tài khoản không tồn tại hoặc đã bị khóa.' AS Msg,
               1 AS MsgType,
               N'OUT_OF_SCOPE' AS Severity,
               N'INVALID_USER' AS Code;
        RETURN;
    END;

    IF @Keyword = N''
    BEGIN
        SELECT N'Vui lòng nhập từ khóa hoặc triệu chứng cần tìm.' AS Msg,
               1 AS MsgType,
               N'VALIDATION_ERROR' AS Severity,
               N'MISSING_KEYWORD' AS Code;
        RETURN;
    END;

    DECLARE @StockAsOfUtc DATETIME2(0) = SYSUTCDATETIME();
    DECLARE @BranchID VARCHAR(50) = '';
    DECLARE @StockRuleVersion VARCHAR(30) = NULL;

    SELECT @BranchID = COALESCE(BranchID, '')
    FROM dbo.SY_User
    WHERE UserName = @Username;

    SELECT TOP (1) @StockRuleVersion = RuleVersion
    FROM dbo.AI_WarehouseByUserFnc(@Username, @StockAsOfUtc);

    IF @StockRuleVersion IS NULL
    BEGIN
        SELECT N'Tài khoản chưa được phân quyền kho bán hàng.' AS Msg,
               1 AS MsgType,
               N'OUT_OF_SCOPE' AS Severity,
               N'WAREHOUSE_SCOPE_UNAVAILABLE' AS Code;
        RETURN;
    END;

    SELECT TOP (10)
        I.ItemID,
        I.ItemName,
        I.Unit,
        I.ItemGroupID,
        I.HangSX,
        I.TuKhoa,
        CAST(P.UnitPrice AS DECIMAL(18, 2)) AS Price,
        S.PhysicalStock,
        S.ReservedStock,
        S.AvailableStock,
        S.StoreHouseID,
        S.StoreHouseName,
        S.WarehouseScope,
        S.StockDataStatus,
        S.StockUpdatedAt,
        S.StockAsOfAt,
        S.LatestStockMovementDate,
        S.StockDataSource,
        S.RuleVersion AS StockRuleVersion,
        CAST(
            (CASE WHEN I.ItemName LIKE @Keyword + N'%' THEN 100 ELSE 0 END) +
            (CASE WHEN N' ' + I.ItemName + N' ' LIKE N'% ' + @Keyword + N' %' THEN 80 ELSE 0 END) +
            (CASE WHEN I.ItemName LIKE N'%' + @Keyword + N'%' THEN 20 ELSE 0 END) +
            (CASE WHEN I.ItemID = @Keyword THEN 150 ELSE 0 END)
        AS INT) AS DiemPhuHop,
        N'Đề xuất tham khảo cho: ' + @Keyword + N' | Còn hàng tại kho ' + S.StoreHouseID AS LyDo,
        N'Đề xuất tham khảo cho: ' + @Keyword + N' | Còn hàng tại kho ' + S.StoreHouseID AS LyDoGoiY,
        N'REFERENCE_ONLY_MEDICAL_REVIEW_REQUIRED' AS RecommendationStatus,
        N'Thông tin chỉ để tham khảo; không thay thế chẩn đoán, kê đơn hoặc tư vấn của người có chuyên môn.' AS MedicalDisclaimer,
        N'BR-MED-V1-DRAFT' AS RuleVersion
    FROM dbo.CF_ItemTbl I
    CROSS APPLY
    (
        SELECT TOP (1) Stock.*
        FROM dbo.AI_StockAvailableByUserFnc(@Username, I.ItemID, @StockAsOfUtc) Stock
        WHERE Stock.AvailableStock > 0
        ORDER BY Stock.AvailableStock DESC, Stock.StoreHouseID
    ) S
    CROSS APPLY
    (
        SELECT TOP (1) D.UnitPrice
        FROM dbo.AR_PriceDetailTbl D
        JOIN dbo.AR_PriceTbl H ON H.DocumentID = D.DocumentID
        WHERE D.ItemID = I.ItemID
          AND COALESCE(H.isDisable, 0) = 0
          AND D.UnitPrice > 0
        ORDER BY
            CASE WHEN H.FromDate <= GETDATE()
                       AND (H.ToDate IS NULL OR H.ToDate >= GETDATE()) THEN 0 ELSE 1 END,
            H.FromDate DESC
    ) P
    WHERE COALESCE(I.isDisable, 0) = 0
      AND CASE WHEN @BranchID = 'MB' THEN COALESCE(I.IsDisableMB, 0)
               WHEN @BranchID = 'MN' THEN COALESCE(I.IsDisableMN, 0)
               WHEN @BranchID = 'MT' THEN COALESCE(I.IsDisableMT, 0)
               ELSE COALESCE(I.IsDisable, 0) END = 0
      AND EXISTS
      (
          SELECT 1
          FROM dbo.AI_BusinessRuleConfigTbl C
          CROSS APPLY STRING_SPLIT(C.ConfigValue, ',') V
          WHERE C.RuleCode = 'BR-STOCK-001'
            AND C.RuleVersion = @StockRuleVersion
            AND C.ConfigKey = 'SellableItemGroupIDs'
            AND C.Status = 'APPROVED'
            AND UPPER(LTRIM(RTRIM(V.value))) = UPPER(COALESCE(I.ItemGroupID, ''))
      )
      AND
      (
          I.ItemName LIKE N'%' + @Keyword + N'%'
          OR COALESCE(I.TuKhoa, N'') LIKE N'%' + @Keyword + N'%'
          OR I.ItemID = @Keyword
      )
    ORDER BY DiemPhuHop DESC, I.ItemName ASC;
END;
GO
