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

// ── Hồi quy 31/07/2026: chữ Đ có gạch ngang ────────────────────────────────
// Mọi ca ở trên đều viết "KHHD" bằng chữ D THƯỜNG — đúng thứ mã cũ chờ đợi, nên
// test xanh trong khi thực tế hỏng. Danh mục thật viết "KHHĐ": 113/117 sản phẩm
// dùng chữ Đ, 0 sản phẩm dùng D thường. Vì vậy các ca dưới đây BẮT BUỘC dùng Đ,
// lấy nguyên văn ghi chú từ CF_ItemTbl.
const KHHD_D = 'Mua 10+2 (< 10h ck 7%), KHHĐ tặng hàng';
expect(KHHD_D, 9, 7, 0, null);
expect(KHHD_D, 10, 0, 2, 10);

// M021/M002 trên medtest. Vế "Nguyên giá" thuộc KHHĐ, KHÔNG được áp cho khách
// thường — nếu tràn sang sẽ ép full_price, mất cả quà lẫn chiết khấu dưới mốc.
const nguyenGia = 'Mua 10+1 (< 10h ck 5%), KHHĐ Nguyên giá';
expect(nguyenGia, 5, 5, 0, null);
expect(nguyenGia, 10, 0, 1, 10);
expect(nguyenGia, 30, 0, 3, 10);

// A008 trên medtest. Mốc 30+8 thuộc vế KHHĐ, không được trộn vào luật chung:
// mua 30 phải tặng 6 (theo mốc 10+2), không phải 8.
const tronMoc = 'Mua 10+2 (<10 ck 10%, KHHĐ 10+2,30+8';
expect(tronMoc, 30, 0, 6, 10);
expect(tronMoc, 50, 0, 10, 10);

// Chữ đ thường cũng phải cắt được.
expect('Mua 10+2, khhđ Nguyên giá', 10, 0, 2, 10);

console.log('Promotion engine: PASS');
