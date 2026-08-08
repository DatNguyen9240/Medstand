# Medstand AI — Full Source Audit

**Ngày chạy:** 07/08/2026
**Phạm vi:** `src/**` + dependency trực tiếp (`chatbot-widget/**`, `server.js`, `env.js`, `sw.js`, `config/**`, `sql/**`, `n8n/**`, `scripts/**`)
**Loại pha:** điều tra + viết lại tài liệu. **Không sửa source, không deploy, không đổi SQL/n8n/config.**
**Ghi chú quyền:** luồng tạo khách hàng đang bị khóa theo AGENTS.md; người dùng đã cấp phép **đọc** trong phiên 07/08/2026. Audit này chỉ đọc, không chạm.

---

## 1. Executive Summary

Hệ thống đã vượt xa trạng thái mà backlog mô tả ở tầng **code**, nhưng lại **thiếu bằng chứng runtime** ở đúng những chỗ quyết định gate `CORE_SALES_FLOW_READY`. Ba kết luận đáng chú ý nhất:

1. **Backlog sai ở CORE-009.** Backlog ghi `TODO` ("chưa bắt đầu"), nhưng code đã hoàn chỉnh: `chatbot-widget/js/chatbot-order-draft.js` (29 KB, 1 module đầy đủ), được nối vào `chatbot.js` tại 12 điểm và **đã nằm trong bundle production** `chatbot.bundle.min.js`. Đây là lệch tài liệu, không phải task chưa làm.

2. **Nguyên nhân "search chậm" và "khách vừa tạo không hiện" là cùng một dòng code.** `_openOrderCreatePanel().loadCustomers()` tải **toàn bộ** danh sách khách với `SearchText: ''` rồi cache vào biến module `_orderCustomers` **không có TTL và không có invalidation**. Với tài khoản có 11.571 khách (theo UAT-007 sau khi vá scope), đây là một request nặng chạy ngay khi mở panel. Cùng biến cache đó khiến khách vừa tạo không xuất hiện cho tới khi reload trang.

3. **Search sản phẩm thì ngược lại — đã tối ưu đúng.** Panel lập đơn dùng `API_DanhMuc_AI` với tối thiểu 2 ký tự + debounce 300ms + chống race bằng `requestSeq`, chỉ gọi `API_HangHoaList_AI` cho **đúng một** `ItemID` sau khi người dùng chọn. Đây đúng bằng phương án mục tiêu mà prompt audit mô tả. Nếu người dùng vẫn thấy chậm 41–47 giây, nghi vấn phải chuyển sang tầng SQL/n8n chứ không phải frontend.

Tổng quan trạng thái: **6 task nên đổi trạng thái**, **9 hạng mục cấu hình cần chỉnh**, **3 defect P1 đã xác nhận bằng code**, và gate P0 còn thiếu đúng hai thứ — bằng chứng mutation đơn hàng end-to-end và bằng chứng concurrency thật.

---

## 2. Git Baseline

| Mục | Giá trị |
|---|---|
| Branch | `hoangdang` |
| HEAD | `88a26005e7504c523acfc7ec7ef0ba356688b2fc` (`88a2600`) |
| Ngày commit | 2026-08-06 08:49:07 +0700 |
| Working tree | **DIRTY** |
| File đã sửa chưa commit | `docs/BACKLOG_TASK_PHAT_TRIEN_MEDSTAND_AI_2026-07-27.md`, `docs/CORE-010_MUTATION_HARDENING_2026-08-05.md` |
| Untracked | `.claude/` |
| Tag | (không có tag nào được liệt kê) |
| Diff | 2 files, +23 / −16 — chỉ tài liệu, không chạm code |

10 commit gần nhất cho thấy nhịp phát triển: `88a2600` (customer API + idempotency) → `9b59d56` (customer detail) → `becf142` (HTTP error + SW cache) → `52d38d5` (mutation hardening + rollback) → `4d25f58` (CORE-008 + CORE-009).

**Quan sát:** commit `4d25f58` có tiêu đề ghi rõ *"implement Core-008 recommendation engine and Core-009 order draft management"*. Backlog vẫn ghi CORE-009 là `TODO`. Lịch sử Git đã tự bác bỏ backlog.

