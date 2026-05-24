# HƯỚNG DẪN SỬ DỤNG HỆ THỐNG TRỢ LÝ AI MEDSTAND

*Tài liệu hướng dẫn nghiệp vụ & Kịch bản kiểm thử dành cho Business*
*Phiên bản: V38 (Tháng 05/2026)*

---

## PHẦN 1: THÔNG TIN CHUNG

### 1.1 Giới thiệu mục đích
Tài liệu này hướng dẫn cách sử dụng Trợ lý AI Medstand (tích hợp trên hệ thống medtest.bms79.com). Trợ lý AI Medstand giúp đội ngũ kinh doanh tra cứu dữ liệu doanh số, tồn kho, công nợ, gợi ý bán hàng và lên đơn hàng nhanh chóng bằng ngôn ngữ tự nhiên thông qua cửa sổ chat tương tự như Zalo/Viber.

### 1.2 Đối tượng sử dụng
- **Trình dược viên (Sales)**: Tra cứu doanh số cá nhân, gợi ý đặt hàng, kiểm tra tồn kho, lập đơn hàng mới trực tiếp qua chat.
- **Quản lý vùng (Manager)**: Theo dõi doanh số nhóm, kiểm tra đơn hàng chờ duyệt, quản lý công nợ và hóa đơn trong khu vực phụ trách.
- **Ban Giám đốc (Director)**: Xem báo cáo doanh số tổng quan toàn quốc, kiểm tra sản phẩm trọng tâm và đề xuất khuyến mãi.

---

## PHẦN 2: CHUẨN BỊ BAN ĐẦU

Để bắt đầu sử dụng hệ thống Trợ lý AI, người dùng cần chuẩn bị:
1. **Thiết bị**: Điện thoại thông minh (Android/iPhone) hoặc máy tính có kết nối Internet.
2. **Trình duyệt**: Khuyến nghị sử dụng **Google Chrome** hoặc **Safari** để có trải nghiệm hiển thị mượt mà nhất.
3. **Địa chỉ truy cập**: Vào website `https://medtest.bms79.com`.
4. **Tài khoản đăng nhập**: Sử dụng tên đăng nhập và mật khẩu nội bộ do bộ phận IT cung cấp (Tham khảo danh sách tài khoản kiểm thử UAT ở phần dưới).

*Lưu ý bảo mật*: Hệ thống tự động phân quyền dữ liệu theo phạm vi phụ trách của từng tài khoản đăng nhập. Nhân sự miền nào chỉ xem được dữ liệu miền đó, tuyệt đối bảo mật thông tin.

---

## PHẦN 3: HƯỚNG DẪN SỬ DỤNG CHI TIẾT (CÁC QUY TRÌNH CỐT LÕI)

### Quy trình 1: Tra cứu doanh số & Báo cáo bán hàng
- **Bước 1**: Nhấp vào biểu tượng Chatbot ở góc dưới cùng bên phải màn hình để mở cửa sổ chat.
- **Bước 2**: Nhập câu hỏi tự nhiên bằng tiếng Việt (có dấu hoặc không dấu).
  *Ví dụ:* `doanh so cua toi thang nay` hoặc `doanh thu tuan nay`
- **Bước 3**: Nhấn nút **Gửi** (hoặc Enter). AI sẽ truy xuất dữ liệu tức thời và hiển thị bảng/biểu đồ doanh số ngay trong khung chat.

> 📸 **[KHUNG DÁN HÌNH ẢNH MINH HỌA - QUY TRÌNH 1: TRA CỨU DOANH SỐ]**
> *(Vui lòng chụp ảnh màn hình kết quả tra cứu doanh số/báo cáo hiển thị trên giao diện chat và dán vào đây)*

### Quy trình 2: Lập đơn hàng nhanh qua Chat (Không cần bấm nhiều bước)
- **Bước 1**: Trong ô nhập liệu, gõ tên sản phẩm, số lượng và tên nhà thuốc cần lên đơn.
  *Ví dụ:* `Lên đơn 5 hộp Antrinano cho Quầy Thuốc Thu Thủy`
  *Mẹo*: Không cần nhớ mã sản phẩm, chỉ cần viết tắt tên nhà thuốc, AI sẽ tự động dò tìm thông minh.
