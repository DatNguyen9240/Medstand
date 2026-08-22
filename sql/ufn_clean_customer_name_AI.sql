-- ============================================================
--  ufn_clean_customer_name — chuẩn hoá tên khách hàng để đối sánh
--
--  [2026-07-31] Đổi NVARCHAR(MAX) -> NVARCHAR(400) và thêm WITH SCHEMABINDING.
--
--  Vì sao bắt buộc phải đổi: System_Computed_Column_Index_AI.sql tạo cột
--  computed PERSISTED CF_ObjectTbl.ObjectNameCleaned từ hàm này, rồi dựng
--  index lên cột đó. SQL Server có hai ràng buộc chặn việc đó:
--    1. Mọi hàm trong biểu thức của computed column PERSISTED phải schema-bound.
--    2. Cột kiểu NVARCHAR(MAX) KHÔNG được phép làm khoá index.
--  Thiếu một trong hai thì script tạo index thất bại — đó là lý do cột
--  ObjectNameCleaned và index IX_CF_ObjectTbl_NameCleaned chưa từng tồn tại
--  trên medtest dù script đã nằm trong repo từ 2026-06-11.
--
--  Vì sao chọn 400: khớp với ufn_remove_accents (cũng NVARCHAR(400)) mà hàm này
--  gọi tới. 400 ký tự nvarchar = 800 byte, nằm dưới giới hạn 900 byte của khoá
--  index. Nguồn dữ liệu thực tế là CF_ObjectTbl.ObjectName kiểu NVARCHAR(300)
--  nên 400 dư sức chứa, không có nguy cơ cắt chuỗi.
-- ============================================================

IF OBJECT_ID('dbo.ufn_clean_customer_name', 'FN') IS NOT NULL
    DROP FUNCTION dbo.ufn_clean_customer_name;
GO

CREATE FUNCTION dbo.ufn_clean_customer_name (@Input NVARCHAR(400))
RETURNS NVARCHAR(400)
WITH SCHEMABINDING
AS
BEGIN
    IF @Input IS NULL RETURN NULL;
    DECLARE @str NVARCHAR(400) = dbo.ufn_remove_accents(@Input);
    SET @str = REPLACE(@str, ' ', '');

    DECLARE @res NVARCHAR(400) = @str;
    IF @str LIKE 'NHATHUOC%' SET @res = SUBSTRING(@str, 9, LEN(@str))
    ELSE IF @str LIKE 'QUAYTHUOC%' SET @res = SUBSTRING(@str, 10, LEN(@str))
    ELSE IF @str LIKE 'HIEUTHUOC%' SET @res = SUBSTRING(@str, 10, LEN(@str))
    ELSE IF @str LIKE 'KHACHHANG%' SET @res = SUBSTRING(@str, 10, LEN(@str))
    ELSE IF @str LIKE 'DAILY%' SET @res = SUBSTRING(@str, 6, LEN(@str))
    ELSE IF @str LIKE 'CONGTY%' SET @res = SUBSTRING(@str, 7, LEN(@str))
    ELSE IF @str LIKE 'CTY%' SET @res = SUBSTRING(@str, 4, LEN(@str))
    ELSE IF @str LIKE 'NT%' SET @res = SUBSTRING(@str, 3, LEN(@str))
    ELSE IF @str LIKE 'QT%' SET @res = SUBSTRING(@str, 3, LEN(@str))

    IF @res <> '' RETURN @res;
    RETURN @str;
END
GO
