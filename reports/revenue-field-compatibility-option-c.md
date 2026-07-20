# Revenue Field Compatibility - Coordinator Option C

**Status:** `SOURCE_CONTRACT_APPROVED_RUNTIME_PENDING`

| Existing field | New/clarified field | Compatibility rule |
|---|---|---|
| `Amount` (dashboard daily) | `DoanhSoDaXuat` | `Amount` is preserved as the numeric fulfilled-sales value |
| `Doanh Số` | `Doanh Số Đã Xuất/Giao` | Both expose fulfilled sales for backward compatibility |
| None | `DoanhThuDaThu` / `Doanh Thu Đã Thu` | New collected-revenue metric |
| `RevenueBasis=AR_OrderAndReturnView.Amount` | `RevenueBasis=AR_OrderAndReturnView.TotalAmount` | Source correction backed by DB evidence |
| None | `RevenueRecognition` | `FULFILLED=3,6,7,8;COLLECTED=8;RETURN=99` |

UI must not add the two metrics together. Returns are already negative and are included in both metric scopes.

The legacy `Doanh Số` field ranks entities by fulfilled sales. SQL Server import and runtime validation remain pending.
