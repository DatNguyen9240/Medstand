# DANH SÁCH KIỂM TRA TOÀN DIỆN MEDSTAND AI (MASTER CHECKLIST)

Tài liệu này đóng vai trò như một bộ "Checklist" chuẩn mực để QC (Kiểm thử chất lượng) hệ thống hiện tại, đồng thời đánh dấu các hạng mục cần nâng cấp theo bản thiết kế Blueprint 2.0 (Hệ sinh thái Sales Intelligence).

---

## ✅ PHẦN 1: KIỂM THỬ HẠ TẦNG VÀ VẬN HÀNH (INFRASTRUCTURE)
*Phần này đảm bảo hệ thống có thể "sống sót" độc lập trên bất kỳ server nào.*

- [ ] **Khởi động 1-click:** Chạy `start_n8n.bat` trên một máy trắng (chưa từng cài Node.js/C++). Xác nhận script tự tải và cài đặt thành công C++ Redistributable.
- [ ] **Khởi chạy ngầm (PM2):** Kiểm tra lệnh `pm2 logs` hoặc bảng điều khiển PM2. Xác nhận 5 tiến trình (N8N, Redis, RedisProxy, Qdrant, CORSProxy) đều ở trạng thái `online`.
- [ ] **Kênh kết nối bảo mật:** Cloudflare Tunnel sinh ra link `https://...` thành công và tự động ghi đè chuẩn xác vào biến môi trường `env.js`.
- [ ] **Đóng gói bàn giao:** Chạy script `Tao_File_Gui_Khach.bat`. Xác nhận file Zip sinh ra rất nhẹ (đã bỏ qua node_modules, .git) nhưng KHÔNG bỏ sót thư mục `/qdrant` và lõi N8N.
- [ ] **Dọn dẹp hệ thống:** Chạy `stop_n8n.bat`. Xác nhận tất cả tiến trình Node.js và Qdrant bị kill hoàn toàn, không bị treo ngầm chiếm RAM.
- [ ] **Phản hồi từ Khách hàng (UAT):** Gửi bộ cài Zip nghiệm thu cho 1-2 điểm bán thực tế (hoặc cho team nội bộ đóng vai khách hàng). Ghi nhận trải nghiệm cài đặt 1-click thực tế có gặp rào cản nào không (VD: Bị Windows Defender chặn báo nhầm virus, hoặc mạng nội bộ khách hàng chặn port).

---

## ✅ PHẦN 2: GIAO DIỆN & LUỒNG ĐIỀU PHỐI (UI/UX & ROUTING)
*Đảm bảo phần "10% GenAI" hoạt động mượt mà, đúng vai trò thông dịch viên.*

- [ ] **Giao diện sáng/tối (Light/Dark Mode):** Bật/tắt chế độ Night Mode. Xác nhận màu nền các ô input và ô chat đổi màu chuẩn, viền input khi Focus không bị gắt.
- [ ] **Tự động kích hoạt nạp RAG:** Tải lên 1 file (PDF/Excel) không gõ chữ gì thêm -> Gửi. Xác nhận Bot tự động kích hoạt lệnh ngầm `/nạp` thay vì báo lỗi.
- [ ] **Fallback từ SQL sang RAG:** Hỏi một câu không có trong Data SQL (Ví dụ: "Thuốc abcxyz"). Xác nhận Bot tìm SQL báo "Không có dữ liệu" -> Tự động chuyển qua quét RAG.
- [ ] **Hỏi tài liệu ngoài lề (Casual Chat):** Gõ "Xin chào" hoặc "Cách dùng phần mềm". Xác nhận Bot nhận diện `ASK_CLARIFICATION` và điều hướng hỏi RAG.
- [ ] **Trải nghiệm UI Form:** Gọi thử API có Form nhập liệu. Khai báo qua UI Form, xác nhận thông tin được Insert xuống CSDL thành công.

---

## ✅ PHẦN 3: KIỂM THỬ DỮ LIỆU & LẬP TRÌNH PHÒNG THỦ (SQL CORE)
*Kiểm tra tính chính xác tuyệt đối của dữ liệu và khả năng "Sống sót" khi thiếu Data (Cold Start).*

- [ ] **Doanh số / Báo cáo:** Check chéo con số tổng trên màn hình Chatbot so với bảng dữ liệu gốc trong CSDL SQL.
- [ ] **Công nợ chi tiết:** Xác nhận giao diện làm nổi bật các hóa đơn quá hạn.
- [ ] **Tồn kho đa điểm:** Truy vấn mã hàng A. Xác nhận Bot hiển thị chính xác số tồn tại Kho Tổng, DL02, DL03.
- [ ] **Lập trình phòng thủ (Defensive SQL):** Truy vấn một "Khách hàng mới tinh" chưa từng có lịch sử mua hàng. Xác nhận Bot không Crash (Divide by Zero) mà trả lời khéo léo kiểu: *"Đang thu thập thêm dữ liệu"*.
- [ ] **Hệ thống Khảo sát:** Bot phỏng vấn -> Sale nhập đáp án -> Kiểm tra SQL xem đáp án đã được Insert chính xác.

