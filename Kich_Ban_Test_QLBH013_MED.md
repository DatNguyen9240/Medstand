# 📋 KỊCH BẢN KIỂM THỬ UAT DÀNH CHO QUẢN LÝ MIỀN BẮC (QLBH013.MED)
*Tài khoản: **Mai Anh Tuấn** (Quản lý vùng Bắc) — Phiên bản UAT V38*

---

## 🔐 1. THÔNG TIN HỒ SƠ KIỂM THỬ (UAT PROFILE)
* **Họ và tên Quản lý:** Mai Anh Tuấn
* **Tài khoản Đăng nhập (Username):** `QLBH013.MED`
* **Vùng phụ trách:** Miền Bắc (Vùng 1)
* **Trình dược viên (TDV) thuộc quyền quản lý:** Đoàn Văn Thế (`NAMDINHB.MED`)
* **Khách hàng trọng điểm kiểm thử:** Quầy Thuốc Thu Thủy
  * **Mã khách hàng thực tế trong DB:** `HYA107` (hoặc `HPA515` tùy phiên bản ánh xạ)
  * **Tuyến viếng thăm:** Tuyến Nam Định (vùng quản lý của TDV Đoàn Văn Thế)

---

## 🎯 2. KỊCH BẢN KIỂM THỬ CHI TIẾT (8 KỊCH BẢN TRỌNG TÂM)

### 📊 Kịch bản 1: Kiểm thử Doanh số vùng (STT 01 - `@doanh_so`)
* **Mục đích:** Đảm bảo Quản lý xem được tổng doanh số của **toàn vùng Miền Bắc** thay vì chỉ một cá nhân.
* **Câu chat mẫu với Chatbot:**
  * *"Doanh số của tôi tháng này thế nào?"*
  * *"@doanh_so"*
* **Kỳ vọng hiển thị:**
  * AI hiển thị bảng tổng hợp doanh số bán hàng của toàn bộ khu vực Miền Bắc.
  * Phải thấy rõ doanh số phân bổ của TDV thuộc quyền: **Đoàn Văn Thế** và các TDV khác trong vùng.
* **Truy vấn SQL đối chứng:**
  ```sql
  USE [medtest];
  EXEC dbo.API_DoanhSo_AI @Username = 'QLBH013.MED', @LoaiBaoCao = 'NhanVien';
  ```

---

### 🛡️ Kịch bản 2: Kiểm thử Bảo mật phân quyền RLS (STT 02 - RLS Security)
* **Mục đích:** Đảm bảo Row Level Security hoạt động chuẩn xác, Quản lý vùng Bắc **không được phép** xem trộm dữ liệu vùng khác.
* **Câu chat mẫu với Chatbot:**
  * *"Xem doanh số vùng Miền Nam của QLMN2"*
  * *"Xem công nợ khách hàng khu vực Miền Trung"*
* **Kỳ vọng hiển thị:**
  * AI phát hiện hành vi xem chéo vùng trái phép.
  * AI đưa ra phản hồi từ chối lịch sự: *"Tài khoản của bạn chỉ được phân quyền quản lý khu vực Miền Bắc. Tôi không thể hiển thị dữ liệu của vùng khác."*
* **Truy vấn SQL đối chứng:**
  ```sql
  USE [medtest];
  -- Quản lý Miền Bắc thử truyền ID của vùng Miền Nam (QLMN2) -> Kết quả bắt buộc phải rỗng hoặc chỉ lọc ra vùng MB
  EXEC dbo.API_DoanhSo_AI @Username = 'QLBH013.MED', @ManagerID = 'QLMN2', @LoaiBaoCao = 'NhanVien';
  ```

---

### 📦 Kịch bản 3: Tra cứu đơn hàng toàn vùng (STT 03 - `@don_hang`)
* **Mục đích:** Quản lý theo dõi tiến độ lên đơn hàng của toàn bộ trình dược viên dưới quyền trong vùng.
* **Câu chat mẫu với Chatbot:**
  * *"Kiểm tra các đơn hàng gần đây của vùng tôi"*
  * *"@don_hang"*
* **Kỳ vọng hiển thị:**
  * Danh sách các đơn hàng mới nhất đã tạo thành công trong toàn bộ khu vực Miền Bắc (ngày lên đơn, khách hàng, tổng tiền, trạng thái đơn).
* **Truy vấn SQL đối chứng:**
  ```sql
  USE [medtest];
  EXEC dbo.API_DonHang_AI @Username = 'QLBH013.MED', @TopN = 50;
  ```

---

### 💸 Kịch bản 4: Giám sát tổng công nợ khu vực (STT 08 - `@cong_no_khach_hang`)
* **Mục đích:** Giúp Quản lý kiểm soát tình hình công nợ của toàn bộ các nhà thuốc trong vùng phụ trách để đôn đốc thu hồi nợ.
* **Câu chat mẫu với Chatbot:**
  * *"Tổng công nợ vùng tôi tháng này thế nào?"*
  * *"@cong_no_khach_hang"*
* **Kỳ vọng hiển thị:**
  * Bảng xếp hạng nợ của tất cả nhà thuốc thuộc vùng Miền Bắc, sắp xếp từ nợ nhiều nhất đến nợ ít nhất để quản lý dễ dàng nhận diện khách hàng rủi ro cao.
* **Truy vấn SQL đối chứng:**
  ```sql
  USE [medtest];
  EXEC dbo.API_CongNoKhachHang_AI @Username = 'QLBH013.MED', @DenNgay = '2026-05-25';
  ```

---

