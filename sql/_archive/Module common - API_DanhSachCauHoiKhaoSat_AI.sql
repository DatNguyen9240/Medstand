USE medtest;
GO

IF OBJECT_ID('API_DanhSachCauHoiKhaoSat_AI', 'P') IS NOT NULL DROP PROCEDURE API_DanhSachCauHoiKhaoSat_AI;
GO

CREATE PROCEDURE API_DanhSachCauHoiKhaoSat_AI
    @Username VARCHAR(50) = '',
    @MaKhachHang VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;

    -- LOG FOR AUDITING
    EXEC AI_WriteAuditLog
        @Username     = @Username,
        @ActionType   = 'AI_QUERY',
        @TargetEntity = 'API_DanhSachCauHoiKhaoSat_AI',
        @TargetID     = @MaKhachHang,
        @TargetName   = NULL,
        @ExtraInfo    = NULL;

    DECLARE @DocID VARCHAR(50) = CAST(NEWID() AS VARCHAR(50));
    DECLARE @Title NVARCHAR(200) = N'Khảo sát khách hàng ' + ISNULL(@MaKhachHang, '');
    
    -- 1. Khởi tạo bài khảo sát
    EXEC dbo.API_BatDauBaiKhaoSat @User = @Username, @DocumentID = @DocID, @Title = @Title, @SoCauHoi = 3;
    
    -- 2. Trả về câu hỏi chi tiết
    EXEC dbo.API_ChiTietBaiKhaoSat @User = @Username, @DocumentID = @DocID;
END
GO
