# NOTI-001 - Báo Cáo Kỹ Thuật Và Đặc Tả Phân Phối Thông Báo

- **Mã task:** `NOTI-001`
- **Mức độ ưu tiên:** `P1`
- **Trạng thái:** `DESIGN READY / CHƯA TRIỂN KHAI`
- **Ngày cập nhật:** `14/08/2026`
- **Phạm vi:** Thông báo trong web app, trạng thái đã đọc theo từng tài khoản và Web Push trên thiết bị di động
- **Tài liệu tham chiếu:** [BACKLOG_TASK_PHAT_TRIEN_MEDSTAND_AI_2026-07-27.md](BACKLOG_TASK_PHAT_TRIEN_MEDSTAND_AI_2026-07-27.md)

---

## 1. Mục Tiêu

Xây dựng hệ thống thông báo có khả năng phân phối đúng người nhận theo bốn điều kiện:

1. Chi nhánh `BranchID`.
2. Nhóm người dùng `UserGroupID`.
3. Tài khoản đích danh `UserName`.
4. Khoảng thời gian hiệu lực `EffectiveFromUtc` - `EffectiveToUtc`.

Hệ thống phải đáp ứng thêm các yêu cầu:

- Trạng thái đã đọc được lưu riêng cho từng tài khoản.
- Không thể xem thông báo của tài khoản khác bằng cách sửa query hoặc body.
- Thông báo hết hạn, chưa đến hạn, chưa duyệt hoặc đã thu hồi không được trả về.
- Có danh sách thông báo, số lượng chưa đọc, xem chi tiết, đánh dấu đã đọc và thông báo khẩn trên Dashboard.
- Có thể mở rộng sang Web Push Android/iOS mà không thay đổi mô hình phân quyền cốt lõi.
- Không sửa bảng nghiệp vụ gốc của ERP; dữ liệu mới được lưu trong tầng Shadow SQL.

## 2. Nguyên Tắc Bảo Mật Bắt Buộc

### 2.1. Danh tính do server xác minh

Frontend hiện lấy `UserName` từ `localStorage` và gửi lên endpoint thông báo. Giá trị này chỉ được dùng để hiển thị giao diện, không được dùng làm danh tính ủy quyền.

Tất cả API NOTI-001 phải thực hiện theo quy tắc:

1. `Http` gửi Bearer token qua tunnel mã hóa `/api/gateway`.
2. Express gateway chỉ chuyển request đã có token đến workflow nội bộ `/webhook/api-execute` và tự gắn `x-api-key` của n8n.
3. Workflow dùng `Shared_Auth_Guard` gọi `API_UserInfo` để xác minh token và ánh xạ tài khoản ERP.
4. Node `Apply Verified Identity` xóa các tham số scope do client gửi, sau đó tự gắn `@Username` và `@User` từ danh tính đã xác minh.
5. SQL procedure chỉ sử dụng `@Username` do luồng nội bộ này cung cấp.
6. Nếu không xác minh được danh tính, luồng phải dừng với `401`, không được truy vấn thông báo.

Không endpoint danh sách, chi tiết, unread count, mark-read hoặc push subscription nào được tin vào `UserName` từ query/body của trình duyệt.

### 2.2. Fail-closed

- Tài khoản không tồn tại hoặc `Disable = 1`: trả rỗng hoặc từ chối theo API contract.
- Scope mode không hợp lệ hoặc scope `SELECTED` không có dòng cấu hình: không phân phối.
- Thông báo không ở trạng thái `APPROVED`: không phân phối.
- Không trả nội dung chi tiết trước khi kiểm tra phạm vi người nhận.
- Không ghi token đăng nhập, push token, Authorization header hoặc secret vào log.

## 3. Hiện Trạng Hệ Thống

### 3.1. Thành phần có thể tái sử dụng trực tiếp

