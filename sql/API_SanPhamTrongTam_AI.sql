IF OBJECT_ID('API_SanPhamTrongTam_AI', 'P') IS NOT NULL DROP PROCEDURE API_SanPhamTrongTam_AI;
GO

CREATE PROCEDURE API_SanPhamTrongTam_AI
    @Username VARCHAR(50),
    @ObjectID VARCHAR(50) = '', -- Mã khách hàng
    @TopN     INT = 500         -- Lấy hết danh sách để AI tự xử lý
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Xác định chương trình đang hoạt động
    DECLARE @ProgramID VARCHAR(50) = ''
    SELECT TOP 1 @ProgramID = DocumentID FROM AR_SanPhamTrongTamTbl 
    WHERE GETDATE() BETWEEN FromDate AND ToDate OR ToDate >= CAST(GETDATE() AS DATE)
    ORDER BY ToDate DESC

    -- 2. Kết quả Bảng 1: Header Chương trình
    SELECT DocumentID, Memo AS TenChuongTrinh, FromDate, ToDate 
    FROM AR_SanPhamTrongTamTbl WHERE DocumentID = @ProgramID;

    -- 3. Kết quả Bảng 2: Doanh số thực tế của khách trong tháng
    SELECT 
        @ObjectID AS ObjectID,
        CAST(ISNULL(SUM(AmountTotal), 0) AS BIGINT) AS DoanhSoThangNay
    FROM AR_InvoiceTbl 
    WHERE ObjectID = @ObjectID 
      AND StatusID <> 10 
      AND MONTH(DocumentDate) = MONTH(GETDATE()) 
      AND YEAR(DocumentDate) = YEAR(GETDATE());

    -- 4. Kết quả Bảng 3: Danh sách sản phẩm & Tồn kho & Giá bán gần nhất
    SELECT TOP (@TopN)
        D.ItemID, I.ItemName, I.Unit,
        ISNULL((SELECT SUM(QuantityinStock) FROM IV_StockTbl WHERE ItemID = D.ItemID), 0) AS TonKho,
        CAST(ISNULL((SELECT TOP 1 UnitPrice FROM AR_InvoiceDetailTbl WHERE ItemID = D.ItemID ORDER BY DocumentID DESC), 0) AS BIGINT) AS GiaThamKhao
    FROM AR_SanPhamTrongTamDetailTbl D
    JOIN CF_ItemTbl I ON D.ItemID = I.ItemID
    WHERE D.DocumentID = @ProgramID
    ORDER BY I.ItemName ASC;
END
GO
