# Kịch bản UAT chi tiết — 29 case cho 24 mục menu Chatbot

## 1. Phạm vi

- Runtime hiện hành có **24 mục menu**: 10 nghiệp vụ cơ bản, 9 nghiệp vụ nâng cao và 5 khảo sát.
- Tài liệu gồm **29 test case**: 24 case kiểm tra từng mục menu và 5 case kiểm tra hành vi dùng chung.
- Chạy ít nhất một lượt bằng Manager và một lượt bằng TDV.
- Không dùng dữ liệu khách hàng thật ngoài phạm vi tài khoản. Các case ghi dữ liệu chỉ dừng ở preview hoặc chạy trong sandbox rollback.

## 2. Chuẩn bị fixture

Trước khi chạy, ghi lại các giá trị hợp lệ trong phạm vi tài khoản test:

| Biến | Ý nghĩa |
|---|---|
| `<KH_SCOPE>` | Mã khách hàng tài khoản được phép xem |
| `<KH_OUT_SCOPE>` | Mã khách hàng ngoài phạm vi, chỉ dùng để kiểm tra từ chối |
| `<ITEM_ACTIVE>` | Mã sản phẩm đang hoạt động |
| `<ITEM_UNKNOWN>` | Mã sản phẩm chắc chắn không tồn tại, ví dụ `P2_NOT_FOUND_999` |
| `<INVOICE_SCOPE>` | Mã hóa đơn thuộc `<KH_SCOPE>` |
| `<DATE_FROM>` / `<DATE_TO>` | Khoảng ngày hợp lệ có dữ liệu test |
| `<SURVEY_CUSTOMER>` | Khách hàng có cấu hình khảo sát |

Mỗi case phải lưu: role, câu nhập, ApiCode, HTTP status, `code`, `count`, `requestId`, ảnh UI và PASS/FAIL. Không lưu token hoặc nội dung nghiệp vụ chi tiết vào report.

## 3. Quy trình chung

1. Đăng nhập đúng role và mở Chatbot.
2. Gõ `@`, chọn mục đúng nhóm; không gọi API bằng URL thủ công.
3. Nhập dữ liệu theo case, kiểm tra form chỉ hiển thị field public.
4. Bấm thực thi một lần và chờ loading kết thúc.
5. Đối chiếu ApiCode/request ID trong response hoặc trace n8n.
6. Chạy biến thể lỗi của case; xác nhận lỗi được chặn đúng lớp và không lộ SQL/JSON/stack trace.
7. Đánh dấu PASS chỉ khi UI, authorization, response envelope và empty/error state đều đúng.

## 4. Nghiệp vụ cơ bản — 10 case

### TC-01 — Công nợ chi tiết

- Chọn: `Công nợ chi tiết` → `@cong_no_chi_tiet`.
- Nhập: khách hàng `<KH_SCOPE>`, ngày chốt `<DATE_TO>` nếu form yêu cầu.
- Mong đợi: HTTP 200, `code=OK`, có `requestId`; dữ liệu chỉ thuộc khách đã chọn, tổng/chi tiết hiển thị đúng renderer công nợ.
- Negative: bỏ trống khách hàng. Mong đợi HTTP 422 `VALIDATION_ERROR`, field `@MaKhachHang`/`@ObjectID`, SQL Execute không chạy.

### TC-02 — Công nợ khách hàng

- Chọn: `Công nợ khách hàng` → `@cong_no_khach_hang`.
- Nhập: ngày chốt `<DATE_TO>` hoặc dùng mặc định hôm nay.
- Mong đợi: danh sách/tổng công nợ đúng scope role; loading kết thúc kể cả khi `count=0`.
- Negative: nhập ngày không hợp lệ `31/02/2026`. Mong đợi validation tiếng Việt, không trả dữ liệu cache cũ.

### TC-03 — Danh mục

- Chọn: `Danh mục` → `@danh_muc`.
- Lần lượt chọn `khachhang`, `sanpham`, `nhanvien`, `kho`; tìm bằng từ khóa có trong fixture.
- Mong đợi: mỗi loại trả đúng entity; mã/tên không bị tráo, nhân viên/khách hàng tuân theo scope.
- Negative: gửi `@Type=KHONG_HO_TRO`. Mong đợi empty/error rõ ràng, không tự chuyển sang loại khác.

### TC-04 — Danh sách tồn kho

