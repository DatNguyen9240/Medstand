IF OBJECT_ID('API_GoiYDonThuoc_AI', 'P') IS NOT NULL DROP PROCEDURE API_GoiYDonThuoc_AI;
GO
CREATE PROCEDURE API_GoiYDonThuoc_AI
    @timkiem NVARCHAR(500) = ''
AS
BEGIN
    SET NOCOUNT ON
   
    SELECT CAST(value AS NVARCHAR(100)) AS TuKhoa INTO #Keys
    FROM STRING_SPLIT(REPLACE(@timkiem, ';', ','), ',') WHERE value != ''


    -- BẢNG 1: Tìm sản phẩm thay thế (Món khớp trực tiếp)
    SELECT DISTINCT TOP 10
        CF.ItemID, CF.ItemName, CF.Unit, CF.TuKhoa,
        N'✨ Gợi ý Medstand cho: ' + K.TuKhoa AS LyDoGoiY
    INTO #Table1
    FROM CF_ItemTbl CF JOIN #Keys K ON (
        N' ' + REPLACE(REPLACE(REPLACE(CF.ItemName, ',', ' '), '.', ' '), '-', ' ') + N' ' LIKE N'% ' + K.TuKhoa + N' %'
        OR N' ' + REPLACE(REPLACE(REPLACE(ISNULL(CF.TuKhoa,''), ',', ' '), '.', ' '), '-', ' ') + N' ' LIKE N'% ' + K.TuKhoa + N' %'
    )
    WHERE ISNULL(CF.isDisable, 0) = 0
      AND ISNULL(CF.ItemGroupID, '') NOT IN ('BB', 'BBVT', 'PB', 'KM', 'VT')
    ORDER BY CF.ItemName ASC;

    SELECT * FROM #Table1;


    -- BẢNG 2: Bán chéo thông minh & Sản phẩm tương tự
    -- Lấy tên lõi của sản phẩm đầu tiên ở Bảng 1 để tìm hàng tương tự (Bỏ phần trong ngoặc)
    DECLARE @CoreName NVARCHAR(500) = ''
    SELECT TOP 1 @CoreName = LEFT(ItemName, CHARINDEX('(', ItemName + '(') - 1) FROM #Table1;
    SET @CoreName = LTRIM(RTRIM(@CoreName));

    CREATE TABLE #FinalGoiY (ItemID VARCHAR(50), ItemName NVARCHAR(500), Unit NVARCHAR(50), CanhBaoAI NVARCHAR(1000), Priority INT);

    -- 2.1. Thêm sản phẩm tương tự (Cùng tên lõi nhưng chưa có ở Bảng 1)
    IF @CoreName != '' AND LEN(@CoreName) > 5
    BEGIN
        INSERT INTO #FinalGoiY (ItemID, ItemName, Unit, CanhBaoAI, Priority)
        SELECT TOP 2 ItemID, ItemName, Unit, N'💡 SẢN PHẨM TƯƠNG TỰ: Gợi ý quy cách khác hoặc hàng cùng loại', 1
        FROM CF_ItemTbl
        WHERE ItemName LIKE @CoreName + '%'
          AND ItemID NOT IN (SELECT ItemID FROM #Table1)
          AND ISNULL(isDisable, 0) = 0
          AND ISNULL(ItemGroupID, '') NOT IN ('BB', 'BBVT', 'PB', 'KM', 'VT');
    END

    -- 2.2. Logic bán chéo Kháng sinh / Tăng đề kháng cũ
    IF EXISTS (SELECT 1 FROM #Keys WHERE TuKhoa LIKE N'%Amox%' OR TuKhoa LIKE N'%Cefu%' OR TuKhoa LIKE N'%Kháng sinh%')
    BEGIN
        INSERT INTO #FinalGoiY (ItemID, ItemName, Unit, CanhBaoAI, Priority)
        SELECT TOP 3 ItemID, ItemName, Unit, N'⚠️ AI CẢNH BÁO: Đơn có Kháng sinh → Tư vấn thêm Men vi sinh tránh loạn khuẩn!', 2
        FROM CF_ItemTbl
        WHERE (ItemName LIKE N'%Men vi sinh%' OR ItemName LIKE N'%Men sống%' OR ItemName LIKE N'%Bio%')
          AND ItemName NOT LIKE N'%Bộ vỏ%' AND ItemName NOT LIKE N'%Vỏ hộp%'
          AND ISNULL(isDisable, 0) = 0 AND ISNULL(ItemGroupID, '') NOT IN ('BB', 'BBVT', 'PB', 'KM', 'VT');
    END
    ELSE
    BEGIN
        INSERT INTO #FinalGoiY (ItemID, ItemName, Unit, CanhBaoAI, Priority)
        SELECT TOP 3 ItemID, ItemName, Unit, N'💡 GỢI Ý BÁN THÊM: Sản phẩm tăng đề kháng hỗ trợ phục hồi nhanh', 2
        FROM CF_ItemTbl
        WHERE (ItemName LIKE N'%Đề kháng%' OR ItemName LIKE N'%Vitamin%' OR ItemName LIKE N'%Canxi%' OR ItemName LIKE N'%Sâm%')
          AND ISNULL(isDisable, 0) = 0 AND ISNULL(ItemGroupID, '') NOT IN ('BB', 'BBVT', 'PB', 'KM', 'VT');
    END

    -- Xuất kết quả Bảng 2 sắp xếp theo thứ tự ưu tiên
    SELECT ItemID, ItemName, Unit, CanhBaoAI FROM #FinalGoiY ORDER BY Priority ASC, ItemName ASC;


    DROP TABLE #Keys; DROP TABLE #Table1; DROP TABLE #FinalGoiY;
END
GO





