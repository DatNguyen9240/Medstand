# Hướng dẫn sử dụng Medstand AI cho doanh nghiệp

> **Phân loại: TÀI LIỆU NGUỒN NỘI BỘ.** Bản rút gọn để gửi người dùng Pilot nằm trong thư mục `docs/GOI_UAT_KHACH_HANG`.

| Thông tin kiểm soát | Giá trị |
|---|---|
| Ngày cập nhật | 22/07/2026 |
| Phạm vi | Sale, Quản lý và Admin trong Pilot read-only |
| Hội thoại tự nhiên | 24 chức năng đã duyệt |
| Trạng thái n8n | Đã import workflow mới; chờ xác nhận Published/Active và kiểm thử runtime |
| Nguyên tắc phát hành | Chỉ giao test sau smoke Manager/Sale; không coi import là Runtime PASS |

## 1. Medstand AI dùng để làm gì?

Medstand AI hỗ trợ tra cứu nhanh dữ liệu ERP và đưa ra gợi ý cho Sale, Quản lý và Admin. Hệ thống không thay thế quyết định nghiệp vụ, không tự duyệt khuyến mãi và không tự ghi đơn thật trong giai đoạn Pilot.

> Chatbot dùng AI và có thể sai sót. Với nội dung chuyên môn sản phẩm/thuốc, hãy kiểm tra lại thông tin và quy định của doanh nghiệp trước khi tư vấn hoặc chốt đơn.

## 2. Đăng nhập và phạm vi dữ liệu

1. Mở địa chỉ Medstand do doanh nghiệp cung cấp.
2. Đăng nhập bằng tài khoản được cấp.
3. Kiểm tra tên và vai trò ở góc dưới màn hình.
4. Chỉ hỏi dữ liệu thuộc miền, kho, khách hàng và nhân viên được giao.

Nếu vừa đổi tài khoản, hãy đăng xuất rồi đăng nhập lại để làm mới quyền. Không dùng chung phiên trình duyệt khi kiểm thử nhiều tài khoản.

Trước buổi Pilot, điều phối viên phải xác nhận frontend và n8n cùng trỏ vào một môi trường, workflow chính đang Published/Active và Node gateway đã được khởi động lại sau cập nhật.

## 3. Hai cách hỏi chatbot

### Dùng nút chức năng

Chọn các nút như **Tra cứu doanh số**, **Kiểm tra tồn kho**, **Gợi ý đơn hàng**, **Công nợ**, **Chấm điểm khách hàng** hoặc **Gợi ý bán kèm**. Khi màn hình yêu cầu mã khách/sản phẩm, nhập đúng mã ERP.

### Hỏi bằng câu tự nhiên

Có thể gõ như đang nói chuyện bình thường:

```text
Hôm nay tôi nên làm gì?
Doanh số của tôi từ 09/07 đến hôm nay?
Gợi ý đơn hàng cho khách NDB001
Khách NDB001 đang nợ bao nhiêu?
Tồn kho A003 còn bao nhiêu?
Hôm nay nên ghé khách nào?
```

Nếu câu hỏi quá ngắn hoặc thiếu đối tượng, chatbot sẽ yêu cầu nói rõ hơn. Khi đó bổ sung mã khách, tên sản phẩm hoặc khoảng ngày.

## 4. Các việc thường dùng

| Nhu cầu | Câu hỏi mẫu | Người dùng |
|---|---|---|
| Xem doanh số hôm nay | `Hôm nay doanh số của tôi là bao nhiêu?` | Sale/Quản lý |
| Xem doanh số theo kỳ | `Doanh số từ 09/07/2026 đến 20/07/2026` | Sale/Quản lý |
| Gợi ý đơn hàng | `Hôm nay bán gì cho khách NDB001?` | Sale/Quản lý |
| Gợi ý bán kèm | `Bán kèm gì cho khách NDB001?` | Sale/Quản lý |
| Xem công nợ | `Khách NDB001 đang nợ bao nhiêu?` | Sale/Quản lý |
| Chi tiết công nợ | `Chi tiết công nợ khách NDB001` | Sale/Quản lý |
| Tồn kho | `Tồn kho sản phẩm A003` | Sale/Quản lý |
| Tuyến hôm nay | `Hôm nay tôi nên ghé khách nào?` | Sale/Quản lý |
| Phân nhóm khách | `Chấm điểm khách hàng của tôi` | Quản lý/Sale |
| Đề xuất khuyến mãi | `Sản phẩm nào cần xem xét khuyến mãi?` | Quản lý/Admin |

