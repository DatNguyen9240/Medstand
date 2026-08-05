# CORE-009 — Quản lý đơn nháp bằng hội thoại

Ngày thực hiện: 05/08/2026  
Trạng thái: `LOCAL_BUNDLE_11.128_VERIFIED_PENDING_VISUAL_END_TO_END_UAT`

## Kết quả

CORE-009 được chuyển từ mô hình “giỏ hàng” độc lập sang một đơn nháp được điều khiển bằng hội thoại. Người dùng có thể chọn sản phẩm từ kết quả `@goi_ydon_hang`, thêm hoặc đổi số lượng, bỏ sản phẩm, xem lại, hủy và yêu cầu preview. Chức năng này không gọi endpoint tạo đơn.

```text
Câu tự nhiên hoặc card/nút
  → DraftCommand có cấu trúc
  → OrderDraft reducer theo phiên
  → tải lại khách + catalog giá/tồn/CTBH khi preview
  → /create-order để người dùng soát và xác nhận
  → CORE-005/SQL kiểm tra lần cuối rồi mới mutation
```

## Contract Pilot

Draft được lưu trong `sessionStorage`, khóa theo `UserId + ConversationId` và hết hạn sau 30 phút không hoạt động:

```json
{
  "draftId": "DRF-...",
  "userId": "QLBH013.MED",
  "conversationId": "user_...",
  "customerId": "DL011",
  "items": [
    { "itemId": "A008", "quantity": 10 }
  ],
  "draftVersion": 3,
  "status": "EDITING",
  "pricingSnapshot": null,
  "expiresAt": 1785900000000
}
```

Giá, chiết khấu, hàng tặng, tồn và kho trong kết quả gợi ý chỉ để tham khảo. Chúng không được truyền như dữ liệu có thẩm quyền trong draft. Khi preview, frontend dùng `ObjectID + ItemID` để tải lại catalog theo khách; khi tạo thật, SQL CORE-005 kiểm tra lại giá, CTBH, tồn và tự chọn kho được phép.

Các command Pilot:

- `ADD_ITEM`
- `UPDATE_QUANTITY`
- `REMOVE_ITEM`
- `SHOW_DRAFT`
- `CANCEL_DRAFT`
- `REQUEST_PREVIEW`
- `HANDOFF_FOR_CONFIRMATION`

Các câu ngoài phạm vi draft tiếp tục đi qua NLP hiện hành.

## Guard đã triển khai

- Tên sản phẩm khớp nhiều mã phải hỏi lại; không tự chọn dòng đầu tiên.
- Thiếu số lượng, số lượng không nguyên/dương hoặc vượt tồn đang hiển thị không làm thay đổi draft.
- Draft đang thuộc khách khác phải hủy trước khi chuyển khách.
- Thêm lại cùng sản phẩm đặt lại số lượng mong muốn, không tạo dòng trùng.
- Command giống hệt trong ba giây được coi là replay và không áp dụng lần hai.
- Mỗi thay đổi tăng `DraftVersion` và xóa snapshot cũ.
- Draft cách ly theo tài khoản và cuộc hội thoại, tự hết hạn sau 30 phút; đăng xuất xóa toàn bộ `sessionStorage`.
- Tạo đơn thành công ở CORE-005 xóa draft hiện hành.
- Preview chỉ điều hướng với `ObjectID`, `ItemID`, `Quantity`; không mutation.

## Thay đổi code

- `chatbot-widget/js/chatbot-order-draft.js`: state, parser command, reducer, idempotency ngắn hạn và render action.
- `chatbot-widget/js/chatbot.js`: intercept DraftCommand, đăng ký danh sách gợi ý, xử lý nút và mở preview.
- `chatbot-widget/js/chatbot-api-engine.js`: chờ xác minh khách hàng trước khi tải sản phẩm điền sẵn.
- `chatbot-widget/css/chatbot.css`: card số lượng/nút thêm, responsive và dark mode.
- `src/js/pages/create-order.js`: xóa draft sau khi endpoint CORE-005 xác nhận tạo thành công.
- `scripts/test_core009_order_draft.js`: bộ test reducer và isolation.

Không thay đổi SQL hoặc n8n cho CORE-009.

## Kiểm chứng tự động

Bộ test CORE-009 kiểm tra 23 ca:

- Chọn theo số thứ tự và chọn nhiều sản phẩm trong một câu.
- Thêm, đổi số lượng, bỏ và xem draft.
- Tên mơ hồ, thiếu số lượng, số lượng không hợp lệ và vượt tồn.
- Double-click/replay không thêm trùng.
- Xung đột khách hàng, cách ly tài khoản/cuộc hội thoại và hết hạn.
- Payload preview không chứa giá, kho hoặc chiết khấu do client tự khai.
- Tạo thật thành công vô hiệu draft.
- Escape dữ liệu SQL khi render thuộc tính HTML.
- Câu tạo đơn thông thường khi chưa có draft vẫn đi qua NLP cũ, không bị CORE-009 chặn nhầm.
- Chat text và nút gợi ý cùng gọi một reducer.
- Prefill chờ xác minh khách trước khi tải catalog sản phẩm.
- Mutation CORE-005 thành công mới xóa draft.
- Bundle production thực sự chứa module CORE-009.

Lệnh chạy:

```powershell
npm run test:core009
npm run test:natural
npm run build
```

## Còn lại trước khi DONE

Chạy UAT trực quan bằng token/tài khoản thật:

1. Gọi gợi ý đơn cho một khách có từ hai sản phẩm bán được.
2. Thêm bằng nút, sau đó đổi và bỏ bằng câu tự nhiên.
3. Thử câu tên mơ hồ và xác nhận draft không đổi.
4. Mở preview, kiểm tra khách, sản phẩm, số lượng, giá, CTBH và tồn được tải lại.
5. Quay lại sửa rồi mở preview lần nữa.
6. Xác minh trước khi bấm tạo không có header/detail mới trong DB.
7. Lưu ảnh cùng request ID của lần gợi ý/kiểm tra nghiệp vụ; mutation cuối thuộc bằng chứng CORE-005.
