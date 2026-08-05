# CORE-010 — Regression và hardening toàn bộ luồng mutation

**Ngày kiểm tra:** 05/08/2026  
**Môi trường kiểm tra SQL:** `medtest`, mọi mutation thử nghiệm nằm trong transaction và đã `ROLLBACK`  
**Trạng thái:** `READY_FOR_END_TO_END_UAT`  
**Phạm vi:** tạo khách hàng và tạo đơn hàng qua direct gateway  
**Git base SHA:** `4d25f58a913d5e477f11e686ce11c204ab48c8ee`  
**Commit triển khai:** chưa có; thay đổi hiện ở working tree và chưa được deploy

## 1. Kết luận

Phần code và SQL local đã được harden theo một pipeline thống nhất:

```text
token đã xác minh
→ capability bắt buộc
→ identity/scope phía server
→ validate payload
→ request ID + idempotency key
→ transaction + khóa ledger
→ ghi nghiệp vụ + kết quả replay + audit
→ commit
```

CORE-010 chưa được đánh dấu `DONE`. Còn thiếu UAT qua token/UI thật, kiểm thử đồng thời thật và bằng chứng lỗi DB trên runtime đã deploy. Không có thay đổi nào được deploy lên production trong đợt này.

## 2. Root cause và lỗ hổng trước khi sửa

- Gateway chỉ bảo vệ riêng endpoint tạo đơn; endpoint tạo khách vẫn có thể nhận identity do trình duyệt gửi.
- Gateway chưa bắt buộc capability riêng cho hai mutation.
- Tạo khách chỉ có chống double-click phía frontend, chưa có ledger idempotency ở server nên retry hoặc hai request đồng thời vẫn có thể tạo lặp.
- Audit trong SQL tạo đơn là tùy chọn: thiếu procedure audit vẫn có thể commit nghiệp vụ.
- Replay và lỗi chưa có contract audit thống nhất; correlation giữa request, fingerprint và kết quả chưa đầy đủ.
- Gate UAT-018 còn kiểm tra marker tồn kho cũ `ReservedQuantity`, không khớp contract STOCK-001 hiện hành là `AvailableStock` theo kho được cấp quyền.

## 3. Các file thay đổi

- `server.js`: guard mutation dùng chung, verified identity, capability, request ID, idempotency context và HTTP `409` cho conflict/in-progress.
- `sql/Module common - API_KhachHang_Insert_AI.sql`: idempotency, deterministic replay, conflict, transaction và audit bắt buộc cho tạo khách.
- `sql/Module common - API_DonHangChiTiet_Insert_AI.sql`: audit bắt buộc/fail-closed cho create, replay và failure; bổ sung evidence capability/fingerprint/branch.
- `scripts/verify_uat017_customer_create.js`: thêm gate idempotency, replay, audit và gateway cho tạo khách.
- `scripts/verify_uat018_order_create.js`: thêm gate audit và chuyển evidence tồn kho sang contract STOCK-001 hiện hành.
- `scripts/test_core010_mutation_hardening.js`: regression tĩnh CORE-010.
- `scripts/test_core010_gateway_mutation_policy.js`: integration test gateway với backend giả lập.
- `scripts/preflight_core010_sql.js`: compile/preflight SQL trong transaction rồi rollback.
- `scripts/verify_core010_customer_mutation_rollback.js`: mutation test có kiểm tra replay/conflict/audit/fail-closed rồi rollback.

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

`ExtraInfo` chứa request ID, SHA-256 idempotency key, payload fingerprint, capability bắt buộc, branch và result code/outcome. Không ghi access token, password hoặc raw idempotency key.

## 6. Identity, capability và scope

Gateway không tin `User`/`Username` từ client. Nó gọi `API_UserInfo` bằng token hiện tại, từ chối user bị disable hoặc identity không xác minh được, rồi ghi đè identity trong body.

- Tạo khách bắt buộc `customers.write`.
- Tạo đơn bắt buộc `orders.write`.
- Chấp nhận capability chính xác hoặc wildcard đã được nguồn identity cấp; không suy đoán quyền từ tên vai trò.
- SQL tiếp tục kiểm tra branch, nhóm khách, nhân viên được quản lý, khách hàng và kho theo scope nghiệp vụ.

Điểm chặn trước deploy: phải xác nhận `API_UserInfo` runtime thực sự trả hai capability trên cho đúng 13 tài khoản UAT. Nếu nguồn identity chưa cấp capability, phải sửa authority/capability contract trước; không thêm fallback hard-code theo role.

## 7. Kết quả kiểm tra

