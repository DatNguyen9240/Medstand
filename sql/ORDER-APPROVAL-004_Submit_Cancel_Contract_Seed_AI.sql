SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  ORDER-APPROVAL-002 (điểm "Đơn nháp/Gửi duyệt" + "Hủy đơn") — thêm 2 ActionCode mới
  (SUBMIT, CANCEL) vào ĐÚNG bảng hợp đồng đã có sẵn dbo.AI_OrderApprovalTransitionTbl
  (sql/ORDER-APPROVAL-003_Approval_Contract_AI.sql), KHÔNG sửa file đó, KHÔNG đổi schema,
  KHÔNG đụng dòng cũ (APPROVE/REJECT) — chỉ INSERT thêm dòng mới, idempotent
  (IF NOT EXISTS ... INSERT), giống hệt khối seed gốc.

  Vì sao không cần thêm role row riêng: dbo.AI_OrderApprovalRoleTbl đã có sẵn các dòng
  ActionCode='*' (áp dụng cho MỌI action) cho KTDH/KTDH2/TN KTDH — một khi các dòng đó được
  APPROVED (sign-off thật hoặc chế độ TEST), chúng tự động áp dụng luôn cho SUBMIT/CANCEL,
  không cần khai báo lại.

  Các dòng SUBMIT/CANCEL dưới đây khởi tạo Status='DRAFT' — CHƯA có hiệu lực cho tới khi có
  sign-off riêng (độc lập với sign-off của APPROVE/REJECT, có thể ký cùng lúc hoặc khác lúc).

  Ma trận:
    SUBMIT: -1 (Đơn nháp) -> 0 (Chờ duyệt)
    CANCEL: -1, 0, 1, 2, 3, 4, 6 -> 10 (Đã hủy)
      Cố ý KHÔNG có dòng CANCEL cho 7 (Khách đã nhận hàng) / 8 (Đã thu tiền) — cần quy trình
      hoàn hàng/hoàn tiền riêng, ngoài phạm vi task này. AI_OrderApprovalTransitionFnc chỉ trả
      dòng khi có match, nên thiếu dòng = tự động INVALID_TRANSITION, không cần code chặn thêm.
*/

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF NOT EXISTS (SELECT 1 FROM dbo.AI_OrderApprovalTransitionTbl WHERE ContractVersion = 'ORDER-APPROVAL-002' AND ActionCode = 'SUBMIT')
    BEGIN
        INSERT dbo.AI_OrderApprovalTransitionTbl
            (ContractVersion, ActionCode, FromStatusID, ToStatusID, RequireReason, Status, Notes)
        VALUES
            ('ORDER-APPROVAL-002', 'SUBMIT', -1, 0, 0, 'DRAFT',
             N'ĐỀ XUẤT: Đơn nháp (-1) -> Chờ duyệt (0), do người tạo đơn hoặc kế toán/quản lý cùng chi nhánh gửi. CHƯA có sign-off của khách.');
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.AI_OrderApprovalTransitionTbl WHERE ContractVersion = 'ORDER-APPROVAL-002' AND ActionCode = 'CANCEL')
    BEGIN
        INSERT dbo.AI_OrderApprovalTransitionTbl
            (ContractVersion, ActionCode, FromStatusID, ToStatusID, RequireReason, Status, Notes)
        VALUES
            ('ORDER-APPROVAL-002', 'CANCEL', -1, 10, 0, 'DRAFT', N'ĐỀ XUẤT: Hủy từ Đơn nháp. CHƯA có sign-off của khách.'),
            ('ORDER-APPROVAL-002', 'CANCEL',  0, 10, 0, 'DRAFT', N'ĐỀ XUẤT: Hủy từ Chờ duyệt. CHƯA có sign-off của khách.'),
            ('ORDER-APPROVAL-002', 'CANCEL',  1, 10, 0, 'DRAFT', N'ĐỀ XUẤT: Hủy từ Nhận đơn. CHƯA có sign-off của khách.'),
            ('ORDER-APPROVAL-002', 'CANCEL',  2, 10, 0, 'DRAFT', N'ĐỀ XUẤT: Hủy từ Đã chuyển xuống kho. CHƯA có sign-off của khách.'),
            ('ORDER-APPROVAL-002', 'CANCEL',  3, 10, 0, 'DRAFT', N'ĐỀ XUẤT: Hủy từ Đã xuất hàng. CHƯA có sign-off của khách.'),
            ('ORDER-APPROVAL-002', 'CANCEL',  4, 10, 0, 'DRAFT', N'ĐỀ XUẤT: Hủy từ Đơn đã xử lý chưa chuyển kho. CHƯA có sign-off của khách.'),
            ('ORDER-APPROVAL-002', 'CANCEL',  6, 10, 0, 'DRAFT', N'ĐỀ XUẤT: Hủy từ Đã đi gửi hàng. CHƯA có sign-off của khách.');
        -- Cố ý không có dòng cho FromStatusID = 7 (Khách đã nhận hàng) / 8 (Đã thu tiền).
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

/* Kiểm tra sau khi seed: các dòng mới phải là DRAFT, không tự APPROVED. */
SELECT ActionCode, CAST(FromStatusID AS VARCHAR(10)) + ' -> ' + CAST(ToStatusID AS VARCHAR(10)) AS Detail, Status
FROM dbo.AI_OrderApprovalTransitionTbl
WHERE ContractVersion = 'ORDER-APPROVAL-002' AND ActionCode IN ('SUBMIT', 'CANCEL')
ORDER BY ActionCode, FromStatusID;
GO
