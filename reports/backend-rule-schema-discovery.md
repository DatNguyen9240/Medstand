# Backend Rule v1 — Schema Discovery Report

**Status:** `DB_READONLY_RUN_COMPLETE_OPEN_GAPS`  
**Owner:** Agent A  
**Ngày:** 17/07/2026  
**Environment:** `medtest` (không ghi credential/server vào report)

## Kết quả đã xác nhận

| Nhóm | Bằng chứng runtime | Kết luận |
|---|---|---|
| Invoice status | Đọc `AR_InvoiceStatusTbl` và `AR_OrderStatusTbl` | Invoice hoàn tất dùng `3/6/7/8`; `1/2` không được tính; order `10` là hủy |
| Revenue basis | Đối soát `AR_OrderAndReturnView.TotalAmount` | Option C khớp nguồn mạnh nhất hiện có |
| Return | Detail có 21.102 dòng, view có 21.129 dòng; cả hai có 21.094 dòng có giá trị; tổng view bằng âm tổng detail | `PASS_RETURN_SIGNED_ONCE`; cộng trực tiếp return `99`, không đảo dấu lần hai |
| Product aggregation | Chênh lệch tổng và collected đều bằng `0` | `PASS_NO_PRODUCT_ROW_MULTIPLICATION` |
| Payment state | Status `8` có `isReceiptStatus=1`; discovery thấy 110 candidate payment columns | Chưa chứng minh thu đủ/thu một phần; `DoanhThuDaThu` vẫn là proxy/draft |
| Available stock | Chưa tìm được nguồn reservation/held/blocked/damaged/expired đã xác nhận | `AvailableStock=NULL`, `PHYSICAL_ONLY_UNVERIFIED` |
| Check-in/visit | 448 object candidate đã quét, không có cột check-in được chứng minh | `CHECKIN_SOURCE_UNAVAILABLE` |
| Program approval | Có 4 candidate columns | Cần owner xác nhận mapping `Approved/Active/Stackable` |
| Deployed procedures | 8 procedure có definition, `modify_date`, SHA-256 và RuleVersion marker | `MEDTEST_POSTDEPLOY_PASS` |

## Status dictionary quan sát trên `medtest`

Invoice: `0=Lập hóa đơn`, `1=Đơn đã xử lý chưa chuyển kho`, `2=Đã chuyển xuống kho`, `3=Đã xuất hàng`, `6=Đã đi gửi hàng`, `7=Khách đã nhận hàng`, `8=Đã thu tiền`, `10=Khách từ chối nhận hàng`.

Order: `-2=TDV Kiểm tra lại`, `-1=Đơn nháp`, `0=Chờ duyệt`, `10=Đã hủy`.

Đây là evidence runtime của DB test, chưa thay thế chữ ký owner ERP cho production.

## Blocker còn mở

- Xác nhận VAT/net/gross của `TotalAmount` với tài chính.
- Đối soát payment ledger để đổi nhãn thu tiền từ proxy thành metric kế toán.
- Xác định nguồn available stock và freshness thật.
- Xác định bảng check-in/visit thật.
- Xác nhận program approval/active/stackable và warehouse scope theo owner nghiệp vụ.

## Cách chạy lại

```text
sqlcmd -S <server> -d medtest -E -i sql/diagnostics/Business_Rule_V1_Schema_Discovery.sql
sqlcmd -S <server> -d medtest -E -i sql/diagnostics/Business_Rule_V1_Revenue_Option_C_Verification.sql
sqlcmd -S <server> -d medtest -E -i sql/diagnostics/Business_Rule_V1_PostDeploy_Verification.sql
```

Không đưa password/token vào report. Kết luận hiện tại là `MEDTEST_SQL_RUNTIME_PASS`; n8n published runtime và business approval vẫn `PENDING`.
