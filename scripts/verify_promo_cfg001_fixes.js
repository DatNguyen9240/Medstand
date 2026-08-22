'use strict';

/* Kiểm chứng có assertion thật (throw khi sai, exit code != 0) cho PROMOTION_BENEFIT_V3:
     1. QUANTITY_GIFT tính tỷ lệ (10+2 thì mua 5 tặng 1) giống nhau ở frontend và SQL.
     2. Vượt MaximumQuantity phải clamp quyền lợi, không loại rule cấu hình.
     3. MaximumQuantity của QUANTITY_DISCOUNT là cận trên hợp lệ; vượt max không giảm giá và không fallback.
     4. Hai rule trùng Priority + mốc phải tie-break ổn định bằng PromotionItemRuleID.
     5. Quà tặng khác SKU tiếp tục bị Upsert từ chối ngay khi lưu.
   Tất cả chạy trong 1 transaction luôn rollback ở cuối — không để lại dữ liệu test. */
const fs = require('fs');
const sql = require('mssql');
const promotion = require('../src/js/utils/promotion.js');

const CONTRACT_VERSION = 'PROMOTION_BENEFIT_V3';

function readEnv() {
  const values = {};
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) values[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function assert(condition, message) {
  if (!condition) throw new Error('ASSERTION_FAILED: ' + message);
}

async function upsertProgram(tx, { manager, promotionCode, rules }) {
  return new sql.Request(tx)
    .input('PromotionCode', sql.VarChar(50), promotionCode)
    .input('PromotionName', sql.NVarChar(300), promotionCode)
    .input('ProgramType', sql.VarChar(20), 'EVENT')
    .input('EffectiveFrom', sql.DateTime2(0), new Date(Date.now() - 60000))
    .input('EffectiveTo', sql.DateTime2(0), new Date(Date.now() + 3600000))
    .input('SourceDocument', sql.NVarChar(500), 'verify_promo_cfg001_fixes.js')
    .input('JsonRules', sql.NVarChar(sql.MAX), JSON.stringify(rules))
    .input('Username', sql.VarChar(50), manager)
    .input('Apply', sql.Bit, 1)
    .execute('dbo.API_PromotionProgram_Upsert_AI');
}

async function approveProgram(tx, { manager, promotionProgramID }) {
  return new sql.Request(tx)
    .input('PromotionProgramID', sql.BigInt, promotionProgramID)
    .input('Action', sql.VarChar(20), 'APPROVE')
    .input('Username', sql.VarChar(50), manager)
    .input('Apply', sql.Bit, 1)
    .execute('dbo.API_PromotionProgram_Approve_AI');
}

async function runOrderConfigCandidate(tx, { manager, item, quantity, unitPrice }) {
  const escUser = manager.replace(/'/g, "''");
  await new sql.Request(tx).batch(`
    IF OBJECT_ID('tempdb..#Items') IS NOT NULL DROP TABLE #Items;
    CREATE TABLE #Items (
        ItemID VARCHAR(50) NOT NULL PRIMARY KEY,
        Quantity DECIMAL(18,2) NOT NULL,
        SoLuongTang DECIMAL(18,2) NOT NULL,
        UnitPrice DECIMAL(18,4) NOT NULL,
        DiscountPercent DECIMAL(18,2) NOT NULL,
        ExpectedGiftQuantity DECIMAL(18,2) NOT NULL DEFAULT 0,
        ExpectedDiscountPercent DECIMAL(18,2) NOT NULL DEFAULT 0,
        HasConfigRule BIT NOT NULL DEFAULT 0
    );
    INSERT #Items (ItemID, Quantity, SoLuongTang, UnitPrice, DiscountPercent)
    VALUES ('${item}', ${quantity}, 0, ${unitPrice}, 0);

    DECLARE @Username VARCHAR(50) = '${escUser}';
    DECLARE @StockAsOfUtc DATETIME2(0) = SYSUTCDATETIME();
    UPDATE T
    SET T.HasConfigRule = 1
    FROM #Items T
    WHERE EXISTS (
      SELECT 1 FROM dbo.AI_ActivePromotionByUserFnc(@Username, T.ItemID, @StockAsOfUtc) F
      WHERE F.RuleType IN ('QUANTITY_DISCOUNT','QUANTITY_GIFT','AMOUNT_DISCOUNT','AMOUNT_GIFT','INFORMATION')
    );
    ;WITH ConfigCandidate AS (
        SELECT
            T.ItemID, F.RuleType, F.MinimumQuantity, F.MaximumQuantity, F.MinimumOrderAmount,
            F.DiscountPercent, F.GiftQuantity, F.Priority, F.PromotionItemRuleID,
            ROW_NUMBER() OVER (
                PARTITION BY T.ItemID
                ORDER BY F.Priority ASC, COALESCE(F.MinimumOrderAmount, F.MinimumQuantity) DESC, F.PromotionItemRuleID ASC
            ) AS TierRank
        FROM #Items T
        CROSS APPLY dbo.AI_ActivePromotionByUserFnc(@Username, T.ItemID, @StockAsOfUtc) F
        WHERE (
                F.RuleType = 'QUANTITY_DISCOUNT' AND F.MinimumQuantity IS NOT NULL
                AND T.Quantity >= F.MinimumQuantity
                AND (F.MaximumQuantity IS NULL OR T.Quantity <= F.MaximumQuantity)
              )
           OR (
                F.RuleType = 'QUANTITY_GIFT'
                AND F.MinimumQuantity > 0
                AND COALESCE(F.GiftQuantity, 0) > 0
                AND FLOOR(
                    (CASE WHEN F.MaximumQuantity IS NOT NULL AND T.Quantity > F.MaximumQuantity
                          THEN F.MaximumQuantity ELSE T.Quantity END)
                    * COALESCE(F.GiftQuantity, 0) / NULLIF(F.MinimumQuantity, 0)
                ) >= 1
              )
           OR (
                F.RuleType IN ('AMOUNT_DISCOUNT','AMOUNT_GIFT') AND F.MinimumOrderAmount IS NOT NULL
                AND (T.Quantity * T.UnitPrice) >= F.MinimumOrderAmount
                AND (F.MaximumOrderAmount IS NULL OR (T.Quantity * T.UnitPrice) <= F.MaximumOrderAmount)
              )
    )
    UPDATE T
    SET T.ExpectedGiftQuantity = CASE
            WHEN C.RuleType = 'QUANTITY_GIFT' THEN FLOOR(
                (CASE WHEN C.MaximumQuantity IS NOT NULL AND T.Quantity > C.MaximumQuantity
                      THEN C.MaximumQuantity ELSE T.Quantity END)
                * COALESCE(C.GiftQuantity, 0) / NULLIF(C.MinimumQuantity, 0)
            )
            WHEN C.RuleType = 'AMOUNT_GIFT' THEN COALESCE(C.GiftQuantity, 0)
            ELSE 0 END,
        T.ExpectedDiscountPercent = CASE
            WHEN C.RuleType IN ('QUANTITY_DISCOUNT','AMOUNT_DISCOUNT') THEN COALESCE(C.DiscountPercent, 0)
            ELSE 0 END,
        T.HasConfigRule = 1,
        T.SoLuongTang = COALESCE(C.PromotionItemRuleID, -1) -- dùng cột này để soi ID rule thắng trong test
    FROM #Items T JOIN ConfigCandidate C ON C.ItemID = T.ItemID AND C.TierRank = 1;
  `);
  const r = await new sql.Request(tx).query('SELECT * FROM #Items;');
  return r.recordset[0];
}

async function main() {
  const env = readEnv();
  if (String(env.TEST_DB_DATABASE || '').toLowerCase() !== 'medtest') throw new Error('medtest only');
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 60000,
  });

  const tx = new sql.Transaction(pool);
  await tx.begin();
  const results = [];
  try {
    const manager = (await new sql.Request(tx).query(`
      SELECT TOP (1) UserName FROM dbo.SY_User
      WHERE COALESCE(Disable,0)=0 AND (COALESCE(Manager,0)=1 OR UPPER(COALESCE(UserGroupID,'')) IN ('QL','QLMN','ADMIN','SADM','BGD','GD'))
      ORDER BY UserName;
    `)).recordset[0].UserName;
    const items = (await new sql.Request(tx).query(`SELECT TOP (2) ItemID FROM dbo.CF_ItemTbl WHERE COALESCE(isDisable,0)=0 ORDER BY ItemID;`)).recordset;
    const [itemA, itemB] = items.map((r) => r.ItemID);

    // ── Test 1: frontend helper tính tỷ lệ 10+2 và clamp max ──────────────
    assert(promotion.CONTRACT_VERSION === CONTRACT_VERSION,
      'Frontend helper phải công bố đúng contract ' + CONTRACT_VERSION);
    const helperRule = [{
      PromotionBenefitContractVersion: CONTRACT_VERSION,
      PromotionItemRuleID: 1,
      Priority: 100,
      RuleType: 'QUANTITY_GIFT',
      MinimumQuantity: 10,
      GiftQuantity: 2,
      GiftItemID: itemA,
    }];
    const proportionalCases = [[4, 0], [5, 1], [9, 1], [10, 2], [15, 3], [20, 4]];
    for (const [quantity, expectedGift] of proportionalCases) {
      const result = promotion.calculateFromConfigRules(helperRule, quantity, 1000);
      const actualGift = result ? result.giftQuantity : 0;
      assert(actualGift === expectedGift,
        `Frontend 10+2 với SL=${quantity} phải tặng ${expectedGift}, thực tế ${actualGift}`);
    }
    const helperCappedRule = [{ ...helperRule[0], GiftQuantity: 1, MaximumQuantity: 80 }];
    assert(promotion.calculateFromConfigRules(helperCappedRule, 80, 1000).giftQuantity === 8,
      'Frontend tại max 80 phải tặng 8');
    assert(promotion.calculateFromConfigRules(helperCappedRule, 100, 1000).giftQuantity === 8,
      'Frontend vượt max 100 phải clamp tại 80 và vẫn chỉ tặng 8');
    const unknownVersionRule = [{ ...helperRule[0], PromotionBenefitContractVersion: 'PROMOTION_BENEFIT_V999' }];
    const unknownResult = promotion.calculateFromConfigRules(unknownVersionRule, 10, 1000);
    assert(unknownResult && unknownResult.blocked === true && unknownResult.errorCode === 'UNSUPPORTED_PROMOTION_CONTRACT',
      'Frontend phải fail-closed contract version lạ, không fallback note-text');
    assert(promotion.calculateFromConfigRules([], 10, 1000) === null,
      'Chỉ khi hoàn toàn không có config rule mới được fallback note-text');
    const zeroBenefit = promotion.calculateFromConfigRules(helperRule, 4, 1000);
    assert(zeroBenefit && zeroBenefit.configAuthoritative === true && zeroBenefit.giftQuantity === 0,
      'Config có thật nhưng quyền lợi bằng 0 phải authoritative, không fallback note-text');
    const amountDiscount = promotion.calculateFromConfigRules([{
      PromotionBenefitContractVersion: CONTRACT_VERSION,
      PromotionItemRuleID: 2,
      Priority: 100,
      RuleType: 'AMOUNT_DISCOUNT',
      MinimumOrderAmount: 1000,
      MaximumOrderAmount: 1500,
      DiscountPercent: 10,
    }], 10, 100);
    assert(amountDiscount.discountPercent === 10,
      'AMOUNT_DISCOUNT phải xét giá trị dòng trước VAT/chiết khấu');
    const rounded = promotion.calculateLineAmounts(1, 999, 2.5);
    assert(rounded.grossAmount === 999 && rounded.discountAmount === 25 && rounded.totalAmount === 974,
      'Tiền giảm phải làm tròn 1 đồng đồng nhất: 999 x 2.5% => 25, total 974');
    results.push(['FRONTEND_RATIO_AND_MAX_CLAMP', true, '4/5/9/10/15/20 + 80/100']);

    // ── Test 2: SQL candidate tính tỷ lệ 10+2 ─────────────────────────────
    const codeRatio = 'VERIFY_RATIO_' + Date.now();
    const upRatio = await upsertProgram(tx, {
      manager, promotionCode: codeRatio,
      rules: [{ RuleOrder: 1, ItemID: itemA, RuleType: 'QUANTITY_GIFT', MinimumQuantity: 10, GiftQuantity: 2, GiftItemID: itemA }],
    });
    await approveProgram(tx, { manager, promotionProgramID: upRatio.recordset[0].PromotionProgramID });
    for (const [quantity, expectedGift] of proportionalCases) {
      const result = await runOrderConfigCandidate(tx, { manager, item: itemA, quantity, unitPrice: 1000 });
      assert(Number(result.ExpectedGiftQuantity) === expectedGift,
        `SQL 10+2 với SL=${quantity} phải tặng ${expectedGift}, thực tế: ${JSON.stringify(result)}`);
      assert(result.HasConfigRule === true,
        `SQL phải coi config là authoritative kể cả quà bằng 0, SL=${quantity}: ${JSON.stringify(result)}`);
    }
    await new sql.Request(tx)
      .input('id', sql.BigInt, upRatio.recordset[0].PromotionProgramID)
      .query("UPDATE dbo.AI_PromotionProgramTbl SET Status='WITHDRAWN' WHERE PromotionProgramID=@id;");
    results.push(['SQL_PROPORTIONAL_GIFT_10_PLUS_2', true]);

    // ── Test 3: vượt MaximumQuantity phải clamp, không loại rule ──────────
    const codeCap = 'VERIFY_CAP_' + Date.now();
    const upCap = await upsertProgram(tx, {
      manager, promotionCode: codeCap,
      rules: [{ RuleOrder: 1, ItemID: itemA, RuleType: 'QUANTITY_GIFT', MinimumQuantity: 10, MaximumQuantity: 80, GiftQuantity: 1, GiftItemID: itemA }],
    });
    await approveProgram(tx, { manager, promotionProgramID: upCap.recordset[0].PromotionProgramID });
    const atMax = await runOrderConfigCandidate(tx, { manager, item: itemA, quantity: 80, unitPrice: 1000 });
    const overMax = await runOrderConfigCandidate(tx, { manager, item: itemA, quantity: 100, unitPrice: 1000 });
    assert(atMax.HasConfigRule === true && Number(atMax.ExpectedGiftQuantity) === 8,
      'SQL tại MaximumQuantity=80 phải áp rule và tặng 8: ' + JSON.stringify(atMax));
    assert(overMax.HasConfigRule === true && Number(overMax.ExpectedGiftQuantity) === 8,
      'SQL SL=100 phải giữ config rule, clamp tại 80 và tặng 8: ' + JSON.stringify(overMax));
    await new sql.Request(tx)
      .input('id', sql.BigInt, upCap.recordset[0].PromotionProgramID)
      .query("UPDATE dbo.AI_PromotionProgramTbl SET Status='WITHDRAWN' WHERE PromotionProgramID=@id;");
    results.push(['SQL_MAXIMUM_QUANTITY_CLAMPED', true, '80=>8; 100=>8']);

    // ── Test 4: semantics max của QUANTITY_DISCOUNT giữ nguyên ────────────
    const code1 = 'VERIFY_DISCOUNT_MAX_' + Date.now();
    const up1 = await upsertProgram(tx, {
      manager, promotionCode: code1,
      rules: [{ RuleOrder: 1, ItemID: itemA, RuleType: 'QUANTITY_DISCOUNT', MinimumQuantity: 5, MaximumQuantity: 10, DiscountPercent: 7 }],
    });
    await approveProgram(tx, { manager, promotionProgramID: up1.recordset[0].PromotionProgramID });

    const withinBound = await runOrderConfigCandidate(tx, { manager, item: itemA, quantity: 7, unitPrice: 1000 });
    assert(withinBound.HasConfigRule === true && Math.abs(withinBound.ExpectedDiscountPercent - 7) < 0.001,
      'SL=7 (trong khoảng 5-10) phải được áp 7%, thực tế: ' + JSON.stringify(withinBound));

    const discountOverMax = await runOrderConfigCandidate(tx, { manager, item: itemA, quantity: 12, unitPrice: 1000 });
    assert(discountOverMax.HasConfigRule === true && Number(discountOverMax.ExpectedDiscountPercent) === 0,
      'SL=12 vượt Maximum=10 không được giảm giá nhưng config vẫn authoritative: ' + JSON.stringify(discountOverMax));
    results.push(['DISCOUNT_MAX_IS_ELIGIBILITY_BOUND', true]);

    await new sql.Request(tx)
      .input('id', sql.BigInt, up1.recordset[0].PromotionProgramID)
      .query("UPDATE dbo.AI_PromotionProgramTbl SET Status='WITHDRAWN' WHERE PromotionProgramID=@id;");

    // Rule theo giá trị dùng gross line trước VAT/chiết khấu.
    const codeAmount = 'VERIFY_AMOUNT_' + Date.now();
    const upAmount = await upsertProgram(tx, {
      manager, promotionCode: codeAmount,
      rules: [{
        RuleOrder: 1, ItemID: itemA, RuleType: 'AMOUNT_DISCOUNT',
        MinimumOrderAmount: 1000, MaximumOrderAmount: 1500, DiscountPercent: 10,
      }],
    });
    await approveProgram(tx, { manager, promotionProgramID: upAmount.recordset[0].PromotionProgramID });
    const amountAtMin = await runOrderConfigCandidate(tx, { manager, item: itemA, quantity: 10, unitPrice: 100 });
    const amountOverMax = await runOrderConfigCandidate(tx, { manager, item: itemA, quantity: 16, unitPrice: 100 });
    assert(amountAtMin.HasConfigRule === true && Number(amountAtMin.ExpectedDiscountPercent) === 10,
      'Gross line 1000 phải đạt ngưỡng và giảm 10%: ' + JSON.stringify(amountAtMin));
    assert(amountOverMax.HasConfigRule === true && Number(amountOverMax.ExpectedDiscountPercent) === 0,
      'Gross line 1600 vượt max không giảm nhưng không fallback: ' + JSON.stringify(amountOverMax));
    results.push(['AMOUNT_RULE_USES_PRE_VAT_PRE_DISCOUNT_LINE_VALUE', true, '1000=>10%; 1600=>0%']);

    await new sql.Request(tx)
      .input('id', sql.BigInt, upAmount.recordset[0].PromotionProgramID)
      .query("UPDATE dbo.AI_PromotionProgramTbl SET Status='WITHDRAWN' WHERE PromotionProgramID=@id;");

    // ── Test 5: Tie-break ổn định khi 2 rule cùng Priority + cùng mốc ─────
    const code2a = 'VERIFY_TIE_A_' + Date.now();
    const code2b = 'VERIFY_TIE_B_' + Date.now();
    const up2a = await upsertProgram(tx, {
      manager, promotionCode: code2a,
      rules: [{ RuleOrder: 1, ItemID: itemB, RuleType: 'QUANTITY_DISCOUNT', MinimumQuantity: 5, DiscountPercent: 3 }],
    });
    await approveProgram(tx, { manager, promotionProgramID: up2a.recordset[0].PromotionProgramID });
    const up2b = await upsertProgram(tx, {
      manager, promotionCode: code2b,
      rules: [{ RuleOrder: 1, ItemID: itemB, RuleType: 'QUANTITY_DISCOUNT', MinimumQuantity: 5, DiscountPercent: 9 }],
    });
    await approveProgram(tx, { manager, promotionProgramID: up2b.recordset[0].PromotionProgramID });

    const ruleIds = (await new sql.Request(tx)
      .input('pa', sql.BigInt, up2a.recordset[0].PromotionProgramID)
      .input('pb', sql.BigInt, up2b.recordset[0].PromotionProgramID)
      .query('SELECT PromotionProgramID, PromotionItemRuleID FROM dbo.AI_PromotionItemRuleTbl WHERE PromotionProgramID IN (@pa, @pb);')).recordset;
    const expectedWinnerId = Math.min(...ruleIds.map((r) => r.PromotionItemRuleID));

    const run1 = await runOrderConfigCandidate(tx, { manager, item: itemB, quantity: 6, unitPrice: 1000 });
    const run2 = await runOrderConfigCandidate(tx, { manager, item: itemB, quantity: 6, unitPrice: 1000 });
    const run3 = await runOrderConfigCandidate(tx, { manager, item: itemB, quantity: 6, unitPrice: 1000 });
    assert(run1.SoLuongTang === run2.SoLuongTang && run2.SoLuongTang === run3.SoLuongTang,
      'Rule thắng phải giống nhau qua 3 lần chạy, thực tế: ' + [run1, run2, run3].map((r) => r.SoLuongTang).join(', '));
    assert(run1.SoLuongTang === expectedWinnerId,
      'Rule thắng phải đúng là PromotionItemRuleID nhỏ nhất (' + expectedWinnerId + '), thực tế thắng: ' + run1.SoLuongTang);
    assert(run1.ExpectedDiscountPercent === run2.ExpectedDiscountPercent && run2.ExpectedDiscountPercent === run3.ExpectedDiscountPercent,
      'DiscountPercent phải giống nhau qua 3 lần chạy khi cùng tie-break');
    results.push(['TIE_BREAK_DETERMINISTIC', true, 'winningRuleID=' + run1.SoLuongTang]);

    // ── Test 6: Quà tặng khác SKU phải bị Upsert từ chối ──────────────────
    const code3 = 'VERIFY_CROSS_SKU_' + Date.now();
    const up3 = await new sql.Request(tx)
      .input('PromotionCode', sql.VarChar(50), code3)
      .input('PromotionName', sql.NVarChar(300), code3)
      .input('ProgramType', sql.VarChar(20), 'EVENT')
      .input('EffectiveFrom', sql.DateTime2(0), new Date(Date.now() - 60000))
      .input('EffectiveTo', sql.DateTime2(0), new Date(Date.now() + 3600000))
      .input('SourceDocument', sql.NVarChar(500), 'verify_promo_cfg001_fixes.js')
      .input('JsonRules', sql.NVarChar(sql.MAX), JSON.stringify([
        { RuleOrder: 1, ItemID: itemA, RuleType: 'QUANTITY_GIFT', MinimumQuantity: 5, GiftQuantity: 1, GiftItemID: itemB },
      ]))
      .input('Username', sql.VarChar(50), manager)
      .input('Apply', sql.Bit, 1)
      .execute('dbo.API_PromotionProgram_Upsert_AI');
    assert(up3.recordset[0].MsgType === 1,
      'Upsert với GiftItemID khác ItemID phải bị từ chối (MsgType=1), thực tế: ' + JSON.stringify(up3.recordset[0]));
    results.push(['CROSS_SKU_GIFT_REJECTED', true, 'msg=' + up3.recordset[0].Msg]);

    console.log(JSON.stringify({ Task: 'VERIFY-PROMO-CFG-001-FIXES', Status: 'PASS', Results: results }, null, 2));
  } finally {
    await tx.rollback();
    console.error('ROLLED_BACK (không để lại dữ liệu test)');
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'VERIFY-PROMO-CFG-001-FIXES', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
