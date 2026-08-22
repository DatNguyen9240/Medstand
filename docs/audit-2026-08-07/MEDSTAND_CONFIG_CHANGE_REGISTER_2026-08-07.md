# Configuration Change Register — Medstand AI

**Ngày lập:** 07/08/2026 · **Baseline:** `hoangdang@88a2600`
**Nguyên tắc:** chỉ **đề xuất**. Không tự đổi giá trị nào khi chưa có quyết định nghiệp vụ.

---

## Bảng tổng hợp cấu hình runtime hiện tại

| Cấu hình | Vị trí | Giá trị hiện tại | Hard-code? | Rủi ro |
|---|---|---|---:|---|
| `API_BASE` (ERP) | `.env` → `server.js`:126 | từ env, **không có default** | Không | Thấp — fail-closed đúng |
| `N8N_INTERNAL_URL` | `server.js`:138–142 | `http://127.0.0.1:5678` | **Có** (fallback) | Trung bình |
| Gateway timeout | `server.js`:148–153 | 30.000 ms | **Có** (fallback) | Trung bình |
| Upload body limit | `server.js`:35 | 32 MB | **Có** | Thấp |
| Multipart file limit | `server.js`:314 | 10 MB / 30 entries | **Có** | Thấp |
| Admin upload key | `server.js`:454 | `'Medstand@Admin2026'` | **Có — secret** | **Cao** |
| Idempotency key format | `server.js`:400 | regex 8–128 ký tự | **Có** | Thấp |
| `APP_VERSION` | `scripts/build.js`:5 | `11.139` | **Có** | **Cao** |
| SW cache version | `sw.js`:? | `medstand-11.139` | Sinh từ build | Thấp |
| `appVersion` (HTML) | `index.html`:7 | `11.139` | Sinh từ build | Thấp |
| Cache TTL API list | `chatbot-api-engine.js`:122 | 2 phút | **Có** | Thấp |
| Cache TTL lịch sử chat | `chatbot.js`:39 | 8 giờ | **Có** | Thấp |
| Cache TTL mention | `chatbot.js`:5332 | 24 giờ | **Có** | Trung bình |
| **Cache khách panel đơn** | `chatbot-api-engine.js`:3247 | **vô hạn** | **Có** | **Cao** |
| Min ký tự tìm sản phẩm | `chatbot-api-engine.js`:3443 | 2 | **Có** | Thấp |
| Debounce tìm sản phẩm | `chatbot-api-engine.js`:3452 | 300 ms | **Có** | Thấp |
| Max kết quả sản phẩm | `chatbot-api-engine.js`:3455 | 20 | **Có** | Thấp |
| **Min ký tự tìm khách** | — | **không có** | — | **Cao** |
| **Max kết quả khách** | `chatbot-api-engine.js`:3390 | 30 (**chỉ lọc client**) | **Có** | **Cao** |
| Debounce menu token | `chatbot-api-engine.js`:6031+ | 80–200 ms | **Có** | Thấp |
| Page size bảng | `chatbot.js`:4281 | 25 (bảng thường) / 10 (chấm điểm) | **Có** | Thấp |
| Ngưỡng cảnh báo công nợ | `env.js` | `50.000.000` | **Có — nghiệp vụ** | Trung bình |
| Từ khóa trả hàng | `env.js` | `['trả','lỗi','hỏng']` | **Có — nghiệp vụ** | Trung bình |
| Rule tier | `AI_BusinessRuleConfigTbl` | `BR-TIER-005/2.0.0` | Không — DB | Thấp |
| Rule tồn kho | `AI_BusinessRuleConfigTbl` | `BR-STOCK-001/2.0.0` | Không — DB | Thấp |
| Rule gợi ý | `AI_BusinessRuleConfigTbl` | `BR-RECOMMENDATION-008/1.0.0` | Không — DB | Thấp |
| Ngưỡng confidence intent | `config/natural-language/intent-map.v1.json` | 0.85–0.92, MEDICAL/MUTATION = `null` | Không — file config | Thấp |

**Nhận xét chung:** phần **business rule** đã được làm rất tốt — chuyển hết vào `AI_BusinessRuleConfigTbl` với version và trạng thái `APPROVED`, procedure fail-closed khi thiếu config. Đây là kiến trúc đúng. Vấn đề còn lại nằm ở **tham số kỹ thuật frontend** vốn rải rác dạng số ma thuật trong 7.000 dòng code.

---

## CONFIG-01 — Ngưỡng ký tự tối thiểu khi tìm khách hàng

