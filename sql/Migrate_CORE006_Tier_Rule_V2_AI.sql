USE medtest;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'medtest'
    THROW 51000, N'CORE-006 migration chỉ được chạy trên medtest.', 1;

IF OBJECT_ID(N'dbo.AI_BusinessRuleConfigTbl', N'U') IS NULL
    THROW 51001, N'Thiếu dbo.AI_BusinessRuleConfigTbl. Hãy chạy Migrate_Business_Rule_Baseline_V1_AI.sql trước.', 1;

DECLARE @RuleCode VARCHAR(80) = 'BR-TIER-005';
DECLARE @RuleVersion VARCHAR(30) = '2.0.0';
DECLARE @EffectiveFrom DATETIME2(0) = SYSUTCDATETIME();
DECLARE @ApprovedBy VARCHAR(100) = 'USER_CONFIRMED_IN_CHAT';
DECLARE @ApprovalReason NVARCHAR(500) = N'CORE-006: business owner chọn phương án C trong phiên làm việc ngày 03/08/2026; hiệu lực ngay. Mọi ngưỡng được lưu ở config, procedure không hard-code.';

DECLARE @Seed TABLE
(
    ConfigKey VARCHAR(80) NOT NULL PRIMARY KEY,
    ConfigValue NVARCHAR(200) NOT NULL,
    ValueType VARCHAR(20) NOT NULL
);

INSERT INTO @Seed (ConfigKey, ConfigValue, ValueType)
VALUES
    ('Method', N'FIXED_NET_REVENUE_FREQUENCY', 'STRING'),
    ('RevenueWindowMonths', N'12', 'INT'),
    ('FrequencyWindowMonths', N'6', 'INT'),
    ('TrendWindowMonths', N'3', 'INT'),
    ('SalesStatusIDs', N'3,6,7,8', 'CSV_INT'),
    ('ReturnStatusIDs', N'99', 'CSV_INT'),
    ('TierAMinNetRevenue', N'25000000', 'DECIMAL'),
    ('TierAMinFrequency', N'6', 'INT'),
    ('TierBMinNetRevenue', N'5000000', 'DECIMAL'),
    ('TierBMinFrequency', N'2', 'INT'),
    ('NoHistorySegment', N'UNRATED', 'STRING'),
    ('NoHistoryRiskLevel', N'UNKNOWN', 'STRING'),
    ('HighRiskDays', N'90', 'INT'),
    ('MediumRiskDays', N'45', 'INT'),
    ('RiskDeclineRatio', N'0.80', 'DECIMAL'),
    ('GrowthTrendRatio', N'1.10', 'DECIMAL'),
    ('DeclineTrendRatio', N'0.90', 'DECIMAL'),
    ('NewCustomerDays', N'30', 'INT'),
    ('UtcOffsetMinutes', N'420', 'INT'),
    ('RevenueBasis', N'AR_OrderAndReturnView.TotalAmount', 'STRING'),
    ('ReturnApplicationRule', N'DIRECT_SIGNED_SUM_NO_SECOND_NEGATION', 'STRING');

BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE C
       SET C.ConfigValue = S.ConfigValue,
           C.ValueType = S.ValueType,
           C.Status = 'APPROVED',
           C.EffectiveFrom = COALESCE(C.EffectiveFrom, @EffectiveFrom),
           C.EffectiveTo = NULL,
           C.ApprovedBy = @ApprovedBy,
           C.ApprovalReason = @ApprovalReason,
           C.ModifiedAt = SYSUTCDATETIME()
    FROM dbo.AI_BusinessRuleConfigTbl C
    JOIN @Seed S ON S.ConfigKey = C.ConfigKey
    WHERE C.RuleCode = @RuleCode
      AND C.RuleVersion = @RuleVersion;

    INSERT INTO dbo.AI_BusinessRuleConfigTbl
    (
        RuleCode, RuleVersion, ConfigKey, ConfigValue, ValueType,
        Status, EffectiveFrom, EffectiveTo, ApprovedBy, ApprovalReason
    )
    SELECT
        @RuleCode, @RuleVersion, S.ConfigKey, S.ConfigValue, S.ValueType,
        'APPROVED', @EffectiveFrom, NULL, @ApprovedBy, @ApprovalReason
    FROM @Seed S
    WHERE NOT EXISTS
    (
        SELECT 1
        FROM dbo.AI_BusinessRuleConfigTbl C
        WHERE C.RuleCode = @RuleCode
          AND C.RuleVersion = @RuleVersion
          AND C.ConfigKey = S.ConfigKey
    );

    IF (SELECT COUNT(*)
        FROM dbo.AI_BusinessRuleConfigTbl
        WHERE RuleCode = @RuleCode
          AND RuleVersion = @RuleVersion
          AND Status = 'APPROVED'
          AND EffectiveFrom IS NOT NULL
          AND EffectiveTo IS NULL) <> (SELECT COUNT(*) FROM @Seed)
        THROW 51002, N'Không thể kích hoạt đầy đủ cấu hình BR-TIER-005/2.0.0.', 1;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

SELECT
    RuleCode,
    RuleVersion,
    ConfigKey,
    ConfigValue,
    ValueType,
    Status,
    EffectiveFrom,
    ApprovedBy
FROM dbo.AI_BusinessRuleConfigTbl
WHERE RuleCode = 'BR-TIER-005'
  AND RuleVersion = '2.0.0'
ORDER BY ConfigKey;
GO
