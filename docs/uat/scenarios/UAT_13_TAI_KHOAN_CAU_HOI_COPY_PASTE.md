# Kịch bản UAT 13 tài khoản — câu hỏi copy/paste

> **Đã thay thế:** dùng tài liệu [`../../BAN_GIAO_UAT_DOANH_NGHIEP_20260719.md`](../../BAN_GIAO_UAT_DOANH_NGHIEP_20260719.md). Phần bên dưới được giữ làm lịch sử fixture; các câu tự nhiên cũ không còn là đường lấy dữ liệu trong chế độ Shadow.

**Ngày dữ liệu:** 19/07/2026  
**Môi trường:** local frontend + n8n local + SQL Server `medtest`  
**Nguyên tắc:** chỉ đọc; tạo đơn chỉ được xem trước; không ghi dữ liệu nghiệp vụ thật.

## 1. Cách test nhanh cho mỗi tài khoản

1. Đăng xuất tài khoản cũ, đăng nhập đúng tài khoản cần test và nhấn `Ctrl+F5`.
2. Mở **Trợ lý AI**.
3. Copy từng câu trong đúng khối tài khoản bên dưới và dán vào chatbot.
4. Sau mỗi câu, kiểm tra kết quả chỉ thuộc khách/kho/nhân viên trong phạm vi tài khoản.
5. Ghi `PASS`, `FAIL` hoặc chụp màn hình nếu kết quả sai.

Trong đợt UAT này, các câu nghiệp vụ chính phải chạy bằng lệnh `@`/menu. Câu **“Hôm nay em nên làm gì?”** chỉ dùng để kiểm tra Shadow:

- Chatbot nhận diện dự kiến là `@tuyen_ban_hang` nhưng không tự gọi API và không trả danh sách khách.
- Sau đó nhập `@tuyen_ban_hang` để lấy tối đa 8 khách ưu tiên thật.
- Sale chỉ thấy khách của mình; Manager thấy phạm vi quản lý.
- Kết quả có lý do nghiệp vụ như sắp đến chu kỳ mua, lâu chưa mua hoặc cần chú ý công nợ; không tự khẳng định chắc chắn khách sẽ mua.
- Không có dữ liệu ngoài phạm vi và không tạo/sửa dữ liệu.

## 2. Bộ câu hỏi theo từng tài khoản

### 1. Manager `QLBH013.MED` — khách `NDB001`, sản phẩm gốc `B015`

```text
Hôm nay em nên làm gì?
@tuyen_ban_hang
@goi_ydon_hang
@upsell_goi_y
@goi_ydon_thuoc
@cong_no_khach_hang
@cong_no_chi_tiet
```

Điền trong form: khách `NDB001`, sản phẩm gốc `B015`, đến ngày hôm nay.

### 2. Sale `NAMDINHB.MED` — khách `NDB001`, sản phẩm gốc `B015`

```text
Hôm nay em nên làm gì?
Gợi ý đơn hàng cho khách NDB001
Gợi ý bán kèm cho khách NDB001
Gợi ý sản phẩm thường mua cùng B015
Xem công nợ khách hàng NDB001 đến hôm nay
Xem chi tiết công nợ khách hàng NDB001 đến hôm nay
```

### 3. Manager `QLBH016.MED` — khách `BNA051`, sản phẩm gốc `B015`

```text
Hôm nay em nên làm gì?
Gợi ý đơn hàng cho khách BNA051
Gợi ý bán kèm cho khách BNA051
Gợi ý sản phẩm thường mua cùng B015
Xem công nợ khách hàng BNA051 đến hôm nay
Xem chi tiết công nợ khách hàng BNA051 đến hôm nay
```

### 4. Sale `BACNINHA.MED` — khách `BNA051`, sản phẩm gốc `B015`

```text
Hôm nay em nên làm gì?
Gợi ý đơn hàng cho khách BNA051
Gợi ý bán kèm cho khách BNA051
Gợi ý sản phẩm thường mua cùng B015
Xem công nợ khách hàng BNA051 đến hôm nay
Xem chi tiết công nợ khách hàng BNA051 đến hôm nay
```

### 5. Manager `QLBH005.MED` — khách `HUEA043`, sản phẩm gốc `Q002`

```text
Hôm nay em nên làm gì?
Gợi ý đơn hàng cho khách HUEA043
Gợi ý bán kèm cho khách HUEA043
Gợi ý sản phẩm thường mua cùng Q002
Xem công nợ khách hàng HUEA043 đến hôm nay
Xem chi tiết công nợ khách hàng HUEA043 đến hôm nay
```

### 6. Sale `HUEB.MED` — khách `HUEA043`, sản phẩm gốc `Q002`

```text
Hôm nay em nên làm gì?
Gợi ý đơn hàng cho khách HUEA043
Gợi ý bán kèm cho khách HUEA043
Gợi ý sản phẩm thường mua cùng Q002
Xem công nợ khách hàng HUEA043 đến hôm nay
Xem chi tiết công nợ khách hàng HUEA043 đến hôm nay
```

