# Danh sách lỗi từ file TestLoiAI Medstand.xlsx

## Lỗi 1: Chatbot không nhận diện được thông tin định danh/vai trò  của tài khoản đang đăng nhập
- **Vị trí xảy ra:** Cửa sổ Chatbot UI.
- **Tài khoản test:** QLBH013.MED
- **Các bước thực hiện:**
  1.Đăng nhập vào hệ thống (bằng tài khoản nào, ví dụ: QLBH013.MED)
  2.Nhập câu hỏi kiểm tra danh tính: "Vai trò của tôi trên hệ thống là gì?"
- **Kết quả thực tế:** AI phản hồi bằng câu thoại chung chung của các mô hình  chat công cộng: "Xin vui lòng cung cấp thêm thông tin để tôi có thể hỗ trợ bạn tốt hơn."
- **Kết quả mong muốn:** AI phải tự động đọc được dữ liệu phiên đăng nhập và trả lời :  ", bạn là [Tên Người Dùng], đang đăng nhập với vai trò [Quản lý/Trình dược viên] thuộc [Chi nhánh]".

---

## Lỗi 2: Lệnh nhanh @tuyen_ban_hang không tự động nhận diện tuyến bán  hàng của User, Chatbot yêu cầu cung cấp thêm thông tin.
- **Vị trí xảy ra:** Cửa sổ Chatbot UI.
- **Tài khoản test:** QLBH013.MED
- **Các bước thực hiện:**
  1.Đăng nhập hệ thống
  2. Mở khung chat, gõ lệnh nhanh hoặc chọn phím tắt @tuyen_ban_hang và nhấn gửi.
- **Kết quả thực tế:** Chatbot không trả về lịch trình mà hiển thị  câu thông báo: "Vui lòng cung cấp thêm thông tin".
- **Kết quả mong muốn:** Hệ thống phải tự động lấy dữ liệu  trình dược viên từ phiên đăng nhập hiện tại để hiển thị ngay:  Lịch trình chi tiết và danh sách các nhà thuốc cần viếng thăm trong ngày hôm nay của chính nhân viên đó.

---

## Lỗi 3: Lỗi giao diện form "Thêm khách hàng" bị  thanh Header phía sau đè lên
- **Vị trí xảy ra:** Form thêm khách hàng
- **Tài khoản test:** Bất kỳ tài khoản nào
- **Các bước thực hiện:**
  1.Đăng nhập vào hệ thống
  2.truy cập vào tài khoảng --> chọn quản lý khách hàng
  3. nhấn vào dấu "+" thêm khách hàng
- **Kết quả thực tế:** Thanh Top Header của trang chính (chứa dòng chữ " Quản lý khách hàng" và cụm icon) đèn lên 1 phần của form thêm khách hàng
- **Kết quả mong muốn:** Không có

---

## Lỗi 4: Lệnh @tra_cuu_san_pham trả về bảng dữ liệu tồn kho  thay vì thông tin chi tiết sản phẩm, không tìm thấy sản phẩm mẫu.
- **Vị trí xảy ra:** Khung Chatbot UI.
- **Tài khoản test:** QLBH013.MED
- **Các bước thực hiện:**
  1.Mở khung chat, gõ lệnh @tra_cuu_san_pham.
  2.Nhập câu lệnh: "Thông tin chi tiết sản phẩm Argelomag".
- **Kết quả thực tế:** AI trả về một bảng dữ liệu dạng lưới gồm các cột:  STT, Mã SP, Sản phẩm, Đơn giá, Tồn kho. Trả về kết quả "Không tìm thấy sản phẩm" đối với từ khóa "Argelomag".
- **Kết quả mong muốn:** AI phải hiển thị thông tin dưới dạng văn bản đọc hiểu (Text format),  bao gồm các nội dung chuyên môn: Công dụng, thành phần, cách dùng, giá bán.

---

## Lỗi 5: Tính năng @goi_y_don_hang bị lỗi bảo mật phân quyền RLS,  cho phép xem dữ liệu khách hàng của chi nhánh khác.
- **Vị trí xảy ra:** Khung Chatbot UI.
- **Tài khoản test:** NAMDINHB.MED
- **Các bước thực hiện:**
  1.Đăng nhập bằng tài khoản miền Bắc: NAMDINHB.MED (Đoàn Văn Thế).
  2.Tại khung chat, nhập lệnh tra cứu dữ liệu của khách hàng miền Trung (Mã: HUEB111): @goi_y_don_hang Gợi ý đơn hàng cho HUEB111
- **Kết quả thực tế:** Chatbot không chặn quyền truy cập, vẫn tự động tính toán và trả về danh sách 10 sản phẩm gợi ý kèm trạng thái mua hàng thực tế của Nhà Thuốc Lê Hùng 2 (Vùng Trung) cho tài khoản Vùng Bắc xem
- **Kết quả mong muốn:** Hệ thống phải thực hiện đối chiếu mã chi nhánh của User và mã chi nhánh của Khách hàng. Nếu không trùng khớp, hệ thống phải lập tức chặn lại và đưa ra cảnh báo: "Bạn không có quyền xem thông tin của khách hàng thuộc chi nhánh khác".

---