| Thành phần hiện có | Kết quả rà soát | Quyết định |
|---|---|---|
| [http.js](../src/js/services/http.js) | Đã gắn Bearer token, mã hóa request, chuyển toàn bộ API qua `/api/gateway`, chống request GET trùng và xóa cache sau mutation | Giữ nguyên kiến trúc; không tạo HTTP client mới |
| [server.js](../server.js) | Đã kiểm tra token tồn tại, chuyển `/webhook/*` tới n8n, tự gắn `x-api-key`; đã có helper xác minh ERP cho một số mutation trực tiếp | Không thêm middleware NOTI riêng nếu NOTI đi qua `API_Execute` |
| [Shared_Auth_Guard.json](../n8n/Shared/Shared_Auth_Guard.json) | Đã gọi `API_UserInfo`, lấy `UserName`, `BranchID`, `UserGroupID` và capability từ danh tính đã xác minh | Tái sử dụng làm lớp xác thực duy nhất của NOTI |
| [API_Execute.json](../n8n/API_Services/API_Execute.json) | Đã có `@thong_bao` trong read allowlist; đã xóa tham số scope từ client và tự gắn `@Username`, `@User` | Mở rộng cho detail, unread count và mark-read; không tạo workflow đọc riêng |
| [intent-map.v1.json](../config/natural-language/intent-map.v1.json) | Đã ánh xạ `NOTIFICATIONS -> @thong_bao` | Giữ nguyên |
| [notifications.js](../src/js/pages/notifications.js) và [notifications.html](../src/templates/notifications.html) | Đã có route, skeleton, empty state, render danh sách và escape HTML | Nâng cấp tại chỗ; không tạo trang thông báo thứ hai |
| [router.js](../src/js/core/router.js) | Đã có route thông báo, chuông và badge toàn cục | Chỉ đổi nguồn số đếm |
| [home.js](../src/js/pages/home.js) | Đã có `loadNotificationCount()` | Thay nội dung hàm; không tạo module Dashboard mới |
| [sw.js](../sw.js) và [pwa-register.js](../src/pwa/pwa-register.js) | Đã có PWA lifecycle, cache version, đăng ký Service Worker; API không bị cache | Tái sử dụng cho giai đoạn Push |
| [build.js](../scripts/build.js) | Tự build tất cả page JS/CSS, cập nhật bundle, HTML version và Service Worker version | Giữ nguyên code; bắt buộc chạy lại sau khi sửa frontend |
| [bootstrap_n8n.js](../n8n-system/bootstrap_n8n.js) và [workflow-manifest.json](../n8n/workflow-manifest.json) | Tự import/publish workflow, giữ nguyên workflow ID và kiểm tra manifest | Tái sử dụng để chuyển NOTI sang server khác |
| [PROMO-001_Promotion_Schema_AI.sql](../sql/PROMO-001_Promotion_Schema_AI.sql) và [PROMO-002_Active_Promotion_By_User_AI.sql](../sql/PROMO-002_Active_Promotion_By_User_AI.sql) | Đã có mẫu Shadow SQL, scope chi nhánh/nhóm user, `APPROVED`, UTC và function fail-closed theo `SY_User` | Tái sử dụng mẫu thiết kế, không dùng chung bảng dữ liệu |

### 3.2. Hạn chế của code hiện tại

- [notifications.js](../src/js/pages/notifications.js), [home.js](../src/js/pages/home.js) và [router.js](../src/js/core/router.js) đang lấy `UserName` từ `localStorage`, gửi `{ User: userName }`, tải toàn bộ danh sách rồi tự đếm.
- `home.js` cập nhật `#hero-notif-badge`, nhưng phần tử này không tồn tại trong [home.html](../src/templates/home.html); đoạn cập nhật hiện không tạo hiệu quả giao diện.
- `Http.get()` cache GET trong `sessionStorage` ba phút. Badge thông báo không phù hợp với cache này nếu cần cập nhật gần thời gian thực.
- `env.js` mới chỉ có `NOTIFICATION.LIST: '/api/API_ThongBao'`; chưa có contract cho detail, unread count và mark-read.
- `@thong_bao` đã nằm trong n8n allowlist nhưng repo không có SQL procedure nguồn tương ứng. Không có bằng chứng source để bảo đảm procedure hiện tại phân trang, phân scope đúng hoặc lưu trạng thái đọc theo từng người.
- Chưa có bất kỳ file `sql/*NOTI*` hoặc `scripts/*noti*` nào.
- `sw.js` chưa có `push` và `notificationclick`.
- [auth.service.js](../src/js/services/auth.service.js) có sẵn `updateFirebaseToken()`, nhưng chưa có code xin quyền, tạo token và gọi hàm này; hàm cũng đang đọc `user.username` thay vì contract chính `UserName`.
- Chưa có UI hoặc API quản trị cho `DRAFT -> APPROVED -> WITHDRAWN`.

### 3.3. Kết quả kiểm tra runtime

