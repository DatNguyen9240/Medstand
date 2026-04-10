USE [medtest]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[API_PhuongXa]   
    @User        VARCHAR(50) = '',  
    @LocationID  NVARCHAR(50) = '',  
    @SearchText  NVARCHAR(MAX) = ''
AS  
BEGIN  
    SET NOCOUNT ON;
    
    SELECT 
        TinhThanh AS LocationID, 
        XaPhuong  
    FROM dbo.CF_XaPhuongTbl   
    WHERE (@LocationID = '' OR TinhThanh = @LocationID)
      AND (@SearchText = '' OR XaPhuong LIKE '%' + @SearchText + '%')
    ORDER BY XaPhuong;
END
GO
