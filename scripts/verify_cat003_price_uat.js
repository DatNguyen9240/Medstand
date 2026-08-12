'use strict';

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');

function readEnv(relativePath) {
  const values = {};
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) return values;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

async function main() {
  const env = { ...readEnv('.env'), ...readEnv('.env.uat.local'), ...process.env };
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 45000,
  });
  if ((await pool.request().query('SELECT DB_NAME() AS DatabaseName;')).recordset[0].DatabaseName !== 'medtest') {
    throw new Error('CAT-003 UAT chỉ được chạy trên medtest.');
  }

  const candidate = (await pool.request().query(`
    SELECT TOP (1) U.UserName,F.ObjectID,I.ItemID,I.ItemName,P.UnitPrice
    FROM dbo.SY_User U
    CROSS APPLY dbo.AR_GetObjectByUserFnc(U.UserName) F
    CROSS JOIN dbo.CF_ItemTbl I
    CROSS APPLY dbo.AR_LayGiaSanPhamFnc(CAST(GETDATE() AS DATE),F.ObjectID,I.ItemID) P
    WHERE U.UserName='QLBH013.MED'
      AND COALESCE(U.Disable,0)=0
      AND COALESCE(I.isDisable,0)=0
      AND P.UnitPrice>0
    ORDER BY F.ObjectID,I.ItemID;
  `)).recordset[0];
  if (!candidate) throw new Error('Không tìm thấy mẫu giá hợp lệ cho CAT-003.');

  const api = await pool.request()
    .input('Username', sql.VarChar(50), candidate.UserName)
    .input('ObjectID', sql.VarChar(50), candidate.ObjectID)
    .input('ItemID', sql.VarChar(50), candidate.ItemID)
    .execute('dbo.API_GiaSanPhamTheoKhachHang_AI');
  const direct = await pool.request()
    .input('ObjectID', sql.VarChar(50), candidate.ObjectID)
    .input('ItemID', sql.VarChar(50), candidate.ItemID)
    .query('SELECT TOP (1) UnitPrice,DiscountAmount,DiemSanPham,GhiChu FROM dbo.AR_LayGiaSanPhamFnc(CAST(GETDATE() AS DATE),@ObjectID,@ItemID);');
  const outOfScope = await pool.request()
    .input('Username', sql.VarChar(50), candidate.UserName)
    .input('ObjectID', sql.VarChar(50), 'CAT003.OUT.OF.SCOPE')
    .input('ItemID', sql.VarChar(50), candidate.ItemID)
    .execute('dbo.API_GiaSanPhamTheoKhachHang_AI');

  const apiRow = api.recordset[0];
  const directRow = direct.recordset[0];
  const samePrice = Math.abs(Number(apiRow.UnitPrice) - Number(directRow.UnitPrice)) <= 0.01;
  const pass = samePrice
    && apiRow.PriceSource === 'AR_LayGiaSanPhamFnc'
    && apiRow.PriceStatus === 'ACTIVE_PRICE'
    && apiRow.IsOrderableByPrice === true
    && outOfScope.recordset[0]?.Severity === 'OUT_OF_SCOPE';
  await pool.close();
  console.log(JSON.stringify({
    task: 'CAT-003-PRICE-UAT',
    status: pass ? 'PASS' : 'FAIL',
    mutationExecuted: false,
    candidate,
    api: apiRow,
    direct: directRow,
    samePrice,
    outOfScope: outOfScope.recordset[0],
  }, null, 2));
  if (!pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'CAT-003-PRICE-UAT', status: 'ERROR', mutationExecuted: false, error: error.message }, null, 2));
  process.exitCode = 1;
});
