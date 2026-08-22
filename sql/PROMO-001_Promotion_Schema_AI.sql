SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID(N'dbo.AI_PromotionProgramTbl', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_PromotionProgramTbl
    (
        PromotionProgramID BIGINT IDENTITY(1,1) NOT NULL,
        PromotionCode VARCHAR(50) NOT NULL,
        ProgramVersion INT NOT NULL,
        PromotionName NVARCHAR(300) NOT NULL,
        ProgramType VARCHAR(20) NOT NULL,
        Description NVARCHAR(2000) NULL,
        EffectiveFrom DATETIME2(0) NOT NULL,
        EffectiveTo DATETIME2(0) NOT NULL,
        BranchScopeMode VARCHAR(10) NOT NULL CONSTRAINT DF_AI_PromotionProgram_BranchScope DEFAULT 'ALL',
        UserGroupScopeMode VARCHAR(10) NOT NULL CONSTRAINT DF_AI_PromotionProgram_UserGroupScope DEFAULT 'ALL',
        Priority INT NOT NULL CONSTRAINT DF_AI_PromotionProgram_Priority DEFAULT 100,
        Status VARCHAR(20) NOT NULL CONSTRAINT DF_AI_PromotionProgram_Status DEFAULT 'DRAFT',
        SourceDocument NVARCHAR(500) NOT NULL,
        CreatedBy VARCHAR(50) NOT NULL,
        CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_AI_PromotionProgram_CreatedAt DEFAULT SYSUTCDATETIME(),
        ApprovedBy VARCHAR(50) NULL,
        ApprovedAt DATETIME2(0) NULL,
        UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_AI_PromotionProgram_UpdatedAt DEFAULT SYSUTCDATETIME(),
        -- PROMO-CFG-001 (quyết định 22/08/2026, xem docs/PROMO-CFG-001_QUYET_DINH_NGHIEP_VU_AP_DUNG_2026-08-22.md):
        -- VatBasis ghi tường minh cơ sở tính CTBH đang dùng (giá đã gồm VAT, quà 0đ không phát
        -- sinh VAT riêng) — hành vi không đổi, chỉ đặt tên cho giả định ngầm định đang chạy thật.
        VatBasis VARCHAR(40) NOT NULL CONSTRAINT DF_AI_PromotionProgram_VatBasis DEFAULT 'INCLUSIVE_UNIT_PRICE_NO_GIFT_VAT',
        -- Trần tổng trị giá lợi ích (VNĐ) toàn đơn cho CHƯƠNG TRÌNH này, khác với MaximumOrderAmount
        -- (per-rule, per-dòng) đã có. NULL = không giới hạn cấp đơn, hành vi các chương trình cũ
        -- không đổi.
        MaxTotalBenefitAmountPerOrder DECIMAL(18,2) NULL,
        CONSTRAINT PK_AI_PromotionProgram PRIMARY KEY (PromotionProgramID),
        CONSTRAINT UQ_AI_PromotionProgram_CodeVersion UNIQUE (PromotionCode, ProgramVersion),
        CONSTRAINT CK_AI_PromotionProgram_Code CHECK (LEN(LTRIM(RTRIM(PromotionCode))) > 0),
        CONSTRAINT CK_AI_PromotionProgram_Version CHECK (ProgramVersion > 0),
        CONSTRAINT CK_AI_PromotionProgram_Name CHECK (LEN(LTRIM(RTRIM(PromotionName))) > 0),
        CONSTRAINT CK_AI_PromotionProgram_Type CHECK (ProgramType IN ('MONTHLY', 'EVENT')),
        CONSTRAINT CK_AI_PromotionProgram_EffectiveRange CHECK (EffectiveTo > EffectiveFrom),
        CONSTRAINT CK_AI_PromotionProgram_BranchScope CHECK (BranchScopeMode IN ('ALL', 'INCLUDE')),
        CONSTRAINT CK_AI_PromotionProgram_UserGroupScope CHECK (UserGroupScopeMode IN ('ALL', 'INCLUDE')),
        CONSTRAINT CK_AI_PromotionProgram_Priority CHECK (Priority BETWEEN 1 AND 10000),
        CONSTRAINT CK_AI_PromotionProgram_Status CHECK (Status IN ('DRAFT', 'APPROVED', 'REJECTED', 'EXPIRED', 'WITHDRAWN')),
        CONSTRAINT CK_AI_PromotionProgram_Source CHECK (LEN(LTRIM(RTRIM(SourceDocument))) > 0),
        CONSTRAINT CK_AI_PromotionProgram_CreatedBy CHECK (LEN(LTRIM(RTRIM(CreatedBy))) > 0),
        CONSTRAINT CK_AI_PromotionProgram_Approval CHECK
        (
            Status <> 'APPROVED'
            OR (ApprovedBy IS NOT NULL AND LEN(LTRIM(RTRIM(ApprovedBy))) > 0 AND ApprovedAt IS NOT NULL)
        ),
        CONSTRAINT CK_AI_PromotionProgram_VatBasis CHECK (VatBasis IN ('INCLUSIVE_UNIT_PRICE_NO_GIFT_VAT')),
        CONSTRAINT CK_AI_PromotionProgram_MaxTotalBenefit CHECK (MaxTotalBenefitAmountPerOrder IS NULL OR MaxTotalBenefitAmountPerOrder > 0)
    );

    CREATE INDEX IX_AI_PromotionProgram_Published
        ON dbo.AI_PromotionProgramTbl (Status, EffectiveFrom, EffectiveTo, PromotionCode, ProgramVersion DESC);
END;
GO

-- Self-healing cho DB đã tồn tại bảng từ trước khi có VatBasis/MaxTotalBenefitAmountPerOrder
-- (vd medtest) — idempotent, cùng convention với Bootstrap_API_Metadata_Auto_AI.sql.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = 'VatBasis' AND Object_ID = OBJECT_ID('dbo.AI_PromotionProgramTbl'))
BEGIN
    -- CHECK phải cùng 1 câu ALTER TABLE với cột mới — tách thành 2 câu trong cùng batch sẽ báo
    -- "Invalid column name" vì cột chưa tồn tại trong catalog lúc SQL Server phân giải tên.
    ALTER TABLE dbo.AI_PromotionProgramTbl
        ADD VatBasis VARCHAR(40) NOT NULL
            CONSTRAINT DF_AI_PromotionProgram_VatBasis DEFAULT 'INCLUSIVE_UNIT_PRICE_NO_GIFT_VAT'
            CONSTRAINT CK_AI_PromotionProgram_VatBasis CHECK (VatBasis IN ('INCLUSIVE_UNIT_PRICE_NO_GIFT_VAT'));
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = 'MaxTotalBenefitAmountPerOrder' AND Object_ID = OBJECT_ID('dbo.AI_PromotionProgramTbl'))
BEGIN
    ALTER TABLE dbo.AI_PromotionProgramTbl
        ADD MaxTotalBenefitAmountPerOrder DECIMAL(18,2) NULL
            CONSTRAINT CK_AI_PromotionProgram_MaxTotalBenefit CHECK (MaxTotalBenefitAmountPerOrder IS NULL OR MaxTotalBenefitAmountPerOrder > 0);