## 5. Cách đọc kết quả

- **Doanh số:** số liệu theo phạm vi tài khoản và khoảng ngày đã chọn.
- **Công nợ:** tổng còn nợ, hóa đơn/khoản nợ, đã thanh toán, quá hạn hoặc chưa xác định hạn.
- **Tồn kho:** số tồn ERP hiện tại. Nếu chưa có dữ liệu giữ chỗ/hàng khóa, hệ thống sẽ ghi rõ tồn khả dụng là tham khảo hoặc chưa xác minh.
- **Gợi ý đơn hàng/bán kèm:** là gợi ý dựa trên lịch sử mua và dữ liệu ERP, không phải lệnh bắt buộc.
- **Tier/rủi ro:** dùng để ưu tiên chăm sóc; đọc kèm lý do cảnh báo, không chỉ nhìn điểm số.
- **Đề xuất khuyến mãi:** chỉ là danh sách cần xem xét. Người có thẩm quyền phải duyệt trước khi áp dụng.

## 6. Phân biệt quyền Sale và Quản lý

### Sale

Sale tập trung vào khách và tuyến được giao: doanh số, công nợ, tồn kho, gợi ý đơn hàng, bán kèm và khách cần chăm sóc. Sale không tự phê duyệt chương trình giảm giá.

### Quản lý/Admin

Quản lý xem tổng quan đội/miền được giao, nhóm khách, xu hướng doanh số và danh sách sản phẩm cần xem xét khuyến mãi. Admin dùng để kiểm tra hệ thống và quyền, không dùng dữ liệu Admin để kết luận thay cho phạm vi Sale.

## 7. Quy tắc an toàn

- Không coi câu trả lời AI là quyết định y khoa hoặc quyết định tài chính cuối cùng.
- Không tư vấn thuốc cho trẻ em, phụ nữ có thai hoặc bệnh nhân có bệnh nền nếu chưa kiểm tra nguồn chuyên môn và người có thẩm quyền.
- Không coi sản phẩm có tồn vật lý là chắc chắn bán được nếu hệ thống báo chưa xác minh tồn khả dụng.
- Không biến `Chưa có dữ liệu` thành `0` hoặc `Hết hàng`.
- Không xem đề xuất khuyến mãi là chương trình đã duyệt.
- Mutation/ghi đơn trong Pilot chỉ xem trước; không xác nhận nếu chưa có quy trình doanh nghiệp.

## 8. Khi chatbot báo lỗi

1. Kiểm tra đã đăng nhập đúng tài khoản chưa.
2. Nếu vừa đổi tài khoản, đăng xuất và đăng nhập lại.
3. Với câu hỏi khách/sản phẩm, nhập mã chính xác từ ERP.
4. Với doanh số, nhập rõ từ ngày và đến ngày.
5. Nếu vẫn lỗi, ghi lại tài khoản, câu hỏi, thời gian và ảnh màn hình; không thử bằng tài khoản Admin để che lỗi phân quyền.

## 9. Ghi nhận phản hồi Pilot

Mỗi phản hồi nên có:

```text
Tài khoản và vai trò:
Câu hỏi đã nhập:
Mã khách/sản phẩm (nếu có):
Kết quả nhận được:
Đúng hay sai nghiệp vụ:
Ảnh lỗi/thời gian:
```

Phản hồi dùng để sửa dữ liệu, API, giao diện hoặc quy tắc nghiệp vụ ở các vòng tiếp theo; không dùng để tự động huấn luyện hoặc thay đổi quy tắc ngay trong phiên Pilot.

## 10. Quy trình sử dụng theo vai trò

### 10.1. Quy trình một ngày của Sale

#### Đầu ngày

1. Đăng nhập và kiểm tra đúng tên tài khoản.
2. Hỏi `Hôm nay tôi nên làm gì?` để nhận các nhóm công việc có thể tra cứu.
3. Hỏi `Hôm nay tôi nên ghé khách nào?` để xem khách ưu tiên trong tuyến.
4. Kiểm tra công nợ và lịch sử mua trước khi liên hệ khách.

#### Trước khi gặp khách

