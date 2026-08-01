# UAT-019 — Regression hội thoại tự nhiên

## Trạng thái

`FIX_SOURCE_READY_RUNTIME_RETEST_REQUIRED`

Ngày kiểm tra: `31/07/2026`.

Không có mutation hoặc thay đổi dữ liệu SQL trong lần kiểm tra này.

## Kết quả đã chạy

| Bộ kiểm tra | Kết quả | Tỷ lệ |
|---|---:|---:|
| Classifier/intent/parameter/missing-field/follow-up | 159/159 PASS | 100% |
| Release-gate classifier | 0 lỗi | PASS |
| Network resilience | 5/5 PASS | 100% |
| Cổng xác thực đúng frontend Pilot `medtest.bms7.net` | HTTP 401 `AUTH_REQUIRED` khi không token | PASS |
| Live runtime có xác thực, 31 ca | 28/31 PASS (`90,32%`) | FAIL — dưới ngưỡng 95% |

Ngưỡng yêu cầu tối thiểu `95%` đã đạt ở bộ regression tĩnh nhưng chưa đạt ở runtime live (`90,32%`). Không đánh dấu UAT-019 PASS khi còn 3 ca runtime lỗi.

### Các ca live lỗi

| Ca | HTTP | Thời gian | Kết quả |
|---|---:|---:|---|
| `upsell` — gợi ý bán kèm cho khách UAT | 502 | 1.568 ms | Upstream/gateway không sẵn sàng |
| `product-search` — tìm sản phẩm `A003` | 502 | 1.286 ms | Upstream/gateway không sẵn sàng |
| `catalog` — xem danh mục kho hàng | 422 | 263 ms | Workflow từ chối request/thiếu contract |

Bằng chứng live: `reports/uat019-live-2026-07-31.json`. Bộ đo chạy qua `http://localhost:3000/api/gateway`, dùng khách hàng UAT `EF7C85D8-8888-4904-8478-6046C09DE258`; không ghi dữ liệu SQL.

### Phân tích kỹ thuật lần retest

Đã gửi lại riêng ba câu lỗi qua gateway local để lấy response contract đầy đủ:

| Ca | Response thực tế | Diễn giải kỹ thuật |
|---|---|---|
| `upsell` | HTTP `502`, `code=EMPTY_UPSTREAM_RESPONSE` | Gateway đã chuyển request tới n8n thành công nhưng upstream trả HTTP `200` với body rỗng (`Response bytes: 0`). Gateway chủ động đổi thành 502 để không coi response rỗng là thành công. Đây là lỗi workflow/upstream, không phải lỗi token hay phạm vi khách hàng. |
| `product-search` | HTTP `502`, `code=EMPTY_UPSTREAM_RESPONSE` | Cùng mẫu lỗi: n8n trả HTTP `200` nhưng không có dữ liệu. Log gateway ghi body rỗng; cần kiểm tra nhánh gọi `API_TraCuuSanPham_AI` và lỗi kết nối backend nếu tái diễn. |
| `catalog` | HTTP `422`, `code=VALIDATION_ERROR`, `ApiCode=@danh_muc` | Workflow đã chạy tới lớp validate nhưng nhận `@timkiem` rỗng/ngắn hơn quy định tối thiểu 2 ký tự. Đây là lỗi contract/intent mapping của truy vấn danh mục tổng quát; câu “xem danh mục kho hàng” đáng lẽ phải map `@Type=khohang` và không bắt buộc từ khóa. |

Hai lỗi 502 không phải `AUTH_REQUIRED`, `OUT_OF_SCOPE` hoặc lỗi SQL được trả về cho người dùng. Log gateway của lần retest ghi hai request n8n HTTP `200` nhưng `Response bytes: 0`, sau đó gateway phát hành `EMPTY_UPSTREAM_RESPONSE`.

Hướng xử lý để retest:

1. Kiểm tra workflow `hook-ai-dainao` ở nhánh `@upsell_goi_y` và `@tra_cuu_san_pham`: mọi nhánh phải kết thúc bằng response JSON, kể cả khi SQL trả 0 dòng hoặc lỗi.
2. Kiểm tra node gọi backend/SQL và timeout kết nối `medtest.bms79.com`; log gateway cũng từng ghi `ConnectTimeoutError` tới host này.
3. Sửa metadata/intent cho `@danh_muc`: câu hỏi loại danh mục phải truyền `@Type=khohang`, `@timkiem=''`; chỉ yêu cầu tối thiểu 2 ký tự ở luồng autocomplete có tìm kiếm.
4. Chạy lại đúng ba ca riêng lẻ, sau đó chạy đủ 31 ca. Chỉ đánh dấu PASS khi đạt tối thiểu `30/31` và không còn lỗi P0/P1.

