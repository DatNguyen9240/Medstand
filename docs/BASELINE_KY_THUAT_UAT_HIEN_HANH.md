# Baseline kỹ thuật và UAT hiện hành

- **Cập nhật toàn diện:** `14/09/2026`
- **Phiên bản Frontend:** Bundle `11.144` (Cache Service Worker `medstand-11.144`)
- **Môi trường:** DB `medtest`, Timezone `UTC+07:00`, API nội bộ `medtest.bms79.com`

Tài liệu này tổng hợp baseline kỹ thuật, nghiệm thu các gate phát triển và hiện trạng vận hành hệ thống Medstand AI. Chi tiết từng task được quản lý đồng bộ tại [Backlog phát triển](BACKLOG_TASK_PHAT_TRIEN_MEDSTAND_AI_2026-07-27.md).

---

## 1. Tổng quan các Gate hoàn thành

| Giai đoạn | Gate | Trạng thái | Điều kiện & Kết quả đạt được |
|---|---|---|---|
| **Giai đoạn 0** | `UAT_BASELINE_READY` | **ĐÃ ĐẠT** (`DONE`) | 13/13 tài khoản đăng nhập đúng vai trò/vùng miền, không rò rỉ khách hàng, kho chính allowlist `CTY/DL02/DL03`, 203/203 ca UAT PASS. |
| **Giai đoạn 1** | `CORE_SALES_FLOW_READY` | **ĐÃ ĐẠT** (`DONE`) | Chatbot tạo khách (`CORE-001..003`), chat lập đơn hàng (`CORE-004..005`), công thức A/B/C (`CORE-006..007`), tồn khả dụng thật (`STOCK-001`), lý do gợi ý bán hàng (`CORE-008`), quản lý đơn nháp (`CORE-009`), chốt an toàn mutation & audit bền (`CORE-010`). |
| **Giai đoạn 2** | `CATALOG_PROMOTION_READY` | **ĐÃ ĐẠT** (`DONE`) | Tri thức SP (`CAT-001`), mapping ảnh chuẩn (`CAT-002`), giá phân cấp (`CAT-003`), tồn kho catalog (`CAT-004`), card catalog hợp nhất (`CAT-005`), kiểm thử CTBH (`CAT-006`), phân phối thông báo (`NOTI-001`), mở rộng tra cứu & phân quyền CTKM (`PROMO-AI/AUTH/CFG`) và chuỗi upload–duyệt–lifecycle RAG (`RAG-001..003`). |
| **Giai đoạn 2.5** | `SEARCH_TELEGRAM_PILOT_READY` | **ĐÃ ĐẠT** (`DONE`) | Hệ thống tìm kiếm gần đúng thông minh & Phân giải Selection Token 8 API (`SEARCH-001..012`), kênh Telegram Pilot 13 tài khoản (`TELEGRAM-001..004`), Phân tích hợp đồng nhà thuốc (`CONTRACT-001`), Khóa bảo vệ đơn hàng (`ORDER-GUARD`). |

---

## 2. Trạng thái chi tiết Giai đoạn 1 (CORE & STOCK)

