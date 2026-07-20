# Báo cáo Agent A — Phạm vi chỉnh sửa Business Rule v1

**Ngày:** 17/07/2026
**Cập nhật kiểm thử:** 18/07/2026
**Agent:** Agent A — Backend / SQL / Data / n8n
**Trạng thái:** `TECHNICAL_RUNTIME_PASS_BUSINESS_APPROVAL_PENDING` — SQL/API, n8n active version, chatbot triệu chứng, FE contract, full-role Playwright và audit runtime đã pass; negative-identity fixture và các phê duyệt nghiệp vụ/schema còn chờ.
**Baseline:** [`BUSINESS_RULE_BASELINE_V1.md`](BUSINESS_RULE_BASELINE_V1.md)
**Kế hoạch chung:** [`KE_HOACH_TRIEN_KHAI_BUSINESS_RULE_V1_2_AGENT.md`](KE_HOACH_TRIEN_KHAI_BUSINESS_RULE_V1_2_AGENT.md)

## 1. Kết luận nhanh để theo dõi

Đợt này đã chỉnh các điểm có bằng chứng trực tiếp trong source và ít rủi ro phụ thuộc schema:

| Nhóm | Đã chỉnh | Kết quả |
|---|---|---|
| Gợi ý đơn hàng | Từ 3 hóa đơn trở lên đủ điều kiện tính chu kỳ; bỏ `TonKho` giả là số ngày; thêm `ConLaiNgay`, reason/data window và stock fail-safe | Source và runtime `medtest` đã pass |
| Tuyến bán hàng | Lần mua cuối chỉ lấy hóa đơn hợp lệ; chu kỳ dùng ngưỡng 3 hóa đơn; công khai rằng nguồn check-in chưa có | Đã sửa source, chưa gọi là tối ưu bản đồ |
| Chấm điểm | “Nguy cơ” không còn bị ép thành Tier C; chuyển thành `RiskLevel=HIGH`; đánh dấu `NEW_CUSTOMER` | Đã sửa source |
| Tích lũy | Không cộng `AR_OrderTbl`; chỉ dùng invoice/return hợp lệ; khóa customer scope; thêm trạng thái/effective date và metric canonical | Source và runtime `medtest` đã pass |
| Upsell | Không cộng đơn nháp; chỉ dùng invoice status `3/6/7/8`; chỉ gợi ý hàng có số bán dương trong kho được phân quyền; loại lô hết hạn/tồn âm | Source và runtime `medtest` đã pass |
| Doanh số | Coordinator chọn Option C: tách doanh số đã xuất/giao và doanh thu đã thu; dùng `AR_OrderAndReturnView.TotalAmount`, cộng return 99 theo dấu âm sẵn có | Source và runtime `medtest` đã pass; payment-ledger/VAT approval còn chờ |
| Tồn kho | Theo quyết định mới, trả `AvailableStock` bằng tồn dương chưa hết hạn trong đúng kho được phân quyền; lô hết hạn/tồn âm trả `0` | Source và runtime `medtest` đã pass |
| Khuyến mãi | Gắn `REFERENCE_ONLY_APPROVAL_REQUIRED`, không biến đề xuất thành lệnh áp giá | Đã sửa output contract |
| Cấu hình | Thêm migration versioned, seed ở trạng thái `DRAFT`, không tự áp ngưỡng chưa duyệt | Đã deploy `medtest`; 6 dòng `DRAFT`, không tự active |
| n8n | Chuẩn hóa envelope/metadata/error taxonomy/validation; nhánh triệu chứng gọi API SQL canonical và không phụ thuộc Redis/OpenAI/Qdrant | Active version khớp source; runtime symptom HTTP 200/10 rows; 13/13 account, 312/312 read, 52/52 deny và audit pass |

Frontend đã được cập nhật để hiển thị cột `Có thể bán` bằng số từ BE; chỉ hiển thị “Chưa kiểm tra kho” khi API thật sự chưa truy vấn kho. Các field quy tắc kỹ thuật không hiển thị cho người dùng.

## 2. File đã chỉnh trong đợt 1

