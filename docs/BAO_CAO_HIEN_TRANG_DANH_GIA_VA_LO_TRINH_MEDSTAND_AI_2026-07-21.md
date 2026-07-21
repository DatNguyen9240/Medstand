# Báo cáo hiện trạng, đánh giá và lộ trình Medstand AI

**Ngày đánh giá:** 21/07/2026  
**Phạm vi:** source code trong workspace Medstand, SQL nghiệp vụ, workflow n8n, frontend chatbot, cấu hình hội thoại và tài liệu UAT hiện có.  
**Mục tiêu báo cáo:** xác định hệ thống đang ở đâu, đã đạt được gì, còn thiếu gì so với hai đích triển khai và cần bao lâu để đi đến các mốc tiếp theo.

---

## 1. Kết luận điều hành

Medstand hiện không còn là một chatbot hỏi đáp đơn giản. Hệ thống đã hình thành một **trợ lý nghiệp vụ hội thoại theo kiến trúc API-first**, có:

- API nghiệp vụ đọc dữ liệu ERP.
- Business rule và recommendation heuristic bằng SQL.
- Phân quyền theo người dùng, vai trò, chi nhánh và phạm vi dữ liệu.
- Intent parser, context hội thoại và cơ chế hỏi tham số.
- Response envelope, request ID và audit.
- Card, bảng, biểu đồ và thao tác tiếp theo ngay trong hội thoại.
- Cơ chế Pilot read-only; mutation chỉ xem trước, chưa tự ghi dữ liệu thật.

Tuy nhiên, hệ thống **chưa phải trợ lý bán hàng dự đoán hoàn chỉnh**. Các chức năng “dự đoán” hiện nay chủ yếu là rule và heuristic dựa trên chu kỳ mua, tần suất, doanh số, percentile và điểm ưu tiên. Source hiện chưa có bằng chứng về:

- Feature snapshot dùng cho machine learning.
- Training pipeline và tập train/validation/test theo thời gian.
- Model đã huấn luyện cho mua lại, churn, số lượng đơn hoặc Next Best Product.
- Calibration, model registry, shadow mode và monitoring model.

### 1.1. Hai cách đo cần tách riêng

| Đích đánh giá | Mức ước lượng hiện tại | Ý nghĩa |
|---|---:|---|
| Pilot dùng API + business rule | **65–70%** | Source và static contract khá đầy đủ; chưa đủ runtime UAT 13/13 tài khoản và business sign-off để giữ mức 70–75% một cách chắc chắn |
| Trợ lý bán hàng có predictive ML hoàn chỉnh | **Khoảng 50%** | Phần ứng dụng, tích hợp và an toàn đã hình thành; lớp predictive ML và MLOps mới ở giai đoạn khởi tạo |
| Production readiness | **40–50%** | Còn thiếu runtime gate đầy đủ, sign-off nghiệp vụ, dữ liệu tồn khả dụng, tài chính, nội dung chuyên môn và vận hành production |

Các tỷ lệ trên là **ước lượng roadmap**, không phải tỷ lệ test case đã PASS.

### 1.2. Định vị đúng của sản phẩm hiện tại

> **Medstand hiện là trợ lý nghiệp vụ hội thoại theo kiến trúc API-first, có business rule, phân quyền và recommendation heuristic; nền tảng phù hợp để hoàn thiện Pilot read-only. Predictive ML, MLOps và bằng chứng UAT runtime đầy đủ vẫn đang được xây dựng.**

---

## 2. Phương pháp đánh giá

### 2.1. Nguồn bằng chứng được sử dụng

Đánh giá này dựa trên:

1. Source SQL của các API nghiệp vụ.
2. Workflow n8n của API service, auth guard và chatbot chính.
3. Cấu hình 24 intent hội thoại tự nhiên.
4. Frontend API engine, renderer và card nghiệp vụ.
5. Migration business rule và cấu hình version.
6. Kế hoạch UAT 13 tài khoản và hướng dẫn người dùng.
7. Kiểm tra syntax/static được chạy trực tiếp trên source hiện tại.

Không coi các tài liệu kế hoạch, câu mô tả hoặc fixture UAT là bằng chứng rằng runtime đã PASS.

### 2.2. Bốn mức trạng thái bắt buộc

| Trạng thái | Điều kiện |
|---|---|
| `SOURCE_PASS` | Code/config parse được, contract và logic tĩnh đáp ứng yêu cầu |
| `RUNTIME_PASS` | Luồng frontend → n8n → SQL Server chạy thật và cho kết quả mong đợi |
| `BUSINESS_ACCEPTED` | Người phụ trách nghiệp vụ kiểm tra số liệu và chấp nhận công thức/kết quả |
| `PRODUCTION_READY` | Đủ runtime evidence, sign-off, bảo mật, rollback, monitoring và tài liệu vận hành |

