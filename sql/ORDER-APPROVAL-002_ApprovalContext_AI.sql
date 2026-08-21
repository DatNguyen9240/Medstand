SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  ORDER-APPROVAL-002/003 — API đọc (không ghi) trả trạng thái thật + quyền duyệt/từ chối của
  người gọi cho 1 đơn cụ thể. dbo.API_DonHangChiTiet (proc chi tiết đơn hàng hiện có) KHÔNG trả
  StatusID, nên frontend cần nguồn riêng để biết "có nên hiện nút Duyệt/Từ chối không" — tránh
  lặp lại lỗi hard-code label/logic quyền ở phía client.

  21/08/2026 — mở rộng theo yêu cầu business (để thuận tiện test, vì 2 tài khoản kế toán thật
  KTDH hiện có BranchID rỗng nên không ai tự nhiên duyệt được đơn nào): ngoài nhóm kế toán
  (KTDH/KTDH2/TN KTDH), quản lý (Manager=1 hoặc UserGroupID IN ('QL','QLMN')) và cấp toàn hệ
  thống (ADMIN/SADM/BGD/GD) cũng được quyền duyệt/từ chối — dùng đúng pattern role đã có ở
  PROMO-CFG-001_Promotion_Program_Admin_AI.sql. Điều kiện chi nhánh + StatusID=0 vẫn giữ nguyên
  cho MỌI vai trò (kể cả quản lý/toàn hệ thống) — không nới lỏng phần này.
*/
CREATE OR ALTER PROCEDURE dbo.API_DonHang_ApprovalContext_AI
    @Username    VARCHAR(50) = '',
    @DocumentID  VARCHAR(50) = ''
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.SY_User WHERE UserName = @Username AND COALESCE(Disable, 0) = 0)
    BEGIN
        SELECT N'Tài khoản không hợp lệ hoặc đã bị khóa.' AS Msg, 1 AS MsgType;
        RETURN;
    END;

    DECLARE @UserBranchID VARCHAR(50) = '';
    DECLARE @CanApproveRole BIT = 0;
    SELECT @UserBranchID = COALESCE(BranchID, ''),
           @CanApproveRole = CASE
               WHEN UPPER(COALESCE(UserGroupID, '')) IN ('KTDH', 'KTDH2', 'TN KTDH') THEN 1
               WHEN COALESCE(Manager, 0) = 1 THEN 1
               WHEN UPPER(COALESCE(UserGroupID, '')) IN ('QL', 'QLMN', 'ADMIN', 'SADM', 'BGD', 'GD') THEN 1
               ELSE 0
           END
    FROM dbo.SY_User
    WHERE UserName = @Username;

    SELECT
        O.DocumentID,
        O.StatusID,
        S.StatusName,
        O.BranchID,
        CAST(CASE
            WHEN @CanApproveRole = 1 AND @UserBranchID <> '' AND O.BranchID = @UserBranchID AND O.StatusID = 0
            THEN 1 ELSE 0
        END AS BIT) AS CanApprove,
        CAST(CASE
            WHEN @CanApproveRole = 1 AND @UserBranchID <> '' AND O.BranchID = @UserBranchID AND O.StatusID = 0
            THEN 1 ELSE 0
        END AS BIT) AS CanReject
    FROM dbo.AR_OrderTbl O
    LEFT JOIN dbo.AR_OrderStatusTbl S ON S.StatusID = O.StatusID
    WHERE O.DocumentID = @DocumentID;
END;
GO
