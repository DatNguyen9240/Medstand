'use strict';

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sql = require('mssql');
const { testDbConfig } = require('./lib/test-db-config');

const root = path.resolve(__dirname, '..');
const apply = process.argv.includes('--apply');
const replace = process.argv.includes('--replace');
const batchPrefix = 'U13S1_';
const marker = '[UAT13-SUG-V1]';
const createdBy = 'AI_UAT13_FIXTURE';
const groups = [
  { id: 'MB13', primary: 'NAMDINHB.MED', users: ['QLBH013.MED', 'NAMDINHB.MED'] },
  { id: 'MB16', primary: 'BACNINHA.MED', users: ['QLBH016.MED', 'BACNINHA.MED'] },
  { id: 'MT05', primary: 'HUEB.MED', users: ['QLBH005.MED', 'HUEB.MED'] },
  { id: 'MT10', primary: 'DANANGA.MED', users: ['QLBH010.MED', 'DANANGA.MED'] },
  { id: 'MN02', primary: 'CanThoA', users: ['QLMN2', 'CanThoA'] },
  { id: 'MNMD', primary: 'BinhPhuocA', users: ['QLMD1', 'BinhPhuocA'] },
  { id: 'MN24', primary: 'QLBH024.MED', users: ['QLBH024.MED'] },
];

const flatten = (result) => (result.recordsets || []).flat();

async function query(executor, text, inputs = {}) {
  const request = new sql.Request(executor);
  for (const [name, spec] of Object.entries(inputs)) request.input(name, spec.type, spec.value);
  return request.query(text);
}

const varchar = (value, length = 50) => ({ type: sql.VarChar(length), value });
const nvarchar = (value, length = 500) => ({ type: sql.NVarChar(length), value });
const integer = (value) => ({ type: sql.Int, value });
const decimal = (value) => ({ type: sql.Decimal(18, 2), value });

async function userInfo(pool, username) {
  const result = await query(pool, `
    SELECT UserName, EmployeeID, ManagerID, BranchID, Manager, UserGroupID
    FROM dbo.SY_User WITH (NOLOCK)
    WHERE UserName = @Username AND ISNULL(Disable, 0) = 0;
  `, { Username: varchar(username) });
  assert.strictEqual(result.recordset.length, 1, `Missing or disabled UAT account: ${username}`);
  return result.recordset[0];
}

async function customerCandidates(pool, username, branchId) {
  const result = await query(pool, `
    SELECT TOP 100 O.ObjectID, O.ObjectName, O.BranchID,
           COUNT(DISTINCT CASE WHEN I.StatusID IN (3,6,7,8) AND I.DocumentID NOT LIKE @FixturePrefix THEN I.DocumentID END) AS FulfilledInvoiceCount
    FROM dbo.AR_GetObjectByUserFnc(@Username) S
    JOIN dbo.CF_ObjectTbl O WITH (NOLOCK) ON O.ObjectID = S.ObjectID
    LEFT JOIN dbo.AR_InvoiceTbl I WITH (NOLOCK) ON I.ObjectID = O.ObjectID
    WHERE ISNULL(O.isCustomer, 0) = 1
      AND ISNULL(O.isDisable, 0) = 0
      AND O.BranchID = @BranchID
    GROUP BY O.ObjectID, O.ObjectName, O.BranchID
    ORDER BY CASE WHEN COUNT(DISTINCT CASE WHEN I.StatusID IN (3,6,7,8) AND I.DocumentID NOT LIKE @FixturePrefix THEN I.DocumentID END) = 0 THEN 0 ELSE 1 END,
             O.ObjectID;
  `, { Username: varchar(username), BranchID: varchar(branchId), FixturePrefix: varchar(`${batchPrefix}%`, 30) });
  return result.recordset;
}

async function inScope(pool, username, objectId) {
  const result = await query(pool, `
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM dbo.AR_GetObjectByUserFnc(@Username) WHERE ObjectID = @ObjectID
    ) THEN 1 ELSE 0 END AS Allowed;
  `, { Username: varchar(username), ObjectID: varchar(objectId) });
  return Number(result.recordset[0]?.Allowed) === 1;
}

