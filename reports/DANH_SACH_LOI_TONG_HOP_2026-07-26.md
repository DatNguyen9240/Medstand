# Danh sách lỗi tổng hợp Medstand AI — 26/07/2026

> ⚠️ **KHÔNG DEPLOY FILE NÀY LÊN MEDTEST** cho tới khi lỗi `P0-01` được đóng. Thư mục `/reports/` hiện đang bị serve công khai; file này liệt kê chi tiết lỗ hổng.

| Thông tin kiểm soát | Giá trị |
|---|---|
| Ngày rà soát | 26/07/2026 |
| Nhánh source | `hoangdang` @ `c0472b8` (0 ahead / **3 behind** `origin/develop`) |
| Bản đang chạy Pilot | `origin/develop` @ `04d1056` — appVersion **`11.105`**, deploy 26/07/2026 13:28 GMT |
| Cập nhật lần cuối | 26/07/2026, sau khi bản `11.105` được deploy giữa lúc rà soát |
| Môi trường kiểm tra | `https://medtest.bms7.net` (runtime) + source local |
| Mục đích | Chuẩn bị demo khách hàng ngày 27/07/2026 |
| Phương pháp | Chạy test thật, probe runtime từ ngoài, đọc source, so sánh export n8n với source |

## Quy ước bằng chứng

| Nhãn | Nghĩa |
|---|---|
| `RUNTIME` | Đã kiểm chứng bằng request thật lên `medtest` hoặc chạy script thật |
| `SOURCE` | Đọc và đối chiếu code, chưa chạy runtime |
| `SUSPECT` | Suy luận có căn cứ, **cần xác minh trước khi kết luận** |

Không ghi `PASS` cho bất kỳ hạng mục nào chỉ dựa trên tài liệu tự khai.

---

## 0. Kết luận nhanh

Hệ thống **có nền tảng tốt** và một số P0 cũ đã thực sự được đóng (fail-closed auth, mutation preview-only, loại bỏ scope client — đều đã kiểm chứng runtime).

Nhưng còn **7 lỗi chặn demo**, trong đó:

- 1 lỗi **lộ dữ liệu đang xảy ra ngay lúc này** trên production
- 2 lỗi nằm ở **runtime n8n lệch với source** — sửa bằng thao tác trên n8n UI, không cần deploy
- 1 lỗi khiến **không được phép deploy từ nhánh đang làm việc**

Khoảng cách lớn nhất không phải source, mà là **source đã sửa nhưng chưa được đưa lên runtime**, cộng với **tài liệu khai đã sửa nhưng thực tế chưa**.

---

## 1. P0 — Chặn demo

### `P0-01` — Lộ toàn bộ source nội bộ ra internet `RUNTIME`

Tải thử từ ngoài, **không cần đăng nhập**, tất cả trả HTTP 200:

| URL | Kích thước | Nội dung |
|---|---:|---|
| `/reports/runtime-workflows.export.json` | 611.675 B | Export toàn bộ workflow n8n runtime |
| `/n8n/Shared/Shared_Auth_Guard.json` | 11.715 B | Trọn logic xác thực |
| `/docs/KE_HOACH_TEST_13_TAI_KHOAN.md` | 26.074 B | Tài liệu đóng dấu "NỘI BỘ" |
| `/sql/Module common - API_CongNoChiTiet_AI.sql` | 11.331 B | Source stored procedure |
| `/config/uat/account-fixtures.v1.json` | 1.237 B | 13 tài khoản UAT + role/miền/khách |

`/.env` trả 403 đúng.

**Nguyên nhân:** `server.js:650` dùng `express.static(__dirname)` phục vụ cả repo root. Blocklist `sensitiveFolders` tại `server.js:67-79` chỉ chặn `/src/js/`, `/chatbot-widget/js/`, `/scripts/`, `/n8n-system/`.

**Sửa:** thêm `/sql/`, `/n8n/`, `/reports/`, `/config/`, `/docs/`, `/.runtime-backups/` vào `sensitiveFolders`. Tốt hơn: đổi sang allowlist thư mục tĩnh (`/src`, `/assets`, `/images`, `/pages`, `/chatbot-widget`). Restart gateway.

**Ước lượng:** 5 phút + restart.

---

### ~~`P0-02` — Nhánh `hoangdang` thiếu fix đăng nhập~~ → **ĐÃ ĐÓNG** `RUNTIME`

> **Cập nhật 26/07:** `hoangdang` đã được merge vào `develop` (`04d1056`), và bản `11.105` đã deploy lên medtest lúc 13:28 GMT. Rủi ro không còn.

Bằng chứng bản deploy khớp commit — so SHA-256 giữa `origin/develop@04d1056` và file đang chạy:

| File | Khớp |
|---|---|
| `chatbot-widget/js/chatbot.bundle.min.js` | ✅ |
| `chatbot-widget/js/chatbot-core.bundle.min.js` | ✅ |
| `src/js/dist/app.bundle.min.js` | ✅ |
| `sw.js` | ✅ (chỉ khác CRLF/LF, nội dung giống hệt) |

Fix decode cookie đã có trong bản chạy: bundle chứa `decodeURIComponent` + cảnh báo `Invalid encoded auth cookie`.

**Việc còn lại:** nhánh `hoangdang` đang **0 ahead / 3 behind**. Chạy `git pull` để đồng bộ trước khi làm tiếp — nếu build từ nhánh này lúc này sẽ **hạ version 11.105 → 11.103** và mất fix auth.

```
04d1056  Merge branch 'hoangdang' into develop
ab03707  fix: verify chatbot tokens against ERP origin
86ef9a3  fix: decode chatbot auth cookie before gateway calls
```

---

### `P0-03` — Hai Intent Parser cùng active, trùng cả path lẫn webhookId `RUNTIME`

| Workflow ID | active | updatedAt | path | webhookId |
|---|---|---|---|---|
| `ZQPz4sbzz9pqSO8W` | true | 2026-05-25 | `intent-parser` | `e36cf7b9-f9c1-4d72-aafe-357e4160d255` |
| `Gn7nDjDgGUFOWni5` | true | 2026-07-21 | `intent-parser` | `e36cf7b9-f9c1-4d72-aafe-357e4160d255` |

Trùng `webhookId` → **không xác định được parser nào xử lý request**. Đây là collision webhook duy nhất trong toàn bộ 18 path runtime.

`MAIN_ChatBot_V5.json:83` gọi parser bằng **HTTP webhook path** chứ không phải workflow ID, nên source không thể ghim được bản nào.

Bản tháng 5 (`ZQPz`) thiếu:

