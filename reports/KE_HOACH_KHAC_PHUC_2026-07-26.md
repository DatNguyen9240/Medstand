# Kế hoạch khắc phục Medstand AI

> Đi kèm [`DANH_SACH_LOI_TONG_HOP_2026-07-26.md`](DANH_SACH_LOI_TONG_HOP_2026-07-26.md). File đó mô tả **lỗi là gì**; file này mô tả **sửa thế nào, theo thứ tự nào, mất bao lâu**.

> ⚠️ **KHÔNG DEPLOY FILE NÀY LÊN MEDTEST** cho tới khi `P0-01` đóng — `/reports/` đang bị serve công khai.

| | |
|---|---|
| Lập ngày | 26/07/2026 |
| Bản đang chạy | `11.105` = `origin/develop@04d1056` |
| Nhánh làm việc | `hoangdang` — 0 ahead / 3 behind `origin/develop` |
| Mốc gần nhất | Demo khách 27/07/2026 |

---

## 0. Trả lời thẳng: hôm nay đến mai có đủ không?

**Không đủ để fix hết. Đủ để demo an toàn.**

| Nhóm việc | Thời gian thực tế | Làm được trước demo? |
|---|---|---|
| Chặn demo (Đợt 1) | 2,5 – 3,5 giờ | ✅ Có |
| Bảo mật + gateway (Đợt 2) | 2 – 3 ngày | ❌ Không |
| SQL hardening (Đợt 3) | 3 – 5 ngày | ❌ Không |
| Classifier + UI (Đợt 4) | 1 – 2 ngày | ❌ Không |
| Cần người khác ký (Đợt 5) | 1 – 3 tuần | ❌ Không |

**Tổng để đóng hết: khoảng 2 – 3 tuần**, với điều kiện có người quyết nghiệp vụ.

Lý do không nên ép vào một đêm:

- Sửa 7 stored procedure rồi deploy ngay trước demo là **đổi thứ đang chạy được lấy thứ chưa ai test**
- Xoay `CHAT_API_KEY` cần purge git history + force-push — làm vội sẽ hỏng repo của cả nhóm
- Bổ sung role-awareness (`P2-05`) là **tính năng mới**, không phải sửa lỗi

Nguyên tắc xuyên suốt: **trước demo chỉ làm việc có thể hoàn tác trong 5 phút.**

---

## Đợt 1 — Trước demo · 2,5 – 3,5 giờ · BẮT BUỘC

Hai luồng chạy song song. Luồng A không phụ thuộc luồng B.

### Luồng A — n8n + SQL (không cần deploy, ~1 giờ)

#### `A1` · Backup runtime n8n — 10 phút

Trước khi đụng bất cứ gì. Snapshot đang có (`reports/runtime-workflows.export.json`) đã 5 ngày tuổi.

```
n8n UI → Workflows → chọn tất cả → Download
```

Lưu vào `.runtime-backups/n8n-20260726/`. **Không có bước này thì không có đường lui.**

---

#### `A2` · Tắt Intent Parser cũ — 5 phút · đóng `P0-03`

Hai parser đang cùng active, **trùng cả path lẫn `webhookId`** → không xác định được cái nào nhận request.

| ID | updatedAt | Xử lý |
|---|---|---|
| `ZQPz4sbzz9pqSO8W` | 2026-05-25 | **Deactivate** |
| `Gn7nDjDgGUFOWni5` | 2026-07-21 | Giữ làm canonical |

Bản tháng 5 thiếu `SYMPTOM_PRODUCT_SEARCH`, `PRESCRIPTION_BUNDLE_RECOMMENDATION` và **guard chống prompt-injection**.

**Verify:** trong danh sách workflow, chỉ còn đúng 1 workflow active có path `intent-parser`.

---

#### `A3` · Import Intent Parser bản mới — 10 phút · đóng `P0-03`

Cả hai bản runtime đều thiếu `inferContextRoute`, `resolveRelativeDateRange`, `absentDays` — nên chỉ tắt bản cũ là chưa đủ.

```
Import n8n/AI_Core/AI_Intent_Parser.json  →  đè lên Gn7nDjDgGUFOWni5
Save → Activate
```

**Verify:** mở node `Detect Category & Load FewShots`, tìm chuỗi `inferContextRoute` — phải có.

---

#### `A4` · Import MAIN để gỡ AUTH001 — 15 phút · đóng `P0-04`

Đây là việc quan trọng nhất của Đợt 1. Runtime còn đoạn chặn mà source đã gỡ:

```js
// còn trong runtime mQ2X8ubexBpqD3Ru, node "LIB ConfidenceDecision"
askMsg = 'AUTH001: Bạn không có quyền truy cập chức năng này.';
```

**7 trong 13 tài khoản demo là Quản lý.**

```
Import n8n/AI_Core/MAIN_ChatBot_V5.json  →  đè lên mQ2X8ubexBpqD3Ru
Save → Activate
```

**Sau khi import, kiểm 3 thứ:**

1. Webhook path vẫn là `hook-ai-dainao`
2. Node `LIB ConfidenceDecision` **không còn** chuỗi `AUTH001`
3. RAG fallback trỏ `/webhook/hook-ai-rag` (không phải `chat-v6`)

> ⛔ **Không import file nào trong `n8n/API_Services/` ở đợt này.** Hai lý do — xem `B7` và `B8` ở Đợt 2.

---

#### `A5` · Kiểm tra bảng thiếu — 10 phút · đóng `P0-07`

Nghi phạm số 1 của lỗi `"Thông tin sản phẩm A003"`.

```sql
SELECT OBJECT_ID('dbo.AI_ProductKnowledgeTbl') AS TonTai;
```

- Trả về số → bảng có, nguyên nhân nằm chỗ khác, chuyển sang `B1` để lấy `requestId`
- Trả `NULL` → chạy `sql/update_schema_AI.sql`, sau đó thử lại câu hỏi