### Bản sửa nguồn ngày 31/07/2026

Đã sửa `n8n/AI_Core/MAIN_ChatBot_V5.json`, không chạy SQL và không thay đổi dữ liệu:

- `@danh_muc`: suy ra `@Type=khohang` từ câu hỏi khi parser thiếu alias; không bắt từ khóa đối với luồng duyệt danh mục theo loại.
- `@upsell_goi_y` và `@tra_cuu_san_pham`: khi API trả 0 dòng, trả envelope `NO_DATA` trực tiếp và không chuyển sang RAG tùy chọn, tránh kết thúc webhook bằng body rỗng.
- RAG fallback: chuẩn hóa nhánh lỗi thành JSON `SYSTEM_ERROR/RAG_UPSTREAM_ERROR`, không để upstream rỗng bị coi là thành công.

Kiểm tra sau sửa: classifier `159/159 PASS`, workflow guard `4/4 PASS`, JSON và mã JS nhúng hợp lệ. Chưa triển khai file workflow vào n8n active nên chưa đánh dấu UAT-019 PASS. Lần live retest ngay sau sửa nguồn dùng token UAT local đã hết hạn; n8n dừng ở `Resolve UUID V5` với HTTP 401 và trả body rỗng cho toàn bộ request, do đó kết quả này không dùng làm bằng chứng hồi quy chức năng.

## Phạm vi classifier đã đạt

- Nhận diện intent và tham số nghiệp vụ.
- Các câu thiếu khách hàng, sản phẩm hoặc mã chứng từ trả `ASK_FIELD`.
- Phân loại câu tiếp nối có context trả `USE_CONTEXT`; không có context không tự gọi API.
- Mutation chỉ ở mức preview/routing, không tự ghi dữ liệu trong regression.
- Câu không hỗ trợ và câu không xác định không bị định tuyến nhầm sang API nghiệp vụ.
- Hai workflow `MAIN_ChatBot_V5` và `AI_Intent_Parser` có cùng classifier contract hiện tại.

## Phần chưa chạy

Đã chạy bộ `live` gồm 31 ca qua gateway local với token tạm và fixture đúng phạm vi. Chưa đạt do 3 ca nêu trên. Chuỗi nhiều lượt thực tế vẫn chưa được coi là đạt riêng nếu chưa có bằng chứng bổ sung.

Do đó chưa đủ bằng chứng để đánh dấu toàn bộ UAT-019 `[x] PASS` trên runtime. Còn cần:

1. Xác định nguyên nhân và chạy lại `upsell`, `product-search`, `catalog`.
2. Nếu endpoint remote là môi trường nghiệm thu, chạy smoke rồi chạy đủ live trên `https://medtest.bms7.net/api/gateway`.
3. Kết quả runtime đạt ít nhất 95% và không có lỗi P0/P1 chưa được chấp nhận.

## Lệnh hoàn tất runtime

Không ghi token vào source hoặc báo cáo. Đặt token tạm trong đúng cửa sổ PowerShell:

```powershell
$env:MEDSTAND_AUTH_TOKEN = '<token-UAT-tạm>'
$env:MEDSTAND_TEST_CUSTOMER = '<khách-thuộc-quyền>'
$env:MEDSTAND_TEST_PRODUCT = '<sản-phẩm-HH1>'
$env:MEDSTAND_TEST_DOCUMENT = '<chứng-từ-thuộc-quyền>'

node scripts/test_natural_chat_system.js smoke --transport gateway --endpoint https://medtest.bms7.net/api/gateway
node scripts/test_natural_chat_system.js live --transport gateway --endpoint https://medtest.bms7.net/api/gateway --report reports/uat019-live.json
```

Sau khi chạy, đóng cửa sổ PowerShell để xóa token tạm.

## Bằng chứng

- `reports/uat019-natural-static-2026-07-31.json`
- `reports/uat019-resilience-2026-07-31.json`
- `reports/uat019-auth-gate-pilot-2026-07-31.json`
- `reports/uat019-live-2026-07-31.json`
