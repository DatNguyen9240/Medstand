# CORE-001 — Contract tạo khách hàng trực tiếp qua Chatbot AI

## Trạng thái

`READY_FOR_UAT_DEPLOY_11.116` — quyết định cuối cùng: khách tạo từ chatbot được ghi trực tiếp, không qua bước Admin duyệt.

## Luồng được chốt

```text
Chatbot → /api/API_KhachHang_Insert_AI → dbo.CF_ObjectTbl
```

- Chỉ chatbot dùng endpoint có hậu tố `_AI`.
- Không tạo bản ghi mới trong `AR_ObjectNewRequireTbl`.
- Khách thành công có thể dùng ngay cho nghiệp vụ tiếp theo.
- Không thay đổi luồng tạo khách cũ của ERP UI; luồng đó vẫn độc lập.

## Ràng buộc bắt buộc

| Hạng mục | Quy tắc |
|---|---|
| Tài khoản | Phải tồn tại, đang hoạt động và không gắn với một khách cụ thể. |
| Chi nhánh | Lấy từ tài khoản đã xác thực; client không quyết định được. |
| Nhóm khách | Phải tồn tại và nằm trong phạm vi tài khoản hoặc sale được Manager giao. |
| Địa chỉ | Tỉnh, quận/huyện, phường/xã phải có trong danh mục. |
| SĐT | Chỉ gồm số, 10–11 số ở form; server chuẩn hoá và kiểm tra lại. |
| MST | Bắt buộc, chỉ gồm 10–13 số. |
| Ngày sinh | Bắt buộc, đúng ngày thực tế và không ở tương lai. |
| Trùng SĐT | Chặn nếu đã có ở `CF_ObjectTbl` hoặc đang tồn tại trong `AR_ObjectNewRequireTbl`. |
| Chống bấm đúp | UI khoá thao tác khi gửi; gateway giữ `Idempotency-Key` khi gọi qua API execute. |

## Phân quyền giao khách

- Sale tự tạo: `SaleID` là nhân viên của tài khoản đang đăng nhập.
- Manager: bắt buộc chọn sale phụ trách khi có nhân viên dưới quyền; server chỉ chấp nhận sale nằm trong `AR_OpListEmployeeTbl` của Manager đó.
- Nếu Manager giao sale, `ObjectGroupID` phải thuộc sale đã chọn. Kiểm tra này nằm ở stored procedure, không tin dữ liệu client.

## Kết quả nghiệp vụ

| Tình huống | Kết quả |
|---|---|
| Thành công | `MsgType = 5`, trả `ObjectID`; khách đã có trong `CF_ObjectTbl`. |
| Sai dữ liệu/phân quyền/trùng SĐT | `MsgType = 1`, không ghi khách. |
| Bấm lại cùng yêu cầu qua API execute | Không tạo thêm khách; áp dụng idempotency. |

## Tiêu chí nghiệm thu

1. Tạo thành công một khách UAT: có một dòng trong `CF_ObjectTbl`, đúng `SaleID`, đúng nhóm và chi nhánh.
2. Không có dòng mới tương ứng trong `AR_ObjectNewRequireTbl`.
3. SĐT/MST có chữ, ngày sinh tương lai, nhóm ngoài quyền và sale ngoài quyền đều bị từ chối.
4. Sale chỉ nhìn thấy khách trong phạm vi của mình sau khi tạo; Manager thấy theo phạm vi quản lý.

## Quyết định lịch sử

Tài liệu này thay thế các nội dung cũ mô tả trạng thái `PENDING_APPROVAL` hoặc dùng `API_KhachHang_Insert` cho chatbot. Các nội dung đó không còn là contract áp dụng cho UAT hiện tại.
