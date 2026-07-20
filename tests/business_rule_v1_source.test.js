/*
 * Agent A source contract smoke test.
 * This does not replace SQL Server/UAT tests; it catches accidental regression
 * before a procedure is imported into the database.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const recommendation = read('sql/Module 1 - API_GoiYDonHang_AI.sql');
const route = read('sql/Module 2 - API_TuyenBanHang_AI.sql');
const tier = read('sql/Module 3 - API_ChamDiemKH_AI.sql');
const loyalty = read('sql/Module 4 - API_TichLuy_AI.sql');
const upsell = read('sql/Module 5 - API_UpsellGoiY_AI.sql');
const promotion = read('sql/Module 6 - API_DeXuatKhuyenMai_AI.sql');
const stock = read('sql/Module common - API_DanhsachTonKho_AI.sql');
const revenue = read('sql/Module common - API_DoanhSo_AI.sql');
const debtDetail = read('sql/Module common - API_CongNoChiTiet_AI.sql');
const symptomProduct = read('sql/Module 10 - API_TraCuuSanPham_AI.sql');
const revenueVerification = read('sql/diagnostics/Business_Rule_V1_Revenue_Option_C_Verification.sql');
const migration = read('sql/Migrate_Business_Rule_Baseline_V1_AI.sql');
const execute = JSON.parse(read('n8n/API_Services/API_Execute.json'));

assert.equal(fs.existsSync(path.join(root, 'sql/API_TuyenBanHang_AI.sql')), false,
  'route must have one canonical SQL source');
assert.match(recommendation, /L\.SoLanMua\s*>=\s*3/);
assert.match(recommendation, /DoTinCay/);
assert.match(recommendation, /PERSONAL_CYCLE_ELIGIBLE/);
assert.match(recommendation, /PERSONAL_PURCHASE_HISTORY/);
assert.match(recommendation, /ELSE CAST\(NULL AS INT\)/);
assert.doesNotMatch(recommendation, /ELSE\s+30\b/);
assert.match(recommendation, /NEW_CUSTOMER\|INSUFFICIENT_HISTORY/);
assert.match(recommendation, /RecommendationReason/);
assert.match(recommendation, /DataWindow/);
assert.match(recommendation, /AvailableStock/);
assert.match(recommendation, /PHYSICAL_STOCK_NOT_QUERIED/);
assert.match(recommendation, /OUT_OF_SCOPE/);
assert.doesNotMatch(recommendation, /AS\s+\[TonKho\]/i);
assert.doesNotMatch(recommendation, /FROM\s+AR_OrderTbl\s+O[\s\S]{0,300}DaMuaHomNay/i);
assert.match(route, /AR_InvoiceTbl\s+WHERE\s+StatusID IN \(3, 6, 7, 8\)/);
assert.doesNotMatch(route, /UNION\s+ALL\s+\r?\n\s*SELECT ObjectID, DocumentDate, BranchID, CeoID, ManagerID\s+\r?\n\s*FROM AR_OrderTbl/i);
assert.match(route, /CHECKIN_SOURCE_UNAVAILABLE/);
assert.match(tier, /NGUY CƠ/);
assert.match(tier, /RiskLevel\s*=\s*'HIGH'/);
assert.match(tier, /BR-TIER-V1-DRAFT/);
assert.match(tier, /FREQUENCY_MONETARY_PERCENTILE_DRAFT/);
assert.match(tier, /@W_Frequency \* F_Score/);
assert.match(tier, /@W_Monetary \* M_Score/);
assert.doesNotMatch(tier, /@W_Recency \* R_Score/);
assert.doesNotMatch(tier, /@W_Consumption \* C_Score/);
assert.match(debtDetail, /PARTIALLY_PAID/);
assert.match(debtDetail, /CollectionStatus/);
assert.match(loyalty, /BR-SALES-001/);
assert.doesNotMatch(loyalty, /FROM AR_OrderTbl/);
assert.match(loyalty, /ProgramStatus/);
assert.match(loyalty, /EffectiveFrom/);
assert.match(loyalty, /Remaining/);
assert.match(loyalty, /BR-PROGRAM-V1-DRAFT/);
assert.match(loyalty, /KhongTruDSWeb/);
assert.match(loyalty, /OUT_OF_SCOPE/);
assert.doesNotMatch(upsell, /FROM AR_OrderTbl/);
assert.match(upsell, /BR-UPSELL-V1-DRAFT/);
assert.match(upsell, /MISSING_CUSTOMER/);
assert.match(upsell, /Vui lòng chọn khách hàng để gợi ý bán kèm/);
assert.match(upsell, /CUSTOMER_OUT_OF_SCOPE/);
assert.match(upsell, /OUT_OF_SCOPE/);
assert.match(upsell, /O\.BranchID\s*=\s*@SYSBranchID/);
assert.match(upsell, /AR_GetObjectByUserFnc\(@Username\)/);
assert.match(upsell, /AvailableStock/);
assert.match(upsell, /PHYSICAL_AS_SELLABLE_TEMPORARY/);
assert.match(upsell, /IV_StockTransactionTbl/);
assert.match(upsell, /SY_UserStoreHouseTbl/);
assert.match(upsell, /#StockByLot/);
assert.doesNotMatch(upsell, /FROM\s+IV_StockTbl/i);
assert.doesNotMatch(upsell, /CASE WHEN ISNULL\(S\.QuantityinStock,\s*0\) > 0 THEN \d+ ELSE 0 END/);
assert.match(upsell, /AND ISNULL\(S\.QuantityinStock,\s*0\) > 0/);
assert.doesNotMatch(upsell, /ORDER BY\s+PriorityScore\s+DESC\s*,\s*TonKho/i);
for (const [name, source] of Object.entries({ recommendation, route, tier, loyalty, upsell, promotion })) {
  assert.doesNotMatch(source, /NOT IN\s*\(-2,\s*-1,\s*0,\s*10\)/i,
    `${name} must not count invoice status 1/2 as fulfilled`);
}
assert.match(promotion, /REFERENCE_ONLY_APPROVAL_REQUIRED/);
assert.match(promotion, /IV_StockTransactionTbl/);
assert.match(promotion, /SY_UserStoreHouseTbl/);
assert.match(promotion, /MANAGER_REVIEW/);
assert.match(promotion, /APPROVED_ACTIVE/);
assert.match(promotion, /PhanTramDeXuat/);
assert.match(promotion, /PHYSICAL_AS_SELLABLE_TEMPORARY/);
assert.match(promotion, /CAST\(NULL AS DECIMAL\(5, 2\)\) AS PhanTramDeXuat/i);
assert.doesNotMatch(promotion, /AR_AI_DiscountConfigTbl/);
assert.doesNotMatch(promotion, /QuantityinStock/);
assert.match(stock, /AvailableStock/);
assert.match(stock, /PHYSICAL_AS_SELLABLE_TEMPORARY/);
assert.match(stock, /EXPIRED_NOT_SELLABLE/);
assert.match(stock, /STOCK_RECONCILIATION_REQUIRED/);
assert.match(symptomProduct, /AvailableStock/);
assert.match(symptomProduct, /PHYSICAL_STOCK_NOT_QUERIED/);
assert.match(symptomProduct, /REFERENCE_ONLY_MEDICAL_REVIEW_REQUIRED/);
assert.match(symptomProduct, /MedicalDisclaimer/);
assert.match(symptomProduct, /BR-MED-V1-DRAFT/);
assert.doesNotMatch(symptomProduct, /SUM\(QuantityinStock\)/i);
assert.match(revenue, /RevenueBasis/);
assert.match(revenue, /AR_OrderAndReturnView\.TotalAmount/);
assert.match(revenue, /DoanhThuDaThu/);
assert.match(revenue, /FULFILLED=3,6,7,8;COLLECTED=8;RETURN=99/);
assert.doesNotMatch(revenue, /AR_OrderAndReturnView\.Amount/);
assert.doesNotMatch(revenue, /INNER JOIN AR_OrderDetailTbl D ON A\.DocumentID = D\.DocumentID/);
assert.match(revenueVerification, /ExpectedFulfilledSales/);
assert.match(revenueVerification, /ExpectedCollectedRevenue/);
assert.match(revenueVerification, /PASS_RETURN_SIGNED_ONCE/);
assert.match(revenueVerification, /PASS_RETURN_AGGREGATE_NEGATIVE_MIXED_LINES/);
assert.match(revenueVerification, /PAYMENT_LEDGER_RECONCILIATION_REQUIRED/);
assert.match(revenueVerification, /ProductAggregationDifference/);
assert.doesNotMatch(revenueVerification, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|MERGE)\b/i);
assert.match(migration, /Status[^\n]*DEFAULT\s*\('DRAFT'\)|VALUES[^\n]*'DRAFT'/);
assert.match(migration, /AI_GetBusinessRuleConfig/);

const executeNames = new Set(execute.nodes.map((node) => node.name));
for (const required of ['Validate API Request', 'Format Execute Response', 'Prepare Audit - Execute Success']) {
  assert.equal(executeNames.has(required), true, `missing n8n node: ${required}`);
}

console.log(JSON.stringify({
  suite: 'business-rule-v1-source',
  status: 'STATIC_SOURCE_PASS',
  checks: 54,
  note: 'Static source contract; SQL and published n8n runtime evidence are recorded separately in reports/.'
}, null, 2));
