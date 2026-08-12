/* P1-04: privacy-safe API request audit. Safe to run repeatedly. */
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID('dbo.AI_API_RequestAudit', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_API_RequestAudit (
        AuditID                BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        RequestID              VARCHAR(100) NOT NULL,
        CorrelationHintHash    CHAR(64) NULL,
        VerifiedUserHash       CHAR(64) NULL,
        ApiCode                VARCHAR(100) NOT NULL,
        OperationType          VARCHAR(20) NOT NULL,
        ResultCode             VARCHAR(60) NOT NULL,
        HttpStatus             SMALLINT NOT NULL,
        DurationMs             INT NOT NULL,
        RowCountBucket         VARCHAR(20) NOT NULL,
        IdempotencyKeyHash     CHAR(64) NULL,
        TransactionOutcome     VARCHAR(30) NOT NULL,
        N8nExecutionID         VARCHAR(80) NULL,
        StartedAt              DATETIME2(3) NOT NULL,
        CompletedAt            DATETIME2(3) NOT NULL CONSTRAINT DF_AI_API_RequestAudit_CompletedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_AI_API_RequestAudit_RequestID UNIQUE (RequestID),
        CONSTRAINT CK_AI_API_RequestAudit_Operation CHECK (OperationType IN ('READ', 'MUTATION', 'CATALOG', 'DENY', 'UNKNOWN')),
        CONSTRAINT CK_AI_API_RequestAudit_Transaction CHECK (TransactionOutcome IN ('NOT_APPLICABLE', 'NOT_STARTED', 'NAVIGATION_ONLY', 'COMMITTED', 'ROLLED_BACK')),
        CONSTRAINT CK_AI_API_RequestAudit_RowBucket CHECK (RowCountBucket IN ('0', '1', '2-10', '11-100', '100+', 'HIDDEN'))
    );

    CREATE INDEX IX_AI_API_RequestAudit_CompletedAt ON dbo.AI_API_RequestAudit (CompletedAt DESC);
    CREATE INDEX IX_AI_API_RequestAudit_RequestID ON dbo.AI_API_RequestAudit (RequestID);
    CREATE INDEX IX_AI_API_RequestAudit_UserHash ON dbo.AI_API_RequestAudit (VerifiedUserHash, CompletedAt DESC);
END;

BEGIN TRANSACTION;
REVOKE SELECT ON dbo.AI_API_RequestAudit TO public;
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.AI_API_RequestAudit')
      AND name = N'CK_AI_API_RequestAudit_Operation'
)
    ALTER TABLE dbo.AI_API_RequestAudit DROP CONSTRAINT CK_AI_API_RequestAudit_Operation;

ALTER TABLE dbo.AI_API_RequestAudit WITH CHECK
ADD CONSTRAINT CK_AI_API_RequestAudit_Operation
CHECK (OperationType IN ('READ', 'MUTATION', 'CATALOG', 'DENY', 'UNKNOWN'));

DENY SELECT, INSERT, UPDATE, DELETE ON dbo.AI_API_RequestAudit TO public;
COMMIT TRANSACTION;
GO

