# 🚀 Ý Tưởng Nâng Cấp Hệ Thống AI Medstand Trong Tương Lai

Tài liệu này là "Ví ý tưởng" lưu trữ các công nghệ và tính năng tiềm năng có thể triển khai để nâng cấp hệ thống N8N & Chatbot Medstand, sau khi phiên bản V2 hiện tại đã vận hành ổn định.

---

## 1. Mảnh Ghép Trí Tuệ RAG (Retrieval-Augmented Generation)

### 1.1. Luồng Hybrid RAG x SQL (Chẩn bệnh & Kê thuốc tự động)
*   **Nỗi đau hiện tại:** SQL sử dụng cơ chế `LIKE` truy vấn chuỗi. Dẫn đến việc nhân sự bắt buộc phải gán thủ công `TuKhoa` (keyword bệnh lý) cho từng mã thuốc dưới Database.
*   **Cơ chế hoạt động đề xuất:**
    1. Chuẩn bị tài liệu định hướng Dược (Cẩm nang y khoa nội bộ của Medstand).
    2. Nạp vào Vector Database (Pinecone / Qdrant).
    3. N8N RAG đóng vai trò làm *Bác Sĩ*: Lắng nghe khách khai bệnh -> Lục VectorDB -> Xuất ra đích danh **Tên Hoạt Chất** (Ví dụ: `Loratadin`).
    4. N8N gọi API xuống SQL (đóng vai trò *Thủ Kho*): Yêu cầu đếm tồn kho, kiểm tra giá cho các mặt hàng chứa hoạt chất `Loratadin`.
*   **Tác động:** Giải phóng hoàn toàn sức lao động. Nhà thuốc không bao giờ phải hì hục nhập keyword bệnh lý nữa. Mọi thứ tự động nảy số nhờ kiến thức Y Khoa của RAG.
*   **Thời gian triển khai dự kiến:** Tầm 1 buổi (3 - 4 giờ).

### 1.2. Chuyên Gia Hỏi Đáp Y Tế (Luồng Fallback Mềm)
*   **Nỗi đau hiện tại:** Khi user đưa ra các câu hỏi dạng tư vấn (vd: *"Ăn gì để hạ đường huyết"*, *"Bác sĩ ơi bôi thuốc này có xót không"*), hệ thống trượt khỏi các API SQL quen thuộc và trả về lỗi không nhận diện được.
*   **Cơ chế hoạt động đề xuất:** Cắm một mạch RAG vào Node Fallback. Khi N8N phát hiện đây không phải là tác vụ tra cứu tồn kho hay mua hàng, LLM sẽ chuyển sang vai *"Chuyên viên chăm sóc"*, đọc tài liệu Y Khoa của tiệm để giữ chân khách bằng những lời khuyên chuẩn y tế.

---

## 2. Chủ Động Chăm Sóc Khách Hàng (Automated Trigger)

*   **Ý tưởng:** Đảo ngược lối chơi. Thay vì đợi khách lên Web/Zalo hỏi thì AI mới đáp, ta cho Bot làm chủ cuộc chơi.
*   **Cách làm:** Dùng **Schedule Trigger (Cron Job)** trên N8N.
    *   Mỗi buổi sáng, N8N tự móc xuống Database SQL xem: *"Có khách hàng nào mua toa thuốc mạn tính (tiểu đường, huyết áp) cách đây đúng 30 ngày không?"*.
    *   Nếu có -> Đồng nghĩa với việc khách đã uống hết thuốc.
    *   N8N tự động móc API Zalo ZNS / SMS để gửi tin nhắn: *“Chào anh Tâm, toa Glucophage của anh tháng trước chắc đã hết, anh có muốn em gửi hỏa tốc qua địa chỉ cũ không ạ?”*
*   **Tác động:** Tăng tỷ lệ khách quay vòng (Retention Rate) cực cao nhờ bán hàng dựa trên chu kỳ. Nhờ có AI soạn tin mà không tốn một giọt sức thủ công nào.

---

## 3. Hệ Thống Khuyến Nghị Học Máy (Machine Learning Recommendation)

*   **Ý tưởng:** Dần thay thế cơ chế tính `PriorityScore` gán tay (+200000, +1000000) trong Store Procedure bằng thuật toán phân tích giỏ hàng (Market Basket Analysis).
*   **Cách làm:** AI học lịch sử hàng vạn cái hóa đơn trên CSDL để phát hiện quy luật *“Khách mua bao cao su thường hay mua thêm kẹo ngậm”*. Từ đó Cross-sell chuẩn xác hơn theo thị hiếu địa phương.

*(Tài liệu này sẽ liên tục được độn thêm khi có ý tưởng mới trong quá trình vận hành!)*

# 🚀 Kế Hoạch Nâng Cấp Medstand AI Chatbot (Giai Đoạn Post-Beta)

**Mục tiêu:** Nâng cao độ thông minh (UX) và tối ưu hóa luồng xử lý n8n sau khi phát hành thành công phiên bản Beta.

---






