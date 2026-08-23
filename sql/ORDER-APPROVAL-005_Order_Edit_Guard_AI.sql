/*
  ORDER-APPROVAL-005 — Sửa đơn: chỉ người duyệt, chỉ khi còn Chờ duyệt.

  QUYẾT ĐỊNH NGHIỆP VỤ (khách xác nhận 21/08/2026, qua trao đổi với Nguyễn Hoàng Đăng):
    - Kế toán làm toàn bộ bên PMKT; app chỉ theo dõi đơn. Trước mắt CHƯA nối hệ thống kia
      nên vẫn giữ nút duyệt trong app cho tiện, sẽ dời sau.
    - Bỏ đơn nháp: tạo đơn là vào Chờ duyệt (StatusID = 0) luôn.
    - Sale gửi đơn xong là HẾT quyền sửa. Chỉ người có vai trò duyệt mới sửa được,
      và chỉ khi đơn còn ở Chờ duyệt.

  VÌ SAO PHẢI LÀM Ở SQL CHỨ KHÔNG PHẢI GATEWAY
  Bản cũ kiểm trạng thái bằng một lệnh gọi HTTP riêng rồi mới forward mutation bằng lệnh gọi
  khác (server.js + order-edit-lock-guard.js). Giữa hai bước đó đơn có thể vừa được duyệt —
  ở app, hoặc bên PMKT, vì cả hai cùng ghi trên AR_OrderTbl. Mutation cũ vẫn chạy.
  Ở đây khoá dòng đơn bằng UPDLOCK/HOLDLOCK rồi mới kiểm và ghi TRONG CÙNG transaction,
  nên không còn khe hở.

  5 PROC ERP CŨ KHÔNG DÙNG QUA GATEWAY NỮA
  API_DonHang_Update / API_DonHangChiTiet_Insert / _Update / _Delete / API_DonHang_Delete
  đều không nhận identity người gọi, không có idempotency, không audit. Chúng bị chặn ở
  gateway; app đi qua 4 proc _AI dưới đây. KHÔNG sửa 5 proc gốc — chúng thuộc ERP dùng chung.
*/
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* ══════════════════════════════════════════════════════════════════════════════════════
   1. HÀM GUARD — một nơi duy nhất trả lời "user này có sửa được đơn này không"
   Dùng chung bởi cả 4 proc ghi lẫn proc đọc ngữ cảnh, để UI và server không thể lệch nhau.
   ══════════════════════════════════════════════════════════════════════════════════════ */
CREATE OR ALTER FUNCTION dbo.AI_OrderEditGuardFnc
(
    @Username   VARCHAR(50),
    @DocumentID VARCHAR(50),
    @AsOf       DATETIME2(0)
)
RETURNS TABLE
AS
RETURN
(
    SELECT
        O.DocumentID,
        O.StatusID,
        COALESCE(O.BranchID, '')   AS OrderBranchID,
        COALESCE(O.UserCreate, '') AS OrderUserCreate,
        COALESCE(U.BranchID, '')   AS ActorBranchID,
        R.ScopeRule,
        CAST(CASE WHEN UPPER(COALESCE(U.UserGroupID, '')) IN ('KTDH', 'KTDH2', 'TN KTDH') THEN 0
                  WHEN R.ScopeRule IS NULL THEN 0 ELSE 1 END AS BIT) AS HasEditRole,
        CanEdit = CAST(CASE
            WHEN UPPER(COALESCE(U.UserGroupID, '')) IN ('KTDH', 'KTDH2', 'TN KTDH') THEN 0
            WHEN O.StatusID <> 0 THEN 0
            WHEN R.ScopeRule IS NULL THEN 0
            WHEN R.ScopeRule = 'GLOBAL' THEN 1
            WHEN R.ScopeRule = 'BRANCH_MATCH'
                 AND COALESCE(U.BranchID, '') <> ''
                 AND COALESCE(U.BranchID, '') = COALESCE(O.BranchID, '') THEN 1
            ELSE 0 END AS BIT),
        /* Thứ tự ưu tiên có chủ ý: trạng thái trước, quyền sau. Đơn đã duyệt mà báo
           "bạn thiếu quyền" là nói sai nguyên nhân — kể cả kế toán cũng không sửa được nữa. */
        BlockCode = CASE
            WHEN UPPER(COALESCE(U.UserGroupID, '')) IN ('KTDH', 'KTDH2', 'TN KTDH') THEN 'ORDER_APP_ROLE_RETIRED'
            WHEN O.StatusID <> 0 THEN 'ORDER_EDIT_LOCKED'
            WHEN R.ScopeRule IS NULL THEN 'ORDER_EDIT_ROLE_REQUIRED'
            WHEN R.ScopeRule = 'BRANCH_MATCH' AND COALESCE(U.BranchID, '') = '' THEN 'EDITOR_BRANCH_MISSING'
            WHEN R.ScopeRule = 'BRANCH_MATCH'
                 AND COALESCE(U.BranchID, '') <> COALESCE(O.BranchID, '') THEN 'ORDER_OUT_OF_BRANCH_SCOPE'
            ELSE '' END,
        BlockMsg = CASE
            WHEN UPPER(COALESCE(U.UserGroupID, '')) IN ('KTDH', 'KTDH2', 'TN KTDH') THEN N'Kế toán thao tác đơn hàng trên PMKT, không sửa đơn trong ứng dụng này.'
            WHEN O.StatusID <> 0 THEN N'Đơn không còn ở trạng thái Chờ duyệt nên không sửa được nữa.'
            WHEN R.ScopeRule IS NULL THEN N'Đơn đã gửi. Chỉ quản lý có quyền trong cùng chi nhánh mới sửa được, vui lòng liên hệ để điều chỉnh.'
            WHEN R.ScopeRule = 'BRANCH_MATCH' AND COALESCE(U.BranchID, '') = '' THEN N'Tài khoản của bạn chưa được gán chi nhánh.'
            WHEN R.ScopeRule = 'BRANCH_MATCH'
                 AND COALESCE(U.BranchID, '') <> COALESCE(O.BranchID, '') THEN N'Đơn thuộc chi nhánh khác.'
            ELSE N'' END
    FROM dbo.AR_OrderTbl O
    LEFT JOIN dbo.SY_User U
           ON U.UserName = @Username AND COALESCE(U.Disable, 0) = 0
    /* Quyền sửa lấy từ CÙNG hợp đồng vai trò với quyền duyệt. CUSTOMER-SEC-001 cấp riêng
       ActionCode='EDIT'; không dùng wildcard để tránh mở nhầm SUBMIT/CANCEL. */
    OUTER APPLY dbo.AI_OrderApprovalRoleFnc(@Username, 'EDIT', @AsOf) R
    WHERE O.DocumentID = @DocumentID
);
GO

