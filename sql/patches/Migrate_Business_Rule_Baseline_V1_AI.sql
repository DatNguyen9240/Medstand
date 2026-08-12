USE medtest;
GO

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

/*
    Business Rule Baseline v1 - configuration only.
    This migration is intentionally non-destructive and does not change any
    financial, discount, warehouse, or medical decision by itself.

    Rollback direction:
    - A failed batch is rolled back by the CATCH block below.
    - A successful test import is reverted by restoring the pre-import object
      definitions captured by the discovery script; no automatic DROP is used.
    - The config table must not be removed while it contains APPROVED rows.

    Rows are seeded as DRAFT. A stored procedure may consume a row only after
    an authorized owner changes it to APPROVED and supplies the approver and
    effective dates. This keeps the SQL deployable before the four required
    business sign-offs are complete.
*/

IF OBJECT_ID(N'dbo.AI_BusinessRuleConfigTbl', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_BusinessRuleConfigTbl
    (
        RuleConfigID INT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_AI_BusinessRuleConfig PRIMARY KEY,
        RuleCode VARCHAR(80) NOT NULL,
        RuleVersion VARCHAR(30) NOT NULL,
        ConfigKey VARCHAR(80) NOT NULL,
        ConfigValue NVARCHAR(200) NOT NULL,
        ValueType VARCHAR(20) NOT NULL
            CONSTRAINT DF_AI_BusinessRuleConfig_ValueType DEFAULT ('STRING'),
        Status VARCHAR(20) NOT NULL
            CONSTRAINT DF_AI_BusinessRuleConfig_Status DEFAULT ('DRAFT'),
        EffectiveFrom DATETIME2(0) NULL,
        EffectiveTo DATETIME2(0) NULL,
        ApprovedBy VARCHAR(100) NULL,
        ApprovalReason NVARCHAR(500) NULL,
        CreatedAt DATETIME2(0) NOT NULL
            CONSTRAINT DF_AI_BusinessRuleConfig_CreatedAt DEFAULT (SYSUTCDATETIME()),
        ModifiedAt DATETIME2(0) NOT NULL
            CONSTRAINT DF_AI_BusinessRuleConfig_ModifiedAt DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_AI_BusinessRuleConfig_Key
            UNIQUE (RuleCode, RuleVersion, ConfigKey),
        CONSTRAINT CK_AI_BusinessRuleConfig_Status
            CHECK (Status IN ('DRAFT', 'APPROVED', 'RETIRED')),
        CONSTRAINT CK_AI_BusinessRuleConfig_EffectiveRange
            CHECK (EffectiveTo IS NULL OR EffectiveFrom IS NULL OR EffectiveTo > EffectiveFrom)
    );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.AI_BusinessRuleConfigTbl WHERE RuleCode = 'BR-SALES-006' AND RuleVersion = '1.0.0' AND ConfigKey = 'MinPurchaseCount')
    INSERT dbo.AI_BusinessRuleConfigTbl (RuleCode, RuleVersion, ConfigKey, ConfigValue, ValueType, Status, ApprovalReason)
    VALUES ('BR-SALES-006', '1.0.0', 'MinPurchaseCount', N'3', 'INT', 'DRAFT', N'Baseline: đủ tối thiểu 3 hóa đơn để coi chu kỳ cá nhân là tin cậy.');

IF NOT EXISTS (SELECT 1 FROM dbo.AI_BusinessRuleConfigTbl WHERE RuleCode = 'BR-ROUTE-001' AND RuleVersion = '1.0.0' AND ConfigKey = 'InactiveVisitDays')
    INSERT dbo.AI_BusinessRuleConfigTbl (RuleCode, RuleVersion, ConfigKey, ConfigValue, ValueType, Status, ApprovalReason)
    VALUES ('BR-ROUTE-001', '1.0.0', 'InactiveVisitDays', N'45', 'INT', 'DRAFT', N'Baseline MVP: cảnh báo lâu chưa ghé sau 45 ngày.');

