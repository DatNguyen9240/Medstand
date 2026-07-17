# Chatbot API Remediation Tasks

Nguồn kế hoạch: [`KE_HOACH_FIX_CHATBOT_API_2026-07-15.md`](../../docs/remediation/KE_HOACH_FIX_CHATBOT_API_2026-07-15.md).

## Quy tắc thực hiện

- Không làm P1/P2 trước khi Security Release Gate của P0 đạt 100%.
- Không test mutation trên dữ liệu thật.
- Mỗi task phải có bằng chứng test không chứa dữ liệu nhạy cảm.
- Không đánh dấu hoàn thành chỉ dựa vào HTTP status; với auth phải chứng minh SQL/SP không chạy.

## Thứ tự task

1. [TASK-P0-00 — Shared Auth Guard](TASK-P0-00-shared-auth-guard.md)
2. [TASK-P0-01 — API Execute fail-closed](TASK-P0-01-api-execute-fail-closed.md)
3. [TASK-P0-02 — Capability và data scope](TASK-P0-02-capability-data-scope.md)
4. [TASK-P0-03 — Khóa list/config](TASK-P0-03-lock-list-config.md)
5. [TASK-P0-04 — CORS và auth error contract](TASK-P0-04-cors-auth-errors.md)
6. [TASK-P0-05 — Auth regression](TASK-P0-05-auth-regression.md)
7. [TASK-P1-01 — Response envelope](TASK-P1-01-response-envelope.md)
8. [TASK-P1-02 — Metadata contract/version](TASK-P1-02-metadata-contract.md)
9. [TASK-P1-03 — Validation FE/backend](TASK-P1-03-validation.md)
10. [TASK-P1-04 — Request ID và audit](TASK-P1-04-request-id-audit.md)
11. [TASK-P2-01 — UI matrix 28 lệnh](TASK-P2-01-ui-command-matrix.md)
12. [TASK-P2-02 — UAT Manager/TDV](TASK-P2-02-role-uat.md)
13. [TASK-P2-03 — Playwright automation](TASK-P2-03-playwright-automation.md)
14. [TASK-P2-04 — Mutation và CART sandbox](TASK-P2-04-mutation-cart-sandbox.md)

## Release gates

- **Security Gate:** **PASS**. Role-only UAT Manager/TDV đạt **46/46**; production Execute/List/Config đã publish và smoke thành công với CORS `https://medtest.bms79.com`.
- **Contract Gate:** hoàn thành P1-01 đến P1-04.
- **Full Feature DoD:** hoàn thành toàn bộ P2 và báo cáo regression.

## Trạng thái kiểm tra gần nhất

- Báo cáo: `reports/P0_SECURITY_GATE_STATUS_2026-07-15.md`.
- Local release check: `npm run test:release-local` — PASS ngày 2026-07-15.
- Chạy lại role-only gate: `powershell -ExecutionPolicy Bypass -File scripts/run_p0_05_uat.ps1`.
- Chế độ negative identity đầy đủ chỉ chạy khi được yêu cầu: thêm `-FullNegativeIdentityGate`.
