'use strict';

/* Read-only schema/scope discovery for the isolated UATV2 seed. */
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
  const env = { ...readEnv(), ...process.env };
  if (String(env.TEST_DB_DATABASE || '').toLowerCase() !== 'medtest') throw new Error('Discovery chỉ chạy trên medtest.');
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 120000,
  });
  try {
    const tableNames = [
      'CF_ObjectTbl', 'AR_OrderTbl', 'AR_OrderDetailTbl',
      'AR_InvoiceTbl', 'AR_InvoiceDetailTbl', 'AR_ReturnTbl',
      'AR_ReturnDetailTbl', 'SY_BalanceObjectTbl',
      'AR_SanPhamTrongTamTbl', 'AR_SanPhamTrongTamDetailTbl',
      'AR_PromotionTbl', 'AR_PromotionGiftTbl',
    ];
    const columns = (await pool.request()
      .input('Names', sql.NVarChar(sql.MAX), tableNames.join(','))
      .query(`
SELECT
  OBJECT_NAME(C.object_id) AS TableName,
  C.column_id AS Ordinal,
  C.name AS ColumnName,
  TYPE_NAME(C.user_type_id) AS DataType,
  C.max_length AS MaxLength,
  C.is_nullable AS IsNullable,
  C.is_identity AS IsIdentity,
  DC.definition AS DefaultDefinition
FROM sys.columns C
LEFT JOIN sys.default_constraints DC ON DC.object_id = C.default_object_id
WHERE OBJECT_NAME(C.object_id) IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@Names, ','))
ORDER BY TableName, C.column_id;`)).recordset;

    const values = Object.entries(fixtures).map(([username, fixture], index) =>
      `(${index + 1}, N'${username.replaceAll("'", "''")}', N'${fixture.role}', N'${fixture.region}', N'${fixture.customerId}')`);
    const accountContext = (await pool.request().query(`
DECLARE @Accounts TABLE
(
  SortOrder INT, UserName VARCHAR(50), RoleName VARCHAR(20), RegionID VARCHAR(10), FixtureCustomer VARCHAR(50)
);
INSERT INTO @Accounts VALUES ${values.join(',')};

SELECT
  A.SortOrder, A.UserName, A.RoleName, A.RegionID, A.FixtureCustomer,
  U.EmployeeID, U.ManagerID, U.BranchID, U.CeoID, U.Manager AS IsManager,
  O.ObjectGroupID, O.LocationID, O.QuanHuyen, O.XaPhuong,
  CASE WHEN EXISTS (
    SELECT 1 FROM dbo.AR_GetObjectByUserFnc(A.UserName) S WHERE S.ObjectID = A.FixtureCustomer
  ) THEN 1 ELSE 0 END AS FixtureInScope
FROM @Accounts A
LEFT JOIN dbo.SY_User U ON U.UserName = A.UserName
LEFT JOIN dbo.CF_ObjectTbl O ON O.ObjectID = A.FixtureCustomer
ORDER BY A.SortOrder;`)).recordset;

    const samples = {};
    for (const tableName of ['AR_OrderTbl', 'AR_OrderDetailTbl', 'AR_InvoiceTbl', 'AR_InvoiceDetailTbl', 'AR_ReturnTbl', 'AR_ReturnDetailTbl', 'SY_BalanceObjectTbl']) {
      samples[tableName] = (await pool.request().query(`SELECT TOP (1) * FROM dbo.${tableName} ORDER BY 1 DESC;`)).recordset;
    }

    const dictionaries = (await pool.request().query(`
SELECT 'ORDER' AS Source, StatusID, StatusName FROM dbo.AR_OrderStatusTbl
UNION ALL
SELECT 'INVOICE', StatusID, StatusName FROM dbo.AR_InvoiceStatusTbl
ORDER BY Source, StatusID;`)).recordset;

    const requiredOnly = process.argv.includes('--required-only');
    console.log(JSON.stringify({
      Status: 'PASS', Database: env.TEST_DB_DATABASE,
      Columns: requiredOnly
        ? columns.filter((column) => !column.IsNullable && !column.IsIdentity && !column.DefaultDefinition)
        : columns,
      AccountContext: accountContext,
      SampleRows: requiredOnly ? undefined : samples,
      StatusDictionaries: dictionaries,
    }, null, 2));
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Status: 'ERROR', Error: error.message }, null, 2));
  process.exitCode = 1;
});
