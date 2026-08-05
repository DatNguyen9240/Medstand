'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
const server = read('server.js');
const customerSql = read('sql', 'Module common - API_KhachHang_Insert_AI.sql');
const orderSql = read('sql', 'Module common - API_DonHangChiTiet_Insert_AI.sql');
const uat018 = read('scripts', 'verify_uat018_order_create.js');
const http = read('src', 'js', 'services', 'http.js');
const customerUi = read('chatbot-widget', 'js', 'chatbot-renderer-create-customer.js');
const orderUi = read('src', 'js', 'pages', 'create-order.js');
const draft = read('chatbot-widget', 'js', 'chatbot-order-draft.js');

const checks = [];
function check(name, fn) {
  fn();
  checks.push(name);
}

check('GATEWAY_POLICY_COVERS_BOTH_MUTATIONS', () => {
  assert(server.includes("'/api/API_KhachHang_Insert_AI'"));
  assert(server.includes("requiredCapability: 'customers.write'"));
  assert(server.includes("'/api/API_DonHangChiTiet_Insert_AI'"));
  assert(server.includes("requiredCapability: 'orders.write'"));
});

check('GATEWAY_USES_VERIFIED_IDENTITY_AND_FAILS_CLOSED', () => {
  assert(server.includes('resolveVerifiedGatewayIdentity(authorization)'));
  assert(server.includes('hasGatewayCapability(verifiedIdentity, mutationPolicy.requiredCapability)'));
  assert(server.includes("'CAPABILITY_REQUIRED'"));
  assert(server.includes('body[mutationPolicy.identityField] = verifiedIdentity.username'));
});

check('GATEWAY_REQUIRES_MUTATION_CONTEXT', () => {
  assert(server.includes("'IDEMPOTENCY_KEY_REQUIRED'"));
  assert(server.includes('IdempotencyKey: idempotencyKey'));
  assert(server.includes('RequestID: requestId'));
  assert(server.includes("mutationCode === 'IDEMPOTENCY_CONFLICT'"));
  assert(server.includes('downstreamStatus = 409'));
});

check('CUSTOMER_SQL_HAS_SERVER_IDEMPOTENCY', () => {
  for (const marker of ['@IdempotencyKey', '@RequestID', 'RequestFingerprintHash', 'AI_API_MutationIdempotency', 'UPDLOCK', 'HOLDLOCK']) {
    assert(customerSql.includes(marker), marker);
  }
  assert(customerSql.includes("'IDEMPOTENCY_CONFLICT' AS Code"));
  assert(customerSql.includes("'IDEMPOTENCY_REPLAY' AS Code"));
  assert(customerSql.includes('CAST(1 AS BIT) AS IsReplay'));
});

check('CUSTOMER_SQL_AUDIT_IS_MANDATORY', () => {
  for (const event of ['CREATE_CUSTOMER', 'REPLAY_CUSTOMER', 'CREATE_CUSTOMER_FAILED', 'IDEMPOTENCY_CONFLICT_CUSTOMER']) {
    assert(customerSql.includes(event), event);
  }
  assert(customerSql.includes("'AUDIT_UNAVAILABLE'"));
  assert(!/IF\s+OBJECT_ID\('dbo\.AI_WriteAuditLog',[\s\S]{0,100}EXEC\s+dbo\.AI_WriteAuditLog/i.test(customerSql));
  assert(customerSql.includes('payloadFingerprint'));
  assert(customerSql.includes('customers.write'));
});

check('CUSTOMER_CREATE_LEDGER_AUDIT_SHARE_TRANSACTION', () => {
  const begin = customerSql.indexOf('BEGIN TRANSACTION;', customerSql.indexOf('SET @RequestFingerprintHash'));
  const businessInsert = customerSql.indexOf('INSERT INTO dbo.CF_ObjectTbl', begin);
  const ledgerComplete = customerSql.indexOf("SET Status = 'COMPLETED'", businessInsert);
  const audit = customerSql.indexOf("@ActionType='CREATE_CUSTOMER'", ledgerComplete);
  const commit = customerSql.indexOf('COMMIT TRANSACTION;', audit);
  assert(begin > -1 && businessInsert > begin && ledgerComplete > businessInsert && audit > ledgerComplete && commit > audit);
});

check('ORDER_SQL_AUDIT_IS_MANDATORY', () => {
  assert(orderSql.includes("'AUDIT_UNAVAILABLE'"));
  assert(orderSql.includes("@RequiredCapability VARCHAR(100) = 'orders.write'"));
  assert(!/IF\s+OBJECT_ID\('dbo\.AI_WriteAuditLog',[\s\S]{0,100}EXEC\s+dbo\.AI_WriteAuditLog/i.test(orderSql));
  assert(orderSql.includes('payloadFingerprint'));
});

check('UAT018_USES_CURRENT_STOCK001_CONTRACT', () => {
  const assertion = uat018.match(/check\('PRODUCT_SELECTED_STORE_EVIDENCE'[^\n]+/);
  assert(assertion);
  assert(assertion[0].includes('AI_StockAvailableByUserFnc'));
  assert(assertion[0].includes('AvailableStock'));
  assert(!assertion[0].includes('ReservedQuantity'));
});

check('CLIENT_GUARDS_ARE_DEFENCE_IN_DEPTH_ONLY', () => {
  assert(http.includes('const _inflightMutations = new Map()'));
  assert(http.includes("const safeToRetry = ['GET', 'HEAD', 'OPTIONS'].includes(requestMethod)"));
  assert(customerUi.includes('btnSubmit.disabled = true'));
  assert(orderUi.includes("$btn.prop('disabled', true)"));
});

check('CONFIRM_AND_CANCEL_DO_NOT_SHARE_MUTATION_PATH', () => {
  assert(customerUi.includes('btn-preview'));
  assert(customerUi.includes('btn-submit'));
  assert(draft.includes("command.command === 'CANCEL_DRAFT'"));
  assert(draft.includes('Không có đơn nào được ghi vào ERP'));
});

console.log(`CORE-010 mutation hardening static: PASS ${checks.length}/${checks.length}`);
for (const name of checks) console.log(`  ✓ ${name}`);
