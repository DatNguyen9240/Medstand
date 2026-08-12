'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const uploadPath = path.join(root, 'n8n', 'AI_Core', 'AI_Upload_Reader.json');
const queryPath = path.join(root, 'n8n', 'AI_Core', 'AI_RAG_Query.json');
const cleanupPath = path.join(root, 'n8n', 'Cron_Jobs', 'CRON_CleanupRAG.json');
const upload = JSON.parse(fs.readFileSync(uploadPath, 'utf8'));
const query = JSON.parse(fs.readFileSync(queryPath, 'utf8'));
const cleanup = JSON.parse(fs.readFileSync(cleanupPath, 'utf8'));

function nodeOf(workflow, name) {
  const node = workflow.nodes.find((candidate) => candidate.name === name);
  if (!node) throw new Error(`Không tìm thấy node: ${name}`);
  return node;
}

function mainEdge(node) {
  return { node, type: 'main', index: 0 };
}

function sqlNode(id, name, sql, position, credentials) {
  return {
    parameters: { operation: 'executeQuery', query: sql },
    id,
    name,
    type: 'n8n-nodes-base.microsoftSql',
    typeVersion: 1,
    position,
    credentials,
  };
}

function addOperationRule(routeRules, operation) {
  if (routeRules.some((rule) => rule.outputKey === operation)) return;
  routeRules.push({
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ leftValue: '={{ $json.operation }}', rightValue: operation, operator: { type: 'string', operation: 'equals' } }],
      combinator: 'and',
    },
    renameOutput: true,
    outputKey: operation,
  });
}

const sqlCredentials = nodeOf(upload, 'RAG002 Review Action DB').credentials;
const managedNames = new Set([
  'RAG003 Lifecycle DB',
  'RAG003 If Withdraw Success',
  'RAG003 Delete Withdrawn Vectors',
  'RAG003 Respond Lifecycle',
]);
upload.nodes = upload.nodes.filter((node) => !managedNames.has(node.name));
for (const name of managedNames) delete upload.connections[name];

