# Phụ lục kỹ thuật UAT hệ thống Medstand

Tài liệu này dành cho QA, điều phối viên và đội kỹ thuật. Manager và người dùng cuối sử dụng [KICH_BAN_UAT_MANAGER_NGUOI_DUNG.md](KICH_BAN_UAT_MANAGER_NGUOI_DUNG.md).

## 1. Mục tiêu

Tài liệu này dùng cho đợt test thực tế sau khi các lỗi FE, API SQL và workflow n8n đã được chỉnh sửa. Mục tiêu chính:

- Kiểm tra chức năng trên dữ liệu thật của ba miền.
- Kiểm tra phân quyền giữa tài khoản quản lý bán hàng và trình dược viên.
- Kiểm tra không rò rỉ dữ liệu giữa chi nhánh, nhân viên và khu vực.
- Ghi nhận lỗi theo cùng một biểu mẫu để dễ đối chiếu.

Không lưu mật khẩu trong tài liệu này. Mật khẩu test phải được cung cấp qua kênh riêng.

### Thông tin bản phát hành (bắt buộc điền trước khi test)

| Thông tin | Giá trị |
|---|---|
| Môi trường | UAT / Staging: `__________` |
| URL FE | `__________` |
| FE build/commit | `__________` |
| BE/Gateway version | `__________` |
| n8n workflow version | `__________` |
| SQL deployment version/thời gian apply | `__________` |
| Database snapshot time | `__________` |
| Timezone FE/API/n8n/SQL | `__________` |
| Người điều phối UAT | `__________` |

## 2. Danh sách tài khoản test

| STT | Miền | Tài khoản QLBH | Tên người test | Tài khoản TDV đối chiếu | Khu vực |
|---:|---|---|---|---|---|
| 1 | MB | `QLBH013.MED` | Mai Anh Tuấn | `NAMDINHB.MED` | Nam Định |
| 2 | MB | `QLBH016.MED` | Trần Văn Hường | `BACNINHA.MED` | Bắc Ninh |
| 3 | MT | `QLBH005.MED` | Nguyễn Thế Anh | `HUEB.MED` | Huế |
| 4 | MT | `QLBH010.MED` | Nguyễn Văn Việt Anh | `DANANGA.MED` | Đà Nẵng |
| 5 | MN | `QLMN2` | Trần Văn Luận | `CanThoA` | Cần Thơ |
| 6 | MN | `QLMD1` | Nguyễn Văn Thái | `BinhPhuocA` | Bình Phước |
| 7 | MN | `QLBH024.MED` | Ngô Đức Hùng | `BinhPhuocA` | Bình Phước |

Lưu ý: `BinhPhuocA` được dùng đối chiếu cho hai tài khoản QLBH. Khi test phải xác nhận tài khoản này thuộc nhóm/phạm vi của quản lý nào, hoặc có chủ đích được cả hai quản lý xem hay không.

### Mapping quyền thực tế (lấy từ DB/cấu hình, không suy đoán theo tên user)

| Tài khoản | Vai trò thực tế | BranchID | EmployeeID | ManagerID | Phạm vi khách hàng/kho | Đã xác nhận |
|---|---|---|---|---|---|---|
| `QLBH013.MED` | `___` | `___` | `___` | `___` | `___` | ☐ |
| `QLBH016.MED` | `___` | `___` | `___` | `___` | `___` | ☐ |
| `QLBH005.MED` | `___` | `___` | `___` | `___` | `___` | ☐ |
| `QLBH010.MED` | `___` | `___` | `___` | `___` | `___` | ☐ |
| `QLMN2` | `___` | `___` | `___` | `___` | `___` | ☐ |
| `QLMD1` | `___` | `___` | `___` | `___` | `___` | ☐ |
| `QLBH024.MED` | `___` | `___` | `___` | `___` | `___` | ☐ |
| `NAMDINHB.MED` | `___` | `___` | `___` | `___` | `___` | ☐ |
| `BACNINHA.MED` | `___` | `___` | `___` | `___` | `___` | ☐ |
| `HUEB.MED` | `___` | `___` | `___` | `___` | `___` | ☐ |
| `DANANGA.MED` | `___` | `___` | `___` | `___` | `___` | ☐ |
| `CanThoA` | `___` | `___` | `___` | `___` | `___` | ☐ |
| `BinhPhuocA` | `___` | `___` | `___` | `___` | `___` | ☐ |

