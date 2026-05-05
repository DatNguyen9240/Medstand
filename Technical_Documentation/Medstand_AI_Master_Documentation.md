# TÀI LIỆU TỔNG HỢP KIẾN TRÚC & ĐẶC TẢ HỆ THỐNG MEDSTAND AI

## PHẦN 1: TỔNG QUAN KIẾN TRÚC

Tài liệu này cung cấp cái nhìn tổng quan về giải pháp công nghệ và kiến trúc hệ thống của phần mềm Medstand AI, phù hợp cho Ban giám đốc, Đối tác triển khai và các phòng ban liên quan.

## 1. Mục Tiêu Giải Pháp
Hệ thống Medstand AI được thiết kế để giải quyết bài toán tra cứu và thao tác dữ liệu tự động tại quầy thuốc, với các đặc điểm:
- **Ngôn ngữ tự nhiên:** Phân tích nhu cầu của khách hàng thông qua hội thoại (ví dụ: tư vấn triệu chứng cơ bản, tìm thuốc theo hoạt chất).
- **Phản hồi thời gian thực:** Kết nối trực tiếp vào cơ sở dữ liệu hàng hóa và xuất kết quả nhanh chóng.
- **Tối ưu bán hàng:** Đề xuất các sản phẩm bán kèm (Cross-sell/Upsell) dự trên lịch sử và phác đồ phổ thông.

## 2. Kiến Trúc Triển Khai Linh Hoạt (Portable Deployment)
Điểm nhấn của Medstand là khả năng triển khai nhanh gọn không phụ thuộc phức tạp vào hệ điều hành gốc của máy trạm:
- **Môi trường độc lập (Portable):** N8N, Redis, và Node.js được đóng gói nguyên khối. Chuyên viên triển khai chỉ cần thực thi script `start_n8n.bat` để toàn bộ dịch vụ tự khởi chạy ngầm, không yêu cầu cài đặt Docker hay cấu hình biến môi trường thủ công.
- **Tương thích giao diện (Dynamic UI):** Giao diện Chatbot được xây dựng dựa trên CSS Variables (Design Tokens). Khi nhúng vào website đối tác, chatbot tự động kế thừa bảng màu hiện tại của nền tảng website, đảm bảo tính đồng nhất thương hiệu.

## 3. Kiến Trúc Phân Luồng "Master - Worker"
Đội ngũ phát triển áp dụng mô hình phân tách tác vụ nhằm tối ưu chi phí API của các Mô hình Ngôn ngữ Lớn (LLM) và tăng tốc độ xử lý:
- **Master Node:** Sử dụng các model AI tối ưu chi phí (như GPT-4o-Mini) để chuyên trách phân tích và định tuyến ý định của người dùng (Intent Classification).
- **Worker Node:** Xử lý các logic thuần túy và thao tác truy xuất cơ sở dữ liệu SQL truyền thống.
**=> Lợi ích:** Cách làm này giúp giảm thiểu việc yêu cầu AI sinh ra toàn bộ mã SQL phức tạp, từ đó hạn chế tối đa rủi ro suy luận sai (Hallucination), giảm độ trễ phản hồi xuống dưới 3 giây và tiết kiệm đáng kể chi phí vận hành hàng tháng.

## 4. Lộ Trình Phát Triển Tương Lai
Nền tảng được thiết kế lõi mở nhằm sẵn sàng tích hợp các công nghệ nâng cao:
1. **Tích hợp RAG (Retrieval-Augmented Generation):** Xây dựng kho dữ liệu vector dựa trên thư viện Dược lý nội bộ, hỗ trợ chẩn đoán và tư vấn thông tin thuốc có kiểm chứng rõ ràng.
2. **Kịch bản Chăm sóc chủ động (Cron-trigger):** Hệ thống có khả năng tự động quét chu kỳ mua và sử dụng thuốc của bệnh nhân mạn tính (VD: báo hết thuốc sau 30 ngày), qua đó tự động tạo lệnh gửi tin nhắn CSKH.


---

## PHẦN 2: SỔ TAY VẬN HÀNH DÀNH CHO DEVELOPER

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


---

## PHẦN 3: TÀI LIỆU ĐẶC TẢ API (API SPECIFICATIONS)

**Ngày cập nhật:** 24/04/2026

---

### I. API_GoiYDonHang_AI (Module 1 - Gợi Ý Đơn Hàng)
- **Công dụng:** Gợi ý đơn hàng nên bán hôm nay dựa trên lịch sử mua, tính chu kỳ. Cảnh báo số ngày dự kiến cạn kho.
- **Cấu hình:**
  - N8N Intent: `@goi_y_don_hang`
  - Tham số: `@MaKhachHang`, `@TopN`
  - UI Template: Danh sách Card / Table.

