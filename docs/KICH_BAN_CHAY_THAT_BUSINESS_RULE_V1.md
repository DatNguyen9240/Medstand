# Kịch bản chạy thật Business Rule v1 trên DB test

**Mục đích:** hướng dẫn Coordinator chạy từng gate trên `medtest`, kiểm tra bằng chứng rồi mới cho phép import procedure và kiểm thử n8n/UAT.

**Phạm vi:** Chỉ DB test/UAT. Không chạy trên production, không ghi credential vào file, không publish workflow khi chưa có approval riêng.

## Trạng thái trước khi bắt đầu

```text
BASELINE: FROZEN_FOR_IMPLEMENTATION
SOURCE STATIC CHECK: PASS
DB RUNTIME: MEDTEST_POSTDEPLOY_PASS
PROCEDURE IMPORT: DONE_ON_MEDTEST
N8N PUBLISH: DONE_WITH_BACKUP
```

## Tiến độ thực tế đã có ngày 17/07/2026

Runbook này mô tả đường chạy đầy đủ từ đầu, nhưng phiên hiện tại **không phải chạy lại toàn bộ**. Các bằng chứng người dùng đã chạy trên `medtest` được ghi nhận như sau:

| Hạng mục | Trạng thái hiện tại | Evidence |
|---|---|---|
| Schema discovery | `DONE` | Danh sách object/column và procedure definition đã trả kết quả |
| Order/invoice status dictionary | `DONE` | Ý nghĩa status `0,1,2,3,6,7,8,10` đã được cung cấp |
| Aggregate `AR_OrderAndReturnView` theo status | `DONE` | Có row count, `Amount`, `TotalAmount`, gồm return `99` âm |
| Order amount/discount/VAT fields | `DONE` | Đã đối chiếu status `3` và `8`; `TotalAmount` là basis mạnh nhất hiện có |
| Return detail formula | `DONE` | `Amount - DiscountAmount - DiscountAmount2 = TotalAmount` |
| Revenue Option C | `SOURCE_ACCEPTED` | Status `3,6,7,8` cộng return `99`; source static pass |
| Payment ledger/full-versus-partial collection | `PARTIAL` | `R06–R07` đã chạy; có 110 candidate columns nhưng chưa chốt ledger chính thức |
| Product aggregation reconciliation | `PASS` | `R08` có hai chênh lệch bằng `0`; không nhân dòng sản phẩm |
| Latest pre-deploy gate | `PASS` | Đã chụp definition/checksum trước import |
| Procedure import/post-deploy | `MEDTEST_PASS` | Migration và 8 procedure đã compile/import/EXEC; post-deploy pass |
| n8n published runtime | `FULL_ROLE_UAT_AND_AUDIT_PASS_SYMPTOM_BLOCKED` | Active version khớp source; 13/13 account, 312/312 API đọc, 52/52 mutation deny, Playwright và audit pass; symptom-specific bị chặn bởi Redis credential reference |

Nếu DB `medtest` phát sinh dữ liệu hoặc object mới đáng kể, chạy lại discovery, revenue verification và post-deploy để tạo snapshot mới. Không dùng kết quả hiện tại làm bằng chứng cho production.

## 0. Chuẩn bị phiên chạy

Người chạy cần có:

- Quyền truy cập SSMS vào đúng database `medtest`.
- Một tài khoản Manager và một tài khoản TDV của DB test.
- Khoảng ngày test đã thống nhất, ví dụ `2026-01-01` đến `2026-07-17`.
- Snapshot/backup DB test hoặc phương án khôi phục được Coordinator chấp thuận.
- Không ghi server, username, password hoặc token vào Git/report.

Ghi lại trước khi chạy:

```text
Server:
Database: medtest
ExecutedBy:
CheckedAt:
Manager test account:
TDV test account:
FromDate:
ToDate:
```

## 1. Static gate trên máy phát triển

Chạy tại thư mục repo bằng PowerShell:

```powershell
node tests/business_rule_v1_source.test.js
node scripts/test_api_execute_validation.js
node scripts/test_api_execute_response_envelope.js
node scripts/test_shared_auth_guard_contract.js
node scripts/test_symptom_keyword_required_contract.js
git diff --check
```

Kết quả cần có:

```text
STATIC_SOURCE_PASS
STATIC_CONTRACT_PASS
không có whitespace error
```

Nếu fail, dừng trước DB; không import procedure.

## 2. DB read-only gate

Trong SSMS chọn database `medtest`, chạy lần lượt:

1. `sql/diagnostics/Business_Rule_V1_Schema_Discovery.sql`
2. `sql/diagnostics/Business_Rule_V1_Revenue_Option_C_Verification.sql`
3. `sql/diagnostics/Business_Rule_V1_PreDeploy_Verification.sql`

Lưu kết quả vào report nội bộ, không commit dữ liệu nhạy cảm.

### Điều kiện bắt buộc

`R03`:

```text
StatusID 3/6/7/8: tổng theo status không âm; có thể có dòng correction âm
StatusID 99: tổng theo status âm; có thể có dòng correction dương
StatusSignStatus = PASS_*_AGGREGATE_* (không ép mọi dòng cùng dấu)
```

`R04`:

```text
ExpectedFulfilledSales = FulfilledOrderPositiveValue + ReturnSignedValue
ReturnApplicationRule = DIRECT_SIGNED_SUM_NO_SECOND_NEGATION
```

`R05`:

```text
ValuedDetailRows = ValuedViewRows
NetFormulaDifference = 0
ReturnSignDifference = 0
ReturnReconciliationStatus = PASS_RETURN_SIGNED_ONCE
```

`R08`:

```text
ProductAggregationDifference = 0
ProductCollectedAggregationDifference = 0
ProductAggregationStatus = PASS_NO_PRODUCT_ROW_MULTIPLICATION
```

`R06` phải được đọc như một gate nghiệp vụ: `isReceiptStatus = 1` mới chỉ là tín hiệu status, chưa chứng minh số tiền thu đủ hay thu một phần. Nếu chưa có payment ledger, giữ `DoanhThuDaThu` ở trạng thái proxy/draft.

Nếu một điều kiện trên không đạt, dừng import và ghi `BLOCKED` kèm result set.

## 3. Pre-deploy và chụp object hiện tại

Trước khi thay đổi DB:

1. Chạy lại Schema Discovery và lưu `OBJECT_DEFINITION`, `modify_date`, `DefinitionSha256`.
2. Chạy PreDeploy Verification.
3. Kiểm tra không có rule `APPROVED` bị migration ghi đè.
4. Chỉ tiếp tục nếu Coordinator xác nhận DB test đúng môi trường.

Không dùng script discovery để kết luận runtime PASS; nó chỉ tạo bằng chứng trước import.

## 4. Import migration cấu hình

Chỉ sau khi bước 2–3 đạt, mở riêng file:

```text
sql/Migrate_Business_Rule_Baseline_V1_AI.sql
```

Chạy toàn bộ file một lần trên `medtest`. Sau khi chạy, kiểm tra:

```text
AI_BusinessRuleConfigTbl tồn tại
Các row mới có Status = DRAFT
Các row APPROVED cũ vẫn giữ nguyên
AI_GetBusinessRuleConfig chỉ trả row APPROVED
```

Nếu migration lỗi, dừng tại đây; không chạy tiếp procedure. Không tự xóa bảng hoặc tự rollback dữ liệu ngoài transaction của migration.

## 5. Import procedure từng file một

Không mở và chạy tất cả file trong cùng một batch. Thứ tự đề nghị:

1. `sql/Module common - API_DoanhSo_AI.sql`
2. `sql/Module common - API_DanhsachTonKho_AI.sql`
3. `sql/Module 1 - API_GoiYDonHang_AI.sql`
4. `sql/Module 2 - API_TuyenBanHang_AI.sql`
5. `sql/Module 3 - API_ChamDiemKH_AI.sql`
6. `sql/Module 4 - API_TichLuy_AI.sql`
7. `sql/Module 5 - API_UpsellGoiY_AI.sql`
8. `sql/Module 6 - API_DeXuatKhuyenMai_AI.sql`

Sau mỗi file:

- Kiểm tra Messages không có lỗi compile.
- Chạy PostDeploy Verification hoặc truy vấn object tương ứng.
- Lưu `modify_date` và checksum mới.
- Không chuyển config từ `DRAFT` sang `APPROVED`.

### Lưu ý riêng `API_DoanhSo_AI`

File hiện dùng `CREATE OR ALTER`, nên có thể import transactionally mà không tạo khoảng trống object do `DROP`. Vẫn phải chụp definition/checksum trước import và chỉ triển khai đúng môi trường đã được duyệt.

## 6. Smoke test SQL read-only

Thay các placeholder bằng tài khoản DB test, không ghi tài khoản thật vào file:

```sql
USE medtest;
GO

DECLARE @FromDate DATETIME = '2026-01-01';
DECLARE @ToDate   DATETIME = '2026-07-17';

EXEC dbo.API_DoanhSo_AI
    @Username = 'MANAGER_TEST_USER',
    @TuNgay = @FromDate,
    @DenNgay = @ToDate,
    @FromDate = @FromDate,
    @ToDate = @ToDate,
    @LoaiBaoCao = 'TatCa',
    @TopN = 8;

EXEC dbo.API_DoanhSo_AI
    @Username = 'TDV_TEST_USER',
    @TuNgay = @FromDate,
    @DenNgay = @ToDate,
    @LoaiBaoCao = 'SanPham',
    @TopN = 8;

EXEC dbo.API_DanhsachTonKho_AI
    @Username = 'TDV_TEST_USER',
    @timkiem = 'A006';

EXEC dbo.API_TuyenBanHang_AI
    @Username = 'TDV_TEST_USER',
    @SoNgayVangMat = 45,
    @TopN = 8;

EXEC dbo.API_ChamDiemKH_AI
    @Username = 'MANAGER_TEST_USER',
    @MaKhachHang = 'CUSTOMER_TEST_CODE';
GO
```

Khi đọc kết quả doanh số, phải thấy:

- `RevenueBasis = AR_OrderAndReturnView.TotalAmount`.
- Có `RevenueRecognition` và `RuleVersion`.
- `Doanh Số` vẫn tồn tại để tương thích.
- Không có draft/cancelled order trong doanh số chính thức.
- Kết quả Manager và TDV không vượt scope.
- `DoanhThuDaThu` được ghi nhận là status-based proxy nếu payment ledger chưa được xác minh.

## 7. Post-deploy verification

Sau mỗi procedure và một lần sau toàn bộ batch, chạy:

```text
sql/diagnostics/Business_Rule_V1_PostDeploy_Verification.sql
```

Điều kiện đạt:

```text
DefinitionPresent = PASS
RuleVersionMarker = PASS
DRAFT_NOT_AUTO_ACTIVE = PASS
OfficialSalesSourceCheck = PASS_OR_NOT_APPLICABLE
NO_MUTATION_PERFORMED = PASS
```

## 8. Runtime n8n/API

Chỉ chạy sau khi SQL smoke test đạt:

1. Dùng workflow/API test hiện có, không publish workflow production.
2. Gọi một API đọc với tài khoản Manager và một API đọc với TDV.
3. Kiểm tra response envelope: `ApiCode`, `contractVersion`, `requestId`, `status`, `data`, `metadata`.
4. Gọi request thiếu keyword/date/customer để xác nhận `VALIDATION_ERROR` và không chạy SQL.
5. Gọi dữ liệu ngoài scope để xác nhận `OUT_OF_SCOPE` hoặc empty state đúng contract.
6. Lưu HTTP status, requestId, response đã che dữ liệu nhạy cảm và timestamp.

Không gọi mutation, không tạo đơn thật, không trừ tồn, không publish n8n ở vòng này.

## 9. UAT người dùng

Chạy riêng hai tài khoản:

### Manager

- Doanh số `TatCa`, nhân viên, khách hàng, sản phẩm.
- Tồn kho theo kho được cấp.
- Chấm điểm khách hàng.
- Chương trình/tích lũy chỉ hiển thị đúng trạng thái.
- Kiểm tra dữ liệu ngoài branch không xuất hiện.

### TDV

- Doanh số chỉ trong scope TDV.
- Tồn kho chỉ trong warehouse được cấp.
- Gợi ý đơn hàng và tuyến ưu tiên.
- Không xem danh sách nhân viên/khách hàng ngoài quyền.
- Không tạo đơn thật khi chỉ xem/gợi ý.

Ghi từng case theo mẫu UAT hiện có, kèm screenshot/response/requestId.

## 10. Điều kiện kết thúc

Chỉ ghi `RUNTIME_PASS` khi tất cả điều kiện sau đạt:

- PreDeploy PASS.
- Revenue R03–R05 PASS.
- Product R08 PASS.
- SQL procedure smoke test Manager/TDV PASS.
- PostDeploy PASS.
- API/n8n contract runtime PASS.
- Không có lỗi P0/P1 hoặc scope leak.
- `DoanhThuDaThu` đã được business owner chấp nhận là status proxy hoặc đã nối payment ledger.

Nếu thiếu bất kỳ điều kiện nào, trạng thái phải là:

```text
RUNTIME_PARTIAL hoặc BLOCKED
```

Không gọi là `PRODUCTION_READY`.
