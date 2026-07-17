# BÁO CÁO RÀ SOÁT METADATA, API VÀ SMOKE TEST DANH MỤC LỆNH `@` CHATBOT

**Dự án:** Medstand  
**Ngày kiểm thử:** 14/07/2026  
**Chế độ:** REVIEW – chỉ kiểm thử và báo cáo, không sửa mã nguồn/không thay đổi dữ liệu  
**Phạm vi:** danh mục lệnh `@`, cấu hình tham số, endpoint thực thi và smoke test các lệnh chỉ đọc

## 1. Kết luận nhanh

- Hệ thống hiện công bố **28 lệnh `@` đang hoạt động**.
- Đã smoke-test endpoint đối với **24 lệnh chỉ đọc** bằng payload rỗng/an toàn.
- **3 lệnh mutation và 1 hành động điều hướng/tạo giỏ không được thực thi**, chỉ kiểm tra cấu hình và luồng validate tĩnh.
- Phát hiện lỗi bảo mật **CRITICAL**: endpoint `api-execute` vẫn thực thi và trả dữ liệu khi request không có Authorization.
- Kiểm thử trực tiếp thao tác/hiển thị UI theo từng lệnh hiện bị chặn vì trình duyệt kiểm thử chưa có phiên đăng nhập.
- Báo cáo này **không phải biên bản nghiệm thu hoàn chỉnh 28 lệnh** và chưa xác nhận tính đúng của dữ liệu nghiệp vụ.

## 2. Chính sách kiểm thử an toàn

- Không gửi lệnh tạo/cập nhật dữ liệu thật.
- Không ghi lại giá trị dữ liệu kinh doanh hoặc thông tin khách hàng trong báo cáo.
- Với lệnh đọc, báo cáo chỉ ghi trạng thái, số dòng và tên nhóm trường trả về.
- Không thay đổi API, workflow n8n, database hoặc giao diện.

## 3. Danh mục 28 lệnh đang hoạt động

| STT | Lệnh | Loại | Tham số hiển thị |
|---:|---|---|---|
| 1 | `@cap_nhat_ket_qua_khao_sat` | Có ghi dữ liệu | `@UserAutoID`, `@DapAn` |
| 2 | `@cham_diem_kh` | Đọc | `@MaKhachHang`, `@NhomFilter`, `@EmployeeID`, `@RiskLevel`, `@Page`, `@PageSize` |
| 3 | `@cong_no_chi_tiet` | Đọc | `@MaKhachHang`, `@DenNgay` |
| 4 | `@cong_no_khach_hang` | Đọc | `@DenNgay`, `@MaKhachHang` |
| 5 | `@danh_muc` | Đọc | `@Type`, `@timkiem` |
| 6 | `@danh_sach_cau_hoi_khao_sat` | Đọc | `@MaKhachHang` |
| 7 | `@danh_sach_tonkho` | Đọc | `@TenSanPham`, `@timkiem` |
| 8 | `@de_xuat_khuyen_mai` | Đọc | Không có |
| 9 | `@doanh_so` | Đọc | `@MaKhachHang`, `@ObjectName`, `@EmployeeID`, `@TenNhanVien`, `@TenSanPham`, `@TuNgay`, `@DenNgay`, `@TopN`, `@LoaiBaoCao` |
| 10 | `@don_hang` | Đọc | `@TuNgay`, `@DenNgay`, `@StatusID`, `@StatusName`, `@EmployeeID`, `@MaKhachHang`, `@timkiem`, `@TopN` |
| 11 | `@goi_ydon_hang` | Đọc | `@MaKhachHang`, `@ObjectID`, `@TopN` |
| 12 | `@goi_ydon_thuoc` | Đọc | `@timkiem` |
| 13 | `@hoa_don` | Đọc | `@TuNgay`, `@DenNgay`, `@timkiem`, `@MaKhachHang` |
| 14 | `@hoa_don_chi_tiet` | Đọc | `@DocumentID` |
| 15 | `@khach_hang_insert` | Có ghi dữ liệu | `@TenKhachHang`, `@SoDienThoai`, `@DiaChi`, `@ObjectGroupID` |
| 16 | `@khao_sat360` | Đọc | `@ObjectID`, `@FromDate`, `@ToDate` |
| 17 | `@kiem_tra_khao_sat` | Đọc | `@Ngay` |
| 18 | `@kiem_tra_khao_sat_ngay` | Đọc | `@Ngay` |
| 19 | `@lap_don_hang` | Navigation action (`CART` tại frontend) | `@DocumentID`, `@ObjectID`, `@ItemList` |
| 20 | `@lich_su_khao_sat` | Đọc | `@FromDate`, `@ToDate`, `@BranchID` |
| 21 | `@san_pham_trong_tam` | Đọc | `@MaKhachHang`, `@TopN` |
| 22 | `@san_pham_trong_tam_import` | Có ghi dữ liệu | `@DocumentID`, `@TuNgay`, `@DenNgay`, `@Memo`, `@JsonItems`, `@JsonRules` |
| 23 | `@thong_bao` | Đọc | Không có |
| 24 | `@tich_luy` | Đọc | `@MaKhachHang`, `@ProgramID`, `@TuNgay`, `@DenNgay`, `@ItemIDs` |
| 25 | `@tim_san_pham_theo_trieu_chung` | Đọc | `@Keyword` |
| 26 | `@tra_cuu_san_pham` | Đọc | `@timkiem`, `@TopN` |
| 27 | `@tuyen_ban_hang` | Đọc | `@MaKhachHang`, `@SoNgayVangMat`, `@NgayBaoDong`, `@TopN`, `@NgayTarget` |
| 28 | `@upsell_goi_y` | Đọc | `@MaKhachHang`, `@timkiem`, `@TopN` |

