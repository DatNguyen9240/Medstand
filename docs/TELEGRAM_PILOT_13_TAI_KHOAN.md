# Telegram Chatbot Pilot — 13 tài khoản UAT

## Trạng thái bàn giao source

- Bot Telegram dùng credential riêng `Telegram Chatbot Demo`.
- Workflow xác thực `TG-01 · Telegram Auth Verify` được publish cùng hệ thống.
- Workflow nhận tin `TG-02 · Telegram ChatBot Demo` được publish dưới dạng webhook nội bộ, chỉ nhận từ polling bridge trên máy.
- Workflow `TG-03 · Telegram Notification Dispatch` quét mỗi phút và đẩy thông báo đã duyệt tới đúng tài khoản Telegram.
- Workflow `TG-04 · Telegram Link Code Issue` cho tài khoản đã đăng nhập web tự tạo mã liên kết Telegram dùng một lần.
- Workflow `TG-05 · Telegram System Announcement` nhận yêu cầu nội bộ có header auth và đăng thông báo vận hành lên channel chung.
- Chỉ 13 tài khoản trong `KE_HOACH_TEST_13_TAI_KHOAN.md` được phép ánh xạ.
- Telegram chỉ được cấp `api.read` và `orders.draft.write`: được lưu đơn nháp, không được gửi duyệt, đổi trạng thái, tạo khách hoặc thực hiện mutation khác.
- Telegram ID thật, bot token, mật khẩu và bearer token không được commit.

## Luồng xác thực

```text
Telegram getUpdates polling (outbound only)
  → webhook nội bộ 127.0.0.1 có header auth
  → kiểm tra private chat + text
  → SQL đối chiếu TelegramUserID với allowlist
  → phát ticket ngẫu nhiên 90 giây
  → MAIN_ChatBot_V5 xác minh ticket
  → API_Execute xác minh lại ticket
  → trả kết quả về đúng chat
```

Ticket không chứa username. SQL chỉ lưu SHA-256 của ticket, giới hạn tối đa 8 lần xác minh và vô hiệu hóa ngay khi liên kết Telegram bị thu hồi.

## File liên quan

- `sql/Migrate_Telegram_Pilot_Auth_AI.sql`: schema, allowlist và stored procedures.
- `sql/Migrate_Telegram_Order_Draft_AI.sql`: phiên xem trước 15 phút và API lưu/hủy đơn nháp.
- `sql/Migrate_Telegram_Notification_Dispatch_AI.sql`: hàng đợi, claim và ghi nhận kết quả gửi Telegram chống trùng.
- `sql/Migrate_Telegram_Self_Link_AI.sql`: mã 6 số, TTL 5 phút, chống dò mã và liên kết tài khoản nguyên tử.
- `n8n/Telegram/TG_Auth_Verify.json`: đổi ticket thành danh tính server-owned.
- `n8n/Telegram/TG_ChatBot_Demo.json`: nhận/gửi tin nhắn Telegram.
- `n8n/Telegram/TG_Notification_Dispatch.json`: lịch quét và gửi thông báo Telegram.
- `n8n/Telegram/TG_Link_Code_Issue.json`: xác minh bearer token web và phát mã cho đúng tài khoản server-owned.
- `n8n/Telegram/TG_System_Announcement.json`: kiểm tra, định dạng và đăng thông báo hệ thống lên channel đã cấu hình.
- `scripts/telegram_system_announcement.js`: xác minh quyền bot và gửi thông báo qua webhook nội bộ TG-05.
- `scripts/configure_telegram_uat_links.js`: deploy migration và ánh xạ Telegram ID.
- `config/telegram/uat-links.example.json`: mẫu 13 tài khoản, không chứa ID thật.
- `scripts/preflight_telegram_pilot.js`: kiểm tra tĩnh trước khi deploy.

## Chuẩn bị

1. Tạo bot demo riêng bằng BotFather. Không dùng lại bot gửi báo cáo ngày. Pilot dùng `getUpdates` polling và không mở n8n ra Internet.
2. Trong `.env` của máy chạy n8n, thêm:

   ```dotenv
   TELEGRAM_CHATBOT_BOT_TOKEN=<token-tu-BotFather>
   TELEGRAM_CHATBOT_API_BASE=https://api.telegram.org
   TELEGRAM_ANNOUNCEMENT_CHAT_ID=<channel-id-dang--100...>
   TELEGRAM_ANNOUNCEMENT_N8N_URL=http://127.0.0.1:5678/webhook/telegram-system-announcement
   ```

