SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  SEARCH-003 — Tìm khách hàng gần đúng theo mã/tên/SĐT một phần, có xếp hạng,
  trả nguyên danh sách để client bắt buộc người dùng chọn (không tự lấy dòng đầu).

  docs/KE_HOACH_PHAN_QUYEN_CTKM_VA_TIM_KIEM_GAN_DUNG.md §4.2, §4.4.

  ── Khác với các SP nghiệp vụ đang tự resolve tên khách (TOP 1) ──
  API_CongNoKhachHang_AI và tương tự dùng ufn_clean_customer_name rồi LẤY LUÔN
  dòng khớp nhất — đúng cho tra cứu một khách cụ thể nhưng sai khi có nhiều khách
  trùng tên. SP này KHÔNG resolve: luôn trả nguyên danh sách đã xếp hạng, tối đa
  @TopN dòng, để tầng gọi (web/n8n) quyết định resolve thẳng (1 kết quả) hay bắt
  chọn (nhiều kết quả).

  ── Chấm điểm gộp một lần, không phải fallback ──
  API_DanhMuc_Core_AI thử LIKE có dấu trước, chỉ thử bản không dấu khi có-dấu ra
  0 kết quả — một khớp có dấu yếu (vd chứa xa) sẽ chặn mất khớp không dấu tốt hơn.
  Ở đây cả hai đường được chấm điểm trong CÙNG một tập kết quả rồi mới xếp hạng
  chung, nên khớp tốt nhất luôn thắng bất kể qua đường có dấu hay không dấu.

  ── CodeChinh ──
  Khách đã đổi mã được gom về một dòng đại diện theo CanonicalObjectID
  (COALESCE(NULLIF(LTRIM(RTRIM(CodeChinh)),''), ObjectID)) — chỉ giữ bản ghi có
  điểm xếp hạng tốt nhất trong nhóm.

  ── Phạm vi ──
  Chặn hẳn (không đoán) khi AI_ScopeGuardFnc báo ORG_CHART_MISSING — xem
  sql/SEARCH-002_Scope_Guard_AI.sql. Tài khoản GLOBAL_LEADERSHIP tìm không giới
  hạn theo AR_GetObjectByUserFnc.
