# ⚠️ TÀI LIỆU THAM CHIẾU TƯƠNG LAI — ĐÓNG BĂNG

> **Trạng thái:** `FUTURE_REFERENCE_FROZEN`  
> **KHÔNG ĐƯỢC CHỈNH SỬA, TRIỂN KHAI HOẶC DÙNG LÀM CĂN CỨ NGHIỆM THU Ở GIAI ĐOẠN HIỆN TẠI.**
>
> Tài liệu này chỉ được lưu để tham khảo cho giai đoạn phát triển sau. Chỉ xem xét mở lại khi:
>
> 1. Phiên bản hiện tại đã hoàn thiện và vận hành ổn định với người dùng thật.
> 2. Hệ thống đã thu thập đủ dữ liệu hành vi, giao dịch và outcome thực tế.
> 3. Có baseline KPI và quyết định rõ ràng của Product/Business Owner về giai đoạn phát triển tiếp theo.
>
> Khi chưa đạt đủ ba điều kiện trên, mọi nội dung bên dưới chỉ là ý tưởng định hướng, không phải task, contract, cam kết release hay phạm vi triển khai.

<!-- DO NOT MODIFY OR IMPLEMENT THIS DOCUMENT UNTIL THE THREE REOPEN CONDITIONS ABOVE ARE MET. -->

---

MEDSTAND AI  |  Định hướng phát triển tương lai

MEDSTAND AI

ĐỊNH HƯỚNG PHÁT TRIỂN TƯƠNG LAI

Mục tiêu phát triển • Năng lực tương lai • Kiến trúc tiến hóa • Những thay đổi dự kiến

Loại tài liệu

System Strategy / Future Development Blueprint

Phạm vi

Toàn bộ sản phẩm Medstand AI

Đối tượng sử dụng

Chủ dự án, Product Owner, BA, Dev, Data/AI, QA, DevOps và Business Owner

Trạng thái

BẢN ĐỀ XUẤT – cần cập nhật theo quyết định nghiệp vụ được phê duyệt

Ngày lập: 03/08/2026


Trang 

MEDSTAND AI  |  Định hướng phát triển tương lai

Mục đích tài liệu

Tài liệu này là bản đồ phát triển cấp cao của Medstand AI. Nó đứng trên backlog kỹ thuật và các tài liệu module, giúp toàn bộ đội dự án nhìn chung một hướng: hệ thống sẽ trở thành gì, năng lực nào sẽ được phát triển, phát triển theo thứ tự nào, những thành phần hiện tại sẽ thay đổi ra sao và điều kiện nào phải đạt trước khi mở rộng sang AI dự đoán.

Định nghĩa ngắn gọn
Medstand AI sẽ phát triển từ trợ lý tra cứu nghiệp vụ thành trợ lý bán hàng có khả năng đề xuất hành động, hỗ trợ thực thi, đo kết quả và tiến tới dự đoán – tối ưu bằng mô hình AI.

Tài liệu nền và phạm vi sử dụng

Yêu cầu nghiệp vụ cấp cao của khách hàng về ứng dụng AI cho phần mềm Sale.

Backlog phát triển Medstand AI ngày 27/07/2026, gồm UAT, nghiệp vụ lõi, catalog/CTBH, tuyến, OCR và ML.

Kết quả audit và đánh giá hiện trạng: hệ thống đã có chatbot, n8n, SQL/API, phân quyền và nhiều chức năng, nhưng runtime, business rule và nền ML vẫn cần hoàn thiện.

Tài liệu này không thay thế đặc tả chi tiết, backlog, release manifest hay test evidence. Nó là nguồn định hướng cấp cao để các tài liệu đó cùng bám theo.

Mục lục

1. Tầm nhìn và mục tiêu phát triển tương lai

2. Điểm xuất phát và trạng thái đích

3. Nguyên tắc phát triển sản phẩm

4. Bản đồ năng lực tương lai

5. Các năng lực sẽ phát triển theo từng hướng

6. Lộ trình mô hình AI

7. Những thành phần hiện tại sẽ thay đổi

8. Kiến trúc mục tiêu và cách tiến hóa

9. Nền dữ liệu cần xây cho tương lai

10. Trải nghiệm người dùng và vai trò

11. Lộ trình giai đoạn và gate

12. Quyết định cần khách hàng chốt

13. KPI và tiêu chí đo thành công

14. Rủi ro phát triển và nguyên tắc kiểm soát

15. Kế hoạch 90 ngày gần nhất


Trang 

MEDSTAND AI  |  Định hướng phát triển tương lai

1. Tầm nhìn và mục tiêu phát triển tương lai

