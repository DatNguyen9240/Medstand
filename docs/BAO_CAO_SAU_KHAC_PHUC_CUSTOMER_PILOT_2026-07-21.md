# Báo cáo Medstand AI sau khắc phục — Customer Pilot

**Ngày cập nhật:** 22/07/2026  
**Chế độ thực hiện:** `IMPLEMENTATION`  
**Phạm vi:** hội thoại tự nhiên, 24 API read-only, xác thực gateway, fixture 13 tài khoản, frontend build và tài liệu triển khai.  
**Trạng thái hiện tại:** `N8N_IMPORTED_RUNTIME_RETEST_PENDING`.

> Source đã được sửa và kiểm tra tĩnh. Người triển khai xác nhận hai workflow n8n đã được import ngày 22/07/2026. Trạng thái Published/Active, gateway đang chạy đúng bundle mới và kết quả runtime 24 API/13 tài khoản vẫn phải được xác nhận trước khi gọi là Runtime PASS hoặc Customer Pilot PASS.

## 1. Kết luận điều hành

Các lỗi P0 có thể xử lý trực tiếp trong source đã được khắc phục:

1. Gateway từ chối request chat/gateway không có Bearer token bằng HTTP `401`, mã `AUTH_REQUIRED` và `requestId`.
2. Bộ phân loại câu tự nhiên bao phủ đủ 24 API read-only đã duyệt.
3. Bốn nhóm khảo sát không còn rơi chung vào API danh sách câu hỏi.
4. `@don_hang` không còn bắt buộc mã khách hàng; `@tich_luy`, gợi ý đơn hàng và bán kèm vẫn bắt buộc chọn khách.
5. Lịch sử khảo sát được đưa về đúng contract SQL: tra theo người dùng đã xác thực và khoảng ngày, không truyền thêm mã khách hàng mà procedure không nhận.
6. Có fixture khách hàng đúng phạm vi cho đủ 13 tài khoản UAT, không dùng chung `AG0031` cho mọi miền.
7. Build frontend và renderer sản phẩm trọng tâm đều pass.

Quyết định hiện tại là **được chuyển sang vòng kiểm thử kỹ thuật sau import**, chưa ký Customer Pilot PASS. Việc tiếp theo là xác nhận chỉ một parser canonical và workflow chính đang Published/Active, khởi động lại Node gateway, rồi chạy ma trận runtime 24 API và smoke 13 tài khoản.

## 2. Những file đã sửa

| Thành phần | File | Nội dung |
|---|---|---|
| Registry intent | `config/natural-language/intent-map.v1.json` | Chuẩn hóa required entity theo contract thực tế của 24 API |
| Fixture UAT | `config/uat/account-fixtures.v1.json` | Khách đại diện đúng scope cho 7 Manager và 6 Sale, không chứa mật khẩu/token |
| Classifier | `scripts/natural_chat_classifier.js` | Định tuyến câu tự nhiên, casual/meta, thiếu tham số và 24 API |
| Workflow generator | `scripts/apply_natural_chat_classifier_patch.js` | Đồng bộ parser, pre-router, mapping param và validation vào n8n JSON |
| Catalog test | `scripts/natural_chat_test_catalog.js` | 130 câu kiểm thử, có các regression do UAT phát hiện |
| Runtime test | `scripts/run_authenticated_natural_chat_test.js` | Tự chọn fixture theo tài khoản khi chạy live test |
| Gateway | `server.js` | Fail-closed xác thực, chuẩn hóa lỗi upstream/response rỗng và request ID |
| n8n source | `n8n/AI_Core/AI_Intent_Parser.json` | Parser đã sinh lại từ classifier hiện tại |
| n8n source | `n8n/AI_Core/MAIN_ChatBot_V5.json` | Intent registry, mapping param và validation đã đồng bộ |

## 3. Ma trận chức năng sau sửa source

