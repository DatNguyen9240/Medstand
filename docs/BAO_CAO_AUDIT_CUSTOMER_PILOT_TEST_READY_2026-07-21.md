# Báo cáo audit Medstand AI — Mức sẵn sàng Customer Pilot

> **Lưu ý:** Đây là baseline audit trước khắc phục. Báo cáo hiện hành sau sửa source nằm tại [`BAO_CAO_SAU_KHAC_PHUC_CUSTOMER_PILOT_2026-07-21.md`](BAO_CAO_SAU_KHAC_PHUC_CUSTOMER_PILOT_2026-07-21.md).

**Ngày audit:** 21/07/2026  
**Chế độ thực hiện:** `REVIEW` — chỉ kiểm tra, chạy test và lập báo cáo; chưa sửa lỗi runtime trong báo cáo này.  
**Mục tiêu đánh giá:** `CUSTOMER_PILOT_TEST_READY`  
**Phạm vi:** Frontend, gateway, n8n, SQL contract, 24 chức năng hội thoại, phân quyền, ngôn ngữ tự nhiên, tải có kiểm soát và bộ UAT 13 tài khoản.  
**Baseline source:** nhánh `hoangdang`, commit `dd2ce5bc1df824503e1ea63831213e96bc9395fb`.  
**Release tạm dùng để truy vết:** `AUDIT-20260721-dd2ce5b-DIRTY`.

> Báo cáo này thay thế các kết luận PASS cũ khi đánh giá bản đang chạy ngày 21/07/2026. Kết quả source/static không được xem là bằng chứng runtime.

## 1. Kết luận điều hành

### Quyết định: `NO-GO`

Hệ thống **chưa đủ điều kiện giao khách hàng kiểm thử Pilot trên bản hiện tại**. Đây không phải kết luận rằng toàn bộ hệ thống không dùng được: frontend và nhiều luồng nghiệp vụ đã chạy, 114/114 kiểm tra phân loại tĩnh pass, 14/24 API đã đi đúng bằng câu tự nhiên trong bài test runtime, và 3/13 tài khoản hoàn tất 8/8 smoke case. Tuy nhiên, các điều kiện tuyệt đối của Pilot vẫn bị vi phạm:

1. Gateway chat không từ chối rõ request thiếu đăng nhập: request ẩn danh nhận HTTP `200` với body `{}` thay vì `401/403` và mã lỗi xác định.
2. 4 câu tự nhiên của nhóm khảo sát gọi nhầm API.
3. Chỉ 14/24 API chuẩn đi đúng ở bài test câu tự nhiên hiện tại; 10 API lỗi, gọi nhầm hoặc trả response không hợp lệ.
4. Smoke 13 tài khoản chỉ có 3 tài khoản đạt 8/8; 10 tài khoản còn lỗi công nợ chi tiết và gợi ý đơn hàng.
5. Bài test tải 40 request chỉ đạt 70% thành công, thấp hơn ngưỡng Pilot 99%.
6. Source n8n và snapshot runtime chưa khớp; snapshot còn có hai Intent Parser cùng active. Chưa khóa được một baseline duy nhất để rollback.

### Trạng thái tổng hợp

| Lớp | Trạng thái | Kết luận |
|---|---|---|
| Source | `PARTIAL_PASS` | JSON hợp lệ, build/syntax pass, static NL 114/114; worktree đang dirty và chưa có release artifact khóa cứng |
| Runtime | `FAIL` | 10/24 natural API case fail; 10/13 tài khoản fail smoke; load success 70% |
| Authentication | `FAIL_CLOSED_NOT_PROVEN` | Login hợp lệ chạy được, nhưng request ẩn danh không bị từ chối đúng contract |
| Authorization/scope | `EVIDENCE_INCOMPLETE` | Chưa quan sát thấy rò dữ liệu trong test này, nhưng chưa có negative-token/cross-scope suite đủ bằng chứng |
| Business rule | `PARTIAL_BUSINESS_PENDING` | Một số SQL/runtime đã pass trước đây; các rule tài chính, tồn khả dụng, chương trình và y khoa vẫn còn gate riêng |
| Customer test | `NO_GO` | Chưa đạt 24/24, chưa đạt 13/13, còn P0 |
| Production | `NOT_READY` | Ngoài phạm vi và chưa đủ điều kiện |

