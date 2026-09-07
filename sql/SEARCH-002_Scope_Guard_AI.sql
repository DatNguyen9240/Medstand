SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  SEARCH-002 — Chặn tìm kiếm khi phạm vi khách hàng của tài khoản không xác định
  được rõ ràng, thay vì để lộ toàn bộ danh sách khách (lỗi CORE-001).

  ── Vì sao cần hàm riêng, không gọi thẳng AR_GetObjectByUserFnc ──
  AR_GetObjectByUserFnc (TVF của ERP, không có mã nguồn trong repo này) khi gặp
  tài khoản Manager = 1 nhưng không tìm thấy trong sơ đồ tổ chức thì rẽ vào nhánh
  "ban lãnh đạo" và trả về TẤT CẢ khách hàng — nhánh này tồn tại để phục vụ đúng
  các tài khoản lãnh đạo thật sự (Admin/CEO/CEO.MED/demo/GIANG_TPQT/Trung, những
  tài khoản KHÔNG gắn mã nhân viên nào), nhưng cũng vô tình fail-open cho các tài
  khoản CÓ mã nhân viên thật mà chưa được khai trong sơ đồ (QLMD1, QLBH024.MED đã
  được vá — xem Fix_UAT13_Manager_Scope_AI.sql; TRUNGBM còn tồn tại lỗi này).

  Hàm này phân biệt hai trường hợp bằng đúng dữ liệu Fix_UAT13 đã dùng để chẩn
  đoán: SY_User.EmployeeID/ManagerID/CeoID gốc (trước khi suy luận) đều rỗng thì
  mới là lãnh đạo thật; ngược lại nếu suy ra được một EmployeeID cụ thể mà mã đó
  không xuất hiện trong AR_OpListDetailTbl (với vai trò nhân viên) lẫn
  AR_OpListEmployeeTbl (với vai trò quản lý của người khác) thì coi là CHƯA XÁC
  ĐỊNH ĐƯỢC PHẠM VI — API tìm kiếm phải từ chối thay vì đoán bừa.

  ── Cảnh báo bảo trì ──
  Đoạn suy luận EmployeeID/OpID bên dưới cố tình lặp lại logic đã có trong
  API_ObjectGroupByUser_AI (sql/Module_Common_API_ObjectGroupByUser_AI.sql) vì
  mục đích hai nơi khác nhau (nơi kia luôn fail-closed cho mọi @OpID=0, kể cả
  lãnh đạo thật; nơi này phải phân biệt lãnh đạo thật với lỗi CORE-001). Sửa suy
  luận EmployeeID/OpID ở một trong hai nơi thì phải rà lại nơi còn lại.

  Tham chiếu: sql/Fix_UAT13_Manager_Scope_AI.sql, sql/Module_Common_API_ObjectGroupByUser_AI.sql
*/
CREATE OR ALTER FUNCTION dbo.AI_ScopeGuardFnc (@Username VARCHAR(50))
RETURNS @Result TABLE
(
    IsGloballyScoped  BIT         NOT NULL,
    IsScopeResolvable BIT         NOT NULL,
    DecisionCode      VARCHAR(50) NOT NULL
)
AS
BEGIN
    DECLARE @RawEmployeeID VARCHAR(50), @RawManagerID VARCHAR(50), @RawCeoID VARCHAR(50);

    SELECT @RawEmployeeID = EmployeeID, @RawManagerID = ManagerID, @RawCeoID = CeoID
    FROM dbo.SY_User
    WHERE UserName = @Username AND COALESCE(Disable, 0) = 0;

    IF @@ROWCOUNT = 0
    BEGIN
        INSERT @Result (IsGloballyScoped, IsScopeResolvable, DecisionCode)
        VALUES (0, 0, 'USER_NOT_FOUND');
        RETURN;
    END;

    -- Không gắn mã nhân viên nào ở cả ba cột gốc: đúng pattern lãnh đạo/hệ thống
    -- thật sự (Admin/CEO/demo...) theo ghi chú trong Fix_UAT13_Manager_Scope_AI.sql.
    IF COALESCE(@RawEmployeeID, '') = '' AND COALESCE(@RawManagerID, '') = '' AND COALESCE(@RawCeoID, '') = ''
    BEGIN
        INSERT @Result (IsGloballyScoped, IsScopeResolvable, DecisionCode)
        VALUES (1, 1, 'GLOBAL_LEADERSHIP');
        RETURN;
    END;

    -- Suy EmployeeID theo đúng thứ tự ưu tiên mà API_ObjectGroupByUser_AI dùng.
    DECLARE @EmployeeID VARCHAR(50) = @RawEmployeeID;
    IF COALESCE(@EmployeeID, '') = '' AND COALESCE(@RawManagerID, '') = '' SET @EmployeeID = @RawCeoID;
    IF COALESCE(@EmployeeID, '') = '' AND COALESCE(@RawCeoID, '') = '' SET @EmployeeID = @RawManagerID;

    IF EXISTS (SELECT 1 FROM dbo.AR_OpListDetailTbl D WHERE D.EmployeeID = @EmployeeID AND ISNULL(D.isDisable, 0) = 0)
       OR EXISTS (SELECT 1 FROM dbo.AR_OpListEmployeeTbl E WHERE E.ManagerID = @EmployeeID AND ISNULL(E.isDisable, 0) = 0)
    BEGIN
        INSERT @Result (IsGloballyScoped, IsScopeResolvable, DecisionCode)
        VALUES (0, 1, 'ORG_CHART_RESOLVED');
        RETURN;
    END;

    -- Có mã nhân viên thật nhưng không xuất hiện ở đâu trong sơ đồ tổ chức —
    -- đúng dấu hiệu lỗi CORE-001. Chặn tìm kiếm thay vì để AR_GetObjectByUserFnc
    -- âm thầm trả về toàn bộ khách hàng.
    INSERT @Result (IsGloballyScoped, IsScopeResolvable, DecisionCode)
    VALUES (0, 0, 'ORG_CHART_MISSING');
    RETURN;
END;
GO
