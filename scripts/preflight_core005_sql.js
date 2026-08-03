'use strict';

/*
 * CORE-005 SQL compile preflight.
 * Applies the migration/procedures inside one transaction on medtest and always
 * rolls it back. This validates real object/column/procedure references without
 * leaving schema or data changes behind.
 */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const SQL_FILES = [
  'sql/Migrate_API_Mutation_Idempotency_AI.sql',
  'sql/Module common - API_HangHoaList_AI.sql',
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
      let index = 0;
      for (const batch of batches(source)) {
        index += 1;
        await new sql.Request(transaction).batch(batch);
      }
      compiled.push({ file: relativePath, batches: index });
    }

    const parameters = (await new sql.Request(transaction).query(`
SELECT OBJECT_NAME(object_id) AS ProcName, name AS ParameterName
FROM sys.parameters
WHERE OBJECT_NAME(object_id) IN ('API_DonHangChiTiet_Insert_AI', 'API_HangHoaList_AI')
ORDER BY ProcName, parameter_id;`)).recordset;
    const targetColumns = (await new sql.Request(transaction).query(`
SELECT OBJECT_NAME(c.object_id) AS TableName, c.name AS ColumnName,
       TYPE_NAME(c.user_type_id) AS DataType, c.max_length AS MaxLength
FROM sys.columns c
WHERE OBJECT_NAME(c.object_id) IN ('AR_OrderTbl', 'AR_OrderDetailTbl')
  AND c.name IN ('DocumentID', 'Memo', 'Notes', 'XaPhuong', 'ThuTrongTuan', 'Phone', 'UserCreate', 'StoreHouseID')
ORDER BY TableName, c.column_id;`)).recordset;

    await transaction.rollback();
    began = false;
    process.stdout.write(`${JSON.stringify({
      Status: 'PASS',
      Database: dbName,
      Mode: 'TRANSACTION_ROLLBACK',
      Compiled: compiled,
      Parameters: parameters,
      TargetColumns: targetColumns,
      PersistedChanges: false,
    }, null, 2)}\n`);
  } finally {
    if (began) {
      try { await transaction.rollback(); } catch (_) { /* connection may already have aborted */ }
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Status: 'FAIL', PersistedChanges: false, Error: error.message }, null, 2));
  process.exitCode = 1;
});
