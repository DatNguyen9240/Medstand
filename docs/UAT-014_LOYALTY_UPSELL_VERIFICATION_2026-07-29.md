# UAT-014 — Test tích lũy và upsell

## Trạng thái

`PASS` — kiểm tra runtime read-only đạt `13/13` tài khoản trên DB `medtest`.

## Phạm vi kiểm tra

- `dbo.API_TichLuy_AI`: mốc đã đạt, mốc tiếp theo, số tiền còn thiếu, phần trăm tiến độ, quà đã đạt/quà kế tiếp và sản phẩm trọng tâm chưa mua.
- `dbo.API_UpsellGoiY_AI`: gợi ý bán thêm theo khách đại diện, lý do gợi ý, tồn khả dụng và giới hạn `CTY / DL02 / DL03`.
- Phạm vi khách chuẩn: `AR_GetObjectByUserFnc`.
- Kiểm tra dữ liệu đầu vào là read-only; không tạo đơn, không ghi tích lũy và không sửa dữ liệu.

## Kết quả

| Hạng mục | Kết quả |
|---|---:|
| Tài khoản kiểm tra | `13` |
| Tài khoản đạt | `13/13 PASS` |
| Khách đại diện trả đúng | `13/13` |
| Rò rỉ scope tích lũy | `0` |
| Sai công thức mốc/còn thiếu/phần trăm | `0` |
| Dòng thiếu trường tích lũy bắt buộc | `0` |
| Tài khoản có sản phẩm trọng tâm để gợi ý | `13/13` |
| Tài khoản có gợi ý upsell | `13/13` |
| Dòng upsell thiếu lý do | `0` |
| Dòng upsell không có tồn khả dụng | `0` |
| Dòng upsell trùng sản phẩm | `0` |
| Lỗi API | `0` |

Giá trị tích lũy quan sát được đối soát được với `Target`, `Remaining` và `Percentage`. Chương trình trả `ProgramStatus = REFERENCE_ONLY_APPROVAL_REQUIRED`; đây là trạng thái nghiệp vụ hiện tại của chương trình, không phải lỗi runtime.

## Bằng chứng

- Script: `scripts/verify_uat014_loyalty_upsell.js`.
- Lệnh: `node scripts/verify_uat014_loyalty_upsell.js`.
- Kết quả chạy ngày `2026-07-29`: `PASS`, `13/13` tài khoản.
- Chế độ: chỉ đọc DB `medtest`; không mutation.

## Kết luận nghiệm thu

UAT-014 đạt yêu cầu kỹ thuật cho pilot: Sale/Manager xem được tiến độ tích lũy và nhận gợi ý upsell có lý do, có tồn khả dụng, đúng phạm vi khách/kho. Việc phê duyệt nội dung và hiệu lực chương trình tích lũy vẫn thuộc Business Owner.