| File | Thay đổi chính | Rule liên quan |
|---|---|---|
| `sql/Module 1 - API_GoiYDonHang_AI.sql` | `>=3` là `PERSONAL_CYCLE_ELIGIBLE`; bắt buộc customer; chuẩn hóa validation/scope; đổi `TonKho` sai nghĩa thành `ConLaiNgay`; thêm recommendation/stock fail-safe contract | `BR-SALES-001`, `BR-SALES-006`, `BR-STOCK-001..005`, `BR-PROGRAM-004` |
| `sql/Module 2 - API_TuyenBanHang_AI.sql` | Chỉ dùng invoice cho `LanMuaCuoi`; status hợp lệ; chu kỳ tối thiểu 3; trả `LastPurchaseSource`, `LastVisitStatus`, `RuleVersion` | `BR-ROUTE-001..004`, `BR-SALES-001` |
| `sql/Module 3 - API_ChamDiemKH_AI.sql` | Tách nhãn “nguy cơ” sang `RiskLevel=HIGH`; đánh dấu khách chưa đủ lịch sử là `NEW_CUSTOMER`; thêm `RuleSource`/`RuleVersion` | `BR-TIER-001..005`, `BR-CUSTOMER-001` |
| `sql/Module 4 - API_TichLuy_AI.sql` | Bỏ `AR_OrderTbl`; chỉ trừ return hợp lệ; khóa customer scope; không dùng chương trình hết hạn; thêm `ProgramStatus`, effective date, canonical metrics và draft version | `BR-SALES-001/002`, `BR-PROGRAM-002/004` |
| `sql/Module 5 - API_UpsellGoiY_AI.sql` | Doanh số tháng chỉ lấy invoice hợp lệ; bỏ fallback chọn chương trình cũ; không suy tồn khả dụng từ tồn vật lý; thêm stock status và `RuleVersion` | `BR-SALES-001`, `BR-STOCK-001..005`, `BR-PROGRAM-002/004` |
| `sql/Module 6 - API_DeXuatKhuyenMai_AI.sql` | Thêm trạng thái `REFERENCE_ONLY_APPROVAL_REQUIRED` và version để UI/API không hiểu đây là lệnh áp chiết khấu | `BR-ACTION-004` |
| `sql/Module common - API_DoanhSo_AI.sql` | Giữ `Doanh Số` tương thích ngược; thêm `DoanhSoDaXuat`, `DoanhThuDaThu`, `RevenueRecognition`; chuyển basis sang `TotalAmount` theo Option C | `BR-SALES-001..003` |
| `sql/Module common - API_DanhsachTonKho_AI.sql` | Trả `AvailableStock` theo tồn dương chưa hết hạn trong kho được phân quyền; chặn lô hết hạn/tồn âm | `BR-STOCK-001..005`, `BR-DEC-20260719-037` |
| `sql/Migrate_Business_Rule_Baseline_V1_AI.sql` | Tạo bảng config version/effective/approver; seed 6 cấu hình `DRAFT`; tạo `AI_GetBusinessRuleConfig` chỉ đọc dòng `APPROVED` | `BR-SALES-006`, `BR-ROUTE`, `BR-STOCK-005`, `BR-PROGRAM-002`, `BR-TIER-005` |
| `tests/business_rule_v1_source.test.js` | Smoke test tĩnh cho ownership, canonical route, không cộng order, Tier/Risk, stock contract, migration và n8n nodes | Regression source |
| `n8n/API_Services/API_Execute.json` | Envelope tương thích ngược kèm `status`, `errorCode`, `ApiCode`, `contractVersion`, metadata; validation trước SQL và taxonomy chuẩn | API gateway source |
| `n8n/AI_Core/MAIN_ChatBot_V5.json` | Truyền metadata/error taxonomy; bỏ query tồn vật lý trực tiếp ở nhánh symptom; trả `AvailableStock=NULL` | Chatbot source |
| `scripts/test_business_rule_v1_n8n_contract.js` | Regression cho envelope, no-SQL-on-invalid-input và symptom stock fail-safe | n8n contract |
| `chatbot-widget/js/chatbot.js` | Thêm nhãn/formatter theo field BE; hiển thị `NULL` là chưa xác định; chuẩn hóa `ApiCode` | FE renderer contract |
| `chatbot-widget/js/chatbot-api-engine.js` | Giữ `NO_DATA`, `OUT_OF_SCOPE`, `VALIDATION_ERROR`, `SYSTEM_ERROR` và `errorCode` từ response BE | FE API contract |
| `scripts/test_business_rule_frontend_contract.js` | Regression cho formatter/status/error taxonomy FE | FE contract test |