Cơ chế: `Module 10 - API_TraCuuSanPham_AI.sql:189` `LEFT JOIN dbo.AI_ProductKnowledgeTbl`. Deferred name resolution khiến procedure vẫn tạo được khi thiếu bảng; lỗi chỉ nổ **khi tìm thấy sản phẩm** (nhánh ELSE `:167-191`) → `Msg 208` → 500.

---

#### `A6` · Chạy lại fixture UAT — 10 phút · **SÁNG NGÀY DEMO** · đóng `P0-06`

```sql
-- chay tren medtest
:r sql\Add_UAT_Data_Completion_AI.sql
```

Script chạy lặp được, dọn theo tiền tố `U13D_`. Sinh dữ liệu từ ngày 09 tháng hiện tại tới **hôm nay**.

Phải chạy **đúng ngày demo**, không chạy trước — vì `@DailyEndDate = CAST(GETDATE() AS DATE)`.

**Doanh số "hôm nay" đúng cho ngày 27/07** — công thức `80tr + ScenarioNo×3tr + (DAY%5)×5tr`, với `27%5=2` → `+10tr`:

| Tài khoản | Kỳ vọng |
|---|---:|
| `QLBH013.MED`, `NAMDINHB.MED` | 93.000.000 ₫ |
| `QLBH016.MED`, `BACNINHA.MED` | 96.000.000 ₫ |
| `QLBH005.MED`, `HUEB.MED` | 99.000.000 ₫ |
| `QLBH010.MED`, `DANANGA.MED` | 102.000.000 ₫ |
| `QLMN2`, `CanThoA` | 105.000.000 ₫ |
| `QLMD1`, `BinhPhuocA` | 108.000.000 ₫ |
| `QLBH024.MED` | 111.000.000 ₫ |

---

### Luồng B — Code + deploy (~1,5 giờ)

#### `B0` · Đồng bộ nhánh, giữ công việc đang làm — 20 phút

Working tree đang có **159 dòng chưa commit** (nâng cấp menu API Engine + sửa chip sản phẩm trọng tâm). Chưa có trên server.

Nhánh `hoangdang` track `origin/hoangdang`, nên `git pull` trơn **không kéo được** 3 commit từ develop.

```bash
git add chatbot-widget/js/chatbot-api-engine.js chatbot-widget/css/chatbot-api-engine.css chatbot-widget/template/chatbot.html
git commit -m "feat: nang cap menu API Engine, sua chip san pham trong tam"
git checkout -- chatbot-widget/js/chatbot.bundle.min.js chatbot-widget/css/dist/chatbot-api-engine.css
git merge origin/develop
```

Bỏ 2 file sinh ra vì chúng sẽ được build lại. `chatbot.bundle.min.js` là **file duy nhất đụng độ** — đã kiểm.

**Verify:** `git log --oneline -1 scripts/build.js` → phải thấy `APP_VERSION = '11.105'`.

---

#### `B1` · Bịt lộ file tĩnh — 15 phút · đóng `P0-01`

Đang lộ ra internet, không cần đăng nhập:

```
/reports/runtime-workflows.export.json   611 KB
/n8n/Shared/Shared_Auth_Guard.json        11 KB
/docs/KE_HOACH_TEST_13_TAI_KHOAN.md       26 KB
/sql/*.sql
/config/uat/account-fixtures.v1.json
```

`server.js:67` — thêm vào `sensitiveFolders`:

```js
const sensitiveFolders = [
    // ...các mục đang có...
    '/sql/',
    '/n8n/',
    '/reports/',
    '/config/',
    '/docs/',
    '/.runtime-backups/'
];
```

Restart gateway.

**Verify:**

```bash
curl -sI https://medtest.bms7.net/reports/runtime-workflows.export.json | head -1
# ky vong: HTTP/1.1 403 Forbidden
```

**Sau khi bịt:** kiểm access log IIS/Express xem đã có ai GET các đường dẫn đó chưa. Coi `Shared_Auth_Guard.json` và danh sách 13 tài khoản UAT là **đã lộ**.

---

#### `B2` · Ẩn 15 nút gợi ý hỏng — 30 phút · đóng `P0-05`

`chatbot-widget/js/chatbot-suggestions.js` — 15/48 nút gửi câu classifier không hiểu, **gồm cả nút đầu tiên**.

Cách nhanh nhất và ít rủi ro nhất trước demo: **sửa text**, không sửa classifier.

| Nút | Text hiện tại (trượt) | Đổi thành |
|---|---|---|
| Việc hôm nay | `Hôm nay em nên làm gì?` | `Hôm nay tôi nên làm gì?` |

Chỉ đổi 1 chữ là nút quan trọng nhất chạy được.

14 nút còn lại **không có API tương ứng trong 24 intent** — không sửa bằng cách đổi chữ được. Xóa hoặc comment:

```
Top nhân viên · Top khách hàng · Hết hàng · Sắp hết · Sắp hết hạn ·
XNT hôm nay · Tạo đơn mới · Tìm khách hàng · Tra cứu kho hàng ·
Tìm nhân viên · Giá SP · Hướng dẫn tạo đơn hàng · Tra cứu nhanh · Xem tính năng
```

**Verify:** chạy lại script quét toàn bộ nút qua classifier, yêu cầu 0 nút trượt.

---

#### `B3` · Build và deploy — 20 phút

```bash
# scripts/build.js:5  →  APP_VERSION = '11.106'
# sau do:
node scripts/build.js
git status --short   # chi nen thay file dist/bundle
```

Deploy như bạn vừa làm với 11.105.

**Verify sau deploy:**

```bash
curl -s https://medtest.bms7.net/index.html | grep appVersion   # 11.106
curl -s https://medtest.bms7.net/sw.js | grep CACHE_VERSION     # medstand-11.106
```

---

#### `B4` · Smoke test — 30 phút

