'use strict';

/* Deploys the signed CORE-006 rule and CORE-007 procedure to medtest. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const SQL_FILES = [
  'sql/Migrate_CORE006_Tier_Rule_V2_AI.sql',
  'sql/Module 3 - API_ChamDiemKH_AI.sql',
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
  return source.split(/^\s*GO\s*(?:--.*)?$/gim).map((part) => part.trim()).filter(Boolean);
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

async function main() {
  if (!process.argv.includes('--apply')) {
    throw new Error('Refusing to mutate SQL without explicit --apply. Run preflight_core006_sql.js first.');
  }

  const env = { ...readEnv(), ...process.env };
  if (String(env.TEST_DB_DATABASE || '').toLowerCase() !== 'medtest') {
    throw new Error(`CORE-006 deploy chỉ được chạy trên medtest; hiện tại là ${env.TEST_DB_DATABASE || '(empty)'}`);
  }

  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 180000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 },
  });

  const transaction = new sql.Transaction(pool);
  let began = false;
  try {
    const context = (await pool.request().query(`
SELECT DB_NAME() AS DatabaseName, SUSER_SNAME() AS ExecutedBy, SYSUTCDATETIME() AS CheckedAtUtc;`)).recordset[0];
    if (context.DatabaseName !== 'medtest') throw new Error(`Wrong database: ${context.DatabaseName}`);

    const beforeDefinition = (await pool.request().query(`
SELECT OBJECT_DEFINITION(OBJECT_ID(N'dbo.API_ChamDiemKH_AI')) AS Definition;`)).recordset[0].Definition;

    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;
    const applied = [];
    for (const relativePath of SQL_FILES) {
      const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
      let count = 0;
      for (const batch of batches(source)) {
        count += 1;
        await new sql.Request(transaction).batch(batch);
      }
      applied.push({ file: relativePath, batches: count, sha256: hash(source) });
    }

    const configCheck = (await new sql.Request(transaction).query(`
SELECT
  COUNT(*) AS ApprovedConfigCount,
  MIN(EffectiveFrom) AS EffectiveFromUtc,
  MAX(ApprovedBy) AS ApprovedBy
FROM dbo.AI_BusinessRuleConfigTbl
WHERE RuleCode = 'BR-TIER-005'
  AND RuleVersion = '2.0.0'
  AND Status = 'APPROVED'
  AND EffectiveFrom <= SYSUTCDATETIME()
  AND (EffectiveTo IS NULL OR EffectiveTo > SYSUTCDATETIME());`)).recordset[0];
    if (Number(configCheck.ApprovedConfigCount) !== 21) {
      throw new Error(`Expected 21 approved config rows, got ${configCheck.ApprovedConfigCount}`);
    }

    const afterDefinition = (await new sql.Request(transaction).query(`
SELECT OBJECT_DEFINITION(OBJECT_ID(N'dbo.API_ChamDiemKH_AI')) AS Definition;`)).recordset[0].Definition;
    if (!afterDefinition || !afterDefinition.includes('AI_BusinessRuleConfigTbl') || afterDefinition.includes('PERCENTILE_CONT')) {
      throw new Error('Post-deploy procedure definition failed no-hardcode/config verification.');
    }

    await transaction.commit();
    began = false;
    console.log(JSON.stringify({
      Status: 'DEPLOYED',
      Database: context.DatabaseName,
      ExecutedBy: context.ExecutedBy,
      CheckedAtUtc: context.CheckedAtUtc,
      RuleCode: 'BR-TIER-005',
      RuleVersion: '2.0.0',
      ApprovedConfigCount: Number(configCheck.ApprovedConfigCount),
      EffectiveFromUtc: configCheck.EffectiveFromUtc,
      ApprovedBy: configCheck.ApprovedBy,
      ProcedureDefinitionBeforeSha256: hash(beforeDefinition),
      ProcedureDefinitionAfterSha256: hash(afterDefinition),
      Applied: applied,
    }, null, 2));
  } finally {
    if (began) {
      try { await transaction.rollback(); } catch (_) { /* transaction can already be aborted */ }
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Status: 'DEPLOY_FAILED', Error: error.message }, null, 2));
  process.exitCode = 1;
});
