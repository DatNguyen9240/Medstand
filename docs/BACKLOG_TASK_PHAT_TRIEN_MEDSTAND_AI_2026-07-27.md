# Backlog task phát triển Medstand AI

**Ngày lập:** 27/07/2026  
**Nguồn:** `LO_TRINH_PHAT_TRIEN_MEDSTAND_AI_2026-07-27.md`  
**Mục đích:** Chuyển lộ trình phát triển thành danh sách công việc có thể phân công, thực hiện và nghiệm thu.  
**Trạng thái ban đầu:** Tất cả task bên dưới là `TODO`, trừ khi có bằng chứng mới được cập nhật trực tiếp vào tài liệu này.

---

## 1. Quy ước quản lý task

### Trạng thái

| Trạng thái | Ý nghĩa |
|---|---|
| `TODO` | Chưa bắt đầu hoặc chưa có bằng chứng thực hiện |
| `IN_PROGRESS` | Đang xử lý |
| `BLOCKED` | Không thể tiếp tục do thiếu dữ liệu, quyền hoặc quyết định nghiệp vụ |
| `READY_FOR_TEST` | Đã triển khai lên UAT và chờ kiểm thử |
| `DONE` | Đã đạt điều kiện nghiệm thu và có bằng chứng |

### Mức ưu tiên

| Mức | Ý nghĩa |
|---|---|
| `P0` | Ảnh hưởng trực tiếp đến việc khách hàng UAT hoặc an toàn hệ thống |
| `P1` | Chức năng nghiệp vụ quan trọng cần hoàn thiện sau vòng UAT đầu |
| `P2` | Nâng cấp trải nghiệm hoặc khả năng quản lý |
| `P3` | Năng lực dự báo và phát triển dài hạn |

### Quy tắc đánh dấu hoàn thành

Một task chỉ được chuyển sang `DONE` khi có đủ bằng chứng tương ứng:

- Source/config đã cập nhật và kiểm tra tĩnh đạt yêu cầu.
- Bản đúng đã được deploy/import lên UAT nếu task có thay đổi runtime.
- Test runtime đạt điều kiện nghiệm thu.
- Business owner xác nhận nếu task liên quan công thức nghiệp vụ.
- Không phát sinh lỗi nghiêm trọng trên luồng liên quan.

## 2. Giai đoạn 0 — Ổn định bản UAT

**Thời gian mục tiêu:** 28/07–10/08/2026  
**Gate hoàn thành:** `UAT_BASELINE_READY`

### Nhóm A — Khóa phiên bản và đồng bộ môi trường

- [x] **UAT-001 — Lập manifest release candidate UAT** · `P0` · `DONE`
  - Ghi rõ branch, commit SHA, phiên bản frontend và Service Worker cache.
  - Liệt kê chính xác các file SQL cần import theo thứ tự.
  - Liệt kê workflow n8n cần import, workflow ID đích và trạng thái Active mong đợi.
  - Ghi SHA-256 của các artifact quan trọng.
  - Đầu ra: một manifest duy nhất làm căn cứ cho deploy, kiểm tra runtime và rollback.
  - Nghiệm thu:
    - Manifest không dùng mô tả mơ hồ như “bản mới nhất”.
    - Mỗi artifact có đường dẫn, phiên bản/hash và thứ tự triển khai.
    - Manifest được khóa trước khi thực hiện `UAT-002`, `UAT-003` và `UAT-004`.
  - Kết quả xử lý 27/07/2026: đã tạo và khóa source manifest `../release/UAT_MANIFEST_2026-07-27_11.110.md` cho candidate `hoangdang@bfbaf7e092a10d4839f434427527e4c862b61796`, frontend `11.110`, cache `medstand-11.110`, SQL và n8n kèm SHA-256, deploy order, smoke test và rollback set.
  - Phạm vi `DONE`: hoàn tất manifest source candidate. Bằng chứng môi trường UAT chạy đúng manifest vẫn thuộc `UAT-002`, `UAT-003` và `UAT-004`.
  - Báo cáo nguyên nhân ban đầu: xem `UAT-001_MANIFEST_GAP_2026-07-27.md`.

- [ ] **UAT-002 — Deploy frontend UAT đồng bộ** · `P0` · `TODO`
  - Deploy bundle frontend theo manifest; kiểm tra cache/version và service worker.
  - Phụ thuộc: `UAT-001`.
  - Nghiệm thu: file runtime và version hiển thị khớp manifest; trình duyệt không còn tải bundle cũ.

- [ ] **UAT-003 — Import bộ SQL bắt buộc** · `P0` · `TODO`
  - Import đúng các stored procedure và metadata API thuộc bản UAT.
  - Phụ thuộc: `UAT-001`.
  - Nghiệm thu: script kiểm tra definition/hash hoặc ngày sửa xác nhận DB dùng đúng bản; không thiếu API bắt buộc.

