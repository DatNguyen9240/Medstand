# BÁO CÁO KIỂM THỬ TOÀN HỆ THỐNG MEDSTAND

**Ngày kiểm thử:** 14/07/2026  
**Môi trường:** `http://localhost:3000`  
**Chế độ thực hiện:** REVIEW/UAT, chỉ đọc và thao tác an toàn  
**Phiên đăng nhập quan sát được:** Trần Văn Hướng - Quản lý  
**Phạm vi:** build, kiểm tra hồi quy, 28 route có xác thực, đăng nhập/quên mật khẩu, chatbot và xử lý lỗi hiển thị.

## 1. Kết luận

**Chưa đủ điều kiện ký duyệt UAT toàn hệ thống.**

Phần frontend build thành công, kiểm tra cú pháp và test biểu đồ tuần đều đạt. Phần lớn route dựng được khung giao diện. Tuy nhiên API thật đang trả HTTP 500 hoặc timeout trên nhiều chức năng, nên chưa thể xác minh dữ liệu, phân quyền Manager/TDV và các luồng tạo/sửa/xóa. Ngoài blocker tích hợp, vòng kiểm thử trình duyệt và rà soát source xác nhận 10 vấn đề frontend/security, nghiêm trọng nhất là khóa quản trị RAG nằm trong mã phía trình duyệt, route quản trị thiếu role guard, dữ liệu mẫu/khảo sát giả và các chuỗi giao diện bị hỏng mã hóa.

Không có dữ liệu thật nào được tạo, sửa hoặc xóa trong lần kiểm thử này.

## 2. Tóm tắt kết quả

| Hạng mục | Kết quả | Ghi chú |
|---|---|---|
| Kiểm tra cú pháp JavaScript nguồn | PASS | Không phát hiện lỗi cú pháp |
| Build frontend | PASS | `npm.cmd run build`, bundle v11.35 |
| Test hồi quy biểu đồ tuần | PASS | `npm.cmd run test:weekly-chart` |
| Đăng nhập - kiểm tra bỏ trống | PASS | Hiển thị cảnh báo tiếng Việt rõ ràng |
| Quên mật khẩu - kiểm tra bỏ trống | PASS | Hiển thị `Vui lòng nhập tên đăng nhập.` |
| Khởi tạo 28 route có xác thực | PARTIAL | Phần lớn dựng được khung; dữ liệu thật bị API 500/timeout |
| Chatbot gửi `Xin chào` | BLOCKED | Có fallback an toàn, nhưng backend/n8n không phản hồi |
| Phân quyền Manager/TDV | NOT RUN | Chỉ có một phiên Manager, không có mật khẩu TDV |
| Luồng tạo/sửa/xóa/nộp dữ liệu | NOT RUN | Cố ý không làm thay đổi dữ liệu thật |

## 3. Lỗi đã xác nhận

### UAT-20260714-01 - Danh sách sản phẩm trả thiếu script và hiển thị dữ liệu mẫu

- **Mức độ:** Major
- **Cách mở:** `#/return-product-list`
- **Thực tế:** Giao diện hiển thị mẫu `DD001 - Paracetamol 500mg`, giá 45.000, số lượng 2, tổng 90.000; sau đó báo `Lỗi tải script: return-product-list.js`.
- **Bằng chứng kỹ thuật:** Router tham chiếu `src/js/pages/return-product-list.js`, nhưng file không tồn tại; bundle tương ứng cũng không tồn tại.
- **Ảnh hưởng:** Người dùng có thể hiểu nhầm dữ liệu mẫu là dữ liệu thật; chức năng không có logic tải API.
- **Kỳ vọng:** Chỉ hiển thị dữ liệu API thật hoặc trạng thái rỗng/lỗi; không còn dữ liệu mẫu.

### UAT-20260714-02 - Route khảo sát cũ dùng câu hỏi cố định và báo thành công giả

- **Mức độ:** Critical/Major
- **Cách mở:** `#/survey-question`
- **Thực tế:** Không cần mã khảo sát vẫn hiện hai câu hỏi cố định và nút `Gửi khảo sát`.
- **Bằng chứng kỹ thuật:** `src/templates/survey-question.html` chứa trực tiếp nội dung câu hỏi và gọi thông báo thành công; `src/js/pages/survey-question.js` chỉ đổi lựa chọn, không gọi API.
- **Ảnh hưởng:** Có nguy cơ thông báo đã gửi dù dữ liệu không được lưu.
- **Kỳ vọng:** Bỏ route legacy hoặc nối hoàn toàn vào luồng khảo sát/API thật trong `#/survey?mode=...&id=...`.

### UAT-20260714-03 - Màn hình Tuyến giữ trạng thái tải quá lâu khi API lỗi

