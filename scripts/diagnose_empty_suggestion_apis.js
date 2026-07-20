'use strict';

const assert = require('node:assert');
const sql = require('mssql');
const path = require('node:path');
const { testDbConfig } = require('./lib/test-db-config');

const root = path.resolve(__dirname, '..');

async function query(pool, text, inputs = {}) {
  const request = pool.request();
  for (const [name, value] of Object.entries(inputs)) {
    request.input(name, sql.NVarChar(100), value);
  }
  return request.query(text);
}

async function main() {
  const config = testDbConfig(root);
  assert(/medtest/i.test(config.database), `Refusing diagnostics outside medtest: ${config.database}`);
  const pool = await sql.connect(config);
  try {
    const metadata = await query(pool, `
      SELECT d.ApiCode, d.StoredProcedure, f.FieldCode, f.FieldName,
             f.IsRequired, f.IsSystemParam, f.DataSourceType, f.DataSourceValue
      FROM dbo.API_Definition d
      LEFT JOIN dbo.API_Field f ON f.ApiID = d.ApiID
      WHERE d.ApiCode IN ('@goi_ydon_hang', '@goi_ydon_thuoc')
      ORDER BY d.ApiCode, f.FieldCode;
    `);

    const customer = await query(pool, `
      SELECT ObjectID, ObjectName, BranchID, isCustomer, isDisable
      FROM dbo.CF_ObjectTbl
      WHERE ObjectID = @CustomerID;

      SELECT StatusID, COUNT(*) AS InvoiceCount,
             MIN(DocumentDate) AS FirstInvoiceDate,
             MAX(DocumentDate) AS LastInvoiceDate
      FROM dbo.AR_InvoiceTbl
      WHERE ObjectID = @CustomerID
      GROUP BY StatusID
      ORDER BY StatusID;

      SELECT COUNT(DISTINCT i.DocumentID) AS EligibleInvoiceCount,
             COUNT(*) AS EligibleLineCount,
             MIN(i.DocumentDate) AS FirstEligibleDate,
             MAX(i.DocumentDate) AS LastEligibleDate
      FROM dbo.AR_InvoiceTbl i
      JOIN dbo.AR_InvoiceDetailTbl d ON d.DocumentID = i.DocumentID
      JOIN dbo.CF_ItemTbl p ON p.ItemID = d.ItemID
      WHERE i.ObjectID = @CustomerID
        AND i.StatusID IN (3, 6, 7, 8)
        AND ISNULL(p.isDisable, 0) = 0
        AND ISNULL(p.ItemGroupID, '') = 'HH1';
    `, { CustomerID: 'HPA011' });

    const scopes = [];
    for (const username of ['QLBH013.MED', 'NAMDINHB.MED']) {
      const result = await query(pool, `
        SELECT @Username AS Username,
               CASE WHEN EXISTS (
                 SELECT 1 FROM dbo.AR_GetObjectByUserFnc(@Username)
                 WHERE ObjectID = @CustomerID
               ) THEN 1 ELSE 0 END AS CustomerInScope;

        EXEC dbo.API_GoiYDonHang_AI @Username=@Username, @MaKhachHang=@CustomerID;
      `, { Username: username, CustomerID: 'HPA011' });
      scopes.push({
        username,
        scope: result.recordsets[0] || [],
        recommendationCount: (result.recordsets[1] || []).length,
        recommendationSample: (result.recordsets[1] || []).slice(0, 3),
      });
    }

    const productSample = await query(pool, `
      SELECT TOP 5 ItemID, ItemName, Unit, TuKhoa
      FROM dbo.CF_ItemTbl
      WHERE ISNULL(isDisable, 0) = 0
        AND ISNULL(ItemGroupID, '') = 'HH1'
        AND NULLIF(LTRIM(RTRIM(ItemName)), '') IS NOT NULL
      ORDER BY ItemID;
    `);

    const summary = {
      database: config.database,
      metadata: metadata.recordset,
      customer: customer.recordsets[0] || [],
      invoiceStatus: customer.recordsets[1] || [],
      eligibleHistory: customer.recordsets[2] || [],
      scopes,
      productSample: productSample.recordset,
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
