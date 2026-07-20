# Hướng dẫn sử dụng Medstand AI — Pilot Read-only

**Dành cho:** Sale/TDV và Manager trong nhóm 13 tài khoản thử nghiệm  
**Môi trường:** frontend local, n8n local và dữ liệu thử nghiệm `medtest`  
**Giới hạn:** chỉ tra cứu và xem trước; không tạo đơn, sửa dữ liệu hoặc tự áp khuyến mãi

Hướng dẫn toàn bộ các màn hình web nằm tại [`HUONG_DAN_SU_DUNG_WEB_MEDSTAND_DAY_DU.md`](HUONG_DAN_SU_DUNG_WEB_MEDSTAND_DAY_DU.md).

## 1. Trước khi bắt đầu

1. Mở trang Medstand local do quản trị viên cung cấp.
2. Đăng nhập bằng đúng tài khoản thử nghiệm của bạn.
3. Nếu vừa đổi tài khoản, nhấn `Ctrl+F5` trước khi test.
4. Chọn **Trợ lý AI** ở menu bên trái.
5. Kiểm tra dòng cảnh báo “Chatbot sử dụng AI và có thể sai sót” nằm dưới ô nhập.

Không chia sẻ mật khẩu, token hoặc dữ liệu bệnh án trong chatbot hay ảnh báo lỗi.

## 2. Quyền xem dữ liệu

| Vai trò | Dữ liệu được xem |
|---|---|
| Sale/TDV | Khách hàng, kho, đơn và báo cáo được ERP cấp cho chính tài khoản |
| Manager | Dữ liệu trong chi nhánh và phạm vi nhân viên trực thuộc |
| Admin | Phạm vi theo quyền quản trị đã cấp; mọi thao tác vẫn được audit |

Nếu nhập khách ngoài phạm vi, hệ thống phải từ chối hoặc báo không có quyền. Hệ thống không được hiển thị tên, lịch sử mua, công nợ hoặc số tiền của khách đó.

## 3. Hai cách dùng chatbot trong đợt UAT này

- **Cách chính thức để lấy dữ liệu:** chọn chức năng trong menu hoặc nhập lệnh `@`. Đây là đường chạy ổn định dùng để nghiệm thu nghiệp vụ.
- **Câu tiếng Việt tự nhiên:** hiện chạy ở chế độ `SHADOW`. Hệ thống chỉ kiểm tra xem đã hiểu đúng ý định hay chưa, không tự lấy dữ liệu nghiệp vụ. Sau thông báo Shadow, người dùng chọn lệnh `@`/menu tương ứng để xem kết quả thật.

Các chức năng cần khách hàng hoặc sản phẩm sẽ mở form tham số. Chọn đủ trường bắt buộc rồi mới gửi. Không đánh giá câu tự nhiên là lỗi chỉ vì nó chưa trả bảng dữ liệu trong đợt Shadow này.

## 4. Việc hôm nay

**Dành cho:** Sale và Manager.  
**Lệnh lấy dữ liệu chính thức:**

```text
@tuyen_ban_hang
```

**Ca kiểm tra Shadow riêng:** nhập `Hôm nay em nên làm gì?`. Kết quả đúng là hệ thống nhận diện chức năng tuyến bán hàng nhưng yêu cầu dùng lệnh `@`/menu; không được tự trả danh sách khách.

**Kết quả mong đợi:**

- Sale chỉ thấy khách của mình; Manager thấy khách trong phạm vi quản lý.
- Tối đa 8 khách theo cấu hình pilot.
- Có lý do như đến kỳ nhập lại theo lịch sử, lâu chưa mua hoặc cần chú ý công nợ.
- Kết quả là danh sách ưu tiên, không phải tuyến đường đã tối ưu và không khẳng định khách chắc chắn sẽ mua.

**Không có dữ liệu:** kiểm tra ngày, phạm vi khách và lịch sử mua; không tự đổi sang mã khách ngoài quyền.

## 5. Gợi ý đơn hàng theo khách

