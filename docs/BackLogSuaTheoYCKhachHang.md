# BACKLOG SỬA THEO YÊU CẦU KHÁCH HÀNG

**Ngày tổng hợp:** 21/08/2026  
**Phạm vi:** các yêu cầu khách hàng cần xử lý trước khi mở UAT rộng  
**Nguyên tắc:** sửa lỗi dễ thấy trước, xác minh bằng dữ liệu mới do đội test tạo, sau đó mới phát hành hướng dẫn và mở vòng góp ý.

## 1. Quy tắc xác minh và bằng chứng

Mỗi task chỉ được chuyển sang `DONE` khi có đủ:

- Tài khoản, môi trường, phiên bản và thời gian chạy.
- Input, bước tái hiện, kết quả thực tế và kết quả mong đợi.
- Ảnh/video thao tác; Network hoặc log phải che token và dữ liệu nhạy cảm.
- Request ID nếu request đã đi qua gateway.
- Kết quả đối chiếu API/DB khi task liên quan dữ liệu hoặc mutation.
- Tổng `PASS/FAIL/BLOCKED`; task bị chặn phải ghi rõ nguyên nhân và người cần phản hồi.

## 2. Tìm kiếm và chọn khách hàng

- [ ] **CUST-SEARCH-001 — Tái hiện lỗi chọn gợi ý khách hàng** · `P0` · `TODO`
  - **Phạm vi:** tách riêng bước nhập từ khóa, nhận gợi ý, chọn gợi ý và tải dữ liệu khách; đối chiếu `label`, `ObjectID`, payload và response.
  - **Xác minh:** tên đầy đủ, tên một phần, mã khách, khách trùng tên và khách mới do user tạo; kiểm tra context cũ và khả năng gửi tên thay cho `ObjectID`.
  - **Bằng chứng:** ảnh trước/sau khi chọn, Network request/response, request ID và báo cáo nguyên nhân gốc gắn code/API liên quan.
  - **Nghiệm thu:** tái lập được lỗi và chứng minh nguyên nhân cụ thể; không dùng kết luận chung “không tìm thấy”.

- [ ] **CUST-SEARCH-002 — Sửa autocomplete dùng đúng định danh khách** · `P0` · `BLOCKED_BY_CUST_SEARCH_001`
  - **Phạm vi:** lưu `ObjectID` làm giá trị nghiệp vụ; tên/mã/địa chỉ/SĐT chỉ để hiển thị. Sửa nội dung tìm kiếm phải xóa lựa chọn cũ; không tự chọn khi user chưa xác nhận.
  - **Xác minh:** chọn bằng chuột/Enter, chọn–xóa–chọn lại, tên có/không dấu, hai khách trùng tên, khách ngoài scope.
  - **Bằng chứng:** test mapping `label → ObjectID`, ảnh desktop/mobile, payload đúng `ObjectID` và request ID runtime.
  - **Nghiệm thu:** chọn gợi ý mở đúng khách và không còn báo “Không tìm thấy dữ liệu” do gửi sai định danh.

- [ ] **CUST-SEARCH-003 — Regression các màn hình sử dụng bộ chọn khách** · `P0` · `BLOCKED_BY_CUST_SEARCH_002`
  - **Phạm vi:** xem khách, lập đơn và các form khác dùng autocomplete; test click nhanh, retry, xóa từ khóa, API chậm/lỗi và danh sách nhiều dòng.
  - **Xác minh:** cùng input/cùng mốc dữ liệu cho kết quả nhất quán; không giữ khách của phiên hoặc tài khoản trước.
  - **Bằng chứng:** ma trận pass/fail, ảnh/video ca chính, request ID của ca thành công và ca âm.
  - **Nghiệm thu:** 100% ca P0/P1 pass, không gây regression luồng lập đơn.

## 3. Cấu hình giá trị tối thiểu CTBH