## 2. Bằng chứng đã thu thập

| Kiểm tra | Kết quả | Bằng chứng |
|---|---:|---|
| Danh mục intent | 24/24 intent được khai báo | [`intent-map.v1.json`](../config/natural-language/intent-map.v1.json) |
| Phân loại câu tự nhiên tĩnh | 114/114 PASS | `npm run test:natural` |
| Retry/timeout/JSON/dedup | 5/5 PASS | `npm run test:resilience` |
| Health frontend và n8n | 2/2 PASS | `npm run test:health` |
| Build frontend | PASS | `npm run build` trong cùng phiên làm việc |
| JSON/syntax | PASS | Các workflow, config, report JSON parse được; ba script test qua `node --check` |
| Manager live | 20/31 PASS, p95 5.159 ms | [`audit-current-manager-live.json`](../reports/audit-current-manager-live.json) |
| Sale live | 20/31 PASS, p95 6.874 ms | [`audit-current-sale-live.json`](../reports/audit-current-sale-live.json) |
| Manager smoke | 6/8 PASS | [`audit-current-manager-smoke.json`](../reports/audit-current-manager-smoke.json) |
| Sale smoke | 6/8 PASS | [`audit-current-sale-smoke.json`](../reports/audit-current-sale-smoke.json) |
| 13 tài khoản | 3/13 đạt 8/8 | [`summary.json`](../reports/audit-13-accounts/summary.json) |
| Tải 40 request, concurrency 4 | 70% thành công; p95 3.564 ms | [`audit-current-manager-load.json`](../reports/audit-current-manager-load.json) |
| Request ẩn danh | HTTP 200, body `{}` | `npm run test:auth:gate` và kiểm tra lại bằng câu ASCII |
| Whitespace | PASS | `git diff --check`; chỉ có cảnh báo quy đổi LF/CRLF |

Không có mật khẩu hoặc token nào được ghi vào các report audit nói trên.

## 3. Kiến trúc thực tế đang được đánh giá

```text
Browser / chatbot widget
        |
        v
Gateway localhost:3000 (/api/chat, /api/gateway)
        |
        v
n8n MAIN_ChatBot_V5
        |
        +--> Command parser (@...)
        |
        +--> Natural-language Intent Parser
        |
        v
Shared Auth Guard -> capability/scope -> API Execute
        |
        v
SQL procedure / view
        |
        v
Response envelope -> frontend renderer/card
```

Về source, command và câu tự nhiên có định hướng hội tụ về một intent/API registry. Tuy nhiên runtime chưa chứng minh parity vì:

- 4 câu khảo sát đang cùng rơi về `@danh_sach_cau_hoi_khao_sat`.
- Chưa chạy lại ma trận 24 lệnh `@` trên chính release này.
- Snapshot runtime và source workflow có khác biệt semantic sau khi bỏ qua vị trí node, ID và credential.

## 4. Kết quả 18 gate

