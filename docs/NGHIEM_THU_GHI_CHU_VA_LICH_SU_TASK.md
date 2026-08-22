# NGHIỆM THU, GHI CHÚ VÀ LỊCH SỬ TASK

**Cập nhật:** 22/08/2026 (đối chiếu lại với `git log hoangdang` sau các lần merge worktree `promo-cfg-002-work`, `sql-cleanup-work`, `cust-search-003-work`, `order-ui-evidence-work`)
**Mục đích:** lưu trạng thái, bằng chứng, giới hạn kiểm thử và lịch sử quyết định. Danh sách việc đang cần làm nằm tại [BackLogSuaTheoYCKhachHang.md](BackLogSuaTheoYCKhachHang.md).

## 1. Quy tắc nghiệm thu

Một task chỉ được chuyển sang `DONE` khi có đủ:

- Tài khoản, môi trường, phiên bản và thời điểm chạy.
- Input, bước tái hiện, kết quả thực tế và kết quả mong đợi.
- Ảnh/video thao tác; log và Network phải che token/dữ liệu nhạy cảm.
- Request ID nếu request đi qua gateway.
- Đối chiếu API/DB nếu liên quan dữ liệu hoặc mutation.
- Tổng `PASS/FAIL/BLOCKED`; task bị chặn ghi rõ nguyên nhân và bên cần phản hồi.

## 2. Bảng trạng thái tổng hợp

| Task | Trạng thái hiện tại | Kết luận ngắn |
| --- | --- | --- |
| `CUST-SEARCH-001` | `DONE` | Đã tái hiện trước/sau, xác định nguyên nhân gốc và nghiệm thu E2E bằng Chrome thật |
| `CORE-011` | `DONE` | Đã nghiệm thu chọn khách ở màn lập/sửa đơn |
| `CUST-SEARCH-003` | `PARTIAL_PASS_CREATE_ORDER_FIXED_EDIT_ORDER_READY_FOR_RETEST` | Race + stale-error ở màn lập đơn đã fix và có CDP evidence; blocker render màn sửa đơn đã được sửa/merge, còn phải chạy ma trận regression riêng trên màn này và các ca lỗi/scope/account |
| `PROMO-CFG-001` | `CODE_DONE_PENDING_REMAINING_BUSINESS_SIGN_OFF_AND_E2E` | Đã chốt và code `QUANTITY_GIFT` tỷ lệ + clamp max; các semantics tài chính còn mở |
| `PROMO-CFG-002` | `AUDIT_PERMISSION_MERGED_PENDING_GATEWAY_IDENTITY_AND_E2E` | Quyền âm + audit before/after (kể cả scope/rule) đã merge, 16/16 PASS; P0 giả `Username` qua gateway vẫn mở, chưa có API/UI E2E thật |
| `PROMO-CFG-003` | `BLOCKED` | Chờ contract và E2E tạo đơn thật |
| `ORDER-APPROVAL-001` | `DONE` | Khảo sát runtime/DB hoàn tất |
| `ORDER-APPROVAL-002` | `SUPERSEDED_BY_CURRENT_BUSINESS_DECISION` | Ma trận Sale/Kế toán cũ không còn là điều kiện đóng vì kế toán không dùng app; giữ làm lịch sử |
| `ORDER-APPROVAL-003` | `SUPERSEDED_SAFETY_FINDINGS_ADDRESSED` | Năm điểm review đã được 005/006 xử lý, gồm ledger idempotency thật; không còn là task độc lập |
| `ORDER-APPROVAL-004` | `SUPERSEDED_BY_ORDER_APPROVAL_005_006` | Phạm vi cũ đã được quyết định mới và 005/006 thay thế; UAT Sale/Kế toán trong app không còn phù hợp |
| `ORDER-APPROVAL-005` | `PASS_READY_FOR_QA_REVIEW` | Code và UI evidence đã merge; 13 ca E2E qua gateway/`medtest` PASS, còn QA độc lập ký xác nhận cuối |
| `ORDER-APPROVAL-006` | `PASS_READY_FOR_QA_REVIEW` | Lưu/sửa nháp, gửi duyệt/hủy riêng và chống double-click đã có evidence; còn QA độc lập ký xác nhận cuối |
| `CUSTOMER-UAT-001` | `PENDING_USER_DATA_E2E` | Readiness tool pass phần chạy được; chưa có chuỗi dữ liệu người dùng thật |
| `PRODUCT-DIAG-001` | `TECHNICALLY_ACCEPTED_PENDING_CHATBOT_E2E_AND_LIVE_IDENTITY` | Code 17/17; UI hợp lệ 2/3, thiếu Chatbot thao tác như người dùng thật và live gateway identity |
| `CUSTOMER-UAT-002` | `BLOCKED` | Chờ CUSTOMER-UAT-001 |
| `CUSTOMER-DOC-001` | `BLOCKED` | Chờ runtime UAT ổn định |
| `CUSTOMER-UAT-003` | `BLOCKED` | Chờ hướng dẫn và core fixes |
| `CUSTOMER-UAT-004` | `BLOCKED` | Chờ vòng feedback |
| `CUSTOMER-BIZ-001` | `PENDING_CUSTOMER_CLARIFICATION` | Chưa rõ phạm vi “khóa chức năng” |
| `CUSTOMER-SEC-001` | `BLOCKED` | Chờ CUSTOMER-BIZ-001 |
| `CUSTOMER-SEC-002` | `BLOCKED` | Chờ CUSTOMER-SEC-001 |

