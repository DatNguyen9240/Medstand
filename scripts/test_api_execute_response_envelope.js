const fs = require('fs');
const path = require('path');
const assert = require('assert');

const workflow = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '..', 'n8n', 'API_Services', 'API_Execute.json'), 'utf8'
));
const frontend = fs.readFileSync(
  path.resolve(__dirname, '..', 'chatbot-widget', 'js', 'chatbot-api-engine.js'), 'utf8'
);
const nodes = new Map(workflow.nodes.map((node) => [node.name, node]));
const formatCode = nodes.get('Format Execute Response').parameters.jsCode;
const buildCode = nodes.get('Build Execute SQL').parameters.jsCode;
assert(buildCode.includes('BEGIN TRY'));
assert(buildCode.includes("'MISSING_PARAMETER' AS Severity"));
assert(buildCode.includes("'SYSTEM_ERROR' AS Severity"));
assert(!buildCode.includes('ERROR_MESSAGE() AS Msg'));

const run = (rows) => {
  const lookup = (name) => ({ first: () => ({ json: name === 'Enforce API Capability'
    ? { auth: { requestId: 'req-test' } }
    : { _isAgent: false, body: {} } }) });
  return new Function('$input', '$', formatCode)(
    { all: () => rows.map((json) => ({ json })) }, lookup
  )[0].json;
};

const requiredFields = ['success', 'code', 'status', 'errorCode', 'message', 'data', 'count', 'ApiCode', 'contractVersion', 'requestId', 'metadata'];
for (const body of [run([]), run([{ Value: 1 }]), run([{ Msg: 'Vui lòng cung cấp mã khách hàng.', MsgType: 1 }])]) {
  for (const field of requiredFields) assert(field in body, `Missing envelope field: ${field}`);
}

const noData = run([]);
assert.strictEqual(noData.success, true);
assert.strictEqual(noData.code, 'NO_DATA');
assert.strictEqual(noData.status, 'NO_DATA');
assert.strictEqual(noData.count, 0);
assert.deepStrictEqual(noData.data, []);

const success = run([{ Value: 1 }, { Value: 2 }]);
assert.strictEqual(success.code, 'OK');
assert.strictEqual(success.status, 'SUCCESS');
assert.strictEqual(success.count, 2);

const metadata = run([{ Value: 1, RuleVersion: 'BR-TEST', RuleSource: 'TEST_SOURCE', StockDataStatus: 'PHYSICAL_ONLY_UNVERIFIED' }]);
assert.strictEqual(metadata.metadata.ruleVersion, 'BR-TEST');
assert.strictEqual(metadata.metadata.source, 'TEST_SOURCE');
assert.strictEqual(metadata.metadata.freshness, 'PHYSICAL_ONLY_UNVERIFIED');

const validation = run([{ Msg: 'Vui lòng cung cấp mã khách hàng.', MsgType: 1 }]);
assert.strictEqual(validation.success, false);
assert.strictEqual(validation.code, 'VALIDATION_ERROR');
assert.strictEqual(validation._httpStatus, 422);
assert.strictEqual(validation.count, 0);

const forbidden = run([{ Msg: 'Bạn không có quyền xem dữ liệu này.', MsgType: 1 }, { Value: 1 }]);
assert.strictEqual(forbidden.code, 'OUT_OF_SCOPE');
assert.strictEqual(forbidden.status, 'OUT_OF_SCOPE');
assert.strictEqual(forbidden._httpStatus, 403);
assert.strictEqual(forbidden.count, 0);

for (const name of ['Respond Auth Error (Execute)', 'Respond Authorization Error (Execute)']) {
  const body = nodes.get(name).parameters.responseBody;
  for (const field of requiredFields) assert(body.includes(field), `${name} missing ${field}`);
}

const responseNode = nodes.get('Respond Execute');
assert(responseNode.parameters.responseBody.includes('_httpStatus'));
assert.strictEqual(responseNode.parameters.options.responseCode, "={{ $('Format Execute Response').first().json._httpStatus || 200 }}");
assert(frontend.includes("gatewayError.code = payload.code || 'GATEWAY_ERROR'"));
assert(frontend.includes("err && err.code === 'VALIDATION_ERROR'"));

console.log('API Execute response envelope: STATIC_CONTRACT_PASS');