- [ ] **PROMO-CFG-001 — Chốt contract giá trị tối thiểu CTBH** · `P1` · `PENDING_BUSINESS_SIGN_OFF`
  - **Phạm vi:** xác nhận `min` theo tổng tiền, số lượng, giá trị dòng hay rule riêng; chốt VAT, chiết khấu, hàng tặng, trả hàng, làm tròn, ưu tiên và múi giờ hiệu lực.
  - **Xác minh:** ví dụ dưới/bằng/trên ngưỡng, hết hạn và hai CTBH xung đột; config phải có version, hiệu lực, trạng thái duyệt và scope.
  - **Bằng chứng:** business sign-off và bảng input → kết quả CTBH mong đợi.
  - **Nghiệm thu:** frontend, API, SQL và business dùng chung một contract; không hard-code ngưỡng.

- [ ] **PROMO-CFG-002 — Xây cấu hình min có phân quyền và audit** · `P1` · `BLOCKED_BY_PROMO_CFG_001`
  - **Phạm vi:** tài khoản được cấp quyền tạo version mới; không sửa trực tiếp version đã duyệt. Lưu người tạo/duyệt, thời gian, trước/sau và lý do.
  - **Xác minh:** thay config không build code; test config tương lai/hết hạn/thiếu/sai scope và tài khoản không có quyền. API tạo đơn phải kiểm tra lại phía server.
  - **Bằng chứng:** migration/config manifest, audit thay đổi, response trước/sau hiệu lực và test fail-closed.
  - **Nghiệm thu:** đổi `min` bằng config làm kết quả thay đổi đúng contract; payload giả không vượt kiểm tra server.

- [ ] **PROMO-CFG-003 — UAT min CTBH trên preview và đơn thật** · `P0` · `BLOCKED_BY_PROMO_CFG_002`
  - **Phạm vi:** chạy bộ ví dụ business ở preview và xác nhận tạo đơn; server không tin giá trị CTBH từ frontend.
  - **Xác minh:** dưới/bằng/trên ngưỡng, double-click, retry, config đổi giữa preview/xác nhận và chương trình hết hiệu lực.
  - **Bằng chứng:** ảnh preview, response tạo đơn, request ID, mã đơn rollback hoặc biên bản dọn dữ liệu và bảng kỳ vọng/thực tế.
  - **Nghiệm thu:** 100% ví dụ chuẩn pass; không áp sai CTBH hoặc tạo đơn trùng.

## 4. Workflow Sale tạo đơn → Kế toán duyệt

- [ ] **ORDER-APPROVAL-001 — Khảo sát workflow đơn hiện hành** · `P0` · `TODO`
  - **Phạm vi:** lập bảng trạng thái, transition, vai trò và procedure/bảng đang ghi; xác định đơn Sale tạo đang vào trạng thái nào và Kế toán duyệt ở đâu.
  - **Xác minh:** một đơn mới trong transaction rollback hoặc dữ liệu test có kế hoạch dọn; đối chiếu UI, API và DB cùng thời điểm.
  - **Bằng chứng:** sơ đồ hiện trạng, truy vấn trước/sau, request ID và danh sách chênh lệch với nghiệp vụ khách yêu cầu.
  - **Nghiệm thu:** có kết luận dựa trên runtime/DB; task khảo sát không tự thay đổi workflow.

- [ ] **ORDER-APPROVAL-002 — Chốt contract duyệt đơn** · `P0` · `BLOCKED_BY_ORDER_APPROVAL_001`
  - **Phạm vi:** chốt mapping `DRAFT/PREVIEW`, `PENDING_ACCOUNTING_APPROVAL`, `APPROVED`, `REJECTED`, `CANCELLED`; quyền tạo/gửi/duyệt/từ chối/hủy/sửa.
  - **Xác minh:** review transition dương/âm với Sale, Kế toán, quản trị; phân biệt cơ chế UAT tạm và workflow chính thức.
  - **Bằng chứng:** sign-off, ma trận `trạng thái × vai trò × thao tác` và mapping trạng thái ERP.
  - **Nghiệm thu:** không còn transition hoặc quyền chưa được business quyết định.

