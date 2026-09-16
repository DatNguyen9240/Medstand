'use strict';

/* Post-deploy runtime verification of the persisted UATV2 dataset. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
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

function number(value) {
  if (typeof value === 'number') return value;
  return Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
}

async function tier(pool, username, customerId, expectedTier) {
  const result = await pool.request()
    .input('Username', sql.VarChar(50), username)
    .input('MaKhachHang', sql.NVarChar(100), customerId)
    .input('NhomFilter', sql.VarChar(50), expectedTier)
    .input('Page', sql.Int, 1)
    .input('PageSize', sql.Int, 1)
    .input('AsOfDate', sql.Date, AS_OF)
    .execute('dbo.API_ChamDiemKH_AI');
  return (result.recordset || [])[0] || null;
}

async function main() {
  const env = { ...readEnv(), ...process.env };
  if (String(env.TEST_DB_DATABASE || '').toLowerCase() !== 'medtest') {
    throw new Error(`UATV2 verification is medtest-only; current database is ${env.TEST_DB_DATABASE || '(empty)'}`);
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

  try {
    const configRows = (await pool.request().query(`
SELECT ConfigKey, ConfigValue
FROM dbo.AI_BusinessRuleConfigTbl
WHERE RuleCode = 'BR-TIER-005' AND Status = 'APPROVED'
  AND EffectiveFrom <= SYSUTCDATETIME()
  AND (EffectiveTo IS NULL OR EffectiveTo > SYSUTCDATETIME());`)).recordset;
    const config = Object.fromEntries(configRows.map((row) => [row.ConfigKey, row.ConfigValue]));
    const expected = {
      A: [number(config.TierAMinNetRevenue), number(config.TierAMinFrequency)],
      B: [number(config.TierBMinNetRevenue), number(config.TierBMinFrequency)],
      C: [number(config.TierBMinNetRevenue) - 1, Math.max(1, number(config.TierBMinFrequency) - 1)],
      UNRATED: [0, 0],
    };

    const persisted = (await pool.request().query(`
SELECT
  (SELECT COUNT(*) FROM dbo.CF_ObjectTbl WHERE ObjectID LIKE 'UATV2[_]%' AND UserCreate = 'UATV2_MOCK') AS CustomerCount,
  (SELECT COUNT(*) FROM dbo.AR_OrderTbl WHERE DocumentID LIKE 'UATV2[_]%' AND UserCreate = 'UATV2_MOCK') AS OrderCount,
  (SELECT COUNT(*) FROM dbo.AR_InvoiceTbl WHERE DocumentID LIKE 'UATV2[_]%' AND UserCreate = 'UATV2_MOCK') AS InvoiceCount,
  (SELECT COUNT(*) FROM dbo.AR_ReturnTbl WHERE DocumentID LIKE 'UATV2[_]%' AND UserCreate = 'UATV2_MOCK') AS ReturnCount,
  (SELECT COUNT(*) FROM dbo.SY_BalanceObjectTbl WHERE DocumentID LIKE 'UATV2[_]%') AS DebtCount,
  (SELECT COUNT(*) FROM dbo.AR_SanPhamTrongTamDetailTbl WHERE DocumentID = 'UATV2_FOCUS_CURRENT') AS FocusProductCount,
  (SELECT COUNT(*) FROM dbo.AR_OrderAndReturnView WHERE DocumentID LIKE 'UATV2[_]%' AND StatusID IN (3,6,7,8)) AS SalesViewLines,
  (SELECT COUNT(*) FROM dbo.AR_OrderAndReturnView WHERE DocumentID LIKE 'UATV2[_]%' AND StatusID = 99) AS ReturnViewLines;`)).recordset[0];
    const persistedPass = Number(persisted.CustomerCount) === 28
      && Number(persisted.OrderCount) === 91
      && Number(persisted.InvoiceCount) === 63
      && Number(persisted.ReturnCount) === 7
      && Number(persisted.DebtCount) === 7
      && Number(persisted.FocusProductCount) === 3
      && Number(persisted.SalesViewLines) === 63
      && Number(persisted.ReturnViewLines) === 7;

    const checks = [];
    for (const [username, cohort] of accounts) {
      const tierResults = {};
      for (const tierName of ['A', 'B', 'C', 'UNRATED']) {
        const customerId = `UATV2_${cohort}_${tierName}`;
        const row = await tier(pool, username, customerId, tierName);
        tierResults[tierName] = {
          customerId: row?.ObjectID || null,
          tier: row?.Nhom || null,
          netRevenue: number(row?.DoanhSo12Thang ?? -1),
          frequency: number(row?.SoLanMua6Thang ?? -1),
          pass: Boolean(row
            && row.ObjectID === customerId
            && row.Nhom === tierName
            && number(row.DoanhSo12Thang) === expected[tierName][0]
            && number(row.SoLanMua6Thang) === expected[tierName][1]),
        };
      }

      const orders = (await pool.request()
        .input('Username', sql.VarChar(50), username)
        .input('TuNgay', sql.DateTime, AS_OF)
        .input('DenNgay', sql.DateTime, AS_OF)
        .input('timkiem', sql.NVarChar(50), 'UATV2_')
        .input('TopN', sql.Int, 100)
        .execute('dbo.API_DonHang_AI')).recordset || [];
      const orderRows = orders.filter((row) => String(row.DocumentID || '').startsWith('UATV2_'));
      const statuses = [...new Set(orderRows.map((row) => number(row.StatusID)))].sort((a, b) => a - b);

      const revenueRows = (await pool.request()
        .input('User', sql.VarChar(50), username)
        .input('FromDate', sql.DateTime, AS_OF)
        .input('ToDate', sql.DateTime, AS_OF)
        .input('LoaiBaoCao', sql.VarChar(50), 'TatCa')
        .execute('dbo.API_DoanhSo_AI')).recordset || [];
      const todayRevenue = revenueRows.reduce((sum, row) => sum + number(row.Amount ?? row['Doanh Số'] ?? 0), 0);

      const debtRow = ((await pool.request()
        .input('Username', sql.VarChar(50), username)
        .input('MaKhachHang', sql.NVarChar(100), `UATV2_${cohort}_B`)
        .input('DenNgay', sql.DateTime, AS_OF)
        .execute('dbo.API_CongNoKhachHang_AI')).recordset || [])[0] || null;
      const debtCustomer = debtRow?.CustomerID || debtRow?.MaKH || null;
      const debtAmount = number(debtRow?.TotalDebt ?? debtRow?.TongNo ?? 0);

      const pass = Object.values(tierResults).every((row) => row.pass)
        && orderRows.length >= 4
        && [-1, 0, 2, 10].every((status) => statuses.includes(status))
        && revenueRows.length > 0 && todayRevenue > 0
        && debtCustomer === `UATV2_${cohort}_B` && debtAmount > 0;
      checks.push({ username, cohort, tierResults, orderCount: orderRows.length, statuses, todayRevenue, debtAmount, pass });
    }

    const returnChecks = (await pool.request().query(`
SELECT O.ObjectID,
       SUM(CASE WHEN V.StatusID IN (3,6,7,8,99) THEN V.TotalAmount ELSE 0 END) AS NetRevenue,
       SUM(CASE WHEN V.StatusID = 99 THEN V.TotalAmount ELSE 0 END) AS SignedReturn
FROM dbo.CF_ObjectTbl O
JOIN dbo.AR_OrderAndReturnView V ON V.ObjectID = O.ObjectID
WHERE O.ObjectID LIKE 'UATV2[_]%'
GROUP BY O.ObjectID
HAVING O.ObjectID LIKE '%[_]A'
ORDER BY O.ObjectID;`)).recordset;
    const returnsPass = returnChecks.length === 7
      && returnChecks.every((row) => number(row.SignedReturn) < 0
        && number(row.NetRevenue) === expected.A[0]);

    const status = persistedPass && checks.every((row) => row.pass) && returnsPass ? 'PASS' : 'FAIL';
    console.log(JSON.stringify({
      Task: 'UATV2_CURRENT_DATA_13_ACCOUNTS',
      Status: status,
      Mode: 'POST_DEPLOY_RUNTIME',
      Database: env.TEST_DB_DATABASE,
      AsOfDate: '2026-08-03',
      PersistedCounts: persisted,
      AccountsPassed: checks.filter((row) => row.pass).length,
      AccountsTotal: checks.length,
      AccountChecks: checks,
      SignedReturnChecks: returnChecks,
    }, null, 2));
    if (status !== 'PASS') process.exitCode = 1;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    Task: 'UATV2_CURRENT_DATA_13_ACCOUNTS',
    Status: 'ERROR',
    Error: error.message,
  }, null, 2));
  process.exitCode = 1;
});
