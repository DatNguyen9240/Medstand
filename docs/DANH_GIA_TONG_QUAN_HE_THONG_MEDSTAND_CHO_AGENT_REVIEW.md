# Đánh giá tổng quan hệ thống Medstand — hồ sơ cho agent độc lập phản biện

**Ngày chốt bằng chứng:** 19/07/2026  
**Môi trường đã kiểm tra:** frontend/gateway local + n8n local đã publish + SQL Server `medtest`  
**Trạng thái:** `PILOT_READ_ONLY_RUNTIME_PASS_BUSINESS_APPROVAL_PENDING`

## 1. Kết luận điều hành

Hệ thống hiện đủ điều kiện tiếp tục pilot read-only với nhóm 13 tài khoản thử nghiệm, nhưng chưa đủ điều kiện gọi là production-final hoặc Business PASS.

Các bằng chứng mạnh nhất tại thời điểm chốt:

- Source Business Rule v1: `STATIC_SOURCE_PASS`, 54 kiểm tra.
- Build và bộ release contract local: PASS.
- Nghiệm thu luồng trọng yếu: 13/13 tài khoản, 104/104 kiểm tra PASS; ma trận 24 API cũng PASS 13/13 tài khoản.
- Danh mục read-only được khóa ở 24 API.
- Upsell bắt buộc chọn khách; khách ngoài chi nhánh bị trả `403 OUT_OF_SCOPE` và không lộ dữ liệu.
- `@lap_don_hang` chỉ tạo giỏ xem trước; chưa gọi procedure ghi đơn.
- Fixture UAT chỉ nằm trên `medtest`, có nhận dạng batch và script rollback riêng.

Điểm chưa được ký:

- Công thức doanh thu đã thu, VAT, trả hàng và payment ledger cần Finance xác nhận.
- Quy ước “có thể bán” hiện dựa trên tồn ERP theo lô/kho/hạn dùng; chưa chứng minh reservation/blocked stock.
- Chưa có nguồn check-in thật.
- Chưa chứng minh cột phê duyệt chương trình khuyến mãi và quy tắc cộng chồng.
- Nội dung y khoa, đặc biệt nhóm trẻ em/red flag, chưa có Medical Owner duyệt.
- Chưa nghiệm thu hình ảnh tự động trên browser thật và chưa deploy production.

## 2. Kiến trúc đang chạy

| Tầng | Thành phần chính | Trách nhiệm | Điểm kiểm soát |
|---|---|---|---|
| Giao diện | `index.html`, `src/`, `chatbot-widget/` | Đăng nhập, menu, form tham số, bảng/card chatbot | Không tự quyết quyền; hiển thị theo response contract |
| Gateway local | `server.js` | Chuyển tiếp request, bảo vệ token, che log nhạy cảm | Authentication, CORS, redaction |
| Điều phối | `n8n/AI_Core/MAIN_ChatBot_V5.json` | Nhận câu tự nhiên hoặc lệnh `@`, chọn intent, quản lý context | Chỉ route vào capability được công bố |
| API contract | `n8n/API_Services/API_ListActive.json`, `API_GetConfig.json`, `API_Execute.json` | Danh mục, form field, validation, allowlist, response envelope, audit | `SUCCESS`, `NO_DATA`, `VALIDATION_ERROR`, `OUT_OF_SCOPE`, `SYSTEM_ERROR` |
| Xác thực dùng chung | `n8n/Shared/Shared_Auth_Guard.json` | Lấy verified identity và capability | Không tin role/profile client để cấp quyền SQL |
| Nghiệp vụ dữ liệu | `sql/*.sql` trên SQL Server `medtest` | Doanh số, công nợ, tồn kho, gợi ý, tuyến, Tier/Risk, khảo sát | Stored procedure + scope theo user/branch/store |
| Bằng chứng | `tests/`, `scripts/`, `reports/` | Static contract, runtime test, deploy snapshot, UAT và rollback | Phân biệt source PASS, runtime PASS và business approval |

Luồng chính: người dùng → frontend/gateway → n8n xác thực/validate/allowlist → stored procedure → n8n chuẩn hóa envelope → frontend render.

## 3. Phạm vi người dùng và dữ liệu