Tầm nhìn dài hạn của Medstand AI không dừng ở chatbot hỏi – đáp. Hệ thống cần trở thành một lớp hỗ trợ quyết định và thực thi bán hàng nằm trên dữ liệu ERP, giúp Sale, Manager và lãnh đạo chuyển dữ liệu thành hành động có thể đo lường.

1.1. Mục tiêu sản phẩm dài hạn

Mục tiêu

Kết quả hệ thống cần tạo ra

Chỉ số tác động

Tăng doanh số trên điểm bán

Gợi ý đúng khách, đúng sản phẩm, đúng thời điểm; tăng upsell và mua lại.

Giá trị đơn, tỷ lệ chuyển đổi, doanh số upsell.

Tăng hiệu suất TDV/Sale

Giảm thời gian tra cứu; tự động ưu tiên khách và chuẩn bị đề xuất bán hàng.

Thời gian xử lý, số khách chăm sóc/ngày, tỷ lệ hoàn thành tuyến.

Giảm rủi ro tồn kho

Hiển thị tồn theo quyền; cảnh báo thiếu, dư, chậm quay vòng và cận hạn.

Tỷ lệ hết hàng, tồn chậm, hàng cận date.

Tự động hóa quản lý tuyến

Xếp hạng khách nên ghé, tối ưu thứ tự và ghi nhận kết quả ghé.

Quãng đường, lượt ghé, đơn phát sinh, tỷ lệ chuyển đổi.

Tối ưu CTBH và tích lũy

Tính đúng chương trình, gợi ý mốc tiếp theo, đánh giá hiệu quả khuyến mại.

Tỷ lệ đạt thưởng, doanh số tăng thêm, lợi nhuận sau ưu đãi.

Xây năng lực AI dự đoán

Dự đoán mua lại, giảm mua, doanh số, tồn kho và hiệu quả CTKM.

Độ chính xác, lift so với baseline, giá trị kinh doanh tạo thêm.

1.2. Định vị sản phẩm theo từng mức trưởng thành

Tra cứu dữ liệu

→

Cảnh báo

→

Gợi ý hành động

→

Thực thi

→

Đo kết quả

→

Dự đoán & tối ưu

Mỗi mức trưởng thành phải kế thừa mức trước. Không nên bỏ qua nền dữ liệu, phân quyền, business rule và quy trình thực thi để đi thẳng tới mô hình AI. Một model dự đoán tốt nhưng không kiểm tra giá, tồn, CTBH và quyền người dùng vẫn không tạo ra sản phẩm dùng được.

2. Điểm xuất phát và trạng thái đích

2.1. Điểm xuất phát hiện tại

Chatbot-first, đã có frontend, n8n, SQL/API nghiệp vụ, xác thực, scope và audit ở mức nền tảng.

Nhiều chức năng hiện dựa trên business rule, heuristic và truy vấn dữ liệu; chưa phải predictive ML hoàn chỉnh.

Đã có các nhóm chức năng như gợi ý đơn, khách ưu tiên, công nợ, tồn kho, scoring, tích lũy, tra cứu sản phẩm và card/bảng kết quả.

Các điểm cần tiếp tục hoàn thiện gồm đồng bộ runtime, chuẩn hóa câu tự nhiên và lệnh, business rule được phê duyệt, observability, release discipline và dữ liệu phục vụ ML.

2.2. Trạng thái đích

Trạng thái đích của Medstand AI
Một nền tảng Sales Decision & Execution có thể: hiểu nhu cầu người dùng; lấy đúng dữ liệu theo quyền; tính rule và model; giải thích lý do; đề xuất hành động; hỗ trợ tạo giao dịch an toàn; ghi nhận outcome; và học từ kết quả thực tế.

Khía cạnh

Hiện tại

Trạng thái đích

Gợi ý

Rule/SQL rời rạc theo intent.

Decision Engine hợp nhất rule + model + ràng buộc nghiệp vụ.

Hội thoại

Một số luồng câu tự nhiên và lệnh có thể chưa đồng nhất.

Mọi đầu vào quy về CanonicalIntentRequest và cùng executor.

CTBH/chiết khấu

Dữ liệu và cách tính còn cần chốt đầy đủ.

Promotion Engine có phiên bản, hiệu lực, scope và audit.

Scoring

Ngưỡng/rule đang ở giai đoạn đề xuất.

ValueSegment và RiskLevel tách biệt, rule/model được duyệt.

Thực thi

Nhiều chức năng thiên về tra cứu/gợi ý.

Gợi ý → giỏ → preview → confirm → tạo đơn an toàn.

AI/ML

Chưa có nền predictive/MLOps hoàn chỉnh.

Model chạy shadow, controlled pilot, monitoring và fallback.

Vận hành

Đã có nền nhưng cần siết release/monitoring.

