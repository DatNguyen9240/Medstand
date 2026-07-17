# Yêu cầu của khách hàng

**Sản phẩm:** Medstand – Ứng dụng AI cho phần mềm Sale  
**Trạng thái:** Ghi nhận yêu cầu ban đầu  
**Lưu ý:** Tài liệu này phản ánh nhu cầu nghiệp vụ do khách hàng cung cấp. Nội dung chưa phải cam kết phạm vi triển khai, chưa thay thế tài liệu phân tích yêu cầu, thiết kế kỹ thuật hoặc biên bản nghiệm thu.

## I. Mục tiêu triển khai AI

- Tăng doanh số trên từng điểm bán.
- Tăng hiệu suất làm việc của Trình dược viên (TDV).
- Cảnh báo tồn kho theo phạm vi được phân quyền cho từng người dùng, bao gồm:
  - Kho chính của công ty.
  - Kho `DL02`.
  - Kho `DL03`.
- Tự động hóa quản lý tuyến bán hàng.
- Tối ưu chương trình tích lũy doanh số, thưởng và chiết khấu.

## II. Tài liệu và dữ liệu nghiệp vụ Medstand hiện có

### 1. Chương trình bán hàng trọng tâm

- File `CTBH Trọng tâm.xls`.
- Danh sách có thể phát sinh thêm khi có sản phẩm mới.

### 2. Ảnh catalogue sản phẩm

- Nguồn ảnh: `ẢNH SP MED`.

### 3. Tóm tắt nhóm sản phẩm

- File `Danh mục sản phẩm cataloug - MB.xlsx`.

## III. Module 1 – AI gợi ý đơn hàng

Đây là module bắt buộc phải có.

### 1. AI gợi ý sản phẩm nên bán

AI trả lời câu hỏi: “Hôm nay nên bán gì cho khách hàng này?”.

Ví dụ sản phẩm hoặc combo được đề xuất:

- Gabacitin.
- Bảo Can Linh.
- Combo Q10 và sản phẩm bổ thần kinh.

AI dựa trên:

- Lịch sử mua hàng của khách hàng.
- Chu kỳ mua hàng.
- Mùa vụ.
- Chương trình khuyến mại hiện tại.

### 2. AI dự đoán thời điểm khách sắp hết hàng

Ví dụ:

- Chu kỳ mua thông thường của khách là 2–3 tháng.
- Nhà thuốc Minh Châu nhập hàng ngày 01/01/2026.
- Tại ngày 26/03/2026, AI dự đoán còn khoảng 5 ngày sẽ hết Gabacitin.

Mục tiêu: giúp sale ghé đúng “thời điểm vàng”.

## IV. Module 2 – AI quản lý tuyến bán hàng

### 1. AI đề xuất tuyến ghé tối ưu

Ứng dụng hiển thị từ 5–8 khách hàng nên ghé trong ngày, dựa trên thông tin tuyến bán hàng đã khai báo trong danh mục khách hàng.

Tiêu chí đề xuất gồm:

- Khách sắp hết hàng.
- Khách giảm mua.
- Khách không phát sinh đơn hàng trong 45 ngày.

### 2. AI cảnh báo khách lâu chưa ghé hoặc chưa mua

Ví dụ: cảnh báo khách hàng đã 45 ngày chưa phát sinh đơn hàng.

## V. Module 3 – AI chấm điểm khách hàng

AI tự phân loại khách hàng:

| Nhóm | Ý nghĩa |
|---|---|
| A | Khách VIP, doanh số trung bình năm đạt tối thiểu khoảng 50–100 triệu đồng/tháng |
| B | Khách ổn định, doanh số trung bình năm đạt tối thiểu khoảng 30 triệu đồng/tháng |
| C | Khách có nguy cơ rời bỏ, ví dụ 90 ngày không đặt hàng |

Ứng dụng cần hiển thị:

