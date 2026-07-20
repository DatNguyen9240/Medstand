# Hồ sơ nội bộ Medstand AI — Pilot Read-only và Agent Review

**Ngày chốt:** 19/07/2026  
**Môi trường đã kiểm tra:** frontend/gateway local + n8n local đã publish + SQL Server `medtest`  
**Trạng thái:** `PILOT_READ_ONLY_RUNTIME_PASS_BUSINESS_APPROVAL_PENDING`

**Đối tượng đọc:** quản lý dự án, đội kỹ thuật, QA, Security và agent/reviewer độc lập.  
**Không dùng nguyên bản làm:** hướng dẫn người dùng, bộ UAT khách hàng hoặc biên bản nghiệm thu.

Tài liệu dành cho người dùng được tách riêng:

- [`HUONG_DAN_SU_DUNG_WEB_MEDSTAND_DAY_DU.md`](HUONG_DAN_SU_DUNG_WEB_MEDSTAND_DAY_DU.md) — hướng dẫn toàn bộ web cho Sale/Manager.
- [`HUONG_DAN_SU_DUNG_MEDSTAND_AI_PILOT_READ_ONLY.md`](HUONG_DAN_SU_DUNG_MEDSTAND_AI_PILOT_READ_ONLY.md).
- [`UAT_PILOT_READ_ONLY_TECHNICAL_BUSINESS_PRODUCTION.md`](UAT_PILOT_READ_ONLY_TECHNICAL_BUSINESS_PRODUCTION.md).
- [`KE_HOACH_HOAN_THIEN_HOI_THOAI_TU_NHIEN_MEDSTAND_AI.md`](KE_HOACH_HOAN_THIEN_HOI_THOAI_TU_NHIEN_MEDSTAND_AI.md) — kế hoạch nâng chatbot lên hội thoại nghiệp vụ nhiều lượt.

## 1. Kết luận ngắn

Medstand AI hiện đủ điều kiện demo và pilot read-only với 13 tài khoản thử nghiệm. Hệ thống chưa đủ điều kiện nghiệm thu production vì còn phụ thuộc xác nhận Finance, ERP kho, chương trình khuyến mãi, Medical Owner và visual/performance UAT.

Kết quả đã có:

- Source Business Rule: 54/54 kiểm tra PASS.
- Release contract và frontend build: PASS.
- Nghiệm thu trọng yếu: 13/13 tài khoản, 104/104 kiểm tra PASS; ma trận 24 API cũng PASS 13/13 tài khoản.
- 24 API read-only nằm trong allowlist.
- Khách ngoài miền trong Upsell trả `403 OUT_OF_SCOPE`, không lộ dữ liệu.
- `@lap_don_hang` chỉ tạo giỏ xem trước; chưa ghi đơn thật.
- Fixture UAT trên `medtest` có nhận dạng riêng và script rollback.

Thông điệp đúng khi giới thiệu:

> Medstand AI đã sẵn sàng cho pilot read-only và UAT các nghiệp vụ bán hàng cốt lõi. Một số quy tắc tài chính, kho, chương trình và y khoa vẫn cần người có thẩm quyền xác nhận trước production.

## 2. Kiến trúc

| Tầng | Thành phần | Trách nhiệm |
|---|---|---|
| Frontend | `index.html`, `src/`, `chatbot-widget/` | Đăng nhập, form tham số, chatbot, bảng/card |
| Gateway | `server.js` | Chuyển tiếp request, bảo vệ token, redaction log |
| n8n Core | `MAIN_ChatBot_V5.json` | Nhận lệnh `@` hoặc câu tự nhiên và chọn intent |
| n8n API | `API_ListActive`, `API_GetConfig`, `API_Execute` | Allowlist, metadata, validation, envelope và audit |
| Auth | `Shared_Auth_Guard.json` | Verified identity và capability |
| SQL | `sql/*.sql` trên `medtest` | Thực hiện nghiệp vụ và scope theo user/branch/store |
| Evidence | `tests/`, `scripts/`, `reports/` | Static test, runtime test, deploy snapshot và rollback |

Luồng chính: frontend → gateway → n8n auth/validation/allowlist → SQL procedure → response contract → renderer.

## 3. Phạm vi tài khoản

