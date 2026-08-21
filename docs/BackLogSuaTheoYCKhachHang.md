# BACKLOG SỬA THEO YÊU CẦU KHÁCH HÀNG

**Ngày tổng hợp:** 21/08/2026  
**Phạm vi:** các yêu cầu khách hàng cần xử lý trước khi mở UAT rộng  
**Nguyên tắc:** sửa lỗi dễ thấy trước, xác minh bằng dữ liệu mới do đội test tạo, sau đó mới phát hành hướng dẫn và mở vòng góp ý.

## 1. Quy tắc xác minh và bằng chứng

Mỗi task chỉ được chuyển sang `DONE` khi có đủ:

- Tài khoản, môi trường, phiên bản và thời gian chạy.
- Input, bước tái hiện, kết quả thực tế và kết quả mong đợi.
- Ảnh/video thao tác; Network hoặc log phải che token và dữ liệu nhạy cảm.
- Request ID nếu request đã đi qua gateway.
- Kết quả đối chiếu API/DB khi task liên quan dữ liệu hoặc mutation.
- Tổng `PASS/FAIL/BLOCKED`; task bị chặn phải ghi rõ nguyên nhân và người cần phản hồi.

## 2. Tìm kiếm và chọn khách hàng

- [ ] **CUST-SEARCH-001 — Tái hiện lỗi chọn gợi ý khách hàng** · `P0` · `TODO`
  - **Phạm vi:** tách riêng bước nhập từ khóa, nhận gợi ý, chọn gợi ý và tải dữ liệu khách; đối chiếu `label`, `ObjectID`, payload và response.
  - **Xác minh:** tên đầy đủ, tên một phần, mã khách, khách trùng tên và khách mới do user tạo; kiểm tra context cũ và khả năng gửi tên thay cho `ObjectID`.
  - **Bằng chứng:** ảnh trước/sau khi chọn, Network request/response, request ID và báo cáo nguyên nhân gốc gắn code/API liên quan.
  - **Nghiệm thu:** tái lập được lỗi và chứng minh nguyên nhân cụ thể; không dùng kết luận chung “không tìm thấy”.

- [x] **CORE-011 — Sửa tìm kiếm và chọn khách hàng từ gợi ý** · `P0` · `DONE` · *nghiệm thu 21/08/2026*
  - **Phạm vi:** lưu `ObjectID` làm giá trị nghiệp vụ; tên/mã/địa chỉ/SĐT chỉ để hiển thị. Sửa nội dung tìm kiếm phải xóa lựa chọn cũ; không tự chọn khi user chưa xác nhận.
  - **Xác minh CORE-011:** đăng nhập bằng tài khoản `demo`; kiểm tra bộ chọn khách trên màn lập đơn và sửa đơn; ca rỗng `xyz99999`; tìm theo tên `An`; tìm chính xác theo mã `ONL1136`; chọn bằng chuột và kiểm tra dữ liệu được map vào form.
  - **Bằng chứng:** biên bản E2E do người kiểm thử cung cấp; đối chiếu code mapping `label → ObjectID`; đối chiếu gateway read-only cho `xyz99999` và `ONL1136`; video được báo cáo tên `test_customer_search_1787278729160.webp`.
  - **Nghiệm thu:** chọn gợi ý mở đúng khách và không còn báo “Không tìm thấy dữ liệu” do gửi sai định danh.
  - **Kết quả 21/08/2026:** `PASS` màn lập đơn và sửa đơn. `xyz99999` giữ modal mở và hiển thị trạng thái không có kết quả; `ONL1136` trả đúng `ONL1136 - Anh An`; sau khi chọn, form map lại chi nhánh, tuyến thứ, phường/xã, địa chỉ và SĐT theo dữ liệu có sẵn của khách.
  - **Đối chiếu kỹ thuật:** option trên hai màn hình dùng `{ value: ObjectID, label: DisplayName }`, cache/deduplicate theo `ObjectID`; commit `74f6c53e` bổ sung tìm kiếm từ xa cho màn sửa đơn và trạng thái danh sách rỗng của bộ chọn dùng chung.
  - **Giới hạn bằng chứng:** từ khóa ngắn `An` trả nhiều khách (runtime khoảng `500` dòng), nên chỉ chứng minh tìm kiếm tên một phần có chứa `ONL1136`, không chứng minh kết quả duy nhất. Video chưa nằm trong workspace và gateway chưa trả request ID trong response header để lưu kèm báo cáo.
  - **Phạm vi đóng:** chỉ đóng `CORE-011` trong backlog sửa theo yêu cầu khách hàng. Các ca Enter, chọn–xóa–chọn lại, khách trùng tên/ngoài scope, API chậm/lỗi, context tài khoản và regression toàn bộ màn hình vẫn thuộc `CUST-SEARCH-003`, chưa nghiệm thu.