async function sellableProducts(pool, username) {
  const result = await query(pool, `
    DECLARE @EmployeeID VARCHAR(50) = '', @IsManager BIT = 0, @IsGlobal BIT = 0;
    DECLARE @AllowedStores TABLE (StoreHouseID VARCHAR(50) PRIMARY KEY);

    SELECT @EmployeeID = ISNULL(EmployeeID, ''),
           @IsManager = CASE WHEN ISNULL(Manager, 0) = 1 OR UPPER(ISNULL(UserGroupID, '')) IN ('QL','QLMN') THEN 1 ELSE 0 END,
           @IsGlobal = CASE WHEN UPPER(ISNULL(UserGroupID, '')) IN ('ADMIN','SADM','BGD','GD') THEN 1 ELSE 0 END
    FROM dbo.SY_User WITH (NOLOCK) WHERE UserName = @Username AND ISNULL(Disable, 0) = 0;

    INSERT INTO @AllowedStores (StoreHouseID)
    SELECT DISTINCT StoreHouseID FROM dbo.SY_UserStoreHouseTbl WITH (NOLOCK)
    WHERE UserName = @Username AND ISNULL(StoreHouseID, '') <> '';

    IF @IsManager = 1 AND @EmployeeID <> ''
    BEGIN
      INSERT INTO @AllowedStores (StoreHouseID)
      SELECT DISTINCT US.StoreHouseID
      FROM dbo.SY_User U WITH (NOLOCK)
      JOIN dbo.SY_UserStoreHouseTbl US WITH (NOLOCK) ON US.UserName = U.UserName
      WHERE U.ManagerID = @EmployeeID AND ISNULL(U.Disable, 0) = 0 AND ISNULL(US.StoreHouseID, '') <> ''
        AND NOT EXISTS (SELECT 1 FROM @AllowedStores A WHERE A.StoreHouseID = US.StoreHouseID);
    END;

    ;WITH StockByLot AS (
      SELECT T.ItemID, T.StoreHouseID, T.Lot, T.ExpireDate, SUM(ISNULL(T.Quantity, 0)) AS RemainingPhysical
      FROM dbo.IV_StockTransactionTbl T WITH (NOLOCK)
      WHERE @IsGlobal = 1 OR T.StoreHouseID IN (SELECT StoreHouseID FROM @AllowedStores)
      GROUP BY T.ItemID, T.StoreHouseID, T.Lot, T.ExpireDate
    ), Sellable AS (
      SELECT ItemID, StoreHouseID,
             SUM(CASE WHEN RemainingPhysical > 0 AND (ExpireDate IS NULL OR CAST(ExpireDate AS DATE) >= CAST(GETDATE() AS DATE))
                      THEN RemainingPhysical ELSE 0 END) AS SellableStock
      FROM StockByLot GROUP BY ItemID, StoreHouseID
    )
    SELECT TOP 100 S.ItemID, I.ItemName, I.Unit, S.StoreHouseID, S.SellableStock
    FROM Sellable S
    JOIN dbo.CF_ItemTbl I WITH (NOLOCK) ON I.ItemID = S.ItemID
    WHERE S.SellableStock > 5 AND ISNULL(I.isDisable, 0) = 0 AND ISNULL(I.ItemGroupID, '') = 'HH1'
    ORDER BY S.SellableStock DESC, S.ItemID;
  `, { Username: varchar(username) });
  return result.recordset;
}

async function accountingDefaults(pool, branchId, itemId) {
  const result = await query(pool, `
    SELECT TOP 1 NULLIF(RevAccID, '') AS RevAccID
    FROM dbo.AR_InvoiceTbl WITH (NOLOCK)
    WHERE BranchID = @BranchID AND NULLIF(RevAccID, '') IS NOT NULL
    ORDER BY DocumentDate DESC;

    SELECT TOP 1 NULLIF(IncomeAccID, '') AS IncomeAccID,
           CASE WHEN ISNULL(UnitPrice, 0) > 0 THEN UnitPrice ELSE 100000 END AS UnitPrice
    FROM dbo.AR_InvoiceDetailTbl WITH (NOLOCK)
    WHERE ItemID = @ItemID AND NULLIF(IncomeAccID, '') IS NOT NULL
    ORDER BY DocumentID DESC;
  `, { BranchID: varchar(branchId), ItemID: varchar(itemId) });
  return {
    revAccId: result.recordsets[0]?.[0]?.RevAccID || '1311',
    incomeAccId: result.recordsets[1]?.[0]?.IncomeAccID || '5111',
    unitPrice: Number(result.recordsets[1]?.[0]?.UnitPrice || 100000),
  };
}

