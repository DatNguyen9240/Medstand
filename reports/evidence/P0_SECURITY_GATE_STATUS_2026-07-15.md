# P0 Security Gate status — 2026-07-15

## Kết luận

Role-only Security Gate đã **PASS 46/46** theo phạm vi Manager/TDV được duyệt. Production Release Gate cũng **PASS**: execute/list/config đã publish, CORS khóa tại `https://medtest.bms79.com`, và smoke production đạt.

## Trạng thái task

| Task | Trạng thái | Bằng chứng / blocker |
|---|---|---|
| P0-00 Shared Auth Guard | Hoàn tất component | Contract pass; workflow nội bộ đã được triển khai. |
| P0-01 Execute fail-closed | Hoàn tất theo phạm vi UAT | Negative path bị chặn trước SQL; Manager/TDV valid-mapped đạt live. |
| P0-02 Capability/data scope | Hoàn tất | Manager/TDV nhận baseline `api.read`; scope tampering đạt live; capability gate production đã publish. |
| P0-03 List/config | Hoàn tất | Guest bị chặn trước SQL; Manager/TDV thật gọi list/config đạt trên production. |
| P0-04 CORS/auth error | Hoàn tất | Allowlist production dùng `https://medtest.bms79.com`; ba endpoint trả JSON 401 có `code` và `requestId`. |
| P0-05 Auth regression | Hoàn tất role-only | `46/46` pass, `0` blocked, `0` fail; negative identities có contract test riêng. |

## Smoke test n8n staging

| Workflow | Execution | Kết quả |
|---|---:|---|
| Execute `69SnDy4QxGvfTGPc` | 1454 | 401 `AUTH_TOKEN_MISSING`; auth error có ghi nhận; SQL node không ghi nhận. |
| List `nqHaht2PiqPj0rcB` | 1456 | 401 `AUTH_TOKEN_MISSING`; auth error có ghi nhận; SQL node không ghi nhận. |
| Config `BBwhnNR32pOBNj6U` | 1458 | 401 `AUTH_TOKEN_MISSING`; auth error có ghi nhận; SQL node không ghi nhận. |

## Kiểm tra local

- `npm run test:p0`: chạy toàn bộ contract P0.
- `npm run test:release-local`: P0 contracts + weekly chart regression + build.
- Regression credential cũ không còn tự đăng nhập hoặc chứa password/API key mặc định.
- Live runner chỉ cho phép webhook `uat-p005-*` trên `localhost`/`127.0.0.1` kể cả khi gọi Node trực tiếp.

## Smoke test production

| Endpoint | Guest | Manager/TDV | CORS |
|---|---|---|---|
| `api-execute` | 401 `AUTH_TOKEN_MISSING` | HTTP 200 | `https://medtest.bms79.com` |
| `api-list-active` | 401 `AUTH_TOKEN_MISSING` | HTTP 200 | `https://medtest.bms79.com` |
| `api-get-config` | 401 `AUTH_TOKEN_MISSING` | HTTP 200 | `https://medtest.bms79.com` |

Workflow production canonical Execute/List/Config đang active. Workflow Execute trùng cũ `0xIfgxxondYICsqZ` đã inactive. Snapshot trước và sau publish được giữ trong `reports/` để rollback/đối chiếu.

Không ghi token, password hoặc payload nhạy cảm vào báo cáo này.