## 4. Kết quả smoke test 24 lệnh chỉ đọc

Quy ước:

- **DATA:** endpoint trả về ít nhất một dòng.
- **EMPTY:** request hợp lệ nhưng không có dữ liệu với payload rỗng.
- **MSG:** backend trả một dòng thông báo nghiệp vụ (`Msg`, `MsgType`) thay vì dữ liệu chính.

| Lệnh | Kết quả | Số dòng quan sát | Nhóm trường trả về/ghi chú |
|---|---|---:|---|
| `@cham_diem_kh` | MSG | 1 | `Msg`, `MsgType` |
| `@cong_no_chi_tiet` | EMPTY | 0 | Cần khách hàng |
| `@cong_no_khach_hang` | EMPTY | 0 | Cần khách hàng/ngày |
| `@danh_muc` | DATA | 5 | Nhóm danh mục, nhãn, biểu tượng, datasource |
| `@danh_sach_cau_hoi_khao_sat` | EMPTY | 0 | Cần khách hàng |
| `@danh_sach_tonkho` | EMPTY | 0 | Cần tiêu chí tìm kiếm |
| `@de_xuat_khuyen_mai` | DATA | 1 | Sản phẩm, tồn kho, hạn dùng, loại và chi tiết đề xuất |
| `@doanh_so` | MSG | 1 | `Msg`, `MsgType` |
| `@don_hang` | EMPTY | 0 | Không có kết quả với payload rỗng |
| `@goi_ydon_hang` | MSG | 1 | `Msg`, `MsgType` |
| `@goi_ydon_thuoc` | DATA | 1 | Sản phẩm, đơn vị, cảnh báo AI |
| `@hoa_don` | MSG | 1 | `Msg`, `MsgType` |
| `@hoa_don_chi_tiet` | EMPTY | 0 | Cần mã chứng từ |
| `@khao_sat360` | EMPTY | 0 | Cần khách hàng/khoảng ngày |
| `@kiem_tra_khao_sat` | EMPTY | 0 | Cần ngày |
| `@kiem_tra_khao_sat_ngay` | EMPTY | 0 | Cần ngày |
| `@lich_su_khao_sat` | EMPTY | 0 | Cần khoảng ngày/chi nhánh |
| `@san_pham_trong_tam` | DATA | 108 | Thông tin chương trình, khách hàng, doanh số, mốc/quà tiếp theo |
| `@thong_bao` | DATA | 8 | Tiêu đề, nội dung, ngày gửi, trạng thái |
| `@tich_luy` | MSG | 1 | `Msg`, `MsgType` |
| `@tim_san_pham_theo_trieu_chung` | DATA | 10 | Thông tin sản phẩm |
| `@tra_cuu_san_pham` | DATA | 50 | Sản phẩm, giá, tồn kho, thành phần, công dụng |
| `@tuyen_ban_hang` | MSG | 1 | `Msg`, `MsgType` |
| `@upsell_goi_y` | MSG | 1 | `Msg`, `MsgType` |

