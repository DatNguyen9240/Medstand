'use strict';

/* Read-only performance diagnostics for the order product picker. */
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

async function timed(pool, name, query, inputs = []) {
  const request = pool.request();
  for (const [key, type, value] of inputs) request.input(key, type, value);
  const startedAt = Date.now();
  const result = await request.query(query);
  return {
    name,
    elapsedMs: Date.now() - startedAt,
    rows: result.recordset || [],
  };
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
    requestTimeout: 120000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 },
  });

  try {
    const commonInputs = [
      ['Username', sql.VarChar(50), 'QLBH013.MED'],
      ['ObjectID', sql.VarChar(50), 'DL011'],
      ['ItemID', sql.VarChar(50), 'A008'],
      ['AsOfUtc', sql.DateTime2(0), new Date()],
    ];
    const measurements = [];

    measurements.push(await timed(pool, 'WAREHOUSE_SCOPE', `
      SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
      SELECT COUNT_BIG(*) AS [RowCount]
      FROM dbo.AI_WarehouseByUserFnc(@Username, @AsOfUtc);`, commonInputs));

    measurements.push(await timed(pool, 'STOCK_ALL_ITEMS', `
      SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
      SELECT COUNT_BIG(*) AS [RowCount]
      FROM dbo.AI_StockAvailableByUserFnc(@Username, '', @AsOfUtc);`, commonInputs));

    measurements.push(await timed(pool, 'STOCK_ONE_ITEM', `
      SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
      SELECT COUNT_BIG(*) AS [RowCount]
      FROM dbo.AI_StockAvailableByUserFnc(@Username, @ItemID, @AsOfUtc);`, commonInputs));

    measurements.push(await timed(pool, 'PRICE_ONE_ITEM', `
      SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
      SELECT COUNT_BIG(*) AS [RowCount]
      FROM dbo.AR_LayGiaSanPhamFnc(CAST(GETDATE() AS DATE), @ObjectID, @ItemID);`, commonInputs));

    measurements.push(await timed(pool, 'DEPLOYED_PRODUCT_BROWSE', `
      SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
      EXEC dbo.API_HangHoaList_AI
           @Username = @Username,
           @ObjectID = @ObjectID,
           @ItemID = '',
           @SearchText = '';`, commonInputs));

    const indexes = await pool.request().query(`
      SELECT OBJECT_NAME(I.object_id) AS TableName,
             I.name AS IndexName,
             I.type_desc AS IndexType,
             STRING_AGG(C.name, ', ') WITHIN GROUP (ORDER BY IC.key_ordinal) AS KeyColumns
      FROM sys.indexes I
      JOIN sys.index_columns IC
        ON IC.object_id = I.object_id
       AND IC.index_id = I.index_id
       AND IC.is_included_column = 0
      JOIN sys.columns C
        ON C.object_id = IC.object_id
       AND C.column_id = IC.column_id
      WHERE OBJECT_NAME(I.object_id) IN ('IV_StockTransactionTbl', 'AR_OrderDetailTbl', 'CF_ItemTbl')
        AND I.is_hypothetical = 0
      GROUP BY I.object_id, I.name, I.type_desc
      ORDER BY TableName, IndexName;`);

    const priceFunction = await pool.request().query(`
      SELECT M.definition
      FROM sys.sql_modules M
      WHERE M.object_id = OBJECT_ID('dbo.AR_LayGiaSanPhamFnc');`);

    process.stdout.write(`${JSON.stringify({
      database: env.TEST_DB_DATABASE,
      mode: 'READ_ONLY',
      measurements: measurements.map((entry) => ({
        name: entry.name,
        elapsedMs: entry.elapsedMs,
        rowCount: entry.rows.length === 1 && entry.rows[0].RowCount !== undefined
          ? Number(entry.rows[0].RowCount)
          : entry.rows.length,
      })),
      indexes: indexes.recordset,
      priceFunctionDefinition: priceFunction.recordset[0]
        ? priceFunction.recordset[0].definition
        : null,
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