| Gate | Nội dung | Trạng thái | Nhận định |
|---:|---|---|---|
| 1 | Baseline/version/rollback | `FAIL` | Worktree dirty; source/runtime n8n chưa khớp; chưa có release ID chung cho frontend–n8n–SQL |
| 2 | Môi trường/đường truyền | `PARTIAL` | Health pass; chưa test đủ browser thật, cache, mất mạng giữa request, n8n/SQL restart |
| 3 | Login/identity/session | `FAIL` | Login hai vai trò pass; anonymous gate sai contract; chưa có full logout/two-tab/token-expiry evidence |
| 4 | Capability/scope | `BLOCKED_EVIDENCE` | Không thấy leak trong suite hiện tại nhưng negative tokens đang trống; chưa đủ cross-region/cross-employee evidence |
| 5 | Parity `@` và tự nhiên | `FAIL` | Natural gọi nhầm 4 API khảo sát; command runtime chưa retest 24/24 |
| 6 | Phân loại message | `SOURCE_PASS_RUNTIME_PARTIAL` | 114/114 static pass; runtime còn lỗi nghiệp vụ và survey routing |
| 7 | Chuẩn hóa tiếng Việt | `SOURCE_PASS_RUNTIME_PARTIAL` | Static có dấu/không dấu/slang pass; một số test/report hiển thị mojibake cần làm sạch |
| 8 | Thiếu tham số/entity | `PARTIAL` | Nhiều clarification pass; `@don_hang`, `@danh_muc` còn HTTP 422 và error taxonomy chưa đạt |
| 9 | Context/multi-turn | `PARTIAL` | Static follow-up pass; chưa đủ bằng chứng hai tab, concurrent response, logout và failed-context isolation |
| 10 | Coverage 24 chức năng | `FAIL` | Natural runtime 14/24 pass; command 24/24 chưa retest |
| 11 | Dữ liệu/business rule | `PARTIAL` | Có contract và SQL evidence cũ; nhiều rule vẫn `DRAFT`/pending owner |
| 12 | UI/renderer | `PARTIAL` | Build pass và các card chính tồn tại; chưa có browser matrix desktop/mobile/light/dark trên release khóa |
| 13 | Refresh/failure handling | `PARTIAL` | Resilience source 5/5; refresh ngầm công nợ có code nhưng chưa có browser runtime evidence hoàn chỉnh |
| 14 | Security/privacy/audit | `FAIL` | Anonymous fail-closed không đạt; request ID/audit runtime chưa được xác minh toàn đường đi |
| 15 | Performance/stability | `FAIL` | p95 load đạt dưới 5 giây nhưng chỉ 70% request thành công; một số account p95 7,6–14,8 giây |
| 16 | UAT/documentation | `PARTIAL_PASS` | Có hướng dẫn và kế hoạch 13 account; runtime current release chưa pass |
| 17 | Gói hỗ trợ khách test | `PARTIAL` | Có tài liệu sử dụng/test; còn thiếu release note khóa, known-issues được duyệt và đầu mối support chính thức |
| 18 | UAT nội bộ | `FAIL` | Smoke Sale/Manager 6/8; coverage 24 chưa đạt; 13 account chỉ 3 full pass |

## 5. Ma trận 24 chức năng

`@ runtime` được ghi `CHƯA RETEST` nếu audit này chưa gọi lại lệnh command trên đúng release. `Natural runtime` là kết quả của bộ live 31 case với một Manager và một Sale; hai vai trò cho cùng mẫu lỗi.

| # | Chức năng/API | Khai báo source | `@` runtime | Natural runtime | Ghi chú |
|---:|---|---|---|---|---|
| 1 | `@doanh_so` | PASS | CHƯA RETEST | PASS | Đi đúng API |
| 2 | `@hoa_don` | PASS | CHƯA RETEST | PASS | Đi đúng API |
| 3 | `@hoa_don_chi_tiet` | PASS | CHƯA RETEST | PASS | Đi đúng API |
| 4 | `@don_hang` | PASS | CHƯA RETEST | FAIL | HTTP 422 |
| 5 | `@cham_diem_kh` | PASS | CHƯA RETEST | PASS | Đi đúng API |
| 6 | `@cong_no_khach_hang` | PASS | CHƯA RETEST | PASS | Đi đúng API |
| 7 | `@cong_no_chi_tiet` | PASS | CHƯA RETEST | FAIL | HTTP 500 với AG0031 |
| 8 | `@tich_luy` | PASS | CHƯA RETEST | FAIL | HTTP 500 với AG0031 |
| 9 | `@tuyen_ban_hang` | PASS | CHƯA RETEST | PASS | Đi đúng API |
| 10 | `@goi_ydon_hang` | PASS | CHƯA RETEST | FAIL | HTTP 500 với AG0031 |
| 11 | `@upsell_goi_y` | PASS | CHƯA RETEST | PASS | Đi đúng API |
| 12 | `@goi_ydon_thuoc` | PASS | CHƯA RETEST | PASS | Đi đúng API |
| 13 | `@danh_sach_tonkho` | PASS | CHƯA RETEST | PASS | Đi đúng API |
| 14 | `@tra_cuu_san_pham` | PASS | CHƯA RETEST | FAIL | HTTP 200 nhưng body rỗng/JSON không hợp lệ |
| 15 | `@san_pham_trong_tam` | PASS | CHƯA RETEST | PASS | Đi đúng API |
| 16 | `@de_xuat_khuyen_mai` | PASS | CHƯA RETEST | PASS | Đi đúng API |
| 17 | `@danh_muc` | PASS | CHƯA RETEST | FAIL | HTTP 422 |
| 18 | `@khao_sat360` | PASS | CHƯA RETEST | FAIL | Gọi nhầm API danh sách câu hỏi |
| 19 | `@danh_sach_cau_hoi_khao_sat` | PASS | CHƯA RETEST | PASS | Đi đúng API |
| 20 | `@kiem_tra_khao_sat` | PASS | CHƯA RETEST | FAIL | Gọi nhầm API danh sách câu hỏi |
| 21 | `@kiem_tra_khao_sat_ngay` | PASS | CHƯA RETEST | FAIL | Gọi nhầm API danh sách câu hỏi |
| 22 | `@lich_su_khao_sat` | PASS | CHƯA RETEST | FAIL | Gọi nhầm API danh sách câu hỏi |
| 23 | `@thong_bao` | PASS | CHƯA RETEST | PASS | Đi đúng API |
| 24 | `@tim_san_pham_theo_trieu_chung` | PASS | CHƯA RETEST | PASS | Đi đúng API |

