# CORE-010 — Regression và hardening toàn bộ luồng mutation

**Ngày kiểm tra:** 05/08/2026  
**Môi trường kiểm tra SQL:** `medtest`, mọi mutation thử nghiệm nằm trong transaction và đã `ROLLBACK`  
**Trạng thái:** `SQL_DEPLOYED_MEDTEST_VERIFIED_UAT_REPORTED_PENDING_AUDIT_EVIDENCE`
**Phạm vi:** tạo khách hàng và tạo đơn hàng qua direct gateway  
**Git base SHA:** `4d25f58a913d5e477f11e686ce11c204ab48c8ee`  
**Commit triển khai:** chưa có SHA; SQL `medtest` đã được user deploy từ working tree

## 1. Kết luận

Phần code và SQL local đã được harden theo một pipeline thống nhất:

```text
token đã xác minh
→ identity do gateway xác minh và ghi đè
→ scope nghiệp vụ do SQL hiện hữu kiểm tra
→ validate payload
→ request ID + idempotency key
→ transaction + khóa ledger
→ ghi nghiệp vụ + kết quả replay + audit
→ commit
```

CORE-010 chưa được đánh dấu `DONE`. User xác nhận đã deploy và chạy UAT thật; hậu kiểm read-only xác nhận hai procedure mới đang có trên `medtest`. Tuy nhiên chưa có audit lưu bền để đối chiếu UAT: toàn bộ nhóm event CORE-010 trong `AI_AuditLog` hiện có số lượng `0`. Không có bằng chứng production deploy trong đợt này.

## 2. Root cause và lỗ hổng trước khi sửa

- Gateway chỉ bảo vệ riêng endpoint tạo đơn; endpoint tạo khách vẫn có thể nhận identity do trình duyệt gửi.
- Gateway từng được bổ sung capability riêng cho hai mutation nhưng `API_UserInfo` không có contract trả capability, làm manager hợp lệ bị chặn trước SQL. Guard chưa có nguồn quyền này đã được loại bỏ; không tạo schema/quyền mới trong DB.
- Tạo khách chỉ có chống double-click phía frontend, chưa có ledger idempotency ở server nên retry hoặc hai request đồng thời vẫn có thể tạo lặp.
- Audit trong SQL tạo đơn là tùy chọn: thiếu procedure audit vẫn có thể commit nghiệp vụ.
- Replay và lỗi chưa có contract audit thống nhất; correlation giữa request, fingerprint và kết quả chưa đầy đủ.
- Gate UAT-018 còn kiểm tra marker tồn kho cũ `ReservedQuantity`, không khớp contract STOCK-001 hiện hành là `AvailableStock` theo kho được cấp quyền.

## 3. Các file thay đổi

- `server.js`: guard mutation dùng chung, verified identity, request ID, idempotency context và HTTP `409` cho conflict/in-progress; quyền/phạm vi tiếp tục dùng SQL nghiệp vụ hiện hữu.
- `sql/Module common - API_KhachHang_Insert_AI.sql`: idempotency, deterministic replay, conflict, transaction và audit bắt buộc cho tạo khách.
- `sql/Module common - API_DonHangChiTiet_Insert_AI.sql`: audit bắt buộc/fail-closed cho create, replay và failure; bổ sung evidence capability/fingerprint/branch.
- `scripts/verify_uat017_customer_create.js`: thêm gate idempotency, replay, audit và gateway cho tạo khách.
- `scripts/verify_uat018_order_create.js`: thêm gate audit và chuyển evidence tồn kho sang contract STOCK-001 hiện hành.
- `scripts/test_core010_mutation_hardening.js`: regression tĩnh CORE-010.
- `scripts/test_core010_gateway_mutation_policy.js`: integration test gateway với backend giả lập.
- `scripts/preflight_core010_sql.js`: compile/preflight SQL trong transaction rồi rollback.
- `scripts/verify_core010_customer_mutation_rollback.js`: mutation test có kiểm tra replay/conflict/audit/fail-closed rồi rollback.
- `scripts/verify_core010_deployed_audit.js`: hậu kiểm read-only event audit CORE-010 đang lưu trên `medtest`.

## 4. Schema và contract idempotency

Ledger dùng bảng `dbo.AI_API_MutationIdempotency` do migration `sql/Migrate_API_Mutation_Idempotency_AI.sql` quản lý.

- Khóa chính: `IdempotencyKeyHash + VerifiedUserHash + ApiCode`.
- Chỉ lưu SHA-256 của idempotency key và verified username; không lưu raw key hay token.
- Fingerprint payload lưu ở `RequestFingerprintHash`.
- Trạng thái: `PENDING`, `COMPLETED`, `FAILED`.
- Kết quả replay: `ResultEntityID`, `ResultMsg`, `ResultMsgType`.
- Lock chống race: `UPDLOCK, HOLDLOCK` trong transaction.
- Bản ghi quá 30 ngày được dọn giới hạn từng đợt bởi procedure reservation hiện hành.