Precondition bắt buộc: nếu chưa xác nhận quan hệ của `BinhPhuocA`, mọi test case phân quyền liên quan phải đánh `BLOCKED`, không được kết luận là rò rỉ dữ liệu.

## 3. Chuẩn bị trước khi test

- Xác nhận FE, BE/gateway và n8n đang chạy đúng môi trường.
- Xác nhận các file SQL mới nhất đã apply trên database `medtest`.
- Ghi đủ version/build theo bảng thông tin phát hành; không test trên build không xác định.
- Mỗi tài khoản đăng nhập bằng profile sạch hoặc cửa sổ riêng; xóa cache/localStorage khi đổi vai trò.
- Xác nhận timezone giữa FE, API, n8n và SQL thống nhất.
- Chốt database snapshot và không chỉnh dữ liệu chuẩn trong lúc test.
- Dữ liệu mới phải có tiền tố `UAT_` hoặc danh sách ID để dọn sau test.
- Ghi lại thời gian bắt đầu, tên tài khoản, thiết bị và trình duyệt.
- Chuẩn bị tối thiểu một khách hàng, sản phẩm, đơn hàng và hóa đơn có dữ liệu cho mỗi khu vực.

## 4. Quy ước kết quả

| Kết quả | Ý nghĩa |
|---|---|
| PASS | Kết quả đúng hoàn toàn với mong đợi. |
| FAIL | Sai dữ liệu, sai quyền, lỗi giao diện hoặc không hoàn thành được thao tác. |
| BLOCKED | Không thể test do thiếu dữ liệu, API/n8n chưa chạy hoặc chưa được cấp quyền. |
| N/A | Chức năng không áp dụng cho vai trò/tài khoản này. |
| NOT RUN | Chưa thực hiện. |
| RETEST | Lỗi đã được sửa và đang chờ chạy lại. |

`BLOCKED` chỉ dùng khi không thể thực hiện do điều kiện bên ngoài. Nếu API đã chạy nhưng trả sai dữ liệu/sai quyền, kết quả là `FAIL`.

## 5. Kịch bản chung cho tất cả tài khoản

### TC-AUTH-01 — Đăng nhập đúng vai trò

1. Đăng nhập bằng tài khoản được giao.
- Hiển thị đúng tên và vai trò.

### TC-AUTH-02 — Duy trì phiên sau reload

1. Đăng nhập thành công.
2. Tải lại trang và mở một chức năng có quyền.

Mong đợi:

- Phiên đăng nhập còn hợp lệ sau khi tải lại.

### TC-AUTH-03 — Logout vô hiệu hóa phiên

1. Mở một màn hình có dữ liệu, sau đó đăng xuất.
2. Dùng Back và thử gọi lại API bằng token/cookie cũ.

Mong đợi:

- Sau khi đăng xuất không truy cập lại được màn hình có dữ liệu.
- API trả `401/403`; cache dữ liệu nhạy cảm không còn hiển thị.

### TC-COMMON-02 — Giao diện chatbot

1. Gửi một tin nhắn ngắn và một tin nhắn dài.
2. Mở kết quả dạng thẻ và bảng.
3. Thử trên desktop và màn hình nhỏ.

Kết quả mong đợi:

- Bong bóng tin nhắn không bị co thành từng ký tự.
- Khung kết quả có chiều rộng thống nhất và cuộn nội bộ khi cần.
- Không hiển thị JSON, tên biến hoặc lỗi kỹ thuật.

