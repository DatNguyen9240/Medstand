# UAT-020 — Kiểm tra hiệu năng p50/p95

## Trạng thái

`PASS`

Đã đo riêng lớp HTTP thường và truy vấn chatbot AI có xác thực. Cả hai nhóm đều đạt ngưỡng p95 đã chốt; không dùng cảm nhận UI để thay thế số đo.

## Mục tiêu nghiệm thu

| Nhóm | Mục tiêu p95 |
|---|---:|
| API/HTTP thường | Dưới `3.000 ms` |
| Truy vấn AI phức tạp | Dưới `6.000 ms` |

## Kết quả đo hiện tại

### API/HTTP thường — PASS

Ngày đo: `31/07/2026`. Mỗi target chạy `40` request, concurrency `4`.

| Target | Thành công | p50 | p95 | Max | Kết quả |
|---|---:|---:|---:|---:|---|
| `http://localhost:3000/` | 40/40 | 5 ms | 24 ms | 55 ms | PASS |
| `http://localhost:5678/healthz` | 40/40 | 1 ms | 4 ms | 5 ms | PASS |

Bằng chứng: `reports/uat020-infrastructure-load-2026-07-31.json`.

> Phép đo này chỉ xác nhận độ trễ và khả dụng HTTP local; không đại diện cho thời gian xử lý SQL hoặc AI.

### Truy vấn AI có xác thực — PASS

Ngày đo: `31/07/2026`. Chạy qua `/api/gateway`, `40` request, concurrency `4`, dùng fixture khách hàng thuộc phạm vi tài khoản UAT.

| Thành công | p50 | p95 | p99/Max | Throughput | Kết quả |
|---:|---:|---:|---:|---:|---|
| 40/40 (100%) | 2.058 ms | 5.668 ms | 9.785 ms | 1,97 req/s | PASS |

p95 thấp hơn mục tiêu `6.000 ms` là `332 ms`. Có một mẫu đuôi dài `9.785 ms` ở p99/max; ghi nhận để theo dõi, nhưng không làm trượt tiêu chí nghiệm thu p95. Không có response lỗi trong bộ chạy.

Bằng chứng: `reports/uat020-ai-load-2026-07-31.json`.

Token chỉ được gán tạm trong tiến trình kiểm tra và đã được xóa khỏi biến môi trường ngay sau khi chạy; token không được ghi vào report hoặc tài liệu.

## Số liệu lịch sử tham khảo

Kết quả lịch sử chỉ dùng tham khảo, không dùng để đánh dấu PASS bản hiện tại:

| Bộ đo lịch sử | p50 | p95 | Ghi chú |
|---|---:|---:|---|
| Manager live, 31 câu | 1.831 ms | 5.159 ms | Đạt ngưỡng thời gian nhưng chỉ 20/31 ca chức năng đạt |
| Sale live, 31 câu | 1.875 ms | 6.874 ms | Vượt mục tiêu AI 874 ms; chỉ 20/31 ca chức năng đạt |
| Controlled load, 40 request/concurrency 4 | 1.915 ms | 3.564 ms | Tốc độ đạt nhưng success rate chỉ 70% do 12 lỗi HTTP 500 |

Các số liệu lịch sử từng có lỗi nghiệp vụ; kết quả PASS hiện tại dựa trên report mới 40/40 thành công.

## Lệnh chạy lại AI có xác thực

Chỉ chạy khi có token UAT hợp lệ và dữ liệu khách/sản phẩm thuộc phạm vi tài khoản:

```powershell
$env:MEDSTAND_AUTH_TOKEN='<token-UAT>'
node scripts/test_natural_chat_system.js load --endpoint http://localhost:3000/api/gateway --transport gateway --requests 40 --concurrency 4 --max-p95 6000 --min-success-rate 99 --customer-id '<CUSTOMER_ID>' --product-id '<PRODUCT_ID>' --report reports/uat020-ai-load-2026-07-31.json
```

Không ghi token thật vào tài liệu, report hoặc Git. Sau khi chạy nên xóa biến môi trường khỏi phiên terminal.

## Điều kiện đánh dấu PASS

- API thường có p95 dưới `3.000 ms` và không có lỗi request trong bộ đo.
- AI phức tạp có p95 dưới `6.000 ms`.
- Bộ AI đạt tối thiểu `99%` success; response lỗi không được tính là mẫu hiệu năng thành công.
- Report ghi rõ thời gian, môi trường, số request, concurrency, tài khoản/role đã ẩn danh và ngoại lệ nếu có.
