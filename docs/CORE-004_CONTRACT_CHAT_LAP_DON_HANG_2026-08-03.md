# CORE-004 — Contract chat lập đơn hàng

## Trạng thái

`CONTRACT_DEPLOYED_SQL_LOCAL_GATEWAY_11.124_PENDING_END_TO_END_UAT` — contract CORE-005 đã deploy lên SQL `medtest`; gateway local và frontend `11.124` đã nạp đúng guard mới. Còn chờ mutation qua token/UI thật và UAT concurrency để nghiệm thu toàn luồng.

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

`confirmed` không đồng nghĩa `created`. Sau timeout, client phải giữ nguyên payload và `Idempotency-Key` để retry; không được tự khẳng định đơn đã thất bại hoặc tạo một key mới khi chưa đối soát.

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
      "promotionSource": "GhiChu|none",
      "storeHouseId": "CTY"
    }
  ],
  "stockScope": {
    "mode": "SELECTED_AUTHORIZED_STORE",
    "storeHouseIds": ["CTY", "DL02", "DL03"]
  },
  "previewOnly": true
}
```

Các trường hiển thị như tên khách, tên hàng, giá, tồn và tổng tiền là dữ liệu preview. Server không tin các trường mô tả hoặc tổng tiền do client gửi.

## Request tạo đơn

```json
{
  "Username": "<gateway ghi đè từ token đã xác minh>",
  "DocumentID": "AUTO_GEN",
  "DocumentDate": "2026-08-03",
  "BranchID": "MB",
  "ObjectID": "<khách hàng>",
  "Memo": "<ghi chú>",
  "Notes": "<diễn giải>",
  "XaPhuong": "<phường/xã>",
  "ThuDiTuyen": "<tuyến thứ>",
  "ItemList": "[{\"ItemID\":\"...\",\"Quantity\":10,\"SoLuongTang\":2,\"UnitPrice\":75000,\"DiscountPercent\":0}]"
}
```

Header bắt buộc: `Idempotency-Key`. Gateway xác minh bearer token qua `API_UserInfo`, ghi đè `Username`, rồi gắn `IdempotencyKey` và `RequestID` vào body trước khi gọi SQL.

| Trường | Quy tắc hiện hành |
|---|---|
| `Username` | Không tin giá trị từ trình duyệt. Gateway lấy lại từ token; SQL kiểm tra tài khoản chưa khóa và quyền với khách. |
| `DocumentID` | Nếu người dùng để trống, frontend truyền `AUTO_GEN`; SQL sinh `D{BranchID}{MM}{YY}/{n}` và trả mã thật trong response. Frontend không tự sinh mã nghiệp vụ. |
| `DocumentDate`, `BranchID` | Ngày không nhỏ hơn ngày hiện tại; chi nhánh phải đúng chi nhánh của tài khoản. |
| `ObjectID` | Bắt buộc tồn tại và thuộc kết quả `AR_GetObjectByUserFnc(Username)`. |
| `ItemList` | JSON có ít nhất một dòng hợp lệ. Hàng tặng nằm trong `SoLuongTang` của dòng bán; không tạo thêm dòng giá `0`. SQL không tin tổng tiền do client gửi. |
| `Quantity` | Số nguyên lớn hơn 0; tổng dòng mua và dòng tặng cùng mã không được vượt tồn khả dụng. |
| `UnitPrice` | Phải dương và khớp `AR_LayGiaSanPhamFnc(DocumentDate, ObjectID, ItemID)` với sai số tối đa `0.01`. |
| `SoLuongTang`, `DiscountPercent` | SQL tính lại từ `GhiChu` hiện hành và từ chối payload không khớp; SQL tự tính tiền chiết khấu/thành tiền. |

## Khách hàng và phân quyền

- Danh sách khách phải lấy từ endpoint có scope; SQL vẫn kiểm tra lại bằng `AR_GetObjectByUserFnc`.
- `EmployeeID`, `ManagerID` và `CeoID` lấy từ `SY_User`; `BranchID` từ request chỉ được chấp nhận khi trùng chi nhánh của tài khoản.
- Không được tạo đơn cho khách ngoài quyền dù client sửa `ObjectID` thủ công.

## Sản phẩm, bảng giá và CTBH

- Chỉ sản phẩm tồn tại và thuộc `CF_ItemTbl.ItemGroupID = 'HH1'` được tạo đơn.
- Giá có thẩm quyền là kết quả `AR_LayGiaSanPhamFnc(GETDATE(), ObjectID, ItemID)` tại thời điểm submit.
- Frontend diễn giải `GhiChu` để preview mua/tặng hoặc chiết khấu; SQL diễn giải lại cùng vế khách thường (trước `KHHĐ/KHHD`) khi submit.
- SQL từ chối khi giá, `SoLuongTang` hoặc `DiscountPercent` không khớp dữ liệu ERP tại `DocumentDate`.
- Chưa có `PromotionID`/`RuleVersion`, nên audit hiện chứng minh rule text được áp tại thời điểm submit chứ chưa chứng minh một phiên bản CTBH có định danh.

## Kho và tồn

- Kho được phép giới hạn trong `CTY`, `DL02`, `DL03`, theo kho của tài khoản; manager được cộng kho của nhân viên trực thuộc.
- `API_HangHoaList_AI` chọn một kho được phép có tồn khả dụng cao nhất, bỏ lô hết hạn và trừ lượng đã giữ bởi đơn ở trạng thái `-2,-1,0,1,2,4`.
- Khi tạo đơn, SQL khóa và tính lại cùng quy tắc, yêu cầu toàn bộ `Quantity + SoLuongTang` đủ trong một kho rồi ghi `StoreHouseID` vào detail.
- Tồn trên preview chỉ là ảnh chụp; kết quả cuối cùng luôn theo lần kiểm tra trong transaction tạo đơn.

## Idempotency và mã đơn

- Khi mã đơn được nhập rõ ràng, cùng `DocumentID` và cùng payload: SQL trả `MsgType = 5` với chính mã đó, không chèn thêm header/detail; payload khác dùng cùng mã bị từ chối.
- Khi mã đơn để trống, frontend truyền `AUTO_GEN`; SQL chịu trách nhiệm cấp mã nghiệp vụ. `Idempotency-Key` được băm cùng identity và fingerprint request, lưu kết quả trong cùng transaction với đơn.
- Retry cùng key và fingerprint trả `DocumentID` đã cache với `IsReplay = 1`, kể cả giá/tồn đã đổi sau commit đầu. Cùng key nhưng fingerprint khác trả `IDEMPOTENCY_CONFLICT`.
- Chỉ mã `DocumentID` trong response `MsgType = 5` mới được hiển thị là mã đơn đã tạo.

## Response mutation

### Thành công hoặc replay hợp lệ

```json
{
  "DocumentID": "<mã đơn>",
  "Msg": "Tạo đơn hàng thành công | Đơn hàng đã được tạo trước đó",
  "MsgType": 5,
  "RequestID": "req-...",
  "IsReplay": false
}
```

### Thất bại

```json
{
  "DocumentID": null,
  "Msg": "<lỗi nghiệp vụ an toàn>",
  "MsgType": 1,
  "RequestID": "req-...",
  "Code": "<mã lỗi>"
}
```

Frontend chỉ chuyển sang `created` khi đồng thời có `MsgType = 5` và `DocumentID`. Mọi response khác là `failed` hoặc cần đối soát nếu client bị timeout.

## Điều kiện nghiệm thu CORE-004

1. Frontend, chat/n8n, SQL và tài liệu dùng cùng bốn trạng thái `preview`, `confirmed`, `created`, `failed`.
2. Preview và hủy không ghi `AR_OrderTbl`/`AR_OrderDetailTbl`.
3. Giá, quyền khách, sản phẩm, số lượng và tồn được server kiểm tra lại.
4. Retry cùng `Idempotency-Key` và payload trả cùng mã, không tạo đơn thứ hai; cùng key/payload khác bị từ chối.
5. Detail ghi đúng `SoLuongTang` và một `StoreHouseID` được phép; UI mô tả đúng giới hạn CTBH chưa có rule định danh.

## Việc còn lại sau bản vá CORE-005

- Deploy đồng bộ migration, hai procedure AI, gateway và bundle frontend; không deploy lẻ contract.
- Chạy UAT runtime sau deploy cho double-click/concurrency và lưu bằng chứng request ID/mã đơn.
- Nếu business yêu cầu truy nguyên phiên bản CTBH, bổ sung nguồn `PromotionID`/`RuleVersion`; đây là phần chưa có trong ERP hiện tại.
