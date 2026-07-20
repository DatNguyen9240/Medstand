# Kế hoạch và implementation contract hội thoại tự nhiên Medstand AI

**Ngày cập nhật:** 19/07/2026  
**Trạng thái:** `P0A_SHADOW_MEDTEST_PASS_P0B_CORPUS_PASS_BASELINE_PENDING`  
**Phạm vi:** Sale/TDV, Manager và Admin trong Pilot Read-only

## Bằng chứng triển khai ngày 19/07/2026

Đã publish ba workflow `MAIN_ChatBot_V5`, `AI_Intent_Parser` và `AI_ChatCasual` lên runtime local nối API `medtest` ở chế độ `SHADOW`:

- P0A: context key tách theo verified user + conversation từng tab + server session; idle TTL 2 giờ, absolute TTL 12 giờ; đổi role/branch và reset chat làm mất context cũ.
- P0A: parser chỉ trả internal intent/entity theo schema; server sở hữu ánh xạ 24 internal intent sang 24 API read-only.
- P0A: confidence theo nhóm rủi ro, top-1/top-2 quá gần phải hỏi lại, y khoa tự nhiên đi qua gate riêng, mutation vẫn bị chặn.
- P0A: context chỉ commit sau `SUCCESS`/`NO_DATA`; không commit khi `OUT_OF_SCOPE`, `VALIDATION_ERROR`, `SYSTEM_ERROR` hoặc có version conflict.
- P0A: nội dung user/history/catalogue/PDF/RAG được coi là dữ liệu không đáng tin; không được đổi identity, scope, allowlist hoặc policy.
- P0B: đã sinh corpus tổng hợp cố định 648 ca, không chứa tài khoản UAT hay dữ liệu khách thật; split 388 development, 130 validation và 130 holdout.
- Shadow runtime smoke bằng `QLBH013.MED` và `NAMDINHB.MED` đạt 8/8 kiểm tra: đủ 24 API; câu tự nhiên chỉ dự đoán `SALES_ROUTE -> @tuyen_ban_hang` và trả 0 dòng nghiệp vụ; hội thoại xã giao không gọi API nghiệp vụ; lệnh `@tuyen_ban_hang` vẫn chạy bình thường.
- Đã có baseline runner đọc prediction JSONL từ Shadow Mode. Chưa chạy đủ 130 ca validation nên chưa công bố accuracy/latency và chưa bật auto-route.
- Snapshot/rollback và kết quả publish mới nhất nằm tại `reports/natural-language-p0/shadow-credential-fix-20260719/`. Trước khi publish, script kiểm tra toàn bộ credential ID trong source phải tồn tại đúng loại trên runtime n8n.

Lệnh kiểm tra source:

```powershell
npm.cmd run test:natural-language-p0
npm.cmd run test:p0-business-contract
npm.cmd run test:daily-work-intent
npm.cmd run test:shared-auth-guard
npm.cmd run test:api-execute-auth
npm.cmd run test:api-execute-capability
npm.cmd run test:api-execute-validation
npm.cmd run test:business-rule-frontend
npm.cmd run test:natural-language-shadow-runtime
```

## 1. Mục tiêu

Nâng Medstand AI từ mức “hiểu một câu và gọi một API” thành trợ lý nghiệp vụ nhiều lượt có thể:

- Hiểu câu tiếng Việt tự nhiên, thiếu dấu, viết tắt và một phần lỗi chính tả.
- Hỏi lại ngắn gọn khi thiếu khách, sản phẩm, ngày hoặc ý định chưa rõ.
- Giữ đúng khách/sản phẩm/kho trong từng cuộc trò chuyện độc lập.
- Đổi context an toàn khi người dùng chuyển khách, sản phẩm hoặc kỳ dữ liệu.
- Phát hiện và xử lý nhiều yêu cầu mà không bỏ sót hoặc gọi sai API.
- Trò chuyện xã giao ngắn nhưng không vượt khỏi phạm vi nghiệp vụ.
- Luôn giữ allowlist, verified identity, scope và Pilot Read-only.

Hệ thống không nhằm trở thành chatbot “biết mọi thứ”. Nội dung nghiệp vụ phải đi qua capability đã duyệt; y khoa có release gate riêng.

