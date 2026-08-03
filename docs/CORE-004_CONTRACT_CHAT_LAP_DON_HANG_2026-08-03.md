# CORE-004 — Contract chat lập đơn hàng

## Trạng thái

`CONTRACT_LOCKED_CURRENT_RUNTIME` — khóa theo hành vi đã kiểm chứng của frontend `11.121`, `API_HangHoaList_AI` và `API_DonHangChiTiet_Insert_AI`. Tài liệu này không xác nhận rằng kho xuất cụ thể hoặc CTBH đã được ERP duyệt tự động.

## Ranh giới hai bước

```text
Chat / @lap_don_hang
  → PREVIEW_ONLY: chuẩn bị giỏ hàng, không ghi DB
  → người dùng xem/sửa
  → xác nhận rõ ràng
  → POST /api/API_DonHangChiTiet_Insert_AI
  → CREATED hoặc FAILED
```

- `@lap_don_hang` trong chat chỉ tạo dữ liệu điều hướng/giỏ hàng xem trước.
- Chỉ màn hình lập đơn gọi endpoint mutation sau thao tác xác nhận của người dùng.
- Hủy, đóng, quay lại sửa hoặc chỉ xem preview không được gọi endpoint tạo đơn.

## Contract trạng thái

| Trạng thái | Ý nghĩa | Có ghi DB |
|---|---|---:|
| `preview` | Đã xác định khách và danh sách hàng để người dùng xem/sửa; giá, tồn và CTBH vẫn phải được kiểm tra lại trước khi gửi. | Không |
| `confirmed` | Người dùng vừa xác nhận đúng payload đang hiển thị; đây là trạng thái chuyển tiếp trước khi nhận kết quả server. | Chưa thể kết luận |
| `created` | Server trả `MsgType = 5` và `DocumentID` khác rỗng. Có thể là đơn mới hoặc replay đúng nội dung của đơn đã tạo trước đó. | Có đúng một đơn |
| `failed` | HTTP lỗi, timeout, `MsgType` khác `5`, thiếu `DocumentID`, sai quyền, sai giá/tồn hoặc payload không hợp lệ. UI không được thông báo đã tạo đơn. | Không có commit mới |

`confirmed` không đồng nghĩa `created`. Sau timeout, client phải giữ nguyên `DocumentID` và payload để retry; không được tự khẳng định đơn đã thất bại hoặc tự sinh mã mới khi chưa đối soát.

## Dữ liệu preview

```json
{
  "state": "preview",
  "customer": {
    "objectId": "<mã khách trong quyền>",
    "displayName": "<mã - tên khách>"
  },
  "items": [
    {
      "itemId": "<mã HH1>",
      "itemName": "<tên sản phẩm>",
      "quantity": 1,
      "unitPrice": 0,
      "discountPercent": 0,
      "availableStock": 0,
      "promotionSource": "GhiChu|none"
    }
  ],
  "stockScope": {
    "mode": "ALLOWED_STORES_AGGREGATE",
    "storeHouseIds": ["CTY", "DL02", "DL03"]
  },
  "previewOnly": true
}
```

Các trường hiển thị như tên khách, tên hàng, giá, tồn và tổng tiền là dữ liệu preview. Server không tin các trường mô tả hoặc tổng tiền do client gửi.

## Request tạo đơn

```json
{
  "Username": "<được đối chiếu bằng phiên đăng nhập>",
  "DocumentID": "<khóa mutation ổn định, tối đa 30 ký tự>",
  "ObjectID": "<khách hàng>",
  "ItemList": "[{\"ItemID\":\"...\",\"Quantity\":1,\"UnitPrice\":95000,\"DiscountPercent\":0}]"
}
```

| Trường | Quy tắc hiện hành |
|---|---|
| `Username` | Tài khoản phải tồn tại và chưa khóa; SQL kiểm tra lại quyền với khách. |
| `DocumentID` | Bắt buộc ổn định cho cùng một lần tạo/retry và dài không quá 30 ký tự. Runtime hiện dùng tiền tố `UATORD-`; đây là khóa mutation kiêm mã đơn, chưa phải quy tắc đánh số ERP dài hạn. Nếu để rỗng hoặc truyền `AUTO_GEN`, SQL sinh `D{BranchID}{MM}{YY}/{n}`. |
| `ObjectID` | Bắt buộc tồn tại và thuộc kết quả `AR_GetObjectByUserFnc(Username)`. |
| `ItemList` | JSON có ít nhất một dòng hợp lệ. SQL chỉ đọc `ItemID`, `Quantity`, `UnitPrice`, `DiscountPercent`; không tin `Amount`, `DiscountAmount`, `DiemSanPham` hoặc `Notes` từ client. |
| `Quantity` | Số nguyên lớn hơn 0; tổng dòng mua và dòng tặng cùng mã không được vượt tồn khả dụng. |
| `UnitPrice` | Dòng bán phải khớp `AR_LayGiaSanPhamFnc` với sai số tối đa `0.01`; dòng giá `0` chỉ hợp lệ nếu cùng mã có dòng mua giá dương. |
| `DiscountPercent` | Từ `0` đến `100`; SQL tự tính lại tiền chiết khấu và thành tiền. |

