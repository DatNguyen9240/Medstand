# NGHIỆM THU, GHI CHÚ VÀ LỊCH SỬ TASK

**Cập nhật:** 23/08/2026 (đối chiếu thêm báo cáo QA ngoài repo và fixture `DMB0826/17`)
**Mục đích:** lưu trạng thái, bằng chứng, giới hạn kiểm thử và lịch sử quyết định. Việc còn phải chốt nghiệp vụ/code nằm tại [BackLogSuaTheoYCKhachHang.md](BackLogSuaTheoYCKhachHang.md); việc chỉ còn QA/UAT nằm tại [QA_UAT_CAN_NGHIEM_THU_LAI.md](QA_UAT_CAN_NGHIEM_THU_LAI.md).

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
| `CUST-SEARCH-003` | `DONE` | Race/stale, lỗi hiện tại + retry, đổi tài khoản thật, cô lập cache, khách ngoài scope và mapping đều PASS trên màn lập/sửa đơn; 0 mutation |
| `PROMO-CFG-001` | `DONE` | Contract V3 đã đồng bộ frontend/API/SQL, deploy `medtest`, actual-order verifier và live Gateway đều PASS |
| `PROMO-CFG-002` | `DONE` | UI REJECT/WITHDRAW qua live Gateway có request ID; actor/lý do audit khớp; identity, positional binding và regression đều PASS |
| `PROMO-CFG-003` | `DONE` | Chức năng đã PASS: preview lấy config mới, config cũ bị chặn `PROMOTION_CHANGED`, double-click một mutation, retry là replay; một đơn nháp từ harness ngoài repo được theo dõi riêng để dọn |
| `PROMO-UAT-CLEANUP-001` | `DONE` | Đã xác minh trên DB đơn test `DMB0826/17` chuyển `StatusID -1 → 10`; audit `ORDER_OWNER_TRANSITION` ghi actor `demo`, action `CANCEL`, `fromStatusID=-1`, `toStatusID=10`, `outcome=COMPLETED` |
| `ORDER-APPROVAL-001` | `DONE` | Khảo sát runtime/DB hoàn tất |
| `ORDER-APPROVAL-002` | `SUPERSEDED_BY_CURRENT_BUSINESS_DECISION` | Ma trận Sale/Kế toán cũ không còn là điều kiện đóng vì kế toán không dùng app; giữ làm lịch sử |
| `ORDER-APPROVAL-003` | `SUPERSEDED_SAFETY_FINDINGS_ADDRESSED` | Năm điểm review đã được 005/006 xử lý, gồm ledger idempotency thật; không còn là task độc lập |
| `ORDER-APPROVAL-004` | `SUPERSEDED_BY_ORDER_APPROVAL_005_006` | Phạm vi cũ đã được quyết định mới và 005/006 thay thế; UAT Sale/Kế toán trong app không còn phù hợp |
| `ORDER-APPROVAL-005` | `DONE` | QA độc lập xác nhận 13/13 ca chức năng PASS; artifact thô có PII đã xóa theo quyết định chủ dự án |
| `ORDER-APPROVAL-006` | `DONE` | Gửi duyệt/hủy riêng và chống double-click PASS; không lưu ảnh/JSON thô trong repo |
| `CUSTOMER-UAT-001` | `DONE` | Tài khoản Manager/Sale MB có `EmployeeID`, khách do tài khoản thật tạo; ba nhánh CTBH và bốn ca âm PASS; CTBH tạm được WITHDRAW/xóa, residue 0 |
| `PRODUCT-DIAG-001` | `DONE` | Code 17/17, live gateway identity 5/5 và UI 3/3 PASS; raw evidence đã loại khỏi Git |
| `CUSTOMER-UAT-002` | `READY_FOR_E2E_PENDING_BROWSER_CONNECTION` | Đầu vào readiness đã đủ; chờ chạy UI thật và thu evidence qua Browser được kết nối |
| `CUSTOMER-DOC-001` | `DRAFT_V0_1_REVIEWED_PENDING_UAT_DRY_RUN` | Bản nháp và README đã review; nội dung khớp source, không chứa credential/PII, accessibility audit 0 finding; bản cuối chờ deploy và dry-run độc lập |
| `CUSTOMER-UAT-003` | `BLOCKED` | Chờ hướng dẫn hoàn tất và chuỗi dữ liệu/E2E của CUSTOMER-UAT-001/002 |
| `CUSTOMER-UAT-004` | `BLOCKED` | Chờ vòng feedback |
| `CUSTOMER-BIZ-001` | `AWAITING_BUSINESS_SIGN_OFF` | Đã có ma trận đề xuất và gap analysis; chờ business xác nhận 6 quyết định, không dùng file report tự ghi sign-off |
| `CUSTOMER-SEC-001` | `BLOCKED` | Chờ CUSTOMER-BIZ-001 |
| `CUSTOMER-SEC-002` | `BLOCKED` | Chờ CUSTOMER-SEC-001 |

