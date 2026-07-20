# Kế hoạch remediation sau phản biện độc lập — 19/07/2026

## P0 — trước khi mở rộng pilot

| ID | Việc | Owner | Trạng thái |
|---|---|---|---|
| R-P0-01 | Audit scope 24 API theo user/branch/store và chạy cross-scope runtime trước khi cho khách tự do UAT | SQL + Security + QA | PARTIAL — 10 strong signals, 14 manual review; P0 bắt buộc |
| R-P0-02 | Finance xác nhận doanh số, VAT, đã thu và return/partial return | Finance + SQL | BLOCKED_EXTERNAL |
| R-P0-03 | ERP xác nhận reservation/blocked và freshness của tồn | Warehouse + ERP | BLOCKED_EXTERNAL |
| R-P0-04 | Hard-stop/giới hạn nội dung y khoa, red flag và pediatric | Medical Owner + n8n | BLOCKED_EXTERNAL |
| R-P0-05 | Loại OCR đơn thuốc khỏi danh sách chức năng hoàn thành | Product + Docs | DONE |
| R-P0-06 | Chỉ đưa API có bằng chứng đúng vai trò/chi nhánh/kho vào danh sách customer UAT | Security + QA + Coordinator | PENDING theo R-P0-01 |

## P1 — trước production

| ID | Việc | Owner | Trạng thái |
|---|---|---|---|
| R-P1-01 | Visual UAT browser thật cho Manager/Sale | FE + QA | PENDING_BROWSER_CONNECTION |
| R-P1-02 | Mobile, keyboard, accessibility và no-data/null | FE + QA | PENDING |
| R-P1-03 | Test context không trộn user và chốt TTL 2 giờ hay một ngày | n8n + Security + Business | DECISION_REQUIRED |
| R-P1-04 | Đo p50/p95/p99, timeout và SQL/n8n unavailable | QA + Ops | PENDING |
| R-P1-05 | Chứng minh Approved/Active/Stackable của chương trình | ERP Program + Business | BLOCKED_EXTERNAL |
| R-P1-06 | Thu bằng chứng giao diện catalogue: ảnh, tên dài, giá, mobile và responsive | FE + QA + Business | PENDING_BROWSER_CONNECTION |

## P2 — chất lượng và dễ dùng

| ID | Việc | Owner | Trạng thái |
|---|---|---|---|
| R-P2-01 | Chuẩn hóa lý do gợi ý giữa route/order/upsell | Business + SQL + FE | PENDING |
| R-P2-02 | Dùng nhãn “đến kỳ nhập lại”, không tuyên bố “sắp hết hàng” | Business + FE | PENDING |
| R-P2-03 | Tooltip giải thích Tier khác Risk | FE + Business | PENDING |
| R-P2-04 | Màn audit/chi tiết cho source/freshness/rule version | FE + Security | DEFERRED |

## Nguyên tắc

- Không tự giải quyết mục `BLOCKED_EXTERNAL` bằng suy đoán.
- Mỗi mục DONE phải có file source, runtime evidence và regression test.
- Production readiness chỉ được nâng khi Technical, Business và Production gate cùng đạt.
- `ACCEPTED` phải ghi rõ người/đơn vị phê duyệt và evidence; nếu mới chấp nhận nội bộ dùng `INTERNAL_ACCEPTED_FOR_PILOT`.
- Tồn kho dùng nhãn “tồn bán tham khảo” cho tới khi ERP Warehouse xác nhận reservation/blocked stock.
- Tra cứu triệu chứng chỉ được ghi `TECHNICAL_ROUTE_PASS_ONLY` cho tới khi Medical Owner duyệt nội dung và guardrail.

## Tài liệu đã hiệu chỉnh

| Tài liệu | Mục đích | Trạng thái |
|---|---|---|
| `HO_SO_TONG_HOP_MEDSTAND_AI_PILOT_VA_AGENT_REVIEW.md` | Hồ sơ nội bộ cho quản lý/kỹ thuật/reviewer | UPDATED |
| `HUONG_DAN_SU_DUNG_WEB_MEDSTAND_DAY_DU.md` | Hướng dẫn toàn bộ web cho Sale/Manager | CREATED — ảnh chờ visual UAT |
| `HUONG_DAN_SU_DUNG_MEDSTAND_AI_PILOT_READ_ONLY.md` | Hướng dẫn thao tác cho Sale/Manager | UPDATED |
| `UAT_PILOT_READ_ONLY_TECHNICAL_BUSINESS_PRODUCTION.md` | Bộ UAT người dùng, expected result và phiếu Pass/Fail | UPDATED |
| `KE_HOACH_HOAN_THIEN_HOI_THOAI_TU_NHIEN_MEDSTAND_AI.md` | Kế hoạch intent, context nhiều lượt, multi-intent và casual chat | CREATED |

## Evidence audit scope

- `reports/business-rule-v1/ACTIVE_API_SCOPE_AUDIT.md`
- `reports/business-rule-v1/active-api-scope-audit.json`

Audit tĩnh đã đọc đủ 24 definition active trên `medtest`: 10 API có đồng thời tín hiệu scope mạnh theo nhóm customer/warehouse + branch; 14 API còn cần reviewer xác nhận catalog global, branch-only hoặc bổ sung cross-scope runtime. Kết quả regex không được dùng thay Security PASS.
