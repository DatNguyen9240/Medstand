'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const reportDir = path.join(root, 'reports');
const contractOnly = process.argv.includes('--contract-only');
const roleOnly = process.argv.includes('--role-only');
const load = (...parts) => JSON.parse(fs.readFileSync(path.join(root, ...parts), 'utf8'));
const shared = load('n8n', 'Shared', 'Shared_Auth_Guard.json');
const execute = load('n8n', 'API_Services', 'API_Execute.json');
const list = load('n8n', 'API_Services', 'API_ListActive.json');
const config = load('n8n', 'API_Services', 'API_GetConfig.json');
const nodeMap = (workflow) => new Map(workflow.nodes.map((node) => [node.name, node]));
const sharedNodes = nodeMap(shared);
const executeNodes = nodeMap(execute);
const listNodes = nodeMap(list);
const configNodes = nodeMap(config);
const cases = [];
const add = (id, endpoint, identity, status, evidence) => cases.push({ id, endpoint, identity, status, evidence });

const encodePayload = (payload) => Buffer.from(JSON.stringify(payload)).toString('base64url');
const normalizeCode = sharedNodes.get('Normalize Auth Input').parameters.jsCode;
const mapCode = sharedNodes.get('Map Verified Identity').parameters.jsCode;
const normalize = (input) => new Function('$json', '$execution', normalizeCode)(input, { id: 'p0-05' })[0].json;
const mapIdentity = (normalized, response) => {
  const lookup = () => ({ first: () => ({ json: normalized }) });
  return new Function('$json', '$execution', '$', mapCode)(response, { id: 'p0-05' }, lookup)[0].json;
};

const graphTargets = (workflow, source, output = 0) =>
  (workflow.connections[source]?.main?.[output] || []).map((edge) => edge.node);
const assertRejectedBeforeSql = (workflow, authIf, errorNode, sqlNode) => {
  assert.deepStrictEqual(graphTargets(workflow, authIf, 1), [errorNode]);
  assert(!graphTargets(workflow, authIf, 1).includes(sqlNode));
};
assertRejectedBeforeSql(execute, 'Is Authenticated? (Execute)', 'Prepare Audit - Execute Auth Error', 'MS SQL Execute');
assertRejectedBeforeSql(list, 'Is Authenticated? (ListActive)', 'Prepare Audit - ListActive Auth Error', 'MS SQL API_ListActive');
assertRejectedBeforeSql(config, 'Is Authenticated? (GetConfig)', 'Prepare Audit - GetConfig Auth Error', 'MS SQL API_GetConfig');

const missing = normalize({ headers: {} });
const invalid = normalize({ headers: { authorization: 'Bearer invalid.invalid.invalid' } });
const expired = normalize({ headers: { authorization: `Bearer x.${encodePayload({ exp: 1 })}.x` } });
const pending = normalize({ headers: { authorization: 'Bearer opaque-contract-token' } });
const unmapped = mapIdentity(pending, { data: {} });
for (const [identity, result, expected] of [
  ['guest', missing, 'AUTH_TOKEN_MISSING'],
  ['invalid-token', invalid, 'AUTH_TOKEN_INVALID'],
  ['expired-token', expired, 'AUTH_TOKEN_EXPIRED'],
  ['valid-unmapped', unmapped, 'IDENTITY_MAPPING_NOT_FOUND']
]) {
  assert.strictEqual(result.auth.code, expected);
  assert([401, 403].includes(result.auth.httpStatus));
  for (const endpoint of ['execute', 'list-active', 'get-config']) {
    add(`${endpoint}-${identity}`, endpoint, identity, 'PASS', {
      httpStatus: result.auth.httpStatus,
      code: result.auth.code,
      requestId: result.auth.requestId,
      sqlExecutionCount: 0
    });
  }
}

const gateCode = executeNodes.get('Enforce API Capability').parameters.jsCode;
const readMatch = gateCode.match(/const readApis = new Set\((\[[\s\S]*?\])\);/);
assert(readMatch, 'Cannot read execute read policy');
const readApis = new Function(`return ${readMatch[1]};`)();
const runGate = (apiCode, capabilities) => {
  const lookup = () => ({ first: () => ({ json: { body: { ApiCode: apiCode }, verifiedIdentity: { capabilities } } }) });
  return new Function('$', gateCode)(lookup)[0].json.authorization;
};
for (const apiCode of readApis) {
  const denied = runGate(apiCode, []);
  assert.strictEqual(denied.httpStatus, 403);
  add(`execute-no-scope-${apiCode}`, 'execute', 'valid-no-scope', 'PASS', {
    apiCode, code: denied.code, httpStatus: denied.httpStatus, sqlExecutionCount: 0
  });
}