## 3. Task đã nghiệm thu `DONE`

### CUST-SEARCH-001 — Tái hiện lỗi chọn gợi ý khách hàng

- **Nghiệm thu:** 21/08/2026; môi trường local kết nối `medtest`, màn `#/edit-order`, so sánh bản trước sửa `ca6ce72` với bản sau sửa `2e9bfef` (chứa thay đổi `CORE-011` tại `74f6c53e`).
- **Kết quả trước sửa:** nhập số điện thoại không phát request tìm kiếm khách hàng và không có gợi ý (`0` request, `0` option).
- **Kết quả sau sửa:** phát đúng một request `API_KhachHangList` với `SearchText` là số điện thoại; gateway trả HTTP 200 với request ID `req-cust-search-001-after`; `data-value` bằng `ObjectID`, label bằng `DisplayName`; sau khi chọn, form tải đúng số điện thoại, địa chỉ và phường/xã.
- **Nguyên nhân gốc:** màn sửa đơn chưa cấu hình remote `searchFn`; SQL chưa tìm `SearchText` theo `Phone`; `FormSelect` trả sớm khi kết quả rỗng nên picker biến mất thay vì giữ empty-state.
- **Bằng chứng:** [biên bản chi tiết](CUST-SEARCH-001_BIEN_BAN_TAI_HIEN_VA_NGHIEM_THU_2026-08-21.md) và verifier `scripts/verify_cust_search_001_e2e.js` PASS. JSON/ảnh/log thô chỉ lưu cục bộ, bị Git ignore và không phải artifact phát hành.
- **Giới hạn lúc đóng task:** race giữa nhiều request, API lỗi/retry, stale response và regression các màn hình khác được tách sang `CUST-SEARCH-003`; phạm vi đó đã được nghiệm thu hoàn tất ngày 22/08/2026.

### CORE-011 — Sửa tìm kiếm và chọn khách hàng từ gợi ý

- **Nghiệm thu:** 21/08/2026.
- **Kết quả:** PASS màn lập đơn và sửa đơn; `xyz99999` giữ modal mở với trạng thái rỗng; `ONL1136` trả đúng khách; sau khi chọn, form map lại chi nhánh, tuyến, phường/xã, địa chỉ và SĐT.
- **Kỹ thuật:** option dùng `{ value: ObjectID, label: DisplayName }`, cache/deduplicate theo `ObjectID`; commit được ghi nhận là `74f6c53e`.
- **Giới hạn đã tách sang task khác:** Enter, chọn–xóa–chọn lại, trùng tên/ngoài scope, API chậm/lỗi và regression toàn màn hình thuộc `CUST-SEARCH-003`; task đó đã `DONE` ngày 22/08/2026.

### ORDER-APPROVAL-001 — Khảo sát workflow đơn hiện hành

- **Nghiệm thu:** 21/08/2026.
- **Kết quả:** xác nhận `API_DonHangChiTiet_Insert_AI` tạo đơn ở `StatusID=0`; workflow ERP cũ chưa có điểm duyệt Kế toán an toàn được chứng minh.
- **Bằng chứng:** ca kiểm chứng đường cập nhật cũ dùng evidence ID `ORDER-APPROVAL-001-07d70ddd-3e75-47dc-ad1f-9acabd533dca` và rollback toàn bộ.
- **Tài liệu:** [ORDER-APPROVAL-001_KHAO_SAT_WORKFLOW_DON_HIEN_HANH_2026-08-21.md](ORDER-APPROVAL-001_KHAO_SAT_WORKFLOW_DON_HIEN_HANH_2026-08-21.md).

