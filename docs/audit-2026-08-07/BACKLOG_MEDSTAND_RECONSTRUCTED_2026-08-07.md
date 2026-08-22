# Backlog Medstand AI — bản tái dựng theo bằng chứng

**Ngày lập:** 07/08/2026
**Baseline:** `hoangdang@88a2600` (2026-08-06), working tree dirty (chỉ tài liệu)
**Nguồn sự thật:** code đang chạy + SQL/n8n/config thực tế + bằng chứng runtime.
**Backlog gốc** `docs/BACKLOG_TASK_PHAT_TRIEN_MEDSTAND_AI_2026-07-27.md` **không bị sửa** — đây là bản đề xuất song song.

---

## Quy ước status (chuẩn hóa)

Backlog gốc dùng nhiều status tự chế rất dài, ví dụ `SQL_DEPLOYED_LOCAL_GATEWAY_11.124_VERIFIED_PENDING_END_TO_END_UAT` hay `MEDTEST_API_RUNTIME_13_OF_13_VERIFIED_PENDING_UI_TOKEN_EVIDENCE`. Những chuỗi này chứa thông tin thật và có ích, nhưng dùng làm *status* thì không lọc/sắp xếp/đếm được. Bản này đưa chúng xuống trường `Reason` và giữ status trong tập cố định:

`TODO` · `IN_PROGRESS` · `CODE_COMPLETE` · `READY_FOR_TEST` · `RUNTIME_PARTIAL` · `BLOCKED` · `DONE` · `DEPRECATED` · `REOPENED`

**`DONE` chỉ khi:** code xong **và** runtime đúng **và** test đúng contract **và** UAT có evidence **và** business chấp nhận (nếu liên quan công thức) **và** không còn blocker.

---

## Bảng đối chiếu nhanh: backlog cũ vs. đề xuất mới

| Task | Status cũ | Đề xuất mới | Lý do một dòng |
|---|---|---|---|
| CORE-001 | `CONTRACT_LOCKED_DIRECT_CREATE_UAT` | `DONE` | Contract chốt, hai API tra cứu đã deploy và kiểm chứng |
| CORE-002 | `DONE` | `DONE` | Giữ nguyên — renderer đầy đủ, có bằng chứng |
| CORE-003 | `DONE` | `RUNTIME_PARTIAL` | Có audit thật, nhưng **thiếu** REPLAY/CONFLICT runtime |
| CORE-004 | `CONTRACT_LOCKED_…PENDING_DEPLOY` | `DONE` | Contract là sản phẩm của task; đã khóa |
| CORE-005 | `SQL_DEPLOYED_…PENDING_E2E_UAT` | `RUNTIME_PARTIAL` | SQL PASS 23/23, thiếu E2E qua token thật |
| CORE-006 | `DONE` | `DONE` | Có sign-off, rule `BR-TIER-005/2.0.0` |
| CORE-007 | `MEDTEST_API_RUNTIME_13_OF_13…` | `RUNTIME_PARTIAL` | 52/52 ca PASS, chỉ thiếu ảnh UI |
| STOCK-001 | `DONE` | `DONE` | Runtime đầy đủ, 3 request ID |
| CORE-008 | `MEDTEST_RUNTIME_TOKEN_UAT…` | `RUNTIME_PARTIAL` | 4/4 ca token PASS, thiếu visual |
| **CORE-009** | **`TODO`** | **`CODE_COMPLETE`** | **Backlog sai — code xong, đã vào bundle** |
| CORE-010 | `CUSTOMER_AUDIT_EVIDENCE…` | `RUNTIME_PARTIAL` | Nửa khách xong, nửa đơn hàng = 0 sự kiện |
| CORE-011 | `DECISION_B_DIRECT_CREATE_ACCEPTED` | `DONE` | Quyết định nghiệp vụ đã đóng |
| UAT-004 | `BLOCKED` | `BLOCKED` | Giữ — hai workflow cùng active |
| UAT-005 | `REVIEW_REQUIRED` | `BLOCKED` | Admin key hard-code chưa xử lý |
| UAT-008 | `PASS` | `DONE` | 13/13 sau khi chạy lại 01/08 |
| UAT-017 | `PASS` | `DONE` | Có ObjectID thật, business xác nhận |
| UAT-018 | `PASS` | `REOPENED` | Mô tả tự mâu thuẫn với tick `[x]` |
| **—** | **—** | **`FIX-001` mới** | Panel lập đơn tải toàn bộ khách |
| **—** | **—** | **`FIX-002` mới** | Khách vừa tạo không hiện |

