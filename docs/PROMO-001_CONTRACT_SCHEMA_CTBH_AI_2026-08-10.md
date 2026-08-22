# PROMO-001 — Contract schema và cách tính CTBH

**Contract tính quyền lợi:** `PROMOTION_BENEFIT_V2`  
**Cập nhật quyết định nghiệp vụ:** 22/08/2026  
**Trạng thái:** ký từng phần — `QUANTITY_GIFT` đã chốt; VAT, trả hàng và các rule theo giá trị/chiết khấu chưa chốt.

## 1. Biên giới dữ liệu

Các bảng `AI_Promotion*` là lớp cấu hình shadow có version, phạm vi chi nhánh/nhóm người dùng và trạng thái duyệt riêng. Không `ALTER` bảng CTBH ERP và không ghi vào bảng `AR_*`.

Dữ liệu import hoặc bản `DRAFT` không được mặc định xem là chương trình đã duyệt. Chỉ version có trạng thái `APPROVED`, còn hiệu lực theo UTC và đúng scope mới được đưa vào tính đơn.

## 2. Contract `QUANTITY_GIFT`

Với rule mua `X` tặng `Y`:

- `MinimumQuantity = X`: lượng mua cơ sở của tỷ lệ.
- `GiftQuantity = Y`: lượng quà tương ứng với lượng mua cơ sở.
- `MaximumQuantity`: trần lượng mua được dùng để tính quà; `NULL` nghĩa là không có trần.
- Kết quả quà là số nguyên không âm, làm tròn xuống.

Công thức chuẩn dùng chung cho frontend và SQL:

```text
EligibleQuantity = MaximumQuantity IS NULL
    ? ActualQuantity
    : MIN(ActualQuantity, MaximumQuantity)

GrantedGiftQuantity = FLOOR(
    EligibleQuantity × GiftQuantity / MinimumQuantity
)
```

Rule chỉ được xem là đã áp khi `GrantedGiftQuantity >= 1`. Trường hợp kết quả bằng `0` giữ nguyên hành vi fallback hiện hữu; điểm này chưa phải sign-off cho chính sách fallback tổng quát.

## 3. Ví dụ đã ký

### Gói mua 10 tặng 2

| Lượng mua | Quà |
| ---: | ---: |
| 4 | 0 |
| 5 | 1 |
| 9 | 1 |
| 10 | 2 |
| 15 | 3 |
| 20 | 4 |

### Chặn trần tại 80

Với tỷ lệ mua 10 tặng 1 và `MaximumQuantity = 80`:

| Lượng mua | Lượng dùng tính quà | Quà |
| ---: | ---: | ---: |
| 80 | 80 | 8 |
| 100 | 80 | 8 |
| 150 | 80 | 8 |

Vượt `MaximumQuantity` không làm rule mất hiệu lực, không chuyển sang note-text và không nhân quyền lợi trên phần vượt trần.

## 4. Chọn rule

Giữ nguyên thứ tự quyết định hiện hành:

1. `Priority ASC`.
2. Mốc cao nhất phù hợp `DESC`.
3. `PromotionItemRuleID ASC` để tie-break ổn định.

Frontend chỉ nhận version `PROMOTION_BENEFIT_V2` khi API có trả version. Server cũ chưa có trường version được chấp nhận tạm thời để phục vụ thứ tự deploy; version lạ không được tự suy diễn công thức.

## 5. Ngoài phạm vi sign-off lần này

Không được suy rộng công thức `QUANTITY_GIFT` sang các nội dung sau nếu chưa có quyết định business riêng:

- `QUANTITY_DISCOUNT`.
- `AMOUNT_DISCOUNT` và `AMOUNT_GIFT`.
- `MaximumOrderAmount`.
- Giá trị trước/sau VAT hoặc trước/sau chiết khấu.
- Làm tròn tiền.
- Trả hàng và việc thu hồi quyền lợi đã cấp.
- Quà khác SKU; hệ thống hiện tiếp tục chặn theo guard đang có.

## 6. Version chương trình và version công thức

- `ProgramVersion` xác định version nội dung của từng chương trình.
- `PROMOTION_BENEFIT_V2` xác định semantics tính quyền lợi dùng chung giữa API, frontend và SQL.

Hai loại version không thay thế nhau. Thay đổi công thức phải tăng contract tính quyền lợi; chỉnh nội dung một chương trình phải tạo `ProgramVersion` mới theo workflow quản trị.

## 7. Bằng chứng kỹ thuật ngày 22/08/2026

`node scripts/verify_promo_cfg001_fixes.js` chạy trên `medtest` trong một transaction và rollback sạch, PASS 6 nhóm:

1. Frontend tính đúng ma trận `4/5/9/10/15/20` cho gói `10+2` và từ chối contract version lạ.
2. SQL candidate tính đúng tỷ lệ `10+2`.
3. SQL giữ rule cấu hình và clamp `80→8`, `100→8`.
4. Semantics `QUANTITY_DISCOUNT` chưa ký không bị thay đổi.
5. Tie-break theo `PromotionItemRuleID` ổn định.
6. Quà khác SKU tiếp tục bị chặn.

Các preflight: schema/contract `23/23`, admin `17/17`, catalog `12/12`. Chưa deploy source mới lên `medtest` và chưa coi kết quả CTE rollback là E2E tạo đơn thật.