## 3. Phân tích chi tiết theo work package

### A0 — Khóa baseline và canonical source

**Mục tiêu:** Chỉ có một nguồn SQL cho tuyến và một bộ field contract.

- Canonical hiện tại: `sql/Module 2 - API_TuyenBanHang_AI.sql`.
- `sql/API_TuyenBanHang_AI.sql` đã bị xóa ở commit hiện tại; Agent A không tạo lại bản trùng.
- Migration cấu hình tách riêng, không sửa các migration remediation đã chạy trước đó.
- Khi triển khai thật vẫn phải đối chiếu `OBJECT_DEFINITION`, `modify_date` và checksum trên SQL Server; source trong Git không chứng minh object đang chạy trên server.

**Trạng thái:** `MEDTEST_RUNTIME_VERIFIED` — canonical source và 8 object trên `medtest` đã được đối chiếu definition, `modify_date` và SHA-256; production vẫn chưa nằm trong phạm vi lượt này.

### A1 — Doanh số và dashboard KPI

**Bằng chứng DB:** `TotalAmount` khớp công thức sau chiết khấu cho đơn bán và return; `Amount` lệch đáng kể ở status 8. Coordinator đã chọn Option C.

**Đã chỉnh:**

- Gắn `RevenueBasis=AR_OrderAndReturnView.TotalAmount` ở các result set dashboard, nhân viên, khách hàng, sản phẩm và `TatCa`.
- Giữ `Doanh Số` là doanh số đã xuất/giao; thêm `Doanh Thu Đã Thu` độc lập và không cộng hai metric với nhau.
- Gắn `RuleVersion=BR-SALES-V1-DRAFT`.
- Không tự trừ VAT vì source chưa chứng minh cột VAT/net VAT; tránh làm sai KPI tài chính.

**Còn phải làm sau khi có xác nhận tài chính/schema:**

1. Owner tài chính xác nhận công thức cộng trực tiếp return status `99` đã mang dấu âm.
2. Xác định `TotalAmount` là net chưa VAT hay tổng thanh toán; không quay lại dùng `Amount` nếu chưa có evidence mới.
3. Tạo fixture invoice hợp lệ, invoice hủy, return và adjustment để đối chiếu tổng.
4. Chỉ sau khi ký tài chính mới đổi `BR-SALES-001..003` từ `DRAFT` sang `APPROVED`.

**Runtime `medtest`:** procedure đã compile/import và EXEC read-only thành công. Đối soát xác nhận `TotalAmount` của return status `99` đã mang dấu âm; công thức đúng là cộng trực tiếp signed return, không đảo dấu lần hai. Nhãn `DoanhThuDaThu` vẫn là proxy status `8` cho tới khi đối soát payment ledger được duyệt.

### A2 — Tồn kho và phạm vi kho

**Hiện trạng đã đọc:** API lấy giao dịch từ `IV_StockTransactionTbl`, lọc kho theo `SY_UserStoreHouseTbl`, manager có thể nhận scope của user dưới quyền; tổng hiện tại là `SUM(Quantity)`.

**Đã chỉnh:**

- Tách rõ `PhysicalStock` khỏi `AvailableStock`.
- `AvailableStock` tạm dùng tồn dương chưa hết hạn trong đúng kho được phân quyền theo quyết định `BR-DEC-20260719-037`.
- `EXPIRED_NOT_SELLABLE` và `STOCK_RECONCILIATION_REQUIRED` luôn trả số có thể bán bằng `0`.
- ERP reservation/blocked stock vẫn là câu hỏi mở; khi xác nhận được phải thay công thức tạm bằng nguồn chính thức.
- Giữ fail-closed nếu user không có warehouse scope.

**Còn phải làm:**

1. Inventory schema discovery trên DB: reservation, blocked, damaged, expired, updated-at.
2. Chốt mapping kho chính, `DL02`, `DL03` theo user/role/branch.
3. Viết công thức `AvailableStock = physical - held - blocked - damaged - expired` chỉ khi có nguồn thật.
4. Thêm `StockUpdatedAt`, `FreshnessStatus` và test stale-data.