const authNode = nodeOf(upload, 'Check Auth & Format');
function keepFirstOccurrence(source, block) {
  const firstIndex = source.indexOf(block);
  if (firstIndex < 0) return source;
  const prefix = source.slice(0, firstIndex + block.length);
  return prefix + source.slice(firstIndex + block.length).split(block).join('');
}
const authLines = authNode.parameters.jsCode.split('\n');
let seenEffectiveFrom = false;
let seenEffectiveTo = false;
authNode.parameters.jsCode = authLines.filter((line) => {
  if (line.includes('const effectiveFromDate =')) {
    if (seenEffectiveFrom) return false;
    seenEffectiveFrom = true;
  }
  if (line.includes('const effectiveToDate =')) {
    if (seenEffectiveTo) return false;
    seenEffectiveTo = true;
  }
  return true;
}).join('\n');
const firstDateValidation = authNode.parameters.jsCode.indexOf('  else {\n    const datePattern = ');
if (firstDateValidation >= 0) {
  const secondDateValidation = authNode.parameters.jsCode.indexOf('  else {\n    const datePattern = ', firstDateValidation + 1);
  if (secondDateValidation >= 0) {
    const validationEnd = authNode.parameters.jsCode.indexOf('  return [{ json: {', secondDateValidation);
    authNode.parameters.jsCode = authNode.parameters.jsCode.slice(0, secondDateValidation) + authNode.parameters.jsCode.slice(validationEnd);
  }
}
authNode.parameters.jsCode = authNode.parameters.jsCode
  .replace(
    "const reviewOperations = ['LIST_REVIEWS', 'GET_REVIEW', 'SAVE_REVIEW', 'APPROVE_REVIEW', 'REJECT_REVIEW'];",
    "const reviewOperations = ['LIST_REVIEWS', 'GET_REVIEW', 'SAVE_REVIEW', 'APPROVE_REVIEW', 'REJECT_REVIEW', 'LIST_LIFECYCLE', 'WITHDRAW_DOCUMENT'];",
  )
  .replace(
    "const reason = String(body.reason || '').trim();",
    authNode.parameters.jsCode.includes('const effectiveFromDate =')
      ? "const reason = String(body.reason || '').trim();"
      : "const reason = String(body.reason || '').trim();\n  const effectiveFromDate = String(body.effectiveFromDate || '').trim();\n  const effectiveToDate = String(body.effectiveToDate || '').trim();",
  )
  .replace(
    "if (operation !== 'LIST_REVIEWS' && !uuidPattern.test(documentID))",
    "if (!['LIST_REVIEWS', 'LIST_LIFECYCLE'].includes(operation) && !uuidPattern.test(documentID))",
  )
  .replace(
    "else if (['SAVE_REVIEW', 'APPROVE_REVIEW', 'REJECT_REVIEW'].includes(operation) && !actor)",
    "else if (['SAVE_REVIEW', 'APPROVE_REVIEW', 'REJECT_REVIEW', 'WITHDRAW_DOCUMENT'].includes(operation) && !actor)",
  )
  .replace(
    "else if (operation === 'REJECT_REVIEW' && !reason)",
    "else if (['REJECT_REVIEW', 'WITHDRAW_DOCUMENT'].includes(operation) && !reason)",
  )
  .replace(
    "else if (reason.length > 1000) { code = 'REASON_TOO_LARGE'; message = 'Lý do vượt quá 1.000 ký tự.'; }",
    authNode.parameters.jsCode.includes('const datePattern =')
      ? "else if (reason.length > 1000) { code = 'REASON_TOO_LARGE'; message = 'Lý do vượt quá 1.000 ký tự.'; }"
      : "else if (reason.length > 1000) { code = 'REASON_TOO_LARGE'; message = 'Lý do vượt quá 1.000 ký tự.'; }\n  else {\n    const datePattern = /^\\d{4}-\\d{2}-\\d{2}$/;\n    const isValidDate = (value) => !value || (datePattern.test(value) && new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) === value);\n    if (!isValidDate(effectiveFromDate) || !isValidDate(effectiveToDate)) { code = 'INVALID_EFFECTIVE_DATE'; message = 'Ngày hiệu lực không hợp lệ.'; }\n    else if (effectiveFromDate && effectiveToDate && effectiveToDate < effectiveFromDate) { code = 'INVALID_EFFECTIVE_RANGE'; message = 'Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.'; }\n  }",
  )
  .replace(
    "requestID,\n    code,",
    "requestID,\n    effectiveFromDate,\n    effectiveToDate,\n    code,",
  );

const reviewList = nodeOf(upload, 'RAG002 Review List');
reviewList.parameters.query = reviewList.parameters.query.replace(
  'D.ReviewStatus AS reviewStatus,',
  "D.ReviewStatus AS reviewStatus,\n  CONVERT(VARCHAR(10),D.EffectiveFrom,23) AS effectiveFromDate,\n  CONVERT(VARCHAR(10),CASE WHEN D.EffectiveTo IS NULL THEN NULL ELSE DATEADD(DAY,-1,D.EffectiveTo) END,23) AS effectiveToDate,",
);

const reviewDetail = nodeOf(upload, 'RAG002 Review Detail');
reviewDetail.parameters.query = reviewDetail.parameters.query.replace(
  'D.ReviewStatus AS reviewStatus,',
  "D.ReviewStatus AS reviewStatus,\n  CONVERT(VARCHAR(10),D.EffectiveFrom,23) AS effectiveFromDate,\n  CONVERT(VARCHAR(10),CASE WHEN D.EffectiveTo IS NULL THEN NULL ELSE DATEADD(DAY,-1,D.EffectiveTo) END,23) AS effectiveToDate,",
);

