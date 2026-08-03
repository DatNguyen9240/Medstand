/* P2-04: hash-only mutation idempotency reservation. Safe to run repeatedly. */
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID('dbo.AI_API_MutationIdempotency', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_API_MutationIdempotency (
        IdempotencyKeyHash CHAR(64) NOT NULL,
        VerifiedUserHash   CHAR(64) NOT NULL,
        ApiCode            VARCHAR(100) NOT NULL,
        RequestFingerprintHash CHAR(64) NULL,
        Status             VARCHAR(20) NOT NULL,
        FirstRequestID     VARCHAR(100) NOT NULL,
        LastRequestID      VARCHAR(100) NOT NULL,
        ResultEntityID     VARCHAR(100) NULL,
        ResultMsg          NVARCHAR(500) NULL,
        ResultMsgType      INT NULL,
        CreatedAt          DATETIME2(3) NOT NULL CONSTRAINT DF_AI_API_MutationIdempotency_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt          DATETIME2(3) NOT NULL CONSTRAINT DF_AI_API_MutationIdempotency_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CompletedAt        DATETIME2(3) NULL,
        CONSTRAINT PK_AI_API_MutationIdempotency PRIMARY KEY (IdempotencyKeyHash, VerifiedUserHash, ApiCode),
        CONSTRAINT CK_AI_API_MutationIdempotency_Status CHECK (Status IN ('PENDING', 'COMPLETED', 'FAILED'))
    );
    CREATE INDEX IX_AI_API_MutationIdempotency_UpdatedAt ON dbo.AI_API_MutationIdempotency (UpdatedAt);
END;
GO

IF COL_LENGTH('dbo.AI_API_MutationIdempotency', 'RequestFingerprintHash') IS NULL
    ALTER TABLE dbo.AI_API_MutationIdempotency ADD RequestFingerprintHash CHAR(64) NULL;
IF COL_LENGTH('dbo.AI_API_MutationIdempotency', 'ResultEntityID') IS NULL
    ALTER TABLE dbo.AI_API_MutationIdempotency ADD ResultEntityID VARCHAR(100) NULL;
IF COL_LENGTH('dbo.AI_API_MutationIdempotency', 'ResultMsg') IS NULL
    ALTER TABLE dbo.AI_API_MutationIdempotency ADD ResultMsg NVARCHAR(500) NULL;
IF COL_LENGTH('dbo.AI_API_MutationIdempotency', 'ResultMsgType') IS NULL
    ALTER TABLE dbo.AI_API_MutationIdempotency ADD ResultMsgType INT NULL;
GO

DENY SELECT, INSERT, UPDATE, DELETE ON dbo.AI_API_MutationIdempotency TO public;
GO

CREATE OR ALTER PROCEDURE dbo.AI_ReserveAPIMutation
    @IdempotencyKeyHash CHAR(64),
    @VerifiedUserHash CHAR(64),
    @ApiCode VARCHAR(100),
    @RequestID VARCHAR(100),
    @RequestFingerprintHash CHAR(64) = NULL,
    @PendingTimeoutSeconds INT = 300
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @IdempotencyKeyHash NOT LIKE REPLICATE('[0-9a-f]', 64)
       OR @VerifiedUserHash NOT LIKE REPLICATE('[0-9a-f]', 64)
       OR @RequestID NOT LIKE 'req-%'
       OR COALESCE(@ApiCode, '') = ''
        THROW 51250, 'Invalid mutation idempotency context.', 1;

    SET @PendingTimeoutSeconds = CASE WHEN @PendingTimeoutSeconds BETWEEN 30 AND 3600 THEN @PendingTimeoutSeconds ELSE 300 END;
    DECLARE @Status VARCHAR(20), @UpdatedAt DATETIME2(3), @StoredFingerprintHash CHAR(64),
            @ResultEntityID VARCHAR(100), @ResultMsg NVARCHAR(500), @ResultMsgType INT,
            @Decision VARCHAR(20);

    BEGIN TRANSACTION;
    SELECT @Status = Status,
           @UpdatedAt = UpdatedAt,
           @StoredFingerprintHash = RequestFingerprintHash,
           @ResultEntityID = ResultEntityID,
           @ResultMsg = ResultMsg,
           @ResultMsgType = ResultMsgType
    FROM dbo.AI_API_MutationIdempotency WITH (UPDLOCK, HOLDLOCK)
    WHERE IdempotencyKeyHash = @IdempotencyKeyHash
      AND VerifiedUserHash = @VerifiedUserHash
      AND ApiCode = @ApiCode;

    IF @Status IS NULL
    BEGIN
        INSERT dbo.AI_API_MutationIdempotency (
            IdempotencyKeyHash, VerifiedUserHash, ApiCode, RequestFingerprintHash,
            Status, FirstRequestID, LastRequestID
        ) VALUES (
            @IdempotencyKeyHash, @VerifiedUserHash, LEFT(@ApiCode, 100), @RequestFingerprintHash,
            'PENDING', @RequestID, @RequestID
        );
        SET @Decision = 'ACQUIRED';
    END
    ELSE IF @RequestFingerprintHash IS NOT NULL
         AND @StoredFingerprintHash IS NOT NULL
         AND @StoredFingerprintHash <> @RequestFingerprintHash
        SET @Decision = 'CONFLICT';
    ELSE IF @Status = 'COMPLETED'
        SET @Decision = 'REPLAY';
    ELSE IF @Status = 'PENDING' AND @UpdatedAt >= DATEADD(SECOND, -@PendingTimeoutSeconds, SYSUTCDATETIME())
        SET @Decision = 'IN_PROGRESS';
    ELSE
    BEGIN
        UPDATE dbo.AI_API_MutationIdempotency
        SET Status = 'PENDING',
            RequestFingerprintHash = COALESCE(@RequestFingerprintHash, RequestFingerprintHash),
            LastRequestID = @RequestID,
            ResultEntityID = NULL,
            ResultMsg = NULL,
            ResultMsgType = NULL,
            UpdatedAt = SYSUTCDATETIME(),
            CompletedAt = NULL
        WHERE IdempotencyKeyHash = @IdempotencyKeyHash
          AND VerifiedUserHash = @VerifiedUserHash
          AND ApiCode = @ApiCode;
        SET @Decision = 'ACQUIRED';
    END;

    DELETE TOP (200) FROM dbo.AI_API_MutationIdempotency
    WHERE UpdatedAt < DATEADD(DAY, -30, SYSUTCDATETIME());
    COMMIT TRANSACTION;

    SELECT @Decision AS Decision,
           @ResultEntityID AS ResultEntityID,
           @ResultMsg AS ResultMsg,
           @ResultMsgType AS ResultMsgType;
END;
GO

CREATE OR ALTER PROCEDURE dbo.AI_CompleteAPIMutation
    @IdempotencyKeyHash CHAR(64),
    @VerifiedUserHash CHAR(64),
    @ApiCode VARCHAR(100),
    @RequestID VARCHAR(100),
    @Outcome VARCHAR(20),
    @ResultEntityID VARCHAR(100) = NULL,
    @ResultMsg NVARCHAR(500) = NULL,
    @ResultMsgType INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET @Outcome = CASE WHEN @Outcome IN ('COMPLETED', 'FAILED') THEN @Outcome ELSE 'FAILED' END;

    UPDATE dbo.AI_API_MutationIdempotency
    SET Status = @Outcome,
        LastRequestID = @RequestID,
        ResultEntityID = CASE WHEN @Outcome = 'COMPLETED' THEN @ResultEntityID ELSE NULL END,
        ResultMsg = CASE WHEN @Outcome = 'COMPLETED' THEN @ResultMsg ELSE NULL END,
        ResultMsgType = CASE WHEN @Outcome = 'COMPLETED' THEN @ResultMsgType ELSE NULL END,
        UpdatedAt = SYSUTCDATETIME(),
        CompletedAt = CASE WHEN @Outcome = 'COMPLETED' THEN SYSUTCDATETIME() ELSE NULL END
    WHERE IdempotencyKeyHash = @IdempotencyKeyHash
      AND VerifiedUserHash = @VerifiedUserHash
      AND ApiCode = @ApiCode;

    IF @@ROWCOUNT <> 1 THROW 51251, 'Mutation reservation was not found.', 1;
END;
GO
