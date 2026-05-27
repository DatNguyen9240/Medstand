# 🛠️ HƯỚNG DẪN TỐI ƯU CHI TIẾT DỰ ÁN MEDSTAND

Tài liệu này cung cấp **chi tiết kỹ thuật và mã nguồn mẫu** cho 3 nâng cấp tối ưu hóa quan trọng nhất mà bạn có thể áp dụng ngay vào dự án Medstand để cải thiện hiệu năng, chống lỗi và tăng bảo mật tuyệt đối.

---

## 🚀 TỐI ƯU 1: CHỐNG RÒ RỈ BỘ NHỚ TRONG TRANG (SPA ROUTER)

### 🔴 Vấn đề hiện tại
Trong các file như [create-order.js](file:///c:/Git%20cua%20tui/Medstand/src/js/pages/create-order.js#L98) hoặc các file trang khác, lập trình viên thường viết:
```javascript
$(document).on('change', '#fs-orderDate', function() { ... });
```
Khi người dùng chuyển sang trang khác, thẻ `<script>` của trang cũ bị xóa khỏi DOM nhưng sự kiện này được bind vào đối tượng `document` (toàn cục) nên **không bao giờ bị giải phóng**. Khi quay lại trang Tạo đơn lần thứ 2, sự kiện lại được đăng ký tiếp $\rightarrow$ Nhân đôi sự kiện.

### 🟢 Cách tối ưu chi tiết (Event Delegation)
Thay vì lắng nghe trên `document` toàn cục, hãy **lắng nghe trực tiếp trên Container chứa nội dung trang** (trong dự án của bạn là `#app-content`). Khi chuyển trang, Router sẽ ghi đè toàn bộ `#app-content.innerHTML` $\rightarrow$ Trình duyệt tự giải phóng 100% sự kiện mà không cần viết code dọn dẹp thủ công!

#### 👉 Đoạn mã cần sửa đổi:
Mở các file trang trong `src/js/pages/` (ví dụ [create-order.js](file:///c:/Git%20cua%20tui/Medstand/src/js/pages/create-order.js)), chuyển tất cả các dòng lắng nghe sự kiện dạng:

*   **TRƯỚC (Dễ rò rỉ):**
    ```javascript
    $(document).on('change', '#fs-orderDate', function() { ... });
    $(document).on('click', '#btnSubmitOrder', function() { ... });
    ```
*   **SAU (An toàn tuyệt đối):**
    ```javascript
    // Lắng nghe cục bộ ngay trong khung nội dung trang
    $('#app-content').on('change', '#fs-orderDate', function() { ... });
    $('#app-content').on('click', '#btnSubmitOrder', function() { ... });
    ```

---

## 🔒 TỐI ƯU 2: BẢO MẬT WEBHOOK N8N (EXPRESS PROXY GATEWAY)

### 🔴 Vấn đề hiện tại
File [env.js](file:///c:/Git%20cua%20tui/Medstand/env.js#L12) đang chứa liên kết Cloudflare trực tiếp của n8n (`N8N_BASE: 'https://...trycloudflare.com'`). Bất kỳ ai mở F12 đều lấy được địa chỉ n8n thực tế và spam request.

### 🟢 Cách tối ưu chi tiết (Node.js Proxy)
Chúng ta sẽ chuyển URL n8n vào file bí mật `.env` ở Backend. Client (Trình duyệt) chỉ gọi đến server Node.js cục bộ của bạn (`/api/chat`), sau đó [server.js](file:///c:/Git%20cua%20tui/Medstand/server.js) sẽ làm nhiệm vụ chuyển tiếp yêu cầu một cách an toàn.

#### 👉 Bước 2.1: Thêm Route Proxy vào [server.js](file:///c:/Git%20cua%20tui/Medstand/server.js)
Mở [server.js](file:///c:/Git%20cua%20tui/Medstand/server.js) và chèn thêm đoạn code xử lý sau:

```javascript
app.use(express.json());

// N8N Backend URL ẩn phía server
const N8N_INTERNAL_URL = process.env.N8N_BASE || 'https://realized-comfortable-oxygen-played.trycloudflare.com';

// Proxy API cho Chatbot
app.post('/api/chat', async (req, res) => {
    try {
        const response = await fetch(`${N8N_INTERNAL_URL}/webhook/hook-ai-dainao`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': req.headers['authorization'] || '' // Giữ lại token xác thực của user
            },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('N8N Proxy Error:', error);
        res.status(500).json({ error: 'Không thể kết nối đến Trợ lý AI.' });
    }
});
```

#### 👉 Bước 2.2: Thay đổi URL gọi trong [chatbot.js](file:///c:/Git%20cua%20tui/Medstand/chatbot-widget/js/chatbot.js)
Mở file [chatbot.js](file:///c:/Git%20cua%20tui/Medstand/chatbot-widget/js/chatbot.js#L9), thay thế URL gọi Webhook trực tiếp thành endpoint proxy mới:

*   **TRƯỚC:**
    ```javascript
    var CHAT_API = (_cfg.N8N_BASE || '') + (_cfg.CHAT_WEBHOOK || '/webhook/hook-ai-dainao');
    ```
*   **SAU:**
    ```javascript
    // Gọi trực tiếp đến Express Server cục bộ để được bảo mật ẩn danh
    var CHAT_API = '/api/chat';
    ```

---

## 💾 TỐI ƯU 3: CHUYỂN BỘ NHỚ LƯU TRỮ CHAT SANG INDEXEDDB

### 🔴 Vấn đề hiện tại
Hàm `_saveCache` và `_loadCache` trong [chatbot.js](file:///c:/Git%20cua%20tui/Medstand/chatbot-widget/js/chatbot.js#L109) đang sử dụng `localStorage`. Khi các câu trả lời của AI chứa bảng dữ liệu (Table HTML) và thẻ UI nặng, bộ nhớ 5MB của `localStorage` sẽ nhanh chóng bị quá tải.

### 🟢 Cách tối ưu chi tiết (IndexedDB Cache)
Sử dụng IndexedDB (thư viện Vanilla siêu nhẹ tích hợp sẵn trong trình duyệt) để lưu trữ lịch sử chat không giới hạn dung lượng.

#### 👉 Đoạn mã cần thay thế trong [chatbot.js](file:///c:/Git%20cua%20tui/Medstand/chatbot-widget/js/chatbot.js):
Thay thế hoàn toàn 3 hàm quản lý Cache cũ (dòng 109 đến 168) thành đoạn mã quản lý cơ sở dữ liệu IndexedDB bất đồng bộ dưới đây:

```javascript
    // ── Khởi tạo IndexedDB ──
    function _initDB() {
        return new Promise((resolve, reject) => {
            var request = indexedDB.open('MedstandChatDB', 1);
            request.onupgradeneeded = function(e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains('history')) {
                    db.createObjectStore('history', { keyPath: 'sessionKey' });
                }
            };
            request.onsuccess = function(e) { resolve(e.target.result); };
            request.onerror = function(e) { reject(e.target.error); };
        });
    }

    // ── Tải lịch sử Chat từ IndexedDB (Không lo giới hạn 5MB) ──
    async function _loadCacheAsync() {
        try {
            var db = await _initDB();
            return new Promise((resolve) => {
                var transaction = db.transaction(['history'], 'readonly');
                var store = transaction.objectStore('history');
                var request = store.get(_getSessionKey());
                
                request.onsuccess = function(e) {
                    var data = e.target.result;
                    if (!data) return resolve([]);
                    // Hết hạn 8 giờ -> Xóa
                    if (data.ts && (Date.now() - data.ts > CACHE_TTL)) {
                        _clearCache();
                        return resolve([]);
                    }
                    resolve(data.messages || []);
                };
                request.onerror = function() { resolve([]); };
            });
        } catch (e) {
            console.error('Load IndexedDB failed:', e);
            return [];
        }
    }

    // ── Lưu lịch sử Chat vào IndexedDB ──
    async function _saveCacheAsync(messages) {
        try {
            var db = await _initDB();
            var msgsToSave = messages || [];
            if (msgsToSave.length > 200) msgsToSave = msgsToSave.slice(-200); // Lưu tối đa 200 tin nhắn gần nhất

            var transaction = db.transaction(['history'], 'readwrite');
            var store = transaction.objectStore('history');
            store.put({
                sessionKey: _getSessionKey(),
                ts: Date.now(),
                messages: msgsToSave
            });
        } catch (e) {
            console.error('Save IndexedDB failed:', e);
        }
    }

    // ── Xóa lịch sử Chat ──
    async function _clearCacheAsync() {
        try {
            var db = await _initDB();
            var transaction = db.transaction(['history'], 'readwrite');
            var store = transaction.objectStore('history');
            store.delete(_getSessionKey());
        } catch (e) {}
    }
```

*Lưu ý: Sau khi đổi sang IndexedDB, hãy cập nhật các hàm gọi `_loadCache()` và `_saveCache()` trong chatbot.js bằng cách chèn từ khóa `await` hoặc xử lý Promise bất đồng bộ tương ứng.*