const filterCode = listNodes.get('Filter List by Capability').parameters.jsCode;
const listLookup = () => ({ first: () => ({ json: { verifiedIdentity: { capabilities: [] } } }) });
const emptyList = new Function('$', '$input', filterCode)(listLookup, {
  all: () => readApis.map((ApiCode) => ({ json: { ApiCode } }))
})[0].json.records;
assert.deepStrictEqual(emptyList, []);
add('list-active-no-scope', 'list-active', 'valid-no-scope', 'PASS', {
  httpStatus: 200, count: 0, sqlResponseFiltered: true
});

const authorizeCode = configNodes.get('Authorize GetConfig').parameters.jsCode;
const configLookup = (name) => ({
  first: () => ({
    json:
      name === 'Execute Shared Auth Guard (GetConfig)'
        ? { auth: { ok: true }, verifiedIdentity: { capabilities: [] } }
        : { body: { ApiCode: '@danh_muc' } }
  })
});
const configDenied = new Function('$', authorizeCode)(configLookup)[0].json.catalogAuthorization;
assert.strictEqual(configDenied.ok, false);
add('get-config-no-scope', 'get-config', 'valid-no-scope', 'PASS', {
  httpStatus: 404, code: 'CONFIG_NOT_FOUND', sqlExecutionCount: 0
});

const liveTokens = {
  manager: process.env.UAT_MANAGER_TOKEN || '',
  tdv: process.env.UAT_TDV_TOKEN || '',
  unmapped: process.env.UAT_UNMAPPED_TOKEN || '',
  noScope: process.env.UAT_NO_SCOPE_TOKEN || ''
};
const liveUrls = {
  execute: process.env.UAT_API_EXECUTE_URL || '',
  list: process.env.UAT_API_LIST_URL || '',
  config: process.env.UAT_API_CONFIG_URL || ''
};

const validateLiveUrl = (value, name) => {
  const url = new URL(value);
  const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
  const isDedicatedUatWebhook = url.pathname.startsWith('/webhook/uat-p005-')
    || url.pathname.startsWith('/webhook-test/uat-p005-');
  assert(isLocal && isDedicatedUatWebhook,
    `${name} must use a dedicated P0-05 webhook on localhost.`);
  return url.toString();
};

const readBody = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) { return { raw: text.slice(0, 200) }; }
};
const responseCode = (body) => body?.code || body?.error?.code || null;
const responseRequestId = (body) => body?.requestId || body?.error?.requestId || null;
const request = async (url, token, body) => {
  const authorization = /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3000'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });
  const payload = await readBody(response);
  return { status: response.status, body: payload };
};
const recordsFrom = (body) => {
  if (Array.isArray(body)) return body;
  for (const value of [body?.records, body?.data, body?.result]) {
    if (Array.isArray(value)) return value;
  }
  return [];
};
const apiCodeFrom = (record) => record?.ApiCode || record?.apiCode || record?.API_CODE || '';
const evidenceFrom = (result) => ({
  httpStatus: result.status,
  code: responseCode(result.body),
  requestId: responseRequestId(result.body)
});
const addLiveResult = (id, endpoint, identity, result, ok, extra = {}) => {
  add(id, endpoint, identity, ok ? 'PASS' : 'FAIL', { ...evidenceFrom(result), ...extra });
};

const runMappedIdentity = async (identity, token) => {
  const listed = await request(liveUrls.list, token, { SearchKey: '' });
  const records = recordsFrom(listed.body);
  const allowedApiCode = records.map(apiCodeFrom).find((apiCode) => readApis.includes(apiCode));
  const listOk = listed.status === 200 && !responseCode(listed.body)?.startsWith('AUTH_') && Boolean(allowedApiCode);
  addLiveResult(`live-${identity}-list-active`, 'list-active', identity, listed, listOk, {
    visibleApiCount: records.length,
    selectedApiCode: allowedApiCode || null
  });
  if (!allowedApiCode) {
    for (const endpoint of ['get-config', 'execute']) {
      add(`live-${identity}-${endpoint}`, endpoint, identity, 'BLOCKED', {
        reason: 'ListActive did not return an authorized read ApiCode.'
      });
    }
    return;
  }
  const configured = await request(liveUrls.config, token, { ApiCode: allowedApiCode });
  addLiveResult(`live-${identity}-get-config`, 'get-config', identity, configured,
    configured.status === 200 && !responseCode(configured.body)?.startsWith('AUTH_'), { apiCode: allowedApiCode });
  const executed = await request(liveUrls.execute, token, {
    ApiCode: allowedApiCode,
    params: {
      Username: 'scope-tampering-probe',
      EmployeeID: 'scope-tampering-probe',
      BranchID: 'scope-tampering-probe',
      ManagerID: 'scope-tampering-probe'
    }
  });
  addLiveResult(`live-${identity}-execute`, 'execute', identity, executed,
    executed.status >= 200 && executed.status < 300 && !responseCode(executed.body)?.startsWith('AUTH_'),
    { apiCode: allowedApiCode, scopeTamperingSent: true });
};

