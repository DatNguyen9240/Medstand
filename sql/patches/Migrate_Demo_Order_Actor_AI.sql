/*
  Demo-only order actor mapping.
  Adds an approved runtime rule without changing dbo.SY_User or ERP master data.
*/
SET XACT_ABORT ON;
GO

IF OBJECT_ID(N'dbo.AI_BusinessRuleConfigTbl', N'U') IS NULL
    THROW 51001, N'Thiếu dbo.AI_BusinessRuleConfigTbl. Hãy chạy migration business-rule baseline trước.', 1;
GO

DECLARE @RuleCode VARCHAR(80) = 'BR-ORDER-ACTOR-001';
DECLARE @RuleVersion VARCHAR(30) = '1.0.0';
DECLARE @ConfigKey VARCHAR(80) = 'demo';
DECLARE @ConfigValue NVARCHAR(200) = N'{"EmployeeID":"DEMO","BranchID":"MB"}';

IF EXISTS
(
    SELECT 1
    FROM dbo.AI_BusinessRuleConfigTbl
    WHERE RuleCode = @RuleCode
      AND RuleVersion = @RuleVersion
      AND ConfigKey = @ConfigKey
      AND (ConfigValue <> @ConfigValue OR ValueType <> 'JSON' OR Status <> 'APPROVED')
)
    THROW 51002, N'Cấu hình actor lập đơn cho demo đã tồn tại nhưng khác contract; không tự ghi đè.', 1;

IF NOT EXISTS
(
    SELECT 1
    FROM dbo.AI_BusinessRuleConfigTbl
    WHERE RuleCode = @RuleCode
      AND RuleVersion = @RuleVersion
      AND ConfigKey = @ConfigKey
)
BEGIN
    INSERT dbo.AI_BusinessRuleConfigTbl
    (
        RuleCode, RuleVersion, ConfigKey, ConfigValue, ValueType, Status,
        EffectiveFrom, ApprovedBy, ApprovalReason
    )
    VALUES
    (
        @RuleCode, @RuleVersion, @ConfigKey, @ConfigValue, 'JSON', 'APPROVED',
        SYSUTCDATETIME(), 'SYSTEM', N'Tài khoản demo được tự đứng tên actor khi lập đơn; không sửa SY_User.'
    );
END;
GO

