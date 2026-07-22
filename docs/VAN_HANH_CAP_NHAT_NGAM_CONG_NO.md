# Vận hành cập nhật ngầm công nợ

## Phạm vi

Card `@cong_no_chi_tiet` của ngày hiện tại được cập nhật ngầm theo chu kỳ 60 giây. Đây là cơ chế polling gần realtime, không phải realtime bằng WebSocket/SSE.

Người dùng không thấy công tắc hoặc thông báo tự động cập nhật. Kết quả trên card chỉ được thay thế khi dữ liệu nghiệp vụ thực sự thay đổi.

## Quy tắc vận hành

- Chỉ card chi tiết công nợ mới nhất được cập nhật ngầm.
- Chỉ chạy với dữ liệu tính đến ngày hiện tại; truy vấn lịch sử không được polling.
- Tạm dừng gọi API khi tab trình duyệt không hiển thị.
- Dừng khi card bị đóng, bị xóa khỏi DOM hoặc phiên xác thực không còn hợp lệ.
- Không gửi request mới khi request trước chưa hoàn thành.
- So sánh response mới và cũ, bỏ qua `AsOfDate`/`NgayChot`; không render lại nếu nghiệp vụ không đổi.
- Hai response rỗng liên tiếp mới thay kết quả đang có, tránh mất card vì một lần đọc rỗng tạm thời.
- Khi lỗi mạng, giữ nguyên dữ liệu cũ và retry có backoff; dừng sau ba lỗi liên tiếp.

## Cấu hình kỹ thuật

Có thể cấu hình trong `API_CONFIG` trước khi tải chatbot:

```javascript
API_CONFIG.DEBT_AUTO_REFRESH_ENABLED = true;
API_CONFIG.DEBT_AUTO_REFRESH_MS = 60000;
API_CONFIG.DEBT_AUTO_REFRESH_MAX_FAILURES = 3;
```

`DEBT_AUTO_REFRESH_MS` được giới hạn tối thiểu 30 giây để tránh tạo tải quá mức lên n8n và SQL Server.

## Luồng dữ liệu

```text
Card công nợ hiện tại
→ ApiEngine.queryData (không tạo tin nhắn chat)
→ API Execute / n8n
→ SQL API_CongNoChiTiet_AI
→ so sánh dữ liệu mới với dữ liệu đang hiển thị
→ chỉ thay card khi có thay đổi
```

Backend vẫn áp dụng danh tính đã xác thực và phạm vi khách hàng của tài khoản. Cơ chế cập nhật ngầm không mở rộng quyền truy cập.

## Lưu ý triển khai

- Phải build lại `chatbot-widget/js/chatbot.bundle.min.js` sau khi sửa renderer nguồn.
- Đây là cập nhật gần realtime. Độ mới cuối cùng phụ thuộc thời điểm ERP ghi dữ liệu vào SQL Server.
- Trước khi mở rộng cho nhiều người dùng, theo dõi latency API, số request, tải n8n và tải SQL.
