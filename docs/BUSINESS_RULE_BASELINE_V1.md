# Business Rule Baseline v1 — Medstand

**Trạng thái:** Quy tắc tạm thời để triển khai MVP  
**Phạm vi:** Gợi ý bán hàng, dashboard KPI, tuyến, chấm điểm, tích lũy, tồn kho, chương trình, hành động AI và nội dung y tế.  
**Nguyên tắc:** Không hardcode ngưỡng trong prompt/SQL; mọi ngưỡng phải có cấu hình, version, hiệu lực và người phê duyệt.

> Đây là baseline đề xuất để đội dev triển khai. Bốn nhóm ảnh hưởng tài chính, phân quyền, chiết khấu và an toàn y tế vẫn cần người có thẩm quyền ký xác nhận trước khi chạy production.

## 1. Bảng quyết định phiên bản 1

| Rule ID | Nhóm | Quyết định v1 | Trạng thái |
|---|---|---|---|
| BR-SALES-001 | Doanh số | Doanh số chính thức lấy từ hóa đơn đã hoàn tất/hợp lệ, không lấy đơn hàng chưa giao | Tạm chốt |
| BR-SALES-002 | Trả/hủy | Trừ hàng trả và điều chỉnh giảm; hóa đơn/đơn hủy không tính; trạng thái cuối là nguồn quyết định | Tạm chốt |
| BR-SALES-003 | VAT | KPI, chấm điểm và hiệu quả bán hàng dùng doanh số thuần chưa VAT; hóa đơn vẫn có thể hiển thị tổng thanh toán gồm VAT | **Cần ký tài chính** |
| BR-SALES-004 | Chu kỳ mua | Ưu tiên tính theo cặp khách hàng–sản phẩm | Tạm chốt |
| BR-SALES-005 | Fallback chu kỳ | Nếu chưa đủ dữ liệu: khách–nhóm sản phẩm → khách–toàn bộ → nhóm tương tự → ngưỡng mặc định | Tạm chốt |
| BR-SALES-006 | Đủ dữ liệu | Tối thiểu 3 lần mua mới tính chu kỳ cá nhân; ít hơn phải gắn nhãn độ tin cậy thấp | Tạm chốt |
| BR-CUSTOMER-001 | Khách mới | Gắn `NEW_CUSTOMER`, không tự xếp nguy cơ chỉ vì thiếu lịch sử | Tạm chốt |
| BR-CUSTOMER-002 | Gợi ý khách mới | Dùng kênh, khu vực, nhóm tương tự, sản phẩm trọng tâm và chương trình; phải nói rõ độ tin cậy thấp | Tạm chốt |
| BR-STOCK-001 | Nguồn tồn | ERP/database Medstand là nguồn chính thức, không lấy file Excel/chatbot cache làm nguồn quyết định | **Cần xác nhận nguồn DB** |
| BR-STOCK-002 | Phạm vi kho | Kho chính, `DL02`, `DL03` theo mapping user → role → branch → allowed warehouses | **Cần ký phân quyền** |
| BR-STOCK-003 | Tồn dùng để gợi ý | Dùng tồn khả dụng = vật lý − giữ chỗ − khóa − lỗi − hết hạn/không được bán | Tạm chốt |
| BR-STOCK-004 | Giữ hàng | Chỉ trừ reservation khi trạng thái giữ hàng chính thức; draft chưa giữ không trừ | Tạm chốt |
| BR-STOCK-005 | Độ mới tồn | Hiển thị thời gian cập nhật; dữ liệu quá ngưỡng cấu hình không được dùng để tự tin đề xuất số lượng | Tạm chốt |
| BR-ROUTE-001 | Lâu chưa ghé | Tính từ check-in/ghi nhận ghé gần nhất, không suy ra từ đơn hàng | Tạm chốt |
| BR-ROUTE-002 | Lâu chưa mua | Tính từ hóa đơn hợp lệ gần nhất | Tạm chốt |
| BR-ROUTE-003 | Vai trò AI | Tuyến công ty khai báo vẫn là tuyến chính; AI chỉ đề xuất ưu tiên/ngày, không tự sửa tuyến | Tạm chốt |
| BR-ROUTE-004 | MVP tuyến | Chỉ xếp hạng 5–8 khách trong tuyến/khu vực; chưa cam kết tối ưu bản đồ | Tạm chốt |
| BR-ROUTE-005 | Ngoài tuyến | Chỉ đề xuất ngoại lệ nếu khách vẫn thuộc scope, cùng khu vực hợp lý và có lý do; không tự đưa vào tuyến chính | Tạm chốt |
| BR-TIER-001 | Tier | A/B/C chỉ biểu thị giá trị khách hàng và loại trừ nhau tại một thời điểm | Tạm chốt |
| BR-TIER-002 | Risk | `RiskLevel` là trường riêng `LOW/MEDIUM/HIGH`, không dùng C thay cho nguy cơ rời bỏ | Tạm chốt |
| BR-TIER-003 | VIP lâu chưa mua | Có thể là `Tier=A` đồng thời `RiskLevel=HIGH`; hiển thị cả hai | Tạm chốt |
| BR-TIER-004 | Ngưỡng | Mặc định toàn công ty, cho phép override theo miền/chi nhánh/kênh | Tạm chốt |
| BR-TIER-005 | Hiệu lực | Ngưỡng có version, `EffectiveFrom`, `EffectiveTo`, approver và lý do thay đổi | Tạm chốt |
| BR-PROGRAM-001 | Nguồn chương trình | Bản có cấu trúc và đã phê duyệt trong hệ thống là nguồn chính thức; PDF/ảnh/Excel chỉ là đầu vào | Tạm chốt |
| BR-PROGRAM-002 | Điều kiện dùng | AI chỉ dùng chương trình `APPROVED + ACTIVE` | **Cần ký nghiệp vụ** |
| BR-PROGRAM-003 | Chồng lấn | Ưu tiên khách hàng → nhóm/kênh → toàn công ty; chỉ cộng khi `Stackable=true`; nếu không, chọn phương án hợp lệ có lợi nhất | Tạm chốt |
| BR-PROGRAM-004 | Hết hạn | Chương trình hết hạn không xuất hiện trong gợi ý mới nhưng giữ lịch sử/audit | Tạm chốt |
| BR-ACTION-001 | Giỏ nháp | AI được chuẩn bị sản phẩm/số lượng/kho sau khi người dùng xác nhận; chưa tạo đơn | Tạm chốt |
| BR-ACTION-002 | Số lượng | AI được đề xuất số lượng tham khảo dựa trên lịch sử, chu kỳ, tồn khả dụng, quy cách và MOQ; người dùng được sửa | Tạm chốt |
| BR-ACTION-003 | Đơn thật | Chỉ người dùng xác nhận mới được gửi đơn; không tự tạo hóa đơn hoặc trừ tồn | **Cần ký quy trình** |
| BR-ACTION-004 | Chiết khấu | Chỉ hiển thị/đề xuất trong khung đã duyệt; không tự áp giá, tạo mức mới hoặc phát hành chương trình | **Cần ký tài chính** |
| BR-MED-001 | Nội dung y tế | OCR, triệu chứng, thay thế thuốc, kháng sinh, liều dùng, thai kỳ, trẻ em, dị ứng và bệnh nền phải có cảnh báo | **Cần ký chuyên môn** |
| BR-MED-002 | Người duyệt | Dược sĩ/bộ phận y khoa hoặc người được chỉ định bằng văn bản duyệt nội dung y tế | **Cần ký chuyên môn** |
| BR-MED-003 | Nguyên tắc trả lời | Không khẳng định chẩn đoán/kê đơn/thay thế thuốc khi chưa đủ dữ liệu; độ tin cậy thấp phải chuyển tư vấn chuyên môn | **Cần ký chuyên môn** |

