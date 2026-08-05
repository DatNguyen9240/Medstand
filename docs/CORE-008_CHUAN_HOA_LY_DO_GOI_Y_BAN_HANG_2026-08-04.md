# CORE-008 — Chuẩn hóa lý do gợi ý bán hàng

Ngày thực hiện: 04/08/2026  
Trạng thái: `MEDTEST_RUNTIME_TOKEN_UAT_VERIFIED_PENDING_VISUAL_UI_ACCEPTANCE`

## Kết quả

Đã đồng bộ một contract giải thích dùng chung cho gợi ý sản phẩm và gợi ý khách/tuyến. SQL là nơi tính nghiệp vụ; n8n chỉ chuyển tiếp metadata; frontend chỉ định dạng câu tiếng Việt, ngày và trạng thái để người dùng đọc.

Rule và hai procedure đã deploy lên `medtest`, sau đó được hậu kiểm read-only. Workflow n8n đã được backup, import, publish, restart và đối chiếu lại với source. Frontend bundle `11.127` đang được gateway local phục vụ. UAT qua token/gateway đã PASS; còn bước xác nhận trực quan trên UI và lưu ảnh nghiệm thu.

## Rule được chốt

- Rule: `BR-RECOMMENDATION-008/1.0.0`, trạng thái `APPROVED`, hiệu lực từ lúc chạy migration.
- Khoảng lịch sử tính chu kỳ: 6 tháng theo cấu hình, không fallback toàn bộ lịch sử.
- Gợi ý sản phẩm: một purchase event là `CustomerId + ProductId + PurchaseDate`.
- Gợi ý khách/tuyến: một purchase event là `CustomerId + PurchaseDate`.
- Nhiều hóa đơn hoặc dòng cùng grain trong một ngày chỉ tính một event.
- Cần tối thiểu 3 purchase event, tương ứng ít nhất 2 khoảng cách.
- Chu kỳ là trung bình các khoảng cách liên tiếp, làm tròn bằng `ROUND(..., 0)` đến ngày nguyên gần nhất.
- `CycleComputationMode`: `NO_HISTORY`, `INSUFFICIENT_HISTORY`, `PERSONAL_HISTORY`, `POLICY_DEFAULT`.
- `CycleStatus`: `UNKNOWN`, `UPCOMING`, `DUE`, `OVERDUE`.
- `POLICY_DEFAULT` luôn được ghi rõ là mốc chính sách, không mô tả như chu kỳ cá nhân.
- Trạng thái hóa đơn, cửa sổ thời gian, các ngưỡng và điểm ưu tiên tuyến đều đọc từ rule `APPROVED`; procedure fail-closed nếu rule thiếu, sai hoặc có nhiều version cùng hiệu lực.

## Contract phẳng

Hai API trả các trường chuẩn: `LanMuaCuoiDate`, `InvoiceCount`, `PurchaseEventCount`, `CycleObservationCount`, `CycleComputationMode`, `HistoryStatus`, `NgayDuKien`, `ConLaiNgay`, `CycleStatus`, `PrimaryReasonCode`, `RecommendationReasonCodes`, `ReasonText`, `RuleSourceCodes`, `RuleSourceLabel`, `RuleCode`, `RuleVersion`, `DataWindow`, `DataFrom`, `DataTo`, `CalculatedAt`, `ReturnAdjustmentMode`.

Tên cột chu kỳ cũ được giữ để tương thích: gợi ý sản phẩm dùng `ChuKyNgay`, tuyến dùng `ChuKyTB`. Các trường cũ như `LanMuaCuoi`, `RecommendationReason`, `ChiTiet`, `LyDoGhe` cũng chưa bị xóa.

`RequestId` tiếp tục nằm ở response envelope và audit hiện có của gateway, không được SQL tự sinh lại.

## Kết quả khảo sát trả hàng ERP

Khảo sát read-only trên `medtest` cho 21.109 dòng trả hàng hợp lệ cho thấy:

- `HeaderLink` có dữ liệu ở 21.069 dòng nhưng không khớp `DocumentID` hóa đơn nào.
- `RefDoc` có dữ liệu ở 8.773 dòng và khớp hóa đơn ở 7.723 dòng.
- `SoPhieuBan` có dữ liệu ở 34 dòng và khớp hóa đơn ở 20 dòng.
- Tổng cộng chỉ 7.743/21.109 dòng, khoảng 36,7%, liên kết được về hóa đơn theo các trường hiện có.
- Số lượng trả dương: 19.527 dòng; bằng 0: 1.582 dòng; âm: 0 dòng.

