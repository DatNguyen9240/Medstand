# Backlog task phát triển Medstand AI

**Ngày lập:** 27/07/2026  
**Nguồn trạng thái tổng hợp:** [Baseline kỹ thuật và UAT hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md)

**Mục đích:** Chuyển lộ trình phát triển thành danh sách công việc có thể phân công, thực hiện và nghiệm thu.  
**Trạng thái ban đầu:** Tất cả task bên dưới là `TODO`, trừ khi có bằng chứng mới được cập nhật trực tiếp vào tài liệu này.

---

## 1. Quy ước quản lý task

### Trạng thái

| Trạng thái | Ý nghĩa |
|---|---|
| `TODO` | Chưa bắt đầu hoặc chưa có bằng chứng thực hiện |
| `IN_PROGRESS` | Đang xử lý |
| `BLOCKED` | Không thể tiếp tục do thiếu dữ liệu, quyền hoặc quyết định nghiệp vụ |
| `READY_FOR_TEST` | Đã triển khai lên UAT và chờ kiểm thử |
| `DONE` | Đã đạt điều kiện nghiệm thu và có bằng chứng |

### Mức ưu tiên

| Mức | Ý nghĩa |
|---|---|
| `P0` | Ảnh hưởng trực tiếp đến việc khách hàng UAT hoặc an toàn hệ thống |
| `P1` | Chức năng nghiệp vụ quan trọng cần hoàn thiện sau vòng UAT đầu |
| `P2` | Nâng cấp trải nghiệm hoặc khả năng quản lý |
| `P3` | Năng lực dự báo và phát triển dài hạn |

### Quy tắc đánh dấu hoàn thành

Một task chỉ được chuyển sang `DONE` khi có đủ bằng chứng tương ứng:

- Source/config đã cập nhật và kiểm tra tĩnh đạt yêu cầu.
- Bản đúng đã được deploy/import lên UAT nếu task có thay đổi runtime.
- Test runtime đạt điều kiện nghiệm thu.
- Business owner xác nhận nếu task liên quan công thức nghiệp vụ.
- Không phát sinh lỗi nghiêm trọng trên luồng liên quan.

## 2. Giai đoạn 0 — Ổn định bản UAT

**Thời gian mục tiêu:** 28/07–10/08/2026  
**Gate hoàn thành:** `UAT_BASELINE_READY`

### Nhóm A — Khóa phiên bản và đồng bộ môi trường

- [x] **UAT-001 — Lập manifest release candidate UAT** · `P0` · `DONE`
  - Ghi rõ branch, commit SHA, phiên bản frontend và Service Worker cache.
  - Liệt kê chính xác các file SQL cần import theo thứ tự.
  - Liệt kê workflow n8n cần import, workflow ID đích và trạng thái Active mong đợi.
  - Ghi SHA-256 của các artifact quan trọng.
  - Đầu ra: một manifest duy nhất làm căn cứ cho deploy, kiểm tra runtime và rollback.
  - Nghiệm thu:
    - Manifest không dùng mô tả mơ hồ như “bản mới nhất”.
    - Mỗi artifact có đường dẫn, phiên bản/hash và thứ tự triển khai.
    - Manifest được khóa trước khi thực hiện `UAT-002`, `UAT-003` và `UAT-004`.
  - Kết quả xử lý 27/07/2026: đã tạo và khóa source manifest `../release/UAT_MANIFEST_2026-07-27_11.110.md` cho candidate `hoangdang@bfbaf7e092a10d4839f434427527e4c862b61796`, frontend `11.110`, cache `medstand-11.110`, SQL và n8n kèm SHA-256, deploy order, smoke test và rollback set.
  - Phạm vi `DONE`: hoàn tất manifest source candidate. Bằng chứng môi trường UAT chạy đúng manifest vẫn thuộc `UAT-002`, `UAT-003` và `UAT-004`.
  - Kết quả đã được gom vào [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md); manifest gốc vẫn nằm trong `release/`.

- [x] **UAT-002 — Deploy frontend UAT đồng bộ** · `P0` · `DONE`
  - Deploy bundle frontend theo manifest; kiểm tra cache/version và service worker.
  - Phụ thuộc: `UAT-001`.
  - Nghiệm thu: file runtime và version hiển thị khớp manifest; trình duyệt không còn tải bundle cũ.
  - Kết quả xử lý 27/07/2026: medtest chạy đúng `MEDSTAND-UAT-20260727-11.111-RC3`. Kiểm tra trực tiếp qua HTTP (không dùng token): 6/6 artifact khớp manifest RC3, `?v=11.111` và `appVersion=11.111` đồng bộ, `sw.js` mang `medstand-11.111`, không còn marker conflict Git, và URL kèm `?v=11.111` với header nén giống trình duyệt trả đúng bundle RC3.
  - Đường đi tới `DONE` gồm ba lần sửa: (1) bundle chatbot lệch byte so với source — đã deploy lại; (2) một lượt deploy đẩy nhầm file dính marker conflict Git mà server vẫn trả HTTP 200 — đã thay; (3) `APP_VERSION` không đổi khiến cache `immutable` giữ bundle cũ — đã nâng `11.110` → `11.111` để đổi cache key.
  - Công cụ để lại: `scripts/verify_frontend_deploy.js` — chạy một lệnh là đối chiếu hash, marker conflict và version. Lưu ý phải gửi `Accept-Encoding: identity` khi so hash vì server có cache bản nén riêng có thể cũ hơn file thật.
  - Phạm vi `DONE`: chỉ xác nhận RC3 đã deploy đúng. Smoke test chức năng trên trình duyệt có đăng nhập vẫn là việc riêng.
  - ⚠️ Repo đã vượt qua RC3: `HEAD` chứa panel lập đơn nhanh trong khung chat (`chatbot.bundle.min.js` = `21ac0cd4…`) chưa deploy. Phần này cần khóa RC4 và **phải nâng `APP_VERSION` lên `11.112`** trước khi build/deploy, nếu không trình duyệt đã cache `11.111` sẽ không nhận được.
  - Kết quả deploy và drift đã được gom vào [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md).

- [x] **UAT-003 — Import bộ SQL bắt buộc** · `P0` · `DONE`
  - Import đúng các stored procedure và metadata API thuộc bản UAT.
  - Phụ thuộc: `UAT-001`.
  - Nghiệm thu: script kiểm tra definition/hash hoặc ngày sửa xác nhận DB dùng đúng bản; không thiếu API bắt buộc.
  - Kết quả chuẩn bị 27/07/2026: đã tạo `scripts/deploy_uat_sql.ps1`, khóa 16 file theo manifest, bổ sung target guard, pre/post verification, backup definition, API metadata check và evidence output.
  - Cập nhật nghiệm thu 27/07/2026: ảnh kết quả `UAT_RC2_All_16_SQL_Verification.sql` cho thấy target `medtest`, procedure và API metadata đều `PASS`; hai smoke test “Xem đơn hàng tháng này” và “Xem hóa đơn tháng này” cũng chạy thành công, không lỗi HTTP 500.
  - Đủ điều kiện chuyển `DONE` theo gate SQL được ghi trong baseline hiện hành.
  - Kiểm tra hai file vừa import bằng `sql/diagnostics/UAT_RC2_DonHang_HoaDon_Verification.sql`.
  - Kiểm tra toàn bộ 16 file bằng một lệnh read-only: `sql/diagnostics/UAT_RC2_All_16_SQL_Verification.sql`.
  - Đã xác minh hai file vừa import và toàn bộ bộ kiểm tra SQL; không còn thiếu procedure/metadata bắt buộc theo bằng chứng nghiệm thu.
  - Script deploy và diagnostics vẫn được giữ trong `scripts/` và `sql/diagnostics/`.

- [ ] **UAT-004 — Import và publish workflow n8n** · `P0` · `BLOCKED`
  - Import đúng workflow auth, intent parser, main chatbot và API service.
  - Xóa hoặc disable workflow/parser trùng sau khi xác định đúng bản active.
  - Phụ thuộc: `UAT-001`.
  - Nghiệm thu: mỗi webhook chỉ có một workflow active đúng; workflow runtime khớp file nguồn.
  - Kết quả kiểm tra 27/07/2026 — **phía source ĐẠT**: 18 file, 11 webhook path, không trùng path, không trùng ID, mọi file có webhook đều đã có `id` nên import sẽ ghi đè đúng bản thay vì tạo mới. Hash 12/12 khớp manifest.
  - **Vi phạm xác định**: webhook `intent-parser` có **hai workflow cùng ACTIVE** (`ZQPz4sbzz9pqSO8W` và `Gn7nDjDgGUFOWni5`, trùng cả tên). n8n không đảm bảo định tuyến vào bản nào ⇒ cùng một câu hỏi có thể ra hai kết quả khác nhau. Đây nhiều khả năng chính là triệu chứng mà `UAT-021` sẽ bắt được.
  - Ngoài ra webhook `api-execute` còn hai bản inactive (`0xIfgxxondYICsqZ`, `Z7raaV1oe9JkjUXQ` — tên bị mojibake, dấu vết import hỏng) nên dọn để tránh bật nhầm.
  - Lỗi manifest đã sửa: hash `API_GetConfig.json` bị chép thiếu 1 ký tự (63/64), sẽ luôn báo lệch giả khi đối chiếu. Nội dung file không sai.
  - `BLOCKED` vì sao: n8n không lộ ra Internet (`/webhook/*` bị `server.js` chặn bằng `GATEWAY_REQUIRED`; `/n8n/` chỉ trả SPA), nên vế "runtime khớp file nguồn" phải nghiệm thu tại nơi truy cập được n8n. Ảnh chụp runtime duy nhất còn lưu là 21/07, đã quá cũ để kết luận.
  - Việc cần làm: (1) tắt `ZQPz4sbzz9pqSO8W`, giữ `Gn7nDjDgGUFOWni5`; (2) import lại theo manifest phần 4, sau đó chọn lại node `Execute Shared Auth Guard` → `9UxECqxRaPGMF8EM`; (3) tạo export mới rồi chạy `node scripts/verify_n8n_runtime.js <export>` — thoát mã 0 là đạt.
  - ⚠️ File export chứa `staticData` kèm token thật — không commit; cần lưu thì lọc bằng `scripts/sanitize_n8n_export.js`.
  - Trạng thái n8n mới nhất và điều kiện đóng nằm trong [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md).

