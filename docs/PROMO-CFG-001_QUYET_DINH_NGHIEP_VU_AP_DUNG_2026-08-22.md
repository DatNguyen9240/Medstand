# PROMO-CFG-001 — Quyết định nghiệp vụ áp dụng cho 6 điểm còn mở

**Quyết định áp dụng theo ủy quyền chủ dự án ngày 22/08/2026 — không phải business
sign-off chính thức, business có thể đảo lại sau; dùng làm cơ sở triển khai hiện tại.**

## 0. Đối chiếu với thực tế code trước khi quyết định

Trước khi viết tài liệu này, đã đọc lại toàn bộ:
`sql/PROMO-001_Promotion_Schema_AI.sql`, `sql/PROMO-002_Active_Promotion_By_User_AI.sql`,
`sql/PROMO-CFG-001_Promotion_Program_Admin_AI.sql`, `sql/PROMO-CFG-002_Active_Promotion_By_Items_AI.sql`,
`sql/Module common - API_DonHangChiTiet_Insert_AI.sql`, `src/js/utils/promotion.js`,
`src/js/pages/promotion-admin.js`, `scripts/verify_promo_cfg001_fixes.js`.

**Ghi chú minh bạch:** brief giao việc có nhắc tới tên `PROMOTION_BENEFIT_V2` và file
`docs/PROMO-001_CONTRACT_SCHEMA_CTBH_AI_2026-08-10.md` như đã tồn tại/đã chốt. Hai tên đó
KHÔNG tồn tại trong worktree này (`grep` toàn repo không ra kết quả, `docs/` không có file
đó). Tuy nhiên **hành vi** được mô tả (tỷ lệ mua/tặng bằng `FLOOR(qty/min)*gift`, clamp cứng
ở `MaximumQuantity`, không âm thầm bỏ rule — vượt max thì rơi về note-text ERP cũ chứ không
chặn hẳn) **đã có thật** trong code, tại `API_DonHangChiTiet_Insert_AI` dòng 428-478 (có
comment "QUYẾT ĐỊNH NGHIỆP VỤ (đã chốt với business)") và `promotion.js` hàm
`calculateFromConfigRules`. Vì vậy phần này được giữ nguyên, không đụng vào — 6 điểm dưới
đây là phần **thật sự còn mở**, đối chiếu đúng với "Điểm phải chốt với business" trong
`docs/BackLogSuaTheoYCKhachHang.md` mục PROMO-CFG-001/PROMO-CFG-003.

## 1. VAT

**Câu hỏi:** Giá dùng để tính % giảm giá/giá trị quà là trước hay sau VAT? Quà tặng có
chịu VAT riêng không?

**Ràng buộc thực tế:** `UnitPrice` trong toàn bộ pipeline tạo đơn (`AR_LayGiaSanPhamFnc`)
là hàm ERP legacy nằm ngoài schema do AI quản lý — không có cột thuế riêng, không tách giá
trước/sau thuế ở tầng dữ liệu AI đang sửa. Quà tặng đã tồn tại từ trước theo cơ chế
`UnitPrice = 0` (xem CTE `LegacyGift` trong `API_DonHangChiTiet_Insert_AI`).

**Ví dụ minh họa:**
1. Mua 10 hộp x 100.000đ (giá đã gồm VAT theo quy ước bán lẻ hiện tại) = 1.000.000đ. Rule
   `QUANTITY_GIFT` mốc 10 tặng 2 → tặng 2 hộp giá 0đ. VAT phát sinh trên 2 hộp tặng = 0đ vì
   giá dòng tặng = 0đ — không phát sinh nghĩa vụ thuế bổ sung ngoài dự kiến.
2. Mua 5 hộp x 50.000đ = 250.000đ (đã gồm VAT). Rule giảm 7% → giảm 17.500đ tính trên đúng
   giá đã gồm VAT đang hiển thị, không tính lại trên giá tạm tính trước thuế nào khác.
3. Nếu tương lai một sản phẩm có giá nhập trước thuế khác giá bán đã gồm thuế, % giảm/tặng
   vẫn áp trên `UnitPrice` — giá bán thực tế khách nhìn thấy — không áp trên giá vốn.