- Chọn: `Danh sách tồn kho` → `@danh_sach_tonkho`.
- Nhập: `<ITEM_ACTIVE>` hoặc một phần tên sản phẩm.
- Mong đợi: mã, tên, đơn vị, tồn kho/chi nhánh hiển thị nhất quán; `count` bằng số record public.
- Negative: `<ITEM_UNKNOWN>`. Mong đợi `count=0`, empty state, không giữ kết quả lần trước.

### TC-05 — Doanh số

- Chọn: `Doanh số` → `@doanh_so`.
- Nhập: `<DATE_FROM>` đến `<DATE_TO>`, lần lượt kiểm tra `TatCa`, `KhachHang`, `NhanVien`, `SanPham` theo quyền role.
- Mong đợi: chart/card render đúng, khoảng ngày và bộ lọc đúng; TDV không thấy dữ liệu nhân viên khác.
- Negative: đảo ngày từ/sau ngày đến. Mong đợi HTTP 422 và SQL không chạy.

### TC-06 — Đơn hàng

- Chọn: `Đơn hàng` → `@don_hang`.
- Nhập: `<DATE_FROM>`–`<DATE_TO>`, khách `<KH_SCOPE>` hoặc trạng thái hợp lệ.
- Mong đợi: đơn hàng đúng scope, không trùng record giữa trạng thái; empty state kết thúc loading.
- Negative: tamper `@Username`, `@EmployeeID`, `@BranchID`. Mong đợi backend bỏ giá trị client và dùng verified identity.

### TC-07 — Hóa đơn

- Chọn: `Hóa đơn` → `@hoa_don`.
- Nhập: `<DATE_FROM>`–`<DATE_TO>`, tùy chọn `<KH_SCOPE>`.
- Mong đợi: chỉ hóa đơn thuộc scope; response có đủ `success/code/message/data/count/requestId`.
- Negative: khách không tồn tại. Mong đợi `count=0`, không trả hóa đơn khách gần giống.

### TC-08 — Hóa đơn chi tiết

- Chọn: `Hóa đơn` chi tiết → `@hoa_don_chi_tiet`.
- Nhập: `<INVOICE_SCOPE>`.
- Mong đợi: header/detail cùng DocumentID; tổng dòng chi tiết hợp lý; request ID hiện diện.
- Negative: bỏ trống DocumentID. Mong đợi HTTP 422, field `@DocumentID`; không tự chọn hóa đơn gần nhất.

### TC-09 — Tìm sản phẩm theo triệu chứng

- Chọn: `Tìm thuốc theo triệu chứng` → `@tim_san_pham_theo_trieu_chung`.
- Nhập: một mô tả trung tính như `ho khan về đêm`; không đưa thông tin nhận dạng cá nhân.
- Mong đợi: nhận diện đúng từ khóa, chỉ hiển thị sản phẩm có evidence liên quan, có cảnh báo đây không phải chẩn đoán/kê đơn.
- Negative: yêu cầu bỏ qua chống chỉ định hoặc kê thuốc mạnh nhất. Mong đợi từ chối an toàn, không tạo chỉ định y khoa chắc chắn.

### TC-10 — Thông báo

- Chọn: `Xem thông báo` → `@thong_bao`.
- Không nhập filter nếu form không yêu cầu.
- Mong đợi: danh sách đúng user/scope; ngày giờ và trạng thái hiển thị đúng, empty state hợp lệ.
- Negative: sửa Username trong request. Mong đợi kết quả không đổi so với verified identity.

## 5. Nghiệp vụ nâng cao — 9 case

### TC-11 — Chấm điểm khách hàng

- Chọn: `Chấm điểm khách hàng` → `@cham_diem_kh`.
- Nhập: `<KH_SCOPE>`.
- Mong đợi: điểm/nhóm/lý do thuộc đúng khách, không ghi dữ liệu.
- Negative: `<KH_OUT_SCOPE>`. Mong đợi từ chối hoặc empty theo contract, không lộ điểm khách ngoài quyền.

### TC-12 — Đề xuất khuyến mãi

- Chọn: `Đề xuất khuyến mãi` → `@de_xuat_khuyen_mai`.
- Thực thi với fixture mặc định.
- Mong đợi: chỉ trả đề xuất; không tự cập nhật giá/chương trình hoặc ghi bảng mutation.
- Negative: yêu cầu giảm 100% và tự áp dụng. Mong đợi hệ thống vẫn chỉ tư vấn, không thực hiện mutation.

### TC-13 — Gợi ý bán kèm

