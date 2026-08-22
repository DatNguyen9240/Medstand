USE medtest;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  API_ObjectGroupByUser_AI — Danh sách nhóm đối tượng mà tài khoản đang đăng nhập
  được phép gán cho khách hàng tạo mới qua trợ lý AI.

  ── Vì sao cần procedure riêng thay vì dùng lại API_NhomKhachHang ──
  API_NhomKhachHang lọc theo @EmployeeID/@ManagerID do CLIENT gửi lên, tham số
  @User của nó không hề tham gia lọc, và truyền @EmployeeID = '' thì nó trả về
  toàn bộ nhóm của hệ thống. Với một dropdown hiển thị thì không sao.

  Nhưng ObjectGroupID là KHOÁ PHÂN QUYỀN: AR_GetObjectByUserFnc lọc phạm vi khách
  hàng hoàn toàn theo cột này, không hề dùng BranchID. Gán sai giá trị thì khách
  vừa tạo sẽ nằm ngoài tầm nhìn của chính người tạo, hoặc tệ hơn là rơi vào sổ của
  bộ phận khác. Vì vậy procedure này chỉ nhận @User và tự suy EmployeeID phía
  server, không tin bất kỳ tham số phân quyền nào từ client.

  ── Cảnh báo bảo trì ──
  Toàn bộ nhánh phân quyền bên dưới SAO CHÉP NGUYÊN VĂN AR_GetObjectByUserFnc.
  Sửa một bên mà quên bên kia thì form sẽ mời người dùng chọn một nhóm mà chính
  họ không nhìn thấy — tái tạo đúng con bug mà CORE-001 đi sửa.

  ── Kết quả trả về ──
  Thành công : ObjectGroupID, ObjectGroupName  (0..n dòng)
  Lỗi        : Msg, MsgType = 1                (1 dòng, không có cột ObjectGroupID)
  Client phải kiểm tra sự tồn tại của cột MsgType trước khi đọc dữ liệu.

  ── Đã kiểm chứng trên medtest ngày 2026-07-29 ──
  Số nhóm procedure trả về so với số nhóm thực sự nhìn thấy qua
  AR_GetObjectByUserFnc: NAMDINHB.MED 1/1, BACNINHA.MED 1/1, HUEB.MED 1/1,
  CanThoA 1/1, BinhPhuocA 2/2, QLBH013.MED 10/10, QLMN2 41/41 — khớp tuyệt đối,
  không mời nhóm nào ngoài quyền.

  Ngoại lệ đã biết: QLMD1 và QLBH024.MED có Manager = 1 nhưng KHÔNG có dòng nào
  trong AR_OpListDetailTbl. AR_GetObjectByUserFnc rẽ vào nhánh "ban lãnh đạo" và
  trả về toàn bộ 49.558 khách, trong khi hai tài khoản này không sở hữu nhóm nào
  và cũng không có nhân viên dưới quyền. Procedure trả lỗi cho họ theo đúng điều
  khoản "không có nhóm nào -> FORBIDDEN" của contract; họ dùng màn hình UI để tạo
  khách. Xem thêm mục ghi chú UAT-007 trong tài liệu contract.

  Tham chiếu: docs/CORE-001_CONTRACT_CHAT_TAO_KHACH_HANG_2026-07-29.md