---

## 3. Full Source Architecture Map

Luồng runtime thực tế (đã xác minh bằng code, không suy đoán):

```text
Browser (index.prod.html, v11.139)
  ├─ src/js/dist/app.bundle.min.js      → SPA: router, pages, services
  └─ chatbot-widget/js/chatbot.bundle.min.js
        ├─ chatbot.js                  → UI shell, renderer, table/pagination
        ├─ chatbot-api-engine.js       → intent/token parser, form tạo khách, panel lập đơn
        ├─ chatbot-order-draft.js      → CORE-009 draft (localStorage, TTL 30')
        └─ chatbot-renderers-medstand.js
                 │
                 ▼  Http.post/get  →  POST /api/gateway  (payload XOR+Base64)
  server.js (Express 5)
        ├─ giải mã, validate endpoint (chặn '..', '//', control chars)
        ├─ auth: Bearer header hoặc cookie auth_token
        ├─ DIRECT_MUTATION_POLICY → verify identity qua API_UserInfo
        │     + ép Idempotency-Key + RequestID + ghi đè identity field
        ├─ /api/*    → API_BASE (ERP nội bộ)
        └─ /webhook/* → N8N_INTERNAL_URL (mặc định http://127.0.0.1:5678)
                 │
                 ▼
  n8n: MAIN_ChatBot_V5 / AI_Intent_Parser / API_Execute / Shared_Auth_Guard
                 │
                 ▼
  SQL Server 'medtest': API_*_AI procedures + AI_BusinessRuleConfigTbl + AI_AuditLog
```

### Module Inventory (các module quyết định nghiệp vụ)

| Module | File chính | Trách nhiệm | Được gọi từ | Gọi tới | Trạng thái |
|---|---|---|---|---|---|
| Gateway | `server.js` (903 dòng) | Mã hóa, auth, mutation policy, idempotency | Toàn bộ frontend | ERP + n8n | Hoạt động, fail-closed đúng |
| API Engine | `chatbot-api-engine.js` (7.094 dòng) | Parser `#`/`@`, form, panel lập đơn | `chatbot.js` | `/api/gateway` | Hoạt động, quá tải trách nhiệm |
| Chat shell | `chatbot.js` (269 KB) | Render, bảng, phân trang, cache | `main.js` | ApiEngine | Hoạt động |
| Order draft | `chatbot-order-draft.js` | CORE-009 giỏ hàng hội thoại | `chatbot.js` | ApiEngine handoff | **Code xong, backlog ghi TODO** |
| Create-customer renderer | `chatbot-renderer-create-customer.js` (53 KB) | Form 7 trường + cascade | ApiEngine | `API_KhachHang_Insert_AI` | Khóa theo yêu cầu người dùng |
| Config frontend | `env.js` | Endpoint map, ngưỡng công nợ | index.html | — | Có hằng số nghiệp vụ hard-code |
| HTTP client | `src/js/services/http.js` | Cipher, retry, error | SPA + widget | Gateway | Hoạt động |

### Trùng lặp và nợ kỹ thuật đã phát hiện

- **Ba đường tìm khách hàng song song**: `API_KhachHangList_AI` (panel lập đơn), `@danh_muc|@Type=khachhang` (token `@` trong chat), và `CART_CUSTOMER_DS` trong `env.js`. Ba nơi, ba hành vi phân trang khác nhau.
- **`chatbot-api-engine.js` 7.094 dòng** gánh cả parser, cả UI form, cả gọi API, cả mapping response. Đây là điểm rủi ro sửa đổi cao nhất của dự án.
- **Code chết còn giữ lại**: `/api/chat`, `/api/sheet-data`, `/api/*all`, `/webhook/*all` trong `server.js` đều đã trả 404 `GATEWAY_REQUIRED`, thân hàm giữ trong comment `c8 ignore` để rollback. Có chủ đích và có ghi chú — chấp nhận được, nhưng nên đặt hạn xóa.
- **Nhánh không thể chạy tới**: `server.js` kiểm tra `if (!endpoint)` sau khi `normalizeGatewayRequest()` đã ném lỗi cho endpoint rỗng. Tác giả đã tự ghi chú điều này. Vô hại.

