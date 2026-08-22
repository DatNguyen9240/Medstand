USE medtest;
GO

CREATE OR ALTER PROCEDURE API_GoiYDonThuoc_AI
    @Username VARCHAR(50) = '',
    @timkiem NVARCHAR(500) = ''
AS
BEGIN
    SET NOCOUNT ON;
    SET ANSI_WARNINGS OFF;
    SET @timkiem = REPLACE(REPLACE(@timkiem, '"', ''), '''', '');

    IF NULLIF(LTRIM(RTRIM(@Username)), '') IS NULL
       OR NOT EXISTS (
           SELECT 1 FROM dbo.SY_User WITH (NOLOCK)
           WHERE UserName = @Username AND COALESCE(Disable, 0) = 0
       )
    BEGIN
        SELECT N'Phiên đăng nhập không xác định được tài khoản nội bộ. Vui lòng đăng nhập lại.' AS Msg,
               1 AS MsgType,
               N'OUT_OF_SCOPE' AS Severity;
        RETURN;
    END

    IF NULLIF(LTRIM(RTRIM(@timkiem)), '') IS NULL
    BEGIN
        SELECT N'Vui lòng chọn sản phẩm gốc hoặc nhập tên sản phẩm để xem gợi ý liên quan.' AS Msg,
               1 AS MsgType,
               N'VALIDATION_ERROR' AS Severity,
               N'MISSING_PRODUCT_KEYWORD' AS Code;
        RETURN;
    END

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
   
    -- Chuẩn hóa các liên từ nối tiếng Việt thành dấu phẩy đề phòng n8n chưa xử lý
    SET @timkiem = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(@timkiem, N' cùng với ', ','), N' Cùng with ', ','), N' đi kèm ', ','), N' Đi kèm ', ','), N' và ', ','), N' Và ', ',');
    SET @timkiem = REPLACE(REPLACE(REPLACE(REPLACE(@timkiem, N' với ', ','), N' Với ', ','), N' & ', ','), N' + ', ',');

    -- Map common symptoms to accent-free keywords matching 'An ngủ ngon Medstand'
    IF @timkiem LIKE N'%mất ngủ%' OR @timkiem LIKE N'%mat ngu%' OR @timkiem LIKE N'%ngủ%'
    BEGIN
        SET @timkiem = @timkiem + N',ngon'
    END
    IF @timkiem LIKE N'%mệt mỏi%' OR @timkiem LIKE N'%met moi%' OR @timkiem LIKE N'%mệt%'
    BEGIN
        SET @timkiem = @timkiem + N',ngon'
    END
    IF @timkiem LIKE N'%lười ăn%' OR @timkiem LIKE N'%luoi an%' 
       OR @timkiem LIKE N'%biếng ăn%' OR @timkiem LIKE N'%bieng an%'
       OR @timkiem LIKE N'%chán ăn%' OR @timkiem LIKE N'%chan an%'
       OR @timkiem LIKE N'%kén ăn%' OR @timkiem LIKE N'%ken an%'
       OR @timkiem LIKE N'%ăn kém%' OR @timkiem LIKE N'%an kem%'
       OR @timkiem LIKE N'%ăn ngon%' OR @timkiem LIKE N'%an ngon%'
    BEGIN
        SET @timkiem = @timkiem + N',ngon'
    END

    DECLARE @Keys TABLE (TuKhoa NVARCHAR(100));
    INSERT INTO @Keys (TuKhoa)
    SELECT CAST(value AS NVARCHAR(100))
    FROM STRING_SPLIT(REPLACE(@timkiem, ';', ','), ',') WHERE value != '';

    -- Xử lý triệt để dấu câu và khoảng trắng dư thừa từ Chatbot AI trả về
    UPDATE @Keys 
    SET TuKhoa = LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(TuKhoa, '.', ''), ',', ''), '-', '')));

    -- Loại bỏ các từ khóa chung chung (stop words) có thể gây khớp sai (ví dụ: 'thuốc' khớp với 'Thuốc ho Naomy')
    DELETE FROM @Keys
    WHERE TuKhoa IN (
        N'thuốc', N'thuoc', 
        N'uống', N'uong', 
        N'bác sĩ', N'bac si', N'bác sỹ', N'bac sy',
        N'cho', N'trị', N'tri', N'điều trị', N'dieu tri',
        N'bệnh', N'benh', N'bị', N'bi',
        N'em', N'bé', N'be', N'trẻ', N'tre', N'con',
        N'tui', N'tôi', N'toi', N'gì', N'gi', N'nào', N'nao'
    ) OR LEN(TuKhoa) <= 1;

    -- BẢNG 1: Tìm sản phẩm thay thế (Món khớp trực tiếp)
    DECLARE @Table1 TABLE (ItemID VARCHAR(50), ItemName NVARCHAR(500), Unit NVARCHAR(50), TuKhoa NVARCHAR(500), LyDoGoiY NVARCHAR(1000));
    
    INSERT INTO @Table1 (ItemID, ItemName, Unit, TuKhoa, LyDoGoiY)
    SELECT DISTINCT TOP 10
        CF.ItemID, CF.ItemName, CF.Unit, CF.TuKhoa,
        N'Gợi ý Medstand cho: ' + K.TuKhoa AS LyDoGoiY
    FROM CF_ItemTbl CF JOIN @Keys K ON (
        CF.ItemID = K.TuKhoa
        OR CF.ItemName LIKE N'%' + K.TuKhoa + N'%'
        OR N' ' + REPLACE(REPLACE(REPLACE(CF.ItemName, ',', ' '), '.', ' '), '-', ' ') + N' ' LIKE N'% ' + K.TuKhoa + N' %'
        OR N' ' + REPLACE(REPLACE(REPLACE(ISNULL(CF.TuKhoa,''), ',', ' '), '.', ' '), '-', ' ') + N' ' LIKE N'% ' + K.TuKhoa + N' %'
    )
    WHERE ISNULL(CF.isDisable, 0) = 0
      AND CASE WHEN @BranchID = 'MB' THEN COALESCE(CF.IsDisableMB, 0)
               WHEN @BranchID = 'MN' THEN COALESCE(CF.IsDisableMN, 0)
               WHEN @BranchID = 'MT' THEN COALESCE(CF.IsDisableMT, 0)
               ELSE COALESCE(CF.IsDisable, 0) END = 0
      AND EXISTS
      (
          SELECT 1
          FROM dbo.AI_BusinessRuleConfigTbl C
          CROSS APPLY STRING_SPLIT(C.ConfigValue, ',') V
          WHERE C.RuleCode = 'BR-STOCK-001'
            AND C.RuleVersion = @StockRuleVersion
            AND C.ConfigKey = 'SellableItemGroupIDs'
            AND C.Status = 'APPROVED'
            AND UPPER(LTRIM(RTRIM(V.value))) = UPPER(COALESCE(CF.ItemGroupID, ''))
      );

    -- SELECT * FROM #Table1; -- COMMENT ĐỂ TRÁNH CRASH N8N KHI TRẢ 2 BẢNG


    -- BẢNG 2: Bán chéo thông minh & Sản phẩm tương tự
    -- Lấy tên lõi của sản phẩm đầu tiên ở Bảng 1 để tìm hàng tương tự (Bỏ phần trong ngoặc)
    DECLARE @CoreName NVARCHAR(500) = ''
    SELECT TOP 1 @CoreName = LEFT(ItemName, CHARINDEX('(', ItemName + '(') - 1) FROM @Table1;
    SET @CoreName = LTRIM(RTRIM(@CoreName));

    DECLARE @FinalGoiY TABLE (ItemID VARCHAR(50), ItemName NVARCHAR(500), Unit NVARCHAR(50), CanhBaoAI NVARCHAR(1000), Priority INT);

    -- 2.1. Thêm sản phẩm tương tự (Cùng tên lõi nhưng chưa có ở Bảng 1)
    IF @CoreName != '' AND LEN(@CoreName) > 5
    BEGIN
        INSERT INTO @FinalGoiY (ItemID, ItemName, Unit, CanhBaoAI, Priority)
        SELECT TOP 2 ItemID, ItemName, Unit, N'SẢN PHẨM TƯƠNG TỰ: Gợi ý quy cách khác hoặc hàng cùng loại', 1
        FROM CF_ItemTbl
        WHERE ItemName LIKE @CoreName + '%'
          AND ItemID NOT IN (SELECT ItemID FROM @Table1)
          AND ISNULL(isDisable, 0) = 0
          AND CASE WHEN @BranchID = 'MB' THEN COALESCE(IsDisableMB, 0)
                   WHEN @BranchID = 'MN' THEN COALESCE(IsDisableMN, 0)
                   WHEN @BranchID = 'MT' THEN COALESCE(IsDisableMT, 0)
                   ELSE COALESCE(IsDisable, 0) END = 0
          AND EXISTS
          (
              SELECT 1
              FROM dbo.AI_BusinessRuleConfigTbl C
              CROSS APPLY STRING_SPLIT(C.ConfigValue, ',') V
              WHERE C.RuleCode = 'BR-STOCK-001'
                AND C.RuleVersion = @StockRuleVersion
                AND C.ConfigKey = 'SellableItemGroupIDs'
                AND C.Status = 'APPROVED'
                AND UPPER(LTRIM(RTRIM(V.value))) = UPPER(COALESCE(ItemGroupID, ''))
          );
    END

    -- 2.2. Logic bán chéo thông minh dựa trên lịch sử hóa đơn thực tế (Market Basket Analysis)
    INSERT INTO @FinalGoiY (ItemID, ItemName, Unit, CanhBaoAI, Priority)
    SELECT TOP 3 
        CF.ItemID, CF.ItemName, CF.Unit, 
        N'GỢI Ý BÁN KÈM: Sản phẩm thường xuyên "cặp bài trùng" trong cùng hóa đơn', 2
    FROM AR_InvoiceDetailTbl D
    JOIN AR_InvoiceTbl I ON D.DocumentID = I.DocumentID
    JOIN dbo.AR_GetObjectByUserFnc(@Username) AO ON AO.ObjectID = I.ObjectID
    JOIN AR_InvoiceDetailTbl D_Other ON I.DocumentID = D_Other.DocumentID
    JOIN CF_ItemTbl CF ON D_Other.ItemID = CF.ItemID
    WHERE D.ItemID IN (SELECT ItemID FROM @Table1)
      AND D_Other.ItemID NOT IN (SELECT ItemID FROM @Table1)
      AND D_Other.ItemID NOT IN (SELECT ItemID FROM @FinalGoiY)
      AND I.DocumentDate >= DATEADD(month, -6, GETDATE())
      AND I.StatusID IN (3, 6, 7, 8)
      AND ISNULL(CF.isDisable, 0) = 0
      AND CASE WHEN @BranchID = 'MB' THEN COALESCE(CF.IsDisableMB, 0)
               WHEN @BranchID = 'MN' THEN COALESCE(CF.IsDisableMN, 0)
               WHEN @BranchID = 'MT' THEN COALESCE(CF.IsDisableMT, 0)
               ELSE COALESCE(CF.IsDisable, 0) END = 0
      AND EXISTS
      (
          SELECT 1
          FROM dbo.AI_BusinessRuleConfigTbl C
          CROSS APPLY STRING_SPLIT(C.ConfigValue, ',') V
          WHERE C.RuleCode = 'BR-STOCK-001'
            AND C.RuleVersion = @StockRuleVersion
            AND C.ConfigKey = 'SellableItemGroupIDs'
            AND C.Status = 'APPROVED'
            AND UPPER(LTRIM(RTRIM(V.value))) = UPPER(COALESCE(CF.ItemGroupID, ''))
      )
    GROUP BY CF.ItemID, CF.ItemName, CF.Unit
    ORDER BY COUNT(DISTINCT I.DocumentID) DESC;

    -- Xóa cờ 2 bảng, dồn hết về bảng cuối
    -- @Table1 chỉ là sản phẩm gốc; không trả chính sản phẩm gốc như một gợi ý mới.

    -- Nếu không tìm thấy kết quả nào, trả về thông báo lỗi thân thiện để Chatbot hiển thị
    IF NOT EXISTS (SELECT 1 FROM @FinalGoiY)
    BEGIN
        IF EXISTS (SELECT 1 FROM @Table1)
        BEGIN
            DECLARE @RootProductName NVARCHAR(500) = NULL;
            SELECT TOP 1 @RootProductName = ItemName FROM @Table1 ORDER BY ItemName;
            SELECT CONCAT(
                       N'Đã tìm thấy sản phẩm gốc ', @RootProductName,
                       N' nhưng chưa có đủ hóa đơn hoàn tất trong phạm vi tài khoản để xác định sản phẩm thường mua kèm.'
                   ) AS Msg,
                   0 AS MsgType,
                   N'NO_DATA' AS Severity,
                   N'NO_RELATED_PRODUCT_HISTORY' AS Code;
        END
        ELSE
        BEGIN
            SELECT N'Không tìm thấy sản phẩm khớp với từ khóa. Hãy chọn sản phẩm từ danh sách hoặc kiểm tra lại tên.' AS Msg,
                   0 AS MsgType,
                   N'NO_DATA' AS Severity,
                   N'PRODUCT_NOT_FOUND' AS Code;
        END
        RETURN;
    END

    IF NOT EXISTS
    (
        SELECT 1
        FROM @FinalGoiY F
        CROSS APPLY
        (
            SELECT TOP (1) Stock.AvailableStock
            FROM dbo.AI_StockAvailableByUserFnc(@Username, F.ItemID, @StockAsOfUtc) Stock
            WHERE Stock.AvailableStock > 0
            ORDER BY Stock.AvailableStock DESC, Stock.StoreHouseID
        ) S
    )
    BEGIN
        SELECT N'Không có sản phẩm liên quan còn tồn khả dụng trong kho được phân quyền.' AS Msg,
               0 AS MsgType,
               N'NO_DATA' AS Severity,
               N'NO_SELLABLE_RELATED_PRODUCT' AS Code;
        RETURN;
    END;

    -- Chỉ xuất sản phẩm còn bán được tại một kho cụ thể.
    SELECT F.ItemID, F.ItemName, F.Unit, F.CanhBaoAI,
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
           P.UnitPrice,
           N'REFERENCE_ONLY_MEDICAL_REVIEW_REQUIRED' AS RecommendationStatus,
           N'Thông tin chỉ để tham khảo; không thay thế chẩn đoán, kê đơn hoặc tư vấn của người có chuyên môn.' AS MedicalDisclaimer
    FROM @FinalGoiY F
    CROSS APPLY
    (
        SELECT TOP (1) Stock.*
        FROM dbo.AI_StockAvailableByUserFnc(@Username, F.ItemID, @StockAsOfUtc) Stock
        WHERE Stock.AvailableStock > 0
        ORDER BY Stock.AvailableStock DESC, Stock.StoreHouseID
    ) S
    CROSS APPLY
    (
        SELECT TOP (1) D.UnitPrice
        FROM dbo.AR_PriceDetailTbl D
        JOIN dbo.AR_PriceTbl H ON H.DocumentID = D.DocumentID
        WHERE D.ItemID = F.ItemID
          AND COALESCE(H.isDisable, 0) = 0
          AND D.UnitPrice > 0
        ORDER BY
            CASE WHEN H.FromDate <= GETDATE()
                       AND (H.ToDate IS NULL OR H.ToDate >= GETDATE()) THEN 0 ELSE 1 END,
            H.FromDate DESC
    ) P
    ORDER BY F.Priority ASC, F.ItemName ASC;

END
GO