1 tài khoản Sale + 1 tài khoản Quản lý. Mỗi tài khoản một **cửa sổ ẩn danh riêng** (`P1-02` — service worker cache `/api/` GET không khóa theo tài khoản).

11 câu đã verify route đúng:

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

Trọng tâm cần xác nhận:

- Tài khoản **Quản lý** không còn nhận `AUTH001` → chứng minh `A4` thành công
- Doanh số khớp bảng ở `A6`
- `"Thông tin sản phẩm A003"` → tùy kết quả `A5`

---

### Checklist Đợt 1

```
[ ] A1  Backup runtime n8n
[ ] A2  Deactivate ZQPz4sbzz9pqSO8W
[ ] A3  Import AI_Intent_Parser.json
[ ] A4  Import MAIN_ChatBot_V5.json  ← quan trọng nhất
[ ] A5  Kiểm tra AI_ProductKnowledgeTbl
[ ] A6  Chạy fixture UAT          ← SÁNG NGÀY DEMO
[ ] B0  Commit + merge develop
[ ] B1  Bịt lộ file + restart
[ ] B2  Sửa 15 nút gợi ý
[ ] B3  Build 11.106 + deploy
[ ] B4  Smoke 1 Sale + 1 Manager
```

---

## Đợt 2 — Bảo mật và gateway · 2 – 3 ngày · NGAY SAU DEMO

### `C1` · Hiện `requestId` khi lỗi — 2 giờ · đóng `P1-01`

**Làm việc này TRƯỚC mọi việc debug khác.** Không có nó thì mọi lần retest tiếp theo lại không có gì để truy vết — đúng như đã xảy ra với `UAT-SP-01`.

`chatbot-widget/js/chatbot.js:4829-4841` đang nuốt sạch chi tiết:

```js
function _handleError(err) {
    if (err && err.name === 'AbortError') return;
    _hideTyping();
    _setStopMode(false);
    _addMessage('ai', 'Xin lỗi, tôi không thể phản hồi lúc này. Vui lòng thử lại sau.');
}
```

Sửa theo hướng: giữ câu thân thiện, **kèm mã tra cứu**.

```js
function _handleError(err) {
    if (err && err.name === 'AbortError') return;
    _hideTyping();
    _setStopMode(false);
    var code = (err && (err.code || (err.response && err.response.code))) || '';
    var rid  = (err && err.response && err.response.requestId) || '';
    var msg  = 'Xin lỗi, tôi không thể phản hồi lúc này. Vui lòng thử lại sau.';
    if (code || rid) {
        msg += '\n\n<small>Mã lỗi: ' + (code || 'UNKNOWN') +
               (rid ? ' · Mã tra cứu: ' + rid : '') + '</small>';
    }
    _addMessage('ai', msg);
}
```

Kèm theo: `chatbot.js:1498` đang `throw` **trước** khi `Cipher.decrypt` chạy, nên `code`/`requestId` mất trước khi tới `_handleError`. Phải giải mã envelope trước rồi mới throw.

**Verify:** giả lập upstream lỗi, xác nhận UI hiện `requestId` và đối chiếu được với n8n execution.

---

### `C2` · Envelope cho mọi nhánh lỗi gateway — 3 giờ · đóng `P1-03`

4 chỗ trả JSON thường thay vì envelope mã hóa → client `Cipher.decrypt(undefined)` → ném → rơi vào `C1`.

| server.js | Hiện tại |
|---|---|
| `:259-261` | `{"error":"Yêu cầu không hợp lệ."}` |
| `:281-283` | `{"error":"Thiếu endpoint xử lý."}` (**dead code** — `:210` đã chặn trước, xóa được) |
| `:286-289` | `{"error":"...đăng ký..."}` |
| — | Không có error middleware → lỗi body-parser trả **HTML + stack trace** |

Mẫu sửa:

```js
const sendEnvelopeError = (res, status, code, message, requestId) =>
    res.status(status).json({
        data: Cipher.encrypt(JSON.stringify({ success: false, code, message, requestId }))
    });
```

Thêm error middleware cuối `server.js`:

```js
app.use((err, req, res, next) => {
    const rid = requestIdOf(req);
    console.error('[Gateway] unhandled', { requestId: rid, code: err.type || err.name });
    sendEnvelopeError(res, err.status || 500, 'REQUEST_MALFORMED',
                      'Yêu cầu không hợp lệ.', rid);
});
```

**Verify:** gửi JSON hỏng tới `/api/gateway` → nhận envelope có `requestId`, **không** có stack trace.

---

### `C3` · Bịt `/api/sheet-data` — 1 giờ · đóng `P1-04`

`server.js:476-534`. Route này đứng ngoài mô hình fail-closed:

- `:481` xác thực bằng `req.query.apiKey`, có fallback hardcode `:482`
- `:478` `console.log(..., req.url)` → **ghi API key ra log**
- `:507` `username: username || 'admin'`
- `:512` `fetch` trần, không timeout

Cho Pilot: tắt hẳn, giống `/api/chat`.

```js
app.get('/api/sheet-data', (req, res) => res.status(404).json({
    success: false, code: 'GATEWAY_REQUIRED',
    message: 'Business APIs are only available through /api/gateway.'
}));
```

Nếu còn cần dùng: tối thiểu bỏ `req.url` khỏi log và bắt buộc header `x-api-key`.

---

### `C4` · Xoay `CHAT_API_KEY` — 4 giờ · cần phối hợp cả nhóm · đóng `P1-05`

`.env` từng được commit, **tồn tại trong 17 commit** trên GitHub. Fingerprint cho thấy key **chưa từng đổi**.

Thứ tự bắt buộc:

1. Sinh key mới, cập nhật `.env` trên server + n8n credential
2. Restart gateway, xác nhận hệ thống chạy với key mới
3. Bỏ 2 fallback hardcode: `server.js:312` (`ADMIN_UPLOAD_KEY`), `server.js:482` (`CHAT_API_KEY`) — chuyển sang fail-fast khi thiếu biến môi trường
4. Thêm `ADMIN_UPLOAD_KEY` vào `.env` (hiện **không có** → fallback đang thực sự được dùng)
5. Chỉ sau khi mọi thứ ổn định: purge history bằng `git filter-repo`, hẹn giờ force-push, báo cả nhóm re-clone

> Bước 5 làm cuối cùng và phải hẹn lịch. Force-push khi người khác đang làm việc sẽ hỏng nhánh của họ.

---

### `C5` · Sửa bộ test UAT — 2 giờ · đóng `P1-06`

Hiện `npm run test:chat:smoke` và `test:chat:live` **404 toàn bộ** vì trỏ `/api/chat` đã chết.

`scripts/test_natural_chat_system.js:326-328` và `:363-365`:

```js
// tu:
const transport = args.transport || process.env.MEDSTAND_CHAT_TRANSPORT || 'proxy';
// thanh:
const transport = args.transport || process.env.MEDSTAND_CHAT_TRANSPORT || 'gateway';
```

Cùng lúc bổ sung biến môi trường — hiện **không key nào tồn tại**, nên test đang chạy vào `localhost:3000` chứ không phải Pilot:

```
MEDSTAND_GATEWAY_URL=https://medtest.bms7.net/api/gateway
MEDSTAND_CHAT_ENDPOINT=https://medtest.bms7.net/api/gateway
MEDSTAND_TEST_LOGIN_USER=<tai khoan test>
```

Và sửa `.env.uat.local`: 3 key `UAT_API_*_URL` đang trỏ localhost; `UAT_UNMAPPED_TOKEN`, `UAT_NO_SCOPE_TOKEN` đang rỗng nên **không chạy được ca test phân quyền âm**.

Sửa luôn `docs/HUONG_DAN_TEST_CAU_TU_NHIEN_VA_TAI_HE_THONG.md:41`.

---

### `C6` · Bổ sung 3 ca test auth còn thiếu — 1 giờ

`runAuthGate` (`:504-533`) chỉ test anonymous. Checklist retest `AUD-P0-001` yêu cầu 4 ca:

```
[x] khong co token       → 401 AUTH_REQUIRED   (da verify runtime)
[ ] token rong
[ ] token sai dinh dang
[ ] token het han
```

Lưu ý thiết kế: `server.js:168-176` chỉ kiểm **sự hiện diện** của token (`/^Bearer\s+\S+$/i`), việc verify thật do Auth Guard n8n làm. Đúng mô hình 2 lớp, nhưng phải có test chứng minh lớp 2 hoạt động.

---

### `C7` · Sửa 2 bẫy trước khi import `API_Services/` — 1 giờ · đóng `P1-11`, `P1-12`

**Bẫy 1 — workflow ID không tồn tại.** Cả 3 file trỏ `xjb2EueFU0l3wt93`; runtime dùng `9UxECqxRaPGMF8EM`.

`API_Execute.json:222`, `API_GetConfig.json:196`, `API_ListActive.json:183`.

→ Sửa ID trong repo cho khớp runtime, hoặc sau mỗi lần import phải mở node `Execute Shared Auth Guard` chọn lại thủ công.

**Bẫy 2 — repo hỏng, runtime đúng.** `API_GetConfig.json:149` trong repo là `msg: 'ThÃ nh cÃ´ng'`; runtime đang trả đúng `'Thành công'`.

→ **Sửa file repo trước khi import**, nếu không sẽ làm hỏng ngược thông điệp đang chạy tốt.

Cùng lúc sửa comment mojibake: `API_GetConfig.json:26`, `API_ListActive.json:26`.

---

### `C8` · Mojibake còn lại + regex build — 2 giờ · đóng `P2-01`, `P2-12`

Còn sót sau khi 11.105 đã sửa `KhÃ¡ch hÃ ng`:

| File:line | Sửa thành |
|---|---|
| `chatbot-widget/js/chatbot.js:113` | `Cổng Gateway phản hồi không hợp lệ.` |
| `chatbot-api-engine.js:4768` | `Bạn có chắc chắn muốn thực hiện hành động này không?` |
| `chatbot-api-engine.js:5079` | `❌ Máy chủ không trả về dữ liệu...` |
| `chatbot-api-engine.js:100` | `chưa được cấu hình. Widget sẽ không hoạt động.` |
| `chatbot-api-engine.js:378` | `"User không tồn tại"` |

Nhóm mất ký tự (luồng upload/RAG, ngoài 24 API): `chatbot.js:1228, 1262, 1354, 1384, 1430`.

**Regex build đóng băng version** — `scripts/build.js:531-534` chỉ khớp đường dẫn chưa build, nên `pages/login.html` kẹt ở `theme.min.js?v=11.100` vĩnh viễn:

```js
content = content.replace(
    /src=["'](?:\.\.\/)?src\/js\/(?:utils\/theme\.js|dist\/theme\.min\.js)(?:\?v=[\d.]+)?["']/gi,
    `src="../src/js/dist/theme.min.js?v=${APP_VERSION}"`
);
```

**Verify:** build 2 lần liên tiếp, `pages/login.html` phải mang version mới nhất cả hai lần.

---

### `C9` · Service worker — 2 giờ · đóng `P1-02`, `P2-10a`

**Rò cache giữa tài khoản.** `sw.js:91-107` cache response GET của `/api/` và trả lại khi mạng lỗi, không khóa theo người dùng.

```js
// loai /api/ khoi nhanh cache hoan toan
if (request.url.includes('/api/')) {
    event.respondWith(fetch(request));
    return;
}
```

**Null guard.** `sw.js:94` và `:119` — `request.headers.get('accept')` trả `null` khi thiếu header → `.includes` ném TypeError → console đỏ.

