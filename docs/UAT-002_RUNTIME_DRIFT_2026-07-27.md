# UAT-002 — Báo cáo kiểm tra deploy frontend UAT đồng bộ

**Ngày kiểm tra:** 27/07/2026
**Task liên quan:** `UAT-002 — Deploy frontend UAT đồng bộ` (phụ thuộc `UAT-001`)
**Runtime mode:** `LIVE` — đã gọi trực tiếp `https://medtest.bms7.net` (chỉ GET asset tĩnh công khai: `index.html`, các file `.bundle.min.js/css`, `sw.js`; không cần đăng nhập, không dùng token)
**Kết luận:** `NOT_DONE` — vừa bị chặn bởi `UAT-001` (chưa có manifest để đối chiếu) vừa có bằng chứng runtime cho thấy **bundle chatbot đang chạy trên medtest thật sự khác byte** so với cả commit đã chốt lẫn source local, dù số version hiển thị giống hệt nhau.

---

> ## 📌 CẬP NHẬT LẦN 2 — 27/07/2026, ~15:35 (giờ VN)
>
> Sau khi báo cáo lần đầu, chủ dự án đã deploy lại medtest **hai lần**. Đã kiểm tra lại toàn bộ. Tóm tắt thay đổi trạng thái:
>
> | Vấn đề | Trạng thái mới |
> |---|---|
> | Bundle chatbot lệch byte so với source | ✅ **ĐÃ XỬ LÝ** — medtest giờ khớp byte-for-byte với HEAD (`8c81569d…`) |
> | Bản vá panel "Lập đơn hàng" chưa lên medtest | ✅ **ĐÃ LÊN** — bundle live chỉ còn `create-order?data=`, hết redirect trần |
> | Nhánh `hoangdang` thiếu commit của `develop` | ✅ **ĐÃ MERGE** — `origin/develop` giờ là ancestor của HEAD `f46bb01` |
> | Sự cố mới: bundle dính marker conflict Git | ✅ **ĐÃ THAY** — xem mục 3.4 |
> | `APP_VERSION` chưa tăng → cache `immutable` giữ bản cũ | ⚠️ **CHƯA XỬ LÝ XONG** — đã bump lên `11.111` ở local, **chờ deploy**; xem mục 3.5 |
>
> **Kết luận cập nhật:** `UAT-002` vẫn `NOT_DONE`, nhưng lý do đã thu hẹp còn **đúng một việc**: deploy bản `11.111` để đổi cache key. Nội dung file đã đúng, chỉ còn vấn đề trình duyệt cũ vẫn giữ bundle `11.110` trong cache `immutable`.

---

## 1. Hiện tượng

Số version hiển thị (`11.110`) khớp nhau ở mọi nơi: `APP_VERSION` trong `scripts/build.js`, script inline dọn cache trong `index.html`, `CACHE_VERSION` trong `sw.js`, và query string `?v=11.110` trên các thẻ `<script>`/`<link>` — cả local lẫn trên medtest.

Nhưng khi so **nội dung thật** (SHA-256) của từng file giữa ba nguồn — (a) commit đã chốt gần nhất `bfbaf7e`, (b) working tree local hiện tại, (c) file medtest đang phục vụ qua HTTP — thì `chatbot-widget/js/chatbot.bundle.min.js` cho ra **ba hash khác nhau hoàn toàn**. Tức là số version giống nhau không có nghĩa là nội dung giống nhau — đúng như rủi ro UAT-001 đã cảnh báo, và giờ đã bắt được bằng chứng thật.

## 2. Nguyên nhân

### Nguyên nhân chính

Không có bước "build 1 lần, đóng gói checksum, deploy đúng gói đó" — deploy hiện tại (dù thủ công hay CI) có vẻ **build lại** tại thời điểm deploy thay vì copy nguyên artifact đã kiểm chứng, nên chỉ cần source khác đi một chút giữa lúc commit và lúc deploy build là ra byte khác, dù logic gần như tương đương.

### Nguyên nhân phụ

