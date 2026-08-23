# CUSTOMER-DOC-001 — DRAFT hướng dẫn UAT khách hàng cho Order Approval 2026

**Trạng thái:** `DRAFT_PENDING_CORRECTION_AND_UAT_DRY_RUN`  
**Ngày soạn:** 23/08/2026  
**Phiên bản:** DRAFT 0.1  
**Môi trường dự kiến:** runtime UAT đã deploy  
**Tài khoản/dữ liệu:** chờ tài khoản có `EmployeeID` và bộ dữ liệu UAT mới  

---

## 1. Mục tiêu
Khách hàng tự thực hiện được chuỗi:
- Chọn khách hàng → Sản phẩm → Giá/Tồn/CTBH
- Lập đơn → Gửi duyệt → Duyệt/Từ chối
- Kiểm tra 3 nhánh CTBH (cấu hình, note-text, không CTBH)

---

## 2. Chuẩn bị
1. Mở browser → `http://localhost:3000` (hoặc URL UAT)
2. Login bằng tài khoản UAT (demo → sau này thay)
3. Môi trường: medtest

---

## 3. Test case chính cần thực hiện

### 3.1 Nhánh 1: CTBH cấu hình (`PENDING`)
1. Chọn khách và sản phẩm thuộc bộ dữ liệu UAT mới.
2. Xác nhận API trả CTBH cấu hình đang hoạt động.
3. Lập đơn → Gửi duyệt.
4. Thu request ID, mã đơn, ảnh đã che dữ liệu và đối chiếu DB/audit.

Không dùng `A008` làm bằng chứng cho nhánh này: manifest hiện có ghi `ActivePromotionCount = 0`.

### 3.2 Nhánh 2: CTBH note-text (`PENDING`)
1. Chọn dữ liệu có note-text hợp lệ.
2. Xác nhận nội dung hiển thị khớp response có cấu trúc.
3. Lập đơn và thu đầy đủ bằng chứng.

### 3.3 Nhánh 3: Không CTBH (`PENDING`)
1. Chọn dữ liệu có giá đang hiệu lực nhưng không có CTBH.
2. Xác nhận không áp quyền lợi CTBH và vẫn lập đơn theo contract.
3. Không dùng mức giá đã hết hiệu lực làm bằng chứng cho ca này.

---

## 4. Ca âm (Negative test)

### Ca 1: Không đủ giá
- Chọn dữ liệu UAT có giá hết hiệu lực hoặc không có giá hợp lệ.
- Kết quả: Không lập đơn được (UI hiện "Sản phẩm không còn bán được hoặc không có giá hợp lệ")

### Ca 2: Tồn = 0
- Chọn sản phẩm được oracle xác nhận có tồn khả dụng bằng 0.
- Kết quả: Không lập đơn

---

## 5. Cách lấy Request ID & Biên bản

1. Sau khi lập đơn thành công:
   - Xem ở header response: `X-Request-ID`
   - Hoặc vào màn hình lịch sử đơn

**Biên bản dry-run này:**

| STT | Ca test | Kết quả | PASS/FAIL | Request ID | Ảnh |
|-----|---------|---------|-----------|------------|-----|
| 1   | CTBH cấu hình | Chưa chạy | PENDING | [điền sau khi chạy] | [đính kèm sau khi chạy] |
| 2   | CTBH note-text | Chưa chạy | PENDING | [điền sau khi chạy] | [đính kèm sau khi chạy] |
| 3   | Không CTBH | Chưa chạy | PENDING | [điền sau khi chạy] | [đính kèm sau khi chạy] |
| 4   | Giá hết hiệu lực | Chưa chạy | PENDING | [điền sau khi chạy] | [đính kèm sau khi chạy] |

**Kết luận hiện tại:** đây chỉ là bản nháp hướng dẫn. Chưa có dry-run độc lập và chưa đủ bằng chứng để kết luận `PASS` hoặc phát hành.

---

**Điều kiện phát hành:** điền release/commit đã deploy, tài khoản/phạm vi kiểm thử, bộ dữ liệu mới, người dry-run độc lập và kết quả có thể tái lập. Raw manifest chứa dữ liệu khách chỉ lưu cục bộ, không dùng làm artifact phát hành.