## 1. Xử lý NLP Tham số thời gian (Dynamic Time Extraction)
**Vấn đề hiện tại:** AI đang phải gọi fallback `ASK_CLARIFICATION` khi gặp các cụm từ thời gian tương đối do người dùng nhập vào (ví dụ: *"khách chưa mua tháng này"*, *"tuần trước"*).
**Hướng nâng cấp:**
* **Cập nhật System Prompt / Tool Description:** Hướng dẫn LLM cách chuyển đổi các từ khóa thời gian tự nhiên thành bộ tham số chuẩn (`StartDate`, `EndDate`) theo định dạng `YYYY-MM-DD`.
* **Xử lý tại n8n:** Workflow sẽ nhận trực tiếp hai biến ngày tháng này để đẩy vào các Stored Procedure truy vấn SQL, giúp trả về kết quả ngay lập tức thay vì hỏi lại người dùng một cách máy móc.

## 2. Tự động hóa Ngữ cảnh & Phân quyền Truy cập (Context Auto-Injection)
**Vấn đề hiện tại:** AI thiếu bối cảnh về người đang chat, dẫn đến việc phải hỏi ngược lại những thông tin dư thừa (ví dụ: *"Tuyến ghé thăm hôm nay tôi cần đến đâu"* -> AI hỏi lại khu vực).
**Hướng nâng cấp:**
* **Truyền Metadata từ Frontend:** Khi gọi Webhook n8n, payload gửi lên sẽ đính kèm trực tiếp thông tin định danh của người dùng (UserID, Chi nhánh, Khu vực quản lý).
* **Phân quyền theo Data Scope:** Áp dụng luồng xử lý nghiêm ngặt bên dưới workflow để mỗi user chỉ được xem dữ liệu trong khoảng cho phép của họ. Dù hệ thống phục vụ vài chục người cùng lúc, AI vẫn tự động map đúng metadata để lôi ra chính xác danh sách khách hàng, tuyến đường hay doanh số của riêng người đó, chặn đứng nguy cơ rò rỉ dữ liệu chéo.

## 3. Nâng cấp Giao diện Trả lời (Tối ưu Mobile UI)
**Vấn đề hiện tại:** Dữ liệu trả về đôi khi ở dạng bảng (table) nhiều cột, gây khó đọc hoặc tràn viền trên màn hình điện thoại.
**Hướng nâng cấp:**
* **Cấu trúc lại Output Payload:** Điều chỉnh luồng n8n để thay vì trả về raw HTML hoặc mảng data thô, hệ thống sẽ format dữ liệu thành cấu trúc chuẩn để Frontend có thể dễ dàng map vào các giao diện **Card View**. 
* **Lợi ích:** Các danh sách sản phẩm gợi ý, tuyến bán hàng, hoặc chi tiết công nợ sẽ hiển thị dạng thẻ (card) bo góc gọn gàng, mang lại trải nghiệm app-like mượt mà và hiện đại hơn rất nhiều so với bảng biểu truyền thống.




# ⚡ Chiến Lược Tối Ưu AI Multi-Agent QA Pipeline

**Mục tiêu:** Giảm chi phí API (Token), tăng tốc độ review và hạn chế "ảo giác" (hallucination) khi AI phải đọc hàng ngàn dòng code.

## 1. Smart Routing (Định tuyến File Thông minh)
* **Vấn đề:** Đưa tất cả source code cho mọi Agent đọc là tốn tiền và gây nhiễu.
* **Giải pháp:** Xây dựng Router phân loại file trước khi xử lý.
  * `.sql` ➔ Gửi cho Security Agent.
  * `.js / .ts` ➔ Gửi cho Convention Checker & Performance Agent.
  * `README.md / .gitignore` ➔ Bỏ qua (Bypass).

## 2. AST Chunking (Cắt code theo ngữ nghĩa)
* **Vấn đề:** Nếu cắt code theo số dòng (VD: 100 dòng/nhát), logic của một Function/Class sẽ bị đứt đôi, AI không hiểu bối cảnh.
* **Giải pháp:** Sử dụng AST (Abstract Syntax Tree) để phân tích cú pháp và cắt code trọn vẹn theo từng khối Hàm/Class.

## 3. Parallelism & Prompt Caching (Tốc độ & Chi phí)
* **Xử lý song song:** Cấu hình các Agent chạy đồng thời (qua `Promise.all` hoặc luồng Parallel của n8n). Tốc độ review sẽ giảm từ vài phút xuống vài chục giây.
* **Prompt Caching:** File `rules.md` (luật của dự án) thường rất dài và ít đổi. Tận dụng tính năng Caching của LLM API để bộ nhớ tạm lưu lại đoạn prompt này, giúp giảm đến 80% chi phí token đầu vào cho các lần gọi sau.

## 4. Structured Outputs (Ép kiểu dữ liệu chuẩn)
* **Vấn đề:** Các Agent trả về báo cáo lộn xộn (con dùng Markdown, con gạch đầu dòng), Agent Tổng không thể gộp lại được.
* **Giải pháp:** Bắt buộc sử dụng `response_format: { type: "json_schema" }` (trên OpenAI API) để ép mọi Agent trả về đúng một khung JSON đồng nhất (Issue, Severity, Suggestion Fix).