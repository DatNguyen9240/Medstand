# Kế hoạch kiểm thử Medstand AI — 13 tài khoản UAT

**Phạm vi:** dữ liệu UAT trên `medtest`, chỉ đọc và xem trước; không ghi đơn thật, không áp giá thật.

## 1. Tài khoản và phạm vi

| Vai trò | Tài khoản | Miền | Khách đại diện |
|---|---|---|---|
| Quản lý | `QLBH013.MED` | MB | `NDB001` |
| Sale | `NAMDINHB.MED` | MB | `NDB001` |
| Quản lý | `QLBH016.MED` | MB | `BNA051` |
| Sale | `BACNINHA.MED` | MB | `BNA051` |
| Quản lý | `QLBH005.MED` | MT | `HUEA043` |
| Sale | `HUEB.MED` | MT | `HUEA043` |
| Quản lý | `QLBH010.MED` | MT | `QANA002` |
| Sale | `DANANGA.MED` | MT | `QANA002` |
| Quản lý | `QLMN2` | MN | `DL012` |
| Sale | `CanThoA` | MN | `DL012` |
| Quản lý | `QLMD1` | MN | `SGNB0001` |
| Sale | `BinhPhuocA` | MN | `SGNB0001` |
| Quản lý | `QLBH024.MED` | MN | `AG0020` |

Mỗi tài khoản chỉ được thấy khách, nhân viên, kho và doanh số thuộc phạm vi được phân quyền. Không dùng tài khoản Admin để thay thế bài kiểm thử phạm vi.

## 2. Cách chạy

1. Đăng xuất tài khoản trước, đăng nhập đúng tài khoản trong bảng.
2. Mở **Trợ lý AI**, chạy các câu hỏi trong mục 3 theo thứ tự.
3. Chụp kết quả có tên tài khoản, thời gian và mã khách đại diện.
4. Với mỗi câu, ghi `PASS`, `FAIL` hoặc `BLOCKED`, kèm ảnh lỗi nếu có.
5. Đăng xuất và lặp lại cho tài khoản tiếp theo.

Không nhập mật khẩu, token hoặc dữ liệu khách thật vào file ghi nhận UAT.

## 3. Bộ câu hỏi copy-paste

Thay `{MA_KH}` bằng khách đại diện của tài khoản đang test.

### Bộ chung — chạy cho cả 13 tài khoản

```text
Hôm nay tôi nên làm gì?
Hôm nay doanh số của tôi là bao nhiêu?
Doanh số từ 09/07/2026 đến 20/07/2026 của tôi thế nào?
Hôm nay nên ghé khách nào?
Gợi ý đơn hàng cho khách {MA_KH}
Gợi ý bán kèm cho khách {MA_KH}
Khách {MA_KH} đang nợ bao nhiêu?
Chi tiết công nợ khách {MA_KH}
Chấm điểm khách hàng của tôi
Thông tin sản phẩm A003
Tồn kho sản phẩm A003
Sản phẩm trọng tâm tháng này là gì?
Hôm nay tôi nên ưu tiên khách nào?
```

### Câu kiểm tra dữ liệu đến hôm nay

```text
Cho tôi xem doanh số theo ngày từ 09/07/2026 đến hôm nay.
```

Kết quả mong đợi: có dữ liệu từ 09/07 đến 20/07, không rơi về 0 từ ngày 09/07; ngày 20/07 có doanh số dương.

### Chỉ dành cho Quản lý

```text
Sản phẩm nào bán chậm hoặc tồn nhiều cần xem xét khuyến mãi?
Cho tôi danh sách đề xuất khuyến mãi để xem xét.
Xem tổng quan doanh số của đội tôi.
Xem khách hàng nhóm A, B và C của đội tôi.
```

Kết quả mong đợi: Quản lý xem được đề xuất tham khảo và lý do; không có thao tác tự áp khuyến mãi.

### Chỉ dành cho Sale