/* ══════════════════════════════════════════════════════════════════════════════════════
   2. API ĐỌC — UI hỏi trước khi mở trang sửa
   ══════════════════════════════════════════════════════════════════════════════════════ */
CREATE OR ALTER PROCEDURE dbo.API_DonHang_EditContext_AI
    @Username   VARCHAR(50) = '',
    @DocumentID VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;
    SET @Username = LTRIM(RTRIM(COALESCE(@Username, '')));
    SET @DocumentID = LTRIM(RTRIM(COALESCE(@DocumentID, '')));

    IF NOT EXISTS (SELECT 1 FROM dbo.AR_OrderTbl WHERE DocumentID = @DocumentID)
    BEGIN
        SELECT @DocumentID AS DocumentID, CAST(NULL AS INT) AS StatusID, CAST(0 AS BIT) AS CanEdit,
               'ORDER_NOT_FOUND' AS BlockCode, N'Không tìm thấy đơn hàng.' AS BlockMsg,
               N'Không tìm thấy đơn hàng.' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    SELECT G.DocumentID, G.StatusID, G.CanEdit, G.BlockCode, G.BlockMsg,
           COALESCE(NULLIF(G.BlockMsg, N''), N'Đơn có thể chỉnh sửa.') AS Msg,
           CASE WHEN G.CanEdit = 1 THEN 5 ELSE 1 END AS MsgType
    FROM dbo.AI_OrderEditGuardFnc(@Username, @DocumentID, SYSUTCDATETIME()) G;
END;
GO

/* ══════════════════════════════════════════════════════════════════════════════════════
   3. SỬA HEADER ĐƠN (kèm danh sách sản phẩm)

   Ủy quyền phần ghi cho dbo.API_DonHang_Update — proc ERP đó còn cập nhật kế hoạch đi
   tuyến, CF_ObjectTbl và gọi hook AR_Order_AfterSaveStp. Chép lại logic đó vào đây là
   nhân bản nghiệp vụ ERP, sớm muộn cũng lệch. KHÔNG truyền @StatusID: proc gốc có nhánh
   "@StatusID > 0 thì đổi thẳng trạng thái rồi thoát", bỏ qua mọi kiểm tra.
   ══════════════════════════════════════════════════════════════════════════════════════ */
CREATE OR ALTER PROCEDURE dbo.API_DonHang_EditHeader_AI
    @Username       VARCHAR(50) = '',
    @OldKeyID       VARCHAR(50) = '',
    @BranchID       VARCHAR(50) = '',
    @CeoID          VARCHAR(50) = '',
    @ManagerID      VARCHAR(50) = '',
    @EmployeeID     VARCHAR(50) = '',
    @ObjectID       VARCHAR(50) = '',
    @Memo           NVARCHAR(250) = '',
    @Notes          NVARCHAR(500) = '',
    @ThuDiTuyen     NVARCHAR(10) = '',
    @ItemList       NVARCHAR(MAX) = '',
    @IdempotencyKey VARCHAR(128) = '',
    @RequestID      VARCHAR(100) = ''
