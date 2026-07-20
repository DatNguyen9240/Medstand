'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sql = require('mssql');
const { testDbConfig } = require('./lib/test-db-config');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'sql', 'Module 10 - API_TraCuuSanPham_AI.sql');
const backupDir = process.argv[2] ? path.resolve(process.argv[2]) : '';
const config = testDbConfig(root);

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').toUpperCase();
}

async function main() {
  if (!/medtest/i.test(config.database)) {
    throw new Error(`Refusing deployment outside medtest: ${config.database}`);
  }
  if (!backupDir || !fs.existsSync(backupDir)) {
    throw new Error('A pre-created backup directory is required.');
  }

  const source = fs.readFileSync(sourcePath, 'utf8')
    .replace(/^\uFEFF/, '')
    .replace(/^\s*GO\s*$/gim, '')
    .trim();
  if (!/^CREATE\s+OR\s+ALTER\s+PROCEDURE\s+(?:\[dbo\]\.)?\[?API_TraCuuSanPham_AI\]?/i.test(source)) {
    throw new Error('Refusing deployment: unexpected procedure source.');
  }
  for (const marker of ['AvailableStock', 'PHYSICAL_STOCK_NOT_QUERIED', 'REFERENCE_ONLY_MEDICAL_REVIEW_REQUIRED', 'MedicalDisclaimer']) {
    if (!source.includes(marker)) throw new Error(`Required fail-safe marker is missing: ${marker}`);
  }
  if (/SUM\s*\(\s*QuantityinStock\s*\)/i.test(source)) {
    throw new Error('Refusing deployment: symptom API still exposes aggregate physical stock.');
  }

  const pool = await sql.connect(config);
  const transaction = new sql.Transaction(pool);
  let transactionStarted = false;
  try {
    const beforeResult = await pool.request().query(
      "SELECT OBJECT_DEFINITION(OBJECT_ID(N'dbo.API_TraCuuSanPham_AI')) AS definition;",
    );
    const beforeDefinition = beforeResult.recordset[0]?.definition || '';
    fs.writeFileSync(path.join(backupDir, 'API_TraCuuSanPham_AI.before.json'), JSON.stringify({
      capturedAt: new Date().toISOString(),
      database: config.database,
      sha256: sha256(beforeDefinition),
      definition: beforeDefinition,
    }, null, 2), 'utf8');

    await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
    transactionStarted = true;
    await new sql.Request(transaction).batch(source);

    const verifyResult = await new sql.Request(transaction).query(`
      SELECT OBJECT_DEFINITION(OBJECT_ID(N'dbo.API_TraCuuSanPham_AI')) AS definition;
    `);
    const afterDefinition = verifyResult.recordset[0]?.definition || '';
    for (const marker of ['AvailableStock', 'PHYSICAL_STOCK_NOT_QUERIED', 'REFERENCE_ONLY_MEDICAL_REVIEW_REQUIRED', 'MedicalDisclaimer']) {
      if (!afterDefinition.includes(marker)) throw new Error(`Deployed definition is missing ${marker}.`);
    }
    if (/SUM\s*\(\s*QuantityinStock\s*\)/i.test(afterDefinition)) {
      throw new Error('Deployed definition still exposes aggregate physical stock.');
    }

    await transaction.commit();
    transactionStarted = false;
    console.log(JSON.stringify({
      status: 'MEDTEST_SYMPTOM_API_DEPLOY_PASS',
      database: config.database,
      procedure: 'dbo.API_TraCuuSanPham_AI',
      beforeSha256: sha256(beforeDefinition),
      afterSha256: sha256(afterDefinition),
      backupDir,
    }, null, 2));
  } catch (error) {
    if (transactionStarted) await transaction.rollback();
    throw error;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
