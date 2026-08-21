# ORDER-APPROVAL-002 — Hướng dẫn chốt hợp đồng duyệt đơn

Ngày lập: 21/08/2026. Áp dụng cho `medtest`.

Tài liệu này mô tả **những gì khách phải quyết**, và **cách bật quyết định đó vào hệ thống** sau khi có sign-off.

Mặc định khi chưa có gì được bật, hệ thống fail-closed: không ai duyệt được đơn nào. Riêng `medtest` hiện đang bật **chế độ test nội bộ** — xem mục 1.

## 1. Trạng thái hiện tại — ĐANG BẬT CHẾ ĐỘ TEST

Trên `medtest`, hợp đồng đang **sống ở chế độ test nội bộ** (quyết định ngày 21/08/2026, **không phải sign-off của khách**). Mọi dòng đang bật đều mang dấu `ApprovedBy = 'TEST-ORDER-APPROVAL-003'`.

| Vai trò | Phạm vi | Tự duyệt đơn mình tạo | Ghi chú |
| --- | --- | --- | --- |
| `KTDH`, `KTDH2`, `TN KTDH` (Kế toán) | Chi nhánh | **Không** | Quy trình thật. `NHUNG`/`LANANH` chưa có `BranchID` nên hiện vẫn báo `APPROVER_BRANCH_MISSING` |
| `QL`, `QLMN` (quản lý khu vực) | Chi nhánh | **Có** | Nới lỏng cho tiện test |
| `Manager = 1` (gồm tài khoản `demo`) | Chi nhánh | **Có** | Nới lỏng cho tiện test |

Transition đang bật: `APPROVE: 0 → 1`, `REJECT: 0 → -2` (từ chối bắt buộc nhập lý do).

Bật/tắt/xem trạng thái:

```bash
node scripts/apply_order_approval_test_contract.js            # xem đang bật gì
node scripts/apply_order_approval_test_contract.js --apply    # bật lại
node scripts/apply_order_approval_test_contract.js --retire   # tắt, quay về fail-closed
```

`--retire` chỉ gỡ đúng những dòng mang dấu `TEST-ORDER-APPROVAL-003`, không đụng dòng khách ký thật.

> **Cảnh báo:** phần "quản lý được tự duyệt đơn mình tạo" là chỗ **bỏ kiểm soát maker–checker**. Chấp nhận được ở `medtest` để một người test cả vòng, nhưng không được mang nguyên trạng ra môi trường thật khi chưa hỏi khách.

Nếu tắt chế độ test, hệ thống quay về fail-closed: `AI_OrderApprovalContractIsLiveFnc()` trả `0`, API duyệt trả `APPROVAL_CONTRACT_NOT_APPROVED`, UI không hiện nút Duyệt/Từ chối.

## 2. Khách cần quyết đúng 4 điểm

1. **Ma trận transition.** Đề xuất hiện tại: `APPROVE: 0 (Chờ duyệt) → 1 (Nhận đơn)`, `REJECT: 0 (Chờ duyệt) → -2 (TDV Kiểm tra lại)`. Có cần thêm `CANCEL`, `SUBMIT` (nháp `-1` → chờ duyệt `0`) hay không?
2. **Ai được duyệt.** Đề xuất hiện tại: nhóm `KTDH`, `KTDH2`, `TN KTDH`. Có thêm quản lý (`Manager = 1`, `QL`, `QLMN`) hay cấp toàn hệ thống không? *Lưu ý: mỗi vai trò thêm vào là một người có thể duyệt đơn thật, không phải chỉ để test cho tiện.*
3. **Phạm vi duyệt.** `BRANCH_MATCH` (chỉ duyệt đơn cùng chi nhánh) hay `GLOBAL` (toàn hệ thống)?
   - Nếu chọn `BRANCH_MATCH`: hai tài khoản kế toán đang hoạt động là `NHUNG` và `LANANH` **hiện chưa có `BranchID`**, phải gán trước, nếu không họ không duyệt được đơn nào. Đây là việc quản trị nhân sự, cần khách xác nhận từng tài khoản thuộc chi nhánh nào.
4. **Lý do từ chối.** Có bắt buộc nhập lý do khi từ chối không (`RequireReason`)? Đề xuất: có.

Ngoài ra, **maker–checker luôn bật**: người tạo đơn (hoặc nhân viên đứng tên đơn) không tự duyệt đơn của mình. Muốn mở ngoại lệ cho một vai trò nào đó thì phải nói rõ, và bật bằng cột `AllowSelfApproval`.

## 3. Khi khách ký thật thì phải làm gì

Chế độ test **không tự biến thành sign-off**. Sau khi có văn bản chốt:

1. Cập nhật `ApprovedBy`/`ApprovalRef` của các dòng transition và dòng Kế toán sang sign-off thật (mẫu ở mục 4).
2. **Quyết định số phận 3 dòng quản lý** (`QL`, `QLMN`, `MANAGER_FLAG=1`): khách đồng ý thì đổi `ApprovedBy` sang sign-off thật và cân nhắc đưa `AllowSelfApproval` về `0`; khách không đồng ý thì `RETIRED` chúng.
3. Chạy lại `node scripts/verify_order_approval_transition.js` để chắc chắn không có gì gãy.

Đối chiếu nhanh: `SELECT ApprovedBy, COUNT(*) FROM dbo.AI_OrderApprovalRoleTbl WHERE Status='APPROVED' GROUP BY ApprovedBy;` — còn dòng nào mang `TEST-ORDER-APPROVAL-003` nghĩa là chưa xử lý xong.

## 4. Bật hợp đồng sau khi có sign-off

Chỉ chạy khi đã có văn bản/biên bản chốt. `ApprovalRef` phải trỏ tới sign-off đó — ràng buộc `CHECK` của bảng không cho `APPROVED` mà thiếu `ApprovedBy` + `ApprovalRef`.

```sql
-- Ví dụ: chốt đúng phương án đề xuất, phạm vi theo chi nhánh.
UPDATE dbo.AI_OrderApprovalTransitionTbl
SET Status = 'APPROVED',
    ApprovedBy = '<người ký>',
    ApprovalRef = N'<mã/link biên bản sign-off>',
    EffectiveFrom = SYSUTCDATETIME(),
    ModifiedAt = SYSUTCDATETIME()
WHERE ContractVersion = 'ORDER-APPROVAL-002'
  AND ActionCode IN ('APPROVE', 'REJECT');

UPDATE dbo.AI_OrderApprovalRoleTbl
SET Status = 'APPROVED',
    ApprovedBy = '<người ký>',
    ApprovalRef = N'<mã/link biên bản sign-off>',
    EffectiveFrom = SYSUTCDATETIME(),
    ModifiedAt = SYSUTCDATETIME()
WHERE ContractVersion = 'ORDER-APPROVAL-002'
  AND PrincipalType = 'USER_GROUP'
  AND PrincipalValue IN ('KTDH', 'KTDH2', 'TN KTDH');
```

Thêm vai trò khác (chỉ khi khách chốt):

```sql
INSERT dbo.AI_OrderApprovalRoleTbl
    (ContractVersion, ActionCode, PrincipalType, PrincipalValue, ScopeRule, AllowSelfApproval,
     Status, ApprovedBy, ApprovalRef, EffectiveFrom, Notes)
VALUES
    ('ORDER-APPROVAL-002', '*', 'MANAGER_FLAG', '1', 'BRANCH_MATCH', 0,
     'APPROVED', '<người ký>', N'<mã sign-off>', SYSUTCDATETIME(), N'Khách chốt: quản lý chi nhánh được duyệt.');
```

Gỡ hiệu lực một dòng (không xóa, để giữ dấu vết):

```sql
UPDATE dbo.AI_OrderApprovalRoleTbl
SET Status = 'RETIRED', EffectiveTo = SYSUTCDATETIME(), ModifiedAt = SYSUTCDATETIME()
WHERE RoleRuleID = <id>;
```

Không cần deploy lại procedure hay frontend: cả API ghi và API đọc đều lấy quyết định từ hai bảng này.

## 5. Kiểm chứng sau khi bật

```bash
node scripts/verify_order_approval_transition.js   # 24 ca, chạy trong transaction luôn rollback
node scripts/verify_order_status_guard.js          # lớp chặn ở gateway, không cần DB
```

Sau đó kiểm tra bằng mắt trên một đơn thật:

```sql
SELECT dbo.AI_OrderApprovalContractIsLiveFnc(SYSUTCDATETIME()) AS IsLive;  -- phải = 1
EXEC dbo.API_DonHang_ApprovalContext_AI @Username = '<kế toán>', @DocumentID = '<mã đơn>';
```

`CanApprove = 1` thì UI mới hiện nút. Nếu `CanApprove = 0`, cột `BlockCode` nói rõ vì sao (`APPROVER_BRANCH_MISSING`, `SELF_APPROVAL_BLOCKED`, `ORDER_OUT_OF_BRANCH_SCOPE`, ...).

## 6. Điều KHÔNG được làm

- Không sửa `SY_User` (gán `BranchID`, đổi `UserGroupID`) chỉ để một ca test chạy qua. Đó là dữ liệu nhân sự thật.
- Không hard-code lại transition/vai trò vào procedure. Nếu thấy mình đang sửa `API_DonHang_ApproveTransition_AI` để thêm một mã trạng thái, nghĩa là đang đi sai đường.
- Không bật `Status = 'APPROVED'` khi chưa có `ApprovalRef` thật — ràng buộc `CHECK` sẽ chặn, và đó là chủ ý.
