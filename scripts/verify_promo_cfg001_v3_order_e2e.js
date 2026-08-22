'use strict';

/* Actual-procedure integration test for PROMOTION_BENEFIT_V3.
   It creates approved promotion programs and real draft orders inside one SQL transaction,
   validates AR_OrderDetailTbl/audit, then always rolls everything back. */
const fs = require('fs');
const sql = require('mssql');

function readEnv() {
  const values = {};
  for (const file of ['.env', '.env.uat.local']) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=]+)=(.*)$/);
      if (match) values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return { ...values, ...process.env };
}

function assert(condition, message) {
  if (!condition) throw new Error('ASSERTION_FAILED: ' + message);
}

let sequence = 0;
function unique(prefix) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

async function upsertProgram(tx, manager, itemID, rule) {
  const code = unique('V3E2E').slice(0, 50);
  const response = await new sql.Request(tx)
    .input('PromotionCode', sql.VarChar(50), code)
    .input('PromotionName', sql.NVarChar(300), code)
    .input('ProgramType', sql.VarChar(20), 'EVENT')
    .input('EffectiveFrom', sql.DateTime2(0), new Date(Date.now() - 60000))
    .input('EffectiveTo', sql.DateTime2(0), new Date(Date.now() + 3600000))
    .input('SourceDocument', sql.NVarChar(500), 'verify_promo_cfg001_v3_order_e2e.js')
    .input('JsonRules', sql.NVarChar(sql.MAX), JSON.stringify([{ RuleOrder: 1, ItemID: itemID, ...rule }]))
    .input('Username', sql.VarChar(50), manager)
    .input('Apply', sql.Bit, 1)
    .execute('dbo.API_PromotionProgram_Upsert_AI');
  const row = response.recordset && response.recordset[0];
  assert(row && Number(row.MsgType) !== 1 && row.PromotionProgramID, 'Không tạo được DRAFT CTBH: ' + JSON.stringify(row));
  await new sql.Request(tx)
    .input('PromotionProgramID', sql.BigInt, row.PromotionProgramID)
    .input('Action', sql.VarChar(20), 'APPROVE')
    .input('Username', sql.VarChar(50), manager)
    .input('Apply', sql.Bit, 1)
    .execute('dbo.API_PromotionProgram_Approve_AI');
  return row.PromotionProgramID;
}

async function withdrawProgram(tx, promotionProgramID) {
  await new sql.Request(tx)
    .input('PromotionProgramID', sql.BigInt, promotionProgramID)
    .query("UPDATE dbo.AI_PromotionProgramTbl SET Status='WITHDRAWN' WHERE PromotionProgramID=@PromotionProgramID;");
}

async function createDraft(tx, context, quantity, giftQuantity, discountPercent, label) {
  const requestID = unique(`req-${label}`);
  const response = await new sql.Request(tx)
    .input('Username', sql.VarChar(50), context.userName)
    .input('DocumentID', sql.VarChar(50), 'AUTO_GEN')
    .input('DocumentDate', sql.DateTime, new Date())
    .input('BranchID', sql.VarChar(50), context.branchID)
    .input('ObjectID', sql.VarChar(50), context.objectID)
    .input('Memo', sql.NVarChar(200), `PROMO-CFG-001 V3 ${label}`)
    .input('Notes', sql.NVarChar(sql.MAX), '')
    .input('XaPhuong', sql.NVarChar(50), '')
    .input('ThuDiTuyen', sql.NVarChar(10), '')
    .input('ItemList', sql.NVarChar(sql.MAX), JSON.stringify([{
      ItemID: context.itemID,
      Quantity: quantity,
      SoLuongTang: giftQuantity,
      UnitPrice: context.unitPrice,
      DiscountPercent: discountPercent,
    }]))
    .input('IdempotencyKey', sql.VarChar(128), unique(`idem-${label}`))
    .input('RequestID', sql.VarChar(100), requestID)
    .input('SaveAsDraft', sql.Bit, 1)
    .execute('dbo.API_DonHangChiTiet_Insert_AI');
  const row = response.recordset && response.recordset[0];
  return { response: row, requestID };
}