1. Hỏi `Gợi ý đơn hàng cho khách {MÃ KHÁCH}`.
2. Hỏi `Gợi ý bán kèm cho khách {MÃ KHÁCH}`.
3. Kiểm tra tồn kho từng sản phẩm định giới thiệu.
4. Nếu số có thể bán chưa được xác minh, Sale phải kiểm tra lại kho trước khi báo khách.

#### Khi trao đổi với khách

- Chỉ dùng chương trình khuyến mãi đã được công ty phê duyệt.
- Không dùng đề xuất nội bộ của Manager làm cam kết với khách.
- Nội dung sản phẩm/thuốc do AI trả về chỉ mang tính tham khảo.
- Không kết luận điều trị hoặc thay thế chỉ định chuyên môn.

#### Cuối ngày

1. Kiểm tra doanh số hôm nay.
2. Kiểm tra khách chưa xử lý hoặc lâu chưa mua.
3. Ghi nhận câu trả lời sai/thiếu dữ liệu theo mẫu phản hồi.

### 10.2. Quy trình một ngày của Quản lý

#### Đầu ngày

1. Kiểm tra doanh số theo ngày của đội.
2. Xem nhóm khách A/B/C và các khách có nguy cơ giảm mua.
3. Xem danh sách khách ưu tiên và công nợ cần theo dõi.

#### Trong ngày

1. Tra cứu theo nhân viên hoặc khách thuộc quyền quản lý.
2. Kiểm tra tồn kho và sản phẩm trọng tâm.
3. Xem danh sách sản phẩm cần xem xét khuyến mãi.
4. Đọc lý do như bán chậm, tồn nhiều hoặc cận hạn; không tự coi đây là quyết định duyệt.

#### Cuối ngày

1. So sánh doanh số theo thời gian.
2. Xem khách giảm mua và yêu cầu Sale cập nhật tình hình.
3. Gửi lỗi dữ liệu hoặc sai phân quyền cho Admin/đội triển khai.

### 10.3. Quy trình hỗ trợ của Admin

1. Kiểm tra tài khoản có được ánh xạ đúng vào nhân viên/Quản lý nội bộ không.
2. Kiểm tra miền, ManagerID, EmployeeID và danh sách kho được cấp.
3. Không sửa dữ liệu nghiệp vụ chỉ để làm màn hình có kết quả.
4. Phân loại lỗi trước khi chuyển xử lý: đăng nhập, phân quyền, dữ liệu, API, giao diện hoặc nghiệp vụ.
5. Không gửi token, mật khẩu hoặc dữ liệu nhạy cảm trong ảnh nghiệm thu.

## 11. Danh mục 24 chức năng hội thoại đã duyệt

Đây là 24 chức năng mà phần nhận diện câu tự nhiên được phép định tuyến tới. Các procedure quản trị, audit và bootstrap không phải chức năng cho người dùng cuối.

