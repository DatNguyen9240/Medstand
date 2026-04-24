# CHIẾN LƯỢC TOÀN DIỆN: MEDSTAND SALES INTELLIGENCE SYSTEM
*(Bản nâng cấp 2.0 - Khung phân tích RFM-C)*

---

## 🧠 I. TƯ DUY CỐT LÕI: TRIẾT LÝ 70 - 20 - 10
Hệ thống không vận hành dựa trên sự "ảo thuật" của AI, mà dựa trên sự kỷ luật của dữ liệu:
- **70% SQL & Rule Engine (Khối óc tính toán):** Phần cứng. Xử lý tính toán thô, báo cáo, và các logic nghiệp vụ rõ ràng tuyệt đối.
- **20% Recommendation System / RFM-C (Khối não bộ phân tích):** Gợi ý hành động dựa trên hành vi thực tế của khách hàng.
- **10% GenAI Layer / Vision (Gương mặt giao tiếp):** Phần giao tiếp. Chuyển đổi dữ liệu khô khan thành ngôn ngữ tự nhiên và xử lý bóc tách hình ảnh toa thuốc.

---

## 📊 II. KHUNG PHÂN TÍCH RFM-C (THE DA FRAMEWORK)
Thay vì dùng các con số cảm tính (như "đạt 50tr là VIP"), hệ thống sử dụng framework **RFM-C** để định nghĩa giá trị khách hàng một cách khoa học và tự động co giãn theo thị trường:

| Chỉ số | Tên gọi | Ý nghĩa nghiệp vụ trong B2B Medstand |
| :--- | :--- | :--- |
| **R (Recency)** | Độ mới | Khách mua gần nhất là khi nào? (Càng gần càng dễ chốt đơn). |
| **F (Frequency)** | Tần suất | Trong 6 tháng qua khách đặt bao nhiêu đơn? |
| **M (Monetary)** | Giá trị | Tổng số tiền khách mang lại là bao nhiêu? |
| **C (Consumption)** | Tiêu thụ | Tốc độ "đẩy hàng" (bán ra) của nhà thuốc nhanh hay chậm? |

**Công thức tính điểm tổng hợp (Customer Score):**
`Score = (w1 * R_score) + (w2 * F_score) + (w3 * M_score) + (w4 * C_score)`
*(Trọng số `w` sẽ được CEO điều chỉnh linh hoạt tùy theo chiến lược kinh doanh từng thời kỳ: Tập trung xả hàng, đẩy doanh thu hay giữ chân khách).*

---

## ⚙️ III. QUY TRÌNH "BÊ TÔNG CỐT THÉP" DỮ LIỆU (DATA PIPELINE)
Để xử lý vấn đề Dữ liệu lạnh (Cold Start) và rủi ro chia cho 0, pipeline được thiết kế theo 5 bước chuẩn Enterprise:

1. **Aggregation (Gom cụm):** Gom nhóm dữ liệu Sales thành bảng Master khách hàng.
2. **Feature Engineering:** Tính toán các biến phụ trợ (VD: Số ngày từ đơn đầu tiên, chu kỳ mua trung bình).
3. **Normalization (Chuẩn hóa):** Sử dụng hàm SQL `NTILE(5)` hoặc `PERCENT_RANK()` để đưa mọi giá trị về thang điểm 1-100.
   - *Tư duy:* Khách mua 1 tỷ hay 100 triệu không quan trọng bằng việc họ nằm trong "Top 20% người mua nhiều nhất".
4. **Scoring & Segmentation:** Áp trọng số và phân cụm khách hàng (Nhóm A, B, C) dựa trên tỷ lệ phần trăm thống kê, thay vì hardcode một con số chết.
5. **Validation (Kiểm chứng):** Liên tục kiểm tra xem nhóm A có thực sự mang lại 80% lợi nhuận không. Nếu tỷ lệ lệch, hệ thống cảnh báo Data Analyst điều chỉnh trọng số.

---

## 🏗️ IV. KIẾN TRÚC HỆ THỐNG PHÂN TẦNG (SYSTEM ARCHITECTURE)
Hệ thống vận hành theo mô hình **Master - Worker** để đảm bảo hiệu suất:
- **Orchestration Layer (Router):** Khối điều phối đầu vào. Tiếp nhận câu hỏi -> Phân loại Intent (Hỏi doanh số? Hỏi tư vấn? Hay chụp ảnh?).
- **SQL Worker (The Core):** Thực thi các câu lệnh RFM-C đã được tối ưu hóa.
- **RAG Worker (Knowledge Base):** Tra cứu tài liệu sản phẩm, phác đồ điều trị khi Sale hỏi về triệu chứng.
- **Defensive Layer (Khiên chắn):** Cấy các hàm phòng thủ như `NULLIF()`, `COALESCE()` vào SQL để đảm bảo hệ thống không bao giờ Crash khi thiếu dữ liệu khách hàng mới.

---

## 🚀 V. LỘ TRÌNH TRIỂN KHAI THỰC CHIẾN (PRAGMATIC ROLLOUT)

### 🟢 Giai đoạn 1: Foundation (Tháng 1-2) - "Focus on SQL"
- Triển khai toàn bộ báo cáo Doanh số, Tồn kho đa điểm, Công nợ.
- Cảnh báo khách giảm mua (LastOrder > 45 ngày).
- **Mục tiêu:** Cung cấp thông tin "Sạch - Đúng - Đủ" để xây dựng niềm tin cho Sale.

### 🟡 Giai đoạn 2: Intelligence (Tháng 2-4) - "The RFM-C Engine"
- Kích hoạt bộ máy chấm điểm khách hàng tự động (chạy ngầm ban đêm).
- Gợi ý đơn hàng dựa trên chu kỳ tiêu thụ thực tế của điểm bán.
- **Mục tiêu:** Giúp Sale ra đòn quyết định: Ghé thăm đúng điểm, Bán đúng lúc, Up-sell đúng sản phẩm.

### 🔴 Giai đoạn 3: Advanced AI (Tháng 4-6) - "The Visionary"
- Triển khai Vision AI nhận diện toa thuốc (Module 8).
- Nâng cấp Chatbot thành Trợ lý tư vấn chuyên môn (RAG).
- Phân tích vòng quay tồn kho để tự động đề xuất chiến dịch Khuyến mại cho CEO.
- **Mục tiêu:** Mở khóa năng lực công nghệ và tối ưu hóa lợi nhuận ròng.

---

## 🎯 KẾT LUẬN CUỐI CÙNG
Medstand AI không phải là một công cụ hào nhoáng để trình diễn. Nó là một **Hệ thống Quản trị Bán hàng dựa trên Dữ liệu (Data-driven Sales System)**.
- **Logic SQL** là Xương sống.
- **Dữ liệu RFM-C** là Dòng máu.
- **Giao diện Chatbot/AI** là Gương mặt.

Khi triển khai đúng bản thiết kế này, hệ thống sẽ có năng lực tự tiến hóa: Dữ liệu càng nhiều, AI càng khôn, doanh số càng tăng và rủi ro vận hành bằng 0.
*"Chúng ta không đoán khách hàng muốn gì, chúng ta dùng dữ liệu để biết khách hàng cần gì."*
