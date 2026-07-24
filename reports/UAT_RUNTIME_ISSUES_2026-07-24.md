# Nhật ký lỗi UAT runtime — 24/07/2026

Môi trường: `https://medtest.bms7.net/#/chatbot`
Release quan sát: `11.85`
Trạng thái tổng: `SOURCE_FIX_COMPLETE_RUNTIME_IMPORT_AND_RETEST_PENDING`

## UAT-TH-03 — Không nhận diện câu hỏi công việc hôm nay

- Mã tài liệu: `TH-03`
- Câu hỏi: `Hôm nay tôi nên làm gì?`
- Mong đợi: Gợi ý công việc/tuyến bán hàng phù hợp vai trò và phạm vi.
- Thực tế: `Tôi chưa hiểu rõ yêu cầu. Bạn có thể diễn đạt lại hoặc chọn một chức năng bên dưới.`
- Phân loại: Runtime intent routing.
- Mức ảnh hưởng: Cao — câu kiểm thử chung cho cả 13 tài khoản.
- Nguyên nhân đã xác nhận: Nhánh `UNKNOWN` trả lời trước khi QuickIntent registry ánh xạ câu này sang `@tuyen_ban_hang`.
- Đã sửa source: Nhận diện riêng nhóm câu công việc hôm nay thành `BUSINESS / SALES_ROUTE / @tuyen_ban_hang`; không mở rộng bắt mơ hồ cho toàn bộ câu `UNKNOWN`.
- Kiểm thử: 6 biến thể công việc hôm nay đều pass; câu vô nghĩa vẫn là `UNKNOWN`, câu thời tiết vẫn là `UNSUPPORTED`; bộ test hội thoại tĩnh đạt `137/137`, không có release-gate failure.
- Trạng thái: `SOURCE_FIXED_N8N_IMPORT_PENDING`.

## UAT-TH-04 — Sai khoảng ngày doanh số

- Mã tài liệu: `TH-04`
- Câu hỏi: `Doanh số từ 09/07/2026 đến 20/07/2026 của tôi là bao nhiêu?`
- Mong đợi: Khoảng thời gian `09/07/2026 → 20/07/2026` và tổng khớp bảng đối chiếu của tài khoản.
- Thực tế: Card `Doanh số đội ngũ` hiển thị `01/07/2026 → 24/07/2026`.
- Phân loại: Runtime entity/date parameter propagation.
- Mức ảnh hưởng: Cao — trả sai phạm vi thời gian và có thể dẫn đến sai tổng doanh số.
- Nguyên nhân đã xác nhận: Bộ phân loại nhận đúng `SALES_REVENUE` nhưng không tách hai ngày cụ thể thành `fromDate/toDate`. Parser dừng sớm, sau đó `LIB ValidateParams` coi ngày là thiếu và tự điền đầu tháng/đến hôm nay.
- Đã sửa source: Tách và kiểm tra khoảng ngày xác định trước khi ánh xạ sang `@TuNgay/@DenNgay`; không dùng giá trị mặc định khi câu hỏi đã cung cấp đủ hai ngày.
- Kiểm thử: Câu UAT trả `fromDate=2026-07-09`, `toDate=2026-07-20`; bộ test hội thoại tĩnh đạt `131/131`.
- Trạng thái: `SOURCE_FIXED_N8N_IMPORT_PENDING`.

## Ghi chú xử lý

- `UAT-TH-03`, `UAT-TH-04` và nhóm liên quan `UAT-TH-05` đã sửa ở source.
- Cần import/publish lại `MAIN_ChatBot_V5.json` và `AI_Intent_Parser.json`, sau đó chạy lại câu UAT trên runtime trước khi chuyển sang `RUNTIME_PASS`.
- `UAT-UI-01` đã sửa ở source; cần import/publish lại `API_Execute.json` và kiểm tra response tiếng Việt trên runtime.
- `UAT-API-01` đã sửa contract và khả năng chẩn đoán tại Node gateway; cần deploy bundle mới, cấu hình URL n8n theo môi trường, restart gateway và retest bằng `requestId`.
- Không chạy mutation và không chỉnh dữ liệu DB.
## UAT-TH-05 — Không nhận diện câu hỏi khách cần ghé hôm nay

