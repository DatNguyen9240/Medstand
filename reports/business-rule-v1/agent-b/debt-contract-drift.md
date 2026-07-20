# Debt contract drift — handoff to Agent A / Coordinator

## Observed source gap

`@cong_no_khach_hang` SQL response hiện chỉ có các field legacy như `TenKH`, `TongNo`, `MaKH`, `PhanLoai`; chưa chứng minh đủ:

- `ObjectType=CUSTOMER`, `CustomerID`, `CustomerName`;
- `TotalDebt`, `OverdueDebt`, `PaymentStatus`;
- `AssignedEmployeeName`, `BranchName`, `DebtSize`, `PriorityLevel`;
- `MaxOverdueDays`, `OpenInvoiceCount`;
- `responseMetadata.debtSummary` (KPI).

Renderer không suy đoán từ các field này để dựng danh sách canonical. Khi thiếu, UI chặn an toàn và phát `CONTRACT_DRIFT`.

`@cong_no_chi_tiet` có một số alias legacy cho invoice/summary, nhưng chưa chứng minh đủ `AssignedEmployeeName`, `Address`, `OverallStatus`, `RecommendedAction`, `OverdueDebt`, `NotDueDebt`. Renderer chỉ dùng alias đã có trong compatibility map và hiển thị “Chưa xác định” khi nullable.

## Required Agent A response

Bàn giao response mẫu có `ApiCode`, `contractVersion`, `requestId`, `ObjectType`, canonical customer fields, metadata KPI/recommendation và error taxonomy. Không đổi field bằng frontend để che drift.