## 3. Task đã nghiệm thu `DONE`

### CUST-SEARCH-001 — Tái hiện lỗi chọn gợi ý khách hàng

- **Nghiệm thu:** 21/08/2026; môi trường local kết nối `medtest`, màn `#/edit-order`, so sánh bản trước sửa `ca6ce72` với bản sau sửa `2e9bfef` (chứa thay đổi `CORE-011` tại `74f6c53e`).
- **Kết quả trước sửa:** nhập số điện thoại không phát request tìm kiếm khách hàng và không có gợi ý (`0` request, `0` option).
- **Kết quả sau sửa:** phát đúng một request `API_KhachHangList` với `SearchText` là số điện thoại; gateway trả HTTP 200 với request ID `req-cust-search-001-after`; `data-value` bằng `ObjectID`, label bằng `DisplayName`; sau khi chọn, form tải đúng số điện thoại, địa chỉ và phường/xã.
- **Nguyên nhân gốc:** màn sửa đơn chưa cấu hình remote `searchFn`; SQL chưa tìm `SearchText` theo `Phone`; `FormSelect` trả sớm khi kết quả rỗng nên picker biến mất thay vì giữ empty-state.
- **Bằng chứng:** [biên bản chi tiết](CUST-SEARCH-001_BIEN_BAN_TAI_HIEN_VA_NGHIEM_THU_2026-08-21.md), JSON/ảnh/log tại `reports/uat/CUST-SEARCH-001/`; verifier `scripts/verify_cust_search_001_e2e.js` PASS.
- **Giới hạn:** race giữa nhiều request, API lỗi/retry, stale response và regression các màn hình khác tiếp tục thuộc `CUST-SEARCH-003`.

### CORE-011 — Sửa tìm kiếm và chọn khách hàng từ gợi ý

- **Nghiệm thu:** 21/08/2026.
- **Kết quả:** PASS màn lập đơn và sửa đơn; `xyz99999` giữ modal mở với trạng thái rỗng; `ONL1136` trả đúng khách; sau khi chọn, form map lại chi nhánh, tuyến, phường/xã, địa chỉ và SĐT.
- **Kỹ thuật:** option dùng `{ value: ObjectID, label: DisplayName }`, cache/deduplicate theo `ObjectID`; commit được ghi nhận là `74f6c53e`.
- **Giới hạn đã tách sang task khác:** Enter, chọn–xóa–chọn lại, trùng tên/ngoài scope, API chậm/lỗi và regression toàn màn hình thuộc `CUST-SEARCH-003`.

### ORDER-APPROVAL-001 — Khảo sát workflow đơn hiện hành

