SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  ORDER-APPROVAL-003 — Nơi lưu HỢP ĐỒNG DUYỆT ĐƠN (transition + vai trò), thay cho việc
  hard-code trong procedure.

  Vì sao tồn tại file này: bản triển khai trước hard-code ngay trong
  API_DonHang_ApproveTransition_AI rằng "APPROVE: 0 -> 1", "REJECT: 0 -> -2" và "KTDH/QL/Admin
  được duyệt", kèm comment tự nhận là "đã chốt với business" trong khi ORDER-APPROVAL-002 vẫn
  đang ở trạng thái READY_FOR_BUSINESS_SIGN_OFF. Đó là quyết định nghiệp vụ chưa có sign-off
  nằm trong code.

  Cách làm ở đây, theo đúng pattern đã dùng cho dbo.AI_BusinessRuleConfigTbl
  (Migrate_Business_Rule_Baseline_V1_AI.sql):
    - Mọi transition và mọi vai trò được duyệt nằm trong DỮ LIỆU, không nằm trong code.
    - Các dòng seed ở đây đều là Status = 'DRAFT' -> procedure KHÔNG dùng được dòng nào.
      Chừng nào khách chưa chốt ORDER-APPROVAL-002, API duyệt đơn fail-closed với mã
      APPROVAL_CONTRACT_NOT_APPROVED và không đổi trạng thái đơn nào.
    - Khi khách chốt: người có thẩm quyền UPDATE Status = 'APPROVED' + điền ApprovedBy,
      ApprovalRef (mã/link sign-off) và EffectiveFrom. Không cần sửa procedure, không cần
      deploy lại code — nên không còn động cơ hard-code lại.
    - Giá trị seed dưới đây là ĐỀ XUẤT rút ra từ khảo sát ORDER-APPROVAL-001, KHÔNG phải
      quyết định của khách. Cứ để DRAFT cho tới khi có sign-off thật.

  Idempotent: chạy lại nhiều lần không ghi đè dòng đã có (đặc biệt không hạ dòng APPROVED
  xuống DRAFT).