Viewport bắt buộc: `1366×768`, `1920×1080`, `390×844`. Tin nhắn dài từ 300–500 ký tự, bao gồm tiếng Việt có dấu và một chuỗi dài không có khoảng trắng.

### TC-COMMON-03 — Trạng thái tải và lỗi API

1. Thực hiện một truy vấn có dữ liệu.
2. Thực hiện truy vấn không có dữ liệu.
3. Ghi nhận trạng thái trong khi yêu cầu đang xử lý.

Kết quả mong đợi:

- Không hiển thị “Không tìm thấy dữ liệu” khi API còn đang chạy.
- Truy vấn rỗng có thông báo tiếng Việt rõ ràng.
- Không tải vô hạn.

Chạy bổ sung các tình huống HTTP `400`, `403`, `500`, timeout và mất mạng. Thông báo cho người dùng phải bằng tiếng Việt; chi tiết kỹ thuật chỉ ghi log.

## 6. Kịch bản nghiệp vụ

### TC-BIZ-01 — Công nợ

Test data bắt buộc: `CustomerCode=___`, `CutoffDate=___`, `ExpectedTotal=___`, `ExpectedDetailRows=___`, nguồn đối chiếu SQL/nghiệp vụ `___`.

1. Tìm khách hàng theo mã và tên.
2. Chọn khách hàng từ danh sách gợi ý.
3. Tra cứu tổng nợ và chi tiết trong cùng ngày chốt.
4. So sánh tổng tiền giữa hai màn hình.

Mong đợi: mã khách hàng được mapping đúng; tổng nợ khớp; không thấy khách ngoài phạm vi.

### TC-BIZ-02 — Danh mục và tồn kho

1. Chọn lần lượt Khách hàng, Sản phẩm, Kho hàng và Đơn hàng.
2. Kiểm tra tham số ngày chỉ xuất hiện khi cần.
3. Tra tồn kho theo mã sản phẩm.

Mong đợi:

- Kho hàng trả danh sách kho, không trả danh sách sản phẩm.
- Dòng tồn kho hiển thị mã, tên, kho/chi nhánh, số lượng, lô, hạn dùng và đơn vị tính khi dữ liệu có các trường này.
- Không thấy kho ngoài phạm vi.

### TC-BIZ-03 — Doanh số

1. Tra doanh số bản thân/nhân viên thuộc nhóm.
2. Tra doanh số theo khách hàng và khoảng ngày.
3. Thử chọn nhân viên thuộc khu vực khác.

Mong đợi: QLBH chỉ xem nhóm được quản lý; TDV chỉ xem bản thân/phạm vi được giao; ngày không lặp.

### TC-BIZ-04 — Đơn hàng và hóa đơn

1. So sánh tổng số đơn theo từng trạng thái.
2. Mở chi tiết một đơn và đối chiếu danh sách.
3. Tra hóa đơn theo khoảng ngày.
4. Mở chi tiết hóa đơn.

5. Kiểm tra hóa đơn phát sinh lúc `23:59:59` của ngày kết thúc.

Mong đợi: trong danh sách trạng thái hiện tại, mỗi `OrderID` chỉ xuất hiện một lần và thuộc một trạng thái hiện hành; danh sách và chi tiết khớp; khoảng ngày bao gồm đúng bản ghi cuối ngày; dữ liệu đúng quyền.

### TC-BIZ-05 — Tạo đơn hàng

1. Mở Tạo đơn hàng.
2. Kiểm tra chi nhánh được tự chọn khi chỉ có một quyền.
3. Tìm khách hàng theo mã và tên.
4. Tìm sản phẩm và xem danh sách gợi ý.
5. Thêm sản phẩm, nhập số lượng và lưu nháp.

Mong đợi:

- Tài khoản có một chi nhánh được tự gán đúng; trường chỉ khóa sau khi có giá trị hợp lệ. Tài khoản có nhiều chi nhánh chọn được trong phạm vi quyền.
- Tìm được khách hàng thuộc phạm vi.
- Gợi ý sản phẩm chỉ hiển thị thông tin ngắn gọn.
- Không tạo đơn thật nếu chưa được điều phối viên cho phép. Chỉ dùng lưu nháp nếu build được test có chức năng này; nếu không thì dùng dữ liệu tiền tố `UAT_` và dọn sau test.

### TC-BIZ-06 — Thêm nhanh khách hàng trong chatbot

1. Mở biểu mẫu thêm khách hàng.
2. Nhập tên hoặc số điện thoại trùng với khách hiện có.
3. Kiểm tra danh sách gợi ý trùng.
4. Nhập khách mới và kiểm tra validation.

Mong đợi: danh sách tương tự chỉ xuất hiện sau khi nhập; không hiển thị JSON; form không bị che nút thao tác.

### TC-BIZ-07 — Thông báo

1. Mở biểu tượng chuông.
2. Kiểm tra danh sách và số chưa đọc.
3. Mở một thông báo.
4. Đánh dấu đã đọc và tải lại trang.

Mong đợi: chức năng được hiểu là “Xem thông báo”; badge và trạng thái đã đọc giữ đúng sau reload; không cho tài khoản thường gửi thông báo ngoài quyền.

### TC-BIZ-08 — Tìm thuốc theo triệu chứng

1. Nhập một triệu chứng đơn giản.
2. Nhập triệu chứng kèm thai kỳ, dị ứng hoặc bệnh nền.
3. So sánh thứ tự và lý do gợi ý.

Mong đợi: có từ khóa nhận diện, mức liên quan, công dụng và cảnh báo tham khảo; trường hợp rủi ro không được đề xuất thuốc khẳng định.

Tester chỉ đánh giá cách hệ thống diễn đạt và áp dụng cảnh báo, không kết luận tính an toàn y khoa. Hệ thống không được dùng các cụm “an toàn”, “nên dùng” hoặc “phù hợp với bạn” khi thiếu dữ liệu; phải có disclaimer và fallback sang dược sĩ/bác sĩ.

### TC-BIZ-09 — Tra cứu tổng hợp

Precondition: chỉ chạy khi đội kỹ thuật đã xác nhận `API_TraCuu_TongHop_AI`, metadata override và danh sách `Type/Action` hợp lệ đã deploy. Nếu chưa xác nhận, đánh `BLOCKED` hoặc `N/A`.

1. Chọn từng loại tra cứu.
2. Kiểm tra các trường thay đổi theo loại.
3. Gửi truy vấn chỉ với tham số bắt buộc.

Mong đợi: không hiển thị `ObjectID`, `EmployeeID`, `SearchText`; có mô tả và ví dụ; không kế thừa bộ lọc của truy vấn trước.

### TC-BIZ-10 — Chấm điểm khách hàng

1. Mở trang mặc định.
2. Lọc theo nhóm A/B/C, nguy cơ, nhân viên và chi nhánh.
3. Chuyển trang và kiểm tra thứ tự ưu tiên.

Mong đợi: không tải toàn bộ hàng nghìn dòng; nhóm có lý do/tiêu chí; dữ liệu đúng phạm vi.

### TC-BIZ-11 — Gợi ý đơn hàng

1. QLBH chọn một TDV thuộc nhóm.
2. TDV xem gợi ý sản phẩm cho khách thuộc phạm vi.
3. Kiểm tra khách hàng, sản phẩm, số lượng, lý do và dữ liệu tham chiếu.

Mong đợi: QLBH không chọn được TDV ngoài nhóm; TDV không nhận gợi ý của khách ngoài phạm vi; lý do gợi ý hiển thị đủ và không bị cắt chuỗi.

### TC-BIZ-12 — Tuyến bán hàng

1. TDV xem tuyến hôm nay và một ngày khác thứ.
2. QLBH chọn TDV trong nhóm, sau đó thử TDV ngoài nhóm.
3. Kiểm tra tuyến hết hiệu lực, thứ tự ghé và trạng thái đã ghé.
4. Đối chiếu ngày/giờ theo timezone đã chốt.

