# 🏗️ Blueprint: Hệ thống "AI Tech Lead" Đánh Giá Đa Dự Án (Multi-Project AI QA)

**Mục tiêu:** Xây dựng một hệ thống AI tự động review code, đánh giá kiến trúc và rà soát lỗi bảo mật có khả năng "nhập gia tùy tục" – áp dụng được cho nhiều project khác nhau (Backend, Frontend, DevOps) mà không bị nhầm lẫn quy chuẩn (coding convention).

---

## 1. Nguyên lý Thiết kế Cốt lõi: RAG > Fine-tuning
Tuyệt đối KHÔNG fine-tune (huấn luyện) một model tĩnh bằng code của nhiều dự án khác nhau để tránh việc AI bị "lú" (hallucination) và râu ông nọ cắm cằm bà kia. Thay vào đó, sử dụng kiến trúc **Agentic Workflow kết hợp RAG (Retrieval-Augmented Generation)**:

* **Bộ não (Reasoning Engine):** Sử dụng các mô hình LLM lớn mạnh về logic và coding (VD: GPT-4o, Claude 3.5 Sonnet) làm lõi xử lý.
* **Luật chơi (Context/Rulesets):** Mỗi project sở hữu một bộ cấu hình riêng (File `rules.md` chứa định dạng API, DB Schema, Coding Convention). Hệ thống sẽ tự động "bơm" (inject) bộ luật này vào System Prompt của AI khi có request đánh giá project tương ứng.

---

## 2. Tiêu chuẩn hóa Đầu vào (Context Ingestion)
Không ném toàn bộ source code (raw code) vào AI để tránh ngợp token. Dữ liệu cần được tinh chế tùy theo hạng mục đánh giá:

### ⚙️ Backend (BE)
* **File OpenAPI / Swagger:** Đánh giá chuẩn thiết kế RESTful, REST params, response structure.
* **Database Schema (SQL/Prisma):** Kiểm tra chuẩn hóa 1NF-3NF, tối ưu index, khóa ngoại.
* **Router/Controller files:** Đánh giá logic phân luồng.

### 🎨 Frontend (FE)
* **`package.json`:** Rà soát thư viện cũ, lỗ hổng bảo mật (Vulnerabilities), dependency conflicts.
* **Component Tree:** Đánh giá cấu trúc tái sử dụng (reusability), quản lý state (Redux/Zustand).

### 🛠️ Config / DevOps
* **`docker-compose.yml` / `Dockerfile`:** Kiểm tra tối ưu dung lượng image, phân quyền user (tránh chạy quyền root).
* **Nginx / Server config:** Soát lỗi cấu hình bảo mật, CORS, rate limiting.

---

## 3. Hệ thống "Hội đồng Chuyên gia" (Multi-Agent System)
Sử dụng kiến trúc đa tác vụ thay vì bắt một con AI làm mọi việc. Chia thành các Agent độc lập:

1. 🛡️ **Security Agent:** Chuyên gia bảo mật. Chỉ tập trung quét lỗ hổng (SQL Injection, XSS, lộ API Keys, Auth bypass).
2. ⚡ **Performance Agent:** Chuyên gia tối ưu. Chỉ tập trung dò vòng lặp thừa, truy vấn N+1, tối ưu render Frontend.
3. 📏 **Convention Checker:** Giám thị quy chuẩn. Chỉ đối chiếu code với file `rules.md` của dự án xem có đặt tên sai, sai cấu trúc thư mục không.
4. ⚖️ **The Judge (Agent Tổng):** Đọc kết quả từ 3 Agent trên, tổng hợp, loại bỏ các cảnh báo trùng lặp và xuất báo cáo cuối cùng.

---

## 4. Quy trình Đánh giá Tự động (Evaluation Pipeline)
Luồng này có thể setup thông qua n8n, LangChain, hoặc GitHub Actions:

1. **Trigger:** Nhận request đánh giá (VD: Push code lên nhánh PR, gửi file zip vào hệ thống).
2. **Context Retrieval:** Xác định ID dự án -> Lôi file tài liệu, ruleset của dự án đó từ Vector DB hoặc storage.
3. **Chunking & Dispatch:** Cắt code thành các module nhỏ, gửi song song (parallel) cho Hội đồng Agent chấm điểm.
4. **Report Generation:** Agent Tổng xuất báo cáo dạng JSON hoặc Markdown với cấu trúc:
   * **Vấn đề (Issue)**
   * **Mức độ nghiêm trọng (Severity)**
   * **Giải thích nguyên nhân dựa trên luật của dự án**
   * **Đoạn code gợi ý sửa lỗi (Snippet fix)**

---

## 5. Bước Tiếp Theo (Action Items)
Để bắt đầu triển khai, hãy chọn một **"Chuột bạch" (POC - Proof of Concept)** nhỏ nhất:
- [ ] Chọn **1 hạng mục** để làm trước (Ví dụ: Chỉ đánh giá lỗi bảo mật của Backend API).
- [ ] Viết bộ `rules.md` cực chuẩn cho 1 project Backend đang có.
- [ ] Dựng luồng n8n đơn giản nhận file API -> nhồi rules -> GPT-4o chấm -> trả file Markdown.