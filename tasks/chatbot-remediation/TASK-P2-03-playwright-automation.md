# TASK-P2-03 — Playwright Guest/Manager/TDV

**Ưu tiên:** P2  
**Phụ thuộc:** Security Gate, metadata/response contract ổn định

**Trạng thái:** `DONE` — local/UAT, `2026-07-16`

## Mục tiêu

Tự động hóa hành vi người dùng thật và tạo artifact khi fail.

## Cấu trúc đề xuất

```text
playwright.config.ts
tests/e2e/
tests/auth/
tests/guest/
tests/manager/
tests/tdv/
```

## Việc cần làm

1. Tạo project `guest`, `manager`, `tdv` với storage state riêng.
2. Lấy tài khoản từ `.env.test`; không commit credential.
3. Theo dõi request/response của 28 lệnh.
4. Lưu screenshot, video, trace khi fail và xuất HTML report.
5. Mutation suite chỉ chạy khi `RUN_MUTATION_TESTS=true` và base URL là sandbox.
6. Thêm scripts `test:guest`, `test:manager`, `test:tdv`, `test:chatbot`, `test:all`.

## Tiêu chí nghiệm thu

- Guest chứng minh API trả 401 cả qua UI và gọi trực tiếp.
- Manager/TDV chạy độc lập, không dùng chung session.
- CI/local report xác định rõ lệnh, role, request ID và lỗi.

## Bằng chứng nghiệm thu

- Có ba project `guest`, `manager`, `tdv`; Manager/TDV dùng storage state riêng sinh từ `.env.uat.local` gitignored.
- Final `npm.cmd run test:p2`: 9 passed, 2 mutation-sandbox skipped, 0 failed.
- HTML/JSON report và trace/video/screenshot khi fail; mutation có khóa kép env + sandbox URL.
