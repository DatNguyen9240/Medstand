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

async function execute(token, ApiCode, params) {
  const response = await fetch(`${n8nBase}/webhook/api-execute`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
    body: JSON.stringify({ ApiCode, params }),
    signal: AbortSignal.timeout(60_000),
  });
  return { httpStatus: response.status, body: await response.json() };
}

async function main() {
  assert(password, 'Missing UAT_TEST_PASSWORD in local environment.');
  const username = 'QLBH013.MED';
  const token = await login(username);

  const missingCustomer = await execute(token, '@goi_ydon_hang', {});
  assert.strictEqual(missingCustomer.httpStatus, 422);
  assert.strictEqual(missingCustomer.body.code, 'VALIDATION_ERROR');
  assert.match(String(missingCustomer.body.message || ''), /chọn khách hàng/i);

  const noHistory = await execute(token, '@goi_ydon_hang', { '@MaKhachHang': 'HPA011' });
  assert.strictEqual(noHistory.httpStatus, 200);
  assert.strictEqual(noHistory.body.status, 'NO_DATA');
  assert.match(String(noHistory.body.message || ''), /chưa có hóa đơn hoàn tất/i);

  const upsellNoHistory = await execute(token, '@upsell_goi_y', { '@MaKhachHang': 'HPA011' });
  assert.strictEqual(upsellNoHistory.httpStatus, 200);
  assert.strictEqual(upsellNoHistory.body.status, 'NO_DATA');
  assert.match(String(upsellNoHistory.body.message || ''), /chưa có hóa đơn hoàn tất/i);

  const missingProduct = await execute(token, '@goi_ydon_thuoc', {});
  assert.strictEqual(missingProduct.httpStatus, 422);
  assert.strictEqual(missingProduct.body.code, 'VALIDATION_ERROR');
  assert.match(String(missingProduct.body.message || ''), /sản phẩm gốc/i);

  const product = await execute(token, '@goi_ydon_thuoc', { '@timkiem': 'A008' });
  assert.strictEqual(product.httpStatus, 200);
  assert.strictEqual(product.body.status, 'SUCCESS');
  assert(Array.isArray(product.body.data) && product.body.data.length > 0);
  assert(!product.body.data.some((row) => row.ItemID === 'A008' || row.ItemID === 'N/A'));

  const noRelated = await execute(token, '@goi_ydon_thuoc', { '@timkiem': 'A015' });
  assert.strictEqual(noRelated.httpStatus, 200);
  assert.strictEqual(noRelated.body.status, 'NO_DATA');
  assert.match(String(noRelated.body.message || ''), /chưa có đủ hóa đơn hoàn tất/i);

  const saleUsername = 'NAMDINHB.MED';
  const saleToken = await login(saleUsername);
  const saleMissingCustomer = await execute(saleToken, '@goi_ydon_hang', {});
  assert.strictEqual(saleMissingCustomer.httpStatus, 422);
  assert.strictEqual(saleMissingCustomer.body.code, 'VALIDATION_ERROR');
  const saleProduct = await execute(saleToken, '@goi_ydon_thuoc', { '@timkiem': 'A008' });
  assert.strictEqual(saleProduct.httpStatus, 200);
  assert.strictEqual(saleProduct.body.status, 'SUCCESS');
  assert(!saleProduct.body.data.some((row) => row.ItemID === 'A008' || row.ItemID === 'N/A'));

  const report = {
    status: 'EMPTY_SUGGESTION_N8N_RUNTIME_PASS',
    testedAt: new Date().toISOString(),
    username,
    cases: {
      missingCustomer: { httpStatus: missingCustomer.httpStatus, code: missingCustomer.body.code, message: missingCustomer.body.message },
      HPA011: { httpStatus: noHistory.httpStatus, status: noHistory.body.status, message: noHistory.body.message },
      upsellHPA011: { httpStatus: upsellNoHistory.httpStatus, status: upsellNoHistory.body.status, message: upsellNoHistory.body.message },
      missingProduct: { httpStatus: missingProduct.httpStatus, code: missingProduct.body.code, message: missingProduct.body.message },
      productA008: { httpStatus: product.httpStatus, status: product.body.status, count: product.body.count },
      productA015: { httpStatus: noRelated.httpStatus, status: noRelated.body.status, message: noRelated.body.message },
      saleIdentityAndValidation: { username: saleUsername, httpStatus: saleMissingCustomer.httpStatus, code: saleMissingCustomer.body.code },
      saleProductA008: { httpStatus: saleProduct.httpStatus, status: saleProduct.body.status, count: saleProduct.body.count },
    },
  };
  const reportPath = path.join(root, 'reports', 'business-rule-v1', 'empty-suggestion-runtime.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
