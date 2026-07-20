'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sql = require('mssql');
const { testDbConfig } = require('./lib/test-db-config');

const root = path.resolve(__dirname, '..');
const config = testDbConfig(root);
const sourcePath = path.join(root, 'sql', 'Module 6 - API_DeXuatKhuyenMai_AI.sql');
const backupRoot = path.join(root, 'reports', 'runtime-backups');

const sha256 = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex').toUpperCase();
const procedureBatch = (source) => {
  const batches = source.replace(/^\uFEFF/, '').split(/^\s*GO\s*$/gim);
  const batch = batches.find((value) => /CREATE\s+OR\s+ALTER\s+PROCEDURE\s+\[dbo\]\.\[API_DeXuatKhuyenMai_AI\]/i.test(value));
  if (!batch) throw new Error('Cannot find API_DeXuatKhuyenMai_AI deployment batch.');
  return batch.trim();
};

async function main() {
  if (!/medtest/i.test(config.database)) throw new Error(`Refusing deployment outside medtest: ${config.database}`);

  const source = fs.readFileSync(sourcePath, 'utf8');
  for (const marker of [
    'MANAGER_REVIEW',
    'REFERENCE_ONLY_APPROVAL_REQUIRED',
    'IV_StockTransactionTbl',
    'CAST(NULL AS DECIMAL(5, 2)) AS PhanTramDeXuat'
  ]) {
    if (!source.includes(marker)) throw new Error(`Promotion source missing required marker: ${marker}`);
  }
  for (const forbidden of [/AR_AI_DiscountConfigTbl/i, /QuantityinStock/i]) {
    if (forbidden.test(source)) throw new Error(`Promotion source contains forbidden pattern: ${forbidden}`);
  }

  const pool = await sql.connect(config);
  const transaction = new sql.Transaction(pool);
  let started = false;
  try {
    const beforeResult = await pool.request().query("SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.API_DeXuatKhuyenMai_AI')) AS definition;");
    const before = beforeResult.recordset[0]?.definition || '';
    const backupName = `promotion-role-split-before-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.writeFileSync(path.join(backupRoot, backupName), JSON.stringify({
      capturedAt: new Date().toISOString(),
      database: config.database,
      procedure: 'dbo.API_DeXuatKhuyenMai_AI',
      sha256: sha256(before),
      definition: before
    }, null, 2), 'utf8');

    await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
    started = true;
    await new sql.Request(transaction).batch(procedureBatch(source));

    const afterResult = await new sql.Request(transaction)
      .query("SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.API_DeXuatKhuyenMai_AI')) AS definition;");
    const after = afterResult.recordset[0]?.definition || '';
    for (const marker of ['MANAGER_REVIEW', 'IV_StockTransactionTbl', 'PhanTramDeXuat']) {
      if (!after.includes(marker)) throw new Error(`Deployed procedure missing marker: ${marker}`);
    }

    await transaction.commit();
    started = false;
    console.log(JSON.stringify({
      status: 'MEDTEST_PROMOTION_ROLE_SPLIT_DEPLOY_PASS',
      database: config.database,
      backupFile: backupName,
      beforeSha256: sha256(before),
      afterSha256: sha256(after)
    }, null, 2));
  } catch (error) {
    if (started) await transaction.rollback();
    throw error;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