*/
CREATE OR ALTER PROCEDURE dbo.API_CustomerSearch_AI
    @Username   VARCHAR(50)   = '',
    @SearchText NVARCHAR(100) = '',
    @TopN       INT           = 8
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
        SELECT N'Vui lòng nhập ít nhất 2 ký tự để tìm khách hàng.' AS Msg, 1 AS MsgType, 'SEARCH_TEXT_REQUIRED' AS Code;
        RETURN;
    END;

    DECLARE @IsGloballyScoped BIT, @IsScopeResolvable BIT, @DecisionCode VARCHAR(50);
    SELECT @IsGloballyScoped = IsGloballyScoped, @IsScopeResolvable = IsScopeResolvable, @DecisionCode = DecisionCode
    FROM dbo.AI_ScopeGuardFnc(@Username);

    IF @IsScopeResolvable = 0
    BEGIN
        SELECT N'Tài khoản chưa được khai trong sơ đồ tổ chức, không thể xác định phạm vi tìm kiếm. Liên hệ quản trị viên.' AS Msg,
               1 AS MsgType, 'SCOPE_UNRESOLVED' AS Code;
        RETURN;
    END;

    IF @TopN IS NULL OR @TopN < 1 SET @TopN = 8;
    IF @TopN > 20 SET @TopN = 20;

    DECLARE @CleanSearch NVARCHAR(400) = dbo.ufn_clean_customer_name(@SearchText);

    IF @IsGloballyScoped = 0
    BEGIN
        DECLARE @AllowedObjects TABLE (ObjectID VARCHAR(50) PRIMARY KEY);
        INSERT @AllowedObjects (ObjectID)
        SELECT DISTINCT ObjectID FROM dbo.AR_GetObjectByUserFnc(@Username) WHERE COALESCE(ObjectID, '') <> '';
    END;

    CREATE TABLE #Candidates
    (
        ObjectID     VARCHAR(50)   NOT NULL,
        ObjectName   NVARCHAR(300) NULL,
        Phone        VARCHAR(50)   NULL,
        BranchID     VARCHAR(50)   NULL,
        CanonicalObjectID VARCHAR(50) NOT NULL,
        RankScore    INT           NOT NULL,
        DangerFlag   BIT           NOT NULL
    );

    IF COL_LENGTH('dbo.CF_ObjectTbl', 'ObjectNameCleaned') IS NOT NULL
    BEGIN
        INSERT #Candidates (ObjectID, ObjectName, Phone, BranchID, CanonicalObjectID, RankScore, DangerFlag)
        SELECT O.ObjectID, O.ObjectName, O.Phone, O.BranchID,
               COALESCE(NULLIF(LTRIM(RTRIM(O.CodeChinh)), ''), O.ObjectID),
               CASE
                   WHEN O.ObjectID = @SearchText THEN 0
                   WHEN O.ObjectID LIKE @SearchText + '%' THEN 1
                   WHEN O.Phone = @SearchText THEN 2
                   WHEN O.ObjectNameCleaned LIKE @CleanSearch + '%' THEN 3
                   ELSE 4
               END,
               CASE WHEN O.ObjectName LIKE N'%DỪNG XUẤT%' OR O.ObjectName LIKE N'%DUNG XUAT%' OR O.ObjectName LIKE N'%TRÙNG%'
                    THEN 1 ELSE 0 END
        FROM dbo.CF_ObjectTbl O WITH (NOLOCK)
        WHERE O.isCustomer = 1 AND COALESCE(O.isDisable, 0) = 0
          AND (@IsGloballyScoped = 1 OR EXISTS (SELECT 1 FROM @AllowedObjects A WHERE A.ObjectID = O.ObjectID))
          AND
          (
              O.ObjectID LIKE '%' + @SearchText + '%'
              OR O.Phone LIKE '%' + @SearchText + '%'
              OR O.ObjectNameCleaned LIKE '%' + @CleanSearch + '%'
          );
    END
    ELSE
    BEGIN
        INSERT #Candidates (ObjectID, ObjectName, Phone, BranchID, CanonicalObjectID, RankScore, DangerFlag)
        SELECT O.ObjectID, O.ObjectName, O.Phone, O.BranchID,
               COALESCE(NULLIF(LTRIM(RTRIM(O.CodeChinh)), ''), O.ObjectID),
               CASE
                   WHEN O.ObjectID = @SearchText THEN 0
                   WHEN O.ObjectID LIKE @SearchText + '%' THEN 1
                   WHEN O.Phone = @SearchText THEN 2
                   WHEN dbo.ufn_clean_customer_name(O.ObjectName) LIKE @CleanSearch + '%' THEN 3
                   ELSE 4
               END,
               CASE WHEN O.ObjectName LIKE N'%DỪNG XUẤT%' OR O.ObjectName LIKE N'%DUNG XUAT%' OR O.ObjectName LIKE N'%TRÙNG%'
                    THEN 1 ELSE 0 END
        FROM dbo.CF_ObjectTbl O WITH (NOLOCK)
        WHERE O.isCustomer = 1 AND COALESCE(O.isDisable, 0) = 0
          AND (@IsGloballyScoped = 1 OR EXISTS (SELECT 1 FROM @AllowedObjects A WHERE A.ObjectID = O.ObjectID))
          AND
          (
              O.ObjectID LIKE '%' + @SearchText + '%'
              OR O.Phone LIKE '%' + @SearchText + '%'
              OR dbo.ufn_clean_customer_name(O.ObjectName) LIKE '%' + @CleanSearch + '%'
          );
    END;

    IF NOT EXISTS (SELECT 1 FROM #Candidates)
    BEGIN
        SELECT N'Không tìm thấy khách hàng phù hợp.' AS Msg, 1 AS MsgType, 'NO_MATCH' AS Code;
        RETURN;
    END;

    ;WITH Ranked AS
    (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY CanonicalObjectID ORDER BY RankScore, DangerFlag) AS DedupRank
        FROM #Candidates
    )
    SELECT TOP (@TopN)
        ObjectID, CanonicalObjectID, ObjectName, Phone, BranchID
    FROM Ranked
    WHERE DedupRank = 1
    ORDER BY RankScore, DangerFlag, ObjectName, ObjectID;

    EXEC dbo.AI_WriteAuditLog @Username = @Username, @ActionType = 'SEARCH_KHACHHANG',
        @TargetEntity = 'API_CustomerSearch_AI', @TargetID = NULL, @TargetName = @SearchText;
