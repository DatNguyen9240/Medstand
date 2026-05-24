IF OBJECT_ID('dbo.ufn_remove_accents', 'FN') IS NOT NULL 
    DROP FUNCTION dbo.ufn_remove_accents;
GO

CREATE FUNCTION dbo.ufn_remove_accents (@Input NVARCHAR(MAX))
RETURNS NVARCHAR(MAX)
AS
BEGIN
    IF @Input IS NULL RETURN NULL;
    DECLARE @str NVARCHAR(MAX) = LOWER(@Input);
    
    SET @str = REPLACE(@str, N'á', 'a');
    SET @str = REPLACE(@str, N'à', 'a');
    SET @str = REPLACE(@str, N'ả', 'a');
    SET @str = REPLACE(@str, N'ã', 'a');
    SET @str = REPLACE(@str, N'ạ', 'a');
    SET @str = REPLACE(@str, N'ă', 'a');
    SET @str = REPLACE(@str, N'ắ', 'a');
    SET @str = REPLACE(@str, N'ằ', 'a');
    SET @str = REPLACE(@str, N'ẳ', 'a');
    SET @str = REPLACE(@str, N'ẵ', 'a');
    SET @str = REPLACE(@str, N'ặ', 'a');
    SET @str = REPLACE(@str, N'â', 'a');
    SET @str = REPLACE(@str, N'ấ', 'a');
    SET @str = REPLACE(@str, N'ầ', 'a');
    SET @str = REPLACE(@str, N'ẩ', 'a');
    SET @str = REPLACE(@str, N'ẫ', 'a');
    SET @str = REPLACE(@str, N'ậ', 'a');

    SET @str = REPLACE(@str, N'đ', 'd');

    SET @str = REPLACE(@str, N'é', 'e');
    SET @str = REPLACE(@str, N'è', 'e');
    SET @str = REPLACE(@str, N'ẻ', 'e');
    SET @str = REPLACE(@str, N'ẽ', 'e');
    SET @str = REPLACE(@str, N'ẹ', 'e');
    SET @str = REPLACE(@str, N'ê', 'e');
    SET @str = REPLACE(@str, N'ế', 'e');
    SET @str = REPLACE(@str, N'ề', 'e');
    SET @str = REPLACE(@str, N'ể', 'e');
    SET @str = REPLACE(@str, N'ễ', 'e');
    SET @str = REPLACE(@str, N'ệ', 'e');

    SET @str = REPLACE(@str, N'í', 'i');
    SET @str = REPLACE(@str, N'ì', 'i');
    SET @str = REPLACE(@str, N'ỉ', 'i');
    SET @str = REPLACE(@str, N'ĩ', 'i');
    SET @str = REPLACE(@str, N'ị', 'i');

    SET @str = REPLACE(@str, N'ó', 'o');
    SET @str = REPLACE(@str, N'ò', 'o');
    SET @str = REPLACE(@str, N'ỏ', 'o');
    SET @str = REPLACE(@str, N'õ', 'o');
    SET @str = REPLACE(@str, N'ọ', 'o');
    SET @str = REPLACE(@str, N'ô', 'o');
    SET @str = REPLACE(@str, N'ố', 'o');
    SET @str = REPLACE(@str, N'ồ', 'o');
    SET @str = REPLACE(@str, N'ổ', 'o');
    SET @str = REPLACE(@str, N'ỗ', 'o');
    SET @str = REPLACE(@str, N'ộ', 'o');
    SET @str = REPLACE(@str, N'ơ', 'o');
    SET @str = REPLACE(@str, N'ớ', 'o');
    SET @str = REPLACE(@str, N'ờ', 'o');
    SET @str = REPLACE(@str, N'ở', 'o');
    SET @str = REPLACE(@str, N'ỡ', 'o');
    SET @str = REPLACE(@str, N'ợ', 'o');

    SET @str = REPLACE(@str, N'ú', 'u');
    SET @str = REPLACE(@str, N'ù', 'u');
    SET @str = REPLACE(@str, N'ủ', 'u');
    SET @str = REPLACE(@str, N'ũ', 'u');
    SET @str = REPLACE(@str, N'ụ', 'u');
    SET @str = REPLACE(@str, N'ư', 'u');
    SET @str = REPLACE(@str, N'ứ', 'u');
    SET @str = REPLACE(@str, N'ừ', 'u');
    SET @str = REPLACE(@str, N'ử', 'u');
    SET @str = REPLACE(@str, N'ữ', 'u');
    SET @str = REPLACE(@str, N'ự', 'u');

    SET @str = REPLACE(@str, N'ý', 'y');
    SET @str = REPLACE(@str, N'ỳ', 'y');
    SET @str = REPLACE(@str, N'ỷ', 'y');
    SET @str = REPLACE(@str, N'ỹ', 'y');
    SET @str = REPLACE(@str, N'ỵ', 'y');

    RETURN UPPER(@str);
END
GO
