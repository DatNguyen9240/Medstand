/*
  TELEGRAM-NOTIFICATION-001
  Reliable Telegram delivery for approved, active Medstand notifications.
  Delivery never changes the user's read/unread state.
*/
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID(N'dbo.AI_TelegramNotificationDelivery', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_TelegramNotificationDelivery
    (
        NotificationID BIGINT NOT NULL,
        TelegramUserID VARCHAR(20) NOT NULL,
        ContentVersion INT NOT NULL,
        UserName VARCHAR(100) NOT NULL,
        Status VARCHAR(20) NOT NULL CONSTRAINT DF_AI_TelegramNotificationDelivery_Status DEFAULT 'PENDING',
        AttemptCount TINYINT NOT NULL CONSTRAINT DF_AI_TelegramNotificationDelivery_Attempt DEFAULT 0,
        FirstQueuedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_AI_TelegramNotificationDelivery_Queued DEFAULT SYSUTCDATETIME(),
        ClaimedAtUtc DATETIME2(3) NULL,
        LastAttemptAtUtc DATETIME2(3) NULL,
        DeliveredAtUtc DATETIME2(3) NULL,
        TelegramMessageID VARCHAR(50) NULL,
        LastError NVARCHAR(500) NULL,
        CONSTRAINT PK_AI_TelegramNotificationDelivery PRIMARY KEY (NotificationID,TelegramUserID,ContentVersion),
        CONSTRAINT FK_AI_TelegramNotificationDelivery_Notification FOREIGN KEY (NotificationID)
            REFERENCES dbo.AI_NotificationTbl(NotificationID) ON DELETE CASCADE,
        CONSTRAINT CK_AI_TelegramNotificationDelivery_UserID CHECK
            (LEN(TelegramUserID) BETWEEN 1 AND 20 AND TelegramUserID NOT LIKE '%[^0-9]%'),
        CONSTRAINT CK_AI_TelegramNotificationDelivery_Version CHECK (ContentVersion>0),
        CONSTRAINT CK_AI_TelegramNotificationDelivery_Status CHECK
            (Status IN ('PENDING','PROCESSING','SENT','FAILED')),
        CONSTRAINT CK_AI_TelegramNotificationDelivery_Attempt CHECK (AttemptCount BETWEEN 0 AND 3)
    );

    CREATE INDEX IX_AI_TelegramNotificationDelivery_Dispatch
        ON dbo.AI_TelegramNotificationDelivery (Status,AttemptCount,LastAttemptAtUtc,FirstQueuedAtUtc);
END;
GO

CREATE OR ALTER PROCEDURE dbo.API_TelegramNotification_Claim_AI
    @BatchSize INT=20
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    SET @BatchSize=CASE WHEN @BatchSize BETWEEN 1 AND 50 THEN @BatchSize ELSE 20 END;

    DECLARE @Now DATETIME2(3)=SYSUTCDATETIME();
    DECLARE @Claimed TABLE
    (
        NotificationID BIGINT,
        TelegramUserID VARCHAR(20),
        ContentVersion INT,
        UserName VARCHAR(100)
    );

    BEGIN TRANSACTION;

    /* Queue only active Telegram links and notifications already authorized for that user. */
    INSERT dbo.AI_TelegramNotificationDelivery
        (NotificationID,TelegramUserID,ContentVersion,UserName)
    SELECT N.NotificationID,L.TelegramUserID,N.ContentVersion,L.UserName
    FROM dbo.AI_TelegramAccountLink L
    JOIN dbo.AI_TelegramPilotAllowedAccount A
      ON A.UserName=L.UserName AND A.IsEnabled=1
    JOIN dbo.SY_User U
      ON U.UserName=L.UserName AND COALESCE(U.Disable,0)=0
    CROSS APPLY dbo.AI_ActiveNotificationByUserFnc(L.UserName,@Now) N
    WHERE L.IsActive=1
      AND L.TelegramChatID=L.TelegramUserID
      AND N.IsView=0
      AND NOT EXISTS
      (
          SELECT 1 FROM dbo.AI_TelegramNotificationDelivery D WITH (UPDLOCK,HOLDLOCK)
          WHERE D.NotificationID=N.NotificationID
            AND D.TelegramUserID=L.TelegramUserID
            AND D.ContentVersion=N.ContentVersion
      );

    /* A crashed workflow releases its claim automatically after five minutes. */
    UPDATE dbo.AI_TelegramNotificationDelivery
       SET Status='FAILED',LastError=N'Phiên gửi trước bị gián đoạn; hệ thống sẽ thử lại.'
     WHERE Status='PROCESSING' AND ClaimedAtUtc<DATEADD(MINUTE,-5,@Now) AND AttemptCount<3;

    ;WITH Candidate AS
    (
        SELECT TOP (@BatchSize) D.*
        FROM dbo.AI_TelegramNotificationDelivery D WITH (UPDLOCK,READPAST,ROWLOCK)
        JOIN dbo.AI_TelegramAccountLink L
          ON L.TelegramUserID=D.TelegramUserID AND L.UserName=D.UserName AND L.IsActive=1
        JOIN dbo.AI_TelegramPilotAllowedAccount A
          ON A.UserName=D.UserName AND A.IsEnabled=1
        WHERE D.Status IN ('PENDING','FAILED')
          AND D.AttemptCount<3
          AND (D.LastAttemptAtUtc IS NULL OR D.LastAttemptAtUtc<DATEADD(MINUTE,-1,@Now))
          AND EXISTS
          (
              SELECT 1 FROM dbo.AI_ActiveNotificationByUserFnc(D.UserName,@Now) N
              WHERE N.NotificationID=D.NotificationID
                AND N.ContentVersion=D.ContentVersion
                AND N.IsView=0
          )
        ORDER BY D.FirstQueuedAtUtc,D.NotificationID,D.TelegramUserID
    )
    UPDATE Candidate
       SET Status='PROCESSING',AttemptCount=AttemptCount+1,
           ClaimedAtUtc=@Now,LastAttemptAtUtc=@Now,LastError=NULL
    OUTPUT inserted.NotificationID,inserted.TelegramUserID,
           inserted.ContentVersion,inserted.UserName
      INTO @Claimed(NotificationID,TelegramUserID,ContentVersion,UserName);

    COMMIT TRANSACTION;

    SELECT C.NotificationID,C.TelegramUserID,C.ContentVersion,C.UserName,
           N.Title,N.Summary,N.Body,N.NotificationType,N.Priority,N.ActionUrl,
           D.AttemptCount
    FROM @Claimed C
    JOIN dbo.AI_NotificationTbl N ON N.NotificationID=C.NotificationID
    JOIN dbo.AI_TelegramNotificationDelivery D
      ON D.NotificationID=C.NotificationID
     AND D.TelegramUserID=C.TelegramUserID
     AND D.ContentVersion=C.ContentVersion
    ORDER BY N.Priority,N.EffectiveFromUtc,C.NotificationID;
END;
GO

CREATE OR ALTER PROCEDURE dbo.API_TelegramNotification_Complete_AI
    @NotificationID BIGINT,
    @TelegramUserID VARCHAR(20),
    @ContentVersion INT,
    @Succeeded BIT,
    @TelegramMessageID VARCHAR(50)=NULL,
    @LastError NVARCHAR(500)=NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    UPDATE dbo.AI_TelegramNotificationDelivery
       SET Status=CASE WHEN @Succeeded=1 THEN 'SENT' ELSE 'FAILED' END,
           DeliveredAtUtc=CASE WHEN @Succeeded=1 THEN SYSUTCDATETIME() ELSE NULL END,
           TelegramMessageID=CASE WHEN @Succeeded=1 THEN NULLIF(LEFT(@TelegramMessageID,50),'') ELSE NULL END,
           LastError=CASE WHEN @Succeeded=1 THEN NULL ELSE LEFT(COALESCE(NULLIF(@LastError,N''),N'Gửi Telegram thất bại.'),500) END
     WHERE NotificationID=@NotificationID
       AND TelegramUserID=@TelegramUserID
       AND ContentVersion=@ContentVersion
       AND Status='PROCESSING';

    SELECT UpdatedRows=@@ROWCOUNT,
           DeliveryStatus=CASE WHEN @Succeeded=1 THEN 'SENT' ELSE 'FAILED' END;
END;
GO

CREATE OR ALTER PROCEDURE dbo.API_TelegramNotification_Status_AI
    @NotificationID BIGINT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT NotificationID=@NotificationID,
           TotalDeliveries=COUNT_BIG(*),
           PendingCount=SUM(CASE WHEN Status='PENDING' THEN CONVERT(BIGINT,1) ELSE 0 END),
           ProcessingCount=SUM(CASE WHEN Status='PROCESSING' THEN CONVERT(BIGINT,1) ELSE 0 END),
           SentCount=SUM(CASE WHEN Status='SENT' THEN CONVERT(BIGINT,1) ELSE 0 END),
           FailedCount=SUM(CASE WHEN Status='FAILED' THEN CONVERT(BIGINT,1) ELSE 0 END)
    FROM dbo.AI_TelegramNotificationDelivery
    WHERE NotificationID=@NotificationID;
END;
GO

DENY SELECT,INSERT,UPDATE,DELETE ON dbo.AI_TelegramNotificationDelivery TO public;

SELECT Migration='TELEGRAM-NOTIFICATION-001',Status='READY';
GO
