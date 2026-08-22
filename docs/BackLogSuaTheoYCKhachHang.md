# BACKLOG VIỆC CẦN LÀM THEO YÊU CẦU KHÁCH HÀNG

**Cập nhật:** 22/08/2026
**Mục đích:** file này chỉ liệt kê việc còn phải làm. Kết quả đã chạy, ghi chú dài, task đã hoàn thành và lịch sử trạng thái nằm tại [NGHIEM_THU_GHI_CHU_VA_LICH_SU_TASK.md](NGHIEM_THU_GHI_CHU_VA_LICH_SU_TASK.md).

## Cách đọc

- `[ ]`: còn việc phải làm; không dùng file này để lưu nhật ký thực hiện.
- `P0`: chặn UAT hoặc có rủi ro an toàn/nghiệp vụ trực tiếp.
- `P1`: quan trọng nhưng không phải điểm chặn tức thời.
- Chỉ chuyển task sang hồ sơ nghiệm thu khi toàn bộ điều kiện đóng đã có bằng chứng hợp lệ.

## 1. Tìm kiếm và chọn khách hàng

- [ ] **CUST-SEARCH-003 — Regression các màn hình dùng bộ chọn khách** · `P0` · `PARTIAL_PASS_CREATE_ORDER_FIXED_EDIT_ORDER_READY_FOR_RETEST`
  - **Đã xong 22/08/2026:** race + stale-error ở màn lập đơn (`create-order`) đã fix tại `FormSelect.js` dùng chung (gốc rễ thật: picker này không có guard nào, không phải chỗ đã đoán trước đó) và có bằng chứng CDP intercept trước/sau tại `reports/uat/CUST-SEARCH-003/`.
  - **Đã gỡ blocker 22/08/2026:** lỗi render `edit-order.js` đã được sửa trong `order-ui-evidence-work` và merge vào `hoangdang` qua commit merge `fb85981`; form sửa đơn đã chạy được trong bộ E2E ORDER-APPROVAL-005/006.
  - **Cần làm:** chạy riêng ma trận race/stale-response trên màn sửa đơn; bổ sung API lỗi/retry có chủ đích, đổi tài khoản 2 người dùng thật, khách ngoài scope, và regression đầy đủ trên cả hai màn.
  - **Điều kiện đóng:** 100% ca P0/P1 pass trên cả 2 màn, có Network timeline hoặc request ID và không giữ dữ liệu khách của phiên trước.

## 2. Cấu hình giá trị tối thiểu CTBH

- [ ] **PROMO-CFG-001 — Chốt contract giá trị tối thiểu CTBH** · `P1` · `CODE_DONE_PENDING_REMAINING_BUSINESS_SIGN_OFF_AND_E2E`
  - **Đã chốt 22/08/2026:** `QUANTITY_GIFT` tính theo tỷ lệ (gói `10+2`, mua `5` tặng `1`); vượt `MaximumQuantity` thì clamp lượng tính quyền lợi tại max (`80→8`, mua `100` vẫn tặng `8`), không loại rule/fallback note-text. Frontend + SQL dùng `PROMOTION_BENEFIT_V2`; verifier rollback PASS 6 nhóm kiểm tra.
  - **Cần làm:** business còn phải chốt VAT, rule chiết khấu/giá trị, `MaximumOrderAmount`, trả hàng, làm tròn tiền và fallback khi quyền lợi tính ra bằng `0`; sau đó chạy E2E tạo đơn thật có request ID.
  - **Điều kiện đóng:** có sign-off phần còn lại và bảng ví dụ đầy đủ; preview frontend, API/SQL và dòng đơn thực tế cho cùng kết quả.

- [ ] **PROMO-CFG-002 — Cấu hình min có phân quyền và audit** · `P0` · `AUDIT_PERMISSION_MERGED_PENDING_GATEWAY_IDENTITY_AND_E2E`
  - **Đã xong 22/08/2026:** quyền âm (tạo/duyệt), khóa sửa bản đã duyệt, audit trước/sau (gồm nội dung rule, `BranchIDs`, `UserGroupIDs`, không chỉ đếm dòng), bắt buộc lý do khi từ chối/thu hồi, và loại đúng config tương lai/hết hạn/sai scope — đã merge, verify 16/16 PASS trên `medtest` (rollback).
  - **Cần làm (P0 còn mở):** Promotion admin APIs chưa nằm trong identity-server-owned policy của `server.js` — người dùng thường sửa `Username` trong payload gọi qua gateway hiện chưa bị chặn (test hiện có chỉ gọi thẳng proc SQL, không phải qua gateway thật). Sau khi vá xong: chạy mutation thật qua API/UI có request ID.
  - **Điều kiện đóng:** đổi config không cần build code; user ngoài quyền bị chặn **kể cả khi gọi qua gateway với `Username` giả trong payload**; payload giả không vượt kiểm tra server.

