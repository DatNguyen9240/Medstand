USE medtest;
GO

/*
    API công khai cho nghiệp vụ khảo sát khách hàng 360.
    API_TraCuu_TongHop_AI vẫn là endpoint điều phối nội bộ và không hiển thị
    trực tiếp trong chatbot.
*/
CREATE OR ALTER PROCEDURE dbo.API_KhaoSat360_AI
    @Username VARCHAR(50) = '',
    @ObjectID VARCHAR(50),
    @FromDate DATETIME = NULL,
    @ToDate DATETIME = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NULLIF(LTRIM(RTRIM(@ObjectID)), '') IS NULL
    BEGIN
        SELECT N'Vui lòng chọn khách hàng cần khảo sát.' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    EXEC dbo.API_TraCuu_TongHop_AI
        @Username = @Username,
        @Action = N'KHAO_SAT_360',
        @ObjectID = @ObjectID,
        @FromDate = @FromDate,
        @ToDate = @ToDate;
END;
GO