Không được dùng một chữ `PASS` chung cho cả bốn mức.

### 2.3. Kết quả kiểm tra source tại thời điểm báo cáo

- Intent map có đúng **24 intent/API** đã duyệt.
- Các file JavaScript chính của chatbot, API engine và renderer qua kiểm tra syntax.
- Bộ kiểm tra renderer Sản phẩm trọng tâm qua toàn bộ static checks hiện có, gồm luồng chọn khách hàng để mở API tích lũy.
- 23 workflow JSON trong thư mục n8n được rà soát: 19 file parse trực tiếp; 4 file có UTF-8 BOM nhưng parse được sau khi bỏ BOM. Đây là vấn đề đóng gói/portability, không phải lỗi cấu trúc JSON.
- `git diff --check` không phát hiện lỗi whitespace nghiêm trọng; có cảnh báo chuyển LF/CRLF trên một số file.
- Workspace đang có nhiều file thay đổi chưa được đóng gói thành một release sạch. Vì vậy trạng thái source hiện tại chưa phải release artifact bất biến.

### 2.4. Hạn chế của lần đánh giá

- Không có bằng chứng browser UAT hoàn chỉnh mới nhất cho 13/13 tài khoản.
- Không có bảng kết quả tổng hợp PASS/FAIL/BLOCKED đã điền đầy đủ.
- Không xác nhận được trạng thái publish mới nhất của toàn bộ workflow n8n chỉ từ source Git.
- Không thực hiện lại đối soát tài chính, VAT, payment ledger, reservation và check-in trong lần lập báo cáo này.
- Vì vậy mọi nhận định runtime hoặc business được giữ ở trạng thái `PENDING`, trừ khi có bằng chứng độc lập.

### 2.5. Đối chiếu các bản đánh giá đã nhận

Hai bản nhận xét bên ngoài và kết quả rà source hiện tại thống nhất ở các điểm cốt lõi:

1. Medstand đã có nền tảng ứng dụng doanh nghiệp thật, không còn là prototype chỉ trả lời bằng văn bản.
2. API, business rule, phân quyền và orchestration là phần trưởng thành nhất của hệ thống.
3. Logic gợi ý hiện tại có giá trị sử dụng, nhưng phải gọi đúng là **rule-based recommendation baseline**; chưa được gọi là predictive ML đã huấn luyện.
4. Thiếu bằng chứng UAT runtime và business sign-off là khoảng trống gần nhất cần đóng.
5. Nếu phát triển ML, nên bắt đầu bằng một bài toán hẹp như `REORDER_14D`, chạy Shadow Mode trước khi tác động đến người dùng.

Điểm khác nhau chủ yếu nằm ở cách dùng tỷ lệ phần trăm:

| Nội dung | Nhận xét ban đầu | Nhận xét đã siết lại | Kết luận dùng trong báo cáo |
|---|---:|---:|---|
| Pilot API/business-rule | 70–75% | 65–70% khi chưa đủ runtime UAT | **65–70% hiện tại**; chỉ nâng sau khi có evidence |
| Kiến trúc trợ lý predictive hoàn chỉnh | Khoảng 50% | Khoảng 50% là roadmap estimate | **49,51%, làm tròn 50%**; không phải test coverage |
| API và rule | 70–75% | Đồng thuận | **70–75% ở cấp source/capability**, chưa phải production |
| Hội thoại và UI | 55–65% | Đồng thuận | **55–65%**, cần regression runtime và hoàn thiện context |
| Auth, safety, audit | 70–75% | Đồng thuận | **70–75% ở cấp thiết kế/source**, cần evidence deploy |
| Predictive model | 15–20% | Đồng thuận | **15–20%**, chủ yếu là heuristic baseline |
| ML data/MLOps | Khoảng 5% | Đồng thuận | **5%**, chưa có pipeline/model governance hoàn chỉnh |
| Production readiness | Chưa tách rõ | 40–50% | **40–50%**, do còn nhiều gate vận hành và nghiệp vụ |

Vì vậy, báo cáo này chọn cách đánh giá thận trọng hơn: **chỉ ghi mức cao khi có bằng chứng tương ứng và luôn ghi rõ đang nói về source, runtime, business acceptance hay production readiness**.

---

## 3. Kiến trúc hiện tại và kiến trúc mục tiêu

### 3.1. Kiến trúc hiện tại

