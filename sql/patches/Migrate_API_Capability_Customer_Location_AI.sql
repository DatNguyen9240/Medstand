USE medtest;
GO

SET XACT_ABORT ON;
GO

/* Cấp metadata READ cho API tỉnh/thành theo phạm vi của luồng tạo khách AI. */
BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID('dbo.API_TinhThanhByUser_AI', 'P') IS NULL
       OR OBJECT_ID('dbo.AI_GetTinhThanhByUserFnc', 'IF') IS NULL
        THROW 51411, N'Chưa triển khai API_TinhThanhByUser_AI hoặc AI_GetTinhThanhByUserFnc.', 1;

    IF NOT EXISTS
    (
        SELECT 1
        FROM dbo.API_Definition
        WHERE StoredProcedure = 'API_TinhThanhByUser_AI'
    )
        THROW 51412, N'API_TinhThanhByUser_AI chưa được đăng ký trong API_Definition.', 1;

    IF EXISTS
    (
        SELECT 1
        FROM dbo.API_Definition D
        INNER JOIN dbo.API_Field F ON F.ApiID = D.ApiID
        WHERE D.StoredProcedure = 'API_TinhThanhByUser_AI'
          AND F.FieldCode = '@User'
          AND COALESCE(F.IsSystemParam, 0) = 0
    )
        THROW 51413, N'@User của API_TinhThanhByUser_AI phải là tham số hệ thống.', 1;

    UPDATE dbo.API_Definition
    SET OperationType = 'READ',
        RequiredCapability = 'api.read',
        AllowedCapabilities = N'["api.read"]',
        ScopeResolver = 'VERIFIED_USER_HIERARCHY',
        OwnershipRule = 'TDV_OWN_OR_MANAGER_BRANCH',
        ContractVersion = '2026.08.05.1',
        ContractUpdatedAt = SYSUTCDATETIME(),
        ContractUpdatedBy = 'CUSTOMER-LOCATION-SCOPE'
    WHERE StoredProcedure = 'API_TinhThanhByUser_AI';

    IF @@ROWCOUNT <> 1
        THROW 51414, N'Không cập nhật đúng một API tỉnh/thành theo quyền.', 1;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

SELECT ApiCode, StoredProcedure, OperationType, RequiredCapability,
       ScopeResolver, OwnershipRule, ContractVersion
FROM dbo.API_Definition
WHERE StoredProcedure = 'API_TinhThanhByUser_AI';
GO

