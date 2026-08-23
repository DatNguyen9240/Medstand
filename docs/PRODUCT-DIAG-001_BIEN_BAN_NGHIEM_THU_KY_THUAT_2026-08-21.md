# PRODUCT-DIAG-001 — Biên bản nghiệm thu kỹ thuật

**Nghiệm thu ban đầu:** 21/08/2026

**Xác minh đóng task và vệ sinh evidence:** 23/08/2026

**Trạng thái:** `DONE`

## Kết luận

- Contract `PRODUCT_ORDERABILITY_V1` đã đồng bộ SQL, gateway, helper frontend và ba luồng UI.
- Verifier chính: **17 PASS / 0 FAIL / 0 SKIPPED**.
- Live Gateway identity: **5/5 PASS**; identity luôn lấy từ phiên đăng nhập, không tin `Username` do client gửi.
- Gateway guard: **22/22 PASS**.
- UI tạo đơn, sửa đơn và Chatbot: **3/3 PASS** qua chuỗi thao tác người dùng.
- Network Chatbot lấy `X-Request-ID` trực tiếp từ Gateway response và đối chiếu được với server log.
- Build production: **PASS**.
- Các kiểm tra chỉ đọc hoặc dùng transaction rollback; không để lại mutation test.

## Lỗi gốc và bản sửa

Procedure trả đủ `Msg`, `MsgType`, `Code`, version và mảng nguyên nhân, nhưng ERP đưa mã nghiệp vụ lên envelope. Lớp HTTP cũ coi envelope này là lỗi transport và ném trước khi helper chẩn đoán xử lý.

Bản sửa gồm:

1. Lớp HTTP nhận diện đúng envelope `PRODUCT_ORDERABILITY_V1`.
2. Helper chuẩn hóa mã chính và danh sách nguyên nhân ở cả shape SQL lẫn Gateway.
3. Mã/version lạ fail-closed; server cũ vẫn dùng thông báo fallback.
4. `API_HangHoaList_AI` dùng server-owned identity.
5. Ba luồng frontend dùng chung helper; bundle production đã được build lại.

## Kết quả kiểm định ngày 23/08/2026

| Lệnh | Kết quả |
| --- | --- |
| `node scripts/verify_product_diag_001.js` | `17/17 PASS` |
| `node scripts/verify_product_diag_001_gateway_identity.js` | `5/5 PASS` |
| `node scripts/verify_order_status_guard.js` | `22/22 PASS` |
| `node scripts/verify_order_approval_transition.js` | `25/25 PASS`, rollback |
| `node scripts/scan_fixture_hardcode.js` | `PASS`, không có runtime finding |
| `node scripts/build.js` | `PASS` |

Các nhánh nghiệp vụ chính vẫn đúng: sản phẩm hợp lệ giữ schema cũ; tìm rộng không đổi; thiếu giá/tồn, đa nguyên nhân, item không tồn tại, khách ngoài scope và thiếu quyền kho đều trả đúng contract; response ngoài scope không lộ mã kho hoặc số lượng tồn.

## Nghiệm thu UI

| Luồng | Kết quả | Cách kiểm |
| --- | --- | --- |
| Tạo đơn | PASS | Chọn khách và sản phẩm qua picker thật; UI hiển thị đúng câu chẩn đoán từ Gateway. |
| Sửa đơn | PASS | Mở form sửa, chọn sản phẩm qua picker và nhận đúng chẩn đoán; không bypass permission guard. |
| Chatbot | PASS | Click chip UI, nhập/chọn khách và sản phẩm trên panel; không gọi trực tiếp `ApiEngine.selectApi()` từ automation và không tự gán kết quả vào DOM. |

## Chính sách evidence

Ảnh, Network dump và JSON runtime có thể chứa tài khoản, mã khách hoặc dữ liệu giao dịch. Các artifact thô đã được review để nghiệm thu nhưng không được lưu trong Git:

- `.gitignore` loại JSON/ảnh/HAR/video dưới `reports/`.
- Server chặn truy cập trực tiếp `/reports/` và `/.tmp/`.
- Script live identity chỉ ghi nhãn vai trò đã khử định danh vào evidence cục bộ.
- Gateway trả correlation ID không chứa dữ liệu nghiệp vụ/định danh để ghép Network với log chính xác.
- Repo chỉ giữ biên bản Markdown tổng hợp này và verifier có thể chạy lại.

Task `PRODUCT-DIAG-001` đủ điều kiện đóng `DONE`.