Mong đợi: tuyến đúng nhân viên, ngày/thứ và hiệu lực; QLBH không xem được TDV ngoài nhóm; thứ tự và trạng thái hiển thị khi DB có dữ liệu chuẩn.

## 7. Kịch bản khảo sát v2

Precondition bắt buộc: chỉ chạy nhóm này sau khi migration, các procedure khảo sát v2 và FE bundle mới đã deploy. Chạy [Test_API_KhaoSat_v2.sql](sql/Test_API_KhaoSat_v2.sql) thành công trước UAT; nếu không thì đánh toàn nhóm `BLOCKED`.

### TC-SURVEY-01 — Danh sách và tạo bài

1. Vào màn hình Khảo sát.
2. Kiểm tra chưa phát sinh `DocumentID` chỉ do mở trang.
3. Bấm “Làm bài khảo sát mới”.

Mong đợi: danh sách hiển thị trạng thái; chỉ tạo bài sau khi người dùng bấm nút.

### TC-SURVEY-02 — Xác nhận nộp bài

1. Trả lời một câu và bấm Nộp bài.
2. Chọn “Tiếp tục làm”.
3. Kiểm tra bài vẫn ở `IN_PROGRESS`.
4. Bấm Nộp bài lần nữa và xác nhận.

Mong đợi: hủy xác nhận không ghi kết quả cuối, không set `CompletedAt/ThoiGianKetThuc`, không khóa bài và vẫn ở `IN_PROGRESS`; xác nhận thì chuyển sang `COMPLETED`.

### TC-SURVEY-03 — Lịch sử

1. Ghi lại `DocumentID` của bài đã nộp.
2. Mở Lịch sử khảo sát và chọn bài đó.
3. Kiểm tra lại số bản ghi trên DB.

Mong đợi: mở đúng bài cũ; không phát sinh `DocumentID` mới; không thay đổi thời gian cập nhật; không cho sửa/nộp lại; câu trả lời và kết quả khớp lịch sử.

### TC-SURVEY-04 — Khảo sát được giao

1. Quản trị tạo bài bằng `dbo.API_GiaoBaiKhaoSat` cho tài khoản test.
2. Đăng nhập tài khoản đó.
3. Kiểm tra bài ở trạng thái “Chưa làm”.
4. Bấm Bắt đầu.

Mong đợi: trạng thái chuyển `NOT_STARTED` sang `IN_PROGRESS`; tài khoản khác không xem hoặc nộp được bài.

### TC-SURVEY-05 — Cố định bộ câu hỏi

1. Mở bài và ghi lại mã ba câu hỏi.
2. Tải lại trang hoặc đăng xuất/đăng nhập lại.
3. Mở tiếp bài đang làm.

Mong đợi: mã, nội dung và thứ tự câu hỏi không thay đổi theo `DocumentID`.

## 8. Ma trận phân công test

| Tài khoản | Trọng tâm test |
|---|---|
| `QLBH013.MED` + `NAMDINHB.MED` | Phân quyền MB, công nợ, doanh số, đơn hàng/hóa đơn. |
| `QLBH016.MED` + `BACNINHA.MED` | Phân quyền chéo MB, tồn kho, tạo đơn, khách hàng. |
| `QLBH005.MED` + `HUEB.MED` | Doanh số theo khách hàng, tra cứu tổng hợp, chatbot responsive. |
| `QLBH010.MED` + `DANANGA.MED` | Tuyến, gợi ý đơn hàng, thông báo, dữ liệu chi nhánh. |
| `QLMN2` + `CanThoA` | Chấm điểm khách hàng, phân trang, nhóm/rủi ro. |
| `QLMD1` + `BinhPhuocA` | Khảo sát v2, lịch sử, tiếp tục bài, quyền xem bài. |
| `QLBH024.MED` + `BinhPhuocA` | Kiểm tra phạm vi chồng lấn Bình Phước và rò rỉ dữ liệu giữa hai QLBH. |