---

## PHẦN A — Task cần đổi trạng thái

### CORE-009 — Thêm thao tác đưa gợi ý vào giỏ hàng

- **Priority:** P1
- **Status:** `CODE_COMPLETE` *(cũ: `TODO`)*
- **Reason:** Backlog ghi sai. Đây là lệch tài liệu, không phải task chưa bắt đầu.
- **Business objective:** Cho phép chọn sản phẩm/số lượng từ gợi ý và chuyển sang preview đơn.
- **Current implementation:** `chatbot-widget/js/chatbot-order-draft.js` — module hoàn chỉnh, `SCHEMA_VERSION = 1`, TTL 30 phút, prefix `medstand_order_draft_v1_`, có `memoryStorage()` dự phòng khi localStorage hỏng. Draft cố ý **không mang tính thẩm quyền**: chỉ lưu customer id đã xác minh + item id + số lượng; giá/CTBH/tồn/kho luôn được hydrate lại bởi CORE-005.
- **Confirmed completed:** Module, tích hợp UI (`chatbot.js` tại 12 vị trí), nút "thêm vào giỏ" trên card gợi ý, handoff sang panel lập đơn (`markHandedOff`), đã đóng gói vào `chatbot.bundle.min.js`, có test `scripts/test_core009_order_draft.js` và npm script `test:core009`.
- **Confirmed gaps:** Chưa có bằng chứng UAT runtime — chưa ai chứng minh người dùng thật bấm gợi ý → giỏ → preview thành công.
- **Evidence:** `chatbot.js`:1151, 1204–1207, 3790, 4238, 4524, 4653–4676, 6786; `chatbot-api-engine.js`:3765; `scripts/build.js`:346; commit `4d25f58`; chuỗi `MedstandOrderDraft` có mặt trong bundle min.
- **Runtime status:** Đã vào bundle, chưa có bằng chứng người dùng.
- **UAT status:** Chưa chạy.
- **Dependencies:** CORE-004, STOCK-001 (cả hai đã đủ điều kiện).
- **Risks:** Thấp — draft không ghi DB.
- **Configuration changes:** Không.
- **Tests required:** Chạy `npm run test:core009`; một lượt UAT: gợi ý → thêm 2 sản phẩm → mở panel → xác nhận dữ liệu khớp.
- **Acceptance criteria:** Dữ liệu sản phẩm và khách truyền đúng sang preview; **không tự tạo đơn**.
- **Rollback:** Gỡ file khỏi `build.js`:346, build lại.
- **Next action:** Chạy test có sẵn rồi một lượt UAT ngắn. Task này có thể là **thắng lợi rẻ nhất** trong toàn backlog.

---

### UAT-018 — Test tạo đơn hàng

