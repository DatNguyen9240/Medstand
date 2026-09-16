# Hướng dẫn sử dụng Medstand AI cho doanh nghiệp

> Tài liệu hướng dẫn sử dụng hệ sinh thái Trợ lý Medstand AI dành cho đội ngũ kinh doanh và quản lý. Bản Word và HTML có hình gửi khách hàng nằm tại `docs/GOI_UAT_KHACH_HANG`.

| Thông tin | Nội dung |
|---|---|
| Môi trường thử nghiệm Web | `https://medtest.bms7.net/#/chatbot` |
| Kênh thử nghiệm Telegram | Bot Telegram `@MedstandAIBot` (Hỗ trợ 13 tài khoản UAT) |
| Cập nhật phiên bản | **09/09/2026 — frontend 11.144** |
| Đối tượng người dùng | Trình dược viên (TDV/Sale), Quản lý khu vực (ASM/Manager) và Ban Giám đốc |
| Tài liệu bàn giao | `01_HUONG_DAN_SU_DUNG_MEDSTAND_AI.docx` và `.html` |

---

## 1. Bắt đầu nhanh

### Trên Giao diện Web
1. Truy cập hệ thống bằng trình duyệt Chrome hoặc Microsoft Edge.
2. Đăng nhập và kiểm tra họ tên, vai trò hiển thị ở góc trái màn hình.
3. Nhấp chọn **AI Trợ lý** trên menu điều hướng.
4. Nhập câu chào `Xin chào`, hoặc `Tôi là ai?` để bot xác nhận danh tính và phân quyền.
5. Thử nghiệm câu hỏi: `Doanh số hôm nay của tôi là bao nhiêu?`.

### Trên Ứng dụng Telegram (Di động)
1. Trên giao diện Web, vào menu **Tài khoản** (`#/account`), chọn **Liên kết Telegram**.
2. Nhấn nút **Lấy mã liên kết** để nhận mã OTP 6 chữ số (hiệu lực 15 phút).
3. Mở Telegram, tìm bot và gửi tin nhắn: `/link <mã_6_số>` (ví dụ: `/link 123456`).
4. Sau khi bot xác nhận liên kết thành công, bạn có thể chat tra cứu mọi số liệu kinh doanh ngay trên điện thoại.

---

## 2. Tìm kiếm gần đúng thông minh (Selection Token)

Hệ thống đã hỗ trợ công nghệ **Tìm kiếm gần đúng thông minh**. Bạn không cần nhớ chính xác mã khách hàng hay mã sản phẩm:
- **Gõ theo tên:** `Xem công nợ nhà thuốc Phương Mai`, `Tồn kho thuốc ho Bảo Thanh`
- **Gõ theo số điện thoại:** `Doanh số khách hàng 0988123456`
- **Gõ theo hoạt chất/công dụng:** `Tìm thuốc hạ sốt paracetamol`

Khi có nhiều kết quả tương tự, Trợ lý AI sẽ tự động hiển thị thẻ danh sách lựa chọn gần đúng (`needs_selection`). Bạn chỉ cần bấm chọn đúng nhà thuốc hoặc sản phẩm mong muốn, bot sẽ tự động trả lời câu hỏi nghiệp vụ mà không cần gõ lại.

---

## 3. Công thức đặt câu hỏi mẫu

Cấu trúc chuẩn: **Hành động + Đối tượng + Tên hoặc mã gần đúng + Khoảng thời gian (nếu có)**.

```text
Doanh số của tôi từ 01/08/2026 đến 31/08/2026
Chi tiết công nợ nhà thuốc An Khang đến hôm nay
Tồn kho sản phẩm Aquamed Plus
Gợi ý bán hàng cho khách hàng Mai Hương
Xem chi tiết đơn hàng DMB0826/8
Chương trình khuyến mãi hiện có của Hoạt huyết Medstand
```

---

## 4. Các nhóm chức năng chính

1. **Doanh số & Hóa đơn:** Tra cứu doanh số ngày/tháng, bảng kê hóa đơn bán hàng, chi tiết từng dòng hóa đơn.
2. **Công nợ & Tích lũy:** Báo cáo công nợ tổng hợp, công nợ chi tiết từng chứng từ, theo dõi tiến độ tích lũy quà tặng CTBH.
3. **Phân hạng & Chăm sóc khách hàng:** Chấm điểm phân nhóm khách hàng (A, B, C, UNRATED), cảnh báo nguy cơ giảm mua hoặc bỏ tuyến.
4. **Phân tích Khách hàng Hợp đồng:** Đánh giá mức độ hoàn thành hợp đồng năm 2026, cảnh báo các nhà thuốc không phát sinh đơn 3 tháng liên tiếp.
5. **Gợi ý đặt hàng & Bán thêm (Upsell):** Dự báo mặt hàng khách sắp hết dựa trên chu kỳ mua thực tế và gợi ý hàng bán kèm phù hợp.
6. **Tồn kho khả dụng & Bảng giá:** Kiểm tra số lượng tồn thật có thể bán theo từng kho phân quyền, tra cứu giá bán phân cấp theo từng nhóm khách.
7. **Chương trình bán hàng & Ưu đãi:** Xem các CTBH đang áp dụng, quà tặng theo số lượng/giá trị cho từng sản phẩm.
8. **Lập đơn hàng nháp:** Đưa sản phẩm từ gợi ý vào giỏ hàng hội thoại, xem trước chiết khấu/quà tặng và xác nhận tạo đơn an toàn qua cơ chế chống gửi lặp (Idempotency).

---

## 5. Phạm vi phân quyền dữ liệu

- **Trình dược viên (Sale):** Chỉ xem được danh sách khách hàng, công nợ, đơn hàng và kho hàng thuộc phạm vi phụ trách được công ty giao.
- **Quản lý (Manager):** Xem được toàn bộ số liệu tổng hợp và chi tiết của nhân viên dưới quyền trong khu vực quản lý.
- **Quy tắc an toàn:** Hệ thống trang bị lớp bảo vệ Scope Guard (`AI_ScopeGuardFnc`), tuyệt đối ngăn chặn rò rỉ dữ liệu chéo vùng miền giữa các chi nhánh miền Bắc, miền Trung, miền Nam.

---

## 6. Xử lý sự cố thường gặp

1. **Dữ liệu chưa cập nhật:** Nhấn tổ hợp phím `Ctrl + F5` để trình duyệt tải bundle mới nhất (`11.144`).
2. **Không thấy khách hàng/sản phẩm:** Kiểm tra lại từ khóa tìm kiếm hoặc kiểm tra xem khách hàng có thuộc danh sách phân quyền của bạn hay không.
3. **Mã liên kết Telegram hết hạn:** Mã OTP chỉ có giá trị trong 15 phút. Nếu hết hạn, hãy nhấn lấy lại mã mới trên trang Web Tài khoản.
4. **Lỗi hệ thống hoặc phản hồi chậm:** Nếu câu hỏi xử lý quá 15 giây, vui lòng ghi lại câu hỏi, thời gian và chụp ảnh màn hình gửi bộ phận kỹ thuật (không nhấn gửi lặp nhiều lần).