Vì không thể liên kết đáng tin cậy toàn bộ phiếu trả về purchase event gốc, rule hiện tại chốt rõ: phiếu trả không tạo purchase event mới và chưa điều chỉnh/xóa event mua gốc. Giá trị này được xuất qua `ReturnAdjustmentMode = RETURNS_NOT_EVENTS_ORIGINAL_EVENT_NOT_ADJUSTED_UNRELIABLE_LINKAGE`. Việc net theo trả hàng chỉ được mở sau khi ERP cung cấp quan hệ chứng từ gốc đáng tin cậy.

## Thay đổi kỹ thuật

- Rule migration: `sql/Migrate_CORE008_Recommendation_Rule_V1_AI.sql`.
- Gợi ý sản phẩm: `sql/Module 1 - API_GoiYDonHang_AI.sql`.
- Gợi ý khách/tuyến: `sql/Module 2 - API_TuyenBanHang_AI.sql`.
- Gateway mapping: `n8n/API_Services/API_Execute.json`; đã bỏ nhãn fallback `BR-SALES-V1-DRAFT` và `BR-ROUTE-V1-DRAFT` cho hai API này.
- Frontend: `chatbot-widget/js/chatbot.js`; hiển thị lần mua cuối, chu kỳ, ngày dự kiến, số ngày còn/quá hạn, lý do và nguồn dễ hiểu.
- Bundle local: `11.127`.
- Discovery read-only: `scripts/discover_core008_return_linkage.js`.
- Preflight rollback: `scripts/preflight_core008_recommendation.js`.

## Kiểm chứng 04/08/2026

- SQL compile trong transaction: 3/3 file PASS, 9 batch PASS; rollback, không lưu thay đổi.
- Rule: 22/22 key `APPROVED` trong transaction.
- Công thức: case làm tròn 3,5 thành 4 ngày PASS; case 4 hóa đơn nhưng 3 ngày mua tính đúng 3 event và chu kỳ 4 ngày PASS.
- Scope/runtime: tuyến 13/13 tài khoản PASS contract.
- Gợi ý sản phẩm: 4 tài khoản có mặt hàng lịch sử còn bán được PASS contract; 9 tài khoản không có mặt hàng lịch sử còn tồn bán được nên trả rỗng đúng guard STOCK-001, không bị ép gợi ý hàng không bán được.
- Static contract/no-draft/no-all-history/configured-scoring: 8/8 PASS.
- Natural chat regression: 159/159 PASS.
- JavaScript syntax và build frontend `11.127`: PASS.
- Deploy SQL atomically lên `medtest`: 3/3 file, 9 batch commit PASS.
- Hậu kiểm read-only sau deploy: đúng 22 key `APPROVED`, đúng hai procedure mới, tuyến 13/13 và contract sản phẩm 4 ca có hàng PASS; không có ghi dữ liệu test.
- n8n runtime: workflow `fCJwiyAT9r6eh1ys` tồn tại, active, khớp source; 8/8 marker CORE-008 PASS; `/healthz` trả `200` sau restart.
- Frontend runtime local: bundle `11.127` trả `200`, 302.149 byte; health tổng thể gateway + n8n 2/2 PASS.
- Token/gateway UAT bằng `QLMN2`: 4/4 PASS, không mutation. Gợi ý sản phẩm `PERSONAL_HISTORY` — `req-11803-mse4rfgm`; tuyến `PERSONAL_HISTORY` — `req-11805-mse4rhk6`; tuyến `POLICY_DEFAULT` — `req-11807-mse4rir4`; khách `NO_HISTORY` — `req-11809-mse4rk0v`.

## Việc còn lại trước khi DONE

1. Mở UI và lưu ảnh cho bốn ca token đã PASS hoặc tối thiểu ba trạng thái `PERSONAL_HISTORY`, `POLICY_DEFAULT`, `NO_HISTORY`.
2. Xác nhận trực quan rằng người dùng thấy lần mua cuối, chu kỳ, ngày dự kiến, lý do và nguồn; mã kỹ thuật không lấn át phần giải thích.
