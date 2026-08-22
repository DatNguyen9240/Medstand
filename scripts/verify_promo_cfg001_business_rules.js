'use strict';

/* PROMO-CFG-001 (quyết định 22/08/2026) — kiểm chứng có assertion thật (throw khi sai, exit
   code != 0) cho 6 điểm nghiệp vụ vừa quyết định + triển khai, xem
   docs/PROMO-CFG-001_QUYET_DINH_NGHIEP_VU_AP_DUNG_2026-08-22.md:
     1. VatBasis — chỉ nhận giá trị hợp lệ, round-trip đúng qua Upsert -> AI_ActivePromotionByUserFnc.
     2. Chồng khoảng Minimum/Maximum cùng ItemID trong cùng chương trình bị Upsert từ chối.
     3. MaxTotalBenefitAmountPerOrder — trần cấp đơn cắt đúng dòng làm tổng vượt trần.
     4. AI_PromotionReturnClawbackFnc — tính đúng công thức "tính lại từ số lượng còn giữ",
        kể cả case bị clamp ở MaximumQuantity.
     5. Làm tròn xuống (FLOOR) VNĐ cho trị giá lợi ích quy đổi.
     6. Lợi ích tính ra = 0 (do bị trần cấp đơn cắt) -> HasConfigRule quay về 0, rơi về note-text,
        y hệt hành vi vượt Maximum đã khóa trước đó.
   Tất cả chạy trong 1 transaction luôn rollback ở cuối — không để lại dữ liệu test. Test 3/5/6
   dùng lại đúng CTE 3 tầng (ConfigCandidate -> Computed -> Benefit -> Ranked) hiện đang nằm
   trong sql/Module common - API_DonHangChiTiet_Insert_AI.sql, để không lệch với hành vi thật. */
const fs = require('fs');
const sql = require('mssql');

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