**Tổng natural runtime:** 14 PASS / 10 FAIL.  
**Kết luận parity:** chưa đạt; không được suy ra command PASS từ việc API có trong config.

## 6. Kết quả 13 tài khoản

| Vai trò | Tài khoản | Kết quả | p95 | Lỗi chính |
|---|---|---:|---:|---|
| Manager | QLBH005.MED | 6/8 | 3.728 ms | Công nợ chi tiết, gợi ý đơn hàng HTTP 500 |
| Manager | QLBH010.MED | 6/8 | 3.357 ms | Cùng lỗi trên |
| Manager | QLBH013.MED | 6/8 | 3.573 ms | Cùng lỗi trên |
| Manager | QLBH016.MED | 6/8 | 3.521 ms | Cùng lỗi trên |
| Manager | QLBH024.MED | 8/8 | 7.593 ms | Chức năng pass nhưng chậm |
| Manager | QLMD1 | 8/8 | 14.789 ms | Chức năng pass nhưng vượt ngưỡng natural 8 giây |
| Manager | QLMN2 | 8/8 | 14.709 ms | Chức năng pass nhưng vượt ngưỡng natural 8 giây |
| Sale | BACNINHA.MED | 6/8 | 3.429 ms | Công nợ chi tiết, gợi ý đơn hàng HTTP 500 |
| Sale | BinhPhuocA | 6/8 | 3.494 ms | Cùng lỗi trên |
| Sale | CanThoA | 6/8 | 3.355 ms | Cùng lỗi trên |
| Sale | DANANGA.MED | 6/8 | 3.414 ms | Cùng lỗi trên |
| Sale | HUEB.MED | 6/8 | 3.493 ms | Cùng lỗi trên |
| Sale | NAMDINHB.MED | 6/8 | 3.479 ms | Cùng lỗi trên |

Khả năng cao fixture cố định `AG0031` không phù hợp scope/dữ liệu của nhiều tài khoản, hoặc backend đang biến `OUT_OF_SCOPE/NO_DATA` thành HTTP 500. Audit hiện tại **chưa đủ log để chọn một trong hai nguyên nhân**. Dù nguyên nhân nào, trải nghiệm hiện tại vẫn không đạt: ngoài scope hoặc không có dữ liệu phải trả mã nghiệp vụ rõ, không được trả lỗi hệ thống.

## 7. Kết quả tải và độ ổn định

Thiết lập: 40 request, concurrency 4, một Manager hợp lệ.

