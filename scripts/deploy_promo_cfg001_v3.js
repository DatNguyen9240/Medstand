'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');
const FILES = [
  'sql/PROMO-001_Promotion_Schema_AI.sql',
  'sql/PROMO-002_Active_Promotion_By_User_AI.sql',
  'sql/PROMO-CFG-001_Promotion_Program_Admin_AI.sql',
  'sql/Module_Common_API_DonHangChiTiet_Insert_AI.sql',
  'sql/PROMO-CFG-002_Active_Promotion_By_Items_AI.sql',
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
  if (!process.argv.includes('--apply')) throw new Error('Thêm --apply để deploy thật.');
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

  const transaction = new sql.Transaction(pool);
  let began = false;
  try {
    const context = (await pool.request().query(
      'SELECT DB_NAME() AS DatabaseName, SUSER_SNAME() AS ExecutedBy;'
    )).recordset[0];
    if (String(context.DatabaseName).toLowerCase() !== 'medtest') {
      throw new Error(`PROMO-CFG-001 V3 chỉ deploy trên medtest; hiện tại ${context.DatabaseName}.`);
    }

    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;
    const deployed = [];
    for (const relativePath of FILES) {
      const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
      let batchCount = 0;
      for (const batch of batches(source)) {
        await new sql.Request(transaction).batch(batch);
        batchCount += 1;
      }
      deployed.push({
        File: relativePath,
        Batches: batchCount,
        Sha256: crypto.createHash('sha256').update(source).digest('hex'),
      });
    }

    const definitions = (await new sql.Request(transaction).query(`
      SELECT o.name, OBJECT_DEFINITION(o.object_id) AS Definition
      FROM sys.objects o
      WHERE o.name IN (
        'AI_ApprovedPromotionItemRuleVw', 'AI_ActivePromotionByUserFnc',
        'API_PromotionProgram_Upsert_AI', 'API_PromotionProgram_Approve_AI',
        'API_DonHangChiTiet_Insert_AI', 'API_PromotionActiveByItems_AI'
      );
    `)).recordset;
    if (definitions.length !== 6) throw new Error(`Thiếu object sau deploy: ${definitions.length}/6.`);
    const orderDefinition = definitions.find((row) => row.name === 'API_DonHangChiTiet_Insert_AI').Definition || '';
    const activeDefinition = definitions.find((row) => row.name === 'API_PromotionActiveByItems_AI').Definition || '';
    if (!orderDefinition.includes('PROMOTION_BENEFIT_V3')
      || !orderDefinition.includes('ROUND(Quantity * UnitPrice * DiscountPercent / 100.0, 0)')) {
      throw new Error('API_DonHangChiTiet_Insert_AI chưa mang đủ contract V3/rounding.');
    }
    if (!activeDefinition.includes('PROMOTION_BENEFIT_V3')) {
      throw new Error('API_PromotionActiveByItems_AI chưa công bố contract V3.');
    }
    const upsertParameters = (await new sql.Request(transaction).query(`
      SELECT p.name
      FROM sys.parameters p
      WHERE p.object_id=OBJECT_ID('dbo.API_PromotionProgram_Upsert_AI')
      ORDER BY p.parameter_id;
    `)).recordset.map((row) => row.name);
    const expectedUpsertParameters = [
      '@PromotionProgramID', '@PromotionCode', '@PromotionName', '@ProgramType', '@Description',
      '@EffectiveFrom', '@EffectiveTo', '@BranchScopeMode', '@JsonBranchIDs', '@UserGroupScopeMode',
      '@JsonUserGroupIDs', '@Priority', '@SourceDocument', '@JsonRules', '@Username', '@Apply',
    ];
    if (JSON.stringify(upsertParameters) !== JSON.stringify(expectedUpsertParameters)) {
      throw new Error('Chữ ký API_PromotionProgram_Upsert_AI lệch source/gateway: ' + JSON.stringify(upsertParameters));
    }

    await transaction.commit();
    began = false;
    console.log(JSON.stringify({
      Task: 'DEPLOY-PROMO-CFG-001-V3',
      Status: 'DEPLOYED',
      Database: context.DatabaseName,
      ExecutedBy: context.ExecutedBy,
      Deployed: deployed,
      VerifiedObjects: definitions.map((row) => row.name),
    }, null, 2));
  } finally {
    if (began) {
      try { await transaction.rollback(); } catch (_) {}
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'DEPLOY-PROMO-CFG-001-V3', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
