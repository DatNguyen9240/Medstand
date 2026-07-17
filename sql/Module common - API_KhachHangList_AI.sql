USE medtest;
GO

CREATE OR ALTER PROCEDURE [dbo].[API_KhachHangList]
    @User           VARCHAR(50) = '',
    @SearchText     NVARCHAR(50) = '',
    @ManagerID      VARCHAR(50) = '',   -- Bù nhìn cho n8n
    @EmployeeID     VARCHAR(50) = '',   -- Bù nhìn cho n8n
    @ObjectID       VARCHAR(50) = '',   -- Bù nhìn cho n8n
    @LoaiKhachHang  NVARCHAR(50) = '',  -- Bù nhìn cho n8n
    @KenhBan        VARCHAR(50) = '',   -- Bù nhìn cho n8n
    @SYSManagerID   VARCHAR(50) = '',
    @SYSEmployeeID  VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Ưu tiên lấy mã nhân viên từ hệ thống
    DECLARE @RealEmployeeID VARCHAR(50) = ISNULL(@SYSEmployeeID, '');
    IF @RealEmployeeID = ''
        SELECT TOP 1 @RealEmployeeID = ISNULL(EmployeeID, '') FROM dbo.SY_User WHERE UserName = @User;

    -- 2. Kiểm tra quyền thực tế
    IF EXISTS (SELECT 1 FROM dbo.AR_ObjectGroupEmployeeTbl WHERE EmployeeID = @RealEmployeeID)
    BEGIN
        -- Cách chuẩn: Dùng hàm hệ thống
        EXEC dbo.WA_OrderGetObjectByEmployeeStp
            @ManagerID = '', @EmployeeID = @RealEmployeeID, @S = @SearchText,
            @ObjectGroupID = NULL, @LocationID = NULL, @QuanHuyen = NULL;
    END
    ELSE
    BEGIN
        -- Cách dự phòng (Cho demo): Lấy từ lịch sử đơn hàng
        SELECT DISTINCT
            A.ObjectID,
            A.ObjectName,
            A.Address,
            A.Phone,
            A.LocationID,
            A.XaPhuong,
            A.ObjectID + ' - ' + A.ObjectName AS DisplayName
        FROM dbo.vKhachHangList A
        WHERE A.ObjectID IN (
            SELECT P.ObjectID
            FROM dbo.AR_GetObjectByUserFnc(@User) P
        )
          AND (A.ObjectID LIKE '%' + @SearchText + '%' OR A.ObjectName LIKE '%' + @SearchText + '%');
    END
END
GO
