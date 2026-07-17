const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const json = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, ''));
const nodeMap = (workflow) => new Map(workflow.nodes.map((node) => [node.name, node]));
const targets = (workflow, name, output = 0) => (workflow.connections[name]?.main?.[output] || []).map((item) => item.node);

const shared = json('n8n/Shared/Shared_Auth_Guard.json');
const execute = json('n8n/API_Services/API_Execute.json');
const list = json('n8n/API_Services/API_ListActive.json');
const config = json('n8n/API_Services/API_GetConfig.json');

for (const [workflow, checkName] of [
  [execute, 'Check Method Execute'],
  [list, 'Check Method ListActive'],
  [config, 'Check Method GetConfig']
]) {
  const nodes = nodeMap(workflow);
  const code = nodes.get(checkName).parameters.jsCode;
  assert(code.includes("const serverRequestId = 'req-' + requestExecutionId"), `${checkName} must generate a server request ID`);
  assert(code.includes('correlationHintHash'), `${checkName} must hash validated correlation hints`);
  assert(code.includes('idempotencyKeyHash'), `${checkName} must hash validated idempotency keys`);
  assert(code.includes('_requestContext: requestContext'), `${checkName} must pass request context downstream`);
  const correlation = 'p104-contract-correlation';
  const runtime = new Function('$json', '$execution', code)({
    headers: { 'x-correlation-id': correlation, 'idempotency-key': 'p104-contract-idempotency' },
    body: {}, method: 'POST'
  }, { id: 'p104-entry-test' })[0].json._requestContext;
  assert(runtime.requestId.startsWith('req-p104-entry-test-'));
  assert.strictEqual(runtime.correlationHintHash, crypto.createHash('sha256').update(correlation).digest('hex'));
  assert.strictEqual(runtime.idempotencyKeyHash, crypto.createHash('sha256').update('p104-contract-idempotency').digest('hex'));

  for (const node of workflow.nodes.filter((item) => item.type === 'n8n-nodes-base.respondToWebhook')) {
    const headers = node.parameters.options?.responseHeaders?.entries || [];
    assert(headers.some((item) => item.name === 'X-Request-ID'), `${node.name} must return X-Request-ID`);
    assert(headers.some((item) => item.name === 'Access-Control-Expose-Headers' && item.value === 'X-Request-ID'), `${node.name} must expose X-Request-ID`);
  }
}

const sharedNodes = nodeMap(shared);
const normalizeCode = sharedNodes.get('Normalize Auth Input').parameters.jsCode;
assert(normalizeCode.includes('inheritedContext'), 'Shared auth must inherit entrypoint request context');
assert(!normalizeCode.includes("const requestId = 'auth-'"), 'Shared auth must not replace the server request ID');
const inherited = new Function('$json', '$execution', normalizeCode)(
  { headers: {}, _requestContext: { requestId: 'req-contract-test', n8nExecutionId: 'parent-1' } },
  { id: 'child-1' }
)[0].json;
assert.strictEqual(inherited.auth.requestId, 'req-contract-test');
assert.strictEqual(inherited._requestContext.n8nExecutionId, 'parent-1');
assert(sharedNodes.get('Map Verified Identity').parameters.jsCode.includes('auditSubjectHash'), 'Verified user must be represented by a one-way audit hash');

assert(nodeMap(execute).get('Format Execute Response').parameters.jsCode.includes("$('Check Method Execute').first().json._requestContext?.requestId"));
assert(nodeMap(list).get('Respond ListActive').parameters.responseBody.includes('requestId'));
assert(nodeMap(config).get('Respond GetConfig').parameters.responseBody.includes('requestId'));

const expectedBranches = [
  [execute, 'Format Execute Response', 0, 'Execute Success', 'Respond Execute'],
  [execute, 'Is Authenticated? (Execute)', 1, 'Execute Auth Error', 'Respond Auth Error (Execute)'],
  [execute, 'Is API Authorized? (Execute)', 1, 'Execute Authorization Error', 'Respond Authorization Error (Execute)'],
  [execute, 'Is API Request Valid?', 1, 'Execute Validation Error', 'Respond Validation Error (Execute)'],
  [list, 'Filter List by Capability', 0, 'ListActive Success', 'Respond ListActive'],
  [list, 'Is Authenticated? (ListActive)', 1, 'ListActive Auth Error', 'Respond Auth Error (ListActive)'],
  [config, 'Sanitize GetConfig Response', 0, 'GetConfig Success', 'Respond GetConfig'],
  [config, 'Is Authenticated? (GetConfig)', 1, 'GetConfig Auth Error', 'Respond Auth Error (GetConfig)'],
  [config, 'Is GetConfig Authorized?', 1, 'GetConfig Not Found', 'Respond GetConfig Not Found']
];

for (const [workflow, source, output, label, respond] of expectedBranches) {
  const prepare = `Prepare Audit - ${label}`;
  const write = `Write Audit - ${label}`;
  const nodes = nodeMap(workflow);
  assert.deepStrictEqual(targets(workflow, source, output), [prepare], `${source} must audit before response`);
  assert.deepStrictEqual(targets(workflow, prepare), [write]);
  assert.deepStrictEqual(targets(workflow, write, 0), [respond]);
  assert.deepStrictEqual(targets(workflow, write, 1), [respond], 'Audit failure must not suppress the API response');
  const auditCode = nodes.get(prepare).parameters.jsCode;
  assert(auditCode.includes('AI_WriteAPIRequestAudit'));
  assert(auditCode.includes('RowCountBucket'));
  assert(auditCode.includes('TransactionOutcome'));
  assert(!/(TargetName|TargetID|phone|password|headers\s*\[?['"]?authorization|cookie|paramsJSON|JSON\.stringify\(request)/i.test(auditCode), `${prepare} must not audit token, PII, or payload`);
}

const migration = fs.readFileSync(path.join(root, 'sql', 'Migrate_API_Request_Audit_AI.sql'), 'utf8');
for (const required of [
  'AI_API_RequestAudit', 'AI_WriteAPIRequestAudit', 'API_ReadRequestAudit_AI',
  'AI_PruneAPIRequestAudit', 'CorrelationHintHash', 'VerifiedUserHash',
  'IdempotencyKeyHash', 'TransactionOutcome', 'RowCountBucket',
  "DATEADD(DAY, -90", "('ADMIN', 'SECURITY', 'QA')", 'DENY SELECT'
]) assert(migration.includes(required), `Audit migration missing ${required}`);
assert(!/(TargetName|TargetID|Phone|Payload|Cookie|Authorization|AccessToken|RefreshToken)/i.test(migration), 'New request audit schema must not contain payload or PII columns');

console.log('P1-04 request ID and privacy-safe audit contract tests passed.');
