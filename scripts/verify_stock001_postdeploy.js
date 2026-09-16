'use strict';

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const fixtures = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'config', 'uat', 'account-fixtures.v1.json'), 'utf8',
)).accounts;

function readEnv() {
  const values = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function first(row, keys) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return row[key];
  }
  return null;
}

function dataRows(recordset) {
  return (recordset || []).filter((row) => row.Msg === undefined && row.Message === undefined);
}

function stockErrors(rows, allowedStores, expectedItem) {
  const errors = [];
  if (!rows.length) return ['NO_RESULT'];
  for (const row of rows) {
    const item = String(first(row, ['ItemID', 'Mã sp', 'MaSanPham', 'Mã SP']) || '').toUpperCase();
    const warehouse = String(first(row, ['StoreHouseID']) || '').toUpperCase();
    const available = Number(first(row, ['AvailableStock', 'QuantityinStock', 'TonKho']));
    const physical = Number(first(row, ['PhysicalStock']));
    const reserved = Number(first(row, ['ReservedStock']));
    const status = String(first(row, ['StockDataStatus']) || '');
    if (expectedItem && item !== expectedItem.toUpperCase()) errors.push('WRONG_ITEM');
    if (!warehouse || !allowedStores.has(warehouse)) errors.push('WAREHOUSE_OUT_OF_SCOPE');
    if (!Number.isFinite(available) || available <= 0) errors.push('AVAILABLE_NOT_POSITIVE');
    if (!Number.isFinite(physical) || !Number.isFinite(reserved)) errors.push('STOCK_COMPONENT_MISSING');
    if (status !== 'AVAILABLE_FOR_SALE') errors.push('INVALID_STOCK_STATUS');
    if (!first(row, ['StockUpdatedAt', 'StockAsOfAt'])) errors.push('STOCK_TIMESTAMP_MISSING');
    if (!first(row, ['WarehouseScope'])) errors.push('WAREHOUSE_SCOPE_MISSING');
    if (!first(row, ['StockRuleVersion', 'RuleVersion'])) errors.push('STOCK_RULE_VERSION_MISSING');
  }
  return [...new Set(errors)];
}

async function execute(pool, procedure, inputs) {
  const request = pool.request();
  for (const input of inputs) request.input(input.name, input.type, input.value);
  return (await request.execute(procedure)).recordset || [];
}

