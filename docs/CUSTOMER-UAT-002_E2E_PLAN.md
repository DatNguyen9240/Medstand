# CUSTOMER-UAT-002 — Kế hoạch thực thi E2E

**Trạng thái:** `READY_FOR_E2E_PENDING_BROWSER_CONNECTION`
**Ngày lập kế hoạch:** 23/08/2026  
**Môi trường mục tiêu:** `https://medtest.bms7.net/`; chỉ bắt đầu sau khi ghi nhận release/commit thực tế đã deploy
**Tài khoản/dữ liệu:** `CUSTOMER-UAT-001` đã chốt tài khoản, khách và sản phẩm ứng viên. CTBH cấu hình dùng ở lượt readiness là fixture tạm đã được WITHDRAW/xóa; phải provision lại ngay trước E2E và cleanup ngay sau. Raw manifest cục bộ bị Git ignore, không chép thông tin khách vào tài liệu phát hành.

## Test Flow

### Case 1: CTBH cấu hình (`PENDING`)
1. Login
2. Chọn khách thuộc dữ liệu UAT mới.
3. Chọn sản phẩm có CTBH cấu hình đang hoạt động theo oracle.
4. Đối chiếu giá, tồn và CTBH với API/DB.
5. Lập đơn.
6. Gửi duyệt.
7. Thu request ID, mã đơn, ảnh đã che dữ liệu và audit.

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

## Gate trước khi chạy

- Ghi đúng release/commit đang chạy trên UAT; không suy ra từ HEAD local.
- Xác nhận `CUSTOMER-SEC-001` đã deploy và `CUSTOMER-SEC-002 --live` PASS nếu vòng UAT này dùng policy mới.
- Browser phải được kết nối với phiên đăng nhập thật; không thay bằng mock hoặc script chèn response.
- Dùng raw manifest mới nhất của `CUSTOMER-UAT-001` để chọn tài khoản/khách/sản phẩm; không giả định CTBH tạm trong manifest vẫn còn hiệu lực.
- Provision CTBH cấu hình có marker riêng ngay trước Case 1; ghi `PromotionProgramID`, người tạo, thời điểm và kế hoạch cleanup trong raw evidence.
- Sau lượt chạy, WITHDRAW qua proc nghiệp vụ rồi chỉ xóa fixture nếu marker và ID đều khớp; xác nhận residue bằng 0.
- Không đưa mã khách, token hoặc cookie vào artifact commit.

**Kết luận hiện tại:** đầu vào readiness đã đủ nhưng chưa chạy UI E2E. Cần Browser được kết nối với runtime local/UAT; không được dùng tài liệu này để kết luận `PASS` hoặc `DONE`.

---

**Khi thực thi:** ghi người chạy độc lập, release/commit, account/branch, request ID, mã thực thể, ảnh đã che dữ liệu, log/audit và kế hoạch dọn fixture.
