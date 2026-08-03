# CORE-003 — Xác nhận và ghi khách hàng trực tiếp

## Trạng thái

`DONE_DIRECT_CREATE_UAT` — luồng ghi trực tiếp không qua bước duyệt Admin đã deploy và UAT-017 PASS.

## Endpoint và bảng đích

```text
POST /api/API_KhachHang_Insert_AI
  → dbo.API_KhachHang_Insert_AI
  → dbo.CF_ObjectTbl
```

Endpoint có hậu tố `_AI` để tách biệt với API ERP cũ. Stored procedure sử dụng transaction, trả `ObjectID` khi thành công và chỉ ghi `CF_ObjectMapTbl` nếu có tọa độ.

## Xử lý xác nhận

- Form sinh `Idempotency-Key`, khoá nút gửi khi đang xử lý và cho phép quay lại sửa trước khi xác nhận.
- Kết quả `MsgType = 1` được hiển thị là lỗi, không đóng form để người dùng sửa.
- Chỉ kết quả `MsgType = 5` kèm `ObjectID` mới là thành công: form khoá và ghi rõ khách có thể sử dụng ngay. Mọi kết quả khác đều không được hiển thị là đã tạo khách.

## Bảo vệ server

- Không tin `SaleID` do client gửi; chỉ nhận `AssignedEmployeeID` và kiểm tra quan hệ Manager → Sale.
- Không tin chi nhánh/nhóm khách của client; server dùng tài khoản và phạm vi thực tế để quyết định.
- Chặn SĐT trùng trong cả khách sống và yêu cầu ERP đang chờ cũ.
- Không tạo `AR_ObjectNewRequireTbl` trong luồng AI này.

## Trạng thái deploy và nghiệm thu

1. Procedure `sql/Module common - API_KhachHang_Insert_AI.sql` và metadata ApiCode `@khach_hang_insert_ai` đã được đồng bộ trên môi trường UAT.
2. Frontend `11.121` đang dùng `/api/API_KhachHang_Insert_AI` và contract response `MsgType = 5` + `ObjectID`.
3. UAT-017 đã PASS cho luồng tạo trực tiếp, kiểm tra quyền, validate dữ liệu và chống trùng.
