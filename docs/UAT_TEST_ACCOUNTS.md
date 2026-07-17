# Danh sách tài khoản UAT Manager và TDV

> Danh sách được xác nhận từ ảnh người dùng cung cấp ngày 2026-07-15. Tài liệu này chỉ lưu username và quan hệ Manager–TDV; không lưu mật khẩu hoặc token.

| Chi nhánh | Manager | Tên Manager | Tài khoản TDV |
|---|---|---|---|
| MB | `QLBH013.MED` | Mai Anh Tuấn | `NAMDINHB.MED` |
| MB | `QLBH016.MED` | Trần Văn Hưởng | `BACNINHA.MED` |
| MT | `QLBH005.MED` | Nguyễn Thế Anh | `HUEB.MED` |
| MT | `QLBH010.MED` | Nguyễn Văn Việt Anh | `DANANGA.MED` |
| MN | `QLMN2` | Trần Văn Luân | `CanThoA` |
| MN | `QLMD1` | Nguyễn Văn Thái | `BinhPhuocA` |
| MN | `QLBH024.MED` | Ngô Đức Hùng | `BinhPhuocA` |

## Quy ước sử dụng

- Chỉ dùng các tài khoản trên cho kiểm thử UAT Manager/TDV.
- Mật khẩu chung được lưu cục bộ trong `.env.uat.local`, không nằm trong tài liệu này.
- Token UAT cũng chỉ được lưu trong `.env.uat.local` và không được commit.
- `BinhPhuocA` xuất hiện ở hai dòng Manager theo đúng danh sách nguồn; cần giữ nguyên cho đến khi người vận hành xác nhận thay đổi.
