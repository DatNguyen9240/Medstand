USE medtest;
GO

-- 1. XÓA STORED PROCEDURE CŨ KHÔNG CÓ ĐUÔI _AI
IF OBJECT_ID('dbo.API_Dashboard_SinhNhat', 'P') IS NOT NULL
    DROP PROCEDURE dbo.API_Dashboard_SinhNhat;
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =========================================================================
-- ĐẶC TẢ NGHIỆP VỤ WIDGET "SINH NHẬT HÔM NAY":
-- 1. Lọc đúng ngày/tháng sinh nhật trùng với ngày hiện tại (GETDATE()).
-- 2. Phân quyền dữ liệu theo phạm vi quản lý của User đăng nhập:
--    - Admin/Ban lãnh đạo (Manager = 1): Xem toàn bộ hệ thống.
--    - Manager/Supervisor: Xem theo nhóm/tuyến của team quản lý.
--    - Sales: Chỉ xem khách hàng được phụ trách.
-- =========================================================================

CREATE OR ALTER PROCEDURE [dbo].[API_Dashboard_SinhNhat_AI]
    @User        VARCHAR(50),
    @BranchID    VARCHAR(50) = '',
    @CeoID       VARCHAR(50) = '',
    @ManagerID   VARCHAR(50) = '',
    @EmployeeID  VARCHAR(50) = '',
    @ToDate      DATETIME = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @ObjectID VARCHAR(50), @BanLanhDao BIT;
    
    -- Lấy thông tin quyền và vai trò của User đăng nhập
    SELECT 
        @ObjectID = COALESCE(ObjectID,''), 
        @BranchID = COALESCE(BranchID,''), 
        @ManagerID = COALESCE(ManagerID,''), 
        @EmployeeID = COALESCE(EmployeeID,''),
        @BanLanhDao = COALESCE(Manager,0)
    FROM dbo.SY_User 
    WHERE UserName = @User;
    
    -- Failsafe: Tài khoản admin mặc định xem toàn quyền
    IF @User = 'admin' 
        SET @BanLanhDao = 1;

    -- Truy vấn danh sách sinh nhật hôm nay khớp với phân quyền RLS
    SELECT 
        ObjectID, 
        ObjectName, 
        Birthday, 
        Phone, 
        Address, 
        ObjectGroupID
    FROM dbo.CF_ObjectTbl WITH (NOLOCK)
    WHERE Birthday IS NOT NULL 
      AND Birthday <> '1900-01-01'
      AND DAY(Birthday) = DAY(GETDATE())
      AND MONTH(Birthday) = MONTH(GETDATE())
      AND (
          @User = '' 
          OR @BanLanhDao = 1 
          OR ObjectID IN (SELECT ObjectID FROM dbo.AR_GetObjectByUserFnc(@User))
      )
    ORDER BY ObjectName;
END
GO