| STT | Chức năng hiển thị | Lệnh nhanh | Cần nhập chính | Lưu ý |
|---:|---|---|---|---|
| 1 | Doanh số | `@doanh_so` | Khoảng ngày/bộ lọc | Theo phạm vi tài khoản |
| 2 | Danh sách hóa đơn | `@hoa_don` | Khoảng ngày | Chỉ dữ liệu được cấp quyền |
| 3 | Chi tiết hóa đơn | `@hoa_don_chi_tiet` | Mã hóa đơn | Chọn từ danh sách để tránh sai mã |
| 4 | Danh sách đơn hàng | `@don_hang` | Khách hoặc trạng thái | Tra cứu, không tự ghi đơn |
| 5 | Chấm điểm khách hàng | `@cham_diem_kh` | Nhóm A/B/C nếu cần | Tier và rủi ro là hai khái niệm khác nhau |
| 6 | Công nợ khách hàng | `@cong_no_khach_hang` | Đến ngày nếu cần | Tổng quan danh sách khách nợ |
| 7 | Công nợ chi tiết | `@cong_no_chi_tiet` | Mã khách hàng | Đọc cả khoản nợ không có hóa đơn |
| 8 | Tích lũy | `@tich_luy` | Mã khách/chương trình | Chỉ chương trình còn hiệu lực |
| 9 | Tuyến bán hàng | `@tuyen_ban_hang` | Khách hoặc số ngày | Chưa được gọi là tối ưu bản đồ nếu thiếu tọa độ/check-in |
| 10 | Gợi ý đơn hàng | `@goi_ydon_hang` | Mã khách hàng | Khách ít lịch sử không bị đoán chu kỳ |
| 11 | Gợi ý bán kèm | `@upsell_goi_y` | Mã khách hàng | Không có khách thì phải yêu cầu bổ sung |
| 12 | Gợi ý đơn thuốc | `@goi_ydon_thuoc` | Tên/mã sản phẩm gốc | Nội dung chuyên môn chỉ tham khảo |
| 13 | Danh sách tồn kho | `@danh_sach_tonkho` | Mã/tên sản phẩm | Phân biệt tồn ERP và số có thể bán |
| 14 | Tra cứu sản phẩm | `@tra_cuu_san_pham` | Từ khóa sản phẩm | Không dùng formatter số cho mã/lô/SĐT |
| 15 | Sản phẩm trọng tâm | `@san_pham_trong_tam` | Khách nếu xem tiến độ | Theo chương trình doanh nghiệp |
| 16 | Đề xuất khuyến mãi | `@de_xuat_khuyen_mai` | Không bắt buộc | Dành cho Quản lý/Admin, cần phê duyệt |
| 17 | Danh mục | `@danh_muc` | Loại danh mục/từ khóa | Chỉ trả danh mục thuộc scope |
| 18 | Khảo sát 360 | `@khao_sat360` | Mã khách hàng | Theo mẫu khảo sát đã cấu hình |
| 19 | Câu hỏi khảo sát | `@danh_sach_cau_hoi_khao_sat` | Mã khách hàng | Không tự sinh câu hỏi ngoài cấu hình |
| 20 | Kiểm tra khảo sát | `@kiem_tra_khao_sat` | Mã khách hàng | Kiểm tra trạng thái thực hiện |
| 21 | Khảo sát trong ngày | `@kiem_tra_khao_sat_ngay` | Ngày/tài khoản | Theo quyền người dùng |
| 22 | Lịch sử khảo sát | `@lich_su_khao_sat` | Mã khách hàng | Chỉ lịch sử trong scope |
| 23 | Thông báo | `@thong_bao` | Bộ lọc nếu có | Không hiển thị thông báo của người khác |
| 24 | Tìm sản phẩm theo triệu chứng | `@tim_san_pham_theo_trieu_chung` | Từ khóa triệu chứng | Chỉ gợi ý sản phẩm tham khảo, không chẩn đoán |

## 12. Câu hỏi tự nhiên tương ứng với 24 chức năng

```text
1. Doanh số của tôi từ ngày 09/07/2026 đến 20/07/2026?
2. Cho tôi xem hóa đơn trong tháng này.
3. Xem chi tiết hóa đơn {MÃ HÓA ĐƠN}.
4. Cho tôi xem đơn hàng của khách {MÃ KHÁCH}.
5. Chấm điểm khách hàng của tôi.
6. Cho tôi xem công nợ khách hàng.
7. Xem chi tiết công nợ khách {MÃ KHÁCH}.
8. Khách {MÃ KHÁCH} đang tích lũy được bao nhiêu?
9. Hôm nay tôi nên ghé khách nào?
10. Gợi ý đơn hàng cho khách {MÃ KHÁCH}.
11. Gợi ý bán kèm cho khách {MÃ KHÁCH}.
12. Tìm sản phẩm Medstand tương ứng với {TÊN SẢN PHẨM GỐC}.
13. Tồn kho sản phẩm {MÃ SẢN PHẨM}.
14. Tra cứu sản phẩm {TỪ KHÓA}.
15. Sản phẩm trọng tâm tháng này là gì?
16. Sản phẩm nào cần xem xét khuyến mãi?
17. Cho tôi xem danh mục kho hàng.
18. Mở khảo sát 360 cho khách {MÃ KHÁCH}.
19. Câu hỏi khảo sát của khách {MÃ KHÁCH}.
20. Khách {MÃ KHÁCH} đã làm khảo sát chưa?
21. Hôm nay tôi có khảo sát nào cần làm?
22. Xem lịch sử khảo sát khách {MÃ KHÁCH}.
23. Tôi có thông báo gì mới?
24. Tìm sản phẩm tham khảo cho từ khóa {TRIỆU CHỨNG}.
```

