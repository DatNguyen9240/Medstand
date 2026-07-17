# KẾ HOẠCH FIX CÁC LỖI CHATBOT API SAU KIỂM THỬ

**Ngày lập:** 15/07/2026  
**Nguồn:** [`BAO_CAO_KIEM_THU_LENH_CHATBOT_2026-07-14.md`](../uat/BAO_CAO_KIEM_THU_LENH_CHATBOT_2026-07-14.md)  
**Phiên bản:** 1.1  
**Trạng thái:** Bản remediation chính thức, sẵn sàng giao dev; chưa triển khai thay đổi  
**Mục tiêu:** đóng lỗi bảo mật trước, sau đó chuẩn hóa contract/metadata và hoàn tất UAT UI cho 28 lệnh `@`

## 1. Kết luận phân tích

Các phát hiện trong báo cáo có đủ bằng chứng để lập kế hoạch sửa. Lỗi chặn phát hành là `api-execute` thực thi khi không có token. Các lỗi metadata, response contract và CORS là lỗi độc lập nhưng phải sửa sau khi đóng xác thực để tránh che khuất nguyên nhân chính.

### Nguyên nhân gốc đã đối chiếu

1. `API_Execute` xem xác thực là bước tùy chọn: nếu không có Bearer token thì `username` tiếp tục là chuỗi rỗng, nhưng workflow vẫn dựng và thực thi SQL.
2. Username chỉ được nạp vào params khi xác minh được danh tính; không có nhánh fail-closed trước node SQL.
3. Logic phân phạm vi SQL có trường hợp cho phép username rỗng, ví dụ điều kiện dạng `@Username = '' OR ...`; do đó request ẩn danh có thể thấy dữ liệu rộng hơn người dùng hợp lệ.
4. `API_ListActive` cố decode JWT nhưng không bắt buộc token hợp lệ trước khi gọi stored procedure; `API_GetConfig` chỉ kiểm tra định dạng ApiCode, không xác thực người gọi.
5. Lớp chuẩn hóa response chỉ nhận một số bản ghi `Msg/MsgType` là lỗi. Những biến thể không khớp predicate rơi xuống nhánh success và bị tính `count = 1`.
6. Bootstrap metadata đặt `IsRequired = 0` theo mặc định. Chưa có override contract đầy đủ cho từng lệnh nên frontend không biết trường nào bắt buộc.
7. Frontend có nhánh nhập trực tiếp cố ý không chặn thiếu trường, đẩy trách nhiệm sang AI/backend.
8. `@lap_don_hang` được frontend override thành `CART` và điều hướng; không nên xếp ngang với mutation ghi database tại bước chatbot.

## 2. Thứ tự triển khai bắt buộc

```text
P0.0 Shared auth guard
  -> P0.1 api-execute fail-closed
  -> P0.2 Authorization/capability/scope
  -> P0.3 Khóa metadata endpoints
  -> P0.4 CORS baseline + auth error contract
  -> P0.5 Regression test không token và execution path
  -> P1.1 Response contract
  -> P1.2 Metadata contract/version
  -> P1.3 Validation FE/backend
  -> P1.4 Request ID + audit
  -> P2.1 Playwright Guest/Manager/TDV
  -> P2.2 UI matrix 28 lệnh
  -> P2.3 Mutation sandbox
  -> P2.4 Full UAT/regression
```

Không sửa UI trước P0 vì UI không thể bù cho endpoint đang mở.

## 3. P0 — Lỗi chặn phát hành

### FIX-P0-00 — Tạo Shared Auth Guard dùng chung

**Phạm vi:** n8n reusable sub-workflow hoặc service xác thực chung.

**Luồng chuẩn:**

```text
Webhook
  -> Shared Auth Guard
  -> Shared Identity Mapping
  -> Endpoint-specific authorization
  -> Business flow
```

Ba endpoint `API_Execute`, `API_ListActive`, `API_GetConfig` phải gọi cùng component; không sao chép code xác thực sang từng workflow. Shared guard phải trả cùng một identity model và error contract để tránh lệch hành vi khi cập nhật.

**Identity model tối thiểu:** `subject`, `internalUserId`, `employeeId`, `branchIds`, `capabilities`, `scopeContext`, `tokenExpiry`.

### FIX-P0-01 — Bắt buộc xác thực tại `api-execute`

