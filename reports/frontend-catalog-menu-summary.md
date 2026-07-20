# Agent B — Catalog menu UI summary

Ngày: 17/07/2026

## Phạm vi

- Thay bảng kỹ thuật `TYPE/LABEL` của `@danh_muc` bằng quick-action card trong chatbot hiện tại.
- Giữ nguyên HTML/CSS/JavaScript thuần và luồng `ApiEngine.execute` hiện có.
- Không sửa backend, SQL, n8n, package hoặc lockfile.

## Mapping

- Sản phẩm → `sanpham`
- Khách hàng → `khachhang`
- Đơn hàng → `donhang`
- Kho hàng → `khohang`
- Nhân viên → `nhanvien`

## Context

Renderer giữ `currentCatalogType`, `catalogMode`, `pendingSearch` và `isRequestInProgress`. Double-click bị chặn trong thời gian request. Type ngoài allowlist ghi `CONTRACT_DRIFT` và fail-closed.

## File source

- `chatbot-widget/js/chatbot-renderers-medstand.js`
- `chatbot-widget/js/chatbot.js`
- `chatbot-widget/css/chatbot.css`
- `scripts/test_catalog_menu_contract.js`

## Trạng thái

- Source syntax: PASS
- Catalog contract test: PASS
- Build: PASS
- Playwright browser UAT: BLOCKED_BY_ENVIRONMENT nếu Chromium tiếp tục báo `spawn EPERM`