---

## 4. Confirmed Defects

### FIND-001 — Panel lập đơn tải toàn bộ danh sách khách hàng

```text
Finding ID:        FIND-001
Severity:          P1 (hiệu năng + trải nghiệm)
Status:            CONFIRMED
Observed:          Mở panel lập đơn → gọi API_KhachHangList_AI với SearchText='' → tải mọi
                   khách trong scope (tài khoản lớn: 11.571 dòng, theo UAT-007).
Expected:          Chỉ tìm khi người dùng gõ tối thiểu N ký tự, giới hạn số dòng trả về.
Root cause:        loadCustomers() truyền SearchText rỗng và cache vào biến module không TTL.
File:              chatbot-widget/js/chatbot-api-engine.js
Lines:             3247 (khai báo _orderCustomers), 3313–3324 (loadCustomers)
Call path:         _openOrderCreatePanel → attachCombo(custInput,…, loadCustomers)
                   → Http.get(FILTER.CUSTOMERS, {SearchText:''}) → /api/gateway
                   → API_KhachHangList_AI
SQL đối chiếu:     sql/Module common - API_KhachHangList_AI.sql — mệnh đề
                   "ISNULL(@SearchText,'')='' OR ... LIKE '%'+@SearchText+'%'"
                   ⇒ rỗng nghĩa là trả hết; không có TOP/OFFSET-FETCH.
Affected tasks:    CORE-004, CORE-005, UAT-018, UAT-020
Test coverage:     Không có test nào đo số dòng trả về của đường này.
Risk:              Với scope lớn, đây là ứng viên số một cho khiếu nại "chậm".
Proposed fix:      Thêm ngưỡng tối thiểu 2 ký tự + debounce, truyền SearchText thật,
                   dùng lại đúng khuôn mẫu attachProductCombo đã có sẵn trong cùng file.
Acceptance:        Mở panel không phát sinh request; gõ 2 ký tự trả ≤ 30 dòng dưới 3 giây.
```

### FIND-002 — Khách vừa tạo không xuất hiện trong panel lập đơn

```text
Finding ID:        FIND-002
Severity:          P1 (nghiệp vụ — chặn luồng tạo khách → lập đơn)
Status:            CONFIRMED (bằng đọc code; chưa tái hiện runtime)
Observed:          Tạo khách thành công, mở lập đơn, không tìm thấy khách mới.
Expected:          Khách mới dùng được ngay — đúng cam kết của CORE-011 phương án B.
Root cause:        _orderCustomers là biến module, gán một lần, KHÔNG có TTL và KHÔNG
                   được xóa ở bất kỳ đâu sau khi tạo khách thành công. Nhánh submit
                   (dòng 3237) chỉ gọi _closeFull(true) + _cbMsg, không đụng cache.
File:              chatbot-widget/js/chatbot-api-engine.js
Lines:             3247 (_orderCustomers = null), 3313–3315 (early return khi đã cache),
                   3237 (submit tạo khách — không invalidate)
Đối chiếu:         chatbot.js có MENTION_CACHE_TTL 24h và CFG.CACHE_TTL 2 phút, nhưng
                   _orderCustomers không thuộc cả hai cơ chế đó.
Affected tasks:    CORE-003, CORE-005, CORE-011, UAT-017, UAT-018
Risk:              Người dùng kết luận "tạo khách hỏng" trong khi DB đã ghi đúng.
Proposed fix:      Sau khi nhận MsgType=5 + ObjectID, đặt _orderCustomers = null.
                   Một dòng. Không cần refactor.
Acceptance:        Tạo khách → mở lập đơn ngay trong cùng phiên → tìm thấy khách mới.
Lưu ý phạm vi:     Fix này CHẠM luồng tạo khách đang khóa ⇒ cần phê duyệt riêng.
```

### FIND-003 — Backlog ghi sai trạng thái CORE-009

