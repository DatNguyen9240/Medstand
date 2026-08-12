'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'sql/RAG-002_OCR_Review_AI.sql'), 'utf8');
const contract = fs.readFileSync(path.join(root, 'docs/RAG-002_CONTRACT_OCR_REVIEW_AI_2026-08-10.md'), 'utf8');
const workflow = JSON.parse(fs.readFileSync(path.join(root, 'n8n/AI_Core/AI_Upload_Reader.json'), 'utf8'));
const queryWorkflow = fs.readFileSync(path.join(root, 'n8n/AI_Core/AI_RAG_Query.json'), 'utf8');
const template = fs.readFileSync(path.join(root, 'src/templates/rag-admin.html'), 'utf8');
const pageScript = fs.readFileSync(path.join(root, 'src/js/pages/rag-admin.js'), 'utf8');

function reachableMainNodes(start) {
  const reachable = new Set();
  const queue = [start];
  while (queue.length) {
    const current = queue.shift();
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const lane of workflow.connections[current]?.main || []) {
      for (const edge of lane || []) queue.push(edge.node);
    }
  }
  return reachable;
}

const uploadReachable = reachableMainNodes('admin-upload');
const reviewSql = workflow.nodes.find((node) => node.name === 'RAG002 Review Action DB')?.parameters?.query || '';
const checks = [
  ['CONTENT_TABLE', sql.includes('AI_RagDocumentContentTbl')],
  ['REVIEW_LOG', sql.includes('AI_RagDocumentReviewLogTbl')],
  ['APPROVED_CONTENT_VIEW', sql.includes('AI_ApprovedRagContentVw') && sql.includes("ReviewStatus = 'APPROVED'") && sql.includes("ExtractionStatus = 'READY'")],
  ['NO_BINARY_IN_DB', !/(VARBINARY|IMAGE\s+NULL|FILESTREAM)/i.test(sql)],
  ['NO_ERP_MUTATION', !/(CF_|AR_|AI_ProductKnowledgeTbl)/i.test(sql)],
  ['QUEUE_AND_PREVIEW_API', uploadReachable.has('RAG002 Review List') && uploadReachable.has('RAG002 Review Detail')],
  ['ATOMIC_ACTION', reviewSql.includes('XACT_ABORT') && reviewSql.includes('UPDLOCK,HOLDLOCK')],
  ['OPTIMISTIC_REVISION', reviewSql.includes('EDIT_CONFLICT') && reviewSql.includes('@RequestedRevision')],
  ['AUDIT_REVIEWER_TIME', reviewSql.includes('ReviewedBy=@Actor') && reviewSql.includes('ReviewedAt=SYSUTCDATETIME()')],
  ['APPROVE_VECTOR_GATE', uploadReachable.has('RAG002 If Approval Ready') && uploadReachable.has('RAG002 Approved Vector Store')],
  ['NO_UNAPPROVED_LEGACY_VECTOR', !uploadReachable.has('Qdrant Vector Store') && !uploadReachable.has('Save OCR to DB')],
  ['CHATBOT_APPROVED_FILTER', queryWorkflow.includes('reviewStatus') && queryWorkflow.includes('APPROVED') && queryWorkflow.includes('malwareScanStatus')],
  ['REVIEW_UI', template.includes('rag-review-content') && pageScript.includes('SAVE_REVIEW') && pageScript.includes('APPROVE_REVIEW') && pageScript.includes('REJECT_REVIEW')],
  ['CONTRACT_SECURITY_BOUNDARY', contract.includes('Trình duyệt không nhận') && contract.includes('remainingFixtures=0')],
];

let failed = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  if (!pass) failed += 1;
}
console.log(JSON.stringify({ task: 'RAG-002-PREFLIGHT', status: failed ? 'FAIL' : 'PASS', passed: checks.length - failed, total: checks.length }, null, 2));
if (failed) process.exitCode = 1;