| Chỉ số | Kết quả | Mục tiêu tham khảo | Trạng thái |
|---|---:|---:|---|
| Success rate | 70% | >= 99% | FAIL |
| Throughput | 2,07 request/giây | Chưa khóa | Tham khảo |
| p50 | 1.915 ms | — | Tham khảo |
| p95 | 3.564 ms | <= 5.000 ms trong suite | PASS tốc độ |
| p99 | 3.939 ms | — | Tham khảo |
| HTTP 500 | 12/40 | 0 lỗi hệ thống lặp lại | FAIL |

Nút thắt hiện tại là **độ đúng và độ ổn định**, không phải p95 thuần túy. Tối ưu query trước khi đóng lỗi 500 sẽ không làm release đạt Pilot.

## 8. Findings P0–P3

### `AUD-P0-001` — Gateway chat không fail-closed khi thiếu đăng nhập

- **Severity:** P0
- **Mô tả:** Request không có token nhận HTTP 200 và `{}`.
- **Evidence:** `npm run test:auth:gate`; kiểm tra lại bằng request ASCII; route [`server.js`](../server.js) `/api/chat` chỉ forward header, chưa chặn Authorization rỗng tại gateway.
- **Ảnh hưởng runtime:** Client không phân biệt được chưa đăng nhập với response thành công rỗng; phá contract security và audit.
- **Tái hiện:** Gửi POST `/api/chat` không Authorization với câu nghiệp vụ.
- **Mong đợi:** HTTP 401/403, mã `AUTH_REQUIRED` hoặc tương đương, không gọi downstream.
- **Khuyến nghị:** Chặn tại gateway trước khi forward; giữ Auth Guard ở n8n như lớp thứ hai.
- **Retest:** Anonymous gate, token rỗng, token sai, token hết hạn; xác nhận n8n/SQL không có execution cho request bị chặn.

### `AUD-P0-002` — Bốn intent khảo sát gọi nhầm API

- **Severity:** P0
- **Mô tả:** `@khao_sat360`, kiểm tra khảo sát, kiểm tra theo ngày và lịch sử đều rơi về API danh sách câu hỏi.
- **Evidence:** Hai report live Manager/Sale, reason `WRONG_API:@danh_sach_cau_hoi_khao_sat`.
- **Ảnh hưởng runtime:** Câu tự nhiên trả sai nghiệp vụ; vi phạm điều kiện NO-GO.
- **Tái hiện:** Gửi lần lượt bốn câu chuẩn trong catalog live.
- **Mong đợi:** Mỗi câu map đúng canonical intent/API trong registry.
- **Khuyến nghị:** Rà intent examples/priority, minimum margin và node chuyển canonical request; không tạo bảng map phụ.
- **Retest:** 4 câu chuẩn + không dấu + câu thiếu tham số cho mỗi intent, cả Sale và Manager.

### `AUD-P0-003` — 13-account smoke chưa đạt

- **Severity:** P0 đối với quyết định giao khách
- **Mô tả:** 10/13 tài khoản chỉ đạt 6/8; lỗi lặp lại ở công nợ chi tiết và gợi ý đơn hàng.
- **Evidence:** [`reports/audit-13-accounts/summary.json`](../reports/audit-13-accounts/summary.json).
- **Ảnh hưởng runtime:** Phần lớn tài khoản Pilot sẽ gặp lỗi ngay ở luồng cốt lõi.
- **Tái hiện:** Chạy smoke current release cho danh sách 7 Manager, 6 Sale.
- **Mong đợi:** 13/13 có response nghiệp vụ hợp lệ; ngoài scope/no data phải có taxonomy đúng.
- **Khuyến nghị:** Tạo fixture theo đúng scope từng account hoặc chọn entity động trong scope; sửa lỗi taxonomy 500.
- **Retest:** 8 core flow/account, lưu request ID và entity đã chọn cho từng account.

### `AUD-P0-004` — Chưa khóa được runtime n8n duy nhất

