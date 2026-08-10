# KẾ HOẠCH CHỈNH SỬA LUỒNG CHAT TỰ NHIÊN NHIỀU LƯỢT

**Ngày lập:** 2026-08-09  
**Trạng thái:** `DESIGN_REVIEW_APPROVED_WITH_REQUIRED_CLARIFICATIONS`  
**Mức sẵn sàng triển khai:** `IMPLEMENTATION_NOT_READY`  
**Rủi ro runtime:** `MEDIUM`  
**Thay đổi hành vi mutation:** `NONE`  
**Mức chấp nhận regression mutation:** `ZERO`  
**Phạm vi build/deploy được bảo vệ:** `ENFORCED`

> Tài liệu này là kế hoạch thiết kế và nghiệm thu. Tài liệu không cấp quyền sửa code, chạy build, triển khai workflow hoặc tác động dữ liệu nghiệp vụ.

## 1. Bối cảnh và lỗi cần giải quyết

Hệ thống đã xử lý tốt phần lớn câu hỏi độc lập, nhưng còn lỗi khi người dùng bổ sung dữ liệu bằng một câu trả lời ngắn ở lượt tiếp theo.

Ví dụ hiện tại:

```text
Người dùng: xem công nợ
AI: Bạn muốn xem công nợ của khách hàng nào?
Người dùng: NDB001
AI: Tôi chưa hiểu rõ yêu cầu...
```

Kết quả mong muốn:

```text
Người dùng: xem công nợ
AI: Bạn muốn xem công nợ của khách hàng nào?
Người dùng: NDB001
AI: <xác thực NDB001 và gọi @cong_no_chi_tiet>
```

Nguyên nhân thiết kế cần xử lý: câu `NDB001` đang bị xem như một yêu cầu độc lập thay vì giá trị bổ sung cho trường `customerId` đang thiếu.

Các khoảng trống liên quan:

- Yêu cầu danh mục thiếu loại danh mục chưa luôn hỏi lại đúng trường.
- Tìm sản phẩm theo triệu chứng thiếu từ khóa chưa luôn hỏi lại.
- Một số API READ có thể dùng contract tra cứu sản phẩm không đồng nhất.
- Chưa có chính sách rõ cho chat ngoài lề, nhiều kết quả, request trùng, request đồng thời và phản hồi cũ trả về muộn.

## 2. Mục tiêu

Xây dựng cơ chế `pending-context` có cấu trúc cho các intent chỉ đọc dữ liệu, nhằm:

- Ghi nhận chính xác nghiệp vụ đang chờ và trường còn thiếu.
- Dùng câu trả lời ở lượt sau để điền đúng trường nghiệp vụ.
- Xác thực cú pháp, sự tồn tại và quyền truy cập trước khi gọi API đích.
- Không nhầm mã khách hàng, sản phẩm, chứng từ hoặc loại danh mục.
- Không rò context giữa user, conversation hoặc runtime instance.
- Xử lý an toàn request trùng, request đồng thời và stale response.
- Giữ nguyên tuyệt đối hành vi mutation hiện hành.

## 3. Phạm vi

### 3.1. Trong phạm vi

- Intent chỉ đọc dữ liệu (`READ`).
- Công nợ khách hàng.
- Tồn kho và thông tin sản phẩm.
- Danh mục.
- Tìm sản phẩm theo triệu chứng hoặc từ khóa.
- Tra cứu chứng từ và các intent READ khác có trường bắt buộc bị thiếu, sau khi được kiểm kê và khóa contract.
- Hủy pending intent, lệnh mới thay thế, chat ngoài lề, giá trị mơ hồ và nhiều kết quả.
- Context isolation, TTL, deduplication, concurrency, stale response, logging và đo hiệu năng.

### 3.2. Ngoài phạm vi và bị khóa

- Tạo khách hàng và toàn bộ phạm vi `CORE-001`, `CORE-002`, `CORE-003`, `UAT-017`.
- `API_KhachHang_Insert_AI`.
- Form/renderer tạo khách hàng, preview, confirmation, idempotency và audit liên quan.
- Tạo đơn hàng hoặc bất kỳ mutation nào khác.
- Thay đổi contract xác nhận mutation.
- Mở, chạy, sinh lại, ghi đè hoặc triển khai artifact có thể chứa hay ảnh hưởng luồng tạo khách hàng.

Nếu một bước triển khai không thể chứng minh độc lập với phạm vi bị khóa, phải dừng và xin phê duyệt cụ thể trước khi thực hiện.

## 4. Nguyên tắc thiết kế