### Nhận xét

> Kết quả smoke test chỉ xác nhận khả năng gọi endpoint và hình dạng phản hồi sơ bộ, không xác nhận tính đúng của dữ liệu nghiệp vụ, phân quyền, phân trang, tìm kiếm, tồn kho hoặc phạm vi chi nhánh.

- Các lệnh cần tham số đang có hai kiểu phản hồi không thống nhất: một số trả mảng rỗng, một số trả một bản ghi `Msg/MsgType`.
- Nếu frontend không tách bản ghi thông báo nghiệp vụ khỏi dữ liệu thật, UI có thể dựng card/bảng sai hoặc hiển thị “có 1 kết quả” dù thực chất là lỗi thiếu tham số.
- `@tra_cuu_san_pham` trả tối đa 50 dòng trong lần gọi này. Đây là số dòng API trả về, không chứng minh hệ thống chỉ có 50 sản phẩm.
- `@san_pham_trong_tam` trả 108 dòng khi không có phiên đăng nhập, làm tăng mức độ nghiêm trọng của lỗi phân quyền.

## 5. Ba lệnh mutation và một hành động điều hướng – chỉ kiểm tra tĩnh

Không thực thi các lệnh sau để tránh tạo/cập nhật dữ liệu thật:

| Lệnh | Trạng thái kiểm thử | Rủi ro cần xác nhận khi có môi trường test |
|---|---|---|
| `@cap_nhat_ket_qua_khao_sat` | Không gửi request | Cập nhật câu trả lời khảo sát |
| `@khach_hang_insert` | Không gửi request | Tạo khách hàng mới |
| `@lap_don_hang` | Không gửi request | Metadata khai báo `INSERT`, nhưng frontend ép thành `CART` và chuyển sang trang tạo đơn; chưa thấy ghi đơn trực tiếp tại bước chatbot |
| `@san_pham_trong_tam_import` | Không gửi request | Import chương trình/sản phẩm trọng tâm |

Kết quả kiểm tra mã nguồn:

- Form tổng quát chỉ chặn trường trống khi `IsRequired == 1`.
- Metadata hiện trả `IsRequired = false` cho toàn bộ trường được kiểm tra.
- Luồng nhập trực tiếp còn ghi rõ bỏ qua chặn lỗi để backend/AI tự xử lý.
- Cả bốn luồng đều cần test trong môi trường/database sandbox trước khi UAT dữ liệu thật, kể cả form tạo khách hàng có validate riêng và `@lap_don_hang` hiện được xem là navigation action.
- Cần kiểm tra bước xác nhận, chống nhấn lặp/idempotency, validation backend, phân quyền mutation, transaction/rollback, audit log và việc không cho client tự cấp `User`, `BranchID`, `ObjectID` ngoài phạm vi.

## 6. Các lỗi/phát hiện

### CHAT-UAT-01 — CRITICAL — Thực thi API không cần đăng nhập

**Thực tế:** POST tới `/webhook/api-execute` không có Authorization vẫn thực thi stored procedure và trả dữ liệu cho nhiều lệnh.

**Bằng chứng mã nguồn workflow:** workflow xóa username do client gửi và thử lấy username từ Bearer token, nhưng khi không có token thì để username rỗng rồi vẫn tiếp tục dựng và thực thi câu lệnh stored procedure.

**Bằng chứng tái hiện không chứa dữ liệu nhạy cảm:** 

| Thời gian (UTC+7) | Môi trường | Authorization | ApiCode | HTTP | Số dòng | CORS | Request/execution ID |
|---|---|---|---|---:|---:|---|---|
| 14/07/2026 22:21:13–22:21:21 | `localhost:5678` | Không có | `@danh_muc` | 200 | 5 | `*` | Không được response cung cấp |
| 14/07/2026 22:21:15–22:21:16 | `localhost:5678` | Không có | `@de_xuat_khuyen_mai` | 200 | 1 | `*` | Không được response cung cấp |
| 14/07/2026 22:21:16–22:21:17 | `localhost:5678` | Không có | `@goi_ydon_thuoc` | 200 | 1 | `*` | Không được response cung cấp |
| 14/07/2026 22:21:17–22:21:18 | `localhost:5678` | Không có | `@san_pham_trong_tam` | 200 | 108 | `*` | Không được response cung cấp |
| 14/07/2026 22:21:18–22:21:20 | `localhost:5678` | Không có | `@thong_bao` | 200 | 8 | `*` | Không được response cung cấp |
| 14/07/2026 22:21:19–22:21:21 | `localhost:5678` | Không có | `@tim_san_pham_theo_trieu_chung` | 200 | 10 | `*` | Không được response cung cấp |
| 14/07/2026 22:21:20–22:21:21 | `localhost:5678` | Không có | `@tra_cuu_san_pham` | 200 | 50 | `*` | Không được response cung cấp |

