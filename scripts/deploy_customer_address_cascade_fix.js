'use strict';

/* Deploys procedure definitions only; never updates address/customer rows. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const FILES = [
  'sql/Module common - API_PhuongXa_AI.sql',
  'sql/Module common - API_KhachHang_Insert_AI.sql',
];

function readEnv() {
  const values = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function batches(source) {
  return source.replace(/^\uFEFF/, '').split(/^\s*GO\s*(?:--.*)?$/gim)
    .map((part) => part.trim()).filter(Boolean);
}

async function main() {
  const preflight = process.argv.includes('--preflight');
  const env = { ...readEnv(), ...process.env };
  if (String(env.TEST_DB_DATABASE || '').toLowerCase() !== 'medtest') throw new Error('Deploy is medtest-only.');

  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 240000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 },
  });
  const transaction = new sql.Transaction(pool);
  let began = false;
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;
    let batchCount = 0;
    for (const relative of FILES) {
      for (const batch of batches(fs.readFileSync(path.join(ROOT, relative), 'utf8'))) {
        await new sql.Request(transaction).batch(batch);
        batchCount += 1;
      }
    }

    const evidence = await new sql.Request(transaction).query(`
      IF DB_NAME() <> 'medtest' THROW 51540, 'Wrong database.', 1;
      DECLARE @HaiPhong TABLE (LocationID NVARCHAR(50), QuanHuyen NVARCHAR(100), XaPhuong NVARCHAR(250));
      INSERT @HaiPhong EXEC dbo.API_PhuongXa @User='QLBH013.MED', @LocationID=N'Hải Phòng', @QuanHuyen=N'', @SearchText=N'';
      DECLARE @HaNoi TABLE (LocationID NVARCHAR(50), QuanHuyen NVARCHAR(100), XaPhuong NVARCHAR(250));
      INSERT @HaNoi EXEC dbo.API_PhuongXa @User='QLBH013.MED', @LocationID=N'Hà Nội', @QuanHuyen=N'Hoàn Kiếm', @SearchText=N'';
      SELECT
        (SELECT COUNT(*) FROM @HaiPhong) AS HaiPhongWardCount,
        (SELECT COUNT(*) FROM @HaiPhong WHERE NULLIF(LTRIM(RTRIM(COALESCE(QuanHuyen, N''))), N'') IS NULL) AS HaiPhongTwoLevelCount,
        (SELECT COUNT(*) FROM @HaNoi) AS HaNoiHoanKiemWardCount,
        CASE WHEN OBJECT_DEFINITION(OBJECT_ID('dbo.API_KhachHang_Insert_AI')) LIKE '%INVALID_ADMIN_AREA%' THEN 1 ELSE 0 END AS CustomerTupleGuard;
    `);
    const row = evidence.recordset[0];
    if (row.HaiPhongWardCount <= 0 || row.HaiPhongWardCount !== row.HaiPhongTwoLevelCount
        || row.HaNoiHoanKiemWardCount <= 0 || row.CustomerTupleGuard !== 1) {
      throw new Error(`Unexpected evidence: ${JSON.stringify(row)}`);
    }

    if (preflight) await transaction.rollback();
    else await transaction.commit();
    began = false;
    console.log(JSON.stringify({
      Task: 'CUSTOMER-ADDRESS-CASCADE-FIX',
      Status: 'PASS',
      Mode: preflight ? 'PREFLIGHT_ROLLBACK' : 'DEPLOY_PROCEDURES_ONLY',
      BatchCount: batchCount,
      BusinessRowsUpdated: 0,
      Evidence: row,
    }, null, 2));
  } finally {
    if (began) {
      try { await transaction.rollback(); } catch (_) { /* transaction can already be aborted */ }
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'CUSTOMER-ADDRESS-CASCADE-FIX', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
