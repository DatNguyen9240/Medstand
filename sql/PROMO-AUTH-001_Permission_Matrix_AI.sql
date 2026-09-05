SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID(N'dbo.AI_PromotionPermissionTbl', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AI_PromotionPermissionTbl
    (
        PromotionPermissionID BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AI_PromotionPermission PRIMARY KEY,
        PrincipalType VARCHAR(20) NOT NULL,
        PrincipalValue VARCHAR(50) NOT NULL,
        ActionCode VARCHAR(20) NOT NULL,
        ScopeMode VARCHAR(20) NOT NULL,
        IsAllowed BIT NOT NULL CONSTRAINT DF_AI_PromotionPermission_IsAllowed DEFAULT 1,
        IsActive BIT NOT NULL CONSTRAINT DF_AI_PromotionPermission_IsActive DEFAULT 1,
        UpdatedBy VARCHAR(50) NOT NULL,
        UpdatedAtUtc DATETIME2(0) NOT NULL CONSTRAINT DF_AI_PromotionPermission_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_AI_PromotionPermission UNIQUE (PrincipalType, PrincipalValue, ActionCode),
        CONSTRAINT CK_AI_PromotionPermission_Principal CHECK (PrincipalType IN ('USER','USER_GROUP','MANAGER_FLAG')),
        CONSTRAINT CK_AI_PromotionPermission_Action CHECK (ActionCode IN ('VIEW','CREATE','EDIT','APPROVE','REJECT','WITHDRAW','HISTORY')),
        CONSTRAINT CK_AI_PromotionPermission_Scope CHECK (ScopeMode IN ('OWN_BRANCH','ALL'))
    );
END;
GO

/* Mặc định an toàn: QL khai báo trong chi nhánh; nhóm toàn cục duyệt/thu hồi. */
MERGE dbo.AI_PromotionPermissionTbl AS T
USING
(
    SELECT PrincipalType, PrincipalValue, ActionCode, ScopeMode
    FROM (VALUES
        ('MANAGER_FLAG','1','VIEW','OWN_BRANCH'),
        ('MANAGER_FLAG','1','CREATE','OWN_BRANCH'),
        ('MANAGER_FLAG','1','EDIT','OWN_BRANCH'),
        ('MANAGER_FLAG','1','HISTORY','OWN_BRANCH'),
        ('USER_GROUP','QL','VIEW','OWN_BRANCH'),
        ('USER_GROUP','QL','CREATE','OWN_BRANCH'),
        ('USER_GROUP','QL','EDIT','OWN_BRANCH'),
        ('USER_GROUP','QL','HISTORY','OWN_BRANCH'),
        ('USER_GROUP','QLMN','VIEW','OWN_BRANCH'),
        ('USER_GROUP','QLMN','CREATE','OWN_BRANCH'),
        ('USER_GROUP','QLMN','EDIT','OWN_BRANCH'),
        ('USER_GROUP','QLMN','HISTORY','OWN_BRANCH'),
        ('USER_GROUP','ADMIN','VIEW','ALL'), ('USER_GROUP','ADMIN','CREATE','ALL'), ('USER_GROUP','ADMIN','EDIT','ALL'),
        ('USER_GROUP','ADMIN','APPROVE','ALL'), ('USER_GROUP','ADMIN','REJECT','ALL'), ('USER_GROUP','ADMIN','WITHDRAW','ALL'), ('USER_GROUP','ADMIN','HISTORY','ALL'),
        ('USER_GROUP','SADM','VIEW','ALL'), ('USER_GROUP','SADM','CREATE','ALL'), ('USER_GROUP','SADM','EDIT','ALL'),
        ('USER_GROUP','SADM','APPROVE','ALL'), ('USER_GROUP','SADM','REJECT','ALL'), ('USER_GROUP','SADM','WITHDRAW','ALL'), ('USER_GROUP','SADM','HISTORY','ALL'),
        ('USER_GROUP','BGD','VIEW','ALL'), ('USER_GROUP','BGD','CREATE','ALL'), ('USER_GROUP','BGD','EDIT','ALL'),
        ('USER_GROUP','BGD','APPROVE','ALL'), ('USER_GROUP','BGD','REJECT','ALL'), ('USER_GROUP','BGD','WITHDRAW','ALL'), ('USER_GROUP','BGD','HISTORY','ALL'),
        ('USER_GROUP','GD','VIEW','ALL'), ('USER_GROUP','GD','CREATE','ALL'), ('USER_GROUP','GD','EDIT','ALL'),
        ('USER_GROUP','GD','APPROVE','ALL'), ('USER_GROUP','GD','REJECT','ALL'), ('USER_GROUP','GD','WITHDRAW','ALL'), ('USER_GROUP','GD','HISTORY','ALL')
    ) V(PrincipalType, PrincipalValue, ActionCode, ScopeMode)
) S
ON T.PrincipalType=S.PrincipalType AND T.PrincipalValue=S.PrincipalValue AND T.ActionCode=S.ActionCode
WHEN MATCHED THEN UPDATE SET ScopeMode=S.ScopeMode, IsAllowed=1, IsActive=1, UpdatedBy='PROMO-AUTH-001', UpdatedAtUtc=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (PrincipalType,PrincipalValue,ActionCode,ScopeMode,IsAllowed,IsActive,UpdatedBy)
VALUES (S.PrincipalType,S.PrincipalValue,S.ActionCode,S.ScopeMode,1,1,'PROMO-AUTH-001');
GO

CREATE OR ALTER FUNCTION dbo.AI_PromotionPermissionFnc
(
    @Username VARCHAR(50),
    @ActionCode VARCHAR(20)
)
RETURNS @Result TABLE
(
    IsAllowed BIT NOT NULL,
    ScopeMode VARCHAR(20) NOT NULL,
    ActorBranchID VARCHAR(50) NULL,
    ActorUserGroupID VARCHAR(50) NULL,
    DecisionCode VARCHAR(50) NOT NULL
)
AS
BEGIN
    DECLARE @BranchID VARCHAR(50) = '', @UserGroupID VARCHAR(50) = '', @Manager BIT = 0;
    SELECT @BranchID=COALESCE(BranchID,''), @UserGroupID=UPPER(COALESCE(UserGroupID,'')), @Manager=COALESCE(Manager,0)
    FROM dbo.SY_User
    WHERE UserName=@Username AND COALESCE(Disable,0)=0;

    IF @UserGroupID = ''
    BEGIN
        INSERT @Result VALUES (0,'OWN_BRANCH',@BranchID,@UserGroupID,'INVALID_USER');
        RETURN;
    END;

    DECLARE @Allowed BIT=0, @Scope VARCHAR(20)='OWN_BRANCH';
    SELECT TOP (1) @Allowed=P.IsAllowed, @Scope=P.ScopeMode
    FROM dbo.AI_PromotionPermissionTbl P
    WHERE P.ActionCode=UPPER(@ActionCode) AND P.IsActive=1
      AND
      (
          (P.PrincipalType='USER' AND P.PrincipalValue=@Username)
          OR (P.PrincipalType='USER_GROUP' AND UPPER(P.PrincipalValue)=@UserGroupID)
          OR (P.PrincipalType='MANAGER_FLAG' AND P.PrincipalValue='1' AND @Manager=1)
      )
    ORDER BY CASE P.PrincipalType WHEN 'USER' THEN 1 WHEN 'USER_GROUP' THEN 2 ELSE 3 END,
             CASE P.ScopeMode WHEN 'ALL' THEN 1 ELSE 2 END;

    INSERT @Result VALUES (@Allowed,@Scope,@BranchID,@UserGroupID,CASE WHEN @Allowed=1 THEN 'ALLOWED' ELSE 'ACTION_NOT_GRANTED' END);
    RETURN;
END;
GO

CREATE OR ALTER PROCEDURE dbo.API_PromotionPermissionContext_AI
    @Username VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.SY_User WHERE UserName=@Username AND COALESCE(Disable,0)=0)
    BEGIN
        SELECT N'Tài khoản không hợp lệ hoặc đã bị khóa.' Msg, 1 MsgType;
        RETURN;
    END;

    SELECT U.BranchID,
           MAX(CASE WHEN P.ActionCode='VIEW' THEN CONVERT(INT,P.IsAllowed) ELSE 0 END) CanView,
           MAX(CASE WHEN P.ActionCode='CREATE' THEN CONVERT(INT,P.IsAllowed) ELSE 0 END) CanCreate,
           MAX(CASE WHEN P.ActionCode='EDIT' THEN CONVERT(INT,P.IsAllowed) ELSE 0 END) CanEdit,
           MAX(CASE WHEN P.ActionCode='APPROVE' THEN CONVERT(INT,P.IsAllowed) ELSE 0 END) CanApprove,
           MAX(CASE WHEN P.ActionCode='REJECT' THEN CONVERT(INT,P.IsAllowed) ELSE 0 END) CanReject,
           MAX(CASE WHEN P.ActionCode='WITHDRAW' THEN CONVERT(INT,P.IsAllowed) ELSE 0 END) CanWithdraw,
           MAX(CASE WHEN P.ActionCode='HISTORY' THEN CONVERT(INT,P.IsAllowed) ELSE 0 END) CanViewHistory,
           CASE WHEN MAX(CASE WHEN P.ScopeMode='ALL' AND P.IsAllowed=1 THEN 1 ELSE 0 END)=1 THEN 'ALL' ELSE 'OWN_BRANCH' END ScopeMode,
           N'PROMOTION_PERMISSION_V1' ContractVersion
    FROM dbo.SY_User U
    CROSS APPLY
    (
        SELECT A.ActionCode, F.IsAllowed, F.ScopeMode
        FROM (VALUES ('VIEW'),('CREATE'),('EDIT'),('APPROVE'),('REJECT'),('WITHDRAW'),('HISTORY')) A(ActionCode)
        CROSS APPLY dbo.AI_PromotionPermissionFnc(@Username,A.ActionCode) F
    ) P
    WHERE U.UserName=@Username
    GROUP BY U.BranchID;