*/

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    /* -- Ma trận transition: (Action, FromStatusID) -> ToStatusID -------------------- */
    IF OBJECT_ID(N'dbo.AI_OrderApprovalTransitionTbl', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.AI_OrderApprovalTransitionTbl
        (
            TransitionID     INT IDENTITY(1,1) NOT NULL
                CONSTRAINT PK_AI_OrderApprovalTransition PRIMARY KEY,
            ContractVersion  VARCHAR(30)   NOT NULL,
            ActionCode       VARCHAR(20)   NOT NULL,
            FromStatusID     INT           NOT NULL,
            ToStatusID       INT           NOT NULL,
            RequireReason    BIT           NOT NULL
                CONSTRAINT DF_AI_OrderApprovalTransition_RequireReason DEFAULT (0),
            Status           VARCHAR(20)   NOT NULL
                CONSTRAINT DF_AI_OrderApprovalTransition_Status DEFAULT ('DRAFT'),
            EffectiveFrom    DATETIME2(0)  NULL,
            EffectiveTo      DATETIME2(0)  NULL,
            ApprovedBy       VARCHAR(100)  NULL,
            ApprovalRef      NVARCHAR(200) NULL,
            Notes            NVARCHAR(500) NULL,
            CreatedAt        DATETIME2(0)  NOT NULL
                CONSTRAINT DF_AI_OrderApprovalTransition_CreatedAt DEFAULT (SYSUTCDATETIME()),
            ModifiedAt       DATETIME2(0)  NOT NULL
                CONSTRAINT DF_AI_OrderApprovalTransition_ModifiedAt DEFAULT (SYSUTCDATETIME()),
            CONSTRAINT UQ_AI_OrderApprovalTransition
                UNIQUE (ContractVersion, ActionCode, FromStatusID, ToStatusID),
            CONSTRAINT CK_AI_OrderApprovalTransition_Status
                CHECK (Status IN ('DRAFT', 'APPROVED', 'RETIRED')),
            CONSTRAINT CK_AI_OrderApprovalTransition_NoSelfLoop
                CHECK (FromStatusID <> ToStatusID),
            CONSTRAINT CK_AI_OrderApprovalTransition_Range
                CHECK (EffectiveTo IS NULL OR EffectiveFrom IS NULL OR EffectiveTo > EffectiveFrom),
            /* Không cho bật APPROVED mà thiếu dấu vết sign-off. */
            CONSTRAINT CK_AI_OrderApprovalTransition_SignOff
                CHECK (Status <> 'APPROVED' OR (ApprovedBy IS NOT NULL AND ApprovalRef IS NOT NULL))
        );
    END;

    /* -- Ai được thực hiện transition, và phạm vi tới đâu ---------------------------- */
    IF OBJECT_ID(N'dbo.AI_OrderApprovalRoleTbl', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.AI_OrderApprovalRoleTbl
        (
            RoleRuleID         INT IDENTITY(1,1) NOT NULL
                CONSTRAINT PK_AI_OrderApprovalRole PRIMARY KEY,
            ContractVersion    VARCHAR(30)   NOT NULL,
            /* '*' = áp dụng cho mọi ActionCode trong hợp đồng này. */
            ActionCode         VARCHAR(20)   NOT NULL,
            /* USER_GROUP: khớp SY_User.UserGroupID | MANAGER_FLAG: khớp SY_User.Manager
               | USERNAME: khớp đích danh SY_User.UserName */
            PrincipalType      VARCHAR(20)   NOT NULL,
            PrincipalValue     VARCHAR(100)  NOT NULL,
            /* BRANCH_MATCH: SY_User.BranchID phải khác rỗng và bằng AR_OrderTbl.BranchID
               | GLOBAL: duyệt được mọi chi nhánh (chỉ dùng khi khách chốt rõ) */
            ScopeRule          VARCHAR(30)   NOT NULL,
            /* Mặc định 0 = KHÔNG cho tự duyệt đơn do chính mình tạo (maker-checker).
               Chỉ mở khi khách chốt bằng văn bản cho một vai trò cụ thể. */
            AllowSelfApproval  BIT           NOT NULL
                CONSTRAINT DF_AI_OrderApprovalRole_AllowSelf DEFAULT (0),
            Status             VARCHAR(20)   NOT NULL
                CONSTRAINT DF_AI_OrderApprovalRole_Status DEFAULT ('DRAFT'),
            EffectiveFrom      DATETIME2(0)  NULL,
            EffectiveTo        DATETIME2(0)  NULL,
            ApprovedBy         VARCHAR(100)  NULL,
            ApprovalRef        NVARCHAR(200) NULL,
            Notes              NVARCHAR(500) NULL,
            CreatedAt          DATETIME2(0)  NOT NULL
                CONSTRAINT DF_AI_OrderApprovalRole_CreatedAt DEFAULT (SYSUTCDATETIME()),
            ModifiedAt         DATETIME2(0)  NOT NULL
                CONSTRAINT DF_AI_OrderApprovalRole_ModifiedAt DEFAULT (SYSUTCDATETIME()),
            CONSTRAINT UQ_AI_OrderApprovalRole
                UNIQUE (ContractVersion, ActionCode, PrincipalType, PrincipalValue),
            CONSTRAINT CK_AI_OrderApprovalRole_Status
                CHECK (Status IN ('DRAFT', 'APPROVED', 'RETIRED')),
            CONSTRAINT CK_AI_OrderApprovalRole_PrincipalType
                CHECK (PrincipalType IN ('USER_GROUP', 'MANAGER_FLAG', 'USERNAME')),
            CONSTRAINT CK_AI_OrderApprovalRole_ScopeRule
                CHECK (ScopeRule IN ('BRANCH_MATCH', 'GLOBAL')),
            CONSTRAINT CK_AI_OrderApprovalRole_Range
                CHECK (EffectiveTo IS NULL OR EffectiveFrom IS NULL OR EffectiveTo > EffectiveFrom),
            CONSTRAINT CK_AI_OrderApprovalRole_SignOff
                CHECK (Status <> 'APPROVED' OR (ApprovedBy IS NOT NULL AND ApprovalRef IS NOT NULL))
        );
    END;

    /* -- Seed ĐỀ XUẤT (DRAFT - chưa có hiệu lực) ------------------------------------- */
    IF NOT EXISTS (SELECT 1 FROM dbo.AI_OrderApprovalTransitionTbl WHERE ContractVersion = 'ORDER-APPROVAL-002')
    BEGIN
        INSERT dbo.AI_OrderApprovalTransitionTbl
            (ContractVersion, ActionCode, FromStatusID, ToStatusID, RequireReason, Status, Notes)
        VALUES
            ('ORDER-APPROVAL-002', 'APPROVE', 0, 1, 0, 'DRAFT',
             N'ĐỀ XUẤT từ khảo sát ORDER-APPROVAL-001: Chờ duyệt (0) -> Nhận đơn (1). CHƯA có sign-off của khách.'),
            ('ORDER-APPROVAL-002', 'REJECT', 0, -2, 1, 'DRAFT',
             N'ĐỀ XUẤT từ khảo sát ORDER-APPROVAL-001: Chờ duyệt (0) -> TDV Kiểm tra lại (-2), yêu cầu lý do. CHƯA có sign-off của khách.');
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.AI_OrderApprovalRoleTbl WHERE ContractVersion = 'ORDER-APPROVAL-002')
    BEGIN
        INSERT dbo.AI_OrderApprovalRoleTbl
            (ContractVersion, ActionCode, PrincipalType, PrincipalValue, ScopeRule, AllowSelfApproval, Status, Notes)
        VALUES
            ('ORDER-APPROVAL-002', '*', 'USER_GROUP', 'KTDH', 'BRANCH_MATCH', 0, 'DRAFT',
             N'ĐỀ XUẤT: Kế toán đơn hàng duyệt trong phạm vi chi nhánh. Khách CHƯA chốt là theo chi nhánh hay toàn hệ thống; 2 tài khoản KTDH đang hoạt động (NHUNG, LANANH) hiện chưa có BranchID nên nếu chốt BRANCH_MATCH thì phải gán BranchID trước.'),
            ('ORDER-APPROVAL-002', '*', 'USER_GROUP', 'KTDH2', 'BRANCH_MATCH', 0, 'DRAFT',
             N'ĐỀ XUẤT - như KTDH.'),
            ('ORDER-APPROVAL-002', '*', 'USER_GROUP', 'TN KTDH', 'BRANCH_MATCH', 0, 'DRAFT',
             N'ĐỀ XUẤT - như KTDH.');
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

/*
  Ba hàm dưới đây là NGUỒN SỰ THẬT DUY NHẤT về hợp đồng duyệt đơn. Cả procedure ghi
  (API_DonHang_ApproveTransition_AI) và procedure đọc (API_DonHang_ApprovalContext_AI) đều
  phải dùng chúng — nếu mỗi bên tự viết lại điều kiện thì UI và DB sẽ lệch nhau (nút hiện ra
  nhưng bấm vào bị từ chối, hoặc tệ hơn là ngược lại).
*/

CREATE OR ALTER FUNCTION dbo.AI_OrderApprovalTransitionFnc
(
    @ActionCode   VARCHAR(20),
    @FromStatusID INT,
    @AsOf         DATETIME2(0)
)
RETURNS TABLE
AS
RETURN
(
    SELECT
        T.ContractVersion,
        T.ActionCode,
        T.FromStatusID,
        T.ToStatusID,
        T.RequireReason,
        /* >1 dòng cùng khớp = hợp đồng mâu thuẫn -> phía gọi phải fail-closed, không tự chọn bừa. */
        COUNT(*) OVER () AS MatchCount
    FROM dbo.AI_OrderApprovalTransitionTbl T
    WHERE T.ActionCode = @ActionCode
      /* @FromStatusID = NULL: liệt kê MỌI trạng thái nguồn của hành động này (dùng để đếm
         đơn đang chờ duyệt). Phía ghi luôn truyền trạng thái cụ thể. */
      AND (@FromStatusID IS NULL OR T.FromStatusID = @FromStatusID)
      AND T.Status = 'APPROVED'
      AND (T.EffectiveFrom IS NULL OR T.EffectiveFrom <= COALESCE(@AsOf, SYSUTCDATETIME()))
      AND (T.EffectiveTo   IS NULL OR T.EffectiveTo   >  COALESCE(@AsOf, SYSUTCDATETIME()))
);
GO

CREATE OR ALTER FUNCTION dbo.AI_OrderApprovalRoleFnc
(
    @Username   VARCHAR(50),
    @ActionCode VARCHAR(20),
    @AsOf       DATETIME2(0)
)
RETURNS TABLE
AS
RETURN
(
    /* Trả TỐI ĐA 1 dòng: luật khớp cụ thể nhất. USERNAME > USER_GROUP > MANAGER_FLAG.
       Cùng mức ưu tiên thì lấy luật chặt hơn trước (BRANCH_MATCH trước GLOBAL,
       AllowSelfApproval=0 trước 1) — mở rộng quyền phải là quyết định tường minh
       của khách, không phải hệ quả của thứ tự dòng trong bảng. */
    SELECT TOP (1)
        R.RoleRuleID,
        R.ContractVersion,
        R.ScopeRule,
        R.AllowSelfApproval,
        R.PrincipalType,
        R.PrincipalValue
    FROM dbo.AI_OrderApprovalRoleTbl R
    INNER JOIN dbo.SY_User U
        ON U.UserName = @Username
    WHERE R.Status = 'APPROVED'
      AND (R.ActionCode = @ActionCode OR R.ActionCode = '*')
      AND (R.EffectiveFrom IS NULL OR R.EffectiveFrom <= COALESCE(@AsOf, SYSUTCDATETIME()))
      AND (R.EffectiveTo   IS NULL OR R.EffectiveTo   >  COALESCE(@AsOf, SYSUTCDATETIME()))
      AND COALESCE(U.Disable, 0) = 0
      AND (
            (R.PrincipalType = 'USERNAME'     AND UPPER(R.PrincipalValue) = UPPER(@Username))
         OR (R.PrincipalType = 'USER_GROUP'   AND UPPER(R.PrincipalValue) = UPPER(COALESCE(U.UserGroupID, '')))
         OR (R.PrincipalType = 'MANAGER_FLAG' AND R.PrincipalValue = '1' AND COALESCE(U.Manager, 0) = 1)
      )
    ORDER BY
        CASE R.PrincipalType WHEN 'USERNAME' THEN 1 WHEN 'USER_GROUP' THEN 2 ELSE 3 END,
        CASE R.ScopeRule WHEN 'BRANCH_MATCH' THEN 1 ELSE 2 END,
        R.AllowSelfApproval,
        R.RoleRuleID
);
GO

/* Có ít nhất một transition VÀ một vai trò đã APPROVED thì hợp đồng mới coi là có hiệu lực. */
CREATE OR ALTER FUNCTION dbo.AI_OrderApprovalContractIsLiveFnc (@AsOf DATETIME2(0))
RETURNS BIT
AS
BEGIN
    DECLARE @HasTransition BIT = 0, @HasRole BIT = 0;
    SET @AsOf = COALESCE(@AsOf, SYSUTCDATETIME());

    IF EXISTS (SELECT 1 FROM dbo.AI_OrderApprovalTransitionTbl
               WHERE Status = 'APPROVED'
                 AND (EffectiveFrom IS NULL OR EffectiveFrom <= @AsOf)
                 AND (EffectiveTo   IS NULL OR EffectiveTo   >  @AsOf))
        SET @HasTransition = 1;

    IF EXISTS (SELECT 1 FROM dbo.AI_OrderApprovalRoleTbl
               WHERE Status = 'APPROVED'
                 AND (EffectiveFrom IS NULL OR EffectiveFrom <= @AsOf)
                 AND (EffectiveTo   IS NULL OR EffectiveTo   >  @AsOf))
        SET @HasRole = 1;

    RETURN CASE WHEN @HasTransition = 1 AND @HasRole = 1 THEN 1 ELSE 0 END;
END;
GO

/* Kiểm tra sau khi import: mọi dòng phải là DRAFT cho tới khi khách ký ORDER-APPROVAL-002. */
SELECT 'TRANSITION' AS Kind, ContractVersion, ActionCode,
       CAST(FromStatusID AS VARCHAR(10)) + ' -> ' + CAST(ToStatusID AS VARCHAR(10)) AS Detail,
       Status, ApprovedBy, ApprovalRef
FROM dbo.AI_OrderApprovalTransitionTbl
UNION ALL
SELECT 'ROLE', ContractVersion, ActionCode,
       PrincipalType + '=' + PrincipalValue + ' / ' + ScopeRule, Status, ApprovedBy, ApprovalRef
FROM dbo.AI_OrderApprovalRoleTbl
ORDER BY Kind, Detail;
GO
