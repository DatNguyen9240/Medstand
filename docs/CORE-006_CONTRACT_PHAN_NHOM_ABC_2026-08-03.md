# CORE-006 — Contract phân nhóm khách hàng A/B/C

Ngày lập: `03/08/2026`  
Môi trường đối chiếu: `medtest`  
Trạng thái: `SIGNED_OFF_AND_DEPLOYED_MEDTEST`  
Rule chính thức: `BR-TIER-005/2.0.0`  
Hiệu lực: `03/08/2026 13:34:26 +07:00`

## 1. Kết luận

`DONE`. Người dùng/business owner đã chọn phương án C trong phiên làm việc ngày `03/08/2026`, yêu cầu không hard-code business rule và cho phép hiệu lực ngay. Sign-off được ghi nhận bằng định danh `USER_CONFIRMED_IN_CHAT` do người duyệt không cung cấp tên cá nhân.

Không nên duyệt nguyên công thức đang chạy vì:

- Percentile đang được tính lại trên tập khách mà từng tài khoản được phép xem. Vì vậy cùng một khách có thể đổi nhóm khi sale và manager xem.
- Doanh số đang dùng tổng hóa đơn, chưa trừ trả hàng.
- Khách không có hóa đơn trong 12 tháng bị loại khỏi kết quả thay vì có trạng thái rõ ràng.
- Scope chỉ có một khách sẽ tự động xếp khách đó vào nhóm A, kể cả điểm bằng `0`.

Phương án được duyệt là **C — kết hợp ngưỡng doanh số thuần và tần suất cố định**. Toàn bộ ngưỡng, kỳ dữ liệu, status và ratio được lưu trong `AI_BusinessRuleConfigTbl`; `API_ChamDiemKH_AI` chỉ đọc một version `APPROVED` đầy đủ và fail-closed nếu cấu hình thiếu/sai.

## 2. Bằng chứng runtime ngày 03/08/2026

Script đối chiếu chỉ đọc: `scripts/analyze_core006_customer_tiers.js`.

| Hạng mục | Kết quả |
|---|---:|
| Khách đang hoạt động | `48.565` |
| Có ít nhất một hóa đơn hợp lệ trong 12 tháng | `7.124` |
| Không có hóa đơn hợp lệ trong 12 tháng | `41.441` |
| Khách đủ điều kiện chấm có trả hàng | `504` |
| Tổng trả hàng có dấu của tập đủ điều kiện | `-868.743.759 đ` |
| Khách đổi tier khi chuyển từ gross sang net | `12` |
| P50 doanh số thuần 12 tháng | `5.409.475 đ` |
| P80 doanh số thuần 12 tháng | `25.666.200 đ` |
| P50 tần suất 6 tháng | `2` hóa đơn |
| P80 tần suất 6 tháng | `6` hóa đơn |
| Doanh số thuần trung bình/tháng | `1.578.721,83 đ` |
| Giá trị đơn thuần trung bình | `1.824.364,29 đ` |

Dữ liệu gần nhất trên `medtest`: hóa đơn `19/07/2026`, trả hàng `12/03/2026`. Các ngưỡng bên dưới chỉ là số hiệu chỉnh để business duyệt; không được coi là thống kê production, đặc biệt khi môi trường có thể chứa mock data.

### Bằng chứng công thức hiện tại phụ thuộc người xem

| Khách | Manager | Kết quả manager | Sale | Kết quả sale |
|---|---|---:|---|---:|
| `NDB001` | `QLBH013.MED` | `B`, điểm `45` | `NAMDINHB.MED` | `C`, điểm `42` |
| `HUEA043` | `QLBH005.MED` | `B`, điểm `43` | `HUEB.MED` | `C`, điểm `40` |
| `DL012` | `QLMN2` | `B`, điểm `45` | `CanThoA` | `A`, điểm `0` |

Doanh số của từng khách trong các cặp trên không thay đổi. Sai khác chỉ xuất hiện vì percentile được tính trên scope của người xem.

## 3. Contract dữ liệu chung cho cả ba phương án

### 3.1. Mốc và khoảng dữ liệu

