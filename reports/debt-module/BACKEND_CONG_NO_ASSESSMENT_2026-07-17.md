# Báo cáo assessment backend module công nợ Medstand — ACCEPTED_WITH_CONDITIONS

Ngày lập: 17/07/2026  
Chế độ: ASSESSMENT_ONLY  
Phạm vi: rà soát source SQL, contract response, scope quyền và kế hoạch đối soát DB test.

Trạng thái bằng chứng:

- ASSESSMENT: ACCEPTED_WITH_CONDITIONS
- STATIC_SOURCE: PARTIAL_EVIDENCE
- TECHNICAL_PASS: PASS_FOR_AG0031
- PERMISSION_PASS: RUNTIME_SMOKE_PASS_FOR_MANAGER_TDV_GUEST
- BUSINESS_PASS: PARTIAL_FIXTURE_ONLY

Báo cáo này đã ghi nhận read-only diagnostics, import procedure và runtime smoke trên DB test medtest. Chưa thực hiện mutation dữ liệu hoặc ký Business PASS toàn module.

## 1. Phạm vi và nguồn đã kiểm tra

- Tra cứu tổng công nợ khách hàng: tham số @cong_no_khach_hang, procedure dbo.API_CongNoKhachHang_AI, source view vCongNoBanHang, tổng hợp bằng SUM(Amount).
- Tra cứu chi tiết công nợ: tham số @cong_no_chi_tiet, procedure dbo.API_CongNoChiTiet_AI, source SY_GetDebitDocFnc, số dư tính theo DebitAmount trừ CreditAmount.
- Luồng API có allowlist, shared auth guard và validation trước khi thực thi SQL.
- n8n loại các tham số scope do client tự gửi và gắn identity đã xác thực trước khi gọi procedure.
- Frontend đã có trạng thái thiếu ngày hạn bằng nhãn Chưa xác định hạn.

Đã thực hiện trên DB test medtest: read-only diagnostics, import procedure, direct EXEC và API runtime smoke. Chưa thực hiện mutation dữ liệu hoặc ký Business PASS toàn module.

## 2. Kết luận hiện tại

### Điểm đã được xác nhận từ source và runtime

- Chi tiết hóa đơn có các trường ngày hóa đơn, ngày đến hạn, số tiền ghi nợ, số tiền ghi có và số dư.
- Procedure chi tiết kiểm tra khách hàng hợp lệ trước khi trả dữ liệu.
- Scope SQL có kết hợp user, branch và hàm phân quyền khách hàng.
- n8n không tin các giá trị scope do client tự khai báo.
- UI có fallback an toàn khi ngày đến hạn không có dữ liệu.

### Evidence mapping hiện có

| Claim | Source location | Evidence |
|---|---|---|
| Procedure tổng công nợ | sql/Module common - API_CongNoKhachHang_AI.sql:1, 86, 125 | Procedure tồn tại; dùng vCongNoBanHang và SY_GetDebitDocFnc |
| Procedure chi tiết | sql/Module common - API_CongNoChiTiet_AI.sql:1, 78, 105-131 | Có lọc isCustomer, DueDate và công thức lấy dữ liệu từ SY_GetDebitDocFnc |
| Allowlist/capability | n8n/API_Services/API_Execute.json:338-341 | Có node Enforce API Capability và allowlist đọc |
| Validation | n8n/API_Services/API_Execute.json:428 | Có node kiểm tra tham số và trả VALIDATION_ERROR |
| Loại scope client | n8n/API_Services/API_Execute.json:280 | Có node Apply Verified Identity loại nhóm tham số scope trước khi gọi SQL |
| Auth identity | n8n/Shared/Shared_Auth_Guard.json:76 | Có mapping verifiedIdentity; chưa có runtime evidence |
| Fallback ngày hạn | sql/Module common - API_CongNoChiTiet_AI.sql:105-119 | Source trả nhãn khi DueDate null; chưa chứng minh API alias/runtime |
| Renderer công nợ | chatbot-widget/js/chatbot-renderers-medstand.js:576-655 | Có mapping field và hiển thị trạng thái; test contract hiện còn fail |