```text
Finding ID:        FIND-003
Severity:          P2 (sai tài liệu, gây lập kế hoạch sai)
Status:            OUTDATED_CLAIM
Backlog nói:       "CORE-009 — Thêm thao tác đưa gợi ý vào giỏ hàng · P1 · TODO"
Code thực tế:      chatbot-widget/js/chatbot-order-draft.js — module hoàn chỉnh,
                   SCHEMA_VERSION 1, TTL 30 phút, storage prefix medstand_order_draft_v1_.
Bằng chứng nối:    chatbot.js dòng 1151, 1204–1207, 3790, 4238, 4524, 4653–4676, 6786;
                   chatbot-api-engine.js dòng 3765 (markHandedOff).
Bằng chứng build:  scripts/build.js dòng 346 đưa file vào bundle;
                   chatbot.bundle.min.js CÓ chứa chuỗi "MedstandOrderDraft".
Bằng chứng test:   scripts/test_core009_order_draft.js tồn tại; package.json có
                   script "test:core009".
Bằng chứng git:    commit 4d25f58 "implement Core-008 … and Core-009 order draft management".
Kết luận đáng tin: CODE thắng. Backlog sai.
Status đề xuất:    CODE_COMPLETE (chưa DONE vì chưa có bằng chứng UAT runtime).
```

---

## 5. Suspected Issues (chưa đủ bằng chứng — không kết luận)

### FIND-004 — Search sản phẩm 41–47 giây: frontend đã sạch, nghi vấn chuyển xuống SQL

```text
Finding ID:        FIND-004
Severity:          P1
Status:            LIKELY (nguyên nhân chưa chứng minh)
Frontend ĐÃ ĐÚNG:  attachProductCombo (dòng 3425–3482) — min 2 ký tự, debounce 300ms,
                   requestSeq chống race, slice(0,20). searchProducts (3330–3346) gọi
                   API_DanhMuc_AI với Type=sanpham + timkiem. loadProductDetail (3348–3372)
                   chỉ gọi API_HangHoaList_AI cho ĐÚNG MỘT ItemID, có cache theo
                   username|objectId|itemId. Không có N+1, không tải toàn catalog.
                   ⇒ Đây chính là phương án mục tiêu mà prompt mô tả. Không cần sửa.
Nghi vấn còn lại:  sql/Module common - API_HangHoaList_AI.sql chạy trên CF_ItemTbl với
                   HAI OUTER APPLY cho MỖI dòng sản phẩm:
                     · AR_LayGiaSanPhamFnc(@ToDate, @ObjectID, I.ItemID)
                     · AI_StockAvailableByUserFnc(@Username, I.ItemID, @StockAsOfUtc)
                   cộng một EXISTS có CROSS APPLY STRING_SPLIT trên
                   AI_BusinessRuleConfigTbl. Bộ lọc @ItemID nằm trong WHERE, nên tối ưu
                   hóa phụ thuộc hoàn toàn vào việc SQL Server có đẩy được predicate
                   xuống trước hai APPLY hay không.
Điều CHƯA biết:    Chưa có execution plan. Chưa đo thời gian thật của procedure này khi
                   truyền @ItemID cụ thể so với khi @ItemID=''.
Cách tái hiện:     Chạy API_HangHoaList_AI hai lần trên medtest — một lần @ItemID='A008',
                   một lần @ItemID='' — với SET STATISTICS TIME ON.
Dữ liệu cần thu:   Thời gian mỗi lần, số logical reads, execution plan.
Pass/Fail gate:    Tra một ItemID cụ thể phải dưới 3 giây.
KHÔNG kết luận:    Chưa được nói "SQL là thủ phạm" trước khi có số đo.
```

### FIND-005 — Không có mutation nào của đơn hàng để lại dấu vết audit

