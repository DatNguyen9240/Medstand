# BACKLOG VIỆC CẦN LÀM THEO YÊU CẦU KHÁCH HÀNG

**Cập nhật:** 22/08/2026 (rà soát trên nhánh `hoangdang` sau khi làm sạch lịch sử)
**Mục đích:** file này chỉ liệt kê việc còn phải làm. Kết quả đã chạy, ghi chú dài, task đã hoàn thành và lịch sử trạng thái nằm tại [NGHIEM_THU_GHI_CHU_VA_LICH_SU_TASK.md](NGHIEM_THU_GHI_CHU_VA_LICH_SU_TASK.md).

## Cách đọc

- `[ ]`: còn việc phải làm; không dùng file này để lưu nhật ký thực hiện.
- `P0`: chặn UAT hoặc có rủi ro an toàn/nghiệp vụ trực tiếp.
- `P1`: quan trọng nhưng không phải điểm chặn tức thời.
- Chỉ chuyển task sang hồ sơ nghiệm thu khi toàn bộ điều kiện đóng đã có bằng chứng hợp lệ.

## 1. Cấu hình giá trị tối thiểu CTBH

- [ ] **PROMO-CFG-001 — Chốt contract giá trị tối thiểu CTBH** · `P1` · `CODE_DONE_PENDING_REMAINING_BUSINESS_SIGN_OFF_AND_E2E`
  - **Đã chốt 22/08/2026:** `QUANTITY_GIFT` tính theo tỷ lệ (gói `10+2`, mua `5` tặng `1`); vượt `MaximumQuantity` thì clamp lượng tính quyền lợi tại max (`80→8`, mua `100` vẫn tặng `8`), không loại rule/fallback note-text. Frontend + SQL dùng `PROMOTION_BENEFIT_V2`; verifier rollback PASS 6 nhóm kiểm tra.
  - **Cần làm:** business còn phải chốt VAT, rule chiết khấu/giá trị, `MaximumOrderAmount`, trả hàng, làm tròn tiền và fallback khi quyền lợi tính ra bằng `0`; sau đó chạy E2E tạo đơn thật có request ID.
  - **Điều kiện đóng:** có sign-off phần còn lại và bảng ví dụ đầy đủ; preview frontend, API/SQL và dòng đơn thực tế cho cùng kết quả.

- [ ] **PROMO-CFG-002 — Cấu hình min có phân quyền và audit** · `P0` · `CODE_AND_GATEWAY_PREVIEW_PASS_PENDING_REASON_TRANSPORT_AND_UI_E2E`
  - **Đã xong 22/08/2026:** quyền âm (tạo/duyệt), khóa sửa bản đã duyệt, audit trước/sau (gồm nội dung rule, `BranchIDs`, `UserGroupIDs`), bắt buộc lý do khi từ chối/thu hồi và lọc config theo thời gian/scope — verify SQL `16/16 PASS` trên `medtest`, rollback. Proc runtime đã có đủ tham số `@Reason`.
  - **P0 identity + positional binding đã vá và kiểm qua HTTP thật:** List/Detail/ActiveByItems lấy identity từ token; Upsert/Approve dựng lại body bằng allowlist đúng thứ tự chữ ký proc, điền default cho tham số optional, gỡ mọi biến thể `User`/`Username`, chặn field lạ, field trùng khác hoa/thường và field bắt buộc bị thiếu. `verify_order_status_guard.js` PASS `22/22`; `verify_promo_cfg002_gateway_identity.js` PASS `14/14`, gồm Sale giả Manager, token hỏng/thiếu, payload đảo thứ tự, payload cố làm lệch positional binding và response nghiệp vụ của frontend. Toàn bộ probe write dùng `Apply=0`, không mutation.
  - **Frontend đã bỏ gửi Username** ở toàn bộ năm Promotion API; gateway là nguồn sự thật duy nhất. Worktree cũ `promo-cfg-002-complete-work` bám `176cd9b` không được merge nguyên branch; thay đổi sạch hiện nằm trực tiếp trên `hoangdang` working tree.
  - **Cần làm còn lại:** xử lý lớp ERP live để tham số thứ năm `Reason` thực sự tới proc; sau đó chạy qua UI các luồng DRAFT → REJECT và APPROVED → WITHDRAW, đối soát request ID/audit actor. Evidence phải được tạo lại ở dạng tối giản và che toàn bộ credential/PII; không nhập bộ evidence của worktree cũ. `medtest` hiện còn 18 fixture `E2E_UI_MUT_*` ở trạng thái `REJECTED`, cần kế hoạch dọn UAT được phê duyệt hoặc ghi nhận rõ, không được mô tả là “không còn dữ liệu test”.
  - **Điều kiện đóng:** đổi config qua UI không cần build lại code; user ngoài quyền bị chặn kể cả payload giả; mutation hợp lệ ghi đúng actor/audit và có kế hoạch phục hồi dữ liệu.