```js
(request.headers.get('accept') || '').includes('text/html')
```

Bổ sung `PRECACHE_URLS` (`sw.js:10-49`) đang thiếu `/src/js/dist/theme.min.js` và `/chatbot-widget/js/chatbot-core.bundle.min.js`.

---

## Đợt 3 — SQL hardening · 3 – 5 ngày

> Đây là nhóm nặng nhất và có giá trị cao nhất: nó đóng luôn tỉ lệ **30% HTTP 500** chưa giải thích được từ báo cáo 21/07.

### `D1` · Guard temp table — 1 ngày · đóng `P1-07`

**Nghi phạm chính của 12/40 request lỗi ở concurrency 4.** Node mssql của n8n pool connection; temp table rò rỉ tồn tại tiếp trên session → request sau gặp *"There is already an object named '#Items'"*.

14 file dùng `SELECT ... INTO #temp`, **chỉ 1 file có guard**:

| File | Số `INTO #` |
|---|---:|
| `Module 1 - API_GoiYDonHang_AI.sql` | 13 |
| `Module 5 - API_UpsellGoiY_AI.sql` | 13 |
| `Module common - API_DanhMuc_AI.sql` | 10 |
| `Module 3 - API_ChamDiemKH_AI.sql` | 5 |
| `Module 4 - API_TichLuy_AI.sql` | 5 |
| `Module 10 - API_TraCuuSanPham_AI.sql` | 4 |
| `Module 2 - API_TuyenBanHang_AI.sql` | 4 |

Đầu mỗi procedure:

```sql
IF OBJECT_ID('tempdb..#Items')             IS NOT NULL DROP TABLE #Items;
IF OBJECT_ID('tempdb..#LatestPriceHeader') IS NOT NULL DROP TABLE #LatestPriceHeader;
IF OBJECT_ID('tempdb..#FinalPrices')       IS NOT NULL DROP TABLE #FinalPrices;
-- ...liet ke du moi temp table cua procedure do
```

**Verify:** chạy load test 40 request concurrency 4, yêu cầu ≥99% thành công, 0 lỗi *"already an object named"*.

---

### `D2` · TRY/CATCH cho procedure — 1 ngày · đóng `P1-08`

**0 occurrence `BEGIN TRY`** trong 5 procedure nghiệp vụ chính. Mọi lỗi T-SQL bị gom thành `SYSTEM_ERROR` → 500 vô danh, không phân biệt được "hết dữ liệu" với "hệ thống chết".

```sql
BEGIN TRY
    -- than procedure hien tai
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    -- don temp table
    SELECT
        ERROR_MESSAGE() AS Msg,
        'SYSTEM_ERROR'  AS MsgType,
        ERROR_NUMBER()  AS Code,
        16              AS Severity;
END CATCH
```

Đồng thời thay `CAST` bằng `TRY_CAST` ở các chỗ nhận input người dùng — hiện **không có `TRY_CAST`/`TRY_CONVERT` ở bất kỳ đâu**.

---

### `D3` · Guard `SUBSTRING` độ dài âm — 2 giờ · đóng `P1-09`

3 chỗ giống hệt nhau: `API_CongNoChiTiet_AI.sql:20-22`, `Module 1:99-101`, `Module 5:91-93`.

`LIKE '%[%]%'` chỉ chứng minh có `[` trước `]` ở đâu đó; `CHARINDEX` lấy cái đầu tiên. Input LLM trích như `] khách [NDB001]` → length `-4` → Msg 536 → 500.

```sql
DECLARE @op INT = CHARINDEX('[', @MaKhachHang);
DECLARE @cl INT = CHARINDEX(']', @MaKhachHang, @op + 1);
IF @op > 0 AND @cl > @op
    SET @MaKhachHang = SUBSTRING(@MaKhachHang, @op + 1, @cl - @op - 1);
```

---

### `D4` · Chuẩn hóa contract `API_TraCuuSanPham_AI` — 4 giờ · đóng `P1-10`

Ba shape khác nhau: validation 4 cột, NO_DATA 11 cột 0 dòng, success 17 cột.

| Việc | Vị trí |
|---|---|
| NO_DATA phải phát `Msg`/`MsgType`/`Code` thay vì `WHERE 1=0` | `:153-165` |
| Guard `@TopN` (hiện `NULL` → `SELECT TOP (NULL)` → 500) | `:4` |
| Thêm `ORDER BY` trước `TOP` — hiện giữ 50 dòng bất kỳ *trước khi* xếp hạng | `:56` |
| Chấm điểm cho khớp chính xác `ItemID` — hiện **A003 được 0 điểm** | `:59-69` |

Mẫu NO_DATA đúng để copy: `Module 1 - API_GoiYDonHang_AI.sql:397-403`.

---

### `D5` · Chuẩn hóa NO_DATA 4 API còn lại — 1 ngày · đóng `P2-09g`

| Procedure | Vấn đề |
|---|---|
| `API_CongNoChiTiet_AI:106` | Không có nhánh NO_DATA → rowset rỗng |
| `API_TichLuy_AI:172` | `ProgramStatus='NO_DATA'` nằm **trong cột dữ liệu**, gateway không đọc |
| `API_UpsellGoiY_AI:600` | KB2 thiếu nhánh NO_DATA; `:553-598` là **dead code** (`WHERE` giống hệt query gốc) |
| `API_TichLuy_AI:124-126` | `@ItemIDs = NULL` → báo tích lũy **0đ** cho khách có tích lũy thật — **nguy hiểm hơn 500** |

---

### `D6` · Các lỗi SQL còn lại — 1 ngày · đóng `P2-09`

