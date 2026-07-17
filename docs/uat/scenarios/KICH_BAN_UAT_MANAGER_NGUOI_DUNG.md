# Kịch bản nghiệm thu Medstand dành cho Manager và người dùng

## 1. Thông tin đợt kiểm tra

| Thông tin | Nội dung |
|---|---|
| Phiên bản hệ thống | `____________________` |
| Ngày kiểm tra | `____/____/________` |
| Người thực hiện | `____________________` |
| Tài khoản sử dụng | `____________________` |
| Thiết bị | ☐ Máy tính ☐ Điện thoại ☐ Máy tính bảng |

## 2. Hướng dẫn

- Thực hiện lần lượt các bước trong từng tình huống.
- Chọn một kết quả: **Đạt**, **Không đạt**, **Không thể kiểm tra** hoặc **Không áp dụng**.
- Nếu kết quả không đạt, chụp ảnh màn hình và ghi ngắn gọn điều đã xảy ra.
- Không chia sẻ mật khẩu trong phiếu kết quả hoặc ảnh chụp.

| Kết quả | Ý nghĩa |
|---|---|
| Đạt | Chức năng hoạt động đúng. |
| Không đạt | Có lỗi hoặc kết quả không đúng. |
| Không thể kiểm tra | Thiếu dữ liệu, thiếu quyền hoặc hệ thống chưa sẵn sàng. |
| Không áp dụng | Chức năng không dành cho tài khoản này. |

## 3. Danh sách người tham gia

| Miền | Tài khoản Manager | Người thực hiện | Tài khoản nhân viên đối chiếu |
|---|---|---|---|
| Miền Bắc | `QLBH013.MED` | Mai Anh Tuấn | `NAMDINHB.MED` |
| Miền Bắc | `QLBH016.MED` | Trần Văn Hường | `BACNINHA.MED` |
| Miền Trung | `QLBH005.MED` | Nguyễn Thế Anh | `HUEB.MED` |
| Miền Trung | `QLBH010.MED` | Nguyễn Văn Việt Anh | `DANANGA.MED` |
| Miền Nam | `QLMN2` | Trần Văn Luận | `CanThoA` |
| Miền Nam | `QLMD1` | Nguyễn Văn Thái | `BinhPhuocA` |
| Miền Nam | `QLBH024.MED` | Ngô Đức Hùng | `BinhPhuocA` |

Lưu ý cho người điều phối: cần xác nhận phạm vi quản lý của `BinhPhuocA` trước khi hai Manager Bình Phước kiểm tra quyền xem dữ liệu.

## 4. Các tình huống nghiệm thu

### UAT-01 — Đăng nhập

**Người thực hiện:** Manager hoặc nhân viên

**Các bước**

1. Mở hệ thống.
2. Nhập tài khoản và mật khẩu được cung cấp.
3. Nhấn “Đăng nhập”.
4. Kiểm tra tên người dùng và các chức năng được hiển thị.

**Kết quả mong đợi**

- Đăng nhập thành công.
- Hiển thị đúng tên và vai trò.
- Chỉ thấy các chức năng thuộc phạm vi công việc.

**Kết quả:** ☐ Đạt ☐ Không đạt ☐ Không thể kiểm tra ☐ Không áp dụng  
**Ghi chú:** `__________________________________________________`

### UAT-02 — Duy trì phiên làm việc

**Các bước**

1. Sau khi đăng nhập, mở một màn hình có dữ liệu.
2. Tải lại trang.

**Kết quả mong đợi**

- Vẫn đăng nhập và xem được dữ liệu đúng phạm vi.
- Không bị chuyển sai trang hoặc hiển thị trang trắng.

**Kết quả:** ☐ Đạt ☐ Không đạt ☐ Không thể kiểm tra ☐ Không áp dụng  
**Ghi chú:** `__________________________________________________`

### UAT-03 — Đăng xuất

**Các bước**

1. Mở một màn hình có dữ liệu.
2. Nhấn “Đăng xuất”.
3. Nhấn nút quay lại của trình duyệt.

**Kết quả mong đợi**

- Hệ thống trở về màn hình đăng nhập.
- Không xem lại được dữ liệu của phiên trước.

**Kết quả:** ☐ Đạt ☐ Không đạt ☐ Không thể kiểm tra ☐ Không áp dụng  
**Ghi chú:** `__________________________________________________`