```text
Người dùng
   ↓
Frontend chatbot + menu @ API
   ↓
Intent nhanh / LLM / context hội thoại
   ↓
n8n API orchestration
   ├── Xác thực identity
   ├── Capability + scope
   ├── Validation
   ├── Gọi SQL procedure
   ├── Response envelope
   └── Audit
   ↓
SQL API + business rule + heuristic ranking
   ↓
Card/bảng/biểu đồ trong hội thoại
```

### 3.2. Kiến trúc mục tiêu

```text
Người dùng
   ↓
Intent parser / LLM
   ↓
Business Orchestrator
   ├── API ERP
   ├── Business Rule Engine
   └── Predictive Model Service
          ↓
     Prediction + reason codes
          ↓
Validation + scope + guardrail
   ↓
Card nghiệp vụ
   ↓
LLM diễn giải dựa trên evidence
```

### 3.3. Khoảng cách chính

Phần còn thiếu không nằm ở chatbot UI mà nằm giữa dữ liệu ERP và recommendation API:

```text
Feature snapshot
→ Training/evaluation
→ Model version
→ Batch prediction
→ Decision engine
→ Monitoring/outcome/feedback
```

---

## 4. Đánh giá chi tiết theo lớp hệ thống

## 4.1. API và Business Rule — 70–75%

### Đã có

- 24 API/intents read-only được allowlist cho Pilot.
- Các API doanh số, hóa đơn, đơn hàng, công nợ, tồn kho, gợi ý, tuyến, chấm điểm, tích lũy, upsell, khuyến mãi, sản phẩm trọng tâm và tra cứu.
- Whitelist invoice status hoàn tất `3/6/7/8` đã được dùng ở các luồng quan trọng.
- Gợi ý đơn hàng không đoán chu kỳ cho khách dưới ba hóa đơn hợp lệ.
- Tier và Risk được tách thành hai chiều khác nhau.
- Upsell có điểm ưu tiên, reason và kiểm tra dữ liệu tồn.
- Promotion proposal giữ trạng thái tham khảo/cần phê duyệt.
- Business rule có version, effective date, approver và trạng thái `DRAFT/APPROVED/RETIRED`.
- Mutation Pilot bị giới hạn ở preview.

### Chưa khóa

- Một số rule vẫn mang hậu tố `DRAFT` hoặc `LEGACY_*_DRAFT`.
- Doanh thu đã thu vẫn cần payment-ledger reconciliation.
- VAT/net/gross revenue cần tài chính ký xác nhận.
- Tồn khả dụng chưa có bằng chứng đầy đủ cho hàng giữ chỗ, khóa, hỏng hoặc hết hạn.
- Check-in/visit source chưa được chứng minh đầy đủ.
- Trạng thái phê duyệt/chồng chương trình cần owner nghiệp vụ xác nhận.
- Nội dung sản phẩm/thuốc cần quy trình chuyên môn riêng.

### Kết luận lớp

`SOURCE_PARTIAL_PASS`, `RUNTIME_PARTIAL`, `BUSINESS_PENDING`.

---

## 4.2. Hội thoại và UI nghiệp vụ — 55–65%

### Đã có

- 24 intent/API được khóa trong intent map.
- Quick intent cho các câu phổ biến.
- LLM fallback cho câu tự nhiên ngoài rule nhanh.
- Context theo session, user và conversation.
- Ghi nhớ khách hàng/sản phẩm đã chọn khi commit context thành công.
- Hỏi tham số qua menu, picker và form metadata.
- Renderer chuyên biệt cho công nợ, tích lũy, chấm điểm, sản phẩm trọng tâm, tồn kho và các bảng nghiệp vụ.
- Search, filter, pagination và phần chi tiết mở rộng.
- Cảnh báo AI có thể sai sót và nội dung chuyên môn chỉ mang tính tham khảo.
- Có cơ chế chuyển từ card Sản phẩm trọng tâm sang chọn khách và gọi API tích lũy.

### Vấn đề còn mở

- Một số câu follow-up tự nhiên chưa ổn định hoặc phụ thuộc context cũ.
- Metadata field và validation message chưa đồng nhất ở mọi API.
- Một số renderer từng lộ field kỹ thuật; cần regression để bảo đảm đã Việt hóa hoàn toàn.
- Cache/service worker có thể làm người dùng nhìn thấy giao diện cũ nếu không version/reload đúng.
- Card lớn có nguy cơ biến chatbot thành dashboard nếu không giới hạn nội dung tóm tắt.
- Chưa có ma trận runtime chứng minh 24 intent hoạt động trên đủ vai trò và phạm vi.

### Kết luận lớp

`SOURCE_PARTIAL_PASS`, `BROWSER_UAT_PENDING`.

---

## 4.3. Identity, phân quyền, an toàn và audit — 70–75%

