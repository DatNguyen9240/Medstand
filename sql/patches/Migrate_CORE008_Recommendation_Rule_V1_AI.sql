USE medtest;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'medtest'
    THROW 51000, N'CORE-008 migration chỉ được chạy trên medtest.', 1;

IF OBJECT_ID(N'dbo.AI_BusinessRuleConfigTbl', N'U') IS NULL
    THROW 51001, N'Thiếu dbo.AI_BusinessRuleConfigTbl. Hãy chạy migration business-rule baseline trước.', 1;

DECLARE @RuleCode VARCHAR(80) = 'BR-RECOMMENDATION-008';
DECLARE @RuleVersion VARCHAR(30) = '1.0.0';
DECLARE @EffectiveFrom DATETIME2(0) = SYSUTCDATETIME();
DECLARE @ApprovedBy VARCHAR(100) = 'USER_CONFIRMED_IN_CHAT';
DECLARE @ApprovalReason NVARCHAR(500) = N'CORE-008: chuẩn hóa lý do gợi ý bán hàng; SQL là nguồn tính nghiệp vụ, không mô tả mốc chính sách như chu kỳ cá nhân.';

DECLARE @Seed TABLE
(
    ConfigKey VARCHAR(80) NOT NULL PRIMARY KEY,
    ConfigValue NVARCHAR(300) NOT NULL,
    ValueType VARCHAR(20) NOT NULL
);

INSERT INTO @Seed (ConfigKey, ConfigValue, ValueType)
VALUES
    ('ContractVersion', N'1.0.0', 'STRING'),
    ('SalesStatusIDs', N'3,6,7,8', 'CSV_INT'),
    ('ProductHistoryMonths', N'6', 'INT'),
    ('RouteHistoryMonths', N'6', 'INT'),
    ('MinimumPurchaseEventCount', N'3', 'INT'),
    ('ReorderWarningDays', N'7', 'INT'),
    ('RoutePolicyDefaultCycleDays', N'30', 'INT'),
    ('RouteInactiveDays', N'45', 'INT'),
    ('RouteRecentInactiveDays', N'30', 'INT'),
    ('RouteAlertDays', N'5', 'INT'),
    ('RouteMediumPriorityDays', N'14', 'INT'),
    ('ScoreOverdue', N'100', 'INT'),
    ('ScoreAlertWindow', N'80', 'INT'),
    ('ScoreMediumWindow', N'50', 'INT'),
    ('ScoreInactive', N'40', 'INT'),
    ('ScoreRecentInactive', N'20', 'INT'),
    ('ScoreScheduledRoute', N'30', 'INT'),
    ('CycleMethod', N'AVERAGE_CONSECUTIVE_DAILY_PURCHASE_EVENTS', 'STRING'),
    ('CycleRoundingMode', N'ROUND_HALF_UP_TO_INTEGER_DAY', 'STRING'),
    ('ProductPurchaseEventGrain', N'CUSTOMER_PRODUCT_PURCHASE_DATE', 'STRING'),
    ('RoutePurchaseEventGrain', N'CUSTOMER_PURCHASE_DATE', 'STRING'),
    ('ReturnAdjustmentMode', N'RETURNS_NOT_EVENTS_ORIGINAL_EVENT_NOT_ADJUSTED_UNRELIABLE_LINKAGE', 'STRING');

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
          AND EffectiveFrom <= @EffectiveFrom
          AND (EffectiveTo IS NULL OR EffectiveTo > @EffectiveFrom)) <> (SELECT COUNT(*) FROM @Seed)
        THROW 51002, N'Không thể kích hoạt đầy đủ cấu hình BR-RECOMMENDATION-008/1.0.0.', 1;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

SELECT
    RuleCode, RuleVersion, ConfigKey, ConfigValue, ValueType,
    Status, EffectiveFrom, EffectiveTo, ApprovedBy
FROM dbo.AI_BusinessRuleConfigTbl
WHERE RuleCode = 'BR-RECOMMENDATION-008'
  AND RuleVersion = '1.0.0'
ORDER BY ConfigKey;
GO