1. `Cache-Control: public, max-age=31536000, immutable` áp cho toàn bộ `.min.js`/`.min.css` (đã xác nhận qua header thật) — nghĩa là **trình duyệt nào đã tải một bản `?v=11.110` rồi sẽ không bao giờ hỏi lại server nữa**, kể cả khi server sau đó đổi nội dung dưới đúng URL đó. Cache-busting duy nhất là đổi số `APP_VERSION`.
2. `scripts/build.js` không tự tăng `APP_VERSION` — người chạy build phải tự tay bumping. Trong phiên làm việc gần nhất, `chatbot-api-engine.js` đã được sửa và build lại **hai lần** (thêm nhận diện câu tự nhiên, rồi sửa lỗi panel lập đơn) mà `APP_VERSION` vẫn giữ nguyên `11.110` — nếu deploy thẳng, các trình duyệt đã cache bản `11.110` cũ sẽ không bao giờ thấy bản sửa lỗi mới.
3. Thời điểm `Last-Modified` của toàn bộ asset trên medtest dồn về cùng một mốc — `2026-07-27 08:04:39–46 GMT` (≈ `15:04` giờ VN) — chỉ khoảng 1–2 phút sau thời điểm commit `bfbaf7e` (`15:02:59` giờ VN). Rất giống một lượt deploy tự động chạy ngay sau commit, nhưng artifact ra không khớp byte với đúng commit đó — chưa xác định được vì sao (cần log của bước deploy/CI, việc này nằm ngoài khả năng kiểm tra từ phía source).

## 3. Bằng chứng đã xác định được

### 3.1 So khớp version hiển thị (đều khớp — nhưng không đủ để kết luận đồng bộ)

| Nơi kiểm tra | `APP_VERSION` / `?v=` | `CACHE_VERSION` (sw.js) |
|---|---|---|
| `scripts/build.js` (local) | `11.110` | — |
| `index.html` (local) | `?v=11.110` | — |
| `sw.js` (local) | — | `medstand-11.110` |
| `https://medtest.bms7.net/` (live, đã curl trực tiếp) | `?v=11.110` (mọi thẻ script/link) | `medstand-11.110` |

### 3.2 So khớp nội dung thật bằng SHA-256 (phát hiện lệch)

| File | Commit `bfbaf7e` | Working tree local | medtest (live) | Kết luận |
|---|---|---|---|---|
| `src/js/dist/app.bundle.min.js` | `1f498f06…` | `1f498f06…` | `1f498f06…` | `MATCH` — 3 nguồn giống hệt |
| `sw.js` | khác byte thô | khác byte thô | khác byte thô | `MATCH` sau khi chuẩn hoá CRLF/LF — chỉ lệch xuống dòng, không lệch logic |
| `index.html` | khác byte thô | khác byte thô | khác byte thô | `MATCH` sau khi chuẩn hoá CRLF/LF — chỉ lệch xuống dòng, không lệch logic |
| `chatbot-widget/js/chatbot.bundle.min.js` | `d3630a8a…` (258.553 byte) | `cb132a5e…` (258.452 byte) | `db0d0254…` (258.572 byte) | `MISMATCH_CONFIRMED` — vẫn lệch cả sau khi chuẩn hoá CRLF/LF, tức là lệch nội dung thật, không phải lệch xuống dòng |

### 3.3 Xác nhận cụ thể: lỗi vừa sửa (panel "Lập đơn hàng") vẫn đang chạy trên medtest

Đã tải file `chatbot.bundle.min.js` thật từ medtest về và soát chuỗi bên trong:

- Bundle trên medtest **vẫn còn** đường redirect thẳng `window.parent.location.hash = '/create-order'` (không kèm dữ liệu) — đây chính là lỗi khiến panel "Lập đơn hàng nhanh trong chat" không mở được, vừa được xác nhận và sửa ở local trong phiên làm việc này.
- Bundle trên medtest **đã có** phần nhận diện câu tự nhiên "Tạo khách hàng (mới)" — tức là medtest đang chạy một bản **cũ hơn bản local hiện tại nhưng không phải bản đã commit gần nhất** (có tính năng mới nhưng thiếu bản vá mới nhất).