| Feature | ZQPz | Gn7n | Source |
|---|---|---|---|
| `NATURAL_CHAT_SCHEMA_VERSION` | ✗ | ✓ | ✓ |
| `SYMPTOM_PRODUCT_SEARCH` | ✗ | ✓ | ✓ |
| `PRESCRIPTION_BUNDLE_RECOMMENDATION` | ✗ | ✓ | ✓ |
| Guard chống prompt-injection | ✗ | ✓ | ✓ |
| `inferContextRoute` / `resolveRelativeDateRange` | ✗ | ✗ | ✓ |

**Sửa:** Deactivate `ZQPz4sbzz9pqSO8W`. Sau đó import `n8n/AI_Core/AI_Intent_Parser.json` đè lên `Gn7nDjDgGUFOWni5` (vì **cả hai bản runtime đều thiếu** `inferContextRoute`, `resolveRelativeDateRange`, `absentDays`), Save + Activate.

**Ước lượng:** 10 phút, không cần deploy.

---

### `P0-04` — Runtime chặn tài khoản Quản lý bằng AUTH001 `RUNTIME`

So sánh trực tiếp export runtime với source:

```
RUNTIME (mQ2X8ubexBpqD3Ru) node chứa 'AUTH001' : LIB ConfidenceDecision
SOURCE  (MAIN_ChatBot_V5.json) node chứa 'AUTH001' : KHÔNG CÓ
```

Đoạn còn trong runtime:

```js
hasAccess = userPerms.includes('*:*:*') || requiredScopes.every(s => userPerms.includes(s));
if (!hasAccess) {
  decision = 'ASK_CLARIFICATION';
  askMsg = 'AUTH001: Bạn không có quyền truy cập chức năng này.';
}
```

Source đã cố ý gỡ; comment trong source ghi rõ đoạn này *từng chặn nhầm tài khoản Manager hợp lệ*.

**7 trong 13 tài khoản demo là Quản lý.**

Runtime còn lệch thêm: RAG fallback trỏ `/webhook/chat-v6`, source trỏ `/webhook/hook-ai-rag`. Số node: runtime 33, source 34.

**Sửa:** import `n8n/AI_Core/MAIN_ChatBot_V5.json` đè lên `mQ2X8ubexBpqD3Ru`, Save + Activate. **Sau khi import kiểm lại webhook path vẫn là `hook-ai-dainao`.**

---

### `P0-05` — 15/48 nút gợi ý bấm vào là hỏng, kể cả nút đầu tiên `RUNTIME`

Chạy toàn bộ `window.CHAT_SUGGESTIONS` qua classifier:

| Nhóm | OK | Hỏng |
|---|---:|---:|
| Công việc | 0 | **1/1** |
| Tra cứu | 2 | 4 |
| Kho hàng | 3 | 4 |
| Hướng dẫn | 0 | 3 |
| Phân tích | 11 | 2 |
| Đơn hàng | 10 | 1 |
| Công nợ | 7 | 0 |
| **Tổng** | **33** | **15** |

Nút chết (đều trả `supported=false`):

```
Việc hôm nay        → "Hôm nay em nên làm gì?"
Top nhân viên       → "Top nhân viên bán nhiều nhất tháng này"
Top khách hàng      → "Top khách hàng mua nhiều nhất tháng này"
Hết hàng            → "Sản phẩm hết hàng"
Sắp hết             → "Sản phẩm sắp hết hàng"
Sắp hết hạn         → "Sản phẩm sắp hết hạn"
XNT hôm nay         → "Xuất nhập tồn hôm nay"
Tạo đơn mới         → "Tạo đơn hàng mới"
Khách hàng          → "Tìm khách hàng"
Kho hàng            → "Tra cứu kho hàng"
Nhân viên           → "Tìm nhân viên"
Giá SP              → "Giá sản phẩm"
Tạo đơn hàng        → "Hướng dẫn tạo đơn hàng"
Tra cứu nhanh       → "Hướng dẫn tra cứu bằng @mention"
Xem tính năng       → "Bạn có thể làm gì?"
```

Nút đầu tiên `chatbot-widget/js/chatbot-suggestions.js:5` nhãn **"Việc hôm nay"** gửi `"Hôm nay em nên làm gì?"`. Câu `"Hôm nay tôi nên làm gì?"` chạy tốt — **chỉ khác chữ em/tôi**.

**Sửa trước demo:** ẩn 15 nút này khỏi `chatbot-suggestions.js` (cần rebuild + deploy, xem `P0-02`), hoặc dặn người demo không bấm vùng gợi ý.

**Sửa gốc (sau demo):** bổ sung pattern vào classifier, hoặc đổi text nút sang câu đã verify.

---

### `P0-06` — Dữ liệu UAT dừng ở 20/07, demo là 27/07 `SOURCE`

`sql/Add_UAT_Data_Completion_AI.sql:190-191`:

```sql
DECLARE @DailyStartDate DATE = DATEADD(DAY, 8, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1));
DECLARE @DailyEndDate   DATE = CAST(GETDATE() AS DATE);
```

Fixture dùng ngày tương đối và chạy lặp được (dọn theo tiền tố `U13D_`). Lần chạy gần nhất 20/07 → **không có doanh số nào từ 21/07 tới nay** → câu demo chủ lực `"Hôm nay doanh số của tôi là bao nhiêu?"` trả 0.

**Sửa:** chạy lại script sáng ngày demo.

**Lưu ý:** bảng đối chiếu tại `docs/KE_HOACH_TEST_13_TAI_KHOAN.md:198` tính cho 12 ngày (09–20/07) — **sẽ sai sau khi chạy lại**.

Công thức thật (`:265`): `80.000.000 + ScenarioNo × 3.000.000 + (DAY(ngày) % 5) × 5.000.000`

Doanh số "hôm nay" đúng cho ngày **27/07** (`27 % 5 = 2` → `+10.000.000`):

| Tài khoản | 27/07 |
|---|---:|
| `QLBH013.MED`, `NAMDINHB.MED` | 93.000.000 ₫ |
| `QLBH016.MED`, `BACNINHA.MED` | 96.000.000 ₫ |
| `QLBH005.MED`, `HUEB.MED` | 99.000.000 ₫ |
| `QLBH010.MED`, `DANANGA.MED` | 102.000.000 ₫ |
| `QLMN2`, `CanThoA` | 105.000.000 ₫ |
| `QLMD1`, `BinhPhuocA` | 108.000.000 ₫ |
| `QLBH024.MED` | 111.000.000 ₫ |

---

### `P0-07` — Nghi phạm chính của UAT-SP-01: thiếu bảng `AI_ProductKnowledgeTbl` `SUSPECT`