| ID | Việc | Vị trí |
|---|---|---|
| a | `NULLIF` cho mẫu số; `TongTichLuy` có thể âm nên bậc `TuDiem=0` lọt vào mẫu số | `Module 4:203-207` |
| b | Đổi `SQL_Latin1_General_CP1_CI_AI` → `Vietnamese_CI_AS` cho tên khách — hiện "Nam" khớp "Nấm" | `Module 5:111-113` |
| c | Gỡ 1 trong 2 định nghĩa `dbo.API_GetConfig` | `Bootstrap:291` / `Migrate_Contract_V1:130` |
| d | Tạo `dbo.API_TraCuu_TongHop_AI` — được gọi nhưng **không có CREATE ở đâu** | `KhaoSat360:24` |
| e | Thêm `COLLATE DATABASE_DEFAULT` cho `CREATE TABLE #x` | `Module 1:193, 237, 260-265` |
| f | Xóa dead code nhánh top sellers (~55 dòng, `:199-205` đã return trước) | `Module 1:295-349` |
| g | Đổi `@MaKhachHang NVARCHAR(100)` → `VARCHAR` khớp `ObjectID`, tránh phá index | `CongNoChiTiet:26, 77, 92, 201` |
| h | Bỏ scalar UDF `ufn_clean_customer_name` gọi 3 lần/dòng trên full scan | `CongNoChiTiet:50-59` |
| i | Xác nhận compatibility level ≥130 trên medtest (`STRING_SPLIT`) | — |

---

## Đợt 4 — Classifier, UI, tài liệu · 1 – 2 ngày

### `E1` · 3 biến thể tài liệu khai sai + phủ test — 3 giờ · đóng `P2-04`

| Câu | Hiện tại |
|---|---|
| `khách lâu rồi chưa mua` | UNKNOWN |
| `ai đã lâu không đặt hàng` | UNKNOWN |
| `NDB001 nên nhập thêm gì` | UNKNOWN (regex có `nen nhap gi`, thiếu `nen nhap them gi`) |

Cả 3 **không nằm trong bất kỳ file test nào**. Bộ test xanh `159/159` nhưng không phủ chính claim của tài liệu.

Sửa classifier **và** thêm cả 3 vào `scripts/natural_chat_test_catalog.js`. Chạy `apply_natural_chat_classifier_patch.js` để đồng bộ vào workflow JSON, rồi import lại n8n.

---

### `E2` · Gỡ default date còn sót — 2 giờ · đóng `P2-06`

`LIB ValidateParams` vẫn còn `if (!cleanParams['@TuNgay'])` → điền đầu tháng → hôm nay. Hiện không kích hoạt **chỉ vì** classifier điền sẵn.

Mọi regression phía trên sẽ âm thầm quay lại `01/MM → hôm nay` mà không báo lỗi. Gỡ hẳn, hoặc đổi thành báo `VALIDATION_ERROR` yêu cầu người dùng nói rõ khoảng ngày.

Cùng lúc: `extractExplicitDateRange` chỉ lấy **2 token ngày đầu tiên** trong câu.

---

### `E3` · Bổ sung từ điển cột — 3 giờ · đóng `P2-03`

`chatbot.js:3531` `return dict[lower] || key;` → cột thiếu trong dict hiện nguyên tên DB.

Ưu tiên cao nhất: `API_ChamDiemKH_AI` trả `R_Score`, `F_Score`, `M_Score`, `C_Score`, `Recency_Days`, `Frequency_6M`, `Monetary_12M` — **mâu thuẫn trực tiếp** với tiêu chí `MGR-05` trong kế hoạch UAT ("ẩn R/F/M/C kỹ thuật").

Còn: `TrangThai`, `RemainingPhysical`, `PriorityScore`, `ApprovalStatus`, `DailySalesVelocity`, `ProposalReasonCode`, `NearestExpireDate`, `GiftLadderJson`, `AccumulationBasis`, `StockStatusLabel`, `MatchScore`.

Hoặc đánh dấu HIDDEN qua metadata backend (`ApiEngine.getFieldsByRole('HIDDEN')`).

---

### `E4` · Ngữ cảnh hội thoại — 4 giờ · đóng `P2-07`

- `CTX-01` chỉ chạy với transcript `"User: ..."` do client gửi. Định dạng server (`Last Customer: X | Last Intent: Y`) không route được — `foldForMatch` giữ `_` nên `@cong_no_chi_tiet` không khớp `cong no`. **Tab mới → mất ngữ cảnh.**
- `CTX-02` chỉ khớp chính xác chuỗi (`^...$`); thêm dấu là hỏng
- `UI-02`: `chatbot.js:420` trả `true` khi `requestId` rỗng → không dedupe

---

### `E5` · Sửa tài liệu — 2 giờ · đóng `P2-11`

| Vị trí | Việc |
|---|---|
| `docs/README.md:3`, `:5` | Gộp 2 "trạng thái hiện hành" mâu thuẫn thành 1 |
| `docs/README.md:15` | Link hỏng `GOI_UAT_KHACH_HANG/README.md` — tạo file hoặc sửa link sang 4 file `.docx` |
| `docs/KE_HOACH_TEST_13_TAI_KHOAN.md:198` | Thay bảng số cứng bằng **công thức** để không lỗi thời |
| `docs/HUONG_DAN_TEST...md:41` | Sửa endpoint `/api/chat` → `/api/gateway` |
| `.gitignore` | Sửa mojibake toàn bộ comment |

---

### `E6` · Dọn workflow rác n8n — 1 giờ · đóng `P2-10n`

- `Z7raaV1oe9JkjUXQ` — tên mojibake `K0-C Â· Execute API`, đã archived nhưng khách vẫn thấy tên xấu
- Hai bản `K6 · System Cleanup` cùng active: `DXuqza9EjxSMFM8y`, `Lsg5CFTdX6Lzb8zc`
- Ghim parser bằng **workflow ID** thay vì webhook path — chuyển `Call AI Intent Parser` sang node Execute Workflow, hoặc đặt path có version (`intent-parser-v5`) để không tái diễn `P0-03`
- Thêm cờ `--check` cho `apply_natural_chat_classifier_patch.js` để CI kiểm drift mà không ghi file

