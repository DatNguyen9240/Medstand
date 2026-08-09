# UAT-022 — Tổng hợp lỗi và phân loại P0/P1/P2

**Ngày chốt:** 09/08/2026  
**Môi trường:** frontend UAT, gateway local, n8n local, DB `medtest`  
**Phạm vi:** Giai đoạn 0; không coi các báo cáo lịch sử trước 01/08 là trạng thái hiện hành nếu đã có bằng chứng mới hơn.

## Kết luận

- `UAT-005` đã đóng: secret quản trị được xoay, không còn hard-code, workflow/runtime dùng `ADMIN_UPLOAD_KEY` và fail-closed.
- `UAT-018` đã đóng: đơn `DMB0826/8` có đúng một header/detail và audit đủ create/replay.
- Không còn lỗi P0 chưa được định danh hoặc chỉ mô tả bằng câu “không chạy”.
- `UAT-004` được chủ dự án chấp nhận đóng gate local ngày 09/08; việc import/publish và đối chiếu workflow active sẽ thực hiện trực tiếp trên n8n server khi deploy.

## Bảng phân loại hiện hành

| ID | Mức | Trạng thái | Phạm vi/tài khoản | Kết quả thực tế và bằng chứng | Kết quả mong đợi / hành động |
|---|---|---|---|---|---|
| `UAT-004` | P0 | `DONE_ACCEPTED_SERVER_DEPLOY` | n8n runtime | `intent-parser` và `api-list-active` từng có workflow active trùng. Chủ dự án chấp nhận không dùng trạng thái local làm gate vì server deploy cần import/publish lại. | Khi deploy server, mỗi webhook path chỉ có một workflow active; export runtime và chạy `verify_n8n_runtime.js` để xác nhận không còn trùng. |
| `UAT-005` | P0 | `CLOSED` | upload/admin workflow | Gateway + workflow đọc secret env, runtime export không chứa khóa cũ; health `200`; static và gateway test PASS. | Không còn secret dùng được trong source; thiếu env phải fail-closed. |
| `UAT-018` | P0 | `CLOSED` | `QLBH013.MED` | `DMB0826/8`; create request `req-f06ec849-663e-40db-b8c5-3b4e0a06d00e`, replay request `req-7da6ece8-c6d2-4137-9ba5-32b419346fa0`; một header + một detail, tổng `750.000`, audit create/replay. | Retry cùng key trả cùng mã và không tạo bản ghi thứ hai. |
| `RV-P1-02` / `FIX-001` | P1 | `OPEN` | panel lập đơn | Audit source cho thấy panel có thể tải toàn bộ khách trong scope khi mở; tài khoản lớn nhất tới 11.571 khách. | Đo Network; nếu xác nhận, chỉ gọi khi nhập ≥2 ký tự và giới hạn kết quả phía server/client. |
| `RV-P1-03` / `FIX-002` | P1 | `BLOCKED_SCOPE_LOCK` | tạo khách → lập đơn | Cache khách trong panel không TTL/invalidation theo audit 07/08. Chưa tái kiểm runtime vì chạm luồng tạo khách đang khóa. | Xin phê duyệt riêng; khách mới phải tìm được trong cùng phiên không cần F5. |
| `RV-P1-05` | P1 | `OPEN_REVALIDATION` | cache mention theo tài khoản | TTL mention 24 giờ; chưa có bằng chứng đổi user có xóa cache hay không. | Test hai tài khoản khác vùng; không được hiện thực thể ngoài scope. Nếu rò rỉ, nâng P0. |
| `TEST-004` | P1 | `OPEN` | bộ test scope | UAT-007 từng PASS giả vì thiếu assertion phủ định; `TRUNGBM/NVVP003` ngoài cohort vẫn có scope toàn bộ và cần business xác nhận. | Mọi test scope có assertion “không thấy 100% dữ liệu”; chốt phạm vi thật của `TRUNGBM`. |
| `RV-P2-01..05` | P2 | `OPEN_UX` | giao diện | Quick action/token kỹ thuật, bảo toàn composer, email `@`, field kỹ thuật và visual acceptance CORE-007/008 chưa nghiệm thu đầy đủ. | Xử lý sau P0/P1; lưu ảnh nghiệm thu cho các mục visual. |

## Các lỗi lịch sử đã loại khỏi danh sách mở

- Lộ thư mục `reports/` và source thô: gateway hiện chặn các thư mục nhạy cảm và JavaScript source chưa minify.
- Service worker cache `/api/` theo tài khoản: hiện mọi request `/api/` dùng network-only.
- Gateway mất `requestId`/sai envelope: gateway và client hiện giữ `requestId`, lỗi gateway trả envelope chuẩn.
- Rule nghiệp vụ ở trạng thái draft: tier, tồn và gợi ý hiện dùng các version `APPROVED` đã ghi trong backlog.
- Regression cũ lỗi 502/422: bộ runtime 01/08 đạt static `159/159`, smoke `8/8`, live `31/31`.

## Điều kiện chuyển UAT-023

UAT-022 hoàn tất việc phân loại. Ngày 09/08, chủ dự án đã chấp nhận rủi ro môi trường của `UAT-004` và chuyển việc đối chiếu workflow sang checklist deploy server; vì vậy UAT-004 không còn chặn Giai đoạn 0.
