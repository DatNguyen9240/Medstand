# Catalog menu known gaps

- Browser UAT Manager/TDV chưa có evidence mới do Playwright Chromium bị `spawn EPERM` trong môi trường hiện tại.
- Quick-action renderer chỉ kích hoạt khi response gốc của `@danh_muc` có cả `Type/TYPE` và `Label/LABEL`.
- Kết quả sau khi chọn danh mục tiếp tục dùng renderer hiện hữu; chưa thay đổi contract hoặc backend response.
- Type ngoài năm giá trị đã duyệt bị chặn và ghi `CONTRACT_DRIFT`.