Nói cách khác: người dùng thật đang thao tác trên medtest **ngay lúc này** vẫn gặp đúng lỗi panel lập đơn không mở, dù lỗi đó đã được sửa ở local.

### 3.4 Sự cố phát sinh khi deploy lần 1: bundle dính marker conflict Git

Ở lượt deploy đầu tiên sau báo cáo này (`Last-Modified: 08:24:57 GMT`), file `chatbot.bundle.min.js` trên medtest có kích thước **517.101 byte** — gần gấp đôi bình thường — và **bắt đầu bằng marker xung đột Git chưa giải quyết**:

```
<<<<<<< HEAD
var _dec=function(e){...
=======
>>>>>>> 1cf31ed25b101ba812b75bfa9ccd561258616502
```

Dòng đầu tiên `<<<<<<< HEAD` không phải JavaScript hợp lệ nên toàn bộ widget chatbot **không khởi tạo được**. Nguyên nhân: `chatbot.bundle.min.js` là file build ra nhưng vẫn được commit vào Git, nên mỗi lần build lại là toàn bộ nội dung đổi → merge giữa `hoangdang` và `develop` luôn conflict ở file này, và lần đó marker chưa được resolve trước khi đẩy lên.

Đã xác nhận chỉ mình file này bị dính (`index.html`, `sw.js`, `app.bundle.min.js`, `chatbot-core.bundle.min.js` đều sạch). Lượt deploy thứ hai (`08:27:20 GMT`) đã thay bằng bản đúng.

**Bài học đưa vào manifest:** kiểm tra "không chứa marker conflict" phải là một bước bắt buộc sau deploy, vì server vẫn trả HTTP 200 bình thường cho file hỏng kiểu này — không có tín hiệu lỗi nào ở tầng HTTP.

### 3.5 Vấn đề còn lại: cache `immutable` và `APP_VERSION` không đổi

Đây là vấn đề duy nhất chưa xử lý xong. Trong ngày 27/07, `chatbot.bundle.min.js` đã phục vụ **ba nội dung khác nhau** dưới **cùng một URL** `?v=11.110`:

| Giờ (GMT) | Content-Length | Nội dung |
|---|---:|---|
| 08:04:42 | 258.572 | thiếu bản vá panel lập đơn |
| 08:24:57 | 517.101 | **hỏng — dính marker conflict** |
| 08:27:20 | 258.471 | đúng (bản hiện hành) |

Header thật của file đó: `Cache-Control: public, max-age=31536000, immutable`.

Chuỗi bảo vệ hiện có đều **không cứu được** trường hợp này vì tất cả đều gắn với `APP_VERSION`, mà `APP_VERSION` không đổi:

1. **HTTP cache** — `immutable` nghĩa là trình duyệt không revalidate kể cả khi bấm F5. Chỉ Ctrl+Shift+R hoặc xóa cache mới vượt qua.
2. **Script dọn cache trong `index.html`** — so `localStorage['medstand_asset_version']` với `appVersion`; hai giá trị bằng nhau (`11.110`) nên nó coi như không có deploy mới, không dọn, không reload.
3. **Service Worker** — `CACHE_VERSION = 'medstand-11.110'` không đổi nên SW không kích hoạt bản mới và không xóa cache cũ. Với `/chatbot-widget/` SW dùng network-first, nhưng `fetch()` của SW vẫn đi qua HTTP cache nên vẫn nhận bản `immutable` cũ.

Hệ quả: mọi máy đã mở `#/chatbot` trên medtest kể từ 08:04 GMT đang giữ một trong hai bản cũ (kể cả bản hỏng) và sẽ giữ như vậy tới một năm.

**Cách sửa duy nhất hiệu quả** là đổi cache key: tăng `APP_VERSION` để URL thành `?v=11.111`. Đã thực hiện ở local (xem mục 6), **chờ deploy**.

### 3.6 Bẫy khi kiểm tra: cache bản nén (Brotli) cũ hơn file thật

Sau khi deploy `11.111`, script kiểm tra báo `app.bundle.min.js` lệch, trong khi file đã được copy đúng. Truy nguyên bằng cách gọi cùng URL với các `Accept-Encoding` khác nhau:

| URL | `Accept-Encoding` | Kết quả |
|---|---|---|
| `/src/js/dist/app.bundle.min.js` | `identity` | ✅ bản mới |
| `/src/js/dist/app.bundle.min.js` | `gzip` | ✅ bản mới |
| `/src/js/dist/app.bundle.min.js` | `br` | ❌ **bản cũ `11.110`** |
| `/src/js/dist/app.bundle.min.js?v=11.111` | `gzip, deflate, br, zstd` | ✅ bản mới |
| `/src/js/dist/app.bundle.min.js?v=11.110` | `gzip, deflate, br, zstd` | ✅ bản mới |

Server đứng trước (IIS/ARR — theo header `X-Powered-By: ARR/3.0, ASP.NET`) giữ **cache bản đã nén riêng cho từng URL**. Sau deploy, cache Brotli của **URL không kèm query** chưa được làm mới, nên vẫn trả nội dung `11.110`. Các biến thể có query string thì tạo entry mới nên đã lấy bản đúng.

**Ảnh hưởng thực tế: không có.** Trình duyệt luôn gọi kèm `?v=11.111` (do `index.html` và router sinh ra), và các URL đó trả bản đúng. Đây là lỗi của script kiểm tra, không phải lỗi deploy.

**Hai bài học đưa vào quy trình:**

1. Khi so hash file với server, **phải gửi `Accept-Encoding: identity`** — nếu không sẽ lấy phải bản nén cache cũ và báo lệch oan. `curl` mặc định không khai báo nén nên "may mắn" đúng; Node `fetch` mặc định gửi `gzip, deflate, br` nên dính bẫy.
2. Chỉ kiểm tra file trên đĩa là **chưa đủ**. Phải kiểm tra thêm đúng URL mà trình duyệt gọi (kèm `?v=`) với header nén đầy đủ, vì đó mới là thứ người dùng cuối thật sự nhận.

Cả hai đã được cài vào `scripts/verify_frontend_deploy.js`.

## 4. File bị ảnh hưởng

| File | Vai trò | Rủi ro |
|---|---|---|
| `chatbot-widget/js/chatbot.bundle.min.js` | Bundle chatbot UI (đã xác nhận lệch runtime) | UAT đang test nhầm hành vi so với source đang review |
| `scripts/build.js` | Nguồn `APP_VERSION`, không tự tăng version | Rebuild nội dung khác nhưng cùng `?v=`, trình duyệt/CDN cache `immutable` sẽ giữ bản cũ vĩnh viễn |
| `sw.js` | Cache Service Worker | Đúng logic nhưng cần thống nhất chuẩn hoá line-ending khi tính checksum để tránh báo lệch giả |
| `index.html` | Entry point, script dọn cache theo `appVersion` | Đúng logic; cùng lưu ý line-ending khi làm checksum |
| Bước deploy/CI (chưa xác định được công cụ) | Đưa artifact lên medtest | Không rõ deploy copy nguyên bundle đã build hay tự build lại tại thời điểm deploy — chính là nguồn gây lệch |

## 5. Mức độ ảnh hưởng

**Mức độ:** `P0 — Runtime đang lệch, không phải rủi ro giả định.`

- Ít nhất một lỗi đã sửa (panel lập đơn hàng) **chưa** lên tới medtest — nếu khách hàng test UAT ngay bây giờ, họ sẽ vẫn thấy lỗi cũ và báo lại một lỗi tưởng như "đã sửa mà chưa hết".
- Vì cache là `immutable, max-age=31536000` và `APP_VERSION` không tự tăng, nguy cơ lặp lại: sửa lỗi → build → deploy → nhưng nếu quên bump version, trình duyệt của tester **vẫn giữ bản trước đó trong cache**, dẫn tới báo cáo test sai lệch.
- Không có cách nào từ giao diện version hiển thị để phát hiện ra việc này — phải so hash mới thấy, đúng như UAT-001 đã cảnh báo.

## 6. Đề xuất giải quyết

### Bước 1 — Xử lý ngay để test tiếp được

**✅ Đã thực hiện tại local (27/07/2026, ~15:40 giờ VN) — chờ deploy:**

