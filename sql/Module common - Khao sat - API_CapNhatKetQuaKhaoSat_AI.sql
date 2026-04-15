USE [medtest]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[API_CapNhatKetQuaKhaoSat_AI]
    @Username       VARCHAR(50),
    @UserAutoID     VARCHAR(50), 
    @DapAn          INT
AS
BEGIN
    SET NOCOUNT ON;
    
    -- 1. KIỂM TRA QUYỀN TRUY CẬP
    IF NOT EXISTS (SELECT 1 FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'❌ Lỗi: Tài khoản không hợp lệ hoặc đã bị khóa.' AS [message], 'chat' AS [action];
        RETURN;
    END

    -- 2. THỰC HIỆN CẬP NHẬT
    BEGIN TRY
        UPDATE dbo.AR_DotKhaoSatDetailTbl 
        SET DapAn = @DapAn, 
            ThoiGianTraLoi = GETDATE()
        WHERE UserAutoID = @UserAutoID;

        IF @@ROWCOUNT = 0
        BEGIN
            SELECT N'⚠️ Không tìm thấy bản ghi khảo sát (' + @UserAutoID + N') để cập nhật.' AS [message], 'chat' AS [action];
        END
        ELSE
        BEGIN
            SELECT N'✅ Đã cập nhật đáp án khảo sát thành công!' AS [message], 'chat' AS [action];
        END
    END TRY
    BEGIN CATCH
        SELECT N'❌ Lỗi hệ thống: ' + ERROR_MESSAGE() AS [message], 'chat' AS [action];
    END CATCH
END
GO
