IF OBJECT_ID('API_SanPhamTrongTam_AI', 'P') IS NOT NULL DROP PROCEDURE API_SanPhamTrongTam_AI;
GO


CREATE PROCEDURE API_SanPhamTrongTam_AI
    @Username   VARCHAR(50),
    @MaKhachHang  VARCHAR(50) = '', -- Mã khách hàng
    @TopN       INT = 500         
AS
BEGIN
    SET NOCOUNT ON;


    -- 1. Xác định chương trình đang hoạt động
    DECLARE @ProgramID VARCHAR(50) = ''
    SELECT TOP 1 @ProgramID = DocumentID FROM AR_SanPhamTrongTamTbl
    WHERE GETDATE() BETWEEN FromDate AND ToDate OR ToDate >= CAST(GETDATE() AS DATE)
    ORDER BY ToDate DESC


    -- 2. Kết quả Bảng 1: TRẠNG THÁI & LỘ TRÌNH
    DECLARE @ProgramInfo TABLE (DocumentID VARCHAR(50), TenChuongTrinh NVARCHAR(200), FromDate DATETIME, ToDate DATETIME)
    INSERT INTO @ProgramInfo SELECT DocumentID, Memo, FromDate, ToDate FROM AR_SanPhamTrongTamTbl WHERE DocumentID = @ProgramID;

    DECLARE @CurrentSales BIGINT = 0;
    SELECT @CurrentSales = CAST(ISNULL(SUM(AmountTotal), 0) AS BIGINT)
    FROM AR_InvoiceTbl
    WHERE ObjectID = @MaKhachHang AND StatusID <> 10
      AND MONTH(DocumentDate) = MONTH(GETDATE()) AND YEAR(DocumentDate) = YEAR(GETDATE());

    -- Nén thang quà tặng thành chuỗi mũi tên trực quan
    DECLARE @GiftLadder NVARCHAR(MAX) = ''
    SET @GiftLadder = STUFF((
        SELECT ' -> [' + CAST(CAST(TuDiem AS BIGINT) AS VARCHAR(20)) + ': ' + QuaTang + ']'
        FROM AR_PromotionGiftTbl
        WHERE DocumentID = @ProgramID
        ORDER BY TuDiem ASC
        FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 4, '')

    ;WITH NextGoal AS (
        SELECT TOP 1 TuDiem, QuaTang FROM AR_PromotionGiftTbl
        WHERE DocumentID = @ProgramID AND TuDiem > @CurrentSales ORDER BY TuDiem ASC
    )
    SELECT 
        P.TenChuongTrinh AS [Chương Trình],
        P.FromDate AS [Từ Ngày], P.ToDate AS [Đến Ngày],
        @MaKhachHang AS [Mã Khách], 
        @CurrentSales AS [Doanh Số Hiện Tại],
        CAST(ISNULL(G.TuDiem, 0) AS BIGINT) AS [Mốc Kế Tiếp],
        CASE WHEN G.TuDiem IS NOT NULL THEN CAST(G.TuDiem - @CurrentSales AS BIGINT) ELSE 0 END AS [Còn Thiếu],
        ISNULL(G.QuaTang, N'Đã đạt mốc cao nhất') AS [Quà Kế Tiếp],
        ISNULL(@GiftLadder, N'') AS [Thang Quà Tặng Toàn Bộ]
    FROM @ProgramInfo P
    LEFT JOIN NextGoal G ON 1=1;


    -- 3. Kết quả Bảng 2: DANH MỤC SẢN PHẨM TRỌNG TÂM
    SELECT TOP (@TopN)
        D.ItemID AS [Mã sp], 
        I.ItemName AS [Sản Phẩm], 
        I.Unit AS [ĐVT],
        ISNULL((SELECT SUM(QuantityinStock) FROM IV_StockTbl WHERE ItemID = D.ItemID), 0) AS [Tồn Kho],
        CAST(ISNULL((
            SELECT TOP 1 P.UnitPrice FROM AR_PriceDetailTbl P 
            JOIN AR_PriceTbl H ON P.DocumentID = H.DocumentID
            WHERE P.ItemID = D.ItemID AND H.isDisable = 0 AND H.FromDate <= GETDATE()
            ORDER BY H.FromDate DESC
        ), 0) AS BIGINT) AS [Giá Bán]
    FROM AR_SanPhamTrongTamDetailTbl D
    JOIN CF_ItemTbl I ON D.ItemID = I.ItemID
    WHERE D.DocumentID = @ProgramID
    ORDER BY I.ItemName ASC;
END
GO
