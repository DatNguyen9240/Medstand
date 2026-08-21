# CUSTOMER-UAT-001 — Chuỗi dữ liệu tối thiểu và cách lấy bằng chứng

Ngày lập: 21/08/2026. Môi trường: `medtest`.

Tài liệu này trả lời đúng một câu hỏi: **một khách hàng mới và một sản phẩm mới cần những gì để
lập được đơn**, và làm sao chứng minh được điều đó mà không tự chế dữ liệu cho test pass.

## 1. Chuỗi phụ thuộc

Mỗi lớp là điều kiện cần. Hỏng một lớp thì UI chỉ nói "không tìm thấy" — nguyên nhân thật nằm ở đây.

| Lớp | Điều kiện bắt buộc | Bảng/hàm quyết định |
| --- | --- | --- |
| Tài khoản | `Disable = 0`, có `BranchID`, có `EmployeeID` | `SY_User` |
| Quyền kho | Thuộc nhóm global, hoặc có dòng trong `SY_UserStoreHouseTbl` trỏ vào kho bán hàng đã cấu hình | `AI_WarehouseByUserFnc` + `BR-STOCK-001/SalesWarehouseIDs` |
| Khách hàng | `isCustomer = 1`, `isDisable = 0`, **có số điện thoại**, và nằm trong phạm vi tài khoản | `CF_ObjectTbl` + `AR_GetObjectByUserFnc` |
| Sản phẩm | Tồn tại, không bị khóa tại chi nhánh (`IsDisableMB/MN/MT`), `ItemGroupID` nằm trong danh sách được bán | `CF_ItemTbl` + `BR-STOCK-001/SellableItemGroupIDs` |
| Giá | Có ít nhất một bảng giá **còn hiệu lực hôm nay**: giá riêng khách → giá nhóm khách → giá chung. Trong cùng một tầng, `UserAutoID` lớn nhất thắng | Danh mục: `API_HangHoaList_AI` tự dựng lại. Cổng tạo đơn: `AR_LayGiaSanPhamFnc` |
| Tồn | Có kho được cấp quyền, `AvailableStock > 0`, `StockDataStatus = AVAILABLE_FOR_SALE` | `AI_StockAvailableByUserFnc` |
| CTBH | **Tùy chọn.** Hai nguồn: rule cấu hình đã duyệt, hoặc ghi chú note-text trên bảng giá | `AI_ActivePromotionByUserFnc` + `AR_PriceDetailTbl.Notes` |
| Lập đơn | Server kiểm lại khách/giá/tồn + idempotency + audit | `API_DonHangChiTiet_Insert_AI` |

`AvailableStock = PhysicalStock − ReservedStock`. Đơn đang mở giữ hàng, nên tồn kho vật lý còn
mà tồn khả dụng bằng 0 là chuyện bình thường và phải phân biệt được.

## 2. Vì sao cần công cụ riêng