- [ ] **UAT-005 — Kiểm tra cấu hình endpoint và secret UAT** · `P0` · `REVIEW_REQUIRED`
  - Xác minh app, n8n và SQL đều trỏ đúng môi trường `medtest`.
  - Thay credential viết cứng trong workflow upload bằng cơ chế secret/xác thực chuẩn.
  - Nghiệm thu: không có credential UAT/production được viết trực tiếp trong file public hoặc source workflow xuất bản.
  - Kết quả xử lý 27/07/2026: kiến trúc chuẩn là UI `medtest.bms7.net` → API nội bộ `medtest.bms79.com` → DB `medtest`; đã sửa `API_BASE` local về API nội bộ. Giữ fallback admin key theo xác nhận của chủ dự án vì workflow upload hiện kiểm tra cùng giá trị; chuyển sang secret runtime trước production. Còn cần xác nhận environment trên server và smoke test runtime.
  - Trạng thái endpoint/secret nằm trong [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md); script kiểm tra: `scripts/verify_uat5_config.js`.

### Nhóm B — Phân quyền và dữ liệu

- [x] **UAT-006 — Kiểm tra đăng nhập 13 tài khoản** · `P0` · `DONE`
  - Kiểm tra trạng thái tài khoản, vai trò, chi nhánh và phiên đăng nhập.
  - Nghiệm thu: 13/13 tài khoản đăng nhập được hoặc có danh sách ngoại lệ được khách hàng xác nhận.
  - Kết quả kiểm tra: `13/13 PASS`; tất cả tài khoản đăng nhập thành công, nhận đúng vai trò `sale/manager`, đúng vùng `MB/MT/MN`, có phiên xác thực hợp lệ và hoàn tất smoke `8/8` không lỗi.
  - Bằng chứng: `.tmp/medstand-smoke-13.json`.

- [x] **UAT-007 — Đối soát phạm vi khách hàng của 13 tài khoản** · `P0` · `DONE`
  - So sánh kết quả thực tế với `AR_GetObjectByUserFnc` và phạm vi quản lý.
- Nghiệm thu: sale không xem được khách ngoài quyền; manager chỉ xem đúng phạm vi được cấp.
  - Kết quả kiểm tra: `13/13 PASS`; cả 13 khách đại diện đều nằm trong scope tương ứng; 11 ca chéo miền không phát hiện rò rỉ (`0` leak). Sale chỉ có scope khách được giao; Manager chỉ nhận scope do ERP trả về.
  - Bằng chứng: kết quả chạy read-only từ `scripts/verify_uat007_customer_scope.js` trên DB `medtest`.
  - **[Bổ sung 31/07/2026] Lần PASS trên đã bỏ lọt 2 tài khoản quản lý nhìn thấy TOÀN BỘ 49.559 khách.** Không phải kết quả cũ sai — nó đúng với những gì nó đo. Bài test kiểm hai điều: (a) tài khoản có thấy khách đại diện của mình không, (b) có rò rỉ giữa các cặp chéo miền không. `QLMD1` và `QLBH024.MED` **thoả cả hai** một cách hình thức: thấy tất cả thì đương nhiên thấy khách của mình, và các cặp đối chiếu không chạm tới hai tài khoản này. Tiêu chí còn thiếu là **"phạm vi phải bị chặn"** — không ai đo tổng số khách mỗi tài khoản nhìn thấy.
  - Nguyên nhân gốc: cả hai có `SY_User.Manager = 1` nhưng **0 dòng trong `AR_OpListDetailTbl`**. `AR_GetObjectByUserFnc` gặp "là quản lý nhưng không có trong sơ đồ tổ chức" thì rẽ vào nhánh ban lãnh đạo và trả về tất cả — hệ thống hiểu "chưa khai giới hạn" thành "không giới hạn".
  - Đã vá bằng `sql/Fix_UAT13_Manager_Scope_AI.sql` (dựng lại đúng khuôn mẫu của `QLBH013.MED`):

    | Tài khoản | Trước | Sau | Gắn vào nút | Nhân viên dưới quyền |
    |---|---:|---:|---|---|
    | `QLMD1` | 49.559 | **347** | `QLKV09` — Quản lý KV Sài Gòn 02 | `TDV_BINHPHUOCA` (nhóm `SGNB`, `SGQ07`) |
    | `QLBH024.MED` | 49.559 | **449** | `QLKV11` — Quản lý KV Miền Tây 1 | `MED0148` / AnGiangA (nhóm `AGA`) |

    Sau khi vá: 13/13 tài khoản có phạm vi bị chặn (9 → 11.571 khách), 13/13 vẫn nhìn thấy khách đại diện, 11 tài khoản còn lại không đổi một dòng nào. Hai API CORE-001 trước đây trả `FORBIDDEN` cho hai tài khoản này giờ trả đúng nhóm và đúng nhân viên dưới quyền.
  - **Cảnh báo cho lần chạy lại UAT-007**: phải bổ sung tiêu chí *"không tài khoản nào nhìn thấy 100% khách hàng"*, nếu không lỗi loại này sẽ lại lọt lưới. Ngoài 13 tài khoản UAT, `TRUNGBM` (`NVVP003`) hiện vẫn thấy đủ 49.559 khách vì cùng lỗi — cố ý chưa xử vì nằm ngoài phạm vi UAT và cần khách xác nhận anh ta quản khu vực nào.

- [x] **UAT-008 — Đối soát mapping kho CTY/DL02/DL03** · `P0` · `PASS`
  - Kiểm tra dữ liệu `SY_UserStoreHouseTbl` cho từng tài khoản và vai trò.
  - Nghiệm thu: mỗi tài khoản chỉ thấy tồn của các kho được cấp; có bảng mapping được business owner xác nhận.
  - Business Owner xác nhận ngày 2026-07-29: UAT chỉ hiển thị ba kho chính `CTY / DL02 / DL03`; các kho phụ `LOI`, `DL01`, `KG MT`, `LOIMT`, `KG MN`, `LOIMN` phải được ẩn.
  - Đã bổ sung bộ lọc allowlist trong các API sử dụng phạm vi kho; chờ triển khai lên DB `medtest` và chạy lại kiểm tra 13 tài khoản trước khi đánh dấu `DONE`.
  - Bằng chứng máy đọc: `scripts/verify_uat008_warehouse_scope.js`; kết quả tổng hợp ở [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md).
  - Chạy lại 01/08/2026: `13/13 PASS`; mọi output tồn chỉ thuộc mapping hiệu lực trong allowlist `CTY/DL02/DL03`, không còn kho phụ.

- [x] **UAT-009 — Chuẩn hóa dữ liệu mẫu theo tài khoản** · `P0` · `DONE`
  - Chọn khách hàng, sản phẩm, CTBH và tuyến mẫu có dữ liệu thật cho mỗi vùng/vai trò.
  - Không thay đổi dữ liệu khách hàng thật nếu chưa được phép.
  - Nghiệm thu: mỗi account có tối thiểu một bộ input chạy được các luồng thuộc quyền.
  - Đã chuẩn bị bộ input và script read-only kiểm tra khách, sản phẩm, đơn mẫu và kho chính; kết quả được gom vào [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md).
  - Kết quả: `13/13 PASS`; khách đại diện đúng scope, có dữ liệu giao dịch mẫu, 3 sản phẩm mẫu hoạt động và kho chính hiệu lực.
  - **Cập nhật UATV2 03/08/2026:** đã deploy bộ dữ liệu hiện tại, cô lập bằng tiền tố `UATV2_`, cho đủ 13 tài khoản. Persisted: 28 khách, 91 đơn, 63 hóa đơn, 7 trả hàng, 7 công nợ và 3 sản phẩm trọng tâm; hậu kiểm runtime `13/13 PASS`, mỗi tài khoản thấy đúng 4 khách A/B/C/UNRATED và dữ liệu ngày 03/08. Seed đọc ngưỡng từ rule `APPROVED`, không hard-code và không sửa khách/đơn thật. Chi tiết ở [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md).
  - **[Quét toàn diện 31/07/2026] Gọi thật 27 API `READ` × 13 tài khoản = 351 lượt.** Kết quả: **23/27 API trả dữ liệu cho đủ 13/13 tài khoản.**

    Dữ liệu nền đã đủ chuẩn:
    - `U13D_`: đúng **84 đơn + 168 dòng chi tiết**, 09/07 → 20/07 như tài liệu yêu cầu.
    - `API_DoanhSo_AI`: **13/13 tài khoản thấy đủ 12 ngày**.
    - Khảo sát: 13/13 tài khoản đều có đợt khảo sát (từ 2 đến 567 đợt).
    - Kho: 6/7 quản lý **không có** dòng trong `SY_UserStoreHouseTbl`, nhưng **không phải lỗi** — các procedure có nhánh cho quản lý thừa hưởng kho từ nhân viên dưới quyền qua `SY_User.ManagerID`. Đã kiểm từng tài khoản: 7/7 quản lý đều lấy được kho hợp lệ.

    Ba trường hợp thoạt nhìn là lỗi nhưng **là hành vi đúng**, không cần sửa:
    - `@hoa_don_chi_tiet` — bắt buộc `@DocumentID`, không có giá trị mặc định. Truyền mã hoá đơn thật thì trả đúng dữ liệu.
    - `@goi_ydon_thuoc` — cần từ khoá tìm kiếm; thiếu thì trả thông báo validate đúng chuẩn.
    - `@employee_by_manager` — 6 tài khoản sale nhận *"Tài khoản không có nhân viên nào dưới quyền"*, đúng vì sale không quản lý ai.

    **Chốt phân vai ba mức cho nhóm khuyến mãi — chủ dự án quyết định 31/07/2026.** Ba API này rất dễ bị lẫn khi bảo trì, ghi rõ ra đây:

    | API | Nội dung | Ai xem được |
    |---|---|---|
    | `@de_xuat_khuyen_mai` | **Gợi ý** hàng nên đẩy (tồn nhiều / cận hạn) — **chưa ai duyệt** | Chỉ cấp quản lý |
    | `@san_pham_trong_tam` | Chương trình **đã được công ty duyệt** | **Ai cũng xem**, kể cả sale |
    | `@san_pham_trong_tam_import` | Nạp/sửa chương trình | Quản lý trở lên, và **chỉ xem** |

    Lý do mức 1 chặn dù mức 2 mở: nội dung mức 1 là *đề xuất*, không phải ưu đãi có thật. Một dòng *"khăn lau còn 373 hộp, hạn 29/08 — nên giảm giá"* rất dễ bị hiểu thành "đang có khuyến mãi món này" rồi nhân viên nói miệng với nhà thuốc lúc đi tuyến. Nhân viên **không bị thiếu thông tin để bán hàng**: `API_HangHoaList_AI` đã trả `GhiChu` nguyên văn điều khoản (*"Mua 8+2, 30+10 (< 8h ck 10%), KHHĐ tặng hàng"*) cho **117/117 sản phẩm**, cộng với mức 2.

    **Đã sửa 3 việc:**
    1. `@de_xuat_khuyen_mai` — giữ chốt chặn cấp quản lý, nhưng bỏ `SELECT TOP (0)` (bảng rỗng không kèm `Msg` nào → màn hình trắng khó hiểu) thay bằng `Msg` + `MsgType = 0` giải thích và chỉ chỗ xem chương trình đã duyệt.
    2. `API_SanPhamTrongTam_Import_AI` — **thêm guard cấp quản lý, trước đó KHÔNG HỀ CÓ.** Guard duy nhất là *"tài khoản tồn tại và chưa bị khoá"*, nghĩa là bất kỳ tài khoản sale nào gọi thẳng vào SQL đều ghi đè được chương trình trọng tâm và bậc quà tặng toàn công ty. Cổng n8n có chặn sẵn (`enabledMutationApis` chỉ chứa `@khach_hang_insert_ai`) nhưng procedure phải tự đứng vững nếu bị gọi trực tiếp.
    3. `API_SanPhamTrongTam_Import_AI` — thêm `@Apply BIT = 0`: mặc định chạy hết mọi bước kiểm tra rồi báo cáo **sẽ** thay đổi gì nhưng **không ghi**. Khớp điều kiện Pilot *"Read-only và preview mutation"* / *"Không tạo đơn, khách hoặc chương trình thật trong Pilot"*. An toàn: đã rà toàn repo, không workflow nào gọi procedure này (`AI_Upload_Reader.json` 0 tham chiếu).

    **Kiểm chứng sau khi sửa:** mức 1 → 7 quản lý nhận 50 dòng, 6 sale nhận thông báo có nghĩa. Mức 2 → **13/13 tài khoản đều xem được**. Mức 3 → sale bị từ chối, quản lý nhận bảng xem trước; đếm `AR_SanPhamTrongTamTbl` trước/sau = **3/3, không ghi gì**.

    File: `sql/Module 6 - API_DeXuatKhuyenMai_AI.sql`, `sql/Module 10 - API_SanPhamTrongTam_Import_AI.sql`.

    Còn tồn tại, chưa chặn demo: `AR_KeHoachDiTuyenTbl` chỉ có 3 dòng của `ADS001`, không tài khoản UAT nào có kế hoạch tuyến. `API_TuyenBanHang_AI` **không đọc bảng này** (nó tính gợi ý chăm sóc từ lịch sử đơn) nên `@tuyen_ban_hang` vẫn chạy đủ 13/13; chỉ màn hình kế hoạch tuyến của ERP là trống.

