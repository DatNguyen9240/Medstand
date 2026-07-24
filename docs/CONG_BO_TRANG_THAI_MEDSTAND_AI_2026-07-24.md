# Thông báo trạng thái Medstand AI — Customer Pilot

**Ngày cập nhật:** 24/07/2026
**Môi trường Pilot:** `https://medtest.bms7.net/`
**Phạm vi:** Sale, Quản lý và Admin được cấp quyền
**Trạng thái công bố:** `SOURCE_AND_BUILD_READY_RUNTIME_RETEST_REQUIRED`

## 1. Tóm tắt

Medstand AI hiện đã có nền tảng trợ lý nghiệp vụ hội thoại, kết nối các API ERP được cho phép và trả kết quả bằng bảng, thẻ thông tin hoặc biểu đồ. Bản source hiện tại đã được kiểm tra cú pháp, build production và kiểm thử tĩnh các luồng hội thoại.

Bản này phù hợp để tiếp tục kiểm thử Pilot có kiểm soát. Chưa được gọi là nghiệm thu production cuối cùng cho đến khi bundle mới được triển khai lên môi trường Pilot, workflow n8n đang chạy được xác nhận và ma trận kiểm thử thực tế trên tài khoản Sale/Quản lý hoàn tất.

## 2. Những gì đã có

- Tra cứu doanh số, công nợ, tồn kho, sản phẩm, khách hàng, đơn hàng, hóa đơn và danh mục theo quyền tài khoản.
- Gợi ý nghiệp vụ cho tuyến bán hàng, gợi ý đơn hàng, gợi ý bán kèm, tích lũy, chấm điểm khách hàng và sản phẩm trọng tâm.
- Hội thoại tự nhiên được giới hạn trong các API nghiệp vụ đã duyệt; câu ngoài phạm vi không được tự đoán.
- Phân quyền dữ liệu do backend/SQL kiểm tra; Sale chỉ xem phạm vi được giao, Quản lý/Admin xem theo quyền hệ thống.
- Mutation chỉ hiển thị xem trước, chưa tự ghi đơn, đổi giá hoặc áp khuyến mãi thật.
- Có cảnh báo nội dung AI có thể sai sót; nội dung chuyên môn chỉ mang tính tham khảo.
- Nút `Dừng phản hồi` cho request đang chạy, áp dụng cho cả câu tự nhiên và luồng `@`.

## 3. Bằng chứng kiểm tra source hiện tại

| Hạng mục | Kết quả |
|---|---:|
| Kiểm tra cú pháp `chatbot.js` | PASS |
| Kiểm tra cú pháp `chatbot-api-engine.js` | PASS |
| Build frontend production | PASS |
| Bộ kiểm thử hội thoại tự nhiên | `159/159 PASS` |
| Release-gate failure | `0` |
| API nghiệp vụ trong allowlist Pilot | `24` |
| Mutation thật trong Pilot | Bị khóa, chỉ preview |

Các kết quả trên là bằng chứng source/build. Chúng không thay thế cho kiểm thử runtime trên server.

## 4. Các điểm đã khắc phục gần nhất

- Bổ sung định tuyến câu tự nhiên cho câu hỏi công việc hôm nay, khách lâu chưa mua và bán gì cho một khách cụ thể.
- Bổ sung giữ ngữ cảnh cho các câu tiếp nối như “chi tiết đi”, “tháng trước thì sao”, “đổi sang khách khác”.
- Chuẩn hóa nhiều card nghiệp vụ theo ngôn ngữ dành cho Sale và Quản lý, giảm tên field kỹ thuật.
- Tách rõ tồn vật lý và tồn khả dụng tham khảo; không tự khẳng định có thể bán nếu ERP chưa cung cấp đủ dữ liệu.
- Bổ sung thông tin lý do và hành động tiếp theo cho luồng tuyến bán hàng.
- Bổ sung cơ chế hủy request và nút `Dừng phản hồi`.

## 5. Các giới hạn cần công bố rõ

- AI không thay thế quyết định của Sale, Quản lý, Dược sĩ hoặc người có thẩm quyền.
- Gợi ý chu kỳ mua, bán kèm, chấm điểm và chăm sóc khách hàng là gợi ý dựa trên dữ liệu hiện có; không phải cam kết bán hàng.
- Tồn khả dụng có thể hiển thị “chưa xác định” hoặc “tham khảo” nếu ERP chưa cung cấp reservation, hàng giữ chỗ, hàng khóa hoặc thời điểm cập nhật.
- Công nợ có thể có khoản chưa xác định ngày đến hạn nếu nguồn ERP không có ngày hạn.
- Các chương trình khuyến mãi chưa được duyệt chỉ hiển thị để Quản lý/Admin xem xét; không được hiểu là chương trình đã áp dụng.
- Câu hỏi ngoài phạm vi 24 API được duyệt sẽ được yêu cầu diễn đạt lại hoặc trả về trạng thái không hỗ trợ.

## 6. Điều kiện trước khi công bố Pilot cho khách hàng

Người triển khai cần hoàn thành đủ các bước sau trên cùng một release:

1. Upload frontend bundle mới, tối thiểu `chatbot-widget/js/chatbot.bundle.min.js`.
2. Nếu có thay đổi n8n, import đúng workflow và xác nhận workflow chính ở trạng thái Published/Active.
3. Khởi động lại gateway nếu môi trường có cache bundle hoặc process giữ source cũ.
4. Mở `https://medtest.bms7.net/#/chatbot`, đăng xuất/đăng nhập lại và hard refresh (`Ctrl + F5`).
5. Chạy ít nhất một tài khoản Sale và một tài khoản Quản lý.
6. Kiểm tra các luồng: danh mục, doanh số, công nợ, tồn kho, tuyến, gợi ý đơn hàng, gợi ý bán kèm và câu tự nhiên.
7. Xác nhận dữ liệu chỉ nằm trong phạm vi tài khoản.
8. Ghi lại thời điểm, tài khoản, câu hỏi, kết quả, request ID và ảnh chụp khi có lỗi.

## 7. Hướng dẫn xử lý khi gặp lỗi

- **Thông tin chưa đủ:** bổ sung mã khách hàng, mã sản phẩm, mã đơn hoặc khoảng ngày.
- **Không có dữ liệu:** kiểm tra lại phạm vi tài khoản và trạng thái dữ liệu ERP; không tự suy đoán.
- **Lỗi hệ thống hoặc timeout:** thử lại một lần, ghi thời gian và request ID; không bấm gửi liên tục.
- **Request chạy quá lâu:** bấm `Dừng phản hồi`, sau đó thử lại khi gateway ổn định.
- **Tên hoặc số liệu không khớp ERP:** chụp màn hình, ghi mã đối tượng và chuyển cho đầu mối dữ liệu/ERP.

## 8. Kết luận trạng thái

Medstand AI đã đạt mức **sẵn sàng về source và build để tiếp tục Customer Pilot có kiểm soát**. Bản công bố này không khẳng định hệ thống đã hoàn tất production hoặc đã có Business PASS.

Trạng thái chỉ được chuyển sang `CUSTOMER_PILOT_RUNTIME_PASS` sau khi:

- frontend bundle mới đã chạy trên môi trường Pilot;
- workflow n8n và gateway đã được xác nhận đúng release;
- kiểm thử thực tế Sale/Quản lý đạt yêu cầu;
- phạm vi dữ liệu và các luồng lỗi chính đã được ghi nhận;
- người phụ trách nghiệp vụ ký nghiệm thu.