- Kiểm tra tĩnh n8n bằng `node n8n-system/bootstrap_n8n.js --check`: **PASS**, manifest có `14` workflow, `4` credential và `12` webhook hợp lệ.
- `workflow-manifest.json` có đủ toàn bộ file workflow được khai báo; không thiếu workflow con.
- Tại thời điểm rà soát, web `:3000` và n8n `:5678` không lắng nghe. Endpoint UAT đã cấu hình cũng không kết nối được từ môi trường hiện tại, vì vậy chưa thể xác nhận `@thong_bao` runtime đang ánh xạ tới procedure nào hoặc schema thật của dữ liệu cũ.
- Do chưa có bằng chứng runtime, không được xem endpoint thông báo cũ là nguồn dữ liệu đủ an toàn để giữ nguyên.

## 4. Kiến Trúc Mục Tiêu

```text
Frontend/PWA
   |
   | Http.post('/webhook/api-execute', { ApiCode, params })
   | Bearer token; không gửi UserName
   v
Express /api/gateway (giữ nguyên)
   |
   | Authorization + x-api-key nội bộ
   v
n8n API_Execute + Shared_Auth_Guard (tái sử dụng)
   |
   | API_UserInfo -> verified @Username/@User
   | capability allowlist + validation + audit
   v
NOTI SQL procedures mới
   |
   | Shadow tables + scope Branch/UserGroup/User/UTC
   | read log riêng theo user
   v
Web UI; Push Dispatcher là giai đoạn riêng
```

Nguồn sự thật của việc ai được nhận thông báo nằm tại Shadow SQL. Web Push chỉ là một kênh phân phối bổ sung và không được tự quyết định người nhận.

Phương án này tránh tạo thêm endpoint Express, tránh viết lại cơ chế xác thực và tận dụng được bootstrap n8n hiện có. Endpoint trực tiếp `/api/API_ThongBao` chỉ giữ trong giai đoạn chuyển tiếp và phải bỏ khỏi frontend sau khi `@thong_bao` mới được nghiệm thu.

## 5. Thiết Kế Dữ Liệu Shadow SQL

### 5.1. `AI_NotificationTbl`

| Cột | Kiểu đề xuất | Ràng buộc |
|---|---|---|
| `NotificationID` | `bigint IDENTITY` | PK |
| `Title` | `nvarchar(250)` | NOT NULL |
| `Body` | `nvarchar(max)` | NOT NULL |
| `Summary` | `nvarchar(500)` | NULL |
| `NotificationType` | `varchar(30)` | `ANNOUNCEMENT`, `POLICY`, `URGENT`, `SYSTEM` |
| `Priority` | `tinyint` | 1-100; số nhỏ ưu tiên cao |
| `ActionUrl` | `nvarchar(500)` | NULL; chỉ cho phép relative URL nội bộ |
| `EffectiveFromUtc` | `datetime2(0)` | NOT NULL |
| `EffectiveToUtc` | `datetime2(0)` | NULL; NULL là không hết hạn |
| `BranchScopeMode` | `varchar(10)` | `ALL` hoặc `SELECTED` |
| `UserGroupScopeMode` | `varchar(10)` | `ALL` hoặc `SELECTED` |
| `UserScopeMode` | `varchar(10)` | `ALL` hoặc `SELECTED` |
| `Status` | `varchar(15)` | `DRAFT`, `APPROVED`, `WITHDRAWN` |
| `ContentVersion` | `int` | Mặc định 1 |
| `CreatedAtUtc`, `UpdatedAtUtc` | `datetime2(0)` | NOT NULL |
| `CreatedBy`, `UpdatedBy` | `varchar(100)` | NOT NULL |
| `ApprovedAtUtc`, `WithdrawnAtUtc` | `datetime2(0)` | NULL |
| `ApprovedBy`, `WithdrawnBy` | `varchar(100)` | NULL |

Ràng buộc bổ sung:

- `EffectiveToUtc IS NULL OR EffectiveToUtc > EffectiveFromUtc`.
- Chỉ cho phép `APPROVED` khi có `ApprovedAtUtc` và `ApprovedBy`.
- `ActionUrl` không được là URL ngoài nếu chưa có allowlist domain.
- Tạo index trên `(Status, EffectiveFromUtc, EffectiveToUtc, Priority)`.
- Dùng `CHECK CONSTRAINT` cho `Status`, `NotificationType`, các cột scope mode và `Priority`.

### 5.2. Các bảng phạm vi

```text
AI_NotificationBranchScopeTbl
  NotificationID bigint FK
  BranchID varchar(50)
  PK (NotificationID, BranchID)

AI_NotificationUserGroupScopeTbl
  NotificationID bigint FK
  UserGroupID varchar(50)
  PK (NotificationID, UserGroupID)

AI_NotificationUserScopeTbl
  NotificationID bigint FK
  UserName varchar(100)
  PK (NotificationID, UserName)
```

