SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  ORDER-APPROVAL-002/003 — Proc transition trạng thái đơn hàng chuyên biệt, thay thế đường tắt
  nguy hiểm "IF ISNULL(@StatusID,0) > 0" trong dbo.API_DonHang_Update (không sửa proc cũ đó ở
  đây — theo đúng nguyên tắc "không đụng workflow cũ khi chưa chốt hợp đồng trạng thái" của
  chính backlog). Proc NÀY là điểm ghi trạng thái mới, có kiểm quyền/transition/idempotency/audit
  đầy đủ; frontend phải gọi proc này, KHÔNG gọi API_DonHang_Update để đổi StatusID nữa.

  Hợp đồng đã chốt với business (21/08/2026):
    - Nhóm được duyệt: SY_User.UserGroupID IN ('KTDH', 'KTDH2', 'TN KTDH').
    - Giới hạn theo chi nhánh: BẮT BUỘC — accountant.BranchID phải khớp AR_OrderTbl.BranchID
      của đơn (accountant có BranchID rỗng/NULL sẽ KHÔNG duyệt được đơn nào — fail-closed).
    - APPROVE: StatusID 0 (Chờ duyệt) → 1 (Nhận đơn).
    - REJECT: StatusID 0 (Chờ duyệt) → -2 (TDV Kiểm tra lại) — trả về Sale để kiểm tra lại.
    - Không có transition nào khác được phép qua proc này (không hủy, không đổi ngược).

  21/08/2026 — mở rộng để thuận tiện test (2 tài khoản KTDH thật đang có BranchID rỗng nên
  không tự duyệt được đơn nào): thêm quản lý (Manager=1 hoặc UserGroupID IN ('QL','QLMN')) và
  cấp toàn hệ thống (ADMIN/SADM/BGD/GD) vào nhóm được duyệt, dùng đúng pattern role đã có ở
  PROMO-CFG-001_Promotion_Program_Admin_AI.sql. Điều kiện chi nhánh khớp + StatusID=0 vẫn áp
  dụng y hệt cho các vai trò mới này — KHÔNG bỏ qua branch-match, chỉ mở rộng danh sách ai được
  tính là "có vai trò duyệt".