- [x] **UAT-010 — Kiểm tra độ mới và ngày chốt dữ liệu** · `P0` · `DONE`
  - Xác định `AsOfDate`, múi giờ và quy tắc lấy ngày hệ thống cho dashboard/API.
  - Nghiệm thu: dữ liệu không tính vượt ngày truy vấn; UI hiển thị rõ ngày dữ liệu được chốt.
  - Kết quả: `13/13 PASS`; DB đúng `UTC+07:00`, không có bản ghi tương lai và không tài khoản nào trả dữ liệu sau ngày chốt `28/07/2026`.
  - Bằng chứng: script read-only `scripts/verify_uat010_data_freshness.js`; kết quả tổng hợp ở [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md).

### Nhóm C — Kiểm thử runtime bắt buộc

- [x] **UAT-011 — Test gợi ý đơn hàng** · `P0` · `DONE`
  - Test lịch sử mua, chu kỳ, mùa vụ, khuyến mãi, sản phẩm trọng tâm và tồn kho.
  - Nghiệm thu: kết quả có lý do hợp lệ, không lỗi 500, không gợi ý hàng hết hạn hoặc ngoài kho được cấp.
  - Kết quả: `13/13 PASS`; mỗi tài khoản có 3 gợi ý, có lý do, không lỗi API, không hàng hết hạn và không kho ngoài allowlist.
  - Bằng chứng: `scripts/verify_uat011_order_recommendations.js`; kết quả tổng hợp ở [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md).

- [x] **UAT-012 — Test tuyến và khách giảm mua** · `P0` · `DONE`
  - Test Top 5–8, ngưỡng 45 ngày, ngày báo động và phạm vi khách hàng.
  - Nghiệm thu: kết quả đúng rule đã công bố và không lọt khách ngoài quyền.
  - Kết quả: `13/13 PASS`; Top 5/8 đúng thứ tự, 98 ca từ 45 ngày không mua, 13/13 ca báo động còn 3 ngày và `0` rò rỉ scope.
  - Bằng chứng: `scripts/verify_uat012_route_and_decline.js`; kết quả tổng hợp ở [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md).

- [x] **UAT-013 — Test chấm điểm khách hàng** · `P0` · `DONE`
  - Test nhóm A/B/C, risk 45/90 ngày và xu hướng doanh số.
  - Nghiệm thu kỹ thuật: API/UI chạy ổn định và hiển thị đủ trường.
  - Kết quả: `13/13 PASS`; khách đại diện trả đúng, `0` rò rỉ scope, `0` sai nhóm/risk/xu hướng, bộ lọc nhóm và rủi ro hoạt động đúng.
  - Lưu ý: công thức cuối cùng được nghiệm thu tại `CORE-006`.
  - Bằng chứng: `scripts/verify_uat013_customer_scoring.js`; kết quả tổng hợp ở [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md).

- [x] **UAT-014 — Test tích lũy và upsell** · `P0` · `DONE`
  - Test mốc đã đạt, mốc tiếp theo, số còn thiếu, phần trăm tiến độ và đề xuất bán thêm.
  - Nghiệm thu: kết quả đối soát đúng với dữ liệu hóa đơn/trả hàng mẫu.
  - Kết quả: `13/13 PASS`; `0` scope leak, `0` sai mốc/còn thiếu/phần trăm, `0` lỗi API, upsell đủ lý do và tồn khả dụng.
  - Bằng chứng: `scripts/verify_uat014_loyalty_upsell.js`; kết quả tổng hợp ở [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md).

- [x] **UAT-015 — Test tồn kho theo quyền** · `P0` · `DONE`
  - Test tồn vật lý, tồn khả dụng, lô hết hạn và phạm vi kho.
  - Nghiệm thu: số liệu khớp DB tại cùng thời điểm chốt và không lộ kho ngoài quyền.
  - Kết quả sau cập nhật: `13/13 PASS`; `0` dòng ngoài scope, `0` dòng ngoài allowlist, công thức tồn và lô hết hạn đúng.
  - Bằng chứng: `scripts/verify_uat015_stock_scope.js`; kết quả tổng hợp ở [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md).

- [x] **UAT-016 — Test tra cứu sản phẩm và triệu chứng** · `P0` · `DONE`
  - Test tên, mã, giá, kiến thức sản phẩm, từ khóa/triệu chứng và disclaimer.
  - Nghiệm thu: không mô tả kết quả như chẩn đoán; trạng thái tồn kho phải được hiển thị trung thực.
  - Kết quả: `13/13 PASS`; `0` lỗi API, `0` thiếu giá/disclaimer/lý do, trạng thái tồn và cảnh báo tham khảo hiển thị đúng.
  - Bằng chứng: `scripts/verify_uat016_product_symptom_lookup.js`; kết quả tổng hợp ở [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md).

- [x] **UAT-017 — Test tạo khách hàng** · `P0` · `PASS`
  - Test validate, trùng số điện thoại/mã khách, phân quyền và kết quả trả về.
  - Chỉ sử dụng dữ liệu có tiền tố UAT được phép tạo.
  - Nghiệm thu: tạo đúng một bản ghi sau xác nhận; có thể truy vết người tạo.
  - Kết quả cập nhật 31/07/2026: luồng dùng `API_KhachHang_Insert_AI` để tạo trực tiếp, không qua Admin duyệt. Đã chặn thông báo thành công giả: cả form trong chat và modal chỉ xác nhận thành công khi server trả `MsgType = 5` kèm `ObjectID`; phản hồi thiếu contract được hiển thị là lỗi và giữ form để thử lại. Tài khoản `demo` không có nhóm khách nên không dùng làm tài khoản nghiệm thu; chờ chạy lại bằng tài khoản sale/manager có scope.
  - Kết quả runtime được business xác nhận: `QLBH013.MED` tạo thành công khách `A He`, mã `EF7C85D8-8888-4904-8478-6046C09DE258`; truy vấn lại theo cả mã và tên đều trả đúng một bản ghi trong scope của tài khoản. Chấp nhận ca này làm bằng chứng chức năng dù tên không có tiền tố `UAT_`.
  - Bằng chứng: `scripts/verify_uat017_customer_create.js`; kết quả tổng hợp ở [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md).

- [x] **UAT-018 — Test tạo đơn hàng** · `P0` · `PASS`
  - Test màn hình tạo đơn, khách hàng, sản phẩm, số lượng, giá, tồn và kết quả trả về.
  - Chỉ sử dụng dữ liệu UAT được phép tạo.
  - Nghiệm thu: tạo đúng một đơn, chi tiết đúng và không tạo trùng khi gửi lại request.
  - Kết quả: frontend đã chuyển riêng sang `API_DonHangChiTiet_Insert_AI` và `API_HangHoaList_AI`, chỉ tham chiếu nhóm hàng `HH1`, có kiểm tra số lượng, tồn, giá và retry theo `DocumentID`. Không sửa `API_DonHang_Insert`/`API_HangHoaList` gốc dùng chung. Chưa triển khai hai procedure AI và chưa tạo đơn UAT.
  - Bằng chứng: `scripts/verify_uat018_order_create.js`; kết quả tổng hợp ở [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md).
  - Controlled mutation 01/08/2026: đơn `UAT21-260801145955-9CA2` có đúng 1 header, 1 detail, tổng `95.000`; hai request đồng thời không tạo trùng và payload khác dùng cùng ID bị từ chối.

