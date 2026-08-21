SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

/*
  ORDER-APPROVAL-003 — Metadata phân quyền cho 2 API duyệt đơn.

  Vì sao cần: hai API này được sinh vào dbo.API_Definition với OperationType/RequiredCapability/
  AllowedCapabilities/ScopeResolver/OwnershipRule/ContractVersion đều NULL. Theo đúng cảnh báo
  trong Migrate_API_Capability_Metadata_AI.sql, API mới sinh ra mà không có người điền metadata
  sẽ bị hạ xuống DENY rồi kẹt ở đó — hoặc tệ hơn, được coi là "chưa phân loại" trong các báo cáo
  kiểm soát. Nhóm MUTATION không bao giờ được auto-grant, nên phải khai tay ở đây.

  Ghi chú về scope: quyền duyệt/từ chối KHÔNG suy ra từ nhóm người dùng trong metadata này.
  Quyền thật do hợp đồng duyệt đơn trong dbo.AI_OrderApprovalRoleTbl quyết định (xem
  ORDER-APPROVAL-003_Approval_Contract_AI.sql). Metadata ở đây mô tả API, không thay thế hợp đồng.

  Chạy lại nhiều lần an toàn: chỉ UPDATE đúng 2 dòng theo ApiCode.
*/

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID('dbo.API_Definition', 'U') IS NULL
        THROW 51230, N'dbo.API_Definition does not exist.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.API_Definition WHERE ApiCode = '@don_hang_approve_transition')
        THROW 51231, N'Thiếu dòng API_Definition cho @don_hang_approve_transition. Chạy bootstrap metadata trước.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.API_Definition WHERE ApiCode = '@don_hang_approval_context')
        THROW 51232, N'Thiếu dòng API_Definition cho @don_hang_approval_context. Chạy bootstrap metadata trước.', 1;

    /* API ghi: đổi trạng thái đơn. Identity do gateway gắn từ token; phạm vi và transition do
       hợp đồng duyệt đơn quyết định trong procedure. */
    UPDATE dbo.API_Definition
    SET OperationType       = 'MUTATION',
        RequiredCapability  = 'orders.approve',
        AllowedCapabilities = N'["orders.approve"]',
        ScopeResolver       = 'VERIFIED_USER_HIERARCHY',
        OwnershipRule       = 'SERVER_VERIFIED_SCOPE_ONLY',
        ContractVersion     = '2026.08.21.1',
        ContractUpdatedAt   = SYSUTCDATETIME(),
        ContractUpdatedBy   = 'ORDER-APPROVAL-003'
    WHERE ApiCode = '@don_hang_approve_transition';

    /* API đọc: trạng thái + quyền duyệt của chính người gọi. */
    UPDATE dbo.API_Definition
    SET OperationType       = 'READ',
        RequiredCapability  = 'api.read',
        AllowedCapabilities = N'["api.read"]',
        ScopeResolver       = 'VERIFIED_USER_HIERARCHY',
        OwnershipRule       = 'TDV_OWN_OR_MANAGER_BRANCH',
        ContractVersion     = '2026.08.21.1',
        ContractUpdatedAt   = SYSUTCDATETIME(),
        ContractUpdatedBy   = 'ORDER-APPROVAL-003'
    WHERE ApiCode = '@don_hang_approval_context';

    /* @Username của cả hai API phải là tham số hệ thống: client không được tự khai. Gateway
       (server.js) đã ghi đè từ token cho cả GET lẫn POST, đây là lớp khai báo tương ứng. */
    UPDATE f
    SET IsSystemParam = 1,
        ControlType = 'hidden',
        SourceOfTruth = 'SERVER_MAPPING'
    FROM dbo.API_Field f
    INNER JOIN dbo.API_Definition d ON d.ApiID = f.ApiID
    WHERE d.ApiCode IN ('@don_hang_approve_transition', '@don_hang_approval_context')
      AND LOWER(f.FieldCode) = '@username';

    /* IdempotencyKey/RequestID cũng do gateway sinh, không phải người dùng nhập. */
    UPDATE f
    SET IsSystemParam = 1,
        ControlType = 'hidden',
        SourceOfTruth = 'SERVER_MAPPING'
    FROM dbo.API_Field f
    INNER JOIN dbo.API_Definition d ON d.ApiID = f.ApiID
    WHERE d.ApiCode = '@don_hang_approve_transition'
      AND LOWER(f.FieldCode) IN ('@idempotencykey', '@requestid');

    /* Tham số @Reason mới thêm ở procedure — bổ sung vào metadata nếu chưa có. */
    INSERT dbo.API_Field (ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam, OrderIndex, SourceOfTruth)
    SELECT d.ApiID, '@Reason', N'Lý do', 'NVARCHAR', 'text', 0, 0,
           COALESCE((SELECT MAX(OrderIndex) FROM dbo.API_Field WHERE ApiID = d.ApiID), 0) + 1,
           'USER_INPUT'
    FROM dbo.API_Definition d
    WHERE d.ApiCode = '@don_hang_approve_transition'
      AND NOT EXISTS (SELECT 1 FROM dbo.API_Field f WHERE f.ApiID = d.ApiID AND LOWER(f.FieldCode) = '@reason');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

/* Kiểm chứng sau khi chạy: không còn cột quản trị nào NULL ở hai API này. */
SELECT ApiCode, StoredProcedure, OperationType, RequiredCapability, AllowedCapabilities,
       ScopeResolver, OwnershipRule, ContractVersion, ContractUpdatedAt, ContractUpdatedBy
FROM dbo.API_Definition
WHERE ApiCode IN ('@don_hang_approve_transition', '@don_hang_approval_context');
GO
