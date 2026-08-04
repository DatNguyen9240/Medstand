# Baseline kỹ thuật và UAT hiện hành

- Cập nhật: `03/08/2026`
- Môi trường: frontend `11.126`, DB `medtest`, timezone `UTC+07:00`

Tài liệu này thay thế các báo cáo UAT/CORE theo từng ngày đã hoàn tất. Chi tiết task và việc còn lại được quản lý tại [backlog](BACKLOG_TASK_PHAT_TRIEN_MEDSTAND_AI_2026-07-27.md); contract nghiệp vụ vẫn nằm trong các tài liệu contract riêng.

## Kết luận hiện tại

Phần chức năng chính, phân quyền, tồn kho, dữ liệu mẫu và regression đều đã đạt các gate kỹ thuật. Chưa công bố `UAT_BASELINE_READY` vì runtime n8n vẫn có webhook active trùng và admin upload key vẫn còn fallback trong source.

| Hạng mục | Kết quả | Trạng thái |
|---|---|---|
| Đăng nhập và smoke | 13/13 tài khoản; smoke 8/8 | PASS |
| Phạm vi khách hàng | 13/13, không rò rỉ chéo vùng | PASS |
| Phạm vi kho | 13/13, chỉ `CTY/DL02/DL03` | PASS |
| Hội thoại tự nhiên | static 159/159; live 31/31 | PASS |
| Hiệu năng AI | p95 5.668 giây, đạt ngưỡng dưới 6 giây | PASS |
| Idempotency đơn hàng | replay trả mã cũ; payload khác cùng key bị từ chối | PASS ở SQL/gateway; còn UAT UI cho CORE-005 |
| Phân nhóm khách hàng | 52/52 ca A/B/C/UNRATED | PASS ở SQL/API; còn ảnh/token UI cho CORE-007 |
| Tồn khả dụng theo quyền | SQL, API, n8n, frontend và token UAT | DONE |
| n8n unique active webhook | `intent-parser` và `api-list-active` còn trùng active | FAIL/P0 |
| Secret admin upload | còn fallback tương thích UAT trong `server.js` | OPEN/P1 trước production |

## Trạng thái CORE và STOCK

| Task | Trạng thái hiện hành | Ghi chú |
|---|---|---|
| CORE-001 | Contract locked | Chat tạo trực tiếp qua `API_KhachHang_Insert_AI`; thành công khi `MsgType = 5` và có `ObjectID` |
| CORE-002 | DONE | Form thu thập bảy trường, cascade địa chỉ, validate và preview trước khi ghi |
| CORE-003 | DONE | Xác nhận rõ ràng, chống trùng và audit; chưa xác nhận/hủy không ghi DB |
| CORE-004 | Contract locked | Tách rõ `preview/confirmed/created/failed`; SQL quyết định giá, CTBH, tồn, kho và mã đơn |
| CORE-005 | Pending end-to-end UAT | SQL đã deploy; rollback mutation và idempotency đạt; còn token/UI thật, concurrency và request ID |
| CORE-006 | Contract approved | Rule `BR-TIER-005/2.0.0` đọc từ cấu hình, không hard-code ngưỡng trong procedure |
| CORE-007 | Pending UI evidence | SQL/API và 13 tài khoản đạt; còn bộ lọc UI A/B/C/UNRATED, ảnh và request ID |
| STOCK-001 | DONE | Công thức chung `max(tồn vật lý chưa hết hạn - lượng giữ, 0)`; chỉ gợi ý hàng có giá và tồn khả dụng dương |

Contract chi tiết được giữ tại:

- [Tạo khách hàng](CORE-001_CONTRACT_CHAT_TAO_KHACH_HANG_2026-07-29.md)
- [Lập đơn hàng](CORE-004_CONTRACT_CHAT_LAP_DON_HANG_2026-08-03.md)
- [Phân nhóm A/B/C](CORE-006_CONTRACT_PHAN_NHOM_ABC_2026-08-03.md)

## Dữ liệu UAT hiện hành

### Bộ `UATV2_`

- 28 khách: mỗi cohort có A, B, C và `UNRATED`.
- 91 đơn, 63 hóa đơn, 7 trả hàng, 7 công nợ và 3 sản phẩm trọng tâm.
- 13/13 tài khoản nhìn thấy đúng bốn khách của cohort.
- Rule lấy từ version `APPROVED`; dữ liệu không sửa khách/đơn nghiệp vụ thật.
- SQL: `sql/Seed_UATV2_Current_Data_13_Accounts.sql`.
- Hậu kiểm: `node scripts/verify_uatv2_seed_13_accounts.js`.

