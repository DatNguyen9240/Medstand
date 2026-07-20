# Kế hoạch test P0 — 1 Manager và 1 Sale

**Phạm vi:** pilot chỉ đọc trên `medtest`, không ghi dữ liệu nghiệp vụ thật.

**Tài khoản pilot:**

- Manager: `QLBH013.MED`.
- Sale: `NAMDINHB.MED`.
- Mật khẩu chỉ đặt trong `.env.uat.local`, không ghi vào tài liệu hoặc báo cáo.

## 1. Điều kiện trước khi test

- Ba procedure P0 đã compile trên `medtest`: `API_GoiYDonHang_AI`, `API_ChamDiemKH_AI`, `API_CongNoChiTiet_AI`.
- Workflow `API_Execute` và `MAIN_ChatBot_V5` đã publish đúng source hiện tại.
- Frontend đã build lại và hiện cảnh báo “Chatbot sử dụng AI và có thể sai sót”.
- Gateway chỉ cho 24 API đọc; `@lap_don_hang` chỉ dựng giỏ xem trước; mutation khác trả `PILOT_READ_ONLY` trước khi chạy SQL.

## 2. Bộ test chung cho cả hai tài khoản

| Mã | Cách test | Kết quả phải đạt |
|---|---|---|
| P0-01 | Mở chatbot | Cảnh báo AI nằm ngay dưới ô nhập, đọc được trên desktop/mobile |
| P0-02 | Gõ câu tự nhiên tương ứng một API trong danh sách 24 API | Shadow chỉ trả dự đoán chức năng, không gọi API/SQL; hướng dẫn người dùng chọn `@`/menu |
| P0-03 | Gõ câu tự nhiên yêu cầu một chức năng ngoài 24 API | Không gọi SQL, không tự mở rộng allowlist |
| P0-04 | Gõ câu tự nhiên yêu cầu tạo/sửa dữ liệu | Không ghi dữ liệu; Shadow/allowlist chặn trước khi mutation |
| P0-05 | Gõ trực tiếp `@lap_don_hang` với khách/sản phẩm test | Chỉ hiện giỏ xem trước; không sinh đơn thật |
| P0-06 | Tra khách/sản phẩm có dưới 3 hóa đơn hợp lệ | `ChuKyNgay=NULL`, `ConLaiNgay=NULL`, lý do có `INSUFFICIENT_HISTORY`; không xuất hiện chu kỳ 30 ngày |
| P0-07 | Tra công nợ có phát sinh giảm nhưng còn dư nợ | Hiện “Thanh toán một phần” và đồng thời hiện trạng thái hạn nợ nếu có |
| P0-08 | Tra chấm điểm khách | Tier A/B/C dựa trên Frequency + Monetary; Recency chỉ làm thay đổi Risk |

## 3. Test riêng Manager — `QLBH013.MED`

1. Mở danh sách 24 API và xác nhận không có API mutation trong menu tra cứu.
2. Chạy doanh số tổng quan, công nợ tổng quan, Tier/Risk và tuyến bán hàng trong phạm vi manager.
3. Chọn một khách của `NAMDINHB.MED`, đối chiếu manager nhìn được dữ liệu tổng quan và sale phụ trách.
4. Thử chọn chi nhánh ngoài phạm vi được cấp: phải fail-closed hoặc `OUT_OF_SCOPE`.
5. Thử mutation có quyền cao: gateway vẫn trả `PILOT_READ_ONLY`, chứng minh pilot không ghi thật kể cả tài khoản manager.

## 4. Test riêng Sale — `NAMDINHB.MED`

1. Chạy danh sách khách, công nợ, gợi ý đơn hàng, upsell và tuyến của chính sale.
2. Xác nhận chỉ thấy khách được `AR_GetObjectByUserFnc` cấp cho sale.
3. Thử mã khách ngoài phạm vi sale: phải trả `OUT_OF_SCOPE`, không rò tên/số tiền.
4. Kiểm tra khách mới/dưới 3 hóa đơn vẫn xuất hiện để chăm sóc nhưng không bị gắn “sắp mua lại” bằng chu kỳ giả.
5. Dùng `@lap_don_hang` dựng giỏ, đóng/mở lại và kiểm tra ERP không phát sinh chứng từ mới.