- Mã tài liệu: `TH-05`
- Câu hỏi: `Hôm nay tôi nên ghé khách nào?`
- Mong đợi: Chỉ hiển thị khách hàng trong tuyến/phạm vi được giao và lý do chăm sóc dễ hiểu.
- Thực tế: `Tôi chưa hiểu rõ yêu cầu. Bạn có thể diễn đạt lại hoặc chọn một chức năng bên dưới.`
- Phân loại: Runtime intent routing.
- Mức ảnh hưởng: Cao — câu kiểm thử chung cho cả 13 tài khoản và liên quan trực tiếp đến tuyến/chăm sóc khách hàng.
- Nguyên nhân đã xác nhận: Câu hỏi tuyến bán hàng không được classifier nâng thành business intent trước nhánh `UNKNOWN`; QuickIntent registry không được thực thi.
- Liên quan: Cùng nhóm nguyên nhân với `UAT-TH-03`.
- Đã sửa source: Câu `Hôm nay tôi nên ghé khách nào?` và các biến thể cùng nhóm đã ánh xạ tới `@tuyen_ban_hang`.
- Kiểm thử: Đã nằm trong ma trận hồi quy `137/137` pass.
- Trạng thái: `SOURCE_FIXED_N8N_IMPORT_PENDING`.
## UAT-UI-01 — Nội dung tiếng Việt bị sai mã hóa

- Nội dung quan sát: `TÃ¬m tháº¥y 3 káº¿t quáº£.` thay vì `Tìm thấy 3 kết quả.`
- Phân loại: Encoding/renderer UI.
- Mức ảnh hưởng: Trung bình — dữ liệu vẫn hiển thị nhưng nội dung không thể chấp nhận khi bàn giao khách hàng.
- Nguyên nhân đã xác nhận: Bốn code node trong `API_Execute.json` đang lưu chuỗi UTF-8 đã bị giải mã nhầm theo Windows-1252, gồm cả thông báo, biểu thức phân loại lỗi và nội dung fallback.
- Đã sửa source: Khôi phục chuỗi tiếng Việt UTF-8 trong `Build Execute SQL`, `Format Execute Response`, `Enforce API Capability` và `Validate API Request`.
- Kiểm thử: JSON parse pass; 10 code node compile pass; không còn dấu hiệu mojibake `Ã/Ä/Æ`; các thông báo UTF-8 bắt buộc tồn tại; hồi quy hội thoại vẫn đạt `137/137`.
- Trạng thái: `SOURCE_FIXED_N8N_IMPORT_PENDING`.

## UAT-API-01 — Gateway trả HTTP 502 khi tải chi tiết

- Môi trường/release: `https://medtest.bms7.net`, bản `11.85`.
- Thực tế: Console báo `Failed to load resource: the server responded with a status of 502` tại `/api/gateway`.
- Phân loại: API gateway/upstream runtime.
- Mức ảnh hưởng: Cao — một phần dữ liệu hoặc thao tác chi tiết có thể không tải được dù các API trước đó trả `200`.
- Nguyên nhân gateway đã xác nhận:
  - Nhánh lỗi kết nối trong `/api/gateway` trả JSON thường, trong khi frontend luôn chờ trường `data` đã mã hóa; vì vậy frontend không đọc được `code`, `message` và `requestId` thật.
  - Địa chỉ n8n bị cố định ở `127.0.0.1:5678`, không ưu tiên cấu hình môi trường.
  - Request upstream chưa có thời gian chờ hữu hạn nên có thể treo lâu khi n8n hoặc mạng không phản hồi.