END;
GO

/* Metadata cố định ApiCode, tránh phụ thuộc quy tắc tách CamelCase của auto-bootstrap. */
IF OBJECT_ID(N'dbo.API_Definition', N'U') IS NOT NULL
BEGIN
    MERGE dbo.API_Definition AS T
    USING
    (
        SELECT CAST('@customer_search' AS VARCHAR(100)) AS ApiCode,
               CAST(N'Tìm khách hàng gần đúng' AS NVARCHAR(200)) AS ApiName,
               CAST('API_CustomerSearch_AI' AS VARCHAR(200)) AS StoredProcedure
    ) AS S
    ON T.ApiCode = S.ApiCode
    WHEN MATCHED THEN UPDATE SET
        T.ApiName = S.ApiName,
        T.ApiDescription = N'Tìm khách hàng theo mã/tên/SĐT một phần, có dấu hoặc không dấu, giới hạn theo phạm vi tài khoản.',
        T.StoredProcedure = S.StoredProcedure,
        T.Category = N'TÌM KIẾM', T.UiTemplate = 'DEFAULT', T.IconEmoji = N'🔎', T.IsActive = 1,
        T.OperationType = 'READ', T.RequiredCapability = 'api.read', T.AllowedCapabilities = N'["api.read"]',
        T.ScopeResolver = 'VERIFIED_USER_HIERARCHY', T.OwnershipRule = 'CUSTOMER_OBJECT_GROUP',
        T.ContractVersion = 'SEARCH_SELECTION_V1', T.ContractUpdatedAt = SYSUTCDATETIME(),
        T.ContractUpdatedBy = 'SEARCH-003'
    WHEN NOT MATCHED THEN INSERT
    (
        ApiCode, ApiName, ApiDescription, StoredProcedure, Category, UiTemplate, IconEmoji,
        IsActive, OrderIndex, OperationType, RequiredCapability, AllowedCapabilities,
        ScopeResolver, OwnershipRule, ContractVersion, ContractUpdatedAt, ContractUpdatedBy
    )
    VALUES
    (
        S.ApiCode, S.ApiName,
        N'Tìm khách hàng theo mã/tên/SĐT một phần, có dấu hoặc không dấu, giới hạn theo phạm vi tài khoản.',
        S.StoredProcedure, N'TÌM KIẾM', 'DEFAULT', N'🔎', 1, 41,
        'READ', 'api.read', N'["api.read"]', 'VERIFIED_USER_HIERARCHY',
        'CUSTOMER_OBJECT_GROUP', 'SEARCH_SELECTION_V1', SYSUTCDATETIME(), 'SEARCH-003'
    );

    IF OBJECT_ID(N'dbo.API_Field', N'U') IS NOT NULL
    BEGIN
        DECLARE @ApiID INT = (SELECT ApiID FROM dbo.API_Definition WHERE ApiCode = '@customer_search');
        MERGE dbo.API_Field AS T
        USING
        (
            SELECT @ApiID ApiID, CAST('@Username' AS VARCHAR(100)) FieldCode, CAST(N'Người dùng' AS NVARCHAR(200)) FieldName,
                   CAST('VARCHAR' AS VARCHAR(50)) DataType, CAST('hidden' AS VARCHAR(50)) ControlType,
                   CAST(0 AS BIT) IsRequired, CAST(1 AS BIT) IsSystemParam, 1 OrderIndex,
                   CAST('SERVER_MAPPING' AS VARCHAR(50)) SourceOfTruth, CAST(NULL AS NVARCHAR(500)) ValidationRule
            UNION ALL
            SELECT @ApiID, '@SearchText', N'Mã, tên hoặc SĐT khách hàng', 'NVARCHAR', 'text', 1, 0, 2, 'USER_INPUT', N'REQUIRED;MIN_LENGTH=2;MAX_LENGTH=100'
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
