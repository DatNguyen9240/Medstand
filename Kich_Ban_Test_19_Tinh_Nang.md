# 📋 BẢNG TRA CỨU & COPY-PASTE 19 TÍNH NĂNG UAT (DÀNH CHO QLBH013.MED)
*Tài khoản: **Mai Anh Tuấn** (Quản lý vùng Bắc) — Phiên bản UAT V38*

---

## 🔐 1. HỒ SƠ KIỂM THỬ UAT (UAT PROFILE)
* **Tài khoản test (Username):** `QLBH013.MED`
* **Vùng phụ trách:** Miền Bắc (Vùng 1)
* **TDV thuộc quyền:** Đoàn Văn Thế (`NAMDINHB.MED`)
* **Khách hàng mẫu:** Quầy Thuốc Thu Thủy (`HYA107` / `HPA515`)

---

## 🎯 2. DANH SÁCH 19 TÍNH NĂNG NGHIỆM THU CHI TIẾT (COPY-PASTE MATRIX)

| STT | Tính năng kiểm thử | Lệnh nhanh `@` | Câu chat mẫu để copy-paste 📝 | Kết quả kỳ vọng hiển thị từ AI 🏆 |
| :---: | :--- | :---: | :--- | :--- |
| **01** | Xem doanh số bán hàng | `@doanh_so` | `"Doanh số của tôi tháng này thế nào?"` | Hiển thị bảng doanh số toàn vùng Miền Bắc. |
| **02** | Bảo mật phân quyền (RLS) | `Tự động` | `"Xem doanh số vùng Miền Nam của QLMN2"` | AI phát hiện và từ chối hiển thị dữ liệu ngoài vùng Bắc. |
| **03** | Tra cứu đơn hàng | `@don_hang` | `"Kiểm tra đơn hàng gần đây của vùng tôi"` | Liệt kê danh sách các đơn hàng đã tạo của vùng Bắc. |
| **04** | Tạo đơn hàng qua chat | `@lap_don_hang` | `"Lên đơn 5 hộp Antrinano cho Quầy Thuốc Thu Thủy"` | AI nhận diện sản phẩm, số lượng và mở form đặt đơn. |
| **05** | Gợi ý đặt hàng tự động | `@goi_y_don_hang` | `"Gợi ý đơn hàng cho Quầy Thuốc Thu Thủy"` | Đề xuất các sản phẩm sắp hết hàng dựa trên lịch sử mua. |
| **06** | Gợi ý bán kèm (Upsell) | `@upsell_goi_y` | `"Gợi ý bán kèm cho Quầy Thuốc Thu Thủy"` | Đề xuất sản phẩm mua cùng để khách đạt mốc khuyến mãi. |
| **07** | Tra cứu thông tin thuốc | `@tra_cuu_san_pham` | `"Thông tin chi tiết sản phẩm Argelomag"` | Hiển thị công dụng, thành phần, cách dùng và giá thuốc. |
| **08** | Tổng công nợ khu vực | `@cong_no_khach_hang` | `"Tổng công nợ vùng tôi tháng này"` | Bảng tổng nợ của các nhà thuốc trong vùng từ nhiều đến ít. |
| **09** | Chi tiết công nợ khách | `@cong_no_chi_tiet` | `"Chi tiết công nợ của Quầy Thuốc Thu Thủy"` | Bảng kê chi tiết các hóa đơn quá hạn/chưa trả của khách. |
| **10** | Tra cứu hoá đơn lịch sử | `@hoa_don` | `"Tìm hóa đơn của Quầy Thuốc Thu Thủy"` | Trả về danh sách các hóa đơn bán hàng lịch sử của khách. |
| **11** | Điểm tích luỹ khách hàng | `@tich_luy` | `"Xem điểm tích lũy của Quầy Thuốc Thu Thủy"` | Trả về hạng thành viên, điểm tích lũy và quà tặng đạt được. |
| **12** | Tuyến bán hàng hàng ngày | `@tuyen_ban_hang` | `"Tuyến bán hàng của vùng tôi hôm nay"` | Lịch trình và danh sách nhà thuốc các TDV cần viếng thăm. |
| **13** | Gợi ý theo triệu chứng | `@goi_y_don_thuoc` | `"Mất ngủ, mệt mỏi thì uống thuốc gì?"` | Gợi ý phác đồ điều trị và các sản phẩm của công ty. |
| **14** | Đề xuất khuyến mãi | `@de_xuat_khuyen_mai` | `"Khuyến mãi mới nhất đang chạy là gì?"` | Liệt kê các chương trình chiết khấu, combo ưu đãi hiện tại. |
| **15** | Sản phẩm trọng tâm tháng | `@san_pham_trong_tam` | `"Các sản phẩm trọng tâm tháng này là gì?"` | Danh sách các SKU chiến lược đang được công ty đẩy mạnh. |
| **16** | Tra cứu danh mục sản phẩm | `@danh_muc` | `"Xem danh mục phân loại sản phẩm công ty"` | Phân nhóm dược phẩm hoạt động trên toàn hệ thống. |
| **17** | Chấm điểm tín nhiệm RFM-C | `@cham_diem_k_h` | `"Chấm điểm tín nhiệm nhà thuốc Quầy Thuốc Thu Thủy"` | Trả về điểm số uy tín nợ (thang 100) và lời khuyên cho nợ. |
| **18** | Kiểm tra tồn kho thực tế | `@danh_sach_ton_kho` | `"Kiểm tra tồn kho sản phẩm Antrinano"` | Số lượng tồn kho khả dụng tại các kho của vùng Miền Bắc. |
| **19** | Khảo sát chăm sóc khách | `@danh_sach_cau_hoi_khao_sat` | `"Bắt đầu bài khảo sát cho Quầy Thuốc Thu Thủy"` | Bắt đầu bộ câu hỏi đánh giá mức độ hài lòng của khách. |

---

## 💡 3. MẸO QUAN TRỌNG KHI NGHIỆM THU
1. **Menu lệnh nhanh `@`:** Bạn chỉ cần gõ ký tự `@` trên ô nhập chat của Chatbot UI, một danh sách lệnh nhanh tương ứng sẽ tự động hiển thị để bạn lựa chọn nhanh mà không cần gõ chữ.
2. **Tìm kiếm thông minh:** Chatbot hỗ trợ xử lý ngôn ngữ tự nhiên không dấu nên bạn có thể gõ `"quy thuoc thu thuy"`, `"antrinano"` thoải mái, AI vẫn tự khớp chính xác dữ liệu trong DB.
3. **Phân quyền bảo mật (RLS):** Do hệ thống đã được vá lỗi RLS trong bộ phân giải tên, khi bạn gõ bất kỳ yêu cầu nào liên quan đến *"Thu Thủy"*, hệ thống sẽ tự chọn đúng mã Miền Bắc (`HYA107` / `HPA515`) thay vì bị nhầm sang các chi nhánh khác!
