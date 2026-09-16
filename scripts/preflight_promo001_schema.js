'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'sql', 'PROMO-001_Promotion_Schema_AI.sql'), 'utf8');
const contract = fs.readFileSync(path.join(root, 'docs', 'PROMO-001_CONTRACT_SCHEMA_CTBH_AI_2026-08-10.md'), 'utf8');

const checks = [
  ['PROGRAM_TABLE', sql.includes('AI_PromotionProgramTbl')],
  ['BRANCH_SCOPE_TABLE', sql.includes('AI_PromotionBranchScopeTbl')],
  ['USER_GROUP_SCOPE_TABLE', sql.includes('AI_PromotionUserGroupScopeTbl')],
  ['ITEM_RULE_TABLE', sql.includes('AI_PromotionItemRuleTbl')],
  ['APPROVED_EFFECTIVE_VIEW', sql.includes('AI_ApprovedPromotionItemRuleVw') && sql.includes("P.Status = 'APPROVED'")],
  ['MONTHLY_AND_EVENT', sql.includes("ProgramType IN ('MONTHLY', 'EVENT')")],
  ['EFFECTIVE_WINDOW', sql.includes('P.EffectiveFrom <= SYSUTCDATETIME()') && sql.includes('P.EffectiveTo > SYSUTCDATETIME()')],
  ['APPROVAL_EVIDENCE', sql.includes('ApprovedBy IS NOT NULL') && sql.includes('ApprovedAt IS NOT NULL')],
  ['EXPLICIT_BRANCH_SCOPE', sql.includes("BranchScopeMode IN ('ALL', 'INCLUDE')")],
  ['EXPLICIT_GROUP_SCOPE', sql.includes("UserGroupScopeMode IN ('ALL', 'INCLUDE')")],
  ['ITEMID_NOT_FILENAME', sql.includes('ItemID VARCHAR(50) NOT NULL')],
  ['QUANTITY_AND_AMOUNT_CONDITIONS', sql.includes('MinimumQuantity') && sql.includes('MinimumOrderAmount')],
  ['DISCOUNT_AND_GIFT_BENEFITS', sql.includes('DiscountPercent') && sql.includes('GiftItemID') && sql.includes('GiftQuantity')],
  ['VERSIONED_PROGRAM', sql.includes('UQ_AI_PromotionProgram_CodeVersion') && sql.includes('ProgramVersion DESC')],
  ['NO_ERP_MUTATION', !/(INSERT\s+(?:INTO\s+)?|UPDATE|DELETE\s+FROM|MERGE\s+(?:INTO\s+)?)dbo\.AR_Promotion/i.test(sql)],
  ['NO_ERP_ALTER', !/ALTER\s+(?:TABLE|VIEW|PROCEDURE)\s+dbo\.AR_/i.test(sql)],
  ['CONTRACT_SHADOW_BOUNDARY', contract.includes('Không `ALTER`') && contract.includes('không được mặc định xem là chương trình đã duyệt')],
];

const failed = checks.filter(([, pass]) => !pass);
for (const [name, pass] of checks) console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
console.log(`PROMO-001 preflight: ${failed.length ? 'FAIL' : 'PASS'} ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exitCode = 1;