| Vai trò | Phạm vi dự kiến | Trạng thái hiện tại |
|---|---|---|
| Sale/TDV | Khách, kho, đơn và số liệu được ERP cấp cho tài khoản | Đã có runtime test ở nhóm pilot |
| Manager | Phạm vi quản lý và chi nhánh; có thể xem tổng quan rộng hơn Sale | Đã có runtime test ở ba miền; cần rà soát toàn bộ procedure theo cùng một chuẩn branch guard |
| Admin/global | Phạm vi hệ thống theo capability | Có nhánh global trong SQL/n8n; chưa dùng làm lý do bỏ qua audit |

Sự cố đã sửa ngày 19/07/2026: `AR_GetObjectByUserFnc` trả `NDB001` cho hai manager miền Nam. `API_UpsellGoiY_AI` trước đó chỉ tin hàm này nên trả 10 sản phẩm ngoài miền. Bản vá buộc non-global user phải đồng thời đúng `BranchID` và nằm trong hàm ERP. Hai ca cũ hiện trả `403`, `count=0`.

Khuyến nghị cho reviewer bảo mật: tìm cùng mẫu “chỉ tin `AR_GetObjectByUserFnc`” trong tất cả API gắn khách hàng, không suy rằng việc Upsell đã sửa đồng nghĩa toàn bộ 24 API đã có branch guard giống nhau.

## 4. Danh mục 24 API read-only

### Bán hàng và chứng từ

| API | Mục đích |
|---|---|
| `@doanh_so` | Doanh số/thu tiền theo kỳ và phạm vi |
| `@hoa_don` | Danh sách hóa đơn |
| `@hoa_don_chi_tiet` | Chi tiết một hóa đơn |
| `@don_hang` | Danh sách/trạng thái đơn hàng |

### Khách hàng, công nợ và gợi ý

| API | Mục đích |
|---|---|
| `@cong_no_khach_hang` | Tổng hợp khách còn nợ |
| `@cong_no_chi_tiet` | Khoản nợ, thanh toán và hạn của một khách |
| `@tich_luy` | Tích lũy/chương trình của khách |
| `@cham_diem_kh` | Tier giá trị và Risk độc lập |
| `@tuyen_ban_hang` | Danh sách khách ưu tiên trong ngày |
| `@goi_ydon_hang` | Gợi ý mua lại theo lịch sử khách |
| `@upsell_goi_y` | Gợi ý bán kèm bắt buộc gắn một khách cụ thể |

### Sản phẩm, kho và chương trình

| API | Mục đích |
|---|---|
| `@danh_sach_tonkho` | Tồn theo kho/lô/hạn dùng trong scope |
| `@tra_cuu_san_pham` | Tra cứu catalog sản phẩm |
| `@goi_ydon_thuoc` | Gợi ý sản phẩm liên quan từ sản phẩm gốc |
| `@san_pham_trong_tam` | Sản phẩm trọng tâm hiện hành |
| `@de_xuat_khuyen_mai` | Sale xem chương trình được duyệt; Manager/Admin xem danh sách cần xem xét |
| `@tim_san_pham_theo_trieu_chung` | Tra cứu tham khảo theo từ khóa/triệu chứng, có cảnh báo chuyên môn |

### Danh mục, khảo sát và thông báo

| API | Mục đích |
|---|---|
| `@danh_muc` | Nguồn chọn khách, sản phẩm, kho, nhân viên và danh mục hỗ trợ |
| `@danh_sach_cau_hoi_khao_sat` | Bộ câu hỏi khảo sát |
| `@khao_sat360` | Dữ liệu khảo sát 360 |
| `@kiem_tra_khao_sat` | Trạng thái khảo sát |
| `@kiem_tra_khao_sat_ngay` | Trạng thái khảo sát theo ngày |
| `@lich_su_khao_sat` | Lịch sử khảo sát |
| `@thong_bao` | Thông báo trong phạm vi tài khoản |

Ngôn ngữ tự nhiên được phép chọn một capability trong danh mục active; không được tạo dynamic SQL hoặc gọi một `ApiCode` ngoài danh mục. Lệnh `@` là đường đi xác định hơn và vẫn dùng cùng auth/validation/scope.

## 5. Mutation và nguyên tắc an toàn

- `@lap_don_hang`: hiện chỉ trả `uiTemplate=CART`, `PreviewOnly=true`, `transactionOutcome=NOT_STARTED`; chưa gọi stored procedure tạo đơn.
- `@cap_nhat_ket_qua_khao_sat`, `@khach_hang_insert`, `@san_pham_trong_tam_import`: vẫn bị allowlist/capability gate từ chối trong pilot.
- Không được hiểu nút “xác nhận” trên UI là đã được phép mutation production.
- Bất kỳ bước ghi thật nào sau này phải có capability, idempotency key, audit, transaction/rollback và Business sign-off riêng.

