SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  ORDER-APPROVAL-003 — API đọc (không ghi) trả trạng thái thật + quyền duyệt/từ chối của
  người gọi. dbo.API_DonHangChiTiet (proc chi tiết đơn hàng hiện có) KHÔNG trả StatusID, nên
  frontend cần nguồn riêng để biết "có nên hiện nút Duyệt/Từ chối không" — tránh lặp lại lỗi
  hard-code label/logic quyền ở phía client.

  ĐÃ SỬA (21/08/2026):

  1. Không còn hard-code vai trò/trạng thái. Dùng chung dbo.AI_OrderApprovalRoleFnc và
     dbo.AI_OrderApprovalTransitionFnc với procedure ghi, nên nút hiện trên UI và quyết định
     thật của DB không thể lệch nhau. Hợp đồng chưa được chốt (ORDER-APPROVAL-002) thì trả
     ContractStatus = 'PENDING_SIGN_OFF' và CanApprove/CanReject = 0.

  2. Có kiểm tra maker-checker ngay ở đây, để người tạo đơn không nhìn thấy nút duyệt đơn của
     chính mình rồi bấm vào mới bị từ chối.

  3. Có kiểm tra phạm vi ĐỌC: trước đây proc trả StatusID/BranchID của bất kỳ DocumentID nào
     được truyền vào. @Username giờ do gateway gắn từ token (server.js), nhưng người dùng vẫn
     có thể dò mã đơn của người khác, nên phạm vi đọc bám theo phạm vi khách hàng của ERP
     (dbo.AR_GetObjectByUserFnc) cộng với người tạo/nhân viên của đơn và người có quyền duyệt
     đúng phạm vi.

  4. Chế độ tóm tắt: gọi với @DocumentID rỗng trả về số đơn đang chờ duyệt trong phạm vi của
     người gọi, phục vụ lối vào "Đơn chờ duyệt" cho Kế toán.

  Cột trả về luôn cố định (một dòng) để frontend không phải đoán hình dạng dữ liệu.
