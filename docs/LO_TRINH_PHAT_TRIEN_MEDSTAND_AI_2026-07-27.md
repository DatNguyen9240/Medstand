# Lộ trình phát triển Medstand AI

**Ngày cập nhật:** 27/07/2026  
**Phạm vi:** Bản giới thiệu định hướng sau khi bàn giao hệ thống cho khách hàng trải nghiệm sơ bộ.  
**Trạng thái hiện tại:** `CUSTOMER_PREVIEW_AND_UAT` — hệ thống đang ở giai đoạn Pilot/UAT và sẽ tiếp tục được hoàn thiện dựa trên kết quả kiểm thử thực tế.

---

## 1. Mục tiêu triển khai

Medstand AI được phát triển nhằm hỗ trợ đội ngũ bán hàng và quản lý:

- Tăng doanh số trên từng điểm bán.
- Tăng hiệu suất làm việc của trình dược viên.
- Cảnh báo tồn kho theo đúng kho và phạm vi được phân quyền.
- Hỗ trợ quản lý tuyến và ưu tiên khách hàng cần chăm sóc.
- Theo dõi chương trình tích lũy, thưởng và chiết khấu.
- Hỗ trợ tra cứu sản phẩm, chương trình bán hàng và đề xuất bán thêm.
- Từng bước bổ sung khả năng dự báo dựa trên dữ liệu bán hàng thực tế.

## 2. Hệ thống khách hàng có thể trải nghiệm ở bản hiện tại

| Nhóm chức năng | Khả năng hiện tại | Trạng thái |
|---|---|---|
| Gợi ý đơn hàng | Phân tích lịch sử mua, chu kỳ mua, mùa vụ, sản phẩm trọng tâm và khuyến mãi | Có bản Pilot, tiếp tục đối soát kết quả |
| Dự kiến thời điểm mua lại | Ước tính chu kỳ và số ngày còn lại dựa trên lịch sử giao dịch | Có bản rule-based, chưa phải mô hình ML |
| Khách hàng nên ghé | Xếp hạng 5–8 khách cần ưu tiên theo tuyến và tình trạng mua hàng | Có bản Pilot |
| Khách lâu chưa mua | Cảnh báo khách 45 ngày hoặc 90 ngày không phát sinh đơn | Có bản Pilot |
| Chấm điểm khách hàng | Phân nhóm A/B/C, theo dõi xu hướng và nguy cơ giảm mua | Có, công thức cần khách hàng xác nhận |
| Tích lũy và upsell | Hiển thị số đã đạt, mốc tiếp theo, số còn thiếu và sản phẩm đề xuất | Có bản Pilot |
| Tồn kho | Tra cứu tồn theo phạm vi kho được cấp cho tài khoản | Có logic phân quyền, tiếp tục kiểm tra dữ liệu từng kho |
| Tra cứu sản phẩm | Tra cứu tên, mã, giá, công dụng và dữ liệu catalog đã được nạp | Có một phần |
| Đề xuất khuyến mãi | Phân tích tồn, tốc độ bán và hàng cận date để quản lý tham khảo | Có một phần, cần người có thẩm quyền phê duyệt |
| Tạo khách hàng và đơn hàng | Có màn hình nghiệp vụ; luồng hội thoại tự nhiên đang tiếp tục hoàn thiện | Có một phần |

> Các kết quả gợi ý hiện tại chủ yếu được tạo bằng dữ liệu ERP và business rule. Kết quả cần được người dùng kiểm tra trước khi áp dụng vào hoạt động bán hàng thực tế.

## 3. Nguyên tắc triển khai

- Bản ngày 27/07/2026 được cung cấp để khách hàng xem sơ bộ và thực hiện UAT.
- Phản hồi của sale, manager và bộ phận nghiệp vụ sẽ được dùng để điều chỉnh công thức.
- Chỉ dữ liệu trong phạm vi tài khoản được phân quyền mới được hiển thị.
- Những thao tác ghi dữ liệu cần có bước kiểm tra và xác nhận của người dùng.
- Đề xuất y khoa hoặc sản phẩm thay thế chỉ mang tính tham khảo, không thay thế người có chuyên môn.
- Chỉ công bố production-ready sau khi hoàn tất kiểm thử runtime, ký duyệt nghiệp vụ, bảo mật và vận hành.

## 4. Lộ trình triển khai đề xuất

### Giai đoạn 0 — Ổn định bản UAT

**Thời gian dự kiến:** 28/07–10/08/2026  
**Mục tiêu:** Tạo một bản UAT ổn định để khách hàng kiểm thử có kiểm soát.

Công việc chính:

- Đồng bộ frontend, SQL và workflow AI mới nhất lên môi trường UAT.
- Kiểm thử lại toàn bộ 13 tài khoản theo vai trò và khu vực.
- Xác minh phân quyền khách hàng, chi nhánh và kho CTY/DL02/DL03.
- Kiểm thử các luồng gợi ý đơn, tuyến, giảm mua, chấm điểm, tích lũy, tồn kho, sản phẩm, tạo khách và tạo đơn.
- Xử lý lỗi tải chậm, timeout, kết quả trùng hoặc không đồng nhất.
- Chuẩn hóa bộ dữ liệu và câu hỏi mẫu cho từng nhóm tài khoản.
- Phát hành báo cáo kiểm thử mới thay cho các báo cáo cũ.

Điều kiện hoàn thành:

- 13/13 tài khoản đăng nhập và truy cập đúng phạm vi.
- Không còn lỗi hệ thống nghiêm trọng trên các luồng bắt buộc.
- Tỷ lệ đạt của bộ test chính tối thiểu 95%.
- Truy vấn thông thường hướng tới dưới 3 giây; truy vấn AI phức tạp hướng tới dưới 6 giây.

### Giai đoạn 1 — Hoàn thiện nghiệp vụ bán hàng cốt lõi

**Thời gian dự kiến:** 11/08–15/09/2026  
**Mục tiêu:** Hoàn thiện hành trình từ câu hỏi của sale đến hành động nghiệp vụ.

Công việc chính:

- Hoàn thiện chat tự nhiên cho tạo khách hàng và lập đơn hàng.
- AI hỏi bổ sung trường còn thiếu, hiển thị bản xem trước và chỉ ghi dữ liệu sau khi người dùng xác nhận.
- Kiểm tra khách hàng, mã sản phẩm, tồn kho, bảng giá và CTBH trước khi lập đơn.
- Chống tạo trùng và ghi nhật ký thao tác.
- Chốt công thức phân nhóm A/B/C với khách hàng.
- Bổ sung lý do gợi ý, lần mua cuối, chu kỳ và thời điểm dự kiến mua lại.
- Cho phép đưa sản phẩm được gợi ý vào giỏ hàng nhanh chóng.

Điều kiện hoàn thành:

- Sale có thể đi từ câu hỏi → gợi ý → xem trước → xác nhận → nhận mã kết quả.
- Mỗi đề xuất có lý do và dữ liệu tham chiếu rõ ràng.
- Không ghi dữ liệu thật nếu người dùng chưa xác nhận.

### Giai đoạn 2 — Catalog và chương trình bán hàng

**Thời gian dự kiến:** 16/09–31/10/2026  
**Mục tiêu:** Hoàn thiện công cụ tra cứu sản phẩm và CTBH tập trung.

Công việc chính:

- Hiển thị ảnh, mã, tên, công dụng, thành phần và cách dùng của sản phẩm.
- Hiển thị giá đúng theo bảng giá và tồn kho theo phạm vi tài khoản.
- Ghép CTBH đang hiệu lực vào cùng kết quả sản phẩm.
- Cho phép admin tải lên Excel, PDF hoặc ảnh.
- Bổ sung thời gian áp dụng từ ngày–đến ngày, phạm vi chi nhánh và nhóm người nhận.
- Bắt buộc xem trước và phê duyệt nội dung OCR trước khi sử dụng.
- Tự ẩn hoặc thu hồi nội dung hết hiệu lực.

Điều kiện hoàn thành:

- Một kết quả tra cứu có thể trả về ảnh + giá + tồn + CTBH.
- CTBH hết hạn không còn được gợi ý.
- Nội dung tải lên có nguồn, ngày cập nhật và người phê duyệt.

### Giai đoạn 3 — Tối ưu tuyến và quản lý sale

**Thời gian dự kiến:** 01/11–15/12/2026  
**Mục tiêu:** Chuyển từ danh sách ưu tiên sang kế hoạch ghé khách thực tế.

Công việc chính:

- Sắp xếp khách hàng theo vị trí, quãng đường và thời gian di chuyển.
- Kết hợp khách sắp hết hàng, khách giảm mua, khách gần đạt thưởng và giá trị đơn tiềm năng.
- Cho phép sale ghi nhận đã ghé, không gặp, hẹn lại hoặc đã phát sinh đơn.
- Cung cấp báo cáo hiệu quả tuyến và tỷ lệ chuyển đổi cho quản lý.

Điều kiện hoàn thành:

- Danh sách khách nên ghé có thứ tự di chuyển hợp lý.
- Đo được số lượt ghé, số đơn và doanh số phát sinh sau gợi ý.

### Giai đoạn 4 — Nhận diện đơn thuốc từ ảnh

**Thời gian dự kiến:** 16/12/2026–15/01/2027  
**Mục tiêu:** Xây dựng luồng riêng cho ảnh đơn thuốc, không dùng nhầm luồng OCR catalog.

Công việc chính:

- Sale chụp hoặc tải ảnh đơn thuốc.
- OCR trích xuất tên thuốc, hàm lượng và số lượng.
- Người dùng kiểm tra và sửa nội dung nhận diện trước khi tiếp tục.
- Đối chiếu danh mục Medstand để tìm sản phẩm liên quan hoặc bán kèm.
- Kiểm tra tồn kho, giá và CTBH trước khi đưa sản phẩm vào giỏ hàng.
- Cảnh báo kết quả có độ tin cậy thấp và kiểm soát thời gian lưu ảnh.

