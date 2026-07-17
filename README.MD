# 🏥 HỆ THỐNG MEDSTAND — CRM & AI ASSISTANT CHO TRÌNH DƯỢC VIÊN (TDV)

Điểm bắt đầu: [`docs/README.md`](docs/README.md), [`sql/README.md`](sql/README.md), [`scripts/README.md`](scripts/README.md) và [`reports/README.md`](reports/README.md).

Ứng dụng Web / PWA tích hợp Trợ lý ảo AI và công cụ quản lý bán hàng chuyên nghiệp dành cho Trình dược viên (TDV), Quản lý và Ban giám đốc trong ngành Dược phẩm.

---

## 🛠️ DANH SÁCH TOÀN BỘ CHỨC NĂNG HỆ THỐNG

Hệ thống Medstand được chia thành các cấu phần chính bao gồm: Ứng dụng di động PWA dành cho TDV, Trợ lý ảo Medstand AI Copilot (tích hợp n8n & SQL), và Tiện ích đồng bộ báo cáo Google Sheets Sync.

### 1. Ứng dụng di động PWA (Mobile Web App dành cho TDV)
Hỗ trợ trình dược viên quản lý hoạt động kinh doanh trực tiếp ngoài thị trường:
*   **Trang chủ (Dashboard):** Hiển thị tổng quan các biểu đồ doanh thu, số lượng đơn hàng, và tiến trình kế hoạch bán hàng của TDV.
*   **Bản đồ & Tuyến bán hàng (Routes Management):**
    *   Hiển thị danh sách khách hàng cần ghé thăm trong ngày theo mức độ ưu tiên.
    *   Tích hợp bản đồ GPS (sử dụng bản đồ Google và OpenStreetMap) hiển thị trực quan các điểm nhà thuốc trên tuyến.
    *   Hỗ trợ tìm kiếm nhanh điểm đến, chỉ đường, định vị vị trí hiện tại của TDV và tính năng **Check-in** tuyến bán hàng tại điểm.
*   **Quản lý Khách hàng:** Quản lý thông tin chi tiết nhà thuốc, phân loại khách hàng theo nhóm, kênh bán hàng và khu vực.
*   **Hệ thống Đơn hàng (Orders):**
    *   **Tạo đơn hàng:** Lập đơn hàng mới cho khách hàng trực tiếp khi đi tuyến, hỗ trợ chọn sản phẩm, tính toán chiết khấu và tổng tiền tự động.
    *   **Quản lý danh sách đơn hàng:** Tìm kiếm, lọc và theo dõi trạng thái đơn hàng (Chờ duyệt, Đã duyệt, Đang giao, Đã nhận, v.v.).
    *   **Chi tiết & Chỉnh sửa đơn hàng:** Xem chi tiết mặt hàng, số lượng và điều chỉnh đơn hàng trước khi phê duyệt.
    *   **Hóa đơn:** Theo dõi danh sách hóa đơn tài chính đi kèm.
*   **Phiếu Trả hàng (Return Orders):**
    *   Tạo và quản lý phiếu trả lại sản phẩm từ nhà thuốc.
    *   Quản lý danh mục sản phẩm trả và theo dõi trạng thái duyệt trả hàng.
*   **Hiệu năng & Chỉ tiêu bán hàng:**
    *   **Doanh số (Revenue):** Báo cáo chi tiết doanh thu thực tế theo ngày, tuần, tháng, so sánh tăng trưởng.
    *   **Kế hoạch bán hàng (Sales Plan):** Theo dõi kế hoạch bán hàng chi tiết được giao và mức độ hoàn thành chỉ tiêu (KPIs).
    *   **Điểm Hợp đồng (Contract Points):** Theo dõi tích lũy điểm thưởng và quyền lợi của khách hàng dựa trên các hợp đồng mua hàng cam kết.
    *   **Cảnh báo sản phẩm:** Theo dõi các sản phẩm bán chậm, sản phẩm cận hạn sử dụng (cận date) hoặc sắp hết hàng trong kho.
*   **Hệ thống Khảo sát (Survey System):**
    *   Thực hiện các bài khảo sát ý kiến khách hàng hoặc khảo sát kiến thức sản phẩm của TDV.
    *   Ghi nhận câu trả lời và lưu trữ lịch sử các bài khảo sát đã thực hiện.
*   **Thông báo & Tài khoản:**
    *   Nhận thông báo hệ thống và cập nhật trạng thái đơn hàng.
    *   Quản lý thông tin tài khoản cá nhân, chỉnh sửa thông tin và đổi mật khẩu.

