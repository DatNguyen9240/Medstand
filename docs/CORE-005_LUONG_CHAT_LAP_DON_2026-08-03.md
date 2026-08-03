# CORE-005 — Hoàn thiện luồng chat lập đơn

## Trạng thái

`SQL_DEPLOYED_LOCAL_GATEWAY_11.124_VERIFIED_PENDING_END_TO_END_UAT` — SQL mới đã được deploy lên `medtest`; gateway local đã restart và phục vụ frontend `11.124`. Chưa đánh dấu `DONE` vì chưa chạy mutation qua token/UI thật và UAT concurrency sau deploy.

Bundle frontend đã đóng gói: `11.124`.
Manifest deploy đồng bộ: [CORE005_DEPLOY_MANIFEST_2026-08-03_11.124.md](../release/CORE005_DEPLOY_MANIFEST_2026-08-03_11.124.md).

## Lỗi gốc đã xử lý

1. Frontend từng tự sinh mã nghiệp vụ và có thể gửi mã không theo quy tắc ERP. Bản vá chỉ gửi `AUTO_GEN`; SQL sinh `D{BranchID}{MM}{YY}/{số thứ tự}`.
2. Chat từng gửi hàng tặng thành dòng riêng giá `0`; SQL/ERP dùng `SoLuongTang` trên dòng bán. Bản vá thống nhất một dòng bán và `SoLuongTang`.
3. Giá, chiết khấu và hàng tặng có thể dựa vào dữ liệu client. SQL hiện lấy lại giá từ `AR_LayGiaSanPhamFnc` và tính lại rule khách thường từ `GhiChu`.
4. Kiểm tra tồn trước đây chưa chốt kho cụ thể và chưa trừ đơn đang giữ hàng. SQL hiện chọn một kho được cấp, trừ lượng giữ ở trạng thái `-2,-1,0,1,2,4`, kiểm tra lại trong transaction và ghi `StoreHouseID` vào detail.
5. `DocumentID` từng kiêm khóa retry. Bản vá tách `Idempotency-Key`, fingerprint request và kết quả đã cache; cùng key/cùng payload trả lại mã cũ, cùng key/payload khác bị từ chối.
6. Gateway từng tin `Username` trong body. Bản vá xác minh bearer token qua `API_UserInfo`, ghi đè identity và gắn `RequestID` trước khi gọi mutation.
7. Khi đổi khách/ngày hoặc tải sản phẩm lỗi, UI có thể giữ giá/tồn cũ. Bản vá xóa cache, đánh dấu dòng chưa xác minh và chặn submit cho đến khi đối chiếu lại SQL.

## Thành phần thay đổi

- `sql/Migrate_API_Mutation_Idempotency_AI.sql`
- `sql/Module common - API_HangHoaList_AI.sql`
- `sql/Module common - API_DonHangChiTiet_Insert_AI.sql`
- `server.js`
- `src/js/pages/create-order.js`
- `chatbot-widget/js/chatbot-api-engine.js`
- `scripts/preflight_core005_sql.js`
- `scripts/verify_core005_mutation_rollback.js`

## Bằng chứng ngày 03/08/2026

### Compile trên schema thật

- Database: `medtest`.
- Chế độ: áp migration và procedure trong một transaction rồi rollback.
- Kết quả: `PASS`, 11 batch SQL compile thành công, không lưu thay đổi.

### Mutation kiểm soát có rollback

- Tài khoản: `QLBH013.MED`.
- Khách: `DL011`.
- Sản phẩm: `A008`.
- Kho SQL chọn: `CTY`.
- Ca CTBH: mua `10`, tặng `2`, chiết khấu `0%`.
- Lần đầu: trả `DMB0826/1`, `MsgType = 5`, `IsReplay = 0`.
- Retry cùng key/payload: trả lại đúng `DMB0826/1`, `MsgType = 5`, `IsReplay = 1`.
- Cùng key nhưng đổi memo: trả `IDEMPOTENCY_CONFLICT`, không tạo thêm đơn.
- Trong transaction có đúng `1` header, `1` detail, `SoLuongTang = 2`, `StoreHouseID = CTY`.
- Toàn bộ transaction đã rollback; `PersistedChanges = false`.

### Đối chiếu runtime đang phục vụ

- Trước deploy, kiểm tra read-only lúc `2026-08-03T04:42:32Z` phát hiện procedure tạo đơn còn contract cũ bốn tham số.
- Sau khi chạy lại ba file SQL, kiểm tra lúc `2026-08-03T04:53:15Z` PASS toàn bộ `23/23` gate; procedure tạo đơn có đủ 12 tham số và catalog có đủ 6 tham số.
- Mutation rollback chạy trực tiếp trên procedure đã deploy PASS ca `A008` mua `10` tặng `2`: create/replay/conflict đúng, một header + một detail, kho `CTY`, không lưu dữ liệu test.
- Gateway local đã restart sang process mới; smoke test xác nhận frontend `11.124` và order guard `IDEMPOTENCY_KEY_REQUIRED`. Smoke này không gửi mutation.
- Kiểm tra lại read-only lúc `2026-08-03T05:04:01Z`: SQL/source tiếp tục PASS `23/23`; gateway PID `32384` tiếp tục phục vụ `11.124`. Audit sau deploy chưa có `CREATE_DONHANG`, `REPLAY_DONHANG` hoặc `CREATE_DONHANG_FAILED`; `ConcurrencyProven = false`. Vì vậy trạng thái vẫn phải chờ end-to-end UAT.

## Điều kiện để chuyển `DONE`

1. ~~Deploy migration và hai procedure lên `medtest`; restart gateway local và phục vụ bundle `11.124`.~~ Hoàn thành 03/08/2026.
2. Chạy smoke runtime qua gateway với token thật và xác nhận response có `DocumentID`, `RequestID`.
3. Chạy double-click/hai request đồng thời cùng key và xác nhận chỉ có một header/detail.
4. Chạy lại trường hợp mua `10` tặng `2` trên dữ liệu UAT được phép và lưu log/ảnh/request ID.
5. Chạy regression tạo đơn không khuyến mãi, giá thay đổi, thiếu tồn, khách ngoài quyền và đổi khách/ngày.

## Giới hạn còn lại

ERP hiện chưa cung cấp `PromotionID`/`RuleVersion`; SQL kiểm tra theo `GhiChu` hiện hành. Đây không chặn luồng hiện tại nhưng chưa hỗ trợ truy nguyên phiên bản CTBH bằng định danh riêng.
