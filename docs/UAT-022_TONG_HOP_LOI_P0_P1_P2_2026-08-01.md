# UAT-022 — Tổng hợp lỗi và phân loại P0/P1/P2

Ngày tổng hợp: `01/08/2026`  
Môi trường: `https://medtest.bms7.net` → `/api/gateway` → DB `medtest`  
Release frontend quan sát trong repo: `11.121`

## Kết luận

`DONE_WITH_OPEN_BLOCKERS` — mọi lỗi còn mở đều có đầu vào, kết quả thực tế, kết quả mong đợi và bằng chứng cụ thể. Không còn lỗi chỉ được mô tả là “không chạy”.

| Mức | Mở | Đã đóng | Kết luận |
|---|---:|---:|---|
| P0 | 1 | 5 | Chưa được phát hành UAT hoàn tất khi workflow trùng chưa được dọn |
| P1 | 2 | 2 | Phải chốt cấu hình n8n/secret trước production |
| P2 | 1 | 1 | Không chặn test chức năng hiện tại |

## Lỗi còn mở

### UAT22-OPEN-001 — Nhiều workflow cùng active trên một webhook

- Mức: `P0`.
- Account: không phụ thuộc account; ảnh hưởng mọi tài khoản.
- Thời gian xác minh: `01/08/2026`, đọc SQLite runtime snapshot cập nhật cuối `31/07/2026`.
- Input: kiểm kê `workflow_entity` và nhóm các node webhook theo `parameters.path`.
- Thực tế:
  - `intent-parser`: `Gn7nDjDgGUFOWni5` và `ZQPz4sbzz9pqSO8W` cùng active.
  - `hook-ai-dainao`: `mQ2X8ubexBpqD3Ru` và `rLE6h9p7EEvdzfjK` cùng active; hai bản có logic hash khác nhau.
  - `api-list-active`: `FRbuGdI9jz0ZZIvU` và `nqHaht2PiqPj0rcB` cùng active.
- Mong đợi: mỗi webhook có đúng một workflow active và đúng ID trong manifest.
- Bằng chứng: `n8n-system/n8n_data/.n8n/database.sqlite`; [UAT-004_N8N_WORKFLOW_VERIFICATION_2026-07-27.md](UAT-004_N8N_WORKFLOW_VERIFICATION_2026-07-27.md).
- Request ID: không áp dụng — lỗi cấu hình runtime, không phải một request nghiệp vụ.
- Xử lý cần làm: giữ `Gn7nDjDgGUFOWni5`, `mQ2X8ubexBpqD3Ru`, `FRbuGdI9jz0ZZIvU`; deactivate ba bản còn lại, export lại và chạy `scripts/verify_n8n_runtime.js`.

### UAT22-OPEN-002 — N8N_BASE local trỏ tunnel không còn hoạt động

- Mức: `P1`.
- Account: không phụ thuộc account.
- Thời gian xác minh: `01/08/2026`.
- Input: `GET <N8N_BASE>/healthz` với timeout 8 giây.
- Thực tế: kết nối tới tunnel `trycloudflare.com` trong `.env` thất bại; n8n local `127.0.0.1:5678` cũng đang dừng.
- Mong đợi: endpoint n8n UAT chính thức trả health thành công và được quản lý bằng hostname ổn định.
- Bằng chứng: `node scripts/verify_uat5_config.js` trả `SERVER_N8N_TARGET=REVIEW`; kiểm tra endpoint ngày 01/08/2026.
- Request ID: không có vì không thiết lập được kết nối.
- Ghi chú: gateway public vẫn hoạt động và đạt smoke/live; lỗi này là drift cấu hình local/vận hành, không phủ định kết quả gateway public.

### UAT22-OPEN-003 — Admin upload key còn fallback viết cứng

- Mức: `P1` trước production.
- Account: Admin/upload operator.
- Thời gian xác minh: `01/08/2026`.
- Input: static review `server.js` và `AI_Upload_Reader.json`.
- Thực tế: fallback key vẫn tồn tại để tương thích UAT.
- Mong đợi: key chỉ đến từ environment/secret manager; source và workflow export không chứa giá trị dùng được.
- Bằng chứng: [UAT-005_ENDPOINT_SECRET_VERIFICATION_2026-07-27.md](UAT-005_ENDPOINT_SECRET_VERIFICATION_2026-07-27.md).
- Request ID: không áp dụng.

### UAT22-OPEN-004 — Hai workflow API Execute cũ còn tồn tại ở trạng thái inactive

- Mức: `P2`.
- Account: không phụ thuộc account.
- Thời gian xác minh: `01/08/2026`.
- Input: kiểm kê runtime workflow.
- Thực tế: `0xIfgxxondYICsqZ` và `Z7raaV1oe9JkjUXQ` vẫn tồn tại; bản thứ hai có tên mojibake.
- Mong đợi: xóa hoặc đổi tên `[DEPRECATED]` để tránh bật nhầm.
- Bằng chứng: SQLite runtime n8n; báo cáo UAT-004.
- Request ID: không áp dụng.

## Lỗi đã đóng trong vòng UAT

| ID | Mức | Thực tế trước sửa | Kết quả sau sửa | Bằng chứng |
|---|---|---|---|---|
| UAT22-CLOSED-001 | P0 | `QLMD1`, `QLBH024.MED` thấy toàn bộ 49.559 khách | 13/13 account bị giới hạn; 0 leak chéo vùng | `scripts/verify_uat007_customer_scope.js` ngày 01/08 |
| UAT22-CLOSED-002 | P0 | 12/13 account thấy kho phụ ngoài CTY/DL02/DL03 | 13/13 chỉ thấy kho được duyệt | `scripts/verify_uat008_warehouse_scope.js` ngày 01/08 |
| UAT22-CLOSED-003 | P0 | UAT-019 live chỉ 28/31; hai 502 body rỗng và một 422 catalog | Live mới 31/31 | `reports/uat023-live-2026-08-01.json` |
| UAT22-CLOSED-004 | P0 | Nguy cơ double-click/retry tạo trùng đơn | Hai request đồng thời tạo đúng một đơn | Đơn `UAT21-260801145955-9CA2`; `scripts/verify_uat018_order_create.js` |
| UAT22-CLOSED-005 | P0 | Payload khác có thể tái dùng request ID | Bị từ chối và đơn gốc không đổi | Response “Mã request đã được dùng cho một nội dung đơn khác” |
| UAT22-CLOSED-006 | P1 | Workflow có thể trả HTTP 200 body rỗng | Nhánh NO_DATA/RAG lỗi luôn trả JSON | `reports/uat023-live-2026-08-01.json` |
| UAT22-CLOSED-007 | P1 | Catalog tổng quát bắt buộc từ khóa dù đã có loại kho | `@Type=khohang` chạy không cần từ khóa | UAT-019 live mới |
| UAT22-CLOSED-008 | P2 | Tài liệu/backlog ghi trạng thái cũ | Được đồng bộ trong UAT-022/023/024 | Các tài liệu ngày 01/08/2026 |

## Gate bàn giao

- Không còn lỗi P0 chức năng trong bộ regression `31/31`.
- Còn một P0 cấu hình workflow: `UAT22-OPEN-001`.
- Vì vậy trạng thái phát hành là `BLOCKED_RELEASE`, không phải `UAT_BASELINE_READY`.
