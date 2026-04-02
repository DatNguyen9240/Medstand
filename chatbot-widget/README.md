# 🤖 Chatbot Widget - Hướng dẫn sử dụng

Folder này chứa toàn bộ code cần thiết để tích hợp Chatbot AI vào bất kỳ website nào.

## 📁 Cấu trúc thư mục

```text
chatbot-widget/
├── css/
│   ├── ai-bot-button.css      ← Toàn bộ biến CSS & style cho nút Widget
│   └── chatbot.css            ← Style cho trang hội thoại
├── js/
│   ├── chatbot.js             ← Logic xử lý chat (Call API, Render tin nhắn)
│   └── chatbot-suggestions.js  ← Dữ liệu các câu hỏi gợi ý
└── template/
    ├── ai-bot-button.html     ← HTML snippet cho nút bấm Robot
    └── chatbot.html           ← HTML snippet cho trang hội thoại chính
```

---

## 🚀 Cách tích hợp vào Project mới

### Bước 1: Copy folder
Copy nguyên thư mục `chatbot-widget` vào thư mục gốc của project bạn.

### Bước 2: Load CSS vào `<head>`
```html
<link rel="stylesheet" href="chatbot-widget/css/ai-bot-button.css">
<link rel="stylesheet" href="chatbot-widget/css/chatbot.css">
```
> [!TIP]
> File `ai-bot-button.css` đã chứa sẵn các biến màu sắc và font chữ mặc định. Nếu project của bạn có hệ thống biến CSS riêng, nó sẽ tự động nhận diện và ghi đè.

### Bước 3: Tạo vị trí đặt nút AI Bot
Trong phần header hoặc bất kỳ đâu bạn muốn nút Robot hiện ra, hãy đặt thẻ này:
```html
<span id="ai-chat-btn-container"></span>
```

### Bước 4: Nhúng JS để hiển thị nút & điều hướng
Sử dụng đoạn code sau để tự động tải nút từ widget và gắn sự kiện click:
```javascript
fetch('chatbot-widget/template/ai-bot-button.html')
    .then(res => res.text())
    .then(html => {
        const container = document.getElementById('ai-chat-btn-container');
        if (container) {
            container.innerHTML = html;
            // Gắn sự kiện chuyển trang
            document.getElementById('btn-ai-chat').addEventListener('click', (e) => {
                e.preventDefault();
                // Thay đổi đoạn này tùy theo Router của project bạn
                window.location.hash = '#/chatbot'; 
            });
        }
    });
```

### Bước 5: Cấu hình API trong `chatbot.js`
Mở file `chatbot-widget/js/chatbot.js`, tìm 2 dòng đầu tiên để cấu hình Webhook của bạn:
```javascript
var CHAT_API = 'URL_WEBHOOK_CUA_BAN';
var CHAT_API_KEY = 'API_KEY_CUA_BAN';
```

---

## 🛠 Yêu cầu kỹ thuật & Tùy biến

1.  **Xác thực (Authentication):**
    *   Widget mặc định đọc tên người dùng từ: `localStorage.getItem('auth_user')` -> `UserName`.
    *   Token xác thực được gửi qua Header `Authorization: Bearer [token]` lấy từ cookie `auth_token`.
2.  **HTML Structure:**
    *   Trang chatbot (`chatbot.html`) sử dụng các class `.app-header`, `.chat-container`, `.chat-input-bar`.
    *   Nếu project của bạn có cấu trúc khác, hãy điều chỉnh CSS trong `chatbot.css`.
3.  **Gợi ý nhanh:**
    *   Bạn có thể thay đổi danh sách câu hỏi tại `chatbot-widget/js/chatbot-suggestions.js`.

---
> [!NOTE]
> Được phát triển cho hệ thống Medstand AI.