| # | API | Câu tự nhiên tiêu biểu | Contract sau sửa |
|---:|---|---|---|
| 1 | `@doanh_so` | “doanh số tháng này” | Không bắt buộc entity |
| 2 | `@hoa_don` | “xem hóa đơn tháng này” | Không bắt buộc khách |
| 3 | `@hoa_don_chi_tiet` | “chi tiết hóa đơn INV...” | Bắt buộc mã hóa đơn |
| 4 | `@don_hang` | “xem đơn hàng” | Không bắt buộc khách |
| 5 | `@cham_diem_kh` | “chấm điểm khách hàng” | Có thể xem danh sách theo scope |
| 6 | `@cong_no_khach_hang` | “công nợ khách hàng” | Trả danh sách tổng quan theo scope |
| 7 | `@cong_no_chi_tiet` | “công nợ của AG...” | Bắt buộc khách |
| 8 | `@tich_luy` | “tích lũy của AG...” | Bắt buộc khách |
| 9 | `@tuyen_ban_hang` | “tuyến bán hàng hôm nay” | Không bắt buộc khách |
| 10 | `@goi_ydon_hang` | “gợi ý đơn hàng cho AG...” | Bắt buộc khách |
| 11 | `@upsell_goi_y` | “gợi ý bán kèm cho AG...” | Bắt buộc khách |
| 12 | `@goi_ydon_thuoc` | “gợi ý đơn thuốc cho A015” | Bắt buộc sản phẩm gốc |
| 13 | `@danh_sach_tonkho` | “tồn kho A015” | Bắt buộc sản phẩm/từ khóa |
| 14 | `@tra_cuu_san_pham` | “tìm sản phẩm A003” | Bắt buộc sản phẩm/từ khóa |
| 15 | `@san_pham_trong_tam` | “sản phẩm trọng tâm” | Không bắt buộc entity |
| 16 | `@de_xuat_khuyen_mai` | “sản phẩm cần xem xét khuyến mãi” | Không bắt buộc entity; read-only |
| 17 | `@danh_muc` | “danh mục kho hàng” | Ánh xạ `Type=khohang` |
| 18 | `@khao_sat360` | “khảo sát 360 của AG...” | Bắt buộc `ObjectID` |
| 19 | `@danh_sach_cau_hoi_khao_sat` | “câu hỏi khảo sát của AG...” | Bắt buộc khách |
| 20 | `@kiem_tra_khao_sat` | “trạng thái khảo sát AG...” | Bắt buộc khách |
| 21 | `@kiem_tra_khao_sat_ngay` | “hôm nay tôi đã khảo sát chưa” | Theo user đã xác thực |
| 22 | `@lich_su_khao_sat` | “lịch sử khảo sát” | Theo user đã xác thực và khoảng ngày |
| 23 | `@thong_bao` | “xem thông báo của tôi” | Theo user đã xác thực |
| 24 | `@tim_san_pham_theo_trieu_chung` | “tìm sản phẩm theo triệu chứng ho” | Bắt buộc từ khóa; chỉ tham khảo |

## 4. Kết quả kiểm thử source

| Kiểm tra | Kết quả |
|---|---:|
| Classifier bắt buộc | `46/46 PASS` |
| Danh sách API được duyệt | `24/24` |
| Bộ câu tự nhiên tĩnh | `130/130 PASS` |
| Release gate của bộ câu tự nhiên | `0 lỗi` |
| Khảo sát | `6/6 PASS` |
| Các route regression UAT | `7/7 PASS` |
| Workflow source JSON | Parse PASS |
| Node syntax | PASS |
| Frontend build | PASS |
| Renderer sản phẩm trọng tâm | `25/25 PASS` |
| Gateway không token | HTTP `401 AUTH_REQUIRED` PASS |
| `git diff --check` | Không có whitespace error; chỉ cảnh báo LF/CRLF |

Các test contract cũ được ghi trong báo cáo trước không còn tồn tại trong worktree do đợt dọn code/test trước đó. Vì vậy không được ghi chúng là PASS trong release này; coverage hiện được chứng minh bằng suite tự nhiên, build, renderer và kiểm tra gateway nêu trên.

## 5. Fixture cho 13 tài khoản

| Vai trò | Tài khoản | Khách đại diện |
|---|---|---|
| Manager | `QLBH013.MED` | `NDB001` |
| Sale | `NAMDINHB.MED` | `NDB001` |
| Manager | `QLBH016.MED` | `BNA051` |
| Sale | `BACNINHA.MED` | `BNA051` |
| Manager | `QLBH005.MED` | `HUEA043` |
| Sale | `HUEB.MED` | `HUEA043` |
| Manager | `QLBH010.MED` | `QANA002` |
| Sale | `DANANGA.MED` | `QANA002` |
| Manager | `QLMN2` | `DL012` |
| Sale | `CanThoA` | `DL012` |
| Manager | `QLMD1` | `SGNB0001` |
| Sale | `BinhPhuocA` | `SGNB0001` |
| Manager | `QLBH024.MED` | `AG0020` |

Fixture chỉ dùng để chọn dữ liệu kiểm thử trong đúng scope. Nó không sửa quyền, không sao chép dữ liệu giữa miền và không chứa credential.

## 6. Những việc chưa được gọi là PASS

