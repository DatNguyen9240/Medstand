/*
  Canonical customer-create API code for chatbot UAT.

  Contract:
    @khach_hang_insert_ai -> dbo.API_KhachHang_Insert_AI -> dbo.CF_ObjectTbl

  This migration deliberately does not delete legacy metadata.  If a legacy
  row exists, it is deactivated so existing foreign-key references and audit
  history remain intact.  It only renames the legacy row when that row already
  points at the AI procedure; a legacy ERP procedure is never repurposed.
*/
USE medtest;
GO

SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID('dbo.API_KhachHang_Insert_AI', 'P') IS NULL
        THROW 51401, N'Chua co dbo.API_KhachHang_Insert_AI. Hay deploy procedure truoc.', 1;

    IF OBJECT_ID('dbo.API_Definition', 'U') IS NULL
        THROW 51402, N'Chua co dbo.API_Definition. Hay chay Bootstrap_API_Metadata_Auto_AI.sql truoc.', 1;

    IF COL_LENGTH('dbo.API_Definition', 'OperationType') IS NULL
       OR COL_LENGTH('dbo.API_Definition', 'RequiredCapability') IS NULL
       OR COL_LENGTH('dbo.API_Definition', 'AllowedCapabilities') IS NULL
       OR COL_LENGTH('dbo.API_Definition', 'ScopeResolver') IS NULL
       OR COL_LENGTH('dbo.API_Definition', 'OwnershipRule') IS NULL
        THROW 51403, N'API_Definition chua co capability metadata. Hay chay Migrate_API_Capability_Metadata_AI.sql truoc.', 1;

    DECLARE @CanonicalApiID INT = NULL;
    DECLARE @LegacyAiApiID INT = NULL;

    SELECT @CanonicalApiID = ApiID
    FROM dbo.API_Definition WITH (UPDLOCK, HOLDLOCK)
    WHERE ApiCode = '@khach_hang_insert_ai';

    SELECT @LegacyAiApiID = ApiID
    FROM dbo.API_Definition WITH (UPDLOCK, HOLDLOCK)
    WHERE ApiCode = '@khach_hang_insert'
      AND StoredProcedure = 'API_KhachHang_Insert_AI';

    /* A prior deployment may have registered the AI procedure under the old
       ApiCode. Rename that exact row only when a canonical row does not exist. */
    IF @CanonicalApiID IS NULL AND @LegacyAiApiID IS NOT NULL
    BEGIN
        UPDATE dbo.API_Definition
        SET ApiCode = '@khach_hang_insert_ai'
        WHERE ApiID = @LegacyAiApiID;

        SET @CanonicalApiID = @LegacyAiApiID;
    END

    IF @CanonicalApiID IS NULL
        THROW 51404, N'Chua dang ky @khach_hang_insert_ai. Hay chay Bootstrap_API_Metadata_Auto_AI voi @Apply = 1 truoc.', 1;

    /* The canonical code must resolve to the direct-create procedure. */
    UPDATE dbo.API_Definition
    SET StoredProcedure = 'API_KhachHang_Insert_AI',
        IsActive = 1,
        OperationType = 'MUTATION',
        RequiredCapability = 'customers.write',
        AllowedCapabilities = N'["customers.write"]',
        ScopeResolver = 'VERIFIED_USER_HIERARCHY',
        OwnershipRule = 'SERVER_VERIFIED_SCOPE_ONLY',
        ContractVersion = '2026.07.29.2',
        ContractUpdatedAt = SYSUTCDATETIME(),
        ContractUpdatedBy = 'CUSTOMER_CREATE_AI'
    WHERE ApiID = @CanonicalApiID;

    /* Never expose or authorize the obsolete ApiCode through the catalog. */
    UPDATE dbo.API_Definition
    SET IsActive = 0,
        OperationType = 'DENY',
        RequiredCapability = NULL,
        AllowedCapabilities = N'[]',
        ScopeResolver = 'NONE',
        OwnershipRule = 'DENY',
        ContractUpdatedAt = SYSUTCDATETIME(),
        ContractUpdatedBy = 'CUSTOMER_CREATE_AI'
    WHERE ApiCode = '@khach_hang_insert';

    IF OBJECT_ID('dbo.API_Metadata_Override', 'U') IS NOT NULL
    BEGIN
        MERGE dbo.API_Metadata_Override AS target
        USING (VALUES ('API_KhachHang_Insert_AI', '@khach_hang_insert_ai')) AS source (StoredProcedure, ApiCode)
        ON target.StoredProcedure = source.StoredProcedure
        WHEN MATCHED THEN UPDATE SET ApiCode = source.ApiCode
        WHEN NOT MATCHED THEN INSERT (StoredProcedure, ApiCode) VALUES (source.StoredProcedure, source.ApiCode);
    END

    IF EXISTS (
        SELECT 1
        FROM dbo.API_Definition
        WHERE ApiCode = '@khach_hang_insert_ai'
          AND (StoredProcedure <> 'API_KhachHang_Insert_AI'
            OR IsActive <> 1
            OR OperationType <> 'MUTATION'
            OR RequiredCapability <> 'customers.write')
    )
        THROW 51405, N'Khong the chot metadata canonical cho API tao khach AI.', 1;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

SELECT ApiCode, StoredProcedure, IsActive, OperationType,
       RequiredCapability, AllowedCapabilities, ScopeResolver, OwnershipRule,
       ContractVersion, ContractUpdatedBy
FROM dbo.API_Definition
WHERE ApiCode IN ('@khach_hang_insert', '@khach_hang_insert_ai')
ORDER BY ApiCode;
GO
