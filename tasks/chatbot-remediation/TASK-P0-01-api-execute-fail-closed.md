# TASK-P0-01 — `api-execute` fail-closed

**Ưu tiên:** P0 — Blocker  
**Phụ thuộc:** TASK-P0-00  
**Tệp:** `n8n/API_Services/API_Execute.json`

**Trạng thái:** Hoàn thành trong phạm vi UAT Manager/TDV đã được duyệt. Workflow production `fCJwiyAT9r6eh1ys` chặn no-token, malformed-token và expired-token trước SQL; staging `69SnDy4QxGvfTGPc` đã đạt valid-mapped live cho Manager/TDV. Nhánh valid-unmapped tiếp tục được chứng minh bằng contract fail-closed, không yêu cầu tạo thêm tài khoản thật.

## Mục tiêu

Không cho request chưa xác thực đi đến node SQL.

## Việc cần làm

1. Gọi Shared Auth Guard ngay sau webhook/OPTIONS.
2. Token thiếu/sai/hết hạn: trả 401 trước node SQL.
3. Token hợp lệ nhưng không map user nội bộ: trả 403 `IDENTITY_MAPPING_NOT_FOUND`.
4. Chỉ dựng SQL khi có `verifiedIdentity` và authorization pass.
5. Loại bỏ HTTP 200 body rỗng cho lỗi token.
6. Không trả `debug_username`, raw backend response hoặc SQL detail.

## Tiêu chí nghiệm thu

- Không token, token giả, token hết hạn đều trả 401.
- SQL node không nhận input trong ba ca trên.
- Token hợp lệ mới sang authorization.
- Mọi lỗi có JSON envelope và request ID.

## Test bắt buộc

- No token / malformed / expired / valid-unmapped / valid-mapped.
- Kiểm tra n8n execution path và database audit, không chỉ HTTP.
