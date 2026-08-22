CREATE OR ALTER PROCEDURE API_TraCuuSanPham_AI
    @Username VARCHAR(50) = '',
    @timkiem NVARCHAR(100) = '',
    @TopN      INT = 50
AS
BEGIN
    SET NOCOUNT ON;

    -- ═══ GUARD: dọn temp table còn sót lại từ request lỗi trước trên cùng connection ═══
    IF OBJECT_ID('tempdb..#MatchedItems') IS NOT NULL DROP TABLE #MatchedItems;
    IF OBJECT_ID('tempdb..#Items') IS NOT NULL DROP TABLE #Items;
    IF OBJECT_ID('tempdb..#LatestPriceHeader') IS NOT NULL DROP TABLE #LatestPriceHeader;
    IF OBJECT_ID('tempdb..#FinalPrices') IS NOT NULL DROP TABLE #FinalPrices;
    IF OBJECT_ID('tempdb..#AIStock') IS NOT NULL DROP TABLE #AIStock;

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

    SET @timkiem = LTRIM(RTRIM(ISNULL(@timkiem, '')));
    IF @timkiem = ''
    BEGIN
        SELECT
            CAST(0 AS bit) AS [Success],
            'VALIDATION_ERROR' AS [Code],
            N'Vui lòng nhập từ khóa hoặc triệu chứng cần tìm.' AS [Message],
            0 AS [Count];
        RETURN;
    END;

    -- LOG FOR AUDITING
    EXEC AI_WriteAuditLog
        @Username     = @Username,
        @ActionType   = 'AI_QUERY',
        @TargetEntity = 'API_TraCuuSanPham_AI',
        @TargetID     = NULL,
        @TargetName   = @timkiem,
        @ExtraInfo    = NULL;

    -- Xử lý triệt để dấu câu và khoảng trắng dư thừa cho từ khóa tìm kiếm gốc
    SET @timkiem = LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(@timkiem, '.', ''), ',', ''), '-', ''), '"', ''), '''', '')));

    -- Clean and split keyword using stop words
    DECLARE @Terms TABLE (Term NVARCHAR(100));
    DECLARE @StopWords TABLE (Word NVARCHAR(100));
    INSERT INTO @StopWords (Word) VALUES 
    (N'và'), (N'của'), (N'thuốc'), (N'bị'), (N'cho'), (N'nên'), (N'uống'), (N'gì'), (N'tư'), (N'vấn'), 
    (N'thành'), (N'phần'), (N'công'), (N'dụng'), (N'giá'), (N'tìm'), (N'hiệu'), (N'quả'), (N'tốt'), 
    (N'nhất'), (N'có'), (N'thể'), (N'được'), (N'là'), (N'trong'), (N'với'), (N'cùng'), (N'đi'), 
    (N'kèm'), (N'khách'), (N'em'), (N'tôi'), (N'mình'), (N'bác'), (N'sĩ'), (N'nhà'), (N'hỏi'), 
    (N'muốn'), (N'mua'), (N'bán'), (N'thông'), (N'tin'), (N'chi'), (N'tiết'), (N'sản'),
    (N'thì'), (N'ở'), (N'hộ'), (N'giúp'), (N'bởi'), (N'vì'), (N'như'), (N'thế'), (N'nào'), (N'a'), (N'ạ');

    DECLARE @clean_timkiem NVARCHAR(200) = @timkiem;
    SET @clean_timkiem = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(@clean_timkiem, N' cùng với ', ' '), N' Cùng với ', ' '), N' đi kèm ', ' '), N' Đi kèm ', ' '), N' và ', ' '), N' Và ', ' ');
    SET @clean_timkiem = REPLACE(REPLACE(REPLACE(REPLACE(@clean_timkiem, N' với ', ' '), N' Với ', ' '), N' & ', ' '), N' + ', ' ');
    SET @clean_timkiem = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(@clean_timkiem, '.', ' '), ',', ' '), '-', ' '), '?', ' '), '!', ' '), ':', ' ');
    SET @clean_timkiem = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(@clean_timkiem, ';', ' '), '(', ' '), ')', ' '), '[', ' '), ']', ' ');

    INSERT INTO @Terms (Term)
    SELECT DISTINCT LTRIM(RTRIM(value))
    FROM STRING_SPLIT(@clean_timkiem, ' ')
    WHERE LTRIM(RTRIM(value)) <> '' 
      AND LTRIM(RTRIM(value)) NOT IN (SELECT Word FROM @StopWords);

    -- 1. Tìm các mã sản phẩm khớp từ khóa (Rất nhanh vì chỉ quét bảng danh mục)
    SELECT TOP (@TopN)
        I.ItemID,
        I.ItemName,
        CASE 
          WHEN REPLACE(I.ItemName, ' ', '') COLLATE Vietnamese_CI_AS LIKE REPLACE(@timkiem, ' ', '') + N'%' THEN 100
          WHEN REPLACE(I.ItemName, ' ', '') COLLATE Vietnamese_CI_AS LIKE N'%' + REPLACE(@timkiem, ' ', '') + N'%' THEN 80
          WHEN ISNULL(I.TuKhoa, '') COLLATE Vietnamese_CI_AS LIKE N'%' + @timkiem + N'%' THEN 80
          ELSE (
              SELECT COUNT(DISTINCT T.Term) * 10 
              FROM @Terms T 
              WHERE N' ' + REPLACE(REPLACE(REPLACE(I.ItemName, ',', ' '), '.', ' '), '-', ' ') + N' ' COLLATE Vietnamese_CI_AS LIKE N'% ' + T.Term + N' %' 
                 OR N' ' + REPLACE(REPLACE(REPLACE(ISNULL(I.TuKhoa, ''), ',', ' '), '.', ' '), '-', ' ') + N' ' COLLATE Vietnamese_CI_AS LIKE N'% ' + T.Term + N' %'
          )
        END AS MatchScore
    INTO #MatchedItems
    FROM CF_ItemTbl I WITH (NOLOCK)
    WHERE (ISNULL(I.isDisable, 0) = 0)
      AND CASE WHEN @BranchID = 'MB' THEN COALESCE(I.IsDisableMB, 0)
               WHEN @BranchID = 'MN' THEN COALESCE(I.IsDisableMN, 0)
               WHEN @BranchID = 'MT' THEN COALESCE(I.IsDisableMT, 0)
               ELSE COALESCE(I.IsDisable, 0) END = 0
      AND (
          @timkiem = '' OR
          I.ItemID LIKE @timkiem + '%' OR
          I.ItemID LIKE '%' + @timkiem + '%' OR
          I.ItemName COLLATE Vietnamese_CI_AS LIKE N'%' + @timkiem + N'%' OR
          REPLACE(I.ItemName, ' ', '') COLLATE Vietnamese_CI_AS LIKE N'%' + REPLACE(@timkiem, ' ', '') + N'%' OR
          ISNULL(I.TuKhoa, '') COLLATE Vietnamese_CI_AS LIKE N'%' + @timkiem + N'%' OR
          EXISTS (
              SELECT 1 FROM @Terms T 
              WHERE N' ' + REPLACE(REPLACE(REPLACE(I.ItemName, ',', ' '), '.', ' '), '-', ' ') + N' ' COLLATE Vietnamese_CI_AS LIKE N'% ' + T.Term + N' %' 
                 OR N' ' + REPLACE(REPLACE(REPLACE(ISNULL(I.TuKhoa, ''), ',', ' '), '.', ' '), '-', ' ') + N' ' COLLATE Vietnamese_CI_AS LIKE N'% ' + T.Term + N' %'
          )
      )
      AND EXISTS
      (
          SELECT 1
          FROM dbo.AI_BusinessRuleConfigTbl C
          CROSS APPLY STRING_SPLIT(C.ConfigValue, ',') S
          WHERE C.RuleCode = 'BR-STOCK-001'
            AND C.RuleVersion = @StockRuleVersion
            AND C.ConfigKey = 'SellableItemGroupIDs'
            AND C.Status = 'APPROVED'
            AND UPPER(LTRIM(RTRIM(S.value))) = UPPER(COALESCE(I.ItemGroupID, ''))
      );

    DECLARE @MaxScore INT = 0;
    SELECT @MaxScore = MAX(MatchScore) FROM #MatchedItems;

    SELECT TOP (@TopN)
        ItemID,
        ItemName,
        ROW_NUMBER() OVER (ORDER BY MatchScore DESC, ItemName ASC) AS OrderIndex
    INTO #Items
    FROM #MatchedItems
    WHERE MatchScore = @MaxScore OR (@MaxScore < 80 AND MatchScore > 0);

    DROP TABLE #MatchedItems;

    SELECT
        S.*,
        ROW_NUMBER() OVER
        (
            PARTITION BY S.ItemID
            ORDER BY S.AvailableStock DESC, S.StoreHouseID
        ) AS StockRank
    INTO #AIStock
    FROM dbo.AI_StockAvailableByUserFnc(@Username, '', @StockAsOfUtc) S
    JOIN #Items I ON I.ItemID = S.ItemID
    WHERE S.AvailableStock > 0;


    -- 2. Tìm giá bán từ Bảng giá (Price List) - Thay thế cho lịch sử bán hàng
    -- Lấy bảng giá mới nhất đang có hiệu lực hoặc gần đây nhất cho từng Item
    SELECT
        D.ItemID,
        MAX(H.FromDate) AS MaxFromDate
    INTO #LatestPriceHeader
    FROM AR_PriceDetailTbl D WITH (NOLOCK)
    JOIN AR_PriceTbl H WITH (NOLOCK) ON D.DocumentID = H.DocumentID
    WHERE H.isDisable = 0
      AND D.ItemID IN (SELECT ItemID FROM #Items)
      -- Ưu tiên bảng giá đang chạy, nếu không có thì lấy bảng giá gần nhất
      AND (
          EXISTS (
              SELECT 1 
              FROM AR_PriceDetailTbl D2 WITH (NOLOCK)
              JOIN AR_PriceTbl H2 WITH (NOLOCK) ON D2.DocumentID = H2.DocumentID
              WHERE H2.isDisable = 0 
                AND H2.FromDate <= GETDATE() 
                AND (H2.ToDate IS NULL OR H2.ToDate >= GETDATE())
                AND D2.ItemID = D.ItemID
          ) AND H.FromDate <= GETDATE() AND (H.ToDate IS NULL OR H.ToDate >= GETDATE())
          OR
          NOT EXISTS (
              SELECT 1 
              FROM AR_PriceDetailTbl D2 WITH (NOLOCK)
              JOIN AR_PriceTbl H2 WITH (NOLOCK) ON D2.DocumentID = H2.DocumentID
              WHERE H2.isDisable = 0 
                AND H2.FromDate <= GETDATE() 
                AND (H2.ToDate IS NULL OR H2.ToDate >= GETDATE())
                AND D2.ItemID = D.ItemID
          )
      )
    GROUP BY D.ItemID;


    SELECT
        D.ItemID,
        MAX(D.UnitPrice) AS UnitPrice -- Đề phòng 1 bảng giá có 2 dòng cùng Item
    INTO #FinalPrices
    FROM AR_PriceDetailTbl D WITH (NOLOCK)
    JOIN AR_PriceTbl H WITH (NOLOCK) ON D.DocumentID = H.DocumentID
    JOIN #LatestPriceHeader L ON D.ItemID = L.ItemID AND H.FromDate = L.MaxFromDate
    WHERE H.isDisable = 0
    GROUP BY D.ItemID;


    -- 3. Trả kết quả. Không suy tồn khả dụng từ tồn vật lý khi chưa có
    -- reservation/blocked/damaged/expired và warehouse scope đã xác minh.
    IF NOT EXISTS
    (
        SELECT 1
        FROM #Items I
        JOIN #AIStock S ON S.ItemID = I.ItemID AND S.StockRank = 1
        JOIN #FinalPrices P ON P.ItemID = I.ItemID AND P.UnitPrice > 0
    )
    BEGIN
        SELECT
            CAST(NULL AS BIGINT) AS [STT],
            CAST(NULL AS VARCHAR(50)) AS [Mã sp],
            CAST(NULL AS NVARCHAR(500)) AS [Sản Phẩm],
            CAST(NULL AS BIGINT) AS [Đơn Giá],
            CAST(NULL AS DECIMAL(18, 2)) AS PhysicalStock,
            CAST(NULL AS DECIMAL(18, 2)) AS ReservedStock,
            CAST(NULL AS DECIMAL(18, 2)) AS AvailableStock,
            CAST(NULL AS VARCHAR(50)) AS StoreHouseID,
            CAST(NULL AS NVARCHAR(200)) AS StoreHouseName,
            CAST(NULL AS NVARCHAR(50)) AS WarehouseScope,
            CAST(NULL AS DATETIME2(0)) AS StockUpdatedAt,
            CAST(NULL AS DATETIME2(0)) AS StockAsOfAt,
            CAST(NULL AS DATETIME) AS LatestStockMovementDate,
            CAST(NULL AS NVARCHAR(50)) AS StockDataStatus,
            CAST(NULL AS BIGINT) AS ActivePromotionCount,
            CAST(NULL AS NVARCHAR(MAX)) AS PromotionSummary,
            CAST(NULL AS NVARCHAR(MAX)) AS ActivePromotionsJson,
            CAST(NULL AS DATETIME2(0)) AS PromotionUpdatedAt,
            CAST(NULL AS NVARCHAR(100)) AS PromotionDataSource,
            CAST(NULL AS NVARCHAR(100)) AS RecommendationStatus,
            CAST(NULL AS NVARCHAR(500)) AS MedicalDisclaimer,
            CAST(NULL AS NVARCHAR(50)) AS RuleVersion,
            CAST(NULL AS NVARCHAR(100)) AS DataSource
        WHERE 1 = 0;
    END
    ELSE
    BEGIN
        SELECT
            ROW_NUMBER() OVER (ORDER BY I.OrderIndex ASC) AS [STT],
            I.ItemID AS [Mã sp],
            I.ItemName AS [Sản Phẩm],
            CAST(ISNULL(P.UnitPrice, 0) AS BIGINT) AS [Đơn Giá],
            S.PhysicalStock,
            S.ReservedStock,
            S.AvailableStock,
            S.StoreHouseID,
            S.StoreHouseName,
            S.WarehouseScope,
            S.StockUpdatedAt,
            S.StockAsOfAt,
            S.LatestStockMovementDate,
            S.StockDataStatus,
            COALESCE(Promotion.ActivePromotionCount, 0) AS ActivePromotionCount,
            Promotion.PromotionSummary,
            COALESCE(Promotion.ActivePromotionsJson, N'[]') AS ActivePromotionsJson,
            Promotion.PromotionUpdatedAt,
            N'AI_ActivePromotionByUserFnc' AS PromotionDataSource,
            K.Ingredients AS [Thành Phần],
            K.MainUses AS [Công Dụng],
            K.TargetPatients AS [Đối Tượng],
            K.UsageInstructions AS [Cách Dùng],
            K.Contraindications AS [Chống Chỉ Định],
            K.SideEffects AS [Tác Dụng Phụ],
            N'REFERENCE_ONLY_MEDICAL_REVIEW_REQUIRED' AS RecommendationStatus,
            N'Thông tin chỉ để tham khảo; không thay thế chẩn đoán, kê đơn hoặc tư vấn của người có chuyên môn.' AS MedicalDisclaimer,
            N'BR-MED-V1-DRAFT' AS RuleVersion,
            S.RuleVersion AS StockRuleVersion,
            N'API_TraCuuSanPham_AI' AS DataSource,
            S.StockDataSource
        FROM #Items I
        JOIN #FinalPrices P ON I.ItemID = P.ItemID AND P.UnitPrice > 0
        JOIN #AIStock S ON S.ItemID = I.ItemID AND S.StockRank = 1
        LEFT JOIN dbo.AI_ProductKnowledgeTbl K ON I.ItemID = K.ItemID
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
        ORDER BY I.OrderIndex ASC;
    END


    DROP TABLE #Items; DROP TABLE #LatestPriceHeader; DROP TABLE #FinalPrices; DROP TABLE #AIStock;
END
GO