### 2. Trợ lý ảo Medstand AI (AI Copilot & Routing Engine)
Hệ thống chatbot AI thông minh được cấu trúc theo 12 module cốt lõi, liên kết trực tiếp với database ERP thông qua n8n và các stored procedures SQL để hỗ trợ hỏi đáp dữ liệu thời gian thực:
*   **Module 1 — Gợi ý Đơn hàng (`API_GoiYDonHang_AI`):** Tự động phân tích lịch sử mua hàng, chu kỳ tiêu thụ của khách để gợi ý sản phẩm phù hợp cần bán hoặc hiển thị top sản phẩm bán chạy nhất chi nhánh.
*   **Module 2 — Quản lý Tuyến Bán hàng (`API_TuyenBanHang_AI`):** Chỉ ra danh sách khách hàng TDV nên ghé thăm hôm nay và cảnh báo những khách hàng có nguy cơ rời bỏ hệ thống (quá 45 ngày chưa phát sinh đơn).
*   **Module 3 — Chấm điểm Khách hàng RFM-C (`API_ChamDiemKH_AI`):** Phân loại khách hàng thành các nhóm VIP (A), Ổn định (B) hoặc Nguy cơ (C) dựa trên phân tích 4 trọng số: Recency (Mua gần đây), Frequency (Tần suất), Monetary (Doanh số) và Consumption (Sản lượng tiêu thụ).
*   **Module 4 — Theo dõi Chương trình Tích lũy (`API_TichLuy_AI`):** Kiểm tra tình trạng tích lũy doanh số của từng nhà thuốc đối với các chương trình khuyến mãi/quà tặng, chỉ rõ số tiền còn thiếu để đạt mốc nhận thưởng tiếp theo.
*   **Module 5 — AI tìm kiếm theo Triệu chứng (`API_UpsellGoiY_AI`):** Hỗ trợ tìm kiếm và gợi ý các sản phẩm phù hợp dựa trên triệu chứng bệnh (ví dụ: mất ngủ, ho, sốt, đau đầu) và gợi ý bán thêm (upsell) để đạt mốc chiết khấu tốt hơn.
*   **Module 6 — Đề xuất Chương trình Khuyến mại (`API_DeXuatKhuyenMai_AI`):** Phân tích dữ liệu tồn kho lớn, hàng cận date hoặc sản phẩm bán chậm để đề xuất chạy combo khuyến mại hoặc xả hàng (dành cho CEO/Quản lý).
*   **Module 8 — Gợi ý Đơn thuốc & Bán chéo (`API_GoiYDonThuoc_AI`):** Nhập danh sách tên thuốc từ đơn thuốc (hoặc qua OCR bóc tách hình ảnh đơn), hệ thống tự động tìm kiếm các sản phẩm thay thế của Medstand và đưa ra cảnh báo tương tác thuốc hoặc gợi ý bán kèm.
*   **Module 10 — Sản phẩm Trọng tâm tháng (`API_SanPhamTrongTam_AI`):** Theo dõi danh sách sản phẩm trọng tâm được BGĐ chỉ định đẩy mạnh trong tháng và tiến độ tích lũy quà tặng của khách hàng.
*   **Module 11 — Tra cứu Sản phẩm & Tồn kho:** Tra cứu nhanh thông tin chi tiết của một sản phẩm và kiểm tra tồn kho thời gian thực theo từng mã sản phẩm (`API_TraCuuSanPham_AI` & `API_DanhSachTonKho_AI`).
*   **Module 12 — Khảo sát Khách hàng:** Khởi động bài khảo sát và ghi nhận kết quả phản hồi của nhân viên/khách hàng.
*   **Quản lý Tri thức RAG Admin:** Giao diện quản lý cơ sở tri thức (Knowledge Base) của AI, cho phép nạp tài liệu và tối ưu hóa dữ liệu vector store (Qdrant).

### 3. Tiện ích Đồng bộ Google Sheets (Data Sync Hub)
Công cụ đồng bộ dữ liệu chuyên nghiệp từ máy chủ Medstand sang Google Trang tính dành cho bộ phận Kế toán / Vận hành:
*   **Đồng bộ báo cáo tự động:** Lấy trực tiếp dữ liệu báo cáo doanh số, tuyến bán hàng, danh mục sản phẩm, khách hàng từ máy chủ về Google Sheets chỉ qua 1 click.
*   **Chế độ linh hoạt:**
    *   *Đồng bộ nối tiếp (Append):* Giữ nguyên dữ liệu cũ, chèn thêm dữ liệu mới ở phía dưới.
    *   *Ghi đè (Overwrite):* Xóa dữ liệu cũ của trang tính và ghi đè dữ liệu mới từ đầu.
*   **Tự động định dạng:** Tự động kẻ viền bảng, căn chỉnh độ rộng cột tối ưu cho vừa khít chữ (Auto-fit), tô màu tiêu đề cột và định dạng số trực quan.

### 4. Các tính năng Kỹ thuật & Bảo mật nâng cao
*   **Secure API Gateway:** Sử dụng cơ chế mã hóa XOR + Base64 hai chiều giữa Client và Server để bảo vệ an toàn thông tin đường truyền, ẩn hoàn toàn địa chỉ API backend thật và các endpoint n8n.
*   **Tải trang tốc hành:** Toàn bộ CSS và JS của 27 trang SPA được đóng gói (bundle) và nén tối ưu giúp giảm tải tài nguyên mạng từ 43 kết nối xuống còn 2 kết nối duy nhất.
*   **PWA & Service Worker Cache:** Lưu trữ tài nguyên tĩnh thông minh trên thiết bị, hỗ trợ truy cập ứng dụng mượt mà và hoạt động ở chế độ ngoại tuyến (Offline Mode) khi mất kết nối mạng.
*   **Rate Limiting & Timeout Control:** Ngăn chặn lỗi "Retry Storm" (cơn bão gửi lại request khi database phản hồi chậm) bằng cách kiểm soát thời gian chờ 60 giây và chống spam hiệu quả.
*   **Redis Cache & Vector Database (Qdrant):** Tích hợp bộ nhớ đệm Redis để tối ưu hóa hiệu năng, giảm thời gian phản hồi của chatbot và Qdrant để lưu trữ tri thức RAG cho LLM.

---

## 🔑 Thông tin Quản trị & Đăng nhập

### Cấu hình cục bộ

- n8n local: [http://localhost:5678](http://localhost:5678).
- Credential và cấu hình database chỉ lưu trong `.env`/`.env.uat.local`; không ghi giá trị thật vào tài liệu hoặc Git.
- Dùng `.env.uat.example` làm danh sách biến cấu hình mẫu.