**Tệp/workflow:** `n8n/API_Services/API_Execute.json`

**Thay đổi đề xuất:**

- Ngay sau webhook/OPTIONS, yêu cầu Bearer token hoặc cookie session hợp lệ.
- Xác minh chữ ký, thời hạn và danh tính bằng dịch vụ xác thực hiện có; không chỉ decode payload JWT.
- Nếu token thiếu, sai hoặc hết hạn: dừng trước SQL và trả HTTP 401.
- Nếu token hợp lệ nhưng không ánh xạ được tài khoản/phạm vi nội bộ: trả HTTP 403 với mã thống nhất như `IDENTITY_MAPPING_NOT_FOUND`.
- Không dùng exception không có response node vì hiện token lỗi có thể trả HTTP 200 body rỗng.
- Tách response lỗi xác thực thành node rõ ràng, có JSON envelope và `requestId`.
- Chỉ cho phép đi đến node dựng SQL khi có `verifiedIdentity`.

**Tiêu chí đạt:**

- Không token, token giả, token hết hạn đều trả 401; không stored procedure nào chạy.
- Token hợp lệ và ánh xạ nội bộ thành công mới đi vào nhánh authorization/thực thi.
- Response không còn trường debug chứa identity hoặc raw backend response.

### FIX-P0-02 — Phân quyền theo ApiCode và phạm vi dữ liệu

**Tệp/workflow:** `n8n/API_Services/API_Execute.json`, bảng metadata API và các stored procedure nghiệp vụ.

**Thay đổi đề xuất:**

- Tạo contract server-side: `ApiCode`, `OperationType`, `RequiredCapability`, `AllowedCapabilities`, `ScopeResolver`, `OwnershipRule`; role chỉ là dữ liệu đầu vào, không phải quyết định cuối cùng.
- Identity, EmployeeID và BranchID phải lấy từ user đã xác minh/mapping server.
- Loại bỏ hoặc bỏ qua các identity/scope params do client tự gửi.
- Mutation dùng allowlist riêng và yêu cầu scope ghi; mặc định deny.
- Stored procedure phải fail-closed khi thiếu `@Username`; bỏ điều kiện cho phép username rỗng mở rộng phạm vi.
- Kiểm tra cả ownership (TDV) và branch scope (Manager) ở tầng SQL để phòng trường hợp workflow bị gọi trực tiếp.

**Cách triển khai stored procedure có kiểm soát:**

1. Inventory 24 procedure đọc và 3 mutation.
2. Đánh dấu procedure có điều kiện fail-open hoặc phụ thuộc username rỗng.
3. Xác định service/system account hợp lệ đang dùng batch cũ.
4. Sửa theo nhóm dữ liệu nhạy cảm trước, mỗi SP có test trước/sau.
5. Không sửa hàng loạt khi chưa có inventory và rollback tương ứng.

**Tiêu chí đạt:**

- TDV chỉ thấy dữ liệu được giao/thuộc sở hữu.
- Manager chỉ thấy đúng chi nhánh/phạm vi.
- User không có scope nhận 403 và không chạy SP.
- Sửa `EmployeeID`, `BranchID`, `Username` trong request không mở rộng dữ liệu.
- Bằng chứng “không chạy SP” phải dựa trên execution path: n8n dừng trước SQL node, mock SQL node không nhận input, audit/profiler không ghi execution hoặc metric `sql_execution_count = 0`; không chỉ dựa vào HTTP 403.

### FIX-P0-03 — Khóa `api-list-active` và `api-get-config`

**Tệp/workflow:**

- `n8n/API_Services/API_ListActive.json`
- `n8n/API_Services/API_GetConfig.json`

**Thay đổi đề xuất:**

- Gọi Shared Auth Guard; không copy logic xác thực từ `api-execute`.
- Danh mục lệnh phải được lọc theo capability/scope.
- Không trả `DataSourceValue`, tên procedure hoặc mapping backend nếu frontend không cần.
- `get-config` chỉ trả cấu hình của lệnh người dùng được phép sử dụng.

**Tiêu chí đạt:**