Manifest, CI/CD, log xuyên suốt, backup/rollback và cảnh báo.

3. Nguyên tắc phát triển sản phẩm

Nguyên tắc

Ý nghĩa áp dụng

Business-first

Mỗi chức năng phải gắn với mục tiêu tăng doanh số, tăng hiệu suất, giảm rủi ro hoặc cải thiện quản trị.

Rule-first, Model-next

Dùng rule làm baseline có thể giải thích; chỉ đưa model vào khi có dữ liệu, nhãn và metric chứng minh tốt hơn.

Human-in-the-loop

Các quyết định ảnh hưởng giá, chiết khấu, đơn hàng, nội dung y khoa hoặc CTKM phải có bước xác nhận/phê duyệt phù hợp.

Explainable by design

Mỗi gợi ý phải nêu lý do, dữ liệu tính đến thời điểm nào và rule/model nào tạo ra.

Security and scope by design

Không có chức năng nào được bỏ qua xác thực, customer scope, warehouse scope và audit.

One source of truth

ERP/nguồn nghiệp vụ là nguồn sự thật; frontend không tự tính lại giá, tồn, CTBH hoặc quyền.

Measurable outcomes

Mọi gợi ý phải có thể nối tới hành động và outcome để đo hiệu quả.

Progressive delivery

Shadow mode → controlled pilot → mở rộng; luôn có fallback và rollback.

4. Bản đồ năng lực tương lai

Khối năng lực

Tương lai gần

Tương lai xa

Sales Intelligence

Gợi ý đơn, mua lại, bán kèm, doanh số, công nợ.

Recommendation & ranking dựa trên model.

Customer & Route Intelligence

Khách cần ghé, khách giảm mua, scoring.

Churn prediction, learning-to-rank, route optimization.

Product, Stock & Promotion

Catalog, giá, tồn, lô/date, CTBH, tích lũy.

Demand forecast, promotion uplift và simulation.

Sales Execution

Giỏ hàng, preview, confirm, tạo đơn/khách.

Agent-assisted workflow có kiểm soát và automation.

Knowledge & Medical Assistance

Tra cứu sản phẩm, RAG, nội dung duyệt.

OCR/vision, entity extraction và semantic retrieval.

Management Intelligence

Báo cáo Manager/CEO, hiệu quả Sale và tuyến.

Forecast, scenario analysis và decision support.

Data & AI Platform

Dữ liệu nghiệp vụ và rule.

Feature snapshot, model registry, monitoring, MLOps.

Security & Operations

Auth, scope, log, release.

Zero-trust hơn, observability end-to-end, automated governance.

5. Các năng lực sẽ phát triển theo từng hướng

5.1. Sales Intelligence – từ gợi ý rule đến Next Best Action

Hoàn thiện gợi ý đơn hàng theo lịch sử, chu kỳ, mùa vụ, tồn và CTBH.

Bổ sung giải thích: lần mua gần nhất, chu kỳ, xu hướng, chương trình áp dụng và tồn khả dụng.

Cho phép đưa gợi ý vào giỏ, điều chỉnh số lượng, xem preview và xác nhận.

Phát triển model REORDER_14D và NEXT_BEST_PRODUCT khi có dữ liệu nhãn và outcome.

Tiến tới Next Best Action: không chỉ gợi ý sản phẩm mà còn đề xuất gọi, ghé, nhắc công nợ hoặc đẩy CTBH phù hợp.

5.2. Customer & Route Intelligence – từ danh sách khách đến tối ưu hành trình

Chuẩn hóa khách lâu chưa mua, khách giảm mua và khách sắp tới chu kỳ mua lại.

Tách ValueSegment (A/B/C/UNRATED) khỏi RiskLevel (LOW/MEDIUM/HIGH).

Chấm điểm ưu tiên ghé dựa trên chu kỳ, giảm mua, tích lũy, tiềm năng và lịch tuyến.

Ghi nhận outcome của mỗi lượt ghé: gặp/không gặp/hẹn lại/đơn phát sinh.

Khi dữ liệu tọa độ đủ tốt, phát triển route optimization có ràng buộc thời gian và số điểm ghé.

5.3. Product, Stock & Promotion – từ tra cứu đến Decision Engine

Xây catalog hợp nhất: ảnh, công dụng, giá, tồn, lô/date, CTBH và hành động tiếp theo.

Phát triển Promotion Decision Engine để tính số lượng mua, hàng tặng, tổng giao, chiết khấu và chương trình áp dụng.

Frontend chỉ hiển thị kết quả; mọi phép tính giá/tồn/CTBH thực hiện ở backend.

Theo dõi tích lũy theo chương trình, mốc tiếp theo và sản phẩm gợi ý để đạt thưởng.