Các dòng trên chứng minh source location đã được tìm thấy, không chứng minh compile, EXEC, HTTP response, scope runtime hoặc nghiệp vụ đúng.

### Evidence DB test đã nhận ngày 17/07/2026

- Database medtest, script chạy thành công bằng tài khoản medtest.
- API_CongNoChiTiet_AI, API_CongNoKhachHang_AI, AR_InvoiceStatusTbl, AR_InvoiceTbl, CF_ObjectTbl, SY_GetDebitDocFnc và vCongNoBanHang đều tồn tại.
- DB đã trả definition và SHA-256 cho hai procedure, view và function.
- CF_ObjectTbl có ObjectID, BranchID, ObjectName, Phone, isEmployee và isCustomer; không thấy cột ObjectType trong result set discovery.
- Fixture AG0031 là khách hàng: isCustomer = 1, isEmployee = 0, BranchID = MN.
- List source: 2 dòng, tổng 6.900.000 đồng.
- Detail source: 2 dòng, DebitValue 6.900.000 đồng, CreditValue 0 đồng, RemainingValue 6.900.000 đồng.
- Chênh lệch tổng list-detail của fixture AG0031: 0 đồng — PASS_TOTAL_MATCH.
- LastDocumentDate của list là 11/07/2026 nhưng detail là 17/07/2026; grain/ngày chứng từ chưa đồng nhất.
- AR_InvoiceTbl chỉ trả một hóa đơn nhìn thấy trong evidence: UATALI_INV_000912, BaseTotal 4.000.000 đồng, StatusID 1, DueDate null.
- Phần 2.900.000 đồng còn lại và dòng detail ngày 17/07/2026 chưa được phân loại từ ảnh tổng hợp; cần raw-row evidence.

Kết luận từ fixture này: tổng số dư khớp, ObjectType của AG0031 đã xác định được và DueDate đang thiếu. Fixture chưa chứng minh semantics payment/return/adjustment vì CreditValue bằng 0.

### Root cause đã xác nhận từ raw-row evidence

- Khoản 2.900.000 đồng là dòng UATALL_DEBT_000912, AccountID 1311, SourceID BL, ngày 01/01/2016; đây là khoản công nợ mock/đầu kỳ, không phải hóa đơn trong AR_InvoiceTbl.
- Khoản 4.000.000 đồng thuộc hóa đơn UATALL_INV_000912 ngày 11/07/2026 trong vCongNoBanHang.
- SY_GetDebitDocFnc trả khoản 4.000.000 đồng dưới dạng số dư AccountID 131 tại ngày chốt 17/07/2026 nhưng làm mất DocumentID.
- API_CongNoChiTiet_AI hiện join AR_InvoiceTbl bằng DocumentID từ SY_GetDebitDocFnc. Do DocumentID của dòng 4.000.000 bị rỗng nên join thất bại, DueDate và metadata hóa đơn bị mất.
- COUNT(*) OVER() hiện được alias là TongSoHoaDon nhưng thực tế đếm hai khoản công nợ: một opening balance và một số dư hóa đơn. Vì vậy UI gọi đây là hai hóa đơn là sai nghiệp vụ.

Hướng sửa backend bắt buộc:

1. Tách OpenDebtItemCount khỏi OpenInvoiceCount.
2. Trả DocumentType hoặc IsInvoice cho từng dòng.
3. Không gọi opening balance là hóa đơn.
4. Giữ tổng công nợ 6.900.000 đồng vì list và detail đã khớp.
5. Dùng nguồn còn giữ DocumentID để lấy DueDate; không suy diễn DocumentID từ số tiền nếu có nhiều chứng từ cùng giá trị.
6. Trả DUE_DATE_UNKNOWN cho khoản không có ngày hạn, nhưng không biến null thành bằng chứng hóa đơn quá hạn.