### Đã có

- Shared Auth Guard kiểm tra token và mapping identity nội bộ.
- Identity xác minh được dùng để gắn `@Username`; tham số scope do client gửi bị loại bỏ.
- Capability allowlist phân biệt READ, PREVIEW, MUTATION và DENY.
- Request ID và response envelope chuẩn hóa.
- Audit success/error có row-count bucket, duration, operation type và transaction outcome.
- Pilot read-only chặn mutation thật.
- Scope theo user/manager/branch đã được đưa vào SQL và metadata.

### Chưa chứng minh đầy đủ

- Chưa có runtime regression 13/13 tài khoản cho cross-branch denial.
- Chưa có bằng chứng publish/runtime mới nhất cho toàn bộ workflow auth/API.
- Chưa hoàn tất security review production, secret rotation, retention và alerting.
- Chưa có load test và failure-injection cho n8n/DB/gateway.

### Kết luận lớp

`SOURCE_DESIGN_STRONG`, `FULL_RUNTIME_EVIDENCE_PENDING`.

---

## 4.4. Recommendation heuristic — 15–20% so với predictive target

### Đã có giá trị thực tế

Hệ thống hiện có một **rule-based recommendation baseline**:

- Chu kỳ mua trung bình khi có đủ lịch sử.
- Số ngày chưa mua.
- Tần suất và giá trị mua.
- Percentile để phân Tier.
- Risk theo recency/doanh số gần đây.
- Priority score cho upsell.
- Xếp hạng khách trong tuyến.
- Rule analytics cho hàng tồn cao, bán chậm hoặc gần hết hạn.

Đây không phải “không có AI”. Nó là decision intelligence dựa trên rule/heuristic và là baseline bắt buộc để so sánh với model sau này.

### Chưa có predictive model

- Chưa có xác suất mua lại 7/14/30 ngày được train và calibration.
- Chưa có khoảng dự đoán số lượng đơn kế tiếp.
- Chưa có churn probability theo label đã khóa.
- Chưa có Next Best Product learned ranking.
- Chưa có visit priority model.
- Chưa có uplift model cho khuyến mãi.
- Chưa có evaluation metric như Precision@K, Recall@K, Lift@K và conversion uplift.

### Kết luận lớp

`HEURISTIC_BASELINE_AVAILABLE`, `PREDICTIVE_MODEL_NOT_STARTED`.

---

## 4.5. Dữ liệu ML và MLOps — khoảng 5%

### Chưa tìm thấy trong source

- `ML_CustomerProductSnapshot`.
- `ML_TrainingRun`.
- `ML_ModelVersion`.
- `ML_Prediction`.
- `ML_PredictionOutcome`.
- `ML_UserFeedback`.
- Training pipeline.
- Time-based split.
- Data leakage checks.
- Calibration report.
- Model registry.
- Batch scoring schedule.
- Shadow-mode dashboard.
- Drift và outcome monitoring.

### Nền móng có thể tái sử dụng

- Invoice/status business rule.
- User/branch scope.
- Rule version.
- API response metadata.
- Audit và request ID.
- UI reason/explanation card.

### Kết luận lớp

`ML_DATA_FOUNDATION_NOT_STARTED`.

---

## 5. Bảng so sánh hiện tại với đích đến

| Năng lực | Hiện tại | Đích cần đạt | Khoảng trống |
|---|---|---|---|
| Hiểu câu hỏi | Rule nhanh + LLM + 24 intent | Follow-up ổn định, clarification nhất quán | Runtime UAT và context regression |
| Dữ liệu sự thật | API SQL/ERP | Contract production-final | Sign-off tài chính, tồn, chương trình |
| Business rule | Có version nhưng nhiều rule DRAFT | Rule APPROVED có owner/effective date | Business approval |
| Gợi ý mua lại | Chu kỳ heuristic | Probability 14/30 ngày đã calibration | Feature, label, model, evaluation |
| Số lượng đề xuất | Trung bình/heuristic hoặc chưa có | Quantity + lower/upper bound | Regression/forecast model |
| Risk | Ngưỡng/percentile | Risk probability + reason code | Label churn/decline và model |
| Upsell | Priority score SQL | Next Best Product ranking | Training data và ranking metric |
| Tuyến | Priority rule trong scope | Visit priority model trong tuyến | Outcome visit/order và model |
| Khuyến mãi | Rule analytics, cần duyệt | Uplift/causal model sau cùng | Treatment/control data |
| Giải thích | RuleSource/Reason + card | Evidence contract model/rule | Chuẩn hóa reason code |
| Model governance | Chưa có | Registry, approver, rollback | Toàn bộ MLOps layer |
| Runtime assurance | Chưa đủ 13 tài khoản | Regression tự động + UAT ký | Thực thi và lưu evidence |

