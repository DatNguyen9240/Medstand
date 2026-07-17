# Medstand Chatbot API Remediation — Execution Tracker

> Theo dõi tiến độ triển khai của [kế hoạch sửa Chatbot API](./KE_HOACH_FIX_CHATBOT_API_2026-07-15.md). Đây là tài liệu vận hành được cập nhật trong quá trình thực hiện; kế hoạch gốc chỉ dùng để mô tả phạm vi, thứ tự và tiêu chí kỹ thuật.

## 1. Tổng quan hiện tại

| Chỉ số | Giá trị |
|---|---:|
| Tổng task | 14 |
| `TODO` | 0 |
| `IN_PROGRESS` | 0 |
| `BLOCKED` | 0 |
| `REVIEW` | 0 |
| `DONE` | 14 |
| Tiến độ hoàn tất | 100.0% |

Security Gate và Production Release Gate đã **PASS**. Role-only UAT đạt **46/46** với Manager/TDV thật; production execute/list/config đã publish, smoke thành công và khóa CORS tại `https://medtest.bms79.com`. P1 đã đủ điều kiện để bắt đầu.

## 2. Quy tắc cập nhật

1. Trước khi triển khai, kiểm tra dependency và chỉ chuyển một task đủ điều kiện từ `TODO` sang `IN_PROGRESS`.
2. Khi nhận task, điền `Owner`, thời điểm ISO-8601 có timezone và mục tiêu ngắn vào cột `Evidence / blocker`.
3. Không nhận một task đang có owner ở trạng thái `IN_PROGRESS`. Nếu bàn giao, phải ghi rõ người bàn giao, người nhận và thời điểm.
4. Chuyển sang `REVIEW` khi phần triển khai đã xong nhưng còn thiếu kiểm thử live, UAT, publish production hoặc bằng chứng nghiệm thu.
5. Chỉ chuyển sang `DONE` khi đạt toàn bộ tiêu chí nghiệm thu trong file task và có bằng chứng kiểm thử tương ứng.
6. Chuyển sang `BLOCKED` khi không thể tiếp tục nếu thiếu tài khoản, token, dữ liệu test, domain chính thức hoặc quyết định vận hành.
7. Không ghi token, mật khẩu, API key, payload nhạy cảm hoặc dữ liệu khách hàng vào tracker.
8. Sau mỗi lần đổi trạng thái, cập nhật lại Dashboard. Công thức tiến độ: `DONE / 14 × 100`, làm tròn một chữ số.

Trạng thái hợp lệ: `TODO`, `IN_PROGRESS`, `BLOCKED`, `REVIEW`, `DONE`.

## 3. Release gates

| Gate | Phạm vi | Status | Điều kiện mở gate |
|---|---|---|---|
| `SECURITY` | `P0-00..P0-05` | `DONE` | Role-only UAT 46/46 PASS; production publish và smoke execute/list/config PASS |
| `CONTRACT` | `P1-01..P1-04` | `DONE` | P1-01..P1-04 đã publish; validation-before-SQL, request ID end-to-end và audit privacy-safe đạt UAT |
| `FULL-FEATURE` | `P2-01..P2-04` | `DONE` | P2-04 đạt rollback 3/3, authorized pipeline 2/2, reservation/replay DB, CART double-click 2 submit/1 fetch, HTTP negative và audit |

## 4. Task ledger

