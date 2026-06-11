# 🚀 MEDSTAND AI — KẾ HOẠCH NÂNG CẤP HỆ THỐNG

> Cập nhật: 2026-06-11 | Branch: hoangdang

---

## ✅ ĐÃ HOÀN THÀNH

| Hạng mục | Mô tả | Ngày |
|---|---|---|
| Fast Path / Slow Path | Tối ưu tìm kiếm khách hàng | 2026-06-11 |
| ufn_remove_accents | Xóa Mojibake dead code, gọn hàm | 2026-06-11 |
| Đổi tên file _AI | Phân biệt file AI vs SQL gốc | 2026-06-11 |
| Merge conflict resolution | Đồng bộ remote/local | 2026-06-11 |

---

## 🔥 ƯU TIÊN CAO — Tối ưu hiệu năng

### 1. Computed Column Index (ĐÃ TRIỂN KHAI)
**Impact:** Tốc độ tìm tên khách hàng tăng 10-100x  
**File:** `sql/System - Computed_Column_Index_AI.sql`

```sql
-- Thêm cột tính toán được lưu trữ sẵn (PERSISTED)
ALTER TABLE CF_ObjectTbl
ADD ObjectNameCleaned AS dbo.ufn_clean_customer_name(ObjectName) PERSISTED;

-- Tạo index trên cột đó
CREATE INDEX IX_CF_ObjectTbl_NameCleaned
ON CF_ObjectTbl(ObjectNameCleaned)
INCLUDE (ObjectID, ObjectName, BranchID);
```

**Trước:** Slow Path scan toàn bảng (O(n) với function mỗi dòng)  
**Sau:** Index seek trực tiếp (O(log n))

---

### 2. Proactive Alerts — Cảnh báo chủ động
**Impact:** Tăng tỉ lệ chốt đơn, nhắc công nợ tự động  
**Công việc:**
- [ ] Stored procedure `API_ProactiveAlert_AI` — quét KH chưa mua > 30 ngày
- [ ] Stored procedure `API_DebtAlert_AI` — quét công nợ sắp đến hạn
- [ ] Tích hợp n8n Schedule Trigger → push thông báo hàng ngày

---

## 🟡 ƯU TIÊN TRUNG — UX & Tính năng

### 3. AI Memory — Nhớ ngữ cảnh hội thoại
**Impact:** Chatbot hiểu câu hỏi tiếp theo liên quan đến câu trước  
**Công việc:**
- [ ] Bảng `AI_ChatSession` lưu lịch sử hội thoại (session_id, user, messages)
- [ ] n8n node inject session context vào prompt
- [ ] Giới hạn: giữ 10 tin nhắn gần nhất để tránh token overflow

### 4. Export Báo cáo từ Chatbot
**Impact:** Sale xuất Excel/PDF ngay trong chat  
**Công việc:**
- [ ] n8n node `Generate Excel` (dùng xlsx library)
- [ ] Endpoint `/api/export?type=congno&format=xlsx`
- [ ] Chatbot nhận dạng intent "xuất báo cáo", "tải về"

### 5. Dashboard Realtime Manager/CEO
**Impact:** Quản lý nhìn thấy KPI tức thì, không cần hỏi chatbot  
**Công việc:**
- [ ] Trang `pages/dashboard.html` — biểu đồ Chart.js
- [ ] WebSocket hoặc polling 30s refresh
- [ ] Các widget: Doanh số hôm nay, Top KH công nợ, Tồn kho thấp

---

## 🟢 ƯU TIÊN THẤP — Hạ tầng & Bảo mật

### 6. PWA Mobile-first
**Impact:** Sale dùng được trên điện thoại, offline  
**Công việc:**
- [ ] Cập nhật `sw.js` — cache API responses
- [ ] Manifest.json đầy đủ (icon, splash screen)
- [ ] Test trên iOS Safari & Android Chrome

### 7. Rate Limiting & Security
**Impact:** Bảo vệ API khỏi spam/abuse  
**Công việc:**
- [ ] Express rate-limit middleware trong `server.js`
- [ ] Validate JWT token cho mọi request AI
- [ ] Log suspicious activity vào `AI_AuditLog`

### 8. Audit Log đầy đủ
**Bảng `AI_AuditLog` đã có** — cần tích hợp vào tất cả stored procedures:
- [ ] Ghi mỗi lần AI gọi SP: username, SP_name, params, execution_time
- [ ] Báo cáo usage theo tuần cho Manager

---

## 📊 BẢNG TỔNG HỢP

| # | Nâng cấp | Độ khó | Impact | Trạng thái |
|---|---|---|---|---|
| 1 | Computed Column Index | 🟢 Thấp | 🔥 Rất cao | ✅ Done |
| 2 | Proactive Alerts | 🟡 Trung | 🔥 Rất cao | 📋 Backlog |
| 3 | AI Memory | 🟡 Trung | 🟡 Trung | 📋 Backlog |
| 4 | Export Báo cáo | 🟡 Trung | 🟡 Trung | 📋 Backlog |
| 5 | Dashboard Realtime | 🔴 Cao | 🟡 Trung | 📋 Backlog |
| 6 | PWA Mobile | 🔴 Cao | 🟢 Thấp | 📋 Backlog |
| 7 | Rate Limiting | 🟢 Thấp | 🟡 Trung | 📋 Backlog |
| 8 | Audit Log đầy đủ | 🟢 Thấp | 🟢 Thấp | 📋 Backlog |