- `APP_VERSION` trong `scripts/build.js`: `11.110` → `11.111`.
- Đã rebuild toàn bộ (`node scripts/build.js`). Xác nhận version đồng bộ ở cả bốn nơi: `scripts/build.js`, `sw.js` (`medstand-11.111`), `index.html` (`appVersion = '11.111'` và mọi `?v=11.111`), và `app.bundle.min.js` (chỉ chứa `?v=11.111`).
- Xác nhận hai bản vá còn nguyên trong bundle mới: chỉ còn `create-order?data=` (bản vá panel lập đơn) và null-guard `u&&(u.config=n` (từ `develop`).
- Xác nhận không có marker conflict trong bất kỳ artifact nào.
- Test: classifier 56/56, static suite 159/159 (0 failed, 0 releaseGateFailures).
- Manifest đã cập nhật sang RC3 với hash mới: `release/UAT_MANIFEST_2026-07-27_11.110.md`.

**⏳ Còn lại (phía người triển khai):**

- Deploy đúng artifact vừa build tại local (không để bước deploy tự build lại từ một checkout khác).
- Sau deploy, so SHA-256 nguyên file để xác nhận medtest khớp manifest RC3 — không chỉ nhìn `Content-Length`.
- Kiểm tra bắt buộc: file phục vụ không chứa marker conflict Git (bài học mục 3.4).
- Mở lại bằng **trình duyệt đã từng dùng bản `11.110`**, không xóa cache thủ công, xác nhận nó tải `chatbot.bundle.min.js?v=11.111`. Đây là bài test trực tiếp cho tiêu chí "trình duyệt không còn tải bundle cũ".

### Bước 2 — Xử lý gốc rễ (gắn với UAT-001)

- Hoàn thành `UAT-001` trước: khoá 1 commit làm release candidate, ghi SHA-256 từng artifact quan trọng vào manifest.
- Bước deploy phải **copy nguyên file đã build và đã hash trong manifest**, không build lại trên máy đích — nếu bắt buộc phải build lại trên máy đích thì phải hash lại và đối chiếu với manifest, KHÔNG deploy nếu hash lệch.
- Cân nhắc: script build tự động tăng `APP_VERSION` (hoặc dùng hash nội dung làm query string thay vì số version tay) để loại hẳn khả năng quên bump.

### Bước 3 — Chuẩn hoá cách tính checksum

- Khi lập manifest ở UAT-001, quy định rõ chuẩn hoá line-ending trước khi hash văn bản (`sw.js`, `index.html`) để tránh báo lệch giả do CRLF/LF khác nhau giữa Windows local và server Linux/khác — bản thân báo cáo này đã gặp đúng trường hợp đó.

## 7. Điều kiện nghiệm thu đề xuất cho UAT-002

Task chỉ được chuyển sang `DONE` khi:

- `UAT-001` đã `DONE` (có manifest khoá release, có checksum kỳ vọng cho từng artifact).
- SHA-256 thực tế của từng artifact quan trọng trên medtest (`app.bundle.min.js`, `chatbot.bundle.min.js`, `sw.js`, `index.html`, CSS bundle) khớp đúng checksum trong manifest — không chỉ khớp số `?v=`.
- Xác nhận bằng nội dung thật (không chỉ Content-Length) rằng bản vá gần nhất (panel lập đơn hàng) đã có trên medtest.
- Có ghi chú rõ bước deploy dùng artifact build sẵn hay build lại tại đích; nếu build lại tại đích thì phải có bước hash-lại-đối-chiếu trước khi coi là deploy thành công.

## 8. Trạng thái hiện tại

`UAT-002 = TODO` (đang `NOT_DONE`)

### 8.1 Đã xử lý xong

