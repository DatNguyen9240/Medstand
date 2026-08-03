'use strict';

/*
 * Executes the UATV2 seed inside one outer transaction on medtest, verifies
 * every account and every seeded tier through runtime procedures, then rolls
 * the outer transaction back. No data is persisted by this script.
 */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const SEED_FILE = path.join(ROOT, 'sql', 'Seed_UATV2_Current_Data_13_Accounts.sql');
// Midday UTC keeps the calendar date stable when mssql converts JS Date values.
const AS_OF = new Date('2026-08-03T12:00:00.000Z');

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

function normalizeNumber(value) {
  if (typeof value === 'number') return value;
  return Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
}

async function tierFor(transaction, username, customerId, tier) {
  const result = await new sql.Request(transaction)
    .input('Username', sql.VarChar(50), username)
    .input('MaKhachHang', sql.NVarChar(100), customerId)
    .input('NhomFilter', sql.VarChar(50), tier)
    .input('Page', sql.Int, 1)
    .input('PageSize', sql.Int, 1)
    .input('AsOfDate', sql.Date, AS_OF)
    .execute('dbo.API_ChamDiemKH_AI');
  return (result.recordset || [])[0] || null;
}

async function orderCheck(transaction, username) {
  const result = await new sql.Request(transaction)
    .input('Username', sql.VarChar(50), username)
    .input('TuNgay', sql.DateTime, AS_OF)
    .input('DenNgay', sql.DateTime, AS_OF)
    .input('timkiem', sql.NVarChar(50), 'UATV2_')
    .input('TopN', sql.Int, 100)
    .execute('dbo.API_DonHang_AI');
  const rows = result.recordset || [];
  return {
    count: rows.filter((row) => String(row.DocumentID || '').startsWith('UATV2_')).length,
    statuses: [...new Set(rows.map((row) => Number(row.StatusID)).filter(Number.isFinite))].sort((a, b) => a - b),
    error: rows[0]?.MsgType === 1 ? rows[0].Msg : null,
  };
}

async function revenueCheck(transaction, username) {
  const result = await new sql.Request(transaction)
    .input('User', sql.VarChar(50), username)
    .input('FromDate', sql.DateTime, AS_OF)
    .input('ToDate', sql.DateTime, AS_OF)
    .input('LoaiBaoCao', sql.VarChar(50), 'TatCa')
    .execute('dbo.API_DoanhSo_AI');
  const rows = result.recordset || [];
  return {
    count: rows.length,
    amount: rows.reduce((sum, row) => sum + normalizeNumber(row.Amount ?? row['Doanh Số'] ?? 0), 0),
    error: rows[0]?.MsgType === 1 ? rows[0].Msg : null,
  };
}

async function debtCheck(transaction, username, customerId) {
  const result = await new sql.Request(transaction)
    .input('Username', sql.VarChar(50), username)
    .input('MaKhachHang', sql.NVarChar(100), customerId)
    .input('DenNgay', sql.DateTime, AS_OF)
    .execute('dbo.API_CongNoKhachHang_AI');
  const row = (result.recordset || [])[0] || null;
  return {
    customerId: row?.CustomerID || row?.MaKH || null,
    totalDebt: normalizeNumber(row?.TotalDebt ?? row?.TongNo ?? 0),
    error: row?.MsgType === 1 ? row.Msg : null,
  };
}

async function focusCheck(transaction, username, customerId) {
  const result = await new sql.Request(transaction)
    .input('Username', sql.VarChar(50), username)
    .input('MaKhachHang', sql.VarChar(50), customerId)
    .input('TopN', sql.Int, 20)
    .execute('dbo.API_SanPhamTrongTam_AI');
  const rows = result.recordset || [];
  const program = rows.find((row) => row.RecordType === 'PROGRAM') || rows[0] || null;
  return {
    programId: program?.ProgramID || null,
    productCount: Number(program?.ProductCount || 0),
    severity: program?.Severity || null,
    error: program?.MsgType === 1 ? program.Msg : null,
  };
}

