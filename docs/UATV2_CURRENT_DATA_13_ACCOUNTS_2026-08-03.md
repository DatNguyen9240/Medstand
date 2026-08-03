# UATV2 — Dữ liệu hiện tại cho 13 tài khoản UAT

## Kết luận

`PASS 13/13` trên `medtest`, mốc dữ liệu `03/08/2026`.

Bộ seed đã được commit lúc `2026-08-03T07:19:34.792Z` (`14:19:34 +07`) với SHA-256:

`94c859988f6d50d1ac7857cd0ea0a53809a13374967ff02c3629f845b391ee8c`

Toàn bộ dữ liệu mới dùng namespace `UATV2_` và `UserCreate = UATV2_MOCK`; không cập nhật hoặc xóa khách hàng/đơn hàng nghiệp vụ thật.

## Dữ liệu đã tạo

| Loại | Số lượng | Nội dung |
|---|---:|---|
| Khách hàng | 28 | Mỗi cohort có A, B, C và `UNRATED` |
| Đơn hàng | 91 | 63 đơn doanh số và 28 đơn trạng thái |
| Hóa đơn | 63 | Lịch sử mua tương ứng |
| Trả hàng | 7 | Một ca/cohort, được tính âm đúng một lần |
| Công nợ | 7 | Một khách nhóm B/cohort |
| Sản phẩm trọng tâm | 3 | `A003`, `Q002`, `G010` |
| Chương trình hiện hành | 1 | `UATV2_FOCUS_CURRENT`, hiệu lực 02/08–02/09/2026 |

Các trạng thái đơn hiện có cho từng tài khoản: `-1`, `0`, `2`, `8`, `10`.

Ngưỡng và tần suất A/B/C không được viết cứng trong seed. SQL đọc version `APPROVED` hiện hành của `BR-TIER-005/2.0.0` từ `AI_BusinessRuleConfigTbl`. Kết quả runtime tại thời điểm chạy:

| Nhóm | Doanh số thuần 12 tháng | Tần suất 6 tháng |
|---|---:|---:|
| A | 25.000.000 | 6 |
| B | 5.000.000 | 2 |
| C | 4.999.999 | 1 |
| UNRATED | 0 | 0 |

## Phạm vi 13 tài khoản

| Tài khoản | Cohort | Kho | Sản phẩm | Khách UATV2 nhìn thấy |
|---|---|---|---|---:|
| `QLBH013.MED` | NDB | CTY | A003 | 4 |
| `NAMDINHB.MED` | NDB | CTY | A003 | 4 |
| `QLBH016.MED` | BNB | CTY | Q002 | 4 |
| `BACNINHA.MED` | BNB | CTY | Q002 | 4 |
| `QLBH005.MED` | HUE | DL02 | G010 | 4 |
| `HUEB.MED` | HUE | DL02 | G010 | 4 |
| `QLBH010.MED` | QAN | DL02 | A003 | 4 |
| `DANANGA.MED` | QAN | DL02 | A003 | 4 |
| `QLMN2` | CTH | DL03 | Q002 | 4 |
| `CanThoA` | CTH | DL03 | Q002 | 4 |
| `QLMD1` | BPH | DL03 | G010 | 4 |
| `BinhPhuocA` | BPH | DL03 | G010 | 4 |
| `QLBH024.MED` | AG | DL03 | A003 | 4 |

## Bằng chứng kiểm tra

1. Preflight transaction rollback: `PASS`, không lưu dữ liệu.
2. Deploy transaction: `DEPLOYED`; trước deploy có `0` khách/đơn `UATV2_`, sau deploy có đúng số lượng ở bảng trên.
3. Post-deploy runtime: `PASS 13/13`.
4. Mỗi tài khoản pass đủ bốn bộ lọc `A/B/C/UNRATED` qua `API_ChamDiemKH_AI`.
5. Mỗi tài khoản thấy 7 đơn của cohort qua `API_DonHang_AI`, có đủ trạng thái `-1/0/2/8/10`.
6. Mỗi tài khoản có doanh số ngày 03/08 qua `API_DoanhSo_AI` và thấy công nợ khách nhóm B qua `API_CongNoKhachHang_AI`.
7. Bảy ca trả hàng đều mang giá trị âm `-500.000` trong `AR_OrderAndReturnView`; doanh số thuần nhóm A vẫn đúng `25.000.000`.

## File và lệnh vận hành

- Seed: `sql/Seed_UATV2_Current_Data_13_Accounts.sql`
- Preflight rollback: `node scripts/preflight_uatv2_seed_13_accounts.js`
- Deploy có xác nhận: `node scripts/deploy_uatv2_seed_13_accounts.js --apply`
- Hậu kiểm: `node scripts/verify_uatv2_seed_13_accounts.js`

Seed là idempotent: chạy lại sẽ chỉ làm mới dữ liệu thuộc namespace `UATV2_`. Không chạy lại ba script mock cũ `Add_UAT_TDV_Mock_Data_AI.sql`, `Insert_Mock_Data_Test_AI.sql` hoặc `Insert_Mock_Advanced_Modules_AI.sql`, vì chúng có thể sửa dữ liệu ngoài namespace hoặc tạo chương trình đã hết hạn.

## Giới hạn

- Không bơm thêm tồn kho; bộ test tái sử dụng tồn thật của ba sản phẩm mẫu tại kho được cấp.
- Chưa thay thế UAT click trực tiếp trên UI/token thật. Bộ dữ liệu này tạo nền ổn định để thực hiện phần UI của `CORE-007` và regression các API liên quan.
- Khi cần dọn dữ liệu, phải xóa theo thứ tự khóa ngoại và chỉ với `ObjectID/DocumentID LIKE 'UATV2[_]%'`; không dùng pattern rộng hơn.