- **Bước 2**: AI phân tích câu lệnh, tự động nhận diện sản phẩm, số lượng và thông tin nhà thuốc trong giỏ hàng mẫu, sau đó phản hồi lại để bạn kiểm tra.
- **Bước 3**: Đọc kỹ thông tin hiển thị trên màn hình xác nhận, nhấn nút **Xác nhận** để tạo đơn. Hệ thống sẽ cấp mã đơn hàng mới dạng `DMB0526/...` ở trạng thái "Chờ duyệt".

> 📸 **[KHUNG DÁN HÌNH ẢNH MINH HỌA - QUY TRÌNH 2: LẬP ĐƠN HÀNG NHANH]**
> *(Vui lòng chụp ảnh màn hình kết quả lập đơn, phản hồi xác nhận của AI và mã đơn hàng và dán vào đây)*

### Quy trình 3: Xem gợi ý đặt hàng & Bán thêm (Upsell)
- **Bước 1**: Nhập yêu cầu gợi ý đặt hàng cho một khách hàng cụ thể.
  *Ví dụ:* `Gợi ý đơn hàng cho Quầy Thuốc Thu Thủy`
- **Bước 2**: AI phân tích lịch sử mua hàng, tần suất đặt hàng của nhà thuốc đó và đưa ra danh sách sản phẩm gợi ý nên chào kèm lý do cụ thể (ví dụ: "Sản phẩm A sắp hết chu kỳ sử dụng").
- **Bước 3**: Để tăng thêm doanh thu trên mỗi đơn, gõ yêu cầu bán kèm:
  *Ví dụ:* `Có sản phẩm nào bán kèm Antrinano không?`
  AI sẽ gợi ý các sản phẩm bổ trợ (Argelomag, Topalpha...) thường được khách hàng mua cùng nhau.

> 📸 **[KHUNG DÁN HÌNH ẢNH MINH HỌA - QUY TRÌNH 3: GỢI Ý BÁN HÀNG & UPSELL]**
> *(Vui lòng chụp ảnh màn hình kết quả gợi ý đặt hàng và các sản phẩm đề xuất bán thêm và dán vào đây)*

### Quy trình 4: Quản lý công nợ & Hóa đơn (Dành cho Quản lý)
- **Bước 1**: Gõ yêu cầu xem tổng công nợ khu vực.
  *Ví dụ:* `Tổng công nợ vùng tôi tháng 5`
  AI trả về bảng tổng hợp nợ, danh sách nhà thuốc còn nợ và sắp xếp từ nợ nhiều đến nợ ít.
- **Bước 2**: Tra cứu chi tiết hóa đơn chưa thanh toán của một khách hàng:
  *Ví dụ:* `Nhà Thuốc Lê Hùng 2 còn nợ hóa đơn nào?`
  AI trả về danh sách hóa đơn cụ thể kèm số tiền và ngày đến hạn thanh toán để tiện đôn đốc thu hồi nợ.

> 📸 **[KHUNG DÁN HÌNH ẢNH MINH HỌA - QUY TRÌNH 4: QUẢN LÝ CÔNG NỢ & HÓA ĐƠN]**
> *(Vui lòng chụp ảnh màn hình kết quả tra cứu tổng công nợ hoặc danh sách hóa đơn nợ chi tiết và dán vào đây)*

