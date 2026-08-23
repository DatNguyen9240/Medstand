# CUST-SEARCH-001 — Biên bản tái hiện và nghiệm thu

**Ngày:** 21/08/2026  
**Kết luận:** `DONE`  
**Phạm vi:** tìm khách theo số điện thoại, chọn gợi ý và tải dữ liệu vào màn sửa đơn.

## 1. Môi trường và cách đối chiếu

- Trình duyệt Google Chrome thật, điều khiển headless trên local gateway kết nối `medtest`.
- Màn hình: `#/edit-order?id=[UAT_ORDER]`.
- Bản trước sửa: commit `ca6ce72` (`74f6c53e^`).
- Bản sau sửa dùng để nghiệm thu: commit `2e9bfef`, có thay đổi sửa lỗi `CORE-011` từ commit `74f6c53e` và log request ID tại gateway.
- Dữ liệu khách mục tiêu được verifier tìm động trong scope của tài khoản test, không hard-code kết quả API.
- Ca kiểm thử chỉ đọc và chọn dữ liệu trên giao diện, không lưu đơn và không tạo mutation nghiệp vụ.

## 2. Kết quả trước và sau

| Bước kiểm tra | Trước sửa | Sau sửa |
| --- | --- | --- |
| Nhập số điện thoại vào bộ chọn khách | Chỉ lọc danh sách local theo label | Gọi remote search với `SearchText` là số điện thoại |
| Request tìm khách sau khi nhập | `0` | `1` |
| Gợi ý nhìn thấy | `0` | `1`, đúng khách mục tiêu |
| Mapping gợi ý | Không có kết quả để chọn | `data-value = ObjectID`, nội dung = `DisplayName` |
| Sau khi chọn | Không thực hiện được | Form giữ đúng `ObjectID` và tải đúng SĐT, địa chỉ, phường/xã |

Request nghiệm thu sau sửa:

- Endpoint: `GET /api/API_KhachHangList`.
- Payload giải mã có `SearchText` bằng số điện thoại đã nhập.
- HTTP status: `200`; response `code = 0`, `msg = OK`.
- Request ID: `req-cust-search-001-after`, trùng giữa request do trình duyệt phát và metadata trong gateway log.
- JSON/ảnh runtime đã được review trong lúc nghiệm thu và sau đó loại khỏi Git theo chính sách evidence.

## 3. Nguyên nhân gốc

1. `src/js/pages/edit-order.js` trước sửa không truyền `searchFn` cho field `customer`. Vì vậy nhập số điện thoại chỉ lọc danh sách đã tải theo label, không gọi API.
2. `sql/Module_Common_API_KhachHangList_AI.sql` trước sửa chưa đưa `A.Phone` vào điều kiện `SearchText`, nên backend chưa hỗ trợ đầy đủ cách tìm này.
3. `src/js/components/FormSelect.js` trước sửa thoát sớm khi `options` rỗng sau khi overlay cũ đã bị gỡ, khiến picker biến mất và không hiển thị trạng thái không có kết quả.

Thay đổi `CORE-011` tại commit `74f6c53e` xử lý đủ ba điểm: thêm remote search cho màn sửa đơn, tìm theo số điện thoại ở SQL và giữ modal với empty-state an toàn.

## 4. Bằng chứng

- Verifier tái chạy: `node scripts/verify_cust_search_001_e2e.js`.
- Biên bản này giữ kết luận đã khử định danh. JSON, screenshot và gateway log chỉ được tạo cục bộ dưới `reports/`, bị Git ignore và không đưa vào nhánh phát hành.

## 5. Phạm vi chưa đóng bởi task này

`CUST-SEARCH-001` chỉ yêu cầu tái hiện và chỉ ra nguyên nhân cụ thể của lỗi chọn gợi ý. Các ca response cũ ghi đè response mới, API chậm/lỗi/retry, đổi tài khoản, khách ngoài scope và regression toàn màn hình đã được tách sang `CUST-SEARCH-003`; task đó đã nghiệm thu `DONE` ngày 22/08/2026.