1. Không suy diễn pending state từ toàn bộ lịch sử chat tự do.
2. Không mở rộng regex rời rạc để vá từng câu trả lời ngắn.
3. Chỉ kích hoạt resolver đặc biệt khi conversation có pending context hợp lệ.
4. Không có pending context thì tin nhắn đi vào classifier bình thường, ngoại trừ cơ chế chống trùng `messageId`.
5. Pending context chỉ hoàn tất yêu cầu READ; không phải đường tắt thực thi mutation.
6. Một mã đơn lẻ thuộc entity khác không được xem là lệnh nghiệp vụ mới.
7. Thời gian, TTL và quyền sở hữu conversation phải do server xác định.
8. Không lưu token, secret, toàn bộ lịch sử chat hoặc dữ liệu cá nhân không cần thiết.
9. Thay đổi phải ở mức tối thiểu, có regression test trước và bằng chứng nghiệm thu sau.

## 5. Kiến trúc logic đề xuất

```text
Incoming message
→ Authentication / verified principal
→ Server validation of conversationId
→ messageId deduplication
→ Pending Context Resolver (chỉ khi có pending hợp lệ)
   1. Explicit cancel
   2. Explicit new business command
   3. Fill missing field
   4. Off-topic handling
→ Normal intent classifier
→ API planner
→ Syntax validation
→ Entity existence validation
→ Scope/access validation
→ API execution
→ Response normalization
→ Atomic context transition
```

Thứ tự trong pending resolver được khóa:

```text
1. Hủy rõ ràng
2. Lệnh nghiệp vụ mới rõ ràng
3. Điền trường đang thiếu
4. Chat ngoài lề
5. Classifier bình thường
6. UNKNOWN
```

`Explicit new business command` phải có động từ/nghiệp vụ rõ ràng và đủ độ tin cậy. Ví dụ `kiểm tra tồn kho A003` là lệnh mới; riêng `A003` không phải lệnh mới.

## 6. Schema pending-context dự kiến

```json
{
  "schemaVersion": 1,
  "contextId": "uuid",
  "principalId": "verified-user-id",
  "conversationId": "server-validated-id",
  "pendingIntent": "CUSTOMER_DEBT_DETAIL",
  "apiCode": "@cong_no_chi_tiet",
  "missingFields": ["customerId"],
  "collectedFields": {},
  "contractVersion": 1,
  "status": "WAITING_FOR_FIELD",
  "contextVersion": 1,
  "attemptCount": 0,
  "createdAt": "server-time",
  "updatedAt": "server-time",
  "expiresAt": "server-time",
  "lastMessageId": "message-id",
  "requestId": "request-id"
}
```

`fieldDefinitions` nên nằm trong intent contract có version; không cần sao chép toàn bộ vào context store nếu runtime có thể truy xuất an toàn theo `contractVersion`.

## 7. Bảy quyết định phải khóa trước khi code

### 7.1. Context-store contract và lựa chọn công nghệ

Chưa mặc định chọn Redis, SQL hay in-memory. Trước hết, store phải đáp ứng:

- Khóa theo `verifiedPrincipalId + validatedConversationId`.
- TTL dựa trên giờ server.
- Atomic compare-and-set theo `contextVersion`.
- Chống xử lý trùng `messageId`.
- Không lộ context giữa các runtime instance.
- Cleanup sau `SUCCESS`, `CANCEL` và `EXPIRE`.
- Không lưu token, secret hoặc raw prompt không cần thiết.

Sau khi audit topology runtime mới chọn store hiện hữu, Redis, SQL hoặc phương án khác. In-memory chỉ được cân nhắc nếu chứng minh hệ thống một instance và chấp nhận mất context khi restart.

### 7.2. Xác minh conversationId

- Không tin trực tiếp `conversationId` tùy ý từ frontend.
- Gateway phải xác minh conversation thuộc verified principal hiện tại.
- Không cho phép thay ID để đọc hoặc sửa context của user/conversation khác.
- Nếu cần, conversation ID phải được server sinh hoặc ký.

### 7.3. Atomic update và chống request trùng

- Mỗi transition mang `contextId`, `contextVersion`, `messageId` và `requestId`.
- Chỉ cập nhật nếu version hiện tại khớp version đã đọc.
- Cùng một `messageId` không được gọi API nghiệp vụ hai lần.
- Request cũ hoàn tất sau không được ghi đè context mới.

### 7.4. Chính sách kết quả API

