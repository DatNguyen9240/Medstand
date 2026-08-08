USE medtest;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  API_EmployeeByManager_AI — Danh sách nhân viên bán hàng dưới quyền của tài khoản
  đang đăng nhập, dùng cho bước "khách này giao cho sale nào" khi manager tạo
  khách hàng qua trợ lý AI.

  ── Vì sao cần bước chỉ định sale ──
  Manager có từ 10 đến 214 nhóm đối tượng trong phạm vi, không thể liệt kê hết ra
  cho chọn. Nhưng khách hàng mới bao giờ cũng thuộc địa bàn của một sale cụ thể,
  và danh sách sale dưới quyền thì ngắn. Nên contract chọn cách hỏi ai phụ trách,
  rồi lấy ObjectGroupID của sale đó.

  ── Ba cái bẫy đã vấp khi kiểm chứng ──
  1. AR_OpListEmployeeTbl có MỘT DÒNG cho mỗi cặp (nhân viên × nhóm). Không
     GROUP BY thì QLMN2 ra 122 dòng thô trong khi chỉ có 38 nhân viên thật.
  2. Không có bảng danh mục nhân viên riêng — tên người nằm ở SY_User.HoTen. Và
     có nhân viên KHÔNG có tài khoản đăng nhập (ví dụ MED0139, MED0141) nên HoTen
     trả về NULL. Phải COALESCE về EmployeeID, nếu không dropdown hiện dòng trống.
  3. SQL Server không cho dùng DISTINCT chung với mệnh đề OVER.

  ── Kết quả trả về ──
  Thành công : EmployeeID, DisplayName, UserName, SoNhom, ObjectGroupID
               ObjectGroupID chỉ có giá trị khi nhân viên đó có đúng 1 nhóm, để
               chat gán thẳng không cần hỏi thêm; nhiều nhóm thì trả NULL và chat
               phải hỏi tiếp.
  Lỗi        : Msg, MsgType = 1
  Client phải kiểm tra sự tồn tại của cột MsgType trước khi đọc dữ liệu.

  ── Đã kiểm chứng trên medtest ngày 2026-07-29 ──
  QLBH013.MED -> 10 nhân viên, QLMN2 -> 38 nhân viên (từ 122 dòng thô),
  QLMD1 -> 0 nhân viên.

  QLMD1 và QLBH024.MED có Manager = 1 nhưng không nằm trong sơ đồ tổ chức nên vừa
  không sở hữu nhóm nào, vừa không có ai dưới quyền. Cả hai procedure của CORE-001
  đều trả lỗi cho họ; đây là hành vi có chủ đích, không phải thiếu sót.

  Tham chiếu: docs/CORE-001_CONTRACT_CHAT_TAO_KHACH_HANG_2026-07-29.md
*/
CREATE OR ALTER PROCEDURE [dbo].[API_EmployeeByManager_AI]
    @User VARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @EmployeeID VARCHAR(50),
            @ManagerID  VARCHAR(50),
            @CeoID      VARCHAR(50),
            @Found      INT = 0;

    SELECT @EmployeeID = EmployeeID,
           @ManagerID  = ManagerID,
           @CeoID      = CeoID,
           @Found      = 1
    FROM dbo.SY_User
    WHERE UserName = @User
      AND COALESCE(Disable, 0) = 0;

    IF @Found = 0
    BEGIN
        SELECT N'Tài khoản không hợp lệ hoặc đã bị khóa.' AS [Msg], 1 AS [MsgType];
        RETURN;
    END

    -- SELF_ASSIGN là một capability cấu hình phía server, không phải ngoại lệ
    -- hard-code theo username trong frontend. Trả một dòng kỹ thuật để client
    -- tự ẩn bước giao nhân viên và server vẫn có đủ SaleID/ObjectGroupID.
    IF OBJECT_ID(N'dbo.AI_CustomerSelfAssignConfig', N'U') IS NOT NULL
       AND EXISTS
       (
           SELECT 1
           FROM dbo.AI_CustomerSelfAssignConfig C
           INNER JOIN dbo.CF_ObjectGroupTbl G ON G.ObjectGroupID = C.ObjectGroupID
           WHERE C.Username = @User
             AND C.IsActive = 1
             AND COALESCE(G.isCustomer, 0) = 1
       )
    BEGIN
        SELECT C.EmployeeID,
               C.DisplayName,
               @User AS UserName,
               1 AS SoNhom,
               C.ObjectGroupID,
               CAST(1 AS BIT) AS IsSelfAssign
        FROM dbo.AI_CustomerSelfAssignConfig C
        INNER JOIN dbo.CF_ObjectGroupTbl G ON G.ObjectGroupID = C.ObjectGroupID
        WHERE C.Username = @User
          AND C.IsActive = 1
          AND COALESCE(G.isCustomer, 0) = 1;
        RETURN;
    END

    -- Giữ đúng thứ tự ưu tiên của AR_GetObjectByUserFnc để hai procedure của
    -- CORE-001 luôn suy ra cùng một EmployeeID cho cùng một tài khoản.
    IF COALESCE(@EmployeeID, '') = '' AND COALESCE(@ManagerID, '') = '' SET @EmployeeID = @CeoID;
    IF COALESCE(@EmployeeID, '') = '' AND COALESCE(@CeoID, '')    = '' SET @EmployeeID = @ManagerID;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.AR_OpListEmployeeTbl
        WHERE ISNULL(isDisable, 0) = 0
          AND ManagerID = @EmployeeID
    )
    BEGIN
        SELECT N'Tài khoản không có nhân viên nào dưới quyền để giao khách hàng.' AS [Msg], 1 AS [MsgType];
        RETURN;
    END

    SELECT E.EmployeeID,
           COALESCE(NULLIF(LTRIM(RTRIM(MAX(U.HoTen))), ''), E.EmployeeID) AS DisplayName,
           MAX(U.UserName)                    AS UserName,
           COUNT(DISTINCT E.ObjectGroupID)    AS SoNhom,
           CASE WHEN COUNT(DISTINCT E.ObjectGroupID) = 1
                THEN MAX(E.ObjectGroupID)
           END                                AS ObjectGroupID,
           CAST(0 AS BIT)                     AS IsSelfAssign
    FROM dbo.AR_OpListEmployeeTbl E
        LEFT JOIN dbo.SY_User U
               ON U.EmployeeID = E.EmployeeID
              AND COALESCE(U.Disable, 0) = 0
    WHERE ISNULL(E.isDisable, 0) = 0
      AND E.ManagerID = @EmployeeID
    GROUP BY E.EmployeeID
    ORDER BY DisplayName;
END
GO
