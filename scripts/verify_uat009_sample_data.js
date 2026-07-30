'use strict';

/* UAT-009 — kiểm tra bộ dữ liệu mẫu thực tế cho 13 tài khoản. Chỉ đọc DB medtest. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const fixtures = JSON.parse(fs.readFileSync(
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

async function main() {
  const env = readEnv();
  const values = Object.entries(fixtures).map(([username, fixture], index) =>
    `(${index + 1}, N'${username.replaceAll("'", "''")}', N'${fixture.role}', N'${fixture.region}', N'${fixture.customerId}')`
  ).join(',\n');

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
    const query = `
SET NOCOUNT ON;
IF DB_NAME() <> N'medtest' THROW 51409, N'UAT-009 chỉ được chạy trên DB medtest.', 1;

DECLARE @Accounts TABLE (
  SortOrder INT NOT NULL,
  UserName VARCHAR(50) NOT NULL PRIMARY KEY,
  RoleName VARCHAR(20) NOT NULL,
  RegionID VARCHAR(10) NOT NULL,
  FixtureCustomer VARCHAR(50) NOT NULL
);
INSERT @Accounts VALUES ${values};

SELECT A.UserName, S.ObjectID
INTO #Scope
FROM @Accounts A
CROSS APPLY dbo.AR_GetObjectByUserFnc(A.UserName) S;

SELECT
  A.SortOrder,
  A.UserName,
  A.RoleName,
  A.RegionID,
  A.FixtureCustomer,
  CustomerExists = CASE WHEN O.ObjectID IS NULL THEN 0 ELSE 1 END,
  CustomerActive = CASE WHEN O.ObjectID IS NOT NULL AND ISNULL(O.isCustomer, 0) = 1 AND ISNULL(O.isDisable, 0) = 0 THEN 1 ELSE 0 END,
  CustomerInScope = CASE WHEN EXISTS (
    SELECT 1 FROM #Scope S WHERE S.UserName = A.UserName AND S.ObjectID = A.FixtureCustomer
  ) THEN 1 ELSE 0 END,
  CustomerBranch = O.BranchID,
  RouteDay = O.ThuTrongTuan,
  InvoiceCount = (
    SELECT COUNT(DISTINCT I.DocumentID)
    FROM dbo.AR_InvoiceTbl I WITH (NOLOCK)
    WHERE I.ObjectID = A.FixtureCustomer AND I.StatusID IN (3, 6, 7, 8)
  ),
  OrderCount = (
    SELECT COUNT(DISTINCT H.DocumentID)
    FROM dbo.AR_OrderTbl H WITH (NOLOCK)
    WHERE H.ObjectID = A.FixtureCustomer
  ),
  SampleItemCount = (
    SELECT COUNT(*) FROM dbo.CF_ItemTbl I WITH (NOLOCK)
    WHERE I.ItemID IN ('A003', 'Q002', 'G010') AND ISNULL(I.isDisable, 0) = 0
  ),
  MainWarehouseCount = (
    SELECT COUNT(DISTINCT US.StoreHouseID)
    FROM dbo.SY_UserStoreHouseTbl US WITH (NOLOCK)
    WHERE US.UserName = A.UserName AND US.StoreHouseID IN ('CTY', 'DL02', 'DL03')
  ) + CASE WHEN A.RoleName = 'manager' THEN (
    SELECT COUNT(DISTINCT US.StoreHouseID)
    FROM dbo.SY_User SU WITH (NOLOCK)
    JOIN dbo.SY_User Child WITH (NOLOCK) ON Child.ManagerID = SU.EmployeeID AND ISNULL(Child.Disable, 0) = 0
    JOIN dbo.SY_UserStoreHouseTbl US WITH (NOLOCK) ON US.UserName = Child.UserName
    WHERE SU.UserName = A.UserName AND US.StoreHouseID IN ('CTY', 'DL02', 'DL03')
      AND NOT EXISTS (
        SELECT 1 FROM dbo.SY_UserStoreHouseTbl DirectStore WITH (NOLOCK)
        WHERE DirectStore.UserName = A.UserName AND DirectStore.StoreHouseID = US.StoreHouseID
      )
  ) ELSE 0 END,
  Status = CASE
    WHEN O.ObjectID IS NULL OR ISNULL(O.isCustomer, 0) <> 1 OR ISNULL(O.isDisable, 0) <> 0 THEN 'FAIL_CUSTOMER'
    WHEN NOT EXISTS (SELECT 1 FROM #Scope S WHERE S.UserName = A.UserName AND S.ObjectID = A.FixtureCustomer) THEN 'FAIL_CUSTOMER_SCOPE'
    WHEN (SELECT COUNT(*) FROM dbo.CF_ItemTbl I WITH (NOLOCK) WHERE I.ItemID IN ('A003', 'Q002', 'G010') AND ISNULL(I.isDisable, 0) = 0) < 3 THEN 'FAIL_SAMPLE_ITEMS'
    WHEN NOT EXISTS (
      SELECT 1 FROM dbo.SY_UserStoreHouseTbl US WITH (NOLOCK)
      WHERE US.UserName = A.UserName AND US.StoreHouseID IN ('CTY', 'DL02', 'DL03')
    ) AND NOT EXISTS (
      SELECT 1
      FROM dbo.SY_User SU WITH (NOLOCK)
      JOIN dbo.SY_User Child WITH (NOLOCK) ON Child.ManagerID = SU.EmployeeID AND ISNULL(Child.Disable, 0) = 0
      JOIN dbo.SY_UserStoreHouseTbl US WITH (NOLOCK) ON US.UserName = Child.UserName
      WHERE SU.UserName = A.UserName AND US.StoreHouseID IN ('CTY', 'DL02', 'DL03')
    ) THEN 'FAIL_MAIN_WAREHOUSE'
    WHEN NOT EXISTS (
      SELECT 1 FROM dbo.AR_OrderTbl H WITH (NOLOCK) WHERE H.ObjectID = A.FixtureCustomer
    ) THEN 'FAIL_NO_ORDER_SAMPLE'
    ELSE 'PASS'
  END
FROM @Accounts A
LEFT JOIN dbo.CF_ObjectTbl O WITH (NOLOCK) ON O.ObjectID = A.FixtureCustomer
ORDER BY A.SortOrder;

SELECT
  ItemID,
  ItemName,
  Unit,
  IsActive = CASE WHEN ISNULL(isDisable, 0) = 0 THEN 1 ELSE 0 END
FROM dbo.CF_ItemTbl WITH (NOLOCK)
WHERE ItemID IN ('A003', 'Q002', 'G010')
ORDER BY ItemID;

DROP TABLE #Scope;`;

    const result = await pool.request().query(query);
    const accounts = result.recordsets[0] || [];
    const products = result.recordsets[1] || [];
    const failures = accounts.filter((row) => row.Status !== 'PASS');
    const summary = {
      task: 'UAT-009',
      mode: 'READ_ONLY_DATABASE_VERIFICATION',
      database: env.TEST_DB_DATABASE,
      status: failures.length ? 'FAIL' : 'PASS',
      accountsChecked: accounts.length,
      accountsPassed: accounts.length - failures.length,
      sampleProductsChecked: products.length,
      failures,
      accounts,
      products,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (summary.status !== 'PASS') process.exitCode = 1;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'UAT-009', status: 'ERROR', message: error.message }, null, 2));
  process.exitCode = 1;
});
