SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER FUNCTION dbo.AI_ActivePromotionByUserFnc
(
    @Username VARCHAR(50),
    @ItemID VARCHAR(50),
    @AsOfUtc DATETIME2(0)
)
RETURNS TABLE
AS
RETURN
(
    WITH UserContext AS
    (
        SELECT
            U.UserName,
            COALESCE(U.BranchID, '') AS BranchID,
            COALESCE(U.UserGroupID, '') AS UserGroupID
        FROM dbo.SY_User U
        WHERE U.UserName = LTRIM(RTRIM(COALESCE(@Username, '')))
          AND COALESCE(U.Disable, 0) = 0
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
        P.Priority,
        P.SourceDocument,
        P.ApprovedBy,
        P.ApprovedAt,
        P.UpdatedAt AS PromotionUpdatedAt,
        P.VatBasis,
        P.MaxTotalBenefitAmountPerOrder,
        P.PromotionItemRuleID,
        P.RuleOrder,
        P.ItemID,
        P.ItemName,
        P.RuleType,
        P.MinimumQuantity,
        P.MaximumQuantity,
        P.MinimumOrderAmount,
        P.MaximumOrderAmount,
        P.DiscountPercent,
        P.GiftItemID,
        P.GiftItemName,
        P.GiftQuantity,
        P.BenefitDescription,
        U.BranchID AS MatchedBranchID,
        U.UserGroupID AS MatchedUserGroupID,
        CASE
            WHEN P.RuleType = 'QUANTITY_DISCOUNT' THEN
                CONCAT(N'Mua từ ', CONVERT(NVARCHAR(30), P.MinimumQuantity), N': giảm ', CONVERT(NVARCHAR(30), P.DiscountPercent), N'%')
            WHEN P.RuleType = 'QUANTITY_GIFT' THEN
                CONCAT(N'Mua từ ', CONVERT(NVARCHAR(30), P.MinimumQuantity), N': tặng ', CONVERT(NVARCHAR(30), P.GiftQuantity),
                       CASE WHEN P.GiftItemName IS NOT NULL THEN N' ' + P.GiftItemName ELSE N'' END)
            WHEN P.RuleType = 'AMOUNT_DISCOUNT' THEN
                CONCAT(N'Đơn từ ', CONVERT(NVARCHAR(30), P.MinimumOrderAmount), N'đ: giảm ', CONVERT(NVARCHAR(30), P.DiscountPercent), N'%')
            WHEN P.RuleType = 'AMOUNT_GIFT' THEN
                CONCAT(N'Đơn từ ', CONVERT(NVARCHAR(30), P.MinimumOrderAmount), N'đ: tặng ', CONVERT(NVARCHAR(30), P.GiftQuantity),
                       CASE WHEN P.GiftItemName IS NOT NULL THEN N' ' + P.GiftItemName ELSE N'' END)
            ELSE P.BenefitDescription
        END AS PromotionBenefitText,
        N'APPROVED_ACTIVE_IN_SCOPE' AS PromotionStatus,
        N'AI_ActivePromotionByUserFnc' AS PromotionDataSource
    FROM dbo.AI_ApprovedPromotionItemRuleVw P
    CROSS JOIN UserContext U
    WHERE P.ItemID = LTRIM(RTRIM(COALESCE(@ItemID, '')))
      AND P.EffectiveFrom <= COALESCE(@AsOfUtc, SYSUTCDATETIME())
      AND P.EffectiveTo > COALESCE(@AsOfUtc, SYSUTCDATETIME())
      AND
      (
          P.BranchScopeMode = 'ALL'
          OR EXISTS
          (
              SELECT 1
              FROM dbo.AI_PromotionBranchScopeTbl B
              WHERE B.PromotionProgramID = P.PromotionProgramID
                AND B.BranchID = U.BranchID
          )
      )
      AND
      (
          P.UserGroupScopeMode = 'ALL'
          OR EXISTS
          (
              SELECT 1
              FROM dbo.AI_PromotionUserGroupScopeTbl G
              WHERE G.PromotionProgramID = P.PromotionProgramID
                AND G.UserGroupID = U.UserGroupID
          )
      )
);
GO
