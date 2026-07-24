# Nhật ký lỗi UAT runtime — 24/07/2026

Môi trường: `https://medtest.bms7.net/#/chatbot`
Release quan sát: `11.85`
Trạng thái tổng: `BUSINESS_UAT_FAIL_PENDING_FIX`

## UAT-TH-03 — Không nhận diện câu hỏi công việc hôm nay

- Mã tài liệu: `TH-03`
- Câu hỏi: `Hôm nay tôi nên làm gì?`
- Mong đợi: Gợi ý công việc/tuyến bán hàng phù hợp vai trò và phạm vi.
- Thực tế: `Tôi chưa hiểu rõ yêu cầu. Bạn có thể diễn đạt lại hoặc chọn một chức năng bên dưới.`
- Phân loại: Runtime intent routing.
- Mức ảnh hưởng: Cao — câu kiểm thử chung cho cả 13 tài khoản.
- Nguyên nhân sơ bộ: Nhánh `UNKNOWN` trả lời trước khi QuickIntent registry ánh xạ câu này sang `@tuyen_ban_hang`.
- Trạng thái: `OPEN`.

## UAT-TH-04 — Sai khoảng ngày doanh số

- Mã tài liệu: `TH-04`
- Câu hỏi: `Doanh số từ 09/07/2026 đến 20/07/2026 của tôi là bao nhiêu?`
- Mong đợi: Khoảng thời gian `09/07/2026 → 20/07/2026` và tổng khớp bảng đối chiếu của tài khoản.
- Thực tế: Card `Doanh số đội ngũ` hiển thị `01/07/2026 → 24/07/2026`.
- Phân loại: Runtime entity/date parameter propagation.
- Mức ảnh hưởng: Cao — trả sai phạm vi thời gian và có thể dẫn đến sai tổng doanh số.
- Nguyên nhân sơ bộ: Tham số ngày người dùng nhập bị mất hoặc bị giá trị mặc định đầu tháng/đến hôm nay ghi đè trước khi gọi API/render card.
- Trạng thái: `OPEN`.

## Ghi chú xử lý

- Chưa sửa trong lượt ghi nhận này theo yêu cầu; tiếp tục thu thập lỗi UAT trước khi sửa theo nhóm.
- Không chạy mutation và không chỉnh dữ liệu DB.
## UAT-TH-05 — Không nhận diện câu hỏi khách cần ghé hôm nay

- Mã tài liệu: `TH-05`
- Câu hỏi: `Hôm nay tôi nên ghé khách nào?`
- Mong đợi: Chỉ hiển thị khách hàng trong tuyến/phạm vi được giao và lý do chăm sóc dễ hiểu.
- Thực tế: `Tôi chưa hiểu rõ yêu cầu. Bạn có thể diễn đạt lại hoặc chọn một chức năng bên dưới.`
- Phân loại: Runtime intent routing.
- Mức ảnh hưởng: Cao — câu kiểm thử chung cho cả 13 tài khoản và liên quan trực tiếp đến tuyến/chăm sóc khách hàng.
- Nguyên nhân sơ bộ: Câu hỏi tuyến bán hàng không được classifier nâng thành business intent trước nhánh `UNKNOWN`; QuickIntent registry không được thực thi.
- Liên quan: Cùng nhóm nguyên nhân với `UAT-TH-03`.
- Trạng thái: `OPEN`.
## UAT-UI-01 — Nội dung tiếng Việt bị sai mã hóa

- Nội dung quan sát: `TÃ¬m tháº¥y 3 káº¿t quáº£.` thay vì `Tìm thấy 3 kết quả.`
- Phân loại: Encoding/renderer UI.
- Mức ảnh hưởng: Trung bình — dữ liệu vẫn hiển thị nhưng nội dung không thể chấp nhận khi bàn giao khách hàng.
- Nguyên nhân sơ bộ: Chuỗi UTF-8 bị giải mã nhầm theo Windows-1252/Latin-1 tại một bước tạo dữ liệu hoặc render HTML.
- Trạng thái: `OPEN`.

## UAT-API-01 — Gateway trả HTTP 502 khi tải chi tiết

