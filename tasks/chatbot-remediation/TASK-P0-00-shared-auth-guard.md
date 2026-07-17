# TASK-P0-00 — Shared Auth Guard

**Ưu tiên:** P0 — Blocker  
**Phụ thuộc:** Không  
**Chủ trì:** Backend/n8n

**Trạng thái:** Hoàn thành component và contract test; đã import vào n8n DEV với workflow ID `9UxECqxRaPGMF8EM`. Việc nối/enforce ở ba endpoint thuộc TASK-P0-01 và TASK-P0-03.

## Mục tiêu

Tạo một component xác thực dùng chung, tránh copy logic giữa `API_Execute`, `API_ListActive` và `API_GetConfig`.

## Phạm vi

- Reusable n8n sub-workflow hoặc service xác thực chung.
- Identity model: `subject`, `internalUserId`, `employeeId`, `branchIds`, `capabilities`, `scopeContext`, `tokenExpiry`.
- Error contract chung cho 401/403.

## Việc cần làm

1. Nhận Bearer token hoặc session cookie tại entrypoint.
2. Xác minh chữ ký, thời hạn và danh tính; không chỉ decode JWT.
3. Ánh xạ user token sang tài khoản/phạm vi nội bộ.
4. Trả `verifiedIdentity` cho endpoint-specific authorization.
5. Phân biệt token lỗi (401) với identity hợp lệ nhưng không map nội bộ (403).
6. Không log token, cookie hoặc payload nhạy cảm.

## Tiêu chí nghiệm thu

- Có một Shared Auth Guard import được, không public webhook và không lộ token trong output.
- Sau TASK-P0-01/P0-03, ba workflow phải dùng component này và không còn ba bản copy logic xác thực.
- Token thiếu/sai/hết hạn có cùng response contract.
- Identity mapping có test unit/integration.

## Rollback

Khôi phục workflow version trước đó và environment variables liên quan; chạy lại auth smoke test.