```text
Cho tôi danh sách khách thuộc tuyến của tôi.
Khách nào lâu chưa mua?
Hôm nay bán gì cho khách {MA_KH}?
```

Kết quả mong đợi: Sale chỉ xem dữ liệu trong tuyến/miền được giao; không xem đề xuất khuyến mãi nội bộ nếu không có quyền.

## 4. Ma trận nghiệm thu

| Nhóm kiểm tra | Quản lý | Sale | Tiêu chí đạt |
|---|---:|---:|---|
| Đăng nhập và nhận diện tài khoản | ✓ | ✓ | Tên/role đúng tài khoản |
| Doanh số theo ngày | ✓ | ✓ | 12 ngày có dữ liệu, ngày hiện tại > 0 |
| Phạm vi miền/khách | ✓ | ✓ | Không thấy dữ liệu ngoài phạm vi |
| Công nợ tổng quan/chi tiết | ✓ | ✓ | Có kết quả hoặc thông báo rõ ràng |
| Gợi ý đơn hàng | ✓ | ✓ | Có sản phẩm hoặc lý do thiếu lịch sử |
| Upsell/bán kèm | ✓ | ✓ | Gắn đúng khách khi truyền mã khách |
| Tồn kho | ✓ | ✓ | Có số ERP; tồn khả dụng tham khảo nếu chưa xác minh |
| Chấm điểm và rủi ro | ✓ | ✓ | Tier, cảnh báo và lý do dễ hiểu |
| Tuyến bán hàng | ✓ | ✓ | Đúng danh sách trong scope |
| Đề xuất khuyến mãi | ✓ | — | Chỉ tham khảo, cần người có thẩm quyền duyệt |
| Câu hỏi tự nhiên | ✓ | ✓ | Có trả lời hoặc hướng dẫn nhập lại, không lỗi kỹ thuật |
| Mutation/đơn thật | Xem trước | Xem trước | Không ghi dữ liệu thật |

## 5. Trường hợp lỗi cần ghi nhận

- `Authenticated identity is not mapped...`: đăng xuất, đăng nhập lại đúng tài khoản; nếu còn lỗi, ghi username và thời điểm.
- `Yêu cầu chứa tham số thiếu...`: kiểm tra câu có mã khách/mã sản phẩm khi API yêu cầu hay chưa.
- `Không tìm thấy dữ liệu`: ghi câu hỏi, tài khoản, mã khách; không tự kết luận DB không có dữ liệu.
- Tồn khả dụng chưa xác minh: không đổi thành 0 và không gọi là hết hàng.
- Khuyến mãi: không coi đề xuất là mức giảm giá đã được duyệt.

## 6. Mẫu ghi nhận kết quả

```text
Tài khoản:
Vai trò/miền:
Thời gian:
Câu hỏi:
Kết quả mong đợi:
Kết quả thực tế:
PASS / FAIL / BLOCKED:
Ảnh hoặc mã lỗi:
```

## 7. Điều kiện hoàn tất Pilot

- 13/13 tài khoản đăng nhập đúng scope.
- Bộ chung không có lỗi hệ thống nghiêm trọng.
- 13/13 tài khoản thấy doanh số đến ngày 20/07/2026.
- Không phát hiện rò rỉ khách/nhân viên/kho khác miền.
- Không có mutation ghi dữ liệu thật.
- Các lỗi còn lại được phân loại: lỗi dữ liệu, lỗi API, lỗi giao diện hoặc yêu cầu nghiệp vụ.

## 8. Thông tin kiểm soát tài liệu

| Thuộc tính | Giá trị |
|---|---|
| Môi trường | `medtest` / frontend local hoặc server Pilot |
| Ngày dữ liệu chốt | 20/07/2026 |
| Số tài khoản | 13 |
| Vai trò | 7 Quản lý, 6 Sale |
| Miền | MB, MT, MN |
| Chế độ | Read-only và preview mutation |
| Bộ API tự nhiên | 24 API trong `config/natural-language/intent-map.v1.json` |
| Dữ liệu doanh số bổ sung | Tiền tố `U13D_`, từ 09/07 đến 20/07 |
| Lịch sử gợi ý bổ sung | Tiền tố `U13S1_` |

