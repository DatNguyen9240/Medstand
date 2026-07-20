'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sql = require('mssql');
const { testDbConfig } = require('./lib/test-db-config');

const root = path.resolve(__dirname, '..');
const config = testDbConfig(root);
const testUsers = ['QLBH013.MED', 'NAMDINHB.MED'];
const procedures = [
  ['dbo.API_DanhsachTonKho_AI', 'sql/Module common - API_DanhsachTonKho_AI.sql'],
  ['dbo.API_UpsellGoiY_AI', 'sql/Module 5 - API_UpsellGoiY_AI.sql'],
  ['dbo.API_DeXuatKhuyenMai_AI', 'sql/Module 6 - API_DeXuatKhuyenMai_AI.sql'],
];

const sha256 = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex').toUpperCase();
const batches = (source) => source.replace(/^\uFEFF/, '').split(/^\s*GO\s*$/gim).map((item) => item.trim()).filter(Boolean);
const procedureBatch = (source, name) => {
  const shortName = name.split('.').pop();
  const batch = batches(source).find((item) => new RegExp(`CREATE\\s+OR\\s+ALTER\\s+PROCEDURE[\\s\\S]{0,60}${shortName}`, 'i').test(item));
  if (!batch) throw new Error(`Cannot find deployment batch for ${name}.`);
  return batch;
};
const allRows = (result) => (result.recordsets || []).flat().filter(Boolean);
const businessRows = (result) => allRows(result).filter((row) => row.ItemID && !Object.prototype.hasOwnProperty.call(row, 'MsgType'));

async function scopedCustomer(transaction, username) {
  const result = await new sql.Request(transaction)
    .input('Username', sql.VarChar(50), username)
    .query(`
      SELECT TOP (1) scoped.ObjectID
      FROM dbo.AR_GetObjectByUserFnc(@Username) scoped
      JOIN dbo.CF_ObjectTbl customer ON customer.ObjectID = scoped.ObjectID
      WHERE ISNULL(customer.isCustomer, 0) = 1
        AND ISNULL(customer.isDisable, 0) = 0
      ORDER BY CASE WHEN EXISTS (
        SELECT 1 FROM dbo.AR_InvoiceTbl invoice
        WHERE invoice.ObjectID = scoped.ObjectID AND invoice.StatusID IN (3, 6, 7, 8)
      ) THEN 0 ELSE 1 END, scoped.ObjectID;
    `);
  return result.recordset[0]?.ObjectID || '';
}