*/
CREATE OR ALTER PROCEDURE [dbo].[API_ObjectGroupByUser_AI]
    @User VARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @EmployeeID VARCHAR(50),
            @ManagerID  VARCHAR(50),
            @CeoID      VARCHAR(50),
            @ObjectID   VARCHAR(50),
            @Found      INT = 0;

    -- Danh tính và phạm vi chỉ được lấy từ tài khoản đã xác thực còn hiệu lực.
    SELECT @EmployeeID = EmployeeID,
           @ManagerID  = ManagerID,
           @CeoID      = CeoID,
           @ObjectID   = ObjectID,
           @Found      = 1
    FROM dbo.SY_User
    WHERE UserName = @User
      AND COALESCE(Disable, 0) = 0;

    IF @Found = 0
    BEGIN
        SELECT N'Tài khoản không hợp lệ hoặc đã bị khóa.' AS [Msg], 1 AS [MsgType];
        RETURN;
    END

    -- SY_User.ObjectID khác rỗng nghĩa là tài khoản gắn cứng vào đúng một khách
    -- hàng (tài khoản tra cứu của chính khách). Loại này không tạo khách mới.
    IF COALESCE(@ObjectID, '') <> ''
    BEGIN
        SELECT N'Tài khoản này không có quyền tạo khách hàng.' AS [Msg], 1 AS [MsgType];
        RETURN;
    END

    -- Tài khoản được cấu hình SELF_ASSIGN chỉ nhận đúng nhóm kỹ thuật của mình.
    -- Không suy quyền từ cờ Admin/Manager và không cho client chọn nhóm khác.
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
        SELECT G.ObjectGroupID,
               G.ObjectGroupName,
               CAST(1 AS BIT) AS IsSelfAssign
        FROM dbo.AI_CustomerSelfAssignConfig C
        INNER JOIN dbo.CF_ObjectGroupTbl G ON G.ObjectGroupID = C.ObjectGroupID
        WHERE C.Username = @User
          AND C.IsActive = 1
          AND COALESCE(G.isCustomer, 0) = 1;
        RETURN;
    END

    -- Suy EmployeeID theo đúng thứ tự ưu tiên của AR_GetObjectByUserFnc.
    IF COALESCE(@EmployeeID, '') = '' AND COALESCE(@ManagerID, '') = '' SET @EmployeeID = @CeoID;     -- Ceo login
    IF COALESCE(@EmployeeID, '') = '' AND COALESCE(@CeoID, '')    = '' SET @EmployeeID = @ManagerID;  -- Manager login

    -- LevelSub nằm ở bảng cha AR_OpListTbl, KHÔNG phải AR_OpListDetailTbl.
    -- ORDER BY LevelCount để lấy cấp cao nhất mà nhân viên này được gán.
    DECLARE @OpID INT, @LevelSub BIT;

    SELECT TOP 1
           @OpID     = A.OpID,
           @LevelSub = B.LevelSub
    FROM dbo.AR_OpListDetailTbl A
        INNER JOIN dbo.AR_OpListTbl B ON B.OpID = A.OpID
    WHERE A.EmployeeID = @EmployeeID
      AND ISNULL(A.isDisable, 0) = 0
    ORDER BY B.LevelCount;

    -- Không có mặt trong sơ đồ tổ chức. AR_GetObjectByUserFnc sẽ cho tài khoản
    -- Manager = 1 nhìn thấy toàn bộ khách hàng, nhưng "thấy tất cả" không đồng
    -- nghĩa với "sở hữu nhóm nào". Không có nhóm thì không thể quyết định khách
    -- mới thuộc về ai, nên chặn tại đây thay vì đoán bừa.
    IF COALESCE(@OpID, 0) = 0
    BEGIN
        SELECT N'Tài khoản chưa được gán nhóm đối tượng nên không thể tạo khách hàng qua trợ lý. Vui lòng dùng màn hình Quản lý khách hàng hoặc liên hệ quản trị viên.'
               AS [Msg], 1 AS [MsgType];
        RETURN;
    END

    IF @LevelSub = 1
    BEGIN
        -- Cấp cuối (nhân viên bán hàng): lấy các nhóm được gán trực tiếp.
        SELECT DISTINCT
               D.ObjectGroupID,
               G.ObjectGroupName,
               CAST(0 AS BIT) AS IsSelfAssign
        FROM dbo.AR_OpListDetailTbl D
            LEFT JOIN dbo.CF_ObjectGroupTbl G ON G.ObjectGroupID = D.ObjectGroupID
        WHERE ISNULL(D.isDisable, 0) = 0
          AND D.EmployeeID = @EmployeeID
        ORDER BY D.ObjectGroupID;
    END
    ELSE
    BEGIN
        -- Cấp quản lý: lấy các nhóm của toàn bộ nhân viên dưới quyền.
        SELECT DISTINCT
               E.ObjectGroupID,
               G.ObjectGroupName,
               CAST(0 AS BIT) AS IsSelfAssign
        FROM dbo.AR_OpListEmployeeTbl E
            LEFT JOIN dbo.CF_ObjectGroupTbl G ON G.ObjectGroupID = E.ObjectGroupID
        WHERE ISNULL(E.isDisable, 0) = 0
          AND E.ManagerID = @EmployeeID
        ORDER BY E.ObjectGroupID;
    END
END
GO