AS
BEGIN
    SET NOCOUNT ON;
    /* XACT_ABORT cố ý TẮT. Bật thì mọi THROW làm transaction "doomed" (XACT_STATE = -1),
       lúc đó CATCH chỉ còn cách ROLLBACK TOÀN BỘ — kể cả transaction của người gọi.
       Tắt + dùng savepoint thì proc lồng được vào transaction khác, và bộ kiểm chứng
       chạy-rồi-rollback mới soi được các ca từ chối. Mọi lỗi vẫn được TRY/CATCH bắt. */
    SET XACT_ABORT OFF;

    DECLARE @ApiCode VARCHAR(100) = 'API_DonHang_EditHeader_AI';
    DECLARE @ResultCode VARCHAR(60) = '';
    DECLARE @ResultMsg NVARCHAR(500) = N'';
    DECLARE @Fingerprint NVARCHAR(MAX);
    DECLARE @KeyHash CHAR(64), @UserHash CHAR(64), @FpHash CHAR(64);
    DECLARE @StoredStatus VARCHAR(20) = NULL, @StoredFp CHAR(64) = NULL;
    DECLARE @StatusID INT, @CanEdit BIT, @BlockCode VARCHAR(60), @BlockMsg NVARCHAR(300);
    DECLARE @AuditInfo NVARCHAR(MAX);
    /* 1 = proc tự mở transaction; 0 = đang nằm trong transaction của người gọi. */
    DECLARE @OwnTran BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
    DECLARE @PolicyLockResult INT;

    SET @Username = LTRIM(RTRIM(COALESCE(@Username, '')));
    SET @OldKeyID = LTRIM(RTRIM(COALESCE(@OldKeyID, '')));
    SET @IdempotencyKey = LTRIM(RTRIM(COALESCE(@IdempotencyKey, '')));
    SET @RequestID = LTRIM(RTRIM(COALESCE(@RequestID, '')));

    IF @Username = '' OR @OldKeyID = ''
    BEGIN
        SET @ResultCode = 'INVALID_REQUEST'; SET @ResultMsg = N'Thiếu tài khoản hoặc mã đơn hàng.';
        GOTO Fail;
    END;
    IF LEN(@IdempotencyKey) < 8 OR @IdempotencyKey LIKE '%[^A-Za-z0-9._:-]%'
    BEGIN
        SET @ResultCode = 'IDEMPOTENCY_KEY_REQUIRED'; SET @ResultMsg = N'Thiếu khóa chống gửi lặp hợp lệ.';
        GOTO Fail;
    END;
    IF OBJECT_ID('dbo.AI_API_MutationIdempotency', 'U') IS NULL OR OBJECT_ID('dbo.AI_WriteAuditLog', 'P') IS NULL
    BEGIN
        SET @ResultCode = 'INFRA_UNAVAILABLE'; SET @ResultMsg = N'Hệ thống chống gửi lặp/audit chưa sẵn sàng.';
        GOTO Fail;
    END;

    SET @Fingerprint = CONCAT(LOWER(@Username), '|', @OldKeyID, '|', @BranchID, '|', @CeoID, '|', @ManagerID,
                              '|', @EmployeeID, '|', @ObjectID, '|', COALESCE(@Memo, N''), '|', COALESCE(@Notes, N''),
                              '|', COALESCE(@ThuDiTuyen, N''), '|', COALESCE(@ItemList, N''));
    SET @KeyHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), @IdempotencyKey)), 2));
    SET @UserHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), LOWER(@Username))), 2));
    SET @FpHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), @Fingerprint)), 2));

    CREATE TABLE #ErpResult (Msg NVARCHAR(500), MsgType INT);

    BEGIN TRY
        IF @OwnTran = 1 BEGIN TRANSACTION; ELSE SAVE TRANSACTION OrderEditSP;

        SELECT @StoredStatus = Status, @StoredFp = RequestFingerprintHash
        FROM dbo.AI_API_MutationIdempotency WITH (UPDLOCK, HOLDLOCK)
        WHERE IdempotencyKeyHash = @KeyHash AND VerifiedUserHash = @UserHash AND ApiCode = @ApiCode;

        IF @StoredStatus IS NOT NULL
        BEGIN
            IF @StoredFp <> @FpHash
            BEGIN
                SET @ResultCode = 'IDEMPOTENCY_CONFLICT'; SET @ResultMsg = N'Khóa gửi lặp đã dùng cho nội dung khác.';
                THROW 53001, N'IDEMPOTENCY_CONFLICT', 1;
            END;
            IF @StoredStatus = 'COMPLETED'
            BEGIN
                IF @OwnTran = 1 COMMIT TRANSACTION;
                SELECT N'Đã xử lý trước đó' AS Msg, 5 AS MsgType, @OldKeyID AS DocumentID,
                       @RequestID AS RequestID, CAST(1 AS BIT) AS IsReplay;
                RETURN;
            END;
            SET @ResultCode = 'IDEMPOTENCY_IN_PROGRESS'; SET @ResultMsg = N'Yêu cầu trùng đang được xử lý.';
            THROW 53002, N'IDEMPOTENCY_IN_PROGRESS', 1;
        END;

        EXEC @PolicyLockResult = sys.sp_getapplock
            @Resource = 'AI_ORDER_APPROVAL_POLICY', @LockMode = 'Shared',
            @LockOwner = 'Transaction', @LockTimeout = 15000;
        IF @PolicyLockResult < 0
        BEGIN
            SET @ResultCode = 'APPROVAL_POLICY_BUSY'; SET @ResultMsg = N'Chính sách quyền sửa đang được cập nhật. Vui lòng tải lại.';
            THROW 53006, N'APPROVAL_POLICY_BUSY', 1;
        END;

        /* KHOÁ dòng đơn TRƯỚC khi kiểm. Từ đây tới COMMIT, không ai — kể cả PMKT — đổi được
           StatusID của đơn này. Đây là chỗ đóng lại khe hở của bản kiểm-ở-gateway. */
        SELECT @StatusID = StatusID
        FROM dbo.AR_OrderTbl WITH (UPDLOCK, HOLDLOCK)
        WHERE DocumentID = @OldKeyID;

        IF @StatusID IS NULL
        BEGIN
            SET @ResultCode = 'ORDER_NOT_FOUND'; SET @ResultMsg = N'Không tìm thấy đơn hàng.';
            THROW 53003, N'ORDER_NOT_FOUND', 1;
        END;

        SELECT @CanEdit = CanEdit, @BlockCode = BlockCode, @BlockMsg = BlockMsg
        FROM dbo.AI_OrderEditGuardFnc(@Username, @OldKeyID, SYSUTCDATETIME());

        IF @CanEdit <> 1
        BEGIN
            SET @ResultCode = @BlockCode; SET @ResultMsg = @BlockMsg;
            THROW 53004, N'EDIT_FORBIDDEN', 1;
        END;

        INSERT dbo.AI_API_MutationIdempotency
            (IdempotencyKeyHash, VerifiedUserHash, ApiCode, RequestFingerprintHash, Status, FirstRequestID, LastRequestID)
        VALUES (@KeyHash, @UserHash, @ApiCode, @FpHash, 'PENDING', @RequestID, @RequestID);

        INSERT #ErpResult (Msg, MsgType)
        EXEC dbo.API_DonHang_Update
             @OldKeyID = @OldKeyID, @BranchID = @BranchID, @CeoID = @CeoID, @ManagerID = @ManagerID,
             @EmployeeID = @EmployeeID, @ObjectID = @ObjectID, @Memo = @Memo, @Notes = @Notes,
             @ThuDiTuyen = @ThuDiTuyen, @ItemList = @ItemList, @User = @Username;

        /* Proc ERP báo lỗi nghiệp vụ bằng MsgType=1 chứ không THROW — phải dội ngược ra,
           không được coi là thành công rồi ghi audit sai. */
        IF EXISTS (SELECT 1 FROM #ErpResult WHERE MsgType <> 5)
        BEGIN
            SELECT TOP (1) @ResultMsg = Msg FROM #ErpResult;
            SET @ResultCode = 'ERP_UPDATE_REJECTED';
            THROW 53005, N'ERP_UPDATE_REJECTED', 1;
        END;

        UPDATE dbo.AI_API_MutationIdempotency
        SET Status = 'COMPLETED', ResultEntityID = @OldKeyID, ResultMsg = N'Cập nhật đơn hàng thành công',
            ResultMsgType = 5, LastRequestID = @RequestID, UpdatedAt = SYSUTCDATETIME()
        WHERE IdempotencyKeyHash = @KeyHash AND VerifiedUserHash = @UserHash AND ApiCode = @ApiCode;

        SET @AuditInfo = N'{"requestId":"' + STRING_ESCAPE(@RequestID, 'json')
            + N'","documentId":"' + STRING_ESCAPE(@OldKeyID, 'json')
            + N'","statusId":' + CAST(@StatusID AS VARCHAR(10))
            + N',"payloadFingerprint":"' + @FpHash + N'","outcome":"UPDATED"}';
        EXEC dbo.AI_WriteAuditLog @Username = @Username, @ActionType = 'EDIT_DONHANG_HEADER',
             @TargetEntity = @ApiCode, @TargetID = @OldKeyID, @ExtraInfo = @AuditInfo;

        IF @OwnTran = 1 COMMIT TRANSACTION;

        SELECT N'Cập nhật đơn hàng thành công ' + @OldKeyID AS Msg, 5 AS MsgType,
               @OldKeyID AS DocumentID, @RequestID AS RequestID, CAST(0 AS BIT) AS IsReplay;
        RETURN;
    END TRY
    BEGIN CATCH
        /* Người gọi có transaction riêng thì chỉ lùi về savepoint, không đụng phần của họ. */
        IF @OwnTran = 1
        BEGIN
            IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        END
        ELSE IF XACT_STATE() = 1 ROLLBACK TRANSACTION OrderEditSP;
        IF @ResultCode = '' OR @ResultCode IS NULL
        BEGIN
            SET @ResultCode = CASE WHEN ERROR_NUMBER() IN (2601, 2627) THEN 'IDEMPOTENCY_IN_PROGRESS' ELSE 'EDIT_FAILED' END;
            SET @ResultMsg = CASE WHEN ERROR_NUMBER() IN (2601, 2627)
                                  THEN N'Yêu cầu trùng đang được xử lý.'
                                  ELSE N'Không cập nhật được đơn hàng. Mã đối soát: ' + @RequestID END;
        END;
    END CATCH;

Fail:
    SELECT @ResultMsg AS Msg, 1 AS MsgType, @ResultCode AS Code,
           @OldKeyID AS DocumentID, @RequestID AS RequestID, CAST(0 AS BIT) AS IsReplay;
END;
GO

/* ══════════════════════════════════════════════════════════════════════════════════════
   4. SỬA DÒNG SẢN PHẨM — thêm / sửa / xoá

   Ba proc này KHÔNG ủy quyền cho proc ERP gốc mà tự ghi, vì hai lý do:
     a) Phần ghi của chúng chỉ là một câu lệnh, không có nghiệp vụ ERP nào để nhân bản.
     b) dbo.API_DonHangChiTiet_Insert đang ghi SAI CỘT — xem chú thích ở EditItemInsert.
   ══════════════════════════════════════════════════════════════════════════════════════ */

CREATE OR ALTER PROCEDURE dbo.API_DonHang_EditItemInsert_AI
    @Username        VARCHAR(50) = '',
    @DocumentID      VARCHAR(50) = '',
    @ItemID          VARCHAR(50) = '',
    @Quantity        DECIMAL(18,2) = 0,
    @SoLuongTang     DECIMAL(18,2) = 0,
    @UnitPrice       DECIMAL(18,4) = 0,
    @Amount          DECIMAL(18,0) = 0,
    @DiscountPercent DECIMAL(18,2) = 0,
    @DiscountAmount  DECIMAL(18,0) = 0,
    @DiemSanPham     DECIMAL(18,2) = 0,
    @Notes           NVARCHAR(250) = N'',
    @IdempotencyKey  VARCHAR(128) = '',
    @RequestID       VARCHAR(100) = ''
AS
BEGIN
    SET NOCOUNT ON;
    /* XACT_ABORT cố ý TẮT. Bật thì mọi THROW làm transaction "doomed" (XACT_STATE = -1),
       lúc đó CATCH chỉ còn cách ROLLBACK TOÀN BỘ — kể cả transaction của người gọi.
       Tắt + dùng savepoint thì proc lồng được vào transaction khác, và bộ kiểm chứng
       chạy-rồi-rollback mới soi được các ca từ chối. Mọi lỗi vẫn được TRY/CATCH bắt. */
    SET XACT_ABORT OFF;

    DECLARE @ApiCode VARCHAR(100) = 'API_DonHang_EditItemInsert_AI';
    DECLARE @ResultCode VARCHAR(60) = '', @ResultMsg NVARCHAR(500) = N'';
    DECLARE @KeyHash CHAR(64), @UserHash CHAR(64), @FpHash CHAR(64);
    DECLARE @StoredStatus VARCHAR(20) = NULL, @StoredFp CHAR(64) = NULL, @StoredEntity VARCHAR(100) = NULL;
    DECLARE @StatusID INT, @CanEdit BIT, @BlockCode VARCHAR(60), @BlockMsg NVARCHAR(300);
    DECLARE @NewAutoID VARCHAR(50) = CONVERT(VARCHAR(50), NEWID());
    DECLARE @AuditInfo NVARCHAR(MAX);
    /* 1 = proc tự mở transaction; 0 = đang nằm trong transaction của người gọi. */
    DECLARE @OwnTran BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
    DECLARE @PolicyLockResult INT;

    SET @Username = LTRIM(RTRIM(COALESCE(@Username, '')));
    SET @DocumentID = LTRIM(RTRIM(COALESCE(@DocumentID, '')));
    SET @IdempotencyKey = LTRIM(RTRIM(COALESCE(@IdempotencyKey, '')));
    SET @RequestID = LTRIM(RTRIM(COALESCE(@RequestID, '')));

    IF @Username = '' OR @DocumentID = '' OR COALESCE(@ItemID, '') = ''
    BEGIN SET @ResultCode = 'INVALID_REQUEST'; SET @ResultMsg = N'Thiếu tài khoản, mã đơn hoặc mã sản phẩm.'; GOTO Fail; END;
    IF COALESCE(@Quantity, 0) <= 0
    BEGIN SET @ResultCode = 'INVALID_QUANTITY'; SET @ResultMsg = N'Số lượng phải lớn hơn 0.'; GOTO Fail; END;
    IF LEN(@IdempotencyKey) < 8 OR @IdempotencyKey LIKE '%[^A-Za-z0-9._:-]%'
    BEGIN SET @ResultCode = 'IDEMPOTENCY_KEY_REQUIRED'; SET @ResultMsg = N'Thiếu khóa chống gửi lặp hợp lệ.'; GOTO Fail; END;
    IF OBJECT_ID('dbo.AI_API_MutationIdempotency', 'U') IS NULL OR OBJECT_ID('dbo.AI_WriteAuditLog', 'P') IS NULL
    BEGIN SET @ResultCode = 'INFRA_UNAVAILABLE'; SET @ResultMsg = N'Hệ thống chống gửi lặp/audit chưa sẵn sàng.'; GOTO Fail; END;

    SET @KeyHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), @IdempotencyKey)), 2));
    SET @UserHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), LOWER(@Username))), 2));
    SET @FpHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX),
        CONCAT(LOWER(@Username), '|', @DocumentID, '|', @ItemID, '|', @Quantity, '|', @SoLuongTang,
               '|', @UnitPrice, '|', @Amount, '|', @DiscountPercent, '|', @DiscountAmount,
               '|', @DiemSanPham, '|', COALESCE(@Notes, N'')))), 2));

    BEGIN TRY
        IF @OwnTran = 1 BEGIN TRANSACTION; ELSE SAVE TRANSACTION OrderEditSP;

        SELECT @StoredStatus = Status, @StoredFp = RequestFingerprintHash, @StoredEntity = ResultEntityID
        FROM dbo.AI_API_MutationIdempotency WITH (UPDLOCK, HOLDLOCK)
        WHERE IdempotencyKeyHash = @KeyHash AND VerifiedUserHash = @UserHash AND ApiCode = @ApiCode;

        IF @StoredStatus IS NOT NULL
        BEGIN
            IF @StoredFp <> @FpHash
            BEGIN SET @ResultCode = 'IDEMPOTENCY_CONFLICT'; SET @ResultMsg = N'Khóa gửi lặp đã dùng cho nội dung khác.'; THROW 53101, N'X', 1; END;
            IF @StoredStatus = 'COMPLETED'
            BEGIN
                IF @OwnTran = 1 COMMIT TRANSACTION;
                SELECT N'Đã xử lý trước đó' AS Msg, 5 AS MsgType, @StoredEntity AS UserAutoID,
                       @RequestID AS RequestID, CAST(1 AS BIT) AS IsReplay;
                RETURN;
            END;
            SET @ResultCode = 'IDEMPOTENCY_IN_PROGRESS'; SET @ResultMsg = N'Yêu cầu trùng đang được xử lý.'; THROW 53102, N'X', 1;
        END;

        EXEC @PolicyLockResult = sys.sp_getapplock
            @Resource = 'AI_ORDER_APPROVAL_POLICY', @LockMode = 'Shared',
            @LockOwner = 'Transaction', @LockTimeout = 15000;
        IF @PolicyLockResult < 0
        BEGIN SET @ResultCode = 'APPROVAL_POLICY_BUSY'; SET @ResultMsg = N'Chính sách quyền sửa đang được cập nhật. Vui lòng tải lại.'; THROW 53105, N'X', 1; END;

        SELECT @StatusID = StatusID FROM dbo.AR_OrderTbl WITH (UPDLOCK, HOLDLOCK) WHERE DocumentID = @DocumentID;
        IF @StatusID IS NULL
        BEGIN SET @ResultCode = 'ORDER_NOT_FOUND'; SET @ResultMsg = N'Không tìm thấy đơn hàng.'; THROW 53103, N'X', 1; END;

        SELECT @CanEdit = CanEdit, @BlockCode = BlockCode, @BlockMsg = BlockMsg
        FROM dbo.AI_OrderEditGuardFnc(@Username, @DocumentID, SYSUTCDATETIME());
        IF @CanEdit <> 1
        BEGIN SET @ResultCode = @BlockCode; SET @ResultMsg = @BlockMsg; THROW 53104, N'X', 1; END;

        INSERT dbo.AI_API_MutationIdempotency
            (IdempotencyKeyHash, VerifiedUserHash, ApiCode, RequestFingerprintHash, Status, FirstRequestID, LastRequestID)
        VALUES (@KeyHash, @UserHash, @ApiCode, @FpHash, 'PENDING', @RequestID, @RequestID);

        /* CHÚ Ý — KHÁC dbo.API_DonHangChiTiet_Insert một cách CÓ CHỦ Ý:
           Proc ERP đó ghi lệch cột: danh sách cột kết thúc bằng (..., DiemTichLuy, Notes)
           nhưng danh sách giá trị kết thúc bằng (..., @Notes, Quantity*DiemSanPham) — tức là
           ghi ghi chú vào cột điểm tích lũy và ghi số điểm vào cột ghi chú. Nó cũng không set
           TotalAmount, trong khi API_DonHang_Update và API_DonHangChiTiet_Update đều set.
           Ở đây ghi đúng cột và có TotalAmount. Đã báo để bên ERP xử lý proc gốc. */
        INSERT INTO dbo.AR_OrderDetailTbl
            (UserAutoID, DocumentID, ItemID, Quantity, SoLuongTang, UnitPrice, Amount,
             DiscountPercent, DiscountAmount, TotalAmount, DiemSanPham, DiemTichLuy, Notes)
        VALUES
            (@NewAutoID, @DocumentID, @ItemID, @Quantity, @SoLuongTang, @UnitPrice, @Amount,
             @DiscountPercent, @DiscountAmount, COALESCE(@Amount, 0) - COALESCE(@DiscountAmount, 0),
             @DiemSanPham, COALESCE(@Quantity, 0) * COALESCE(@DiemSanPham, 0), @Notes);

        UPDATE dbo.AI_API_MutationIdempotency
        SET Status = 'COMPLETED', ResultEntityID = @NewAutoID, ResultMsg = N'Đã thêm sản phẩm thành công',
            ResultMsgType = 5, LastRequestID = @RequestID, UpdatedAt = SYSUTCDATETIME()
        WHERE IdempotencyKeyHash = @KeyHash AND VerifiedUserHash = @UserHash AND ApiCode = @ApiCode;

        SET @AuditInfo = N'{"requestId":"' + STRING_ESCAPE(@RequestID, 'json')
            + N'","documentId":"' + STRING_ESCAPE(@DocumentID, 'json')
            + N'","itemId":"' + STRING_ESCAPE(@ItemID, 'json')
            + N'","userAutoId":"' + @NewAutoID + N'","outcome":"INSERTED"}';
        EXEC dbo.AI_WriteAuditLog @Username = @Username, @ActionType = 'EDIT_DONHANG_ITEM_INSERT',
             @TargetEntity = @ApiCode, @TargetID = @DocumentID, @ExtraInfo = @AuditInfo;

        IF @OwnTran = 1 COMMIT TRANSACTION;
        SELECT N'Đã thêm sản phẩm thành công' AS Msg, 5 AS MsgType, @NewAutoID AS UserAutoID,
               @RequestID AS RequestID, CAST(0 AS BIT) AS IsReplay;
        RETURN;
    END TRY
    BEGIN CATCH
        /* Người gọi có transaction riêng thì chỉ lùi về savepoint, không đụng phần của họ. */
        IF @OwnTran = 1
        BEGIN
            IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        END
        ELSE IF XACT_STATE() = 1 ROLLBACK TRANSACTION OrderEditSP;
        IF @ResultCode = '' OR @ResultCode IS NULL
        BEGIN
            SET @ResultCode = CASE WHEN ERROR_NUMBER() IN (2601, 2627) THEN 'IDEMPOTENCY_IN_PROGRESS' ELSE 'EDIT_FAILED' END;
            SET @ResultMsg = N'Không thêm được sản phẩm. Mã đối soát: ' + @RequestID;
        END;
    END CATCH;