Người điều phối phải ghi commit/source version, URL frontend, URL n8n và ngày chạy vào biên bản trước khi bắt đầu.

## 9. Mục tiêu và ngoài phạm vi

### Mục tiêu

- Chứng minh từng tài khoản chỉ thấy dữ liệu được phân quyền.
- Chứng minh biểu đồ doanh số có dữ liệu đến 20/07/2026.
- Kiểm tra UI và câu tự nhiên sử dụng được với các nghiệp vụ chính.
- Kiểm tra Manager và Sale nhận kết quả khác nhau đúng vai trò.
- Ghi nhận lỗi đủ bằng chứng để đội kỹ thuật tái hiện.

### Ngoài phạm vi

- Không ký duyệt công thức tài chính/VAT.
- Không xác nhận tồn khả dụng khi ERP chưa có nguồn giữ chỗ/hàng khóa.
- Không phê duyệt nội dung chuyên môn y dược.
- Không đánh giá tối ưu bản đồ nếu chưa có nguồn check-in/tọa độ đầy đủ.
- Không tạo đơn, khách hoặc chương trình thật trong Pilot.

## 10. Điều kiện đầu vào trước khi test

- [ ] Frontend mở được và trỏ đúng môi trường Pilot.
- [ ] n8n workflow chính cần thiết đã Published; workflow migration/audit không cần bật để sử dụng hàng ngày.
- [ ] `API_ListActive`, `API_GetConfig`, `API_Execute` hoạt động.
- [ ] 13 tài khoản đăng nhập được và chưa bị khóa.
- [ ] Dữ liệu `U13D_` có đủ 84 đơn và 168 dòng chi tiết.
- [ ] `API_DoanhSo_AI` trả 12 ngày từ 09/07 đến 20/07 cho 13/13 tài khoản.
- [ ] Không dùng cùng một tab trình duyệt cho hai tài khoản đồng thời.
- [ ] Đã chuẩn bị thư mục lưu ảnh bằng chứng.

## 11. Kết quả doanh số chuẩn trên medtest

Các số dưới đây là dữ liệu UAT dùng để phát hiện sai scope; không phải doanh số thật.

| Tài khoản | Số ngày | Doanh số 20/07 | Tổng 09–20/07 |
|---|---:|---:|---:|
| `QLBH013.MED` | 12 | 83.000.000 ₫ | 1.116.000.000 ₫ |
| `NAMDINHB.MED` | 12 | 83.000.000 ₫ | 1.116.000.000 ₫ |
| `QLBH016.MED` | 12 | 86.000.000 ₫ | 1.152.000.000 ₫ |
| `BACNINHA.MED` | 12 | 86.000.000 ₫ | 1.152.000.000 ₫ |
| `QLBH005.MED` | 12 | 89.000.000 ₫ | 1.188.000.000 ₫ |
| `HUEB.MED` | 12 | 89.000.000 ₫ | 1.188.000.000 ₫ |
| `QLBH010.MED` | 12 | 92.000.000 ₫ | 1.224.000.000 ₫ |
| `DANANGA.MED` | 12 | 92.000.000 ₫ | 1.224.000.000 ₫ |
| `QLMN2` | 12 | 95.000.000 ₫ | 1.260.000.000 ₫ |
| `CanThoA` | 12 | 95.000.000 ₫ | 1.260.000.000 ₫ |
| `QLMD1` | 12 | 98.000.000 ₫ | 1.296.000.000 ₫ |
| `BinhPhuocA` | 12 | 98.000.000 ₫ | 1.296.000.000 ₫ |
| `QLBH024.MED` | 12 | 101.000.000 ₫ | 1.332.000.000 ₫ |