Về sau bổ sung demand forecast, cảnh báo tồn và promotion uplift.

5.4. Sales Execution – từ tư vấn đến giao dịch an toàn

Chuẩn hóa trạng thái PREVIEW, CONFIRMED, CREATED, FAILED và CANCELLED.

Kiểm tra lại giá, tồn và CTBH tại thời điểm confirm.

Bổ sung idempotency, chống double-click/retry, audit và mã giao dịch.

Kết nối gợi ý với giỏ hàng và tạo đơn; chưa xác nhận thì không ghi ERP.

Về sau có thể phát triển agent-assisted workflow, nhưng không tự động tạo giao dịch ngoài phạm vi phê duyệt.

5.5. Knowledge & Medical Assistance – từ catalog đến OCR có kiểm soát

Quản trị nguồn tài liệu, phiên bản, ngày hiệu lực, người duyệt và thu hồi.

RAG chỉ sử dụng nội dung đã được phê duyệt và còn hiệu lực.

Tư vấn triệu chứng ở mức tra cứu/hỗ trợ, không chẩn đoán hoặc kê đơn.

OCR đơn thuốc là luồng riêng: upload → OCR → xác nhận tay → mapping → gợi ý có cảnh báo.

Mọi mapping y khoa phải có nguồn và người chuyên môn phê duyệt.

5.6. Management Intelligence – từ báo cáo sang hỗ trợ quyết định

Danh sách khách có khả năng đạt thưởng, khách giảm mua, hiệu quả Sale và hiệu quả tuyến.

Phân tích sản phẩm chậm quay vòng, cận date, thiếu/dư tồn và hiệu quả CTBH.

Dự báo doanh số theo sản phẩm, Sale, chi nhánh và vùng.

Về sau hỗ trợ mô phỏng kịch bản CTKM; kết quả chỉ là đề xuất và cần người có thẩm quyền duyệt.

5.7. Platform, Security & Operations – nền móng cho mở rộng

Một luồng chuẩn cho câu tự nhiên và lệnh; cùng auth, scope, API và renderer.

Request ID xuyên suốt UI → Gateway → n8n → SQL/model.

Release manifest, version, checksum, CI/CD, backup và rollback.

Monitoring success rate, 4xx/5xx, p50/p95, workflow failure và model health.

Secret management, file public policy, negative authorization test và audit mutation.

6. Lộ trình mô hình AI

Các mô hình dưới đây là hướng phát triển đề xuất. Mỗi model chỉ được đưa vào quyết định thật sau khi có baseline, dữ liệu nhãn, đánh giá offline, shadow mode, controlled pilot và cơ chế fallback.

Model/Năng lực

Dự đoán hoặc đầu ra

Ứng dụng

Điều kiện trước khi làm

REORDER_14D

Khả năng khách–sản phẩm mua lại trong 14 ngày.

Gợi ý đơn, khách cần ghé.

Dữ liệu lịch sử sạch; snapshot theo thời gian; label mua lại.

NEXT_BEST_PRODUCT

Xếp hạng sản phẩm/ combo phù hợp cho khách.

Upsell, cross-sell, giỏ hàng.

Lịch sử giỏ/đơn; catalog; tồn; CTBH; outcome chọn/mua.

CUSTOMER_CHURN_RISK

Nguy cơ giảm mua hoặc rời bỏ.

Cảnh báo, ưu tiên chăm sóc.

Chu kỳ khách, xu hướng doanh số/tần suất, outcome chăm sóc.

SALES_FORECAST

Dự báo doanh số theo thời gian và cấp tổ chức.

Kế hoạch Sale/Manager/CEO.

Chuỗi thời gian sạch, mùa vụ, trả hàng, CTKM.

INVENTORY_FORECAST

Dự báo thiếu/dư tồn và cận hạn.

Cảnh báo kho, đề xuất xử lý.

Bán/nhập/trả/tồn/lô/date và lead time.

PROMOTION_UPLIFT

Ước lượng phần tăng thêm do CTKM.

Đề xuất CTKM cho CEO.

Lịch sử chương trình, nhóm đối chứng/so sánh, margin.

ROUTE_RANKING/OPT

Xếp hạng và tối ưu thứ tự ghé.

Quản lý tuyến.

Tọa độ, thời gian, outcome ghé, ràng buộc lịch.

OCR + ENTITY EXTRACTION

Trích xuất tên thuốc, hàm lượng, số lượng.

Đơn thuốc từ ảnh.

Bộ ảnh có nhãn, quy trình xác nhận, chính sách dữ liệu.

6.1. Cơ chế triển khai model

Baseline rule

→

Đánh giá offline

→

Shadow mode

→

Controlled Pilot

