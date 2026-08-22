SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  ORDER-APPROVAL-002 (điểm "Đơn nháp/Gửi duyệt" + "Hủy đơn") — proc SUBMIT (-1 -> 0) và
  CANCEL (nhiều trạng thái -> 10) cho CHÍNH CHỦ ĐƠN, cộng đường kế toán/quản lý như
  Duyệt/Từ chối. Đây là proc MỚI, KHÔNG sửa dbo.API_DonHang_ApproveTransition_AI — vì proc
  đó có maker-checker mặc định CHẶN chủ đơn tự thao tác (đúng cho Duyệt/Từ chối), ngược hoàn
  toàn với nhu cầu ở đây (chủ đơn tự gửi duyệt/hủy đơn của chính mình).

  Không hard-code ma trận transition hay danh sách vai trò kế toán/quản lý — TÁI DÙNG nguyên
  dbo.AI_OrderApprovalTransitionFnc / dbo.AI_OrderApprovalRoleFnc đã có sẵn
  (sql/ORDER-APPROVAL-003_Approval_Contract_AI.sql), chỉ gọi không sửa. Vì các dòng vai trò
  kế toán/quản lý dùng ActionCode='*', một khi được APPROVED cho APPROVE/REJECT thì tự động
  cũng áp dụng cho SUBMIT/CANCEL — không cần khai báo lại. Ma trận SUBMIT/CANCEL nằm ở DỮ LIỆU
  (sql/ORDER-APPROVAL-004_Submit_Cancel_Contract_Seed_AI.sql), hiện đang DRAFT, nên proc này
  CŨNG fail-closed (INVALID_TRANSITION) cho tới khi có sign-off riêng cho 2 ActionCode này —
  đúng tinh thần "không còn transition/quyền chưa được business quyết định" của
  ORDER-APPROVAL-002.

  Quyền chủ đơn (AR_OrderTbl.UserCreate = @Username) LUÔN BẬT SẴN, không cần nằm trong bảng vai
  trò chờ sign-off như kế toán/quản lý — đây là sự thật cấu trúc (ai tạo đơn), phạm vi hẹp
  (chỉ đơn của chính họ), không phải một quyền cần business quyết định thêm.

  Khung idempotency/audit/ERP-log mượn nguyên từ API_DonHang_ApproveTransition_AI (đã kiểm
  chứng: replay-check phải chạy TRƯỚC staleness-check, nếu không request lặp hợp lệ của chính
  lần gọi đã thành công trước đó sẽ bị báo nhầm STATUS_CHANGED).