## 13. Cách nhập tham số đúng

### Mã khách hàng

- Ưu tiên chọn từ danh sách khách được hệ thống trả về.
- Mã khách là chuỗi, không thêm dấu phân cách hàng nghìn.
- Nếu gõ tên khách, hệ thống có thể phân giải tên sang mã; khi trùng tên cần chọn lại đúng khách.

### Mã sản phẩm và số lô

- Giữ nguyên chữ, số và số 0 ở đầu.
- Số lô là chuỗi, không coi là số tiền.
- Khi không chắc tên sản phẩm, dùng **Tra cứu sản phẩm** trước.

### Ngày tháng

- Trên giao diện dùng định dạng `dd/MM/yyyy`.
- Với câu tự nhiên nên ghi đủ ngày/tháng/năm để tránh hiểu nhầm.
- “Hôm nay” lấy theo ngày hệ thống tại thời điểm truy vấn.

### Số tiền và số điện thoại

- Số tiền hiển thị kèm đơn vị `₫` hoặc nhãn VND.
- Số điện thoại là chuỗi, không đọc dấu chấm như phân cách tiền.

## 14. Cách hiểu các trạng thái quan trọng

| Nội dung | Ý nghĩa cho người dùng |
|---|---|
| Đã thanh toán | Khoản nợ đã được bù hết theo dữ liệu hiện có |
| Thanh toán một phần | Đã có phát sinh giảm nhưng vẫn còn dư nợ |
| Chưa thanh toán | Chưa ghi nhận phát sinh giảm cho khoản nợ |
| Quá hạn | Còn nợ và đã qua ngày đến hạn |
| Chưa xác định hạn | ERP chưa có ngày đến hạn; không đồng nghĩa chưa quá hạn |
| Tồn ERP | Số lượng ghi nhận trong dữ liệu kho hiện tại |
| Số có thể bán | Số sau khi xem xét giữ chỗ/hàng khóa nếu nguồn dữ liệu hỗ trợ |
| Chưa xác minh để bán | Có số tồn nhưng chưa đủ bằng chứng để cam kết với khách |
| Khách mới | Chưa đủ lịch sử để kết luận chu kỳ mua |
| Tier A/B/C | Phân khúc giá trị, không phải mức rủi ro |
| Rủi ro cao | Có dấu hiệu cần chăm sóc; khách vẫn có thể là Tier A |

## 15. Hướng dẫn từng màn hình chính

### Trang chủ

Xem nhanh doanh số và các chỉ số tổng quan. Khi đổi khoảng ngày, chờ biểu đồ tải xong rồi kiểm tra ngày đầu/ngày cuối. Không dùng dữ liệu cache cũ sau khi đổi tài khoản.

### Tuyến

Xem khách trong tuyến và mức ưu tiên. Lý do có thể là lâu chưa mua, sắp đến chu kỳ mua hoặc có công nợ cần theo dõi. Nếu hệ thống báo chưa có nguồn check-in, không gọi ngày mua là ngày ghé khách.

### Đơn hàng và hóa đơn

Dùng bộ lọc trạng thái, ngày, khách và nhân viên. Mở từng dòng để xem chi tiết. Các mã kỹ thuật chỉ dùng đối soát; người dùng tập trung vào khách, sản phẩm, số lượng, tiền và trạng thái.

### Báo cáo

Quản lý có thể xem tổng quan đội; Sale chỉ xem phạm vi cá nhân. Khi biểu đồ không có điểm dữ liệu, kiểm tra khoảng ngày và tài khoản trước khi báo lỗi.

### Khách hàng

Tra cứu khách, Tier, rủi ro, công nợ và lịch sử mua. Không suy đoán khách ngoài phạm vi khi kết quả rỗng.

### Trợ lý AI

Gõ câu tự nhiên hoặc chọn lệnh nhanh. Có thể mở rộng từng dòng, tìm kiếm trong kết quả và chuyển trang. Nút xóa chỉ xóa hội thoại trên giao diện, không xóa dữ liệu ERP.

## 16. Xử lý sự cố chi tiết

