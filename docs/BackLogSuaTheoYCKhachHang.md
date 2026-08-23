# BACKLOG VIỆC CẦN LÀM THEO YÊU CẦU KHÁCH HÀNG

**Cập nhật:** 23/08/2026 (sau đối chiếu báo cáo QA ngoài repo của `PROMO-CFG-003`)
**Mục đích:** file này chỉ liệt kê việc còn phải làm. Kết quả đã chạy, ghi chú dài, task đã hoàn thành và lịch sử trạng thái nằm tại [NGHIEM_THU_GHI_CHU_VA_LICH_SU_TASK.md](NGHIEM_THU_GHI_CHU_VA_LICH_SU_TASK.md).

## Cách đọc

- `[ ]`: còn việc phải làm; không dùng file này để lưu nhật ký thực hiện.
- `P0`: chặn UAT hoặc có rủi ro an toàn/nghiệp vụ trực tiếp.
- `P1`: quan trọng nhưng không phải điểm chặn tức thời.
- Chỉ chuyển task sang hồ sơ nghiệm thu khi toàn bộ điều kiện đóng đã có bằng chứng hợp lệ.

## 1. Test bằng dữ liệu mới

- [ ] **CUSTOMER-UAT-001 — Xác minh readiness bằng dữ liệu người dùng tạo** · `P0` · `PENDING_USER_CREATED_DATA_E2E`
  - **Cần làm:** khách chốt tài khoản/chi nhánh UAT và người nhập sản phẩm, giá, tồn, CTBH; chạy bằng tài khoản có `EmployeeID` thật, không dùng cấu hình riêng của `demo` làm bằng chứng.
  - **Điều kiện đóng:** dữ liệu mới có manifest nguồn gốc; các nhánh có CTBH cấu hình, CTBH note-text và không CTBH đều được kiểm; thiếu giá/tồn/quyền trả đúng mã.

- [ ] **CUSTOMER-UAT-002 — Chạy E2E bằng dữ liệu đội test tự tạo** · `P0` · `BLOCKED_BY_CUSTOMER_UAT_001`
  - **Cần làm:** chạy chuỗi tạo dữ liệu → chọn khách/sản phẩm → giá/tồn/CTBH → lập đơn → gửi duyệt → duyệt/từ chối, gồm các ca âm.
  - **Điều kiện đóng:** luồng chính không phụ thuộc fixture; có manifest, ảnh/video, request ID, mã thực thể và kế hoạch dọn dữ liệu.

## 2. Hướng dẫn và vòng góp ý

- [ ] **CUSTOMER-DOC-001 — Phát hành hướng dẫn UAT khách hàng** · `P1` · `READY_TO_DRAFT_PENDING_UAT_DRY_RUN`
  - **Cần làm:** có thể soạn ngay hướng dẫn đăng nhập, chọn khách, dữ liệu test, lập/duyệt đơn, CTBH, báo lỗi và cách lấy request ID; bản phát hành cuối cần dry-run trên runtime UAT đã deploy.
  - **Điều kiện đóng:** người chưa tham gia phát triển tự chạy được kịch bản chỉ bằng tài liệu; có version, môi trường, ngày và biên bản dry-run.

- [ ] **CUSTOMER-UAT-003 — Chạy test hẹp và thu feedback** · `P0` · `BLOCKED_BY_CUSTOMER_DOC_001_AND_CUSTOMER_UAT_002`
  - **Cần làm:** mở test cho nhóm nhỏ; chuẩn hóa mỗi lỗi với account, thời gian, input, bước tái hiện, thực tế/mong đợi, ảnh/log và request ID.
  - **Điều kiện đóng:** mọi lỗi đủ thông tin để tái hiện và giao sửa; có tổng PASS/FAIL/BLOCKED và owner.

- [ ] **CUSTOMER-UAT-004 — Regression sau feedback** · `P0` · `BLOCKED_BY_CUSTOMER_UAT_003`
  - **Cần làm:** retest đúng ca lỗi và luồng liên quan trên bản deploy mới, kể cả refresh, đăng nhập lại và retry.
  - **Điều kiện đóng:** không còn P0; P1 còn lại phải được business chấp nhận trước khi mở UAT rộng.

## 3. Khóa quyền/chức năng sau nghiệm thu

- [ ] **CUSTOMER-BIZ-001 — Làm rõ yêu cầu “khóa chức năng”** · `P1` · `PENDING_CUSTOMER_CLARIFICATION`
  - **Cần làm:** chốt chức năng cần khóa, vai trò, thời điểm, ngoại lệ, cách mở lại và rollback.
  - **Điều kiện đóng:** có sign-off và ma trận `vai trò × chức năng × trước/sau nghiệm thu`.

- [ ] **CUSTOMER-SEC-001 — Triển khai khóa bằng cấu hình/phân quyền** · `P1` · `BLOCKED_BY_CUSTOMER_BIZ_001`
  - **Cần làm:** triển khai capability/role/config có version và audit; không hard-code account hoặc xóa dữ liệu.
  - **Điều kiện đóng:** đúng vai trò bị chặn, đúng vai trò còn quyền và có thể rollback bằng config.

- [ ] **CUSTOMER-SEC-002 — UAT âm chính sách khóa** · `P0` · `BLOCKED_BY_CUSTOMER_SEC_001`
  - **Cần làm:** thử gọi UI/API bị khóa, sửa payload, dùng context cũ và retry; xác nhận server chặn thật.
  - **Điều kiện đóng:** 100% ca âm bị chặn, có Network/request ID/audit và DB chứng minh không phát sinh mutation.

## 4. Thứ tự thực hiện

1. `CUSTOMER-UAT-001` → `CUSTOMER-UAT-002` — vế `ORDER-APPROVAL-004` (UAT hai tài khoản
   Sale/Kế toán) không còn đúng phạm vi (kế toán làm ở PMKT, không dùng app).
2. `CUSTOMER-DOC-001` → `CUSTOMER-UAT-003` → `CUSTOMER-UAT-004`.
3. `CUSTOMER-BIZ-001` → `CUSTOMER-SEC-001` → `CUSTOMER-SEC-002`.