API runtime sau patch đã trả đúng loại khoản công nợ và số lượng invoice cho fixture AG0031; DueDate NULL là dữ liệu thật và được giữ ở trạng thái chưa xác định hạn.

### Source patch đã chuẩn bị

File sql/Module common - API_CongNoChiTiet_AI.sql đã được vá theo evidence:

- Giữ SY_GetDebitDocFnc làm nguồn số dư để không đổi công thức tổng.
- Chỉ khôi phục DocumentID từ vCongNoBanHang khi có đúng một candidate khớp ObjectID, AccountID và số dư.
- Không đoán DocumentID khi có nhiều candidate cùng giá trị.
- MaHD chỉ trả cho dòng join được AR_InvoiceTbl; MaChungTu giữ mã chứng từ công nợ.
- Bổ sung LoaiKhoanCongNo: INVOICE, OPENING_BALANCE hoặc OTHER_RECEIVABLE.
- Bổ sung DocumentMatchStatus.
- TongSoHoaDon chỉ đếm invoice đã match; TongSoKhoanCongNo đếm toàn bộ khoản công nợ.
- Ngày hóa đơn lấy từ AR_InvoiceTbl; ngày khoản công nợ có fallback về raw source.

### Source patch bổ sung cho API danh sách

`sql/Module common - API_CongNoKhachHang_AI.sql` đã được cập nhật ở source để trả đồng thời field legacy và canonical:

- `ObjectType = CUSTOMER` dựa trên `CF_ObjectTbl.isCustomer`.
- `CustomerID`, `CustomerName`, `TotalDebt`, `PaymentStatus`.
- `DebtSize`, `DueStatus`, `AsOfDate`, `RuleVersion`, `DataSource`.
- Giữ `TenKH`, `TongNo`, `MaKH`, `PhanLoai` để tương thích ngược.
- Lọc bản ghi không phải khách hàng trước khi trả danh sách.
- `PaymentStatus`/`DueStatus` dùng `DUE_DATE_UNKNOWN` vì API danh sách chưa có nguồn ngày đến hạn; không tự suy đoán quá hạn.

Trạng thái patch danh sách: `SOURCE_PATCH_READY / MEDTEST_IMPORT_PENDING`. Chưa gọi đây là runtime PASS cho đến khi import procedure và chạy lại API danh sách trên `medtest`.

SHA-256 source patch: 7F662E8B76F532DDB8B3165D7C0A72BC5F2D8C29856FFBA1C86CA2B8971A4A99.

Static source suite: PASS 19/19. SQL Server compile/EXEC và API runtime đã được thực hiện trên medtest; evidence được ghi ngay bên dưới.

### Runtime evidence sau khi import medtest

Direct SQL EXEC đã compile và trả đúng hai dòng:

- UATALL_INV_000912: INVOICE, MaHD và MaChungTu đúng, số dư 4.000.000 đồng.
- UATALL_DEBT_000912: OPENING_BALANCE, MaHD null, MaChungTu đúng, số dư 2.900.000 đồng.
- TongSoHoaDon = 1.
- TongSoKhoanCongNo = 2.
- TongTienNoThucTe = 6.900.000 đồng.

API runtime @cong_no_chi_tiet với Manager QLBH024.MED và AG0031:

- HTTP 200, success true, code OK, count 2.
- requestId: req-4593-mroo18vv.
- Response giữ đúng INVOICE và OPENING_BALANCE như direct EXEC.
- Tổng và số lượng khớp DB reconciliation.

Permission smoke:

- TDV BinhPhuocA truy cập AG0031: HTTP 403, code FORBIDDEN, count 0, requestId req-4603-mroo20ux.
- Guest không token: HTTP 401, code AUTH_TOKEN_MISSING, count 0, requestId req-4605-mroo21tn.

Runtime kết luận:

