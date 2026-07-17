const fs = require('fs');
const path = require('path');
const assert = require('assert');

const load = (name) => JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '..', 'n8n', 'API_Services', name), 'utf8'
));
const list = load('API_ListActive.json');
const config = load('API_GetConfig.json');
const nodes = (workflow) => new Map(workflow.nodes.map((node) => [node.name, node]));
const targets = (workflow, name, output = 0) =>
  (workflow.connections[name]?.main?.[output] || []).map((edge) => edge.node);

const listNodes = nodes(list);
assert(listNodes.has('Execute Shared Auth Guard (ListActive)'));
assert(listNodes.has('Is Authenticated? (ListActive)'));
assert(listNodes.has('Respond Auth Error (ListActive)'));
assert(listNodes.has('Filter List by Capability'));
assert.deepStrictEqual(targets(list, 'Is OPTIONS? (ListActive)', 1), ['Execute Shared Auth Guard (ListActive)']);
assert.deepStrictEqual(targets(list, 'Is Authenticated? (ListActive)', 0), ['MS SQL API_ListActive']);
assert.deepStrictEqual(targets(list, 'Is Authenticated? (ListActive)', 1), ['Prepare Audit - ListActive Auth Error']);
assert.deepStrictEqual(targets(list, 'MS SQL API_ListActive'), ['Filter List by Capability']);
assert(!listNodes.get('MS SQL API_ListActive').parameters.query.includes('@Username'));

const filterCode = listNodes.get('Filter List by Capability').parameters.jsCode;
const filterList = (capabilities, rows) => {
  const lookup = (name) => ({
    first: () => ({ json: name === 'Execute Shared Auth Guard (ListActive)'
      ? { verifiedIdentity: { capabilities } }
      : {} })
  });
  const input = { all: () => rows.map((json) => ({ json })) };
  return new Function('$', '$input', filterCode)(lookup, input)[0].json.records;
};
const catalogRows = [
  { ApiCode: '@doanh_so', DisplayName: 'Doanh số', StoredProcedure: 'SECRET_READ' },
  { ApiCode: '@khach_hang_insert', DisplayName: 'Khách hàng', StoredProcedure: 'SECRET_WRITE' },
  { ApiCode: '@unknown', DisplayName: 'Unknown', StoredProcedure: 'SECRET_UNKNOWN' }
];
assert.deepStrictEqual(filterList([], catalogRows), []);
assert.deepStrictEqual(filterList(['api.read'], catalogRows).map((row) => row.ApiCode), ['@doanh_so']);
assert.deepStrictEqual(filterList(['customers.write'], catalogRows).map((row) => row.ApiCode), ['@khach_hang_insert']);
assert(filterList(['*'], catalogRows).every((row) => !('StoredProcedure' in row)));

const configNodes = nodes(config);
for (const name of [
  'Execute Shared Auth Guard (GetConfig)', 'Is Authenticated? (GetConfig)',
  'Respond Auth Error (GetConfig)', 'Authorize GetConfig',
  'Is GetConfig Authorized?', 'Respond GetConfig Not Found',
  'Sanitize GetConfig Response'
]) assert(configNodes.has(name), `Missing ${name}`);
assert.deepStrictEqual(targets(config, 'Is OPTIONS? (GetConfig)', 1), ['Execute Shared Auth Guard (GetConfig)']);
assert.deepStrictEqual(targets(config, 'Is Authenticated? (GetConfig)', 0), ['Authorize GetConfig']);
assert.deepStrictEqual(targets(config, 'Is Authenticated? (GetConfig)', 1), ['Prepare Audit - GetConfig Auth Error']);
assert.deepStrictEqual(targets(config, 'Is GetConfig Authorized?', 0), ['Build GetConfig SQL']);
assert.deepStrictEqual(targets(config, 'Is GetConfig Authorized?', 1), ['Prepare Audit - GetConfig Not Found']);
assert.strictEqual(configNodes.get('Respond GetConfig Not Found').parameters.options.responseCode, 404);

const authorizeCode = configNodes.get('Authorize GetConfig').parameters.jsCode;
const authorize = (apiCode, capabilities) => {
  const lookup = (name) => ({ first: () => ({ json:
    name === 'Execute Shared Auth Guard (GetConfig)'
      ? { auth: { ok: true }, verifiedIdentity: { capabilities } }
      : name === 'Check Method GetConfig'
        ? { body: { ApiCode: apiCode } }
        : {}
  }) });
  return new Function('$', authorizeCode)(lookup)[0].json.catalogAuthorization;
};
assert.strictEqual(authorize('@doanh_so', ['api.read']).ok, true);
assert.strictEqual(authorize('@doanh_so', []).ok, false);
assert.strictEqual(authorize('@khach_hang_insert', ['api.read']).ok, false);
assert.strictEqual(authorize('@khach_hang_insert', ['customers.write']).ok, true);
assert.strictEqual(authorize('@not_real', ['*']).ok, false);

const sanitizeCode = configNodes.get('Sanitize GetConfig Response').parameters.jsCode;
const sanitizeInput = { all: () => [
  { json: { FieldCode: '@Username', IsSystemParam: 1, StoredProcedure: 'SECRET' } },
  { json: { FieldCode: '@TuNgay', FieldName: 'Từ ngày', IsSystemParam: 0, ControlType: 'date', StoredProcedure: 'SECRET' } }
] };
const sanitized = new Function('$input', sanitizeCode)(sanitizeInput)[0].json.filters;
assert.deepStrictEqual(sanitized.map((field) => field.FieldCode), ['@TuNgay']);
assert(!('StoredProcedure' in sanitized[0]));

console.log('API catalog authentication and capability tests passed.');