### UAT-04 — Giao diện chatbot

**Các bước**

1. Gửi một tin nhắn ngắn.
2. Gửi một tin nhắn dài khoảng ba đoạn văn.
3. Mở một kết quả dạng bảng hoặc thẻ thông tin.
4. Thử trên máy tính và điện thoại nếu có.

**Kết quả mong đợi**

- Tin nhắn dễ đọc, không bị co hẹp hoặc xuống dòng từng ký tự.
- Bảng và thẻ có kích thước hợp lý, không che lịch sử trò chuyện.
- Không hiển thị mã kỹ thuật hoặc thông báo lỗi khó hiểu.

**Kết quả:** ☐ Đạt ☐ Không đạt ☐ Không thể kiểm tra ☐ Không áp dụng  
**Ghi chú:** `__________________________________________________`

### UAT-05 — Kiểm tra phạm vi quản lý

**Người thực hiện:** Manager

**Các bước**

1. Chọn một nhân viên thuộc nhóm.
2. Kiểm tra dữ liệu khách hàng và doanh số của nhân viên đó.
3. Thử tìm một nhân viên ngoài nhóm.

**Kết quả mong đợi**

- Xem được dữ liệu của nhân viên thuộc nhóm.
- Không xem được dữ liệu của nhân viên ngoài phạm vi quản lý.

**Kết quả:** ☐ Đạt ☐ Không đạt ☐ Không thể kiểm tra ☐ Không áp dụng  
**Ghi chú:** `__________________________________________________`

### UAT-06 — Kiểm tra công nợ khách hàng

**Các bước**

1. Chọn một khách hàng thuộc phạm vi phụ trách.
2. Xem tổng công nợ.
3. Mở chi tiết công nợ.
4. So sánh tổng tiền giữa hai màn hình.

**Kết quả mong đợi**

- Tìm đúng khách hàng theo mã hoặc tên.
- Tổng công nợ và chi tiết khớp nhau.
- Không thấy khách hàng ngoài phạm vi được giao.

**Kết quả:** ☐ Đạt ☐ Không đạt ☐ Không thể kiểm tra ☐ Không áp dụng  
**Ghi chú:** `__________________________________________________`

### UAT-07 — Danh mục và tồn kho

**Các bước**

1. Tra cứu lần lượt khách hàng, sản phẩm và kho hàng.
2. Tra tồn kho theo một mã sản phẩm.
3. Kiểm tra kho hoặc chi nhánh trên từng dòng kết quả.

**Kết quả mong đợi**

- Chọn Kho hàng thì hệ thống trả danh sách kho.
- Kết quả tồn kho cho biết sản phẩm đang ở kho/chi nhánh nào và số lượng bao nhiêu.
- Không thấy kho ngoài phạm vi được giao.

**Kết quả:** ☐ Đạt ☐ Không đạt ☐ Không thể kiểm tra ☐ Không áp dụng  
**Ghi chú:** `__________________________________________________`

### UAT-08 — Doanh số

**Các bước**

1. Chọn khoảng thời gian có phát sinh giao dịch.
2. Xem doanh số của bản thân hoặc nhóm được quản lý.
3. Tra doanh số theo một khách hàng.
4. Thử tìm một nhân viên ngoài phạm vi.

**Kết quả mong đợi**

- Khoảng ngày chỉ hiển thị một lần và dễ hiểu.
- Khách hàng có giao dịch trả về doanh số phù hợp.
- Chỉ xem được dữ liệu trong phạm vi được giao.

**Kết quả:** ☐ Đạt ☐ Không đạt ☐ Không thể kiểm tra ☐ Không áp dụng  
**Ghi chú:** `__________________________________________________`

### UAT-09 — Đơn hàng và hóa đơn

**Các bước**

1. Xem danh sách đơn theo từng trạng thái.
2. Mở chi tiết một đơn hàng.
3. Tra hóa đơn theo khoảng ngày.
4. Mở chi tiết một hóa đơn.

**Kết quả mong đợi**

- Mỗi đơn chỉ thuộc một trạng thái hiện tại.
- Danh sách và chi tiết khớp nhau.
- Hóa đơn trong khoảng ngày được hiển thị đầy đủ.
- Chỉ xem được dữ liệu thuộc phạm vi.

