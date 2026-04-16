# TÀI LIỆU TỔNG QUAN KIẾN TRÚC MEDSTAND AI

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