## 5. Thứ tự chạy và tiêu chí PASS

1. Chạy static contract và build ở local.
2. Deploy ba procedure lên `medtest`, chạy smoke read-only.
3. Publish hai workflow n8n, đối chiếu checksum/source-active.
4. Test Manager trước, rồi Sale.
5. So sánh số chứng từ trước/sau pilot; phải không đổi do chatbot.

Pilot chỉ được đánh dấu `P0_PILOT_PASS` khi cả hai tài khoản đạt toàn bộ mục bắt buộc, không có cross-scope leak, không có mutation thật và không còn chu kỳ 30 ngày cho khách dưới 3 hóa đơn. Kết quả này chưa thay thế phê duyệt kế toán/ERP cho VAT, thu tiền và tồn khả dụng.

## 6. Trạng thái chuẩn bị ngày 18/07/2026

- `medtest`: ba procedure P0 đã deploy trong transaction, definition sau deploy đã đối chiếu marker và SHA-256.
- n8n: source khớp active version; gateway có đúng 24 API đọc, mutation ghi thật trả `PILOT_READ_ONLY`.
- Manager `QLBH013.MED`: 24/24 API đọc PASS; 3/3 mutation ghi thật bị chặn; `@lap_don_hang` preview PASS.
- Sale `NAMDINHB.MED`: 24/24 API đọc PASS; 3/3 mutation ghi thật bị chặn; `@lap_don_hang` preview PASS.
- Runtime business fixture cho cả hai tài khoản: khách dưới 3 hóa đơn không có chu kỳ giả; Tier/Risk đúng contract; khoản trả một phần trả `PARTIALLY_PAID`.
- Frontend build PASS; bước người dùng còn lại là UAT bằng mắt trên desktop/mobile và xác nhận câu chữ/độ dễ hiểu.

Evidence:

- `reports/business-rule-v1/p0-two-account-runtime.json`.
- `reports/uat-readonly-QLBH013.MED.json` và `reports/uat-readonly-NAMDINHB.MED.json`.
- `reports/uat-preview-QLBH013.MED.json` và `reports/uat-preview-NAMDINHB.MED.json`.
- `reports/business-rule-v1/p0-deploy-20260718/` và `reports/business-rule-v1/p0-n8n-cart-envelope-publish-20260718/`.

## 7. Vấn đề UX ghi nhận để sửa sau UAT

### UX-P1-01 — Form tham số của lệnh chat hiện chậm

- Ghi nhận ngày 18/07/2026 khi chọn `#cong_no_chi_tiet` trên local.
- Hiện tượng: người dùng phải chờ khá lâu mới thấy form gồm `Khách hàng` và `Đến ngày`.
- Mong đợi: khung và nhãn tham số phải hiện gần như ngay sau khi chọn lệnh. Nếu dữ liệu danh sách phải tải bất đồng bộ, từng trường hiển thị loading/skeleton riêng; không trì hoãn toàn bộ form và không khóa ô chat.
- Phạm vi kiểm tra sau khi sửa: các lệnh có form tham số trên desktop/mobile, đặc biệt các trường khách hàng, sản phẩm và khoảng ngày.
- Trạng thái: `RECORDED_NOT_FIXED`; chưa kết luận nguyên nhân cho tới khi có số đo latency.

## 8. UAT phân vai khuyến mãi — ngày 19/07/2026

### Manager — `QLBH013.MED`

1. Refresh cứng trang local (`Ctrl+F5`) rồi mở chatbot.
2. Gõ `@de_xuat_khuyen_mai` hoặc chọn **Sản phẩm cần xem xét khuyến mãi**.
3. Kết quả phải có tiêu đề **Sản phẩm cần xem xét khuyến mãi**.
4. Mỗi sản phẩm phải có lý do rõ ràng: cận hạn, 30 ngày chưa bán hoặc tồn cao/bán chậm.
5. Kết quả phải ghi **Chỉ tham khảo, cần phê duyệt** và không được tự đưa ra phần trăm giảm giá.
6. Tồn kho phải lấy trong phạm vi kho của Manager; cột **Có thể bán** dùng tồn dương chưa hết hạn theo quyết định tạm thời hiện tại.