Quy tắc `SELECTED`: phải tồn tại ít nhất một dòng tương ứng trong bảng scope. Nếu không có, thông báo không được phê duyệt.

### 5.3. `AI_NotificationReadLogTbl`

```text
NotificationID bigint FK
UserName varchar(100)
ReadAtUtc datetime2(0)
FirstRequestID varchar(100) NULL
LastRequestID varchar(100) NULL
PK (NotificationID, UserName)
```

Mark-read phải idempotent: gọi lại không tạo dòng trùng và không thay đổi `ReadAtUtc` đầu tiên.

### 5.4. `AI_NotificationAuditLogTbl`

Lưu các sự kiện `CREATE`, `UPDATE`, `APPROVE`, `WITHDRAW`, `PUSH_DISPATCH` với actor, thời gian UTC, request ID và version. Không lưu secret hoặc push token trong payload audit.

### 5.5. `AI_NotificationPushSubscriptionTbl`

| Cột | Ý nghĩa |
|---|---|
| `SubscriptionID` | PK |
| `UserName` | Tài khoản đã xác minh |
| `EndpointHash` | Hash chống trùng, không dùng làm secret |
| `EndpointEncrypted` | Push endpoint được mã hóa at-rest |
| `P256dhEncrypted`, `AuthEncrypted` | Khóa thiết bị được mã hóa |
| `Platform` | `ANDROID`, `IOS`, `DESKTOP` |
| `CreatedAtUtc`, `LastSeenAtUtc` | Vòng đời thiết bị |
| `RevokedAtUtc` | NULL nếu còn hiệu lực |

Mỗi subscription phải gắn với danh tính server đã xác minh. Khi logout chỉ thu hồi subscription của thiết bị hoặc phiên hiện tại, không xóa subscription của thiết bị khác.

## 6. Thuật Toán Phân Phối

Function đề xuất: `dbo.AI_ActiveNotificationByUserFnc(@Username, @AsOfUtc)`. Tên tham số `@Username` được giữ để khớp cơ chế tự gắn danh tính hiện có của `API_Execute`; ý nghĩa của nó vẫn là danh tính đã được server xác minh.

1. Đọc `BranchID`, `UserGroupID` từ `SY_User` với `Disable = 0`.
2. Lọc `Status = 'APPROVED'`.
3. Lọc `EffectiveFromUtc <= @AsOfUtc`.
4. Lọc `EffectiveToUtc IS NULL OR @AsOfUtc < EffectiveToUtc`.
5. Kiểm tra từng trục scope:
   - `ALL`: chấp nhận trục đó.
   - `SELECTED`: phải có dòng khớp trong bảng scope.
   - Giá trị khác: loại bỏ.
6. `LEFT JOIN AI_NotificationReadLogTbl` theo cả `NotificationID` và `UserName`.
7. Sắp xếp `Priority ASC, EffectiveFromUtc DESC, NotificationID DESC`.

Tất cả mốc thời gian được lưu và so sánh bằng UTC. Frontend chỉ chuyển đổi sang giờ địa phương để hiển thị.

## 7. API Contract

### 7.1. Kênh gọi được chọn

Frontend tiếp tục dùng `Http`, nhưng gọi workflow nội bộ hiện có qua tunnel. Khối dưới đây mô tả payload logic sau khi `Http` đóng gói; frontend không tự tạo envelope này:

```http
POST /api/gateway
Authorization: Bearer <token>

{
  "method": "POST",
  "endpoint": "/webhook/api-execute",
  "body": {
    "ApiCode": "@thong_bao",
    "params": {
      "@Action": "LIST",
      "@Page": 1,
      "@PageSize": 20,
      "@UnreadOnly": 0
    }
  }
}
```

Phần mã hóa tunnel do `Http` thực hiện tự động. Frontend thực tế chỉ cần gọi:

```js
Http.post('/webhook/api-execute', {
  ApiCode: '@thong_bao',
  params: { '@Action': 'LIST', '@Page': 1, '@PageSize': 20, '@UnreadOnly': 0 }
});
```

Khi qua `Http`, request ngoài thực tế vẫn là `POST /api/gateway`; gateway mới chuyển tiếp đến `/webhook/api-execute`. Không gửi `@User`, `@Username`, `User` hoặc `UserName`. `API_Execute` tự gắn danh tính đã xác minh.

### 7.2. Hành động danh sách