- [ ] **UAT-004 — Import và publish workflow n8n** · `P0` · `TODO`
  - Import đúng workflow auth, intent parser, main chatbot và API service.
  - Xóa hoặc disable workflow/parser trùng sau khi xác định đúng bản active.
  - Phụ thuộc: `UAT-001`.
  - Nghiệm thu: mỗi webhook chỉ có một workflow active đúng; workflow runtime khớp file nguồn.

- [ ] **UAT-005 — Kiểm tra cấu hình endpoint và secret UAT** · `P0` · `TODO`
  - Xác minh app, n8n và SQL đều trỏ đúng môi trường `medtest`.
  - Thay credential viết cứng trong workflow upload bằng cơ chế secret/xác thực chuẩn.
  - Nghiệm thu: không có credential UAT/production được viết trực tiếp trong file public hoặc source workflow xuất bản.

### Nhóm B — Phân quyền và dữ liệu

- [ ] **UAT-006 — Kiểm tra đăng nhập 13 tài khoản** · `P0` · `TODO`
  - Kiểm tra trạng thái tài khoản, vai trò, chi nhánh và phiên đăng nhập.
  - Nghiệm thu: 13/13 tài khoản đăng nhập được hoặc có danh sách ngoại lệ được khách hàng xác nhận.

- [ ] **UAT-007 — Đối soát phạm vi khách hàng của 13 tài khoản** · `P0` · `TODO`
  - So sánh kết quả thực tế với `AR_GetObjectByUserFnc` và phạm vi quản lý.
  - Nghiệm thu: sale không xem được khách ngoài quyền; manager chỉ xem đúng phạm vi được cấp.

- [ ] **UAT-008 — Đối soát mapping kho CTY/DL02/DL03** · `P0` · `TODO`
  - Kiểm tra dữ liệu `SY_UserStoreHouseTbl` cho từng tài khoản và vai trò.
  - Nghiệm thu: mỗi tài khoản chỉ thấy tồn của các kho được cấp; có bảng mapping được business owner xác nhận.

- [ ] **UAT-009 — Chuẩn hóa dữ liệu mẫu theo tài khoản** · `P0` · `TODO`
  - Chọn khách hàng, sản phẩm, CTBH và tuyến mẫu có dữ liệu thật cho mỗi vùng/vai trò.
  - Không thay đổi dữ liệu khách hàng thật nếu chưa được phép.
  - Nghiệm thu: mỗi account có tối thiểu một bộ input chạy được các luồng thuộc quyền.

- [ ] **UAT-010 — Kiểm tra độ mới và ngày chốt dữ liệu** · `P0` · `TODO`
  - Xác định `AsOfDate`, múi giờ và quy tắc lấy ngày hệ thống cho dashboard/API.
  - Nghiệm thu: dữ liệu không tính vượt ngày truy vấn; UI hiển thị rõ ngày dữ liệu được chốt.

### Nhóm C — Kiểm thử runtime bắt buộc

- [ ] **UAT-011 — Test gợi ý đơn hàng** · `P0` · `TODO`
  - Test lịch sử mua, chu kỳ, mùa vụ, khuyến mãi, sản phẩm trọng tâm và tồn kho.
  - Nghiệm thu: kết quả có lý do hợp lệ, không lỗi 500, không gợi ý hàng hết hạn hoặc ngoài kho được cấp.

- [ ] **UAT-012 — Test tuyến và khách giảm mua** · `P0` · `TODO`
  - Test Top 5–8, ngưỡng 45 ngày, ngày báo động và phạm vi khách hàng.
  - Nghiệm thu: kết quả đúng rule đã công bố và không lọt khách ngoài quyền.

- [ ] **UAT-013 — Test chấm điểm khách hàng** · `P0` · `TODO`
  - Test nhóm A/B/C, risk 45/90 ngày và xu hướng doanh số.
  - Nghiệm thu kỹ thuật: API/UI chạy ổn định và hiển thị đủ trường.
  - Lưu ý: công thức cuối cùng được nghiệm thu tại `CORE-006`.

- [ ] **UAT-014 — Test tích lũy và upsell** · `P0` · `TODO`
  - Test mốc đã đạt, mốc tiếp theo, số còn thiếu, phần trăm tiến độ và đề xuất bán thêm.
  - Nghiệm thu: kết quả đối soát đúng với dữ liệu hóa đơn/trả hàng mẫu.