- **Severity:** P0 vận hành
- **Mô tả:** Snapshot runtime có hai `AI · Intent Parser (V4 Sub-Flow)` cùng active; source và runtime normalized definition khác nhau.
- **Evidence:** [`runtime-workflows.export.json`](../reports/runtime-workflows.export.json), workflow IDs `ZQPz...` và `Gn7n...`; semantic hash audit trong phiên này.
- **Ảnh hưởng runtime:** Không xác định chắc parser nào xử lý request; rollback và tái hiện lỗi không đáng tin cậy.
- **Tái hiện:** Export active workflows, so tên/ID/updatedAt/active và normalized node parameters/connections với source.
- **Mong đợi:** Một parser canonical active; source, export và release manifest khớp checksum.
- **Khuyến nghị:** Chụp backup, xác định webhook/consumer thực tế, tắt bản dư sau approval, publish bản canonical và lưu checksum.
- **Retest:** Export lại runtime; xác nhận một active parser và parity hash/release manifest.

### `AUD-P1-001` — Năm nhóm API trả lỗi transport/response

- **Severity:** P1
- **Mô tả:** Đơn hàng và danh mục trả 422; công nợ chi tiết, tích lũy, gợi ý đơn hàng trả 500; tra cứu sản phẩm trả 200 với body không phải JSON hợp lệ.
- **Evidence:** Hai report live 31 case.
- **Ảnh hưởng:** Người dùng nhận lỗi kỹ thuật hoặc renderer không có dữ liệu.
- **Khuyến nghị:** Chuẩn hóa validation và response envelope; phân biệt `NO_DATA`, `OUT_OF_SCOPE`, `VALIDATION_ERROR`, `SYSTEM_ERROR`.
- **Retest:** Success/no-data/missing/out-of-scope cho từng API, kèm request ID.

### `AUD-P1-002` — Load success rate chỉ 70%

- **Severity:** P1
- **Evidence:** [`audit-current-manager-load.json`](../reports/audit-current-manager-load.json).
- **Ảnh hưởng:** Khi nhiều request đồng thời, tỷ lệ lỗi không chấp nhận được dù p95 còn trong ngưỡng.
- **Khuyến nghị:** Đóng lỗi 500 trước; sau đó đo pool SQL, execution n8n, retry và concurrency limit.
- **Retest:** 40/100 request ở concurrency 4/8, yêu cầu >=99% và không có burst 500.

### `AUD-P1-003` — Thiếu bằng chứng authorization âm và context isolation

- **Severity:** P1
- **Mô tả:** Biến môi trường dành cho unmapped/no-scope token đang trống; chưa có current-release evidence cho cross-region, đổi account, hai tab và failed-context.
- **Ảnh hưởng:** Không thể kết luận `SECURITY_SCOPE_PASS` dù chưa thấy leak.
- **Khuyến nghị:** Cấp token test chuyên dụng hoặc login account fixture; tuyệt đối không dùng token production trong report.
- **Retest:** Ma trận Sale ba miền, Manager ngoài quyền, payload tamper, logout/login, hai tab, follow-up sau denied.

### `AUD-P1-004` — Độ trễ không đồng đều theo tài khoản

- **Severity:** P1
- **Mô tả:** Ba account đạt chức năng đầy đủ nhưng p95 từ 7.593 đến 14.789 ms.
- **Ảnh hưởng:** Có thể timeout hoặc tạo cảm giác treo với khách Pilot.
- **Khuyến nghị:** Tách timing Gateway/n8n/SQL/renderer; dùng entity đúng scope; kiểm tra query plan luồng nặng.
- **Retest:** p95 natural <=8 giây trên cả 13 account; quick intent <=3 giây.

### `AUD-P2-001` — Worktree dirty, chưa có release artifact

- **Severity:** P2 nhưng chặn release
- **Mô tả:** Nhiều file modified/untracked ở frontend, n8n, SQL, docs, scripts và reports.
- **Ảnh hưởng:** Không biết chính xác tập file nào tạo nên bản chạy; dễ deploy thiếu hoặc trộn phiên bản.
- **Khuyến nghị:** Không xóa thay đổi người dùng. Tách commit theo frontend/n8n/SQL/docs, tạo manifest checksum, build từ commit sạch.
- **Retest:** `git status --short` sạch hoặc có danh sách ngoại lệ được ký; release manifest khớp runtime.

### `AUD-P2-002` — Encoding test/docs chưa sạch