```text
Finding ID:        FIND-005
Severity:          P0 (chặn gate CORE_SALES_FLOW_READY)
Status:            CONFIRMED GAP (theo chính backlog, không phải phát hiện mới)
Bằng chứng:        CORE-010 ghi rõ CREATE_DONHANG / REPLAY_DONHANG /
                   CREATE_DONHANG_FAILED đều = 0 trên medtest.
                   Trong khi CREATE_CUSTOMER và CREATE_CUSTOMER_FAILED đã có 2 sự kiện thật.
Ý nghĩa:           Đường ghi audit hoạt động (đã chứng minh bằng nửa khách hàng).
                   Nửa đơn hàng chưa từng chạy thật qua gateway.
Điều CHƯA biết:    Không thể phân biệt "chưa ai test" với "có lỗi khiến audit không ghi".
Cách phân biệt:    Chạy đúng MỘT mutation đơn hàng thật qua UI có token, rồi truy vấn
                   AI_AuditLog. Có bản ghi ⇒ chỉ là chưa test. Không có ⇒ defect thật.
```

### FIND-006 — Rủi ro drift giữa bundle production và source

```text
Finding ID:        FIND-006
Severity:          P1 (vận hành)
Status:            LIKELY
Quan sát:          chatbot.bundle.min.js, app.bundle.min.js, sw.js, index.prod.html đều
                   có mtime 2026-08-05 20:28 — cùng một lượt build, dấu hiệu tốt.
                   NHƯNG chatbot-api-engine.js có mtime 2026-08-05 20:22 (trước build 6 phút)
                   trong khi HEAD là commit ngày 06/08 có sửa customer API + idempotency.
Nghi vấn:          Bundle hiện tại có thể CŨ HƠN source ở HEAD.
Bằng chứng thiếu:  Chưa so hash source-vs-bundle. scripts/verify_frontend_deploy.js tồn tại
                   và làm đúng việc này nhưng chưa chạy trong đợt audit (cần môi trường).
Bài học lịch sử:   UAT-002 đã ba lần vấp đúng loại lỗi này, gồm một lần deploy nhầm file
                   dính marker conflict Git mà server vẫn trả HTTP 200.
Hành động:         Chạy node scripts/verify_frontend_deploy.js với Accept-Encoding: identity
                   TRƯỚC mọi kết luận UAT tiếp theo.
```

---

## 6. Security and Mutation Audit

Đây là phần được làm tốt nhất trong toàn dự án. Ghi nhận cụ thể:

| Kiểm soát | Vị trí | Đánh giá |
|---|---|---|
| Identity không tin client | `server.js:405–421` | **Đạt.** Gateway gọi `API_UserInfo` xác minh token rồi **ghi đè** `body[identityField]`. Client không tự khai được username. |
| Idempotency bắt buộc | `server.js:399–402` | **Đạt.** Mutation thiếu key hợp lệ → 422. Regex chặt: 8–128 ký tự. |
| Ánh xạ conflict | `server.js:528–540` | **Đạt.** `IDEMPOTENCY_CONFLICT`/`IN_PROGRESS` → HTTP 409. |
| Fail-closed khi thiếu config | `server.js:126–135, 380–390` | **Đạt, và có ghi chú xuất sắc.** Không đoán host mặc định; thiếu `API_BASE` → 503 rõ nguyên nhân. |
| Chặn đăng ký tự do | `server.js:344–355` | **Đạt.** |
| Chặn lộ source | `server.js:62–117` | **Đạt.** Chặn `/sql/`, `/docs/`, `/n8n/`, `/scripts/`, `.runtime-backups`, và source thô chưa minify. |
| Error handler | `server.js:857–900` | **Đạt.** 4 tham số, đặt sau route, không rò stack trace. |
| Log an toàn | `server.js:483–487, 546–548` | **Đạt.** Chỉ log tên header và tên key, không log giá trị. |

### Vấn đề bảo mật còn mở

**SEC-A — Admin key hard-code làm fallback.**
`server.js:454` — `process.env.ADMIN_UPLOAD_KEY || 'Medstand@Admin2026'`. Một credential thật nằm trong source. Backlog UAT-005 đã ghi nhận và chủ dự án chấp nhận tạm cho UAT, với điều kiện chuyển sang secret trước production. **Điều kiện đó vẫn chưa được thực hiện.** Đây là mục phải đóng trước khi lên production, không được quên.

**SEC-B — Ba API khảo sát không nhận danh tính người dùng.**
Theo ghi chú SEC-002 trong backlog: `API_ChiTietBaiKhaoSat`, `API_KetQuaBaiKhaoSat`, `API_KiemTraKhaoSatNgay` đang `DENY` vì thiếu tham số phân quyền. Chúng là ứng viên rõ ràng cho test phân quyền âm.