| Kết quả | Xử lý pending context |
|---|---|
| `SUCCESS` | Hoàn tất và xóa context |
| Sai cú pháp | Giữ context, tăng attempt và hỏi lại |
| Entity không tồn tại | Giữ hoặc kết thúc theo contract intent; không rơi vào `UNKNOWN` |
| Không thuộc scope | Không giữ giá trị vừa nhập; xử lý theo access policy |
| `NO_DATA` | Phân biệt entity tồn tại nhưng không có dữ liệu với entity không tồn tại |
| `401/403` | Không retry âm thầm; xóa/khóa context theo auth policy |
| Timeout/`5xx` | Giữ context trong TTL để thử lại, không gọi lặp tự động ngoài policy |
| User hủy | Xóa context |
| Intent mới rõ ràng | Thay thế bằng context mới nếu intent mới cần bổ sung trường |
| TTL hết | Xóa và thông báo yêu cầu trước đã hết hạn |

### 7.5. Off-topic, ambiguity và nhiều kết quả

Off-topic khi đang pending:

- Không trích xuất làm field nghiệp vụ.
- Trả lời ngắn hoặc thông báo chưa hiểu.
- Nhắc lại trường đang chờ và quyền nói “hủy”.
- Giữ context tới TTL.
- Không gọi thêm RAG/LLM tổng quát chỉ để xử lý nhánh này trong giai đoạn đầu.

Khi tìm bằng tên/từ khóa:

```text
0 kết quả → hỏi lại
1 kết quả → xác nhận/chọn theo contract
Nhiều kết quả → trả danh sách ngắn để người dùng chọn
```

Không tự lấy dòng đầu tiên khi có nhiều kết quả.

### 7.6. Stale-response và request ordering

Response của request cũ chỉ được thay đổi pending state nếu `contextId` và `contextVersion` còn khớp. Response cũ có thể hiển thị gắn với message cũ, nhưng không được:

- Xóa context mới.
- Ghi đè context mới.
- Đánh dấu yêu cầu mới là hoàn tất.
- Làm UI hiểu sai request hiện hành.

### 7.7. Ranh giới build và test

Chỉ được build/test target độc lập khi dependency graph chứng minh target đó không import, execute, generate hoặc ghi đè artifact thuộc luồng tạo khách hàng.

Nếu không chứng minh được tính cô lập:

1. Không chạy target.
2. Không tạo generated artifact.
3. Không deploy bundle dùng chung.
4. Dừng và xin phê duyệt cụ thể.

## 8. Intent contract bắt buộc

Mỗi intent READ trong giai đoạn này phải có:

| Trường | Ý nghĩa |
|---|---|
| `intentCode` | Intent canonical |
| `apiCode` | API đích |
| `requiredFields` | Danh sách trường bắt buộc |
| `entityType` | `CUSTOMER`, `PRODUCT`, `DOCUMENT`, `CATEGORY`, ... |
| `extractor` | Quy tắc lấy giá trị từ message |
| `syntaxValidator` | Kiểm tra hình thức |
| `existenceValidator` | Kiểm tra entity tồn tại |
| `scopeValidator` | Kiểm tra quyền truy cập |
| `clarificationPrompt` | Câu hỏi bổ sung |
| `ambiguousPolicy` | Xử lý nhiều kết quả |
| `noDataPolicy` | Xử lý không có dữ liệu |
| `cancelPolicy` | Quy tắc hủy |
| `replacePolicy` | Quy tắc lệnh mới thay thế |
| `ttl` | Thời gian sống context |
| `isMutation` | Luôn là `false` trong giai đoạn này |

Ba tầng validation phải tách biệt:

```text
Syntax → Entity exists → Scope/access
```

Không được gọi API nghiệp vụ chỉ sau khi kiểm tra regex/định dạng.

## 9. Kế hoạch triển khai theo task

### CONV-001 — Kiểm kê và khóa contract intent READ

**Trạng thái:** `IN_PROGRESS / DISCOVERY`

- Audit topology runtime trong phạm vi được phép.
- Kiểm kê intent READ cần hội thoại nhiều lượt.
- Lập bảng contract theo Mục 8.
- Chốt bảy quyết định tại Mục 7.
- Xác định dependency boundary trước mọi build/test.

**Đầu ra:** tài liệu contract và quyết định kiến trúc được duyệt.

### CONV-002 — Regression test pending-field

**Trạng thái:** `TODO`

- Viết test tái hiện lỗi trước khi sửa.
- Bao phủ happy path, invalid input, ambiguity, cancel, replace, off-topic và expiry.
- Tách test READ khỏi mutation và phạm vi tạo khách hàng.

**Đầu ra:** test fail đúng lỗi gốc, không có side effect dữ liệu.

### CONV-003 — Pending context store và resolver

**Trạng thái:** `TODO`