## 2. Hiện trạng

### Đã có

- `MAIN_ChatBot_V5` nhận câu tự nhiên hoặc lệnh `@`.
- `AI_Intent_Parser` và `AI_ChatCasual` đã có ở mức MVP.
- 24 API read-only nằm trong allowlist.
- Thiếu tham số trả `VALIDATION_ERROR`; ngoài quyền trả `OUT_OF_SCOPE`.
- Mutation bị chặn bằng `PILOT_READ_ONLY`; giỏ hàng chỉ xem trước.
- Có verified identity, request ID, response envelope và audit cơ bản.

### Chưa đủ bằng chứng

- Accuracy intent/entity trên corpus độc lập.
- Context nhiều lượt, hai tab và request đồng thời.
- TTL, context cleanup và optimistic locking.
- Multi-intent/partial failure.
- Prompt injection từ RAG/catalogue/PDF.
- Performance/cost trên staging/server.
- Nội dung y khoa được Medical Owner phê duyệt.

## 3. Nguyên tắc bất biến

1. Không chắc thì hỏi lại; không tự đoán mã khách/sản phẩm.
2. Identity và quyền chỉ lấy từ server.
3. Model chỉ dự đoán internal intent/entity; không được tự chọn `ApiCode`, procedure hoặc SQL.
4. Backend sở hữu mapping intent → API và validation.
5. Câu tự nhiên và lệnh `@` dùng chung gateway, scope và response contract.
6. Read-only mặc định; mutation bị chặn trong Pilot.
7. RAG/document là dữ liệu không đáng tin, không phải instruction.
8. Khi natural-language route lỗi, tắt feature flag và giữ lệnh `@`/form deterministic.
9. Không dùng log thô để train; phải redaction, review, retention và approval.

## 4. Context contract

### 4.1. Context key

Không dùng context chung cho toàn bộ user/session. Khóa bắt buộc:

```text
contextKey =
  verifiedUserId
  + conversationId
  + serverSessionId
```

- `verifiedUserId`: do Auth Guard xác minh.
- `conversationId`: server cấp hoặc ký; mỗi cửa sổ/tab hội thoại có một ID riêng.
- `serverSessionId`: gắn với phiên xác thực hiện hành.
- Frontend có thể tạo `clientInstanceId/tabId` làm correlation, nhưng không được dùng thay identity hay server-signed conversation ID.

### 4.2. Context record

```json
{
  "contextVersion": 12,
  "verifiedUserId": "user-hash",
  "conversationId": "conv-uuid",
  "serverSessionId": "session-hash",
  "customerId": "NDB001",
  "productId": null,
  "dateRange": null,
  "lastIntent": "CUSTOMER_DEBT_DETAIL",
  "updatedAt": "2026-07-19T10:00:00Z",
  "expiresAt": "2026-07-19T12:00:00Z"
}
```

Update context phải atomic bằng `contextVersion` hoặc optimistic locking. Request cũ không được ghi đè request mới.

### 4.3. TTL và cleanup

Giá trị đề xuất cho Pilot, cần Security/Business ký:

- **Idle TTL:** 2 giờ không hoạt động.
- **Absolute TTL:** tối đa 12 giờ hoặc cuối ngày làm việc, điều kiện nào tới trước.

Xóa context ngay khi:

- Logout hoặc token hết hạn.
- Đổi tài khoản/server session.
- Tài khoản bị khóa.
- Quyền, vai trò hoặc chi nhánh thay đổi.
- Người dùng nói “bắt đầu lại”, “xóa ngữ cảnh” hoặc bấm xóa chat.

### 4.4. Quy tắc cập nhật entity

- Chỉ lưu `customerId/productId` sau khi resolve đúng một bản ghi và xác minh in-scope.
- Có thể cập nhật sau `SUCCESS` hoặc `NO_DATA` nếu entity đã resolve và scope hợp lệ.
- Không cập nhật context khi `OUT_OF_SCOPE`, `VALIDATION_ERROR` hoặc `SYSTEM_ERROR`.
- Không xóa khách cũ chỉ vì khách mới resolve lỗi.
- “Đổi sang BNA051” chỉ commit sau khi `BNA051` được resolve và xác minh scope.
- Câu có ngày mới chỉ thay `dateRange`; không tự thay khách/sản phẩm.

