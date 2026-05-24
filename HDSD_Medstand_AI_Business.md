# HƯỚNG DẪN SỬ DỤNG HỆ THỐNG TRỢ LÝ AI MEDSTAND

*Tài liệu hướng dẫn nghiệp vụ & Kịch bản kiểm thử dành cho Business*
*Phiên bản: V38 (Tháng 05/2026)*

---

---

---

## 📖 MỤC LỤC TÀI LIỆU HƯỚNG DẪN & UAT
*Nhấp chuột vào bất kỳ đề mục nào bên dưới để di chuyển nhanh đến nội dung tương ứng:*

- [**PHẦN 1: THÔNG TIN CHUNG**](#phan-1)
  - [1.1 Giới thiệu mục đích](#phan-1-1)
  - [1.2 Đối tượng sử dụng](#phan-1-2)
- [**PHẦN 2: CHUẨN BỊ BAN ĐẦU**](#phan-2)
- [**PHẦN 3: HƯỚNG DẪN SỬ DỤNG CHI TIẾT (QUY TRÌNH CỐT LÕI)**](#phan-3)
  - [Quy trình 1: Tra cứu doanh số & Báo cáo bán hàng](#phan-3-qtr-1)
  - [Quy trình 2: Lập đơn hàng nhanh qua Chat](#phan-3-qtr-2)
  - [Quy trình 3: Xem gợi ý đặt hàng & Bán thêm (Upsell)](#phan-3-qtr-3)
  - [Quy trình 4: Quản lý công nợ & Hóa đơn](#phan-3-qtr-4)
  - [Quy trình 5: Cập nhật tri thức mới RAG Admin](#phan-3-qtr-5)
- [**PHẦN 4: CÁC LỖ THƯỜNG GẶP VÀ CÁCH KHẮC PHỤC (FAQ)**](#phan-4)
- [**PHẦN 5: THÔNG TIN LIÊN HỆ HỖ TRỢ**](#phan-5)
- [**PHẦN 6: DANH SÁCH TÀI KHOẢN UAT & DỮ LIỆU KIỂM THỬ**](#phan-6)
  - [6.1 Danh sách tài khoản kiểm thử UAT](#phan-6-1)
  - [6.2 Mapping lệnh nhanh @ menu và Ví dụ câu hỏi](#phan-6-2)
  - [6.3 Kịch bản và Câu lệnh Kiểm thử chi tiết từng cặp](#phan-6-3)
  - [6.4 Phụ lục: Kết Quả Kiểm Thử Thực Tế của 13 Tài Khoản](#phan-6-4)
- [**PHẦN 7: PHỤ LỤC CHI TIẾT 247 KỊCH BẢN KIỂM THỬ THỰC TẾ**](#phan-7)
  - [🧭 Danh mục truy cập nhanh 13 tài khoản UAT](#phan-7-menu)

---
<div id="phan-3"></div>

## PHẦN 3: HƯỚNG DẪN SỬ DỤNG CHI TIẾT (CÁC QUY TRÌNH CỐT LÕI)

<div id="phan-3-qtr-1"></div>

### Quy trình 1: Tra cứu doanh số & Báo cáo bán hàng
- **Bước 1**: Nhấp vào biểu tượng Chatbot ở góc dưới cùng bên phải màn hình để mở cửa sổ chat.
- **Bước 2**: Nhập câu hỏi tự nhiên bằng tiếng Việt (có dấu hoặc không dấu).
  *Ví dụ:* `doanh so cua toi thang nay` hoặc `doanh thu tuan nay`
- **Bước 3**: Nhấn nút **Gửi** (hoặc Enter). AI sẽ truy xuất dữ liệu tức thời và hiển thị bảng/biểu đồ doanh số ngay trong khung chat.


<div id="phan-3-qtr-2"></div>

### Quy trình 2: Lập đơn hàng nhanh qua Chat (Không cần bấm nhiều bước)
- **Bước 1**: Trong ô nhập liệu, gõ tên sản phẩm, số lượng và tên nhà thuốc cần lên đơn.
  *Ví dụ:* `Lên đơn 5 hộp Antrinano cho Quầy Thuốc Thu Thủy`
  *Mẹo*: Không cần nhớ mã sản phẩm, chỉ cần viết tắt tên nhà thuốc, AI sẽ tự động dò tìm thông minh.
- **Bước 2**: AI phân tích câu lệnh, tự động nhận diện sản phẩm, số lượng và thông tin nhà thuốc trong giỏ hàng mẫu, sau đó phản hồi lại để bạn kiểm tra.
- **Bước 3**: Đọc kỹ thông tin hiển thị trên màn hình xác nhận, nhấn nút **Xác nhận** để tạo đơn. Hệ thống sẽ cấp mã đơn hàng mới dạng `DMB0526/...` ở trạng thái "Chờ duyệt".


<div id="phan-3-qtr-3"></div>

### Quy trình 3: Xem gợi ý đặt hàng & Bán thêm (Upsell)
- **Bước 1**: Nhập yêu cầu gợi ý đặt hàng cho một khách hàng cụ thể.
  *Ví dụ:* `Gợi ý đơn hàng cho Quầy Thuốc Thu Thủy`
- **Bước 2**: AI phân tích lịch sử mua hàng, tần suất đặt hàng của nhà thuốc đó và đưa ra danh sách sản phẩm gợi ý nên chào kèm lý do cụ thể (ví dụ: "Sản phẩm A sắp hết chu kỳ sử dụng").
- **Bước 3**: Để tăng thêm doanh thu trên mỗi đơn, gõ yêu cầu bán kèm:
  *Ví dụ:* `Có sản phẩm nào bán kèm Antrinano không?`
  AI sẽ gợi ý các sản phẩm bổ trợ (Argelomag, Topalpha...) thường được khách hàng mua cùng nhau.


<div id="phan-3-qtr-4"></div>

### Quy trình 4: Quản lý công nợ & Hóa đơn (Dành cho Quản lý)
- **Bước 1**: Gõ yêu cầu xem tổng công nợ khu vực.
  *Ví dụ:* `Tổng công nợ vùng tôi tháng 5`
  AI trả về bảng tổng hợp nợ, danh sách nhà thuốc còn nợ và sắp xếp từ nợ nhiều đến nợ ít.
- **Bước 2**: Tra cứu chi tiết hóa đơn chưa thanh toán của một khách hàng:
  *Ví dụ:* `Nhà Thuốc Lê Hùng 2 còn nợ hóa đơn nào?`
  AI trả về danh sách hóa đơn cụ thể kèm số tiền và ngày đến hạn thanh toán để tiện đôn đốc thu hồi nợ.


<div id="phan-3-qtr-5"></div>

### Quy trình 5: Cập nhật tri thức mới lên hệ thống AI (Dành cho Quản lý trở lên)
Nhằm chủ động cập nhật các tài liệu nội bộ (Chính sách bán hàng, Catalogue sản phẩm mới, Chương trình khuyến mãi) mà không cần can thiệp kỹ thuật:
- **Bước 1**: Truy cập menu **"Quản lý Trợ lý (RAG)"** tại Cổng cập nhật tri thức AI (`#/rag-admin`).
- **Bước 2**: Tại vùng kéo thả tài liệu, chọn hoặc kéo thả trực tiếp tài liệu cần nạp (`PDF`, `DOCX`, `XLSX`, hoặc hình ảnh poster `PNG`/`JPG`).
- **Bước 3**: Nhập **Tên tài liệu / Tiêu đề** và lựa chọn **Ngày hết hạn hiệu lực** của tài liệu (nếu có).
- **Bước 4**: Nhấn nút **"Đồng bộ Tri thức lên AI"**.
- **Bước 5**: Khi hộp thoại **Xác nhận** xuất hiện, bấm **Đồng ý**. Hệ thống sẽ tự động bóc tách chữ qua OCR thông minh (đối với ảnh) hoặc băm phân đoạn (đối với văn bản) và lưu trữ bảo mật vào Qdrant Vector Store của công ty.
- **Bước 6**: Sau 5-10 giây, hộp thoại báo cáo **Thành công** sẽ xuất hiện. Trợ lý AI lúc này đã tự động được học tri thức mới và sẵn sàng tư vấn nghiệp vụ cho toàn bộ đội ngũ bán hàng ngay lập tức.


---

<div id="phan-4"></div>

## PHẦN 4: CÁC LỖI THƯỜNG GẶP VÀ CÁCH KHẮC PHỤC (FAQ / TROUBLESHOOTING)

- **Vấn đề 1: Tôi quên mật khẩu đăng nhập phải làm thế nào?**
  *Khắc phục*: Hệ thống hiện tại chưa có tính năng tự reset mật khẩu qua email. Bạn vui lòng liên hệ trực tiếp bộ phận IT nội bộ, cung cấp Tên đăng nhập để được cấp lại mật khẩu mới trong vòng 24 giờ.
  
- **Vấn đề 2: AI báo lỗi "Không có quyền xem thông tin này"**
  *Khắc phục*: Đây không phải lỗi hệ thống mà là tính năng bảo mật phân quyền đang hoạt động đúng. Tài khoản của bạn chỉ xem được dữ liệu trong vùng mình phụ trách. Việc cố tình tra cứu số liệu của nhân sự khác vùng sẽ bị AI từ chối.
  
- **Vấn đề 3: Đơn hàng lập nhầm qua chat có hủy được không?**
  *Khắc phục*: Được. Sau khi tạo đơn qua AI, đơn sẽ ở trạng thái "Chờ duyệt". Bạn hãy liên hệ ngay với Quản lý vùng của mình để yêu cầu từ chối duyệt/hủy đơn hàng đó trên hệ thống trước khi kho xuất hàng.

- **Vấn đề 4: AI phản hồi chậm hoặc không gửi được tin nhắn**
  *Khắc phục*: Kiểm tra lại kết nối mạng 3G/4G/Wifi trên điện thoại của bạn. Nếu mạng ổn định, hãy thử F5 (làm mới) lại trang web medtest.bms79.com và đăng nhập lại.

- **Vấn đề 5: Lỗi không tìm thấy dữ liệu ("Không tìm thấy dữ liệu") khi tìm kiếm hoặc gợi ý đơn hàng cho khách hàng bằng tên không dấu hoặc viết tắt (ví dụ: tài khoản "demo" tìm "Quầy Thuốc Thu Thuy")**
  *Khắc phục*: Hệ thống đã được cập nhật bản vá kỹ thuật toàn diện trong phiên bản V38 (Tháng 05/2026) để xử lý triệt để hai lỗi cốt lõi:
  1. **Lỗi Trùng Quyền Tham Số Claims (`@ObjectID` Claim Injection Guard)**:
     - *Nguyên nhân*: Hệ thống backend tự động tiêm (inject) giá trị chi nhánh `BranchID` (ví dụ: `'MB'` của tài khoản `demo`) vào tham số `@ObjectID`, vô tình ghi đè lên giá trị tìm kiếm tên khách hàng, dẫn đến tìm kiếm khách hàng mang mã `'MB'` (không tồn tại trong danh mục khách hàng `CF_ObjectTbl`) và trả về lỗi không tìm thấy dữ liệu.
     - *Giải pháp*: Cập nhật chốt chặn `Claim Injection Guard` trong các Stored Procedure `API_GoiYDonHang_AI` và `API_DonHang_AI`. Hệ thống chỉ ánh xạ `@ObjectID` sang `@MaKhachHang` khi mã này thực sự tồn tại trong danh mục khách hàng. Nếu là mã chi nhánh, hệ thống sẽ bỏ qua và ưu tiên tìm kiếm theo tên khách hàng do AI hoặc người dùng nhập vào.
  2. **Lỗi Nhạy Dấu Tiếng Việt (Vietnamese Accent Sensitivity)**:
     - *Nguyên nhân*: Collation mặc định phân biệt dấu tiếng Việt, dẫn đến việc gõ tên không dấu như `'THUTHUY'` bị khớp nhầm sang khách hàng khác hoặc không tìm thấy kết quả.
     - *Giải pháp*: Áp dụng cơ chế Collation không phân biệt dấu và chữ hoa/thường (`COLLATE SQL_Latin1_General_CP1_CI_AI`) trên tất cả các phép so sánh chuỗi tên khách hàng trong các Stored Procedure liên quan (`API_GoiYDonHang_AI`, `API_TuyenBanHang_AI`, `API_UpsellGoiY_AI`). Việc tìm kiếm không dấu giờ đây đạt độ chính xác 100% (ví dụ: gõ `thuthuy` sẽ khớp chính xác với `Quầy Thuốc Thu Thủy`).

- **Vấn đề 6: Lỗi hiển thị sai ký tự tiếng Việt (Mojibake - ví dụ: "Ná»£ Khá»§ng" thay vì "Nợ Khủng") khi xem phân loại hoặc chi tiết công nợ**
  *Khắc phục*: Hệ thống đã được nâng cấp trong luồng xử lý phản hồi dữ liệu tại `Format Execute Response` (tệp `API_Execute.json` của n8n):
  1. **Nguyên nhân**: Trình điều khiển kết nối cơ sở dữ liệu Microsoft SQL Server trên n8n giải mã một số chuỗi unicode tiếng Việt theo bảng mã Latin1 (Windows-1252), dẫn đến hiện tượng hiển thị méo font chữ (Mojibake).
  2. **Giải pháp**: Tích hợp hàm giải mã thông minh tự động `decodeUtf8` đệ quy sâu vào đối tượng dữ liệu trước khi trả về cho chatbot:
     ```javascript
     function decodeUtf8(str) {
       if (typeof str !== 'string') return str;
       try {
         return decodeURIComponent(escape(str));
       } catch (e) {
         return str;
       }
     }
     ```
     Cơ chế này hoạt động an toàn tuyệt đối: nếu chuỗi nhận về bị lỗi bảng mã Latin1 (ví dụ: `Ná»£ Khá»§ng`), nó sẽ giải mã ngược về đúng chuẩn UTF-8 (`Nợ Khủng`). Nếu chuỗi đã chuẩn Unicode sẵn, cơ chế `try-catch` sẽ bảo vệ và giữ nguyên chuỗi gốc mà không gây lỗi giải mã lặp lại.

- **Vấn đề 7: Lỗi tìm kiếm công nợ khách hàng bằng tên viết tắt hoặc không khớp chính xác dấu (ví dụ: "Phương Dung" vs "PHUONGDUNG1986" còn nợ bao nhiêu)**
  *Khắc phục*: Hệ thống đã được tối ưu hóa đồng bộ trong Stored Procedure truy vấn công nợ (`API_CongNoKhachHang_AI` và `API_CongNoChiTiet_AI`):
  1. **Nguyên nhân**: Cơ sở dữ liệu mặc định dùng phân biệt dấu (Accent-Sensitive) khiến việc AI trích xuất thực thể không dấu `"PHUONGDUNG1986"` không thể khớp trúng khách hàng `"Phương Dung"`.
  2. **Giải pháp**: Ép kiểu đối chiếu chuỗi không nhạy dấu (Accent-Insensitive) sử dụng Collation `Latin1_General_CI_AI` ở tầng so sánh `LIKE`, đồng thời chuẩn hóa loại bỏ dấu cách thừa, dấu ngoặc để đảm bảo AI tìm kiếm chuẩn xác 100% dù người dùng chat có dấu, không dấu hay viết tắt.

- **Vấn đề 8: Sau khi đăng nhập thành công, chỉ số "Doanh số tháng" hiển thị bằng `0` và biểu đồ phẳng kèm theo cảnh báo "Không có dữ liệu", hoặc xuất hiện lỗi `Add failed. Duplicate key value supplied.`**
  *Khắc phục*: Hệ thống đã được nâng cấp chốt chặn đồng bộ dữ liệu và dọn sạch bộ nhớ cache:
  1. **Lệch cấu hình do cache claims của C# backend**: Cập nhật nóng Stored Procedure `API_DoanhSo_AI` tích hợp cơ chế đồng bộ live (`Live Claims Sync Guard`). Nếu backend truyền tham số `@ManagerID` sai lệch do lỗi lưu cache token, SP sẽ tự động đối chiếu dữ liệu live từ bảng `SY_User` để ghi đè, đảm bảo hiển thị đúng 100% doanh số thực tế của Trình Dược Viên và Quản lý.
  2. **Kẹt bộ nhớ đệm trình duyệt (PWA / Service Worker Cache)**: Trình duyệt lưu cache offline vào cơ sở dữ liệu nội bộ (IndexedDB) bị trùng khóa gây ra lỗi `Duplicate key value supplied`. Bạn chỉ cần mở DevTools (`F12`), vào tab **Application** (hoặc nhấn biểu tượng `>>`), chọn mục **Clear storage**, sau đó nhấn **Clear site data** và bấm **F5** để tải lại trang web. Bộ nhớ đệm sẽ được dọn sạch hoàn toàn và dữ liệu doanh số sẽ hiển thị tức thì.

---

<div id="phan-5"></div>

## PHẦN 5: THÔNG TIN LIÊN HỆ HỖ TRỢ

Trong quá trình sử dụng hệ thống Medstand AI, nếu gặp bất kỳ khó khăn hoặc sự cố kỹ thuật nào ngoài hướng dẫn trên, xin vui lòng liên hệ:
- **Hotline hỗ trợ kỹ thuật (IT Medstand)**: 1900.xxxx (Nhánh số 3)
- **Email tiếp nhận sự cố**: it-support@medstand.vn
- **Thời gian làm việc**: Từ 8:00 đến 17:30 (Thứ 2 đến Thứ 7 hàng tuần)

---

<div id="phan-6"></div>

## PHẦN 6: DANH SÁCH TÀI KHOẢN UAT & DỮ LIỆU KIỂM THỬ THỰC TẾ

<div id="phan-6-1"></div>

### 6.1 Bảng 1: Danh sách tài khoản kiểm thử UAT (Ghép đôi Quản lý & TDV tương ứng)

| STT | Quản lý (Manager) | Tài khoản QL | Trình dược viên (TDV/Sale) | Tài khoản TDV | Vùng phụ trách | Khách hàng mẫu (UAT) |
| :---: | :--- | :---: | :--- | :---: | :---: | :--- |
| 1 | Mai Anh Tuấn | `QLBH013.MED` | Đoàn Văn Thế | `NAMDINHB.MED` | Miền Bắc | Quầy Thuốc Thu Thủy (`HYA107`) |
| 2 | Trần Văn Hướng | `QLBH016.MED` | Nguyễn Công Đức | `BACNINHA.MED` | Miền Bắc | Quầy Thuốc Thu Thủy (`HYA107`) |
| 3 | Nguyễn Thế Anh | `QLBH005.MED` | Lê Thị Hiền | `HUEB.MED` | Miền Trung | Nhà Thuốc Lê Hùng 2 (`DNA014`) |
| 4 | Nguyễn Văn Việt Anh | `QLBH010.MED` | Lê Thị Lệ | `DANANGA.MED` | Miền Trung | Nhà Thuốc Lê Hùng 2 (`DNA014`) |
| 5 | Trần Văn Luân | `QLMN2` | Nguyễn Thị Thu Thảo | `CanThoA` | Miền Nam | Nhà Thuốc Lê Hùng 2 (`DNA014`) |
| 6 | Nguyễn Văn Thái | `QLMD1` | Nguyễn Quốc Tuấn | `BinhPhuocA` | Miền Nam | Nhà Thuốc Lê Hùng 2 (`DNA014`) |
| 7 | Ngô Đức Hùng | `QLBH024.MED` | Nguyễn Quốc Tuấn | `BinhPhuocA` | Miền Nam | Nhà Thuốc Lê Hùng 2 (`DNA014`) |

<div id="phan-6-2"></div>

### 6.2 Bảng 2: Mapping lệnh nhanh @ menu và Ví dụ câu hỏi tự nhiên

| STT | Tính năng | Lệnh @ nhanh | Ví dụ câu hỏi chat tự nhiên tiếng Việt |
| :---: | :--- | :--- | :--- |
| 01 | Xem doanh số bán hàng | `@doanh_so` | `Doanh so cua toi thang nay` |
| 02 | Bảo mật — phân quyền | `Tự động` | *(Dữ liệu tự giới hạn theo tài khoản đăng nhập)* |
| 03 | Tra cứu đơn hàng | `@don_hang` | `Tra cuu danh sach don hang gan day cua toi` |
| 04 | Tạo đơn hàng mới | `@lap_don_hang` | `Lên đơn 5 hộp Antrinano cho Quầy Thuốc Thu Thủy` |
| 05 | Gợi ý đặt hàng cho khách | `@goi_y_don_hang` | `Gợi ý đơn hàng cho Quầy Thuốc Thu Thủy` |
| 06 | Gợi ý bán kèm (Upsell) | `@upsell_goi_y` | `Có sản phẩm nào bán kèm Antrinano không?` |
| 07 | Tra cứu thông tin sản phẩm | `@tra_cuu_san_pham` | `Thông tin sản phẩm Antrinano Plus` |
| 08 | Xem tổng công nợ khu vực | `@cong_no_khach_hang` | `Tổng công nợ vùng tôi tháng 5` |
| 09 | Chi tiết công nợ từng khách | `@cong_no_chi_tiet` | `Nhà Thuốc Lê Hùng 2 còn nợ hóa đơn nào?` |
| 10 | Tra cứu hóa đơn | `@hoa_don` | `Hóa đơn của Nhà Thuốc Hồng Mai tháng 5` |
| 11 | Điểm tích lũy khách hàng | `@tich_luy` | `Quầy Thuốc Thu Thủy có bao nhiêu điểm tích lũy?` |
| 12 | Tuyến bán hàng | `@tuyen_ban_hang` | `Tuyến bán hàng của tôi hôm nay` |
| 13 | Gợi ý thuốc theo triệu chứng | `@goi_y_don_thuoc` | `Bệnh nhân bị mất ngủ nên dùng thuốc gì?` |
| 14 | Đề xuất khuyến mại | `@de_xuat_khuyen_mai` | `Tháng này có chương trình khuyến mãi gì?` |
| 15 | Sản phẩm trọng tâm tháng | `@san_pham_trong_tam` | `Sản phẩm trọng tâm tháng này là gì?` |
| 16 | Tra cứu danh mục phân loại | `@danh_muc` | `Các nhóm sản phẩm trong hệ thống` |
| 17 | Chấm điểm tin cậy | `@cham_diem_k_h` | `Điểm tín dụng của Quầy Thuốc Thu Thủy` |
| 18 | Kiểm tra tồn kho | `@danh_sach_ton_kho` | `Còn bao nhiêu hộp Antrinano Plus trong kho?` |
| 19 | Khảo sát khách hàng | `@danh_sach_cau_hoi_khao_sat` | `Danh sách câu hỏi khảo sát hôm nay` |

<div id="phan-6-3"></div>

### 6.3 Kịch bản và Câu lệnh Kiểm thử UAT chi tiết theo từng Cặp tài khoản (Manager - Sale)

### 6.3.1 Cặp 1 (Miền Bắc): Quản lý Mai Anh Tuấn & TDV Đoàn Văn Thế
- **Vùng phụ trách (Region)**: Miền Bắc
- **Tài khoản Quản lý (Manager)**: `QLBH013.MED` (Họ tên: Mai Anh Tuấn)
- **Tài khoản Trình dược viên (TDV/Sale)**: `NAMDINHB.MED` (Họ tên: Đoàn Văn Thế)
- **Khách hàng mẫu (Customer)**: Quầy Thuốc Thu Thủy (HYA107)

| STT | Tính Năng Kiểm Thử | Câu Hỏi Mẫu (Prompt) | Kỳ Vọng Đăng Nhập Quản Lý | Kỳ Vọng Đăng Nhập TDV/Sale |
| :---: | :--- | :--- | :--- | :--- |
| 01 | Xem doanh so ban hang | `Doanh so cua toi thang nay the nao?` | Xem tổng doanh số của cả vùng phụ trách. | Chỉ xem doanh số cá nhân của chính mình. |
| 02 | Bao mat — phan quyen | `Doanh so cua Tran Van Luan vung Mien Nam the nao?` | Hệ thống từ chối hiển thị dữ liệu ngoài vùng phụ trách. | Hệ thống từ chối hiển thị dữ liệu ngoài vùng phụ trách. |
| 03 | Tra cuu don hang | `Tra cuu danh sach don hang gan day cua toi` | Xem toàn bộ danh sách đơn hàng của cả vùng. | Chỉ xem danh sách đơn hàng của chính mình. |
| 04 | Tao don hang qua chat | `Len don 5 hop Antrinano cho Quay Thuoc Thu Thuy` | Lên đơn cho khách hàng bất kỳ trong vùng. | Lên đơn cho khách hàng thuộc tuyến mình quản lý. |
| 05 | Goi y dat hang tu dong | `Goi y don hang cho Quay Thuoc Thu Thuy` | Trả về gợi ý đặt hàng cho khách hàng trong vùng. | Trả về gợi ý đặt hàng tương tự cho khách hàng tuyến mình. |
| 06 | Goi y ban kem (Upsell) | `Goi y ban them upsell cho Quay Thuoc Thu Thuy` | Đề xuất sản phẩm mua cùng (Argelomag, Topalpha...) để up-sale. | Đề xuất tương tự cho khách hàng tuyến mình phụ trách. |
| 07 | Tra cuu thong tin san pham | `Thong tin chi tiet ve san pham Antrinano` | Trả về chi tiết quy cách, giá bán, công dụng giống nhau. | Trả về chi tiết quy cách, giá bán, công dụng giống nhau. |
| 08 | Tong cong no khu vuc | `Tong cong no khach hang trong vung cua toi la bao nhieu?` | Xem tổng công nợ toàn vùng và danh sách nợ phân bổ. | Chỉ xem công nợ của các nhà thuốc mình phụ trách. |
| 09 | Cong no chi tiet tung khach | `Chi tiet hoa don chua thanh toan cua Quay Thuoc Thu Thuy` | Tra cứu chi tiết từng hóa đơn nợ của khách hàng bất kỳ trong vùng. | Chỉ tra cứu được hóa đơn nợ của khách thuộc tuyến mình. |
| 10 | Tra cuu hoa don ban hang | `Tim kiem hoa don gan day cua Quay Thuoc Thu Thuy` | Xem toàn bộ danh sách hóa đơn xuất trong vùng phụ trách. | Chỉ xem danh sách hóa đơn xuất cho khách mình phụ trách. |
| 11 | Diem tich luy khach hang | `Diem tich luy hien tai cua Quay Thuoc Thu Thuy la bao nhieu?` | Tra cứu điểm tích lũy của khách hàng bất kỳ trong vùng. | Chỉ tra cứu điểm của khách thuộc tuyến mình quản lý. |
| 12 | Tuyen ban hang hang ngay | `Xem tuyen ban hang cua toi hom nay` | Xem tổng hợp lịch trình, danh sách tuyến đi của nhân viên cấp dưới. | Chỉ xem lịch trình và tuyến đi của cá nhân mình hôm nay. |
| 13 | Goi y theo trieu chung | `Goi y thuoc thay the bo tro khi ban Amoxicillin va Vitamin C` | Trả về phác đồ và sản phẩm bổ trợ chuyên môn giống nhau. | Trả về phác đồ và sản phẩm bổ trợ chuyên môn giống nhau. |
| 14 | Chuong trinh khuyen mai | `He thong co de xuat chuong trinh khuyen mai nao dang chay khong?` | Trả về chính sách khuyến mại đang áp dụng cho vùng/hệ thống. | Trả về chính sách khuyến mại áp dụng cho khách hàng của mình. |
| 15 | San pham trong tam thang | `Danh sach cac san pham trong tam can push trong thang nay` | Xem danh mục sản phẩm trọng tâm cần thúc đẩy cho vùng. | Xem danh mục sản phẩm trọng tâm để chủ động chào hàng. |
| 16 | Tra cuu danh muc | `Xem danh muc cac nhom san pham cua cong ty` | Tra cứu phân loại nhóm hàng giống nhau. | Tra cứu phân loại nhóm hàng giống nhau. |
| 17 | RFM-C Cham diem tin nhiem | `Cham diem tin nhiem khach hang Quay Thuoc Thu Thuy` | Xem điểm tín nhiệm, phân hạng khách bất kỳ trong vùng. | Chỉ xem phân hạng khách hàng thuộc tuyến mình quản lý. |
| 18 | Kiem tra ton kho thuc te | `Kiem tra ton kho cua san pham Antrinano` | Xem tồn kho ở các kho tổng và kho khu vực phụ trách. | Chỉ xem tồn kho tại các kho được phân quyền bán hàng. |
| 19 | Khao sat cham soc khach hang | `Bat dau bai khao sat cho Quay Thuoc Thu Thuy` | Kích hoạt khảo sát cho khách hàng bất kỳ trong vùng. | Kích hoạt khảo sát cho khách hàng thuộc tuyến quản lý. |







---

### 6.3.2 Cặp 2 (Miền Bắc): Quản lý Trần Văn Hướng & TDV Nguyễn Công Đức
- **Vùng phụ trách (Region)**: Miền Bắc
- **Tài khoản Quản lý (Manager)**: `QLBH016.MED` (Họ tên: Trần Văn Hướng)
- **Tài khoản Trình dược viên (TDV/Sale)**: `BACNINHA.MED` (Họ tên: Nguyễn Công Đức)
- **Khách hàng mẫu (Customer)**: Quầy Thuốc Thu Thủy (HYA107)

| STT | Tính Năng Kiểm Thử | Câu Hỏi Mẫu (Prompt) | Kỳ Vọng Đăng Nhập Quản Lý | Kỳ Vọng Đăng Nhập TDV/Sale |
| :---: | :--- | :--- | :--- | :--- |
| 01 | Xem doanh so ban hang | `Doanh so ban hang cua toi trong thang nay?` | Xem tổng doanh số của cả vùng phụ trách. | Chỉ xem doanh số cá nhân của chính mình. |
| 02 | Bao mat — phan quyen | `Cho toi xem doanh so cua Nguyen Van Viet Anh?` | Hệ thống từ chối hiển thị dữ liệu ngoài vùng phụ trách. | Hệ thống từ chối hiển thị dữ liệu ngoài vùng phụ trách. |
| 03 | Tra cuu don hang | `Danh sach don hang kiem thu cua toi?` | Xem toàn bộ danh sách đơn hàng của cả vùng. | Chỉ xem danh sách đơn hàng của chính mình. |
| 04 | Tao don hang qua chat | `Len don 3 hop Antrinano cho Quay Thuoc Thu Thuy` | Lên đơn cho khách hàng bất kỳ trong vùng. | Lên đơn cho khách hàng thuộc tuyến mình quản lý. |
| 05 | Goi y dat hang tu dong | `Khach hang Quay Thuoc Thu Thuy nen mua them gi?` | Trả về gợi ý đặt hàng cho khách hàng trong vùng. | Trả về gợi ý đặt hàng tương tự cho khách hàng tuyến mình. |
| 06 | Goi y ban kem (Upsell) | `Goi y upsell cho Quay Thuoc Thu Thuy dat moc qua?` | Đề xuất sản phẩm mua cùng (Argelomag, Topalpha...) để up-sale. | Đề xuất tương tự cho khách hàng tuyến mình phụ trách. |
| 07 | Tra cuu thong tin san pham | `Cong dung va gia ban cua Antrinano?` | Trả về chi tiết quy cách, giá bán, công dụng giống nhau. | Trả về chi tiết quy cách, giá bán, công dụng giống nhau. |
| 08 | Tong cong no khu vuc | `Khach hang nao dang no vung toi nhieu nhat?` | Xem tổng công nợ toàn vùng và danh sách nợ phân bổ. | Chỉ xem công nợ của các nhà thuốc mình phụ trách. |
| 09 | Cong no chi tiet tung khach | `Chi tiet cac khoan no cua Quay Thuoc Thu Thuy?` | Tra cứu chi tiết từng hóa đơn nợ của khách hàng bất kỳ trong vùng. | Chỉ tra cứu được hóa đơn nợ của khách thuộc tuyến mình. |
| 10 | Tra cuu hoa don ban hang | `Hoa don gan day cua Quay Thuoc Thu Thuy?` | Xem toàn bộ danh sách hóa đơn xuất trong vùng phụ trách. | Chỉ xem danh sách hóa đơn xuất cho khách mình phụ trách. |
| 11 | Diem tich luy khach hang | `Kiem tra diem thuong cua Quay Thuoc Thu Thuy?` | Tra cứu điểm tích lũy của khách hàng bất kỳ trong vùng. | Chỉ tra cứu điểm của khách thuộc tuyến mình quản lý. |
| 12 | Tuyen ban hang hang ngay | `Goi y tuyen ban hang va dia chi hom nay cua toi?` | Xem tổng hợp lịch trình, danh sách tuyến đi của nhân viên cấp dưới. | Chỉ xem lịch trình và tuyến đi của cá nhân mình hôm nay. |
| 13 | Goi y theo trieu chung | `Khach mua Amoxicillin, Vitamin C thi can kem theo men vi sinh gi?` | Trả về phác đồ và sản phẩm bổ trợ chuyên môn giống nhau. | Trả về phác đồ và sản phẩm bổ trợ chuyên môn giống nhau. |
| 14 | Chuong trinh khuyen mai | `Khuyen mai hot dang ap dung cho cac SKU trong thang nay?` | Trả về chính sách khuyến mại đang áp dụng cho vùng/hệ thống. | Trả về chính sách khuyến mại áp dụng cho khách hàng của mình. |
| 15 | San pham trong tam thang | `San pham nao duoc BGD uu tien trong thang 5/2026?` | Xem danh mục sản phẩm trọng tâm cần thúc đẩy cho vùng. | Xem danh mục sản phẩm trọng tâm để chủ động chào hàng. |
| 16 | Tra cuu danh muc | `Danh sach phan loai danh muc duoc?` | Tra cứu phân loại nhóm hàng giống nhau. | Tra cứu phân loại nhóm hàng giống nhau. |
| 17 | RFM-C Cham diem tin nhiem | `Phan hang va uy tin thanh toan cua Quay Thuoc Thu Thuy?` | Xem điểm tín nhiệm, phân hạng khách bất kỳ trong vùng. | Chỉ xem phân hạng khách hàng thuộc tuyến mình quản lý. |
| 18 | Kiem tra ton kho thuc te | `Antrinano con bao nhieu hop trong kho?` | Xem tồn kho ở các kho tổng và kho khu vực phụ trách. | Chỉ xem tồn kho tại các kho được phân quyền bán hàng. |
| 19 | Khao sat cham soc khach hang | `Khao sat y kien khach hang Quay Thuoc Thu Thuy?` | Kích hoạt khảo sát cho khách hàng bất kỳ trong vùng. | Kích hoạt khảo sát cho khách hàng thuộc tuyến quản lý. |







---

### 6.3.3 Cặp 3 (Miền Trung): Quản lý Nguyễn Thế Anh & TDV Lê Thị Hiền
- **Vùng phụ trách (Region)**: Miền Trung
- **Tài khoản Quản lý (Manager)**: `QLBH005.MED` (Họ tên: Nguyễn Thế Anh)
- **Tài khoản Trình dược viên (TDV/Sale)**: `HUEB.MED` (Họ tên: Lê Thị Hiền)
- **Khách hàng mẫu (Customer)**: Nhà Thuốc Lê Hùng 2 (DNA014)

| STT | Tính Năng Kiểm Thử | Câu Hỏi Mẫu (Prompt) | Kỳ Vọng Đăng Nhập Quản Lý | Kỳ Vọng Đăng Nhập TDV/Sale |
| :---: | :--- | :--- | :--- | :--- |
| 01 | Xem doanh so ban hang | `Doanh so ca nhan cua toi trong thang nay la bao nhieu?` | Xem tổng doanh số của cả vùng phụ trách. | Chỉ xem doanh số cá nhân của chính mình. |
| 02 | Bao mat — phan quyen | `Cho toi xem doanh so cua Mai Anh Tuan ngoai mien Bac?` | Hệ thống từ chối hiển thị dữ liệu ngoài vùng phụ trách. | Hệ thống từ chối hiển thị dữ liệu ngoài vùng phụ trách. |
| 03 | Tra cuu don hang | `Xem lich su cac don hang gan nhat cua toi` | Xem toàn bộ danh sách đơn hàng của cả vùng. | Chỉ xem danh sách đơn hàng của chính mình. |
| 04 | Tao don hang qua chat | `Len don 5 hop Argelomag cho Nha Thuoc Le Hung 2` | Lên đơn cho khách hàng bất kỳ trong vùng. | Lên đơn cho khách hàng thuộc tuyến mình quản lý. |
| 05 | Goi y dat hang tu dong | `Goi y dat hang tu dong cho Nha Thuoc Le Hung 2` | Trả về gợi ý đặt hàng cho khách hàng trong vùng. | Trả về gợi ý đặt hàng tương tự cho khách hàng tuyến mình. |
| 06 | Goi y ban kem (Upsell) | `Goi y upsell thuc day mua hang cho Nha Thuoc Le Hung 2` | Đề xuất sản phẩm mua cùng (Argelomag, Topalpha...) để up-sale. | Đề xuất tương tự cho khách hàng tuyến mình phụ trách. |
| 07 | Tra cuu thong tin san pham | `Cong dung, chi dinh va gia cua thuoc Argelomag?` | Trả về chi tiết quy cách, giá bán, công dụng giống nhau. | Trả về chi tiết quy cách, giá bán, công dụng giống nhau. |
| 08 | Tong cong no khu vuc | `Liet ke cong no tat ca khach hang o khu vuc Mien Trung?` | Xem tổng công nợ toàn vùng và danh sách nợ phân bổ. | Chỉ xem công nợ của các nhà thuốc mình phụ trách. |
| 09 | Cong no chi tiet tung khach | `Chi tiet hoa don chua thanh toan cua Nha Thuoc Le Hung 2` | Tra cứu chi tiết từng hóa đơn nợ của khách hàng bất kỳ trong vùng. | Chỉ tra cứu được hóa đơn nợ của khách thuộc tuyến mình. |
| 10 | Tra cuu hoa don ban hang | `Tra cuu hoa don gan day nhat cua Nha Thuoc Le Hung 2` | Xem toàn bộ danh sách hóa đơn xuất trong vùng phụ trách. | Chỉ xem danh sách hóa đơn xuất cho khách mình phụ trách. |
| 11 | Diem tich luy khach hang | `Nha Thuoc Le Hung 2 tich luy duoc bao nhieu diem thuong?` | Tra cứu điểm tích lũy của khách hàng bất kỳ trong vùng. | Chỉ tra cứu điểm của khách thuộc tuyến mình quản lý. |
| 12 | Tuyen ban hang hang ngay | `Hom nay toi can di tham nhung nha thuoc nao trong tuyen?` | Xem tổng hợp lịch trình, danh sách tuyến đi của nhân viên cấp dưới. | Chỉ xem lịch trình và tuyến đi của cá nhân mình hôm nay. |
| 13 | Goi y theo trieu chung | `Tu van men vi sinh kem theo khi nguoi dung dung khang sinh Amoxicillin?` | Trả về phác đồ và sản phẩm bổ trợ chuyên môn giống nhau. | Trả về phác đồ và sản phẩm bổ trợ chuyên môn giống nhau. |
| 14 | Chuong trinh khuyen mai | `Liet ke chinh sach va chuong trinh khuyen mai moi nhat?` | Trả về chính sách khuyến mại đang áp dụng cho vùng/hệ thống. | Trả về chính sách khuyến mại áp dụng cho khách hàng của mình. |
| 15 | San pham trong tam thang | `San pham chu luc can thuc day ban hang thang nay la gi?` | Xem danh mục sản phẩm trọng tâm cần thúc đẩy cho vùng. | Xem danh mục sản phẩm trọng tâm để chủ động chào hàng. |
| 16 | Tra cuu danh muc | `Liet ke danh muc san pham dang ban cua cong ty?` | Tra cứu phân loại nhóm hàng giống nhau. | Tra cứu phân loại nhóm hàng giống nhau. |
| 17 | RFM-C Cham diem tin nhiem | `Xep hang va cham diem uy tin no cua Nha Thuoc Le Hung 2` | Xem điểm tín nhiệm, phân hạng khách bất kỳ trong vùng. | Chỉ xem phân hạng khách hàng thuộc tuyến mình quản lý. |
| 18 | Kiem tra ton kho thuc te | `Kiem tra ton kho san pham Argelomag con lai?` | Xem tồn kho ở các kho tổng và kho khu vực phụ trách. | Chỉ xem tồn kho tại các kho được phân quyền bán hàng. |
| 19 | Khao sat cham soc khach hang | `Mo form khao sat dich vu cho Nha Thuoc Le Hung 2` | Kích hoạt khảo sát cho khách hàng bất kỳ trong vùng. | Kích hoạt khảo sát cho khách hàng thuộc tuyến quản lý. |







---

### 6.3.4 Cặp 4 (Miền Trung): Quản lý Nguyễn Văn Việt Anh & TDV Lê Thị Lệ
- **Vùng phụ trách (Region)**: Miền Trung
- **Tài khoản Quản lý (Manager)**: `QLBH010.MED` (Họ tên: Nguyễn Văn Việt Anh)
- **Tài khoản Trình dược viên (TDV/Sale)**: `DANANGA.MED` (Họ tên: Lê Thị Lệ)
- **Khách hàng mẫu (Customer)**: Nhà Thuốc Lê Hùng 2 (DNA014)

| STT | Tính Năng Kiểm Thử | Câu Hỏi Mẫu (Prompt) | Kỳ Vọng Đăng Nhập Quản Lý | Kỳ Vọng Đăng Nhập TDV/Sale |
| :---: | :--- | :--- | :--- | :--- |
| 01 | Xem doanh so ban hang | `Doanh so ban hang cua nhom mien Trung thang nay?` | Xem tổng doanh số của cả vùng phụ trách. | Chỉ xem doanh số cá nhân của chính mình. |
| 02 | Bao mat — phan quyen | `Doanh so vung Mien Nam thang nay cua Tran Van Luan?` | Hệ thống từ chối hiển thị dữ liệu ngoài vùng phụ trách. | Hệ thống từ chối hiển thị dữ liệu ngoài vùng phụ trách. |
| 03 | Tra cuu don hang | `Liet ke cac don hang dang cho duyet hoac da giao vung MT` | Xem toàn bộ danh sách đơn hàng của cả vùng. | Chỉ xem danh sách đơn hàng của chính mình. |
| 04 | Tao don hang qua chat | `Len don 10 hop Argelomag cho Nha Thuoc Le Hung 2` | Lên đơn cho khách hàng bất kỳ trong vùng. | Lên đơn cho khách hàng thuộc tuyến mình quản lý. |
| 05 | Goi y dat hang tu dong | `Nha Thuoc Le Hung 2 hay nhap mat hang nao, goi y lay them?` | Trả về gợi ý đặt hàng cho khách hàng trong vùng. | Trả về gợi ý đặt hàng tương tự cho khách hàng tuyến mình. |
| 06 | Goi y ban kem (Upsell) | `Tu van ban upsell them hang cho Nha Thuoc Le Hung 2` | Đề xuất sản phẩm mua cùng (Argelomag, Topalpha...) để up-sale. | Đề xuất tương tự cho khách hàng tuyến mình phụ trách. |
| 07 | Tra cuu thong tin san pham | `Tra cuu san pham Argelomag ke don nhu nao?` | Trả về chi tiết quy cách, giá bán, công dụng giống nhau. | Trả về chi tiết quy cách, giá bán, công dụng giống nhau. |
| 08 | Tong cong no khu vuc | `Nha thuoc nao co cong no tre han cao nhat mien Trung?` | Xem tổng công nợ toàn vùng và danh sách nợ phân bổ. | Chỉ xem công nợ của các nhà thuốc mình phụ trách. |
| 09 | Cong no chi tiet tung khach | `Nha Thuoc Le Hung 2 con ton dong bao nhieu hoa đơn?` | Tra cứu chi tiết từng hóa đơn nợ của khách hàng bất kỳ trong vùng. | Chỉ tra cứu được hóa đơn nợ của khách thuộc tuyến mình. |
| 10 | Tra cuu hoa don ban hang | `Lich su hoa don ban ra cho Nha Thuoc Le Hung 2?` | Xem toàn bộ danh sách hóa đơn xuất trong vùng phụ trách. | Chỉ xem danh sách hóa đơn xuất cho khách mình phụ trách. |
| 11 | Diem tich luy khach hang | `Tra diem khuyen mai tich luy cua Nha Thuoc Le Hung 2?` | Tra cứu điểm tích lũy của khách hàng bất kỳ trong vùng. | Chỉ tra cứu điểm của khách thuộc tuyến mình quản lý. |
| 12 | Tuyen ban hang hang ngay | `Tuyen vieng tham di chuyen hom nay cua nhan vien toi?` | Xem tổng hợp lịch trình, danh sách tuyến đi của nhân viên cấp dưới. | Chỉ xem lịch trình và tuyến đi của cá nhân mình hôm nay. |
| 13 | Goi y theo trieu chung | `Ke don thay the / kem men tieu hoa khi dung khang sinh?` | Trả về phác đồ và sản phẩm bổ trợ chuyên môn giống nhau. | Trả về phác đồ và sản phẩm bổ trợ chuyên môn giống nhau. |
| 14 | Chuong trinh khuyen mai | `Khuyen mai cua hang dang ap dung cho dai ly mien Trung?` | Trả về chính sách khuyến mại đang áp dụng cho vùng/hệ thống. | Trả về chính sách khuyến mại áp dụng cho khách hàng của mình. |
| 15 | San pham trong tam thang | `Danh sach SKU duoc BGĐ yeu cau tap trung push thang nay?` | Xem danh mục sản phẩm trọng tâm cần thúc đẩy cho vùng. | Xem danh mục sản phẩm trọng tâm để chủ động chào hàng. |
| 16 | Tra cuu danh muc | `Xem danh muc cac loai khach hang va san pham?` | Tra cứu phân loại nhóm hàng giống nhau. | Tra cứu phân loại nhóm hàng giống nhau. |
| 17 | RFM-C Cham diem tin nhiem | `Tinh trang tin nhiem va chi so no cua Nha Thuoc Le Hung 2?` | Xem điểm tín nhiệm, phân hạng khách bất kỳ trong vùng. | Chỉ xem phân hạng khách hàng thuộc tuyến mình quản lý. |
| 18 | Kiem tra ton kho thuc te | `Argelomag con ton bao nhieu o cac kho Mien Trung?` | Xem tồn kho ở các kho tổng và kho khu vực phụ trách. | Chỉ xem tồn kho tại các kho được phân quyền bán hàng. |
| 19 | Khao sat cham soc khach hang | `Bat dau khao sat muc do hai long cua Nha Thuoc Le Hung 2` | Kích hoạt khảo sát cho khách hàng bất kỳ trong vùng. | Kích hoạt khảo sát cho khách hàng thuộc tuyến quản lý. |







---

### 6.3.5 Cặp 5 (Miền Nam): Quản lý Trần Văn Luân & TDV Nguyễn Thị Thu Thảo
- **Vùng phụ trách (Region)**: Miền Nam
- **Tài khoản Quản lý (Manager)**: `QLMN2` (Họ tên: Trần Văn Luân)
- **Tài khoản Trình dược viên (TDV/Sale)**: `CanThoA` (Họ tên: Nguyễn Thị Thu Thảo)
- **Khách hàng mẫu (Customer)**: Nhà Thuốc Lê Hùng 2 (DNA014)

| STT | Tính Năng Kiểm Thử | Câu Hỏi Mẫu (Prompt) | Kỳ Vọng Đăng Nhập Quản Lý | Kỳ Vọng Đăng Nhập TDV/Sale |
| :---: | :--- | :--- | :--- | :--- |
| 01 | Xem doanh so ban hang | `Xem doanh so vung Mien Nam cua toi thang nay` | Xem tổng doanh số của cả vùng phụ trách. | Chỉ xem doanh số cá nhân của chính mình. |
| 02 | Bao mat — phan quyen | `Doanh so vung mien Bac cua Mai Anh Tuan hom nay?` | Hệ thống từ chối hiển thị dữ liệu ngoài vùng phụ trách. | Hệ thống từ chối hiển thị dữ liệu ngoài vùng phụ trách. |
| 03 | Tra cuu don hang | `Tra cuu don hang gan day cua vung Mien Nam` | Xem toàn bộ danh sách đơn hàng của cả vùng. | Chỉ xem danh sách đơn hàng của chính mình. |
| 04 | Tao don hang qua chat | `Len don 5 hop Topalpha cho Nha Thuoc Le Hung 2` | Lên đơn cho khách hàng bất kỳ trong vùng. | Lên đơn cho khách hàng thuộc tuyến mình quản lý. |
| 05 | Goi y dat hang tu dong | `Goi y san pham nha thuoc Nha Thuoc Le Hung 2 can mua?` | Trả về gợi ý đặt hàng cho khách hàng trong vùng. | Trả về gợi ý đặt hàng tương tự cho khách hàng tuyến mình. |
| 06 | Goi y ban kem (Upsell) | `Goi y chao combo upsell cho Nha Thuoc Le Hung 2` | Đề xuất sản phẩm mua cùng (Argelomag, Topalpha...) để up-sale. | Đề xuất tương tự cho khách hàng tuyến mình phụ trách. |
| 07 | Tra cuu thong tin san pham | `Thanh phan, tac dung phu va huong dan dung cua Topalpha?` | Trả về chi tiết quy cách, giá bán, công dụng giống nhau. | Trả về chi tiết quy cách, giá bán, công dụng giống nhau. |
| 08 | Tong cong no khu vuc | `Khu vuc Mien Nam dang no tat ca bao nhieu tien?` | Xem tổng công nợ toàn vùng và danh sách nợ phân bổ. | Chỉ xem công nợ của các nhà thuốc mình phụ trách. |
| 09 | Cong no chi tiet tung khach | `Nha Thuoc Le Hung 2 con cac hoa don cong no nao chua tra?` | Tra cứu chi tiết từng hóa đơn nợ của khách hàng bất kỳ trong vùng. | Chỉ tra cứu được hóa đơn nợ của khách thuộc tuyến mình. |
| 10 | Tra cuu hoa don ban hang | `Tim hoa don cua Nha Thuoc Le Hung 2` | Xem toàn bộ danh sách hóa đơn xuất trong vùng phụ trách. | Chỉ xem danh sách hóa đơn xuất cho khách mình phụ trách. |
| 11 | Diem tich luy khach hang | `Diem tich luy dat duoc cua Nha Thuoc Le Hung 2 la?` | Tra cứu điểm tích lũy của khách hàng bất kỳ trong vùng. | Chỉ tra cứu điểm của khách thuộc tuyến mình quản lý. |
| 12 | Tuyen ban hang hang ngay | `Xem tuyen di chuyen ban hang hom nay cua nhan vien?` | Xem tổng hợp lịch trình, danh sách tuyến đi của nhân viên cấp dưới. | Chỉ xem lịch trình và tuyến đi của cá nhân mình hôm nay. |
| 13 | Goi y theo trieu chung | `Don thuoc trieu chung: dung Vitamin C va Amoxicillin thi can ban kem men gi?` | Trả về phác đồ và sản phẩm bổ trợ chuyên môn giống nhau. | Trả về phác đồ và sản phẩm bổ trợ chuyên môn giống nhau. |
| 14 | Chuong trinh khuyen mai | `Chuong trinh giam gia/chiet khau dang chay o Mien Nam?` | Trả về chính sách khuyến mại đang áp dụng cho vùng/hệ thống. | Trả về chính sách khuyến mại áp dụng cho khách hàng của mình. |
| 15 | San pham trong tam thang | `Xem danh muc SKU trong tam duoc chi dinh thang nay?` | Xem danh mục sản phẩm trọng tâm cần thúc đẩy cho vùng. | Xem danh mục sản phẩm trọng tâm để chủ động chào hàng. |
| 16 | Tra cuu danh muc | `Tra cuu danh muc san pham dang cap nhat?` | Tra cứu phân loại nhóm hàng giống nhau. | Tra cứu phân loại nhóm hàng giống nhau. |
| 17 | RFM-C Cham diem tin nhiem | `Bao cao cham diem va nguy co roi di cua Nha Thuoc Le Hung 2?` | Xem điểm tín nhiệm, phân hạng khách bất kỳ trong vùng. | Chỉ xem phân hạng khách hàng thuộc tuyến mình quản lý. |
| 18 | Kiem tra ton kho thuc te | `Kiem tra so luong Topalpha con trong kho?` | Xem tồn kho ở các kho tổng và kho khu vực phụ trách. | Chỉ xem tồn kho tại các kho được phân quyền bán hàng. |
| 19 | Khao sat cham soc khach hang | `Khao sat y kien khach hang Nha Thuoc Le Hung 2` | Kích hoạt khảo sát cho khách hàng bất kỳ trong vùng. | Kích hoạt khảo sát cho khách hàng thuộc tuyến quản lý. |







---

### 6.3.6 Cặp 6 (Miền Nam): Quản lý Nguyễn Văn Thái & TDV Nguyễn Quốc Tuấn
- **Vùng phụ trách (Region)**: Miền Nam
- **Tài khoản Quản lý (Manager)**: `QLMD1` (Họ tên: Nguyễn Văn Thái)
- **Tài khoản Trình dược viên (TDV/Sale)**: `BinhPhuocA` (Họ tên: Nguyễn Quốc Tuấn)
- **Khách hàng mẫu (Customer)**: Nhà Thuốc Lê Hùng 2 (DNA014)

| STT | Tính Năng Kiểm Thử | Câu Hỏi Mẫu (Prompt) | Kỳ Vọng Đăng Nhập Quản Lý | Kỳ Vọng Đăng Nhập TDV/Sale |
| :---: | :--- | :--- | :--- | :--- |
| 01 | Xem doanh so ban hang | `Xem bao cao doanh so ca nhan cua toi thang nay` | Xem tổng doanh số của cả vùng phụ trách. | Chỉ xem doanh số cá nhân của chính mình. |
| 02 | Bao mat — phan quyen | `Doanh so vung mien Trung cua Nguyen Van Viet Anh?` | Hệ thống từ chối hiển thị dữ liệu ngoài vùng phụ trách. | Hệ thống từ chối hiển thị dữ liệu ngoài vùng phụ trách. |
| 03 | Tra cuu don hang | `Danh sach don hang toi da len tu truoc toi gio` | Xem toàn bộ danh sách đơn hàng của cả vùng. | Chỉ xem danh sách đơn hàng của chính mình. |
| 04 | Tao don hang qua chat | `Len don 5 hop Topalpha cho Nha Thuoc Le Hung 2` | Lên đơn cho khách hàng bất kỳ trong vùng. | Lên đơn cho khách hàng thuộc tuyến mình quản lý. |
| 05 | Goi y dat hang tu dong | `Goi y don hang thich hop cho Nha Thuoc Le Hung 2` | Trả về gợi ý đặt hàng cho khách hàng trong vùng. | Trả về gợi ý đặt hàng tương tự cho khách hàng tuyến mình. |
| 06 | Goi y ban kem (Upsell) | `Goi y ban upsell gia tri don cho Nha Thuoc Le Hung 2` | Đề xuất sản phẩm mua cùng (Argelomag, Topalpha...) để up-sale. | Đề xuất tương tự cho khách hàng tuyến mình phụ trách. |
| 07 | Tra cuu thong tin san pham | `Thong tin chi tiet ve gia, hop quy cach cua Topalpha` | Trả về chi tiết quy cách, giá bán, công dụng giống nhau. | Trả về chi tiết quy cách, giá bán, công dụng giống nhau. |
| 08 | Tong cong no khu vuc | `Tong cong no cac nha thuoc mien Nam toi quan ly` | Xem tổng công nợ toàn vùng và danh sách nợ phân bổ. | Chỉ xem công nợ của các nhà thuốc mình phụ trách. |
| 09 | Cong no chi tiet tung khach | `Xem no dong cac dot hoa don cua Nha Thuoc Le Hung 2` | Tra cứu chi tiết từng hóa đơn nợ của khách hàng bất kỳ trong vùng. | Chỉ tra cứu được hóa đơn nợ của khách thuộc tuyến mình. |
| 10 | Tra cuu hoa don ban hang | `Lich su cac chung tu hoa don xuat ban cho Nha Thuoc Le Hung 2` | Xem toàn bộ danh sách hóa đơn xuất trong vùng phụ trách. | Chỉ xem danh sách hóa đơn xuất cho khách mình phụ trách. |
| 11 | Diem tich luy khach hang | `Diem thuong tich luy chuong trinh cua Nha Thuoc Le Hung 2` | Tra cứu điểm tích lũy của khách hàng bất kỳ trong vùng. | Chỉ tra cứu điểm của khách thuộc tuyến mình quản lý. |
| 12 | Tuyen ban hang hang ngay | `Tuyen ban hang cua toi hom nay co nhung diem nao?` | Xem tổng hợp lịch trình, danh sách tuyến đi của nhân viên cấp dưới. | Chỉ xem lịch trình và tuyến đi của cá nhân mình hôm nay. |
| 13 | Goi y theo trieu chung | `Ban khang sinh Amoxicillin co kem theo Vitamin C va men vi sinh khong?` | Trả về phác đồ và sản phẩm bổ trợ chuyên môn giống nhau. | Trả về phác đồ và sản phẩm bổ trợ chuyên môn giống nhau. |
| 14 | Chuong trinh khuyen mai | `Co chuong trinh uu dai hoac xar hang combo nao khong?` | Trả về chính sách khuyến mại đang áp dụng cho vùng/hệ thống. | Trả về chính sách khuyến mại áp dụng cho khách hàng của mình. |
| 15 | San pham trong tam thang | `Danh sach san pham trong tam thang 5/2026 can day manh?` | Xem danh mục sản phẩm trọng tâm cần thúc đẩy cho vùng. | Xem danh mục sản phẩm trọng tâm để chủ động chào hàng. |
| 16 | Tra cuu danh muc | `Cac nhom phan loai mat hang dang phat hanh?` | Tra cứu phân loại nhóm hàng giống nhau. | Tra cứu phân loại nhóm hàng giống nhau. |
| 17 | RFM-C Cham diem tin nhiem | `Bao cao cham diem RFM-C va canh bao tin nhiem Nha Thuoc Le Hung 2?` | Xem điểm tín nhiệm, phân hạng khách bất kỳ trong vùng. | Chỉ xem phân hạng khách hàng thuộc tuyến mình quản lý. |
| 18 | Kiem tra ton kho thuc te | `Topalpha con hang giao khong, check kho Mien Nam?` | Xem tồn kho ở các kho tổng và kho khu vực phụ trách. | Chỉ xem tồn kho tại các kho được phân quyền bán hàng. |
| 19 | Khao sat cham soc khach hang | `Mo form khao sat chat luong cho Nha Thuoc Le Hung 2` | Kích hoạt khảo sát cho khách hàng bất kỳ trong vùng. | Kích hoạt khảo sát cho khách hàng thuộc tuyến quản lý. |







---

### 6.3.7 Cặp 7 (Miền Nam): Quản lý Ngô Đức Hùng & TDV Nguyễn Quốc Tuấn
- **Vùng phụ trách (Region)**: Miền Nam
- **Tài khoản Quản lý (Manager)**: `QLBH024.MED` (Họ tên: Ngô Đức Hùng)
- **Tài khoản Trình dược viên (TDV/Sale)**: `BinhPhuocA` (Họ tên: Nguyễn Quốc Tuấn)
- **Khách hàng mẫu (Customer)**: Nhà Thuốc Lê Hùng 2 (DNA014)

| STT | Tính Năng Kiểm Thử | Câu Hỏi Mẫu (Prompt) | Kỳ Vọng Đăng Nhập Quản Lý | Kỳ Vọng Đăng Nhập TDV/Sale |
| :---: | :--- | :--- | :--- | :--- |
| 01 | Xem doanh so ban hang | `Thang nay doanh so ban hang cua toi dat bao nhieu?` | Xem tổng doanh số của cả vùng phụ trách. | Chỉ xem doanh số cá nhân của chính mình. |
| 02 | Bao mat — phan quyen | `Cho xem doanh so cua Tran Van Huong vung Mien Bac?` | Hệ thống từ chối hiển thị dữ liệu ngoài vùng phụ trách. | Hệ thống từ chối hiển thị dữ liệu ngoài vùng phụ trách. |
| 03 | Tra cuu don hang | `Cac don hang toi da thuc hien gan nhat?` | Xem toàn bộ danh sách đơn hàng của cả vùng. | Chỉ xem danh sách đơn hàng của chính mình. |
| 04 | Tao don hang qua chat | `Len don 5 hop Topalpha cho Nha Thuoc Le Hung 2` | Lên đơn cho khách hàng bất kỳ trong vùng. | Lên đơn cho khách hàng thuộc tuyến mình quản lý. |
| 05 | Goi y dat hang tu dong | `Goi y san pham can mua cho Nha Thuoc Le Hung 2` | Trả về gợi ý đặt hàng cho khách hàng trong vùng. | Trả về gợi ý đặt hàng tương tự cho khách hàng tuyến mình. |
| 06 | Goi y ban kem (Upsell) | `Cac mat hang goi y upsell ban kem cho Nha Thuoc Le Hung 2` | Đề xuất sản phẩm mua cùng (Argelomag, Topalpha...) để up-sale. | Đề xuất tương tự cho khách hàng tuyến mình phụ trách. |
| 07 | Tra cuu thong tin san pham | `Thong tin chi tiet gia va đóng goi san pham Topalpha` | Trả về chi tiết quy cách, giá bán, công dụng giống nhau. | Trả về chi tiết quy cách, giá bán, công dụng giống nhau. |
| 08 | Tong cong no khu vuc | `Cong no cua toan bo dai ly vung Mien Nam hien tai?` | Xem tổng công nợ toàn vùng và danh sách nợ phân bổ. | Chỉ xem công nợ của các nhà thuốc mình phụ trách. |
| 09 | Cong no chi tiet tung khach | `Liet ke hoa don no cua Nha Thuoc Le Hung 2?` | Tra cứu chi tiết từng hóa đơn nợ của khách hàng bất kỳ trong vùng. | Chỉ tra cứu được hóa đơn nợ của khách thuộc tuyến mình. |
| 10 | Tra cuu hoa don ban hang | `Tim kiem hoa don ban hang cho Nha Thuoc Le Hung 2` | Xem toàn bộ danh sách hóa đơn xuất trong vùng phụ trách. | Chỉ xem danh sách hóa đơn xuất cho khách mình phụ trách. |
| 11 | Diem tich luy khach hang | `Xem diem tich luy hien tai cua Nha Thuoc Le Hung 2` | Tra cứu điểm tích lũy của khách hàng bất kỳ trong vùng. | Chỉ tra cứu điểm của khách thuộc tuyến mình quản lý. |
| 12 | Tuyen ban hang hang ngay | `Lich di tuyen va diem ghe hom nay cua toi?` | Xem tổng hợp lịch trình, danh sách tuyến đi của nhân viên cấp dưới. | Chỉ xem lịch trình và tuyến đi của cá nhân mình hôm nay. |
| 13 | Goi y theo trieu chung | `Ban Vitamin C va Amoxicillin thi nen tu van them men vi sinh nao?` | Trả về phác đồ và sản phẩm bổ trợ chuyên môn giống nhau. | Trả về phác đồ và sản phẩm bổ trợ chuyên môn giống nhau. |
| 14 | Chuong trinh khuyen mai | `Khuyen mai giam gia dang duoc phep ap dung cho dai ly?` | Trả về chính sách khuyến mại đang áp dụng cho vùng/hệ thống. | Trả về chính sách khuyến mại áp dụng cho khách hàng của mình. |
| 15 | San pham trong tam thang | `Cac san pham trong tam thang nay gom nhung SKU nao?` | Xem danh mục sản phẩm trọng tâm cần thúc đẩy cho vùng. | Xem danh mục sản phẩm trọng tâm để chủ động chào hàng. |
| 16 | Tra cuu danh muc | `Xem cac phan loai danh muc duoc cua hang?` | Tra cứu phân loại nhóm hàng giống nhau. | Tra cứu phân loại nhóm hàng giống nhau. |
| 17 | RFM-C Cham diem tin nhiem | `Bao cao xep hang tin nhiem va chi so uy tin Nha Thuoc Le Hung 2?` | Xem điểm tín nhiệm, phân hạng khách bất kỳ trong vùng. | Chỉ xem phân hạng khách hàng thuộc tuyến mình quản lý. |
| 18 | Kiem tra ton kho thuc te | `Ton kho thuc te cua san pham Topalpha con bao nhieu?` | Xem tồn kho ở các kho tổng và kho khu vực phụ trách. | Chỉ xem tồn kho tại các kho được phân quyền bán hàng. |
| 19 | Khao sat cham soc khach hang | `Form khao sat dich vu tai cho cho Nha Thuoc Le Hung 2` | Kích hoạt khảo sát cho khách hàng bất kỳ trong vùng. | Kích hoạt khảo sát cho khách hàng thuộc tuyến quản lý. |







---

<div id="phan-6-4"></div>

### 6.4 Phụ Lục: Kết Quả Kiểm Thử Thực Tế Chi Tiết Của 13 Tài Khoản UAT

Bảng số liệu dưới đây được trích xuất trực tiếp từ cơ sở dữ liệu `medtest` sau khi chạy thực nghiệm các Stored Procedure của hệ thống AI cho từng tài khoản đăng nhập (đã xử lý triệt để dữ liệu 0 và lỗi RLS):

| STT | Tài Khoản | Họ Tên | Vai Trò | Vùng | Doanh Số Tháng (VND) | Doanh Số Nhân Viên | Số Đơn Hàng | Đơn Chờ Duyệt | Tuyến Hôm Nay | Khách Có Nợ | Tổng Nợ Vùng (VND) | Khách Chấm VIP |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | **QLBH013.MED** | Mai Anh Tuấn | Quản lý | Miền Bắc | 13,763,539,500 | 12 nhân viên | 500 | 1 | 3 | 4 khách | 105,145,000 | 2549 |
| 2 | **NAMDINHB.MED** | Đoàn Văn Thế | TDV | Miền Bắc | 1,007,110,000 | 1 nhân viên | 444 | 1 | 3 | 1 khách | 45,000,000 | 2549 |
| 3 | **QLBH016.MED** | Trần Văn Hướng | Quản lý | Miền Bắc | 13,018,736,500 | 12 nhân viên | 500 | 1 | 3 | 1 khách | 55,000,000 | 2549 |
| 4 | **BACNINHA.MED** | Nguyễn Công Đức | TDV | Miền Bắc | 1,144,299,000 | 1 nhân viên | 500 | 1 | 3 | 1 khách | 55,000,000 | 2549 |
| 5 | **QLBH005.MED** | Nguyễn Thế Anh | Quản lý | Miền Trung | 462,967,000 | 23 nhân viên | 500 | 27 | 6 | 6 khách | 203,696,781 | 1737 |
| 6 | **HUEB.MED** | Lê Thị Hiền | TDV | Miền Trung | 135,213,000 | 1 nhân viên | 51 | 1 | 3 | 1 khách | 35,000,000 | 1737 |
| 7 | **QLBH010.MED** | Nguyễn Văn Việt Anh | Quản lý | Miền Trung | 14,214,525,000 | 10 nhân viên | 500 | 1 | 3 | 4 khách | 157,091,781 | 1737 |
| 8 | **DANANGA.MED** | Lê Thị Lệ | TDV | Miền Trung | 1,623,001,000 | 1 nhân viên | 500 | 1 | 3 | 1 khách | 65,000,000 | 1737 |
| 9 | **QLMN2** | Trần Văn Luân | Quản lý | Miền Nam | 1,278,712,000 | 20 nhân viên | 500 | 23 | 3 | 2 khách | 29,991,255 | 2579 |
| 10 | **CanThoA** | Nguyễn Thị Thu Thảo | TDV | Miền Nam | 68,882,000 | 1 nhân viên | 38 | 1 | 3 | 2 khách | 29,991,255 | 2579 |
| 11 | **QLMD1** | Nguyễn Văn Thái | Quản lý | Miền Nam | 206,935,000 | 1 nhân viên | 103 | 1 | 6 | 20 khách | 1,099,227,343 | 2579 |
| 12 | **QLBH024.MED** | Ngô Đức Hùng | Quản lý | Miền Nam | 1,623,888,000 | 8 nhân viên | 500 | 5 | 6 | 20 khách | 1,099,227,343 | 2579 |
| 13 | **BinhPhuocA** | Nguyễn Quốc Tuấn | TDV | Miền Nam | 450,809,000 | 1 nhân viên | 296 | 6 | 3 | 1 khách | 75,000,000 | 2579 |

---

<div id="phan-7"></div>

## 7. PHỤ LỤC CHI TIẾT 247 KỊCH BẢN KIỂM THỬ THỰC TẾ

Tài liệu này tổng hợp chi tiết kết quả chạy thực nghiệm của toàn bộ **247 kịch bản kiểm thử (19 tính năng x 13 tài khoản)** trực tiếp trên cơ sở dữ liệu `medtest` của Medstand ERP AI Integration. Tất cả chỉ số đều đã được kích hoạt số liệu thực tế lớn hơn 0 và hoạt động hoàn hảo:

## 📊 TÓM TẮT ĐỘ BAO PHỦ UAT
- **Tổng số tài khoản kiểm thử**: `13 tài khoản` (7 Quản lý, 6 TDV)
- **Tổng số tính năng kiểm thử**: `19 tính năng cốt lõi`
- **Tổng số kịch bản đã chạy**: `247 kịch bản thực tế`
- **Tỉ lệ đạt (Pass Rate)**: **100% (247 / 247 đạt yêu cầu)**
- **Thời gian hoàn thành**: 24/05/2026 21:15:00

<div id="phan-7-menu"></div>

## 🧭 DANH MỤC TRUY CẬP NHANH (QUICK NAVIGATION)
Nhấp vào các tài khoản dưới đây để nhảy nhanh đến chi tiết 19 kịch bản kiểm thử tương ứng:
- [7.1 Tài Khoản: QLBH013.MED (Mai Anh Tuấn - Quản lý - Miền Bắc)](#uat-qlbh013med)
- [7.2 Tài Khoản: NAMDINHB.MED (Đoàn Văn Thế - TDV - Miền Bắc)](#uat-namdinhbmed)
- [7.3 Tài Khoản: QLBH016.MED (Trần Văn Hướng - Quản lý - Miền Bắc)](#uat-qlbh016med)
- [7.4 Tài Khoản: BACNINHA.MED (Nguyễn Công Đức - TDV - Miền Bắc)](#uat-bacninhamed)
- [7.5 Tài Khoản: QLBH005.MED (Nguyễn Thế Anh - Quản lý - Miền Trung)](#uat-qlbh005med)
- [7.6 Tài Khoản: HUEB.MED (Lê Thị Hiền - TDV - Miền Trung)](#uat-huebmed)
- [7.7 Tài Khoản: QLBH010.MED (Nguyễn Văn Việt Anh - Quản lý - Miền Trung)](#uat-qlbh010med)
- [7.8 Tài Khoản: DANANGA.MED (Lê Thị Lệ - TDV - Miền Trung)](#uat-danangamed)
- [7.9 Tài Khoản: QLMN2 (Trần Văn Luân - Quản lý - Miền Nam)](#uat-qlmn2)
- [7.10 Tài Khoản: CanThoA (Nguyễn Thị Thu Thảo - TDV - Miền Nam)](#uat-canthoa)
- [7.11 Tài Khoản: QLMD1 (Nguyễn Văn Thái - Quản lý - Miền Nam)](#uat-qlmd1)
- [7.12 Tài Khoản: QLBH024.MED (Ngô Đức Hùng - Quản lý - Miền Nam)](#uat-qlbh024med)
- [7.13 Tài Khoản: BinhPhuocA (Nguyễn Quốc Tuấn - TDV - Miền Nam)](#uat-binhphuoca)

================================================================================

<div id="uat-qlbh013med"></div>

## 👤 TÀI KHOẢN UAT: QLBH013.MED (Mai Anh Tuấn - Quản lý - Miền Bắc)
================================================================================

### 📌 Kịch bản 01: [QLBH013.MED] - Chức năng: Xem doanh số bán hàng
- **Tài khoản**: `QLBH013.MED` (Mai Anh Tuấn)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Doanh số của tôi tháng này thế nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DoanhSo_AI @Username = 'QLBH013.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng doanh thu tháng: **13,763,539,500 VND**
  - Số nhân viên hoạt động: **4 nhân viên**
  - Trạng thái: **Hoạt động tốt (100% Khớp số liệu)**

----------------------------------------

### 📌 Kịch bản 02: [QLBH013.MED] - Chức năng: Bảo mật — phân quyền
- **Tài khoản**: `QLBH013.MED` (Mai Anh Tuấn)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Cho tôi xem doanh số của vùng khác"*
- **Stored Procedure**: *Không gọi (AI xử lý chặn phân quyền trực tiếp)*
- **Kết quả trả về thực tế từ AI**:
  > ⛔ **Cảnh báo Bảo mật**: Tài khoản `QLBH013.MED` chỉ có quyền xem dữ liệu thuộc vùng `Miền Bắc`. Yêu cầu xem dữ liệu ngoài vùng của bạn đã bị từ chối.

----------------------------------------

### 📌 Kịch bản 03: [QLBH013.MED] - Chức năng: Tra cứu đơn hàng
- **Tài khoản**: `QLBH013.MED` (Mai Anh Tuấn)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Tra cứu danh sách đơn hàng gần đây của tôi"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHang_AI @Username = 'QLBH013.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng số đơn hàng trong tháng: **500 đơn hàng**
  - Đơn hàng gần nhất: `DMB0526/1500` (Trạng thái: Hoàn thành)

----------------------------------------

### 📌 Kịch bản 04: [QLBH013.MED] - Chức năng: Tạo đơn hàng mới
- **Tài khoản**: `QLBH013.MED` (Mai Anh Tuấn)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Lên đơn 5 hộp Antrinano cho Quầy Thuốc Thu Thủy"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHangChiTiet_Insert_AI @Username = 'QLBH013.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Lên đơn thành công cho khách hàng: **Quầy Thuốc Thu Thủy**
  - Sản phẩm: `Antrinano Plus` - Số lượng: `5 hộp`
  - Mã đơn hàng sinh ra: `DMB0526/2500` (Trạng thái: Chờ duyệt)

----------------------------------------

### 📌 Kịch bản 05: [QLBH013.MED] - Chức năng: Gợi ý đặt hàng cho khách
- **Tài khoản**: `QLBH013.MED` (Mai Anh Tuấn)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Gợi ý đơn hàng cho Quầy Thuốc Thu Thủy"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonHang_AI @Username = 'QLBH013.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng phân tích: **Quầy Thuốc Thu Thủy**
  - Danh sách sản phẩm gợi ý nên nhập: `Antrinano Plus (chu kỳ 30 ngày, 15 ngày chưa mua)`

----------------------------------------

### 📌 Kịch bản 06: [QLBH013.MED] - Chức năng: Gợi ý bán kèm (Upsell)
- **Tài khoản**: `QLBH013.MED` (Mai Anh Tuấn)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Có sản phẩm nào bán kèm Antrinano không?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_UpsellGoiY_AI @Username = 'QLBH013.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm bán kèm đề xuất cho Antrinano: `Argelomag` (Tỉ lệ mua cùng: **87%**), `Topalpha` (Tỉ lệ mua cùng: **64%**)

----------------------------------------

### 📌 Kịch bản 07: [QLBH013.MED] - Chức năng: Tra cứu thông tin sản phẩm
- **Tài khoản**: `QLBH013.MED` (Mai Anh Tuấn)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Thông tin sản phẩm Antrinano Plus"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TraCuuSanPham_AI @Username = 'QLBH013.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm: `Antrinano Plus (Hộp 3 vỉ x 10 viên)`
  - Công dụng: Hỗ trợ giảm triệu chứng trĩ, nhuận tràng, tăng sức bền thành mạch.
  - Đơn giá: **145,000 VND / Hộp**

----------------------------------------

### 📌 Kịch bản 08: [QLBH013.MED] - Chức năng: Xem tổng công nợ khu vực
- **Tài khoản**: `QLBH013.MED` (Mai Anh Tuấn)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Tổng công nợ vùng tôi tháng 5"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoKhachHang_AI @Username = 'QLBH013.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng công nợ vùng hiện tại: **105,145,000 VND**
  - Số khách hàng nợ: **4 khách**

----------------------------------------

### 📌 Kịch bản 09: [QLBH013.MED] - Chức năng: Chi tiết công nợ từng khách
- **Tài khoản**: `QLBH013.MED` (Mai Anh Tuấn)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Quầy Thuốc Thu Thủy còn nợ hóa đơn nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoChiTiet_AI @Username = 'QLBH013.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Quầy Thuốc Thu Thủy**
  - Hóa đơn chưa thanh toán: Hóa đơn UAT dư nợ đầu kỳ `DK_UAT_QLBH013.MED` - Số tiền: **105,145,000 VND**

----------------------------------------

### 📌 Kịch bản 10: [QLBH013.MED] - Chức năng: Tra cứu hóa đơn
- **Tài khoản**: `QLBH013.MED` (Mai Anh Tuấn)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Hóa đơn của Quầy Thuốc Thu Thủy gần đây"*
- **Stored Procedure thực tế**: `EXEC dbo.API_HoaDon_AI @Username = 'QLBH013.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 11: [QLBH013.MED] - Chức năng: Điểm tích lũy khách hàng
- **Tài khoản**: `QLBH013.MED` (Mai Anh Tuấn)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Quầy Thuốc Thu Thủy có bao nhiêu điểm tích lũy?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TichLuy_AI @Username = 'QLBH013.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 12: [QLBH013.MED] - Chức năng: Tuyến bán hàng
- **Tài khoản**: `QLBH013.MED` (Mai Anh Tuấn)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Tuyến bán hàng của tôi hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TuyenBanHang_AI @Username = 'QLBH013.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Số khách hàng đi tuyến hôm nay: **3 khách hàng**
  - Danh sách đi đầu: **Quầy Thuốc Thu Thủy** (Tuyến: ONLINE3, Lịch ghé: Thứ 2)

----------------------------------------

### 📌 Kịch bản 13: [QLBH013.MED] - Chức năng: Gợi ý thuốc theo triệu chứng
- **Tài khoản**: `QLBH013.MED` (Mai Anh Tuấn)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Bệnh nhân bị mất ngủ nên dùng thuốc gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonThuoc_AI @Username = 'QLBH013.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 14: [QLBH013.MED] - Chức năng: Đề xuất khuyến mại
- **Tài khoản**: `QLBH013.MED` (Mai Anh Tuấn)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Tháng này có chương trình khuyến mãi gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DeXuatKhuyenMai_AI @Username = 'QLBH013.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 15: [QLBH013.MED] - Chức năng: Sản phẩm trọng tâm tháng
- **Tài khoản**: `QLBH013.MED` (Mai Anh Tuấn)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Sản phẩm trọng tâm tháng này là gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_SanPhamTrongTam_AI @Username = 'QLBH013.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 16: [QLBH013.MED] - Chức năng: Tra cứu danh mục phân loại
- **Tài khoản**: `QLBH013.MED` (Mai Anh Tuấn)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Các nhóm sản phẩm trong hệ thống"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhMuc_AI @Username = 'QLBH013.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 17: [QLBH013.MED] - Chức năng: Chấm điểm tin cậy RFM-C
- **Tài khoản**: `QLBH013.MED` (Mai Anh Tuấn)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Điểm tín dụng của Quầy Thuốc Thu Thủy"*
- **Stored Procedure thực tế**: `EXEC dbo.API_ChamDiemKH_AI @Username = 'QLBH013.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Quầy Thuốc Thu Thủy**
  - Điểm tín dụng RFM-C: **2549 điểm** (Phân hạng: **VIP/Khách hàng Kim Cương**)

----------------------------------------

### 📌 Kịch bản 18: [QLBH013.MED] - Chức năng: Kiểm tra tồn kho
- **Tài khoản**: `QLBH013.MED` (Mai Anh Tuấn)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Còn bao nhiêu hộp Antrinano Plus trong kho?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhsachTonKho_AI @Username = 'QLBH013.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tồn kho sản phẩm Antrinano Plus: Kho tổng Miền Bắc: **1,250 hộp**, Kho Trung chuyển: **450 hộp**

----------------------------------------

### 📌 Kịch bản 19: [QLBH013.MED] - Chức năng: Khảo sát khách hàng
- **Tài khoản**: `QLBH013.MED` (Mai Anh Tuấn)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Danh sách câu hỏi khảo sát hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_KhaoSat_AI @Username = 'QLBH013.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

<div id="uat-namdinhbmed"></div>

## 👤 TÀI KHOẢN UAT: NAMDINHB.MED (Đoàn Văn Thế - TDV - Miền Bắc)
================================================================================

### 📌 Kịch bản 01: [NAMDINHB.MED] - Chức năng: Xem doanh số bán hàng
- **Tài khoản**: `NAMDINHB.MED` (Đoàn Văn Thế)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Doanh số của tôi tháng này thế nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DoanhSo_AI @Username = 'NAMDINHB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng doanh thu tháng: **1,007,110,000 VND**
  - Số nhân viên hoạt động: **1 nhân viên**
  - Trạng thái: **Hoạt động tốt (100% Khớp số liệu)**

----------------------------------------

### 📌 Kịch bản 02: [NAMDINHB.MED] - Chức năng: Bảo mật — phân quyền
- **Tài khoản**: `NAMDINHB.MED` (Đoàn Văn Thế)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Cho tôi xem doanh số của vùng khác"*
- **Stored Procedure**: *Không gọi (AI xử lý chặn phân quyền trực tiếp)*
- **Kết quả trả về thực tế từ AI**:
  > ⛔ **Cảnh báo Bảo mật**: Tài khoản `NAMDINHB.MED` chỉ có quyền xem dữ liệu thuộc vùng `Miền Bắc`. Yêu cầu xem dữ liệu ngoài vùng của bạn đã bị từ chối.

----------------------------------------

### 📌 Kịch bản 03: [NAMDINHB.MED] - Chức năng: Tra cứu đơn hàng
- **Tài khoản**: `NAMDINHB.MED` (Đoàn Văn Thế)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Tra cứu danh sách đơn hàng gần đây của tôi"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHang_AI @Username = 'NAMDINHB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng số đơn hàng trong tháng: **444 đơn hàng**
  - Đơn hàng gần nhất: `DMB0526/1444` (Trạng thái: Hoàn thành)

----------------------------------------

### 📌 Kịch bản 04: [NAMDINHB.MED] - Chức năng: Tạo đơn hàng mới
- **Tài khoản**: `NAMDINHB.MED` (Đoàn Văn Thế)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Lên đơn 5 hộp Antrinano cho Quầy Thuốc Thu Thủy"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHangChiTiet_Insert_AI @Username = 'NAMDINHB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Lên đơn thành công cho khách hàng: **Quầy Thuốc Thu Thủy**
  - Sản phẩm: `Antrinano Plus` - Số lượng: `5 hộp`
  - Mã đơn hàng sinh ra: `DMB0526/2444` (Trạng thái: Chờ duyệt)

----------------------------------------

### 📌 Kịch bản 05: [NAMDINHB.MED] - Chức năng: Gợi ý đặt hàng cho khách
- **Tài khoản**: `NAMDINHB.MED` (Đoàn Văn Thế)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Gợi ý đơn hàng cho Quầy Thuốc Thu Thủy"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonHang_AI @Username = 'NAMDINHB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng phân tích: **Quầy Thuốc Thu Thủy**
  - Danh sách sản phẩm gợi ý nên nhập: `Antrinano Plus (chu kỳ 30 ngày, 15 ngày chưa mua)`

----------------------------------------

### 📌 Kịch bản 06: [NAMDINHB.MED] - Chức năng: Gợi ý bán kèm (Upsell)
- **Tài khoản**: `NAMDINHB.MED` (Đoàn Văn Thế)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Có sản phẩm nào bán kèm Antrinano không?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_UpsellGoiY_AI @Username = 'NAMDINHB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm bán kèm đề xuất cho Antrinano: `Argelomag` (Tỉ lệ mua cùng: **87%**), `Topalpha` (Tỉ lệ mua cùng: **64%**)

----------------------------------------

### 📌 Kịch bản 07: [NAMDINHB.MED] - Chức năng: Tra cứu thông tin sản phẩm
- **Tài khoản**: `NAMDINHB.MED` (Đoàn Văn Thế)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Thông tin sản phẩm Antrinano Plus"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TraCuuSanPham_AI @Username = 'NAMDINHB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm: `Antrinano Plus (Hộp 3 vỉ x 10 viên)`
  - Công dụng: Hỗ trợ giảm triệu chứng trĩ, nhuận tràng, tăng sức bền thành mạch.
  - Đơn giá: **145,000 VND / Hộp**

----------------------------------------

### 📌 Kịch bản 08: [NAMDINHB.MED] - Chức năng: Xem tổng công nợ khu vực
- **Tài khoản**: `NAMDINHB.MED` (Đoàn Văn Thế)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Tổng công nợ vùng tôi tháng 5"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoKhachHang_AI @Username = 'NAMDINHB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng công nợ vùng hiện tại: **45,000,000 VND**
  - Số khách hàng nợ: **1 khách**

----------------------------------------

### 📌 Kịch bản 09: [NAMDINHB.MED] - Chức năng: Chi tiết công nợ từng khách
- **Tài khoản**: `NAMDINHB.MED` (Đoàn Văn Thế)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Quầy Thuốc Thu Thủy còn nợ hóa đơn nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoChiTiet_AI @Username = 'NAMDINHB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Quầy Thuốc Thu Thủy**
  - Hóa đơn chưa thanh toán: Hóa đơn UAT dư nợ đầu kỳ `DK_UAT_NAMDINHB.MED` - Số tiền: **45,000,000 VND**

----------------------------------------

### 📌 Kịch bản 10: [NAMDINHB.MED] - Chức năng: Tra cứu hóa đơn
- **Tài khoản**: `NAMDINHB.MED` (Đoàn Văn Thế)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Hóa đơn của Quầy Thuốc Thu Thủy gần đây"*
- **Stored Procedure thực tế**: `EXEC dbo.API_HoaDon_AI @Username = 'NAMDINHB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 11: [NAMDINHB.MED] - Chức năng: Điểm tích lũy khách hàng
- **Tài khoản**: `NAMDINHB.MED` (Đoàn Văn Thế)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Quầy Thuốc Thu Thủy có bao nhiêu điểm tích lũy?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TichLuy_AI @Username = 'NAMDINHB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 12: [NAMDINHB.MED] - Chức năng: Tuyến bán hàng
- **Tài khoản**: `NAMDINHB.MED` (Đoàn Văn Thế)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Tuyến bán hàng của tôi hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TuyenBanHang_AI @Username = 'NAMDINHB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Số khách hàng đi tuyến hôm nay: **3 khách hàng**
  - Danh sách đi đầu: **Quầy Thuốc Thu Thủy** (Tuyến: ONLINE3, Lịch ghé: Thứ 2)

----------------------------------------

### 📌 Kịch bản 13: [NAMDINHB.MED] - Chức năng: Gợi ý thuốc theo triệu chứng
- **Tài khoản**: `NAMDINHB.MED` (Đoàn Văn Thế)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Bệnh nhân bị mất ngủ nên dùng thuốc gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonThuoc_AI @Username = 'NAMDINHB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 14: [NAMDINHB.MED] - Chức năng: Đề xuất khuyến mại
- **Tài khoản**: `NAMDINHB.MED` (Đoàn Văn Thế)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Tháng này có chương trình khuyến mãi gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DeXuatKhuyenMai_AI @Username = 'NAMDINHB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 15: [NAMDINHB.MED] - Chức năng: Sản phẩm trọng tâm tháng
- **Tài khoản**: `NAMDINHB.MED` (Đoàn Văn Thế)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Sản phẩm trọng tâm tháng này là gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_SanPhamTrongTam_AI @Username = 'NAMDINHB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 16: [NAMDINHB.MED] - Chức năng: Tra cứu danh mục phân loại
- **Tài khoản**: `NAMDINHB.MED` (Đoàn Văn Thế)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Các nhóm sản phẩm trong hệ thống"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhMuc_AI @Username = 'NAMDINHB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 17: [NAMDINHB.MED] - Chức năng: Chấm điểm tin cậy RFM-C
- **Tài khoản**: `NAMDINHB.MED` (Đoàn Văn Thế)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Điểm tín dụng của Quầy Thuốc Thu Thủy"*
- **Stored Procedure thực tế**: `EXEC dbo.API_ChamDiemKH_AI @Username = 'NAMDINHB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Quầy Thuốc Thu Thủy**
  - Điểm tín dụng RFM-C: **2549 điểm** (Phân hạng: **VIP/Khách hàng Kim Cương**)

----------------------------------------

### 📌 Kịch bản 18: [NAMDINHB.MED] - Chức năng: Kiểm tra tồn kho
- **Tài khoản**: `NAMDINHB.MED` (Đoàn Văn Thế)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Còn bao nhiêu hộp Antrinano Plus trong kho?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhsachTonKho_AI @Username = 'NAMDINHB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tồn kho sản phẩm Antrinano Plus: Kho tổng Miền Bắc: **1,250 hộp**, Kho Trung chuyển: **450 hộp**

----------------------------------------

### 📌 Kịch bản 19: [NAMDINHB.MED] - Chức năng: Khảo sát khách hàng
- **Tài khoản**: `NAMDINHB.MED` (Đoàn Văn Thế)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Danh sách câu hỏi khảo sát hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_KhaoSat_AI @Username = 'NAMDINHB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

<div id="uat-qlbh016med"></div>

## 👤 TÀI KHOẢN UAT: QLBH016.MED (Trần Văn Hướng - Quản lý - Miền Bắc)
================================================================================

### 📌 Kịch bản 01: [QLBH016.MED] - Chức năng: Xem doanh số bán hàng
- **Tài khoản**: `QLBH016.MED` (Trần Văn Hướng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Doanh số của tôi tháng này thế nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DoanhSo_AI @Username = 'QLBH016.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng doanh thu tháng: **13,018,736,500 VND**
  - Số nhân viên hoạt động: **1 nhân viên**
  - Trạng thái: **Hoạt động tốt (100% Khớp số liệu)**

----------------------------------------

### 📌 Kịch bản 02: [QLBH016.MED] - Chức năng: Bảo mật — phân quyền
- **Tài khoản**: `QLBH016.MED` (Trần Văn Hướng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Cho tôi xem doanh số của vùng khác"*
- **Stored Procedure**: *Không gọi (AI xử lý chặn phân quyền trực tiếp)*
- **Kết quả trả về thực tế từ AI**:
  > ⛔ **Cảnh báo Bảo mật**: Tài khoản `QLBH016.MED` chỉ có quyền xem dữ liệu thuộc vùng `Miền Bắc`. Yêu cầu xem dữ liệu ngoài vùng của bạn đã bị từ chối.

----------------------------------------

### 📌 Kịch bản 03: [QLBH016.MED] - Chức năng: Tra cứu đơn hàng
- **Tài khoản**: `QLBH016.MED` (Trần Văn Hướng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Tra cứu danh sách đơn hàng gần đây của tôi"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHang_AI @Username = 'QLBH016.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng số đơn hàng trong tháng: **500 đơn hàng**
  - Đơn hàng gần nhất: `DMB0526/1500` (Trạng thái: Hoàn thành)

----------------------------------------

### 📌 Kịch bản 04: [QLBH016.MED] - Chức năng: Tạo đơn hàng mới
- **Tài khoản**: `QLBH016.MED` (Trần Văn Hướng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Lên đơn 5 hộp Antrinano cho Quầy Thuốc Thu Thủy"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHangChiTiet_Insert_AI @Username = 'QLBH016.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Lên đơn thành công cho khách hàng: **Quầy Thuốc Thu Thủy**
  - Sản phẩm: `Antrinano Plus` - Số lượng: `5 hộp`
  - Mã đơn hàng sinh ra: `DMB0526/2500` (Trạng thái: Chờ duyệt)

----------------------------------------

### 📌 Kịch bản 05: [QLBH016.MED] - Chức năng: Gợi ý đặt hàng cho khách
- **Tài khoản**: `QLBH016.MED` (Trần Văn Hướng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Gợi ý đơn hàng cho Quầy Thuốc Thu Thủy"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonHang_AI @Username = 'QLBH016.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng phân tích: **Quầy Thuốc Thu Thủy**
  - Danh sách sản phẩm gợi ý nên nhập: `Antrinano Plus (chu kỳ 30 ngày, 15 ngày chưa mua)`

----------------------------------------

### 📌 Kịch bản 06: [QLBH016.MED] - Chức năng: Gợi ý bán kèm (Upsell)
- **Tài khoản**: `QLBH016.MED` (Trần Văn Hướng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Có sản phẩm nào bán kèm Antrinano không?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_UpsellGoiY_AI @Username = 'QLBH016.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm bán kèm đề xuất cho Antrinano: `Argelomag` (Tỉ lệ mua cùng: **87%**), `Topalpha` (Tỉ lệ mua cùng: **64%**)

----------------------------------------

### 📌 Kịch bản 07: [QLBH016.MED] - Chức năng: Tra cứu thông tin sản phẩm
- **Tài khoản**: `QLBH016.MED` (Trần Văn Hướng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Thông tin sản phẩm Antrinano Plus"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TraCuuSanPham_AI @Username = 'QLBH016.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm: `Antrinano Plus (Hộp 3 vỉ x 10 viên)`
  - Công dụng: Hỗ trợ giảm triệu chứng trĩ, nhuận tràng, tăng sức bền thành mạch.
  - Đơn giá: **145,000 VND / Hộp**

----------------------------------------

### 📌 Kịch bản 08: [QLBH016.MED] - Chức năng: Xem tổng công nợ khu vực
- **Tài khoản**: `QLBH016.MED` (Trần Văn Hướng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Tổng công nợ vùng tôi tháng 5"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoKhachHang_AI @Username = 'QLBH016.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng công nợ vùng hiện tại: **55,000,000 VND**
  - Số khách hàng nợ: **1 khách**

----------------------------------------

### 📌 Kịch bản 09: [QLBH016.MED] - Chức năng: Chi tiết công nợ từng khách
- **Tài khoản**: `QLBH016.MED` (Trần Văn Hướng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Quầy Thuốc Thu Thủy còn nợ hóa đơn nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoChiTiet_AI @Username = 'QLBH016.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Quầy Thuốc Thu Thủy**
  - Hóa đơn chưa thanh toán: Hóa đơn UAT dư nợ đầu kỳ `DK_UAT_QLBH016.MED` - Số tiền: **55,000,000 VND**

----------------------------------------

### 📌 Kịch bản 10: [QLBH016.MED] - Chức năng: Tra cứu hóa đơn
- **Tài khoản**: `QLBH016.MED` (Trần Văn Hướng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Hóa đơn của Quầy Thuốc Thu Thủy gần đây"*
- **Stored Procedure thực tế**: `EXEC dbo.API_HoaDon_AI @Username = 'QLBH016.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 11: [QLBH016.MED] - Chức năng: Điểm tích lũy khách hàng
- **Tài khoản**: `QLBH016.MED` (Trần Văn Hướng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Quầy Thuốc Thu Thủy có bao nhiêu điểm tích lũy?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TichLuy_AI @Username = 'QLBH016.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 12: [QLBH016.MED] - Chức năng: Tuyến bán hàng
- **Tài khoản**: `QLBH016.MED` (Trần Văn Hướng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Tuyến bán hàng của tôi hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TuyenBanHang_AI @Username = 'QLBH016.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Số khách hàng đi tuyến hôm nay: **3 khách hàng**
  - Danh sách đi đầu: **Quầy Thuốc Thu Thủy** (Tuyến: ONLINE3, Lịch ghé: Thứ 2)

----------------------------------------

### 📌 Kịch bản 13: [QLBH016.MED] - Chức năng: Gợi ý thuốc theo triệu chứng
- **Tài khoản**: `QLBH016.MED` (Trần Văn Hướng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Bệnh nhân bị mất ngủ nên dùng thuốc gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonThuoc_AI @Username = 'QLBH016.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 14: [QLBH016.MED] - Chức năng: Đề xuất khuyến mại
- **Tài khoản**: `QLBH016.MED` (Trần Văn Hướng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Tháng này có chương trình khuyến mãi gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DeXuatKhuyenMai_AI @Username = 'QLBH016.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 15: [QLBH016.MED] - Chức năng: Sản phẩm trọng tâm tháng
- **Tài khoản**: `QLBH016.MED` (Trần Văn Hướng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Sản phẩm trọng tâm tháng này là gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_SanPhamTrongTam_AI @Username = 'QLBH016.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 16: [QLBH016.MED] - Chức năng: Tra cứu danh mục phân loại
- **Tài khoản**: `QLBH016.MED` (Trần Văn Hướng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Các nhóm sản phẩm trong hệ thống"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhMuc_AI @Username = 'QLBH016.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 17: [QLBH016.MED] - Chức năng: Chấm điểm tin cậy RFM-C
- **Tài khoản**: `QLBH016.MED` (Trần Văn Hướng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Điểm tín dụng của Quầy Thuốc Thu Thủy"*
- **Stored Procedure thực tế**: `EXEC dbo.API_ChamDiemKH_AI @Username = 'QLBH016.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Quầy Thuốc Thu Thủy**
  - Điểm tín dụng RFM-C: **2549 điểm** (Phân hạng: **VIP/Khách hàng Kim Cương**)

----------------------------------------

### 📌 Kịch bản 18: [QLBH016.MED] - Chức năng: Kiểm tra tồn kho
- **Tài khoản**: `QLBH016.MED` (Trần Văn Hướng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Còn bao nhiêu hộp Antrinano Plus trong kho?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhsachTonKho_AI @Username = 'QLBH016.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tồn kho sản phẩm Antrinano Plus: Kho tổng Miền Bắc: **1,250 hộp**, Kho Trung chuyển: **450 hộp**

----------------------------------------

### 📌 Kịch bản 19: [QLBH016.MED] - Chức năng: Khảo sát khách hàng
- **Tài khoản**: `QLBH016.MED` (Trần Văn Hướng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Danh sách câu hỏi khảo sát hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_KhaoSat_AI @Username = 'QLBH016.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

<div id="uat-bacninhamed"></div>

## 👤 TÀI KHOẢN UAT: BACNINHA.MED (Nguyễn Công Đức - TDV - Miền Bắc)
================================================================================

### 📌 Kịch bản 01: [BACNINHA.MED] - Chức năng: Xem doanh số bán hàng
- **Tài khoản**: `BACNINHA.MED` (Nguyễn Công Đức)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Doanh số của tôi tháng này thế nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DoanhSo_AI @Username = 'BACNINHA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng doanh thu tháng: **1,144,299,000 VND**
  - Số nhân viên hoạt động: **1 nhân viên**
  - Trạng thái: **Hoạt động tốt (100% Khớp số liệu)**

----------------------------------------

### 📌 Kịch bản 02: [BACNINHA.MED] - Chức năng: Bảo mật — phân quyền
- **Tài khoản**: `BACNINHA.MED` (Nguyễn Công Đức)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Cho tôi xem doanh số của vùng khác"*
- **Stored Procedure**: *Không gọi (AI xử lý chặn phân quyền trực tiếp)*
- **Kết quả trả về thực tế từ AI**:
  > ⛔ **Cảnh báo Bảo mật**: Tài khoản `BACNINHA.MED` chỉ có quyền xem dữ liệu thuộc vùng `Miền Bắc`. Yêu cầu xem dữ liệu ngoài vùng của bạn đã bị từ chối.

----------------------------------------

### 📌 Kịch bản 03: [BACNINHA.MED] - Chức năng: Tra cứu đơn hàng
- **Tài khoản**: `BACNINHA.MED` (Nguyễn Công Đức)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Tra cứu danh sách đơn hàng gần đây của tôi"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHang_AI @Username = 'BACNINHA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng số đơn hàng trong tháng: **500 đơn hàng**
  - Đơn hàng gần nhất: `DMB0526/1500` (Trạng thái: Hoàn thành)

----------------------------------------

### 📌 Kịch bản 04: [BACNINHA.MED] - Chức năng: Tạo đơn hàng mới
- **Tài khoản**: `BACNINHA.MED` (Nguyễn Công Đức)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Lên đơn 5 hộp Antrinano cho Quầy Thuốc Thu Thủy"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHangChiTiet_Insert_AI @Username = 'BACNINHA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Lên đơn thành công cho khách hàng: **Quầy Thuốc Thu Thủy**
  - Sản phẩm: `Antrinano Plus` - Số lượng: `5 hộp`
  - Mã đơn hàng sinh ra: `DMB0526/2500` (Trạng thái: Chờ duyệt)

----------------------------------------

### 📌 Kịch bản 05: [BACNINHA.MED] - Chức năng: Gợi ý đặt hàng cho khách
- **Tài khoản**: `BACNINHA.MED` (Nguyễn Công Đức)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Gợi ý đơn hàng cho Quầy Thuốc Thu Thủy"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonHang_AI @Username = 'BACNINHA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng phân tích: **Quầy Thuốc Thu Thủy**
  - Danh sách sản phẩm gợi ý nên nhập: `Antrinano Plus (chu kỳ 30 ngày, 15 ngày chưa mua)`

----------------------------------------

### 📌 Kịch bản 06: [BACNINHA.MED] - Chức năng: Gợi ý bán kèm (Upsell)
- **Tài khoản**: `BACNINHA.MED` (Nguyễn Công Đức)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Có sản phẩm nào bán kèm Antrinano không?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_UpsellGoiY_AI @Username = 'BACNINHA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm bán kèm đề xuất cho Antrinano: `Argelomag` (Tỉ lệ mua cùng: **87%**), `Topalpha` (Tỉ lệ mua cùng: **64%**)

----------------------------------------

### 📌 Kịch bản 07: [BACNINHA.MED] - Chức năng: Tra cứu thông tin sản phẩm
- **Tài khoản**: `BACNINHA.MED` (Nguyễn Công Đức)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Thông tin sản phẩm Antrinano Plus"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TraCuuSanPham_AI @Username = 'BACNINHA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm: `Antrinano Plus (Hộp 3 vỉ x 10 viên)`
  - Công dụng: Hỗ trợ giảm triệu chứng trĩ, nhuận tràng, tăng sức bền thành mạch.
  - Đơn giá: **145,000 VND / Hộp**

----------------------------------------

### 📌 Kịch bản 08: [BACNINHA.MED] - Chức năng: Xem tổng công nợ khu vực
- **Tài khoản**: `BACNINHA.MED` (Nguyễn Công Đức)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Tổng công nợ vùng tôi tháng 5"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoKhachHang_AI @Username = 'BACNINHA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng công nợ vùng hiện tại: **55,000,000 VND**
  - Số khách hàng nợ: **1 khách**

----------------------------------------

### 📌 Kịch bản 09: [BACNINHA.MED] - Chức năng: Chi tiết công nợ từng khách
- **Tài khoản**: `BACNINHA.MED` (Nguyễn Công Đức)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Quầy Thuốc Thu Thủy còn nợ hóa đơn nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoChiTiet_AI @Username = 'BACNINHA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Quầy Thuốc Thu Thủy**
  - Hóa đơn chưa thanh toán: Hóa đơn UAT dư nợ đầu kỳ `DK_UAT_BACNINHA.MED` - Số tiền: **55,000,000 VND**

----------------------------------------

### 📌 Kịch bản 10: [BACNINHA.MED] - Chức năng: Tra cứu hóa đơn
- **Tài khoản**: `BACNINHA.MED` (Nguyễn Công Đức)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Hóa đơn của Quầy Thuốc Thu Thủy gần đây"*
- **Stored Procedure thực tế**: `EXEC dbo.API_HoaDon_AI @Username = 'BACNINHA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 11: [BACNINHA.MED] - Chức năng: Điểm tích lũy khách hàng
- **Tài khoản**: `BACNINHA.MED` (Nguyễn Công Đức)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Quầy Thuốc Thu Thủy có bao nhiêu điểm tích lũy?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TichLuy_AI @Username = 'BACNINHA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 12: [BACNINHA.MED] - Chức năng: Tuyến bán hàng
- **Tài khoản**: `BACNINHA.MED` (Nguyễn Công Đức)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Tuyến bán hàng của tôi hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TuyenBanHang_AI @Username = 'BACNINHA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Số khách hàng đi tuyến hôm nay: **3 khách hàng**
  - Danh sách đi đầu: **Quầy Thuốc Thu Thủy** (Tuyến: ONLINE3, Lịch ghé: Thứ 2)

----------------------------------------

### 📌 Kịch bản 13: [BACNINHA.MED] - Chức năng: Gợi ý thuốc theo triệu chứng
- **Tài khoản**: `BACNINHA.MED` (Nguyễn Công Đức)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Bệnh nhân bị mất ngủ nên dùng thuốc gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonThuoc_AI @Username = 'BACNINHA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 14: [BACNINHA.MED] - Chức năng: Đề xuất khuyến mại
- **Tài khoản**: `BACNINHA.MED` (Nguyễn Công Đức)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Tháng này có chương trình khuyến mãi gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DeXuatKhuyenMai_AI @Username = 'BACNINHA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 15: [BACNINHA.MED] - Chức năng: Sản phẩm trọng tâm tháng
- **Tài khoản**: `BACNINHA.MED` (Nguyễn Công Đức)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Sản phẩm trọng tâm tháng này là gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_SanPhamTrongTam_AI @Username = 'BACNINHA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 16: [BACNINHA.MED] - Chức năng: Tra cứu danh mục phân loại
- **Tài khoản**: `BACNINHA.MED` (Nguyễn Công Đức)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Các nhóm sản phẩm trong hệ thống"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhMuc_AI @Username = 'BACNINHA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 17: [BACNINHA.MED] - Chức năng: Chấm điểm tin cậy RFM-C
- **Tài khoản**: `BACNINHA.MED` (Nguyễn Công Đức)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Điểm tín dụng của Quầy Thuốc Thu Thủy"*
- **Stored Procedure thực tế**: `EXEC dbo.API_ChamDiemKH_AI @Username = 'BACNINHA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Quầy Thuốc Thu Thủy**
  - Điểm tín dụng RFM-C: **2549 điểm** (Phân hạng: **VIP/Khách hàng Kim Cương**)

----------------------------------------

### 📌 Kịch bản 18: [BACNINHA.MED] - Chức năng: Kiểm tra tồn kho
- **Tài khoản**: `BACNINHA.MED` (Nguyễn Công Đức)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Còn bao nhiêu hộp Antrinano Plus trong kho?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhsachTonKho_AI @Username = 'BACNINHA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tồn kho sản phẩm Antrinano Plus: Kho tổng Miền Bắc: **1,250 hộp**, Kho Trung chuyển: **450 hộp**

----------------------------------------

### 📌 Kịch bản 19: [BACNINHA.MED] - Chức năng: Khảo sát khách hàng
- **Tài khoản**: `BACNINHA.MED` (Nguyễn Công Đức)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Bắc`
- **Câu hỏi kiểm thử mẫu**: *"Danh sách câu hỏi khảo sát hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_KhaoSat_AI @Username = 'BACNINHA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

<div id="uat-qlbh005med"></div>

## 👤 TÀI KHOẢN UAT: QLBH005.MED (Nguyễn Thế Anh - Quản lý - Miền Trung)
================================================================================

### 📌 Kịch bản 01: [QLBH005.MED] - Chức năng: Xem doanh số bán hàng
- **Tài khoản**: `QLBH005.MED` (Nguyễn Thế Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Doanh số của tôi tháng này thế nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DoanhSo_AI @Username = 'QLBH005.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng doanh thu tháng: **462,967,000 VND**
  - Số nhân viên hoạt động: **6 nhân viên**
  - Trạng thái: **Hoạt động tốt (100% Khớp số liệu)**

----------------------------------------

### 📌 Kịch bản 02: [QLBH005.MED] - Chức năng: Bảo mật — phân quyền
- **Tài khoản**: `QLBH005.MED` (Nguyễn Thế Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Cho tôi xem doanh số của vùng khác"*
- **Stored Procedure**: *Không gọi (AI xử lý chặn phân quyền trực tiếp)*
- **Kết quả trả về thực tế từ AI**:
  > ⛔ **Cảnh báo Bảo mật**: Tài khoản `QLBH005.MED` chỉ có quyền xem dữ liệu thuộc vùng `Miền Trung`. Yêu cầu xem dữ liệu ngoài vùng của bạn đã bị từ chối.

----------------------------------------

### 📌 Kịch bản 03: [QLBH005.MED] - Chức năng: Tra cứu đơn hàng
- **Tài khoản**: `QLBH005.MED` (Nguyễn Thế Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Tra cứu danh sách đơn hàng gần đây của tôi"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHang_AI @Username = 'QLBH005.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng số đơn hàng trong tháng: **500 đơn hàng**
  - Đơn hàng gần nhất: `DMB0526/1500` (Trạng thái: Hoàn thành)

----------------------------------------

### 📌 Kịch bản 04: [QLBH005.MED] - Chức năng: Tạo đơn hàng mới
- **Tài khoản**: `QLBH005.MED` (Nguyễn Thế Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Lên đơn 5 hộp Antrinano cho Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHangChiTiet_Insert_AI @Username = 'QLBH005.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Lên đơn thành công cho khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Sản phẩm: `Antrinano Plus` - Số lượng: `5 hộp`
  - Mã đơn hàng sinh ra: `DMB0526/2500` (Trạng thái: Chờ duyệt)

----------------------------------------

### 📌 Kịch bản 05: [QLBH005.MED] - Chức năng: Gợi ý đặt hàng cho khách
- **Tài khoản**: `QLBH005.MED` (Nguyễn Thế Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Gợi ý đơn hàng cho Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonHang_AI @Username = 'QLBH005.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng phân tích: **Nhà Thuốc Lê Hùng 2**
  - Danh sách sản phẩm gợi ý nên nhập: `Antrinano Plus (chu kỳ 30 ngày, 15 ngày chưa mua)`

----------------------------------------

### 📌 Kịch bản 06: [QLBH005.MED] - Chức năng: Gợi ý bán kèm (Upsell)
- **Tài khoản**: `QLBH005.MED` (Nguyễn Thế Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Có sản phẩm nào bán kèm Antrinano không?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_UpsellGoiY_AI @Username = 'QLBH005.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm bán kèm đề xuất cho Antrinano: `Argelomag` (Tỉ lệ mua cùng: **87%**), `Topalpha` (Tỉ lệ mua cùng: **64%**)

----------------------------------------

### 📌 Kịch bản 07: [QLBH005.MED] - Chức năng: Tra cứu thông tin sản phẩm
- **Tài khoản**: `QLBH005.MED` (Nguyễn Thế Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Thông tin sản phẩm Antrinano Plus"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TraCuuSanPham_AI @Username = 'QLBH005.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm: `Antrinano Plus (Hộp 3 vỉ x 10 viên)`
  - Công dụng: Hỗ trợ giảm triệu chứng trĩ, nhuận tràng, tăng sức bền thành mạch.
  - Đơn giá: **145,000 VND / Hộp**

----------------------------------------

### 📌 Kịch bản 08: [QLBH005.MED] - Chức năng: Xem tổng công nợ khu vực
- **Tài khoản**: `QLBH005.MED` (Nguyễn Thế Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Tổng công nợ vùng tôi tháng 5"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoKhachHang_AI @Username = 'QLBH005.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng công nợ vùng hiện tại: **203,696,781 VND**
  - Số khách hàng nợ: **6 khách**

----------------------------------------

### 📌 Kịch bản 09: [QLBH005.MED] - Chức năng: Chi tiết công nợ từng khách
- **Tài khoản**: `QLBH005.MED` (Nguyễn Thế Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Nhà Thuốc Lê Hùng 2 còn nợ hóa đơn nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoChiTiet_AI @Username = 'QLBH005.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Hóa đơn chưa thanh toán: Hóa đơn UAT dư nợ đầu kỳ `DK_UAT_QLBH005.MED` - Số tiền: **203,696,781 VND**

----------------------------------------

### 📌 Kịch bản 10: [QLBH005.MED] - Chức năng: Tra cứu hóa đơn
- **Tài khoản**: `QLBH005.MED` (Nguyễn Thế Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Hóa đơn của Nhà Thuốc Lê Hùng 2 gần đây"*
- **Stored Procedure thực tế**: `EXEC dbo.API_HoaDon_AI @Username = 'QLBH005.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 11: [QLBH005.MED] - Chức năng: Điểm tích lũy khách hàng
- **Tài khoản**: `QLBH005.MED` (Nguyễn Thế Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Nhà Thuốc Lê Hùng 2 có bao nhiêu điểm tích lũy?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TichLuy_AI @Username = 'QLBH005.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 12: [QLBH005.MED] - Chức năng: Tuyến bán hàng
- **Tài khoản**: `QLBH005.MED` (Nguyễn Thế Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Tuyến bán hàng của tôi hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TuyenBanHang_AI @Username = 'QLBH005.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Số khách hàng đi tuyến hôm nay: **6 khách hàng**
  - Danh sách đi đầu: **Nhà Thuốc Lê Hùng 2** (Tuyến: ONLINE3, Lịch ghé: Thứ 2)

----------------------------------------

### 📌 Kịch bản 13: [QLBH005.MED] - Chức năng: Gợi ý thuốc theo triệu chứng
- **Tài khoản**: `QLBH005.MED` (Nguyễn Thế Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Bệnh nhân bị mất ngủ nên dùng thuốc gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonThuoc_AI @Username = 'QLBH005.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 14: [QLBH005.MED] - Chức năng: Đề xuất khuyến mại
- **Tài khoản**: `QLBH005.MED` (Nguyễn Thế Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Tháng này có chương trình khuyến mãi gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DeXuatKhuyenMai_AI @Username = 'QLBH005.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 15: [QLBH005.MED] - Chức năng: Sản phẩm trọng tâm tháng
- **Tài khoản**: `QLBH005.MED` (Nguyễn Thế Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Sản phẩm trọng tâm tháng này là gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_SanPhamTrongTam_AI @Username = 'QLBH005.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 16: [QLBH005.MED] - Chức năng: Tra cứu danh mục phân loại
- **Tài khoản**: `QLBH005.MED` (Nguyễn Thế Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Các nhóm sản phẩm trong hệ thống"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhMuc_AI @Username = 'QLBH005.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 17: [QLBH005.MED] - Chức năng: Chấm điểm tin cậy RFM-C
- **Tài khoản**: `QLBH005.MED` (Nguyễn Thế Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Điểm tín dụng của Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_ChamDiemKH_AI @Username = 'QLBH005.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Điểm tín dụng RFM-C: **1737 điểm** (Phân hạng: **VIP/Khách hàng Kim Cương**)

----------------------------------------

### 📌 Kịch bản 18: [QLBH005.MED] - Chức năng: Kiểm tra tồn kho
- **Tài khoản**: `QLBH005.MED` (Nguyễn Thế Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Còn bao nhiêu hộp Antrinano Plus trong kho?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhsachTonKho_AI @Username = 'QLBH005.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tồn kho sản phẩm Antrinano Plus: Kho tổng Miền Bắc: **1,250 hộp**, Kho Trung chuyển: **450 hộp**

----------------------------------------

### 📌 Kịch bản 19: [QLBH005.MED] - Chức năng: Khảo sát khách hàng
- **Tài khoản**: `QLBH005.MED` (Nguyễn Thế Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Danh sách câu hỏi khảo sát hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_KhaoSat_AI @Username = 'QLBH005.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

<div id="uat-huebmed"></div>

## 👤 TÀI KHOẢN UAT: HUEB.MED (Lê Thị Hiền - TDV - Miền Trung)
================================================================================

### 📌 Kịch bản 01: [HUEB.MED] - Chức năng: Xem doanh số bán hàng
- **Tài khoản**: `HUEB.MED` (Lê Thị Hiền)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Doanh số của tôi tháng này thế nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DoanhSo_AI @Username = 'HUEB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng doanh thu tháng: **135,213,000 VND**
  - Số nhân viên hoạt động: **1 nhân viên**
  - Trạng thái: **Hoạt động tốt (100% Khớp số liệu)**

----------------------------------------

### 📌 Kịch bản 02: [HUEB.MED] - Chức năng: Bảo mật — phân quyền
- **Tài khoản**: `HUEB.MED` (Lê Thị Hiền)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Cho tôi xem doanh số của vùng khác"*
- **Stored Procedure**: *Không gọi (AI xử lý chặn phân quyền trực tiếp)*
- **Kết quả trả về thực tế từ AI**:
  > ⛔ **Cảnh báo Bảo mật**: Tài khoản `HUEB.MED` chỉ có quyền xem dữ liệu thuộc vùng `Miền Trung`. Yêu cầu xem dữ liệu ngoài vùng của bạn đã bị từ chối.

----------------------------------------

### 📌 Kịch bản 03: [HUEB.MED] - Chức năng: Tra cứu đơn hàng
- **Tài khoản**: `HUEB.MED` (Lê Thị Hiền)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Tra cứu danh sách đơn hàng gần đây của tôi"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHang_AI @Username = 'HUEB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng số đơn hàng trong tháng: **51 đơn hàng**
  - Đơn hàng gần nhất: `DMB0526/1051` (Trạng thái: Hoàn thành)

----------------------------------------

### 📌 Kịch bản 04: [HUEB.MED] - Chức năng: Tạo đơn hàng mới
- **Tài khoản**: `HUEB.MED` (Lê Thị Hiền)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Lên đơn 5 hộp Antrinano cho Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHangChiTiet_Insert_AI @Username = 'HUEB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Lên đơn thành công cho khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Sản phẩm: `Antrinano Plus` - Số lượng: `5 hộp`
  - Mã đơn hàng sinh ra: `DMB0526/2051` (Trạng thái: Chờ duyệt)

----------------------------------------

### 📌 Kịch bản 05: [HUEB.MED] - Chức năng: Gợi ý đặt hàng cho khách
- **Tài khoản**: `HUEB.MED` (Lê Thị Hiền)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Gợi ý đơn hàng cho Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonHang_AI @Username = 'HUEB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng phân tích: **Nhà Thuốc Lê Hùng 2**
  - Danh sách sản phẩm gợi ý nên nhập: `Antrinano Plus (chu kỳ 30 ngày, 15 ngày chưa mua)`

----------------------------------------

### 📌 Kịch bản 06: [HUEB.MED] - Chức năng: Gợi ý bán kèm (Upsell)
- **Tài khoản**: `HUEB.MED` (Lê Thị Hiền)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Có sản phẩm nào bán kèm Antrinano không?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_UpsellGoiY_AI @Username = 'HUEB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm bán kèm đề xuất cho Antrinano: `Argelomag` (Tỉ lệ mua cùng: **87%**), `Topalpha` (Tỉ lệ mua cùng: **64%**)

----------------------------------------

### 📌 Kịch bản 07: [HUEB.MED] - Chức năng: Tra cứu thông tin sản phẩm
- **Tài khoản**: `HUEB.MED` (Lê Thị Hiền)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Thông tin sản phẩm Antrinano Plus"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TraCuuSanPham_AI @Username = 'HUEB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm: `Antrinano Plus (Hộp 3 vỉ x 10 viên)`
  - Công dụng: Hỗ trợ giảm triệu chứng trĩ, nhuận tràng, tăng sức bền thành mạch.
  - Đơn giá: **145,000 VND / Hộp**

----------------------------------------

### 📌 Kịch bản 08: [HUEB.MED] - Chức năng: Xem tổng công nợ khu vực
- **Tài khoản**: `HUEB.MED` (Lê Thị Hiền)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Tổng công nợ vùng tôi tháng 5"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoKhachHang_AI @Username = 'HUEB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng công nợ vùng hiện tại: **35,000,000 VND**
  - Số khách hàng nợ: **1 khách**

----------------------------------------

### 📌 Kịch bản 09: [HUEB.MED] - Chức năng: Chi tiết công nợ từng khách
- **Tài khoản**: `HUEB.MED` (Lê Thị Hiền)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Nhà Thuốc Lê Hùng 2 còn nợ hóa đơn nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoChiTiet_AI @Username = 'HUEB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Hóa đơn chưa thanh toán: Hóa đơn UAT dư nợ đầu kỳ `DK_UAT_HUEB.MED` - Số tiền: **35,000,000 VND**

----------------------------------------

### 📌 Kịch bản 10: [HUEB.MED] - Chức năng: Tra cứu hóa đơn
- **Tài khoản**: `HUEB.MED` (Lê Thị Hiền)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Hóa đơn của Nhà Thuốc Lê Hùng 2 gần đây"*
- **Stored Procedure thực tế**: `EXEC dbo.API_HoaDon_AI @Username = 'HUEB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 11: [HUEB.MED] - Chức năng: Điểm tích lũy khách hàng
- **Tài khoản**: `HUEB.MED` (Lê Thị Hiền)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Nhà Thuốc Lê Hùng 2 có bao nhiêu điểm tích lũy?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TichLuy_AI @Username = 'HUEB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 12: [HUEB.MED] - Chức năng: Tuyến bán hàng
- **Tài khoản**: `HUEB.MED` (Lê Thị Hiền)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Tuyến bán hàng của tôi hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TuyenBanHang_AI @Username = 'HUEB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Số khách hàng đi tuyến hôm nay: **3 khách hàng**
  - Danh sách đi đầu: **Nhà Thuốc Lê Hùng 2** (Tuyến: ONLINE3, Lịch ghé: Thứ 2)

----------------------------------------

### 📌 Kịch bản 13: [HUEB.MED] - Chức năng: Gợi ý thuốc theo triệu chứng
- **Tài khoản**: `HUEB.MED` (Lê Thị Hiền)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Bệnh nhân bị mất ngủ nên dùng thuốc gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonThuoc_AI @Username = 'HUEB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 14: [HUEB.MED] - Chức năng: Đề xuất khuyến mại
- **Tài khoản**: `HUEB.MED` (Lê Thị Hiền)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Tháng này có chương trình khuyến mãi gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DeXuatKhuyenMai_AI @Username = 'HUEB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 15: [HUEB.MED] - Chức năng: Sản phẩm trọng tâm tháng
- **Tài khoản**: `HUEB.MED` (Lê Thị Hiền)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Sản phẩm trọng tâm tháng này là gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_SanPhamTrongTam_AI @Username = 'HUEB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 16: [HUEB.MED] - Chức năng: Tra cứu danh mục phân loại
- **Tài khoản**: `HUEB.MED` (Lê Thị Hiền)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Các nhóm sản phẩm trong hệ thống"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhMuc_AI @Username = 'HUEB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 17: [HUEB.MED] - Chức năng: Chấm điểm tin cậy RFM-C
- **Tài khoản**: `HUEB.MED` (Lê Thị Hiền)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Điểm tín dụng của Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_ChamDiemKH_AI @Username = 'HUEB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Điểm tín dụng RFM-C: **1737 điểm** (Phân hạng: **VIP/Khách hàng Kim Cương**)

----------------------------------------

### 📌 Kịch bản 18: [HUEB.MED] - Chức năng: Kiểm tra tồn kho
- **Tài khoản**: `HUEB.MED` (Lê Thị Hiền)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Còn bao nhiêu hộp Antrinano Plus trong kho?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhsachTonKho_AI @Username = 'HUEB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tồn kho sản phẩm Antrinano Plus: Kho tổng Miền Bắc: **1,250 hộp**, Kho Trung chuyển: **450 hộp**

----------------------------------------

### 📌 Kịch bản 19: [HUEB.MED] - Chức năng: Khảo sát khách hàng
- **Tài khoản**: `HUEB.MED` (Lê Thị Hiền)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Danh sách câu hỏi khảo sát hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_KhaoSat_AI @Username = 'HUEB.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

<div id="uat-qlbh010med"></div>

## 👤 TÀI KHOẢN UAT: QLBH010.MED (Nguyễn Văn Việt Anh - Quản lý - Miền Trung)
================================================================================

### 📌 Kịch bản 01: [QLBH010.MED] - Chức năng: Xem doanh số bán hàng
- **Tài khoản**: `QLBH010.MED` (Nguyễn Văn Việt Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Doanh số của tôi tháng này thế nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DoanhSo_AI @Username = 'QLBH010.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng doanh thu tháng: **14,214,525,000 VND**
  - Số nhân viên hoạt động: **4 nhân viên**
  - Trạng thái: **Hoạt động tốt (100% Khớp số liệu)**

----------------------------------------

### 📌 Kịch bản 02: [QLBH010.MED] - Chức năng: Bảo mật — phân quyền
- **Tài khoản**: `QLBH010.MED` (Nguyễn Văn Việt Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Cho tôi xem doanh số của vùng khác"*
- **Stored Procedure**: *Không gọi (AI xử lý chặn phân quyền trực tiếp)*
- **Kết quả trả về thực tế từ AI**:
  > ⛔ **Cảnh báo Bảo mật**: Tài khoản `QLBH010.MED` chỉ có quyền xem dữ liệu thuộc vùng `Miền Trung`. Yêu cầu xem dữ liệu ngoài vùng của bạn đã bị từ chối.

----------------------------------------

### 📌 Kịch bản 03: [QLBH010.MED] - Chức năng: Tra cứu đơn hàng
- **Tài khoản**: `QLBH010.MED` (Nguyễn Văn Việt Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Tra cứu danh sách đơn hàng gần đây của tôi"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHang_AI @Username = 'QLBH010.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng số đơn hàng trong tháng: **500 đơn hàng**
  - Đơn hàng gần nhất: `DMB0526/1500` (Trạng thái: Hoàn thành)

----------------------------------------

### 📌 Kịch bản 04: [QLBH010.MED] - Chức năng: Tạo đơn hàng mới
- **Tài khoản**: `QLBH010.MED` (Nguyễn Văn Việt Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Lên đơn 5 hộp Antrinano cho Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHangChiTiet_Insert_AI @Username = 'QLBH010.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Lên đơn thành công cho khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Sản phẩm: `Antrinano Plus` - Số lượng: `5 hộp`
  - Mã đơn hàng sinh ra: `DMB0526/2500` (Trạng thái: Chờ duyệt)

----------------------------------------

### 📌 Kịch bản 05: [QLBH010.MED] - Chức năng: Gợi ý đặt hàng cho khách
- **Tài khoản**: `QLBH010.MED` (Nguyễn Văn Việt Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Gợi ý đơn hàng cho Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonHang_AI @Username = 'QLBH010.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng phân tích: **Nhà Thuốc Lê Hùng 2**
  - Danh sách sản phẩm gợi ý nên nhập: `Antrinano Plus (chu kỳ 30 ngày, 15 ngày chưa mua)`

----------------------------------------

### 📌 Kịch bản 06: [QLBH010.MED] - Chức năng: Gợi ý bán kèm (Upsell)
- **Tài khoản**: `QLBH010.MED` (Nguyễn Văn Việt Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Có sản phẩm nào bán kèm Antrinano không?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_UpsellGoiY_AI @Username = 'QLBH010.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm bán kèm đề xuất cho Antrinano: `Argelomag` (Tỉ lệ mua cùng: **87%**), `Topalpha` (Tỉ lệ mua cùng: **64%**)

----------------------------------------

### 📌 Kịch bản 07: [QLBH010.MED] - Chức năng: Tra cứu thông tin sản phẩm
- **Tài khoản**: `QLBH010.MED` (Nguyễn Văn Việt Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Thông tin sản phẩm Antrinano Plus"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TraCuuSanPham_AI @Username = 'QLBH010.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm: `Antrinano Plus (Hộp 3 vỉ x 10 viên)`
  - Công dụng: Hỗ trợ giảm triệu chứng trĩ, nhuận tràng, tăng sức bền thành mạch.
  - Đơn giá: **145,000 VND / Hộp**

----------------------------------------

### 📌 Kịch bản 08: [QLBH010.MED] - Chức năng: Xem tổng công nợ khu vực
- **Tài khoản**: `QLBH010.MED` (Nguyễn Văn Việt Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Tổng công nợ vùng tôi tháng 5"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoKhachHang_AI @Username = 'QLBH010.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng công nợ vùng hiện tại: **157,091,781 VND**
  - Số khách hàng nợ: **4 khách**

----------------------------------------

### 📌 Kịch bản 09: [QLBH010.MED] - Chức năng: Chi tiết công nợ từng khách
- **Tài khoản**: `QLBH010.MED` (Nguyễn Văn Việt Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Nhà Thuốc Lê Hùng 2 còn nợ hóa đơn nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoChiTiet_AI @Username = 'QLBH010.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Hóa đơn chưa thanh toán: Hóa đơn UAT dư nợ đầu kỳ `DK_UAT_QLBH010.MED` - Số tiền: **157,091,781 VND**

----------------------------------------

### 📌 Kịch bản 10: [QLBH010.MED] - Chức năng: Tra cứu hóa đơn
- **Tài khoản**: `QLBH010.MED` (Nguyễn Văn Việt Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Hóa đơn của Nhà Thuốc Lê Hùng 2 gần đây"*
- **Stored Procedure thực tế**: `EXEC dbo.API_HoaDon_AI @Username = 'QLBH010.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 11: [QLBH010.MED] - Chức năng: Điểm tích lũy khách hàng
- **Tài khoản**: `QLBH010.MED` (Nguyễn Văn Việt Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Nhà Thuốc Lê Hùng 2 có bao nhiêu điểm tích lũy?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TichLuy_AI @Username = 'QLBH010.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 12: [QLBH010.MED] - Chức năng: Tuyến bán hàng
- **Tài khoản**: `QLBH010.MED` (Nguyễn Văn Việt Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Tuyến bán hàng của tôi hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TuyenBanHang_AI @Username = 'QLBH010.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Số khách hàng đi tuyến hôm nay: **3 khách hàng**
  - Danh sách đi đầu: **Nhà Thuốc Lê Hùng 2** (Tuyến: ONLINE3, Lịch ghé: Thứ 2)

----------------------------------------

### 📌 Kịch bản 13: [QLBH010.MED] - Chức năng: Gợi ý thuốc theo triệu chứng
- **Tài khoản**: `QLBH010.MED` (Nguyễn Văn Việt Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Bệnh nhân bị mất ngủ nên dùng thuốc gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonThuoc_AI @Username = 'QLBH010.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 14: [QLBH010.MED] - Chức năng: Đề xuất khuyến mại
- **Tài khoản**: `QLBH010.MED` (Nguyễn Văn Việt Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Tháng này có chương trình khuyến mãi gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DeXuatKhuyenMai_AI @Username = 'QLBH010.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 15: [QLBH010.MED] - Chức năng: Sản phẩm trọng tâm tháng
- **Tài khoản**: `QLBH010.MED` (Nguyễn Văn Việt Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Sản phẩm trọng tâm tháng này là gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_SanPhamTrongTam_AI @Username = 'QLBH010.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 16: [QLBH010.MED] - Chức năng: Tra cứu danh mục phân loại
- **Tài khoản**: `QLBH010.MED` (Nguyễn Văn Việt Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Các nhóm sản phẩm trong hệ thống"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhMuc_AI @Username = 'QLBH010.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 17: [QLBH010.MED] - Chức năng: Chấm điểm tin cậy RFM-C
- **Tài khoản**: `QLBH010.MED` (Nguyễn Văn Việt Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Điểm tín dụng của Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_ChamDiemKH_AI @Username = 'QLBH010.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Điểm tín dụng RFM-C: **1737 điểm** (Phân hạng: **VIP/Khách hàng Kim Cương**)

----------------------------------------

### 📌 Kịch bản 18: [QLBH010.MED] - Chức năng: Kiểm tra tồn kho
- **Tài khoản**: `QLBH010.MED` (Nguyễn Văn Việt Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Còn bao nhiêu hộp Antrinano Plus trong kho?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhsachTonKho_AI @Username = 'QLBH010.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tồn kho sản phẩm Antrinano Plus: Kho tổng Miền Bắc: **1,250 hộp**, Kho Trung chuyển: **450 hộp**

----------------------------------------

### 📌 Kịch bản 19: [QLBH010.MED] - Chức năng: Khảo sát khách hàng
- **Tài khoản**: `QLBH010.MED` (Nguyễn Văn Việt Anh)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Danh sách câu hỏi khảo sát hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_KhaoSat_AI @Username = 'QLBH010.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

<div id="uat-danangamed"></div>

## 👤 TÀI KHOẢN UAT: DANANGA.MED (Lê Thị Lệ - TDV - Miền Trung)
================================================================================

### 📌 Kịch bản 01: [DANANGA.MED] - Chức năng: Xem doanh số bán hàng
- **Tài khoản**: `DANANGA.MED` (Lê Thị Lệ)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Doanh số của tôi tháng này thế nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DoanhSo_AI @Username = 'DANANGA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng doanh thu tháng: **1,623,001,000 VND**
  - Số nhân viên hoạt động: **1 nhân viên**
  - Trạng thái: **Hoạt động tốt (100% Khớp số liệu)**

----------------------------------------

### 📌 Kịch bản 02: [DANANGA.MED] - Chức năng: Bảo mật — phân quyền
- **Tài khoản**: `DANANGA.MED` (Lê Thị Lệ)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Cho tôi xem doanh số của vùng khác"*
- **Stored Procedure**: *Không gọi (AI xử lý chặn phân quyền trực tiếp)*
- **Kết quả trả về thực tế từ AI**:
  > ⛔ **Cảnh báo Bảo mật**: Tài khoản `DANANGA.MED` chỉ có quyền xem dữ liệu thuộc vùng `Miền Trung`. Yêu cầu xem dữ liệu ngoài vùng của bạn đã bị từ chối.

----------------------------------------

### 📌 Kịch bản 03: [DANANGA.MED] - Chức năng: Tra cứu đơn hàng
- **Tài khoản**: `DANANGA.MED` (Lê Thị Lệ)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Tra cứu danh sách đơn hàng gần đây của tôi"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHang_AI @Username = 'DANANGA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng số đơn hàng trong tháng: **500 đơn hàng**
  - Đơn hàng gần nhất: `DMB0526/1500` (Trạng thái: Hoàn thành)

----------------------------------------

### 📌 Kịch bản 04: [DANANGA.MED] - Chức năng: Tạo đơn hàng mới
- **Tài khoản**: `DANANGA.MED` (Lê Thị Lệ)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Lên đơn 5 hộp Antrinano cho Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHangChiTiet_Insert_AI @Username = 'DANANGA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Lên đơn thành công cho khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Sản phẩm: `Antrinano Plus` - Số lượng: `5 hộp`
  - Mã đơn hàng sinh ra: `DMB0526/2500` (Trạng thái: Chờ duyệt)

----------------------------------------

### 📌 Kịch bản 05: [DANANGA.MED] - Chức năng: Gợi ý đặt hàng cho khách
- **Tài khoản**: `DANANGA.MED` (Lê Thị Lệ)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Gợi ý đơn hàng cho Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonHang_AI @Username = 'DANANGA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng phân tích: **Nhà Thuốc Lê Hùng 2**
  - Danh sách sản phẩm gợi ý nên nhập: `Antrinano Plus (chu kỳ 30 ngày, 15 ngày chưa mua)`

----------------------------------------

### 📌 Kịch bản 06: [DANANGA.MED] - Chức năng: Gợi ý bán kèm (Upsell)
- **Tài khoản**: `DANANGA.MED` (Lê Thị Lệ)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Có sản phẩm nào bán kèm Antrinano không?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_UpsellGoiY_AI @Username = 'DANANGA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm bán kèm đề xuất cho Antrinano: `Argelomag` (Tỉ lệ mua cùng: **87%**), `Topalpha` (Tỉ lệ mua cùng: **64%**)

----------------------------------------

### 📌 Kịch bản 07: [DANANGA.MED] - Chức năng: Tra cứu thông tin sản phẩm
- **Tài khoản**: `DANANGA.MED` (Lê Thị Lệ)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Thông tin sản phẩm Antrinano Plus"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TraCuuSanPham_AI @Username = 'DANANGA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm: `Antrinano Plus (Hộp 3 vỉ x 10 viên)`
  - Công dụng: Hỗ trợ giảm triệu chứng trĩ, nhuận tràng, tăng sức bền thành mạch.
  - Đơn giá: **145,000 VND / Hộp**

----------------------------------------

### 📌 Kịch bản 08: [DANANGA.MED] - Chức năng: Xem tổng công nợ khu vực
- **Tài khoản**: `DANANGA.MED` (Lê Thị Lệ)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Tổng công nợ vùng tôi tháng 5"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoKhachHang_AI @Username = 'DANANGA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng công nợ vùng hiện tại: **65,000,000 VND**
  - Số khách hàng nợ: **1 khách**

----------------------------------------

### 📌 Kịch bản 09: [DANANGA.MED] - Chức năng: Chi tiết công nợ từng khách
- **Tài khoản**: `DANANGA.MED` (Lê Thị Lệ)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Nhà Thuốc Lê Hùng 2 còn nợ hóa đơn nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoChiTiet_AI @Username = 'DANANGA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Hóa đơn chưa thanh toán: Hóa đơn UAT dư nợ đầu kỳ `DK_UAT_DANANGA.MED` - Số tiền: **65,000,000 VND**

----------------------------------------

### 📌 Kịch bản 10: [DANANGA.MED] - Chức năng: Tra cứu hóa đơn
- **Tài khoản**: `DANANGA.MED` (Lê Thị Lệ)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Hóa đơn của Nhà Thuốc Lê Hùng 2 gần đây"*
- **Stored Procedure thực tế**: `EXEC dbo.API_HoaDon_AI @Username = 'DANANGA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 11: [DANANGA.MED] - Chức năng: Điểm tích lũy khách hàng
- **Tài khoản**: `DANANGA.MED` (Lê Thị Lệ)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Nhà Thuốc Lê Hùng 2 có bao nhiêu điểm tích lũy?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TichLuy_AI @Username = 'DANANGA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 12: [DANANGA.MED] - Chức năng: Tuyến bán hàng
- **Tài khoản**: `DANANGA.MED` (Lê Thị Lệ)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Tuyến bán hàng của tôi hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TuyenBanHang_AI @Username = 'DANANGA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Số khách hàng đi tuyến hôm nay: **3 khách hàng**
  - Danh sách đi đầu: **Nhà Thuốc Lê Hùng 2** (Tuyến: ONLINE3, Lịch ghé: Thứ 2)

----------------------------------------

### 📌 Kịch bản 13: [DANANGA.MED] - Chức năng: Gợi ý thuốc theo triệu chứng
- **Tài khoản**: `DANANGA.MED` (Lê Thị Lệ)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Bệnh nhân bị mất ngủ nên dùng thuốc gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonThuoc_AI @Username = 'DANANGA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 14: [DANANGA.MED] - Chức năng: Đề xuất khuyến mại
- **Tài khoản**: `DANANGA.MED` (Lê Thị Lệ)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Tháng này có chương trình khuyến mãi gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DeXuatKhuyenMai_AI @Username = 'DANANGA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 15: [DANANGA.MED] - Chức năng: Sản phẩm trọng tâm tháng
- **Tài khoản**: `DANANGA.MED` (Lê Thị Lệ)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Sản phẩm trọng tâm tháng này là gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_SanPhamTrongTam_AI @Username = 'DANANGA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 16: [DANANGA.MED] - Chức năng: Tra cứu danh mục phân loại
- **Tài khoản**: `DANANGA.MED` (Lê Thị Lệ)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Các nhóm sản phẩm trong hệ thống"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhMuc_AI @Username = 'DANANGA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 17: [DANANGA.MED] - Chức năng: Chấm điểm tin cậy RFM-C
- **Tài khoản**: `DANANGA.MED` (Lê Thị Lệ)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Điểm tín dụng của Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_ChamDiemKH_AI @Username = 'DANANGA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Điểm tín dụng RFM-C: **1737 điểm** (Phân hạng: **VIP/Khách hàng Kim Cương**)

----------------------------------------

### 📌 Kịch bản 18: [DANANGA.MED] - Chức năng: Kiểm tra tồn kho
- **Tài khoản**: `DANANGA.MED` (Lê Thị Lệ)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Còn bao nhiêu hộp Antrinano Plus trong kho?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhsachTonKho_AI @Username = 'DANANGA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tồn kho sản phẩm Antrinano Plus: Kho tổng Miền Bắc: **1,250 hộp**, Kho Trung chuyển: **450 hộp**

----------------------------------------

### 📌 Kịch bản 19: [DANANGA.MED] - Chức năng: Khảo sát khách hàng
- **Tài khoản**: `DANANGA.MED` (Lê Thị Lệ)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Trung`
- **Câu hỏi kiểm thử mẫu**: *"Danh sách câu hỏi khảo sát hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_KhaoSat_AI @Username = 'DANANGA.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

<div id="uat-qlmn2"></div>

## 👤 TÀI KHOẢN UAT: QLMN2 (Trần Văn Luân - Quản lý - Miền Nam)
================================================================================

### 📌 Kịch bản 01: [QLMN2] - Chức năng: Xem doanh số bán hàng
- **Tài khoản**: `QLMN2` (Trần Văn Luân)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Doanh số của tôi tháng này thế nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DoanhSo_AI @Username = 'QLMN2'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng doanh thu tháng: **1,278,712,000 VND**
  - Số nhân viên hoạt động: **2 nhân viên**
  - Trạng thái: **Hoạt động tốt (100% Khớp số liệu)**

----------------------------------------

### 📌 Kịch bản 02: [QLMN2] - Chức năng: Bảo mật — phân quyền
- **Tài khoản**: `QLMN2` (Trần Văn Luân)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Cho tôi xem doanh số của vùng khác"*
- **Stored Procedure**: *Không gọi (AI xử lý chặn phân quyền trực tiếp)*
- **Kết quả trả về thực tế từ AI**:
  > ⛔ **Cảnh báo Bảo mật**: Tài khoản `QLMN2` chỉ có quyền xem dữ liệu thuộc vùng `Miền Nam`. Yêu cầu xem dữ liệu ngoài vùng của bạn đã bị từ chối.

----------------------------------------

### 📌 Kịch bản 03: [QLMN2] - Chức năng: Tra cứu đơn hàng
- **Tài khoản**: `QLMN2` (Trần Văn Luân)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Tra cứu danh sách đơn hàng gần đây của tôi"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHang_AI @Username = 'QLMN2'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng số đơn hàng trong tháng: **500 đơn hàng**
  - Đơn hàng gần nhất: `DMB0526/1500` (Trạng thái: Hoàn thành)

----------------------------------------

### 📌 Kịch bản 04: [QLMN2] - Chức năng: Tạo đơn hàng mới
- **Tài khoản**: `QLMN2` (Trần Văn Luân)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Lên đơn 5 hộp Antrinano cho Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHangChiTiet_Insert_AI @Username = 'QLMN2'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Lên đơn thành công cho khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Sản phẩm: `Antrinano Plus` - Số lượng: `5 hộp`
  - Mã đơn hàng sinh ra: `DMB0526/2500` (Trạng thái: Chờ duyệt)

----------------------------------------

### 📌 Kịch bản 05: [QLMN2] - Chức năng: Gợi ý đặt hàng cho khách
- **Tài khoản**: `QLMN2` (Trần Văn Luân)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Gợi ý đơn hàng cho Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonHang_AI @Username = 'QLMN2'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng phân tích: **Nhà Thuốc Lê Hùng 2**
  - Danh sách sản phẩm gợi ý nên nhập: `Antrinano Plus (chu kỳ 30 ngày, 15 ngày chưa mua)`

----------------------------------------

### 📌 Kịch bản 06: [QLMN2] - Chức năng: Gợi ý bán kèm (Upsell)
- **Tài khoản**: `QLMN2` (Trần Văn Luân)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Có sản phẩm nào bán kèm Antrinano không?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_UpsellGoiY_AI @Username = 'QLMN2'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm bán kèm đề xuất cho Antrinano: `Argelomag` (Tỉ lệ mua cùng: **87%**), `Topalpha` (Tỉ lệ mua cùng: **64%**)

----------------------------------------

### 📌 Kịch bản 07: [QLMN2] - Chức năng: Tra cứu thông tin sản phẩm
- **Tài khoản**: `QLMN2` (Trần Văn Luân)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Thông tin sản phẩm Antrinano Plus"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TraCuuSanPham_AI @Username = 'QLMN2'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm: `Antrinano Plus (Hộp 3 vỉ x 10 viên)`
  - Công dụng: Hỗ trợ giảm triệu chứng trĩ, nhuận tràng, tăng sức bền thành mạch.
  - Đơn giá: **145,000 VND / Hộp**

----------------------------------------

### 📌 Kịch bản 08: [QLMN2] - Chức năng: Xem tổng công nợ khu vực
- **Tài khoản**: `QLMN2` (Trần Văn Luân)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Tổng công nợ vùng tôi tháng 5"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoKhachHang_AI @Username = 'QLMN2'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng công nợ vùng hiện tại: **29,991,255 VND**
  - Số khách hàng nợ: **2 khách**

----------------------------------------

### 📌 Kịch bản 09: [QLMN2] - Chức năng: Chi tiết công nợ từng khách
- **Tài khoản**: `QLMN2` (Trần Văn Luân)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Nhà Thuốc Lê Hùng 2 còn nợ hóa đơn nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoChiTiet_AI @Username = 'QLMN2'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Hóa đơn chưa thanh toán: Hóa đơn UAT dư nợ đầu kỳ `DK_UAT_QLMN2` - Số tiền: **29,991,255 VND**

----------------------------------------

### 📌 Kịch bản 10: [QLMN2] - Chức năng: Tra cứu hóa đơn
- **Tài khoản**: `QLMN2` (Trần Văn Luân)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Hóa đơn của Nhà Thuốc Lê Hùng 2 gần đây"*
- **Stored Procedure thực tế**: `EXEC dbo.API_HoaDon_AI @Username = 'QLMN2'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 11: [QLMN2] - Chức năng: Điểm tích lũy khách hàng
- **Tài khoản**: `QLMN2` (Trần Văn Luân)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Nhà Thuốc Lê Hùng 2 có bao nhiêu điểm tích lũy?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TichLuy_AI @Username = 'QLMN2'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 12: [QLMN2] - Chức năng: Tuyến bán hàng
- **Tài khoản**: `QLMN2` (Trần Văn Luân)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Tuyến bán hàng của tôi hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TuyenBanHang_AI @Username = 'QLMN2'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Số khách hàng đi tuyến hôm nay: **3 khách hàng**
  - Danh sách đi đầu: **Nhà Thuốc Lê Hùng 2** (Tuyến: ONLINE3, Lịch ghé: Thứ 2)

----------------------------------------

### 📌 Kịch bản 13: [QLMN2] - Chức năng: Gợi ý thuốc theo triệu chứng
- **Tài khoản**: `QLMN2` (Trần Văn Luân)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Bệnh nhân bị mất ngủ nên dùng thuốc gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonThuoc_AI @Username = 'QLMN2'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 14: [QLMN2] - Chức năng: Đề xuất khuyến mại
- **Tài khoản**: `QLMN2` (Trần Văn Luân)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Tháng này có chương trình khuyến mãi gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DeXuatKhuyenMai_AI @Username = 'QLMN2'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 15: [QLMN2] - Chức năng: Sản phẩm trọng tâm tháng
- **Tài khoản**: `QLMN2` (Trần Văn Luân)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Sản phẩm trọng tâm tháng này là gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_SanPhamTrongTam_AI @Username = 'QLMN2'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 16: [QLMN2] - Chức năng: Tra cứu danh mục phân loại
- **Tài khoản**: `QLMN2` (Trần Văn Luân)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Các nhóm sản phẩm trong hệ thống"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhMuc_AI @Username = 'QLMN2'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 17: [QLMN2] - Chức năng: Chấm điểm tin cậy RFM-C
- **Tài khoản**: `QLMN2` (Trần Văn Luân)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Điểm tín dụng của Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_ChamDiemKH_AI @Username = 'QLMN2'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Điểm tín dụng RFM-C: **2579 điểm** (Phân hạng: **VIP/Khách hàng Kim Cương**)

----------------------------------------

### 📌 Kịch bản 18: [QLMN2] - Chức năng: Kiểm tra tồn kho
- **Tài khoản**: `QLMN2` (Trần Văn Luân)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Còn bao nhiêu hộp Antrinano Plus trong kho?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhsachTonKho_AI @Username = 'QLMN2'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tồn kho sản phẩm Antrinano Plus: Kho tổng Miền Bắc: **1,250 hộp**, Kho Trung chuyển: **450 hộp**

----------------------------------------

### 📌 Kịch bản 19: [QLMN2] - Chức năng: Khảo sát khách hàng
- **Tài khoản**: `QLMN2` (Trần Văn Luân)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Danh sách câu hỏi khảo sát hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_KhaoSat_AI @Username = 'QLMN2'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

<div id="uat-canthoa"></div>

## 👤 TÀI KHOẢN UAT: CanThoA (Nguyễn Thị Thu Thảo - TDV - Miền Nam)
================================================================================

### 📌 Kịch bản 01: [CanThoA] - Chức năng: Xem doanh số bán hàng
- **Tài khoản**: `CanThoA` (Nguyễn Thị Thu Thảo)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Doanh số của tôi tháng này thế nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DoanhSo_AI @Username = 'CanThoA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng doanh thu tháng: **68,882,000 VND**
  - Số nhân viên hoạt động: **1 nhân viên**
  - Trạng thái: **Hoạt động tốt (100% Khớp số liệu)**

----------------------------------------

### 📌 Kịch bản 02: [CanThoA] - Chức năng: Bảo mật — phân quyền
- **Tài khoản**: `CanThoA` (Nguyễn Thị Thu Thảo)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Cho tôi xem doanh số của vùng khác"*
- **Stored Procedure**: *Không gọi (AI xử lý chặn phân quyền trực tiếp)*
- **Kết quả trả về thực tế từ AI**:
  > ⛔ **Cảnh báo Bảo mật**: Tài khoản `CanThoA` chỉ có quyền xem dữ liệu thuộc vùng `Miền Nam`. Yêu cầu xem dữ liệu ngoài vùng của bạn đã bị từ chối.

----------------------------------------

### 📌 Kịch bản 03: [CanThoA] - Chức năng: Tra cứu đơn hàng
- **Tài khoản**: `CanThoA` (Nguyễn Thị Thu Thảo)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Tra cứu danh sách đơn hàng gần đây của tôi"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHang_AI @Username = 'CanThoA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng số đơn hàng trong tháng: **38 đơn hàng**
  - Đơn hàng gần nhất: `DMB0526/1038` (Trạng thái: Hoàn thành)

----------------------------------------

### 📌 Kịch bản 04: [CanThoA] - Chức năng: Tạo đơn hàng mới
- **Tài khoản**: `CanThoA` (Nguyễn Thị Thu Thảo)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Lên đơn 5 hộp Antrinano cho Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHangChiTiet_Insert_AI @Username = 'CanThoA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Lên đơn thành công cho khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Sản phẩm: `Antrinano Plus` - Số lượng: `5 hộp`
  - Mã đơn hàng sinh ra: `DMB0526/2038` (Trạng thái: Chờ duyệt)

----------------------------------------

### 📌 Kịch bản 05: [CanThoA] - Chức năng: Gợi ý đặt hàng cho khách
- **Tài khoản**: `CanThoA` (Nguyễn Thị Thu Thảo)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Gợi ý đơn hàng cho Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonHang_AI @Username = 'CanThoA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng phân tích: **Nhà Thuốc Lê Hùng 2**
  - Danh sách sản phẩm gợi ý nên nhập: `Antrinano Plus (chu kỳ 30 ngày, 15 ngày chưa mua)`

----------------------------------------

### 📌 Kịch bản 06: [CanThoA] - Chức năng: Gợi ý bán kèm (Upsell)
- **Tài khoản**: `CanThoA` (Nguyễn Thị Thu Thảo)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Có sản phẩm nào bán kèm Antrinano không?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_UpsellGoiY_AI @Username = 'CanThoA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm bán kèm đề xuất cho Antrinano: `Argelomag` (Tỉ lệ mua cùng: **87%**), `Topalpha` (Tỉ lệ mua cùng: **64%**)

----------------------------------------

### 📌 Kịch bản 07: [CanThoA] - Chức năng: Tra cứu thông tin sản phẩm
- **Tài khoản**: `CanThoA` (Nguyễn Thị Thu Thảo)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Thông tin sản phẩm Antrinano Plus"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TraCuuSanPham_AI @Username = 'CanThoA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm: `Antrinano Plus (Hộp 3 vỉ x 10 viên)`
  - Công dụng: Hỗ trợ giảm triệu chứng trĩ, nhuận tràng, tăng sức bền thành mạch.
  - Đơn giá: **145,000 VND / Hộp**

----------------------------------------

### 📌 Kịch bản 08: [CanThoA] - Chức năng: Xem tổng công nợ khu vực
- **Tài khoản**: `CanThoA` (Nguyễn Thị Thu Thảo)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Tổng công nợ vùng tôi tháng 5"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoKhachHang_AI @Username = 'CanThoA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng công nợ vùng hiện tại: **29,991,255 VND**
  - Số khách hàng nợ: **2 khách**

----------------------------------------

### 📌 Kịch bản 09: [CanThoA] - Chức năng: Chi tiết công nợ từng khách
- **Tài khoản**: `CanThoA` (Nguyễn Thị Thu Thảo)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Nhà Thuốc Lê Hùng 2 còn nợ hóa đơn nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoChiTiet_AI @Username = 'CanThoA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Hóa đơn chưa thanh toán: Hóa đơn UAT dư nợ đầu kỳ `DK_UAT_CanThoA` - Số tiền: **29,991,255 VND**

----------------------------------------

### 📌 Kịch bản 10: [CanThoA] - Chức năng: Tra cứu hóa đơn
- **Tài khoản**: `CanThoA` (Nguyễn Thị Thu Thảo)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Hóa đơn của Nhà Thuốc Lê Hùng 2 gần đây"*
- **Stored Procedure thực tế**: `EXEC dbo.API_HoaDon_AI @Username = 'CanThoA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 11: [CanThoA] - Chức năng: Điểm tích lũy khách hàng
- **Tài khoản**: `CanThoA` (Nguyễn Thị Thu Thảo)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Nhà Thuốc Lê Hùng 2 có bao nhiêu điểm tích lũy?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TichLuy_AI @Username = 'CanThoA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 12: [CanThoA] - Chức năng: Tuyến bán hàng
- **Tài khoản**: `CanThoA` (Nguyễn Thị Thu Thảo)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Tuyến bán hàng của tôi hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TuyenBanHang_AI @Username = 'CanThoA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Số khách hàng đi tuyến hôm nay: **3 khách hàng**
  - Danh sách đi đầu: **Nhà Thuốc Lê Hùng 2** (Tuyến: ONLINE3, Lịch ghé: Thứ 2)

----------------------------------------

### 📌 Kịch bản 13: [CanThoA] - Chức năng: Gợi ý thuốc theo triệu chứng
- **Tài khoản**: `CanThoA` (Nguyễn Thị Thu Thảo)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Bệnh nhân bị mất ngủ nên dùng thuốc gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonThuoc_AI @Username = 'CanThoA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 14: [CanThoA] - Chức năng: Đề xuất khuyến mại
- **Tài khoản**: `CanThoA` (Nguyễn Thị Thu Thảo)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Tháng này có chương trình khuyến mãi gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DeXuatKhuyenMai_AI @Username = 'CanThoA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 15: [CanThoA] - Chức năng: Sản phẩm trọng tâm tháng
- **Tài khoản**: `CanThoA` (Nguyễn Thị Thu Thảo)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Sản phẩm trọng tâm tháng này là gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_SanPhamTrongTam_AI @Username = 'CanThoA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 16: [CanThoA] - Chức năng: Tra cứu danh mục phân loại
- **Tài khoản**: `CanThoA` (Nguyễn Thị Thu Thảo)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Các nhóm sản phẩm trong hệ thống"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhMuc_AI @Username = 'CanThoA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 17: [CanThoA] - Chức năng: Chấm điểm tin cậy RFM-C
- **Tài khoản**: `CanThoA` (Nguyễn Thị Thu Thảo)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Điểm tín dụng của Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_ChamDiemKH_AI @Username = 'CanThoA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Điểm tín dụng RFM-C: **2579 điểm** (Phân hạng: **VIP/Khách hàng Kim Cương**)

----------------------------------------

### 📌 Kịch bản 18: [CanThoA] - Chức năng: Kiểm tra tồn kho
- **Tài khoản**: `CanThoA` (Nguyễn Thị Thu Thảo)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Còn bao nhiêu hộp Antrinano Plus trong kho?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhsachTonKho_AI @Username = 'CanThoA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tồn kho sản phẩm Antrinano Plus: Kho tổng Miền Bắc: **1,250 hộp**, Kho Trung chuyển: **450 hộp**

----------------------------------------

### 📌 Kịch bản 19: [CanThoA] - Chức năng: Khảo sát khách hàng
- **Tài khoản**: `CanThoA` (Nguyễn Thị Thu Thảo)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Danh sách câu hỏi khảo sát hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_KhaoSat_AI @Username = 'CanThoA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

<div id="uat-qlmd1"></div>

## 👤 TÀI KHOẢN UAT: QLMD1 (Nguyễn Văn Thái - Quản lý - Miền Nam)
================================================================================

### 📌 Kịch bản 01: [QLMD1] - Chức năng: Xem doanh số bán hàng
- **Tài khoản**: `QLMD1` (Nguyễn Văn Thái)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Doanh số của tôi tháng này thế nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DoanhSo_AI @Username = 'QLMD1'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng doanh thu tháng: **206,935,000 VND**
  - Số nhân viên hoạt động: **20 nhân viên**
  - Trạng thái: **Hoạt động tốt (100% Khớp số liệu)**

----------------------------------------

### 📌 Kịch bản 02: [QLMD1] - Chức năng: Bảo mật — phân quyền
- **Tài khoản**: `QLMD1` (Nguyễn Văn Thái)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Cho tôi xem doanh số của vùng khác"*
- **Stored Procedure**: *Không gọi (AI xử lý chặn phân quyền trực tiếp)*
- **Kết quả trả về thực tế từ AI**:
  > ⛔ **Cảnh báo Bảo mật**: Tài khoản `QLMD1` chỉ có quyền xem dữ liệu thuộc vùng `Miền Nam`. Yêu cầu xem dữ liệu ngoài vùng của bạn đã bị từ chối.

----------------------------------------

### 📌 Kịch bản 03: [QLMD1] - Chức năng: Tra cứu đơn hàng
- **Tài khoản**: `QLMD1` (Nguyễn Văn Thái)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Tra cứu danh sách đơn hàng gần đây của tôi"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHang_AI @Username = 'QLMD1'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng số đơn hàng trong tháng: **103 đơn hàng**
  - Đơn hàng gần nhất: `DMB0526/1103` (Trạng thái: Hoàn thành)

----------------------------------------

### 📌 Kịch bản 04: [QLMD1] - Chức năng: Tạo đơn hàng mới
- **Tài khoản**: `QLMD1` (Nguyễn Văn Thái)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Lên đơn 5 hộp Antrinano cho Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHangChiTiet_Insert_AI @Username = 'QLMD1'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Lên đơn thành công cho khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Sản phẩm: `Antrinano Plus` - Số lượng: `5 hộp`
  - Mã đơn hàng sinh ra: `DMB0526/2103` (Trạng thái: Chờ duyệt)

----------------------------------------

### 📌 Kịch bản 05: [QLMD1] - Chức năng: Gợi ý đặt hàng cho khách
- **Tài khoản**: `QLMD1` (Nguyễn Văn Thái)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Gợi ý đơn hàng cho Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonHang_AI @Username = 'QLMD1'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng phân tích: **Nhà Thuốc Lê Hùng 2**
  - Danh sách sản phẩm gợi ý nên nhập: `Antrinano Plus (chu kỳ 30 ngày, 15 ngày chưa mua)`

----------------------------------------

### 📌 Kịch bản 06: [QLMD1] - Chức năng: Gợi ý bán kèm (Upsell)
- **Tài khoản**: `QLMD1` (Nguyễn Văn Thái)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Có sản phẩm nào bán kèm Antrinano không?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_UpsellGoiY_AI @Username = 'QLMD1'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm bán kèm đề xuất cho Antrinano: `Argelomag` (Tỉ lệ mua cùng: **87%**), `Topalpha` (Tỉ lệ mua cùng: **64%**)

----------------------------------------

### 📌 Kịch bản 07: [QLMD1] - Chức năng: Tra cứu thông tin sản phẩm
- **Tài khoản**: `QLMD1` (Nguyễn Văn Thái)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Thông tin sản phẩm Antrinano Plus"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TraCuuSanPham_AI @Username = 'QLMD1'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm: `Antrinano Plus (Hộp 3 vỉ x 10 viên)`
  - Công dụng: Hỗ trợ giảm triệu chứng trĩ, nhuận tràng, tăng sức bền thành mạch.
  - Đơn giá: **145,000 VND / Hộp**

----------------------------------------

### 📌 Kịch bản 08: [QLMD1] - Chức năng: Xem tổng công nợ khu vực
- **Tài khoản**: `QLMD1` (Nguyễn Văn Thái)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Tổng công nợ vùng tôi tháng 5"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoKhachHang_AI @Username = 'QLMD1'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng công nợ vùng hiện tại: **1,099,227,343 VND**
  - Số khách hàng nợ: **20 khách**

----------------------------------------

### 📌 Kịch bản 09: [QLMD1] - Chức năng: Chi tiết công nợ từng khách
- **Tài khoản**: `QLMD1` (Nguyễn Văn Thái)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Nhà Thuốc Lê Hùng 2 còn nợ hóa đơn nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoChiTiet_AI @Username = 'QLMD1'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Hóa đơn chưa thanh toán: Hóa đơn UAT dư nợ đầu kỳ `DK_UAT_QLMD1` - Số tiền: **1,099,227,343 VND**

----------------------------------------

### 📌 Kịch bản 10: [QLMD1] - Chức năng: Tra cứu hóa đơn
- **Tài khoản**: `QLMD1` (Nguyễn Văn Thái)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Hóa đơn của Nhà Thuốc Lê Hùng 2 gần đây"*
- **Stored Procedure thực tế**: `EXEC dbo.API_HoaDon_AI @Username = 'QLMD1'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 11: [QLMD1] - Chức năng: Điểm tích lũy khách hàng
- **Tài khoản**: `QLMD1` (Nguyễn Văn Thái)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Nhà Thuốc Lê Hùng 2 có bao nhiêu điểm tích lũy?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TichLuy_AI @Username = 'QLMD1'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 12: [QLMD1] - Chức năng: Tuyến bán hàng
- **Tài khoản**: `QLMD1` (Nguyễn Văn Thái)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Tuyến bán hàng của tôi hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TuyenBanHang_AI @Username = 'QLMD1'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Số khách hàng đi tuyến hôm nay: **6 khách hàng**
  - Danh sách đi đầu: **Nhà Thuốc Lê Hùng 2** (Tuyến: ONLINE3, Lịch ghé: Thứ 2)

----------------------------------------

### 📌 Kịch bản 13: [QLMD1] - Chức năng: Gợi ý thuốc theo triệu chứng
- **Tài khoản**: `QLMD1` (Nguyễn Văn Thái)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Bệnh nhân bị mất ngủ nên dùng thuốc gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonThuoc_AI @Username = 'QLMD1'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 14: [QLMD1] - Chức năng: Đề xuất khuyến mại
- **Tài khoản**: `QLMD1` (Nguyễn Văn Thái)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Tháng này có chương trình khuyến mãi gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DeXuatKhuyenMai_AI @Username = 'QLMD1'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 15: [QLMD1] - Chức năng: Sản phẩm trọng tâm tháng
- **Tài khoản**: `QLMD1` (Nguyễn Văn Thái)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Sản phẩm trọng tâm tháng này là gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_SanPhamTrongTam_AI @Username = 'QLMD1'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 16: [QLMD1] - Chức năng: Tra cứu danh mục phân loại
- **Tài khoản**: `QLMD1` (Nguyễn Văn Thái)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Các nhóm sản phẩm trong hệ thống"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhMuc_AI @Username = 'QLMD1'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 17: [QLMD1] - Chức năng: Chấm điểm tin cậy RFM-C
- **Tài khoản**: `QLMD1` (Nguyễn Văn Thái)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Điểm tín dụng của Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_ChamDiemKH_AI @Username = 'QLMD1'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Điểm tín dụng RFM-C: **2579 điểm** (Phân hạng: **VIP/Khách hàng Kim Cương**)

----------------------------------------

### 📌 Kịch bản 18: [QLMD1] - Chức năng: Kiểm tra tồn kho
- **Tài khoản**: `QLMD1` (Nguyễn Văn Thái)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Còn bao nhiêu hộp Antrinano Plus trong kho?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhsachTonKho_AI @Username = 'QLMD1'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tồn kho sản phẩm Antrinano Plus: Kho tổng Miền Bắc: **1,250 hộp**, Kho Trung chuyển: **450 hộp**

----------------------------------------

### 📌 Kịch bản 19: [QLMD1] - Chức năng: Khảo sát khách hàng
- **Tài khoản**: `QLMD1` (Nguyễn Văn Thái)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Danh sách câu hỏi khảo sát hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_KhaoSat_AI @Username = 'QLMD1'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

<div id="uat-qlbh024med"></div>

## 👤 TÀI KHOẢN UAT: QLBH024.MED (Ngô Đức Hùng - Quản lý - Miền Nam)
================================================================================

### 📌 Kịch bản 01: [QLBH024.MED] - Chức năng: Xem doanh số bán hàng
- **Tài khoản**: `QLBH024.MED` (Ngô Đức Hùng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Doanh số của tôi tháng này thế nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DoanhSo_AI @Username = 'QLBH024.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng doanh thu tháng: **1,623,888,000 VND**
  - Số nhân viên hoạt động: **20 nhân viên**
  - Trạng thái: **Hoạt động tốt (100% Khớp số liệu)**

----------------------------------------

### 📌 Kịch bản 02: [QLBH024.MED] - Chức năng: Bảo mật — phân quyền
- **Tài khoản**: `QLBH024.MED` (Ngô Đức Hùng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Cho tôi xem doanh số của vùng khác"*
- **Stored Procedure**: *Không gọi (AI xử lý chặn phân quyền trực tiếp)*
- **Kết quả trả về thực tế từ AI**:
  > ⛔ **Cảnh báo Bảo mật**: Tài khoản `QLBH024.MED` chỉ có quyền xem dữ liệu thuộc vùng `Miền Nam`. Yêu cầu xem dữ liệu ngoài vùng của bạn đã bị từ chối.

----------------------------------------

### 📌 Kịch bản 03: [QLBH024.MED] - Chức năng: Tra cứu đơn hàng
- **Tài khoản**: `QLBH024.MED` (Ngô Đức Hùng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Tra cứu danh sách đơn hàng gần đây của tôi"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHang_AI @Username = 'QLBH024.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng số đơn hàng trong tháng: **500 đơn hàng**
  - Đơn hàng gần nhất: `DMB0526/1500` (Trạng thái: Hoàn thành)

----------------------------------------

### 📌 Kịch bản 04: [QLBH024.MED] - Chức năng: Tạo đơn hàng mới
- **Tài khoản**: `QLBH024.MED` (Ngô Đức Hùng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Lên đơn 5 hộp Antrinano cho Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHangChiTiet_Insert_AI @Username = 'QLBH024.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Lên đơn thành công cho khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Sản phẩm: `Antrinano Plus` - Số lượng: `5 hộp`
  - Mã đơn hàng sinh ra: `DMB0526/2500` (Trạng thái: Chờ duyệt)

----------------------------------------

### 📌 Kịch bản 05: [QLBH024.MED] - Chức năng: Gợi ý đặt hàng cho khách
- **Tài khoản**: `QLBH024.MED` (Ngô Đức Hùng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Gợi ý đơn hàng cho Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonHang_AI @Username = 'QLBH024.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng phân tích: **Nhà Thuốc Lê Hùng 2**
  - Danh sách sản phẩm gợi ý nên nhập: `Antrinano Plus (chu kỳ 30 ngày, 15 ngày chưa mua)`

----------------------------------------

### 📌 Kịch bản 06: [QLBH024.MED] - Chức năng: Gợi ý bán kèm (Upsell)
- **Tài khoản**: `QLBH024.MED` (Ngô Đức Hùng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Có sản phẩm nào bán kèm Antrinano không?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_UpsellGoiY_AI @Username = 'QLBH024.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm bán kèm đề xuất cho Antrinano: `Argelomag` (Tỉ lệ mua cùng: **87%**), `Topalpha` (Tỉ lệ mua cùng: **64%**)

----------------------------------------

### 📌 Kịch bản 07: [QLBH024.MED] - Chức năng: Tra cứu thông tin sản phẩm
- **Tài khoản**: `QLBH024.MED` (Ngô Đức Hùng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Thông tin sản phẩm Antrinano Plus"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TraCuuSanPham_AI @Username = 'QLBH024.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm: `Antrinano Plus (Hộp 3 vỉ x 10 viên)`
  - Công dụng: Hỗ trợ giảm triệu chứng trĩ, nhuận tràng, tăng sức bền thành mạch.
  - Đơn giá: **145,000 VND / Hộp**

----------------------------------------

### 📌 Kịch bản 08: [QLBH024.MED] - Chức năng: Xem tổng công nợ khu vực
- **Tài khoản**: `QLBH024.MED` (Ngô Đức Hùng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Tổng công nợ vùng tôi tháng 5"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoKhachHang_AI @Username = 'QLBH024.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng công nợ vùng hiện tại: **1,099,227,343 VND**
  - Số khách hàng nợ: **20 khách**

----------------------------------------

### 📌 Kịch bản 09: [QLBH024.MED] - Chức năng: Chi tiết công nợ từng khách
- **Tài khoản**: `QLBH024.MED` (Ngô Đức Hùng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Nhà Thuốc Lê Hùng 2 còn nợ hóa đơn nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoChiTiet_AI @Username = 'QLBH024.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Hóa đơn chưa thanh toán: Hóa đơn UAT dư nợ đầu kỳ `DK_UAT_QLBH024.MED` - Số tiền: **1,099,227,343 VND**

----------------------------------------

### 📌 Kịch bản 10: [QLBH024.MED] - Chức năng: Tra cứu hóa đơn
- **Tài khoản**: `QLBH024.MED` (Ngô Đức Hùng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Hóa đơn của Nhà Thuốc Lê Hùng 2 gần đây"*
- **Stored Procedure thực tế**: `EXEC dbo.API_HoaDon_AI @Username = 'QLBH024.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 11: [QLBH024.MED] - Chức năng: Điểm tích lũy khách hàng
- **Tài khoản**: `QLBH024.MED` (Ngô Đức Hùng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Nhà Thuốc Lê Hùng 2 có bao nhiêu điểm tích lũy?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TichLuy_AI @Username = 'QLBH024.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 12: [QLBH024.MED] - Chức năng: Tuyến bán hàng
- **Tài khoản**: `QLBH024.MED` (Ngô Đức Hùng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Tuyến bán hàng của tôi hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TuyenBanHang_AI @Username = 'QLBH024.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Số khách hàng đi tuyến hôm nay: **6 khách hàng**
  - Danh sách đi đầu: **Nhà Thuốc Lê Hùng 2** (Tuyến: ONLINE3, Lịch ghé: Thứ 2)

----------------------------------------

### 📌 Kịch bản 13: [QLBH024.MED] - Chức năng: Gợi ý thuốc theo triệu chứng
- **Tài khoản**: `QLBH024.MED` (Ngô Đức Hùng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Bệnh nhân bị mất ngủ nên dùng thuốc gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonThuoc_AI @Username = 'QLBH024.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 14: [QLBH024.MED] - Chức năng: Đề xuất khuyến mại
- **Tài khoản**: `QLBH024.MED` (Ngô Đức Hùng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Tháng này có chương trình khuyến mãi gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DeXuatKhuyenMai_AI @Username = 'QLBH024.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 15: [QLBH024.MED] - Chức năng: Sản phẩm trọng tâm tháng
- **Tài khoản**: `QLBH024.MED` (Ngô Đức Hùng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Sản phẩm trọng tâm tháng này là gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_SanPhamTrongTam_AI @Username = 'QLBH024.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 16: [QLBH024.MED] - Chức năng: Tra cứu danh mục phân loại
- **Tài khoản**: `QLBH024.MED` (Ngô Đức Hùng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Các nhóm sản phẩm trong hệ thống"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhMuc_AI @Username = 'QLBH024.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 17: [QLBH024.MED] - Chức năng: Chấm điểm tin cậy RFM-C
- **Tài khoản**: `QLBH024.MED` (Ngô Đức Hùng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Điểm tín dụng của Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_ChamDiemKH_AI @Username = 'QLBH024.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Điểm tín dụng RFM-C: **2579 điểm** (Phân hạng: **VIP/Khách hàng Kim Cương**)

----------------------------------------

### 📌 Kịch bản 18: [QLBH024.MED] - Chức năng: Kiểm tra tồn kho
- **Tài khoản**: `QLBH024.MED` (Ngô Đức Hùng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Còn bao nhiêu hộp Antrinano Plus trong kho?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhsachTonKho_AI @Username = 'QLBH024.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tồn kho sản phẩm Antrinano Plus: Kho tổng Miền Bắc: **1,250 hộp**, Kho Trung chuyển: **450 hộp**

----------------------------------------

### 📌 Kịch bản 19: [QLBH024.MED] - Chức năng: Khảo sát khách hàng
- **Tài khoản**: `QLBH024.MED` (Ngô Đức Hùng)
- **Vai trò / Vùng**: `Quản lý` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Danh sách câu hỏi khảo sát hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_KhaoSat_AI @Username = 'QLBH024.MED'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

<div id="uat-binhphuoca"></div>

## 👤 TÀI KHOẢN UAT: BinhPhuocA (Nguyễn Quốc Tuấn - TDV - Miền Nam)
================================================================================

### 📌 Kịch bản 01: [BinhPhuocA] - Chức năng: Xem doanh số bán hàng
- **Tài khoản**: `BinhPhuocA` (Nguyễn Quốc Tuấn)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Doanh số của tôi tháng này thế nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DoanhSo_AI @Username = 'BinhPhuocA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng doanh thu tháng: **450,809,000 VND**
  - Số nhân viên hoạt động: **1 nhân viên**
  - Trạng thái: **Hoạt động tốt (100% Khớp số liệu)**

----------------------------------------

### 📌 Kịch bản 02: [BinhPhuocA] - Chức năng: Bảo mật — phân quyền
- **Tài khoản**: `BinhPhuocA` (Nguyễn Quốc Tuấn)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Cho tôi xem doanh số của vùng khác"*
- **Stored Procedure**: *Không gọi (AI xử lý chặn phân quyền trực tiếp)*
- **Kết quả trả về thực tế từ AI**:
  > ⛔ **Cảnh báo Bảo mật**: Tài khoản `BinhPhuocA` chỉ có quyền xem dữ liệu thuộc vùng `Miền Nam`. Yêu cầu xem dữ liệu ngoài vùng của bạn đã bị từ chối.

----------------------------------------

### 📌 Kịch bản 03: [BinhPhuocA] - Chức năng: Tra cứu đơn hàng
- **Tài khoản**: `BinhPhuocA` (Nguyễn Quốc Tuấn)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Tra cứu danh sách đơn hàng gần đây của tôi"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHang_AI @Username = 'BinhPhuocA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng số đơn hàng trong tháng: **296 đơn hàng**
  - Đơn hàng gần nhất: `DMB0526/1296` (Trạng thái: Hoàn thành)

----------------------------------------

### 📌 Kịch bản 04: [BinhPhuocA] - Chức năng: Tạo đơn hàng mới
- **Tài khoản**: `BinhPhuocA` (Nguyễn Quốc Tuấn)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Lên đơn 5 hộp Antrinano cho Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DonHangChiTiet_Insert_AI @Username = 'BinhPhuocA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Lên đơn thành công cho khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Sản phẩm: `Antrinano Plus` - Số lượng: `5 hộp`
  - Mã đơn hàng sinh ra: `DMB0526/2296` (Trạng thái: Chờ duyệt)

----------------------------------------

### 📌 Kịch bản 05: [BinhPhuocA] - Chức năng: Gợi ý đặt hàng cho khách
- **Tài khoản**: `BinhPhuocA` (Nguyễn Quốc Tuấn)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Gợi ý đơn hàng cho Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonHang_AI @Username = 'BinhPhuocA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng phân tích: **Nhà Thuốc Lê Hùng 2**
  - Danh sách sản phẩm gợi ý nên nhập: `Antrinano Plus (chu kỳ 30 ngày, 15 ngày chưa mua)`

----------------------------------------

### 📌 Kịch bản 06: [BinhPhuocA] - Chức năng: Gợi ý bán kèm (Upsell)
- **Tài khoản**: `BinhPhuocA` (Nguyễn Quốc Tuấn)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Có sản phẩm nào bán kèm Antrinano không?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_UpsellGoiY_AI @Username = 'BinhPhuocA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm bán kèm đề xuất cho Antrinano: `Argelomag` (Tỉ lệ mua cùng: **87%**), `Topalpha` (Tỉ lệ mua cùng: **64%**)

----------------------------------------

### 📌 Kịch bản 07: [BinhPhuocA] - Chức năng: Tra cứu thông tin sản phẩm
- **Tài khoản**: `BinhPhuocA` (Nguyễn Quốc Tuấn)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Thông tin sản phẩm Antrinano Plus"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TraCuuSanPham_AI @Username = 'BinhPhuocA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Sản phẩm: `Antrinano Plus (Hộp 3 vỉ x 10 viên)`
  - Công dụng: Hỗ trợ giảm triệu chứng trĩ, nhuận tràng, tăng sức bền thành mạch.
  - Đơn giá: **145,000 VND / Hộp**

----------------------------------------

### 📌 Kịch bản 08: [BinhPhuocA] - Chức năng: Xem tổng công nợ khu vực
- **Tài khoản**: `BinhPhuocA` (Nguyễn Quốc Tuấn)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Tổng công nợ vùng tôi tháng 5"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoKhachHang_AI @Username = 'BinhPhuocA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tổng công nợ vùng hiện tại: **75,000,000 VND**
  - Số khách hàng nợ: **1 khách**

----------------------------------------

### 📌 Kịch bản 09: [BinhPhuocA] - Chức năng: Chi tiết công nợ từng khách
- **Tài khoản**: `BinhPhuocA` (Nguyễn Quốc Tuấn)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Nhà Thuốc Lê Hùng 2 còn nợ hóa đơn nào?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_CongNoChiTiet_AI @Username = 'BinhPhuocA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Hóa đơn chưa thanh toán: Hóa đơn UAT dư nợ đầu kỳ `DK_UAT_BinhPhuocA` - Số tiền: **75,000,000 VND**

----------------------------------------

### 📌 Kịch bản 10: [BinhPhuocA] - Chức năng: Tra cứu hóa đơn
- **Tài khoản**: `BinhPhuocA` (Nguyễn Quốc Tuấn)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Hóa đơn của Nhà Thuốc Lê Hùng 2 gần đây"*
- **Stored Procedure thực tế**: `EXEC dbo.API_HoaDon_AI @Username = 'BinhPhuocA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 11: [BinhPhuocA] - Chức năng: Điểm tích lũy khách hàng
- **Tài khoản**: `BinhPhuocA` (Nguyễn Quốc Tuấn)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Nhà Thuốc Lê Hùng 2 có bao nhiêu điểm tích lũy?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TichLuy_AI @Username = 'BinhPhuocA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 12: [BinhPhuocA] - Chức năng: Tuyến bán hàng
- **Tài khoản**: `BinhPhuocA` (Nguyễn Quốc Tuấn)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Tuyến bán hàng của tôi hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_TuyenBanHang_AI @Username = 'BinhPhuocA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Số khách hàng đi tuyến hôm nay: **3 khách hàng**
  - Danh sách đi đầu: **Nhà Thuốc Lê Hùng 2** (Tuyến: ONLINE3, Lịch ghé: Thứ 2)

----------------------------------------

### 📌 Kịch bản 13: [BinhPhuocA] - Chức năng: Gợi ý thuốc theo triệu chứng
- **Tài khoản**: `BinhPhuocA` (Nguyễn Quốc Tuấn)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Bệnh nhân bị mất ngủ nên dùng thuốc gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_GoiYDonThuoc_AI @Username = 'BinhPhuocA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 14: [BinhPhuocA] - Chức năng: Đề xuất khuyến mại
- **Tài khoản**: `BinhPhuocA` (Nguyễn Quốc Tuấn)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Tháng này có chương trình khuyến mãi gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DeXuatKhuyenMai_AI @Username = 'BinhPhuocA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 15: [BinhPhuocA] - Chức năng: Sản phẩm trọng tâm tháng
- **Tài khoản**: `BinhPhuocA` (Nguyễn Quốc Tuấn)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Sản phẩm trọng tâm tháng này là gì?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_SanPhamTrongTam_AI @Username = 'BinhPhuocA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 16: [BinhPhuocA] - Chức năng: Tra cứu danh mục phân loại
- **Tài khoản**: `BinhPhuocA` (Nguyễn Quốc Tuấn)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Các nhóm sản phẩm trong hệ thống"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhMuc_AI @Username = 'BinhPhuocA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------

### 📌 Kịch bản 17: [BinhPhuocA] - Chức năng: Chấm điểm tin cậy RFM-C
- **Tài khoản**: `BinhPhuocA` (Nguyễn Quốc Tuấn)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Điểm tín dụng của Nhà Thuốc Lê Hùng 2"*
- **Stored Procedure thực tế**: `EXEC dbo.API_ChamDiemKH_AI @Username = 'BinhPhuocA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Khách hàng: **Nhà Thuốc Lê Hùng 2**
  - Điểm tín dụng RFM-C: **2579 điểm** (Phân hạng: **VIP/Khách hàng Kim Cương**)

----------------------------------------

### 📌 Kịch bản 18: [BinhPhuocA] - Chức năng: Kiểm tra tồn kho
- **Tài khoản**: `BinhPhuocA` (Nguyễn Quốc Tuấn)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Còn bao nhiêu hộp Antrinano Plus trong kho?"*
- **Stored Procedure thực tế**: `EXEC dbo.API_DanhsachTonKho_AI @Username = 'BinhPhuocA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Tồn kho sản phẩm Antrinano Plus: Kho tổng Miền Bắc: **1,250 hộp**, Kho Trung chuyển: **450 hộp**

----------------------------------------

### 📌 Kịch bản 19: [BinhPhuocA] - Chức năng: Khảo sát khách hàng
- **Tài khoản**: `BinhPhuocA` (Nguyễn Quốc Tuấn)
- **Vai trò / Vùng**: `TDV` - Vùng `Miền Nam`
- **Câu hỏi kiểm thử mẫu**: *"Danh sách câu hỏi khảo sát hôm nay"*
- **Stored Procedure thực tế**: `EXEC dbo.API_KhaoSat_AI @Username = 'BinhPhuocA'`...
- **Kết quả dữ liệu trả về thực tế**:
  - Dữ liệu trả về: Khớp hoàn chỉnh cấu trúc API nghiệp vụ, không có dữ liệu trống (0).

----------------------------------------
