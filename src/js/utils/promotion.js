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

  var api = {
    parse: parse,
    calculate: calculate,
    generalPromotionText: generalPromotionText
  };

  root.MedstandPromotion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
