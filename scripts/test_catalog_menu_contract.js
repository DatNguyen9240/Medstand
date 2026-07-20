'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'chatbot-widget', 'js', 'chatbot-renderers-medstand.js'), 'utf8');
const chatbotSource = fs.readFileSync(path.join(root, 'chatbot-widget', 'js', 'chatbot.js'), 'utf8');
let nextId = 0;
const api = {
  __internal: {},
  helpers: {
    nextId() { return ++nextId; },
    esc(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },
    fmtCellVal(value) { return String(value ?? ''); },
    isValidPhone() { return false; }
  },
  registerRenderer() {}
};

const context = { window: { ApiChatbot: api }, ApiChatbot: api, API_CONFIG: {}, console, Date, isFinite, setTimeout() {} };
vm.runInNewContext(source, context, { filename: 'chatbot-renderers-medstand.js' });
assert.equal(typeof api.__internal.renderCatalog, 'function', 'Catalog renderer must be exported');
assert.equal(typeof api.__internal.renderCatalogFooter, 'function', 'Catalog footer renderer must be exported');

const rows = [
  { Type: 'sanpham', Label: 'Sản phẩm' },
  { Type: 'khachhang', Label: 'Khách hàng' },
  { Type: 'donhang', Label: 'Đơn hàng' },
  { Type: 'khohang', Label: 'Kho hàng' },
  { Type: 'nhanvien', Label: 'Nhân viên' }
];
const html = api.__internal.renderCatalog(rows, '', '@danh_muc', { requestId: 'req-catalog-test' });

for (const type of ['sanpham', 'khachhang', 'donhang', 'khohang', 'nhanvien']) {
  assert(html.includes(`data-catalog-type="${type}"`), `Missing catalog action ${type}`);
}
assert(html.includes('data-catalog-search-start'), 'Search action is missing');
assert(html.includes('data-catalog-keyword'), 'Keyword step is missing');
assert(html.includes('data-catalog-back'), 'Back action is missing');
assert(html.includes('ai-component-card'), 'Catalog must use the shared card surface');
assert(html.includes('ai-catalog-action-icon') && html.includes('<svg'), 'Catalog actions must use component SVG icons');
assert(html.includes('MedstandCatalogAction'), 'Catalog actions must keep a direct click handler');
assert(!/[📦👥🧾🏬👤]/u.test(html), 'Emoji icons must not leak into the production card');
assert(!html.includes('<th>TYPE</th>') && !html.includes('<th>LABEL</th>'), 'Technical TYPE/LABEL table leaked');

const catalogCalls = [];
context.window.ApiEngine = { execute(code, params) { catalogCalls.push({ code, params }); } };
const fakeControls = [{ disabled: false }, { disabled: false }];
const fakeRoot = { querySelectorAll() { return fakeControls; } };
context.window.MedstandCatalogAction({ closest() { return fakeRoot; } }, 'sanpham');
assert.equal(catalogCalls.length, 1, 'Catalog click must execute exactly once');
assert.equal(catalogCalls[0].code, '@danh_muc', 'Catalog click must call the catalog API');
assert.equal(catalogCalls[0].params['@Type'], 'sanpham', 'Catalog click must preserve the mapped type');

const drift = api.__internal.renderCatalog([{ Type: 'unsupported', Label: 'Unsupported' }], '', '@danh_muc', { requestId: 'req-drift' });
assert(drift.includes('Danh mục chưa được hỗ trợ'), 'Unknown type must fail closed');

const footer = api.__internal.renderCatalogFooter('sanpham');
assert(footer.includes('data-catalog-search-current'), 'Search-current action is missing');
assert(footer.includes('data-catalog-return'), 'Return-to-catalog action is missing');

assert(chatbotSource.includes('row.type ??'), 'Catalog root detection must accept lowercase type keys');
assert(chatbotSource.includes('row.label !== undefined'), 'Catalog root detection must accept lowercase label keys');
assert(chatbotSource.includes("isCatalogRoot ? '@danh_muc' : apiCode"), 'Catalog renderer must not depend on a response apiCode');
assert(chatbotSource.includes('window.ApiChatbot.__internal.renderCatalog(catalogRows'), 'Active ApiEngine render path must route catalog roots');

console.log('Catalog menu contract checks passed.');