```http
ApiCode: @thong_bao
@Action: LIST
@Page: 1
@PageSize: 20
@UnreadOnly: 0
```

Không nhận `User` hoặc `UserName` từ client. Giới hạn `pageSize <= 100`.

```json
{
  "success": true,
  "code": "OK",
  "data": [
    {
      "notificationId": 101,
      "title": "Chính sách bán hàng mới",
      "summary": "Áp dụng từ ngày 15/08",
      "body": "Nội dung đã được phép hiển thị",
      "notificationType": "POLICY",
      "priority": 10,
      "actionUrl": "/#/notifications/101",
      "effectiveFromUtc": "2026-08-15T00:00:00Z",
      "effectiveToUtc": null,
      "isView": false,
      "readAtUtc": null
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1,
  "unreadCount": 1,
  "requestId": "req-..."
}
```

### 7.3. Hành động unread count

```http
ApiCode: @thong_bao
@Action: UNREAD_COUNT
```

Endpoint này chỉ trả số đếm, dùng cho badge header và polling nhẹ.

### 7.4. Hành động xem chi tiết

```http
ApiCode: @thong_bao
@Action: DETAIL
@NotificationID: 101
```

Trả `404 NOT_FOUND` nếu thông báo không tồn tại hoặc tài khoản không nằm trong phạm vi. Không trả `403` để tránh làm lộ sự tồn tại của thông báo ngoài scope.

### 7.5. Hành động đánh dấu đã đọc

```http
ApiCode: @thong_bao
@Action: MARK_READ
@NotificationID: 101
Idempotency-Key: <uuid>
```

```json
{
  "success": true,
  "code": "OK",
  "data": {
    "notificationId": 101,
    "isView": true,
    "readAtUtc": "2026-08-14T06:30:00Z"
  },
  "requestId": "req-..."
}
```

`MARK_READ` là mutation. Khi triển khai phải bổ sung capability `notifications.read.write` và idempotency cho riêng action này trong `API_Execute`; không được coi toàn bộ `@thong_bao` là read-only chỉ vì cùng một ApiCode.

### 7.6. Push subscription

```http
ApiCode: @thong_bao
@Action: PUSH_SUBSCRIBE | PUSH_UNSUBSCRIBE
```

Workflow tự gắn `@Username` đã xác minh. Payload endpoint/key phải giới hạn kích thước, kiểm tra HTTPS và mã hóa trước khi lưu.

### 7.7. Tương thích endpoint cũ

`/api/API_ThongBao` hiện chỉ được xem là endpoint legacy. Không mở rộng endpoint này cho feature mới khi chưa có source backend tương ứng. Sau khi `@thong_bao` mới đạt UAT, frontend bỏ endpoint legacy; dữ liệu cũ chỉ được migrate nếu xác minh được schema và chủ sở hữu.

## 8. Luồng Quản Trị Và Phê Duyệt

1. Người có quyền `notifications.create` tạo bản nháp `DRAFT`.
2. Hệ thống kiểm tra thời gian, nội dung và tất cả scope `SELECTED`.
3. Người có quyền `notifications.approve`, khác người tạo nếu chính sách yêu cầu, chuyển sang `APPROVED`.
4. Sau khi phê duyệt, nội dung và scope của version đó không được sửa ngầm. Sửa nội dung phải tăng `ContentVersion` và phê duyệt lại.
5. Người có quyền `notifications.withdraw` thu hồi thông báo và ghi audit đầy đủ.
6. Push dispatcher chỉ lấy thông báo `APPROVED` đang hiệu lực và người nhận từ cùng function phân phối.

## 9. Trải Nghiệm Giao Diện

### 9.1. Danh sách

- Hiển thị phân trang, trạng thái chưa đọc, loại, mức ưu tiên và thời gian.
- Click một dòng mở modal chi tiết; chỉ mark-read sau khi nội dung chi tiết tải thành công.
- Sau mark-read, cập nhật row và badge mà không reload toàn trang.
- Không chèn HTML trực tiếp từ `Title`, `Summary`, `Body`; render bằng text hoặc sanitizer đã duyệt.

### 9.2. Thông báo khẩn

- Dashboard gọi danh sách với `unreadOnly=true` và chỉ chọn `Priority <= 10`.
- Mỗi notification/version chỉ tự động mở một lần trong phiên; đóng modal không đồng nghĩa đã đọc.
- Nút `Tôi đã hiểu` thực hiện mark-read. Nút `Xem chi tiết` mở nội dung đầy đủ.
- Không dùng hiệu ứng nhấp nháy gây khó chịu; tôn trọng `prefers-reduced-motion`.