Nếu kết quả lệch, không sửa fixture ngay. Kiểm tra trước: ngày, cache, tài khoản, filter nhân viên, scope Manager và nguồn `AR_OrderAndReturnView`.

## 12. Bộ test chung bắt buộc — chạy 13/13 tài khoản

| ID | Thao tác/câu hỏi | Kết quả mong đợi |
|---|---|---|
| AUTH-01 | Đăng nhập | Đúng tên và đúng vai trò |
| AUTH-02 | Tải lại trang bằng Ctrl+F5 | Phiên vẫn hợp lệ, không trắng màn hình |
| NL-01 | `Xin chào` | Trả lời hội thoại, không gọi SQL sai |
| NL-02 | `Hôm nay tôi nên làm gì?` | Đưa gợi ý công việc phù hợp vai trò |
| SALES-01 | `Doanh số từ 09/07/2026 đến 20/07/2026` | Đủ 12 ngày, khớp bảng mục 11 |
| SALES-02 | `Hôm nay doanh số của tôi là bao nhiêu?` | Có doanh số ngày 20/07 trên dữ liệu chốt |
| ROUTE-01 | `Hôm nay tôi nên ghé khách nào?` | Chỉ khách trong scope; có lý do dễ hiểu |
| REC-01 | `Gợi ý đơn hàng cho khách {MA_KH}` | Có gợi ý hoặc lý do hợp lệ, không đoán chu kỳ khi thiếu lịch sử |
| UPSELL-01 | `Gợi ý bán kèm cho khách {MA_KH}` | Gắn đúng khách; không trả danh sách chung nếu thiếu khách |
| DEBT-01 | `Khách {MA_KH} đang nợ bao nhiêu?` | Có tổng quan hoặc thông báo không nợ rõ ràng |
| DEBT-02 | `Chi tiết công nợ khách {MA_KH}` | Có mã/tên khách; trạng thái thanh toán dễ hiểu |
| SCORE-01 | `Chấm điểm khách hàng của tôi` | Có A/B/C; Tier và rủi ro tách riêng |
| PRODUCT-01 | `Thông tin sản phẩm A003` | Mã/tên/ĐVT dễ đọc, không lộ field kỹ thuật |
| STOCK-01 | `Tồn kho sản phẩm A003` | Tồn âm vẫn hiển thị; chưa xác minh không biến thành 0 |
| FOCUS-01 | `Sản phẩm trọng tâm tháng này là gì?` | Có kết quả hoặc lý do không có chương trình |
| UI-01 | Mở rộng một dòng kết quả | Chi tiết tiếng Việt, không có RuleVersion/RuleSource cho người dùng |
| UI-02 | Tìm kiếm và phân trang | Phản hồi được, không tải toàn bộ hàng trăm dòng một lần |
| SESSION-01 | Đăng xuất | Token/phiên cũ không tiếp tục gọi dữ liệu |

Tổng tối thiểu: **18 case × 13 tài khoản = 234 lượt kiểm tra**.

## 13. Phiếu chạy riêng cho từng tài khoản

### 13.1. `QLBH013.MED` — Quản lý miền Bắc

- Khách dùng kiểm tra: `NDB001`.
- Doanh số chuẩn: 83.000.000 ₫ ngày 20/07.
- Chạy toàn bộ mục 12.
- Chạy thêm: tổng quan đội, đề xuất khuyến mãi, lọc khách A/B/C.
- Kiểm tra cặp Sale thuộc quyền: `NAMDINHB.MED`.

### 13.2. `NAMDINHB.MED` — Sale miền Bắc

- Khách dùng kiểm tra: `NDB001`.
- Doanh số chuẩn: 83.000.000 ₫ ngày 20/07.
- Chạy toàn bộ mục 12.
- Xác nhận không xem được khách/nhân viên ngoài tuyến.
- Xác nhận không coi đề xuất khuyến mãi nội bộ là chương trình đã duyệt.

