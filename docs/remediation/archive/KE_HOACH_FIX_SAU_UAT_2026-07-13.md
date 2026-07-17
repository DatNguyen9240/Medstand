# Kế hoạch sửa lỗi sau UAT

## 1. Mục tiêu

- Ổn định phiên đăng nhập và thu hồi phiên khi đăng xuất.
- Chuẩn hóa contract vai trò và phạm vi dữ liệu.
- Khôi phục các nghiệp vụ hóa đơn và tuyến Manager.
- Sửa vòng đời popup và chuẩn hóa gợi ý sản phẩm.
- Chuẩn bị dữ liệu để chạy UAT có thể lặp lại.

## 2. Thứ tự triển khai

### Giai đoạn 1 — Phiên và quyền

#### 1.1. Logout và thu hồi phiên — P0

**BE/n8n**

- Xác định chính xác loại phiên: JWT stateless, refresh token hay session cookie.
- Endpoint logout phải thu hồi refresh/session và trả `Set-Cookie` hết hạn nếu cookie là `HttpOnly`.
- Logout phải idempotent: gọi nhiều lần vẫn trả kết quả an toàn.
- Không biến lỗi thu hồi phiên thành response đăng nhập thành công hoặc redirect ngược về Home.
- Trả request/correlation ID để đối chiếu log.

**FE**

- Dùng một hàm logout duy nhất và cờ `isLoggingOut` để chặn click/request lặp.
- Trong lúc chủ động logout, interceptor không hiện cảnh báo hết phiên và không redirect cạnh tranh.
- Sau phản hồi hoặc timeout ngắn: xóa `localStorage`, `sessionStorage`, cache HTTP, state người dùng, modal/overlay; sau đó về trang đăng nhập.
- Không tuyên bố đã thu hồi phiên server nếu request logout timeout; ghi log trạng thái chưa xác nhận.
- Auth guard không cho Back/refresh xem lại DOM hoặc dữ liệu của phiên trước.

**Tiêu chí đạt**

- Chỉ phát sinh một request logout.
- Logout được từ Home, Khảo sát và khi popup đang mở.
- Back/refresh không xem lại dữ liệu cũ.
- Đăng nhập tài khoản thứ hai không thấy cache tài khoản thứ nhất.
- Xác minh hành vi đồng bộ giữa hai tab.

#### 1.2. USER_INFO, role và scope — P0/P1

**BE**

- Không chỉ suy luận vai trò bằng `Manager = 1`.
- Dựa trên schema thật để trả tối thiểu:

```json
{
  "roleCode": "MANAGER",
  "roleName": "Quản lý",
  "employeeId": "MED0330",
  "managerId": "",
  "branchId": "MB",
  "capabilities": []
}
```

- Xác định đầy đủ Admin, Ban giám đốc, Manager, TDV, tài khoản kỹ thuật và tài khoản chưa mapping.
- Scope phải được lấy từ token/session, không lấy từ tham số tự do của client.

**n8n**

- Giữ nguyên `roleCode`, `roleName`, scope và mã lỗi.
- Không cho body client ghi đè `User`, `ManagerID`, `BranchID` thuộc system context.
- Không đổi `403` thành danh sách rỗng.

**FE**

- Dùng `roleCode/capabilities` cho logic; `roleName` chỉ dùng hiển thị.
- Nếu contract thiếu role thì hiển thị `Chưa xác định` và ghi log, không tự mặc định TDV cho tài khoản nhạy cảm.

**Tiêu chí đạt**

- `QLBH013.MED` hiển thị Manager và có đúng capability.
- `NAMDINHB.MED` hiển thị TDV.
- Sửa request thủ công không mở được dữ liệu ngoài scope.

### Giai đoạn 2 — Dữ liệu nghiệp vụ

#### 2.1. Hóa đơn không hiển thị — P1

**Điều tra**

1. Chạy stored procedure trực tiếp bằng cùng user và khoảng ngày.
2. So sánh request FE, payload qua n8n và tham số SQL.
3. Đối chiếu số bản ghi ở từng tầng và correlation ID.

**Sửa bắt buộc**

- Dùng khoảng ngày nửa mở:

```sql
WHERE DocumentDate >= CAST(@TuNgay AS date)
  AND DocumentDate < DATEADD(DAY, 1, CAST(@DenNgay AS date))
```

- `User` và scope lấy từ phiên; `EmployeeID` chỉ là bộ lọc và phải được kiểm tra quyền.
- Xác định khóa chi tiết hóa đơn đầy đủ; không mặc định `DocumentID` là duy nhất nếu schema không bảo đảm.
- FE phân biệt loading, empty, forbidden, invalid parameters và system error.
- Khi đổi bộ lọc phải xóa kết quả cũ trước khi tải.

**Tiêu chí đạt**

