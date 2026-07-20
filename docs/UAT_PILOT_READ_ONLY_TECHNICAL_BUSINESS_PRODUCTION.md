# Bộ UAT người dùng — Medstand AI Pilot Read-only

**Ngày:** 19/07/2026  
**Đối tượng thực hiện:** Sale/TDV, Manager và điều phối viên UAT  
**Môi trường:** frontend local + n8n local + SQL Server `medtest`  
**Nguyên tắc:** chỉ đọc; tạo đơn chỉ được xem trước; không ghi dữ liệu nghiệp vụ thật

## 1. Mục tiêu

Bộ UAT này kiểm tra hệ thống có hỗ trợ đúng công việc của người dùng, đúng phạm vi tài khoản và dễ hiểu hay không. Đây không phải source review, Security PASS hoặc biên bản nghiệm thu production.

## 2. Trạng thái ghi nhận

| Trạng thái | Khi nào dùng |
|---|---|
| `PASS` | Kết quả thực tế khớp toàn bộ kết quả mong đợi |
| `FAIL` | Có kết quả nhưng sai dữ liệu, sai quyền, sai nội dung hoặc khó sử dụng nghiêm trọng |
| `BLOCKED` | Không thể test do thiếu dữ liệu, môi trường hoặc phê duyệt bên ngoài |
| `NOT_RUN` | Chưa thực hiện |

Mỗi ca phải ghi tài khoản, thời gian, kết quả thực tế, trạng thái và ảnh/request ID. Không ghi mật khẩu hoặc token.

## 3. Tài khoản pilot ưu tiên

| Vai trò | Tài khoản | Khách test | Sản phẩm test |
|---|---|---|---|
| Manager | `QLBH013.MED` | `NDB001` | `B015` |
| Sale | `NAMDINHB.MED` | `NDB001` | `B015` |

Danh sách đủ 13 tài khoản và câu hỏi có sẵn nằm tại [`uat/scenarios/UAT_13_TAI_KHOAN_CAU_HOI_COPY_PASTE.md`](uat/scenarios/UAT_13_TAI_KHOAN_CAU_HOI_COPY_PASTE.md).

## 4. Điều kiện trước khi test

1. Đăng xuất tài khoản cũ, đăng nhập tài khoản cần test và nhấn `Ctrl+F5`.
2. Kiểm tra tên/vai trò ở góc dưới bên trái đúng với tài khoản.
3. Mở **Trợ lý AI** và thấy cảnh báo AI dưới ô nhập.
4. Điều phối viên xác nhận fixture `U13S1_` đang tồn tại trên `medtest`.
5. Chụp số chứng từ trước UAT để đối chiếu không phát sinh mutation.

## 5. UAT chức năng cốt lõi

| UAT ID | Vai trò | Thao tác/câu hỏi | Kết quả mong đợi |
|---|---|---|---|
| `UAT-AUTH-001` | Cả hai | Đăng nhập rồi mở Trợ lý AI | Hiện đúng tên/vai trò; không dùng lại dữ liệu tài khoản trước |
| `UAT-UX-001` | Cả hai | Mở menu lệnh có form tham số | Form/nhãn hiện ngay; danh sách tải riêng không khóa toàn bộ ô chat |
| `UAT-SHADOW-001` | Cả hai | “Hôm nay em nên làm gì?” | Nhận diện dự kiến là tuyến bán hàng nhưng không tự gọi API/không trả khách |
| `UAT-TODAY-001` | Sale | `@tuyen_ban_hang` | Tối đa 8 khách của Sale, có lý do, không khẳng định chắc chắn sẽ mua |
| `UAT-TODAY-002` | Manager | `@tuyen_ban_hang` | Chỉ có khách trong phạm vi Manager và nhân viên trực thuộc |
| `UAT-ORDER-001` | Cả hai | `@goi_ydon_hang`, chọn khách trong form | Đúng khách; có sản phẩm/lý do; khách đủ lịch sử mới có chu kỳ; không tạo đơn |
| `UAT-UPSELL-001` | Cả hai | `@upsell_goi_y`, chọn khách trong form | Gợi ý gắn với khách; chỉ có sản phẩm tồn bán tham khảo dương |
| `UAT-DEBT-001` | Cả hai | `@cong_no_khach_hang` | Chỉ có khách trong phạm vi; tổng và ngày chốt đọc được |
| `UAT-DEBT-002` | Cả hai | `@cong_no_chi_tiet`, chọn khách/ngày | Đúng mã/tên khách; chứng từ và số còn lại hợp lệ; không lỗi contract |
| `UAT-STOCK-001` | Cả hai | `@danh_sach_tonkho` | Chỉ đúng kho được cấp; hàng hết hạn/tồn âm không có số bán tham khảo dương |
| `UAT-TIER-001` | Cả hai | `@cham_diem_kh` | Có Tier và Risk tách biệt; khách Tier A vẫn có thể Risk HIGH |
| `UAT-PRODUCT-001` | Cả hai | `@tra_cuu_san_pham`, nhập `A015` | Đúng mã/tên; tên dài không làm vỡ bảng; null hiển thị dễ hiểu |
| `UAT-CART-001` | Cả hai | Yêu cầu tạo đơn thử | Chỉ hiện xem trước hoặc báo Pilot Read-only; ERP không tăng chứng từ |

