# TÀI LIỆU HƯỚNG DẪN TRIỂN KHAI VÀ VẬN HÀNH HỆ THỐNG MEDSTAND AI CHATBOT

**Phiên bản:** 2.0 (Cập nhật quy trình Deploy tự động hóa)
**Dự án:** Medstand AI Chatbot
**Đối tượng sử dụng:** Kỹ sư hệ thống, Kỹ thuật viên triển khai, Quản trị viên (Admin)

---

## I. MỤC ĐÍCH TÀI LIỆU
Tài liệu này cung cấp quy trình tiêu chuẩn để cài đặt, cấu hình, và vận hành hệ thống Medstand AI Chatbot trên môi trường máy chủ nội bộ (Local/Server) của khách hàng. Với phiên bản hiện tại, 90% quy trình thiết lập môi trường đã được tự động hóa bằng Script nhằm giảm thiểu lỗi con người và tiết kiệm thời gian triển khai.

## II. ĐIỀU KIỆN TIÊN QUYẾT (PREREQUISITES)
Trước khi tiến hành, máy chủ triển khai cần đáp ứng các yêu cầu sau:
1. **Hệ điều hành:** Windows 10/11 hoặc Windows Server.
2. **Cơ sở dữ liệu:** SQL Server (Bao gồm SQL Server Management Studio - SSMS).
3. **Mạng:** Hệ thống có khả năng kết nối mạng ra internet (phục vụ việc tạo đường hầm Cloudflare Tunnel).
4. **Mã nguồn:** Toàn bộ thư mục dự án `Medstand` đã được sao chép nguyên vẹn lên không gian lưu trữ hệ thống (Khuyến nghị lưu tại ổ đĩa không chứa ký tự tiếng Việt có dấu, ví dụ: `D:\Medstand`).

Cấu trúc thư mục cốt lõi cần có:
```text
Medstand/
├── env.js                (File cấu hình môi trường Frontend - Tự động cập nhật)
├── index.html            (Giao diện ứng dụng chính)
├── sql/                  (Chứa các thủ tục lưu trữ Stored Procedure)
└── n8n-system/
    ├── start_n8n.bat     (Script khởi tạo môi trường tổng)
    ├── cloudflared.exe   (Công cụ tạo Secure Tunnel)
    ├── n8n/              (Chứa dữ liệu chuẩn của luồng AI)
    ├── redis/            (Cơ sở dữ liệu Cache nội bộ)
    └── qdrant/           (Cơ sở dữ liệu Vector phục vụ Semantics Search)
```

---

## III. QUY TRÌNH TRIỂN KHAI HỆ THỐNG (DEPLOYMENT PROCESS)

### 1. Khởi Tạo Cơ Sở Dữ Liệu (Database Initialization)
- **Bước 1.1:** Khởi động hệ quản trị CSDL SQL Server Management Studio (SSMS) và kết nối vào Database của hệ thống Medstand.
- **Bước 1.2:** Lần lượt thực thi (Execute) toàn bộ các kịch bản SQL có tiền tố `Module ...` trong thư mục `sql/` để cập nhật logic nghiệp vụ.
- **Bước 1.3:** Thực thi tệp lệnh `sql/Bootstrap_API_Metadata_Auto.sql`. Tệp lệnh này chịu trách nhiệm khởi tạo cơ sở dữ liệu nền tảng cho AI Chatbot (Master Data).
- **Bước 1.4:** Xác nhận quá trình khởi tạo thành công bằng cú pháp: `SELECT * FROM dbo.API_Definition`. Số lượng dòng trả về dao động trong khoảng 19 bảng ghi.

### 2. Kích Hoạt Môi Trường Tự Động (Environment Activation)
 Hệ thống tích hợp Script tự động hóa toàn bộ quá trình nạp lõi Node.js và n8n.
- **Bước 2.1:** Truy cập thư mục `n8n-system/`.
- **Bước 2.2:** Chạy tệp tin `start_n8n.bat` dưới quyền Quản trị viên (Run as Administrator) trong lần đầu thiết lập. 
Các tiến trình sẽ tự động thực thi gồm có:
  - Tải và cấu hình môi trường Node.js Portable (nếu chưa hiện diện).
  - Khởi tạo Data Caching qua cổng Redis và Vector Search qua Qdrant.
  - Phân bổ đường truyền qua CORS Proxy.
  - Chạy giao thức Cloudflare Tunnel để cấp URL định danh SSL (HTTPS). 
  - Tự động ghi đè Public URL vào thiết lập phân hệ Frontend (`env.js`).
  - Mở cổng kết nối Máy chủ logic n8n tại địa chỉ `http://localhost:5678`.

