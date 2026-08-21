SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.API_ThongBao_Admin_AI
    @ActorUsername VARCHAR(100),
    @Action VARCHAR(20),
    @NotificationID BIGINT = NULL,
    @Title NVARCHAR(250) = NULL,
    @Summary NVARCHAR(500) = NULL,
    @Body NVARCHAR(MAX) = NULL,
    @NotificationType VARCHAR(30) = 'ANNOUNCEMENT',
    @Priority TINYINT = 50,
    @ActionUrl NVARCHAR(500) = NULL,
    @EffectiveFromUtc DATETIME2(0) = NULL,
    @EffectiveToUtc DATETIME2(0) = NULL,
    @BranchScopeMode VARCHAR(10) = 'ALL',
    @BranchIDs NVARCHAR(MAX) = NULL,
    @UserGroupScopeMode VARCHAR(10) = 'ALL',
    @UserGroupIDs NVARCHAR(MAX) = NULL,
    @UserScopeMode VARCHAR(10) = 'ALL',
    @UserNames NVARCHAR(MAX) = NULL,
    @RequestID VARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @ActorUsername = LTRIM(RTRIM(COALESCE(@ActorUsername, '')));
    SET @Action = UPPER(LTRIM(RTRIM(COALESCE(@Action, ''))));
    SET @NotificationType = UPPER(LTRIM(RTRIM(COALESCE(@NotificationType, 'ANNOUNCEMENT'))));
    SET @BranchScopeMode = UPPER(LTRIM(RTRIM(COALESCE(@BranchScopeMode, 'ALL'))));
    SET @UserGroupScopeMode = UPPER(LTRIM(RTRIM(COALESCE(@UserGroupScopeMode, 'ALL'))));
    SET @UserScopeMode = UPPER(LTRIM(RTRIM(COALESCE(@UserScopeMode, 'ALL'))));

    IF NOT EXISTS
    (
        SELECT 1 FROM dbo.SY_User
        WHERE UserName = @ActorUsername
          AND COALESCE(Disable, 0) = 0
          AND UPPER(COALESCE(UserGroupID, '')) IN ('ADMIN', 'SADM', 'BGD', 'GD')
    )
        THROW 51310, N'Notification administration permission is required.', 1;

    IF @Action NOT IN ('CREATE_DRAFT', 'UPDATE_DRAFT', 'APPROVE', 'WITHDRAW')
        THROW 51311, N'Unsupported notification administration action.', 1;

    IF @Action IN ('APPROVE', 'WITHDRAW')
    BEGIN
        IF @NotificationID IS NULL OR @NotificationID <= 0
            THROW 51302, N'NotificationID is required.', 1;

        BEGIN TRANSACTION;
        IF @Action = 'APPROVE'
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM dbo.AI_NotificationTbl WITH (UPDLOCK, HOLDLOCK)
                           WHERE NotificationID = @NotificationID AND Status = 'DRAFT')
                THROW 51312, N'Only a draft notification can be approved.', 1;

            IF EXISTS
            (
                SELECT 1 FROM dbo.AI_NotificationTbl N
                WHERE N.NotificationID = @NotificationID AND
                (
                    (N.BranchScopeMode = 'SELECTED' AND NOT EXISTS
                        (SELECT 1 FROM dbo.AI_NotificationBranchScopeTbl B WHERE B.NotificationID = N.NotificationID))
                    OR (N.UserGroupScopeMode = 'SELECTED' AND NOT EXISTS
                        (SELECT 1 FROM dbo.AI_NotificationUserGroupScopeTbl G WHERE G.NotificationID = N.NotificationID))
                    OR (N.UserScopeMode = 'SELECTED' AND NOT EXISTS
                        (SELECT 1 FROM dbo.AI_NotificationUserScopeTbl U WHERE U.NotificationID = N.NotificationID))
                )
            )
                THROW 51313, N'A SELECTED notification scope cannot be empty.', 1;

            UPDATE dbo.AI_NotificationTbl
            SET Status = 'APPROVED', ApprovedBy = @ActorUsername, ApprovedAtUtc = SYSUTCDATETIME(),
                UpdatedBy = @ActorUsername, UpdatedAtUtc = SYSUTCDATETIME()
            WHERE NotificationID = @NotificationID;
        END
        ELSE
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM dbo.AI_NotificationTbl WITH (UPDLOCK, HOLDLOCK)
                           WHERE NotificationID = @NotificationID AND Status = 'APPROVED')
                THROW 51314, N'Only an approved notification can be withdrawn.', 1;
            UPDATE dbo.AI_NotificationTbl
            SET Status = 'WITHDRAWN', WithdrawnBy = @ActorUsername, WithdrawnAtUtc = SYSUTCDATETIME(),
                UpdatedBy = @ActorUsername, UpdatedAtUtc = SYSUTCDATETIME()
            WHERE NotificationID = @NotificationID;
        END;

        INSERT dbo.AI_NotificationAuditLogTbl
            (NotificationID, EventType, ActorUserName, RequestID, ContentVersion)
        SELECT NotificationID, CASE WHEN @Action = 'APPROVE' THEN 'APPROVE' ELSE 'WITHDRAW' END,
               @ActorUsername, @RequestID, ContentVersion
        FROM dbo.AI_NotificationTbl WHERE NotificationID = @NotificationID;
        COMMIT TRANSACTION;

        SELECT NotificationID, Status, ContentVersion, UpdatedAtUtc
        FROM dbo.AI_NotificationTbl WHERE NotificationID = @NotificationID;
        RETURN;
    END;

    SET @Title = LTRIM(RTRIM(COALESCE(@Title, N'')));
    SET @Body = LTRIM(RTRIM(COALESCE(@Body, N'')));
    SET @EffectiveFromUtc = COALESCE(@EffectiveFromUtc, SYSUTCDATETIME());
    IF @Title = N'' OR @Body = N'' THROW 51315, N'Title and Body are required.', 1;
    IF @NotificationType NOT IN ('ANNOUNCEMENT', 'POLICY', 'URGENT', 'SYSTEM')
        THROW 51316, N'Invalid notification type.', 1;
    IF @Priority NOT BETWEEN 1 AND 100 THROW 51317, N'Priority must be between 1 and 100.', 1;
    IF @EffectiveToUtc IS NOT NULL AND @EffectiveToUtc <= @EffectiveFromUtc
        THROW 51318, N'EffectiveToUtc must be later than EffectiveFromUtc.', 1;
    IF @BranchScopeMode NOT IN ('ALL', 'SELECTED') OR @UserGroupScopeMode NOT IN ('ALL', 'SELECTED')
       OR @UserScopeMode NOT IN ('ALL', 'SELECTED')
        THROW 51319, N'Invalid notification scope mode.', 1;

    BEGIN TRANSACTION;
    IF @Action = 'CREATE_DRAFT'
    BEGIN
        INSERT dbo.AI_NotificationTbl
            (Title, Summary, Body, NotificationType, Priority, ActionUrl, EffectiveFromUtc, EffectiveToUtc,
             BranchScopeMode, UserGroupScopeMode, UserScopeMode, Status, CreatedBy, UpdatedBy)
        VALUES
            (@Title, NULLIF(LTRIM(RTRIM(@Summary)), N''), @Body, @NotificationType, @Priority,
             NULLIF(LTRIM(RTRIM(@ActionUrl)), N''), @EffectiveFromUtc, @EffectiveToUtc,
             @BranchScopeMode, @UserGroupScopeMode, @UserScopeMode, 'DRAFT', @ActorUsername, @ActorUsername);
        SET @NotificationID = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        IF @NotificationID IS NULL OR @NotificationID <= 0 THROW 51302, N'NotificationID is required.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.AI_NotificationTbl WITH (UPDLOCK, HOLDLOCK)
                       WHERE NotificationID = @NotificationID AND Status = 'DRAFT')
            THROW 51312, N'Only a draft notification can be updated.', 1;
        UPDATE dbo.AI_NotificationTbl
        SET Title = @Title, Summary = NULLIF(LTRIM(RTRIM(@Summary)), N''), Body = @Body,
            NotificationType = @NotificationType, Priority = @Priority,
            ActionUrl = NULLIF(LTRIM(RTRIM(@ActionUrl)), N''), EffectiveFromUtc = @EffectiveFromUtc,
            EffectiveToUtc = @EffectiveToUtc, BranchScopeMode = @BranchScopeMode,
            UserGroupScopeMode = @UserGroupScopeMode, UserScopeMode = @UserScopeMode,
            ContentVersion = ContentVersion + 1, UpdatedBy = @ActorUsername, UpdatedAtUtc = SYSUTCDATETIME()
        WHERE NotificationID = @NotificationID;
        DELETE dbo.AI_NotificationBranchScopeTbl WHERE NotificationID = @NotificationID;
        DELETE dbo.AI_NotificationUserGroupScopeTbl WHERE NotificationID = @NotificationID;
        DELETE dbo.AI_NotificationUserScopeTbl WHERE NotificationID = @NotificationID;
    END;

    IF @BranchScopeMode = 'SELECTED'
        INSERT dbo.AI_NotificationBranchScopeTbl (NotificationID, BranchID)
        SELECT @NotificationID, Value FROM
            (SELECT DISTINCT LTRIM(RTRIM(value)) AS Value FROM STRING_SPLIT(COALESCE(@BranchIDs, ''), ',')) S
        WHERE Value <> '';
    IF @UserGroupScopeMode = 'SELECTED'
        INSERT dbo.AI_NotificationUserGroupScopeTbl (NotificationID, UserGroupID)
        SELECT @NotificationID, Value FROM
            (SELECT DISTINCT LTRIM(RTRIM(value)) AS Value FROM STRING_SPLIT(COALESCE(@UserGroupIDs, ''), ',')) S
        WHERE Value <> '';
    IF @UserScopeMode = 'SELECTED'
        INSERT dbo.AI_NotificationUserScopeTbl (NotificationID, UserName)
        SELECT @NotificationID, Value FROM
            (SELECT DISTINCT LTRIM(RTRIM(value)) AS Value FROM STRING_SPLIT(COALESCE(@UserNames, ''), ',')) S
        WHERE Value <> '';

    INSERT dbo.AI_NotificationAuditLogTbl
        (NotificationID, EventType, ActorUserName, RequestID, ContentVersion)
    SELECT NotificationID, CASE WHEN @Action = 'CREATE_DRAFT' THEN 'CREATE' ELSE 'UPDATE' END,
           @ActorUsername, @RequestID, ContentVersion
    FROM dbo.AI_NotificationTbl WHERE NotificationID = @NotificationID;
    COMMIT TRANSACTION;

    SELECT NotificationID, Status, ContentVersion, UpdatedAtUtc
    FROM dbo.AI_NotificationTbl WHERE NotificationID = @NotificationID;
END;
GO
