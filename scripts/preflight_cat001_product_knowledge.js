'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'sql', 'CAT-001_Product_Knowledge_AI.sql'), 'utf8');
const contract = fs.readFileSync(path.join(root, 'docs', 'CAT-001_CONTRACT_TRI_THUC_SAN_PHAM_AI_2026-08-10.md'), 'utf8');

const checks = [
  ['NEW_VERSION_TABLE', sql.includes('AI_ProductKnowledgeVersionTbl')],
  ['APPROVED_VIEW', sql.includes('AI_ApprovedProductKnowledgeVw')],
  ['CHATBOT_API_SUFFIX', sql.includes('API_TriThucSanPham_AI')],
  ['NO_ERP_ALTER', !/ALTER\s+TABLE\s+dbo\.(CF_|AR_|IV_)/i.test(sql)],
  ['NO_ERP_TRIGGER', !/CREATE\s+(?:OR\s+ALTER\s+)?TRIGGER/i.test(sql)],
  ['NO_LEGACY_TABLE_MUTATION', !/(INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE)\s+(?:dbo\.)?AI_ProductKnowledgeTbl/i.test(sql)],
  ['NO_LEGACY_API_CHANGE', !/CREATE\s+OR\s+ALTER\s+PROCEDURE\s+(?:dbo\.)?API_TraCuuSanPham_AI/i.test(sql)],
  ['APPROVED_ONLY', /K\.Status\s*=\s*'APPROVED'/i.test(sql)],
  ['EFFECTIVE_WINDOW', sql.includes('K.EffectiveFrom <= SYSUTCDATETIME()') && sql.includes('K.EffectiveTo > SYSUTCDATETIME()')],
  ['APPROVAL_EVIDENCE', sql.includes('ApprovedBy IS NOT NULL') && sql.includes('ApprovedAt IS NOT NULL')],
  ['NONEMPTY_SOURCE', sql.includes('CK_AI_ProductKnowledgeVersion_Source') && sql.includes('LEN(LTRIM(RTRIM(SourceDocument))) > 0')],
  ['NONEMPTY_ACTORS', sql.includes('CK_AI_ProductKnowledgeVersion_CreatedBy') && sql.includes('ApprovedBy IS NOT NULL AND LEN(LTRIM(RTRIM(ApprovedBy))) > 0')],
  ['VIEW_RETURNS_ITEM_NAME', sql.includes('I.ItemName') && /CREATE OR ALTER VIEW[\s\S]*?\n\s*ItemName,/i.test(sql)],
  ['ERP_ITEM_READ_ONLY', sql.includes('INNER JOIN dbo.CF_ItemTbl') && !/INSERT\s+INTO\s+dbo\.CF_ItemTbl|UPDATE\s+dbo\.CF_ItemTbl|DELETE\s+FROM\s+dbo\.CF_ItemTbl/i.test(sql)],
  ['CONTRACT_SAFETY_BOUNDARY', contract.includes('Không dual-write') && contract.includes('Không sửa `AI_ProductKnowledgeTbl`')],
];

const failed = checks.filter(([, pass]) => !pass);
for (const [name, pass] of checks) console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
console.log(`CAT-001 preflight: ${failed.length ? 'FAIL' : 'PASS'} ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exitCode = 1;