END;
GO

CREATE OR ALTER PROCEDURE dbo.API_PromotionProgram_History_AI
    @PromotionProgramID BIGINT,
    @Username VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Allowed BIT=0,@Scope VARCHAR(20)='OWN_BRANCH',@BranchID VARCHAR(50)='';
    SELECT @Allowed=IsAllowed,@Scope=ScopeMode,@BranchID=COALESCE(ActorBranchID,'')
    FROM dbo.AI_PromotionPermissionFnc(@Username,'HISTORY');
    IF @Allowed=0
    BEGIN
        SELECT N'Tài khoản không có quyền xem lịch sử CTKM.' Msg,1 MsgType;
        RETURN;
    END;
    IF @Scope='OWN_BRANCH' AND NOT EXISTS
    (
        SELECT 1 FROM dbo.AI_PromotionProgramTbl P
        WHERE P.PromotionProgramID=@PromotionProgramID
          AND (P.BranchScopeMode='ALL' OR EXISTS
              (SELECT 1 FROM dbo.AI_PromotionBranchScopeTbl B WHERE B.PromotionProgramID=P.PromotionProgramID AND B.BranchID=@BranchID))
    )
    BEGIN
        SELECT N'CTKM nằm ngoài phạm vi chi nhánh.' Msg,1 MsgType;
        RETURN;
    END;
    SELECT LogID,LogTime,Username,ActionType,TargetID,TargetName,ExtraInfo
    FROM dbo.AI_AuditLog WITH (NOLOCK)
    WHERE TargetID=CONVERT(VARCHAR(100),@PromotionProgramID)
      AND ActionType LIKE 'PROMOTION[_]%'
    ORDER BY LogTime DESC,LogID DESC;
END;
GO