const reviewAction = nodeOf(upload, 'RAG002 Review Action DB');
reviewAction.parameters.query = reviewAction.parameters.query
  .replace(
    "DECLARE @RequestID VARCHAR(100)=NULLIF('{{ $json.requestID.replace(/'/g, \"''\") }}','');",
    "DECLARE @RequestID VARCHAR(100)=NULLIF('{{ $json.requestID.replace(/'/g, \"''\") }}','');\nDECLARE @EffectiveFrom DATETIME2(0)=TRY_CONVERT(DATETIME2(0),NULLIF('{{ $json.effectiveFromDate }}',''));\nDECLARE @EffectiveTo DATETIME2(0)=CASE WHEN NULLIF('{{ $json.effectiveToDate }}','') IS NULL THEN NULL ELSE DATEADD(DAY,1,TRY_CONVERT(DATETIME2(0),'{{ $json.effectiveToDate }}')) END;",
  )
  .replace(
    "ELSE IF @Operation='REJECT_REVIEW' AND LEN(LTRIM(RTRIM(@Reason)))=0 BEGIN SET @Error='REJECT_REASON_REQUIRED'; SET @Message=N'Vui lòng nhập lý do từ chối.'; END",
    "ELSE IF @Operation='REJECT_REVIEW' AND LEN(LTRIM(RTRIM(@Reason)))=0 BEGIN SET @Error='REJECT_REASON_REQUIRED'; SET @Message=N'Vui lòng nhập lý do từ chối.'; END\nELSE IF @Operation='APPROVE_REVIEW' AND @EffectiveTo IS NOT NULL AND @EffectiveFrom IS NOT NULL AND @EffectiveTo<=@EffectiveFrom BEGIN SET @Error='INVALID_EFFECTIVE_RANGE'; SET @Message=N'Khoảng hiệu lực không hợp lệ.'; END",
  )
  .replace(
    "SET ReviewStatus='APPROVED',ReviewedBy=@Actor,ReviewedAt=SYSUTCDATETIME(),ReviewNote=NULL,UpdatedAt=SYSUTCDATETIME()",
    "SET ReviewStatus='APPROVED',ReviewedBy=@Actor,ReviewedAt=SYSUTCDATETIME(),ReviewNote=NULL,EffectiveFrom=@EffectiveFrom,EffectiveTo=@EffectiveTo,UpdatedAt=SYSUTCDATETIME()",
  )
  .replace(
    "@MalwareStatus AS malwareScanStatus;",
    "@MalwareStatus AS malwareScanStatus,\n  CONVERT(VARCHAR(33),@EffectiveFrom,126)+CASE WHEN @EffectiveFrom IS NULL THEN '' ELSE 'Z' END AS effectiveFrom,\n  CONVERT(VARCHAR(33),@EffectiveTo,126)+CASE WHEN @EffectiveTo IS NULL THEN '' ELSE 'Z' END AS effectiveTo;",
  );

const prepareApproved = nodeOf(upload, 'RAG002 Prepare Approved Document');
prepareApproved.parameters.jsCode = prepareApproved.parameters.jsCode.replace(
  "malwareScanStatus: 'CLEAN'",
  "malwareScanStatus: 'CLEAN',\n  effectiveFrom: row.effectiveFrom || '',\n  effectiveTo: row.effectiveTo || '',\n  effectiveFromEpoch: row.effectiveFrom ? Math.floor(Date.parse(row.effectiveFrom) / 1000) : 0,\n  effectiveToEpoch: row.effectiveTo ? Math.floor(Date.parse(row.effectiveTo) / 1000) : 253402300799",
);

const approvedLoader = nodeOf(upload, 'RAG002 Approved Document Loader');
approvedLoader.parameters.options.metadata = `={
  "documentID": "{{ $json.documentID }}",
  "title": "{{ $json.title }}",
  "sourceType": "{{ $json.sourceType }}",
  "sourceReference": "{{ $json.sourceReference }}",
  "contentVersion": {{ $json.contentVersion }},
  "editRevision": {{ $json.editRevision }},
  "reviewStatus": "APPROVED",
  "malwareScanStatus": "CLEAN",
  "effectiveFrom": "{{ $json.effectiveFrom }}",
  "effectiveTo": "{{ $json.effectiveTo }}",
  "effectiveFromEpoch": {{ $json.effectiveFromEpoch }},
  "effectiveToEpoch": {{ $json.effectiveToEpoch }}
}`;

