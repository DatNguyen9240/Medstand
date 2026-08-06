'use strict';

// Read-only smoke test for the two-stage order product lookup.
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
    if (database !== 'medtest') throw new Error(`Chỉ được chạy smoke test trên medtest; hiện tại là ${database}`);

    let startedAt = Date.now();
    const catalog = await pool.request()
      .input('Type', sql.NVarChar(50), 'sanpham')
      .input('timkiem', sql.NVarChar(200), 'Aqua')
      .input('Username', sql.VarChar(50), 'QLBH013.MED')
      .execute('dbo.API_DanhMuc_Core_AI');
    const catalogMs = Date.now() - startedAt;

    startedAt = Date.now();
    const detail = await pool.request()
      .input('Username', sql.VarChar(50), 'QLBH013.MED')
      .input('ObjectID', sql.VarChar(50), 'DL011')
      .input('ItemID', sql.VarChar(50), 'A008')
      .input('SearchText', sql.NVarChar(100), '')
      .input('SeachText', sql.NVarChar(100), '')
      .input('DocumentDate', sql.DateTime, new Date('2026-08-05T00:00:00+07:00'))
      .execute('dbo.API_HangHoaList_AI');
    const detailMs = Date.now() - startedAt;

    const catalogRows = catalog.recordset || [];
    const detailRows = detail.recordset || [];
    const selected = detailRows.find((row) => String(row.ItemID || '').toUpperCase() === 'A008');
    const status = catalogRows.length > 0 && detailRows.length === 1 && selected ? 'PASS' : 'FAIL';
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      database,
      mode: 'READ_ONLY',
      status,
      catalog: {
        query: 'Aqua',
        rows: catalogRows.length,
        elapsedMs: catalogMs,
        sample: catalogRows.slice(0, 3).map((row) => ({ code: row.MaDanhMuc, name: row.Name })),
      },
      selectedItem: {
        itemId: 'A008',
        rows: detailRows.length,
        elapsedMs: detailMs,
        sample: detailRows.slice(0, 1).map((row) => ({
          itemId: row.ItemID,
          itemName: row.ItemName,
          unitPrice: row.UnitPrice,
          availableStock: row.QuantityinStock,
          storeHouseId: row.StoreHouseID,
        })),
      },
    }, null, 2));
    if (status !== 'PASS') process.exitCode = 1;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