- Cài context store theo contract đã duyệt.
- Cài resolver theo đúng thứ tự ưu tiên.
- Cài TTL, atomic CAS và deduplication.
- Cài transition/reason code.

**Đầu ra:** module tối thiểu, deterministic, chỉ phục vụ intent READ.

### CONV-004 — Entity validation và context isolation

**Trạng thái:** `TODO`

- Tách syntax/existence/scope validator.
- Xử lý mã sai entity và tên/từ khóa nhiều kết quả.
- Xác minh conversation ownership.
- Kiểm tra isolation giữa user, conversation và instance.

**Đầu ra:** không nhầm entity, không rò context, không bypass quyền.

### CONV-005 — Runtime integration cho READ workflow

**Trạng thái:** `TODO`

- Tích hợp resolver trước nhánh `UNKNOWN` nhưng chỉ khi có pending hợp lệ.
- Giữ classifier bình thường cho message không có pending.
- Áp dụng failure/stale-response policy.
- Review dependency graph và diff trước khi chạy target liên quan.

**Đầu ra:** luồng READ nhiều lượt hoạt động mà không thay đổi mutation behavior.

### CONV-006 — Live UAT, observability và hiệu năng

**Trạng thái:** `TODO`

- Chạy static regression và live test Manager/TDV trong phạm vi được phép.
- Chạy off-topic, prompt-injection, isolation, race, duplicate và API failure test.
- Đo resolver overhead và latency đầu-cuối.
- Ghi request ID, workflow/runtime version và kết quả trước/sau.

**Đầu ra:** biên bản nghiệm thu và quyết định cập nhật backlog.

## 10. Danh sách test bắt buộc

### 10.1. Luồng chính

1. `xem công nợ` → `NDB001` → gọi đúng API một lần.
2. `kiểm tra tồn kho` → `A003` → gọi đúng API một lần.
3. `xem danh mục` → thiếu loại → hỏi đúng loại danh mục.
4. `tìm sản phẩm theo triệu chứng` → thiếu từ khóa → hỏi lại.
5. Giá trị hợp lệ nhưng không có dữ liệu → đúng `noDataPolicy`.

### 10.2. Hủy, thay thế và ngoài lề

6. `hủy`, `bỏ qua`, `thôi`, `dừng yêu cầu này` → hủy pending hợp lệ.
7. `không hủy`, `xem đơn đã hủy`, `đơn này bị hủy chưa` → không kích hoạt `CANCEL_PENDING`.
8. Pending công nợ + `kiểm tra tồn kho A003` → explicit replacement.
9. Pending công nợ + `A003` → báo sai entity và hỏi lại; không chuyển intent.
10. Off-topic khi pending → không điền field, nhắc lại trường đang chờ.

### 10.3. Ambiguity và validation

11. Tên khách không có kết quả → hỏi lại.
12. Tên khách có đúng một kết quả → tiếp tục đúng contract.
13. Tên khách khớp nhiều bản ghi → yêu cầu chọn, không lấy dòng đầu.
14. Từ khóa sản phẩm khớp nhiều sản phẩm → trả danh sách chọn.
15. Đúng định dạng nhưng entity không tồn tại → không gọi API đích.
16. Entity tồn tại nhưng ngoài scope → không gọi API trái quyền.
17. Validator lỗi → không rơi vào `UNKNOWN`.

### 10.4. Isolation, lifecycle và concurrency

18. Hai conversation của cùng user không dùng chung pending context.
19. Hai user không đọc hoặc ghi context của nhau.
20. User sửa `conversationId` → bị từ chối.
21. TTL dùng giờ server và hết hạn an toàn.
22. Restart runtime → hành vi đúng storage contract.
23. Hai message gần đồng thời không làm context cũ ghi đè context mới.
24. API response cũ trả muộn không xóa context mới.
25. Message trùng `messageId` không gọi API hai lần.
26. Context vừa hết hạn và message tới đồng thời không gọi API cũ.

### 10.5. Failure và security

27. Timeout/`5xx` → giữ context theo retry policy.
28. `401/403` → không retry âm thầm.
29. `NO_DATA` → phân biệt không có dữ liệu với entity không tồn tại.
30. Prompt injection không bypass validator hoặc scope.
31. Nội dung người dùng không thể đổi `apiCode`, `pendingIntent` hoặc `contextVersion`.
32. Context không lưu token, secret hoặc lịch sử chat đầy đủ.

### 10.6. Bảo vệ mutation

