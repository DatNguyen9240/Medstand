# UAT-005 — Kiểm tra endpoint và secret UAT

**Ngày kiểm tra:** 27/07/2026  
**Phạm vi:** read-only static review; không import/publish workflow, không sửa frontend/SQL, không tác động UAT-002.

## Kết luận

`REVIEW_REQUIRED` — kiến trúc chuẩn là giao diện `medtest.bms7.net`, API nội bộ `medtest.bms79.com`, DB `medtest`. Cấu hình local đã được chỉnh theo kiến trúc này. Theo quyết định của chủ dự án, giữ fallback `ADMIN_UPLOAD_KEY || 'Medstand@Admin2026'` để tương thích với workflow upload hiện tại; còn cần xác nhận biến môi trường trên server và chạy một smoke test runtime.

Đây là kết quả kiểm tra, chưa phải thao tác sửa/deploy. UAT-002 không bị tác động.

## Bằng chứng

Chạy:

```powershell
node scripts/verify_uat5_config.js
```

Các phát hiện:

1. `FRONTEND_PROXY_CONFIG = PASS`: `env.js` để `API_BASE` rỗng và gọi `/api/gateway`, không expose backend URL trong browser.
2. `SERVER_API_TARGET = PASS`: `.env` local đã trỏ `API_BASE` tới API nội bộ `medtest.bms79.com`. Vì `.env` không được commit, vẫn cần đối chiếu riêng cấu hình đang deploy trên server.
3. `N8N_WORKFLOW_HOSTS = PASS` sau khi cho phép API nội bộ `medtest.bms79.com`; các host `openrouter.ai`, Qdrant `127.0.0.1` và n8n Cloudflare tunnel là dependency được cấu hình.
4. `CHAT_KEY_CONFIG = PASS`: `.env` local có `CHAT_API_KEY`; giá trị không được ghi vào báo cáo.
5. `ADMIN_KEY_COMPATIBILITY = PASS`: server giữ fallback `Medstand@Admin2026`, khớp với `AI_Upload_Reader.json` hiện đang kiểm tra đúng giá trị này tại cả luồng upload và phê duyệt catalog. Đây là quyết định tương thích UAT của chủ dự án; cần thay bằng credential runtime ở giai đoạn hardening trước production.
6. `N8N_CREDENTIAL_BINDINGS = PASS`: file export chỉ chứa tên credential (`microsoftSql`, `openAiApi`, `redis`...), không chứa password; binding thật trên n8n runtime chưa được chứng minh từ source.

## File ảnh hưởng

- `env.js`, `.env` (runtime local, không commit)
- `server.js`
- `n8n/Shared/Shared_Auth_Guard.json`
- `release/UAT_MANIFEST_2026-07-27_11.110.md`

## Đề xuất xử lý

- Giữ `medtest.bms79.com` cho API nội bộ; `medtest.bms7.net` chỉ dùng cho giao diện/public origin. Đối chiếu và cập nhật `API_BASE` ở môi trường server nếu runtime vẫn đang trỏ host giao diện.
- Giữ fallback `Medstand@Admin2026` trong UAT để không làm hỏng workflow upload hiện tại. Trước production, chuyển cả `server.js` và `AI_Upload_Reader.json` sang credential/environment chung, tránh secret viết cứng trong source.
- Đặt `CHAT_API_KEY` và `ADMIN_UPLOAD_KEY` trong secret manager/environment của server; không đưa vào source hoặc workflow export.
- Sau khi sửa, chạy lại script và kiểm tra một request auth/metadata trên runtime. Chỉ chuyển UAT-005 `DONE` khi mọi check `PASS` và có bằng chứng runtime.

## Thay đổi đã thực hiện

- `.env` local: `API_BASE` chuyển sang `https://medtest.bms79.com` (file bị gitignore, không commit).
- `server.js`: giữ lại admin-key fallback theo yêu cầu tương thích với workflow upload hiện tại.
- `node --check server.js` và `node scripts/verify_uat5_config.js` đã chạy; kết quả static là `REVIEW_REQUIRED` vì chưa có runtime evidence.

## Ảnh hưởng UAT-002

Không có thay đổi runtime nào được thực hiện trong lần kiểm tra này; UAT-002 không bị ảnh hưởng.
