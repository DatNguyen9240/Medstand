'use strict';

const fs = require('fs');
const path = require('path');
const { MAX_FILE_BYTES, validateRagUpload } = require('./rag001_upload_validator');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'sql/RAG-001_Document_Quarantine_AI.sql'), 'utf8');
const gateway = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const n8nRuntime = fs.readFileSync(path.join(root, 'n8n-system/run_n8n.js'), 'utf8');
const uploadWorkflow = JSON.parse(fs.readFileSync(path.join(root, 'n8n/AI_Core/AI_Upload_Reader.json'), 'utf8'));
const queryWorkflow = JSON.parse(fs.readFileSync(path.join(root, 'n8n/AI_Core/AI_RAG_Query.json'), 'utf8'));
const workflowText = JSON.stringify(uploadWorkflow);
const queryText = JSON.stringify(queryWorkflow);

function reachableMainNodes(workflow, start) {
  const reachable = new Set();
  const queue = [start];
  while (queue.length) {
    const current = queue.shift();
    if (reachable.has(current)) continue;
    reachable.add(current);
    const lanes = (workflow.connections[current] && workflow.connections[current].main) || [];
    for (const lane of lanes) for (const edge of lane || []) queue.push(edge.node);
  }
  return reachable;
}

function fixture(name, mime, bytes) {
  return {
    originalFileName: name,
    declaredMimeType: mime,
    buffer: Buffer.from(bytes),
    metadata: { title: 'UAT RAG-001', sourceType: 'POLICY', sourceReference: 'UAT rollback', uploadedBy: 'RAG001_UAT' },
    malwareScan: { scannerReady: true, status: 'CLEAN', scanner: 'UAT_SCANNER' },
  };
}

const validCases = [
  fixture('sample.pdf', 'application/pdf', '%PDF-1.7\nUAT'),
  fixture('sample.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', [0x50, 0x4b, 0x03, 0x04, 0x01]),
  fixture('sample.png', 'image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]),
  fixture('sample.jpg', 'image/jpeg', [0xff, 0xd8, 0xff, 0xe0, 0x01]),
];

const rejectionCases = [
  ['EMPTY_FILE', { ...fixture('sample.pdf', 'application/pdf', []), buffer: Buffer.alloc(0) }],
  ['FILE_TOO_LARGE', { ...fixture('sample.pdf', 'application/pdf', '%PDF-'), buffer: Buffer.alloc(MAX_FILE_BYTES + 1, 1) }],
  ['UNSUPPORTED_FILE_TYPE', fixture('sample.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', [0x50, 0x4b])],
  ['FILE_SIGNATURE_MISMATCH', fixture('sample.pdf', 'application/pdf', 'NOT_PDF')],
  ['FILE_SIGNATURE_MISMATCH', fixture('sample.png', 'image/jpeg', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  ['INVALID_SOURCE_METADATA', { ...fixture('sample.pdf', 'application/pdf', '%PDF-'), metadata: { title: '', sourceType: 'POLICY', sourceReference: '', uploadedBy: '' } }],
  ['MALWARE_DETECTED', { ...fixture('sample.pdf', 'application/pdf', '%PDF-'), malwareScan: { scannerReady: true, status: 'INFECTED', scanner: 'UAT_SCANNER' } }],
  ['MALWARE_SCAN_UNAVAILABLE', { ...fixture('sample.pdf', 'application/pdf', '%PDF-'), malwareScan: { scannerReady: false, status: '', scanner: '' } }],
];
const uploadReachable = reachableMainNodes(uploadWorkflow, 'admin-upload');
const quarantineWriter = uploadWorkflow.nodes.find((node) => node.name === 'RAG001 Write Quarantine Binary');
const malwareScannerNode = uploadWorkflow.nodes.find((node) => node.name === 'RAG001 Scan with Defender');

const checks = [];
for (const input of validCases) {
  const result = validateRagUpload(input);
  checks.push([`VALID_${result.fileExtension.toUpperCase()}`, result.reviewStatus === 'PENDING_REVIEW' && result.publishable === false && result.sha256Hex.length === 64]);
}
for (const [expectedCode, input] of rejectionCases) {
  let code = 'NO_ERROR';
  try { validateRagUpload(input); } catch (error) { code = error.code || error.message; }
  checks.push([`REJECT_${expectedCode}_${checks.length}`, code === expectedCode]);
}
checks.push(
  ['NEW_METADATA_TABLE', sql.includes('AI_RagDocumentTbl')],
  ['APPROVED_ONLY_VIEW', sql.includes('AI_ApprovedRagDocumentVw') && /MalwareScanStatus = 'CLEAN'[\s\S]+ReviewStatus = 'APPROVED'/.test(sql)],
  ['PENDING_DEFAULT', sql.includes("DEFAULT 'PENDING_REVIEW'")],
  ['NO_BINARY_IN_DB', !/(VARBINARY|IMAGE\s+NULL|FILESTREAM)/i.test(sql)],
  ['NO_ERP_MUTATION', !/(INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE)\s+(?:dbo\.)?(?:CF_|AR_|AI_ProductKnowledgeTbl)/i.test(sql)],
  ['UPLOAD_NO_UNAPPROVED_VECTOR_INSERT', !uploadReachable.has('Qdrant Vector Store') && !uploadReachable.has('Save OCR to DB')],
  ['DEFENDER_SCAN_GATE', uploadReachable.has('RAG001 Write Quarantine Binary') && uploadReachable.has('RAG001 Scan with Defender') && uploadReachable.has('RAG001 If Scan Clean')],
  ['SCANNER_FAIL_CLOSED', workflowText.includes('MALWARE_SCAN_UNAVAILABLE') && workflowText.includes('MALWARE_DETECTED')],
  ['QUERY_APPROVED_FILTER', queryText.includes('reviewStatus') && queryText.includes('malwareScanStatus')],
  ['FAIL_CLOSED_SCAN_POLICY', workflowText.includes('MALWARE_SCAN_UNAVAILABLE') && workflowText.includes('MALWARE_DETECTED')],
  ['GATEWAY_VERIFIED_IDENTITY', gateway.includes("'x-verified-user': verifiedAdminIdentity.username") && gateway.includes('AUTH_IDENTITY_VERIFICATION_FAILED')],
  ['N8N_COMPATIBLE_DOCUMENT_ID', !workflowText.includes('globalThis.crypto.randomUUID') && workflowText.includes("'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'")],
  ['UPLOAD_SUCCESS_HAS_FILE_FLAG', workflowText.includes('hasFile: true')],
  ['QUARANTINE_PATH_ALLOWED', n8nRuntime.includes("setDefault('N8N_RESTRICT_FILE_ACCESS_TO', process.env.RAG_QUARANTINE_DIR)")],
  ['WINDOWS_SAFE_QUARANTINE_WRITE', quarantineWriter?.type === 'n8n-nodes-base.code' && quarantineWriter?.parameters?.jsCode.includes("fs.writeFileSync(targetPath, buffer, { flag: 'wx' })") && n8nRuntime.includes("setDefault('NODE_FUNCTION_ALLOW_BUILTIN', 'fs,path')")],
  ['SCANNER_COMMAND_EXPRESSION', malwareScannerNode?.parameters?.command.startsWith('={{') && malwareScannerNode?.parameters?.command.includes('$env.RAG_SCAN_SCRIPT')],
);

let failed = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  if (!pass) failed += 1;
}
console.log(JSON.stringify({ task: 'RAG-001-PREFLIGHT', status: failed ? 'FAIL' : 'PASS', passed: checks.length - failed, total: checks.length }, null, 2));
if (failed) process.exitCode = 1;