---

## 6. Cách tính điểm roadmap

Điểm dưới đây dùng để quản lý tiến độ, không thay thế test coverage:

| Nhóm | Trọng số | Mức đạt | Điểm quy đổi |
|---|---:|---:|---:|
| API và Business Rule | 30% | 72,5% | 21,75 |
| Hội thoại và UI | 20% | 60% | 12,00 |
| Phân quyền/an toàn/audit | 15% | 72,5% | 10,88 |
| Predictive/recommendation | 25% | 17,5% | 4,38 |
| ML data/MLOps | 10% | 5% | 0,50 |
| **Tổng** | **100%** |  | **49,51%** |

Làm tròn để báo cáo: **khoảng 50% so với kiến trúc predictive hoàn chỉnh**.

Đối với Pilot API/business-rule, không tính phần model và MLOps là điều kiện bắt buộc. Mức hiện tại được ước lượng **65–70%**, có thể tăng lên **75–80%** sau khi runtime UAT, business sign-off và release hygiene hoàn tất.

---

## 7. Blocker và rủi ro ưu tiên

## 7.1. P0 — phải đóng trước khi giao Pilot

1. Chạy đủ runtime UAT 13 tài khoản.
2. Xác nhận 24 intent/API chạy từ browser qua n8n đến SQL.
3. Kiểm tra khách/nhân viên/kho ngoài scope bị từ chối.
4. Đóng các lỗi renderer, form metadata, validation và follow-up đang thấy trên web.
5. Xác nhận mutation vẫn preview-only.
6. Tạo release commit/tag sạch; không deploy từ worktree hỗn hợp.
7. Chụp version/checksum frontend, n8n và SQL đã deploy.

## 7.2. P1 — cần business owner ký

1. Công thức doanh số, return, VAT và doanh thu đã thu.
2. Định nghĩa tồn vật lý và tồn khả dụng.
3. Kho/chi nhánh/manager scope.
4. Trạng thái phê duyệt, hiệu lực và stacking của chương trình.
5. Discount/margin và quyền duyệt khuyến mãi.
6. Phạm vi nội dung sản phẩm/thuốc, trẻ em và cảnh báo chuyên môn.
7. Định nghĩa mua lại, giảm mua, churn và đơn kế tiếp.

## 7.3. P2 — nợ kỹ thuật và vận hành

1. Loại UTF-8 BOM ở bốn workflow để tăng portability.
2. Chuẩn hóa line ending và encoding tiếng Việt.
3. Tự động hóa JSON parse, syntax, contract và browser smoke test.
4. Thêm latency/error monitoring.
5. Chính sách log, retention và PII.
6. Viết runbook rollback theo version.

---

## 8. Lộ trình triển khai đề xuất

### 8.1. Giả định nguồn lực

Timeline dưới đây giả định:

- 01 backend/data engineer làm SQL và pipeline.
- 01 frontend/n8n engineer làm chatbot, renderer và workflow.
- 01 QA/UAT phối hợp bán thời gian.
- Sales Operations, Kế toán, Kho và chuyên môn sản phẩm có người ký quyết định.
- Có quyền đọc dữ liệu lịch sử tối thiểu 12 tháng, tốt hơn là 24 tháng.
- Có môi trường test riêng và không phải chờ cấp quyền quá ba ngày.

Nếu thiếu business owner hoặc dữ liệu lịch sử, timeline phải cộng thêm thời gian chờ; không nên ép model chạy bằng label chưa xác nhận.

## 8.2. Timeline tổng quan

| Giai đoạn | Thời lượng dự kiến | Mốc lịch tham khảo | Trạng thái đầu ra |
|---|---:|---|---|
| 0. Khóa source/release baseline | 2–3 ngày | 21–23/07/2026 | `SOURCE_BASELINE_LOCKED` |
| 1. Ổn định Pilot và UAT 13 tài khoản | 7–10 ngày làm việc | 24/07–06/08/2026 | `RULE_BASED_PILOT_READY` |
| 2. Business/data sign-off | 1–3 tuần, chạy song song | 24/07–14/08/2026 | `BUSINESS_BASELINE_APPROVED` |
| 3. Nền dữ liệu ML | 3 tuần | 17/08–04/09/2026 | `ML_DATA_FOUNDATION_READY` |
| 4. Train/evaluate REORDER_14D | 3 tuần | 07–25/09/2026 | `REORDER_MODEL_CANDIDATE` |
| 5. Batch scoring + Shadow Mode | 4–6 tuần | 28/09–06/11/2026 | `REORDER_MODEL_SHADOW_RUNNING` |
| 6. Controlled predictive Pilot | 4 tuần | 09/11–04/12/2026 | `PREDICTIVE_RECOMMENDATION_PILOT` |
| 7. Production gate model đầu tiên | 2–4 tuần | 07/12/2026–08/01/2027 | `REORDER_MODEL_PRODUCTION_READY` nếu đạt gate |
| 8. Mở rộng model khác | 3–6 tháng | Sau 01/2027 | Theo từng model độc lập |

