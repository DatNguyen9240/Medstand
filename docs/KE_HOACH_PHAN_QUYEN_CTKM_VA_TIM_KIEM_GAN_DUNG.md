# KẾ HOẠCH HOÀN THIỆN PHÂN QUYỀN CTKM VÀ TÌM KIẾM GẦN ĐÚNG

**Ngày lập:** 05/09/2026  
**Phạm vi:** Medstand Web, AI Chatbot, Telegram và SQL Server  
**Môi trường kiểm thử:** `medtest`  
**Trạng thái:** Đang triển khai — xem mục 0.5 để biết chi tiết đã làm/chưa làm (cập nhật 06/09/2026)

## 0. Quyết định đã chốt

| Ngày | Nội dung | Kết luận |
|---|---|---|
| 05/09/2026 | Nơi khai báo CTKM chính thức | **Medstand** — admin tự cấu hình CTKM ngay trong phần Admin của phần mềm. Giữ nguyên luồng khai báo/duyệt hiện có. |
| 05/09/2026 | Vai trò của PMKT | PMKT là nơi **duyệt đơn hàng** — đơn phải qua PMKT. Không liên quan tới CTKM. |
| 05/09/2026 | Trạng thái kết nối PMKT | **Chưa kết nối.** Tạm gác ngoài phạm vi đợt này. |
| 05/09/2026 | Trạng thái `SUBMITTED` | **Không thêm.** Giữ `DRAFT → APPROVED/REJECTED` như code đang chạy. Logic hiện tại đã đáp ứng nghiệp vụ. |

Vì vậy Luồng A giữ nguyên hướng ban đầu: hoàn thiện phân quyền khai báo CTKM trong Medstand.
Mọi hạng mục liên quan tới tích hợp PMKT nằm ngoài phạm vi kế hoạch này.

## 0.5. Tình trạng triển khai (cập nhật 06/09/2026)

**Luồng A (CTKM):** chưa động tới trong đợt code này — vẫn giữ nguyên trạng thái ở mục 3.2/3.3
(phần "đã có" đang chạy đúng, phần "cần hoàn thiện" ở 3.3 vẫn còn treo). Toàn bộ tiến độ dưới
đây thuộc Luồng B.

**Luồng B (Tìm kiếm gần đúng) — theo Giai đoạn ở mục 6:**

| Giai đoạn | Trạng thái | Ghi chú |
|---|---|---|
| GĐ1 — Chốt nghiệp vụ | ✅ Xong | Xem mục 0 |
| GĐ2 — SQL và API | ✅ Xong, đã deploy + verify trên `medtest` | 4 file `sql/SEARCH-001..004` |
| GĐ3 — AI và n8n | ✅ Xong ở mức code, **chưa chạy qua n8n thật** | Xem cảnh báo bên dưới |
| GĐ4 — Web và Telegram | 🟡 Một nửa: Web lên đơn xong; Telegram chưa làm | |
| GĐ5 — QA và UAT | 🟡 Một phần: tự kiểm bằng script + trình duyệt thật; **chưa có Sale/QLBH thật bấm thử** | |
| GĐ6 — Đưa lên server | ❌ Chưa làm | Đúng kế hoạch — chỉ làm sau khi UAT xong |

### Đã làm (có bằng chứng chạy thật trên `medtest`)

**SQL nền tảng (GĐ2)** — 4 file mới, đã deploy thật, verify bằng dữ liệu thật:
- [`sql/SEARCH-001_Selection_Token_Schema_AI.sql`](../sql/SEARCH-001_Selection_Token_Schema_AI.sql) — bảng + API phát hành/tiêu thụ token chọn kết quả.
- [`sql/SEARCH-002_Scope_Guard_AI.sql`](../sql/SEARCH-002_Scope_Guard_AI.sql) — chặn tìm kiếm khi không xác định được phạm vi (chống lặp lại lỗi CORE-001/TRUNGBM thấy hết 49.559 khách).
- [`sql/SEARCH-003_Customer_Search_AI.sql`](../sql/SEARCH-003_Customer_Search_AI.sql) — tìm khách hàng có xếp hạng.
- [`sql/SEARCH-004_Product_Search_AI.sql`](../sql/SEARCH-004_Product_Search_AI.sql) — tìm sản phẩm có xếp hạng.
- Đăng ký vào `API_Definition`/`API_Field` ngay trong 4 file trên; đăng ký thêm vào `src/server/order-status-guard.js` (identity server tiêm) và `n8n/API_Services/API_Execute.json` (cho AI/chatbot gọi được).