**Mặc định chọn:** `VatBasis = INCLUSIVE_UNIT_PRICE_NO_GIFT_VAT` — toàn bộ tính CTBH (giảm
%, tỷ lệ quà) áp trên `UnitPrice` sẵn có (được coi là giá đã gồm VAT theo quy ước bán lẻ
hiện hành của hệ thống); hàng tặng ghi giá 0đ nên không phát sinh VAT riêng cho phần tặng.
**Lý do:** đây là hành vi ĐANG CHẠY thật (quà legacy `UnitPrice=0` đã vận hành), không đổi
gì về thuế — chỉ đặt tên tường minh cho hành vi ngầm định đang có, lưu vào cấu hình để không
còn là giả định ẩn. Cột `VatBasis` được thêm vào schema (không hard-code trong proc) và có
`CHECK` để chặn giá trị lạ — nếu sau này cần basis khác (vd trước thuế), phải mở rộng có chủ
đích, không tự trôi.

## 2. Tương tác chiết khấu/giá trị (chiết khấu vs hàng tặng, 2 rule cùng lúc)

**Câu hỏi:** Nếu 2 rule cùng khớp một dòng/đơn (vd vừa giảm % vừa tặng hàng), có cộng dồn
không?

**Thực tế đã có:** `ConfigCandidate` trong `API_DonHangChiTiet_Insert_AI` dùng
`ROW_NUMBER() OVER (PARTITION BY ItemID ORDER BY Priority ASC, mốc cao nhất DESC,
PromotionItemRuleID ASC)` rồi chỉ lấy `TierRank = 1` — nghĩa là **đã EXCLUSIVE theo thiết
kế**: mỗi `ItemID` trong đơn chỉ có đúng 1 rule thắng, không cộng dồn giữa các chương trình
khác nhau. Đây không phải điểm mở thật sự về mặt tie-break (đã chốt), nhưng có một lỗ hổng
data-entry chưa chặn: **trong CÙNG một chương trình**, người quản lý có thể vô tình khai 2
rule cho cùng `ItemID` với khoảng số lượng/giá trị chồng nhau (vd rule A: SL 5-10 giảm 7%,
rule B: SL 8-15 tặng 1) — tie-break vẫn chọn được 1 rule (nhờ `PromotionItemRuleID ASC`),
nhưng người tạo cấu hình không hề được cảnh báo là đã khai chồng chéo, dễ nhầm rule nào thật
sự có hiệu lực khi xem lại.

**Ví dụ minh họa:**
1. Rule A (SL 5-10, giảm 7%) và Rule B (SL 8-15, tặng 1) cùng `ItemID` X, cùng
   `PromotionProgramID`. Khách mua SL=9 → cả 2 rule đều khớp khoảng. Hệ thống hiện tại vẫn
   chọn được rule có `PromotionItemRuleID` nhỏ hơn, nhưng đây là hành vi "may mắn thắng",
   không phải chủ đích của người tạo cấu hình.
2. Rule A (SL 5-10) và Rule B (SL 11-20) cùng `ItemID` X — KHÔNG chồng nhau → hợp lệ, không
   bị chặn.
3. Rule A (Giá trị dòng 500k-1tr, giảm 5%) và Rule B (Giá trị dòng 800k-2tr, tặng 1) cùng
   `ItemID` Y → chồng ở khoảng 800k-1tr → bị chặn khi lưu.

**Mặc định chọn:** Giữ nguyên EXCLUSIVE giữa các chương trình khác nhau (không đổi, đã đúng
theo tie-break hiện có). Thêm chặn MỚI ở `API_PromotionProgram_Upsert_AI`: từ chối lưu (fail
closed, giống cách chặn quà khác SKU) nếu trong cùng một lần lưu có 2 rule cùng `ItemID`,
cùng nhóm loại (`QUANTITY_*` hoặc `AMOUNT_*`) mà khoảng `[Minimum, Maximum]` chồng nhau.
**Lý do:** giữ đúng tinh thần "không âm thầm bỏ rule/không mơ hồ" của pattern đã khóa —
chặn sớm lúc lưu rẻ hơn nhiều so với để tie-break ngầm quyết định thay người cấu hình.

## 3. `MaximumOrderAmount` — tương tác cấp đơn hàng

**Câu hỏi:** `MaximumOrderAmount` hiện có (per-rule, per-dòng) có cần thêm một mức trần cấp
TOÀN ĐƠN không?

**Thực tế đã có:** cột `MaximumOrderAmount` trên `AI_PromotionItemRuleTbl` đã được comment
rõ là "giá trị của DÒNG sản phẩm này ... không phải tổng giá trị đơn hàng" — đây là giới hạn
per-line, không phải per-order. Chưa có cơ chế giới hạn tổng giá trị KHUYẾN MÃI (không phải
tổng giá trị đơn) toàn đơn hàng cho một chương trình.

