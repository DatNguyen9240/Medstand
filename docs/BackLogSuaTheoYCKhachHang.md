# BACKLOG PHÁT TRIỂN THEO YÊU CẦU KHÁCH HÀNG

**Cập nhật:** 04/09/2026 (bốn yêu cầu đã triển khai kỹ thuật trên `medtest`, chờ business UAT/sign-off)

**Mục đích:** file này chỉ giữ việc còn phải chốt nghiệp vụ, khảo sát kỹ thuật hoặc sửa/code logic. Những việc chức năng đã có, chỉ còn QA/UAT/dry-run được tách sang [QA_UAT_CAN_NGHIEM_THU_LAI.md](QA_UAT_CAN_NGHIEM_THU_LAI.md). Kết quả đã hoàn thành và lịch sử quyết định nằm tại [NGHIEM_THU_GHI_CHU_VA_LICH_SU_TASK.md](NGHIEM_THU_GHI_CHU_VA_LICH_SU_TASK.md).

## Cách đọc

- `[ ]`: còn quyết định hoặc thay đổi sản phẩm phải thực hiện.
- `P0`: chặn UAT hoặc có rủi ro quyền/dữ liệu/nghiệp vụ trực tiếp.
- `P1`: quan trọng nhưng không phải điểm chặn tức thời.
- Không ghi kết quả chạy QA dài trong file này. Nếu QA phát hiện lỗi code mới, tạo defect riêng rồi mới đưa lại vào backlog phát triển.

## 1. Khách mới và khách hợp đồng

- [ ] **CUSTOMER-NEW-001 — Lọc khách mới mua hàng trong tháng** · `P0` · `PENDING_BUSINESS_CONTRACT`
  - **Yêu cầu ban đầu:** khách không mua hàng trong khoảng `01/01/2026–31/07/2026`, sau đó phát sinh mua trong tháng xét và đạt tối thiểu `600.000đ` tại MB hoặc `500.000đ` tại MN.
  - **Loại trừ:** không công nhận khách mới nếu chỉ đổi giấy tờ/mã khách, mã mới dùng chung chủ với mã cũ đang hoạt động hoặc thuộc trường hợp Công ty không công nhận; các mã liên quan được gom theo cột `Code chính` trong DMKH.
  - **Cấu hình:** admin được thay đổi kỳ không mua hàng và ngưỡng doanh số theo vùng/tháng; cấu hình phải có version, ngày hiệu lực và audit, không hard-code riêng mốc tháng 08/2026.
  - **Cần chốt trước khi code:** tháng xét; nguồn doanh số; trạng thái chứng từ được tính; VAT/chiết khấu/trả hàng; quy tắc xác định MB/MN; cách cộng doanh số theo `Code chính`; khách chưa từng mua; dữ liệu hiển thị/xuất báo cáo.
  - **Điều kiện đóng:** có sign-off cùng bảng ví dụ dưới/bằng/trên ngưỡng và các ca đổi mã/chung chủ; frontend, API và SQL dùng cùng contract có version; quyền admin và audit được kiểm thử.

- [ ] **CUSTOMER-CONTRACT-001 — Thống kê số lượng KHHD theo Sale/QLBH** · `P1` · `IMPLEMENTED_ON_MEDTEST_AWAITING_BUSINESS_UAT`
  - **Đã triển khai 04/09/2026:** nguồn chuẩn `AR_ObjectContractTbl + AR_ObjectContractDetailTbl`; gom trùng theo `CodeChinh`; gán một Sale/QLBH theo mapping nhóm khách còn hiệu lực gần nhất; API giới hạn theo identity và trang `#/contract-customer`. Đối soát kỹ thuật ghi nhận `2.422` khách duy nhất và `144` dòng Sale ở snapshot chạy thử.
  - **Yêu cầu ban đầu:** khai thác nguồn từ mục Quản lý hợp đồng tham gia năm 2026, thống kê số lượng khách hàng hợp đồng theo từng Sale và cấp QLBH.
  - **Cần chốt trước khi code:** định nghĩa `KHHD`; hợp đồng còn hiệu lực hay phát sinh trong kỳ; đếm khách hay hợp đồng; loại trùng theo `Code chính`; Sale chuyển quản lý; cây Sale–QLBH; kỳ/snapshot báo cáo và quyền drill-down.
  - **Điều kiện đóng:** có data dictionary và query oracle được business xác nhận; tổng theo Sale khớp tổng QLBH; không lộ khách ngoài phạm vi và có ví dụ đối soát cụ thể.