| Vai trò | Phạm vi |
|---|---|
| Sale/TDV | Khách, đơn, kho và báo cáo được ERP cấp cho tài khoản |
| Manager | Phạm vi quản lý và chi nhánh; xem tổng quan rộng hơn Sale |
| Admin/global | Phạm vi hệ thống theo capability, vẫn phải audit |

Lỗi thật đã sửa: hàm ERP từng trả khách miền Bắc cho hai Manager miền Nam trong Upsell. Non-global user hiện phải đồng thời đúng `BranchID` và nằm trong `AR_GetObjectByUserFnc(@Username)`. Hai ca cũ hiện trả `403`, `count=0`.

Audit tĩnh đã quét đủ 24 procedure READ active:

- 10 API có tín hiệu customer/warehouse scope kết hợp branch tương đối mạnh.
- 14 API còn cần review thủ công hoặc cross-scope runtime. Các API này chưa được đưa vào danh sách UAT khách hàng tự do cho tới khi có bằng chứng đúng vai trò và đúng chi nhánh.
- Marker trong source không thay thế Security PASS.

## 4. Danh mục 24 API read-only

| Nhóm | API |
|---|---|
| Bán hàng/chứng từ | `@doanh_so`, `@hoa_don`, `@hoa_don_chi_tiet`, `@don_hang` |
| Khách hàng/công nợ | `@cong_no_khach_hang`, `@cong_no_chi_tiet`, `@tich_luy`, `@cham_diem_kh` |
| Gợi ý/tuyến | `@tuyen_ban_hang`, `@goi_ydon_hang`, `@upsell_goi_y` |
| Sản phẩm/kho | `@danh_sach_tonkho`, `@tra_cuu_san_pham`, `@goi_ydon_thuoc`, `@san_pham_trong_tam`, `@de_xuat_khuyen_mai`, `@tim_san_pham_theo_trieu_chung` |
| Danh mục/khảo sát/thông báo | `@danh_muc`, `@danh_sach_cau_hoi_khao_sat`, `@khao_sat360`, `@kiem_tra_khao_sat`, `@kiem_tra_khao_sat_ngay`, `@lich_su_khao_sat`, `@thong_bao` |

Câu tự nhiên chỉ được map vào capability active; không được tạo dynamic SQL hoặc gọi `ApiCode` ngoài danh mục.

## 5. Ma trận nghiệm thu

| Module | Technical | Business | Production | Ghi chú |
|---|---|---|---|---|
| Gợi ý đơn hàng/Upsell | PASS | PENDING_SIGNOFF | PILOT_ONLY | Ranking, MOQ và fallback nhóm sản phẩm chưa khóa |
| Khách ưu tiên/tuyến | PASS | PENDING_SIGNOFF | PILOT_ONLY | Chưa có check-in, bản đồ và quyết định 5 hay 8 |
| Tier/Risk | PASS | PENDING_SIGNOFF | BLOCKED | Ngưỡng/trọng số theo miền còn DRAFT |
| Tích lũy | PASS | BLOCKED_EXTERNAL | BLOCKED | Finance, Approved/Active/Stackable, return một phần |
| Tra cứu bán hàng | PASS | INTERNAL_ACCEPTED_FOR_PILOT | PILOT_ONLY | Chấp nhận nội bộ cho tra cứu read-only; chưa phải khách hàng ký nghiệm thu |
| Tra cứu triệu chứng | TECHNICAL_ROUTE_PASS_ONLY | BLOCKED_EXTERNAL | BLOCKED | Thiếu Medical Owner, red flag và pediatric guard |
| Đề xuất khuyến mãi | PASS | BLOCKED_EXTERNAL | BLOCKED | Chỉ hỗ trợ xem xét, chưa có approval/margin |
| OCR đơn thuốc từ ảnh | NOT_IMPLEMENTED | BLOCKED_EXTERNAL | BLOCKED | Không được giới thiệu là chức năng đã có |
| Catalogue | API_CONTRACT_PASS_UI_PENDING | PENDING_SIGNOFF | PILOT_ONLY | Ảnh, responsive layout, nội dung và accessibility chưa có browser evidence |
| Thông báo chương trình | PASS | PENDING_SIGNOFF | PILOT_ONLY | Quản trị tài liệu/version/approver chưa chứng minh |

