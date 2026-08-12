'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'sql/RAG-003_Document_Lifecycle_AI.sql'), 'utf8');
const contract = fs.readFileSync(path.join(root, 'docs/RAG-003_CONTRACT_DOCUMENT_LIFECYCLE_AI_2026-08-10.md'), 'utf8');
const upload = fs.readFileSync(path.join(root, 'n8n/AI_Core/AI_Upload_Reader.json'), 'utf8');
const query = fs.readFileSync(path.join(root, 'n8n/AI_Core/AI_RAG_Query.json'), 'utf8');
const queryWorkflow = JSON.parse(query);
const cleanup = fs.readFileSync(path.join(root, 'n8n/Cron_Jobs/CRON_CleanupRAG.json'), 'utf8');
const template = fs.readFileSync(path.join(root, 'src/templates/rag-admin.html'), 'utf8');
const page = fs.readFileSync(path.join(root, 'src/js/pages/rag-admin.js'), 'utf8');
const validateNode = queryWorkflow.nodes.find((node) => node.name === 'RAG003 Validate Active Documents');
const uploadWorkflow = JSON.parse(upload);
const authCode = uploadWorkflow.nodes.find((node) => node.name === 'Check Auth & Format')?.parameters?.jsCode || '';

const checks = [
  ['LIFECYCLE_COLUMNS', sql.includes('RevokedBy') && sql.includes('RevokedAt') && sql.includes('RevocationReason')],
  ['LIFECYCLE_AUDIT', sql.includes('AI_RagDocumentLifecycleLogTbl') && sql.includes("Action IN ('WITHDRAW')")],
  ['ACTIVE_VIEW', sql.includes('AI_RagDocumentLifecycleVw') && sql.includes("THEN 'SCHEDULED'") && sql.includes("THEN 'EXPIRED'")],
  ['WITHDRAW_ATOMIC', sql.includes('API_RagDocumentLifecycle_AI') && sql.includes('UPDLOCK, HOLDLOCK') && sql.includes("ReviewStatus = 'WITHDRAWN'")],
  ['NO_ERP_MUTATION', !/(CF_|AR_|API_KhachHang|API_DonHang|AI_ProductKnowledgeTbl)/i.test(sql)],
  ['NO_BINARY_IN_DB', !/(VARBINARY|FILESTREAM|\bIMAGE\s+(?:NULL|NOT\s+NULL))/i.test(sql)],
  ['APPROVAL_DATE_RANGE', upload.includes('effectiveFromDate') && upload.includes('effectiveToDate') && upload.includes('INVALID_EFFECTIVE_RANGE')],
  ['AUTH_CODE_NO_DUPLICATES', (authCode.match(/const effectiveFromDate/g) || []).length === 1 && (authCode.match(/const datePattern/g) || []).length === 1],
  ['VECTOR_DATE_METADATA', upload.includes('effectiveFromEpoch') && upload.includes('effectiveToEpoch')],
  ['MANUAL_WITHDRAW_API', upload.includes('WITHDRAW_DOCUMENT') && upload.includes('RAG003 Delete Withdrawn Vectors')],
  ['QUERY_VECTOR_TIME_GATE', query.includes('metadata.effectiveFromEpoch') && query.includes('metadata.effectiveToEpoch')],
  ['QUERY_DB_FAIL_CLOSED', query.includes('RAG003 Validate Active Documents') && query.includes('AI_ApprovedRagContentVw')],
  ['QUERY_SQL_CREDENTIAL', Boolean(validateNode?.credentials?.microsoftSql?.id)],
  ['AUTOMATIC_CLEANUP', cleanup.includes('metadata.effectiveToEpoch') && cleanup.includes('points/delete')],
  ['LIFECYCLE_UI', template.includes('rag-effective-from') && template.includes('rag-lifecycle-list') && page.includes('LIST_LIFECYCLE') && page.includes('WITHDRAW_DOCUMENT')],
  ['CONTRACT_ROLLBACK', contract.includes('remainingFixtures=0') && contract.includes('fail-closed')],
];

let failed = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  if (!pass) failed += 1;
}
console.log(JSON.stringify({ task: 'RAG-003-PREFLIGHT', status: failed ? 'FAIL' : 'PASS', passed: checks.length - failed, total: checks.length }, null, 2));
if (failed) process.exitCode = 1;