### Tạo khách hàng

Fingerprint gồm verified user, `ObjectID` hoặc `AUTO_GEN`, tên, địa chỉ, SĐT và MST đã chuẩn hóa, ngày sinh, loại/kênh khách, thông tin tài khoản, branch, nhóm khách, địa chỉ hành chính, tuyến, tọa độ và nhân viên sale đã được server xác định.

- Lần đầu: trả `Code = CREATED`, `IsReplay = 0` và `ObjectID`.
- Cùng key, cùng fingerprint: trả lại đúng `ObjectID`, `Code = IDEMPOTENCY_REPLAY`, `IsReplay = 1`.
- Cùng key, khác fingerprint: không ghi nghiệp vụ, trả `Code = IDEMPOTENCY_CONFLICT`.
- Request đang xử lý: trả `Code = IDEMPOTENCY_IN_PROGRESS`.

### Tạo đơn hàng

Fingerprint gồm verified user, khách hàng, ngày chứng từ, branch, mã đơn hoặc `AUTO_GEN`, ghi chú, phường/tuyến và danh sách item đã sắp xếp ổn định gồm mã, số lượng, số lượng tặng, giá và chiết khấu.

Replay trả lại mã đơn đã hoàn thành; conflict và in-progress được gateway ánh xạ thành HTTP `409`.

## 5. Audit bắt buộc

Mutation kiểm tra `dbo.AI_WriteAuditLog` trước khi ghi. Nếu audit không tồn tại, trả `AUDIT_UNAVAILABLE` và không ghi nghiệp vụ. Nếu ghi audit lỗi trong transaction, transaction bị rollback và trả `AUDIT_WRITE_FAILED`.

Các event hiện hành:

- Khách hàng: `CREATE_CUSTOMER`, `REPLAY_CUSTOMER`, `CREATE_CUSTOMER_FAILED`, `IDEMPOTENCY_CONFLICT_CUSTOMER`.
- Đơn hàng: `CREATE_DONHANG`, `REPLAY_DONHANG`, `CREATE_DONHANG_FAILED`.

`ExtraInfo` chứa request ID, SHA-256 idempotency key, payload fingerprint, mã thao tác, branch và result code/outcome. Hai chuỗi `customers.write`/`orders.write` trong audit chỉ là nhãn thao tác hiện hành, không phải nguồn cấp quyền mới. Không ghi access token, password hoặc raw idempotency key.

## 6. Identity và scope

Gateway không tin `User`/`Username` từ client. Nó gọi `API_UserInfo` bằng token hiện tại, từ chối user bị disable hoặc identity không xác minh được, rồi ghi đè identity trong body.

- Gateway không yêu cầu capability mới vì ERP hiện không có contract capability theo tài khoản và trước đây không yêu cầu cấu hình này.
- Tạo khách được SQL kiểm tra tài khoản còn hiệu lực, loại tài khoản, branch, nhóm khách, nhân viên quản lý và địa chỉ thuộc scope.
- Tạo đơn được SQL kiểm tra tài khoản còn hiệu lực, khách hàng nhìn thấy và kho được phép.
- Không tin `User`, `Username`, branch, nhóm khách, khách hàng hoặc kho do client tự khai để mở rộng phạm vi.
- Không có migration cấp quyền và không thay đổi schema/dữ liệu phân quyền hiện hữu của `medtest` trong bản sửa regression này.

## 7. Kết quả kiểm tra

| Nhóm kiểm tra | Kết quả | Ghi chú |
| --- | --- | --- |
| Static hardening | PASS `10/10` | Hai mutation, idempotency, audit, transaction, client defence-in-depth, confirm/cancel |
| Gateway policy | PASS `5/5` | Manager hợp lệ đi tới SQL scope; thiếu idempotency và token hết hạn bị chặn; identity overwrite; conflict → HTTP 409 |
| SQL compile preflight | PASS | Áp migration + audit + hai procedure trong transaction, không gọi mutation, đã rollback |
| Customer mutation rollback | PASS | Create → replay cùng ObjectID → conflict; đủ 3 audit event; audit unavailable fail-closed cho khách và đơn |
| Cleanup sau rollback | PASS | `CustomerCount = 0`, `AuditCount = 0`, `PersistedChanges = false` |
| CORE-009 regression | PASS `23/23` | Draft/preview không tự tạo đơn |
| Natural chat static | PASS `163/163` | Không phát hiện regression tĩnh |
| Natural chat resilience | PASS `5/5` | Các guard resilience hiện hành giữ nguyên |
| UAT-017 read-only trên procedure đang deploy | PASS | Procedure tạo khách mới đã có idempotency, replay và mandatory audit |
| UAT-018 read-only trên procedure đang deploy | PASS contract | Procedure tạo đơn mới đã có mandatory audit; trạng thái gate `READY_FOR_CONTROLLED_MUTATION` |
| Audit runtime sau UAT được báo cáo | BLOCKED EVIDENCE | `RelevantEventCount = 0`, chưa có request ID/event lưu bền để đối chiếu |