**SEC-C — Bản ghi đăng ký mồ côi.** `@cap_nhat_ket_qua_khao_sat` trỏ tới procedure không tồn tại. Nên xóa hoặc sửa tên.

---

## 7. Performance Audit

| Điểm | Vị trí | Đánh giá |
|---|---|---|
| Tìm khách panel lập đơn | `chatbot-api-engine.js:3313` | **Xấu** — tải toàn bộ, xem FIND-001 |
| Tìm sản phẩm panel lập đơn | `chatbot-api-engine.js:3425` | **Tốt** — 2 ký tự, debounce 300ms, chống race |
| Chi tiết sản phẩm | `chatbot-api-engine.js:3348` | **Tốt** — một ItemID, có cache khóa 3 phần |
| Cache API list | `CFG.CACHE_TTL` = 2 phút | Hợp lý |
| Cache lịch sử chat | `chatbot.js:39` = 8 giờ | Hợp lý |
| Cache mention | `chatbot.js:5332` = 24 giờ | **Dài** — rủi ro dữ liệu cũ theo user |
| Cache khách panel đơn | `_orderCustomers` | **Không có TTL** — xem FIND-002 |
| Phân trang bảng | `chatbot.js:4281` mặc định 25 | Có server pagination cho bảng chấm điểm (`@PageSize`), phân trang phía client cho bảng thường |
| Timeout gateway | `server.js:150` = 30.000 ms | **Cao** so với p95 đo được 5.668 ms |

---

## 8. Test Audit

Kho test khá phong phú — **56 script** trong `scripts/`. Phân loại:

| Nhóm | Ví dụ | Độ tin cậy |
|---|---|---|
| Static/contract | `test_natural_chat_classifier.js` (159/159 PASS) | Cao cho phạm vi nó đo |
| Preflight rollback SQL | `preflight_core005_sql.js`, `preflight_core006_sql.js` | **Cao** — chạy thật rồi rollback, mô hình tốt |
| Post-deploy read-only | `verify_core007_*`, `verify_stock001_postdeploy.js` | Cao |
| UAT theo tài khoản | `verify_uat007…uat018` | Cao, nhưng xem cảnh báo dưới |
| Runtime mutation | `verify_core010_deployed_audit.js` | Cao — đã bác bỏ được con số sai |

### Khiếm khuyết test đã xác nhận

**TEST-001 — UAT-007 từng PASS trong khi hệ thống đang hỏng nặng.**
Đây là bài học quan trọng nhất trong toàn bộ kho test. Bài test hỏi hai câu: (a) tài khoản có thấy khách đại diện của mình không, (b) có rò rỉ chéo miền không. Hai tài khoản quản lý nhìn thấy **toàn bộ 49.559 khách** vẫn thoả cả hai một cách hình thức — thấy tất cả thì đương nhiên thấy khách của mình. Tiêu chí thiếu là *"phạm vi phải bị chặn"*.

Bài học tổng quát: **test khẳng định phải đi kèm test phủ định.** Backlog đã ghi cảnh báo này, nhưng chưa ai kiểm tra xem các bài UAT khác có cùng lỗ hổng thiết kế không. Đề xuất rà lại UAT-008 và UAT-015 theo đúng tiêu chí này.

**TEST-002 — `TRUNGBM` (`NVVP003`) vẫn thấy đủ 49.559 khách.** Cố ý chưa xử vì ngoài phạm vi UAT. Cần khách xác nhận anh này quản khu vực nào. Đây là rủi ro dữ liệu đang mở.

**TEST-003 — Không có test nào đo số dòng trả về.** Chính vì thế FIND-001 mới lọt lưới. Đề xuất thêm một assertion đơn giản: mọi API danh sách phải trả dưới N dòng cho một truy vấn tìm kiếm bình thường.

---

## 9. Trả lời 20 câu hỏi bắt buộc