async function smokeUser(pool, username, isManager) {
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  try {
    const inventory = await new sql.Request(transaction)
      .input('Username', sql.VarChar(50), username)
      .query('EXEC dbo.API_DanhsachTonKho_AI @Username=@Username;');
    const inventoryRows = businessRows(inventory);
    if (!inventoryRows.length) throw new Error(`No inventory fixture found for ${username}.`);
    const allowedResult = await new sql.Request(transaction)
      .input('Username', sql.VarChar(50), username)
      .query(`
        DECLARE @EmployeeID VARCHAR(50) = '';
        DECLARE @IsManager BIT = 0;
        SELECT @EmployeeID = COALESCE(EmployeeID, ''),
               @IsManager = CASE WHEN COALESCE(Manager, 0) = 1 OR UPPER(COALESCE(UserGroupID, '')) = 'QL' THEN 1 ELSE 0 END
        FROM dbo.SY_User WHERE UserName = @Username AND ISNULL(Disable, 0) = 0;

        SELECT DISTINCT Scope.StoreHouseID
        FROM (
          SELECT US.StoreHouseID
          FROM dbo.SY_UserStoreHouseTbl US
          WHERE US.UserName = @Username
          UNION
          SELECT US.StoreHouseID
          FROM dbo.SY_User U
          JOIN dbo.SY_UserStoreHouseTbl US ON US.UserName = U.UserName
          WHERE @IsManager = 1 AND U.ManagerID = @EmployeeID AND ISNULL(U.Disable, 0) = 0
        ) Scope
        WHERE ISNULL(Scope.StoreHouseID, '') <> '';
      `);
    const allowedStores = new Set(allowedResult.recordset.map((row) => String(row.StoreHouseID)));
    if (!allowedStores.size) throw new Error(`No allowed warehouse fixture found for ${username}.`);
    if (inventoryRows.some((row) => !allowedStores.has(String(row.StoreHouseID)))) {
      throw new Error(`Inventory returned an out-of-scope warehouse for ${username}.`);
    }
    const availableByItem = new Map();
    for (const row of inventoryRows) {
      if (row.AvailableStock === null || row.AvailableStock === undefined) {
        throw new Error(`Inventory AvailableStock is null for ${username}.`);
      }
      const available = Number(row.AvailableStock);
      const physical = Number(row.PhysicalStock);
      if (row.StockDataStatus === 'PHYSICAL_AS_SELLABLE_TEMPORARY' && (available <= 0 || available !== physical)) {
        throw new Error(`Sellable inventory formula failed for ${username}.`);
      }
      if (['EXPIRED_NOT_SELLABLE', 'STOCK_RECONCILIATION_REQUIRED'].includes(row.StockDataStatus) && available !== 0) {
        throw new Error(`Non-sellable lot exposed stock for ${username}.`);
      }
      availableByItem.set(String(row.ItemID), (availableByItem.get(String(row.ItemID)) || 0) + available);
    }

    const customerId = await scopedCustomer(transaction, username);
    if (!customerId) throw new Error(`No scoped customer fixture found for ${username}.`);
    const upsell = await new sql.Request(transaction)
      .input('Username', sql.VarChar(50), username)
      .input('CustomerID', sql.NVarChar(100), customerId)
      .query('EXEC dbo.API_UpsellGoiY_AI @Username=@Username, @MaKhachHang=@CustomerID, @TopN=10;');
    const upsellRows = businessRows(upsell).filter((row) => row.ItemID !== 'N/A');
    if (!upsellRows.length) throw new Error(`No sellable upsell fixture found for ${username}.`);
    if (upsellRows.some((row) => Number(row.AvailableStock) <= 0 || row.StockDataStatus !== 'PHYSICAL_AS_SELLABLE_TEMPORARY')) {
      throw new Error(`Upsell returned a non-sellable item for ${username}.`);
    }
    if (upsellRows.some((row) => Number(row.AvailableStock) !== Number(availableByItem.get(String(row.ItemID)) || 0))) {
      throw new Error(`Upsell stock does not match scoped inventory for ${username}.`);
    }

    let promotionRows = [];
    if (isManager) {
      const promotion = await new sql.Request(transaction)
        .input('Username', sql.VarChar(50), username)
        .query('EXEC dbo.API_DeXuatKhuyenMai_AI @Username=@Username;');
      promotionRows = businessRows(promotion);
      if (promotionRows.some((row) => row.AvailableStock === null || row.AvailableStock === undefined)) {
        throw new Error(`Promotion AvailableStock is null for ${username}.`);
      }
    }

    await transaction.rollback();
    return {
      username,
      inventoryRows: inventoryRows.length,
      sellableInventoryRows: inventoryRows.filter((row) => Number(row.AvailableStock) > 0).length,
      allowedWarehouseCount: allowedStores.size,
      returnedWarehouseCount: new Set(inventoryRows.map((row) => String(row.StoreHouseID))).size,
      upsellRows: upsellRows.length,
      promotionRows: promotionRows.length,
      status: 'PASS',
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function main() {
  if (!/medtest/i.test(config.database)) throw new Error(`Refusing deployment outside medtest: ${config.database}`);
  const sources = procedures.map(([name, relative]) => {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    for (const marker of ['AvailableStock', 'PHYSICAL_AS_SELLABLE_TEMPORARY']) {
      if (!source.includes(marker)) throw new Error(`${name} source missing marker: ${marker}`);
    }
    return { name, relative, source, batch: procedureBatch(source, name) };
  });
  if (/FROM\s+IV_StockTbl/i.test(sources.find((item) => item.name.endsWith('API_UpsellGoiY_AI')).source)) {
    throw new Error('Upsell must not use unscoped IV_StockTbl.');
  }

  const backupDir = path.join(root, 'reports', 'runtime-backups', `sellable-stock-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const pool = await sql.connect(config);
  const deploy = new sql.Transaction(pool);
  let started = false;
  try {
    const before = [];
    for (const item of sources) {
      const result = await pool.request()
        .input('ObjectName', sql.NVarChar, item.name)
        .query('SELECT OBJECT_DEFINITION(OBJECT_ID(@ObjectName)) AS definition;');
      const definition = result.recordset[0]?.definition || '';
      before.push({ name: item.name, sha256: sha256(definition), definition });
    }
    fs.writeFileSync(path.join(backupDir, 'before.json'), JSON.stringify({ capturedAt: new Date().toISOString(), database: config.database, procedures: before }, null, 2), 'utf8');

    await deploy.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
    started = true;
    for (const item of sources) await new sql.Request(deploy).batch(item.batch);
    for (const item of sources) {
      const result = await new sql.Request(deploy)
        .input('ObjectName', sql.NVarChar, item.name)
        .query('SELECT OBJECT_DEFINITION(OBJECT_ID(@ObjectName)) AS definition;');
      const definition = result.recordset[0]?.definition || '';
      if (!definition.includes('PHYSICAL_AS_SELLABLE_TEMPORARY')) throw new Error(`Deployed ${item.name} is missing the sellable marker.`);
    }
    await deploy.commit();
    started = false;

    const smoke = [];
    smoke.push(await smokeUser(pool, testUsers[0], true));
    smoke.push(await smokeUser(pool, testUsers[1], false));
    const result = {
      status: 'MEDTEST_SELLABLE_STOCK_PASS',
      deployedAt: new Date().toISOString(),
      database: config.database,
      backupDir: path.relative(root, backupDir).replace(/\\/g, '/'),
      procedures: sources.map((item) => item.name),
      smoke,
      limitation: 'ERP reservation/blocked-stock behavior is still awaiting owner confirmation.',
    };
    fs.writeFileSync(path.join(root, 'reports', 'business-rule-v1', 'sellable-stock-runtime.json'), JSON.stringify(result, null, 2), 'utf8');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (started) await deploy.rollback();
    throw error;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