| Trường | Nội dung |
|---|---|
| **Vị trí** | `chatbot-widget/js/chatbot-api-engine.js`:3313–3324, 3387–3392 |
| **Giá trị hiện tại** | Không có ngưỡng — tải toàn bộ khi mở panel |
| **Giá trị đề xuất** | `2` ký tự |
| **Lý do** | Đồng bộ với tìm sản phẩm đã có sẵn trong cùng file (dòng 3443) |
| **Ảnh hưởng** | Mở panel không còn phát sinh request nặng |
| **Backward compat** | Thay đổi hành vi UI: không còn danh sách sẵn khi focus |
| **Cần deploy** | Frontend + **nâng `APP_VERSION`** |
| **Test xác nhận** | Gõ 1 ký tự → không gọi API; gõ 2 ký tự → có kết quả |

## CONFIG-02 — Giới hạn số dòng khách trả về từ server

| Trường | Nội dung |
|---|---|
| **Vị trí** | `chatbot-api-engine.js`:3316 (client) + `sql/Module_Common_API_KhachHangList_AI.sql` (server) |
| **Giá trị hiện tại** | Client `slice(0,30)`; **server không giới hạn** |
| **Giá trị đề xuất** | Truyền `SearchText` thật; cân nhắc `TOP (50)` phía SQL |
| **Lý do** | Cắt ở client nghĩa là đã trả 11.571 dòng qua mạng rồi mới bỏ đi |
| **Ảnh hưởng** | Giảm tải mạng, DB và bộ nhớ trình duyệt |
| **Backward compat** | Phần client an toàn. **Sửa SQL cần thận trọng** vì `API_KhachHangList` có thể dùng chung |
| **Cần deploy** | Frontend (bắt buộc) + SQL (tùy chọn, sau khi đo) |
| **Test xác nhận** | Đếm số dòng trả về cho tài khoản có nhiều khách nhất |
| **Khuyến nghị** | **Làm phần client trước.** Chỉ đụng SQL nếu client chưa đủ |

## CONFIG-03 — TTL và invalidation cho cache khách hàng

| Trường | Nội dung |
|---|---|
| **Vị trí** | `chatbot-api-engine.js`:3247 |
| **Giá trị hiện tại** | Không TTL, không invalidation |
| **Giá trị đề xuất** | TTL 2 phút (khớp `CFG.CACHE_TTL`) **và** xóa cache sau khi tạo khách thành công |
| **Lý do** | Nguyên nhân trực tiếp của FIND-002 |
| **Ảnh hưởng** | Khách mới dùng được ngay — đúng cam kết CORE-011 |
| **Backward compat** | Hoàn toàn tương thích |
| **Cần deploy** | Frontend + `APP_VERSION` |
| **Test xác nhận** | Tạo khách → mở lập đơn → thấy khách mới, không F5 |
| **⚠ Phạm vi** | **Chạm luồng tạo khách đang khóa — cần phê duyệt riêng** |

## CONFIG-04 — Admin upload key

| Trường | Nội dung |
|---|---|
| **Vị trí** | `server.js`:454 |
| **Giá trị hiện tại** | `process.env.ADMIN_UPLOAD_KEY \|\| 'Medstand@Admin2026'` |
| **Giá trị đề xuất** | Bỏ fallback; thiếu env → từ chối request kèm mã lỗi rõ |
| **Lý do** | Credential thật trong source. UAT-005 đã hứa xử lý trước production |
| **Ảnh hưởng** | Nếu quên set env, chức năng upload dừng — đúng tinh thần fail-closed mà file này đã áp dụng cho `API_BASE` |
| **Backward compat** | **Phá vỡ** nếu môi trường chưa khai báo env |
| **Cần deploy** | Backend + đặt env trước |
| **Test xác nhận** | Không có env → 503 rõ ràng; có env → upload chạy |
| **Ưu tiên** | **Bắt buộc trước production** |

## CONFIG-05 — `APP_VERSION` phải sửa tay

| Trường | Nội dung |
|---|---|
| **Vị trí** | `scripts/build.js`:5 (nguồn), lan sang `sw.js`, `index.prod.html`, mọi `?v=` |
| **Giá trị hiện tại** | `11.139`, sửa tay |
| **Giá trị đề xuất** | Tự tăng khi build, hoặc chặn build nếu version trùng bản đã deploy |
| **Lý do** | `server.js` đặt `Cache-Control: immutable, max-age=31536000` cho `.min.js`. Quên nâng version ⇒ **trình duyệt giữ bundle cũ tới một năm**. Lỗi này đã xảy ra thật ở UAT-002 |
| **Ảnh hưởng** | Loại bỏ hẳn một lớp lỗi deploy đã từng gây tốn thời gian chẩn đoán |
| **Cần deploy** | Chỉ sửa script build |
| **Test xác nhận** | `node scripts/verify_frontend_deploy.js` |
| **Ưu tiên** | Cao — rẻ và ngăn được lỗi tái diễn |

## CONFIG-06 — Gateway timeout 30 giây