| Task | Status | Owner | Started / updated | Môi trường | Evidence / blocker |
|---|---|---|---|---|---|
| `P0-00` Shared Auth Guard | `DONE` | `Codex` | `2026-07-15T21:18:10+07:00` | DEV/local | Workflow `9UxECqxRaPGMF8EM` đã nhận baseline `api.read` từ hồ sơ business đã xác minh; không tự cấp quyền ghi; contract và live mapped path đạt |
| `P0-01` Execute fail-closed | `DONE` | `Codex` | `2026-07-15T22:08:39+07:00` | Production negative path + staging UAT | Thiếu/sai/hết hạn token bị chặn trước SQL; valid-mapped Manager/TDV đạt live; valid-unmapped được khóa bằng contract theo phạm vi UAT đã duyệt |
| `P0-02` Capability và data scope | `DONE` | `Codex` | `2026-07-15T22:28:11+07:00` | Local/UAT/staging/production | Manager/TDV thật nhận baseline `api.read`; mapped path và scope-tampering đạt live; no-scope khóa bằng contract theo phạm vi UAT đã duyệt; capability gate production đã publish |
| `P0-03` Khóa List/Config | `DONE` | `Codex` | `2026-07-15T22:28:11+07:00` | Staging/production | Guest bị chặn 401 trước SQL; Manager/TDV thật gọi list/config HTTP 200; workflow production đã publish và smoke đạt |
| `P0-04` CORS và auth error | `DONE` | `Codex` | `2026-07-15T22:28:11+07:00` | Local/UAT/staging/production | Allowlist production khóa tại `https://medtest.bms79.com`; guest nhận JSON 401 có code/requestId và đúng CORS trên cả ba endpoint |
| `P0-05` Auth regression | `DONE` | `Codex` | `2026-07-15T22:08:39+07:00` | Local contract/UAT | Role-only gate theo phạm vi được duyệt đạt `46/46`, `0` blocked, `0` fail; report live và contract đã được tách riêng |
| `P1-01` Response envelope | `DONE` | `Codex` | `2026-07-15T22:46:13+07:00` | Local/UAT/production | Envelope sáu trường đã publish; UAT 9/9 và production smoke guest/Manager/TDV đạt; thiếu tham số trả 422/count 0/data rỗng; FE đọc `success/code` |
| `P1-02` Metadata contract/version | `DONE` | `Codex` | `2026-07-15T23:01:23+07:00` | DB/UAT/production | 36 API active có version `2026.07.15.1`, 0 thiếu version; checksum/source/type/rule đã publish; ba required field UAT và production 3/3 PASS |
| `P1-03` Validation FE/backend | `DONE` | `Codex` | `2026-07-16T07:47:36+07:00` | Local/UAT/production | FE chặn final-form sai và giữ state để hỏi tiếp; backend validation đứng trước SQL; UAT 4/4 và execution trace chứng minh 3 request sai không chạm SQL, request hợp lệ có chạy SQL; Execute production đã publish và smoke thành công |
| `P1-04` Request ID và audit | `DONE` | `Codex` | `2026-07-16T08:30:00+07:00` | DB/UAT/production | Migration audit đã apply; canonical Execute/List/Config/Shared Auth đã publish; UAT HTTP 6/6 và audit trace 6/6 PASS, request ID khớp body/header, hash correlation/user/idempotency không ghi PII; direct table read bị DENY; local release gate PASS |
| `P2-01` UI matrix 28 lệnh | `DONE` | `Codex` | `2026-07-16T17:08:43+07:00` | Local/UAT/DB | Contract chốt 24 role-visible READ lệnh; 4 lệnh legacy bị policy loại đúng (1 DENY, 3 mutation). Manager/TDV đạt 24/24 execute + renderer mỗi role; sửa hai wrapper khảo sát thiếu và xác nhận 24 READ metadata không còn procedure missing |
| `P2-02` UAT Manager/TDV | `DONE` | `Codex` | `2026-07-16T08:41:05+07:00` | Local/UAT | Hai role chạy session riêng; 1366×768/1920×1080 ở zoom 80/100/125 PASS; tamper EmployeeID/BranchID/Username không đổi 8 dòng scoped baseline ở cả hai role |
| `P2-03` Playwright automation | `DONE` | `Codex` | `2026-07-16T08:41:05+07:00` | Local/UAT | Playwright Guest/Manager/TDV, storage state riêng, HTML/JSON report và trace/video/screenshot-on-fail; final `9 passed, 2 skipped, 0 failed` |
| `P2-04` Mutation và CART sandbox | `DONE` | `Codex` | `2026-07-16T19:39:05+07:00` | Local/UAT/medtest rollback | Reservation/replay đã deploy; DB race PASS; authorized customer/import 2/2 có audit COMMITTED và rollback 0 dòng; order rollback PASS; CART double-click 2 submit chỉ 1 fetch; HTTP negative Manager/TDV 2/2 sau publish |

## 5. Bằng chứng kiểm tra gần nhất

