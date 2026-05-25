# ⚡ CẨM NANG BỎ TÚI TRỢ LÝ AI MEDSTAND (POCKET REFERENCE GUIDE)
*Bản Hướng Dẫn Tối Giản & Đầy Đủ 19 Tính Năng Nghiệm Thu (UAT) cho Doanh Nghiệp — Phiên bản V38*

---

## 🚀 1. HƯỚNG DẪN ĐĂNG NHẬP & BẮT ĐẦU
1. **Truy cập:** Mở trình duyệt (điện thoại/máy tính) → **[medtest.bms79.com](https://medtest.bms79.com)**
2. **Đăng nhập:** Nhập tài khoản kinh doanh của bạn.
3. **Mở Chat:** Nhấp **Bong bóng chat** màu xanh ở góc phải dưới màn hình.

---

## 👥 2. DANH SÁCH 7 CẶP TÀI KHOẢN KIỂM THỬ UAT (MẪU)

| Vùng | STT | Quản lý (Manager) | Tài khoản QL | Trình dược viên (TDV/Sale) | Tài khoản TDV | Khách hàng mẫu (Customer) |
| :---: | :---: | :--- | :---: | :--- | :---: | :--- |
| **Bắc** | 1 | Mai Anh Tuấn | `QLBH013.MED` | Đoàn Văn Thế | `NAMDINHB.MED` | Quầy Thuốc Thu Thủy (`HYA107`) |
| **Bắc** | 2 | Trần Văn Hướng | `QLBH016.MED` | Nguyễn Công Đức | `BACNINHA.MED` | Quầy Thuốc Thu Thủy (`HYA107`) |
| **Trung** | 3 | Nguyễn Thế Anh | `QLBH005.MED` | Lê Thị Hiền | `HUEB.MED` | Nhà Thuốc Lê Hùng 2 (`DNA014`) |
| **Trung** | 4 | Nguyễn Văn Việt Anh| `QLBH010.MED` | Lê Thị Lệ | `DANANGA.MED` | Nhà Thuốc Lê Hùng 2 (`DNA014`) |
| **Nam** | 5 | Trần Văn Luân | `QLMN2` | Nguyễn Thị Thu Thảo | `CanThoA` | Nhà Thuốc Lê Hùng 2 (`DNA014`) |
| **Nam** | 6 | Nguyễn Văn Thái | `QLMD1` | Nguyễn Quốc Tuấn | `BinhPhuocA` | Nhà Thuốc Lê Hùng 2 (`DNA014`) |
| **Nam** | 7 | Ngô Đức Hùng | `QLBH024.MED` | Nguyễn Quốc Tuấn | `BinhPhuocA` | Nhà Thuốc Lê Hùng 2 (`DNA014`) |

---

## 💡 3. BẢNG TRA CỨU ĐẦY ĐỦ 19 TÍNH NĂNG NGHIỆM THU (UAT MATRIX)
*Khi gõ phím tắt `@` trên Chatbot UI, hệ thống sẽ tự động hiển thị form nhập liệu tương ứng.*

| STT | Tính năng | Lệnh @ nhanh | Câu chat mẫu thực tế | Kỳ vọng hiển thị & Bảo mật |
| :---: | :--- | :---: | :--- | :--- |
| **01** | Xem doanh số bán hàng | `@doanh_so` | `"Doanh số cá nhân tháng này của tôi?"` | Quản lý xem toàn vùng; TDV chỉ xem cá nhân mình. |
| **02** | Phân quyền bảo mật RLS | `Tự động` | `"Doanh số miền Bắc thế nào?"` (khi đang ở vùng Nam) | AI từ chối hiển thị dữ liệu ngoài vùng phụ trách. |
| **03** | Tra cứu đơn hàng | `@don_hang` | `"Kiểm tra đơn hàng gần đây của tôi"` | Liệt kê danh sách đơn hàng đã lên trong vùng. |
| **04** | Tạo đơn hàng qua chat | `@lap_don_hang`| `"Lên đơn 5 hộp Antrinano cho Thu Thủy"` | Mở màn hình xác nhận giỏ hàng nhanh để đặt đơn. |
| **05** | Gợi ý đặt hàng cho khách| `@goi_y_don_hang`| `"Gợi ý đơn hàng cho Quầy Thuốc Thu Thủy"` | Gợi ý các SKU sắp hết hàng dựa trên lịch sử mua. |
| **06** | Gợi ý bán kèm (Upsell) | `@upsell_goi_y` | `"Có sản phẩm nào bán kèm Antrinano không?"` | Đề xuất sản phẩm mua cùng để gia tăng trị giá đơn. |
| **07** | Tra cứu thông tin thuốc | `@tra_cuu_san_pham`| `"Thông tin chi tiết sản phẩm Argelomag"` | Xem công dụng, thành phần, hướng dẫn sử dụng. |
| **08** | Tổng công nợ khu vực | `@cong_no_khach_hang`| `"Tổng công nợ vùng tôi tháng 5"` | Bảng tổng nợ toàn vùng sắp xếp từ nhiều đến ít (Cho QL). |
| **09** | Chi tiết công nợ khách | `@cong_no_chi_tiet`| `"Nhà Thuốc Lê Hùng 2 còn nợ hóa đơn nào?"` | Tra cứu chi tiết từng hóa đơn nợ chưa trả (Cho QL). |
| **10** | Tra cứu hoá đơn bán hàng | `@hoa_don` | `"Tìm hóa đơn gần đây của Quầy Thuốc Thu Thủy"` | Trả về thông tin hóa đơn bán hàng xuất trong vùng. |
| **11** | Điểm tích luỹ khách hàng | `@tich_luy` | `"Xem điểm tích lũy của Quầy Thuốc Thu Thủy"` | Xem số điểm tích lũy và quà tặng của khách hàng. |
| **12** | Tuyến bán hàng hàng ngày | `@tuyen_ban_hang` | `"Hôm nay tôi cần đi thăm những nhà thuốc nào?"`| Lịch trình và danh sách nhà thuốc cần viếng thăm hôm nay. |
| **13** | Gợi ý thuốc triệu chứng | `@goi_y_don_thuoc` | `"Mất ngủ, mệt mỏi thì uống thuốc gì?"` | Phác đồ điều trị và sản phẩm bổ trợ khuyên dùng. |
| **14** | Đề xuất khuyến mãi | `@de_xuat_khuyen_mai`| `"Khuyến mãi mới nhất đang chạy là gì?"` | Các chương trình chiết khấu, combo ưu đãi hiện hành. |
| **15** | Sản phẩm trọng tâm tháng | `@san_pham_trong_tam`| `"Các sản phẩm trọng tâm tháng này là gì?"` | SKU mục tiêu được Ban Giám Đốc ưu tiên thúc đẩy. |
| **16** | Tra cứu danh mục dược phẩm| `@danh_muc` | `"Xem danh mục phân loại sản phẩm công ty"` | Phân nhóm hàng hóa đang bán trên toàn hệ thống. |
| **17** | Chấm điểm tín nhiệm | `@cham_diem_k_h` | `"Chấm điểm tín nhiệm nhà thuốc Thu Thủy"` | Phân hạng khách hàng RFM-C động theo uy tín trả nợ. |
| **18** | Kiểm tra tồn kho thực tế | `@danh_sach_ton_kho`| `"Kiểm tra tồn kho sản phẩm Antrinano"` | Số lượng tồn kho thực tế ở các kho được phân quyền. |
| **19** | Khảo sát khách hàng | `@danh_sach_cau_hoi_khao_sat`| `"Bắt đầu bài khảo sát cho Quầy Thuốc Thu Thủy"`| Bắt đầu bài khảo sát độ hài lòng của khách (Cho Admin).|

---

## 🏃‍♂️ 4. LUỒNG NGHIỆP VỤ HÀNG NGÀY (SALES DAILY FLOW)
*   **🌅 Đầu giờ sáng (Chuẩn bị):** Nhấp `@doanh_so` xem tiến độ $\rightarrow$ Gõ `@tuyen_ban_hang` xem lịch trình viếng thăm $\rightarrow$ Nhắn `"Khách hàng nào sắp hết hàng cần đặt hôm nay?"`.
*   **🏪 Tại nhà thuốc (Chào hàng):** Gõ `@tra_cuu_san_pham` xem thông tin thuốc $\rightarrow$ Gõ `@goi_y_don_hang` xem khách sắp hết thuốc gì $\rightarrow$ Nhắn `@lap_don_hang` lên đơn siêu tốc $\rightarrow$ Nhắn `@upsell_goi_y` để bán thêm combo.

---

## ⚠️ 5. LƯU Ý BẢO MẬT & HỖ TRỢ
*   **Bảo mật:** Tài khoản chỉ xem được dữ liệu trong vùng phụ trách.
*   **Dò tìm thông minh:** Gõ viết tắt hoặc không dấu (ví dụ: `thu thuy`, `le hung 2`), AI tự động khớp chính xác danh mục.
*   **Sự cố:** Liên hệ trực tiếp bộ phận IT nội bộ qua hotline để được cấp lại mật khẩu trong 24 giờ.
