# UAT-002 — Báo cáo kiểm tra deploy frontend UAT đồng bộ

**Ngày kiểm tra:** 27/07/2026
**Task liên quan:** `UAT-002 — Deploy frontend UAT đồng bộ` (phụ thuộc `UAT-001`)
**Runtime mode:** `LIVE` — đã gọi trực tiếp `https://medtest.bms7.net` (chỉ GET asset tĩnh công khai: `index.html`, các file `.bundle.min.js/css`, `sw.js`; không cần đăng nhập, không dùng token)
**Kết luận:** `NOT_DONE` — vừa bị chặn bởi `UAT-001` (chưa có manifest để đối chiếu) vừa có bằng chứng runtime cho thấy **bundle chatbot đang chạy trên medtest thật sự khác byte** so với cả commit đã chốt lẫn source local, dù số version hiển thị giống hệt nhau.

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

- Bump `APP_VERSION` trong `scripts/build.js` lên một giá trị mới (vd `11.111`) trước khi deploy bản vá panel lập đơn hàng.
- Deploy lại đúng artifact vừa build tại local (không để bước deploy tự build lại từ một checkout khác).
- Sau deploy, gọi lại đúng cách đã dùng ở báo cáo này (`curl -sI` lấy `Content-Length`/`Last-Modified`, hoặc tốt hơn là SHA-256 nguyên file) để xác nhận `chatbot.bundle.min.js` trên medtest khớp byte với local trước khi báo khách test.

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

`UAT-002 = TODO` (đang `NOT_DONE`, có bằng chứng runtime cụ thể — không phải chỉ thiếu thủ tục)

Lý do chưa hoàn thành:

- `UAT-001` (điều kiện tiên quyết) chưa `DONE`.
- Đã xác nhận `chatbot.bundle.min.js` trên medtest lệch byte so với cả commit `bfbaf7e` lẫn working tree local — không phải nghi ngờ, mà đã tải file thật về so hash.
- Bản vá lỗi panel "Lập đơn hàng" (vừa sửa trong phiên làm việc này) **chưa có** trên medtest — cần deploy lại sau khi bump version.
- Chưa có cơ chế nào (script hoặc quy trình) để tự động phát hiện lệch này trước khi báo khách test — hiện phải kiểm tra thủ công như báo cáo này.