- Đã sửa source:
  - Ưu tiên `N8N_INTERNAL_URL`/`N8N_BASE`; địa chỉ localhost chỉ còn là giá trị mặc định cho môi trường local.
  - Thêm timeout upstream cấu hình bằng `GATEWAY_UPSTREAM_TIMEOUT_MS`, mặc định 30 giây.
  - Chuẩn hóa mã lỗi `UPSTREAM_TIMEOUT`, `UPSTREAM_CONNECTION_FAILED`, `UPSTREAM_UNAVAILABLE`; mọi phản hồi lỗi của `/api/gateway` đều giữ đúng envelope mã hóa và có `requestId`.
  - Frontend giải mã lỗi cho cả request `GET` và `POST`, thay vì chỉ hiện `Gateway error: 502`.
  - Log chỉ ghi metadata an toàn gồm `requestId`, đích upstream, thời gian xử lý và mã lỗi; không ghi token hoặc payload nghiệp vụ.
- Kiểm thử source: `server.js` và API engine parse pass; frontend build pass; mô phỏng upstream mất kết nối trả đúng `UPSTREAM_CONNECTION_FAILED`, mô phỏng upstream treo trả đúng `UPSTREAM_TIMEOUT`; cả hai đều trả HTTP `502` và giữ nguyên `requestId`; hồi quy hội thoại đạt `137/137`.
- Còn phải xác minh runtime: restart Node gateway, gọi lại thao tác gây lỗi và dùng `requestId` để đối chiếu log/n8n execution. Bằng chứng hiện có chưa đủ kết luận upstream cụ thể nào đã gây ra lần 502 ban đầu.
- Trạng thái: `SOURCE_FIXED_GATEWAY_RESTART_AND_RUNTIME_RETEST_PENDING`.

## UAT-UI-02 — Card chi tiết công nợ bị trả lặp

- Câu hỏi quan sát: `Khách NDB001 đang nợ bao nhiêu?`, sau đó `Chi tiết công nợ khách NDB001`.
- Thực tế: Hai card `Quầy thuốc tân dược` hiển thị gần như giống hệt nhau liên tiếp, cùng tổng công nợ `6.445.000` và cùng thời điểm truy vấn.
- Kết quả rà soát source: Đây là hai yêu cầu riêng biệt và cả hai đều được thiết kế ánh xạ về cùng API chuẩn `@cong_no_chi_tiet`, nên hai kết quả giống nhau chưa chứng minh renderer đã nhân đôi một request.
- Không áp dụng khử trùng theo nội dung card vì có thể xóa nhầm lịch sử hợp lệ khi người dùng chủ động hỏi lại cùng dữ liệu.
- Đã bổ sung bảo vệ source theo `requestId`: cùng một response bị phát lại chỉ được render một card; hai câu hỏi riêng có `requestId` khác nhau vẫn được giữ đầy đủ trong lịch sử.
- `requestId` của card được lưu cùng lịch sử hội thoại và được khôi phục khi tải lại trang, tránh render lại cùng response sau khi giao diện khởi tạo lại. Bộ nhớ ID được giới hạn 100 phần tử.
- Kiểm thử source: xác nhận cả luồng chat tự nhiên và luồng gọi trực tiếp bằng `@` đều chuyển `requestId` vào renderer; JavaScript parse và frontend build pass.
- Cách xác minh runtime còn lại: Sau khi triển khai gateway và frontend mới, đối chiếu log `DUPLICATE_RESPONSE_SUPPRESSED` nếu upstream phát lại cùng một `requestId`.
- Phân loại: Đã có cơ chế chống render trùng theo định danh request; không khử trùng theo nội dung nghiệp vụ.
- Mức ảnh hưởng: Trung bình.
- Trạng thái: `SOURCE_GUARD_FIXED_FRONTEND_DEPLOY_AND_RUNTIME_RETEST_PENDING`.

## UAT-SP-01 — Không trả được thông tin sản phẩm A003