| Nhóm kiểm tra | Kết quả | Ghi chú |
| --- | --- | --- |
| Static hardening | PASS `10/10` | Hai mutation, idempotency, audit, transaction, client defence-in-depth, confirm/cancel |
| Gateway policy | PASS `5/5` | Deny order/customer thiếu quyền; token hết hạn; identity overwrite; conflict → HTTP 409 |
| SQL compile preflight | PASS | Áp migration + audit + hai procedure trong transaction, không gọi mutation, đã rollback |
| Customer mutation rollback | PASS | Create → replay cùng ObjectID → conflict; đủ 3 audit event; audit unavailable fail-closed cho khách và đơn |
| Cleanup sau rollback | PASS | `CustomerCount = 0`, `AuditCount = 0`, `PersistedChanges = false` |
| CORE-009 regression | PASS `23/23` | Draft/preview không tự tạo đơn |
| Natural chat static | PASS `163/163` | Không phát hiện regression tĩnh |
| Natural chat resilience | PASS `5/5` | Các guard resilience hiện hành giữ nguyên |
| UAT-017 read-only trên procedure đang deploy | BLOCKED | `medtest` vẫn là procedure tạo khách cũ, thiếu 3 gate mới |
| UAT-018 read-only trên procedure đang deploy | BLOCKED | `medtest` vẫn thiếu mandatory-audit mới; gate STOCK-001 đã khớp |

Request ID của lần mutation rollback thành công có dạng:

- `req-core010-customer-a-1785915643933`: create.
- `req-core010-customer-b-1785915643933`: deterministic replay.
- `req-core010-customer-c-1785915643933`: idempotency conflict.
- `req-core010-customer-no-audit-1785915643933`: customer fail-closed khi audit vắng.
- `req-core010-order-no-audit-1785915643933`: order fail-closed khi audit vắng.

Các ObjectID/request ID trên chỉ là bằng chứng trong transaction đã rollback; không phải dữ liệu còn tồn tại trên `medtest`.

## 8. Những ca UAT còn phải chạy sau deploy

| Ca | Tạo khách | Tạo đơn | Điều kiện pass |
| --- | --- | --- | --- |
| Chưa xác nhận | Còn thiếu UI/token | Còn thiếu UI/token | Không có row nghiệp vụ/audit create |
| Hủy | Còn thiếu UI/token | Còn thiếu UI/token | Không mutation |
| Hết phiên | Gateway mock PASS | Gateway mock PASS | HTTP 401, không gọi upstream |
| Double-click/concurrency | SQL locking đã có, còn thiếu tải đồng thời thật | SQL locking đã có, còn thiếu tải đồng thời thật | Chỉ một entity, request sau replay/in-progress |
| Retry cùng payload | SQL rollback PASS | Cần token/runtime thật | Trả cùng ObjectID/DocumentID |
| Cùng key khác payload | SQL rollback PASS | Cần token/runtime thật | HTTP/Code 409, không ghi thêm |
| Thiếu quyền | Gateway mock PASS | Gateway mock PASS | HTTP 403, upstream mutation không được gọi |
| Lỗi DB/audit | Audit unavailable rollback PASS | Audit unavailable rollback PASS | Không commit nghiệp vụ; có mã lỗi/request ID |

## 9. Trình tự deploy đề xuất

1. Sao lưu definition hiện hành của hai procedure và `server.js` đang chạy.
2. Read-only preflight 13 tài khoản: xác nhận identity và capability `customers.write`/`orders.write`. Dừng deploy nếu authority chưa trả đúng.
3. Trong maintenance transaction, chạy theo thứ tự:
   - `sql/Migrate_API_Mutation_Idempotency_AI.sql`;
   - `sql/System - AI_AuditLog_AI.sql` nếu audit system chưa có hoặc cần đồng bộ procedure;
   - `sql/Module common - API_KhachHang_Insert_AI.sql`;
   - `sql/Module common - API_DonHangChiTiet_Insert_AI.sql`.
4. Deploy/restart gateway chứa `server.js` mới.
5. Chạy lại UAT-017/UAT-018 read-only; sau đó chạy ma trận UAT qua token/UI thật và lưu request ID, ảnh, log.
6. Chỉ đổi CORE-010 thành `DONE` khi tất cả ca ở mục 8 pass và không có mutation ngoài ý muốn.

## 10. Rollback

- Khôi phục đồng thời `server.js` và definition cũ của cả hai procedure; không rollback riêng một lớp vì sẽ làm lệch contract request/audit.
- Có thể giữ bảng ledger và các cột additive vì không ảnh hưởng procedure cũ; dừng writer mới trước khi cân nhắc xóa schema.
- Không xóa rộng dữ liệu. Nếu UAT đã tạo entity thật, chỉ xóa đúng ObjectID/DocumentID được ghi trong evidence sau khi xác minh quan hệ phụ thuộc và được phê duyệt.
- Sau rollback, chạy smoke read-only login/dashboard và hai gate UAT để xác nhận runtime trở về trạng thái trước triển khai.

## 11. Rủi ro còn lại

- Authority runtime có thể chưa trả capability write, khiến mutation fail-closed sau deploy. Đây là rủi ro cần xử lý ở nguồn quyền, không phải mở bypass.
- Chưa có bằng chứng hai request thật chạy đồng thời qua gateway/SQL đã deploy.
- Chưa có ảnh UI, request ID và log runtime cho đủ 13 tài khoản.
- Audit table hiện là thiết kế dùng chung hiện hữu; cần theo dõi retention/dung lượng vận hành riêng sau khi lưu lượng thật tăng.
