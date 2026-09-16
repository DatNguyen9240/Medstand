---
name: notion-project-sync
description: Đồng bộ thông tin từ mã nguồn dự án hiện tại trong VS Code sang Notion. Dùng khi cần phân tích dự án, cập nhật tài liệu, yêu cầu, công việc, kiến trúc, tiến độ hoặc đối chiếu mã nguồn với nội dung trong Notion.
---

# Notion Project Sync

## Mục tiêu

Biến Notion thành nơi quản lý tri thức và tiến độ của dự án, còn mã nguồn thật vẫn nằm trong Git/GitHub.

Kỹ năng này dùng để:

- đọc dự án hiện tại trong VS Code;
- hiểu cấu trúc và chức năng của mã nguồn;
- đọc nội dung dự án tương ứng trong Notion;
- so sánh hai bên;
- đề xuất thay đổi;
- cập nhật Notion khi phù hợp.

Không dùng Notion để sao chép hoặc lưu toàn bộ mã nguồn.

---

# Nguyên tắc chung

1. Mã nguồn trong dự án hiện tại là nguồn chính cho thông tin kỹ thuật.
2. Nội dung nghiệp vụ do người dùng hoặc khách hàng cung cấp trong Notion là nguồn chính cho yêu cầu nghiệp vụ.
3. Không suy diễn yêu cầu nghiệp vụ chỉ từ mã nguồn.
4. Không xóa hoặc ghi đè nội dung Notion do con người tạo nếu chưa có lý do rõ ràng.
5. Không đưa thông tin bí mật lên Notion.
6. Không sửa mã nguồn khi người dùng chỉ yêu cầu cập nhật tài liệu.
7. Không tự đánh dấu công việc hoặc yêu cầu là hoàn thành chỉ vì tìm thấy mã tương ứng.
8. Nếu có mâu thuẫn giữa mã nguồn và tài liệu, phải báo rõ thay vì tự chọn một bên.
9. Ưu tiên cập nhật nội dung đã tồn tại thay vì tạo trang trùng lặp.
10. Yêu cầu trực tiếp của người dùng luôn được ưu tiên hơn quy tắc trong kỹ năng này.

---

# Dữ liệu tuyệt đối không đưa lên Notion

Không được đưa lên Notion:

- `.env`
- khóa API
- mật khẩu
- chuỗi kết nối có thông tin bí mật
- khóa riêng
- mã thông báo truy cập
- thông tin xác thực
- dữ liệu khách hàng nhạy cảm
- nội dung bí mật trong cấu hình máy
- tệp chứng thư
- giá trị biến môi trường nhạy cảm

Nếu gặp các dữ liệu trên, chỉ mô tả rằng dự án có sử dụng cấu hình hoặc biến môi trường, không ghi giá trị thật.

---

# Bước 1 — Xác định dự án

Trước khi đồng bộ:

1. Xác định thư mục gốc của dự án.
2. Xác định tên dự án.
3. Xác định kho Git nếu có.
4. Xác định nhánh hiện tại.
5. Xác định trang hoặc dự án tương ứng trong Notion.
6. Nếu không xác định chắc chắn được trang Notion tương ứng, hỏi người dùng trước khi ghi.

Ví dụ:

Dự án mã nguồn:

`Medstand`

Trang Notion:

`MedStand Manager Project`

---

# Bước 2 — Đọc mã nguồn

Ưu tiên đọc các nguồn sau:

- `README`
- `AGENTS.md`
- tài liệu trong `docs`
- tệp cấu hình dự án
- cấu trúc thư mục
- tệp khởi động chương trình
- mã nguồn chính
- bộ điều khiển
- dịch vụ
- mô hình dữ liệu
- cơ sở dữ liệu
- migration
- API
- kiểm thử
- cấu hình triển khai
- trạng thái Git
- thay đổi chưa commit nếu có liên quan đến yêu cầu

Không cần đọc:

- `node_modules`
- `bin`
- `obj`
- `dist`
- `build`
- `.git`
- thư mục sinh tự động
- tệp nhị phân
- tệp cache

Không đọc toàn bộ dự án một cách mù quáng nếu có thể xác định các phần quan trọng trước.

---

# Bước 3 — Phân tích cấu trúc dự án

Sau khi đọc dự án, xác định:

## Tổng quan

- dự án làm gì;
- mục tiêu chính;
- đối tượng sử dụng;
- trạng thái phát triển hiện tại.

## Công nghệ

Xác định:

- giao diện;
- máy chủ;
- cơ sở dữ liệu;
- thư viện quan trọng;
- công cụ triển khai;
- dịch vụ bên ngoài.

