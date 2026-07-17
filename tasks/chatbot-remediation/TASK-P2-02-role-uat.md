# TASK-P2-02 — UAT Manager và TDV

**Ưu tiên:** P2  
**Phụ thuộc:** TASK-P2-01

**Trạng thái:** `DONE` — local/UAT, `2026-07-16`

## Mục tiêu

Xác nhận menu lệnh và phạm vi dữ liệu khác nhau đúng capability/scope.

## Việc cần làm

1. Chạy cùng bộ case bằng Manager và TDV.
2. So sánh danh mục lệnh được phép.
3. Xác nhận TDV chỉ thấy ownership/assignment.
4. Xác nhận Manager chỉ thấy branch/hierarchy được cấp.
5. Thử sửa EmployeeID/BranchID/Username ở request và xác nhận không mở rộng scope.
6. Test 1366×768, 1920×1080; zoom 80%, 100%, 125%.

## Tiêu chí nghiệm thu

- Không có dữ liệu cross-user/cross-branch trái quyền.
- User thiếu capability nhận 403 hoặc không thấy lệnh theo contract.
- UI role-aware không chỉ ẩn nút mà backend cũng chặn.

## Bằng chứng nghiệm thu

- Manager/TDV dùng storage state và token riêng.
- 1366×768 và 1920×1080 ở zoom 80%, 100%, 125% đều PASS cho hai role.
- Tamper EmployeeID, BranchID, Username không đổi scoped baseline 8 dòng ở cả hai role; report chỉ lưu count/status/request ID.
