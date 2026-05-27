# 📘 HƯỚNG DẪN VẬN HÀNH: BẢO MẬT F12 & ĐỒNG BỘ ĐƠN HÀNG CHATBOT

Tài liệu này lưu trữ thông tin chi tiết về hai tính năng vừa được nâng cấp trong hệ thống Medstand:
1. **Bộ chặn F12 / DevTools Blocker** (Bảo mật mã nguồn Frontend).
2. **Cơ chế tự động khớp (Auto-mapping) Đơn hàng** từ Chatbot Widget sang trang Tạo đơn hàng.

---

## 🔒 PHẦN 1: BỘ CHẶN F12 / DEVTOOLS BLOCKER (BẢO MẬT SOURCE)

Tính năng này được tích hợp tại file [index.html](file:///c:/Git%20cua%20tui/Medstand/index.html) nhằm ngăn chặn người dùng phổ thông ấn F12 hoặc click chuột phải để soi mã nguồn hoặc xem dữ liệu API trên môi trường chạy thực tế (Production).

### 1. Cách hoạt động
*   **Chặn Click chuột phải:** Không cho phép hiện menu ngữ cảnh.
*   **Chặn phím tắt:** Tự động bắt và chặn các phím `F12`, `Ctrl + Shift + I`, `Ctrl + Shift + C`, `Ctrl + Shift + J`, và `Ctrl + U` (Xem Source).
*   **Bẫy Debugger:** Tự động ném tab gỡ lỗi của trình duyệt vào một vòng lặp vô hạn `debugger` với chu kỳ 1 giây. Nếu người dùng cố tình lách luật để mở F12, tab đó sẽ ngay lập tức bị **đóng băng (treo cứng)**.

---

### 2. Cách Vượt Rào (Bypass) cho Lập trình viên
Hệ thống hỗ trợ 2 cơ chế mở khóa tự động cực kỳ an toàn mà không cần sửa code:

*   **Cơ chế 1 (Tự động ở Local):** Khi chạy dự án ở local (`localhost`, `127.0.0.1`, hoặc `[::1]`), bộ chặn sẽ **tự động tắt** để bạn thoải mái F12 lập trình.
*   **Cơ chế 2 (Secret URL trên Production):** Khi cần gỡ lỗi trực tiếp trên link chạy thật, bạn chỉ cần thêm tham số `?dev=true` hoặc `?debug=true` vào sau URL trình duyệt:
    *   *Đường dẫn chạy thật bị chặn:* `https://medtest.bms79.com/#/dashboard`
    *   *Đường dẫn gỡ lỗi bí mật:* `https://medtest.bms79.com/#/dashboard?dev=true`

---

### 3. Cách Bật / Tắt hoặc Xóa bỏ hoàn toàn
Nếu bạn muốn tắt hẳn tính năng này đi, hãy mở file [index.html](file:///c:/Git%20cua%20tui/Medstand/index.html) và tìm khối mã nằm giữa cặp thẻ:
`<!-- ── Security: DevTools Blocker (F12 Blocker) ── -->`

*   **Để tắt tạm thời:** Hãy bình luận (comment) toàn bộ đoạn `<script> ... </script>` này lại bằng dấu `<!-- ... -->` của HTML.
*   **Để bật lại:** Chỉ cần mở bình luận ra như cũ.

---
---

## 📦 PHẦN 2: CƠ CHẾ ĐỒNG BỘ ĐƠN HÀNG TỪ CHATBOT (AUTO-MAP)

Nâng cấp cơ chế đồng bộ tham số khi người dùng lên đơn hàng nhanh bằng giọng nói/văn bản thông qua Chatbot và nhấn chuyển hướng sang trang tạo đơn chính thức [create-order.js](file:///c:/Git%20cua%20tui/Medstand/src/js/pages/create-order.js).

### 1. Bảng đối chiếu các tham số đồng bộ hoàn chỉnh

| Tham số từ Chatbot | Trường nhập trên Form Tạo đơn | Mô tả |
| :--- | :--- | :--- |
| `@ObjectID` / `@CustomerID` | **Khách hàng** | Tự chọn khách hàng khớp tuyệt đối theo ID hoặc tương đối không dấu theo tên hiển thị. |
| `@OrderDate` / `@DeliverDate` | **Ngày chứng từ** | Tự điền ngày chứng từ chuẩn `YYYY-MM-DD` và tự động cập nhật **Tuyến thứ** tương ứng. |
| `@BranchID` / `@Branch` | **Chi nhánh** | Gọi API khớp nối tự động chi nhánh (nếu tài khoản chưa bị khóa cứng chi nhánh). |
| `@ThuDiTuyen` / `@Route` | **Tuyến thứ** | Đồng bộ tuyến thứ tùy chỉnh được yêu cầu. |
| `@Description` / `@Memo` | **Ghi chú** | Điền thông tin ghi chú bổ sung của đơn hàng. |
| `@Notes` / `@DienGiai` | **Diễn giải** | Điền thông tin diễn giải chi tiết cho đơn hàng. |
| `@Phone` / `@Mobile` | **Số điện thoại** | **Ghi đè tùy biến** lên SĐT mặc định của khách hàng. |
| `@Address` / `@DiaChi` | **Địa chỉ** | **Ghi đè tùy biến** lên Địa chỉ mặc định của khách hàng. |
| `@XaPhuong` / `@Ward` | **Phường/Xã** | **Ghi đè tùy biến** lên Phường/Xã mặc định của khách hàng. |

---

### 2. Cấu trúc danh sách sản phẩm khớp nối nâng cao (`@ItemList`)
Hệ thống tự động nhận diện và phân tích cấu trúc sản phẩm linh hoạt từ n8n/Chatbot gửi lên:
*   Mã sản phẩm: `ItemID` / `ItemCode` / `id`
*   Số lượng: `Quantity` / `SoLuong` / `qty`
*   Đơn giá: `Price` / `UnitPrice` / `Gia`
*   Chiết khấu %: `DiscountPercent` / `Discount` / `ck` (hỗ trợ tự động trích xuất chiết khấu dạng chuỗi như `"ck 10%"` trong tên sản phẩm).

---

### 3. Cách chạy thử kịch bản Test mẫu trong `docs/`
Bạn hãy truy cập trình duyệt chạy local và dán đường link hash giả lập này để test toàn bộ tính năng auto-mapping:
```text
#/create-order?data={"@ObjectID":"HYA107","@Description":"Áp mã khuyến mãi giamgia50k","@ItemList":[{"ItemID":"Antrinano","ItemName":"5 hộp Antrinano (ck 5%)","Quantity":5},{"ItemID":"Trinovix","ItemName":"10 tuýp Kem bôi Trinovix (ck 5%)","Quantity":10}]}
```
*(Hệ thống sẽ tự động dọn sạch tham số `?data=` trên thanh địa chỉ ngay khi nạp xong để tránh lỗi tải lại trang).*
