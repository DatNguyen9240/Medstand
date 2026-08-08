'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createManager } = require('../chatbot-widget/js/chatbot-order-draft.js');

function createStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    data
  };
}

let clock = Date.parse('2026-08-05T03:00:00Z');
let userId = 'QLBH013.MED';
let conversationId = 'conv-core009-a';
const storage = createStorage();
const manager = createManager({
  storage,
  now: () => clock,
  getUserId: () => userId,
  getConversationId: () => conversationId,
  ttlMs: 30 * 60 * 1000
});

const recommendations = [
  { MaKhachHang: 'DL011', TenKhachHang: 'Nhà thuốc Minh Anh', MaSanPham: 'A008', TenSanPham: 'Aquamed Plus', AvailableStock: 42, StoreHouseID: 'CTY', Unit: 'Hộp' },
  { MaKhachHang: 'DL011', TenKhachHang: 'Nhà thuốc Minh Anh', MaSanPham: 'A009', TenSanPham: 'Aquamed Kids', AvailableStock: 18, StoreHouseID: 'CTY', Unit: 'Hộp' },
  { MaKhachHang: 'DL011', TenKhachHang: 'Nhà thuốc Minh Anh', MaSanPham: 'V001', TenSanPham: 'Vitamin C', AvailableStock: 30, StoreHouseID: 'MB1', Unit: 'Hộp' }
];

manager.setRecommendations(recommendations);

const checks = [];
function check(name, fn) {
  fn();
  checks.push(name);
}

check('ADD_BY_VISIBLE_INDEX', () => {
  const result = manager.handleText('Lấy sản phẩm 1 số lượng 10');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.draft.customerId, 'DL011');
  assert.deepStrictEqual(result.draft.items.map((item) => [item.itemId, item.quantity]), [['A008', 10]]);
});

check('DOUBLE_CLICK_IDEMPOTENT', () => {
  const first = manager.addSuggestion({ customerId: 'DL011', customerName: 'Nhà thuốc Minh Anh', itemId: 'V001', itemName: 'Vitamin C', quantity: 5, availableStock: 30 });
  const second = manager.addSuggestion({ customerId: 'DL011', customerName: 'Nhà thuốc Minh Anh', itemId: 'V001', itemName: 'Vitamin C', quantity: 5, availableStock: 30 });
  assert.strictEqual(first.ok, true);
  assert.strictEqual(second.code, 'DUPLICATE_REPLAY');
  assert.strictEqual(manager.getDraft().items.filter((item) => item.itemId === 'V001').length, 1);
});

clock += 4000;
check('ADD_SETS_QUANTITY_NOT_INCREMENT', () => {
  const result = manager.handleText('Thêm Vitamin C 7 hộp');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.draft.items.find((item) => item.itemId === 'V001').quantity, 7);
});

clock += 4000;
check('UPDATE_QUANTITY_BY_NAME', () => {
  const result = manager.handleText('Đổi Aquamed Plus thành 20');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.draft.items.find((item) => item.itemId === 'A008').quantity, 20);
  assert.strictEqual(result.draft.pricingSnapshot, null);
});

check('AMBIGUOUS_NAME_DOES_NOT_MUTATE', () => {
  const before = JSON.stringify(manager.getDraft());
  const result = manager.handleText('Thêm Aquamed số lượng 2');
  assert.strictEqual(result.code, 'NEEDS_CLARIFICATION');
  assert.strictEqual(result.needsClarification, true);
  assert.strictEqual(JSON.stringify(manager.getDraft()), before);
});

check('MISSING_QUANTITY_ASKS_AGAIN', () => {
  const result = manager.handleText('Thêm sản phẩm 2');
  assert.strictEqual(result.code, 'NEEDS_CLARIFICATION');
  assert.strictEqual(result.needsClarification, true);
});

check('NON_POSITIVE_QUANTITY_REJECTED', () => {
  const result = manager.handleText('Thêm sản phẩm 2 số lượng 0');
  assert.strictEqual(result.code, 'INVALID_QUANTITY');
});

check('VISIBLE_STOCK_BOUND_REJECTED', () => {
  const result = manager.handleText('Thêm sản phẩm 2 số lượng 19');
  assert.strictEqual(result.code, 'INVALID_QUANTITY');
});