**Kết quả:** ☐ Đạt ☐ Không đạt ☐ Không thể kiểm tra ☐ Không áp dụng  
**Ghi chú:** `__________________________________________________`

### UAT-10 — Tạo đơn hàng

**Các bước**

1. Mở màn hình Tạo đơn hàng.
2. Kiểm tra chi nhánh được chọn.
3. Tìm một khách hàng theo mã hoặc tên.
4. Tìm và thêm một sản phẩm.
5. Kiểm tra số lượng, đơn giá và tổng tiền.

**Kết quả mong đợi**

- Tài khoản có một chi nhánh được tự chọn đúng; tài khoản có nhiều chi nhánh chọn được trong phạm vi.
- Tìm được khách hàng thuộc phạm vi.
- Gợi ý sản phẩm ngắn gọn, không che các trường khác.
- Tổng tiền được tính đúng.

Không bấm tạo đơn thật nếu người điều phối chưa cho phép.

**Kết quả:** ☐ Đạt ☐ Không đạt ☐ Không thể kiểm tra ☐ Không áp dụng  
**Ghi chú:** `__________________________________________________`

### UAT-11 — Thêm nhanh khách hàng

**Các bước**

1. Mở biểu mẫu Thêm khách hàng trong chatbot.
2. Nhập tên hoặc số điện thoại của một khách hiện có.
3. Kiểm tra danh sách khách tương tự.
4. Nhập thông tin khách mới nhưng chưa bấm lưu nếu chưa được cho phép.

**Kết quả mong đợi**

- Danh sách tương tự chỉ xuất hiện sau khi nhập tên hoặc số điện thoại.
- Biểu mẫu dễ sử dụng và không hiển thị dữ liệu kỹ thuật.
- Không tạo trùng khách hàng.

**Kết quả:** ☐ Đạt ☐ Không đạt ☐ Không thể kiểm tra ☐ Không áp dụng  
**Ghi chú:** `__________________________________________________`

### UAT-12 — Thông báo

**Các bước**

1. Mở biểu tượng chuông.
2. Mở một thông báo chưa đọc.
3. Tải lại trang.

**Kết quả mong đợi**

- Danh sách thông báo hiển thị rõ ràng.
- Thông báo đã mở giữ trạng thái đã đọc sau khi tải lại.
- Số thông báo chưa đọc được cập nhật đúng.

**Kết quả:** ☐ Đạt ☐ Không đạt ☐ Không thể kiểm tra ☐ Không áp dụng  
**Ghi chú:** `__________________________________________________`

### UAT-13 — Tìm sản phẩm theo triệu chứng

**Các bước**

1. Nhập một triệu chứng thông thường.
2. Xem danh sách sản phẩm được gợi ý.
3. Nhập thêm thông tin như đang mang thai, dị ứng hoặc có bệnh nền.

**Kết quả mong đợi**

- Kết quả có giải thích ngắn gọn vì sao được gợi ý.
- Có cảnh báo nội dung chỉ mang tính tham khảo.
- Không khẳng định sản phẩm an toàn hoặc phù hợp khi chưa đủ thông tin.
- Khuyến nghị tham khảo dược sĩ/bác sĩ trong trường hợp có rủi ro.

**Kết quả:** ☐ Đạt ☐ Không đạt ☐ Không thể kiểm tra ☐ Không áp dụng  
**Ghi chú:** `__________________________________________________`

### UAT-14 — Chấm điểm khách hàng

**Các bước**

1. Mở chức năng Chấm điểm khách hàng.
2. Lọc theo nhóm, mức độ nguy cơ, nhân viên hoặc chi nhánh.
3. Chuyển sang trang kết quả tiếp theo.

**Kết quả mong đợi**

- Mặc định chỉ hiển thị một số khách hàng ưu tiên.
- Có thể lọc và chuyển trang.
- Mỗi nhóm có tên hoặc giải thích dễ hiểu.
- Chỉ hiển thị khách hàng thuộc phạm vi.

**Kết quả:** ☐ Đạt ☐ Không đạt ☐ Không thể kiểm tra ☐ Không áp dụng  
**Ghi chú:** `__________________________________________________`

### UAT-15 — Gợi ý đơn hàng

**Các bước**

