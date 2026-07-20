# Kế hoạch chuyển 33 quyết định thành implementation và pilot read-only

**Ngày:** 18/07/2026  
**Nguồn quyết định:** [`business-rule-v1-decision-log.json`](../reports/contracts/business-rule-v1-decision-log.json)  
**Backlog máy đọc:** [`business-rule-v1-implementation-backlog.json`](../reports/contracts/business-rule-v1-implementation-backlog.json)  
**Phạm vi:** Chatbot `@` command + văn bản tự nhiên, SQL/n8n/FE, pilot Sale/Manager/Admin ba miền.

## 1. Kết luận triển khai

Không phải cả 33 quyết định đều tạo thành 33 thay đổi code. Backlog được chia thành bốn nhóm:

1. Rule đã có hoặc đã fail-safe: giữ regression và không sửa ngược.
2. Patch có thể làm từ source hiện tại: đưa vào P0/P1.
3. Rule bị chặn bởi schema hoặc phê duyệt: giữ output an toàn, không tự suy diễn.
4. Tính năng để sau: training từ chat và export Excel không nằm trong pilot đầu.

## 2. P0 — Phải xong trước pilot

| Gói | Quyết định | Việc phải làm | Gate |
|---|---|---|---|
| Chu kỳ/khách mới | `007` | Bỏ dự đoán fallback 30 ngày khi dưới 3 invoice; trả `NEW_CUSTOMER`, `INSUFFICIENT_HISTORY` | SQL source + medtest runtime |
| Công nợ | `015` | Tách `CollectionStatus=PARTIALLY_PAID` khỏi trạng thái đến hạn; hiển thị đã trả/còn nợ | SQL + debt renderer E2E |
| Tier/Risk | `019` | Tier chỉ dùng Monetary + Frequency; Recency chuyển về Risk | SQL fixture A + HIGH |
| Cảnh báo AI | `011` | Thêm disclosure AI cố định; giữ contextual warning | FE contract/E2E |
| Y khoa | `012`, `013` | Hard-stop fail-safe trước symptom SQL cho nhóm nhạy cảm/red flag; không tuyên bố professional-final | n8n no-SQL-on-hard-stop |
| Natural language | `025`, `028` | Chỉ map văn bản vào active API; tách verified company data và AI general knowledge | n8n routing regression |
| Mutation | `029` | Pilot tắt mutation; giữ capability/idempotency/audit; preview flow chỉ kiểm thử sandbox | 403 deny + no SQL |
| Scope | `004`, `017`, `033` | Giữ Sale/Manager/Admin scope, dùng bộ tài khoản ba miền hiện có | Cross-scope UAT |

## 3. P1 — Làm sau khi P0 ổn định

- Danh sách 5 khách, xem thêm tối đa 8: `003`.
- Lý do ưu tiên và hai nhóm Cơ hội/Công nợ: `005`, `006`.
- Tier toàn công ty + `BranchRank`: `020`, sau khi business chốt ngưỡng.
- `UpdatedAt`/`FreshnessStatus`: `021`, sau khi xác minh timestamp ERP.
- Pipeline đơn chờ và Manager summary: `022`, `023`.
- So sánh target: `024`, sau khi có nguồn target đã duyệt.
- Source disclosure, quick choices và context workday: `026`, `027`, `030`.

## 4. Blocker phải chuyển đúng owner

| Owner | Cần xác nhận | Quyết định |
|---|---|---|
| Kế toán/Tài chính | Payment ledger, VAT, return toàn bộ/một phần, thu hồi tích lũy | `001`, `016` |
| ERP kho | Reservation, available stock, inventory timestamp/freshness | `002`, `021` |
| ERP chương trình | Approval/Active/Stackable | `009`, `010` |
| ERP CRM/AR | Check-in source, customer payment term | `014`, `018` |
| Dược sĩ/bác sĩ | Red flag, trẻ em, tuổi/cân nặng/chống chỉ định | `012`, `013` |
| Business owner | Trọng số Tier, ngưỡng toàn công ty, BranchRank, target | `019`, `020`, `024` |

## 5. Thiết kế pilot read-only

### Phạm vi người dùng

- Dùng tài khoản pilot hiện có; không tạo credential mới trong source/report.
- Có Sale, Manager, Admin và đủ miền Bắc/Trung/Nam.
- Sale chỉ thấy khách/kho được giao; Manager chỉ thấy management/branch scope; Admin mới có system scope.

### Chế độ pilot

- Cho phép 24 API read active và natural-language routing tới các API này.
- Mutation production tắt. Mọi lệnh tạo/cập nhật chỉ được preview hoặc bị deny theo capability.
- Không bật raw-chat training; không bật Excel export trong phase đầu.
- Context chỉ theo verified user trong workday và phải hết hạn/xóa được.

### Ma trận kiểm thử

1. Mỗi role chạy danh mục `@` nhìn thấy và các câu văn tương đương.
2. Kiểm tra `NO_DATA`, `OUT_OF_SCOPE`, `VALIDATION_ERROR`, `SYSTEM_ERROR` và request ID.
3. Kiểm tra công nợ: paid, partial, unknown due date, overdue.
4. Kiểm tra gợi ý: đủ 3 invoice, dưới 3 invoice, khách mới.
5. Kiểm tra tồn kho `NULL` không bị đổi thành `0`; stale/unknown không được gọi realtime.
6. Kiểm tra symptom bình thường và hard-stop; hard-stop không được chạy SQL gợi ý sản phẩm.
7. Kiểm tra cross-region/cross-manager denial và client identity tampering.
8. Kiểm tra mutation deny, preview không ghi DB, idempotency/audit.

### Evidence không chứa credential

- Lưu role/region, API, HTTP status, status/code, count và request ID.
- Log feedback: đúng, sai, thiếu dữ liệu, khó hiểu, capability còn thiếu.
- Không ghi token, mật khẩu, secret; hạn chế PII trong report.

## 6. Điều kiện thoát pilot

- Không có cross-scope leak hoặc mutation ngoài ý muốn.
- P0 source/runtime/FE regression pass.
- Sale và Manager xác nhận response đủ hiểu để làm việc.
- Các con số có source/as-of/rule version; unknown không bị đổi thành zero.
- Medical hard-stop và disclaimer không bị bypass.
- Blocker Finance/ERP/Medical tiếp tục ở `DRAFT/PENDING`, không được tự nâng thành `APPROVED`.

## 7. Rollback

- Snapshot/checksum SQL procedure và n8n active version trước mỗi publish.
- Nếu P0 mutation gây regression, phục hồi last-known-good thay vì fix-forward trên runtime.
- Tắt natural-language route nếu intent mapping sai; `@` command read-only vẫn là fallback deterministic.
- Tắt pilot user/capability theo verified identity, không sửa token trong source.

## 8. Tính năng để sau

- `031`: curated/anonymized chat data cho AI improvement, sau privacy/governance approval.
- `032`: XLSX export có scope/source/filter/as-of metadata.
- Mutation production chỉ được mở bằng work package và approval riêng.
