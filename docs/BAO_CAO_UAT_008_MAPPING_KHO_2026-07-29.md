# Báo cáo UAT-008 — Mapping kho khách hàng

**Ngày:** 29/07/2026  
**DB kiểm tra:** `medtest`  
**Phạm vi:** 13 tài khoản UAT, vai trò Sale/Manager, các API có sử dụng tồn kho

## 1. Quyết định nghiệp vụ

Business Owner xác nhận trong phạm vi UAT chỉ hiển thị ba kho chính:

- `CTY`
- `DL02`
- `DL03`

Các kho `LOI`, `DL01`, `KG MT`, `LOIMT`, `KG MN`, `LOIMN` không đưa ra giao diện khách hàng trong giai đoạn này. Không xóa mapping gốc trong ERP/DB.

## 2. API cần áp dụng bộ lọc

Đã cập nhật source SQL với allowlist `CTY / DL02 / DL03` cho:

1. `API_DanhsachTonKho_AI`
2. `API_DanhMuc_AI`
3. `API_GoiYDonHang_AI`
4. `API_UpsellGoiY_AI`
5. `API_DeXuatKhuyenMai_AI`
6. `API_SanPhamTrongTam_AI`

Bộ lọc được áp dụng cho cả mapping trực tiếp của Sale và mapping kế thừa của Manager.

## 3. Kết quả kiểm tra

| Hạng mục | Kết quả |
|---|---:|
| Mapping hiệu lực sau allowlist | `13/13 PASS` |
| Tài khoản chỉ có kho được phép trong mapping hiệu lực | `13/13` |
| Output tồn kho trên procedure đang chạy ở `medtest` | `1/13 PASS` |
| Tài khoản còn thấy kho phụ | `12/13` |
| Thay đổi dữ liệu ERP/DB | `0` |

Nguyên nhân còn thấy kho phụ là các procedure live trên `medtest` chưa nhận bản source SQL mới.

## 4. Trạng thái UAT

`IMPLEMENTED_PENDING_DEPLOYMENT` — chưa đánh dấu `DONE`.

## 5. Việc cần làm để hoàn tất

1. Triển khai 6 procedure SQL đã cập nhật lên DB `medtest`.
2. Chạy lại `node scripts/verify_uat008_warehouse_scope.js`.
3. Xác nhận `13/13` tài khoản không trả kho ngoài `CTY`, `DL02`, `DL03`.
4. Khi đạt, cập nhật backlog UAT-008 thành `DONE` và đính kèm JSON kết quả chạy.

**Bằng chứng liên quan:** `scripts/verify_uat008_warehouse_scope.js`, `docs/UAT-008_WAREHOUSE_SCOPE_VERIFICATION_2026-07-29.md`.
