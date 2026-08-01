# UAT-023 — Báo cáo runtime mới

Ngày phát hành báo cáo: `01/08/2026`  
Trạng thái: `BLOCKED_RELEASE`  
Release frontend: `11.121`  
Manifest nền: `MEDSTAND-UAT-20260727-11.111-RC3`  
Môi trường: `https://medtest.bms7.net/api/gateway`, DB `medtest`, timezone `Asia/Bangkok (UTC+07:00)`

## Tóm tắt điều hành

Các bài chức năng, hiệu năng, phân quyền, kho và idempotency đều đạt. Chưa công bố `UAT_BASELINE_READY` vì snapshot n8n còn nhiều workflow active trùng webhook và cấu hình `N8N_BASE` local đã drift khỏi endpoint đang phục vụ gateway public.

| Nhóm | Kết quả | Trạng thái |
|---|---:|---|
| Static natural language | 159/159 | PASS |
| Network resilience | 5/5 | PASS |
| Authenticated smoke | 8/8 | PASS |
| Authenticated live regression | 31/31 | PASS |
| Customer scope | 13/13, 0 leak | PASS |
| Warehouse scope | 13/13 | PASS |
| Performance AI | p50 2.058 ms; p95 5.668 ms | PASS theo ngưỡng 6 giây |
| Order idempotency | 2 request đồng thời → 1 header, 1 detail | PASS |
| n8n unique active webhook | 3 webhook path bị trùng active | FAIL/P0 |
| Endpoint/secret review | n8n tunnel local chết; admin key còn fallback | BLOCKED/P1 |

## Bằng chứng mới ngày 01/08/2026

### Runtime public có xác thực

| Suite | Tổng | Pass | p50 | p95 | Max |
|---|---:|---:|---:|---:|---:|
| Smoke | 8 | 8 | 192 ms | 399 ms | 399 ms |
| Live functional | 31 | 31 | 178 ms | 334 ms | 383 ms |

Báo cáo máy đọc:

- `reports/uat023-smoke-2026-08-01.json`
- `reports/uat023-live-2026-08-01.json`
- `reports/uat023-static-2026-08-01.json`
- `reports/uat023-resilience-2026-08-01.json`

Token chỉ được đặt tạm trong environment của tiến trình kiểm tra và đã bị xóa sau khi chạy; report không chứa token hoặc response nghiệp vụ.

### Mutation/idempotency

- Document ID: `UAT21-260801145955-9CA2`.
- Hai request đồng thời cùng payload: một response “Tạo đơn hàng thành công”, một response “Đơn hàng đã được tạo trước đó”.
- Database: `HeaderCount=1`, `DetailCount=1`, `DuplicateDetailGroups=0`, header/detail total cùng `95.000`.
- Gửi lại cùng ID nhưng đổi quantity: bị từ chối; dữ liệu cũ không thay đổi.

### Runtime n8n

Snapshot SQLite cập nhật cuối 31/07/2026 xác nhận:

- Hai workflow active cho `intent-parser`.
- Hai workflow active cho `hook-ai-dainao`; logic V5 và V6 khác hash.
- Hai workflow active cho `api-list-active`.

Đây là vi phạm cấu trúc dù bộ live hiện tại đạt 31/31; lần định tuyến kế tiếp vẫn không được đảm bảo vào đúng bản theo manifest.

## Tổng trạng thái UAT-001 → UAT-024

- Hoàn thành/đủ bằng chứng: 22 task.
- Còn mở: `UAT-004`, `UAT-005`.
- P0 còn mở: 1 (`workflow active trùng`).
- P1 còn mở: 2 (`N8N_BASE`, secret fallback).

## Điều kiện đổi sang UAT_BASELINE_READY

1. Deactivate ba workflow trùng nêu trong UAT-022.
2. Export runtime mới và chạy `node scripts/verify_n8n_runtime.js <export>` đạt exit code 0.
3. Chốt hostname n8n UAT ổn định và cập nhật environment.
4. Chạy lại smoke 8 ca sau khi restart/publish; không cần chạy lại mutation nếu SQL không đổi.
