IF OBJECT_ID('dbo.ufn_clean_customer_name', 'FN') IS NOT NULL 
    DROP FUNCTION dbo.ufn_clean_customer_name;
GO

CREATE FUNCTION dbo.ufn_clean_customer_name (@Input NVARCHAR(MAX))
RETURNS NVARCHAR(MAX)
AS
BEGIN
    IF @Input IS NULL RETURN NULL;
    DECLARE @str NVARCHAR(MAX) = dbo.ufn_remove_accents(@Input);
    SET @str = REPLACE(@str, ' ', '');
    
    DECLARE @res NVARCHAR(MAX) = @str;
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
