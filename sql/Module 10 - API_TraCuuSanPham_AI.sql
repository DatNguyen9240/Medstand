IF OBJECT_ID('API_TraCuuSanPham_AI', 'P') IS NOT NULL DROP PROCEDURE API_TraCuuSanPham_AI;
GO


CREATE PROCEDURE API_TraCuuSanPham_AI
    @SearchKey NVARCHAR(100) = '',
    @TopN      INT = 50
AS
BEGIN
    SET NOCOUNT ON;


    -- 1. Tìm các mã sản phẩm khớp từ khóa (Rất nhanh vì chỉ quét bảng danh mục)
    SELECT TOP (@TopN)
        I.ItemID,
        I.ItemName
    INTO #Items
    FROM CF_ItemTbl I
    WHERE (ISNULL(I.isDisable, 0) = 0)
      AND (
          @SearchKey = '' OR
          I.ItemID LIKE @SearchKey + '%' OR
          I.ItemID LIKE '%' + @SearchKey + '%' OR
          I.ItemName COLLATE Vietnamese_CI_AS LIKE N'%' + @SearchKey + N'%' OR
          ISNULL(I.TuKhoa, '') COLLATE Vietnamese_CI_AS LIKE N'%' + @SearchKey + N'%'
      )
      AND ISNULL(I.ItemGroupID, '') NOT IN ('KM', 'DV', 'VT', 'BB', 'Vat Tu', 'Bao Bi', 'TUI')
    ORDER BY I.ItemName ASC;


    -- 2. Tìm giá bán từ Bảng giá (Price List) - Thay thế cho lịch sử bán hàng
    -- Lấy bảng giá mới nhất đang có hiệu lực cho từng Item
    SELECT
        D.ItemID,
        MAX(H.FromDate) AS MaxFromDate
    INTO #LatestPriceHeader
    FROM AR_PriceDetailTbl D
    JOIN AR_PriceTbl H ON D.DocumentID = H.DocumentID
    WHERE H.isDisable = 0
      AND H.FromDate <= GETDATE()
      AND (H.ToDate IS NULL OR H.ToDate >= GETDATE())
      AND D.ItemID IN (SELECT ItemID FROM #Items)
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


    -- 3. Trả kết quả cuối cùng: STT, Mã sp, Sản phẩm, Đơn giá
    SELECT
        ROW_NUMBER() OVER (ORDER BY I.ItemName) AS [STT],
        I.ItemID AS [Mã sp],
        I.ItemName AS [Sản Phẩm],
        CAST(ISNULL(P.UnitPrice, 0) AS BIGINT) AS [Đơn Giá]
    FROM #Items I
    LEFT JOIN #FinalPrices P ON I.ItemID = P.ItemID;


    DROP TABLE #Items; DROP TABLE #LatestPriceHeader; DROP TABLE #FinalPrices;
END
GO
