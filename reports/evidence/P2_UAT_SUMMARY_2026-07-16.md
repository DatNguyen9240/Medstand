# P2 UAT Summary — 2026-07-16

## Kết quả tổng

- Lệnh chạy: `npm.cmd run test:p2`
- Playwright: 9 passed, 2 skipped, 0 failed.
- Hai case skipped là submit mutation sandbox; safety gate hoạt động đúng vì chưa có sandbox cô lập/cleanup.

## P2-01 — UI command matrix

- Manager: 24/24 lệnh live PASS menu và config.
- TDV: 24/24 lệnh live PASS menu và config.
- Tổng 48 config được kiểm tra FieldCode, label/placeholder, ControlType, system-field filtering, contract version và request ID.
- Đã chốt 28 legacy = 24 READ role-visible + 1 DENY + 3 mutation; không thêm API giả để đủ số lượng.
- Manager và TDV mỗi role đạt 24/24 execute + renderer. Mỗi evidence chỉ lưu HTTP status, code, count, request ID và template.
- Trong lúc chạy phát hiện hai route khảo sát trỏ procedure thiếu; đã deploy wrapper fail-closed, thêm date filter cho lịch sử và chuyển BranchID thành verified system param.
- Quét sau sửa: 24 active READ API, 0 procedure missing. P2-01 chuyển `DONE`.
- Phát hiện và sửa lỗi FE: catalog P1-04 trả `{ records, requestId }` nhưng engine cũ chỉ đọc array/`data`, làm menu `@` rỗng.

## P2-02 — Manager/TDV UAT

- Session Manager và TDV tách riêng.
- 1366×768 và 1920×1080 tại zoom 80%, 100%, 125% đều PASS.
- Với cả hai role, sửa EmployeeID, BranchID hoặc Username trong request không đổi scoped baseline 8 dòng.
- Artifact chỉ lưu field tamper, status, code, count và request ID; không lưu dữ liệu nghiệp vụ.

## P2-03 — Automation

- Ba project: guest, manager, tdv.
- Guest chứng minh UI auth guard và API 401 `AUTH_TOKEN_MISSING` có request ID.
- HTML report, JSON report, screenshot/video/trace khi fail.
- Scripts: `test:guest`, `test:manager`, `test:tdv`, `test:chatbot`, `test:p2`, `test:all`.
- Runner xác minh nội dung Medstand thay vì chỉ tin port 3000; tự chọn cổng 3001..3010 nếu bị app khác chiếm và dùng n8n IPv4 `127.0.0.1`.
- Kết quả tách tải: execute/renderer matrix 2 pass; phần còn lại 9 pass, 2 mutation skip, 0 fail.

## P2-04 — CART/mutation sandbox

- CART navigation trước submit: 0 mutation call cho Manager và TDV — PASS.
- SQL rollback sandbox: 3/3 PASS cho customer, promotion và order; tất cả bảng liên quan còn `0` sentinel sau rollback. Invalid identity fail-closed 3/3.
- HTTP negative authorization: Manager/TDV đạt 8/8 HTTP 403 trước SQL cho 1 DENY + 3 mutation; đủ request ID và audit, idempotency chỉ lưu SHA-256.
- Đã deploy hardening ba procedure mutation và sửa audit lưu đúng `OperationType=DENY`; CHECK constraint trusted/enabled, direct audit read vẫn DENY.
- Hash-only reservation/replay đã deploy: DB xác nhận `ACQUIRED`, duplicate đang chạy nhận `IN_PROGRESS`, duplicate hoàn tất nhận `REPLAY`; rollback và reacquire PASS.
- Authorized rollback pipeline customer/import 2/2 PASS: mutation, audit `COMMITTED`, replay cùng key và cleanup còn 0 dòng. Không cấp quyền ghi cho Manager/TDV.
- CART double-click runtime PASS: hai submit đồng thời dùng cùng key chỉ tạo một `fetch`, gateway chuyển tiếp `Idempotency-Key`.
- Sau publish, HTTP negative authorization Manager/TDV 2/2 PASS; audit negative 8/8 và release-local PASS. P2-04 chuyển `DONE`.
- Gate tái chạy toàn bộ: `npm.cmd run test:p2-04` (CART, idempotency DB, mutation rollback, authorized pipeline và audit).
