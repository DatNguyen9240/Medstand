# UAT-016 — Test tra cứu sản phẩm và triệu chứng

## Trạng thái

`PASS` — kiểm tra runtime read-only đạt `13/13` tài khoản trên DB `medtest`.

## Phạm vi kiểm tra

- `dbo.API_TraCuuSanPham_AI`: tìm theo mã/tên sản phẩm, giá hiện hành, thông tin sản phẩm và trạng thái tồn.
- `dbo.API_UpsellGoiY_AI` với từ khóa triệu chứng `ho`: kết quả sản phẩm, lý do gợi ý, tồn khả dụng và cảnh báo tham khảo.
- Kiểm tra không biến kết quả triệu chứng thành chẩn đoán/kê đơn.
- Chạy read-only; không ghi dữ liệu.

## Kết quả

| Hạng mục | Kết quả |
|---|---:|
| Tài khoản kiểm tra | `13` |
| Tài khoản đạt | `13/13 PASS` |
| Lỗi API tra cứu sản phẩm/triệu chứng | `0` |
| Dòng thiếu mã hoặc tên sản phẩm | `0` |
| Dòng thiếu giá | `0` |
| Dòng thiếu disclaimer/cảnh báo tham khảo | `0` |
| Dòng thiếu metadata rule/source | `0` |
| Dòng triệu chứng thiếu lý do | `0` |
| Dòng triệu chứng không có tồn khả dụng | `0` |
| UI hỗ trợ disclaimer và trạng thái tồn | `2/2 PASS` |

Kết quả mẫu tra cứu mã `B012` trả tên sản phẩm, giá và cảnh báo chuyên môn. Truy vấn triệu chứng `ho` trả các sản phẩm có lý do dạng `Triệu chứng: ho | Có thể bán theo kho được phân quyền`; không có dòng bị đánh dấu như chẩn đoán.

## Bằng chứng

- Script: `scripts/verify_uat016_product_symptom_lookup.js`.
- Lệnh: `node scripts/verify_uat016_product_symptom_lookup.js`.
- Kết quả chạy ngày `2026-07-29`: `PASS`, `13/13` tài khoản.
- Chế độ: chỉ đọc DB `medtest`.

## Kết luận nghiệm thu

UAT-016 đạt yêu cầu kỹ thuật cho pilot: tra cứu sản phẩm và tìm theo triệu chứng có kết quả, có giá/lý do, hiển thị trạng thái dữ liệu và disclaimer; hệ thống không trình bày kết quả như chẩn đoán hoặc kê đơn.