- [ ] **ORDER-APPROVAL-003 — Triển khai gửi duyệt và duyệt đơn** · `P0` · `BLOCKED_BY_ORDER_APPROVAL_002`
  - **Phạm vi:** Sale chỉ gửi chờ duyệt; Kế toán duyệt/từ chối đúng scope. Transition kiểm tra trạng thái hiện tại, có idempotency và audit cùng transaction.
  - **Xác minh:** thiếu quyền, sai trạng thái, double-click, retry, hai người duyệt đồng thời, lỗi DB và hết phiên.
  - **Bằng chứng:** test tự động, audit có actor/time/request ID/from/to/outcome, ảnh theo vai trò và DB đối chiếu.
  - **Nghiệm thu:** một thao tác hợp lệ tạo đúng một transition; Sale không tự duyệt và đơn không duyệt hai lần.

- [ ] **ORDER-APPROVAL-004 — UAT Sale tạo → Kế toán duyệt** · `P0` · `BLOCKED_BY_ORDER_APPROVAL_003`
  - **Phạm vi:** chạy bằng hai tài khoản tách biệt và dữ liệu mới do đội test tạo.
  - **Xác minh:** Sale tạo/gửi, Kế toán thấy và duyệt/từ chối, Sale xem kết quả; thêm ca sai chi nhánh và thiếu quyền.
  - **Bằng chứng:** video/chuỗi ảnh, mã đơn, hai tài khoản, request ID từng transition và audit/DB.
  - **Nghiệm thu:** luồng chính pass 100%; ca âm bị chặn đúng mã lỗi, không còn P0/P1 chưa chấp nhận.

## 5. Test bằng dữ liệu mới

- [ ] **CUSTOMER-UAT-001 — Xác minh không phụ thuộc dữ liệu mẫu** · `P0` · `TODO`
  - **Phạm vi:** liệt kê dữ liệu tối thiểu để khách/sản phẩm mới được tìm, có giá/tồn/CTBH và lập đơn; không tự sinh dữ liệu giả để làm test pass.
  - **Xác minh:** dùng định danh mới ngoài fixture/mock; quét mã test hard-code trong UI/API/SQL liên quan.
  - **Bằng chứng:** manifest dữ liệu do user tạo, kết quả tìm kiếm, trạng thái thiếu dữ liệu có nguyên nhân và báo cáo quét hard-code.
  - **Nghiệm thu:** dữ liệu mới hợp lệ chạy được; thiếu dữ liệu phải báo rõ thiếu giá, tồn, CTBH hay quyền.

- [ ] **CUSTOMER-UAT-002 — Chạy E2E bằng dữ liệu đội test tự tạo** · `P0` · `BLOCKED_BY_CUSTOMER_UAT_001`
  - **Phạm vi:** tạo dữ liệu → tìm/chọn khách → chọn sản phẩm → giá/tồn/CTBH → lập đơn → gửi duyệt → duyệt/từ chối.
  - **Xác minh:** ca thành công, thiếu giá, hết tồn, CTBH không hiệu lực và sai scope; dữ liệu UAT có nhãn và kế hoạch dọn.
  - **Bằng chứng:** manifest, ảnh/video, request ID, mã khách/sản phẩm/đơn và biên bản dọn hoặc xác nhận giữ.
  - **Nghiệm thu:** luồng business chính không phụ thuộc dữ liệu mẫu của đội phát triển.

## 6. Hướng dẫn và vòng góp ý

- [ ] **CUSTOMER-DOC-001 — Phát hành hướng dẫn UAT khách hàng** · `P1` · `BLOCKED_BY_STABLE_UAT_RUNTIME`
  - **Phạm vi:** đăng nhập, tìm/chọn khách, tạo dữ liệu test, lập đơn, CTBH, gửi duyệt, duyệt/từ chối và báo lỗi; ghi rõ quyền, giới hạn và cách lấy request ID.
  - **Xác minh:** người chưa tham gia phát triển chạy lại kịch bản chỉ bằng tài liệu.
  - **Bằng chứng:** tài liệu có version/môi trường/ngày, ảnh đúng runtime và biên bản dry-run.
  - **Nghiệm thu:** người test hoàn thành kịch bản mà không cần hướng dẫn miệng.

