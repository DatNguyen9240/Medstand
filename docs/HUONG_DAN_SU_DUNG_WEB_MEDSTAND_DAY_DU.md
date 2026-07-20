# Hướng dẫn sử dụng Web Medstand — Bản đầy đủ cho Pilot

**Phiên bản:** Pilot Read-only  
**Dành cho:** Sale/TDV, Manager và nhóm UAT  
**Môi trường hiện tại:** web local + n8n local + SQL Server `medtest`  
**Ngày cập nhật:** 19/07/2026

## 1. Đọc trước khi sử dụng

Web Medstand hiện đủ điều kiện demo và Pilot Read-only. Người dùng được phép đăng nhập, xem dữ liệu, tìm kiếm, lọc, mở chi tiết và sử dụng Trợ lý AI trong đúng phạm vi tài khoản.

Trong Pilot, không thực hiện các thao tác ghi dữ liệu sau nếu chưa có điều phối viên cho phép:

- Tạo, sửa hoặc chuyển trạng thái đơn hàng.
- Lưu đơn nháp.
- Thêm hoặc sửa khách hàng.
- Tạo phiếu trả hàng.
- Nộp khảo sát thật.
- Tự áp khuyến mãi hoặc chiết khấu.

Riêng giỏ hàng do chatbot dựng chỉ là **Xem trước**, không phải đơn ERP đã được tạo.

## 2. Vai trò và phạm vi dữ liệu

| Vai trò | Phạm vi chính |
|---|---|
| Sale/TDV | Khách hàng, kho, tuyến, đơn và dữ liệu được ERP cấp cho chính tài khoản |
| Manager | Dữ liệu trong chi nhánh và phạm vi nhân viên trực thuộc; có thêm màn Báo cáo |
| Admin | Chức năng quản trị được cấp; vẫn phải tuân thủ audit và phạm vi Pilot |

Nguyên tắc bắt buộc:

- Sale không được thấy khách hoặc kho ngoài phạm vi.
- Manager không được thấy chi nhánh ngoài phạm vi quản lý.
- Khi nhập mã ngoài quyền, web phải từ chối hoặc không trả dữ liệu; không được lộ tên, lịch sử mua, công nợ hay doanh số.
- Sau khi đổi tài khoản, nhấn `Ctrl+F5` để tránh dùng lại trạng thái giao diện của phiên trước.

## 3. Đăng nhập

### Các bước

1. Mở địa chỉ web do quản trị viên cung cấp. Khi chạy local, trang đăng nhập thường là `http://localhost:3000/pages/login.html`.
2. Nhập **Tên đăng nhập**.
3. Nhập **Mật khẩu**.
4. Có thể nhấn biểu tượng con mắt để hiện hoặc ẩn mật khẩu.
5. Chọn **Ghi nhớ đăng nhập** chỉ trên thiết bị cá nhân được phép sử dụng.
6. Nhấn **Đăng nhập**.

### Kết quả đúng

- Web chuyển đến **Trang chủ**.
- Góc tài khoản hiển thị đúng tên và vai trò.
- Menu phù hợp với vai trò đăng nhập.

### Khi không đăng nhập được

| Hiện tượng | Cách xử lý |
|---|---|
| Bỏ trống tài khoản hoặc mật khẩu | Nhập đủ hai trường |
| Báo sai thông tin đăng nhập | Kiểm tra viết hoa, khoảng trắng và tài khoản được cấp |
| Tài khoản bị khóa/không tồn tại | Liên hệ quản trị viên; không tự tạo tài khoản mới |
| Vừa đổi tài khoản nhưng còn dữ liệu cũ | Đăng xuất, đóng tab, mở lại và nhấn `Ctrl+F5` |

Không gửi mật khẩu hoặc access token trong ảnh chụp báo lỗi.

## 4. Bố cục chung

### Trên máy tính

Menu bên trái gồm:

1. **Trang chủ**.
2. **Tuyến**.
3. **Đơn hàng**.
4. **Báo cáo** — chỉ hiện cho Manager.
5. **Khách hàng**.
6. **Trợ lý AI**.

Phần cuối menu hiển thị tài khoản, vai trò và nút **Đăng xuất**. Nút mũi tên cạnh logo dùng để thu gọn hoặc mở rộng menu.

### Trên điện thoại

Thanh điều hướng dưới cùng ưu tiên **Trang chủ**, **Tuyến**, **Đơn hàng** và **Tài khoản**. Dùng nút menu khi cần mở các mục còn lại. Nếu một chức năng không hiện trên mobile, thực hiện UAT trên desktop và ghi nhận thiếu điều hướng mobile.

### Giao diện sáng/tối

Nhấn biểu tượng mặt trăng/mặt trời ở góc màn hình để đổi chế độ. Việc đổi giao diện không được làm mất dữ liệu đang xem hoặc đổi tài khoản.

## 5. Trang chủ

### Mục đích

Cho người dùng nhìn nhanh tình hình làm việc trong ngày và kỳ hiện tại.

### Nội dung chính

- Lời chào, tên người dùng, vai trò và ngày hiện tại.
- KPI đơn hàng, khách hàng, độ phủ và doanh số.
- Biểu đồ doanh số thuần theo **Ngày**, **Tuần**, **Tháng** hoặc **Quý**.
- Bộ lọc khoảng ngày cho biểu đồ.
- Sinh nhật khách hàng hôm nay.
- Khách cần ghé hôm nay.
- Thao tác nhanh.
- Tiến độ chỉ tiêu.
- Biểu tượng chuông thông báo.

### Cách sử dụng

1. Kiểm tra tên/vai trò trên đầu trang.
2. Chọn kỳ biểu đồ cần xem.
3. Nếu cần, chọn từ ngày và đến ngày.
4. Đọc tổng, cao nhất, thấp nhất và trung bình trong kỳ.
5. Mở danh sách khách cần ghé hoặc thao tác nhanh phù hợp.

### Cách hiểu đúng

- KPI phải nằm trong phạm vi tài khoản.
- “Khách cần ghé” là danh sách ưu tiên, chưa phải tuyến đường đã tối ưu.
- Doanh thu đã thu vẫn chờ Finance đối chiếu payment ledger trước production.
- Nếu một KPI hiện `--`, kiểm tra phạm vi/ngày hoặc ghi nhận thiếu dữ liệu; không tự hiểu thành `0`.

## 6. Thông báo

1. Nhấn biểu tượng chuông trên Trang chủ.
2. Số trên huy hiệu là lượng thông báo chưa đọc.
3. Mở thông báo để xem tiêu đề, nội dung và thời gian.

Trong Pilot, thông báo trả được dữ liệu nhưng quy trình quản trị tài liệu, phiên bản và người phê duyệt vẫn chờ xác nhận. Không coi mọi nội dung hiện ra là chương trình công ty đã được duyệt nếu thiếu nhãn xác nhận.

## 7. Tuyến

### Màn hình

- Dòng tóm tắt ngày làm việc, nhân viên và chi nhánh.
- Ô tìm kiếm.
- Bộ lọc **Trạng thái**, **Loại khách hàng**, **Kênh bán** và ngày.
- Hai tab **Danh sách** và **Bản đồ**.

### Xem dạng danh sách

1. Chọn ngày làm việc.
2. Nhập tên/mã khách nếu cần tìm nhanh.
3. Chọn bộ lọc rồi áp dụng.
4. Đọc thứ tự ghé, khách hàng, địa chỉ, tuyến và trạng thái.

Trạng thái có thể là **Chưa ghé**, **Đã ghé** hoặc **Chưa có trạng thái ghé**. Nếu chưa có nguồn check-in thật, không được suy ngày mua thành ngày đã ghé.

### Xem bản đồ