### 9.3. Banner Dashboard

- Chỉ hiển thị thông báo đang hiệu lực và có loại phù hợp với banner.
- Có nút đóng trong phiên, nhưng đóng banner không tự động mark-read.
- Nội dung dài phải xuống dòng và không che các control trên mobile.

## 10. Web Push

Web Push là giai đoạn sau khi API danh sách và phân quyền đã đạt nghiệm thu.

1. Đăng ký Service Worker và yêu cầu quyền sau một thao tác rõ ràng của người dùng.
2. Lưu subscription theo tài khoản đã xác minh và từng thiết bị.
3. Thêm `push` và `notificationclick` listener trong `sw.js`.
4. Push payload chỉ chứa ID, title ngắn, summary ngắn và relative action URL. Client phải gọi API chi tiết để xác minh lại scope.
5. Thu hồi subscription khi push provider trả `404/410`.
6. Giới hạn retry và ghi kết quả dispatch vào audit.
7. iOS chỉ hỗ trợ Web Push cho web app đã Add to Home Screen từ iOS/iPadOS 16.4+.

Không commit FCM/VAPID private key vào Git. Secret phải nằm trong `.env` hoặc secret manager của server.

## 11. Ma Trận Nghiệm Thu

| Mã | Kịch bản | Kết quả mong đợi |
|---|---|---|
| `TC-NOTI-01` | User đúng chi nhánh được chọn | Nhận thông báo |
| `TC-NOTI-02` | User đúng nhóm được chọn | Nhận thông báo |
| `TC-NOTI-03` | User được chỉ định đích danh | Chỉ user đó nhận |
| `TC-NOTI-04` | User A mark-read thông báo chung | A đã đọc, User B vẫn chưa đọc |
| `TC-NOTI-05` | User khác chi nhánh | Không nhận |
| `TC-NOTI-06` | User khác nhóm | Không nhận |
| `TC-NOTI-07` | User khác tài khoản đích danh | Không nhận |
| `TC-NOTI-08` | `EffectiveFromUtc` trong tương lai | Không nhận |
| `TC-NOTI-09` | Đã qua `EffectiveToUtc` | Không nhận |
| `TC-NOTI-10` | `DRAFT` hoặc `WITHDRAWN` | Không nhận |
| `TC-NOTI-11` | User `Disable = 1` | Fail-closed |
| `TC-NOTI-12` | Sửa query `UserName` thành tài khoản khác | Kết quả vẫn thuộc user trong token |
| `TC-NOTI-13` | Gọi chi tiết notification ngoài scope | `404 NOT_FOUND`, không lộ nội dung |
| `TC-NOTI-14` | Gọi mark-read nhiều lần | Một read-log, giữ `ReadAtUtc` đầu tiên |
| `TC-NOTI-15` | Scope `SELECTED` rỗng | Không cho phép approve |
| `TC-NOTI-16` | `EffectiveToUtc <= EffectiveFromUtc` | Validation error |
| `TC-NOTI-17` | Body có script/HTML nguy hiểm | Hiển thị như text, không thực thi |
| `TC-NOTI-18` | Hai request đồng thời mark-read | Không trùng PK, kết quả nhất quán |
| `TC-NOTI-19` | Push token hết hạn | Thu hồi subscription, không retry vô hạn |
| `TC-NOTI-20` | Logout trên một thiết bị | Thu hồi đúng subscription của thiết bị đó |

`TC-NOTI-01` đến `TC-NOTI-18` thuộc lõi SQL/API/UI. `TC-NOTI-19` và `TC-NOTI-20` chỉ chạy khi triển khai giai đoạn Web Push; không được tuyên bố `20/20` ở giai đoạn lõi.

## 12. Danh Mục File Triển Khai

### 12.1. File mới bắt buộc cho lõi NOTI-001

