(function (root) {
  'use strict';

  var CONTRACT_VERSION = 'PROMOTION_BENEFIT_V3';

  function emptyConfigResult(errorCode) {
    return {
      contractVersion: CONTRACT_VERSION,
      configAuthoritative: true,
      blocked: Boolean(errorCode),
      errorCode: errorCode || '',
      discountPercent: 0,
      giftQuantity: 0,
      giftItemID: '',
      giftItemName: '',
      matchedRule: null
    };
  }

  function calculateLineAmounts(quantity, unitPrice, discountPercent) {
    var qty = Number(quantity);
    var price = Number(unitPrice);
    var percent = Number(discountPercent || 0);
    if (!Number.isFinite(qty) || !Number.isFinite(price) || !Number.isFinite(percent)) {
      return { grossAmount: 0, discountAmount: 0, totalAmount: 0 };
    }
    var grossAmount = qty * price;
    var discountAmount = Math.round(grossAmount * percent / 100);
    return {
      grossAmount: grossAmount,
      discountAmount: discountAmount,
      totalAmount: grossAmount - discountAmount
    };
  }

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

    // Server cũ chưa trả version vẫn được đọc để tránh làm gãy UAT theo thứ tự deploy.
    // Version có mặt nhưng khác contract hiện hành thì không tự đoán công thức.
    var hasUnknownVersion = rules.some(function (r) {
      var version = String(r.PromotionBenefitContractVersion || '');
      return version && version !== CONTRACT_VERSION;
    });
    if (hasUnknownVersion) return emptyConfigResult('UNSUPPORTED_PROMOTION_CONTRACT');

    function parseOptNum(val) {
      if (val == null || val === '') return null;
      var n = Number(val);
      return Number.isFinite(n) ? n : null;
    }

    var lineAmount = Number.isFinite(price) ? qty * price : 0;
    var candidates = rules.filter(function (r) {
      if (r.RuleType === 'QUANTITY_DISCOUNT') {
        var minQ = parseOptNum(r.MinimumQuantity);
        var maxQ = parseOptNum(r.MaximumQuantity);
        return minQ != null && qty >= minQ && (maxQ == null || qty <= maxQ);
      }
      if (r.RuleType === 'QUANTITY_GIFT') {
        var purchaseBase = parseOptNum(r.MinimumQuantity) || 0;
        var giftBase = parseOptNum(r.GiftQuantity) || 0;
        var maxQ = parseOptNum(r.MaximumQuantity);
        var eligibleQty = maxQ != null ? Math.min(qty, maxQ) : qty;
        return purchaseBase > 0 && giftBase > 0
          && Math.floor(eligibleQty * giftBase / purchaseBase) >= 1;
      }
      if (r.RuleType === 'AMOUNT_DISCOUNT' || r.RuleType === 'AMOUNT_GIFT') {
        var minA = parseOptNum(r.MinimumOrderAmount);
        var maxA = parseOptNum(r.MaximumOrderAmount);
        return minA != null && lineAmount >= minA && (maxA == null || lineAmount <= maxA);
      }
      return false;
    });
    if (!candidates.length) return emptyConfigResult('');

    // Tie-break phải khớp CHÍNH XÁC thứ tự ROW_NUMBER() trong API_DonHangChiTiet_Insert_AI
    // (Priority ASC, mốc cao nhất DESC, PromotionItemRuleID ASC) — nếu không, client có thể
    // xem trước một rule khác với rule server thực sự áp dụng khi hai rule trùng cả priority
    // lẫn mốc.
    candidates.sort(function (a, b) {
      var pa = Number(a.Priority != null && a.Priority !== '' ? a.Priority : 100);
      var pb = Number(b.Priority != null && b.Priority !== '' ? b.Priority : 100);
      if (pa !== pb) return pa - pb;
      var ta = Number(a.MinimumOrderAmount != null && a.MinimumOrderAmount !== '' ? a.MinimumOrderAmount : a.MinimumQuantity);
      var tb = Number(b.MinimumOrderAmount != null && b.MinimumOrderAmount !== '' ? b.MinimumOrderAmount : b.MinimumQuantity);
      if (ta !== tb) return tb - ta;
      var ida = Number(a.PromotionItemRuleID != null && a.PromotionItemRuleID !== '' ? a.PromotionItemRuleID : Infinity);
      var idb = Number(b.PromotionItemRuleID != null && b.PromotionItemRuleID !== '' ? b.PromotionItemRuleID : Infinity);
      return ida - idb;
    });

    var best = candidates[0];
    var result = {
      contractVersion: CONTRACT_VERSION,
      configAuthoritative: true,
      blocked: false,
      errorCode: '',
      discountPercent: 0,
      giftQuantity: 0,
      giftItemID: '',
      giftItemName: '',
      matchedRule: best
    };
    if (best.RuleType === 'QUANTITY_GIFT') {
      var maxQty = parseOptNum(best.MaximumQuantity);
      var eligibleQuantity = maxQty != null ? Math.min(qty, maxQty) : qty;
      result.giftQuantity = Math.floor(
        eligibleQuantity * Number(best.GiftQuantity || 0) / Number(best.MinimumQuantity)
      );
      result.giftItemID = best.GiftItemID || '';
      result.giftItemName = best.GiftItemName || '';
    } else if (best.RuleType === 'AMOUNT_GIFT') {
      result.giftQuantity = Number(best.GiftQuantity || 0);
      result.giftItemID = best.GiftItemID || '';
      result.giftItemName = best.GiftItemName || '';
    } else {
      result.discountPercent = Number(best.DiscountPercent || 0);
    }
    return result;
  }

  var api = {
    CONTRACT_VERSION: CONTRACT_VERSION,
    parse: parse,
    calculate: calculate,
    generalPromotionText: generalPromotionText,
    calculateFromConfigRules: calculateFromConfigRules,
    calculateLineAmounts: calculateLineAmounts
  };

  root.MedstandPromotion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
