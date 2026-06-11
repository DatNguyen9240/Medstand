# HƯỚNG DẪN CẤU HÌNH & ĐỒNG BỘ DỮ LIỆU LÊN GOOGLE SHEETS
## (Tài liệu dành cho người triển khai - Rất dễ hiểu, ai cũng làm được)

Tài liệu này hướng dẫn chi tiết từ cách cấu hình máy chủ (Server) cho đến cài đặt trên ứng dụng Google Sheets khi bạn chuyển giao hệ thống sang máy của khách hàng mới.

---

## 1. CÁCH THỨC HOẠT ĐỘNG (DỄ HIỂU)

Hệ thống hoạt động theo 3 bước cực kỳ đơn giản như sau:

1. **Bạn gửi yêu cầu**: Trên thanh công cụ Google Sheets, bạn chọn loại báo cáo cần lấy và nhấn nút **Đồng bộ**.
2. **Máy chủ xử lý**: Google Sheets sẽ kết nối bảo mật đến máy chủ của bạn để lấy đúng dữ liệu bạn cần.
3. **Hiển thị kết quả**: Dữ liệu tự động đổ thẳng vào các ô tính, tự động kẻ bảng viền xám nhạt, tô màu tiêu đề cột và tự co giãn độ rộng cột cho vừa khít chữ (không bị che khuất).

> [!NOTE]
> **Có 2 chế độ đồng bộ cho bạn lựa chọn:**
> *   **Đồng bộ nối tiếp (Append)**: Giữ nguyên dữ liệu cũ, tự chèn thêm 2 dòng trống làm khoảng cách rồi viết tiếp dữ liệu mới ở phía dưới.
> *   **Ghi đè dữ liệu mới (Overwrite)**: Xóa sạch dữ liệu cũ trong trang tính hiện tại và ghi đè dữ liệu mới từ đầu.

---

## 2. HƯỚNG DẪN CẤU HÌNH & KHỞI CHẠY MÁY CHỦ (SERVER-SIDE)
*(Thực hiện trên máy tính/máy chủ chạy cơ sở dữ liệu của khách hàng)*

Khi chuyển giao mã nguồn dự án sang máy chủ của khách hàng mới, bạn thực hiện cấu hình 2 bước sau:

### Bước 2.1: Cấu hình tệp tin `.env`
Mở tệp tin **`.env`** nằm ở thư mục gốc của dự án và chỉnh sửa đúng các thông số của khách hàng đó:
```env
# Cổng chạy ứng dụng (mặc định giữ nguyên là 3000)
PORT=3000

# Điền tên miền thật (Domain Public) của khách hàng đó
API_BASE=https://tên-miền-của-khách.com

# Tạo một mã bảo mật (API Key) riêng cho khách hàng này để xác thực
CHAT_API_KEY=khóa-bảo-mật-khách-hàng-tự-chọn

# Điền địa chỉ n8n nội bộ của khách hàng
N8N_BASE=http://localhost:5678
```

### Bước 2.2: Khởi chạy máy chủ Proxy
* Click đúp chuột vào tệp tin **`start_server.bat`** ở thư mục gốc để khởi động máy chủ.
* Hệ thống sẽ tự động dọn dẹp cổng chạy cũ và khởi động dịch vụ Proxy an toàn ở cổng `3000`.

---

## 3. HƯỚNG DẪN CÀI ĐẶT TRÊN GOOGLE SHEETS (CLIENT-SIDE)
*(Thực hiện trên trình duyệt Google Sheets máy của khách hàng)*

Bạn chỉ cần thực hiện 5 bước cài đặt ban đầu này, các lần sau chỉ việc mở lên và dùng:

### Bước 3.1: Tạo một file Google Sheets mới
* Mở trình duyệt web, truy cập vào Google Drive của bạn.
* Tạo một file Google Trang tính (Google Sheets) trống mới.

### Bước 3.2: Mở trình soạn thảo mã nguồn
* Trên thanh menu của Google Sheets, bấm chọn **Tiện ích mở rộng** (Extensions) -> chọn **Apps Script**.
* Một tab mới sẽ hiện ra. Đây là nơi chứa mã code chạy ngầm của Google.

### Bước 3.3: Tạo các tệp mã nguồn tương ứng
1. Tại danh sách tệp bên trái, bạn bấm vào file **`Code.gs`** (hoặc `Mã.gs`) có sẵn. Xóa sạch mọi chữ trong đó, sau đó copy toàn bộ mã code ở tệp `Code.gs` trong thư mục `google-sheets-addon` dán vào. Nhấn nút Lưu (biểu tượng đĩa mềm).
2. Tiếp tục bấm vào nút dấu cộng **[+]** màu đen (bên cạnh chữ Tệp) -> Chọn **HTML**.
3. Đặt tên chính xác cho file này là: **`Sidebar`** (Google sẽ tự tạo thành `Sidebar.html`).
4. Xóa sạch nội dung mặc định của file `Sidebar` này đi, copy toàn bộ mã ở tệp `Sidebar.html` trong thư mục `google-sheets-addon` dán vào. Nhấn nút Lưu.

### Bước 3.4: Tải lại trang Google Sheets
* Quay lại màn hình Google Sheets của bạn và bấm **F5** để tải lại trang.
* Chờ khoảng 2 - 3 giây, bạn sẽ thấy xuất hiện một mục Menu mới tên là **`Data Sync Hub`** ở ngay trên thanh công cụ.

### Bước 3.5: Điền cấu hình và Đồng bộ dữ liệu
1. Bấm vào **`Data Sync Hub`** -> Chọn **`Mở Bảng Điều Khiển`**.
2. Một bảng điều khiển màu trắng tinh giản, nút bấm màu đen sang trọng sẽ hiện ra ở cạnh phải màn hình.
3. Nhập **Địa chỉ máy chủ** (đường dẫn tên miền bạn đã cấu hình ở Bước 2.1, ví dụ: `https://tên-miền-của-khách.com`) và **Khóa bảo mật** đã chuẩn bị.
4. Chọn loại báo cáo cần xem (Báo cáo doanh số, Danh mục khách hàng, Sản phẩm, Tuyến bán hàng) và chỉnh thời gian lọc tùy ý.
5. Nhấn nút **Đồng bộ nối tiếp** hoặc **Ghi đè dữ liệu mới** để xem kết quả dữ liệu tự động đổ về bảng tính.

---

## 4. MÃ NGUỒN COPY-PASTE (CHỈ CẦN COPY VÀ DÁN)

### 4.1 Mã `Code.gs`
Hãy copy toàn bộ đoạn mã trong file **`google-sheets-addon/Code.gs`** dán vào file Code.gs của Apps Script.

### 4.2 Mã `Sidebar.html`
Hãy copy toàn bộ đoạn mã trong file **`google-sheets-addon/Sidebar.html`** dán vào file Sidebar.html của Apps Script.

---

## 5. LƯU Ý KHI VẬN HÀNH

> [!TIP]
> *   **Giới hạn dữ liệu**: Google Trang tính giới hạn thời gian chờ mỗi lần tải dữ liệu tối đa là 6 phút. Nếu báo cáo của bạn quá lớn, hãy chỉnh ô **Số dòng lấy tối đa (TopN)** ở mức vừa phải (khoảng dưới `1000` dòng) để máy chạy nhanh và mượt mà nhất.
> *   **Tính bảo mật**: Khóa xác thực (API Key) hoạt động như một chiếc chìa khóa bảo mật. Bạn tuyệt đối không chia sẻ địa chỉ máy chủ hoặc khóa này cho người ngoài để bảo vệ dữ liệu doanh nghiệp an toàn.
