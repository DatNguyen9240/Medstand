# TASK-P2-04 — Mutation và CART trong sandbox

**Ưu tiên:** P2 — Cuối cùng  
**Phụ thuộc:** Security Gate, Contract Gate, TASK-P2-03  
**Môi trường:** Sandbox có cleanup/rollback

**Trạng thái:** `DONE` — mutation sandbox, idempotency, audit, rollback/cleanup và CART double-click đã xác minh

## Phạm vi

- `@cap_nhat_ket_qua_khao_sat`
- `@khach_hang_insert`
- `@san_pham_trong_tam_import`
- `@lap_don_hang` từ CART tới submit sandbox

## Lớp 1 — Chatbot navigation/CART

- Không ghi DB và không gọi insert trước submit.
- Chuyển đúng khách hàng/sản phẩm.
- Không mất state và không nhân đôi item.
- Back/refresh có hành vi được định nghĩa.

## Lớp 2 — Mutation/submit sandbox

- Có review và confirmation.
- Double-click không tạo bản ghi lặp.
- Có idempotency key.
- Backend validation và authorization fail-closed.
- Transaction, rollback và audit hoạt động.
- Có cleanup dữ liệu test.

## Tiêu chí nghiệm thu

- Không tác động dữ liệu thật.
- Mỗi mutation có request ID, audit và kết quả cleanup.
- CART và submit được báo cáo thành hai nhóm riêng.

## Kết quả an toàn 2026-07-16

- Lớp 1: Manager và TDV mở CART `@lap_don_hang`; trước submit có 0 request mutation — PASS.
- Ba procedure `API_KhachHang_Insert_AI`, `API_SanPhamTrongTam_Import_AI`, `API_DonHangChiTiet_Insert_AI` đã hardening và deploy lên `medtest`: active identity, customer scope, JSON/ngày/ID và transaction fail-closed.
- `npm.cmd run test:p2-04-mutation-rollback`: customer, promotion và order đều tồn tại trong transaction test; sau `ROLLBACK`, tất cả header/detail/rule còn lại bằng `0`; invalid identity bị chặn 3/3.
- Manager và TDV chỉ có `api.read`: 8/8 request cho bốn mã mutation/DENY trả HTTP 403 trước SQL, có request ID. Audit 8/8 ghi idempotency SHA-256; ba mutation ghi có `TransactionOutcome=NOT_STARTED`, API khảo sát bị khóa ghi đúng `OperationType=DENY`.
- Audit migration đã mở rộng operation `DENY`; CHECK constraint trusted/enabled và quyền `DENY SELECT` cho `public` được giữ nguyên.
- Không tự cấp quyền ghi cho Manager/TDV. Capability gate positive được chạy bằng contract; authorized SQL pipeline dùng identity DB hợp lệ trong outer transaction và rollback toàn bộ.
- Hash-only reservation/replay đã deploy trên `medtest`: `ACQUIRED`, `IN_PROGRESS`, `REPLAY` đều PASS; bảng idempotency tiếp tục DENY truy cập trực tiếp cho `public`.
- Authorized customer/import 2/2 có mutation, audit `COMMITTED`, replay cùng key và cleanup còn 0 dòng sau rollback.
- CART runtime gọi hai submit đồng thời với cùng idempotency key chỉ phát một request mạng; gateway giữ nguyên `Idempotency-Key`.
- Gate cuối: HTTP Manager/TDV 2/2 fail-closed sau publish, audit negative 8/8, `test:release-local` và `git diff --check` PASS.
