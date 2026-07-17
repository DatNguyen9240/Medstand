const fs = require('fs');
const path = require('path');
const assert = require('assert');

const workflowPath = path.resolve(__dirname, '..', 'n8n', 'API_Services', 'API_Execute.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const nodes = new Map(workflow.nodes.map((node) => [node.name, node]));
const targets = (name, output = 0) =>
  (workflow.connections[name]?.main?.[output] || []).map((connection) => connection.node);

assert(nodes.has('Enforce API Capability'));
assert(nodes.has('Is API Authorized? (Execute)'));
assert(nodes.has('Respond Authorization Error (Execute)'));
assert.deepStrictEqual(targets('Apply Verified Identity'), ['Enforce API Capability']);
assert.deepStrictEqual(targets('Enforce API Capability'), ['Is API Authorized? (Execute)']);
assert.deepStrictEqual(targets('Is API Authorized? (Execute)', 0), ['Validate API Request']);
assert.deepStrictEqual(targets('Validate API Request'), ['Is API Request Valid?']);
assert.deepStrictEqual(targets('Is API Request Valid?', 0), ['Build Execute SQL']);
assert.deepStrictEqual(targets('Is API Request Valid?', 1), ['Prepare Audit - Execute Validation Error']);
assert.deepStrictEqual(targets('Is API Authorized? (Execute)', 1), ['Prepare Audit - Execute Authorization Error']);
assert.deepStrictEqual(targets('Build Execute SQL'), ['MS SQL Execute']);

const applyCode = nodes.get('Apply Verified Identity').parameters.jsCode;
for (const key of ['@employeeid', '@branchid', '@managerid', '@ceoid']) {
  assert(applyCode.includes(key), `Reserved scope key ${key} is not removed`);
}
assert(applyCode.includes("params['@Username']"));
assert(applyCode.includes("params['@SYSEmployeeID']"));

const gateCode = nodes.get('Enforce API Capability').parameters.jsCode;
assert(gateCode.includes("'@doanh_so'"));
assert(gateCode.includes("'@lap_don_hang': 'orders.write'"));
assert(gateCode.includes("'@khach_hang_insert': 'customers.write'"));
assert(gateCode.includes("'@san_pham_trong_tam_import': 'products.import'"));
assert(gateCode.includes("operationType = 'DENY'"));
assert(gateCode.includes("httpStatus: ok ? 200 : 403"));

const runGate = (input) => {
  const lookup = (name) => ({ first: () => ({ json: name === 'Apply Verified Identity' ? input : {} }) });
  return new Function('$', gateCode)(lookup)[0].json.authorization;
};
assert.strictEqual(runGate({ body: { ApiCode: '@doanh_so' }, verifiedIdentity: { capabilities: ['api.read'] } }).ok, true);
assert.strictEqual(runGate({ body: { ApiCode: '@doanh_so' }, verifiedIdentity: { capabilities: [] } }).httpStatus, 403);
assert.strictEqual(runGate({ body: { ApiCode: '@unknown' }, verifiedIdentity: { capabilities: ['*'] } }).ok, false);
assert.strictEqual(runGate({ body: { ApiCode: '@khach_hang_insert' }, verifiedIdentity: { capabilities: ['api.read'] } }).ok, false);
assert.strictEqual(runGate({ body: { ApiCode: '@khach_hang_insert' }, verifiedIdentity: { capabilities: ['customers.write'] } }).ok, true);
assert.strictEqual(runGate({ body: { ApiCode: '@san_pham_trong_tam_import' }, verifiedIdentity: { capabilities: ['products.import'] } }).ok, true);
assert.strictEqual(runGate({ body: { ApiCode: '@lap_don_hang' }, verifiedIdentity: { capabilities: ['orders.write'] } }).ok, true);

const request = {
  body: {
    ApiCode: '@doanh_so',
    params: {
      '@Username': 'attacker', '@EmployeeID': 'all', '@BranchID': 'all',
      '@ManagerID': 'all', '@CeoID': 'all', '@TuNgay': '2026-07-01'
    }
  }
};
const identity = { internalUserId: 'verified.user', employeeId: 'MED001', capabilities: ['api.read'] };
const applyLookup = (name) => ({ first: () => ({ json: name === 'Check Method Execute' ? request : {} }) });
const sanitized = new Function('$', '$json', applyCode)(applyLookup, {
  auth: { ok: true }, verifiedIdentity: identity
})[0].json.body.params;
assert.strictEqual(sanitized['@Username'], 'verified.user');
assert.strictEqual(sanitized['@SYSEmployeeID'], 'MED001');
assert.strictEqual(sanitized['@TuNgay'], '2026-07-01');
assert(!('@BranchID' in sanitized));
assert(!('@ManagerID' in sanitized));
assert(!('@CeoID' in sanitized));

const sqlInbound = Object.entries(workflow.connections)
  .flatMap(([source, value]) => (value.main || []).flat().filter(Boolean).map((edge) => ({ source, target: edge.node })))
  .filter((edge) => edge.target === 'MS SQL Execute');
assert.deepStrictEqual(sqlInbound, [{ source: 'Build Execute SQL', target: 'MS SQL Execute' }]);

console.log('API Execute capability gate contract tests passed.');