### CUST-SEARCH-003 — Regression các màn hình dùng bộ chọn khách

- **Cập nhật 22/08/2026 — nguyên nhân gốc thật khác dự đoán trước đó:** sequence guard ở `customer-management.js`/`contract-point.js` không bảo vệ được bộ chọn khách ở màn lập/sửa đơn — hai màn đó dùng component dùng chung [FormSelect.js](../src/js/components/FormSelect.js), và `_openPicker`'s remote `searchFn` không có cơ chế kiểm request nào cả (không phải "đã có guard, thiếu bằng chứng" như ghi trước đây).
- **Đã fix và merge** (`4f288b5`): thêm bộ đếm generation trong `_openPicker`, chỉ áp kết quả của request còn là request mới nhất; đồng thời bỏ `Alert.error` vô điều kiện ở nhánh lỗi `searchFn` của `create-order.js`/`edit-order.js` (lỗi của request đã bị bỏ qua không nên hiện toast).
- **Bằng chứng màn lập đơn (create-order) — PASS thật bằng Chrome DevTools Protocol**, không phải suy luận từ code: giữ response request chậm (gõ trước) lại cho tới sau khi response request nhanh (gõ sau) đã render xong, rồi mới thả ra — kết quả cuối cùng vẫn giữ đúng danh sách của request nhanh, không bị request chậm ghi đè. Ca lỗi trễ cũng không hiện toast và không xóa kết quả đang hiển thị. Raw ảnh/JSON đã được review rồi loại khỏi Git.
- **Màn sửa đơn (edit-order): blocker đã được sửa và merge, sau đó đã chạy lại race/stale-response riêng — PASS 22/08/2026.** `order-ui-evidence-work` chuẩn hóa cờ `CanEdit`, giữ envelope nghiệp vụ/`BlockMsg` và được merge vào `hoangdang` tại `fb85981`; verifier `scripts/verify_cust_search_003_edit_order_race.js` chứng minh request cũ về trễ không ghi đè request mới, stale error không hiện toast và không xóa kết quả đang có.
- **Sự cố kỹ thuật khi viết test edit-order, tự phát hiện và tự sửa trong cùng phiên:**
  1. CDP network interception (`page.setRequestInterception`) không bắt được đều các request `fetch()` qua gateway trong môi trường này (nghi Service Worker) — chuyển sang giữ request ở tầng JS bằng cách patch `Http.get` trong trang, đọc `SearchText` trực tiếp trước khi mã hóa.
  2. **Phiên bản đầu của test tự cho PASS giả**: đồng bộ "đợi request nhanh render xong" bằng cách đoán qua nội dung (`có thấy khách kỳ vọng trong DOM chưa`) — nhưng list gốc (autoload lúc mở picker, ~500 khách) đã chứa sẵn hầu hết khách mẫu nên phép đoán này đúng ngay từ đầu, trước khi bất kỳ tìm kiếm nào thực sự chạy. Phát hiện qua việc "kết quả tìm 'Shop'" ban đầu có tới 500 dòng và cả "Techcombank" — vô lý cho một tìm kiếm đã lọc. Sửa lại bằng tín hiệu đáng tin cậy hơn: đếm số lần `_renderModal` thực sự chạy (MutationObserver trên số overlay mới được thêm vào DOM), chỉ coi là "đã render kết quả tìm kiếm" khi đếm tăng đúng 1 lần. Sau khi sửa, kết quả tìm "Shop" thật ra 466 dòng (nhiều công ty có chữ "Shop" trong tên là hợp lý), không có Techcombank — khớp đúng kỳ vọng.
  3. **Nghi vấn cũ đã được xử lý ở lượt nghiệm thu cuối:** bằng chứng GỐC của `create-order` từng ghi `visibleOptions count: 500` vì đếm cả option ẩn. Verifier hợp nhất đã được sửa để chỉ tính node thực sự hiển thị và chạy lại cả hai màn: mỗi màn có 6 kết quả `Shop` đang hiển thị, không có `Techcombank`, kể cả sau khi response `Tech` cũ được thả ra.
  4. **Phát hiện phụ, không phải bug chặn vĩnh viễn:** loading spinner toàn cục (`#global-spinner`, dùng chung 1 bộ đếm cho MỌI request đang chạy trên trang, kể cả các gọi nền không liên quan như đếm thông báo) có thể còn che và chặn click vài giây sau khi nội dung đã hiển thị xong — tự hết sau khi mọi request nền hoàn tất, nhưng là điểm UX gồ ghề nên ghi lại.