- [x] **UAT-019 — Chạy regression hội thoại tự nhiên** · `P0` · `PASS`
  - Chạy bộ câu hỏi theo intent, tham số, hội thoại tiếp nối và các trường hợp thiếu dữ liệu.
  - Nghiệm thu: tối thiểu 95% test chính đạt; không có lỗi P0/P1 chưa được chấp nhận.
  - Kết quả 31/07/2026: classifier/intent/tham số/thiếu dữ liệu/follow-up `159/159 PASS` (100%), resilience `5/5 PASS`, cổng auth Pilot PASS (`401 AUTH_REQUIRED` khi không token). Live có xác thực `28/31 PASS` (90,32%), chưa đạt ngưỡng 95%; lỗi `upsell` và `product-search` là `502 EMPTY_UPSTREAM_RESPONSE` do n8n trả HTTP 200 nhưng body rỗng, `catalog` là `422 VALIDATION_ERROR` vì workflow yêu cầu từ khóa tối thiểu dù câu hỏi chỉ định loại `khohang`.
  - Đã sửa source workflow: danh mục kho map `@Type=khohang` không cần từ khóa; upsell/product-search trả `NO_DATA` trực tiếp thay vì rơi vào RAG có thể trả rỗng; RAG lỗi luôn trả JSON. Static `159/159 PASS`, workflow guard `4/4 PASS`. Còn phải import/publish workflow và live retest bằng token còn hiệu lực trước khi đánh dấu PASS.
  - Bằng chứng: `reports/uat019-*`, `reports/uat023-*`; kết quả tổng hợp ở [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md).
  - Retest public 01/08/2026 bằng token manager tạm: smoke `8/8`, live `31/31`, p95 live `334 ms`; không còn lỗi 502/422 cũ. Bằng chứng: `reports/uat023-*-2026-08-01.json`.

- [x] **UAT-020 — Kiểm tra hiệu năng p50/p95** · `P0` · `PASS`
  - Đo riêng API thường và truy vấn AI phức tạp, không chỉ đo cảm nhận trên UI.
  - Nghiệm thu mục tiêu: truy vấn thường dưới 3 giây; truy vấn AI phức tạp dưới 6 giây ở p95 hoặc có ngoại lệ được ghi rõ.
  - Kết quả 31/07/2026: HTTP local chạy 40 request/target, concurrency 4, đạt 100%; web p50/p95 `5/24 ms`, n8n health `1/4 ms`. AI qua gateway có xác thực chạy 40 request, concurrency 4, đạt 100%, p50/p95 `2.058/5.668 ms`; p95 đạt mục tiêu dưới 6 giây. Ghi nhận p99/max `9.785 ms` để theo dõi nhưng không làm trượt tiêu chí p95.
  - Bằng chứng: `reports/uat020-infrastructure-load-2026-07-31.json`, `reports/uat020-ai-load-2026-07-31.json`; kết quả tổng hợp ở [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md).

- [x] **UAT-021 — Kiểm tra lỗi trùng và kết quả không đồng nhất** · `P0` · `PASS`
  - Test gửi lặp, double-click, retry, context cũ và response nhiều bảng.
  - Nghiệm thu: mutation có idempotency; truy vấn lặp cùng input/cùng mốc dữ liệu cho kết quả nhất quán.
  - Kết quả 01/08/2026: resilience `5/5`; 5 truy vấn lặp trả cùng 117 dòng và cùng SHA-256; response nhiều bảng giữ đủ metadata + dữ liệu; hai mutation đồng thời tạo đúng một đơn.

### Nhóm D — Báo cáo và bàn giao UAT

- [x] **UAT-022 — Tổng hợp lỗi và phân loại P0/P1/P2** · `P0` · `DONE_WITH_OPEN_BLOCKERS`
  - Mỗi lỗi phải có account, thời gian, input, kết quả thực tế, kết quả mong đợi, ảnh/log và request ID nếu có.
  - Nghiệm thu: không còn lỗi chỉ mô tả bằng câu “không chạy”.
  - Lỗi mở và điều kiện đóng được duy trì tại [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md).

- [x] **UAT-023 — Phát hành báo cáo runtime mới** · `P0` · `BLOCKED_RELEASE_REPORT_PUBLISHED`
  - Thay thế bằng chứng cũ bằng kết quả test sau deploy theo manifest.
  - Nghiệm thu: báo cáo ghi rõ tổng pass/fail/blocked, phiên bản, môi trường và ngày chạy.
  - Báo cáo runtime theo ngày đã được thay bằng [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md); trạng thái vẫn không che P0 workflow trùng.

- [x] **UAT-024 — Cập nhật tài liệu khách hàng sau vòng UAT** · `P1` · `DONE`
  - Cập nhật ảnh, câu lệnh mẫu, giới hạn và chức năng đã thay đổi.
- Nghiệm thu: tài liệu khớp đúng UI và runtime đang được khách sử dụng.
  - Đã cập nhật [HUONG_DAN_SU_DUNG_MEDSTAND_AI_DOANH_NGHIEP.md](HUONG_DAN_SU_DUNG_MEDSTAND_AI_DOANH_NGHIEP.md); baseline kỹ thuật hiện dùng frontend `11.126`.

## 3. Giai đoạn 1 — Hoàn thiện nghiệp vụ bán hàng cốt lõi

**Thời gian mục tiêu:** 11/08–15/09/2026  
**Gate hoàn thành:** `CORE_SALES_FLOW_READY`

- [x] **CORE-001 — Thiết kế contract chat tạo khách hàng** · `P1` · `CONTRACT_LOCKED_DIRECT_CREATE_UAT`
  - Chốt trường bắt buộc, trường tùy chọn, validate, scope và response.
  - Nghiệm thu: có contract được frontend, n8n, SQL và business cùng sử dụng.
  - Kết quả cập nhật 01/08/2026: contract đã chốt theo luồng `Chatbot → API_KhachHang_Insert_AI → CF_ObjectTbl`; khách được tạo trực tiếp và dùng ngay, không qua `AR_ObjectNewRequireTbl`. Đây là quyết định nghiệp vụ đã được UAT-017 chấp nhận, không còn là lỗi bỏ qua duyệt. Tài liệu: [CORE-001_CONTRACT_CHAT_TAO_KHACH_HANG_2026-07-29.md](CORE-001_CONTRACT_CHAT_TAO_KHACH_HANG_2026-07-29.md).
  - Contract hiện hành bắt buộc ngày sinh hợp lệ; kiểm tra lại tỉnh/quận/phường, chuẩn hoá và chống trùng SĐT, MST, nhóm khách và quan hệ Manager → Sale ở server. Thành công chỉ khi `MsgType = 5` và có `ObjectID`.
  - `ObjectGroupID` không còn mặc định cứng là `KH`; phải thuộc phạm vi tài khoản hoặc sale được Manager giao. Nhóm `KH` cũ là dữ liệu nghiệp vụ sống của back-office nên không dọn và không gán lại.
  - Hai API tra cứu phục vụ contract đã hoàn tất, deploy lên `medtest`, kiểm chứng và cấp quyền `READ` ngày 31/07/2026:
    - `API_ObjectGroupByUser_AI` — chép nguyên nhánh phân quyền của `AR_GetObjectByUserFnc`, chỉ nhận `@User` và tự suy `EmployeeID` phía server. Đối chiếu số nhóm trả về với số nhóm thực sự nhìn thấy: 7/7 tài khoản khớp tuyệt đối. Lưu ý bảo trì: `LevelSub` nằm ở bảng cha `AR_OpListTbl`, **không phải** `AR_OpListDetailTbl`.
    - `API_EmployeeByManager_AI` — bắt buộc `GROUP BY` (QLMN2 trả 122 dòng thô → 38 nhân viên); tên lấy qua `COALESCE` vì một số nhân viên không có dòng `SY_User`.
    - File: `sql/Module common - API_ObjectGroupByUser_AI.sql`, `sql/Module common - API_EmployeeByManager_AI.sql`, cấp quyền qua `sql/Migrate_API_Capability_CORE001_AI.sql`.
  - Ngoại lệ `QLMD1` và `QLBH024.MED` đã được xử lý và kiểm chứng lại trong UAT-007; hai API hiện trả đúng nhóm và nhân viên dưới quyền.
  - Còn chờ team ERP làm rõ nhưng không chặn contract hiện tại: mapping `@LoaiKhachHang` → `LoaiHopDong` và `@KenhBan` → `PhanLoaiKhach`. Cơ chế chuyển `StatusID` từ `0` sang `6` không áp dụng cho luồng chat tạo trực tiếp.

- [x] **CORE-002 — Xây luồng thu thập thông tin tạo khách** · `P1` · `DONE`
  - Hiển thị khung nhập liệu ngay trong khung chat, điền sẵn các trường suy được từ tài khoản; cho phép sửa trước khi xác nhận.
  - Phụ thuộc: `CORE-001`.
  - Nghiệm thu: câu tự nhiên hợp lệ dẫn đến khung nhập liệu hiện trong chat với các trường suy được đã điền sẵn; người dùng sửa và xem lại trước khi xác nhận; chưa ghi DB.
  - Kết quả 29/07/2026: Đã hoàn thành 100% renderer `chatbot-widget/js/chatbot-renderer-create-customer.js` (form 7 trường + cascade địa chỉ + validate + xem/sửa preview). Kết quả đã được gom vào [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md).

- [x] **CORE-003 — Xây bước xác nhận và ghi khách hàng** · `P1` · `DONE`
  - Chỉ gọi endpoint tạo thật sau xác nhận rõ ràng.
  - Bổ sung kiểm tra trùng, idempotency, audit và mã kết quả.
  - Phụ thuộc: `CORE-002`.
  - Nghiệm thu: hủy hoặc chưa xác nhận không ghi dữ liệu; xác nhận chỉ tạo một bản ghi.
  - Kết quả 29/07/2026: Đã hoàn thành 100% luồng xác nhận Preview ➔ Submit, Idempotency-Key UUID v4 chống gửi lặp và Audit log. Kết quả đã được gom vào [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md).
  - Cập nhật 01/08/2026: frontend, ApiCode và endpoint đều thống nhất gọi `API_KhachHang_Insert_AI`; procedure ghi trực tiếp `CF_ObjectTbl` theo contract đã được business/UAT chấp nhận. UAT-017 đã PASS; frontend chỉ công nhận thành công khi `MsgType = 5` và có `ObjectID`.

