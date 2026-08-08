# Revalidation Register & Completion Roadmap — Medstand AI

**Ngày lập:** 07/08/2026 · **Baseline:** `hoangdang@88a2600`
**Nguyên tắc:** đo trước, sửa sau. Không có mục nào ở đây cho phép sửa code khi chưa có số liệu.

---

# PHẦN I — REVALIDATION REGISTER

## P0 — An toàn dữ liệu và mutation

### RV-P0-01 — Mutation đơn hàng chưa từng để lại audit

| Trường | Nội dung |
|---|---|
| **Hiện tượng** | `CREATE_DONHANG`, `REPLAY_DONHANG`, `CREATE_DONHANG_FAILED` đều = 0 trên `medtest` |
| **Bằng chứng hiện tại** | `scripts/verify_core010_deployed_audit.js`; đối chiếu: `CREATE_CUSTOMER` **có** 2 sự kiện thật |
| **Điều chưa biết** | Không phân biệt được "chưa ai test" với "audit không ghi cho đơn hàng" |
| **Cách tái hiện** | Đăng nhập bằng tài khoản có scope (ví dụ `QLBH013.MED`), tạo **đúng một** đơn qua UI, ghi lại request ID |
| **Dữ liệu cần thu** | Request ID, `DocumentID` trả về, bản ghi `AI_AuditLog` tương ứng |
| **Expected** | Một bản ghi `CREATE_DONHANG` với `outcome = CREATED`, `capability = orders.write` hoặc tương đương |
| **Pass/Fail gate** | **PASS** nếu audit ghi đúng ⇒ chỉ là chưa test. **FAIL** nếu đơn tạo được nhưng không có audit ⇒ defect P0 thật |
| **Đóng được task** | CORE-005, UAT-018, một nửa CORE-010 |

### RV-P0-02 — Double-click chưa được chứng minh trên người dùng thật

| Trường | Nội dung |
|---|---|
| **Hiện tượng** | Chưa có `REPLAY_CUSTOMER` / `IDEMPOTENCY_CONFLICT_CUSTOMER` trong audit |
| **Bằng chứng hiện tại** | Cơ chế **đã có thật** ở cả 3 tầng và đã PASS bằng SQL rollback test |
| **Điều chưa biết** | Chưa có ai bấm hai lần thật qua gateway |
| **Cách tái hiện** | Gửi hai request đồng thời cùng `Idempotency-Key`; sau đó gửi payload **khác** cùng key |
| **Expected** | Lần 2 trả cùng kết quả (replay); payload khác cùng key → HTTP 409 `IDEMPOTENCY_CONFLICT` |
| **Pass/Fail gate** | Đúng một bản ghi nghiệp vụ được tạo, và audit ghi sự kiện replay/conflict |
| **⚠ Phạm vi** | Phần khách hàng **chạm luồng khóa — cần phê duyệt**. Phần đơn hàng thì không |

### RV-P0-03 — Hai workflow `intent-parser` cùng ACTIVE

| Trường | Nội dung |
|---|---|
| **Hiện tượng** | `ZQPz4sbzz9pqSO8W` và `Gn7nDjDgGUFOWni5` cùng active trên một webhook, trùng cả tên |
| **Vì sao nghiêm trọng** | n8n không đảm bảo định tuyến vào bản nào ⇒ **cùng một câu hỏi có thể ra hai kết quả khác nhau**, không tái lập được. Mọi kết quả test intent đều mất giá trị chừng nào điều này còn tồn tại |
| **Cách xử lý** | Tắt `ZQPz4sbzz9pqSO8W`, giữ `Gn7nDjDgGUFOWni5`; import lại theo manifest; chọn lại node `Execute Shared Auth Guard` → `9UxECqxRaPGMF8EM` |
| **Pass/Fail gate** | `node scripts/verify_n8n_runtime.js <export>` thoát mã 0 |
| **⚠ Lưu ý** | File export chứa `staticData` kèm token thật — **không commit**; lọc bằng `scripts/sanitize_n8n_export.js` |
| **Ưu tiên** | **Cao nhất trong nhóm P0** — nó làm nhiễu mọi phép đo khác |

### RV-P0-04 — `TRUNGBM` vẫn thấy toàn bộ 49.559 khách