- PROCEDURE_COMPILE_EXEC_MEDTEST: PASS.
- API_RUNTIME_MANAGER_IN_SCOPE: PASS.
- API_RUNTIME_TDV_OUT_OF_SCOPE: PASS.
- API_RUNTIME_GUEST: PASS.
- REQUEST_ID_ENVELOPE: PASS.
- BUSINESS_PASS: vẫn pending vì fixture chưa có payment/return/adjustment và DueDate của hóa đơn đang null thật trong DB.

### Khoảng trống cần chốt

1. Danh sách và chi tiết đang dựa trên hai nguồn và công thức khác nhau; fixture AG0031 đã khớp tổng, nhưng chưa mở rộng đối soát nhiều fixture.
2. Bản procedure danh sách đang chạy trên medtest vẫn là schema legacy; source patch đã bổ sung ObjectType và canonical fields, chờ import/EXEC lại trên DB test.
3. Ngưỡng phân loại công nợ đang hardcode: dưới 100 triệu là nhỏ, từ 100 đến dưới 500 triệu là trung bình, từ 500 triệu là lớn. Chưa có version, ngày hiệu lực hoặc người phê duyệt.
4. Ngày đến hạn mới có ở chi tiết; danh sách chưa có OverdueDebt, NotDueDebt, MaxOverdueDays hoặc NearestDueDate.
5. Chưa xác nhận CreditAmount bao gồm thanh toán, trả hàng, điều chỉnh hay nhiều loại nghiệp vụ khác.
6. Chưa có cấu hình DUE_SOON; không được tự hardcode số ngày sắp đến hạn.
7. Chưa có fixture chứng minh thanh toán một phần, trả hàng/điều chỉnh và hóa đơn có DueDate thực để phân loại OVERDUE/NOT_DUE.

## 3. Contract backend đề xuất

### Response danh sách

CustomerID, CustomerName, ObjectType, AssignedEmployeeID, AssignedEmployeeName, BranchID, TotalDebt, OverdueDebt, NotDueDebt, OpenInvoiceCount, MaxOverdueDays, NearestDueDate, DebtSize, DueStatus, PriorityLevel, AsOfDate, RuleVersion, DataSource, DataUpdatedAt.

### Response chi tiết

CustomerID, CustomerName, Phone, Address, AssignedEmployeeID, AssignedEmployeeName, AsOfDate, TotalDebt, OverdueDebt, NotDueDebt, OpenInvoiceCount, MaxOverdueDays, NearestDueDate, InvoiceID, InvoiceNumber, InvoiceDate, DueDate, OriginalAmount, PaidAmount, ReturnAmount, AdjustmentAmount, RemainingAmount, OverdueDays, DueStatus.

### Enum trạng thái đến hạn

- OVERDUE: còn số dư và ngày đến hạn nhỏ hơn ngày chốt.
- DUE_SOON: còn số dư và nằm trong khoảng sắp đến hạn đã được business phê duyệt.
- NOT_DUE: còn số dư nhưng chưa đến hạn.
- DUE_DATE_UNKNOWN: còn số dư nhưng không có ngày đến hạn.

Không được hiển thị nhắc nợ khi chưa đến hạn; nội dung AI phải dựa trên DueStatus và dữ liệu thực tế.

## 4. Ma trận kiểm thử backend cần chạy

| Case | Mục tiêu | Kết quả cần chứng minh |
|---|---|---|
| D-01 | Hóa đơn quá hạn | OverdueDebt và OverdueDays đúng |
| D-02 | Hóa đơn chưa đến hạn | NotDueDebt đúng, không gắn nhắc nợ quá hạn |
| D-03 | Nhiều hóa đơn khác trạng thái | Tổng danh sách khớp tổng chi tiết |
| D-04 | Thanh toán một phần | RemainingAmount đúng |
| D-05 | Trả hàng hoặc điều chỉnh | Credit/return/adjustment được phân loại rõ |
| D-06 | Thiếu ngày đến hạn | DueStatus là DUE_DATE_UNKNOWN |
| D-07 | Thiếu số điện thoại | Trả trạng thái Chưa có số điện thoại, không lỗi |
| D-08 | Mã nhân viên hoặc khách hàng | ObjectType xác định được, không suy đoán từ chuỗi mã |
| D-09 | Manager scope | Không thấy dữ liệu ngoài branch được cấp |
| D-10 | TDV scope | Chỉ thấy khách hàng được phân công |
| D-11 | Guest hoặc thiếu identity | Từ chối đúng contract |
| D-12 | Validation | Thiếu hoặc sai CustomerID trả lỗi validation trước SQL |
| D-13 | Không có dữ liệu | NO_DATA, không biến thành SYSTEM_ERROR |
| D-14 | Ngoài scope | OUT_OF_SCOPE, không rò rỉ dữ liệu |
| D-15 | Phân trang | Tổng count và trang dữ liệu nhất quán |