- `AsOfDate`: ngày chốt theo múi giờ `Asia/Bangkok`.
- Kỳ 12 tháng: `[DATEADD(MONTH, -12, AsOfDate + 1 ngày), AsOfDate + 1 ngày)`.
- Kỳ 6 tháng tính tần suất: `[DATEADD(MONTH, -6, AsOfDate + 1 ngày), AsOfDate + 1 ngày)`.
- Hai biên đều phải dùng dạng đầu-kỳ có lấy, cuối-kỳ không lấy để không lặp hoặc mất giao dịch lúc `00:00:00`.
- Kết quả phải có `AsOfDate`, `RuleVersion` và thời điểm tính.

### 3.2. Doanh số và trả hàng

Nguồn tiền thống nhất với báo cáo doanh số ERP:

```text
NetRevenue12M = SUM(AR_OrderAndReturnView.TotalAmount)
                với StatusID IN (3, 6, 7, 8, 99)
                trong kỳ 12 tháng
```

- `StatusID 3, 6, 7, 8`: giao dịch bán đã ghi nhận.
- `StatusID 99`: trả hàng hợp lệ; giá trị trong view đã có dấu.
- Phải cộng trực tiếp `StatusID 99` đúng một lần, không đổi dấu lần thứ hai.
- `AR_OrderAndReturnView` đã phản ánh điều kiện trả hàng hợp lệ của ERP (`Status = 1`, `KhongTruDSWeb = 0`).
- Không dùng đơn chờ, đơn hủy hoặc đơn chưa thuộc nhóm trạng thái được ghi nhận.

### 3.3. Tần suất và trung bình

```text
Frequency6M = COUNT(DISTINCT DocumentID)
              của StatusID IN (3, 6, 7, 8) trong kỳ 6 tháng

AverageMonthlyNetRevenue12M = NetRevenue12M / 12

AverageNetOrderValue12M = NetRevenue12M / InvoiceCount12M
                          nếu InvoiceCount12M > 0
```

- Tần suất đếm hóa đơn, không đếm dòng sản phẩm và không đếm phiếu trả hàng như một lần mua.
- Trung bình tháng luôn chia `12`, kể cả tháng không phát sinh, để mọi khách có cùng mẫu số.
- Giá trị đơn trung bình chỉ là trường giải thích/đối chiếu, không dùng trực tiếp để phân tier trong phương án đề xuất.

### 3.4. Khách không có lịch sử trong kỳ

- Không có hóa đơn hợp lệ trong 12 tháng: `ValueSegment = UNRATED`, nhãn `Chưa đủ dữ liệu trong kỳ`.
- Không ép khách này vào A, B hoặc C.
- Khách có hóa đơn nhưng `NetRevenue12M <= 0`: vẫn đủ dữ liệu và xếp C.
- `RiskLevel` tiếp tục là chiều độc lập; không dùng risk để đổi A/B/C.

### 3.5. Phạm vi và tính nhất quán

- Tier được tính từ dữ liệu khách toàn công ty theo công thức cố định, không tính lại trên danh sách mà người gọi được xem.
- Phân quyền chỉ quyết định khách nào được trả về, không được làm thay đổi tier hoặc điểm của khách.
- Cùng `ObjectID`, `AsOfDate` và `RuleVersion` phải trả cùng tier cho sale, manager và admin.

## 4. Ba phương án để business owner chọn

Tỷ lệ dưới đây chỉ tính trên `7.124` khách có hóa đơn hợp lệ trong kỳ 12 tháng. `41.441` khách còn lại thuộc `UNRATED`.

| Phương án | Công thức | Phân bố medtest | Đánh giá |
|---|---|---|---|
| A — Ngưỡng doanh số cố định | A: net `>= 25 triệu`; B: net `>= 5 triệu` và `< 25 triệu`; C: net `< 5 triệu` | A `20,59%`; B `30,77%`; C `48,64%` | Rất dễ hiểu nhưng bỏ qua tần suất mua |
| B — Percentile toàn công ty | Điểm `45,45%` tần suất + `54,55%` doanh số thuần; A từ P80, B từ P50 | A `20,40%`; B `30,66%`; C `48,95%` | Giữ gần logic cũ nhưng tier có thể dịch chuyển khi phân bố dữ liệu thay đổi |
| C — Kết hợp cố định, **đề xuất** | A: net `>= 25 triệu` **và** frequency `>= 6`; B: net `>= 5 triệu` **và** frequency `>= 2`; C: phần còn lại | A `13,80%`; B `27,91%`; C `58,30%` | Ổn định, có cả giá trị và mức mua lặp, tránh một đơn lớn tự thành A |