- [ ] **CUSTOMER-UAT-003 — Chạy test hẹp và thu feedback** · `P0` · `BLOCKED_BY_GUIDE_AND_CORE_FIXES`
  - **Phạm vi:** mở trước cho nhóm nhỏ; mỗi lỗi có account, thời gian, input, bước tái hiện, thực tế, mong đợi, ảnh/log và request ID.
  - **Xác minh:** đội kỹ thuật tái hiện độc lập trước khi phân loại `P0/P1/P2`.
  - **Bằng chứng:** file feedback chuẩn, tổng `PASS/FAIL/BLOCKED`, owner và liên kết bằng chứng.
  - **Nghiệm thu:** không còn lỗi chỉ ghi “không chạy”; mọi lỗi đủ thông tin để giao sửa.

- [ ] **CUSTOMER-UAT-004 — Regression sau khi xử lý feedback** · `P0` · `BLOCKED_BY_CUSTOMER_UAT_003`
  - **Phạm vi:** retest đúng ca lỗi và luồng liên quan trên bản deploy mới.
  - **Xác minh:** cùng account/input/mốc dữ liệu; kiểm tra sau refresh, đăng nhập lại và retry.
  - **Bằng chứng:** báo cáo runtime, manifest/version, ảnh/video, request ID và tổng pass/fail/blocked.
  - **Nghiệm thu:** không còn P0; P1 còn lại phải được business chấp nhận trước khi mở test rộng.

## 7. Khóa quyền/chức năng sau nghiệm thu

- [ ] **CUSTOMER-BIZ-001 — Làm rõ yêu cầu “khóa chức năng”** · `P1` · `PENDING_CUSTOMER_CLARIFICATION`
  - **Phạm vi:** hỏi rõ khóa config CTBH, tài khoản test, tạo dữ liệu, tạo đơn, duyệt đơn hay đóng băng phiên bản; chốt vai trò, thời điểm, ngoại lệ và người mở lại.
  - **Xác minh:** review tình huống vận hành và rollback với business owner.
  - **Bằng chứng:** sign-off và ma trận `vai trò × chức năng × trước/sau nghiệm thu`.
  - **Nghiệm thu:** thuật ngữ “khóa” được định nghĩa đầy đủ; task này chưa triển khai code.

- [ ] **CUSTOMER-SEC-001 — Triển khai khóa bằng cấu hình/phân quyền** · `P1` · `BLOCKED_BY_CUSTOMER_BIZ_001`
  - **Phạm vi:** dùng capability/role/config có version; không hard-code account hoặc xóa dữ liệu. Audit mọi lần khóa/mở/thay scope.
  - **Xác minh:** tài khoản được phép, bị khóa, ngoài scope và mở lại; dữ liệu cũ không mất hoặc đổi chủ.
  - **Bằng chứng:** manifest quyền trước/sau, audit và ảnh/API response ca dương/âm.
  - **Nghiệm thu:** đúng vai trò bị chặn, đúng vai trò còn quyền và rollback được bằng config.

- [ ] **CUSTOMER-SEC-002 — UAT âm chính sách khóa** · `P0` · `BLOCKED_BY_CUSTOMER_SEC_001`
  - **Phạm vi:** gọi UI/API bị khóa, sửa payload, dùng context cũ và retry; server phải chặn chứ không chỉ ẩn nút.
  - **Xác minh:** mã lỗi quyền nhất quán và không phát sinh mutation.
  - **Bằng chứng:** Network response, request ID, audit từ chối và truy vấn DB chứng minh không có dữ liệu ngoài ý muốn.
  - **Nghiệm thu:** 100% ca âm bị chặn, không mất dữ liệu và không có đường vòng qua API cũ.

## 8. Thứ tự thực hiện đề xuất

1. `CUST-SEARCH-001` → `CUST-SEARCH-003`.
2. `CUSTOMER-UAT-001` → `CUSTOMER-UAT-002`.
3. `ORDER-APPROVAL-001` → `ORDER-APPROVAL-004`.
4. `PROMO-CFG-001` → `PROMO-CFG-003` sau khi business sign-off.
5. `CUSTOMER-DOC-001` → `CUSTOMER-UAT-003` → `CUSTOMER-UAT-004`.
6. `CUSTOMER-BIZ-001` → `CUSTOMER-SEC-001` → `CUSTOMER-SEC-002` sau khi khách làm rõ phạm vi khóa.