- [ ] **CUST-SEARCH-003 — Regression các màn hình sử dụng bộ chọn khách** · `P0` · `PARTIAL_PASS_PENDING_FULL_E2E_EVIDENCE`
  - **Phạm vi:** xem khách, lập đơn và các form khác dùng autocomplete; test click nhanh, retry, xóa từ khóa, API chậm/lỗi và danh sách nhiều dòng.
  - **Xác minh:** cùng input/cùng mốc dữ liệu cho kết quả nhất quán; không giữ khách của phiên hoặc tài khoản trước.
  - **Bằng chứng:** ma trận pass/fail, ảnh/video ca chính, request ID của ca thành công và ca âm.
  - **Nghiệm thu:** 100% ca P0/P1 pass, không gây regression luồng lập đơn.
  - **Kết quả kỹ thuật 21/08/2026:** đã thêm sequence guard `_loadSeq/requestSeq` cho `src/js/pages/customer-management.js` và `src/js/pages/contract-point.js`; response thành công hoặc lỗi của request cũ đều bị bỏ qua khi đã có request mới hơn. Source và bundle `src/js/dist/pages/*` đã đồng bộ; `node --check`/`git diff --check` không phát hiện lỗi cú pháp hoặc whitespace.
  - **Kết quả trình duyệt do người kiểm thử cung cấp:** báo cáo `PASS` 5 ca `An → XYZ9999`, `An → Shop`, `Shop → An`, xóa tìm kiếm và chuyển trang `1 → 2 → 3`; kết quả cuối không bị response cũ ghi đè.
  - **Giới hạn bằng chứng race condition:** ô tìm kiếm debounce `300 ms`. Nếu đổi từ khóa trước khi request đầu được phát đi thì chỉ request sau chạy, chưa tạo race thật. Báo cáo chưa có Network timeline chứng minh cả hai request cùng tồn tại và request đầu hoàn tất sau request thứ hai; video `test_customer_regression_1787287268021.webp` chưa tìm thấy trong workspace.
  - **Phần còn thiếu trước khi `DONE`:** ép request đầu chậm và chắc chắn đã gửi; chụp hai request cùng thứ tự hoàn tất; test API lỗi/retry, stale error, đổi/đăng nhập lại tài khoản, khách ngoài scope và regression bộ chọn khách tại màn lập/sửa đơn. Cần bổ sung video/ảnh, request ID hoặc timestamp Network cho ca dương và ca âm.

## 3. Cấu hình giá trị tối thiểu CTBH

- [ ] **PROMO-CFG-001 — Chốt contract giá trị tối thiểu CTBH** · `P1` · `PENDING_BUSINESS_SIGN_OFF`
  - **Phạm vi:** xác nhận `min` theo tổng tiền, số lượng, giá trị dòng hay rule riêng; chốt VAT, chiết khấu, hàng tặng, trả hàng, làm tròn, ưu tiên và múi giờ hiệu lực.
  - **Xác minh:** ví dụ dưới/bằng/trên ngưỡng, hết hạn và hai CTBH xung đột; config phải có version, hiệu lực, trạng thái duyệt và scope.
  - **Bằng chứng:** business sign-off và bảng input → kết quả CTBH mong đợi.
  - **Nghiệm thu:** frontend, API, SQL và business dùng chung một contract; không hard-code ngưỡng.
  - **Kết quả kỹ thuật tạm thời 21/08/2026:** contract code hiện hỗ trợ cận dưới/cận trên theo số lượng hoặc giá trị dòng, `Priority`, và tie-break bằng `PromotionItemRuleID`. Đây mới là contract kỹ thuật đang triển khai, chưa thay thế business sign-off.
  - **Điểm phải chốt với business:** khi một rule cấu hình tồn tại nhưng số lượng/giá trị nằm ngoài khoảng `min/max`, hệ thống sẽ không áp rule đó nhưng hiện vẫn fallback sang CTBH ghi chú ERP cũ. Cần quyết định fallback là hành vi mong muốn hay vượt `max` phải không hưởng bất kỳ CTBH nào.
  - **Giới hạn hàng tặng:** quà khác SKU hiện được chặn fail-closed; chưa phải chức năng đã hỗ trợ quà khác sản phẩm mua.