| File mới | Trách nhiệm đầy đủ | Lý do phải tạo mới |
|---|---|---|
| `sql/NOTI-001_Notification_Schema_AI.sql` | Tạo `AI_NotificationTbl`, ba bảng scope, read-log, audit, constraint, index và khóa ngoại. Script lặp lại an toàn, không sửa bảng ERP | Repo chưa có nơi lưu lifecycle và trạng thái đọc riêng từng user |
| `sql/NOTI-001_Notification_Distribution_AI.sql` | Tạo `AI_ActiveNotificationByUserFnc(@Username,@AsOfUtc)`, `API_ThongBao_AI` cho list/detail/mark-read và procedure nhẹ `API_ThongBao_UnreadCount_AI` cho badge; fail-closed theo `SY_User` | Procedure legacy không có source trong repo, không thể nâng cấp có kiểm soát |
| `sql/NOTI-001_Notification_Admin_AI.sql` | Tạo procedure create/update draft, approve và withdraw; kiểm quyền, scope rỗng, version và audit | Không có luồng quản trị hiện hữu để tái sử dụng |
| `scripts/preflight_noti001_distribution.js` | Static check object bắt buộc, constraint, không mutation ERP, n8n mapping và frontend không gửi identity | Theo mẫu preflight PROMO/RAG hiện có nhưng contract NOTI là mới |
| `scripts/deploy_noti001_schema.js` | Đọc `.env`/`.env.uat.local`, khóa đúng DB `medtest`, chạy ba SQL file trong transaction; chỉ commit khi có `--apply`; xuất hash/object evidence | Cần đường deploy lặp lại và có kiểm soát |
| `scripts/verify_noti001_uat_rollback.js` | Tạo fixture cô lập, chạy `TC-NOTI-01` đến `TC-NOTI-18`, luôn rollback và xác nhận `remainingFixtures=0` | Preflight tĩnh không chứng minh được phân phối đúng người |

Không tạo `notification.service.js`, middleware Express riêng hoặc workflow n8n mới ở giai đoạn lõi vì `Http`, `/api/gateway`, `Shared_Auth_Guard` và `API_Execute` đã đáp ứng đúng vai trò đó.

### 12.2. File hiện có cần sửa

| File sửa | Nội dung thay đổi | Phần được giữ lại |
|---|---|---|
| `n8n/API_Services/API_Execute.json` | Phân quyền theo `@Action`; validate `@Page`, `@PageSize`, `@NotificationID`; yêu cầu idempotency/capability cho `MARK_READ`; giữ `@Username` server-owned | Auth guard, execute SQL theo metadata, response envelope và audit |
| `sql/Bootstrap_API_Metadata_Auto_AI.sql` hoặc migration metadata riêng | Ánh xạ `@thong_bao -> API_ThongBao_AI`, khai báo field/action và contract version | Hệ metadata `API_Definition`, `API_Action`, `API_Field` |
| `env.js` | Giữ endpoint list legacy trong giai đoạn chuyển tiếp và thêm `UNREAD_COUNT: '/api/API_ThongBao_UnreadCount_AI'`; bỏ endpoint legacy sau cutover đầy đủ | `API_CONFIG` hiện hữu |
| `src/js/pages/notifications.js` | Bỏ đọc/gửi `UserName`; dùng `Http.post`; thêm pagination, detail, mark-read, normalize response và escape text | Skeleton, empty state và `_timeAgo()` |
| `src/templates/notifications.html` | Thêm toolbar lọc, pagination, modal chi tiết accessible và live status | Header, danh sách, skeleton và empty state |
| `src/css/pages/notifications.css` | Thêm style list tương tác, modal, pagination, mobile/dark mode/focus | Style danh sách hiện có |
| `src/js/pages/home.js` | `loadNotificationCount()` dùng action `UNREAD_COUNT`; thêm truy vấn urgent; bỏ cập nhật `#hero-notif-badge` không tồn tại | Lifecycle `loadAll()` và badge header |
| `src/js/core/router.js` | `_updateNotificationBadgeGlobal()` dùng action `UNREAD_COUNT`, không tải list và không gửi identity | Route, chuông và navigation |
| `scripts/build.js` | Không sửa logic; chạy lại để sinh `src/js/dist`, `src/css/dist`, `index.html` và version cache | Toàn bộ bundler hiện tại |
| `n8n/workflow-manifest.json` | Không cần thêm workflow ID nếu chỉ sửa `API_Execute`; bootstrap tự nhận hash mới và import lại workflow cùng ID | Cơ chế portable bootstrap |

### 12.3. File mới chỉ tạo khi bật Web Push

| File mới | Trách nhiệm |
|---|---|
| `sql/NOTI-001_Notification_Push_AI.sql` | Bảng subscription mã hóa, subscribe/unsubscribe, lấy batch dispatch và revoke |
| `src/js/services/notification-push.service.js` | Xin quyền theo thao tác người dùng, tạo subscription từ VAPID public key và gọi API đăng ký/thu hồi |
| `scripts/dispatch_noti001_push.js` | Worker server-side dùng thư viện Web Push, giới hạn retry, xử lý `404/410` và audit |
| `scripts/verify_noti001_push.js` | Chạy `TC-NOTI-19`, `TC-NOTI-20` và kiểm tra payload không chứa nội dung nhạy cảm |

