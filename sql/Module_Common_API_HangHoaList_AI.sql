/*
  Medstand AI-only product catalog for order creation.
  Does not alter dbo.API_HangHoaList used by other applications/enterprises.

  PRODUCT-DIAG-001 (21/08/2026) — trả LÝ DO thay vì danh sách rỗng.

  Trước đây procedure lọc bỏ sản phẩm ở năm lớp khác nhau (nhóm hàng, khoá theo chi nhánh,
  quyền kho, tồn, giá) rồi trả về rỗng, nên cả ba giao diện đều chỉ nói được một câu gộp
  "Sản phẩm không còn bán được hoặc không có giá/tồn hợp lệ". Người dùng không biết thiếu gì.

  Nay: khi request chỉ đích danh @ItemID mà sản phẩm không lập đơn được, procedure trả về
  hợp đồng chẩn đoán PRODUCT_ORDERABILITY_V1:

      MsgType = 1, IsOrderable = 0
      Code                       nguyên nhân CHÍNH, theo thứ tự ưu tiên CỐ ĐỊNH
      ReasonCodesJson            TOÀN BỘ nguyên nhân phát hiện được (mảng JSON)
      DiagnosticContractVersion  'PRODUCT_ORDERABILITY_V1'
      EvaluatedAtUtc             thời điểm đánh giá

  Ràng buộc đã giữ:
    - KHÔNG nới bất kỳ điều kiện lọc nào. Danh sách trả về khi thành công y hệt bản cũ.
    - Tìm kiếm rộng (@ItemID = '') giữ nguyên hành vi cũ: trả danh sách hoặc rỗng.
    - KHÔNG lộ dữ liệu ngoài phạm vi: không trả mã kho, tên kho hay số lượng tồn của kho mà
      tài khoản không được cấp. Chỉ nói "trong phạm vi kho được cấp quyền".
    - SELLABLE_RULE_UNAVAILABLE chặn việc kết luận oan ITEM_GROUP_NOT_SELLABLE khi cấu hình
      BR-STOCK-001 thiếu/sai.
    - PRODUCT_DIAGNOSTIC_INCONSISTENT: chẩn đoán bảo hợp lệ nhưng truy vấn danh mục vẫn không
      trả sản phẩm — fail-closed, không im lặng coi như bán được.
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

    DECLARE @DiagnosticContractVersion VARCHAR(40) = 'PRODUCT_ORDERABILITY_V1';

    IF NOT EXISTS (SELECT 1 FROM dbo.SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'Tài khoản không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType,
               'INVALID_USER' AS Code, @DiagnosticContractVersion AS DiagnosticContractVersion,
               CAST(0 AS BIT) AS IsOrderable, N'["INVALID_USER"]' AS ReasonCodesJson,
               SYSUTCDATETIME() AS EvaluatedAtUtc;
        RETURN;
    END;

    IF COALESCE(@ObjectID, '') = ''
       OR NOT EXISTS (SELECT 1 FROM dbo.AR_GetObjectByUserFnc(@Username) WHERE ObjectID = @ObjectID)
    BEGIN
        SELECT N'Khách hàng không thuộc phạm vi được cấp' AS Msg, 1 AS MsgType,
               'CUSTOMER_OUT_OF_SCOPE' AS Code, @DiagnosticContractVersion AS DiagnosticContractVersion,
               CAST(0 AS BIT) AS IsOrderable, N'["CUSTOMER_OUT_OF_SCOPE"]' AS ReasonCodesJson,
               SYSUTCDATETIME() AS EvaluatedAtUtc;
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

    /* Tìm kiếm rộng giữ nguyên hành vi cũ. Khi hỏi đích danh một @ItemID thì KHÔNG thoát sớm
       ở đây nữa — để khối chẩn đoán cuối procedure gom đủ mọi nguyên nhân rồi mới trả lời. */
    IF @ItemID = ''
       AND NOT EXISTS (SELECT 1 FROM #CandidateItems)
       AND NOT EXISTS
           (
               SELECT 1
               FROM dbo.AI_WarehouseByUserFnc(@Username, @StockAsOfUtc)
           )
    BEGIN
        SELECT N'Tài khoản chưa được phân quyền kho' AS Msg, 1 AS MsgType,
               'WAREHOUSE_SCOPE_REQUIRED' AS Code, @DiagnosticContractVersion AS DiagnosticContractVersion,
               CAST(0 AS BIT) AS IsOrderable, N'["WAREHOUSE_SCOPE_REQUIRED"]' AS ReasonCodesJson,
               SYSUTCDATETIME() AS EvaluatedAtUtc;
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
           I.RuleVersion AS StockRuleVersion,
           COALESCE(Promotion.ActivePromotionCount, 0) AS ActivePromotionCount,
           Promotion.PromotionSummary,
           COALESCE(Promotion.ActivePromotionsJson, N'[]') AS ActivePromotionsJson,
           Promotion.PromotionUpdatedAt,
           N'AI_ActivePromotionByUserFnc' AS PromotionDataSource
    INTO #OrderableItems
    FROM #CandidateItems I
    INNER JOIN RankedPrice P
            ON P.ItemID = I.ItemID
           AND P.PriceRank = 1
    OUTER APPLY
    (
        SELECT
            (SELECT COUNT_BIG(*) FROM dbo.AI_ActivePromotionByUserFnc(@Username, I.ItemID, @StockAsOfUtc)) AS ActivePromotionCount,
            STUFF
            (
                (
                    SELECT N' | ' + X.PromotionName + N': ' + COALESCE(X.PromotionBenefitText, X.BenefitDescription, N'Xem điều kiện chương trình')
                    FROM dbo.AI_ActivePromotionByUserFnc(@Username, I.ItemID, @StockAsOfUtc) X
                    ORDER BY X.Priority, X.PromotionCode, X.RuleOrder
                    FOR XML PATH(''), TYPE
                ).value('.', 'NVARCHAR(MAX)'),
                1, 3, N''
            ) AS PromotionSummary,
            (
                SELECT X.PromotionCode, X.PromotionName, X.ProgramType, X.EffectiveFrom, X.EffectiveTo,
                       X.RuleType, X.MinimumQuantity, X.MaximumQuantity, X.MinimumOrderAmount, X.MaximumOrderAmount,
                       X.DiscountPercent, X.GiftItemID, X.GiftItemName, X.GiftQuantity,
                       X.BenefitDescription, X.PromotionBenefitText, X.PromotionStatus
                FROM dbo.AI_ActivePromotionByUserFnc(@Username, I.ItemID, @StockAsOfUtc) X
                ORDER BY X.Priority, X.PromotionCode, X.RuleOrder
                FOR JSON PATH
            ) AS ActivePromotionsJson,
            (SELECT MAX(X.PromotionUpdatedAt) FROM dbo.AI_ActivePromotionByUserFnc(@Username, I.ItemID, @StockAsOfUtc) X) AS PromotionUpdatedAt
    ) Promotion
    WHERE P.UnitPrice IS NOT NULL
    ORDER BY I.ItemName;

    /* Có hàng để bán -> trả nguyên schema cũ, không đụng gì. */
    IF EXISTS (SELECT 1 FROM #OrderableItems)
    BEGIN
        SELECT * FROM #OrderableItems ORDER BY ItemName;
        RETURN;
    END;

    /* Tìm kiếm rộng không ra kết quả vẫn là danh sách rỗng như cũ — không phải lỗi,
       và cũng không có sản phẩm cụ thể nào để chẩn đoán. */
    IF @ItemID = ''
    BEGIN
        SELECT * FROM #OrderableItems;
        RETURN;
    END;

    /* ==================================================================================
       PRODUCT-DIAG-001 — chẩn đoán vì sao đúng sản phẩm này không lập đơn được.
       Mỗi điều kiện được đo ĐỘC LẬP để một tài khoản thiếu quyền kho không bị kết luận
       oan là "nhóm hàng không được bán".
       ================================================================================== */
    DECLARE @ItemExists BIT = 0;
    DECLARE @ItemDisabledAtBranch BIT = 0;
    DECLARE @DiagItemGroupID VARCHAR(50) = '';
    DECLARE @ActiveRuleVersion VARCHAR(30) = NULL;
    DECLARE @GroupSellable BIT = 0;
    DECLARE @WarehouseCount INT = 0;
    DECLARE @StockRowCount INT = 0;
    DECLARE @SellableStockCount INT = 0;
    DECLARE @PriceAnyCount INT = 0;
    DECLARE @PriceEffectiveCount INT = 0;

    SELECT @ItemExists = 1,
           @DiagItemGroupID = COALESCE(ItemGroupID, ''),
           @ItemDisabledAtBranch = CASE WHEN @BranchID = 'MB' THEN COALESCE(IsDisableMB, 0)
                                        WHEN @BranchID = 'MN' THEN COALESCE(IsDisableMN, 0)
                                        WHEN @BranchID = 'MT' THEN COALESCE(IsDisableMT, 0)
                                        ELSE COALESCE(IsDisable, 0) END
    FROM dbo.CF_ItemTbl
    WHERE ItemID = @ItemID;

    /* Rule version lấy ĐỘC LẬP với người dùng (cùng cách AI_WarehouseByUserFnc chọn), vì
       tài khoản thiếu quyền kho sẽ không có rule version nào để mà tra nhóm hàng. */
    SELECT TOP (1) @ActiveRuleVersion = C.RuleVersion
    FROM dbo.AI_BusinessRuleConfigTbl C
    WHERE C.RuleCode = 'BR-STOCK-001'
      AND C.Status = 'APPROVED'
      AND (C.EffectiveFrom IS NULL OR C.EffectiveFrom <= @StockAsOfUtc)
      AND (C.EffectiveTo IS NULL OR C.EffectiveTo > @StockAsOfUtc)
      AND C.ConfigKey IN ('SalesWarehouseIDs', 'ReservedOrderStatusIDs', 'GlobalUserGroupIDs',
                          'ManagerUserGroupIDs', 'SellableItemGroupIDs', 'UtcOffsetMinutes')
    GROUP BY C.RuleVersion
    HAVING COUNT(DISTINCT C.ConfigKey) = 6
    ORDER BY MAX(COALESCE(C.EffectiveFrom, CONVERT(DATETIME2(0), '19000101'))) DESC, C.RuleVersion DESC;

    IF @ActiveRuleVersion IS NOT NULL
       AND EXISTS
           (
               SELECT 1
               FROM dbo.AI_BusinessRuleConfigTbl C
               CROSS APPLY STRING_SPLIT(C.ConfigValue, ',') V
               WHERE C.RuleCode = 'BR-STOCK-001'
                 AND C.RuleVersion = @ActiveRuleVersion
                 AND C.ConfigKey = 'SellableItemGroupIDs'
                 AND LTRIM(RTRIM(V.value)) = @DiagItemGroupID
           )
        SET @GroupSellable = 1;

    SELECT @WarehouseCount = COUNT(*) FROM dbo.AI_WarehouseByUserFnc(@Username, @StockAsOfUtc);

    SELECT @StockRowCount = COUNT(*),
           @SellableStockCount = SUM(CASE WHEN S.AvailableStock > 0
                                           AND S.StockDataStatus = N'AVAILABLE_FOR_SALE'
                                          THEN 1 ELSE 0 END)
    FROM dbo.AI_StockAvailableByUserFnc(@Username, @ItemID, @StockAsOfUtc) S;
    SET @SellableStockCount = COALESCE(@SellableStockCount, 0);

    /* Ba tầng giá y như phần trên, nhưng đếm hai lần: có dòng nào không, và có dòng nào còn
       hiệu lực hôm nay không — để tách "chưa thiết lập bảng giá" khỏi "bảng giá hết hiệu lực". */
    ;WITH AllPrice AS
    (
        SELECT COALESCE(M.isDisable, 0) AS isDisable, M.FromDate, M.ToDate
        FROM dbo.AR_PriceObjectTbl X
        INNER JOIN dbo.AR_PriceDetailTbl Y ON Y.DocumentID = X.DocumentID AND Y.ItemID = @ItemID
        INNER JOIN dbo.AR_PriceTbl M ON M.DocumentID = X.DocumentID AND COALESCE(M.isObjectPrice, 0) = 1
        WHERE X.ObjectID = @ObjectID

        UNION ALL

        SELECT COALESCE(M.isDisable, 0), M.FromDate, M.ToDate
        FROM dbo.AR_PriceObjectGroupTbl X
        INNER JOIN dbo.AR_PriceDetailTbl Y ON Y.DocumentID = X.DocumentID AND Y.ItemID = @ItemID
        INNER JOIN dbo.AR_PriceTbl M ON M.DocumentID = X.DocumentID AND COALESCE(M.isObjectPrice, 0) = 1
        WHERE X.ObjectGroupID = @ObjectGroupID

        UNION ALL

        SELECT COALESCE(X.isDisable, 0), X.FromDate, X.ToDate
        FROM dbo.AR_PriceTbl X
        INNER JOIN dbo.AR_PriceDetailTbl Y ON Y.DocumentID = X.DocumentID AND Y.ItemID = @ItemID
        WHERE COALESCE(X.isObjectPrice, 0) = 0
    )
    SELECT @PriceAnyCount = COUNT(*),
           @PriceEffectiveCount = SUM(CASE WHEN isDisable = 0
                                            AND COALESCE(FromDate, '20000101') <= @ToDate
                                            AND COALESCE(ToDate, '20990101') >= @ToDate
                                           THEN 1 ELSE 0 END)
    FROM AllPrice;
    SET @PriceEffectiveCount = COALESCE(@PriceEffectiveCount, 0);

    /* Thứ tự ưu tiên CỐ ĐỊNH. Không phụ thuộc thứ tự truy vấn, không đổi giữa các lần chạy. */
    DECLARE @Reasons TABLE (Priority INT PRIMARY KEY, Code VARCHAR(60), Msg NVARCHAR(300));

    IF @ItemExists = 0
        INSERT @Reasons VALUES (10, 'ITEM_NOT_FOUND', N'Không tìm thấy sản phẩm trong danh mục.');

    IF @ItemExists = 1 AND @ItemDisabledAtBranch = 1
        INSERT @Reasons VALUES (20, 'ITEM_DISABLED_AT_BRANCH', N'Sản phẩm đang ngừng bán tại chi nhánh của bạn.');

    /* Thiếu cấu hình thì KHÔNG được kết luận nhóm hàng — đó là lỗi hệ thống, không phải lỗi sản phẩm. */
    IF @ItemExists = 1 AND @ActiveRuleVersion IS NULL
        INSERT @Reasons VALUES (30, 'SELLABLE_RULE_UNAVAILABLE',
            N'Cấu hình nhóm hàng được phép bán chưa sẵn sàng. Vui lòng báo quản trị hệ thống.');

    IF @ItemExists = 1 AND @ActiveRuleVersion IS NOT NULL AND @GroupSellable = 0
        INSERT @Reasons VALUES (40, 'ITEM_GROUP_NOT_SELLABLE', N'Nhóm sản phẩm này chưa được phép bán.');

    IF @WarehouseCount = 0
        INSERT @Reasons VALUES (50, 'WAREHOUSE_SCOPE_REQUIRED', N'Tài khoản chưa được phân quyền kho.');

    /* Không có kho thì mọi kết luận về tồn đều vô nghĩa: nói rõ là bị chặn từ lớp trên,
       không đổ cho sản phẩm hết hàng. */
    IF @ItemExists = 1 AND @WarehouseCount = 0
        INSERT @Reasons VALUES (60, 'STOCK_BLOCKED_BY_WAREHOUSE_SCOPE',
            N'Chưa đọc được tồn vì tài khoản chưa có kho nào được cấp quyền.');

    IF @ItemExists = 1 AND @WarehouseCount > 0 AND @StockRowCount = 0
        INSERT @Reasons VALUES (70, 'STOCK_NO_ROW', N'Chưa có dữ liệu tồn trong các kho được cấp quyền.');

    IF @ItemExists = 1 AND @WarehouseCount > 0 AND @StockRowCount > 0 AND @SellableStockCount = 0
        INSERT @Reasons VALUES (80, 'STOCK_ZERO_AVAILABLE',
            N'Tồn khả dụng đã bằng 0 trong phạm vi kho được cấp quyền.');

    IF @ItemExists = 1 AND @PriceAnyCount = 0
        INSERT @Reasons VALUES (90, 'PRICE_NOT_FOUND', N'Chưa thiết lập bảng giá áp dụng cho khách hàng này.');

    IF @ItemExists = 1 AND @PriceAnyCount > 0 AND @PriceEffectiveCount = 0
        INSERT @Reasons VALUES (100, 'PRICE_EXPIRED_OR_DISABLED',
            N'Có bảng giá nhưng chưa tới hiệu lực, đã hết hiệu lực hoặc đang bị khóa.');

    /* Fail-closed: không tìm ra nguyên nhân mà danh mục vẫn không trả sản phẩm nghĩa là
       lớp chẩn đoán và lớp truy vấn đang lệch nhau. Báo ra, không im lặng. */
    IF NOT EXISTS (SELECT 1 FROM @Reasons)
        INSERT @Reasons VALUES (999, 'PRODUCT_DIAGNOSTIC_INCONSISTENT',
            N'Không xác định được nguyên nhân. Vui lòng tải lại danh sách hàng và báo bộ phận kỹ thuật.');

    DECLARE @PrimaryCode VARCHAR(60);
    DECLARE @PrimaryMsg NVARCHAR(300);
    SELECT TOP (1) @PrimaryCode = Code, @PrimaryMsg = Msg FROM @Reasons ORDER BY Priority;

    SELECT @PrimaryMsg AS Msg,
           1 AS MsgType,
           @PrimaryCode AS Code,
           @DiagnosticContractVersion AS DiagnosticContractVersion,
           CAST(0 AS BIT) AS IsOrderable,
           /* Mảng JSON PHẲNG ["A","B"]. FOR JSON PATH trên một cột sẽ ra [{"Code":"A"}]
              nên không dùng được; STRING_AGG thì đòi SQL Server 2017. Mã nguyên nhân chỉ
              gồm A-Z và _ nên nối chuỗi trực tiếp là an toàn. */
           '[' + STUFF((SELECT ',"' + Code + '"' FROM @Reasons ORDER BY Priority FOR XML PATH('')), 1, 1, '') + ']' AS ReasonCodesJson,
           SYSUTCDATETIME() AS EvaluatedAtUtc;
END;
GO