- [ ] **PROMO-CFG-002 — Xây cấu hình min có phân quyền và audit** · `P1` · `IMPLEMENTED_MEDTEST_PARTIAL_VERIFIED_PENDING_SIGN_OFF_AND_E2E`
  - **Phạm vi:** tài khoản được cấp quyền tạo version mới; không sửa trực tiếp version đã duyệt. Lưu người tạo/duyệt, thời gian, trước/sau và lý do.
  - **Xác minh:** thay config không build code; test config tương lai/hết hạn/thiếu/sai scope và tài khoản không có quyền. API tạo đơn phải kiểm tra lại phía server.
  - **Bằng chứng:** migration/config manifest, audit thay đổi, response trước/sau hiệu lực và test fail-closed.
  - **Nghiệm thu:** đổi `min` bằng config làm kết quả thay đổi đúng contract; payload giả không vượt kiểm tra server.
  - **Code/runtime 21/08/2026:** frontend dùng `src/js/utils/promotion.js` và `src/js/pages/promotion-admin.js`; SQL dùng `sql/PROMO-CFG-001_Promotion_Program_Admin_AI.sql`, `sql/PROMO-CFG-002_Active_Promotion_By_Items_AI.sql` và `sql/Module common - API_DonHangChiTiet_Insert_AI.sql`. Runtime `medtest` đã có guard quà khác SKU, `MaximumQuantity`, `MaximumOrderAmount`, `HasConfigRule` và tie-break `PromotionItemRuleID ASC`.
  - **Unit test client có assertion:** `PASS` dưới/trong/trên `MaximumQuantity`; dưới/trong/trên `MaximumOrderAmount`; hai rule trùng priority/mốc luôn chọn `PromotionItemRuleID` nhỏ hơn. `node --check` và `git diff --check` đều `PASS`; bundle phiên bản `11.144` có client guard tương ứng.
  - **DB verification rollback:** chạy `node scripts/verify_promo_cfg001_fixes.js` trên `medtest` trả `PASS` cho `MAX_BOUND_RESPECTED`, `TIE_BREAK_DETERMINISTIC` và `CROSS_SKU_GIFT_REJECTED`; transaction đã `ROLLBACK`. Hậu kiểm có `0` dòng `VERIFY_*`, `0` rule quà khác SKU cũ và `0` rule quà khác SKU đang active/approved.
  - **Quà khác SKU:** server `API_PromotionProgram_Upsert_AI` từ chối `GiftItemID <> ItemID`; frontend admin cũng chặn sớm. Đây là biện pháp bảo toàn dữ liệu cho tới khi payload và SQL đơn hàng hỗ trợ quà khác SKU thật sự.
  - **Giới hạn script:** `runOrderConfigCandidate()` sao chép CTE tính CTBH để kiểm tra, chưa gọi procedure tạo đơn thật. DB script mới kiểm tra cận trên số lượng; cận trên giá trị mới được xác minh bằng unit client và đối chiếu định nghĩa runtime. Ca tie-break DB chỉ chứng minh ba lần chạy cùng kết quả, chưa assert trực tiếp rule thắng là ID nhỏ nhất; phần này hiện được đảm bảo thêm bằng static/runtime check.
  - **Chưa nghiệm thu:** chưa đủ test quyền âm, audit trước/sau, config tương lai/hết hạn/sai scope và chưa có mutation qua API/UI thật kèm request ID.

- [ ] **PROMO-CFG-003 — UAT min CTBH trên preview và đơn thật** · `P0` · `BLOCKED_PENDING_FALLBACK_DECISION_AND_TRUE_ORDER_E2E`
  - **Phạm vi:** chạy bộ ví dụ business ở preview và xác nhận tạo đơn; server không tin giá trị CTBH từ frontend.
  - **Xác minh:** dưới/bằng/trên ngưỡng, double-click, retry, config đổi giữa preview/xác nhận và chương trình hết hiệu lực.
  - **Bằng chứng:** ảnh preview, response tạo đơn, request ID, mã đơn rollback hoặc biên bản dọn dữ liệu và bảng kỳ vọng/thực tế.
  - **Nghiệm thu:** 100% ví dụ chuẩn pass; không áp sai CTBH hoặc tạo đơn trùng.
  - **Kết quả hiện tại 21/08/2026:** chưa chạy procedure tạo đơn thật với bộ rule `min/max`; chưa có ảnh preview, response tạo đơn, request ID hoặc mã đơn rollback. Không dùng kết quả helper/CTE độc lập để đánh dấu task này `DONE`.
  - **Rủi ro cần xử lý/chốt:** rule cấu hình `SL 5–10, giảm 7%` với `SL = 12` trả `null` ở config, nhưng nếu ghi chú ERP cũ là `Mua 10+2` thì frontend và SQL hiện có thể fallback và vẫn tặng `2`. Sau khi business chốt semantics, phải test lại preview và `API_DonHangChiTiet_Insert_AI` trong transaction rollback.

## 4. Workflow Sale tạo đơn → Kế toán duyệt

- [x] **ORDER-APPROVAL-001 — Khảo sát workflow đơn hiện hành** · `P0` · `DONE`
  - **Phạm vi:** lập bảng trạng thái, transition, vai trò và procedure/bảng đang ghi; xác định đơn Sale tạo đang vào trạng thái nào và Kế toán duyệt ở đâu.
  - **Xác minh:** một đơn mới trong transaction rollback hoặc dữ liệu test có kế hoạch dọn; đối chiếu UI, API và DB cùng thời điểm.
  - **Bằng chứng:** sơ đồ hiện trạng, truy vấn trước/sau, request ID và danh sách chênh lệch với nghiệp vụ khách yêu cầu.
  - **Nghiệm thu:** có kết luận dựa trên runtime/DB; task khảo sát không tự thay đổi workflow.
  - **Kết quả xác minh lại 21/08/2026:** PASS phần khảo sát. `API_DonHangChiTiet_Insert_AI` tạo đơn ở `StatusID = 0` (`Chờ duyệt`); workflow cũ chưa có điểm duyệt Kế toán an toàn được chứng minh. Đơn runtime `DMB0826/9` đã đổi `0 → 1` bởi `demo` nhưng không có audit `ORDER_APPROVAL_TRANSITION`; `AR_OrderLogTbl` có 21/21 dòng chỉ ghi trạng thái tạo `0` và không có chuỗi transition. Ca kiểm chứng đường cập nhật cũ dùng evidence ID `ORDER-APPROVAL-001-07d70ddd-3e75-47dc-ad1f-9acabd533dca` đã rollback toàn bộ.
  - **Tài liệu:** [ORDER-APPROVAL-001_KHAO_SAT_WORKFLOW_DON_HIEN_HANH_2026-08-21.md](ORDER-APPROVAL-001_KHAO_SAT_WORKFLOW_DON_HIEN_HANH_2026-08-21.md).