→

Mở rộng có giám sát

Rule vẫn giữ vai trò ràng buộc: quyền, tồn, hiệu lực CTBH, hàng cận hạn và quy tắc bắt buộc.

Model cung cấp điểm số/xếp hạng, không tự vượt business rule.

Khi model lỗi hoặc dữ liệu thiếu, hệ thống fallback về rule hoặc trả NO_DATA rõ ràng.

Mỗi kết quả lưu ModelVersion, RuleVersion, DataAsOf và DecisionVersion.

7. Những thành phần hiện tại sẽ thay đổi

Hiện tại

Sẽ thay đổi thành

Mục đích

Chatbot hỏi–đáp

Chatbot rich response có card/bảng/drawer và hành động tiếp theo.

Người dùng không chỉ đọc mà có thể tiếp tục quy trình.

Intent rời rạc

CanonicalIntentRequest và executor chung.

Giảm sai khác giữa lệnh @ và câu tự nhiên.

Rule/SQL đơn lẻ

Decision Engine: rule + model + policy + scope.

Một nơi quyết định kết quả cuối cùng.

Frontend có thể tự diễn giải/tính

Backend trả contract chuẩn, frontend chỉ render.

Tránh sai giá, tồn, hàng tặng và chiết khấu.

CTBH dạng file/thông báo

Promotion Engine có hiệu lực, version, scope, ưu tiên và audit.

Tính nhất quán và truy vết được.

A/B/C trộn với rủi ro

ValueSegment và RiskLevel tách riêng.

Phân tích đúng bản chất giá trị và nguy cơ.

Gợi ý không đo outcome đầy đủ

Event logging từ xem → chọn → giỏ → đơn → mua lại.

Tạo dữ liệu đánh giá và huấn luyện model.

Dữ liệu hiện trạng

Feature snapshot theo thời điểm và dữ liệu lịch sử tái lập.

Tránh leakage và hỗ trợ backtest.

Tài liệu dùng trực tiếp

Kho tri thức có workflow duyệt/hiệu lực/thu hồi.

Kiểm soát nội dung và trách nhiệm.

Release thủ công

Manifest + CI/CD + checksum + rollback test.

Biết chính xác bản nào đang chạy.

Log phân tán

Observability xuyên suốt và dashboard vận hành.

Rút ngắn thời gian tìm lỗi.

8. Kiến trúc mục tiêu và cách tiến hóa

Luồng kiến trúc mục tiêu
Người dùng → Chat/Rich UI → Gateway → Intent & Context → Authorization → Decision & Orchestration → Domain Services → Data/Model → Observability.

Lớp

Thành phần

Vai trò

Experience Layer

Chatbot, card, bảng, drawer, quick order, admin portal.

Giữ chatbot-first nhưng hỗ trợ thao tác nghiệp vụ.

Gateway

Auth, validation, request ID, rate limit, error envelope.

Điểm kiểm soát đầu vào thống nhất.

Conversation & Intent

Normalize, parser, context manager, CanonicalIntentRequest.

Một business flow cho mọi kiểu nhập.

Authorization

Capability, customer scope, warehouse scope.

Quyền được xác minh từ server.

Decision & Orchestration

n8n, Business Rule Engine, Promotion Engine, model scoring.

Kết hợp dữ liệu, rule và model.

Domain Services

Customer, Sales, Order, Stock, Price, Promotion, Route, Debt.

Tách logic nghiệp vụ thành service/contract rõ.

Data & AI

ERP, knowledge, config, feature store/snapshots, prediction store.

Nguồn sự thật và dữ liệu phục vụ học máy.

Operations

Logs, metrics, alerts, release, backup, security.

Vận hành an toàn và mở rộng.

8.1. Nguyên tắc tích hợp model vào kiến trúc

Model Scoring là một thành phần có thể thay thế/version hóa, không nhúng trực tiếp vào frontend hoặc procedure rời rạc.

Decision Engine chịu trách nhiệm ghép score với business constraints và chọn kết quả hiển thị.

Mọi model phải có timeout, fallback, metric và cơ chế tắt nhanh bằng feature flag.

Không để model trực tiếp tạo đơn, thay đổi giá hoặc kích hoạt CTKM mà không có policy và xác nhận.

9. Nền dữ liệu cần xây cho tương lai

9.1. Các miền dữ liệu cốt lõi

Miền dữ liệu

Nội dung chính

Dùng cho

Identity & quyền

User, role, branch, customer scope, warehouse scope.

Phân quyền mọi truy vấn/hành động.

Khách hàng

DMKH, kênh, tuyến, trạng thái, tọa độ.

Scoring, route, recommendation.

Bán hàng

Đơn/hóa đơn, dòng hàng, trả/hủy, giá trị.