- Câu hỏi: `Thông tin sản phẩm A003`.
- Thực tế: `Xin lỗi, tôi không thể phản hồi lúc này. Vui lòng thử lại sau.`
- Bằng chứng tái kiểm thử: Runtime `medtest` lúc `15:17` ngày 24/07/2026 vẫn trả đúng thông báo lỗi chung trên; chưa có card thông tin sản phẩm.
- Mong đợi: Trả thông tin sản phẩm A003 hoặc thông báo rõ sản phẩm không tồn tại.
- Phân loại: Product lookup/runtime API.
- Mức ảnh hưởng: Cao — chức năng tra cứu sản phẩm không hoàn thành và thông báo lỗi không nêu nguyên nhân.
- Nguyên nhân source đã xác nhận: Classifier chỉ nhận mẫu có động từ `tìm/tra cứu`, vì vậy câu `Thông tin sản phẩm A003` và câu rút gọn `Sản phẩm A003` không được ánh xạ sang `@tra_cuu_san_pham`.
- Đã sửa source: Bổ sung mẫu `thông tin/xem sản phẩm` và mẫu `sản phẩm + mã ERP`; vẫn giữ `sản phẩm trọng tâm` ở API riêng.
- Kiểm thử: Ba câu `Thông tin sản phẩm A003`, `Tìm sản phẩm A003`, `Sản phẩm A003` đều trả `PRODUCT_SEARCH / @tra_cuu_san_pham / searchTerm=A003`; hồi quy tĩnh đạt `142/142`.
- Còn phải xác minh runtime: Hồ sơ ngày 21/07 từng ghi câu chuẩn `Tìm sản phẩm A003` nhận body rỗng/không hợp lệ. Lần tái kiểm thử ngày 24/07 xác nhận lỗi vẫn tồn tại nhưng ảnh không có `requestId`; cần đối chiếu response gateway, n8n execution và SQL bằng cùng `requestId` trước khi xác định tầng gây lỗi.
- Trạng thái: `SOURCE_ROUTING_FIXED_RUNTIME_STILL_FAILING_ROOT_CAUSE_PENDING`.

## UAT-TK-01 — Tồn kho A003 có hai dòng mâu thuẫn và thiếu ngữ cảnh kho

- Câu hỏi: `Tồn kho sản phẩm A003`.
- Thực tế: Trả hai dòng cùng mã `A003`, cùng tên sản phẩm; `Tồn ERP` lần lượt là `-4` và `4`, trong khi `Tồn khả dụng tham khảo` đều là `0`.
- Mong đợi: Phân biệt rõ từng kho/chi nhánh/lô nếu đây là các bản ghi khác nhau; nếu cùng phạm vi thì chỉ trả một số liệu đã đối soát.
- Phân loại: Data aggregation/rendering context.
- Mức ảnh hưởng: Cao — người dùng không xác định được số tồn đúng để sử dụng.
- Liên quan: Tiêu đề kết quả trong cùng card vẫn bị lỗi mã hóa như `UAT-UI-01`.
- Kết quả rà soát SQL: Procedure chủ động nhóm theo `StoreHouseID`, `StoreHouseName`, `BranchID`, `Lot`, `ExpireDate`. Hai số `-4` và `4` có thể là hai kho/lô khác nhau; chưa có bằng chứng DB bị trùng hoặc sai.
- Nguyên nhân hiển thị đã xác nhận: Bảng tổng quát ưu tiên mã/tên sản phẩm và số tồn, còn kho/lô bị đẩy vào phần mở rộng nên hai dòng nhìn như mâu thuẫn.
- Đã sửa source UI: Riêng `@danh_sach_tonkho` luôn đưa `Tên kho` và `Số lô` ra bảng chính cùng mã, tên sản phẩm và hai số tồn; các trường chi tiết còn lại vẫn nằm trong phần mở rộng.
- Kiểm thử source: Frontend build pass, JavaScript parse pass và bundle production đã được sinh lại.
- Trạng thái: `SOURCE_UI_FIXED_FRONTEND_DEPLOY_AND_RUNTIME_DATA_RETEST_PENDING`.

## UAT-SALE-01 — Không tải được danh sách khách thuộc tuyến