*/
CREATE OR ALTER PROCEDURE dbo.API_DonHang_OwnerTransition_AI
    @Username          VARCHAR(50) = '',
    @DocumentID        VARCHAR(50) = '',
    @Action            VARCHAR(20) = '',   -- SUBMIT / CANCEL
    @ExpectedStatusID  INT = NULL,
    @IdempotencyKey    VARCHAR(128) = '',
    @RequestID         VARCHAR(100) = ''
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ResultMsg NVARCHAR(500) = N'';
    DECLARE @ResultCode VARCHAR(60) = '';
    DECLARE @ApiCode VARCHAR(100) = 'API_DonHang_OwnerTransition_AI';
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

    /* ── 1. Tham số và hạ tầng bắt buộc ─────────────────────────────────────────────── */
    IF NOT EXISTS (SELECT 1 FROM dbo.SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SET @ResultCode = 'INVALID_USER';
        SET @ResultMsg = N'Tài khoản không tồn tại hoặc đã bị khóa.';
        GOTO ReturnFailure;
    END;
    IF @Action NOT IN ('SUBMIT', 'CANCEL')
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
        SET @ResultMsg = N'Thiếu trạng thái hiện tại để đối chiếu (tránh thao tác nhầm đơn đã đổi trạng thái).';
        GOTO ReturnFailure;
    END;
    IF LEN(@IdempotencyKey) < 8 OR LEN(@IdempotencyKey) > 128 OR @IdempotencyKey LIKE '%[^A-Za-z0-9._:-]%'
    BEGIN
        SET @ResultCode = 'IDEMPOTENCY_KEY_REQUIRED';
        SET @ResultMsg = N'Yêu cầu thiếu khóa chống gửi lặp hợp lệ.';
        GOTO ReturnFailure;
    END;
    IF LEN(@RequestID) < 8 OR LEN(@RequestID) > 100 OR @RequestID LIKE '%[^A-Za-z0-9._:-]%'
    BEGIN
        SET @ResultCode = 'REQUEST_ID_REQUIRED';
        SET @ResultMsg = N'Yêu cầu thiếu mã request hợp lệ.';
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
    IF OBJECT_ID('dbo.AI_OrderApprovalTransitionFnc', 'IF') IS NULL OR OBJECT_ID('dbo.AI_OrderApprovalRoleFnc', 'IF') IS NULL
    BEGIN
        SET @ResultCode = 'APPROVAL_CONTRACT_UNAVAILABLE';
        SET @ResultMsg = N'Chưa cài đặt bảng hợp đồng duyệt đơn. Không đổi trạng thái đơn. Mã đối soát: ' + @RequestID;
        GOTO ReturnFailure;
    END;

    /* ── 2. Đơn phải tồn tại (đọc trước, bất kể replay hay không) ───────────────────── */
    DECLARE @OrderBranchID VARCHAR(50) = NULL;
    DECLARE @CurrentStatusID INT = NULL;
    DECLARE @OrderUserCreate VARCHAR(30) = '';

    IF NOT EXISTS (SELECT 1 FROM dbo.AR_OrderTbl WHERE DocumentID = @DocumentID)
    BEGIN
        SET @ResultCode = 'ORDER_NOT_FOUND';
        SET @ResultMsg = N'Không tìm thấy đơn hàng.';
        GOTO ReturnFailure;
    END;
    SELECT @OrderBranchID = COALESCE(BranchID, ''), @CurrentStatusID = StatusID, @OrderUserCreate = COALESCE(UserCreate, '')
    FROM dbo.AR_OrderTbl WHERE DocumentID = @DocumentID;

    /* ── 3. Quyền: chủ đơn (luôn bật) HOẶC vai trò kế toán/quản lý (tái dùng hàm chung) ── */
    DECLARE @IsOwner BIT = CASE WHEN UPPER(@OrderUserCreate) = UPPER(@Username) THEN 1 ELSE 0 END;

    DECLARE @ScopeRule VARCHAR(30) = NULL;
    DECLARE @ActorBranchID VARCHAR(50) = '';
    SELECT @ActorBranchID = COALESCE(BranchID, '') FROM dbo.SY_User WHERE UserName = @Username;
    SELECT TOP (1) @ScopeRule = ScopeRule FROM dbo.AI_OrderApprovalRoleFnc(@Username, @Action, @AsOf);

    DECLARE @RoleAllows BIT = CASE
        WHEN @ScopeRule IS NULL THEN 0
        WHEN @ScopeRule = 'GLOBAL' THEN 1
        WHEN @ScopeRule = 'BRANCH_MATCH' AND @ActorBranchID <> '' AND @ActorBranchID = @OrderBranchID THEN 1
        ELSE 0
    END;

    IF @IsOwner = 0 AND @RoleAllows = 0
    BEGIN
        SET @ResultCode = 'FORBIDDEN_ROLE';
        SET @ResultMsg = CASE WHEN @Action = 'SUBMIT'
            THEN N'Chỉ người tạo đơn hoặc kế toán/quản lý cùng chi nhánh mới được gửi duyệt.'
            ELSE N'Chỉ người tạo đơn hoặc kế toán/quản lý cùng chi nhánh mới được hủy đơn.' END;
        GOTO ReturnFailure;
    END;

    /* ── 4. Transition hợp lệ theo hợp đồng (tái dùng hàm chung, KHÔNG hard-code) ────── */
    DECLARE @NewStatusID INT = NULL;
    DECLARE @RequireReason BIT = 0;
    DECLARE @TransitionContractVersion VARCHAR(30) = NULL;
    DECLARE @TransitionMatchCount INT = 0;

    SELECT @NewStatusID = ToStatusID, @RequireReason = RequireReason,
           @TransitionContractVersion = ContractVersion, @TransitionMatchCount = MatchCount
    FROM dbo.AI_OrderApprovalTransitionFnc(@Action, @ExpectedStatusID, @AsOf);

    IF @TransitionMatchCount > 1
    BEGIN
        SET @ResultCode = 'APPROVAL_CONTRACT_AMBIGUOUS';
        SET @ResultMsg = N'Hợp đồng đang có nhiều transition mâu thuẫn cho cùng một trạng thái. Không đổi trạng thái đơn. Mã đối soát: ' + @RequestID;
        GOTO ReturnFailure;
    END;
    IF @NewStatusID IS NULL
    BEGIN
        SET @ResultCode = 'INVALID_TRANSITION';
        SET @ResultMsg = N'Không thể ' + (CASE WHEN @Action = 'SUBMIT' THEN N'gửi duyệt' ELSE N'hủy' END)
            + N' đơn từ trạng thái ExpectedStatusID=' + CAST(@ExpectedStatusID AS VARCHAR(20)) + N'.';
        GOTO ReturnFailure;
    END;
    /* Proc này không nhận @Reason — nếu tương lai có dòng transition SUBMIT/CANCEL nào bật
       RequireReason=1 thì fail-closed thay vì âm thầm bỏ qua lý do bắt buộc. */
    IF @RequireReason = 1
    BEGIN
        SET @ResultCode = 'REASON_NOT_SUPPORTED';
        SET @ResultMsg = N'Transition này yêu cầu lý do nhưng proc chưa hỗ trợ nhập lý do. Mã đối soát: ' + @RequestID;
        GOTO ReturnFailure;
    END;

    /* ── 5. Idempotency ─────────────────────────────────────────────────────────────── */
    SET @IdempotencyKeyHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), @IdempotencyKey)), 2));
    SET @VerifiedUserHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), LOWER(@Username))), 2));
    SET @RequestFingerprintHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX),
        CONCAT(LOWER(@Username), '|', @DocumentID, '|', @Action, '|', @ExpectedStatusID, '|', @NewStatusID,
               '|', COALESCE(@TransitionContractVersion, '')))), 2));

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

    /* Không phải replay của request đã hoàn tất trước đó -> mới thật sự so trạng thái sống
       với ExpectedStatusID (thứ tự này bắt buộc, xem comment đầu file). */
    IF @CurrentStatusID <> @ExpectedStatusID
    BEGIN
        SET @ResultCode = 'STATUS_CHANGED';
        SET @ResultMsg = N'Trạng thái đơn đã thay đổi so với màn hình đang xem. Vui lòng tải lại.';
        GOTO ReturnFailure;
    END;

    /* ── 6. Transaction ghi ──────────────────────────────────────────────────────────── */
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
                SET @ResultMsg = N'Khóa gửi lặp đã được dùng cho một nội dung khác.';
                THROW 53001, @ResultMsg, 1;
            END;
            IF @StoredStatus = 'COMPLETED'
            BEGIN
                COMMIT TRANSACTION;
                SELECT @DocumentID AS DocumentID, N'Đã xử lý trước đó' AS Msg, 5 AS MsgType,
                       @RequestID AS RequestID, CAST(1 AS BIT) AS IsReplay;
                RETURN;
            END;
            SET @ResultMsg = N'Yêu cầu trùng đang được xử lý. Vui lòng chờ và tải lại trang.';
            THROW 53002, @ResultMsg, 1;
        END;

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
            SET @ResultMsg = N'Trạng thái đơn đã thay đổi so với màn hình đang xem. Vui lòng tải lại.';
            THROW 53003, @ResultMsg, 1;
        END;

        /* Hook ERP ghi AR_OrderLogTbl trong cùng transaction — không tự INSERT tay. */
        EXEC dbo.AR_OrderLog_Stp @DocumentID = @DocumentID, @User = @Username, @Completed = 0;

        SELECT @LogRowsAfter = COUNT(*) FROM dbo.AR_OrderLogTbl WHERE DocumentID = @DocumentID;
        SELECT TOP (1) @LastLogStatusID = StatusID FROM dbo.AR_OrderLogTbl WHERE DocumentID = @DocumentID ORDER BY StatusDate DESC;

        SET @OrderLogOutcome = CASE
            WHEN @LogRowsAfter > @LogRowsBefore THEN 'WRITTEN'
            WHEN @LastLogStatusID = @NewStatusID THEN 'DEDUPED'
            ELSE 'MISSING'
        END;

        IF @OrderLogOutcome = 'MISSING'
        BEGIN
            SET @ResultMsg = N'Không ghi được lịch sử trạng thái đơn. Không có thay đổi nào được lưu. Mã đối soát: ' + @RequestID;
            THROW 53004, @ResultMsg, 1;
        END;

        SET @ResultMsg = N'Đã cập nhật trạng thái đơn hàng: '
            + COALESCE((SELECT StatusName FROM dbo.AR_OrderStatusTbl WHERE StatusID = @NewStatusID),
                       N'#' + CAST(@NewStatusID AS NVARCHAR(20)))
            + N'.';

        UPDATE dbo.AI_API_MutationIdempotency
        SET Status = 'COMPLETED', ResultEntityID = @DocumentID, ResultMsg = @ResultMsg, ResultMsgType = 5,
            LastRequestID = @RequestID, UpdatedAt = SYSUTCDATETIME(), CompletedAt = SYSUTCDATETIME()
        WHERE IdempotencyKeyHash = @IdempotencyKeyHash AND VerifiedUserHash = @VerifiedUserHash AND ApiCode = @ApiCode;

        SET @AuditInfo = N'{"requestId":"' + STRING_ESCAPE(@RequestID, 'json')
            + N'","action":"' + @Action
            + N'","isOwner":' + CAST(@IsOwner AS VARCHAR(1))
            + N',"scopeRule":"' + STRING_ESCAPE(COALESCE(@ScopeRule, ''), 'json')
            + N'","fromStatusID":' + CAST(@ExpectedStatusID AS VARCHAR(20))
            + N',"toStatusID":' + CAST(@NewStatusID AS VARCHAR(20))
            + N',"branchId":"' + STRING_ESCAPE(@OrderBranchID, 'json')
            + N'","orderLog":"' + @OrderLogOutcome
            + N'","outcome":"COMPLETED"}';
        EXEC dbo.AI_WriteAuditLog @Username = @Username, @ActionType = 'ORDER_OWNER_TRANSITION',
             @TargetEntity = @ApiCode, @TargetID = @DocumentID, @ExtraInfo = @AuditInfo;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        SET @InternalError = ERROR_MESSAGE();
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627) AND @ResultCode = ''
        BEGIN
            SET @ResultCode = 'IDEMPOTENCY_IN_PROGRESS';
            SET @ResultMsg = N'Yêu cầu trùng đang được xử lý. Vui lòng chờ và tải lại trang.';
        END
        ELSE IF ERROR_NUMBER() BETWEEN 53001 AND 53004
        BEGIN
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
    SET @AuditInfo = N'{"requestId":"' + STRING_ESCAPE(COALESCE(@RequestID, ''), 'json')
        + N'","action":"' + STRING_ESCAPE(COALESCE(@Action, ''), 'json')
        + N'","documentId":"' + STRING_ESCAPE(COALESCE(@DocumentID, ''), 'json')
        + N'","resultCode":"' + STRING_ESCAPE(COALESCE(@ResultCode, 'UNKNOWN'), 'json')
        + N'","outcome":"FAILED"'
        + CASE WHEN @InternalError <> N'' THEN N',"internalError":"' + STRING_ESCAPE(LEFT(@InternalError, 1000), 'json') + N'"' ELSE N'' END
        + N'}';
    BEGIN TRY
        IF @ResultCode <> 'AUDIT_UNAVAILABLE' AND @Username <> '' AND OBJECT_ID('dbo.AI_WriteAuditLog', 'P') IS NOT NULL
            EXEC dbo.AI_WriteAuditLog @Username = @Username, @ActionType = 'ORDER_OWNER_TRANSITION_FAILED',
                 @TargetEntity = 'API_DonHang_OwnerTransition_AI', @TargetID = NULL, @ExtraInfo = @AuditInfo;
    END TRY
    BEGIN CATCH
        SET @ResultCode = 'AUDIT_WRITE_FAILED';
        SET @ResultMsg = N'Không thể ghi audit. Không có thay đổi nào được lưu. Mã đối soát: ' + COALESCE(@RequestID, '');
    END CATCH;
    SELECT NULL AS DocumentID, @ResultMsg AS Msg, 1 AS MsgType, NULLIF(@RequestID, '') AS RequestID, @ResultCode AS Code;
END;
GO
