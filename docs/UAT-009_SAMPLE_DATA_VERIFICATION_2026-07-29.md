# UAT-009 — Chuẩn hóa dữ liệu mẫu theo tài khoản

## Phạm vi

Kiểm tra read-only trên DB `medtest` cho 13 tài khoản UAT. Mỗi tài khoản cần có khách đại diện đang hoạt động và nằm trong scope, sản phẩm mẫu, lịch sử/đơn mẫu và kho chính `CTY / DL02 / DL03`.

## Bộ dữ liệu kiểm tra

- Khách đại diện: lấy từ `config/uat/account-fixtures.v1.json`.
- Sản phẩm mẫu: `A003`, `Q002`, `G010`.
- Nguồn lịch sử/đơn: `AR_InvoiceTbl`, `AR_OrderTbl`.
- Phạm vi khách: `AR_GetObjectByUserFnc`.
- Phạm vi kho: `SY_UserStoreHouseTbl`, chỉ xét `CTY / DL02 / DL03`.
- Script chỉ đọc: `scripts/verify_uat009_sample_data.js`.

## Tiêu chí đạt

Mỗi account phải có khách đại diện hợp lệ và đúng scope, có ít nhất một đơn mẫu, có sản phẩm mẫu đang hoạt động và có ít nhất một kho chính hiệu lực. Không ghi hoặc sửa dữ liệu thật.

## Trạng thái

`PASS` — kiểm tra read-only đạt `13/13` tài khoản.

- 13/13 khách đại diện tồn tại, đang hoạt động và đúng scope.
- 13/13 có ít nhất một đơn mẫu; mỗi khách có 4 hóa đơn hoàn tất.
- 3/3 sản phẩm mẫu (`A003`, `Q002`, `G010`) đang hoạt động.
- 13/13 có ít nhất một kho chính trong allowlist `CTY / DL02 / DL03`.
- Một số khách MB/QLMD1 chưa có `RouteDay`, nhưng tiêu chí UAT-009 hiện tại không yêu cầu tuyến phải có lịch ngày; nội dung này chuyển sang UAT-012.

Evidence: kết quả JSON từ `scripts/verify_uat009_sample_data.js`, chạy trên DB `medtest` ngày 29/07/2026.

## Lệnh kiểm tra

```text
node scripts/verify_uat009_sample_data.js
```

Nếu script báo thiếu dữ liệu, chỉ bổ sung bằng fixture UAT có tiền tố riêng và có phê duyệt; không sửa khách hàng thật hoặc dùng Admin để thay thế scope account.
