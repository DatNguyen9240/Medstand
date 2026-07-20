'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { loadLocalEnv } = require('./lib/load-local-env');

const root = path.resolve(__dirname, '..');
loadLocalEnv(root);

const manifest = JSON.parse(fs.readFileSync(
  path.join(root, 'reports', 'business-rule-v1', 'uat13-suggestion-fixture-manifest.json'),
  'utf8',
));
const accountPlans = manifest.verification.apiChecks.map((row) => ({
  username: row.username,
  customerId: row.customerId,
  rootItemId: row.rootItemId,
  region: String(manifest.plan.find((group) => group.users.includes(row.username))?.customer?.BranchID || '').toUpperCase(),
}));
const password = process.env.UAT_TEST_PASSWORD || '';
const gatewayBase = (process.env.UAT_GATEWAY_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const n8nBase = (process.env.E2E_N8N_URL || 'http://127.0.0.1:5678').replace(/\/$/, '');
const reportPath = path.join(root, 'reports', 'business-rule-v1', 'uat13-acceptance-result.json');

function protect(payload) {
  const input = Buffer.from(Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'), 'utf8');
  const output = Buffer.alloc(input.length);
  for (let i = 0; i < input.length; i += 1) output[i] = input[i] ^ 107;
  return output.toString('base64');
}

function unprotect(value) {
  const input = Buffer.from(value, 'base64');
  const output = Buffer.alloc(input.length);
  for (let i = 0; i < input.length; i += 1) output[i] = input[i] ^ 107;
  return Buffer.from(output.toString('utf8'), 'base64').toString('utf8');
}

async function login(username) {
  const response = await fetch(`${gatewayBase}/api/gateway`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: protect({ method: 'POST', endpoint: '/api/login', body: { username, password } }) }),
    signal: AbortSignal.timeout(30_000),
  });
  const envelope = await response.json();
  assert(response.ok && envelope.data, `${username}: login gateway HTTP ${response.status}`);
  const body = JSON.parse(unprotect(envelope.data));
  assert.equal(body.code, 0, `${username}: login failed`);
  assert(body.access_token, `${username}: access token missing`);
  return String(body.access_token);
}