## Cấu trúc mã nguồn

Mô tả chức năng của các thư mục chính.

Ví dụ:

- `frontend`: giao diện người dùng;
- `backend`: xử lý nghiệp vụ và API;
- `database`: cấu trúc dữ liệu;
- `tests`: kiểm thử;
- `docs`: tài liệu dự án.

Không chỉ liệt kê tên thư mục. Phải mô tả vai trò của chúng.

## Các phần chức năng chính

Xác định các nhóm chức năng quan trọng của hệ thống.

Ví dụ:

- đăng nhập;
- phân quyền;
- quản lý đơn hàng;
- quản lý tài liệu;
- quản lý người dùng.

## Kiến trúc

Nếu có đủ bằng chứng, mô tả:

- giao diện gọi đến đâu;
- máy chủ xử lý thế nào;
- dữ liệu lưu ở đâu;
- xác thực hoạt động thế nào;
- dịch vụ bên ngoài nào đang được sử dụng;
- các luồng chính của hệ thống.

Không đoán kiến trúc nếu chưa đủ dữ liệu.

---

# Bước 4 — Đọc Notion

Sử dụng Notion MCP để tìm đúng trang dự án.

Trước khi thay đổi, đọc nội dung hiện tại để xác định:

- phần nào đã tồn tại;
- phần nào thiếu;
- phần nào đã cũ;
- phần nào có thể mâu thuẫn với mã nguồn;
- phần nào do người dùng viết và cần giữ nguyên.

Không tạo lại một mục nếu đã có mục tương đương.

---

# Bước 5 — So sánh mã nguồn và Notion

Phân loại kết quả thành 4 nhóm:

## Mới

Thông tin có trong mã nguồn nhưng Notion chưa có.

## Thay đổi

Thông tin trong Notion không còn giống trạng thái mã nguồn hiện tại.

## Không chắc chắn

Không đủ bằng chứng để xác định thông tin nào đúng.

## Không cần cập nhật

Hai bên đang khớp nhau.

Khi phát hiện tài liệu có khả năng cũ, không xóa ngay.

Đánh dấu hoặc báo:

`Có khả năng đã cũ — cần kiểm tra`

---

# Bước 6 — Kế hoạch cập nhật

Trước khi thực hiện thay đổi đáng kể, trình bày kế hoạch ngắn gọn.

Ví dụ:

## Dự kiến cập nhật

- bổ sung cấu trúc mã nguồn;
- cập nhật công nghệ đang sử dụng;
- thêm mô tả phần quản lý đơn hàng;
- cập nhật nhánh hiện tại;
- đánh dấu tài liệu xác thực có khả năng đã cũ.

Nếu người dùng yêu cầu chỉ xem trước, dừng tại đây.

Nếu người dùng đã yêu cầu rõ ràng rằng có thể cập nhật trực tiếp, có thể tiếp tục.

---

# Bước 7 — Cấu trúc nội dung trên Notion

Khi cập nhật trang dự án, ưu tiên cấu trúc sau.

## 📌 Tổng quan

Bao gồm:

- tên dự án;
- mục tiêu;
- mô tả;
- trạng thái;
- công nghệ chính;
- kho mã nguồn;
- nhánh chính hoặc nhánh hiện tại.

---

## 🔗 Kho mã nguồn

Bao gồm:

- liên kết GitHub;
- nhánh chính;
- nhánh đang phát triển;
- cấu trúc kho mã nguồn.

Không sao chép toàn bộ mã nguồn vào Notion.

---

## 🧱 Cấu trúc mã nguồn

Ví dụ:

### Giao diện

`frontend/`

Chứa giao diện người dùng và xử lý phía trình duyệt.

### Máy chủ

`backend/`

Chứa API và xử lý nghiệp vụ.

### Kiểm thử

`tests/`

Chứa kiểm thử tự động.

Chỉ liệt kê các thư mục quan trọng.

---

## 🏗 Kiến trúc hệ thống

Mô tả ngắn gọn:

- giao diện;
- máy chủ;
- cơ sở dữ liệu;
- xác thực;
- luồng dữ liệu;
- tích hợp bên ngoài.

Ưu tiên mô tả dễ hiểu.

---

## 📦 Các chức năng chính

Mỗi chức năng gồm:

- tên;
- mục đích;
- khu vực mã nguồn liên quan;
- trạng thái nếu xác định được.

---

## 🔌 Giao diện lập trình

Nếu dự án có API, tóm tắt theo nhóm.

Ví dụ:

### Đơn hàng

- tạo đơn;
- cập nhật đơn;
- xóa đơn;
- duyệt đơn.

