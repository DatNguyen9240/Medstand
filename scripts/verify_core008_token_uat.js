'use strict';

/* CORE-008 token/gateway UAT. Read-only; never prints credentials or tokens. */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GATEWAY = process.env.MEDSTAND_GATEWAY_URL || 'http://localhost:3000/api/gateway';

function readEnv(filePath) {
  const values = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function encrypt(value, key = 107) {
  const base64 = Buffer.from(String(value), 'utf8').toString('base64');
  let xor = '';
  for (const character of base64) xor += String.fromCharCode(character.charCodeAt(0) ^ key);
  return Buffer.from(xor, 'utf8').toString('base64');
}

function decrypt(value, key = 107) {
  const xor = Buffer.from(String(value), 'base64').toString('utf8');
  let base64 = '';
  for (const character of xor) base64 += String.fromCharCode(character.charCodeAt(0) ^ key);
  return Buffer.from(base64, 'base64').toString('utf8');
}

function findToken(value) {
  if (!value || typeof value !== 'object') return '';
  for (const key of ['access_token', 'accessToken', 'AccessToken', 'token']) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
  }
  for (const child of Object.values(value)) {
    const token = findToken(child);
    if (token) return token;
  }
  return '';
}

async function gatewayCall(endpoint, body, token = '') {
  const response = await fetch(GATEWAY, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data: encrypt(JSON.stringify({ method: 'POST', endpoint, body })) }),
    signal: AbortSignal.timeout(45000),
  });
  let payload = JSON.parse(await response.text());
  if (payload && typeof payload.data === 'string') payload = JSON.parse(decrypt(payload.data));
  return { httpStatus: response.status, payload };
}

async function login(username, password) {
  const response = await gatewayCall('/api/login', { username, password });
  const token = findToken(response.payload);
  if (response.httpStatus !== 200 || !token) throw new Error(`Login failed for ${username}.`);
  return token;
}

async function execute(token, apiCode, params) {
  return gatewayCall('/webhook/api-execute', { ApiCode: apiCode, params }, token);
}

function requiredContract(row) {
  return Boolean(row && row.ReasonText && row.PrimaryReasonCode && row.RecommendationReasonCodes
    && row.RuleSourceCodes && row.RuleSourceLabel && row.RuleCode === 'BR-RECOMMENDATION-008'
    && row.RuleVersion === '1.0.0' && row.CalculatedAt);
}

async function main() {
  const env = readEnv(path.join(ROOT, '.env.uat.local'));
  if (!env.UAT_TEST_PASSWORD) throw new Error('Missing UAT_TEST_PASSWORD in .env.uat.local.');

  const token = await login('QLMN2', env.UAT_TEST_PASSWORD);
  const cases = [
    ['PRODUCT_PERSONAL_HISTORY', '@goi_ydon_hang', { '@MaKhachHang': 'UATV2_CTH_A', '@TopN': 10 }, 'PERSONAL_HISTORY'],
    ['ROUTE_PERSONAL_HISTORY', '@tuyen_ban_hang', { '@MaKhachHang': 'UATV2_CTH_A', '@TopN': 5 }, 'PERSONAL_HISTORY'],
    ['ROUTE_POLICY_DEFAULT', '@tuyen_ban_hang', { '@MaKhachHang': 'UATV2_CTH_C', '@TopN': 5 }, 'POLICY_DEFAULT'],
    ['ROUTE_NO_HISTORY', '@tuyen_ban_hang', { '@MaKhachHang': 'UATV2_CTH_UNRATED', '@TopN': 5 }, 'NO_HISTORY'],
  ];

  const checks = [];
  for (const [name, apiCode, params, expectedMode] of cases) {
    const response = await execute(token, apiCode, params);
    const rows = Array.isArray(response.payload?.data) ? response.payload.data : [];
    const row = rows[0];
    const pass = response.httpStatus === 200
      && response.payload?.status === 'SUCCESS'
      && response.payload?.ApiCode === apiCode
      && Boolean(response.payload?.requestId)
      && rows.length > 0
      && requiredContract(row)
      && row.CycleComputationMode === expectedMode
      && (expectedMode !== 'NO_HISTORY' || (row.CycleStatus === 'UNKNOWN' && row.NgayDuKien === null && row.ConLaiNgay === null))
      && (expectedMode !== 'POLICY_DEFAULT' || String(row.ReasonText).includes('mốc chính sách'));
    checks.push({
      Case: name,
      Pass: pass,
      HttpStatus: response.httpStatus,
      Status: response.payload?.status || null,
      ApiCode: response.payload?.ApiCode || null,
      RequestID: response.payload?.requestId || null,
      RowCount: rows.length,
      CycleComputationMode: row?.CycleComputationMode || null,
      CycleStatus: row?.CycleStatus || null,
      PrimaryReasonCode: row?.PrimaryReasonCode || null,
      RuleVersion: row?.RuleVersion || null,
      RuleSourceLabel: row?.RuleSourceLabel || null,
    });
  }

  const pass = checks.every((check) => check.Pass);
  console.log(JSON.stringify({
    Task: 'CORE-008-TOKEN-UAT',
    Status: pass ? 'PASS' : 'FAIL',
    Transport: 'AUTHENTICATED_GATEWAY_TO_N8N',
    UserName: 'QLMN2',
    MutationExecuted: false,
    Checks: checks,
  }, null, 2));
  if (!pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'CORE-008-TOKEN-UAT', Status: 'ERROR', Error: error.message }, null, 2));
  process.exitCode = 1;
});
