SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID(N'dbo.AI_NotificationPushSubscriptionTbl', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_NotificationPushSubscriptionTbl
    (
        PushSubscriptionID BIGINT IDENTITY(1,1) NOT NULL,
        UserName VARCHAR(100) NOT NULL,
        EndpointHash CHAR(64) NOT NULL,
        SubscriptionCipher VARBINARY(MAX) NOT NULL,
        DeviceLabel NVARCHAR(150) NULL,
        IsActive BIT NOT NULL CONSTRAINT DF_AI_NotificationPush_Active DEFAULT 1,
        CreatedAtUtc DATETIME2(0) NOT NULL CONSTRAINT DF_AI_NotificationPush_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAtUtc DATETIME2(0) NOT NULL CONSTRAINT DF_AI_NotificationPush_UpdatedAt DEFAULT SYSUTCDATETIME(),
        RevokedAtUtc DATETIME2(0) NULL,
        CONSTRAINT PK_AI_NotificationPush PRIMARY KEY (PushSubscriptionID),
        CONSTRAINT UQ_AI_NotificationPush_UserEndpoint UNIQUE (UserName, EndpointHash),
        CONSTRAINT CK_AI_NotificationPush_User CHECK (LEN(LTRIM(RTRIM(UserName))) > 0),
        CONSTRAINT CK_AI_NotificationPush_Hash CHECK (LEN(EndpointHash) = 64)
    );

    CREATE INDEX IX_AI_NotificationPush_ActiveUser
        ON dbo.AI_NotificationPushSubscriptionTbl (IsActive, UserName, UpdatedAtUtc DESC);
END;
GO

IF OBJECT_ID(N'dbo.AI_NotificationPushDeliveryTbl', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_NotificationPushDeliveryTbl
    (
        NotificationID BIGINT NOT NULL,
        PushSubscriptionID BIGINT NOT NULL,
        Status VARCHAR(20) NOT NULL CONSTRAINT DF_AI_NotificationPushDelivery_Status DEFAULT 'PENDING',
        AttemptCount INT NOT NULL CONSTRAINT DF_AI_NotificationPushDelivery_Attempts DEFAULT 0,
        LastAttemptAtUtc DATETIME2(0) NULL,
        DeliveredAtUtc DATETIME2(0) NULL,
        LastStatusCode INT NULL,
        LastError NVARCHAR(500) NULL,
        CONSTRAINT PK_AI_NotificationPushDelivery PRIMARY KEY (NotificationID, PushSubscriptionID),
        CONSTRAINT FK_AI_NotificationPushDelivery_Notification FOREIGN KEY (NotificationID)
            REFERENCES dbo.AI_NotificationTbl(NotificationID) ON DELETE CASCADE,
        CONSTRAINT FK_AI_NotificationPushDelivery_Subscription FOREIGN KEY (PushSubscriptionID)
            REFERENCES dbo.AI_NotificationPushSubscriptionTbl(PushSubscriptionID) ON DELETE CASCADE,
        CONSTRAINT CK_AI_NotificationPushDelivery_Status CHECK (Status IN ('PENDING', 'SENT', 'FAILED', 'REVOKED')),
        CONSTRAINT CK_AI_NotificationPushDelivery_Attempts CHECK (AttemptCount BETWEEN 0 AND 10)
    );
    CREATE INDEX IX_AI_NotificationPushDelivery_Retry
        ON dbo.AI_NotificationPushDeliveryTbl (Status, AttemptCount, LastAttemptAtUtc);
END;
GO

CREATE OR ALTER PROCEDURE dbo.API_ThongBao_Push_AI
    @Username VARCHAR(100),
    @Action VARCHAR(20),
    @EndpointHash CHAR(64),
    @SubscriptionCipher VARCHAR(MAX) = NULL,
    @DeviceLabel NVARCHAR(150) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @Username = LTRIM(RTRIM(COALESCE(@Username, '')));
    SET @Action = UPPER(LTRIM(RTRIM(COALESCE(@Action, ''))));
    SET @EndpointHash = LOWER(LTRIM(RTRIM(COALESCE(@EndpointHash, ''))));

    IF NOT EXISTS (SELECT 1 FROM dbo.SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
        THROW 51301, N'Authenticated account is disabled or not mapped.', 1;
    IF LEN(@EndpointHash) <> 64 OR @EndpointHash LIKE '%[^0-9a-f]%'
        THROW 51340, N'Invalid push endpoint hash.', 1;

    IF @Action = 'SUBSCRIBE'
    BEGIN
        IF @SubscriptionCipher IS NULL OR DATALENGTH(@SubscriptionCipher) = 0
            THROW 51341, N'Encrypted push subscription is required.', 1;

        DECLARE @SubscriptionBytes VARBINARY(MAX);
        BEGIN TRY
            SET @SubscriptionBytes = CAST(N'' AS XML).value(
                'xs:base64Binary(sql:variable("@SubscriptionCipher"))', 'VARBINARY(MAX)'
            );
        END TRY
        BEGIN CATCH
            THROW 51343, N'Encrypted push subscription encoding is invalid.', 1;
        END CATCH;

        MERGE dbo.AI_NotificationPushSubscriptionTbl WITH (HOLDLOCK) AS Target
        USING (SELECT @Username AS UserName, @EndpointHash AS EndpointHash) AS Source
           ON Target.UserName = Source.UserName AND Target.EndpointHash = Source.EndpointHash
        WHEN MATCHED THEN UPDATE SET
            SubscriptionCipher = @SubscriptionBytes, DeviceLabel = @DeviceLabel,
            IsActive = 1, UpdatedAtUtc = SYSUTCDATETIME(), RevokedAtUtc = NULL
        WHEN NOT MATCHED THEN INSERT
            (UserName, EndpointHash, SubscriptionCipher, DeviceLabel)
            VALUES (@Username, @EndpointHash, @SubscriptionBytes, @DeviceLabel);
    END
    ELSE IF @Action = 'UNSUBSCRIBE'
    BEGIN
        UPDATE dbo.AI_NotificationPushSubscriptionTbl
        SET IsActive = 0, UpdatedAtUtc = SYSUTCDATETIME(), RevokedAtUtc = SYSUTCDATETIME()
        WHERE UserName = @Username AND EndpointHash = @EndpointHash;
    END
    ELSE
        THROW 51342, N'Unsupported push subscription action.', 1;

    SELECT PushSubscriptionID, EndpointHash, IsActive, UpdatedAtUtc
    FROM dbo.AI_NotificationPushSubscriptionTbl
    WHERE UserName = @Username AND EndpointHash = @EndpointHash;
END;
GO