Chu kỳ, mua lại, doanh số, ML label.

Tồn kho

Kho, lô, date, tồn vật lý/khả dụng.

Tư vấn, cảnh báo và tạo đơn.

Giá & CTBH

Bảng giá, hiệu lực, điều kiện, ưu đãi, tích lũy.

Promotion/price decision.

Sản phẩm & tri thức

Catalog, ảnh, công dụng, tài liệu duyệt.

Tra cứu, RAG, OCR mapping.

Tuyến & ghé khách

Lịch, check-in, kết quả ghé, đơn phát sinh.

Route ranking và đo hiệu quả.

Sự kiện sử dụng

View, click, select, add-to-cart, order, outcome.

Đo adoption, conversion và train model.

9.2. Những dữ liệu mới phải bắt đầu ghi từ hiện tại

Recommendation event: ai, khách nào, sản phẩm nào, rule/model nào, score và lý do.

User action event: xem, chọn, bỏ qua, đưa vào giỏ, xác nhận, tạo đơn.

Outcome event: khách có mua thật không, mua khi nào, giá trị bao nhiêu, có trả hàng không.

Data snapshot: trạng thái khách, tồn, CTBH và feature tại thời điểm tạo gợi ý.

Version metadata: RuleVersion, ModelVersion, DataAsOf, DecisionVersion và RequestId.

Điểm then chốt
Nếu không ghi hành vi và outcome từ bây giờ, tương lai sẽ không có dữ liệu đáng tin để chứng minh model tốt hơn rule hoặc để huấn luyện recommendation/churn/promotion model.

10. Trải nghiệm người dùng và vai trò

Vai trò

Trải nghiệm/năng lực tương lai

Sale/TDV

Việc hôm nay, khách nên ghé, gợi ý đơn, giá/tồn/CTBH, tích lũy, giỏ/preview, tra cứu sản phẩm.

Manager

Theo dõi đội Sale, khách rủi ro, khách có khả năng đạt thưởng, hiệu quả tuyến, cảnh báo tồn và phê duyệt theo quyền.

Admin

Quản trị người dùng, phân quyền, catalog, tài liệu, CTBH, hiệu lực, audit và cấu hình.

CEO/Lãnh đạo

Tổng quan doanh số, dự báo, hiệu quả CTKM, sản phẩm chậm quay vòng, kịch bản đề xuất.

Business Owner/Chuyên môn

Duyệt rule, ngưỡng, CTBH, nội dung sản phẩm/y khoa và KPI nghiệm thu.

10.1. Nguyên tắc UX tương lai

Chatbot vẫn là điểm khởi đầu, nhưng kết quả dùng card, bảng, progress bar, drawer và nút hành động.

Một card trả lời một ý định chính; chi tiết lớn mở qua drawer hoặc màn hình chuyên biệt.

Các giá trị quan trọng phải có nhãn rõ: số lượng mua, hàng tặng, tổng giao, chiết khấu, giá, kho, ngày dữ liệu.

Không lộ tên procedure, DocumentID hoặc field kỹ thuật cho người dùng cuối.

NO_DATA phải khác giá trị 0; lỗi phải có thông báo thân thiện và mã tra cứu.

11. Lộ trình giai đoạn và gate

Giai đoạn

Mục tiêu

Phạm vi chính

Gate

Giai đoạn 0

Ổn định nền UAT

Khóa runtime, auth/scope, security, release, dữ liệu mẫu, test lõi.

UAT_BASELINE_READY

Giai đoạn 1

Lõi bán hàng dùng được

Gợi ý → giá/tồn/CTBH → giỏ → preview → confirm/tạo đơn.

CORE_SALES_FLOW_READY

Giai đoạn 2

Catalog & Promotion

Catalog hợp nhất, Promotion Engine, tích lũy, quản trị nội dung.

CATALOG_PROMOTION_READY

Giai đoạn 3

Tuyến & quản lý Sale

Xếp hạng khách, bản đồ, ghi nhận ghé và báo cáo chuyển đổi.

ROUTE_OPTIMIZATION_PILOT

Giai đoạn 4

OCR có kiểm soát

OCR, xác nhận tay, mapping chuyên môn, chính sách dữ liệu.

PRESCRIPTION_OCR_CONTROLLED_PILOT

Giai đoạn 5

Predictive Shadow

REORDER_14D, churn, forecast chạy shadow và monitoring.

PREDICTIVE_SHADOW_READY

Giai đoạn 6

Decision Optimization

Uplift, route optimization, simulation và controlled automation.

DECISION_OPTIMIZATION_READY

11.1. Điều kiện không được bỏ qua khi chuyển giai đoạn

Không mở model khi chưa có baseline rule và metric so sánh.

