# CORE-002 — Khung nhập liệu tạo khách hàng trong Chatbot

## Trạng thái

`DONE_LOCAL_11.116` — form tạo khách đã hoàn thiện cho UAT, chờ deploy cùng endpoint và stored procedure.

## Trải nghiệm người dùng

1. Người dùng chọn **Tạo khách hàng** hoặc gõ yêu cầu tạo khách.
2. Form hiển thị tên, SĐT, MST, địa chỉ, ngày sinh, nhóm khách và địa chỉ hành chính.
3. Người dùng chọn **Xem lại**, sau đó **Xác nhận gửi** hoặc **Sửa lại**.
4. Thành công hiển thị `ObjectID` và thông báo khách dùng được ngay.

## Kiểm tra ở form

| Trường | Điều kiện |
|---|---|
| Tên khách | Bắt buộc, tối đa 150 ký tự. |
| Số điện thoại | Bắt buộc, chỉ nhập số, 10–11 số. |
| Mã số thuế | Bắt buộc, chỉ nhập số, 10–13 số. |
| Địa chỉ cụ thể | Bắt buộc, tối đa 250 ký tự. |
| Tỉnh → Huyện → Xã | Bắt buộc, chọn tuần tự từ danh mục. |
| Ngày sinh | Bắt buộc, định dạng hợp lệ và không ở tương lai. |
| Nhóm khách | Một nhóm tự lấy; nhiều nhóm phải chọn. |
| Manager | Chọn sale phụ trách khi có nhân viên dưới quyền. |

## Bảo vệ thao tác

- Các ô SĐT/MST loại bỏ ký tự không phải số ngay khi nhập.
- Preview không ghi dữ liệu.
- Khi gửi, nút bị khoá và form chỉ hoàn tất sau phản hồi thành công.
- Mọi dữ liệu phân quyền vẫn được stored procedure kiểm tra lại.

## File liên quan

- `chatbot-widget/js/chatbot-api-engine.js`: form modal đang được mở từ menu/chat.
- `chatbot-widget/js/chatbot-renderer-create-customer.js`: renderer form trong chat, cùng contract dữ liệu.
- `env.js`: endpoint `AI.CREATE_CUSTOMER` là `/api/API_KhachHang_Insert_AI`.