async function main() {
  const env = { ...readEnv(), ...process.env };
  if (String(env.TEST_DB_DATABASE || '').toLowerCase() !== 'medtest') {
    throw new Error(`UATV2 preflight is medtest-only; current database is ${env.TEST_DB_DATABASE || '(empty)'}`);
  }

  const seedSource = fs.readFileSync(SEED_FILE, 'utf8');
  const staticChecks = {
    medtestGuard: seedSource.includes("LOWER(DB_NAME()) <> 'medtest'"),
    isolatedPrefix: seedSource.includes("DECLARE @Prefix VARCHAR(10) = 'UATV2_'"),
    accountFixture13: accounts.length === 13,
    readsApprovedRule: seedSource.includes('AI_BusinessRuleConfigTbl') && seedSource.includes("Status = 'APPROVED'"),
    noLiteralTierA25M: !seedSource.includes('25000000'),
    noLiteralTierB5M: !seedSource.includes('5000000'),
    noTriggerDisable: !/DISABLE\s+TRIGGER/i.test(seedSource),
    noRealCustomerUpdateList: !seedSource.includes('HPA515') && !seedSource.includes('SGNB0018'),
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
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;

    const seedResult = await new sql.Request(transaction).batch(seedSource);
    const summary = (seedResult.recordsets?.[0] || [])[0] || null;
    const scopeRows = seedResult.recordsets?.[1] || [];
    if (!summary || Number(summary.AccountCount) !== 13 || Number(summary.CustomerCount) !== 28) {
      throw new Error(`Seed summary invalid: ${JSON.stringify(summary)}`);
    }
    if (scopeRows.length !== 13 || scopeRows.some((row) => Number(row.VisibleUatv2Customers) !== 4)) {
      throw new Error(`13-account scope check failed: ${JSON.stringify(scopeRows)}`);
    }

    const rawProbe = (await new sql.Request(transaction).query(`
SELECT
  (SELECT COUNT(*) FROM dbo.AR_OrderTbl WHERE DocumentID LIKE 'UATV2[_]%') AS OrderHeaders,
  (SELECT COUNT(*) FROM dbo.AR_OrderDetailTbl WHERE DocumentID LIKE 'UATV2[_]%') AS OrderDetails,
  (SELECT COUNT(*) FROM dbo.AR_InvoiceTbl WHERE DocumentID LIKE 'UATV2[_]%') AS InvoiceHeaders,
  (SELECT COUNT(*) FROM dbo.AR_OrderAndReturnView WHERE DocumentID LIKE 'UATV2[_]%') AS RevenueViewLines,
  (SELECT COUNT(*) FROM dbo.AR_OrderAndReturnView WHERE DocumentID LIKE 'UATV2[_]%' AND StatusID IN (3,6,7,8)) AS SalesViewLines,
  (SELECT COUNT(*) FROM dbo.AR_OrderAndReturnView WHERE DocumentID LIKE 'UATV2[_]%' AND StatusID = 99) AS ReturnViewLines;

SELECT TOP (5)
  O.DocumentID, O.DocumentDate, O.EmployeeID, O.ManagerID, O.CeoID,
  O.BranchID, O.StatusID,
  D.ItemID, D.Quantity, D.TotalAmount, D.isKM
FROM dbo.AR_OrderTbl O
LEFT JOIN dbo.AR_OrderDetailTbl D ON D.DocumentID = O.DocumentID
WHERE O.DocumentID LIKE 'UATV2[_]%'
ORDER BY O.DocumentID;

SELECT TOP (5) DocumentID, DocumentDate, ObjectID, EmployeeID, ManagerID,
       CeoID, BranchID, StatusID, ItemID, Quantity, TotalAmount
FROM dbo.AR_OrderAndReturnView
WHERE DocumentID LIKE 'UATV2[_]%'
ORDER BY DocumentID, ItemID;`)).recordsets;
    const rawCounts = (rawProbe[0] || [])[0] || {};
    if (Number(rawCounts.SalesViewLines) === 0 || Number(rawCounts.ReturnViewLines) !== 7) {
      const definition = (await new sql.Request(transaction).query(`
SELECT OBJECT_DEFINITION(OBJECT_ID(N'dbo.AR_OrderAndReturnView')) AS Definition;`)).recordset[0]?.Definition || '';
      throw new Error(`Seeded orders are absent from revenue view: ${JSON.stringify({
        rawCounts,
        orderSamples: rawProbe[1] || [],
        viewSamples: rawProbe[2] || [],
        viewDefinition: definition,
      })}`);
    }

    const configRows = (await new sql.Request(transaction).query(`
SELECT ConfigKey, ConfigValue
FROM dbo.AI_BusinessRuleConfigTbl
WHERE RuleCode = 'BR-TIER-005'
  AND Status = 'APPROVED'
  AND EffectiveFrom <= SYSUTCDATETIME()
  AND (EffectiveTo IS NULL OR EffectiveTo > SYSUTCDATETIME());`)).recordset;
    const config = Object.fromEntries(configRows.map((row) => [row.ConfigKey, row.ConfigValue]));
    const expected = {
      A: { revenue: Number(config.TierAMinNetRevenue), frequency: Number(config.TierAMinFrequency) },
      B: { revenue: Number(config.TierBMinNetRevenue), frequency: Number(config.TierBMinFrequency) },
      C: { revenue: Number(config.TierBMinNetRevenue) - 1, frequency: Math.max(1, Number(config.TierBMinFrequency) - 1) },
      UNRATED: { revenue: 0, frequency: 0 },
    };

    const accountChecks = [];
    for (const [username, cohort] of accounts) {
      const tiers = {};
      for (const tier of ['A', 'B', 'C', 'UNRATED']) {
        const customerId = `UATV2_${cohort}_${tier}`;
        const row = await tierFor(transaction, username, customerId, tier);
        const exp = expected[tier];
        tiers[tier] = {
          customerId: row?.ObjectID || null,
          actualTier: row?.Nhom || null,
          netRevenue12M: Number(row?.DoanhSo12Thang ?? -1),
          frequency6M: Number(row?.SoLanMua6Thang ?? -1),
          invoiceCount12M: Number(row?.SoHoaDon12Thang ?? -1),
          pass: Boolean(row
            && row.ObjectID === customerId
            && row.Nhom === tier
            && Number(row.DoanhSo12Thang) === exp.revenue
            && Number(row.SoLanMua6Thang) === exp.frequency
            && (tier !== 'UNRATED' || Number(row.SoHoaDon12Thang) === 0)),
        };
      }

      const order = await orderCheck(transaction, username);
      const revenue = await revenueCheck(transaction, username);
      const debt = await debtCheck(transaction, username, `UATV2_${cohort}_B`);
      const focus = await focusCheck(transaction, username, `UATV2_${cohort}_A`);
      const pass = Object.values(tiers).every((row) => row.pass)
        && order.count >= 4 && [-1, 0, 2, 10].every((status) => order.statuses.includes(status))
        && !order.error
        && revenue.count > 0 && revenue.amount > 0 && !revenue.error
        && debt.customerId === `UATV2_${cohort}_B` && debt.totalDebt > 0 && !debt.error
        && focus.programId === 'UATV2_FOCUS_CURRENT' && focus.productCount === 3 && !focus.error;
      accountChecks.push({ username, cohort, tiers, order, revenue, debt, focus, pass });
    }

    if (accountChecks.some((row) => !row.pass)) {
      throw new Error(`Runtime checks failed: ${JSON.stringify(accountChecks.filter((row) => !row.pass))}`);
    }

    const viewChecks = (await new sql.Request(transaction).query(`
SELECT O.ObjectID,
       SUM(CASE WHEN V.StatusID IN (3,6,7,8,99) THEN V.TotalAmount ELSE 0 END) AS NetRevenue,
       SUM(CASE WHEN V.StatusID = 99 THEN V.TotalAmount ELSE 0 END) AS SignedReturn
FROM dbo.CF_ObjectTbl O
JOIN dbo.AR_OrderAndReturnView V ON V.ObjectID = O.ObjectID
WHERE O.ObjectID LIKE 'UATV2[_]%'
GROUP BY O.ObjectID
ORDER BY O.ObjectID;`)).recordset;
    const returnChecks = viewChecks.filter((row) => row.ObjectID.endsWith('_A'));
    if (returnChecks.length !== 7 || returnChecks.some((row) => Number(row.SignedReturn) >= 0)) {
      throw new Error(`Signed-return verification failed: ${JSON.stringify(returnChecks)}`);
    }

    await transaction.rollback();
    began = false;
    console.log(JSON.stringify({
      Task: 'UATV2_CURRENT_DATA_13_ACCOUNTS',
      Status: 'PASS',
      Database: env.TEST_DB_DATABASE,
      Mode: 'TRANSACTION_ROLLBACK',
      PersistedChanges: false,
      StaticChecks: staticChecks,
      SeedSummary: summary,
      Scope13Of13: scopeRows,
      Runtime13Of13: accountChecks,
      SignedReturnChecks: returnChecks,
    }, null, 2));
  } finally {
    if (began) {
      try { await transaction.rollback(); } catch (_) { /* transaction can already be aborted */ }
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    Task: 'UATV2_CURRENT_DATA_13_ACCOUNTS',
    Status: 'FAIL',
    PersistedChanges: false,
    Error: error.message,
  }, null, 2));
  process.exitCode = 1;
});