**Blocker:** chưa có bằng chứng tên bảng/cột reservation và thời điểm cập nhật trong checkout.

### A3 — Gợi ý đơn hàng và chu kỳ mua

**Đã chỉnh:**

- Chỉ invoice status hoàn tất `IN (3,6,7,8)` trong lịch sử và mùa vụ; không còn tính nhầm status `1/2`.
- Từ 3 hóa đơn trở lên chỉ là điều kiện đủ mẫu để tính chu kỳ cá nhân; output dùng `DoTinCay=PERSONAL_CYCLE_ELIGIBLE`.
- Chưa kết luận `HIGH/MEDIUM/LOW`: confidence thật còn phải xét độ biến động khoảng cách mua, độ mới dữ liệu và return/bất thường.
- Ít hơn 3 hóa đơn dùng fallback 30 ngày với `RuleSource=LEGACY_DEFAULT`, không gọi là Business Rule v1 đã duyệt.
- Đơn nháp không còn làm sản phẩm bị loại khỏi gợi ý “đã mua hôm nay”.
- Không còn lấy promotion/focus program hết hạn làm tín hiệu hiện hành.
- Cột `TonKho` sai nghĩa đã được thay bằng `ConLaiNgay`; API trả `AvailableStock=NULL`, `StockDataStatus=PHYSICAL_STOCK_NOT_QUERIED`.
- Input thiếu khách trả `VALIDATION_ERROR`; khách ngoài quyền trả `OUT_OF_SCOPE` thay vì dòng dữ liệu giả.
- Đã trả `RecommendationReason` và `DataWindow` trên result cá nhân hóa.

**Còn phải làm:**

- Fallback đúng thứ tự khách–nhóm sản phẩm → khách–toàn bộ → nhóm tương tự → mặc định cấu hình.
- Lọc theo `AvailableStock` sau khi schema tồn khả dụng được xác nhận.
- Hoàn thiện fallback nhóm tương tự và confidence thống kê sau khi có config `APPROVED`.

### A4 — Tuyến bán hàng

**Đã chỉnh:**

- `LanMuaCuoi` chỉ lấy invoice hợp lệ; không dùng `AR_OrderTbl` để suy ra đã mua.
- Chu kỳ tuyến dùng ngưỡng 3 invoice để tránh coi 1–2 giao dịch là chu kỳ cá nhân chắc chắn.
- Output ghi `LastPurchaseSource=AR_InvoiceTbl`.
- Output ghi `LastVisitStatus=CHECKIN_SOURCE_UNAVAILABLE`; hiện tại không giả mạo `LastVisit` từ ngày mua.

**Còn phải làm:**

- Tìm nguồn check-in/visit thật trong schema và nối vào `LastVisit`.
- Giữ tuyến do công ty khai báo làm tuyến chính.
- Chỉ xếp hạng 5–8 khách trong scope; chưa gọi là tối ưu bản đồ/đường đi.
- Thêm reason code cho khách ngoài tuyến.

**Blocker:** chưa có bảng check-in được chứng minh trong source hiện tại.

### A5 — Tier và Risk

**Đã chỉnh:**

- Input “nguy cơ” không còn map thẳng sang `Nhom=C`.
- Input đó chuyển thành `RiskLevel=HIGH`, còn `Nhom/ValueSegment` vẫn là giá trị A/B/C.
- Khách không có lịch sử được hiển thị `NEW_CUSTOMER` thay vì tự xếp rủi ro chỉ vì thiếu dữ liệu.

**Còn phải làm:**

- Đưa trọng số/ngưỡng/percentile config ra bảng versioned.
- Chốt override theo miền/chi nhánh/kênh.
- Thêm effective date, approver, reason vào result/audit.
- Test trường hợp `Tier=A` đồng thời `RiskLevel=HIGH`.

### A6 — Tích lũy và chương trình

**Đã chỉnh:**

