'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', 'n8n', 'Shared', 'Shared_Auth_Guard.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

function node(name) {
  const found = workflow.nodes.find((item) => item.name === name);
  assert(found, `Missing workflow node: ${name}`);
  return found;
}

function executeCode(code, args) {
  const names = Object.keys(args);
  const values = names.map((name) => args[name]);
  return new Function(...names, code)(...values);
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

const normalizeCode = node('Normalize Auth Input').parameters.jsCode;
const mapCode = node('Map Verified Identity').parameters.jsCode;
const failureCode = node('Return Auth Failure').parameters.jsCode;
const execution = { id: 'contract-test' };

function normalize(input) {
  return executeCode(normalizeCode, { $json: input, $execution: execution })[0].json;
}

function mapIdentity(normalized, apiResponse) {
  const lookup = () => ({ first: () => ({ json: normalized }) });
  return executeCode(mapCode, {
    $json: apiResponse,
    $execution: execution,
    $: lookup,
  })[0].json;
}

const nodeNames = new Set(workflow.nodes.map((item) => item.name));
assert.strictEqual(nodeNames.size, workflow.nodes.length, 'Workflow node names must be unique');
assert.strictEqual(
  workflow.nodes.filter((item) => item.type === 'n8n-nodes-base.executeWorkflowTrigger').length,
  1,
  'Shared guard must expose exactly one sub-workflow trigger',
);
assert.strictEqual(
  workflow.nodes.some((item) => item.type === 'n8n-nodes-base.webhook'),
  false,
  'Shared guard must not expose a public webhook',
);

for (const [source, outputs] of Object.entries(workflow.connections)) {
  assert(nodeNames.has(source), `Connection source does not exist: ${source}`);
  for (const output of outputs.main || []) {
    for (const edge of output || []) {
      assert(nodeNames.has(edge.node), `Connection target does not exist: ${edge.node}`);
    }
  }
}

const missing = normalize({ headers: {} });
assert.strictEqual(missing.auth.ok, false);
assert.strictEqual(missing.auth.httpStatus, 401);
assert.strictEqual(missing.auth.code, 'AUTH_TOKEN_MISSING');
assert.strictEqual(missing._authInternal.canVerify, false);
const publicFailure = executeCode(failureCode, { $json: missing })[0].json;
assert.strictEqual(publicFailure._authInternal, undefined, 'Failure output must remove internal auth state');

const expiredToken = `x.${encodePayload({ exp: 1 })}.x`;
const expired = normalize({ headers: { authorization: `Bearer ${expiredToken}` } });
assert.strictEqual(expired.auth.code, 'AUTH_TOKEN_EXPIRED');
assert.strictEqual(expired._authInternal.canVerify, false);

const malformed = normalize({ headers: { authorization: 'Bearer header.not-json.signature' } });
assert.strictEqual(malformed.auth.code, 'AUTH_TOKEN_INVALID');

const opaqueToken = 'opaque-token-for-contract-test';
const pending = normalize({ headers: { authorization: `Bearer ${opaqueToken}` } });
assert.strictEqual(pending._authInternal.canVerify, true);
assert.strictEqual(pending._authInternal.token, opaqueToken);

const cookieToken = 'opaque-cookie-token';
const cookiePending = normalize({ headers: { cookie: `theme=dark; auth_token=${encodeURIComponent(cookieToken)}` } });
assert.strictEqual(cookiePending._authInternal.canVerify, true);
assert.strictEqual(cookiePending._authInternal.token, cookieToken);

const verified = mapIdentity(pending, {
  data: {
    username: 'USER-01',
    EmployeeID: 'EMP-01',
    BranchID: 'B01,B02',
    Role: 'Manager',
    permissions: ['REPORT:READ:BRANCH'],
  },
});
assert.strictEqual(verified.auth.ok, true);
assert.strictEqual(verified.auth.code, 'AUTHENTICATED');
assert.strictEqual(verified.verifiedIdentity.internalUserId, 'USER-01');
assert.deepStrictEqual(verified.verifiedIdentity.branchIds, ['B01', 'B02']);
assert.deepStrictEqual(verified.verifiedIdentity.capabilities, ['REPORT:READ:BRANCH']);
assert.strictEqual(JSON.stringify(verified).includes(opaqueToken), false, 'Output must not expose token');

const managerBaseline = mapIdentity(pending, {
  data: { username: 'MANAGER-01', EmployeeID: 'EMP-M01', Manager: 1 },
});
assert.deepStrictEqual(managerBaseline.verifiedIdentity.capabilities, ['api.read']);
assert.strictEqual(managerBaseline.verifiedIdentity.scopeContext.capabilitySource, 'verified-business-role-baseline');

const tdvBaseline = mapIdentity(pending, {
  data: { username: 'TDV-01', EmployeeID: 'EMP-T01', Manager: 0 },
});
assert.deepStrictEqual(tdvBaseline.verifiedIdentity.capabilities, ['api.read']);

const noScope = mapIdentity(pending, {
  data: { username: 'TECHNICAL-01', EmployeeID: 'EMP-X01' },
});
assert.deepStrictEqual(noScope.verifiedIdentity.capabilities, []);
assert.strictEqual(noScope.verifiedIdentity.scopeContext.capabilitySource, 'none');

const unmapped = mapIdentity(pending, { data: {} });
assert.strictEqual(unmapped.auth.ok, false);
assert.strictEqual(unmapped.auth.httpStatus, 403);
assert.strictEqual(unmapped.auth.code, 'IDENTITY_MAPPING_NOT_FOUND');

const rejected = mapIdentity(pending, { error: { message: 'Unauthorized' }, statusCode: 401 });
assert.strictEqual(rejected.auth.ok, false);
assert.strictEqual(rejected.auth.httpStatus, 401);
assert.strictEqual(rejected.auth.code, 'AUTH_TOKEN_INVALID');

console.log('Shared Auth Guard contract: STATIC_CONTRACT_PASS');