- **Nghiệm thu:** 21/08/2026.
- **Kết quả:** xác nhận `API_DonHangChiTiet_Insert_AI` tạo đơn ở `StatusID=0`; workflow ERP cũ chưa có điểm duyệt Kế toán an toàn được chứng minh.
- **Bằng chứng:** ca kiểm chứng đường cập nhật cũ dùng evidence ID `ORDER-APPROVAL-001-07d70ddd-3e75-47dc-ad1f-9acabd533dca` và rollback toàn bộ.
- **Tài liệu:** [ORDER-APPROVAL-001_KHAO_SAT_WORKFLOW_DON_HIEN_HANH_2026-08-21.md](ORDER-APPROVAL-001_KHAO_SAT_WORKFLOW_DON_HIEN_HANH_2026-08-21.md).

## 4. Task đã có kết quả kỹ thuật nhưng chưa `DONE`

### CUST-SEARCH-003

- **Cập nhật 22/08/2026 — nguyên nhân gốc thật khác dự đoán trước đó:** sequence guard ở `customer-management.js`/`contract-point.js` không bảo vệ được bộ chọn khách ở màn lập/sửa đơn — hai màn đó dùng component dùng chung [FormSelect.js](../src/js/components/FormSelect.js), và `_openPicker`'s remote `searchFn` không có cơ chế kiểm request nào cả (không phải "đã có guard, thiếu bằng chứng" như ghi trước đây).
- **Đã fix và merge** (`4f288b5`): thêm bộ đếm generation trong `_openPicker`, chỉ áp kết quả của request còn là request mới nhất; đồng thời bỏ `Alert.error` vô điều kiện ở nhánh lỗi `searchFn` của `create-order.js`/`edit-order.js` (lỗi của request đã bị bỏ qua không nên hiện toast).
- **Bằng chứng màn lập đơn (create-order) — PASS thật bằng Chrome DevTools Protocol**, không phải suy luận từ code: giữ response request chậm (gõ trước) lại 354ms cho tới sau khi response request nhanh (gõ sau) đã render xong, rồi mới thả ra — kết quả cuối cùng vẫn giữ đúng danh sách của request nhanh, không bị request chậm ghi đè. Ca lỗi trễ (request bị hủy bỏ nhưng sau đó mới báo lỗi) cũng không hiện toast và không xóa kết quả đang hiển thị. Ảnh/JSON tại `reports/uat/CUST-SEARCH-003/`.
- **Màn sửa đơn (edit-order): lần kiểm CUST-SEARCH trước đã SKIP, nhưng blocker nay đã được sửa và merge.** `order-ui-evidence-work` chuẩn hóa cờ `CanEdit`, giữ envelope nghiệp vụ/`BlockMsg` và được merge vào `hoangdang` tại `fb85981`; E2E ORDER-APPROVAL-005/006 đã chứng minh form sửa đơn render được. Điều này chỉ gỡ blocker, chưa thay thế bài test race riêng của CUST-SEARCH-003.
- **Chưa làm:** race/stale-response trên màn sửa đơn; API lỗi/retry có chủ đích (ngoài ca lỗi trễ ở trên); đổi tài khoản 2 người dùng thật; khách ngoài scope; ma trận regression đầy đủ theo yêu cầu backlog gốc. `CrossAccountCacheScope` trong bằng chứng mới chỉ chụp 1 mẫu cache key có gắn username, chưa phải test chuyển tài khoản thật.

### PROMO-CFG-001/002/003

