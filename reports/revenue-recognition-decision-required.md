# Revenue Recognition Decision Required

**Status:** `SOURCE_OPTION_C_ACCEPTED_DB_RECONCILIATION_PENDING`

**Decision:** expose both fulfilled sales and collected revenue; preserve the legacy `Doanh Số` field as the fulfilled-sales value for backward compatibility.

## Technically established

- `AR_OrderAndReturnView` contains `AR_OrderTbl` rows plus negative `AR_ReturnTbl` rows.
- `TotalAmount` is consistent with net-after-discount order and return formulas.
- `Amount` is not consistent for current StatusID 8 data and should not remain the declared revenue basis.
- Return rows use StatusID 99 and are already negative in the view.
- The view currently includes draft, pending, fulfilled, paid, cancelled, and return states.

## Decision options

### Option A - collected revenue

```text
Positive rows: StatusID = 8
Return rows: StatusID = 99
Value: TotalAmount
```

Meaning: only paid orders, minus eligible returns.

### Option B - fulfilled sales

```text
Positive rows: StatusID IN (3, 6, 7, 8)
Return rows: StatusID = 99
Value: TotalAmount
```

Meaning: shipped/in-transit/delivered/paid orders, minus eligible returns.

## Required owner response

Coordinator selected both metrics (Option C):

- `DoanhSoDaXuat` (fulfilled sales)
- `DoanhThuDaThu` (collected revenue)

Source changes are authorized. SQL Server import/runtime activation remains separately gated and is not authorized by this document.

## Current gate

```text
SOURCE OPTION C: ACCEPTED
STATIC CHECKS: PASS
DB RECONCILIATION: PENDING
PROCEDURE IMPORT: BLOCKED
N8N PUBLISH: BLOCKED
```

Run `sql/diagnostics/Business_Rule_V1_Revenue_Option_C_Verification.sql` on `medtest` before importing the procedure. The script checks the signed return exactly once, exposes the status-8 payment-ledger gate, reconciles product aggregation without `DISTINCT`, and emits branch/manager/employee/date fixtures.

`DoanhThuDaThu` remains a draft status-based metric until an actual receipt/payment source proves full versus partial collection. `AR_InvoiceStatusTbl.isReceiptStatus = 1` alone is not sufficient proof of collected amount.