- [ ] **UAT-015 — Test tồn kho theo quyền** · `P0` · `TODO`
  - Test tồn vật lý, tồn khả dụng, lô hết hạn và phạm vi kho.
  - Nghiệm thu: số liệu khớp DB tại cùng thời điểm chốt và không lộ kho ngoài quyền.

- [ ] **UAT-016 — Test tra cứu sản phẩm và triệu chứng** · `P0` · `TODO`
  - Test tên, mã, giá, kiến thức sản phẩm, từ khóa/triệu chứng và disclaimer.
  - Nghiệm thu: không mô tả kết quả như chẩn đoán; trạng thái tồn kho phải được hiển thị trung thực.

- [ ] **UAT-017 — Test tạo khách hàng** · `P0` · `TODO`
  - Test validate, trùng số điện thoại/mã khách, phân quyền và kết quả trả về.
  - Chỉ sử dụng dữ liệu có tiền tố UAT được phép tạo.
  - Nghiệm thu: tạo đúng một bản ghi sau xác nhận; có thể truy vết người tạo.

- [ ] **UAT-018 — Test tạo đơn hàng** · `P0` · `TODO`
  - Test màn hình tạo đơn, khách hàng, sản phẩm, số lượng, giá, tồn và kết quả trả về.
  - Chỉ sử dụng dữ liệu UAT được phép tạo.
  - Nghiệm thu: tạo đúng một đơn, chi tiết đúng và không tạo trùng khi gửi lại request.

- [ ] **UAT-019 — Chạy regression hội thoại tự nhiên** · `P0` · `TODO`
  - Chạy bộ câu hỏi theo intent, tham số, hội thoại tiếp nối và các trường hợp thiếu dữ liệu.
  - Nghiệm thu: tối thiểu 95% test chính đạt; không có lỗi P0/P1 chưa được chấp nhận.

- [ ] **UAT-020 — Kiểm tra hiệu năng p50/p95** · `P0` · `TODO`
  - Đo riêng API thường và truy vấn AI phức tạp, không chỉ đo cảm nhận trên UI.
  - Nghiệm thu mục tiêu: truy vấn thường dưới 3 giây; truy vấn AI phức tạp dưới 6 giây ở p95 hoặc có ngoại lệ được ghi rõ.

- [ ] **UAT-021 — Kiểm tra lỗi trùng và kết quả không đồng nhất** · `P0` · `TODO`
  - Test gửi lặp, double-click, retry, context cũ và response nhiều bảng.
  - Nghiệm thu: mutation có idempotency; truy vấn lặp cùng input/cùng mốc dữ liệu cho kết quả nhất quán.

### Nhóm D — Báo cáo và bàn giao UAT

- [ ] **UAT-022 — Tổng hợp lỗi và phân loại P0/P1/P2** · `P0` · `TODO`
  - Mỗi lỗi phải có account, thời gian, input, kết quả thực tế, kết quả mong đợi, ảnh/log và request ID nếu có.
  - Nghiệm thu: không còn lỗi chỉ mô tả bằng câu “không chạy”.

- [ ] **UAT-023 — Phát hành báo cáo runtime mới** · `P0` · `TODO`
  - Thay thế bằng chứng cũ bằng kết quả test sau deploy theo manifest.
  - Nghiệm thu: báo cáo ghi rõ tổng pass/fail/blocked, phiên bản, môi trường và ngày chạy.

- [ ] **UAT-024 — Cập nhật tài liệu khách hàng sau vòng UAT** · `P1` · `TODO`
  - Cập nhật ảnh, câu lệnh mẫu, giới hạn và chức năng đã thay đổi.
  - Nghiệm thu: tài liệu khớp đúng UI và runtime đang được khách sử dụng.

## 3. Giai đoạn 1 — Hoàn thiện nghiệp vụ bán hàng cốt lõi

**Thời gian mục tiêu:** 11/08–15/09/2026  
**Gate hoàn thành:** `CORE_SALES_FLOW_READY`

- [ ] **CORE-001 — Thiết kế contract chat tạo khách hàng** · `P1` · `TODO`
  - Chốt trường bắt buộc, trường tùy chọn, validate, scope và response.
  - Nghiệm thu: có contract được frontend, n8n, SQL và business cùng sử dụng.

- [ ] **CORE-002 — Xây luồng thu thập thông tin tạo khách** · `P1` · `TODO`
  - AI hỏi lần lượt các trường còn thiếu và cho phép sửa trước khi xác nhận.
  - Phụ thuộc: `CORE-001`.
  - Nghiệm thu: câu tự nhiên hợp lệ dẫn đến bản xem trước đầy đủ, chưa ghi DB.