| Task | Tên hạng mục | Trạng thái | Bằng chứng & Ghi chú kỹ thuật |
|---|---|---|---|
| `CORE-001` | Contract chat tạo khách | `DONE` | Khách tạo trực tiếp vào `CF_ObjectTbl` qua `API_KhachHang_Insert_AI`. Response chuẩn `MsgType = 5` kèm `ObjectID`. |
| `CORE-002` | Form thu thập tạo khách | `DONE` | UI form 7 trường trong chat, cascade tỉnh/huyện/xã, validate SĐT/MST và preview trước khi lưu. |
| `CORE-003` | Xác nhận và ghi khách | `DONE` | Gửi kèm UUIDv4 `Idempotency-Key`, chống gửi lặp, ghi nhận audit log. Hủy/chưa xác nhận không ghi DB. |
| `CORE-004` | Contract chat lập đơn hàng | `DONE` | Phân biệt rõ `preview/confirmed/created/failed`. SQL tính lại giá, CTBH, tồn, kho ghi nhận và mã đơn tự sinh. |
| `CORE-005` | Hoàn thiện luồng lập đơn | `DONE` | Tạo đơn `DMB0826/8` qua gateway/token; replay cùng mã, 1 header + 1 detail, audit create/replay đầy đủ. |
| `CORE-006` | Công thức phân nhóm A/B/C | `DONE` | Duyệt phương án C, rule `BR-TIER-005/2.0.0` lưu trong `AI_BusinessRuleConfigTbl`, không hard-code ngưỡng. |
| `CORE-007` | Cập nhật API chấm điểm KH | `DONE` | `API_ChamDiemKH_AI` đọc config `APPROVED`, PASS 52/52 ca (13 tài khoản × 4 nhóm A/B/C/UNRATED), tích hợp Selection Token `SEARCH-011`. |
| `STOCK-001` | Kiểm tra tồn thật theo quyền | `DONE` | Hàm `AI_StockAvailableByUserFnc`, config `BR-STOCK-001/2.0.0`, tự động loại hàng `RESERVED_OUT`. Đã bổ sung mode `@Compact = 1` phục vụ Chatbot. |
| `CORE-008` | Chuẩn hóa lý do gợi ý | `DONE` | Deploy `BR-RECOMMENDATION-008/1.0.0`, hiển thị chu kỳ, lần mua cuối, ngày dự kiến và nguồn rule; tích hợp `SEARCH-010`. |
| `CORE-009` | Thao tác đưa gợi ý vào giỏ | `DONE` | Reducer `MedstandOrderDraft` cách ly theo tài khoản và phiên chat; hỗ trợ giỏ hàng hội thoại cả trên Web và Telegram bot. |
| `CORE-010` | Hardening & Audit mutation | `DONE` | `AI_AuditLogTbl` và `AI_IdempotencyTbl` hoạt động bền vững; bảo vệ an toàn cho cả tạo khách và tạo đơn. |
| `CORE-011` | Quyết định tạo khách trực tiếp | `DONE` | Chốt phương án tạo trực tiếp không qua duyệt back-office cho luồng chat của TDV/Sale. |

---

## 3. Trạng thái chi tiết Giai đoạn 2 (Catalog, CTBH & RAG)

| Task | Tên hạng mục | Trạng thái | Bằng chứng & Ghi chú kỹ thuật |
|---|---|---|---|
| `CAT-001` | Schema tri thức sản phẩm | `DONE` | `AI_ProductKnowledgeVersionTbl` và view `AI_ApprovedProductKnowledgeVw`; UAT rollback sạch `remainingFixtures = 0`. |
| `CAT-002` | Mapping ảnh catalog | `DONE` | Danh mục duyệt `approved-mapping.json` (6 ảnh có mã in trực tiếp trên bao bì); ảnh tối ưu < 1MB; fallback `default-product.svg`. |
| `CAT-003` | Giá theo khách & bảng giá | `DONE` | Nguồn giá ERP `AR_LayGiaSanPhamFnc`; kiểm tra scope khách/sản phẩm; ca không giá trả `NO_ACTIVE_PRICE`. |
| `CAT-004` | Tồn kho theo quyền vào catalog | `DONE` | Kết nối `AI_StockAvailableByUserFnc`; hiển thị tồn khả dụng, kho phân quyền và thời điểm cập nhật. |
| `CAT-005` | Card catalog hợp nhất | `DONE` | Đóng gói module hiển thị 5 trường thiết yếu (Ảnh + Mã/Tên + Giá + Tồn + CTBH) kèm nút thêm đơn nháp. |
| `CAT-006` | UAT catalog và CTBH | `DONE` | Bộ script kiểm thử `verify_promo_ai_001_ctbh.js`, `verify_promo_auth_001_matrix.js`, `verify_stock_compact_ai.js` PASS 100%. |
| `PROMO-001` | Schema CTBH có hiệu lực | `DONE` | Bảng shadow `AI_PromotionProgramTbl`, scope chi nhánh/nhóm user, rule sản phẩm và view `AI_ApprovedPromotionItemRuleVw`. |
| `PROMO-002` | Ghép CTBH vào sản phẩm | `DONE` | `AI_ActivePromotionByUserFnc` lọc đồng thời chi nhánh, nhóm user, sản phẩm và khoảng hiệu lực `[From, To)`. |
| `PROMO-AI` | Tra cứu CTBH theo sản phẩm | `DONE` | Stored procedure `API_CTBHSanPham_AI` tra cứu quyền lợi theo mã/tên thuốc, kết nối hàm phân quyền. |
| `PROMO-AUTH`| Ma trận phân quyền CTKM | `DONE` | Bảng `AI_PromotionPermissionTbl` và hàm `AI_PromotionPermissionFnc` phân định quyền Xem/Tạo/Duyệt/Thu hồi. |
| `PROMO-CFG` | Quản trị cấu hình CTKM | `DONE` | Giao diện quản trị CTKM tại `src/js/pages/promotion-admin.js/css` tích hợp trong `rag-admin`. |
| `NOTI-001` | Phân phối thông báo | `DONE` | Procedure `NOTI-001_API_Metadata_AI.sql` và workflow Telegram `TG_Notification_Dispatch.json`. |
| `RAG-001` | Upload & Scanner tài liệu | `DONE` | Preflight `28/28 PASS`; live upload qua webhook quét Defender `CLEAN`, giữ `PENDING_REVIEW`, chưa cho chatbot sử dụng; rollback sạch. |
| `RAG-002` | Màn hình duyệt OCR | `DONE` | Preflight `19/19 PASS`; preview/approve live HTTP `200`, revision và audit đúng, nội dung duyệt tạo đúng 1 vector; SAVE/APPROVE/REJECT rollback sạch. |
| `RAG-003` | Lifecycle thu hồi tài liệu | `DONE` | Preflight `17/17 PASS`; đủ trạng thái `ACTIVE/SCHEDULED/EXPIRED/WITHDRAWN`; live withdraw loại khỏi view chatbot và xóa vector `1→0`; cron cleanup active trong n8n local. |