1. Chuyển sang tab **Bản đồ**.
2. Cho phép trình duyệt dùng vị trí nếu muốn dẫn đường.
3. Chọn một điểm để xem khách, địa chỉ, số điện thoại và trạng thái.
4. Có thể mở Google Maps hoặc gọi điện khi thông tin tồn tại.

### Giới hạn

- Bản đồ hiện hỗ trợ hiển thị và dẫn đường tới từng điểm; chưa phải thuật toán tối ưu toàn bộ lộ trình.
- Không có tọa độ thì khách có thể xuất hiện trong danh sách nhưng không có marker trên bản đồ.
- Trong Pilot Read-only, không dùng việc chọn khách để tạo đơn thật.

## 8. Đơn hàng

Màn **Đơn hàng** là trang nhóm chức năng. Các thẻ có thể gồm:

- **Quản lý đơn hàng**.
- **Hóa đơn bán hàng**.
- **Phiếu trả hàng**.
- **Đơn hàng chi tiết** hoặc Báo cáo đơn hàng.
- **Doanh số**.
- **Kế hoạch bán hàng**.
- **Hạng mục sản phẩm cảnh báo**.

Các thẻ hiển thị phụ thuộc dữ liệu cấu hình và quyền tài khoản.

### 8.1. Quản lý đơn hàng

1. Mở **Đơn hàng → Quản lý đơn hàng**.
2. Dùng ô tìm kiếm/bộ lọc để tìm đơn.
3. Chọn một dòng để mở chi tiết.
4. Kiểm tra mã đơn, khách, ngày, trạng thái, sản phẩm, số lượng và số tiền.

Nút `+` mở màn hình tạo đơn. Trong Pilot Read-only, không nhấn nút tạo/lưu cuối cùng nếu điều phối viên chưa cho phép.

### 8.2. Hóa đơn bán hàng

1. Mở **Đơn hàng → Hóa đơn bán hàng**.
2. Lọc theo ngày hoặc từ khóa.
3. Mở hóa đơn để đối chiếu khách, trạng thái và số tiền.

Invoice hoàn tất trong rule pilot sử dụng các trạng thái `3/6/7/8`. Người dùng không cần nhớ mã; giao diện phải hiển thị nhãn dễ hiểu.

### 8.3. Phiếu trả hàng

Mở danh sách, lọc và chọn phiếu để xem chi tiết. Trong Pilot, chỉ tra cứu; không tạo hoặc sửa phiếu trả hàng thật.

### 8.4. Báo cáo đơn hàng

Dùng bộ lọc ngày và phạm vi được cấp để xem tổng hợp. Khi nhấn một dòng, chỉ được mở dữ liệu nằm trong phạm vi tài khoản.

### 8.5. Kế hoạch bán hàng

1. Tìm kế hoạch bằng từ khóa.
2. Chọn khoảng ngày.
3. Mở kế hoạch để xem chi tiết và tiến độ.

Kế hoạch hiển thị là dữ liệu tham chiếu; không tự thay đổi chỉ tiêu trong Pilot.

### 8.6. Sản phẩm cảnh báo

Dùng bộ lọc sản phẩm và các tab cảnh báo để xem hàng cần chú ý. Cận hạn, tồn thấp hoặc các nhãn tương tự chỉ được hiển thị khi nguồn dữ liệu chứng minh được.

## 9. Tạo đơn hàng — ngoài phạm vi Pilot Read-only

Màn web hiện có chức năng tạo đơn thật với các trường:

- Ngày chứng từ.
- Chi nhánh.
- Khách hàng.
- Phường/xã, địa chỉ và tuyến.
- Số điện thoại.
- Sản phẩm, số lượng, giá, chiết khấu và thành tiền.
- Ghi chú và diễn giải.
- Nút tạo đơn/lưu nháp.

Đây là chức năng mutation. Trong Pilot Read-only:

- Chỉ được mở để xem bố cục khi có điều phối viên giám sát.
- Không nhấn **Tạo đơn hàng** hoặc **Lưu nháp**.
- Không dùng dữ liệu khách hàng thật để thử mutation.
- Giỏ do AI chuẩn bị chỉ được xem trước.

Khi chuyển sang giai đoạn cho phép tạo đơn, phải có UAT riêng về idempotency, trùng khóa, giá, chiết khấu, tồn và rollback trước khi hướng dẫn người dùng thao tác thật.

## 10. Báo cáo — dành cho Manager

Menu **Báo cáo** chỉ hiện cho tài khoản được nhận diện là Manager.

### Cách sử dụng

1. Chọn khoảng ngày và các bộ lọc được cấp.
2. Chọn tab **Theo nhân viên** hoặc **Theo khách hàng**.
3. Dùng ô tìm kiếm để thu hẹp kết quả.
4. Chọn một dòng để mở dữ liệu đơn hàng liên quan.

### Kết quả đúng

- Manager chỉ thấy nhân viên/khách thuộc phạm vi quản lý.
- Tổng doanh số phải khớp kỳ lọc và không cộng dữ liệu ngoài chi nhánh.
- Không có dữ liệu phải hiện thông báo rõ, không để bảng trống khó hiểu.

Doanh số/VAT/return/payment vẫn cần Finance ký trước khi dùng làm số liệu production-final.

## 11. Khách hàng

### Tra cứu

1. Chọn **Khách hàng**.
2. Nhập tên, mã hoặc số điện thoại vào ô tìm kiếm.
3. Xem danh sách khách thuộc phạm vi tài khoản.
4. Mở khách để đọc số điện thoại, sinh nhật, tuyến và trạng thái nếu có.
5. Nhấn biểu tượng điện thoại để gọi khi thiết bị hỗ trợ.

### Thêm khách hàng — ngoài phạm vi Pilot Read-only

Nút `+` mở form thêm khách với các trường như tên, số điện thoại, loại khách, tỉnh/thành, quận/huyện, phường/xã, địa chỉ, chi nhánh, nhóm đối tượng và kênh bán.

Trong Pilot, không nhấn **Xác nhận** để ghi khách mới. Khi được phép triển khai thật, cần kiểm tra trùng mã/số điện thoại, quyền chi nhánh và lỗi “Duplicate key value supplied” trước khi nghiệm thu.

## 12. Trợ lý AI

### Giao diện

- Nút kẹp giấy để đính kèm tệp.
- Nút bốn ô để chọn lệnh `@`.
- Ô nhập câu hỏi tự nhiên.
- Nút gửi.
- Nút đổi giao diện và xóa lịch sử chat.
- Cảnh báo AI dưới ô nhập.

### Hai cách sử dụng

1. Chọn lệnh `@`/menu để gọi đúng chức năng và lấy dữ liệu trong UAT.
2. Nhập câu tiếng Việt để kiểm tra Shadow. Hệ thống chỉ nhận diện chức năng dự kiến, chưa tự gọi API; sau đó người dùng chọn lệnh `@` tương ứng.

### Câu hỏi dùng nhanh

```text
@tuyen_ban_hang
@doanh_so
@cong_no_khach_hang
@cong_no_chi_tiet
@danh_sach_tonkho
@goi_ydon_hang
@upsell_goi_y
@tra_cuu_san_pham
@cham_diem_kh
```

Ca kiểm tra Shadow riêng: `Hôm nay em nên làm gì?` phải được nhận diện là tuyến bán hàng nhưng không tự trả danh sách khách.

### Cách đọc kết quả

