# Tài liệu Medstand AI

**Cập nhật toàn diện:** `09/09/2026`

Thư mục này quản lý toàn bộ tài liệu chính thức, baseline kỹ thuật và tài liệu hướng dẫn vận hành của hệ thống Medstand AI.

---

## 1. Tài liệu lõi & Lộ trình phát triển

1. [Backlog phát triển Medstand AI](BACKLOG_TASK_PHAT_TRIEN_MEDSTAND_AI_2026-07-27.md)  
   Nguồn quản lý duy nhất toàn bộ danh sách task, phân loại ưu tiên P0/P1/P2/P3, trạng thái thực hiện (`DONE`/`TODO`/`READY_FOR_TEST`) và điều kiện nghiệm thu từng giai đoạn (Phase 0, 1, 2, 2.5, 3, 4, 5).

2. [Baseline kỹ thuật và UAT hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md)  
   Tổng hợp hiện trạng runtime, gate hoàn thành, phiên bản bundle frontend `11.144`, kết quả 203 ca kiểm thử UAT và danh mục script test read-only.

3. [Yêu cầu sửa đổi từ khách hàng](BackLogSuaTheoYCKhachHang.md)  
   Theo dõi các yêu cầu nghiệp vụ bổ sung trực tiếp từ ban giám đốc và khách hàng doanh nghiệp.

---

## 2. Kế hoạch Thử nghiệm & Kênh Tương tác

1. [Kế hoạch test 13 tài khoản](KE_HOACH_TEST_13_TAI_KHOAN.md)  
   Danh sách 13 tài khoản UAT phân quyền theo 3 miền Bắc/Trung/Nam, danh mục câu hỏi chuẩn theo vai trò Sale và Manager.

2. [Kênh Telegram Pilot 13 tài khoản](TELEGRAM_PILOT_13_TAI_KHOAN.md)  
   Hướng dẫn tự liên kết tài khoản qua mã OTP 6 số (`/link <code>`), cơ chế vé xác thực tạm thời (Ticket Auth) và sử dụng chatbot Medstand AI trên điện thoại di động.

---

## 3. Hướng dẫn Sử dụng & Bàn giao Khách hàng

1. [Hướng dẫn sử dụng cho doanh nghiệp](HUONG_DAN_SU_DUNG_MEDSTAND_AI_DOANH_NGHIEP.md)  
   Cẩm nang câu hỏi mẫu, tính năng tìm kiếm gần đúng thông minh (Selection Token), tra cứu doanh số, công nợ, tồn kho khả dụng và đặt hàng nháp.

2. [Gói tài liệu khách hàng](GOI_UAT_KHACH_HANG/)  
   Thư mục chứa các tài liệu định dạng Word (.docx) và HTML để gửi cho khách hàng nghiệm thu.

---

## 4. Quy tắc Quản trị Tài liệu

- **Không tạo file báo cáo lẻ tẻ:** Toàn bộ tiến độ và bằng chứng kiểm thử được gom trực tiếp vào `BACKLOG_TASK_PHAT_TRIEN_MEDSTAND_AI_2026-07-27.md` và `BASELINE_KY_THUAT_UAT_HIEN_HANH.md`.
- **Bằng chứng test máy đọc:** Lưu trữ dạng artifacts trong thư mục `reports/`.
- **Kiểm tra tính toàn vẹn:** Bắt buộc chạy `node scripts/verify_backlog_integrity.js` trước khi release để bảo đảm không mâu thuẫn giữa trạng thái và checkbox task.