- [ ] **ORDER-APPROVAL-002 — Chốt contract duyệt đơn** · `P0` · `READY_FOR_BUSINESS_SIGN_OFF`
  - **Phạm vi:** chốt mapping `DRAFT/PREVIEW`, `PENDING_ACCOUNTING_APPROVAL`, `APPROVED`, `REJECTED`, `CANCELLED`; quyền tạo/gửi/duyệt/từ chối/hủy/sửa.
  - **Xác minh:** review transition dương/âm với Sale, Kế toán, quản trị; phân biệt cơ chế UAT tạm và workflow chính thức.
  - **Bằng chứng:** sign-off, ma trận `trạng thái × vai trò × thao tác` và mapping trạng thái ERP.
  - **Nghiệm thu:** không còn transition hoặc quyền chưa được business quyết định.
  - **Cập nhật 21/08/2026:** quyết định của khách giờ nhập thẳng vào dữ liệu (`AI_OrderApprovalTransitionTbl`, `AI_OrderApprovalRoleTbl`) chứ không nằm trong code, nên chốt xong không phải sửa/deploy procedure. Bốn điểm cần khách quyết và câu lệnh bật hợp đồng: [ORDER-APPROVAL-002_HUONG_DAN_CHOT_HOP_DONG_DUYET_DON.md](ORDER-APPROVAL-002_HUONG_DAN_CHOT_HOP_DONG_DUYET_DON.md).

- [ ] **ORDER-APPROVAL-003 — Triển khai gửi duyệt và duyệt đơn** · `P0` · `BLOCKED_BY_ORDER_APPROVAL_002`
  - **Phạm vi:** Sale chỉ gửi chờ duyệt; Kế toán duyệt/từ chối đúng scope. Transition kiểm tra trạng thái hiện tại, có idempotency và audit cùng transaction.
  - **Xác minh:** thiếu quyền, sai trạng thái, double-click, retry, hai người duyệt đồng thời, lỗi DB và hết phiên.
  - **Bằng chứng:** test tự động, audit có actor/time/request ID/from/to/outcome, ảnh theo vai trò và DB đối chiếu.
  - **Nghiệm thu:** một thao tác hợp lệ tạo đúng một transition; Sale không tự duyệt và đơn không duyệt hai lần.
  - **Cập nhật 21/08/2026 — phần kỹ thuật đã xong, vẫn `BLOCKED` chờ ORDER-APPROVAL-002:**
    - Bỏ hard-code nghiệp vụ: transition và vai trò đọc từ hợp đồng trong DB ([ORDER-APPROVAL-003_Approval_Contract_AI.sql](../sql/ORDER-APPROVAL-003_Approval_Contract_AI.sql)); mọi dòng đang `DRAFT` nên API fail-closed `APPROVAL_CONTRACT_NOT_APPROVED`, không đơn nào đổi được trạng thái.
    - Maker–checker: người tạo đơn (`UserCreate`) hoặc nhân viên đứng tên đơn (`EmployeeID`) không tự duyệt; muốn ngoại lệ phải bật `AllowSelfApproval` theo vai trò.
    - Không sửa `SY_User` để test: phạm vi duyệt theo `ScopeRule` của hợp đồng (`BRANCH_MATCH`/`GLOBAL`), việc gán `BranchID` cho `NHUNG`/`LANANH` chờ khách chốt.
    - Identity API đọc lấy từ token ở gateway (`READ_IDENTITY_POLICY`), client không khai `Username` được nữa; đơn ngoài phạm vi bị che.
    - Ghi lịch sử ERP: gọi `AR_OrderLog_Stp` trong cùng transaction, có kiểm chứng hậu điều kiện, không tự chèn `AR_OrderLogTbl`.
    - Chặn đường vòng: mọi mutation qua gateway bị gỡ `StatusID` trừ endpoint duyệt đơn; chặn 8 procedure ERP đổi trạng thái ([src/server/order-status-guard.js](../src/server/order-status-guard.js)).
    - Mã lỗi cạnh tranh tách đúng loại (`IDEMPOTENCY_CONFLICT` / `IDEMPOTENCY_IN_PROGRESS` / `STATUS_CHANGED` / `ORDER_LOG_WRITE_FAILED`); UI khóa cả hai nút khi đang gửi, giữ nguyên khóa idempotency khi retry sau timeout, có lý do từ chối và lối vào "Đơn chờ duyệt".
    - Metadata phân quyền của 2 API đã điền (`OperationType`, capability, scope, ownership, contract version).
    - **Bằng chứng:** `node scripts/deploy_order_approval_003.js --apply` (PASS), `node scripts/verify_order_approval_transition.js` (24/24 PASS, transaction rollback), `node scripts/verify_order_status_guard.js` (10/10 PASS).
    - **Còn thiếu:** ca hai người duyệt đồng thời mới chỉ mô phỏng tuần tự (người sau nhận `STATUS_CHANGED`); ca `IDEMPOTENCY_IN_PROGRESS` cần hai kết nối thật nên chưa chạy được trong transaction rollback.
  - **Chế độ TEST đang bật trên `medtest` (21/08/2026) — không phải sign-off của khách:** để chạy thử được luồng duyệt khi khách chưa chốt, đã bật hợp đồng với dấu `ApprovedBy = 'TEST-ORDER-APPROVAL-003'`: transition `APPROVE 0→1`, `REJECT 0→-2` (bắt buộc lý do); Kế toán `KTDH/KTDH2/TN KTDH` duyệt theo chi nhánh và **không** được tự duyệt; quản lý khu vực `QL`/`QLMN` và tài khoản `Manager = 1` (gồm `demo`) duyệt theo chi nhánh và **được tự duyệt đơn mình tạo** — đây là chỗ nới lỏng maker–checker, chỉ dành cho môi trường test. Bật/tắt bằng `node scripts/apply_order_approval_test_contract.js --apply|--retire`. Chi tiết và việc phải làm khi khách ký thật: [ORDER-APPROVAL-002_HUONG_DAN_CHOT_HOP_DONG_DUYET_DON.md](ORDER-APPROVAL-002_HUONG_DAN_CHOT_HOP_DONG_DUYET_DON.md).