- [ ] **PROMO-CFG-003 — UAT min CTBH trên preview và đơn thật** · `P0` · `BLOCKED_BY_PROMO_CFG_001_002`
  - **Cần làm:** sau sign-off, chạy procedure tạo đơn thật/rollback cho các ca dưới/bằng/trên ngưỡng, double-click, retry và config đổi giữa preview/xác nhận.
  - **Điều kiện đóng:** có ảnh preview, response, request ID, mã đơn hoặc bằng chứng rollback; không áp sai CTBH hay tạo đơn trùng.

## 2. Workflow Sale tạo đơn → Kế toán duyệt

> `ORDER-APPROVAL-005/006` đã hoàn tất code, merge và evidence E2E; chi tiết đã chuyển sang hồ sơ
> nghiệm thu. Quyết định hiện hành: Sale được lưu/sửa nháp của chính mình; gửi duyệt là thao tác riêng;
> sau khi gửi Sale bị khóa sửa; chỉ người có vai trò phù hợp cùng chi nhánh được sửa đơn chờ duyệt;
> chỉ đơn nháp mới được chủ đơn hủy. Kế toán không dùng app, chỉ làm bên PMKT.

- [ ] **ORDER-APPROVAL-005/006 — Vệ sinh evidence sau QA chức năng** · `P0` · `QA_FUNCTIONAL_PASS_PENDING_REDACTED_EVIDENCE`
  - **Đã có:** code đã merge vào `hoangdang` tại `fb85981`; QA độc lập đã xác nhận 13/13 ca UI PASS trên Chrome thật qua gateway/`medtest`. Đối soát lại ngày 22/08/2026 xác nhận `DMB0826/11` ở `StatusID=0`, `DMB0826/12` ở `StatusID=10`, các request submit/manager-update/cancel có đúng một audit mutation. Verifier hiện hành PASS: gateway guard `16/16`, chuẩn hóa quyền `20/20`, edit guard `11/11`; owner-transition PASS và rollback an toàn (một ca trạng thái giao hàng SKIP do không có fixture phù hợp).
  - **Không còn việc code đã biết:** contract lưu/sửa nháp, gửi duyệt/hủy riêng, phân quyền và idempotency đã đạt. QA chức năng đã ký `PASS`.
  - **Cần làm:** thu lại hoặc thay thế bộ ảnh/JSON công khai bằng evidence đã che tên, mã, số điện thoại và địa chỉ khách; loại bản chưa che khỏi tập tin dự kiến push/phát hành. Bộ hiện tại còn `customerId/customerName` trong JSON và ảnh form có dữ liệu khách đọc được, chưa đạt quy tắc evidence tại hồ sơ nghiệm thu.
  - **Điều kiện đóng:** bộ evidence chuẩn vẫn giữ đủ request ID, mã đơn, trạng thái trước/sau và kết quả 13 ca nhưng không lộ dữ liệu khách/token; sau đó chuyển cả hai task sang `DONE` mà không cần sửa thêm code.

## 3. Test bằng dữ liệu mới

- [ ] **CUSTOMER-UAT-001 — Xác minh readiness bằng dữ liệu người dùng tạo** · `P0` · `PENDING_USER_CREATED_DATA_E2E`
  - **Cần làm:** khách chốt tài khoản/chi nhánh UAT và người nhập sản phẩm, giá, tồn, CTBH; chạy bằng tài khoản có `EmployeeID` thật, không dùng cấu hình riêng của `demo` làm bằng chứng.
  - **Điều kiện đóng:** dữ liệu mới có manifest nguồn gốc; các nhánh có CTBH cấu hình, CTBH note-text và không CTBH đều được kiểm; thiếu giá/tồn/quyền trả đúng mã.

- [ ] **PRODUCT-DIAG-001 — Hoàn tất bằng chứng UI chẩn đoán sản phẩm** · `P1` · `TECHNICALLY_ACCEPTED_PENDING_CHATBOT_E2E_AND_LIVE_IDENTITY`
  - **Đã có:** contract/code 17/17 PASS; `API_HangHoaList_AI` đã nằm trong `READ_IDENTITY_POLICY`; guard tĩnh và build PASS; bằng chứng UI Tạo đơn và Sửa đơn hợp lệ. Không còn lỗ hổng code identity đã biết trong phạm vi task này, nhưng chưa có bằng chứng spoofing qua gateway runtime thật.
  - **Cần làm:** chạy Chatbot bằng chuỗi thao tác UI mà người dùng thật có thể thực hiện, không gọi trực tiếp `ApiEngine.selectApi`/helper để dựng trạng thái; đồng thời gọi gateway runtime thật để chứng minh `Username` giả bị thay bằng identity từ phiên đăng nhập. Test dùng `fetch`/envelope giả chỉ được tính là unit test.
  - **Điều kiện đóng:** Chatbot hiển thị chẩn đoán sau khi khách và sản phẩm được chọn thật; có ảnh/video, Network/request ID và response gateway đã che dữ liệu nhạy cảm.