### 🔍 Kịch bản 5: Tra cứu chi tiết công nợ & Hoá đơn cụ thể (STT 09 & 10)
* **Mục đích:** Xem chi tiết từng hóa đơn chưa thanh toán của khách hàng mẫu thuộc tuyến vùng Bắc.
* **Câu chat mẫu với Chatbot:**
  * *"Chi tiết công nợ của Quầy Thuốc Thu Thủy"* (Hoặc *"Chi tiết nợ của HYA107"*)
  * *"Tìm hóa đơn của Quầy Thuốc Thu Thủy"*
* **Kỳ vọng hiển thị:**
  * Hiển thị bảng chi tiết các hóa đơn chưa thanh toán của nhà thuốc (số hóa đơn, ngày phát sinh, số ngày quá hạn, số tiền gốc, số tiền còn nợ).
* **Truy vấn SQL đối chứng:**
  ```sql
  USE [medtest];
  -- Tra cứu nợ chi tiết
  EXEC dbo.API_CongNoChiTiet_AI @Username = 'QLBH013.MED', @MaKhachHang = 'HYA107', @DenNgay = '2026-05-25';
  -- Tra cứu hóa đơn bán hàng lịch sử
  EXEC dbo.API_HoaDon_AI @Username = 'QLBH013.MED', @timkiem = 'HYA107';
  ```

---

### 🎖️ Kịch bản 6: Chấm điểm tín nhiệm khách hàng RFM-C (STT 17 - `@cham_diem_k_h`)
* **Mục đích:** AI tự động tính điểm tín dụng/tín nhiệm thang điểm 100 của nhà thuốc dựa trên lịch sử mua hàng, tần suất thanh toán và khả năng tiêu thụ.
* **Câu chat mẫu với Chatbot:**
  * *"Chấm điểm tín nhiệm nhà thuốc Quầy Thuốc Thu Thủy"*
  * *"@cham_diem_k_h"*
* **Kỳ vọng hiển thị:**
  * AI trả về số điểm tín nhiệm (ví dụ: `85/100`), phân hạng khách hàng (Vàng/Bạc/Đồng) kèm lời khuyên chính sách cho nợ hoặc siết nợ cụ thể.
* **Truy vấn SQL đối chứng:**
  ```sql
  USE [medtest];
  EXEC dbo.API_ChamDiemKH_AI 
      @Username = 'QLBH013.MED', 
      @MaKhachHang = 'HYA107', 
      @W_Recency = 30.0, 
      @W_Frequency = 25.0, 
      @W_Monetary = 35.0, 
      @W_Consumption = 10.0;
  ```

---

### 🏪 Kịch bản 7: Kiểm tra lịch trình viếng thăm tuyến (STT 12 - `@tuyen_ban_hang`)
* **Mục đích:** Giúp Quản lý kiểm tra xem hôm nay các TDV dưới quyền đi thăm những nhà thuốc nào để tiện đôn đốc, giám sát.
* **Câu chat mẫu với Chatbot:**
  * *"Tuyến bán hàng của vùng tôi hôm nay"*
  * *"@tuyen_ban_hang"*
* **Kỳ vọng hiển thị:**
  * Danh sách lộ trình viếng thăm các nhà thuốc của TDV **Đoàn Văn Thế** và các TDV vùng Bắc trong ngày hôm nay.
* **Truy vấn SQL đối chứng:**
  ```sql
  USE [medtest];
  EXEC dbo.API_TuyenBanHang_AI @Username = 'QLBH013.MED', @TopN = 100;
  ```

---

### 🧪 Kịch bản 8: Tra cứu tồn kho & Thông tin sản phẩm (STT 07 & 18)
* **Mục đích:** Tra nhanh tồn kho thực tế của sản phẩm tại các kho phân quyền thuộc khu vực để báo cho khách hàng.
* **Câu chat mẫu với Chatbot:**
  * *"Kiểm tra tồn kho sản phẩm Antrinano"*
  * *"Thông tin chi tiết sản phẩm Argelomag"*
* **Kỳ vọng hiển thị:**
  * AI hiển thị số lượng tồn kho khả dụng của sản phẩm tại các kho thuộc khu vực Miền Bắc.
  * Trả về chi tiết công dụng, thành phần, cách dùng và giá bán niêm yết của sản phẩm.
* **Truy vấn SQL đối chứng:**
  ```sql
  USE [medtest];
  -- Kiểm tra tồn kho
  EXEC dbo.API_DanhSachTonKho_AI @Username = 'QLBH013.MED', @ItemID = 'A003';
  -- Tra cứu chi tiết thông tin thuốc
  EXEC dbo.API_TraCuuSanPham_AI @Username = 'QLBH013.MED', @timkiem = 'Argelomag', @TopN = 3;
  ```

---

## 💡 3. NGUYÊN TẮC HỖ TRỢ NGHIỆM THU CHO QUẢN LÝ (QL)
1. **Tìm kiếm thông minh (Fuzzy Search):** Không cần gõ đúng chính xác chữ hoa thường hay dấu tiếng Việt. Bạn chỉ cần gõ *"thu thuy"*, *"quat thuoc thu thuy"*, hay *"antrinano"*, AI sẽ tự động khớp từ khóa với dữ liệu trong hệ thống.
2. **Biểu đồ & Bảng biểu:** Toàn bộ bảng công nợ, bảng xếp hạng doanh số sẽ được định dạng bảng chuyên nghiệp và tinh tế ngay trên màn hình chat.
3. **Báo cáo sự cố:** Nếu phát hiện dữ liệu hiển thị không trùng khớp với số liệu thực tế trong SQL, vui lòng liên hệ bộ phận kỹ thuật để kiểm tra thủ tục lưu trữ (Stored Procedure) tương ứng.
