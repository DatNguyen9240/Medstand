SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  ORDER-APPROVAL-003 — Proc transition trạng thái đơn hàng, thay thế đường tắt nguy hiểm
  "IF ISNULL(@StatusID,0) > 0" trong dbo.API_DonHang_Update. Đây là điểm ghi trạng thái duy
  nhất được phép của luồng duyệt đơn; frontend KHÔNG gọi API_DonHang_Update để đổi StatusID.

  ĐÃ SỬA (21/08/2026) so với bản trước — 5 lỗi P0:

  1. Không còn hard-code nghiệp vụ. Transition (Action, From -> To) và danh sách vai trò được
     duyệt nay đọc từ dbo.AI_OrderApprovalTransitionTbl / dbo.AI_OrderApprovalRoleTbl qua
     dbo.AI_OrderApprovalTransitionFnc / dbo.AI_OrderApprovalRoleFnc
     (sql/ORDER-APPROVAL-003_Approval_Contract_AI.sql). Mọi dòng đang là DRAFT, nên tới khi
     khách ký ORDER-APPROVAL-002 thì proc này fail-closed: APPROVAL_CONTRACT_NOT_APPROVED,
     không đổi trạng thái đơn nào. Bản trước hard-code 0->1 / 0->-2 và tự ghi trong comment là
     "đã chốt với business" trong khi chưa có sign-off.

  2. Maker-checker. Actor không được duyệt đơn do chính mình tạo (AR_OrderTbl.UserCreate) hoặc
     đơn ghi nhận cho chính mình với tư cách nhân viên (AR_OrderTbl.EmployeeID = SY_User.
     EmployeeID). Mặc định chặn; chỉ mở khi khách chốt cho một vai trò cụ thể bằng cột
     AI_OrderApprovalRoleTbl.AllowSelfApproval. Bản trước cho phép Manager tự duyệt đơn mình
     tạo, trái nghiệm thu "Sale không tự duyệt".

  3. Phạm vi chi nhánh không còn cứng. ScopeRule của luật vai trò quyết định BRANCH_MATCH hay
     GLOBAL. Không sửa dữ liệu SY_User để test; nếu khách chốt BRANCH_MATCH thì việc gán
     BranchID cho tài khoản kế toán là việc quản trị, không phải việc của proc này.

  4. Ghi lịch sử trạng thái ERP. Sau khi đổi StatusID, gọi hook ERP dbo.AR_OrderLog_Stp TRONG
     CÙNG TRANSACTION và kiểm chứng hậu điều kiện; không tự INSERT thẳng vào AR_OrderLogTbl.
     Bản trước chỉ ghi AI_AuditLog nên AR_OrderLogTbl không có chuỗi transition nào.

  5. Mã lỗi cạnh tranh trả đúng loại (IDEMPOTENCY_CONFLICT / IDEMPOTENCY_IN_PROGRESS /
     STATUS_CHANGED / ORDER_LOG_WRITE_FAILED) thay vì gom hết thành TRANSITION_FAILED — bản
     trước set @ResultMsg nhưng quên set @ResultCode trước khi THROW nên nhánh CATCH luôn rơi
     về TRANSITION_FAILED.

  Ngoài ra: @Reason (lý do từ chối) là tham số tùy chọn, bắt buộc khi dòng transition có
  RequireReason = 1; Reason nằm trong fingerprint idempotency và trong audit. Lưu ý
  AR_OrderLogTbl.Notes do hook ERP ghi (hook không nhận Notes), nên lý do được lưu ở
  AI_AuditLog chứ không nhét tay vào bảng log của ERP.