async function buildPlan(pool) {
  const plan = [];
  for (const group of groups) {
    const primary = await userInfo(pool, group.primary);
    const users = [];
    for (const username of group.users) users.push(await userInfo(pool, username));

    const candidates = await customerCandidates(pool, group.primary, primary.BranchID);
    let customer = null;
    for (const candidate of candidates) {
      const checks = await Promise.all(group.users.map((username) => inScope(pool, username, candidate.ObjectID)));
      if (checks.every(Boolean)) { customer = candidate; break; }
    }
    assert(customer, `No common scoped customer found for ${group.id}`);

    const productLists = [];
    for (const username of group.users) productLists.push(await sellableProducts(pool, username));
    const common = productLists[0].filter((product) =>
      productLists.every((list) => list.some((candidate) => candidate.ItemID === product.ItemID)));
    assert(common.length >= 3, `Need three common sellable products for ${group.id}; found ${common.length}`);
    const products = [];
    for (const product of common.slice(0, 3)) {
      products.push({ ...product, ...(await accountingDefaults(pool, primary.BranchID, product.ItemID)) });
    }
    const headerDefaults = await accountingDefaults(pool, primary.BranchID, products[0].ItemID);
    plan.push({
      ...group,
      branchId: primary.BranchID,
      employeeId: primary.EmployeeID || '',
      managerId: primary.ManagerID || primary.EmployeeID || '',
      customer,
      products,
      revAccId: headerDefaults.revAccId,
      documents: [1, 2, 3, 4].map((sequence) => `${batchPrefix}${group.id}_${sequence}`),
    });
  }
  return plan;
}

async function insertFixture(transaction, plan) {
  for (const group of plan) {
    // Hóa đơn thứ tư có ngày hôm nay nhưng chỉ chứa sản phẩm thứ ba. Hai sản phẩm
    // chính vẫn có lần mua cuối cách 30 ngày để API gợi ý mua lại không loại chúng
    // bởi quy tắc "đã mua hôm nay".
    const baskets = [[0, 1], [0, 1, 2], [0, 1], [2]];
    for (let sequence = 1; sequence <= 4; sequence += 1) {
      const documentId = group.documents[sequence - 1];
      const productIndexes = baskets[sequence - 1];
      const total = productIndexes.reduce((sum, index) => sum + group.products[index].unitPrice, 0);
      await query(transaction, `
        INSERT INTO dbo.AR_InvoiceTbl (
          DocumentID, DocumentDate, ObjectID, EmployeeID, ManagerID, Memo, Notes,
          DueDate, BaseTotal, StatusID, UserCreate, DateCreate, BranchID, RevAccID, InvoiceNo
        )
        VALUES (
          @DocumentID, DATEADD(DAY, @DayOffset, CAST(GETDATE() AS DATE)), @ObjectID, @EmployeeID, @ManagerID,
          @Memo, @Notes, DATEADD(DAY, @DayOffset + 30, CAST(GETDATE() AS DATE)), @BaseTotal,
          8, @UserCreate, GETDATE(), @BranchID, @RevAccID, @DocumentID
        );
      `, {
        DocumentID: varchar(documentId, 30), DayOffset: integer(sequence * 30 - 120),
        ObjectID: varchar(group.customer.ObjectID), EmployeeID: varchar(group.employeeId),
        ManagerID: varchar(group.managerId), Memo: nvarchar(`${marker} Mock invoice ${group.id}`, 200),
        Notes: nvarchar('Chỉ phục vụ UAT 13 tài khoản; có thể rollback theo BatchID U13S1.', 200),
        BaseTotal: decimal(total), UserCreate: varchar(createdBy), BranchID: varchar(group.branchId),
        RevAccID: varchar(group.revAccId),
      });

      for (const productIndex of productIndexes) {
        const product = group.products[productIndex];
        await query(transaction, `
          INSERT INTO dbo.AR_InvoiceDetailTbl (
            UserAutoID, DocumentID, ItemID, Notes, StoreHouseID, Quantity, UnitPrice,
            SourceAmount, Amount, TotalAmount, IncomeAccID, ObjectID, DienGiai, EmployeeID, ManagerID
          )
          VALUES (
            @UserAutoID, @DocumentID, @ItemID, @Notes, @StoreHouseID, 1, @UnitPrice,
            @UnitPrice, @UnitPrice, @UnitPrice, @IncomeAccID, @ObjectID, @DienGiai, @EmployeeID, @ManagerID
          );
        `, {
          UserAutoID: varchar(crypto.randomUUID(), 40), DocumentID: varchar(documentId, 30),
          ItemID: varchar(product.ItemID), Notes: nvarchar(marker, 100), StoreHouseID: varchar(product.StoreHouseID),
          UnitPrice: decimal(product.unitPrice), IncomeAccID: varchar(product.incomeAccId),
          ObjectID: varchar(group.customer.ObjectID), DienGiai: nvarchar(`${marker} mock line`, 200),
          EmployeeID: varchar(group.employeeId), ManagerID: varchar(group.managerId),
        });
      }
    }
  }
}

