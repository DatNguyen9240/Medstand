'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const chatbot = fs.readFileSync(path.join(root, 'chatbot-widget', 'js', 'chatbot.js'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'chatbot-widget', 'js', 'chatbot-api-engine.js'), 'utf8');

const formatterStart = chatbot.indexOf('function _fmtCellVal(v)');
const formatterEnd = chatbot.indexOf('function _badgeClass', formatterStart);
assert(formatterStart >= 0 && formatterEnd > formatterStart, 'Business formatter source is missing');

const context = { isNaN, Math, Number, String };
vm.runInNewContext(chatbot.slice(formatterStart, formatterEnd), context, { filename: 'business-formatters.js' });

assert.equal(context._formatBusinessCell('AvailableStock', null), 'Chưa kiểm tra kho');
assert.equal(context._formatBusinessCell('PhysicalStock', null), 'Chưa truy vấn kho');
assert.equal(context._formatBusinessCell('StockDataStatus', 'PHYSICAL_ONLY_UNVERIFIED'), 'Có số tồn kho nhưng chưa xác minh số có thể bán');
assert.equal(context._formatBusinessCell('StockDataStatus', 'PHYSICAL_AS_SELLABLE_TEMPORARY'), 'Theo tồn kho hiện tại');
assert.equal(context._formatBusinessCell('StockDataStatus', 'EXPIRED_NOT_SELLABLE'), 'Hết hạn - không được bán');
assert.equal(context._formatBusinessCell('StockDataStatus', 'STOCK_RECONCILIATION_REQUIRED'), 'Cần đối soát kho');
assert.equal(context._formatBusinessCell('StockDataStatus', 'NO_SELLABLE_STOCK'), 'Không còn hàng có thể bán');
assert.equal(context._formatBusinessCell('LastVisitStatus', 'CHECKIN_SOURCE_UNAVAILABLE'), 'Chưa có dữ liệu ghé');
assert.equal(context._formatBusinessCell('ActionStatus', 'REFERENCE_ONLY_APPROVAL_REQUIRED'), 'Chỉ tham khảo, cần phê duyệt');
assert.equal(context._formatBusinessCell('RecommendationStatus', 'REFERENCE_ONLY_MEDICAL_REVIEW_REQUIRED'), 'Chỉ tham khảo, cần người có chuyên môn xem xét');
assert.equal(context._formatBusinessCell('DoTinCay', 'PERSONAL_CYCLE_ELIGIBLE'), 'Đủ dữ liệu tính chu kỳ cá nhân');
for (const field of [
  'physicalstock', 'availablestock', 'stockdatastatus',
  'risklevel', 'lastvisitstatus', 'actionstatus', 'recommendationstatus', 'medicaldisclaimer', 'paymentstatus', 'datasource'
]) {
  assert(chatbot.includes(`'${field}'`), `Friendly frontend field mapping missing ${field}`);
}

assert(chatbot.includes('function _isTechnicalRuleField(key)'), 'Frontend must centrally hide technical rule metadata');
assert(chatbot.includes("return normalized.indexOf('rule') === 0;"), 'All Rule* fields must be hidden from business UI');
const ruleFieldStart = chatbot.indexOf('function _isTechnicalRuleField(key)');
const ruleFieldEnd = chatbot.indexOf('function _getHiddenFields()', ruleFieldStart);
const ruleFieldContext = { String };
vm.runInNewContext(chatbot.slice(ruleFieldStart, ruleFieldEnd), ruleFieldContext, { filename: 'rule-field-visibility.js' });
for (const field of ['RuleVersion', 'rule_source', 'RULE_STATUS', 'RuleApprover']) {
  assert.equal(ruleFieldContext._isTechnicalRuleField(field), true, `${field} must be hidden`);
}
assert.equal(ruleFieldContext._isTechnicalRuleField('DataSource'), false, 'Business data source remains independently controlled');
assert(!chatbot.includes("'ruleversion': 'Phiên bản quy tắc'"), 'RuleVersion must not have a user-facing label');
assert(!chatbot.includes("'rulesource': 'Nguồn quy tắc'"), 'RuleSource must not have a user-facing label');
const medstandRenderer = fs.readFileSync(path.join(root, 'chatbot-widget', 'js', 'chatbot-renderers-medstand.js'), 'utf8');
assert(!medstandRenderer.includes('Quy tắc:'), 'Debt renderer must not expose RuleVersion');

for (const status of ['OUT_OF_SCOPE', 'VALIDATION_ERROR', 'SYSTEM_ERROR', 'NO_DATA']) {
  assert(engine.includes(status), `Frontend response adapter missing ${status}`);
}
assert(engine.includes("res.errorCode || res.code || contractStatus || 'API_ERROR'"), 'queryData must preserve canonical backend error codes');
assert(engine.includes('Authenticated identity is not mapped to an internal account'), 'Identity mapping errors need a Vietnamese re-login instruction');
assert(engine.includes("CACHE_KEY: 'api_engine_v4_list'"), 'Required-field metadata fix must invalidate the old API catalog cache');
assert(engine.includes('Vui lòng chọn khách hàng trước khi xem gợi ý đơn hàng.'), 'Order suggestion needs a client-side required-customer guard');
assert(engine.includes('Vui lòng chọn sản phẩm gốc trước khi xem gợi ý sản phẩm liên quan.'), 'Related-product suggestion needs a client-side root-product guard');
assert(chatbot.includes('Chưa có số lượng có thể bán'), 'Missing sale-friendly stock guidance');
assert(chatbot.includes('Đây không phải là hết hàng'), 'Missing stock unknown explanation');
assert(chatbot.includes('ai-stock-check-btn'), 'Missing stock lookup action');
assert(chatbot.includes("'availablestock': 'Có thể bán'"), 'Sellable stock column must use a short business label');
assert(chatbot.includes("return hasAvailableStock && (available === null"), 'Stock warning must depend on missing sellable quantity, not missing duplicate fields');
assert(chatbot.includes('data-server-tier="A"'), 'Customer scoring must expose server-side Tier A filter');
assert(chatbot.includes('data-server-tier="B"'), 'Customer scoring must expose server-side Tier B filter');
assert(chatbot.includes('data-server-tier="C"'), 'Customer scoring must expose server-side Tier C filter');
assert(chatbot.includes("window.ApiEngine.queryData('@cham_diem_kh', params)"), 'Tier filters must reload customer scoring from the authorized API');
assert(chatbot.includes("params['@NhomFilter'] = targetTier"), 'Tier filter must use @NhomFilter');
assert(chatbot.includes('data-tier-page-action="prev"') && chatbot.includes('data-tier-page-action="next"'), 'Customer scoring must expose server pagination');
assert(chatbot.includes("'@Page': targetPage") && chatbot.includes("'@PageSize': Number(cache.pageSize || 50)"), 'Tier pagination must preserve SQL paging contract');
assert(chatbot.includes("controls.closest('.ai-view-table')") && chatbot.includes("tierControls.closest('.ai-view-table')"), 'Tier controls must resolve the containing table before loading data');
assert(engine.includes("'Sản phẩm cần xem xét khuyến mãi'"), 'Manager promotion menu label is missing');
assert(engine.includes("'Khuyến mãi công ty'"), 'Sale promotion menu label is missing');
assert(chatbot.includes("promotionMode === 'MANAGER_REVIEW'"), 'Promotion renderer must distinguish Manager review data');
assert(chatbot.includes("'Sản phẩm cần xem xét khuyến mãi ('"), 'Manager promotion result title is missing');

console.log('Business Rule frontend contract: PASS');