## 5. Những điều chưa được chứng minh

1. Chưa có commit hash hoặc artifact triển khai độc lập; source patch đã có SHA-256 và static suite 19/19 PASS.
2. Đã có output compile/EXEC procedure, API request/response và requestId cho smoke test; chưa có n8n execution log riêng cho thay đổi response này.
3. Đã có DB result set chứng minh tổng danh sách khớp tổng chi tiết cho AG0031; chưa mở rộng đối soát sang nhiều fixture.
4. Chưa xác minh CreditAmount là payment, return, adjustment hay kết hợp; có rủi ro trừ hai lần.
5. Contract đề xuất vẫn là CONTRACT_DRAFT vì nhiều field chưa có nguồn dữ liệu đã xác nhận.
6. AsOfDate chưa khóa semantics về timezone, đầu/cuối ngày và loại ngày giao dịch.
7. D-01 đến D-15 là test plan, chưa phải test evidence.
8. Workspace đang có nhiều thay đổi chưa commit; không được dùng git status hiện tại để khẳng định riêng assessment này không sửa file ngoài phạm vi.

## 6. Trạng thái gate

- STATIC SOURCE MAPPING: PARTIAL_EVIDENCE
- FORMULA CONSISTENCY: NOT_PROVEN_STATIC_SOURCE_DIFFERENCE
- DB SCHEMA EVIDENCE: PASS
- OBJECT TYPE: PASS_FOR_AG0031 / GLOBAL_MAPPING_PENDING
- DUE DATE: NULL_CONFIRMED_FOR_VISIBLE_INVOICE / GLOBAL_RULE_PENDING
- DEBT SIZE THRESHOLD: BUSINESS_DECISION_REQUIRED
- PERMISSION: RUNTIME_SMOKE_PASS_FOR_MANAGER_TDV_GUEST
- LIST-DETAIL RECONCILIATION: PASS_FOR_AG0031_TOTAL / GRAIN_REVIEW_REQUIRED
- DETAIL DOCUMENT IDENTITY: PASS_FOR_AG0031 / GLOBAL_AMBIGUITY_PENDING
- INVOICE COUNT SEMANTICS: FIXED_AND_VERIFIED_FOR_AG0031
- BACKEND BUSINESS PASS: PARTIAL_FIXTURE_ONLY
- PROCEDURE IMPORT: PASS_ON_MEDTEST
- N8N PUBLISH: NOT_REQUIRED_FOR_THIS_SP_RESPONSE_CHANGE

## 7. Việc được phép làm tiếp theo

Gate tiếp theo là UI_INTEGRATION_AND_ADDITIONAL_BUSINESS_FIXTURES.

Chỉ được chuyển sang READ_ONLY_DB_DIAGNOSTICS với các điều kiện:

- Review nội dung hai script và statement/object được truy cập.
- Xác nhận không có DML, DDL, dynamic SQL chưa review hoặc procedure có side effect.
- Khóa checksum script, source version và môi trường DB.
- Chạy trên DB test, không phải production.
- Khóa CustomerID và AsOfDate cụ thể.
- Xác nhận tài khoản thực thi và quyền đọc.
- Lưu output nguyên bản, timestamp, DB/server và checksum script.
- Không import procedure, không publish n8n, không mutation.

