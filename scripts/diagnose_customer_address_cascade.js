'use strict';

/* Read-only diagnosis for the create-customer administrative-area cascade. */
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
      IF DB_NAME() <> 'medtest' THROW 51530, 'Wrong database.', 1;

      SELECT TinhThanh,
             COUNT(*) AS WardRows,
             COUNT(DISTINCT QuanHuyen) AS DistrictsWithWards
      FROM dbo.CF_XaPhuongTbl
      WHERE TinhThanh IN (N'Hà Nội', N'Hải Phòng', N'Hưng Yên', N'Lai Châu', N'Ninh Bình')
      GROUP BY TinhThanh
      ORDER BY TinhThanh;

      SELECT TOP (30) TinhThanh, QuanHuyen, XaPhuong
      FROM dbo.CF_XaPhuongTbl
      WHERE TinhThanh = N'Hải Phòng'
         OR QuanHuyen LIKE N'%Thủy Nguyên%'
         OR QuanHuyen LIKE N'%Thuỷ Nguyên%'
      ORDER BY TinhThanh, QuanHuyen, XaPhuong;

      EXEC dbo.API_PhuongXa @User='QLBH013.MED', @LocationID=N'Hải Phòng', @QuanHuyen=N'Thủy Nguyên', @SearchText=N'';

      SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.API_QuanHuyen')) AS ApiQuanHuyenDefinition;

      SELECT OBJECT_NAME(C.object_id) AS TableName, C.name AS ColumnName, T.name AS DataType
      FROM sys.columns C
      INNER JOIN sys.types T ON T.user_type_id = C.user_type_id
      WHERE C.object_id IN
      (
        OBJECT_ID('dbo.CF_LocationDetailTbl'),
        OBJECT_ID('dbo.CF_LocationDetail2Tbl'),
        OBJECT_ID('dbo.CF_XaPhuongTbl')
      )
      ORDER BY TableName, C.column_id;

      EXEC dbo.API_QuanHuyen @User='QLBH013.MED', @LocationID=N'Hải Phòng', @QuanHuyen=N'', @SearchText=N'';

      SELECT LocationID,
             COUNT(*) AS WardRows,
             COUNT(DISTINCT QuanHuyen) AS DistrictsWithWards
      FROM dbo.CF_LocationDetail2Tbl
      WHERE LocationID IN (N'Hà Nội', N'Hải Phòng', N'Hưng Yên', N'Lai Châu', N'Ninh Bình')
      GROUP BY LocationID
      ORDER BY LocationID;

      SELECT LocationID, QuanHuyen, XaPhuong
      FROM dbo.CF_LocationDetail2Tbl
      WHERE LocationID = N'Hải Phòng'
        AND QuanHuyen IN (N'Thủy Nguyên', N'Thuỷ Nguyên')
      ORDER BY XaPhuong;

      SELECT LocationID, COALESCE(QuanHuyen, N'<NULL>') AS QuanHuyen, COUNT(*) AS WardRows
      FROM dbo.CF_LocationDetail2Tbl
      WHERE LocationID IN (N'Hải Phòng', N'Hưng Yên', N'Lai Châu', N'Ninh Bình')
      GROUP BY LocationID, QuanHuyen
      ORDER BY LocationID, QuanHuyen;

      SELECT LocationID,
             COUNT(*) AS CustomerRows,
             SUM(CASE WHEN NULLIF(LTRIM(RTRIM(COALESCE(QuanHuyen, N''))), N'') IS NULL THEN 1 ELSE 0 END) AS MissingDistrict,
             SUM(CASE WHEN NULLIF(LTRIM(RTRIM(COALESCE(XaPhuong, N''))), N'') IS NULL THEN 1 ELSE 0 END) AS MissingWard
      FROM dbo.CF_ObjectTbl
      WHERE LocationID IN (N'Hà Nội', N'Hải Phòng', N'Hưng Yên', N'Lai Châu', N'Ninh Bình')
      GROUP BY LocationID
      ORDER BY LocationID;

      SELECT TOP (30) ObjectID, ObjectName, LocationID, QuanHuyen, XaPhuong, DateCreate
      FROM dbo.CF_ObjectTbl
      WHERE LocationID = N'Hải Phòng'
      ORDER BY DateCreate DESC, ObjectID;
    `);
    console.log(JSON.stringify({
      Task: 'CUSTOMER-ADDRESS-CASCADE-DIAGNOSIS',
      Status: 'PASS_READ_ONLY',
      ProvinceCoverage: result.recordsets[0],
      HaiPhongSamples: result.recordsets[1],
      RuntimeResultForHaiPhongThuyNguyen: result.recordsets[2],
      ApiQuanHuyenDefinition: result.recordsets[3][0],
      AddressTableColumns: result.recordsets[4],
      RuntimeDistrictsForHaiPhong: result.recordsets[5],
      LegacyWardCoverage: result.recordsets[6],
      LegacyHaiPhongThuyNguyenWards: result.recordsets[7],
      LegacyNonHanoiDistrictValues: result.recordsets[8],
      ExistingCustomerAddressCoverage: result.recordsets[9],
      ExistingHaiPhongCustomers: result.recordsets[10],
    }, null, 2));
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'CUSTOMER-ADDRESS-CASCADE-DIAGNOSIS', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