### Quy trình 5: Cập nhật tri thức mới lên hệ thống AI (Dành cho Quản lý trở lên)
Nhằm chủ động cập nhật các tài liệu nội bộ (Chính sách bán hàng, Catalogue sản phẩm mới, Chương trình khuyến mãi) mà không cần can thiệp kỹ thuật:
- **Bước 1**: Truy cập menu **"Quản lý Trợ lý (RAG)"** tại Cổng cập nhật tri thức AI (`#/rag-admin`).
- **Bước 2**: Tại vùng kéo thả tài liệu, chọn hoặc kéo thả trực tiếp tài liệu cần nạp (`PDF`, `DOCX`, `XLSX`, hoặc hình ảnh poster `PNG`/`JPG`).
- **Bước 3**: Nhập **Tên tài liệu / Tiêu đề** và lựa chọn **Ngày hết hạn hiệu lực** của tài liệu (nếu có).
- **Bước 4**: Nhấn nút **"Đồng bộ Tri thức lên AI"**.
- **Bước 5**: Khi hộp thoại **Xác nhận** xuất hiện, bấm **Đồng ý**. Hệ thống sẽ tự động bóc tách chữ qua OCR thông minh (đối với ảnh) hoặc băm phân đoạn (đối với văn bản) và lưu trữ bảo mật vào Qdrant Vector Store của công ty.
- **Bước 6**: Sau 5-10 giây, hộp thoại báo cáo **Thành công** sẽ xuất hiện. Trợ lý AI lúc này đã tự động được học tri thức mới và sẵn sàng tư vấn nghiệp vụ cho toàn bộ đội ngũ bán hàng ngay lập tức.

> 📸 **[KHUNG DÁN HÌNH ẢNH MINH HỌA - QUY TRÌNH 5: CẬP NHẬT TRI THỨC RAG]**
> *(Vui lòng chụp ảnh màn hình quá trình cập nhật tài liệu hoặc thông báo thành công từ RAG Admin và dán vào đây)*

---

## PHẦN 4: CÁC LỖI THƯỜNG GẶP VÀ CÁCH KHẮC PHỤC (FAQ / TROUBLESHOOTING)

- **Vấn đề 1: Tôi quên mật khẩu đăng nhập phải làm thế nào?**
  *Khắc phục*: Hệ thống hiện tại chưa có tính năng tự reset mật khẩu qua email. Bạn vui lòng liên hệ trực tiếp bộ phận IT nội bộ, cung cấp Tên đăng nhập để được cấp lại mật khẩu mới trong vòng 24 giờ.
  
- **Vấn đề 2: AI báo lỗi "Không có quyền xem thông tin này"**
  *Khắc phục*: Đây không phải lỗi hệ thống mà là tính năng bảo mật phân quyền đang hoạt động đúng. Tài khoản của bạn chỉ xem được dữ liệu trong vùng mình phụ trách. Việc cố tình tra cứu số liệu của nhân sự khác vùng sẽ bị AI từ chối.
  
- **Vấn đề 3: Đơn hàng lập nhầm qua chat có hủy được không?**
  *Khắc phục*: Được. Sau khi tạo đơn qua AI, đơn sẽ ở trạng thái "Chờ duyệt". Bạn hãy liên hệ ngay với Quản lý vùng của mình để yêu cầu từ chối duyệt/hủy đơn hàng đó trên hệ thống trước khi kho xuất hàng.

- **Vấn đề 4: AI phản hồi chậm hoặc không gửi được tin nhắn**
  *Khắc phục*: Kiểm tra lại kết nối mạng 3G/4G/Wifi trên điện thoại của bạn. Nếu mạng ổn định, hãy thử F5 (làm mới) lại trang web medtest.bms79.com và đăng nhập lại.

---

## PHẦN 5: THÔNG TIN LIÊN HỆ HỖ TRỢ

Trong quá trình sử dụng hệ thống Medstand AI, nếu gặp bất kỳ khó khăn hoặc sự cố kỹ thuật nào ngoài hướng dẫn trên, xin vui lòng liên hệ:
- **Hotline hỗ trợ kỹ thuật (IT Medstand)**: 1900.xxxx (Nhánh số 3)
- **Email tiếp nhận sự cố**: it-support@medstand.vn
- **Thời gian làm việc**: Từ 8:00 đến 17:30 (Thứ 2 đến Thứ 7 hàng tuần)

---

## PHẦN 6: DANH SÁCH TÀI KHOẢN UAT & DỮ LIỆU KIỂM THỬ THỰC TẾ

### 6.1 Bảng 1: Danh sách tài khoản kiểm thử UAT (Ghép đôi Quản lý & TDV tương ứng)