- [x] **CORE-004 — Thiết kế contract chat lập đơn hàng** · `P1` · `CONTRACT_LOCKED_CORE005_PATCH_PENDING_DEPLOY`
  - Chốt customer, item list, số lượng, kho, bảng giá, CTBH và response giỏ hàng.
  - Nghiệm thu: phân biệt rõ `preview`, `confirmed`, `created`, `failed`.
  - Kết quả 03/08/2026: đã khóa contract theo runtime hiện tại tại [CORE-004_CONTRACT_CHAT_LAP_DON_HANG_2026-08-03.md](CORE-004_CONTRACT_CHAT_LAP_DON_HANG_2026-08-03.md). Chat chỉ tạo `preview`; xác nhận mới gọi `API_DonHangChiTiet_Insert_AI`; chỉ `MsgType = 5` kèm `DocumentID` là `created`; mọi kết quả khác là `failed` hoặc cần đối soát khi timeout.
  - Quy tắc server đã chốt: khách phải trong `AR_GetObjectByUserFnc`; chỉ hàng `HH1`; số lượng nguyên dương; giá và CTBH được SQL tính lại; hàng tặng nằm trong `SoLuongTang`; SQL chọn một kho được phép và ghi `StoreHouseID`.
  - Cập nhật 03/08/2026: frontend không còn tự sinh `UATORD-*`; khi bỏ trống mã đơn, frontend truyền `AUTO_GEN` và SQL sinh `D{BranchID}{MM}{YY}/{n}`. `Idempotency-Key` HTTP được giữ riêng để chống double-click/retry.
  - Contract sau bản vá CORE-005 đã cập nhật cơ chế kho, idempotency, audit và identity; giới hạn còn lại là ERP chưa có `PromotionID`/`RuleVersion`. Chưa coi là runtime mới trước khi deploy đồng bộ.

- [ ] **CORE-005 — Hoàn thiện luồng chat lập đơn** · `P1` · `SQL_DEPLOYED_LOCAL_GATEWAY_11.139_VERIFIED_PENDING_END_TO_END_UAT`
  - Thu thập thông tin, kiểm tra tồn/giá, hiển thị preview, xác nhận và tạo đơn thật.
  - Bổ sung idempotency và audit.
  - Phụ thuộc: `CORE-004`, `STOCK-001`.
  - Nghiệm thu: trả về mã đơn; gửi lặp không tạo đơn thứ hai.
  - Kết quả code 03/08/2026: frontend giao SQL sinh mã `D{BranchID}{MM}{YY}/{n}`; hàng tặng dùng `SoLuongTang`; SQL kiểm tra lại giá/CTBH/tồn, chọn và ghi một kho được cấp; gateway xác minh identity từ token; idempotency lưu fingerprint và kết quả cùng transaction với đơn. Trạng thái và gate còn thiếu nằm trong [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md).
  - Cập nhật 05/08/2026: ba picker lập/sửa đơn và preview từ chat dùng chung luồng hai bước, không tạo API mới: tìm mã/tên qua metadata `API_DanhMuc_Core_AI`, sau khi chọn mới gọi `API_HangHoaList_AI` với đúng `ItemID` để lấy giá, CTBH, tồn khả dụng và kho theo khách. Smoke read-only `medtest` PASS (`Aqua`: 1 dòng/289 ms; `A008`: 1 dòng/450 ms); gate UAT-018 PASS `27/27`; bundle local `11.139` trả HTTP 200. Không sửa procedure hay dữ liệu DB.
  - Kiểm chứng rollback trên `medtest`: ca `QLBH013.MED` / `DL011` / `A008`, mua `10` tặng `2`, lần đầu và replay cùng trả `DMB0826/1`, DB trong transaction chỉ có 1 header + 1 detail (`SoLuongTang = 2`, kho `CTY`); payload khác cùng key trả `IDEMPOTENCY_CONFLICT`; toàn bộ đã rollback, không lưu dữ liệu test.
  - Cập nhật runtime 03/08/2026: SQL `medtest` PASS `23/23` gate; mutation rollback trực tiếp trên procedure đã deploy PASS ca mua `10` tặng `2`; gateway local đã restart và smoke PASS frontend `11.124` + order guard mới. Chưa đánh dấu `DONE`: còn mutation qua token/UI thật và UAT concurrency/double-click có bằng chứng request ID.
  - Kiểm tra lại `2026-08-03T05:04:01Z`: `23/23` gate vẫn PASS, gateway local PID `32384` hoạt động; audit sau deploy chưa có create/replay/failure của `API_DonHangChiTiet_Insert_AI`, nên chưa có bằng chứng end-to-end và `ConcurrencyProven = false`.

- [x] **CORE-006 — Chốt công thức phân nhóm A/B/C** · `P1` · `DONE`
  - Business owner chọn ngưỡng doanh số cố định, percentile hoặc mô hình kết hợp.
  - Ghi rõ khoảng dữ liệu, cách tính trung bình, trả hàng và khách không có lịch sử.
  - Nghiệm thu: có văn bản sign-off và bộ ví dụ chuẩn.
  - Kết quả discovery 03/08/2026: xác nhận rule runtime `BR-TIER-V1-DRAFT` phụ thuộc scope người xem, chưa trừ trả hàng và loại khách không có hóa đơn 12 tháng. Trên `medtest`, `7.124/48.565` khách có dữ liệu chấm; `504` khách đủ điều kiện có trả hàng và `12` khách đổi tier khi chuyển gross sang net; cùng khách `NDB001`, `HUEA043`, `DL012` đã cho kết quả khác giữa manager/sale.
  - Đã lập contract, ba phương án và bộ case `ABC-01..09`: [CORE-006_CONTRACT_PHAN_NHOM_ABC_2026-08-03.md](CORE-006_CONTRACT_PHAN_NHOM_ABC_2026-08-03.md).
  - Sign-off 03/08/2026: người dùng/business owner chọn phương án C, yêu cầu không hard-code và hiệu lực ngay; định danh duyệt `USER_CONFIRMED_IN_CHAT`, rule chính thức `BR-TIER-005/2.0.0`, hiệu lực `13:34:26 +07`. Rule đã lưu thành `21` key `APPROVED` trong `AI_BusinessRuleConfigTbl` và deploy `medtest`.

- [ ] **CORE-007 — Cập nhật API chấm điểm theo công thức được duyệt** · `P1` · `MEDTEST_API_RUNTIME_13_OF_13_VERIFIED_PENDING_UI_TOKEN_EVIDENCE`
  - Phụ thuộc: `CORE-006`.
  - Nghiệm thu: test case chuẩn của business pass 100%; risk vẫn được hiển thị độc lập với tier.
  - Kết quả 03/08/2026: migration cấu hình + `API_ChamDiemKH_AI` đã deploy; procedure đọc duy nhất version `APPROVED`, không chứa literal ngưỡng `5/25 triệu`, không dùng percentile theo người xem và fail-closed khi config thiếu/sai. Preflight rollback PASS `9/9` case `ABC-01..09`; hậu kiểm read-only PASS no-hardcode `7/7`, scope `3/3`, `UNRATED/UNKNOWN` và UI static `5/5`. Trạng thái nằm trong [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md).
  - Bổ sung dữ liệu UAT 03/08/2026: seed `UATV2_` đã persist trên `medtest`; gọi trực tiếp `API_ChamDiemKH_AI` cho `13 tài khoản × 4 nhóm = 52 ca` đều PASS, gồm trả hàng signed một lần và khách chưa có lịch sử. Hậu kiểm trên dữ liệu đã commit tiếp tục PASS `13/13`; mỗi tài khoản thấy đúng bốn khách A/B/C/UNRATED trong scope. Bằng chứng tổng hợp ở [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md).
  - **Trạng thái cập nhật:** phần SQL, rule business và API runtime đã hoàn tất; task chỉ còn gate bằng chứng end-to-end qua UI/token thật cho bốn bộ lọc `A/B/C/UNRATED`, gồm ảnh và request ID. Vì gate này chưa chạy nên giữ checkbox mở, chưa đánh dấu `DONE`.

- [x] **STOCK-001 — Bắt buộc kiểm tra tồn thật trong tư vấn sản phẩm** · `P1` · `DONE`
  - Thay trạng thái `PHYSICAL_STOCK_NOT_QUERIED` bằng truy vấn tồn theo quyền khi nghiệp vụ yêu cầu hàng còn tồn.
  - Nghiệm thu: kết quả ghi rõ kho, thời điểm cập nhật và tồn khả dụng; không gợi ý hàng không bán được.
  - Kết quả 03/08/2026: đã tạo nguồn tồn dùng chung theo quyền `AI_StockAvailableByUserFnc`, cấu hình hóa kho/trạng thái giữ hàng/nhóm quyền/nhóm hàng trong `BR-STOCK-001/2.0.0`, rồi đồng bộ các API tư vấn, catalog, n8n và frontend `11.126`. SQL deploy `12/12` PASS; hậu kiểm `13/13` tài khoản, `UAT-011`, `UAT-014`, `UAT-016` và static runtime đều PASS. Ca `QLBH005.MED / Q002 / DL02` có tồn vật lý `10192` nhưng đã giữ `13024`, tồn khả dụng `0`, đã bị loại khỏi gợi ý. Kết quả đã được gom vào [baseline hiện hành](BASELINE_KY_THUAT_UAT_HIEN_HANH.md).
  - Runtime hoàn tất 03/08/2026: n8n đã restart, `/healthz` `200`, hai webhook đăng ký thành công và gateway/token smoke `8/8` PASS. Token UAT PASS ba gate: sản phẩm bán được `req-11760-msd0saxz`, chặn hàng `RESERVED_OUT` `req-11763-msd0semv`, tìm theo triệu chứng `req-11766-msd0sgq1` trả 8 dòng với kho/thời điểm/tồn khả dụng đầy đủ. Lỗi alias `@Keyword`/`@timkiem` phát hiện trong UAT đã sửa tại SQL theo contract tương thích ngược; deploy lại `12/12` và gate `13/13` tài khoản PASS.

