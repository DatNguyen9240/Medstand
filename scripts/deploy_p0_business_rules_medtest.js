'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sql = require('mssql');
const { testDbConfig } = require('./lib/test-db-config');

const root = path.resolve(__dirname, '..');
const backupDir = process.argv[2] ? path.resolve(process.argv[2]) : '';
const config = testDbConfig(root);
const procedures = [
  {
    name: 'API_GoiYDonHang_AI',
    file: 'sql/Module 1 - API_GoiYDonHang_AI.sql',
    required: ['ELSE CAST(NULL AS INT)', 'NEW_CUSTOMER|INSUFFICIENT_HISTORY', 'PERSONAL_PURCHASE_HISTORY'],
    forbidden: [/ELSE\s+30\b/i]
  },
  {
    name: 'API_ChamDiemKH_AI',
    file: 'sql/Module 3 - API_ChamDiemKH_AI.sql',
    required: ['FREQUENCY_MONETARY_PERCENTILE_DRAFT', '@TierWeightTotal'],
    forbidden: [/@W_Recency\s*\*\s*R_Score/i, /@W_Consumption\s*\*\s*C_Score/i]
  },
  {
    name: 'API_CongNoChiTiet_AI',
    file: 'sql/Module common - API_CongNoChiTiet_AI.sql',
    required: ['PARTIALLY_PAID', 'CollectionStatus', 'TrangThaiThanhToan'],
    forbidden: []
  }
];

const sha256 = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex').toUpperCase();
const createBatch = (source, name) => {
  const batches = source.replace(/^\uFEFF/, '').split(/^\s*GO\s*$/gim);
  const batch = batches.find((value) => new RegExp(`CREATE\\s+OR\\s+ALTER\\s+PROCEDURE\\s+(?:\\[dbo\\]\\.)?\\[?${name}\\]?`, 'i').test(value));
  if (!batch) throw new Error(`Cannot find CREATE OR ALTER batch for ${name}.`);
  return batch.trim();
};

async function main() {
  if (!/medtest/i.test(config.database)) throw new Error(`Refusing deployment outside medtest: ${config.database}`);
  if (!backupDir || !fs.existsSync(backupDir)) throw new Error('A pre-created backup directory is required.');

  const prepared = procedures.map((procedure) => {
    const source = fs.readFileSync(path.join(root, procedure.file), 'utf8');
    for (const marker of procedure.required) if (!source.includes(marker)) throw new Error(`${procedure.name} missing ${marker}.`);
    for (const pattern of procedure.forbidden) if (pattern.test(source)) throw new Error(`${procedure.name} contains forbidden source ${pattern}.`);
    return { ...procedure, batch: createBatch(source, procedure.name) };
  });

  const pool = await sql.connect(config);
  const transaction = new sql.Transaction(pool);
  let started = false;
  try {
    const before = {};
    for (const procedure of prepared) {
      const result = await pool.request().input('name', sql.NVarChar(128), `dbo.${procedure.name}`)
        .query('SELECT OBJECT_DEFINITION(OBJECT_ID(@name)) AS definition;');
      before[procedure.name] = result.recordset[0]?.definition || '';
    }
    fs.writeFileSync(path.join(backupDir, 'p0-procedures-before.json'), JSON.stringify({
      capturedAt: new Date().toISOString(),
      database: config.database,
      procedures: Object.fromEntries(Object.entries(before).map(([name, definition]) => [name, { sha256: sha256(definition), definition }]))
    }, null, 2), 'utf8');

    await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
    started = true;
    for (const procedure of prepared) await new sql.Request(transaction).batch(procedure.batch);

    const deployed = [];
    for (const procedure of prepared) {
      const result = await new sql.Request(transaction).input('name', sql.NVarChar(128), `dbo.${procedure.name}`)
        .query('SELECT OBJECT_DEFINITION(OBJECT_ID(@name)) AS definition;');
      const definition = result.recordset[0]?.definition || '';
      for (const marker of procedure.required) if (!definition.includes(marker)) throw new Error(`Deployed ${procedure.name} missing ${marker}.`);
      for (const pattern of procedure.forbidden) if (pattern.test(definition)) throw new Error(`Deployed ${procedure.name} contains forbidden source ${pattern}.`);
      deployed.push({ name: procedure.name, beforeSha256: sha256(before[procedure.name]), afterSha256: sha256(definition) });
    }

    await transaction.commit();
    started = false;
    const result = { status: 'MEDTEST_P0_DEPLOY_PASS', deployedAt: new Date().toISOString(), database: config.database, backupDir, procedures: deployed };
    fs.writeFileSync(path.join(backupDir, 'deploy-result.json'), JSON.stringify(result, null, 2), 'utf8');
    console.log(JSON.stringify(result, null, 2));
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