- [ ] **CUSTOMER-UAT-002 — Chạy E2E bằng dữ liệu đội test tự tạo** · `P0` · `BLOCKED_BY_CUSTOMER_UAT_001`
  - **Cần làm:** chạy chuỗi tạo dữ liệu → chọn khách/sản phẩm → giá/tồn/CTBH → lập đơn → gửi duyệt → duyệt/từ chối, gồm các ca âm.
  - **Điều kiện đóng:** luồng chính không phụ thuộc fixture; có manifest, ảnh/video, request ID, mã thực thể và kế hoạch dọn dữ liệu.

## 4. Hướng dẫn và vòng góp ý

- [ ] **CUSTOMER-DOC-001 — Phát hành hướng dẫn UAT khách hàng** · `P1` · `BLOCKED_BY_STABLE_UAT_RUNTIME`
  - **Cần làm:** hoàn thiện hướng dẫn đăng nhập, chọn khách, dữ liệu test, lập/duyệt đơn, CTBH, báo lỗi và cách lấy request ID.
  - **Điều kiện đóng:** người chưa tham gia phát triển tự chạy được kịch bản chỉ bằng tài liệu; có version, môi trường, ngày và biên bản dry-run.

- [ ] **CUSTOMER-UAT-003 — Chạy test hẹp và thu feedback** · `P0` · `BLOCKED_BY_GUIDE_AND_CORE_FIXES`
  - **Cần làm:** mở test cho nhóm nhỏ; chuẩn hóa mỗi lỗi với account, thời gian, input, bước tái hiện, thực tế/mong đợi, ảnh/log và request ID.
  - **Điều kiện đóng:** mọi lỗi đủ thông tin để tái hiện và giao sửa; có tổng PASS/FAIL/BLOCKED và owner.

- [ ] **CUSTOMER-UAT-004 — Regression sau feedback** · `P0` · `BLOCKED_BY_CUSTOMER_UAT_003`
  - **Cần làm:** retest đúng ca lỗi và luồng liên quan trên bản deploy mới, kể cả refresh, đăng nhập lại và retry.
  - **Điều kiện đóng:** không còn P0; P1 còn lại phải được business chấp nhận trước khi mở UAT rộng.

## 5. Khóa quyền/chức năng sau nghiệm thu

- [ ] **CUSTOMER-BIZ-001 — Làm rõ yêu cầu “khóa chức năng”** · `P1` · `PENDING_CUSTOMER_CLARIFICATION`
  - **Cần làm:** chốt chức năng cần khóa, vai trò, thời điểm, ngoại lệ, cách mở lại và rollback.
  - **Điều kiện đóng:** có sign-off và ma trận `vai trò × chức năng × trước/sau nghiệm thu`.

- [ ] **CUSTOMER-SEC-001 — Triển khai khóa bằng cấu hình/phân quyền** · `P1` · `BLOCKED_BY_CUSTOMER_BIZ_001`
  - **Cần làm:** triển khai capability/role/config có version và audit; không hard-code account hoặc xóa dữ liệu.
  - **Điều kiện đóng:** đúng vai trò bị chặn, đúng vai trò còn quyền và có thể rollback bằng config.

- [ ] **CUSTOMER-SEC-002 — UAT âm chính sách khóa** · `P0` · `BLOCKED_BY_CUSTOMER_SEC_001`
  - **Cần làm:** thử gọi UI/API bị khóa, sửa payload, dùng context cũ và retry; xác nhận server chặn thật.
  - **Điều kiện đóng:** 100% ca âm bị chặn, có Network/request ID/audit và DB chứng minh không phát sinh mutation.

## 6. Thứ tự thực hiện

1. `PROMO-CFG-002` sửa lớp ERP chuyển tiếp đủ `Reason`, chạy REJECT/WITHDRAW qua UI, đối soát audit actor và xử lý 18 fixture `REJECTED`; identity + ordered payload qua HTTP đã PASS.
2. `PRODUCT-DIAG-001` hoàn tất Chatbot E2E và live identity evidence.
3. Vệ sinh/thu lại evidence đã che dữ liệu cho `ORDER-APPROVAL-005/006`; phần QA chức năng đã PASS.
4. Business chốt phần còn lại của `PROMO-CFG-001`, sau đó chạy `PROMO-CFG-003`.
5. `CUSTOMER-UAT-001` → `CUSTOMER-UAT-002` — vế `ORDER-APPROVAL-004` (UAT hai tài khoản
   Sale/Kế toán) không còn đúng phạm vi (kế toán làm ở PMKT, không dùng app).
6. `CUSTOMER-DOC-001` → `CUSTOMER-UAT-003` → `CUSTOMER-UAT-004`.
7. `CUSTOMER-BIZ-001` → `CUSTOMER-SEC-001` → `CUSTOMER-SEC-002`.
