# Báo cáo đánh giá & Phân tích kỹ thuật 7 lỗi chatbot Medstand

**Ngày lập:** 17/07/2026  
**Chế độ:** REVIEW & ASSESSMENT  
**Phạm vi:** Source FE (HTML/JS), n8n workflow, SQL local procedures, metadata và kịch bản UAT.  
**Mục tiêu:** Tổng hợp triệu chứng, phân tích nguyên nhân gốc dựa trên mã nguồn, và xác định phương án khắc phục an toàn cho 7 lỗi chatbot.

---

## 1. Tổng hợp & Phân loại lỗi (Assessment Matrix)

| Mã lỗi | Mô tả triệu chứng | Lớp lỗi | Ưu tiên | Trạng thái xác minh |
|---|---|---|---|---|
| **CHAT-20260717-01** | Tra cứu sản phẩm hiển thị hai khối kết quả lặp, lần 2 tự động trả về 50 dòng rỗng. | FE/n8n/SQL | P1 | `PARTIAL` (Thiếu guard chặn rỗng ở n8n/FE) |
| **CHAT-20260717-02** | Nút chuyển theme sáng/tối trong chatbot bấm được nhưng không thay đổi màu giao diện. | FE/Router/Bundle | P1 | `CONFIRMED_BY_SOURCE` (Bị double-toggle do trùng handler) |
| **CHAT-20260717-03** | Tra cứu chi tiết hóa đơn báo lỗi thiếu `DocumentID`, không có màn hình chọn/tìm hóa đơn. | FE/UX | P2 | `CONFIRMED_BY_SOURCE` (Thiếu Picker trên UI - backend đúng) |
| **CHAT-20260717-04** | Danh sách thông báo quá dài hiển thị thô trong chatbot, có hiện tượng trùng bản ghi. | FE/SQL/Data | P2 | `CONFIRMED_BY_SOURCE` (UX chưa tối ưu trình bày bảng dài) |
| **CHAT-20260717-05** | Menu chấm điểm khách hàng hiển thị các label mang tính kỹ thuật thay vì tên nghiệp vụ. | FE/Metadata/Scope | P2 | `PARTIAL` (Metadata SQL chứa nhãn hệ thống chưa ẩn) |
| **CHAT-20260717-06** | Chi tiết đề xuất khuyến mại hiển thị dạng grid thô, lãng phí không gian và thiếu nút hành động. | FE/Renderer | P2 | `PARTIAL` (Thiếu tối ưu layout rỗng/nhãn) |
| **CHAT-20260717-07** | Gợi ý đơn hàng trả kết quả rỗng chung chung; tra cứu sản phẩm hiển thị nhãn triệu chứng. | Data/Mapping | P1 | `PARTIAL` (Sai lệch mapping API triệu chứng/sản phẩm) |

---

## 2. Bằng chứng mã nguồn (Source Code Analysis)