33. Resolver không tạo pending context cho mutation.
34. Pending READ không tự chuyển thành mutation từ một giá trị đơn lẻ.
35. Lệnh mutation mới rõ ràng thoát pending READ và đi vào handler hiện hành, không được resolver tự thực thi mutation.
36. Không thay contract preview/confirmation/idempotency hiện hành.
37. Không thay file, handler, artifact hoặc workflow thuộc phạm vi tạo khách hàng.

## 11. Observability

Mỗi transition cần `requestId` và reason code tối thiểu:

```text
PENDING_CREATED
FIELD_ACCEPTED
FIELD_REJECTED
INTENT_REPLACED
USER_CANCELLED
CONTEXT_EXPIRED
API_COMPLETED
API_NO_DATA
API_FAILED_RETRYABLE
AUTH_REJECTED
DUPLICATE_MESSAGE_IGNORED
STALE_RESPONSE_IGNORED
```

Log phải đủ để truy vết transition nhưng không chứa secret hoặc dữ liệu cá nhân thừa.

## 12. Điều kiện nghiệm thu

- Toàn bộ test pending-field hai lượt đạt.
- Không gọi API quá một lần cho cùng `messageId`.
- Không có stale response xóa hoặc ghi đè context mới.
- Không rò context giữa user, conversation hoặc instance.
- Không nhầm customer/product/document/category entity.
- Không còn pending context sau `SUCCESS`, `CANCEL` hoặc `EXPIRE`.
- Mọi transition có `requestId` và reason code.
- Resolver overhead p95 mục tiêu dưới `100 ms`.
- Các bộ classifier, resilience và live READ hiện có không regression so với baseline được xác nhận tại thời điểm triển khai.
- Chat ngoài lề và prompt injection không kích hoạt API nghiệp vụ sai.
- Không tạo, cập nhật hoặc xóa dữ liệu nghiệp vụ trong giai đoạn test READ.
- Mutation behavior không thay đổi và mutation regression được chứng minh bằng 0 trong phạm vi test được phép.
- Không mở, sửa, chạy, build hoặc deploy artifact thuộc phạm vi tạo khách hàng nếu chưa có phê duyệt cụ thể.

## 13. Quy tắc rollback

Nếu mutation routing, phân quyền, isolation hoặc classifier hiện hành bị regression:

1. Dừng tích hợp.
2. Khôi phục thay đổi của phần đang triển khai về trạng thái tốt gần nhất.
3. Giữ lại test và bằng chứng lỗi để chẩn đoán.
4. Không fix-forward trên runtime đang lỗi.
5. Không mở rộng phạm vi sang luồng tạo khách hàng để xử lý vòng tránh.

## 14. Hồ sơ nghiệm thu cần bàn giao

- Bảng intent contract cuối cùng.
- Bảng bảy quyết định thiết kế đã được duyệt.
- Danh sách file thay đổi và dependency boundary.
- Kết quả test trước/sau.
- Request ID và reason code của các kịch bản live.
- Phiên bản workflow/runtime.
- p50/p95 của resolver và toàn luồng.
- Xác nhận không có mutation hoặc thay đổi dữ liệu.
- Xác nhận phạm vi tạo khách hàng và artifact liên quan không bị tác động.
- Danh sách giới hạn hoặc rủi ro còn lại.

## 15. Cổng phê duyệt

### Gate A — Phê duyệt thiết kế

Chỉ đạt khi bảy quyết định tại Mục 7 đã được khóa và intent contract được duyệt.

### Gate B — Cho phép triển khai

Chỉ bắt đầu code khi Gate A đạt và phạm vi file/target được xác nhận không chạm vùng bị khóa.

### Gate C — Cho phép test/build

Chỉ chạy target khi dependency isolation được chứng minh. Nếu không chứng minh được phải xin phê duyệt cụ thể.

### Gate D — Cho phép cập nhật backlog/deploy

Chỉ cập nhật trạng thái hoàn tất hoặc deploy sau khi tiêu chí Mục 12 đạt và hồ sơ Mục 14 đầy đủ.

## 16. Trạng thái hiện tại

```text
Runtime mode: DISCOVERY/REVIEW (runtime-state và agent manifest chưa hiện diện)
Design status: APPROVED_WITH_REQUIRED_CLARIFICATIONS
Implementation readiness: NOT_READY
CONV-001: IN_PROGRESS / DISCOVERY
CONV-002..006: TODO
Runtime risk: MEDIUM
Mutation behavior change: NONE
Mutation regression tolerance: ZERO
Protected build/deploy scope: ENFORCED
```

Hành động tiếp theo là hoàn tất `CONV-001`, khóa bảy quyết định thiết kế và trình duyệt Gate A. Chưa được chuyển sang implementation chỉ dựa trên tài liệu kế hoạch này.