- **Priority:** P0
- **Status:** `REOPENED` *(cũ: `[x]` + `PASS`)*
- **Reason:** Task tự mâu thuẫn. Dòng "Kết quả" ghi nguyên văn *"Chưa triển khai hai procedure AI và chưa tạo đơn UAT"*, nhưng checkbox vẫn tick `[x]` và status ghi `PASS`. Sau đó một dòng bổ sung 01/08 ghi có controlled mutation `UAT21-260801145955-9CA2`.
- **Phân tích:** Hai dòng này viết ở hai thời điểm khác nhau và không ai hòa giải chúng. Nhiều khả năng controlled mutation 01/08 **đã** khắc phục phần thiếu, nhưng văn bản để lại mâu thuẫn không thể dùng làm căn cứ nghiệm thu.
- **Confirmed completed:** Controlled mutation 01/08 có bằng chứng cụ thể — 1 header, 1 detail, tổng 95.000, hai request đồng thời không tạo trùng, payload khác cùng ID bị từ chối.
- **Confirmed gaps:** Bằng chứng đó dùng mã đơn tự đặt `UAT21-*`, trong khi CORE-004 sau đó đã đổi quy tắc — frontend truyền `AUTO_GEN` và **SQL sinh mã** `D{BranchID}{MM}{YY}/{n}`. Bằng chứng 01/08 có thể đã lỗi thời so với contract hiện hành.
- **Evidence:** Backlog UAT-018; CORE-004 mục cập nhật 03/08; CORE-010 ghi `CREATE_DONHANG = 0`.
- **Mâu thuẫn quyết định:** `CREATE_DONHANG = 0` trong `AI_AuditLog` **không tương thích** với tuyên bố đã tạo đơn thành công qua đường hiện hành. Hoặc đơn 01/08 đi đường cũ chưa có audit, hoặc audit không ghi. **Phải làm rõ trước khi đóng.**
- **Next action:** Tạo đúng một đơn qua UI có token, ghi lại request ID, rồi truy vấn `AI_AuditLog`. Kết quả này đóng luôn cả CORE-005 và một nửa CORE-010.

---

### CORE-003 — Bước xác nhận và ghi khách hàng

- **Priority:** P1
- **Status:** `RUNTIME_PARTIAL` *(cũ: `DONE`)*
- **Reason:** Backlog ghi *"Idempotency-Key UUID v4 chống gửi lặp và Audit log"* đã hoàn thành 100%. Idempotency **có tồn tại thật** ở cả ba tầng. Nhưng CORE-010 ghi rõ: **chưa có** `REPLAY_CUSTOMER` và **chưa có** `IDEMPOTENCY_CONFLICT_CUSTOMER` trong audit runtime.
- **Phân biệt quan trọng:** cơ chế chống gửi lặp *đã được cài* (gateway ép key tại `server.js`:399–402, frontend sinh UUID tại `chatbot-api-engine.js`:3077/3234, SQL lưu fingerprint) và *đã được chứng minh bằng SQL rollback test*. Nhưng nó **chưa từng bị kích hoạt bởi một người dùng thật bấm hai lần**. Hai điều đó không giống nhau.
- **Confirmed completed:** Preview → Submit; chỉ công nhận thành công khi `MsgType = 5` **và** có `ObjectID` (chặn thông báo thành công giả); audit ghi thật — 2 sự kiện có `requestId`/`outcome`/`resultCode`/`capability`.
- **Confirmed gaps:** Double-click thật qua gateway chưa có bằng chứng.
- **Evidence:** `server.js`:395–421; `chatbot-api-engine.js`:3077, 3234, 3237; CORE-010 bảng audit 06/08.
- **Next action:** Một lượt double-click thật. **Chạm luồng khóa ⇒ cần phê duyệt.**

---

### CORE-005 / CORE-007 / CORE-008 / CORE-010 — nhóm "chỉ thiếu bằng chứng"

Bốn task này có chung một hình dạng: **kỹ thuật đã xong, bằng chứng chưa đủ**. Gộp lại để thấy rõ chúng chặn nhau thế nào.