CREATE OR ALTER PROCEDURE dbo.AI_WriteAPIRequestAudit
    @RequestID VARCHAR(100),
    @CorrelationHintHash CHAR(64) = NULL,
    @VerifiedUserHash CHAR(64) = NULL,
    @ApiCode VARCHAR(100),
    @OperationType VARCHAR(20),
    @ResultCode VARCHAR(60),
    @HttpStatus SMALLINT,
    @DurationMs INT,
    @RowCountBucket VARCHAR(20),
    @IdempotencyKeyHash CHAR(64) = NULL,
    @TransactionOutcome VARCHAR(30),
    @N8nExecutionID VARCHAR(80) = NULL,
    @StartedAt DATETIME2(3)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @RequestID NOT LIKE 'req-%' OR LEN(@RequestID) > 100
        THROW 51240, 'Invalid server request ID.', 1;
    IF @OperationType NOT IN ('READ', 'MUTATION', 'CATALOG', 'DENY', 'UNKNOWN')
        SET @OperationType = 'UNKNOWN';
    IF @TransactionOutcome NOT IN ('NOT_APPLICABLE', 'NOT_STARTED', 'NAVIGATION_ONLY', 'COMMITTED', 'ROLLED_BACK')
        SET @TransactionOutcome = 'NOT_STARTED';
    IF @RowCountBucket NOT IN ('0', '1', '2-10', '11-100', '100+', 'HIDDEN')
        SET @RowCountBucket = 'HIDDEN';
    SET @DurationMs = CASE WHEN @DurationMs < 0 THEN 0 WHEN @DurationMs > 86400000 THEN 86400000 ELSE @DurationMs END;

    BEGIN TRANSACTION;
    IF NOT EXISTS (SELECT 1 FROM dbo.AI_API_RequestAudit WITH (UPDLOCK, HOLDLOCK) WHERE RequestID = @RequestID)
    BEGIN
        INSERT dbo.AI_API_RequestAudit (
            RequestID, CorrelationHintHash, VerifiedUserHash, ApiCode, OperationType,
            ResultCode, HttpStatus, DurationMs, RowCountBucket, IdempotencyKeyHash,
            TransactionOutcome, N8nExecutionID, StartedAt, CompletedAt
        ) VALUES (
            @RequestID, @CorrelationHintHash, @VerifiedUserHash, LEFT(@ApiCode, 100), @OperationType,
            LEFT(@ResultCode, 60), @HttpStatus, @DurationMs, @RowCountBucket, @IdempotencyKeyHash,
            @TransactionOutcome, @N8nExecutionID, @StartedAt, SYSUTCDATETIME()
        );
    END;

    /* Enforced rolling retention without a separate scheduler. */
    DELETE TOP (500) FROM dbo.AI_API_RequestAudit
    WHERE CompletedAt < DATEADD(DAY, -90, SYSUTCDATETIME());
    COMMIT TRANSACTION;
END;
GO

CREATE OR ALTER PROCEDURE dbo.API_ReadRequestAudit_AI
    @Username VARCHAR(50),
    @RequestID VARCHAR(100) = NULL,
    @FromUtc DATETIME2(3) = NULL,
    @ToUtc DATETIME2(3) = NULL,
    @TopN INT = 100
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Role VARCHAR(50) = '';
    SELECT TOP (1) @Role = UPPER(ISNULL(UserGroupID, ''))
    FROM dbo.SY_User
    WHERE UserName = @Username AND COALESCE(Disable, 0) = 0;

    IF @Role NOT IN ('ADMIN', 'SECURITY', 'QA')
    BEGIN
        SELECT N'Quyền truy cập audit bị từ chối.' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    SET @TopN = CASE WHEN @TopN BETWEEN 1 AND 500 THEN @TopN ELSE 100 END;
    SET @FromUtc = COALESCE(@FromUtc, DATEADD(DAY, -7, SYSUTCDATETIME()));
    SET @ToUtc = COALESCE(@ToUtc, SYSUTCDATETIME());

    SELECT TOP (@TopN)
        RequestID, CorrelationHintHash, VerifiedUserHash, ApiCode, OperationType,
        ResultCode, HttpStatus, DurationMs, RowCountBucket, IdempotencyKeyHash,
        TransactionOutcome, N8nExecutionID, StartedAt, CompletedAt
    FROM dbo.AI_API_RequestAudit
    WHERE CompletedAt BETWEEN @FromUtc AND @ToUtc
      AND (@RequestID IS NULL OR RequestID = @RequestID)
    ORDER BY CompletedAt DESC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.AI_PruneAPIRequestAudit
    @Username VARCHAR(50),
    @RetentionDays INT = 90
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Role VARCHAR(50) = '';
    SELECT TOP (1) @Role = UPPER(ISNULL(UserGroupID, ''))
    FROM dbo.SY_User
    WHERE UserName = @Username AND COALESCE(Disable, 0) = 0;
    IF @Role NOT IN ('ADMIN', 'SECURITY')
        THROW 51241, 'Audit retention access denied.', 1;

    SET @RetentionDays = CASE WHEN @RetentionDays BETWEEN 30 AND 365 THEN @RetentionDays ELSE 90 END;
    DELETE FROM dbo.AI_API_RequestAudit
    WHERE CompletedAt < DATEADD(DAY, -@RetentionDays, SYSUTCDATETIME());
    SELECT DeletedRows = @@ROWCOUNT, RetentionDays = @RetentionDays;
END;
GO
