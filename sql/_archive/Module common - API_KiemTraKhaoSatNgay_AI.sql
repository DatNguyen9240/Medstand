CREATE OR ALTER PROCEDURE dbo.API_KiemTraKhaoSatNgay_AI
    @Username VARCHAR(50),
    @Ngay DATETIME = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.SY_User WITH (NOLOCK)
        WHERE UserName = @Username
          AND ISNULL(Disable, 0) = 0
    )
    BEGIN
        SELECT N'User không tồn tại hoặc đã bị khóa' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    EXEC dbo.API_KiemTraKhaoSatNgay
        @User = @Username,
        @Username = @Username,
        @BranchID = '',
        @Ngay = @Ngay;
END;