`@san_pham_trong_tam` trả 108 dòng có nhóm trường liên quan chương trình, khách hàng và doanh số khi không có Authorization. Báo cáo không lưu giá trị cụ thể.

**Kiểm tra nhánh token lỗi:** `Bearer invalid.invalid.invalid` và một JWT hết hạn đều nhận HTTP 200 với body rỗng. Điều này không đạt contract HTTP chuẩn, nhưng quan trọng hơn là request **không gửi token** lại được thực thi và trả dữ liệu. Đây là dấu hiệu nhánh thiếu token đang fail-open.

**Ảnh hưởng:** người không đăng nhập có thể tra cứu dữ liệu sản phẩm, thông báo, chương trình/khách hàng và các dữ liệu nghiệp vụ khác tùy stored procedure.

**Khuyến nghị:** từ chối ngay nếu thiếu token; xác minh chữ ký, thời hạn, issuer/audience; lấy identity và phạm vi từ token/session đã xác minh; không dùng username rỗng; kiểm tra role/scope theo từng ApiCode; fail-closed khi thiếu mapping; ghi audit cho mỗi lần thực thi. Không nhận `User`, `Username`, `EmployeeID` hoặc `BranchID` từ client làm nguồn cấp quyền.

### CHAT-UAT-02 — HIGH — Endpoint danh mục/cấu hình mở không cần xác thực

`/webhook/api-list-active` trả 34 bản ghi và `/webhook/api-get-config` trả cấu hình khi chưa đăng nhập, đều HTTP 200. Cấu hình `@doanh_so` công bố 21 filter; có các `DataSourceValue` mang dạng API/procedure nội bộ và ánh xạ tham số.

| Thời gian (UTC+7) | Endpoint | Authorization | HTTP | Kết quả tóm tắt | CORS |
|---|---|---|---:|---|---|
| 14/07/2026 22:18:37 | `/webhook/api-list-active` | Không có | 200 | 34 bản ghi, gồm 28 lệnh `@` và 6 mã legacy | `*` |
| 14/07/2026 22:18:41 | `/webhook/api-get-config` | Không có | 200 | Trả cấu hình `@doanh_so`; 21 filter | `*` |

**Khuyến nghị:** yêu cầu token hợp lệ và chỉ trả danh mục/cấu hình đúng role; không công bố datasource/procedure nội bộ nếu frontend không thực sự cần.

### CHAT-UAT-02B — MEDIUM — CORS wildcard làm tăng phạm vi khai thác

Các response POST không xác thực nêu trên có `Access-Control-Allow-Origin: *`. Tuy nhiên OPTIONS tới `api-execute` trả 204 mà không có `Access-Control-Allow-Origin/Methods`, nên đợt kiểm tra này **chưa chứng minh** một website khác có thể hoàn tất preflight và đọc response bằng trình duyệt. Nguyên nhân bảo mật đã được chứng minh vẫn là thiếu xác thực và kiểm soát quyền ở endpoint.

**Khuyến nghị:** sau khi đóng auth, giới hạn origin theo domain triển khai và kiểm tra chính sách credentials/header thực tế.

### CHAT-UAT-03 — MAJOR — Metadata không đánh dấu trường bắt buộc

Tất cả trường nhìn thấy trong 28 cấu hình đều có `IsRequired = false`; cột RequiredFields trống. Điều này không có nghĩa mọi trường đều phải bắt buộc, nhưng frontend hiện không thể phân biệt trường bắt buộc với trường tùy chọn theo contract từng lệnh.

**Khuyến nghị:** lập contract gồm `Lệnh / Trường / Bắt buộc / Mặc định / Kiểu dữ liệu / Quy tắc`, khai báo đúng metadata và hiển thị lỗi tiếng Việt tại trường nhập.

