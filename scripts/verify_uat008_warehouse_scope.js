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
WHERE U.StoreHouseID IN ('CTY', 'DL02', 'DL03');

ALTER TABLE #EffectiveStores ALTER COLUMN MappingSource VARCHAR(30) NOT NULL;

INSERT #EffectiveStores (UserName, StoreHouseID, MappingSource)
SELECT DISTINCT A.UserName, UStore.StoreHouseID, 'MANAGER_INHERITED'
FROM @Accounts A
INNER JOIN dbo.SY_User SU WITH (NOLOCK) ON SU.UserName = A.UserName AND ISNULL(SU.Manager, 0) = 1
INNER JOIN dbo.SY_User Child WITH (NOLOCK) ON Child.ManagerID = SU.EmployeeID AND ISNULL(Child.Disable, 0) = 0
INNER JOIN dbo.SY_UserStoreHouseTbl UStore WITH (NOLOCK) ON UStore.UserName = Child.UserName
WHERE UStore.StoreHouseID IN ('CTY', 'DL02', 'DL03')
  AND NOT EXISTS (
    SELECT 1 FROM #EffectiveStores E
    WHERE E.UserName = A.UserName AND E.StoreHouseID = UStore.StoreHouseID
  );

SELECT A.SortOrder, A.UserName, A.RoleName, A.RegionID,
       DirectWarehouseCount = (SELECT COUNT(DISTINCT D.StoreHouseID) FROM dbo.SY_UserStoreHouseTbl D WHERE D.UserName = A.UserName),
       HiddenWarehouseCount = (SELECT COUNT(DISTINCT D.StoreHouseID) FROM dbo.SY_UserStoreHouseTbl D WHERE D.UserName = A.UserName AND D.StoreHouseID NOT IN ('CTY', 'DL02', 'DL03')),
       MappingWarehouseCount = COUNT(DISTINCT E.StoreHouseID),
       MappingWarehouses = STRING_AGG(CONVERT(VARCHAR(MAX), E.StoreHouseID), ', '),
       MappingSources = STRING_AGG(CONVERT(VARCHAR(MAX), E.MappingSource), ', '),
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
       EffectiveWarehouseCount = COUNT(DISTINCT E.StoreHouseID),
       EffectiveWarehouses = STRING_AGG(CONVERT(VARCHAR(MAX), E.StoreHouseID), ', ')
FROM @Accounts A
LEFT JOIN #EffectiveStores E ON E.UserName = A.UserName
GROUP BY A.SortOrder, A.UserName, A.RoleName, A.RegionID
ORDER BY A.SortOrder;`;
    const result = await pool.request().query(query);
    const mapping = result.recordsets[0] || [];
    const details = result.recordsets[1] || [];
    const effective = result.recordsets[2] || [];
    const effectiveByUser = new Map();
    for (const row of details) {
      if (!effectiveByUser.has(row.UserName)) effectiveByUser.set(row.UserName, new Set());
      effectiveByUser.get(row.UserName).add(String(row.StoreHouseID).trim().toUpperCase());
    }
    const stock = [];
    for (const [username, fixture] of Object.entries(fixtures)) {
      try {
        const response = await pool.request()
          .input('Username', sql.VarChar(50), username)
          .input('ItemID', sql.VarChar(50), '')
          .input('TenSanPham', sql.VarChar(200), '')
          .input('timkiem', sql.NVarChar(200), '')
          .execute('dbo.API_DanhsachTonKho_AI');
        const rows = response.recordset || [];
        const warehouses = [...new Set(rows.map((row) => String(row.StoreHouseID || '').trim()).filter(Boolean))];
        const allowed = effectiveByUser.get(username) || new Set();
        const outside = warehouses.filter((warehouse) => !allowed.has(warehouse.toUpperCase()));
        stock.push({ UserName: username, RoleName: fixture.role, RegionID: fixture.region, VisibleWarehouseCount: warehouses.length,
          VisibleWarehouses: warehouses.join(', '), VisibleOnlyMapped: outside.length === 0 ? 1 : 0,
          OutsideMappedWarehouses: outside.join(', '), StockStatus: outside.length ? 'FAIL_STOCK_OUTSIDE_MAPPING' : (warehouses.length ? 'PASS' : 'NO_VISIBLE_STOCK') });
      } catch (error) { stock.push({ UserName: username, StockStatus: 'ERROR_API_DANHSACH_TONKHO', Error: error.message }); }
    }
    const reviews = [
      ...mapping.filter((row) => row.MappingStatus !== 'PASS'),
      ...details.filter((row) => row.MappingStatus !== 'PASS'),
      ...stock.filter((row) => row.StockStatus === 'FAIL_STOCK_OUTSIDE_MAPPING' || row.StockStatus === 'ERROR_API_DANHSACH_TONKHO'),
    ];
    const summary = {
      task: 'UAT-008', mode: 'READ_ONLY_DATABASE_VERIFICATION', database: env.TEST_DB_DATABASE,
      status: reviews.length ? 'FAIL' : 'PASS',
      accountsChecked: mapping.length, accountsPassed: mapping.filter((row) => row.MappingStatus === 'PASS').length,
      mapping, mappingDetails: details, effective, stockVisibility: stock, reviews,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (summary.status !== 'PASS') process.exitCode = 1;
  } finally { await pool.close(); }
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'UAT-008', status: 'ERROR', message: error.message }, null, 2));
  process.exitCode = 1;
});