| Biểu hiện | Nguyên nhân thường gặp | Người dùng xử lý | Khi nào chuyển Admin |
|---|---|---|---|
| Không vào được hệ thống | Sai tài khoản/mật khẩu | Nhập lại, kiểm tra Caps Lock | Tài khoản vẫn bị từ chối |
| Trắng màn hình sau đăng nhập | Phiên cũ/cache | Ctrl+F5, đăng nhập lại | Vẫn trắng sau trình duyệt khác |
| Không thấy dữ liệu | Sai ngày hoặc ngoài scope | Kiểm tra khoảng ngày/mã | Khách chắc chắn thuộc quyền nhưng vẫn rỗng |
| Danh tính chưa ánh xạ | Tài khoản web chưa nối nhân viên | Đăng xuất/đăng nhập lại | Lỗi lặp lại cùng username |
| Thiếu tham số | Câu hỏi thiếu mã khách/sản phẩm | Bổ sung đối tượng | Form đã đủ nhưng API vẫn báo thiếu |
| Tồn chưa kiểm tra | Luồng gợi ý chưa gọi kho | Bấm **Kiểm tra tồn kho** | API kho cũng không có kết quả |
| Tên nhân viên sai | Tên không đồng nhất giữa bảng | Ghi EmployeeID và hai tên | Admin đối chiếu DB gốc |
| Chữ bị lỗi font | Dữ liệu encoding cũ | Chụp ảnh và ghi bản ghi | Luôn chuyển đội dữ liệu |
| Nút không bấm được | Đang tải hoặc sự kiện UI lỗi | Chờ, tải lại trang | Lặp lại sau Ctrl+F5 |
| Câu tự nhiên không hiểu | Thiếu thực thể/từ ngữ ngoài 24 luồng | Dùng câu mẫu hoặc lệnh `@` | Câu chuẩn vẫn không định tuyến |

## 17. Yêu cầu bằng chứng khi báo lỗi

Một lỗi hợp lệ cần đủ:

1. Username và vai trò, không ghi mật khẩu.
2. Thời điểm phát sinh.
3. Trang/chức năng đang dùng.
4. Câu hỏi nguyên văn hoặc các tham số đã chọn.
5. Mã khách/sản phẩm/hóa đơn liên quan.
6. Ảnh toàn màn hình có thông báo lỗi.
7. Kết quả mong đợi theo nghiệp vụ.

## 18. Những việc chưa được phép trong Pilot

- Không tự áp giá hoặc phát hành khuyến mãi.
- Không ghi đơn thật từ câu tự nhiên.
- Không thêm khách thật nếu chưa có quy trình phê duyệt.
- Không import sản phẩm trọng tâm thật qua chatbot.
- Không dùng tài khoản Admin để truy cập thay người dùng khác.
- Không coi dữ liệu mock là bằng chứng tài chính chính thức.

Các chức năng ghi dữ liệu có thể xuất hiện dưới dạng form xem trước, nhưng chỉ được nghiệm thu luồng hiển thị và xác nhận; chưa dùng để vận hành thật.

## 19. Khác biệt khi đưa lên server chính thức

Trước khi chuyển từ local/medtest lên server:

1. Xác nhận URL API và n8n production.
2. Kiểm tra lại 13 tài khoản hoặc danh sách tài khoản Pilot mới.
3. Không mang dữ liệu UAT tiền tố `U13D_`, `U13S1_`, `DK_UAT_` sang dữ liệu thật nếu không được duyệt.
4. Chạy lại kiểm tra phân quyền ba miền.
5. Đối soát doanh số, công nợ và tồn kho với owner nghiệp vụ.
6. Chỉ bật mutation sau khi có quy trình xác nhận và rollback.

## 20. Checklist người dùng trước khi kết thúc buổi UAT

- [ ] Đăng nhập đúng tài khoản và vai trò.
- [ ] Chạy ít nhất một câu bằng lệnh nhanh.
- [ ] Chạy ít nhất ba câu bằng ngôn ngữ tự nhiên.
- [ ] Kiểm tra một khách đúng phạm vi.
- [ ] Thử một khách ngoài phạm vi theo hướng dẫn của điều phối viên.
- [ ] Kiểm tra doanh số theo ngày.
- [ ] Kiểm tra công nợ chi tiết.
- [ ] Kiểm tra tồn kho một sản phẩm.
- [ ] Kiểm tra gợi ý đơn hàng hoặc bán kèm.
- [ ] Ghi lại mọi kết quả sai nghiệp vụ.
- [ ] Không thực hiện ghi dữ liệu thật.
