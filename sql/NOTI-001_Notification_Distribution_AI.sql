SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER FUNCTION dbo.AI_ActiveNotificationByUserFnc
(
    @Username VARCHAR(100),
    @AsOfUtc DATETIME2(0)
)
RETURNS TABLE
AS
RETURN
(
    WITH UserContext AS
    (
        SELECT
            U.UserName,
            COALESCE(U.BranchID, '') AS BranchID,
            COALESCE(U.UserGroupID, '') AS UserGroupID
        FROM dbo.SY_User U
        WHERE U.UserName = LTRIM(RTRIM(COALESCE(@Username, '')))
          AND COALESCE(U.Disable, 0) = 0
    )
    SELECT
        N.NotificationID,
        N.Title,
        N.Summary,
        N.Body,
        N.NotificationType,
        N.Priority,
        N.ActionUrl,
        N.EffectiveFromUtc,
        N.EffectiveToUtc,
        N.ContentVersion,
        CAST(CASE WHEN R.NotificationID IS NULL THEN 0 ELSE 1 END AS BIT) AS IsView,
        R.ReadAtUtc
    FROM dbo.AI_NotificationTbl N
    CROSS JOIN UserContext U
    LEFT JOIN dbo.AI_NotificationReadLogTbl R
      ON R.NotificationID = N.NotificationID
     AND R.UserName = U.UserName
    WHERE N.Status = 'APPROVED'
      AND N.EffectiveFromUtc <= COALESCE(@AsOfUtc, SYSUTCDATETIME())
      AND (N.EffectiveToUtc IS NULL OR N.EffectiveToUtc > COALESCE(@AsOfUtc, SYSUTCDATETIME()))
      AND
      (
          N.BranchScopeMode = 'ALL'
          OR
          (
              N.BranchScopeMode = 'SELECTED'
              AND U.BranchID <> ''
              AND EXISTS
              (
                  SELECT 1
                  FROM dbo.AI_NotificationBranchScopeTbl B
                  WHERE B.NotificationID = N.NotificationID
                    AND B.BranchID = U.BranchID
              )
          )
      )
      AND
      (
          N.UserGroupScopeMode = 'ALL'
          OR
          (
              N.UserGroupScopeMode = 'SELECTED'
              AND U.UserGroupID <> ''
              AND EXISTS
              (
                  SELECT 1
                  FROM dbo.AI_NotificationUserGroupScopeTbl G
                  WHERE G.NotificationID = N.NotificationID
                    AND G.UserGroupID = U.UserGroupID
              )
          )
      )
      AND
      (
          N.UserScopeMode = 'ALL'
          OR
          (
              N.UserScopeMode = 'SELECTED'
              AND EXISTS
              (
                  SELECT 1
                  FROM dbo.AI_NotificationUserScopeTbl S
                  WHERE S.NotificationID = N.NotificationID
                    AND S.UserName = U.UserName
              )
          )
      )
);
GO

CREATE OR ALTER PROCEDURE dbo.API_ThongBao_UnreadCount_AI
    @Username VARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;

    SET @Username = LTRIM(RTRIM(COALESCE(@Username, '')));
    IF @Username = ''
        THROW 51300, N'Authentication identity is required.', 1;

    IF NOT EXISTS
    (
        SELECT 1 FROM dbo.SY_User
        WHERE UserName = @Username AND COALESCE(Disable, 0) = 0
    )
        THROW 51301, N'Authenticated account is disabled or not mapped.', 1;

    SELECT COUNT_BIG(1) AS UnreadCount
    FROM dbo.AI_ActiveNotificationByUserFnc(@Username, SYSUTCDATETIME())
    WHERE IsView = 0;
END;
GO

