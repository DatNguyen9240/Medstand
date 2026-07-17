# TASK-P1-01 — Chuẩn hóa response envelope

**Ưu tiên:** P1  
**Phụ thuộc:** Security Gate P0  
**Tệp:** `n8n/API_Services/API_Execute.json`

## Mục tiêu

Phân biệt thành công, không dữ liệu, validation, quyền và lỗi hệ thống; không tính message thành một dòng dữ liệu.

## Contract

`success`, `code`, `message`, `data`, `count`, `requestId`.

## Mapping

- `OK`: 200.
- `NO_DATA`: 200, data rỗng, count 0.
- `MISSING_PARAMETER`/`VALIDATION_ERROR`: 400/422.
- `UNAUTHORIZED`: 401.
- `FORBIDDEN`: 403.
- Invalid/unsupported ApiCode: 400 hoặc 404 theo anti-enumeration policy.
- `SYSTEM_ERROR`: 500, không lộ SQL/stack.

## Việc cần làm

1. Tạo adapter SP cũ cho `MsgType/Code/Severity`.
2. Map về INFO, WARNING, VALIDATION_ERROR, BUSINESS_ERROR, SYSTEM_ERROR.
3. Phân loại row message trước khi đếm data.
4. Cập nhật FE sử dụng `code`, không đoán từ số dòng.

## Tiêu chí nghiệm thu

Sáu lệnh từng trả success/count 1 khi thiếu params phải trả count 0, data rỗng và code phù hợp.

## Tiến độ 2026-07-15

- [x] Chuẩn hóa nhánh Execute thành công về `success`, `code`, `message`, `data`, `count`, `requestId`.
- [x] Đồng bộ nhánh 401/403 về cùng envelope.
- [x] Tạo adapter phân loại `Msg/MsgType/Severity/Code` trước khi đếm data.
- [x] Map `NO_DATA`, `VALIDATION_ERROR`, `FORBIDDEN`, `BUSINESS_ERROR`, `SYSTEM_ERROR` và HTTP status tương ứng.
- [x] Cập nhật FE dùng `success/code`, đồng thời giữ đường đọc response cũ trong giai đoạn chuyển tiếp.
- [x] Thêm contract test `test:api-execute-envelope`; local release check PASS.
- [x] Chạy UAT chín ca: sáu lệnh legacy-empty trả dữ liệu hợp lệ với count khớp data; ba lệnh thiếu tham số bắt buộc trả 422/count 0/data rỗng.
- [x] Publish production và smoke response envelope với guest, Manager và TDV.

## Kết quả nghiệm thu

- Sáu lệnh trong báo cáo cũ không còn tái hiện lỗi `count: 1`: sau P0, danh tính server được chèn hợp lệ nên chúng trả dữ liệu thật; `count` bằng đúng số phần tử `data`.
- Ba ca thiếu tham số bắt buộc (`@cong_no_chi_tiet`, `@hoa_don_chi_tiet`, `@khao_sat360`) trả HTTP 422, `VALIDATION_ERROR`, `count: 0`, `data: []`.
- SQL error thiếu/thừa parameter được chuyển thành contract validation; lỗi hệ thống dùng thông báo generic, không lộ SQL hoặc stack.
- Bằng chứng máy đọc: `reports/p1-01-uat-result.json`.