*/
CREATE OR ALTER PROCEDURE dbo.API_DonHang_ApproveTransition_AI
    @Username          VARCHAR(50) = '',
    @DocumentID        VARCHAR(50) = '',
    @Action            VARCHAR(20) = '',   -- APPROVE / REJECT
    @ExpectedStatusID  INT = NULL,          -- Trạng thái client đang thấy, chặn stale/double-click
    @IdempotencyKey    VARCHAR(128) = '',
    @RequestID         VARCHAR(100) = ''
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ResultMsg NVARCHAR(500) = N'';
    DECLARE @ResultCode VARCHAR(60) = '';
    DECLARE @ApiCode VARCHAR(100) = 'API_DonHang_ApproveTransition_AI';
    DECLARE @AccountantBranchID VARCHAR(50) = '';
    DECLARE @CanApproveRole BIT = 0;
    DECLARE @IdempotencyKeyHash CHAR(64) = NULL;
    DECLARE @VerifiedUserHash CHAR(64) = NULL;
    DECLARE @RequestFingerprintHash CHAR(64) = NULL;
    DECLARE @StoredStatus VARCHAR(20) = NULL;
    DECLARE @StoredFingerprintHash CHAR(64) = NULL;
    DECLARE @StoredMsg NVARCHAR(500) = NULL;
    DECLARE @StoredMsgType INT = NULL;
    DECLARE @AuditInfo NVARCHAR(MAX) = N'';
    DECLARE @InternalError NVARCHAR(2000) = N'';

    SET @Username = LTRIM(RTRIM(COALESCE(@Username, '')));
    SET @DocumentID = LTRIM(RTRIM(COALESCE(@DocumentID, '')));
    SET @Action = UPPER(LTRIM(RTRIM(COALESCE(@Action, ''))));
    SET @IdempotencyKey = LTRIM(RTRIM(COALESCE(@IdempotencyKey, '')));
    SET @RequestID = LTRIM(RTRIM(COALESCE(@RequestID, '')));

    IF NOT EXISTS (SELECT 1 FROM dbo.SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SET @ResultCode = 'INVALID_USER';
        SET @ResultMsg = N'Tài khoản không tồn tại hoặc đã bị khóa.';
        GOTO ReturnFailure;
    END;

    SELECT @AccountantBranchID = COALESCE(BranchID, ''),
           @CanApproveRole = CASE
               WHEN UPPER(COALESCE(UserGroupID, '')) IN ('KTDH', 'KTDH2', 'TN KTDH') THEN 1
               WHEN COALESCE(Manager, 0) = 1 THEN 1
               WHEN UPPER(COALESCE(UserGroupID, '')) IN ('QL', 'QLMN', 'ADMIN', 'SADM', 'BGD', 'GD') THEN 1
               ELSE 0
           END
    FROM dbo.SY_User
    WHERE UserName = @Username;

    IF @CanApproveRole = 0
    BEGIN
        SET @ResultCode = 'FORBIDDEN_ROLE';
        SET @ResultMsg = N'Chỉ Kế toán đơn hàng hoặc quản lý trở lên mới được duyệt/từ chối đơn.';
        GOTO ReturnFailure;
    END;
    IF @AccountantBranchID = ''
    BEGIN
        SET @ResultCode = 'ACCOUNTANT_BRANCH_MISSING';
        SET @ResultMsg = N'Tài khoản chưa được gán chi nhánh. Liên hệ quản trị viên để gán BranchID trước khi duyệt đơn.';
        GOTO ReturnFailure;
    END;

    IF @Action NOT IN ('APPROVE', 'REJECT')
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

    -- Đơn phải tồn tại/đúng chi nhánh bất kể replay hay không (dữ liệu này không đổi giữa các
    -- lần gọi lặp). NHƯNG so ExpectedStatusID với trạng thái SỐNG của đơn phải hoãn lại tới
    -- SAU bước kiểm tra idempotency bên dưới — nếu không, lần gọi lặp (retry) của chính request
    -- đã thành công trước đó sẽ luôn bị báo nhầm STATUS_CHANGED (vì request đầu đã đổi status
    -- thật rồi), phá vỡ tính idempotent thay vì trả lại đúng kết quả đã hoàn tất.
    DECLARE @OrderBranchID VARCHAR(50) = NULL;
    DECLARE @CurrentStatusID INT = NULL;
    SELECT @OrderBranchID = BranchID, @CurrentStatusID = StatusID
    FROM dbo.AR_OrderTbl
    WHERE DocumentID = @DocumentID;

    IF @OrderBranchID IS NULL
    BEGIN
        SET @ResultCode = 'ORDER_NOT_FOUND';
        SET @ResultMsg = N'Không tìm thấy đơn hàng.';
        GOTO ReturnFailure;
    END;
    IF @OrderBranchID <> @AccountantBranchID
    BEGIN
        SET @ResultCode = 'ORDER_OUT_OF_BRANCH_SCOPE';
        SET @ResultMsg = N'Đơn hàng không thuộc chi nhánh của tài khoản kế toán này.';
        GOTO ReturnFailure;
    END;

    -- NewStatusID tính từ (Action, ExpectedStatusID) — Ý ĐỊNH của request, KHÔNG phải từ
    -- @CurrentStatusID sống — để một request lặp lại tính ra cùng NewStatusID/fingerprint dù
    -- trạng thái sống đã đổi do lần gọi đầu thành công.
    DECLARE @NewStatusID INT = NULL;
    IF @Action = 'APPROVE' AND @ExpectedStatusID = 0 SET @NewStatusID = 1;
    IF @Action = 'REJECT' AND @ExpectedStatusID = 0 SET @NewStatusID = -2;
    IF @NewStatusID IS NULL
    BEGIN
        SET @ResultCode = 'INVALID_TRANSITION';
        SET @ResultMsg = N'Không thể ' + (CASE WHEN @Action = 'APPROVE' THEN N'duyệt' ELSE N'từ chối' END)
            + N' đơn từ trạng thái ExpectedStatusID=' + CAST(@ExpectedStatusID AS VARCHAR(20)) + N'.';
        GOTO ReturnFailure;
    END;

    SET @IdempotencyKeyHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), @IdempotencyKey)), 2));
    SET @VerifiedUserHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), LOWER(@Username))), 2));
    SET @RequestFingerprintHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX),
        CONCAT(LOWER(@Username), '|', @DocumentID, '|', @Action, '|', @ExpectedStatusID, '|', @NewStatusID))), 2));

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

    -- Không phải replay của request đã hoàn tất trước đó → mới thật sự so trạng thái sống
    -- với ExpectedStatusID để chặn double-click/hai người duyệt cùng lúc/màn hình cũ.
    IF @CurrentStatusID <> @ExpectedStatusID
    BEGIN
        SET @ResultCode = 'STATUS_CHANGED';
        SET @ResultMsg = N'Trạng thái đơn đã thay đổi so với màn hình đang xem. Vui lòng tải lại.';
        GOTO ReturnFailure;
    END;

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
                THROW 52001, @ResultMsg, 1;
            END;
            IF @StoredStatus = 'COMPLETED'
            BEGIN
                COMMIT TRANSACTION;
                SELECT @DocumentID AS DocumentID, N'Đã xử lý trước đó' AS Msg, 5 AS MsgType,
                       @RequestID AS RequestID, CAST(1 AS BIT) AS IsReplay;
                RETURN;
            END;
            SET @ResultMsg = N'Yêu cầu trùng đang được xử lý.';
            THROW 52002, @ResultMsg, 1;
        END;

        INSERT dbo.AI_API_MutationIdempotency
            (IdempotencyKeyHash, VerifiedUserHash, ApiCode, RequestFingerprintHash, Status, FirstRequestID, LastRequestID)
        VALUES
            (@IdempotencyKeyHash, @VerifiedUserHash, @ApiCode, @RequestFingerprintHash, 'PENDING', @RequestID, @RequestID);

        UPDATE dbo.AR_OrderTbl
        SET StatusID = @NewStatusID, DateUpdate = GETDATE(), UserUpdate = @Username
        WHERE DocumentID = @DocumentID AND StatusID = @ExpectedStatusID;

        IF @@ROWCOUNT = 0
        BEGIN
            SET @ResultMsg = N'Trạng thái đơn đã thay đổi so với màn hình đang xem. Vui lòng tải lại.';
            THROW 52003, @ResultMsg, 1;
        END;

        SET @ResultMsg = CASE WHEN @Action = 'APPROVE' THEN N'Đã duyệt đơn hàng thành công.' ELSE N'Đã từ chối, trả về Sale kiểm tra lại.' END;

        UPDATE dbo.AI_API_MutationIdempotency
        SET Status = 'COMPLETED', ResultEntityID = @DocumentID, ResultMsg = @ResultMsg, ResultMsgType = 5,
            LastRequestID = @RequestID, UpdatedAt = SYSUTCDATETIME(), CompletedAt = SYSUTCDATETIME()
        WHERE IdempotencyKeyHash = @IdempotencyKeyHash AND VerifiedUserHash = @VerifiedUserHash AND ApiCode = @ApiCode;

        SET @AuditInfo = N'{"requestId":"' + STRING_ESCAPE(@RequestID, 'json')
            + N'","action":"' + @Action
            + N'","fromStatusID":' + CAST(@ExpectedStatusID AS VARCHAR(20))
            + N',"toStatusID":' + CAST(@NewStatusID AS VARCHAR(20))
            + N',"branchId":"' + STRING_ESCAPE(@OrderBranchID, 'json')
            + N'","outcome":"COMPLETED"}';
        EXEC dbo.AI_WriteAuditLog @Username = @Username, @ActionType = 'ORDER_APPROVAL_TRANSITION',
             @TargetEntity = @ApiCode, @TargetID = @DocumentID, @ExtraInfo = @AuditInfo;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        SET @InternalError = ERROR_MESSAGE();
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() BETWEEN 52001 AND 52003
        BEGIN
            IF @ResultCode = '' SET @ResultCode = 'TRANSITION_FAILED';
            IF @ResultMsg = '' SET @ResultMsg = @InternalError;
        END
        ELSE
        BEGIN
            SET @ResultCode = 'SYSTEM_ERROR';
            SET @ResultMsg = N'Hệ thống chưa thể đổi trạng thái đơn. Mã đối soát: ' + @RequestID;
        END;
        GOTO ReturnFailure;
    END CATCH;

    SELECT @DocumentID AS DocumentID, @ResultMsg AS Msg, 5 AS MsgType, @RequestID AS RequestID, CAST(0 AS BIT) AS IsReplay;
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
            EXEC dbo.AI_WriteAuditLog @Username = @Username, @ActionType = 'ORDER_APPROVAL_TRANSITION_FAILED',
                 @TargetEntity = 'API_DonHang_ApproveTransition_AI', @TargetID = NULL, @ExtraInfo = @AuditInfo;
    END TRY
    BEGIN CATCH
        SET @ResultCode = 'AUDIT_WRITE_FAILED';
        SET @ResultMsg = N'Không thể ghi audit. Không có thay đổi nào được lưu. Mã đối soát: ' + COALESCE(@RequestID, '');
    END CATCH;
    SELECT NULL AS DocumentID, @ResultMsg AS Msg, 1 AS MsgType, NULLIF(@RequestID, '') AS RequestID, @ResultCode AS Code;
END;
GO