- **Mức độ:** Major
- **Cách mở:** `#/routes`
- **Thực tế:** Sau hơn 16 giây vẫn hiển thị `Đang tải...`; console ghi nhận HTTP 500. Mã nguồn có trạng thái lỗi trong `catch`, nhưng HTTP client dùng timeout 60 giây và tối đa 3 lần thử nên người dùng có thể phải chờ khoảng 183 giây trước khi thấy lỗi.
- **Ảnh hưởng:** Người dùng không biết đã hết dữ liệu, mất mạng hay hệ thống bị lỗi.
- **Kỳ vọng:** Dừng loading và hiện thông báo lỗi/có nút thử lại sau timeout hợp lý.

### UAT-20260714-04 - Màn hình Khảo sát giữ skeleton/trống quá lâu khi API lỗi

- **Mức độ:** Major
- **Cách mở:** `#/survey`
- **Thực tế:** Trong thời gian quan sát chỉ còn tiêu đề `Khảo sát`, chưa có empty state hoặc thông báo lỗi; console ghi nhận HTTP 500. Mã nguồn có `showError`, nhưng chỉ chạy sau khi chuỗi timeout/retry kết thúc.
- **Ảnh hưởng:** Người dùng thấy màn hình trống và không biết cần làm gì.
- **Kỳ vọng:** Hiển thị trạng thái lỗi rõ ràng và nút thử lại.

### UAT-20260714-05 - API thật/n8n không sẵn sàng

- **Mức độ:** Blocker tích hợp
- **Phạm vi quan sát:** Trang chủ, Đơn hàng, Tuyến, Khảo sát, Chatbot và một số danh sách.
- **Thực tế:** Nhiều request trả HTTP 500 hoặc timeout. Đơn hàng cuối cùng hiện `Không tải được dữ liệu`; chatbot hiện `Xin lỗi, tôi không thể phản hồi lúc này. Vui lòng thử lại sau.`
- **Ảnh hưởng:** Không thể xác minh tính đúng của dữ liệu, biểu đồ, KPI, tìm kiếm, lọc, phân quyền và nghiệp vụ ghi dữ liệu.
- **Ghi chú:** Fallback của Đơn hàng và Chatbot hoạt động đúng; lỗi gốc nằm ở kết nối backend/tích hợp tại thời điểm kiểm thử.

### UAT-20260714-06 - Khóa quản trị RAG xuất hiện trong mã JavaScript phía trình duyệt

- **Mức độ:** Critical - Security
- **Bằng chứng kỹ thuật:** `src/js/pages/rag-admin.js` gửi một giá trị `x-admin-key` cố định ngay trong source frontend.
- **Ảnh hưởng:** Bất kỳ người dùng nào tải bundle cũng có thể xem và sao chép khóa. Việc đổi tên/thu nhỏ bundle không bảo vệ được bí mật.
- **Kỳ vọng:** Không lưu khóa quản trị ở frontend. Backend phải xác thực bằng phiên người dùng và kiểm tra quyền server-side; khóa hiện tại cần được thu hồi/rotate.
- **Lưu ý:** Báo cáo cố ý không ghi lại giá trị khóa.

### UAT-20260714-07 - Route RAG chỉ kiểm tra đăng nhập, chưa kiểm tra vai trò

- **Mức độ:** Critical/Major - Authorization
- **Bằng chứng kỹ thuật:** Router khai báo `rag-admin` với `auth: true` như route thường, không có role guard. Menu chỉ ẩn liên kết bằng dữ liệu `localStorage`; logic còn coi tên hiển thị/tên đăng nhập chứa chữ `admin` là quản trị viên.
- **Thực tế:** Điều hướng trực tiếp tới `#/rag-admin` vẫn dựng được form upload trong phiên đã đăng nhập.
- **Ảnh hưởng:** Ẩn menu không phải là kiểm soát truy cập. Nếu backend cũng tin dữ liệu client hoặc khóa tĩnh, người không có quyền có thể tiếp cận chức năng quản trị.
- **Kỳ vọng:** Route guard theo role để bảo vệ UX và kiểm tra quyền bắt buộc ở backend cho mọi request.

### UAT-20260714-08 - Màn hình Đổi mật khẩu có chuỗi tiếng Việt bị hỏng mã hóa

- **Mức độ:** Major - UI/Localization
- **Cách mở:** `#/change-password`, kích hoạt validation hoặc hộp xác nhận.
- **Bằng chứng kỹ thuật:** `src/js/pages/change-password.js` chứa trực tiếp các chuỗi dạng `nh?p m?t kh?u`, `Ð?i m?t kh?u`, `C?P NH?T`.
- **Ảnh hưởng:** Cảnh báo, nút và hộp xác nhận khó đọc; làm giảm độ tin cậy ở một chức năng nhạy cảm.
- **Kỳ vọng:** Toàn bộ source và bundle dùng UTF-8 thống nhất, có test kiểm tra chuỗi mojibake.