3. Chưa cần có mapping để dựng schema và mở bot lần đầu. Sau khi bot trả `Mã Telegram`, copy file mapping mẫu thành file local bị Git ignore:

   ```powershell
   Copy-Item 'config/telegram/uat-links.example.json' 'config/telegram/uat-links.local.json'
   ```

4. Mỗi người mở chat riêng với bot và gửi `/start`. Khi chưa được map, bot trả `Mã Telegram`. Điền mã đó vào đúng tài khoản trong `uat-links.local.json`.

Một Telegram ID chỉ được gắn với một tài khoản Medstand tại một thời điểm. Muốn kiểm thử 13 tài khoản đồng thời cần 13 Telegram ID. Nếu ít người test hơn, ánh xạ lại tuần tự giữa các ca; không thêm lệnh `/switch` vào bot.

## Tự liên kết từ web

1. Đăng nhập Medstand trên web bằng tài khoản của chính người dùng.
2. Mở `Tài khoản` → `Liên kết Telegram` → `Tạo mã liên kết`.
3. Trong chat riêng với bot, gửi `/login 123456` bằng mã vừa nhận.
4. Gửi `/whoami` để xác nhận username, vai trò và chi nhánh.

Mã hết hạn sau 5 phút, chỉ dùng một lần và chỉ lưu hash trong SQL. Năm lần nhập sai sẽ khóa thao tác liên kết của Telegram ID đó trong 15 phút. Không bao giờ gửi mật khẩu Medstand qua Telegram.

## Channel thông báo hệ thống

- Channel chung chỉ dùng cho bảo trì, sự cố, khôi phục và cập nhật phiên bản; không đăng doanh số, công nợ hoặc dữ liệu khách hàng.
- Bot phải là administrator với tối thiểu quyền `Post Messages`; cấp thêm `Edit Messages` để cập nhật trạng thái sự cố trên bài đã đăng.
- Channel ID thật chỉ nằm trong `.env`, không commit vào Git.
- Xác minh quyền bot:

  ```powershell
  npm run telegram:channel:verify
  ```

- Đăng thông báo từ máy chủ qua webhook loopback có header auth:

  ```powershell
  npm run telegram:channel:publish -- --type INCIDENT --title "Sự cố hệ thống" --message "Đội kỹ thuật đang kiểm tra."
  ```

  Các loại hợp lệ: `INFO`, `MAINTENANCE`, `INCIDENT`, `RESOLVED`, `RELEASE`.

## Trình tự deploy an toàn

1. Kiểm tra source:

   ```powershell
   npm run telegram:preflight
   ```

2. Chạy riêng migration trong transaction rồi rollback, sau đó commit schema lên `medtest`:

   ```powershell
   npm run telegram:schema:preflight
   npm run telegram:schema:apply
   npm run telegram:db:verify
   npm run telegram:draft:uat
   npm run telegram:notification:uat
   npm run telegram:self-link:uat
   ```

3. Bootstrap/import workflow n8n theo `n8n/workflow-manifest.json`. Xác nhận `TG-01 · Telegram Auth Verify` và `TG-02 · Telegram ChatBot Demo` đều active.

4. Khởi động local polling, không chạy Cloudflare tunnel:

   ```powershell
   powershell -ExecutionPolicy Bypass -File n8n-system/start_telegram_polling.ps1
   ```

   Cho từng người gửi `/start` để lấy `Mã Telegram`, rồi điền file mapping local.

5. Chạy mapping trong transaction rồi rollback:

   ```powershell
   npm run telegram:links:preflight
   ```

6. Khi preflight PASS, commit mapping lên `medtest`:

   ```powershell
   npm run telegram:links:apply
   ```

7. Chạy `/whoami` và smoke với một Manager và một Sale trước khi mở đủ 13 tài khoản.

8. Giữ polling bridge chạy cùng n8n trong PM2. Không cần URL public hoặc webhook Telegram.

## Ma trận smoke bắt buộc

