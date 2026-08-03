# CORE-007 — Cập nhật API chấm điểm theo BR-TIER-005/2.0.0

Ngày thực hiện: `03/08/2026`  
Môi trường SQL: `medtest`  
Trạng thái: `MEDTEST_API_RUNTIME_13_OF_13_VERIFIED_PENDING_UI_TOKEN_EVIDENCE`

## Kết quả

- Rule `BR-TIER-005/2.0.0` có `21` key `APPROVED`, hiệu lực từ `03/08/2026 06:34:26Z` (`13:34:26 +07`).
- `API_ChamDiemKH_AI` đọc config cùng một version; thiếu/sai key sẽ fail-closed.
- Procedure không chứa literal `25.000.000`, `5.000.000`, không dùng `PERCENTILE_CONT` để phân tier và không còn nhãn `BR-TIER-V1-DRAFT`.
- Status bán/trả hàng, kỳ dữ liệu, tier threshold, risk/trend ratio, UTC offset và nhãn no-history đều nằm trong bảng cấu hình.
- Tier tính từ toàn bộ giao dịch của khách trước; quyền sale/manager chỉ lọc khách được xem.
- Trả hàng dùng `AR_OrderAndReturnView.TotalAmount` và cộng status trả hàng đúng một lần.
- Khách không có hóa đơn hợp lệ trong kỳ trả `UNRATED`; risk trả `UNKNOWN`.
- UI đã có bộ lọc `UNRATED/UNKNOWN`, dùng `PhanLoai` và `RiskLevel` do API trả về thay vì lặp lại ngưỡng risk; bundle local `11.125` đã build.

## Bằng chứng

### Preflight rollback

Lệnh: `node scripts/preflight_core006_sql.js`

- Kết quả: `PASS`.
- Compile migration + procedure: `2/2` file.
- Config: `21` key.
- Case chuẩn: `ABC-01..09` đạt `9/9`.
- Cặp manager/sale: `3/3` cùng tier và cùng điểm.
- Persisted changes: `false`.

### Deploy

Lệnh: `node scripts/deploy_core006_sql.js --apply`

- Kết quả: `DEPLOYED`.
- Database: `medtest`.
- Thời điểm: `2026-08-03T06:34:26Z`.
- Procedure trước deploy SHA-256: `ecdb86b9c33918366dfd03ff4412323f54fd7fea6eb0b029b2f4c26659649719`.
- Procedure sau deploy SHA-256: `270673af943291c523d952ade796bc9c2751c6417d0460855b8ac82962fefebb`.

### Hậu kiểm read-only

Lệnh: `node scripts/verify_core006_postdeploy.js`

- Kết quả: `PASS`.
- No-hardcode/config checks: `7/7`.
- Cùng khách giữa manager/sale: `3/3 PASS`.
- `UNRATED/UNKNOWN`: `PASS` với khách không có hóa đơn 12 tháng.
- UI static checks: `5/5 PASS`.

### Hậu kiểm runtime 13 tài khoản sau khi persist UATV2

- Seed `UATV2_` đã commit trên `medtest` lúc `2026-08-03T07:19:34.792Z`.
- Persisted: `28` khách, `91` đơn, `63` hóa đơn, `7` trả hàng, `7` công nợ và `3` sản phẩm trọng tâm.
- Gọi trực tiếp `API_ChamDiemKH_AI` cho `13 tài khoản × 4 nhóm = 52 ca`: `52/52 PASS`.
- Mỗi tài khoản thấy đúng một khách A, B, C và UNRATED thuộc scope của mình.
- Bảy ca trả hàng đều được cộng signed đúng một lần; doanh số thuần nhóm A vẫn đúng ngưỡng cấu hình.
- Hậu kiểm trên dữ liệu đã commit: `13/13 PASS`.
- Báo cáo: [UATV2_CURRENT_DATA_13_ACCOUNTS_2026-08-03.md](UATV2_CURRENT_DATA_13_ACCOUNTS_2026-08-03.md).

## Lưu ý dữ liệu

Ba khách fixture `NDB001`, `HUEA043`, `DL012` đều thành A trên nguồn doanh số thuần toàn công ty vì `medtest` hiện ghi nhận lần lượt khoảng `1,116`, `1,188`, `1,260` tỷ đồng và `12` lần mua/6 tháng. Đây là ảnh hưởng của dữ liệu mock/runtime, không phải percentile theo scope. Cần chạy lại trên dữ liệu production đã làm sạch trước khi coi phân bố A/B/C là KPI kinh doanh chính thức.

## Phần còn lại

SQL, rule business và API runtime trên `medtest` đã đạt. Chưa đánh dấu CORE-007 `DONE` cho đến khi chạy UI/gateway thật bằng token, kiểm tra bộ lọc A/B/C/UNRATED và lưu ảnh/request ID UAT.