---

## Đợt 5 — Cần người khác quyết · 1 – 3 tuần

Không phải việc code. Không ép được bằng nỗ lực kỹ thuật.

### `F1` · Business sign-off cho rule DRAFT · đóng `P2-08`

Cả 6 rule trong `AI_BusinessRuleConfigTbl` đều `DRAFT`, và `RuleVersion` hậu tố `-DRAFT` đóng dấu lên **mọi response**.

Nghiêm trọng hơn: `AI_GetBusinessRuleConfig` (lọc `Status='APPROVED'`) **không được procedure hay workflow nào gọi** — ngưỡng đang hardcode trong SP, nên cổng DRAFT/APPROVED hiện chỉ mang tính trang trí.

| Cần ai ký | Nội dung |
|---|---|
| Kế toán | Công thức doanh số, return, VAT, doanh thu đã thu |
| Kho | Định nghĩa tồn vật lý vs tồn khả dụng |
| Sales Ops | `MinPurchaseCount=3`, `InactiveVisitDays=45`, `DefaultTopN=8`, Tier/Risk |
| Marketing | Trạng thái phê duyệt và chồng chương trình khuyến mãi |
| Chuyên môn | Phạm vi nội dung sản phẩm/thuốc |

Sau khi ký: nối `AI_GetBusinessRuleConfig` vào procedure thật, đổi `Status` sang `APPROVED`, bỏ hậu tố `-DRAFT`.

Hai chỗ lệch cần sửa cùng lúc:
- `Module 2:236` gắn `BR-ROUTE-V1` không hậu tố DRAFT trong khi config row là DRAFT
- `API_CongNoChiTiet_AI` **không có `RuleVersion` nào** → output trông như đã duyệt

---

### `F2` · Chạy đủ UAT 13 tài khoản

234 lượt (18 case × 13 tài khoản) + coverage 24 API + 8 ca phân quyền âm `SEC-01..08`.

Phụ thuộc `C5` — hiện bộ test đang trỏ nhầm môi trường nên **không chạy được**.

---

### `F3` · Nợ kỹ thuật kiến trúc

| Việc | Ghi chú |
|---|---|
| `Cipher` là XOR key tĩnh + base64 | Obfuscation, không phải mã hóa; key nằm sẵn trong client. Nếu cần bảo mật thật phải thiết kế lại |
| Không có `requestId` trên response **thành công** | `server.js:397` — kịch bản đối chiếu log chỉ chạy với response lỗi |
| CORS mở toàn bộ, không rate limit | `server.js:31`; `/api/login` nằm trong `PUBLIC_GATEWAY_ENDPOINTS` → brute-force được |
| Auth Guard không verify chữ ký JWT | `Shared_Auth_Guard.json:21` chỉ base64-decode và kiểm `exp` |
| Auth Guard cấp mặc định `['api.read']` theo marker `Manager` | `:79` |
| Timeout không phủ giai đoạn đọc body | `server.js:118-126` vs `:368` |
| `@lap_don_hang` phân loại lệch giữa 4 nơi | PREVIEW vs MUTATION |
| Role-awareness cho "việc hôm nay" | `P2-05` — là **tính năng mới**, không phải sửa lỗi |

---

## Tổng hợp thời gian

| Đợt | Nội dung | Thời gian | Khi nào |
|---|---|---|---|
| 1 | Chặn demo | 2,5 – 3,5 giờ | Hôm nay + sáng mai |
| 2 | Bảo mật + gateway | 2 – 3 ngày | Ngay sau demo |
| 3 | SQL hardening | 3 – 5 ngày | Tuần sau |
| 4 | Classifier + UI + tài liệu | 1 – 2 ngày | Song song đợt 3 |
| 5 | Business sign-off + UAT | 1 – 3 tuần | Cần người khác |

**Riêng phần kỹ thuật: 7 – 11 ngày làm việc.** Cộng đợt 5 phụ thuộc người quyết nghiệp vụ.

### Thứ tự ưu tiên nếu phải cắt bớt

1. **Đợt 1** — không cắt được, demo hỏng
2. **`C1`** — hiện `requestId`; không có nó thì mọi việc debug sau đều mù
3. **`D1` + `D2`** — đóng 30% lỗi 500, giá trị cao nhất trên mỗi giờ bỏ ra
4. **`B1` + `C3` + `C4`** — nhóm bảo mật, không nên để quá một tuần
5. Phần còn lại theo thứ tự trên

---

## Phụ lục — Sửa ở đâu thì có hiệu lực?

Hệ thống có **4 đích triển khai độc lập**. Lẫn lộn giữa chúng là nguyên nhân gốc của tình trạng source/runtime lệch nhau.

| # | Đích | Sửa ở đâu | Làm gì để có hiệu lực | Hoàn tác |
|---|---|---|---|---|
| 1 | **Chỉ local** | `scripts/`, `docs/`, `.env.uat.local` | Không cần gì — chạy ngay | `git checkout` |
| 2 | **Frontend** | `chatbot-widget/`, `src/`, `sw.js`, `index.html` | `node scripts/build.js` → deploy | Deploy lại bản cũ |
| 3 | **Gateway** | `server.js`, `.env` trên server | Copy `server.js` lên server → **restart node** | Copy lại + restart |
| 4 | **n8n** | `n8n/**/*.json` | **Import qua n8n UI** → Save → Activate | Import bản backup |
| 5 | **SQL Server** | `sql/*.sql` | **Chạy script trên medtest** | Chạy script rollback |

> **Hai cái bẫy lớn nhất:**
> - File `n8n/*.json` trong repo **là file chết**. Sửa local không có tác dụng gì cho tới khi import.
> - File `sql/*.sql` cũng vậy — sửa xong vẫn nằm im cho tới khi execute trên server.

### Có những việc KHÔNG làm được từ local

