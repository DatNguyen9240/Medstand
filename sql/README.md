# SQL deployment map

## P2-04 mutation deployment

Chạy trên database đích theo thứ tự:

1. `Module common - API_KhachHang_Insert_AI.sql`
2. `Module 10 - API_SanPhamTrongTam_Import_AI.sql`
3. `Module common - API_DonHangChiTiet_Insert_AI.sql`
4. `Migrate_API_Mutation_Idempotency_AI.sql`

Ba file đầu là API nghiệp vụ. File cuối tạo reservation/replay chống request trùng.

## Quy ước file

- `Migrate_*`: migration schema dùng cho production, thiết kế chạy lặp an toàn.
- `Bootstrap_*`: khởi tạo/đồng bộ metadata API sau khi schema migration đã sẵn sàng.
- `Module *` và `API_*`: source procedure/function nghiệp vụ.
- `Verify_*`, `Test_*`, `Audit_*`, `Prepare_*`, `Cleanup_*`: script kiểm tra/UAT; không phải migration production mặc định.

Các patch `Fix_*` và fixture UAT one-off đã được xóa sau khi thay đổi được nhập vào source procedure/migration chính. Không chạy hàng loạt toàn bộ thư mục; chọn đúng migration và procedure theo release đang deploy.
