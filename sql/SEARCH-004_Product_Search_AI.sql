SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  SEARCH-004 — Tìm sản phẩm gần đúng theo mã/tên/từ khóa một phần, có xếp hạng,
  trả nguyên danh sách để client bắt buộc người dùng chọn.

  docs/KE_HOACH_PHAN_QUYEN_CTKM_VA_TIM_KIEM_GAN_DUNG.md §4.3, §4.4.

  Khác với API_HangHoaList_AI: không yêu cầu @ObjectID (SP đó bắt buộc có khách
  hàng và trả CUSTOMER_OUT_OF_SCOPE nếu thiếu — không dùng được làm tìm kiếm
  chung). SP này chỉ khoá theo chi nhánh và (tuỳ chọn) theo còn bán được, mô
  phỏng đúng khối điều kiện branch-lock đã dùng ở Module_Common_API_HangHoaList_AI
  và Migrate_Telegram_Order_Draft_AI (BR-STOCK-001/SellableItemGroupIDs).

  @RequireSellable = 0 phục vụ tra CTBH: sản phẩm hết hàng hoặc tạm ngừng bán vẫn
  cần tra được điều kiện khuyến mãi (đúng tinh thần API_CTBHSanPham_AI); = 1 (mặc
  định) phục vụ lên đơn, nơi chỉ hàng đang bán mới có ích.
*/
CREATE OR ALTER PROCEDURE dbo.API_ProductSearch_AI
    @Username        VARCHAR(50)   = '',
    @SearchText      NVARCHAR(100) = '',
    @TopN            INT           = 8,
    @RequireSellable BIT           = 1
