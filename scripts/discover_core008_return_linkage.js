'use strict';

/* CORE-008 read-only discovery: determine how ERP return lines reference sales invoices. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');

function readEnv() {
  const values = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

async function main() {
  const env = { ...readEnv(), ...process.env };
  if (String(env.TEST_DB_DATABASE || '').toLowerCase() !== 'medtest') {
    throw new Error('Discovery chi duoc chay tren medtest.');
  }

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

  try {
    const result = await pool.request().query(`
IF OBJECT_ID('tempdb..#Core008ReturnEvidence') IS NOT NULL DROP TABLE #Core008ReturnEvidence;

SELECT
    R.DocumentID AS ReturnDocumentID,
    R.DocumentDate AS ReturnDate,
    NULLIF(LTRIM(RTRIM(R.LinkID)), '') AS HeaderLinkID,
    D.ItemID,
    COALESCE(D.Quantity, 0) AS ReturnQuantity,
    NULLIF(LTRIM(RTRIM(D.RefDoc)), '') AS RefDoc,
    NULLIF(LTRIM(RTRIM(D.SoPhieuBan)), '') AS SoPhieuBan,
    CONVERT(BIT, CASE WHEN EXISTS (SELECT 1 FROM dbo.AR_InvoiceTbl I WITH (NOLOCK) WHERE I.DocumentID = NULLIF(LTRIM(RTRIM(R.LinkID)), '')) THEN 1 ELSE 0 END) AS HeaderLinkMatchesDocumentID,
    CONVERT(BIT, CASE WHEN EXISTS (SELECT 1 FROM dbo.AR_InvoiceTbl I WITH (NOLOCK) WHERE I.DocumentID = NULLIF(LTRIM(RTRIM(D.RefDoc)), '')) THEN 1 ELSE 0 END) AS RefDocMatchesDocumentID,
    CONVERT(BIT, CASE WHEN EXISTS (SELECT 1 FROM dbo.AR_InvoiceTbl I WITH (NOLOCK) WHERE I.DocumentID = NULLIF(LTRIM(RTRIM(D.SoPhieuBan)), '')) THEN 1 ELSE 0 END) AS SaleSlipMatchesDocumentID,
    CONVERT(BIT, CASE WHEN EXISTS (SELECT 1 FROM dbo.AR_InvoiceTbl I WITH (NOLOCK) WHERE I.InvoiceNo = NULLIF(LTRIM(RTRIM(D.SoPhieuBan)), '')) THEN 1 ELSE 0 END) AS SaleSlipMatchesInvoiceNo
INTO #Core008ReturnEvidence
FROM dbo.AR_ReturnTbl R WITH (NOLOCK)
JOIN dbo.AR_ReturnDetailTbl D WITH (NOLOCK) ON D.DocumentID = R.DocumentID
WHERE R.Status = 1
  AND COALESCE(R.KhongTruDSWeb, 0) = 0;

SELECT
    COUNT_BIG(*) AS ActiveReturnLineCount,
    SUM(CASE WHEN HeaderLinkID IS NOT NULL THEN 1 ELSE 0 END) AS HeaderLinkPopulatedCount,
    SUM(CASE WHEN RefDoc IS NOT NULL THEN 1 ELSE 0 END) AS RefDocPopulatedCount,
    SUM(CASE WHEN SoPhieuBan IS NOT NULL THEN 1 ELSE 0 END) AS SaleSlipPopulatedCount,
    SUM(CONVERT(INT, HeaderLinkMatchesDocumentID)) AS HeaderLinkMatchCount,
    SUM(CONVERT(INT, RefDocMatchesDocumentID)) AS RefDocMatchCount,
    SUM(CONVERT(INT, SaleSlipMatchesDocumentID)) AS SaleSlipDocumentMatchCount,
    SUM(CONVERT(INT, SaleSlipMatchesInvoiceNo)) AS SaleSlipInvoiceNoMatchCount,
    SUM(CASE WHEN CONVERT(INT, HeaderLinkMatchesDocumentID) + CONVERT(INT, RefDocMatchesDocumentID) + CONVERT(INT, SaleSlipMatchesDocumentID) + CONVERT(INT, SaleSlipMatchesInvoiceNo) > 0 THEN 1 ELSE 0 END) AS AnyInvoiceMatchCount,
    SUM(CASE WHEN ReturnQuantity > 0 THEN 1 ELSE 0 END) AS PositiveQuantityCount,
    SUM(CASE WHEN ReturnQuantity = 0 THEN 1 ELSE 0 END) AS ZeroQuantityCount,
    SUM(CASE WHEN ReturnQuantity < 0 THEN 1 ELSE 0 END) AS NegativeQuantityCount
FROM #Core008ReturnEvidence;

SELECT TOP (20)
    ReturnDocumentID,
    CONVERT(VARCHAR(10), ReturnDate, 23) AS ReturnDate,
    ItemID,
    ReturnQuantity,
    HeaderLinkID,
    RefDoc,
    SoPhieuBan,
    HeaderLinkMatchesDocumentID,
    RefDocMatchesDocumentID,
    SaleSlipMatchesDocumentID,
    SaleSlipMatchesInvoiceNo
FROM #Core008ReturnEvidence
WHERE HeaderLinkID IS NOT NULL OR RefDoc IS NOT NULL OR SoPhieuBan IS NOT NULL
ORDER BY ReturnDate DESC, ReturnDocumentID, ItemID;

SELECT R.Status, COALESCE(R.KhongTruDSWeb, 0) AS KhongTruDSWeb, COUNT_BIG(*) AS ReturnCount
FROM dbo.AR_ReturnTbl R WITH (NOLOCK)
GROUP BY R.Status, COALESCE(R.KhongTruDSWeb, 0)
ORDER BY R.Status, KhongTruDSWeb;

DROP TABLE #Core008ReturnEvidence;
`);

    console.log(JSON.stringify({
      task: 'CORE-008_RETURN_LINKAGE_DISCOVERY',
      mode: 'READ_ONLY',
      database: env.TEST_DB_DATABASE,
      summary: result.recordsets[0]?.[0] || {},
      linkedSamples: result.recordsets[1] || [],
      returnStatusDistribution: result.recordsets[2] || [],
    }, null, 2));
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'CORE-008_RETURN_LINKAGE_DISCOVERY', status: 'ERROR', message: error.message }, null, 2));
  process.exitCode = 1;
});