1. **Kiến trúc runtime chạy qua đâu?** Browser → `chatbot.bundle.min.js` → `/api/gateway` (`server.js`) → ERP `API_BASE` hoặc n8n `127.0.0.1:5678` → SQL `medtest`. Không có đường vòng nào khác còn sống; bốn route cũ đã trả 404.
2. **Backlog sai ở đâu?** CORE-009 (`TODO` nhưng code xong và đã vào bundle). Ngoài ra nhiều task dùng status tự chế dài dòng thay vì tập status chuẩn.
3. **Task nào ghi DONE nhưng cần mở lại?** `UAT-008`, `UAT-017`, `UAT-018` đang ghi `PASS` — nhưng `PASS` không nằm trong tập status hợp lệ của chính backlog. UAT-018 tự mâu thuẫn: mô tả ghi *"chưa triển khai hai procedure AI và chưa tạo đơn UAT"* nhưng vẫn tick `[x]`.
4. **Task nào gần xong, chỉ thiếu evidence?** `CORE-007` (chỉ thiếu ảnh UI + request ID), `CORE-008` (chỉ thiếu visual acceptance), `CORE-005` (thiếu E2E qua token thật).
5. **Task nào thật sự chưa có implementation?** Toàn bộ `CAT-*`, `PROMO-*`, `RAG-*`, `ROUTE-*`, `OCR-*`, `ML-*`. Trong nhóm xuyên suốt: `OPS-001`, `OPS-003`, `OPS-004`, `DOC-001`.
6. **Config nào hard-code/trùng lặp?** Xem CONFIG-01…09 trong Config Register. Nghiêm trọng nhất: admin key, `DEBT_WARN_THRESHOLD`, và `APP_VERSION` phải sửa tay ở 3 nơi.
7. **API nào bị dùng sai trách nhiệm?** Không có API nào bị dùng sai. `API_DanhMuc_AI` làm danh mục nhẹ, `API_HangHoaList_AI` làm order context — đúng vai. Vấn đề nằm ở **cách gọi** `API_KhachHangList_AI` (truyền tham số rỗng), không phải ở bản thân API.
8. **Search sản phẩm chậm vì đâu?** Không phải frontend — frontend đã tối ưu đúng chuẩn. Nghi vấn còn lại là hai `OUTER APPLY` per-row trong `API_HangHoaList_AI`. **Chưa chứng minh**, cần execution plan.
9. **Khách vừa tạo không hiện là cache, UI hay API?** **Cache.** Biến `_orderCustomers` không bao giờ được xóa. FIND-002.
10. **Mutation nào có idempotency server thật?** Cả ba: `API_KhachHang_Insert_AI`, `API_KhachHang_Update`, `API_DonHangChiTiet_Insert_AI` — gateway ép key, SQL lưu fingerprint cùng transaction. Đã kiểm chứng bằng rollback test cho đơn hàng, và bằng audit thật cho khách hàng.
11. **Mutation nào có audit bắt buộc thật?** Khách hàng — **đã chứng minh** bằng 2 bản ghi thật. Đơn hàng — đường code có, nhưng **0 bản ghi runtime**.
12. **Test nào kiểm tra contract cũ?** Chưa phát hiện test nào dùng contract đã bị thay. Vấn đề của kho test là **thiếu tiêu chí phủ định** (TEST-001), không phải contract lỗi thời.
13. **Phần nào có nguy cơ phá dữ liệu?** Thấp. Mọi mutation đều fail-closed, có idempotency và transaction. Rủi ro thật là **quyền xem quá rộng** (`TRUNGBM`), không phải ghi sai.
14. **Gate nào chặn `CORE_SALES_FLOW_READY`?** Đúng hai thứ: (a) một mutation đơn hàng thật end-to-end có audit; (b) bằng chứng concurrency/double-click thật qua gateway.
15. **Thứ tự sửa ít rủi ro nhất?** Xem Roadmap — bắt đầu bằng một dòng invalidate cache, kết thúc bằng đo SQL.
16. **Sau khi sửa, user phải UAT gì?** Tạo khách → lập đơn ngay; tìm khách bằng 2 ký tự; tạo một đơn thật; bấm xác nhận hai lần.
17. **QA phải chứng minh gì?** Audit có `CREATE_DONHANG`; hai request đồng thời chỉ tạo một đơn; số dòng trả về bị giới hạn.
18. **File nào phải sửa ở pha sau?** Chủ yếu **một file**: `chatbot-widget/js/chatbot-api-engine.js` (dòng 3247, 3313, 3237). Xem mục 11.
19. **Có cần migration SQL/config không?** **Không bắt buộc** cho các fix P1. Nếu FIND-004 được chứng minh, có thể cần chỉ số SQL — nhưng chỉ sau khi có execution plan.
20. **Rollback thế nào?** Mọi fix đề xuất đều là thay đổi frontend nhỏ trong một file ⇒ rollback = revert commit + build lại + nâng `APP_VERSION`. Không có thay đổi schema nào.