END;
GO

IF OBJECT_ID(N'dbo.AI_PromotionBranchScopeTbl', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_PromotionBranchScopeTbl
    (
        PromotionProgramID BIGINT NOT NULL,
        BranchID VARCHAR(50) NOT NULL,
        CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_AI_PromotionBranchScope_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_AI_PromotionBranchScope PRIMARY KEY (PromotionProgramID, BranchID),
        CONSTRAINT FK_AI_PromotionBranchScope_Program FOREIGN KEY (PromotionProgramID)
            REFERENCES dbo.AI_PromotionProgramTbl(PromotionProgramID) ON DELETE CASCADE,
        CONSTRAINT CK_AI_PromotionBranchScope_Branch CHECK (LEN(LTRIM(RTRIM(BranchID))) > 0)
    );
END;
GO

IF OBJECT_ID(N'dbo.AI_PromotionUserGroupScopeTbl', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_PromotionUserGroupScopeTbl
    (
        PromotionProgramID BIGINT NOT NULL,
        UserGroupID VARCHAR(50) NOT NULL,
        CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_AI_PromotionUserGroupScope_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_AI_PromotionUserGroupScope PRIMARY KEY (PromotionProgramID, UserGroupID),
        CONSTRAINT FK_AI_PromotionUserGroupScope_Program FOREIGN KEY (PromotionProgramID)
            REFERENCES dbo.AI_PromotionProgramTbl(PromotionProgramID) ON DELETE CASCADE,
        CONSTRAINT CK_AI_PromotionUserGroupScope_Group CHECK (LEN(LTRIM(RTRIM(UserGroupID))) > 0)
    );
END;
GO

IF OBJECT_ID(N'dbo.AI_PromotionItemRuleTbl', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_PromotionItemRuleTbl
    (
        PromotionItemRuleID BIGINT IDENTITY(1,1) NOT NULL,
        PromotionProgramID BIGINT NOT NULL,
        RuleOrder INT NOT NULL CONSTRAINT DF_AI_PromotionItemRule_Order DEFAULT 1,
        ItemID VARCHAR(50) NOT NULL,
        RuleType VARCHAR(30) NOT NULL,
        MinimumQuantity DECIMAL(18,2) NULL,
        MaximumQuantity DECIMAL(18,2) NULL,
        MinimumOrderAmount DECIMAL(18,2) NULL,
        MaximumOrderAmount DECIMAL(18,2) NULL,
        DiscountPercent DECIMAL(5,2) NULL,
        GiftItemID VARCHAR(50) NULL,
        GiftQuantity DECIMAL(18,2) NULL,
        BenefitDescription NVARCHAR(1000) NULL,
        CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_AI_PromotionItemRule_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_AI_PromotionItemRule_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_AI_PromotionItemRule PRIMARY KEY (PromotionItemRuleID),
        CONSTRAINT UQ_AI_PromotionItemRule_Order UNIQUE (PromotionProgramID, ItemID, RuleOrder),
        CONSTRAINT FK_AI_PromotionItemRule_Program FOREIGN KEY (PromotionProgramID)
            REFERENCES dbo.AI_PromotionProgramTbl(PromotionProgramID) ON DELETE CASCADE,
        CONSTRAINT CK_AI_PromotionItemRule_Order CHECK (RuleOrder > 0),
        CONSTRAINT CK_AI_PromotionItemRule_Item CHECK (LEN(LTRIM(RTRIM(ItemID))) > 0),
        CONSTRAINT CK_AI_PromotionItemRule_Type CHECK
        (
            RuleType IN ('QUANTITY_DISCOUNT', 'QUANTITY_GIFT', 'AMOUNT_DISCOUNT', 'AMOUNT_GIFT', 'INFORMATION')
        ),
        CONSTRAINT CK_AI_PromotionItemRule_QuantityRange CHECK
        (
            (MinimumQuantity IS NULL OR MinimumQuantity > 0)
            AND (MaximumQuantity IS NULL OR MaximumQuantity >= MinimumQuantity)
        ),
        CONSTRAINT CK_AI_PromotionItemRule_AmountRange CHECK
        (
            (MinimumOrderAmount IS NULL OR MinimumOrderAmount > 0)
            AND (MaximumOrderAmount IS NULL OR MaximumOrderAmount >= MinimumOrderAmount)
        ),
        CONSTRAINT CK_AI_PromotionItemRule_Discount CHECK (DiscountPercent IS NULL OR (DiscountPercent > 0 AND DiscountPercent <= 100)),
        CONSTRAINT CK_AI_PromotionItemRule_GiftQuantity CHECK (GiftQuantity IS NULL OR GiftQuantity > 0),
        CONSTRAINT CK_AI_PromotionItemRule_Shape CHECK
        (
            (RuleType = 'QUANTITY_DISCOUNT' AND MinimumQuantity IS NOT NULL AND DiscountPercent IS NOT NULL)
            OR (RuleType = 'QUANTITY_GIFT' AND MinimumQuantity IS NOT NULL AND GiftQuantity IS NOT NULL AND (GiftItemID IS NOT NULL OR BenefitDescription IS NOT NULL))
            OR (RuleType = 'AMOUNT_DISCOUNT' AND MinimumOrderAmount IS NOT NULL AND DiscountPercent IS NOT NULL)
            OR (RuleType = 'AMOUNT_GIFT' AND MinimumOrderAmount IS NOT NULL AND GiftQuantity IS NOT NULL AND (GiftItemID IS NOT NULL OR BenefitDescription IS NOT NULL))
            OR (RuleType = 'INFORMATION' AND BenefitDescription IS NOT NULL AND LEN(LTRIM(RTRIM(BenefitDescription))) > 0)
        )
    );

    CREATE INDEX IX_AI_PromotionItemRule_Item
        ON dbo.AI_PromotionItemRuleTbl (ItemID, PromotionProgramID, RuleOrder);
END;
GO

CREATE OR ALTER VIEW dbo.AI_ApprovedPromotionItemRuleVw
AS
WITH EligibleProgram AS
(
    SELECT
        P.*,
        ROW_NUMBER() OVER
        (
            PARTITION BY P.PromotionCode
            ORDER BY P.ProgramVersion DESC, P.PromotionProgramID DESC
        ) AS PublishRank
    FROM dbo.AI_PromotionProgramTbl P
    WHERE P.Status = 'APPROVED'
      AND P.ApprovedBy IS NOT NULL
      AND P.ApprovedAt IS NOT NULL
      AND P.EffectiveFrom <= SYSUTCDATETIME()
      AND P.EffectiveTo > SYSUTCDATETIME()
      AND
      (
          P.BranchScopeMode = 'ALL'
          OR EXISTS
          (
              SELECT 1 FROM dbo.AI_PromotionBranchScopeTbl B
              WHERE B.PromotionProgramID = P.PromotionProgramID
          )
      )
      AND
      (
          P.UserGroupScopeMode = 'ALL'
          OR EXISTS
          (
              SELECT 1 FROM dbo.AI_PromotionUserGroupScopeTbl G
              WHERE G.PromotionProgramID = P.PromotionProgramID
          )
      )
)
SELECT
    P.PromotionProgramID,
    P.PromotionCode,
    P.ProgramVersion,
    P.PromotionName,
    P.ProgramType,
    P.Description,
    P.EffectiveFrom,
    P.EffectiveTo,
    P.BranchScopeMode,
    P.UserGroupScopeMode,
    P.Priority,
    P.SourceDocument,
    P.ApprovedBy,
    P.ApprovedAt,
    P.UpdatedAt,
    P.VatBasis,
    P.MaxTotalBenefitAmountPerOrder,
    R.PromotionItemRuleID,
    R.RuleOrder,
    R.ItemID,
    I.ItemName,
    R.RuleType,
    R.MinimumQuantity,
    R.MaximumQuantity,
    R.MinimumOrderAmount,
    R.MaximumOrderAmount,
    R.DiscountPercent,
    R.GiftItemID,
    GI.ItemName AS GiftItemName,
    R.GiftQuantity,
    R.BenefitDescription
FROM EligibleProgram P
INNER JOIN dbo.AI_PromotionItemRuleTbl R ON R.PromotionProgramID = P.PromotionProgramID
INNER JOIN dbo.CF_ItemTbl I ON I.ItemID = R.ItemID AND COALESCE(I.isDisable, 0) = 0
LEFT JOIN dbo.CF_ItemTbl GI ON GI.ItemID = R.GiftItemID AND COALESCE(GI.isDisable, 0) = 0
WHERE P.PublishRank = 1
  AND (R.GiftItemID IS NULL OR GI.ItemID IS NOT NULL);
GO