## 6. Trạng thái rule nghiệp vụ theo module

| Module | Đã làm | Chưa khóa/điểm cần phản biện |
|---|---|---|
| Doanh số | Chỉ invoice status `3/6/7/8`; dùng `TotalAmount`; return status `99` cộng theo dấu âm; tách doanh số đã xuất và proxy đã thu | Payment ledger, thu một phần, VAT/net/gross và Finance sign-off |
| Công nợ | Tổng và chi tiết theo user scope; có `PARTIALLY_PAID`; thiếu hạn trả `DUE_DATE_UNKNOWN` | Mapping chứng từ mở đầu/khác và payment term cần ERP/Finance xác nhận |
| Tồn kho | Tính số có thể bán từ giao dịch kho đúng scope, lô chưa hết hạn, bỏ tồn âm/hết hạn | Chưa biết ERP có giữ hàng/reservation/blocked; freshness timestamp chưa đầy đủ |
| Gợi ý đơn | Dưới 3 invoice không giả chu kỳ 30 ngày; từ 3 invoice mới đủ điều kiện chu kỳ; loại món đã mua hôm nay | Confidence nâng cao, fallback theo nhóm tương tự và lý do đồng nhất |
| Upsell | Bắt buộc khách; lọc tồn bán dương; branch + ERP function guard; không trả danh sách chung khi thiếu khách | Cần review logic xếp hạng và quan hệ sản phẩm theo business |
| Tuyến/việc hôm nay | Câu “Hôm nay em nên làm gì?” gọi đúng tuyến, tối đa 8 khách; last purchase không giả last visit | Nguồn check-in thật, mặc định 5 hay 8 và lý do ưu tiên thống nhất |
| Tier/Risk | Tier dùng Frequency + Monetary; Recency dùng cho Risk; có khách mới | Trọng số/ngưỡng theo miền/chi nhánh vẫn DRAFT |
| Tích lũy | Không cộng đơn nháp; invoice hợp lệ; không tự chọn chương trình hết hạn | Approved/Active/Stackable và return một phần |
| Khuyến mãi | Role split: Sale chỉ chương trình công ty; Manager/Admin xem sản phẩm cần xem xét; AI không tự đưa % giảm | Nguồn `APPROVED_ACTIVE` chưa chứng minh nên Sale có thể nhận no-data an toàn |
| Y khoa/sản phẩm | Có disclaimer và trạng thái tham khảo; không tự kê đơn/điều trị | Red flag, trẻ em, tuổi/cân nặng/chống chỉ định cần Medical Owner duyệt |
| Khảo sát | Read wrapper và contract hiện có | Mutation kết quả khảo sát chưa mở trong pilot |

## 7. Frontend và trải nghiệm

Đã có:

- Form tham số từ metadata và kiểm tra tham số bắt buộc.
- Renderer riêng cho công nợ, tồn kho, Tier/Risk, gợi ý, khuyến mãi và bảng mở rộng.
- Bộ lọc Nhóm A/B/C ở kết quả chấm điểm.
- Ẩn các field kỹ thuật như `RuleSource`/`RuleVersion` khỏi phần mặc định cho Sale.
- Cảnh báo cố định: chatbot dùng AI và có thể sai sót; nội dung chuyên môn chỉ tham khảo.
- Nút gợi ý “Việc hôm nay”.

Chưa chứng minh:

- Visual regression trên phiên browser thật sau toàn bộ thay đổi; report hiện ghi `PENDING_BROWSER_CONNECTION`.
- Khả năng dùng trên các viewport/mobile và accessibility cho toàn bộ 24 renderer.
- SLA hiển thị form tham số gần như tức thời; đây vẫn là issue đã ghi nhận.
- Quyết định context “một ngày làm việc” chưa khớp hoàn toàn với cleanup TTL 2 giờ trong workflow hiện tại; cần chốt lại trước khi dựa vào hội thoại dài.

## 8. Kiểm thử và evidence