- [ ] **ORDER-APPROVAL-004 — UAT Sale tạo → Kế toán duyệt** · `P0` · `BLOCKED_BY_ORDER_APPROVAL_003`
  - **Phạm vi:** chạy bằng hai tài khoản tách biệt và dữ liệu mới do đội test tạo.
  - **Xác minh:** Sale tạo/gửi, Kế toán thấy và duyệt/từ chối, Sale xem kết quả; thêm ca sai chi nhánh và thiếu quyền.
  - **Bằng chứng:** video/chuỗi ảnh, mã đơn, hai tài khoản, request ID từng transition và audit/DB.
  - **Nghiệm thu:** luồng chính pass 100%; ca âm bị chặn đúng mã lỗi, không còn P0/P1 chưa chấp nhận.
  - **Cập nhật 21/08/2026:** chế độ test đã bật nên **chạy được ngay phần "quản lý khu vực duyệt"** (tài khoản `QL`/`QLMN`/`Manager = 1` như `demo`, `QLBH013.MED`, `QLBH029.MED` — duyệt trong chi nhánh mình, được tự duyệt đơn mình tạo). Riêng luồng nghiệm thu thật **"Kế toán duyệt" vẫn chưa chạy được**: `NHUNG` và `LANANH` chưa có `BranchID` nên API trả `APPROVER_BRANCH_MISSING`. Gỡ bằng một trong hai cách: khách chốt và gán `BranchID` cho hai tài khoản này, hoặc tạm đổi `ScopeRule` của dòng Kế toán sang `GLOBAL` trong chế độ test.

## 5. Test bằng dữ liệu mới

