IF OBJECT_ID('API_TraCuuSanPham_AI', 'P') IS NOT NULL DROP PROCEDURE API_TraCuuSanPham_AI;
GO


CREATE PROCEDURE API_TraCuuSanPham_AI
    @Username VARCHAR(50) = '',
    @timkiem NVARCHAR(100) = '',
    @TopN      INT = 50
AS
BEGIN
    SET NOCOUNT ON;

    -- Xử lý triệt để dấu câu và khoảng trắng dư thừa
    SET @timkiem = LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(@timkiem, '.', ''), ',', ''), '-', '')));

    -- 1. Tìm các mã sản phẩm khớp từ khóa (Rất nhanh vì chỉ quét bảng danh mục)
    SELECT TOP (@TopN)
        I.ItemID,
        I.ItemName
    INTO #Items
    FROM CF_ItemTbl I
    WHERE (ISNULL(I.isDisable, 0) = 0)
      AND (
          @timkiem = '' OR
          I.ItemID LIKE @timkiem + '%' OR
          I.ItemID LIKE '%' + @timkiem + '%' OR
          I.ItemName COLLATE Vietnamese_CI_AS LIKE N'%' + @timkiem + N'%' OR
          ISNULL(I.TuKhoa, '') COLLATE Vietnamese_CI_AS LIKE N'%' + @timkiem + N'%'
      )
      AND ISNULL(I.ItemGroupID, '') NOT IN ('KM', 'DV', 'VT', 'BB', 'Vat Tu', 'Bao Bi', 'TUI')
    ORDER BY I.ItemName ASC;


    -- 2. Tìm giá bán từ Bảng giá (Price List) - Thay thế cho lịch sử bán hàng
    -- Lấy bảng giá mới nhất đang có hiệu lực hoặc gần đây nhất cho từng Item
    SELECT
        D.ItemID,
        MAX(H.FromDate) AS MaxFromDate
    INTO #LatestPriceHeader
    FROM AR_PriceDetailTbl D
    JOIN AR_PriceTbl H ON D.DocumentID = H.DocumentID
    WHERE H.isDisable = 0
      AND D.ItemID IN (SELECT ItemID FROM #Items)
      -- Ưu tiên bảng giá đang chạy, nếu không có thì lấy bảng giá gần nhất
      AND (
          EXISTS (
              SELECT 1 
              FROM AR_PriceDetailTbl D2
              JOIN AR_PriceTbl H2 ON D2.DocumentID = H2.DocumentID
              WHERE H2.isDisable = 0 
                AND H2.FromDate <= GETDATE() 
                AND (H2.ToDate IS NULL OR H2.ToDate >= GETDATE())
                AND D2.ItemID = D.ItemID
          ) AND H.FromDate <= GETDATE() AND (H.ToDate IS NULL OR H.ToDate >= GETDATE())
          OR
          NOT EXISTS (
              SELECT 1 
              FROM AR_PriceDetailTbl D2
              JOIN AR_PriceTbl H2 ON D2.DocumentID = H2.DocumentID
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
    FROM AR_PriceDetailTbl D
    JOIN AR_PriceTbl H ON D.DocumentID = H.DocumentID
    JOIN #LatestPriceHeader L ON D.ItemID = L.ItemID AND H.FromDate = L.MaxFromDate
    WHERE H.isDisable = 0
    GROUP BY D.ItemID;


    -- 3. Trả kết quả cuối cùng: STT, Mã sp, Sản phẩm, Đơn Giá, Tồn Kho
    IF NOT EXISTS (SELECT 1 FROM #Items)
    BEGIN
        SELECT
            1 AS [STT],
            'N/A' AS [Mã sp],
            N'Không tìm thấy sản phẩm' AS [Sản Phẩm],
            0 AS [Đơn Giá],
            0 AS [Tồn Kho];
    END
    ELSE
    BEGIN
        SELECT
            ROW_NUMBER() OVER (ORDER BY I.ItemName) AS [STT],
            I.ItemID AS [Mã sp],
            I.ItemName AS [Sản Phẩm],
            CAST(ISNULL(P.UnitPrice, 0) AS BIGINT) AS [Đơn Giá],
            ISNULL((SELECT SUM(QuantityinStock) FROM IV_StockTbl WHERE ItemID = I.ItemID), 0) AS [Tồn Kho]
        FROM #Items I
        LEFT JOIN #FinalPrices P ON I.ItemID = P.ItemID;
    END


    DROP TABLE #Items; DROP TABLE #LatestPriceHeader; DROP TABLE #FinalPrices;
END
GO