- Business chốt ngày 22/08/2026 cho `QUANTITY_GIFT`: gói `10+2` mua `5` tặng `1`; vượt `MaximumQuantity` thì clamp quyền lợi tại max (`80→8`, mua `100` vẫn tặng `8`), không loại rule/fallback note-text.
- Frontend, API đọc rule và SQL tạo đơn đã dùng contract `PROMOTION_BENEFIT_V2`; `verify_promo_cfg001_fixes.js` rollback PASS 6 nhóm: ma trận tỷ lệ, clamp max, giữ nguyên discount, deterministic tie-break và chặn quà khác SKU.
- Chưa được coi là E2E tạo đơn: script hiện kiểm helper/CTE, chưa có mutation API/UI thật với request ID.
- Điểm business còn mở: VAT, rule chiết khấu/giá trị, `MaximumOrderAmount`, trả hàng, làm tròn tiền và fallback khi quà tính ra bằng `0`.
- **Cập nhật 22/08/2026 — PROMO-CFG-002 (quyền âm + audit) đã merge:** `API_PromotionProgram_Upsert_AI` ghi audit trước/sau (gồm cả nội dung rule, `BranchIDs`, `UserGroupIDs`, không chỉ đếm số dòng) qua `AI_WriteAuditLog`, fail-closed nếu hạ tầng audit thiếu; `API_PromotionProgram_Approve_AI` thêm `@Reason`, bắt buộc khi REJECT/WITHDRAW. Verify `verify_promo_cfg002_permission_and_audit.js`: **16/16 PASS** trên `medtest` (rollback), gồm quyền âm tạo/duyệt, khóa sửa bản đã duyệt, audit trước/sau (rule + scope), bắt buộc lý do, config tương lai/hết hạn/sai scope bị loại đúng.
- **P0 còn mở, chưa sửa:** test quyền âm ở trên chỉ gọi thẳng proc SQL với `@Username` giả — **không** chứng minh gateway chặn được người dùng thường sửa payload thành `Username` của quản lý rồi gọi qua HTTP thật. Promotion admin APIs chưa nằm trong identity-server-owned policy của `server.js` (khác với `API_DonHang_ApprovalContext_AI`/`API_HangHoaList_AI` đã có). Cần bổ sung policy tại gateway và kiểm thử spoofing qua HTTP runtime thật.
- Chưa có mutation API/UI thật với request ID cho phần quyền/audit này.

### ORDER-APPROVAL-002/003/004

- Kiến trúc contract data-driven, audit và approval transition hiện hữu đã có bộ verifier rollback.
- Kết quả gần nhất: `verify_order_status_guard.js` 11/11; `verify_order_approval_transition.js` 25/25.
- `SUBMIT/CANCEL` hiện vẫn là dữ liệu `DRAFT`; verifier chỉ bật tạm trong transaction, không phải business sign-off.
- Review độc lập phát hiện các điểm chặn:
  - Ba CRUD cũ không nhận actor nên gateway chưa thể kiểm ownership/scope.
  - Bắt `Idempotency-Key` ở gateway không tạo idempotency server nếu proc không có ledger.
  - Tra trạng thái và mutation là hai request riêng, còn race condition.
  - Chủ đơn có thể hủy từ trạng thái đã duyệt vì rule owner chưa giới hạn `-1/0`.
  - `API_DonHang_StatusLookup_AI` được ghi là nội bộ nhưng chưa bị chặn khỏi generic gateway.
- Ca DB rollback đã chứng minh owner `NAMDINHB.MED` có thể hủy `DMB0726/1` từ `StatusID=1` sang `10`; thay đổi đã rollback.
- **Cập nhật 22/08/2026 — đã merge `ORDER-APPROVAL-005` (khóa/sửa đơn) và `ORDER-APPROVAL-006` (mở lại Gửi duyệt/Hủy nháp)** (commit `2e9c3ac`), đối chiếu lại 5 điểm review trước:
  1. **Ownership 3 proc CRUD cũ** → đã vá: 5 proc cũ (`API_DonHang_Update/Delete`, `API_DonHangChiTiet_Insert/Update/Delete`) bị chặn hẳn khỏi gateway chung (`BLOCKED_ERP_ENDPOINTS`), thay bằng proc mới trong `sql/ORDER-APPROVAL-005_Order_Edit_Guard_AI.sql` có khóa dòng + kiểm quyền trong cùng transaction.
  2. **Race giữa tra trạng thái và mutation** → đã vá: gộp vào cùng transaction ở proc mới, không còn 2 request riêng.
  3. **Chủ đơn hủy được đơn đã duyệt** → đã giới hạn: hợp đồng dữ liệu mới (`ORDER-APPROVAL-006_Draft_Restore_AI.sql`) chỉ cho `CANCEL` từ `StatusID=-1` (nháp) sang `10`, không còn đường từ trạng thái đã duyệt.
  4. **`API_DonHang_StatusLookup_AI` hở qua gateway** → đã vá: thêm vào `BLOCKED_ERP_ENDPOINTS`, không expose ra generic gateway nữa.
  5. **Idempotency-Key không có ledger thật** → đã xác nhận: proc mới có ledger replay/conflict; `verify_order_edit_guard_ai.js` và `verify_donhang_ownertransition_ai.js` có ca replay không ghi lần hai và conflict khi cùng khóa/khác payload. E2E double-click gửi duyệt/hủy cũng chỉ phát đúng một mutation.
  - Verify kỹ thuật: `scripts/verify_order_edit_guard_ai.js` — **11 PASS / 0 FAIL / 0 SKIPPED** trên `medtest` (rollback); `verify_order_status_guard.js`, `verify_donhang_ownertransition_ai.js` và build đều PASS trong lượt nghiệm thu liên quan.
  - Quyết định business ngày 21/08/2026 đã làm phạm vi cũ của 002/004 hết hiệu lực: kế toán không dùng app, chỉ làm bên PMKT. Các mục 002/003/004 được giữ làm lịch sử, không dùng làm điều kiện đóng cho workflow hiện hành.