`API_HangHoaList_AI` **loại sản phẩm trước khi trả kết quả**: lọc tồn ở
[dòng 58](../sql/Module%20common%20-%20API_HangHoaList_AI.sql#L58), lọc trạng thái theo chi nhánh ở
[dòng 97](../sql/Module%20common%20-%20API_HangHoaList_AI.sql#L97), và chỉ trả sản phẩm có giá ở
[dòng 237](../sql/Module%20common%20-%20API_HangHoaList_AI.sql#L237). Kết quả là UI chỉ nói được một câu
duy nhất tại [create-order.js:365](../src/js/pages/create-order.js#L365):

> Sản phẩm không còn bán được hoặc không có giá/tồn hợp lệ.

Một câu đó đang gộp ít nhất bảy nguyên nhân khác nhau. Đây là một thiếu sót thật của sản phẩm,
và đã được xử lý bằng task riêng `PRODUCT-DIAG-001` (triển khai 21/08/2026) chứ không sửa lén trong
task UAT — xem bảng mã ở mục 7.

`scripts/uat_data_readiness.js` vẫn giữ nguyên vai trò **oracle độc lập**: nó đi bằng đường khác để
tới cùng một kết luận, nên dùng để canh xem API có nói thật không. Verifier
`scripts/verify_product_diag_001.js` đối chiếu hai bên trên cùng bộ dữ liệu.

## 3. Hai lệnh cần chạy

### 3.1 Chẩn đoán chuỗi dữ liệu

```bash
node scripts/uat_data_readiness.js --user=<tài khoản> --customer=<ObjectID> --item=<ItemID>
node scripts/uat_data_readiness.js --user=<tài khoản> --customer=<ObjectID> --search="<từ khóa>"
```

Script **chỉ đọc**, không ghi gì, không tự tạo dữ liệu. Nó kiểm từng lớp độc lập rồi mới đối chiếu
với chính API mà UI gọi, nên nói được "UI ẩn sản phẩm vì lý do X" thay vì "không tìm thấy".

Ghi manifest kèm thông tin người test:

```bash
node scripts/uat_data_readiness.js --user=demo --customer=DL011 --item=A008 \
  --created-by="<người tạo dữ liệu>" --data-source=UI --cleanup-plan=KEEP \
  --out=reports/uat/<RunID>.json
```

Trạng thái trả về — **cố ý không có "PASS" trần**:

| Status | Exit | Nghĩa |
| --- | --- | --- |
| `READINESS_FAIL` | 1 | Còn lớp FAIL, chưa lập đơn được |
| `EVIDENCE_INCOMPLETE` | 3 | Dữ liệu đủ, nhưng manifest thiếu nguồn gốc do người test khai |
| `READINESS_PASS_WITH_WARNINGS` | 0 | Đủ điều kiện, nhưng có cảnh báo phải đọc trước khi tin |
| `READINESS_PASS` | 0 | Đủ điều kiện và manifest đủ nguồn gốc |
| (lỗi kết nối/cú pháp) | 2 | — |

Script **không bao giờ** phát ra `E2E_PASS`: nó không lập đơn nên không thể chứng minh luồng
chạy được. `E2E_PASS` là kết luận của người chạy UAT sau khi có mã đơn thật.

### 3.2 Quét mã fixture hard-code

```bash
node scripts/scan_fixture_hardcode.js
node scripts/scan_fixture_hardcode.js --token=<mã khách mới> --token=<mã sản phẩm mới>
```

Phân vùng và ý nghĩa:

| Zone | Nghĩa | Có phải lỗi không |
| --- | --- | --- |
| `RUNTIME` | UI, gateway, procedure đang chạy | **Có** — ngoài comment là fail |
| `AUTOMATION` | workflow n8n, prompt AI | Cần người xem xét |
| `DATA` | script seed/migration gắn dữ liệu cụ thể | Không phải lỗi code, nhưng **là phụ thuộc môi trường phải ghi vào manifest** |
| `TEST` / `DOC` | script kiểm thử, tài liệu | Không |

### 3.3 Kiểm chứng chính công cụ

```bash
node scripts/verify_uat_data_readiness.js
```

Chạy công cụ chẩn đoán trên dữ liệu `medtest` thật rồi soi kết quả, canh đúng bốn lỗi từng
sai im lặng: phân loại CTBH, trạng thái nuốt WARN, tie-break giá, và đổ oan nguyên nhân.
Mỗi ca tự kiểm tiền đề dữ liệu trước; mất tiền đề thì báo `SKIPPED` kèm lý do chứ không báo
PASS giả. Kết quả xác minh lại 21/08/2026: **13 PASS / 0 FAIL / 2 SKIPPED**. Hai ca bị bỏ qua vì
`medtest` chưa có CTBH cấu hình `APPROVED` còn hiệu lực và chưa có tài khoản actor-config âm phù hợp;
không được tính hai ca này là PASS.

## 4. Kết quả chạy ngày 21/08/2026

### 4.1 Quét hard-code — PASS

`RuntimeFindings: []` — không token nào trong danh sách quyết định hành vi runtime.
Hai hit còn lại trong vùng runtime đều nằm trong comment:
[chatbot-api-engine.js:5703](../chatbot-widget/js/chatbot-api-engine.js#L5703) và
[routes.js:332](../src/js/pages/routes.js#L332). Ngoài ra có một `ReviewFinding` ở
[AI_Upload_Reader.json:212](../n8n/AI_Core/AI_Upload_Reader.json#L212) — mã `A008` xuất hiện làm ví dụ trong
prompt OCR; không quyết định phân quyền hay dữ liệu, nhưng vẫn nên xem qua.

**Giới hạn của phép quét:** nó chỉ chứng minh *không tìm thấy các token đã khai báo* trong vùng runtime.
Nó không chứng minh source hoàn toàn không còn fixture lạ nào. Sinh định danh UAT mới thì phải thêm
`--token=` cho chính định danh đó rồi quét lại. Số file quét được thay đổi theo thời gian nên cố ý
không ghi vào đây làm bằng chứng.

### 4.2 Phụ thuộc môi trường phát hiện được — phải ghi vào manifest

Không phát hiện fixture trong code, nhưng **dữ liệu cấu hình thì gắn với tài khoản `demo`**:

- `BR-ORDER-ACTOR-001` có đúng một dòng `ConfigKey = 'demo'` → `{"EmployeeID":"DEMO","BranchID":"MB"}`
  ([Migrate_Demo_Order_Actor_AI.sql](../sql/Migrate_Demo_Order_Actor_AI.sql)). Procedure đọc theo
  `ConfigKey = LOWER(@Username)` nên **logic đúng và tổng quát**; chỉ có dữ liệu là riêng cho `demo`.
- Hệ quả: tài khoản UAT mới **không có** dòng này. Nếu tài khoản đó cũng chưa gắn `EmployeeID` thật,
  API trả `USER_SCOPE_INCOMPLETE`. Script chẩn đoán báo `ACCOUNT_EMPLOYEE_FROM_CONFIG` (WARN) đúng ca này.
- Tương tự: `DEMO_KH` trong [Migrate_Demo_Customer_SelfAssign_AI.sql](../sql/Migrate_Demo_Customer_SelfAssign_AI.sql).

**Kết luận: đừng lấy `demo` làm tài khoản UAT.** Nó chạy được nhờ một dòng cấu hình mà tài khoản
thật không có, nên `demo` PASS không chứng minh được gì cho khách.

### 4.3 Chẩn đoán phân biệt được bao nhiêu nguyên nhân

Cùng một câu báo lỗi trên UI, script tách ra được các nguyên nhân khác nhau (chạy thật trên `medtest`):

| Ca | UI hiện nói | Nguyên nhân thật script trả về |
| --- | --- | --- |
| `demo` × `DL011` × `A008` | chọn được | Đủ điều kiện — giá 75.000 (danh mục và cổng tạo đơn khớp), tồn khả dụng 3.303 kho `CTY`, CTBH `PROMOTION_NOTE_TEXT_ONLY` |
| `demo` × `DL011` × `B037` | chọn được, giá 105.000 | Đủ điều kiện — 105.000 ở cả ba nguồn. Sản phẩm này có **hai bảng giá chung cùng hiệu lực** (105.000 và 79.000); thiếu tie-break `UserAutoID` là ra sai 79.000 |
| `demo` × `DL011` × `B043` | không tìm thấy | `STOCK_NO_ROW` + `PRICE_NOT_FOUND` — chưa có bảng giá và chưa có tồn |
| `demo` × `DL011` × `A003` | không tìm thấy | `ITEM_GROUP_NOT_SELLABLE` (nhóm `HH2`) + `STOCK_ZERO_AVAILABLE` + `PRICE_EXPIRED_OR_DISABLED` |
| `demo` × `DL011` × `ZZZ999` | không tìm thấy | `ITEM_NOT_FOUND` — sản phẩm chưa được nhập danh mục |
| `demo` × `KHONGCO999` × `A008` | không tìm thấy | `CUSTOMER_NOT_FOUND` |
| `AnGiangA` × `DL011` × `A008` | không tìm thấy | `WAREHOUSE_SCOPE_REQUIRED` + `CUSTOMER_OUT_OF_SCOPE` — sản phẩm hoàn toàn bình thường |

Ca cuối là ví dụ đúng của việc **không được báo nhầm nguyên nhân**: `AnGiangA` thiếu quyền kho,
nếu cứ đọc cấu hình theo phạm vi của tài khoản thì mọi sản phẩm đều bị kết luận sai là
"nhóm hàng không được bán". Script lấy `BR-STOCK-001` độc lập với người dùng để tránh đúng lỗi đó,
và ghi rõ nguồn trong `StockRuleVersionSource`.

### 4.4 CTBH — hai nguồn, phải test cả hai

`A008` không có CTBH cấu hình đã duyệt trong `AI_ActivePromotionByUserFnc`, **nhưng** bảng giá của nó
mang ghi chú `Mua 10+2 (<10 ck 10%, KHHĐ 10+2,30+8`. Đó là CTBH dạng **note-text** trong
`AR_PriceDetailTbl.Notes`, được frontend parse ở
[create-order.js:483](../src/js/pages/create-order.js#L483) làm đường lùi khi không có rule cấu hình.

Vì vậy lớp `PROMOTION` trả **ba** mã phân biệt, và UAT phải chạy đủ ba ca:

| Mã | Nghĩa | Ca UAT |
| --- | --- | --- |
| `PROMOTION_CONFIG_AVAILABLE` | Có rule cấu hình đã duyệt — khi lập đơn sẽ được ưu tiên áp dụng nếu thỏa điều kiện dòng hàng (số lượng/giá trị) | Kiểm ưu đãi tính theo rule |
| `PROMOTION_NOTE_TEXT_ONLY` | Không có rule, nhưng ghi chú CÓ ưu đãi và sẽ được áp | Kiểm ưu đãi tính theo parser ghi chú |
| `NO_PROMOTION` | Không có ở cả hai nguồn | **Vẫn phải lập đơn bình thường** |

Nếu ca thứ ba bị chặn thì hệ thống đang biến CTBH thành dữ liệu bắt buộc — sai nghiệp vụ.

Kết quả runtime ngày 21/08/2026: `A008` PASS nhánh `PROMOTION_NOTE_TEXT_ONLY` và chỉ giữ mốc `10+2`
trước vế `KHHĐ`; công cụ tự tìm `B038` PASS nhánh `NO_PROMOTION` khi sản phẩm vẫn đủ giá/tồn. Nhánh
`PROMOTION_CONFIG_AVAILABLE` là `SKIPPED` vì môi trường chưa có rule cấu hình `APPROVED` còn hiệu lực,
không phải PASS.

Việc nhận diện ghi chú dùng lại **đúng parser production** (`src/js/utils/promotion.js`), không
viết lại. Nhờ vậy nó cũng canh luôn phần cắt vế `KHHĐ`: với `A008` chỉ mốc `10+2` được áp cho
khách thường, mốc `30+8` phía sau `KHHĐ` phải bị loại.

## 5. Manifest bằng chứng

Script sinh sẵn phần máy đọc được. Phần người phải điền nằm trong `TesterFields`, cố ý để trống
chứ không bịa:

| Trường | Nguồn |
| --- | --- |
| `RunID`, `RunAtUtc`, `Environment` | script |
| `Account` (UserName, BranchID, EmployeeID, UserGroupID) | script |
| `Customer` (ObjectID, ObjectGroupID, SaleID, CreatedBy, CreatedAt) | script |
| `Item`, giá theo cả ba nguồn (`CatalogShown`, `OrderGate`, `DiagnosticTierPick`) + ngày hiệu lực | script |
| kho, tồn vật lý, đã giữ, tồn khả dụng, thời điểm tồn | script |
| CTBH: `PROMOTION_CONFIG_AVAILABLE` / `PROMOTION_NOTE_TEXT_ONLY` / `NO_PROMOTION` | script |
| `DataCreatedBy`, `DataSource`, `CleanupPlan` | người test (`--created-by`, `--data-source`, `--cleanup-plan`) |
| `OrderRequestID`, `OrderIdempotencyKey`, `OrderDocumentID`, `OrderStatusID` | người test, lấy sau khi lập đơn thật |

Thiếu hoặc nhập sai ba trường `DataCreatedBy` / `DataSource` / `CleanupPlan` thì script tự hạ trạng thái xuống
`EVIDENCE_INCOMPLETE` và liệt kê chúng trong `MissingTesterFields`. `DataCreatedBy` phải có ít nhất 2 ký tự;
`DataSource` chỉ nhận `UI|BACK_OFFICE|API`; `CleanupPlan` chỉ nhận `KEEP|DELETE_AFTER_UAT`.

`reports/uat/MAU-DINH-DANG-KHONG-PHAI-BANG-CHUNG.json` là **ví dụ định dạng**, không phải bằng chứng:
nó dùng `demo`/`DL011`/`A008` (dữ liệu cũ từ 2020, không phải dữ liệu mới do đội test tạo) và tự mang
trạng thái `EVIDENCE_INCOMPLETE`.

## 6. Điều KHÔNG được làm

- Không chạy SQL seed để tự chèn khách/sản phẩm rồi lấy chính dữ liệu đó tuyên bố PASS.
- Không sửa `SY_User`, `CF_ObjectTbl`, bảng giá hay tồn kho chỉ để một ca test chạy qua.
- Không dùng `demo` làm tài khoản nghiệm thu (xem mục 4.2).
- Không sửa `API_HangHoaList_AI` để trả nguyên nhân ngay trong task này — đó là `PRODUCT-DIAG-001`,
  cần thiết kế mã lỗi và bàn giao rõ ràng, không phải một bản vá tiện tay.
- Không coi "không có CTBH" là lỗi.
- Không điền `DataCreatedBy` bằng một cái tên cho có. Trường đó phải là người thật đã tạo dữ liệu;
  đối chiếu được với `Customer.CreatedBy` trong cùng manifest.

## 7. Bảng mã `PRODUCT_ORDERABILITY_V1`

Khi request chỉ đích danh một `ItemID` mà sản phẩm không lập đơn được, `API_HangHoaList_AI` trả
`Code` (nguyên nhân chính), `ReasonCodesJson` (toàn bộ nguyên nhân), `IsOrderable = 0`,
`DiagnosticContractVersion` và `EvaluatedAtUtc`. Ca thành công và tìm kiếm rộng giữ nguyên schema cũ.

Thứ tự cột "Ưu tiên" cũng chính là thứ tự chọn `Code` khi một sản phẩm hỏng nhiều điều kiện.

| Ưu tiên | Mã | Câu hiển thị |
| --- | --- | --- |
| — | `INVALID_USER` | Tài khoản không tồn tại hoặc đã bị khóa. |
| — | `CUSTOMER_OUT_OF_SCOPE` | Khách hàng này không thuộc phạm vi được cấp của bạn. |
| 10 | `ITEM_NOT_FOUND` | Không tìm thấy sản phẩm trong danh mục. |
| 20 | `ITEM_DISABLED_AT_BRANCH` | Sản phẩm đang ngừng bán tại chi nhánh của bạn. |
| 30 | `SELLABLE_RULE_UNAVAILABLE` | Cấu hình nhóm hàng được phép bán chưa sẵn sàng. Vui lòng báo quản trị hệ thống. |
| 40 | `ITEM_GROUP_NOT_SELLABLE` | Nhóm sản phẩm này chưa được phép bán. |
| 50 | `WAREHOUSE_SCOPE_REQUIRED` | Tài khoản chưa được phân quyền kho. Vui lòng liên hệ quản trị. |
| 60 | `STOCK_BLOCKED_BY_WAREHOUSE_SCOPE` | Chưa đọc được tồn vì tài khoản chưa có kho nào được cấp quyền. |
| 70 | `STOCK_NO_ROW` | Chưa có dữ liệu tồn trong các kho được cấp quyền. |
| 80 | `STOCK_ZERO_AVAILABLE` | Sản phẩm đã hết tồn khả dụng trong phạm vi kho được cấp quyền. |
| 90 | `PRICE_NOT_FOUND` | Chưa thiết lập bảng giá áp dụng cho khách hàng này. |
| 100 | `PRICE_EXPIRED_OR_DISABLED` | Bảng giá của sản phẩm chưa tới hiệu lực, đã hết hiệu lực hoặc đang bị khóa. |
| 999 | `PRODUCT_DIAGNOSTIC_INCONSISTENT` | Không xác định được nguyên nhân. Vui lòng tải lại danh sách hàng và báo bộ phận kỹ thuật. |

Hai mã bảo vệ hệ thống đáng chú ý:

- `SELLABLE_RULE_UNAVAILABLE` đứng TRƯỚC `ITEM_GROUP_NOT_SELLABLE`. Thiếu cấu hình `BR-STOCK-001`
  thì không được kết luận oan là nhóm hàng không bán được — đó là lỗi cấu hình, không phải lỗi sản phẩm.
- `PRODUCT_DIAGNOSTIC_INCONSISTENT` là fail-closed: chẩn đoán bảo mọi thứ hợp lệ nhưng truy vấn danh mục
  vẫn không trả sản phẩm, nghĩa là hai lớp đang lệch nhau. Báo ra thay vì im lặng.

### Ba nguyên tắc của helper frontend

[product-orderability.js](../src/js/utils/product-orderability.js) là nơi DUY NHẤT ánh xạ mã sang câu
tiếng Việt, dùng chung cho tạo đơn, sửa đơn và panel chatbot:

1. Quyết định theo `Code`, không bao giờ theo chuỗi trong `Msg`. Đổi câu chữ không làm đổi hành vi.
2. Mã lạ hoặc `DiagnosticContractVersion` lạ đều fail-closed — hiển thị câu an toàn, KHÔNG coi là hợp lệ.
3. Response cũ chưa có `Code` vẫn chạy, rơi về câu chung như trước.

### Không lộ dữ liệu ngoài phạm vi

Response chẩn đoán chỉ có 7 cột hợp đồng — không mã kho, không tên kho, không số lượng tồn. Câu hiển thị
nói "trong phạm vi kho được cấp quyền" chứ không kể ra kho nào. API cũng KHÔNG phân biệt "khách không
tồn tại" với "khách ngoài phạm vi": cả hai đều trả `CUSTOMER_OUT_OF_SCOPE`, vì trả lời khác nhau là
xác nhận cho người hỏi biết một `ObjectID` bất kỳ có thật hay không.

```bash
node scripts/verify_product_diag_001.js   # 15 ca, đối chiếu API với oracle chẩn đoán
```
