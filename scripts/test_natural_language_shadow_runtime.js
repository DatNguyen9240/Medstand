'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { loadLocalEnv } = require('./lib/load-local-env');

const root = path.resolve(__dirname, '..');
loadLocalEnv(root);
const n8nBase = (process.env.E2E_N8N_URL || 'http://127.0.0.1:5678').replace(/\/$/, '');
const gatewayBase = (process.env.UAT_GATEWAY_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const password = process.env.UAT_TEST_PASSWORD || '';
const reportPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, 'reports', 'natural-language-p0', 'shadow-runtime-smoke.json');
const accounts = [
  { role: 'manager', username: 'QLBH013.MED' },
  { role: 'sale', username: 'NAMDINHB.MED' },
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
    signal: AbortSignal.timeout(30_000),
  });
  const envelope = await response.json();
  assert(response.ok && envelope.data, `${username}: login gateway HTTP ${response.status}`);
  const body = JSON.parse(unprotect(envelope.data));
  assert.equal(body.code, 0, `${username}: login failed`);
  assert(body.access_token, `${username}: access token missing`);
  return String(body.access_token);
}

async function call(pathname, token, body) {
  const response = await fetch(`${n8nBase}/webhook/${pathname}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Origin: 'https://medtest.bms79.com',
      'x-request-id': `req-shadow-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch (_) { parsed = { raw: text.slice(0, 300) }; }
  return { httpStatus: response.status, body: parsed };
}

async function runAccount(account) {
  assert(password, 'UAT_TEST_PASSWORD is missing');
  const token = await login(account.username);
  const conversationId = `shadow-${account.role}-${Date.now()}`;

  const catalog = await call('api-list-active', token, {});
  const catalogRows = Array.isArray(catalog.body) ? catalog.body : (catalog.body.records || catalog.body.data || []);
  assert.equal(catalog.httpStatus, 200, `${account.username}: catalog HTTP ${catalog.httpStatus}`);
  assert.equal(catalogRows.length, 24, `${account.username}: approved API catalog must contain 24 entries`);

  const shadow = await call('hook-ai-dainao', token, {
    action: 'chat',
    text: 'Hôm nay em nên làm gì?',
    conversationId,
    session_id: conversationId,
    history: '',
  });
  assert.equal(shadow.httpStatus, 200, `${account.username}: shadow HTTP ${shadow.httpStatus}`);
  assert.equal(shadow.body.naturalLanguageMode, 'SHADOW', `${account.username}: Shadow flag missing`);
  assert(shadow.body.shadowPrediction, `${account.username}: shadow prediction missing`);
  assert.equal(shadow.body.shadowPrediction.apiCode, '@tuyen_ban_hang', `${account.username}: unexpected shadow API prediction`);
  assert.equal(Number(shadow.body.count || 0), 0, `${account.username}: natural language must not return business rows in Shadow Mode`);
  assert(Array.isArray(shadow.body.data) && shadow.body.data.length === 0, `${account.username}: natural language executed an API in Shadow Mode`);

  const casual = await call('hook-ai-dainao', token, {
    action: 'chat',
    text: 'Xin chào, bạn có thể giúp gì cho tôi?',
    conversationId: `${conversationId}-casual`,
    session_id: `${conversationId}-casual`,
    history: '',
  });
  assert.equal(casual.httpStatus, 200, `${account.username}: casual chat HTTP ${casual.httpStatus}`);
  assert(String(casual.body.message || casual.body.output || casual.body.reply || '').trim(), `${account.username}: casual chat response is empty`);
  assert(!String(casual.body.ApiCode || casual.body.apiCode || '').startsWith('@'), `${account.username}: casual chat invoked a business API`);

  const explicit = await call('hook-ai-dainao', token, {
    action: 'chat',
    text: '@tuyen_ban_hang',
    conversationId: `${conversationId}-explicit`,
    session_id: `${conversationId}-explicit`,
    history: '',
  });
  assert.equal(explicit.httpStatus, 200, `${account.username}: explicit @ HTTP ${explicit.httpStatus}`);
  assert.notEqual(explicit.body.naturalLanguageMode, 'SHADOW', `${account.username}: explicit @ command was incorrectly shadow-blocked`);
  const explicitApi = String(explicit.body.ApiCode || explicit.body.apiCode || '').toLowerCase();
  assert.equal(explicitApi, '@tuyen_ban_hang', `${account.username}: explicit @ command mapped incorrectly`);
  assert(['SUCCESS', 'NO_DATA'].includes(String(explicit.body.status || '').toUpperCase()), `${account.username}: explicit @ status ${explicit.body.status}`);

  return {
    username: account.username,
    role: account.role,
    result: 'PASS',
    checks: {
      approvedApiCatalog: { result: 'PASS', count: catalogRows.length },
      naturalLanguageShadow: {
        result: 'PASS',
        predictedInternalIntent: shadow.body.shadowPrediction.internalIntent,
        predictedApiCode: shadow.body.shadowPrediction.apiCode,
        confidence: shadow.body.shadowPrediction.confidence,
        returnedBusinessRows: 0,
      },
      casualChat: { result: 'PASS', businessApiExecuted: false },
      explicitCommand: { result: 'PASS', apiCode: explicitApi, status: explicit.body.status },
    },
  };
}

async function main() {
  const results = [];
  for (const account of accounts) results.push(await runAccount(account));
  const report = {
    status: 'NATURAL_LANGUAGE_SHADOW_RUNTIME_PASS',
    testedAt: new Date().toISOString(),
    environment: 'local-n8n+medtest-api',
    naturalLanguageMode: 'SHADOW',
    accountCount: results.length,
    totalChecks: results.length * 4,
    results,
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
