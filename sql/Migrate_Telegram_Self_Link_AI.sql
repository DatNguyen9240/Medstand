/*
  TELEGRAM-SELF-LINK-001
  One-time link codes issued from an authenticated Medstand web session and
  consumed from a private Telegram chat.

  Security properties:
  - six-digit code is returned once and never stored in plaintext;
  - code expires after five minutes and can be consumed only once;
  - only enabled pilot accounts and enabled SY_User records may issue/consume;
  - five invalid attempts lock a Telegram identity for fifteen minutes;
  - linking revokes conflicting active mappings atomically.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID('dbo.AI_TelegramLinkCode', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_TelegramLinkCode (
        LinkCodeID       BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AI_TelegramLinkCode PRIMARY KEY,
        UserName         VARCHAR(50)   NOT NULL,
        CodeSalt         VARBINARY(16) NOT NULL,
        CodeHash         VARBINARY(32) NOT NULL,
        IssuedAtUtc      DATETIME2(3)  NOT NULL,
        ExpiresAtUtc     DATETIME2(3)  NOT NULL,
        ConsumedAtUtc    DATETIME2(3)  NULL,
        ConsumedByTgID   VARCHAR(20)   NULL,
        RevokedAtUtc     DATETIME2(3)  NULL,
        RequestID        VARCHAR(100)  NULL,
        CONSTRAINT CK_AI_TelegramLinkCode_Expiry CHECK (ExpiresAtUtc > IssuedAtUtc),
        CONSTRAINT CK_AI_TelegramLinkCode_Consumer CHECK (
            ConsumedByTgID IS NULL OR (
                LEN(ConsumedByTgID) BETWEEN 1 AND 20
                AND ConsumedByTgID NOT LIKE '%[^0-9]%'
            )
        )
    );

    CREATE INDEX IX_AI_TelegramLinkCode_UserActive
        ON dbo.AI_TelegramLinkCode (UserName, ExpiresAtUtc DESC)
        INCLUDE (CodeSalt, CodeHash, ConsumedAtUtc, RevokedAtUtc);
END;
GO

IF OBJECT_ID('dbo.AI_TelegramLinkAttempt', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_TelegramLinkAttempt (
        TelegramUserID   VARCHAR(20)  NOT NULL CONSTRAINT PK_AI_TelegramLinkAttempt PRIMARY KEY,
        WindowStartedUtc DATETIME2(3) NOT NULL,
        FailedAttempts   TINYINT      NOT NULL,
        LockedUntilUtc   DATETIME2(3) NULL,
        UpdatedAtUtc     DATETIME2(3) NOT NULL,
        CONSTRAINT CK_AI_TelegramLinkAttempt_UserID CHECK (
            LEN(TelegramUserID) BETWEEN 1 AND 20
            AND TelegramUserID NOT LIKE '%[^0-9]%'
        ),
        CONSTRAINT CK_AI_TelegramLinkAttempt_Count CHECK (FailedAttempts BETWEEN 0 AND 5)
    );
END;
GO

CREATE OR ALTER PROCEDURE dbo.API_TelegramLinkCode_Issue_AI
    @UserName VARCHAR(50),
    @RequestID VARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @UserName = LTRIM(RTRIM(COALESCE(@UserName, '')));
    SET @RequestID = NULLIF(LEFT(LTRIM(RTRIM(COALESCE(@RequestID, ''))), 100), '');

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.AI_TelegramPilotAllowedAccount
        WHERE UserName=@UserName AND IsEnabled=1
    )
    BEGIN
        SELECT LinkStatus='ACCOUNT_NOT_ALLOWED', StatusCode=403,
               Message=N'Tài khoản chưa nằm trong phạm vi demo Telegram.';
        RETURN;
    END;

    IF NOT EXISTS (
        SELECT 1 FROM dbo.SY_User
        WHERE UserName=@UserName AND COALESCE(Disable,0)=0
    )
    BEGIN
        SELECT LinkStatus='ACCOUNT_DISABLED', StatusCode=403,
               Message=N'Tài khoản không tồn tại hoặc đã bị khóa.';
        RETURN;
    END;

    DECLARE @Now DATETIME2(3)=SYSUTCDATETIME();
    DECLARE @LinkCode CHAR(6)='';
    DECLARE @Salt VARBINARY(16);
    DECLARE @Hash VARBINARY(32);
    DECLARE @CandidateNumber BIGINT;
    DECLARE @Try INT=0;
    DECLARE @Allocated BIT=0;

    BEGIN TRANSACTION;
    DECLARE @AppLockResult INT;
    DECLARE @UserLockResource NVARCHAR(255)='telegram-link-user:' + @UserName;
    EXEC @AppLockResult=sys.sp_getapplock
        @Resource=@UserLockResource,
        @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=5000;
    IF @AppLockResult < 0
        THROW 51330, 'Could not acquire Telegram link-code lock.', 1;
    EXEC @AppLockResult=sys.sp_getapplock
        @Resource='telegram-link-code-allocation',
        @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=5000;
    IF @AppLockResult < 0
        THROW 51331, 'Could not acquire Telegram code-allocation lock.', 1;

    UPDATE dbo.AI_TelegramLinkCode
    SET RevokedAtUtc=@Now
    WHERE UserName=@UserName
      AND ConsumedAtUtc IS NULL AND RevokedAtUtc IS NULL;

    WHILE @Try < 20
    BEGIN
        SET @Try += 1;
        SET @CandidateNumber=ABS(CONVERT(BIGINT,CHECKSUM(CRYPT_GEN_RANDOM(32)))) % 1000000;
        SET @LinkCode=RIGHT('000000' + CONVERT(VARCHAR(6),@CandidateNumber),6);

        IF NOT EXISTS (
            SELECT 1
            FROM dbo.AI_TelegramLinkCode C WITH (UPDLOCK,HOLDLOCK)
            WHERE C.ConsumedAtUtc IS NULL
              AND C.RevokedAtUtc IS NULL
              AND C.ExpiresAtUtc>@Now
              AND C.CodeHash=HASHBYTES('SHA2_256',C.CodeSalt + CONVERT(VARBINARY(6),@LinkCode))
        )
        BEGIN
            SET @Allocated=1;
            BREAK;
        END;
    END;

    IF @Allocated=0
        THROW 51333, 'Could not allocate a unique Telegram link code.', 1;

    SET @Salt=CRYPT_GEN_RANDOM(16);
    SET @Hash=HASHBYTES('SHA2_256',@Salt + CONVERT(VARBINARY(6),@LinkCode));

    INSERT dbo.AI_TelegramLinkCode (
        UserName,CodeSalt,CodeHash,IssuedAtUtc,ExpiresAtUtc,RequestID
    ) VALUES (
        @UserName,@Salt,@Hash,@Now,DATEADD(MINUTE,5,@Now),@RequestID
    );

    DELETE TOP (500) dbo.AI_TelegramLinkCode
    WHERE ExpiresAtUtc<DATEADD(DAY,-7,@Now)
      AND (ConsumedAtUtc IS NOT NULL OR RevokedAtUtc IS NOT NULL);

    COMMIT TRANSACTION;

    SELECT LinkStatus='CODE_ISSUED', StatusCode=200,
           LinkCode=@LinkCode, UserName=@UserName,
           ExpiresAtUtc=DATEADD(MINUTE,5,@Now), ExpiresInSeconds=300,
           Message=N'Gửi /login kèm mã này cho bot Telegram trong 5 phút.';
END;
GO

CREATE OR ALTER PROCEDURE dbo.API_TelegramLinkCode_Consume_AI
    @TelegramUserID VARCHAR(20),
    @TelegramChatID VARCHAR(20),
    @LinkCode VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @TelegramUserID=LTRIM(RTRIM(COALESCE(@TelegramUserID,'')));
    SET @TelegramChatID=LTRIM(RTRIM(COALESCE(@TelegramChatID,'')));
    SET @LinkCode=LTRIM(RTRIM(COALESCE(@LinkCode,'')));

    IF LEN(@TelegramUserID) NOT BETWEEN 1 AND 20
       OR @TelegramUserID LIKE '%[^0-9]%'
       OR @TelegramChatID<>@TelegramUserID
    BEGIN
        SELECT LinkStatus='PRIVATE_CHAT_REQUIRED', StatusCode=403,
               Message=N'Chỉ có thể liên kết trong chat riêng với bot.';
        RETURN;
    END;

    IF LEN(@LinkCode)<>6 OR @LinkCode LIKE '%[^0-9]%'
    BEGIN
        SELECT LinkStatus='INVALID_FORMAT', StatusCode=422,
               Message=N'Cú pháp đúng: /login 123456';
        RETURN;
    END;

    DECLARE @Now DATETIME2(3)=SYSUTCDATETIME();
    DECLARE @WindowStarted DATETIME2(3);
    DECLARE @FailedAttempts TINYINT=0;
    DECLARE @LockedUntil DATETIME2(3);
    DECLARE @LinkCodeID BIGINT;
    DECLARE @UserName VARCHAR(50);

    BEGIN TRANSACTION;
    DECLARE @AppLockResult INT;
    DECLARE @TelegramLockResource NVARCHAR(255)='telegram-link-tg:' + @TelegramUserID;
    EXEC @AppLockResult=sys.sp_getapplock
        @Resource=@TelegramLockResource,
        @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=5000;
    IF @AppLockResult < 0
        THROW 51332, 'Could not acquire Telegram identity lock.', 1;

    SELECT @WindowStarted=WindowStartedUtc,@FailedAttempts=FailedAttempts,@LockedUntil=LockedUntilUtc
    FROM dbo.AI_TelegramLinkAttempt WITH (UPDLOCK,HOLDLOCK)
    WHERE TelegramUserID=@TelegramUserID;

    IF @LockedUntil>@Now
    BEGIN
        COMMIT TRANSACTION;
        SELECT LinkStatus='RATE_LIMITED', StatusCode=429,
               RetryAfterSeconds=DATEDIFF(SECOND,@Now,@LockedUntil),
               Message=N'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau.';
        RETURN;
    END;

    IF @WindowStarted IS NULL OR @WindowStarted<=DATEADD(MINUTE,-15,@Now)
    BEGIN
        SET @WindowStarted=@Now;
        SET @FailedAttempts=0;
        SET @LockedUntil=NULL;
    END;

    SELECT TOP (1) @LinkCodeID=C.LinkCodeID,@UserName=C.UserName
    FROM dbo.AI_TelegramLinkCode C WITH (UPDLOCK,HOLDLOCK)
    JOIN dbo.AI_TelegramPilotAllowedAccount A
      ON A.UserName=C.UserName AND A.IsEnabled=1
    JOIN dbo.SY_User U
      ON U.UserName=C.UserName AND COALESCE(U.Disable,0)=0
    WHERE C.ConsumedAtUtc IS NULL
      AND C.RevokedAtUtc IS NULL
      AND C.ExpiresAtUtc>@Now
      AND C.CodeHash=HASHBYTES('SHA2_256',C.CodeSalt + CONVERT(VARBINARY(6),@LinkCode))
    ORDER BY C.IssuedAtUtc DESC;

    IF @LinkCodeID IS NULL
    BEGIN
        SET @FailedAttempts=CASE WHEN @FailedAttempts<5 THEN @FailedAttempts+1 ELSE 5 END;
        SET @LockedUntil=CASE WHEN @FailedAttempts>=5 THEN DATEADD(MINUTE,15,@Now) ELSE NULL END;

        MERGE dbo.AI_TelegramLinkAttempt WITH (HOLDLOCK) AS Target
        USING (SELECT @TelegramUserID AS TelegramUserID) AS Source
        ON Target.TelegramUserID=Source.TelegramUserID
        WHEN MATCHED THEN UPDATE SET
            WindowStartedUtc=@WindowStarted,FailedAttempts=@FailedAttempts,
            LockedUntilUtc=@LockedUntil,UpdatedAtUtc=@Now
        WHEN NOT MATCHED THEN INSERT (
            TelegramUserID,WindowStartedUtc,FailedAttempts,LockedUntilUtc,UpdatedAtUtc
        ) VALUES (
            @TelegramUserID,@WindowStarted,@FailedAttempts,@LockedUntil,@Now
        );

        COMMIT TRANSACTION;
        SELECT LinkStatus=CASE WHEN @LockedUntil IS NULL THEN 'INVALID_CODE' ELSE 'RATE_LIMITED' END,
               StatusCode=CASE WHEN @LockedUntil IS NULL THEN 422 ELSE 429 END,
               RemainingAttempts=CASE WHEN @LockedUntil IS NULL THEN 5-@FailedAttempts ELSE 0 END,
               RetryAfterSeconds=CASE WHEN @LockedUntil IS NULL THEN 0 ELSE 900 END,
               Message=CASE WHEN @LockedUntil IS NULL
                   THEN N'Mã không đúng, đã hết hạn hoặc đã được sử dụng.'
                   ELSE N'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau.' END;
        RETURN;
    END;

    UPDATE dbo.AI_TelegramAccountLink WITH (UPDLOCK,HOLDLOCK)
    SET IsActive=0,RevokedBy='TELEGRAM_SELF_LINK',RevokedAtUtc=@Now
    WHERE IsActive=1
      AND (TelegramUserID=@TelegramUserID OR UserName=@UserName);

    INSERT dbo.AI_TelegramAccountLink (
        TelegramUserID,TelegramChatID,UserName,IsActive,LinkedBy,LinkedAtUtc
    ) VALUES (
        @TelegramUserID,@TelegramChatID,@UserName,1,'TELEGRAM_SELF_LINK',@Now
    );

    UPDATE dbo.AI_TelegramLinkCode
    SET ConsumedAtUtc=@Now,ConsumedByTgID=@TelegramUserID
    WHERE LinkCodeID=@LinkCodeID AND ConsumedAtUtc IS NULL AND RevokedAtUtc IS NULL;

    UPDATE dbo.AI_TelegramLinkCode
    SET RevokedAtUtc=@Now
    WHERE UserName=@UserName AND LinkCodeID<>@LinkCodeID
      AND ConsumedAtUtc IS NULL AND RevokedAtUtc IS NULL;

    DELETE dbo.AI_TelegramLinkAttempt WHERE TelegramUserID=@TelegramUserID;
    COMMIT TRANSACTION;

    SELECT LinkStatus='LINKED', StatusCode=200,
           U.UserName,U.HoTen AS DisplayName,U.UserGroupID,U.BranchID,
           Message=N'Liên kết Telegram với Medstand thành công.'
    FROM dbo.SY_User U WHERE U.UserName=@UserName;
END;
GO

CREATE OR ALTER PROCEDURE dbo.API_TelegramSelfLink_Status_AI
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        LiveCodes=(SELECT COUNT_BIG(*) FROM dbo.AI_TelegramLinkCode
                   WHERE ConsumedAtUtc IS NULL AND RevokedAtUtc IS NULL AND ExpiresAtUtc>SYSUTCDATETIME()),
        LockedTelegramUsers=(SELECT COUNT_BIG(*) FROM dbo.AI_TelegramLinkAttempt
                             WHERE LockedUntilUtc>SYSUTCDATETIME()),
        SelfLinkedAccounts=(SELECT COUNT_BIG(*) FROM dbo.AI_TelegramAccountLink
                            WHERE IsActive=1 AND LinkedBy='TELEGRAM_SELF_LINK');
END;
GO

DENY SELECT,INSERT,UPDATE,DELETE ON dbo.AI_TelegramLinkCode TO public;
DENY SELECT,INSERT,UPDATE,DELETE ON dbo.AI_TelegramLinkAttempt TO public;

EXEC dbo.API_TelegramSelfLink_Status_AI;