- `API_TichLuy_AI` không cộng `AR_OrderTbl`; chỉ invoice hợp lệ.
- Vẫn trừ return ở luồng hiện có.
- Danh sách sản phẩm chưa mua cũng chỉ nhìn invoice hợp lệ.
- Khi không truyền program, chỉ chọn chương trình đang trong khoảng hiệu lực; không lấy chương trình hết hạn làm fallback.
- Chỉ trừ return có `Status=1`, `KhongTruDSWeb=0`; khoảng ngày bao gồm trọn ngày kết thúc.
- Khóa customer scope bằng `AR_GetObjectByUserFnc`; trả `VALIDATION_ERROR`/`OUT_OF_SCOPE` đúng taxonomy.
- Trả `ProgramStatus`, `EffectiveFrom`, `EffectiveTo`, `Achieved`, `Target`, `Remaining`, `RuleVersion=BR-PROGRAM-V1-DRAFT`.

**Còn phải làm:**

- Xác định cột `Approved/Active/Stackable` thực tế của bảng chương trình.
- Không cộng chồng chương trình nếu `Stackable` không cho phép.
- Test return, hủy invoice, nhiều mốc quà và hết hạn.

### A7 — Upsell và chương trình khuyến mãi

**Đã chỉnh:**

- Upsell không cộng đơn nháp vào doanh số tháng.
- Upsell chỉ lấy invoice status `3/6/7/8`, đọc tồn từ `IV_StockTransactionTbl` theo kho được phân quyền.
- Upsell chỉ trả sản phẩm có `AvailableStock > 0`; không dùng `IV_StockTbl` vì bảng đó không có `StoreHouseID`.
- API khuyến mãi trả `ActionStatus=REFERENCE_ONLY_APPROVAL_REQUIRED` và `RuleVersion`, tránh hiểu là đã được duyệt áp giá.

**Còn phải làm:**

- Xác định khung chiết khấu đã duyệt và giới hạn theo role.
- Thêm margin/cost nếu CEO cần quyết định xả hàng.
- Trả trạng thái `DECISION_REQUIRED` khi thiếu phê duyệt.
- Không cho workflow mutation tự áp giá hoặc phát hành chương trình.

### A8 — n8n API contract, validation và audit

**Hiện trạng đã đọc:** `n8n/API_Services/API_Execute.json` đã có capability gate, verified identity, validation trước SQL, response envelope, request ID và audit success/error; `MAIN_ChatBot_V5.json` đã có intent/context/validation.

**Đã publish runtime có backup/rollback** ngày 17–18/07/2026. Active version của `API_Execute`, `API_GetConfig`, `API_ListActive` và `MAIN_ChatBot_V5` khớp source. Full-role UAT pass 13/13 tài khoản, 312/312 API đọc và 52/52 mutation-deny; Playwright pass 21 ca, skip 2 ca mutation sandbox đúng guard; audit DB pass 8/8 rows với transaction không bắt đầu và idempotency chỉ lưu SHA-256.

Dedicated chat E2E cho `@doanh_so` và `@tim_san_pham_theo_trieu_chung` đều pass. Câu triệu chứng mơ hồ trả `ASK_CLARIFICATION`; câu đủ rõ trả HTTP 200, JSON parse thành công, 10 rows, `StockDataStatus=PHYSICAL_STOCK_NOT_QUERIED`, `RecommendationStatus=REFERENCE_ONLY_MEDICAL_REVIEW_REQUIRED`, có disclaimer và `RuleVersion=BR-MED-V1-DRAFT`. Nhánh này đã chuyển sang API canonical nên không còn bị Redis credential chặn runtime.

**Đã chỉnh source:**

- Bổ sung ruleVersion/data freshness/source vào response envelope.
- Chuẩn hóa `NO_DATA`, `OUT_OF_SCOPE`, `VALIDATION_ERROR`, `SYSTEM_ERROR` trên mọi path.
- Flow symptom không còn query `IV_StockTbl`/`QuantityinStock`; trả `AvailableStock=NULL`, `PHYSICAL_STOCK_NOT_QUERIED`.
- Đối chiếu role từ `Shared_Auth_Guard`, không tin profile do client tự gửi.
- Kiểm tra log chỉ lưu hash/request ID, không lưu token/mật khẩu/PII.

**Còn phải làm:** bổ sung token fixture runtime cho identity `unmapped` và `no-scope`, sau đó rerun bốn live auth cases. Symptom-specific runtime không còn là blocker kỹ thuật.

### A9 — Test và evidence

**Đã có:** `tests/business_rule_v1_source.test.js` kiểm tra 38 điều kiện nguồn; n8n Business Rule contract và toàn bộ P0 pass; SQL compile/smoke/post-deploy trên `medtest` đã pass cho migration và 8 procedure.

