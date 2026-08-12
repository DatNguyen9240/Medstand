'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'sql', 'PROMO-002_Active_Promotion_By_User_AI.sql'), 'utf8');
const catalog = fs.readFileSync(path.join(root, 'sql', 'Module common - API_HangHoaList_AI.sql'), 'utf8');
const lookup = fs.readFileSync(path.join(root, 'sql', 'Module 10 - API_TraCuuSanPham_AI.sql'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'chatbot-widget', 'js', 'chatbot-product-card.js'), 'utf8');

const fields = ['ActivePromotionCount', 'PromotionSummary', 'ActivePromotionsJson', 'PromotionUpdatedAt', 'PromotionDataSource'];
const checks = [
  ['USER_SCOPED_FUNCTION', sql.includes('AI_ActivePromotionByUserFnc')],
  ['APPROVED_SOURCE_ONLY', sql.includes('AI_ApprovedPromotionItemRuleVw') && !sql.includes('AR_PromotionTbl')],
  ['ACTIVE_USER_REQUIRED', sql.includes('COALESCE(U.Disable, 0) = 0')],
  ['BRANCH_SCOPE_MATCH', sql.includes('B.BranchID = U.BranchID')],
  ['GROUP_SCOPE_MATCH', sql.includes('G.UserGroupID = U.UserGroupID')],
  ['ITEM_SCOPE_MATCH', sql.includes("P.ItemID = LTRIM(RTRIM(COALESCE(@ItemID, '')))")],
  ['EFFECTIVE_WINDOW', sql.includes('P.EffectiveFrom <= COALESCE(@AsOfUtc') && sql.includes('P.EffectiveTo > COALESCE(@AsOfUtc')],
  ['CATALOG_FIELDS', fields.every((field) => catalog.includes(field))],
  ['LOOKUP_FIELDS', fields.every((field) => lookup.includes(field))],
  ['STRUCTURED_JSON', catalog.includes('FOR JSON PATH') && lookup.includes('FOR JSON PATH')],
  ['RENDERER_PROMOTION', renderer.includes("infoBlock('CTBH hiện hành'") && renderer.includes('promotionSummary')],
  ['NO_ERP_MUTATION', !/(INSERT\s+(?:INTO\s+)?|UPDATE|DELETE\s+FROM|MERGE\s+(?:INTO\s+)?)dbo\.(AR_|CF_|IV_)/i.test(sql)],
];

const failed = checks.filter(([, pass]) => !pass);
for (const [name, pass] of checks) console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
console.log(`PROMO-002 preflight: ${failed.length ? 'FAIL' : 'PASS'} ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exitCode = 1;
