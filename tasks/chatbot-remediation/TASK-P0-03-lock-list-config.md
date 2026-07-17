# TASK-P0-03 — Khóa `api-list-active` và `api-get-config`

**Ưu tiên:** P0 — Blocker  
**Phụ thuộc:** TASK-P0-00, TASK-P0-02  
**Tệp:** `API_ListActive.json`, `API_GetConfig.json`

## Mục tiêu

Không công bố danh mục lệnh, metadata hoặc datasource nội bộ cho người chưa xác thực/không có quyền.

## Việc cần làm

1. Gọi Shared Auth Guard ở cả hai workflow.
2. Lọc danh mục theo capability/scope.
3. Không trả `DataSourceValue`, procedure hoặc mapping backend nếu FE không cần.
4. `get-config` chỉ trả cấu hình lệnh được phép.
5. Áp dụng policy chống enumeration cho ApiCode không tồn tại/không có quyền.

## Contract

- `list-active`: có quyền một phần → 200 danh sách lọc; không có lệnh → 200 `data: []`; chatbot bị cấm toàn bộ → 403.
- `get-config`: 401 nếu chưa xác thực; 403/404 thống nhất theo anti-enumeration policy.

## Tiêu chí nghiệm thu

- Không token/sai token trả 401.
- User không nhìn thấy lệnh ngoài capability.
- Response không còn chi tiết backend không cần thiết.

## Tiến độ 2026-07-15

- [x] `api-list-active` và `api-get-config` gọi Shared Auth Guard sau nhánh OPTIONS.
- [x] Request chưa xác thực đi thẳng tới response 401; không chạm SQL.
- [x] Danh sách lệnh được lọc theo capability và chỉ trả trường UI công khai.
- [x] `get-config` kiểm tra capability trước SQL; ApiCode không tồn tại/không có quyền cùng trả 404 `CONFIG_NOT_FOUND`.
- [x] Ẩn system params và loại bỏ các trường ngoài projection UI khỏi response config.
- [x] Thêm regression test `test:api-catalog-auth`.
- [x] Import hai workflow lên staging n8n:
  - List Active UAT: `nqHaht2PiqPj0rcB`
  - Get Config UAT: `BBwhnNR32pOBNj6U`
- [x] Test webhook trực tiếp không token: cả hai trả 401 `AUTH_TOKEN_MISSING`; chỉ node auth error chạy, SQL không chạy.
- [x] Publish lại bằng path UAT riêng `uat-p005-api-list-active` và `uat-p005-api-get-config`; execution `1456`/`1458` xác nhận auth error chạy và node SQL không được ghi nhận.
- [x] Nghiệm thu Manager/TDV thật và publish production; guest 401 trước SQL, hai role hợp lệ nhận HTTP 200.