### 13.3. `QLBH016.MED` — Quản lý miền Bắc

- Khách dùng kiểm tra: `BNA051`.
- Doanh số chuẩn: 86.000.000 ₫ ngày 20/07.
- Chạy toàn bộ mục 12 và bộ Manager.
- Kiểm tra cặp Sale thuộc quyền: `BACNINHA.MED`.

### 13.4. `BACNINHA.MED` — Sale miền Bắc

- Khách dùng kiểm tra: `BNA051`.
- Doanh số chuẩn: 86.000.000 ₫ ngày 20/07.
- Chạy toàn bộ mục 12 và kiểm tra scope Sale.

### 13.5. `QLBH005.MED` — Quản lý miền Trung

- Khách dùng kiểm tra: `HUEA043`.
- Doanh số chuẩn: 89.000.000 ₫ ngày 20/07.
- Chạy toàn bộ mục 12 và bộ Manager.
- Kiểm tra cặp Sale thuộc quyền: `HUEB.MED`.

### 13.6. `HUEB.MED` — Sale miền Trung

- Khách dùng kiểm tra: `HUEA043`.
- Doanh số chuẩn: 89.000.000 ₫ ngày 20/07.
- Chạy toàn bộ mục 12 và kiểm tra scope Sale.

### 13.7. `QLBH010.MED` — Quản lý miền Trung

- Khách dùng kiểm tra: `QANA002`.
- Doanh số chuẩn: 92.000.000 ₫ ngày 20/07.
- Chạy toàn bộ mục 12 và bộ Manager.
- Kiểm tra cặp Sale thuộc quyền: `DANANGA.MED`.

### 13.8. `DANANGA.MED` — Sale miền Trung

- Khách dùng kiểm tra: `QANA002`.
- Doanh số chuẩn: 92.000.000 ₫ ngày 20/07.
- Chạy toàn bộ mục 12 và kiểm tra scope Sale.

### 13.9. `QLMN2` — Quản lý miền Nam

- Khách dùng kiểm tra: `DL012`.
- Doanh số chuẩn: 95.000.000 ₫ ngày 20/07.
- Chạy toàn bộ mục 12 và bộ Manager.
- Kiểm tra cặp Sale thuộc quyền: `CanThoA`.

### 13.10. `CanThoA` — Sale miền Nam

- Khách dùng kiểm tra: `DL012`.
- Doanh số chuẩn: 95.000.000 ₫ ngày 20/07.
- Chạy toàn bộ mục 12 và kiểm tra scope Sale.

### 13.11. `QLMD1` — Quản lý miền Nam

- Khách dùng kiểm tra: `SGNB0001`.
- Doanh số chuẩn: 98.000.000 ₫ ngày 20/07.
- Chạy toàn bộ mục 12 và bộ Manager.
- Kiểm tra cặp Sale thuộc quyền: `BinhPhuocA`.

### 13.12. `BinhPhuocA` — Sale miền Nam

- Khách dùng kiểm tra: `SGNB0001`.
- Doanh số chuẩn: 98.000.000 ₫ ngày 20/07.
- Chạy toàn bộ mục 12 và kiểm tra scope Sale.

### 13.13. `QLBH024.MED` — Quản lý miền Nam

- Khách dùng kiểm tra: `AG0020`.
- Doanh số chuẩn: 101.000.000 ₫ ngày 20/07.
- Chạy toàn bộ mục 12 và bộ Manager.
- Đây là tài khoản Quản lý độc lập trong bộ 13, không gán thêm Sale chỉ để đủ cặp.

## 14. Bộ test riêng cho Quản lý

