# CORE-003 — Xác nhận và ghi khách hàng trực tiếp

## Trạng thái

`READY_FOR_UAT_DEPLOY_11.116` — luồng ghi không có bước duyệt Admin.

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
- Kết quả khác `1` là thành công: form khoá, hiển thị `ObjectID` và ghi rõ khách có thể sử dụng ngay.

## Bảo vệ server

- Không tin `SaleID` do client gửi; chỉ nhận `AssignedEmployeeID` và kiểm tra quan hệ Manager → Sale.
- Không tin chi nhánh/nhóm khách của client; server dùng tài khoản và phạm vi thực tế để quyết định.
- Chặn SĐT trùng trong cả khách sống và yêu cầu ERP đang chờ cũ.
- Không tạo `AR_ObjectNewRequireTbl` trong luồng AI này.

## Điều kiện deploy

1. Apply procedure `sql/Module common - API_KhachHang_Insert_AI.sql`.
2. Đồng bộ metadata về ApiCode `@khach_hang_insert_ai` theo script capability.
3. Import/activate workflow n8n đã cập nhật (nếu instance dùng API execute).
4. Deploy frontend bundle `11.116` và kiểm tra cache service worker.