---

## 🚀 PHẦN 4: ACTION CHECKLIST (NÂNG CẤP BLUEPRINT 2.0 & RFM-C)
*Danh sách các hạng mục cốt lõi cần Build tiếp theo.*

**Phase 2: Tối ưu Bộ máy RFM-C (Recommendation System)**
- [x] **Xây dựng Data Pipeline (RFM-C):** ✅ XONG — Viết đầy đủ 4 bước Aggregation → Feature Engineering → Normalization → Scoring trong `Module 3 - API_ChamDiemKH_AI.sql`.
- [x] **Chuẩn hóa điểm số:** ✅ XONG — Dùng `PERCENT_RANK()` thay `NTILE()` để linh hoạt hơn. Điểm tự co giãn theo thị trường thực tế.
- [x] **Cập nhật hàm Chấm điểm (Module 3):** ✅ XONG — Bỏ hoàn toàn Hardcode `50tr/30tr`. Nhóm A = Top 20%, B = Top 50% theo `PERCENTILE_CONT`. CEO tùy chỉnh trọng số `@W_Recency`, `@W_Frequency`, `@W_Monetary`, `@W_Consumption` qua tham số.
- [x] **Cập nhật Gợi ý đơn hàng (Module 1):** ✅ ĐÃ CÓ SẴN — File `Module 1 - API_GoiYDonHang_AI.sql` đã dùng `DATEDIFF` + Chu kỳ động + `NULLIF` phòng thủ. Không cần sửa thêm.
- [x] **Cơ chế Fallback Cộng đồng:** ✅ ĐÃ CÓ SẴN — Khi `@MaKhachHang = ''`, Module 1 tự động trả về Top SP bán chạy nhất toàn chi nhánh làm Fallback.
- [ ] *(Faker Script: Tạm bỏ qua - sẽ phối hợp với team BE sau)*

**Phase 3: The Visionary (Advanced AI)**
- [ ] **Tối ưu Module 6:** Viết thuật toán phân tích "Vòng quay hàng tồn kho" để AI mạnh dạn đề xuất chạy Combo/Xả hàng cho CEO.
- [ ] **Thiết kế Vision AI trên N8N:** Xử lý file ảnh đầu vào, bóc tách OCR tên thuốc.
- [ ] **Viết Procedure `API_GoiYDonThuoc_AI`:** Nhận text OCR, dùng thuật toán Similarity tìm mã thuốc Medstand tương đương để bán chéo/thay thế.

---

## 🛡️ PHẦN 5: HẠ TẦNG ENTERPRISE (TỪ 9.5 LÊN 10 ĐIỂM)
*Bổ sung các tiêu chuẩn bảo vệ hệ thống cấp doanh nghiệp (Resilience, Memory & Compliance).*

- [x] **Stateful Memory (Bộ nhớ hội thoại):** ✅ CODE XONG — File `n8n-system/stateful_memory.js` đã viết xong Block A (đọc context) và Block B (ghi context). **Cần sếp:** Import vào N8N workflow dưới dạng Code Node + kết nối với Redis GET/SET Node để kích hoạt.
- [ ] **Circuit Breaker & Retry (Tự phục hồi):** ⚠️ CẦN SẾP — Cấu hình Error handling + Retry trong từng N8N Workflow Node. Em có thể hướng dẫn từng bước hoặc sếp mở workflow lên cho em xem cấu trúc.
- [ ] **Event-driven Consistency (Đồng bộ Tồn kho Real-time):** ⚠️ CẦN SẾP — Cần truy cập SQL Server thật để tạo Trigger trên bảng `AR_InvoiceTbl`. Em đã viết sẵn logic, chỉ cần sếp chạy lên server.
- [x] **Audit Log (Nhật ký nghiệp vụ):** ✅ CODE XONG — File `sql/System - AI_AuditLog.sql` đã tạo xong: Bảng `AI_AuditLog`, Procedure `AI_WriteAuditLog` (ghi log), `API_AuditLog_AI` (tra cứu). **Cần sếp:** Chạy file SQL này lên server + thêm 1 dòng `EXEC AI_WriteAuditLog` vào đầu mỗi API nghiệp vụ nhạy cảm.