| Task | Đã chứng minh | Còn thiếu đúng một thứ | Status mới |
|---|---|---|---|
| CORE-005 | SQL 23/23 gate PASS; rollback test PASS ca mua 10 tặng 2, cùng trả `DMB0826/1`, payload khác → `IDEMPOTENCY_CONFLICT` | Một mutation thật qua token/UI | `RUNTIME_PARTIAL` |
| CORE-007 | 13 tài khoản × 4 nhóm = 52/52 ca PASS; no-hardcode 7/7; fail-closed khi thiếu config | Ảnh UI + request ID cho A/B/C/UNRATED | `RUNTIME_PARTIAL` |
| CORE-008 | 4/4 ca token PASS với request ID cụ thể; 159/159 regression | Ảnh nghiệm thu cách trình bày | `RUNTIME_PARTIAL` |
| CORE-010 | Audit khách hàng có 2 sự kiện thật; `DuplicateCreateAuditTargets` rỗng | Nửa đơn hàng + concurrency thật | `RUNTIME_PARTIAL` |

**Điểm mấu chốt:** một lượt UAT đơn hàng thật sẽ đóng **đồng thời** CORE-005, UAT-018 và một nửa CORE-010. Đây là hành động có đòn bẩy cao nhất trong toàn bộ backlog.

**Về CORE-010 mục 9.4:** giả thuyết nguy hiểm nhất — *"mutation đã commit nhưng đi sai runtime/DB target"* — **đã bị loại bỏ**, vì audit khách hàng ghi đúng `medtest`. Đây là kết luận vững, không nên đặt lại câu hỏi.

---

### UAT-005 — Cấu hình endpoint và secret UAT

- **Priority:** P0
- **Status:** `BLOCKED` *(cũ: `REVIEW_REQUIRED`)*
- **Reason:** Nghiệm thu của chính task này ghi: *"không có credential được viết trực tiếp trong file public hoặc source workflow"*. Điều kiện đó **hiện chưa đạt**: `server.js`:454 vẫn có `|| 'Medstand@Admin2026'`.
- **Ghi nhận công bằng:** chủ dự án đã chấp nhận giữ fallback này **cho UAT**, với điều kiện chuyển sang secret runtime trước production. Vậy nên đây không phải vi phạm quy trình — nhưng nó là một lời hứa chưa được thu hồi, và loại hứa này rất dễ bị quên đúng vào ngày go-live.
- **Next action:** Chuyển sang biến môi trường bắt buộc, fail-closed nếu thiếu. Ba dòng code.

---

## PHẦN B — Task mới phát sinh từ audit

### FIX-001 — Giới hạn tìm kiếm khách hàng trong panel lập đơn

- **Priority:** P1
- **Status:** `TODO`
- **Business objective:** Mở panel lập đơn phải nhanh, không phụ thuộc số khách của tài khoản.
- **Current implementation:** `loadCustomers()` gọi `API_KhachHangList_AI` với `SearchText: ''` ⇒ SQL trả **toàn bộ** khách trong scope. Với tài khoản 11.571 khách, đây là một truy vấn nặng chạy ngay khi mở panel, rồi lọc phía client bằng `fold()`.
- **Confirmed gaps:** Không có ngưỡng ký tự tối thiểu, không debounce, không giới hạn số dòng, không TTL.
- **Evidence:** `chatbot-api-engine.js`:3313–3324; `sql/Module_Common_API_KhachHangList_AI.sql` (không có `TOP`/`OFFSET-FETCH`).
- **Đối chiếu:** Ngay trong **cùng file**, hàm `attachProductCombo` (dòng 3425) đã làm đúng: min 2 ký tự, debounce 300ms, `requestSeq` chống race, `slice(0,20)`. Fix chỉ là áp cùng khuôn mẫu cho khách hàng.
- **Risks:** Trung bình — thay đổi hành vi UI quen thuộc.
- **Configuration changes:** CONFIG-01, CONFIG-02 (xem Config Register).
- **Tests required:** Đo thời gian mở panel trước/sau; xác nhận số dòng trả về bị chặn.
- **Acceptance criteria:** Mở panel **không** phát sinh request; gõ 2 ký tự trả ≤ 30 dòng dưới 3 giây.
- **Rollback:** Revert một hàm.
- **Next action:** Sao khuôn mẫu `attachProductCombo`. **Không cần API mới, không cần đổi SQL.**

