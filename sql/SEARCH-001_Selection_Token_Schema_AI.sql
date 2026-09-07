SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  SEARCH-001 — Selection token dùng chung cho luồng "tìm gần đúng, nhiều kết quả
  thì bắt chọn" (docs/KE_HOACH_PHAN_QUYEN_CTKM_VA_TIM_KIEM_GAN_DUNG.md §4.6).

  Mô phỏng theo AI_TelegramOrderDraftSession (Migrate_Telegram_Order_Draft_AI.sql):
  token là khoá chính dạng hex, gắn với danh tính đã xác thực, có hạn dùng ngắn,
  dùng một lần. Khác biệt: tổng quát hoá cho cả kênh Web lẫn Telegram, và cho cả
  hai loại thực thể KHÁCH HÀNG / SẢN PHẨM, thay vì chỉ đơn nháp.

  CandidateJson lưu đúng danh sách đã hiển thị cho người dùng (đã lọc theo phạm vi
  tại thời điểm tìm kiếm) — Consume chỉ chấp nhận lựa chọn nằm trong danh sách này,
  không tin ID do client gửi kèm lựa chọn.

  PendingRequestJson (tuỳ chọn) lưu {"ApiCode":..., "Params":{...}} của yêu cầu
  nghiệp vụ đang bị treo lại vì gặp nhiều kết quả — cho phép n8n phát lại đúng yêu
  cầu gốc với ID đã chọn thay vì phải hỏi lại toàn bộ câu hỏi.