| Hạng mục | Kết quả | Bằng chứng |
|---|---|---|
| P0 contract suite | `PASS` | `npm.cmd run test:p0` |
| Auth regression contract | `PASS` | 40 contract case pass; 4 live placeholder được tách khỏi report UAT |
| Role-only UAT | `PASS` | 46/46 pass, 0 blocked, 0 fail |
| Weekly chart regression | `PASS` | `npm.cmd run test:weekly-chart` |
| Frontend build | `PASS` | `npm.cmd run build` |
| Local release check | `PASS` | `npm.cmd run test:release-local` ngày 2026-07-15 |
| Production Release Gate | `PASS` | Execute/List/Config production active; guest 401 JSON, Manager/TDV 200; legacy Execute trùng đã inactive |
| P1-01 UAT | `PASS` | 9/9: sáu legacy-empty có count khớp data; ba missing-required trả 422 `VALIDATION_ERROR`, count 0 |
| P1-01 production smoke | `PASS` | Guest 401; Manager/TDV validation 422; Manager success 200; đủ envelope và đúng CORS |
| P1-03 validation UAT | `PASS` | 4/4: missing required, TopN vượt giới hạn và sai khoảng ngày trả 422 `VALIDATION_ERROR` không chạy SQL; valid read trả 200 `OK` và chạy SQL |
| P1-03 local release gate | `PASS` | `npm.cmd run test:release-local` ngày 2026-07-16; contract suite, weekly chart và frontend build đều đạt |
| P1-04 request ID/audit UAT | `PASS` | HTTP 6/6 và audit trace 6/6; request ID khớp body/header/audit, correlation/user/idempotency chỉ lưu SHA-256, direct table access bị từ chối |
| P1-04 local release gate | `PASS` | `npm.cmd run test:release-local` ngày 2026-07-16 sau khi publish canonical workflows |
| P2 Playwright UAT | `PASS_WITH_SKIPS` | Hai lượt cô lập: ma trận execute/renderer 2 pass; phần còn lại 9 pass, 2 mutation-sandbox skip, 0 fail; tổng 11 pass/2 skip |
| P2 role/scope UAT | `PASS` | Manager/TDV session riêng; ba tamper field/role trả cùng scoped baseline 8 dòng; 12 tổ hợp viewport/zoom/role PASS |
| P2-01 execute/renderer matrix | `PASS` | Manager 24/24 và TDV 24/24; mỗi evidence có HTTP/code/count/requestId + renderer synthetic, không lưu row nghiệp vụ |
| P2-01 survey wrapper remediation | `PASS` | Deploy `API_KiemTraKhaoSatNgay_AI` và `API_LichSuKhaoSat_AI`; invalid user fail-closed, history date filter hoạt động, BranchID là verified system param; 24/24 READ SP tồn tại |
| P2-04 SQL rollback | `PASS` | `npm.cmd run test:p2-04-mutation-rollback`: customer/promotion/order 3/3 tồn tại trong transaction và còn 0 sentinel sau rollback; invalid identity 3/3 fail-closed |
| P2-04 HTTP/audit negative | `PASS` | Manager/TDV 8/8 HTTP 403 trước SQL; request ID đầy đủ; audit idempotency SHA-256, mutation `NOT_STARTED`, khảo sát `DENY`; `npm.cmd run test:p2-04-audit` PASS |
| P2-04 idempotency DB | `PASS` | `npm.cmd run test:p2-04-idempotency`: `ACQUIRED`, concurrent `IN_PROGRESS`, completed `REPLAY`; outer rollback và reacquire PASS; direct table DELETE vẫn bị DENY |
| P2-04 authorized rollback pipeline | `PASS` | Customer/import 2/2: mutation, audit `COMMITTED`, replay cùng key và rollback cleanup còn 0 dòng; `npm.cmd run test:p2-04-authorized-pipeline` |
| P2-04 CART double-click | `PASS` | Runtime sandbox gọi 2 submit đồng thời với cùng key chỉ phát 1 fetch; `Idempotency-Key` đi qua gateway; `npm.cmd run test:p2-04-cart-idempotency` |
| P2-04 aggregate gate | `PASS` | `npm.cmd run test:p2-04` chạy liên tiếp CART, idempotency DB, mutation rollback, authorized pipeline và audit |

## 6. Việc cần làm tiếp theo

1. Giữ các snapshot prepublish/postpublish để phục vụ rollback và đối chiếu.
2. Khi cấp identity UAT ghi chuyên dụng trong tương lai, chỉ dùng cho smoke có cleanup; không mở quyền ghi cho Manager/TDV hiện tại.
3. Giữ `RUN_MUTATION_TESTS=false` ở môi trường dùng dữ liệu thật; chỉ bật khi có sandbox commit/cleanup riêng.
4. Tiếp tục UI doanh số: đã build renderer chia tab Nhân viên/Khách hàng/Sản phẩm, ẩn cột Số lượng bán ngoài tab Sản phẩm; cần refresh trình duyệt và kiểm tra trực quan sau deploy.
5. Tiếp tục validation `@tim_san_pham_theo_trieu_chung`: local đã khóa Keyword rỗng ở FE, n8n `API_Execute.json` và `API_TraCuuSanPham_AI.sql`; ngày mai re-import/publish workflow n8n và chạy lại SQL trên server.

## 7. Nhật ký cập nhật