| Trường | Nội dung |
|---|---|
| **Hiện tượng** | Tài khoản `NVVP003` có `Manager = 1` nhưng 0 dòng trong `AR_OpListDetailTbl` ⇒ rẽ vào nhánh ban lãnh đạo |
| **Trạng thái** | Cố ý chưa xử vì ngoài phạm vi UAT |
| **Điều chưa biết** | Người này thực tế quản khu vực nào |
| **Chặn bởi** | **Cần khách hàng xác nhận** — không thể tự quyết |
| **Expected** | Sau khi vá, tài khoản chỉ thấy phạm vi được giao |
| **Ghi chú** | Đây là loại lỗi "chưa khai giới hạn" bị hiểu thành "không giới hạn". Đã xảy ra với 2 tài khoản khác và đã vá bằng `Fix_UAT13_Manager_Scope_AI.sql` |

### RV-P0-05 — Admin key hard-code

| Trường | Nội dung |
|---|---|
| **Hiện tượng** | `server.js`:454 có credential thật làm fallback |
| **Trạng thái** | Chủ dự án chấp nhận cho UAT, cam kết xử lý trước production |
| **Pass/Fail gate** | Grep source không còn credential; thiếu env → fail-closed |
| **Ưu tiên** | Bắt buộc trước go-live |

---

## P1 — Hiệu năng và dữ liệu hiển thị

### RV-P1-01 — Search 41–47 giây

| Trường | Nội dung |
|---|---|
| **Hiện tượng** | Người dùng báo tìm kiếm rất chậm |
| **Đã loại trừ** | **Frontend.** Panel lập đơn dùng min 2 ký tự + debounce 300ms + chống race + chỉ tra một `ItemID`. Không có N+1, không tải toàn catalog |
| **Nghi vấn còn lại** | `API_HangHoaList_AI`: hai `OUTER APPLY` per-row + `EXISTS` có `STRING_SPLIT` |
| **Điều chưa biết** | **Chưa có execution plan.** Chưa biết optimizer có đẩy được `@ItemID` xuống trước hai APPLY không |
| **Cách tái hiện** | `SET STATISTICS TIME, IO ON` rồi chạy hai lần: `@ItemID='A008'` và `@ItemID=''` |
| **Dữ liệu cần thu** | Thời gian, logical reads, execution plan |
| **Expected** | Tra một `ItemID` dưới 3 giây |
| **Pass/Fail gate** | Nếu đã dưới 3 giây ⇒ **đóng nghi vấn này** và đi tìm chỗ khác (có thể là n8n cold start, hoặc chính đường tìm khách hàng ở RV-P1-02) |
| **Cảnh báo** | Không được kết luận "SQL chậm" trước khi có số. Suy đoán hợp lý vẫn chỉ là suy đoán |

### RV-P1-02 — Mở panel lập đơn tải toàn bộ khách

| Trường | Nội dung |
|---|---|
| **Hiện tượng** | `loadCustomers()` gọi với `SearchText: ''` |
| **Bằng chứng** | `chatbot-api-engine.js`:3313–3324; SQL không có `TOP` |
| **Quy mô** | Tài khoản lớn nhất trong UAT có 11.571 khách |
| **Cách tái hiện** | Mở DevTools Network, mở panel lập đơn bằng tài khoản `QLBH024.MED` hoặc `QLMD1`, đo thời gian và kích thước response |
| **Expected** | Đây **có thể** chính là "41–47 giây" mà người dùng gặp, chứ không phải search sản phẩm |
| **Pass/Fail gate** | Response dưới 3 giây và dưới 1 MB |
| **Ghi chú** | Nên đo mục này **trước** RV-P1-01 — nó rẻ hơn và khả năng trúng cao hơn |

### RV-P1-03 — Khách vừa tạo không hiện

| Trường | Nội dung |
|---|---|
| **Hiện tượng** | Tạo khách xong, mở lập đơn, không thấy |
| **Bằng chứng** | `_orderCustomers` không TTL, không invalidation (dòng 3247, 3313–3315, 3237) |
| **Cách tái hiện** | Trong **cùng một phiên, không F5**: tạo khách → mở panel lập đơn → gõ tên khách vừa tạo |
| **Expected hiện tại** | Không tìm thấy |
| **Expected sau fix** | Tìm thấy ngay |
| **⚠ Phạm vi** | **Chạm luồng khóa — cần phê duyệt** |