Fail:
    SELECT @ResultMsg AS Msg, 1 AS MsgType, @ResultCode AS Code, @RequestID AS RequestID, CAST(0 AS BIT) AS IsReplay;
END;
GO

CREATE OR ALTER PROCEDURE dbo.API_DonHang_EditItemUpdate_AI
    @Username        VARCHAR(50) = '',
    @UserAutoID      VARCHAR(50) = '',
    @ItemID          VARCHAR(50) = '',
    @Quantity        DECIMAL(18,2) = 0,
    @SoLuongTang     DECIMAL(18,2) = 0,
    @UnitPrice       DECIMAL(18,4) = 0,
    @Amount          DECIMAL(18,0) = 0,
    @DiscountPercent DECIMAL(18,2) = 0,
    @DiscountAmount  DECIMAL(18,0) = 0,
    @DiemSanPham     DECIMAL(18,2) = 0,
    @Notes           NVARCHAR(250) = N'',
    @IdempotencyKey  VARCHAR(128) = '',
    @RequestID       VARCHAR(100) = ''
AS
BEGIN
    SET NOCOUNT ON;
    /* XACT_ABORT cố ý TẮT. Bật thì mọi THROW làm transaction "doomed" (XACT_STATE = -1),
       lúc đó CATCH chỉ còn cách ROLLBACK TOÀN BỘ — kể cả transaction của người gọi.
       Tắt + dùng savepoint thì proc lồng được vào transaction khác, và bộ kiểm chứng
       chạy-rồi-rollback mới soi được các ca từ chối. Mọi lỗi vẫn được TRY/CATCH bắt. */
    SET XACT_ABORT OFF;

    DECLARE @ApiCode VARCHAR(100) = 'API_DonHang_EditItemUpdate_AI';
    DECLARE @ResultCode VARCHAR(60) = '', @ResultMsg NVARCHAR(500) = N'';
    DECLARE @KeyHash CHAR(64), @UserHash CHAR(64), @FpHash CHAR(64);
    DECLARE @StoredStatus VARCHAR(20) = NULL, @StoredFp CHAR(64) = NULL;
    DECLARE @DocumentID VARCHAR(50) = NULL, @StatusID INT;
    DECLARE @CanEdit BIT, @BlockCode VARCHAR(60), @BlockMsg NVARCHAR(300);
    DECLARE @AuditInfo NVARCHAR(MAX);
    /* 1 = proc tự mở transaction; 0 = đang nằm trong transaction của người gọi. */
    DECLARE @OwnTran BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
    DECLARE @PolicyLockResult INT;

    SET @Username = LTRIM(RTRIM(COALESCE(@Username, '')));
    SET @UserAutoID = LTRIM(RTRIM(COALESCE(@UserAutoID, '')));
    SET @IdempotencyKey = LTRIM(RTRIM(COALESCE(@IdempotencyKey, '')));
    SET @RequestID = LTRIM(RTRIM(COALESCE(@RequestID, '')));

    IF @Username = '' OR @UserAutoID = '' OR COALESCE(@ItemID, '') = ''
    BEGIN SET @ResultCode = 'INVALID_REQUEST'; SET @ResultMsg = N'Thiếu tài khoản, dòng sản phẩm hoặc mã sản phẩm.'; GOTO Fail; END;
    IF COALESCE(@Quantity, 0) <= 0
    BEGIN SET @ResultCode = 'INVALID_QUANTITY'; SET @ResultMsg = N'Số lượng phải lớn hơn 0.'; GOTO Fail; END;
    IF LEN(@IdempotencyKey) < 8 OR @IdempotencyKey LIKE '%[^A-Za-z0-9._:-]%'
    BEGIN SET @ResultCode = 'IDEMPOTENCY_KEY_REQUIRED'; SET @ResultMsg = N'Thiếu khóa chống gửi lặp hợp lệ.'; GOTO Fail; END;
    IF OBJECT_ID('dbo.AI_API_MutationIdempotency', 'U') IS NULL OR OBJECT_ID('dbo.AI_WriteAuditLog', 'P') IS NULL
    BEGIN SET @ResultCode = 'INFRA_UNAVAILABLE'; SET @ResultMsg = N'Hệ thống chống gửi lặp/audit chưa sẵn sàng.'; GOTO Fail; END;

    SET @KeyHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), @IdempotencyKey)), 2));
    SET @UserHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), LOWER(@Username))), 2));
    SET @FpHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX),
        CONCAT(LOWER(@Username), '|', @UserAutoID, '|', @ItemID, '|', @Quantity, '|', @SoLuongTang,
               '|', @UnitPrice, '|', @Amount, '|', @DiscountPercent, '|', @DiscountAmount,
               '|', @DiemSanPham, '|', COALESCE(@Notes, N'')))), 2));

    BEGIN TRY
        IF @OwnTran = 1 BEGIN TRANSACTION; ELSE SAVE TRANSACTION OrderEditSP;

        SELECT @StoredStatus = Status, @StoredFp = RequestFingerprintHash
        FROM dbo.AI_API_MutationIdempotency WITH (UPDLOCK, HOLDLOCK)
        WHERE IdempotencyKeyHash = @KeyHash AND VerifiedUserHash = @UserHash AND ApiCode = @ApiCode;

        IF @StoredStatus IS NOT NULL
        BEGIN
            IF @StoredFp <> @FpHash
            BEGIN SET @ResultCode = 'IDEMPOTENCY_CONFLICT'; SET @ResultMsg = N'Khóa gửi lặp đã dùng cho nội dung khác.'; THROW 53201, N'X', 1; END;
            IF @StoredStatus = 'COMPLETED'
            BEGIN
                IF @OwnTran = 1 COMMIT TRANSACTION;
                SELECT N'Đã xử lý trước đó' AS Msg, 5 AS MsgType, @UserAutoID AS UserAutoID,
                       @RequestID AS RequestID, CAST(1 AS BIT) AS IsReplay;
                RETURN;
            END;
            SET @ResultCode = 'IDEMPOTENCY_IN_PROGRESS'; SET @ResultMsg = N'Yêu cầu trùng đang được xử lý.'; THROW 53202, N'X', 1;
        END;

        EXEC @PolicyLockResult = sys.sp_getapplock
            @Resource = 'AI_ORDER_APPROVAL_POLICY', @LockMode = 'Shared',
            @LockOwner = 'Transaction', @LockTimeout = 15000;
        IF @PolicyLockResult < 0
        BEGIN SET @ResultCode = 'APPROVAL_POLICY_BUSY'; SET @ResultMsg = N'Chính sách quyền sửa đang được cập nhật. Vui lòng tải lại.'; THROW 53207, N'X', 1; END;

        /* Dòng sản phẩm chỉ có ý nghĩa khi biết nó thuộc đơn nào — resolve rồi mới khoá đơn. */
        SELECT TOP (1) @DocumentID = DocumentID FROM dbo.AR_OrderDetailTbl WHERE UserAutoID = @UserAutoID;
        IF @DocumentID IS NULL
        BEGIN SET @ResultCode = 'ORDER_ITEM_NOT_FOUND'; SET @ResultMsg = N'Không tìm thấy dòng sản phẩm.'; THROW 53203, N'X', 1; END;

        SELECT @StatusID = StatusID FROM dbo.AR_OrderTbl WITH (UPDLOCK, HOLDLOCK) WHERE DocumentID = @DocumentID;
        IF @StatusID IS NULL
        BEGIN SET @ResultCode = 'ORDER_NOT_FOUND'; SET @ResultMsg = N'Không tìm thấy đơn hàng.'; THROW 53204, N'X', 1; END;

        SELECT @CanEdit = CanEdit, @BlockCode = BlockCode, @BlockMsg = BlockMsg
        FROM dbo.AI_OrderEditGuardFnc(@Username, @DocumentID, SYSUTCDATETIME());
        IF @CanEdit <> 1
        BEGIN SET @ResultCode = @BlockCode; SET @ResultMsg = @BlockMsg; THROW 53205, N'X', 1; END;

        INSERT dbo.AI_API_MutationIdempotency
            (IdempotencyKeyHash, VerifiedUserHash, ApiCode, RequestFingerprintHash, Status, FirstRequestID, LastRequestID)
        VALUES (@KeyHash, @UserHash, @ApiCode, @FpHash, 'PENDING', @RequestID, @RequestID);

        UPDATE dbo.AR_OrderDetailTbl
        SET ItemID = @ItemID, Quantity = @Quantity, SoLuongTang = @SoLuongTang, UnitPrice = @UnitPrice,
            Amount = @Amount, DiscountPercent = @DiscountPercent, DiscountAmount = @DiscountAmount,
            TotalAmount = COALESCE(@Amount, 0) - COALESCE(@DiscountAmount, 0),
            DiemSanPham = @DiemSanPham, DiemTichLuy = COALESCE(@Quantity, 0) * COALESCE(@DiemSanPham, 0),
            Notes = @Notes
        WHERE UserAutoID = @UserAutoID;

        IF @@ROWCOUNT = 0
        BEGIN SET @ResultCode = 'ORDER_ITEM_NOT_FOUND'; SET @ResultMsg = N'Không tìm thấy dòng sản phẩm.'; THROW 53206, N'X', 1; END;

        UPDATE dbo.AI_API_MutationIdempotency
        SET Status = 'COMPLETED', ResultEntityID = @UserAutoID, ResultMsg = N'Cập nhật sản phẩm thành công',
            ResultMsgType = 5, LastRequestID = @RequestID, UpdatedAt = SYSUTCDATETIME()
        WHERE IdempotencyKeyHash = @KeyHash AND VerifiedUserHash = @UserHash AND ApiCode = @ApiCode;

        SET @AuditInfo = N'{"requestId":"' + STRING_ESCAPE(@RequestID, 'json')
            + N'","documentId":"' + STRING_ESCAPE(@DocumentID, 'json')
            + N'","userAutoId":"' + STRING_ESCAPE(@UserAutoID, 'json')
            + N'","itemId":"' + STRING_ESCAPE(@ItemID, 'json') + N'","outcome":"UPDATED"}';
        EXEC dbo.AI_WriteAuditLog @Username = @Username, @ActionType = 'EDIT_DONHANG_ITEM_UPDATE',
             @TargetEntity = @ApiCode, @TargetID = @DocumentID, @ExtraInfo = @AuditInfo;

        IF @OwnTran = 1 COMMIT TRANSACTION;
        SELECT N'Cập nhật sản phẩm thành công' AS Msg, 5 AS MsgType, @UserAutoID AS UserAutoID,
               @RequestID AS RequestID, CAST(0 AS BIT) AS IsReplay;
        RETURN;
    END TRY
    BEGIN CATCH
        /* Người gọi có transaction riêng thì chỉ lùi về savepoint, không đụng phần của họ. */
        IF @OwnTran = 1
        BEGIN
            IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        END
        ELSE IF XACT_STATE() = 1 ROLLBACK TRANSACTION OrderEditSP;
        IF @ResultCode = '' OR @ResultCode IS NULL
        BEGIN
            SET @ResultCode = CASE WHEN ERROR_NUMBER() IN (2601, 2627) THEN 'IDEMPOTENCY_IN_PROGRESS' ELSE 'EDIT_FAILED' END;
            SET @ResultMsg = N'Không cập nhật được sản phẩm. Mã đối soát: ' + @RequestID;
        END;
    END CATCH;