**Ví dụ minh họa (giả định chương trình X có `MaxTotalBenefitAmountPerOrder = 500.000đ`):**
1. Đơn có 2 dòng cùng dùng chương trình X: dòng A được tặng trị giá 300.000đ, dòng B (xử lý
   sau, `ItemID` xếp sau theo thứ tự alphabet) được tính tặng trị giá 400.000đ. Tổng cộng dồn
   = 700.000đ > 500.000đ → dòng B (dòng làm tổng vượt trần) bị từ chối áp rule của chương
   trình X cho lần tính này, rơi về note-text như không có cấu hình (nhất quán với cách xử lý
   vượt `MaximumQuantity`/`MaximumOrderAmount` per-line đã có). Dòng A vẫn giữ nguyên 300.000đ.
2. Đơn có 2 dòng, dòng A trị giá 200.000đ, dòng B trị giá 250.000đ — tổng 450.000đ ≤ 500.000đ
   → cả 2 dòng đều được hưởng đầy đủ, không bị cắt.
3. Chương trình Y không khai `MaxTotalBenefitAmountPerOrder` (NULL) → không giới hạn cấp đơn,
   hành vi y hệt hiện tại (không đổi gì cho các chương trình cũ chưa khai).

**Mặc định chọn:** Thêm cột mới `MaxTotalBenefitAmountPerOrder` (nullable, cấp
`PromotionProgramID`, không phải cấp rule) — khi NULL (mặc định cho toàn bộ chương trình cũ
đang chạy) hành vi không đổi. Khi có giá trị, tính tổng trị giá lợi ích (`GiftQuantity *
UnitPrice` hoặc `LineAmount * DiscountPercent/100`, làm tròn theo mục 5) theo thứ tự `ItemID`
tăng dần trong CÙNG một đơn hàng, dòng nào làm tổng vượt trần thì dòng đó (toàn bộ dòng, không
cắt một phần đơn vị hàng tặng) rơi về không có cấu hình. **Lý do:** cắt "cả dòng" thay vì cắt
lẻ đơn vị tránh tình huống tặng nửa hộp/giảm giá phân số vô nghĩa về nghiệp vụ; giữ nguyên
triết lý "vượt trần → rơi về note-text, không chặn cả CTBH" đã áp dụng nhất quán ở mục
`MaximumQuantity`.

## 4. Trả hàng (`trả hàng`)

**Câu hỏi:** Khi một dòng đã hưởng CTBH bị trả hàng (một phần hoặc toàn bộ), quà/giảm giá đi
kèm xử lý ra sao?

**Ràng buộc thực tế:** repo AI-managed hiện KHÔNG có proc trả hàng nào (`grep` toàn bộ
`sql/` không ra `TraHang`/`ReturnOrder`) — luồng trả hàng nằm hoàn toàn trong ERP legacy,
ngoài phạm vi các bảng `AI_*`. Vì vậy không thể (và không nên) viết một proc trả hàng giả để
gọi là "đã tích hợp" — sẽ là bằng chứng giả.

**Ví dụ minh họa (tỷ lệ mua/tặng 10+2, `MaximumQuantity=80`):**
1. Mua 50 hộp → tặng `FLOOR(50/10)*2 = 10` hộp. Trả lại 20 hộp (còn giữ 30) → thu hồi tương
   ứng `FLOOR(20/10)*2 = 4` hộp quà (không phải thu hồi toàn bộ 10 hộp quà ban đầu).
2. Mua 50 hộp (tặng 10), trả lại 45 hộp (gần như trả hết, còn giữ 5) → thu hồi
   `FLOOR(45/10)*2 = 8` hộp quà, clamp không vượt quá số quà gốc đã tặng (10) → thu hồi 8,
   còn giữ lại đúng 2 quà tương ứng phần hàng còn giữ (khớp `FLOOR(5/10)*2=0`... thực tế công
   thức đối xứng: quà còn lại = FLOOR(hàng còn giữ/10)*2 = 0, tức phải thu hồi hết 10, không
   phải 8 — xem chú thích công thức đúng bên dưới).
3. Rule khác dùng tỷ lệ 10+1 (mua 10 tặng 1), `MaximumQuantity=80` (đúng ví dụ gốc "80→8" đã
   nêu ở phần giao việc — LƯU Ý: với tỷ lệ 10+2 ở ví dụ 1/2 thì clamp 80 sẽ cho 16, không phải
   8; hai tỷ lệ khác nhau cho kết quả clamp khác nhau, không nhầm lẫn hai rule làm một). Mua
   100 hộp, bị clamp ở `MaximumQuantity=80` → chỉ tính trên 80 → tặng `FLOOR(80/10)*1=8` hộp.
   Trả lại 30 hộp (còn giữ 70, vẫn ≤ 80, chưa chạm clamp) → quà đúng ra còn được giữ =
   `FLOOR(70/10)*1=7` → thu hồi `8-7=1` hộp.

   *(Công thức dùng để tính: số quà ĐÚNG RA phải có, tính lại từ số lượng hàng CÒN GIỮ sau khi
   trừ hàng trả, dùng đúng công thức tỷ lệ + clamp gốc — KHÔNG tính "clawback" như một phép trừ
   tỷ lệ độc lập trên riêng phần hàng trả. `GiftShouldRemain = FLOOR(MIN(QtyRemaining,
   MaximumQuantity) / MinimumQuantity) * GiftQuantity`. Số quà cần thu hồi = `GiftAlreadyGiven
   - GiftShouldRemain`, không âm (nếu ra âm thì = 0, không được ép khách trả thêm quà ngoài
   dự kiến).)*