Request ID của lần mutation rollback thành công có dạng:

- `req-core010-customer-a-1785915643933`: create.
- `req-core010-customer-b-1785915643933`: deterministic replay.
- `req-core010-customer-c-1785915643933`: idempotency conflict.
- `req-core010-customer-no-audit-1785915643933`: customer fail-closed khi audit vắng.
- `req-core010-order-no-audit-1785915643933`: order fail-closed khi audit vắng.

Các ObjectID/request ID trên chỉ là bằng chứng trong transaction đã rollback; không phải dữ liệu còn tồn tại trên `medtest`.

## 8. Đối chiếu UAT sau deploy

User xác nhận đã chạy UAT thật. Bảng dưới đây giữ trạng thái “chưa đối chiếu” cho các ca chưa có ảnh/log/request ID hoặc audit lưu bền trong workspace/DB; điều này không phủ nhận thao tác đã chạy, nhưng chưa đủ bằng chứng để đóng P0.

| Ca | Tạo khách | Tạo đơn | Điều kiện pass |
| --- | --- | --- | --- |
| Chưa xác nhận | User báo đã chạy; chưa có evidence | User báo đã chạy; chưa có evidence | Không có row nghiệp vụ/audit create |
| Hủy | User báo đã chạy; chưa có evidence | User báo đã chạy; chưa có evidence | Không mutation |
| Hết phiên | Gateway mock PASS | Gateway mock PASS | HTTP 401, không gọi upstream |
| Double-click/concurrency | SQL locking đã có, còn thiếu tải đồng thời thật | SQL locking đã có, còn thiếu tải đồng thời thật | Chỉ một entity, request sau replay/in-progress |
| Retry cùng payload | SQL rollback PASS | Cần token/runtime thật | Trả cùng ObjectID/DocumentID |
| Cùng key khác payload | SQL rollback PASS | Cần token/runtime thật | HTTP/Code 409, không ghi thêm |
| Thiếu quyền | Gateway mock PASS | Gateway mock PASS | HTTP 403, upstream mutation không được gọi |
| Lỗi DB/audit | Audit unavailable rollback PASS | Audit unavailable rollback PASS | Không commit nghiệp vụ; có mã lỗi/request ID |

## 9. Hậu kiểm deploy và bước đóng task

1. SQL deploy đã được xác nhận bằng UAT-017/UAT-018 read-only.
2. Lấy request ID/log/ảnh từ lần UAT đã chạy và đối chiếu `AI_AuditLog`.
3. Nếu lần UAT được chạy trong outer transaction rồi rollback, chạy lại đúng một mutation thật có kiểm soát, giữ audit và dọn riêng dữ liệu nghiệp vụ theo ID sau khi chụp evidence; không xóa audit.
4. Nếu mutation thật đã commit nhưng audit vẫn bằng `0`, dừng nghiệm thu và điều tra đường gọi/runtime/DB target vì vi phạm tiêu chí P0.
5. Chỉ đổi CORE-010 thành `DONE` khi tất cả ca ở mục 8 có bằng chứng và không có mutation ngoài ý muốn.

## 10. Rollback

- Khôi phục đồng thời `server.js` và definition cũ của cả hai procedure; không rollback riêng một lớp vì sẽ làm lệch contract request/audit.
- Có thể giữ bảng ledger và các cột additive vì không ảnh hưởng procedure cũ; dừng writer mới trước khi cân nhắc xóa schema.
- Không xóa rộng dữ liệu. Nếu UAT đã tạo entity thật, chỉ xóa đúng ObjectID/DocumentID được ghi trong evidence sau khi xác minh quan hệ phụ thuộc và được phê duyệt.
- Sau rollback, chạy smoke read-only login/dashboard và hai gate UAT để xác nhận runtime trở về trạng thái trước triển khai.

## 11. Rủi ro còn lại

- Chưa có audit lưu bền từ lần UAT được báo cáo; chưa phân biệt được UAT đã rollback, chưa tới mutation hay đang đi sai runtime/DB.
- Chưa có bằng chứng lưu trong workspace cho hai request thật chạy đồng thời qua gateway/SQL đã deploy.
- Chưa có ảnh UI, request ID và log runtime được lưu trong workspace cho ma trận UAT.
- Audit table hiện là thiết kế dùng chung hiện hữu; cần theo dõi retention/dung lượng vận hành riêng sau khi lưu lượng thật tăng.
