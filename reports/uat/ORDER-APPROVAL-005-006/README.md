# ORDER-APPROVAL-005/006 — UI evidence

Status: `PASS_READY_FOR_QA_REVIEW`

## Kết quả

E2E trên Chrome thật qua local gateway và database `medtest` đã PASS toàn bộ contract UI:

- Sale `NAMDINHB.MED` lưu nháp và sửa được đơn nháp của chính mình.
- Sửa nháp không tự gửi duyệt; `Gửi duyệt` và `Hủy đơn nháp` là hai thao tác riêng.
- Double-click gửi duyệt chỉ phát một mutation có idempotency key.
- Sau khi gửi, Sale không còn nút gửi/hủy và mở trang sửa nhận đúng lý do bị khóa.
- Quản lý cùng chi nhánh `QLBH013.MED` mở và cập nhật được đơn chờ duyệt.
- Sale khác `BACNINHA.MED` không sửa được đơn nháp của chủ đơn.
- Double-click hủy chỉ phát một mutation; sau hủy không mở lại nút gửi/hủy.

Hai đơn UAT có marker rõ ràng:

| DocumentID | Trạng thái cuối | Mục đích |
| --- | ---: | --- |
| `DMB0826/11` | `0` | Đã gửi duyệt; manager đã cập nhật memo |
| `DMB0826/12` | `10` | Đã hủy |

`ORDER_STATE_INSPECTION.json` xác nhận trực tiếp trên `medtest`: mỗi đơn có đúng một dòng chi tiết; quyền sửa của owner/manager/Sale khác khớp contract.

## Request evidence chính

- Submit double-click: `req-ui-20260822023313-SALE_OWNER-51` — đúng một mutation.
- Manager update: `req-ui-20260822024720-MANAGER_SAME_BRA-53` — HTTP 200.
- Cancel double-click: `req-ui-20260822024907-SALE_OWNER-63` — đúng một mutation.
- Timeline đầy đủ: `ORDER-APPROVAL-005-006_UI_EVIDENCE.json`.

Lượt E2E cuối dùng cơ chế resume có kiểm chứng: ba ca sửa nháp/gửi duyệt lấy từ run `order-ui-20260822023313`; ca manager lấy từ run `order-ui-20260822024720`; run tổng hợp cuối là `order-ui-20260822024907`. Harness chỉ chấp nhận carry-forward khi file evidence trước có đúng `DocumentID` và từng case là `PASS`.

## Các lỗi UI đã sửa trong worktree

1. Chuẩn hóa cờ quyền từ API (`true`, `1`, `"1"`) và fail-closed cho `"0"`, `0`, `false`, giá trị lạ.
2. Giữ envelope nghiệp vụ `code=1` của edit-context để hiển thị `BlockMsg`, thay vì biến thành lỗi chung chung.
3. Giữ khách/tuyến hiện tại của đơn cho quản lý được phép sửa, kể cả khi khách không nằm trong phạm vi gợi ý tìm kiếm của tài khoản quản lý. Không mở rộng API tìm kiếm khách.
4. Lỗi endpoint badge thông báo trên `medtest` được xử lý fail-soft: badge nền không chặn form; lỗi 401/hết phiên vẫn fail-closed và vẫn chuyển về đăng nhập.

## Evidence files

- `SUBMIT_01` → `SUBMIT_09`: tạo nháp, sửa, thao tác riêng, gửi một lần, khóa Sale, manager sửa thành công.
- `CANCEL_01` → `CANCEL_06`: tạo nháp thứ hai, chặn Sale khác, hủy một lần và xác nhận action không mở lại.
- `EDIT_CONTEXT_GATEWAY_PROBE.json`: probe gateway đã lược bỏ nội dung thông báo thật.
- `ORDER_STATE_INSPECTION.json`: đối soát DB cuối.

## Cleanup

Không tự xóa dữ liệu. Sau khi QA/business sign-off, DBA/PMKT có thể archive đúng hai `DocumentID` trên theo quy trình UAT; không xóa ad hoc.
