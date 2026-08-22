
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[API_PhuongXa]   
    @User        VARCHAR(50) = '',  
    @LocationID  NVARCHAR(50) = '',  
    @QuanHuyen   NVARCHAR(100) = '',
    @SearchText  NVARCHAR(MAX) = ''
AS  
BEGIN  
    SET NOCOUNT ON;
    
    SELECT DISTINCT
        TinhThanh AS LocationID, 
        QuanHuyen,
        XaPhuong  
    FROM dbo.CF_XaPhuongTbl   
    WHERE (@LocationID = '' OR TinhThanh = @LocationID)
      AND (@QuanHuyen = '' OR QuanHuyen = @QuanHuyen)
      AND (@SearchText = '' OR XaPhuong LIKE '%' + @SearchText + '%')
    ORDER BY XaPhuong;
END
GO