clock += 4000;
check('MULTI_ITEM_COMMAND', () => {
  const result = manager.handleText('Lấy sản phẩm 2 số lượng 3 và sản phẩm 3 số lượng 4');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.draft.items.find((item) => item.itemId === 'A009').quantity, 3);
  assert.strictEqual(result.draft.items.find((item) => item.itemId === 'V001').quantity, 4);
});

clock += 4000;
check('REMOVE_BY_ORDINAL_WORD', () => {
  const result = manager.handleText('Bỏ sản phẩm thứ hai');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.draft.items.some((item) => item.itemId === 'V001'), false);
});

check('SHOW_DRAFT_NO_MUTATION', () => {
  const beforeVersion = manager.getDraft().draftVersion;
  const result = manager.handleText('Đơn nháp hiện tại');
  assert.strictEqual(result.code, 'DRAFT_SHOWN');
  assert.strictEqual(manager.getDraft().draftVersion, beforeVersion);
});

check('PREVIEW_HANDOFF_CONTAINS_ONLY_DRAFT_INPUT', () => {
  const result = manager.handleText('Xem lại đơn');
  assert.strictEqual(result.action, 'OPEN_PREVIEW');
  assert.strictEqual(result.pendingUpdate.params['@ObjectID'], 'DL011');
  const item = result.pendingUpdate.items[0];
  assert.ok(item.ItemID);
  assert.ok(Number.isInteger(item.Quantity));
  assert.strictEqual(Object.prototype.hasOwnProperty.call(item, 'Price'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(item, 'StoreHouseID'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(item, 'DiscountPercent'), false);
});

check('CUSTOMER_CONTEXT_CONFLICT', () => {
  const result = manager.addSuggestion({ customerId: 'DL099', customerName: 'Khách khác', itemId: 'X001', itemName: 'Sản phẩm khác', quantity: 1, availableStock: 10 });
  assert.strictEqual(result.code, 'CUSTOMER_CONTEXT_CONFLICT');
  assert.strictEqual(manager.getDraft().customerId, 'DL011');
});

check('UNRELATED_TEXT_FALLS_THROUGH_TO_NLP', () => {
  const result = manager.handleText('Doanh số tháng này');
  assert.strictEqual(result.handled, false);
});

check('CREATE_ORDER_WITHOUT_DRAFT_FALLS_THROUGH', () => {
  conversationId = 'conv-no-draft';
  const result = manager.handleText('Tạo đơn hàng cho DL011');
  assert.strictEqual(result.handled, false);
  conversationId = 'conv-core009-a';
});

check('ACCOUNT_AND_CONVERSATION_ISOLATION', () => {
  const original = manager.getDraft();
  userId = 'QLBH005.MED';
  assert.strictEqual(manager.getDraft(), null);
  userId = 'QLBH013.MED';
  conversationId = 'conv-core009-b';
  assert.strictEqual(manager.getDraft(), null);
  conversationId = 'conv-core009-a';
  assert.strictEqual(manager.getDraft().draftId, original.draftId);
});

check('EXPIRED_DRAFT_IS_REMOVED', () => {
  conversationId = 'conv-expiry';
  manager.setRecommendations(recommendations);
  manager.handleText('Lấy sản phẩm 1 số lượng 1');
  clock += 31 * 60 * 1000;
  assert.strictEqual(manager.getDraft(), null);
  conversationId = 'conv-core009-a';
  clock = Date.parse('2026-08-05T03:05:00Z');
});

check('CREATED_ORDER_INVALIDATES_DRAFT', () => {
  assert.ok(manager.getDraft());
  const marked = manager.markCreated('DMB0826/9');
  assert.strictEqual(marked.documentId, 'DMB0826/9');
  assert.strictEqual(manager.getDraft(), null);
});

check('ACTION_HTML_ESCAPES_SQL_TEXT', () => {
  const html = manager.renderSuggestionAction({
    MaKhachHang: 'DL011" onclick="alert(1)',
    MaSanPham: 'A008',
    TenSanPham: '<Aquamed>',
    AvailableStock: 4
  });
  assert.ok(html.includes('&quot;'));
  assert.ok(html.includes('max="4"'));
  assert.ok(!html.includes('onclick="alert(1)'));
});

const workspace = path.resolve(__dirname, '..');
check('CHAT_TEXT_AND_BUTTON_SHARE_REDUCER', () => {
  const source = fs.readFileSync(path.join(workspace, 'chatbot-widget/js/chatbot.js'), 'utf8');
  assert.ok(source.includes('MedstandOrderDraft.handleText'));
  assert.ok(source.includes('MedstandOrderDraft.addSuggestion'));
  assert.ok(source.includes('_handleOrderDraftResult'));
});

check('ORDER_PREFILL_WAITS_FOR_CUSTOMER_AND_LOADS_SELECTED_ITEMS', () => {
  const source = fs.readFileSync(path.join(workspace, 'chatbot-widget/js/chatbot-api-engine.js'), 'utf8');
  const customerReady = source.indexOf('customerReady.then(function (customer)');
  const selectedItems = source.indexOf('return Promise.all(pre.items.map(function (item)', customerReady);
  const detailLoad = source.indexOf('return loadProductDetail(itemId);', selectedItems);
  assert.ok(customerReady > -1 && selectedItems > customerReady && detailLoad > selectedItems);
});

check('CREATE_ORDER_PREFILL_DOES_NOT_CLEAR_HYDRATED_PRODUCTS', () => {
  const source = fs.readFileSync(path.join(workspace, 'src/js/pages/create-order.js'), 'utf8');
  const customerChange = source.indexOf("orderForm.onListChange('customer'");
  const guardedReset = source.indexOf('if (!_chatbotOrderPrefillActive)', customerChange);
  const rowReset = source.indexOf("$('#dynamicProductRowsContainer').html('');", guardedReset);
  const prefillStart = source.indexOf('_chatbotOrderPrefillActive = true;');
  const customerPromise = source.indexOf('customerReady = Http.get', prefillStart);
  const productPromise = source.indexOf('productsReady = customerReady.then', customerPromise);
  const detailPromise = source.indexOf('return Promise.all(items.map', productPromise);
  const releaseGuard = source.indexOf('Promise.allSettled([customerReady, productsReady])', detailPromise);
  assert.ok(customerChange > -1 && guardedReset > customerChange && rowReset > guardedReset);
  assert.ok(prefillStart > -1 && customerPromise > prefillStart
    && productPromise > customerPromise && detailPromise > productPromise
    && releaseGuard > detailPromise);
});

check('ORDER_PRODUCT_PICKER_LOADS_SELLABLE_PRODUCTS', () => {
  const source = fs.readFileSync(path.join(workspace, 'chatbot-widget/js/chatbot-api-engine.js'), 'utf8');
  const comboStart = source.indexOf('function attachProductCombo');
  const comboEnd = source.indexOf('// ── Khách hàng', comboStart);
  const comboSource = source.slice(comboStart, comboEnd);
  assert.ok(comboStart > -1 && comboEnd > comboStart);
  assert.ok(comboSource.includes("'Đang tải danh sách sản phẩm...'"));
  assert.ok(!comboSource.includes('keyword.length < 2'));
  assert.ok(comboSource.includes('searchProducts(keyword)'));
  const searchStart = source.indexOf('function searchProducts(keyword)');
  const searchEnd = source.indexOf('function loadProductDetail', searchStart);
  const searchSource = source.slice(searchStart, searchEnd);
  assert.ok(searchSource.includes('API_CONFIG.ENDPOINTS.FILTER.PRODUCTS'));
  assert.ok(searchSource.includes("StockDataStatus || '') === 'AVAILABLE_FOR_SALE'"));
  assert.ok(!searchSource.includes('API_CONFIG.ENDPOINTS.AI.CATALOG'));
  assert.ok(searchSource.includes('Promise.race([productRequest, productTimeout])'));
});

check('CREATE_SUCCESS_INVALIDATES_SESSION_DRAFT', () => {
  const source = fs.readFileSync(path.join(workspace, 'src/js/pages/create-order.js'), 'utf8');
  const successGuard = source.indexOf('submitSucceeded = true;');
  const invalidate = source.indexOf('MedstandOrderDraft.markCreated(responseDocumentId)', successGuard);
  assert.ok(successGuard > -1 && invalidate > successGuard);
});

check('PRODUCTION_BUILD_INCLUDES_CORE009_MODULE', () => {
  const buildSource = fs.readFileSync(path.join(workspace, 'scripts/build.js'), 'utf8');
  const bundle = fs.readFileSync(path.join(workspace, 'chatbot-widget/js/chatbot.bundle.min.js'), 'utf8');
  assert.ok(buildSource.includes("'chatbot-widget/js/chatbot-order-draft.js'"));
  assert.ok(bundle.includes('medstand_order_draft_v1_'));
});

console.log(`CORE-009 order draft: PASS ${checks.length}/${checks.length}`);
checks.forEach((name) => console.log(`  ✓ ${name}`));