Bắt buộc thao tác tay trên n8n UI, không có đường nào khác:

| Việc | Vì sao |
|---|---|
| Activate / Deactivate workflow | Trạng thái nằm trong DB của n8n, không có trong file JSON |
| Chọn credential cho node | Credential lưu mã hóa trong n8n, file export chỉ có ID tham chiếu |
| Chọn lại workflow ID cho node Execute Workflow | ID khác nhau giữa máy — xem `C7` |
| Xem workflow nào đang thật sự active | Chỉ n8n UI hoặc export mới biết |

Đây chính là lý do `P0-03` (2 parser trùng) **không thể sửa bằng code**.

### Luồng đặc biệt: classifier — đi qua 3 chặng

Đây là chỗ dễ nhầm nhất trong toàn bộ dự án:

```
1. Sửa  scripts/natural_chat_classifier.js          ← local
2. Chạy scripts/apply_natural_chat_classifier_patch.js
        → ghi đè vào n8n/AI_Core/AI_Intent_Parser.json
                     n8n/AI_Core/MAIN_ChatBot_V5.json   ← vẫn local
3. Import 2 file đó lên n8n UI → Save → Activate       ← mới có hiệu lực
```

**Bỏ bước 2 → workflow JSON lệch classifier. Bỏ bước 3 → runtime lệch cả hai.**

Hiện tại bước 1 và 2 đã đồng bộ (đã kiểm chứng byte-identical). **Bước 3 là thứ đang thiếu** — đó là toàn bộ nội dung `P0-03` và `P0-04`.

### Phân loại toàn bộ công việc theo đích

| Mã | Việc | Đích | Cần deploy? |
|---|---|---|---|
| `A1` | Backup runtime n8n | n8n UI | — |
| `A2` | Deactivate parser cũ | **n8n UI** | Không |
| `A3` | Import Intent Parser | local → **n8n** | Import |
| `A4` | Import MAIN (gỡ AUTH001) | local → **n8n** | Import |
| `A5` | Kiểm tra bảng thiếu | **SQL Server** | Chạy script |
| `A6` | Chạy fixture UAT | **SQL Server** | Chạy script |
| `B0` | Commit + merge develop | **Chỉ local** | Không |
| `B1` | Bịt lộ file tĩnh | **Gateway** | `server.js` + restart |
| `B2` | Sửa 15 nút gợi ý | **Frontend** | Build + deploy |
| `B3` | Build + deploy | Frontend | Deploy |
| `B4` | Smoke test | Trình duyệt | — |
| `C1` | Hiện `requestId` khi lỗi | **Frontend** | Build + deploy |
| `C2` | Envelope nhánh lỗi gateway | **Gateway** | `server.js` + restart |
| `C3` | Bịt `/api/sheet-data` | **Gateway** | `server.js` + restart |
| `C4` | Xoay `CHAT_API_KEY` | **Gateway + n8n + git** | `.env` server, credential n8n, force-push |
| `C5` | Sửa bộ test UAT | **Chỉ local** | Không |
| `C6` | Bổ sung 3 ca test auth | **Chỉ local** | Không |
| `C7` | Sửa 2 bẫy `API_Services` | local → **n8n** | Import |
| `C8` | Mojibake `chatbot*.js` | **Frontend** | Build + deploy |
| `C8` | Regex `build.js` | **Chỉ local** | Có hiệu lực từ lần build sau |
| `C9` | Service worker | **Frontend** | Build + deploy |
| `D1`–`D6` | Toàn bộ SQL | local → **SQL Server** | Chạy script |
| `E1` | 3 biến thể classifier | local → patch → **n8n** | Import |
| `E2` | Gỡ default date | local → **n8n** (nằm trong MAIN) | Import |
| `E3` | Từ điển cột | **Frontend** | Build + deploy |
| `E4` | Ngữ cảnh hội thoại | **n8n** + **Frontend** | Cả hai |
| `E5` | Sửa tài liệu | **Chỉ local** | Không |
| `E6` | Dọn workflow rác | **n8n UI** | Không |

### Nhóm làm được ngay, rủi ro bằng không

Không đụng tới bất cứ thứ gì đang chạy:

```
B0  Commit + merge develop
C5  Sửa bộ test UAT (đang trỏ nhầm môi trường)
C6  Bổ sung 3 ca test auth
C8  Sửa regex build.js
E5  Sửa 5 chỗ trong tài liệu
```

Cộng thêm: **soạn sẵn** mọi thay đổi SQL (`D1`–`D6`) và n8n JSON (`C7`, `E1`, `E2`) ở local, review kỹ, rồi mới chọn thời điểm import/execute. Soạn ở local không gây rủi ro gì.

### Số lần deploy tối thiểu cho mỗi đợt

| Đợt | Frontend | Gateway restart | Import n8n | Chạy SQL |
|---|---:|---:|---:|---:|
| 1 | 1 | 1 | 2 | 2 |
| 2 | 1 | 1 | 1 | 0 |
| 3 | 0 | 0 | 0 | 1 |
| 4 | 1 | 0 | 1 | 0 |

Gom việc theo đích để giảm số lần deploy — mỗi lần deploy là một lần có thể hỏng.

---

## Nguyên tắc khi thực hiện

- **Mỗi đợt một release riêng.** Không trộn sửa SQL với sửa frontend trong cùng một lần deploy.
- **Bump `APP_VERSION` mỗi lần deploy.** Đã suýt mất dấu ở `11.104`; giờ đã truy vết được, giữ kỷ luật đó.
- **Commit trước khi build.** File `dist/` và `bundle.min.js` là sinh ra — commit nguồn trước, build sau.
- **Chạy `node scripts/test_natural_chat_system.js static` trước mỗi lần deploy.** Nhanh, không cần mạng, bắt được regression classifier.
- **Không sửa SQL và deploy trong cùng một ngày có demo.**
