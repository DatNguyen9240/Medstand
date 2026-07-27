# Hướng dẫn sử dụng Medstand AI cho doanh nghiệp

> Tài liệu nguồn rút gọn. Bản Word và HTML có hình để gửi người dùng nằm trong thư mục `docs/GOI_UAT_KHACH_HANG`.

| Thông tin | Nội dung |
|---|---|
| Môi trường thử nghiệm | `https://medtest.bms7.net/#/chatbot` |
| Cập nhật | 27/07/2026 |
| Người dùng | Nhân viên kinh doanh, Quản lý và người điều phối |
| Tài liệu chính | `01_HUONG_DAN_SU_DUNG_MEDSTAND_AI.docx` và `.html` |

## 1. Bắt đầu nhanh

1. Mở đường dẫn thử nghiệm bằng Chrome hoặc Microsoft Edge.
2. Đăng nhập và kiểm tra đúng tên, vai trò ở góc trái dưới.
3. Chọn **Trợ lý AI** trong menu bên trái.
4. Nhập `Xin chào`, sau đó nhập `Tôi là ai?`.
5. Bắt đầu với câu `Doanh số hôm nay của tôi là bao nhiêu?`.

Một truy vấn thường cần khoảng 1–5 giây. Nếu quá 15 giây, ghi nhận phản hồi chậm; không nhấn gửi liên tục.

## 2. Công thức đặt câu hỏi

Sử dụng: **Hành động + đối tượng + mã hoặc tên + khoảng thời gian nếu cần**.

```text
Doanh số của tôi từ 01/07/2026 đến 27/07/2026
Chi tiết công nợ khách NDB001 đến ngày 27/07/2026
Tồn kho sản phẩm A003
Gợi ý bán kèm cho khách NDB001
Xem chi tiết hóa đơn U13S1_MB13_4
```

Nếu hệ thống hỏi thêm thông tin, hãy bổ sung đúng mã khách hàng, sản phẩm, hóa đơn hoặc khoảng ngày được yêu cầu.

## 3. Phạm vi dữ liệu

- Nhân viên kinh doanh chỉ xem khách hàng, tuyến, kho và số liệu được giao.
- Quản lý chỉ xem nhân viên và khu vực thuộc phạm vi phụ trách.
- Nếu thấy dữ liệu ngoài phạm vi, dừng thao tác, không mở chi tiết và báo lỗi nghiêm trọng.

## 4. Các nhóm chức năng

- Doanh số, hóa đơn, chi tiết hóa đơn và đơn hàng.
- Chấm điểm khách hàng, công nợ tổng/chi tiết và tích lũy.
- Tuyến bán hàng, gợi ý đơn hàng và gợi ý bán kèm.
- Tồn kho, tra cứu sản phẩm và danh mục.
- Sản phẩm trọng tâm và đề xuất khuyến mãi.
- Khảo sát 360, câu hỏi, trạng thái, theo ngày và lịch sử.
- Thông báo và tìm sản phẩm theo triệu chứng.

## 5. Cách đọc kết quả

- Kiểm tra đúng tiêu đề, tài khoản/vai trò và khoảng thời gian.
- Đọc các thẻ tổng quan có nhãn và đơn vị rõ ràng.
- Khi đổi nhóm Nhân viên/Khách hàng/Sản phẩm, dữ liệu bên dưới phải đổi theo.
- Mã, tên, số điện thoại và số liệu không được lộn cột hoặc định dạng sai.
- “Dữ liệu thực tế” là dữ liệu hiện có trên môi trường thử nghiệm tại thời điểm truy vấn, không phải chứng từ tài chính chính thức.

## 6. Hiểu đúng dữ liệu nghiệp vụ

- Doanh số phụ thuộc khoảng ngày và phạm vi tài khoản.
- Công nợ là phát sinh tăng trừ phát sinh giảm đến ngày chốt.
- Tồn kho là số hệ thống ghi nhận, chưa luôn đồng nghĩa số chắc chắn bán được.
- Nhóm A/B/C là phân khúc giá trị, không phải mức rủi ro.
- Gợi ý bán hàng và đề xuất khuyến mãi chỉ để tham khảo, không phải quyết định đã duyệt.
- Tìm theo triệu chứng không thay thế chẩn đoán hoặc tư vấn chuyên môn.

## 7. Khi gặp lỗi

1. Kiểm tra tài khoản và vai trò.
2. Kiểm tra mã khách hàng/sản phẩm/hóa đơn và khoảng ngày.
3. Đăng xuất, đăng nhập lại và nhấn `Ctrl + F5`.
4. Thử lại đúng một lần.
5. Nếu còn lỗi, gửi tài khoản, vai trò, thời gian, câu hỏi nguyên văn, mã liên quan, kết quả thực tế, kết quả mong đợi và ảnh toàn màn hình.

Không gửi mật khẩu, token hoặc thông tin xác thực.

## 8. Quy tắc an toàn UAT

- Chỉ dùng dữ liệu UAT được cấp.
- Không tự áp giá hoặc phát hành khuyến mãi.
- Nếu được phép thử tạo khách/đơn trên UAT, dùng tiền tố `UAT_TEST` và kiểm tra màn hình xác nhận trước khi gửi.
- Không thực hiện thao tác ghi dữ liệu trên môi trường khác nếu chưa được phê duyệt.

## 9. Tài liệu kiểm thử 13 tài khoản

Các bản Word và HTML dành cho kiểm thử 13 tài khoản được giữ riêng trong `docs/GOI_UAT_KHACH_HANG`. Không thay thế chúng bằng hướng dẫn sử dụng này vì mục đích của hai bộ tài liệu khác nhau.