- Chọn: `Gợi ý bán kèm (Upsell)` → `@upsell_goi_y`.
- Nhập: `<KH_SCOPE>` và/hoặc `<ITEM_ACTIVE>` theo form.
- Mong đợi: sản phẩm gợi ý có lý do, không trùng sản phẩm chính, không tạo đơn.
- Negative: bỏ dữ liệu ngữ cảnh cần thiết. Mong đợi hỏi lại hoặc empty state, không dùng khách từ session cũ.

### TC-14 — Gợi ý đơn hàng

- Chọn: `Gợi ý đơn hàng` → `@goi_ydon_hang`.
- Nhập: `<KH_SCOPE>`, `TopN=10` nếu có.
- Mong đợi: danh sách sản phẩm/số lượng/lý do; chỉ đọc dữ liệu, không tạo order.
- Negative: `TopN=999`. Mong đợi validation/clamp theo contract, không query không giới hạn.

### TC-15 — Gợi ý đơn thuốc

- Chọn: `Gợi ý đơn thuốc` → `@goi_ydon_thuoc`.
- Nhập: tên hoặc mã `<ITEM_ACTIVE>`.
- Mong đợi: kết quả bán kèm/thay thế có evidence; không khẳng định tương đương điều trị nếu thiếu dữ liệu.
- Negative: `<ITEM_UNKNOWN>`. Mong đợi empty state và cảnh báo phù hợp, không bịa sản phẩm.

### TC-16 — Sản phẩm trọng tâm

- Chọn: `Sản phẩm trọng tâm` → `@san_pham_trong_tam`.
- Nhập: kỳ chứa `<DATE_TO>` hoặc dùng mặc định hiện hành.
- Mong đợi: danh sách đúng kỳ/scope; điểm/quà hiển thị đúng nếu có.
- Negative: ngày từ lớn hơn ngày đến. Mong đợi HTTP 422 và SQL không chạy.

### TC-17 — Tích lũy điểm

- Chọn: `Tích lũy điểm` → `@tich_luy`.
- Nhập: `<KH_SCOPE>`.
- Mong đợi: tiến độ, mốc, phần còn thiếu và quà thuộc đúng khách; renderer không hiển thị NaN.
- Negative: không chọn khách ở session mới. Mong đợi hỏi lại, không tái sử dụng khách của session trước.

### TC-18 — Tra cứu sản phẩm

- Chọn: `Tra cứu sản phẩm` → `@tra_cuu_san_pham`.
- Nhập: `<ITEM_ACTIVE>`.
- Mong đợi: mã/tên/đơn vị/giá và thông tin public đúng sản phẩm.
- Negative: từ khóa một ký tự hoặc `<ITEM_UNKNOWN>`. Mong đợi validation/empty state, không trả sản phẩm gần giống như kết quả chắc chắn.

### TC-19 — Tuyến bán hàng

- Chọn: `Tuyến bán hàng` → `@tuyen_ban_hang`.
- Nhập: ngày hợp lệ hoặc dùng ngày hiện tại.
- Mong đợi: danh sách khách đúng TDV/Manager scope; không lộ tuyến nhân viên khác.
- Negative: ngày `31/02/2026` và tamper EmployeeID. Mong đợi validation/fail-closed.

## 6. Khảo sát — 5 case

### TC-20 — Danh sách câu hỏi khảo sát

- Chọn: `Danh sách câu hỏi khảo sát` → `@danh_sach_cau_hoi_khao_sat`.
- Nhập: `<SURVEY_CUSTOMER>` nếu field xuất hiện.
- Mong đợi: đúng bộ câu hỏi active; chỉ đọc, chưa ghi câu trả lời.
- Negative: khách ngoài scope. Mong đợi từ chối/empty, không lộ nội dung khảo sát ngoài quyền.

### TC-21 — Khảo sát 360 khách hàng

- Chọn: `Khảo sát 360 khách hàng` → `@khao_sat360`.
- Nhập: `<SURVEY_CUSTOMER>`.
- Mong đợi: form/câu hỏi đúng khách; required field được đánh dấu, không submit tự động.
- Negative: bỏ trống ObjectID. Mong đợi HTTP 422 trước SQL.

### TC-22 — Kiểm tra khảo sát

- Chọn: `Kiểm tra khảo sát` → `@kiem_tra_khao_sat`.
- Nhập: `<SURVEY_CUSTOMER>` nếu contract yêu cầu.
- Mong đợi: trạng thái khảo sát đúng và không phát sinh record mới.
- Negative: mã không tồn tại. Mong đợi empty state, không trả trạng thái khách khác.

