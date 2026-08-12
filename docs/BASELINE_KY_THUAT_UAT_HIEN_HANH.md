# Baseline kỹ thuật và UAT hiện hành

- Cập nhật: `10/08/2026`
- Môi trường kiểm tra browser: frontend server `11.112`, DB `medtest`, timezone `UTC+07:00`

Tài liệu này thay thế các báo cáo UAT/CORE theo từng ngày đã hoàn tất. Chi tiết task và việc còn lại được quản lý tại [backlog](BACKLOG_TASK_PHAT_TRIEN_MEDSTAND_AI_2026-07-27.md); contract nghiệp vụ vẫn nằm trong các tài liệu contract riêng.

## Kết luận hiện tại

Phần chức năng chính, phân quyền, tồn kho, dữ liệu mẫu và regression đều đã đạt các gate kỹ thuật. Chưa công bố `UAT_BASELINE_READY` vì runtime n8n vẫn có webhook active trùng và admin upload key vẫn còn fallback trong source.

| Hạng mục | Kết quả | Trạng thái |
|---|---|---|
| Đăng nhập và smoke | 13/13 tài khoản; smoke 8/8 | PASS |
| Phạm vi khách hàng | 13/13, không rò rỉ chéo vùng | PASS |
| Phạm vi kho | 13/13, chỉ `CTY/DL02/DL03` | PASS |
| Hội thoại tự nhiên | static 163/163; live 31/31 | PASS |
| Hiệu năng AI | p95 5.668 giây, đạt ngưỡng dưới 6 giây | PASS |
| Idempotency đơn hàng | `DMB0826/8` create/replay cùng mã; đúng một header/detail và đủ audit | PASS; CORE-005 DONE |
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
| CORE-005 | DONE | Token/gateway tạo `DMB0826/8`; replay cùng mã, đúng một header/detail và đủ audit create/replay |
| CORE-006 | Contract approved | Rule `BR-TIER-005/2.0.0` đọc từ cấu hình, không hard-code ngưỡng trong procedure |
| CORE-007 | Pending browser evidence | Rule/API hậu kiểm PASS; static UI contract đạt, còn thao tác/ảnh/request ID A/B/C/UNRATED |
| STOCK-001 | DONE | Công thức chung `max(tồn vật lý chưa hết hạn - lượng giữ, 0)`; chỉ gợi ý hàng có giá và tồn khả dụng dương |
| CORE-008 | Pending browser evidence | Runtime token 4/4 và static visual contract đạt; còn ảnh cách trình bày gắn request ID |
| CORE-009 | Pending browser evidence | Draft regression 29/29 và live gateway 31/31; còn thao tác browser và đối chiếu không mutation trước xác nhận |
| CORE-010 | Pending deployment/concurrency evidence | Server gateway cũ chưa overwrite identity và không tương thích payload idempotency SQL mới; lần thử không tạo đơn/audit |

Contract chi tiết được giữ tại:

- [Tạo khách hàng](CORE-001_CONTRACT_CHAT_TAO_KHACH_HANG_2026-07-29.md)
- [Lập đơn hàng](CORE-004_CONTRACT_CHAT_LAP_DON_HANG_2026-08-03.md)
- [Phân nhóm A/B/C](CORE-006_CONTRACT_PHAN_NHOM_ABC_2026-08-03.md)

## Trạng thái Catalog Phase 2

Đánh giá lại ngày `10/08/2026` xác nhận `CAT-001`–`CAT-004` đã đạt nghiệm thu kỹ thuật/nghiệp vụ hiện tại.