## 5. Intent Parser output contract

Parser chỉ được trả JSON theo schema, không trả prose:

```json
{
  "schemaVersion": "1.0.0",
  "intent": "CUSTOMER_DEBT_DETAIL",
  "confidence": 0.94,
  "entities": {
    "customerId": "NDB001",
    "productId": null,
    "dateFrom": null,
    "dateTo": null,
    "topN": null,
    "keyword": null
  },
  "missingFields": [],
  "requiresClarification": false,
  "multiIntent": false,
  "childIntents": []
}
```

JSON Schema bắt buộc:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "intent", "confidence", "entities", "missingFields", "requiresClarification", "multiIntent", "childIntents"],
  "properties": {
    "schemaVersion": { "const": "1.0.0" },
    "intent": { "type": "string", "pattern": "^[A-Z][A-Z0-9_]*$" },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
    "entities": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "customerId": { "type": ["string", "null"] },
        "productId": { "type": ["string", "null"] },
        "dateFrom": { "type": ["string", "null"], "format": "date" },
        "dateTo": { "type": ["string", "null"], "format": "date" },
        "topN": { "type": ["integer", "null"], "minimum": 1, "maximum": 100 },
        "keyword": { "type": ["string", "null"] }
      }
    },
    "missingFields": { "type": "array", "items": { "type": "string" }, "uniqueItems": true },
    "requiresClarification": { "type": "boolean" },
    "multiIntent": { "type": "boolean" },
    "childIntents": { "type": "array", "maxItems": 3, "items": { "type": "object" } }
  }
}
```

Schema validation lỗi, intent không có trong server mapping hoặc metadata unavailable phải fail closed và không gọi API.

## 6. Server-owned intent mapping

Model không nhìn thấy hoặc quyết định procedure. Backend ánh xạ internal intent sang API active:

| Internal intent | API | Risk class |
|---|---|---|
| `SALES_REVENUE` | `@doanh_so` | FINANCIAL |
| `INVOICE_LIST` | `@hoa_don` | FINANCIAL |
| `INVOICE_DETAIL` | `@hoa_don_chi_tiet` | FINANCIAL |
| `ORDER_LIST` | `@don_hang` | OPERATIONAL |
| `CUSTOMER_DEBT_SUMMARY` | `@cong_no_khach_hang` | FINANCIAL |
| `CUSTOMER_DEBT_DETAIL` | `@cong_no_chi_tiet` | FINANCIAL |
| `LOYALTY_SUMMARY` | `@tich_luy` | FINANCIAL |
| `CUSTOMER_SCORING` | `@cham_diem_kh` | RECOMMENDATION |
| `SALES_ROUTE` | `@tuyen_ban_hang` | RECOMMENDATION |
| `ORDER_RECOMMENDATION` | `@goi_ydon_hang` | RECOMMENDATION |
| `UPSELL_RECOMMENDATION` | `@upsell_goi_y` | RECOMMENDATION |
| `INVENTORY_LIST` | `@danh_sach_tonkho` | OPERATIONAL |
| `PRODUCT_SEARCH` | `@tra_cuu_san_pham` | CATALOG |
| `RELATED_PRODUCT_RECOMMENDATION` | `@goi_ydon_thuoc` | RECOMMENDATION |
| `FOCUS_PRODUCTS` | `@san_pham_trong_tam` | CATALOG |
| `PROMOTION_REVIEW` | `@de_xuat_khuyen_mai` | RECOMMENDATION |
| `SYMPTOM_PRODUCT_SEARCH` | `@tim_san_pham_theo_trieu_chung` | MEDICAL_REFERENCE |
| `CATALOG_SEARCH` | `@danh_muc` | CATALOG |
| `SURVEY_QUESTION_LIST` | `@danh_sach_cau_hoi_khao_sat` | OPERATIONAL |
| `SURVEY_360` | `@khao_sat360` | OPERATIONAL |
| `SURVEY_STATUS` | `@kiem_tra_khao_sat` | OPERATIONAL |
| `SURVEY_STATUS_BY_DATE` | `@kiem_tra_khao_sat_ngay` | OPERATIONAL |
| `SURVEY_HISTORY` | `@lich_su_khao_sat` | OPERATIONAL |
| `NOTIFICATION_LIST` | `@thong_bao` | CATALOG |

Required fields, roles và scope không lấy từ model; đọc từ versioned server metadata. Mapping chỉ active khi API cũng nằm trong canonical allowlist.

## 7. Confidence policy

Confidence từ model không được tin tuyệt đối; ngưỡng phải calibration trên Validation/Holdout.

Ngưỡng khởi điểm đề xuất:

| Risk class | Chạy trực tiếp | Hỏi lại | Không gọi API |
|---|---:|---:|---:|
| CATALOG | `≥ 0.85` | `0.60–0.84` | `< 0.60` |
| OPERATIONAL | `≥ 0.90` | `0.70–0.89` | `< 0.70` |
| FINANCIAL | `≥ 0.92` | `0.75–0.91` | `< 0.75` |
| RECOMMENDATION | `≥ 0.92` | `0.75–0.91` | `< 0.75` |
| MEDICAL_REFERENCE | Không auto-route chỉ dựa trên confidence | Luôn qua guardrail/clarification | Hard-stop khi có red flag |
| MUTATION | Bị chặn trong Pilot | — | `PILOT_READ_ONLY` |

Nếu top-2 intent gần nhau dưới calibration margin, phải hỏi lại dù top-1 vượt ngưỡng.

## 8. Entity resolution và tiếng Việt

Luôn giữ đồng thời:

- Câu gốc.
- Câu normalized.
- Token mã chính xác.
- Chuỗi không dấu chỉ để hỗ trợ tìm kiếm.

Thứ tự resolve:

1. Mã khách/sản phẩm exact match.
2. Tên có dấu exact match.
3. Alias đã được duyệt.
4. Tên không dấu.
5. Fuzzy match.

Nếu fuzzy trả nhiều hơn một ứng viên, chatbot hiển thị lựa chọn và không cập nhật context trước khi người dùng chọn.

## 9. Kế hoạch triển khai

### P0A — An toàn và contract

| ID | Việc | Gate |
|---|---|---|
| `NL-P0A-01` | Context key user + conversation + server session | Hai tab không ghi đè nhau |
| `NL-P0A-02` | Idle/absolute TTL và cleanup triggers | Logout/expire/role change xóa context |
| `NL-P0A-03` | Cross-scope runtime đủ 24 API | 0 data leak |
| `NL-P0A-04` | Parser JSON Schema validation | Invalid JSON fail closed |
| `NL-P0A-05` | Server intent-to-API mapping | Model không gọi ApiCode/procedure |
| `NL-P0A-06` | Feature flag + rollback rehearsal | Tắt natural route, giữ `@` hoạt động |
| `NL-P0A-07` | Fail closed khi LLM/Auth/metadata lỗi | Không API call |
| `NL-P0A-08` | RAG prompt-injection guard | Document không đổi policy/scope/context |

### P0B — Corpus và baseline

Corpus tối thiểu chính xác **648 ca**:

| Nhóm | Số ca |
|---|---:|
| 24 intent, nhiều cách diễn đạt | 240 |
| Thiếu dấu, sai chính tả, viết tắt | 72 |
| Thiếu tham số/mơ hồ | 72 |
| Hội thoại nhiều lượt | 60 |
| Đổi khách/sản phẩm/ngày | 36 |
| Nhiều yêu cầu trong một câu | 36 |
| Ngoài phạm vi và mutation | 48 |
| Casual/off-topic/adversarial | 24 |
| Chuyên môn/y khoa nguy cơ cao | 60 |
| **Tổng** | **648** |

Tách dataset cố định:

| Tập | Số ca | Mục đích |
|---|---:|---|
| Development | 388 | Phát triển prompt/rule |
| Validation | 130 | Calibration threshold và chọn phiên bản |
| Holdout acceptance | 130 | Nghiệm thu độc lập |

Không dùng Holdout để chỉnh prompt rồi chạy lại và gọi là PASS. Mọi thay đổi corpus phải tăng version và ghi lý do.

Chạy baseline phiên bản hiện tại trước khi sửa, lưu:

- Intent accuracy và confusion matrix.
- Entity exact match.
- Clarification rate.
- Wrong API rate.
- Scope-denied rate.
- No-call/abstention rate.
- p50/p95/p99, error rate và timeout rate.

### P1 — Câu đơn và Shadow Mode

- Chuẩn hóa tiếng Việt theo thứ tự resolve ở mục 8.
- Quick-intent deterministic cho câu phổ biến.
- Trích xuất entity và hỏi lại theo missing field.
- Giải thích `NO_DATA`, `VALIDATION_ERROR`, `OUT_OF_SCOPE`, `SYSTEM_ERROR` bằng tiếng Việt.
- Bật **Shadow Mode**: parser dự đoán nhưng không thực thi; người dùng vẫn dùng lệnh `@`/menu.
- So sánh intent/entity dự đoán với hành động thật sau redaction.
- Chỉ bật auto-route khi đạt threshold trên Validation và Holdout.

### P2 — Context nhiều lượt

Ca bắt buộc:

1. Tab 1 dùng `NDB001`, Tab 2 dùng `BNA051`; không ghi đè.
2. “Xem công nợ NDB001” → “Chi tiết hơn”.
3. “Không, đổi sang BNA051” — commit sau resolve/scope.
4. “Tháng trước thì sao?” — chỉ đổi kỳ.
5. Hai request đồng thời — request cũ không ghi đè context mới.
6. “Bắt đầu lại” — xóa business context.
7. Logout Sale rồi login Manager — không giữ context Sale.

### P3 — Multi-intent

Giai đoạn 1: phát hiện nhiều yêu cầu và hỏi người dùng muốn làm việc nào trước.

Giai đoạn 2: chỉ API read-only đã duyệt, tối đa 3 child intent, chạy độc lập. Contract tổng hợp:

```json
{
  "overallStatus": "PARTIAL_SUCCESS",
  "requestId": "parent-request-id",
  "results": [
    { "intent": "CUSTOMER_DEBT_DETAIL", "childRequestId": "req-1", "status": "SUCCESS", "data": [] },
    { "intent": "ORDER_LIST", "childRequestId": "req-2", "status": "SUCCESS", "data": [] },
    { "intent": "UPSELL_RECOMMENDATION", "childRequestId": "req-3", "status": "NO_DATA", "data": [] }
  ]
}
```

- `SUCCESS`: mọi child thành công.
- `PARTIAL_SUCCESS`: ít nhất một child thành công/NO_DATA và ít nhất một child lỗi/khác trạng thái.
- Mỗi child có request ID, status và data riêng.
- Không dùng kết quả child này để đoán entity cho child khác.

### P4A — Casual và RAG

- Chào hỏi, cảm ơn và hướng dẫn tính năng.
- Câu vừa xã giao vừa có nghiệp vụ vẫn tách intent đúng.
- Catalogue/PDF/RAG được bao bằng delimiter và sanitize/escape.
- Instruction trong tài liệu bị coi là dữ liệu; không được đổi system policy, identity, allowlist hoặc context.
- Bổ sung adversarial: giả admin, xin token, in system prompt, gọi procedure, bỏ phân quyền, tạo/xóa dữ liệu.

### P4B — Y khoa, release gate riêng

- Không release chung với casual chat.
- Medical Owner duyệt red flag, pediatric, thai kỳ, dị ứng, chống chỉ định và nội dung.
- Hard-stop hoặc chuyển người chuyên môn khi có nguy cơ cao.
- 0 ca chẩn đoán/kê đơn trái guardrail trên Holdout.

### P5 — UAT và rollout

1. Static/unit test local.
2. Shadow Mode trên `medtest`.
3. UAT `QLBH013.MED` và `NAMDINHB.MED`.
4. UAT 13 tài khoản/ba miền.
5. Pilot giới hạn 5–10 người dùng.
6. Theo dõi intent, clarification, wrong API, no-call, scope, latency và cost.
7. Mở rộng khi không có security failure và đạt acceptance.

## 10. Performance contract

Đo end-to-end từ lúc frontend gửi request đến khi render xong, bao gồm gateway, n8n, LLM, SQL và renderer.

Mỗi báo cáo phải ghi:

- Warm/cold start.
- Số request và concurrency.
- Vai trò/tài khoản test.
- Có/không SQL và LLM.
- p50, p95, p99.
- Error rate, timeout rate, requests/minute.
- Token/cost trung bình mỗi request LLM.

Mục tiêu Pilot đề xuất:

| Luồng | p95 | Timeout/fallback |
|---|---:|---|
| Quick-intent deterministic | ≤ 3 giây | Fallback form/lệnh `@` |
| LLM intent route | ≤ 8 giây | Không gọi API; đề nghị dùng menu `@` |

Timeout cụ thể phải được Ops xác nhận trên staging/server.

## 11. Acceptance criteria

### Bắt buộc tuyệt đối

- 0 rò dữ liệu khác user/branch/store.
- 0 mutation thật từ câu tự nhiên trong Pilot.
- 100% API ngoài allowlist bị chặn.
- 100% parser output sai schema/unknown intent fail closed.
- 100% thiếu tham số quan trọng được hỏi lại/validation, không tự đoán.
- 100% logout/đổi user/hết session không dùng context cũ.
- 0 prompt injection thay đổi identity/scope/allowlist/context.
- 0 câu y khoa nguy cơ cao tạo chẩn đoán/kê đơn trái guardrail.

### Chất lượng

| Chỉ số | Mục tiêu Holdout |
|---|---:|
| Intent đúng cho câu đơn phổ biến | ≥ 98% |
| Intent đúng toàn tập | ≥ 95% |
| Entity exact match | ≥ 95% |
| Context nhiều lượt đúng | ≥ 95% |
| Clarification dễ hiểu | ≥ 90% human UAT |
| Multi-intent hoàn thành | ≥ 90% sau P3 giai đoạn 2 |

Baseline phải được ghi cạnh kết quả sau sửa để chứng minh mức cải thiện.

## 12. Logging và cải thiện AI

- Hash/pseudonym user ID.
- Redact tên, số điện thoại, địa chỉ, token và dữ liệu nhạy cảm.
- Ghi intent dự đoán, API thực tế, status, latency và feedback.
- Có retention, quyền truy cập và cơ chế xóa.
- Không tự động train từ toàn bộ log.
- Giai đoạn đầu dùng log đã review làm evaluation corpus, chưa fine-tune.

## 13. Owner và deliverable

| Hạng mục | Owner | Deliverable |
|---|---|---|
| Parser/schema/mapping/context | n8n/AI Backend | Contract versioned + workflow + test |
| Allowlist/auth/scope | Security + API + SQL | Cross-scope evidence 24 API |
| Conversation/tab ID | Frontend + Backend | Signed conversation lifecycle |
| Corpus/baseline/holdout | Business + QA | Dataset versioned + confusion matrix |
| Shadow Mode | n8n + FE + QA | Prediction log redacted, không execute |
| RAG injection | Security + AI Backend | Adversarial regression |
| Y khoa | Medical Owner | Guardrail và sign-off riêng |
| Performance | Ops + QA | E2E p50/p95/p99, error/timeout/cost |

## 14. Rollback

Nếu natural-language routing sai intent hoặc rò context:

1. Tắt feature flag auto-route.
2. Giữ lệnh `@` và form deterministic.
3. Expire context bị ảnh hưởng.
4. Khôi phục workflow từ checksum/backup trước deploy.
5. Chạy lại auth, allowlist, parser schema, validation và cross-scope regression.

Không fix-forward trên workflow đang phục vụ người dùng nếu chưa cô lập nguyên nhân.

## 15. Thứ tự thực hiện

1. P0A: contract, context isolation, scope và fail-closed.
2. P0B: corpus 648 ca, split và baseline.
3. P1: câu đơn + Shadow Mode.
4. P2: context state machine nhiều lượt/hai tab/concurrent request.
5. UAT 2 tài khoản rồi 13 tài khoản.
6. P3: multi-intent + `PARTIAL_SUCCESS`.
7. P4A Casual/RAG và P4B Medical được release độc lập.

Mốc gần nhất: hoàn thành P0A/P0B để có thể bắt đầu implementation P1 mà không dựa vào suy đoán.