**Đã chạy ngày 18/07/2026:** full-role/cross-scope API UAT, mutation-deny, response envelope/request ID, Playwright, audit runtime và symptom-specific runtime. Các case nghiệp vụ Tier/Risk, program stacking, VAT/payment ledger, available stock và check-in vẫn cần owner dữ liệu/nghiệp vụ xác nhận fixture trước khi gọi Business PASS.

## 4. Trình tự import an toàn lên SQL Server

Đã thực hiện trên `medtest` ngày 17/07/2026 theo đúng thứ tự sau; chưa triển khai production:

1. Đã chụp `OBJECT_DEFINITION`, `modify_date`, checksum các procedure hiện có.
2. Đã import `sql/Migrate_Business_Rule_Baseline_V1_AI.sql` trước; tạo 6 cấu hình `DRAFT`.
3. Đã compile/import từng procedure Agent A: doanh số → tồn kho → gợi ý → tuyến → Tier/Risk → tích lũy → upsell → khuyến mãi.
4. Đã chạy các câu `EXEC` fixture chỉ đọc bằng user có scope thật trên DB test.
5. Đã kiểm tra không có result `AvailableStock` giả và không có `AR_OrderTbl` trong luồng official sales/loyalty/route. Upsell cũng không còn xếp hạng hoặc lọc bằng tồn vật lý.
6. Chỉ publish n8n sau khi response contract và SQL result đã đối chiếu.
7. Chạy UAT Manager/TDV; không chạy mutation thật.

## 5. Điều kiện để chuyển trạng thái `DONE`

- [x] SQL Server compile/import pass cho toàn bộ file Agent A trên `medtest`.
- [ ] Có DB evidence chứng minh net revenue, return, VAT.
- [ ] Có schema evidence cho available stock và check-in.
- [ ] Có business sign-off cho doanh số/VAT, warehouse scope, discount và medical content.
- [x] n8n published workflow pass contract/security/audit regression và symptom-specific runtime; 4 negative-identity live fixtures là evidence bổ sung còn chờ.
- [ ] Agent B nhận Contract Pack final có `RuleVersion`, `AvailableStock`, `StockUpdatedAt`, `CustomerTier`, `RiskLevel`, `ProgramStatus`, error taxonomy.
- [ ] Người dùng chạy UAT và ký Business PASS; Technical PASS hoặc build pass riêng không đủ.

## 6. Tự kiểm thử lượt này

Lệnh đã chạy:

```powershell
node tests/business_rule_v1_source.test.js
node scripts/test_api_execute_validation.js
node scripts/test_api_execute_response_envelope.js
node scripts/test_shared_auth_guard_contract.js
node scripts/test_symptom_keyword_required_contract.js
node scripts/test_business_rule_v1_n8n_contract.js
npm.cmd run test:p0
npm.cmd run test:release-local
node scripts/test_all_uat_accounts_readonly.js --resume
npx.cmd playwright test
npm.cmd run test:p2-04-audit
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test_p1_04_uat.ps1
node -e "for (const f of ['n8n/API_Services/API_Execute.json','reports/backend-rule-static-source-result.json']) JSON.parse(require('fs').readFileSync(f,'utf8')); console.log('JSON_PARSE_PASS')"
git diff --check
```

Kết quả:

