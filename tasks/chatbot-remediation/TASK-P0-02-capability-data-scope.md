# TASK-P0-02 — Capability và data scope

**Ưu tiên:** P0 — Blocker  
**Phụ thuộc:** TASK-P0-00, TASK-P0-01  
**Chủ trì:** Backend/n8n + Database

## Mục tiêu

Cho phép đúng ApiCode và đúng phạm vi dữ liệu theo capability/ownership, không chỉ theo role.

## Contract đề xuất

- `ApiCode`
- `OperationType`
- `RequiredCapability`
- `AllowedCapabilities`
- `ScopeResolver`
- `OwnershipRule`

## Việc cần làm

1. Lấy Username/EmployeeID/BranchID từ identity mapping server.
2. Bỏ qua identity/scope params do client tự gửi.
3. Mutation dùng allowlist và capability ghi riêng; mặc định deny.
4. Inventory 24 SP đọc và 3 mutation.
5. Đánh dấu SP có `username rỗng OR ...` hoặc fail-open tương tự.
6. Sửa từng nhóm SP, ưu tiên dữ liệu nhạy cảm; bảo toàn service account hợp lệ.
7. Enforce ownership TDV và branch/hierarchy Manager ở SQL.

## Tiêu chí nghiệm thu

- TDV chỉ thấy dữ liệu được giao/thuộc sở hữu.
- Manager chỉ thấy phạm vi được cấp.
- Thiếu capability trả 403 trước SQL.
- Sửa params client không mở rộng dữ liệu.
- Audit/profiler chứng minh `sql_execution_count = 0` khi bị từ chối.

## Tiến độ 2026-07-15

- [x] Thêm capability gate fail-closed trước `Build Execute SQL`/`MS SQL Execute` trong bản workflow local.
- [x] Chỉ allowlist các API đọc đã biết và 3 mutation; ApiCode ngoài danh sách trả 403.
- [x] Bỏ qua scope/identity client tự gửi (`Username`, `EmployeeID`, `BranchID`, `ManagerID`, `CeoID`, `@SYS*`).
- [x] Chỉ chèn lại Username/EmployeeID từ `verifiedIdentity` phía server.
- [x] Thêm migration metadata có transaction và audit read-only.
- [x] Thêm regression test `test:api-execute-capability`.
- [x] Chạy migration/audit trên UAT: 36 API active gồm 24 READ, 3 MUTATION và 9 DENY.
- [x] Tạo workflow audit UAT `xHz2IIXkzldgO5vf` (không publish).
- [x] Vá và xác minh guard phạm vi dữ liệu cho 4 SP bị fail-open:
  - `API_DeXuatKhuyenMai_AI`
  - `API_SanPhamTrongTam_AI`
  - `API_TichLuy_AI`
  - `API_UpsellGoiY_AI`
- [x] Xác minh 3 cảnh báo còn lại là false positive/an toàn theo cấu trúc hiện tại:
  - `API_ChamDiemKH_AI`
  - `API_HoaDon_AI`
  - `API_HoaDonChiTiet_AI`
- [x] Tạo/chạy workflow vá phạm vi UAT `uLcChUJTjNd0iUPY`; kết quả verify guard đạt 4/4.
- [x] Cập nhật workflow staging `69SnDy4QxGvfTGPc` lên 16 node, có `Enforce API Capability`, không còn nhánh legacy `Is UUID Token?`.
- [x] Kiểm thử staging không token: trả HTTP 401 `AUTH_TOKEN_MISSING` trước SQL.
- [x] Kiểm thử trực tiếp trên n8n với scope giả mạo và token sai: trả HTTP 401 `AUTH_TOKEN_INVALID`; chỉ `Respond Auth Error (Execute)` chạy, node SQL không chạy.
- [x] Xác nhận Manager và TDV thật được Shared Auth Guard cấp baseline chỉ đọc `api.read` từ hồ sơ business đã xác minh.
- [x] Kiểm thử token thật cho capability hợp lệ và scope tampering; thiếu capability/identity được khóa bằng contract theo phạm vi UAT đã duyệt.
- [x] Publish capability gate lên production và smoke thành công ngày 2026-07-15.

## Workflow UAT/staging

- Audit metadata/scope: `xHz2IIXkzldgO5vf`
- Patch và verify data scope: `uLcChUJTjNd0iUPY`
- API Execute staging: `69SnDy4QxGvfTGPc`

Ba workflow trên được giữ ở trạng thái staging/UAT, không publish lên production.

## Điều kiện để nghiệm thu production

Repo không lưu mật khẩu hoặc token UAT. Cần đăng nhập lần lượt hai tài khoản thật sau rồi chạy lại staging:

- Manager: `QLBH013.MED`
- TDV: `NAMDINHB.MED`

Với mỗi phiên, cần xác nhận payload `API_UserInfo` có capability do server cấp và chạy ba ca: API được phép, API thiếu capability trả 403 trước SQL, và tham số scope giả mạo không làm mở rộng dữ liệu.

> Production đã publish sau khi role-only UAT đạt 46/46. Baseline chỉ cấp `api.read`; không tự cấp capability ghi.
