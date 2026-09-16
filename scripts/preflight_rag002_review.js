'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'sql/RAG-002_OCR_Review_AI.sql'), 'utf8');
const gateway = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const rollbackTest = fs.readFileSync(path.join(root, 'scripts/verify_rag002_uat_rollback.js'), 'utf8');
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
const normalizePdfCode = workflow.nodes.find((node) => node.name === 'RAG002 Normalize PDF')?.parameters?.jsCode || '';
const approvedEmbedding = workflow.nodes.find((node) => node.name === 'RAG002 Create Approved Embedding');
const approvedUpsert = workflow.nodes.find((node) => node.name === 'RAG002 Upsert Approved Point');
const prepareApprovedCode = workflow.nodes.find((node) => node.name === 'RAG002 Prepare Approved Document')?.parameters?.jsCode || '';
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
  ['APPROVE_VECTOR_GATE', uploadReachable.has('RAG002 If Approval Ready') && uploadReachable.has('RAG002 Create Approved Embedding') && uploadReachable.has('RAG002 Upsert Approved Point')],
  ['NO_UNAPPROVED_LEGACY_VECTOR', !uploadReachable.has('Qdrant Vector Store') && !uploadReachable.has('Save OCR to DB')],
  ['CHATBOT_APPROVED_FILTER', queryWorkflow.includes('reviewStatus') && queryWorkflow.includes('APPROVED') && queryWorkflow.includes('malwareScanStatus')],
  ['REVIEW_UI', template.includes('rag-review-content') && pageScript.includes('SAVE_REVIEW') && pageScript.includes('APPROVE_REVIEW') && pageScript.includes('REJECT_REVIEW')],
  ['VERIFIED_REVIEWER_BOUNDARY', gateway.includes("'x-verified-user': verifiedAdminIdentity.username") && workflow.nodes.find((node) => node.name === 'Check Auth & Format')?.parameters?.jsCode.includes("headers['x-verified-user'] || ''")],
  ['ROLLBACK_CLEANUP_ASSERTION', rollbackTest.includes('remainingFixtures === 0')],
  ['TASK_RUNNER_SAFE_NEWLINES', normalizePdfCode.includes('String.fromCharCode(10, 10)')],
  ['APPROVED_EMBEDDINGS_CREDENTIAL', Boolean(approvedEmbedding?.credentials?.openAiApi?.id) && approvedEmbedding?.parameters?.url === 'https://openrouter.ai/api/v1/embeddings'],
  ['APPROVED_VECTOR_UPSERT', approvedUpsert?.parameters?.method === 'PUT' && approvedUpsert?.parameters?.url?.includes('/collections/medstand-policies/points?wait=true')],
  ['APPROVED_JSON_PAYLOAD', prepareApprovedCode.includes('approvedContent: content') && workflow.nodes.find((node) => node.name === 'RAG002 Build Qdrant Point')?.parameters?.jsCode?.includes("reviewStatus: 'APPROVED'")],
];

let failed = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  if (!pass) failed += 1;
}
console.log(JSON.stringify({ task: 'RAG-002-PREFLIGHT', status: failed ? 'FAIL' : 'PASS', passed: checks.length - failed, total: checks.length }, null, 2));
if (failed) process.exitCode = 1;