- [ ] **CUSTOMER-UAT-001 — Xác minh vận hành bằng dữ liệu mới do người dùng tạo** · `P0` · `READINESS_TOOL_VERIFIED_PENDING_USER_CREATED_DATA_E2E`
  - **Phạm vi:**
    - Xác định đầy đủ dependency của tài khoản, khách hàng, sản phẩm, giá, kho, tồn và CTBH.
    - Không sửa hoặc tự seed dữ liệu nghiệp vụ để làm test pass.
    - CTBH là tùy chọn; không có CTBH không được chặn lập đơn.
  - **Xác minh:**
    - Dùng khách và sản phẩm mới ngoài mọi fixture/mock hiện có.
    - Chạy một sản phẩm có CTBH cấu hình, một sản phẩm chỉ có CTBH note-text và một sản phẩm không có CTBH.
    - Chạy các ca thiếu quyền khách, thiếu quyền kho, hết tồn, thiếu giá và CTBH không áp dụng.
    - Quét mã fixture hard-code trong source runtime UI/API/SQL/gateway.
  - **Bằng chứng:**
    - Manifest nguồn gốc dữ liệu do người dùng tạo.
    - Kết quả tìm khách, tìm sản phẩm, preview và mã đơn.
    - Giá, kho, tồn khả dụng, CTBH/version, request ID và thời điểm đối chiếu.
    - Báo cáo hard-code phân biệt production source với test fixture.
  - **Nghiệm thu:**
    - Dữ liệu mới hợp lệ chạy xuyên suốt tới tạo đơn.
    - Không có CTBH vẫn lập đơn bình thường.
    - Thiếu dữ liệu hoặc quyền trả đúng nguyên nhân, không chỉ báo "không tìm thấy".
    - Không có production logic phụ thuộc mã fixture/mock.
  - **Chuẩn bị xong 21/08/2026 (chưa phải nghiệm thu):** đã dựng công cụ và chạy thử trên `medtest`,
    còn chờ khách chốt tài khoản/chi nhánh UAT và ai chịu trách nhiệm nhập sản phẩm, giá, tồn, CTBH.
    - Chuỗi dữ liệu tối thiểu, cách chạy và cách đọc kết quả: [CUSTOMER-UAT-001_CHUOI_DU_LIEU_TOI_THIEU.md](CUSTOMER-UAT-001_CHUOI_DU_LIEU_TOI_THIEU.md).
    - Chẩn đoán từng lớp (chỉ đọc, không seed): `node scripts/uat_data_readiness.js --user= --customer= --item=` — phân biệt được `ITEM_NOT_FOUND`, `ITEM_DISABLED_AT_BRANCH`, `ITEM_GROUP_NOT_SELLABLE`, `STOCK_NO_ROW`, `STOCK_BLOCKED_BY_WAREHOUSE_SCOPE`, `STOCK_ZERO_AVAILABLE`, `PRICE_NOT_FOUND`, `PRICE_EXPIRED_OR_DISABLED`, `PRICE_SOURCE_DIVERGENCE`, `CUSTOMER_OUT_OF_SCOPE`, `WAREHOUSE_SCOPE_REQUIRED`; CTBH tách ba mã `PROMOTION_CONFIG_AVAILABLE` / `PROMOTION_NOTE_TEXT_ONLY` / `NO_PROMOTION`; sinh manifest bằng `--out=`.
    - Trạng thái manifest có bốn mức, **không có "PASS" trần**: `READINESS_FAIL` (exit 1), `EVIDENCE_INCOMPLETE` (exit 3), `READINESS_PASS_WITH_WARNINGS`, `READINESS_PASS`. `DataSource` chỉ nhận `UI|BACK_OFFICE|API`, `CleanupPlan` chỉ nhận `KEEP|DELETE_AFTER_UAT`, `DataCreatedBy` phải có ít nhất 2 ký tự; thiếu hoặc sai đều bị hạ về `EVIDENCE_INCOMPLETE`. Script không bao giờ phát ra `E2E_PASS` vì nó không lập đơn.
    - Kiểm chứng lại công cụ trên `medtest`: `node scripts/verify_uat_data_readiness.js` — **13 PASS / 0 FAIL / 2 SKIPPED** (21/08/2026). Hai ca `SKIPPED` có lý do rõ: chưa có CTBH cấu hình `APPROVED` còn hiệu lực; chưa có tài khoản vừa có actor config vừa không phải manager global. Không được tính hai ca này là PASS.
    - CTBH đã có bằng chứng runtime cho hai nhánh: `A008` → `PROMOTION_NOTE_TEXT_ONLY` và parser chỉ giữ mốc `10+2` trước vế `KHHĐ`; công cụ tự tìm được `B038` → `NO_PROMOTION` trong khi vẫn có giá/tồn để lập đơn. Nhánh `PROMOTION_CONFIG_AVAILABLE` vẫn chờ dữ liệu thật phù hợp.
    - **Lỗi giá đã sửa, có ca hồi quy:** lớp giá thiếu tie-break `UserAutoID` nên `B037` ra 79.000 trong khi danh mục và cổng tạo đơn đều 105.000. Nay đối chiếu cả ba nguồn và báo `PRICE_SOURCE_DIVERGENCE` nếu `API_HangHoaList_AI` (giá người dùng thấy) lệch quá 0,01 so với `AR_LayGiaSanPhamFnc` (giá `API_DonHangChiTiet_Insert_AI` dùng để chặn `PRICE_CHANGED`).
    - Quét hard-code: `node scripts/scan_fixture_hardcode.js` — `RuntimeFindings: []`; hai hit trong vùng runtime đều là comment, cộng một `ReviewFinding` ở workflow n8n (`n8n/AI_Core/AI_Upload_Reader.json:212`, mã `A008` làm ví dụ trong prompt OCR). Kết quả này chỉ chứng minh **không tìm thấy 10 token fixture đã khai báo** trong vùng runtime, không chứng minh source không còn fixture lạ nào khác.
    - **Phát hiện phải xử lý trước khi chạy UAT:** không phát hiện fixture trong code, nhưng dữ liệu cấu hình thì gắn với `demo` — `BR-ORDER-ACTOR-001` chỉ có đúng một dòng `ConfigKey = 'demo'`, và nhóm `DEMO_KH` cũng vậy. Tài khoản UAT mới không có những dòng đó, nên **`demo` PASS không chứng minh được gì**; phải chạy bằng tài khoản có `EmployeeID` thật.
    - **Chưa PASS được toàn bộ tiêu chí "báo rõ nguyên nhân" trên UI:** SQL runtime đã trả contract chẩn đoán và gateway code đã khóa identity từ token, nhưng ba giao diện cùng UAT ảnh/response đầy đủ vẫn thuộc `PRODUCT-DIAG-001`.