`sql/Module 10 - API_TraCuuSanPham_AI.sql:189` có `LEFT JOIN dbo.AI_ProductKnowledgeTbl K`. Bảng này **không phải bảng ERP** — được tạo bởi `sql/update_schema_AI.sql:12-32`.

Do deferred name resolution, `CREATE OR ALTER PROCEDURE` vẫn thành công khi thiếu bảng. Lỗi chỉ nổ **trong nhánh ELSE (`:167-191`), tức chỉ khi tìm THẤY sản phẩm**. A003 có tồn tại → tìm thấy → `Msg 208 Invalid object name` → CATCH của wrapper → HTTP 500.

Khớp chính xác triệu chứng: `"Thông tin sản phẩm A003"` lỗi, nhưng sản phẩm không tồn tại thì không lỗi.

**Kiểm tra:**

```sql
SELECT OBJECT_ID('dbo.AI_ProductKnowledgeTbl')
```

NULL → chạy `sql/update_schema_AI.sql`.

---

## 2. P1 — Rủi ro cao

### `P1-01` — Frontend nuốt toàn bộ chi tiết lỗi, mất `requestId` `SOURCE`

`chatbot-widget/js/chatbot.js:4829-4841` — `_handleError` thay mọi lỗi bằng chuỗi cố định:

```js
_addMessage('ai', 'Xin lỗi, tôi không thể phản hồi lúc này. Vui lòng thử lại sau.');
```

**Đây là lý do mọi ảnh chụp UAT đều không có `requestId`.** Không sửa chỗ này thì lần retest tới cũng sẽ không truy vết được tầng nào gây lỗi.

Liên quan: `chatbot.js:1498` throw **trước** khi `Cipher.decrypt` chạy, nên `code`/`message`/`requestId` từ gateway bị mất trước khi tới `_handleError`.

**Sửa:** hiển thị `code` + `requestId` khi có; giữ thông điệp thân thiện nhưng kèm mã tra cứu.

---

### `P1-02` — Service worker cache response `/api/` GET, không khóa theo tài khoản `SOURCE`

`sw.js:91-107`:

```js
if (request.url.includes('/api/') || ...) {
  event.respondWith(
    fetch(request).then(res => { /* cache lại */ })
      .catch(() => caches.match(request))   // trả cache cũ khi mạng lỗi
  );
}
```

POST được loại trừ (`request.method !== 'GET'`), nhưng **GET tới `/api/` bị cache và không có khóa theo người dùng**.

Kịch bản demo 13 tài khoản đổi qua lại trên cùng trình duyệt + một nhịp mạng chớp → **tài khoản B thấy dữ liệu cache của tài khoản A**.

**Né trước mắt:** mỗi tài khoản dùng **cửa sổ ẩn danh mới**, không phải hard-refresh.

**Sửa gốc:** loại `/api/` khỏi nhánh cache, hoặc thêm khóa cache theo identity.

---

### `P1-03` — 4 nhánh lỗi `/api/gateway` không giữ envelope, client crash `RUNTIME`

| server.js | HTTP | Body | Thiếu |
|---|---|---|---|
| `:259-261` | 400 | `{"error":"Yêu cầu không hợp lệ."}` | envelope + requestId |
| `:281-283` | 400 | `{"error":"Thiếu endpoint xử lý."}` | envelope + requestId (**dead code** — `:210` đã chặn trước) |
| `:286-289` | 403 | `{"error":"...đăng ký..."}` | envelope + requestId |
| *(không có error middleware)* | 400/413 | **HTML + stack trace** | toàn bộ |

Client gọi `Cipher.decrypt(resJson.data)` **vô điều kiện** tại `chatbot-api-engine.js:209`, `:248`; `chatbot.js:114`, `:1499`, `:1551`, `:1623`; `src/js/services/http.js:270`. Body không có `.data` → `atob(undefined)` ném → user thấy thông điệp chung của `P1-01`.

**Sửa:** bọc 3 nhánh bằng envelope mã hóa + `requestId`; thêm `app.use((err, req, res, next) => ...)` cuối `server.js` cho lỗi body-parser.

---

### `P1-04` — `/api/sheet-data` không theo mô hình fail-closed và ghi API key ra log `SOURCE`

`server.js:476-534`:

- `:481` xác thực bằng `req.query.apiKey` (query string), có fallback hardcode `:482`
- `:478` `console.log(..., req.url)` → **ghi nguyên URL kèm `?apiKey=<secret>` vào log**
- `:507` `username: username || 'admin'` — nhận username tùy ý từ query, mặc định `admin`
- `:512` `fetch` trần, **không timeout**
- `:527-528` log và trả nguyên payload upstream về client

Nhiều khả năng route này **đang hỏng** (n8n lấy identity từ header chứ không từ `body.username`), nhưng tư thế bảo mật vẫn là fail-open.

**Sửa:** tắt route cho Pilot (trả 404 như `/api/chat`), hoặc tối thiểu bỏ `req.url` khỏi log.

---

### `P1-05` — `CHAT_API_KEY` lộ trong git history và chưa bao giờ xoay `SOURCE`

`.env` từng được commit: thêm ở `f027e22`, xóa ở `11e0126`, **tồn tại trong 17 commit**. Repo ở trên GitHub.

So sánh fingerprint SHA-256 giữa bản lộ trong history và bản `.env` hiện tại: **giống hệt** → key chưa từng đổi.

`.gitignore:58-59` hiện đã loại trừ `.env` đúng, nhưng history vẫn còn.

**Sửa:** xoay `CHAT_API_KEY` (và `N8N_BASE` nếu là tunnel token), sau đó purge history (`git filter-repo`) + force-push có phối hợp.

Liên quan — secret hardcode đang tracked trong git:
- `server.js:312` fallback `ADMIN_UPLOAD_KEY` (`.env` **không có** key này → fallback đang thực sự được dùng)
- `server.js:482` fallback `CHAT_API_KEY`

---

### `P1-06` — Bộ test UAT trỏ vào endpoint đã chết và sai môi trường `RUNTIME`

`/api/chat` đã bị vô hiệu hóa hoàn toàn (`server.js:413-418`, trả 404 `GATEWAY_REQUIRED`). Xác nhận trên medtest.

Nhưng `runLive()` (`scripts/test_natural_chat_system.js:326-328`) và `runLoad()` (`:363-365`) vẫn mặc định `transport='proxy'` → `/api/chat`:

```
npm run test:chat:smoke   → 404 toàn bộ
npm run test:chat:live    → 404 toàn bộ
```

`docs/HUONG_DAN_TEST_CAU_TU_NHIEN_VA_TAI_HE_THONG.md:41` vẫn hướng dẫn đặt `MEDSTAND_CHAT_ENDPOINT='.../api/chat'` — sai.