Chạy cho 13/13 tài khoản:

| Case | Nội dung | Kết quả đạt |
|---|---|---|
| TG-AUTH-01 | `/whoami` | Đúng username, vai trò và chi nhánh |
| TG-AUTH-02 | Telegram ID chưa map | Từ chối, không chạy MAIN/SQL nghiệp vụ |
| TG-SCOPE-01 | Hỏi khách đại diện đúng scope | Có dữ liệu hoặc NO_DATA hợp lệ |
| TG-SCOPE-02 | Hỏi khách của miền khác | Không lộ dữ liệu |
| TG-READ-01 | `Hôm nay doanh số của tôi bao nhiêu?` | Đúng tài khoản đang map |
| TG-READ-02 | `Tồn kho sản phẩm A003` | Kết quả theo scope kho hiện hành |
| TG-DRAFT-01 | `/draft MÃ_KH \| A003x1` | Trả bản xem trước và nút Lưu nháp/Hủy |
| TG-DRAFT-02 | Bấm `Lưu nháp` hai lần | Cùng một mã đơn, `StatusID=-1`, không tạo trùng |
| TG-NOTI-01 | Bấm `🔔 Thông báo` | Chỉ hiện thông báo chưa đọc trong đúng phạm vi tài khoản |
| TG-NOTI-02 | Tạo thông báo `APPROVED` còn hiệu lực | Bot chủ động gửi một lần cho mỗi phiên bản nội dung |
| TG-NOTI-03 | Gửi lỗi tạm thời | Thử lại tối đa 3 lần, không đánh dấu thông báo là đã đọc |
| TG-LINK-01 | Tạo mã trên web khi đã đăng nhập | Nhận mã 6 số, hết hạn sau 5 phút |
| TG-LINK-02 | Gửi `/login MÃ_6_SỐ` trong chat riêng | Liên kết đúng tài khoản đã phát mã; `/whoami` trả đúng danh tính |
| TG-LINK-03 | Dùng lại mã hoặc nhập sai 5 lần | Từ chối mã cũ; rate-limit 15 phút sau 5 lần sai |
| TG-CHANNEL-01 | Chạy `telegram:channel:verify` | Đúng channel; bot có quyền đăng và sửa bài |
| TG-CHANNEL-02 | Đăng thông báo qua TG-05 | Channel nhận đúng nội dung; caller không có header auth bị từ chối |
| TG-WRITE-01 | Yêu cầu gửi duyệt/tạo khách/ghi mutation khác | Bị chặn; chuyển sang web |
| TG-CHAT-01 | Nhắn trong group | Từ chối và không phát ticket |

Sau smoke Telegram, chạy lại chatbot web với một Manager và một Sale để bảo đảm bearer token web vẫn đi qua `API_UserInfo` như trước.

## Điều kiện bật demo

- `npm run telegram:preflight` PASS.
- Mapping preflight và apply PASS trên đúng database `medtest`.
- `telegram-auth-verify` chỉ có một workflow active.
- `hook-ai-dainao`, `api-execute` và intent parser canonical không bị active trùng.
- 2/2 tài khoản smoke đúng danh tính và không rò scope.
- Không có bot token hoặc Telegram ID thật trong Git diff.

## Rollback

1. Deactivate `TG-02 · Telegram ChatBot Demo`. Việc này gỡ webhook nhận update của bot.
   Deactivate thêm `TG-03 · Telegram Notification Dispatch` nếu cần dừng gửi thông báo chủ động.
   Deactivate `TG-04 · Telegram Link Code Issue` nếu cần dừng tạo mã tự liên kết; các mã còn lại tự hết hạn sau 5 phút.
   Deactivate `TG-05 · Telegram System Announcement` hoặc gỡ quyền `Post Messages` của bot nếu cần dừng channel vận hành.
2. Thu hồi từng mapping bằng `dbo.API_TelegramAccountLink_Revoke_AI` hoặc đặt `IsEnabled = 0` cho allowlist trong sự cố toàn kênh.
3. Không cần tắt `MAIN_ChatBot_V5`; chatbot web tiếp tục chạy độc lập.
4. Giữ ticket/audit tối thiểu đến khi hoàn tất điều tra; ticket hết hạn tự nhiên sau 90 giây.
