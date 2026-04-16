# SỔ TAY KỸ THUẬT VÀ PHÁT TRIỂN TIÊU CHUẨN

Tài liệu này dùng cho đội ngũ Kỹ sư phần mềm (Developer) và Kỹ thuật viên hệ thống (DevOps) để nắm rõ cách vận hành, cấu hình, và duy trì hệ thống Medstand AI.

## 1. Hệ Thống Khởi Chạy (Bootstrapper System)
Các dịch vụ N8N được cấu trúc theo mô hình Cắm-và-Chạy (Portable). Toàn bộ logic gốc nằm trong thư mục `n8n-system/` và được triển khai qua các đường dẫn tương đối.

### 1.1 Kiểm soát Khởi chạy (start_n8n.bat)
- Tự động nạp cấu hình Node.js nội bộ (Local environment isolation).
- Khởi tạo PM2 để quản lý các tiến trình theo dạng chạy ngầm (Background Service) và đảm bảo tự động phục hồi khi có sự cố.
- Khởi chạy các Database hỗ trợ như Redis và Qdrant.
- Tự động cấu hình Cloudflare Tunnel để thiết lập giao tiếp Webhook thông qua chuẩn SSL/HTTPS an toàn.

### 1.2 Kịch bản Bảo trì (stop_n8n.bat)
Script cung cấp cơ chế thu hồi an toàn (Graceful Shutdown) đối với PM2, giải phóng bộ nhớ của các tiến trình Node.js và ngắt kết nối Cloudflare, nhằm giải phóng RAM hoàn toàn trước khi nâng cấp hoặc gỡ cài đặt.

## 2. Tiêu Chuẩn Giao Diện Frontend (Dynamic UI)
Kiến trúc Frontend hỗ trợ khả năng thay đổi giao diện linh hoạt đáp ứng nhiều thương hiệu khác nhau.

### 2.1 Quản lý CSS Variables (Design Tokens)
Các nhà phát triển không được phép sử dụng mã màu cứng (Hardcoded Hex) trực tiếp trong các style CSS. Toàn bộ mã màu phải được ánh xạ qua file `src/css/design-tokens.css`:
- Các biến màu chính: `var(--color-primary)`, `var(--color-success)`, `var(--color-danger)`, v.v.
- Các biến nền/hiệu ứng mở rộng: `var(--color-warning-bg)`, `var(--color-warning-text)`.
- Chế độ hiển thị Tối/Sáng (Dark/Light mode) sẽ tự động kích hoạt thông qua định dạng `[data-theme="dark"]`.

### 2.2 Tích hợp Widget Chatbot
Để gắn Widget lên ứng dụng web của bên thứ 3, kỹ sư cần nhúng trực tiếp snippet tĩnh:
```html
<link rel="stylesheet" href="css/chatbot-master.css">
<script src="js/chatbot-master.js" defer></script>
```
Script sẽ tự sinh thẻ DOM, tự kế thừa Theme color và logic xác thực (Auth) để kết nối trực tiếp với Core N8N thông qua config trung gian `env.js`.

## 3. Tự Động Hóa Metadata Cơ Sở Dữ Liệu (Auto DDL)
Thay vì thao tác khai báo tính năng thủ công, kiến trúc áp dụng script `Bootstrap_API_Metadata_Auto.sql` để xây dựng giao diện dựa trực tiếp vào cấu trúc truy vấn.

### 3.1 Cơ Chế Synchronize Trigger
- Hệ thống áp dụng một Trigger Database để lắng nghe các giao dịch cấu trúc `CREATE/ALTER PROCEDURE`.
- Khi thiết lập một Stored Procedure đạt chuẩn (Ví dụ có dạng `API_*_AI`), trigger sẽ quét tập `sys.parameters` để trích xuất danh sách biến số.
- Các tham số chuyên biệt như `@Username`, `@TuNgay`, `@SoDienThoai` được hệ thống map tĩnh thành kiểu dữ liệu Input tương ứng (Ví dụ: DatePicker cho kiểu ngày, Combobox cho khóa ngoại) trên thiết bị UI của người dùng.

### 3.2 Quy Ước Tham Số (Parameter Convention)
Yêu cầu lập trình viên Back-end áp dụng chặt chẽ hậu tố/tiền tố chuẩn trong SQL Schema:
- `@TuNgay, @DenNgay, @Date` -> Tự động chuyển đổi thành hộp thoại chọn Ngày.
- `@Notes, @GhiChu` -> Tự động ánh xạ TextBox khổ lớn.
- Khai báo có Hậu tố `_Insert_AI`, `_Update_AI`, `_Delete_AI` -> Render Form hành động (CRUD) kèm hộp thoại xác nhận.