async function verifyFixture(executor, plan) {
  const expectedDocuments = plan.length * 4;
  const expectedDetails = plan.length * 8;
  const counts = await query(executor, `
    SELECT COUNT(*) AS HeaderCount FROM dbo.AR_InvoiceTbl
    WHERE DocumentID LIKE @Prefix AND UserCreate = @UserCreate AND LEFT(Memo, LEN(@Marker)) = @Marker;
    SELECT COUNT(*) AS DetailCount FROM dbo.AR_InvoiceDetailTbl D
    JOIN dbo.AR_InvoiceTbl I ON I.DocumentID = D.DocumentID
    WHERE I.DocumentID LIKE @Prefix AND I.UserCreate = @UserCreate AND LEFT(I.Memo, LEN(@Marker)) = @Marker;
    SELECT COUNT(*) AS StockTransactionCount FROM dbo.IV_StockTransactionTbl WHERE DocumentID LIKE @Prefix;
  `, {
    Prefix: varchar(`${batchPrefix}%`, 30), UserCreate: varchar(createdBy), Marker: nvarchar(marker, 200),
  });
  assert.strictEqual(Number(counts.recordsets[0][0].HeaderCount), expectedDocuments, 'Fixture header count mismatch');
  assert.strictEqual(Number(counts.recordsets[1][0].DetailCount), expectedDetails, 'Fixture detail count mismatch');
  assert.strictEqual(Number(counts.recordsets[2][0].StockTransactionCount), 0, 'Fixture must not create stock transactions');

  const apiChecks = [];
  for (const group of plan) {
    for (const username of group.users) {
      const order = flatten(await query(executor,
        'EXEC dbo.API_GoiYDonHang_AI @Username=@Username, @MaKhachHang=@ObjectID, @TopN=10;',
        { Username: varchar(username), ObjectID: nvarchar(group.customer.ObjectID, 100) }));
      const upsell = flatten(await query(executor,
        'EXEC dbo.API_UpsellGoiY_AI @Username=@Username, @MaKhachHang=@ObjectID, @TopN=10;',
        { Username: varchar(username), ObjectID: nvarchar(group.customer.ObjectID, 100) }));
      const related = flatten(await query(executor,
        'EXEC dbo.API_GoiYDonThuoc_AI @Username=@Username, @timkiem=@ItemID;',
        { Username: varchar(username), ItemID: nvarchar(group.products[0].ItemID, 500) }));

      assert(order.some((row) => row.MaKhachHang === group.customer.ObjectID && row.DoTinCay === 'PERSONAL_CYCLE_ELIGIBLE'),
        `Order suggestion fixture failed for ${username}/${group.customer.ObjectID}`);
      assert(upsell.some((row) => row.ItemID && Number(row.AvailableStock ?? row.TonKho ?? 0) > 0),
        `Upsell fixture failed for ${username}/${group.customer.ObjectID}: ${JSON.stringify(upsell.slice(0, 3))}`);
      assert(related.some((row) => row.ItemID && row.ItemID !== group.products[0].ItemID),
        `Related-product fixture failed for ${username}/${group.products[0].ItemID}`);
      const fixtureProductIds = new Set(group.products.map((product) => product.ItemID));
      apiChecks.push({ username, groupId: group.id, customerId: group.customer.ObjectID,
        rootItemId: group.products[0].ItemID, orderRows: order.length, upsellRows: upsell.length,
        upsellFixtureMatches: upsell.filter((row) => fixtureProductIds.has(row.ItemID)).length,
        relatedRows: related.length });
    }
  }
  return { expectedDocuments, expectedDetails, apiChecks };
}

