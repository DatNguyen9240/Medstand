# UAT-012 — Test tuyến và khách giảm mua

## Trạng thái

`PASS` — kiểm tra runtime read-only đạt `13/13` tài khoản trên DB `medtest`.

## Quy tắc kiểm tra

- API: `dbo.API_TuyenBanHang_AI`.
- Giới hạn danh sách: chạy cả `TopN = 5` và `TopN = 8`.
- Ngưỡng khách lâu chưa mua: `45` ngày.
- Ngưỡng báo động sắp hết hàng: còn tối đa `5` ngày.
- Phạm vi khách chuẩn: `AR_GetObjectByUserFnc`.
- Chọn ngày tuyến có dữ liệu cho từng tài khoản; không ghi hoặc sửa dữ liệu.

## Kết quả

| Hạng mục | Kết quả |
|---|---:|
| Tài khoản kiểm tra | `13` |
| Tài khoản đạt | `13/13 PASS` |
| Rò rỉ khách ngoài scope | `0` |
| Sai giới hạn Top 5/8 | `0` |
| Top 5 không khớp 5 dòng đầu Top 8 | `0` |
| Dòng thiếu trường nghiệp vụ | `0` |
| Sai công thức điểm ưu tiên | `0` |
| Sai lý do ghé/báo động | `0` |
| Ca khách từ 45 ngày không mua | `98` |
| Ca báo động còn 3 ngày | `13/13 PASS` |

Tài khoản `CanThoA` có đúng 3 khách trên tuyến của ngày được chọn, nên API trả 3 dòng cho cả Top 5 và Top 8. Đây là kết quả hợp lệ vì phạm vi thực tế nhỏ hơn giới hạn yêu cầu.

## Kiểm tra báo động 5 ngày

Mỗi tài khoản được chọn một khách trong scope có ít nhất 3 hóa đơn trong 6 tháng. Ngày kiểm tra được đặt trước ngày dự đoán hết hàng 3 ngày. Cả `13/13` ca trả:

- `ConLai = 3`.
- Lý do chứa `Sắp hết hàng (Còn 3 ngày)`.

## Bằng chứng

- Script: `scripts/verify_uat012_route_and_decline.js`.
- Lệnh: `node scripts/verify_uat012_route_and_decline.js`.
- Chế độ: read-only runtime; không mutation.

## Kết luận nghiệm thu

UAT-012 đạt. Top 5/8, ngưỡng 45 ngày, báo động 5 ngày, thứ tự ưu tiên và phạm vi khách đều hoạt động đúng theo rule `BR-ROUTE-V1` đang công bố.
