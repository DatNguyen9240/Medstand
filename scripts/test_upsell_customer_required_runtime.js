'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadLocalEnv } = require('./lib/load-local-env');

const root = path.resolve(__dirname, '..');
loadLocalEnv(root);

const password = process.env.UAT_TEST_PASSWORD || '';
const gatewayBase = (process.env.UAT_GATEWAY_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const n8nBase = (process.env.E2E_N8N_URL || 'http://127.0.0.1:5678').replace(/\/$/, '');
const accounts = ['QLBH013.MED', 'NAMDINHB.MED'];
const crossBranchCases = [
  { username: 'QLMD1', customerId: 'NDB001' },
  { username: 'QLBH024.MED', customerId: 'NDB001' },
];

function protect(payload) {
  const input = Buffer.from(Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'), 'utf8');
  const output = Buffer.alloc(input.length);
  for (let index = 0; index < input.length; index += 1) output[index] = input[index] ^ 107;
  return output.toString('base64');
}

function unprotect(value) {
  const input = Buffer.from(value, 'base64');
  const output = Buffer.alloc(input.length);
  for (let index = 0; index < input.length; index += 1) output[index] = input[index] ^ 107;
  return Buffer.from(output.toString('utf8'), 'base64').toString('utf8');
}

async function login(username) {
  const response = await fetch(`${gatewayBase}/api/gateway`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: protect({ method: 'POST', endpoint: '/api/login', body: { username, password } }) }),
    signal: AbortSignal.timeout(45_000),
  });
  const envelope = await response.json();
  assert(response.ok && envelope.data, `${username}: gateway login HTTP ${response.status}`);
  const result = JSON.parse(unprotect(envelope.data));
  assert.strictEqual(result.code, 0, result.msg || `${username}: login failed`);
  assert(result.access_token, `${username}: missing access token`);
  return String(result.access_token);
}

async function testAccount(username) {
  const token = await login(username);
  const response = await fetch(`${n8nBase}/webhook/api-execute`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Origin: 'https://medtest.bms79.com',
    },
    body: JSON.stringify({ ApiCode: '@upsell_goi_y', params: {} }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json();
  assert.strictEqual(response.status, 422, `${username}: expected HTTP 422, got ${response.status}`);
  assert.strictEqual(body.code, 'VALIDATION_ERROR', `${username}: expected VALIDATION_ERROR`);
  assert(Array.isArray(body.data) && body.data.length === 0, `${username}: generic upsell data leaked`);
  assert(String(body.message || '').trim(), `${username}: validation message is missing`);
  return { username, httpStatus: response.status, code: body.code, count: body.count, noGenericData: true };
}

async function testCrossBranch({ username, customerId }) {
  const token = await login(username);
  const response = await fetch(`${n8nBase}/webhook/api-execute`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Origin: 'https://medtest.bms79.com',
    },
    body: JSON.stringify({
      ApiCode: '@upsell_goi_y',
      params: { '@MaKhachHang': customerId, '@TopN': 10 },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json();
  assert.strictEqual(response.status, 403, `${username}: expected cross-branch HTTP 403, got ${response.status}`);
  assert.strictEqual(body.status, 'OUT_OF_SCOPE', `${username}: expected OUT_OF_SCOPE status`);
  assert.strictEqual(body.code, 'OUT_OF_SCOPE', `${username}: expected OUT_OF_SCOPE code`);
  assert(Array.isArray(body.data) && body.data.length === 0, `${username}: cross-branch customer data leaked`);
  assert.strictEqual(Number(body.count || 0), 0, `${username}: cross-branch result count must be zero`);
  return { username, customerId, httpStatus: response.status, status: body.status, noDataLeak: true };
}

async function main() {
  assert(password, 'Missing UAT_TEST_PASSWORD in local environment.');
  const results = [];
  for (const username of accounts) results.push(await testAccount(username));
  const crossBranchResults = [];
  for (const item of crossBranchCases) crossBranchResults.push(await testCrossBranch(item));
  const report = {
    status: 'UPSELL_CUSTOMER_REQUIRED_N8N_RUNTIME_PASS',
    scopeGuard: 'PASS',
    testedAt: new Date().toISOString(),
    results,
    crossBranchResults,
  };
  const reportPath = path.join(root, 'reports', 'business-rule-v1', 'upsell-customer-required-runtime.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