**Tệ hơn:** bộ test cần `MEDSTAND_GATEWAY_URL`, `MEDSTAND_CHAT_ENDPOINT`, `MEDSTAND_TEST_LOGIN_USER`, `MEDSTAND_CHAT_API_KEY` — **không key nào có trong `.env` hoặc `.env.uat.local`** → mặc định về `http://localhost:3000`. Chạy retest ngay bây giờ là **đang verify nhầm môi trường local, không phải Pilot**.

`.env.uat.local` còn 3 key trỏ localhost đáng lẽ phải trỏ Pilot: `UAT_API_EXECUTE_URL`, `UAT_API_LIST_URL`, `UAT_API_CONFIG_URL`. Hai key `UAT_UNMAPPED_TOKEN`, `UAT_NO_SCOPE_TOKEN` rỗng → không chạy được ca test "user không mapping / không scope".

**Cách chạy đúng ngay bây giờ:**

```
node scripts/test_natural_chat_system.js live --transport gateway --endpoint https://medtest.bms7.net/api/gateway
```

---

### `P1-07` — Temp table không guard: nghi phạm chính của 30% HTTP 500 `SOURCE`

14 file dùng `SELECT ... INTO #temp`, **chỉ 1 file có guard `OBJECT_ID('tempdb..#X')`**:

```
Module 1  - API_GoiYDonHang_AI.sql      INTO#=13  guard=0  TRY=0
Module 5  - API_UpsellGoiY_AI.sql       INTO#=13  guard=0  TRY=0
Module common - API_DanhMuc_AI.sql      INTO#=10  guard=0  TRY=0
Module 3  - API_ChamDiemKH_AI.sql       INTO#=5   guard=0  TRY=0
Module 4  - API_TichLuy_AI.sql          INTO#=5   guard=0  TRY=0
Module 10 - API_TraCuuSanPham_AI.sql    INTO#=4   guard=0  TRY=0
Module 2  - API_TuyenBanHang_AI.sql     INTO#=4   guard=0  TRY=0
```

`Module 10:194` `DROP TABLE #Items; ...` chỉ chạy khi không có lỗi. Node mssql của n8n **pool connection** → temp table rò rỉ tồn tại tiếp trên session đó → request kế tiếp gặp *"There is already an object named '#Items'"* → 500.

Khớp rất tốt với tỉ lệ **12/40 (30%)** HTTP 500 chưa giải thích được ở concurrency 4 trong báo cáo 21/07.

**Sửa:** `IF OBJECT_ID('tempdb..#X') IS NOT NULL DROP TABLE #X;` ở đầu mỗi procedure + bọc thân procedure bằng TRY/CATCH.

---

### `P1-08` — Không procedure nào có TRY/CATCH, mọi lỗi thành 500 vô danh `SOURCE`

0 occurrence `BEGIN TRY` trong 5 procedure nghiệp vụ chính. Lớp bắt lỗi duy nhất là node `Build Execute SQL` trong `n8n/API_Services/API_Execute.json`, gom **mọi** lỗi thành `SYSTEM_ERROR` → HTTP 500.

Không phân biệt được `NO_DATA` với "hệ thống chết". Không có `TRY_CAST`/`TRY_CONVERT` ở bất kỳ đâu.

Điểm tốt: không có `RAISERROR`/`THROW` khi thiếu dữ liệu.

---

### `P1-09` — `SUBSTRING` độ dài âm → Msg 536 → 500 `SOURCE`

`sql/Module common - API_CongNoChiTiet_AI.sql:20-22`:

```sql
IF @MaKhachHang LIKE '%\[%\]%' ESCAPE '\'
    SET @MaKhachHang = SUBSTRING(@MaKhachHang, CHARINDEX('[', @MaKhachHang) + 1,
        CHARINDEX(']', @MaKhachHang) - CHARINDEX('[', @MaKhachHang) - 1)
```

`LIKE` chỉ chứng minh có `[` trước `]` ở đâu đó; `CHARINDEX` lấy cái **đầu tiên**. Input do LLM trích như `] khách [NDB001]` → length `-4` → crash.

Lặp lại y hệt tại `Module 1 - API_GoiYDonHang_AI.sql:99-101` và `Module 5 - API_UpsellGoiY_AI.sql:91-93`.

---

### `P1-10` — `API_TraCuuSanPham_AI` có 3 output contract khác nhau `SOURCE`

| Nhánh | file:line | Shape |
|---|---|---|
| Validation | `:12-16` | 4 cột `Success, Code, Message, Count` |
| NO_DATA | `:153-165` | 11 cột, **0 dòng** (`WHERE 1 = 0`) |
| Success | `:169-190` | **17 cột** |

`WHERE 1=0` không phát `Msg`/`Severity`/`Code` → mất lý do nghiệp vụ. Đây là đường "body rỗng/không hợp lệ" ghi nhận ngày 21/07.

Thêm:
- `:4` `@TopN INT = 50` **không có guard** → gateway render JSON null thành `NULL` → `SELECT TOP (NULL)` → 500
- `:56` `SELECT TOP (@TopN) ... INTO #MatchedItems` **không có ORDER BY** → giữ 50 dòng bất kỳ *trước khi* xếp hạng ở `:98`
- `:59-69` không chấm điểm cho khớp chính xác `ItemID` → **A003 được 0 điểm** và bị loại nếu có dòng khác ≥80

---

### `P1-11` — Workflow ID Auth Guard trong repo không tồn tại trong runtime `RUNTIME`

Cả 3 file API trỏ tới `xjb2EueFU0l3wt93` (`API_Execute.json:222`, `API_GetConfig.json:196`, `API_ListActive.json:183`). Runtime dùng **`9UxECqxRaPGMF8EM`**; ID trong repo **không tồn tại**.

**Bẫy khi import:** import nguyên trạng bất kỳ file nào trong `n8n/API_Services/` sẽ khiến node Execute Workflow trỏ vào workflow không tồn tại. Sau khi import phải mở node `Execute Shared Auth Guard` và **chọn lại** `9UxECqxRaPGMF8EM`.

---

### `P1-12` — Import `API_GetConfig.json` sẽ làm hỏng ngược runtime đang đúng `RUNTIME`

`n8n/API_Services/API_GetConfig.json:149` trong repo: `msg: 'ThÃ nh cÃ´ng'` (mojibake).
Runtime `sGPz8LMQQHVp0IiL` đang trả đúng: `msg: 'Thành công'`.

**Chiều lệch ngược với các file khác: repo hỏng, runtime sạch.** Phải sửa file repo **trước** khi import.

Comment cũng còn mojibake: `API_GetConfig.json:26`, `API_ListActive.json:26`.