- Mã tài liệu: `SALE-01`.
- Câu hỏi: `Cho tôi danh sách khách thuộc tuyến của tôi`.
- Mong đợi: Chỉ trả danh sách khách hàng được giao cho tài khoản đang đăng nhập.
- Thực tế: `Xin lỗi, tôi không thể phản hồi lúc này. Vui lòng thử lại sau.`
- Phân loại: Route/customer scope runtime API.
- Mức ảnh hưởng: Cao — chức năng nghiệp vụ chính của tài khoản sale không sử dụng được.
- Nguyên nhân source đã xác nhận: Các mẫu `khách thuộc tuyến`, `khách trong tuyến` chưa nằm trong classifier; câu UAT không được ánh xạ sang `@tuyen_ban_hang`.
- Đã sửa source: Bổ sung riêng nhóm câu danh sách khách thuộc/trong tuyến, không mở rộng sang mọi câu có chữ `khách`.
- Kiểm thử: Ba biến thể tuyến đều trả `SALES_ROUTE / @tuyen_ban_hang`; hồi quy tĩnh đạt `142/142`.
- Còn phải xác minh runtime: Import/publish hai workflow mới và kiểm tra kết quả bằng tài khoản sale thật. Procedure vẫn phải tự giới hạn khách theo quyền; chưa gọi runtime pass trước khi có kết quả tài khoản UAT.
- Ghi chú DB: Chưa kết luận do dữ liệu hoặc mapping DB; chưa truy vấn/chỉnh DB.
- Trạng thái: `SOURCE_ROUTING_FIXED_N8N_IMPORT_AND_SCOPED_RUNTIME_RETEST_PENDING`.

## UAT-TH-06 — Gợi ý công việc hôm nay chưa phù hợp vai trò

- Câu hỏi: `Hôm nay tôi nên làm gì?`
- Thực tế quan sát lúc `15:14` ngày 24/07/2026: Hệ thống trả một bảng 8 khách hàng và trường `Trạng thái dữ liệu ghé`, chủ yếu có giá trị `Chưa có dữ liệu ghé`.
- Vấn đề: Hệ thống đã nhận diện được câu hỏi nhưng mới chuyển thẳng sang danh sách tuyến. Kết quả chưa phải danh sách công việc ưu tiên, chưa giải thích lý do và chưa thay đổi theo vai trò Sale/Manager/Admin.
- Yêu cầu nghiệp vụ:
  - Không chỉ yêu cầu người dùng nói rõ hơn hoặc trả một bảng dữ liệu thô.
  - Sale nhận các việc có thể hành động ngay trong phạm vi được giao, ví dụ: khách cần ghé, khách lâu chưa mua, khách có nợ cần theo dõi, đơn cần xử lý và cơ hội bán thêm có đủ dữ liệu.
  - Manager nhận góc nhìn tổng quát hơn, ví dụ: nhân viên/tuyến cần chú ý, khách rủi ro, công nợ nổi bật, doanh số và các ngoại lệ cần kiểm tra.
  - Admin chỉ nhận các gợi ý nghiệp vụ trong phạm vi được cấp; không tự mở rộng quyền dữ liệu.
  - Mỗi gợi ý phải có lý do dễ hiểu và hành động tiếp theo; không hiển thị mã quy tắc kỹ thuật.
- Phân loại: Role-aware task recommendation / conversational orchestration.
- Mức ảnh hưởng: Cao — đây là điểm vào tự nhiên quan trọng của trợ lý nghiệp vụ cho cả 13 tài khoản thử nghiệm.
- Tiêu chí nghiệm thu tối thiểu:
  - Xác định vai trò từ danh tính đã xác thực, không tin vai trò do client tự gửi.
  - Trả tối đa một danh sách ngắn các việc ưu tiên, có lý do và nút/câu lệnh tiếp theo.
  - Không có dữ liệu thì nói rõ nhóm dữ liệu nào chưa có; không biến `Chưa có dữ liệu ghé` thành kết luận khách không cần ghé.
  - Kết quả của Sale và Manager phải khác nhau đúng mục tiêu sử dụng.
