# PROMO-CFG-001 — Contract tính CTBH V3

**Contract quyền lợi:** `PROMOTION_BENEFIT_V3`  
**Ngày chốt:** 22/08/2026  
**Trạng thái:** contract đầy đủ; code frontend/API/SQL đã đồng bộ, còn deploy đồng thời và E2E trước khi đóng task.

## 1. Nguồn dữ liệu và phạm vi

- Chỉ chương trình `APPROVED`, còn hiệu lực theo UTC và đúng chi nhánh/nhóm người dùng mới tham gia tính đơn.
- Rule áp theo từng dòng sản phẩm trả tiền (`ItemID`), không theo tổng đơn.
- Mỗi dòng chỉ nhận một rule thắng; không cộng dồn nhiều rule.
- Thứ tự chọn: `Priority ASC`, ngưỡng phù hợp cao nhất `DESC`, `PromotionItemRuleID ASC`.
- Giá và số lượng dùng để kiểm tra là giá/số lượng server đã đối soát, không tin giá trị tự khai từ trình duyệt.
- Quà khác SKU chưa nằm trong contract này và tiếp tục bị chặn khi lưu cấu hình.

## 2. Giá trị dùng xét ngưỡng

```text
LineAmount = ActualQuantity × AuthoritativeUnitPrice
```

`LineAmount` là giá trị dòng hàng trước chiết khấu CTBH và trước VAT. Hàng tặng giá 0, hàng trả và dòng âm không được cộng vào ngưỡng. Quy trình trả hàng không tính lại hoặc tự thu hồi quyền lợi của đơn gốc; nghiệp vụ thu hồi quyền lợi phải có contract riêng.

## 3. Công thức từng loại rule

### `QUANTITY_GIFT`

Với gói mua `X` tặng `Y`:

```text
EligibleQuantity = MaximumQuantity IS NULL
    ? ActualQuantity
    : MIN(ActualQuantity, MaximumQuantity)

GrantedGiftQuantity = FLOOR(EligibleQuantity × Y / X)
```

`MaximumQuantity` là trần quyền lợi, không phải lý do loại rule. Ví dụ mua 10 tặng 1, max 80: mua 80 hoặc 100 đều chỉ tặng 8.

### `QUANTITY_DISCOUNT`

Rule hợp lệ khi `ActualQuantity >= MinimumQuantity` và, nếu có max, `ActualQuantity <= MaximumQuantity`. Khi hợp lệ, áp `DiscountPercent` cho toàn bộ dòng. Vượt max thì rule này không hợp lệ vì schema hiện tại không biểu diễn được việc chỉ giảm giá một phần số lượng.

### `AMOUNT_DISCOUNT`

Rule hợp lệ khi `LineAmount >= MinimumOrderAmount` và, nếu có max, `LineAmount <= MaximumOrderAmount`. Khi hợp lệ, áp `DiscountPercent` cho toàn bộ dòng. `MaximumOrderAmount` là cận trên của khoảng, không phải trần tiền được giảm.

### `AMOUNT_GIFT`

Rule dùng cùng khoảng `MinimumOrderAmount`/`MaximumOrderAmount`. Khi hợp lệ, tặng đúng `GiftQuantity`; không nhân theo số lần vượt ngưỡng.

### `INFORMATION`

Chỉ hiển thị thông tin, không tự tạo chiết khấu hoặc hàng tặng.

## 4. Làm tròn

- Số lượng quà: luôn `FLOOR` về số nguyên.
- `DiscountPercent`: giữ tối đa 2 chữ số thập phân theo schema.
- `GrossAmount = Quantity × UnitPrice`.
- `DiscountAmount = ROUND(GrossAmount × DiscountPercent / 100, 0)`.
- `TotalAmount = GrossAmount - DiscountAmount`.
- Frontend và SQL làm tròn đến 1 đồng theo cùng công thức; không làm tròn trung gian trước khi tính chiết khấu.

Ví dụ: 999 đồng, giảm 2,5% → tiền giảm 25 đồng, thành tiền 974 đồng.

## 5. Fallback và version

- Nếu sản phẩm hoàn toàn không có config active: được dùng parser ghi chú ERP cũ để tương thích chuyển đổi.
- Nếu đã có config active nhưng chưa đạt ngưỡng hoặc quyền lợi tính ra 0: kết quả là 0, không fallback về ghi chú.
- Version lạ: frontend fail-closed, không áp quyền lợi, không fallback và chặn gửi đơn với mã `UNSUPPORTED_PROMOTION_CONTRACT`.
- `ProgramVersion` là version nội dung từng chương trình; `PROMOTION_BENEFIT_V3` là version công thức toàn hệ thống. Hai version độc lập.

## 6. Bảng ví dụ nghiệm thu

| Rule | Dữ liệu | Kết quả |
| --- | --- | --- |
| Mua 10 tặng 2 | SL 4 / 5 / 10 / 15 | Quà 0 / 1 / 2 / 3 |
| Mua 10 tặng 1, max 80 | SL 80 / 100 | Quà 8 / 8 |
| SL 5–10 giảm 7% | SL 7 / 12 | 7% / không áp |
| Giá trị 1.000–1.500 giảm 10% | 10 × 100 / 16 × 100 | 10% / không áp |
| Giá trị từ 1.000 tặng 2 | 10 × 100 / 20 × 100 | Quà 2 / 2 |
| Có config 10+2 nhưng mua 4 | Ghi chú ERP có khuyến mãi khác | 0, không fallback |
| 999 đồng giảm 2,5% | Tiền giảm / thành tiền | 25 / 974 |

## 7. Điều kiện triển khai và đóng task

1. Merge toàn bộ frontend, API version và SQL trong cùng release.
2. Deploy SQL trước hoặc trong cùng maintenance window; không để frontend V3 chạy lâu với API V2.
3. Build lại bundle.
4. Chạy verifier contract/regression trong transaction rollback.
5. E2E tạo đơn thật cho: quà tỷ lệ, clamp max, giảm theo số lượng, giảm theo giá trị, config chưa đạt ngưỡng và version mismatch; đối soát `AR_OrderDetailTbl`, request ID và audit.