- Không token/sai token trả 401.
- `api-list-active`: có lệnh được phép thì trả 200 với danh sách đã lọc; không có lệnh thì trả 200 với `data: []`; chỉ trả 403 nếu tài khoản không được dùng chatbot nói chung.
- `api-get-config`: lệnh không tồn tại và lệnh tồn tại nhưng không có quyền phải tuân theo policy chống enumeration, không trả khác biệt chi tiết làm lộ ApiCode nội bộ.
- Response frontend không còn chi tiết nội bộ không cần thiết.

### FIX-P0-04 — CORS baseline và auth error contract

**Tệp/workflow:** ba workflow API.

- Cấu hình allowlist origin theo domain triển khai ngay trong đợt hardening P0.
- OPTIONS và POST phải nhất quán về origin, method và header được phép.
- Auth failure luôn trả JSON envelope và HTTP 401/403; không trả HTTP 200 body rỗng.
- CORS không thay thế authentication; mục tiêu là thu hẹp bề mặt trình duyệt sau khi auth đã đóng.

### FIX-P0-05 — Test hồi quy xác thực tự động

**Tệp mới đề xuất:** `scripts/test_chatbot_api_auth_regression.js`

**Ma trận bắt buộc:**

| Endpoint | Không token | Token sai | Token hết hạn | Token hợp lệ không map nội bộ | Token hợp lệ thiếu scope | Manager | TDV |
|---|---:|---:|---:|---:|---:|---:|---:|
| `api-execute` | 401 | 401 | 401 | 403 `IDENTITY_MAPPING_NOT_FOUND` | 403 | Theo scope | Theo scope |
| `api-list-active` | 401 | 401 | 401 | 403 hoặc chatbot-disabled contract | 200, danh sách lọc/rỗng | 200, đã lọc | 200, đã lọc |
| `api-get-config` | 401 | 401 | 401 | 403 `IDENTITY_MAPPING_NOT_FOUND` | 403/404 theo anti-enumeration policy | Theo scope | Theo scope |

Chạy lại toàn bộ 24 lệnh đọc không token; tất cả phải 401. Test phải xác nhận cả HTTP response lẫn execution path: SQL node không nhận input, audit/profiler không có SP execution và metric execution bằng 0.

## 4. P1 — Contract, metadata và vận hành

### FIX-P1-01 — Chuẩn hóa response envelope

**Tệp/workflow:** `n8n/API_Services/API_Execute.json`

**Contract đề xuất:**

```json
{
  "success": false,
  "code": "MISSING_PARAMETER",
  "message": "Vui lòng chọn khách hàng.",
  "data": [],
  "count": 0,
  "requestId": "..."
}
```

**Quy tắc:**

- `OK`: HTTP 200, data thật, count đúng.
- `NO_DATA`: HTTP 200, `data: []`, `count: 0`.
- `MISSING_PARAMETER`/`VALIDATION_ERROR`: HTTP 400 hoặc 422.
- `UNAUTHORIZED`: HTTP 401.
- `FORBIDDEN`: HTTP 403.
- `UNSUPPORTED_API`: chọn thống nhất `400 INVALID_API_CODE` hoặc `404 API_CODE_NOT_FOUND` theo policy chống enumeration; FE không được suy luận lệnh nội bộ từ khác biệt response.
- `SYSTEM_ERROR`: HTTP 500, không lộ SQL/debug.
- Mọi row chỉ chứa `Msg/msg` phải được phân loại trước khi đếm dữ liệu; không mặc định tất cả là lỗi và không phụ thuộc duy nhất vào `MsgType >= 1`.
- Tạo adapter cho SP cũ, ánh xạ `MsgType/Code/Severity` về `INFO`, `WARNING`, `VALIDATION_ERROR`, `BUSINESS_ERROR`, `SYSTEM_ERROR`.

**Tiêu chí đạt:** sáu lệnh từng trả success/count 1 khi thiếu params phải trả lỗi chuẩn, count 0 và data rỗng.

### FIX-P1-02 — Xây contract metadata cho 28 lệnh

**Tệp/database:** `sql/Bootstrap_API_Metadata_Auto_AI.sql` và script migration/override mới.

**Không làm:** đổi toàn bộ `IsRequired` thành 1.

**Thay đổi đề xuất:**

