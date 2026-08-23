# Biên bản sẵn sàng merge `hoangdang` → `develop`

**Ngày kiểm tra:** 23/08/2026

**Trạng thái:** `READY_TO_MERGE`

## Phạm vi và kết luận

Nhánh `hoangdang` đã được rà soát trên nền `origin/develop` tại `8cbb7c7`. `origin/develop` là ancestor của nhánh hiện tại nên có thể fast-forward sau khi đồng bộ remote. Không còn worktree phụ hoặc nhánh worktree chờ gộp.

Trạng thái `READY_TO_MERGE` xác nhận code, build, regression và vệ sinh Git của merge candidate đạt yêu cầu. `PROMO-CFG-002/003` đã hoàn tất trong lượt chốt này; trạng thái không tự đóng chuỗi `CUSTOMER-UAT-*` và các task phụ thuộc quyết định khách hàng còn nằm trong backlog.

## Kết quả kiểm tra cuối

| Nhóm | Kết quả |
| --- | --- |
| Git hygiene | `8/8 PASS`; 0 `.tmp`, 0 raw evidence, 0 local env được track; chỉ còn 1 worktree |
| Gateway/security guard | `22/22 PASS` |
| Hard-code fixture scan | `PASS`, 556 file, 0 runtime finding |
| Production build | `PASS` |
| `PRODUCT-DIAG-001` | contract `17/17 PASS`; live identity `5/5 PASS`; UI thật `3/3 PASS` |
| `PROMO-CFG-001` | rule/clamp/cache regression `8/8 PASS`; actual-order V3 PASS và rollback, `PersistentMutation=0` |
| `PROMO-CFG-002` | gateway identity `14/14`; permission/audit `16/16`; UI REJECT/WITHDRAW có request ID và audit actor/reason — đều PASS |
| `PROMO-CFG-003` | UI config A/B, stale-config guard, double-click và idempotency replay PASS; đơn test cuối được hủy |
| Order approval | transition `25/25 PASS`; edit guard `11/11 PASS`; normalization `20/20 PASS` |
| Draft/owner transition | draft flag `5/5 PASS`; owner transition PASS với 1 ca SKIP do thiếu fixture trạng thái 7; các verifier rollback |
| UAT readiness tool | `13 PASS / 0 FAIL / 2 SKIPPED`; hai ca thiếu tiền đề dữ liệu được giữ đúng là SKIPPED |

UI `PRODUCT-DIAG-001` được chạy qua Chrome headless trên live Gateway. Chatbot dùng đúng click/input của người dùng, lấy sản phẩm từ request danh mục thật và đối chiếu `X-Request-ID` của response với server log. Artifact ảnh/JSON chỉ được sinh cục bộ để review rồi xóa.

UI `PROMO-CFG-002/003` cũng được chạy lại trên Chrome thật. Verifier mới không lưu credential/PII, tự xóa chương trình CTBH tạm và hủy đơn test qua proc nghiệp vụ. Dry-run cleanup đã xác định đúng ba fixture CTBH cũ và ba đơn nháp A014; sau cleanup, truy vấn chốt trả `ActiveTestPrograms=0`, `ActiveTestDrafts=0`. Các đơn M002 của luồng khác không bị tác động.

## Vệ sinh và an toàn phát hành

- Đã loại khỏi Git 89 artifact thô: 12 file `.tmp` và 77 JSON/ảnh báo cáo runtime.
- `.gitignore` chặn raw JSON/ảnh/HAR/video trong `reports/` và toàn bộ `.tmp/`.
- Static server chặn cả `/reports/` và `/.tmp/`.
- Script E2E không còn mật khẩu UAT mặc định; mật khẩu phải đến từ biến môi trường hoặc `.env.uat.local` không được track.
- Gateway trả `X-Request-ID` đã được sinh/chuẩn hóa để Network timeline ghép chính xác với log, không phụ thuộc thứ tự hoàn tất của request song song.
- Không còn tiến trình server/n8n phục vụ test sau khi kiểm tra xong.

## Cách merge đề xuất

```powershell
git switch develop
git pull --ff-only origin develop
git merge --ff-only hoangdang
```

Nếu `origin/develop` thay đổi sau thời điểm biên bản này, phải cập nhật lại `hoangdang` và chạy tối thiểu `npm run verify:git-hygiene`, `node scripts/verify_order_status_guard.js`, `node scripts/scan_fixture_hardcode.js` và `node scripts/build.js` trước khi merge.

Biên bản này không thực hiện push, deploy hoặc merge vào `develop`.