**Mặc định chọn:** `ReturnBehavior = RECOMPUTE_FROM_REMAINING_QTY` — khi trả hàng, KHÔNG dùng
phép trừ tỷ lệ độc lập; tính lại số quà ĐÚNG RA phải có từ số lượng hàng CÒN GIỮ (sau trả)
bằng đúng công thức tỷ lệ + clamp gốc (mục đã khóa), rồi thu hồi phần chênh lệch
(`GiftAlreadyGiven − GiftShouldRemain`, không âm). Cung cấp sẵn hàm SQL/JS thuần
(`AI_PromotionReturnClawbackFnc` / `calculateReturnClawback`) implement đúng công thức này,
có unit test độc lập bằng rollback — nhưng CHƯA gắn vào một proc trả hàng thật vì proc đó
chưa tồn tại trong phạm vi AI quản lý. **Lý do:** "tính lại từ số lượng còn giữ" luôn nhất
quán với công thức gốc trong mọi trường hợp biên (kể cả khi đã bị clamp ở `MaximumQuantity`),
trong khi "trừ tỷ lệ trên phần trả" có thể sai khi có clamp (như ví dụ 3 minh họa). Việc nối
hàm này vào proc trả hàng thật là việc của task tích hợp trả hàng sau này (ngoài phạm vi
PROMO-CFG-001).

## 5. Làm tròn tiền (`làm tròn tiền`)

**Câu hỏi:** Khi lợi ích tính ra không phải số nguyên (vd giảm % ra số tiền lẻ), làm tròn thế
nào?

**Thực tế đã có:** số lượng quà tặng theo tỷ lệ đã dùng `FLOOR(qty/min)*gift` — tức đã LÀM
TRÒN XUỐNG (không bao giờ tặng dư). Chưa có quy tắc làm tròn cho GIÁ TRỊ TIỀN (khi
`DiscountPercent` áp lên `LineAmount` ra số lẻ, hoặc khi cần quy đổi lợi ích ra VNĐ để so với
trần `MaxTotalBenefitAmountPerOrder` ở mục 3).

**Ví dụ minh họa:**
1. `LineAmount = 333.333đ`, giảm 7% = 23.333,31đ → làm tròn xuống VNĐ = 23.333đ (không phải
   23.334đ).
2. `LineAmount = 100.000đ`, giảm 12,5% = 12.500đ → số nguyên sẵn, không đổi.
3. Quy đổi trị giá quà: `GiftQuantity=3`, `UnitPrice=45.500đ` → `136.500đ`, số nguyên VNĐ sẵn
   (quà luôn nguyên đơn vị nên trị giá luôn là bội số nguyên của đơn giá, không phát sinh số
   lẻ ở bước này).

**Mặc định chọn:** làm tròn XUỐNG (`FLOOR`) tới đơn vị VNĐ nguyên (không số thập phân), áp
dụng thống nhất cho MỌI giá trị tiền tệ suy ra từ CTBH (giá trị giảm giá quy đổi, trị giá quà
dùng để so trần đơn hàng ở mục 3). **Lý do:** nhất quán tuyệt đối với quy tắc đã khóa cho số
lượng quà (`FLOOR`, không bao giờ vượt phần khách thực sự được hưởng) — một hệ thống làm
tròn duy nhất, không có trường hợp làm tròn lên ở chỗ này mà làm tròn xuống ở chỗ khác, tránh
sai lệch khó audit. Đây là quy tắc CỐ ĐỊNH toàn hệ thống (không đưa thành cột cấu hình per
program) — cùng logic với việc `FLOOR` tỷ lệ quà hiện đã là hành vi cứng, không cấu hình
được.

## 6. Fallback khi lợi ích tính ra = 0

