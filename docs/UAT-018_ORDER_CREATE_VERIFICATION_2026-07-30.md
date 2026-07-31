# UAT-018 — Kiểm tra tạo đơn hàng

## Trạng thái

`READY_FOR_AI_SQL_DEPLOY` — đã tách toàn bộ thay đổi UAT-018 sang hai procedure có hậu tố `_AI`. Procedure gốc `dbo.API_DonHang_Insert` và `dbo.API_HangHoaList` không bị sửa. Chưa chạy SQL AI lên server và chưa tạo đơn UAT thật.

Không có lệnh tạo, sửa hoặc xóa dữ liệu SQL nào được chạy trong lần rà soát này.

## Phạm vi đã kiểm tra

| Hạng mục | Kết quả |
|---|---|
| Màn hình | `#/create-order` |
| Endpoint tạo đơn | `/api/API_DonHangChiTiet_Insert_AI` |
| Endpoint sản phẩm | `/api/API_HangHoaList_AI` |
| Khách hàng | Lấy theo API danh sách khách có user/manager/employee hiện tại |
| Sản phẩm | Hiển thị mã, tên, giá, tồn và đơn vị |
| Nhóm hàng | Chỉ tham chiếu `CF_ItemTbl.ItemGroupID = 'HH1'`; không đưa `HH2`, `KM`, `BBVT`, `HM` vào danh sách/tạo đơn AI |
| Số lượng | Chỉ nhận số nguyên lớn hơn 0; chặn vượt tồn đang hiển thị |
| Giá | Ô giá readonly và lấy từ API sản phẩm |
| Gửi trùng tại UI | Khóa nút trong lúc gửi và dùng cùng key khi retry cùng payload |
| Chống trùng phía server | SQL AI có khóa `DocumentID` và đối chiếu lại payload khi retry |

## Điểm chặn trước khi nghiệm thu

1. Chưa chạy hai procedure `_AI` lên `medtest`.
2. Chưa deploy frontend đã chuyển endpoint sang `_AI`.
3. Chưa có `DocumentID` của một đơn UAT được business cho phép để đối chiếu một header, chi tiết và tổng tiền.

Bản vá đề xuất đã được chuẩn bị tại:

- `sql/Module common - API_DonHangChiTiet_Insert_AI.sql`: quyền user, giá, tồn, transaction và idempotency theo `DocumentID`.
- `sql/Module common - API_HangHoaList_AI.sql`: trả giá theo khách và tồn khả dụng đúng phạm vi ba kho chính.

Hai file chưa được chạy lên SQL Server.

Màn hình truyền `Username` và `ObjectID` vào `API_HangHoaList_AI`, nhờ đó giá và tồn được kiểm tra đúng phạm vi tài khoản/khách hàng.

> Không chạy script `CREATE OR ALTER` nào nhắm vào `dbo.API_DonHang_Insert` hoặc `dbo.API_HangHoaList` trong UAT-018.

## Checklist runtime có kiểm soát

- [ ] Chọn đúng một tài khoản UAT, khách hàng UAT và sản phẩm UAT được business cho phép.
- [ ] Xác nhận tồn trước khi gửi và chọn số lượng không vượt tồn.
- [ ] Ghi lại payload và `Idempotency-Key`, không ghi mật khẩu/token vào bằng chứng.
- [ ] Gửi request tạo đơn lần đầu: response thành công và trả `DocumentID` thật.
- [ ] Gửi lại đúng payload với đúng `Idempotency-Key`: không tạo header/chi tiết thứ hai.
- [ ] Chạy script read-only với `DocumentID` vừa nhận để kiểm tra đúng một header, có chi tiết, không lặp và tổng tiền khớp.
- [ ] Kiểm tra đơn xuất hiện đúng một lần trên danh sách/chi tiết đơn hàng.

## Cách kiểm tra read-only

Kiểm tra contract runtime, không tạo dữ liệu:

```powershell
node scripts/verify_uat018_order_create.js
```

Sau khi người phụ trách UAT đã tự tạo đúng một đơn được phép, đối chiếu bằng chứng:

```powershell
node scripts/verify_uat018_order_create.js "<DocumentID>"
```

Script chỉ thực hiện `SELECT`, đọc metadata procedure và đếm dữ liệu theo đúng `DocumentID` được truyền vào.

## Điều kiện đánh dấu hoàn thành

Chỉ đổi UAT-018 thành `[x] PASS` khi đồng thời có đủ:

- `API_DonHangChiTiet_Insert_AI` có transaction và kiểm tra server-side cho giá, tồn, gửi lặp.
- Request đầu và request retry cùng key đều trả về cùng một kết quả nghiệp vụ.
- `AR_OrderTbl` có đúng `1` header cho `DocumentID`.
- `AR_OrderDetailTbl` đúng sản phẩm, số lượng, giá/chiết khấu; không có nhóm chi tiết bị lặp.
- Tổng header bằng tổng chi tiết và UI tra cứu được đúng một đơn.
