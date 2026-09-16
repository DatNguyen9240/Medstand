'use strict';

/* Deploy CORE-008 rule and procedures atomically to medtest. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const SQL_FILES = [
  'sql/Migrate_CORE008_Recommendation_Rule_V1_AI.sql',
  'sql/Module 1 - API_GoiYDonHang_AI.sql',
  'sql/Module 2 - API_TuyenBanHang_AI.sql',
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
  const env = { ...readEnv(), ...process.env };
  if (String(env.TEST_DB_DATABASE || '').toLowerCase() !== 'medtest') {
    throw new Error(`CORE-008 chỉ được deploy lên medtest; hiện tại là ${env.TEST_DB_DATABASE || '(empty)'}`);
  }

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
    const deployed = [];
    for (const relativePath of SQL_FILES) {
      let batchCount = 0;
      for (const batch of batches(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'))) {
        await new sql.Request(transaction).batch(batch);
        batchCount += 1;
      }
      deployed.push({ file: relativePath, batches: batchCount });
    }
    await transaction.commit();
    began = false;
    console.log(JSON.stringify({
      Task: 'CORE-008',
      Status: 'PASS',
      Mode: 'DEPLOY_COMMIT',
      Database: env.TEST_DB_DATABASE,
      Files: deployed,
    }, null, 2));
  } finally {
    if (began) {
      try { await transaction.rollback(); } catch (_) { /* transaction can already be aborted */ }
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'CORE-008', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