### CHAT-UAT-04 — MAJOR — Thông báo nghiệp vụ bị trả như dữ liệu thành công

Sáu lệnh được kiểm tra lại (`@cham_diem_kh`, `@doanh_so`, `@goi_ydon_hang`, `@hoa_don`, `@tich_luy`, `@tuyen_ban_hang`) đều trả envelope `status: success`, `count: 1`, `dataCount: 1` khi payload rỗng, dù bản ghi trong data là thông báo nghiệp vụ. Giao diện vì vậy có thể hiểu thành “1 kết quả”.

**Khuyến nghị:** chuẩn hóa envelope có `success`, mã trạng thái (`MISSING_PARAMETER`, `FORBIDDEN`, `NO_DATA`, `UNSUPPORTED_API`, `SYSTEM_ERROR`, `OK`), `message`, `data`, `count`, `requestId`; thông báo thiếu tham số phải có `count: 0`, `data: []`.

## 7. Hạn chế của đợt kiểm thử

### Chưa kiểm thử UI tương tác có đăng nhập

Trình duyệt kiểm thử được chuyển tới trang đăng nhập. Vì không được phép lấy mật khẩu/phiên đăng nhập từ trình duyệt khác, chưa thể xác nhận cho từng lệnh:

- mở menu `@` và chọn lệnh;
- form/placeholder/validation;
- cách renderer hiển thị dữ liệu rỗng, message, bảng, card, chart;
- hành vi tìm kiếm, cuộn, đóng/mở chi tiết;
- phân quyền và phạm vi dữ liệu Manager/TDV;
- responsive và lỗi console/network trong thao tác thật.

## 8. Ma trận cần chạy sau khi có phiên đăng nhập

Mỗi lệnh cần được test tối thiểu theo các ca:

1. Chọn lệnh từ menu `@`.
2. Gửi không tham số.
3. Gửi tham số hợp lệ.
4. Gửi tham số không tồn tại.
5. Kiểm tra loading, empty state, error state và dữ liệu thành công.
6. Kiểm tra renderer, cuộn bảng và không bị composer che.
7. Kiểm tra Manager và TDV có thấy đúng lệnh/phạm vi dữ liệu.
8. Với lệnh ghi dữ liệu: chỉ chạy trên môi trường/database sandbox, có bước xem lại và xác nhận.

## 9. Release gate và đánh giá phát hành

**Chưa đạt để nghiệm thu bảo mật.** `CHAT-UAT-01` là lỗi chặn phát hành.

### Release gate 1 — Đóng xác thực và phân quyền

- `api-execute` từ chối request thiếu/sai token bằng 401/403.
- `api-list-active` và `api-get-config` yêu cầu xác thực.
- ApiCode được kiểm tra theo role/scope; tài khoản thiếu scope fail-closed.

### Release gate 2 — Chạy lại kiểm thử không token

- Chạy lại toàn bộ 24 lệnh đọc khi không có token.
- Kỳ vọng: tất cả trả 401/403, không stored procedure nào được thực thi.

### Release gate 3 — UAT theo vai trò

- Chạy cùng bộ test bằng Manager và TDV.
- Xác nhận danh mục lệnh và dữ liệu khác nhau đúng phạm vi.

### Release gate 4 — Mutation sandbox

- Chỉ sau ba gate trên mới kiểm thử mutation/navigation trong database sandbox có rollback và audit.

## 10. Kiểm tra tham số bổ sung

- `@tra_cuu_san_pham` với `TopN = 3` trả đúng 3 dòng, cho thấy giới hạn số dòng được truyền xuống API.
- `@tim_san_pham_theo_trieu_chung` với chuỗi ngẫu nhiên không khớp trả `count = 0`.
- `@tra_cuu_san_pham` với chuỗi ngẫu nhiên vẫn trả 1 dòng. Chưa thể kết luận sai do có thể là tìm gần đúng/fallback; cần contract tìm kiếm và dữ liệu chuẩn để xác nhận.
- Các kiểm tra này vẫn chạy không Authorization nhằm đánh giá fail-open; không dùng chúng để xác nhận dữ liệu nghiệp vụ đúng.

## 11. Tệp nguồn đã đối chiếu

- `chatbot-widget/js/chatbot-api-engine.js`
- `n8n/API_Services/API_ListActive.json`
- `n8n/API_Services/API_GetConfig.json`
- `n8n/API_Services/API_Execute.json`