### Sale — `NAMDINHB.MED`

1. Refresh cứng trang local (`Ctrl+F5`) rồi mở chatbot.
2. Menu phải ghi **Khuyến mãi công ty**, không ghi **Sản phẩm cần xem xét khuyến mãi**.
3. Sale không được nhìn thấy danh sách đề xuất AI dành cho Manager/Admin.
4. Do `medtest` chưa có cột/bảng approval được owner ERP xác nhận, kết quả hiện tại phải là không có dữ liệu thay vì hiển thị nhầm chương trình chưa duyệt.
5. Sau khi owner ERP xác nhận nguồn `APPROVED_ACTIVE`, Sale mới được hiển thị các chương trình công ty đang còn hiệu lực.

### Tiêu chí bắt buộc

- Manager và Sale không còn nhận cùng một result set.
- Không có mức giảm giá do AI tự tạo.
- Không tự áp giá, tạo chương trình hoặc ghi dữ liệu nghiệp vụ.
- Không coi `isDisable=0` và ngày hiệu lực là bằng chứng đã được phê duyệt.

## 9. UAT bán kèm bắt buộc theo khách hàng — ngày 19/07/2026

Áp dụng cho cả Manager `QLBH013.MED` và Sale `NAMDINHB.MED`:

1. Chọn **Gợi ý bán kèm (Upsell)** nhưng chưa chọn khách hàng: form phải báo bắt buộc chọn khách; không được gửi yêu cầu và không được hiện danh sách sản phẩm chung.
2. Nếu gọi `@upsell_goi_y` qua gateway mà thiếu `@MaKhachHang`: API phải trả `VALIDATION_ERROR`, `count=0` và không có danh sách sản phẩm. SQL có lớp chặn dự phòng `MISSING_CUSTOMER` nếu bị gọi trực tiếp.
3. Chọn một khách hàng trong danh sách được cấp cho tài khoản: API được chạy và kết quả phải là gợi ý gắn với khách hàng đó.
4. Thử nhập mã khách ngoài phạm vi tài khoản: phải bị từ chối, không được lộ tên, doanh số hay lịch sử mua của khách.
5. Đổi sang khách hàng khác rồi chạy lại: nội dung yêu cầu phải chứa đúng khách vừa chọn, không giữ mã khách của lần trước.

Tiêu chí bắt buộc: `@upsell_goi_y` không còn chế độ trả danh sách bán chạy/sản phẩm trọng tâm chung khi thiếu khách hàng.

## 10. UAT số lượng có thể bán — ngày 19/07/2026

Áp dụng cho Manager `QLBH013.MED` và Sale `NAMDINHB.MED` sau khi nhấn `Ctrl+F5`:

1. Chạy `@danh_sach_tonkho`: cột phải có nhãn **Có thể bán** và hiển thị số, không lặp câu “Chưa xác minh để bán”.
2. Dòng còn tồn dương, chưa hết hạn: **Có thể bán** phải bằng tồn của đúng kho được phân quyền.
3. Dòng hết hạn hoặc tồn âm: **Có thể bán** phải bằng `0`; không được gợi ý chốt bán.
4. Chạy `@upsell_goi_y` với một khách hợp lệ: chỉ trả sản phẩm có **Có thể bán > 0**.
5. Sale không được thấy kho ngoài phạm vi; Manager chỉ thấy kho của mình và nhân viên trực thuộc.

Runtime `medtest` đã pass cho cả hai tài khoản: 628 dòng tồn, 473 dòng bán được, 3/3 kho trả về nằm trong scope và 10 kết quả Upsell đều có số bán dương. Evidence: `reports/business-rule-v1/sellable-stock-runtime.json`.

## 11. Mock data gợi ý cho 13 tài khoản UAT — ngày 19/07/2026

