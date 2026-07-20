# Backend Rule v1 - Observed DB Evidence (2026-07-17)

**Status:** `SUPERSEDED_HISTORICAL_SNAPSHOT`
**Database:** `medtest`
**Evidence source:** SSMS screenshots from the read-only discovery script.

> Báo cáo này là snapshot discovery ban đầu và không còn là trạng thái hiện hành. Kết quả sau compile/import/post-deploy nằm tại [`backend-rule-schema-discovery.md`](backend-rule-schema-discovery.md) và [`backend-rule-medtest-runtime-result.json`](backend-rule-medtest-runtime-result.json). Các câu “runtime pending/not imported” bên dưới chỉ mô tả thời điểm snapshot cũ.

## Confirmed observations

### Invoice status dictionary and distribution

The DB supplied `AR_InvoiceStatusTbl` dictionary:

| StatusID | StatusName | OrderStatusID | StockStatusID | IsReceiptStatus |
|---:|---|---:|---:|---:|
| 0 | Lập hóa đơn | 4 | NULL | 0 |
| 1 | Đơn đã xử lý chưa chuyển kho | 4 | NULL | 0 |
| 2 | Đã chuyển xuống kho | 2 | 4 | 0 |
| 3 | Đã xuất hàng | 3 | 6 | 0 |
| 6 | Đã đi gửi hàng | 6 | NULL | 0 |
| 7 | Khách đã nhận hàng | 7 | NULL | 0 |
| 8 | Đã thu tiền | 8 | NULL | 1 |
| 10 | Khách từ chối nhận hàng | 10 | NULL | 0 |

| StatusID | InvoiceCount | FirstDocumentDate | LastDocumentDate |
|---:|---:|---|---|
| 1 | 1,089 | 2025-01-04 | 2026-07-13 |
| 2 | 2,154 | 2025-04-01 | 2026-05-20 10:20:30.710 |
| 3 | 43,557 | 2025-01-02 | 2026-03-11 |
| 8 | 144,290 | 2025-01-02 | 2026-03-11 |

The observed invoice rows use StatusID 1, 2, 3, and 8. The dictionary meaning is now known, but the revenue-recognition rule is still a business decision: status 8 is the only status marked `isReceiptStatus=1`; statuses 3 and 7 represent shipment/delivery milestones. Do not silently change all APIs to status 8 without confirming the KPI definition.

The supplied `AR_OrderStatusTbl` dictionary additionally maps `-2` to `TDV kiểm tra lại`, `-1` to `Đơn nháp`, `0` to `Chờ duyệt`, `4` to `Đơn đã xử lý chưa chuyển kho`, and `10` to `Đã hủy` (`isCancelStatus=1`).

### Invoice and detail fields

- `AR_InvoiceTbl.StatusID` exists; `COL_LENGTH` returned `4`.
- `AR_InvoiceTbl.TotalAmount` was not found by `COL_LENGTH`.
- Visible header fields include `DocumentDate`, `DueDate`, `BaseTotal`, `VATAccID`, `UserUpdate`, `DateUpdate`, and `DateCreate`.
- Visible detail fields include `Amount`, `SourceAmount`, `VATID`, `VATPercent`, `VATAmount`, `DiscountAmount`, `AmountCost`, `ExportAmount`, and `ExpireDate`.

Later order/return reconciliation established `TotalAmount` as the strongest net-after-discount basis. VAT remains zero in the observed order/return aggregates.

### Critical view evidence: `AR_OrderAndReturnView`

The supplied view definition shows:

- The positive branch reads `AR_OrderTbl` + `AR_OrderDetailTbl`, not `AR_InvoiceTbl`.
- The return branch reads `AR_ReturnTbl` + `AR_ReturnDetailTbl`.
- Return rows are emitted with hardcoded `StatusID = 99`, negative quantity/amounts, and `PONo = NULL`.
- Returns are included when `COALESCE(AR_ReturnTbl.KhongTruDSWeb, 0) = 0`.
- The view does not filter order status, invoice status, VAT, or approval state.

Coordinator approved the order-and-return view as the source for Option C metrics. The procedure must still be described as order/return based, not invoice based.

### Warehouse/program/procedure evidence

- `CF_StoreHouseTbl` exposes store-house fields and `BranchID`; `CF_StoreHouseGroupTbl` and `CF_BranchTbl` are present in the candidate metadata.
- `AR_PromotionTbl` exposes date fields; `AR_SanPhamTrongTamTbl` exposes `FromDate` and `ToDate`.
- The eight current Agent A API procedures were found with definitions and modification dates.
- `AI_GetBusinessRuleConfig` was not shown as deployed, which is expected because the migration has not been imported.

## Still required before changing SQL rules

