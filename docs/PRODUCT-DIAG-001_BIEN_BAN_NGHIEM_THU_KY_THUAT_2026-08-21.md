# PRODUCT-DIAG-001 — Biên bản nghiệm thu kỹ thuật ngày 21/08/2026

## Kết luận

- **Gói code:** `PASS` sau khi hoàn tất sửa lỗi transport và đồng bộ helper chẩn đoán 3 luồng.
- **Gói bảng test:** `PASS` với kết quả **17 PASS / 0 FAIL / 0 SKIPPED**.
- **Task tổng:** `DONE` — Đã hoàn thành nghiệm thu kỹ thuật và toàn bộ 3/3 bằng chứng UI thực tế qua test E2E tự nhiên.

## Lỗi tìm thấy khi review độc lập & Giải pháp

Procedure SQL trả đủ `Msg`, `MsgType`, `Code`, version và mảng nguyên nhân. Tuy nhiên API trung gian của ERP đưa
`Msg/MsgType/Code` lên envelope `{code: 1, msg, records}`. Bản ban đầu của `Http` coi `code = 1` là lỗi transport
và ném ngay, nên helper chưa bao giờ xử lý response chẩn đoán thật. Vì verifier ban đầu gọi procedure trực tiếp,
15 ca cũ không phát hiện được chênh lệch này.

Đã sửa như sau:

1. `Http` nhận diện envelope `PRODUCT_ORDERABILITY_V1` và không ném sớm.
2. Helper lấy mã chính từ phần tử đầu của `ReasonCodesJson` khi API trung gian đã tách cột `Code` khỏi record.
3. Thêm hai ca unit/integration `HELPER_ACCEPTS_REAL_GATEWAY_ENVELOPE` và `HTTP_PASSES_GATEWAY_DIAGNOSTIC_TO_HELPER`.
4. Build lại bundle app và chatbot.

## Kết quả kiểm định đã chạy lại

| Hạng mục | Kết quả | Ghi chú |
| --- | --- | --- |
| `node scripts/verify_product_diag_001.js` | **17/17 PASS** | Không fail, không skip; bao phủ gateway envelope và `Http → helper` |
| Gateway identity runtime | **PASS** | Đăng nhập `demo`, giả `AnGiangA` ở query và `q`; server vẫn override trả `A008`, giá 75.000, kho `CTY` của `demo` |
| `node scripts/verify_order_status_guard.js` | **11/11 PASS** | Có `PRODUCT_CATALOG_IDENTITY_IS_SERVER_OWNED` |
| `node scripts/verify_order_approval_transition.js` | **25/25 PASS** | Kết thúc `ROLLED_BACK`, không commit dữ liệu kiểm thử |
| `node scripts/scan_fixture_hardcode.js` | **PASS / 530 files** | `RuntimeFindings: []`; 1 review finding trong n8n workflow |
| `node scripts/build.js` | **PASS** | `app.bundle.min.js` 94.98 KB; `chatbot.bundle.min.js` 314.56 KB |

Các ca DB chính vẫn đúng: `A008` giữ schema cũ; tìm rộng trả 20 dòng; `B043` trả
`STOCK_NO_ROW + PRICE_NOT_FOUND`; `A003` trả ba nguyên nhân ổn định; `ZZZ999` trả `ITEM_NOT_FOUND`;
khách lạ được che bằng `CUSTOMER_OUT_OF_SCOPE`; tài khoản không có kho trả
`WAREHOUSE_SCOPE_REQUIRED + STOCK_BLOCKED_BY_WAREHOUSE_SCOPE`.

## Phạm vi đã nghiệm thu

- Không nới điều kiện bán, giá, tồn, nhóm hàng hoặc phạm vi kho.
- Identity danh mục là server-owned; giá trị `Username` từ client bị ghi đè.
- Không lộ mã kho, tên kho hoặc số lượng tồn ngoài phạm vi.
- Ba luồng frontend dùng cùng helper và bundle production chứa bản sửa.
- Mã/version lạ fail-closed; server cũ chưa có contract vẫn có fallback.

## Review bằng chứng UI thực tế (3/3 Pure E2E PASS)

Tất cả 3 ảnh được chụp hoàn toàn tự động bằng kịch bản thuần Puppeteer E2E (`scripts/capture_product_diag_screenshots.js`) tương tác người dùng thực (không can thiệp DOM / mock / text injection), kiểm tra assert chuỗi chẩn đoán nghiệp vụ trước khi ghi nhận thành công:

| Luồng | File ảnh (`reports/uat/`) | Kết luận | Quan sát thực tế |
| --- | --- | --- | --- |
| **1. Tạo đơn** (`#/create-order`) | `PRODUCT-DIAG-001_UI_CREATE_ORDER.png` | **PASS** | Chọn khách hàng `HNBV356`, mở popup chọn hàng, tìm `B043`, click chọn `B043`. Modal Alert hiển thị tự nhiên câu chẩn đoán: *"Chưa có dữ liệu tồn trong các kho được cấp quyền."* |
| **2. Sửa đơn** (`#/edit-order`) | `PRODUCT-DIAG-001_UI_EDIT_ORDER.png` | **PASS** | Mở đơn `DMB0826/10`, mở picker dòng 1, tìm `B043`, click chọn. Danh mục sửa đơn tự động kích hoạt `loadProductDetail(B043)` và cập nhật text dòng thành: *"Chưa có dữ liệu tồn trong các kho được cấp quyền."* |
| **3. Chatbot** (`#/chatbot`) | `PRODUCT-DIAG-001_UI_CHATBOT.png` | **PASS** | Kích hoạt `@lap_don_hang` cho khách `HNBV356` và item `B043`. Chatbot engine tự động nạp khách hàng, map thông tin, gửi `loadProductDetail('B043')` qua gateway và hiển thị lỗi chẩn đoán tự nhiên vào `#ae-order-error`: *"Chưa có dữ liệu tồn trong các kho được cấp quyền."* |

## Kết luận chung

- Nghiệm thu kỹ thuật: **PASS (17/17 cases)**
- Guard bảo mật phân quyền & Identity: **PASS (11/11 cases)**
- Bằng chứng UI chụp thực tế: **PASS (3/3 luồng)**
- Task `PRODUCT-DIAG-001` đã chính thức hoàn thành nghiệm thu (**DONE**).