const route = nodeOf(upload, 'RAG002 Route Review Operation');
const routeRules = route.parameters.rules.values;
for (const operation of ['LIST_LIFECYCLE', 'WITHDRAW_DOCUMENT']) addOperationRule(routeRules, operation);

const lifecycleDb = sqlNode('rag003-lifecycle-db', 'RAG003 Lifecycle DB', `DECLARE @DocumentID UNIQUEIDENTIFIER=TRY_CONVERT(UNIQUEIDENTIFIER,NULLIF('{{ $json.documentID }}',''));
EXEC dbo.API_RagDocumentLifecycle_AI
  @Operation='{{ $json.operation }}',
  @DocumentID=@DocumentID,
  @Actor=NULLIF('{{ $json.actor.replace(/'/g, "''") }}',''),
  @Reason=NULLIF(N'{{ $json.reason.replace(/'/g, "''") }}',N''),
  @RequestID=NULLIF('{{ $json.requestID.replace(/'/g, "''") }}','');`, [900, 1040], sqlCredentials);

const ifWithdrawSuccess = {
  parameters: { conditions: { boolean: [{ value1: "={{ $json.status === 'success' && $json.code === 'WITHDRAW_DOCUMENT' }}", value2: true }] } },
  id: 'rag003-if-withdraw-success', name: 'RAG003 If Withdraw Success', type: 'n8n-nodes-base.if', typeVersion: 1, position: [1120, 1040],
};
const deleteWithdrawnVectors = {
  parameters: {
    method: 'POST',
    url: "={{ $env.QDRANT_URL ? $env.QDRANT_URL : 'http://127.0.0.1:6333' }}/collections/medstand-policies/points/delete?wait=true",
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={ "filter": { "must": [ { "key": "metadata.documentID", "match": { "value": "{{ $json.documentID }}" } } ] } }',
  },
  id: 'rag003-delete-withdrawn-vectors', name: 'RAG003 Delete Withdrawn Vectors', type: 'n8n-nodes-base.httpRequest', typeVersion: 4, position: [1340, 960], onError: 'continueRegularOutput',
};
const respondLifecycle = {
  parameters: {
    jsCode: `const dbRows = $('RAG003 Lifecycle DB').all().map((item) => item.json);
const first = dbRows[0] || {};
return [{ json: dbRows.length > 1 || first.code === 'LIFECYCLE_LIST'
  ? { status: 'success', code: 'LIFECYCLE_LIST', records: dbRows }
  : { ...first, vectorCleanupRequested: first.status === 'success' && first.code === 'WITHDRAW_DOCUMENT' }
}];`,
  },
  id: 'rag003-respond-lifecycle', name: 'RAG003 Respond Lifecycle', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1560, 1040],
};

upload.nodes.push(lifecycleDb, ifWithdrawSuccess, deleteWithdrawnVectors, respondLifecycle);
const routeConnections = upload.connections['RAG002 Route Review Operation'].main;
routeConnections.splice(routeConnections.length - 1, 0, [mainEdge('RAG003 Lifecycle DB')], [mainEdge('RAG003 Lifecycle DB')]);
upload.connections['RAG003 Lifecycle DB'] = { main: [[mainEdge('RAG003 If Withdraw Success')]] };
upload.connections['RAG003 If Withdraw Success'] = { main: [[mainEdge('RAG003 Delete Withdrawn Vectors')], [mainEdge('RAG003 Respond Lifecycle')]] };
upload.connections['RAG003 Delete Withdrawn Vectors'] = { main: [[mainEdge('RAG003 Respond Lifecycle')]] };