Batch `U13S1_` chỉ thêm hóa đơn mock trên `medtest` cho khách đã được ERP cấp vào phạm vi của 13 tài khoản UAT. Dữ liệu gồm ba mốc lịch sử cách nhau 30 ngày và một hóa đơn có ngày đúng ngày chạy fixture (19/07/2026). Batch không sửa khách hàng, tài khoản, sản phẩm hay số tồn hiện hữu; không tạo giao dịch kho. Mọi chứng từ đều có `UserCreate=AI_UAT13_FIXTURE` và memo bắt đầu bằng `[UAT13-SUG-V1]` để nhận diện và rollback.

| Nhóm tài khoản | Khách test | Sản phẩm gốc để test mua kèm |
|---|---|---|
| `QLBH013.MED`, `NAMDINHB.MED` | `NDB001` | `B015` |
| `QLBH016.MED`, `BACNINHA.MED` | `BNA051` | `B015` |
| `QLBH005.MED`, `HUEB.MED` | `HUEA043` | `Q002` |
| `QLBH010.MED`, `DANANGA.MED` | `QANA002` | `Q002` |
| `QLMN2`, `CanThoA` | `DL012` | `Q002` |
| `QLMD1`, `BinhPhuocA` | `SGNB0001` | `Q002` |
| `QLBH024.MED` | `AG0020` | `Q002` |

Với mỗi dòng trên, chạy ba ca sau:

1. **Gợi ý đơn hàng**: chọn đúng mã khách. Hai sản phẩm lịch sử chính phải đủ 3 hóa đơn hoàn tất để tính chu kỳ cá nhân. Sản phẩm nằm trong hóa đơn hôm nay bị loại khỏi gợi ý theo quy tắc “đã mua hôm nay”.
2. **Gợi ý bán kèm (Upsell)**: chọn đúng mã khách. Kết quả phải khác `NO_DATA`, chỉ gồm sản phẩm có số lượng có thể bán dương. Hàng trọng tâm công ty có thể đứng trên hàng khách quen theo thứ tự ưu tiên hiện hành.
3. **Gợi ý sản phẩm liên quan**: chọn mã sản phẩm gốc ở cột cuối. Kết quả phải trả sản phẩm khác sản phẩm gốc và dựa trên lịch sử cùng hóa đơn trong scope tài khoản.

Kết quả runtime sau khi nạp:

- 28 hóa đơn mock, 56 dòng chi tiết; mỗi nhóm có một hóa đơn ngày 19/07/2026.
- 13/13 tài khoản gọi trực tiếp ba procedure đều PASS.
- 13/13 ca gợi ý đơn hàng trả 2 dòng sau khi loại món đã mua hôm nay; 13/13 ca Upsell trả 10 dòng có tồn bán dương; 13/13 ca sản phẩm liên quan trả 2–3 dòng.
- `IV_StockTransactionTbl`: 0 dòng phát sinh cho batch.
- Trigger ERP tạo 56 dòng sổ giao dịch gắn đúng DocumentID của batch; rollback sẽ xoá đúng các dòng này.

Lệnh quản trị:

```powershell
# Xem trước kế hoạch nạp, không ghi dữ liệu
node scripts/deploy_uat13_suggestion_fixture_medtest.js

# Nạp fixture và tự rollback nếu bất kỳ verification nào lỗi
node scripts/deploy_uat13_suggestion_fixture_medtest.js --apply

# Thay nguyên tử batch đã có bằng phiên bản mới nhất đến ngày hiện tại
node scripts/deploy_uat13_suggestion_fixture_medtest.js --apply --replace

# Xem trước số dòng sẽ xoá, không xoá
node scripts/rollback_uat13_suggestion_fixture_medtest.js

# Xoá sạch đúng batch U13S1_
node scripts/rollback_uat13_suggestion_fixture_medtest.js --apply
```

Evidence: `reports/business-rule-v1/uat13-suggestion-fixture-manifest.json` và `reports/business-rule-v1/uat13-fixture-safety-discovery.json`.