- Đã sửa source:
  - Câu hỏi công việc hôm nay được ánh xạ tới tuyến bán hàng với tối đa 8 khách ưu tiên.
  - Phạm vi dữ liệu tiếp tục được xác định bằng tài khoản đã xác thực tại backend/SQL; frontend không nhận vai trò tự khai từ client.
  - Bảng chính chỉ còn các thông tin dễ hiểu: khách hàng, lý do cần chăm sóc, số ngày chưa mua và lịch ghé.
  - Phần mở rộng trình bày lần mua cuối, số ngày chưa mua, lịch tuyến, người phụ trách, lý do và việc nên làm tiếp theo; không hiển thị mã quy tắc kỹ thuật.
  - Khách mới, khách lâu chưa mua và khách theo lịch tuyến có lời khuyên hành động khác nhau. Manager/Admin nhận phạm vi tổng hợp theo quyền backend; Sale chỉ nhận khách trong phạm vi được giao.
- Kiểm thử source: Classifier `52/52` pass; ma trận hội thoại `145/145` pass, không có release-gate failure; JavaScript parse và frontend build pass.
- Trạng thái: `SOURCE_FIXED_N8N_IMPORT_FRONTEND_DEPLOY_AND_ROLE_RUNTIME_RETEST_PENDING`.

## UAT-UPSELL-01 — Gợi ý bán kèm cho NDB001 trả lỗi chung

- Câu hỏi: `Gợi ý bán kèm cho khách NDB001`.
- Thực tế quan sát lúc `15:16` ngày 24/07/2026: `Xin lỗi, tôi không thể phản hồi lúc này. Vui lòng thử lại sau.`
- Mong đợi: Trả gợi ý bán kèm theo lịch sử mua hợp lệ của NDB001 hoặc trả lý do nghiệp vụ cụ thể khi chưa đủ dữ liệu; không trả lỗi chung.
- Phân loại: Upsell runtime API / response error handling.
- Mức ảnh hưởng: Cao — người dùng không phân biệt được thiếu dữ liệu, ngoài phạm vi hay lỗi hệ thống.
- Nguyên nhân source đã xác nhận: Mẫu câu bán kèm theo khách chưa được ưu tiên đúng trước nhánh fallback nên runtime có thể không gọi capability `@upsell_goi_y`.
- Đã sửa source: Các câu `Gợi ý bán kèm cho khách NDB001` và biến thể tương đương ánh xạ tới `UPSELL / @upsell_goi_y`, trích đúng `customerId=NDB001`; vẫn giữ yêu cầu bắt buộc mã khách.
- Kiểm thử source: Nằm trong bộ classifier `52/52` và ma trận hội thoại `145/145` pass.
- Còn phải xác minh runtime: Import/publish workflow mới rồi đối chiếu `requestId`, HTTP status, n8n execution và response SQL. Nếu API trả thiếu lịch sử thì phải hiển thị lý do nghiệp vụ, không trả lỗi chung.
- Trạng thái: `SOURCE_ROUTING_FIXED_N8N_IMPORT_AND_RUNTIME_RETEST_PENDING`.

## UAT-CTX-01 — Câu tiếp nối “chi tiết đi” bị mất ngữ cảnh

- Chuỗi hội thoại:
  1. `Khách NDB001 đang nợ bao nhiêu?`
  2. Hệ thống trả đúng card công nợ của NDB001.
  3. Người dùng hỏi tiếp `chi tiết đi`.
- Thực tế quan sát lúc `15:16` ngày 24/07/2026: `Tôi chưa hiểu rõ yêu cầu. Bạn có thể diễn đạt lại hoặc chọn một chức năng bên dưới.`
- Mong đợi: Hệ thống giữ ngữ cảnh khách hàng `NDB001` và chủ đề `công nợ`, sau đó mở/trả chi tiết công nợ tương ứng.
- Phân loại: Conversational context / follow-up intent.
- Mức ảnh hưởng: Cao — làm đứt luồng hội thoại tự nhiên dù API trước đó đã trả dữ liệu đúng.
- Đã sửa source:
  - Workflow đọc lịch sử hội thoại do frontend gửi và lấy intent/API, tham số cùng đối tượng gần nhất.
  - Sau card công nợ của NDB001, câu `chi tiết đi` được ánh xạ lại tới `@cong_no_chi_tiet` với `customerId=NDB001`.
  - Chỉ tái sử dụng đối tượng khi lịch sử có một ngữ cảnh rõ ràng; câu tiếp nối không có ngữ cảnh vẫn được hỏi lại, không tự đoán.
