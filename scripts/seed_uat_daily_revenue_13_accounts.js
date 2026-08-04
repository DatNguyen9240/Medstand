'use strict';

/*
 * Preflight or deploy the isolated UATREV_ daily-revenue fixtures.
 *
 * Usage:
 *   node scripts/seed_uat_daily_revenue_13_accounts.js --preflight
 *   node scripts/seed_uat_daily_revenue_13_accounts.js --apply
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const SEED_PATH = path.join(ROOT, 'sql', 'Seed_UAT_Daily_Revenue_13_Accounts.sql');
const accounts = [
  ['QLBH013.MED', 'NDB'], ['NAMDINHB.MED', 'NDB'],
  ['QLBH016.MED', 'BNB'], ['BACNINHA.MED', 'BNB'],
  ['QLBH005.MED', 'HUE'], ['HUEB.MED', 'HUE'],
  ['QLBH010.MED', 'QAN'], ['DANANGA.MED', 'QAN'],
  ['QLMN2', 'CTH'], ['CanThoA', 'CTH'],
  ['QLMD1', 'BPH'], ['BinhPhuocA', 'BPH'],
  ['QLBH024.MED', 'AG'],
];

function readEnv() {
  const values = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function number(value) {
  if (typeof value === 'number') return value;
  return Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
}

function hash(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function dateKey(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

async function revenueFor(transaction, username, dayOffset) {
  const result = await new sql.Request(transaction)
    .input('User', sql.VarChar(50), username)
    .input('DayOffset', sql.Int, dayOffset)
    .query(`
DECLARE @D DATE = DATEADD(DAY, @DayOffset,
  CONVERT(DATE, DATEADD(MINUTE, 420, SYSUTCDATETIME())));
EXEC dbo.API_DoanhSo_AI
  @User = @User,
  @FromDate = @D,
  @ToDate = @D,
  @LoaiBaoCao = 'TatCa';`);
  const rows = result.recordset || [];
  return {
    rows: rows.length,
    amount: rows.reduce((sum, row) => sum + number(row.Amount ?? row['Doanh Số'] ?? row['Doanh Sá»‘'] ?? 0), 0),
    error: rows[0]?.MsgType === 1 ? rows[0].Msg : null,
  };
}

async function main() {
  const preflight = process.argv.includes('--preflight');
  const apply = process.argv.includes('--apply');
  if (preflight === apply) {
    throw new Error('Choose exactly one mode: --preflight or --apply.');
  }

  const env = { ...readEnv(), ...process.env };
  if (String(env.TEST_DB_DATABASE || '').toLowerCase() !== 'medtest') {
    throw new Error(`UATREV seed is medtest-only; current database is ${env.TEST_DB_DATABASE || '(empty)'}`);
  }

  const source = fs.readFileSync(SEED_PATH, 'utf8');
  const staticChecks = {
    medtestGuard: source.includes("LOWER(DB_NAME()) <> 'medtest'"),
    isolatedPrefix: source.includes("DECLARE @Prefix VARCHAR(10) = 'UATREV_'"),
    isolatedOwner: source.includes("DECLARE @Owner VARCHAR(30) = 'UATREV_MOCK'"),
    accountFixture13: accounts.length === 13,
    readsApprovedRule: source.includes('AI_BusinessRuleConfigTbl') && source.includes("Status = 'APPROVED'"),
    noLiteralTierA25M: !source.includes('25000000'),
    noLiteralTierB5M: !source.includes('5000000'),
    leavesTierFixturesUntouched: !/DELETE\s+FROM[^;]+UATV2/isu.test(source),
    noTriggerDisable: !/DISABLE\s+TRIGGER/i.test(source),
  };
  if (Object.values(staticChecks).some((value) => !value)) {
    throw new Error(`Static safety check failed: ${JSON.stringify(staticChecks)}`);
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
  (SELECT COUNT(*) FROM dbo.CF_ObjectTbl WHERE ObjectID LIKE 'UATREV[_]%') AS CustomerCount,
  (SELECT COUNT(*) FROM dbo.AR_OrderTbl WHERE DocumentID LIKE 'UATREV[_]%') AS OrderCount,
  (SELECT COUNT(*) FROM dbo.AR_InvoiceTbl WHERE DocumentID LIKE 'UATREV[_]%') AS InvoiceCount;`)).recordset[0];
    if (before.DatabaseName !== 'medtest') throw new Error(`Wrong database: ${before.DatabaseName}`);

    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;

    const seedResult = await new sql.Request(transaction).batch(source);
    const summary = (seedResult.recordsets?.[0] || [])[0] || null;
    const scopeRows = seedResult.recordsets?.[1] || [];
    const dateRows = seedResult.recordsets?.[2] || [];

    if (!summary
        || Number(summary.AccountCount) !== 13
        || Number(summary.CustomerCount) !== 7
        || Number(summary.OrderCount) !== 14
        || Number(summary.InvoiceCount) !== 14
        || Number(summary.RevenueViewLines) !== 14) {
      throw new Error(`Seed summary validation failed: ${JSON.stringify(summary)}`);
    }
    if (scopeRows.length !== 13 || scopeRows.some((row) => Number(row.VisibleUatrevCustomers) !== 1)) {
      throw new Error(`13-account scope validation failed: ${JSON.stringify(scopeRows)}`);
    }
    if (dateRows.length !== 2
        || dateRows.some((row) => Number(row.RevenueLineCount) !== 7 || number(row.SeedRevenue) <= 0)) {
      throw new Error(`Daily revenue validation failed: ${JSON.stringify(dateRows)}`);
    }

    const expectedRows = (await new sql.Request(transaction).query(`
SELECT O.ObjectID, V.DocumentDate, SUM(V.TotalAmount) AS ExpectedRevenue
FROM dbo.CF_ObjectTbl O
JOIN dbo.AR_OrderAndReturnView V ON V.ObjectID = O.ObjectID
WHERE O.ObjectID LIKE 'UATREV[_]%'
  AND V.DocumentID LIKE 'UATREV[_]%'
  AND V.StatusID IN (3, 6, 7, 8)
GROUP BY O.ObjectID, V.DocumentDate
ORDER BY O.ObjectID, V.DocumentDate;`)).recordset;
    if (expectedRows.length !== 14 || expectedRows.some((row) => number(row.ExpectedRevenue) <= 0)) {
      throw new Error(`Raw expected revenue validation failed: ${JSON.stringify(expectedRows)}`);
    }

    const expectedByCohortAndDay = new Map();
    for (const row of expectedRows) {
      const cohort = String(row.ObjectID).replace('UATREV_', '');
      expectedByCohortAndDay.set(`${cohort}:${dateKey(row.DocumentDate)}`, number(row.ExpectedRevenue));
    }

    const dateByOffset = {
      '-2': dateKey(dateRows[0].DocumentDate),
      '-1': dateKey(dateRows[1].DocumentDate),
    };
    const runtimeChecks = [];
    for (const [username, cohort] of accounts) {
      for (const offset of [-2, -1]) {
        const revenue = await revenueFor(transaction, username, offset);
        const date = dateByOffset[String(offset)];
        const expectedSeedRevenue = expectedByCohortAndDay.get(`${cohort}:${date}`) || 0;
        const pass = !revenue.error && revenue.rows > 0
          && revenue.amount >= expectedSeedRevenue && expectedSeedRevenue > 0;
        runtimeChecks.push({ username, cohort, date, expectedSeedRevenue, ...revenue, pass });
      }
    }
    if (runtimeChecks.some((row) => !row.pass)) {
      throw new Error(`Runtime revenue checks failed: ${JSON.stringify(runtimeChecks.filter((row) => !row.pass))}`);
    }

    if (preflight) {
      await transaction.rollback();
      began = false;
    } else {
      await transaction.commit();
      began = false;
    }

    console.log(JSON.stringify({
      Task: 'UAT_DAILY_REVENUE_13_ACCOUNTS',
      Status: 'PASS',
      Mode: preflight ? 'TRANSACTION_ROLLBACK' : 'DEPLOYED',
      PersistedChanges: apply,
      Database: before.DatabaseName,
      ExecutedBy: before.ExecutedBy,
      CheckedAtUtc: before.CheckedAtUtc,
      SeedSha256: hash(source),
      StaticChecks: staticChecks,
      Before: before,
      Summary: summary,
      Dates: dateRows,
      AccountsPassed: new Set(runtimeChecks.filter((row) => row.pass).map((row) => row.username)).size,
      AccountsTotal: accounts.length,
      RuntimeChecks: runtimeChecks,
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
    Task: 'UAT_DAILY_REVENUE_13_ACCOUNTS',
    Status: 'FAIL',
    Error: error.message,
  }, null, 2));
  process.exitCode = 1;
});
