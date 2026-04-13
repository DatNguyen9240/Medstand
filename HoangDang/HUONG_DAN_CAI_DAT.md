# Hướng Dẫn Cài Đặt Medstand — Từ Đầu

> Mỗi lần deploy sang máy mới / server khách, làm theo thứ tự này

---

## BƯỚC 1 — Chuẩn bị thư mục

Copy toàn bộ thư mục `Medstand/` vào máy. Cấu trúc cần có:

```
Medstand/
├── env.js                ← File cấu hình URL (sửa ở Bước 5)
├── index.html
├── HoangDang/
│   ├── cloudflared.exe
│   ├── start_n8n.bat
│   ├── node-v22.14.0-win-x64/   ← Node.js portable
│   ├── n8n_data/                ← Dữ liệu n8n (tạo tự động)
│   └── n8n/
│       ├── K0_MetaAPI.json
│       ├── K_SieuLuong_V2.json
│       └── K5_CronJob.json
└── src/, chatbot-widget/, sql/, ...
```

> **LƯU Ý:**
> - `node-v22.14.0-win-x64/` và `cloudflared.exe` phải có trong `HoangDang/`.
> - Nếu chưa có Node.js — khi chạy `start_n8n.bat` lần đầu nó tự tải về.
> - Nếu chưa có `cloudflared.exe` — tải tại: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

---

## BƯỚC 2 — Cài SQL Server & Chạy Schema

1. Mở **SQL Server Management Studio (SSMS)**
2. Chạy file `sql/Schema_API_Metadata.sql` → tạo bảng + insert 10 API AI
3. Chạy file `sql/Schema_API_Metadata_Patch.sql` → thêm 9 API nghiệp vụ
4. Kiểm tra: `SELECT * FROM dbo.API_Definition` → phải có ~19 dòng

---

## BƯỚC 3 — Khởi động n8n

1. **Double-click** `HoangDang/start_n8n.bat`
2. Sẽ mở thêm 2 cửa sổ:
   - **Cloudflare Tunnel** → hiện URL dạng `https://xxx-yyy.trycloudflare.com`
   - **n8n** → hiện `Editor is now accessible via: http://localhost:5678`
3. **Copy URL Cloudflare** (cần cho Bước 5)
4. Mở trình duyệt → vào `http://localhost:5678`
5. Đăng ký tài khoản n8n (lần đầu)

---

## BƯỚC 4 — Import Workflow vào n8n

Trong n8n (`http://localhost:5678`):

1. Click **"+"** → **"Import from file"**
2. Import `HoangDang/n8n/K0_MetaAPI.json`
3. Import `HoangDang/n8n/K_SieuLuong_V2.json`
4. Import `HoangDang/n8n/K5_CronJob.json` *(tuỳ chọn — báo cáo Telegram)*

Với **mỗi workflow** sau khi import:
- Click vào node **MS SQL** → điền thông tin kết nối SQL Server của bạn
- Click nút **"Active"** (góc phải trên) để bật workflow

---

## BƯỚC 5 — Cập nhật URL Cloudflare

### 5a. Sửa `env.js` (frontend chatbot):
```js
// File: Medstand/env.js — dòng cuối cùng trong window.APP_ENV
N8N_BASE: 'https://URL-CLOUDFLARE-CUA-BAN.trycloudflare.com',
```

### 5b. Sửa `start_n8n.bat` (n8n webhook):
```bat
set "WEBHOOK_URL=https://URL-CLOUDFLARE-CUA-BAN.trycloudflare.com/"
set "N8N_WEBHOOK_TUNNEL_URL=https://URL-CLOUDFLARE-CUA-BAN.trycloudflare.com"
```

> **LƯU Ý:** `K_SieuLuong_V2.json` dùng `localhost:5678` — **không cần sửa**, n8n tự gọi nội bộ.

---

## BƯỚC 6 — Chạy Frontend (Live Server)

1. Mở **VSCode** → mở folder `Medstand/`
2. Cài extension **Live Server** (nếu chưa có)
3. Click **"Go Live"** ở thanh dưới → mở `http://127.0.0.1:5500`
4. Đăng nhập bằng tài khoản Medstand

---

## BƯỚC 7 — Kiểm tra hệ thống

Mở `http://127.0.0.1:5500/#/chatbot` và test:

| Câu hỏi | API | Kết quả kỳ vọng |
|---|---|---|
| "tồn kho hiện tại" | `@danh_sach_ton_kho` | Danh sách sản phẩm + tồn kho |
| "doanh số hôm nay" | `@doanh_so` | Bảng doanh số ngày hôm nay |
| "đơn hàng chờ duyệt" | `@don_hang` | Danh sách đơn pending |
| "công nợ KH001" | `@cong_no_khach_hang` | Công nợ của khách KH001 |

---

## Mỗi lần restart máy (routine)

1. Chạy `start_n8n.bat` → đợi n8n + Cloudflare khởi động
2. **Copy URL Cloudflare mới** (URL thay đổi mỗi lần!)
3. Sửa `env.js` → dòng `N8N_BASE`
4. Hard refresh trang web (`Ctrl+Shift+R`)

> **TIP:** Nếu muốn URL cố định (không đổi mỗi lần restart) → Đăng ký Cloudflare Tunnel có tên cố định (cần tài khoản Cloudflare free) hoặc dùng domain riêng của khách.

---

## Troubleshooting nhanh

| Triệu chứng | Nguyên nhân | Fix |
|---|---|---|
| Chatbot không phản hồi | Cloudflare URL sai hoặc n8n chưa chạy | Kiểm tra `start_n8n.bat`, cập nhật `env.js` |
| "Workflow not found" | Chưa import hoặc chưa Active workflow | Import lại K0_MetaAPI + K_SieuLuong |
| "SyntaxError JSON" | `api-get-system-meta` SP chưa tạo trong SQL | Bỏ qua — không ảnh hưởng chức năng chính |
| Thanh input chat không hiện | CSS cache cũ | Ctrl+Shift+R |
| Cloudflare không start | Đường dẫn có dấu cách | File bat đã được fix, chạy lại |
| n8n MS SQL lỗi kết nối | Credentials SQL chưa cấu hình | Vào n8n → Credentials → MS SQL → nhập lại |
