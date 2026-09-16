'use strict';

/*
 * CORE-010 SQL compile preflight.
 * Applies required schema/procedures inside one transaction on medtest and
 * always rolls back. It never calls either mutation procedure.
 */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const SQL_FILES = [
  'sql/Migrate_API_Mutation_Idempotency_AI.sql',
  'sql/System - AI_AuditLog_AI.sql',
  'sql/Module common - API_KhachHang_Insert_AI.sql',
  'sql/Module common - API_DonHangChiTiet_Insert_AI.sql',
];

function readEnv() {
  const values = {};
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return values;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function batches(source) {
  return source.split(/^\s*GO\s*(?:--.*)?$/gim).map((part) => part.trim()).filter(Boolean);
}

async function main() {
  const env = { ...readEnv(), ...process.env };
  const required = ['TEST_DB_SERVER', 'TEST_DB_DATABASE', 'TEST_DB_USER', 'TEST_DB_PASSWORD'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Thiếu cấu hình: ${missing.join(', ')}`);

  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 120000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 },
  });

  const transaction = new sql.Transaction(pool);
  let began = false;
  const compiled = [];
  try {
    const dbName = (await pool.request().query('SELECT DB_NAME() AS DbName')).recordset[0].DbName;
    if (dbName !== 'medtest') throw new Error(`Preflight chỉ được chạy trên medtest; hiện tại là ${dbName}`);

    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;
    for (const relativePath of SQL_FILES) {
      const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
      let batchCount = 0;
      for (const batch of batches(source)) {
        batchCount += 1;
        await new sql.Request(transaction).batch(batch);
      }
      compiled.push({ file: relativePath, batches: batchCount });
    }

    const rows = (await new sql.Request(transaction).query(`
SELECT p.name AS ProcName, prm.name AS ParameterName
FROM sys.procedures p
LEFT JOIN sys.parameters prm ON prm.object_id = p.object_id
WHERE p.name IN ('API_KhachHang_Insert_AI', 'API_DonHangChiTiet_Insert_AI', 'AI_WriteAuditLog')
ORDER BY p.name, prm.parameter_id;

SELECT p.name AS ProcName, OBJECT_DEFINITION(p.object_id) AS Definition
FROM sys.procedures p
WHERE p.name IN ('API_KhachHang_Insert_AI', 'API_DonHangChiTiet_Insert_AI');`)).recordsets;

    const parameters = rows[0] || [];
    const definitions = rows[1] || [];
    const customerDefinition = definitions.find((row) => row.ProcName === 'API_KhachHang_Insert_AI')?.Definition || '';
    const orderDefinition = definitions.find((row) => row.ProcName === 'API_DonHangChiTiet_Insert_AI')?.Definition || '';
    const customerParameters = new Set(parameters.filter((row) => row.ProcName === 'API_KhachHang_Insert_AI').map((row) => row.ParameterName));
    const checks = [
      { name: 'CUSTOMER_CONTEXT_PARAMETERS', pass: ['@IdempotencyKey', '@RequestID'].every((name) => customerParameters.has(name)) },
      { name: 'CUSTOMER_LEDGER_AND_FINGERPRINT', pass: /AI_API_MutationIdempotency/i.test(customerDefinition) && /RequestFingerprintHash/i.test(customerDefinition) },
      { name: 'CUSTOMER_AUDIT_EVENTS', pass: ['CREATE_CUSTOMER', 'REPLAY_CUSTOMER', 'CREATE_CUSTOMER_FAILED', 'IDEMPOTENCY_CONFLICT_CUSTOMER'].every((name) => customerDefinition.includes(name)) },
      { name: 'ORDER_AUDIT_FAIL_CLOSED', pass: orderDefinition.includes('AUDIT_UNAVAILABLE') && orderDefinition.includes('orders.write') },
      { name: 'AUDIT_PROCEDURE_EXISTS', pass: parameters.some((row) => row.ProcName === 'AI_WriteAuditLog') },
    ];
    if (checks.some((item) => !item.pass)) throw new Error(`CORE-010 SQL contract mismatch: ${JSON.stringify(checks)}`);

    await transaction.rollback();
    began = false;
    process.stdout.write(`${JSON.stringify({
      Status: 'PASS',
      Database: dbName,
      Mode: 'TRANSACTION_ROLLBACK_COMPILE_ONLY',
      Compiled: compiled,
      Checks: checks,
      PersistedChanges: false,
      MutationExecuted: false,
    }, null, 2)}\n`);
  } finally {
    if (began) {
      try { await transaction.rollback(); } catch (_) { /* transaction may already be aborted */ }
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Status: 'FAIL', PersistedChanges: false, MutationExecuted: false, Error: error.message }, null, 2));
  process.exitCode = 1;
});