**Dành cho:** Sale và Manager có quyền xem khách.  
**Cách chạy:** nhập lệnh rồi chọn khách trong form:

```text
@goi_ydon_hang
```

**Kết quả mong đợi:**

- Hiện đúng mã/tên khách hàng.
- Có sản phẩm gợi ý và lý do gợi ý.
- Khách có từ 3 hóa đơn hợp lệ mới được tính chu kỳ cá nhân.
- Khách dưới 3 hóa đơn phải hiện trạng thái chưa đủ lịch sử; không bị gán chu kỳ 30 ngày.
- Sản phẩm đã mua trong ngày bị loại theo rule pilot.
- Không tự tạo đơn thật.

Nếu muốn chuẩn bị đơn, chỉ dùng chức năng **Xem trước giỏ hàng**. Sau khi đóng giỏ, ERP không được phát sinh chứng từ mới.

## 6. Gợi ý bán kèm theo khách

**Dành cho:** Sale và Manager có quyền xem khách.  
**Cách chạy:** nhập lệnh rồi chọn khách trong form:

```text
@upsell_goi_y
```

**Kết quả mong đợi:**

- Bắt buộc phải chọn khách hàng.
- Không chọn khách thì hệ thống yêu cầu bổ sung, không trả danh sách sản phẩm chung.
- Kết quả gắn với khách vừa chọn và không giữ mã khách của lần trước.
- Chỉ hiện sản phẩm có tồn bán tham khảo dương trong phạm vi kho của tài khoản.
- Danh sách là gợi ý bán hàng, không phải tư vấn điều trị.

## 7. Công nợ khách hàng

**Lệnh tổng hợp:**

```text
@cong_no_khach_hang
```

**Lệnh chi tiết:** nhập lệnh rồi chọn khách/ngày trong form:

```text
@cong_no_chi_tiet
```

**Kết quả mong đợi:**

- Tổng hợp chỉ chứa khách thuộc phạm vi tài khoản.
- Chi tiết có đúng mã/tên khách, ngày chốt, chứng từ và số tiền còn lại.
- Khoản đã trả một phần hiện **Thanh toán một phần**.
- Chưa xác định ngày đến hạn không được tự coi là quá hạn.
- Không phát sinh công nợ phải được giải thích rõ, không hiển thị như lỗi hệ thống.

Số liệu dùng để hỗ trợ theo dõi; công thức kế toán cuối cùng vẫn cần Finance xác nhận trước production.

## 8. Tồn kho

**Lệnh:**

```text
@danh_sach_tonkho
```

**Cách hiểu đúng:**

- Số hiển thị là **tồn bán tham khảo theo dữ liệu kho/lô/hạn dùng hiện có**.
- Dòng hết hạn hoặc tồn âm phải cho giá trị bán tham khảo bằng `0`.
- Sale chỉ thấy kho được cấp; Manager chỉ thấy kho của mình và nhân viên trực thuộc.
- Reservation và blocked stock đang chờ ERP Warehouse xác nhận.

Không dùng số này để cam kết giao hàng cho khách nếu chưa đối chiếu ERP tại thời điểm chốt đơn.

## 9. Tier và Risk

**Lệnh:**

```text
@cham_diem_kh
```

**Cách đọc:**

- Tier A/B/C phản ánh giá trị và tần suất mua trong rule pilot.
- Risk phản ánh nguy cơ cần chú ý, trong đó thời gian không mua gần đây là một tín hiệu.
- Một khách Tier A vẫn có thể Risk HIGH; hai nhãn không thay thế nhau.
- Khách mới hoặc thiếu lịch sử phải được ghi rõ, không tự gắn nhãn xấu.

Ngưỡng chính thức theo miền vẫn chờ chủ nghiệp vụ xác nhận.

## 10. Khuyến mãi

| Vai trò | Nội dung được xem |
|---|---|
| Sale | Chỉ chương trình công ty đã được nguồn ERP chứng minh là được duyệt và còn hiệu lực |
| Manager/Admin | Có thể xem danh sách sản phẩm cần xem xét khuyến mãi và lý do; không phải quyết định giảm giá |