- [ ] **CORE-008 — Chuẩn hóa lý do gợi ý bán hàng** · `P1` · `MEDTEST_RUNTIME_TOKEN_UAT_VERIFIED_PENDING_VISUAL_UI_ACCEPTANCE`
  - Mỗi gợi ý hiển thị lần mua cuối, chu kỳ, ngày dự kiến, lý do và nguồn rule.
  - Nghiệm thu: người dùng hiểu được vì sao sản phẩm/khách được đề xuất.
  - Kết quả code 04/08/2026: đã chuẩn hóa hai grain purchase event, chu kỳ trung bình làm tròn theo ngày, `CycleComputationMode`, `CycleStatus`, lý do và nguồn rule phẳng; SQL đọc duy nhất `BR-RECOMMENDATION-008/1.0.0` `APPROVED`, không fallback toàn bộ lịch sử và các ngưỡng/điểm tuyến nằm trong cấu hình. n8n đã bỏ nhãn draft cho hai API; frontend local `11.127` hiển thị lần mua cuối, chu kỳ, ngày dự kiến, chênh lệch ngày, lý do và nguồn dễ hiểu. Báo cáo: [CORE-008_CHUAN_HOA_LY_DO_GOI_Y_BAN_HANG_2026-08-04.md](CORE-008_CHUAN_HOA_LY_DO_GOI_Y_BAN_HANG_2026-08-04.md).
  - Preflight rollback trên `medtest` PASS: compile 3/3 file, công thức 2/2, tuyến 13/13; gợi ý sản phẩm PASS contract ở 4 tài khoản có mặt hàng lịch sử còn bán được, 9 tài khoản còn lại trả rỗng đúng guard STOCK-001. SQL sau đó đã commit atomically 3/3 file, 9 batch; hậu kiểm read-only tiếp tục PASS 22 key `APPROVED`, đúng hai procedure runtime và cùng kết quả 13 tài khoản. Natural chat regression 159/159 PASS. Khảo sát 21.109 dòng trả hàng chỉ liên kết được 7.743 dòng về hóa đơn, nên rule công khai giới hạn: trả hàng không tạo event mới và chưa điều chỉnh event mua gốc.
  - Runtime 04/08/2026: n8n workflow `fCJwiyAT9r6eh1ys` đã backup/import/publish/restart, active và khớp source; health PASS. Frontend `11.127` đang được gateway local phục vụ. Token/gateway UAT `QLMN2` PASS 4/4 ca: sản phẩm `PERSONAL_HISTORY` `req-11803-mse4rfgm`; tuyến `PERSONAL_HISTORY` `req-11805-mse4rhk6`; `POLICY_DEFAULT` `req-11807-mse4rir4`; `NO_HISTORY` `req-11809-mse4rk0v`. Không chạy mutation.
  - **Chưa đánh dấu `DONE`:** chỉ còn mở UI xác nhận cách trình bày và lưu ảnh nghiệm thu gắn với request ID đã có.

- [ ] **CORE-009 — Chọn gợi ý và quản lý đơn nháp bằng hội thoại** · `P1` · `LOCAL_BUNDLE_11.128_VERIFIED_PENDING_VISUAL_END_TO_END_UAT`
  - Hội thoại là luồng chính: cho phép chọn một hoặc nhiều sản phẩm gợi ý, thêm, bỏ, đổi số lượng, xem lại, hủy và yêu cầu preview. Card/nút/số lượng chỉ là thao tác nhanh và dùng chung `DraftCommand` với câu tự nhiên.
  - Đơn nháp Pilot là state có cấu trúc theo `UserId + ConversationId`, có `DraftId`, `DraftVersion`, TTL và snapshot vô hiệu sau mỗi lần sửa; không dùng trí nhớ tự do của AI làm nguồn sự thật.
  - Draft chỉ giữ khách, mã sản phẩm và số lượng. Giá, CTBH, tồn và kho phải được tải lại từ nguồn nghiệp vụ khi preview; SQL CORE-005 vẫn kiểm tra lại và chọn kho khi tạo thật.
  - Phụ thuộc: `CORE-004`, `CORE-008`, `STOCK-001` và guard giá/CTBH/quyền hiện hành của `CORE-005`.
  - Nghiệm thu: truyền đúng khách/sản phẩm/số lượng; câu mơ hồ không đổi draft; context cũ không tác động tài khoản/khách hiện tại; double-click/retry không thêm trùng; thao tác trong CORE-009 không tự tạo đơn.
  - Kết quả code 05/08/2026: thêm conversational reducer `CREATE/ADD/UPDATE/REMOVE/SHOW/CANCEL/PREVIEW`, state `sessionStorage` cách ly theo tài khoản/cuộc hội thoại và hết hạn 30 phút; card gợi ý có số lượng + nút thêm; sửa race condition phải chờ xác minh khách rồi mới tải giá/tồn sản phẩm; tạo đơn thành công xóa draft. Unit/static CORE-009 PASS `23/23`; natural-chat regression `159/159`; bundle local `11.128` build thành công. Báo cáo: [CORE-009_QUAN_LY_DON_NHAP_HOI_THOAI_2026-08-05.md](CORE-009_QUAN_LY_DON_NHAP_HOI_THOAI_2026-08-05.md).
  - **Chưa đánh dấu `DONE`:** còn UAT trực quan qua tài khoản/token thật cho chuỗi nhiều lượt và lưu ảnh/request ID; CORE-009 chỉ bàn giao sang preview, mutation thật vẫn thuộc CORE-005.

- [ ] **CORE-010 — Regression toàn bộ luồng mutation** · `P0` · `SQL_DEPLOYED_MEDTEST_VERIFIED_UAT_REPORTED_PENDING_AUDIT_EVIDENCE`
  - Test xác nhận, hủy, hết phiên, double-click, retry, thiếu quyền và lỗi DB.
  - Nghiệm thu: không có mutation ngoài ý muốn; mọi thao tác ghi đều có audit.
  - Kết quả code 05/08/2026: thống nhất direct gateway cho tạo khách/tạo đơn theo pipeline verified identity → SQL scope hiện hữu → request ID/idempotency → SQL transaction → audit bắt buộc; bổ sung server-side idempotency và deterministic replay cho tạo khách; audit fail-closed cho cả hai mutation; cập nhật gate UAT-018 theo contract STOCK-001 `AvailableStock`. Guard capability mới từng chặn nhầm manager vì `API_UserInfo` không có contract capability đã được loại bỏ; không tạo schema hay cấp quyền DB mới. Static PASS `10/10`, gateway policy PASS `5/5`, SQL compile preflight PASS và mutation rollback tạo khách PASS create/replay/conflict/audit-unavailable; hậu kiểm `CustomerCount = 0`, `AuditCount = 0`. Báo cáo: [CORE-010_MUTATION_HARDENING_2026-08-05.md](CORE-010_MUTATION_HARDENING_2026-08-05.md).
  - Cập nhật runtime 05/08/2026: user xác nhận đã deploy và chạy UAT thật. Hậu kiểm trực tiếp trên `medtest`: UAT-017 `PASS_READ_ONLY`, UAT-018 `READY_FOR_CONTROLLED_MUTATION`; procedure tạo khách/tạo đơn đang deploy đã có idempotency và mandatory audit mới. Tuy nhiên truy vấn read-only toàn bộ `AI_AuditLog` không tìm thấy event CORE-010 nào (`RelevantEventCount = 0`), nên chưa có request ID/audit lưu bền để đối chiếu lần UAT được báo cáo.
  - **Chưa đánh dấu `DONE`:** cần cung cấp request ID/log/ảnh của lần UAT hoặc chạy một mutation thật có kiểm soát và giữ lại audit; nếu mutation đã thành công nhưng audit vẫn bằng `0` thì đây là lỗi P0 phải điều tra trước khi nghiệm thu.

- [x] **CORE-011 — Quyết định: khách tạo qua chat có phải qua duyệt không** · `P0` · `DECISION_B_DIRECT_CREATE_ACCEPTED` · *đóng 01/08/2026*
  - Quyết định nghiệp vụ: chấp nhận phương án B. Chat gọi `API_KhachHang_Insert_AI`, ghi trực tiếp `CF_ObjectTbl`; khách dùng được ngay và không qua `AR_ObjectNewRequireTbl`.
  - Luồng tạo khách của ERP UI vẫn độc lập và tiếp tục theo cơ chế duyệt hiện có. Sự khác biệt này là chủ đích của contract chat, không phải trạng thái tạm chưa xử lý.
  - Bằng chứng nghiệm thu: CORE-001/002/003 thống nhất cùng hành vi; UAT-017 PASS; response thành công bắt buộc `MsgType = 5` và có `ObjectID`; kiểm tra quyền, dữ liệu và chống trùng nằm ở server.
  - Nếu business muốn chuyển chat về cơ chế duyệt sau này, phải mở change request mới, cập nhật đồng bộ endpoint, contract, tài liệu và bộ test trước khi thay đổi runtime.

## 4. Giai đoạn 2 — Catalog và chương trình bán hàng

**Thời gian mục tiêu:** 16/09–31/10/2026  
**Gate hoàn thành:** `CATALOG_PROMOTION_READY`

- [ ] **CAT-001 — Chuẩn hóa schema tri thức sản phẩm** · `P1` · `TODO`
  - Chốt mã, tên, ảnh, thành phần, công dụng, đối tượng, cách dùng, chống chỉ định, nguồn và trạng thái duyệt.
  - Nghiệm thu: mỗi dữ liệu có nguồn và thời điểm cập nhật.

- [ ] **CAT-002 — Mapping ảnh catalog với mã sản phẩm** · `P1` · `TODO`
  - Chuẩn hóa định dạng, dung lượng và ảnh mặc định.
  - Nghiệm thu: ảnh đúng sản phẩm, không dùng tên file làm khóa duy nhất.

- [ ] **CAT-003 — Trả giá đúng theo bảng giá và khách hàng** · `P1` · `TODO`
  - Chốt quy tắc chọn bảng giá, hiệu lực và trường hợp không có giá.
  - Nghiệm thu: giá trên chatbot khớp màn hình lập đơn tại cùng thời điểm.

- [ ] **CAT-004 — Ghép tồn kho theo quyền vào catalog** · `P1` · `TODO`
  - Phụ thuộc: `STOCK-001`.
  - Nghiệm thu: hiển thị tồn khả dụng, kho và thời điểm cập nhật.

- [ ] **PROMO-001 — Thiết kế schema CTBH có hiệu lực** · `P1` · `TODO`
  - Bổ sung từ ngày, đến ngày, chi nhánh, nhóm user, sản phẩm, điều kiện và trạng thái duyệt.
  - Nghiệm thu: mô tả được CTBH tháng và chương trình phát sinh theo sự vụ.