Không mở OCR khi chưa có người chuyên môn, chính sách dữ liệu và quy trình xác nhận tay.

Không mở route optimization khi chất lượng tọa độ và outcome ghé chưa đủ.

Không tự động hóa giao dịch khi preview/confirm/idempotency/audit chưa đạt.

Không coi một giai đoạn hoàn thành nếu runtime không khớp source/manifest và chưa có test evidence.

12. Quyết định cần khách hàng chốt

Đội kỹ thuật quyết định kiến trúc và cách hiện thực. Khách hàng/Business Owner cần chốt phạm vi, business rule, dữ liệu nguồn và tiêu chí nghiệm thu. Các quyết định dưới đây ảnh hưởng trực tiếp đến roadmap tương lai.

Nhóm quyết định

Nội dung cần chốt

Phạm vi Pilot

Chức năng bắt buộc, chỉ preview hay tạo đơn thật, nhóm người dùng áp dụng.

Customer/Warehouse Scope

Sale/Manager được xem khách và kho nào; xác nhận CTY, DL02, DL03 và các kho phụ.

Khách giảm mua

Mốc 45/90 ngày, ngoại lệ theo nhóm khách và cách ưu tiên ghé.

Customer Scoring

Công thức A/B/C, P50/P80, cửa sổ dữ liệu, khách mới và UNRATED.

RiskLevel

LOW/MEDIUM/HIGH tính theo chu kỳ, số ngày, xu hướng hay kết hợp.

CTBH/chiết khấu

Ưu tiên, cộng dồn, hệ thống tự chọn hay Sale chọn, quyền điều chỉnh ngoại lệ.

Tích lũy

Trước/sau VAT, trả hàng, đơn hủy, hàng tặng, mốc thưởng.

Catalog/y khoa

Nguồn chính thức, người duyệt, phạm vi tư vấn và disclaimer.

OCR & dữ liệu ảnh

Quyền truy cập, thời gian lưu, xóa và xác nhận kết quả.

KPI

Pass rate, latency, adoption, conversion, lift và người ký xác nhận.

13. KPI và tiêu chí đo thành công

Nhóm KPI

Ví dụ chỉ số

Adoption

Người dùng hoạt động, số phiên, số câu hỏi, tỷ lệ dùng lại.

Sales funnel

Gợi ý được xem → được chọn → vào giỏ → thành đơn.

Business impact

Doanh số upsell, tỷ lệ mua lại, khách quay lại, giá trị đơn.

Route

Lượt ghé, hoàn thành tuyến, đơn phát sinh, thời gian/quãng đường.

Promotion

Khách đạt mốc, doanh số tăng thêm, margin sau ưu đãi.

Quality

Pass rate, NO_DATA đúng, sai quyền/sai giá/sai CTBH.

Performance

p50/p95, timeout, success rate, workflow/model failure.

Model

Precision/recall, ranking lift, calibration, drift và business lift.

Operations

Uptime, MTTR, rollback success, backup restore test.

Nguyên tắc nghiệm thu AI
Không nghiệm thu model chỉ bằng độ chính xác kỹ thuật. Model phải chứng minh tốt hơn baseline và tạo tác động kinh doanh trong controlled pilot, đồng thời không vi phạm quyền, giá, tồn, CTBH và quy trình xác nhận.

14. Rủi ro phát triển và nguyên tắc kiểm soát

Rủi ro

Hệ quả

Biện pháp kiểm soát

Phát triển dàn trải

Nhiều module cùng lúc nhưng không có luồng nào dùng tốt.

Khóa roadmap theo gate; ưu tiên vòng bán hàng lõi.

Gọi rule là AI

Kỳ vọng khách hàng không đúng với năng lực thật.

Công bố rõ rule/heuristic/model và phiên bản.

Model thiếu dữ liệu

Kết quả không ổn định, không chứng minh được.

Audit dữ liệu, baseline, shadow mode và fallback.

Business rule chưa chốt

Dev hiểu khác nhau, nghiệm thu tranh cãi.

Decision Register và sign-off trước implementation sâu.

Sai quyền/sai scope

Rò dữ liệu khách/kho.

Authorization server-side, negative tests, audit.

Frontend tự tính

Sai chiết khấu/hàng tặng/tổng tiền.

Backend contract là nguồn duy nhất.

Runtime lệch source

Không biết bản nào đang chạy.

Manifest, checksum, CI/CD và runtime verification.

Không ghi outcome

Không đo được giá trị và không train model.

Event instrumentation ngay từ giai đoạn lõi.

OCR/y khoa quá sớm

Rủi ro chuyên môn và dữ liệu nhạy cảm.

Controlled pilot, xác nhận tay, người duyệt và policy.

