const fs = require('fs');
const path = require('path');
const assert = require('assert');

const workflowPath = path.resolve(__dirname, '..', 'n8n', 'API_Services', 'API_Execute.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const nodes = new Map(workflow.nodes.map((node) => [node.name, node]));
const targets = (name, output = 0) =>
  (workflow.connections[name]?.main?.[output] || []).map((connection) => connection.node);

assert(nodes.has('Execute Shared Auth Guard'), 'Shared Auth Guard caller node is missing');
assert.strictEqual(
  nodes.get('Execute Shared Auth Guard').parameters.workflowId.value,
  '9UxECqxRaPGMF8EM',
  'Shared Auth Guard workflow ID is incorrect'
);
assert.deepStrictEqual(targets('Is OPTIONS? (Execute)', 1), ['Execute Shared Auth Guard']);
assert.deepStrictEqual(targets('Execute Shared Auth Guard'), ['Is Authenticated? (Execute)']);
assert.deepStrictEqual(targets('Is Authenticated? (Execute)', 0), ['Apply Verified Identity']);
assert.deepStrictEqual(targets('Is Authenticated? (Execute)', 1), ['Prepare Audit - Execute Auth Error']);
assert.deepStrictEqual(targets('Apply Verified Identity'), ['Enforce API Capability']);
assert.deepStrictEqual(targets('Enforce API Capability'), ['Is API Authorized? (Execute)']);
assert.deepStrictEqual(targets('Is API Authorized? (Execute)', 0), ['Validate API Request']);
assert.deepStrictEqual(targets('Validate API Request'), ['Is API Request Valid?']);
assert.deepStrictEqual(targets('Is API Request Valid?', 0), ['Build Execute SQL']);
assert.deepStrictEqual(targets('Is API Request Valid?', 1), ['Prepare Audit - Execute Validation Error']);
assert.deepStrictEqual(targets('Is API Authorized? (Execute)', 1), ['Prepare Audit - Execute Authorization Error']);
assert.deepStrictEqual(targets('Build Execute SQL'), ['MS SQL Execute']);

assert(!nodes.has('Is UUID Token?'), 'Legacy UUID token branch must be removed');
assert(!nodes.has('Resolve UUID'), 'Legacy API_UserInfo copy must be removed');

const checkCode = nodes.get('Check Method Execute').parameters.jsCode;
assert(!checkCode.includes('uuidCache'), 'Entrypoint must not cache tokens');
assert(!checkCode.includes("token.split('.')['"), 'Entrypoint must not decode JWT identity');

const applyCode = nodes.get('Apply Verified Identity').parameters.jsCode;
assert(applyCode.includes('verifiedIdentity.internalUserId'));
assert(applyCode.includes("params['@Username']"));

const buildCode = nodes.get('Build Execute SQL').parameters.jsCode;
assert(buildCode.includes("$('Enforce API Capability').first().json"));
assert(buildCode.includes('AUTHORIZATION_REQUIRED'));
assert(!buildCode.includes('debug_username'));
assert(!buildCode.includes('debug_api_response'));

const sqlInbound = Object.entries(workflow.connections)
  .flatMap(([source, value]) => (value.main || []).flat().filter(Boolean).map((edge) => ({ source, target: edge.node })))
  .filter((edge) => edge.target === 'MS SQL Execute');
assert.deepStrictEqual(sqlInbound, [{ source: 'Build Execute SQL', target: 'MS SQL Execute' }]);

console.log('API Execute fail-closed contract tests passed.');