- **Nghiệm thu cuối 22/08/2026:** siết `scripts/verify_cust_search_003_e2e.js` để chỉ tính option thực sự đang hiển thị, không tính 500 option ẩn của danh sách preload. Chạy lại Chrome thật: cả `create-order` và `edit-order` đều PASS; giữa race chỉ có 6 option `Shop` hiển thị, `Techcombank` không xuất hiện; sau khi thả response `Tech` cũ, kết quả vẫn giữ nguyên, không toast và chỉ có một overlay.
- **Ma trận bổ sung:** `scripts/verify_cust_search_003_remaining_e2e.js` PASS `5/5`, `0 FAIL`, `0 SKIPPED`: request hiện tại HTTP 500 rồi retry HTTP 200 trên cả hai màn; logout tài khoản A rồi login B trong cùng browser context đã xóa cache/auth phiên A; scope hai chiều được đối chiếu bằng `AR_GetObjectByUserFnc`; màn sửa đơn kiểm riêng khách ngoài scope; chọn khách map đúng các trường từ record API.
- **Chính sách evidence:** kết luận và tên verifier được giữ trong tài liệu; JSON, Network dump và ảnh có dữ liệu tài khoản/khách chỉ được tạo cục bộ dưới `reports/`, bị Git ignore và không đưa vào nhánh phát hành.
- **Artifact QA bị bác và đã loại trước khi push:** commit local cũ `176cd9b` từng thêm `EDIT_ORDER_8_CASES_EVIDENCE.json` và `E2E_8_CASES_EDIT_ORDER_VERIFIED.png`. Bộ này bị kết luận `REJECTED_INVALID_EVIDENCE` vì đếm cả 500 option ẩn, không đổi hai tài khoản thật, dùng mã không tồn tại cho ca ngoài scope, thiếu request ID/HTTP timeline, mapping không assert đủ và còn để lộ thông tin khách. Lịch sử `hoangdang` đã được viết lại an toàn: HEAD mới `8a1bff7`, `176cd9b` không còn là ancestor và hai file không còn trong tree dự kiến push. Kết luận `DONE` vẫn dựa trên hai verifier chuẩn ở trên.
- **Kết luận:** `DONE`; toàn bộ điều kiện đóng P0/P1 của task đã đạt, không phát sinh mutation trên `medtest`.

### PROMO-CFG-001 — Contract tính quyền lợi CTBH V3

- **Nghiệm thu:** 22/08/2026; nhánh `hoangdang`, commit nền `46eeb9b`; môi trường local Gateway kết nối `medtest`.
- **Contract:** `PROMOTION_BENEFIT_V3`; quà tỷ lệ, clamp `MaximumQuantity`, discount theo khoảng số lượng/giá trị dòng, một rule thắng theo tie-break xác định, config active là nguồn chuẩn, version lạ fail-closed và tiền giảm làm tròn đến 1 đồng.
- **Deploy đồng bộ:** `scripts/deploy_promo_cfg001_v3.js --apply` triển khai schema, active-rule function, admin proc, order proc và ActiveByItems trong một transaction; đọc lại đủ 6 object và chữ ký Upsert khớp Gateway.
- **Verifier:** preflight contract `26/26`, admin `18/18`, catalog `12/12`; `verify_promo_cfg001_fixes.js` PASS `8/8`; `verify_promo_cfg001_v3_order_e2e.js` gọi proc tạo đơn thật và đối chiếu `AR_OrderDetailTbl` PASS quà 0, tỷ lệ, clamp, chặn quà sai, discount theo số lượng/giá trị và rounding; toàn bộ transaction rollback, `0` mutation tồn lưu.
- **Gateway:** `verify_promo_cfg002_gateway_identity.js` gọi encrypted live Gateway PASS `14/14`, gồm identity server-owned, token thiếu/hỏng, payload đảo thứ tự và chữ ký proc; probe ghi dùng `Apply=0`.
- **Regression:** build production PASS; order status guard `22/22`; order approval transition `25/25`, rollback.
- **Kết luận:** `DONE`. UI preview/double-click/config thay đổi trong lúc xác nhận thuộc `PROMO-CFG-003`, không còn là điều kiện đóng contract `PROMO-CFG-001`.

