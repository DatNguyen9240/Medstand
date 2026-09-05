SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  PROMO-AI-001
  Endpoint hội thoại chuyên biệt cho câu hỏi CTBH theo mã/tên sản phẩm.
  Không tự tính hoặc suy đoán quyền lợi: tái sử dụng API_TraCuuSanPham_AI,
  nơi giá, tồn, ghi chú ERP và CTBH cấu hình đã được lọc theo identity.
*/
CREATE OR ALTER PROCEDURE dbo.API_CTBHSanPham_AI
    @Username VARCHAR(50) = '',
    @timkiem NVARCHAR(100) = '',
    @TopN INT = 10
AS
BEGIN
    SET NOCOUNT ON;

    SET @timkiem = LTRIM(RTRIM(COALESCE(@timkiem, N'')));
    DECLARE @BranchID VARCHAR(50) = '';
    SELECT @BranchID = COALESCE(BranchID, '')
    FROM dbo.SY_User WITH (NOLOCK)
    WHERE UserName = @Username AND COALESCE(Disable, 0) = 0;

    IF NOT EXISTS (SELECT 1 FROM dbo.SY_User WITH (NOLOCK) WHERE UserName=@Username AND COALESCE(Disable,0)=0)
    BEGIN
        SELECT N'Tài khoản không tồn tại hoặc đã bị khóa.' AS Msg, 1 AS MsgType,
               N'OUT_OF_SCOPE' AS Severity, N'INVALID_USER' AS Code;
        RETURN;
    END;
    IF @timkiem = N''
    BEGIN
        SELECT N'Vui lòng cho biết mã hoặc tên sản phẩm cần xem CTBH.' AS Msg,
               1 AS MsgType, N'PRODUCT_REQUIRED' AS Code;
        RETURN;
    END;

    IF @TopN IS NULL OR @TopN < 1 SET @TopN = 10;
    IF @TopN > 20 SET @TopN = 20;

    DECLARE @AsOfUtc DATETIME2(0) = SYSUTCDATETIME();
    ;WITH Matched AS
    (
        SELECT TOP (@TopN)
            I.ItemID, I.ItemName, I.ItemGroupID,
            CASE WHEN I.ItemID = @timkiem THEN 1
                 WHEN I.ItemID LIKE @timkiem + '%' THEN 2
                 WHEN I.ItemName COLLATE Vietnamese_CI_AS LIKE @timkiem + N'%' THEN 3
                 ELSE 4 END AS MatchOrder
        FROM dbo.CF_ItemTbl I WITH (NOLOCK)
        WHERE COALESCE(I.isDisable, 0) = 0
          AND CASE WHEN @BranchID='MB' THEN COALESCE(I.IsDisableMB,0)
                   WHEN @BranchID='MN' THEN COALESCE(I.IsDisableMN,0)
                   WHEN @BranchID='MT' THEN COALESCE(I.IsDisableMT,0)
                   ELSE COALESCE(I.isDisable,0) END = 0
          AND
          (
              I.ItemID LIKE '%' + @timkiem + '%'
              OR I.ItemName COLLATE Vietnamese_CI_AS LIKE N'%' + @timkiem + N'%'
              OR COALESCE(I.TuKhoa,N'') COLLATE Vietnamese_CI_AS LIKE N'%' + @timkiem + N'%'
          )
        ORDER BY MatchOrder, I.ItemName, I.ItemID
    )
    SELECT M.ItemID, M.ItemName, CAST(NULL AS NVARCHAR(50)) AS Unit, M.ItemGroupID,
           COALESCE(P.ActivePromotionCount, 0) AS ActivePromotionCount,
           P.PromotionSummary,
           COALESCE(P.ActivePromotionsJson, N'[]') AS ActivePromotionsJson,
           P.PromotionUpdatedAt,
           CASE WHEN COALESCE(P.ActivePromotionCount,0)>0 THEN 'ACTIVE_PROMOTION_FOUND' ELSE 'NO_ACTIVE_PROMOTION' END AS PromotionStatus,
           N'AI_ActivePromotionByUserFnc' AS PromotionDataSource,
           N'PROMOTION_BENEFIT_V3' AS ContractVersion
    FROM Matched M
    OUTER APPLY
    (
        SELECT
            (SELECT COUNT_BIG(*) FROM dbo.AI_ActivePromotionByUserFnc(@Username,M.ItemID,@AsOfUtc)) ActivePromotionCount,
            STUFF
            (
                (
                    SELECT N' | ' + X.PromotionName + N': ' + COALESCE(X.PromotionBenefitText,X.BenefitDescription,N'Xem điều kiện chương trình')
                    FROM dbo.AI_ActivePromotionByUserFnc(@Username,M.ItemID,@AsOfUtc) X
                    ORDER BY X.Priority,X.PromotionCode,X.RuleOrder
                    FOR XML PATH(''),TYPE
                ).value('.','NVARCHAR(MAX)'),1,3,N''
            ) PromotionSummary,
            (
                SELECT X.PromotionCode,X.PromotionName,X.ProgramType,X.EffectiveFrom,X.EffectiveTo,
                       X.RuleType,X.MinimumQuantity,X.MaximumQuantity,X.MinimumOrderAmount,X.MaximumOrderAmount,
                       X.DiscountPercent,X.GiftItemID,X.GiftItemName,X.GiftQuantity,
                       X.BenefitDescription,X.PromotionBenefitText,X.PromotionStatus
                FROM dbo.AI_ActivePromotionByUserFnc(@Username,M.ItemID,@AsOfUtc) X
                ORDER BY X.Priority,X.PromotionCode,X.RuleOrder
                FOR JSON PATH
            ) ActivePromotionsJson,
            (SELECT MAX(X.PromotionUpdatedAt) FROM dbo.AI_ActivePromotionByUserFnc(@Username,M.ItemID,@AsOfUtc) X) PromotionUpdatedAt
    ) P
    ORDER BY M.MatchOrder,M.ItemName,M.ItemID;