### ORDER-APPROVAL-005/006

- **Trạng thái thực tế:** code/evidence từ `order-ui-evidence-work` đã merge vào `hoangdang` tại commit merge `fb85981`; không còn trạng thái “worktree chưa merge”.
- **Kết quả E2E:** `PASS_READY_FOR_QA_REVIEW`, gồm 13 ca trên Chrome thật qua local gateway và `medtest` với ba tài khoản Owner/Manager/Sale khác. Đã chứng minh tạo–sửa nháp, sửa không tự gửi, gửi duyệt riêng, khóa Sale sau gửi, quản lý cùng chi nhánh sửa được, Sale khác bị chặn, chỉ hủy nháp và double-click không tạo hai mutation.
- **Đối soát:** đơn UAT `DMB0826/11` kết thúc ở `StatusID=0`, `DMB0826/12` ở `StatusID=10`; request ID và trạng thái DB nằm tại [bộ evidence ORDER-APPROVAL-005/006](../reports/uat/ORDER-APPROVAL-005-006/README.md).
- **Còn lại:** QA độc lập đối chiếu evidence và ký xác nhận cuối. Không còn lỗi code đã biết trong phạm vi 005/006.

### CUSTOMER-UAT-001

- `uat_data_readiness.js` phân biệt các lỗi item, customer, giá, tồn, kho và ba trạng thái CTBH; không seed dữ liệu.
- Kết quả được ghi nhận: 13 PASS / 0 FAIL / 2 SKIPPED. Hai ca skip là thiếu CTBH config active và thiếu actor-config user không phải manager global; không được tính là PASS.
- Hard-code scan gần nhất quét 529 file, `RuntimeFindings: []`; phạm vi scan chỉ bao phủ các token fixture đã khai báo.
- Chưa nghiệm thu E2E vì cấu hình actor/customer hiện gắn với `demo`; phải dùng tài khoản có `EmployeeID` và dữ liệu do người dùng tạo.

### PRODUCT-DIAG-001

- SQL/runtime có contract `PRODUCT_ORDERABILITY_V1`; các ca `B043`, `A003`, `ZZZ999`, customer ngoài scope và thiếu quyền kho trả đúng mã đã định nghĩa.
- `verify_product_diag_001.js`: 17 PASS / 0 FAIL / 0 SKIPPED. Hai ca mới về gateway là unit test dùng `fetch` giả và envelope dựng sẵn, không phải request gateway runtime.
- `verify_order_status_guard.js`: 11/11 PASS; build production PASS.
- Bằng chứng UI hợp lệ hiện tại:
  - Tạo đơn: PASS.
  - Sửa đơn: PASS.
  - Chatbot: **chưa chấp nhận là E2E người dùng thật**. Script hiện gọi trực tiếp `window.ApiEngine.selectApi(...)` để mở/prefill flow rồi chờ engine tải dữ liệu; dù không còn tự gán kết quả chẩn đoán vào DOM, thao tác này vẫn bỏ qua chuỗi click/nhập/chọn mà người dùng thực hiện trên UI.
