/*
  TELEGRAM-PILOT-001
  Server-owned mapping and short-lived authentication tickets for the Telegram
  demo channel. This migration never stores Telegram bot tokens, Medstand
  passwords, login bearer tokens, or plaintext channel tickets.

  Pilot policy:
  - private chats only (TelegramUserID must equal TelegramChatID);
  - only the 13 approved UAT accounts can be linked;
  - one active Telegram identity per Medstand account and vice versa;
  - tickets expire after 90 seconds and grant api.read plus orders.draft.write only;
  - revoking a link invalidates every outstanding ticket immediately.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID('dbo.AI_TelegramPilotAllowedAccount', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_TelegramPilotAllowedAccount (
        UserName       VARCHAR(50)  NOT NULL CONSTRAINT PK_AI_TelegramPilotAllowedAccount PRIMARY KEY,
        ExpectedRole   VARCHAR(20)  NOT NULL,
        RegionCode     VARCHAR(10)  NOT NULL,
        IsEnabled      BIT          NOT NULL CONSTRAINT DF_AI_TelegramPilotAllowedAccount_IsEnabled DEFAULT (1),
        CreatedAtUtc   DATETIME2(3) NOT NULL CONSTRAINT DF_AI_TelegramPilotAllowedAccount_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_AI_TelegramPilotAllowedAccount_Role CHECK (ExpectedRole IN ('MANAGER', 'SALE')),
        CONSTRAINT CK_AI_TelegramPilotAllowedAccount_Region CHECK (RegionCode IN ('MB', 'MT', 'MN'))
    );
END;
GO

MERGE dbo.AI_TelegramPilotAllowedAccount AS Target
USING (VALUES
    ('QLBH013.MED',  'MANAGER', 'MB'),
    ('NAMDINHB.MED', 'SALE',    'MB'),
    ('QLBH016.MED',  'MANAGER', 'MB'),
    ('BACNINHA.MED', 'SALE',    'MB'),
    ('QLBH005.MED',  'MANAGER', 'MT'),
    ('HUEB.MED',     'SALE',    'MT'),
    ('QLBH010.MED',  'MANAGER', 'MT'),
    ('DANANGA.MED',  'SALE',    'MT'),
    ('QLMN2',        'MANAGER', 'MN'),
    ('CanThoA',      'SALE',    'MN'),
    ('QLMD1',        'MANAGER', 'MN'),
    ('BinhPhuocA',   'SALE',    'MN'),
    ('QLBH024.MED',  'MANAGER', 'MN')
) AS Source (UserName, ExpectedRole, RegionCode)
ON Target.UserName = Source.UserName
WHEN MATCHED THEN UPDATE SET
    ExpectedRole = Source.ExpectedRole,
    RegionCode = Source.RegionCode
WHEN NOT MATCHED THEN INSERT (UserName, ExpectedRole, RegionCode)
VALUES (Source.UserName, Source.ExpectedRole, Source.RegionCode);
GO

IF OBJECT_ID('dbo.AI_TelegramAccountLink', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_TelegramAccountLink (
        LinkID            BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AI_TelegramAccountLink PRIMARY KEY,
        TelegramUserID    VARCHAR(20)  NOT NULL,
        TelegramChatID    VARCHAR(20)  NOT NULL,
        UserName          VARCHAR(50)  NOT NULL,
        IsActive          BIT          NOT NULL CONSTRAINT DF_AI_TelegramAccountLink_IsActive DEFAULT (1),
        LinkedBy          VARCHAR(80)  NOT NULL,
        LinkedAtUtc       DATETIME2(3) NOT NULL CONSTRAINT DF_AI_TelegramAccountLink_LinkedAt DEFAULT SYSUTCDATETIME(),
        RevokedBy         VARCHAR(80)  NULL,
        RevokedAtUtc      DATETIME2(3) NULL,
        CONSTRAINT CK_AI_TelegramAccountLink_UserID CHECK (
            LEN(TelegramUserID) BETWEEN 1 AND 20 AND TelegramUserID NOT LIKE '%[^0-9]%'
        ),
        CONSTRAINT CK_AI_TelegramAccountLink_ChatID CHECK (
            LEN(TelegramChatID) BETWEEN 1 AND 20 AND TelegramChatID NOT LIKE '%[^0-9]%'
        ),
        CONSTRAINT CK_AI_TelegramAccountLink_PrivateChat CHECK (TelegramUserID = TelegramChatID)
    );

    CREATE UNIQUE INDEX UX_AI_TelegramAccountLink_ActiveTelegramUser
        ON dbo.AI_TelegramAccountLink (TelegramUserID)
        WHERE IsActive = 1;

    CREATE UNIQUE INDEX UX_AI_TelegramAccountLink_ActiveUserName
        ON dbo.AI_TelegramAccountLink (UserName)
        WHERE IsActive = 1;

    CREATE INDEX IX_AI_TelegramAccountLink_UserName
        ON dbo.AI_TelegramAccountLink (UserName, LinkedAtUtc DESC);
END;

IF OBJECT_ID('dbo.AI_TelegramAuthTicket', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_TelegramAuthTicket (
        TicketHash          CHAR(64)     NOT NULL CONSTRAINT PK_AI_TelegramAuthTicket PRIMARY KEY,
        TelegramUserID      VARCHAR(20)  NOT NULL,
        TelegramUpdateID    BIGINT       NOT NULL,
        UserName            VARCHAR(50)  NOT NULL,
        IssuedAtUtc         DATETIME2(3) NOT NULL,
        ExpiresAtUtc        DATETIME2(3) NOT NULL,
        VerifyCount         TINYINT      NOT NULL CONSTRAINT DF_AI_TelegramAuthTicket_VerifyCount DEFAULT (0),
        LastVerifiedAtUtc   DATETIME2(3) NULL,
        CONSTRAINT CK_AI_TelegramAuthTicket_Hash CHECK (TicketHash NOT LIKE '%[^0-9a-f]%'),
        CONSTRAINT CK_AI_TelegramAuthTicket_Expiry CHECK (ExpiresAtUtc > IssuedAtUtc),
        CONSTRAINT CK_AI_TelegramAuthTicket_VerifyCount CHECK (VerifyCount BETWEEN 0 AND 8)
    );

    CREATE INDEX IX_AI_TelegramAuthTicket_Expiry
        ON dbo.AI_TelegramAuthTicket (ExpiresAtUtc, TelegramUserID);

    CREATE INDEX IX_AI_TelegramAuthTicket_Update
        ON dbo.AI_TelegramAuthTicket (TelegramUpdateID, IssuedAtUtc DESC);
END;
GO

CREATE OR ALTER PROCEDURE dbo.API_TelegramAccountLink_Upsert_AI
    @TelegramUserID VARCHAR(20),
    @TelegramChatID VARCHAR(20),
    @UserName VARCHAR(50),
    @Actor VARCHAR(80) = 'TELEGRAM_PILOT_CONFIG'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @TelegramUserID = LTRIM(RTRIM(COALESCE(@TelegramUserID, '')));
    SET @TelegramChatID = LTRIM(RTRIM(COALESCE(@TelegramChatID, '')));
    SET @UserName = LTRIM(RTRIM(COALESCE(@UserName, '')));
    SET @Actor = LEFT(LTRIM(RTRIM(COALESCE(NULLIF(@Actor, ''), 'TELEGRAM_PILOT_CONFIG'))), 80);

    IF LEN(@TelegramUserID) NOT BETWEEN 1 AND 20 OR @TelegramUserID LIKE '%[^0-9]%'
        THROW 51310, 'Invalid Telegram user ID.', 1;
    IF @TelegramChatID <> @TelegramUserID
        THROW 51311, 'Telegram pilot supports private chats only.', 1;
    IF NOT EXISTS (
        SELECT 1
        FROM dbo.AI_TelegramPilotAllowedAccount
        WHERE UserName = @UserName AND IsEnabled = 1
    )
        THROW 51312, 'Medstand account is not allowlisted for the Telegram pilot.', 1;
    IF NOT EXISTS (
        SELECT 1 FROM dbo.SY_User
        WHERE UserName = @UserName AND COALESCE(Disable, 0) = 0
    )
        THROW 51313, 'Medstand account does not exist or is disabled.', 1;

    BEGIN TRANSACTION;

    UPDATE dbo.AI_TelegramAccountLink WITH (UPDLOCK, HOLDLOCK)
    SET IsActive = 0,
        RevokedBy = @Actor,
        RevokedAtUtc = SYSUTCDATETIME()
    WHERE IsActive = 1
      AND (TelegramUserID = @TelegramUserID OR UserName = @UserName);

    INSERT dbo.AI_TelegramAccountLink (
        TelegramUserID, TelegramChatID, UserName, IsActive, LinkedBy, LinkedAtUtc
    ) VALUES (
        @TelegramUserID, @TelegramChatID, @UserName, 1, @Actor, SYSUTCDATETIME()
    );

    COMMIT TRANSACTION;

    SELECT
        LinkStatus = 'LINKED',
        TelegramUserID,
        TelegramChatID,
        UserName,
        LinkedAtUtc
    FROM dbo.AI_TelegramAccountLink
    WHERE LinkID = SCOPE_IDENTITY();
END;
GO

CREATE OR ALTER PROCEDURE dbo.API_TelegramAccountLink_Revoke_AI
    @TelegramUserID VARCHAR(20),
    @Actor VARCHAR(80) = 'TELEGRAM_PILOT_CONFIG'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @TelegramUserID = LTRIM(RTRIM(COALESCE(@TelegramUserID, '')));
    SET @Actor = LEFT(LTRIM(RTRIM(COALESCE(NULLIF(@Actor, ''), 'TELEGRAM_PILOT_CONFIG'))), 80);

    BEGIN TRANSACTION;
    UPDATE dbo.AI_TelegramAccountLink WITH (UPDLOCK, HOLDLOCK)
    SET IsActive = 0,
        RevokedBy = @Actor,
        RevokedAtUtc = SYSUTCDATETIME()
    WHERE TelegramUserID = @TelegramUserID AND IsActive = 1;
    DECLARE @RevokedRows INT = @@ROWCOUNT;
    COMMIT TRANSACTION;

    SELECT LinkStatus = CASE WHEN @RevokedRows > 0 THEN 'REVOKED' ELSE 'NOT_FOUND' END,
           RevokedRows = @RevokedRows;
END;
GO

CREATE OR ALTER PROCEDURE dbo.API_TelegramAuthTicket_Issue_AI
    @TelegramUserID VARCHAR(20),
    @TelegramChatID VARCHAR(20),
    @TelegramUpdateID BIGINT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @TelegramUserID = LTRIM(RTRIM(COALESCE(@TelegramUserID, '')));
    SET @TelegramChatID = LTRIM(RTRIM(COALESCE(@TelegramChatID, '')));

    IF LEN(@TelegramUserID) NOT BETWEEN 1 AND 20
       OR @TelegramUserID LIKE '%[^0-9]%'
       OR @TelegramChatID <> @TelegramUserID
       OR @TelegramUpdateID < 0
    BEGIN
        SELECT AuthStatus = 'PRIVATE_CHAT_REQUIRED', StatusCode = 403;
        RETURN;
    END;

    DECLARE @UserName VARCHAR(50) = '';
    SELECT TOP (1) @UserName = L.UserName
    FROM dbo.AI_TelegramAccountLink L
    JOIN dbo.AI_TelegramPilotAllowedAccount A
      ON A.UserName = L.UserName AND A.IsEnabled = 1
    JOIN dbo.SY_User U
      ON U.UserName = L.UserName AND COALESCE(U.Disable, 0) = 0
    WHERE L.TelegramUserID = @TelegramUserID
      AND L.TelegramChatID = @TelegramChatID
      AND L.IsActive = 1
    ORDER BY L.LinkedAtUtc DESC;

    IF @UserName = ''
    BEGIN
        SELECT AuthStatus = 'TELEGRAM_NOT_LINKED', StatusCode = 403;
        RETURN;
    END;

    DECLARE @Ticket VARCHAR(73) = 'telegram_' + LOWER(CONVERT(VARCHAR(64), CRYPT_GEN_RANDOM(32), 2));
    DECLARE @TicketHash CHAR(64) = LOWER(CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', @Ticket), 2));
    DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();

    BEGIN TRANSACTION;
    INSERT dbo.AI_TelegramAuthTicket (
        TicketHash, TelegramUserID, TelegramUpdateID, UserName,
        IssuedAtUtc, ExpiresAtUtc, VerifyCount
    ) VALUES (
        @TicketHash, @TelegramUserID, @TelegramUpdateID, @UserName,
        @Now, DATEADD(SECOND, 90, @Now), 0
    );

    DELETE TOP (500) dbo.AI_TelegramAuthTicket
    WHERE ExpiresAtUtc < DATEADD(DAY, -1, @Now);
    COMMIT TRANSACTION;

    SELECT
        AuthStatus = 'AUTHORIZED',
        StatusCode = 200,
        Capabilities = 'api.read,orders.draft.write',
        AuthTicket = @Ticket,
        U.UserName,
        U.HoTen AS DisplayName,
        U.UserGroupID,
        U.BranchID,
        U.EmployeeID,
        U.Manager,
        TicketExpiresAtUtc = DATEADD(SECOND, 90, @Now)
    FROM dbo.SY_User U
    WHERE U.UserName = @UserName;
END;
GO

CREATE OR ALTER PROCEDURE dbo.API_TelegramAuthTicket_Verify_AI
    @Ticket VARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @Ticket = LTRIM(RTRIM(COALESCE(@Ticket, '')));
    IF LEN(@Ticket) <> 73
       OR LEFT(@Ticket, 9) <> 'telegram_'
       OR SUBSTRING(@Ticket, 10, 64) LIKE '%[^0-9a-f]%'
    BEGIN
        SELECT AuthStatus = 'AUTH_TOKEN_INVALID', StatusCode = 401;
        RETURN;
    END;

    DECLARE @TicketHash CHAR(64) = LOWER(CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', @Ticket), 2));
    DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @Verified TABLE (TelegramUserID VARCHAR(20), UserName VARCHAR(50));

    BEGIN TRANSACTION;
    UPDATE T WITH (UPDLOCK, HOLDLOCK)
    SET VerifyCount = VerifyCount + 1,
        LastVerifiedAtUtc = @Now
    OUTPUT inserted.TelegramUserID, inserted.UserName INTO @Verified (TelegramUserID, UserName)
    FROM dbo.AI_TelegramAuthTicket T
    JOIN dbo.AI_TelegramAccountLink L
      ON L.TelegramUserID = T.TelegramUserID
     AND L.UserName = T.UserName
     AND L.IsActive = 1
    JOIN dbo.AI_TelegramPilotAllowedAccount A
      ON A.UserName = T.UserName AND A.IsEnabled = 1
    JOIN dbo.SY_User U
      ON U.UserName = T.UserName AND COALESCE(U.Disable, 0) = 0
    WHERE T.TicketHash = @TicketHash
      AND T.ExpiresAtUtc > @Now
      AND T.VerifyCount < 8;
    COMMIT TRANSACTION;

    IF NOT EXISTS (SELECT 1 FROM @Verified)
    BEGIN
        SELECT AuthStatus = 'AUTH_TOKEN_INVALID', StatusCode = 401;
        RETURN;
    END;

    SELECT TOP (1)
        AuthStatus = 'AUTHENTICATED',
        StatusCode = 200,
        U.UserName AS username,
        U.UserName,
        U.HoTen AS DisplayName,
        U.HoTen,
        U.UserGroupID,
        U.UserGroupID AS Role,
        U.BranchID,
        U.EmployeeID,
        U.Manager,
        Disable = CONVERT(INT, COALESCE(U.Disable, 0)),
        Capabilities = 'api.read,orders.draft.write',
        Channel = 'telegram',
        ServerSessionID = 'tg-' + LEFT(LOWER(CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', V.TelegramUserID), 2)), 40),
        TicketExpiresAtUtc = T.ExpiresAtUtc
    FROM @Verified V
    JOIN dbo.SY_User U ON U.UserName = V.UserName
    JOIN dbo.AI_TelegramAuthTicket T ON T.TicketHash = @TicketHash;
END;
GO

CREATE OR ALTER PROCEDURE dbo.API_TelegramPilot_Status_AI
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        AllowedAccounts = (SELECT COUNT_BIG(*) FROM dbo.AI_TelegramPilotAllowedAccount),
        EnabledAccounts = (SELECT COUNT_BIG(*) FROM dbo.AI_TelegramPilotAllowedAccount WHERE IsEnabled = 1),
        ActiveLinks = (SELECT COUNT_BIG(*) FROM dbo.AI_TelegramAccountLink WHERE IsActive = 1),
        LiveTickets = (SELECT COUNT_BIG(*) FROM dbo.AI_TelegramAuthTicket WHERE ExpiresAtUtc > SYSUTCDATETIME());
END;
GO

DENY SELECT, INSERT, UPDATE, DELETE ON dbo.AI_TelegramPilotAllowedAccount TO public;
DENY SELECT, INSERT, UPDATE, DELETE ON dbo.AI_TelegramAccountLink TO public;
DENY SELECT, INSERT, UPDATE, DELETE ON dbo.AI_TelegramAuthTicket TO public;

EXEC dbo.API_TelegramPilot_Status_AI;