Điều kiện hoàn thành:

- Không tự xem kết quả OCR là chính xác tuyệt đối.
- Không tự kê đơn hoặc tự quyết định thay thế thuốc.
- Danh sách thay thế phải được người có chuyên môn phê duyệt.

### Giai đoạn 5 — Dự báo và tối ưu CTKM

**Thời gian dự kiến:** Từ 16/01/2027  
**Mục tiêu:** Chuyển dần từ rule hiện tại sang dự báo có đo lường.

Công việc chính:

- Dự báo doanh số theo sản phẩm, sale và chi nhánh.
- Dự báo khả năng khách mua trong 7/14/30 ngày.
- Dự báo nguy cơ thiếu hoặc dư tồn kho.
- Đánh giá hiệu quả của từng CTKM.
- Mô phỏng chi phí và doanh số dự kiến trước khi chạy CTKM.
- Theo dõi kết quả thực tế so với dự báo và vận hành thử ở chế độ shadow mode.

Điều kiện dữ liệu:

- Có tối thiểu 6–12 tháng dữ liệu bán hàng đã được làm sạch.
- Có dữ liệu trả hàng, đơn hủy, giá, CTKM và tồn kho theo thời gian.
- Có thông tin tuyến và nhân viên phụ trách.
- Sản phẩm mới được đánh dấu riêng để tránh dự báo sai do thiếu lịch sử.

## 5. Thứ tự ưu tiên

### P0 — Trước và trong vòng UAT đầu tiên

- Deploy đồng bộ và kiểm thử lại 13 tài khoản.
- Xác minh phân quyền khách hàng, chi nhánh và kho.
- Kiểm tra lại các API bắt buộc và phát hành báo cáo runtime mới.
- Hoàn thiện dữ liệu mẫu, tài liệu hướng dẫn và quy trình tiếp nhận lỗi.

### P1 — Sau khi nhận phản hồi UAT

- Chat tự nhiên tạo khách và tạo đơn có bước xác nhận.
- Chốt công thức A/B/C.
- Kiểm tra tồn thật khi tư vấn sản phẩm.
- Catalog có ảnh + giá + tồn + CTBH.
- CTBH có từ ngày–đến ngày và phân quyền người nhận.

### P2 — Phát triển nâng cao

- Tối ưu tuyến theo bản đồ.
- Nhận diện đơn thuốc từ ảnh.
- Dự báo doanh số và mua lại.
- Đo hiệu quả gợi ý và CTKM.

## 6. Chỉ số đánh giá hiệu quả

Các chỉ số nên được theo dõi sau khi có đủ dữ liệu UAT:

- Tỷ lệ gợi ý được sale sử dụng.
- Tỷ lệ gợi ý chuyển thành đơn hàng.
- Doanh số trung bình trên mỗi điểm bán.
- Số khách quay lại sau cảnh báo giảm mua.
- Tỷ lệ khách đạt mốc tích lũy.
- Giá trị upsell trung bình.
- Số ngày tồn kho trung bình và tỷ lệ hàng cận date.
- Thời gian sale chuẩn bị một đơn hàng.
- Độ chính xác của dự đoán ngày mua lại.
- Thời gian phản hồi API theo p50 và p95.

## 7. Phối hợp với khách hàng trong giai đoạn Pilot

Khách hàng hỗ trợ:

- Thử nghiệm theo bộ tài khoản và kịch bản UAT đã cung cấp.
- Xác nhận công thức chấm điểm, tích lũy, khách giảm mua và sản phẩm trọng tâm.
- Cung cấp hoặc xác nhận catalog, CTBH và dữ liệu tuyến.
- Gửi phản hồi kèm tài khoản, câu hỏi, thời gian, kết quả mong đợi và ảnh màn hình.

Đội triển khai Medstand thực hiện:

- Phân loại lỗi theo mức độ ảnh hưởng.
- Đối soát source, runtime và dữ liệu trước khi kết luận nguyên nhân.
- Cập nhật tiến độ và kết quả khắc phục theo từng vòng UAT.
- Chỉ công bố chức năng hoàn tất khi có đủ bằng chứng kiểm thử và xác nhận nghiệp vụ.

## 8. Thông điệp bàn giao bản sơ bộ

> Bản Medstand AI được cung cấp ngày 27/07/2026 nhằm giúp khách hàng trải nghiệm sớm các luồng nghiệp vụ cốt lõi và đóng góp phản hồi. Đây là bản Pilot/UAT, chưa phải bản hoàn thiện cuối cùng. Các chức năng, công thức và dữ liệu hiển thị sẽ tiếp tục được đối soát và nâng cấp theo lộ trình, dựa trên kết quả kiểm thử thực tế và xác nhận của khách hàng.