| STT | Quản lý (Manager) | Tài khoản QL | Trình dược viên (TDV/Sale) | Tài khoản TDV | Vùng phụ trách | Khách hàng mẫu (UAT) |
| :---: | :--- | :---: | :--- | :---: | :---: | :--- |
| 1 | Mai Anh Tuấn | `QLBH013.MED` | Đoàn Văn Thừa | `NAMDINHB.MED` | Miền Bắc | Quầy Thuốc Thu Thủy (`HYA107`) |
| 2 | Trần Văn Hướng | `QLBH016.MED` | Nguyễn Công Đức | `BACNINHA.MED` | Miền Bắc | Quầy Thuốc Thu Thủy (`HYA107`) |
| 3 | Nguyễn Thế Anh | `QLBH005.MED` | Lê Thị Hiền | `HUEB.MED` | Miền Trung | Nhà Thuốc Lê Hùng 2 (`DNA014`) |
| 4 | Nguyễn Văn Việt Anh | `QLBH010.MED` | Lê Thị Lệ | `DANANGA.MED` | Miền Trung | Nhà Thuốc Lê Hùng 2 (`DNA014`) |
| 5 | Trần Văn Luân | `QLMN2` | Nguyễn Thị Thu Thảo | `CanThoA` | Miền Nam | Nhà Thuốc Lê Hùng 2 (`DNA014`) |
| 6 | Nguyễn Văn Thái | `QLMD1` | Nguyễn Quốc Tuấn | `BinhPhuocA` | Miền Nam | Nhà Thuốc Lê Hùng 2 (`DNA014`) |
| 7 | Ngô Đức Hùng | `QLBH024.MED` | Nguyễn Quốc Tuấn | `BinhPhuocA` | Miền Nam | Nhà Thuốc Lê Hùng 2 (`DNA014`) |

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

### 6.3 Kịch bản và Câu lệnh Kiểm thử UAT chi tiết theo từng Cặp tài khoản (Manager - Sale)

### 6.3.1 Cặp 1 (Miền Bắc): Quản lý Mai Anh Tuấn & TDV Đoàn Văn Thừa
- **Vùng phụ trách (Region)**: Miền Bắc
- **Tài khoản Quản lý (Manager)**: `QLBH013.MED` (Họ tên: Mai Anh Tuấn)
- **Tài khoản Trình dược viên (TDV/Sale)**: `NAMDINHB.MED` (Họ tên: Đoàn Văn Thừa)
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

#### HÌNH ẢNH MINH HỌA KIỂM THỬ THỰC TẾ (CẶP 1)

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ DOANH SỐ & ĐƠN HÀNG (STT 01, 03)]**
> *(Chụp ảnh màn hình kết quả tra cứu doanh số/báo cáo và danh sách đơn hàng gần đây trên tài khoản Quản lý & TDV)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ BẢO MẬT PHÂN QUYỀN (STT 02)]**
> *(Chụp ảnh màn hình tin nhắn từ chối của AI khi cố tình tra cứu chéo tài khoản hoặc ngoài vùng)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ LÊN ĐƠN NHANH QUA CHAT (STT 04, 07, 18)]**
> *(Chụp ảnh màn hình hội thoại lên đơn, tin nhắn xác nhận từ AI và kiểm tra thông tin/tồn kho sản phẩm)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ GỢI Ý THÔNG MINH & UPSELL (STT 05, 06, 13, 14, 15)]**
> *(Chụp ảnh màn hình AI gợi ý đặt hàng, gợi ý bán thêm upsell, gợi ý theo triệu chứng hoặc khuyến mại)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ CÔNG NỢ & NGHIỆP VỤ BỔ TRỢ (STT 08, 09, 10, 11, 12, 16, 17, 19)]**
> *(Chụp ảnh màn hình tra cứu công nợ, danh sách hóa đơn, lịch đi tuyến, điểm tích lũy hoặc bài khảo sát)*

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