AS
BEGIN
    SET NOCOUNT ON;

    SET @Username = LTRIM(RTRIM(COALESCE(@Username, '')));
    SET @SearchText = LTRIM(RTRIM(COALESCE(@SearchText, N'')));

    IF NOT EXISTS (SELECT 1 FROM dbo.SY_User WITH (NOLOCK) WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'Tài khoản không tồn tại hoặc đã bị khóa.' AS Msg, 1 AS MsgType, 'INVALID_USER' AS Code;
        RETURN;
    END;
    IF @SearchText = N'' OR LEN(@SearchText) < 2
    BEGIN
        SELECT N'Vui lòng nhập ít nhất 2 ký tự để tìm sản phẩm.' AS Msg, 1 AS MsgType, 'SEARCH_TEXT_REQUIRED' AS Code;
        RETURN;
    END;

    IF @TopN IS NULL OR @TopN < 1 SET @TopN = 8;
    IF @TopN > 20 SET @TopN = 20;
    IF @RequireSellable IS NULL SET @RequireSellable = 1;

    DECLARE @BranchID VARCHAR(50) = '';
    SELECT @BranchID = COALESCE(BranchID, '') FROM dbo.SY_User WITH (NOLOCK) WHERE UserName = @Username;

    DECLARE @CleanSearch NVARCHAR(400) = dbo.ufn_remove_accents(@SearchText);

    CREATE TABLE #Candidates
    (
        ItemID      VARCHAR(50)   NOT NULL,
        ItemName    NVARCHAR(500) NULL,
        ItemGroupID VARCHAR(50)   NULL,
        RankScore   INT           NOT NULL
    );

    INSERT #Candidates (ItemID, ItemName, ItemGroupID, RankScore)
    SELECT
        I.ItemID, I.ItemName, I.ItemGroupID,
        CASE
            WHEN I.ItemID = @SearchText THEN 0
            WHEN I.ItemID LIKE @SearchText + '%' THEN 1
            WHEN I.ItemName COLLATE Vietnamese_CI_AS LIKE @SearchText + N'%' THEN 2
            WHEN dbo.ufn_remove_accents(I.ItemName) LIKE @CleanSearch + '%' THEN 3
            ELSE 4
        END
    FROM dbo.CF_ItemTbl I WITH (NOLOCK)
    WHERE COALESCE(I.isDisable, 0) = 0
      AND
      (
          @RequireSellable = 0
          OR
          (
              CASE WHEN @BranchID = 'MB' THEN COALESCE(I.IsDisableMB, 0)
                   WHEN @BranchID = 'MN' THEN COALESCE(I.IsDisableMN, 0)
                   WHEN @BranchID = 'MT' THEN COALESCE(I.IsDisableMT, 0)
                   ELSE COALESCE(I.isDisable, 0) END = 0
              AND EXISTS
              (
                  SELECT 1
                  FROM dbo.AI_BusinessRuleConfigTbl C
                  CROSS APPLY STRING_SPLIT(C.ConfigValue, ',') V
                  WHERE C.RuleCode = 'BR-STOCK-001'
                    AND C.ConfigKey = 'SellableItemGroupIDs'
                    AND LTRIM(RTRIM(V.value)) = I.ItemGroupID
                    AND C.Status = 'APPROVED'
              )
          )
      )
      AND
      (
          I.ItemID LIKE '%' + @SearchText + '%'
          OR I.ItemName COLLATE Vietnamese_CI_AS LIKE N'%' + @SearchText + N'%'
          OR COALESCE(I.TuKhoa, N'') COLLATE Vietnamese_CI_AS LIKE N'%' + @SearchText + N'%'
          OR dbo.ufn_remove_accents(I.ItemName) LIKE '%' + @CleanSearch + '%'
      );

    IF NOT EXISTS (SELECT 1 FROM #Candidates)
    BEGIN
        SELECT N'Không tìm thấy sản phẩm phù hợp.' AS Msg, 1 AS MsgType, 'NO_MATCH' AS Code;
        RETURN;
    END;

    SELECT TOP (@TopN) ItemID, ItemName, ItemGroupID
    FROM #Candidates
    ORDER BY RankScore, ItemName, ItemID;

    EXEC dbo.AI_WriteAuditLog @Username = @Username, @ActionType = 'SEARCH_SANPHAM',
        @TargetEntity = 'API_ProductSearch_AI', @TargetID = NULL, @TargetName = @SearchText;
END;
GO

/* Metadata cố định ApiCode, tránh phụ thuộc quy tắc tách CamelCase của auto-bootstrap. */
IF OBJECT_ID(N'dbo.API_Definition', N'U') IS NOT NULL
BEGIN
    MERGE dbo.API_Definition AS T
    USING
    (
        SELECT CAST('@product_search' AS VARCHAR(100)) AS ApiCode,
               CAST(N'Tìm sản phẩm gần đúng' AS NVARCHAR(200)) AS ApiName,
               CAST('API_ProductSearch_AI' AS VARCHAR(200)) AS StoredProcedure
    ) AS S
    ON T.ApiCode = S.ApiCode
    WHEN MATCHED THEN UPDATE SET
        T.ApiName = S.ApiName,
        T.ApiDescription = N'Tìm sản phẩm theo mã/tên/từ khóa một phần, có dấu hoặc không dấu, khoá theo chi nhánh khi cần hàng đang bán.',
        T.StoredProcedure = S.StoredProcedure,
        T.Category = N'TÌM KIẾM', T.UiTemplate = 'DEFAULT', T.IconEmoji = N'🔎', T.IsActive = 1,
        T.OperationType = 'READ', T.RequiredCapability = 'api.read', T.AllowedCapabilities = N'["api.read"]',
        T.ScopeResolver = 'VERIFIED_USER_HIERARCHY', T.OwnershipRule = 'PRODUCT_BRANCH_AND_GROUP',
        T.ContractVersion = 'SEARCH_SELECTION_V1', T.ContractUpdatedAt = SYSUTCDATETIME(),
        T.ContractUpdatedBy = 'SEARCH-004'
    WHEN NOT MATCHED THEN INSERT
    (
        ApiCode, ApiName, ApiDescription, StoredProcedure, Category, UiTemplate, IconEmoji,
        IsActive, OrderIndex, OperationType, RequiredCapability, AllowedCapabilities,
        ScopeResolver, OwnershipRule, ContractVersion, ContractUpdatedAt, ContractUpdatedBy
    )
    VALUES
    (
        S.ApiCode, S.ApiName,
        N'Tìm sản phẩm theo mã/tên/từ khóa một phần, có dấu hoặc không dấu, khoá theo chi nhánh khi cần hàng đang bán.',
        S.StoredProcedure, N'TÌM KIẾM', 'DEFAULT', N'🔎', 1, 42,
        'READ', 'api.read', N'["api.read"]', 'VERIFIED_USER_HIERARCHY',
        'PRODUCT_BRANCH_AND_GROUP', 'SEARCH_SELECTION_V1', SYSUTCDATETIME(), 'SEARCH-004'
    );

    IF OBJECT_ID(N'dbo.API_Field', N'U') IS NOT NULL
    BEGIN
        DECLARE @ApiID INT = (SELECT ApiID FROM dbo.API_Definition WHERE ApiCode = '@product_search');
        MERGE dbo.API_Field AS T
        USING
        (
            SELECT @ApiID ApiID, CAST('@Username' AS VARCHAR(100)) FieldCode, CAST(N'Người dùng' AS NVARCHAR(200)) FieldName,
                   CAST('VARCHAR' AS VARCHAR(50)) DataType, CAST('hidden' AS VARCHAR(50)) ControlType,
                   CAST(0 AS BIT) IsRequired, CAST(1 AS BIT) IsSystemParam, 1 OrderIndex,
                   CAST('SERVER_MAPPING' AS VARCHAR(50)) SourceOfTruth, CAST(NULL AS NVARCHAR(500)) ValidationRule
            UNION ALL
            SELECT @ApiID, '@SearchText', N'Mã, tên hoặc từ khóa sản phẩm', 'NVARCHAR', 'text', 1, 0, 2, 'USER_INPUT', N'REQUIRED;MIN_LENGTH=2;MAX_LENGTH=100'
            UNION ALL
            SELECT @ApiID, '@TopN', N'Số lượng', 'INT', 'number', 0, 0, 3, 'USER_INPUT', N'POSITIVE_INTEGER;MAX=20'
            UNION ALL
            SELECT @ApiID, '@RequireSellable', N'Chỉ hàng đang bán', 'BIT', 'checkbox', 0, 0, 4, 'USER_INPUT', NULL
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
