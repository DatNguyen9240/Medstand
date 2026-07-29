'use strict';

/*
 * UAT-007 — đối soát phạm vi khách hàng của 13 tài khoản.
 * Chỉ đọc DB medtest; không ghi hoặc thay đổi dữ liệu.
 */

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const FIXTURES = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'config', 'uat', 'account-fixtures.v1.json'),
  'utf8',
)).accounts;

function envFile(relative) {
  const values = {};
  const file = path.join(ROOT, relative);
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

async function main() {
  const env = envFile('.env');
  const required = ['TEST_DB_SERVER', 'TEST_DB_DATABASE', 'TEST_DB_USER', 'TEST_DB_PASSWORD'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Thiếu cấu hình DB: ${missing.join(', ')}`);

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
    const accounts = Object.entries(FIXTURES);
    const values = accounts
      .map(([username, item], index) => `(${index + 1}, N'${username.replaceAll("'", "''")}', N'${item.role}', N'${item.region}', N'${item.customerId}')`)
      .join(',\n');
    const query = `
SET NOCOUNT ON;
IF DB_NAME() <> N'medtest' THROW 51407, N'UAT-007 chỉ được chạy trên DB medtest.', 1;

DECLARE @Accounts TABLE (
  SortOrder INT NOT NULL,
  UserName VARCHAR(50) NOT NULL PRIMARY KEY,
  ExpectedRole VARCHAR(20) NOT NULL,
  RegionID VARCHAR(10) NOT NULL,
  FixtureCustomer VARCHAR(50) NOT NULL
);
INSERT @Accounts (SortOrder, UserName, ExpectedRole, RegionID, FixtureCustomer)
VALUES ${values};

SELECT A.UserName, S.ObjectID
INTO #Scope
FROM @Accounts A
CROSS APPLY dbo.AR_GetObjectByUserFnc(A.UserName) S;

SELECT
  A.SortOrder,
  A.UserName,
  A.ExpectedRole,
  A.RegionID,
  A.FixtureCustomer,
  ScopedCustomers = COUNT(DISTINCT S.ObjectID),
  FixtureInScope = MAX(CASE WHEN UPPER(LTRIM(RTRIM(S.ObjectID))) = UPPER(A.FixtureCustomer) THEN 1 ELSE 0 END),
  Status = CASE
    WHEN COUNT(DISTINCT S.ObjectID) = 0 THEN 'FAIL_EMPTY_SCOPE'
    WHEN MAX(CASE WHEN UPPER(LTRIM(RTRIM(S.ObjectID))) = UPPER(A.FixtureCustomer) THEN 1 ELSE 0 END) = 0 THEN 'FAIL_FIXTURE_OUT_OF_SCOPE'
    ELSE 'PASS'
  END
FROM @Accounts A
LEFT JOIN #Scope S ON S.UserName = A.UserName
GROUP BY A.SortOrder, A.UserName, A.ExpectedRole, A.RegionID, A.FixtureCustomer
ORDER BY A.SortOrder;

SELECT
  SourceUser = A.UserName,
  SourceRole = A.ExpectedRole,
  SourceRegion = A.RegionID,
  ForeignCustomer = B.ObjectID,
  Leaked = CASE WHEN EXISTS (
    SELECT 1 FROM #Scope S
    WHERE S.UserName = A.UserName
      AND UPPER(LTRIM(RTRIM(S.ObjectID))) = UPPER(B.ObjectID)
  ) THEN 1 ELSE 0 END
FROM @Accounts A
CROSS APPLY (
  SELECT TOP (1) S.ObjectID
  FROM #Scope S
  INNER JOIN @Accounts X ON X.UserName = S.UserName
  WHERE X.RegionID <> A.RegionID
    AND NOT EXISTS (
      SELECT 1 FROM #Scope Mine
      WHERE Mine.UserName = A.UserName
        AND UPPER(LTRIM(RTRIM(Mine.ObjectID))) = UPPER(LTRIM(RTRIM(S.ObjectID)))
    )
  ORDER BY X.SortOrder, S.ObjectID
) B
ORDER BY A.SortOrder;

DROP TABLE #Scope;`;

    const result = await pool.request().query(query);
    const accountsResult = result.recordsets[0] || [];
    const negativeResult = result.recordsets[1] || [];
    const accountFailures = accountsResult.filter((item) => item.Status !== 'PASS');
    const leaks = negativeResult.filter((item) => Number(item.Leaked) !== 0);
    const summary = {
      task: 'UAT-007',
      mode: 'READ_ONLY_DATABASE_VERIFICATION',
      database: env.TEST_DB_DATABASE,
      status: accountFailures.length === 0 && leaks.length === 0 ? 'PASS' : 'FAIL',
      accountsChecked: accountsResult.length,
      accountsPassed: accountsResult.length - accountFailures.length,
      crossRegionChecks: negativeResult.length,
      crossRegionLeaks: leaks.length,
      accountFailures,
      leaks,
      accounts: accountsResult,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (summary.status !== 'PASS') process.exitCode = 1;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'UAT-007', status: 'ERROR', message: error.message }, null, 2));
  process.exitCode = 1;
});
