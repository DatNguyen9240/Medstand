# Gói UAT khách hàng Medstand AI

Thư mục này chứa tài liệu bàn giao cho người dùng UAT. Không lưu mật khẩu, token, ảnh/HAR chứa dữ liệu nhạy cảm hoặc danh sách tài khoản nội bộ tại đây.

## Bắt đầu từ đâu

1. `06_CUSTOMER-DOC-001_HUONG_DAN_UAT_KHACH_HANG_DRAFT.docx` — **bản nháp mới nhất**, hướng dẫn đăng nhập, chọn dữ liệu, lập/sửa/gửi duyệt đơn, kiểm CTBH, lấy request ID và lập biên bản dry-run.
2. `03_PHIEU_KIEM_THU_NHAN_VIEN_QUAN_LY.docx` — phiếu ghi kết quả theo người kiểm thử.
3. `04_MAU_GHI_NHAN_LOI_VA_GOP_Y.docx` — mẫu báo lỗi và góp ý.
4. `05_KICH_BAN_KIEM_THU_13_TAI_KHOAN.docx` — kịch bản điều phối kiểm thử sâu cho 13 tài khoản.

## Tài liệu nền hiện có

- `01_HUONG_DAN_SU_DUNG_MEDSTAND_AI.docx` / `.html` — hướng dẫn sử dụng chung.
- `02_HUONG_DAN_TEST_13_TAI_KHOAN.docx` / `.html` — hướng dẫn Pilot đời trước, giữ để đối chiếu lịch sử; không dùng thay bản `CUSTOMER-DOC-001` khi chạy dry-run mới.

## Trạng thái CUSTOMER-DOC-001

- Phiên bản: `DRAFT 0.1`.
- Ngày soạn: `23/08/2026`.
- Review nội dung/source: `PASS`; accessibility audit: `0 finding` sau khi đánh dấu hàng tiêu đề cho 8 bảng dữ liệu.
- Môi trường ghi trong tài liệu: `https://medtest.bms7.net/`.
- Chưa phải bản phát hành cuối: còn phải deploy đúng runtime UAT và để một người chưa tham gia phát triển tự chạy dry-run chỉ bằng tài liệu.
- Chỉ đổi sang bản phát hành khi biên bản dry-run có version, môi trường, ngày, người chạy và kết quả; không còn P0, còn P1 phải có quyết định chấp nhận và owner.