END;
GO

/* Metadata cố định ApiCode, tránh phụ thuộc quy tắc tách CamelCase của auto-bootstrap. */
IF OBJECT_ID(N'dbo.API_Definition', N'U') IS NOT NULL
BEGIN
    MERGE dbo.API_Definition AS T
    USING
    (
        SELECT CAST('@ctbh_san_pham' AS VARCHAR(100)) AS ApiCode,
               CAST(N'CTBH theo sản phẩm' AS NVARCHAR(200)) AS ApiName,
               CAST('API_CTBHSanPham_AI' AS VARCHAR(200)) AS StoredProcedure
    ) AS S
    ON T.ApiCode = S.ApiCode
    WHEN MATCHED THEN UPDATE SET
        T.ApiName = S.ApiName,
        T.ApiDescription = N'Tra CTBH hiện hành và ghi chú bán hàng theo mã/tên sản phẩm trong phạm vi identity.',
        T.StoredProcedure = S.StoredProcedure,
        T.Category = N'SẢN PHẨM', T.UiTemplate = 'CATALOG', T.IconEmoji = N'🏷️', T.IsActive = 1,
        T.OperationType = 'READ', T.RequiredCapability = 'api.read', T.AllowedCapabilities = N'["api.read"]',
        T.ScopeResolver = 'VERIFIED_USER_HIERARCHY', T.OwnershipRule = 'PRODUCT_BRANCH_AND_GROUP',
        T.ContractVersion = 'PROMOTION_BENEFIT_V3', T.ContractUpdatedAt = SYSUTCDATETIME(),
        T.ContractUpdatedBy = 'Codex:PROMO-AI-001'
    WHEN NOT MATCHED THEN INSERT
    (
        ApiCode, ApiName, ApiDescription, StoredProcedure, Category, UiTemplate, IconEmoji,
        IsActive, OrderIndex, OperationType, RequiredCapability, AllowedCapabilities,
        ScopeResolver, OwnershipRule, ContractVersion, ContractUpdatedAt, ContractUpdatedBy
    )
    VALUES
    (
        S.ApiCode, S.ApiName,
        N'Tra CTBH hiện hành và ghi chú bán hàng theo mã/tên sản phẩm trong phạm vi identity.',
        S.StoredProcedure, N'SẢN PHẨM', 'CATALOG', N'🏷️', 1, 35,
        'READ', 'api.read', N'["api.read"]', 'VERIFIED_USER_HIERARCHY',
        'PRODUCT_BRANCH_AND_GROUP', 'PROMOTION_BENEFIT_V3', SYSUTCDATETIME(), 'Codex:PROMO-AI-001'
    );

    IF OBJECT_ID(N'dbo.API_Field', N'U') IS NOT NULL
    BEGIN
        DECLARE @ApiID INT = (SELECT ApiID FROM dbo.API_Definition WHERE ApiCode = '@ctbh_san_pham');
        MERGE dbo.API_Field AS T
        USING
        (
            SELECT @ApiID ApiID, CAST('@Username' AS VARCHAR(100)) FieldCode, CAST(N'Người dùng' AS NVARCHAR(200)) FieldName,
                   CAST('VARCHAR' AS VARCHAR(50)) DataType, CAST('hidden' AS VARCHAR(50)) ControlType,
                   CAST(0 AS BIT) IsRequired, CAST(1 AS BIT) IsSystemParam, 1 OrderIndex,
                   CAST('SERVER_MAPPING' AS VARCHAR(50)) SourceOfTruth, CAST(NULL AS NVARCHAR(500)) ValidationRule
            UNION ALL
            SELECT @ApiID, '@timkiem', N'Mã hoặc tên sản phẩm', 'NVARCHAR', 'text', 1, 0, 2, 'USER_INPUT', N'REQUIRED;MIN_LENGTH=2;MAX_LENGTH=100'
            UNION ALL
            SELECT @ApiID, '@TopN', N'Số lượng', 'INT', 'number', 0, 0, 3, 'USER_INPUT', N'POSITIVE_INTEGER;MAX=20'
        ) AS S
        ON T.ApiID = S.ApiID AND T.FieldCode = S.FieldCode
        WHEN MATCHED THEN UPDATE SET
            T.FieldName = S.FieldName, T.DataType = S.DataType, T.ControlType = S.ControlType,
            T.IsRequired = S.IsRequired, T.IsSystemParam = S.IsSystemParam,
            T.OrderIndex = S.OrderIndex, T.SourceOfTruth = S.SourceOfTruth, T.ValidationRule = S.ValidationRule
        WHEN NOT MATCHED THEN INSERT
        (
            ApiID, FieldCode, FieldName, DataType, ControlType, IsRequired, IsSystemParam,
            OrderIndex, SourceOfTruth, ValidationRule
        )
        VALUES
        (
            S.ApiID, S.FieldCode, S.FieldName, S.DataType, S.ControlType, S.IsRequired,
            S.IsSystemParam, S.OrderIndex, S.SourceOfTruth, S.ValidationRule
        );
    END;
END;
GO