CREATE OR ALTER PROCEDURE dbo.API_ThongBao_AI
    @Username VARCHAR(100),
    @Action VARCHAR(20) = 'LIST',
    @NotificationID BIGINT = NULL,
    @Page INT = 1,
    @PageSize INT = 20,
    @UnreadOnly BIT = 0,
    @RequestID VARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @Username = LTRIM(RTRIM(COALESCE(@Username, '')));
    SET @Action = UPPER(LTRIM(RTRIM(COALESCE(@Action, 'LIST'))));

    IF @Username = ''
        THROW 51300, N'Authentication identity is required.', 1;

    IF NOT EXISTS
    (
        SELECT 1 FROM dbo.SY_User
        WHERE UserName = @Username AND COALESCE(Disable, 0) = 0
    )
        THROW 51301, N'Authenticated account is disabled or not mapped.', 1;

    IF @Action = 'UNREAD_COUNT'
    BEGIN
        EXEC dbo.API_ThongBao_UnreadCount_AI @Username = @Username;
        RETURN;
    END;

    IF @Action = 'DETAIL'
    BEGIN
        IF @NotificationID IS NULL OR @NotificationID <= 0
            THROW 51302, N'NotificationID is required.', 1;

        SELECT
            NotificationID, Title, Summary, Body, NotificationType, Priority,
            ActionUrl, EffectiveFromUtc, EffectiveToUtc, ContentVersion, IsView, ReadAtUtc
        FROM dbo.AI_ActiveNotificationByUserFnc(@Username, SYSUTCDATETIME())
        WHERE NotificationID = @NotificationID;
        RETURN;
    END;

    IF @Action = 'MARK_READ'
    BEGIN
        IF @NotificationID IS NULL OR @NotificationID <= 0
            THROW 51302, N'NotificationID is required.', 1;

        IF NOT EXISTS
        (
            SELECT 1
            FROM dbo.AI_ActiveNotificationByUserFnc(@Username, SYSUTCDATETIME())
            WHERE NotificationID = @NotificationID
        )
            THROW 51303, N'Notification not found.', 1;

        BEGIN TRANSACTION;

        IF NOT EXISTS
        (
            SELECT 1
            FROM dbo.AI_NotificationReadLogTbl WITH (UPDLOCK, HOLDLOCK)
            WHERE NotificationID = @NotificationID AND UserName = @Username
        )
        BEGIN
            INSERT INTO dbo.AI_NotificationReadLogTbl
                (NotificationID, UserName, ReadAtUtc, FirstRequestID, LastRequestID)
            VALUES
                (@NotificationID, @Username, SYSUTCDATETIME(), @RequestID, @RequestID);

            INSERT INTO dbo.AI_NotificationAuditLogTbl
                (NotificationID, EventType, ActorUserName, RequestID, ContentVersion)
            SELECT NotificationID, 'MARK_READ', @Username, @RequestID, ContentVersion
            FROM dbo.AI_NotificationTbl
            WHERE NotificationID = @NotificationID;
        END
        ELSE IF @RequestID IS NOT NULL
        BEGIN
            UPDATE dbo.AI_NotificationReadLogTbl
            SET LastRequestID = @RequestID
            WHERE NotificationID = @NotificationID AND UserName = @Username;
        END;

        COMMIT TRANSACTION;

        SELECT NotificationID, CAST(1 AS BIT) AS IsView, ReadAtUtc
        FROM dbo.AI_NotificationReadLogTbl
        WHERE NotificationID = @NotificationID AND UserName = @Username;
        RETURN;
    END;

    IF @Action <> 'LIST'
        THROW 51304, N'Unsupported notification action.', 1;

    SET @Page = CASE WHEN @Page BETWEEN 1 AND 100000 THEN @Page ELSE 1 END;
    SET @PageSize = CASE WHEN @PageSize BETWEEN 1 AND 100 THEN @PageSize ELSE 20 END;

    SELECT
        NotificationID, Title, Summary, Body, NotificationType, Priority,
        ActionUrl, EffectiveFromUtc, EffectiveToUtc, ContentVersion, IsView, ReadAtUtc,
        COUNT_BIG(1) OVER () AS TotalCount,
        SUM(CASE WHEN IsView = 0 THEN CONVERT(BIGINT, 1) ELSE CONVERT(BIGINT, 0) END) OVER () AS UnreadCount
    FROM dbo.AI_ActiveNotificationByUserFnc(@Username, SYSUTCDATETIME())
    WHERE @UnreadOnly = 0 OR IsView = 0
    ORDER BY Priority ASC, EffectiveFromUtc DESC, NotificationID DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