- **Severity:** P2
- **Mô tả:** Một số chuỗi tiếng Việt trong output PowerShell/report nguồn xuất hiện mojibake; auth-gate test có literal bị mã hóa sai.
- **Ảnh hưởng:** Giảm độ tin cậy test và có nguy cơ hiển thị lỗi tiếng Việt.
- **Khuyến nghị:** Chuẩn UTF-8 không BOM theo policy dự án, sửa fixture literal và thêm test Unicode round-trip.
- **Retest:** Console/report/browser cùng hiển thị đúng chuỗi có dấu; mã ERP không bị biến đổi.

### `AUD-P2-003` — UI/browser matrix chưa được khóa theo release

- **Severity:** P2
- **Mô tả:** Build và syntax pass nhưng chưa chạy lại đầy đủ light/dark, desktop/mobile, pagination, drawer và refresh trên một release sạch.
- **Khuyến nghị:** Chạy browser UAT sau khi P0/P1 backend đóng; lưu screenshot gắn release ID và request ID.

### P3

Chưa ghi P3 trong vòng audit này. Các cải tiến thẩm mỹ hoặc predictive AI không thuộc điều kiện chặn Customer Pilot hiện tại.

## 9. Ma trận auth/scope/context

| Tình huống | Evidence hiện tại | Trạng thái |
|---|---|---|
| Login Manager hợp lệ | Có, chạy được suite | PASS |
| Login Sale hợp lệ | Có, chạy được suite | PASS |
| Request không token | HTTP 200 `{}` | FAIL |
| Token không map | Chưa có token fixture | BLOCKED |
| Token không scope | Chưa có token fixture | BLOCKED |
| Sale xem entity đúng scope | Một phần qua runtime suite | PARTIAL |
| Sale xem entity khác miền | Chưa chạy current release | NOT_RUN |
| Manager xem employee ngoài quyền | Chưa chạy current release | NOT_RUN |
| Tamper username/role/branch | Chưa chạy current release | NOT_RUN |
| Logout rồi login account khác | Chưa có runtime evidence | NOT_RUN |
| Hai tab/hai context | Static có thiết kế, runtime chưa chứng minh | PARTIAL |
| Follow-up sau denied/error | Static test có, runtime chưa chứng minh | PARTIAL |
| Mutation preview-only | Static 7/7 pass | SOURCE_PASS |

## 10. Evidence còn thiếu

1. Export/runtime checksum mới nhất sau lần publish cuối cùng.
2. Danh sách SQL object đang deploy, `modify_date` và checksum gắn cùng release ID.
3. Ma trận 24 lệnh `@` runtime trên đúng release.
4. Negative authorization suite: cross-region, employee/customer/invoice/warehouse ngoài scope.
5. Request ID xuyên Gateway -> n8n -> SQL/audit -> UI.
6. Browser UAT current release: light/dark, desktop/mobile, refresh, pagination, drawer/modal.
7. Context runtime: hai tab, logout/login, request trả ngược thứ tự, follow-up sau lỗi.
8. Failure injection: n8n down, SQL timeout, mạng mất giữa request, token hết hạn.
9. Business sign-off cho tài chính/VAT, tồn khả dụng, chương trình khuyến mãi và nội dung chuyên môn.
10. Đầu mối hỗ trợ, SLA và danh sách known issues gửi khách.

## 11. Kế hoạch khắc phục và timeline

Ước lượng dưới đây bắt đầu sau khi báo cáo được review và cho phép sửa source/runtime.