- Trạng thái `DONE` ghi trước đây bị thu hồi. Trạng thái đúng là `TECHNICALLY_ACCEPTED_PENDING_CHATBOT_E2E_AND_LIVE_IDENTITY`.
- Biên bản kỹ thuật hiện còn mâu thuẫn giữa `PENDING_UI_EVIDENCE` và `DONE`; chỉ cập nhật lại sau khi có bằng chứng hợp lệ.

## 5. Ghi chú vận hành và bằng chứng

- Không lưu mật khẩu đăng nhập thật trong script test; dùng biến môi trường hoặc phiên đăng nhập do người kiểm thử chuẩn bị.
- Không ghi/copy artifact sang đường dẫn cá nhân ngoài workspace. Bằng chứng chuẩn nằm trong `reports/uat/`.
- Test UI không được tự gán nội dung hoặc style vào phần tử cần assert; phải thao tác qua cùng event/handler mà người dùng thật sử dụng.
- Tên test phải phản ánh đúng phạm vi: mock/fake envelope là unit test, không gọi là gateway runtime.
- Mọi mutation test trên `medtest` phải rollback hoặc có manifest dọn dữ liệu rõ ràng.

### `sql/` — dọn dẹp cấu trúc (22/08/2026, không liên quan nghiệm thu nghiệp vụ)

- Archive 22 file one-off/trùng lặp không còn proc/function nào sống vào `sql/_archive/` (giữ nguyên tên, không xóa hẳn); loại trừ 3 file (`Migrate_Business_Rule_Baseline_V1_AI.sql`, `ORDER-APPROVAL-004_Submit_Cancel_Contract_Seed_AI.sql`, `update_schema_AI.sql`) dù không ai tham chiếu vì có thể là hạ tầng/seed thật.
- Đổi tên 35 file kiểu `Module N - API_X_AI.sql` sang chuẩn gạch dưới `Module_NN_API_X_AI.sql`; **không đổi tên procedure/function bên trong** nên không ảnh hưởng endpoint đang chạy. Đã cập nhật hết tham chiếu trong `scripts/`, `docs/` và các file `.sql` khác, sweep cuối 0 tham chiếu cũ còn sót.
- Đã merge vào `hoangdang` (`89464f9`). Chi tiết đầy đủ và bảng đổi tên xem lịch sử hội thoại hoặc `git show 7b90fe9`.

### Trạng thái worktree (22/08/2026)

| Worktree | Branch | Đã merge vào `hoangdang`? |
| --- | --- | --- |
| `.claude/worktrees/promo-cfg-002` | `promo-cfg-002-work` | Merged |
| `.claude/worktrees/sql-cleanup` | `sql-cleanup-work` | Merged |
| `.claude/worktrees/cust-search-003` | `cust-search-003-work` | Merged |
| `.claude/worktrees/order-ui-evidence` | `order-ui-evidence-work` | Merged vào `hoangdang` tại `fb85981` (gồm commit hoàn thiện `ed09c48`) |

## 6. Tài liệu liên quan

- [Backlog việc cần làm](BackLogSuaTheoYCKhachHang.md)
- [Biên bản tái hiện và nghiệm thu CUST-SEARCH-001](CUST-SEARCH-001_BIEN_BAN_TAI_HIEN_VA_NGHIEM_THU_2026-08-21.md)
- [Biên bản kỹ thuật PRODUCT-DIAG-001](PRODUCT-DIAG-001_BIEN_BAN_NGHIEM_THU_KY_THUAT_2026-08-21.md)
- [Hướng dẫn chốt contract duyệt đơn](ORDER-APPROVAL-002_HUONG_DAN_CHOT_HOP_DONG_DUYET_DON.md)
- [Chuỗi dữ liệu tối thiểu CUSTOMER-UAT-001](CUSTOMER-UAT-001_CHUOI_DU_LIEU_TOI_THIEU.md)
- Bằng chứng race condition CUST-SEARCH-003 (trước/sau CDP intercept): `reports/uat/CUST-SEARCH-003/`