Technical PASS không đồng nghĩa Business ACCEPTED hoặc Production READY.

## 6. Rule nghiệp vụ hiện tại

| Module | Đã làm | Còn chờ |
|---|---|---|
| Doanh số | Invoice status `3/6/7/8`, `TotalAmount`, return theo dấu âm, tách đã xuất và proxy đã thu | Payment ledger, VAT/net/gross, partial return, Finance sign-off |
| Công nợ | Có `PARTIALLY_PAID`, `DUE_DATE_UNKNOWN`, scope user | Mapping chứng từ và payment term |
| Tồn kho | Trả **tồn bán tham khảo** theo dữ liệu kho/lô/hạn dùng hiện có | Reservation/blocked và freshness timestamp chưa được ERP Warehouse xác nhận |
| Gợi ý đơn | Dưới 3 invoice không giả chu kỳ; từ 3 mới tính; loại món mua hôm nay | Confidence/fallback/ranking/MOQ |
| Upsell | Bắt buộc khách, lọc tồn bán dương, chặn khác branch | Business owner xác nhận logic xếp hạng |
| Tuyến | Tối đa 8 khách; không giả ngày ghé từ ngày mua | Check-in thật và tối ưu bản đồ |
| Tier/Risk | Tier dùng Frequency + Monetary; Recency dùng Risk | Ngưỡng và trọng số chính thức |
| Khuyến mãi | Sale chỉ chương trình công ty; Manager/Admin xem danh sách cần xem xét; AI không tự đặt % | Approved/Active/Stackable và quy trình phê duyệt |
| Y khoa | Có disclaimer và trạng thái tham khảo | Red flag, trẻ em, thai kỳ, dị ứng, chống chỉ định và Medical sign-off |

## 7. Hướng dẫn Pilot Read-only

### Đã kiểm chứng runtime trong pilot

- Đăng nhập và tra cứu đúng phạm vi.
- Việc hôm nay và khách ưu tiên nên ghé.
- Hóa đơn, đơn hàng, công nợ và tồn kho.
- API catalogue, sản phẩm trọng tâm và thông báo trả được dữ liệu; giao diện, hình ảnh, responsive và quản trị version/approver chưa được nghiệm thu đầy đủ.
- Gợi ý đơn hàng/Upsell theo khách hàng.
- Tier/Risk và lịch sử khảo sát read-only.

### Chỉ xem trước hoặc tham khảo

- Giỏ hàng: chỉ **Xem trước**, chưa tạo đơn.
- Tồn bán tham khảo: theo dữ liệu kho/lô/hạn dùng hiện có; chưa dùng để cam kết với khách cho tới khi ERP xác nhận reservation/blocked stock.
- Tích lũy và doanh thu đã thu: rule pilot, chờ Finance.
- Khuyến mãi Manager/Admin: danh sách xem xét, không phải quyết định giảm giá.
- Tra cứu theo triệu chứng: không chẩn đoán, kê đơn hoặc thay người có chuyên môn.

### Chưa áp dụng

- OCR/nhận diện đơn thuốc từ ảnh.
- Tạo đơn thật.
- Tự áp giá/chiết khấu/phát hành chương trình.
- Tối ưu bản đồ.
- Chẩn đoán, kê đơn hoặc thay thế thuốc.

### Câu hỏi dùng nhanh

```text
Hôm nay em nên làm gì?
Công nợ khách hàng
Tồn kho hiện tại
Doanh số tháng này
Gợi ý đơn hàng cho [MÃ KHÁCH]
Gợi ý bán kèm cho [MÃ KHÁCH]
Chi tiết công nợ khách hàng [MÃ KHÁCH]
Tra cứu sản phẩm [MÃ HOẶC TÊN SẢN PHẨM]
```

### Cách đọc trạng thái

| Trạng thái | Ý nghĩa |
|---|---|
| `SUCCESS` | Có kết quả; kiểm tra lại ngày và phạm vi |
| `NO_DATA` | Không có dữ liệu phù hợp, không đồng nghĩa hệ thống lỗi |
| `VALIDATION_ERROR` | Thiếu hoặc sai tham số |
| `OUT_OF_SCOPE` | Tài khoản không có quyền xem dữ liệu |
| `SYSTEM_ERROR` | Dừng và báo quản trị viên kèm thời gian/request ID |