Dựa vào việc kiểm tra trực tiếp mã nguồn của dự án:
- **Lỗi Theme (CHAT-20260717-02):**
  * Trong [chatbot.html](file:///c:/Users/Legion/Desktop/AI%20Nh%C3%A0%20Thu%E1%BB%91c/Medstand/chatbot-widget/template/chatbot.html#L18) có inline handler `onclick="window.ChatbotPage.toggleTheme()"`.
  * Trong [chatbot.js](file:///c:/Users/Legion/Desktop/AI%20Nh%C3%A0%20Thu%E1%BB%91c/Medstand/chatbot-widget/js/chatbot.js) lại tiếp tục gán sự kiện `$btnTheme.onclick = ...`. Trùng lặp này khiến sự kiện bị kích hoạt 2 lần liên tiếp (double-toggle), triệt tiêu lẫn nhau.
- **Thiếu guard cho tìm kiếm sản phẩm (CHAT-20260717-01):**
  * File [chatbot-api-engine.js](file:///c:/Users/Legion/Desktop/AI%20Nh%C3%A0%20Thu%E1%BB%91c/Medstand/chatbot-widget/js/chatbot-api-engine.js) chỉ có guard kiểm tra rỗng cho `@tim_san_pham_theo_trieu_chung`, thiếu kiểm tra rỗng cho `@tra_cuu_san_pham`.
- **Nhãn kỹ thuật (CHAT-20260717-05):**
  * Bảng metadata [Bootstrap_API_Metadata_Auto_AI.sql](file:///c:/Users/Legion/Desktop/AI%20Nh%C3%A0%20Thu%E1%BB%91c/Medstand/sql/Bootstrap_API_Metadata_Auto_AI.sql) định nghĩa `@DocumentID` là "Mã đơn hàng" và chưa ẩn các nhãn phân trang hệ thống như `Trang`, `Số dòng mỗi trang`.

---

## 3. Phân tích chi tiết & Hướng khắc phục

### CHAT-20260717-01 — Tra cứu sản phẩm lặp
- **Nguyên nhân:** FE và n8n chưa chặn tham số rỗng đối xứng khi gọi `@tra_cuu_san_pham`.
- **Giải pháp:** Bổ sung điều kiện kiểm tra từ khóa trước khi gửi API ở FE, và thêm luồng validation tham số ở n8n workflow. Nghiêm cấm sử dụng `DISTINCT` ở SQL để sửa lỗi lặp này.

### CHAT-20260717-02 — Theme double-toggle
- **Nguyên nhân:** Trùng lặp đăng ký sự kiện click đổi theme.
- **Giải pháp:** Chỉ dùng duy nhất một cách bind sự kiện (gỡ bỏ inline `onclick` trong HTML, giữ lại đăng ký trong `chatbot.js`), tiến hành đóng gói lại bằng `npm run build` và kiểm tra lại.

### CHAT-20260717-03 — Chi tiết hóa đơn
- **Nguyên nhân:** Backend yêu cầu `@DocumentID` là hoàn toàn đúng để tránh quét dữ liệu tràn lan. Khoảng trống nằm ở việc FE chưa tích hợp bộ chọn (picker).
- **Giải pháp:** Thêm picker/autocomplete cho phép tìm hóa đơn gần đây thông qua `@hoa_don` trước khi gọi xem chi tiết hóa đơn.

### CHAT-20260717-04 — Thông báo quá dài
- **Nguyên nhân:** Trình bày dạng bảng chưa phù hợp với hội thoại chatbot.
- **Giải pháp:** Chatbot chỉ render 3-5 thông báo mới nhất dưới dạng card ngắn gọn kèm liên kết "Xem toàn bộ" dẫn sang trang `#/notifications`.

### CHAT-20260717-05 — Menu chấm điểm khách hàng
- **Nguyên nhân:** Metadata trả về các trường lọc hệ thống.
- **Giải pháp:** Điều chỉnh stored procedure hoặc FE renderer để chỉ hiển thị các bộ lọc nghiệp vụ cần thiết (Vùng miền, Tên khách hàng). 

### CHAT-20260717-06 & 07 — Đề xuất khuyến mại & Mapping sản phẩm
- **Nguyên nhân:** UI hiển thị empty state chung chung cho gợi ý đơn hàng rỗng và nhầm lẫn mapping nút bấm với API code.
- **Giải pháp:** 
  * Ánh xạ đúng: Nút `Tra cứu sản phẩm` gọi `@tra_cuu_san_pham`; Nút `Tìm thuốc theo triệu chứng` gọi `@tim_san_pham_theo_trieu_chung`.
  * Tách biệt các trạng thái rỗng (Empty States): "Không có quyền truy cập", "Không có dữ liệu lịch sử mua" và "Lỗi kết nối".

---

## 4. Kế hoạch kiểm thử bắt buộc (Regression Matrix)

Sau khi sửa đổi, hệ thống bắt buộc phải đi qua các bước testcase:
1. **Phân quyền (Authorization Gates):**
   - Tài khoản **Guest**: Không được gọi API nghiệp vụ và router chặn redirect.
   - Tài khoản **TDV**: Chỉ được gọi dữ liệu thuộc phạm vi phụ trách (Scope), không được chỉnh sửa payload để lấy thông tin vùng khác.
2. **Kiểm thử giao diện (UI Regression):**
   - Test double-submit nút gửi tin nhắn.
   - Click chuyển theme liên tục 5 lần.
   - Kiểm tra hiển thị empty state và trạng thái loading của chatbot.