### II. API_TuyenBanHang_AI (Module 2 - Quản Lý Tuyến)
- **Công dụng:** Đề xuất danh sách khách hàng cần ưu tiên ghé thăm (Khách sắp hết hàng, hoặc quá 45 ngày chưa phát sinh đơn).
- **Cấu hình:**
  - N8N Intent: `@tuyen_ban_hang`
  - Tham số: `@MaNhanVien`, `@Tuyen`

### III. API_ChamDiemKH_AI (Module 3 - Chấm Điểm Khách Hàng)
- **Công dụng:** Phân loại khách VIP (A), Ổn định (B), Nguy cơ (C) dựa trên doanh thu. Phân tích trạng thái rớt hạng hoặc tiềm năng tăng trưởng.
- **Cấu hình:**
  - N8N Intent: `@cham_diem_kh`
  - Tham số: `@MaKhachHang`, `@Thang`, `@Nam`

### IV. API_TichLuy_AI (Module 4 - Theo Dõi Tích Lũy)
- **Công dụng:** Theo dõi tiến độ chương trình tích lũy của khách, tính toán số tiền/doanh số còn thiếu để đạt thưởng.
- **Cấu hình:**
  - N8N Intent: `@tich_luy`
  - Tham số: `@MaKhachHang`, `@MaCTKM`

### V. API_UpsellGoiY_AI (Module 5 - Trợ Lý Chuyên Môn / Upsell)
- **Công dụng:** Đề xuất Combo bù doanh số để khách hưởng chiết khấu, gợi ý sản phẩm bán kèm (Cross-sell) theo triệu chứng.
- **Cấu hình:**
  - N8N Intent: `@upsell_goi_y`
  - Tham số: `@MaKhachHang`, `@TuKhoaTrieuChung`

### VI. API_DeXuatKhuyenMai_AI (Module 6 - Đề Xuất Khuyến Mại)
- **Công dụng:** Phân tích tốc độ bán, tồn kho thực tế để đưa ra đề xuất chạy Combo hoặc Xả hàng đối với hàng cận Date.
- **Cấu hình:**
  - N8N Intent: `@de_xuat_khuyen_mai`
  - Tham số: `@MaSanPham`

### VII. API_GoiYDonThuoc_AI (Module 8 - Nhận Diện Đơn Thuốc)
- **Công dụng:** Đọc dữ liệu thành phần y khoa được AI bóc tách từ ảnh và gợi ý sản phẩm Medstand tương đương để thay thế.
- **Cấu hình:**
  - N8N Intent: `@goi_y_don_thuoc`
  - Tham số: `@ThanhPhan`, `@TuKhoa`

### VIII. API_SanPhamTrongTam_AI (Module 10 - Danh Sách SP Trọng Tâm)
- **Công dụng:** Liệt kê danh mục các sản phẩm đang được công ty ưu tiên đẩy số trong tháng.
- **Cấu hình:** Tham số `@Thang`, `@Nam`

### IX. API_SanPhamTrongTam_Import_AI (Module 10 - Import SP Trọng Tâm)
- **Công dụng:** Cho phép Admin hoặc quản lý Import danh sách sản phẩm trọng tâm mới vào hệ thống thông qua Chatbot.
- **Cấu hình:** Tham số truyền vào dạng mảng dữ liệu.

### X. API_TraCuuSanPham_AI (Module 10 - Tra Cứu Sản Phẩm)
- **Công dụng:** Trợ lý tìm kiếm nhanh thông tin sản phẩm, hoạt chất, quy cách đóng gói và giá bán lẻ.
- **Cấu hình:** Tham số `@TuKhoa`

### XI. API_KhachHang_Insert_AI (Tạo Khách Hàng Mới)
- **Công dụng:** Tạo hồ sơ khách hàng mới trực tiếp qua màn hình chat, lưu thẳng vào Database.
- **Cấu hình:** Tham số `@TenKhachHang`, `@SoDienThoai`, `@DiaChi`. Hỗ trợ luồng UI Form nhập liệu.

### XII. API_KhachHangList (Danh Sách Khách Hàng)
- **Công dụng:** Tra cứu và tìm kiếm thông tin cơ bản của danh sách khách hàng.
- **Cấu hình:** Tham số `@TuKhoa`

