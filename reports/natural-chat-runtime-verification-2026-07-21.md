# Kiểm tra hội thoại tự nhiên và vận hành — 21/07/2026

## Kết luận

Trạng thái hiện tại: `SOURCE_FIX_PASS_RUNTIME_PUBLISH_PENDING`.

- Bộ phân loại tĩnh: **114/114 PASS**.
- Danh sách cho phép: **24/24 API đọc** vẫn được giữ nguyên.
- Đăng nhập UAT Manager qua đúng gateway của web: **PASS**.
- Kiểm thử hội thoại qua đúng đường đi của frontend: **13/31 PASS** trên workflow đang được publish.
- Hạ tầng local không phải nút thắt chính; lỗi tập trung ở workflow phân quyền và một số API riêng.

## Nguyên nhân chính đã xác định

`MAIN_ChatBot_V5` từng so sánh chính xác chuỗi quyền do parser trả về với quyền của tài khoản. Cách này từ chối nhầm Manager vì các quyền `OWN`, `BRANCH`, `ALL` có quan hệ phân cấp, không phải các chuỗi tương đương.

Source đã được sửa để chỉ phân quyền tại `API_Execute / Shared Auth Guard`, nơi dùng danh tính đã xác thực và capability thật. Không bỏ lớp phân quyền nghiệp vụ; chỉ bỏ lớp kiểm tra trùng và sai trước đó.

## Kết quả runtime trước khi publish source mới

| Chỉ số | Kết quả |
|---|---:|
| Tổng tình huống | 31 |
| Pass | 13 |
| Fail | 18 |
| `AUTH001` sai | 15 |
| HTTP 422 | 1 |
| HTTP 500 | 1 |
| Phản hồi JSON rỗng/không hợp lệ | 1 |
| Trung vị | 245 ms |
| P95 | 5.687 ms |
| Lâu nhất | 5.981 ms |

Ba lỗi ngoài `AUTH001` cần kiểm tra lại sau khi publish workflow chính:

1. `@don_hang`: câu “xem đơn hàng tháng này” trả HTTP 422.
2. `@tich_luy`: câu “xem tích lũy của AG0031” trả HTTP 500.
3. `@tra_cuu_san_pham`: câu “tìm sản phẩm A003” có response rỗng/JSON không hợp lệ.

## Phát hiện cấu hình n8n

Có hai workflow Intent Parser cùng active trên webhook `intent-parser`:

- Bản cũ: `ZQPz4sbzz9pqSO8W`.
- Bản mới: `Gn7nDjDgGUFOWni5`.

Cần backup rồi tắt bản cũ; chỉ giữ bản mới. Việc này chưa được tự động thực hiện trong lượt kiểm tra để tránh thay đổi runtime khi chưa duyệt.

## Cổng kiểm thử đã đạt

- Workflow JSON parse: PASS.
- Code node compile: PASS.
- Static natural-language suite: 114/114 PASS.
- Cảnh báo kiểm tra quyền trùng trước `API_Execute`: đã hết.
- `git diff --check`: PASS.
- Công cụ test không còn giả mạo vai trò Admin khi chỉ có tài khoản Manager.

## Lệnh kiểm thử lại sau khi publish

```powershell
node scripts/run_authenticated_natural_chat_test.js smoke --role=manager --report reports/natural-chat-postpublish-smoke-manager.json
node scripts/run_authenticated_natural_chat_test.js live --role=manager --report reports/natural-chat-postpublish-live-manager.json
node scripts/run_authenticated_natural_chat_test.js load --role=manager --requests=40 --concurrency=5 --report reports/natural-chat-postpublish-load-manager.json
```

Chỉ được gọi runtime PASS khi smoke không còn `AUTH001`, bộ live đạt theo tiêu chí nghiệm thu và ba lỗi API riêng đã được đối soát.