- [ ] **PROMO-002 — Ghép CTBH hiện hành vào sản phẩm** · `P1` · `TODO`
  - Chỉ lấy chương trình còn hiệu lực và đúng phạm vi người dùng.
  - Phụ thuộc: `PROMO-001`.
  - Nghiệm thu: card sản phẩm hiển thị đúng CTBH; chương trình hết hạn không xuất hiện.

- [ ] **RAG-001 — Hoàn thiện upload Excel/PDF/ảnh** · `P1` · `TODO`
  - Validate loại file, kích thước, virus/malware policy và metadata nguồn.
  - Nghiệm thu: lỗi upload có thông báo rõ; tài liệu không được dùng trước khi duyệt.

- [ ] **RAG-002 — Xây màn hình xem trước và phê duyệt OCR** · `P1` · `TODO`
  - Cho phép sửa nội dung, approve/reject, lưu người duyệt và thời gian duyệt.
  - Nghiệm thu: chỉ bản `Approved` được chatbot sử dụng.

- [ ] **RAG-003 — Tự động hết hiệu lực và thu hồi tài liệu** · `P1` · `TODO`
  - Xử lý from/to date và thao tác thu hồi thủ công.
  - Nghiệm thu: nội dung hết hạn không còn được truy vấn hoặc thông báo.

- [ ] **NOTI-001 — Phân phối thông báo đúng người nhận** · `P1` · `TODO`
  - Lọc theo chi nhánh, nhóm sale, tài khoản và thời gian áp dụng.
  - Nghiệm thu: test dương/âm chứng minh người đúng được nhận và người ngoài phạm vi không nhận.

- [ ] **CAT-005 — Xây card catalog hợp nhất** · `P1` · `TODO`
  - Hiển thị ảnh + mã + tên + công dụng + giá + tồn + CTBH + thao tác tiếp theo.
  - Phụ thuộc: `CAT-002`, `CAT-003`, `CAT-004`, `PROMO-002`.
  - Nghiệm thu: đầy đủ trên mobile và desktop, có trạng thái thiếu dữ liệu rõ ràng.

- [ ] **CAT-006 — UAT catalog và CTBH** · `P0` · `TODO`
  - Đối soát theo sản phẩm mẫu, bảng giá, kho và phạm vi user.
  - Nghiệm thu: 100% bộ mẫu business đã duyệt trả đúng ảnh, giá, tồn và CTBH.

## 5. Giai đoạn 3 — Tối ưu tuyến và quản lý sale

**Thời gian mục tiêu:** 01/11–15/12/2026  
**Gate hoàn thành:** `ROUTE_OPTIMIZATION_PILOT`

- [ ] **ROUTE-001 — Rà soát dữ liệu tọa độ khách hàng** · `P2` · `TODO`
  - Đo tỷ lệ khách có tọa độ hợp lệ và quy trình bổ sung/sửa tọa độ.
  - Nghiệm thu: có báo cáo chất lượng và ngưỡng dữ liệu đủ để chạy Pilot.

- [ ] **ROUTE-002 — Chốt hàm điểm ưu tiên ghé khách** · `P2` · `TODO`
  - Kết hợp sắp hết hàng, giảm mua, gần đạt thưởng, giá trị tiềm năng và lịch tuyến.
  - Nghiệm thu: business owner duyệt trọng số và bộ ví dụ chuẩn.

- [ ] **ROUTE-003 — Tích hợp dịch vụ khoảng cách/thời gian** · `P2` · `TODO`
  - Đánh giá nhà cung cấp bản đồ, hạn mức, chi phí, cache và fallback.
  - Nghiệm thu: trả khoảng cách và thời gian ổn định cho dữ liệu Pilot.

- [ ] **ROUTE-004 — Xây thuật toán sắp xếp điểm ghé** · `P2` · `TODO`
  - Cân bằng điểm ưu tiên, vị trí, giờ làm việc và số điểm ghé tối đa.
  - Phụ thuộc: `ROUTE-001`, `ROUTE-002`, `ROUTE-003`.
  - Nghiệm thu: tuyến mẫu có thứ tự hợp lý và giải thích được.

- [ ] **ROUTE-005 — Ghi nhận kết quả ghé khách** · `P2` · `TODO`
  - Trạng thái: đã ghé, không gặp, hẹn lại, phát sinh đơn; kèm thời gian và ghi chú.
  - Nghiệm thu: sale cập nhật được, manager xem đúng phạm vi.

- [ ] **ROUTE-006 — Báo cáo hiệu quả tuyến** · `P2` · `TODO`
  - Đo lượt ghé, tỷ lệ hoàn thành, đơn phát sinh, doanh số và chuyển đổi.
  - Phụ thuộc: `ROUTE-005`.
  - Nghiệm thu: số liệu truy vết được về lượt ghé và đơn hàng.

- [ ] **ROUTE-007 — UAT tuyến tối ưu** · `P2` · `TODO`
  - Chạy thử với sale đại diện từng miền và thu nhận phản hồi.
  - Nghiệm thu: không làm tăng quãng đường bất hợp lý; business chấp nhận kết quả Pilot.

## 6. Giai đoạn 4 — Nhận diện đơn thuốc từ ảnh

**Thời gian mục tiêu:** 16/12/2026–15/01/2027  
**Gate hoàn thành:** `PRESCRIPTION_OCR_CONTROLLED_PILOT`

- [ ] **OCR-001 — Chốt phạm vi pháp lý và chuyên môn** · `P1` · `TODO`
  - Xác định rõ hệ thống chỉ trích xuất và hỗ trợ tra cứu, không chẩn đoán hoặc tự kê đơn.
  - Nghiệm thu: có disclaimer và quy trình phê duyệt sản phẩm thay thế/bán kèm.

- [ ] **OCR-002 — Thiết kế upload ảnh đơn thuốc** · `P2` · `TODO`
  - Hỗ trợ chụp/tải ảnh, kiểm tra định dạng, dung lượng và chất lượng ảnh.
  - Nghiệm thu: người dùng biết ảnh quá mờ hoặc không đủ điều kiện xử lý.

- [ ] **OCR-003 — Xây pipeline OCR đơn thuốc riêng** · `P2` · `TODO`
  - Trích xuất tên thuốc, hàm lượng, số lượng và confidence; không tái sử dụng prompt catalog như kết quả cuối.
  - Nghiệm thu: trả dữ liệu có cấu trúc và confidence trên bộ ảnh kiểm thử được duyệt.

- [ ] **OCR-004 — Xây màn hình xác nhận kết quả OCR** · `P1` · `TODO`
  - Cho phép sửa/xóa/thêm dòng trước khi đối chiếu sản phẩm.
  - Phụ thuộc: `OCR-003`.
  - Nghiệm thu: dữ liệu OCR chưa xác nhận không được đưa thẳng vào giỏ hàng.

- [ ] **OCR-005 — Xây bảng mapping thuốc và sản phẩm Medstand** · `P1` · `TODO`
  - Mapping phải có nguồn, người duyệt chuyên môn, hiệu lực và trạng thái.
  - Nghiệm thu: chỉ mapping đã duyệt được sử dụng.

- [ ] **OCR-006 — Đề xuất sản phẩm liên quan và bán kèm có kiểm soát** · `P1` · `TODO`
  - Ghép mapping với giá, tồn và CTBH; hiển thị lý do và cảnh báo.
  - Phụ thuộc: `OCR-004`, `OCR-005`, `CAT-005`.
  - Nghiệm thu: không tự động thay thế thuốc hoặc tạo đơn.

- [ ] **OCR-007 — Thiết lập chính sách lưu và xóa ảnh** · `P0` · `TODO`
  - Quy định quyền truy cập, mã hóa, thời gian lưu và xóa ảnh đơn thuốc.
  - Nghiệm thu: đáp ứng chính sách dữ liệu được phê duyệt; có audit truy cập.

- [ ] **OCR-008 — Đánh giá độ chính xác OCR** · `P1` · `TODO`
  - Tạo bộ test có nhãn và đo theo tên thuốc, hàm lượng, số lượng.
  - Nghiệm thu: đạt ngưỡng do business/chuyên môn phê duyệt; mẫu confidence thấp luôn yêu cầu kiểm tra tay.

## 7. Giai đoạn 5 — Dự báo và tối ưu CTKM

**Thời gian mục tiêu:** Từ 16/01/2027  
**Gate hoàn thành:** `PREDICTIVE_SHADOW_READY`

- [ ] **ML-001 — Audit dữ liệu lịch sử 6–12 tháng** · `P3` · `TODO`
  - Đánh giá độ đầy đủ của bán hàng, trả hàng, đơn hủy, giá, CTKM, tồn và tuyến.
  - Nghiệm thu: có data quality report và danh sách gap cần xử lý.

- [ ] **ML-002 — Chuẩn hóa định nghĩa nhãn và thời điểm dữ liệu** · `P3` · `TODO`
  - Chốt doanh số, mua lại 7/14/30 ngày, thiếu/dư tồn và hiệu quả CTKM.
  - Nghiệm thu: không dùng dữ liệu tương lai khi tạo feature/label.

- [ ] **ML-003 — Xây feature snapshot theo thời gian** · `P3` · `TODO`
  - Tạo dataset tái lập được theo khách, sản phẩm, sale và chi nhánh.
  - Phụ thuộc: `ML-001`, `ML-002`.
  - Nghiệm thu: chạy lại cùng mốc thời gian cho cùng kết quả.

- [ ] **ML-004 — Xây baseline rule và baseline thống kê** · `P3` · `TODO`
  - So sánh model mới với rule hiện tại, trung bình trượt và seasonal baseline.
  - Nghiệm thu: có metric baseline trước khi huấn luyện model phức tạp.

- [ ] **ML-005 — Model dự báo khả năng mua lại** · `P3` · `TODO`
  - Dự báo khách mua trong 7/14/30 ngày và hiệu chỉnh xác suất.
  - Phụ thuộc: `ML-003`, `ML-004`.
  - Nghiệm thu: vượt baseline theo metric và ngưỡng được duyệt.

- [ ] **ML-006 — Model dự báo doanh số** · `P3` · `TODO`
  - Dự báo theo sản phẩm, sale và chi nhánh với khoảng tin cậy.
  - Nghiệm thu: có backtest theo thời gian và so sánh với baseline.