### XIII. API_DonHang_AI (Tra Cứu Đơn Hàng)
- **Công dụng:** Tra cứu lịch sử đặt hàng, tình trạng đơn hàng của khách.
- **Cấu hình:** Tham số `@MaKhachHang`, `@TuNgay`, `@DenNgay`

### XIV. API_DonHangChiTiet_Insert_AI (Lên Đơn Hàng)
- **Công dụng:** Tính năng Giỏ hàng, cho phép Sale chốt đơn và insert chi tiết đơn hàng thẳng vào hệ thống.
- **Cấu hình:** Hỗ trợ UI Template `CART`.

### XV. API_HoaDon_AI (Tra Cứu Hóa Đơn)
- **Công dụng:** Tra cứu thông tin, trạng thái xuất hóa đơn của các đơn hàng.
- **Cấu hình:** Tham số `@MaKhachHang`

### XVI. API_DoanhSo_AI (Báo Cáo Doanh Số)
- **Công dụng:** Báo cáo doanh thu cá nhân, doanh thu nhóm hoặc doanh thu chi tiết từng điểm bán.
- **Cấu hình:** Đầu vào `@TuNgay`, `@DenNgay`, `@MaNhanVien`, `@MaKhachHang`. Hiển thị qua bảng DataGrid.

### XVII. API_CongNoKhachHang_AI (Công Nợ Tổng)
- **Công dụng:** Tổng hợp dư nợ hiện tại của nhà thuốc.
- **Cấu hình:** Tham số `@MaKhachHang`.

### XVIII. API_CongNoChiTiet_AI (Công Nợ Chi Tiết)
- **Công dụng:** Liệt kê chi tiết từng khoản chưa thanh toán (từng phiếu xuất), làm nổi bật nợ quá hạn.
- **Cấu hình:** Tham số `@MaKhachHang`. Bảng chi tiết.

### XIX. API_DanhsachTonKho_AI (Tra Cứu Tồn Kho)
- **Công dụng:** Kiểm tra số lượng tồn kho thời gian thực theo phân quyền (Kho tổng công ty, DL02, DL03).
- **Cấu hình:** N8N Intent `@ton_kho`. Truyền `@MaSanPham`, `@MaKho`.

### XX. API_DanhMuc_AI (Tra Cứu Danh Mục)
- **Công dụng:** Lấy danh sách các danh mục hệ thống để điền Form hoặc Lookup.

### XXI. API_PhuongXa (Tra Cứu Địa Giới)
- **Công dụng:** Cung cấp dữ liệu Tỉnh/Thành, Quận/Huyện cho các form nhập liệu (ví dụ thêm mới khách hàng).

### XXII. API_KiemTraKhaoSat_AI (Kiểm Tra Khảo Sát)
- **Công dụng:** Kiểm tra xem khách hàng hiện tại có nằm trong nhóm đối tượng cần làm bài khảo sát không.

### XXIII. API_KiemTraKhaoSatNgay_AI (Kiểm Tra Khảo Sát Hôm Nay)
- **Công dụng:** Kiểm tra xem hôm nay khách hàng đã hoàn thành bài khảo sát chưa.

### XXIV. API_DanhSachCauHoiKhaoSat_AI (Lấy Câu Hỏi Khảo Sát)
- **Công dụng:** Kéo danh sách các câu hỏi khảo sát từ DB ra để Bot lần lượt phỏng vấn khách hàng.

### XXV. API_CapNhatKetQuaKhaoSat_AI (Ghi Nhận Kết Quả Khảo Sát)
- **Công dụng:** Ghi nhận/Insert câu trả lời khảo sát của khách hàng (do Sale thu thập) vào Database thông qua chat.

### XXVI. API_LichSuKhaoSat_AI (Lịch Sử Khảo Sát)
- **Công dụng:** Tra cứu lại lịch sử các lần khảo sát trước đây của một điểm bán.

---

### PHỤ LỤC: YÊU CẦU DỮ LIỆU ĐẦU VÀO
Để 26 API trên hoạt động chính xác, hệ thống Medstand cần được cung cấp dữ liệu:
1. **Dữ liệu Khách hàng:** Tên, địa chỉ, kênh bán, phân loại nhóm khách hàng.
2. **Dữ liệu Lịch sử (6-12 tháng):** Ngày bán, Sản phẩm, Số lượng, Giá trị, Tồn kho.
3. **Dữ liệu Tuyến Sale:** Cấu hình Sale phụ trách, Tuyến, Tần suất ghé thăm.
4. **Dữ liệu Chính sách:** CTKM, Thưởng, Chiết khấu, Danh mục SP Trọng tâm, Câu hỏi Khảo sát.