| ID | Câu hỏi/thao tác | Kết quả mong đợi |
|---|---|---|
| MGR-01 | `Xem tổng quan doanh số của đội tôi` | Chỉ nhân viên thuộc quyền |
| MGR-02 | Chọn một nhân viên hợp lệ | Dữ liệu lọc đúng nhân viên |
| MGR-03 | Thử nhập nhân viên ngoài quyền | Bị chặn hoặc bỏ filter, không lộ dữ liệu |
| MGR-04 | `Xem khách hàng nhóm A, B và C` | Có bộ lọc hoạt động và phân trang |
| MGR-05 | Mở chi tiết khách rủi ro | Hiện lý do, doanh số, lần mua cuối; ẩn R/F/M/C kỹ thuật |
| MGR-06 | `Sản phẩm nào cần xem xét khuyến mãi?` | Có lý do và trạng thái cần duyệt |
| MGR-07 | Kiểm tra tồn kho nhiều kho/lô | Gom thông tin dễ đọc; tồn âm được cảnh báo |
| MGR-08 | Xem công nợ toàn phạm vi | Không có khách miền khác |

## 15. Bộ test riêng cho Sale

| ID | Câu hỏi/thao tác | Kết quả mong đợi |
|---|---|---|
| SALE-01 | `Cho tôi danh sách khách thuộc tuyến` | Chỉ khách được giao |
| SALE-02 | `Khách nào lâu chưa mua?` | Có lý do/số ngày, không dùng mã kỹ thuật |
| SALE-03 | Gợi ý đơn hàng cho khách đại diện | Có dữ liệu lịch sử hoặc giải thích khách mới |
| SALE-04 | Gợi ý bán kèm không truyền khách | Yêu cầu chọn khách, không trả danh sách chung |
| SALE-05 | Gợi ý bán kèm có khách | Có sản phẩm gắn với khách |
| SALE-06 | Mở đề xuất khuyến mãi nội bộ | Không được tự duyệt/áp giá |
| SALE-07 | Kiểm tra tồn kho | Có số ERP và cảnh báo nếu chưa xác minh bán được |

## 16. Coverage 24 API hội thoại đã duyệt

| ID | API/lệnh | Câu test chính | Tài khoản ưu tiên |
|---|---|---|---|
| API-01 | `@doanh_so` | Doanh số 09–20/07 | Cả 13 |
| API-02 | `@hoa_don` | Hóa đơn trong kỳ | 1 Manager + 1 Sale mỗi miền |
| API-03 | `@hoa_don_chi_tiet` | Chọn mã từ API-02 | 1 Manager + 1 Sale mỗi miền |
| API-04 | `@don_hang` | Đơn hàng của khách đại diện | Cả 13 |
| API-05 | `@cham_diem_kh` | Chấm điểm khách | Cả 13 |
| API-06 | `@cong_no_khach_hang` | Danh sách công nợ | Cả 13 |
| API-07 | `@cong_no_chi_tiet` | Chi tiết khách đại diện | Cả 13 |
| API-08 | `@tich_luy` | Tích lũy khách đại diện | 1 Manager + 1 Sale mỗi miền |
| API-09 | `@tuyen_ban_hang` | Tuyến hôm nay | Cả 13 |
| API-10 | `@goi_ydon_hang` | Gợi ý khách đại diện | Cả 13 |
| API-11 | `@upsell_goi_y` | Bán kèm khách đại diện | Cả 13 |
| API-12 | `@goi_ydon_thuoc` | Gợi ý từ sản phẩm gốc | 1 tài khoản mỗi miền |
| API-13 | `@danh_sach_tonkho` | Tồn A003 | Cả 13 |
| API-14 | `@tra_cuu_san_pham` | Tra cứu A003 | Cả 13 |
| API-15 | `@san_pham_trong_tam` | Danh sách tháng | 1 Manager + 1 Sale mỗi miền |
| API-16 | `@de_xuat_khuyen_mai` | Sản phẩm cần xem xét | 7 Manager |
| API-17 | `@danh_muc` | Danh mục kho | 1 Manager + 1 Sale mỗi miền |
| API-18 | `@khao_sat360` | Khảo sát khách đại diện | 1 Manager + 1 Sale mỗi miền |
| API-19 | `@danh_sach_cau_hoi_khao_sat` | Câu hỏi khách | 1 Manager + 1 Sale mỗi miền |
| API-20 | `@kiem_tra_khao_sat` | Trạng thái khách | 1 Manager + 1 Sale mỗi miền |
| API-21 | `@kiem_tra_khao_sat_ngay` | Khảo sát hôm nay | 1 Manager + 1 Sale mỗi miền |
| API-22 | `@lich_su_khao_sat` | Lịch sử khách | 1 Manager + 1 Sale mỗi miền |
| API-23 | `@thong_bao` | Thông báo mới | Cả 13 |
| API-24 | `@tim_san_pham_theo_trieu_chung` | Từ khóa triệu chứng | 1 tài khoản mỗi miền, chỉ tham khảo |

