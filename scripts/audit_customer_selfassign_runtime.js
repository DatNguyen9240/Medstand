'use strict';

/* Read-only audit of the deployed demo customer SELF_ASSIGN capability. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');

function readEnv() {
  const values = {};
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return values;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function hasAll(source, markers) {
  const text = String(source || '');
  return markers.every((marker) => text.includes(marker));
}

async function main() {
  const env = { ...readEnv(), ...process.env };
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 60000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 },
  });

  try {
    const database = (await pool.request().query('SELECT DB_NAME() AS DbName')).recordset[0].DbName;
    if (database !== 'medtest') throw new Error(`Audit chỉ được chạy trên medtest; hiện tại là ${database}.`);

    const modules = (await pool.request().query(`
      SELECT O.name AS ObjectName, O.type_desc AS ObjectType, M.definition
      FROM sys.objects O
      LEFT JOIN sys.sql_modules M ON M.object_id = O.object_id
      WHERE O.name IN
      (
          'API_EmployeeByManager_AI',
          'API_KhachHang_Insert_AI',
          'API_ObjectGroupByUser_AI',
          'AI_GetTinhThanhByUserFnc',
          'API_TinhThanhByUser_AI'
      );`)).recordset;
    const definition = Object.fromEntries(modules.map((row) => [row.ObjectName, row.definition || '']));

    const persisted = (await pool.request().query(`
      DECLARE @Config TABLE
      (
          Username VARCHAR(50), EmployeeID VARCHAR(50), ObjectGroupID VARCHAR(50),
          LocationID NVARCHAR(100), DisplayName NVARCHAR(150), IsActive BIT
      );
      IF OBJECT_ID(N'dbo.AI_CustomerSelfAssignConfig', N'U') IS NOT NULL
          INSERT @Config
          EXEC sys.sp_executesql N'
              SELECT Username, EmployeeID, ObjectGroupID, LocationID, DisplayName, IsActive
              FROM dbo.AI_CustomerSelfAssignConfig WHERE Username = ''demo'';';

      SELECT OBJECT_ID(N'dbo.AI_CustomerSelfAssignConfig', N'U') AS ConfigTableObjectID,
             C.Username, C.EmployeeID, C.ObjectGroupID, C.LocationID, C.DisplayName, C.IsActive,
             G.ObjectGroupName, G.BranchID, G.LocationID AS GroupLocationID, G.isCustomer
      FROM (VALUES (1)) Seed(Value)
      LEFT JOIN @Config C ON 1 = 1
      LEFT JOIN dbo.CF_ObjectGroupTbl G ON G.ObjectGroupID = 'DEMO_KH';`)).recordset[0];

    const groupRows = (await pool.request()
      .input('User', sql.VarChar(50), 'demo')
      .execute('dbo.API_ObjectGroupByUser_AI')).recordset || [];
    const employeeRows = (await pool.request()
      .input('User', sql.VarChar(50), 'demo')
      .execute('dbo.API_EmployeeByManager_AI')).recordset || [];
    const provinceRows = (await pool.request()
      .input('User', sql.VarChar(50), 'demo')
      .execute('dbo.API_TinhThanhByUser_AI')).recordset || [];

    const checks = {
      migration: Boolean(persisted.ConfigTableObjectID)
        && persisted.Username === 'demo'
        && persisted.EmployeeID === 'DEMO'
        && persisted.ObjectGroupID === 'DEMO_KH'
        && persisted.LocationID === 'Hà Nội'
        && Number(persisted.IsActive) === 1
        && persisted.BranchID === 'MB'
        && persisted.GroupLocationID === 'Hà Nội'
        && Number(persisted.isCustomer) === 1,
      objectGroupProcedure: hasAll(definition.API_ObjectGroupByUser_AI, [
        'AI_CustomerSelfAssignConfig', 'IsSelfAssign', 'C.IsActive = 1',
      ]) && groupRows.length === 1
        && groupRows[0].ObjectGroupID === 'DEMO_KH'
        && Number(groupRows[0].IsSelfAssign) === 1,
      employeeProcedure: hasAll(definition.API_EmployeeByManager_AI, [
        'AI_CustomerSelfAssignConfig', 'IsSelfAssign', 'C.IsActive = 1',
      ]) && employeeRows.length === 1
        && employeeRows[0].EmployeeID === 'DEMO'
        && employeeRows[0].ObjectGroupID === 'DEMO_KH'
        && Number(employeeRows[0].IsSelfAssign) === 1,
      provinceFunctionAndProcedure: hasAll(definition.AI_GetTinhThanhByUserFnc, [
        'AI_CustomerSelfAssignConfig', 'SelfAssignLocationID', 'S.IsSelfAssign = 0',
      ]) && Boolean(definition.API_TinhThanhByUser_AI)
        && provinceRows.length === 1
        && provinceRows[0].LocationID === 'Hà Nội',
      customerInsertProcedure: hasAll(definition.API_KhachHang_Insert_AI, [
        'AI_CustomerSelfAssignConfig', '@SelfAssignEmployeeID',
        '@IsSelfAssign = 0 AND @AssignedEmployeeID',
      ]),
    };

    process.stdout.write(`${JSON.stringify({
      database,
      mode: 'READ_ONLY',
      checks,
      deployRequired: Object.values(checks).some((value) => !value),
      runtime: {
        config: persisted,
        objectGroups: groupRows,
        employees: employeeRows,
        provinces: provinceRows,
      },
      persistedChanges: false,
    }, null, 2)}\n`);
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'FAIL', persistedChanges: false, error: error.message }, null, 2));
  process.exitCode = 1;
});