Các file hiện có cần sửa khi bật Push: `sw.js`, `src/pwa/pwa-register.js`, `auth.service.js`, `.env.example`, `package.json` và `package-lock.json`. `AI_NotificationPushSubscriptionTbl` nên chuyển sang file Push này để giai đoạn lõi không mang theo schema chưa vận hành.

## 13. Lộ Trình Triển Khai

### Trạng thái code sau rà soát

- Đã chuyển `env.js` và trang thông báo sang `/api/API_ThongBao_AI`; endpoint legacy chỉ còn trong gateway để giữ tương thích tạm thời.
- Đã tận dụng `Http`, router, skeleton, badge và build pipeline hiện có; không tạo service frontend hoặc workflow n8n mới.
- `notifications.js` đã bỏ identity từ `localStorage`, có phân trang, lọc chưa đọc, detail, mark-read idempotent và render body bằng text.
- `home.js` đã có popup tin khẩn tối đa một lần cho mỗi notification/version trong phiên.
- Gateway tự xác minh token, ghi đè `User/Username` và yêu cầu `Idempotency-Key` cho `MARK_READ`.
- Preflight tĩnh đạt `28/28`; build production chạy thành công.
- Chưa thể compile/UAT SQL thật vì thiếu `TEST_DB_SERVER`, `TEST_DB_DATABASE`, `TEST_DB_USER`, `TEST_DB_PASSWORD`.
- Đã bổ sung procedure admin lifecycle, migration metadata tách biệt, storage Web Push mã hóa, Service Worker push/click và dispatcher chuẩn `web-push`.
- Phần Web Push chỉ kích hoạt khi máy chủ được cấp VAPID key và subscription hợp lệ; secret không nằm trong source code.
- `npm audit` sau khi cập nhật các bản vá tương thích còn `3` cảnh báo từ dependency cũ (`exceljs/uuid` và `xlsx`); không dùng `--force` vì sẽ hạ major `exceljs`, còn `xlsx` chưa có bản vá trên npm registry.

Lệnh vận hành sau khi điền `.env`:

```powershell
npm run noti:preflight
npm run noti:deploy
npm run noti:uat
npm run noti:deploy:apply
```

Chỉ dùng `npm run noti:deploy:metadata` khi database đích có bảng metadata `API_Definition` đúng contract; migration sẽ fail-closed nếu schema không tương thích.

### Giai đoạn 1 - SQL và bảo mật API

- Tạo migration cho các bảng Shadow, constraint và index.
- Tạo `AI_ActiveNotificationByUserFnc`.
- Tạo procedure list, count, detail, mark-read và admin lifecycle.
- Ánh xạ `@thong_bao` vào procedure mới và mở rộng `API_Execute`; tiếp tục dùng server-owned identity hiện có.
- Viết preflight và test rollback cho `TC-NOTI-01` đến `TC-NOTI-18`.

### Giai đoạn 2 - Web UI

- Chuyển frontend sang API contract mới, bỏ gửi `UserName`.
- Thêm phân trang, modal chi tiết, mark-read và endpoint badge count.
- Thêm urgent modal và Dashboard banner.
- Kiểm thử responsive, XSS, keyboard/focus và reduced motion.

### Giai đoạn 3 - Web Push

- Tạo push subscription API và storage mã hóa.
- Bổ sung Service Worker push/click handler.
- Triển khai dispatcher, retry có giới hạn, revoke token và audit.
- Nghiệm thu Android Chrome và iOS PWA 16.4+.

## 14. Điều Kiện Hoàn Thành

NOTI-001 chỉ được đánh dấu `DONE` khi:

- Tất cả API dùng danh tính do server xác minh.
- Không thể đọc hoặc mark-read thông báo của user khác bằng cách sửa request.
- Migration có rollback và không sửa bảng ERP gốc.
- Toàn bộ test bắt buộc của giai đoạn tương ứng đạt.
- UI không overlap trên mobile/desktop và không thực thi HTML từ nội dung thông báo.
- Secret push/encryption không nằm trong Git hoặc log.
- Tài liệu vận hành mô tả cách tạo, phê duyệt, thu hồi và xử lý push token lỗi.

---

Tài liệu này là đặc tả kỹ thuật của NOTI-001. Trạng thái hiện tại vẫn là chưa triển khai; các thành phần trong lộ trình không được xem là đã có cho đến khi code, migration và bằng chứng kiểm thử được commit.