**Chặn "tự lấy dòng đầu" (GĐ3) — 8/8 stored procedure nghiệp vụ đã sửa, deploy thật:**
`API_CongNoKhachHang_AI`, `API_CongNoChiTiet_AI`, `API_DoanhSo_AI`, `API_DonHang_AI`,
`API_HoaDon_AI`, `API_GoiYDonHang_AI`, `API_ChamDiemKH_AI`, `API_TichLuy_AI`. Mỗi SP: khớp
đúng 1 khách vẫn tự động như cũ (test hồi quy before/after byte-identical); khớp ≥2 khách trả
`MsgType=2, Code='NEEDS_SELECTION'` kèm tối đa 8 gợi ý thay vì đoán bừa.

Đã đóng luôn đường tắt tương tự ở tầng n8n: khối "GLOBAL SMART CUSTOMER RESOLUTION" trong
`n8n/API_Services/API_Execute.json` (node *Build Execute SQL*) — trước đây tầng này tự resolve
TOP 1 rồi ghi đè tham số TRƯỚC KHI gọi SP, vô hiệu hoá luôn 8 chỗ vừa sửa ở trên nếu không đóng.
Đã verify bằng cách trích đúng đoạn JS của 3 node (*Build Execute SQL* → *Format Execute
Response* → `MAIN_ChatBot_V5.json`'s *Format Response*) chạy trong sandbox Node, gọi thẳng vào
`medtest` — xác nhận `NEEDS_SELECTION` + danh sách 8 gợi ý sống sót nguyên vẹn xuyên suốt cả
chuỗi, và ca khớp-đúng-1 vẫn `SUCCESS` bình thường.

> **Cảnh báo quan trọng:** phần n8n ở trên được verify bằng cách chạy đúng đoạn mã trong sandbox,
> **không phải chạy qua một n8n instance thật đang sống**. Trước khi coi GĐ3 là "xong" theo đúng
> nghĩa GĐ5 (UAT), cần import lại 2 workflow đã sửa
> (`n8n/API_Services/API_Execute.json`, `n8n/AI_Core/MAIN_ChatBot_V5.json`) vào n8n thật và thử
> một hội thoại chatbot thật (SEARCH-15).

**Web lên đơn (GĐ4, một phần) — verify bằng trình duyệt thật (Puppeteer + Chrome) qua server +
gateway + `medtest` thật, không phải mock:**
- [`src/js/pages/create-order.js`](../src/js/pages/create-order.js) và
  [`src/js/pages/edit-order.js`](../src/js/pages/edit-order.js): ô khách hàng/sản phẩm chuyển
  sang `API_CustomerSearch_AI` / `API_ProductSearch_AI`, không còn gọi `API_KhachHangList` /
  `API_DanhMuc_AI` cũ. Nhiều khách trùng tên hiện label kèm SĐT + chi nhánh để phân biệt; bấm
  đúng 1 dòng thì form nhận đúng mã đó (không tự chọn dòng đầu).
- [`env.js`](../env.js): thêm 2 endpoint `FILTER.CUSTOMER_SEARCH`, `FILTER.PRODUCT_SEARCH`.
- [`src/js/components/FormSelect.js`](../src/js/components/FormSelect.js): vá luôn một lỗ hổng
  phát hiện dọc đường — picker chèn thẳng tên khách/sản phẩm vào HTML không escape (XSS tiềm
  ẩn qua tên khách có chứa `<`, `>`, `&`, `"`).

Script tái chạy được: `scripts/preflight_search_phase1.js` và
`scripts/preflight_search_00{5..9,10,11,12}_*.js` (SQL, cần `node ... ` không tham số để deploy
thật hoặc `--preflight` để chỉ xem trước/rollback), `scripts/verify_search_003_004_web_e2e.js`
và `scripts/verify_search_003_004_edit_order_e2e.js` (web, cần `node server.js` chạy sẵn ở cổng
3000 và Chrome cài ở đường dẫn mặc định).

### Chưa làm

- **Web chatbot (GĐ4):** nút bấm cho danh sách `NEEDS_SELECTION` — hiện chatbot đã nhận đúng tín
  hiệu này (xác nhận ở trên) nhưng widget web (`chatbot-widget/js/`) chưa có giao diện chọn kèm
  nút bấm. Nếu bật cho người dùng thật ngay bây giờ, ca nhiều khách trùng qua chatbot web nhiều
  khả năng hiện dưới dạng danh sách thô, không bấm chọn được.
- **Telegram (GĐ4):** hoàn toàn chưa làm — inline button, token ngắn hạn qua callback, xử lý
  trong `n8n/Telegram/TG_ChatBot_Demo.json`.
- **UAT với người dùng thật (GĐ5):** chưa có Sale/QLBH thật thao tác; tài liệu này tự kiểm bằng
  script tự động, không thay thế được UAT.
- **Đưa lên server (GĐ6):** chưa làm, đúng trình tự kế hoạch.
- **Luồng A (CTKM):** mục 3.3 (audit đầy đủ, màn hình xem quyền/lịch sử, test đồng thời) vẫn
  còn nguyên, chưa động tới trong đợt Luồng B.

## 1. Mục tiêu

Kế hoạch này xử lý hai nội dung:

1. Hoàn thiện phần phân quyền khai báo chương trình khuyến mãi/chương trình bán hàng (`CTKM/CTBH`).
2. Cho phép người dùng tìm khách hàng hoặc sản phẩm bằng mã, tên, số điện thoại hoặc một phần từ khóa; nếu có nhiều kết quả, hệ thống phải cho người dùng chọn trước khi tra cứu nghiệp vụ.

Hệ thống không yêu cầu Sale hoặc QLBH phải nhớ toàn bộ mã khách hàng và mã sản phẩm.

Việc duyệt đơn hàng qua PMKT chưa được kết nối, nằm ngoài phạm vi kế hoạch này. Trong app, kế toán vẫn không có quyền thao tác đơn hàng như hiện trạng.

## 2. Nguyên tắc thực hiện

- Identity phải lấy từ phiên đăng nhập hoặc Telegram ticket đã xác thực.
- Không tin `Username`, mã khách hàng hoặc mã sản phẩm do client tự khai báo nếu chưa kiểm tra lại phạm vi.
- Không tự động chọn kết quả đầu tiên khi có nhiều khách hàng hoặc sản phẩm trùng khớp.
- Mọi API tìm kiếm phải giới hạn dữ liệu theo Sale, QLBH, chi nhánh và quyền hiện hành.
- CTKM do admin Medstand cấu hình; PMKT chỉ liên quan duyệt đơn hàng và hiện chưa kết nối.
- Các thay đổi SQL phải có script preflight/rollback và được kiểm thử trên `medtest` trước khi triển khai server.

## 3. Luồng A — Hoàn thiện phân quyền khai báo CTKM

### 3.1. Ma trận quyền dự kiến

| Nhóm tài khoản | Xem | Tạo nháp | Sửa nháp | Duyệt/từ chối | Thu hồi | Xem lịch sử | Phạm vi |
|---|---:|---:|---:|---:|---:|---:|---|
| Sale | Không | Không | Không | Không | Không | Không | Không áp dụng |
| QLBH | Có | Có | Có | Không | Không | Có | Chi nhánh phụ trách |
| Admin/BGD/GD/SADM | Có | Có | Có | Có | Có | Có | Toàn hệ thống |

> Ma trận này là bản chính thức áp dụng. Seed quyền tương ứng ở `sql/PROMO-AUTH-001_Permission_Matrix_AI.sql`.

### 3.2. Phần đã có

- Bảng chính sách quyền theo `USER`, `USER_GROUP` và `MANAGER_FLAG`.
- Quyền theo từng hành động: xem, tạo, sửa, duyệt, từ chối, thu hồi và xem lịch sử.
- SQL/gateway kiểm tra quyền bằng identity do server xác định.
- QLBH bị giới hạn trong chi nhánh của mình.
- Người tạo không được tự duyệt hoặc tự từ chối chương trình của mình.
- UI đã ẩn/hiện nút theo quyền trả về từ server.

Chuỗi dữ liệu CTKM đã kiểm chứng trong code (05/09/2026) — toàn bộ nằm trong Medstand, đang chạy:

```text
Màn hình promotion-admin (src/js/pages/promotion-admin.js)
  → API_PromotionProgram_Upsert_AI / _Approve_AI   (PROMO-CFG-001)
  → AI_PromotionProgramTbl + BranchScope/UserGroupScope/ItemRule   (PROMO-001)
  → AI_ApprovedPromotionItemRuleVw                 lọc Status='APPROVED', còn hiệu lực
  → AI_ActivePromotionByUserFnc                    (PROMO-002)
      ├→ API_CTBHSanPham_AI                        chatbot tra CTBH theo sản phẩm
      ├→ API_PromotionActiveByItems_AI             xem trước CTBH ở màn hình lên đơn
      └→ API_DonHangChiTiet_Insert_AI              tính giá đơn hàng thật
```

Ghi nhận để tránh hiểu nhầm về sau: đây là đường ghi CTKM duy nhất và nó thuộc Medstand.
Không được tắt `API_PromotionProgram_Upsert_AI` — tắt là đơn hàng thật mất khuyến mãi, hỏng âm thầm.

### 3.3. Phần cần hoàn thiện

1. Giữ chức năng tạo/sửa nháp theo ma trận quyền mục 3.1.
2. Bổ sung đầy đủ audit cho thay đổi quyền và thay đổi chương trình.
3. Hoàn thiện màn hình xem quyền hiện tại và lịch sử thao tác.
4. Kiểm thử đồng thời để tránh hai người sửa hoặc duyệt cùng một phiên bản.

> Không bổ sung trạng thái `SUBMITTED` (quyết định 05/09/2026). Vòng đời CTKM giữ nguyên
> `DRAFT → APPROVED/REJECTED`, và `APPROVED → WITHDRAWN` khi thu hồi.

### 3.4. Kiểm thử bắt buộc cho CTKM

- Sale không xem hoặc khai báo được CTKM.
- QLBH tạo/sửa được bản nháp đúng chi nhánh.
- QLBH bị chặn khi chọn chi nhánh khác.
- QLBH không có quyền duyệt, từ chối hoặc thu hồi.
- Người tạo không tự duyệt hoặc tự từ chối.
- Tài khoản toàn cục duyệt được chương trình do người khác tạo.
- Tài khoản bị khóa không sử dụng được API.
- Giả `Username` trong request không làm thay đổi identity thực tế.
- Audit ghi đúng người, hành động, thời gian và phiên bản.
- CTKM vừa duyệt xong áp đúng giá khi tạo đơn hàng thật.

## 4. Luồng B — Tìm kiếm gần đúng và chọn kết quả

### 4.1. API tìm kiếm dùng chung

Dự kiến tạo hai API:

- `API_CustomerSearch_AI`
- `API_ProductSearch_AI`

Hai API nhận tối thiểu:

| Tham số | Ý nghĩa |
|---|---|
| `@Username` | Identity do server gắn |
| `@SearchText` | Chuỗi người dùng nhập |
| `@TopN` | Số kết quả tối đa, mặc định khoảng 8 |

### 4.2. Quy tắc tìm khách hàng

- Tìm theo mã khách, tên khách, tên cửa hàng và số điện thoại.
- Hỗ trợ một phần mã hoặc một phần tên.
- Không phân biệt chữ hoa/chữ thường.
- Hỗ trợ chuỗi có dấu và không dấu.
- Chỉ tìm trong tập khách hàng người dùng được phép xem.
- Dùng `CodeChinh` để hỗ trợ trường hợp khách hàng đã đổi mã.

### 4.3. Quy tắc tìm sản phẩm

- Tìm theo mã sản phẩm, tên sản phẩm và từ khóa sản phẩm.
- Loại sản phẩm bị khóa tại chi nhánh nếu nghiệp vụ yêu cầu hàng đang bán.
- Tra CTBH có thể trả sản phẩm không còn tồn kho nhưng vẫn phải giới hạn theo phạm vi chương trình và chi nhánh.
- Không trả metadata hoặc điều kiện nội bộ ngoài quyền của tài khoản.

### 4.4. Thứ tự xếp hạng

1. Khớp chính xác mã.
2. Mã bắt đầu bằng chuỗi tìm kiếm.
3. Tên bắt đầu bằng chuỗi tìm kiếm.
4. Tên hoặc từ khóa chứa chuỗi tìm kiếm.
5. Khớp theo các token trong tên.

Giai đoạn đầu tập trung vào tìm theo ký tự, có dấu/không dấu và token. Sửa lỗi chính tả nâng cao chỉ bổ sung sau nếu UAT xác nhận cần thiết.

### 4.5. Luồng xử lý AI

```text
Người dùng nhập tên hoặc một phần từ khóa
→ AI nhận diện loại thực thể cần tìm
→ API tìm trong phạm vi tài khoản
→ 0 kết quả: yêu cầu nhập lại
→ 1 kết quả: dùng ID chuẩn để gọi API nghiệp vụ
→ nhiều kết quả: trả danh sách lựa chọn
→ người dùng chọn một kết quả
→ server kiểm tra lại identity và phạm vi
→ gọi API nghiệp vụ bằng ID chuẩn
```

Không được âm thầm lấy dòng đầu tiên khi có nhiều kết quả.

### 4.6. Giao diện lựa chọn

#### Web

- Tái sử dụng combobox tìm kiếm hiện có của màn hình lên đơn.
- Hiển thị mã, tên và thông tin phân biệt như số điện thoại hoặc chi nhánh.
- Chỉ gán ID vào biểu mẫu sau khi người dùng chọn một kết quả.

#### Telegram

- Hiển thị tối đa khoảng 8 lựa chọn bằng inline button hoặc danh sách đánh số.
- Mỗi lựa chọn sử dụng token ngắn hạn thay vì tin trực tiếp mã gửi từ client.
- Token phải gắn với tài khoản, phiên chat, loại thực thể và thời gian hết hạn.
- Khi người dùng chọn, server phải kiểm tra lại phạm vi trước khi thực hiện tra cứu.
- Thời gian hiệu lực đề xuất: 5–10 phút.

Ví dụ phản hồi:

```text
Tìm thấy 3 khách hàng:

1. KH001 – Nhà thuốc Minh Anh – 090...
2. KH028 – Quầy thuốc Minh Anh – Bình Dương
3. KH115 – NT Minh Anh 2 – An Giang

Bạn muốn chọn khách hàng nào?
```

### 4.7. Phạm vi nghiệp vụ áp dụng đợt đầu

- Công nợ khách hàng.
- Doanh số theo khách hàng.
- Gợi ý đơn hàng.
- Gợi ý bán kèm.
- Tích lũy và khảo sát.
- Tồn kho sản phẩm.
- Tra cứu thông tin sản phẩm.
- CTBH theo sản phẩm.

Sau khi luồng tra cứu ổn định mới mở rộng nhập tên khách hàng/sản phẩm trực tiếp trong lệnh tạo đơn nháp Telegram.

## 5. Kiểm thử tìm kiếm bắt buộc

| Mã test | Trường hợp | Kết quả mong đợi | Trạng thái |
|---|---|---|---|
| SEARCH-01 | Nhập đúng mã khách hàng | Chọn đúng khách trong phạm vi | ✅ PASS — SQL + web E2E |
| SEARCH-02 | Nhập một phần mã khách | Trả danh sách đã xếp hạng | ✅ PASS — SQL trực tiếp |
| SEARCH-03 | Nhập tên khách có dấu | Trả đúng khách phù hợp | ✅ PASS — SQL + web E2E |
| SEARCH-04 | Nhập tên khách không dấu | Kết quả tương đương chuỗi có dấu | ✅ PASS — SQL trực tiếp |
| SEARCH-05 | Nhiều khách trùng tên | Bắt buộc người dùng chọn | ✅ PASS — cả 8 SP nghiệp vụ + web E2E |
| SEARCH-06 | Khách thuộc Sale khác | Không xuất hiện trong kết quả | ✅ PASS — SQL trực tiếp (BACNINHA.MED không thấy DL011) |
| SEARCH-07 | Nhập đúng mã sản phẩm | Chọn đúng sản phẩm | ✅ PASS — SQL + web E2E |
| SEARCH-08 | Nhập một phần tên sản phẩm | Trả danh sách sản phẩm phù hợp | ✅ PASS — web E2E |
| SEARCH-09 | Nhiều sản phẩm gần giống | Không tự chọn dòng đầu | 🟡 Đảm bảo bởi thiết kế (luôn trả danh sách, không có bước "đoán 1"), chưa test riêng với dữ liệu nhiều sản phẩm trùng tên |
| SEARCH-10 | Không có kết quả | Hỏi người dùng nhập lại | ✅ PASS — SQL, cả khách lẫn sản phẩm |
| SEARCH-11 | Chọn số/nút không hợp lệ | Từ chối an toàn | ✅ PASS — chọn ID ngoài danh sách bị từ chối |
| SEARCH-12 | Selection token hết hạn | Yêu cầu tìm lại | ✅ PASS (proxy: token chưa từng issue — cùng nhánh mã lỗi với hết hạn) |
| SEARCH-13 | Token của tài khoản khác | Từ chối và không lộ dữ liệu | ✅ PASS — SQL trực tiếp |
| SEARCH-14 | `CTBH Antrinano` | Đi đúng API CTBH sản phẩm | ❌ Chưa test — `API_CTBHSanPham_AI` không đổi trong đợt này |
| SEARCH-15 | `Công nợ nhà thuốc Minh Anh` | Tìm khách trước, sau đó mới tra công nợ | 🟡 Cơ chế verify bằng sandbox chạy đúng code n8n + `medtest` thật; **chưa chạy qua hội thoại chatbot thật** (cần n8n instance thật, xem mục 0.5) |

## 6. Trình tự triển khai

### Giai đoạn 1 — Chốt nghiệp vụ

1. ~~Xác nhận nơi khai báo CTKM chính thức~~ — **đã chốt: Medstand** (mục 0).
2. ~~Xác nhận có cần trạng thái `SUBMITTED`~~ — **đã chốt: không thêm** (mục 0).
3. Chốt các trường hiển thị để phân biệt khách/sản phẩm trùng tên.
4. Chốt phạm vi đợt đầu là tra cứu; tạo đơn nháp bằng tên triển khai sau.

### Giai đoạn 2 — SQL và API — ✅ Xong

1. ~~Tạo API tìm khách hàng có scope~~ — `API_CustomerSearch_AI` ([SEARCH-003](../sql/SEARCH-003_Customer_Search_AI.sql)).
2. ~~Tạo API tìm sản phẩm có scope~~ — `API_ProductSearch_AI` ([SEARCH-004](../sql/SEARCH-004_Product_Search_AI.sql)).
3. ~~Tạo selection token gắn identity và thời gian hết hạn~~ — [SEARCH-001](../sql/SEARCH-001_Selection_Token_Schema_AI.sql), TTL 7 phút.
4. ~~Bổ sung audit và chỉ mục cần thiết~~ — audit qua `AI_WriteAuditLog`; chặn fail-open qua [SEARCH-002](../sql/SEARCH-002_Scope_Guard_AI.sql).
5. ~~Viết preflight, rollback và test dữ liệu thật trên `medtest`~~ — `scripts/preflight_search_phase1.js`, đã chạy PASS và deploy thật.

### Giai đoạn 3 — AI và n8n — ✅ Xong ở mức code, ⚠️ chưa chạy qua n8n thật

1. ~~Giữ nguyên cụm từ người dùng nhập làm `searchText`~~ — không đổi hành vi tham số.
2. Entity resolver hiện nằm NGAY TRONG từng SP nghiệp vụ (đếm khớp trước khi resolve) thay vì
   một bước riêng trước API nghiệp vụ — chọn cách này vì rủi ro thấp hơn (không phải viết lại
   luồng gọi API ở tầng n8n, chỉ cần đóng đúng chỗ đang tự đoán). Đã áp dụng cho 8/8 SP nghiệp vụ
   liệt kê ở mục 0.5.
3. ~~Xử lý ba trạng thái~~ — thực tế dùng hai trạng thái đủ dùng: `NO_MATCH` (`MsgType=1`) và
   `NEEDS_SELECTION` (`MsgType=2` kèm `CandidateJson`); khớp đúng 1 thì SP tự resolve và chạy
   tiếp như route `EXACT_MATCH` mà không cần một trạng thái riêng để phân biệt.
4. ~~Lưu ngữ cảnh lựa chọn có thời hạn~~ — bảng `AI_SelectionToken` (giai đoạn 2).
5. ~~Kiểm tra lại quyền khi người dùng chọn~~ — `API_SelectionToken_Consume_AI` re-check
   `AR_GetObjectByUserFnc` tại thời điểm tiêu thụ token, không chỉ tin token lúc issue.

Đã đóng thêm đường tắt tự resolve ở tầng n8n (`API_Execute.json`) và nối `NEEDS_SELECTION`
xuyên suốt `MAIN_ChatBot_V5.json` — xem mục 0.5 để biết giới hạn của cách verify (sandbox, chưa
phải n8n thật).

### Giai đoạn 4 — Web và Telegram — 🟡 Một nửa: web lên đơn xong, chatbot/Telegram chưa

1. ~~Nối API mới vào combobox web~~ — `create-order.js`, `edit-order.js`, verify bằng trình
   duyệt thật. Chatbot web (`chatbot-widget/js/`) **chưa nối nút bấm chọn** cho `NEEDS_SELECTION`.
2. Inline button/lựa chọn đánh số trên Telegram — **chưa làm**.
3. ~~Không tự động lấy kết quả đầu tiên~~ — đúng cho web lên đơn và toàn bộ tầng SQL/n8n.
4. ~~Hiển thị thông tin đủ để phân biệt~~ — label kèm SĐT + chi nhánh trên web lên đơn.

### Giai đoạn 5 — QA và UAT — 🟡 Một phần

1. ~~Chạy build và kiểm tra gateway identity~~ — `npm run build` PASS,
   `scripts/verify_order_status_guard.js` PASS.
2. Test CTKM — không áp dụng đợt này (Luồng A không đổi).
3. ~~Chạy toàn bộ test tìm kiếm~~ — SEARCH-01..13 PASS (mục 5); SEARCH-14 chưa test; SEARCH-15
   mới verify ở mức sandbox.
4. UAT bằng Sale/QLBH thật — **chưa làm**, mới có script tự động + trình duyệt tự động.
5. Kiểm tra lại chatbot web — **chưa làm** (phụ thuộc Giai đoạn 4 mục chatbot).

### Giai đoạn 6 — Đưa lên server

1. Rotate Telegram bot token đã lộ và cập nhật secret mới trên server.
2. Không commit `.env` hoặc secret vào Git.
3. Backup/export cấu hình n8n hiện hành.
4. Triển khai SQL vào đúng database đích.
5. Build frontend production.
6. Import/publish workflow n8n.
7. Smoke một Sale và một QLBH.
8. Smoke đủ 13 tài khoản Telegram trước khi mở rộng sử dụng.

## 7. Điều kiện nghiệm thu

| Điều kiện | Trạng thái |
|---|---|
| Người dùng không cần nhớ mã khách hàng hoặc mã sản phẩm | ✅ Đạt trên web lên đơn; ❌ chưa đạt trên chatbot web/Telegram (chưa có nút chọn) |
| Một kết quả được chọn tự động; nhiều kết quả bắt buộc có bước lựa chọn | ✅ Đạt ở tầng SQL + n8n (8/8 SP + global resolver) và web lên đơn |
| Sale và QLBH không thấy dữ liệu ngoài phạm vi | ✅ Đạt — kể cả ca fail-open kiểu CORE-001 (tài khoản thiếu sơ đồ tổ chức bị chặn thay vì thấy hết) |
| Selection token không thể dùng chéo tài khoản hoặc sau khi hết hạn | ✅ Đạt, verify trực tiếp bằng SQL |
| CTBH theo sản phẩm trả đúng dữ liệu có cấu trúc và không suy đoán từ RAG | ⚪ Không đổi trong đợt này (`API_CTBHSanPham_AI` giữ nguyên) |
| QLBH chỉ khai báo CTKM trong chi nhánh được cấp | ⚪ Thuộc Luồng A, không đổi trong đợt này |
| Chỉ nhóm có quyền toàn cục mới được duyệt/từ chối/thu hồi | ⚪ Thuộc Luồng A, không đổi trong đợt này |
| CTKM vừa duyệt áp đúng giá khi tạo đơn hàng thật | ⚪ Thuộc Luồng A, không đổi trong đợt này |
| Build, SQL preflight, gateway test, n8n preflight và Telegram smoke đều PASS | 🟡 Build/SQL preflight/gateway test PASS; **n8n preflight trên instance thật và Telegram smoke chưa làm** |

**Kết luận:** Luồng B đủ điều kiện nghiệm thu cho **kênh web lên đơn**. Chưa đủ điều kiện nghiệm
thu tổng thể vì thiếu giao diện chọn ở chatbot web và Telegram, và chưa có UAT với người dùng
thật lẫn n8n thật.

## 8. Ước lượng

| Hạng mục | Thời gian dự kiến |
|---|---:|
| Chốt nghiệp vụ và contract | 0,5 ngày |
| SQL/API tìm kiếm và selection token | 0,5–1 ngày |
| Tích hợp AI/n8n | 0,5 ngày |
| Web và Telegram UI | 0,5 ngày |
| QA, UAT và sửa lỗi | 0,5 ngày |
| **Tổng dự kiến** | **2–3 ngày làm việc** |

Thời gian trên chưa bao gồm thời gian chờ khách hàng xác nhận nghiệp vụ hoặc cấp quyền triển khai server.
