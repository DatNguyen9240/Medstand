# UAT-013 — Test chấm điểm khách hàng

## Trạng thái

`PASS` — kiểm tra runtime read-only đạt `13/13` tài khoản trên DB `medtest`; UI đã hỗ trợ hiển thị và lọc kết quả chấm điểm.

## Phạm vi kiểm tra

- API runtime: `dbo.API_ChamDiemKH_AI`.
- Phạm vi khách chuẩn: `AR_GetObjectByUserFnc`.
- Khách đại diện của từng tài khoản trong `config/uat/account-fixtures.v1.json`.
- Nhóm giá trị `A / B / C` và sự thống nhất giữa `Nhom` với `ValueSegment`.
- Rủi ro `LOW / MEDIUM / HIGH` theo ngưỡng 45/90 ngày và mức giảm doanh số ba tháng.
- Xu hướng tăng trưởng, sụt giảm, ổn định hoặc khách mới/chưa đủ chu kỳ.
- Bộ lọc nhóm và rủi ro, điểm trong khoảng `0–100`, trường dữ liệu bắt buộc và phạm vi khách.
- UI hiển thị nhóm, rủi ro, xu hướng, lý do; có bộ lọc nhóm và mức rủi ro.

## Kết quả

| Hạng mục | Kết quả |
|---|---:|
| Tài khoản kiểm tra | `13` |
| Tài khoản đạt | `13/13 PASS` |
| Khách đại diện trả đúng | `13/13` |
| Rò rỉ khách ngoài scope | `0` |
| Sai nhóm A/B/C hoặc ValueSegment | `0` |
| Sai mức rủi ro | `0` |
| Sai xu hướng | `0` |
| Điểm ngoài khoảng 0–100 | `0` |
| Dòng thiếu trường bắt buộc | `0` |
| Lọt dữ liệu sai bộ lọc nhóm/rủi ro | `0` |
| Kiểm tra UI | `3/3 PASS` |

API lọc riêng `A`, `B`, `C`, `LOW`, `MEDIUM`, `HIGH` không trả dòng sai điều kiện. Dữ liệu hiện tại không có ca `MEDIUM`; kết quả rỗng là hợp lệ và không tạo dữ liệu giả để ép đủ nhóm.

Tài khoản `CanThoA` có đúng một khách đủ dữ liệu chấm điểm trong scope, thuộc nhóm `A`, rủi ro `LOW`, xu hướng tăng trưởng. Đây là kết quả hợp lệ theo phạm vi thực tế.

## Thay đổi UI tối thiểu

Luồng `@cham_diem_kh` đã có thêm các nút lọc `Mọi rủi ro / Rủi ro thấp / Rủi ro vừa / Rủi ro cao`. Khi chọn, UI gửi tham số `@RiskLevel` cùng `@NhomFilter` và giữ hai điều kiện khi chuyển trang hoặc đổi kích thước trang.

## Bằng chứng

- Script: `scripts/verify_uat013_customer_scoring.js`.
- Lệnh: `node scripts/verify_uat013_customer_scoring.js`.
- Kết quả chạy ngày `2026-07-29`: `PASS`, `13/13` tài khoản.
- Chế độ: chỉ đọc DB `medtest`; không ghi hoặc sửa dữ liệu.

## Kết luận nghiệm thu

UAT-013 đạt yêu cầu nghiệm thu kỹ thuật: API/UI chạy ổn định, đủ trường cơ bản, đúng scope và đúng các rule đang công bố. Kết quả này không thay thế việc business owner nghiệm thu công thức chấm điểm cuối cùng tại `CORE-006`.