*/
IF OBJECT_ID(N'dbo.AI_SelectionToken', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_SelectionToken
    (
        SelectionToken     CHAR(32)      NOT NULL,
        Username           VARCHAR(50)   NOT NULL,
        ChannelType        VARCHAR(20)   NOT NULL,
        ChannelSessionID   VARCHAR(100)  NOT NULL,
        EntityType         VARCHAR(20)   NOT NULL,
        CandidateJson      NVARCHAR(MAX) NOT NULL,
        PendingRequestJson NVARCHAR(MAX) NULL,
        IssuedAtUtc        DATETIME2(3)  NOT NULL CONSTRAINT DF_AI_SelectionToken_Issued DEFAULT SYSUTCDATETIME(),
        ExpiresAtUtc       DATETIME2(3)  NOT NULL,
        ConsumedAtUtc      DATETIME2(3)  NULL,
        ConsumedEntityID   VARCHAR(50)   NULL,
        CONSTRAINT PK_AI_SelectionToken PRIMARY KEY (SelectionToken),
        CONSTRAINT CK_AI_SelectionToken_Token   CHECK (SelectionToken NOT LIKE '%[^0-9a-f]%'),
        CONSTRAINT CK_AI_SelectionToken_Expiry  CHECK (ExpiresAtUtc > IssuedAtUtc),
        CONSTRAINT CK_AI_SelectionToken_Channel CHECK (ChannelType IN ('WEB','TELEGRAM')),
        CONSTRAINT CK_AI_SelectionToken_Entity  CHECK (EntityType IN ('CUSTOMER','PRODUCT')),
        CONSTRAINT CK_AI_SelectionToken_Candid  CHECK (ISJSON(CandidateJson) = 1)
    );

    CREATE INDEX IX_AI_SelectionToken_Expiry
        ON dbo.AI_SelectionToken (ExpiresAtUtc, Username);
END;
GO

CREATE OR ALTER PROCEDURE dbo.API_SelectionToken_Issue_AI
    @Username           VARCHAR(50),
    @ChannelType         VARCHAR(20),
    @ChannelSessionID    VARCHAR(100),
    @EntityType          VARCHAR(20),
    @CandidateJson       NVARCHAR(MAX),
    @PendingRequestJson  NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @Username = LTRIM(RTRIM(COALESCE(@Username, '')));
    SET @ChannelType = UPPER(LTRIM(RTRIM(COALESCE(@ChannelType, ''))));
    SET @ChannelSessionID = LTRIM(RTRIM(COALESCE(@ChannelSessionID, '')));
    SET @EntityType = UPPER(LTRIM(RTRIM(COALESCE(@EntityType, ''))));

    IF NOT EXISTS (SELECT 1 FROM dbo.SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'Tài khoản không tồn tại hoặc đã bị khóa.' AS Msg, 1 AS MsgType, 'INVALID_USER' AS Code;
        RETURN;
    END;
    IF @ChannelType NOT IN ('WEB', 'TELEGRAM') OR @ChannelSessionID = ''
    BEGIN
        SELECT N'Thông tin phiên không hợp lệ.' AS Msg, 1 AS MsgType, 'INVALID_CHANNEL' AS Code;
        RETURN;
    END;
    IF @EntityType NOT IN ('CUSTOMER', 'PRODUCT')
    BEGIN
        SELECT N'Loại thực thể không hợp lệ.' AS Msg, 1 AS MsgType, 'INVALID_ENTITY_TYPE' AS Code;
        RETURN;
    END;
    IF ISJSON(@CandidateJson) <> 1 OR NOT EXISTS (SELECT 1 FROM OPENJSON(@CandidateJson))
    BEGIN
        SELECT N'Danh sách kết quả để chọn không hợp lệ.' AS Msg, 1 AS MsgType, 'INVALID_CANDIDATES' AS Code;
        RETURN;
    END;
    IF @PendingRequestJson IS NOT NULL AND ISJSON(@PendingRequestJson) <> 1
    BEGIN
        SELECT N'Yêu cầu nghiệp vụ đang chờ không hợp lệ.' AS Msg, 1 AS MsgType, 'INVALID_PENDING_REQUEST' AS Code;
        RETURN;
    END;

    DECLARE @SelectionToken CHAR(32) = LOWER(CONVERT(CHAR(32), CRYPT_GEN_RANDOM(16), 2));
    DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @ExpiresAtUtc DATETIME2(3) = DATEADD(MINUTE, 7, @Now);

    BEGIN TRANSACTION;

    DELETE TOP (500) dbo.AI_SelectionToken
    WHERE ExpiresAtUtc < DATEADD(DAY, -1, @Now);

    INSERT dbo.AI_SelectionToken
        (SelectionToken, Username, ChannelType, ChannelSessionID, EntityType, CandidateJson, PendingRequestJson, IssuedAtUtc, ExpiresAtUtc)
    VALUES
        (@SelectionToken, @Username, @ChannelType, @ChannelSessionID, @EntityType, @CandidateJson, @PendingRequestJson, @Now, @ExpiresAtUtc);

    COMMIT TRANSACTION;

    SELECT @SelectionToken AS SelectionToken, @ExpiresAtUtc AS ExpiresAtUtc,
           DATEDIFF(SECOND, @Now, @ExpiresAtUtc) AS ExpiresInSeconds,
           N'Đã tạo phiên lựa chọn.' AS Msg, 0 AS MsgType;
END;
GO

CREATE OR ALTER PROCEDURE dbo.API_SelectionToken_Consume_AI
    @Username         VARCHAR(50),
    @ChannelType      VARCHAR(20),
    @ChannelSessionID VARCHAR(100),
    @SelectionToken   CHAR(32),
    @ChosenEntityID   VARCHAR(50) = '',
    @ChosenIndex      INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @Username = LTRIM(RTRIM(COALESCE(@Username, '')));
    SET @ChannelType = UPPER(LTRIM(RTRIM(COALESCE(@ChannelType, ''))));
    SET @ChannelSessionID = LTRIM(RTRIM(COALESCE(@ChannelSessionID, '')));
    SET @SelectionToken = LOWER(LTRIM(RTRIM(COALESCE(@SelectionToken, ''))));
    SET @ChosenEntityID = LTRIM(RTRIM(COALESCE(@ChosenEntityID, '')));

    IF LEN(@SelectionToken) <> 32 OR @SelectionToken LIKE '%[^0-9a-f]%'
       OR (@ChosenEntityID = '' AND @ChosenIndex IS NULL)
       OR (@ChosenIndex IS NOT NULL AND (@ChosenIndex < 0 OR @ChosenIndex > 7 OR @ChosenEntityID <> ''))
    BEGIN
        SELECT N'Yêu cầu chọn kết quả không hợp lệ.' AS Msg, 1 AS MsgType, 'INVALID_REQUEST' AS Code;
        RETURN;
    END;

    -- Cố ý trả cùng một thông báo cho "không tồn tại", "hết hạn", "sai tài khoản"
    -- và "sai phiên" — không cho kẻ dò token biết lý do cụ thể là gì (SEARCH-13).
    DECLARE @GenericFailMsg NVARCHAR(200) = N'Phiên lựa chọn không còn hiệu lực, vui lòng tìm lại.';

    -- Recheck the active identity and fail-closed customer scope at consume time.
    -- AR_GetObjectByUserFnc alone can fall open for a missing org chart.
    IF NOT EXISTS (SELECT 1 FROM dbo.SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT @GenericFailMsg AS Msg, 1 AS MsgType, 'SELECTION_TOKEN_INVALID' AS Code;
        RETURN;
    END;

    DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @EntityType VARCHAR(20), @CandidateJson NVARCHAR(MAX), @PendingRequestJson NVARCHAR(MAX);

    SELECT @EntityType = EntityType, @CandidateJson = CandidateJson, @PendingRequestJson = PendingRequestJson
    FROM dbo.AI_SelectionToken
    WHERE SelectionToken = @SelectionToken
      AND Username = @Username
      AND ChannelType = @ChannelType
      AND ChannelSessionID = @ChannelSessionID
      AND ConsumedAtUtc IS NULL
      AND ExpiresAtUtc > @Now;

    IF @EntityType IS NULL
    BEGIN
        SELECT @GenericFailMsg AS Msg, 1 AS MsgType, 'SELECTION_TOKEN_INVALID' AS Code;
        RETURN;
    END;

    -- Telegram callback data stays below 64 bytes: token + candidate index.
    -- Resolve the index only against the stored, identity-bound candidate list.
    IF @ChosenIndex IS NOT NULL
    BEGIN
        SELECT @ChosenEntityID = JSON_VALUE([value], '$.id')
        FROM OPENJSON(@CandidateJson) WHERE [key] = CONVERT(VARCHAR(10), @ChosenIndex);
    END;

    IF NOT EXISTS (SELECT 1 FROM OPENJSON(@CandidateJson) WITH (id VARCHAR(50) '$.id') WHERE id = @ChosenEntityID)
    BEGIN
        SELECT @GenericFailMsg AS Msg, 1 AS MsgType, 'SELECTION_TOKEN_INVALID' AS Code;
        RETURN;
    END;

    -- Phạm vi có thể đã đổi giữa lúc issue và lúc chọn (đổi ca, đổi tuyến) — kiểm
    -- lại ngay tại đây cho khách hàng; sản phẩm để API nghiệp vụ tự áp phạm vi
    -- chi nhánh/tồn kho của nó khi dùng ID đã resolve.
    IF @EntityType = 'CUSTOMER' AND NOT EXISTS
    (
        SELECT 1 FROM dbo.AI_ScopeGuardFnc(@Username) WHERE IsScopeResolvable = 1
    )
    BEGIN
        SELECT @GenericFailMsg AS Msg, 1 AS MsgType, 'SELECTION_TOKEN_INVALID' AS Code;
        RETURN;
    END;

    IF @EntityType = 'CUSTOMER' AND NOT EXISTS
    (
        SELECT 1 FROM dbo.AR_GetObjectByUserFnc(@Username) WHERE ObjectID = @ChosenEntityID
    )
    BEGIN
        SELECT @GenericFailMsg AS Msg, 1 AS MsgType, 'SELECTION_TOKEN_INVALID' AS Code;
        RETURN;
    END;

    UPDATE dbo.AI_SelectionToken
    SET ConsumedAtUtc = @Now, ConsumedEntityID = @ChosenEntityID
    WHERE SelectionToken = @SelectionToken
      AND Username = @Username
      AND ChannelType = @ChannelType
      AND ChannelSessionID = @ChannelSessionID
      AND ConsumedAtUtc IS NULL
      AND ExpiresAtUtc > @Now;

    IF @@ROWCOUNT = 0
    BEGIN
        -- Đã bị tiêu thụ bởi một request khác chen giữa lúc kiểm tra ở trên.
        SELECT @GenericFailMsg AS Msg, 1 AS MsgType, 'SELECTION_TOKEN_INVALID' AS Code;
        RETURN;
    END;

    SELECT @ChosenEntityID AS ConsumedEntityID, @EntityType AS EntityType, @PendingRequestJson AS PendingRequestJson,
           N'Đã chọn.' AS Msg, 0 AS MsgType;
END;
GO

/* Metadata cố định ApiCode, tránh phụ thuộc quy tắc tách CamelCase của auto-bootstrap. */
IF OBJECT_ID(N'dbo.API_Definition', N'U') IS NOT NULL
BEGIN
    MERGE dbo.API_Definition AS T
    USING
    (
        SELECT CAST('@selection_token_issue' AS VARCHAR(100)) AS ApiCode,
               CAST(N'Tạo phiên chọn kết quả tìm kiếm' AS NVARCHAR(200)) AS ApiName,
               CAST('API_SelectionToken_Issue_AI' AS VARCHAR(200)) AS StoredProcedure
        UNION ALL
        SELECT '@selection_token_consume', N'Xác nhận kết quả đã chọn', 'API_SelectionToken_Consume_AI'
    ) AS S
    ON T.ApiCode = S.ApiCode
    WHEN MATCHED THEN UPDATE SET
        T.ApiName = S.ApiName,
        T.ApiDescription = N'Phát hành/tiêu thụ token ngắn hạn cho luồng tìm kiếm nhiều kết quả, bắt buộc người dùng chọn.',
        T.StoredProcedure = S.StoredProcedure,
        T.Category = N'TÌM KIẾM', T.UiTemplate = 'DEFAULT', T.IconEmoji = N'🔎', T.IsActive = 1,
        T.OperationType = 'MUTATION', T.RequiredCapability = 'api.mutation', T.AllowedCapabilities = N'["api.mutation"]',
        T.ScopeResolver = 'VERIFIED_USER_HIERARCHY', T.OwnershipRule = 'SELF_ONLY',
        T.ContractVersion = 'SEARCH_SELECTION_V1', T.ContractUpdatedAt = SYSUTCDATETIME(),
        T.ContractUpdatedBy = 'SEARCH-001'
    WHEN NOT MATCHED THEN INSERT
    (
        ApiCode, ApiName, ApiDescription, StoredProcedure, Category, UiTemplate, IconEmoji,
        IsActive, OrderIndex, OperationType, RequiredCapability, AllowedCapabilities,
        ScopeResolver, OwnershipRule, ContractVersion, ContractUpdatedAt, ContractUpdatedBy
    )
    VALUES
    (
        S.ApiCode, S.ApiName,
        N'Phát hành/tiêu thụ token ngắn hạn cho luồng tìm kiếm nhiều kết quả, bắt buộc người dùng chọn.',
        S.StoredProcedure, N'TÌM KIẾM', 'DEFAULT', N'🔎', 1, 40,
        'MUTATION', 'api.mutation', N'["api.mutation"]', 'VERIFIED_USER_HIERARCHY',
        'SELF_ONLY', 'SEARCH_SELECTION_V1', SYSUTCDATETIME(), 'SEARCH-001'
    );

    IF OBJECT_ID(N'dbo.API_Field', N'U') IS NOT NULL
    BEGIN
        DECLARE @IssueApiID INT = (SELECT ApiID FROM dbo.API_Definition WHERE ApiCode = '@selection_token_issue');
        DECLARE @ConsumeApiID INT = (SELECT ApiID FROM dbo.API_Definition WHERE ApiCode = '@selection_token_consume');

        MERGE dbo.API_Field AS T
        USING
        (
            SELECT @IssueApiID ApiID, CAST('@Username' AS VARCHAR(100)) FieldCode, CAST(N'Người dùng' AS NVARCHAR(200)) FieldName,
                   CAST('VARCHAR' AS VARCHAR(50)) DataType, CAST('hidden' AS VARCHAR(50)) ControlType,
                   CAST(0 AS BIT) IsRequired, CAST(1 AS BIT) IsSystemParam, 1 OrderIndex,
                   CAST('SERVER_MAPPING' AS VARCHAR(50)) SourceOfTruth, CAST(NULL AS NVARCHAR(500)) ValidationRule
            UNION ALL SELECT @IssueApiID, '@ChannelType', N'Kênh', 'VARCHAR', 'hidden', 1, 0, 2, 'USER_INPUT', N'REQUIRED'
            UNION ALL SELECT @IssueApiID, '@ChannelSessionID', N'Phiên', 'VARCHAR', 'hidden', 1, 0, 3, 'USER_INPUT', N'REQUIRED'
            UNION ALL SELECT @IssueApiID, '@EntityType', N'Loại thực thể', 'VARCHAR', 'hidden', 1, 0, 4, 'USER_INPUT', N'REQUIRED'
            UNION ALL SELECT @IssueApiID, '@CandidateJson', N'Danh sách kết quả', 'NVARCHAR', 'hidden', 1, 0, 5, 'USER_INPUT', N'REQUIRED'
            UNION ALL SELECT @IssueApiID, '@PendingRequestJson', N'Yêu cầu đang chờ', 'NVARCHAR', 'hidden', 0, 0, 6, 'USER_INPUT', NULL
            UNION ALL
            SELECT @ConsumeApiID, '@Username', N'Người dùng', 'VARCHAR', 'hidden', 0, 1, 1, 'SERVER_MAPPING', NULL
            UNION ALL SELECT @ConsumeApiID, '@ChannelType', N'Kênh', 'VARCHAR', 'hidden', 1, 0, 2, 'USER_INPUT', N'REQUIRED'
            UNION ALL SELECT @ConsumeApiID, '@ChannelSessionID', N'Phiên', 'VARCHAR', 'hidden', 1, 0, 3, 'USER_INPUT', N'REQUIRED'
            UNION ALL SELECT @ConsumeApiID, '@SelectionToken', N'Token', 'VARCHAR', 'hidden', 1, 0, 4, 'USER_INPUT', N'REQUIRED'
            UNION ALL SELECT @ConsumeApiID, '@ChosenEntityID', N'Đã chọn', 'VARCHAR', 'text', 0, 0, 5, 'USER_INPUT', NULL
            UNION ALL SELECT @ConsumeApiID, '@ChosenIndex', N'Vị trí đã chọn', 'INT', 'hidden', 0, 0, 6, 'USER_INPUT', NULL
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

DENY SELECT, INSERT, UPDATE, DELETE ON dbo.AI_SelectionToken TO public;

SELECT Migration = 'SEARCH-001', Status = 'READY';
GO