- [ ] **CORE-003 — Xây bước xác nhận và ghi khách hàng** · `P1` · `TODO`
  - Chỉ gọi endpoint tạo thật sau xác nhận rõ ràng.
  - Bổ sung kiểm tra trùng, idempotency, audit và mã kết quả.
  - Phụ thuộc: `CORE-002`.
  - Nghiệm thu: hủy hoặc chưa xác nhận không ghi dữ liệu; xác nhận chỉ tạo một bản ghi.

- [ ] **CORE-004 — Thiết kế contract chat lập đơn hàng** · `P1` · `TODO`
  - Chốt customer, item list, số lượng, kho, bảng giá, CTBH và response giỏ hàng.
  - Nghiệm thu: phân biệt rõ `preview`, `confirmed`, `created`, `failed`.

- [ ] **CORE-005 — Hoàn thiện luồng chat lập đơn** · `P1` · `TODO`
  - Thu thập thông tin, kiểm tra tồn/giá, hiển thị preview, xác nhận và tạo đơn thật.
  - Bổ sung idempotency và audit.
  - Phụ thuộc: `CORE-004`, `STOCK-001`.
  - Nghiệm thu: trả về mã đơn; gửi lặp không tạo đơn thứ hai.

- [ ] **CORE-006 — Chốt công thức phân nhóm A/B/C** · `P1` · `TODO`
  - Business owner chọn ngưỡng doanh số cố định, percentile hoặc mô hình kết hợp.
  - Ghi rõ khoảng dữ liệu, cách tính trung bình, trả hàng và khách không có lịch sử.
  - Nghiệm thu: có văn bản sign-off và bộ ví dụ chuẩn.

- [ ] **CORE-007 — Cập nhật API chấm điểm theo công thức được duyệt** · `P1` · `TODO`
  - Phụ thuộc: `CORE-006`.
  - Nghiệm thu: test case chuẩn của business pass 100%; risk vẫn được hiển thị độc lập với tier.

- [ ] **STOCK-001 — Bắt buộc kiểm tra tồn thật trong tư vấn sản phẩm** · `P1` · `TODO`
  - Thay trạng thái `PHYSICAL_STOCK_NOT_QUERIED` bằng truy vấn tồn theo quyền khi nghiệp vụ yêu cầu hàng còn tồn.
  - Nghiệm thu: kết quả ghi rõ kho, thời điểm cập nhật và tồn khả dụng; không gợi ý hàng không bán được.

- [ ] **CORE-008 — Chuẩn hóa lý do gợi ý bán hàng** · `P1` · `TODO`
  - Mỗi gợi ý hiển thị lần mua cuối, chu kỳ, ngày dự kiến, lý do và nguồn rule.
  - Nghiệm thu: người dùng hiểu được vì sao sản phẩm/khách được đề xuất.

- [ ] **CORE-009 — Thêm thao tác đưa gợi ý vào giỏ hàng** · `P1` · `TODO`
  - Cho phép chọn sản phẩm/số lượng và chuyển sang preview đơn.
  - Phụ thuộc: `CORE-004`, `STOCK-001`.
  - Nghiệm thu: dữ liệu sản phẩm và khách được truyền đúng, không tự tạo đơn.

- [ ] **CORE-010 — Regression toàn bộ luồng mutation** · `P0` · `TODO`
  - Test xác nhận, hủy, hết phiên, double-click, retry, thiếu quyền và lỗi DB.
  - Nghiệm thu: không có mutation ngoài ý muốn; mọi thao tác ghi đều có audit.

## 4. Giai đoạn 2 — Catalog và chương trình bán hàng

**Thời gian mục tiêu:** 16/09–31/10/2026  
**Gate hoàn thành:** `CATALOG_PROMOTION_READY`

- [ ] **CAT-001 — Chuẩn hóa schema tri thức sản phẩm** · `P1` · `TODO`
  - Chốt mã, tên, ảnh, thành phần, công dụng, đối tượng, cách dùng, chống chỉ định, nguồn và trạng thái duyệt.
  - Nghiệm thu: mỗi dữ liệu có nguồn và thời điểm cập nhật.

- [ ] **CAT-002 — Mapping ảnh catalog với mã sản phẩm** · `P1` · `TODO`
  - Chuẩn hóa định dạng, dung lượng và ảnh mặc định.
  - Nghiệm thu: ảnh đúng sản phẩm, không dùng tên file làm khóa duy nhất.

- [ ] **CAT-003 — Trả giá đúng theo bảng giá và khách hàng** · `P1` · `TODO`
  - Chốt quy tắc chọn bảng giá, hiệu lực và trường hợp không có giá.
  - Nghiệm thu: giá trên chatbot khớp màn hình lập đơn tại cùng thời điểm.

- [ ] **CAT-004 — Ghép tồn kho theo quyền vào catalog** · `P1` · `TODO`
  - Phụ thuộc: `STOCK-001`.
  - Nghiệm thu: hiển thị tồn khả dụng, kho và thời điểm cập nhật.