**Câu hỏi:** Khi rule cấu hình khớp điều kiện (số lượng/giá trị nằm trong `[Min, Max]`) nhưng
công thức tỷ lệ+clamp cho kết quả lợi ích = 0 (vd `GiftQuantity` tính ra 0 vì số lượng mua
chưa đủ 1 bội số của `MinimumQuantity` dù đã ≥ `MinimumQuantity` do dữ liệu cấu hình bất
thường, hoặc `DiscountPercent` khai = 0), hệ thống làm gì?

**Ví dụ minh họa:**
1. Rule `QUANTITY_GIFT`: `MinimumQuantity=10`, `GiftQuantity=2`. Khách mua SL=10 →
   `FLOOR(10/10)*2=2` > 0, bình thường, không rơi vào ca này.
2. Rule cấu hình sai (lỗi nhập liệu hiếm gặp): `MinimumQuantity=10`, nhưng do một rule khác
   cùng chương trình có `MinimumQuantity` lớn hơn thắng tie-break trước, giả sử qua một đường
   khác `GiftQuantity` tính ra đúng 0 (vd nhân với hệ số 0 ở bước mở rộng sau này) — item vẫn
   nằm trong khoảng `[Min,Max]` (`HasConfigRule` đáng lẽ =1) nhưng lợi ích thực = 0.
3. Rule `QUANTITY_DISCOUNT` có `DiscountPercent` khai = 0 (hợp lệ theo constraint hiện tại vì
   `CK_AI_PromotionItemRule_Discount` yêu cầu `DiscountPercent > 0`... thực ra bị chặn ở
   schema — ca này chỉ có thể xảy ra qua đường tính toán phái sinh, không qua nhập liệu trực
   tiếp).

**Mặc định chọn:** `ZeroBenefitFallback = TREAT_AS_UNMATCHED` (cố định toàn hệ thống, không
cấu hình theo chương trình) — khi lợi ích tính ra = 0 dù rule đã khớp điều kiện, hệ thống coi
NHƯ CHƯA CÓ RULE NÀO KHỚP (`HasConfigRule` giữ = 0), item rơi về nhánh note-text cũ y hệt
trường hợp vượt `Maximum`. KHÔNG chặn đơn (block), KHÔNG âm thầm bỏ qua mà vẫn hiển thị "đã
áp CTBH" (silent skip kiểu đánh lừa UI), cũng không cần thông báo lỗi riêng (explicit message)
vì đây không phải lỗi — chỉ là "không có gì để áp cả". **Lý do:** nhất quán 100% với quyết
định đã khóa cho trường hợp vượt Maximum (cùng một cơ chế fallback, không tạo thêm nhánh xử
lý mới) — giảm thiểu số lượng trạng thái hệ thống phải test và giữ đúng triết lý "không âm
thầm bỏ rule/không mơ hồ": item luôn có MỘT nguồn CTBH rõ ràng (config HOẶC note-text), không
bao giờ "không có gì" một cách khó hiểu với người bán hàng.

## Tổng kết bảng quyết định

| # | Điểm mở | Mặc định chọn | Cấu hình hay cố định |
|---|---|---|---|
| 1 | VAT | `VatBasis=INCLUSIVE_UNIT_PRICE_NO_GIFT_VAT` — tính trên giá đã gồm VAT hiện có; quà giá 0đ không phát sinh VAT riêng | Cột cấu hình mới (`CHECK` giới hạn giá trị hợp lệ) |
| 2 | Chiết khấu/giá trị | Exclusive giữa chương trình (đã có); chặn MỚI: từ chối lưu nếu 2 rule cùng `ItemID` trong cùng chương trình có khoảng chồng nhau | Validation cố định lúc lưu (Upsert) |
| 3 | `MaximumOrderAmount` cấp đơn | `MaxTotalBenefitAmountPerOrder` (nullable, cấp chương trình); vượt trần → dòng gây vượt rơi về note-text, không chặn cả CTBH | Cột cấu hình mới, NULL = không đổi hành vi cũ |
| 4 | Trả hàng | `RECOMPUTE_FROM_REMAINING_QTY` — tính lại quà đúng ra phải có từ số lượng còn giữ bằng công thức gốc, thu hồi phần chênh lệch (không âm) | Hàm thuần cố định, sẵn sàng cho task tích hợp trả hàng sau |
| 5 | Làm tròn | `FLOOR` xuống VNĐ nguyên, áp dụng mọi giá trị tiền suy ra từ CTBH | Cố định toàn hệ thống, không cấu hình theo chương trình |
| 6 | Lợi ích = 0 | `TREAT_AS_UNMATCHED` — coi như chưa khớp rule, rơi về note-text, không chặn không lừa dối UI | Cố định toàn hệ thống, đồng bộ với cách xử lý vượt Maximum đã khóa |