- [ ] **PROMO-CFG-003 — UAT min CTBH trên preview và đơn thật** · `P0` · `BLOCKED_BY_PROMO_CFG_001_002`
  - **Cần làm:** sau sign-off, chạy procedure tạo đơn thật/rollback cho các ca dưới/bằng/trên ngưỡng, double-click, retry và config đổi giữa preview/xác nhận.
  - **Điều kiện đóng:** có ảnh preview, response, request ID, mã đơn hoặc bằng chứng rollback; không áp sai CTBH hay tạo đơn trùng.

## 3. Workflow Sale tạo đơn → Kế toán duyệt

> `ORDER-APPROVAL-005/006` đã hoàn tất code, merge và evidence E2E; chi tiết đã chuyển sang hồ sơ
> nghiệm thu. Quyết định hiện hành: Sale được lưu/sửa nháp của chính mình; gửi duyệt là thao tác riêng;
> sau khi gửi Sale bị khóa sửa; chỉ người có vai trò phù hợp cùng chi nhánh được sửa đơn chờ duyệt;
> chỉ đơn nháp mới được chủ đơn hủy. Kế toán không dùng app, chỉ làm bên PMKT.

- [ ] **ORDER-APPROVAL-005/006 — QA độc lập ký xác nhận cuối** · `P0` · `PASS_READY_FOR_QA_REVIEW`
  - **Đã có:** code đã merge vào `hoangdang` tại `fb85981`; E2E Chrome thật qua gateway/`medtest` PASS các ca tạo–sửa nháp, chặn Sale khác, gửi duyệt riêng, khóa Sale sau gửi, quản lý cùng chi nhánh sửa, hủy nháp và chống double-click. Evidence nằm tại `reports/uat/ORDER-APPROVAL-005-006/`.
  - **Cần làm:** QA độc lập đối chiếu evidence và ký `PASS`; không còn hạng mục code nào đã biết trong phạm vi 005/006.
  - **Điều kiện đóng:** QA xác nhận tài khoản, request ID, trạng thái DB trước/sau và kết quả 13 ca E2E; sau đó chuyển cả hai task sang hồ sơ `DONE`.

## 4. Test bằng dữ liệu mới

- [ ] **CUSTOMER-UAT-001 — Xác minh readiness bằng dữ liệu người dùng tạo** · `P0` · `PENDING_USER_CREATED_DATA_E2E`
  - **Cần làm:** khách chốt tài khoản/chi nhánh UAT và người nhập sản phẩm, giá, tồn, CTBH; chạy bằng tài khoản có `EmployeeID` thật, không dùng cấu hình riêng của `demo` làm bằng chứng.
  - **Điều kiện đóng:** dữ liệu mới có manifest nguồn gốc; các nhánh có CTBH cấu hình, CTBH note-text và không CTBH đều được kiểm; thiếu giá/tồn/quyền trả đúng mã.

- [ ] **PRODUCT-DIAG-001 — Hoàn tất bằng chứng UI chẩn đoán sản phẩm** · `P1` · `TECHNICALLY_ACCEPTED_PENDING_CHATBOT_E2E_AND_LIVE_IDENTITY`
  - **Đã có:** contract/code 17/17 PASS; guard tĩnh và build PASS; bằng chứng UI Tạo đơn và Sửa đơn hợp lệ.
  - **Cần làm:** chạy Chatbot bằng chuỗi thao tác UI mà người dùng thật có thể thực hiện, không gọi trực tiếp `ApiEngine.selectApi`/helper để dựng trạng thái; đồng thời gọi gateway runtime thật để chứng minh `Username` giả bị thay bằng identity từ phiên đăng nhập. Test dùng `fetch`/envelope giả chỉ được tính là unit test.
  - **Điều kiện đóng:** Chatbot hiển thị chẩn đoán sau khi khách và sản phẩm được chọn thật; có ảnh/video, Network/request ID và response gateway đã che dữ liệu nhạy cảm.

