USE medtest;
GO

SET XACT_ABORT ON;
GO

/*
 ═══════════════════════════════════════════════════════════════════════════
  Cấp cấu hình phân quyền cho hai API tra cứu của CORE-001
  ─────────────────────────────────────────────────────────────────────────
    @object_group_by_user  ->  API_ObjectGroupByUser_AI
    @employee_by_manager   ->  API_EmployeeByManager_AI

  ── Vì sao cần script này ──
  API_Metadata_AutoBootstrap_AI tự đăng ký procedure mới vào API_Definition và
  API_Field (và đã đánh dấu đúng @User là IsSystemParam = 1), NHƯNG nó không hề
  đụng tới các cột quản trị: OperationType, RequiredCapability,
  AllowedCapabilities, ScopeResolver, OwnershipRule.

  Các cột đó chỉ được điền một lần duy nhất bởi Migrate_API_Capability_Metadata_AI.sql
  (ContractUpdatedBy = 'Codex:P1-02', ngày 2026-07-15). Mọi procedure tạo sau mốc
  đó đều được đăng ký nhưng bỏ trống quản trị.

  ── Hậu quả nếu không chạy ──
  Cổng phân quyền trong n8n/API_Services/API_Execute.json quyết định bằng:
      operationType !== 'DENY' && hasCapability
  và tên quyền được ghép:
      operationType === 'READ' ? 'api.read.' + apiSpecific
                               : requiredCapability + '.' + apiSpecific
  Với OperationType = NULL, tên quyền ghép thành chuỗi "null.<tên>" — không tài
  khoản nào có quyền tên như vậy, nên request bị từ chối. Hệ thống fail-closed,
  đúng thiết kế, nhưng nghĩa là hai API này không gọi được qua ApiCode.

  Lưu ý: nếu CORE-002 gọi bằng đường REST (/api/API_ObjectGroupByUser_AI qua
  /api/gateway) như khai báo hiện tại trong env.js thì registry không tham gia và
  hai API vẫn chạy. Script này chuẩn bị sẵn cho trường hợp chuyển sang gọi bằng
  ApiCode, đồng thời đưa hai API vào cùng hệ thống quản trị với 25 API đọc khác.

  ── Giá trị được chọn ──
  Bám đúng cấu hình mà Migrate_API_Capability_Metadata_AI.sql đặt cho nhóm READ.
  Toàn bộ 25 API đọc hiện có đều dùng chung cặp VERIFIED_USER_HIERARCHY +
  TDV_OWN_OR_MANAGER_BRANCH, kể cả các API không trả dữ liệu khách hàng như
  @danh_muc, @tra_cuu_san_pham, @danh_sach_tonkho. Đây là cấu hình chuẩn cho mọi
  API đọc chứ không phải luật riêng cho dữ liệu khách hàng.

  ── ⚠️ CẦN LÀM CÙNG LÚC ──
  Migrate_API_Capability_Metadata_AI.sql hoạt động theo allowlist tường minh: nó
  đặt MỌI dòng có OperationType IS NULL thành DENY, rồi chỉ nâng lên READ những
  ApiCode nằm trong danh sách cứng. Hai ApiCode mới đã được bổ sung vào danh sách
  đó. Nếu vì lý do nào đó chạy lại bản migration CŨ (chưa có hai tên này), hai API
  sẽ bị đặt về DENY và lỗi sẽ khó truy nguyên.

  ContractChecksum để nguyên NULL: script migration gốc cũng không đặt cột này,
  chưa rõ cơ chế nào sinh ra nó.

  An toàn khi chạy lại nhiều lần (idempotent).
 ═══════════════════════════════════════════════════════════════════════════
*/