`API_Execute.json` đã sạch — bản vá 4 code node ngày 24/07 đã được kiểm chứng.

---

## 3. P2 — Khách có thể nhìn thấy

### `P2-01` — Mojibake trong chuỗi hiển thị `SOURCE`

Đã phân biệt lỗi thật với lỗi hiển thị của console bằng cách đọc UTF-8 trực tiếp.

| File:line | Hiện tại | Phải là | Ảnh hưởng |
|---|---|---|---|
| ~~`chatbot-api-engine.js:1802`~~ | ~~`FieldName: 'KhÃ¡ch hÃ ng'`~~ | `'Khách hàng'` | ✅ **ĐÃ SỬA trong bản 11.105 đang chạy** — vẫn còn sai trên nhánh `hoangdang`, sẽ hết sau `git pull` |
| `chatbot-widget/js/chatbot-api-engine.js:4768` | `Bạn c chắc chắn muốn thực hiện hnh động ny khng?` | `có / hành động này không` | **Hộp xác nhận** trước khi ghi dữ liệu |
| `chatbot-widget/js/chatbot-api-engine.js:5079` | `❌ My chủ khng trả về dữ liệu...` | `Máy chủ không` | Thông báo lỗi |
| `chatbot-widget/js/chatbot.js:113` | `Cá»•ng Gateway pháº£n há»“i khÃ´ng há»£p lá»‡.` | `Cổng Gateway phản hồi không hợp lệ.` | Thông báo lỗi gateway |
| `chatbot-widget/js/chatbot-api-engine.js:100` | `chưa được cấu hnh...` | `cấu hình` | Cảnh báo khởi tạo |
| `n8n/API_Services/API_GetConfig.json:149` | `ThÃ nh cÃ´ng` | `Thành công` | Xem `P1-12` |

Hai loại lỗi khác nhau: `chatbot.js:113` là **mojibake UTF-8 → Windows-1252**; các dòng `chatbot-api-engine.js` là **mất hẳn ký tự có dấu** (`ô`, `ì`, `á`, `à` bị nuốt).

Kiểm tra bundle `11.105` đang chạy: `KhÃ¡ch hÃ ng` **đã sạch**, `Cá»•ng Gateway` **vẫn còn**.

---

### `P2-12` — Version của `theme.min.js` trên trang đăng nhập đóng băng vĩnh viễn ở `11.100` `RUNTIME`

Network log khi mở `medtest.bms7.net`:

```
index.html  → /src/js/dist/theme.min.js?v=11.105   ✔
login.html  → /src/js/dist/theme.min.js?v=11.100   ✘ (lệch 5 version)
```

**Nguyên nhân — lỗi thay thế một-lần trong build script.** `scripts/build.js:531-534`:

```js
content = content.replace(
    /src=["'](?:\.\.\/)?src\/js\/utils\/theme\.js["']/gi,
    `src="../src/js/dist/theme.min.js?v=${APP_VERSION}"`
);
```

Regex chỉ khớp đường dẫn **chưa build** (`src/js/utils/theme.js`). Sau lần build đầu tiên, `pages/login.html:17` đã thành `theme.min.js?v=11.100` → regex không còn khớp → **version không bao giờ được cập nhật nữa**. Đã xác nhận cả trên local lẫn `origin/develop`.

Kết hợp với `server.js:638-639` đặt `Cache-Control: public, max-age=31536000, immutable` cho `.min.js`: trình duyệt nào từng vào trang đăng nhập sẽ giữ bản `theme.min.js` cũ **suốt một năm, không revalidate**. Nếu theme thay đổi (commit `3bbab54` có sửa xử lý màu theme), trang đăng nhập sẽ hiển thị sai màu và không tự khỏi.

Áp dụng cho cả `pages/register.html` và `pages/forgot-password.html`.

**Sửa:** đổi regex sang khớp cả hai dạng, ví dụ `/src=["'](?:\.\.\/)?src\/js\/(?:utils\/theme\.js|dist\/theme\.min\.js)(?:\?v=[\d.]+)?["']/gi`.

---

### `P2-02` — Mất ký tự trong luồng upload/RAG `SOURCE`

`chatbot-widget/js/chatbot.js` — ngoài 24 API demo, chỉ ảnh hưởng nếu demo tính năng upload file:

| Dòng | Hiện tại | Phải là |
|---|---|---|
| `:1228` | `'   ang bới móc kho dữ liệu...'` | `Đang bới móc` |
| `:1262` | `' ể sử dụng lệnh /nạp...'` | `Để sử dụng` |
| `:1354` | `'Tiêu đ:'` | `Tiêu đề:` |
| `:1384` | `' ang bóc tách dữ liệu...'` | `Đang bóc tách` |
| `:1430` | `' Lỗi đc Excel: ịnh dạng cổ bị hng hoặc file có bc mật khẩu.'` | `Lỗi đọc Excel: Định dạng cũ bị hỏng hoặc file có bọc mật khẩu.` |

---

### `P2-03` — Cột không có trong từ điển sẽ hiện tên DB thô `SOURCE`

`chatbot-widget/js/chatbot.js:3531` — `return dict[lower] || key;` (từ điển bắt đầu `:3403`, 99 key).

Cột sẽ render nguyên tên English/DB:

| Procedure | Cột lộ |
|---|---|
| `API_DanhsachTonKho_AI` | `TrangThai` |
| `API_ChamDiemKH_AI` | `R_Score`, `F_Score`, `M_Score`, `C_Score`, `TotalScore`, `Recency_Days`, `Frequency_6M`, `Monetary_12M`, `RiskPriority` |
| `API_UpsellGoiY_AI` | `RemainingPhysical`, `QuantityinStock`, `PriorityScore` |
| `API_DeXuatKhuyenMai_AI` | `ApprovalStatus`, `DailySalesVelocity`, `ProposalReasonCode`, `NearestExpireDate` |
| `API_SanPhamTrongTam_AI` | `GiftLadderJson`, `AccumulationBasis`, `NonExpiredPhysicalStock`, `StockStatusLabel`, `RecordType`, `HasCustomer` |
| `API_TraCuuSanPham_AI` | `MatchScore` |

Đáng chú ý: `R_Score`/`F_Score`/`M_Score` bị lộ **mâu thuẫn trực tiếp** với tiêu chí `MGR-05` trong kế hoạch UAT ("ẩn R/F/M/C kỹ thuật").

**Sửa nhanh:** thêm entry vào dict cho các API dự định demo, tối thiểu `'trangthai': 'Trạng thái'`.

---

### `P2-04` — Tài liệu khai đã sửa nhưng thực tế vẫn trượt `RUNTIME`

Chạy trực tiếp qua classifier:

| Câu | Tài liệu 24/07 khai | Thực tế |
|---|---|---|
| `khách lâu rồi chưa mua` | đã sửa (UAT-SALE-02) | **UNKNOWN** |
| `ai đã lâu không đặt hàng` | đã sửa (UAT-SALE-02) | **UNKNOWN** |
| `NDB001 nên nhập thêm gì` | đã sửa (UAT-SALE-03) | **UNKNOWN** |

Regex chỉ có `nen nhap gi`, thiếu `nen nhap them gi`.

**Cả ba không nằm trong bất kỳ file test nào** (`natural_chat_test_catalog.js`, `test_natural_chat_classifier.js`, `test_natural_chat_system.js` đều 0 match). Bộ test xanh `159/159` nhưng **không phủ chính các claim của tài liệu**.

---

### `P2-05` — UAT-TH-06 chưa đạt tiêu chí nghiệm thu của chính nó `SOURCE`

Tài liệu 24/07 đặt tiêu chí: *"Kết quả của Sale và Manager phải khác nhau đúng mục tiêu sử dụng."*

Thực tế: classifier **không nhận tham số vai trò nào**; Sale/Manager/Admin đi **cùng một nhánh** `@tuyen_ban_hang`. Phân biệt duy nhất là scope dữ liệu ở backend (`sql/Module 2 - API_TuyenBanHang_AI.sql:63`), không phải nội dung gợi ý.

Routing và UI có thật (`chatbot.js:3597-3612`, `:3997-4017` "Việc nên làm tiếp theo"), nhưng **role-awareness thì không**.

---

### `P2-06` — UAT-TH-04 chỉ được che, chưa được sửa gốc `SOURCE`

Classifier đã tách `fromDate`/`toDate` đúng (`natural_chat_classifier.js:230-245`, `:678-692`) — probe xác nhận `fromDate=2026-07-09, toDate=2026-07-20`.

Nhưng **default fill vẫn còn** trong `LIB ValidateParams` (`if (!cleanParams['@TuNgay'])` → điền đầu tháng → hôm nay). Nó chỉ không kích hoạt *nhờ* classifier điền sẵn.

Mọi regression phía trên sẽ âm thầm quay lại `01/MM → hôm nay` mà không báo lỗi. Ngoài ra chỉ lấy **2 token ngày đầu tiên** trong câu.

---

### `P2-07` — Giới hạn ngữ cảnh hội thoại `SOURCE`

- `CTX-01`: chỉ hoạt động với transcript `"User: ..."` do client gửi. Định dạng ctx phía server (`Last Customer: X | Last Intent: Y`) **không** route được — `foldForMatch` giữ `_` nên `@cong_no_chi_tiet` không khớp `cong no`. **Tab mới hoặc xóa cache → mất ngữ cảnh.**
- `CTX-02`: chỉ khớp **chính xác** chuỗi (`^...$`). `tháng trước thì sao` chạy; thêm dấu hoặc từ là hỏng.
- `UI-02`: `chatbot.js:420` trả `true` khi `requestId` rỗng → **không dedupe**. Chỉ bảo vệ đường `_addHtmlMessage`, không bảo vệ message text.

---

### `P2-08` — Business rule đều ở trạng thái DRAFT và cổng duyệt không có tác dụng `SOURCE`

Bảng `AI_BusinessRuleConfigTbl` (`sql/Migrate_Business_Rule_Baseline_V1_AI.sql:27`) — **cả 6 dòng seed đều `DRAFT`**:

| Rule | Giá trị | Chi phối |
|---|---|---|
| `BR-SALES-006` | MinPurchaseCount=3 | Gợi ý đơn hàng |
| `BR-ROUTE-001` | InactiveVisitDays=45 | Tuyến bán hàng |
| `BR-ROUTE-004` | DefaultTopN=8 | Tuyến bán hàng |
| `BR-STOCK-005` | MaxAgeHours=24 | Tồn kho |
| `BR-PROGRAM-002` | RequiredStatus | Tích lũy |
| `BR-TIER-005` | BaselineVersion | Chấm điểm KH |

`RuleVersion` hậu tố `-DRAFT` được đóng dấu lên **mọi response**: `BR-SALES-V1-DRAFT`, `BR-TIER-V1-DRAFT`, `BR-PROGRAM-V1-DRAFT`, `BR-UPSELL-V1-DRAFT`, `BR-MED-V1-DRAFT`, `DEBT-V1-DRAFT`...

**Ba điểm cần biết trước khi đứng trước khách:**

1. `AI_GetBusinessRuleConfig` (lọc `Status='APPROVED'` tại `:112`) **không được procedure hay workflow nào gọi**. Ngưỡng đang hardcode trong SP → cổng DRAFT/APPROVED hiện chỉ mang tính trang trí.
2. `Module 2 - API_TuyenBanHang_AI.sql:236` gắn nhãn `BR-ROUTE-V1` (không hậu tố DRAFT) trong khi 2 config row của nó đều DRAFT → nhãn gây hiểu nhầm.
3. `API_CongNoChiTiet_AI` **không có `RuleVersion` nào** → output công nợ trông như đã được phê duyệt.

UI **có** cảnh báo: `chatbot.js:2309-2310` dịch `REFERENCE_ONLY_APPROVAL_REQUIRED` → "Chỉ tham khảo, cần phê duyệt". Nên chuẩn bị lời dẫn, đừng để khách bất ngờ.

---

### `P2-09` — Các lỗi SQL khác `SOURCE`

| ID | Vấn đề | Vị trí |
|---|---|---|
| a | Chia cho 0 khi `TuDiem = 0`; `TongTichLuy` có thể âm (trừ hàng trả). Mock data có sàn 1.000.000 nên chưa nổ, **dữ liệu thật sẽ nổ** | `Module 4 - API_TichLuy_AI.sql:203-207`, `:158` |
| b | Collation **accent-insensitive** cho tên khách Việt → "Nam" khớp "Nấm" → **chọn nhầm khách trên sân khấu**. Cùng file lại dùng `Vietnamese_CI_AS` cho sản phẩm | `Module 5 - API_UpsellGoiY_AI.sql:111-113` vs `:431` |
| c | `dbo.API_GetConfig` định nghĩa **hai lần với thân khác nhau** → contract đổi theo thứ tự deploy | `Bootstrap_API_Metadata_Auto_AI.sql:291` + `Migrate_API_Metadata_Contract_V1_AI.sql:130` |
| d | `dbo.API_TraCuu_TongHop_AI` được gọi nhưng **không có CREATE/ALTER ở đâu trong repo** → khảo sát 360 fail trên DB sạch | `Module common - API_KhaoSat360_AI.sql:24` |
| e | Xung đột collation temp table (`CREATE TABLE #x` lấy collation instance, không phải DB) | `Module 1:193, 237, 260-265` |
| f | Nhánh fallback "không có kết quả" có `WHERE` **giống hệt** query gốc → dead code | `Module 5:553-598` vs `:546-550` |
| g | `API_TichLuy_AI` với `@MaKhachHang = NULL` → 2 rowset rỗng, 0 `Msg`, HTTP 200 body rỗng. `@ItemIDs = NULL` → báo tích lũy **0đ** cho khách có tích lũy thật — **nguy hiểm hơn 500 khi demo** | `Module 4:124-126` |
| h | Scalar UDF `ufn_clean_customer_name` gọi **3 lần/dòng** trên full scan + correlated subquery trong `ORDER BY` → nguy cơ timeout | `API_CongNoChiTiet_AI:50-59`, `Module 4:56-65`, `Module 1:131-140` |
| i | `@MaKhachHang NVARCHAR(100)` so với `ObjectID` VARCHAR → implicit conversion phá index | `CongNoChiTiet:26, 77, 92, 201` |