- Lập bảng contract: ApiCode, FieldCode, Required, DefaultValue, DataType, ValidationRule, SourceOfTruth, ContractVersion, UpdatedAt, UpdatedBy.
- Giữ default linh hoạt ở bootstrap nếu cần, nhưng thêm override rõ ràng cho từng lệnh.
- Required phải dựa trên contract stored procedure/nghiệp vụ, không suy đoán từ tên trường.
- Khai báo range cho ngày, TopN, page/pageSize; enum cho loại báo cáo/trạng thái.
- System params không hiển thị và không nhận từ client.
- Chuẩn hóa `SourceOfTruth`: `TOKEN`, `SERVER_MAPPING`, `USER_INPUT`, `DERIVED`, `STATIC_DEFAULT`, `DATASOURCE`.
- Ví dụ: Username=`TOKEN`; BranchID=`SERVER_MAPPING` hoặc input đã kiểm tra scope; EmployeeID=`USER_INPUT` kết hợp server scope; TopN=`USER_INPUT` có server limit.
- Metadata response phải có version/checksum; cache frontend/n8n phải invalidated sau migration.

**Tiêu chí đạt:** frontend hiển thị dấu bắt buộc đúng, chặn thiếu trường đúng và API vẫn validate lại ở backend.

### FIX-P1-03 — Đồng bộ validation frontend/backend

**Tệp:** `chatbot-widget/js/chatbot-api-engine.js`

**Thay đổi đề xuất:**

- Bỏ nhánh “bỏ qua chặn lỗi để AI/backend tự handle” với trường required.
- Validate kiểu dữ liệu, ngày bắt đầu/kết thúc, số dương và lựa chọn khách hàng duy nhất.
- Form submit không thực thi API nghiệp vụ khi required chưa đủ.
- Luồng hội thoại nhiều bước vẫn được phép lưu partial state và hỏi tiếp người dùng; chỉ final execution mới yêu cầu đủ contract.
- Backend vẫn là source of truth; frontend chỉ cải thiện UX.
- `@lap_don_hang` giữ loại `CART/NAVIGATION_ACTION`, yêu cầu màn hình review trước khi tạo đơn thật.

### FIX-P1-04 — Request ID và audit

**Tệp/workflow:** ba workflow API và hệ thống audit hiện có. CORS baseline đã được đưa vào P0.

**Thay đổi đề xuất:**

- Server luôn sinh `requestId` chính thức tại entrypoint; request ID từ client chỉ là correlation hint và phải được validate format nếu giữ lại.
- Cùng request ID phải đi xuyên suốt n8n, authorization, SQL audit và response; mọi response lỗi đều có ID nhưng không lộ stack trace.
- Audit tối thiểu: thời gian, requestId, verified user, ApiCode, operation type, kết quả, số dòng, thời lượng; không log token hoặc dữ liệu nhạy cảm.
- Mutation log thêm idempotency key và trạng thái commit/rollback.
- Không log payload đầy đủ mặc định, tên khách hàng, điện thoại hoặc token.
- Audit có access control và retention policy; với API nhạy cảm có thể bỏ/nhóm hóa số dòng để tránh lộ thông tin nghiệp vụ.

## 5. P2 — UI và UAT

### FIX-P2-01 — Kiểm thử UI từng lệnh `@`

Với mỗi lệnh:

1. Gõ `@`, tìm và chọn lệnh.
2. Kiểm tra label, placeholder, required/default.
3. Gửi thiếu tham số, tham số hợp lệ và tham số không tồn tại.
4. Kiểm tra loading, success, no-data, validation và server error.
5. Kiểm tra renderer bảng/card/chart, scroll và composer không che dòng cuối.
6. Kiểm tra console/network không có lỗi.

Ca mẫu `@danh_muc`:

- Gõ `@danh_muc` phải chọn được đúng một command.
- Form hiển thị `Type` và từ khóa theo metadata được phép.
- Không được hiển thị DataSourceValue/procedure nội bộ.
- Kết quả đúng renderer danh mục; empty/error không bị tính là một dòng dữ liệu.

### FIX-P2-02 — UAT role Manager/TDV

- Chạy cùng test case bằng Manager và TDV.
- Chụp số dòng/nhóm trường, không lưu dữ liệu nhạy cảm.
- Xác nhận menu lệnh, filter và data scope khác nhau đúng contract.
- Test 1366×768, 1920×1080; zoom 80%, 100%, 125%.

### FIX-P2-03 — Bộ kiểm thử người dùng tự động bằng Playwright

