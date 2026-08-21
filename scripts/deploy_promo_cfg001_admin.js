'use strict';

/* Deploys the 4 PROMO-CFG-001 admin procs (CRUD + duyệt CTBH) only.
   Chạy 1 vòng nghiệp vụ thật (tạo DRAFT test -> duyệt -> đọc qua
   AI_ActivePromotionByUserFnc) bên trong SAVE TRANSACTION riêng, luôn
   rollback — không để lại dữ liệu test dù --apply hay không. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');
const relativePath = 'sql/PROMO-CFG-001_Promotion_Program_Admin_AI.sql';

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
  if (!process.argv.includes('--apply')) throw new Error('Thêm --apply sau khi preflight tĩnh PASS.');
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

  const context = (await pool.request().query('SELECT DB_NAME() AS DatabaseName, SUSER_SNAME() AS ExecutedBy;')).recordset[0];
  if (context.DatabaseName !== 'medtest') throw new Error(`PROMO-CFG-001 chỉ deploy trên medtest; hiện tại ${context.DatabaseName}.`);
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
      SELECT name FROM sys.objects
      WHERE name IN ('API_PromotionProgram_List_AI','API_PromotionProgram_Detail_AI','API_PromotionProgram_Upsert_AI','API_PromotionProgram_Approve_AI');
    `)).recordset;
    if (objects.length !== 4) throw new Error(`Thiếu proc PROMO-CFG-001 sau deploy: ${objects.length}/4.`);

    // Tìm 1 tài khoản quản lý thật và 1 sản phẩm thật trong scope test để chạy thử vòng nghiệp vụ.
    const manager = (await new sql.Request(transaction).query(`
      SELECT TOP (1) UserName FROM dbo.SY_User
      WHERE COALESCE(Disable, 0) = 0 AND (COALESCE(Manager, 0) = 1 OR UPPER(COALESCE(UserGroupID, '')) IN ('QL', 'QLMN', 'ADMIN', 'SADM', 'BGD', 'GD'))
      ORDER BY UserName;
    `)).recordset[0];
    const item = (await new sql.Request(transaction).query(`
      SELECT TOP (1) ItemID FROM dbo.CF_ItemTbl WHERE COALESCE(isDisable, 0) = 0 ORDER BY ItemID;
    `)).recordset[0];
    if (!manager || !item) throw new Error('Không tìm thấy tài khoản quản lý hoặc sản phẩm test trong medtest để xác minh.');

    // Vòng nghiệp vụ thật: tạo DRAFT -> duyệt -> đọc qua AI_ActivePromotionByUserFnc.
    // Bọc trong SAVE TRANSACTION riêng, luôn rollback — không để lại dữ liệu test.
    await new sql.Request(transaction).query("SAVE TRANSACTION FunctionalTest;");
    let evidence = null;
    try {
      const testCode = 'PREFLIGHT_TEST_' + Date.now();
      const rules = JSON.stringify([{
        RuleOrder: 1, ItemID: item.ItemID, RuleType: 'AMOUNT_DISCOUNT',
        MinimumOrderAmount: 500000, DiscountPercent: 5,
      }]);
      const upsertResult = await new sql.Request(transaction)
        .input('PromotionCode', sql.VarChar(50), testCode)
        .input('PromotionName', sql.NVarChar(300), 'Preflight test CTBH')
        .input('ProgramType', sql.VarChar(20), 'EVENT')
        .input('EffectiveFrom', sql.DateTime2(0), new Date(Date.now() - 60 * 1000))
        .input('EffectiveTo', sql.DateTime2(0), new Date(Date.now() + 365 * 24 * 3600 * 1000))
        .input('SourceDocument', sql.NVarChar(500), 'preflight_promo_cfg001_admin.js')
        .input('JsonRules', sql.NVarChar(sql.MAX), rules)
        .input('Username', sql.VarChar(50), manager.UserName)
        .input('Apply', sql.Bit, 1)
        .execute('dbo.API_PromotionProgram_Upsert_AI');
      const created = upsertResult.recordset[0];
      if (!created || !created.PromotionProgramID) throw new Error('Upsert không trả về PromotionProgramID: ' + JSON.stringify(created));

      const approveResult = await new sql.Request(transaction)
        .input('PromotionProgramID', sql.BigInt, created.PromotionProgramID)
        .input('Action', sql.VarChar(20), 'APPROVE')
        .input('Username', sql.VarChar(50), manager.UserName)
        .input('Apply', sql.Bit, 1)
        .execute('dbo.API_PromotionProgram_Approve_AI');
      if (!approveResult.recordset[0] || approveResult.recordset[0].Status !== 'APPROVED') {
        throw new Error('Approve không chuyển đúng trạng thái APPROVED: ' + JSON.stringify(approveResult.recordset[0]));
      }

      const activeCheck = await new sql.Request(transaction)
        .input('Username', sql.VarChar(50), manager.UserName)
        .input('ItemID', sql.VarChar(50), item.ItemID)
        .input('AsOfUtc', sql.DateTime2(0), new Date())
        .query('SELECT * FROM dbo.AI_ActivePromotionByUserFnc(@Username, @ItemID, @AsOfUtc);');
      const found = activeCheck.recordset.find((r) => r.PromotionCode === testCode);
      if (!found) throw new Error('AI_ActivePromotionByUserFnc không thấy CTBH vừa duyệt.');

      evidence = {
        PromotionProgramID: created.PromotionProgramID,
        PromotionCode: testCode,
        ItemID: item.ItemID,
        ManagerUsed: manager.UserName,
        ApprovedStatus: approveResult.recordset[0].Status,
        VisibleInActiveFunction: true,
        PromotionBenefitText: found.PromotionBenefitText,
      };
    } finally {
      await new sql.Request(transaction).query("ROLLBACK TRANSACTION FunctionalTest;");
    }

    await transaction.commit();
    began = false;
    console.log(JSON.stringify({
      Task: 'PROMO-CFG-001-DEPLOY', Status: 'PASS', Database: context.DatabaseName,
      ExecutedBy: context.ExecutedBy, BatchCount: batchCount, ObjectsDeployed: objects.map((o) => o.name),
      FunctionalTestEvidence: evidence, BusinessRowsUpdated: 0,
    }, null, 2));
  } finally {
    if (began) {
      try { await transaction.rollback(); } catch (_) { /* transaction can already be aborted */ }
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'PROMO-CFG-001-DEPLOY', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
