// Build dynamic EXEC SQL từ ApiCode + params JSON
const execNode = $('Check Method Execute').first().json;
const apiCode = execNode.body.ApiCode || '@invalid_code';
const paramsStr = execNode._paramsSafeStr || '{}';

// Build query: tra cuu SP name tu API_Definition, roi dong goi voi params
const query = `
DECLARE @ApiCode VARCHAR(100) = '${apiCode}';
DECLARE @ParamsJSON NVARCHAR(MAX) = N'${paramsStr}';
DECLARE @SPName NVARCHAR(MAX);
DECLARE @UiTemplate VARCHAR(50) = \u0027DEFAULT\u0027;

SELECT @SPName = StoredProcedure, @UiTemplate = ISNULL(UiTemplate, \u0027DEFAULT\u0027) FROM dbo.API_Definition WHERE ApiCode = @ApiCode AND IsActive = 1;

IF @SPName IS NULL
BEGIN
    SELECT 2 AS code, \u0027Missing para or Object not support\u0027 AS msg, \u0027DEFAULT\u0027 AS uiTemplate FOR JSON PATH;
    RETURN;
END

SELECT @UiTemplate AS Metadata_UiTemplate; -- Meta set

DECLARE @SQL NVARCHAR(MAX) = N\u0027EXEC \u0027 + QUOTENAME(@SPName) + N\u0027 \u0027;

IF @ParamsJSON IS NOT NULL AND @ParamsJSON != '' AND @ParamsJSON != '{}'
BEGIN
    SELECT @SQL = @SQL + [key] + N' = N''' + REPLACE(CAST([value] AS NVARCHAR(MAX)), '''', '''''') + N''', '
    FROM OPENJSON(@ParamsJSON)
    WHERE [key] LIKE '@%';

    IF RIGHT(@SQL, 2) = ', ' SET @SQL = LEFT(@SQL, LEN(@SQL) - 1);
END

EXEC sp_executesql @SQL;
`.trim();

return [{ json: { query } }];