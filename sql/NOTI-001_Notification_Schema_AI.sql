SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.AI_NotificationTbl', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_NotificationTbl
    (
        NotificationID BIGINT IDENTITY(1,1) NOT NULL,
        Title NVARCHAR(250) NOT NULL,
        Summary NVARCHAR(500) NULL,
        Body NVARCHAR(MAX) NOT NULL,
        NotificationType VARCHAR(30) NOT NULL CONSTRAINT DF_AI_Notification_Type DEFAULT 'ANNOUNCEMENT',
        Priority TINYINT NOT NULL CONSTRAINT DF_AI_Notification_Priority DEFAULT 50,
        ActionUrl NVARCHAR(500) NULL,
        EffectiveFromUtc DATETIME2(0) NOT NULL,
        EffectiveToUtc DATETIME2(0) NULL,
        BranchScopeMode VARCHAR(10) NOT NULL CONSTRAINT DF_AI_Notification_BranchScope DEFAULT 'ALL',
        UserGroupScopeMode VARCHAR(10) NOT NULL CONSTRAINT DF_AI_Notification_UserGroupScope DEFAULT 'ALL',
        UserScopeMode VARCHAR(10) NOT NULL CONSTRAINT DF_AI_Notification_UserScope DEFAULT 'ALL',
        Status VARCHAR(15) NOT NULL CONSTRAINT DF_AI_Notification_Status DEFAULT 'DRAFT',
        ContentVersion INT NOT NULL CONSTRAINT DF_AI_Notification_Version DEFAULT 1,
        CreatedBy VARCHAR(100) NOT NULL,
        CreatedAtUtc DATETIME2(0) NOT NULL CONSTRAINT DF_AI_Notification_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedBy VARCHAR(100) NOT NULL,
        UpdatedAtUtc DATETIME2(0) NOT NULL CONSTRAINT DF_AI_Notification_UpdatedAt DEFAULT SYSUTCDATETIME(),
        ApprovedBy VARCHAR(100) NULL,
        ApprovedAtUtc DATETIME2(0) NULL,
        WithdrawnBy VARCHAR(100) NULL,
        WithdrawnAtUtc DATETIME2(0) NULL,
        CONSTRAINT PK_AI_Notification PRIMARY KEY (NotificationID),
        CONSTRAINT CK_AI_Notification_Title CHECK (LEN(LTRIM(RTRIM(Title))) > 0),
        CONSTRAINT CK_AI_Notification_Body CHECK (LEN(LTRIM(RTRIM(Body))) > 0),
        CONSTRAINT CK_AI_Notification_Type CHECK (NotificationType IN ('ANNOUNCEMENT', 'POLICY', 'URGENT', 'SYSTEM')),
        CONSTRAINT CK_AI_Notification_Priority CHECK (Priority BETWEEN 1 AND 100),
        CONSTRAINT CK_AI_Notification_EffectiveRange CHECK (EffectiveToUtc IS NULL OR EffectiveToUtc > EffectiveFromUtc),
        CONSTRAINT CK_AI_Notification_BranchScope CHECK (BranchScopeMode IN ('ALL', 'SELECTED')),
        CONSTRAINT CK_AI_Notification_UserGroupScope CHECK (UserGroupScopeMode IN ('ALL', 'SELECTED')),
        CONSTRAINT CK_AI_Notification_UserScope CHECK (UserScopeMode IN ('ALL', 'SELECTED')),
        CONSTRAINT CK_AI_Notification_Status CHECK (Status IN ('DRAFT', 'APPROVED', 'WITHDRAWN')),
        CONSTRAINT CK_AI_Notification_Version CHECK (ContentVersion > 0),
        CONSTRAINT CK_AI_Notification_ActionUrl CHECK
        (
            ActionUrl IS NULL
            OR (LEFT(LTRIM(ActionUrl), 1) = '/' AND LEFT(LTRIM(ActionUrl), 2) <> '//')
        ),
        CONSTRAINT CK_AI_Notification_Approval CHECK
        (
            Status <> 'APPROVED'
            OR (ApprovedBy IS NOT NULL AND LEN(LTRIM(RTRIM(ApprovedBy))) > 0 AND ApprovedAtUtc IS NOT NULL)
        ),
        CONSTRAINT CK_AI_Notification_Withdrawal CHECK
        (
            Status <> 'WITHDRAWN'
            OR (WithdrawnBy IS NOT NULL AND LEN(LTRIM(RTRIM(WithdrawnBy))) > 0 AND WithdrawnAtUtc IS NOT NULL)
        )
    );

    CREATE INDEX IX_AI_Notification_Active
        ON dbo.AI_NotificationTbl (Status, EffectiveFromUtc, EffectiveToUtc, Priority, NotificationID DESC);
END;
GO