AI không tự tạo phần trăm giảm, không tự áp giá và không phát hành chương trình.

## 11. Catalogue và tra cứu sản phẩm

**Cách chạy:** nhập lệnh rồi điền mã/tên sản phẩm trong form:

```text
@tra_cuu_san_pham
```

API đã trả dữ liệu trong pilot. Hình ảnh, tên dài, mobile, responsive và nội dung catalogue vẫn cần visual/business UAT. Nếu hình ảnh hoặc bố cục sai, chụp toàn màn hình và ghi rõ thiết bị/trình duyệt.

## 12. Nội dung triệu chứng và chuyên môn

Luồng kỹ thuật có thể nhận câu hỏi và trả kết quả tham khảo, nhưng **chưa được nghiệm thu chuyên môn**. Không dùng để:

- Chẩn đoán.
- Kê đơn hoặc thay thuốc.
- Xử lý trẻ em, thai kỳ, dị ứng hoặc dấu hiệu nguy hiểm mà không có người chuyên môn.

Nếu câu hỏi có yếu tố chuyên môn, người dùng phải kiểm tra lại với người có thẩm quyền. Đây chưa phải chức năng production.

## 13. Danh mục lệnh read-only

| Nhóm | Lệnh |
|---|---|
| Bán hàng | `@doanh_so`, `@hoa_don`, `@hoa_don_chi_tiet`, `@don_hang` |
| Khách hàng | `@cong_no_khach_hang`, `@cong_no_chi_tiet`, `@tich_luy`, `@cham_diem_kh` |
| Gợi ý/tuyến | `@tuyen_ban_hang`, `@goi_ydon_hang`, `@upsell_goi_y` |
| Sản phẩm/kho | `@danh_sach_tonkho`, `@tra_cuu_san_pham`, `@goi_ydon_thuoc`, `@san_pham_trong_tam`, `@de_xuat_khuyen_mai`, `@tim_san_pham_theo_trieu_chung` |
| Danh mục/khảo sát/thông báo | `@danh_muc`, `@danh_sach_cau_hoi_khao_sat`, `@khao_sat360`, `@kiem_tra_khao_sat`, `@kiem_tra_khao_sat_ngay`, `@lich_su_khao_sat`, `@thong_bao` |

Chỉ các lệnh đã có bằng chứng đúng vai trò/đúng chi nhánh mới được đưa vào UAT khách hàng. Audit đầy đủ 24 API vẫn là P0 trước khi mở rộng pilot.

## 14. Trạng thái và cách xử lý

| Hiển thị | Ý nghĩa | Cách xử lý |
|---|---|---|
| Có kết quả | Yêu cầu chạy thành công | Kiểm tra ngày, khách và phạm vi trước khi sử dụng |
| Không có dữ liệu | Không có bản ghi phù hợp | Kiểm tra tham số; không coi là lỗi hệ thống |
| Thiếu hoặc sai tham số | Chưa chọn đủ khách/sản phẩm/ngày | Bổ sung trường được yêu cầu rồi gửi lại |
| Ngoài phạm vi | Tài khoản không có quyền xem | Dừng; không thử vượt quyền bằng mã khác |
| Lỗi hệ thống | Luồng xử lý gặp lỗi | Báo quản trị viên kèm thời gian, câu hỏi và request ID nếu có |

## 15. Cách báo lỗi

Gửi cho đội hỗ trợ:

- Tài khoản và vai trò, không gửi mật khẩu.
- Thời gian xảy ra lỗi.
- Câu hỏi/lệnh đã nhập.
- Mã khách hoặc sản phẩm dùng để test.
- Kết quả thực tế và kết quả bạn mong đợi.
- Ảnh chụp toàn màn hình và request ID nếu có.

Bộ bàn giao và câu lệnh copy/paste dùng cho doanh nghiệp nằm tại [`BAN_GIAO_UAT_DOANH_NGHIEP_20260719.md`](BAN_GIAO_UAT_DOANH_NGHIEP_20260719.md).