*/
CREATE OR ALTER PROCEDURE dbo.API_DonHang_ApproveTransition_AI
    @Username          VARCHAR(50) = '',
    @DocumentID        VARCHAR(50) = '',
    @Action            VARCHAR(20) = '',    -- APPROVE / REJECT (giá trị hợp lệ do hợp đồng quyết định)
    @ExpectedStatusID  INT = NULL,          -- Trạng thái client đang thấy, chặn stale/double-click
    @IdempotencyKey    VARCHAR(128) = '',
    @RequestID         VARCHAR(100) = '',
    @Reason            NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ResultMsg NVARCHAR(500) = N'';
    DECLARE @ResultCode VARCHAR(60) = '';
    DECLARE @ApiCode VARCHAR(100) = 'API_DonHang_ApproveTransition_AI';
    DECLARE @AsOf DATETIME2(0) = SYSUTCDATETIME();
    DECLARE @IdempotencyKeyHash CHAR(64) = NULL;
    DECLARE @VerifiedUserHash CHAR(64) = NULL;
    DECLARE @RequestFingerprintHash CHAR(64) = NULL;
    DECLARE @StoredStatus VARCHAR(20) = NULL;
    DECLARE @StoredFingerprintHash CHAR(64) = NULL;
    DECLARE @StoredMsg NVARCHAR(500) = NULL;
    DECLARE @StoredMsgType INT = NULL;
    DECLARE @AuditInfo NVARCHAR(MAX) = N'';
    DECLARE @InternalError NVARCHAR(2000) = N'';
    DECLARE @OrderLogOutcome VARCHAR(20) = 'NONE';

    SET @Username = LTRIM(RTRIM(COALESCE(@Username, '')));
    SET @DocumentID = LTRIM(RTRIM(COALESCE(@DocumentID, '')));
    SET @Action = UPPER(LTRIM(RTRIM(COALESCE(@Action, ''))));
    SET @IdempotencyKey = LTRIM(RTRIM(COALESCE(@IdempotencyKey, '')));
    SET @RequestID = LTRIM(RTRIM(COALESCE(@RequestID, '')));
    SET @Reason = NULLIF(LTRIM(RTRIM(COALESCE(@Reason, N''))), N'');

    /* ── 1. Tham số và hạ tầng bắt buộc ─────────────────────────────────────────────── */
    IF NOT EXISTS (SELECT 1 FROM dbo.SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SET @ResultCode = 'INVALID_USER';
        SET @ResultMsg = N'Tài khoản không tồn tại hoặc đã bị khóa.';
        GOTO ReturnFailure;
    END;
    IF @Action = '' OR @Action LIKE '%[^A-Z_]%'
    BEGIN
        SET @ResultCode = 'INVALID_ACTION';
        SET @ResultMsg = N'Hành động không hợp lệ.';
        GOTO ReturnFailure;
    END;
    IF @DocumentID = ''
    BEGIN
        SET @ResultCode = 'DOCUMENT_ID_REQUIRED';
        SET @ResultMsg = N'Thiếu mã đơn hàng.';
        GOTO ReturnFailure;
    END;
    IF @ExpectedStatusID IS NULL
    BEGIN
        SET @ResultCode = 'EXPECTED_STATUS_REQUIRED';
        SET @ResultMsg = N'Thiếu trạng thái hiện tại để đối chiếu (tránh duyệt nhầm đơn đã đổi trạng thái).';
        GOTO ReturnFailure;
    END;
    IF LEN(@IdempotencyKey) < 8 OR LEN(@IdempotencyKey) > 128 OR @IdempotencyKey LIKE '%[^A-Za-z0-9._:-]%'
    BEGIN
        SET @ResultCode = 'IDEMPOTENCY_KEY_REQUIRED';
        SET @ResultMsg = N'Yêu cầu duyệt đơn thiếu khóa chống gửi lặp hợp lệ.';
        GOTO ReturnFailure;
    END;
    IF LEN(@RequestID) < 8 OR LEN(@RequestID) > 100 OR @RequestID LIKE '%[^A-Za-z0-9._:-]%'
    BEGIN
        SET @ResultCode = 'REQUEST_ID_REQUIRED';
        SET @ResultMsg = N'Yêu cầu duyệt đơn thiếu mã request hợp lệ.';
        GOTO ReturnFailure;
    END;
    IF OBJECT_ID('dbo.AI_API_MutationIdempotency', 'U') IS NULL
    BEGIN
        SET @ResultCode = 'IDEMPOTENCY_LEDGER_UNAVAILABLE';
        SET @ResultMsg = N'Hệ thống chống gửi lặp chưa sẵn sàng. Không đổi trạng thái đơn. Mã đối soát: ' + @RequestID;
        GOTO ReturnFailure;
    END;
    IF OBJECT_ID('dbo.AI_WriteAuditLog', 'P') IS NULL
    BEGIN
        SET @ResultCode = 'AUDIT_UNAVAILABLE';
        SET @ResultMsg = N'Hệ thống audit chưa sẵn sàng. Không đổi trạng thái đơn. Mã đối soát: ' + @RequestID;
        GOTO ReturnFailure;
    END;
    IF OBJECT_ID('dbo.AR_OrderLog_Stp', 'P') IS NULL
    BEGIN
        SET @ResultCode = 'ORDER_LOG_HOOK_UNAVAILABLE';
        SET @ResultMsg = N'Hook ghi lịch sử trạng thái của ERP không tồn tại. Không đổi trạng thái đơn. Mã đối soát: ' + @RequestID;
        GOTO ReturnFailure;
    END;
    IF OBJECT_ID('dbo.AI_OrderApprovalTransitionFnc', 'IF') IS NULL
        OR OBJECT_ID('dbo.AI_OrderApprovalRoleFnc', 'IF') IS NULL
        OR OBJECT_ID('dbo.AI_OrderApprovalContractIsLiveFnc', 'FN') IS NULL
    BEGIN
        SET @ResultCode = 'APPROVAL_CONTRACT_UNAVAILABLE';
        SET @ResultMsg = N'Chưa cài đặt bảng hợp đồng duyệt đơn (ORDER-APPROVAL-003). Không đổi trạng thái đơn. Mã đối soát: ' + @RequestID;
        GOTO ReturnFailure;
    END;

    /* ── 2. Hợp đồng duyệt đơn phải đã được khách chốt ──────────────────────────────── */
    IF dbo.AI_OrderApprovalContractIsLiveFnc(@AsOf) = 0
    BEGIN
        SET @ResultCode = 'APPROVAL_CONTRACT_NOT_APPROVED';
        SET @ResultMsg = N'Quy trình duyệt đơn chưa được chốt (ORDER-APPROVAL-002). Chưa thể duyệt hoặc từ chối đơn.';
        GOTO ReturnFailure;
    END;

    /* ── 3. Vai trò và phạm vi của người thao tác ───────────────────────────────────── */
    DECLARE @ScopeRule VARCHAR(30) = NULL;
    DECLARE @AllowSelfApproval BIT = 0;
    DECLARE @RoleContractVersion VARCHAR(30) = NULL;
    DECLARE @RoleRuleID INT = NULL;

    SELECT TOP (1)
           @RoleRuleID = RoleRuleID,
           @ScopeRule = ScopeRule,
           @AllowSelfApproval = AllowSelfApproval,
           @RoleContractVersion = ContractVersion
    FROM dbo.AI_OrderApprovalRoleFnc(@Username, @Action, @AsOf);

    IF @ScopeRule IS NULL
    BEGIN
        SET @ResultCode = 'FORBIDDEN_ROLE';
        SET @ResultMsg = N'Tài khoản không có quyền duyệt/từ chối đơn theo hợp đồng duyệt đơn hiện hành.';
        GOTO ReturnFailure;
    END;

    /* ── 4. Transition hợp lệ theo hợp đồng ─────────────────────────────────────────── */
    DECLARE @NewStatusID INT = NULL;
    DECLARE @RequireReason BIT = 0;
    DECLARE @TransitionContractVersion VARCHAR(30) = NULL;
    DECLARE @TransitionMatchCount INT = 0;

    SELECT @NewStatusID = ToStatusID,
           @RequireReason = RequireReason,
           @TransitionContractVersion = ContractVersion,
           @TransitionMatchCount = MatchCount
    FROM dbo.AI_OrderApprovalTransitionFnc(@Action, @ExpectedStatusID, @AsOf);

    IF @TransitionMatchCount > 1
    BEGIN
        SET @ResultCode = 'APPROVAL_CONTRACT_AMBIGUOUS';
        SET @ResultMsg = N'Hợp đồng duyệt đơn đang có nhiều transition mâu thuẫn cho cùng một trạng thái. Không đổi trạng thái đơn. Mã đối soát: ' + @RequestID;
        GOTO ReturnFailure;
    END;
    IF @NewStatusID IS NULL
    BEGIN
        SET @ResultCode = 'INVALID_TRANSITION';
        SET @ResultMsg = N'Hợp đồng duyệt đơn không cho phép hành động ' + @Action
            + N' từ trạng thái ' + CAST(@ExpectedStatusID AS VARCHAR(20)) + N'.';
        GOTO ReturnFailure;
    END;
    IF @RequireReason = 1 AND @Reason IS NULL
    BEGIN
        SET @ResultCode = 'REASON_REQUIRED';
        SET @ResultMsg = N'Thao tác này bắt buộc nhập lý do.';
        GOTO ReturnFailure;
    END;

    /* Đơn phải tồn tại/đúng phạm vi bất kể replay hay không (dữ liệu này không đổi giữa các
       lần gọi lặp). NHƯNG so ExpectedStatusID với trạng thái SỐNG của đơn phải hoãn lại tới
       SAU bước kiểm tra idempotency bên dưới — nếu không, lần gọi lặp (retry) của chính
       request đã thành công trước đó sẽ luôn bị báo nhầm STATUS_CHANGED (vì request đầu đã
       đổi status thật rồi), phá vỡ tính idempotent thay vì trả lại đúng kết quả đã hoàn tất. */
    DECLARE @OrderBranchID VARCHAR(50) = '';
    DECLARE @CurrentStatusID INT = NULL;
    DECLARE @OrderUserCreate VARCHAR(30) = '';
    DECLARE @OrderEmployeeID VARCHAR(50) = '';

    IF NOT EXISTS (SELECT 1 FROM dbo.AR_OrderTbl WHERE DocumentID = @DocumentID)
    BEGIN
        SET @ResultCode = 'ORDER_NOT_FOUND';
        SET @ResultMsg = N'Không tìm thấy đơn hàng.';
        GOTO ReturnFailure;
    END;

    SELECT @OrderBranchID = COALESCE(BranchID, ''),
           @CurrentStatusID = StatusID,
           @OrderUserCreate = COALESCE(UserCreate, ''),
           @OrderEmployeeID = COALESCE(EmployeeID, '')
    FROM dbo.AR_OrderTbl
    WHERE DocumentID = @DocumentID;

    /* ── 5. Phạm vi theo ScopeRule của luật vai trò ─────────────────────────────────── */
    DECLARE @ActorBranchID VARCHAR(50) = '';
    DECLARE @ActorEmployeeID VARCHAR(50) = '';
    SELECT @ActorBranchID = COALESCE(BranchID, ''),
           @ActorEmployeeID = COALESCE(EmployeeID, '')
    FROM dbo.SY_User WHERE UserName = @Username;

    IF @ScopeRule = 'BRANCH_MATCH'
    BEGIN
        IF @ActorBranchID = ''
        BEGIN
            SET @ResultCode = 'APPROVER_BRANCH_MISSING';
            SET @ResultMsg = N'Tài khoản chưa được gán chi nhánh trong khi hợp đồng duyệt đơn yêu cầu duyệt theo chi nhánh. Liên hệ quản trị viên.';
            GOTO ReturnFailure;
        END;
        IF @OrderBranchID <> @ActorBranchID
        BEGIN
            SET @ResultCode = 'ORDER_OUT_OF_BRANCH_SCOPE';
            SET @ResultMsg = N'Đơn hàng không thuộc chi nhánh của tài khoản này.';
            GOTO ReturnFailure;
        END;
    END;

    /* ── 6. Maker-checker: người tạo đơn không tự duyệt ─────────────────────────────── */
    IF @AllowSelfApproval = 0
       AND (
            UPPER(@OrderUserCreate) = UPPER(@Username)
         OR (@ActorEmployeeID <> '' AND UPPER(@ActorEmployeeID) = UPPER(@OrderEmployeeID))
       )
    BEGIN
        SET @ResultCode = 'SELF_APPROVAL_BLOCKED';
        SET @ResultMsg = N'Không được duyệt/từ chối đơn do chính mình lập. Cần người khác duyệt.';
        GOTO ReturnFailure;
    END;

    /* ── 7. Idempotency ─────────────────────────────────────────────────────────────── */
    SET @IdempotencyKeyHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), @IdempotencyKey)), 2));
    SET @VerifiedUserHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), LOWER(@Username))), 2));
    SET @RequestFingerprintHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX),
        CONCAT(LOWER(@Username), '|', @DocumentID, '|', @Action, '|', @ExpectedStatusID, '|', @NewStatusID,
               '|', COALESCE(@TransitionContractVersion, ''), '|', COALESCE(@Reason, N'')))), 2));

    SELECT @StoredStatus = Status, @StoredFingerprintHash = RequestFingerprintHash,
           @StoredMsg = ResultMsg, @StoredMsgType = ResultMsgType
    FROM dbo.AI_API_MutationIdempotency
    WHERE IdempotencyKeyHash = @IdempotencyKeyHash AND VerifiedUserHash = @VerifiedUserHash AND ApiCode = @ApiCode;

    IF @StoredStatus IS NOT NULL AND @StoredFingerprintHash <> @RequestFingerprintHash
    BEGIN
        SET @ResultCode = 'IDEMPOTENCY_CONFLICT';
        SET @ResultMsg = N'Khóa gửi lặp đã được dùng cho một nội dung khác.';
        GOTO ReturnFailure;
    END;
    IF @StoredStatus = 'COMPLETED'
    BEGIN
        SELECT @DocumentID AS DocumentID, COALESCE(NULLIF(@StoredMsg, N''), N'Đã xử lý trước đó') AS Msg,
               COALESCE(@StoredMsgType, 5) AS MsgType, @RequestID AS RequestID, CAST(1 AS BIT) AS IsReplay;
        RETURN;
    END;

    /* Không phải replay của request đã hoàn tất trước đó → mới thật sự so trạng thái sống
       với ExpectedStatusID để chặn double-click/hai người duyệt cùng lúc/màn hình cũ. */
    IF @CurrentStatusID <> @ExpectedStatusID
    BEGIN
        SET @ResultCode = 'STATUS_CHANGED';
        SET @ResultMsg = N'Trạng thái đơn đã thay đổi so với màn hình đang xem. Vui lòng tải lại.';
        GOTO ReturnFailure;
    END;

    /* ── 8. Transaction ghi ─────────────────────────────────────────────────────────── */
    DECLARE @LogRowsBefore INT = 0;
    DECLARE @LogRowsAfter INT = 0;
    DECLARE @LastLogStatusID INT = NULL;

    BEGIN TRY
        BEGIN TRANSACTION;

        SELECT @StoredStatus = Status, @StoredFingerprintHash = RequestFingerprintHash
        FROM dbo.AI_API_MutationIdempotency WITH (UPDLOCK, HOLDLOCK)
        WHERE IdempotencyKeyHash = @IdempotencyKeyHash AND VerifiedUserHash = @VerifiedUserHash AND ApiCode = @ApiCode;

        IF @StoredStatus IS NOT NULL
        BEGIN
            IF @StoredFingerprintHash <> @RequestFingerprintHash
            BEGIN
                SET @ResultCode = 'IDEMPOTENCY_CONFLICT';
                SET @ResultMsg = N'Khóa gửi lặp đã được dùng cho một nội dung khác.';
                THROW 52001, N'IDEMPOTENCY_CONFLICT', 1;
            END;
            IF @StoredStatus = 'COMPLETED'
            BEGIN
                COMMIT TRANSACTION;
                SELECT @DocumentID AS DocumentID, N'Đã xử lý trước đó' AS Msg, 5 AS MsgType,
                       @RequestID AS RequestID, CAST(1 AS BIT) AS IsReplay;
                RETURN;
            END;
            SET @ResultCode = 'IDEMPOTENCY_IN_PROGRESS';
            SET @ResultMsg = N'Yêu cầu trùng đang được xử lý. Vui lòng chờ và tải lại trang.';
            THROW 52002, N'IDEMPOTENCY_IN_PROGRESS', 1;
        END;

        /* CUSTOMER-SEC-001: giữ shared policy lock tới COMMIT và tái kiểm quyền/transition
           sau khi khóa dòng đơn. Config bị thu hồi giữa context và mutation không được dùng tiếp. */
        DECLARE @PolicyLockResult INT;
        EXEC @PolicyLockResult = sys.sp_getapplock
            @Resource = 'AI_ORDER_APPROVAL_POLICY',
            @LockMode = 'Shared',
            @LockOwner = 'Transaction',
            @LockTimeout = 15000;
        IF @PolicyLockResult < 0
        BEGIN
            SET @ResultCode = 'APPROVAL_POLICY_BUSY';
            SET @ResultMsg = N'Chính sách duyệt đơn đang được cập nhật. Vui lòng tải lại và thử lại.';
            THROW 52005, N'APPROVAL_POLICY_BUSY', 1;
        END;

        SELECT @OrderBranchID = COALESCE(BranchID, ''),
               @CurrentStatusID = StatusID,
               @OrderUserCreate = COALESCE(UserCreate, ''),
               @OrderEmployeeID = COALESCE(EmployeeID, '')
        FROM dbo.AR_OrderTbl WITH (UPDLOCK, HOLDLOCK)
        WHERE DocumentID = @DocumentID;
        SELECT @ActorBranchID = COALESCE(BranchID, ''), @ActorEmployeeID = COALESCE(EmployeeID, '')
        FROM dbo.SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0;

        SET @AsOf = SYSUTCDATETIME();
        SET @RoleRuleID = NULL; SET @ScopeRule = NULL; SET @AllowSelfApproval = 0; SET @RoleContractVersion = NULL;
        SET @NewStatusID = NULL; SET @RequireReason = 0; SET @TransitionContractVersion = NULL; SET @TransitionMatchCount = 0;

        IF dbo.AI_OrderApprovalContractIsLiveFnc(@AsOf) = 0
        BEGIN
            SET @ResultCode = 'APPROVAL_CONTRACT_NOT_APPROVED';
            SET @ResultMsg = N'Chính sách duyệt đơn đã bị thu hồi. Vui lòng tải lại trang.';
            THROW 52006, N'APPROVAL_CONTRACT_NOT_APPROVED', 1;
        END;

        SELECT TOP (1) @RoleRuleID = RoleRuleID, @ScopeRule = ScopeRule,
               @AllowSelfApproval = AllowSelfApproval, @RoleContractVersion = ContractVersion
        FROM dbo.AI_OrderApprovalRoleFnc(@Username, @Action, @AsOf);
        IF @ScopeRule IS NULL
        BEGIN
            SET @ResultCode = 'FORBIDDEN_ROLE';
            SET @ResultMsg = N'Quyền duyệt/từ chối đã thay đổi. Vui lòng tải lại trang.';
            THROW 52007, N'FORBIDDEN_ROLE', 1;
        END;

        SELECT @NewStatusID = ToStatusID, @RequireReason = RequireReason,
               @TransitionContractVersion = ContractVersion, @TransitionMatchCount = MatchCount
        FROM dbo.AI_OrderApprovalTransitionFnc(@Action, @ExpectedStatusID, @AsOf);
        IF @TransitionMatchCount > 1
        BEGIN
            SET @ResultCode = 'APPROVAL_CONTRACT_AMBIGUOUS';
            SET @ResultMsg = N'Chính sách duyệt đơn đang mâu thuẫn. Không có thay đổi nào được lưu.';
            THROW 52008, N'APPROVAL_CONTRACT_AMBIGUOUS', 1;
        END;
        IF @NewStatusID IS NULL
        BEGIN
            SET @ResultCode = 'INVALID_TRANSITION';
            SET @ResultMsg = N'Chính sách không còn cho phép thao tác này. Vui lòng tải lại trang.';
            THROW 52009, N'INVALID_TRANSITION', 1;
        END;
        IF @RequireReason = 1 AND @Reason IS NULL
        BEGIN
            SET @ResultCode = 'REASON_REQUIRED';
            SET @ResultMsg = N'Thao tác này bắt buộc nhập lý do.';
            THROW 52010, N'REASON_REQUIRED', 1;
        END;
        IF @CurrentStatusID <> @ExpectedStatusID
        BEGIN
            SET @ResultCode = 'STATUS_CHANGED';
            SET @ResultMsg = N'Trạng thái đơn đã thay đổi. Vui lòng tải lại trang.';
            THROW 52011, N'STATUS_CHANGED', 1;
        END;
        IF @ScopeRule = 'BRANCH_MATCH' AND (@ActorBranchID = '' OR @OrderBranchID <> @ActorBranchID)
        BEGIN
            SET @ResultCode = CASE WHEN @ActorBranchID = '' THEN 'APPROVER_BRANCH_MISSING' ELSE 'ORDER_OUT_OF_BRANCH_SCOPE' END;
            SET @ResultMsg = N'Đơn không còn thuộc phạm vi được duyệt của tài khoản này.';
            THROW 52012, N'ORDER_OUT_OF_BRANCH_SCOPE', 1;
        END;
        IF @AllowSelfApproval = 0 AND
           (UPPER(@OrderUserCreate) = UPPER(@Username)
            OR (@ActorEmployeeID <> '' AND UPPER(@ActorEmployeeID) = UPPER(@OrderEmployeeID)))
        BEGIN
            SET @ResultCode = 'SELF_APPROVAL_BLOCKED';
            SET @ResultMsg = N'Không được duyệt/từ chối đơn do chính mình lập.';
            THROW 52013, N'SELF_APPROVAL_BLOCKED', 1;
        END;

        SET @RequestFingerprintHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX),
            CONCAT(LOWER(@Username), '|', @DocumentID, '|', @Action, '|', @ExpectedStatusID, '|', @NewStatusID,
                   '|', COALESCE(@TransitionContractVersion, ''), '|', COALESCE(@Reason, N'')))), 2));

        INSERT dbo.AI_API_MutationIdempotency
            (IdempotencyKeyHash, VerifiedUserHash, ApiCode, RequestFingerprintHash, Status, FirstRequestID, LastRequestID)
        VALUES
            (@IdempotencyKeyHash, @VerifiedUserHash, @ApiCode, @RequestFingerprintHash, 'PENDING', @RequestID, @RequestID);

        SELECT @LogRowsBefore = COUNT(*) FROM dbo.AR_OrderLogTbl WHERE DocumentID = @DocumentID;

        UPDATE dbo.AR_OrderTbl
        SET StatusID = @NewStatusID, DateUpdate = GETDATE(), UserUpdate = @Username
        WHERE DocumentID = @DocumentID AND StatusID = @ExpectedStatusID;

        IF @@ROWCOUNT = 0
        BEGIN
            SET @ResultCode = 'STATUS_CHANGED';
            SET @ResultMsg = N'Trạng thái đơn đã thay đổi so với màn hình đang xem. Vui lòng tải lại.';
            THROW 52003, N'STATUS_CHANGED', 1;
        END;

        /* Hook ERP ghi AR_OrderLogTbl. Không INSERT tay vào bảng log của ERP: hook là nơi
           ERP tự quyết định định dạng dòng log (và tự bỏ qua khi trạng thái không đổi). */
        EXEC dbo.AR_OrderLog_Stp @DocumentID = @DocumentID, @User = @Username, @Completed = 0;

        SELECT @LogRowsAfter = COUNT(*) FROM dbo.AR_OrderLogTbl WHERE DocumentID = @DocumentID;
        SELECT TOP (1) @LastLogStatusID = StatusID
        FROM dbo.AR_OrderLogTbl WHERE DocumentID = @DocumentID ORDER BY StatusDate DESC;

        SET @OrderLogOutcome =
            CASE
                WHEN @LogRowsAfter > @LogRowsBefore THEN 'WRITTEN'
                /* Hook ERP bỏ qua khi dòng log cuối đã đúng trạng thái mới — lịch sử vẫn phản
                   ánh đúng trạng thái hiện tại, ghi nhận lại để đối soát chứ không coi là lỗi. */
                WHEN @LastLogStatusID = @NewStatusID THEN 'DEDUPED'
                ELSE 'MISSING'
            END;

        IF @OrderLogOutcome = 'MISSING'
        BEGIN
            SET @ResultCode = 'ORDER_LOG_WRITE_FAILED';
            SET @ResultMsg = N'Không ghi được lịch sử trạng thái đơn. Không có thay đổi nào được lưu. Mã đối soát: ' + @RequestID;
            THROW 52004, N'ORDER_LOG_WRITE_FAILED', 1;
        END;

        /* Nhãn trạng thái lấy từ danh mục DB, không hard-code chuỗi "Đã duyệt"/"Đã từ chối"
           — nghiệp vụ có thể đổi ToStatusID trong hợp đồng mà không ai nhớ sửa câu thông báo. */
        SET @ResultMsg = N'Đã cập nhật trạng thái đơn hàng: '
            + COALESCE((SELECT StatusName FROM dbo.AR_OrderStatusTbl WHERE StatusID = @NewStatusID),
                       N'#' + CAST(@NewStatusID AS NVARCHAR(20)))
            + N'.';

        UPDATE dbo.AI_API_MutationIdempotency
        SET Status = 'COMPLETED', ResultEntityID = @DocumentID, ResultMsg = @ResultMsg, ResultMsgType = 5,
            LastRequestID = @RequestID, UpdatedAt = SYSUTCDATETIME(), CompletedAt = SYSUTCDATETIME()
        WHERE IdempotencyKeyHash = @IdempotencyKeyHash AND VerifiedUserHash = @VerifiedUserHash AND ApiCode = @ApiCode;

        SET @AuditInfo = N'{"requestId":"' + STRING_ESCAPE(@RequestID, 'json')
            + N'","action":"' + STRING_ESCAPE(@Action, 'json')
            + N'","contractVersion":"' + STRING_ESCAPE(COALESCE(@TransitionContractVersion, ''), 'json')
            + N'","roleRuleId":' + CAST(COALESCE(@RoleRuleID, 0) AS VARCHAR(20))
            + N',"scopeRule":"' + STRING_ESCAPE(COALESCE(@ScopeRule, ''), 'json')
            + N'","fromStatusID":' + CAST(@ExpectedStatusID AS VARCHAR(20))
            + N',"toStatusID":' + CAST(@NewStatusID AS VARCHAR(20))
            + N',"branchId":"' + STRING_ESCAPE(@OrderBranchID, 'json')
            + N'","orderCreatedBy":"' + STRING_ESCAPE(@OrderUserCreate, 'json')
            + N'","orderLog":"' + @OrderLogOutcome
            + N'","reason":"' + STRING_ESCAPE(COALESCE(@Reason, N''), 'json')
            + N'","outcome":"COMPLETED"}';
        EXEC dbo.AI_WriteAuditLog @Username = @Username, @ActionType = 'ORDER_APPROVAL_TRANSITION',
             @TargetEntity = @ApiCode, @TargetID = @DocumentID, @ExtraInfo = @AuditInfo;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        SET @InternalError = ERROR_MESSAGE();
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;

        /* Hai request song song cùng khóa: request thua có thể vấp unique key của ledger
           thay vì nhánh THROW ở trên — vẫn là "đang xử lý", không phải lỗi hệ thống. */
        IF ERROR_NUMBER() IN (2601, 2627) AND @ResultCode = ''
        BEGIN
            SET @ResultCode = 'IDEMPOTENCY_IN_PROGRESS';
            SET @ResultMsg = N'Yêu cầu trùng đang được xử lý. Vui lòng chờ và tải lại trang.';
        END
        ELSE IF ERROR_NUMBER() BETWEEN 52001 AND 52013
        BEGIN
            /* @ResultCode/@ResultMsg đã được set ngay trước THROW; biến vẫn giữ giá trị sau
               ROLLBACK nên không cần suy đoán lại từ thông điệp lỗi. */
            IF @ResultCode = '' SET @ResultCode = 'TRANSITION_FAILED';
            IF @ResultMsg = N'' SET @ResultMsg = @InternalError;
        END
        ELSE
        BEGIN
            SET @ResultCode = 'SYSTEM_ERROR';
            SET @ResultMsg = N'Hệ thống chưa thể đổi trạng thái đơn. Mã đối soát: ' + @RequestID;
        END;
        GOTO ReturnFailure;
    END CATCH;

    SELECT @DocumentID AS DocumentID, @ResultMsg AS Msg, 5 AS MsgType, @RequestID AS RequestID,
           CAST(0 AS BIT) AS IsReplay, @NewStatusID AS StatusID;
    RETURN;