- Kiểm thử source: Có cả tình huống tiếp nối có ngữ cảnh và không có ngữ cảnh trong bộ `145/145` pass.
- Trạng thái: `SOURCE_FIXED_N8N_IMPORT_AND_RUNTIME_RETEST_PENDING`.

## UAT-SALE-02 — Không nhận diện câu hỏi khách lâu chưa mua

- Mã tình huống trong kế hoạch kiểm thử: `SALE-02`.
- Câu hỏi: `Khách nào lâu chưa mua?`
- Thực tế quan sát lúc `15:20` ngày 24/07/2026: `Tôi chưa hiểu rõ yêu cầu. Bạn có thể diễn đạt lại hoặc chọn một chức năng bên dưới.`
- Mong đợi:
  - Nhận diện đây là yêu cầu tìm khách cần chăm sóc do lâu chưa phát sinh mua hàng.
  - Chỉ trả khách thuộc tuyến/phạm vi của tài khoản đã xác thực.
  - Hiển thị tên khách, lần mua cuối, số ngày chưa mua và lý do dễ hiểu.
  - Không hiển thị điểm hoặc mã thuật toán kỹ thuật.
- Phân loại: Natural-language intent routing / scoped customer care.
- Mức ảnh hưởng: Cao — đây là câu kiểm thử chính thức dành cho tài khoản Sale và là dữ liệu đầu vào của gợi ý công việc hôm nay.
- Nguyên nhân source đã xác nhận: Câu ngắn trong UAT không được bộ phân loại deterministic nâng thành business intent trước nhánh `UNKNOWN`; few-shot không phải đường chạy bảo đảm.
- Đã sửa source:
  - Các biến thể `Khách nào lâu chưa mua?`, `khách lâu rồi chưa mua`, `ai đã lâu không đặt hàng` và `khách nào cần chăm sóc vì lâu chưa mua` ánh xạ tới `@tuyen_ban_hang`.
  - Tham số `@SoNgayVangMat=30` được truyền xuống API; kết quả tiếp tục bị giới hạn theo tài khoản đã xác thực.
  - UI hiển thị tên khách, lần mua cuối, số ngày chưa mua, lý do và việc nên làm; không hiển thị điểm/mã thuật toán.
- Kiểm thử source: Các biến thể định tuyến pass; ma trận hội thoại `145/145` pass.
- Trạng thái: `SOURCE_FIXED_N8N_IMPORT_FRONTEND_DEPLOY_AND_SCOPED_RUNTIME_RETEST_PENDING`.

## UAT-SALE-03 — Không nhận diện câu hỏi bán gì cho một khách cụ thể

- Mã tình huống tương ứng trong kế hoạch kiểm thử: `NV-03`.
- Câu hỏi: `Hôm nay bán gì cho khách NDB001`.
- Thực tế quan sát lúc `15:20` ngày 24/07/2026: `Tôi chưa hiểu rõ yêu cầu. Bạn có thể diễn đạt lại hoặc chọn một chức năng bên dưới.`
- Mong đợi:
  - Nhận diện đây là yêu cầu gợi ý đơn hàng cho khách `NDB001`.
  - Xác minh NDB001 nằm trong phạm vi tài khoản trước khi truy vấn.
  - Nếu có đủ lịch sử hợp lệ, trả danh sách gợi ý gắn với khách và lý do dễ hiểu.
  - Nếu khách mới hoặc chưa đủ lịch sử, thông báo rõ `khách mới/chưa đủ lịch sử`; không tự đoán chu kỳ hoặc trả gợi ý chung.
  - Không sử dụng tồn kho chưa được kiểm tra để khẳng định sản phẩm có thể bán.