Quy tắc biên dùng `>=`: đúng `25.000.000 đ` và `6` hóa đơn đạt A; đúng `5.000.000 đ` và `2` hóa đơn đạt B.

## 5. Bộ ví dụ chuẩn cho phương án C

| Case | Hóa đơn 12M | Frequency 6M | Gross 12M | Trả hàng có dấu | Net 12M | Kết quả |
|---|---:|---:|---:|---:|---:|---|
| `ABC-01` | `0` | `0` | `0` | `0` | `0` | `UNRATED` |
| `ABC-02` | `6` | `6` | `25.000.000` | `0` | `25.000.000` | `A` |
| `ABC-03` | `7` | `5` | `40.000.000` | `0` | `40.000.000` | `B` vì thiếu tần suất A |
| `ABC-04` | `2` | `2` | `5.000.000` | `0` | `5.000.000` | `B` |
| `ABC-05` | `1` | `1` | `100.000.000` | `0` | `100.000.000` | `C` vì chưa đạt tần suất B |
| `ABC-06` | `20` | `20` | `4.999.999` | `0` | `4.999.999` | `C` vì chưa đạt doanh số B |
| `ABC-07` | `7` | `7` | `30.000.000` | `-6.000.000` | `24.000.000` | `B`; trả hàng làm giảm từ ngưỡng A |
| `ABC-08` | `2` | `2` | `1.000.000` | `-1.500.000` | `-500.000` | `C` |
| `ABC-09` | `1` | `1` | `210.000` | `0` | `210.000` | `C` cho mọi người xem; không tự thành A trong scope một khách |

Tất cả case phải trả cùng kết quả khi gọi bằng tài khoản sale, manager hoặc admin có quyền nhìn thấy khách.

## 6. Phần sign-off bắt buộc

Business owner chọn đúng một phương án:

- [ ] Phương án A — ngưỡng doanh số cố định.
- [ ] Phương án B — percentile toàn công ty.
- [x] Phương án C — kết hợp doanh số + tần suất cố định (**đã duyệt**).
- [ ] Công thức khác, ghi đầy đủ: ........................................................

Các quyết định đi kèm:

- [x] Đồng ý kỳ doanh số `12 tháng` và tần suất `6 tháng`.
- [x] Đồng ý doanh số thuần dùng `AR_OrderAndReturnView.TotalAmount`, cộng trực tiếp status `99` đúng một lần.
- [x] Đồng ý khách không có hóa đơn trong 12 tháng là `UNRATED`, không ép vào A/B/C.
- [x] Đồng ý tier không phụ thuộc tài khoản đang xem.
- [x] Đồng ý toàn bộ case `ABC-01` đến `ABC-09`.

| Trường ký duyệt | Giá trị |
|---|---|
| Business owner | `USER_CONFIRMED_IN_CHAT` — người dùng không cung cấp tên cá nhân |
| Vai trò | Business owner/người yêu cầu công việc trong workspace |
| Phương án được chọn | C — doanh số thuần + tần suất cố định |
| Rule version chính thức | `BR-TIER-005/2.0.0` |
| Ngày hiệu lực | `03/08/2026 13:34:26 +07:00` (`06:34:26Z`) |
| Thời điểm ký | Xác nhận trong phiên chat ngày `03/08/2026` |
| Ghi chú/chữ ký xác nhận | “ok, cũng được”; yêu cầu không hard-code và áp dụng ngay |

## 7. Điều kiện chuyển sang CORE-007

Sign-off đã mở cổng CORE-007. SQL `medtest` được deploy lúc `06:34:26Z`; preflight rollback và hậu kiểm read-only đều `PASS`. CORE-007 phải tiếp tục duy trì các điều kiện:

1. `ABC-01` đến `ABC-09` pass `100%`.
2. Cùng khách/cùng mốc/cùng rule trả cùng tier ở mọi scope.
3. Trả hàng được áp dụng đúng một lần.
4. Khách `UNRATED` hiển thị rõ và không lọt vào bộ lọc A/B/C.
5. `RiskLevel` vẫn độc lập với `ValueSegment`.
