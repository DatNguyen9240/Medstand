# UAT-017 — Kiểm tra tạo khách hàng trực tiếp qua Chatbot

## Trạng thái

`PASS` — business đã xác nhận ca runtime bằng tài khoản `QLBH013.MED`. Khách `A He`, mã `EF7C85D8-8888-4904-8478-6046C09DE258`, được tạo thành công và truy vấn lại đúng một bản ghi theo cả mã lẫn tên trong scope của tài khoản. Luồng tạo trực tiếp không cần Admin duyệt; frontend chỉ báo thành công khi server trả `MsgType = 5` kèm `ObjectID`.

## Phạm vi nghiệm thu

| Hạng mục | Kỳ vọng |
|---|---|
| Endpoint | `/api/API_KhachHang_Insert_AI` |
| Stored procedure | `dbo.API_KhachHang_Insert_AI` |
| ApiCode gateway | `@khach_hang_insert_ai` |
| Bảng khách sống | `CF_ObjectTbl` |
| Bảng yêu cầu cũ | Không có bản ghi mới tại `AR_ObjectNewRequireTbl` |
| Endpoint cũ | Không dùng `API_KhachHang_Insert` cho chatbot |
| Duyệt Admin | Không áp dụng trong phạm vi UAT này |

## Checklist runtime

- [x] Tạo khách hợp lệ bằng tài khoản có scope: server trả `ObjectID`; API danh sách đọc lại đúng một bản ghi.
- [ ] Kiểm tra `SaleID`, `BranchID`, `ObjectGroupID` đúng theo tài khoản sale.
- [ ] Manager chọn một sale dưới quyền: khách có `SaleID` đúng sale và nhóm thuộc sale đó.
- [ ] Manager thử sale/nhóm ngoài quyền: bị từ chối, không tạo khách.
- [ ] SĐT có chữ, SĐT trùng, MST có chữ/sai độ dài, ngày sinh tương lai: bị từ chối.
- [ ] Không có dòng UAT mới ở `AR_ObjectNewRequireTbl`.
- [ ] Thử gửi lặp cùng idempotency key (qua gateway API execute nếu áp dụng): không có khách thứ hai.

### Bằng chứng runtime được chấp nhận

- Tài khoản: `QLBH013.MED` — Manager `MED0330`, chi nhánh `MB`, có 10 nhóm khách trong phạm vi.
- Khách: `A He`.
- `ObjectID`: `EF7C85D8-8888-4904-8478-6046C09DE258`.
- Đối chiếu sau tạo: tìm theo `ObjectID` và `ObjectName` đều trả đúng một bản ghi trong scope `QLBH013.MED`.
- Business xác nhận chấp nhận ca này để PASS UAT-017 dù tên dữ liệu thử không có tiền tố `UAT_`.

## Kiểm tra source local đã đạt

- Form chỉ nhận số cho SĐT/MST, giữ ngày sinh bắt buộc và có preview/sửa lại.
- Endpoint form là `_AI`.
- Stored procedure ghi `CF_ObjectTbl`, kiểm tra phạm vi khách và audit `UserCreate`.
- Gateway policy chỉ mở mutation `@khach_hang_insert_ai`; import hàng trọng tâm vẫn bị chặn ở pilot.
- Cả form trong chat và modal chỉ báo thành công khi server trả `MsgType = 5` kèm `ObjectID`; mã hiển thị được ghi rõ là `Mã khách hàng`.
- Bundle và service worker được nâng lên `11.117` khi build.

## Bước deploy được đề xuất

1. Apply SQL procedure + metadata migration trên `medtest`.
2. Import/activate workflow n8n có thay đổi policy (nếu triển khai API execute).
3. Deploy bundle `11.117`.
4. Thực hiện checklist runtime với một khách có tiền tố `UAT_` và lưu `ObjectID` làm bằng chứng.

> UAT-017 đã PASS theo xác nhận business. Các mục kiểm tra âm còn lại được giữ làm regression bổ sung, không chặn kết quả nghiệm thu hiện tại.