| Task | Trạng thái | Kết quả và phần còn mở |
|---|---|---|
| CAT-001 | DONE | Lớp tri thức có version, nguồn, trạng thái duyệt và hiệu lực đã deploy; UAT sáu phiên bản chỉ công bố đúng bản hợp lệ và rollback sạch `remainingFixtures=0` |
| CAT-002 | DONE | Schema/view/API/fallback đã deploy; 6 mapping có mã in trực tiếp trên ảnh được nạp và API hậu kiểm PASS `6/6`; hai ảnh công bố vượt ngưỡng đã tối ưu dưới `1 MB`, ảnh mơ hồ/sai mã không được map |
| CAT-003 | DONE | API dùng trực tiếp `AR_LayGiaSanPhamFnc`; mẫu `A008` trả cùng giá ERP `75.000đ`, sai lệch `0`; ca `A003` không có giá trả `NO_ACTIVE_PRICE` và không tạo giá giả |
| CAT-004 | DONE | Tái sử dụng `STOCK-001`; hậu kiểm read-only PASS `13/13` tài khoản, có tồn khả dụng, kho, thời điểm cập nhật và loại đúng hàng `RESERVED_OUT` |
| PROMO-001 | DONE | Schema shadow gồm header version, scope chi nhánh/nhóm user và rule sản phẩm; UAT rollback công bố đúng `MONTHLY`/`EVENT` đã duyệt và loại nháp/hết hạn/chưa hiệu lực/thiếu scope |
| PROMO-002 | DONE | Catalog và tra cứu dùng hàm CTBH theo user; UAT chứng minh đúng `BranchID + UserGroupID + ItemID`, ngoài scope và sau hết hạn đều trả `0` dòng; card chỉ hiện CTBH khi có dữ liệu |
| RAG-001 | PARTIAL | Schema quarantine/approved view đã deploy; validator PASS `23/23`, UAT rollback sạch `remainingFixtures=0`; upload runtime đã nối sang draft OCR của RAG-002 nhưng live upload/query vẫn chưa được nghiệm thu end-to-end |
| RAG-002 | READY_FOR_TEST | Schema content/audit/approved view đã tạo source; UI hàng đợi + preview chỉnh sửa + approve/reject; workflow `HQa6xx7flcNcC1oU` active trên n8n local `:5678`, export runtime khớp source `58` node; preflight PASS `14/14`; UAT DB rollback chưa chạy do DB `z5.bms79.com:17456` không kết nối được |
| RAG-003 | READY_FOR_TEST | Schema lifecycle deploy trên `medtest`; UAT rollback PASS và `remainingFixtures=0`; chỉ ACTIVE được approved view trả về, scheduled/expired/withdrawn bị loại; preflight PASS `16/16`; workflow upload/query đã publish local nhưng smoke webhook còn bị chặn bởi kết nối SQL từ tiến trình n8n |

Gate `CATALOG_PROMOTION_READY` chưa đạt. Việc còn lại của Phase 2 gồm nghiệm thu runtime `RAG-001/002/003`, `NOTI-001`, `CAT-005` và `CAT-006`. Các UAT CAT/PROMO/RAG có mutation đều dùng transaction rollback; không có dữ liệu test tồn lưu.

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
| Mutation | UAT-017–018 | Tạo khách và tạo đơn có validate, scope và idempotency; CORE-005 đã có create/replay runtime thật |
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

- CORE-010: còn concurrency thật qua gateway và bằng chứng UI cho các ca hủy/chưa xác nhận; create/replay đơn đã có audit bền.
- CORE-007: thao tác bộ lọc A/B/C/UNRATED qua UI/token thật, ảnh và request ID.
- CORE-008/009: browser UAT bị chặn vì server còn phục vụ `11.112`; thiếu UI gợi ý mới và `window.MedstandOrderDraft`.
- Điều kiện chạy lại: deploy frontend/gateway hiện hành lên server, xác nhận version không còn `11.112`, rồi chạy `node scripts/verify_phase1_browser_uat.js` và concurrency đơn hàng.

## Bằng chứng và lệnh chạy lại

- UAT tài khoản và phạm vi: `scripts/verify_uat007_customer_scope.js`, `scripts/verify_uat008_warehouse_scope.js`.
- Các luồng đọc: `scripts/verify_uat011_order_recommendations.js` đến `scripts/verify_uat016_product_symptom_lookup.js`.
- Tạo khách/đơn: `scripts/verify_uat017_customer_create.js`, `scripts/verify_uat018_order_create.js`.
- Scoring: `scripts/verify_core006_postdeploy.js`, `scripts/verify_uatv2_seed_13_accounts.js`.
- Tồn khả dụng: `scripts/verify_stock001_postdeploy.js`, `scripts/verify_stock001_token_uat.js`.
- Catalog Phase 2: `scripts/preflight_cat001_product_knowledge.js`, `scripts/preflight_cat002_product_images.js`, `scripts/preflight_cat003_customer_price.js`, `scripts/preflight_cat004_catalog_stock.js`.
- UAT catalog rollback/read-only: `scripts/verify_cat001_uat_rollback.js`, `scripts/verify_cat002_uat_rollback.js`, `scripts/verify_cat003_price_uat.js`.
- Mapping ảnh thật: `assets/product-catalog/approved-mapping.json`, `scripts/build_cat002_approved_assets.ps1`, `scripts/deploy_cat002_approved_mapping.js`.
- CTBH Phase 2: `scripts/preflight_promo001_schema.js`, `scripts/deploy_promo001_schema.js`, `scripts/verify_promo001_uat_rollback.js`.
- Ghép CTBH catalog: `scripts/preflight_promo002_catalog.js`, `scripts/deploy_promo002_catalog.js`, `scripts/verify_promo002_uat_rollback.js`.
- Upload RAG an toàn: `scripts/preflight_rag001_upload.js`, `scripts/deploy_rag001_schema.js`, `scripts/verify_rag001_uat_rollback.js`, `scripts/update_rag001_n8n.js`.
- Bằng chứng live/performance: `reports/uat023-*.json`, `reports/uat020-*.json`.