#### HÌNH ẢNH MINH HỌA KIỂM THỬ THỰC TẾ (CẶP 2)

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ DOANH SỐ & ĐƠN HÀNG (STT 01, 03)]**
> *(Chụp ảnh màn hình kết quả tra cứu doanh số/báo cáo và danh sách đơn hàng gần đây trên tài khoản Quản lý & TDV)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ BẢO MẬT PHÂN QUYỀN (STT 02)]**
> *(Chụp ảnh màn hình tin nhắn từ chối của AI khi cố tình tra cứu chéo tài khoản hoặc ngoài vùng)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ LÊN ĐƠN NHANH QUA CHAT (STT 04, 07, 18)]**
> *(Chụp ảnh màn hình hội thoại lên đơn, tin nhắn xác nhận từ AI và kiểm tra thông tin/tồn kho sản phẩm)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ GỢI Ý THÔNG MINH & UPSELL (STT 05, 06, 13, 14, 15)]**
> *(Chụp ảnh màn hình AI gợi ý đặt hàng, gợi ý bán thêm upsell, gợi ý theo triệu chứng hoặc khuyến mại)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ CÔNG NỢ & NGHIỆP VỤ BỔ TRỢ (STT 08, 09, 10, 11, 12, 16, 17, 19)]**
> *(Chụp ảnh màn hình tra cứu công nợ, danh sách hóa đơn, lịch đi tuyến, điểm tích lũy hoặc bài khảo sát)*

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

#### HÌNH ẢNH MINH HỌA KIỂM THỬ THỰC TẾ (CẶP 3)

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ DOANH SỐ & ĐƠN HÀNG (STT 01, 03)]**
> *(Chụp ảnh màn hình kết quả tra cứu doanh số/báo cáo và danh sách đơn hàng gần đây trên tài khoản Quản lý & TDV)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ BẢO MẬT PHÂN QUYỀN (STT 02)]**
> *(Chụp ảnh màn hình tin nhắn từ chối của AI khi cố tình tra cứu chéo tài khoản hoặc ngoài vùng)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ LÊN ĐƠN NHANH QUA CHAT (STT 04, 07, 18)]**
> *(Chụp ảnh màn hình hội thoại lên đơn, tin nhắn xác nhận từ AI và kiểm tra thông tin/tồn kho sản phẩm)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ GỢI Ý THÔNG MINH & UPSELL (STT 05, 06, 13, 14, 15)]**
> *(Chụp ảnh màn hình AI gợi ý đặt hàng, gợi ý bán thêm upsell, gợi ý theo triệu chứng hoặc khuyến mại)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ CÔNG NỢ & NGHIỆP VỤ BỔ TRỢ (STT 08, 09, 10, 11, 12, 16, 17, 19)]**
> *(Chụp ảnh màn hình tra cứu công nợ, danh sách hóa đơn, lịch đi tuyến, điểm tích lũy hoặc bài khảo sát)*

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

#### HÌNH ẢNH MINH HỌA KIỂM THỬ THỰC TẾ (CẶP 4)

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ DOANH SỐ & ĐƠN HÀNG (STT 01, 03)]**
> *(Chụp ảnh màn hình kết quả tra cứu doanh số/báo cáo và danh sách đơn hàng gần đây trên tài khoản Quản lý & TDV)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ BẢO MẬT PHÂN QUYỀN (STT 02)]**
> *(Chụp ảnh màn hình tin nhắn từ chối của AI khi cố tình tra cứu chéo tài khoản hoặc ngoài vùng)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ LÊN ĐƠN NHANH QUA CHAT (STT 04, 07, 18)]**
> *(Chụp ảnh màn hình hội thoại lên đơn, tin nhắn xác nhận từ AI và kiểm tra thông tin/tồn kho sản phẩm)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ GỢI Ý THÔNG MINH & UPSELL (STT 05, 06, 13, 14, 15)]**
> *(Chụp ảnh màn hình AI gợi ý đặt hàng, gợi ý bán thêm upsell, gợi ý theo triệu chứng hoặc khuyến mại)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ CÔNG NỢ & NGHIỆP VỤ BỔ TRỢ (STT 08, 09, 10, 11, 12, 16, 17, 19)]**
> *(Chụp ảnh màn hình tra cứu công nợ, danh sách hóa đơn, lịch đi tuyến, điểm tích lũy hoặc bài khảo sát)*

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

