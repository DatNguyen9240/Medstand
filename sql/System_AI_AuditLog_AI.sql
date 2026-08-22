-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  AUDIT LOG SYSTEM — Nhật ký nghiệp vụ Medstand AI                 ║
-- ║  Ghi lại mọi hành động nhạy cảm: Ai xem, xem gì, lúc mấy giờ.    ║
-- ║  Không hardcode bất kỳ giá trị nào — tất cả đều dynamic.          ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ═══ BƯỚC 1: Tạo bảng Audit Log (chạy 1 lần) ═══
IF OBJECT_ID('AI_AuditLog', 'U') IS NULL
BEGIN
    CREATE TABLE AI_AuditLog (
        LogID        INT IDENTITY(1,1) PRIMARY KEY,
        LogTime      DATETIME         NOT NULL DEFAULT GETDATE(),
        Username     VARCHAR(50)      NOT NULL,
        ActionType   VARCHAR(100)     NOT NULL,  -- 'VIEW_CONGNO', 'VIEW_DOANHSO', 'CREATE_DONHANG'...
        TargetEntity VARCHAR(100)     NULL,       -- Tên module / API được gọi
        TargetID     VARCHAR(100)     NULL,       -- Mã khách hàng / mã sản phẩm liên quan
        TargetName   NVARCHAR(200)    NULL,       -- Tên khách hàng / sản phẩm (snapshot lúc gọi)
        IPAddress    VARCHAR(50)      NULL,
        ExtraInfo    NVARCHAR(MAX)    NULL,       -- JSON hoặc text thêm nếu cần
        INDEX IX_AuditLog_Time  (LogTime DESC),
        INDEX IX_AuditLog_User  (Username, LogTime DESC),
        INDEX IX_AuditLog_Type  (ActionType, LogTime DESC)
    )
    PRINT N'Đã tạo bảng AI_AuditLog thành công.'
END
ELSE
    PRINT N'Bảng AI_AuditLog đã tồn tại, bỏ qua.'
GO


-- ═══ BƯỚC 2: Procedure ghi log — được gọi từ các API nghiệp vụ ═══
IF OBJECT_ID('AI_WriteAuditLog', 'P') IS NOT NULL DROP PROCEDURE AI_WriteAuditLog;
GO
CREATE PROCEDURE AI_WriteAuditLog
    @Username     VARCHAR(50),
    @ActionType   VARCHAR(100),
    @TargetEntity VARCHAR(100) = NULL,
    @TargetID     VARCHAR(100) = NULL,
    @TargetName   NVARCHAR(200) = NULL,
    @IPAddress    VARCHAR(50) = NULL,
    @ExtraInfo    NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON
    INSERT INTO AI_AuditLog (LogTime, Username, ActionType, TargetEntity, TargetID, TargetName, IPAddress, ExtraInfo)
    VALUES (GETDATE(), @Username, @ActionType, @TargetEntity, @TargetID, @TargetName, @IPAddress, @ExtraInfo)
END
GO


-- ═══ BƯỚC 3: Procedure tra cứu Audit Log ═══
IF OBJECT_ID('API_AuditLog_AI', 'P') IS NOT NULL DROP PROCEDURE API_AuditLog_AI;
GO
CREATE PROCEDURE API_AuditLog_AI
    @Username      VARCHAR(50) = '',   -- Admin tra cứu
    @FilterUser    VARCHAR(50) = '',   -- Lọc theo người dùng nào
    @FilterAction  VARCHAR(100) = '',  -- Lọc theo loại hành động
    @TuNgay        DATETIME = NULL,
    @DenNgay       DATETIME = NULL,
    @TopN          INT = 100
AS
BEGIN
    SET NOCOUNT ON

    DECLARE @SYSUserGroupID VARCHAR(50) = '';
    SELECT TOP 1 @SYSUserGroupID = ISNULL(UserGroupID, '')
    FROM SY_User WITH (NOLOCK)
    WHERE UserName = @Username AND COALESCE(Disable, 0) = 0;

    IF UPPER(@SYSUserGroupID) <> 'ADMIN'
    BEGIN
        SELECT N'Quyền truy cập bị từ chối. Chỉ dành cho quản trị viên (Admin).' AS Msg, 1 AS MsgType
        RETURN
    END

    IF @TuNgay IS NULL SET @TuNgay = DATEADD(DAY, -7, GETDATE())
    IF @DenNgay IS NULL SET @DenNgay = GETDATE()

    SELECT TOP (@TopN)
        LogID,
        FORMAT(LogTime, 'dd/MM/yyyy HH:mm:ss')  AS [Thời gian],
        Username                                  AS [Người dùng],
        ActionType                                AS [Hành động],
        TargetEntity                              AS [Module],
        TargetID                                  AS [Mã đối tượng],
        TargetName                                AS [Tên đối tượng],
        IPAddress                                 AS [IP],
        ExtraInfo                                 AS [Chi tiết thêm]
    FROM AI_AuditLog
    WHERE LogTime BETWEEN @TuNgay AND @DenNgay
      AND (@FilterUser   = '' OR Username   = @FilterUser)
      AND (@FilterAction = '' OR ActionType LIKE '%' + @FilterAction + '%')
    ORDER BY LogTime DESC
END
GO


-- ═══ HƯỚNG DẪN TÍCH HỢP VÀO CÁC API NGHIỆP VỤ ═══
-- Thêm dòng này vào đầu mỗi API sau khi validate User:
--
--   EXEC AI_WriteAuditLog
--       @Username     = @Username,
--       @ActionType   = 'VIEW_CONGNO',
--       @TargetEntity = 'API_CongNoChiTiet_AI',
--       @TargetID     = @MaKhachHang,
--       @TargetName   = (SELECT ObjectName FROM CF_ObjectTbl WHERE ObjectID = @MaKhachHang)
--
-- Danh sách ActionType chuẩn (gợi ý):
--   VIEW_CONGNO         — Xem công nợ khách hàng
--   VIEW_DOANHSO        — Xem báo cáo doanh số
--   VIEW_TONKHO         — Xem tồn kho
--   CREATE_DONHANG      — Tạo đơn hàng
--   CREATE_KHACHHANG    — Thêm khách hàng mới
--   VIEW_CHAM_DIEM      — Xem điểm RFM-C khách hàng
--   VIEW_TICH_LUY       — Xem tiến độ tích lũy
--   UPLOAD_RAG          — Nạp tài liệu vào RAG