- [ ] **CUSTOMER-CONTRACT-002 — Cảnh báo khách hợp đồng chưa phát sinh doanh số ba tháng** · `P1` · `IMPLEMENTED_ON_MEDTEST_AWAITING_BUSINESS_UAT`
  - **Đã triển khai 04/09/2026:** dùng ba tháng lịch hoàn chỉnh ngay trước ngày chốt, doanh số ròng từ `AR_OrderAndReturnView` đã gồm trả hàng; chỉ cảnh báo hợp đồng còn hiệu lực và hiển thị trong cùng dashboard theo phạm vi Sale/QLBH.
  - **Yêu cầu ban đầu:** từ tập khách hợp đồng năm 2026 theo từng nhóm Sale, cảnh báo khách không phát sinh doanh số trong ba tháng gần nhất.
  - **Cần chốt trước khi code:** ba tháng lịch hoàn chỉnh hay 90 ngày; có tính tháng hiện tại; nguồn/trạng thái doanh số; xử lý đơn hủy/trả hàng; người nhận, kênh và tần suất cảnh báo; điều kiện tắt hoặc xác nhận đã xử lý.
  - **Điều kiện đóng:** oracle danh sách cảnh báo khớp dữ liệu nguồn; Sale chỉ thấy khách của mình, QLBH chỉ thấy nhóm phụ trách; refresh/retry không tạo cảnh báo trùng.

## 2. Phân quyền CTKM và AI tra CTBH

- [ ] **PROMO-AUTH-001 — Phân quyền khai báo CTKM** · `P0` · `IMPLEMENTED_ON_MEDTEST_AWAITING_BUSINESS_UAT`
  - **Đã triển khai 04/09/2026:** ma trận quyền theo `USER / USER_GROUP / MANAGER_FLAG × hành động × phạm vi`; QLBH được xem/tạo/sửa/xem lịch sử trong chi nhánh, nhóm toàn cục được duyệt/từ chối/thu hồi; SQL là lớp cưỡng chế, UI chỉ phản ánh quyền; identity do gateway ghi đè từ phiên đăng nhập.
  - **Cần làm:** đối chiếu yêu cầu mới với quyền hiện có của `PROMO-CFG-002`, tránh tạo hệ phân quyền thứ hai; chốt ma trận `vai trò × hành động × chi nhánh/phạm vi` cho xem, tạo nháp, sửa, gửi duyệt, duyệt/từ chối, thu hồi và xem lịch sử.
  - **Yêu cầu kỹ thuật:** quyền phải được server/SQL kiểm tra, identity lấy từ phiên đăng nhập, cấu hình có version/audit/rollback; UI chỉ phản ánh quyền, không phải lớp bảo vệ duy nhất.
  - **Điều kiện đóng:** gap analysis xác định rõ phần tái sử dụng và phần phải code; có sign-off ma trận quyền; test giả identity/chi nhánh và mutation trái quyền bị chặn.

- [ ] **PROMO-AI-001 — AI trả lời CTBH của sản phẩm bất kỳ** · `P1` · `IMPLEMENTED_ON_MEDTEST_AWAITING_TELEGRAM_RUNTIME_UAT`
  - **Đã triển khai 04/09/2026:** intent riêng `PRODUCT_PROMOTION_LOOKUP` và API `@ctbh_san_pham`; nhận mã hoặc tên sản phẩm, hỏi lại khi thiếu; tái sử dụng nguồn sản phẩm/CTBH có cấu trúc đã lọc theo identity; formatter Telegram hiển thị quyền lợi và ẩn metadata nội bộ. Source n8n đã sẵn sàng import/publish; máy hiện tại không có runtime n8n đang lắng nghe nên chưa chạy smoke Telegram thật.
  - **Cần làm:** nhận diện mã/tên sản phẩm từ câu hỏi, gọi API CTBH có cấu trúc theo identity, chi nhánh, khách, ngày và số lượng; AI chỉ diễn giải dữ liệu trả về, không tự suy đoán hoặc dùng RAG làm nguồn quyết định quyền lợi.
  - **Cần chốt trước khi code:** CTBH hiện hành hay cả sắp diễn ra; có bắt buộc chọn khách/số lượng; cách trình bày điều kiện, quà/chiết khấu, mức tối đa, ngày hiệu lực và lý do không áp dụng; quan hệ giữa thuật ngữ CTKM và CTBH.
  - **Quy tắc đã có phải giữ:** vượt `MaximumQuantity` chỉ áp quyền lợi ở mức tối đa; không nhân tiếp và không fallback sai sang ghi chú ERP.
  - **Điều kiện đóng:** câu trả lời khớp API/oracle cho ca có CTBH, note-text, không CTBH, ngoài phạm vi và vượt mức tối đa; không lộ CTBH ngoài quyền; mã lạ hoặc contract lạ phải fail-closed.

## 3. Thứ tự phát triển

1. `CUSTOMER-NEW-001` — chốt contract rồi mới thiết kế/code.
2. `CUSTOMER-CONTRACT-001` → `CUSTOMER-CONTRACT-002` — dùng chung tập khách hợp đồng và định nghĩa doanh số.
3. `PROMO-AUTH-001` → `PROMO-AI-001` — chốt quyền và nguồn dữ liệu có cấu trúc trước khi mở AI hỏi đáp.

Các luồng QA/UAT không yêu cầu sửa logic được điều phối độc lập trong [QA_UAT_CAN_NGHIEM_THU_LAI.md](QA_UAT_CAN_NGHIEM_THU_LAI.md).
Các task `CUSTOMER-BIZ-001` và `CUSTOMER-SEC-001` đã hoàn tất được lưu tại [NGHIEM_THU_GHI_CHU_VA_LICH_SU_TASK.md](NGHIEM_THU_GHI_CHU_VA_LICH_SU_TASK.md), không giữ trong backlog phát triển.