## 17. Test ngôn ngữ tự nhiên

Mỗi tài khoản chạy cả ba cách:

1. Câu chuẩn: `Gợi ý đơn hàng cho khách NDB001`.
2. Câu nói tự nhiên: `nay bán gì cho khách NDB001 ta`.
3. Lệnh trực tiếp: chọn `@goi_ydon_hang` và điền khách.

Tiêu chí:

- Câu chuẩn và câu tự nhiên định tuyến cùng API khi đủ thực thể.
- Không bịa mã khách/sản phẩm.
- Nếu thiếu khách, chatbot hỏi bổ sung thay vì gọi API sai.
- Câu ngoài 24 luồng trả lời hội thoại hoặc hướng dẫn, không tự gọi procedure khác.

## 18. Test phân quyền âm

Chỉ điều phối viên cung cấp mã ngoài phạm vi; không ghi danh sách khách thật vào tài liệu công khai.

| ID | Tình huống | Kết quả bắt buộc |
|---|---|---|
| SEC-01 | Sale MB hỏi khách MT/MN | Không trả dữ liệu |
| SEC-02 | Sale MT hỏi khách MB/MN | Không trả dữ liệu |
| SEC-03 | Sale MN hỏi khách MB/MT | Không trả dữ liệu |
| SEC-04 | Manager chọn nhân viên không thuộc quyền | Không trả dữ liệu nhân viên đó |
| SEC-05 | Đổi username ở payload phía client | Server vẫn dùng danh tính đã xác thực |
| SEC-06 | Token hết hạn | Yêu cầu đăng nhập, không trả dữ liệu cache |
| SEC-07 | Mã khách tồn tại nhưng bị khóa | Thông báo không hợp lệ/không có quyền |
| SEC-08 | Gọi chi tiết hóa đơn ngoài scope | Không trả chi tiết |

Bất kỳ lỗi SEC nào đều là **P0**, dừng nghiệm thu tài khoản liên quan.

## 19. Test UI và khả năng sử dụng

- [ ] Theme sáng/tối hoạt động và được giữ khi chuyển trang.
- [ ] Các bảng trên màn hình nhỏ có cuộn hoặc chuyển thành bố cục phù hợp.
- [ ] Phân trang hiển thị 25 dòng/trang, không có nút “xem toàn bộ” hàng trăm dòng.
- [ ] Nút Nhóm A/B/C hoạt động và phản hồi rõ trạng thái đang chọn.
- [ ] Mở rộng dòng không làm lệch cột hoặc lộ field backend.
- [ ] Ngày hiển thị `dd/MM/yyyy`.
- [ ] Tiền có đơn vị hoặc ngữ cảnh rõ.
- [ ] Số điện thoại/mã/lô không bị định dạng như tiền.
- [ ] Tồn âm được hiển thị và cảnh báo.
- [ ] `RuleSource`, `RuleVersion`, `StatusID` không xuất hiện cho Sale/Manager.
- [ ] Trạng thái nghiệp vụ được dịch sang tiếng Việt.
- [ ] Loading xuất hiện nhanh; không để form trống lâu khiến người dùng tưởng lỗi.

