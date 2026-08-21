'use strict';

/* Static preflight (không cần kết nối DB) cho PROMO-CFG-001, theo đúng khuôn
   scripts/preflight_promo001_schema.js — kiểm tra cấu trúc file SQL bằng text. */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sqlSource = fs.readFileSync(path.join(root, 'sql', 'PROMO-CFG-001_Promotion_Program_Admin_AI.sql'), 'utf8');

const checks = [
  ['LIST_PROC', sqlSource.includes('API_PromotionProgram_List_AI')],
  ['DETAIL_PROC', sqlSource.includes('API_PromotionProgram_Detail_AI')],
  ['UPSERT_PROC', sqlSource.includes('API_PromotionProgram_Upsert_AI')],
  ['APPROVE_PROC', sqlSource.includes('API_PromotionProgram_Approve_AI')],
  ['MANAGER_GUARD_ALL_PROCS', (sqlSource.match(/Chỉ cấp quản lý trở lên/g) || []).length >= 4],
  ['ACCOUNT_GUARD_ALL_PROCS', (sqlSource.match(/Tài khoản không hợp lệ hoặc đã bị khóa/g) || []).length >= 4],
  ['NO_HARDCODED_THRESHOLD', !/MinimumOrderAmount\s*=\s*\d/.test(sqlSource) && !/MinimumQuantity\s*=\s*\d/.test(sqlSource)],
  ['EDIT_ONLY_DRAFT', sqlSource.includes("Status = 'DRAFT'") && sqlSource.includes('Chỉ được sửa trực tiếp bản DRAFT')],
  ['NEW_VERSION_ON_NON_DRAFT', sqlSource.includes('ISNULL(MAX(ProgramVersion), 0) + 1')],
  ['APPLY_PREVIEW_FLAG', (sqlSource.match(/@Apply\s+BIT\s*=\s*0/g) || []).length >= 2 && sqlSource.includes('Xem trước — hệ thống CHƯA ghi gì')],
  ['APPROVE_ONLY_FROM_DRAFT', sqlSource.includes("@Action IN ('APPROVE', 'REJECT') AND @CurrentStatus <> 'DRAFT'")],
  ['WITHDRAW_ONLY_FROM_APPROVED', sqlSource.includes("@Action = 'WITHDRAW' AND @CurrentStatus <> 'APPROVED'")],
  ['NO_RULE_TABLE_HARDCODE_BYPASS', !/CHECK_CONSTRAINT|WITH\s+NOCHECK/i.test(sqlSource)],
  ['ITEM_EXISTS_VALIDATION', sqlSource.includes('EXISTS (SELECT 1 FROM dbo.CF_ItemTbl I WHERE I.ItemID = J.ItemID)')],
  ['EXPLICIT_RULE_ORDER_FROM_PAYLOAD', sqlSource.includes("RuleOrder INT '$.RuleOrder'")],
  ['NO_ERP_MUTATION', !/(INSERT\s+(?:INTO\s+)?|UPDATE|DELETE\s+FROM|MERGE\s+(?:INTO\s+)?)dbo\.AR_/i.test(sqlSource)],
  ['USES_EXISTING_SHADOW_TABLES_ONLY', sqlSource.includes('dbo.AI_PromotionProgramTbl') && sqlSource.includes('dbo.AI_PromotionItemRuleTbl') && !/CREATE\s+TABLE/i.test(sqlSource)],
];

const failed = checks.filter(([, pass]) => !pass);
for (const [name, pass] of checks) console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
console.log(`PROMO-CFG-001 preflight: ${failed.length ? 'FAIL' : 'PASS'} ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exitCode = 1;