- Gợi ý đơn hàng dưới 3 hóa đơn phải ghi chưa đủ lịch sử, không gán chu kỳ giả.
- Upsell bắt buộc chọn khách và chỉ hiện sản phẩm có tồn bán tham khảo dương.
- Tier A/B/C khác với Risk; khách Tier A vẫn có thể Risk HIGH.
- Tồn kho là tồn bán tham khảo theo dữ liệu hiện có, chưa dùng để cam kết giao hàng nếu ERP chưa xác nhận reservation/blocked stock.
- Nội dung triệu chứng chỉ tham khảo, không chẩn đoán hoặc kê đơn.
- Không hiển thị Nguồn quy tắc/Phiên bản quy tắc cho người dùng thông thường.

Hướng dẫn chi tiết từng luồng AI nằm tại [`HUONG_DAN_SU_DUNG_MEDSTAND_AI_PILOT_READ_ONLY.md`](HUONG_DAN_SU_DUNG_MEDSTAND_AI_PILOT_READ_ONLY.md).

## 13. Tài khoản

Mở phần tên/ảnh đại diện hoặc tab **Tài khoản** trên mobile.

Các mục có thể gồm:

- Thông tin cá nhân.
- Quản lý khách hàng.
- Điểm/Hợp đồng.
- Lịch sử khảo sát.
- Khảo sát.
- Đổi mật khẩu.
- Quản lý Trợ lý (RAG) — chỉ Admin.
- Đăng xuất.

### Đổi mật khẩu

1. Nhập mật khẩu hiện tại.
2. Nhập mật khẩu mới.
3. Nhập lại mật khẩu mới.
4. Nhấn **Cập nhật**.

Không dùng mật khẩu cũ, mật khẩu thử nghiệm chung hoặc chia sẻ mật khẩu qua nhóm chat.

### Đăng xuất

1. Nhấn **Đăng xuất**.
2. Xác nhận trong hộp thoại.
3. Kiểm tra web quay về màn hình đăng nhập.

Luôn đăng xuất trước khi chuyển máy hoặc giao thiết bị cho người khác.

## 14. Khảo sát

Web có thể hiển thị bài khảo sát với trạng thái **Chưa làm**, **Đang làm** và **Đã hoàn thành**. Người dùng có thể xem câu hỏi, thời gian, kết quả và lịch sử.

Việc bắt đầu hoặc nộp bài là thao tác ghi dữ liệu. Trong Pilot Read-only, chỉ thực hiện khi ca UAT khảo sát được điều phối viên phê duyệt riêng.

## 15. Tìm kiếm, lọc và phân trang

- Nhập từ khóa ngắn, ưu tiên mã khách/mã sản phẩm khi biết chính xác.
- Chọn khoảng ngày hợp lệ; từ ngày không được sau đến ngày.
- Sau khi thay bộ lọc, chờ dữ liệu tải xong rồi mới thao tác tiếp.
- Dùng nút trang trước/sau hoặc tổng số dòng nếu màn hình hỗ trợ.
- “Không có dữ liệu” không đồng nghĩa hệ thống lỗi.
- Nếu danh sách báo còn nhiều dòng, dùng ô tìm kiếm thay vì cố mở toàn bộ cùng lúc.

## 16. Thông báo lỗi thường gặp

| Thông báo/hiện tượng | Ý nghĩa | Cách xử lý |
|---|---|---|
| Yêu cầu chứa tham số thiếu hoặc không hợp lệ | Chưa chọn khách, sản phẩm hoặc ngày bắt buộc | Bổ sung trường rồi gửi lại |
| Ngoài phạm vi/không có quyền | Tài khoản không được xem dữ liệu | Dừng và kiểm tra với quản lý |
| Không tìm thấy dữ liệu | Không có bản ghi phù hợp | Kiểm tra mã/ngày; không coi là lỗi hệ thống |
| Authenticated identity is not mapped | Tài khoản xác thực chưa ánh xạ đúng tài khoản nội bộ | Đăng xuất, đăng nhập lại; nếu còn lỗi, báo quản trị viên |
| Duplicate key value supplied | Đang cố thêm bản ghi có khóa đã tồn tại | Không thử gửi liên tục; báo quản trị viên kèm dữ liệu đã nhập |
| Trang tải quá lâu | API/mạng hoặc dữ liệu đang chậm | Chờ thông báo, nhấn Tải lại một lần rồi báo thời gian lỗi |
| Chữ tiếng Việt bị lỗi | Lỗi mã hóa/renderer | Chụp đúng khu vực và toàn màn hình để báo FE |
| Nút/bộ lọc không bấm được | Lỗi giao diện hoặc lớp phủ | Nhấn `Ctrl+F5`; nếu còn lỗi, ghi thiết bị và trình duyệt |

