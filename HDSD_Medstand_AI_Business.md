# CẨM NANG BỎ TÚI TRỢ LÝ AI MEDSTAND (POCKET REFERENCE GUIDE)
*Bản Hướng Dẫn Tối Giản & Đầy Đủ 19 Tính Năng Nghiệm Thu (UAT) — Phiên bản V38*

---

## 1. HƯỚNG DẪN BẮT ĐẦU NHANH
1. **Truy cập:** Mở trình duyệt Web (điện thoại/máy tính) → **[medtest.bms79.com](https://medtest.bms79.com)**
2. **Đăng nhập:** Nhập tài khoản kinh doanh (QL hoặc TDV) của bạn.
3. **Mở Chat:** Nhấp **Bong bóng chat** màu xanh ở góc phải dưới màn hình.

---

## 2. DANH SÁCH 7 CẶP TÀI KHOẢN KIỂM THỬ UAT (CHUẨN VÙNG 100%)
*Để tránh lỗi bảo mật chéo chi nhánh (RLS), vui lòng dùng chính xác mã khách hàng đã phân quyền theo từng cặp tài khoản dưới đây:*

| Chi Nhánh | Cặp | Quản lý (Manager) | Tài khoản QL | Trình dược viên (TDV) | Tài khoản TDV | Khách hàng UAT của tuyến | Mã KH |
| :---: | :---: | :--- | :---: | :--- | :---: | :--- | :---: |
| **Bắc** | 1 | Mai Anh Tuấn | `QLBH013.MED` | Đoàn Văn Thế | `NAMDINHB.MED` | Quầy Thuốc Thu Thủy | `HPA515` |
| **Bắc** | 2 | Trần Văn Hướng | `QLBH016.MED` | Nguyễn Công Đức | `BACNINHA.MED` | Quầy Thuốc Thu Thủy | `BNB161` |
| **Trung** | 3 | Nguyễn Thế Anh | `QLBH005.MED` | Lê Thị Hiền | `HUEB.MED` | Nhà Thuốc Lê Hùng 2 | `HUEB111` |
| **Trung** | 4 | Nguyễn Văn Việt Anh| `QLBH010.MED` | Lê Thị Lệ | `DANANGA.MED` | Nhà Thuốc Lê Hùng 2 | `QANA371` |
| **Nam** | 5 | Trần Văn Luân | `QLMN2` | Nguyễn Thị Thu Thảo | `CanThoA` | Nhà Thuốc Lê Hùng 2 | `DL012` |
| **Nam** | 6 | Nguyễn Văn Thái | `QLMD1` | Nguyễn Quốc Tuấn | `BinhPhuocA` | Nhà Thuốc Lê Hùng 2 | `SGNB0018` |
| **Nam** | 7 | Ngô Đức Hùng | `QLBH024.MED` | Nguyễn Quốc Tuấn | `BinhPhuocA` | Nhà Thuốc Lê Hùng 2 | `SGNB0018` |

---

## 3. BẢNG TRA CỨU ĐẦY ĐỦ 19 TÍNH NĂNG NGHIỆM THU (UAT MATRIX)
*Khi gõ phím tắt `@` trên Chatbot UI, hệ thống sẽ tự động hiển thị form chọn nhanh tương ứng.*

| STT | Tính năng | Lệnh @ nhanh | Câu chat mẫu thực tế | Kỳ vọng hiển thị & Bảo mật |
| :---: | :--- | :---: | :--- | :--- |
| **01** | Xem doanh số bán hàng | `@doanh_so` | `"Doanh số của tôi tháng này thế nào?"` | QL xem toàn vùng; TDV chỉ xem cá nhân. |
| **02** | Bảo mật chéo vùng (RLS) | `Tự động` | `"Xem doanh số vùng khác?"` | AI tự động từ chối hiển thị dữ liệu ngoài vùng. |
| **03** | Tra cứu đơn hàng | `@don_hang` | `"Kiểm tra đơn hàng gần đây của tôi"` | Liệt kê danh sách đơn hàng đã lên trong vùng. |
| **04** | Tạo đơn hàng qua chat | `@lap_don_hang`| `"Lên đơn 5 hộp Antrinano cho [Tên Khách]"`| Mở màn hình xác nhận giỏ hàng để đặt đơn. |
| **05** | Gợi ý đặt hàng cho khách| `@goi_y_don_hang`| `"Gợi ý đơn hàng cho [Tên Khách/Mã KH]"`| Gợi ý SKU sắp hết hàng dựa trên lịch sử mua. |
| **06** | Gợi ý bán kèm (Upsell) | `@upsell_goi_y` | `"Gợi ý bán kèm cho [Tên Khách/Mã KH]"` | Đề xuất sản phẩm mua cùng để đạt mốc thưởng. |
| **07** | Tra cứu thông tin thuốc | `@tra_cuu_san_pham`| `"Thông tin chi tiết sản phẩm Argelomag"` | Xem công dụng, thành phần, cách dùng, giá bán. |
| **08** | Tổng công nợ khu vực | `@cong_no_khach_hang`| `"Tổng công nợ vùng tôi tháng này"` | Bảng tổng nợ toàn vùng từ nhiều đến ít (Cho QL). |
| **09** | Chi tiết công nợ khách | `@cong_no_chi_tiet`| `"Chi tiết công nợ của [Tên Khách/Mã KH]"`| Tra cứu chi tiết từng hóa đơn chưa thanh toán. |
| **10** | Tra cứu hoá đơn bán hàng | `@hoa_don` | `"Tìm hóa đơn của [Tên Khách/Mã KH]"` | Trả về thông tin hóa đơn bán hàng trong vùng. |
| **11** | Điểm tích luỹ khách hàng | `@tich_luy` | `"Xem điểm tích lũy của [Tên Khách/Mã KH]"`| Xem số điểm tích lũy và quà tặng đạt được. |
| **12** | Tuyến bán hàng hàng ngày | `@tuyen_ban_hang` | `"Hôm nay tôi cần đi thăm những nhà thuốc nào?"`| Lịch trình và danh sách nhà thuốc cần viếng thăm. |
| **13** | Gợi ý thuốc triệu chứng | `@goi_y_don_thuoc` | `"Mất ngủ, mệt mỏi thì uống thuốc gì?"` | Phác đồ điều trị và sản phẩm bổ trợ khuyên dùng. |
| **14** | Đề xuất khuyến mãi | `@de_xuat_khuyen_mai`| `"Khuyến mãi mới nhất đang chạy là gì?"` | Các chương trình chiết khấu, combo ưu đãi. |
| **15** | Sản phẩm trọng tâm tháng | `@san_pham_trong_tam`| `"Các sản phẩm trọng tâm tháng này là gì?"` | SKU mục tiêu được BGĐ ưu tiên thúc đẩy. |
| **16** | Tra cứu danh mục dược phẩm| `@danh_muc` | `"Xem danh mục phân loại sản phẩm công ty"` | Phân nhóm hàng hóa đang bán trên toàn hệ thống. |
| **17** | Chấm điểm tín nhiệm | `@cham_diem_k_h` | `"Chấm điểm tín nhiệm nhà thuốc [Tên/Mã KH]"`| Phân hạng khách hàng RFM-C động theo uy tín nợ. |
| **18** | Kiểm tra tồn kho thực tế | `@danh_sach_ton_kho`| `"Kiểm tra tồn kho sản phẩm Antrinano"` | Số lượng tồn kho thực tế ở các kho phân quyền. |
| **19** | Khảo sát khách hàng | `@danh_sach_cau_hoi_khao_sat`| `"Bắt đầu bài khảo sát cho [Tên/Mã KH]"` | Bắt đầu bài khảo sát độ hài lòng của khách. |

---

## 4. LUỒNG NGHIỆP VỤ HÀNG NGÀY (DAILY FLOW)
* **Sáng (Chuẩn bị):** Gõ `@doanh_so` xem KPI $\rightarrow$ Gõ `@tuyen_ban_hang` lấy lịch trình viếng thăm hôm nay.
* **Tại Nhà Thuốc (Bán hàng):** Gõ `@tra_cuu_san_pham` xem thông tin thuốc $\rightarrow$ Gõ `@goi_y_don_hang` xem khách sắp hết thuốc gì $\rightarrow$ Gõ `@upsell_goi_y` để bán thêm combo $\rightarrow$ Nhắn `@lap_don_hang` lên đơn siêu tốc.

---

## 5. LƯU Ý BẢO MẬT & HỖ TRỢ
* **Bảo mật RLS:** Tài khoản chỉ xem được dữ liệu trong vùng phụ trách. Tự động chặn xem chéo vùng.
* **Tìm kiếm thông minh:** Nhập không dấu hoặc viết tắt (ví dụ: `thu thuy`, `le hung 2`), AI tự động khớp chính xác thực thể.