### 7. Manager `QLBH010.MED` — khách `QANA002`, sản phẩm gốc `Q002`

```text
Hôm nay em nên làm gì?
Gợi ý đơn hàng cho khách QANA002
Gợi ý bán kèm cho khách QANA002
Gợi ý sản phẩm thường mua cùng Q002
Xem công nợ khách hàng QANA002 đến hôm nay
Xem chi tiết công nợ khách hàng QANA002 đến hôm nay
```

### 8. Sale `DANANGA.MED` — khách `QANA002`, sản phẩm gốc `Q002`

```text
Hôm nay em nên làm gì?
Gợi ý đơn hàng cho khách QANA002
Gợi ý bán kèm cho khách QANA002
Gợi ý sản phẩm thường mua cùng Q002
Xem công nợ khách hàng QANA002 đến hôm nay
Xem chi tiết công nợ khách hàng QANA002 đến hôm nay
```

### 9. Manager `QLMN2` — khách `DL012`, sản phẩm gốc `Q002`

```text
Hôm nay em nên làm gì?
Gợi ý đơn hàng cho khách DL012
Gợi ý bán kèm cho khách DL012
Gợi ý sản phẩm thường mua cùng Q002
Xem công nợ khách hàng DL012 đến hôm nay
Xem chi tiết công nợ khách hàng DL012 đến hôm nay
```

### 10. Sale `CanThoA` — khách `DL012`, sản phẩm gốc `Q002`

```text
Hôm nay em nên làm gì?
Gợi ý đơn hàng cho khách DL012
Gợi ý bán kèm cho khách DL012
Gợi ý sản phẩm thường mua cùng Q002
Xem công nợ khách hàng DL012 đến hôm nay
Xem chi tiết công nợ khách hàng DL012 đến hôm nay
```

### 11. Manager `QLMD1` — khách `SGNB0001`, sản phẩm gốc `Q002`

```text
Hôm nay em nên làm gì?
Gợi ý đơn hàng cho khách SGNB0001
Gợi ý bán kèm cho khách SGNB0001
Gợi ý sản phẩm thường mua cùng Q002
Xem công nợ khách hàng SGNB0001 đến hôm nay
Xem chi tiết công nợ khách hàng SGNB0001 đến hôm nay
```

### 12. Sale `BinhPhuocA` — khách `SGNB0001`, sản phẩm gốc `Q002`

```text
Hôm nay em nên làm gì?
Gợi ý đơn hàng cho khách SGNB0001
Gợi ý bán kèm cho khách SGNB0001
Gợi ý sản phẩm thường mua cùng Q002
Xem công nợ khách hàng SGNB0001 đến hôm nay
Xem chi tiết công nợ khách hàng SGNB0001 đến hôm nay
```

### 13. Manager `QLBH024.MED` — khách `AG0020`, sản phẩm gốc `Q002`

```text
Hôm nay em nên làm gì?
Gợi ý đơn hàng cho khách AG0020
Gợi ý bán kèm cho khách AG0020
Gợi ý sản phẩm thường mua cùng Q002
Xem công nợ khách hàng AG0020 đến hôm nay
Xem chi tiết công nợ khách hàng AG0020 đến hôm nay
```

## 3. Kết quả mong đợi cho dữ liệu mock

| Luồng | Kết quả mong đợi |
|---|---|
| Gợi ý đơn hàng | Có 2 dòng; sản phẩm đã mua trong ngày bị loại khỏi gợi ý |
| Gợi ý bán kèm | Có tối đa 10 dòng; chỉ lấy sản phẩm có số lượng có thể bán dương |
| Sản phẩm thường mua cùng | Có 2–3 dòng và không trả chính sản phẩm gốc |
| Công nợ | Chỉ trả khách thuộc phạm vi; không có thì hiển thị rõ “không phát sinh công nợ” |
| Việc hôm nay | Có tối đa 8 khách ưu tiên từ tuyến bán hàng, đúng phạm vi tài khoản |

## 4. Hai ca bảo mật bắt buộc

Chạy thêm cho mỗi tài khoản:

```text
Gợi ý bán kèm
Gợi ý đơn hàng cho khách AG0020
```

- Câu thứ nhất phải yêu cầu chọn khách, không trả danh sách chung.
- Câu thứ hai chỉ PASS với `QLBH024.MED`. Tài khoản khác phải trả từ chối/ngoài phạm vi hoặc không có dữ liệu, tuyệt đối không lộ tên, lịch sử mua hay số tiền.

## 5. Ca chỉ xem trước, không ghi thật

```text
Tạo đơn hàng mới cho khách test
```

Kết quả phải là giỏ **xem trước** hoặc thông báo pilot chỉ đọc. Sau khi test, số chứng từ ERP không được tăng do chatbot.

## 6. Hoàn tác dữ liệu mock

```powershell
node scripts/rollback_uat13_suggestion_fixture_medtest.js
node scripts/rollback_uat13_suggestion_fixture_medtest.js --apply
```

Lệnh đầu chỉ xem trước số dòng; lệnh sau chỉ xóa batch `U13S1_` có marker `[UAT13-SUG-V1]`.