1. Chọn một nhân viên hoặc khách hàng thuộc phạm vi.
2. Xem danh sách sản phẩm gợi ý.

**Kết quả mong đợi**

- Hiển thị rõ khách hàng, sản phẩm, số lượng và lý do gợi ý.
- Chỉ có dữ liệu thuộc phạm vi của tài khoản.

**Kết quả:** ☐ Đạt ☐ Không đạt ☐ Không thể kiểm tra ☐ Không áp dụng  
**Ghi chú:** `__________________________________________________`

### UAT-16 — Tuyến bán hàng

**Các bước**

1. Xem tuyến bán hàng hôm nay.
2. Chọn một ngày khác.
3. Manager chọn một nhân viên thuộc nhóm.

**Kết quả mong đợi**

- Danh sách điểm ghé đúng ngày và nhân viên.
- Hiển thị rõ thứ tự ghé và trạng thái nếu đã có dữ liệu.
- Manager không xem được nhân viên ngoài nhóm.

**Kết quả:** ☐ Đạt ☐ Không đạt ☐ Không thể kiểm tra ☐ Không áp dụng  
**Ghi chú:** `__________________________________________________`

### UAT-17 — Khảo sát

Chỉ thực hiện khi người điều phối xác nhận chức năng Khảo sát đã sẵn sàng.

**Các bước**

1. Mở danh sách khảo sát.
2. Mở một bài ở trạng thái “Chưa làm” và nhấn Bắt đầu.
3. Trả lời một câu, nhấn Nộp bài, sau đó chọn Tiếp tục làm.
4. Nộp lại và xác nhận.
5. Mở lịch sử và xem lại bài vừa làm.

**Kết quả mong đợi**

- Khi bắt đầu, trạng thái chuyển từ “Chưa làm” sang “Đang làm”.
- Chọn Tiếp tục làm thì bài chưa bị hoàn thành.
- Xác nhận nộp thì trạng thái chuyển sang “Đã hoàn thành”.
- Khi xem lại bài cũ, hệ thống không tạo thêm bài khảo sát mới và không cho sửa bài đã nộp.

**Kết quả:** ☐ Đạt ☐ Không đạt ☐ Không thể kiểm tra ☐ Không áp dụng  
**Ghi chú:** `__________________________________________________`

## 5. Phân công trọng tâm

| Cặp tài khoản | Nội dung trọng tâm |
|---|---|
| `QLBH013.MED` + `NAMDINHB.MED` | Công nợ, doanh số, đơn hàng và hóa đơn. |
| `QLBH016.MED` + `BACNINHA.MED` | Danh mục, tồn kho, tạo đơn và khách hàng. |
| `QLBH005.MED` + `HUEB.MED` | Doanh số theo khách hàng và giao diện chatbot. |
| `QLBH010.MED` + `DANANGA.MED` | Tuyến, gợi ý đơn hàng và thông báo. |
| `QLMN2` + `CanThoA` | Chấm điểm khách hàng và phân trang. |
| `QLMD1` + `BinhPhuocA` | Khảo sát, lịch sử và tiếp tục bài. |
| `QLBH024.MED` + `BinhPhuocA` | Phạm vi quản lý và dữ liệu Bình Phước. |

Tất cả người tham gia đều thực hiện `UAT-01` đến `UAT-05`, sau đó thực hiện các nội dung trọng tâm được phân công.

## 6. Mẫu ghi nhận vấn đề

```text
Chức năng đang kiểm tra:
Tài khoản:
Các bước đã làm:
Điều gì đã xảy ra:
Kết quả mong muốn:
Ảnh chụp màn hình:
```

## 7. Xác nhận cuối đợt kiểm tra

| Nội dung | Kết quả |
|---|---|
| Các công việc chính có thể hoàn thành | ☐ Đạt ☐ Không đạt |
| Dữ liệu hiển thị đúng phạm vi | ☐ Đạt ☐ Không đạt |
| Giao diện dễ hiểu và dễ thao tác | ☐ Đạt ☐ Không đạt |
| Có thể đưa vào sử dụng thử nghiệm | ☐ Đồng ý ☐ Chưa đồng ý |

**Ý kiến bổ sung:**  
`________________________________________________________________________`  
`________________________________________________________________________`

**Người xác nhận:** `____________________`  
**Ngày:** `____/____/________`