### PROMO-CFG-002/003 — Phân quyền/audit và UAT CTBH trên đơn thật

- **Môi trường nghiệm thu cuối:** 23/08/2026, nhánh `hoangdang`, Chrome headless thao tác UI thật qua Gateway local kết nối `medtest`; mật khẩu lấy từ cấu hình UAT bị Git ignore, không hard-code và không ghi vào output.
- **PROMO-CFG-002:** `verify_promo_cfg002_ui_trace.js` tạo dữ liệu test có marker riêng rồi thao tác REJECT và WITHDRAW tại `#/rag-admin`. Hai request HTTP đều thành công, lấy `X-Request-ID` từ response và tìm thấy đúng ID trong server log; audit ghi actor `demo` và lý do khớp nội dung nhập trên UI. Chương trình test của verifier được xóa trong `finally`.
- **Bảo vệ Gateway và SQL:** ba API đọc lấy identity từ token; Upsert/Approve dùng allowlist và đúng thứ tự tham số ERP, không tin `Username` từ client. `verify_promo_cfg002_gateway_identity.js`, `verify_order_status_guard.js` và `verify_promo_cfg002_permission_and_audit.js` đều PASS; proc live có đủ `@Reason`, audit snapshot chứa rule và scope, audit fail-closed.
- **PROMO-CFG-003:** `verify_promo_cfg003_config_race_e2e.js` chứng minh UI preview cấu hình A cho quà `3`; sau khi A bị thu hồi và B được duyệt, submit theo preview cũ trả `PROMOTION_CHANGED` và không tạo đơn. Tải lại màn hình lấy đúng cấu hình B cho quà `1`; double-click chỉ phát một mutation; gửi lại cùng `Idempotency-Key` trả replay; ba request ID đều khớp server log.
- **Lỗi phát hiện trong lúc nghiệm thu và bản vá:** `ACTIVE_BY_ITEMS` từng dùng cache GET của `Http`, nên refresh vẫn có thể dùng cấu hình cũ. `create-order.js` nay gọi endpoint này với `{ cache: false }`; bundle production đã build lại. Verifier cũng chuẩn hóa các giá trị optional dạng chuỗi rỗng trong `promotion.js` để frontend và SQL chọn rule giống nhau.
- **Dọn dữ liệu của verifier trong repo:** mỗi lượt verifier mới xóa chương trình CTBH tạm và hủy đơn test qua `API_DonHang_OwnerTransition_AI`. Ba fixture CTBH cũ `E2E_UI_MUT_*` đã xóa sau dry-run có khóa/guard; ba đơn nháp A014 cũ và các đơn của lượt chốt đã chuyển `StatusID=10`.
- **Đối chiếu báo cáo QA ngoài repo:** harness scratch dùng `M002` đã tạo đơn `DMB0826/17`. Truy vấn read-only ngày 23/08/2026 xác nhận đơn vẫn là nháp (`StatusID=-1`), actor `demo`, một dòng `M002`, số lượng `10`, quà `1`. Các file JSON/ảnh mà báo cáo dẫn chiếu không còn tồn tại do đã xóa theo chính sách evidence; cổng local `3000` cũng không còn tiến trình lắng nghe. Vì harness nằm ngoài repo nên bằng chứng có thể tái lập hiện dựa trên hai verifier chính thức đã commit.
- **Kết luận:** `PROMO-CFG-002` và chức năng `PROMO-CFG-003` đều `DONE`; riêng việc kết thúc `DMB0826/17` được tách thành `PROMO-UAT-CLEANUP-001`, không được tiếp tục mô tả môi trường là “không còn dữ liệu test” cho tới khi mục đó đóng.