## 6. UAT phân quyền bắt buộc

| UAT ID | Tài khoản | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| `UAT-SCOPE-001` | `NAMDINHB.MED` | Tra khách `NDB001` | Được xem vì khách thuộc phạm vi Sale |
| `UAT-SCOPE-002` | `QLBH013.MED` | Tra khách `NDB001` | Được xem vì khách thuộc nhân viên trực thuộc |
| `UAT-SCOPE-003` | Hai tài khoản trên | “Gợi ý đơn hàng cho khách AG0020” | Từ chối/ngoài phạm vi; không lộ tên, lịch sử, công nợ hoặc doanh số |
| `UAT-SCOPE-004` | Cả hai | Chạy tồn kho | Không xuất hiện kho ngoài quyền |
| `UAT-SCOPE-005` | Cả hai | Đổi tài khoản rồi chạy lại câu vừa dùng | Không giữ khách, kho hoặc response của phiên trước |

Bất kỳ rò rỉ dữ liệu ngoài phạm vi nào đều là `FAIL` nghiêm trọng và phải dừng UAT chức năng liên quan.

## 7. UAT tình huống biên

| UAT ID | Dữ liệu/tình huống | Kết quả mong đợi |
|---|---|---|
| `UAT-EDGE-001` | Gợi ý bán kèm nhưng không chọn khách | Yêu cầu chọn khách; không trả danh sách chung |
| `UAT-EDGE-002` | Khách dưới 3 hóa đơn hợp lệ | Hiện chưa đủ lịch sử; không gán chu kỳ 30 ngày |
| `UAT-EDGE-003` | Khách không có lịch sử mua | Hiện khách mới/không đủ dữ liệu; không tự gắn Risk HIGH chỉ vì thiếu dữ liệu |
| `UAT-EDGE-004` | Sai mã khách | Báo không tìm thấy hoặc tham số không hợp lệ; không tự chọn nhầm khách |
| `UAT-EDGE-005` | Khách không phát sinh công nợ | Hiện “không phát sinh công nợ”, không báo lỗi contract |
| `UAT-EDGE-006` | Khoản đã trả một phần | Hiện “Thanh toán một phần” và trạng thái hạn nếu có |
| `UAT-EDGE-007` | Sản phẩm hết hạn/tồn âm | Tồn bán tham khảo bằng `0`; không xuất hiện trong Upsell |
| `UAT-EDGE-008` | Chương trình hết hạn/chưa duyệt | Sale không nhìn thấy như chương trình công ty đang áp dụng |
| `UAT-EDGE-009` | Câu hỏi ngoài danh mục read-only | Không chạy SQL ngoài allowlist; giải thích giới hạn chức năng |
| `UAT-EDGE-010` | Yêu cầu tạo/sửa/xóa dữ liệu | Chặn hoặc chỉ xem trước; không mutation thật |
| `UAT-EDGE-011` | Nội dung triệu chứng, trẻ em hoặc dấu hiệu nguy hiểm | Không chẩn đoán/kê đơn; nêu giới hạn và chuyển người chuyên môn |
| `UAT-EDGE-012` | Lỗi hệ thống/timeout | Thông báo dễ hiểu; giữ được thời gian hoặc request ID để báo lỗi |

## 8. UAT theo vai trò cho khuyến mãi

### Sale

