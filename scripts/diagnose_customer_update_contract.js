'use strict';

/* Read-only metadata required to replace API_KhachHang_Update safely. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
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
  if (String(env.TEST_DB_DATABASE || '').toLowerCase() !== 'medtest') throw new Error('Diagnosis is medtest-only.');
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER, port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE, user: env.TEST_DB_USER, password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000, requestTimeout: 60000,
  });
  try {
    const result = await pool.request().query(`
      IF DB_NAME() <> 'medtest' THROW 51560, 'Wrong database.', 1;
      SELECT OBJECT_NAME(C.object_id) AS TableName, C.column_id, C.name AS ColumnName,
             TYPE_NAME(C.user_type_id) AS DataType, C.max_length, C.is_nullable
      FROM sys.columns C
      WHERE C.object_id IN (
        OBJECT_ID('dbo.CF_ObjectTbl'), OBJECT_ID('dbo.AR_ObjectNewRequireTbl'),
        OBJECT_ID('dbo.CF_ObjectMapTbl'), OBJECT_ID('dbo.AR_ObjectNewRequireMapTbl'),
        OBJECT_ID('dbo.AI_API_MutationIdempotency'), OBJECT_ID('dbo.AI_AuditLog')
      )
      ORDER BY TableName, C.column_id;

      SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.AR_GetObjectByUserFnc')) AS ScopeDefinition;

      SELECT UserName, EmployeeID, ManagerID, BranchID, UserGroupID, Manager, Disable
      FROM dbo.SY_User WHERE UserName = 'QLBH013.MED';

      SELECT COUNT_BIG(*) AS OfficialVisible
      FROM dbo.AR_GetObjectByUserFnc('QLBH013.MED')
      WHERE ObjectID = '4E7E28AF-70A8-4AB8-B594-6DC1E3104E2B';
    `);
    console.log(JSON.stringify({
      Task: 'CUSTOMER-UPDATE-CONTRACT-DIAGNOSIS', Status: 'PASS_READ_ONLY',
      Columns: result.recordsets[0], ScopeDefinition: result.recordsets[1][0]?.ScopeDefinition,
      User: result.recordsets[2][0] || null,
      OfficialVisible: Number(result.recordsets[3][0]?.OfficialVisible || 0),
    }, null, 2));
  } finally { await pool.close(); }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'CUSTOMER-UPDATE-CONTRACT-DIAGNOSIS', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
