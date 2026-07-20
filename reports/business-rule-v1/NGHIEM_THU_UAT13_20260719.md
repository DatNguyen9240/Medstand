# Nghiệm thu UAT 13 tài khoản — 19/07/2026

## Kết luận

**PASS — 13/13 tài khoản, 104/104 kiểm tra.**

Môi trường kiểm tra: frontend/gateway local, n8n runtime local đã publish và SQL Server `medtest`. Đây là runtime PASS cho phạm vi pilot read-only; chưa phải Business PASS hoặc production-final.

## Phạm vi kiểm tra trên mỗi tài khoản

1. Danh mục trả đúng 24 API read-only đang được duyệt.
2. Gợi ý đơn hàng trả dữ liệu fixture đúng khách và đúng chu kỳ.
3. Upsell bắt buộc có khách hàng và chỉ trả sản phẩm có số lượng có thể bán dương.
4. Gợi ý sản phẩm liên quan trả sản phẩm khác sản phẩm gốc.
5. Câu “Hôm nay em nên làm gì?” chạy ở `SHADOW`, chỉ dự đoán `@tuyen_ban_hang` và không tự gọi API; lệnh `@tuyen_ban_hang` riêng chạy tối đa 8 khách hoặc hướng dẫn an toàn khi không có dữ liệu.
6. Khách khác miền bị chặn, không lộ dòng dữ liệu.
7. `@lap_don_hang` chỉ trả giỏ `CART` xem trước, không ghi nghiệp vụ.

## Lỗi đã phát hiện và sửa

Lần chạy đầu có 2 ca fail: `QLMD1` và `QLBH024.MED` thuộc miền Nam nhưng hàm ERP `AR_GetObjectByUserFnc` vẫn trả khách `NDB001` thuộc miền Bắc. Vì procedure Upsell chỉ tin hàm ERP nên API đã trả 10 dòng ngoài miền.

Bản vá yêu cầu user không thuộc nhóm global phải đồng thời:

- có `BranchID` trùng với khách hàng; và
- khách nằm trong `AR_GetObjectByUserFnc(@Username)`.

Sau deploy, cả hai ca trả HTTP `403`, trạng thái `OUT_OF_SCOPE`, `count=0` và không có dữ liệu sản phẩm.

## Evidence

- Kết quả đầy đủ: `reports/business-rule-v1/uat13-acceptance-result.json`
- Ma trận 24 API × 13 tài khoản: `reports/uat-all-accounts-readonly.json` (`PASS` 13/13; có đăng nhập lại và retry một lần khi gặp 401 tạm thời).
- Runtime Upsell/n8n: `reports/business-rule-v1/upsell-customer-required-runtime.json`
- Snapshot và deploy SQL: `reports/business-rule-v1/upsell-scope-guard-deploy-20260719/deploy-result.json`
- Fixture có rollback: `reports/business-rule-v1/uat13-suggestion-fixture-manifest.json`

## Điểm chưa nghiệm thu

- Chưa có browser automation kết nối vào phiên trình duyệt của người dùng; trạng thái kiểm tra hình ảnh vẫn là `PENDING_BROWSER_CONNECTION`.
- Chưa triển khai production.
- Các phê duyệt tài chính, kho ERP, chương trình khuyến mãi và nội dung y khoa vẫn tách khỏi Technical PASS này.