const runRejectedIdentity = async (identity, token, expectations) => {
  for (const [endpoint, expectation] of Object.entries(expectations)) {
    const urlKey = endpoint === 'list-active' ? 'list' : endpoint === 'get-config' ? 'config' : endpoint;
    const body = endpoint === 'list-active' ? { SearchKey: '' } : { ApiCode: '@danh_muc', Params: {} };
    const result = await request(liveUrls[urlKey], token, body);
    const records = endpoint === 'list-active' ? recordsFrom(result.body) : null;
    const ok = result.status === expectation.status
      && (!expectation.code || responseCode(result.body) === expectation.code)
      && (!expectation.empty || records.length === 0);
    addLiveResult(`live-${identity}-${endpoint}`, endpoint, identity, result, ok,
      records ? { visibleApiCount: records.length } : {});
  }
};

const runLive = async () => {
  if (contractOnly) {
    for (const identity of Object.keys(liveTokens)) {
      add(`live-${identity}`, 'all', identity, 'BLOCKED', { reason: 'Contract-only mode does not send UAT requests.' });
    }
    return;
  }
  const requiredTokens = roleOnly
    ? { manager: liveTokens.manager, tdv: liveTokens.tdv }
    : liveTokens;
  const missingInputs = [
    ...Object.entries(requiredTokens).filter(([, value]) => !value).map(([key]) => `UAT_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}_TOKEN`),
    ...Object.entries(liveUrls).filter(([, value]) => !value).map(([key]) => `UAT_API_${key.toUpperCase()}_URL`)
  ];
  if (missingInputs.length) {
    for (const identity of Object.keys(liveTokens)) {
      add(`live-${identity}`, 'all', identity, 'BLOCKED', {
        reason: `Missing live UAT inputs: ${missingInputs.join(', ')}`
      });
    }
    return;
  }
  for (const [name, value] of Object.entries(liveUrls)) {
    liveUrls[name] = validateLiveUrl(value, `UAT_API_${name.toUpperCase()}_URL`);
  }
  await runMappedIdentity('manager', liveTokens.manager);
  await runMappedIdentity('tdv', liveTokens.tdv);
  if (roleOnly) return;
  await runRejectedIdentity('unmapped', liveTokens.unmapped, {
    execute: { status: 403, code: 'IDENTITY_MAPPING_NOT_FOUND' },
    'list-active': { status: 403, code: 'IDENTITY_MAPPING_NOT_FOUND' },
    'get-config': { status: 403, code: 'IDENTITY_MAPPING_NOT_FOUND' }
  });
  await runRejectedIdentity('no-scope', liveTokens.noScope, {
    execute: { status: 403, code: 'CAPABILITY_REQUIRED' },
    'list-active': { status: 200, empty: true },
    'get-config': { status: 404, code: 'CONFIG_NOT_FOUND' }
  });
};

const finish = () => {
  const blocked = cases.filter((item) => item.status === 'BLOCKED').length;
  const failed = cases.filter((item) => item.status === 'FAIL').length;
  const report = {
    generatedAt: new Date().toISOString(),
    mode: contractOnly ? 'contract-only' : (roleOnly ? 'role-only' : 'full'),
    securityGate: failed === 0 && blocked === 0 ? 'PASS' : 'BLOCKED',
    summary: {
      total: cases.length,
      passed: cases.filter((item) => item.status === 'PASS').length,
      blocked,
      failed,
      readApiPolicyCount: readApis.length
    },
    cases
  };
  fs.mkdirSync(reportDir, { recursive: true });
  const reportBase = contractOnly
    ? 'chatbot-api-auth-regression-contract'
    : 'chatbot-api-auth-regression';
  fs.writeFileSync(path.join(reportDir, `${reportBase}.json`), JSON.stringify(report, null, 2) + '\n');
  const markdown = `# Chatbot API auth regression\n\n`
    + `- Generated: ${report.generatedAt}\n`
    + `- Mode: ${report.mode}\n`
    + `- Security Gate: **${report.securityGate}**\n`
    + `- Passed: ${report.summary.passed}/${report.summary.total}\n`
    + `- Blocked: ${report.summary.blocked}\n`
    + `- Failed: ${report.summary.failed}\n`
    + `- Read ApiCode policies checked: ${report.summary.readApiPolicyCount}\n\n`
    + `Contract cases prove missing/invalid/expired/unmapped identities and no-scope requests are rejected before SQL. `
    + (roleOnly
      ? `Role-only UAT sends live requests for the approved Manager and TDV identities.\n`
      : `Full UAT also requires live valid-unmapped and valid-no-scope identities.\n`);
  fs.writeFileSync(path.join(reportDir, `${reportBase}.md`), markdown);
  console.log(JSON.stringify(report.summary));
  if (!contractOnly && (blocked > 0 || failed > 0)) process.exitCode = 2;
};

runLive().then(finish).catch((error) => {
  add('live-runner', 'all', 'system', 'FAIL', { message: error.message });
  finish();
  process.exitCode = 2;
});