---

## 10. Risks

| # | Rủi ro | Mức | Giảm thiểu |
|---|---|---|---|
| R1 | Sửa `chatbot-api-engine.js` (7.094 dòng) làm hỏng luồng khác | Cao | Commit nhỏ, mỗi lần một dòng, chạy `test:natural` sau mỗi lần |
| R2 | Fix FIND-002 chạm luồng tạo khách đang khóa | Cao | **Phải xin phê duyệt riêng trước khi sửa** |
| R3 | Bundle production cũ hơn source | Trung bình | Chạy `verify_frontend_deploy.js` trước mọi UAT |
| R4 | Quên nâng `APP_VERSION` ⇒ trình duyệt giữ cache `immutable` 1 năm | Cao | Đưa vào release checklist OPS-001 |
| R5 | Admin key hard-code lên production | Cao | Đóng trước go-live, không thương lượng |
| R6 | `TRUNGBM` thấy toàn bộ 49.559 khách | Trung bình | Cần khách xác nhận phạm vi |

---

## 11. Files sẽ phải sửa ở pha tiếp theo

| File | Dòng | Việc | Rủi ro |
|---|---|---|---|
| `chatbot-widget/js/chatbot-api-engine.js` | 3237 | Thêm `_orderCustomers = null` sau khi tạo khách thành công | Thấp — **cần phê duyệt (luồng khóa)** |
| `chatbot-widget/js/chatbot-api-engine.js` | 3313–3324 | Truyền `SearchText` thật + ngưỡng 2 ký tự | Trung bình |
| `chatbot-widget/js/chatbot-api-engine.js` | 3247 | Thêm TTL cho `_orderCustomers` | Thấp |
| `scripts/build.js` | 5 | Nâng `APP_VERSION` khi build | Thấp — bắt buộc |
| `server.js` | 454 | Bỏ admin key fallback, đọc từ env | Thấp — trước production |
| `docs/BACKLOG_…2026-07-27.md` | CORE-009 | Sửa `TODO` → `CODE_COMPLETE` | Không |

**Không đề xuất refactor lớn.** Ba trong bốn fix chính là thay đổi vài dòng trong một hàm, tận dụng đúng khuôn mẫu `attachProductCombo` đã có sẵn ngay trong cùng file.

---

## 12. Recommended next coding tasks

Theo thứ tự phụ thuộc, ít rủi ro trước:

1. **Sửa tài liệu backlog** (không chạm code) — CORE-009 `TODO` → `CODE_COMPLETE`, chuẩn hóa status.
2. **Đo trước khi sửa** — chạy `verify_frontend_deploy.js`; chạy `API_HangHoaList_AI` có `STATISTICS TIME`. Không sửa gì cho tới khi có số.
3. **FIND-001** — giới hạn tìm khách. Một hàm, một khuôn mẫu đã có sẵn.
4. **FIND-002** — invalidate cache. Một dòng. **Cần phê duyệt vì chạm luồng khóa.**
5. **Đóng gate P0** — chạy một mutation đơn hàng thật + một test concurrency thật.
6. **Trước production** — SEC-A (admin key), OPS-001 (release checklist).

---

*Tài liệu này chỉ ghi nhận và đề xuất. Không có dòng source, SQL, workflow hay cấu hình nào bị thay đổi trong đợt audit 07/08/2026.*
