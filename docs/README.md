# Tài liệu Medstand AI

Cập nhật: `03/08/2026`

Thư mục này chỉ giữ tài liệu còn được sử dụng. Báo cáo theo từng lần chạy đã được gom vào một baseline; bằng chứng máy đọc nằm trong `reports/`, còn lệnh kiểm tra nằm trong `scripts/`.

## Đọc nhanh

1. [Baseline kỹ thuật và UAT hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md) — trạng thái runtime, kết quả đã chốt, dữ liệu UAT và việc còn mở.
2. [Backlog phát triển](BACKLOG_TASK_PHAT_TRIEN_MEDSTAND_AI_2026-07-27.md) — nguồn quản lý task, phụ thuộc và tiêu chí nghiệm thu.
3. [Kế hoạch test 13 tài khoản](KE_HOACH_TEST_13_TAI_KHOAN.md) — tài khoản, câu hỏi mẫu và cách ghi kết quả.

## Contract nghiệp vụ

- [Tạo khách hàng qua chat](CORE-001_CONTRACT_CHAT_TAO_KHACH_HANG_2026-07-29.md)
- [Lập đơn hàng qua chat](CORE-004_CONTRACT_CHAT_LAP_DON_HANG_2026-08-03.md)
- [Phân nhóm khách hàng A/B/C](CORE-006_CONTRACT_PHAN_NHOM_ABC_2026-08-03.md)

Đây là ba tài liệu quyết định hành vi chung giữa frontend, gateway/n8n, SQL và business. Kết quả triển khai của CORE-002/003/005/007 và STOCK-001 đã được tóm tắt trong baseline, không giữ báo cáo riêng.

## Hướng dẫn và vận hành

- [Hướng dẫn sử dụng cho doanh nghiệp](HUONG_DAN_SU_DUNG_MEDSTAND_AI_DOANH_NGHIEP.md)
- [Hướng dẫn test câu tự nhiên và tải hệ thống](HUONG_DAN_TEST_CAU_TU_NHIEN_VA_TAI_HE_THONG.md)
- [Vận hành cập nhật ngầm công nợ](VAN_HANH_CAP_NHAT_NGAM_CONG_NO.md)
- [Gói UAT khách hàng](GOI_UAT_KHACH_HANG/) — bản Word/HTML và biểu mẫu bàn giao.

## Quy tắc duy trì tài liệu

- Trạng thái task chỉ cập nhật trong backlog.
- Kết quả tổng hợp chỉ cập nhật trong baseline.
- Quy tắc nghiệp vụ chỉ cập nhật trong contract tương ứng.
- Kết quả mỗi lần chạy lưu dạng JSON/log trong `reports/`; không tạo thêm báo cáo Markdown theo ngày nếu không có quyết định mới.
- File Word/HTML trong gói khách hàng được giữ vì là định dạng bàn giao, dù cùng nguồn nội dung.