- Phân loại: Natural-language intent routing / customer-specific order recommendation.
- Mức ảnh hưởng: Cao — chức năng gợi ý bán hàng cốt lõi không thể kích hoạt bằng câu tự nhiên dù đã có mã khách.
- Nguyên nhân source đã xác nhận: Mẫu câu `hôm nay bán gì cho khách ...` chưa nằm trong nhánh gợi ý đơn hàng deterministic nên rơi vào `UNKNOWN`.
- Đã sửa source:
  - Các biến thể `Hôm nay bán gì cho khách NDB001`, `Gợi ý đơn hàng cho NDB001` và `NDB001 nên nhập thêm gì` vào `ORDER_RECOMMENDATION / @goi_ydon_hang`.
  - Mã `NDB001` được trích xuất thành `customerId`, không bị hiểu là mã sản phẩm.
  - Luồng thiếu khách vẫn hỏi chọn khách; kiểm tra phạm vi tiếp tục do backend/SQL thực hiện.
- Kiểm thử source: Các mẫu có/thiếu khách và hồi quy phân loại đều pass trong bộ `145/145`.
- Trạng thái: `SOURCE_FIXED_N8N_IMPORT_AND_SCOPED_RUNTIME_RETEST_PENDING`.

## Kết quả chốt source sau đợt sửa

- Bộ phân loại deterministic: `52/52` tình huống pass trên 24 API được duyệt.
- Ma trận hội thoại tự nhiên: `159/159` pass, `0` lỗi và `0` release-gate failure.
- Hai workflow đều có runtime signature hiện hành và parse hợp lệ:
  - `n8n/AI_Core/MAIN_ChatBot_V5.json`
  - `n8n/AI_Core/AI_Intent_Parser.json`
- Frontend đã build lại bundle production; màn hình tuyến/công việc ưu tiên có phần giải thích và hành động tiếp theo.
- Chưa gọi là runtime pass cho đến khi hai workflow được import/publish trên n8n, frontend mới được triển khai và chạy lại bằng tối thiểu một tài khoản Sale cùng một tài khoản Manager.

## UAT-CTX-02 — Mở rộng hội thoại tự nhiên nhiều lượt

- Phạm vi sửa:
  - Nhận diện thêm các cách hỏi tự nhiên về công nợ, tồn kho, sản phẩm, khách lâu chưa mua, gợi ý đơn hàng và gợi ý bán kèm.
  - Hiểu câu tiếp nối `chi tiết đi`, `tháng trước thì sao`, `tuần trước thì sao`, `đổi sang khách AG0031`, `khách này` và `sản phẩm này` khi lịch sử trước đó xác định rõ đối tượng.
  - Giữ mã khách hàng/sản phẩm và khoảng ngày theo ngữ cảnh; khoảng ngày tương đối được tính xác định, không phụ thuộc câu trả lời tự do của AI.
  - Chỉ nối ngữ cảnh trong các miền nghiệp vụ đã được duyệt. Nếu đối tượng không rõ hoặc có nguy cơ dùng nhầm mã sản phẩm làm mã khách hàng, hệ thống yêu cầu người dùng cung cấp lại thay vì tự đoán.
- Giới hạn chủ động:
  - Không tuyên bố hiểu mọi câu hội thoại ngoài nghiệp vụ.
  - Câu ngoài 24 API tiếp tục trả `UNSUPPORTED`; câu nghiệp vụ chưa đủ tham số tiếp tục hỏi bổ sung.
  - Quyền dữ liệu vẫn do backend/SQL kiểm tra, bộ phân loại không tự mở rộng phạm vi của tài khoản.
- Kiểm thử source:
  - Ma trận hội thoại: `159/159` pass.
  - Release gate: `0` lỗi.
  - Danh sách allowlist vẫn giữ nguyên `24` API.
  - Hai workflow JSON parse hợp lệ và script đồng bộ workflow chạy lặp lại không tạo thay đổi mới.
- Trạng thái: `SOURCE_FIXED_N8N_IMPORT_AND_SCOPED_RUNTIME_RETEST_PENDING`.