### UAT-20260714-09 - Chatbot còn nhiều chuỗi/ký tự giao diện bị hỏng mã hóa

- **Mức độ:** Major - UI/Functional
- **Bằng chứng kỹ thuật:** `chatbot-widget/js/chatbot.js` còn nhiều chuỗi hiển thị bị mất ký tự, ví dụ thông báo upload/RAG, loading, nhãn Đơn hàng và các biểu tượng.
- **Ảnh hưởng:** Một số nhãn, thông báo lỗi và ký tự tìm kiếm bỏ dấu có thể hiển thị sai hoặc hoạt động không chính xác.
- **Kỳ vọng:** Chuẩn hóa UTF-8 và bổ sung regression test cho các chuỗi tiếng Việt quan trọng.

### UAT-20260714-10 - Tạo đơn hàng tự gán phạm vi `ADMIN` khi thiếu mã nhân viên/quản lý

- **Mức độ:** Major - Data integrity/Authorization risk
- **Bằng chứng kỹ thuật:** `src/js/pages/create-order.js` dùng fallback `ADMIN` cho `ManagerID`, `EmployeeID`, `SYSManagerID` và `SYSEmployeeID`.
- **Ảnh hưởng:** Tài khoản có metadata thiếu có thể tạo payload sai phạm vi hoặc gắn đơn vào đối tượng quản trị. Chưa thực hiện submit nên chưa xác nhận hành vi backend.
- **Kỳ vọng:** Chặn tạo đơn và yêu cầu cấu hình tài khoản hợp lệ; backend không được tin phạm vi gửi từ frontend.

### UAT-20260714-11 - Bộ test hồi quy chứa mật khẩu dùng chung trong source

- **Mức độ:** Major - Security hygiene
- **Bằng chứng kỹ thuật:** `scripts/regression/test_runner.js` tự đăng nhập nhiều tài khoản UAT bằng một mật khẩu cố định được viết trong mã.
- **Ảnh hưởng:** Rò rỉ repository có thể làm lộ thông tin truy cập môi trường UAT; đồng thời test có nguy cơ chạy nhầm vào server thật.
- **Kỳ vọng:** Đọc credential từ secret store/biến môi trường, dùng tài khoản test riêng và không commit mật khẩu.

## 4. Ma trận chức năng và cách hiển thị

| Route/chức năng | Cách mở hoặc thao tác | Nội dung quan sát được | Kết quả |
|---|---|---|---|
| `#/home` | Mở Trang chủ | Dashboard Manager, KPI, biểu đồ, top nhân viên | BLOCKED: khung đạt, số liệu còn `--` do timeout |
| `#/notifications` | Mở thông báo | `Xem thông báo`, `Không có thông báo` | PASS hiển thị; chưa xác minh dữ liệu |
| `#/chatbot` | Mở Trợ lý AI, nhập `Xin chào` | Header, gợi ý nhanh, composer; nhận fallback | BLOCKED backend, PASS fallback |
| `#/routes` | Mở Tuyến | Ngày, nhân viên, chi nhánh, List/Map | FAIL: loading không kết thúc |
| `#/orders` | Mở Đơn hàng | Sau chờ hiện `Không tải được dữ liệu` | BLOCKED backend, PASS fallback |
| `#/account` | Mở Tài khoản | Menu các chức năng tài khoản | PASS khung |
| `#/order-list` | Mở danh sách đơn | Tìm kiếm, lọc, nút thêm; không có dòng | BLOCKED dữ liệu |
| `#/create-order` | Mở Tạo đơn hàng | Form đầy đủ khách hàng, tuyến, sản phẩm, giá, giảm giá | PASS khung; không submit |
| `#/order-detail` | Mở trực tiếp không mã | `Không có mã đơn hàng` | PASS defensive state |
| `#/edit-order` | Mở trực tiếp không mã | `Không có mã đơn hàng.` | PASS defensive state |
| `#/order-report` | Mở trực tiếp không mã | `Không có mã đơn hàng` | PASS defensive state |
| `#/invoice-list` | Mở danh sách hóa đơn | Khung danh sách, không có dòng | BLOCKED dữ liệu |
| `#/return-orders` | Mở phiếu trả hàng | Khung danh sách, không có dòng | BLOCKED dữ liệu |
| `#/return-order-detail` | Mở trực tiếp không mã | `Không có mã phiếu trả hàng` | PASS defensive state |
| `#/return-product-list` | Mở danh sách SP trả | Dữ liệu Paracetamol mẫu + lỗi script | FAIL |
| `#/revenue` | Mở Doanh số | Tab Theo nhân viên/Theo khách hàng | BLOCKED dữ liệu |
| `#/sales-plan` | Mở Kế hoạch bán hàng | Bộ lọc và danh sách rỗng | BLOCKED dữ liệu |
| `#/sales-plan-detail` | Mở trực tiếp | Khung chi tiết không có bản ghi cụ thể | NOT RUN nghiệp vụ |
| `#/product-warning` | Mở Sản phẩm cảnh báo | Hết hàng/Sắp hết/Cần chú ý đều 0 | BLOCKED dữ liệu |
| `#/contract-point` | Mở Điểm hợp đồng | Tab báo cáo/chi tiết, không có dòng | BLOCKED dữ liệu |
| `#/customer-management` | Mở Quản lý khách hàng | Tìm kiếm, lọc, nút thêm khách hàng | PASS khung; không submit |
| `#/account-detail` | Mở Thông tin tài khoản | Tiêu đề và nút sửa, chưa có giá trị trường | BLOCKED dữ liệu |
| `#/account-edit` | Mở Chỉnh sửa tài khoản | Form chỉnh sửa | PASS khung; không lưu |
| `#/change-password` | Mở Đổi mật khẩu | Form đổi mật khẩu | PASS khung; không cập nhật |
| `#/rag-admin` | Mở Quản lý Tri thức | Upload/đồng bộ tài liệu | PASS khung; không upload |
| `#/survey` | Mở Khảo sát | Chỉ có tiêu đề | FAIL khi API 500 |
| `#/survey-question` | Mở Làm khảo sát | Câu hỏi cố định, không cần ID | FAIL/mock legacy |
| `#/survey-history` | Mở Lịch sử khảo sát | Khung danh sách, không có dòng | BLOCKED dữ liệu |
| `pages/login.html` | Bấm Đăng nhập khi bỏ trống | Cảnh báo nhập đủ tên đăng nhập/mật khẩu | PASS |
| `pages/forgot-password.html` | Bấm Tiếp tục khi bỏ trống | `Vui lòng nhập tên đăng nhập.` | PASS |

