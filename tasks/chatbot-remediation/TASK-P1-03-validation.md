# TASK-P1-03 — Đồng bộ validation frontend/backend

**Ưu tiên:** P1  
**Phụ thuộc:** TASK-P1-02  
**Tệp:** `chatbot-widget/js/chatbot-api-engine.js` và API validation

## Mục tiêu

Không thực thi nghiệp vụ khi thiếu required hoặc sai kiểu, nhưng vẫn hỗ trợ hội thoại nhiều bước.

## Việc cần làm

1. Bỏ việc bỏ qua required ở final execution.
2. Validate type, số dương, TopN/page limit và khoảng ngày.
3. Customer combo phải resolve đúng một ID trong scope.
4. Form sai không gọi API nghiệp vụ.
5. Conversational flow được lưu partial state và hỏi tiếp; chỉ execute khi đủ contract.
6. Backend lặp lại toàn bộ validation quan trọng.
7. Giữ `@lap_don_hang` là CART/NAVIGATION_ACTION và có review trước submit.

## Tiêu chí nghiệm thu

- Không có request nghiệp vụ khi final form thiếu required.
- Partial conversation không bị mất state.
- FE và backend trả cùng validation code.

## Kết quả hoàn tất

**Trạng thái:** `DONE`  
**Cập nhật:** `2026-07-16T07:47:36+07:00`

- FE chặn final execution khi thiếu required, sai ISO date, sai số nguyên dương/giới hạn hoặc customer combobox chưa resolve được ID; state đang nhập vẫn được giữ để người dùng bổ sung.
- Backend đặt `Validate API Request` sau auth/capability và trước `Build Execute SQL` / `MS SQL Execute`, trả HTTP 422 với code `VALIDATION_ERROR` cho input sai.
- `@lap_don_hang` tiếp tục là luồng CART/navigation, không bị biến thành mutation SQL trực tiếp.
- UAT HTTP đạt 4/4; execution trace xác nhận ba request sai không chạy SQL và request hợp lệ có chạy SQL.
- `npm.cmd run test:release-local` PASS ngày 2026-07-16.
