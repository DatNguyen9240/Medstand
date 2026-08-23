SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  ORDER-APPROVAL-006 — khách đổi ý (21/08/2026, qua trao đổi với Nguyễn Hoàng Đăng): giữ lại
  Lưu nháp, và Sale phải sửa được đơn của chính mình trong lúc còn nháp. Quyết định "khoá sửa
  từ lúc gửi duyệt, chỉ người duyệt sửa khi còn Chờ duyệt" (ORDER-APPROVAL-005) KHÔNG đổi.

  Hạ tầng cho luồng nháp/gửi duyệt/hủy nháp (ORDER-APPROVAL-002/003/004) chưa từng bị xoá —
  ORDER-APPROVAL-005 chỉ ép StatusID=0 lúc tạo đơn và chặn ở gateway. File này:
    1) Mở rộng dbo.AI_OrderEditGuardFnc để chủ đơn sửa được đơn khi StatusID=-1 (Đơn nháp).
    2) Bật đúng 2 dòng trong dbo.AI_OrderApprovalTransitionTbl: SUBMIT (-1->0) và
       CANCEL (-1->10). KHÔNG bật 6 dòng CANCEL còn lại (0,1,2,3,4,6 -> 10) — đó là chỗ chặn
       chủ đơn hủy đơn đã gửi/đã duyệt, quyết định đó vẫn giữ nguyên.

  dbo.API_DonHang_OwnerTransition_AI (proc ghi) và dbo.API_DonHang_OwnerContext_AI (proc đọc)
  KHÔNG sửa code — cả hai đều tra cứu qua AI_OrderApprovalTransitionFnc/AI_OrderApprovalRoleFnc,
  tự động phản ánh đúng 2 dòng vừa bật. Vai trò kế toán/quản lý (ActionCode='*') đã APPROVED
  sẵn từ ORDER-APPROVAL-003_Enable_Test_Contract_AI.sql nên áp dụng luôn cho SUBMIT/CANCEL,
  không cần seed vai trò riêng.
*/

/* ══════════════════════════════════════════════════════════════════════════════════════
   1. MỞ RỘNG GUARD — chủ đơn sửa được đơn nháp (StatusID=-1) của CHÍNH MÌNH.
   Hàm này dùng chung bởi API_DonHang_EditContext_AI và cả 4 proc ghi API_DonHang_Edit*_AI
   (sql/ORDER-APPROVAL-005_Order_Edit_Guard_AI.sql) — sửa 1 chỗ, mọi nơi tự động đồng bộ.
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
            /* Đơn nháp: chỉ chính chủ đơn sửa được — chưa gửi duyệt thì chưa tới lượt
               quản lý. Không xét ScopeRule ở nhánh này. */
            WHEN O.StatusID = -1 THEN
                CASE WHEN UPPER(O.UserCreate) = UPPER(@Username) THEN 1 ELSE 0 END
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
            WHEN O.StatusID = -1 AND UPPER(O.UserCreate) <> UPPER(@Username) THEN 'ORDER_EDIT_NOT_OWNER'
            WHEN O.StatusID = -1 THEN ''
            WHEN O.StatusID <> 0 THEN 'ORDER_EDIT_LOCKED'
            WHEN R.ScopeRule IS NULL THEN 'ORDER_EDIT_ROLE_REQUIRED'
            WHEN R.ScopeRule = 'BRANCH_MATCH' AND COALESCE(U.BranchID, '') = '' THEN 'EDITOR_BRANCH_MISSING'
            WHEN R.ScopeRule = 'BRANCH_MATCH'
                 AND COALESCE(U.BranchID, '') <> COALESCE(O.BranchID, '') THEN 'ORDER_OUT_OF_BRANCH_SCOPE'
            ELSE '' END,
        BlockMsg = CASE
            WHEN UPPER(COALESCE(U.UserGroupID, '')) IN ('KTDH', 'KTDH2', 'TN KTDH') THEN N'Kế toán thao tác đơn hàng trên PMKT, không sửa đơn trong ứng dụng này.'
            WHEN O.StatusID = -1 AND UPPER(O.UserCreate) <> UPPER(@Username) THEN N'Đơn nháp này không phải của bạn.'
            WHEN O.StatusID = -1 THEN N''
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
   2. BẬT LẠI ĐÚNG 2 DÒNG HỢP ĐỒNG — không đụng 6 dòng CANCEL còn lại (vẫn RETIRED).
   ══════════════════════════════════════════════════════════════════════════════════════ */
UPDATE dbo.AI_OrderApprovalTransitionTbl
SET Status = 'APPROVED',
    ApprovedBy = 'HoangDang',
    ApprovalRef = N'Khách xác nhận qua chat 21/08/2026 — khôi phục Lưu nháp (ORDER-APPROVAL-006)',
    EffectiveFrom = SYSUTCDATETIME(),
    EffectiveTo = NULL
WHERE ContractVersion = 'ORDER-APPROVAL-002' AND ActionCode = 'SUBMIT'
  AND FromStatusID = -1 AND ToStatusID = 0;

UPDATE dbo.AI_OrderApprovalTransitionTbl
SET Status = 'APPROVED',
    ApprovedBy = 'HoangDang',
    ApprovalRef = N'Khách xác nhận qua chat 21/08/2026 — khôi phục Lưu nháp (ORDER-APPROVAL-006)',
    EffectiveFrom = SYSUTCDATETIME(),
    EffectiveTo = NULL
WHERE ContractVersion = 'ORDER-APPROVAL-002' AND ActionCode = 'CANCEL'
  AND FromStatusID = -1 AND ToStatusID = 10;
GO

/* Kiểm tra sau khi chạy: đúng 2 dòng SUBMIT/CANCEL của -1 là APPROVED, 6 dòng CANCEL còn lại
   (0,1,2,3,4,6 -> 10) vẫn phải là RETIRED — chủ đơn không được hủy đơn đã gửi/đã duyệt. */
SELECT ActionCode, CAST(FromStatusID AS VARCHAR(10)) + ' -> ' + CAST(ToStatusID AS VARCHAR(10)) AS Detail,
       Status, ApprovedBy, ApprovalRef
FROM dbo.AI_OrderApprovalTransitionTbl
WHERE ContractVersion = 'ORDER-APPROVAL-002' AND ActionCode IN ('SUBMIT', 'CANCEL')
ORDER BY ActionCode, FromStatusID;
GO