IF OBJECT_ID(N'dbo.AI_NotificationBranchScopeTbl', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_NotificationBranchScopeTbl
    (
        NotificationID BIGINT NOT NULL,
        BranchID VARCHAR(50) NOT NULL,
        CreatedAtUtc DATETIME2(0) NOT NULL CONSTRAINT DF_AI_NotificationBranchScope_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_AI_NotificationBranchScope PRIMARY KEY (NotificationID, BranchID),
        CONSTRAINT FK_AI_NotificationBranchScope_Notification FOREIGN KEY (NotificationID)
            REFERENCES dbo.AI_NotificationTbl(NotificationID) ON DELETE CASCADE,
        CONSTRAINT CK_AI_NotificationBranchScope_Branch CHECK (LEN(LTRIM(RTRIM(BranchID))) > 0)
    );
END;
GO

IF OBJECT_ID(N'dbo.AI_NotificationUserGroupScopeTbl', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_NotificationUserGroupScopeTbl
    (
        NotificationID BIGINT NOT NULL,
        UserGroupID VARCHAR(50) NOT NULL,
        CreatedAtUtc DATETIME2(0) NOT NULL CONSTRAINT DF_AI_NotificationUserGroupScope_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_AI_NotificationUserGroupScope PRIMARY KEY (NotificationID, UserGroupID),
        CONSTRAINT FK_AI_NotificationUserGroupScope_Notification FOREIGN KEY (NotificationID)
            REFERENCES dbo.AI_NotificationTbl(NotificationID) ON DELETE CASCADE,
        CONSTRAINT CK_AI_NotificationUserGroupScope_Group CHECK (LEN(LTRIM(RTRIM(UserGroupID))) > 0)
    );
END;
GO

IF OBJECT_ID(N'dbo.AI_NotificationUserScopeTbl', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_NotificationUserScopeTbl
    (
        NotificationID BIGINT NOT NULL,
        UserName VARCHAR(100) NOT NULL,
        CreatedAtUtc DATETIME2(0) NOT NULL CONSTRAINT DF_AI_NotificationUserScope_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_AI_NotificationUserScope PRIMARY KEY (NotificationID, UserName),
        CONSTRAINT FK_AI_NotificationUserScope_Notification FOREIGN KEY (NotificationID)
            REFERENCES dbo.AI_NotificationTbl(NotificationID) ON DELETE CASCADE,
        CONSTRAINT CK_AI_NotificationUserScope_User CHECK (LEN(LTRIM(RTRIM(UserName))) > 0)
    );
END;
GO

IF OBJECT_ID(N'dbo.AI_NotificationReadLogTbl', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_NotificationReadLogTbl
    (
        NotificationID BIGINT NOT NULL,
        UserName VARCHAR(100) NOT NULL,
        ReadAtUtc DATETIME2(0) NOT NULL CONSTRAINT DF_AI_NotificationReadLog_ReadAt DEFAULT SYSUTCDATETIME(),
        FirstRequestID VARCHAR(100) NULL,
        LastRequestID VARCHAR(100) NULL,
        CONSTRAINT PK_AI_NotificationReadLog PRIMARY KEY (NotificationID, UserName),
        CONSTRAINT FK_AI_NotificationReadLog_Notification FOREIGN KEY (NotificationID)
            REFERENCES dbo.AI_NotificationTbl(NotificationID) ON DELETE CASCADE,
        CONSTRAINT CK_AI_NotificationReadLog_User CHECK (LEN(LTRIM(RTRIM(UserName))) > 0)
    );

    CREATE INDEX IX_AI_NotificationReadLog_User
        ON dbo.AI_NotificationReadLogTbl (UserName, ReadAtUtc DESC, NotificationID);
END;
GO

IF OBJECT_ID(N'dbo.AI_NotificationAuditLogTbl', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_NotificationAuditLogTbl
    (
        NotificationAuditID BIGINT IDENTITY(1,1) NOT NULL,
        NotificationID BIGINT NULL,
        EventType VARCHAR(30) NOT NULL,
        ActorUserName VARCHAR(100) NOT NULL,
        RequestID VARCHAR(100) NULL,
        ContentVersion INT NULL,
        EventDataJson NVARCHAR(2000) NULL,
        CreatedAtUtc DATETIME2(0) NOT NULL CONSTRAINT DF_AI_NotificationAudit_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_AI_NotificationAudit PRIMARY KEY (NotificationAuditID),
        CONSTRAINT FK_AI_NotificationAudit_Notification FOREIGN KEY (NotificationID)
            REFERENCES dbo.AI_NotificationTbl(NotificationID),
        CONSTRAINT CK_AI_NotificationAudit_Event CHECK (EventType IN ('CREATE', 'UPDATE', 'APPROVE', 'WITHDRAW', 'MARK_READ')),
        CONSTRAINT CK_AI_NotificationAudit_Actor CHECK (LEN(LTRIM(RTRIM(ActorUserName))) > 0),
        CONSTRAINT CK_AI_NotificationAudit_Json CHECK (EventDataJson IS NULL OR ISJSON(EventDataJson) = 1)
    );

    CREATE INDEX IX_AI_NotificationAudit_Notification
        ON dbo.AI_NotificationAuditLogTbl (NotificationID, CreatedAtUtc DESC);
END;
GO
