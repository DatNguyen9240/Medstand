# Field Compatibility Map v1

**Status:** `DRAFT_FOR_COORDINATOR_REVIEW`  
**Contract:** `1.0.0-draft`  
**Rule:** Agent B chỉ dùng mapping sau khi Coordinator khóa Draft Contract.

## Mapping

| Field cũ | Field mới | Precedence | Null semantics | Deprecation | Fallback được phép |
|---|---|---|---|---|---|
| `TonKho` | `PhysicalStock` | `PhysicalStock` trước; `TonKho` chỉ legacy alias | Null = unknown | `LEGACY_DEFAULT` | Chỉ dùng `TonKho` nếu metadata báo legacy và không có `PhysicalStock` |
| Không có | `AvailableStock` | Canonical | Null = chưa xác định, không phải 0 | `ACTIVE_DRAFT` | Không fallback sang `PhysicalStock` |
| Không có | `StockDataStatus` | Canonical | Null = unknown | `ACTIVE_DRAFT` | Không suy ra từ số lượng |
| Không có | `StockUpdatedAt` | Canonical khi backend có source | Null = timestamp chưa xác định | `PENDING_SCHEMA` | Không dùng giờ trình duyệt |
| `Nhom` | `CustomerTier` | `CustomerTier` canonical sau Coordinator chốt | Null = chưa phân loại | `MAPPING_REQUIRED` | Không dùng Tier để suy ra Risk |
| `ValueSegment` | `CustomerTier` | Alias chỉ khi map được duyệt | Null = chưa phân loại | `MAPPING_REQUIRED` | Không tự đổi tên field |
| Không có | `RiskLevel` | Canonical độc lập | Null = `UNKNOWN` | `ACTIVE_DRAFT` | Không dùng `CustomerTier=C` |
| `DoTinCay=CAO/THẤP` | `DoTinCay` semantics mới | New semantics trước legacy | Null = unknown | `LEGACY_SEMANTICS` | Không hiển thị “tin cậy cao” nếu chỉ là điều kiện đủ mẫu |
| Không có | `RuleSource` | Canonical | Null = source chưa xác định | `ACTIVE_DRAFT` | Không suy ra APPROVED |
| Không có | `RuleVersion` | Canonical | Null = version chưa xác định | `ACTIVE_DRAFT` | Không lấy version từ UI |
| Không có | `LastPurchaseSource` | Canonical | Null = source chưa xác định | `ACTIVE_DRAFT` | Không suy ra từ check-in |
| Không có | `LastVisitStatus` | Canonical | `CHECKIN_SOURCE_UNAVAILABLE` không đồng nghĩa “chưa ghé” | `ACTIVE_DRAFT` | Không lấy ngày mua thay check-in |
| Không có | `ProgramStatus` | Canonical | Null = status chưa xác định | `PENDING_SCHEMA` | Không hiển thị đang áp dụng |
| Không có | `ActionStatus` | Canonical | Null = approval chưa xác định | `ACTIVE_DRAFT` | Không áp giá/chiết khấu |

## Nullable normalization

- Dùng `value ?? fallback` khi fallback được map chính thức.
- Không dùng `value || fallback` cho field có thể có giá trị `0`, `false` hoặc chuỗi rỗng có nghĩa nghiệp vụ.
- `AvailableStock=null` phải hiển thị “Chưa xác định” và chặn đề xuất số lượng.
- Thiếu field bắt buộc là `CONTRACT_DRIFT`, không âm thầm dùng field khác.
- Mọi compatibility fallback phải có `field precedence`, `null semantics` và
  `deprecation status`; thiếu một trong ba thì không được dùng.

## Error/state mapping

| API status/errorCode | UI state |
|---|---|
| `SUCCESS` + `data.length > 0` | Success |
| `NO_DATA` | No data |
| `OUT_OF_SCOPE` | Out of scope; không render data |
| `VALIDATION_ERROR` | Validation error; không chạy mutation/SQL |
| `SYSTEM_ERROR` | System error; không lộ SQL/token |
| Missing required field | Contract drift; ghi ApiCode/field/version/requestId |