#### HÌNH ẢNH MINH HỌA KIỂM THỬ THỰC TẾ (CẶP 5)

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ DOANH SỐ & ĐƠN HÀNG (STT 01, 03)]**
> *(Chụp ảnh màn hình kết quả tra cứu doanh số/báo cáo và danh sách đơn hàng gần đây trên tài khoản Quản lý & TDV)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ BẢO MẬT PHÂN QUYỀN (STT 02)]**
> *(Chụp ảnh màn hình tin nhắn từ chối của AI khi cố tình tra cứu chéo tài khoản hoặc ngoài vùng)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ LÊN ĐƠN NHANH QUA CHAT (STT 04, 07, 18)]**
> *(Chụp ảnh màn hình hội thoại lên đơn, tin nhắn xác nhận từ AI và kiểm tra thông tin/tồn kho sản phẩm)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ GỢI Ý THÔNG MINH & UPSELL (STT 05, 06, 13, 14, 15)]**
> *(Chụp ảnh màn hình AI gợi ý đặt hàng, gợi ý bán thêm upsell, gợi ý theo triệu chứng hoặc khuyến mại)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ CÔNG NỢ & NGHIỆP VỤ BỔ TRỢ (STT 08, 09, 10, 11, 12, 16, 17, 19)]**
> *(Chụp ảnh màn hình tra cứu công nợ, danh sách hóa đơn, lịch đi tuyến, điểm tích lũy hoặc bài khảo sát)*

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

#### HÌNH ẢNH MINH HỌA KIỂM THỬ THỰC TẾ (CẶP 6)

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ DOANH SỐ & ĐƠN HÀNG (STT 01, 03)]**
> *(Chụp ảnh màn hình kết quả tra cứu doanh số/báo cáo và danh sách đơn hàng gần đây trên tài khoản Quản lý & TDV)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ BẢO MẬT PHÂN QUYỀN (STT 02)]**
> *(Chụp ảnh màn hình tin nhắn từ chối của AI khi cố tình tra cứu chéo tài khoản hoặc ngoài vùng)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ LÊN ĐƠN NHANH QUA CHAT (STT 04, 07, 18)]**
> *(Chụp ảnh màn hình hội thoại lên đơn, tin nhắn xác nhận từ AI và kiểm tra thông tin/tồn kho sản phẩm)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ GỢI Ý THÔNG MINH & UPSELL (STT 05, 06, 13, 14, 15)]**
> *(Chụp ảnh màn hình AI gợi ý đặt hàng, gợi ý bán thêm upsell, gợi ý theo triệu chứng hoặc khuyến mại)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ CÔNG NỢ & NGHIỆP VỤ BỔ TRỢ (STT 08, 09, 10, 11, 12, 16, 17, 19)]**
> *(Chụp ảnh màn hình tra cứu công nợ, danh sách hóa đơn, lịch đi tuyến, điểm tích lũy hoặc bài khảo sát)*

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

#### HÌNH ẢNH MINH HỌA KIỂM THỬ THỰC TẾ (CẶP 7)

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ DOANH SỐ & ĐƠN HÀNG (STT 01, 03)]**
> *(Chụp ảnh màn hình kết quả tra cứu doanh số/báo cáo và danh sách đơn hàng gần đây trên tài khoản Quản lý & TDV)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ BẢO MẬT PHÂN QUYỀN (STT 02)]**
> *(Chụp ảnh màn hình tin nhắn từ chối của AI khi cố tình tra cứu chéo tài khoản hoặc ngoài vùng)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ LÊN ĐƠN NHANH QUA CHAT (STT 04, 07, 18)]**
> *(Chụp ảnh màn hình hội thoại lên đơn, tin nhắn xác nhận từ AI và kiểm tra thông tin/tồn kho sản phẩm)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ GỢI Ý THÔNG MINH & UPSELL (STT 05, 06, 13, 14, 15)]**
> *(Chụp ảnh màn hình AI gợi ý đặt hàng, gợi ý bán thêm upsell, gợi ý theo triệu chứng hoặc khuyến mại)*

> 📸 **[KHUNG DÁN ẢNH - KIỂM THỬ CÔNG NỢ & NGHIỆP VỤ BỔ TRỢ (STT 08, 09, 10, 11, 12, 16, 17, 19)]**
> *(Chụp ảnh màn hình tra cứu công nợ, danh sách hóa đơn, lịch đi tuyến, điểm tích lũy hoặc bài khảo sát)*

---