## 4. Task đã có kết quả kỹ thuật nhưng chưa `DONE`

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

- **Trạng thái thực tế:** code từ `order-ui-evidence-work` đã merge vào `hoangdang` tại commit merge `fb85981`; không còn trạng thái “worktree chưa merge”. Artifact E2E thô đã được loại khỏi cây file hiện hành.
- **Kết quả QA độc lập ngày 22/08/2026:** `13/13 PASS` trên Chrome thật qua local gateway và `medtest` với ba tài khoản Owner/Manager/Sale khác. Đã chứng minh tạo–sửa nháp, sửa không tự gửi, gửi duyệt riêng, khóa Sale sau gửi, quản lý cùng chi nhánh sửa được, Sale khác bị chặn, chỉ hủy nháp và double-click không tạo hai mutation.
- **Đối soát DB/audit độc lập:** hai đơn UAT kết thúc đúng trạng thái gửi duyệt và hủy; mỗi đơn có đúng một dòng chi tiết. Audit khớp toàn bộ chuỗi CREATE/EDIT/SUBMIT/MANAGER-EDIT/CREATE/CANCEL và mỗi thao tác chuyển trạng thái chỉ có một mutation.
- **Verify chạy lại:** `verify_order_status_guard.js` **22/22 PASS**; `verify_order_edit_permission_normalization.js` **20/20 PASS**; `verify_order_edit_guard_ai.js` **11/11 PASS**, rollback; `verify_donhang_ownertransition_ai.js` PASS và rollback, một ca `CANCEL_BLOCKED_FROM_DELIVERED_STATUS` SKIP vì môi trường không có fixture `StatusID=7`. Lượt đầu của edit-guard gặp lỗi trạng thái connection pool tạm thời; chạy riêng lại ngay sau đó PASS đầy đủ và không có mutation tồn dư.
- **Quyết định evidence ngày 22/08/2026:** chủ dự án không yêu cầu thu lại bộ ảnh/JSON công khai. Toàn bộ 19 artifact thô có dữ liệu nhận diện khách đã bị xóa khỏi cây file hiện hành; hồ sơ chỉ giữ kết luận QA tổng hợp không chứa tài khoản, mã đơn, request ID hoặc dữ liệu khách.
- **Kết luận:** không còn lỗi code đã biết; QA chức năng 13/13 PASS và yêu cầu vệ sinh evidence đã hoàn tất bằng cách loại artifact thô. `ORDER-APPROVAL-005/006` chuyển `DONE`.
- **PROMO-UAT-CLEANUP-001 (23/08/2026):** Đối chiếu DB xác nhận `AR_OrderTbl.StatusID` của `DMB0826/17` đã chuyển `-1 → 10`. `AI_AuditLog` LogID 3567 ghi `ActionType=ORDER_OWNER_TRANSITION`, `Username=demo`, `TargetID=DMB0826/17`; nội dung audit thể hiện `action=CANCEL`, `fromStatusID=-1`, `toStatusID=10`, `outcome=COMPLETED`. Screenshot không đủ điều kiện evidence và đã bị loại; không dùng ảnh hoặc tuyên bố replay chưa tái lập làm căn cứ nghiệm thu. `PROMO-UAT-CLEANUP-001` chuyển `DONE`.
- **Hiệu chỉnh báo cáo QA (23/08/2026):** loại kết luận `IsReplay=True` khỏi phần tóm tắt cleanup vì không có idempotency key hoặc ledger query được lưu để tái lập độc lập. Ca replay của `PROMO-CFG-003` và các verifier chuyển trạng thái khác không được dùng thay bằng chứng cho cleanup `/17`; trạng thái `DONE` của cleanup chỉ dựa trên DB và audit nêu trên.

### CUSTOMER-UAT-001