- [ ] **PRODUCT-DIAG-001 — API nói rõ vì sao sản phẩm không lập đơn được** · `P1` · `CODE_DONE_PENDING_UI_EVIDENCE`
  - **Phạm vi:** khi tìm sản phẩm không ra kết quả, API phải trả mã nguyên nhân thay vì danh sách rỗng: không tồn tại, bị khóa tại chi nhánh, nhóm hàng không được bán, thiếu quyền kho, hết tồn khả dụng, chưa có bảng giá, bảng giá hết hiệu lực. Không nới lỏng bất kỳ điều kiện lọc nào — chỉ bổ sung thông tin chẩn đoán.
  - **Ràng buộc:** mã lỗi phải là hợp đồng có version, không phải chuỗi tiếng Việt ghép trong UI; không lộ dữ liệu ngoài phạm vi tài khoản (biết "sản phẩm tồn tại nhưng ngoài quyền kho" đã là thông tin, phải cân nhắc mức chi tiết cho từng vai trò).
  - **Xác minh:** đối chiếu từng mã với kết quả `scripts/uat_data_readiness.js` trên cùng bộ dữ liệu — hai bên phải kết luận giống nhau.
  - **Bằng chứng:** bảng ánh xạ `nguyên nhân → mã lỗi → câu hiển thị`, response thật của từng ca, và ảnh UI.
  - **Nghiệm thu:** mỗi nguyên nhân trong mục 1 của [CUSTOMER-UAT-001_CHUOI_DU_LIEU_TOI_THIEU.md](CUSTOMER-UAT-001_CHUOI_DU_LIEU_TOI_THIEU.md) có đúng một mã lỗi phân biệt được; không còn ca nào rơi vào câu gộp "không còn bán được hoặc không có giá/tồn hợp lệ".
  - **Cập nhật runtime 21/08/2026:** `medtest` đã có contract `PRODUCT_ORDERABILITY_V1`. Gọi read-only trực tiếp `API_HangHoaList_AI` xác nhận: `B043` → primary `STOCK_NO_ROW`, reasons `STOCK_NO_ROW + PRICE_NOT_FOUND`; `A003` → primary `ITEM_GROUP_NOT_SELLABLE`, reasons thêm `STOCK_ZERO_AVAILABLE + PRICE_EXPIRED_OR_DISABLED`; `ZZZ999` → `ITEM_NOT_FOUND`. Kết quả khớp với oracle `scripts/uat_data_readiness.js` ở ba ca này.
  - **Gateway identity:** `API_HangHoaList_AI` đã nằm trong `READ_IDENTITY_POLICY`; `node scripts/verify_order_status_guard.js` PASS `11/11`, gồm ca `PRODUCT_CATALOG_IDENTITY_IS_SERVER_OWNED`.
  - **Frontend đã xong 21/08/2026:** ba luồng dùng CHUNG một helper [product-orderability.js](../src/js/utils/product-orderability.js) — [create-order.js](../src/js/pages/create-order.js), [edit-order.js](../src/js/pages/edit-order.js) và [chatbot-api-engine.js](../chatbot-widget/js/chatbot-api-engine.js). Quyết định dựa trên `Code`, không dựa trên chuỗi `Msg`; mã lạ hoặc `DiagnosticContractVersion` lạ đều fail-closed bằng một câu an toàn thay vì coi sản phẩm là hợp lệ; response cũ chưa có `Code` vẫn chạy được. Câu gộp cũ chỉ còn đúng một chỗ duy nhất trong source: hằng `LEGACY_MESSAGE` của helper.
  - **Bundle:** đã build lại `src/js/dist` và `chatbot-widget/js/chatbot.bundle.min.js`; helper được nạp qua `index.dev.html` (app bundle) và danh sách `chatbotUIScripts` trong [build.js](../scripts/build.js).
  - **Verifier:** `node scripts/verify_product_diag_001.js` — **15 PASS / 0 FAIL / 0 SKIPPED**. Gồm 5 ca đối chiếu API với oracle `scripts/uat_data_readiness.js` trên cùng `Username/ObjectID/ItemID` (kể cả ca thiếu quyền kho), ca đa nguyên nhân gọi 3 lần cho cùng mã chính và cùng danh sách, ca chống lộ dữ liệu (response chẩn đoán đúng 7 cột hợp đồng, `Msg` không chứa con số), ca không regression cho `A008`, ca tìm rộng giữ nguyên hành vi, và 6 ca cho helper.
  - **Khác biệt CÓ CHỦ Ý giữa API và oracle:** công cụ chẩn đoán chạy quyền DBA nên phân biệt được `CUSTOMER_NOT_FOUND` với `CUSTOMER_OUT_OF_SCOPE`; API thì luôn trả `CUSTOMER_OUT_OF_SCOPE`, vì nói "khách không tồn tại" là xác nhận cho người hỏi biết một `ObjectID` có thật hay không. Verifier ánh xạ tường minh chứ không coi là lệch.
  - **Còn thiếu để đóng task:** ảnh UI của ba luồng và một lượt giả `Username` qua DevTools trên server đang chạy. Hai việc này phải làm tay — script không tự chụp màn hình và không tự dựng phiên đăng nhập thật.

- [ ] **CUSTOMER-UAT-002 — Chạy E2E bằng dữ liệu đội test tự tạo** · `P0` · `BLOCKED_BY_CUSTOMER_UAT_001`
  - **Phạm vi:** tạo dữ liệu → tìm/chọn khách → chọn sản phẩm → giá/tồn/CTBH → lập đơn → gửi duyệt → duyệt/từ chối.
  - **Xác minh:** ca thành công, thiếu giá, hết tồn, CTBH không hiệu lực và sai scope; dữ liệu UAT có nhãn và kế hoạch dọn.
  - **Bằng chứng:** manifest, ảnh/video, request ID, mã khách/sản phẩm/đơn và biên bản dọn hoặc xác nhận giữ.
  - **Nghiệm thu:** luồng business chính không phụ thuộc dữ liệu mẫu của đội phát triển.
  - **Lưu ý CTBH:** "CTBH không hiệu lực" là ca âm về *tính đúng ưu đãi*, không phải ca chặn lập đơn. Sản phẩm có giá và tồn mà không có CTBH nào vẫn phải đặt được — nếu bị chặn thì đó là lỗi, không phải kết quả mong đợi.

## 6. Hướng dẫn và vòng góp ý