### 3. Cấu Hình Nền Tảng AI (N8N Configuration)
- **Bước 3.1:** Khi Command Line thông báo n8n đã sẵn sàng, truy cập trình duyệt tại địa chỉ `http://localhost:5678`. (Thực hiện tạo tài khoản Owner bảo mật tại lần đầu làm việc).
- **Bước 3.2:** Khởi tạo Luồng xử lý. Tại bảng điều khiển "Workflows", nhấp chọn tính năng **"Import from File"** và tuần tự nạp 2 tệp:
  - `K0_MetaAPI.json`: (Quy trình Database Engine).
  - `K_SieuLuong_V2.json`: (Quy trình AI Orchestration).
- **Bước 3.3:** Cập nhật thông tin định danh CSDL. Xác định các Node "MS SQL" đang có tín hiệu cảnh báo trên sơ đồ. Thiết lập Credentials mới (`MS SQL account`) nhập chính xác thông tin cấu hình của máy chủ SQL Server đang sử dụng. Thao tác này chỉ cần làm một lần.
- **Bước 3.4:** Đổi trạng thái cần gạt phía góc trên bên phải từ `Inactive` sang `Active` trên mỗi Workflow.

---

## IV. QUY TRÌNH VẬN HÀNH VÀ BẢO TRÌ

### 1. Thao Tác Chạy Hệ Thống Hằng Ngày (Daily Routine)
Do đặc thù Public Tunnel thay đổi đường dẫn mã hoá mỗi lần ngắt kết nối, quy trình vận hành hằng ngày được tinh gọn chỉ trong 2 thao tác:
1. Kích hoạt trực tiếp `n8n-system/start_n8n.bat`. Hệ thống sẽ tự cấp phát đường dẫn mới và gắn trực tiếp vào file cấu hình Frontend trong vòng 5 giây.
2. Tại máy trạm người dùng (Frontend), nhấn `Ctrl + Shift + R` (Hard Reload) trình duyệt web để tải phiên bản giao tiếp mới nhất. Hệ thống có thể hoạt động hoàn toàn ổn định sau thao tác này.

### 2. Hạng Mục Chẩn Đoán Lỗi Cơ Bản (Troubleshooting)
Trong quá trình vận hành, nếu xảy ra sự cố không phản hồi, quản trị viên áp dụng các bước chẩn đoán sau:

| Sự Cố Nhận Biện | Nguyên Nhân Tiềm Năng | Phương Án Xử Lý Khắc Phục |
| :--- | :--- | :--- |
| **API Timeout / Quay vòng liên tục:** <br/> Chatbot không hiển thị kết quả. | Mất tín hiệu phản hồi từ CSDL thông qua lõi n8n. | Tại `localhost:5678`, mở cấu hình Workflow `K0_MetaAPI` và điều chỉnh lại Credential SQL Server cho chính xác. |
| **Hệ thống dữ liệu gọi sai Keyword:** <br/> Trả về Auto-Complete không khớp. | Mất đồng bộ UI Component Cache cục bộ do phiên bản cũ. | Dọn dẹp bộ nhớ đệm Frontend (`Ctrl + F5`). Giao tiếp UI Engine phiên bản mới đã hoàn thiện xử lý NLP Parameter. |
| **Bảng điều khiển CMD tự động thoái lui:** <br/> Script đóng ngay sau khi chạy. | Thư mục chạy chứa kí tự lỗi, khoảng trắng trái phép, tiếng Việt có dấu. | Di dời tổng thể toàn bộ Folder `Medstand` ra thư mục gốc cơ sở (VD: `C:\Medstand\`). |

---
**Tài liệu này là cơ sở lưu trữ kỹ thuật được khuyến nghị bàn giao cùng sản phẩm giữa đơn vị thiết kế phần mềm và doanh nghiệp triển khai.**