IF NOT EXISTS (SELECT 1 FROM dbo.AI_BusinessRuleConfigTbl WHERE RuleCode = 'BR-ROUTE-004' AND RuleVersion = '1.0.0' AND ConfigKey = 'DefaultTopN')
    INSERT dbo.AI_BusinessRuleConfigTbl (RuleCode, RuleVersion, ConfigKey, ConfigValue, ValueType, Status, ApprovalReason)
    VALUES ('BR-ROUTE-004', '1.0.0', 'DefaultTopN', N'8', 'INT', 'DRAFT', N'Baseline MVP: xếp hạng tối đa 5-8 khách trong tuyến.');

IF NOT EXISTS (SELECT 1 FROM dbo.AI_BusinessRuleConfigTbl WHERE RuleCode = 'BR-STOCK-005' AND RuleVersion = '1.0.0' AND ConfigKey = 'MaxAgeHours')
    INSERT dbo.AI_BusinessRuleConfigTbl (RuleCode, RuleVersion, ConfigKey, ConfigValue, ValueType, Status, ApprovalReason)
    VALUES ('BR-STOCK-005', '1.0.0', 'MaxAgeHours', N'24', 'INT', 'DRAFT', N'Chờ xác nhận trường thời điểm cập nhật tồn kho thực tế.');

IF NOT EXISTS (SELECT 1 FROM dbo.AI_BusinessRuleConfigTbl WHERE RuleCode = 'BR-PROGRAM-002' AND RuleVersion = '1.0.0' AND ConfigKey = 'RequiredStatus')
    INSERT dbo.AI_BusinessRuleConfigTbl (RuleCode, RuleVersion, ConfigKey, ConfigValue, ValueType, Status, ApprovalReason)
    VALUES ('BR-PROGRAM-002', '1.0.0', 'RequiredStatus', N'APPROVED+ACTIVE', 'STRING', 'DRAFT', N'Chờ xác nhận cột trạng thái/phê duyệt của bảng chương trình.');

IF NOT EXISTS (SELECT 1 FROM dbo.AI_BusinessRuleConfigTbl WHERE RuleCode = 'BR-TIER-005' AND RuleVersion = '1.0.0' AND ConfigKey = 'BaselineVersion')
    INSERT dbo.AI_BusinessRuleConfigTbl (RuleCode, RuleVersion, ConfigKey, ConfigValue, ValueType, Status, ApprovalReason)
    VALUES ('BR-TIER-005', '1.0.0', 'BaselineVersion', N'1.0.0', 'STRING', 'DRAFT', N'Version cấu hình phân tầng/risk cho MVP.');

    /* No UPDATE/DELETE is performed: existing APPROVED rows are preserved. */
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

CREATE OR ALTER PROCEDURE dbo.AI_GetBusinessRuleConfig
    @RuleCode VARCHAR(80),
    @ConfigKey VARCHAR(80),
    @AsOf DATETIME2(0) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET @AsOf = COALESCE(@AsOf, SYSUTCDATETIME());

    SELECT TOP (1)
        RuleCode,
        RuleVersion,
        ConfigKey,
        ConfigValue,
        ValueType,
        Status,
        EffectiveFrom,
        EffectiveTo,
        ApprovedBy,
        ApprovalReason
    FROM dbo.AI_BusinessRuleConfigTbl
    WHERE RuleCode = @RuleCode
      AND ConfigKey = @ConfigKey
      AND Status = 'APPROVED'
      AND (EffectiveFrom IS NULL OR EffectiveFrom <= @AsOf)
      AND (EffectiveTo IS NULL OR EffectiveTo > @AsOf)
    ORDER BY EffectiveFrom DESC, RuleConfigID DESC;
END;
GO

/* Verification: this should return six DRAFT rows after first import. */
SELECT RuleCode, RuleVersion, ConfigKey, ConfigValue, Status
FROM dbo.AI_BusinessRuleConfigTbl
WHERE RuleVersion = '1.0.0'
ORDER BY RuleCode, ConfigKey;
GO