- [ ] **CUSTOMER-DOC-001 — Phát hành hướng dẫn UAT khách hàng** · `P1` · `BLOCKED_BY_STABLE_UAT_RUNTIME`
  - **Phạm vi:** đăng nhập, tìm/chọn khách, tạo dữ liệu test, lập đơn, CTBH, gửi duyệt, duyệt/từ chối và báo lỗi; ghi rõ quyền, giới hạn và cách lấy request ID.
  - **Xác minh:** người chưa tham gia phát triển chạy lại kịch bản chỉ bằng tài liệu.
  - **Bằng chứng:** tài liệu có version/môi trường/ngày, ảnh đúng runtime và biên bản dry-run.
  - **Nghiệm thu:** người test hoàn thành kịch bản mà không cần hướng dẫn miệng.

- [ ] **CUSTOMER-UAT-003 — Chạy test hẹp và thu feedback** · `P0` · `BLOCKED_BY_GUIDE_AND_CORE_FIXES`
  - **Phạm vi:** mở trước cho nhóm nhỏ; mỗi lỗi có account, thời gian, input, bước tái hiện, thực tế, mong đợi, ảnh/log và request ID.
  - **Xác minh:** đội kỹ thuật tái hiện độc lập trước khi phân loại `P0/P1/P2`.
  - **Bằng chứng:** file feedback chuẩn, tổng `PASS/FAIL/BLOCKED`, owner và liên kết bằng chứng.
  - **Nghiệm thu:** không còn lỗi chỉ ghi “không chạy”; mọi lỗi đủ thông tin để giao sửa.

- [ ] **CUSTOMER-UAT-004 — Regression sau khi xử lý feedback** · `P0` · `BLOCKED_BY_CUSTOMER_UAT_003`
  - **Phạm vi:** retest đúng ca lỗi và luồng liên quan trên bản deploy mới.
  - **Xác minh:** cùng account/input/mốc dữ liệu; kiểm tra sau refresh, đăng nhập lại và retry.
  - **Bằng chứng:** báo cáo runtime, manifest/version, ảnh/video, request ID và tổng pass/fail/blocked.
  - **Nghiệm thu:** không còn P0; P1 còn lại phải được business chấp nhận trước khi mở test rộng.

## 7. Khóa quyền/chức năng sau nghiệm thu

- [ ] **CUSTOMER-BIZ-001 — Làm rõ yêu cầu “khóa chức năng”** · `P1` · `PENDING_CUSTOMER_CLARIFICATION`
  - **Phạm vi:** hỏi rõ khóa config CTBH, tài khoản test, tạo dữ liệu, tạo đơn, duyệt đơn hay đóng băng phiên bản; chốt vai trò, thời điểm, ngoại lệ và người mở lại.
  - **Xác minh:** review tình huống vận hành và rollback với business owner.
  - **Bằng chứng:** sign-off và ma trận `vai trò × chức năng × trước/sau nghiệm thu`.
  - **Nghiệm thu:** thuật ngữ “khóa” được định nghĩa đầy đủ; task này chưa triển khai code.

- [ ] **CUSTOMER-SEC-001 — Triển khai khóa bằng cấu hình/phân quyền** · `P1` · `BLOCKED_BY_CUSTOMER_BIZ_001`
  - **Phạm vi:** dùng capability/role/config có version; không hard-code account hoặc xóa dữ liệu. Audit mọi lần khóa/mở/thay scope.
  - **Xác minh:** tài khoản được phép, bị khóa, ngoài scope và mở lại; dữ liệu cũ không mất hoặc đổi chủ.
  - **Bằng chứng:** manifest quyền trước/sau, audit và ảnh/API response ca dương/âm.
  - **Nghiệm thu:** đúng vai trò bị chặn, đúng vai trò còn quyền và rollback được bằng config.

- [ ] **CUSTOMER-SEC-002 — UAT âm chính sách khóa** · `P0` · `BLOCKED_BY_CUSTOMER_SEC_001`
  - **Phạm vi:** gọi UI/API bị khóa, sửa payload, dùng context cũ và retry; server phải chặn chứ không chỉ ẩn nút.
  - **Xác minh:** mã lỗi quyền nhất quán và không phát sinh mutation.
  - **Bằng chứng:** Network response, request ID, audit từ chối và truy vấn DB chứng minh không có dữ liệu ngoài ý muốn.
  - **Nghiệm thu:** 100% ca âm bị chặn, không mất dữ liệu và không có đường vòng qua API cũ.

## 8. Thứ tự thực hiện đề xuất

1. `CUST-SEARCH-001` → `CORE-011` → `CUST-SEARCH-003`.
2. `CUSTOMER-UAT-001` → `CUSTOMER-UAT-002`; `PRODUCT-DIAG-001` chạy song song, phải chốt trước khi nghiệm thu tiêu chí "báo rõ nguyên nhân".
3. `ORDER-APPROVAL-001` → `ORDER-APPROVAL-004`.
4. `PROMO-CFG-001` → `PROMO-CFG-003` sau khi business sign-off.
5. `CUSTOMER-DOC-001` → `CUSTOMER-UAT-003` → `CUSTOMER-UAT-004`.
6. `CUSTOMER-BIZ-001` → `CUSTOMER-SEC-001` → `CUSTOMER-SEC-002` sau khi khách làm rõ phạm vi khóa.