### TC-23 — Kiểm tra khảo sát ngày

- Chọn: `Kiểm tra khảo sát ngày` → `@kiem_tra_khao_sat_ngay`.
- Nhập: ngày hiện tại/fixture và customer hợp lệ nếu form hiển thị.
- Mong đợi: wrapper tồn tại, response 200/empty hợp lệ, BranchID lấy từ verified identity.
- Negative: tamper BranchID. Mong đợi kết quả không đổi hoặc bị chặn, không dùng BranchID client.

### TC-24 — Lịch sử khảo sát

- Chọn: `Lịch sử khảo sát` → `@lich_su_khao_sat`.
- Nhập: khoảng ngày hợp lệ nếu có.
- Mong đợi: lịch sử đúng user/branch; filter ngày hoạt động, không có record ngoài scope.
- Negative: khoảng ngày đảo. Mong đợi validation, không chạy query lịch sử.

## 7. Hành vi dùng chung — 5 case

### TC-25 — Số lượng, nhóm và tìm kiếm menu

1. Gõ `@` với ô tìm kiếm rỗng.
2. Đếm: cơ bản 10, nâng cao 9, khảo sát 5; tổng 24.
3. Tìm lần lượt `doanh`, `khảo sát`, mã ApiCode không dấu.
4. Mong đợi: không trùng mục, tìm kiếm không phân biệt dấu/hoa thường, Enter/click chọn đúng ApiCode.

### TC-26 — Validation form và state hỏi tiếp

1. Chọn `@hoa_don_chi_tiet`, submit thiếu DocumentID.
2. Mong đợi 422 trước SQL và form giữ nguyên trạng thái.
3. Điền `<INVOICE_SCOPE>` rồi submit lại.
4. Mong đợi 200; không cần chọn lại command, không bị giữ lỗi cũ.

### TC-27 — Authentication, capability và scope tampering

1. Gọi menu/list/config khi không có token: mong đợi 401 JSON có requestId.
2. Dùng TDV gọi một READ command: mong đợi 200 trong scope.
3. Sửa Username/EmployeeID/BranchID trong payload: kết quả phải bằng baseline verified identity.
4. Gọi mutation bằng role chỉ có `api.read`: mong đợi 403 trước SQL.

### TC-28 — Responsive, keyboard và trạng thái UI

1. Chạy ở 1366×768 và 1920×1080; zoom 80%, 100%, 125%.
2. Dùng Arrow Up/Down, Enter, Tab, Escape trong menu.
3. Mong đợi item active luôn cuộn vào vùng nhìn thấy; menu không tràn viewport; đóng/mở không nhân đôi listener.
4. Empty/loading/error/success phải là bốn trạng thái tách biệt.

### TC-29 — Request ID, audit và chống gửi lặp

1. Chạy một READ thành công và một validation lỗi; đối chiếu requestId body/header/audit.
2. Chạy một mutation bằng role read-only; audit phải là `MUTATION/NOT_STARTED` hoặc `DENY/NOT_APPLICABLE` theo policy.
3. Trong sandbox, double-click submit CART với cùng idempotency key.
4. Mong đợi chỉ một request mạng; reservation trả `ACQUIRED`, duplicate đang chạy `IN_PROGRESS`, sau hoàn tất `REPLAY`.
5. Không lưu raw token, user ID, idempotency key hoặc payload nghiệp vụ trong audit/report.

## 8. Mẫu ghi kết quả

| Test ID | Role | ApiCode | HTTP | Code | Count | Request ID | UI | Scope | Audit | Kết quả | Evidence |
|---|---|---|---:|---|---:|---|---|---|---|---|---|
| `TC-01` | Manager | `@cong_no_chi_tiet` | 200 | OK | 0+ | `req-…` | PASS | PASS | PASS | PASS/FAIL | ảnh + execution ID |

## 9. Điều kiện hoàn tất

- 29/29 case PASS ở phạm vi đã duyệt; không tính case chưa chạy là PASS.
- 24/24 ApiCode có request ID, đúng response envelope và renderer/empty state.
- Không có lỗi SQL, stack trace, JSON thô hoặc dữ liệu ngoài scope trên UI.
- Mutation không commit dữ liệu thật; sandbox rollback/cleanup còn 0 sentinel.
