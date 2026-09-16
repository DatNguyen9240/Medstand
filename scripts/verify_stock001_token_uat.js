'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GATEWAY = process.env.MEDSTAND_GATEWAY_URL || 'http://localhost:3000/api/gateway';

function readEnv(filePath) {
  const values = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (!match) continue;
    values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
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
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ data: encrypt(JSON.stringify({ method: 'POST', endpoint, body })) }),
    signal: AbortSignal.timeout(30000),
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

async function chat(username, token, message) {
  const conversationId = `stock001-token-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const response = await gatewayCall('/webhook/hook-ai-dainao', {
    action: 'chat',
    text: message,
    session_id: conversationId,
    conversationId,
    resetConversationId: '',
    files: [],
    history: '',
  }, token);
  return {
    UserName: username,
    Message: message,
    HttpStatus: response.httpStatus,
    Status: response.payload?.status,
    ApiCode: response.payload?.ApiCode || response.payload?.apiCode,
    RequestID: response.payload?.requestId || null,
    Rows: Array.isArray(response.payload?.data) ? response.payload.data : [],
  };
}

function invalidSellableRows(rows) {
  return rows.filter((row) => (
    !(Number(row.AvailableStock) > 0)
    || !row.StoreHouseID
    || row.StockDataStatus !== 'AVAILABLE_FOR_SALE'
    || !(row.StockAsOfAt || row.StockUpdatedAt)
    || !row.WarehouseScope
    || !(row.StockRuleVersion || row.RuleVersion)
  ));
}

async function main() {
  const env = readEnv(path.join(ROOT, '.env.uat.local'));
  if (!env.UAT_TEST_PASSWORD) throw new Error('Missing UAT_TEST_PASSWORD in .env.uat.local.');

  const managerToken = await login('QLBH013.MED', env.UAT_TEST_PASSWORD);
  const centralToken = await login('QLBH005.MED', env.UAT_TEST_PASSWORD);

  const available = await chat('QLBH013.MED', managerToken, 'tìm sản phẩm V008');
  const reservedOut = await chat('QLBH005.MED', centralToken, 'tìm sản phẩm Q002');
  const symptom = await chat('QLBH013.MED', managerToken, 'tìm sản phẩm theo triệu chứng ho');

  const checks = [
    {
      Case: 'SELLABLE_PRODUCT_HAS_STOCK_CONTRACT',
      Pass: available.HttpStatus === 200
        && available.Status === 'SUCCESS'
        && available.ApiCode === '@tra_cuu_san_pham'
        && available.Rows.length > 0
        && invalidSellableRows(available.Rows).length === 0,
      RequestID: available.RequestID,
      Count: available.Rows.length,
    },
    {
      Case: 'RESERVED_OUT_PRODUCT_NOT_RECOMMENDED',
      Pass: reservedOut.HttpStatus === 200
        && reservedOut.Status === 'NO_DATA'
        && reservedOut.ApiCode === '@tra_cuu_san_pham'
        && reservedOut.Rows.length === 0,
      RequestID: reservedOut.RequestID,
      Count: reservedOut.Rows.length,
    },
    {
      Case: 'SYMPTOM_RESULTS_HAVE_SELLABLE_STOCK',
      Pass: symptom.HttpStatus === 200
        && symptom.Status === 'SUCCESS'
        && symptom.ApiCode === '@tim_san_pham_theo_trieu_chung'
        && symptom.Rows.length > 0
        && invalidSellableRows(symptom.Rows).length === 0,
      RequestID: symptom.RequestID,
      Count: symptom.Rows.length,
    },
  ];

  const sample = symptom.Rows[0];
  const summary = {
    task: 'STOCK-001-TOKEN-UAT',
    transport: 'gateway',
    status: checks.every((check) => check.Pass) ? 'PASS' : 'FAIL',
    checks,
    symptomSample: sample ? {
      ItemID: sample.ItemID,
      StoreHouseID: sample.StoreHouseID,
      PhysicalStock: sample.PhysicalStock,
      ReservedStock: sample.ReservedStock,
      AvailableStock: sample.AvailableStock,
      StockDataStatus: sample.StockDataStatus,
      StockAsOfAt: sample.StockAsOfAt || sample.StockUpdatedAt,
      WarehouseScope: sample.WarehouseScope,
      StockRuleVersion: sample.StockRuleVersion || sample.RuleVersion,
    } : null,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (summary.status !== 'PASS') process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'STOCK-001-TOKEN-UAT', status: 'ERROR', message: error.message }, null, 2));
  process.exitCode = 1;
});