Fail:
    SELECT @ResultMsg AS Msg, 1 AS MsgType, @ResultCode AS Code, @RequestID AS RequestID, CAST(0 AS BIT) AS IsReplay;
END;
GO

CREATE OR ALTER PROCEDURE dbo.API_DonHang_EditItemDelete_AI
    @Username       VARCHAR(50) = '',
    @UserAutoID     VARCHAR(50) = '',
    @IdempotencyKey VARCHAR(128) = '',
    @RequestID      VARCHAR(100) = ''
AS
BEGIN
    SET NOCOUNT ON;
    /* XACT_ABORT cố ý TẮT. Bật thì mọi THROW làm transaction "doomed" (XACT_STATE = -1),
       lúc đó CATCH chỉ còn cách ROLLBACK TOÀN BỘ — kể cả transaction của người gọi.
       Tắt + dùng savepoint thì proc lồng được vào transaction khác, và bộ kiểm chứng
       chạy-rồi-rollback mới soi được các ca từ chối. Mọi lỗi vẫn được TRY/CATCH bắt. */
    SET XACT_ABORT OFF;

    DECLARE @ApiCode VARCHAR(100) = 'API_DonHang_EditItemDelete_AI';
    DECLARE @ResultCode VARCHAR(60) = '', @ResultMsg NVARCHAR(500) = N'';
    DECLARE @KeyHash CHAR(64), @UserHash CHAR(64), @FpHash CHAR(64);
    DECLARE @StoredStatus VARCHAR(20) = NULL, @StoredFp CHAR(64) = NULL;
    DECLARE @DocumentID VARCHAR(50) = NULL, @StatusID INT;
    DECLARE @CanEdit BIT, @BlockCode VARCHAR(60), @BlockMsg NVARCHAR(300);
    DECLARE @AuditInfo NVARCHAR(MAX);
    /* 1 = proc tự mở transaction; 0 = đang nằm trong transaction của người gọi. */
    DECLARE @OwnTran BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
    DECLARE @PolicyLockResult INT;

    SET @Username = LTRIM(RTRIM(COALESCE(@Username, '')));
    SET @UserAutoID = LTRIM(RTRIM(COALESCE(@UserAutoID, '')));
    SET @IdempotencyKey = LTRIM(RTRIM(COALESCE(@IdempotencyKey, '')));
    SET @RequestID = LTRIM(RTRIM(COALESCE(@RequestID, '')));

    IF @Username = '' OR @UserAutoID = ''
    BEGIN SET @ResultCode = 'INVALID_REQUEST'; SET @ResultMsg = N'Thiếu tài khoản hoặc dòng sản phẩm.'; GOTO Fail; END;
    IF LEN(@IdempotencyKey) < 8 OR @IdempotencyKey LIKE '%[^A-Za-z0-9._:-]%'
    BEGIN SET @ResultCode = 'IDEMPOTENCY_KEY_REQUIRED'; SET @ResultMsg = N'Thiếu khóa chống gửi lặp hợp lệ.'; GOTO Fail; END;
    IF OBJECT_ID('dbo.AI_API_MutationIdempotency', 'U') IS NULL OR OBJECT_ID('dbo.AI_WriteAuditLog', 'P') IS NULL
    BEGIN SET @ResultCode = 'INFRA_UNAVAILABLE'; SET @ResultMsg = N'Hệ thống chống gửi lặp/audit chưa sẵn sàng.'; GOTO Fail; END;

    SET @KeyHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), @IdempotencyKey)), 2));
    SET @UserHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), LOWER(@Username))), 2));
    SET @FpHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX),
        CONCAT(LOWER(@Username), '|DELETE|', @UserAutoID))), 2));

    BEGIN TRY
        IF @OwnTran = 1 BEGIN TRANSACTION; ELSE SAVE TRANSACTION OrderEditSP;

        SELECT @StoredStatus = Status, @StoredFp = RequestFingerprintHash
        FROM dbo.AI_API_MutationIdempotency WITH (UPDLOCK, HOLDLOCK)
        WHERE IdempotencyKeyHash = @KeyHash AND VerifiedUserHash = @UserHash AND ApiCode = @ApiCode;

        IF @StoredStatus IS NOT NULL
        BEGIN
            IF @StoredFp <> @FpHash
            BEGIN SET @ResultCode = 'IDEMPOTENCY_CONFLICT'; SET @ResultMsg = N'Khóa gửi lặp đã dùng cho nội dung khác.'; THROW 53301, N'X', 1; END;
            IF @StoredStatus = 'COMPLETED'
            BEGIN
                IF @OwnTran = 1 COMMIT TRANSACTION;
                SELECT N'Đã xử lý trước đó' AS Msg, 5 AS MsgType, @UserAutoID AS UserAutoID,
                       @RequestID AS RequestID, CAST(1 AS BIT) AS IsReplay;
                RETURN;
            END;
            SET @ResultCode = 'IDEMPOTENCY_IN_PROGRESS'; SET @ResultMsg = N'Yêu cầu trùng đang được xử lý.'; THROW 53302, N'X', 1;
        END;

        EXEC @PolicyLockResult = sys.sp_getapplock
            @Resource = 'AI_ORDER_APPROVAL_POLICY', @LockMode = 'Shared',
            @LockOwner = 'Transaction', @LockTimeout = 15000;
        IF @PolicyLockResult < 0
        BEGIN SET @ResultCode = 'APPROVAL_POLICY_BUSY'; SET @ResultMsg = N'Chính sách quyền sửa đang được cập nhật. Vui lòng tải lại.'; THROW 53307, N'X', 1; END;

        SELECT TOP (1) @DocumentID = DocumentID FROM dbo.AR_OrderDetailTbl WHERE UserAutoID = @UserAutoID;
        IF @DocumentID IS NULL
        BEGIN SET @ResultCode = 'ORDER_ITEM_NOT_FOUND'; SET @ResultMsg = N'Không tìm thấy dòng sản phẩm.'; THROW 53303, N'X', 1; END;

        SELECT @StatusID = StatusID FROM dbo.AR_OrderTbl WITH (UPDLOCK, HOLDLOCK) WHERE DocumentID = @DocumentID;
        IF @StatusID IS NULL
        BEGIN SET @ResultCode = 'ORDER_NOT_FOUND'; SET @ResultMsg = N'Không tìm thấy đơn hàng.'; THROW 53304, N'X', 1; END;

        SELECT @CanEdit = CanEdit, @BlockCode = BlockCode, @BlockMsg = BlockMsg
        FROM dbo.AI_OrderEditGuardFnc(@Username, @DocumentID, SYSUTCDATETIME());
        IF @CanEdit <> 1
        BEGIN SET @ResultCode = @BlockCode; SET @ResultMsg = @BlockMsg; THROW 53305, N'X', 1; END;

        /* Không cho xoá dòng cuối: một đơn không còn sản phẩm nào là dữ liệu rác mà ERP
           không có đường dọn. Muốn bỏ hẳn đơn thì phải là thao tác hủy đơn, không phải
           xoá lần lượt từng dòng. */
        IF (SELECT COUNT(*) FROM dbo.AR_OrderDetailTbl WHERE DocumentID = @DocumentID) <= 1
        BEGIN SET @ResultCode = 'LAST_ITEM_CANNOT_BE_DELETED'; SET @ResultMsg = N'Không thể xoá sản phẩm cuối cùng của đơn hàng.'; THROW 53306, N'X', 1; END;

        INSERT dbo.AI_API_MutationIdempotency
            (IdempotencyKeyHash, VerifiedUserHash, ApiCode, RequestFingerprintHash, Status, FirstRequestID, LastRequestID)
        VALUES (@KeyHash, @UserHash, @ApiCode, @FpHash, 'PENDING', @RequestID, @RequestID);

        DELETE FROM dbo.AR_OrderDetailTbl WHERE UserAutoID = @UserAutoID;

        UPDATE dbo.AI_API_MutationIdempotency
        SET Status = 'COMPLETED', ResultEntityID = @UserAutoID, ResultMsg = N'Xóa sản phẩm thành công',
            ResultMsgType = 5, LastRequestID = @RequestID, UpdatedAt = SYSUTCDATETIME()
        WHERE IdempotencyKeyHash = @KeyHash AND VerifiedUserHash = @UserHash AND ApiCode = @ApiCode;

        SET @AuditInfo = N'{"requestId":"' + STRING_ESCAPE(@RequestID, 'json')
            + N'","documentId":"' + STRING_ESCAPE(@DocumentID, 'json')
            + N'","userAutoId":"' + STRING_ESCAPE(@UserAutoID, 'json') + N'","outcome":"DELETED"}';
        EXEC dbo.AI_WriteAuditLog @Username = @Username, @ActionType = 'EDIT_DONHANG_ITEM_DELETE',
             @TargetEntity = @ApiCode, @TargetID = @DocumentID, @ExtraInfo = @AuditInfo;

        IF @OwnTran = 1 COMMIT TRANSACTION;
        SELECT N'Xóa sản phẩm thành công' AS Msg, 5 AS MsgType, @UserAutoID AS UserAutoID,
               @RequestID AS RequestID, CAST(0 AS BIT) AS IsReplay;
        RETURN;
    END TRY
    BEGIN CATCH
        /* Người gọi có transaction riêng thì chỉ lùi về savepoint, không đụng phần của họ. */
        IF @OwnTran = 1
        BEGIN
            IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        END
        ELSE IF XACT_STATE() = 1 ROLLBACK TRANSACTION OrderEditSP;
        IF @ResultCode = '' OR @ResultCode IS NULL
        BEGIN
            SET @ResultCode = CASE WHEN ERROR_NUMBER() IN (2601, 2627) THEN 'IDEMPOTENCY_IN_PROGRESS' ELSE 'EDIT_FAILED' END;
            SET @ResultMsg = N'Không xoá được sản phẩm. Mã đối soát: ' + @RequestID;
        END;
    END CATCH;

Fail:
    SELECT @ResultMsg AS Msg, 1 AS MsgType, @ResultCode AS Code, @RequestID AS RequestID, CAST(0 AS BIT) AS IsReplay;
END;
GO