### Ước lượng tổng

- Pilot rule-based ổn định: **1–2 tuần** nếu môi trường sẵn sàng.
- Có model REORDER_14D chạy Shadow Mode: **8–11 tuần**.
- Có predictive recommendation Pilot cho nhóm Sale nhỏ: **12–16 tuần**.
- Production model đầu tiên: **4–6 tháng**, phụ thuộc dữ liệu và business approval.
- Bộ model tương đối đầy đủ: **9–15 tháng**, không nên triển khai tất cả cùng lúc.

---

## 9. Chi tiết từng giai đoạn và điều kiện nghiệm thu

## Giai đoạn 0 — Khóa source/release baseline

### Công việc

- Chốt branch và commit dùng cho Pilot.
- Tách file source, generated bundle, SQL deploy và n8n export.
- Gắn version thống nhất cho frontend, workflow và SQL.
- Loại BOM/encoding bất thường.
- Lưu checksum và rollback artifact.

### Gate

- Build sạch.
- JSON parse sạch không cần tiền xử lý.
- Không có file production phụ thuộc thay đổi chưa commit.
- Có danh sách chính xác file cần import/deploy.

## Giai đoạn 1 — Ổn định Pilot read-only

### Công việc

- Chạy ít nhất 18 case chung × 13 tài khoản = 234 lượt.
- Chạy coverage 24 API trên vai trò phù hợp.
- Test Sale, Manager, ba miền, trong quyền và ngoài quyền.
- Test cache refresh, session đổi tài khoản và context isolation.
- Test no-data, invalid input, timeout và auth expiry.
- Chụp evidence có request ID.

### Gate `RULE_BASED_PILOT_READY`

- 13/13 tài khoản đăng nhập đúng identity/scope.
- Không có P0 mở.
- P1 có owner và ngày xử lý hoặc được chấp nhận bằng văn bản.
- Mutation không ghi dữ liệu thật.
- 24 API có runtime result hoặc blocker được ghi rõ.
- Sale/Manager đọc hiểu card mà không cần biết field kỹ thuật.

## Giai đoạn 2 — Business/data sign-off

### Công việc

- Kế toán ký status, return, VAT và revenue basis.
- Kho ký phạm vi kho và định nghĩa available stock.
- Sales Ops ký rule gợi ý, Tier/Risk và tuyến.
- Marketing/Manager ký promotion workflow.
- Chuyên môn ký giới hạn nội dung sản phẩm/thuốc.
- Khóa label cho predictive model.

### Gate `BUSINESS_BASELINE_APPROVED`

- Mỗi rule có owner, version, effective date và approval evidence.
- Không dùng rule `DRAFT` làm kết luận production.
- Label mua lại/churn/giảm mua có định nghĩa kiểm thử được.

## Giai đoạn 3 — Nền dữ liệu ML

### Bảng đề xuất

```text
ML_CustomerProductSnapshot
ML_TrainingRun
ML_ModelVersion
ML_Prediction
ML_PredictionOutcome
ML_UserFeedback
```

### Feature tối thiểu

- SnapshotDate, CustomerID, ItemID.
- DaysSinceLastPurchase.
- PurchaseCount30D/90D/180D/365D.
- Revenue30D/90D/365D.
- Average/median cycle.
- Last/average quantity và quantity trend.
- Return/cancel rate.
- Active program indicators.
- Stock eligibility nếu nguồn được xác nhận.
- Branch/channel/customer group.
- TargetPurchasedNext14D.

### Gate `ML_DATA_FOUNDATION_READY`

- Snapshot tái tạo được theo ngày.
- Không dùng dữ liệu tương lai làm feature.
- Train/validation/test chia theo thời gian.
- Có data quality report theo miền/chi nhánh.
- Missing rate và coverage nằm trong ngưỡng được duyệt.
- Label được business owner ký.

## Giai đoạn 4 — REORDER_14D model candidate

### Bài toán

```text
Entity: CustomerID + ItemID + SnapshotDate
Target: Có hóa đơn hợp lệ trong 14 ngày tiếp theo
Feature cutoff: Không muộn hơn SnapshotDate
Output: score, HIGH/MEDIUM/LOW, reason codes, model version
```