| Thời điểm | Người cập nhật | Nội dung |
|---|---|---|
| `2026-07-15T21:00:27+07:00` | `Codex` | Khởi tạo tracker từ trạng thái task và báo cáo kiểm thử hiện có; không thay đổi mã nguồn hoặc workflow |
| `2026-07-15T21:04:23+07:00` | `Codex` | Vá CORS generator để chạy lặp an toàn, loại trường `_corsOrigin` bị trùng, chuyển cấu hình DB test sang biến môi trường và chạy lại local release check thành công |
| `2026-07-15T21:18:10+07:00` | `Codex` | Bổ sung capability baseline chỉ đọc từ hồ sơ đã xác minh, cập nhật Shared Auth Guard trên n8n, lấy token Manager/TDV và smoke execute/list/config đều HTTP 200; local release check PASS |
| `2026-07-15T22:08:39+07:00` | `Codex` | Restart n8n, chạy role-only UAT có scope tampering đạt 46/46; tách report live khỏi contract-only để bằng chứng PASS không bị ghi đè |
| `2026-07-15T22:28:11+07:00` | `Codex` | Publish Execute/List/Config production, khóa CORS tại domain chính thức, tắt workflow Execute trùng cũ; smoke guest 401 và Manager/TDV 200 đạt trên cả ba endpoint; local release check PASS |
| `2026-07-15T22:36:15+07:00` | `Codex` | Nhận P1-01; chuẩn hóa Execute envelope `success/code/message/data/count/requestId`, tách row thông báo trước khi đếm, cập nhật FE đọc `success/code`; contract và local release check PASS |
| `2026-07-15T22:46:13+07:00` | `Codex` | Hoàn tất P1-01: bắt lỗi thiếu parameter trước khi mất tại SQL node, UAT 9/9, publish canonical Execute production và smoke guest/Manager/TDV PASS; local release check PASS |
| `2026-07-16T07:47:36+07:00` | `Codex` | Hoàn tất P1-03: làm mới token Manager UAT, chạy 4/4 HTTP case và đối chiếu execution trace; ba request validation lỗi không chạm `MS SQL Execute`, request hợp lệ có chạy SQL; full local release gate PASS |
| `2026-07-16T08:30:00+07:00` | `Codex` | Hoàn tất P1-04: apply audit migration, publish canonical Shared Auth/Execute/List/Config; HTTP UAT 6/6 và audit trace 6/6 PASS; hash-only correlation/user/idempotency, retention/access control và local release gate đều đạt |
| `2026-07-16T08:41:05+07:00` | `Codex` | Chạy P2 end-to-end: phát hiện và sửa FE không đọc envelope `{records,requestId}`; Playwright final 9 pass/2 mutation skip/0 fail; P2-02/P2-03 DONE, P2-01 REVIEW do drift 24/28, P2-04 BLOCKED vì chưa có sandbox cô lập |
| `2026-07-16T17:08:43+07:00` | `Codex` | Chốt P2-01: 28 legacy = 24 READ role-visible + 1 DENY + 3 mutation; sửa/deploy hai wrapper khảo sát thiếu, sửa runner nhận diện đúng app/port và IPv4 n8n; Manager/TDV mỗi role 24/24 execute+renderer PASS; phần P2 còn lại 9 pass/2 mutation skip |
| `2026-07-16T18:42:52+07:00` | `Codex` | P2-04 safe path: deploy hardening ba procedure mutation; SQL rollback 3/3 còn 0 sentinel; invalid identity 3/3 và HTTP negative Manager/TDV 8/8 PASS; audit lưu đúng DENY/MUTATION và NOT_STARTED. Giữ BLOCKED vì chưa có write-capability identity và idempotency reservation/replay |
| `2026-07-16T19:39:05+07:00` | `Codex` | Hoàn tất P2-04: deploy hash-only reservation/replay; DB race và cleanup rollback PASS; authorized customer/import 2/2 có audit COMMITTED + replay + 0 dòng còn lại; CART runtime 2 submit/1 fetch; HTTP Manager/TDV 2/2 sau publish, release-local và diff-check PASS. Tracker đạt 14/14 |
| `2026-07-16T23:25:31+07:00` | `Codex` | Lưu điểm dừng: UAT read-only toàn bộ 13 account đạt 13/13, 312/312 READ và 52/52 mutation guard; FE doanh số đã bỏ ranking trùng, chia tab nhóm và ẩn Số lượng bán ngoài Sản phẩm; menu phân biệt Hóa đơn/Chi tiết hóa đơn; khóa Keyword rỗng cho tìm thuốc theo triệu chứng ở FE/n8n/SQL. Việc còn lại là re-import/publish n8n, chạy SQL server và smoke trực quan. |
