(function (root) {
  'use strict';

  function normalizeNote(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function generalPromotionText(note) {
    var text = normalizeNote(note);
    var khhdIndex = text.toUpperCase().indexOf('KHHD');
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
