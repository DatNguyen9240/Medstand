# UAT-023 — Báo cáo runtime hiện hành

**Ngày phát hành:** 09/08/2026  
**Thời điểm chốt:** 11:33 UTC+07:00  
**Môi trường:** frontend UAT, gateway `https://medtest.bms7.net/api/gateway`, DB `medtest`, n8n local/UAT  
**Source snapshot:** Git `db52c69fde4e632781f3411043bf5ec099032162`; worktree có thay đổi chưa commit  
**Frontend source version:** `11.144`; manifest nguồn gần nhất là `MEDSTAND-UAT-20260727-11.111-RC3`  
**Trạng thái phát hành báo cáo:** `PUBLISHED_WITH_ACCEPTED_SERVER_DEPLOY_ACTION`

## Kết luận phát hành

- Báo cáo runtime mới đã được phát hành sau khi `UAT-018` và `UAT-022` hoàn tất.
- Tổng hợp kiểm tra được đối chiếu: `203 PASS`, `0 FAIL`, `0 BLOCKED`, `1 ACCEPTED_SERVER_DEPLOY_ACTION` trên năm nhóm bằng chứng độc lập.
- Chủ dự án chấp nhận đóng gate local của `UAT-004`; import/publish và đối chiếu workflow active được chuyển thành hành động bắt buộc khi deploy n8n server.
- Bằng chứng hồi quy live gần nhất được lưu ngày 01/08; bằng chứng tạo đơn và cấu hình secret được bổ sung ngày 09/08.
- Source hiện đã lên `11.144`, không còn khớp manifest khóa `11.111`; cần lập manifest/release candidate mới trước lần deploy tiếp theo.

## Tổng hợp pass/fail/blocked

| Nhóm bằng chứng | Ngày chạy | Kết quả | Trạng thái |
|---|---:|---:|---|
| Natural chat static | 01/08/2026 | 159/159 | PASS |
| Network resilience | 01/08/2026 | 5/5 | PASS |
| Gateway live functional | 01/08/2026 | 31/31 | PASS |
| Gateway live smoke | 01/08/2026 | 8/8 | PASS |
| Tạo đơn idempotency/audit (`UAT-018`) | 09/08/2026 | 1/1 | PASS |
| n8n unique active webhook (`UAT-004`) | 09/08/2026 | 0/1 local | ACCEPTED_SERVER_DEPLOY_ACTION |
| **Tổng** |  | **203 PASS / 0 FAIL / 0 BLOCKED / 1 ACCEPTED ACTION** | **PUBLISHED_WITH_ACCEPTED_SERVER_DEPLOY_ACTION** |

`203 PASS` là tổng số ca của năm nhóm kiểm tra đã hoàn tất, không phải số task backlog. Hành động deploy server được đếm riêng và không bị mô tả thành một ca PASS kỹ thuật.

## Bằng chứng runtime

### Bộ hồi quy 01/08/2026

| File | Nội dung | SHA-256 |
|---|---|---|
| `reports/uat023-static-2026-08-01.json` | 159/159, 0 failure, 0 release-gate failure | `DBE94AA97A2F2B7E16BD3EBCD50CD0B4F2BD137C4A526B99659DE6435798FAFC` |
| `reports/uat023-resilience-2026-08-01.json` | 5/5 | `661E34FA43A40E1CA3AD4E5F63DD1369D2E37AC4463E7935A53D5C7715F9EC48` |
| `reports/uat023-live-2026-08-01.json` | 31/31; p95 334 ms; gateway authenticated | `3BEA91A923BDB2300C47087A9936DB9421EEAEE781FBFB90AA0D9B4977FE6E8A` |
| `reports/uat023-smoke-2026-08-01.json` | 8/8; p95 399 ms; gateway authenticated | `B95DF73A4E5547D1FB8A914B267C34759A7E4648C5D49D37B3D4A612F23B20B1` |

### Bằng chứng bổ sung 09/08/2026

- `UAT-005`: gateway và workflow dùng `ADMIN_UPLOAD_KEY`, thiếu env thì fail-closed; n8n và gateway health `200`; runtime export không chứa khóa cũ.
- `UAT-018`: tài khoản `QLBH013.MED` tạo đơn `DMB0826/8`; request create `req-f06ec849-663e-40db-b8c5-3b4e0a06d00e`, replay `req-7da6ece8-c6d2-4137-9ba5-32b419346fa0`; đúng một header/detail và đủ audit create/replay.
- `UAT-022`: lỗi hiện hành đã được phân loại tại `docs/UAT-022_TONG_HOP_LOI_2026-08-09.md`; không còn P0 chưa được định danh.

## Blocker và giới hạn

### Hành động deploy server — `UAT-004`

`intent-parser` và `api-list-active` từng có workflow active trùng. Chủ dự án xác nhận ngày 09/08 rằng khác biệt local không cần làm gate vì n8n server phải được import/publish lại khi deploy. Checklist server vẫn phải bảo đảm mỗi webhook path chỉ có một workflow active, runtime khớp source và `verify_n8n_runtime.js` thoát mã 0.

### Giới hạn bằng chứng

- Không chạy lại toàn bộ live suite ngày 09/08 vì thao tác đó có thể chạm các ca mutation thuộc luồng tạo khách hàng đang bị khóa.
- Báo cáo sử dụng bộ live đã lưu ngày 01/08 và các bằng chứng mới hơn cho `UAT-005`, `UAT-018`, `UAT-022`.
- Worktree hiện không sạch và frontend source version `11.144` chưa có manifest khóa tương ứng; báo cáo này là ảnh chụp runtime/evidence, không phải phê duyệt deploy source hiện tại.

## Quyết định

`UAT-023` hoàn tất nghĩa vụ phát hành báo cáo runtime mới. Chủ dự án đã chấp nhận rủi ro môi trường của `UAT-004`; toàn bộ 24/24 task Giai đoạn 0 hiện đã đóng. Gate `UAT_BASELINE_READY` được chấp nhận với điều kiện checklist import/publish n8n phải chạy lại trên server khi deploy.
