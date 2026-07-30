# UAT-008 — Đối soát mapping kho CTY/DL02/DL03

## Trạng thái

`IMPLEMENTED_PENDING_DEPLOYMENT` — Business Owner đã xác nhận chỉ hiển thị ba kho chính `CTY / DL02 / DL03`. Các kho phụ được giữ nguyên trong ERP/DB nhưng bị loại khỏi phạm vi hiển thị của các API UAT.

## Phạm vi kiểm tra

- DB mục tiêu: `medtest`.
- Bảng mapping: `dbo.SY_UserStoreHouseTbl`.
- Kiểm tra mapping trực tiếp của Sale và mapping kế thừa từ nhân viên phụ trách của Manager.
- Đối chiếu kho trả về bởi `dbo.API_DanhsachTonKho_AI`.
- Script chỉ đọc: `scripts/verify_uat008_warehouse_scope.js`.

## Kết quả đối soát

Các tài khoản đại diện hiện có mapping như sau:

| Vùng | Tài khoản | Kho mapping |
|---|---|---|
| MB | `QLBH013.MED`, `NAMDINHB.MED` | `CTY`, `DL02`, `LOI` |
| MB | `QLBH016.MED`, `BACNINHA.MED` | `CTY`, `DL01`, `DL02`, `LOI` |
| MT | `QLBH005.MED`, `HUEB.MED`, `QLBH010.MED`, `DANANGA.MED` | `DL02`, `KG MT`, `LOIMT` |
| MN | `QLMN2`, `CanThoA`, `QLMD1`, `BinhPhuocA` | `DL03`, `KG MN`, `LOIMN` |
| MN | `QLBH024.MED` | `DL03` |

Các kho ngoài allowlist đang xuất hiện: `LOI`, `DL01`, `KG MT`, `LOIMT`, `KG MN`, `LOIMN`. Theo xác nhận ngày 2026-07-29, các kho này phải được ẩn khỏi đầu ra UAT.

Kết quả chạy trực tiếp trên `medtest` cho thấy procedure hiện tại vẫn chưa được triển khai bản lọc mới: `12/13` tài khoản còn trả tồn ở kho phụ; chỉ `QLBH024.MED` chỉ trả `DL03`. Đây là lỗi triển khai/configuration, không phải lỗi mapping ERP.

## Quyết định và cách triển khai

Không xóa hoặc sửa mapping ERP hiện hữu. Bộ lọc allowlist `CTY / DL02 / DL03` được áp dụng khi xây dựng phạm vi kho cho các API có sử dụng tồn kho:

- `API_DanhsachTonKho_AI`
- `API_DanhMuc_AI`
- `API_GoiYDonHang_AI`
- `API_UpsellGoiY_AI`
- `API_DeXuatKhuyenMai_AI`
- `API_SanPhamTrongTam_AI`

UAT-008 chỉ được đánh dấu `DONE` sau khi triển khai các procedure lên DB `medtest` và chạy lại script xác nhận 13 tài khoản không trả kho ngoài allowlist.

## Lần chạy lại ngày 2026-07-29

- `node --check scripts/verify_uat008_warehouse_scope.js`: PASS.
- Chạy kiểm tra DB read-only: kết nối thành công; mapping hiệu lực sau allowlist đạt `13/13 PASS`.
- Đối chiếu output tồn kho live: `12/13` tài khoản còn trả kho phụ; `1/13` tài khoản đạt. Vì vậy trạng thái vẫn là chờ triển khai, chưa được đánh dấu `DONE`.
- Không có thay đổi dữ liệu trong DB.

## Kết luận nghiệm thu

Chưa đủ điều kiện giao khách hàng ở hạng mục UAT-008. Source SQL đã được chỉnh để chỉ nhận `CTY`, `DL02`, `DL03`, nhưng cần triển khai procedure lên `medtest` và chạy lại kiểm tra. Tiêu chí đạt là `13/13` tài khoản không còn thấy `LOI`, `DL01`, `KG MT`, `LOIMT`, `KG MN`, `LOIMN` trong output tồn kho/danh mục kho.