### RV-P1-04 — Bundle production có thể cũ hơn source

| Trường | Nội dung |
|---|---|
| **Hiện tượng** | Bundle build lúc 05/08 20:28; HEAD là commit 06/08 có sửa customer API |
| **Cách tái hiện** | `node scripts/verify_frontend_deploy.js` |
| **⚠ Bẫy đã biết** | Phải gửi `Accept-Encoding: identity` khi so hash — server có cache bản nén riêng có thể cũ hơn file thật. Bẫy này đã làm mất thời gian một lần ở UAT-002 |
| **Pass/Fail gate** | Hash khớp, không có marker conflict Git, version đồng bộ |
| **Ưu tiên** | **Chạy trước mọi UAT khác** — nếu bundle sai thì mọi kết quả test đều vô nghĩa |

### RV-P1-05 — Cache mention 24 giờ có xóa khi đổi user không?

| Trường | Nội dung |
|---|---|
| **Hiện tượng** | `MENTION_CACHE_TTL = 24h` (`chatbot.js`:5332) |
| **Điều chưa biết** | Cache có bị xóa khi logout/đổi tài khoản không |
| **Cách tái hiện** | Đăng nhập user A, dùng `@` để nạp danh sách; đăng xuất; đăng nhập user B khác vùng; gõ `@` |
| **Expected** | User B **không** thấy thực thể ngoài phạm vi của mình |
| **Pass/Fail gate** | Không có rò rỉ ⇒ đây chỉ là vấn đề hiệu năng. Có rò rỉ ⇒ **nâng lên P0 phân quyền** |

---

## P2 — Trải nghiệm

| ID | Hạng mục | Cần kiểm |
|---|---|---|
| RV-P2-01 | Câu lệnh kỹ thuật lộ ra UI | Quick action có chèn raw token `#`/`@` vào composer không |
| RV-P2-02 | Đóng form có bảo toàn text người dùng | Gõ dở rồi mở/đóng form — text có mất không |
| RV-P2-03 | Email và ký tự `@` | Gõ email trong chat có bị parser hiểu nhầm thành token không |
| RV-P2-04 | Tham số kỹ thuật trong form chấm điểm | `page`/`pageSize`/`EmployeeId` có lộ ra cho người dùng không |
| RV-P2-05 | Visual acceptance CORE-007/008 | Ảnh nghiệm thu 4 bộ lọc A/B/C/UNRATED và cách trình bày lý do gợi ý |

---

# PHẦN II — COMPLETION ROADMAP

## Phase 0 — Làm sạch nền đo (không sửa code)

**Mục tiêu:** đảm bảo mọi phép đo sau đó đáng tin.

| Việc | File/công cụ | Rủi ro | Thời gian |
|---|---|---|---|
| Dọn workflow `intent-parser` trùng | n8n UI + `verify_n8n_runtime.js` | Thấp | Ngắn |
| Xác minh bundle vs source | `verify_frontend_deploy.js` | Không | Ngắn |
| Sửa backlog CORE-009 | tài liệu | Không | Ngắn |

**Prerequisite:** truy cập được n8n. **Acceptance:** một webhook một workflow; hash khớp. **Rollback:** bật lại workflow cũ.

> Không được bỏ qua phase này. Chạy test khi hai parser cùng active là tự tạo dữ liệu rác.

---

## Phase 1 — Đo, chưa sửa

| Việc | Công cụ | Đóng được gì |
|---|---|---|
| Đo mở panel lập đơn (RV-P1-02) | DevTools | Xác định thủ phạm "chậm" |
| Đo `API_HangHoaList_AI` (RV-P1-01) | SSMS `STATISTICS TIME` | Xác nhận/loại trừ SQL |
| Kiểm cache mention (RV-P1-05) | Thủ công 2 tài khoản | Có thể phát hiện vấn đề phân quyền |

**Acceptance:** có số liệu cho cả ba. **Rollback:** không cần — chỉ đọc.

