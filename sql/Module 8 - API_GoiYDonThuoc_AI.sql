USE medtest;
GO

IF OBJECT_ID('API_GoiYDonThuoc_AI', 'P') IS NOT NULL DROP PROCEDURE API_GoiYDonThuoc_AI;
GO
CREATE PROCEDURE API_GoiYDonThuoc_AI
    @Username VARCHAR(50) = '',
    @timkiem NVARCHAR(500) = ''
AS
BEGIN
    SET NOCOUNT ON;
    SET ANSI_WARNINGS OFF;
    SET @timkiem = REPLACE(REPLACE(@timkiem, '"', ''), '''', '');
   
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

    DECLARE @Keys TABLE (TuKhoa NVARCHAR(100));
    INSERT INTO @Keys (TuKhoa)
    SELECT CAST(value AS NVARCHAR(100))
    FROM STRING_SPLIT(REPLACE(@timkiem, ';', ','), ',') WHERE value != '';

    -- Xử lý triệt để dấu câu và khoảng trắng dư thừa từ Chatbot AI trả về
    UPDATE @Keys 
    SET TuKhoa = LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(TuKhoa, '.', ''), ',', ''), '-', '')));

    -- BẢNG 1: Tìm sản phẩm thay thế (Món khớp trực tiếp)
    DECLARE @Table1 TABLE (ItemID VARCHAR(50), ItemName NVARCHAR(500), Unit NVARCHAR(50), TuKhoa NVARCHAR(500), LyDoGoiY NVARCHAR(1000));
    
    INSERT INTO @Table1 (ItemID, ItemName, Unit, TuKhoa, LyDoGoiY)
    SELECT DISTINCT TOP 10
        CF.ItemID, CF.ItemName, CF.Unit, CF.TuKhoa,
        N'Gợi ý Medstand cho: ' + K.TuKhoa AS LyDoGoiY
    FROM CF_ItemTbl CF JOIN @Keys K ON (
        N' ' + REPLACE(REPLACE(REPLACE(CF.ItemName, ',', ' '), '.', ' '), '-', ' ') + N' ' LIKE N'% ' + K.TuKhoa + N' %'
        OR N' ' + REPLACE(REPLACE(REPLACE(ISNULL(CF.TuKhoa,''), ',', ' '), '.', ' '), '-', ' ') + N' ' LIKE N'% ' + K.TuKhoa + N' %'
    )
    WHERE ISNULL(CF.isDisable, 0) = 0
      AND ISNULL(CF.ItemGroupID, '') = 'HH1';

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
          AND ISNULL(ItemGroupID, '') = 'HH1';
    END

    -- 2.2. Logic bán chéo thông minh dựa trên lịch sử hóa đơn thực tế (Market Basket Analysis)
    INSERT INTO @FinalGoiY (ItemID, ItemName, Unit, CanhBaoAI, Priority)
    SELECT TOP 3 
        CF.ItemID, CF.ItemName, CF.Unit, 
        N'GỢI Ý BÁN KÈM: Sản phẩm thường xuyên "cặp bài trùng" trong cùng hóa đơn', 2
    FROM AR_InvoiceDetailTbl D
    JOIN AR_InvoiceTbl I ON D.DocumentID = I.DocumentID
    JOIN AR_InvoiceDetailTbl D_Other ON I.DocumentID = D_Other.DocumentID
    JOIN CF_ItemTbl CF ON D_Other.ItemID = CF.ItemID
    WHERE D.ItemID IN (SELECT ItemID FROM @Table1)
      AND D_Other.ItemID NOT IN (SELECT ItemID FROM @Table1)
      AND D_Other.ItemID NOT IN (SELECT ItemID FROM @FinalGoiY)
      AND I.DocumentDate >= DATEADD(month, -6, GETDATE())
      AND ISNULL(CF.isDisable, 0) = 0
      AND ISNULL(CF.ItemGroupID, '') = 'HH1'
    GROUP BY CF.ItemID, CF.ItemName, CF.Unit
    ORDER BY COUNT(DISTINCT I.DocumentID) DESC;

    -- Xóa cờ 2 bảng, dồn hết về bảng cuối
    INSERT INTO @FinalGoiY (ItemID, ItemName, Unit, CanhBaoAI, Priority)
    SELECT ItemID, ItemName, Unit, LyDoGoiY, 0 FROM @Table1;

    -- Nếu không tìm thấy kết quả nào, trả về thông báo lỗi thân thiện để Chatbot hiển thị
    IF NOT EXISTS (SELECT 1 FROM @FinalGoiY)
    BEGIN
        SELECT 
            'N/A' AS ItemID, 
            N'Không tìm thấy sản phẩm gốc' AS ItemName, 
            '' AS Unit, 
            N'Vui lòng kiểm tra lại từ khóa (Ví dụ: tên thuốc phải chính xác). Hệ thống cần 1 sản phẩm mồi để phân tích bán chéo.' AS CanhBaoAI;
        RETURN;
    END

    -- Xuất kết quả Bảng dồn sắp xếp theo thứ tự ưu tiên
    SELECT ItemID, ItemName, Unit, CanhBaoAI FROM @FinalGoiY ORDER BY Priority ASC, ItemName ASC;

END
GO
