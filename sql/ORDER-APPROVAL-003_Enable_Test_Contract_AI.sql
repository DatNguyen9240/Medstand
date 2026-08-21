SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  ORDER-APPROVAL-003 — BẬT HỢP ĐỒNG DUYỆT ĐƠN Ở CHẾ ĐỘ TEST.

  ĐÂY KHÔNG PHẢI SIGN-OFF CỦA KHÁCH. Quyết định nội bộ ngày 21/08/2026 để chạy thử luồng
  Sale tạo đơn -> duyệt đơn khi khách chưa chốt ORDER-APPROVAL-002:

    - Quy trình thật vẫn là: Sale tạo đơn, Kế toán đơn hàng (KTDH/KTDH2/TN KTDH) duyệt,
      theo chi nhánh, KHÔNG được tự duyệt đơn mình lập.
    - Thêm cho tiện test: quản lý khu vực (UserGroupID 'QL', 'QLMN') và tài khoản có cờ
      SY_User.Manager = 1 cũng được duyệt, trong phạm vi chi nhánh của mình, VÀ được tự duyệt
      đơn do chính mình tạo (AllowSelfApproval = 1) để một người một tài khoản test được cả
      vòng. Đây là chỗ NỚI LỎNG kiểm soát maker-checker — chỉ dùng ở môi trường test.

  Mọi dòng do file này bật đều mang dấu ApprovedBy = 'TEST-ORDER-APPROVAL-003' để:
    - phân biệt với dòng khách ký thật (script này KHÔNG bao giờ ghi đè dòng có ApprovedBy khác);
    - tắt lại được bằng một lệnh (xem phần cuối file, hoặc
      `node scripts/apply_order_approval_test_contract.js --retire`).

  Khi khách ký thật: cập nhật ApprovedBy/ApprovalRef của các dòng transition + dòng KTDH sang
  sign-off thật, và RETIRE các dòng quản lý nếu khách không đồng ý mở quyền đó.
*/

DECLARE @TestApprover VARCHAR(100) = 'TEST-ORDER-APPROVAL-003';
DECLARE @TestRef NVARCHAR(200) = N'TEST-ONLY — quyết định nội bộ 21/08/2026, chưa có sign-off khách (ORDER-APPROVAL-002).';

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    /* -- 1. Transition: bật đúng 2 dòng đề xuất từ khảo sát ORDER-APPROVAL-001 ------- */
    UPDATE dbo.AI_OrderApprovalTransitionTbl
    SET Status = 'APPROVED',
        ApprovedBy = @TestApprover,
        ApprovalRef = @TestRef,
        EffectiveFrom = SYSUTCDATETIME(),
        EffectiveTo = NULL,
        ModifiedAt = SYSUTCDATETIME()
    WHERE ContractVersion = 'ORDER-APPROVAL-002'
      AND ActionCode IN ('APPROVE', 'REJECT')
      /* Không đụng dòng khách đã ký thật. */
      AND (Status = 'DRAFT' OR ApprovedBy = @TestApprover);

    /* -- 2. Kế toán đơn hàng: quy trình thật, KHÔNG tự duyệt ------------------------- */
    UPDATE dbo.AI_OrderApprovalRoleTbl
    SET Status = 'APPROVED',
        AllowSelfApproval = 0,
        ScopeRule = 'BRANCH_MATCH',
        ApprovedBy = @TestApprover,
        ApprovalRef = @TestRef,
        EffectiveFrom = SYSUTCDATETIME(),
        EffectiveTo = NULL,
        ModifiedAt = SYSUTCDATETIME()
    WHERE ContractVersion = 'ORDER-APPROVAL-002'
      AND PrincipalType = 'USER_GROUP'
      AND PrincipalValue IN ('KTDH', 'KTDH2', 'TN KTDH')
      AND (Status = 'DRAFT' OR ApprovedBy = @TestApprover);

    /* -- 3. Quản lý khu vực: thêm cho tiện test, ĐƯỢC tự duyệt ----------------------- */
    MERGE dbo.AI_OrderApprovalRoleTbl AS target
    USING (VALUES
        ('USER_GROUP',   'QL',   N'TEST: quản lý khu vực miền Bắc/miền Trung được duyệt trong chi nhánh mình.'),
        ('USER_GROUP',   'QLMN', N'TEST: quản lý khu vực miền Nam được duyệt trong chi nhánh mình.'),
        ('MANAGER_FLAG', '1',    N'TEST: tài khoản có cờ Manager = 1 được duyệt trong chi nhánh mình (gồm tài khoản demo).')
    ) AS source (PrincipalType, PrincipalValue, Notes)
        ON target.ContractVersion = 'ORDER-APPROVAL-002'
       AND target.ActionCode = '*'
       AND target.PrincipalType = source.PrincipalType
       AND target.PrincipalValue = source.PrincipalValue
    WHEN MATCHED AND (target.Status = 'DRAFT' OR target.ApprovedBy = @TestApprover) THEN
        UPDATE SET Status = 'APPROVED',
                   ScopeRule = 'BRANCH_MATCH',
                   AllowSelfApproval = 1,
                   ApprovedBy = @TestApprover,
                   ApprovalRef = @TestRef,
                   EffectiveFrom = SYSUTCDATETIME(),
                   EffectiveTo = NULL,
                   Notes = source.Notes,
                   ModifiedAt = SYSUTCDATETIME()
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (ContractVersion, ActionCode, PrincipalType, PrincipalValue, ScopeRule, AllowSelfApproval,
                Status, ApprovedBy, ApprovalRef, EffectiveFrom, Notes)
        VALUES ('ORDER-APPROVAL-002', '*', source.PrincipalType, source.PrincipalValue, 'BRANCH_MATCH', 1,
                'APPROVED', @TestApprover, @TestRef, SYSUTCDATETIME(), source.Notes);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

/*
  TẮT CHẾ ĐỘ TEST (giữ nguyên dòng khách đã ký, nếu có):

  UPDATE dbo.AI_OrderApprovalTransitionTbl
  SET Status = 'RETIRED', EffectiveTo = SYSUTCDATETIME(), ModifiedAt = SYSUTCDATETIME()
  WHERE ApprovedBy = 'TEST-ORDER-APPROVAL-003' AND Status = 'APPROVED';

  UPDATE dbo.AI_OrderApprovalRoleTbl
  SET Status = 'RETIRED', EffectiveTo = SYSUTCDATETIME(), ModifiedAt = SYSUTCDATETIME()
  WHERE ApprovedBy = 'TEST-ORDER-APPROVAL-003' AND Status = 'APPROVED';
*/

SELECT 'TRANSITION' AS Kind, ActionCode,
       CAST(FromStatusID AS VARCHAR(10)) + ' -> ' + CAST(ToStatusID AS VARCHAR(10)) AS Detail,
       CAST(NULL AS VARCHAR(5)) AS SelfApprove, Status, ApprovedBy
FROM dbo.AI_OrderApprovalTransitionTbl
UNION ALL
SELECT 'ROLE', ActionCode, PrincipalType + '=' + PrincipalValue + ' / ' + ScopeRule,
       CASE WHEN AllowSelfApproval = 1 THEN 'YES' ELSE 'NO' END, Status, ApprovedBy
FROM dbo.AI_OrderApprovalRoleTbl
ORDER BY Kind, Detail;
GO