- Môi trường/release: `https://medtest.bms7.net`, bản `11.85`.
- Thực tế: Console báo `Failed to load resource: the server responded with a status of 502` tại `/api/gateway`.
- Phân loại: API gateway/upstream runtime.
- Mức ảnh hưởng: Cao — một phần dữ liệu hoặc thao tác chi tiết có thể không tải được dù các API trước đó trả `200`.
- Nguyên nhân sơ bộ: Gateway không nhận được phản hồi hợp lệ từ upstream, upstream timeout/lỗi, hoặc một API động được gọi với tham số không hợp lệ. Cần lấy request payload và response body trong Network để xác định endpoint nguồn.
- Trạng thái: `OPEN`.

## UAT-UI-02 — Card chi tiết công nợ bị trả lặp

- Câu hỏi quan sát: `Khách NDB001 đang nợ bao nhiêu?`, sau đó `Chi tiết công nợ khách NDB001`.
- Thực tế: Hai card `Quầy thuốc tân dược` hiển thị gần như giống hệt nhau liên tiếp, cùng tổng công nợ `6.445.000` và cùng thời điểm truy vấn.
- Mong đợi: Mỗi câu hỏi tạo đúng một phản hồi; câu hỏi chi tiết không nhân đôi card cũ nếu nội dung không thay đổi.
- Phân loại: Conversation state/deduplication.
- Mức ảnh hưởng: Trung bình.
- Nguyên nhân sơ bộ: Renderer hoặc lịch sử hội thoại append lại payload/card cũ; cần kiểm tra message ID và khóa chống render trùng.
- Trạng thái: `OPEN`.

## UAT-SP-01 — Không trả được thông tin sản phẩm A003

- Câu hỏi: `Thông tin sản phẩm A003`.
- Thực tế: `Xin lỗi, tôi không thể phản hồi lúc này. Vui lòng thử lại sau.`
- Mong đợi: Trả thông tin sản phẩm A003 hoặc thông báo rõ sản phẩm không tồn tại.
- Phân loại: Product lookup/runtime API.
- Mức ảnh hưởng: Cao — chức năng tra cứu sản phẩm không hoàn thành và thông báo lỗi không nêu nguyên nhân.
- Trạng thái: `OPEN`.

## UAT-TK-01 — Tồn kho A003 có hai dòng mâu thuẫn và thiếu ngữ cảnh kho

- Câu hỏi: `Tồn kho sản phẩm A003`.
- Thực tế: Trả hai dòng cùng mã `A003`, cùng tên sản phẩm; `Tồn ERP` lần lượt là `-4` và `4`, trong khi `Tồn khả dụng tham khảo` đều là `0`.
- Mong đợi: Phân biệt rõ từng kho/chi nhánh/lô nếu đây là các bản ghi khác nhau; nếu cùng phạm vi thì chỉ trả một số liệu đã đối soát.
- Phân loại: Data aggregation/rendering context.
- Mức ảnh hưởng: Cao — người dùng không xác định được số tồn đúng để sử dụng.
- Liên quan: Tiêu đề kết quả trong cùng card vẫn bị lỗi mã hóa như `UAT-UI-01`.
- Ghi chú DB: Chưa kết luận dữ liệu DB sai; cần kiểm tra payload API và khóa phân nhóm trước khi truy vấn/chỉnh DB.
- Trạng thái: `OPEN`.

## UAT-SALE-01 — Không tải được danh sách khách thuộc tuyến

- Mã tài liệu: `SALE-01`.
- Câu hỏi: `Cho tôi danh sách khách thuộc tuyến của tôi`.
- Mong đợi: Chỉ trả danh sách khách hàng được giao cho tài khoản đang đăng nhập.
- Thực tế: `Xin lỗi, tôi không thể phản hồi lúc này. Vui lòng thử lại sau.`
- Phân loại: Route/customer scope runtime API.
- Mức ảnh hưởng: Cao — chức năng nghiệp vụ chính của tài khoản sale không sử dụng được.
- Nguyên nhân sơ bộ: Intent có khả năng đã được nhận nhưng API lấy tuyến/phạm vi khách hàng thất bại; thông báo hiện tại che mất mã lỗi nguồn. Cần kiểm tra request `/api/gateway`, response body và API code thực tế trong Network.
- Ghi chú DB: Chưa kết luận do dữ liệu hoặc mapping DB; chưa truy vấn/chỉnh DB.
- Trạng thái: `OPEN`.