### Baseline bắt buộc

1. Rule chu kỳ hiện tại.
2. Model ML đơn giản.
3. Rule + model.

### Metric

- Precision@K.
- Recall@K.
- PR-AUC.
- Lift@K.
- Coverage.
- Calibration nếu hiển thị xác suất.
- Expected revenue/conversion offline nếu tính được.

### Gate `REORDER_MODEL_CANDIDATE`

- Model tốt hơn baseline tại metric đã thỏa thuận.
- Không suy giảm nghiêm trọng ở một miền/chi nhánh.
- Có model card, training window và feature schema.
- Có reason code ổn định.
- Có rollback về heuristic baseline.

## Giai đoạn 5 — Batch scoring và Shadow Mode

### Công việc

```text
ERP data
→ snapshot pipeline
→ batch scoring hằng ngày
→ ML_Prediction
→ lưu outcome thực tế
→ so sánh model với rule
```

Model chưa hiển thị cho Sale.

### Theo dõi

- Prediction distribution.
- Missing feature rate.
- Coverage.
- Precision/Recall/Lift theo tuần.
- Kết quả theo miền, chi nhánh và nhóm khách.
- Latency và batch failure.
- Prediction expiry.

### Gate `REORDER_MODEL_SHADOW_RUNNING`

- Chạy liên tục tối thiểu 4 tuần không mất batch nghiêm trọng.
- Outcome được nối đúng với prediction.
- Lift ổn định hơn rule baseline.
- Không có leakage hoặc scope violation.

## Giai đoạn 6 — Controlled predictive Pilot

### Phạm vi

- 5–10 Sale đại diện.
- Read-only recommendation.
- Hiển thị “Gợi ý AI – tham khảo”.
- Không tự thêm giỏ hoặc tạo đơn.

### UI cần có

- Mức HIGH/MEDIUM/LOW hoặc xác suất đã calibration.
- Khoảng thời gian dự kiến mua lại.
- Sản phẩm và số lượng tham khảo nếu được duyệt.
- Reason codes dịch sang tiếng Việt.
- Dữ liệu tính đến ngày nào.
- Model/rule version trong audit, không nhất thiết lộ mặc định cho Sale.
- Nút Hữu ích/Không phù hợp/Đã liên hệ/Đã thêm giỏ.

### Gate `PREDICTIVE_RECOMMENDATION_PILOT`

- Không có P0 an toàn/scope.
- Feedback được ghi có user, prediction và timestamp.
- Có conversion và adoption report.
- Business xác nhận model tạo giá trị hoặc cho phép tiếp tục thử nghiệm.

## Giai đoạn 7 — Production gate

### Điều kiện

- Model registry và version lifecycle.
- Approver và deployment record.
- Drift/quality/latency alert.
- Rollback đã diễn tập.
- Runbook khi model/batch lỗi.
- Security/privacy review.
- SLA và owner trực vận hành.
- Business sign-off dựa trên controlled Pilot.

Không đạt gate thì tiếp tục heuristic hoặc shadow mode; không ép model lên production.

---

## 10. Thứ tự mở rộng model

| Ưu tiên | Model | Chỉ bắt đầu khi |
|---:|---|---|
| 1 | `REORDER_PROPENSITY_14D/30D` | Baseline và label mua lại đã khóa |
| 2 | `CHURN_RISK` | Định nghĩa churn/giảm mua được ký |
| 3 | `NEXT_BEST_PRODUCT` | Có dữ liệu outcome và stock eligibility |
| 4 | `NEXT_ORDER_QUANTITY` | MOQ/quy cách/tồn khả dụng rõ |
| 5 | `VISIT_PRIORITY` | Có visit/check-in outcome thật |
| 6 | `PROMOTION_UPLIFT` | Có treatment/control hoặc thiết kế thử nghiệm đáng tin cậy |

Không xây một model “AI bán hàng tổng hợp”. Mỗi model phải có target, horizon, metric, owner và rollback riêng.

---

## 11. Phân công trách nhiệm đề xuất

| Vai trò | Trách nhiệm |
|---|---|
| Product/Coordinator | Khóa phạm vi, ưu tiên, trạng thái và release gate |
| Sales Operations | Rule gợi ý, Tier/Risk, tuyến, label mua lại/churn |
| Kế toán/Tài chính | Revenue, return, VAT, payment definition |
| Kho/Vận hành | Physical/available stock, warehouse scope, freshness |
| Chuyên môn sản phẩm | Nội dung thuốc/sản phẩm, trẻ em, disclaimer |
| Backend/Data | SQL contract, snapshot, feature, batch scoring, audit |
| n8n/Integration | Orchestration, auth, response envelope, failure handling |
| Frontend | Conversational UI, card, accessibility, cache/version |
| QA/UAT | 13 tài khoản, 24 API, negative cases, evidence |
| ML owner | Training, evaluation, calibration, registry, monitoring |