async function webhook(pathname, token, body, headers = {}) {
  const response = await fetch(`${n8nBase}/webhook/${pathname}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Origin: 'https://medtest.bms79.com',
      'x-request-id': `req-accept-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      ...headers,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch (_) { parsed = { raw: text.slice(0, 200) }; }
  return { httpStatus: response.status, body: parsed };
}

function assertEnvelope(username, apiCode, response, allowedStatuses = ['SUCCESS']) {
  assert.equal(response.httpStatus, 200, `${username}/${apiCode}: HTTP ${response.httpStatus}`);
  assert.equal(response.body.success, true, `${username}/${apiCode}: success must be true`);
  assert(allowedStatuses.includes(response.body.status), `${username}/${apiCode}: status ${response.body.status}`);
  assert(Array.isArray(response.body.data), `${username}/${apiCode}: data must be an array`);
  assert.equal(response.body.count, response.body.data.length, `${username}/${apiCode}: count mismatch`);
}

async function runAccount(plan, allCustomers) {
  const username = plan.username;
  process.stdout.write(`[${username}] `);
  let token = await login(username);
  let authRetries = 0;
  async function call(pathname, body, headers = {}) {
    let response = await webhook(pathname, token, body, headers);
    if (response.httpStatus === 401) {
      authRetries += 1;
      assert(authRetries <= 1, `${username}: repeated 401 after re-login`);
      await new Promise((resolve) => setTimeout(resolve, 500));
      token = await login(username);
      response = await webhook(pathname, token, body, headers);
    }
    return response;
  }
  const checks = {};

  const catalog = await call('api-list-active', {});
  const catalogRows = Array.isArray(catalog.body) ? catalog.body : (catalog.body.records || catalog.body.data || []);
  assert.equal(catalog.httpStatus, 200, `${username}: catalog HTTP ${catalog.httpStatus}`);
  assert.equal(catalogRows.length, 24, `${username}: expected 24 APIs`);
  checks.catalog = { result: 'PASS', count: catalogRows.length };

  const order = await call('api-execute', {
    ApiCode: '@goi_ydon_hang', params: { '@MaKhachHang': plan.customerId, '@TopN': 10 },
  });
  assertEnvelope(username, '@goi_ydon_hang', order);
  assert(order.body.data.length >= 2, `${username}: expected at least two order suggestions`);
  assert(order.body.data.some((row) => row.DoTinCay === 'PERSONAL_CYCLE_ELIGIBLE'), `${username}: personal cycle evidence missing`);
  checks.orderSuggestion = { result: 'PASS', count: order.body.count };

  const upsell = await call('api-execute', {
    ApiCode: '@upsell_goi_y', params: { '@MaKhachHang': plan.customerId, '@TopN': 10 },
  });
  assertEnvelope(username, '@upsell_goi_y', upsell);
  assert(upsell.body.data.length > 0, `${username}: upsell returned no rows`);
  assert(upsell.body.data.every((row) => Number(row.AvailableStock ?? row.TonKho ?? 0) > 0), `${username}: upsell contains non-sellable stock`);
  checks.upsell = { result: 'PASS', count: upsell.body.count };

  const related = await call('api-execute', {
    ApiCode: '@goi_ydon_thuoc', params: { '@timkiem': plan.rootItemId },
  });
  assertEnvelope(username, '@goi_ydon_thuoc', related);
  assert(related.body.data.length > 0, `${username}: related products returned no rows`);
  assert(related.body.data.every((row) => String(row.ItemID || '') !== plan.rootItemId), `${username}: root product leaked into related results`);
  checks.relatedProducts = { result: 'PASS', count: related.body.count };

  const shadowConversationId = `accept-shadow-${username}-${Date.now()}`;
  const dailyShadow = await call('hook-ai-dainao', {
    action: 'chat', text: 'Hôm nay em nên làm gì?', conversationId: shadowConversationId, session_id: shadowConversationId, history: '',
  });
  assert.equal(dailyShadow.httpStatus, 200, `${username}: daily Shadow HTTP ${dailyShadow.httpStatus}`);
  assert.equal(dailyShadow.body.naturalLanguageMode, 'SHADOW', `${username}: natural-language Shadow marker missing`);
  assert.equal(dailyShadow.body.shadowPrediction?.apiCode, '@tuyen_ban_hang', `${username}: Shadow prediction mapped to wrong API`);
  assert(Array.isArray(dailyShadow.body.data) && dailyShadow.body.data.length === 0, `${username}: Shadow text executed a business API`);
  checks.dailyWorkShadow = { result: 'PASS', predictedApiCode: dailyShadow.body.shadowPrediction.apiCode, executedRows: 0 };

  const dailyCommandId = `accept-command-${username}-${Date.now()}`;
  const daily = await call('hook-ai-dainao', {
    action: 'chat', text: '@tuyen_ban_hang', conversationId: dailyCommandId, session_id: dailyCommandId, history: '',
  });
  assert.equal(daily.httpStatus, 200, `${username}: daily @ command HTTP ${daily.httpStatus}`);
  assert.equal(String(daily.body.ApiCode || daily.body.apiCode || '').toLowerCase(), '@tuyen_ban_hang', `${username}: daily @ command mapped to wrong API`);
  assert(['SUCCESS', 'NO_DATA'].includes(daily.body.status), `${username}: daily @ command status ${daily.body.status}`);
  assert(Array.isArray(daily.body.data) && daily.body.data.length <= 8, `${username}: daily priorities must be <= 8`);
  checks.dailyWorkCommand = { result: 'PASS', status: daily.body.status, count: daily.body.data.length };

  const foreignCustomer = plan.region === 'MN' ? 'NDB001' : 'AG0020';
  assert(allCustomers.includes(foreignCustomer) && foreignCustomer !== plan.customerId, `${username}: invalid cross-region fixture`);
  const scope = await call('api-execute', {
    ApiCode: '@upsell_goi_y', params: { '@MaKhachHang': foreignCustomer, '@TopN': 10 },
  });
  const scopePass = [200, 403, 422].includes(scope.httpStatus)
    && Number(scope.body.count || 0) === 0
    && !JSON.stringify(scope.body.data || []).includes(foreignCustomer);
  checks.crossScope = {
    result: scopePass ? 'PASS' : 'FAIL',
    requestedCustomer: foreignCustomer,
    httpStatus: scope.httpStatus,
    status: scope.body.status || scope.body.code,
    leakedRowCount: Number(scope.body.count || 0),
  };

  const preview = await call('api-execute', {
    ApiCode: '@lap_don_hang', params: { '@MaKhachHang': plan.customerId, '@ItemList': '[]' },
  }, { 'Idempotency-Key': `accept-preview-${username}-${Date.now()}` });
  assert.equal(preview.httpStatus, 200, `${username}: preview HTTP ${preview.httpStatus}`);
  assert.equal(preview.body.uiTemplate, 'CART', `${username}: order must remain a cart preview`);
  checks.orderPreview = { result: 'PASS', uiTemplate: preview.body.uiTemplate };

  const accountResult = Object.values(checks).every((check) => check.result === 'PASS') ? 'PASS' : 'FAIL';
  console.log(accountResult);
  return { username, customerId: plan.customerId, rootItemId: plan.rootItemId, authRetries, result: accountResult, checks };
}

async function main() {
  assert(password, 'UAT_TEST_PASSWORD is missing from .env.uat.local');
  assert.equal(accountPlans.length, 13, 'Fixture manifest must cover 13 accounts');
  const allCustomers = [...new Set(accountPlans.map((plan) => plan.customerId))];
  const results = [];
  for (const plan of accountPlans) results.push(await runAccount(plan, allCustomers));
  const failedAccounts = results.filter((result) => result.result === 'FAIL');
  const report = {
    status: failedAccounts.length ? 'UAT13_ACCEPTANCE_FAIL' : 'UAT13_ACCEPTANCE_PASS',
    testedAt: new Date().toISOString(),
    environment: 'local+n8n+medtest',
    accountCount: results.length,
    checksPerAccount: 8,
    totalChecks: results.length * 8,
    visualUiStatus: 'PENDING_BROWSER_CONNECTION',
    failedAccounts: failedAccounts.map((result) => result.username),
    results,
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const passedChecks = results.reduce((total, result) => total + Object.values(result.checks).filter((check) => check.result === 'PASS').length, 0);
  console.log(`UAT13 ACCEPTANCE ${failedAccounts.length ? 'FAIL' : 'PASS'}: ${passedChecks}/${report.totalChecks} checks`);
  if (failedAccounts.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