## Lỗi 6: Lệnh nhanh @bao_cao_cuoi_ngay không tự động tổng hợp số liệu,  Chatbot yêu cầu cung cấp thêm thông tin.
- **Vị trí xảy ra:** Khung Chatbot UI.
- **Tài khoản test:** NAMDINHB.MED
- **Các bước thực hiện:**
  1.Giữ phiên đăng nhập của tài khoản trình dược viên.
  2.Gõ lệnh nhanh @bao_cao_cuoi_ngay và nhấn gửi.
- **Kết quả thực tế:** Chatbot không trả về bảng tổng hợp kết quả đơn hàng  mà hiển thị câu thông báo: "Xin vui lòng cung cấp thông tin cụ thể hơn để tôi có thể hỗ trợ.".
- **Kết quả mong muốn:** Hệ thống phải tự động bốc dữ liệu từ ID tài khoản hiện tại để hiển thị bảng tóm tắt kết quả trong ngày (Số nhà thuốc đã đi, số đơn thành công, tổng doanh số tạm tính).

---

## Lỗi Bổ sung: 
- **Vị trí xảy ra:** Không có
- **Tài khoản test:** Bất kỳ
- **Các bước thực hiện:**
Không có
- **Kết quả thực tế:** Không có
- **Kết quả mong muốn:** Không có

---

## Lỗi 7: Lệnh nhanh phím tắt @tich_luy  không tự động nhận diện bối cảnh
- **Vị trí xảy ra:** Khung Chatbot UI.
- **Tài khoản test:** NAMDINHB.MED
- **Các bước thực hiện:**
  Gõ lệnh nhanh @tich_luy trên khung chat
- **Kết quả thực tế:** Chatbot không xử lý nghiệp vụ mà hiển thị câu thông báo yêu cầu cung cấp thêm thông tin. (Trong khi nhập câu chat thực tế kèm mã khách hàng như: "Xem điểm tích lũy của HPA515" thì hệ thống lại trả về kết quả thành công)
- **Kết quả mong muốn:** Hệ thống phải tự động hiển thị danh sách/form hoặc giữ ngữ cảnh để người dùng chọn nhanh nhà thuốc, thay vì đưa ra câu thoại mặc định từ chối hiểu của AI công cộng Hệ thống phải tự lấy dữ liệu đơn hàng của User để liệt kê danh sách

---

## Lỗi 8: Lỗi lệnh @upsell_goi_y
- **Vị trí xảy ra:** Khung Chatbot UI.
- **Tài khoản test:** NAMDINHB.MED
- **Các bước thực hiện:**
  Gõ lệnh nhanh @upsell_goi_y trên khung chat.
- **Kết quả thực tế:** Chatbot báo lỗi yêu cầu cung cấp thêm thông  tin thay vì hỏi đích danh tên nhà thuốc cần xem gợi ý bán kèm
- **Kết quả mong muốn:** Đề xuất các sản phẩm mua cùng combo hoặc yêu cầu  nhập mã khách hàng một cách rõ ràng

---

## Lỗi 9: Tính năng @danh_sach_cau_hoi_khao_sat chưa được cấu hình,  Chatbot không nhận diện được luồng nghiệp vụ khảo sát.
- **Vị trí xảy ra:** Khung Chatbot UI.
- **Tài khoản test:** NAMDINHB.MED
- **Các bước thực hiện:**
  1. Mở khung chat
  2. gõ lệnh phím tắt nhanh @danh_sach_cau_hoi_khao_sat
  3.Thử nghiệm cách 2: Nhập câu lệnh trực tiếp bằng ngôn ngữ tự nhiên: Bắt đầu bài khảo sát cho HPA515
- **Kết quả thực tế:** Chatbot không gọi ra bộ câu hỏi mà trả về câu thoại hệ thống mặc định: "Dạ, anh/chị có thể nói rõ hơn cần tra cứu thông tin gì không ạ".
- **Kết quả mong muốn:** Hệ thống phải nhận diện được yêu cầu khảo sát của mã khách hàng HPA515 và tải lên bộ câu hỏi khảo sát độ hài lòng tại điểm bán.

---

## Lỗi 10: Tính năng Sản phẩm trọng tâm tháng  (@san_pham_trong_tam) chưa được phát triển
- **Vị trí xảy ra:** Khung Chatbot UI.
- **Tài khoản test:** NAMDINHB.MED
- **Các bước thực hiện:**
  1. Mở khung chat, gõ lệnh nhanh phím tắt @san_pham_trong_tam và nhấn gửi. 2. Thử nghiệm cách 2 bằng cách nhập câu chat thực tế: "Các sản phẩm trọng tâm tháng này là gì?" và nhấn gửi.
- **Kết quả thực tế:** Cả 2 cách đều thất bại. Hệ thống không trả về danh sách hàng hóa mà hiển thị thông báo lỗi mặc định: "Xin lỗi, tôi không thể thực hiện yêu cầu này. Bạn có thể cung cấp thêm thông tin hoặc đặt câu hỏi khác không?" kèm theo các nút bấm bị lỗi hiển thị template [ Câu hỏi 1 ], [ Câu hỏi 2 ], [ Câu hỏi 3 ].
- **Kết quả mong muốn:** Chatbot phải truy xuất và hiển thị danh sách các sản phẩm mục tiêu được Ban giám đốc ưu tiên thúc đẩy bán hàng trong tháng. Các nút bấm gợi ý (nếu có) phải chứa câu hỏi thực tế thay vì text mẫu

---

