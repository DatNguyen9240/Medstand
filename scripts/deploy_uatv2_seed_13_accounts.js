'use strict';

/* Applies the isolated UATV2 seed atomically to medtest. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const SEED_PATH = path.join(ROOT, 'sql', 'Seed_UATV2_Current_Data_13_Accounts.sql');

function readEnv() {
  const values = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function hash(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

async function main() {
  if (!process.argv.includes('--apply')) {
    throw new Error('Refusing to persist UATV2 data without explicit --apply. Run preflight first.');
  }

  const env = { ...readEnv(), ...process.env };
  if (String(env.TEST_DB_DATABASE || '').toLowerCase() !== 'medtest') {
    throw new Error(`UATV2 deploy is medtest-only; current database is ${env.TEST_DB_DATABASE || '(empty)'}`);
  }

  const source = fs.readFileSync(SEED_PATH, 'utf8');
  if (!source.includes("LOWER(DB_NAME()) <> 'medtest'")
      || !source.includes("DECLARE @Prefix VARCHAR(10) = 'UATV2_'")
      || source.includes('25000000') || source.includes('5000000')
      || /DISABLE\s+TRIGGER/i.test(source)) {
    throw new Error('Seed safety/no-hardcode guard failed.');
  }

  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 360000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 },
  });

  const transaction = new sql.Transaction(pool);
  let began = false;
  try {
    const before = (await pool.request().query(`
SELECT DB_NAME() AS DatabaseName, SUSER_SNAME() AS ExecutedBy, SYSUTCDATETIME() AS CheckedAtUtc,
       (SELECT COUNT(*) FROM dbo.CF_ObjectTbl WHERE ObjectID LIKE 'UATV2[_]%') AS CustomerCount,
       (SELECT COUNT(*) FROM dbo.AR_OrderTbl WHERE DocumentID LIKE 'UATV2[_]%') AS OrderCount;`)).recordset[0];
    if (before.DatabaseName !== 'medtest') throw new Error(`Wrong database: ${before.DatabaseName}`);

    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;
    const result = await new sql.Request(transaction).batch(source);
    const summary = (result.recordsets?.[0] || [])[0] || null;
    const scopeRows = result.recordsets?.[1] || [];

    if (!summary
        || Number(summary.AccountCount) !== 13
        || Number(summary.CustomerCount) !== 28
        || Number(summary.OrderCount) !== 91
        || Number(summary.InvoiceCount) !== 63
        || Number(summary.ReturnCount) !== 7
        || Number(summary.DebtCount) !== 7
        || Number(summary.FocusProductCount) !== 3) {
      throw new Error(`Seed summary validation failed: ${JSON.stringify(summary)}`);
    }
    if (scopeRows.length !== 13 || scopeRows.some((row) => Number(row.VisibleUatv2Customers) !== 4)) {
      throw new Error(`Seed scope validation failed: ${JSON.stringify(scopeRows)}`);
    }

    const persisted = (await new sql.Request(transaction).query(`
SELECT
  (SELECT COUNT(*) FROM dbo.CF_ObjectTbl WHERE ObjectID LIKE 'UATV2[_]%' AND UserCreate = 'UATV2_MOCK') AS CustomerCount,
  (SELECT COUNT(*) FROM dbo.AR_OrderTbl WHERE DocumentID LIKE 'UATV2[_]%' AND UserCreate = 'UATV2_MOCK') AS OrderCount,
  (SELECT COUNT(*) FROM dbo.AR_InvoiceTbl WHERE DocumentID LIKE 'UATV2[_]%' AND UserCreate = 'UATV2_MOCK') AS InvoiceCount,
  (SELECT COUNT(*) FROM dbo.AR_ReturnTbl WHERE DocumentID LIKE 'UATV2[_]%' AND UserCreate = 'UATV2_MOCK') AS ReturnCount,
  (SELECT COUNT(*) FROM dbo.SY_BalanceObjectTbl WHERE DocumentID LIKE 'UATV2[_]%') AS DebtCount,
  (SELECT COUNT(*) FROM dbo.AR_OrderAndReturnView WHERE DocumentID LIKE 'UATV2[_]%' AND StatusID IN (3,6,7,8)) AS SalesViewLines,
  (SELECT COUNT(*) FROM dbo.AR_OrderAndReturnView WHERE DocumentID LIKE 'UATV2[_]%' AND StatusID = 99) AS ReturnViewLines;`)).recordset[0];
    if (Number(persisted.CustomerCount) !== 28
        || Number(persisted.OrderCount) !== 91
        || Number(persisted.InvoiceCount) !== 63
        || Number(persisted.ReturnCount) !== 7
        || Number(persisted.DebtCount) !== 7
        || Number(persisted.SalesViewLines) !== 63
        || Number(persisted.ReturnViewLines) !== 7) {
      throw new Error(`In-transaction persisted-state validation failed: ${JSON.stringify(persisted)}`);
    }

    await transaction.commit();
    began = false;
    console.log(JSON.stringify({
      Task: 'UATV2_CURRENT_DATA_13_ACCOUNTS',
      Status: 'DEPLOYED',
      Database: before.DatabaseName,
      ExecutedBy: before.ExecutedBy,
      DeployedAtUtc: before.CheckedAtUtc,
      SeedSha256: hash(source),
      Before: { CustomerCount: Number(before.CustomerCount), OrderCount: Number(before.OrderCount) },
      After: persisted,
      Summary: summary,
      Scope13Of13: scopeRows,
    }, null, 2));
  } finally {
    if (began) {
      try { await transaction.rollback(); } catch (_) { /* transaction may already be aborted */ }
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    Task: 'UATV2_CURRENT_DATA_13_ACCOUNTS',
    Status: 'DEPLOY_FAILED',
    Error: error.message,
  }, null, 2));
  process.exitCode = 1;
});