- [ ] **CUSTOMER-UAT-002 — Chạy E2E bằng dữ liệu đội test tự tạo** · `P0` · `BLOCKED_BY_CUSTOMER_UAT_001`
  - **Cần làm:** chạy chuỗi tạo dữ liệu → chọn khách/sản phẩm → giá/tồn/CTBH → lập đơn → gửi duyệt → duyệt/từ chối, gồm các ca âm.
  - **Điều kiện đóng:** luồng chính không phụ thuộc fixture; có manifest, ảnh/video, request ID, mã thực thể và kế hoạch dọn dữ liệu.

## 5. Hướng dẫn và vòng góp ý

- [ ] **CUSTOMER-DOC-001 — Phát hành hướng dẫn UAT khách hàng** · `P1` · `BLOCKED_BY_STABLE_UAT_RUNTIME`
  - **Cần làm:** hoàn thiện hướng dẫn đăng nhập, chọn khách, dữ liệu test, lập/duyệt đơn, CTBH, báo lỗi và cách lấy request ID.
  - **Điều kiện đóng:** người chưa tham gia phát triển tự chạy được kịch bản chỉ bằng tài liệu; có version, môi trường, ngày và biên bản dry-run.

- [ ] **CUSTOMER-UAT-003 — Chạy test hẹp và thu feedback** · `P0` · `BLOCKED_BY_GUIDE_AND_CORE_FIXES`
  - **Cần làm:** mở test cho nhóm nhỏ; chuẩn hóa mỗi lỗi với account, thời gian, input, bước tái hiện, thực tế/mong đợi, ảnh/log và request ID.
  - **Điều kiện đóng:** mọi lỗi đủ thông tin để tái hiện và giao sửa; có tổng PASS/FAIL/BLOCKED và owner.

- [ ] **CUSTOMER-UAT-004 — Regression sau feedback** · `P0` · `BLOCKED_BY_CUSTOMER_UAT_003`
  - **Cần làm:** retest đúng ca lỗi và luồng liên quan trên bản deploy mới, kể cả refresh, đăng nhập lại và retry.
  - **Điều kiện đóng:** không còn P0; P1 còn lại phải được business chấp nhận trước khi mở UAT rộng.

## 6. Khóa quyền/chức năng sau nghiệm thu

- [ ] **CUSTOMER-BIZ-001 — Làm rõ yêu cầu “khóa chức năng”** · `P1` · `PENDING_CUSTOMER_CLARIFICATION`
  - **Cần làm:** chốt chức năng cần khóa, vai trò, thời điểm, ngoại lệ, cách mở lại và rollback.
  - **Điều kiện đóng:** có sign-off và ma trận `vai trò × chức năng × trước/sau nghiệm thu`.

- [ ] **CUSTOMER-SEC-001 — Triển khai khóa bằng cấu hình/phân quyền** · `P1` · `BLOCKED_BY_CUSTOMER_BIZ_001`
  - **Cần làm:** triển khai capability/role/config có version và audit; không hard-code account hoặc xóa dữ liệu.
  - **Điều kiện đóng:** đúng vai trò bị chặn, đúng vai trò còn quyền và có thể rollback bằng config.

- [ ] **CUSTOMER-SEC-002 — UAT âm chính sách khóa** · `P0` · `BLOCKED_BY_CUSTOMER_SEC_001`
  - **Cần làm:** thử gọi UI/API bị khóa, sửa payload, dùng context cũ và retry; xác nhận server chặn thật.
  - **Điều kiện đóng:** 100% ca âm bị chặn, có Network/request ID/audit và DB chứng minh không phát sinh mutation.

## 7. Thứ tự thực hiện

1. `PROMO-CFG-002` vá identity server-owned ở gateway và chạy ca giả `Username` qua HTTP thật.
2. `CUST-SEARCH-003` chạy phần regression còn thiếu; blocker render màn sửa đơn đã được gỡ.
3. `PRODUCT-DIAG-001` hoàn tất Chatbot E2E và live identity evidence.
4. QA độc lập ký xác nhận `ORDER-APPROVAL-005/006`.
5. Business chốt phần còn lại của `PROMO-CFG-001`, sau đó chạy `PROMO-CFG-003`.
6. `CUSTOMER-UAT-001` → `CUSTOMER-UAT-002` — vế `ORDER-APPROVAL-004` (UAT hai tài khoản
   Sale/Kế toán) không còn đúng phạm vi (kế toán làm ở PMKT, không dùng app).
7. `CUSTOMER-DOC-001` → `CUSTOMER-UAT-003` → `CUSTOMER-UAT-004`.
8. `CUSTOMER-BIZ-001` → `CUSTOMER-SEC-001` → `CUSTOMER-SEC-002`.