## Khách hàng và phân quyền

- Danh sách khách phải lấy từ endpoint có scope; SQL vẫn kiểm tra lại bằng `AR_GetObjectByUserFnc`.
- Chi nhánh, `EmployeeID`, `ManagerID` và `CeoID` lấy từ `SY_User`, không lấy từ payload.
- Không được tạo đơn cho khách ngoài quyền dù client sửa `ObjectID` thủ công.

## Sản phẩm, bảng giá và CTBH

- Chỉ sản phẩm tồn tại và thuộc `CF_ItemTbl.ItemGroupID = 'HH1'` được tạo đơn.
- Giá có thẩm quyền là kết quả `AR_LayGiaSanPhamFnc(GETDATE(), ObjectID, ItemID)` tại thời điểm submit.
- Frontend có thể diễn giải `GhiChu` để hiển thị gợi ý mua/tặng hoặc chiết khấu trong preview.
- SQL hiện chưa đối chiếu một `PromotionID`/`RuleVersion` CTBH được duyệt. Nó chỉ kiểm tra giá bán khớp ERP, chiết khấu trong khoảng hợp lệ và hàng giá `0` có dòng mua cùng mã.
- Vì vậy preview không được mô tả CTBH là “đã được ERP phê duyệt” nếu chưa có nguồn rule có định danh.

## Kho và tồn

- Kho được phép giới hạn trong `CTY`, `DL02`, `DL03`, theo kho của tài khoản; manager được cộng kho của nhân viên trực thuộc.
- Tồn hiện được SQL cộng trên toàn bộ kho được phép, bỏ qua lô hết hạn.
- Request chưa có `StoreHouseID`; header/detail đơn cũng chưa ghi kho xuất cụ thể trong procedure này.
- Do đó contract hiện hành chỉ được hiển thị “tồn khả dụng trong phạm vi kho được cấp”, không được khẳng định một kho cụ thể sẽ xuất hàng. Chọn và giữ chỗ kho cụ thể thuộc `STOCK-001`/`CORE-005`.

## Idempotency và mã đơn

- Cùng `DocumentID`, cùng người tạo, khách, chi nhánh, nhân viên và cùng tập dòng hàng: SQL trả `MsgType = 5` với chính `DocumentID`, không chèn thêm header/detail.
- Cùng `DocumentID` nhưng payload khác: SQL trả `MsgType = 1` và không ghi thêm.
- Frontend phải giữ nguyên `DocumentID` khi retry cùng payload.
- Việc đổi từ `UATORD-*` sang mã ERP cần tách khóa request khỏi mã nghiệp vụ và được xử lý như một thay đổi contract trong CORE-005; không đổi âm thầm ở CORE-004.

## Response mutation

### Thành công hoặc replay hợp lệ

```json
{
  "DocumentID": "<mã đơn>",
  "Msg": "Tạo đơn hàng thành công | Đơn hàng đã được tạo trước đó",
  "MsgType": 5
}
```

### Thất bại

```json
{
  "DocumentID": null,
  "Msg": "<lỗi nghiệp vụ an toàn>",
  "MsgType": 1
}
```

Frontend chỉ chuyển sang `created` khi đồng thời có `MsgType = 5` và `DocumentID`. Mọi response khác là `failed` hoặc cần đối soát nếu client bị timeout.

## Điều kiện nghiệm thu CORE-004

1. Frontend, chat/n8n, SQL và tài liệu dùng cùng bốn trạng thái `preview`, `confirmed`, `created`, `failed`.
2. Preview và hủy không ghi `AR_OrderTbl`/`AR_OrderDetailTbl`.
3. Giá, quyền khách, sản phẩm, số lượng và tồn được server kiểm tra lại.
4. Retry cùng `DocumentID` và payload không tạo đơn thứ hai; tái sử dụng mã với payload khác bị từ chối.
5. UI mô tả đúng giới hạn kho tổng hợp và CTBH chưa có rule định danh.

## Việc chuyển sang CORE-005 / STOCK-001

- Bổ sung lựa chọn/phân bổ `StoreHouseID` cụ thể hoặc quyết định rõ cơ chế server chọn kho.
- Đưa CTBH sang nguồn rule có `PromotionID`/`RuleVersion` và kiểm tra lại phía server.
- Quyết định tách `Idempotency-Key`/request ID khỏi `DocumentID`, đồng thời bỏ tiền tố UAT khỏi mã nghiệp vụ thật.
- Bổ sung audit mutation liên kết request ID, người dùng và `DocumentID`.