nodeOf(query, 'Prep Qdrant Body').parameters.jsCode = `const vector = $input.first().json.data[0].embedding;
const nowEpoch = Math.floor(Date.now() / 1000);
return [{ json: {
  vector,
  limit: 100,
  with_payload: true,
  filter: {
    must: [
      { key: 'metadata.reviewStatus', match: { value: 'APPROVED' } },
      { key: 'metadata.malwareScanStatus', match: { value: 'CLEAN' } },
      { key: 'metadata.effectiveFromEpoch', range: { lte: nowEpoch } },
      { key: 'metadata.effectiveToEpoch', range: { gt: nowEpoch } }
    ]
  }
} }];`;

const querySqlCredentials = { microsoftSql: { ...sqlCredentials.microsoftSql } };
const validateNames = new Set(['RAG003 Validate Active Documents', 'RAG003 Keep Active Points']);
query.nodes = query.nodes.filter((node) => !validateNames.has(node.name));
for (const name of validateNames) delete query.connections[name];
const validateActive = sqlNode('rag003-validate-active-documents', 'RAG003 Validate Active Documents', `DECLARE @Ids NVARCHAR(MAX)=N'{{ (($json.result || []).map(p => p.payload?.metadata?.documentID || '').filter(Boolean).join(',')).replace(/'/g, "''") }}';
SELECT CONVERT(VARCHAR(36),DocumentID) AS documentID
FROM dbo.AI_ApprovedRagContentVw
WHERE CONVERT(VARCHAR(36),DocumentID) IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@Ids,','));`, [1120, 220], querySqlCredentials);
const keepActive = {
  parameters: {
    jsCode: `const response = $('Qdrant: Find Docs').first().json || {};
const activeIDs = new Set($input.all().map((item) => String(item.json.documentID || '').toLowerCase()).filter(Boolean));
return [{ json: { ...response, result: (response.result || []).filter((point) => activeIDs.has(String(point.payload?.metadata?.documentID || '').toLowerCase())) } }];`,
  },
  id: 'rag003-keep-active-points', name: 'RAG003 Keep Active Points', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1340, 220],
};
query.nodes.push(validateActive, keepActive);
query.connections['Qdrant: Find Docs'] = { main: [[mainEdge('RAG003 Validate Active Documents')]] };
query.connections['RAG003 Validate Active Documents'] = { main: [[mainEdge('RAG003 Keep Active Points')]] };
query.connections['RAG003 Keep Active Points'] = { main: [[mainEdge('Prep OpenAI Chat Body')]] };

cleanup.name = 'K6 · RAG Lifecycle Cleanup';
nodeOf(cleanup, 'Prepare Cleanup Variables').parameters.jsCode = "return [{ json: { nowEpoch: Math.floor(Date.now() / 1000), requestedAt: new Date().toISOString() } }];";
const cleanupRequest = nodeOf(cleanup, 'Qdrant HTTP Request (Drop Expired)');
cleanupRequest.parameters.url = "={{ $env.QDRANT_URL ? $env.QDRANT_URL : 'http://127.0.0.1:6333' }}/collections/medstand-policies/points/delete?wait=true";
cleanupRequest.parameters.bodyParameters = undefined;
cleanupRequest.parameters.specifyBody = 'json';
cleanupRequest.parameters.jsonBody = '={ "filter": { "must": [ { "key": "metadata.effectiveToEpoch", "range": { "lte": {{ $json.nowEpoch }} } } ] } }';
nodeOf(cleanup, 'Blackbox Logging (Save logs)').parameters.jsCode = "return [{ json: { status: 'success', code: 'RAG_LIFECYCLE_CLEANUP', executedAt: new Date().toISOString(), qdrant: $input.first().json } }];";

for (const [filePath, workflow] of [[uploadPath, upload], [queryPath, query], [cleanupPath, cleanup]]) {
  fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2) + '\n');
}
console.log(JSON.stringify({
  task: 'RAG-003-N8N-SOURCE', status: 'UPDATED',
  uploadNodes: upload.nodes.length, queryNodes: query.nodes.length, cleanupNodes: cleanup.nodes.length,
  sha256: crypto.createHash('sha256').update(JSON.stringify({ upload, query, cleanup })).digest('hex'),
}, null, 2));
