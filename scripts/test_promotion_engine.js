const assert = require('assert');
const promotion = require('../src/js/utils/promotion.js');

function expect(note, quantity, discountPercent, giftQuantity, tierMinimum) {
  const result = promotion.calculate(note, quantity);
  assert.strictEqual(result.discountPercent, discountPercent, `${note} @ ${quantity}: discount`);
  assert.strictEqual(result.giftQuantity, giftQuantity, `${note} @ ${quantity}: gift`);
  assert.strictEqual(result.matchedTier ? result.matchedTier.minimumQuantity : null, tierMinimum, `${note} @ ${quantity}: tier`);
}

const base = 'Mua 10+2 (< 10h ck 7%), KHHD tặng hàng';
expect(base, 7, 7, 0, null);
expect(base, 9, 7, 0, null);
expect(base, 10, 0, 2, 10);
expect(base, 20, 0, 4, 10);
expect('mua 10 + 2 ( < 10 hộp chiết khấu bằng 8% )', 9, 8, 0, null);

const tiers = 'Mua 10+2, 30+8';
expect(tiers, 10, 0, 2, 10);
expect(tiers, 20, 0, 4, 10);
expect(tiers, 29, 0, 4, 10);
expect(tiers, 30, 0, 8, 30);
expect(tiers, 40, 0, 8, 30);
expect(tiers, 60, 0, 16, 30);
expect(tiers, 70, 0, 16, 30);

expect('KHHD 10+2, 30+8', 30, 0, 0, null);
expect('Nguyên giá, KHHD 10+2', 30, 0, 0, null);
expect('', 10, 0, 0, null);

console.log('Promotion engine: PASS');
