# BACKLOG VIỆC CẦN LÀM THEO YÊU CẦU KHÁCH HÀNG

**Cập nhật:** 21/08/2026
**Mục đích:** file này chỉ liệt kê việc còn phải làm. Kết quả đã chạy, ghi chú dài, task đã hoàn thành và lịch sử trạng thái nằm tại [NGHIEM_THU_GHI_CHU_VA_LICH_SU_TASK.md](NGHIEM_THU_GHI_CHU_VA_LICH_SU_TASK.md).

## Cách đọc

- `[ ]`: còn việc phải làm; không dùng file này để lưu nhật ký thực hiện.
- `P0`: chặn UAT hoặc có rủi ro an toàn/nghiệp vụ trực tiếp.
- `P1`: quan trọng nhưng không phải điểm chặn tức thời.
- Chỉ chuyển task sang hồ sơ nghiệm thu khi toàn bộ điều kiện đóng đã có bằng chứng hợp lệ.

## 1. Tìm kiếm và chọn khách hàng

- [ ] **CUST-SEARCH-003 — Regression các màn hình dùng bộ chọn khách** · `P0` · `PARTIAL_PASS_PENDING_FULL_E2E_EVIDENCE`
  - **Cần làm:** ép request đầu chậm nhưng đã gửi; chứng minh response cũ hoàn tất sau response mới; test API lỗi/retry, stale error, đổi tài khoản, khách ngoài scope và các màn lập/sửa đơn.
  - **Điều kiện đóng:** 100% ca P0/P1 pass, có Network timeline hoặc request ID và không giữ dữ liệu khách của phiên trước.

## 2. Cấu hình giá trị tối thiểu CTBH

- [ ] **PROMO-CFG-001 — Chốt contract giá trị tối thiểu CTBH** · `P1` · `CODE_DONE_PENDING_REMAINING_BUSINESS_SIGN_OFF_AND_E2E`
  - **Đã chốt 22/08/2026:** `QUANTITY_GIFT` tính theo tỷ lệ (gói `10+2`, mua `5` tặng `1`); vượt `MaximumQuantity` thì clamp lượng tính quyền lợi tại max (`80→8`, mua `100` vẫn tặng `8`), không loại rule/fallback note-text. Frontend + SQL dùng `PROMOTION_BENEFIT_V2`; verifier rollback PASS 6 nhóm kiểm tra.
  - **Cần làm:** business còn phải chốt VAT, rule chiết khấu/giá trị, `MaximumOrderAmount`, trả hàng, làm tròn tiền và fallback khi quyền lợi tính ra bằng `0`; sau đó chạy E2E tạo đơn thật có request ID.
  - **Điều kiện đóng:** có sign-off phần còn lại và bảng ví dụ đầy đủ; preview frontend, API/SQL và dòng đơn thực tế cho cùng kết quả.

- [ ] **PROMO-CFG-002 — Cấu hình min có phân quyền và audit** · `P1` · `PENDING_SIGN_OFF_AND_E2E`
  - **Cần làm:** bổ sung test quyền âm, audit trước/sau, config tương lai/hết hạn/sai scope và mutation thật qua API/UI có request ID.
  - **Điều kiện đóng:** đổi config không cần build code; user ngoài quyền bị chặn; payload giả không vượt kiểm tra server.

- [ ] **PROMO-CFG-003 — UAT min CTBH trên preview và đơn thật** · `P0` · `BLOCKED_BY_PROMO_CFG_001_002`
  - **Cần làm:** sau sign-off, chạy procedure tạo đơn thật/rollback cho các ca dưới/bằng/trên ngưỡng, double-click, retry và config đổi giữa preview/xác nhận.
  - **Điều kiện đóng:** có ảnh preview, response, request ID, mã đơn hoặc bằng chứng rollback; không áp sai CTBH hay tạo đơn trùng.

## 3. Workflow Sale tạo đơn → Kế toán duyệt

> **21/08/2026 — khách xác nhận qua chat: kế toán không dùng app, chỉ làm bên PMKT; app chỉ
> theo dõi đơn.** 3 bullet `ORDER-APPROVAL-002/003/004` bên dưới mô tả thiết kế TRƯỚC quyết
> định này và đã bị `ORDER-APPROVAL-005`/`ORDER-APPROVAL-006` thay thế phần lớn — giữ lại để
> có lịch sử, KHÔNG dùng làm điều kiện đóng nữa. Việc cần làm thật nằm ở 2 mục ngay dưới đây.

- [x] **ORDER-APPROVAL-005 — Khóa sửa đơn về đúng vai trò/trạng thái** · `P0` · `CODE_DONE_PENDING_UI_EVIDENCE`
  - **Quyết định khách (21/08/2026):** giữ nút duyệt trong app (chưa nối PMKT thật); bỏ đơn
    nháp — tạo đơn vào thẳng Chờ duyệt; Sale gửi xong hết quyền sửa, chỉ người duyệt sửa được
    khi còn Chờ duyệt.
  - **Đã làm:** khóa sửa chuyển hẳn vào SQL (`AI_OrderEditGuardFnc`, `sql/ORDER-APPROVAL-005_Order_Edit_Guard_AI.sql`)
    — khóa dòng đơn bằng `UPDLOCK/HOLDLOCK` rồi mới kiểm quyền và ghi trong CÙNG transaction,
    không còn race giữa bước hỏi trạng thái và bước ghi. 5 proc CRUD ERP gốc
    (`API_DonHang_Update/_Delete`, `API_DonHangChiTiet_Insert/_Update/_Delete`) và
    `API_DonHang_StatusLookup_AI` bị chặn hẳn ở gateway. `scripts/verify_order_edit_guard_ai.js`
    (11/11 PASS) và `scripts/verify_order_status_guard.js` (16/16 PASS) chạy trên dữ liệu thật,
    luôn rollback.
  - **Còn thiếu để đóng:** ảnh/video UI thật (Sale bị khóa sửa sau khi gửi; người duyệt cùng
    chi nhánh sửa được) — chưa có ai bấm thử trên UI.

