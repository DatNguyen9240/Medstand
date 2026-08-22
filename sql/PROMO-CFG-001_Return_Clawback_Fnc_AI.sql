SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  PROMO-CFG-001 (quyết định 22/08/2026, mục 4 — trả hàng):
  xem docs/PROMO-CFG-001_QUYET_DINH_NGHIEP_VU_AP_DUNG_2026-08-22.md

  Hàm THUẦN, không đọc/ghi bảng nào — dùng để một proc trả hàng (khi được xây dựng, ngoài
  phạm vi PROMO-CFG-001 vì repo AI-managed hiện chưa có proc trả hàng nào) gọi lại đúng công
  thức đã chốt.

  Nguyên tắc: KHÔNG trừ tỷ lệ độc lập trên phần hàng bị trả — luôn TÍNH LẠI số quà ĐÚNG RA
  phải có từ số lượng hàng CÒN GIỮ (sau khi trừ phần trả) bằng chính công thức tỷ lệ + clamp
  gốc (FLOOR(qty/min)*gift, clamp ở MaximumQuantity), rồi mới suy ra phần cần thu hồi = quà đã
  tặng trừ đi quà đúng ra còn được giữ, không bao giờ âm (không được ép khách trả thêm quà
  ngoài dự kiến khi công thức cho kết quả âm do làm tròn).
*/
CREATE OR ALTER FUNCTION dbo.AI_PromotionReturnClawbackFnc
(
    @OriginalPurchasedQuantity DECIMAL(18,2),  -- số lượng đã mua trước khi trả (dùng để suy ra quà đã tặng)
    @ReturnedQuantity          DECIMAL(18,2),   -- số lượng bị trả lần này
    @RuleMinimumQuantity       DECIMAL(18,2),   -- mốc mua tối thiểu của rule QUANTITY_GIFT đã áp
    @RuleGiftQuantity          DECIMAL(18,2),   -- số quà tặng mỗi lần đạt mốc
    @RuleMaximumQuantity       DECIMAL(18,2) = NULL -- clamp cận trên (NULL = không giới hạn)
)
RETURNS TABLE
AS
RETURN
(
    SELECT
        GiftAlreadyGiven,
        GiftShouldRemain,
        -- Không âm: nếu công thức ra âm (hiếm, do làm tròn ở biên), coi như không cần thu hồi gì thêm.
        CASE WHEN (GiftAlreadyGiven - GiftShouldRemain) > 0 THEN (GiftAlreadyGiven - GiftShouldRemain) ELSE 0 END AS ClawbackQuantity,
        QuantityRemaining
    FROM (
        SELECT
            FLOOR(
                CASE WHEN @RuleMaximumQuantity IS NOT NULL AND @OriginalPurchasedQuantity > @RuleMaximumQuantity
                     THEN @RuleMaximumQuantity ELSE @OriginalPurchasedQuantity END
                / NULLIF(@RuleMinimumQuantity, 0)
            ) * COALESCE(@RuleGiftQuantity, 0) AS GiftAlreadyGiven,
            (@OriginalPurchasedQuantity - COALESCE(@ReturnedQuantity, 0)) AS QuantityRemaining,
            FLOOR(
                CASE
                    WHEN @RuleMaximumQuantity IS NOT NULL
                         AND (@OriginalPurchasedQuantity - COALESCE(@ReturnedQuantity, 0)) > @RuleMaximumQuantity
                    THEN @RuleMaximumQuantity
                    WHEN (@OriginalPurchasedQuantity - COALESCE(@ReturnedQuantity, 0)) < 0
                    THEN 0
                    ELSE (@OriginalPurchasedQuantity - COALESCE(@ReturnedQuantity, 0))
                END
                / NULLIF(@RuleMinimumQuantity, 0)
            ) * COALESCE(@RuleGiftQuantity, 0) AS GiftShouldRemain
    ) X
);
GO
