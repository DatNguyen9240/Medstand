# Bộ tài liệu Pilot Medstand AI

## Tài liệu dành cho doanh nghiệp

1. [`HUONG_DAN_SU_DUNG_MEDSTAND_AI_DOANH_NGHIEP.md`](HUONG_DAN_SU_DUNG_MEDSTAND_AI_DOANH_NGHIEP.md)  
   Hướng dẫn đầy đủ cho Sale, Quản lý và Admin: đăng nhập, 24 chức năng hội thoại, cách đọc kết quả, xử lý lỗi và quy tắc an toàn.

2. [`KE_HOACH_TEST_13_TAI_KHOAN.md`](KE_HOACH_TEST_13_TAI_KHOAN.md)  
   Kế hoạch UAT cho 13 tài khoản thuộc ba miền, gồm câu hỏi copy-paste, kết quả chuẩn, 24 API, test phân quyền và mẫu ký nghiệm thu.

## Tài liệu kỹ thuật liên quan

- [`../sql/AI_Scenarios_Guide.md`](../sql/AI_Scenarios_Guide.md): mapping câu hỏi/API dành cho đội kỹ thuật.
- [`../config/natural-language/intent-map.v1.json`](../config/natural-language/intent-map.v1.json): danh sách 24 intent/API được phép dùng cho hội thoại tự nhiên.
- [`../sql/Add_UAT_Data_Completion_AI.sql`](../sql/Add_UAT_Data_Completion_AI.sql): fixture UAT có thể chạy lặp và dọn theo tiền tố.

## Thứ tự sử dụng

1. Điều phối viên đọc kế hoạch kiểm thử và chuẩn bị môi trường.
2. Người dùng doanh nghiệp đọc hướng dẫn sử dụng theo vai trò.
3. Chạy 13 tài khoản theo bảng phân công.
4. Ghi PASS/FAIL/BLOCKED và lưu ảnh theo quy ước.
5. Chỉ ký Business PASS khi các lỗi P0/P1 đã đóng hoặc được chấp nhận bằng văn bản.

## Trạng thái tài liệu

- Dùng được cho Pilot trên `medtest` với dữ liệu chốt đến 20/07/2026.
- Chưa phải hướng dẫn vận hành production-final.
- Khi URL, tài khoản, business rule hoặc workflow thay đổi sau deploy, phải cập nhật tài liệu và chạy regression lại.