async function main() {
  const config = testDbConfig(root);
  assert(/medtest/i.test(config.database), `Refusing fixture deployment outside medtest: ${config.database}`);
  const pool = await sql.connect(config);
  try {
    const existing = await query(pool, `
      SELECT DocumentID, UserCreate, Memo FROM dbo.AR_InvoiceTbl WHERE DocumentID LIKE @Prefix;
    `, { Prefix: varchar(`${batchPrefix}%`, 30) });
    if (existing.recordset.length) {
      assert(existing.recordset.every((row) => row.UserCreate === createdBy && String(row.Memo || '').startsWith(marker)),
        'Batch prefix collision with non-fixture data; refusing to continue.');
      if (!replace) {
        const result = { status: 'ALREADY_APPLIED', database: config.database, documentCount: existing.recordset.length,
          hint: 'Use --apply --replace to atomically replace this fixture batch.' };
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
      }
    }

    const plan = await buildPlan(pool);
    const publicPlan = plan.map((group) => ({
      groupId: group.id, users: group.users, customer: group.customer,
      products: group.products.map(({ ItemID, ItemName, StoreHouseID, SellableStock }) => ({ ItemID, ItemName, StoreHouseID, SellableStock })),
      documents: group.documents,
    }));
    if (!apply) {
      process.stdout.write(`${JSON.stringify({ status: 'DRY_RUN_PASS', database: config.database, batchPrefix, plan: publicPlan }, null, 2)}\n`);
      return;
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      if (existing.recordset.length) {
        await query(transaction, `
          DELETE D
          FROM dbo.AR_InvoiceDetailTbl D
          JOIN dbo.AR_InvoiceTbl I ON I.DocumentID = D.DocumentID
          WHERE I.DocumentID LIKE @Prefix AND I.UserCreate = @UserCreate AND LEFT(I.Memo, LEN(@Marker)) = @Marker;
          DELETE FROM dbo.GJ_TransactionTbl WHERE DocumentID LIKE @Prefix;
          DELETE FROM dbo.IV_StockTransactionTbl WHERE DocumentID LIKE @Prefix;
          DELETE FROM dbo.AR_InvoiceTbl
          WHERE DocumentID LIKE @Prefix AND UserCreate = @UserCreate AND LEFT(Memo, LEN(@Marker)) = @Marker;
        `, {
          Prefix: varchar(`${batchPrefix}%`, 30), UserCreate: varchar(createdBy), Marker: nvarchar(marker, 200),
        });
      }
      await insertFixture(transaction, plan);
      const verification = await verifyFixture(transaction, plan);
      await transaction.commit();

      const result = {
        status: 'MEDTEST_UAT13_SUGGESTION_FIXTURE_PASS',
        appliedAt: new Date().toISOString(), database: config.database, batchPrefix, marker, createdBy,
        replaceMode: Boolean(existing.recordset.length),
        rollbackCommand: 'node scripts/rollback_uat13_suggestion_fixture_medtest.js --apply',
        verification, plan: publicPlan,
      };
      const reportPath = path.join(root, 'reports', 'business-rule-v1', 'uat13-suggestion-fixture-manifest.json');
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(reportPath, JSON.stringify(result, null, 2), 'utf8');
      process.stdout.write(`${JSON.stringify({ ...result, reportPath }, null, 2)}\n`);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