---

### FIX-002 — Xóa cache khách hàng sau khi tạo khách thành công

- **Priority:** P1
- **Status:** `BLOCKED` — chờ phê duyệt phạm vi
- **Business objective:** Giữ đúng cam kết của CORE-011: khách tạo qua chat **dùng được ngay**.
- **Current implementation:** `_orderCustomers` là biến module, gán một lần tại dòng 3313–3315, không TTL, không invalidation. Nhánh submit tạo khách (dòng 3237) đóng form và báo thành công nhưng **không đụng tới cache**.
- **Hệ quả:** Trong cùng một phiên, tạo khách xong rồi mở lập đơn sẽ **không thấy** khách mới cho tới khi tải lại trang. Người dùng rất dễ kết luận "tạo khách hỏng" trong khi DB đã ghi đúng — và đó chính xác là loại hiểu lầm làm hỏng niềm tin vào một tính năng vốn hoạt động tốt.
- **Evidence:** `chatbot-api-engine.js`:3237, 3247, 3313–3315.
- **Đối chiếu ngược:** cùng file **đã có** tiền lệ xử lý đúng — `renderMapped()` (dòng ~3493) xóa `_orderProducts = null` khi đổi khách hàng. Tác giả đã nghĩ tới invalidation cho sản phẩm, chỉ bỏ sót cho khách hàng.
- **Risks:** Rất thấp về kỹ thuật (một dòng). Cao về **phạm vi**: chạm luồng tạo khách đang khóa.
- **Acceptance criteria:** Tạo khách → mở lập đơn trong cùng phiên → tìm thấy khách mới, không cần F5.
- **Next action:** **Xin phê duyệt của người dùng trước.** Không tự ý sửa.

---

### FIX-003 — Đo hiệu năng `API_HangHoaList_AI` trước khi kết luận

- **Priority:** P1
- **Status:** `TODO`
- **Reason tồn tại:** Khiếu nại "search 41–47 giây" cần một thủ phạm, và frontend **đã được loại trừ** bằng đọc code. Nhưng loại trừ một nghi phạm không đồng nghĩa kết tội nghi phạm còn lại.
- **Điều đã biết:** procedure chạy hai `OUTER APPLY` per-row (`AR_LayGiaSanPhamFnc`, `AI_StockAvailableByUserFnc`) trên `CF_ItemTbl`, cộng `EXISTS` có `CROSS APPLY STRING_SPLIT`. Bộ lọc `@ItemID` nằm trong `WHERE`.
- **Điều chưa biết:** Optimizer có đẩy được predicate xuống trước hai APPLY không. **Chưa có execution plan.**
- **Tests required:** `SET STATISTICS TIME/IO ON`, chạy hai lần — `@ItemID='A008'` và `@ItemID=''`.
- **Acceptance criteria:** Có số đo và execution plan. **Task này không sửa gì cả** — nó chỉ tạo ra dữ liệu để quyết định có cần sửa không.
- **Next action:** Chạy đo. Nếu tra một ItemID đã dưới 3 giây, đóng nghi vấn và tìm chỗ khác.

---

### DOC-003 — Chuẩn hóa status backlog

- **Priority:** P2
- **Status:** `TODO`
- **Vấn đề:** Backlog gốc dùng status như `DONE_WITH_OPEN_BLOCKERS`, `BLOCKED_RELEASE_REPORT_PUBLISHED`, `SQL_DEPLOYED_LOCAL_GATEWAY_11.124_VERIFIED_PENDING_END_TO_END_UAT`. Chúng chứa thông tin thật và hữu ích — vấn đề chỉ là đặt sai chỗ. Status phải đếm được; ngữ cảnh nên nằm ở `Reason`.
- **Rủi ro nếu bỏ qua:** Không ai trả lời được câu "còn bao nhiêu task chưa xong" mà không đọc hết 648 dòng.
- **Next action:** Áp tập status chuẩn, chuyển mô tả dài xuống `Reason`. Thuần tài liệu.