15. Kế hoạch 90 ngày gần nhất

Để vừa giữ hướng tương lai vừa tạo sản phẩm dùng được, 90 ngày gần nhất nên tập trung vào nền móng có thể tái sử dụng cho các giai đoạn sau.

Thời gian

Trọng tâm

Đầu ra

0–30 ngày

Khóa baseline runtime; hoàn tất n8n/auth/scope/security; chốt 8 luồng lõi; lập Customer Decision Register.

Một bản UAT đáng tin và danh sách rule cần sign-off.

31–60 ngày

Hoàn thiện gợi ý → giá/tồn/CTBH → giỏ/preview; chuẩn hóa error/request ID; ghi event xem/chọn/giỏ.

Core flow dùng được và có dữ liệu hành vi.

61–90 ngày

Controlled Pilot; đo conversion; khóa contract Promotion/Scoring; thiết kế feature snapshot và REORDER_14D shadow plan.

Có baseline kinh doanh và nền dữ liệu cho model đầu tiên.

15.1. Ưu tiên tuyệt đối

1. Khóa đúng một runtime và bảo đảm auth/scope/security.

2. Hoàn thiện một vòng bán hàng lõi từ gợi ý đến preview/đơn.

3. Chốt business rule thuộc phạm vi Pilot.

4. Bắt đầu ghi dữ liệu hành vi và outcome.

5. Sau đó mới triển khai model REORDER_14D ở shadow mode.

Kết luận định hướng

Hướng phát triển tổng thể
Medstand AI sẽ đi theo chuỗi: Trợ lý tra cứu → Trợ lý hành động → Hệ thống điều hành bán hàng → Nền tảng dự đoán và tối ưu. Tương lai không phải thêm thật nhiều module rời rạc, mà là làm cho dữ liệu, rule, model, workflow và outcome kết nối thành một vòng quyết định thống nhất.

Các năng lực tương lai phải được thiết kế từ hôm nay nhưng triển khai theo gate. Nền tảng cần sẵn sàng để cắm model vào mà không viết lại toàn bộ, đồng thời vẫn bảo đảm hệ thống hiện tại dùng được, giải thích được, đúng quyền, truy vết được và có thể rollback.

Phụ lục A – Bảng tóm tắt “Hiện tại → Tương lai”

Capability

Hiện tại

Tương lai gần

Tương lai xa

Gợi ý đơn

Rule/SQL

Decision Engine

Recommendation model

Khách cần ghé

Mốc ngày/rule

Priority score

Learning-to-rank + route optimization

Scoring

Ngưỡng đề xuất

RuleSet được duyệt

Predictive scoring

Tồn kho

Tra cứu

Cảnh báo rule

Demand/stock forecast

CTBH

File/thông báo

Promotion Engine

Uplift optimization

Tích lũy

Theo dõi mốc

Upsell/next milestone

Personalized offer

Catalog

Dữ liệu rời

Catalog hợp nhất

Semantic/RAG search

Tuyến

Danh sách khách

Bản đồ + outcome

Optimization

Đơn thuốc

Chưa/giới hạn

OCR xác nhận tay

Vision + extraction

Quản lý

Báo cáo cơ bản

Dashboard điều hành

Forecast + simulation

Phụ lục B – Phân loại hạng mục

Nhãn

Ý nghĩa

CUSTOMER_REQUIREMENT

Yêu cầu trực tiếp khách hàng nhìn thấy và nghiệm thu.

DERIVED_REQUIREMENT

Yêu cầu suy ra để đáp ứng đúng yêu cầu khách hàng.

TECHNICAL_ENABLER

Nền kỹ thuật bắt buộc như contract, data, integration, observability.

SECURITY_NFR

Yêu cầu bảo mật, quyền, audit, backup và vận hành.

FUTURE_CAPABILITY

Năng lực tương lai đã định hướng nhưng chưa cam kết trong release hiện tại.

BUSINESS_DECISION_REQUIRED

Phải có Business Owner/khách hàng chốt trước khi triển khai hoặc nghiệm thu.

Phụ lục C – Nguồn tham chiếu

Yêu cầu “Ứng dụng AI cho phần mềm Sale” do khách hàng cung cấp: mục tiêu, module, dữ liệu cần chuẩn bị và lộ trình đề xuất.

Backlog task phát triển Medstand AI, ngày 27/07/2026.

Tóm tắt audit và định vị hiện tại của Medstand AI trong phiên trao đổi trước.

Các nội dung về mô hình AI, kiến trúc mục tiêu và roadmap trong tài liệu này là đề xuất thiết kế của đội dự án, cần được cập nhật theo quyết định nghiệp vụ và bằng chứng kỹ thuật mới.