*/
CREATE OR ALTER PROCEDURE dbo.API_DonHang_ApprovalContext_AI
    @Username    VARCHAR(50) = '',
    @DocumentID  VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;

    SET @Username = LTRIM(RTRIM(COALESCE(@Username, '')));
    SET @DocumentID = LTRIM(RTRIM(COALESCE(@DocumentID, '')));

    DECLARE @AsOf DATETIME2(0) = SYSUTCDATETIME();
    DECLARE @Mode VARCHAR(20) = CASE WHEN @DocumentID = '' THEN 'SUMMARY' ELSE 'DOCUMENT' END;
    DECLARE @ContractStatus VARCHAR(30) = 'PENDING_SIGN_OFF';
    DECLARE @ContractVersion VARCHAR(30) = NULL;
    DECLARE @BlockCode VARCHAR(60) = NULL;
    DECLARE @BlockMsg NVARCHAR(400) = NULL;
    DECLARE @CanApprove BIT = 0, @CanReject BIT = 0;
    DECLARE @RequireReasonApprove BIT = 0, @RequireReasonReject BIT = 0;
    DECLARE @PendingCount INT = NULL;
    DECLARE @PendingStatusIDs VARCHAR(200) = NULL;
    DECLARE @StatusID INT = NULL, @StatusName NVARCHAR(100) = NULL, @BranchID VARCHAR(50) = NULL;

    IF NOT EXISTS (SELECT 1 FROM dbo.SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'Tài khoản không hợp lệ hoặc đã bị khóa.' AS Msg, 1 AS MsgType, 'INVALID_USER' AS Code;
        RETURN;
    END;
    IF OBJECT_ID('dbo.AI_OrderApprovalRoleFnc', 'IF') IS NULL
        OR OBJECT_ID('dbo.AI_OrderApprovalTransitionFnc', 'IF') IS NULL
        OR OBJECT_ID('dbo.AI_OrderApprovalContractIsLiveFnc', 'FN') IS NULL
    BEGIN
        SELECT N'Chưa cài đặt bảng hợp đồng duyệt đơn (ORDER-APPROVAL-003).' AS Msg, 1 AS MsgType,
               'APPROVAL_CONTRACT_UNAVAILABLE' AS Code;
        RETURN;
    END;

    DECLARE @ActorBranchID VARCHAR(50) = '', @ActorEmployeeID VARCHAR(50) = '';
    SELECT @ActorBranchID = COALESCE(BranchID, ''), @ActorEmployeeID = COALESCE(EmployeeID, '')
    FROM dbo.SY_User WHERE UserName = @Username;

    IF dbo.AI_OrderApprovalContractIsLiveFnc(@AsOf) = 1 SET @ContractStatus = 'APPROVED';

    /* Luật vai trò cho từng hành động (có thể khác nhau theo hợp đồng). */
    DECLARE @ApproveScope VARCHAR(30) = NULL, @ApproveAllowSelf BIT = 0;
    DECLARE @RejectScope VARCHAR(30) = NULL, @RejectAllowSelf BIT = 0;

    SELECT TOP (1) @ApproveScope = ScopeRule, @ApproveAllowSelf = AllowSelfApproval,
           @ContractVersion = ContractVersion
    FROM dbo.AI_OrderApprovalRoleFnc(@Username, 'APPROVE', @AsOf);
    SELECT TOP (1) @RejectScope = ScopeRule, @RejectAllowSelf = AllowSelfApproval,
           @ContractVersion = COALESCE(@ContractVersion, ContractVersion)
    FROM dbo.AI_OrderApprovalRoleFnc(@Username, 'REJECT', @AsOf);

    /* ── Chế độ tóm tắt: đếm đơn đang chờ duyệt trong phạm vi người gọi ─────────────── */
    IF @Mode = 'SUMMARY'
    BEGIN
        SET @PendingCount = 0;
        IF @ContractStatus = 'APPROVED' AND @ApproveScope IS NOT NULL
           AND (@ApproveScope = 'GLOBAL' OR @ActorBranchID <> '')
        BEGIN
            DECLARE @PendingFromStatus TABLE (StatusID INT PRIMARY KEY);
            INSERT @PendingFromStatus (StatusID)
            SELECT DISTINCT FromStatusID FROM dbo.AI_OrderApprovalTransitionFnc('APPROVE', NULL, @AsOf);

            SELECT @PendingStatusIDs = STUFF((
                SELECT ',' + CAST(StatusID AS VARCHAR(12))
                FROM @PendingFromStatus ORDER BY StatusID FOR XML PATH(''), TYPE
            ).value('.', 'VARCHAR(200)'), 1, 1, '');

            SELECT @PendingCount = COUNT(*)
            FROM dbo.AR_OrderTbl O
            WHERE O.StatusID IN (SELECT StatusID FROM @PendingFromStatus)
              AND (@ApproveScope = 'GLOBAL' OR COALESCE(O.BranchID, '') = @ActorBranchID)
              AND (
                    @ApproveAllowSelf = 1
                 OR (UPPER(COALESCE(O.UserCreate, '')) <> UPPER(@Username)
                     AND (@ActorEmployeeID = '' OR UPPER(COALESCE(O.EmployeeID, '')) <> UPPER(@ActorEmployeeID)))
              );
        END;

        IF @ContractStatus <> 'APPROVED'
        BEGIN
            SET @BlockCode = 'APPROVAL_CONTRACT_NOT_APPROVED';
            SET @BlockMsg = N'Quy trình duyệt đơn chưa được chốt (ORDER-APPROVAL-002).';
        END
        ELSE IF @ApproveScope IS NULL
        BEGIN
            SET @BlockCode = 'FORBIDDEN_ROLE';
            SET @BlockMsg = N'Tài khoản không có quyền duyệt đơn.';
        END
        ELSE IF @ApproveScope = 'BRANCH_MATCH' AND @ActorBranchID = ''
        BEGIN
            SET @BlockCode = 'APPROVER_BRANCH_MISSING';
            SET @BlockMsg = N'Tài khoản chưa được gán chi nhánh nên chưa duyệt được đơn nào.';
        END;

        SELECT @Mode AS Mode, NULL AS DocumentID, NULL AS StatusID, NULL AS StatusName, NULL AS BranchID,
               @ContractStatus AS ContractStatus, @ContractVersion AS ContractVersion,
               CAST(0 AS BIT) AS CanApprove, CAST(0 AS BIT) AS CanReject,
               CAST(0 AS BIT) AS RequireReasonApprove, CAST(0 AS BIT) AS RequireReasonReject,
               CAST(CASE WHEN @ApproveScope IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS HasApprovalRole,
               @PendingCount AS PendingCount, @PendingStatusIDs AS PendingStatusIDs,
               @BlockCode AS BlockCode, @BlockMsg AS BlockMsg,
               N'' AS Msg, 5 AS MsgType;
        RETURN;
    END;

    /* ── Chế độ 1 đơn ───────────────────────────────────────────────────────────────── */
    DECLARE @UserCreate VARCHAR(30) = NULL, @EmployeeID VARCHAR(50) = NULL, @ObjectID VARCHAR(50) = NULL;
    SELECT @StatusID = O.StatusID, @BranchID = COALESCE(O.BranchID, ''),
           @UserCreate = COALESCE(O.UserCreate, ''), @EmployeeID = COALESCE(O.EmployeeID, ''),
           @ObjectID = COALESCE(O.ObjectID, ''), @StatusName = S.StatusName
    FROM dbo.AR_OrderTbl O
    LEFT JOIN dbo.AR_OrderStatusTbl S ON S.StatusID = O.StatusID
    WHERE O.DocumentID = @DocumentID;

    IF @BranchID IS NULL
    BEGIN
        SELECT N'Không tìm thấy đơn hàng.' AS Msg, 1 AS MsgType, 'ORDER_NOT_FOUND' AS Code;
        RETURN;
    END;

    DECLARE @IsOwner BIT = CASE
        WHEN UPPER(@UserCreate) = UPPER(@Username) THEN 1
        WHEN @ActorEmployeeID <> '' AND UPPER(@ActorEmployeeID) = UPPER(@EmployeeID) THEN 1
        ELSE 0 END;

    /* Phạm vi đọc: chủ đơn, hoặc khách hàng nằm trong phạm vi ERP của tài khoản, hoặc người
       có quyền duyệt đúng phạm vi. Không lộ trạng thái đơn ngoài phạm vi cho người dò mã. */
    DECLARE @CanRead BIT = 0;
    IF @IsOwner = 1 SET @CanRead = 1;
    IF @CanRead = 0 AND @ObjectID <> ''
       AND EXISTS (SELECT 1 FROM dbo.AR_GetObjectByUserFnc(@Username) F WHERE F.ObjectID = @ObjectID)
        SET @CanRead = 1;
    IF @CanRead = 0 AND @ApproveScope = 'GLOBAL' SET @CanRead = 1;
    IF @CanRead = 0 AND @RejectScope = 'GLOBAL' SET @CanRead = 1;
    IF @CanRead = 0 AND @ActorBranchID <> '' AND @ActorBranchID = @BranchID
       AND (@ApproveScope IS NOT NULL OR @RejectScope IS NOT NULL)
        SET @CanRead = 1;

    IF @CanRead = 0
    BEGIN
        SELECT N'Đơn hàng không thuộc phạm vi của tài khoản này.' AS Msg, 1 AS MsgType,
               'ORDER_OUT_OF_SCOPE' AS Code;
        RETURN;
    END;

    /* Transition khả dụng từ trạng thái hiện tại theo hợp đồng. */
    DECLARE @ApproveTo INT = NULL, @RejectTo INT = NULL;
    SELECT @ApproveTo = ToStatusID, @RequireReasonApprove = RequireReason
    FROM dbo.AI_OrderApprovalTransitionFnc('APPROVE', @StatusID, @AsOf);
    SELECT @RejectTo = ToStatusID, @RequireReasonReject = RequireReason
    FROM dbo.AI_OrderApprovalTransitionFnc('REJECT', @StatusID, @AsOf);

    DECLARE @SelfBlocked BIT = 0;
    SET @CanApprove = CASE WHEN @ContractStatus = 'APPROVED' AND @ApproveScope IS NOT NULL AND @ApproveTo IS NOT NULL
                                AND (@ApproveScope = 'GLOBAL' OR (@ActorBranchID <> '' AND @ActorBranchID = @BranchID))
                                AND (@ApproveAllowSelf = 1 OR @IsOwner = 0)
                           THEN 1 ELSE 0 END;
    SET @CanReject = CASE WHEN @ContractStatus = 'APPROVED' AND @RejectScope IS NOT NULL AND @RejectTo IS NOT NULL
                               AND (@RejectScope = 'GLOBAL' OR (@ActorBranchID <> '' AND @ActorBranchID = @BranchID))
                               AND (@RejectAllowSelf = 1 OR @IsOwner = 0)
                          THEN 1 ELSE 0 END;

    IF @CanApprove = 0 AND @CanReject = 0
    BEGIN
        IF @ContractStatus <> 'APPROVED'
        BEGIN
            SET @BlockCode = 'APPROVAL_CONTRACT_NOT_APPROVED';
            SET @BlockMsg = N'Quy trình duyệt đơn chưa được chốt (ORDER-APPROVAL-002).';
        END
        ELSE IF @ApproveScope IS NULL AND @RejectScope IS NULL
        BEGIN
            SET @BlockCode = 'FORBIDDEN_ROLE';
            SET @BlockMsg = N'Tài khoản không có quyền duyệt/từ chối đơn.';
        END
        ELSE IF @IsOwner = 1
        BEGIN
            SET @SelfBlocked = 1;
            SET @BlockCode = 'SELF_APPROVAL_BLOCKED';
            SET @BlockMsg = N'Đơn do chính tài khoản này lập nên phải người khác duyệt.';
        END
        ELSE IF @ApproveTo IS NULL AND @RejectTo IS NULL
        BEGIN
            SET @BlockCode = 'INVALID_TRANSITION';
            SET @BlockMsg = N'Trạng thái hiện tại của đơn không nằm trong luồng duyệt.';
        END
        ELSE IF @ActorBranchID = ''
        BEGIN
            SET @BlockCode = 'APPROVER_BRANCH_MISSING';
            SET @BlockMsg = N'Tài khoản chưa được gán chi nhánh.';
        END
        ELSE
        BEGIN
            SET @BlockCode = 'ORDER_OUT_OF_BRANCH_SCOPE';
            SET @BlockMsg = N'Đơn hàng không thuộc chi nhánh của tài khoản này.';
        END;
    END;

    SELECT @Mode AS Mode, @DocumentID AS DocumentID, @StatusID AS StatusID, @StatusName AS StatusName,
           @BranchID AS BranchID, @ContractStatus AS ContractStatus, @ContractVersion AS ContractVersion,
           @CanApprove AS CanApprove, @CanReject AS CanReject,
           @RequireReasonApprove AS RequireReasonApprove, @RequireReasonReject AS RequireReasonReject,
           CAST(CASE WHEN @ApproveScope IS NOT NULL OR @RejectScope IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS HasApprovalRole,
           NULL AS PendingCount, NULL AS PendingStatusIDs,
           @BlockCode AS BlockCode, @BlockMsg AS BlockMsg,
           N'' AS Msg, 5 AS MsgType;
END;
GO