- [x] **ORDER-APPROVAL-006 — Khôi phục Lưu nháp + Sale sửa đơn nháp** · `P0` · `CODE_DONE_PENDING_UI_EVIDENCE`
  - **Quyết định khách (21/08/2026, đổi ý sau ORDER-APPROVAL-005):** giữ lại nút "Lưu nháp";
    Sale sửa được đơn của chính mình khi còn là Đơn nháp (StatusID=-1); Gửi duyệt là nút riêng
    trên trang chi tiết đơn (không tự gộp vào Sửa); Hủy đơn nháp chỉ áp dụng cho `-1 → Đã hủy`
    — KHÔNG mở lại việc chủ đơn hủy đơn đã gửi/đã duyệt (giữ nguyên phần đã sửa ở
    ORDER-APPROVAL-005/004).
  - **Đã làm:** `sql/ORDER-APPROVAL-006_Draft_Restore_AI.sql` mở rộng `AI_OrderEditGuardFnc`
    cho StatusID=-1 (chỉ chủ đơn) và bật đúng 2 dòng hợp đồng
    (`SUBMIT -1→0`, `CANCEL -1→10`) trong `AI_OrderApprovalTransitionTbl` — 6 dòng CANCEL còn
    lại (0,1,2,3,4,6→10) vẫn `RETIRED`. Sửa `@InitialStatusID` hard-code trong
    `API_DonHangChiTiet_Insert_AI` (đang ép StatusID=0 bất kể `@SaveAsDraft`). Mở lại gateway
    cho `API_DonHang_OwnerTransition_AI`/`API_DonHang_OwnerContext_AI` (identity từ token, không
    tin client). Nút "LƯU NHÁP" khôi phục ở `create-order.html`; nút "Gửi duyệt"/"Hủy đơn nháp"
    khôi phục ở `order-detail.js`. `scripts/verify_donhang_ownertransition_ai.js` (11/11 PASS,
    viết lại đúng phạm vi mới — không còn ca chủ đơn hủy đơn Chờ duyệt) và
    `scripts/verify_order_edit_guard_ai.js` (thêm 2 ca chủ-đơn-sửa-được/không-sửa-được-đơn-
    nháp-người-khác) chạy trên dữ liệu thật, luôn rollback.
  - **Còn thiếu để đóng:** ảnh/video UI thật (Lưu nháp → Sửa → Gửi duyệt / Hủy đơn nháp).

## 4. Test bằng dữ liệu mới

- [ ] **CUSTOMER-UAT-001 — Xác minh readiness bằng dữ liệu người dùng tạo** · `P0` · `PENDING_USER_CREATED_DATA_E2E`
  - **Cần làm:** khách chốt tài khoản/chi nhánh UAT và người nhập sản phẩm, giá, tồn, CTBH; chạy bằng tài khoản có `EmployeeID` thật, không dùng cấu hình riêng của `demo` làm bằng chứng.
  - **Điều kiện đóng:** dữ liệu mới có manifest nguồn gốc; các nhánh có CTBH cấu hình, CTBH note-text và không CTBH đều được kiểm; thiếu giá/tồn/quyền trả đúng mã.

- [x] **PRODUCT-DIAG-001 — Hoàn tất bằng chứng UI chẩn đoán sản phẩm** · `P1` · `DONE`
  - **Kết quả:** 3/3 bằng chứng UI thuần E2E đạt chuẩn tại `reports/uat/` (Tạo đơn, Sửa đơn, Chatbot panel); 17/17 cases test nghiệp vụ & gateway PASS; server-side identity policy 11/11 PASS; bundle app (94.98 KB) & chatbot (314.56 KB) hoàn chỉnh.

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

1. ~~`ORDER-APPROVAL-003` sửa các điểm an toàn song song với việc chốt `ORDER-APPROVAL-002`~~ —
   thay bằng `ORDER-APPROVAL-005`/`ORDER-APPROVAL-006` (xem mục 3), code xong, còn chờ ảnh UI.
2. `PRODUCT-DIAG-001` hoàn tất Chatbot E2E và live identity evidence.
3. `CUST-SEARCH-003`.
4. `PROMO-CFG-001` → `PROMO-CFG-002` → `PROMO-CFG-003`.
5. `CUSTOMER-UAT-001` → `CUSTOMER-UAT-002` — vế `ORDER-APPROVAL-004` (UAT hai tài khoản
   Sale/Kế toán) không còn đúng phạm vi (kế toán làm ở PMKT, không dùng app).
6. `CUSTOMER-DOC-001` → `CUSTOMER-UAT-003` → `CUSTOMER-UAT-004`.
7. `CUSTOMER-BIZ-001` → `CUSTOMER-SEC-001` → `CUSTOMER-SEC-002`.
