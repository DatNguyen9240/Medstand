# UAT-011 — Test gợi ý đơn hàng

## Trạng thái

`PASS` — kiểm tra runtime read-only đạt `13/13` tài khoản trên DB `medtest`.

## Kịch bản kiểm tra

Mỗi tài khoản được gọi `dbo.API_GoiYDonHang_AI` với khách đại diện trong `config/uat/account-fixtures.v1.json`, `TopN = 10`. Không tạo đơn và không ghi dữ liệu.

Kiểm tra các điều kiện:

- Có kết quả gợi ý hoặc thông báo nghiệp vụ hợp lệ.
- Không có lỗi API/SQL.
- Mỗi dòng có lý do (`RecommendationReason`, `ChiTiet`, `Gợi ý` hoặc `TrangThai`).
- Không gợi ý sản phẩm hết hạn.
- Không trả kho ngoài allowlist UAT `CTY / DL02 / DL03`.

## Kết quả

| Hạng mục | Kết quả |
|---|---:|
| Tài khoản kiểm tra | `13` |
| Tài khoản đạt | `13/13 PASS` |
| Tổng lỗi API | `0` |
| Tài khoản không có gợi ý | `0` |
| Dòng thiếu lý do | `0` |
| Dòng gợi ý hàng hết hạn | `0` |
| Dòng ngoài kho được phép | `0` |

Mỗi tài khoản trả 3 gợi ý mẫu. Lý do quan sát được gồm `REORDER_OVERDUE`, `FOCUS_ITEM`, `NEW_CUSTOMER` và `INSUFFICIENT_HISTORY`, phù hợp với dữ liệu lịch sử mẫu.

## Sản phẩm mẫu quan sát

- MB: `B015`, `H006`, `B012`.
- MT/MN: `B012`, `M010`, `Q002` hoặc `C016`, `M010`, `Q002`, tùy khách đại diện.

## Bằng chứng

- Script: `scripts/verify_uat011_order_recommendations.js`.
- Lệnh: `node scripts/verify_uat011_order_recommendations.js`.
- Chế độ: read-only runtime; không mutation.

## Kết luận nghiệm thu

UAT-011 đạt. Luồng gợi ý đơn hàng có kết quả, có lý do, không lỗi 500/API, không gợi ý hàng hết hạn và không lộ tồn ngoài phạm vi kho UAT.
