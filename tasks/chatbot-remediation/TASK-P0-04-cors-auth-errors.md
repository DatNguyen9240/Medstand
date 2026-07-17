# TASK-P0-04 — CORS baseline và auth error contract

**Ưu tiên:** P0  
**Phụ thuộc:** TASK-P0-00 đến TASK-P0-03

## Mục tiêu

Đồng bộ CORS và lỗi xác thực ở cả ba endpoint.

## Việc cần làm

1. Cấu hình origin allowlist theo domain triển khai.
2. OPTIONS và POST dùng cùng policy origin/method/header.
3. Chỉ cho phép method/header cần thiết.
4. 401/403 luôn trả JSON envelope, không trả HTTP 200 body rỗng.
5. Xác nhận CORS không được dùng thay authentication.

## Tiêu chí nghiệm thu

- Origin được phép hoàn tất preflight.
- Origin không được phép không đọc được response.
- Không còn `Access-Control-Allow-Origin: *` trên endpoint nhạy cảm.
- Auth response nhất quán trên execute/list/config.

## Tiến độ 2026-07-15

- [x] Áp dụng cùng allowlist cho ba endpoint nhạy cảm: local `localhost/127.0.0.1:3000` và UAT `https://medtest.bms79.com`.
- [x] OPTIONS và POST cùng trả policy `POST, OPTIONS`, header `Content-Type, Authorization, x-api-key` và `Vary: Origin`.
- [x] Loại bỏ `Access-Control-Allow-Origin: *` khỏi toàn bộ response node của execute/list/config.
- [x] Loại bỏ wildcard khỏi cấu hình CORS toàn cục của cả `run_n8n.js` và `start_n8n.bat`.
- [x] Origin không nằm trong allowlist nhận origin không khớp `https://cors.invalid`, nên trình duyệt không được đọc response.
- [x] 401/403 dùng JSON envelope có `code`, `message`, `requestId`.
- [x] Thêm regression test `test:api-cors-auth`.
- [x] Import ba workflow CORS baseline lên staging và khôi phục credential SQL.
- [x] Chạy preflight trực tiếp trên cả ba endpoint staging:
  - Origin `http://localhost:3000` nhận đúng origin.
  - Origin `https://evil.example` chỉ nhận origin mặc định `http://localhost:3000`, nên trình duyệt chặn đọc response.
- [x] POST không token trên cả ba endpoint trả 401 JSON, có `requestId`, `Vary: Origin`; SQL không chạy.
- [x] Xác nhận domain production `https://medtest.bms79.com`, publish và smoke cả ba endpoint thành công.
