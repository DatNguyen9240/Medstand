'use strict';

/* UAT-008 — đối soát mapping kho và kho hiển thị. Chỉ đọc DB medtest. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const fixtures = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'config', 'uat', 'account-fixtures.v1.json'), 'utf8',
)).accounts;

function readEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  }
  return env;
}

async function main() {
  const env = readEnv();
  const accounts = Object.entries(fixtures);
  const values = accounts.map(([username, item], index) =>
    `(${index + 1}, N'${username.replaceAll("'", "''")}', N'${item.role}', N'${item.region}')`).join(',\n');
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
IF DB_NAME() <> N'medtest' THROW 51408, N'UAT-008 chỉ được chạy trên DB medtest.', 1;
DECLARE @Accounts TABLE (SortOrder INT, UserName VARCHAR(50), RoleName VARCHAR(20), RegionID VARCHAR(10));
INSERT @Accounts VALUES ${values};

DECLARE @SalesWarehouses TABLE (StoreHouseID VARCHAR(50) PRIMARY KEY);
INSERT @SalesWarehouses VALUES ('CTY'), ('DL02'), ('DL03');

SELECT DISTINCT A.UserName, U.StoreHouseID, 'DIRECT' AS MappingSource
INTO #EffectiveStores
FROM @Accounts A
INNER JOIN dbo.SY_UserStoreHouseTbl U WITH (NOLOCK) ON U.UserName = A.UserName
WHERE ISNULL(U.StoreHouseID, '') <> '';

INSERT #EffectiveStores (UserName, StoreHouseID, MappingSource)
SELECT DISTINCT A.UserName, UStore.StoreHouseID, 'MANAGER_INHERITED'
FROM @Accounts A
INNER JOIN dbo.SY_User SU WITH (NOLOCK) ON SU.UserName = A.UserName AND ISNULL(SU.Manager, 0) = 1
INNER JOIN dbo.SY_User Child WITH (NOLOCK) ON Child.ManagerID = SU.EmployeeID AND ISNULL(Child.Disable, 0) = 0
INNER JOIN dbo.SY_UserStoreHouseTbl UStore WITH (NOLOCK) ON UStore.UserName = Child.UserName
WHERE ISNULL(UStore.StoreHouseID, '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM #EffectiveStores E
    WHERE E.UserName = A.UserName AND E.StoreHouseID = UStore.StoreHouseID
  );

SELECT A.SortOrder, A.UserName, A.RoleName, A.RegionID,
       DirectWarehouseCount = (SELECT COUNT(DISTINCT D.StoreHouseID) FROM dbo.SY_UserStoreHouseTbl D WHERE D.UserName = A.UserName),
       MappingWarehouseCount = COUNT(DISTINCT E.StoreHouseID),
       MappingWarehouses = STRING_AGG(CONVERT(VARCHAR(MAX), E.StoreHouseID), ', ') WITHIN GROUP (ORDER BY E.StoreHouseID),
       MappingSources = STRING_AGG(CONVERT(VARCHAR(MAX), E.MappingSource), ', ') WITHIN GROUP (ORDER BY E.MappingSource),
       MappingOnlyAllowed = CASE WHEN COUNT(CASE WHEN S.StoreHouseID IS NULL THEN 1 END) = 0 THEN 1 ELSE 0 END,
       MappingStatus = CASE WHEN COUNT(DISTINCT E.StoreHouseID) = 0 THEN 'FAIL_NO_EFFECTIVE_MAPPING'
                            WHEN COUNT(CASE WHEN S.StoreHouseID IS NULL THEN 1 END) > 0 THEN 'REVIEW_UNAPPROVED_WAREHOUSE'
                            ELSE 'PASS' END
FROM @Accounts A
LEFT JOIN #EffectiveStores E ON E.UserName = A.UserName
LEFT JOIN @SalesWarehouses S ON S.StoreHouseID = E.StoreHouseID
GROUP BY A.SortOrder, A.UserName, A.RoleName, A.RegionID
ORDER BY A.SortOrder;

SELECT A.SortOrder, A.UserName, A.RoleName, A.RegionID, U.StoreHouseID,
       StoreName = SH.StoreHouseName,
       MappingSource = U.MappingSource,
       MappingStatus = CASE WHEN S.StoreHouseID IS NULL THEN 'REVIEW_UNAPPROVED_WAREHOUSE' ELSE 'PASS' END
FROM @Accounts A
LEFT JOIN #EffectiveStores U ON U.UserName = A.UserName
LEFT JOIN @SalesWarehouses S ON S.StoreHouseID = U.StoreHouseID
LEFT JOIN dbo.CF_StoreHouseTbl SH WITH (NOLOCK) ON SH.StoreHouseID = U.StoreHouseID
WHERE U.StoreHouseID IS NOT NULL
ORDER BY A.SortOrder, U.StoreHouseID;

SELECT A.SortOrder, A.UserName, A.RoleName, A.RegionID,
       VisibleWarehouseCount = COUNT(DISTINCT T.StoreHouseID),
       VisibleWarehouses = STRING_AGG(CONVERT(VARCHAR(MAX), T.StoreHouseID), ', ') WITHIN GROUP (ORDER BY T.StoreHouseID),
       VisibleOnlyMapped = CASE WHEN COUNT(CASE WHEN M.StoreHouseID IS NULL THEN 1 END) = 0 THEN 1 ELSE 0 END,
       StockStatus = CASE WHEN COUNT(DISTINCT T.StoreHouseID) = 0 THEN 'NO_VISIBLE_STOCK'
                          WHEN COUNT(CASE WHEN M.StoreHouseID IS NULL THEN 1 END) > 0 THEN 'FAIL_STOCK_OUTSIDE_MAPPING'
                          ELSE 'PASS' END
FROM @Accounts A
OUTER APPLY (
  SELECT DISTINCT V.StoreHouseID
  FROM dbo.IV_StockTransactionTbl V WITH (NOLOCK)
  WHERE ISNULL(V.StoreHouseID, '') <> ''
    AND EXISTS (SELECT 1 FROM #EffectiveStores U WHERE U.UserName = A.UserName AND U.StoreHouseID = V.StoreHouseID)
) T
LEFT JOIN dbo.SY_UserStoreHouseTbl M WITH (NOLOCK) ON M.UserName = A.UserName AND M.StoreHouseID = T.StoreHouseID
GROUP BY A.SortOrder, A.UserName, A.RoleName, A.RegionID
ORDER BY A.SortOrder;`;
    const result = await pool.request().query(query);
    const mapping = result.recordsets[0] || [];
    const details = result.recordsets[1] || [];
    const stock = result.recordsets[2] || [];
    const failures = [
      ...mapping.filter((row) => row.MappingStatus !== 'PASS'),
      ...details.filter((row) => row.MappingStatus !== 'PASS'),
      ...stock.filter((row) => row.StockStatus === 'FAIL_STOCK_OUTSIDE_MAPPING'),
    ];
    const summary = {
      task: 'UAT-008', mode: 'READ_ONLY_DATABASE_VERIFICATION', database: env.TEST_DB_DATABASE,
      status: failures.length ? 'REVIEW_REQUIRED' : 'PASS',
      accountsChecked: mapping.length, accountsPassed: mapping.filter((row) => row.MappingStatus === 'PASS').length,
      mapping, mappingDetails: details, stockVisibility: stock, failures,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (summary.status !== 'PASS') process.exitCode = 1;
  } finally { await pool.close(); }
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'UAT-008', status: 'ERROR', message: error.message }, null, 2));
  process.exitCode = 1;
});