## 2. Quy tắc hiển thị bắt buộc

Mọi đề xuất hoặc cảnh báo phải có:

- Mã/tên đối tượng và phạm vi áp dụng.
- Lý do xếp hạng hoặc cảnh báo.
- Khoảng thời gian dữ liệu.
- Thời điểm cập nhật tồn/chương trình.
- Nguồn dữ liệu hoặc phiên bản rule.
- Trạng thái `NO_DATA`, `OUT_OF_SCOPE`, `VALIDATION_ERROR` và `SYSTEM_ERROR` khác nhau.

## 3. Cấu hình và audit tối thiểu

Các bảng/cấu hình cần hỗ trợ version và hiệu lực:

- Ngưỡng Tier/Risk.
- Ngưỡng dữ liệu cũ.
- Mapping user–role–branch–warehouse.
- Chương trình và điều kiện áp dụng.
- Khung chiết khấu.
- Quy tắc fallback chu kỳ.

Audit phải truy được user, request ID, customer/product scope, rule version, thời điểm tính, kết quả đề xuất và hành động người dùng sau đó.

## 4. Bốn nhóm cần ký xác nhận trước production

1. Công thức doanh số, VAT, trả hàng và điều chỉnh giảm.
2. Phạm vi kho và mapping dữ liệu theo user/role/branch.
3. Khung chiết khấu và cấp phê duyệt.
4. Quy trình kiểm duyệt nội dung y tế/OCR/thay thế thuốc.

## 5. Ma trận baseline với hệ thống hiện tại

| Nhóm | Hiện trạng cần đối chiếu | Gap chính |
|---|---|---|
| Doanh số | Dashboard/API/SQL đang có luồng doanh số | Chưa khóa hóa đơn net, VAT, trả hàng/hủy theo rule v1 |
| Chu kỳ/gợi ý | `API_GoiYDonHang_AI` có lịch sử 6 tháng và fallback | Cần đối chiếu đủ điều kiện 3 lần mua, tồn khả dụng và độ tin cậy |
| Tồn kho | Có API tồn kho và phân quyền capability | Cần xác minh physical/available/reservation/updated-at |
| Tuyến | Có `@tuyen_ban_hang` và widget khách cần ghé | Cần tách check-in với mua hàng; không gọi là tối ưu đường đi |
| Chấm điểm | Có `@cham_diem_kh` | Cần tách Tier và Risk, đưa ngưỡng ra config |
| Tích lũy | Có `@tich_luy` | Cần khóa hóa đơn net, active/approved và xử lý trả/hủy |
| Chương trình | Có đề xuất khuyến mại/thông báo | Cần status workflow, version, approver và hết hạn |
| Hành động | Mutation bị giới hạn capability | Cần chuẩn hóa giỏ nháp/xác nhận trước đơn thật |
| Y tế | Có luồng tham khảo triệu chứng/RAG | OCR/thay thế thuốc và kiểm duyệt chuyên môn chưa đủ |

## 6. Trạng thái tài liệu

`BUSINESS_RULE_BASELINE_V1.md` là chuẩn đích tạm thời cho phân tích gap. Đây chưa phải biên bản khách hàng ký; các Rule có nhãn “Cần ký” không được dùng để thay đổi production hoặc tự động áp dụng quyết định tài chính/y tế.
