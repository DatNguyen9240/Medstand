# HÀNG CHỜ QA/UAT CẦN NGHIỆM THU LẠI

**Cập nhật:** 23/08/2026

**Mục đích:** file này chỉ giữ việc chưa cần sửa/code logic, nhưng còn phải QA, chạy E2E, dry-run hoặc thu bằng chứng độc lập. Nếu một ca FAIL chứng minh lỗi sản phẩm, tạo defect mới trong [BackLogSuaTheoYCKhachHang.md](BackLogSuaTheoYCKhachHang.md); không tự sửa code trong task QA.

## Cách đọc

- `READY_FOR_QA`: có thể kiểm tra ngay.
- `PARTIAL_PASS`: một phần đã đạt nhưng chưa đủ điều kiện nghiệm thu cuối.
- `BLOCKED_BY_*`: chỉ chạy sau khi đầu vào hoặc task phụ thuộc hoàn tất.
- Task trong file này không được chuyển `DONE` chỉ dựa trên mock, dữ liệu `demo`, ảnh không hiện trạng thái hoặc raw evidence không thể tái lập.

## 1. Chuỗi dữ liệu và E2E khách hàng

- [ ] **CUSTOMER-UAT-002 — Chạy E2E bằng dữ liệu đội test tự tạo** · `P0` · `READY_FOR_E2E_PENDING_BROWSER_CONNECTION`
  - **Đầu vào đã có:** `CUSTOMER-UAT-001` đã PASS bằng Manager/Sale có `EmployeeID`, khách do tài khoản thật tạo, đủ ba nhánh CTBH và bốn ca âm. Raw manifest nằm cục bộ dưới `reports/uat/` và bị Git ignore. CTBH cấu hình của lượt readiness đã được cleanup; QA phải provision fixture có marker ngay trước E2E và dọn theo ID/marker sau lượt chạy.
  - **QA còn làm:** chạy tạo dữ liệu → chọn khách/sản phẩm → giá/tồn/CTBH → lập đơn → gửi duyệt → duyệt/từ chối, gồm ca âm và retry.
  - **Điều kiện đóng:** luồng chính không phụ thuộc fixture; có manifest, ảnh/video đã che dữ liệu, request ID, mã thực thể và kế hoạch dọn dữ liệu.

## 2. Tài liệu và vòng UAT

- [ ] **CUSTOMER-DOC-001 — Dry-run và phát hành hướng dẫn UAT khách hàng** · `P1` · `DRAFT_V0_1_REVIEWED_PENDING_UAT_DRY_RUN`
  - **Đã có:** bản `DRAFT 0.1` và README đã review nội dung/source; không chứa credential/PII; accessibility audit `0 finding`.
  - **QA còn làm:** điền release/commit đã deploy, dùng bộ tài khoản/dữ liệu UAT thật và để một người chưa tham gia phát triển tự chạy chỉ bằng tài liệu.
  - **Điều kiện đóng:** có biên bản dry-run gồm version, môi trường, ngày, người chạy và kết quả; xử lý feedback rồi phát hành bản không còn nhãn `DRAFT`.

- [ ] **CUSTOMER-UAT-003 — Chạy test hẹp và thu feedback** · `P0` · `BLOCKED_BY_CUSTOMER_DOC_001_AND_CUSTOMER_UAT_002`
  - **QA còn làm:** mở test cho nhóm nhỏ; mỗi lỗi phải có account, thời gian, input, bước tái hiện, actual/expected, ảnh/log và request ID.
  - **Điều kiện đóng:** mọi lỗi đủ thông tin để tái hiện và giao sửa; có tổng PASS/FAIL/BLOCKED và owner.

- [ ] **CUSTOMER-UAT-004 — Regression sau feedback** · `P0` · `BLOCKED_BY_CUSTOMER_UAT_003`
  - **QA còn làm:** retest đúng defect và luồng liên quan trên bản deploy mới, gồm refresh, đăng nhập lại, double-click và retry.
  - **Điều kiện đóng:** không còn P0; P1 còn lại phải có quyết định business chấp nhận trước khi mở UAT rộng.

## 3. Nghiệm thu chính sách khóa

- [ ] **CUSTOMER-SEC-002 — UAT âm chính sách khóa** · `P0` · `LIVE_SQL_PASS_PENDING_BROWSER_HTTP_E2E`
  - **Đã kiểm live 24/08/2026:** `scripts/verify_customer_sec002_policy.js --live` đạt `14/14 PASS` trên policy đã deploy; bao phủ Admin không ăn theo `Manager=1`, kế toán bị chặn cả owner-path, quản lý không `SUBMIT/CANCEL` nháp người khác, stale context, concurrent revoke và audit. Mọi mutation thử nghiệm `ROLLED_BACK`.
  - **QA còn làm:** kiểm UI/HTTP bằng Browser được kết nối (identity giả, token thiếu/hỏng, ảnh và request ID).
  - **Điều kiện đóng:** 100% ca âm bị chặn, có Network/request ID/audit và DB chứng minh không phát sinh mutation.

## 4. Nghiệm thu lại chức năng tồn kho khách hàng báo `Done`

- [ ] **STOCK-QA-001 — Xác minh contract hiển thị tồn kho** · `P0` · `READY_FOR_INDEPENDENT_QA`
  - **Phạm vi khách hàng xác nhận đã làm:** chỉ hiển thị danh mục nhóm hàng `HH1`; tài khoản thuộc chi nhánh nào chỉ nhìn tồn thuộc phạm vi chi nhánh đó; UI chỉ cần các cột `Mã SP`, `Tên SP`, `Tên kho`, `Tồn khả dụng`.
  - **QA còn làm:** kiểm nhóm ngoài `HH1` không xuất hiện; dùng hai tài khoản khác chi nhánh; thử giả identity/branch qua request; đối chiếu tồn khả dụng; xác nhận đúng bốn cột trên UI và không lộ kho ngoài scope.
  - **Điều kiện đóng:** toàn bộ ca dương/âm PASS trên live Gateway, có request ID và đối chiếu DB/API; không có mutation. Nếu FAIL, mở defect mới thay vì sửa trong task QA này.

## 5. Thứ tự QA

1. `STOCK-QA-001` có thể chạy độc lập ngay.
2. `CUSTOMER-UAT-002` chạy từ manifest đã chốt của `CUSTOMER-UAT-001`.
3. `CUSTOMER-DOC-001` → `CUSTOMER-UAT-003` → `CUSTOMER-UAT-004`.
4. `CUSTOMER-SEC-002` chỉ chạy sau khi `CUSTOMER-SEC-001` được triển khai và deploy.
