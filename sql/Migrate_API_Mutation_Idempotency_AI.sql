/* P2-04: hash-only mutation idempotency reservation. Safe to run repeatedly. */
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID('dbo.AI_API_MutationIdempotency', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_API_MutationIdempotency (
        IdempotencyKeyHash CHAR(64) NOT NULL,
        VerifiedUserHash   CHAR(64) NOT NULL,
        ApiCode            VARCHAR(100) NOT NULL,
        Status             VARCHAR(20) NOT NULL,
        FirstRequestID     VARCHAR(100) NOT NULL,
        LastRequestID      VARCHAR(100) NOT NULL,
        CreatedAt          DATETIME2(3) NOT NULL CONSTRAINT DF_AI_API_MutationIdempotency_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt          DATETIME2(3) NOT NULL CONSTRAINT DF_AI_API_MutationIdempotency_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CompletedAt        DATETIME2(3) NULL,
        CONSTRAINT PK_AI_API_MutationIdempotency PRIMARY KEY (IdempotencyKeyHash, VerifiedUserHash, ApiCode),
        CONSTRAINT CK_AI_API_MutationIdempotency_Status CHECK (Status IN ('PENDING', 'COMPLETED', 'FAILED'))
    );
    CREATE INDEX IX_AI_API_MutationIdempotency_UpdatedAt ON dbo.AI_API_MutationIdempotency (UpdatedAt);
END;
GO

DENY SELECT, INSERT, UPDATE, DELETE ON dbo.AI_API_MutationIdempotency TO public;
GO

CREATE OR ALTER PROCEDURE dbo.AI_ReserveAPIMutation
    @IdempotencyKeyHash CHAR(64),
    @VerifiedUserHash CHAR(64),
    @ApiCode VARCHAR(100),
    @RequestID VARCHAR(100),
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
    DECLARE @Status VARCHAR(20), @UpdatedAt DATETIME2(3), @Decision VARCHAR(20);

    BEGIN TRANSACTION;
    SELECT @Status = Status, @UpdatedAt = UpdatedAt
    FROM dbo.AI_API_MutationIdempotency WITH (UPDLOCK, HOLDLOCK)
    WHERE IdempotencyKeyHash = @IdempotencyKeyHash
      AND VerifiedUserHash = @VerifiedUserHash
      AND ApiCode = @ApiCode;

    IF @Status IS NULL
    BEGIN
        INSERT dbo.AI_API_MutationIdempotency (
            IdempotencyKeyHash, VerifiedUserHash, ApiCode, Status, FirstRequestID, LastRequestID
        ) VALUES (
            @IdempotencyKeyHash, @VerifiedUserHash, LEFT(@ApiCode, 100), 'PENDING', @RequestID, @RequestID
        );
        SET @Decision = 'ACQUIRED';
    END
    ELSE IF @Status = 'COMPLETED'
        SET @Decision = 'REPLAY';
    ELSE IF @Status = 'PENDING' AND @UpdatedAt >= DATEADD(SECOND, -@PendingTimeoutSeconds, SYSUTCDATETIME())
        SET @Decision = 'IN_PROGRESS';
    ELSE
    BEGIN
        UPDATE dbo.AI_API_MutationIdempotency
        SET Status = 'PENDING', LastRequestID = @RequestID, UpdatedAt = SYSUTCDATETIME(), CompletedAt = NULL
        WHERE IdempotencyKeyHash = @IdempotencyKeyHash
          AND VerifiedUserHash = @VerifiedUserHash
          AND ApiCode = @ApiCode;
        SET @Decision = 'ACQUIRED';
    END;

    DELETE TOP (200) FROM dbo.AI_API_MutationIdempotency
    WHERE UpdatedAt < DATEADD(DAY, -7, SYSUTCDATETIME());
    COMMIT TRANSACTION;

    SELECT @Decision AS Decision;
END;
GO

CREATE OR ALTER PROCEDURE dbo.AI_CompleteAPIMutation
    @IdempotencyKeyHash CHAR(64),
    @VerifiedUserHash CHAR(64),
    @ApiCode VARCHAR(100),
    @RequestID VARCHAR(100),
    @Outcome VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    SET @Outcome = CASE WHEN @Outcome IN ('COMPLETED', 'FAILED') THEN @Outcome ELSE 'FAILED' END;

    UPDATE dbo.AI_API_MutationIdempotency
    SET Status = @Outcome,
        LastRequestID = @RequestID,
        UpdatedAt = SYSUTCDATETIME(),
        CompletedAt = CASE WHEN @Outcome = 'COMPLETED' THEN SYSUTCDATETIME() ELSE NULL END
    WHERE IdempotencyKeyHash = @IdempotencyKeyHash
      AND VerifiedUserHash = @VerifiedUserHash
      AND ApiCode = @ApiCode;

    IF @@ROWCOUNT <> 1 THROW 51251, 'Mutation reservation was not found.', 1;
END;
GO