| Trường | Nội dung |
|---|---|
| **Vị trí** | `server.js`:148–153 (`GATEWAY_UPSTREAM_TIMEOUT_MS`) |
| **Giá trị hiện tại** | 30.000 ms |
| **Giá trị đề xuất** | Chưa đổi — **đo trước** |
| **Lý do cân nhắc** | UAT-020 đo p95 = 5.668 ms, p99/max = 9.785 ms. Timeout 30 giây gấp hơn 3 lần trường hợp xấu nhất đã biết |
| **Nhưng** | Nếu khiếu nại "41–47 giây" là thật thì hoặc số đo p95 chưa phủ đúng kịch bản đó, hoặc timeout đang che một truy vấn rất chậm. **Hạ timeout khi chưa hiểu nguyên nhân sẽ biến chậm thành lỗi** |
| **Hành động đúng** | Giữ nguyên cho tới khi FIX-003 có số đo |

## CONFIG-07 — Ngưỡng nghiệp vụ hard-code trong `env.js`

| Trường | Nội dung |
|---|---|
| **Vị trí** | `env.js` — `DEBT_WARN_THRESHOLD: 50000000`, `RETURN_KEYWORDS` |
| **Giá trị hiện tại** | Cứng trong file frontend công khai |
| **Giá trị đề xuất** | Chuyển vào `AI_BusinessRuleConfigTbl` như các rule khác |
| **Lý do** | Dự án đã có cơ chế rule tốt cho tier/tồn/gợi ý. Hai giá trị này bị bỏ sót |
| **Ảnh hưởng** | Business đổi ngưỡng không cần build lại frontend |
| **Ưu tiên** | Trung bình — chỉ làm khi business muốn đổi |

## CONFIG-08 — Cache mention 24 giờ

| Trường | Nội dung |
|---|---|
| **Vị trí** | `chatbot.js`:5332 |
| **Giá trị hiện tại** | 24 giờ |
| **Giá trị đề xuất** | Cân nhắc 1–2 giờ, và xóa khi đổi tài khoản |
| **Lý do** | Dữ liệu gợi ý `@` phụ thuộc scope người dùng. Nếu không xóa khi đăng xuất/đổi user, có rủi ro hiển thị tên thực thể ngoài phạm vi |
| **Điều chưa biết** | **Chưa xác minh** cache này có bị xóa khi logout không. Cần kiểm tra trước khi kết luận |
| **Ưu tiên** | Trung bình — nhưng phải xác minh, vì nếu đúng thì đây là vấn đề phân quyền chứ không phải hiệu năng |

## CONFIG-09 — Fallback URL n8n

| Trường | Nội dung |
|---|---|
| **Vị trí** | `server.js`:138–142 |
| **Giá trị hiện tại** | `http://127.0.0.1:5678` |
| **Giá trị đề xuất** | Cân nhắc bỏ fallback, fail-closed như `API_BASE` |
| **Lý do** | Cùng một file đã có lập luận rất hay cho `API_BASE`: *"Thiếu cấu hình thì phải im lặng-thất-bại một cách ồn ào, không được đoán bừa một host"*. Lập luận đó đúng với n8n không kém |
| **Nhưng** | Localhost là mặc định hợp lý cho môi trường dev. Rủi ro thấp hơn `API_BASE` nhiều |
| **Ưu tiên** | Thấp — nhất quán về nguyên tắc, không cấp bách |

---

## Cấu hình **không** được tự ý đổi

Theo ràng buộc của prompt audit và các quyết định nghiệp vụ đã chốt:

- Quy tắc mã đơn `D{BranchID}{MM}{YY}/{n}` do SQL sinh — **frontend không được tự sinh mã**.
- `ReservedQuantity` phải giữ trong thuật toán nội bộ vì đang dùng để tính `AvailableStock`.
- Không đưa `orders.write` trở lại nếu contract hiện hành không dùng.
- Không đổi luồng khách tạo trực tiếp thành qua duyệt (CORE-011 đã đóng).
- Không đổi công thức A/B/C (`BR-TIER-005/2.0.0` đã sign-off).
- Không đổi STOCK-001, logic giá/CTBH, scope khách/kho/chi nhánh.
- Không tạo API mới nếu API hiện hữu đáp ứng được.

---

## Thứ tự đề xuất

1. **CONFIG-05** (`APP_VERSION`) — rẻ nhất, ngăn lỗi deploy đã từng xảy ra.
2. **CONFIG-01 + CONFIG-02** (giới hạn tìm khách) — sửa được khiếu nại hiệu năng.
3. **CONFIG-03** (invalidate cache) — **chờ phê duyệt**.
4. **CONFIG-04** (admin key) — trước production, không thương lượng.
5. **CONFIG-06** — chỉ sau khi FIX-003 có số đo.
6. **CONFIG-07/08/09** — khi có nhu cầu nghiệp vụ hoặc sau khi xác minh.