async function upsertProgram(tx, { manager, promotionCode, rules, vatBasis, maxTotalBenefitAmountPerOrder }) {
  return new sql.Request(tx)
    .input('PromotionCode', sql.VarChar(50), promotionCode)
    .input('PromotionName', sql.NVarChar(300), promotionCode)
    .input('ProgramType', sql.VarChar(20), 'EVENT')
    .input('EffectiveFrom', sql.DateTime2(0), new Date(Date.now() - 60000))
    .input('EffectiveTo', sql.DateTime2(0), new Date(Date.now() + 3600000))
    .input('SourceDocument', sql.NVarChar(500), 'verify_promo_cfg001_business_rules.js')
    .input('JsonRules', sql.NVarChar(sql.MAX), JSON.stringify(rules))
    .input('Username', sql.VarChar(50), manager)
    .input('Apply', sql.Bit, 1)
    .input('VatBasis', sql.VarChar(40), vatBasis || 'INCLUSIVE_UNIT_PRICE_NO_GIFT_VAT')
    .input('MaxTotalBenefitAmountPerOrder', sql.Decimal(18, 2), maxTotalBenefitAmountPerOrder == null ? null : maxTotalBenefitAmountPerOrder)
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

// Mirror chính xác 3 tầng CTE (ConfigCandidate -> Computed -> Benefit -> Ranked) đang nằm
// trong API_DonHangChiTiet_Insert_AI, chạy cho NHIỀU dòng cùng lúc để test trần cấp đơn (mục 3).
async function runOrderConfigCandidate(tx, { manager, lines }) {
  const escUser = manager.replace(/'/g, "''");
  const values = lines.map((l) => `('${l.item}', ${l.quantity}, 0, ${l.unitPrice}, 0)`).join(', ');
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
        HasConfigRule BIT NOT NULL DEFAULT 0,
        WinningPromotionProgramID BIGINT NULL,
        BenefitValueVND DECIMAL(18,2) NOT NULL DEFAULT 0
    );
    INSERT #Items (ItemID, Quantity, SoLuongTang, UnitPrice, DiscountPercent) VALUES ${values};

    DECLARE @Username VARCHAR(50) = '${escUser}';
    DECLARE @StockAsOfUtc DATETIME2(0) = SYSUTCDATETIME();
    ;WITH ConfigCandidate AS (
        SELECT
            T.ItemID, F.RuleType, F.MinimumQuantity, F.MinimumOrderAmount,
            F.DiscountPercent, F.GiftQuantity, F.Priority, F.PromotionItemRuleID,
            F.PromotionProgramID, F.MaxTotalBenefitAmountPerOrder,
            ROW_NUMBER() OVER (
                PARTITION BY T.ItemID
                ORDER BY F.Priority ASC, COALESCE(F.MinimumOrderAmount, F.MinimumQuantity) DESC, F.PromotionItemRuleID ASC
            ) AS TierRank
        FROM #Items T
        CROSS APPLY dbo.AI_ActivePromotionByUserFnc(@Username, T.ItemID, @StockAsOfUtc) F
        WHERE (
                F.RuleType IN ('QUANTITY_DISCOUNT','QUANTITY_GIFT') AND F.MinimumQuantity IS NOT NULL
                AND T.Quantity >= F.MinimumQuantity
                AND (F.MaximumQuantity IS NULL OR T.Quantity <= F.MaximumQuantity)
              )
           OR (
                F.RuleType IN ('AMOUNT_DISCOUNT','AMOUNT_GIFT') AND F.MinimumOrderAmount IS NOT NULL
                AND (T.Quantity * T.UnitPrice) >= F.MinimumOrderAmount
                AND (F.MaximumOrderAmount IS NULL OR (T.Quantity * T.UnitPrice) <= F.MaximumOrderAmount)
              )
    ), Computed AS (
        SELECT
            C.ItemID, C.RuleType, C.PromotionProgramID, C.MaxTotalBenefitAmountPerOrder,
            CASE WHEN C.RuleType = 'QUANTITY_GIFT' THEN FLOOR(T.Quantity / C.MinimumQuantity) * COALESCE(C.GiftQuantity, 0)
                 WHEN C.RuleType = 'AMOUNT_GIFT' THEN COALESCE(C.GiftQuantity, 0) ELSE 0 END AS GiftQty,
            CASE WHEN C.RuleType IN ('QUANTITY_DISCOUNT','AMOUNT_DISCOUNT') THEN COALESCE(C.DiscountPercent, 0) ELSE 0 END AS DiscPct,
            T.UnitPrice, T.Quantity
        FROM #Items T JOIN ConfigCandidate C ON C.ItemID = T.ItemID AND C.TierRank = 1
    ), Benefit AS (
        SELECT ItemID, RuleType, PromotionProgramID, MaxTotalBenefitAmountPerOrder, GiftQty, DiscPct,
            CASE WHEN GiftQty > 0 THEN FLOOR(GiftQty * UnitPrice)
                 WHEN DiscPct > 0 THEN FLOOR(Quantity * UnitPrice * DiscPct / 100.0)
                 ELSE 0 END AS BenefitValueVND
        FROM Computed
    ), Ranked AS (
        SELECT B.*, SUM(B.BenefitValueVND) OVER (PARTITION BY B.PromotionProgramID ORDER BY B.ItemID ASC ROWS UNBOUNDED PRECEDING) AS RunningTotalVND
        FROM Benefit B
    )
    UPDATE T
    SET T.ExpectedGiftQuantity = CASE WHEN Fit.GiftQty > 0 THEN Fit.GiftQty ELSE 0 END,
        T.ExpectedDiscountPercent = CASE WHEN Fit.GiftQty = 0 AND Fit.DiscPct > 0 THEN Fit.DiscPct ELSE 0 END,
        T.HasConfigRule = CASE WHEN (Fit.GiftQty > 0 OR Fit.DiscPct > 0) THEN 1 ELSE 0 END,
        T.WinningPromotionProgramID = CASE WHEN (Fit.GiftQty > 0 OR Fit.DiscPct > 0) THEN Fit.PromotionProgramID ELSE NULL END,
        T.BenefitValueVND = CASE WHEN (Fit.GiftQty > 0 OR Fit.DiscPct > 0) THEN Fit.BenefitValueVND ELSE 0 END
    FROM #Items T
    JOIN (
        SELECT ItemID, PromotionProgramID, BenefitValueVND,
            CASE WHEN MaxTotalBenefitAmountPerOrder IS NOT NULL AND RunningTotalVND > MaxTotalBenefitAmountPerOrder THEN 0 ELSE GiftQty END AS GiftQty,
            CASE WHEN MaxTotalBenefitAmountPerOrder IS NOT NULL AND RunningTotalVND > MaxTotalBenefitAmountPerOrder THEN 0 ELSE DiscPct END AS DiscPct
        FROM Ranked
    ) Fit ON Fit.ItemID = T.ItemID;
  `);
  const r = await new sql.Request(tx).query('SELECT * FROM #Items ORDER BY ItemID;');
  return r.recordset;
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
    const items = (await new sql.Request(tx).query(`SELECT TOP (4) ItemID FROM dbo.CF_ItemTbl WHERE COALESCE(isDisable,0)=0 ORDER BY ItemID;`)).recordset;
    const [itemA, itemB, itemC, itemD] = items.map((r) => r.ItemID);

    // ── Test 1 (mục 1 — VAT): VatBasis chỉ nhận giá trị hợp lệ, round-trip đúng ───────────
    const codeVat = 'VERIFY_VAT_' + Date.now();
    const badVat = await upsertProgram(tx, {
      manager, promotionCode: codeVat + '_BAD',
      rules: [{ RuleOrder: 1, ItemID: itemA, RuleType: 'AMOUNT_DISCOUNT', MinimumOrderAmount: 100000, DiscountPercent: 5 }],
      vatBasis: 'EXCLUSIVE_PRE_TAX_BOGUS',
    });
    assert(badVat.recordset[0].MsgType === 1, 'VatBasis lạ phải bị Upsert từ chối, thực tế: ' + JSON.stringify(badVat.recordset[0]));

    const goodVat = await upsertProgram(tx, {
      manager, promotionCode: codeVat,
      rules: [{ RuleOrder: 1, ItemID: itemA, RuleType: 'AMOUNT_DISCOUNT', MinimumOrderAmount: 100000, DiscountPercent: 5 }],
      vatBasis: 'INCLUSIVE_UNIT_PRICE_NO_GIFT_VAT',
    });
    assert(goodVat.recordset[0].MsgType === 0, 'VatBasis hợp lệ phải lưu được: ' + JSON.stringify(goodVat.recordset[0]));
    const detailVat = await new sql.Request(tx)
      .input('PromotionProgramID', sql.BigInt, goodVat.recordset[0].PromotionProgramID)
      .input('Username', sql.VarChar(50), manager)
      .execute('dbo.API_PromotionProgram_Detail_AI');
    assert(detailVat.recordset[0].VatBasis === 'INCLUSIVE_UNIT_PRICE_NO_GIFT_VAT', 'VatBasis phải round-trip đúng qua Detail: ' + JSON.stringify(detailVat.recordset[0]));
    results.push(['VAT_BASIS_VALIDATED_AND_ROUNDTRIP', true]);

    // ── Test 2 (mục 2): chồng khoảng Minimum/Maximum cùng ItemID, cùng chương trình bị chặn ─
    const codeOverlap = 'VERIFY_OVERLAP_' + Date.now();
    const overlap = await upsertProgram(tx, {
      manager, promotionCode: codeOverlap,
      rules: [
        { RuleOrder: 1, ItemID: itemB, RuleType: 'QUANTITY_DISCOUNT', MinimumQuantity: 5, MaximumQuantity: 10, DiscountPercent: 7 },
        { RuleOrder: 2, ItemID: itemB, RuleType: 'QUANTITY_GIFT', MinimumQuantity: 8, MaximumQuantity: 15, GiftQuantity: 1, GiftItemID: itemB },
      ],
    });
    assert(overlap.recordset[0].MsgType === 1, '2 rule chồng khoảng SL (5-10 và 8-15) cùng ItemID phải bị từ chối: ' + JSON.stringify(overlap.recordset[0]));

    const noOverlap = await upsertProgram(tx, {
      manager, promotionCode: codeOverlap + '_OK',
      rules: [
        { RuleOrder: 1, ItemID: itemB, RuleType: 'QUANTITY_DISCOUNT', MinimumQuantity: 5, MaximumQuantity: 10, DiscountPercent: 7 },
        { RuleOrder: 2, ItemID: itemB, RuleType: 'QUANTITY_GIFT', MinimumQuantity: 11, MaximumQuantity: 20, GiftQuantity: 1, GiftItemID: itemB },
      ],
    });
    assert(noOverlap.recordset[0].MsgType === 0, '2 rule KHÔNG chồng khoảng (5-10 và 11-20) phải lưu được: ' + JSON.stringify(noOverlap.recordset[0]));
    results.push(['SAME_PROGRAM_RANGE_OVERLAP_REJECTED', true]);

    // ── Test 3+5+6 (mục 3, 5, 6): trần cấp đơn cắt dòng vượt, làm tròn xuống, zero->fallback ─
    const codeCap = 'VERIFY_CAP_' + Date.now();
    const capProgram = await upsertProgram(tx, {
      manager, promotionCode: codeCap,
      rules: [
        { RuleOrder: 1, ItemID: itemC, RuleType: 'AMOUNT_DISCOUNT', MinimumOrderAmount: 100000, DiscountPercent: 7 }, // lẻ để test làm tròn
        { RuleOrder: 2, ItemID: itemD, RuleType: 'AMOUNT_DISCOUNT', MinimumOrderAmount: 100000, DiscountPercent: 50 },
      ],
      maxTotalBenefitAmountPerOrder: 30000, // đủ cho dòng C, không đủ cho cả C+D
    });
    await approveProgram(tx, { manager, promotionProgramID: capProgram.recordset[0].PromotionProgramID });

    // Dòng C: 333333 * 7% = 23333.31 -> FLOOR = 23333đ (test làm tròn xuống, mục 5)
    // Dòng D: 100000 * 50% = 50000đ. Tổng cộng dồn (C rồi D, theo ItemID tăng dần) = 23333 + 50000 = 73333 > 30000
    //   -> dòng D (dòng làm vượt trần) bị cắt về 0, HasConfigRule=0, rơi về note-text (mục 6).
    const lines = [itemC, itemD].sort().map((it) => it === itemC
      ? { item: itemC, quantity: 1, unitPrice: 333333 }
      : { item: itemD, quantity: 1, unitPrice: 100000 });
    const rows = await runOrderConfigCandidate(tx, { manager, lines });
    const rowC = rows.find((r) => r.ItemID === itemC);
    const rowD = rows.find((r) => r.ItemID === itemD);

    assert(rowC.HasConfigRule === true, 'Dòng đầu (không vượt trần) phải được áp CTBH: ' + JSON.stringify(rowC));
    assert(Number(rowC.BenefitValueVND) === 23333, 'Làm tròn xuống VNĐ sai: kỳ vọng 23333, thực tế ' + rowC.BenefitValueVND + ' (333333*7%=23333.31)');
    results.push(['ROUNDING_FLOOR_TO_VND', true, 'BenefitValueVND=' + rowC.BenefitValueVND]);

    const isCorrectItemOrder = itemC < itemD; // xác nhận giả định thứ tự ItemID để diễn giải kết quả đúng
    if (isCorrectItemOrder) {
      assert(rowD.HasConfigRule === false, 'Dòng làm tổng vượt trần phải bị cắt về không có cấu hình (mục 3+6): ' + JSON.stringify(rowD));
      assert(Number(rowD.ExpectedDiscountPercent) === 0 && Number(rowD.BenefitValueVND) === 0, 'Dòng bị cắt phải có benefit = 0: ' + JSON.stringify(rowD));
      results.push(['ORDER_LEVEL_CAP_CUTS_OVERFLOW_LINE', true, { rowC, rowD }]);
      results.push(['ZERO_BENEFIT_FALLBACK_TO_UNMATCHED', true, 'HasConfigRule=' + rowD.HasConfigRule]);
    } else {
      // Nếu thứ tự ItemID ngược lại thì D được xử lý trước và giữ nguyên, C bị cắt — vẫn đúng
      // logic (thứ tự ItemID tăng dần), chỉ đổi vai trò dòng nào bị cắt.
      assert(rowC.HasConfigRule === false || rowD.HasConfigRule === false, 'Phải có đúng 1 dòng bị cắt do vượt trần: ' + JSON.stringify(rows));
      results.push(['ORDER_LEVEL_CAP_CUTS_OVERFLOW_LINE', true, { rowC, rowD, note: 'ItemID order reversed vs assumption' }]);
    }

    // Thu hồi chương trình có trần trước khi test "không trần" — nếu không, tie-break
    // (PromotionItemRuleID ASC) vẫn chọn rule của capProgram (tạo trước, ID nhỏ hơn) cho cùng
    // ItemID/mốc, khiến trần cũ tiếp tục áp dù chương trình mới không khai trần.
    await new sql.Request(tx)
      .input('PromotionProgramID', sql.BigInt, capProgram.recordset[0].PromotionProgramID)
      .input('Action', sql.VarChar(20), 'WITHDRAW')
      .input('Username', sql.VarChar(50), manager)
      .input('Apply', sql.Bit, 1)
      .execute('dbo.API_PromotionProgram_Approve_AI');

    // Trường hợp KHÔNG có trần (MaxTotalBenefitAmountPerOrder = NULL) -> cả 2 dòng đều full benefit
    const codeNoCap = 'VERIFY_NOCAP_' + Date.now();
    const noCapProgram = await upsertProgram(tx, {
      manager, promotionCode: codeNoCap,
      rules: [
        { RuleOrder: 1, ItemID: itemC, RuleType: 'AMOUNT_DISCOUNT', MinimumOrderAmount: 100000, DiscountPercent: 7 },
        { RuleOrder: 2, ItemID: itemD, RuleType: 'AMOUNT_DISCOUNT', MinimumOrderAmount: 100000, DiscountPercent: 50 },
      ],
      maxTotalBenefitAmountPerOrder: null,
    });
    await approveProgram(tx, { manager, promotionProgramID: noCapProgram.recordset[0].PromotionProgramID });
    const rowsNoCap = await runOrderConfigCandidate(tx, { manager, lines });
    assert(rowsNoCap.every((r) => r.HasConfigRule === true), 'Không khai trần (NULL) thì cả 2 dòng phải giữ nguyên hành vi cũ, không bị cắt: ' + JSON.stringify(rowsNoCap));
    results.push(['NULL_CAP_PRESERVES_LEGACY_BEHAVIOR', true]);

    // ── Test 4 (mục 4 — trả hàng): AI_PromotionReturnClawbackFnc ────────────────────────────
    // Case A: mua 50 (tặng 10), trả 20 (còn 30) -> quà đúng ra còn = FLOOR(30/10)*2=6 -> thu hồi 4
    const cbA = (await new sql.Request(tx)
      .input('OriginalPurchasedQuantity', sql.Decimal(18, 2), 50)
      .input('ReturnedQuantity', sql.Decimal(18, 2), 20)
      .input('RuleMinimumQuantity', sql.Decimal(18, 2), 10)
      .input('RuleGiftQuantity', sql.Decimal(18, 2), 2)
      .input('RuleMaximumQuantity', sql.Decimal(18, 2), 80)
      .query(`SELECT * FROM dbo.AI_PromotionReturnClawbackFnc(@OriginalPurchasedQuantity, @ReturnedQuantity, @RuleMinimumQuantity, @RuleGiftQuantity, @RuleMaximumQuantity);`)).recordset[0];
    assert(Number(cbA.GiftAlreadyGiven) === 10 && Number(cbA.ClawbackQuantity) === 4,
      'Return case A sai: kỳ vọng GiftAlreadyGiven=10, Clawback=4, thực tế ' + JSON.stringify(cbA));

    // Case B (ratio 10+1, khác case A/C dùng 10+2 — cố ý để cô lập hiệu ứng clamp riêng):
    //   mua 100 (clamp Maximum=80 -> chỉ tính trên 80 -> tặng FLOOR(80/10)*1=8), trả 30 (còn 70,
    //   vẫn <=80, chưa chạm clamp) -> quà đúng ra còn = FLOOR(70/10)*1=7 -> thu hồi 8-7=1.
    const cbB = (await new sql.Request(tx)
      .input('OriginalPurchasedQuantity', sql.Decimal(18, 2), 100)
      .input('ReturnedQuantity', sql.Decimal(18, 2), 30)
      .input('RuleMinimumQuantity', sql.Decimal(18, 2), 10)
      .input('RuleGiftQuantity', sql.Decimal(18, 2), 1)
      .input('RuleMaximumQuantity', sql.Decimal(18, 2), 80)
      .query(`SELECT * FROM dbo.AI_PromotionReturnClawbackFnc(@OriginalPurchasedQuantity, @ReturnedQuantity, @RuleMinimumQuantity, @RuleGiftQuantity, @RuleMaximumQuantity);`)).recordset[0];
    assert(Number(cbB.GiftAlreadyGiven) === 8 && Number(cbB.ClawbackQuantity) === 1,
      'Return case B sai: kỳ vọng GiftAlreadyGiven=8 (clamp Maximum=80, ratio 10+1), Clawback=1, thực tế ' + JSON.stringify(cbB));

    // Case C: mua 50 (tặng 10), trả hết 50 (còn 0) -> thu hồi toàn bộ 10
    const cbC = (await new sql.Request(tx)
      .input('OriginalPurchasedQuantity', sql.Decimal(18, 2), 50)
      .input('ReturnedQuantity', sql.Decimal(18, 2), 50)
      .input('RuleMinimumQuantity', sql.Decimal(18, 2), 10)
      .input('RuleGiftQuantity', sql.Decimal(18, 2), 2)
      .input('RuleMaximumQuantity', sql.Decimal(18, 2), 80)
      .query(`SELECT * FROM dbo.AI_PromotionReturnClawbackFnc(@OriginalPurchasedQuantity, @ReturnedQuantity, @RuleMinimumQuantity, @RuleGiftQuantity, @RuleMaximumQuantity);`)).recordset[0];
    assert(Number(cbC.GiftShouldRemain) === 0 && Number(cbC.ClawbackQuantity) === 10,
      'Return case C sai: trả hết hàng phải thu hồi toàn bộ quà (10), thực tế ' + JSON.stringify(cbC));
    results.push(['RETURN_CLAWBACK_RECOMPUTE_FROM_REMAINING', true, { cbA, cbB, cbC }]);

    // ── JS mirror phải khớp SQL (client preview không được lệch server) ─────────────────────
    const promo = require('../src/js/utils/promotion.js');
    const jsA = promo.calculateReturnClawback(50, 20, 10, 2, 80);
    assert(jsA.giftAlreadyGiven === 10 && jsA.clawbackQuantity === 4, 'JS calculateReturnClawback lệch SQL case A: ' + JSON.stringify(jsA));
    const jsB = promo.calculateReturnClawback(100, 30, 10, 1, 80);
    assert(jsB.giftAlreadyGiven === 8 && jsB.clawbackQuantity === 1, 'JS calculateReturnClawback lệch SQL case B: ' + JSON.stringify(jsB));
    results.push(['JS_SQL_RETURN_CLAWBACK_PARITY', true]);

    // ── JS zero-benefit fallback (mục 6) trả về null, không phải object benefit rỗng ────────
    const zeroFallback = promo.calculateFromConfigRules(
      [{ RuleType: 'QUANTITY_GIFT', MinimumQuantity: 10, MaximumQuantity: null, GiftQuantity: 0, PromotionItemRuleID: 1, Priority: 100 }],
      10, 1000
    );
    assert(zeroFallback === null, 'JS calculateFromConfigRules phải trả null khi lợi ích tính ra = 0 (mục 6): ' + JSON.stringify(zeroFallback));
    results.push(['JS_ZERO_BENEFIT_RETURNS_NULL', true]);

    console.log(JSON.stringify({ Task: 'VERIFY-PROMO-CFG-001-BUSINESS-RULES', Status: 'PASS', Results: results }, null, 2));
  } catch (innerError) {
    console.error('INNER_ERROR: ' + innerError.message);
    throw innerError;
  } finally {
    try { await tx.rollback(); console.error('ROLLED_BACK (không để lại dữ liệu test)'); }
    catch (rollbackError) { console.error('ROLLBACK_ALSO_FAILED: ' + rollbackError.message); }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'VERIFY-PROMO-CFG-001-BUSINESS-RULES', Status: 'FAIL', Error: error.message, Stack: error.stack }, null, 2));
  process.exitCode = 1;
});
