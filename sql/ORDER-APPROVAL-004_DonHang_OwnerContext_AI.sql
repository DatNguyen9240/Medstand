SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  ORDER-APPROVAL-002 (điểm "Đơn nháp/Gửi duyệt" + "Hủy đơn") — API đọc (không ghi) trả
  StatusID thật + quyền Gửi duyệt/Hủy của người gọi cho 1 đơn cụ thể. Proc RIÊNG, không sửa
  dbo.API_DonHang_ApprovalContext_AI đã có (đang được 1 luồng khác cùng lúc phát triển) —
  order-detail.js/edit-order.js gọi proc này SONG SONG với ApprovalContext_AI hiện có để lấy
  đủ CanApprove/CanReject (từ proc kia) + CanSubmit/CanCancel (từ proc này).

  Dùng đúng logic quyền như dbo.API_DonHang_OwnerTransition_AI (chủ đơn luôn được, HOẶC vai
  trò kế toán/quản lý qua dbo.AI_OrderApprovalRoleFnc dùng chung, KHÔNG hard-code) — để UI và
  proc ghi không bao giờ lệch nhau (nút hiện ra nhưng bấm vào bị từ chối, hoặc ngược lại).
*/
CREATE OR ALTER PROCEDURE dbo.API_DonHang_OwnerContext_AI
    @Username    VARCHAR(50) = '',
    @DocumentID  VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;

    SET @Username = LTRIM(RTRIM(COALESCE(@Username, '')));
    SET @DocumentID = LTRIM(RTRIM(COALESCE(@DocumentID, '')));
    DECLARE @AsOf DATETIME2(0) = SYSUTCDATETIME();

    IF NOT EXISTS (SELECT 1 FROM dbo.SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'Tài khoản không hợp lệ hoặc đã bị khóa.' AS Msg, 1 AS MsgType, 'INVALID_USER' AS Code;
        RETURN;
    END;
    IF OBJECT_ID('dbo.AI_OrderApprovalTransitionFnc', 'IF') IS NULL OR OBJECT_ID('dbo.AI_OrderApprovalRoleFnc', 'IF') IS NULL
    BEGIN
        SELECT N'Chưa cài đặt bảng hợp đồng duyệt đơn.' AS Msg, 1 AS MsgType, 'APPROVAL_CONTRACT_UNAVAILABLE' AS Code;
        RETURN;
    END;

    DECLARE @StatusID INT = NULL, @OrderBranchID VARCHAR(50) = NULL, @OrderUserCreate VARCHAR(30) = '', @ObjectID VARCHAR(50) = '';
    SELECT @StatusID = StatusID, @OrderBranchID = COALESCE(BranchID, ''), @OrderUserCreate = COALESCE(UserCreate, ''),
           @ObjectID = COALESCE(ObjectID, '')
    FROM dbo.AR_OrderTbl WHERE DocumentID = @DocumentID;

    IF @StatusID IS NULL
    BEGIN
        SELECT N'Không tìm thấy đơn hàng.' AS Msg, 1 AS MsgType, 'ORDER_NOT_FOUND' AS Code;
        RETURN;
    END;

    DECLARE @IsOwner BIT = CASE WHEN UPPER(@OrderUserCreate) = UPPER(@Username) THEN 1 ELSE 0 END;
    DECLARE @ActorBranchID VARCHAR(50) = '';
    SELECT @ActorBranchID = COALESCE(BranchID, '') FROM dbo.SY_User WHERE UserName = @Username;

    DECLARE @SubmitScope VARCHAR(30) = NULL, @CancelScope VARCHAR(30) = NULL;
    SELECT TOP (1) @SubmitScope = ScopeRule FROM dbo.AI_OrderApprovalRoleFnc(@Username, 'SUBMIT', @AsOf);
    SELECT TOP (1) @CancelScope = ScopeRule FROM dbo.AI_OrderApprovalRoleFnc(@Username, 'CANCEL', @AsOf);

    DECLARE @SubmitRoleAllows BIT = CASE
        WHEN @SubmitScope IS NULL THEN 0
        WHEN @SubmitScope = 'GLOBAL' THEN 1
        WHEN @SubmitScope = 'BRANCH_MATCH' AND @ActorBranchID <> '' AND @ActorBranchID = @OrderBranchID THEN 1
        ELSE 0
    END;
    DECLARE @CancelRoleAllows BIT = CASE
        WHEN @CancelScope IS NULL THEN 0
        WHEN @CancelScope = 'GLOBAL' THEN 1
        WHEN @CancelScope = 'BRANCH_MATCH' AND @ActorBranchID <> '' AND @ActorBranchID = @OrderBranchID THEN 1
        ELSE 0
    END;

    DECLARE @SubmitTo INT = NULL, @CancelTo INT = NULL;
    SELECT @SubmitTo = ToStatusID FROM dbo.AI_OrderApprovalTransitionFnc('SUBMIT', @StatusID, @AsOf);
    SELECT @CancelTo = ToStatusID FROM dbo.AI_OrderApprovalTransitionFnc('CANCEL', @StatusID, @AsOf);

    DECLARE @CanSubmit BIT = CAST(CASE WHEN @SubmitTo IS NOT NULL AND (@IsOwner = 1 OR @SubmitRoleAllows = 1) THEN 1 ELSE 0 END AS BIT);
    DECLARE @CanCancel BIT = CAST(CASE WHEN @CancelTo IS NOT NULL AND (@IsOwner = 1 OR @CancelRoleAllows = 1) THEN 1 ELSE 0 END AS BIT);

    /* Phạm vi đọc: chủ đơn, hoặc khách hàng nằm trong phạm vi ERP của tài khoản, hoặc người
       có vai trò submit/cancel đúng phạm vi. Không lộ StatusID/quyền của đơn ngoài phạm vi
       cho người dò mã đơn — cùng nguyên tắc đang áp dụng ở API_DonHang_ApprovalContext_AI. */
    DECLARE @CanRead BIT = 0;
    IF @IsOwner = 1 SET @CanRead = 1;
    IF @CanRead = 0 AND @ObjectID <> '' AND EXISTS (SELECT 1 FROM dbo.AR_GetObjectByUserFnc(@Username) F WHERE F.ObjectID = @ObjectID)
        SET @CanRead = 1;
    IF @CanRead = 0 AND (@SubmitRoleAllows = 1 OR @CancelRoleAllows = 1) SET @CanRead = 1;

    IF @CanRead = 0
    BEGIN
        SELECT N'Đơn hàng không thuộc phạm vi của tài khoản này.' AS Msg, 1 AS MsgType, 'ORDER_OUT_OF_SCOPE' AS Code;
        RETURN;
    END;

    SELECT @DocumentID AS DocumentID, @StatusID AS StatusID, @CanSubmit AS CanSubmit, @CanCancel AS CanCancel,
           N'' AS Msg, 5 AS MsgType;
END;
GO
