# Business Rule Baseline v1 — Medstand

**Trạng thái:** `FROZEN_FOR_IMPLEMENTATION` — Baseline v1 đã đóng cho phạm vi source/mock/UAT, chưa phải phê duyệt production
**Phạm vi:** Gợi ý bán hàng, dashboard KPI, tuyến, chấm điểm, tích lũy, tồn kho, chương trình, hành động AI và nội dung y tế.  
**Nguyên tắc:** Không hardcode ngưỡng trong prompt/SQL; mọi ngưỡng phải có cấu hình, version, hiệu lực và người phê duyệt.

## 0. Bản ghi đóng Baseline v1

| Trường | Giá trị |
|---|---|
| `baselineVersion` | `1.0.0-draft` |
| `status` | `FROZEN_FOR_IMPLEMENTATION` |
| `freezeScope` | Source, mock fixture, static/contract test và UAT sandbox |
| `productionApproval` | `BLOCKED_PENDING_SIGNOFF` |
| `changeOwner` | Coordinator |
| `changePolicy` | Không tự đổi Rule ID, field, enum, công thức hoặc error code; tạo contract-change-request để Coordinator duyệt |

### Quyết định đã khóa cho triển khai

- **Doanh số Option C:** dùng `AR_OrderAndReturnView.TotalAmount`; doanh số đã xuất/giao lấy status `3,6,7,8` cộng trực tiếp return `99` đã mang dấu âm; không trừ return lần hai.
- **Doanh thu theo trạng thái:** `DoanhThuDaThu` dùng status `8` cộng return `99` ở mức draft. `isReceiptStatus=1` chưa tự chứng minh số tiền đã thu đủ hoặc thu một phần.
- **Tương thích:** giữ field `Doanh Số` cũ; field mới phải có `RevenueBasis`, `RevenueRecognition` và `RuleVersion`.
- **Sản phẩm:** tổng hợp theo `ItemID` từ dữ liệu view đã có detail, không join lại detail theo `DocumentID` đơn thuần và không dùng `DISTINCT` để che nhân dòng.

### Các điểm vẫn khóa triển khai production

- VAT/net/gross và công thức tài chính: `BUSINESS_SIGNOFF_REQUIRED`.
- Nguồn payment ledger để xác nhận status `8` là thu đủ hay thu một phần: `DB_RECONCILIATION_REQUIRED`.
- Warehouse scope, reservation/blocked/expired và mapping user: `PERMISSION_SIGNOFF_REQUIRED`.
- Chương trình `APPROVED + ACTIVE`, khung chiết khấu và quy trình gửi đơn thật: `BUSINESS_SIGNOFF_REQUIRED`.
- OCR/thay thế thuốc/cảnh báo y tế: `MEDICAL_SIGNOFF_REQUIRED`.

Các điểm trên không làm mở lại Baseline v1; chúng là gate trước runtime production. Chỉ Coordinator được mở phiên bản hoặc duyệt thay đổi.

> Đây là baseline đề xuất để đội dev triển khai. Bốn nhóm ảnh hưởng tài chính, phân quyền, chiết khấu và an toàn y tế vẫn cần người có thẩm quyền ký xác nhận trước khi chạy production.

## 1. Bảng quyết định phiên bản 1

| Rule ID | Nhóm | Quyết định v1 | Trạng thái |
|---|---|---|---|
| BR-SALES-001 | Doanh số | Doanh số chính thức dùng `AR_OrderAndReturnView.TotalAmount`; lấy status `3,6,7,8` và return `99` đã ký âm; không lấy đơn nháp/chờ duyệt/hủy | Đã khóa cho implementation; runtime DB còn gate |
| BR-SALES-002 | Trả/hủy | Return `99` được cộng theo dấu âm có sẵn đúng một lần; status hủy `10` và đơn chưa hoàn tất không tính; điều chỉnh giảm chưa có nguồn đã xác minh | Đã khóa cho implementation; adjustment còn gap |
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

`BUSINESS_RULE_BASELINE_V1.md` là chuẩn đích đã đóng ở mức `FROZEN_FOR_IMPLEMENTATION` cho source/mock/UAT. Đây chưa phải biên bản khách hàng ký và chưa được dùng để tự động áp dụng quyết định tài chính, chiết khấu hoặc y tế trên production. Muốn chuyển sang `APPROVED`, Coordinator phải nhận đủ sign-off, DB reconciliation, contract checksum và UAT evidence tương ứng.
