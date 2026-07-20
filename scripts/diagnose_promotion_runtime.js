'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const sql = require('mssql');
const { testDbConfig } = require('./lib/test-db-config');

const root = path.resolve(__dirname, '..');
const config = testDbConfig(root);

async function main() {
  assert(/medtest/i.test(config.database), `Refusing diagnostics outside medtest: ${config.database}`);
  const pool = await sql.connect(config);
  try {
    const base = await pool.request().query(`
      SELECT
        COUNT(*) AS StockRows,
        COUNT(DISTINCT I.ItemID) AS DistinctItems,
        SUM(CASE WHEN I.QuantityinStock > 0 THEN 1 ELSE 0 END) AS PositiveStockRows,
        COUNT(DISTINCT CASE WHEN I.QuantityinStock > 0 THEN I.ItemID END) AS PositiveStockItems,
        COUNT(DISTINCT CASE WHEN I.QuantityinStock > 0 AND ISNULL(CF.ItemGroupID, '') = 'HH1' THEN I.ItemID END) AS EligibleHH1Items
      FROM dbo.IV_StockTbl I
      LEFT JOIN dbo.CF_ItemTbl CF ON CF.ItemID = I.ItemID;

      SELECT c.name AS ColumnName
      FROM sys.columns c
      WHERE c.object_id = OBJECT_ID('dbo.IV_StockTbl')
      ORDER BY c.column_id;

      SELECT
        OBJECT_NAME(c.object_id) AS TableName,
        c.name AS ColumnName,
        TYPE_NAME(c.user_type_id) AS DataType
      FROM sys.columns c
      WHERE c.object_id IN (
        OBJECT_ID('dbo.AR_PromotionTbl'),
        OBJECT_ID('dbo.AR_SanPhamTrongTamTbl'),
        OBJECT_ID('dbo.AR_AI_DiscountConfigTbl')
      )
      ORDER BY OBJECT_NAME(c.object_id), c.column_id;

      SELECT
        COUNT(*) AS ProgramRows,
        SUM(CASE WHEN GETDATE() BETWEEN FromDate AND ToDate THEN 1 ELSE 0 END) AS ActiveByDateRows,
        SUM(CASE WHEN GETDATE() BETWEEN FromDate AND ToDate AND ISNULL(isDisable, 0) = 0 THEN 1 ELSE 0 END) AS ActiveNotDisabledRows
      FROM dbo.AR_PromotionTbl;
    `);

    const results = [];
    for (const username of ['QLBH013.MED', 'NAMDINHB.MED']) {
      const identity = await pool.request()
        .input('username', sql.VarChar(50), username)
        .query(`
          SELECT UserGroupID, ISNULL(Manager, 0) AS IsManager, BranchID
          FROM dbo.SY_User
          WHERE UserName = @username AND ISNULL(Disable, 0) = 0;
        `);
      const runtime = await pool.request()
        .input('username', sql.VarChar(50), username)
        .query('EXEC dbo.API_DeXuatKhuyenMai_AI @Username=@username;');
      const rows = (runtime.recordsets || []).flat().filter(row => row && row.ItemID);
      const byType = {};
      for (const row of rows) {
        const type = String(row.LoaiDeXuat || 'UNKNOWN');
        byType[type] = (byType[type] || 0) + 1;
      }
      results.push({
        username,
        identity: identity.recordset?.[0] || null,
        rowCount: rows.length,
        proposalTypes: byType,
        actionStatuses: [...new Set(rows.map(row => row.ActionStatus).filter(Boolean))],
        ruleVersions: [...new Set(rows.map(row => row.RuleVersion).filter(Boolean))],
      });
    }

    console.log(JSON.stringify({
      database: config.database,
      mode: 'READ_ONLY',
      stockSummary: base.recordsets[0]?.[0] || {},
      stockColumns: (base.recordsets[1] || []).map(row => row.ColumnName),
      programColumns: base.recordsets[2] || [],
      programSummary: base.recordsets[3]?.[0] || {},
      results,
    }, null, 2));
  } finally {
    await pool.close();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