BEGIN TRY
    BEGIN TRANSACTION;

    -- Guard 1: procedure phải tồn tại. Không cấp quyền cho thứ chưa được tạo.
    IF OBJECT_ID('dbo.API_ObjectGroupByUser_AI', 'P') IS NULL
       OR OBJECT_ID('dbo.API_EmployeeByManager_AI', 'P') IS NULL
        THROW 51301, N'Chưa tạo đủ hai stored procedure của CORE-001. Chạy hai file Module common - API_ObjectGroupByUser_AI.sql và API_EmployeeByManager_AI.sql trước.', 1;

    -- Guard 2: registry phải đã tự đăng ký đủ hai dòng.
    IF (SELECT COUNT(*) FROM dbo.API_Definition
        WHERE StoredProcedure IN ('API_ObjectGroupByUser_AI', 'API_EmployeeByManager_AI')) <> 2
        THROW 51302, N'API_Definition chưa có đủ hai dòng. Chạy EXEC dbo.API_Metadata_AutoBootstrap_AI @Apply = 1, @UpdateExisting = 1; trước.', 1;

    -- Guard 3: @User BẮT BUỘC là tham số hệ thống.
    -- Nếu không, người dùng gõ tay được username của người khác để lấy nhóm đối
    -- tượng của họ — đúng lỗ hổng mà hai procedure này sinh ra để bịt. Thà không
    -- cấp quyền còn hơn cấp quyền cho một API nhận danh tính từ client.
    IF EXISTS (
        SELECT 1
        FROM dbo.API_Definition d
            JOIN dbo.API_Field f ON f.ApiID = d.ApiID
        WHERE d.StoredProcedure IN ('API_ObjectGroupByUser_AI', 'API_EmployeeByManager_AI')
          AND f.FieldCode = '@User'
          AND ISNULL(f.IsSystemParam, 0) = 0
    )
        THROW 51303, N'Tham số @User chưa được đánh dấu IsSystemParam. Không cấp quyền cho tới khi sửa xong.', 1;

    UPDATE dbo.API_Definition
    SET OperationType       = 'READ',
        RequiredCapability  = 'api.read',
        AllowedCapabilities = N'["api.read"]',
        ScopeResolver       = 'VERIFIED_USER_HIERARCHY',
        OwnershipRule       = 'TDV_OWN_OR_MANAGER_BRANCH',
        ContractVersion     = '2026.07.29.1',
        ContractUpdatedAt   = SYSUTCDATETIME(),
        ContractUpdatedBy   = 'CORE-001'
    WHERE StoredProcedure IN ('API_ObjectGroupByUser_AI', 'API_EmployeeByManager_AI');

    -- Guard 4: giữ nguyên bất biến của migration gốc — không API nào được phép
    -- vừa khác DENY vừa thiếu metadata phân quyền.
    IF EXISTS (
        SELECT 1 FROM dbo.API_Definition
        WHERE OperationType <> 'DENY'
          AND (RequiredCapability IS NULL OR ScopeResolver IS NULL OR OwnershipRule IS NULL)
    )
        THROW 51304, N'Có API được cấp quyền nhưng thiếu metadata phân quyền.', 1;

    COMMIT TRANSACTION;
    PRINT 'CORE-001: da cap cau hinh READ cho 2 API tra cuu.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH
GO

-- ── Kiểm chứng sau khi chạy ──
SELECT d.ApiCode,
       d.StoredProcedure,
       d.IsActive,
       d.OperationType,
       d.RequiredCapability,
       d.AllowedCapabilities,
       d.ScopeResolver,
       d.OwnershipRule,
       d.ContractVersion,
       d.ContractUpdatedBy,
       (SELECT COUNT(*) FROM dbo.API_Field f
        WHERE f.ApiID = d.ApiID AND f.FieldCode = '@User' AND ISNULL(f.IsSystemParam, 0) = 1) AS UserLaThamSoHeThong
FROM dbo.API_Definition d
WHERE d.StoredProcedure IN ('API_ObjectGroupByUser_AI', 'API_EmployeeByManager_AI')
ORDER BY d.ApiCode;
GO

-- Còn API nào đang bật nhưng chưa có cấu hình quản trị không.
-- Kỳ vọng sau khi chạy: chỉ còn @read_request_audit (nằm ngoài phạm vi CORE-001).
SELECT ApiCode, StoredProcedure, IsActive, OperationType
FROM dbo.API_Definition
WHERE OperationType IS NULL
ORDER BY ApiID;
GO