## 8. Kế hoạch remediation

### P0 — trước mở rộng pilot

| Việc | Owner | Trạng thái |
|---|---|---|
| Audit scope 24 API và cross-scope runtime trước UAT khách hàng | SQL + Security + QA | PARTIAL — 10 strong, 14 manual; P0 bắt buộc |
| Xác nhận doanh số/VAT/đã thu/return | Finance + SQL | BLOCKED_EXTERNAL |
| Xác nhận reservation/blocked/freshness | Warehouse + ERP | BLOCKED_EXTERNAL |
| Hard-stop y khoa/red flag/pediatric | Medical Owner + n8n | BLOCKED_EXTERNAL |
| Không quảng bá OCR | Product + Docs | DONE |

### P1 — trước production

| Việc | Owner | Trạng thái |
|---|---|---|
| Visual UAT browser thật | FE + QA | PENDING_BROWSER_CONNECTION |
| Mobile/keyboard/accessibility/null/no-data | FE + QA | PENDING |
| Chốt context TTL 2 giờ hay một ngày | n8n + Security + Business | DECISION_REQUIRED |
| Đo p50/p95/p99 và timeout/failure | QA + Ops | PENDING |
| Approved/Active/Stackable | ERP Program + Business | BLOCKED_EXTERNAL |

### P2 — chất lượng

- Chuẩn hóa lý do gợi ý giữa route/order/upsell.
- Dùng nhãn “đến kỳ nhập lại”, không khẳng định “sắp hết hàng”.
- Tooltip giải thích Tier khác Risk.
- Chế độ audit riêng cho source/freshness/rule version.

## 9. Evidence

| Gate | Kết quả | File |
|---|---|---|
| Source rule | PASS 54/54 | `tests/business_rule_v1_source.test.js` |
| Release contract/build | PASS | `npm run test:release-local` |
| UAT 13 tài khoản | PASS 104/104; full 24-API matrix PASS 13/13 | `reports/business-rule-v1/uat13-acceptance-result.json`, `reports/uat-all-accounts-readonly.json` |
| Upsell scope | PASS | `reports/business-rule-v1/upsell-customer-required-runtime.json` |
| Sellable stock | PASS | `reports/business-rule-v1/sellable-stock-runtime.json` |
| Scope audit 24 API | PARTIAL | `reports/business-rule-v1/ACTIVE_API_SCOPE_AUDIT.md` |
| Visual browser | PENDING | Chưa có browser connection |

Fixture `U13S1_` gồm 28 hóa đơn, 56 dòng chi tiết và có rollback:

```powershell
node scripts/rollback_uat13_suggestion_fixture_medtest.js
node scripts/rollback_uat13_suggestion_fixture_medtest.js --apply
```

## 10. Yêu cầu đối với agent reviewer

Mỗi phát hiện phải có:

| Trường | Yêu cầu |
|---|---|
| ID | Ví dụ `SEC-001`, `SQL-002`, `UX-003` |
| Severity | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` |
| Evidence | File + dòng, request/response hoặc SQL read-only |
| Impact | Dữ liệu/người dùng/nghiệp vụ ảnh hưởng |
| Reproduce | Các bước tái hiện |
| Recommendation | Bản vá tối thiểu hoặc quyết định cần owner |
| Regression | Test phải thêm |
| Status | `CONFIRMED`, `NEEDS_EVIDENCE`, `BLOCKED_EXTERNAL` |

Không kết luận chỉ từ tên field/comment. Không ghi dữ liệu production để đánh giá. Không dùng Technical PASS thay cho Business hoặc Production PASS.

## 11. Điều kiện production

1. Finance ký công thức doanh thu/VAT/return/payment.
2. ERP Warehouse xác nhận tồn giữ chỗ và freshness.
3. ERP CRM cung cấp nguồn check-in thật.
4. ERP Program xác nhận Approved/Active/Stackable.
5. Medical Owner duyệt guardrail.
6. Security review đủ 24 API.
7. Visual/mobile/accessibility/performance PASS.
8. Staging deploy/rollback rehearsal PASS.

Cho tới khi đủ các điều kiện trên, trạng thái chính thức vẫn là **Pilot Read-only**, không phải production-final.
