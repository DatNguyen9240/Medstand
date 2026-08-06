'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'sql/Module common - API_KhachHang_Update_AI.sql'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'src/js/pages/customer-management.js'), 'utf8');

const checks = [
  ['gateway verifies update identity', server.includes("'/api/API_KhachHang_Update'") && /identityField:\s*'User'/.test(server)],
  ['frontend sends update idempotency key', /customerUpdateIdempotencyKey\(payload\)/.test(ui) && /idempotencyKey:/.test(ui)],
  ['SQL accepts mutation context', ['@IdempotencyKey', '@RequestID'].every((v) => sql.includes(v))],
  ['SQL enforces official scope', /AR_GetObjectByUserFnc\(@User\)/.test(sql)],
  ['SQL supports official and pending sources', /@SourceType = 'OFFICIAL'/.test(sql) && /@SourceType = 'PENDING'/.test(sql)],
  ['SQL uses current address tuple', /CF_XaPhuongTbl/.test(sql) && /INVALID_ADMIN_AREA/.test(sql)],
  ['SQL prevents duplicate phones', /DUPLICATE_PHONE/.test(sql) && /UPDLOCK, HOLDLOCK/.test(sql)],
  ['SQL is idempotent', /AI_API_MutationIdempotency/.test(sql) && /IDEMPOTENCY_REPLAY/.test(sql) && /IDEMPOTENCY_CONFLICT/.test(sql)],
  ['SQL audits committed update', /AI_WriteAuditLog/.test(sql) && /ActionType='UPDATE_CUSTOMER'/.test(sql)],
  ['SQL verifies actual row count', /@RowsUpdated <> 1/.test(sql)],
];

const failed = checks.filter(([, pass]) => !pass);
console.log(JSON.stringify({
  Task: 'CUSTOMER-UPDATE-HARDENING-STATIC', Status: failed.length ? 'FAIL' : 'PASS',
  Passed: checks.length - failed.length, Total: checks.length,
  Checks: checks.map(([name, pass]) => ({ name, pass })),
}, null, 2));
if (failed.length) process.exitCode = 1;