1. ERP dictionary mapping for `StatusID` 1, 2, 3, and 8.
2. Runtime verification of `AR_OrderAndReturnView.TotalAmount` after the source procedure is imported.
3. Return/adjustment relationship and exclusion formula.
4. Reservation/blocked/damaged/expired stock fields and freshness timestamp.
5. Check-in/visit source and valid-visit status.
6. Program approval/active/stackable fields.
7. User-to-branch/store-house scope for the main warehouse, `DL02`, and `DL03`.
8. Status names for `AR_InvoiceStatusTbl` and `AR_OrderStatusTbl` IDs 1, 2, 3, and 8.
9. SQL Server compile/fixture evidence for Coordinator Option C.

## View aggregate evidence

The supplied aggregate of `AR_OrderAndReturnView` contains these status groups:

| StatusID | Rows | Amount | TotalAmount |
|---:|---:|---:|---:|
| -2 | 9 | 6,240,000 | 6,240,000 |
| -1 | 101 | 65,375,000 | 65,296,550 |
| 0 | 619 | 1,830,504,000 | 1,829,710,040 |
| 1 | 774 | 3,182,315,000 | 3,182,315,000 |
| 2 | 20,254 | 13,446,655,400 | 13,302,680,104 |
| 3 | 17,533 | 12,604,116,408 | 12,431,568,761 |
| 4 | 431 | 490,854,200 | 484,492,874 |
| 8 | 131,271 | 178,686,176,358 | 185,221,714,535 |
| 10 | 8 | 2,635,000 | 2,635,000 |
| 99 (return) | 21,129 | -7,497,456,972 | -6,230,249,568 |

This proves the current view includes draft/pending/cancelled order states and returns. It also shows an unresolved `Amount` versus `TotalAmount` difference, especially for StatusID 8. VAT/net/gross semantics remain unconfirmed.

## Order detail aggregate evidence (status 3/8)

The supplied `AR_OrderTbl` + `AR_OrderDetailTbl` aggregate returned no rows for StatusID 7 and:

| StatusID | DetailRows | Amount | TotalAmount | DiscountAmount |
|---:|---:|---:|---:|---:|
| 3 | 17,533 | 12,604,116,408 | 12,431,568,761 | 172,547,647 |
| 8 | 131,270 | 178,686,176,358 | 185,221,714,535 | 2,464,461,823 |

`TotalAmount` is lower than `Amount` for status 3 but higher for status 8. This cannot be safely labeled net/gross/VAT from names alone; the remaining order-detail amount/VAT fields and business formula must be inspected.

The supplied `AR_OrderDetailTbl` metadata shows these financial columns:

```text
UnitPrice       decimal
SourceAmount    decimal
Amount          decimal
DiscountPercent decimal
DiscountAmount  decimal
TotalAmount     decimal
VATQuantity     decimal
AmountSPTT      decimal
```

There is no `VATAmount` or `VATPercent` column on this table. `VATQuantity` and `AmountSPTT` require ERP/data-owner interpretation before they can be used in a net/gross formula.

The supplied formula aggregate adds:

| StatusID | Quantity x UnitPrice | SourceAmount | Amount | DiscountAmount | TotalAmount | VATQuantity | AmountSPTT |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 3 | 12,604,116,400.00 | 0 | 12,604,116,408 | 172,547,647 | 12,431,568,761 | 0 | 0 |
| 8 | 187,686,176,384.24 | 0 | 178,686,176,358 | 2,464,461,823 | 185,221,714,535 | 0 | 0 |

For status 3, `Amount - DiscountAmount = TotalAmount`. For status 8, `Quantity x UnitPrice - DiscountAmount` differs from `TotalAmount` only by about 26.24 (rounding), while `Amount` is roughly 9 billion lower than the calculated unit-price basis. Therefore `Amount` is not a safe revenue basis for this dataset; `TotalAmount` is the strongest observed net-after-discount candidate, pending return reconciliation and business sign-off.

All six financial fields queried from `sys.computed_columns` have `is_computed = 0`; their values are populated by application/import logic rather than a SQL computed-column formula.

## Return formula evidence

The supplied valid-return aggregate (`AR_ReturnTbl.Status = 1` and `KhongTruDSWeb = 0`) is:

| DetailRows | Quantity x UnitPrice | SourceAmount | Amount | DiscountAmount | DiscountAmount2 | VATAmount | TotalAmount |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 21,102 | 7,505,116,972 | 6,916,200,972 | 7,497,456,972 | 1,265,790,654 | 1,416,750 | 0 | 6,230,249,568 |

The relation is exact:

```text
7,497,456,972 - 1,265,790,654 - 1,416,750 = 6,230,249,568
```

Therefore `TotalAmount` is the strongest observed net-after-discount basis for both orders and returns. Coordinator approved Option C: fulfilled sales use statuses 3/6/7/8 plus return 99; collected revenue uses status 8 plus return 99. Source implementation is complete; runtime import remains pending.

The read-only comparison fixture is `sql/diagnostics/Business_Rule_V1_Revenue_Option_C_Verification.sql`. It emits expected fulfilled sales, expected collected revenue, return deduction, the legacy `Amount` comparison, return formula difference, and daily values for later API runtime reconciliation. It contains no data/schema mutation statement.

No migration, procedure import, n8n publish, or data mutation was performed.
