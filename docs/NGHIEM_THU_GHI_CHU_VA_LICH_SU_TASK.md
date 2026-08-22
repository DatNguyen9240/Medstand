# NGHIỆM THU, GHI CHÚ VÀ LỊCH SỬ TASK

**Cập nhật:** 21/08/2026
**Mục đích:** lưu trạng thái, bằng chứng, giới hạn kiểm thử và lịch sử quyết định. Danh sách việc đang cần làm nằm tại [BackLogSuaTheoYCKhachHang.md](BackLogSuaTheoYCKhachHang.md).

## 1. Quy tắc nghiệm thu

Một task chỉ được chuyển sang `DONE` khi có đủ:

- Tài khoản, môi trường, phiên bản và thời điểm chạy.
- Input, bước tái hiện, kết quả thực tế và kết quả mong đợi.
- Ảnh/video thao tác; log và Network phải che token/dữ liệu nhạy cảm.
- Request ID nếu request đi qua gateway.
- Đối chiếu API/DB nếu liên quan dữ liệu hoặc mutation.
- Tổng `PASS/FAIL/BLOCKED`; task bị chặn ghi rõ nguyên nhân và bên cần phản hồi.

## 2. Bảng trạng thái tổng hợp

| Task | Trạng thái hiện tại | Kết luận ngắn |
| --- | --- | --- |
| `CUST-SEARCH-001` | `DONE` | Đã tái hiện trước/sau, xác định nguyên nhân gốc và nghiệm thu E2E bằng Chrome thật |
| `CORE-011` | `DONE` | Đã nghiệm thu chọn khách ở màn lập/sửa đơn |
| `CUST-SEARCH-003` | `PARTIAL_PASS` | Có sequence guard; thiếu race E2E và các ca lỗi/scope |
| `PROMO-CFG-001` | `CODE_DONE_PENDING_REMAINING_BUSINESS_SIGN_OFF_AND_E2E` | Đã chốt và code `QUANTITY_GIFT` tỷ lệ + clamp max; các semantics tài chính còn mở |
| `PROMO-CFG-002` | `PARTIAL_VERIFIED` | Code/DB guard có; thiếu quyền âm, audit và API/UI E2E |
| `PROMO-CFG-003` | `BLOCKED` | Chờ contract và E2E tạo đơn thật |
| `ORDER-APPROVAL-001` | `DONE` | Khảo sát runtime/DB hoàn tất |
| `ORDER-APPROVAL-002` | `READY_FOR_BUSINESS_SIGN_OFF` | Ma trận quyết định chưa được business ký |
| `ORDER-APPROVAL-003` | `CHANGES_REQUIRED` | Review phát hiện lỗ hổng quyền, idempotency và race condition |
| `ORDER-APPROVAL-004` | `BLOCKED` | Chờ contract và triển khai an toàn |
| `CUSTOMER-UAT-001` | `PENDING_USER_DATA_E2E` | Readiness tool pass phần chạy được; chưa có chuỗi dữ liệu người dùng thật |
| `PRODUCT-DIAG-001` | `TECHNICALLY_ACCEPTED_PENDING_EVIDENCE` | Code 17/17; UI hợp lệ 2/3, thiếu Chatbot thật và live identity |
| `CUSTOMER-UAT-002` | `BLOCKED` | Chờ CUSTOMER-UAT-001 |
| `CUSTOMER-DOC-001` | `BLOCKED` | Chờ runtime UAT ổn định |
| `CUSTOMER-UAT-003` | `BLOCKED` | Chờ hướng dẫn và core fixes |
| `CUSTOMER-UAT-004` | `BLOCKED` | Chờ vòng feedback |
| `CUSTOMER-BIZ-001` | `PENDING_CUSTOMER_CLARIFICATION` | Chưa rõ phạm vi “khóa chức năng” |
| `CUSTOMER-SEC-001` | `BLOCKED` | Chờ CUSTOMER-BIZ-001 |
| `CUSTOMER-SEC-002` | `BLOCKED` | Chờ CUSTOMER-SEC-001 |

## 3. Task đã nghiệm thu `DONE`

### CUST-SEARCH-001 — Tái hiện lỗi chọn gợi ý khách hàng

