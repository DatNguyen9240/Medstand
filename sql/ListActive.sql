CREATE OR ALTER PROCEDURE dbo.API_ListActive
    @SearchKey NVARCHAR(100) = ''
AS
BEGIN
    SET NOCOUNT ON;
    SELECT 
        ApiCode, 
        ApiName AS DisplayName, 
        Category, 
        'QUERY' AS ExecutionType 
    FROM dbo.API_Definition
    WHERE IsActive = 1
      AND (
          @SearchKey = '' 
          OR ApiCode LIKE '%' + @SearchKey + '%'
          OR ApiName LIKE '%' + @SearchKey + '%'
      )
    ORDER BY OrderIndex, ApiName;
END
GO