---

### `P2-10` — Hạ tầng và cấu hình `SOURCE` `RUNTIME`

| ID | Vấn đề | Vị trí |
|---|---|---|
| a | `sw.js` ném TypeError khi request thiếu header `Accept` (`headers.get('accept')` trả null) → console đỏ nếu khách mở F12 | `sw.js:94`, `:119` |
| b | Timeout không phủ giai đoạn đọc body — `clearTimeout` chạy khi nhận xong headers, trước `await response.text()` → upstream treo body thì gateway treo vô hạn | `server.js:118-126` vs `:368` |
| c | CORS mở toàn bộ (`app.use(cors())`), không `helmet`, không rate-limit, trong khi `/api/login` nằm trong `PUBLIC_GATEWAY_ENDPOINTS` → brute-force được | `server.js:31`, `:199-202` |
| d | Gate auth chỉ kiểm **sự hiện diện** của token (`/^Bearer\s+\S+$/i`), không kiểm tính hợp lệ. Đúng thiết kế 2 lớp, nhưng `runAuthGate` **chỉ test anonymous** — 3 ca token rỗng/sai/hết hạn chưa có coverage | `server.js:168-176`, `test_natural_chat_system.js:504-533` |
| e | `Shared_Auth_Guard.json:21` giải mã JWT bằng base64 và **chỉ kiểm `exp`, không verify chữ ký**; chấp nhận `authorization` từ body | `Shared_Auth_Guard.json:21` |
| f | `Shared_Auth_Guard.json:79` cấp mặc định `['api.read']` chỉ vì có marker `Manager`, kể cả khi không khai capability nào | `Shared_Auth_Guard.json:79` |
| g | Log còn rò dữ liệu nghiệp vụ: `targetUrl` chứa query string (mã KH, SĐT, khoảng ngày) | `server.js:305`, `:527` |
| h | `Cipher` là **XOR key tĩnh 107 + base64** — obfuscation, không phải mã hóa; key nằm sẵn trong client. Nếu khách hỏi "dữ liệu có mã hóa không", trả lời trung thực: HTTPS + lớp envelope là obfuscation | `server.js:149-166` |
| i | Không có `requestId` trên **response thành công** → kịch bản "đối chiếu log bằng requestId" chỉ hoạt động với response lỗi | `server.js:397` |
| j | `.env` `N8N_BASE` trỏ cloudflare quick-tunnel — probe thấy **chết** (HTTP 000). Hostname random, chết mỗi lần restart tunnel | `.env` |
| k | `env.js:11` hardcode `localhost:5678`. Hiện vô hại (mọi call site strip prefix rồi gọi `/api/gateway` tương đối) nhưng là landmine | `env.js:11` |
| l | `router.js:123, 139` hardcode `?v=11.82`. Production không sao (build rewrite), nhưng `index.dev.html` chạy version cứng | `src/js/core/router.js:123` |
| m | `@lap_don_hang` phân loại lệch: PREVIEW/`api.read` trong API_Execute, MUTATION/`orders.write` trong ListActive/GetConfig/SQL migration | `API_ListActive.json:289` |
| n | Workflow rác đang active: `Z7raaV1oe9JkjUXQ` tên mojibake `K0-C Â· Execute API`; hai bản `K6 · System Cleanup` cùng active | runtime |

---

### `P2-11` — Lỗi tài liệu `SOURCE`

| Vị trí | Vấn đề |
|---|---|
| `docs/README.md:3` và `:5` | Hai "trạng thái hiện hành" mâu thuẫn: `N8N_IMPORTED_RUNTIME_RETEST_PENDING` (22/07) vs `SOURCE_AND_BUILD_READY_RUNTIME_RETEST_REQUIRED` (24/07) |
| `docs/README.md:15` | Link hỏng — trỏ `GOI_UAT_KHACH_HANG/README.md`, thư mục chỉ có 4 file `.docx` |
| `docs/KE_HOACH_TEST_13_TAI_KHOAN.md:198` | Bảng doanh số chuẩn tính cho 12 ngày, sai sau khi chạy lại fixture — xem `P0-06` |
| `docs/HUONG_DAN_TEST_...md:41` | Hướng dẫn đặt endpoint `/api/chat` đã chết — xem `P1-06` |
| `.gitignore` | Toàn bộ comment tiếng Việt bị mojibake (không ảnh hưởng chức năng) |

---

## 4. Đã kiểm chứng là TỐT

