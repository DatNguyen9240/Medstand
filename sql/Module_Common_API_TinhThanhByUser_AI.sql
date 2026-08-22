USE medtest;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  Nguồn tỉnh/thành dùng cho luồng tạo khách qua trợ lý.

  API_TinhThanh legacy nhận @User nhưng không dùng tham số này, vì vậy trả toàn bộ
  tỉnh của hệ thống. Hàm bên dưới suy phạm vi từ đúng ObjectGroupID mà ERP đã gán
  cho người dùng/nhân viên dưới quyền. Đây cũng là khóa phạm vi mà
  AR_GetObjectByUserFnc và API_KhachHang_Insert_AI đang sử dụng.

  Không hard-code danh sách Bắc/Trung/Nam. Một tỉnh được phép khi:
  - là tỉnh hiện hành được cấu hình trực tiếp trên nhóm được giao; hoặc
  - đã có khách thuộc nhóm được giao dùng tỉnh hiện hành đó.

  Nhánh thứ hai giữ được dữ liệu sau thay đổi địa giới (ví dụ nhóm cũ Nam Định
  nhưng khách hiện hành đã mang LocationID = Ninh Bình).
*/
CREATE OR ALTER FUNCTION dbo.AI_GetTinhThanhByUserFnc
(
    @User VARCHAR(50)
)
RETURNS TABLE
AS
RETURN
(
    WITH IdentityScope AS
    (
        SELECT
            EffectiveEmployeeID = CASE
                WHEN C.Username IS NOT NULL THEN C.EmployeeID
                WHEN COALESCE(U.EmployeeID, '') <> '' THEN U.EmployeeID
                WHEN COALESCE(U.ManagerID, '') = '' THEN U.CeoID
                ELSE U.ManagerID
            END,
            IsAdmin = CONVERT(BIT, CASE WHEN UPPER(COALESCE(U.UserGroupID, '')) = 'ADMIN' THEN 1 ELSE 0 END),
            IsSelfAssign = CONVERT(BIT, CASE WHEN C.Username IS NOT NULL THEN 1 ELSE 0 END),
            SelfAssignObjectGroupID = C.ObjectGroupID,
            SelfAssignLocationID = C.LocationID
        FROM dbo.SY_User U
        LEFT JOIN dbo.AI_CustomerSelfAssignConfig C
               ON C.Username = U.UserName
              AND C.IsActive = 1
        WHERE U.UserName = @User
          AND COALESCE(U.Disable, 0) = 0
          AND COALESCE(U.ObjectID, '') = ''
    ),
    HierarchyScope AS
    (
        SELECT I.EffectiveEmployeeID,
               I.IsAdmin,
               I.IsSelfAssign,
               I.SelfAssignObjectGroupID,
               I.SelfAssignLocationID,
               H.LevelSub
        FROM IdentityScope I
        OUTER APPLY
        (
            SELECT TOP (1) O.LevelSub
            FROM dbo.AR_OpListDetailTbl D
            INNER JOIN dbo.AR_OpListTbl O ON O.OpID = D.OpID
            WHERE D.EmployeeID = I.EffectiveEmployeeID
              AND COALESCE(D.isDisable, 0) = 0
            ORDER BY O.LevelCount
        ) H
    ),
    AllowedGroups AS
    (
        SELECT S.SelfAssignObjectGroupID AS ObjectGroupID
        FROM HierarchyScope S
        WHERE S.IsSelfAssign = 1
          AND NULLIF(LTRIM(RTRIM(S.SelfAssignObjectGroupID)), '') IS NOT NULL

        UNION

        SELECT DISTINCT G.ObjectGroupID
        FROM HierarchyScope S
        INNER JOIN dbo.CF_ObjectGroupTbl G ON S.IsAdmin = 1 AND S.IsSelfAssign = 0

        UNION

        SELECT DISTINCT D.ObjectGroupID
        FROM HierarchyScope S
        INNER JOIN dbo.AR_OpListDetailTbl D
            ON D.EmployeeID = S.EffectiveEmployeeID
           AND COALESCE(D.isDisable, 0) = 0
        WHERE S.IsAdmin = 0
          AND S.IsSelfAssign = 0
          AND S.LevelSub = 1
          AND NULLIF(LTRIM(RTRIM(D.ObjectGroupID)), '') IS NOT NULL

        UNION

        SELECT DISTINCT E.ObjectGroupID
        FROM HierarchyScope S
        INNER JOIN dbo.AR_OpListEmployeeTbl E
            ON E.ManagerID = S.EffectiveEmployeeID
           AND COALESCE(E.isDisable, 0) = 0
        WHERE S.IsAdmin = 0
          AND S.IsSelfAssign = 0
          AND S.LevelSub = 0
          AND NULLIF(LTRIM(RTRIM(E.ObjectGroupID)), '') IS NOT NULL
    ),
    AllowedLocations AS
    (
        SELECT P.TinhThanh
        FROM HierarchyScope S
        INNER JOIN dbo.CF_TinhThanhTbl P ON P.TinhThanh = S.SelfAssignLocationID
        WHERE S.IsSelfAssign = 1

        UNION

        SELECT P.TinhThanh
        FROM dbo.CF_TinhThanhTbl P
        CROSS JOIN HierarchyScope S
        WHERE S.IsAdmin = 1
          AND S.IsSelfAssign = 0

        UNION

        SELECT P.TinhThanh
        FROM AllowedGroups A
        INNER JOIN dbo.CF_ObjectGroupTbl G ON G.ObjectGroupID = A.ObjectGroupID
        INNER JOIN dbo.CF_TinhThanhTbl P ON P.TinhThanh = G.LocationID

        UNION

        SELECT P.TinhThanh
        FROM AllowedGroups A
        INNER JOIN dbo.CF_ObjectTbl C ON C.ObjectGroupID = A.ObjectGroupID
        INNER JOIN dbo.CF_TinhThanhTbl P ON P.TinhThanh = C.LocationID
    )
    SELECT DISTINCT
           L.TinhThanh AS LocationID,
           L.TinhThanh AS LocationName
    FROM AllowedLocations L
);
GO

CREATE OR ALTER PROCEDURE dbo.API_TinhThanhByUser_AI
    @User       VARCHAR(50),
    @LocationID NVARCHAR(50) = N'',
    @SearchText NVARCHAR(250) = N''
AS
BEGIN
    SET NOCOUNT ON;

    SET @User = LTRIM(RTRIM(COALESCE(@User, '')));
    SET @LocationID = LTRIM(RTRIM(COALESCE(@LocationID, N'')));
    SET @SearchText = LTRIM(RTRIM(COALESCE(@SearchText, N'')));

    IF NOT EXISTS
    (
        SELECT 1
        FROM dbo.SY_User
        WHERE UserName = @User
          AND COALESCE(Disable, 0) = 0
          AND COALESCE(ObjectID, '') = ''
    )
    BEGIN
        SELECT N'Tài khoản không hợp lệ hoặc không có quyền tạo khách hàng.' AS Msg,
               1 AS MsgType;
        RETURN;
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.AI_GetTinhThanhByUserFnc(@User))
    BEGIN
        SELECT N'Tài khoản chưa được cấu hình tỉnh/thành trong phạm vi nhóm khách hàng.' AS Msg,
               1 AS MsgType;
        RETURN;
    END;

    SELECT LocationID, LocationName
    FROM dbo.AI_GetTinhThanhByUserFnc(@User)
    WHERE (@LocationID = N'' OR LocationID = @LocationID)
      AND (@SearchText = N'' OR LocationName LIKE N'%' + @SearchText + N'%')
    ORDER BY LocationName;
END;
GO