- **Nghiệm thu:** 21/08/2026; môi trường local kết nối `medtest`, màn `#/edit-order`, so sánh bản trước sửa `ca6ce72` với bản sau sửa `2e9bfef` (chứa thay đổi `CORE-011` tại `74f6c53e`).
- **Kết quả trước sửa:** nhập số điện thoại không phát request tìm kiếm khách hàng và không có gợi ý (`0` request, `0` option).
- **Kết quả sau sửa:** phát đúng một request `API_KhachHangList` với `SearchText` là số điện thoại; gateway trả HTTP 200 với request ID `req-cust-search-001-after`; `data-value` bằng `ObjectID`, label bằng `DisplayName`; sau khi chọn, form tải đúng số điện thoại, địa chỉ và phường/xã.
- **Nguyên nhân gốc:** màn sửa đơn chưa cấu hình remote `searchFn`; SQL chưa tìm `SearchText` theo `Phone`; `FormSelect` trả sớm khi kết quả rỗng nên picker biến mất thay vì giữ empty-state.
- **Bằng chứng:** [biên bản chi tiết](CUST-SEARCH-001_BIEN_BAN_TAI_HIEN_VA_NGHIEM_THU_2026-08-21.md), JSON/ảnh/log tại `reports/uat/CUST-SEARCH-001/`; verifier `scripts/verify_cust_search_001_e2e.js` PASS.
- **Giới hạn:** race giữa nhiều request, API lỗi/retry, stale response và regression các màn hình khác tiếp tục thuộc `CUST-SEARCH-003`.

### CORE-011 — Sửa tìm kiếm và chọn khách hàng từ gợi ý

- **Nghiệm thu:** 21/08/2026.
- **Kết quả:** PASS màn lập đơn và sửa đơn; `xyz99999` giữ modal mở với trạng thái rỗng; `ONL1136` trả đúng khách; sau khi chọn, form map lại chi nhánh, tuyến, phường/xã, địa chỉ và SĐT.
- **Kỹ thuật:** option dùng `{ value: ObjectID, label: DisplayName }`, cache/deduplicate theo `ObjectID`; commit được ghi nhận là `74f6c53e`.
- **Giới hạn đã tách sang task khác:** Enter, chọn–xóa–chọn lại, trùng tên/ngoài scope, API chậm/lỗi và regression toàn màn hình thuộc `CUST-SEARCH-003`.

### ORDER-APPROVAL-001 — Khảo sát workflow đơn hiện hành

- **Nghiệm thu:** 21/08/2026.
- **Kết quả:** xác nhận `API_DonHangChiTiet_Insert_AI` tạo đơn ở `StatusID=0`; workflow ERP cũ chưa có điểm duyệt Kế toán an toàn được chứng minh.
- **Bằng chứng:** ca kiểm chứng đường cập nhật cũ dùng evidence ID `ORDER-APPROVAL-001-07d70ddd-3e75-47dc-ad1f-9acabd533dca` và rollback toàn bộ.
- **Tài liệu:** [ORDER-APPROVAL-001_KHAO_SAT_WORKFLOW_DON_HIEN_HANH_2026-08-21.md](ORDER-APPROVAL-001_KHAO_SAT_WORKFLOW_DON_HIEN_HANH_2026-08-21.md).

## 4. Task đã có kết quả kỹ thuật nhưng chưa `DONE`

### CUST-SEARCH-003

- Đã thêm `_loadSeq/requestSeq` để response cũ không ghi đè request mới ở `customer-management.js` và `contract-point.js`.
- Báo cáo trình duyệt có 5 ca PASS, nhưng chưa chứng minh cả hai request cùng tồn tại và request cũ hoàn tất sau request mới; video được nhắc tới chưa nằm trong workspace.

### PROMO-CFG-001/002/003

- Business chốt ngày 22/08/2026 cho `QUANTITY_GIFT`: gói `10+2` mua `5` tặng `1`; vượt `MaximumQuantity` thì clamp quyền lợi tại max (`80→8`, mua `100` vẫn tặng `8`), không loại rule/fallback note-text.
- Frontend, API đọc rule và SQL tạo đơn đã dùng contract `PROMOTION_BENEFIT_V2`; `verify_promo_cfg001_fixes.js` rollback PASS 6 nhóm: ma trận tỷ lệ, clamp max, giữ nguyên discount, deterministic tie-break và chặn quà khác SKU.
- Chưa được coi là E2E tạo đơn: script hiện kiểm helper/CTE, chưa có mutation API/UI thật với request ID.
- Điểm business còn mở: VAT, rule chiết khấu/giá trị, `MaximumOrderAmount`, trả hàng, làm tròn tiền và fallback khi quà tính ra bằng `0`.

### ORDER-APPROVAL-002/003/004

