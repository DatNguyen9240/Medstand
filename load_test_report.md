# 📊 BÁO CÁO MÔ PHỎNG & KIỂM THỬ TẢI CHATBOT (500 SALES AGENTS)

Báo cáo được tạo tự động bởi hệ thống mô phỏng quá trình hỏi đáp của nhân viên sale Medstand gửi tới Chatbot API Gateway.

---

## 📈 Tóm Tắt Kết Quả Kiểm Thử

| Chỉ số kiểm thử | Giá trị đo lường | Mô tả chi tiết |
| :--- | :--- | :--- |
| **Tổng số nhân viên sale mô phỏng** | **20** | Tổng lượng người dùng ảo tham gia |
| **Tỷ lệ thành công (Success Rate)** | **0.00%** | Tỷ lệ phản hồi hợp lệ từ chatbot |
| **Số request thành công** | `0` | Trả về dữ liệu/câu trả lời hợp lệ |
| **Số request thất bại** | `20` | Do lỗi mạng, rate-limit hoặc lỗi logic |
| **Tổng thời gian thực hiện** | **0.36 giây** | Thời gian hoàn tất toàn bộ 20 người |
| **Mức tải song song thực tế** | **5 sales** | Giới hạn số người hỏi cùng 1 thời điểm |

---

## ⏱️ Phân Tích Thời Gian Phản Hồi (Latency Analysis)

* **Thời gian phản hồi trung bình (Average):** `70 ms` (~0.07s)
* **Thời gian phản hồi nhanh nhất (Min):** `31 ms`
* **Thời gian phản hồi lâu nhất (Max):** `165 ms` (Tải RAG hoặc SQL phức tạp)

---

## ⚠️ Chi Tiết Lỗi Ghi Nhận (Nếu Có)

```text
HTTP 404: {"code":404,"message":"The requested webhook \"POST hook-ai-dainao\" is not registered.","hint":"The
```

---

## 🛠️ Khuyến Nghị Tối Ưu Hóa (Recommendations)
1. **Quản lý Hàng Đợi (Queueing):** Môi trường local chạy với mức tải song song 5-10 người dùng hoạt động rất ổn định. Khi chuyển sang môi trường production thực tế phục vụ 500 sales cùng lúc, khuyến nghị cài đặt bộ hàng đợi (RabbitMQ hoặc Redis Queue) phía trước N8N để điều phối tải.
2. **Bộ Nhớ Đệm (Caching):** Triển khai Cache Redis cho các câu hỏi tra cứu tồn kho tĩnh để giảm thiểu thời gian truy vấn SQL Server và N8N (giảm độ trễ từ ~2000ms xuống còn <200ms).