async function main() {
  const env = readEnv();
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 120000,
    pool: { max: 2, min: 0, idleTimeoutMillis: 10000 },
  });

  const accounts = [];
  try {
    for (const [username, fixture] of Object.entries(fixtures)) {
      const result = { UserName: username, RoleName: fixture.role, CustomerID: fixture.customerId, Errors: [] };
      try {
        const allowed = (await pool.request()
          .input('Username', sql.VarChar(50), username)
          .query(`DECLARE @AsOfUtc DATETIME2(0)=SYSUTCDATETIME();
                  SELECT * FROM dbo.AI_WarehouseByUserFnc(@Username,@AsOfUtc);`)).recordset || [];
        const allowedStores = new Set(allowed.map((row) => String(row.StoreHouseID).toUpperCase()));
        if (!allowedStores.size) result.Errors.push('WAREHOUSE_SCOPE_EMPTY');

        const candidate = (await pool.request()
          .input('Username', sql.VarChar(50), username)
          .query(`DECLARE @AsOfUtc DATETIME2(0)=SYSUTCDATETIME();
                  SELECT TOP (1) S.*, I.ItemName
                  FROM dbo.AI_StockAvailableByUserFnc(@Username,'',@AsOfUtc) S
                  JOIN dbo.CF_ItemTbl I ON I.ItemID=S.ItemID
                  WHERE S.AvailableStock>0
                    AND S.StockDataStatus='AVAILABLE_FOR_SALE'
                    AND EXISTS (
                      SELECT 1 FROM dbo.AR_PriceDetailTbl D
                      JOIN dbo.AR_PriceTbl H ON H.DocumentID=D.DocumentID
                      WHERE D.ItemID=S.ItemID AND COALESCE(H.isDisable,0)=0 AND D.UnitPrice>0
                    )
                  ORDER BY S.ReservedStock DESC, S.AvailableStock DESC, S.ItemID;`)).recordset?.[0];
        if (!candidate) {
          result.Errors.push('NO_SELLABLE_CANDIDATE');
          accounts.push({ ...result, Status: 'FAIL' });
          continue;
        }

        const recomputed = (await pool.request()
          .input('ItemID', sql.VarChar(50), candidate.ItemID)
          .input('StoreHouseID', sql.VarChar(50), candidate.StoreHouseID)
          .input('RuleVersion', sql.VarChar(30), candidate.RuleVersion)
          .query(`DECLARE @AsOfUtc DATETIME2(0)=SYSUTCDATETIME();
                  ;WITH LotBalance AS (
                    SELECT COALESCE(T.Lot,'') Lot,T.ExpireDate,SUM(COALESCE(T.Quantity,0)) Quantity
                    FROM dbo.IV_StockTransactionTbl T
                    WHERE T.ItemID=@ItemID AND T.StoreHouseID=@StoreHouseID
                    GROUP BY COALESCE(T.Lot,''),T.ExpireDate
                  )
                  SELECT
                    (SELECT COALESCE(SUM(Quantity),0) FROM LotBalance) PhysicalStock,
                    (SELECT COALESCE(SUM(CASE WHEN Quantity>0 AND (ExpireDate IS NULL OR CAST(ExpireDate AS DATE)>=CAST(DATEADD(MINUTE,420,@AsOfUtc) AS DATE)) THEN Quantity ELSE 0 END),0) FROM LotBalance) NonExpiredPhysicalStock,
                    (SELECT COALESCE(SUM(COALESCE(D.Quantity,0)+COALESCE(D.SoLuongTang,0)),0)
                     FROM dbo.AR_OrderDetailTbl D JOIN dbo.AR_OrderTbl O ON O.DocumentID=D.DocumentID
                     WHERE D.ItemID=@ItemID AND D.StoreHouseID=@StoreHouseID
                       AND EXISTS (SELECT 1 FROM dbo.AI_BusinessRuleConfigTbl C CROSS APPLY STRING_SPLIT(C.ConfigValue,',') V
                                   WHERE C.RuleCode='BR-STOCK-001' AND C.RuleVersion=@RuleVersion
                                     AND C.ConfigKey='ReservedOrderStatusIDs'
                                     AND TRY_CONVERT(INT,LTRIM(RTRIM(V.value)))=O.StatusID)) ReservedStock;`)).recordset?.[0];
        const expectedAvailable = Math.max(Number(recomputed.NonExpiredPhysicalStock) - Number(recomputed.ReservedStock), 0);
        if (Number(candidate.PhysicalStock) !== Number(recomputed.PhysicalStock)) result.Errors.push('PHYSICAL_RECOMPUTE_MISMATCH');
        if (Number(candidate.ReservedStock) !== Number(recomputed.ReservedStock)) result.Errors.push('RESERVED_RECOMPUTE_MISMATCH');
        if (Number(candidate.AvailableStock) !== expectedAvailable) result.Errors.push('AVAILABLE_RECOMPUTE_MISMATCH');

        const productRows = dataRows(await execute(pool, 'dbo.API_TraCuuSanPham_AI', [
          { name: 'Username', type: sql.VarChar(50), value: username },
          { name: 'timkiem', type: sql.NVarChar(100), value: candidate.ItemID },
          { name: 'TopN', type: sql.Int, value: 10 },
        ]));
        result.Errors.push(...stockErrors(productRows, allowedStores, candidate.ItemID).map((e) => `PRODUCT_${e}`));

        const symptomRows = dataRows(await execute(pool, 'dbo.API_TimSanPhamTheoTrieuChung_AI', [
          { name: 'Username', type: sql.VarChar(50), value: username },
          { name: 'Keyword', type: sql.NVarChar(100), value: candidate.ItemID },
        ]));
        result.Errors.push(...stockErrors(symptomRows, allowedStores, candidate.ItemID).map((e) => `SYMPTOM_${e}`));

        const symptomAliasRows = dataRows(await execute(pool, 'dbo.API_TimSanPhamTheoTrieuChung_AI', [
          { name: 'Username', type: sql.VarChar(50), value: username },
          { name: 'timkiem', type: sql.NVarChar(100), value: candidate.ItemID },
        ]));
        result.Errors.push(...stockErrors(symptomAliasRows, allowedStores, candidate.ItemID).map((e) => `SYMPTOM_ALIAS_${e}`));

        const catalogRows = dataRows(await execute(pool, 'dbo.API_HangHoaList_AI', [
          { name: 'Username', type: sql.VarChar(50), value: username },
          { name: 'ObjectID', type: sql.VarChar(50), value: fixture.customerId },
          { name: 'ItemID', type: sql.VarChar(50), value: candidate.ItemID },
          { name: 'SearchText', type: sql.NVarChar(50), value: '' },
          { name: 'SeachText', type: sql.NVarChar(50), value: '' },
          { name: 'DocumentDate', type: sql.DateTime, value: null },
        ]));
        result.Errors.push(...stockErrors(catalogRows, allowedStores, candidate.ItemID).map((e) => `CATALOG_${e}`));

        Object.assign(result, {
          AllowedStores: [...allowedStores],
          CandidateItemID: candidate.ItemID,
          CandidateStoreHouseID: candidate.StoreHouseID,
          PhysicalStock: Number(candidate.PhysicalStock),
          ReservedStock: Number(candidate.ReservedStock),
          AvailableStock: Number(candidate.AvailableStock),
          ProductRows: productRows.length,
          SymptomRows: symptomRows.length,
          SymptomAliasRows: symptomAliasRows.length,
          CatalogRows: catalogRows.length,
        });
      } catch (error) {
        result.Errors.push(`RUNTIME:${error.message}`);
      }
      result.Errors = [...new Set(result.Errors)];
      result.Status = result.Errors.length ? 'FAIL' : 'PASS';
      accounts.push(result);
    }

    const guardUsername = 'QLBH005.MED';
    const guardItemID = 'Q002';
    const guardStock = (await pool.request()
      .input('Username', sql.VarChar(50), guardUsername)
      .input('ItemID', sql.VarChar(50), guardItemID)
      .query(`DECLARE @AsOfUtc DATETIME2(0)=SYSUTCDATETIME();
              SELECT * FROM dbo.AI_StockAvailableByUserFnc(@Username,@ItemID,@AsOfUtc);`)).recordset || [];
    const guardApiRows = dataRows(await execute(pool, 'dbo.API_TraCuuSanPham_AI', [
      { name: 'Username', type: sql.VarChar(50), value: guardUsername },
      { name: 'timkiem', type: sql.NVarChar(100), value: guardItemID },
      { name: 'TopN', type: sql.Int, value: 10 },
    ])).filter((row) => String(first(row, ['ItemID', 'Mã sp']) || '').toUpperCase() === guardItemID);
    const reservedOutGuard = {
      UserName: guardUsername,
      ItemID: guardItemID,
      StockRows: guardStock,
      ApiRecommendationCount: guardApiRows.length,
      Pass: guardStock.some((row) => row.PhysicalStock > 0 && row.AvailableStock === 0 && row.StockDataStatus === 'RESERVED_OUT')
        && guardApiRows.length === 0,
    };

    const root = fs.readFileSync(path.join(ROOT, 'sql', 'Migrate_STOCK001_Stock_Availability_AI.sql'), 'utf8');
    const main = fs.readFileSync(path.join(ROOT, 'n8n', 'AI_Core', 'MAIN_ChatBot_V5.json'), 'utf8');
    const executeWorkflow = fs.readFileSync(path.join(ROOT, 'n8n', 'API_Services', 'API_Execute.json'), 'utf8');
    const frontend = fs.readFileSync(path.join(ROOT, 'chatbot-widget', 'js', 'chatbot.js'), 'utf8');
    const staticChecks = [
      { Check: 'SQL_SHARED_FUNCTION', Pass: root.includes('AI_StockAvailableByUserFnc') && root.includes('ReservedOrderStatusIDs') },
      { Check: 'N8N_NO_NULL_OVERRIDE', Pass: !executeWorkflow.includes('PhysicalStock: null') && !executeWorkflow.includes('AvailableStock: null') },
      { Check: 'N8N_DIRECT_ROUTE_SQL_STOCK', Pass: main.includes('AI_StockAvailableByUserFnc') && !main.includes('PHYSICAL_STOCK_NOT_QUERIED') },
      { Check: 'FRONTEND_STOCK_FIELDS', Pass: frontend.includes("'reservedstock': 'Đã giữ cho đơn mở'") && frontend.includes("'stockasofat': 'Tồn được tính tại'") },
      { Check: 'FRONTEND_STOCK_STATUS', Pass: frontend.includes("'AVAILABLE_FOR_SALE': 'Còn hàng có thể bán'") && frontend.includes("'RESERVED_OUT': 'Đã được giữ hết cho đơn đang mở'") },
    ];
    const failures = accounts.filter((row) => row.Status !== 'PASS');
    const summary = {
      task: 'STOCK-001',
      mode: 'READ_ONLY_POSTDEPLOY_13_ACCOUNT_GATE',
      database: env.TEST_DB_DATABASE,
      status: failures.length || staticChecks.some((row) => !row.Pass) || !reservedOutGuard.Pass ? 'FAIL' : 'PASS',
      accountsChecked: accounts.length,
      accountsPassed: accounts.length - failures.length,
      staticChecks,
      reservedOutGuard,
      failures,
      accounts,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (summary.status !== 'PASS') process.exitCode = 1;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'STOCK-001', status: 'ERROR', message: error.message }, null, 2));
  process.exitCode = 1;
});
