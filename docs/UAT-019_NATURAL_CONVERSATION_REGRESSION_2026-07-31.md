# UAT-019 — Regression hội thoại tự nhiên

## Trạng thái

`PASS_STATIC_BLOCKED_AUTHENTICATED_RUNTIME`

Ngày kiểm tra: `31/07/2026`.

Không có mutation hoặc thay đổi dữ liệu SQL trong lần kiểm tra này.

## Kết quả đã chạy

| Bộ kiểm tra | Kết quả | Tỷ lệ |
|---|---:|---:|
| Classifier/intent/parameter/missing-field/follow-up | 159/159 PASS | 100% |
| Release-gate classifier | 0 lỗi | PASS |
| Network resilience | 5/5 PASS | 100% |
| Cổng xác thực đúng frontend Pilot `medtest.bms7.net` | HTTP 401 `AUTH_REQUIRED` khi không token | PASS |

Ngưỡng yêu cầu tối thiểu `95%` đã đạt ở bộ regression tĩnh. Không phát hiện lỗi P0/P1 trong classifier hoặc lớp chịu lỗi mạng.

## Phạm vi classifier đã đạt

- Nhận diện intent và tham số nghiệp vụ.
- Các câu thiếu khách hàng, sản phẩm hoặc mã chứng từ trả `ASK_FIELD`.
- Phân loại câu tiếp nối có context trả `USE_CONTEXT`; không có context không tự gọi API.
- Mutation chỉ ở mức preview/routing, không tự ghi dữ liệu trong regression.
- Câu không hỗ trợ và câu không xác định không bị định tuyến nhầm sang API nghiệp vụ.
- Hai workflow `MAIN_ChatBot_V5` và `AI_Intent_Parser` có cùng classifier contract hiện tại.

## Phần chưa chạy

Chưa chạy bộ `live` gồm 31 ca và chưa chạy chuỗi nhiều lượt thực tế qua chatbot đã đăng nhập vì phiên kiểm tra không có `MEDSTAND_AUTH_TOKEN` và fixture đúng phạm vi của một tài khoản UAT. Không được dùng token giả hoặc khách hàng ngoài quyền để thay thế.

Do đó chưa đủ bằng chứng để đánh dấu toàn bộ UAT-019 `[x] PASS` trên runtime. Còn cần:

1. Token tạm của một tài khoản UAT đang hoạt động.
2. Một mã khách hàng, sản phẩm và chứng từ thuộc đúng phạm vi tài khoản đó.
3. Chạy smoke rồi chạy đủ live trên `https://medtest.bms7.net/api/gateway`.
4. Kết quả runtime đạt ít nhất 95% và không có lỗi P0/P1.

## Lệnh hoàn tất runtime

Không ghi token vào source hoặc báo cáo. Đặt token tạm trong đúng cửa sổ PowerShell:

```powershell
$env:MEDSTAND_AUTH_TOKEN = '<token-UAT-tạm>'
$env:MEDSTAND_TEST_CUSTOMER = '<khách-thuộc-quyền>'
$env:MEDSTAND_TEST_PRODUCT = '<sản-phẩm-HH1>'
$env:MEDSTAND_TEST_DOCUMENT = '<chứng-từ-thuộc-quyền>'

node scripts/test_natural_chat_system.js smoke --transport gateway --endpoint https://medtest.bms7.net/api/gateway
node scripts/test_natural_chat_system.js live --transport gateway --endpoint https://medtest.bms7.net/api/gateway --report reports/uat019-live.json
```

Sau khi chạy, đóng cửa sổ PowerShell để xóa token tạm.

## Bằng chứng

- `reports/uat019-natural-static-2026-07-31.json`
- `reports/uat019-resilience-2026-07-31.json`
- `reports/uat019-auth-gate-pilot-2026-07-31.json`
