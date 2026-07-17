const sql = require('mssql');
const path = require('path');
const { loadLocalEnv } = require('./lib/load-local-env');

loadLocalEnv(path.resolve(__dirname, '..'));

const config = {
  server: process.env.TEST_DB_SERVER,
  port: Number(process.env.TEST_DB_PORT || 1433),
  database: process.env.TEST_DB_DATABASE,
  user: process.env.TEST_DB_USER,
  password: process.env.TEST_DB_PASSWORD,
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: 10000,
  requestTimeout: 60000,
};

const missingDbConfig = Object.entries({
  TEST_DB_SERVER: config.server,
  TEST_DB_DATABASE: config.database,
  TEST_DB_USER: config.user,
  TEST_DB_PASSWORD: config.password,
}).filter(([, value]) => !value).map(([name]) => name);

if (missingDbConfig.length > 0) {
  throw new Error(`Missing test database configuration: ${missingDbConfig.join(', ')}`);
}

function monday(date) {
  const d = new Date(date + 'T00:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  return d;
}

function label(date) {
  const mon = monday(date);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = d => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
  return fmt(mon) + '-' + fmt(sun);
}

function aggregate(from, to, records) {
  const weeks = {};
  for (let d = new Date(from + 'T00:00:00'), end = new Date(to + 'T00:00:00'); d <= end; d.setDate(d.getDate() + 1)) {
    weeks[label(d.toISOString().slice(0, 10))] = 0;
  }
  for (const r of records) {
    const key = label(String(r.Ngay).slice(0, 10));
    weeks[key] = (weeks[key] || 0) + Number(r.Amount || 0);
  }
  return weeks;
}

async function main() {
  const pool = await sql.connect(config);
  const users = await pool.request().query(`
    SELECT TOP 1 UserName, EmployeeID, ManagerID, BranchID, CeoID, UserGroupID, Manager
    FROM SY_User WHERE COALESCE(Disable, 0) = 0
    ORDER BY CASE WHEN UserGroupID = 'Admin' THEN 0 WHEN Manager = 1 THEN 1 ELSE 2 END, UserName`);
  const user = users.recordset[0];
  const ranges = [
    ['1M', '2026-06-11', '2026-07-10'],
    ['3M', '2026-04-11', '2026-07-10'],
    ['6M', '2026-01-11', '2026-07-10'],
    ['1Y', '2025-07-11', '2026-07-10'],
  ];
  const results = { user, ranges: {}, controlled: {} };
  for (const [name, from, to] of ranges) {
    const req = pool.request();
    req.input('from', sql.Date, from);
    req.input('to', sql.Date, to);
    const q = await req.query(`
      SELECT CAST(DocumentDate AS date) AS Ngay, SUM(Amount) AS Amount,
             SUM(CASE WHEN Amount < 0 THEN 1 ELSE 0 END) AS NegativeRows,
             COUNT_BIG(*) AS TransactionRows
      FROM AR_OrderAndReturnView
      WHERE DocumentDate >= @from AND DocumentDate < DATEADD(day, 1, @to)
        AND StatusID NOT IN (-2, -1, 0)
      GROUP BY CAST(DocumentDate AS date)
      ORDER BY CAST(DocumentDate AS date)`);
    const weeks = aggregate(from, to, q.recordset);
    results.ranges[name] = {
      from, to,
      dayCount: q.recordset.length,
      weekCount: Object.keys(weeks).length,
      total: Object.values(weeks).reduce((a, b) => a + b, 0),
      negativeDays: q.recordset.filter(r => Number(r.Amount) < 0).length,
      negativeRows: q.recordset.reduce((a, r) => a + Number(r.NegativeRows), 0),
      zeroWeeks: Object.values(weeks).filter(v => v === 0).length,
      weeks,
    };
  }
  results.controlled.complete = aggregate('2026-06-01', '2026-06-21', [
    { Ngay: '2026-06-01', Amount: 100 }, { Ngay: '2026-06-03', Amount: 50 },
    { Ngay: '2026-06-08', Amount: 200 }, { Ngay: '2026-06-15', Amount: 75 },
  ]);
  results.controlled.gap = aggregate('2026-06-01', '2026-06-21', [
    { Ngay: '2026-06-01', Amount: 100 }, { Ngay: '2026-06-15', Amount: 75 },
  ]);
  results.controlled.negative = aggregate('2026-06-01', '2026-06-07', [
    { Ngay: '2026-06-01', Amount: 100 }, { Ngay: '2026-06-02', Amount: -150 },
  ]);
  results.controlled.noData = aggregate('2026-06-01', '2026-06-21', []);
  console.log(JSON.stringify(results, null, 2));
  await pool.close();
}

main().catch(err => { console.error(err); process.exitCode = 1; });
