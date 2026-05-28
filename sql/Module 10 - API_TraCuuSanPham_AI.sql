IF OBJECT_ID('API_TraCuuSanPham_AI', 'P') IS NOT NULL DROP PROCEDURE API_TraCuuSanPham_AI;
GO


CREATE PROCEDURE API_TraCuuSanPham_AI
    @Username VARCHAR(50) = '',
    @timkiem NVARCHAR(100) = '',
    @TopN      INT = 50
AS
BEGIN
    SET NOCOUNT ON;

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
        -- Tính toán thứ tự sắp xếp thông minh theo độ liên quan
        ROW_NUMBER() OVER (
            ORDER BY 
              -- 1. Ưu tiên khớp toàn bộ cụm từ tìm kiếm trước
              CASE 
                WHEN I.ItemName COLLATE Vietnamese_CI_AS LIKE @timkiem + N'%' THEN 1
                WHEN I.ItemName COLLATE Vietnamese_CI_AS LIKE N'%' + @timkiem + N'%' THEN 2
                ELSE 3
              END ASC,
              -- 2. Ưu tiên khớp nhiều từ khóa nhất (giải quyết triệt để lỗi phân tách từ khóa của AI gây nhiễu)
              (
                  SELECT COUNT(DISTINCT T.Term) 
                  FROM @Terms T 
                  WHERE N' ' + REPLACE(REPLACE(REPLACE(I.ItemName, ',', ' '), '.', ' '), '-', ' ') + N' ' COLLATE Vietnamese_CI_AS LIKE N'% ' + T.Term + N' %' 
                     OR N' ' + REPLACE(REPLACE(REPLACE(ISNULL(I.TuKhoa, ''), ',', ' '), '.', ' '), '-', ' ') + N' ' COLLATE Vietnamese_CI_AS LIKE N'% ' + T.Term + N' %'
              ) DESC,
              I.ItemName ASC
        ) AS OrderIndex
    INTO #Items
    FROM CF_ItemTbl I WITH (NOLOCK)
    WHERE (ISNULL(I.isDisable, 0) = 0)
      AND (
          @timkiem = '' OR
          I.ItemID LIKE @timkiem + '%' OR
          I.ItemID LIKE '%' + @timkiem + '%' OR
          I.ItemName COLLATE Vietnamese_CI_AS LIKE N'%' + @timkiem + N'%' OR
          ISNULL(I.TuKhoa, '') COLLATE Vietnamese_CI_AS LIKE N'%' + @timkiem + N'%' OR
          EXISTS (
              SELECT 1 FROM @Terms T 
              WHERE N' ' + REPLACE(REPLACE(REPLACE(I.ItemName, ',', ' '), '.', ' '), '-', ' ') + N' ' COLLATE Vietnamese_CI_AS LIKE N'% ' + T.Term + N' %' 
                 OR N' ' + REPLACE(REPLACE(REPLACE(ISNULL(I.TuKhoa, ''), ',', ' '), '.', ' '), '-', ' ') + N' ' COLLATE Vietnamese_CI_AS LIKE N'% ' + T.Term + N' %'
          )
      )
      AND ISNULL(I.ItemGroupID, '') = 'HH1';


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
            ROW_NUMBER() OVER (ORDER BY I.OrderIndex ASC) AS [STT],
            I.ItemID AS [Mã sp],
            I.ItemName AS [Sản Phẩm],
            CAST(ISNULL(P.UnitPrice, 0) AS BIGINT) AS [Đơn Giá],
            ISNULL((SELECT SUM(QuantityinStock) FROM IV_StockTbl WITH (NOLOCK) WHERE ItemID = I.ItemID), 0) AS [Tồn Kho]
        FROM #Items I
        LEFT JOIN #FinalPrices P ON I.ItemID = P.ItemID
        ORDER BY I.OrderIndex ASC;
    END


    DROP TABLE #Items; DROP TABLE #LatestPriceHeader; DROP TABLE #FinalPrices;
END
GO