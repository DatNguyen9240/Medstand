# Kết quả UAT tự động ngày 13/07/2026

## Phạm vi đã chạy

- Môi trường: `http://localhost:3000`
- Hình thức: smoke test chỉ đọc, không tạo đơn/khách hàng và không nộp khảo sát.
- Tài khoản đã chạy: `QLBH013.MED`, `NAMDINHB.MED`.
- Tài khoản chưa chạy: 11 tài khoản còn lại do lỗi đăng xuất chặn việc chuyển tài khoản trong cùng phiên.

## Tổng hợp

| Test case | Tài khoản | Kết quả | Ghi nhận |
|---|---|---|---|
| UAT-01 Đăng nhập | `QLBH013.MED` | Đạt một phần | Đăng nhập thành công, hiển thị “Mai Anh Tuấn”. |
| UAT-01 Vai trò | `QLBH013.MED` | Không đạt/cần xác nhận | Hệ thống hiển thị “Trình dược viên” trong khi tài khoản nằm trong cột QLBH/Manager của danh sách UAT. |
| UAT-03 Đăng xuất | `QLBH013.MED` | Đạt | Trở về màn hình đăng nhập. |
| UAT-01 Đăng nhập | `NAMDINHB.MED` | Đạt | Đăng nhập thành công, hiển thị “Đoàn Văn Thế – Trình dược viên”. |
| UAT-03 Đăng xuất | `NAMDINHB.MED` | Không đạt | Bấm Đăng xuất nhiều lần nhưng vẫn ở trang chủ và vẫn xem được dữ liệu. |
| UAT-16 Tuyến | `NAMDINHB.MED` | Đạt một phần | Màn hình Tuyến tải thành công, có Danh sách/Bản đồ/Bộ lọc và không hiển thị lỗi kỹ thuật. |
| UAT-09 Đơn hàng | `NAMDINHB.MED` | Đạt một phần | Màn hình tải thành công, chưa đối chiếu được chi tiết dữ liệu. |
| UAT-10 Tạo đơn | `NAMDINHB.MED` | Đạt một phần | Form có Ngày chứng từ, Chi nhánh, Khách hàng, Phường/xã, Tuyến, Sản phẩm, Lưu nháp và Tạo đơn. Không gửi dữ liệu thật. |
| UAT-08 Doanh số | `NAMDINHB.MED` | Đạt một phần | Màn hình tải thành công, có bộ lọc Theo nhân viên/Theo khách hàng. |
| UAT-17 Khảo sát | `NAMDINHB.MED` | Không đạt về UX | Màn hình tải được trạng thái Đang làm/Đã hoàn thành, nhưng hiển thị toàn bộ lịch sử rất dài, không có phân trang/giới hạn ban đầu. |

## Lỗi cần ưu tiên

### UAT-BUG-01 — Không đăng xuất được

- Tài khoản: `NAMDINHB.MED`.
- Mức độ: Critical, vì người dùng vẫn xem được dữ liệu sau khi bấm Đăng xuất.
- Tái hiện: bấm nút Đăng xuất nhiều lần; URL vẫn là trang chủ, tên và dữ liệu vẫn hiển thị.
- Mong đợi: trở về trang đăng nhập và không xem lại được dữ liệu.

### UAT-BUG-02 — Tài khoản QLBH hiển thị vai trò Trình dược viên

- Tài khoản: `QLBH013.MED`.
- Mức độ: Major hoặc BLOCKED cho test phân quyền cho đến khi xác nhận mapping vai trò.
- Thực tế: tên hiển thị đúng là Mai Anh Tuấn, vai trò hiển thị là Trình dược viên.
- Mong đợi: hiển thị đúng vai trò nghiệp vụ đã được cấu hình.

### UAT-BUG-03 — Danh sách khảo sát quá dài

- Tài khoản: `NAMDINHB.MED`.
- Mức độ: Major UX/hiệu năng.
- Thực tế: trang hiển thị cùng lúc nhiều bài đang làm và toàn bộ lịch sử hoàn thành từ các tháng trước.
- Mong đợi: mặc định ưu tiên Chưa làm/Đang làm, lịch sử phân trang hoặc tải theo từng trang.

## Các điểm cần đối chiếu thêm

- Trang chủ của `NAMDINHB.MED` hiển thị 14 điểm tuyến, trong khi phần tóm tắt ban đầu của màn hình Tuyến hiển thị `0`; cần chờ trang tải hoàn chỉnh và đối chiếu dữ liệu chuẩn.
- Tài khoản `QLBH013.MED` có thể xem số liệu tổng hợp lớn; cần xác nhận đây là phạm vi Manager hợp lệ hay dữ liệu chưa được lọc.

## Trạng thái đợt chạy

**BLOCKED một phần.** Cần sửa hoặc xác định nguyên nhân lỗi đăng xuất trước khi tự động chạy lần lượt toàn bộ tài khoản trong cùng một phiên trình duyệt.

## Kết quả chạy bổ sung sau bản sửa FE

| Test case | Tài khoản | Kết quả | Ghi nhận |
|---|---|---|---|
| UAT-02 Duy trì phiên | `QLBH013.MED` | Đạt | Tải lại trang chủ vẫn giữ phiên và tải được dữ liệu. |
| UAT-12 Thông báo | `QLBH013.MED` | Không thể kiểm tra đầy đủ | Chuông mở được nhưng tài khoản hiện không có thông báo để kiểm tra đã đọc. |
| UAT-16 Tuyến | `QLBH013.MED` | Đạt một phần | Có danh sách và bản đồ, nhiều điểm tuyến Thứ 2; chưa có bộ chọn nhân viên để kiểm tra team Manager. |
| UAT-09 Đơn hàng | `QLBH013.MED` | Đạt | Danh sách tải 20 bản ghi/trang; mở được chi tiết `DMB0726/5`, mã và ngày khớp danh sách. |
| UAT-09 Hóa đơn | `QLBH013.MED` | Không đạt/cần đối chiếu | Màn hình báo “Không có hóa đơn” dù dữ liệu SQL trước đó đã xác nhận có hóa đơn trong kỳ. |
| UAT-10 Chi nhánh | `QLBH013.MED` | Đạt | Chi nhánh tự khóa đúng `Miền bắc`. |
| UAT-10 Tìm khách hàng | `QLBH013.MED` | Đạt | Tìm và hiển thị được `HPA515 - Quầy Thuốc Thu Thủy`. |
| UAT-10 Gợi ý sản phẩm | `QLBH013.MED` | Không đạt | Tên sản phẩm vẫn kèm chuỗi chính sách/khuyến mãi dài; chưa hiển thị số lượng tồn. |
| Điều hướng popup | `QLBH013.MED` | Không đạt | Popup chọn sản phẩm vẫn còn trong DOM sau khi chuyển sang màn Hóa đơn. |
| UAT-17 Phân trang khảo sát | `QLBH013.MED` | Đạt | 71 bài được chia thành 8 trang, 10 bài/trang. |
| UAT-17 Phân trang khảo sát | `NAMDINHB.MED` | Đạt | 215 bài được chia thành 22 trang, 10 bài/trang. |

### Kết luận bổ sung

- Phân trang khảo sát đã khắc phục.
- Tìm khách hàng và khóa chi nhánh trong form tạo đơn hoạt động.
- Cần ưu tiên sửa gợi ý sản phẩm dài, cleanup popup khi đổi route và API/dữ liệu danh sách hóa đơn.
- Nhãn Manager vẫn phụ thuộc API user-info trả `Manager` hoặc `RoleName`.
