'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');
const relativePath = 'sql/PROMO-001_Promotion_Schema_AI.sql';

function readEnv(relativeEnvPath) {
  const values = {};
  const filePath = path.join(root, relativeEnvPath);
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

  const context = (await pool.request().query('SELECT DB_NAME() AS DatabaseName,SUSER_SNAME() AS ExecutedBy;')).recordset[0];
  if (context.DatabaseName !== 'medtest') throw new Error(`PROMO-001 chỉ deploy trên medtest; hiện tại ${context.DatabaseName}.`);
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const transaction = new sql.Transaction(pool);
  let began = false;
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;
    let batchCount = 0;
    for (const batch of batches(source)) {
      await new sql.Request(transaction).batch(batch);
      batchCount += 1;
    }
    const objects = (await new sql.Request(transaction).query(`
      SELECT name,type_desc FROM sys.objects
      WHERE name IN ('AI_PromotionProgramTbl','AI_PromotionBranchScopeTbl','AI_PromotionUserGroupScopeTbl','AI_PromotionItemRuleTbl','AI_ApprovedPromotionItemRuleVw');
    `)).recordset;
    if (objects.length !== 5) throw new Error(`Thiếu object PROMO-001 sau deploy: ${objects.length}/5.`);
    await transaction.commit();
    began = false;
    console.log(JSON.stringify({
      task: 'PROMO-001-DEPLOY', status: 'DEPLOYED', database: context.DatabaseName,
      executedBy: context.ExecutedBy, batches: batchCount, objects,
      sha256: crypto.createHash('sha256').update(source).digest('hex'),
    }, null, 2));
  } finally {
    if (began) {
      try { await transaction.rollback(); } catch (_) {}
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'PROMO-001-DEPLOY', status: 'ERROR', error: error.message }, null, 2));
  process.exitCode = 1;
});
