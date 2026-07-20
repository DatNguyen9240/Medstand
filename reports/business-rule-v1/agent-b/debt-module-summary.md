# Agent B — Debt module delivery summary

**Scope:** chỉnh sửa renderer/state hiện có cho `@cong_no_khach_hang` và `@cong_no_chi_tiet`; không tạo route/app mới, không sửa SQL/n8n/package/generated assets.

## Đã sửa

- Danh sách Manager: KPI từ `responseMetadata.debtSummary`, tab trạng thái, lọc nhân viên/chi nhánh/quy mô/ưu tiên/tìm kiếm, 5 bản ghi ban đầu và sort theo trạng thái + field backend.
- Chi tiết khách hàng: header, scope/customer identity, 4 metric, trạng thái backend, bảng tối đa 5 hóa đơn, show more, gợi ý xử lý từ backend metadata.
- Nullable: dùng `??`; không tự tính quá hạn, hạn gần nhất, recommendation hoặc tồn kho.
- `NO_DATA`, `OUT_OF_SCOPE`, `VALIDATION_ERROR`, `SYSTEM_ERROR` không còn bị đổi thành thông báo “không có nợ”.
- Double-submit detail bị khóa 800ms; không có mutation control.
- `CONTRACT_DRIFT` ghi `ApiCode`, field, `ObjectType`, `ObjectID`, requestId và phát event `medstand:contract-drift`.
- CSS responsive desktop/tablet/mobile và focus-visible.

## Test evidence

| Hạng mục | Lệnh | Kết quả |
|---|---|---|
| Syntax | `node --check` cho 3 source JS | PASS |
| Diff whitespace | `git diff --check` trên source Agent B | PASS |
| Playwright Manager debt (B1 fixture) | `npm.cmd run test:manager -- --grep "@debt"` | PASS 4/4 |
| Playwright TDV debt (B1 fixture) | `npm.cmd run test:tdv -- --grep "@debt"` | PASS 4/4 |
| Build | `npm.cmd run build` | PASS; bundle/dist đã được refresh |

Playwright test source: `tests/e2e/debt-module.spec.js`. Matrix/output: `debt-module-playwright-output.md`. Không commit toàn bộ `playwright-report/` hoặc `test-results/`.

## Security/scope impact

Bản ghi không phải `ObjectType=CUSTOMER` bị loại bỏ fail-closed. UI không mở rộng scope từ request thủ công và không tạo đơn/thanh toán.

## Handoff / known gaps

- B2 runtime integration đang chờ Agent A bàn giao Contract Final và API evidence.
- B1 là fixture/source compatibility, không phải API runtime pass; 8/8 executions được phân loại rõ trong matrix.
- Ownership evidence chỉ chứng minh scoped Agent B diff vì workspace đã dirty trước lượt này; xem `debt-module-ownership-evidence.md`.
- API SQL hiện tại chưa đủ canonical fields cho danh sách; xem `debt-contract-drift.md`.
- Search/tab/xem thêm hiện là local trên payload fixture; server-side pagination/filter semantics phải được xác nhận ở B2.
- Bundle/minified/generated đã được Coordinator build lại; `git status --short` đã kiểm tra sau build.