| Gate | Kết quả | Evidence |
|---|---|---|
| Source Business Rule | PASS, 54 checks | `tests/business_rule_v1_source.test.js` |
| Release contract + build | PASS | `npm run test:release-local` ngày 19/07/2026 |
| Upsell SQL deploy/smoke | PASS | `reports/business-rule-v1/upsell-scope-guard-deploy-20260719/deploy-result.json` |
| Upsell n8n runtime | PASS | `reports/business-rule-v1/upsell-customer-required-runtime.json` |
| 13-account critical UAT | PASS, 104/104; full 24-API matrix PASS 13/13 | `reports/business-rule-v1/uat13-acceptance-result.json`, `reports/uat-all-accounts-readonly.json` |
| Daily-work natural language | PASS, 13/13 | `reports/business-rule-v1/uat13-daily-work-runtime.json` |
| Sellable stock runtime | PASS | `reports/business-rule-v1/sellable-stock-runtime.json` |
| Visual browser UAT | PENDING | Chưa có browser connection trong lượt chốt |
| Static scope signal audit | PARTIAL, 24/24 đã quét; 14 cần review thủ công | `reports/business-rule-v1/ACTIVE_API_SCOPE_AUDIT.md` |

Fixture `U13S1_` gồm 28 hóa đơn và 56 dòng chi tiết, chỉ gắn các khách nằm trong phạm vi nhóm pilot, có `UserCreate=AI_UAT13_FIXTURE`, không tạo stock transaction mới và có rollback:

```powershell
node scripts/rollback_uat13_suggestion_fixture_medtest.js
node scripts/rollback_uat13_suggestion_fixture_medtest.js --apply
```

## 9. Đánh giá rủi ro hiện tại

| Khu vực | Mức | Nhận định |
|---|---|---|
| Auth/capability/n8n envelope | Trung bình-thấp cho pilot | Contract và runtime chính đã pass; vẫn cần threat review độc lập |
| Scope dữ liệu | Trung bình | Upsell đã sửa lỗi thật; cần audit cùng mẫu trên tất cả procedure customer-bound |
| Doanh thu/kế toán | Cao trước production | Chưa có Finance sign-off payment ledger/VAT/partial return |
| Kho và số có thể bán | Trung bình-cao | Hữu ích cho Sale nhưng đang là quy ước tạm trên physical stock hợp lệ |
| Nội dung y khoa | Cao | Disclaimer không thay thế hard-stop và danh sách red flag được chuyên môn duyệt |
| Mutation | Thấp trong pilot | Preview-only/deny; rủi ro tăng mạnh nếu bật ghi thật |
| UI/UX | Trung bình | Contract/build pass nhưng visual/mobile UAT chưa hoàn tất |
| Vận hành/rollback | Trung bình | Có snapshot và rollback cho các thay đổi chính; chưa rehearsal production |
| Hiệu năng | Chưa đủ bằng chứng | Chưa có load test, percentile latency hay concurrency baseline |

## 10. Việc bắt buộc trước production

1. Finance ký công thức doanh số, doanh thu đã thu, VAT và return/partial return.
2. ERP Warehouse xác nhận reservation/blocked/damaged/expired và timestamp cập nhật.
3. ERP CRM chỉ ra nguồn check-in/visit thật.
4. ERP Program xác nhận Approved/Active/Stackable và effective dates.
5. Medical Owner duyệt red flag, pediatric guard và phạm vi nội dung được phép.
6. Security reviewer rà toàn bộ 24 API theo verified identity + branch/manager/store scope.
7. Chạy visual/mobile UAT và accessibility trên Manager/Sale.
8. Có performance baseline và timeout/fallback rõ ràng.
9. Chốt retention context/chat log và cơ chế xóa khi logout/hết hạn.
10. Rehearsal deploy/rollback trên staging gần production; không dùng `medtest` PASS thay cho production PASS.

## 11. Nhiệm vụ đề nghị cho các agent phản biện

### Agent SQL/Data

- Kiểm tra từng procedure có lọc đúng branch, customer, warehouse và manager hierarchy.
- Đối soát invoice status, return, debt, payment và chương trình bằng fixture độc lập.
- Tìm N+1, scalar function scan, correlated subquery và thiếu index có thể gây chậm.
- Không sửa rule nếu không có evidence schema/business; báo rõ blocker.

### Agent n8n/Security

