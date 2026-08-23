# CUSTOMER-UAT-002 — Kế hoạch E2E (`PLAN_ONLY`)

**Trạng thái:** `PLAN_ONLY_BLOCKED_BY_CUSTOMER_UAT_001`  
**Ngày lập kế hoạch:** 23/08/2026  
**Môi trường dự kiến:** runtime UAT đã deploy  
**Tài khoản/dữ liệu:** chờ tài khoản có `EmployeeID` và dữ liệu mới từ `CUSTOMER-UAT-001`  

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

## Bằng chứng cần thu thập
- Request ID từ header
- Ảnh thao tác màn hình
- Log server (X-Request-ID)
- Biên bản dry-run

**Kết luận hiện tại:** chưa chạy E2E. Tài liệu này chỉ là kế hoạch và bị chặn bởi `CUSTOMER-UAT-001`; không được dùng để kết luận `PASS`, `DONE` hoặc sẵn sàng nghiệm thu.

---

**Khi thực thi:** ghi người chạy độc lập, release/commit, account/branch, request ID, mã thực thể, ảnh đã che dữ liệu, log/audit và kế hoạch dọn fixture.