## 5. Những gì chưa thể kết luận

- Đúng/sai của KPI, biểu đồ, tổng doanh số, số đơn, khách hàng và phạm vi dữ liệu Manager/TDV.
- Quyền truy cập theo vai trò, chi nhánh và nhân viên.
- Tạo đơn, sửa đơn, xóa đơn, tạo khách hàng, đổi mật khẩu, upload RAG và nộp khảo sát.
- Tìm kiếm, lọc, phân trang với dữ liệu thật.
- Luồng chatbot doanh số và dashboard trả về từ API/n8n.
- Responsive của các màn hình đã đăng nhập sau khi phiên xác thực hết hiệu lực.
- Backend có chặn tuyệt đối truy cập RAG trái quyền hay không; frontend hiện không đủ bảo vệ.
- Khả năng XSS từ dữ liệu API: mã nguồn có nhiều đoạn ghép dữ liệu vào HTML, cần một vòng security test riêng với payload kiểm soát.

## 6. Điều kiện để chạy vòng UAT đầy đủ tiếp theo

1. Khôi phục backend/API/n8n để không còn HTTP 500 và timeout.
2. Cung cấp ít nhất một tài khoản Manager và một tài khoản TDV có dữ liệu kiểm thử, kèm phạm vi chi nhánh rõ ràng.
3. Chuẩn bị dữ liệu test có thể tạo/sửa/xóa và quy trình dọn dữ liệu sau test.
4. Sửa hoặc vô hiệu hóa hai route legacy/mock: `return-product-list` và `survey-question`.
5. Chạy lại ma trận trên desktop và mobile, sau đó mới kiểm tra phân quyền và ký duyệt dữ liệu.

## 7. Đề xuất ưu tiên

1. **Khẩn cấp bảo mật:** thu hồi khóa RAG đã lộ, chuyển xác thực sang backend và thêm role guard.
2. **Blocker tích hợp:** khôi phục API/n8n và bổ sung logging có mã lỗi/correlation ID.
3. **Dữ liệu:** bỏ fallback phạm vi `ADMIN`, dữ liệu mẫu và thông báo thành công giả.
4. **UX:** giảm timeout/retry cho thao tác tương tác; thêm trạng thái đang thử lại, hủy và thử lại cho Tuyến/Khảo sát.
5. **Mã hóa:** sửa chuỗi tiếng Việt hỏng trong Đổi mật khẩu, Chatbot và nhãn biểu đồ.
6. **Vòng UAT tiếp theo:** kiểm thử hai vai trò, nghiệp vụ ghi dữ liệu và responsive ở 1366x768, 1920x1080, zoom 80%/100%/125%.