| Hạng mục | Bằng chứng |
|---|---|
| Fail-closed auth (`AUD-P0-001`) | `RUNTIME` — POST `/api/gateway` không token → **401 + `AUTH_REQUIRED` + `requestId`**, 118ms |
| Mutation Pilot bị khóa | `SOURCE` — `pilotReadOnly = true` (`API_Execute.json:338`), trả 403 `PILOT_READ_ONLY`. `@lap_don_hang` chỉ trả `SELECT 'CART'`, không chạm procedure |
| Loại bỏ scope do client gửi | `SOURCE` — `Apply Verified Identity` (`API_Execute.json:283`) xóa 15 khóa reserved + prefix `@sys*`, thay bằng identity đã xác thực. Capability chỉ lấy từ `API_UserInfo` |
| Capability allowlist fail-closed | `SOURCE` — mặc định `operationType = 'DENY'`; 24 READ / 1 PREVIEW / 2 MUTATION |
| Bundle build khớp source | `RUNTIME` — rebuild → **byte-identical**; `git status` sạch sau build |
| Classifier ↔ workflow đồng bộ | `SOURCE` — chạy patch script trong sandbox chặn ghi → **byte-identical** cả 2 file |
| Test tĩnh | `RUNTIME` — 159/159 hội thoại, 52/52 classifier, 0 release-gate failure |
| Resilience | `RUNTIME` — retry / timeout / JSON lỗi / dedup đều pass |
| JSON n8n | `RUNTIME` — 30/30 parse OK, **0 BOM** (lỗi 4 file BOM ngày 21/07 đã hết) |
| Fix frontend 24/07 đã live | `RUNTIME` — bundle trên medtest có đủ `cancelPending`, `stop-mode`, `Dừng phản hồi`, `DUPLICATE_RESPONSE_SUPPRESSED` |
| UAT-TK-01 | `SOURCE` — Tên kho + Số lô đã ra bảng chính (`chatbot.js:3615-3631`), khớp cột SP |
| Ẩn field kỹ thuật | `SOURCE` — `_isTechnicalRuleField` lọc mọi key bắt đầu `rule` ở cả 4 đường render; `StatusID`/`BranchID` trong `HIDDEN_COLS` |
| Cache-busting | `SOURCE` — `.html`/`sw.js` no-store; SW `skipWaiting` + `clients.claim` + xóa cache cũ; có escape hatch `?clean=true` |
| Bản deploy khớp commit | `RUNTIME` — SHA-256 của 4 artifact `11.105` khớp `origin/develop@04d1056`. **Deploy đã truy vết được** |
| Route `#/chatbot` có gác quyền | `RUNTIME` — mở `/index.html#/chatbot` khi chưa đăng nhập → chuyển hướng về trang đăng nhập, không lộ giao diện chatbot |
| Không có lỗi JS khi khởi động | `RUNTIME` — console chỉ có log `[MS-CHAT][BOOT]` và `[PWA] Service Worker registered`, **0 error, 0 warning** |
| Toàn bộ asset tải thành công | `RUNTIME` — 33 request, tất cả HTTP 200/304, không có 4xx/5xx |

---

## 5. Kế hoạch thực thi

### Tối nay — n8n + SQL + gateway, không đụng frontend (~45 phút)

| # | Việc | Lỗi đóng |
|---|---|---|
| 1 | Export backup runtime n8n *(snapshot đang dùng đã 5 ngày tuổi)* | — |
| 2 | Deactivate parser cũ `ZQPz4sbzz9pqSO8W` | `P0-03` |
| 3 | Import `AI_Intent_Parser.json` → `Gn7nDjDgGUFOWni5`, Activate | `P0-03` |
| 4 | Import `MAIN_ChatBot_V5.json` → `mQ2X8ubexBpqD3Ru`, Activate. **Kiểm lại path vẫn là `hook-ai-dainao`** | `P0-04` |
| 5 | `SELECT OBJECT_ID('dbo.AI_ProductKnowledgeTbl')` — NULL thì chạy `sql/update_schema_AI.sql` | `P0-07` |
| 6 | Thêm 5 thư mục vào `sensitiveFolders` (`server.js:67`), restart gateway | `P0-01` |

> ⚠️ Không import file nào trong `n8n/API_Services/` nếu chưa xử lý `P1-11` và `P1-12`.

### Sáng mai trước giờ demo (~20 phút)

| # | Việc | Lỗi đóng |
|---|---|---|
| 7 | Chạy lại `sql/Add_UAT_Data_Completion_AI.sql` | `P0-06` |
| 8 | Xác nhận n8n upstream sống | `P2-10j` |
| 9 | Mở máy trình chiếu bằng `https://medtest.bms7.net/?clean=true` | `P1-02` |
| 10 | Mỗi lần đổi tài khoản: **cửa sổ ẩn danh mới** | `P1-02` |

### Sau demo

`git pull` đồng bộ `hoangdang` (`P0-02`) → ẩn/sửa 15 nút gợi ý (`P0-05`) → sửa mojibake còn lại (`P2-01`) → sửa regex build cho trang auth (`P2-12`) → guard temp table + TRY/CATCH (`P1-07`, `P1-08`) → xoay `CHAT_API_KEY` (`P1-05`) → bịt `/api/sheet-data` (`P1-04`) → hiện `requestId` khi lỗi (`P1-01`).

---

## 6. Kịch bản demo an toàn

11 câu đã verify route đúng qua classifier:

```text
Hôm nay tôi nên làm gì?
Hôm nay tôi nên ghé khách nào?
Cho tôi danh sách khách thuộc tuyến của tôi
Khách nào lâu chưa mua?
Doanh số từ 09/07/2026 đến 20/07/2026 của tôi là bao nhiêu?
Hôm nay doanh số của tôi là bao nhiêu?
Khách NDB001 đang nợ bao nhiêu?
Gợi ý đơn hàng cho NDB001
Gợi ý bán kèm cho khách NDB001
Chấm điểm khách hàng của tôi
Tồn kho sản phẩm A003
```

**Tuyệt đối tránh:**

- Dùng `"em"` thay `"tôi"` — `"Hôm nay em nên làm gì?"` trượt, `"Hôm nay tôi nên làm gì?"` chạy
- Bấm vùng nút gợi ý (15/48 nút hỏng — xem `P0-05`)
- `"Thông tin sản phẩm A003"` cho tới khi xác nhận xong bước 5
- Các biến thể: `"khách lâu rồi chưa mua"`, `"ai đã lâu không đặt hàng"`, `"NDB001 nên nhập thêm gì"`

---

## 7. Trạng thái tổng hợp

```text
SOURCE_STATUS       = PASS (159/159, build deterministic, classifier đồng bộ workflow)
BRANCH_STATUS       = hoangdang 0 ahead / 3 behind — chạy git pull truoc khi build
RUNTIME_N8N_STATUS  = DRIFTED — 2 parser trùng, MAIN còn AUTH001, chưa import bản mới
RUNTIME_WEB_STATUS  = PASS — develop@04d1056 = 11.105, khớp commit, 0 lỗi console
SECURITY_STATUS     = P0 LỘ FILE ĐANG XẢY RA + CHAT_API_KEY chưa xoay
DATA_STATUS         = UAT dừng 20/07, cần chạy lại fixture
BUSINESS_STATUS     = SIGN_OFF_PENDING — toàn bộ rule ở DRAFT
DEMO_READINESS      = CÓ ĐIỀU KIỆN — sau khi đóng P0-01, P0-03, P0-04, P0-06, P0-07
```

**Tổng: 6 lỗi P0 còn mở (P0-02 đã đóng), 12 lỗi P1, 12 nhóm lỗi P2.**

Lớp web/frontend giờ là lớp **khỏe nhất**. Nút thắt còn lại nằm ở **runtime n8n chưa được import bản mới** (`P0-03`, `P0-04`) và **lộ file tĩnh** (`P0-01`).