| Hạng mục | Trạng thái | Lý do |
|---|---|---|
| n8n import | `USER_CONFIRMED_IMPORTED` | Người triển khai xác nhận đã import ngày 22/07/2026 |
| n8n Published/Active | `PENDING_VERIFY` | Import không tự chứng minh workflow đang Published/Active hoặc chỉ có một parser canonical |
| Natural runtime 24/24 | `PENDING_RETEST` | Kết quả 14/24 cũ thuộc runtime trước sửa |
| Smoke 13/13 | `PENDING_RETEST` | Kết quả 3/13 cũ dùng fixture chung sai scope |
| Load success >=99% | `PENDING_RETEST` | Lỗi chức năng cũ làm success rate chỉ 70% |
| SQL runtime cho khảo sát | `PENDING` | Cần đối chiếu metadata/API sau khi deploy |
| Business approval | `PENDING` | Tài chính, tồn khả dụng, khuyến mãi và nội dung chuyên môn vẫn cần owner |

## 7. Trạng thái triển khai và việc còn lại

Đã được người triển khai xác nhận:

1. Đã import `n8n/AI_Core/AI_Intent_Parser.json`.
2. Đã import `n8n/AI_Core/MAIN_ChatBot_V5.json`.

Việc bắt buộc còn lại:

1. Xác nhận hai workflow đúng bản mới đang Published/Active và chỉ một parser canonical được gọi.
2. Không bật workflow migration, backup hoặc UAT helper như workflow vận hành hằng ngày.
3. Khởi động lại Node gateway để nạp `server.js` và bundle frontend mới.
4. Xóa cache trình duyệt hoặc hard refresh khi kiểm tra UI.
5. Chạy Manager và Sale smoke trước; sau đó chạy đủ 13 tài khoản.
6. Chạy 24 câu `@` và 24 câu tự nhiên trên cùng release.
7. Chạy tải có kiểm soát sau khi functional pass; không dùng load test để che lỗi nghiệp vụ.

Không cần import SQL mới cho riêng bản sửa định tuyến/gateway này. Nếu server chưa có các procedure khảo sát hiện hành thì phải deploy theo gói SQL đã được kiểm tra riêng, không trộn với thao tác publish n8n.

## 8. Tiêu chí GO cho Customer Pilot

- Gateway ẩn danh: 100% trả `401/403`, không có execution SQL.
- 24 lệnh `@`: `24/24 PASS`.
- 24 câu tự nhiên chuẩn: `24/24` gọi đúng API.
- Các câu thiếu tham số: hỏi đúng một trường cần bổ sung, không tự đoán.
- 13 tài khoản: `13/13` hoàn tất smoke trong đúng scope.
- Không có dữ liệu chéo miền/nhân viên.
- Error taxonomy phân biệt được `NO_DATA`, `OUT_OF_SCOPE`, `VALIDATION_ERROR`, `SYSTEM_ERROR`.
- Load test sau functional pass: success rate tối thiểu `99%`, không có chuỗi HTTP 500 lặp lại.
- Có release ID, rollback workflow và người chịu trách nhiệm hỗ trợ UAT.

## 9. Timeline đề xuất

| Thời lượng | Công việc | Đầu ra |
|---:|---|---|
| Đã thực hiện | Import 2 workflow | Source mới đã có trong n8n; còn xác nhận Published/Active |
| 10–15 phút | Xác nhận Published/Active và parser canonical | Runtime gọi đúng workflow mới |
| 15 phút | Restart gateway, hard refresh frontend | Gateway/UI nhận bản mới |
| 45–60 phút | Smoke Manager + Sale và 24 API | Chốt lỗi contract/routing |
| 60–90 phút | Chạy đủ 13 tài khoản theo fixture | Chốt scope và dữ liệu đại diện |
| 30–45 phút | Load 40–100 request có kiểm soát | Chốt success rate, p95, lỗi lặp |
| 30 phút | Cập nhật evidence/release note | Gói bàn giao UAT có truy vết |

Tổng thời gian kỹ thuật còn lại dự kiến: khoảng **2,5–4 giờ**, chưa tính thời gian chờ hạ tầng hoặc business owner.

## 10. Kết luận

Source đã đóng các nguyên nhân trực tiếp của lỗi routing, thiếu xác thực gateway và fixture sai phạm vi; hai workflow đã được người triển khai xác nhận import. Mức hiện tại là **Imported, chờ Runtime Retest**, chưa phải **Runtime PASS**. Bước tiếp theo là xác nhận Published/Active, restart gateway và chạy lại evidence runtime trên chính release đó.