- Khoảng ngày đã xác nhận có dữ liệu phải hiện hóa đơn.
- Ngày cuối không bị mất bản ghi có giờ.
- Danh sách và chi tiết khớp mã, ngày, khách hàng và tổng tiền.

#### 2.2. Tuyến Manager và phân quyền EmployeeID — P1

- Xác định quan hệ quản lý trực tiếp/nhiều cấp, chi nhánh, hiệu lực phân công và tài khoản chồng lấn.
- Datasource chỉ trả nhân viên đang hoạt động trong scope Manager.
- Manager chọn được nhân viên trong nhóm; TDV bị khóa vào chính mình.
- BE từ chối `EmployeeID` ngoài scope, kể cả khi request bị sửa thủ công.
- Khi đổi nhân viên/ngày: xóa kết quả cũ, hiện loading, hủy request cũ và chỉ render response mới nhất.
- Nếu chưa có tuyến phải báo rõ, không giữ dữ liệu của lựa chọn trước.

**Tiêu chí đạt**

- Manager xem được tuyến nhân viên thuộc nhóm và không xem được người ngoài nhóm.
- TDV chỉ xem tuyến của mình.
- Không lẫn dữ liệu khi đổi nhanh ngày hoặc nhân viên.

#### 2.3. Xác minh dữ liệu tồn kho cho gợi ý sản phẩm — P1/P2

- Xác định tồn tổng, tồn khả dụng, kho/chi nhánh và thời điểm chốt.
- Chỉ hiển thị tồn khi API trả được ngữ cảnh đáng tin, ví dụ `Tồn khả dụng tại KHO1`.
- Không hiển thị một số tồn tổng gây hiểu nhầm cho kho đang lập đơn.

### Giai đoạn 3 — UI và vòng đời state

#### 3.1. Cleanup popup sản phẩm — P1

- Popup phải có `destroy()` thay vì chỉ xóa DOM.
- Router gọi cleanup trước khi unmount page.
- Cleanup gồm overlay, listener, timer/debounce, request đang chạy, keyboard handler, focus và `body.style.overflow`.
- Request tìm kiếm sản phẩm dùng `AbortController` và bị hủy khi đóng/chuyển route.

**Tiêu chí đạt**

- Mở popup rồi chuyển Hóa đơn không còn overlay hoặc listener cũ.
- Quay lại form mở được popup mới đúng một lần.

#### 3.2. Chuẩn hóa gợi ý sản phẩm — P2

- Không dùng regex xóa toàn bộ nội dung trong ngoặc.
- BE nên tách `itemName`, hàm lượng, quy cách, đơn vị và `promotionText` thành trường riêng.
- Danh sách chỉ trình bày mã, tên tối đa hai dòng, giá và đơn vị; tồn kho chỉ hiện sau khi mục 2.3 được xác minh.
- Khuyến mãi/công dụng hiển thị ở tooltip hoặc vùng chi tiết.
- Popup có giới hạn chiều cao và cuộn nội bộ.

### Giai đoạn 4 — UAT readiness

#### 4.1. Chuẩn bị dữ liệu thông báo — BLOCKED DATA, không phải bug

- Seed một thông báo chưa đọc và một thông báo đã đọc cho từng vai trò đại diện.
- Có thông báo của user khác để kiểm tra owner scope.
- Kiểm tra badge, mark-read, reload và mark-all-read.

#### 4.2. Chạy regression

1. Smoke test build và API contract.
2. UAT bằng `QLBH013.MED` và `NAMDINHB.MED`.
3. Permission regression bằng request sửa `User`, `EmployeeID`, `ManagerID`, `BranchID`.
4. Test hai tab cho login/logout.
5. Ghi Pass/Fail/BLOCKED và correlation ID trong báo cáo.

## 3. Phân công đầu ra

| Lớp | Đầu ra bắt buộc |
|---|---|
| SQL/BE | Logout thu hồi phiên; USER_INFO role/scope; ngày hóa đơn nửa mở; scope tuyến/tồn kho/notification |
| n8n | Context từ token; không cho override system params; giữ status/error; correlation ID |
| FE | Logout state machine; auth guard; roleCode; loading/error states; popup lifecycle; UI gợi ý |
| UAT | Fixture thông báo; hai tài khoản đại diện; permission regression; báo cáo có bằng chứng |

## 4. Điều kiện hoàn thành

- Không còn lỗi P0.
- Hóa đơn và tuyến vượt qua test dữ liệu/phân quyền.
- Không còn popup hoặc cache xuyên route/tài khoản.
- Hai tài khoản đại diện chạy hết smoke test mà không cần khởi động lại trình duyệt.
- Các case thiếu fixture được ghi `BLOCKED DATA`, không kết luận nhầm thành lỗi sản phẩm.