- Chứng minh request không thể vượt allowlist 24 API hoặc chèn procedure/parameter tùy ý.
- Kiểm tra verified identity, JWT fallback, CORS, replay/idempotency và audit redaction.
- Test fail-closed khi auth service, SQL hoặc metadata lỗi.
- Soát context/cache để không trộn người dùng, khách hàng hoặc miền.

### Agent Frontend/UX

- Test form tham số hiển thị ngay, keyboard/touch/mobile và trạng thái loading/no-data/error.
- Soát mọi field nullable: không biến `NULL` thành `0` hoặc trạng thái chắc chắn.
- Xác minh Sale/Manager nhìn đúng nội dung nghiệp vụ, không lộ field kỹ thuật.
- Chụp evidence trước/sau cho các lỗi hiển thị.

### Agent Business/Finance/Warehouse/Medical

- Ký hoặc bác từng rule đang DRAFT bằng ví dụ dữ liệu thật.
- Định nghĩa chính xác “đã thu”, “có thể bán”, “đã ghé”, “khuyến mãi được duyệt” và “nội dung y khoa được phép”.
- Không chấp nhận Technical PASS như Business PASS.

### Agent QA/Reliability

- Chạy cross-role/cross-branch/cross-store, no-data, stale, malformed input, timeout và concurrent request.
- Test lại 24 API read-only, 3 mutation bị chặn và `@lap_don_hang` preview-only.
- Đo p50/p95/p99 và xác định API vượt SLA.

## 12. Mẫu kết quả yêu cầu từ agent reviewer

Mỗi phát hiện phải có:

| Trường | Nội dung bắt buộc |
|---|---|
| ID | Ví dụ `SEC-001`, `SQL-003`, `UX-002` |
| Mức độ | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` |
| Evidence | File + dòng, request/response hoặc câu SQL read-only |
| Tác động | Dữ liệu/người dùng/nghiệp vụ bị ảnh hưởng |
| Cách tái hiện | Bước ngắn, xác định |
| Khuyến nghị | Bản vá tối thiểu hoặc quyết định business cần có |
| Regression | Test phải thêm để lỗi không quay lại |
| Trạng thái | `CONFIRMED`, `NEEDS_EVIDENCE`, `BLOCKED_EXTERNAL` |

Reviewer không được kết luận từ tên field hoặc comment; phải đối chiếu source, runtime evidence và rule owner. Không được ghi dữ liệu production để kiểm tra.

## 13. Lệnh tái kiểm tra nhanh

```powershell
node tests/business_rule_v1_source.test.js
npm.cmd run test:release-local
node scripts/test_upsell_customer_required_runtime.js
node scripts/run_uat13_acceptance.js
```

## 14. Chỉ mục hồ sơ

- Quyết định nghiệp vụ: `reports/contracts/business-rule-v1-decision-log.json`
- Backlog triển khai: `reports/contracts/business-rule-v1-implementation-backlog.json`
- Báo cáo Agent A: `docs/AGENT_A_BAO_CAO_PHAM_VI_CHINH_SUA_BUSINESS_RULE_V1.md`
- Kịch bản copy/paste 13 tài khoản: `docs/uat/scenarios/UAT_13_TAI_KHOAN_CAU_HOI_COPY_PASTE.md`
- Báo cáo nghiệm thu mới nhất: `reports/business-rule-v1/NGHIEM_THU_UAT13_20260719.md`
- Kết quả máy đọc: `reports/business-rule-v1/uat13-acceptance-result.json`
- Hướng dẫn Pilot Read-only: `docs/HUONG_DAN_SU_DUNG_MEDSTAND_AI_PILOT_READ_ONLY.md`
- Ma trận Technical/Business/Production: `docs/UAT_PILOT_READ_ONLY_TECHNICAL_BUSINESS_PRODUCTION.md`
- Kế hoạch remediation sau phản biện: `docs/KE_HOACH_REMEDIATION_SAU_AGENT_REVIEW_20260719.md`
- Audit tín hiệu scope 24 API: `reports/business-rule-v1/ACTIVE_API_SCOPE_AUDIT.md`
- Bản đồ field: `reports/field-compatibility-map.md`

**Nguyên tắc đọc trạng thái:** file backlog được tạo trước một số bản vá ngày 19/07/2026 nên có mục còn ghi `PATCH_REQUIRED` dù source/runtime mới đã pass. Khi có lệch, ưu tiên evidence runtime có timestamp mới hơn, nhưng vẫn không tự nâng thành Business PASS nếu thiếu owner ký.