async function readDetail(tx, documentID) {
  return (await new sql.Request(tx)
    .input('DocumentID', sql.VarChar(50), documentID)
    .query(`
      SELECT TOP (1) O.StatusID, D.ItemID, D.Quantity, D.SoLuongTang, D.UnitPrice,
             D.DiscountPercent, D.Amount, D.DiscountAmount, D.TotalAmount
      FROM dbo.AR_OrderTbl O
      JOIN dbo.AR_OrderDetailTbl D ON D.DocumentID=O.DocumentID
      WHERE O.DocumentID=@DocumentID;
    `)).recordset[0];
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
    requestTimeout: 120000,
  });

  const tx = new sql.Transaction(pool);
  await tx.begin();
  const results = [];
  try {
    const manager = (await new sql.Request(tx).query(`
      SELECT TOP (1) UserName FROM dbo.SY_User
      WHERE COALESCE(Disable,0)=0
        AND (COALESCE(Manager,0)=1 OR UPPER(COALESCE(UserGroupID,'')) IN ('QL','QLMN','ADMIN','SADM','BGD','GD'))
      ORDER BY UserName;
    `)).recordset[0];
    assert(manager, 'Không có manager để tạo/duyệt CTBH.');

    const users = (await new sql.Request(tx).query(`
      SELECT TOP (30) U.UserName, U.BranchID
      FROM dbo.SY_User U
      WHERE COALESCE(U.Disable,0)=0 AND COALESCE(U.BranchID,'')<>'' AND COALESCE(U.EmployeeID,'')<>''
        AND EXISTS (SELECT 1 FROM dbo.AI_WarehouseByUserFnc(U.UserName, SYSUTCDATETIME()))
      ORDER BY U.UserName;
    `)).recordset;

    let context = null;
    for (const user of users) {
      const customer = (await new sql.Request(tx)
        .input('UserName', sql.VarChar(50), user.UserName)
        .query(`
          SELECT TOP (1) S.ObjectID
          FROM dbo.AR_GetObjectByUserFnc(@UserName) S
          JOIN dbo.CF_ObjectTbl O ON O.ObjectID=S.ObjectID
          WHERE COALESCE(O.Phone,'')<>''
          ORDER BY S.ObjectID;
        `)).recordset[0];
      if (!customer) continue;
      const candidates = (await new sql.Request(tx)
        .input('UserName', sql.VarChar(50), user.UserName)
        .input('ObjectID', sql.VarChar(50), customer.ObjectID)
        .query(`
          WITH Candidate AS (
            SELECT T.ItemID, P.UnitPrice, SUM(T.Quantity) AS PhysicalQuantity
            FROM dbo.IV_StockTransactionTbl T
            JOIN dbo.AI_WarehouseByUserFnc(@UserName, SYSUTCDATETIME()) W ON W.StoreHouseID=T.StoreHouseID
            JOIN dbo.CF_ItemTbl I ON I.ItemID=T.ItemID AND COALESCE(I.IsDisable,0)=0
            OUTER APPLY (SELECT TOP (1) UnitPrice FROM dbo.AR_LayGiaSanPhamFnc(CAST(GETDATE() AS DATE), @ObjectID, T.ItemID)) P
            GROUP BY T.ItemID, P.UnitPrice
            HAVING SUM(T.Quantity)>40 AND P.UnitPrice>0
          )
          SELECT TOP (20) C.*
          FROM Candidate C
          OUTER APPLY (SELECT COUNT(*) AS RuleCount FROM dbo.AI_ActivePromotionByUserFnc(@UserName,C.ItemID,SYSUTCDATETIME())) A
          WHERE A.RuleCount=0
          ORDER BY C.ItemID;
        `)).recordset;
      for (const candidate of candidates) {
        const probe = await createDraft(tx, {
          userName: user.UserName, branchID: user.BranchID, objectID: customer.ObjectID,
          itemID: candidate.ItemID, unitPrice: Number(candidate.UnitPrice),
        }, 1, 0, 0, 'probe');
        if (probe.response && Number(probe.response.MsgType) === 5) {
          context = {
            userName: user.UserName, branchID: user.BranchID, objectID: customer.ObjectID,
            itemID: candidate.ItemID, unitPrice: Number(candidate.UnitPrice),
          };
          break;
        }
      }
      if (context) break;
    }
    assert(context, 'Không tìm được fixture người dùng/khách/sản phẩm có giá và tồn đủ để gọi proc tạo đơn thật.');

    const activeVersion = (await new sql.Request(tx)
      .input('Username', sql.VarChar(50), context.userName)
      .input('JsonItemIDs', sql.NVarChar(sql.MAX), JSON.stringify([{ ItemID: context.itemID }]))
      .execute('dbo.API_PromotionActiveByItems_AI')).recordset;
    assert(Array.isArray(activeVersion), 'API_PromotionActiveByItems_AI phải chạy được sau deploy.');

    const giftProgram = await upsertProgram(tx, manager.UserName, context.itemID, {
      RuleType: 'QUANTITY_GIFT', MinimumQuantity: 10, MaximumQuantity: 10,
      GiftQuantity: 2, GiftItemID: context.itemID,
    });

    for (const testCase of [
      { quantity: 4, gift: 0, label: 'gift-zero' },
      { quantity: 5, gift: 1, label: 'gift-ratio' },
      { quantity: 15, gift: 2, label: 'gift-clamp' },
    ]) {
      const created = await createDraft(tx, context, testCase.quantity, testCase.gift, 0, testCase.label);
      assert(created.response && Number(created.response.MsgType) === 5,
        `${testCase.label} phải tạo được đơn: ${JSON.stringify(created.response)}`);
      const detail = await readDetail(tx, created.response.DocumentID);
      assert(detail && Number(detail.SoLuongTang) === testCase.gift && Number(detail.StatusID) === -1,
        `${testCase.label} lệch DB detail/status: ${JSON.stringify(detail)}`);
      const audit = (await new sql.Request(tx)
        .input('DocumentID', sql.VarChar(50), created.response.DocumentID)
        .input('RequestPattern', sql.NVarChar(200), `%${created.requestID}%`)
        .query(`
          SELECT COUNT(*) AS AuditCount
          FROM dbo.AI_AuditLog
          WHERE TargetEntity='API_DonHangChiTiet_Insert_AI'
            AND ActionType='CREATE_DONHANG'
            AND TargetID=@DocumentID
            AND ExtraInfo LIKE @RequestPattern;
        `)).recordset[0];
      assert(Number(audit.AuditCount) === 1,
        `${testCase.label} phải có đúng một audit khớp DocumentID/RequestID: ${JSON.stringify(audit)}`);
      results.push([testCase.label.toUpperCase(), true, `DocumentID=${created.response.DocumentID}`, `RequestID=${created.requestID}`]);
    }

    const wrongGift = await createDraft(tx, context, 15, 3, 0, 'gift-wrong');
    assert(wrongGift.response && wrongGift.response.Code === 'PROMOTION_CHANGED',
      'Server phải từ chối quà sai contract: ' + JSON.stringify(wrongGift.response));
    results.push(['SERVER_REJECTS_WRONG_GIFT', true, `RequestID=${wrongGift.requestID}`]);
    await withdrawProgram(tx, giftProgram);

    const qtyDiscountProgram = await upsertProgram(tx, manager.UserName, context.itemID, {
      RuleType: 'QUANTITY_DISCOUNT', MinimumQuantity: 5, MaximumQuantity: 10, DiscountPercent: 7,
    });
    const qtyDiscount = await createDraft(tx, context, 7, 0, 7, 'qty-discount');
    assert(qtyDiscount.response && Number(qtyDiscount.response.MsgType) === 5,
      'QUANTITY_DISCOUNT phải tạo được đơn: ' + JSON.stringify(qtyDiscount.response));
    const qtyDetail = await readDetail(tx, qtyDiscount.response.DocumentID);
    assert(Number(qtyDetail.DiscountPercent) === 7, 'DB phải lưu discount 7%: ' + JSON.stringify(qtyDetail));
    const qtyOver = await createDraft(tx, context, 12, 0, 0, 'qty-over-max');
    assert(qtyOver.response && Number(qtyOver.response.MsgType) === 5,
      'Vượt max phải tạo được đơn với 0% và không fallback: ' + JSON.stringify(qtyOver.response));
    results.push(['QUANTITY_DISCOUNT_RANGE', true, '7=>7%; 12=>0%']);
    await withdrawProgram(tx, qtyDiscountProgram);

    const grossAtMin = context.unitPrice * 2;
    const grossMax = context.unitPrice * 3;
    const amountProgram = await upsertProgram(tx, manager.UserName, context.itemID, {
      RuleType: 'AMOUNT_DISCOUNT', MinimumOrderAmount: grossAtMin,
      MaximumOrderAmount: grossMax, DiscountPercent: 2.5,
    });
    const amountDiscount = await createDraft(tx, context, 2, 0, 2.5, 'amount-discount');
    assert(amountDiscount.response && Number(amountDiscount.response.MsgType) === 5,
      'AMOUNT_DISCOUNT phải tạo được đơn: ' + JSON.stringify(amountDiscount.response));
    const amountDetail = await readDetail(tx, amountDiscount.response.DocumentID);
    const expectedDiscountAmount = Math.round(grossAtMin * 2.5 / 100);
    assert(Number(amountDetail.DiscountAmount) === expectedDiscountAmount
      && Number(amountDetail.TotalAmount) === grossAtMin - expectedDiscountAmount,
    'Làm tròn tiền frontend/SQL không khớp: ' + JSON.stringify({ amountDetail, expectedDiscountAmount }));
    const amountOver = await createDraft(tx, context, 4, 0, 0, 'amount-over-max');
    assert(amountOver.response && Number(amountOver.response.MsgType) === 5,
      'Vượt MaximumOrderAmount phải 0% và không fallback: ' + JSON.stringify(amountOver.response));
    results.push(['AMOUNT_DISCOUNT_AND_ROUNDING', true,
      `gross=${grossAtMin}; discount=${expectedDiscountAmount}; total=${grossAtMin - expectedDiscountAmount}`]);
    await withdrawProgram(tx, amountProgram);

    console.log(JSON.stringify({
      Task: 'VERIFY-PROMO-CFG-001-V3-ACTUAL-ORDER-PROC',
      Status: 'PASS',
      ContractVersion: 'PROMOTION_BENEFIT_V3',
      Fixture: { UserName: context.userName, BranchID: context.branchID, ItemID: context.itemID, UnitPrice: context.unitPrice },
      Results: results,
      PersistentMutation: 0,
    }, null, 2));
  } finally {
    await tx.rollback();
    const residue = (await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM dbo.AR_OrderTbl WHERE Memo LIKE 'PROMO-CFG-001 V3 %') AS OrderCount,
        (SELECT COUNT(*) FROM dbo.AI_PromotionProgramTbl
         WHERE SourceDocument='verify_promo_cfg001_v3_order_e2e.js') AS ProgramCount;
    `)).recordset[0];
    await pool.close();
    if (Number(residue.OrderCount) !== 0 || Number(residue.ProgramCount) !== 0) {
      throw new Error('RESIDUE_DETECTED_AFTER_ROLLBACK: ' + JSON.stringify(residue));
    }
    console.error('ROLLED_BACK: không để lại CTBH, đơn hàng, ledger hoặc audit test.');
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    Task: 'VERIFY-PROMO-CFG-001-V3-ACTUAL-ORDER-PROC', Status: 'FAIL', Error: error.message,
  }, null, 2));
  process.exitCode = 1;
});