- Khách có nguy cơ giảm doanh số hoặc dễ bị chuyển nhóm để sale chủ động chăm sóc.
- Khách có khả năng tăng trưởng để sale nhận diện tiềm năng.

Các ngưỡng trên là yêu cầu nghiệp vụ ban đầu và cần được xác nhận lại khi xây dựng quy tắc chấm điểm chính thức.

## VI. Module 4 – AI theo dõi chương trình tích lũy

Ví dụ chương trình:

> Tổng tích lũy trong tháng đối với sản phẩm trọng tâm đạt 10 triệu đồng thì khách hàng được thưởng voucher 500.000 đồng.

### Hiển thị cho sale

Ví dụ khách hàng Nhà thuốc Phúc Khang:

- Đã đạt: 8 triệu đồng.
- Còn thiếu: 2 triệu đồng.
- Sản phẩm đề xuất bán thêm:
  - Gabacitin.
  - Fabonxyl.

### Hiển thị cho quản lý

- Danh sách khách hàng có khả năng đạt thưởng trong tháng.

## VII. Module 5 – “AI Google” cho Sale

Sale có thể hỏi bằng ngôn ngữ tự nhiên.

### Tình huống 1 – Gợi ý theo triệu chứng

Câu hỏi ví dụ:

> Khách ho lâu ngày bán gì?

AI đề xuất các sản phẩm còn tồn kho, ví dụ:

- Dung dịch vệ sinh họng Medsanto.
- Bổ phế thường xuân.
- Vitamin tổng hợp Hàn Quốc hỗ trợ tăng cường sức đề kháng.

Các nội dung liên quan triệu chứng chỉ mang tính hỗ trợ tham khảo, không thay thế chẩn đoán hoặc kê đơn của người có chuyên môn.

### Tình huống 2 – Gợi ý mua thêm để đạt chiết khấu

Câu hỏi ví dụ:

> Khách còn thiếu 1 triệu đồng để được hưởng mức chiết khấu sâu hơn, nên mua thêm sản phẩm gì?

AI đề xuất dựa trên:

- Lịch sử sản phẩm khách đã mua.
- Sản phẩm khách chưa mua nhưng đang bán chạy hoặc có kết quả tốt tại công ty.

Kết quả ví dụ:

- Combo sản phẩm A.
- Sản phẩm B.
- Sản phẩm C.

## VIII. Module 6 – AI đề xuất chương trình khuyến mại cho CEO

AI phân tích:

- Tồn kho.
- Vòng quay hàng hóa.
- Tốc độ bán.
- Hạn sử dụng khi dữ liệu có sẵn.

AI có thể đề xuất:

- Sản phẩm Gabacitin nên chạy combo.
- Muối rửa mũi xoang và Yến không đường nên xả hàng sâu do cận hạn sử dụng.

Các kết quả là đề xuất hỗ trợ quyết định, không tự động áp dụng chiết khấu hoặc tạo chương trình khuyến mại nếu chưa được người có thẩm quyền xác nhận.

## IX. Module 7 – AI nhận diện đơn thuốc từ ảnh

Sale chụp ảnh đơn thuốc, AI hỗ trợ:

- Nhận diện sản phẩm trên đơn.
- Gợi ý sản phẩm thay thế thuộc danh mục của công ty.
- Cảnh báo và gợi ý sản phẩm bán chéo.

Ví dụ:

> Khách mua kháng sinh thì AI gợi ý cân nhắc bán thêm men vi sinh.

Tính năng phải có cảnh báo an toàn và không thay thế tư vấn của bác sĩ/dược sĩ có chuyên môn.

## X. Module 8 – AI hiển thị catalogue sản phẩm

AI hỗ trợ lọc và hiển thị:

- Công dụng chính của sản phẩm.
- Giá bán.
- Chương trình bán hàng đang áp dụng.
- Ảnh và nội dung catalogue sản phẩm.

## XI. Module 9 – AI thông báo chương trình bán hàng

AI thông báo:

- Chương trình bán hàng trong tháng.
- Chương trình phát sinh theo sự vụ.

Quản trị viên có thể đưa vào hệ thống:

- Ảnh.
- File PDF.
- Nội dung/câu lệnh thông báo.
- Thời gian áp dụng từ ngày đến ngày.

Nội dung được lưu trong kho dữ liệu hoặc ngân hàng nội dung để AI tra cứu và thông báo đúng thời gian hiệu lực.

## XII. Dữ liệu Medstand cần chuẩn bị

### 1. Dữ liệu khách hàng

Hiện danh mục khách hàng đã có các trường:

- Tên khách hàng.
- Địa chỉ.
- Kênh bán.
- Phân loại nhóm khách hàng.

### 2. Dữ liệu bán hàng tối thiểu 6–12 tháng

- Ngày bán.
- Sản phẩm.
- Số lượng.
- Giá trị bán hàng.

### 3. Dữ liệu tuyến sale

- Sale phụ trách.
- Tuyến bán hàng.
- Tần suất ghé.

### 4. Dữ liệu chương trình khuyến mại

- Mức chiết khấu.
- Thưởng tích lũy.
- Điều kiện và nội dung chương trình.
- Thời gian áp dụng.

Nội dung chương trình cần được khai báo/cập nhật hàng tháng và khi có chương trình phát sinh.

## XIII. Lộ trình triển khai đề xuất

### Giai đoạn 1 – 1 đến 2 tháng

- AI gợi ý đơn hàng.
- Nhắc chăm sóc khách hàng.
- Cảnh báo khách giảm mua.

### Giai đoạn 2 – 2 đến 4 tháng

- AI chấm điểm khách hàng.

### Giai đoạn 3 – 4 đến 6 tháng

- Dự báo doanh số.
- Tối ưu chương trình khuyến mại.

## XIV. Các nội dung cần xác nhận thêm

- Công thức và ngưỡng chính thức để phân loại khách hàng A/B/C.
- Định nghĩa “khách giảm mua”, “lâu chưa ghé” và “sắp hết hàng”.
- Nguồn dữ liệu tồn kho chính thức và phạm vi từng kho theo user.
- Quy tắc xác định chương trình tích lũy, thưởng và chiết khấu còn hiệu lực.
- Cách phê duyệt đề xuất khuyến mại trước khi áp dụng.
- Danh mục hành động AI được phép thực hiện và hành động chỉ được phép đề xuất.
- Quy trình kiểm duyệt nội dung y tế và cảnh báo an toàn.
- Quy trình cập nhật ảnh, PDF, catalogue và chương trình bán hàng.

## XV. Phân tích yêu cầu

### 1. Bản chất sản phẩm cần xây dựng

Đây không chỉ là chatbot tra cứu dữ liệu. Khách hàng đang yêu cầu một **trợ lý bán hàng có ngữ cảnh**, kết hợp bốn lớp năng lực:

1. **Tra cứu:** sản phẩm, catalogue, tồn kho, khách hàng, hóa đơn và chương trình bán hàng.
2. **Phân tích:** lịch sử mua, chu kỳ mua, giảm mua, tồn kho, vòng quay và tiến độ tích lũy.
3. **Đề xuất:** sản phẩm nên bán, khách nên ghé, sản phẩm bán thêm và chương trình khuyến mại.
4. **Cảnh báo:** sắp hết hàng, lâu chưa mua, nguy cơ giảm doanh số, cận hạn và rủi ro an toàn y tế.

Vì vậy, kết quả AI phải luôn đi kèm dữ liệu nguồn, phạm vi người dùng và thời điểm dữ liệu; không nên chỉ trả một câu trả lời tự do không kiểm chứng.

### 2. Phạm vi chức năng theo mức ưu tiên

