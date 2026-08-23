SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  CUSTOMER-SEC-001 — thay quyền wildcard bằng quyền theo từng action.

  Sign-off CUSTOMER-BIZ-001 V1, 23/08/2026:
    - Sale chỉ sửa/gửi/hủy đơn nháp của chính mình (owner guard hiện hữu).
    - Quản lý cùng chi nhánh được EDIT/APPROVE/REJECT.
    - Không tự duyệt.
    - Quản lý không SUBMIT/CANCEL nháp của người khác.
    - Kế toán không dùng app; Admin không có mutation override riêng.

  Rollback do scripts/deploy_customer_sec001_policy.js --rollback thực hiện theo hướng
  fail-closed: retire các dòng do migration này bật, không khôi phục wildcard TEST cũ.
*/

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.AI_OrderApprovalTransitionTbl', N'U') IS NULL
       OR OBJECT_ID(N'dbo.AI_OrderApprovalRoleTbl', N'U') IS NULL
       OR OBJECT_ID(N'dbo.AI_OrderApprovalRoleFnc', N'IF') IS NULL
       OR OBJECT_ID(N'dbo.AI_OrderApprovalTransitionFnc', N'IF') IS NULL
        THROW 52001, 'CUSTOMER_SEC_POLICY_INFRA_UNAVAILABLE', 1;

    DECLARE @ContractVersion VARCHAR(30) = 'ORDER-APPROVAL-002';
    DECLARE @ApprovedBy VARCHAR(100) = 'HoangDang';
    DECLARE @ApprovalRef NVARCHAR(200) = N'CUSTOMER-BIZ-001 V1 — chat sign-off 23/08/2026';
    DECLARE @Now DATETIME2(0) = SYSUTCDATETIME();
    DECLARE @PolicyLockResult INT;
    DECLARE @BeforeSnapshot NVARCHAR(MAX);
    DECLARE @AfterSnapshot NVARCHAR(MAX);
    DECLARE @AuditPayload NVARCHAR(MAX);

    IF OBJECT_ID(N'dbo.AI_WriteAuditLog', N'P') IS NULL
        THROW 52006, 'CUSTOMER_SEC_AUDIT_UNAVAILABLE', 1;

    EXEC @PolicyLockResult = sys.sp_getapplock
        @Resource = 'AI_ORDER_APPROVAL_POLICY',
        @LockMode = 'Exclusive',
        @LockOwner = 'Transaction',
        @LockTimeout = 15000;
    IF @PolicyLockResult < 0
        THROW 52007, 'CUSTOMER_SEC_POLICY_LOCK_TIMEOUT', 1;

    SET @BeforeSnapshot = (
        SELECT
          JSON_QUERY((SELECT ActionCode, PrincipalType, PrincipalValue, ScopeRule, AllowSelfApproval,
                             Status, ApprovedBy, ApprovalRef, EffectiveFrom, EffectiveTo
                      FROM dbo.AI_OrderApprovalRoleTbl
                      WHERE ContractVersion = @ContractVersion
                      ORDER BY RoleRuleID FOR JSON PATH)) AS Roles,
          JSON_QUERY((SELECT ActionCode, FromStatusID, ToStatusID, RequireReason, Status,
                             ApprovedBy, ApprovalRef, EffectiveFrom, EffectiveTo
                      FROM dbo.AI_OrderApprovalTransitionTbl
                      WHERE ContractVersion = @ContractVersion
                      ORDER BY TransitionID FOR JSON PATH)) AS Transitions
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    /* Wildcard là nguyên nhân mở nhầm EDIT/SUBMIT/CANCEL. Giữ dòng lịch sử nhưng retire. */
    UPDATE dbo.AI_OrderApprovalRoleTbl
    SET Status = 'RETIRED',
        EffectiveTo = @Now,
        ModifiedAt = @Now,
        Notes = CONCAT(COALESCE(Notes, N''), N' | RETIRED bởi CUSTOMER-SEC-001: bỏ quyền wildcard.')
    WHERE ContractVersion = @ContractVersion
      AND ActionCode = '*'
      AND Status = 'APPROVED';

    /* Kế toán thao tác trên PMKT, không có mutation role trong app. */
    UPDATE dbo.AI_OrderApprovalRoleTbl
    SET Status = 'RETIRED',
        EffectiveTo = @Now,
        ModifiedAt = @Now,
        Notes = CONCAT(COALESCE(Notes, N''), N' | RETIRED bởi CUSTOMER-SEC-001: kế toán không dùng app.')
    WHERE ContractVersion = @ContractVersion
      AND PrincipalType = 'USER_GROUP'
      AND UPPER(PrincipalValue) IN ('KTDH', 'KTDH2', 'TN KTDH')
      AND Status = 'APPROVED';

    /* Không dùng MANAGER_FLAG vì tài khoản Admin có thể đồng thời mang Manager=1. */
    UPDATE dbo.AI_OrderApprovalRoleTbl
    SET Status = 'RETIRED', EffectiveTo = @Now, ModifiedAt = @Now,
        Notes = CONCAT(COALESCE(Notes, N''), N' | RETIRED bởi CUSTOMER-SEC-001: principal Manager flag không đủ chặt.')
    WHERE ContractVersion = @ContractVersion
      AND PrincipalType = 'MANAGER_FLAG'
      AND Status = 'APPROVED';

    /* Chỉ ba action được cấp cho quản lý; scope luôn theo chi nhánh, không self-approve. */
    MERGE dbo.AI_OrderApprovalRoleTbl WITH (HOLDLOCK) AS target
    USING
    (
        SELECT V.ActionCode, V.PrincipalType, V.PrincipalValue
        FROM (VALUES
            ('APPROVE', 'USER_GROUP',   'QL'),
            ('REJECT',  'USER_GROUP',   'QL'),
            ('EDIT',    'USER_GROUP',   'QL'),
            ('APPROVE', 'USER_GROUP',   'QLMN'),
            ('REJECT',  'USER_GROUP',   'QLMN'),
            ('EDIT',    'USER_GROUP',   'QLMN')
        ) V(ActionCode, PrincipalType, PrincipalValue)
    ) AS source
      ON target.ContractVersion = @ContractVersion
     AND target.ActionCode = source.ActionCode
     AND target.PrincipalType = source.PrincipalType
     AND target.PrincipalValue = source.PrincipalValue
    WHEN MATCHED THEN
      UPDATE SET ScopeRule = 'BRANCH_MATCH',
                 AllowSelfApproval = 0,
                 Status = 'APPROVED',
                 ApprovedBy = @ApprovedBy,
                 ApprovalRef = @ApprovalRef,
                 EffectiveFrom = @Now,
                 EffectiveTo = NULL,
                 ModifiedAt = @Now,
                 Notes = N'CUSTOMER-SEC-001: quyền quản lý theo action, cùng chi nhánh, không tự duyệt.'
    WHEN NOT MATCHED THEN
      INSERT
      (
        ContractVersion, ActionCode, PrincipalType, PrincipalValue, ScopeRule,
        AllowSelfApproval, Status, ApprovedBy, ApprovalRef, EffectiveFrom, Notes
      )
      VALUES
      (
        @ContractVersion, source.ActionCode, source.PrincipalType, source.PrincipalValue,
        'BRANCH_MATCH', 0, 'APPROVED', @ApprovedBy, @ApprovalRef, @Now,
        N'CUSTOMER-SEC-001: quyền quản lý theo action, cùng chi nhánh, không tự duyệt.'
      );

    /* Chốt bốn transition hợp lệ; mọi CANCEL ngoài đơn nháp đều fail-closed. */
    UPDATE dbo.AI_OrderApprovalTransitionTbl
    SET Status = 'APPROVED', ApprovedBy = @ApprovedBy, ApprovalRef = @ApprovalRef,
        EffectiveFrom = @Now, EffectiveTo = NULL, ModifiedAt = @Now
    WHERE ContractVersion = @ContractVersion
      AND (
           (ActionCode = 'APPROVE' AND FromStatusID = 0 AND ToStatusID = 1)
        OR (ActionCode = 'REJECT'  AND FromStatusID = 0 AND ToStatusID = -2)
        OR (ActionCode = 'SUBMIT'  AND FromStatusID = -1 AND ToStatusID = 0)
        OR (ActionCode = 'CANCEL'  AND FromStatusID = -1 AND ToStatusID = 10)
      );

    IF (SELECT COUNT(*) FROM dbo.AI_OrderApprovalTransitionTbl
        WHERE ContractVersion = @ContractVersion AND Status = 'APPROVED'
          AND ((ActionCode = 'APPROVE' AND FromStatusID = 0 AND ToStatusID = 1)
            OR (ActionCode = 'REJECT' AND FromStatusID = 0 AND ToStatusID = -2)
            OR (ActionCode = 'SUBMIT' AND FromStatusID = -1 AND ToStatusID = 0)
            OR (ActionCode = 'CANCEL' AND FromStatusID = -1 AND ToStatusID = 10))) <> 4
        THROW 52002, 'CUSTOMER_SEC_REQUIRED_TRANSITIONS_MISSING', 1;

    UPDATE dbo.AI_OrderApprovalTransitionTbl
    SET Status = 'RETIRED', EffectiveTo = @Now, ModifiedAt = @Now
    WHERE ContractVersion = @ContractVersion
      AND ActionCode = 'CANCEL'
      AND NOT (FromStatusID = -1 AND ToStatusID = 10)
      AND Status = 'APPROVED';

    /* Invariant cuối migration: không wildcard, không kế toán, không action ngoài ma trận. */
    IF EXISTS
    (
        SELECT 1 FROM dbo.AI_OrderApprovalRoleTbl
        WHERE ContractVersion = @ContractVersion AND Status = 'APPROVED'
          AND ActionCode = '*'
    ) THROW 52003, 'CUSTOMER_SEC_WILDCARD_ROLE_REMAINS', 1;

    IF EXISTS
    (
        SELECT 1 FROM dbo.AI_OrderApprovalRoleTbl
        WHERE ContractVersion = @ContractVersion AND Status = 'APPROVED'
          AND PrincipalType = 'USER_GROUP'
          AND UPPER(PrincipalValue) IN ('KTDH', 'KTDH2', 'TN KTDH')
    ) THROW 52004, 'CUSTOMER_SEC_ACCOUNTING_ROLE_REMAINS', 1;

    IF EXISTS
    (
        SELECT 1 FROM dbo.AI_OrderApprovalRoleTbl
        WHERE ContractVersion = @ContractVersion AND Status = 'APPROVED'
          AND ApprovalRef = @ApprovalRef
          AND ActionCode NOT IN ('EDIT', 'APPROVE', 'REJECT')
    ) THROW 52005, 'CUSTOMER_SEC_UNAPPROVED_ACTION_GRANTED', 1;

    IF (SELECT COUNT(*) FROM dbo.AI_OrderApprovalRoleTbl
        WHERE ContractVersion = @ContractVersion AND Status = 'APPROVED'
          AND ApprovalRef = @ApprovalRef) <> 6
        THROW 52008, 'CUSTOMER_SEC_ROLE_COUNT_INVALID', 1;

    IF EXISTS
    (
        SELECT 1 FROM dbo.AI_OrderApprovalRoleTbl
        WHERE ContractVersion = @ContractVersion AND Status = 'APPROVED'
          AND PrincipalType = 'MANAGER_FLAG'
    ) THROW 52009, 'CUSTOMER_SEC_MANAGER_FLAG_REMAINS', 1;

    SET @AfterSnapshot = (
        SELECT
          JSON_QUERY((SELECT ActionCode, PrincipalType, PrincipalValue, ScopeRule, AllowSelfApproval,
                             Status, ApprovedBy, ApprovalRef, EffectiveFrom, EffectiveTo
                      FROM dbo.AI_OrderApprovalRoleTbl
                      WHERE ContractVersion = @ContractVersion
                      ORDER BY RoleRuleID FOR JSON PATH)) AS Roles,
          JSON_QUERY((SELECT ActionCode, FromStatusID, ToStatusID, RequireReason, Status,
                             ApprovedBy, ApprovalRef, EffectiveFrom, EffectiveTo
                      FROM dbo.AI_OrderApprovalTransitionTbl
                      WHERE ContractVersion = @ContractVersion
                      ORDER BY TransitionID FOR JSON PATH)) AS Transitions
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    SET @AuditPayload = (SELECT @ApprovalRef AS approvalRef,
                                JSON_QUERY(@BeforeSnapshot) AS beforePolicy,
                                JSON_QUERY(@AfterSnapshot) AS afterPolicy
                         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    EXEC dbo.AI_WriteAuditLog
        @Username = @ApprovedBy,
        @ActionType = 'CUSTOMER_SECURITY_POLICY_APPLY',
        @TargetEntity = 'AI_OrderApprovalRoleTbl',
        @TargetID = @ContractVersion,
        @ExtraInfo = @AuditPayload;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

SELECT ActionCode, PrincipalType, PrincipalValue, ScopeRule, AllowSelfApproval,
       Status, ApprovedBy, ApprovalRef
FROM dbo.AI_OrderApprovalRoleTbl
WHERE ContractVersion = 'ORDER-APPROVAL-002'
ORDER BY Status, ActionCode, PrincipalType, PrincipalValue;
GO
