# CUSTOMER-UAT-002 — Kế hoạch E2E (`PLAN_ONLY`)

**Trạng thái:** `READY_FOR_E2E_PENDING_BROWSER_CONNECTION`
**Ngày lập kế hoạch:** 23/08/2026  
**Môi trường dự kiến:** runtime UAT đã deploy  
**Tài khoản/dữ liệu:** đã chốt bằng `CUSTOMER-UAT-001`; raw manifest cục bộ bị Git ignore, không chép thông tin khách vào tài liệu phát hành

## Test Flow

### Case 1: CTBH cấu hình (`PENDING`)
1. Login
2. Chọn khách thuộc dữ liệu UAT mới.
3. Chọn sản phẩm có CTBH cấu hình đang hoạt động theo oracle.
4. Đối chiếu giá, tồn và CTBH với API/DB.
7. Lập đơn
8. Gửi duyệt
9. Thu request ID, mã đơn, ảnh đã che dữ liệu và audit.

### Case 2: CTBH note-text (`PENDING`)
1. Chọn dữ liệu có note-text hợp lệ theo oracle.
2. Lập đơn → Gửi duyệt.
3. Thu bằng chứng và đối chiếu response.

### Case 3: Không CTBH (`PENDING`)
1. Chọn dữ liệu có giá đang hiệu lực nhưng không có CTBH.
2. Xác nhận không áp quyền lợi và lập đơn theo contract.
3. Không dùng giá hết hiệu lực làm bằng chứng cho ca này.

### Ca âm (Negative)
- Giá hết hiệu lực → FAIL đúng kỳ vọng
- Tồn = 0 → FAIL đúng kỳ vọng
- Khách ngoài scope → không trả dữ liệu khách
- Giả `Username` hoặc chi nhánh trong payload → Gateway vẫn dùng identity từ token
- Sale khác sửa đơn → bị chặn, DB không mutation
- Double-click/retry → một mutation; replay/conflict đúng contract
- Cấu hình CTBH đổi giữa preview/xác nhận → `PROMOTION_CHANGED`, không tạo đơn theo preview cũ

## Bằng chứng cần thu thập
- Request ID từ header
- Ảnh thao tác màn hình
- Log server (X-Request-ID)
- Biên bản dry-run

**Kết luận hiện tại:** đầu vào readiness đã đủ nhưng chưa chạy UI E2E. Cần Browser được kết nối với runtime local/UAT; không được dùng tài liệu này để kết luận `PASS` hoặc `DONE`.

---

**Khi thực thi:** ghi người chạy độc lập, release/commit, account/branch, request ID, mã thực thể, ảnh đã che dữ liệu, log/audit và kế hoạch dọn fixture.