- Kiến trúc contract data-driven, audit và approval transition hiện hữu đã có bộ verifier rollback.
- Kết quả gần nhất: `verify_order_status_guard.js` 11/11; `verify_order_approval_transition.js` 25/25.
- `SUBMIT/CANCEL` hiện vẫn là dữ liệu `DRAFT`; verifier chỉ bật tạm trong transaction, không phải business sign-off.
- Review độc lập phát hiện các điểm chặn:
  - Ba CRUD cũ không nhận actor nên gateway chưa thể kiểm ownership/scope.
  - Bắt `Idempotency-Key` ở gateway không tạo idempotency server nếu proc không có ledger.
  - Tra trạng thái và mutation là hai request riêng, còn race condition.
  - Chủ đơn có thể hủy từ trạng thái đã duyệt vì rule owner chưa giới hạn `-1/0`.
  - `API_DonHang_StatusLookup_AI` được ghi là nội bộ nhưng chưa bị chặn khỏi generic gateway.
- Ca DB rollback đã chứng minh owner `NAMDINHB.MED` có thể hủy `DMB0726/1` từ `StatusID=1` sang `10`; thay đổi đã rollback.

### CUSTOMER-UAT-001

- `uat_data_readiness.js` phân biệt các lỗi item, customer, giá, tồn, kho và ba trạng thái CTBH; không seed dữ liệu.
- Kết quả được ghi nhận: 13 PASS / 0 FAIL / 2 SKIPPED. Hai ca skip là thiếu CTBH config active và thiếu actor-config user không phải manager global; không được tính là PASS.
- Hard-code scan gần nhất quét 529 file, `RuntimeFindings: []`; phạm vi scan chỉ bao phủ các token fixture đã khai báo.
- Chưa nghiệm thu E2E vì cấu hình actor/customer hiện gắn với `demo`; phải dùng tài khoản có `EmployeeID` và dữ liệu do người dùng tạo.

### PRODUCT-DIAG-001

- SQL/runtime có contract `PRODUCT_ORDERABILITY_V1`; các ca `B043`, `A003`, `ZZZ999`, customer ngoài scope và thiếu quyền kho trả đúng mã đã định nghĩa.
- `verify_product_diag_001.js`: 17 PASS / 0 FAIL / 0 SKIPPED. Hai ca mới về gateway là unit test dùng `fetch` giả và envelope dựng sẵn, không phải request gateway runtime.
- `verify_order_status_guard.js`: 11/11 PASS; build production PASS.
- Bằng chứng UI hợp lệ hiện tại:
  - Tạo đơn: PASS.
  - Sửa đơn: PASS.
  - Chatbot: **không chấp nhận**. Script tự gọi `Http/helper`, gán `textContent` và CSS vào DOM rồi chụp ảnh; ảnh còn hiện “Vui lòng chọn khách hàng trước.” nên state khách chưa được chọn thật.
- Trạng thái `DONE` ghi trước đây bị thu hồi. Trạng thái đúng là `TECHNICALLY_ACCEPTED_PENDING_CHATBOT_E2E_AND_LIVE_IDENTITY`.
- Biên bản kỹ thuật hiện còn mâu thuẫn giữa `PENDING_UI_EVIDENCE` và `DONE`; chỉ cập nhật lại sau khi có bằng chứng hợp lệ.

## 5. Ghi chú vận hành và bằng chứng

- Không lưu mật khẩu đăng nhập thật trong script test; dùng biến môi trường hoặc phiên đăng nhập do người kiểm thử chuẩn bị.
- Không ghi/copy artifact sang đường dẫn cá nhân ngoài workspace. Bằng chứng chuẩn nằm trong `reports/uat/`.
- Test UI không được tự gán nội dung hoặc style vào phần tử cần assert; phải thao tác qua cùng event/handler mà người dùng thật sử dụng.
- Tên test phải phản ánh đúng phạm vi: mock/fake envelope là unit test, không gọi là gateway runtime.
- Mọi mutation test trên `medtest` phải rollback hoặc có manifest dọn dữ liệu rõ ràng.

## 6. Tài liệu liên quan

- [Backlog việc cần làm](BackLogSuaTheoYCKhachHang.md)
- [Biên bản tái hiện và nghiệm thu CUST-SEARCH-001](CUST-SEARCH-001_BIEN_BAN_TAI_HIEN_VA_NGHIEM_THU_2026-08-21.md)
- [Biên bản kỹ thuật PRODUCT-DIAG-001](PRODUCT-DIAG-001_BIEN_BAN_NGHIEM_THU_KY_THUAT_2026-08-21.md)
- [Hướng dẫn chốt contract duyệt đơn](ORDER-APPROVAL-002_HUONG_DAN_CHOT_HOP_DONG_DUYET_DON.md)
- [Chuỗi dữ liệu tối thiểu CUSTOMER-UAT-001](CUSTOMER-UAT-001_CHUOI_DU_LIEU_TOI_THIEU.md)
