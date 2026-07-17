# TASK-P0-05 — Auth regression tự động

**Ưu tiên:** P0 — Security Gate  
**Phụ thuộc:** TASK-P0-00 đến TASK-P0-04  
**Tệp mới:** `scripts/test_chatbot_api_auth_regression.js`

## Mục tiêu

Tự động chứng minh request không hợp lệ bị chặn trước SQL.

## Ma trận

- Endpoint: execute, list-active, get-config.
- Identity: guest, token sai, token hết hạn, valid-unmapped, valid-no-scope, Manager, TDV.
- Với execute: chạy toàn bộ ApiCode đọc trong capability policy ở chế độ không scope (hiện có 26 mã).

## Assertion

- Missing/invalid/expired: 401.
- Valid-unmapped: 403 `IDENTITY_MAPPING_NOT_FOUND`.
- Valid-no-scope: 403 hoặc danh sách lọc/rỗng theo endpoint.
- SQL node không nhận input; database audit/profiler không có execution.
- Response có request ID và không chứa dữ liệu/debug.

## Tiêu chí nghiệm thu

- Test pass 100% mới mở Security Release Gate.
- Có report máy đọc được và bản tóm tắt cho QA/security.

## Tiến độ 2026-07-15

- [x] Thêm `scripts/test_chatbot_api_auth_regression.js`.
- [x] Kiểm tra contract cho execute/list/config với guest, token sai, token hết hạn và identity không mapping.
- [x] Kiểm tra toàn bộ read ApiCode trong capability policy ở trạng thái valid-no-scope; tất cả bị chặn trước SQL.
- [x] Kiểm tra list-active no-scope trả danh sách rỗng và get-config no-scope dùng 404 anti-enumeration.
- [x] Sinh báo cáo JSON và Markdown trong `reports/`.
- [x] Full runner chỉ có thể PASS sau khi gọi thật execute/list/config; không còn trạng thái `READY` giả khi mới chỉ có token.
- [x] Token không được ghi vào report; live runner chỉ lưu status/code/requestId và số lượng record.
- [x] Thêm `.env.uat.example` và runner `scripts/run_p0_05_uat.ps1`; `.env.uat.local` được Git bỏ qua.
- [x] Runner chỉ cho phép webhook UAT `uat-p005-*` trên localhost, không thể vô tình gọi production.
- [x] Xóa log giá trị `Authorization`, password/body và response snippet khỏi gateway trước khi dùng token thật; thêm `test:gateway-log-redaction`.
- [x] Thêm `scripts/capture_uat_identity_token.ps1`: password nhập ẩn, xác minh `API_UserInfo`, tự lưu token vào `.env.uat.local` mà không in token.
- [x] Chạy role-only mode với `UAT_MANAGER_TOKEN` và `UAT_TDV_TOKEN`: `46/46` pass, `0` blocked, `0` fail. Live negative identities không thuộc phạm vi UAT đã được người dùng duyệt; các nhánh này vẫn có contract test.
- [x] Cấu hình ba URL staging riêng trên workflow `69SnDy4QxGvfTGPc`, `nqHaht2PiqPj0rcB`, `BBwhnNR32pOBNj6U` và `.env.uat.local`.
- [x] Publish ba workflow UAT với path riêng; smoke test cả ba endpoint trả `401 AUTH_TOKEN_MISSING`, có `requestId` khi không token.
- [x] Thêm `test:p0-05-uat-runner` để khóa localhost, prefix `uat-p005-*` và việc Git bỏ qua token local.
- [x] Gỡ đăng nhập UAT và mật khẩu dùng chung khỏi regression runner cũ; token chỉ đọc từ biến môi trường, ca thiếu token bị `SKIPPED` theo fail-closed; thêm `test:regression-credential-safety`.
- [x] Khóa cả Node live runner vào webhook `uat-p005-*` trên localhost, chuẩn hóa Bearer token và từ chối lưu identity sai loại capability.
- [x] Thêm `scripts/capture_all_p0_05_tokens.ps1` để thu đủ Manager, TDV, unmapped và no-scope bằng password nhập ẩn.
- [x] Re-smoke ba webhook UAT ngày 2026-07-15: HTTP 401 `AUTH_TOKEN_MISSING`, có `requestId`; execution `1454`, `1456`, `1458` không ghi nhận node SQL.
- [x] Role-only Security Gate đạt 100%; report live và contract-only được tách riêng để không ghi đè bằng chứng.