### Theo dõi thực thi

| Cặp tài khoản | Người thực hiện | Ngày dự kiến | Ngày hoàn thành | Build | Kết quả | Số bug |
|---|---|---|---|---|---|---:|
| MB-1 | `___` | `___` | `___` | `___` | NOT RUN | 0 |
| MB-2 | `___` | `___` | `___` | `___` | NOT RUN | 0 |
| MT-1 | `___` | `___` | `___` | `___` | NOT RUN | 0 |
| MT-2 | `___` | `___` | `___` | `___` | NOT RUN | 0 |
| MN-1 | `___` | `___` | `___` | `___` | NOT RUN | 0 |
| MN-2 | `___` | `___` | `___` | `___` | NOT RUN | 0 |
| MN-3 | `___` | `___` | `___` | `___` | NOT RUN | 0 |

Smoke suite bắt buộc cho mỗi cặp: `TC-AUTH-01`, `TC-AUTH-02`, `TC-AUTH-03`, `TC-COMMON-02`, `TC-COMMON-03`, `TC-BIZ-01`, `TC-BIZ-03`, `TC-BIZ-04`, `TC-BIZ-05`. Các case khác chạy theo ma trận trọng tâm.

## 9. Kiểm tra phân quyền chéo bắt buộc

Mỗi tester thử tìm:

- Một TDV cùng nhóm.
- Một TDV cùng miền nhưng khác nhóm.
- Một TDV khác miền.
- Một khách hàng cùng phạm vi.
- Một khách hàng ngoài phạm vi.

Kết quả mong đợi: danh sách gợi ý, API và kết quả cuối cùng đều phải chặn dữ liệu ngoài quyền; không chỉ ẩn trên giao diện.

Phải kiểm tra đủ ba lớp: datasource combobox, request được sửa tay và response cuối. Nguồn phạm vi kỳ vọng phải ghi rõ: DB mapping, quan hệ manager, quan hệ chi nhánh và danh sách khách được giao.

## 10. Mẫu ghi nhận lỗi

```text
Mã test case:
Build/version:
Tài khoản:
Vai trò:
Thời gian:
Thiết bị / Trình duyệt:
Môi trường:

Các bước thực hiện:
1.
2.
3.

Kết quả thực tế:
Kết quả mong đợi:
Mức độ: Blocker / Critical / Major / Minor
Tần suất: Luôn xảy ra / Thỉnh thoảng / Một lần
Test data ID:
Khả năng tái hiện:
Tác động bảo mật/quyền riêng tư:
Request payload (xóa token/mật khẩu):
Response code/message:
DB evidence:
Ảnh hoặc video:
```

## 11. Tiêu chí kết thúc đợt test

- 100% test P0/P1 đã chạy và PASS.
- 100% permission test PASS; không có bằng chứng rò rỉ dữ liệu giữa tài khoản/chi nhánh.
- Tỷ lệ PASS tổng thể tối thiểu 95%.
- Không còn lỗi Blocker/Critical, sai tổng tiền, sai quyền hoặc tạo trùng dữ liệu.
- Không còn test `BLOCKED` không có owner và thời hạn xử lý.
- Các lỗi Major có người phụ trách và thời hạn sửa rõ ràng.
- Test case BLOCKED phải ghi rõ dữ liệu, quyền hoặc dịch vụ còn thiếu.
- Known issue P2 phải được ghi nhận và có xác nhận chấp thuận.
- Regression suite phải chạy lại trên bản sửa cuối cùng.

## 12. Mẫu test case chuẩn cho case bổ sung

```text
Test case ID:
Module:
Loại: Smoke / Regression / Permission / UAT
Priority: P0 / P1 / P2 / P3
Role:
Preconditions:
Test data:
Steps:
Expected result:
Actual result:
Status: NOT RUN / PASS / FAIL / BLOCKED / RETEST / N/A
Evidence:
```