- `uat_data_readiness.js` phân biệt các lỗi item, customer, giá, tồn, kho và ba trạng thái CTBH; không seed dữ liệu.
- Kết quả được ghi nhận: 13 PASS / 0 FAIL / 2 SKIPPED. Hai ca skip là thiếu CTBH config active và thiếu actor-config user không phải manager global; không được tính là PASS.
- Lượt chốt dùng `QLBH013.MED` và `NAMDINHB.MED`, cùng chi nhánh MB và đều có `EmployeeID`; khách trong manifest được chính tài khoản quản lý tạo qua API ngày 05/08/2026 và nằm đúng scope Sale.
- `verify_customer_uat001_real_data.js` tạo–duyệt tạm CTBH cấu hình qua live Gateway, sau đó xác nhận đủ `PROMOTION_NOTE_TEXT_ONLY`, `NO_PROMOTION`, `PROMOTION_CONFIG_AVAILABLE`; bốn ca âm xác nhận `PRICE_NOT_FOUND`, `ITEM_GROUP_NOT_SELLABLE`, `ITEM_NOT_FOUND`, `CUSTOMER_OUT_OF_SCOPE`.
- Gateway request ID khớp server log, audit actor khớp token Manager; CTBH tạm được `WITHDRAW` rồi xóa bằng marker guard. Hậu kiểm `--check-residue` trả `ResidueCount=0`.
- Raw manifest có dữ liệu chi tiết chỉ lưu cục bộ dưới `reports/uat/CUSTOMER-UAT-001/`, bị Git ignore. Hồ sơ commit chỉ giữ kết luận khử định danh; không chứa credential/token/PII.
- Hard-code scan gần nhất quét 566 file, `RuntimeFindings: []`; mã fixture trong verifier nằm đúng vùng TEST.
- **Kết luận:** `CUSTOMER-UAT-001` `DONE`. Kết quả readiness không thay cho UI E2E; phần đó tiếp tục ở `CUSTOMER-UAT-002`.

### CUSTOMER-DOC-001

- Đã review `DRAFT 0.1` ngày 23/08/2026: hướng dẫn bao phủ đăng nhập/phạm vi, dữ liệu tối thiểu, lập–sửa–gửi duyệt/hủy/duyệt đơn, ba nhánh CTBH, chống retry, lấy `X-Request-ID`, ghi lỗi, smoke checklist và biên bản dry-run.
- Đối chiếu source xác nhận các nhãn/hành vi chính đang tồn tại: `LƯU NHÁP`, `TẠO ĐƠN HÀNG`, `Gửi duyệt`, `Hủy đơn nháp`, `PROMOTION_CHANGED` và response header `X-Request-ID`.
- Không phát hiện mật khẩu, token, cookie, tài khoản nội bộ cụ thể hoặc dữ liệu nhận diện khách trong nội dung. Accessibility audit sau sửa: **0 high / 0 medium / 0 low**; 8 bảng dữ liệu đã được đánh dấu hàng tiêu đề.
- LibreOffice/Poppler không có trong môi trường kiểm tra; Microsoft Word automation không xuất được PDF ở phiên không tương tác, nên chưa tuyên bố PASS render trực quan. Gate cuối vẫn là một người độc lập chạy dry-run trên runtime UAT đã deploy.
- **Kết luận:** bản nháp đã đủ điều kiện commit và bàn giao cho bước dry-run; `CUSTOMER-DOC-001` chưa `DONE` cho tới khi hoàn thành biên bản dry-run và phát hành bản cuối.

### PRODUCT-DIAG-001

- SQL/runtime có contract `PRODUCT_ORDERABILITY_V1`; các ca `B043`, `A003`, `ZZZ999`, customer ngoài scope và thiếu quyền kho trả đúng mã đã định nghĩa.
- `verify_product_diag_001.js`: **17 PASS / 0 FAIL / 0 SKIPPED**; `verify_product_diag_001_gateway_identity.js`: **5/5 PASS** qua encrypted live Gateway, gồm giả identity hai chiều và token thiếu/hỏng.
- `verify_order_status_guard.js`: **22/22 PASS**; build production PASS.
- Script UI hiện thao tác đúng chuỗi người dùng ở cả ba luồng. Với Chatbot, script click chip UI thật, nhập/chọn khách và sản phẩm trên panel; không gọi trực tiếp `ApiEngine.selectApi()` từ `page.evaluate` và không tự gán kết quả vào DOM.
- Tạo đơn, sửa đơn và Chatbot đều PASS. Raw screenshot/Network JSON đã được review rồi loại khỏi Git; biên bản chỉ giữ kết luận khử định danh.
- Lượt chốt merge-readiness dùng `X-Request-ID` từ chính Gateway response để ghép request danh mục Chatbot với server log; tránh suy diễn theo thứ tự response khi n8n và ERP chạy song song.
- **Kết luận:** `DONE` ngày 23/08/2026.

