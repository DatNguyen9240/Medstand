# UAT-010 — Kiểm tra độ mới và ngày chốt dữ liệu

## Trạng thái

`PASS` — đạt điều kiện nghiệm thu trên DB `medtest` và kiểm tra tĩnh giao diện.

## Quy tắc ngày áp dụng

- Múi giờ nghiệp vụ: `Asia/Bangkok (UTC+07:00)`.
- Ngày hệ thống DB khi kiểm tra: `29/07/2026`.
- Ngày chốt dùng cho bài kiểm tra: cuối ngày `28/07/2026`.
- Truy vấn theo ngày lấy trọn ngày được chọn và không được trả bản ghi sau ngày chốt.
- Giao diện doanh số lấy khoảng ngày từ chính dữ liệu API trả về; công nợ dùng trường `AsOfDate/Ngày chốt`.

## Kết quả kiểm tra

| Hạng mục | Kết quả |
|---|---:|
| Múi giờ DB | `UTC+07:00 — PASS` |
| Tài khoản không trả dữ liệu sau ngày chốt | `13/13 PASS` |
| Dòng doanh số tương lai trong nguồn | `0` |
| Hóa đơn tương lai trong nguồn | `0` |
| Đơn hàng tương lai trong nguồn | `0` |
| UI doanh số hiển thị khoảng dữ liệu | `PASS` |
| UI công nợ hỗ trợ ngày chốt `AsOfDate` | `PASS` |

Trong lần kiểm tra này, dữ liệu doanh số thực tế mới nhất được trả về là `20/07/2026`. Giao diện doanh số suy ra ngày cuối từ các dòng thực tế nên không trình bày `28/07/2026` như một ngày có doanh số khi API không trả dữ liệu ngày đó.

## Phạm vi kỹ thuật

- API kiểm tra live: `dbo.API_DoanhSo_AI`.
- Nguồn đối chiếu: `AR_OrderAndReturnView`, `AR_InvoiceTbl`, `AR_OrderTbl`.
- Giao diện kiểm tra: `chatbot-widget/js/chatbot.js`, `chatbot-widget/js/chatbot-renderers-medstand.js`.
- Script chỉ đọc: `scripts/verify_uat010_data_freshness.js`.
- Không ghi hoặc thay đổi dữ liệu DB.

## Kết luận nghiệm thu

UAT-010 đạt: dữ liệu không tính vượt ngày truy vấn, múi giờ hệ thống đúng UTC+7 và giao diện có thông tin khoảng dữ liệu/ngày chốt cho các báo cáo chính.