- [ ] **PROMO-001 — Thiết kế schema CTBH có hiệu lực** · `P1` · `TODO`
  - Bổ sung từ ngày, đến ngày, chi nhánh, nhóm user, sản phẩm, điều kiện và trạng thái duyệt.
  - Nghiệm thu: mô tả được CTBH tháng và chương trình phát sinh theo sự vụ.

- [ ] **PROMO-002 — Ghép CTBH hiện hành vào sản phẩm** · `P1` · `TODO`
  - Chỉ lấy chương trình còn hiệu lực và đúng phạm vi người dùng.
  - Phụ thuộc: `PROMO-001`.
  - Nghiệm thu: card sản phẩm hiển thị đúng CTBH; chương trình hết hạn không xuất hiện.

- [ ] **RAG-001 — Hoàn thiện upload Excel/PDF/ảnh** · `P1` · `TODO`
  - Validate loại file, kích thước, virus/malware policy và metadata nguồn.
  - Nghiệm thu: lỗi upload có thông báo rõ; tài liệu không được dùng trước khi duyệt.

- [ ] **RAG-002 — Xây màn hình xem trước và phê duyệt OCR** · `P1` · `TODO`
  - Cho phép sửa nội dung, approve/reject, lưu người duyệt và thời gian duyệt.
  - Nghiệm thu: chỉ bản `Approved` được chatbot sử dụng.

- [ ] **RAG-003 — Tự động hết hiệu lực và thu hồi tài liệu** · `P1` · `TODO`
  - Xử lý from/to date và thao tác thu hồi thủ công.
  - Nghiệm thu: nội dung hết hạn không còn được truy vấn hoặc thông báo.

- [ ] **NOTI-001 — Phân phối thông báo đúng người nhận** · `P1` · `TODO`
  - Lọc theo chi nhánh, nhóm sale, tài khoản và thời gian áp dụng.
  - Nghiệm thu: test dương/âm chứng minh người đúng được nhận và người ngoài phạm vi không nhận.

- [ ] **CAT-005 — Xây card catalog hợp nhất** · `P1` · `TODO`
  - Hiển thị ảnh + mã + tên + công dụng + giá + tồn + CTBH + thao tác tiếp theo.
  - Phụ thuộc: `CAT-002`, `CAT-003`, `CAT-004`, `PROMO-002`.
  - Nghiệm thu: đầy đủ trên mobile và desktop, có trạng thái thiếu dữ liệu rõ ràng.

- [ ] **CAT-006 — UAT catalog và CTBH** · `P0` · `TODO`
  - Đối soát theo sản phẩm mẫu, bảng giá, kho và phạm vi user.
  - Nghiệm thu: 100% bộ mẫu business đã duyệt trả đúng ảnh, giá, tồn và CTBH.

## 5. Giai đoạn 3 — Tối ưu tuyến và quản lý sale

**Thời gian mục tiêu:** 01/11–15/12/2026  
**Gate hoàn thành:** `ROUTE_OPTIMIZATION_PILOT`

- [ ] **ROUTE-001 — Rà soát dữ liệu tọa độ khách hàng** · `P2` · `TODO`
  - Đo tỷ lệ khách có tọa độ hợp lệ và quy trình bổ sung/sửa tọa độ.
  - Nghiệm thu: có báo cáo chất lượng và ngưỡng dữ liệu đủ để chạy Pilot.

- [ ] **ROUTE-002 — Chốt hàm điểm ưu tiên ghé khách** · `P2` · `TODO`
  - Kết hợp sắp hết hàng, giảm mua, gần đạt thưởng, giá trị tiềm năng và lịch tuyến.
  - Nghiệm thu: business owner duyệt trọng số và bộ ví dụ chuẩn.

- [ ] **ROUTE-003 — Tích hợp dịch vụ khoảng cách/thời gian** · `P2` · `TODO`
  - Đánh giá nhà cung cấp bản đồ, hạn mức, chi phí, cache và fallback.
  - Nghiệm thu: trả khoảng cách và thời gian ổn định cho dữ liệu Pilot.

- [ ] **ROUTE-004 — Xây thuật toán sắp xếp điểm ghé** · `P2` · `TODO`
  - Cân bằng điểm ưu tiên, vị trí, giờ làm việc và số điểm ghé tối đa.
  - Phụ thuộc: `ROUTE-001`, `ROUTE-002`, `ROUTE-003`.
  - Nghiệm thu: tuyến mẫu có thứ tự hợp lý và giải thích được.

