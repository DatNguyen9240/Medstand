'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const sql = require('mssql');
const { testDbConfig } = require('./lib/test-db-config');

const root = path.resolve(__dirname, '..');
const apply = process.argv.includes('--apply');
const batchPrefix = 'U13S1_';
const marker = '[UAT13-SUG-V1]';
const createdBy = 'AI_UAT13_FIXTURE';

async function main() {
  const config = testDbConfig(root);
  assert(/medtest/i.test(config.database), `Refusing fixture rollback outside medtest: ${config.database}`);
  const pool = await sql.connect(config);
  try {
    const before = await pool.request()
      .input('Prefix', sql.VarChar(30), `${batchPrefix}%`)
      .query(`
        SELECT DocumentID, UserCreate, Memo FROM dbo.AR_InvoiceTbl WHERE DocumentID LIKE @Prefix ORDER BY DocumentID;
        SELECT COUNT(*) AS DetailCount FROM dbo.AR_InvoiceDetailTbl WHERE DocumentID LIKE @Prefix;
        SELECT COUNT(*) AS JournalCount FROM dbo.GJ_TransactionTbl WHERE DocumentID LIKE @Prefix;
        SELECT COUNT(*) AS StockTransactionCount FROM dbo.IV_StockTransactionTbl WHERE DocumentID LIKE @Prefix;
      `);
    const headers = before.recordsets[0];
    assert(headers.every((row) => row.UserCreate === createdBy && String(row.Memo || '').startsWith(marker)),
      'Batch prefix contains non-fixture rows; refusing rollback.');
    const preview = {
      status: apply ? 'ROLLBACK_READY' : 'ROLLBACK_DRY_RUN_PASS', database: config.database,
      batchPrefix, headerCount: headers.length,
      detailCount: Number(before.recordsets[1][0].DetailCount),
      journalCount: Number(before.recordsets[2][0].JournalCount),
      stockTransactionCount: Number(before.recordsets[3][0].StockTransactionCount),
    };
    if (!apply) {
      process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`);
      return;
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const request = new sql.Request(transaction)
        .input('Prefix', sql.VarChar(30), `${batchPrefix}%`)
        .input('UserCreate', sql.VarChar(50), createdBy)
        .input('Marker', sql.NVarChar(200), marker);
      await request.query(`
        DELETE D
        FROM dbo.AR_InvoiceDetailTbl D
        JOIN dbo.AR_InvoiceTbl I ON I.DocumentID = D.DocumentID
        WHERE I.DocumentID LIKE @Prefix AND I.UserCreate = @UserCreate AND LEFT(I.Memo, LEN(@Marker)) = @Marker;

        DELETE FROM dbo.GJ_TransactionTbl WHERE DocumentID LIKE @Prefix;
        DELETE FROM dbo.IV_StockTransactionTbl WHERE DocumentID LIKE @Prefix;

        DELETE FROM dbo.AR_InvoiceTbl
        WHERE DocumentID LIKE @Prefix AND UserCreate = @UserCreate AND LEFT(Memo, LEN(@Marker)) = @Marker;

        IF EXISTS (SELECT 1 FROM dbo.AR_InvoiceTbl WHERE DocumentID LIKE @Prefix)
           OR EXISTS (SELECT 1 FROM dbo.AR_InvoiceDetailTbl WHERE DocumentID LIKE @Prefix)
           OR EXISTS (SELECT 1 FROM dbo.GJ_TransactionTbl WHERE DocumentID LIKE @Prefix)
           OR EXISTS (SELECT 1 FROM dbo.IV_StockTransactionTbl WHERE DocumentID LIKE @Prefix)
          THROW 51390, N'UAT13 fixture rollback verification failed.', 1;
      `);
      await transaction.commit();

      const result = { ...preview, status: 'MEDTEST_UAT13_SUGGESTION_FIXTURE_ROLLBACK_PASS', rolledBackAt: new Date().toISOString() };
      const reportPath = path.join(root, 'reports', 'business-rule-v1', 'uat13-suggestion-fixture-rollback.json');
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
