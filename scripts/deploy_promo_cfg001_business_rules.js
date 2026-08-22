'use strict';

/* PROMO-CFG-001 (quyết định 22/08/2026): deploy 6 thay đổi nghiệp vụ mới lên medtest —
   xem docs/PROMO-CFG-001_QUYET_DINH_NGHIEP_VU_AP_DUNG_2026-08-22.md.
   Deploy tuần tự các file SQL liên quan (schema -> function -> admin procs -> return clawback
   -> order insert proc), rồi chạy 1 vòng nghiệp vụ thật trong SAVE TRANSACTION luôn rollback
   để không để lại dữ liệu test, giống hệt convention của deploy_promo_cfg001_admin.js. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');
const files = [
  'sql/PROMO-001_Promotion_Schema_AI.sql',
  'sql/PROMO-002_Active_Promotion_By_User_AI.sql',
  'sql/PROMO-CFG-001_Promotion_Program_Admin_AI.sql',
  'sql/PROMO-CFG-001_Return_Clawback_Fnc_AI.sql',
  'sql/Module common - API_DonHangChiTiet_Insert_AI.sql',
];

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
  if (context.DatabaseName !== 'medtest') throw new Error(`Chỉ deploy trên medtest; hiện tại ${context.DatabaseName}.`);

  const transaction = new sql.Transaction(pool);
  let began = false;
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;

    let batchCount = 0;
    for (const relativePath of files) {
      const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
      for (const batch of batches(source)) {
        await new sql.Request(transaction).batch(batch);
        batchCount += 1;
      }
    }

    const cols = (await new sql.Request(transaction).query(`
      SELECT name FROM sys.columns
      WHERE object_id = OBJECT_ID('dbo.AI_PromotionProgramTbl') AND name IN ('VatBasis','MaxTotalBenefitAmountPerOrder');
    `)).recordset;
    if (cols.length !== 2) throw new Error(`Thiếu cột mới trên AI_PromotionProgramTbl sau deploy: ${cols.length}/2 (${cols.map(c=>c.name).join(',')}).`);

    const objects = (await new sql.Request(transaction).query(`
      SELECT name, type_desc FROM sys.objects
      WHERE name IN ('API_PromotionProgram_List_AI','API_PromotionProgram_Detail_AI','API_PromotionProgram_Upsert_AI',
                      'API_PromotionProgram_Approve_AI','AI_ActivePromotionByUserFnc','AI_ApprovedPromotionItemRuleVw',
                      'AI_PromotionReturnClawbackFnc','API_DonHangChiTiet_Insert_AI');
    `)).recordset;
    if (objects.length !== 8) throw new Error(`Thiếu object sau deploy: ${objects.length}/8 (${objects.map(o=>o.name).join(',')}).`);

    // Vòng nghiệp vụ thật: tạo DRAFT có VatBasis/MaxTotalBenefitAmountPerOrder -> duyệt -> đọc
    // qua AI_ActivePromotionByUserFnc -> gọi AI_PromotionReturnClawbackFnc. Bọc trong SAVE
    // TRANSACTION riêng, luôn rollback — không để lại dữ liệu test.
    await new sql.Request(transaction).query("SAVE TRANSACTION FunctionalTest;");
    let evidence = null;
    try {
      const manager = (await new sql.Request(transaction).query(`
        SELECT TOP (1) UserName FROM dbo.SY_User
        WHERE COALESCE(Disable, 0) = 0 AND (COALESCE(Manager, 0) = 1 OR UPPER(COALESCE(UserGroupID, '')) IN ('QL', 'QLMN', 'ADMIN', 'SADM', 'BGD', 'GD'))
        ORDER BY UserName;
      `)).recordset[0];
      const item = (await new sql.Request(transaction).query(`
        SELECT TOP (1) ItemID FROM dbo.CF_ItemTbl WHERE COALESCE(isDisable, 0) = 0 ORDER BY ItemID;
      `)).recordset[0];
      if (!manager || !item) throw new Error('Không tìm thấy tài khoản quản lý hoặc sản phẩm test.');

      const testCode = 'DEPLOY_BR_TEST_' + Date.now();
      const rules = JSON.stringify([{
        RuleOrder: 1, ItemID: item.ItemID, RuleType: 'AMOUNT_DISCOUNT',
        MinimumOrderAmount: 500000, DiscountPercent: 5,
      }]);
      const upsertResult = await new sql.Request(transaction)
        .input('PromotionCode', sql.VarChar(50), testCode)
        .input('PromotionName', sql.NVarChar(300), 'Deploy business rules test')
        .input('ProgramType', sql.VarChar(20), 'EVENT')
        .input('EffectiveFrom', sql.DateTime2(0), new Date(Date.now() - 60 * 1000))
        .input('EffectiveTo', sql.DateTime2(0), new Date(Date.now() + 365 * 24 * 3600 * 1000))
        .input('SourceDocument', sql.NVarChar(500), 'deploy_promo_cfg001_business_rules.js')
        .input('JsonRules', sql.NVarChar(sql.MAX), rules)
        .input('Username', sql.VarChar(50), manager.UserName)
        .input('Apply', sql.Bit, 1)
        .input('VatBasis', sql.VarChar(40), 'INCLUSIVE_UNIT_PRICE_NO_GIFT_VAT')
        .input('MaxTotalBenefitAmountPerOrder', sql.Decimal(18, 2), 1000000)
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
      if (found.VatBasis !== 'INCLUSIVE_UNIT_PRICE_NO_GIFT_VAT') throw new Error('VatBasis không round-trip đúng: ' + found.VatBasis);
      if (Number(found.MaxTotalBenefitAmountPerOrder) !== 1000000) throw new Error('MaxTotalBenefitAmountPerOrder không round-trip đúng: ' + found.MaxTotalBenefitAmountPerOrder);

      const clawback = await new sql.Request(transaction)
        .input('OriginalPurchasedQuantity', sql.Decimal(18, 2), 50)
        .input('ReturnedQuantity', sql.Decimal(18, 2), 20)
        .input('RuleMinimumQuantity', sql.Decimal(18, 2), 10)
        .input('RuleGiftQuantity', sql.Decimal(18, 2), 2)
        .input('RuleMaximumQuantity', sql.Decimal(18, 2), 80)
        .query(`SELECT * FROM dbo.AI_PromotionReturnClawbackFnc(@OriginalPurchasedQuantity, @ReturnedQuantity, @RuleMinimumQuantity, @RuleGiftQuantity, @RuleMaximumQuantity);`);
      const cbRow = clawback.recordset[0];
      if (!cbRow || Number(cbRow.GiftAlreadyGiven) !== 10 || Number(cbRow.ClawbackQuantity) !== 4) {
        throw new Error('AI_PromotionReturnClawbackFnc kết quả sai: ' + JSON.stringify(cbRow));
      }

      evidence = {
        PromotionProgramID: created.PromotionProgramID,
        PromotionCode: testCode,
        ItemID: item.ItemID,
        ManagerUsed: manager.UserName,
        ApprovedStatus: approveResult.recordset[0].Status,
        VatBasisRoundTrip: found.VatBasis,
        MaxTotalBenefitAmountPerOrderRoundTrip: Number(found.MaxTotalBenefitAmountPerOrder),
        ReturnClawbackCheck: cbRow,
      };
    } finally {
      await new sql.Request(transaction).query("ROLLBACK TRANSACTION FunctionalTest;");
    }

    await transaction.commit();
    began = false;
    console.log(JSON.stringify({
      Task: 'PROMO-CFG-001-DEPLOY-BUSINESS-RULES', Status: 'PASS', Database: context.DatabaseName,
      ExecutedBy: context.ExecutedBy, BatchCount: batchCount, ObjectsVerified: objects.map((o) => o.name),
      NewColumns: cols.map((c) => c.name), FunctionalTestEvidence: evidence, BusinessRowsUpdated: 0,
    }, null, 2));
  } finally {
    if (began) {
      try { await transaction.rollback(); } catch (_) { /* transaction can already be aborted */ }
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'PROMO-CFG-001-DEPLOY-BUSINESS-RULES', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
