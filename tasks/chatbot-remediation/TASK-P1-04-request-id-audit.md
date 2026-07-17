# TASK-P1-04 — Request ID và audit

**Ưu tiên:** P1  
**Phụ thuộc:** Security Gate P0

**Trạng thái:** `DONE` — DB/UAT/production, `2026-07-16`

## Mục tiêu

Theo dõi một request xuyên n8n/authorization/SQL mà không log dữ liệu nhạy cảm.

## Việc cần làm

1. Server sinh request ID tại entrypoint; ID client chỉ là correlation hint đã validate.
2. Truyền cùng ID qua auth, authorization, SQL audit và response.
3. Mọi response lỗi có request ID nhưng không có stack trace.
4. Audit: time, requestId, verified user, ApiCode, operation, result, duration.
5. Cân nhắc bỏ/nhóm hóa row count cho API nhạy cảm.
6. Mutation log idempotency key và commit/rollback.
7. Không log token, cookie, tên khách hàng, điện thoại hoặc payload đầy đủ.
8. Thiết lập access control và retention policy.

## Tiêu chí nghiệm thu

- Tra được một request end-to-end bằng request ID.
- Security/QA đọc được audit; user thường không đọc được.
- Log scan không phát hiện token/PII bị ghi.

## Bằng chứng nghiệm thu

- HTTP UAT 6/6 và audit trace 6/6 PASS; request ID khớp body, `X-Request-ID` và audit.
- Correlation hint, verified user và idempotency key chỉ lưu SHA-256; không lưu token/cookie/payload.
- Direct table access bị DENY; đọc audit qua stored procedure có role check; retention mặc định 90 ngày.
- `npm.cmd run test:release-local` PASS sau khi publish canonical workflows.