- `business-rule-v1-source`: `STATIC_SOURCE_PASS`, 38 checks.
- Business Rule v1 n8n source contract: `STATIC_CONTRACT_PASS`; toàn bộ `npm.cmd run test:p0` pass, auth regression có `0 failed` (`40 passed`, `4 blocked` do cần runtime/account state).
- API Execute validation, response-envelope, Shared Auth Guard và symptom keyword contract: `STATIC_CONTRACT_PASS` (đọc source/JSON, chưa phải runtime PASS).
- JSON parse của workflow và static evidence: `JSON_PARSE_PASS`.
- `git diff --check`: không phát hiện whitespace lỗi trong các file vừa sửa.
- Migration đã được rà soát tĩnh: có transaction/XACT_ABORT, insert-if-missing, không UPDATE/DELETE rule đã APPROVED; procedure chỉ đọc `APPROVED`.
- Hướng rollback đã ghi rõ: batch lỗi tự `ROLLBACK`; import test thành công phục hồi bằng object definition/checksum trước import, không tự `DROP` bảng có rule `APPROVED`.
- SQL Server runtime `medtest`: migration + 8 procedure compile/import/EXEC pass; post-deploy xác nhận đủ 8 definition, RuleVersion marker và official-sales source check.
- Tier runtime trả `RuleSource=LEGACY_PERCENTILE_DRAFT`, `RuleVersion=BR-TIER-V1-DRAFT`.
- Upsell runtime trả `AvailableStock > 0` cho các sản phẩm được gợi ý và khớp tổng tồn hợp lệ của đúng kho user.
- Gợi ý đơn hàng runtime trả `ConLaiNgay`, `AvailableStock=NULL`, `RecommendationReason`, `DataWindow`; không còn field `TonKho` sai nghĩa.
- Tích lũy runtime trả program contract draft và chỉ trừ return hợp lệ; customer ngoài scope bị chặn trước truy vấn nghiệp vụ.
- Kiểm tra publish state xác nhận `API_Execute` và `MAIN_ChatBot_V5` active version khớp source mới.
- Full-account UAT: 13/13 tài khoản PASS, 312/312 API đọc PASS, 52/52 mutation-deny PASS trên ba miền.
- Playwright final: 21 PASS, 2 skip đúng mutation sandbox guard, 0 unexpected; test harness debt dùng relative same-origin để không bị CSP chặn giả.
- Audit runtime: 8/8 rows PASS; mutation không mở transaction và idempotency key chỉ lưu SHA-256.
- P1-04 runtime envelope/auth: 6/6 PASS với token mới.
- Dedicated chat `@doanh_so`: PASS; symptom mơ hồ: PASS `ASK_CLARIFICATION`; symptom cụ thể: PASS HTTP 200/10 rows với stock fail-safe, medical disclaimer và draft rule version.
- Live auth regression: 40 PASS, 4 BLOCKED vì thiếu fixture token `unmapped`/`no-scope`, 0 FAIL.

## 7. Handoff cho Agent B

Agent B chỉ được tích hợp UI sau khi Coordinator khóa Contract Pack. Các field mới/đáng chú ý:

- Doanh số: `RevenueBasis`, `RuleVersion`.
- Tồn kho: `PhysicalStock`, `AvailableStock`, `StockDataStatus`, `RuleVersion`.
- Gợi ý: `DoTinCay=PERSONAL_CYCLE_ELIGIBLE/INSUFFICIENT_HISTORY`, `RuleSource`, `RuleVersion`.
- Tuyến: `LastPurchaseSource`, `LastVisitStatus`, `RuleVersion`.
- Tier/Risk: `Nhom`, `ValueSegment`, `RiskLevel`, `NEW_CUSTOMER` trong lý do.
- Upsell: `PhysicalStock`, `AvailableStock`, `StockDataStatus`, `RuleSource`, `RuleVersion`.
- Khuyến mãi: `ActionStatus=REFERENCE_ONLY_APPROVAL_REQUIRED`.

UI hiển thị `AvailableStock` thành cột `Có thể bán`; `NULL` chỉ dùng cho API chưa truy vấn kho và phải hiện “Chưa kiểm tra kho”. Không hiển thị đề xuất chiết khấu như mức đã duyệt, và không gọi `CHECKIN_SOURCE_UNAVAILABLE` là “đã ghé”.

## 8. Status dictionary đã đối chiếu trên `medtest`

Discovery cho thấy filter legacy `NOT IN (-2,-1,0,10)` đã trộn mã trạng thái order với invoice và vô tình tính cả invoice status `1/2`. Các procedure Agent A hiện dùng whitelist invoice hoàn tất `IN (3,6,7,8)`:

| Invoice StatusID | Tên trên ERP `medtest` | Dùng trong doanh số hoàn tất? | Ghi chú |
|---:|---|---|---|
| 0 | Lập hóa đơn | Không | Chưa hoàn tất |
| 1 | Đơn đã xử lý chưa chuyển kho | Không | Không được tính |
| 2 | Đã chuyển xuống kho | Không | Không được tính |
| 3 | Đã xuất hàng | Có | Fulfilled |
| 6 | Đã đi gửi hàng | Có | Fulfilled |
| 7 | Khách đã nhận hàng | Có | Fulfilled |
| 8 | Đã thu tiền | Có | Fulfilled; `isReceiptStatus=1`, vẫn là proxy thu tiền |
| 10 | Khách từ chối nhận hàng | Không | Không được tính |