| Mức | Phạm vi | Lý do |
|---|---|---|
| P0 – bắt buộc | Gợi ý đơn hàng, lịch sử mua, chu kỳ mua, cảnh báo khách giảm mua/lâu chưa phát sinh | Đây là giá trị trực tiếp cho TDV và là module khách hàng yêu cầu bắt buộc |
| P1 – nền tảng | Tồn kho theo quyền, dữ liệu khách hàng, tuyến sale, chương trình bán hàng, audit và giải thích kết quả | Không có các dữ liệu này thì đề xuất không đáng tin và có nguy cơ lộ dữ liệu |
| P2 | Chấm điểm A/B/C, theo dõi tích lũy và danh sách khách có khả năng đạt thưởng | Cần chốt công thức, ngưỡng và dữ liệu chương trình trước |
| P3 | Hỏi đáp bán hàng, catalogue có ảnh, thông báo chương trình | Có thể triển khai sau khi kho dữ liệu và metadata ổn định |
| P4 – cần kiểm duyệt riêng | Nhận diện đơn thuốc, thay thế thuốc và bán chéo theo triệu chứng | Liên quan an toàn y tế; cần quy trình kiểm duyệt chuyên môn trước UAT |
| P5 | Dự báo doanh số và AI đề xuất chương trình cho CEO | Cần dữ liệu lịch sử đủ dài, chất lượng và cơ chế phê duyệt quyết định |

### 3. Phân rã thành các capability dùng chung

Các module không nên phát triển thành các luồng độc lập hoàn toàn. Cần một nền tảng dùng chung gồm:

- **Identity và phân quyền:** xác định TDV/Manager/CEO, nhân viên phụ trách, chi nhánh và kho được xem.
- **Customer context:** chọn khách hàng, giữ đúng khách trong phiên, kiểm tra khách thuộc scope.
- **Product catalog:** mã, tên, nhóm, công dụng, đơn vị, giá, ảnh, tồn kho và hạn dùng.
- **Sales facts:** hóa đơn/đơn hàng, ngày bán, sản phẩm, số lượng, doanh số, lần mua cuối.
- **Promotion facts:** điều kiện, mốc tích lũy, chiết khấu, phần thưởng, hiệu lực từ ngày đến ngày.
- **Recommendation engine:** quy tắc xếp hạng, giải thích lý do, ngưỡng tin cậy và trạng thái không đủ dữ liệu.
- **Audit và freshness:** request ID, thời gian truy vấn, nguồn dữ liệu, phiên bản chương trình và người thực hiện.

### 4. Quy tắc nghiệp vụ cần chốt trước khi code

Các ví dụ trong yêu cầu hiện mới là định hướng, chưa phải contract có thể lập trình ngay:

- “Sắp hết hàng” cần định nghĩa bằng tồn kho, tốc độ bán và chu kỳ mua; không thể chỉ suy ra từ ngày nhập.
- “Giảm mua” cần có baseline, ví dụ so sánh 45 ngày gần nhất với trung bình 3–6 tháng trước.
- “Lâu chưa phát sinh” cần phân biệt chưa mua, chưa ghé và không thuộc tuyến đang phụ trách.
- Ngưỡng A/B/C cần chốt đơn vị tiền, khoảng thời gian, điều kiện tối thiểu và cách xử lý khách mới.
- “Sản phẩm bán chạy” phải có phạm vi (toàn công ty/chi nhánh/kênh), khoảng thời gian và cách loại sản phẩm hết hàng.
- Chương trình tích lũy phải chốt cách tính trả hàng, đơn hủy, VAT, nhiều kho và chương trình chồng lấn.
- Đề xuất khuyến mại chỉ là recommendation; việc áp dụng phải qua người có thẩm quyền.

### 5. Dữ liệu và độ sẵn sàng