- [ ] **ML-007 — Model cảnh báo tồn kho** · `P3` · `TODO`
  - Dự báo thiếu/dư tồn dựa trên bán, nhập, trả hàng và mùa vụ.
  - Nghiệm thu: cảnh báo có lead time và tỷ lệ đúng được theo dõi.

- [ ] **ML-008 — Đánh giá hiệu quả CTKM** · `P3` · `TODO`
  - Tách tăng trưởng tự nhiên khỏi phần tăng thêm do CTKM trong giới hạn dữ liệu cho phép.
  - Nghiệm thu: công bố rõ giả định, sai số và trường hợp không đủ dữ liệu.

- [ ] **ML-009 — Xây batch scoring và shadow mode** · `P2` · `TODO`
  - Chạy dự báo nhưng chưa tác động quyết định thật; lưu prediction và outcome.
  - Phụ thuộc: ít nhất một trong `ML-005`, `ML-006`, `ML-007` đạt gate kỹ thuật.
  - Nghiệm thu: theo dõi drift, độ chính xác, freshness và lỗi pipeline.

- [ ] **ML-010 — Controlled Pilot cho dự báo** · `P2` · `TODO`
  - Mở cho nhóm người dùng giới hạn, hiển thị confidence và lý do.
  - Nghiệm thu: có kế hoạch rollback, monitoring và business sign-off.

## 8. Task xuyên suốt toàn dự án

- [ ] **OPS-001 — Thiết lập release checklist** · `P0` · `TODO`
  - Bao gồm backup, deploy order, smoke test, rollback và người phê duyệt.

- [ ] **OPS-002 — Thiết lập log và request ID xuyên suốt** · `P0` · `TODO`
  - Cho phép truy vết từ UI → n8n → SQL mà không ghi dữ liệu nhạy cảm không cần thiết.

- [ ] **OPS-003 — Thiết lập dashboard uptime, lỗi và latency** · `P1` · `TODO`
  - Theo dõi success rate, HTTP 4xx/5xx, p50/p95 và workflow failure.

- [ ] **OPS-004 — Thiết lập quy trình backup/rollback** · `P0` · `TODO`
  - Kiểm tra khả năng rollback frontend, workflow và SQL theo manifest.

- [ ] **SEC-001 — Rà soát secret và file public** · `P0` · `TODO`
  - Không để credential, file cấu hình nhạy cảm hoặc tài liệu nội bộ truy cập công khai.

- [ ] **SEC-002 — Test phân quyền âm** · `P0` · `TODO`
  - Cố ý truy vấn khách, kho, chi nhánh và API ngoài quyền để xác nhận bị chặn.
  - **Bổ sung 31/07/2026 — cái bẫy danh sách trắng viết tay đã được bịt.** `Migrate_API_Capability_Metadata_AI.sql` nâng API lên `READ` theo một danh sách gõ tay, nên mọi API chỉ-đọc mới do `API_Metadata_AutoBootstrap_AI` sinh ra đều rơi xuống `DENY` rồi **kẹt ở đó im lặng** cho tới khi có người nhớ thêm tên nó vào. Đúng chuyện đã xảy ra với `@hang_hoa_list`.
    - Đã viết `sql/System - API_Capability_AutoGrant_AI.sql`: tự tìm và cấp `READ`, nhưng chỉ khi chứng minh được cả ba điều — (1) không ghi bảng thật, xác định bằng `sys.dm_sql_referenced_entities` chứ không dò từ khoá; (2) không có SQL động và không gọi procedure lồng; (3) có tham số `IsSystemParam = 1` để server điền danh tính.
    - Vì sao không dò từ khoá: đã thử, nó gắn cờ "có ghi" cho **21/28** API đang là `READ` vì các procedure báo cáo dùng bảng tạm. Dùng DMV thì khớp 100% với danh sách người duyệt — 28/28 `READ` ghi 0 bảng, 3/3 `MUTATION` ghi đúng bảng nghiệp vụ.
    - Chạy 31/07/2026: cấp `READ` cho `@audit_log`, `@read_request_audit`, `@tra_cuu_tong_hop`; giữ `DENY` cho 5 API ghi dữ liệu, 3 API thiếu tham số phân quyền và 1 dòng đăng ký mồ côi (`@cap_nhat_ket_qua_khao_sat` trỏ tới procedure không tồn tại — nên xoá hoặc sửa tên).
    - **Giới hạn còn lại, cần kiểm tay khi làm SEC-002:** cửa số 3 chỉ chứng minh tham số phân quyền *tồn tại*, không chứng minh procedure *thực sự dùng* nó để lọc. Ba API còn `DENY` vì thiếu tham số (`API_ChiTietBaiKhaoSat`, `API_KetQuaBaiKhaoSat`, `API_KiemTraKhaoSatNgay`) là ứng viên rõ ràng cho test phân quyền âm: chúng không nhận danh tính người dùng nên chưa có gì giới hạn phạm vi.
    - Đã đặt `@capability_auto_grant` thành `DENY` + `IsActive = 0`: trigger bootstrap tự đăng ký chính công cụ phân quyền này thành API gọi được từ chat.

- [ ] **SEC-003 — Audit mutation** · `P0` · `TODO`
  - Lưu người thực hiện, thời gian, request ID, loại thao tác và kết quả; không lưu secret.

- [ ] **DOC-001 — Duy trì ma trận yêu cầu ↔ chức năng ↔ test** · `P1` · `TODO`
  - Mỗi yêu cầu khách hàng phải liên kết được với API/UI, test case và trạng thái.

- [ ] **DOC-002 — Cập nhật tài liệu khách sau mỗi release** · `P1` · `TODO`
  - Ảnh, câu lệnh và giới hạn phải khớp bản runtime hiện hành.

- [ ] **METRIC-001 — Thu thập chỉ số sử dụng gợi ý** · `P2` · `TODO`
  - Đo lượt xem, lượt chọn, lượt đưa vào giỏ và chuyển thành đơn.

- [ ] **METRIC-002 — Báo cáo hiệu quả kinh doanh** · `P2` · `TODO`
  - Theo dõi doanh số/điểm bán, khách quay lại, giá trị upsell, tiến độ tích lũy và tồn cận date.

## 9. Các quyết định cần khách hàng xác nhận

Các mục dưới đây có thể làm block task kỹ thuật nếu chưa được chốt:

- [x] **BIZ-001 — Công thức nhóm A/B/C** · `DONE` · Đã duyệt phương án C, rule `BR-TIER-005/2.0.0`, hiệu lực `03/08/2026 13:34:26 +07`; sign-off và case chuẩn tại [CORE-006_CONTRACT_PHAN_NHOM_ABC_2026-08-03.md](CORE-006_CONTRACT_PHAN_NHOM_ABC_2026-08-03.md).
- [ ] **BIZ-002 — Quy tắc khách giảm mua** · Chốt 45/90 ngày và ngoại lệ theo nhóm khách.
- [ ] **BIZ-003 — Cách tính tích lũy** · Chốt VAT, trả hàng, đơn hủy, phạm vi sản phẩm và mốc quà.
- [ ] **BIZ-004 — Sản phẩm trọng tâm** · Chốt file nguồn, thời gian hiệu lực và người cập nhật.
- [ ] **BIZ-005 — CTBH và bảng giá** · Chốt độ ưu tiên khi nhiều chương trình cùng hiệu lực.
- [ ] **BIZ-006 — Mapping kho** · Xác nhận CTY/DL02/DL03 cho từng sale/manager.
- [ ] **BIZ-007 — Nội dung y khoa** · Chỉ định người có chuyên môn duyệt mapping và bán kèm.
- [ ] **BIZ-008 — Chính sách dữ liệu ảnh đơn thuốc** · Chốt quyền truy cập và thời gian lưu.
- [ ] **BIZ-009 — KPI Pilot** · Chốt ngưỡng pass về độ chính xác, latency và hiệu quả kinh doanh.

## 10. Thứ tự thực hiện gần nhất

Để tránh mở quá nhiều hạng mục cùng lúc, thứ tự đề xuất sau ngày bàn giao sơ bộ là:

1. `UAT-001` → `UAT-005`: khóa và đồng bộ đúng bản UAT.
2. `UAT-006` → `UAT-010`: xác minh tài khoản, phạm vi, kho và dữ liệu mẫu.
3. `UAT-011` → `UAT-021`: chạy kiểm thử chức năng, mutation và hiệu năng.
4. `UAT-022` → `UAT-024`: tổng hợp lỗi, phát hành bằng chứng mới và cập nhật tài liệu.
5. Song song xin xác nhận `BIZ-001` → `BIZ-006` để không chặn Giai đoạn 1–2.
6. Sau khi đạt `UAT_BASELINE_READY`, thực hiện `CORE-001` → `CORE-010`.
7. Chỉ bắt đầu OCR và ML khi dữ liệu, pháp lý/chuyên môn và các gate trước đó đã đạt.

## 11. Điều kiện đóng từng giai đoạn

| Giai đoạn | Gate | Điều kiện tối thiểu |
|---|---|---|
| UAT | `UAT_BASELINE_READY` | 13 account đúng quyền, ≥95% test chính pass, không còn P0/P1 chưa chấp nhận |
| Nghiệp vụ lõi | `CORE_SALES_FLOW_READY` | Chat tạo khách/đơn có preview, confirm, idempotency và audit |
| Catalog/CTBH | `CATALOG_PROMOTION_READY` | Ảnh + giá + tồn + CTBH đúng phạm vi và hiệu lực |
| Tuyến | `ROUTE_OPTIMIZATION_PILOT` | Thứ tự ghé hợp lý, ghi nhận được kết quả và đo chuyển đổi |
| OCR | `PRESCRIPTION_OCR_CONTROLLED_PILOT` | OCR có xác nhận tay, mapping chuyên môn và chính sách dữ liệu |
| Dự báo | `PREDICTIVE_SHADOW_READY` | Dataset tái lập, vượt baseline và chạy shadow có monitoring |

---

## 12. Ghi chú cập nhật

- Không xóa task đã hoàn thành; chuyển sang `DONE` và gắn đường dẫn bằng chứng.
- Task bị chặn phải ghi nguyên nhân và người/đơn vị cần phản hồi.
- Khi roadmap thay đổi, cập nhật backlog này trước rồi mới thay đổi kế hoạch release.
- Các mốc thời gian là mục tiêu dự kiến và cần điều chỉnh theo phản hồi UAT, nguồn lực và chất lượng dữ liệu thực tế.
