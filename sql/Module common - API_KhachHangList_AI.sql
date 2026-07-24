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

    -- Các tham số Manager/Employee được giữ lại để tương thích API cũ,
    -- nhưng không được dùng làm căn cứ phân quyền vì client có thể thay đổi.
    IF NOT EXISTS (
        SELECT 1
        FROM dbo.SY_User WITH (NOLOCK)
        WHERE UserName = @User
          AND ISNULL(Disable, 0) = 0
    )
    BEGIN
        SELECT N'Tài khoản không hợp lệ hoặc đã bị khóa.' AS [Msg], 1 AS [MsgType];
        RETURN;
    END

    -- AR_GetObjectByUserFnc là phạm vi khách hàng chuẩn của tài khoản ERP.
    -- Sale chỉ thấy khách được giao; Manager/Admin thấy phạm vi do ERP cấu hình.
    SELECT DISTINCT
        A.ObjectID,
        A.ObjectName,
        A.Address,
        A.Phone,
        A.LocationID,
        A.XaPhuong,
        A.ObjectID + ' - ' + A.ObjectName AS DisplayName
    FROM dbo.vKhachHangList A
    INNER JOIN dbo.AR_GetObjectByUserFnc(@User) Scope
        ON Scope.ObjectID = A.ObjectID
    WHERE (ISNULL(@ObjectID, '') = '' OR A.ObjectID = @ObjectID)
      AND (
          ISNULL(@SearchText, '') = ''
          OR A.ObjectID LIKE '%' + @SearchText + '%'
          OR A.ObjectName LIKE '%' + @SearchText + '%'
      )
    ORDER BY A.ObjectName, A.ObjectID;
END
GO