Checksum hiện tại:

- sql/diagnostics/Debt_Module_Schema_Discovery.sql: 0049BEC397EDE7C1319E19B3939E651CA94D145250001A17E0CB67A52D54BCAB
- sql/diagnostics/Debt_Module_Reconciliation.sql: 26B4FFD5CDC9D91130628C03F94A1864487BF77DEAB622D6A294143C598CC5D4

Static safety review không tìm thấy DML, DDL, dynamic SQL, DBCC hoặc lời gọi procedure trong câu lệnh thực thi. Từ EXECUTE chỉ xuất hiện trong comment mô tả. Hai script hiện chỉ đọc metadata/raw source và reconciliation không gọi draft procedure.

Kết quả precheck local:

- READ_ONLY_STATIC_GUARD: PASS
- SCRIPT_CHECKSUM: LOCKED
- DATABASE_GUARD: LOCKED_TO_MEDTEST
- RECON_FIXTURE: AG0031 / 17-07-2026
- GIT_DIFF_CHECK: PASS
- DB_EXECUTION: PASS_MEDTEST

Pre-run package đã khóa:

- Database: medtest; mỗi script có USE medtest và DB_NAME guard.
- Environment: DB test.
- Fixture ban đầu: CustomerID AG0031.
- AsOfDate: 17/07/2026, tính inclusive đến hết ngày theo điều kiện nhỏ hơn ngày kế tiếp.
- Timezone nghiệp vụ tạm dùng: Asia/Bangkok.
- Source mode: RAW_SOURCE_ONLY.
- Tài khoản chạy: phải kiểm tra SUSER_SNAME trong result set đầu; khuyến nghị quyền read-only.
- Server/instance: người chạy phải xác nhận đang ở đúng DB test trước khi Execute.

## 8. Việc cần làm tiếp theo

Các bước diagnostics, import medtest, direct EXEC và API runtime smoke cho AG0031 đã hoàn thành.

Việc còn lại:

1. Chọn thêm fixture có thanh toán một phần.
2. Chọn thêm fixture có trả hàng hoặc adjustment.
3. Chọn fixture có DueDate thật để kiểm tra OVERDUE và NOT_DUE.
4. Chốt quy tắc DebtSize, DUE_SOON và semantics payment/return/adjustment.
5. Cập nhật renderer để hiển thị khoản công nợ và hóa đơn tách biệt.
6. Import và EXEC lại `API_CongNoKhachHang_AI` trên DB test; kiểm tra canonical fields và scope.
7. Chạy UI UAT với Manager và TDV.
8. Sau đó mới ký Business PASS.

## 9. Tiêu chí chuyển gate

- Canonical debt source và công thức được business phê duyệt.
- ObjectType và khóa định danh được chứng minh từ schema thật.
- AsOfDate, DebtSize và DUE_SOON có version/effective date.
- List-detail reconciliation có result set và chênh lệch được giải thích.
- Procedure compile/EXEC pass trên DB test.
- Manager/TDV/guest permission test pass.
- API validation, requestId và audit có runtime evidence.

## Kết luận

Overall assessment: RUNTIME_SMOKE_PASS_WITH_BUSINESS_CONDITIONS  
Diagnostics execution: PASS  
Procedure import medtest: PASS  
Direct procedure EXEC: PASS  
API runtime Manager AG0031: PASS  
Permission smoke Manager/TDV/Guest: PASS  
n8n publish: NOT_REQUIRED_FOR_THIS_CHANGE  
Next gate allowed: UI_INTEGRATION_AND_ADDITIONAL_BUSINESS_FIXTURES  
Backend technical acceptance: PASS_FOR_AG0031  
Business acceptance: PARTIAL  
Overall status: TECHNICAL_RUNTIME_PASS / BUSINESS_PARTIAL

Backend đã chạy thật và đúng cho fixture AG0031. Business PASS toàn module vẫn cần fixture thanh toán một phần, trả hàng/adjustment, DueDate thật và UI UAT.
