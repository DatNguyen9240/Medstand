# SQL deployment map

Tên FILE trong thư mục này không phải là thứ backend gọi trực tiếp — backend gọi theo
đúng tên **stored procedure/function** khai bằng `CREATE OR ALTER PROCEDURE dbo.X` /
`CREATE OR ALTER FUNCTION dbo.X` bên trong file, khớp với endpoint `/api/X` khai trong
`env.js`. Đổi tên file không ảnh hưởng API đang chạy, nhưng các script deploy/verify
trong `scripts/` và tài liệu trong `docs/` có hardcode đúng path file — đổi tên file thì
phải cập nhật hết các chỗ đó trong cùng một lần sửa.

## P2-04 mutation deployment

Chạy trên database đích theo thứ tự:

1. `Module_Common_API_KhachHang_Insert_AI.sql`
2. `Module_10_API_SanPhamTrongTam_Import_AI.sql`
3. `Module_Common_API_DonHangChiTiet_Insert_AI.sql`
4. `Migrate_API_Mutation_Idempotency_AI.sql`

Ba file đầu là API nghiệp vụ. File cuối tạo reservation/replay chống request trùng.

## Quy ước tên file

- `Module_NN_API_X_AI.sql`: procedure nghiệp vụ theo module cũ, đánh số 2 chữ số
  (`01`–`10`...). `Module_Common_API_X_AI.sql`: procedure dùng chung nhiều module.
- `TASKCODE_Description_AI.sql` (`ORDER-APPROVAL-00N_*`, `PROMO-CFG-00N_*`, `PROMO-00N_*`,
  `NOTI-001_*`, `CAT-00N_*`, `RAG-00N_*`, `CORE0NN` qua `Migrate_CORE0NN_*`): làm việc
  theo task cụ thể trong backlog, giữ nguyên tên gắn với mã task để dễ tra cứu lịch sử.
- `Migrate_*`: migration schema dùng cho production, thiết kế chạy lặp an toàn
  (`CREATE OR ALTER`, `IF OBJECT_ID(...) IS NULL` trước khi tạo mới).
- `Bootstrap_*`: khởi tạo/đồng bộ metadata API sau khi schema migration đã sẵn sàng.
- `System_*`: hạ tầng dùng chung toàn hệ thống (audit log, index tối ưu, auto-grant
  quyền), không gắn với một task/module cụ thể.
- `ufn_*`: scalar function tiện ích, thường được các procedure khác gọi tới — không có
  proc "chủ sở hữu" duy nhất, kiểm tra kỹ trước khi archive vì không xuất hiện trong
  `env.js`/`server.js` (chỉ được gọi từ SQL khác) không có nghĩa là không dùng.
- `Verify_*`, `Add_UAT_*`, `Seed_*`, `Audit_UAT*`, `Fix_UAT*`: script kiểm tra/UAT một
  lần; không phải migration production mặc định, không chạy hàng loạt.
- `diagnostics/`: script SQL chỉ đọc để soát dữ liệu/nghiệp vụ, không migration, không
  deploy.
- `_archive/`: file đã xác nhận không còn stored procedure/function/table nào đang sống
  (không xuất hiện trong `env.js`/`server.js`, không được gọi từ file SQL nào khác,
  không có script/doc nào hardcode path) — giữ lại để tra cứu lịch sử thay vì xóa hẳn.
  Không deploy file trong `_archive/`.

Không chạy hàng loạt toàn bộ thư mục; chọn đúng migration và procedure theo release đang
deploy. Trước khi đổi tên hoặc archive thêm file: kiểm tra tên procedure/function bên
trong có xuất hiện trong `env.js`/`server.js`/`src/server/*.js` không, có được gọi từ
file `.sql` nào khác không (kể cả trong `diagnostics/`), rồi mới kiểm path file có được
`scripts/`/`docs/` hardcode không — chỉ dựa vào tên FILE không đủ để kết luận file đó
còn dùng hay không.