- [ ] **ROUTE-005 — Ghi nhận kết quả ghé khách** · `P2` · `TODO`
  - Trạng thái: đã ghé, không gặp, hẹn lại, phát sinh đơn; kèm thời gian và ghi chú.
  - Nghiệm thu: sale cập nhật được, manager xem đúng phạm vi.

- [ ] **ROUTE-006 — Báo cáo hiệu quả tuyến** · `P2` · `TODO`
  - Đo lượt ghé, tỷ lệ hoàn thành, đơn phát sinh, doanh số và chuyển đổi.
  - Phụ thuộc: `ROUTE-005`.
  - Nghiệm thu: số liệu truy vết được về lượt ghé và đơn hàng.

- [ ] **ROUTE-007 — UAT tuyến tối ưu** · `P2` · `TODO`
  - Chạy thử với sale đại diện từng miền và thu nhận phản hồi.
  - Nghiệm thu: không làm tăng quãng đường bất hợp lý; business chấp nhận kết quả Pilot.

## 6. Giai đoạn 4 — Nhận diện đơn thuốc từ ảnh

**Thời gian mục tiêu:** 16/12/2026–15/01/2027  
**Gate hoàn thành:** `PRESCRIPTION_OCR_CONTROLLED_PILOT`

- [ ] **OCR-001 — Chốt phạm vi pháp lý và chuyên môn** · `P1` · `TODO`
  - Xác định rõ hệ thống chỉ trích xuất và hỗ trợ tra cứu, không chẩn đoán hoặc tự kê đơn.
  - Nghiệm thu: có disclaimer và quy trình phê duyệt sản phẩm thay thế/bán kèm.

- [ ] **OCR-002 — Thiết kế upload ảnh đơn thuốc** · `P2` · `TODO`
  - Hỗ trợ chụp/tải ảnh, kiểm tra định dạng, dung lượng và chất lượng ảnh.
  - Nghiệm thu: người dùng biết ảnh quá mờ hoặc không đủ điều kiện xử lý.

- [ ] **OCR-003 — Xây pipeline OCR đơn thuốc riêng** · `P2` · `TODO`
  - Trích xuất tên thuốc, hàm lượng, số lượng và confidence; không tái sử dụng prompt catalog như kết quả cuối.
  - Nghiệm thu: trả dữ liệu có cấu trúc và confidence trên bộ ảnh kiểm thử được duyệt.

- [ ] **OCR-004 — Xây màn hình xác nhận kết quả OCR** · `P1` · `TODO`
  - Cho phép sửa/xóa/thêm dòng trước khi đối chiếu sản phẩm.
  - Phụ thuộc: `OCR-003`.
  - Nghiệm thu: dữ liệu OCR chưa xác nhận không được đưa thẳng vào giỏ hàng.

- [ ] **OCR-005 — Xây bảng mapping thuốc và sản phẩm Medstand** · `P1` · `TODO`
  - Mapping phải có nguồn, người duyệt chuyên môn, hiệu lực và trạng thái.
  - Nghiệm thu: chỉ mapping đã duyệt được sử dụng.

- [ ] **OCR-006 — Đề xuất sản phẩm liên quan và bán kèm có kiểm soát** · `P1` · `TODO`
  - Ghép mapping với giá, tồn và CTBH; hiển thị lý do và cảnh báo.
  - Phụ thuộc: `OCR-004`, `OCR-005`, `CAT-005`.
  - Nghiệm thu: không tự động thay thế thuốc hoặc tạo đơn.

- [ ] **OCR-007 — Thiết lập chính sách lưu và xóa ảnh** · `P0` · `TODO`
  - Quy định quyền truy cập, mã hóa, thời gian lưu và xóa ảnh đơn thuốc.
  - Nghiệm thu: đáp ứng chính sách dữ liệu được phê duyệt; có audit truy cập.

- [ ] **OCR-008 — Đánh giá độ chính xác OCR** · `P1` · `TODO`
  - Tạo bộ test có nhãn và đo theo tên thuốc, hàm lượng, số lượng.
  - Nghiệm thu: đạt ngưỡng do business/chuyên môn phê duyệt; mẫu confidence thấp luôn yêu cầu kiểm tra tay.

## 7. Giai đoạn 5 — Dự báo và tối ưu CTKM

**Thời gian mục tiêu:** Từ 16/01/2027  
**Gate hoàn thành:** `PREDICTIVE_SHADOW_READY`

- [ ] **ML-001 — Audit dữ liệu lịch sử 6–12 tháng** · `P3` · `TODO`
  - Đánh giá độ đầy đủ của bán hàng, trả hàng, đơn hủy, giá, CTKM, tồn và tuyến.
  - Nghiệm thu: có data quality report và danh sách gap cần xử lý.

