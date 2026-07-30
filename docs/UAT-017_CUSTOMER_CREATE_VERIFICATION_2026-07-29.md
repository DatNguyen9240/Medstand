# UAT-017 — Kiểm tra tạo khách hàng trực tiếp qua Chatbot

## Trạng thái

`READY_FOR_UAT_DEPLOY_11.116` — code và tài liệu local đã theo quyết định cuối: tạo khách trực tiếp, không cần Admin duyệt. Chưa chạy mutation hoặc deploy trên server UAT.

## Phạm vi nghiệm thu

| Hạng mục | Kỳ vọng |
|---|---|
| Endpoint | `/api/API_KhachHang_Insert_AI` |
| Stored procedure | `dbo.API_KhachHang_Insert_AI` |
| ApiCode gateway | `@khach_hang_insert_ai` |
| Bảng khách sống | `CF_ObjectTbl` |
| Bảng yêu cầu cũ | Không có bản ghi mới tại `AR_ObjectNewRequireTbl` |
| Endpoint cũ | Không dùng `API_KhachHang_Insert` cho chatbot |
| Duyệt Admin | Không áp dụng trong phạm vi UAT này |

## Checklist runtime

- [ ] Sale tạo khách hợp lệ: có `ObjectID`, có dòng mới trong `CF_ObjectTbl`.
- [ ] Kiểm tra `SaleID`, `BranchID`, `ObjectGroupID` đúng theo tài khoản sale.
- [ ] Manager chọn một sale dưới quyền: khách có `SaleID` đúng sale và nhóm thuộc sale đó.
- [ ] Manager thử sale/nhóm ngoài quyền: bị từ chối, không tạo khách.
- [ ] SĐT có chữ, SĐT trùng, MST có chữ/sai độ dài, ngày sinh tương lai: bị từ chối.
- [ ] Không có dòng UAT mới ở `AR_ObjectNewRequireTbl`.
- [ ] Thử gửi lặp cùng idempotency key (qua gateway API execute nếu áp dụng): không có khách thứ hai.

## Kiểm tra source local đã đạt

- Form chỉ nhận số cho SĐT/MST, giữ ngày sinh bắt buộc và có preview/sửa lại.
- Endpoint form là `_AI`.
- Stored procedure ghi `CF_ObjectTbl`, kiểm tra phạm vi khách và audit `UserCreate`.
- Gateway policy chỉ mở mutation `@khach_hang_insert_ai`; import hàng trọng tâm vẫn bị chặn ở pilot.
- Bundle và service worker được nâng lên `11.116` khi build.

## Bước deploy được đề xuất

1. Apply SQL procedure + metadata migration trên `medtest`.
2. Import/activate workflow n8n có thay đổi policy (nếu triển khai API execute).
3. Deploy bundle `11.116`.
4. Thực hiện checklist runtime với một khách có tiền tố `UAT_` và lưu `ObjectID` làm bằng chứng.

> Không chạy thử tạo khách thật trước khi người phụ trách UAT cho phép mutation trên `medtest`.
