'use strict';

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');
const files = [
  'sql/PROMO-002_Active_Promotion_By_User_AI.sql',
  'sql/Module common - API_HangHoaList_AI.sql',
  'sql/Module 10 - API_TraCuuSanPham_AI.sql',
];

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

function batches(source) {
  return source.split(/^\s*GO\s*(?:--.*)?$/gim).map((part) => part.trim()).filter(Boolean);
}

async function main() {
  if (!process.argv.includes('--apply')) throw new Error('Thêm --apply sau khi preflight PASS.');
  const env = { ...readEnv('.env'), ...readEnv('.env.uat.local'), ...process.env };
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER, port: Number(env.TEST_DB_PORT || 1433), database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER, password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 15000, requestTimeout: 120000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 },
  });
  const databaseName = (await pool.request().query('SELECT DB_NAME() AS DatabaseName;')).recordset[0].DatabaseName;
  if (databaseName !== 'medtest') throw new Error(`PROMO-002 chỉ deploy trên medtest; hiện tại ${databaseName}.`);

  const transaction = new sql.Transaction(pool);
  let began = false;
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;
    const applied = [];
    for (const relativePath of files) {
      let count = 0;
      for (const batch of batches(fs.readFileSync(path.join(root, relativePath), 'utf8'))) {
        await new sql.Request(transaction).batch(batch);
        count += 1;
      }
      applied.push({ file: relativePath, batches: count });
    }
    const checks = (await new sql.Request(transaction).query(`
      SELECT OBJECT_ID(N'dbo.AI_ActivePromotionByUserFnc') AS FunctionID,
             OBJECT_ID(N'dbo.API_HangHoaList_AI') AS CatalogID,
             OBJECT_ID(N'dbo.API_TraCuuSanPham_AI') AS LookupID;
    `)).recordset[0];
    if (!checks.FunctionID || !checks.CatalogID || !checks.LookupID) throw new Error('Thiếu object PROMO-002 sau deploy.');
    await transaction.commit();
    began = false;
    console.log(JSON.stringify({ task: 'PROMO-002-DEPLOY', status: 'DEPLOYED', database: databaseName, applied }, null, 2));
  } finally {
    if (began) {
      try { await transaction.rollback(); } catch (_) {}
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'PROMO-002-DEPLOY', status: 'ERROR', error: error.message }, null, 2));
  process.exitCode = 1;
});
