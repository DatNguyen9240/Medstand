(function (root) {
  'use strict';

  function normalizeNote(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  // Ghi chú khuyến mãi có hai vế, ngăn bởi "KHHĐ" (khách hàng hoá đơn):
  //   "Mua 10+2 (<10 ck 10%), KHHĐ 10+2, 30+8"
  //    └── luật chung ────┘         └── luật riêng cho KHHĐ ──┘
  // Chỉ vế TRƯỚC "KHHĐ" mới áp cho khách thường. Hàm này cắt bỏ vế sau.
  //
  // [Sửa 31/07/2026] Bản cũ dò bằng text.toUpperCase().indexOf('KHHD') — chữ D
  // THƯỜNG. Dữ liệu thật viết "KHHĐ" với chữ Đ CÓ GẠCH NGANG, mà 'Đ'.toUpperCase()
  // vẫn là 'Đ' chứ không thành 'D', nên indexOf luôn trả -1 và KHÔNG cắt gì cả.
  // Kiểm trên danh mục thật: 113/117 sản phẩm dùng "KHHĐ", 0 sản phẩm dùng "KHHD"
  // — tức đoạn cắt này chưa từng chạy đúng lần nào.
  //
  // Hậu quả không chỉ là thiếu quà, mà sai theo cả hai hướng:
  //   "Mua 10+1 (< 10h ck 5%), KHHĐ Nguyên giá"
  //      -> chữ "Nguyên giá" của vế KHHĐ tràn sang, ép pricingMode = full_price,
  //         mất sạch quà VÀ mất luôn chiết khấu 5% khi mua dưới mốc.
  //   "Mua 10+2 (<10 ck 10%, KHHĐ 10+2,30+8"
  //      -> mốc 30+8 của vế KHHĐ trộn vào luật chung: mua 30 tặng 8 (đúng ra 6),
  //         mua 50 tặng 8 (đúng ra 10).
  // Đối chiếu 117 sản phẩm x 8 mức số lượng: 171/936 trường hợp (18,3%) sai.
  //
  // Dùng lớp ký tự [ĐD] thay vì so chuỗi hoa để nhận cả hai cách viết. Cờ /i lo
  // phần chữ thường (đ).
  function generalPromotionText(note) {
    var text = normalizeNote(note);
    var khhdMatch = /KHH[ĐD]/i.exec(text);
    var khhdIndex = khhdMatch ? khhdMatch.index : -1;
    return (khhdIndex >= 0 ? text.slice(0, khhdIndex) : text).replace(/[;,\s]+$/, '').trim();
  }

  function parse(note) {
    var source = generalPromotionText(note);
    var tiers = [];
    var tierRegex = /(\d+)\s*\+\s*(\d+)/g;
    var match;

    while ((match = tierRegex.exec(source)) !== null) {
      var minimumQuantity = Number(match[1]);
      var giftQuantity = Number(match[2]);
      if (minimumQuantity > 0 && giftQuantity > 0) {
        tiers.push({ minimumQuantity: minimumQuantity, giftQuantity: giftQuantity });
      }
    }

    tiers.sort(function (a, b) { return b.minimumQuantity - a.minimumQuantity; });

    var discountMatch = source.match(/<\s*(\d+)\s*(?:h|hộp)?\s*(?:ck|chiết\s*khấu)\s*(?:bằng\s*)?(\d+(?:[.,]\d+)?)\s*%/i);
    var belowMinimumQuantity = discountMatch ? Number(discountMatch[1]) : null;
    var belowMinimumDiscountPercent = discountMatch
      ? Number(String(discountMatch[2]).replace(',', '.'))
      : null;

    return {
      source: source,
      buyTiers: tiers,
      belowMinimumQuantity: belowMinimumQuantity,
      belowMinimumDiscountPercent: belowMinimumDiscountPercent,
      pricingMode: /nguyên\s*giá/i.test(source) ? 'full_price' : (tiers.length ? 'gift' : 'standard'),
      deferredKhhd: /KHHD/i.test(String(note || ''))
    };
  }

  function calculate(noteOrRule, quantity) {
    var rule = typeof noteOrRule === 'string' ? parse(noteOrRule) : (noteOrRule || parse(''));
    var qty = Number(quantity);
    var result = {
      discountPercent: 0,
      giftQuantity: 0,
      matchedTier: null,
      rule: rule
    };

    if (!Number.isInteger(qty) || qty <= 0 || rule.pricingMode === 'full_price') return result;

    for (var i = 0; i < rule.buyTiers.length; i++) {
      var tier = rule.buyTiers[i];
      if (qty >= tier.minimumQuantity) {
        result.matchedTier = tier;
        result.giftQuantity = Math.floor(qty / tier.minimumQuantity) * tier.giftQuantity;
        return result;
      }
    }

    if (rule.belowMinimumQuantity !== null
      && qty < rule.belowMinimumQuantity
      && rule.belowMinimumDiscountPercent !== null) {
      result.discountPercent = rule.belowMinimumDiscountPercent;
    }

    return result;
  }

  // PROMO-CFG-001/002: CTBH cấu hình qua AI_PromotionProgramTbl được ưu tiên hơn note-text
  // khi có rule khớp mốc số lượng/giá trị hiện tại — cùng logic ưu tiên (Priority rồi tới
  // mốc cao nhất còn thoả mãn) mà API_DonHangChiTiet_Insert_AI dùng để tính giá thật phía
  // server. Trả về null khi không có rule nào khớp mốc hiện tại, để caller tự fallback về
  // note-text — khớp đúng hành vi server (server cũng rơi về note-text khi chưa đạt mốc).
  function calculateFromConfigRules(rules, quantity, unitPrice) {
    var qty = Number(quantity);
    var price = Number(unitPrice);
    if (!Array.isArray(rules) || !rules.length || !Number.isInteger(qty) || qty <= 0) return null;

    var lineAmount = Number.isFinite(price) ? qty * price : 0;
    var candidates = rules.filter(function (r) {
      if (r.RuleType === 'QUANTITY_DISCOUNT' || r.RuleType === 'QUANTITY_GIFT') {
        return r.MinimumQuantity != null && qty >= Number(r.MinimumQuantity)
          && (r.MaximumQuantity == null || qty <= Number(r.MaximumQuantity));
      }
      if (r.RuleType === 'AMOUNT_DISCOUNT' || r.RuleType === 'AMOUNT_GIFT') {
        return r.MinimumOrderAmount != null && lineAmount >= Number(r.MinimumOrderAmount)
          && (r.MaximumOrderAmount == null || lineAmount <= Number(r.MaximumOrderAmount));
      }
      return false;
    });
    if (!candidates.length) return null;

    // Tie-break phải khớp CHÍNH XÁC thứ tự ROW_NUMBER() trong API_DonHangChiTiet_Insert_AI
    // (Priority ASC, mốc cao nhất DESC, PromotionItemRuleID ASC) — nếu không, client có thể
    // xem trước một rule khác với rule server thực sự áp dụng khi hai rule trùng cả priority
    // lẫn mốc.
    candidates.sort(function (a, b) {
      var pa = Number(a.Priority != null ? a.Priority : 100);
      var pb = Number(b.Priority != null ? b.Priority : 100);
      if (pa !== pb) return pa - pb;
      var ta = Number(a.MinimumOrderAmount != null ? a.MinimumOrderAmount : a.MinimumQuantity);
      var tb = Number(b.MinimumOrderAmount != null ? b.MinimumOrderAmount : b.MinimumQuantity);
      if (ta !== tb) return tb - ta;
      var ida = Number(a.PromotionItemRuleID != null ? a.PromotionItemRuleID : Infinity);
      var idb = Number(b.PromotionItemRuleID != null ? b.PromotionItemRuleID : Infinity);
      return ida - idb;
    });

    var best = candidates[0];
    var result = {
      discountPercent: 0, giftQuantity: 0, giftItemID: '', giftItemName: '', matchedRule: best,
      benefitValueVND: 0, vatBasis: best.VatBasis || null,
      maxTotalBenefitAmountPerOrder: best.MaxTotalBenefitAmountPerOrder != null ? Number(best.MaxTotalBenefitAmountPerOrder) : null
    };
    if (best.RuleType === 'QUANTITY_GIFT') {
      result.giftQuantity = Math.floor(qty / Number(best.MinimumQuantity)) * Number(best.GiftQuantity || 0);
      result.giftItemID = best.GiftItemID || '';
      result.giftItemName = best.GiftItemName || '';
    } else if (best.RuleType === 'AMOUNT_GIFT') {
      result.giftQuantity = Number(best.GiftQuantity || 0);
      result.giftItemID = best.GiftItemID || '';
      result.giftItemName = best.GiftItemName || '';
    } else {
      result.discountPercent = Number(best.DiscountPercent || 0);
    }

    // PROMO-CFG-001 (quyết định 22/08/2026, mục 5): làm tròn XUỐNG (floor) tới VNĐ nguyên cho
    // mọi trị giá tiền quy đổi từ CTBH — nhất quán với floor() đã dùng cho tỷ lệ số lượng quà.
    if (result.giftQuantity > 0 && Number.isFinite(price)) {
      result.benefitValueVND = Math.floor(result.giftQuantity * price);
    } else if (result.discountPercent > 0 && Number.isFinite(price)) {
      result.benefitValueVND = Math.floor(lineAmount * result.discountPercent / 100);
    }

    // PROMO-CFG-001 (quyết định 22/08/2026, mục 6): rule khớp điều kiện nhưng lợi ích tính ra
    // = 0 (giftQuantity và discountPercent đều 0) → coi NHƯ CHƯA CÓ RULE NÀO KHỚP, trả về null
    // để caller tự fallback về note-text — khớp đúng hành vi server (mirror của SQL).
    if (result.giftQuantity <= 0 && result.discountPercent <= 0) return null;

    return result;
  }

  // PROMO-CFG-001 (quyết định 22/08/2026, mục 4 — trả hàng): mirror thuần JS của
  // dbo.AI_PromotionReturnClawbackFnc — KHÔNG trừ tỷ lệ độc lập trên phần trả, luôn tính lại
  // số quà đúng ra phải có từ số lượng CÒN GIỮ bằng công thức tỷ lệ + clamp gốc, rồi suy ra
  // phần cần thu hồi (không âm). Hàm thuần, sẵn sàng cho task tích hợp trả hàng sau này.
  function calculateReturnClawback(originalPurchasedQuantity, returnedQuantity, ruleMinimumQuantity, ruleGiftQuantity, ruleMaximumQuantity) {
    var original = Number(originalPurchasedQuantity) || 0;
    var returned = Number(returnedQuantity) || 0;
    var minQty = Number(ruleMinimumQuantity);
    var giftQty = Number(ruleGiftQuantity) || 0;
    var maxQty = ruleMaximumQuantity == null ? null : Number(ruleMaximumQuantity);

    if (!(minQty > 0)) {
      return { giftAlreadyGiven: 0, giftShouldRemain: 0, clawbackQuantity: 0, quantityRemaining: original - returned };
    }

    var cappedOriginal = maxQty != null && original > maxQty ? maxQty : original;
    var giftAlreadyGiven = Math.floor(cappedOriginal / minQty) * giftQty;

    var remaining = original - returned;
    if (remaining < 0) remaining = 0;
    var cappedRemaining = maxQty != null && remaining > maxQty ? maxQty : remaining;
    var giftShouldRemain = Math.floor(cappedRemaining / minQty) * giftQty;

    var clawback = giftAlreadyGiven - giftShouldRemain;
    if (clawback < 0) clawback = 0;

    return {
      giftAlreadyGiven: giftAlreadyGiven,
      giftShouldRemain: giftShouldRemain,
      clawbackQuantity: clawback,
      quantityRemaining: remaining
    };
  }

  var api = {
    parse: parse,
    calculate: calculate,
    generalPromotionText: generalPromotionText,
    calculateFromConfigRules: calculateFromConfigRules,
    calculateReturnClawback: calculateReturnClawback
  };

  root.MedstandPromotion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