ReturnFailure:
    DECLARE @DocumentIDForAudit VARCHAR(100) = NULLIF(@DocumentID, '');
    SET @AuditInfo = N'{"requestId":"' + STRING_ESCAPE(COALESCE(@RequestID, ''), 'json')
        + N'","action":"' + STRING_ESCAPE(COALESCE(@Action, ''), 'json')
        + N'","documentId":"' + STRING_ESCAPE(COALESCE(@DocumentID, ''), 'json')
        + N'","fromStatusID":' + COALESCE(CAST(@ExpectedStatusID AS VARCHAR(20)), 'null')
        + N',"toStatusID":' + COALESCE(CAST(@NewStatusID AS VARCHAR(20)), 'null')
        + N',"resultCode":"' + STRING_ESCAPE(COALESCE(@ResultCode, 'UNKNOWN'), 'json')
        + N'","outcome":"FAILED"'
        + CASE WHEN @InternalError <> N'' THEN N',"internalError":"' + STRING_ESCAPE(LEFT(@InternalError, 1000), 'json') + N'"' ELSE N'' END
        + N'}';
    BEGIN TRY
        IF @ResultCode <> 'AUDIT_UNAVAILABLE' AND @Username <> '' AND OBJECT_ID('dbo.AI_WriteAuditLog', 'P') IS NOT NULL
            EXEC dbo.AI_WriteAuditLog @Username = @Username, @ActionType = 'ORDER_APPROVAL_TRANSITION_FAILED',
                 @TargetEntity = 'API_DonHang_ApproveTransition_AI', @TargetID = @DocumentIDForAudit, @ExtraInfo = @AuditInfo;
    END TRY
    BEGIN CATCH
        SET @ResultCode = 'AUDIT_WRITE_FAILED';
        SET @ResultMsg = N'Không thể ghi audit. Không có thay đổi nào được lưu. Mã đối soát: ' + COALESCE(@RequestID, '');
    END CATCH;
    SELECT NULL AS DocumentID, @ResultMsg AS Msg, 1 AS MsgType, NULLIF(@RequestID, '') AS RequestID, @ResultCode AS Code;
END;
GO
