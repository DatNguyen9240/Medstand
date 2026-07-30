# UAT-015 — Test tồn kho theo quyền

## Trạng thái

`PASS` — kiểm tra runtime read-only đạt `13/13` tài khoản trên DB `medtest`.

## Phạm vi kiểm tra

- API runtime: `dbo.API_DanhsachTonKho_AI`.
- 13 tài khoản Pilot trong `config/uat/account-fixtures.v1.json`.
- Tồn vật lý, tồn khả dụng, lô hết hạn, trạng thái tồn và phạm vi kho.
- Đối soát `PhysicalStock = Nhap - Xuat` và lô hết hạn không được tính vào `AvailableStock`.
- Chạy read-only trên DB `medtest`; không ghi hoặc sửa dữ liệu.

## Kết quả

| Hạng mục | Kết quả |
|---|---:|
| Tài khoản kiểm tra | `13` |
| Tài khoản đạt đầy đủ | `13/13` |
| Tài khoản còn thấy kho ngoài allowlist | `0/13` |
| Tổng dòng ngoài scope quan sát được | `0` |
| Sai công thức tồn vật lý/tồn khả dụng | `0` |
| Lô hết hạn vẫn được đánh dấu bán được | `0` |
| Sai trạng thái tồn | `0` |
| Kiểm tra trường UI | `PASS` |

Runtime hiện chỉ trả các kho được cấp trong allowlist UAT: `CTY`, `DL02`, `DL03`. Theo phạm vi thực tế từng tài khoản, các kết quả quan sát được là `CTY / DL02`, `DL02` hoặc `DL03`.

## Xác nhận sau cập nhật

Procedure runtime đã được cập nhật. Chạy lại verifier cho thấy cả 13 tài khoản đều chỉ thấy kho thuộc phạm vi được cấp; không còn dòng ngoài scope hoặc ngoài allowlist.

## Bằng chứng

- Script: `scripts/verify_uat015_stock_scope.js`.
- Kết quả kiểm tra ngày `2026-07-29` sau cập nhật: `PASS`, `13/13 PASS`.
- Không có mutation trong quá trình kiểm tra.