Không chép toàn bộ mã API lên Notion.

---

## 🗃 Cơ sở dữ liệu

Nếu có đủ thông tin, mô tả:

- các bảng hoặc thực thể chính;
- quan hệ quan trọng;
- dữ liệu mỗi phần chịu trách nhiệm.

Không đưa mật khẩu hoặc chuỗi kết nối lên Notion.

---

## ✅ Công việc hiện tại

Nếu có thể xác định từ Git và mã nguồn:

- nhánh hiện tại;
- khu vực đang thay đổi;
- tệp chính đã sửa;
- trạng thái kiểm thử;
- việc đang thực hiện.

Không tự kết luận `Hoàn thành` nếu người dùng chưa xác nhận hoặc không có bằng chứng rõ ràng.

---

## 📚 Tài liệu cần bổ sung

Liệt kê những phần có trong mã nguồn nhưng chưa được tài liệu hóa.

Ví dụ:

- luồng xác thực chưa có tài liệu;
- cơ sở dữ liệu chưa có sơ đồ;
- API đơn hàng chưa có mô tả;
- thiếu hướng dẫn triển khai.

---

# Bước 8 — Yêu cầu

Nếu Notion có bảng Yêu cầu, mỗi yêu cầu nên có:

- mã yêu cầu;
- tên;
- mô tả;
- trạng thái;
- mức độ ưu tiên;
- nhóm chức năng;
- nguồn yêu cầu;
- người phụ trách;
- công việc liên quan;
- tài liệu liên quan;
- liên kết GitHub nếu cần.

Không tạo yêu cầu nghiệp vụ chỉ dựa vào việc nhìn thấy một đoạn mã.

Nếu mã nguồn có hành vi không được mô tả trong yêu cầu, ghi:

`Phát hiện hành vi trong mã nguồn chưa có yêu cầu tương ứng.`

---

# Bước 9 — Công việc

Nếu Notion có bảng Công việc, mỗi công việc có thể chứa:

- tên công việc;
- trạng thái;
- mức độ ưu tiên;
- người thực hiện;
- yêu cầu liên quan;
- nhánh;
- yêu cầu kéo mã;
- tệp mã nguồn liên quan;
- kết quả kiểm thử;
- ghi chú.

Khi cập nhật từ Git, có thể ghi:

- nhánh hiện tại;
- tệp đã thay đổi;
- commit liên quan;
- yêu cầu kéo mã liên quan.

Không thay đổi trạng thái công việc nếu không có đủ bằng chứng.

---

# Bước 10 — Sau khi cập nhật

Sau khi ghi vào Notion, báo cáo ngắn gọn:

## Đã cập nhật

- các phần đã thêm;
- các phần đã sửa.

## Không thay đổi

- các phần đã đúng.

## Cần người dùng kiểm tra

- thông tin không chắc chắn;
- tài liệu có khả năng đã cũ;
- mâu thuẫn giữa mã nguồn và Notion.

Không chỉ trả lời chung chung rằng "đã đồng bộ".

---

# Chế độ sử dụng

## Chế độ xem trước

Khi người dùng nói:

- `xem thử`
- `phân tích trước`
- `chưa cập nhật`
- `cho tôi xem kế hoạch`

thì:

1. đọc mã nguồn;
2. đọc Notion;
3. so sánh;
4. đưa kế hoạch;
5. không ghi vào Notion.

---

## Chế độ đồng bộ

Khi người dùng nói:

- `đồng bộ lên Notion`
- `cập nhật Notion`
- `đưa phần này lên Notion`

thì:

1. đọc mã nguồn;
2. đọc Notion;
3. so sánh;
4. cập nhật những phần phù hợp;
5. báo cáo kết quả.

Nếu thay đổi có nguy cơ xóa hoặc ghi đè nội dung quan trọng, phải hỏi trước.

---

## Chế độ cập nhật thay đổi gần đây

Khi người dùng nói:

`Cập nhật những gì tôi vừa làm lên Notion`

thì ưu tiên đọc:

- `git status`;
- `git diff`;
- nhánh hiện tại;
- commit gần nhất;
- các tệp vừa thay đổi.

Sau đó chỉ cập nhật nội dung liên quan đến thay đổi đó.

Không phân tích lại toàn bộ dự án nếu không cần.

---

## Chế độ tạo tài liệu

Khi người dùng nói:

`Tạo tài liệu từ mã nguồn`

thì:

1. xác định phạm vi được yêu cầu;
2. đọc phần mã liên quan;
3. tạo tài liệu dễ hiểu;
4. liên kết với dự án;
5. đưa tài liệu vào đúng vị trí trong Notion.

