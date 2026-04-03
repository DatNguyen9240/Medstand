IF OBJECT_ID('API_TraCuuSanPham_AI', 'P') IS NOT NULL DROP PROCEDURE API_TraCuuSanPham_AI;
GO

CREATE PROCEDURE API_TraCuuSanPham_AI
    @SearchKey NVARCHAR(100) = '', 
    @TopN      INT = 50
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Lọc bảng tồn kho (SUM lại để tránh lặp dòng)
    SELECT ItemID, SUM(QuantityinStock) AS QuantityinStock
    INTO #TonKho
    FROM IV_StockTbl
    GROUP BY ItemID;

    -- 2. Tìm kiếm sản phẩm trong danh mục tổng
    SELECT TOP (@TopN)
        I.ItemID, 
        I.ItemName, 
        I.Unit, 
        I.ItemGroupID,
        CAST(ISNULL(S.QuantityinStock, 0) AS BIGINT) AS TonKho,
        (SELECT TOP 1 UnitPrice FROM AR_InvoiceDetailTbl WHERE ItemID = I.ItemID ORDER BY DocumentID DESC) AS GiaBanGanNhat
    FROM CF_ItemTbl I
    LEFT JOIN #TonKho S ON I.ItemID = S.ItemID
    WHERE (ISNULL(I.isDisable, 0) = 0) -- Chỉ lấy hàng đang kinh doanh
      AND (
          @SearchKey = '' OR 
          I.ItemID LIKE '%' + @SearchKey + '%' OR 
          I.ItemName COLLATE Vietnamese_CI_AS LIKE N'%' + @SearchKey + N'%' OR
          ISNULL(I.TuKhoa, '') COLLATE Vietnamese_CI_AS LIKE N'%' + @SearchKey + N'%'
      )
      -- Loại bỏ các nhóm hàng phụ trợ (Bao bì, túi, khuyến mại...)
      AND ISNULL(I.ItemGroupID, '') NOT IN ('KM', 'DV', 'VT', 'BB', 'Vat Tu', 'Bao Bi', 'TUI')
    ORDER BY I.ItemName ASC;

    DROP TABLE #TonKho;
END
GO
