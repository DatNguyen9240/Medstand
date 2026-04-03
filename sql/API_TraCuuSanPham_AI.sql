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

    -- 2. Tìm giá bán gần nhất cho duy nhất 50 món này (Kỹ thuật tối ưu JOIN)
    SELECT 
        ItemID, 
        MAX(DocumentID) AS MaxDocID 
    INTO #LatestDocs
    FROM AR_InvoiceDetailTbl 
    WHERE ItemID IN (SELECT ItemID FROM #Items)
    GROUP BY ItemID;

    SELECT 
        D.ItemID, 
        D.UnitPrice 
    INTO #FinalPrices
    FROM AR_InvoiceDetailTbl D
    JOIN #LatestDocs L ON D.DocumentID = L.MaxDocID AND D.ItemID = L.ItemID;

    -- 3. Trả kết quả cuối cùng: STT, Mã sp, Sản phẩm, Đơn giá
    SELECT 
        ROW_NUMBER() OVER (ORDER BY I.ItemName) AS [STT],
        I.ItemID AS [Mã sp],
        I.ItemName AS [Sản Phẩm],
        CAST(ISNULL(P.UnitPrice, 0) AS BIGINT) AS [Đơn Giá]
    FROM #Items I
    LEFT JOIN #FinalPrices P ON I.ItemID = P.ItemID;

    DROP TABLE #Items; DROP TABLE #LatestDocs; DROP TABLE #FinalPrices;
END
GO