## 5. Ghi chú vận hành và bằng chứng

- Không lưu mật khẩu đăng nhập thật trong script test; dùng biến môi trường hoặc phiên đăng nhập do người kiểm thử chuẩn bị.
- Raw evidence được tạo cục bộ trong `reports/`, không commit. Repo chỉ giữ biên bản Markdown đã review và khử định danh; các định dạng JSON/ảnh/HAR/video dưới `reports/` bị Git ignore.
- Test UI không được tự gán nội dung hoặc style vào phần tử cần assert; phải thao tác qua cùng event/handler mà người dùng thật sử dụng.
- Tên test phải phản ánh đúng phạm vi: mock/fake envelope là unit test, không gọi là gateway runtime.
- Mọi mutation test trên `medtest` phải rollback hoặc có manifest dọn dữ liệu rõ ràng.
- Không dùng hai artifact `EDIT_ORDER_8_CASES_EVIDENCE.json` và `E2E_8_CASES_EDIT_ORDER_VERIFIED.png` làm căn cứ nghiệm thu. Hai file không còn trong tree phát hành.
- Ngày 23/08/2026 đã loại toàn bộ `.tmp` và 77 raw evidence JSON/ảnh khỏi Git, bổ sung ignore rule, chặn `/.tmp/` ở static server và bỏ fallback mật khẩu UAT khỏi script E2E.
- Biên bản [merge-readiness 23/08/2026](MERGE_READINESS_2026-08-23.md) xác nhận build/regression/hygiene đạt; các task còn mở trong backlog không bị ghi nhận sai thành `DONE`.

### `sql/` — dọn dẹp cấu trúc (22/08/2026, không liên quan nghiệm thu nghiệp vụ)

- Archive 22 file one-off/trùng lặp không còn proc/function nào sống vào `sql/_archive/` (giữ nguyên tên, không xóa hẳn); loại trừ 3 file (`Migrate_Business_Rule_Baseline_V1_AI.sql`, `ORDER-APPROVAL-004_Submit_Cancel_Contract_Seed_AI.sql`, `update_schema_AI.sql`) dù không ai tham chiếu vì có thể là hạ tầng/seed thật.
- Đổi tên 35 file kiểu `Module N - API_X_AI.sql` sang chuẩn gạch dưới `Module_NN_API_X_AI.sql`; **không đổi tên procedure/function bên trong** nên không ảnh hưởng endpoint đang chạy. Đã cập nhật hết tham chiếu trong `scripts/`, `docs/` và các file `.sql` khác, sweep cuối 0 tham chiếu cũ còn sót.
- Đã merge vào `hoangdang` (`89464f9`). Chi tiết đầy đủ và bảng đổi tên xem lịch sử hội thoại hoặc `git show 7b90fe9`.

### Trạng thái worktree (23/08/2026)

Chỉ còn worktree chính `Medstand` trên nhánh `hoangdang`; không còn worktree/branch phụ cần merge.

## 6. Tài liệu liên quan

- [Backlog việc cần làm](BackLogSuaTheoYCKhachHang.md)
- [Biên bản tái hiện và nghiệm thu CUST-SEARCH-001](CUST-SEARCH-001_BIEN_BAN_TAI_HIEN_VA_NGHIEM_THU_2026-08-21.md)
- [Biên bản kỹ thuật PRODUCT-DIAG-001](PRODUCT-DIAG-001_BIEN_BAN_NGHIEM_THU_KY_THUAT_2026-08-21.md)
- [Hướng dẫn chốt contract duyệt đơn](ORDER-APPROVAL-002_HUONG_DAN_CHOT_HOP_DONG_DUYET_DON.md)
- [Chuỗi dữ liệu tối thiểu CUSTOMER-UAT-001](CUSTOMER-UAT-001_CHUOI_DU_LIEU_TOI_THIEU.md)
- [Biên bản merge-readiness 23/08/2026](MERGE_READINESS_2026-08-23.md)