Không bấm gửi nhiều lần khi đang xử lý vì có thể tạo yêu cầu trùng ở các màn mutation.

## 17. Quy trình báo lỗi

Gửi đủ:

1. Tài khoản và vai trò, không gửi mật khẩu.
2. Môi trường và địa chỉ trang.
3. Thời gian xảy ra lỗi.
4. Menu/màn hình đang dùng.
5. Các bước đã thực hiện.
6. Mã khách, đơn hoặc sản phẩm dùng để test.
7. Kết quả thực tế và kết quả mong đợi.
8. Ảnh toàn màn hình và request ID nếu có.

Mẫu:

```text
Tài khoản/vai trò:
Thời gian:
Màn hình:
Các bước:
Dữ liệu test:
Kết quả thực tế:
Kết quả mong đợi:
Request ID:
```

## 18. Checklist sử dụng nhanh

### Sale/TDV

- Đăng nhập đúng tài khoản.
- Kiểm tra việc hôm nay và tuyến.
- Tra đúng khách thuộc phạm vi.
- Xem công nợ/tồn/gợi ý trước khi làm việc với khách.
- Không cam kết tồn nếu chưa đối chiếu ERP.
- Không tạo dữ liệu thật trong Pilot.
- Đăng xuất khi kết thúc.

### Manager

- Kiểm tra đúng vai trò Manager và chi nhánh.
- Xem Trang chủ, Báo cáo và khách ưu tiên.
- Đối chiếu dữ liệu của nhân viên trực thuộc.
- Kiểm tra không có khách/kho ngoài phạm vi.
- Xem đề xuất khuyến mãi dưới dạng tham khảo, không tự áp giá.
- Ghi nhận Pass/Fail và ảnh bằng chứng.

## 19. Phạm vi chưa được gọi là production-ready

- 14/24 API còn cần hoàn tất cross-role/cross-branch/cross-store runtime evidence.
- Visual/mobile/accessibility/performance UAT chưa hoàn tất đầy đủ.
- Finance chưa ký toàn bộ revenue/VAT/payment/return.
- ERP Warehouse chưa xác nhận reservation/blocked stock và freshness.
- ERP Program chưa xác nhận Approved/Active/Stackable.
- Nội dung triệu chứng chưa có Medical Owner sign-off.
- OCR đơn thuốc chưa triển khai.

Cho tới khi các điều kiện trên hoàn thành, tài liệu này chỉ dùng cho **Pilot**, không phải hướng dẫn vận hành production-final.

## 20. Tài liệu UAT đi kèm

- [`UAT_PILOT_READ_ONLY_TECHNICAL_BUSINESS_PRODUCTION.md`](UAT_PILOT_READ_ONLY_TECHNICAL_BUSINESS_PRODUCTION.md) — ca kiểm thử và phiếu Pass/Fail.
- [`uat/scenarios/UAT_13_TAI_KHOAN_CAU_HOI_COPY_PASTE.md`](uat/scenarios/UAT_13_TAI_KHOAN_CAU_HOI_COPY_PASTE.md) — câu hỏi copy/paste cho 13 tài khoản.

Ảnh minh họa theo từng màn hình sẽ được chèn sau khi visual UAT chạy trên browser thật; nội dung thao tác trong bản này đã được đối chiếu với route, template và menu hiện có trong source.
