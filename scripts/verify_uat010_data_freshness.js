'use strict';

/* UAT-010 — kiểm tra ngày chốt, múi giờ và giới hạn ngày dữ liệu. Chỉ đọc DB medtest. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const accounts = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'config', 'uat', 'account-fixtures.v1.json'), 'utf8',
)).accounts;

function readEnv() {
  const values = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function dateKey(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

async function main() {
  const env = readEnv();
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 60000,
    pool: { max: 2, min: 0, idleTimeoutMillis: 10000 },
  });

  try {
    const environment = (await pool.request().query(`
SET NOCOUNT ON;
IF DB_NAME() <> N'medtest' THROW 51410, N'UAT-010 chỉ được chạy trên DB medtest.', 1;
SELECT
  DatabaseName = DB_NAME(),
  DatabaseNow = GETDATE(),
  DatabaseUtcNow = GETUTCDATE(),
  UtcOffsetMinutes = DATEDIFF(MINUTE, GETUTCDATE(), GETDATE()),
  DatabaseToday = CAST(GETDATE() AS DATE),
  CutoffDate = DATEADD(DAY, -1, CAST(GETDATE() AS DATE)),
  FutureSalesRows = (SELECT COUNT_BIG(*) FROM dbo.AR_OrderAndReturnView WITH (NOLOCK) WHERE DocumentDate >= DATEADD(DAY, 1, CAST(GETDATE() AS DATE))),
  FutureInvoiceRows = (SELECT COUNT_BIG(*) FROM dbo.AR_InvoiceTbl WITH (NOLOCK) WHERE DocumentDate >= DATEADD(DAY, 1, CAST(GETDATE() AS DATE))),
  FutureOrderRows = (SELECT COUNT_BIG(*) FROM dbo.AR_OrderTbl WITH (NOLOCK) WHERE DocumentDate >= DATEADD(DAY, 1, CAST(GETDATE() AS DATE)));
`)).recordset[0];

    const cutoff = new Date(environment.CutoffDate);
    const cutoffKey = dateKey(cutoff);
    const start = new Date(cutoff);
    start.setUTCDate(start.getUTCDate() - 30);
    const results = [];

    for (const [username, fixture] of Object.entries(accounts)) {
      try {
        const response = await pool.request()
          .input('Username', sql.VarChar(50), username)
          .input('FromDate', sql.DateTime, start)
          .input('ToDate', sql.DateTime, cutoff)
          .input('LoaiBaoCao', sql.VarChar(50), 'TatCa')
          .execute('dbo.API_DoanhSo_AI');
        const rows = response.recordset || [];
        const returnedDates = rows.map((row) => dateKey(row.Ngay || row.DocumentDate || row.AsOfDate)).filter(Boolean);
        const future = returnedDates.filter((value) => value > cutoffKey);
        results.push({
          UserName: username,
          RoleName: fixture.role,
          RegionID: fixture.region,
          CutoffDate: cutoffKey,
          RowCount: rows.length,
          MinReturnedDate: returnedDates.sort()[0] || null,
          MaxReturnedDate: returnedDates.sort().at(-1) || null,
          FutureRowCount: future.length,
          Status: rows.length === 0 ? 'FAIL_NO_DATA' : (future.length ? 'FAIL_AFTER_CUTOFF' : 'PASS'),
        });
      } catch (error) {
        results.push({ UserName: username, Status: 'ERROR_API_DOANHSO', Error: error.message });
      }
    }

    const frontend = fs.readFileSync(path.join(ROOT, 'chatbot-widget', 'js', 'chatbot.js'), 'utf8');
    const debtRenderer = fs.readFileSync(path.join(ROOT, 'chatbot-widget', 'js', 'chatbot-renderers-medstand.js'), 'utf8');
    const uiChecks = [
      {
        Check: 'SALES_PERIOD_VISIBLE',
        Pass: frontend.includes('Khoảng thời gian') && frontend.includes('displayDate(fromDate)') && frontend.includes('displayDate(toDate)'),
      },
      {
        Check: 'DEBT_AS_OF_VISIBLE',
        Pass: debtRenderer.includes("['AsOfDate', 'NgayChot']") && debtRenderer.includes('asOfDate'),
      },
      {
        Check: 'STOCK_TIMESTAMP_NOT_CLAIMED_AS_SOURCE_WHEN_MISSING',
        Pass: !debtRenderer.includes("|| new Date();") || debtRenderer.includes('StockUpdatedAt'),
        Note: 'Renderer hiện có fallback thời gian trình duyệt khi API thiếu timestamp; cần phân biệt thời gian tải với thời gian chốt nguồn.',
      },
    ];

    const failures = results.filter((row) => row.Status !== 'PASS');
    const uiFailures = uiChecks.filter((row) => !row.Pass);
    const summary = {
      task: 'UAT-010',
      mode: 'READ_ONLY_DATABASE_AND_STATIC_UI_VERIFICATION',
      database: env.TEST_DB_DATABASE,
      status: failures.length || uiFailures.length ? 'REVIEW_REQUIRED' : 'PASS',
      timezone: {
        expected: 'Asia/Bangkok (UTC+07:00)',
        utcOffsetMinutes: environment.UtcOffsetMinutes,
        status: Number(environment.UtcOffsetMinutes) === 420 ? 'PASS' : 'REVIEW_REQUIRED',
      },
      databaseToday: dateKey(environment.DatabaseToday),
      cutoffDate: cutoffKey,
      futureRowsInSource: {
        sales: Number(environment.FutureSalesRows),
        invoices: Number(environment.FutureInvoiceRows),
        orders: Number(environment.FutureOrderRows),
      },
      accountsChecked: results.length,
      accountsPassed: results.length - failures.length,
      failures,
      uiChecks,
      accounts: results,
    };
    if (summary.timezone.status !== 'PASS') summary.status = 'REVIEW_REQUIRED';
    console.log(JSON.stringify(summary, null, 2));
    if (summary.status !== 'PASS') process.exitCode = 1;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'UAT-010', status: 'ERROR', message: error.message }, null, 2));
  process.exitCode = 1;
});