| Vấn đề ban đầu | Trạng thái | Bằng chứng |
|---|---|---|
| Bundle chatbot lệch byte so với source | ✅ `RESOLVED` | medtest = HEAD = `8c81569d…`, khớp byte-for-byte |
| Bản vá panel "Lập đơn hàng" chưa lên medtest | ✅ `RESOLVED` | bundle live chỉ còn `create-order?data=` |
| `hoangdang` thiếu commit của `develop` | ✅ `RESOLVED` | `origin/develop` là ancestor của HEAD `f46bb01` |
| Bundle dính marker conflict Git (phát sinh) | ✅ `RESOLVED` | đã thay lúc `08:27:20 GMT`, đã soát lại sạch |
| Manifest lỗi thời ở dòng `chatbot.bundle.min.js` | ✅ `RESOLVED` | manifest cập nhật sang RC3 `11.111` |

Đối chiếu 6/6 artifact frontend giữa manifest RC2 / HEAD / medtest live (sau chuẩn hóa CRLF): 5 file `MATCH` tuyệt đối; riêng `chatbot.bundle.min.js` live khớp HEAD nhưng lệch manifest RC2 — nguyên nhân là manifest khóa trước khi merge `develop`, đã sửa ở RC3.

### 8.2 Deploy `11.111` — ĐÃ HOÀN TẤT

Chủ dự án đã deploy `11.111` lúc ~08:47 GMT (≈15:47 giờ VN). Kiểm tra lại bằng `scripts/verify_frontend_deploy.js`:

```
OK   index.html / app.bundle.min.js / app.bundle.min.css
OK   chatbot.bundle.min.js / chatbot-core.bundle.min.js
OK   pages/login.html / pages/forgot-password.html / sw.js
OK   version trên server: ?v=11.111 | appVersion=11.111
OK   app.bundle.min.js?v=11.111        (đường đi thật của trình duyệt)
OK   chatbot.bundle.min.js?v=11.111    (đường đi thật của trình duyệt)
✅ Toàn bộ khớp.
```

8/8 artifact khớp bản build local; version đồng bộ; và quan trọng nhất — URL kèm `?v=11.111` với header nén giống trình duyệt cũng trả đúng bản mới, nghĩa là người dùng cuối thật sự nhận bản `11.111`.

Vì cache key đã đổi từ `?v=11.110` sang `?v=11.111`, các máy đang giữ bundle cũ trong HTTP cache `immutable` sẽ buộc phải tải mới. Tiêu chí *"trình duyệt không còn tải bundle cũ"* coi như đạt về mặt kỹ thuật, nhưng **vẫn cần xác nhận thủ công** trên một trình duyệt đã từng dùng bản `11.110` (mục 8.4).

### 8.4 Còn lại: smoke test trên trình duyệt thật

Phần tự động đã xanh hết. Chưa thể tự kiểm tra được (cần thao tác người dùng có đăng nhập):

- Mở medtest bằng trình duyệt đã từng dùng bản `11.110`, **không xóa cache**, xác nhận DevTools → Network hiển thị `?v=11.111`.
- Menu thao tác nhanh → **Lập đơn hàng**: panel giỏ hàng mở ngay trong khung chat, không nhảy sang `/create-order` trống.
- Gõ `Tạo khách hàng mới` → mở form tạo khách.
- Gõ `Lên đơn cho khách NDB001` → mở panel lập đơn điền sẵn khách.
- Đăng nhập một Sale và một Manager, xác nhận không lỗi 500 ở doanh số / gợi ý đơn / tuyến / tồn kho.

### 8.3 Vấn đề hệ thống chưa xử lý (không chặn UAT-002 nhưng sẽ lặp lại)

- `scripts/build.js` **không tự tăng** `APP_VERSION` — phụ thuộc hoàn toàn vào việc người build nhớ bump. Trong chính ngày 27/07 đã có 3 lần build mà không bump. Nên cân nhắc tự sinh cache key từ hash nội dung thay vì số version tay.
- `chatbot.bundle.min.js` là file build ra nhưng **vẫn được commit vào Git**, nên mỗi lần merge giữa nhánh đều conflict toàn file — đây chính là nguồn gốc sự cố marker conflict ở mục 3.4. Nên cân nhắc đưa artifact build ra khỏi Git và sinh lúc deploy, hoặc quy định luôn `--ours`/rebuild khi conflict ở file này.
- Chưa có script tự kiểm tra drift (hash + marker conflict) sau deploy — hiện phải làm thủ công như báo cáo này.
