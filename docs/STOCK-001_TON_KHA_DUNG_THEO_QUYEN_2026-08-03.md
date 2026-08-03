# STOCK-001 — Tồn khả dụng theo quyền trong tư vấn sản phẩm

Ngày thực hiện: `03/08/2026`  
Môi trường SQL: `medtest`  
Frontend local: `11.126`  
Trạng thái: `DONE`

## Kết quả đã hoàn thành

- Tạo nguồn tính tồn dùng chung `dbo.AI_StockAvailableByUserFnc`, đồng thời tách hàm phạm vi kho `dbo.AI_WarehouseByUserFnc`.
- Công thức thống nhất: `AvailableStock = max(NonExpiredPhysicalStock - ReservedStock, 0)`.
- Kho bán, trạng thái đơn giữ hàng, nhóm hàng bán được, nhóm quyền và UTC offset đọc từ rule `BR-STOCK-001/2.0.0`; procedure không tự giữ các danh sách này.
- Đồng bộ API danh mục, tồn kho, hàng hóa, tra cứu triệu chứng, gợi ý đơn thuốc, upsell, gợi ý đơn hàng, sản phẩm trọng tâm, khuyến mãi và bước kiểm tra lại khi ghi đơn.
- Kết quả tư vấn chỉ giữ sản phẩm có giá dương và `AvailableStock > 0`; trả đủ kho, tồn vật lý, tồn đã giữ, tồn khả dụng, thời điểm tính, thời điểm biến động cuối, scope, status, rule và source.
- Frontend hiển thị các trường tồn mới; bundle local đã build thành công ở phiên bản `11.126`.

## Bằng chứng SQL và static runtime

- Deploy transaction trên `medtest`: `12/12` file PASS.
- Gate hậu kiểm read-only: `13/13` tài khoản UAT PASS.
- Regression gợi ý đơn hàng `UAT-011`: `13/13` PASS.
- Regression upsell `UAT-014`: `13/13` PASS.
- Regression tra cứu sản phẩm/triệu chứng `UAT-016`: `13/13` PASS.
- Static n8n/frontend: `5/5` PASS.
- Runtime export sau import: đúng workflow nguồn, workflow đích active và không trùng webhook theo dữ liệu cấu hình.
- Runtime n8n đã restart sang PID `13896`; `/healthz` trả `200`, log xác nhận đăng ký thành công `hook-ai-dainao` và `api-execute`.

Ca chặn hàng không bán được đã đối soát:

- Tài khoản: `QLBH005.MED`.
- Sản phẩm/kho: `Q002 / DL02`.
- Tồn vật lý: `10192`.
- Đã giữ bởi đơn mở: `13024`.
- Tồn khả dụng: `0`.
- Trạng thái: `RESERVED_OUT`.
- `API_TraCuuSanPham_AI` không trả sản phẩm này trong danh sách gợi ý.

Ca tồn khả dụng dương tham chiếu:

- Kho/sản phẩm: `CTY / V008`.
- Tồn vật lý: `6942`.
- Đã giữ: `5361`.
- Tồn khả dụng: `1581`.

## Bằng chứng end-to-end qua token thật

- Smoke gateway bằng `QLBH013.MED`: `8/8` PASS.
- `SELLABLE_PRODUCT_HAS_STOCK_CONTRACT`: request `req-11760-msd0saxz`, sản phẩm `V008`, PASS.
- `RESERVED_OUT_PRODUCT_NOT_RECOMMENDED`: request `req-11763-msd0semv`, `QLBH005.MED / Q002`, trả `NO_DATA`, PASS.
- `SYMPTOM_RESULTS_HAVE_SELLABLE_STOCK`: request `req-11766-msd0sgq1`, trả `8` sản phẩm và không có dòng sai contract, PASS.
- Mẫu từ request triệu chứng: `H014 / DL02`, tồn vật lý `155`, đã giữ `119`, khả dụng `36`, status `AVAILABLE_FOR_SALE`, scope `AUTHORIZED_CONFIGURED_STORE`, rule `2.0.0`.

Trong lần token UAT đầu, luồng triệu chứng phát hiện API Execute chuẩn hóa `@Keyword` thành `@timkiem` trong khi SQL mới chỉ nhận `@Keyword`, dẫn tới `MISSING_KEYWORD`. Procedure đã được sửa theo contract tương thích ngược: nhận cả hai tên và ưu tiên `@Keyword`. Bản sửa preflight rollback và deploy commit đều PASS `12/12`; gate 13 tài khoản xác minh cả hai alias đều PASS.

Script bằng chứng có thể chạy lại:

- `node scripts/verify_stock001_postdeploy.js`
- `node scripts/verify_stock001_token_uat.js`

STOCK-001 đạt đủ nghiệm thu và được đánh dấu `DONE`.