---

## 4. Hệ sinh thái Nâng cấp (Giai đoạn 2.5)

### Nhóm SEARCH — Tìm kiếm gần đúng thông minh & Selection Token
- `SEARCH-001`: Bảng token tạm thời `AI_SelectionTokenTbl` (TTL 15 phút).
- `SEARCH-002`: Hàm kiểm tra an toàn phạm vi dữ liệu `AI_ScopeGuardFnc`.
- `SEARCH-003`: Tìm kiếm gần đúng khách hàng `API_TimKiemKhachHangGanDung_AI` (tên, mã, SĐT).
- `SEARCH-004`: Tìm kiếm gần đúng sản phẩm `API_TimKiemSanPhamGanDung_AI` (tên, mã, hoạt chất).
- `SEARCH-005 → 012`: Tích hợp tự động phân giải `@SelectionToken` cho 8 API đọc (Công nợ tổng hợp, Công nợ chi tiết, Doanh số, Đơn hàng, Hóa đơn, Gợi ý đơn, Chấm điểm khách hàng, Tích lũy).

### Nhóm TELEGRAM PILOT — Trợ lý AI trên Telegram di động
- `TELEGRAM-001`: Cơ chế Self-link tài khoản qua mã OTP 6 số từ giao diện web (`account.html`).
- `TELEGRAM-002`: Vé xác thực tạm thời Ticket Auth hai chiều giữa n8n và SQL.
- `TELEGRAM-003`: Workflow ChatBot `TG_ChatBot_Demo.json` tra cứu nghiệp vụ nhanh.
- `TELEGRAM-004`: Tạo đơn đặt hàng nháp và nhận thông báo phân phối trực tiếp trên Telegram.

### Nhóm Quản trị Nghiệp vụ nâng cao
- `CONTRACT-001`: Phân tích 2.422 khách hàng hợp đồng, phát hiện không phát sinh doanh số 3 tháng liên tiếp (`CUSTOMER-CONTRACT-001_Analytics_AI.sql`, trang `contract-customer.html`).
- `ORDER-GUARD-001`: Bộ lọc server `order-status-guard.js` và `order-edit-lock-guard.js` ngăn chặn can thiệp đơn hàng đã duyệt.

---

## 5. Danh mục Script kiểm tra & Nghiệm thu (Read-Only)

Tất cả các script kiểm tra đều tuân thủ nguyên tắc read-only hoặc tự động rollback trong transaction, không làm biến đổi dữ liệu nghiệp vụ thật:

```bash
# 1. Kiểm tra tài khoản và phân quyền
node scripts/verify_uat007_customer_scope.js
node scripts/verify_uat008_warehouse_scope.js

# 2. Kiểm tra tồn kho & CTBH
node scripts/verify_stock_compact_ai.js
node scripts/verify_promo_ai_001_ctbh.js
node scripts/verify_promo_auth_001_matrix.js

# 3. Kiểm tra phân tích hợp đồng khách hàng
node scripts/verify_contract_customer_analytics.js

# 4. Kiểm tra tìm kiếm gần đúng & Selection Token
node scripts/verify_search_003_004_web_e2e.js
node scripts/verify_search_chatbot_e2e.js

# 5. Kiểm tra kênh Telegram Pilot
node scripts/verify_telegram_self_link_ai.js
node scripts/verify_telegram_pilot_db.js
node scripts/verify_telegram_order_draft_ai.js

# 6. Kiểm tra tính toàn vẹn của Backlog task
node scripts/verify_backlog_integrity.js

# 7. Đóng gói Frontend Production
node scripts/build.js
```