- [ ] **ML-002 — Chuẩn hóa định nghĩa nhãn và thời điểm dữ liệu** · `P3` · `TODO`
  - Chốt doanh số, mua lại 7/14/30 ngày, thiếu/dư tồn và hiệu quả CTKM.
  - Nghiệm thu: không dùng dữ liệu tương lai khi tạo feature/label.

- [ ] **ML-003 — Xây feature snapshot theo thời gian** · `P3` · `TODO`
  - Tạo dataset tái lập được theo khách, sản phẩm, sale và chi nhánh.
  - Phụ thuộc: `ML-001`, `ML-002`.
  - Nghiệm thu: chạy lại cùng mốc thời gian cho cùng kết quả.

- [ ] **ML-004 — Xây baseline rule và baseline thống kê** · `P3` · `TODO`
  - So sánh model mới với rule hiện tại, trung bình trượt và seasonal baseline.
  - Nghiệm thu: có metric baseline trước khi huấn luyện model phức tạp.

- [ ] **ML-005 — Model dự báo khả năng mua lại** · `P3` · `TODO`
  - Dự báo khách mua trong 7/14/30 ngày và hiệu chỉnh xác suất.
  - Phụ thuộc: `ML-003`, `ML-004`.
  - Nghiệm thu: vượt baseline theo metric và ngưỡng được duyệt.

- [ ] **ML-006 — Model dự báo doanh số** · `P3` · `TODO`
  - Dự báo theo sản phẩm, sale và chi nhánh với khoảng tin cậy.
  - Nghiệm thu: có backtest theo thời gian và so sánh với baseline.

- [ ] **ML-007 — Model cảnh báo tồn kho** · `P3` · `TODO`
  - Dự báo thiếu/dư tồn dựa trên bán, nhập, trả hàng và mùa vụ.
  - Nghiệm thu: cảnh báo có lead time và tỷ lệ đúng được theo dõi.

- [ ] **ML-008 — Đánh giá hiệu quả CTKM** · `P3` · `TODO`
  - Tách tăng trưởng tự nhiên khỏi phần tăng thêm do CTKM trong giới hạn dữ liệu cho phép.
  - Nghiệm thu: công bố rõ giả định, sai số và trường hợp không đủ dữ liệu.

- [ ] **ML-009 — Xây batch scoring và shadow mode** · `P2` · `TODO`
  - Chạy dự báo nhưng chưa tác động quyết định thật; lưu prediction và outcome.
  - Phụ thuộc: ít nhất một trong `ML-005`, `ML-006`, `ML-007` đạt gate kỹ thuật.
  - Nghiệm thu: theo dõi drift, độ chính xác, freshness và lỗi pipeline.

- [ ] **ML-010 — Controlled Pilot cho dự báo** · `P2` · `TODO`
  - Mở cho nhóm người dùng giới hạn, hiển thị confidence và lý do.
  - Nghiệm thu: có kế hoạch rollback, monitoring và business sign-off.

## 8. Task xuyên suốt toàn dự án

- [ ] **OPS-001 — Thiết lập release checklist** · `P0` · `TODO`
  - Bao gồm backup, deploy order, smoke test, rollback và người phê duyệt.

- [ ] **OPS-002 — Thiết lập log và request ID xuyên suốt** · `P0` · `TODO`
  - Cho phép truy vết từ UI → n8n → SQL mà không ghi dữ liệu nhạy cảm không cần thiết.

- [ ] **OPS-003 — Thiết lập dashboard uptime, lỗi và latency** · `P1` · `TODO`
  - Theo dõi success rate, HTTP 4xx/5xx, p50/p95 và workflow failure.

- [ ] **OPS-004 — Thiết lập quy trình backup/rollback** · `P0` · `TODO`
  - Kiểm tra khả năng rollback frontend, workflow và SQL theo manifest.

- [ ] **SEC-001 — Rà soát secret và file public** · `P0` · `TODO`
  - Không để credential, file cấu hình nhạy cảm hoặc tài liệu nội bộ truy cập công khai.

- [ ] **SEC-002 — Test phân quyền âm** · `P0` · `TODO`
  - Cố ý truy vấn khách, kho, chi nhánh và API ngoài quyền để xác nhận bị chặn.

- [ ] **SEC-003 — Audit mutation** · `P0` · `TODO`
  - Lưu người thực hiện, thời gian, request ID, loại thao tác và kết quả; không lưu secret.

- [ ] **DOC-001 — Duy trì ma trận yêu cầu ↔ chức năng ↔ test** · `P1` · `TODO`
  - Mỗi yêu cầu khách hàng phải liên kết được với API/UI, test case và trạng thái.

