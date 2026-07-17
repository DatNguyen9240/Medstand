# Scripts map

## Gate chính

- `npm.cmd run test:release-local`: contract, regression, build frontend.
- `npm.cmd run test:p2-04`: CART, idempotency DB, rollback, authorized pipeline và audit.
- `npm.cmd run check:n8n-publish`: so sánh workflow local với version active trong n8n SQLite.
- `npm.cmd run test:p2`: Playwright UAT Manager/TDV.

## Quy ước

- `test_*`: contract/regression test; không dùng để deploy.
- `capture_*`, `run_*_uat`: runner UAT, token chỉ nằm trong file local ignored.
- `manage_api_danh_muc_core.js`: inspect/deploy/verify riêng cho catalog core.

Các patch generator `apply_*`, workflow builder tạm và script UAT đã được source chính thay thế đều đã xóa sau khi remediation hoàn tất.

Credential test được nạp qua `lib/load-local-env.js` và `lib/test-db-config.js`; không đọc từ README.