Order dictionary riêng ghi `-2=TDV Kiểm tra lại`, `-1=Đơn nháp`, `0=Chờ duyệt`, `10=Đã hủy`. Status mapping đã được quan sát trên runtime, nhưng owner ERP vẫn phải ký trước production; riêng “đã thu tiền” cần payment-ledger reconciliation để phân biệt thu đủ/thu một phần.

## 9. Runtime preparation đã tạo

- [`sql/diagnostics/Business_Rule_V1_Schema_Discovery.sql`](../sql/diagnostics/Business_Rule_V1_Schema_Discovery.sql) — read-only schema/status/object discovery.
- [`sql/diagnostics/Business_Rule_V1_Revenue_Option_C_Verification.sql`](../sql/diagnostics/Business_Rule_V1_Revenue_Option_C_Verification.sql) — read-only fixture đối soát `TotalAmount`, hai metric Option C và công thức return.
- [`sql/diagnostics/Business_Rule_V1_PreDeploy_Verification.sql`](../sql/diagnostics/Business_Rule_V1_PreDeploy_Verification.sql) — read-only gate trước import.
- [`sql/diagnostics/Business_Rule_V1_PostDeploy_Verification.sql`](../sql/diagnostics/Business_Rule_V1_PostDeploy_Verification.sql) — read-only kiểm tra sau import.
- [`backend-rule-schema-discovery.md`](../reports/backend-rule-schema-discovery.md) — discovery read-only đã chạy trên `medtest`; còn blocker nghiệp vụ/schema về payment ledger, available stock, freshness và check-in.
- [`backend-rule-medtest-runtime-result.json`](../reports/backend-rule-medtest-runtime-result.json) — gate runtime, checksum 8 procedure và danh sách blocker còn mở, không chứa credential.
- [`backend-rule-n8n-source-result.json`](../reports/backend-rule-n8n-source-result.json) — evidence source/P0, active-version match, full-role HTTP UAT, Playwright, audit và symptom blocker.
- [`backend-rule-full-test-result.json`](../reports/backend-rule-full-test-result.json) — tổng hợp full-role UAT, Playwright, audit và blocker symptom/auth fixture ngày 18/07/2026.
- [`business-rule-v1-decision-log.json`](../reports/contracts/business-rule-v1-decision-log.json) — sổ quyết định nghiệp vụ; `BR-DEC-20260719-037` thay kế hoạch tồn cũ bằng quy ước tạm dùng tồn dương chưa hết hạn trong kho được phân quyền làm số có thể bán.
- [`business-rule-v1-implementation-backlog.json`](../reports/contracts/business-rule-v1-implementation-backlog.json) — map đủ 33 quyết định sang owner, file, P0/P1/P2, trạng thái implement và next action.
- [`KE_HOACH_PILOT_READ_ONLY_BUSINESS_RULE_V1.md`](KE_HOACH_PILOT_READ_ONLY_BUSINESS_RULE_V1.md) — kế hoạch patch P0/P1, blocker handoff và pilot read-only Sale/Manager/Admin ba miền.
- [`field-compatibility-map.md`](../reports/field-compatibility-map.md) — map field cho Agent B.
- [`backend-rule-static-source-result.json`](../reports/backend-rule-static-source-result.json) và Markdown — liệt kê đủ 38 static checks.

**Kết luận:** Agent A đạt `STATIC_SOURCE_PASS`, `MEDTEST_SQL_RUNTIME_PASS`, `N8N_ACTIVE_VERSION_MATCH_PASS`, `FULL_ROLE_HTTP_UAT_PASS`, `SYMPTOM_RUNTIME_PASS`, `FRONTEND_CONTRACT_PASS`, `PLAYWRIGHT_PASS` và `AUDIT_RUNTIME_PASS`. Chưa được gọi là Business PASS/production-final vì bốn live negative-identity cases thiếu fixture token và các blocker schema/nghiệp vụ vẫn chưa được owner ký duyệt.