- [ ] **DOC-002 — Cập nhật tài liệu khách sau mỗi release** · `P1` · `TODO`
  - Ảnh, câu lệnh và giới hạn phải khớp bản runtime hiện hành.

- [ ] **METRIC-001 — Thu thập chỉ số sử dụng gợi ý** · `P2` · `TODO`
  - Đo lượt xem, lượt chọn, lượt đưa vào giỏ và chuyển thành đơn.

- [ ] **METRIC-002 — Báo cáo hiệu quả kinh doanh** · `P2` · `TODO`
  - Theo dõi doanh số/điểm bán, khách quay lại, giá trị upsell, tiến độ tích lũy và tồn cận date.

## 9. Các quyết định cần khách hàng xác nhận

Các mục dưới đây có thể làm block task kỹ thuật nếu chưa được chốt:

- [ ] **BIZ-001 — Công thức nhóm A/B/C** · Chốt ngưỡng tiền, percentile hoặc kết hợp.
- [ ] **BIZ-002 — Quy tắc khách giảm mua** · Chốt 45/90 ngày và ngoại lệ theo nhóm khách.
- [ ] **BIZ-003 — Cách tính tích lũy** · Chốt VAT, trả hàng, đơn hủy, phạm vi sản phẩm và mốc quà.
- [ ] **BIZ-004 — Sản phẩm trọng tâm** · Chốt file nguồn, thời gian hiệu lực và người cập nhật.
- [ ] **BIZ-005 — CTBH và bảng giá** · Chốt độ ưu tiên khi nhiều chương trình cùng hiệu lực.
- [ ] **BIZ-006 — Mapping kho** · Xác nhận CTY/DL02/DL03 cho từng sale/manager.
- [ ] **BIZ-007 — Nội dung y khoa** · Chỉ định người có chuyên môn duyệt mapping và bán kèm.
- [ ] **BIZ-008 — Chính sách dữ liệu ảnh đơn thuốc** · Chốt quyền truy cập và thời gian lưu.
- [ ] **BIZ-009 — KPI Pilot** · Chốt ngưỡng pass về độ chính xác, latency và hiệu quả kinh doanh.

## 10. Thứ tự thực hiện gần nhất

Để tránh mở quá nhiều hạng mục cùng lúc, thứ tự đề xuất sau ngày bàn giao sơ bộ là:

1. `UAT-001` → `UAT-005`: khóa và đồng bộ đúng bản UAT.
2. `UAT-006` → `UAT-010`: xác minh tài khoản, phạm vi, kho và dữ liệu mẫu.
3. `UAT-011` → `UAT-021`: chạy kiểm thử chức năng, mutation và hiệu năng.
4. `UAT-022` → `UAT-024`: tổng hợp lỗi, phát hành bằng chứng mới và cập nhật tài liệu.
5. Song song xin xác nhận `BIZ-001` → `BIZ-006` để không chặn Giai đoạn 1–2.
6. Sau khi đạt `UAT_BASELINE_READY`, thực hiện `CORE-001` → `CORE-010`.
7. Chỉ bắt đầu OCR và ML khi dữ liệu, pháp lý/chuyên môn và các gate trước đó đã đạt.

## 11. Điều kiện đóng từng giai đoạn

| Giai đoạn | Gate | Điều kiện tối thiểu |
|---|---|---|
| UAT | `UAT_BASELINE_READY` | 13 account đúng quyền, ≥95% test chính pass, không còn P0/P1 chưa chấp nhận |
| Nghiệp vụ lõi | `CORE_SALES_FLOW_READY` | Chat tạo khách/đơn có preview, confirm, idempotency và audit |
| Catalog/CTBH | `CATALOG_PROMOTION_READY` | Ảnh + giá + tồn + CTBH đúng phạm vi và hiệu lực |
| Tuyến | `ROUTE_OPTIMIZATION_PILOT` | Thứ tự ghé hợp lý, ghi nhận được kết quả và đo chuyển đổi |
| OCR | `PRESCRIPTION_OCR_CONTROLLED_PILOT` | OCR có xác nhận tay, mapping chuyên môn và chính sách dữ liệu |
| Dự báo | `PREDICTIVE_SHADOW_READY` | Dataset tái lập, vượt baseline và chạy shadow có monitoring |

---

## 12. Ghi chú cập nhật

- Không xóa task đã hoàn thành; chuyển sang `DONE` và gắn đường dẫn bằng chứng.
- Task bị chặn phải ghi nguyên nhân và người/đơn vị cần phản hồi.
- Khi roadmap thay đổi, cập nhật backlog này trước rồi mới thay đổi kế hoạch release.
- Các mốc thời gian là mục tiêu dự kiến và cần điều chỉnh theo phản hồi UAT, nguồn lực và chất lượng dữ liệu thực tế.
