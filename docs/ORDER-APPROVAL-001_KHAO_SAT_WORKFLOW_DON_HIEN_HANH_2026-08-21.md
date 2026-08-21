# ORDER-APPROVAL-001 — Khảo sát workflow đơn hiện hành

Ngày xác minh lại: **21/08/2026**  
Môi trường: **medtest**  
Phạm vi: khảo sát read-only UI/API/DB; không thay đổi workflow và không commit dữ liệu kiểm thử.

## Kết luận

`ORDER-APPROVAL-001` đã đủ điều kiện hoàn tất phần **khảo sát hiện trạng**:

1. Đơn tạo qua `API_DonHangChiTiet_Insert_AI` được ghi vào `AR_OrderTbl` với `StatusID = 0` — **Chờ duyệt**.
2. Workflow ERP cũ không có một điểm duyệt Kế toán an toàn được xác nhận. `API_DonHang_Update` có nhánh đổi trực tiếp sang trạng thái dương, nhưng không có contract transition, idempotency và audit mutation tương ứng.
3. `AR_OrderLogTbl` hiện chỉ phản ánh trạng thái lúc tạo ở bộ dữ liệu kiểm tra: 21/21 log là `StatusID = 0`, không có đơn nào có nhiều log để chứng minh chuỗi chuyển trạng thái.
4. Runtime có trường hợp đơn đã đổi trạng thái nhưng không có audit duyệt: `DMB0826/9` được tạo ở trạng thái `0`, hiện là `1`, `UserUpdate = demo`, nhưng không có `ORDER_APPROVAL_TRANSITION` trong `AI_AuditLog`.
5. Hai procedure `API_DonHang_ApprovalContext_AI` và `API_DonHang_ApproveTransition_AI` được deploy ngày 21/08/2026 là phần triển khai mới, không được dùng để suy ngược rằng workflow cũ đã có bước Kế toán duyệt đúng nghiệp vụ.

## Sơ đồ hiện trạng đã xác minh

```text
Sale/Manager tạo đơn qua chat
        |
        v
API_DonHangChiTiet_Insert_AI
        |
        v
AR_OrderTbl.StatusID = 0 (Chờ duyệt)
        |
        +--> AR_OrderLogTbl ghi một log StatusID = 0
        |
        v
API_DonHang_Update / thao tác ERP cũ có thể đổi StatusID
        |
        +--> Chưa có kiểm chứng vai trò Kế toán bắt buộc
        +--> Chưa có transition contract
        +--> Chưa có idempotency/audit duyệt đầy đủ
```

## Từ điển trạng thái runtime

| StatusID | Tên trạng thái |
|---:|---|
| -2 | TDV Kiểm tra lại |
| -1 | Đơn nháp |
| 0 | Chờ duyệt |
| 1 | Nhận đơn |
| 2 | Đã chuyển xuống kho |
| 3 | Đã xuất hàng |
| 4 | Đơn đã xử lý chưa chuyển kho |
| 6 | Đã đi gửi hàng |
| 7 | Khách đã nhận hàng |
| 8 | Đã thu tiền |
| 10 | Đã hủy |

Không được tự suy luận `APPROVED`, `REJECTED` hoặc quyền của từng vai trò chỉ từ tên trạng thái. Mapping chính thức phải được business ký duyệt trong `ORDER-APPROVAL-002`.

## Bằng chứng runtime/DB

### Đơn tạo mới

- Mã đơn: `DMB0826/9`
- Người tạo: `NAMDINHB.MED` (`KD`, chi nhánh `MB`)
- Request ID tạo đơn: `req-c0cc05b0-980a-446b-9120-0f56b19a4d7e`
- Audit tạo đơn: `CREATE_DONHANG`
- Log lúc tạo: `StatusID = 0`, `Chờ duyệt`
- Trạng thái hiện tại: `StatusID = 1`, `Nhận đơn`
- Người cập nhật: `demo`
- Audit duyệt tương ứng: **0 dòng**

### Kiểm chứng transaction rollback trước đó

- Evidence/request ID: `ORDER-APPROVAL-001-07d70ddd-3e75-47dc-ad1f-9acabd533dca`
- Kết quả: gọi đường cập nhật cũ có thể đổi `StatusID 0 → 1` mà không chứng minh được quyền Kế toán và không có audit duyệt bắt buộc.
- Toàn bộ thay đổi của ca kiểm chứng đã rollback; trạng thái và dữ liệu nghiệp vụ được khôi phục.

### Thống kê log

- `AR_OrderLogTbl`: 21 dòng.
- Cả 21 dòng đều là `StatusID = 0` — `Chờ duyệt`.
- Số đơn có từ hai log trạng thái trở lên: 0.

## Chênh lệch với nghiệp vụ khách yêu cầu

| Nghiệp vụ yêu cầu | Hiện trạng xác minh | Kết luận |
|---|---|---|
| Sale tạo đơn | API AI tạo đơn ở trạng thái `0` | Khớp bước gửi chờ duyệt |
| Kế toán là bên duyệt | Workflow cũ chưa bắt buộc đúng vai trò Kế toán | Chưa khớp |
| Duyệt/từ chối theo transition được chốt | Chưa có contract business được ký duyệt | Chưa khớp |
| Mọi lần duyệt có actor/time/request ID/from/to/outcome | Có trường hợp đổi `0 → 1` không có audit duyệt | Chưa khớp |
| Không có đường vòng đổi trạng thái | `API_DonHang_Update` cũ còn nhánh đổi trạng thái trực tiếp | Chưa khớp |

## Việc chuyển sang ORDER-APPROVAL-002

Business cần chốt bằng văn bản:

- `APPROVE` có phải là `0 → 1` hay không.
- `REJECT` có phải là `0 → -2` hay không.
- Chỉ Kế toán hay cả Manager/Admin được duyệt.
- Cách xác định phạm vi chi nhánh khi tài khoản Kế toán đang không có `BranchID`.
- Cách khóa hoàn toàn đường đổi trạng thái cũ.

Tài liệu này chỉ kết luận hiện trạng; không phê duyệt các rule trên và không thay đổi workflow.