**Cấu trúc đề xuất:**

```text
playwright.config.ts
tests/e2e/
tests/auth/
tests/guest/
tests/manager/
tests/tdv/
```

**Yêu cầu:**

- Project riêng `guest`, `manager`, `tdv`; storage state tách biệt, không dùng chung cookie/localStorage.
- Tài khoản test lấy từ `.env.test`; không commit credential.
- Test thao tác thật qua UI và theo dõi request/response của 28 lệnh.
- Khi fail lưu screenshot, video, trace và xuất HTML report.
- Mutation suite mặc định tắt, chỉ chạy khi `RUN_MUTATION_TESTS=true` và target là sandbox.
- Bổ sung scripts: `test:guest`, `test:manager`, `test:tdv`, `test:chatbot`, `test:all`.
- Test guest phải chứng minh UI không gọi được API nghiệp vụ và backend trả 401 kể cả khi gọi trực tiếp.

### FIX-P2-04 — Mutation và CART trong sandbox

Chỉ chạy sau khi P0 pass:

- `@cap_nhat_ket_qua_khao_sat`
- `@khach_hang_insert`
- `@san_pham_trong_tam_import`
- `@lap_don_hang` từ CART đến bước review; chỉ submit tạo đơn trong sandbox

**Tách hai lớp kiểm thử:**

- Chatbot navigation/CART: không ghi DB, không gọi insert, chuyển đúng khách hàng/sản phẩm, không mất state và không nhân đôi item.
- Submit đơn thật trong sandbox: confirmation, double-click, idempotency, backend validation, authorization, transaction, rollback và audit.

## 6. Phân công theo miền

| Nhóm | Phạm vi |
|---|---|
| Backend/n8n | Auth gate, HTTP status, response envelope, requestId, audit |
| Database | Scope fail-closed, metadata contract, mutation transaction/rollback |
| Frontend | Form validation, renderer states, CART/navigation UX |
| QA/Security | Regression auth, role matrix, UAT 28 lệnh, mutation sandbox |

Không giao frontend tự xử lý lỗi phân quyền hoặc che dữ liệu; đây là trách nhiệm server/database.

## 7. Rollback và triển khai

1. Ghi workflow ID, version, trạng thái active và export workflow n8n đang chạy.
2. Clone thành workflow test khi có thể; không sửa trực tiếp workflow đang active.
3. Kiểm tra credential references và environment variables của bản clone trước khi test.
4. Triển khai P0 vào môi trường test; có checklist deactivate/activate rõ ràng.
5. Chạy auth regression; nếu request hợp lệ bị chặn hoặc request ẩn danh vẫn tới SQL, rollback cả workflow và environment variables.
6. Sau rollback chạy lại smoke auth để xác nhận hệ thống về trạng thái dự kiến.
7. Triển khai SQL scope/metadata bằng migration có kiểm tra trước/sau; inventory migration không thể đảo ngược và tạo backup/snapshot trước thay đổi dữ liệu lớn.
8. Chạy P1 contract tests, sau đó build frontend.
9. Chỉ mở UAT UI sau khi Security Release Gate đạt 100%.

## 8. Security Release Gate

- Ba endpoint trả 401/403 đúng contract khi thiếu/sai quyền.
- Không có SP execution cho request chưa xác thực.
- Manager/TDV nhận đúng danh mục lệnh và phạm vi dữ liệu.
- Metadata endpoints đã đóng và lọc theo capability/scope.
- CORS baseline và auth error contract nhất quán.
- Automated security regression pass 100%.

Gate này có thể được xác nhận độc lập để đóng blocker bảo mật, không chờ hoàn tất toàn bộ metadata/UI.

## 9. Full Feature Definition of Done

- 24 lệnh đọc pass success/no-data/error contract.
- 28 lệnh có metadata contract được duyệt.
- Metadata có version/checksum và cache invalidation đã kiểm tra.
- Playwright Guest/Manager/TDV pass và có HTML report/trace khi fail.
- Ba mutation pass sandbox với idempotency/transaction/audit.
- Navigation CART pass riêng: không ghi DB trước submit, không mất state hoặc nhân đôi item.
- UI không hiển thị business error như dữ liệu.
- Có báo cáo test lại kèm requestId, HTTP status và bằng chứng không chứa dữ liệu nhạy cảm.
