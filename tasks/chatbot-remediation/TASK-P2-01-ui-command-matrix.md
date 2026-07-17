# TASK-P2-01 — UI matrix 28 lệnh `@`

**Ưu tiên:** P2  
**Phụ thuộc:** Security Gate và Contract Gate

**Trạng thái:** `DONE` — 24 lệnh READ role-visible đã nghiệm thu; 4 lệnh còn lại bị policy loại đúng

## Mục tiêu

Kiểm tra thao tác người dùng và renderer cho từng lệnh.

## Test case chung

1. Gõ `@`, tìm và chọn lệnh.
2. Kiểm tra label, placeholder, required và default.
3. Gửi thiếu params, params hợp lệ và giá trị không tồn tại.
4. Kiểm tra loading, success, no-data, validation, forbidden và server error.
5. Kiểm tra table/card/chart, scroll và composer không che dòng cuối.
6. Kiểm tra console/network không có lỗi.

## Ca chuẩn `@danh_muc`

- Chọn được đúng một command.
- Hiển thị Type và từ khóa theo metadata được phép.
- Không lộ DataSourceValue/procedure nội bộ.
- DATA hiển thị đúng renderer danh mục.
- Empty/error không bị tính thành một dòng dữ liệu.

## Artifact

- Ma trận 28 lệnh với Pass/Fail/Blocked.
- Screenshot chỉ khi fail hoặc cần chứng minh renderer.
- Request ID và HTTP status, không lưu dữ liệu nhạy cảm.

## Kết quả 2026-07-16

- Manager 24/24 và TDV 24/24 lệnh live PASS kiểm tra menu/config; tổng 48 config.
- Đã sửa FE parser để đọc envelope P1-04 `{ records, requestId }`; trước bản vá menu `@` rỗng.
- Drift `24 - 28 = -4` đã được giải thích bằng policy: 1 lệnh `DENY` và 3 mutation không thuộc menu READ của hai role.

## Nghiệm thu bổ sung 2026-07-16

- Chốt inventory 28 lệnh legacy thành 24 READ role-visible, 1 lệnh `DENY` và 3 mutation thuộc P2-04.
- Manager và TDV mỗi role đạt 24/24 execute + renderer; report chỉ lưu status, code, count và request ID.
- Phát hiện và sửa hai metadata route trỏ tới procedure chưa tồn tại: `API_KiemTraKhaoSatNgay_AI` và `API_LichSuKhaoSat_AI`.
- `@BranchID` của lịch sử khảo sát đã chuyển thành system param lấy từ verified identity; wrapper không tin BranchID client.
- Quét DB sau sửa: 24 active READ API, 0 stored procedure bị thiếu.