> Đây là phase quan trọng nhất về mặt kỷ luật. Cám dỗ lớn nhất lúc này là nhảy thẳng vào sửa `loadCustomers()` vì nguyên nhân trông đã quá rõ. Nhưng nếu người dùng thật sự gặp 41–47 giây ở một chỗ khác, fix đúng vẫn để lại khiếu nại nguyên vẹn.

---

## Phase 2 — Sửa các blocker đã xác nhận

| Việc | File | Dòng | Rủi ro | Prerequisite |
|---|---|---|---|---|
| FIX-001 giới hạn tìm khách | `chatbot-api-engine.js` | 3313–3324 | Trung bình | Phase 1 |
| CONFIG-05 tự tăng `APP_VERSION` | `scripts/build.js` | 5 | Thấp | — |
| FIX-002 invalidate cache | `chatbot-api-engine.js` | 3237 | Thấp | **PHÊ DUYỆT** |

**Acceptance:** mở panel không phát sinh request; 2 ký tự trả ≤ 30 dòng dưới 3 giây; khách mới hiện ngay.
**Rollback:** mỗi fix là một commit nhỏ trong một file ⇒ revert độc lập, build lại, nâng version.

> Mỗi thay đổi một commit riêng. `chatbot-api-engine.js` dài 7.094 dòng và gánh cả parser lẫn UI lẫn gọi API — gộp nhiều sửa đổi vào một commit sẽ khiến việc tìm nguyên nhân khi hỏng trở nên rất đắt.

---

## Phase 3 — UAT end-to-end đóng gate P0

| Việc | Đóng được |
|---|---|
| Một mutation đơn hàng thật có request ID | CORE-005, UAT-018, ½ CORE-010 |
| Một lượt double-click/đồng thời thật | ½ CORE-010, xác nhận CORE-003 |
| Chạy `npm run test:core009` + UAT giỏ hàng | CORE-009 |
| Ảnh nghiệm thu A/B/C/UNRATED | CORE-007 |
| Ảnh nghiệm thu lý do gợi ý | CORE-008 |

**Acceptance:** `CORE_SALES_FLOW_READY` đủ điều kiện đóng.

> Toàn bộ phase này là **việc chạy**, không phải việc viết. Đây là điểm đáng lạc quan: gate P0 gần hơn nhiều so với cảm giác khi đọc backlog gốc.

---

## Phase 4 — Dọn dẹp UX

RV-P2-01 → RV-P2-05. Rủi ro thấp, không chặn gate. Làm sau khi P0 xanh.

---

## Phase 5 — Sẵn sàng production

| Việc | Ưu tiên |
|---|---|
| CONFIG-04 bỏ admin key hard-code | **Bắt buộc** |
| OPS-001 release checklist | **Bắt buộc** |
| OPS-004 quy trình backup/rollback | **Bắt buộc** |
| RV-P0-04 xử lý `TRUNGBM` | Cần khách xác nhận |
| SEC-002 test phân quyền âm | Cao |
| OPS-003 dashboard uptime/latency | Trung bình |

---

# PHẦN III — Người dùng cần UAT những gì

Sau Phase 2, xin bạn kiểm đúng bốn việc:

1. **Tạo khách → lập đơn ngay** trong cùng phiên, không F5. Khách mới phải xuất hiện.
2. **Gõ 2 ký tự tên khách** trong panel lập đơn. Phải ra kết quả dưới 3 giây.
3. **Tạo một đơn hàng thật** và báo lại mã đơn.
4. **Bấm nút xác nhận hai lần liên tiếp.** Chỉ được tạo một đơn.

# PHẦN IV — QA cần chứng minh những gì

1. `AI_AuditLog` có `CREATE_DONHANG` kèm request ID.
2. Hai request đồng thời chỉ tạo một bản ghi nghiệp vụ.
3. Payload khác cùng `Idempotency-Key` bị từ chối bằng HTTP 409.
4. Số dòng trả về của mọi API danh sách bị giới hạn.
5. Không tài khoản nào nhìn thấy 100% dữ liệu.

---

*Kế hoạch này chỉ đề xuất. Không có source, SQL, workflow hay config nào bị sửa trong đợt audit 07/08/2026.*