| Ưu tiên | Việc | Thành phần | Owner đề xuất | Effort | Phụ thuộc | Acceptance test |
|---:|---|---|---|---:|---|---|
| 1 | Khóa baseline và backup runtime | Git/n8n/SQL | Tech lead + Backend | 0,5 ngày | Quyền export n8n/DB | Một release ID, một active parser, checksum đầy đủ |
| 2 | Chặn anonymous tại gateway | `server.js`, auth test | Backend | 0,25 ngày | Contract error code | 401/403; không có downstream execution |
| 3 | Sửa survey intent routing | Intent map/parser/MAIN | n8n/AI Core | 0,5 ngày | Baseline đã khóa | 4 intent × chuẩn/không dấu pass đúng API |
| 4 | Sửa 500/422/body rỗng | API Execute, SQL, envelope | Backend/SQL/n8n | 1–1,5 ngày | Có request ID/log | 10 API fail chuyển thành success/no-data/validation/out-of-scope đúng |
| 5 | Chọn fixture theo scope 13 account | Test catalog/UAT data | QA + Backend | 0,5 ngày | Scope matrix | 13/13 smoke 8/8, không dùng entity ngoài scope |
| 6 | Test command/NL parity 24 API | Test runner | QA/AI Core | 0,5 ngày | Các lỗi trên đã đóng | 24/24 command + 24/24 natural chuẩn đúng API |
| 7 | Negative auth/context test | Gateway/n8n/session | Security/QA | 0,5–1 ngày | Token fixture an toàn | 0 leak, denied không commit context |
| 8 | Load và latency | Gateway/n8n/SQL | Backend/DevOps | 0,5 ngày | Runtime functional pass | >=99% success; p95 natural <=8 giây |
| 9 | Browser UAT và gói khách | Frontend/docs | Frontend/QA/BA | 0,5 ngày | Release candidate | Không crash/blank; ảnh + request ID + known issues |

### Timeline thực tế

- **Ngày 0:** Review báo cáo, đóng băng thay đổi, tạo backup/export/checksum.
- **Ngày 1:** Sửa auth gate, duplicate parser, survey routing và error envelope.
- **Ngày 2:** Sửa 10 API runtime, fixture theo scope; chạy 24 API và 13 account.
- **Ngày 3:** Negative scope/context, load test, browser UAT, tài liệu/rollback.
- **Cuối ngày 3:** Hội đồng kỹ thuật ra lại `GO/NO-GO`.

Nếu lỗi 500 nằm trong stored procedure/schema khác nhau theo miền, timeline có thể tăng thêm 1–2 ngày. Không nên cam kết Customer Pilot trước khi có request ID/log chứng minh nguyên nhân.

## 12. Điều kiện chuyển sang `CUSTOMER_PILOT_TEST_READY`

- [ ] 0 P0.
- [ ] Anonymous request bị chặn fail-closed.
- [ ] Chỉ một Intent Parser canonical active và có checksum.
- [ ] 24/24 lệnh `@` có trạng thái runtime rõ.
- [ ] 24/24 câu tự nhiên chuẩn đi đúng API.
- [ ] 8 nghiệp vụ cốt lõi deep test PASS.
- [ ] Smoke 1 Sale + 1 Manager đạt 8/8.
- [ ] 13/13 tài khoản đạt hoặc blocker ngoại vi được phê duyệt bằng văn bản.
- [ ] Negative scope/context có 0 leak.
- [ ] Load success >=99%; p95 natural <=8 giây.
- [ ] Không mutation thật.
- [ ] Có release manifest, rollback, known issues, hướng dẫn và đầu mối hỗ trợ.
- [ ] Rule chưa ký được ghi rõ `Pilot/Tham khảo`.

## 13. Kết luận cuối

Medstand AI đã có nền tảng tốt để tiếp tục hardening: 24 capability đã được định nghĩa, static classifier và resilience pass, health service tốt, frontend build được và nhiều renderer nghiệp vụ đã hoạt động. Tuy nhiên, **bản đang chạy ngày 21/07/2026 chưa phải bản nên gửi khách hàng test** vì còn lỗi security contract, wrong-route, lỗi 500 lặp lại, 13-account coverage thấp và baseline runtime chưa khóa.

Trạng thái đúng ở thời điểm báo cáo:

```text
SOURCE_PARTIAL_PASS
RUNTIME_FAIL
SECURITY_GATE_FAIL
BUSINESS_PENDING
CUSTOMER_PILOT_NO_GO
PRODUCTION_NOT_READY
```

Bước tiếp theo đúng là review báo cáo, khóa baseline, rồi sửa lần lượt bốn P0 trước. Không nên tiếp tục chỉnh UI hoặc tối ưu query rời rạc cho tới khi request đi đúng API, đúng quyền và trả đúng error taxonomy.
