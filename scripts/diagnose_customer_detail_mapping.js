'use strict';

/* Read-only comparison: stored customer row vs API_KhachHangList response. */
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
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 60000,
  });
  try {
    const result = await pool.request().query(`
      IF DB_NAME() <> 'medtest' THROW 51550, 'Wrong database.', 1;
      DECLARE @ObjectID VARCHAR(50) = '4E7E28AF-70A8-4AB8-B594-6DC1E3104E2B';

      SELECT ObjectID, ObjectName, Address, Phone, TaxCode, Birthday,
             LoaiHopDong, PhanLoaiKhach, ThuTrongTuan,
             AccountNoHD, AccountNameHD, ChuTaiKhoan,
             BranchID, ObjectGroupID, LocationID, QuanHuyen, XaPhuong,
             SaleID, UserCreate, DateCreate
      FROM dbo.CF_ObjectTbl
      WHERE ObjectID = @ObjectID;

      EXEC dbo.API_KhachHangList
        @User='QLBH013.MED', @SearchText=N'', @ManagerID='', @EmployeeID='',
        @ObjectID=@ObjectID, @LoaiKhachHang=N'', @KenhBan='',
        @SYSManagerID='', @SYSEmployeeID='';

      SELECT C.name AS ColumnName
      FROM sys.columns C
      WHERE C.object_id = OBJECT_ID('dbo.vKhachHangList')
      ORDER BY C.column_id;

      SELECT TOP (1) ObjectGroupID, ObjectGroupName
      FROM dbo.CF_ObjectGroupTbl
      WHERE ObjectGroupID = 'NDB';

      SELECT P.parameter_id, P.name AS ParameterName, TYPE_NAME(P.user_type_id) AS DataType,
             P.max_length, P.has_default_value
      FROM sys.parameters P
      WHERE P.object_id = OBJECT_ID('dbo.API_KhachHang_Update')
      ORDER BY P.parameter_id;

      SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.API_KhachHang_Update')) AS ProcedureDefinition;
    `);
    console.log(JSON.stringify({
      Task: 'CUSTOMER-DETAIL-MAPPING-DIAGNOSIS',
      Status: 'PASS_READ_ONLY',
      StoredRow: result.recordsets[0][0] || null,
      ListApiRow: result.recordsets[1][0] || null,
      StoredColumns: result.recordsets[0][0] ? Object.keys(result.recordsets[0][0]) : [],
      ApiColumns: result.recordsets[1][0] ? Object.keys(result.recordsets[1][0]) : [],
      ViewColumns: result.recordsets[2],
      ObjectGroup: result.recordsets[3][0] || null,
      UpdateParameters: result.recordsets[4],
      UpdateProcedureDefinition: result.recordsets[5][0] && result.recordsets[5][0].ProcedureDefinition,
    }, null, 2));
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'CUSTOMER-DETAIL-MAPPING-DIAGNOSIS', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
