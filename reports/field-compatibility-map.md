# Business Rule v1 — Field Compatibility Map

**Owner:** Agent A  
**Status:** `DRAFT_MEDTEST_RUNTIME_VERIFIED`  
**Contract status:** chưa phải Contract Pack final; Agent B không được đổi API field theo file này nếu Coordinator chưa khóa Draft Contract.

## 1. Mapping hiện tại

| Field cũ/đang dùng | Field mới/bổ sung | Trạng thái | Quy tắc tích hợp UI |
|---|---|---|---|
| `TonKho` | `PhysicalStock` | `LEGACY_DEFAULT`, giữ để tương thích | Có thể hiển thị là tồn vật lý; không gọi là tồn khả dụng |
| Không có | `AvailableStock` | Mới, nullable | `NULL` phải hiển thị “Chưa xác định”, không đổi thành `0` |
| Không có | `StockDataStatus` | Mới | `PHYSICAL_ONLY_UNVERIFIED` nghĩa là chưa đủ dữ liệu reservation/blocked |
| Không có | `StockUpdatedAt` | Chưa có source | Không được render cho tới khi schema discovery tìm được timestamp thật |
| `Nhom` | `CustomerTier` / `ValueSegment` | Mapping cần Coordinator chốt | A/B/C là value tier; không dùng thay cho risk |
| Không có | `RiskLevel` | Mới | Hiển thị độc lập `LOW/MEDIUM/HIGH`; có thể đồng thời `Tier=A` |
| `DoTinCay=CAO/THẤP` cũ | `DoTinCay=PERSONAL_CYCLE_ELIGIBLE/INSUFFICIENT_HISTORY` | Đã đổi semantics | Không hiển thị “tin cậy cao”; đây chỉ là điều kiện đủ mẫu |
| Không có | `RuleSource` | Mới | `LEGACY_DEFAULT` nghĩa là chưa có cấu hình `APPROVED` |
| Không có | `RuleVersion` | Mới | Hiển thị version/source khi có; không tự suy ra version từ UI |
| Không có | `LastPurchaseSource` | Mới | Hiện tại `AR_InvoiceTbl` |
| Không có | `LastVisitStatus` | Mới | `CHECKIN_SOURCE_UNAVAILABLE` hiển thị “Chưa có dữ liệu ghé”, không gọi là chưa ghé |
| Không có | `ActionStatus` | Mới ở khuyến mãi | `REFERENCE_ONLY_APPROVAL_REQUIRED` là tham khảo, không phải lệnh áp giá |

## 2. Error/empty contract cần giữ nguyên

| Code | Ý nghĩa UI |
|---|---|
| `NO_DATA` | Không có bản ghi thỏa điều kiện; không tự thay bằng mock |
| `OUT_OF_SCOPE` | Có dữ liệu nhưng user không được xem; không hiển thị dữ liệu gợi ý |
| `VALIDATION_ERROR` | Input thiếu/sai; không được chạy SQL nghiệp vụ |
| `SYSTEM_ERROR` | Lỗi hệ thống; không hiển thị chi tiết SQL/token |

## 3. Các field chưa được phép chốt

- `CustomerTier` và `ValueSegment`: cần Coordinator chốt một tên canonical.
- `StockUpdatedAt`: chờ schema discovery.
- `ProgramStatus`, `Approved`, `Stackable`: chờ schema chương trình.
- `RevenueBasis`: hiện là `AR_OrderAndReturnView.TotalAmount`; đã đối soát Option C trên `medtest`, nhưng chưa phải bằng chứng VAT/net cuối cùng.
- `StatusID`: dictionary `medtest` đã được quan sát và source dùng invoice `3/6/7/8`; vẫn cần owner ERP ký trước production.

## 4. Hướng dẫn cho Agent B

1. Chỉ mock theo field trong Draft Contract.
2. Không map `AvailableStock=null` thành số 0.
3. Không hiển thị `REFERENCE_ONLY_APPROVAL_REQUIRED` như mức chiết khấu đã duyệt.
4. Tách card Tier và Risk.
5. Hiển thị `RuleSource=LEGACY_DEFAULT` như “quy tắc mặc định tạm thời”, không gọi là AI đã được phê duyệt.
6. Nếu thiếu field, dùng state rõ ràng thay vì tự đoán.