---

### TEST-004 — Bổ sung tiêu chí phủ định cho bộ UAT

- **Priority:** P0
- **Status:** `TODO`
- **Nguồn gốc:** UAT-007 từng PASS trong khi hai tài khoản quản lý nhìn thấy toàn bộ 49.559 khách. Bài test hỏi "có thấy khách của mình không" và "có rò rỉ chéo miền không" — thấy tất cả thì thoả cả hai một cách hình thức.
- **Bài học:** Test khẳng định phải đi kèm test phủ định. Câu hỏi thiếu là *"phạm vi có bị chặn không"*.
- **Việc cần làm:** Rà UAT-008 và UAT-015 xem có cùng lỗ hổng thiết kế không; thêm assertion "không tài khoản nào thấy 100% dữ liệu" vào mọi bài test scope; xử lý `TRUNGBM` (`NVVP003`) — cần khách xác nhận phạm vi quản lý.
- **Acceptance criteria:** Mọi bài test scope đều có ít nhất một assertion phủ định.

---

## PHẦN C — Task giữ nguyên

Không có bằng chứng nào mâu thuẫn với các task sau; giữ nguyên trạng thái:

- **`DONE` xác nhận:** UAT-001, UAT-002, UAT-003, UAT-006, UAT-007 (sau khi vá), UAT-009→UAT-016, UAT-019→UAT-021, UAT-024, CORE-001, CORE-002, CORE-004, CORE-006, CORE-011, STOCK-001, BIZ-001.
- **`BLOCKED` xác nhận:** UAT-004 — webhook `intent-parser` có **hai workflow cùng ACTIVE** (`ZQPz4sbzz9pqSO8W` và `Gn7nDjDgGUFOWni5`). n8n không đảm bảo định tuyến vào bản nào ⇒ cùng một câu hỏi có thể ra hai kết quả. Đây là P0 thật, và nó **vẫn đang mở**.
- **`TODO` xác nhận (chưa có implementation):** toàn bộ CAT-*, PROMO-*, RAG-*, NOTI-001, ROUTE-*, OCR-*, ML-*, OPS-001/003/004, SEC-002/003, DOC-001/002, METRIC-*.

---

## PHẦN D — Điều kiện đóng gate `CORE_SALES_FLOW_READY`

Gate yêu cầu: *"Chat tạo khách/đơn có preview, confirm, idempotency và audit"*. Trạng thái từng vế:

| Vế | Khách hàng | Đơn hàng |
|---|---|---|
| Preview | Đạt | Đạt |
| Confirm | Đạt | Đạt |
| Idempotency (code) | Đạt | Đạt |
| Idempotency (runtime) | **Thiếu** replay thật | Chứng minh bằng SQL rollback |
| Audit (code) | Đạt | Đạt |
| Audit (runtime) | **Đạt — 2 sự kiện thật** | **Thiếu — 0 sự kiện** |

**Kết luận:** gate còn thiếu đúng **hai** bằng chứng, không phải thiếu code:

1. Một mutation đơn hàng thật, có request ID, để lại `CREATE_DONHANG` trong `AI_AuditLog`.
2. Một lượt double-click/đồng thời thật, để lại `REPLAY_*` hoặc `IDEMPOTENCY_CONFLICT_*`.

Cả hai đều là **việc chạy**, không phải việc viết. Đây là tin tốt: gate gần hơn vẻ ngoài của backlog rất nhiều.

---

*Bản tái dựng này không thay thế backlog gốc cho tới khi được chấp thuận. Không có source, SQL, workflow hay config nào bị sửa.*