---

# Quy tắc an toàn khi ghi Notion

Có thể tự thực hiện:

- bổ sung mô tả;
- thêm mục mới;
- cập nhật cấu trúc mã nguồn;
- thêm tài liệu kỹ thuật mới;
- thêm liên kết GitHub;
- cập nhật thông tin kỹ thuật có bằng chứng rõ.

Phải hỏi trước khi:

- xóa trang;
- xóa yêu cầu;
- xóa công việc;
- ghi đè nội dung lớn do người dùng viết;
- thay đổi nội dung nghiệp vụ;
- đánh dấu yêu cầu hoàn thành;
- đánh dấu công việc hoàn thành khi chưa chắc chắn;
- thay đổi hàng loạt nhiều trang.

---

# Khi Notion MCP lỗi

Nếu không thể truy cập Notion:

1. không giả vờ đã đọc Notion;
2. báo rõ lỗi;
3. vẫn có thể phân tích mã nguồn nếu người dùng muốn;
4. không tạo dữ liệu giả định về nội dung Notion.

Nếu lỗi xác thực, báo rõ rằng kết nối Notion cần đăng nhập lại.

---

# Kết quả mong muốn

Sau khi kỹ năng hoạt động tốt, người dùng chỉ cần nói:

`Đồng bộ dự án hiện tại lên Notion.`

Kỹ năng phải có khả năng:

Mã nguồn
→ phân tích
→ đối chiếu Notion
→ xác định thay đổi
→ cập nhật đúng phần
→ báo cáo kết quả

Notion là nơi quản lý tri thức và tiến độ.

GitHub là nơi quản lý mã nguồn.

VS Code là nơi phát triển.

Codex là cầu nối giữa các hệ thống.

## Th?ng tin ??ch v? ki?m tra khi th?c hi?n

- Trang MedStand ?? x?c nh?n: https://app.notion.com/p/3d76478c880780a9b736d226733e6e8e ? t?n trang `MedStand Manager Pro`, thu?c `Projects`, ti?u ?? n?i dung `MedStand Manager Project`. ??c l?i ?? x?c nh?n; n?u kh?ng truy c?p ???c, t?m theo c?c t?n n?y, kh?ng t? t?o trang thay th?.
- Gi? c?u tr?c th?c t? c?a trang v? c?c m?c t??ng ???ng ?ang c?; c?u tr?c ? tr?n l? h??ng d?n, kh?ng ph?i y?u c?u t? ch?c l?i to?n b? trang.
- M?i c?p nh?t ph?i c? b?ng ch?ng t? ???ng d?n file, commit, k?t qu? ki?m th? ho?c t?i li?u li?n quan. Ph?n bi?t thay ??i ch?a commit, m? ?? commit v? tr?ng th?i ?? tri?n khai; kh?ng bi?n v? d? th?nh y?u c?u ho?c phi?n b?n th?t.
- Tr??c khi ghi, ??c schema database v? ??c t? Markdown c?a c?ng c? n?u thao t?c c?n ch?ng. Ki?m tra ph?n trang v? n?i dung b? c?t khi ??c; b?o r? ph?n ch?a ki?m ch?ng.
- Quy?n c?p nh?t ?p d?ng trong ph?m vi ng??i d?ng ?? y?u c?u ??ng b?. N?u ch? y?u c?u t?o t?i li?u m? ch?a ch?n Notion l?m n?i l?u, kh?ng m?c nhi?n coi ?? l? quy?n ghi Notion.
- V?i thao t?c ph?i h?i tr??c, chu?n b? n?i dung c? th? v? danh s?ch m?c b? ?nh h??ng ?? ng??i d?ng duy?t. N?u ?? ???c duy?t r? trong h?i tho?i, kh?ng h?i l?i c?ng thao t?c; xin duy?t ph?n ph?t sinh ngo?i ph?m vi ??.
- ?u ti?n s?a c? m?c ti?u, gi? trang con v? database. T?m theo m? b?n ghi ho?c li?n k?t ngu?n ?? tr?nh tr?ng; kh?ng ghi l?i khi n?i dung kh?ng ??i.
- Ch? t?c v? ghi b?t ??ng b? ho?n t?t tr??c thao t?c ph? thu?c. N?u k?t qu? kh?ng r?, ??c l?i tr??c khi th? l?i ?? tr?nh ghi tr?ng.
- Sau c?p nh?t, ??c l?i v? ??i chi?u v?i n?i dung d? ki?n; b?o li?n k?t c?c m?c ?? s?a v? nh?ng ph?n ch?a ho?n t?t.
