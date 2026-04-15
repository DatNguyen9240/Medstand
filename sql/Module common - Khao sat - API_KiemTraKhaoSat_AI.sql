USE [medtest]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [dbo].[API_KiemTraKhaoSat_AI]
    @Username VARCHAR(50),
    @Ngay     DATETIME = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    -- 1. MẶC ĐỊNH NGÀY HIỆN TẠI
    IF @Ngay IS NULL SET @Ngay = CAST(GETDATE() AS DATE);

    -- 2. KIỂM TRA QUYỀN TRUY CẬP
    IF NOT EXISTS (SELECT 1 FROM SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'❌ Lỗi: Tài khoản không hợp lệ hoặc đã bị khóa.' AS [message], 'chat' AS [action];
        RETURN;
    END

    -- 3. THỰC HIỆN KIỂM TRA
    -- Logic: Trả về 1 nếu CẦN khảo sát, 0 nếu ĐÃ hoàn thành
    DECLARE @NeedsSurvey INT = 1;
    
    IF EXISTS (
        SELECT TOP 1 1 
        FROM dbo.AR_DotKhaoSatTbl 
        WHERE UserName = @Username 
          AND CAST(DocumentDate AS DATE) = CAST(@Ngay AS DATE) 
          AND COALESCE(KetQuaDung, 0) = 3
    )
    BEGIN
        SET @NeedsSurvey = 0;
    END

    -- 4. TRẢ KẾT QUẢ THEO ĐỊNH DẠNG AI
    SELECT 
        @NeedsSurvey AS NeedsSurvey,
        CASE 
            WHEN @NeedsSurvey = 1 THEN N'💡 Bạn có bài khảo sát mới cần thực hiện hôm nay.'
            ELSE N'✅ Bạn đã hoàn thành bài khảo sát hôm nay. Hẹn gặp lại vào ngày mai!'
        END AS LoiNhacAI,
        'chat' AS [action];
END
GO