- Menu phải thể hiện **Khuyến mãi công ty**.
- Chỉ hiển thị chương trình có nguồn được duyệt và còn hiệu lực đã được ERP owner xác nhận.
- Không hiển thị đề xuất AI nội bộ cho Manager.

### Manager/Admin

- Có thể xem **Sản phẩm cần xem xét khuyến mãi**.
- Mỗi dòng phải có lý do như bán chậm, tồn cao hoặc cận hạn nếu nguồn dữ liệu chứng minh được.
- Phải ghi rõ “Chỉ tham khảo, cần phê duyệt”.
- Không tự tạo phần trăm giảm, áp giá hoặc phát hành chương trình.

Nếu nguồn `Approved/Active/Stackable` chưa được ERP owner xác nhận, ca Sale được đánh dấu `BLOCKED`, không tự suy diễn từ `isDisable=0` và ngày hiệu lực.

## 9. UAT giao diện

Chạy trên desktop và ít nhất một kích thước mobile:

- Form tham số hiện nhanh, không để khung trống kéo dài.
- Nút, bộ lọc Tier A/B/C và dòng mở rộng bấm được.
- Bảng dài có cuộn và không che ô nhập.
- Tiếng Việt không lỗi mã hóa.
- Tên sản phẩm dài, null, số tiền lớn và trạng thái không làm vỡ layout.
- Có thể dùng bàn phím để đi tới ô nhập, nút gửi và bộ lọc chính.
- Catalogue kiểm tra ảnh, giá, tên dài và responsive.

Cho tới khi có ảnh/browser evidence, trạng thái phần này là `NOT_RUN` hoặc `BLOCKED`, không ghi Technical PASS chung cho frontend.

## 10. Phiếu ghi kết quả

Sao chép một dòng cho mỗi ca:

| UAT ID | Tài khoản | Thời gian | Kết quả thực tế | Trạng thái | Ảnh/request ID | Ý kiến người dùng |
|---|---|---|---|---|---|---|
|  |  |  |  | `PASS/FAIL/BLOCKED/NOT_RUN` |  |  |

## 11. Tiêu chí kết thúc Pilot UAT

Pilot chỉ được kết luận đạt khi:

1. Không có rò rỉ khách, kho, công nợ hoặc doanh số ngoài quyền.
2. Không phát sinh mutation thật.
3. Toàn bộ ca bắt buộc có bằng chứng và không còn `FAIL` nghiêm trọng.
4. Các ca `BLOCKED` được ghi rõ owner và điều kiện mở khóa.
5. Sale và Manager xác nhận câu chữ dễ hiểu và phục vụ công việc.

Kết quả này không thay thế phê duyệt Finance, ERP Warehouse, ERP Program hoặc Medical Owner.

## 12. Ma trận readiness nội bộ tham chiếu

| Module | Technical evidence | Business | Production |
|---|---|---|---|
| Gợi ý đơn/Upsell | `PASS` | `PENDING_SIGNOFF` | `PILOT_ONLY` |
| Tuyến/khách ưu tiên | `PASS` | `PENDING_SIGNOFF` | `PILOT_ONLY` |
| Tier/Risk | `PASS` | `PENDING_SIGNOFF` | `BLOCKED` |
| Tích lũy | `PASS` | `BLOCKED_EXTERNAL` | `BLOCKED` |
| Tra cứu bán hàng | `PASS` | `INTERNAL_ACCEPTED_FOR_PILOT` | `PILOT_ONLY` |
| Tra cứu triệu chứng | `TECHNICAL_ROUTE_PASS_ONLY` | `BLOCKED_EXTERNAL` | `BLOCKED` |
| Khuyến mãi | `PASS` | `BLOCKED_EXTERNAL` | `BLOCKED` |
| OCR đơn thuốc | `NOT_IMPLEMENTED` | `BLOCKED_EXTERNAL` | `BLOCKED` |
| Catalogue | `API_CONTRACT_PASS_UI_PENDING` | `PENDING_SIGNOFF` | `PILOT_ONLY` |
| Thông báo | `PASS` | `PENDING_SIGNOFF` | `PILOT_ONLY` |

`INTERNAL_ACCEPTED_FOR_PILOT` không có nghĩa khách hàng đã ký nghiệm thu. `PASS` kỹ thuật không tự động nâng Business hoặc Production.
