CREATE OR ALTER PROCEDURE dbo.API_GetConfig
    @ApiCode VARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ActualSPName VARCHAR(200);

    -- 1. Tìm chính quy trên API_Definition
    SELECT TOP 1 @ActualSPName = StoredProcedure
    FROM dbo.API_Definition
    WHERE ApiCode = @ApiCode OR ApiCode = '@' + REPLACE(@ApiCode, '@', '');

    -- 2. Nếu rỗng, ép bỏ gạch dưới "_" để tìm Mò cực mạnh trên Base SQL
    IF @ActualSPName IS NULL
    BEGIN
        DECLARE @CleanCode VARCHAR(100) = REPLACE(REPLACE(@ApiCode, '@', ''), '_', '');

        SELECT TOP 1 @ActualSPName = name 
        FROM sys.procedures 
        WHERE REPLACE(name, '_', '') LIKE '%' + @CleanCode + '%' 
          AND name LIKE '%_AI';
    END

    -- Nếu tìm không ra SP nào
    IF @ActualSPName IS NULL
    BEGIN
        SELECT FieldCode = '@Invalid', FieldName = N'Bó tay! Không tìm thấy SP nào tương tự: ' + @ApiCode, IsRequired = 0, Placeholder = N'';
        RETURN;
    END

    -- 3. In ra Config tham số
    SELECT 
        FieldCode   = prm.name, 
        FieldName   = REPLACE(prm.name, '@', ''),
        Placeholder = N'Nhập ' + REPLACE(prm.name, '@', '') + ' (' + UPPER(t.name) + ')',
        IsRequired  = CASE WHEN prm.has_default_value = 1 THEN 0 ELSE 1 END,
        ControlType = 'TEXT',
        OrderIndex  = prm.parameter_id
    FROM sys.procedures p
    JOIN sys.parameters prm ON prm.object_id = p.object_id
    JOIN sys.types t ON t.user_type_id = prm.user_type_id
    WHERE p.name = @ActualSPName
    ORDER BY prm.parameter_id;
END
GO