| Nhóm dữ liệu | Tối thiểu cần có | Rủi ro nếu thiếu |
|---|---|---|
| Khách hàng | Mã duy nhất, tên, tuyến, người phụ trách, nhóm, trạng thái hoạt động | Gợi ý sai khách hoặc lộ dữ liệu ngoài scope |
| Bán hàng | 6–12 tháng, hóa đơn hợp lệ, dòng sản phẩm, số lượng, giá trị, ngày bán | Không tính được chu kỳ, xu hướng và điểm khách hàng |
| Tồn kho | Theo kho, thời điểm cập nhật, đơn vị, hàng khóa/hết hạn | Gợi ý sản phẩm không thể bán |
| Sản phẩm | Mã ổn định, tên, nhóm, công dụng, đơn vị, giá, catalogue | Không giải thích được kết quả |
| Chương trình | Điều kiện, mốc, thưởng/chiết khấu, hiệu lực, sản phẩm áp dụng | Tính sai tích lũy và đề xuất sai |
| Tuyến | Sale phụ trách, thứ tự tuyến, tần suất, ngày ghé gần nhất | Không tối ưu được lịch ghé |

### 6. MVP đề xuất cho giai đoạn 1

MVP nên giới hạn ở các luồng đọc và cảnh báo có thể kiểm chứng:

1. Chọn khách hàng trong phạm vi được phân quyền.
2. Xem tóm tắt lịch sử mua và lần mua cuối.
3. Gợi ý tối đa 5–10 sản phẩm dựa trên lịch sử, chu kỳ, tồn kho và chương trình đang hiệu lực.
4. Hiển thị lý do cho từng gợi ý và trạng thái `không đủ dữ liệu` nếu không thể tính.
5. Cảnh báo khách không phát sinh đơn trong 45 ngày theo cấu hình được duyệt.
6. Đề xuất 5–8 khách nên ghé trong ngày, có thể mở chi tiết để kiểm tra.
7. Không tự động tạo đơn, thay đổi giá, áp dụng chiết khấu hoặc gửi thông báo diện rộng.

### 7. Tiêu chí nghiệm thu cấp nghiệp vụ

- TDV chỉ xem được khách hàng, tồn kho và doanh số thuộc phạm vi phiên đăng nhập.
- Mỗi gợi ý hiển thị được sản phẩm, dữ liệu dùng để tính, thời điểm cập nhật và lý do xếp hạng.
- Khi không có dữ liệu, hệ thống phân biệt được “không có dữ liệu”, “không có quyền” và “lỗi hệ thống”.
- Kết quả không được tự biến thành đơn hàng hoặc chương trình khuyến mại.
- Các ngưỡng 45 ngày, 90 ngày, 50–100 triệu và 30 triệu phải lấy từ cấu hình đã phê duyệt, không hardcode trong prompt.
- Có thể truy vết request, API, user, customer, thời điểm và phiên bản dữ liệu để đối chiếu.

### 8. Các điểm cần khách hàng xác nhận trong buổi phân tích

1. Danh sách kho và quy tắc phân quyền cụ thể cho từng vai trò.
2. Công thức chính thức cho “sắp hết hàng”, “giảm mua”, A/B/C và “khả năng đạt thưởng”.
3. Sản phẩm nào được phép dùng trong gợi ý triệu chứng/bán chéo và ai duyệt nội dung.
4. Nguồn giá bán, tồn kho và chương trình nào là nguồn chính thức khi dữ liệu mâu thuẫn.
5. Các hành động AI được phép thực hiện ngay và các hành động bắt buộc người dùng xác nhận.
6. Bộ tài khoản, dữ liệu và kịch bản UAT cho TDV, Manager và CEO.

### 9. Kết luận phân tích

Yêu cầu có giá trị kinh doanh rõ, nhưng phần khó nhất không nằm ở giao diện chat mà ở **chất lượng dữ liệu, phân quyền, công thức tính và khả năng giải thích**. Nên chốt contract dữ liệu và quy tắc nghiệp vụ cho MVP giai đoạn 1 trước; các tính năng y tế từ ảnh và tối ưu khuyến mại nên đi qua một cổng kiểm duyệt riêng, không gộp vào luồng bán hàng cơ bản.
