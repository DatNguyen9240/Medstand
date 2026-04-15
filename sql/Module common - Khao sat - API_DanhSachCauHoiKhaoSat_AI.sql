USE [medtest]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[API_DanhSachCauHoiKhaoSat_AI]
    @Username    VARCHAR(50),
    @NhomCauHoi  VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;
    
    -- 1. KIỂM TRA QUYỀN TRUY CẬP
    IF NOT EXISTS (SELECT 1 FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'❌ Lỗi: Tài khoản không hợp lệ hoặc đã bị khóa.' AS [message], 'chat' AS [action];
        RETURN;
    END

    -- 2. LẤY DANH SÁCH CÂU HỎI
    SELECT 
        MaCauHoi, 
        NoiDung, 
        DapAn1, 
        DapAn2, 
        DapAn3, 
        DapAn4, 
        DapAnDung, 
        NhomCauHoi, 
        FromDate, 
        ToDate 
    FROM dbo.CF_DanhSachCauHoiTbl
    WHERE COALESCE(isDisable, 0) = 0
    AND FromDate <= GETDATE()  
    AND (ToDate >= GETDATE() OR ToDate IS NULL)
    AND (@NhomCauHoi = '' OR NhomCauHoi = @NhomCauHoi);
END
GO