## 20. Test mutation ở chế độ preview

Ba chức năng có metadata INSERT có thể xuất hiện trong hệ thống: thêm đơn hàng, thêm khách hàng và import sản phẩm trọng tâm.

Trong Pilot:

1. Chỉ kiểm tra form mở được và trường tiếng Việt đúng.
2. Không nhấn xác nhận ghi thật nếu chưa có môi trường rollback riêng.
3. Nếu workflow hỗ trợ preview, xác nhận payload xem trước đúng scope.
4. Không dùng dữ liệu khách thật làm fixture.

Kết quả hợp lệ: `PREVIEW_ONLY`; không được ghi `PASS mutation production`.

## 21. Phân loại lỗi và thời hạn xử lý

| Mức | Ví dụ | Xử lý |
|---|---|---|
| P0 | Rò rỉ dữ liệu khác miền, ghi dữ liệu ngoài ý muốn | Dừng test và khóa luồng ngay |
| P1 | Sai doanh số/công nợ, sai danh tính, API chính không chạy | Sửa trước buổi Pilot tiếp theo |
| P2 | Nút không bấm, phân trang lỗi, câu chuẩn không nhận diện | Sửa trong vòng Pilot |
| P3 | Căn lề, màu sắc, câu chữ chưa đẹp | Ghi backlog, không chặn nếu vẫn hiểu được |

## 22. Quy ước lưu bằng chứng

Tên file ảnh:

```text
YYYYMMDD_USERNAME_CASEID_PASS-FAIL.png
```

Ví dụ:

```text
20260720_QLBH013-MED_SALES-01_PASS.png
```

Không đưa password, token, chuỗi kết nối DB hoặc thông tin khách nhạy cảm vào ảnh công khai.

## 23. Bảng tổng hợp nghiệm thu 13 tài khoản

| Tài khoản | Đăng nhập | Scope | Doanh số | Công nợ | Tồn kho | Gợi ý | Câu tự nhiên | Kết luận |
|---|---|---|---|---|---|---|---|---|
| QLBH013.MED |  |  |  |  |  |  |  |  |
| NAMDINHB.MED |  |  |  |  |  |  |  |  |
| QLBH016.MED |  |  |  |  |  |  |  |  |
| BACNINHA.MED |  |  |  |  |  |  |  |  |
| QLBH005.MED |  |  |  |  |  |  |  |  |
| HUEB.MED |  |  |  |  |  |  |  |  |
| QLBH010.MED |  |  |  |  |  |  |  |  |
| DANANGA.MED |  |  |  |  |  |  |  |  |
| QLMN2 |  |  |  |  |  |  |  |  |
| CanThoA |  |  |  |  |  |  |  |  |
| QLMD1 |  |  |  |  |  |  |  |  |
| BinhPhuocA |  |  |  |  |  |  |  |  |
| QLBH024.MED |  |  |  |  |  |  |  |  |

## 24. Biên bản ký nghiệm thu

```text
Phiên bản frontend/source:
Môi trường:
Ngày giờ bắt đầu/kết thúc:
Số case PASS:
Số case FAIL:
Số case BLOCKED:
P0/P1 còn mở:

Đại diện Sale:
Họ tên / xác nhận / ngày:

Đại diện Quản lý:
Họ tên / xác nhận / ngày:

Đại diện nghiệp vụ:
Họ tên / xác nhận / ngày:

Đại diện kỹ thuật:
Họ tên / xác nhận / ngày:

Kết luận:
[ ] Chấp nhận Pilot có điều kiện
[ ] Yêu cầu sửa và kiểm thử lại
[ ] Chấp nhận chuyển bước triển khai tiếp theo
```

Technical PASS không thay thế Business PASS. Dữ liệu UAT đúng không tự động chứng minh công thức tài chính, tồn khả dụng hoặc nội dung chuyên môn đã được doanh nghiệp phê duyệt.
