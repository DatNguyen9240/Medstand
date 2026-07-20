'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { loadLocalEnv } = require('./lib/load-local-env');

const root = path.resolve(__dirname, '..');
loadLocalEnv(root);

const accounts = [
  'QLBH013.MED', 'NAMDINHB.MED', 'QLBH016.MED', 'BACNINHA.MED',
  'QLBH005.MED', 'HUEB.MED', 'QLBH010.MED', 'DANANGA.MED',
  'QLMN2', 'CanThoA', 'QLMD1', 'BinhPhuocA', 'QLBH024.MED',
];
const password = process.env.UAT_TEST_PASSWORD || '';
const gatewayBase = (process.env.UAT_GATEWAY_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const n8nBase = (process.env.E2E_N8N_URL || 'http://127.0.0.1:5678').replace(/\/$/, '');
const reportPath = path.join(root, 'reports', 'business-rule-v1', 'uat13-daily-work-runtime.json');

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
  assert.equal(body.code, 0, `${username}: ${body.msg || 'login failed'}`);
  assert(body.access_token, `${username}: login token missing`);
  return String(body.access_token);
}

async function ask(username, token) {
  const response = await fetch(`${n8nBase}/webhook/hook-ai-dainao`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Origin: 'https://medtest.bms79.com',
      'x-request-id': `req-daily-${username.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}`,
    },
    body: JSON.stringify({
      action: 'chat',
      text: 'Hôm nay em nên làm gì?',
      session_id: `uat-daily-${username}-${Date.now()}`,
      history: '',
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch (_) { body = { raw: text.slice(0, 200) }; }
  assert.equal(response.status, 200, `${username}: chat HTTP ${response.status} ${JSON.stringify(body)}`);
  const publicContext = JSON.stringify({
    status: body.status,
    code: body.code,
    apiCode: body.ApiCode || body.apiCode,
    message: String(body.message || '').slice(0, 160),
  });
  assert.equal(String(body.ApiCode || body.apiCode || '').toLowerCase(), '@tuyen_ban_hang', `${username}: wrong intent ${publicContext}`);
  assert(['SUCCESS', 'NO_DATA'].includes(body.status), `${username}: unexpected status ${body.status}`);
  assert(Array.isArray(body.data), `${username}: data must be an array`);
  assert(body.data.length <= 8, `${username}: route returned more than 8 priorities`);
  if (body.status === 'NO_DATA') {
    assert(String(body.message || '').includes('kiểm tra công nợ'), `${username}: missing actionable no-data guidance`);
  }
  return {
    username,
    status: body.status,
    apiCode: body.ApiCode || body.apiCode,
    count: body.data.length,
    requestId: body.requestId || null,
    result: 'PASS',
  };
}

async function main() {
  assert(password, 'UAT_TEST_PASSWORD is missing from .env.uat.local');
  const results = [];
  for (const username of accounts) {
    process.stdout.write(`[${username}] `);
    const token = await login(username);
    const result = await ask(username, token);
    results.push(result);
    console.log(`PASS ${result.status} ${result.count} rows`);
  }
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify({
    status: 'UAT13_DAILY_WORK_RUNTIME_PASS',
    testedAt: new Date().toISOString(),
    phrase: 'Hôm nay em nên làm gì?',
    expectedApiCode: '@tuyen_ban_hang',
    accountCount: results.length,
    results,
  }, null, 2)}\n`, 'utf8');
  console.log(`UAT13 daily-work runtime: PASS (${results.length}/${accounts.length})`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
