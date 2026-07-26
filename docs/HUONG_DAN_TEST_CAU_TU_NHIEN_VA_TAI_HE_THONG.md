# Hướng dẫn test câu tự nhiên và khả năng vận hành chatbot

## 1. Mục đích

Bộ test kiểm tra bốn lớp độc lập:

1. Nhận diện câu văn tự nhiên và từ viết tắt.
2. Hợp đồng giữa classifier, workflow n8n và API được duyệt.
3. Khả năng chịu lỗi mạng của frontend: retry, timeout, JSON lỗi và chống gửi trùng.
4. Khả năng vận hành thật: health check, smoke test và tải đồng thời có kiểm soát.

Không dùng bộ test tải để chứng minh business rule đúng. Kết quả tải chỉ phản ánh độ sẵn sàng, độ trễ và tỷ lệ lỗi tại thời điểm chạy.

## 2. Các lệnh không cần tài khoản

```powershell
npm run test:natural
npm run test:resilience
npm run test:health
npm run test:auth:gate
npm run test:infra:load
```

- `test:natural`: chạy hơn 100 câu và trả exit code `1` nếu còn câu không đúng contract.
- `test:resilience`: dùng server giả trên máy, không gọi dữ liệu ERP.
- `test:health`: kiểm tra mặc định `localhost:3000` và `localhost:5678/healthz`.
- `test:auth:gate`: xác nhận câu nghiệp vụ không token bị từ chối; test phải fail nếu request ẩn danh vẫn nhận phản hồi thành công.
- `test:infra:load`: gửi tải GET có kiểm soát vào web và health endpoint n8n; không cần đăng nhập và không gọi dữ liệu ERP.

Nếu PowerShell báo chặn `npm.ps1`, dùng `npm.cmd run <tên-lệnh>` hoặc gọi trực tiếp `node scripts/test_natural_chat_system.js <lệnh>`; không cần thay đổi Execution Policy của máy.

## 3. Chuẩn bị test runtime có đăng nhập

Không ghi token vào source, file JSON hay command history. Chỉ đặt token tạm trong biến môi trường của cửa sổ PowerShell hiện tại:

```powershell
$env:MEDSTAND_AUTH_TOKEN = '<token của tài khoản test>'
$env:MEDSTAND_TEST_CUSTOMER = 'AG0031'
$env:MEDSTAND_TEST_PRODUCT = 'A003'
$env:MEDSTAND_TEST_DOCUMENT = 'U13S1_MB13_4'
$env:MEDSTAND_CHAT_ENDPOINT = 'https://medtest.bms7.net/api/gateway'
```

> **Quan trọng:** `/api/chat` đã bị vô hiệu hóa và trả `404 GATEWAY_REQUIRED`. Mọi lưu lượng nghiệp vụ đi qua `/api/gateway`. Nếu tài liệu hoặc script cũ còn trỏ `/api/chat` thì toàn bộ ca kiểm thử sẽ báo 404, không phải lỗi hệ thống.

> **Kiểm tra đúng môi trường trước khi chạy.** Khi không đặt `MEDSTAND_CHAT_ENDPOINT`, bộ test mặc định về `http://localhost:3000/api/gateway`. Muốn kiểm thử Pilot thì phải trỏ tường minh sang `medtest`, nếu không bạn đang nghiệm thu nhầm máy local.

Đóng cửa sổ PowerShell sau khi test để xóa các biến tạm.

## 4. Smoke test

```powershell
npm run test:chat:smoke
```

Smoke test gửi một nhóm nhỏ gồm chào hỏi, danh tính, doanh số, công nợ, tồn kho, gợi ý đơn và câu thiếu khách hàng. Bộ test phát hiện riêng:

- HTTP 4xx/5xx.
- Timeout.
- Dữ liệu rỗng hoặc không phải JSON.
- `AUTH001` sai đường quyền.
- API được trả về khác API mong đợi, nếu response có metadata API.
- Yêu cầu hợp lệ nhưng bị hỏi lại hoặc validation sai.

## 5. Test đủ 24 luồng đọc

```powershell
npm run test:chat:live
```

Nên chạy lần lượt cho từng tài khoản test. Mỗi tài khoản phải dùng khách hàng và sản phẩm nằm trong phạm vi thật của tài khoản đó.

Có thể đổi trực tiếp bằng tham số:

```powershell
node scripts/test_natural_chat_system.js live --customer HPA011 --product A015
```

Chạy thẳng lên môi trường Pilot mà không cần đặt biến môi trường:

```powershell
node scripts/test_natural_chat_system.js live --transport gateway --endpoint https://medtest.bms7.net/api/gateway
```

## 6. Load test an toàn

Kiểm tra hạ tầng local trước, mặc định 100 request cho mỗi dịch vụ và 10 request đồng thời:

```powershell
npm run test:infra:load
```

Bài này chỉ chứng minh lớp HTTP web/n8n còn đáp ứng dưới tải; không thay thế bài tải xuyên suốt chatbot có đăng nhập.

Mặc định chỉ gửi 40 request, đồng thời 4 request và chỉ cho localhost:

```powershell
npm run test:chat:load
```

Tùy chỉnh:

```powershell
node scripts/test_natural_chat_system.js load --requests 80 --concurrency 5 --max-p95 5000 --min-success-rate 99
```

Điều kiện mặc định:

- Tỷ lệ thành công tối thiểu: `99%`.
- p95 tối đa: `5.000 ms`.
- Đồng thời tối đa: `10` nếu chưa bật chế độ tải cao.
- Tổng tối đa: `200` nếu chưa bật chế độ tải cao.

## 7. Chạy trên server remote

Chỉ chạy sau khi người quản trị server đồng ý khung giờ và mức tải:

```powershell
node scripts/test_natural_chat_system.js load `
  --endpoint https://example.com/api/chat `
  --requests 40 `
  --concurrency 3 `
  --allow-remote-load
```

Không dùng `--allow-high-load` trong Pilot hoặc giờ làm việc. Tăng tải theo từng bậc `2 → 3 → 5` request đồng thời và dừng ngay khi:

- Có HTTP 5xx liên tục.
- Tỷ lệ thành công dưới 99%.
- p95 vượt 5 giây.
- SQL Server hoặc n8n tăng CPU, RAM, connection hoặc queue bất thường.

## 8. Xuất báo cáo

```powershell
node scripts/test_natural_chat_system.js live --report reports/natural-chat-live.json
node scripts/test_natural_chat_system.js load --report reports/natural-chat-load.json
node scripts/test_natural_chat_system.js infra-load --report reports/natural-chat-infrastructure-load.json
```

Không commit báo cáo chứa nội dung phản hồi nghiệp vụ hoặc định danh người dùng nếu chưa được làm sạch.

## 9. Thứ tự nghiệm thu khuyến nghị

1. `test:natural`.
2. `test:resilience`.
3. `test:health`.
4. `test:chat:smoke` cho một Sale và một Manager.
5. `test:chat:live` lần lượt cho 13 tài khoản.
6. Load test localhost.
7. Load test staging/remote trong khung giờ được duyệt.
8. Đối chiếu execution n8n, log server và SQL trong cùng khoảng thời gian.

Chỉ gọi là vận hành đạt khi cả contract, runtime và tải đều pass. Health check `200` một mình không chứng minh chatbot xử lý nghiệp vụ đúng.
