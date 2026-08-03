# CORE-005 deploy manifest — frontend 11.124

## Trạng thái

`SQL_DEPLOYED_LOCAL_GATEWAY_VERIFIED_PENDING_END_TO_END_UAT` — ba file SQL đã chạy trên `medtest`; gateway local đã restart và phục vụ frontend `11.124`. Còn chờ mutation qua token/UI thật, concurrency UAT và xác nhận môi trường frontend từ xa nếu có.

## Đích

- Database: chỉ `medtest`.
- Frontend/gateway: môi trường UAT tương ứng `medtest`; không áp dụng production từ manifest này.
- Build: `11.124`.

## Thứ tự triển khai

1. Bật maintenance cho thao tác tạo đơn; giữ nguyên các chức năng đọc.
2. Sao lưu definition hiện tại của `API_HangHoaList_AI`, `API_DonHangChiTiet_Insert_AI`, `AI_ReserveAPIMutation`, `AI_CompleteAPIMutation` và metadata bảng `AI_API_MutationIdempotency`.
3. Trong một transaction SQL: chạy migration idempotency, `API_HangHoaList_AI`, rồi `API_DonHangChiTiet_Insert_AI`; rollback toàn bộ nếu một batch lỗi.
4. Phát hành `server.js` mới và restart gateway.
5. Phát hành toàn bộ static bundle `11.124`; không trộn file nguồn/bundle giữa hai version.
6. Chạy smoke qua gateway, mutation UAT, replay/concurrency và kiểm tra request ID trước khi tắt maintenance.

## File và SHA-256

| File | SHA-256 |
|---|---|
| `sql/Migrate_API_Mutation_Idempotency_AI.sql` | `95f272e9cb027a272b06f2e6becb3dcc15a4082f25d0a13c91aa3dcf922a34e5` |
| `sql/Module common - API_HangHoaList_AI.sql` | `ef40e84315bf8b2cb3ee2fbd67f9a7a032ff9ae2b9d0fe4162a41452fab416b1` |
| `sql/Module common - API_DonHangChiTiet_Insert_AI.sql` | `1ba9c24e308c9af63fcd25ead37e4c80d4ff3b4b01301e0963706bab1c848fca` |
| `server.js` | `9952f160ccba76883927bc91b6fa1824b3632e094541197f3bf1e60c71e0692a` |
| `src/js/pages/create-order.js` | `d1014aa7568e86265bd3f0bb3f454e3a9618064b569c8fbc6a575e93a249ed80` |
| `chatbot-widget/js/chatbot-api-engine.js` | `c37ab6b9aa67ee9fc2c9b0ddd1f2627ddcc0e8e560e71292e1b3225084eac3ef` |
| `src/js/dist/pages/create-order.js` | `d9da4f5eec476214dd6f61bdb5a18ecbbeba6b6d16d6f97872d8d462a66231c2` |
| `chatbot-widget/js/chatbot.bundle.min.js` | `231121d5b13636be866cabc17994db94043553204c90d768646e94826ae4558c` |
| `src/js/dist/app.bundle.min.js` | `dc705f8e15e3252370374c42269da11c3ab859899d833b9b9eeca96ac487fc06` |
| `index.html` | `fa2482e33d13994417f4332cd86628d35b67dca9be23ed0b1437ec9014213512` |
| `sw.js` | `5492e71e53f68503f0eeea94206b22c45ba98e70f7f4f8e23f6b64ee268a14c4` |

## Gate sau deploy

- `scripts/verify_uat018_order_create.js` trả `PASS` với một `DocumentID` UAT được phép.
- Hai request đồng thời cùng `Idempotency-Key`/payload trả cùng một `DocumentID`; DB có đúng một header và đúng tập detail.
- Cùng key nhưng đổi memo/item/số lượng trả `IDEMPOTENCY_CONFLICT`.
- Ca `A008`, mua `10`, tặng `2` lưu một detail có `SoLuongTang = 2`, giá dương và `StoreHouseID` khác rỗng.
- Response mutation có `MsgType = 5`, `DocumentID`, `RequestID`; audit có create/replay/failure tương ứng.

## Rollback

Nếu gate thất bại: bật lại maintenance, khôi phục đồng thời gateway/static bundle trước đó và definition hai procedure AI từ backup. Các cột idempotency mới có thể giữ lại vì nullable và tương thích ngược; không xóa bảng/cột trong lúc xử lý sự cố.
