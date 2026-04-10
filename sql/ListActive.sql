USE [Medtest] -- Điền đúng tên DB của bạn
GO

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
      -- LOẠI BỎ các API bắt đầu bằng @metadata_ hoặc các API hệ thống
      AND ApiCode NOT LIKE '@metadata_%' 
      AND (
          @SearchKey = '' 
          OR ApiCode LIKE '%' + @SearchKey + '%'
          OR ApiName LIKE '%' + @SearchKey + '%'
      )
    ORDER BY OrderIndex, ApiName;
END
GO