### Bộ `UATREV_`

- Bổ sung doanh số ngày `01/08/2026`: 7 dòng, tổng `22.750.000đ`.
- Bổ sung doanh số ngày `02/08/2026`: 7 dòng, tổng `26.250.000đ`.
- `13 tài khoản × 2 ngày = 26/26` ca qua `API_DoanhSo_AI`.
- SQL: `sql/Seed_UAT_Daily_Revenue_13_Accounts.sql`.
- Preflight: `node scripts/seed_uat_daily_revenue_13_accounts.js --preflight`.
- Deploy: `node scripts/seed_uat_daily_revenue_13_accounts.js --apply`.

## Kết quả UAT đã chốt

| Nhóm | Task | Kết quả tóm tắt |
|---|---|---|
| Release | UAT-001–003 | Manifest, frontend và SQL đã được khóa/deploy/đối chiếu theo candidate |
| Runtime | UAT-004–005 | Còn P0 workflow trùng và P1 fallback secret; xem mục việc mở |
| Quyền và dữ liệu | UAT-006–010 | 13/13 đăng nhập, scope khách/kho, fixture và ngày chốt đều đạt |
| Read flow | UAT-011–016 | Gợi ý đơn, tuyến, scoring, upsell, tồn và tra cứu sản phẩm đều 13/13 |
| Mutation | UAT-017–018 | Tạo khách và tạo đơn có validate, scope và idempotency; CORE-005 còn UI UAT mới |
| Regression | UAT-019–021 | Live 31/31, hiệu năng đạt, truy vấn lặp nhất quán và double-click không tạo trùng |
| Bàn giao | UAT-022–024 | Lỗi đã phân loại, tài liệu khách hàng đã cập nhật; release vẫn bị chặn bởi P0 n8n |

Bằng chứng máy đọc vẫn được giữ trong `reports/`; script kiểm tra vẫn được giữ trong `scripts/`. Không cần duy trì một file Markdown riêng cho từng lần chạy.

## Việc còn mở

### P0 — Hai webhook path có workflow active trùng

Đối chiếu read-only trực tiếp `n8n-system/n8n_data/.n8n/database.sqlite` ngày `03/08/2026`:

- `intent-parser`: `ZQPz4sbzz9pqSO8W` và `Gn7nDjDgGUFOWni5` cùng active.
- `api-list-active`: `FRbuGdI9jz0ZZIvU` và `nqHaht2PiqPj0rcB` cùng active.
- `hook-ai-dainao` và `api-execute` hiện chỉ còn một workflow active mỗi path.

Điều kiện đóng: giữ đúng workflow theo manifest, deactivate bản còn lại, export runtime mới và chạy `node scripts/verify_n8n_runtime.js <export>` đạt exit code `0`.

### P1 — Secret admin upload

`server.js` còn fallback admin upload key để tương thích UAT. Trước production, key phải chỉ đến từ environment/secret manager và workflow export không được chứa giá trị dùng được.

### UAT nghiệp vụ còn thiếu

- CORE-005: tạo đơn qua token/UI thật, double-click/concurrency, ảnh/log và request ID.
- CORE-007: thao tác bộ lọc A/B/C/UNRATED qua UI/token thật, ảnh và request ID.

## Bằng chứng và lệnh chạy lại

- UAT tài khoản và phạm vi: `scripts/verify_uat007_customer_scope.js`, `scripts/verify_uat008_warehouse_scope.js`.
- Các luồng đọc: `scripts/verify_uat011_order_recommendations.js` đến `scripts/verify_uat016_product_symptom_lookup.js`.
- Tạo khách/đơn: `scripts/verify_uat017_customer_create.js`, `scripts/verify_uat018_order_create.js`.
- Scoring: `scripts/verify_core006_postdeploy.js`, `scripts/verify_uatv2_seed_13_accounts.js`.
- Tồn khả dụng: `scripts/verify_stock001_postdeploy.js`, `scripts/verify_stock001_token_uat.js`.
- Bằng chứng live/performance: `reports/uat023-*.json`, `reports/uat020-*.json`.