---

## 12. Việc nên làm ngay

### Trong 48 giờ

1. Tạo release branch/commit sạch cho Pilot.
2. Chuẩn hóa encoding/BOM và chạy build/static checks.
3. Chốt danh sách URL/workflow/SQL object thật đang chạy.
4. Chạy smoke test một Manager và một Sale.
5. Đóng các lỗi P0 trên đường đi chính: đăng nhập, chọn khách, gọi API, render và scope.

### Trong tuần đầu

1. Chạy ma trận 13 tài khoản.
2. Chạy coverage 24 API và lưu request ID/ảnh.
3. Tổng hợp PASS/FAIL/BLOCKED.
4. Tổ chức buổi sign-off với Kế toán, Kho, Sales Ops và chuyên môn.
5. Đóng trạng thái `RULE_BASED_PILOT_READY` hoặc ghi blocker rõ ràng.

### Sau khi Pilot baseline được khóa

1. Viết data discovery cho lịch sử 12–24 tháng.
2. Khóa label `REORDER_14D`.
3. Thiết kế snapshot schema.
4. Tạo baseline metrics cho rule chu kỳ hiện tại.
5. Chỉ sau đó mới train model đầu tiên.

---

## 13. Tiêu chí tổng kết dự án theo từng mốc

### Mốc A — Pilot rule-based

Hệ thống giúp Sale/Manager tra cứu và nhận gợi ý có kiểm soát, đúng scope, không tự ghi dữ liệu. Đây là mục tiêu gần nhất và khả thi trong 1–2 tuần nếu runtime ổn định.

### Mốc B — Predictive shadow

Model tạo prediction hằng ngày nhưng chưa ảnh hưởng người dùng. Hệ thống bắt đầu có predictive capability thật, nhưng chưa được gọi là production AI.

### Mốc C — Controlled predictive Pilot

Một nhóm Sale nhỏ nhìn thấy gợi ý model, có reason và feedback. Giá trị phải được chứng minh bằng conversion/lift, không chỉ bằng accuracy.

### Mốc D — Production predictive assistant

Model, rule, scope, API, UI và monitoring hoạt động thành một decision system có version, owner, audit và rollback.

---

## 14. Tổng kết cuối cùng

### Hệ thống đã làm tốt điều gì?

Medstand đã hoàn thành phần nền tảng khó của một trợ lý doanh nghiệp: kết nối nghiệp vụ, API, scope, rule, audit, hội thoại và cách trình bày kết quả. Đây không phải prototype rỗng và không cần viết lại khi thêm predictive ML.

### Hệ thống đang thiếu điều gì quan trọng nhất?

Thiếu hai nhóm bằng chứng:

1. **Bằng chứng vận hành:** runtime UAT 13/13 tài khoản, 24 API, business sign-off và release sạch.
2. **Bằng chứng dự đoán:** feature snapshot, model đã train, evaluation, shadow mode và monitoring.

### Quyết định đề xuất

Không bắt đầu nhiều model cùng lúc. Trình tự đúng là:

```text
Ổn định Pilot hiện tại
→ khóa business/data baseline
→ xây feature snapshot
→ train REORDER_14D
→ Shadow Mode
→ chứng minh tốt hơn rule chu kỳ
→ Controlled Pilot
→ mở rộng model
```

### Trạng thái báo cáo đề xuất

```text
CURRENT_PRODUCT_STATUS = RULE_BASED_CONVERSATIONAL_PILOT_IN_PROGRESS
SOURCE_STATUS          = PARTIAL_PASS_WITH_DIRTY_WORKTREE
RUNTIME_STATUS         = PARTIAL_EVIDENCE_UAT_PENDING
BUSINESS_STATUS        = SIGN_OFF_PENDING
PREDICTIVE_STATUS      = HEURISTIC_BASELINE_ONLY
MLOPS_STATUS           = NOT_STARTED
PRODUCTION_STATUS      = NOT_READY
```

**Kết luận:** Medstand đủ nền tảng để hoàn thiện Pilot read-only trong ngắn hạn. Để trở thành trợ lý bán hàng dự đoán đáng tin cậy, dự án cần thêm khoảng 3–4 tháng để có controlled predictive Pilot và 4–6 tháng để đưa model đầu tiên qua production gate, với điều kiện dữ liệu và business owner sẵn sàng.
